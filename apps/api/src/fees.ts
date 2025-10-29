import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import type { Env } from "./env";

const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

const PRIORITY_MINTS = [WRAPPED_SOL_MINT, USDC_MINT, USDT_MINT] as const;

const DEFAULT_FEE_BPS = 100;

type FeeAccounts = Partial<Record<string, string>>;

export type PlatformFeeConfig = {
  feeBps: number;
  collectorAuthority: PublicKey | null;
  enabled: boolean;
  feeAccounts: FeeAccounts;
};

export type PlatformFeeResolution = {
  feeBps: number;
  feeAccount?: string;
  feeFromInputMint: boolean;
  feeMint: string;
};

const normalizePublicKey = (value: string | undefined) => {
  if (!value) return null;
  try {
    return new PublicKey(value.trim());
  } catch (error) {
    console.warn("[fees] Invalid public key provided", { value, error });
    return null;
  }
};

const normalizeMint = (value: string | undefined) => {
  const key = normalizePublicKey(value);
  return key ? key.toBase58() : null;
};

const parseFeeBps = (value: string | undefined) => {
  if (!value) return DEFAULT_FEE_BPS;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    console.warn(
      "[fees] PLATFORM_FEE_BPS invalid; falling back to default",
      value,
    );
    return DEFAULT_FEE_BPS;
  }
  return Math.min(Math.round(numeric), 10_000);
};

const parseFeeAccount = (value: string | undefined) => {
  const pubkey = normalizePublicKey(value);
  return pubkey ? pubkey.toBase58() : undefined;
};

const parseEnabled = (value: string | undefined) => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
};

export const getPlatformFeeConfig = (env: Env): PlatformFeeConfig =>
  normalizePlatformFeeConfig({
    feeBps: parseFeeBps(
      (env as { PLATFORM_FEE_BPS?: string }).PLATFORM_FEE_BPS,
    ),
    collectorAuthority: normalizePublicKey(
      (env as { PLATFORM_FEE_RECIPIENT?: string }).PLATFORM_FEE_RECIPIENT,
    ),
    feeAccounts: {
      [WRAPPED_SOL_MINT]: parseFeeAccount(
        (env as { PLATFORM_FEE_SOL_ACCOUNT?: string }).PLATFORM_FEE_SOL_ACCOUNT,
      ),
      [USDC_MINT]: parseFeeAccount(
        (env as { PLATFORM_FEE_USDC_ACCOUNT?: string })
          .PLATFORM_FEE_USDC_ACCOUNT,
      ),
      [USDT_MINT]: parseFeeAccount(
        (env as { PLATFORM_FEE_USDT_ACCOUNT?: string })
          .PLATFORM_FEE_USDT_ACCOUNT,
      ),
    },
    enabled: parseEnabled(
      (env as { PLATFORM_FEE_ENABLED?: string }).PLATFORM_FEE_ENABLED,
    ),
  });

export const normalizePlatformFeeConfig = (
  raw: PlatformFeeConfig,
): PlatformFeeConfig => {
  const enabled = raw.enabled;
  if (!enabled || !raw.collectorAuthority) {
    return {
      feeBps: 0,
      collectorAuthority: null,
      feeAccounts: {},
      enabled: false,
    };
  }

  return {
    ...raw,
    feeBps: raw.feeBps > 0 ? raw.feeBps : DEFAULT_FEE_BPS,
    enabled: true,
  };
};

export const debugPlatformConfig = (config: PlatformFeeConfig) => {
  if (!config.enabled) {
    console.log("[fees] Platform fee disabled");
    return;
  }
  console.log("[fees] Loaded platform fee config", {
    bps: config.feeBps,
    collector: config.collectorAuthority?.toBase58?.(),
    feeAccounts: JSON.stringify(config.feeAccounts),
  });
};

const deriveAta = (mint: PublicKey, owner: PublicKey) => {
  try {
    return getAssociatedTokenAddressSync(mint, owner, true);
  } catch (error) {
    console.warn("[fees] Failed to derive ATA", {
      mint: mint.toBase58(),
      owner: owner.toBase58(),
      error,
    });
    return null;
  }
};

const pickFeeMint = (inMint: string | null, outMint: string | null) => {
  for (const candidate of PRIORITY_MINTS) {
    if (candidate === inMint || candidate === outMint) {
      return candidate;
    }
  }
  return inMint ?? outMint ?? "";
};

export const resolvePlatformFee = (
  config: PlatformFeeConfig,
  inMintRaw: string | undefined,
  outMintRaw: string | undefined,
): PlatformFeeResolution => {
  if (!config.enabled) {
    return {
      feeBps: 0,
      feeAccount: undefined,
      feeFromInputMint: true,
      feeMint: inMintRaw ?? outMintRaw ?? "",
    };
  }
  const inMint = normalizeMint(inMintRaw);
  const outMint = normalizeMint(outMintRaw);
  const feeMint = pickFeeMint(inMint, outMint);

  let feeFromInputMint = true;
  if (feeMint) {
    if (inMint && feeMint === inMint) {
      feeFromInputMint = true;
    } else if (outMint && feeMint === outMint) {
      feeFromInputMint = false;
    } else {
      feeFromInputMint = true;
    }
  }

  let feeAccount: string | undefined;
  if (feeMint) {
    feeAccount = config.feeAccounts[feeMint];
    if (!feeAccount && config.collectorAuthority) {
      const mintKey = normalizePublicKey(feeMint);
      if (mintKey) {
        const ata = deriveAta(mintKey, config.collectorAuthority);
        if (ata) {
          feeAccount = ata.toBase58();
        }
      }
    }
  }

  if (!feeAccount) {
    console.warn("[fees] Platform fee account not resolved", {
      feeMint,
      feeFromInputMint,
      feeAccounts: config.feeAccounts,
      collector: config.collectorAuthority?.toBase58?.(),
    });
  }

  return {
    feeBps: config.feeBps,
    feeAccount,
    feeFromInputMint,
    feeMint,
  };
};
