import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { afterEach, describe, expect, it, vi } from "vitest";

const privyMocks = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
  getUser: vi.fn(),
}));

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
      constructor(readonly status: number) {
        super(`Privy wallet RPC failed with status ${status}`);
      }
    },
);

vi.mock("@privy-io/node", () => ({
  PrivyClient: class {
    utils() {
      return {
        auth: () => ({
          verifyAccessToken: privyMocks.verifyAccessToken,
        }),
      };
    }

    users() {
      return { _get: privyMocks.getUser };
    }
  },
}));

vi.mock("./tradingBot", () => ({
  ...tradingBotMocks,
  PrivyWalletRpcError: MockPrivyWalletRpcError,
}));

import type { Env } from "./env";
import {
  postMagicEdenSellExecution,
  postMagicEdenSellTransaction,
  selectHighestLiveOffer,
} from "./magicEdenSell";
import { BUSINESS_FROG_COLLECTION } from "./nftHoldings";

const MMM_PROGRAM = "mmm3XBJg5gk8XJxEKBvdgptZz6SgK4tXvn36sodowMc";

const toBase64 = (value: Uint8Array) =>
  Buffer.from(value).toString("base64");

describe("Magic Eden sell transaction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    privyMocks.verifyAccessToken.mockReset();
    privyMocks.getUser.mockReset();
    Object.values(tradingBotMocks).forEach((mock) => mock.mockReset());
  });

  it("ignores expired and unfunded pools when selecting the highest offer", () => {
    const activePool = Keypair.generate().publicKey.toBase58();
    const offer = selectHighestLiveOffer(
      [
        {
          poolKey: Keypair.generate().publicKey.toBase58(),
          poolType: "buy_sided",
          spotPrice: 900_000_000,
          expiry: 1_700_000_000,
          buyOrdersAmount: 1,
          buysidePaymentAmount: 900_000_000,
          collectionSymbol: "solana_business_frogs",
        },
        {
          poolKey: Keypair.generate().publicKey.toBase58(),
          poolType: "buy_sided",
          spotPrice: 80_000_000,
          expiry: 0,
          buyOrdersAmount: 0,
          buysidePaymentAmount: 80_000_000,
          collectionSymbol: "solana_business_frogs",
        },
        {
          poolKey: activePool,
          poolType: "two_sided",
          spotPrice: 31_444_644,
          expiry: 0,
          buyOrdersAmount: 20,
          buysidePaymentAmount: 600_000_000,
          collectionSymbol: "solana_business_frogs",
          updatedAt: "2026-07-27T00:00:00.000Z",
        },
      ],
      "solana_business_frogs",
      new Date("2026-07-27T00:00:00.000Z"),
    );

    expect(offer).toEqual({
      pool: activePool,
      spotPriceLamports: "31444644",
      spotPriceSol: 0.031444644,
      minimumPaymentLamports: "29557965",
      minimumPaymentSol: 0.029557965,
      updatedAt: "2026-07-27T00:00:00.000Z",
    });
  });

  it("authenticates the exact embedded wallet and returns a seller-signable transaction", async () => {
    const seller = Keypair.generate();
    const mint = Keypair.generate().publicKey.toBase58();
    const pool = Keypair.generate().publicKey.toBase58();
    const transaction = new Transaction({
      feePayer: seller.publicKey,
      recentBlockhash: Keypair.generate().publicKey.toBase58(),
    }).add(
      new TransactionInstruction({
        programId: new (await import("@solana/web3.js")).PublicKey(MMM_PROGRAM),
        keys: [
          {
            pubkey: seller.publicKey,
            isSigner: true,
            isWritable: true,
          },
          {
            pubkey: new PublicKey(mint),
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: new PublicKey(pool),
            isSigner: false,
            isWritable: true,
          },
        ],
        data: Buffer.alloc(0),
      }),
    );
    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    privyMocks.verifyAccessToken.mockResolvedValue({
      user_id: "did:privy:test",
    });
    privyMocks.getUser.mockResolvedValue({
      linked_accounts: [
        {
          type: "wallet",
          chain_type: "solana",
          wallet_client_type: "privy",
          address: seller.publicKey.toBase58(),
        },
      ],
    });

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname === "rpc.test") {
        const rpc = JSON.parse(String(init?.body)) as {
          params: { ownerAddress: string; grouping: [string, string] };
        };
        expect(rpc.params.ownerAddress).toBe(seller.publicKey.toBase58());
        expect(rpc.params.grouping).toEqual([
          "collection",
          BUSINESS_FROG_COLLECTION,
        ]);
        return Response.json({
          result: {
            page: 1,
            limit: 50,
            total: 1,
            items: [
              {
                id: mint,
                ownership: { owner: seller.publicKey.toBase58() },
                grouping: [
                  {
                    group_key: "collection",
                    group_value: BUSINESS_FROG_COLLECTION,
                  },
                ],
                content: { metadata: { name: "SBF #42" } },
              },
            ],
          },
        });
      }
      if (url.pathname.endsWith("/mmm/pools")) {
        return Response.json({
          results: [
            {
              poolKey: pool,
              poolType: "two_sided",
              spotPrice: 31_444_644,
              expiry: 0,
              buyOrdersAmount: 20,
              buysidePaymentAmount: 600_000_000,
              collectionSymbol: "solana_business_frogs",
            },
          ],
        });
      }
      if (url.pathname.endsWith("/instructions/mmm/sol-fulfill-buy")) {
        expect(url.searchParams.get("pool")).toBe(pool);
        expect(url.searchParams.get("seller")).toBe(
          seller.publicKey.toBase58(),
        );
        expect(url.searchParams.get("assetMint")).toBe(mint);
        expect(url.searchParams.get("assetTokenAccount")).toBe(mint);
        expect(url.searchParams.get("minPaymentAmount")).toBe("0.029557965");
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer me-key",
        );
        return Response.json({ tx: toBase64(serialized) });
      }
      throw new Error(`Unexpected fetch: ${url.toString()}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await postMagicEdenSellTransaction(
      new Request(
        "https://frogx.test/api/frogx/magic-eden/sell-transaction",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer privy-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            walletAddress: seller.publicKey.toBase58(),
            mint,
          }),
        },
      ),
      {
        PRIVY_APP_ID: "app-id",
        PRIVY_APP_SECRET: "app-secret",
        SOLANA_RPC_URL: "https://rpc.test",
        ME_API_KEY: "me-key",
      } as Env,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      transaction: string;
      walletAddress: string;
      mint: string;
      offer: { pool: string };
    };
    expect(body.transaction).toBe(toBase64(serialized));
    expect(body.walletAddress).toBe(seller.publicKey.toBase58());
    expect(body.mint).toBe(mint);
    expect(body.offer.pool).toBe(pool);
    expect(privyMocks.verifyAccessToken).toHaveBeenCalledWith("privy-token");
    expect(privyMocks.getUser).toHaveBeenCalledWith("did:privy:test");
  });

  it("rejects unsigned requests before reading holdings or offers", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const response = await postMagicEdenSellTransaction(
      new Request(
        "https://frogx.test/api/frogx/magic-eden/sell-transaction",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: Keypair.generate().publicKey.toBase58(),
            mint: Keypair.generate().publicKey.toBase58(),
          }),
        },
      ),
      {
        PRIVY_APP_ID: "app-id",
        PRIVY_APP_SECRET: "app-secret",
      } as Env,
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("executes one verified Frog through the exact managed Privy wallet", async () => {
    const seller = Keypair.generate();
    const mint = Keypair.generate().publicKey.toBase58();
    const pool = Keypair.generate().publicKey.toBase58();
    const transaction = new Transaction({
      feePayer: seller.publicKey,
      recentBlockhash: Keypair.generate().publicKey.toBase58(),
    }).add(
      new TransactionInstruction({
        programId: new PublicKey(MMM_PROGRAM),
        keys: [
          {
            pubkey: seller.publicKey,
            isSigner: true,
            isWritable: true,
          },
          {
            pubkey: new PublicKey(mint),
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: new PublicKey(pool),
            isSigner: false,
            isWritable: true,
          },
        ],
        data: Buffer.alloc(0),
      }),
    );
    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    tradingBotMocks.authorizeTradingBotRequest.mockReturnValue("allowed");
    tradingBotMocks.managedSolanaExecutionMissingRequirements.mockReturnValue(
      [],
    );
    tradingBotMocks.getManagedPrivyWallet.mockResolvedValue({
      wallet: {
        walletId: "privy-wallet-2",
        walletAddress: seller.publicKey.toBase58(),
        label: "Wallet 2",
      },
    });
    tradingBotMocks.signAndSendManagedSolanaTransaction.mockResolvedValue({
      signature: "5xMagicEdenSale",
      transactionId: "privy-transaction",
      referenceId: "me-sell:reference",
      caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input, init) => {
        const url = new URL(String(input));
        if (url.hostname === "rpc.test") {
          return Response.json({
            result: {
              page: 1,
              limit: 50,
              total: 1,
              items: [
                {
                  id: mint,
                  ownership: { owner: seller.publicKey.toBase58() },
                  grouping: [
                    {
                      group_key: "collection",
                      group_value: BUSINESS_FROG_COLLECTION,
                    },
                  ],
                  content: { metadata: { name: "SBF #42" } },
                },
              ],
            },
          });
        }
        if (url.pathname.endsWith("/mmm/pools")) {
          return Response.json({
            results: [
              {
                poolKey: pool,
                poolType: "two_sided",
                spotPrice: 31_444_644,
                expiry: 0,
                buyOrdersAmount: 20,
                buysidePaymentAmount: 600_000_000,
                collectionSymbol: "solana_business_frogs",
              },
            ],
          });
        }
        if (url.pathname.endsWith("/instructions/mmm/sol-fulfill-buy")) {
          expect(url.searchParams.get("assetMint")).toBe(mint);
          expect(url.searchParams.get("pool")).toBe(pool);
          expect(new Headers(init?.headers).get("Authorization")).toBe(
            "Bearer me-key",
          );
          return Response.json({ tx: toBase64(serialized) });
        }
        throw new Error(`Unexpected fetch: ${url.toString()}`);
      }),
    );

    const response = await postMagicEdenSellExecution(
      new Request("https://frogx.test/api/frogx/magic-eden/execute-sell", {
        method: "POST",
        headers: {
          Authorization: "Bearer backend-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          telegramUserId: "1640077203",
          walletAddress: seller.publicKey.toBase58(),
          mint,
          executionId: "frog-1",
          minimumPaymentLamports: "29557965",
        }),
      }),
      {
        MAGIC_EDEN_SELL_EXECUTION_ENABLED: "true",
        SOLANA_RPC_URL: "https://rpc.test",
        ME_API_KEY: "me-key",
      } as Env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "executed",
      signature: "5xMagicEdenSale",
      mint,
      walletAddress: seller.publicKey.toBase58(),
    });
    expect(
      tradingBotMocks.signAndSendManagedSolanaTransaction,
    ).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        walletId: "privy-wallet-2",
        transactionBase64: toBase64(serialized),
      }),
    );
  });

  it("keeps backend execution false by default", async () => {
    tradingBotMocks.authorizeTradingBotRequest.mockReturnValue("allowed");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const response = await postMagicEdenSellExecution(
      new Request("https://frogx.test/api/frogx/magic-eden/execute-sell", {
        method: "POST",
      }),
      {} as Env,
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "EXECUTION_DISABLED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      tradingBotMocks.signAndSendManagedSolanaTransaction,
    ).not.toHaveBeenCalled();
  });
});
