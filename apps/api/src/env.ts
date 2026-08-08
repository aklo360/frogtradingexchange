const REGION_SEPARATORS = /[, ]+/;

const DEFAULT_REGION = "us1.api.demo.titan.exchange";
const DEFAULT_HTTP_BASE = "https://us1.api.demo.titan.exchange/api/v1";
const DEFAULT_WS_URL = "wss://us1.api.demo.titan.exchange/api/v1/ws";
const DEFAULT_QUOTE_FRESHNESS_SECONDS = 3;

const parseList = (value: string | undefined): string[] =>
  (value ?? "")
    .split(REGION_SEPARATORS)
    .map((entry) => entry.trim())
    .filter(Boolean);

const normalizeUrl = (value: string | undefined, fallback: string) => {
  if (!value) return fallback;
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) return fallback;
  return trimmed.replace(
    /^([a-zA-Z]+):+\/\//,
    (_, protocol: string) => `${protocol}://`,
  );
};

const toNumber = (value: string | undefined, fallback: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

export type Env = {
  TITAN_TOKEN?: string;
  TITAN_BASE_URL?: string;
  TITAN_WS_URL?: string;
  TITAN_REGION_ORDER?: string;
  TITAN_DEMO_API_TOKEN?: string;
  TITAN_DEMO_DEFAULT_REGION?: string;
  TITAN_DEMO_REGION_ORDER?: string;
  TITAN_DEMO_HTTP_BASE_SCHEME?: string;
  TITAN_DEMO_HTTP_BASE_PATH?: string;
  TITAN_DEMO_WS_BASE_SCHEME?: string;
  TITAN_DEMO_WS_PATH?: string;
  QUOTE_FRESHNESS_SECONDS?: string;
  SOLANA_RPC_URL?: string;
  NEXT_PUBLIC_SOLANA_RPC_URL?: string;
  SOLANA_WS_URL?: string;
  SOLANA_COMMITMENT?: string;
  PLATFORM_FEE_BPS?: string;
  PLATFORM_FEE_ENABLED?: string;
  PLATFORM_FEE_RECIPIENT?: string;
  PLATFORM_FEE_SOL_ACCOUNT?: string;
  PLATFORM_FEE_USDC_ACCOUNT?: string;
  PLATFORM_FEE_USDT_ACCOUNT?: string;
  PRIVY_APP_ID?: string;
  PRIVY_APP_SECRET?: string;
  PRIVY_API_BASE_URL?: string;
  PRIVY_AUTHORIZATION_KEY_ID?: string;
  PRIVY_SIGNER_ID?: string;
  PRIVY_AUTHORIZATION_PRIVATE_KEY?: string;
  PRIVY_WALLET_POLICY_IDS?: string;
  RIBBOT_TRADING_BOT_TOKEN?: string;
  FROGX_BOT_API_TOKEN?: string;
  TRADING_BOT_OPERATOR_TOKEN?: string;
  RIBBOT_CONTROL_URL?: string;
  RIBBOT_WALLET_CLAIM_URL?: string;
  PERP_FARMER_ENABLED?: string;
  PERP_FARMER_LIVE_EXECUTION_ENABLED?: string;
  PERP_FARMER_SERVICE_URL?: string;
  PERP_FARMER_SERVICE_TOKEN?: string;
  TRADING_BOT_LIVE_EXECUTION_ENABLED?: string;
  TRADING_BOT_SOLANA_GAS_SPONSORSHIP_ENABLED?: string;
  TRADING_BOT_SCHEDULER_ENABLED?: string;
  TRADING_BOT_SCHEDULER_LIVE_EXECUTION_ENABLED?: string;
  TRADING_BOT_SCHEDULER_MAX_ORDERS?: string;
  TRADING_BOT_SCHEDULER_RECONCILE_AFTER_SECONDS?: string;
  TRADING_BOT_ADVANCED_MONITOR_ENABLED?: string;
  TRADING_BOT_COPYTRADE_MONITOR_ENABLED?: string;
  TRADING_BOT_COPYTRADE_LIVE_EXECUTION_ENABLED?: string;
  TRADING_BOT_SNIPER_MONITOR_ENABLED?: string;
  TRADING_BOT_SNIPER_LIVE_EXECUTION_ENABLED?: string;
  TRADING_BOT_SNIPER_COOLDOWN_SECONDS?: string;
  TRADING_BOT_AUTO_BUY_MONITOR_ENABLED?: string;
  TRADING_BOT_AUTO_BUY_LIVE_EXECUTION_ENABLED?: string;
  TRADING_BOT_BUNDLE_BUY_LIVE_EXECUTION_ENABLED?: string;
  TRADING_BOT_AUTO_SELL_MONITOR_ENABLED?: string;
  TRADING_BOT_AUTO_SELL_LIVE_EXECUTION_ENABLED?: string;
  TRADING_BOT_ADVANCED_MONITOR_MAX_CONFIGS?: string;
  TRADING_BOT_ADVANCED_RECONCILE_AFTER_SECONDS?: string;
  TRADING_BOT_MANUAL_REVIEW_AFTER_SECONDS?: string;
  ROBINHOOD_ALPHA_SCANNER_ENABLED?: string;
  ROBINHOOD_ALPHA_SCAN_INTERVAL_MINUTES?: string;
  ROBINHOOD_ALPHA_MAX_POOLS?: string;
  ROBINHOOD_ALPHA_MIN_LIQUIDITY_USD?: string;
  ROBINHOOD_ALPHA_MIN_VOLUME_USD?: string;
  ROBINHOOD_ALPHA_SIGNAL_MIN_WALLETS?: string;
  ROBINHOOD_ALPHA_SIGNAL_WINDOW_MINUTES?: string;
  ROBINHOOD_ALPHA_MIN_WALLET_TOKENS?: string;
  ROBINHOOD_ALPHA_MIN_WIN_RATE?: string;
  ROBINHOOD_ALPHA_MAX_SPRAY_RATIO?: string;
  ROBINHOOD_VOLUME_MIN_USD?: string;
  ROBINHOOD_NEW_PAIR_MAX_AGE_MINUTES?: string;
  ROBINHOOD_NEW_PAIR_MIN_VOLUME_USD?: string;
  ROBINHOOD_VOLUME_SURGE_RATIO?: string;
  ROBINHOOD_VOLUME_SURGE_MIN_DELTA_USD?: string;
  ROBINHOOD_VOLUME_SIGNAL_COOLDOWN_MINUTES?: string;
  GECKO_TERMINAL_API_URL?: string;
  JUPITER_PRICE_API_URL?: string;
  JUPITER_TOKENS_API_URL?: string;
  JUPITER_API_KEY?: string;
  TRADING_BOT_ACCOUNTS?: DurableObjectNamespace;
  BUYBACK_ENABLED?: string;
  BUYBACK_DRY_RUN?: string;
  BUYBACK_BURN_ENABLED?: string;
  BUYBACK_WALLET_SECRET?: string;
  BUYBACK_WALLET_ADDRESS?: string;
  BUYBACK_SOL_RESERVE?: string;
  BUYBACK_MIN_SWAP_USDC?: string;
  BUYBACK_MIN_SWAP_USDT?: string;
  BUYBACK_TOKEN_RESERVE_USDC?: string;
  BUYBACK_TOKEN_RESERVE_USDT?: string;
  BUYBACK_TOKEN_RESERVE_WSOL?: string;
  BUYBACK_SWAP_SLIPPAGE_BPS?: string;
  BUYBACK_PRIORITY_FEE?: string;
  BUYBACK_TRIGGER_TOKEN?: string;
  ME_API_BASE_URL?: string;
  ME_API_KEY?: string;
  ME_API_KEY_HEADER?: string;
  ME_API_KEY_PREFIX?: string;
  ME_COLLECTION_SYMBOL?: string;
  MAGIC_EDEN_BUY_EXECUTION_ENABLED?: string;
  MAGIC_EDEN_SELL_EXECUTION_ENABLED?: string;
  ME_LISTINGS_PATH?: string;
  ME_LISTINGS_QUERY?: string;
  ME_BUY_NOW_PATH?: string;
  ME_BUY_NOW_METHOD?: string;
  SOL_INCINERATOR_API_URL?: string;
  SOL_INCINERATOR_API_KEY?: string;
  SOL_INCINERATOR_API_KEY_HEADER?: string;
  SOL_INCINERATOR_API_KEY_PREFIX?: string;
  SOL_INCINERATOR_BURN_PATH?: string;
  SOL_INCINERATOR_BURN_METHOD?: string;
  AIRDROP_ENABLED?: string;
  AIRDROP_CAMPAIGN_ID?: string;
  AIRDROP_COLLECTION_ADDRESS?: string;
  AIRDROP_DAEMON_TOKEN_ADDRESS?: string;
  AIRDROP_ESCROW_ADDRESS?: string;
  AIRDROP_DAEMON_DECIMALS?: string;
  AIRDROP_MIN_FROGS?: string;
  AIRDROP_FULL_PRIZE_MIN_FROGS?: string;
  AIRDROP_POOL_DAEMON?: string;
  AIRDROP_BASE_PRIZE_DAEMON?: string;
  AIRDROP_FULL_PRIZE_DAEMON?: string;
  AIRDROP_MIN_PRIZE_DAEMON?: string;
  AIRDROP_MAX_PRIZE_DAEMON?: string;
  AIRDROP_CLAIM_OPEN_AT?: string;
  AIRDROP_CLAIM_CLOSE_AT?: string;
  AIRDROP_ADMIN_TOKEN?: string;
  AIRDROP_PAYOUT_ENABLED?: string;
  AIRDROP_AUTO_PAYOUT_ENABLED?: string;
  AIRDROP_ETH_RPC_URL?: string;
  AIRDROP_ESCROW_PRIVATE_KEY?: string;
  AIRDROP_PAYOUT_BATCH_SIZE?: string;
  AIRDROP_PAYOUT_WAIT_FOR_RECEIPTS?: string;
  AIRDROP_COORDINATOR?: DurableObjectNamespace;
};

export type TitanConfig = {
  token: string;
  httpBaseUrl: string;
  wsUrl: string;
  preferredRegions: string[];
  quoteFreshnessSeconds: number;
};

const resolveToken = (env: Env) =>
  env.TITAN_TOKEN?.trim() || env.TITAN_DEMO_API_TOKEN?.trim() || "";

const resolveFallbackRegion = (env: Env) =>
  env.TITAN_DEMO_DEFAULT_REGION?.trim() || DEFAULT_REGION;

const resolveHttpBaseUrl = (env: Env, fallbackRegion: string) => {
  if (env.TITAN_BASE_URL) {
    return normalizeUrl(env.TITAN_BASE_URL, DEFAULT_HTTP_BASE);
  }

  const scheme = (env.TITAN_DEMO_HTTP_BASE_SCHEME ?? "https").trim() || "https";
  const path = env.TITAN_DEMO_HTTP_BASE_PATH ?? "/api/v1";
  return normalizeUrl(
    `${scheme}://${fallbackRegion}${path.startsWith("/") ? path : `/${path}`}`,
    DEFAULT_HTTP_BASE,
  );
};

const resolveWsUrl = (env: Env, fallbackRegion: string) => {
  if (env.TITAN_WS_URL) {
    return normalizeUrl(env.TITAN_WS_URL, DEFAULT_WS_URL);
  }

  const scheme = (env.TITAN_DEMO_WS_BASE_SCHEME ?? "wss").trim() || "wss";
  const path = env.TITAN_DEMO_WS_PATH ?? "/api/v1/ws";
  return normalizeUrl(
    `${scheme}://${fallbackRegion}${path.startsWith("/") ? path : `/${path}`}`,
    DEFAULT_WS_URL,
  );
};

const resolvePreferredRegions = (env: Env, fallbackRegion: string) => {
  const explicitRegions = parseList(env.TITAN_REGION_ORDER);
  if (explicitRegions.length > 0) {
    return explicitRegions;
  }

  const demoRegions = parseList(env.TITAN_DEMO_REGION_ORDER);
  if (demoRegions.length > 0) {
    return demoRegions;
  }

  return [fallbackRegion];
};

export const getTitanConfig = (env: Env): TitanConfig => {
  const fallbackRegion = resolveFallbackRegion(env);
  const preferredRegions = resolvePreferredRegions(env, fallbackRegion);

  return {
    token: resolveToken(env),
    httpBaseUrl: resolveHttpBaseUrl(env, fallbackRegion),
    wsUrl: resolveWsUrl(env, fallbackRegion),
    preferredRegions,
    quoteFreshnessSeconds: toNumber(
      env.QUOTE_FRESHNESS_SECONDS,
      DEFAULT_QUOTE_FRESHNESS_SECONDS,
    ),
  };
};
