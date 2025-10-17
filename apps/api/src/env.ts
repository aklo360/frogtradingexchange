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
