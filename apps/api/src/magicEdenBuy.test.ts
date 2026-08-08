import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { afterEach, describe, expect, it, vi } from "vitest";

const tradingBotMocks = vi.hoisted(() => ({
  authorizeTradingBotRequest: vi.fn(),
  getManagedPrivyWallet: vi.fn(),
  getManagedSolanaTransactionStatus: vi.fn(),
  managedSolanaExecutionMissingRequirements: vi.fn(),
  signAndSendManagedSolanaTransaction: vi.fn(),
}));

const MockPrivyWalletRpcError = vi.hoisted(
  () =>
    class extends Error {
      constructor(
        readonly status: number,
        readonly kind: "authorization" | "transport" | "http" = "http",
        readonly providerCode: string | null = null,
      ) {
        super(`Privy wallet RPC failed with status ${status}`);
      }
    },
);

vi.mock("./tradingBot", () => ({
  ...tradingBotMocks,
  PrivyWalletRpcError: MockPrivyWalletRpcError,
  privyRpcFailureWasNotBroadcast: (error: {
    status: number;
    kind: "authorization" | "transport" | "http";
    providerCode: string | null;
  }) =>
    error.providerCode === "policy_violation" ||
    error.providerCode === "transaction_broadcast_failure" ||
    error.kind === "authorization" ||
    (error.kind === "http" &&
      error.status >= 400 &&
      error.status < 500 &&
      ![408, 409, 425, 429].includes(error.status)),
}));

import type { Env } from "./env";
import {
  postMagicEdenBuyExecution,
  postMagicEdenFrogMarket,
  selectLowestFrogListing,
} from "./magicEdenBuy";

const MMM_PROGRAM = "mmm3XBJg5gk8XJxEKBvdgptZz6SgK4tXvn36sodowMc";

const request = (
  walletAddress: string,
  maximumPaymentLamports: string,
  expectedMint?: string,
  excludedMints?: string[],
) =>
  new Request("https://frogx.test/api/frogx/trading-bot/frogs/execute-buy", {
    method: "POST",
    headers: {
      Authorization: "Bearer backend-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      telegramUserId: "1640077203",
      walletAddress,
      executionId: "frog-buy-1",
      maximumPaymentLamports,
      ...(expectedMint ? { expectedMint } : {}),
      ...(excludedMints ? { excludedMints } : {}),
    }),
  });

const marketRequest = (walletAddress: string) =>
  new Request("https://frogx.test/api/frogx/trading-bot/frogs/market", {
    method: "POST",
    headers: {
      Authorization: "Bearer backend-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      telegramUserId: "1640077203",
      walletAddress,
    }),
  });

type CandidateFixture = {
  mint: string;
  price: number;
  simulationError?: unknown;
  simulationLogs?: string[];
  poolPricing?: {
    spotPrice: number;
    curveType: string;
    curveDelta: number;
    lpFeeBp: number;
  };
};

const mockCandidateScanFetch = (
  buyer: string,
  candidates: CandidateFixture[],
) => {
  const fixtures = candidates.map((candidate) => {
    const seller = Keypair.generate().publicKey;
    const pool = Keypair.generate().publicKey;
    const transaction = new Transaction({
      feePayer: new PublicKey(buyer),
      recentBlockhash: Keypair.generate().publicKey.toBase58(),
    }).add(
      new TransactionInstruction({
        programId: new PublicKey(MMM_PROGRAM),
        keys: [
          { pubkey: new PublicKey(buyer), isSigner: true, isWritable: true },
          { pubkey: seller, isSigner: false, isWritable: true },
          { pubkey: new PublicKey(candidate.mint), isSigner: false, isWritable: true },
          { pubkey: pool, isSigner: false, isWritable: true },
        ],
        data: Buffer.alloc(0),
      }),
    );
    return {
      ...candidate,
      seller,
      pool,
      transactionBase64: Buffer.from(
        transaction.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        }),
      ).toString("base64"),
    };
  });

  return vi.fn<typeof fetch>(async (requestInput, init) => {
    const url = new URL(String(requestInput));
    if (url.pathname.endsWith("/collections/solana_business_frogs/listings")) {
      expect(url.searchParams.get("listingAggMode")).toBe("false");
      const offset = Number(url.searchParams.get("offset") ?? "0");
      const limit = Number(url.searchParams.get("limit") ?? "100");
      return Response.json(
        fixtures.slice(offset, offset + limit).map((fixture) => ({
          tokenMint: fixture.mint,
          seller: fixture.seller.toBase58(),
          price: fixture.price,
          listingSource: "mmm",
        })),
      );
    }
    if (url.pathname.endsWith("/mmm/pools")) {
      return Response.json({
        results: fixtures.map((fixture) => ({
          poolKey: fixture.pool.toBase58(),
          poolType: "two_sided",
          mints: [fixture.mint],
          sellsideAssetAmount: 1,
          poolOwner: fixture.seller.toBase58(),
          ...fixture.poolPricing,
        })),
      });
    }
    if (url.pathname.endsWith("/instructions/mmm/sol-fulfill-sell")) {
      const fixture = fixtures.find(
        (candidate) => candidate.mint === url.searchParams.get("assetMint"),
      );
      if (!fixture) throw new Error("Unknown fixture mint");
      return Response.json({ tx: fixture.transactionBase64 });
    }
    if (url.hostname === "rpc.test") {
      const body = JSON.parse(String(init?.body)) as { params?: unknown[] };
      const fixture = fixtures.find(
        (candidate) => candidate.transactionBase64 === body.params?.[0],
      );
      if (!fixture) throw new Error("Unknown fixture transaction");
      return Response.json({
        result: {
          context: { slot: 123 },
          value: {
            err: fixture.simulationError ?? null,
            logs: fixture.simulationLogs ?? [],
          },
        },
      });
    }
    throw new Error(`Unexpected fetch: ${url.toString()}`);
  });
};

const mockPurchaseFetch = (input: {
  buyer: string;
  mint: string;
  simulationError?: unknown;
  simulationLogs?: string[];
}) => {
  const seller = Keypair.generate().publicKey;
  const pool = Keypair.generate().publicKey;
  const transaction = new Transaction({
    feePayer: new PublicKey(input.buyer),
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
  }).add(
    new TransactionInstruction({
      programId: new PublicKey(MMM_PROGRAM),
      keys: [
        { pubkey: new PublicKey(input.buyer), isSigner: true, isWritable: true },
        { pubkey: seller, isSigner: false, isWritable: true },
        { pubkey: new PublicKey(input.mint), isSigner: false, isWritable: true },
        { pubkey: pool, isSigner: false, isWritable: true },
      ],
      data: Buffer.alloc(0),
    }),
  );
  const serialized = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  return vi.fn<typeof fetch>(async (requestInput) => {
    const url = new URL(String(requestInput));
    if (url.hostname === "rpc.test") {
      return Response.json({
        result: {
          context: { slot: 123 },
          value: {
            err: input.simulationError ?? null,
            logs: input.simulationLogs ?? [],
          },
        },
      });
    }
    if (url.pathname.endsWith("/collections/solana_business_frogs/listings")) {
      return Response.json([
        {
          tokenMint: input.mint,
          seller: seller.toBase58(),
          price: 0.8,
          listingSource: "mmm",
        },
      ]);
    }
    if (url.pathname.endsWith("/mmm/pools")) {
      return Response.json({
        results: [
          {
            poolKey: pool.toBase58(),
            poolType: "two_sided",
            mints: [input.mint],
            sellsideAssetAmount: 1,
            poolOwner: seller.toBase58(),
          },
        ],
      });
    }
    if (url.pathname.endsWith("/instructions/mmm/sol-fulfill-sell")) {
      return Response.json({ tx: Buffer.from(serialized).toString("base64") });
    }
    throw new Error(`Unexpected fetch: ${url.toString()}`);
  });
};

describe("Magic Eden Frog purchase", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Object.values(tradingBotMocks).forEach((mock) => mock.mockReset());
  });

  it("selects the lowest valid live listing regardless of response order", () => {
    const expensiveMint = Keypair.generate().publicKey.toBase58();
    const cheapMint = Keypair.generate().publicKey.toBase58();

    expect(
      selectLowestFrogListing([
        { tokenMint: expensiveMint, price: 1.4 },
        {
          tokenMint: cheapMint,
          price: 0.8,
          token: {
            name: "SBF #7503",
            image: "https://images.example/frog-7503.png",
          },
        },
        { tokenMint: "invalid", price: 0.1 },
      ]),
    ).toMatchObject({
      mint: cheapMint,
      name: "SBF #7503",
      image: "https://images.example/frog-7503.png",
      priceLamports: "800000000",
    });
  });

  it("rejects non-HTTPS listing images", () => {
    const mint = Keypair.generate().publicKey.toBase58();

    expect(
      selectLowestFrogListing([
        {
          tokenMint: mint,
          price: 0.8,
          token: { name: "SBF #1", image: "javascript:alert(1)" },
        },
      ]),
    ).toMatchObject({ mint, name: "SBF #1", image: null });
  });

  it("quotes the lowest executable Frog instead of a stale listed floor", async () => {
    const buyer = Keypair.generate().publicKey.toBase58();
    const staleMint = Keypair.generate().publicKey.toBase58();
    const executableMint = Keypair.generate().publicKey.toBase58();
    tradingBotMocks.authorizeTradingBotRequest.mockReturnValue("allowed");
    tradingBotMocks.getManagedPrivyWallet.mockResolvedValue({
      wallet: { walletId: "wallet-1", walletAddress: buyer },
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = mockCandidateScanFetch(buyer, [
      {
        mint: staleMint,
        price: 0.8,
        simulationError: { InstructionError: [3, { Custom: 3012 }] },
        simulationLogs: ["Program log: AccountNotInitialized"],
      },
      { mint: executableMint, price: 0.9 },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const response = await postMagicEdenFrogMarket(marketRequest(buyer), {
      ME_API_KEY: "me-key",
      SOLANA_RPC_URL: "https://rpc.test",
    } as Env);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ready",
      floor: { mint: executableMint, priceLamports: "900000000" },
    });
    expect(tradingBotMocks.signAndSendManagedSolanaTransaction).not.toHaveBeenCalled();
  });

  it("uses the MMM pool sell price in lamports when building the purchase", async () => {
    const buyer = Keypair.generate().publicKey.toBase58();
    const mint = Keypair.generate().publicKey.toBase58();
    tradingBotMocks.authorizeTradingBotRequest.mockReturnValue("allowed");
    tradingBotMocks.getManagedPrivyWallet.mockResolvedValue({
      wallet: { walletId: "wallet-1", walletAddress: buyer },
    });
    const fetchMock = mockCandidateScanFetch(buyer, [
      {
        mint,
        price: 0.031531268,
        poolPricing: {
          spotPrice: 31_209_715,
          curveType: "exp",
          curveDelta: 3,
          lpFeeBp: 100,
        },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const response = await postMagicEdenFrogMarket(marketRequest(buyer), {
      ME_API_KEY: "me-key",
      SOLANA_RPC_URL: "https://rpc.test",
    } as Env);

    expect(response.status).toBe(200);
    const buildUrl = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((url) => url.pathname.endsWith("/instructions/mmm/sol-fulfill-sell"));
    expect(buildUrl?.searchParams.get("maxPaymentAmount")).toBe("31531268");
    expect(await response.json()).toMatchObject({
      floor: { mint, priceLamports: "31531268", priceSol: 0.031531268 },
    });
  });

  it("buys the next executable floor when a sweep encounters a stale listing", async () => {
    const buyer = Keypair.generate().publicKey.toBase58();
    const staleMint = Keypair.generate().publicKey.toBase58();
    const executableMint = Keypair.generate().publicKey.toBase58();
    tradingBotMocks.authorizeTradingBotRequest.mockReturnValue("allowed");
    tradingBotMocks.managedSolanaExecutionMissingRequirements.mockReturnValue([]);
    tradingBotMocks.getManagedPrivyWallet.mockResolvedValue({
      wallet: { walletId: "wallet-1", walletAddress: buyer },
    });
    tradingBotMocks.signAndSendManagedSolanaTransaction.mockResolvedValue({
      signature: "frog-purchase-signature",
      transactionId: "privy-transaction",
      referenceId: "me-buy:reference",
      caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = mockCandidateScanFetch(buyer, [
      {
        mint: staleMint,
        price: 0.8,
        simulationError: { InstructionError: [3, { Custom: 3012 }] },
        simulationLogs: ["Program log: AccountNotInitialized"],
      },
      { mint: executableMint, price: 0.9 },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const response = await postMagicEdenBuyExecution(
      request(buyer, "900000000"),
      {
        MAGIC_EDEN_BUY_EXECUTION_ENABLED: "true",
        ME_API_KEY: "me-key",
        SOLANA_RPC_URL: "https://rpc.test",
      } as Env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "submitted",
      listing: { mint: executableMint, priceLamports: "900000000" },
    });
    expect(tradingBotMocks.signAndSendManagedSolanaTransaction).toHaveBeenCalledTimes(1);
  });

  it("scans beyond ten stale floor listings during a sweep", async () => {
    const buyer = Keypair.generate().publicKey.toBase58();
    const staleCandidates = Array.from({ length: 10 }, () => ({
      mint: Keypair.generate().publicKey.toBase58(),
      price: 0.8,
      simulationError: { InstructionError: [3, { Custom: 3012 }] },
      simulationLogs: ["Program log: AccountNotInitialized"],
    }));
    const executableMint = Keypair.generate().publicKey.toBase58();
    tradingBotMocks.authorizeTradingBotRequest.mockReturnValue("allowed");
    tradingBotMocks.managedSolanaExecutionMissingRequirements.mockReturnValue([]);
    tradingBotMocks.getManagedPrivyWallet.mockResolvedValue({
      wallet: { walletId: "wallet-1", walletAddress: buyer },
    });
    tradingBotMocks.signAndSendManagedSolanaTransaction.mockResolvedValue({
      signature: "frog-purchase-signature",
      transactionId: "privy-transaction",
      referenceId: "me-buy:reference",
      caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = mockCandidateScanFetch(buyer, [
      ...staleCandidates,
      { mint: executableMint, price: 0.9 },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const response = await postMagicEdenBuyExecution(
      request(buyer, "900000000"),
      {
        MAGIC_EDEN_BUY_EXECUTION_ENABLED: "true",
        ME_API_KEY: "me-key",
        SOLANA_RPC_URL: "https://rpc.test",
      } as Env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "submitted",
      listing: { mint: executableMint, priceLamports: "900000000" },
    });
    const listingsUrl = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((url) => url.pathname.endsWith("/collections/solana_business_frogs/listings"));
    expect(listingsUrl?.searchParams.get("limit")).toBe("50");
    expect(tradingBotMocks.signAndSendManagedSolanaTransaction).toHaveBeenCalledTimes(1);
  });

  it("does not exceed the bounded floor preflight budget", async () => {
    const buyer = Keypair.generate().publicKey.toBase58();
    const staleCandidates = Array.from({ length: 21 }, () => ({
      mint: Keypair.generate().publicKey.toBase58(),
      price: 0.8,
      simulationError: { InstructionError: [3, { Custom: 3012 }] },
      simulationLogs: ["Program log: AccountNotInitialized"],
    }));
    const executableMint = Keypair.generate().publicKey.toBase58();
    tradingBotMocks.authorizeTradingBotRequest.mockReturnValue("allowed");
    tradingBotMocks.managedSolanaExecutionMissingRequirements.mockReturnValue([]);
    tradingBotMocks.getManagedPrivyWallet.mockResolvedValue({
      wallet: { walletId: "wallet-1", walletAddress: buyer },
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = mockCandidateScanFetch(buyer, [
      ...staleCandidates,
      { mint: executableMint, price: 0.9 },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const response = await postMagicEdenBuyExecution(
      request(buyer, "900000000"),
      {
        MAGIC_EDEN_BUY_EXECUTION_ENABLED: "true",
        ME_API_KEY: "me-key",
        SOLANA_RPC_URL: "https://rpc.test",
      } as Env,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "NO_EXECUTABLE_LISTINGS",
    });
    const buildCalls = fetchMock.mock.calls.filter(([input]) =>
      new URL(String(input)).pathname.endsWith("/instructions/mmm/sol-fulfill-sell"),
    );
    const simulationCalls = fetchMock.mock.calls.filter(
      ([input]) => new URL(String(input)).hostname === "rpc.test",
    );
    expect(buildCalls).toHaveLength(20);
    expect(simulationCalls).toHaveLength(20);
    expect(tradingBotMocks.signAndSendManagedSolanaTransaction).not.toHaveBeenCalled();
  });

  it("excludes seven purchased mints before applying the sweep preflight budget", async () => {
    const buyer = Keypair.generate().publicKey.toBase58();
    const staleCandidates = Array.from({ length: 13 }, () => ({
      mint: Keypair.generate().publicKey.toBase58(),
      price: 0.8,
      simulationError: { InstructionError: [3, { Custom: 3012 }] },
      simulationLogs: ["Program log: AccountNotInitialized"],
    }));
    const purchasedCandidates = Array.from({ length: 7 }, () => ({
      mint: Keypair.generate().publicKey.toBase58(),
      price: 0.8,
      simulationError: { InstructionError: [3, { Custom: 3012 }] },
      simulationLogs: ["Program log: AccountNotInitialized"],
    }));
    const executableMint = Keypair.generate().publicKey.toBase58();
    tradingBotMocks.authorizeTradingBotRequest.mockReturnValue("allowed");
    tradingBotMocks.managedSolanaExecutionMissingRequirements.mockReturnValue([]);
    tradingBotMocks.getManagedPrivyWallet.mockResolvedValue({
      wallet: { walletId: "wallet-1", walletAddress: buyer },
    });
    tradingBotMocks.signAndSendManagedSolanaTransaction.mockResolvedValue({
      signature: "frog-purchase-signature",
      transactionId: "privy-transaction",
      referenceId: "me-buy:reference",
      caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = mockCandidateScanFetch(buyer, [
      ...staleCandidates,
      ...purchasedCandidates,
      { mint: executableMint, price: 0.9 },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const response = await postMagicEdenBuyExecution(
      request(
        buyer,
        "900000000",
        undefined,
        purchasedCandidates.map(({ mint }) => mint),
      ),
      {
        MAGIC_EDEN_BUY_EXECUTION_ENABLED: "true",
        ME_API_KEY: "me-key",
        SOLANA_RPC_URL: "https://rpc.test",
      } as Env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "submitted",
      listing: { mint: executableMint },
    });
    const builtMints = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((url) => url.pathname.endsWith("/instructions/mmm/sol-fulfill-sell"))
      .map((url) => url.searchParams.get("assetMint"));
    expect(builtMints).toHaveLength(14);
    expect(builtMints).not.toEqual(
      expect.arrayContaining(purchasedCandidates.map(({ mint }) => mint)),
    );
    expect(builtMints.at(-1)).toBe(executableMint);
    expect(tradingBotMocks.signAndSendManagedSolanaTransaction).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid excluded sweep mints before requesting a listing", async () => {
    const buyer = Keypair.generate().publicKey.toBase58();
    tradingBotMocks.authorizeTradingBotRequest.mockReturnValue("allowed");
    tradingBotMocks.managedSolanaExecutionMissingRequirements.mockReturnValue([]);
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const response = await postMagicEdenBuyExecution(
      request(buyer, "900000000", undefined, ["not-a-solana-address"]),
      { MAGIC_EDEN_BUY_EXECUTION_ENABLED: "true" } as Env,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_BUY_REQUEST" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tradingBotMocks.getManagedPrivyWallet).not.toHaveBeenCalled();
  });

  it("never substitutes another Frog for an exact pictured purchase", async () => {
    const buyer = Keypair.generate().publicKey.toBase58();
    const picturedMint = Keypair.generate().publicKey.toBase58();
    const otherMint = Keypair.generate().publicKey.toBase58();
    tradingBotMocks.authorizeTradingBotRequest.mockReturnValue("allowed");
    tradingBotMocks.managedSolanaExecutionMissingRequirements.mockReturnValue([]);
    tradingBotMocks.getManagedPrivyWallet.mockResolvedValue({
      wallet: { walletId: "wallet-1", walletAddress: buyer },
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = mockCandidateScanFetch(buyer, [
      {
        mint: picturedMint,
        price: 0.8,
        simulationError: { InstructionError: [3, { Custom: 3012 }] },
        simulationLogs: ["Program log: AccountNotInitialized"],
      },
      { mint: otherMint, price: 0.9 },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const response = await postMagicEdenBuyExecution(
      request(buyer, "900000000", picturedMint),
      {
        MAGIC_EDEN_BUY_EXECUTION_ENABLED: "true",
        ME_API_KEY: "me-key",
        SOLANA_RPC_URL: "https://rpc.test",
      } as Env,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "PURCHASE_PREFLIGHT_REJECTED",
    });
    const builtMints = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((url) => url.pathname.endsWith("/instructions/mmm/sol-fulfill-sell"))
      .map((url) => url.searchParams.get("assetMint"));
    expect(builtMints).toEqual([picturedMint]);
    expect(tradingBotMocks.signAndSendManagedSolanaTransaction).not.toHaveBeenCalled();
  });

  it("does not move up in price after an unclassified instruction failure", async () => {
    const buyer = Keypair.generate().publicKey.toBase58();
    const rejectedMint = Keypair.generate().publicKey.toBase58();
    const higherMint = Keypair.generate().publicKey.toBase58();
    tradingBotMocks.authorizeTradingBotRequest.mockReturnValue("allowed");
    tradingBotMocks.managedSolanaExecutionMissingRequirements.mockReturnValue([]);
    tradingBotMocks.getManagedPrivyWallet.mockResolvedValue({
      wallet: { walletId: "wallet-1", walletAddress: buyer },
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = mockCandidateScanFetch(buyer, [
      {
        mint: rejectedMint,
        price: 0.8,
        simulationError: { InstructionError: [3, { Custom: 9999 }] },
        simulationLogs: ["Program log: unknown marketplace rejection"],
      },
      { mint: higherMint, price: 0.9 },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const response = await postMagicEdenBuyExecution(
      request(buyer, "900000000"),
      {
        MAGIC_EDEN_BUY_EXECUTION_ENABLED: "true",
        ME_API_KEY: "me-key",
        SOLANA_RPC_URL: "https://rpc.test",
      } as Env,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "PURCHASE_PREFLIGHT_REJECTED",
    });
    const builtMints = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((url) => url.pathname.endsWith("/instructions/mmm/sol-fulfill-sell"))
      .map((url) => url.searchParams.get("assetMint"));
    expect(builtMints).toEqual([rejectedMint]);
    expect(tradingBotMocks.signAndSendManagedSolanaTransaction).not.toHaveBeenCalled();
  });

  it("re-fetches the floor and rejects a listing above the approved cap", async () => {
    const buyer = Keypair.generate().publicKey.toBase58();
    tradingBotMocks.authorizeTradingBotRequest.mockReturnValue("allowed");
    tradingBotMocks.managedSolanaExecutionMissingRequirements.mockReturnValue([]);
    tradingBotMocks.getManagedPrivyWallet.mockResolvedValue({
      wallet: { walletId: "wallet-1", walletAddress: buyer },
    });
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json([
        { tokenMint: Keypair.generate().publicKey.toBase58(), price: 1.1 },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await postMagicEdenBuyExecution(
      request(buyer, "1000000000"),
      { MAGIC_EDEN_BUY_EXECUTION_ENABLED: "true" } as Env,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "FLOOR_ABOVE_CAP" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(tradingBotMocks.signAndSendManagedSolanaTransaction).not.toHaveBeenCalled();
  });

  it("enforces the approved cap against the live MMM pool price", async () => {
    const buyer = Keypair.generate().publicKey.toBase58();
    const mint = Keypair.generate().publicKey.toBase58();
    tradingBotMocks.authorizeTradingBotRequest.mockReturnValue("allowed");
    tradingBotMocks.managedSolanaExecutionMissingRequirements.mockReturnValue([]);
    tradingBotMocks.getManagedPrivyWallet.mockResolvedValue({
      wallet: { walletId: "wallet-1", walletAddress: buyer },
    });
    const fetchMock = mockCandidateScanFetch(buyer, [
      {
        mint,
        price: 0.031,
        poolPricing: {
          spotPrice: 40_000_000,
          curveType: "linear",
          curveDelta: 0,
          lpFeeBp: 0,
        },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const response = await postMagicEdenBuyExecution(
      request(buyer, "35000000"),
      {
        MAGIC_EDEN_BUY_EXECUTION_ENABLED: "true",
        ME_API_KEY: "me-key",
        SOLANA_RPC_URL: "https://rpc.test",
      } as Env,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "FLOOR_ABOVE_CAP" });
    expect(fetchMock.mock.calls).toHaveLength(2);
    expect(tradingBotMocks.signAndSendManagedSolanaTransaction).not.toHaveBeenCalled();
  });

  it("rejects the purchase when the pictured Frog is no longer the floor", async () => {
    const buyer = Keypair.generate().publicKey.toBase58();
    const picturedMint = Keypair.generate().publicKey.toBase58();
    const newFloorMint = Keypair.generate().publicKey.toBase58();
    tradingBotMocks.authorizeTradingBotRequest.mockReturnValue("allowed");
    tradingBotMocks.managedSolanaExecutionMissingRequirements.mockReturnValue([]);
    tradingBotMocks.getManagedPrivyWallet.mockResolvedValue({
      wallet: { walletId: "wallet-1", walletAddress: buyer },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Response.json([{ tokenMint: newFloorMint, price: 0.8 }]),
      ),
    );

    const response = await postMagicEdenBuyExecution(
      request(buyer, "800000000", picturedMint),
      { MAGIC_EDEN_BUY_EXECUTION_ENABLED: "true" } as Env,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "LISTING_CHANGED" });
    expect(tradingBotMocks.signAndSendManagedSolanaTransaction).not.toHaveBeenCalled();
  });

  it("returns a stable recovery code when Ribbot access is missing", async () => {
    const buyer = Keypair.generate().publicKey.toBase58();
    tradingBotMocks.authorizeTradingBotRequest.mockReturnValue("allowed");
    tradingBotMocks.managedSolanaExecutionMissingRequirements.mockReturnValue([]);
    tradingBotMocks.getManagedPrivyWallet.mockResolvedValue({
      error: "Ribbot access is not enabled for Spot & NFT Wallet (Privy)",
      status: 409,
      code: "RIBBOT_ACCESS_REQUIRED",
    });
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const response = await postMagicEdenBuyExecution(
      request(buyer, "800000000"),
      { MAGIC_EDEN_BUY_EXECUTION_ENABLED: "true" } as Env,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Ribbot access is not enabled for Spot & NFT Wallet (Privy)",
      code: "RIBBOT_ACCESS_REQUIRED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tradingBotMocks.signAndSendManagedSolanaTransaction).not.toHaveBeenCalled();
  });

  it("validates and submits one lowest-price MMM purchase through the managed wallet", async () => {
    const buyer = Keypair.generate();
    const seller = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const pool = Keypair.generate().publicKey;
    const transaction = new Transaction({
      feePayer: buyer.publicKey,
      recentBlockhash: Keypair.generate().publicKey.toBase58(),
    }).add(
      new TransactionInstruction({
        programId: new PublicKey(MMM_PROGRAM),
        keys: [
          { pubkey: buyer.publicKey, isSigner: true, isWritable: true },
          { pubkey: seller, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: true },
          { pubkey: pool, isSigner: false, isWritable: true },
        ],
        data: Buffer.alloc(0),
      }),
    );
    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    tradingBotMocks.authorizeTradingBotRequest.mockReturnValue("allowed");
    tradingBotMocks.managedSolanaExecutionMissingRequirements.mockReturnValue([]);
    tradingBotMocks.getManagedPrivyWallet.mockResolvedValue({
      wallet: {
        walletId: "wallet-1",
        walletAddress: buyer.publicKey.toBase58(),
      },
    });
    tradingBotMocks.signAndSendManagedSolanaTransaction.mockResolvedValue({
      signature: "frog-purchase-signature",
      transactionId: "privy-transaction",
      referenceId: "me-buy:reference",
      caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/collections/solana_business_frogs/listings")) {
          return Response.json([
            {
              tokenMint: mint.toBase58(),
              seller: seller.toBase58(),
              price: 0.8,
              listingSource: "mmm",
            },
            {
              tokenMint: Keypair.generate().publicKey.toBase58(),
              seller: Keypair.generate().publicKey.toBase58(),
              price: 1.2,
              listingSource: "mmm",
            },
          ]);
        }
        if (url.pathname.endsWith("/mmm/pools")) {
          return Response.json({
            results: [
              {
                poolKey: pool.toBase58(),
                poolType: "two_sided",
                mints: [mint.toBase58()],
                sellsideAssetAmount: 1,
                poolOwner: seller.toBase58(),
              },
            ],
          });
        }
        if (url.pathname.endsWith("/instructions/mmm/sol-fulfill-sell")) {
          expect(url.searchParams.get("assetMint")).toBe(mint.toBase58());
          expect(url.searchParams.get("maxPaymentAmount")).toBe("800000000");
          return Response.json({
            tx: Buffer.from(serialized).toString("base64"),
          });
        }
        if (url.hostname === "rpc.test") {
          const body = JSON.parse(String(init?.body)) as {
            method?: string;
            params?: unknown[];
          };
          expect(body.method).toBe("simulateTransaction");
          expect(body.params?.[0]).toBe(Buffer.from(serialized).toString("base64"));
          return Response.json({
            result: { context: { slot: 123 }, value: { err: null, logs: [] } },
          });
        }
        throw new Error(`Unexpected fetch: ${url.toString()}`);
      }),
    );

    const response = await postMagicEdenBuyExecution(
      request(buyer.publicKey.toBase58(), "800000000", mint.toBase58()),
      {
        MAGIC_EDEN_BUY_EXECUTION_ENABLED: "true",
        ME_API_KEY: "me-key",
        SOLANA_RPC_URL: "https://rpc.test",
      } as Env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "submitted",
      signature: "frog-purchase-signature",
      listing: { mint: mint.toBase58(), priceLamports: "800000000" },
    });
    expect(tradingBotMocks.signAndSendManagedSolanaTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        walletId: "wallet-1",
        transactionBase64: Buffer.from(serialized).toString("base64"),
      }),
    );
  });

  it("does not call Privy when Solana preflight rejects the purchase", async () => {
    const buyer = Keypair.generate().publicKey.toBase58();
    const mint = Keypair.generate().publicKey.toBase58();
    tradingBotMocks.authorizeTradingBotRequest.mockReturnValue("allowed");
    tradingBotMocks.managedSolanaExecutionMissingRequirements.mockReturnValue([]);
    tradingBotMocks.getManagedPrivyWallet.mockResolvedValue({
      wallet: { walletId: "wallet-1", walletAddress: buyer },
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      mockPurchaseFetch({
        buyer,
        mint,
        simulationError: { InstructionError: [3, { Custom: 3012 }] },
        simulationLogs: ["Program log: AccountNotInitialized"],
      }),
    );

    const response = await postMagicEdenBuyExecution(
      request(buyer, "800000000", mint),
      {
        MAGIC_EDEN_BUY_EXECUTION_ENABLED: "true",
        ME_API_KEY: "me-key",
        SOLANA_RPC_URL: "https://rpc.test",
      } as Env,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "The pictured floor Frog cannot be bought right now. Open a new floor quote",
      code: "PURCHASE_PREFLIGHT_REJECTED",
    });
    expect(tradingBotMocks.signAndSendManagedSolanaTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ["policy_violation", "Ribbot access does not allow"],
    ["transaction_broadcast_failure", "was not broadcast"],
  ])(
    "returns a terminal retry-safe error for Privy %s",
    async (providerCode, expectedMessage) => {
      const buyer = Keypair.generate().publicKey.toBase58();
      const mint = Keypair.generate().publicKey.toBase58();
      tradingBotMocks.authorizeTradingBotRequest.mockReturnValue("allowed");
      tradingBotMocks.managedSolanaExecutionMissingRequirements.mockReturnValue([]);
      tradingBotMocks.getManagedPrivyWallet.mockResolvedValue({
        wallet: { walletId: "wallet-1", walletAddress: buyer },
      });
      tradingBotMocks.signAndSendManagedSolanaTransaction.mockRejectedValue(
        new MockPrivyWalletRpcError(500, "http", providerCode),
      );
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      vi.stubGlobal(
        "fetch",
        mockPurchaseFetch({ buyer, mint }),
      );

      const response = await postMagicEdenBuyExecution(
        request(buyer, "800000000", mint),
        {
          MAGIC_EDEN_BUY_EXECUTION_ENABLED: "true",
          ME_API_KEY: "me-key",
          SOLANA_RPC_URL: "https://rpc.test",
        } as Env,
      );
      const data = (await response.json()) as {
        status: string;
        providerStatus: number | null;
        providerKind: string;
        providerCode: string;
        error: string;
      };

      expect(response.status).toBe(502);
      expect(data.status).toBe("rejected");
      expect(data.providerStatus).toBe(500);
      expect(data.providerKind).toBe("http");
      expect(data.providerCode).toBe(providerCode);
      expect(data.error).toContain(expectedMessage);
      expect(data).not.toHaveProperty("providerMessage");
      expect(data).not.toHaveProperty("responseBody");
    },
  );

  it("keeps backend purchase execution false by default", async () => {
    tradingBotMocks.authorizeTradingBotRequest.mockReturnValue("allowed");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const response = await postMagicEdenBuyExecution(
      new Request("https://frogx.test/frogs/execute-buy", { method: "POST" }),
      {} as Env,
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "EXECUTION_DISABLED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
