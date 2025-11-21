const TAPESTRY_API_KEY = process.env.TAPESTRY_API_KEY;
const TAPESTRY_API_BASE_URL =
  process.env.TAPESTRY_API_BASE_URL ?? "https://api.usetapestry.dev/api/v1";
const TAPESTRY_NAMESPACE = process.env.TAPESTRY_NAMESPACE ?? null;
export const tapestryConfig = (() => {
  if (!TAPESTRY_API_KEY) {
    throw new Error(
      "Missing TAPESTRY_API_KEY env var. Add it to your Pages secrets or local .env",
    );
  }

  return {
    apiKey: TAPESTRY_API_KEY,
    baseUrl: TAPESTRY_API_BASE_URL,
    namespace: TAPESTRY_NAMESPACE,
  };
})();

export const solanaRpcConfig = (() => {
  const endpoint =
    process.env.SOLANA_RPC_URL ?? process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? null;

  return {
    endpoint,
  };
})();
