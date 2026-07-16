export const solanaRpcConfig = (() => {
  const endpoint =
    process.env.SOLANA_RPC_URL ?? process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? null;

  return {
    endpoint,
  };
})();
