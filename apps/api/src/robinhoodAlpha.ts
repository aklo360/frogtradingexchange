import type { Env } from "./env";

const CHAIN = "robinhood";
const CHAIN_ID = 4663;
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const STORE_NAME = "__ribbot_robinhood_alpha__";
const STORE_PATH = "/robinhood-alpha-state";
const DEFAULT_GECKO_API = "https://api.geckoterminal.com/api/v2";
const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const FRESH_POOL_MS = 24 * 60 * 60 * 1000;
const MAX_STORED_TRADES = 12_000;
const MAX_SIGNALS = 50;
const GECKO_REQUEST_INTERVAL_MS = 2_500;
const GECKO_MAX_ATTEMPTS = 4;

export type RobinhoodAlphaConfig = {
  scanIntervalMinutes: number;
  maxPools: number;
  minLiquidityUsd: number;
  minVolumeUsd: number;
  signalMinWallets: number;
  signalWindowMinutes: number;
  minWalletTokens: number;
  minWinRate: number;
  maxSprayRatio: number;
  minimumWinReturnPct: number;
  copyWindowSeconds: number;
  maxCopyOverlapRatio: number;
};

export type RobinhoodAlphaPool = {
  poolAddress: string;
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  dex: string;
  createdAt: string;
  priceUsd: number;
  priceChange24h: number;
  volume24hUsd: number;
  liquidityUsd: number;
  buys24h: number;
  geckoUrl: string;
  explorerUrl: string;
};

export type RobinhoodAlphaTrade = {
  id: string;
  txHash: string;
  poolAddress: string;
  tokenAddress: string;
  walletAddress: string;
  kind: "buy" | "sell";
  tokenAmount: number;
  volumeUsd: number;
  tokenPriceUsd: number;
  timestamp: string;
};

export type RobinhoodAlphaWalletScore = {
  walletAddress: string;
  score: number;
  tokenCount: number;
  winningTokenCount: number;
  winRate: number;
  estimatedPnlUsd: number;
  averageReturnPct: number;
  sprayRatio: number;
  copyOverlapRatio: number;
  lastBuyAt: string;
  explorerUrl: string;
};

export type RobinhoodAlphaSignal = {
  signalId: string;
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  poolAddress: string;
  detectedAt: string;
  windowMinutes: number;
  qualifiedWalletCount: number;
  qualifiedWallets: string[];
  rosterAverageScore: number;
  priceUsd: number;
  liquidityUsd: number;
  volume24hUsd: number;
  poolAgeMinutes: number;
  provisional: boolean;
  geckoUrl: string;
  explorerUrl: string;
  disclaimer: string;
};

export type RobinhoodAlphaSnapshot = {
  status: "ready" | "provisional";
  chain: typeof CHAIN;
  chainId: typeof CHAIN_ID;
  generatedAt: string;
  nextScanAt: string;
  observedHistoryDays: number;
  config: RobinhoodAlphaConfig;
  summary: {
    runnerPools: number;
    observedTrades: number;
    candidateWallets: number;
    rosterWallets: number;
    recentSignals: number;
  };
  roster: RobinhoodAlphaWalletScore[];
  signals: RobinhoodAlphaSignal[];
  runnerPools: RobinhoodAlphaPool[];
  warnings: string[];
  lastError?: string;
};

export type RobinhoodAlphaStoredState = {
  snapshot: RobinhoodAlphaSnapshot;
  trades: RobinhoodAlphaTrade[];
  pools: RobinhoodAlphaPool[];
};

type GeckoPoolResource = {
  id?: string;
  attributes?: {
    address?: unknown;
    name?: unknown;
    pool_created_at?: unknown;
    base_token_price_usd?: unknown;
    price_change_percentage?: { h24?: unknown };
    volume_usd?: { h24?: unknown };
    reserve_in_usd?: unknown;
    transactions?: { h24?: { buys?: unknown } };
  };
  relationships?: {
    base_token?: { data?: { id?: unknown } };
    quote_token?: { data?: { id?: unknown } };
    dex?: { data?: { id?: unknown } };
  };
};

type GeckoTradeResource = {
  id?: unknown;
  attributes?: {
    tx_hash?: unknown;
    tx_from_address?: unknown;
    from_token_amount?: unknown;
    to_token_amount?: unknown;
    price_from_in_usd?: unknown;
    price_to_in_usd?: unknown;
    block_timestamp?: unknown;
    kind?: unknown;
    volume_in_usd?: unknown;
    from_token_address?: unknown;
    to_token_address?: unknown;
  };
};

type ScannerDependencies = {
  fetch?: typeof fetch;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  requestIntervalMs?: number;
};

type BuildSnapshotInput = {
  now: Date;
  config: RobinhoodAlphaConfig;
  pools: RobinhoodAlphaPool[];
  trades: RobinhoodAlphaTrade[];
  previous?: RobinhoodAlphaStoredState | null;
  ingestionWarnings?: string[];
};

type TokenPosition = {
  tokenAddress: string;
  buysUsd: number;
  sellsUsd: number;
  boughtTokens: number;
  soldTokens: number;
  lastBuyAt: string;
};

export function getRobinhoodAlphaConfig(env: Env): RobinhoodAlphaConfig {
  return {
    scanIntervalMinutes: integerEnv(
      env.ROBINHOOD_ALPHA_SCAN_INTERVAL_MINUTES,
      5,
      360,
      15,
    ),
    maxPools: integerEnv(env.ROBINHOOD_ALPHA_MAX_POOLS, 4, 24, 12),
    minLiquidityUsd: numberEnv(
      env.ROBINHOOD_ALPHA_MIN_LIQUIDITY_USD,
      0,
      10_000_000,
      5_000,
    ),
    minVolumeUsd: numberEnv(
      env.ROBINHOOD_ALPHA_MIN_VOLUME_USD,
      0,
      1_000_000_000,
      10_000,
    ),
    signalMinWallets: integerEnv(
      env.ROBINHOOD_ALPHA_SIGNAL_MIN_WALLETS,
      2,
      20,
      4,
    ),
    signalWindowMinutes: integerEnv(
      env.ROBINHOOD_ALPHA_SIGNAL_WINDOW_MINUTES,
      1,
      120,
      15,
    ),
    minWalletTokens: integerEnv(
      env.ROBINHOOD_ALPHA_MIN_WALLET_TOKENS,
      2,
      20,
      3,
    ),
    minWinRate: numberEnv(
      env.ROBINHOOD_ALPHA_MIN_WIN_RATE,
      0.1,
      1,
      0.55,
    ),
    maxSprayRatio: numberEnv(
      env.ROBINHOOD_ALPHA_MAX_SPRAY_RATIO,
      0.05,
      1,
      0.5,
    ),
    minimumWinReturnPct: 20,
    copyWindowSeconds: 10,
    maxCopyOverlapRatio: 0.8,
  };
}

export function buildRobinhoodAlphaSnapshot(
  input: BuildSnapshotInput,
): RobinhoodAlphaStoredState {
  const nowMs = input.now.getTime();
  const cutoff = nowMs - HISTORY_WINDOW_MS;
  const observedPools = mergePools(input.previous?.pools ?? [], input.pools)
    .filter((pool) => dateMs(pool.createdAt) >= cutoff)
    .slice(0, 500);
  const poolsByToken = new Map(
    observedPools.map((pool) => [pool.tokenAddress, pool]),
  );
  const mergedTrades = dedupeTrades([
    ...(input.previous?.trades ?? []),
    ...input.trades,
  ])
    .filter((trade) => dateMs(trade.timestamp) >= cutoff)
    .sort((a, b) => dateMs(a.timestamp) - dateMs(b.timestamp))
    .slice(-MAX_STORED_TRADES);

  const tokenUniverse = new Set(mergedTrades.map((trade) => trade.tokenAddress));
  const positionsByWallet = buildPositions(mergedTrades);
  const copyOverlap = calculateCopyOverlap(mergedTrades, input.config);
  const roster: RobinhoodAlphaWalletScore[] = [];

  for (const [walletAddress, positions] of positionsByWallet) {
    const scoredPositions = Array.from(positions.values())
      .filter((position) => position.buysUsd > 0)
      .map((position) => scorePosition(position, poolsByToken));
    const tokenCount = scoredPositions.length;
    if (tokenCount < input.config.minWalletTokens) continue;

    const sprayRatio = tokenCount / Math.max(tokenUniverse.size, 1);
    if (sprayRatio > input.config.maxSprayRatio) continue;
    const overlap = copyOverlap.get(walletAddress) ?? 0;
    if (overlap >= input.config.maxCopyOverlapRatio) continue;

    const winningTokenCount = scoredPositions.filter(
      (position) => position.returnPct >= input.config.minimumWinReturnPct,
    ).length;
    const winRate = winningTokenCount / tokenCount;
    const estimatedPnlUsd = sum(
      scoredPositions.map((position) => position.pnlUsd),
    );
    const averageReturnPct =
      sum(scoredPositions.map((position) => position.returnPct)) / tokenCount;
    if (winRate < input.config.minWinRate || estimatedPnlUsd <= 0) continue;

    const lastBuyAt = scoredPositions
      .map((position) => position.lastBuyAt)
      .sort()
      .at(-1)!;
    const score = clamp(
      Math.round(
        winRate * 55 +
          Math.min(25, Math.log10(Math.max(estimatedPnlUsd, 1)) * 8) +
          Math.min(15, tokenCount * 2) +
          Math.min(5, Math.max(averageReturnPct, 0) / 40),
      ),
      0,
      100,
    );
    roster.push({
      walletAddress,
      score,
      tokenCount,
      winningTokenCount,
      winRate: round(winRate, 4),
      estimatedPnlUsd: round(estimatedPnlUsd, 2),
      averageReturnPct: round(averageReturnPct, 2),
      sprayRatio: round(sprayRatio, 4),
      copyOverlapRatio: round(overlap, 4),
      lastBuyAt,
      explorerUrl: `https://robinhoodchain.blockscout.com/address/${walletAddress}`,
    });
  }
  roster.sort((a, b) => b.score - a.score || b.estimatedPnlUsd - a.estimatedPnlUsd);

  const observedHistoryDays = observedDays(mergedTrades, input.now);
  const provisional = observedHistoryDays < 30;
  const newSignals = buildSignals({
    now: input.now,
    config: input.config,
    pools: input.pools,
    trades: mergedTrades,
    roster,
    provisional,
  });
  const signals = mergeSignals(
    input.previous?.snapshot.signals ?? [],
    newSignals,
    cutoff,
  );
  const warnings = [
    "Read-only research signal; no Robinhood Chain transaction is built, signed, or sent.",
    "Wallet returns are estimates from observed DEX trades and current pool prices, not audited tax-lot PNL.",
    "Copy/farm rejection is behavioral; shared-funder bundler detection remains unverified without archive funding-graph enrichment.",
    ...(input.ingestionWarnings ?? []),
    ...(provisional
      ? [
          `The rolling window currently contains ${observedHistoryDays.toFixed(1)} observed days, not a full 30-day sample.`,
        ]
      : []),
  ];
  const generatedAt = input.now.toISOString();
  const nextScanAt = new Date(
    nowMs + input.config.scanIntervalMinutes * 60_000,
  ).toISOString();

  return {
    snapshot: {
      status: provisional ? "provisional" : "ready",
      chain: CHAIN,
      chainId: CHAIN_ID,
      generatedAt,
      nextScanAt,
      observedHistoryDays: round(observedHistoryDays, 2),
      config: input.config,
      summary: {
        runnerPools: input.pools.length,
        observedTrades: mergedTrades.length,
        candidateWallets: positionsByWallet.size,
        rosterWallets: roster.length,
        recentSignals: signals.length,
      },
      roster: roster.slice(0, 250),
      signals,
      runnerPools: input.pools,
      warnings,
    },
    trades: mergedTrades,
    pools: observedPools,
  };
}

export async function runRobinhoodAlphaScanner(
  env: Env,
  dependencies: ScannerDependencies = {},
): Promise<void> {
  if (!isEnabled(env.ROBINHOOD_ALPHA_SCANNER_ENABLED)) return;
  const store = alphaStore(env);
  if (!store) return;
  const now = (dependencies.now ?? (() => new Date()))();
  const previous = await readStoredState(store);
  if (
    previous?.snapshot.nextScanAt &&
    dateMs(previous.snapshot.nextScanAt) > now.getTime()
  ) {
    return;
  }

  const config = getRobinhoodAlphaConfig(env);
  const fetcher = dependencies.fetch ?? fetch;
  const geckoRequest = createGeckoRequester({
    fetcher,
    sleep: dependencies.sleep ?? sleep,
    requestIntervalMs:
      dependencies.requestIntervalMs ?? GECKO_REQUEST_INTERVAL_MS,
  });
  try {
    const pools = await fetchRunnerPools(env, config, geckoRequest);
    const trades: RobinhoodAlphaTrade[] = [];
    const ingestionWarnings: string[] = [];
    let successfulPoolReads = 0;
    for (const pool of pools) {
      try {
        trades.push(...(await fetchPoolTrades(env, pool, geckoRequest)));
        successfulPoolReads += 1;
      } catch (error) {
        ingestionWarnings.push(
          `Skipped ${pool.tokenSymbol} pool trades during this refresh: ${safeError(error)}.`,
        );
      }
    }
    if (pools.length > 0 && successfulPoolReads === 0) {
      throw new Error("Every selected GeckoTerminal pool trade request failed");
    }
    const state = buildRobinhoodAlphaSnapshot({
      now,
      config,
      pools,
      trades,
      previous,
      ingestionWarnings,
    });
    await writeStoredState(store, state);
  } catch (error) {
    const message = safeError(error);
    if (!previous) {
      console.warn("[robinhood-alpha] Initial scan failed", message);
      return;
    }
    await writeStoredState(store, {
      ...previous,
      snapshot: {
        ...previous.snapshot,
        nextScanAt: new Date(
          now.getTime() + config.scanIntervalMinutes * 60_000,
        ).toISOString(),
        lastError: message,
        warnings: unique([
          ...previous.snapshot.warnings,
          "The latest refresh failed; showing the last good scanner snapshot.",
        ]),
      },
    });
  }
}

export async function getRobinhoodAlphaSignals(
  request: Request,
  env: Env,
): Promise<Response> {
  const token =
    env.RIBBOT_TRADING_BOT_TOKEN?.trim() ||
    env.FROGX_BOT_API_TOKEN?.trim();
  if (!token) {
    return Response.json(
      { status: "not_configured", required: ["RIBBOT_TRADING_BOT_TOKEN"] },
      { status: 503 },
    );
  }
  if (request.headers.get("Authorization") !== `Bearer ${token}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const store = alphaStore(env);
  if (!store) {
    return Response.json(
      { status: "not_configured", required: ["TRADING_BOT_ACCOUNTS"] },
      { status: 503 },
    );
  }
  const state = await readStoredState(store);
  if (!state) {
    return Response.json({
      status: "not_ready",
      chain: CHAIN,
      chainId: CHAIN_ID,
      scannerEnabled: isEnabled(env.ROBINHOOD_ALPHA_SCANNER_ENABLED),
      warnings: ["No completed Robinhood Chain alpha scan is stored yet."],
    });
  }
  return Response.json(state.snapshot);
}

export async function readRobinhoodAlphaStoreRequest(
  state: DurableObjectState,
): Promise<Response> {
  const stored = await state.storage.get<RobinhoodAlphaStoredState>(
    "robinhood-alpha-state",
  );
  return stored
    ? Response.json({ status: "ready", state: stored })
    : Response.json({ status: "not_found" }, { status: 404 });
}

export async function writeRobinhoodAlphaStoreRequest(
  request: Request,
  state: DurableObjectState,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isStoredState(body)) {
    return Response.json({ error: "Invalid alpha scanner state" }, { status: 400 });
  }
  await state.storage.put("robinhood-alpha-state", body);
  return Response.json({ status: "ready" });
}

async function fetchRunnerPools(
  env: Env,
  config: RobinhoodAlphaConfig,
  requestJson: GeckoRequest,
): Promise<RobinhoodAlphaPool[]> {
  const base = geckoBase(env);
  const urls = [
    `${base}/networks/${CHAIN}/trending_pools?page=1`,
    `${base}/networks/${CHAIN}/new_pools?page=1`,
  ];
  const responses: GeckoPoolResource[][] = [];
  for (const url of urls) {
    const data = await requestJson<{ data?: GeckoPoolResource[] }>(url);
    responses.push(data.data ?? []);
  }
  const pools = responses
    .flat()
    .map(parsePool)
    .filter((pool): pool is RobinhoodAlphaPool => Boolean(pool));
  const uniquePools = new Map<string, RobinhoodAlphaPool>();
  for (const pool of pools) uniquePools.set(pool.poolAddress, pool);
  return Array.from(uniquePools.values())
    .filter(
      (pool) =>
        pool.liquidityUsd >= config.minLiquidityUsd &&
        (pool.volume24hUsd >= config.minVolumeUsd || pool.buys24h >= config.signalMinWallets),
    )
    .sort((a, b) => runnerScore(b) - runnerScore(a))
    .slice(0, config.maxPools);
}

async function fetchPoolTrades(
  env: Env,
  pool: RobinhoodAlphaPool,
  requestJson: GeckoRequest,
): Promise<RobinhoodAlphaTrade[]> {
  const data = await requestJson<{ data?: GeckoTradeResource[] }>(
    `${geckoBase(env)}/networks/${CHAIN}/pools/${pool.poolAddress}/trades`,
  );
  const parsed = (data.data ?? [])
    .map((resource) => parseTrade(resource, pool))
    .filter((trade): trade is RobinhoodAlphaTrade => Boolean(trade));
  const buyVolumeByWallet = new Map<string, number>();
  for (const trade of parsed) {
    if (trade.kind !== "buy") continue;
    buyVolumeByWallet.set(
      trade.walletAddress,
      (buyVolumeByWallet.get(trade.walletAddress) ?? 0) + trade.volumeUsd,
    );
  }
  const topWallets = new Set(
    Array.from(buyVolumeByWallet.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100)
      .map(([wallet]) => wallet),
  );
  return parsed.filter((trade) => topWallets.has(trade.walletAddress));
}

type GeckoRequest = <T>(url: string) => Promise<T>;

function createGeckoRequester(input: {
  fetcher: typeof fetch;
  sleep: (milliseconds: number) => Promise<void>;
  requestIntervalMs: number;
}): GeckoRequest {
  const fetcher = input.fetcher;
  let requested = false;
  return async <T>(url: string): Promise<T> => {
    if (requested && input.requestIntervalMs > 0) {
      await input.sleep(input.requestIntervalMs);
    }
    requested = true;

    for (let attempt = 1; attempt <= GECKO_MAX_ATTEMPTS; attempt += 1) {
      const response = await fetcher(url, {
        headers: { Accept: "application/json" },
      });
      if (response.ok) return (await response.json()) as T;

      const status = response.status;
      const retryable = status === 429 || status >= 500;
      const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
      await response.body?.cancel().catch(() => undefined);
      if (!retryable || attempt === GECKO_MAX_ATTEMPTS) {
        throw new Error(`GeckoTerminal request failed with status ${status}`);
      }
      await input.sleep(
        retryAfterMs ?? Math.max(5_000, input.requestIntervalMs * 2 ** attempt),
      );
    }
    throw new Error("GeckoTerminal request exhausted retries");
  };
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parsePool(resource: GeckoPoolResource): RobinhoodAlphaPool | null {
  const attributes = resource.attributes;
  const poolAddress = address(attributes?.address);
  const baseId = string(resource.relationships?.base_token?.data?.id);
  const quoteId = string(resource.relationships?.quote_token?.data?.id);
  const baseToken = tokenAddressFromId(baseId);
  const quoteToken = tokenAddressFromId(quoteId);
  const tokenAddress = baseToken;
  if (
    !attributes ||
    !poolAddress ||
    !tokenAddress ||
    tokenAddress === WETH ||
    !quoteToken
  ) {
    return null;
  }
  const createdAt = iso(attributes.pool_created_at);
  if (!createdAt) return null;
  const name = string(attributes.name) ?? `${short(tokenAddress)} / WETH`;
  const tokenLabel = name.split(" / ")[0]?.trim() || short(tokenAddress);
  return {
    poolAddress,
    tokenAddress,
    tokenName: tokenLabel,
    tokenSymbol: tokenLabel,
    dex: string(resource.relationships?.dex?.data?.id) ?? "unknown",
    createdAt,
    priceUsd: finite(attributes.base_token_price_usd),
    priceChange24h: finite(attributes.price_change_percentage?.h24),
    volume24hUsd: finite(attributes.volume_usd?.h24),
    liquidityUsd: finite(attributes.reserve_in_usd),
    buys24h: Math.max(0, Math.trunc(finite(attributes.transactions?.h24?.buys))),
    geckoUrl: `https://www.geckoterminal.com/robinhood/pools/${poolAddress}`,
    explorerUrl: `https://robinhoodchain.blockscout.com/token/${tokenAddress}`,
  };
}

function parseTrade(
  resource: GeckoTradeResource,
  pool: RobinhoodAlphaPool,
): RobinhoodAlphaTrade | null {
  const attributes = resource.attributes;
  const txHash = hash(attributes?.tx_hash);
  const walletAddress = address(attributes?.tx_from_address);
  const timestamp = iso(attributes?.block_timestamp);
  const kind = attributes?.kind === "buy" || attributes?.kind === "sell" ? attributes.kind : null;
  if (!attributes || !txHash || !walletAddress || !timestamp || !kind) return null;
  const tokenSide = kind === "buy" ? "to" : "from";
  const tradedToken = address(
    tokenSide === "to" ? attributes.to_token_address : attributes.from_token_address,
  );
  if (tradedToken !== pool.tokenAddress) return null;
  const tokenAmount = finite(
    tokenSide === "to" ? attributes.to_token_amount : attributes.from_token_amount,
  );
  const tokenPriceUsd = finite(
    tokenSide === "to" ? attributes.price_to_in_usd : attributes.price_from_in_usd,
  );
  const volumeUsd = finite(attributes.volume_in_usd);
  if (tokenAmount <= 0 || volumeUsd <= 0) return null;
  return {
    id: string(resource.id) ?? `${txHash}:${pool.tokenAddress}:${kind}`,
    txHash,
    poolAddress: pool.poolAddress,
    tokenAddress: pool.tokenAddress,
    walletAddress,
    kind,
    tokenAmount,
    volumeUsd,
    tokenPriceUsd,
    timestamp,
  };
}

function buildPositions(
  trades: RobinhoodAlphaTrade[],
): Map<string, Map<string, TokenPosition>> {
  const result = new Map<string, Map<string, TokenPosition>>();
  for (const trade of trades) {
    const wallet = result.get(trade.walletAddress) ?? new Map<string, TokenPosition>();
    const position = wallet.get(trade.tokenAddress) ?? {
      tokenAddress: trade.tokenAddress,
      buysUsd: 0,
      sellsUsd: 0,
      boughtTokens: 0,
      soldTokens: 0,
      lastBuyAt: trade.timestamp,
    };
    if (trade.kind === "buy") {
      position.buysUsd += trade.volumeUsd;
      position.boughtTokens += trade.tokenAmount;
      if (trade.timestamp > position.lastBuyAt) position.lastBuyAt = trade.timestamp;
    } else {
      position.sellsUsd += trade.volumeUsd;
      position.soldTokens += trade.tokenAmount;
    }
    wallet.set(trade.tokenAddress, position);
    result.set(trade.walletAddress, wallet);
  }
  return result;
}

function scorePosition(
  position: TokenPosition,
  poolsByToken: Map<string, RobinhoodAlphaPool>,
) {
  const currentPrice = poolsByToken.get(position.tokenAddress)?.priceUsd ?? 0;
  const remainingTokens = Math.max(0, position.boughtTokens - position.soldTokens);
  const pnlUsd = position.sellsUsd + remainingTokens * currentPrice - position.buysUsd;
  return {
    pnlUsd,
    returnPct: position.buysUsd > 0 ? (pnlUsd / position.buysUsd) * 100 : -100,
    lastBuyAt: position.lastBuyAt,
  };
}

function calculateCopyOverlap(
  trades: RobinhoodAlphaTrade[],
  config: RobinhoodAlphaConfig,
): Map<string, number> {
  const bucketsByWallet = new Map<string, Set<string>>();
  for (const trade of trades) {
    if (trade.kind !== "buy") continue;
    const bucket = Math.floor(
      dateMs(trade.timestamp) / (config.copyWindowSeconds * 1000),
    );
    const set = bucketsByWallet.get(trade.walletAddress) ?? new Set<string>();
    set.add(`${trade.tokenAddress}:${bucket}`);
    bucketsByWallet.set(trade.walletAddress, set);
  }
  const entries = Array.from(bucketsByWallet.entries());
  const result = new Map<string, number>();
  for (let i = 0; i < entries.length; i += 1) {
    const [wallet, left] = entries[i];
    let maximum = 0;
    if (left.size >= 3) {
      for (let j = 0; j < entries.length; j += 1) {
        if (i === j) continue;
        const right = entries[j][1];
        if (right.size < 3) continue;
        const overlap = Array.from(left).filter((key) => right.has(key)).length;
        maximum = Math.max(maximum, overlap / Math.min(left.size, right.size));
      }
    }
    result.set(wallet, maximum);
  }
  return result;
}

function buildSignals(input: {
  now: Date;
  config: RobinhoodAlphaConfig;
  pools: RobinhoodAlphaPool[];
  trades: RobinhoodAlphaTrade[];
  roster: RobinhoodAlphaWalletScore[];
  provisional: boolean;
}): RobinhoodAlphaSignal[] {
  const rosterByWallet = new Map(input.roster.map((wallet) => [wallet.walletAddress, wallet]));
  const cutoff = input.now.getTime() - input.config.signalWindowMinutes * 60_000;
  const poolsByToken = new Map(input.pools.map((pool) => [pool.tokenAddress, pool]));
  const buyersByToken = new Map<string, Map<string, RobinhoodAlphaTrade>>();
  for (const trade of input.trades) {
    if (trade.kind !== "buy" || dateMs(trade.timestamp) < cutoff) continue;
    const pool = poolsByToken.get(trade.tokenAddress);
    if (!pool || input.now.getTime() - dateMs(pool.createdAt) > FRESH_POOL_MS) continue;
    if (!rosterByWallet.has(trade.walletAddress)) continue;
    const buyers = buyersByToken.get(trade.tokenAddress) ?? new Map();
    buyers.set(trade.walletAddress, trade);
    buyersByToken.set(trade.tokenAddress, buyers);
  }
  const signals: RobinhoodAlphaSignal[] = [];
  for (const [tokenAddress, buyers] of buyersByToken) {
    if (buyers.size < input.config.signalMinWallets) continue;
    const pool = poolsByToken.get(tokenAddress)!;
    const wallets = Array.from(buyers.keys()).sort();
    const latestAt = Math.max(...Array.from(buyers.values()).map((trade) => dateMs(trade.timestamp)));
    const scores = wallets.map((wallet) => rosterByWallet.get(wallet)!.score);
    const bucket = Math.floor(latestAt / (input.config.signalWindowMinutes * 60_000));
    signals.push({
      signalId: `${CHAIN}:${tokenAddress}:${bucket}`,
      tokenAddress,
      tokenName: pool.tokenName,
      tokenSymbol: pool.tokenSymbol,
      poolAddress: pool.poolAddress,
      detectedAt: new Date(latestAt).toISOString(),
      windowMinutes: input.config.signalWindowMinutes,
      qualifiedWalletCount: wallets.length,
      qualifiedWallets: wallets,
      rosterAverageScore: round(sum(scores) / scores.length, 1),
      priceUsd: pool.priceUsd,
      liquidityUsd: round(pool.liquidityUsd, 2),
      volume24hUsd: round(pool.volume24hUsd, 2),
      poolAgeMinutes: Math.max(0, Math.round((input.now.getTime() - dateMs(pool.createdAt)) / 60_000)),
      provisional: input.provisional,
      geckoUrl: pool.geckoUrl,
      explorerUrl: pool.explorerUrl,
      disclaimer: "Research signal only; verify liquidity, contract risk, and jurisdiction before acting.",
    });
  }
  return signals.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
}

function mergeSignals(
  previous: RobinhoodAlphaSignal[],
  current: RobinhoodAlphaSignal[],
  cutoff: number,
): RobinhoodAlphaSignal[] {
  const merged = new Map<string, RobinhoodAlphaSignal>();
  for (const signal of [...previous, ...current]) {
    if (dateMs(signal.detectedAt) >= cutoff) merged.set(signal.signalId, signal);
  }
  return Array.from(merged.values())
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
    .slice(0, MAX_SIGNALS);
}

function dedupeTrades(trades: RobinhoodAlphaTrade[]): RobinhoodAlphaTrade[] {
  const deduped = new Map<string, RobinhoodAlphaTrade>();
  for (const trade of trades) deduped.set(trade.id, trade);
  return Array.from(deduped.values());
}

function alphaStore(env: Env): DurableObjectStub | null {
  if (!env.TRADING_BOT_ACCOUNTS) return null;
  return env.TRADING_BOT_ACCOUNTS.get(env.TRADING_BOT_ACCOUNTS.idFromName(STORE_NAME));
}

async function readStoredState(
  store: DurableObjectStub,
): Promise<RobinhoodAlphaStoredState | null> {
  const response = await store.fetch(`https://trading-bot-account.local${STORE_PATH}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Alpha store read failed with status ${response.status}`);
  const body = (await response.json()) as { state?: RobinhoodAlphaStoredState };
  return body.state ?? null;
}

async function writeStoredState(
  store: DurableObjectStub,
  state: RobinhoodAlphaStoredState,
): Promise<void> {
  const response = await store.fetch(`https://trading-bot-account.local${STORE_PATH}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  if (!response.ok) throw new Error(`Alpha store write failed with status ${response.status}`);
}

function geckoBase(env: Env): string {
  return (env.GECKO_TERMINAL_API_URL?.trim() || DEFAULT_GECKO_API).replace(/\/+$/, "");
}

function isStoredState(value: unknown): value is RobinhoodAlphaStoredState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RobinhoodAlphaStoredState>;
  return Boolean(
    candidate.snapshot &&
      (candidate.snapshot.status === "ready" || candidate.snapshot.status === "provisional") &&
      Array.isArray(candidate.trades) &&
      Array.isArray(candidate.pools),
  );
}

function mergePools(
  previous: RobinhoodAlphaPool[],
  current: RobinhoodAlphaPool[],
): RobinhoodAlphaPool[] {
  const merged = new Map<string, RobinhoodAlphaPool>();
  for (const pool of [...previous, ...current]) {
    merged.set(pool.poolAddress, pool);
  }
  return Array.from(merged.values()).sort(
    (a, b) => dateMs(b.createdAt) - dateMs(a.createdAt),
  );
}

function runnerScore(pool: RobinhoodAlphaPool): number {
  return (
    pool.volume24hUsd * (1 + Math.max(pool.priceChange24h, 0) / 100) +
    pool.buys24h * 100 +
    pool.liquidityUsd * 0.1
  );
}

function observedDays(trades: RobinhoodAlphaTrade[], now: Date): number {
  if (trades.length === 0) return 0;
  const earliest = Math.min(...trades.map((trade) => dateMs(trade.timestamp)));
  return Math.min(30, Math.max(0, (now.getTime() - earliest) / 86_400_000));
}

function tokenAddressFromId(value: string | undefined): string | null {
  if (!value) return null;
  const separator = value.indexOf("_");
  return address(separator >= 0 ? value.slice(separator + 1) : value);
}

function address(value: unknown): string | null {
  const normalized = string(value)?.toLowerCase();
  return normalized && /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : null;
}

function hash(value: unknown): string | null {
  const normalized = string(value)?.toLowerCase();
  return normalized && /^0x[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function iso(value: unknown): string | null {
  const raw = string(value);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function finite(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberEnv(
  value: string | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
}

function integerEnv(
  value: string | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  return Math.round(numberEnv(value, min, max, fallback));
}

function isEnabled(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function short(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 240) : "Unknown scanner failure";
}
