import { getTitanConfig, type Env } from "./env";
import {
  fetchBestQuote,
  resolveHttpUrl,
  type QuoteRequest,
} from "./titan";

const json = (data: unknown, init?: ResponseInit) =>
  Response.json(data, init);

const createMockQuote = (payload: Partial<QuoteRequest>) =>
  json(
    {
      status: "executable",
      updatedAt: new Date().toISOString(),
      inMint: payload.inMint ?? "",
      outMint: payload.outMint ?? "",
      amountIn: payload.amountIn ?? "0",
      amountOut: "0",
      priceImpactBps: 0,
      routers: ["Titan"],
      provider: "Titan",
      routeId: "mock",
      inAmount: payload.amountIn ?? "0",
      instructions: [],
      addressLookupTables: [],
      executable: true,
      simulated: true,
    },
    { status: 200 },
  );

export async function getInfo(env: Env): Promise<Response> {
  const config = getTitanConfig(env);
  return json({
    routers: ["Titan Direct", "Jupiter"],
    preferredRegions: config.preferredRegions,
    quoteFreshnessSeconds: config.quoteFreshnessSeconds,
    mock: !config.token,
  });
}

export async function postQuotes(request: Request, env: Env): Promise<Response> {
  const config = getTitanConfig(env);
  console.log(
    "Titan quote request config",
    JSON.stringify({
      hasToken: Boolean(config.token),
      wsUrl: config.wsUrl,
      regions: config.preferredRegions,
    }),
  );
  let body: Partial<QuoteRequest> = {};
  try {
    body = (await request.json()) as Partial<QuoteRequest>;
  } catch (error) {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { inMint, outMint, amountIn, slippageBps, priorityFee, userPublicKey } =
    body;

  if (!userPublicKey) {
    return json({ error: "userPublicKey is required" }, { status: 400 });
  }

  if (!config.token) {
    return createMockQuote(body);
  }

  try {
    const quote = await fetchBestQuote(
      {
        inMint: inMint ?? "",
        outMint: outMint ?? "",
        amountIn: amountIn ?? "0",
        slippageBps: slippageBps ?? 0,
        priorityFee: priorityFee ?? 0,
        userPublicKey,
      },
      config,
    );
    return json(quote);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(
      {
        error: "Quote stream unavailable",
        details: message,
      },
      { status: 502 },
    );
  }
}

type SwapBuildPayload = {
  userPubkey: string;
  inMint: string;
  outMint: string;
  amountIn: string;
  slippageBps: number;
  priorityFee: number;
};

export async function postSwap(request: Request, env: Env): Promise<Response> {
  const config = getTitanConfig(env);
  console.log(
    "Titan swap request config",
    JSON.stringify({
      hasToken: Boolean(config.token),
      baseUrl: config.httpBaseUrl,
      region: config.preferredRegions[0],
    }),
  );
  let payload: SwapBuildPayload;
  try {
    payload = (await request.json()) as SwapBuildPayload;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!config.token) {
    return json(
      {
        mode: "tx_base64",
        txBase64: "BASE64_TX_PLACEHOLDER",
        meta: {
          mock: true,
          message: "Titan token missing; returning sample transaction.",
        },
      },
      { status: 200 },
    );
  }

  const region = config.preferredRegions[0];
  const url = resolveHttpUrl(config, "/frogx/swap", region);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    return json(
      { error: "Swap builder unavailable", details: text || undefined },
      { status: 502 },
    );
  }

  const data = (await response.json()) as {
    txBase64?: string | null;
    route?: unknown;
    meta?: Record<string, unknown>;
  };

  const mode = data.txBase64 ? "tx_base64" : "route";

  return json({
    mode,
    txBase64: data.txBase64 ?? null,
    route: data.route ?? null,
    meta: data.meta ?? null,
  });
}
