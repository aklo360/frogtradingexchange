import { NextResponse } from "next/server";
import WebSocket from "ws";
import { decode, encode } from "msgpackr";
import bs58 from "bs58";
import { serviceConfig } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TITAN_PROTOCOLS = ["v1.api.titan.ag+msgpack", "v1.api.titan.ag"];
const REQUEST_TIMEOUT_MS = 7000;
const DEFAULT_UPDATE_INTERVAL_MS = 1_000;
const DEFAULT_NUM_QUOTES = 3;

const REGION_PLACEHOLDERS = ["{region}", "{{region}}", "<region>", "%region%", "{REGION}"];

type QuoteRequest = {
  inMint: string;
  outMint: string;
  amountIn: string;
  slippageBps: number;
  priorityFee: number;
  userPublicKey?: string;
};

type TitanSwapRoute = {
  inAmount: number | bigint;
  outAmount: number | bigint;
  slippageBps?: number;
  steps?: Array<{ label?: string }>;
};

type TitanSwapQuotes = {
  id: string;
  quotes: Record<string, TitanSwapRoute> | Map<string, TitanSwapRoute>;
};

const toBigInt = (value: number | bigint | undefined): bigint => {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  return BigInt(0);
};

const bigIntToString = (value: number | bigint | undefined): string =>
  toBigInt(value).toString();

const toBuffer = (value: string) => Buffer.from(bs58.decode(value));

const ensureWsUrl = (template: string, region?: string) => {
  let url = template;
  if (region) {
    for (const placeholder of REGION_PLACEHOLDERS) {
      if (url.includes(placeholder)) {
        url = url.replaceAll(placeholder, region);
      }
    }
  }

  if (!/^wss?:\/\//i.test(url)) {
    url = `wss://${url}`;
  }

  const parsed = new URL(url);
  if (parsed.pathname === "/" || parsed.pathname === "") {
    parsed.pathname = "/api/v1/ws";
  }

  if (!parsed.searchParams.has("auth") && serviceConfig.titanToken) {
    parsed.searchParams.set("auth", serviceConfig.titanToken);
  }

  return parsed.toString();
};

const buildCandidateUrls = () => {
  const base = serviceConfig.titanWsUrl;
  const hasPlaceholder = REGION_PLACEHOLDERS.some((placeholder) =>
    base.includes(placeholder),
  );

  if (hasPlaceholder && serviceConfig.preferredRegions.length > 0) {
    return serviceConfig.preferredRegions.map((region) =>
      ensureWsUrl(base, region),
    );
  }

  return [ensureWsUrl(base)];
};

const isMap = <K, V>(value: unknown): value is Map<K, V> =>
  value instanceof Map;

const pickBestRoute = (quotes: TitanSwapQuotes["quotes"]) => {
  const entries = isMap<string, TitanSwapRoute>(quotes)
    ? Array.from(quotes.entries())
    : Object.entries(quotes ?? {});

  if (!entries.length) {
    throw new Error("NO_QUOTES_AVAILABLE");
  }

  const sorted = entries.sort((a, b) => {
    const diff = toBigInt(b[1]?.outAmount) - toBigInt(a[1]?.outAmount);
    if (diff === 0n) return 0;
    return diff > 0n ? 1 : -1;
  });
  return sorted[0];
};

const transformQuotes = (
  swapQuotes: TitanSwapQuotes,
  payload: QuoteRequest,
) => {
  const [providerId, bestRoute] = pickBestRoute(swapQuotes.quotes);
  const routers = (bestRoute.steps ?? [])
    .map((step) => step.label)
    .filter((label): label is string => Boolean(label));

  return {
    status: "executable",
    updatedAt: new Date().toISOString(),
    inMint: payload.inMint,
    outMint: payload.outMint,
    amountIn: payload.amountIn,
    amountOut: bigIntToString(bestRoute.outAmount),
    priceImpactBps: bestRoute.slippageBps ?? 0,
    routers: routers.length > 0 ? routers : [providerId],
    provider: providerId,
    routeId: swapQuotes.id,
    executable: true,
    simulated: true,
  };
};

const requestTitanQuotes = (
  wsUrl: string,
  payload: QuoteRequest,
  userPublicKey: string,
) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, TITAN_PROTOCOLS, {
      perMessageDeflate: false,
      headers: {
        Authentication: `Bearer ${serviceConfig.titanToken}`,
        Authorization: `Bearer ${serviceConfig.titanToken}`,
      },
    });

    let requestId = 1;
    let streamId: number | null = null;
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.terminate();
        reject(new Error("TITAN_TIMEOUT"));
      }
    }, REQUEST_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeout);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        try {
          ws.close(1000);
        } catch (closeError) {
          console.warn("Failed to close Titan WebSocket", closeError);
        }
      }
    };

    const sendRequest = (data: Record<string, unknown>) => {
      const message = { id: requestId++, data };
      ws.send(encode(message));
    };

    ws.once("open", () => {
      const swapRequest = {
        swap: {
          inputMint: toBuffer(payload.inMint),
          outputMint: toBuffer(payload.outMint),
          amount: BigInt(payload.amountIn),
          swapMode: "ExactIn",
          slippageBps: payload.slippageBps,
        },
        transaction: {
          userPublicKey: toBuffer(userPublicKey),
        },
        update: {
          intervalMs: DEFAULT_UPDATE_INTERVAL_MS,
          numQuotes: DEFAULT_NUM_QUOTES,
        },
      };

      sendRequest({ NewSwapQuoteStream: swapRequest });
    });

    ws.on("message", (data: WebSocket.RawData) => {
      try {
        const decoded = decode(data as Buffer) as Record<string, unknown>;

        if (decoded.Response) {
          const response = decoded.Response as {
            stream?: { id: number };
            data: Record<string, unknown>;
          };
          if (response.stream) {
            streamId = response.stream.id;
          }
          return;
        }

        if (decoded.Error) {
          const error = decoded.Error as { message: string };
          throw new Error(error.message ?? "Titan error");
        }

        if (decoded.StreamData) {
          const streamData = decoded.StreamData as {
            id: number;
            payload: { SwapQuotes?: TitanSwapQuotes };
          };

          if (streamId !== null && streamData.id !== streamId) {
            return;
          }

          const swapQuotes = streamData.payload?.SwapQuotes;
          if (!swapQuotes) return;

          const normalized = transformQuotes(swapQuotes, payload);
          if (!settled) {
            settled = true;
            resolve(normalized);
            if (streamId !== null) {
              sendRequest({ StopStream: { id: streamId } });
            }
            cleanup();
          }
        }

        if (decoded.StreamEnd && !settled) {
          const streamEnd = decoded.StreamEnd as { errorMessage?: string };
          settled = true;
          cleanup();
          reject(new Error(streamEnd.errorMessage ?? "STREAM_ENDED"));
        }
      } catch (error) {
        if (!settled) {
          settled = true;
          cleanup();
          reject(error);
        }
      }
    });

    ws.once("unexpected-response", (_request, response) => {
      if (!settled) {
        const bodyChunks: Buffer[] = [];
        response
          .on("data", (chunk) => bodyChunks.push(chunk))
          .on("end", () => {
            const body = Buffer.concat(bodyChunks).toString("utf8");
            console.error(
              "Titan unexpected response",
              response.statusCode,
              response.statusMessage,
              body,
            );
            settled = true;
            cleanup();
            reject(
              new Error(
                `TITAN_WS_UNEXPECTED_RESPONSE:${response.statusCode ?? ""}`,
              ),
            );
          });
      }
    });

    ws.once("error", (error) => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(error);
      }
    });

    ws.once("close", (code, reason) => {
      if (!settled && reason) {
        console.error(
          `Titan WebSocket closed with code ${code}: ${reason.toString()}`,
        );
      }
      if (!settled) {
        settled = true;
        reject(new Error("TITAN_CONNECTION_CLOSED"));
      }
    });
  });

export async function POST(request: Request) {
  const payload = (await request.json()) as QuoteRequest;

  if (!payload?.userPublicKey) {
    return NextResponse.json(
      { error: "userPublicKey is required" },
      { status: 400 },
    );
  }

  if (!serviceConfig.titanToken) {
    return NextResponse.json(
      {
        status: "executable",
        updatedAt: new Date().toISOString(),
        inMint: payload.inMint,
        outMint: payload.outMint,
        amountIn: payload.amountIn,
        slippageBps: payload.slippageBps,
        amountOut: "0",
        priceImpactBps: 0,
        routers: ["Titan"],
        routeId: "mock",
        executable: true,
        simulated: true,
      },
      { status: 200 },
    );
  }

  const candidateUrls = buildCandidateUrls();
  let lastError: unknown;

  for (const wsUrl of candidateUrls) {
    try {
      const result = await requestTitanQuotes(wsUrl, payload, payload.userPublicKey);
      return NextResponse.json(result, { status: 200 });
    } catch (error) {
      console.error(`Titan quote attempt failed for ${wsUrl}`, error);
      lastError = error;
    }
  }

  return NextResponse.json(
    {
      error: "Quote stream unavailable",
      details: lastError instanceof Error ? lastError.message : String(lastError ?? "unknown"),
    },
    { status: 502 },
  );
}
