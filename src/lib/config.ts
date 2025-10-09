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

export const serviceConfig: ServiceConfig = {
  titanBaseUrl: process.env.TITAN_BASE_URL ?? "https://us1/api/v1",
  titanWsUrl: process.env.TITAN_WS_URL ?? "wss://us1/api/v1/ws",
  titanToken: process.env.TITAN_TOKEN ?? "",
  preferredRegions: parseRegions(process.env.TITAN_REGION_ORDER) ?? [
    "us1",
    "de1",
    "jp1",
  ],
  quoteFreshnessSeconds: toNumber(process.env.QUOTE_FRESHNESS_SECONDS, 3),
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
