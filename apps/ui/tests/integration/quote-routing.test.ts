import { describe, expect, it } from "vitest";

const LIVE_API_ORIGIN =
  process.env.FROGX_LIVE_API_ORIGIN ?? "https://frogx-api.aklo.workers.dev";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PROBE_PUBLIC_KEY = "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf";

const apiUrl = (path: string) => new URL(path, LIVE_API_ORIGIN).toString();

const readJson = async <T>(response: Response): Promise<T> => {
  expect(response.headers.get("content-type") ?? "").toContain(
    "application/json",
  );
  return (await response.json()) as T;
};

const quotePayload = {
  inMint: SOL_MINT,
  outMint: USDC_MINT,
  amountIn: "1000000000",
  slippageBps: 50,
  priorityFee: 0,
  userPublicKey: PROBE_PUBLIC_KEY,
};

type AccountConfigResponse = {
  accountModeEnabled?: boolean;
  accountCreation?: {
    ftxWebEnabled?: boolean;
    telegramBotEnabled?: boolean;
    surfaces?: string[];
    convergenceKey?: string;
    requiresTelegramLinkForRibbot?: boolean;
  };
  privy?: {
    configured?: boolean;
    jwksConfigured?: boolean;
    externalWalletsVerificationOnly?: boolean;
  };
  bot?: {
    tradingEnabled?: boolean;
    executionEnabled?: boolean;
  };
  safety?: {
    ribbotHoldsPrivateKeys?: boolean;
    linkedExternalWalletsTradeableByBot?: boolean;
    liveExecutionRequiresPrivySignerPolicies?: boolean;
  };
};

type FloorResponse = {
  collectionSymbol?: string;
  source?: string;
  floorLamports?: string;
  floorSol?: number;
  lowestListing?: unknown;
};

type QuoteResponse = {
  executable?: boolean;
  amountOut?: string;
  instructions?: Array<{
    programId?: string;
    accounts?: Array<{ pubkey?: string; isSigner?: boolean }>;
    data?: string;
  }>;
  addressLookupTables?: string[];
  transactionBase64?: string;
};

describe("live FrogX API contract", () => {
  it("exposes account safety gates and Privy config", async () => {
    const response = await fetch(apiUrl("/api/frogx/account/config"));
    const body = await readJson<AccountConfigResponse>(response);

    expect(response.status).toBe(200);
    expect(body.accountModeEnabled).toBe(true);
    expect(body.accountCreation?.ftxWebEnabled ?? body.privy?.configured).toBe(true);
    expect(body.accountCreation?.requiresTelegramLinkForRibbot ?? true).toBe(true);
    expect(body.privy?.configured).toBe(true);
    expect(body.privy?.jwksConfigured).toBe(true);
    expect(body.privy?.externalWalletsVerificationOnly).toBe(true);
    expect(body.bot?.tradingEnabled).toBe(false);
    expect(body.bot?.executionEnabled).toBe(false);
    expect(body.safety?.ribbotHoldsPrivateKeys).toBe(false);
    expect(body.safety?.linkedExternalWalletsTradeableByBot).toBe(false);
    expect(body.safety?.liveExecutionRequiresPrivySignerPolicies).toBe(true);
  });

  it("returns Magic Eden floor data for Solana Business Frogs", async () => {
    const response = await fetch(apiUrl("/api/frogx/nfts/floor?collection=sbf"));
    const body = await readJson<FloorResponse>(response);

    expect(response.status).toBe(200);
    expect(body.collectionSymbol).toBe("solana_business_frogs");
    expect(body.source).toBe("magic_eden");
    expect(Number(body.floorLamports)).toBeGreaterThan(0);
    expect(body.floorSol).toBeGreaterThan(0);
    expect(body.lowestListing).toBeTruthy();
  });

  it("returns an executable Titan quote that the UI can build or sign", async () => {
    const response = await fetch(apiUrl("/api/frogx/quotes"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(quotePayload),
    });
    const body = await readJson<QuoteResponse>(response);

    expect(response.status).toBe(200);
    expect(body.executable).toBe(true);
    expect(Number(body.amountOut)).toBeGreaterThan(0);
    expect(
      Boolean(body.transactionBase64) || (body.instructions?.length ?? 0) > 0,
    ).toBe(true);
    if (body.instructions?.length) {
      expect(body.instructions[0].programId).toEqual(expect.any(String));
      expect(body.instructions[0].accounts?.length ?? 0).toBeGreaterThan(0);
      expect(body.instructions[0].data).toEqual(expect.any(String));
    }
    expect(Array.isArray(body.addressLookupTables)).toBe(true);
  });

  it("fails closed when Titan REST swap-build is unavailable", async () => {
    const response = await fetch(apiUrl("/api/frogx/swap"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userPubkey: PROBE_PUBLIC_KEY,
        inMint: SOL_MINT,
        outMint: USDC_MINT,
        amountIn: "1000000000",
        slippageBps: 50,
        priorityFee: 0,
      }),
    });
    const body = await readJson<{ error?: string }>(response);

    expect(response.status).toBe(502);
    expect(body.error).toMatch(/temporarily unavailable/i);
  });
});
