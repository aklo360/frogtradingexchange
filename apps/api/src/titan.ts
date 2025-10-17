import { decode, encode } from "msgpackr";
import bs58 from "bs58";
import type { TitanConfig } from "./env";

const TITAN_PROTOCOLS = ["v1.api.titan.ag+msgpack", "v1.api.titan.ag"];
const REQUEST_TIMEOUT_MS = 7_000;
const DEFAULT_UPDATE_INTERVAL_MS = 1_000;
const DEFAULT_NUM_QUOTES = 3;
const REGION_PLACEHOLDERS = [
  "{region}",
  "{{region}}",
  "<region>",
  "%region%",
  "{REGION}",
];

export type QuoteRequest = {
  inMint: string;
  outMint: string;
  amountIn: string;
  slippageBps: number;
  priorityFee: number;
  userPublicKey: string;
};

type TitanInstructionAccountPayload = {
  p: unknown;
  s?: boolean;
  w?: boolean;
};

type TitanInstructionPayload = {
  p: unknown;
  a?: TitanInstructionAccountPayload[];
  d?: unknown;
};

type TitanSwapRoute = {
  inAmount: number | bigint;
  outAmount: number | bigint;
  slippageBps?: number;
  steps?: Array<{ label?: string }>;
  transaction?: unknown;
  instructions?: TitanInstructionPayload[];
  addressLookupTables?: unknown;
  computeUnits?: number | bigint;
  computeUnitsSafe?: number | bigint;
};

type TitanSwapQuotes = {
  id: string;
  quotes: Record<string, TitanSwapRoute> | Map<string, TitanSwapRoute>;
};

export type QuoteResponse = {
  status: "executable";
  updatedAt: string;
  inMint: string;
  outMint: string;
  amountIn: string;
  amountOut: string;
  priceImpactBps: number;
  routers: string[];
  provider: string;
  routeId: string;
  transactionBase64?: string;
  inAmount: string;
  instructions: Array<{
    programId: string;
    accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
    data: string;
  }>;
  addressLookupTables: string[];
  computeUnits?: number;
  computeUnitsSafe?: number;
  executable: true;
  simulated: true;
};

const replaceRegionPlaceholder = (template: string, region?: string) => {
  if (!region) return template;
  let result = template;
  for (const placeholder of REGION_PLACEHOLDERS) {
    if (result.includes(placeholder)) {
      result = result.replaceAll(placeholder, region);
    }
  }
  return result;
};

const ensureProtocol = (value: string, defaultProtocol: "wss" | "https") => {
  if (/^[a-z]+:\/\//i.test(value)) return value;
  return `${defaultProtocol}://${value}`;
};

const ensureWsUrl = (
  template: string,
  region: string | undefined,
  token: string | undefined,
) => {
  const replaced = replaceRegionPlaceholder(template, region);
  const withProtocol = ensureProtocol(replaced, "wss");
  const parsed = new URL(withProtocol);

  if (replaced === template && region) {
    const hostnameParts = parsed.hostname.split(".").filter(Boolean);
    let resolvedHost: string | null = null;

    if (region.includes(".")) {
      resolvedHost = region;
    } else if (hostnameParts.length >= 1) {
      hostnameParts[0] = region;
      resolvedHost = hostnameParts.join(".");
    } else {
      resolvedHost = region;
    }

    if (resolvedHost) {
      parsed.hostname = resolvedHost;
    }
  }

  if (!parsed.pathname || parsed.pathname === "/") {
    parsed.pathname = "/api/v1/ws";
  }
  parsed.searchParams.delete("auth");
  if (token) {
    parsed.searchParams.set("auth", token);
  }
  return parsed.toString();
};

const ensureHttpBaseUrl = (template: string, region?: string) => {
  const replaced = replaceRegionPlaceholder(template, region);
  return ensureProtocol(replaced, "https");
};

export const joinUrl = (base: string, path: string) => {
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

const getCandidateWsUrls = (config: TitanConfig): string[] => {
  const base = config.wsUrl;
  const hasPlaceholder = REGION_PLACEHOLDERS.some((placeholder) =>
    base.includes(placeholder),
  );

  const candidates: string[] = [];
  const seen = new Set<string>();

  const addCandidate = (region: string | undefined) => {
    const url = ensureWsUrl(base, region, config.token);
    if (!seen.has(url)) {
      seen.add(url);
      candidates.push(url);
    }
  };

  if (config.preferredRegions.length > 0) {
    for (const region of config.preferredRegions) {
      addCandidate(region);
    }
  }

  if (!hasPlaceholder || config.preferredRegions.length === 0) {
    addCandidate(undefined);
  }

  return candidates;
};

const toBigInt = (value: number | bigint | undefined): bigint => {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  return BigInt(0);
};

const bigIntToString = (value: number | bigint | undefined): string =>
  toBigInt(value).toString();

const base58ToBytes = (value: string): Uint8Array => {
  try {
    return bs58.decode(value);
  } catch {
    throw new Error("INVALID_BASE58");
  }
};

const ensureUint8Array = (value: unknown): Uint8Array => {
  if (!value) {
    throw new Error("BUFFER_EMPTY");
  }

  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return new Uint8Array(
      view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength),
    );
  }
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return new Uint8Array();
    const binary = atob(normalized);
    const result = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      result[i] = binary.charCodeAt(i);
    }
    return result;
  }

  throw new Error("UNSUPPORTED_BUFFER_TYPE");
};

const bytesToBase58 = (value: Uint8Array): string => bs58.encode(value);

const toPubkeyString = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (!value) {
    throw new Error("EMPTY_PUBKEY");
  }
  if (value instanceof Uint8Array) {
    return bytesToBase58(value);
  }
  if (value instanceof ArrayBuffer) {
    return bytesToBase58(new Uint8Array(value));
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return bytesToBase58(
      new Uint8Array(
        view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength),
      ),
    );
  }
  if (Array.isArray(value)) {
    return bytesToBase58(Uint8Array.from(value as number[]));
  }
  throw new Error("UNSUPPORTED_PUBKEY_TYPE");
};

const bytesToBase64 = (value: Uint8Array | null): string | undefined => {
  if (!value || value.length === 0) return undefined;
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < value.length; i += chunkSize) {
    const chunk = value.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const normalizeInstructionAccount = (account: TitanInstructionAccountPayload) => ({
  pubkey: toPubkeyString(account?.p),
  isSigner: Boolean(account?.s),
  isWritable: Boolean(account?.w),
});

const normalizeInstruction = (instruction: TitanInstructionPayload) => ({
  programId: toPubkeyString(instruction?.p),
  accounts: Array.isArray(instruction?.a)
    ? instruction.a.map(normalizeInstructionAccount)
    : [],
  data: instruction?.d ? bytesToBase64(ensureUint8Array(instruction.d)) ?? "" : "",
});

const isMap = <K, V>(value: unknown): value is Map<K, V> =>
  value instanceof Map;

const toTransactionBytes = (value: unknown): Uint8Array | null => {
  if (!value) return null;
  try {
    return ensureUint8Array(value);
  } catch {
    return null;
  }
};

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

  for (const entry of sorted) {
    const [, route] = entry;
    if (toTransactionBytes(route.transaction)) {
      return entry;
    }
  }

  return sorted[0];
};

const transformQuotes = (
  swapQuotes: TitanSwapQuotes,
  payload: QuoteRequest,
): QuoteResponse => {
  const [providerId, bestRoute] = pickBestRoute(swapQuotes.quotes);
  const routers = (bestRoute.steps ?? [])
    .map((step) => step.label)
    .filter((label): label is string => Boolean(label));

  const computeUnits =
    bestRoute.computeUnits !== undefined && bestRoute.computeUnits !== null
      ? Number(toBigInt(bestRoute.computeUnits))
      : undefined;

  const computeUnitsSafe =
    bestRoute.computeUnitsSafe !== undefined && bestRoute.computeUnitsSafe !== null
      ? Number(toBigInt(bestRoute.computeUnitsSafe))
      : undefined;

  const transactionBytes = toTransactionBytes(bestRoute.transaction);

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
    transactionBase64: bytesToBase64(transactionBytes),
    inAmount: bigIntToString(bestRoute.inAmount),
    instructions: Array.isArray(bestRoute.instructions)
      ? bestRoute.instructions.map(normalizeInstruction)
      : [],
    addressLookupTables: Array.isArray(bestRoute.addressLookupTables)
      ? bestRoute.addressLookupTables.map((entry) => toPubkeyString(entry))
      : [],
    computeUnits,
    computeUnitsSafe,
    executable: true,
    simulated: true,
  };
};

const toUint8ArrayMessage = async (data: unknown): Promise<Uint8Array> => {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    const arrayBuffer = await data.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }
  if (typeof data === "string") {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  throw new Error("UNSUPPORTED_MESSAGE_PAYLOAD");
};

type TitanQuoteResult = QuoteResponse;

const requestTitanQuotes = (
  wsUrl: string,
  payload: QuoteRequest,
  config: TitanConfig,
): Promise<TitanQuoteResult> =>
  new Promise((resolve, reject) => {
    const logError = (error: unknown) => {
      console.error("Titan WebSocket error", {
        message: error instanceof Error ? error.message : String(error),
      });
    };

    const ws =
      config.token && config.token.length > 0
        ? new (WebSocket as unknown as {
            new (
              url: string,
              protocols: string[],
              options: { headers: Record<string, string> },
            ): WebSocket;
          })(wsUrl, TITAN_PROTOCOLS, {
            headers: {
              Authentication: `Bearer ${config.token}`,
              Authorization: `Bearer ${config.token}`,
            },
          })
        : new WebSocket(wsUrl, TITAN_PROTOCOLS);

    let requestId = 1;
    let streamId: number | null = null;
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          ws.close(4000, "timeout");
        } catch {
          // ignore
        }
        reject(new Error("TITAN_TIMEOUT"));
      }
    }, REQUEST_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeoutId);
      ws.removeEventListener("open", handleOpen);
      ws.removeEventListener("message", handleMessage);
      ws.removeEventListener("error", handleError);
      ws.removeEventListener("close", handleClose);
    };

    const sendRequest = (data: Record<string, unknown>) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const message = { id: requestId++, data };
      ws.send(encode(message));
    };

    const finishWithError = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(4001, "error");
        }
      } catch {
        // ignore
      }
      logError(error);
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const finishWithResult = (result: TitanQuoteResult) => {
      if (settled) return;
      settled = true;
      if (streamId !== null) {
        try {
          sendRequest({ StopStream: { id: streamId } });
        } catch {
          // ignore
        }
      }
      cleanup();
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, "ok");
        }
      } catch {
        // ignore
      }
      resolve(result);
    };

    const handleOpen = () => {
      try {
        const swapRequest = {
          swap: {
            inputMint: base58ToBytes(payload.inMint),
            outputMint: base58ToBytes(payload.outMint),
            amount: BigInt(payload.amountIn),
            swapMode: "ExactIn",
            slippageBps: payload.slippageBps,
          },
          transaction: {
            userPublicKey: base58ToBytes(payload.userPublicKey),
          },
          update: {
            intervalMs: DEFAULT_UPDATE_INTERVAL_MS,
            numQuotes: DEFAULT_NUM_QUOTES,
          },
        };

        sendRequest({ NewSwapQuoteStream: swapRequest });
      } catch (error) {
        finishWithError(error);
      }
    };

    const handleMessage = async (event: MessageEvent) => {
      try {
        const raw = await toUint8ArrayMessage(event.data);
        const decoded = decode(raw) as Record<string, unknown>;

        if (decoded.Response) {
          const response = decoded.Response as {
            stream?: { id: number };
          };
          if (response.stream) {
            streamId = response.stream.id;
          }
          return;
        }

        if (decoded.Error) {
          const error = decoded.Error as { message?: string };
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
          finishWithResult(normalized);
          return;
        }

        if (decoded.StreamEnd) {
          const streamEnd = decoded.StreamEnd as { errorMessage?: string };
          throw new Error(streamEnd.errorMessage ?? "STREAM_ENDED");
        }
      } catch (error) {
        finishWithError(error);
      }
    };

    const handleError = (event: Event) => {
      const error =
        event instanceof ErrorEvent
          ? event.error ?? new Error(event.message)
          : new Error("TITAN_CONNECTION_ERROR");
      finishWithError(error);
    };

    const handleClose = () => {
      if (!settled) {
        finishWithError(new Error("TITAN_CONNECTION_CLOSED"));
      }
    };

    ws.addEventListener("open", handleOpen);
    ws.addEventListener("message", handleMessage);
    ws.addEventListener("error", handleError);
    ws.addEventListener("close", handleClose);
  });

export const fetchBestQuote = async (
  payload: QuoteRequest,
  config: TitanConfig,
): Promise<QuoteResponse> => {
  const candidateUrls = getCandidateWsUrls(config);
  let lastError: unknown;

  for (const wsUrl of candidateUrls) {
    try {
      return await requestTitanQuotes(wsUrl, payload, config);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("QUOTE_STREAM_UNAVAILABLE");
};

export const resolveHttpUrl = (
  config: TitanConfig,
  path: string,
  region?: string,
) => {
  const base = ensureHttpBaseUrl(config.httpBaseUrl, region);
  return joinUrl(base, path);
};
