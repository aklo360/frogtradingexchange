/**
 * Centralized configuration for Titan endpoints and Solana settings.
 * Reads environment variables once to avoid repeated parsing or missing keys.
 */
export type ServiceConfig = {
  titanBaseUrl: string;
  titanWsUrl: string;
  titanToken: string;
  preferredRegions: string[];
  quoteFreshnessSeconds: number;
  solanaRpcUrl: string;
  solanaWsUrl: string;
};

const parseRegions = (value: string | undefined): string[] =>
  value
    ?.split(",")
    .map((region) => region.trim())
    .filter(Boolean) ?? [];

const toNumber = (value: string | undefined, fallback: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const normalizeUrl = (value: string | undefined, fallback: string) => {
  if (!value) return fallback;
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) return fallback;
  return trimmed.replace(/^([a-zA-Z]+):+\/\//, (_, protocol: string) => `${protocol}://`);
};

export const serviceConfig: ServiceConfig = {
  titanBaseUrl: normalizeUrl(process.env.TITAN_BASE_URL, "https://us1/api/v1"),
  titanWsUrl: normalizeUrl(process.env.TITAN_WS_URL, "wss://us1/api/v1/ws"),
  titanToken: process.env.TITAN_TOKEN ?? "",
  preferredRegions: parseRegions(process.env.TITAN_REGION_ORDER) ?? [
    "us1",
    "de1",
    "jp1",
  ],
  quoteFreshnessSeconds: toNumber(process.env.QUOTE_FRESHNESS_SECONDS, 3),
  solanaRpcUrl: normalizeUrl(
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? process.env.SOLANA_RPC_URL,
    "https://api.mainnet-beta.solana.com",
  ),
  solanaWsUrl: normalizeUrl(
    process.env.NEXT_PUBLIC_SOLANA_WS_URL ?? process.env.SOLANA_WS_URL,
    "wss://api.mainnet-beta.solana.com",
  ),
};

export const isServer = typeof window === "undefined";

/**
 * Guard helper to ensure server-only values never leak into the client.
 * Throws in the browser so problems surface during development.
 */
export const assertServerSide = () => {
  if (!isServer) {
    throw new Error("This module can only be imported on the server");
  }
};
