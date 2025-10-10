/**
 * Lightweight Solana mint + amount validation helpers.
 * These can be replaced with @solana/web3.js validations once RPC wiring lands.
 */
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const isValidMint = (value: string) => BASE58_REGEX.test(value);

export const clampSlippage = (bps: number, min = 5, max = 500) =>
  Math.min(Math.max(bps, min), max);

export const toBaseUnits = (amount: number, decimals: number) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be positive");
  }

  return BigInt(Math.round(amount * 10 ** decimals)).toString();
};
