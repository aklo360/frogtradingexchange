import { getTitanConfig, type Env } from "./env";
import {
  getPlatformFeeConfig,
  debugPlatformConfig,
  resolvePlatformFee,
  type PlatformFeeConfig,
  type PlatformFeeResolution,
} from "./fees";
import {
  burnBuybackAsset,
  getBuybackStatus,
  isAuthorizedBuybackTrigger,
  runBuyback,
} from "./buyback";
import {
  fetchBestQuote,
  resolveHttpUrl,
  type QuoteRequest,
} from "./titan";

const json = (data: unknown, init?: ResponseInit) =>
  Response.json(data, init);

const validatePlatformFeeResolution = async (
  env: Env,
  config: PlatformFeeConfig,
  resolution: PlatformFeeResolution | null,
) => {
  if (!resolution?.feeAccount) return null;

  const rpcUrl = env.SOLANA_RPC_URL?.trim();
  if (!rpcUrl) {
    console.warn("[fees] Skipping platform fee; SOLANA_RPC_URL unavailable");
    return null;
  }

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [resolution.feeAccount, { encoding: "jsonParsed" }],
      }),
    });
    if (!response.ok) {
      console.warn("[fees] Skipping platform fee; RPC account lookup failed", {
        status: response.status,
      });
      return null;
    }

    const data = (await response.json()) as {
      result?: {
        value?: {
          data?: {
            parsed?: {
              info?: {
                mint?: string;
                owner?: string;
                state?: string;
              };
              type?: string;
            };
          };
          owner?: string;
        } | null;
      };
    };

    const account = data.result?.value;
    const info = account?.data?.parsed?.info;
    const expectedOwner = config.collectorAuthority?.toBase58?.();
    const valid =
      account?.owner === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" &&
      account.data?.parsed?.type === "account" &&
      info?.state === "initialized" &&
      info?.mint === resolution.feeMint &&
      (!expectedOwner || info.owner === expectedOwner);

    if (!valid) {
      console.warn("[fees] Skipping platform fee; fee account invalid", {
        feeAccount: resolution.feeAccount,
        feeMint: resolution.feeMint,
      });
      return null;
    }

    return resolution;
  } catch (error) {
    console.warn("[fees] Skipping platform fee; fee account validation errored", error);
    return null;
  }
};

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

export async function getBuyback(env: Env): Promise<Response> {
  const status = await getBuybackStatus(env);
  // IMPORTANT: Disable caching so floor price is always fresh
  return json(status, {
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}

export async function postBuybackExecute(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!isAuthorizedBuybackTrigger(request, env)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await runBuyback(env);
    return json({ ok: true });
  } catch (error) {
    // SECURITY: Log details server-side, return generic message to client
    console.error("[buyback] Execute failed:", error);
    return json({ error: "Buyback operation failed" }, { status: 500 });
  }
}

export async function postBuybackBurn(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!isAuthorizedBuybackTrigger(request, env)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  let mint: string | undefined;
  try {
    const body = (await request.json()) as { mint?: string };
    mint = body?.mint;
  } catch {
    mint = undefined;
  }
  try {
    const result = await burnBuybackAsset(env, mint);
    return json({ ok: true, ...result });
  } catch (error) {
    // SECURITY: Log details server-side, return generic message to client
    console.error("[buyback] Burn failed:", error);
    return json({ error: "Burn operation failed" }, { status: 500 });
  }
}

export async function postQuotes(request: Request, env: Env): Promise<Response> {
  const config = getTitanConfig(env);
  const feeConfig = getPlatformFeeConfig(env);
  // SECURITY: Only log config in development, not production
  if (feeConfig.enabled && config.httpBaseUrl?.includes("demo")) {
    debugPlatformConfig(feeConfig);
  }
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
    const usePlatformFee = feeConfig.enabled;
    const feeResolution = usePlatformFee
      ? await validatePlatformFeeResolution(
          env,
          feeConfig,
          resolvePlatformFee(feeConfig, inMint ?? "", outMint ?? ""),
        )
      : null;
    const quote = await fetchBestQuote(
      {
        inMint: inMint ?? "",
        outMint: outMint ?? "",
        amountIn: amountIn ?? "0",
        slippageBps: slippageBps ?? 0,
        priorityFee: priorityFee ?? 0,
        userPublicKey,

        ...(usePlatformFee && feeResolution
          ? {
              feeAccount: feeResolution.feeAccount,
              feeBps: feeResolution.feeBps,
              feeFromInputMint: feeResolution.feeFromInputMint,
              feeMint: feeResolution.feeMint,
            }
          : {}),
      },
      config,
    );
    return json(quote);
  } catch (error) {
    // SECURITY: Log details server-side, return generic message to client
    console.error("[quotes] Failed to fetch quote:", error);
    return json({ error: "Quote service temporarily unavailable" }, { status: 502 });
  }
}

type SwapBuildPayload = {
  userPubkey: string;
  inMint: string;
  outMint: string;
  amountIn: string;
  slippageBps: number;
  priorityFee: number;
  feeBps?: number;
  feeFromInputMint?: boolean;
  feeAccount?: string;
};

export async function postSwap(request: Request, env: Env): Promise<Response> {
  const config = getTitanConfig(env);
  const feeConfig = getPlatformFeeConfig(env);
  // SECURITY: Only log config in development, not production
  if (feeConfig.enabled && config.httpBaseUrl?.includes("demo")) {
    debugPlatformConfig(feeConfig);
  }
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

  const usePlatformFee = feeConfig.enabled;
  const feeResolution = usePlatformFee
    ? await validatePlatformFeeResolution(
        env,
        feeConfig,
        resolvePlatformFee(feeConfig, payload.inMint, payload.outMint),
      )
    : null;

  const swapBody = {
    ...payload,
    ...(usePlatformFee && feeResolution
      ? {
          feeBps: feeResolution.feeBps,
          feeFromInputMint: feeResolution.feeFromInputMint,
          feeAccount: feeResolution.feeAccount,
        }
      : {}),
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify(swapBody),
  });

  if (!response.ok) {
    // SECURITY: Log details server-side, return generic message to client
    const text = await response.text();
    console.error("[swap] Upstream error:", response.status, text);
    return json({ error: "Swap service temporarily unavailable" }, { status: 502 });
  }

  const data = (await response.json()) as {
    txBase64?: string | null;
    route?: unknown;
    meta?: Record<string, unknown>;
  };

  const meta = { ...(data.meta ?? {}) };
  if (usePlatformFee && feeResolution) {
    meta.resolvedPlatformFee = {
      feeBps: feeResolution.feeBps,
      mint: feeResolution.feeMint,
      from: feeResolution.feeFromInputMint ? "input" : "output",
      account: feeResolution.feeAccount ?? null,
    };
  }

  const mode = data.txBase64 ? "tx_base64" : "route";

  return json({
    mode,
    txBase64: data.txBase64 ?? null,
    route: data.route ?? null,
    meta,
  });
}
