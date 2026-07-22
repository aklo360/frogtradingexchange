import { afterEach, describe, expect, it, vi } from "vitest";

import { getNftFloor, postNftBuyFloor, postNftExecuteFloor } from "./nfts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("NFT market routes", () => {
  it("normalizes Magic Eden stats and floor listing data", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/stats")) {
        return Response.json({
          floorPrice: 2_000_000_000,
          listedCount: 12,
          avgPrice24hr: 2_100_000_000,
          volumeAll: 987_000_000_000,
        });
      }
      return Response.json([
        {
          tokenMint: "FrogMint111111111111111111111111111111111111",
          price: 2.1,
          seller: "Seller1111111111111111111111111111111111111",
          name: "Business Frog #1",
          image: "https://example.com/frog.png",
          listingSource: "magic_eden",
        },
      ]);
    }) as typeof fetch;

    const response = await getNftFloor(
      new Request("https://frogx.test/api/frogx/nfts/floor"),
      {},
    );
    const body = (await response.json()) as {
      collectionSymbol: string;
      floorSol: number;
      listedCount: number;
      lowestListing: { tokenMint: string; priceSol: number };
    };

    expect(response.status).toBe(200);
    expect(body.collectionSymbol).toBe("solana_business_frogs");
    expect(body.floorSol).toBe(2);
    expect(body.listedCount).toBe(12);
    expect(body.lowestListing.tokenMint).toBe(
      "FrogMint111111111111111111111111111111111111",
    );
    expect(body.lowestListing.priceSol).toBe(2.1);
  });

  it("returns multiple floor listings when a sweep limit is requested", async () => {
    const requestedUrls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("/stats")) {
        return Response.json({
          floorPrice: 2_000_000_000,
          listedCount: 12,
        });
      }
      return Response.json([
        {
          tokenMint: "FrogMint111111111111111111111111111111111111",
          price: 2,
        },
        {
          tokenMint: "FrogMint222222222222222222222222222222222222",
          price: 2.1,
        },
        {
          tokenMint: "FrogMint333333333333333333333333333333333333",
          price: 2.2,
        },
        {
          tokenMint: "FrogMint444444444444444444444444444444444444",
          price: 2.3,
        },
      ]);
    }) as typeof fetch;

    const response = await getNftFloor(
      new Request("https://frogx.test/api/frogx/nfts/floor?limit=3"),
      {},
    );
    const body = (await response.json()) as {
      listingLimit: number;
      listings: Array<{ tokenMint: string; priceSol: number }>;
    };

    expect(response.status).toBe(200);
    expect(requestedUrls.some((url) => url.includes("limit=3"))).toBe(true);
    expect(body.listingLimit).toBe(3);
    expect(body.listings).toHaveLength(3);
    expect(body.listings[2].priceSol).toBe(2.2);
  });

  it("prepares Magic Eden buy-floor transactions for the buyer wallet", async () => {
    const buyer = "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf";
    const seller = "FrogSeller111111111111111111111111111111111";
    const buyNowUrls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/stats")) {
        return Response.json({
          floorPrice: 200_000_000,
          listedCount: 12,
        });
      }
      if (url.includes("/listings")) {
        return Response.json([
          {
            tokenMint: "So11111111111111111111111111111111111111112",
            tokenAccount: "TokenAta1111111111111111111111111111111111",
            seller,
            auctionHouseAddress: "Auction1111111111111111111111111111111111",
            price: 0.2,
          },
          {
            tokenMint: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            tokenAccount: "TokenAta2222222222222222222222222222222222",
            seller,
            price: 0.21,
          },
        ]);
      }
      if (url.includes("/instructions/buy_now")) {
        buyNowUrls.push(url);
        return Response.json({ tx: btoa("\x01\x02\x03") });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const response = await postNftBuyFloor(
      new Request("https://frogx.test/api/frogx/nfts/buy-floor", {
        method: "POST",
        body: JSON.stringify({
          buyer,
          quantity: 2,
          intentId: "intent-123",
        }),
      }),
      {},
    );
    const body = (await response.json()) as {
      buyer: string;
      quantity: number;
      estimatedTotalSol: number;
      transactions: Array<{
        tokenMint: string;
        priceSol: number;
        transactionBase64: string;
      }>;
    };

    expect(response.status).toBe(200);
    expect(body.buyer).toBe(buyer);
    expect(body.quantity).toBe(2);
    expect(body.estimatedTotalSol).toBe(0.41);
    expect(body.transactions).toHaveLength(2);
    expect(body.transactions[0].transactionBase64).toBe("AQID");
    expect(buyNowUrls).toHaveLength(2);

    const firstBuy = new URL(buyNowUrls[0]);
    expect(firstBuy.searchParams.get("buyer")).toBe(buyer);
    expect(firstBuy.searchParams.get("seller")).toBe(seller);
    expect(firstBuy.searchParams.get("tokenMint")).toBe(
      "So11111111111111111111111111111111111111112",
    );
    expect(firstBuy.searchParams.get("tokenATA")).toBe(
      "TokenAta1111111111111111111111111111111111",
    );
    expect(firstBuy.searchParams.get("price")).toBe("0.2");
    expect(firstBuy.searchParams.get("sellerExpiry")).toBe("0");
  });

  it("can prepare a buy-floor quote for one exact listed mint", async () => {
    const buyer = "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf";
    const exactMint = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    const buyNowUrls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/listings")) {
        return Response.json([
          {
            tokenMint: "So11111111111111111111111111111111111111112",
            tokenAccount: "TokenAta1111111111111111111111111111111111",
            seller: "FrogSeller111111111111111111111111111111111",
            price: 0.2,
          },
          {
            tokenMint: exactMint,
            tokenAccount: "TokenAta2222222222222222222222222222222222",
            seller: "FrogSeller222222222222222222222222222222222",
            price: 0.21,
          },
        ]);
      }
      if (url.includes("/instructions/buy_now")) {
        buyNowUrls.push(url);
        return Response.json({ tx: btoa("\x02") });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const response = await postNftBuyFloor(
      new Request("https://frogx.test/api/frogx/nfts/buy-floor", {
        method: "POST",
        body: JSON.stringify({
          buyer,
          quantity: 1,
          expectedTokenMint: exactMint,
        }),
      }),
      {},
    );
    const body = (await response.json()) as {
      estimatedTotalSol: number;
      transactions: Array<{ tokenMint: string; priceSol: number }>;
    };

    expect(response.status).toBe(200);
    expect(body.estimatedTotalSol).toBe(0.21);
    expect(body.transactions).toHaveLength(1);
    expect(body.transactions[0].tokenMint).toBe(exactMint);
    expect(body.transactions[0].priceSol).toBe(0.21);
    expect(buyNowUrls).toHaveLength(1);
    expect(new URL(buyNowUrls[0]).searchParams.get("tokenMint")).toBe(exactMint);
  });

  it("fails closed when only lower candidates are stale and a higher quote exists", async () => {
    const buyer = "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf";
    const buyNowUrls: string[] = [];
    const simulationTransactions: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/stats")) {
        return Response.json({
          floorPrice: 200_000_000,
          listedCount: 12,
        });
      }
      if (url.includes("/listings")) {
        return Response.json([
          {
            tokenMint: "So11111111111111111111111111111111111111112",
            tokenAccount: "TokenAta1111111111111111111111111111111111",
            seller: "FrogSeller111111111111111111111111111111111",
            name: "Stale Frog",
            price: 0.2,
          },
          {
            tokenMint: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            tokenAccount: "TokenAta2222222222222222222222222222222222",
            seller: "FrogSeller222222222222222222222222222222222",
            name: "Executable Frog",
            price: 0.21,
          },
        ]);
      }
      if (url.includes("/instructions/buy_now")) {
        buyNowUrls.push(url);
        return Response.json({
          tx: buyNowUrls.length === 1 ? btoa("\x01") : btoa("\x02"),
        });
      }
      if (url.startsWith("https://rpc.test")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          params?: [string];
        };
        const transaction = body.params?.[0] ?? "";
        simulationTransactions.push(transaction);
        if (transaction === "AQ==") {
          return Response.json({
            result: {
              context: { slot: 1 },
              value: {
                err: { InstructionError: [1, { Custom: 3012 }] },
                logs: ["stale MMM listing"],
              },
            },
          });
        }
        return Response.json({
          result: {
            context: { slot: 2 },
            value: { err: null, logs: [] },
          },
        });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const response = await postNftBuyFloor(
      new Request("https://frogx.test/api/frogx/nfts/buy-floor", {
        method: "POST",
        body: JSON.stringify({
          buyer,
          quantity: 1,
        }),
      }),
      {
        FROGX_NFT_PREFLIGHT_ENABLED: "true",
        FROGX_NFT_PREFLIGHT_SCAN_LIMIT: "2",
        SOLANA_RPC_URL: "https://rpc.test",
      },
    );
    const body = (await response.json()) as {
      error: string;
      code: string;
      selectedPriceSol: number;
      lowestBlockedPriceSol: number;
      estimatedTotalSol: number;
      transactions: Array<{ priceSol: number; transactionBase64: string }>;
      rejectedSummary: Array<{ reason: string; count: number }>;
    };

    expect(response.status).toBe(409);
    expect(body.error).toBe(
      "Magic Eden floor listings are stale; no higher-price fallback was staged",
    );
    expect(body.code).toBe("LOWER_FLOOR_NOT_EXECUTABLE");
    expect(body.selectedPriceSol).toBe(0.21);
    expect(body.lowestBlockedPriceSol).toBe(0.2);
    expect(body.rejectedSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "stale_marketplace", count: 1 }),
      ]),
    );
    expect(buyNowUrls).toHaveLength(2);
    expect(simulationTransactions).toEqual(["AQ==", "Ag=="]);
  });

  it("returns low-SOL wallet blocker when preflight cannot find the buyer account", async () => {
    const buyer = "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf";
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/stats")) {
        return Response.json({ floorPrice: 200_000_000, listedCount: 12 });
      }
      if (url.includes("/listings")) {
        return Response.json([
          {
            tokenMint: "So11111111111111111111111111111111111111112",
            tokenAccount: "TokenAta1111111111111111111111111111111111",
            seller: "FrogSeller111111111111111111111111111111111",
            price: 0.2,
          },
        ]);
      }
      if (url.includes("/instructions/buy_now")) {
        return Response.json({ tx: btoa("\x01") });
      }
      if (url.startsWith("https://rpc.test")) {
        JSON.parse(String(init?.body ?? "{}"));
        return Response.json({
          result: {
            context: { slot: 1 },
            value: { err: "AccountNotFound", logs: [] },
          },
        });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const response = await postNftBuyFloor(
      new Request("https://frogx.test/api/frogx/nfts/buy-floor", {
        method: "POST",
        body: JSON.stringify({ buyer, quantity: 1 }),
      }),
      {
        FROGX_NFT_PREFLIGHT_ENABLED: "true",
        FROGX_NFT_PREFLIGHT_SCAN_LIMIT: "1",
        SOLANA_RPC_URL: "https://rpc.test",
      },
    );
    const body = (await response.json()) as {
      error: string;
      code: string;
      layer: string;
      detail: string;
    };

    expect(response.status).toBe(402);
    expect(body.error).toBe("Insufficient SOL in FTX trade wallet");
    expect(body.code).toBe("INSUFFICIENT_SOL");
    expect(body.layer).toBe("wallet");
    expect(body.detail).toMatch(/AccountNotFound/i);
  });

  it("stops on buyer wallet funding errors without blocking the MMM pool", async () => {
    const buyer = "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf";
    const seller = "FrogSeller111111111111111111111111111111111";
    const floorMints = ["FloorMint01", "FloorMint02", "FloorMint03"];
    const fulfillUrls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/listings")) {
        return Response.json(
          floorMints.map((tokenMint) => ({
            tokenMint,
            seller,
            price: 0.032,
            listingSource: "MMM",
          })),
        );
      }
      if (url.includes("/mmm/pools")) {
        return Response.json({
          results: [
            {
              poolKey: "MmmPool11111111111111111111111111111111111",
              poolType: "two_sided",
              mints: floorMints,
              sellsideAssetAmount: 3,
              buysideCreatorRoyaltyBp: 100,
              poolOwner: seller,
            },
          ],
        });
      }
      if (url.includes("/instructions/mmm/sol-fulfill-sell")) {
        fulfillUrls.push(url);
        return Response.json({
          tx: fulfillUrls.length === 1 ? btoa("\x01") : btoa("\x02"),
        });
      }
      if (url.startsWith("https://rpc.test")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          params?: [string];
        };
        const transaction = body.params?.[0] ?? "";
        if (transaction === "AQ==") {
          return Response.json({
            result: {
              context: { slot: 1 },
              value: {
                err: { InstructionError: [1, { Custom: 3012 }] },
                logs: ["Program log: AnchorError caused by account: sell_state"],
              },
            },
          });
        }
        return Response.json({
          result: {
            context: { slot: 2 },
            value: {
              err: { InstructionError: [1, { Custom: 1 }] },
              logs: ["Transfer: insufficient lamports 1000, need 32000000"],
            },
          },
        });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const response = await postNftBuyFloor(
      new Request("https://frogx.test/api/frogx/nfts/buy-floor", {
        method: "POST",
        body: JSON.stringify({ buyer, quantity: 1 }),
      }),
      {
        FROGX_NFT_PREFLIGHT_ENABLED: "true",
        FROGX_NFT_PREFLIGHT_SCAN_LIMIT: "3",
        SOLANA_RPC_URL: "https://rpc.test",
      },
    );
    const body = (await response.json()) as {
      error: string;
      code: string;
      layer: string;
      detail: string;
    };

    expect(response.status).toBe(402);
    expect(body.error).toBe("Insufficient SOL in FTX trade wallet");
    expect(body.code).toBe("INSUFFICIENT_SOL");
    expect(body.layer).toBe("wallet");
    expect(body.detail).toMatch(/insufficient lamports/i);
    expect(fulfillUrls).toHaveLength(2);
  });

  it("returns a stale-marketplace blocker when all floor candidates reject on sell_state", async () => {
    const buyer = "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf";
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/stats")) {
        return Response.json({ floorPrice: 200_000_000, listedCount: 12 });
      }
      if (url.includes("/listings")) {
        return Response.json([
          {
            tokenMint: "So11111111111111111111111111111111111111112",
            tokenAccount: "TokenAta1111111111111111111111111111111111",
            seller: "FrogSeller111111111111111111111111111111111",
            price: 0.2,
          },
          {
            tokenMint: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            tokenAccount: "TokenAta2222222222222222222222222222222222",
            seller: "FrogSeller222222222222222222222222222222222",
            price: 0.21,
          },
        ]);
      }
      if (url.includes("/instructions/buy_now")) {
        return Response.json({ tx: btoa("\x01") });
      }
      if (url.startsWith("https://rpc.test")) {
        return Response.json({
          result: {
            context: { slot: 1 },
            value: {
              err: { InstructionError: [1, { Custom: 3012 }] },
              logs: [
                "Program log: AnchorError caused by account: sell_state",
                "Program log: Error Code: AccountNotInitialized",
              ],
            },
          },
        });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const response = await postNftBuyFloor(
      new Request("https://frogx.test/api/frogx/nfts/buy-floor", {
        method: "POST",
        body: JSON.stringify({ buyer, quantity: 1 }),
      }),
      {
        FROGX_NFT_PREFLIGHT_ENABLED: "true",
        FROGX_NFT_PREFLIGHT_SCAN_LIMIT: "2",
        SOLANA_RPC_URL: "https://rpc.test",
      },
    );
    const body = (await response.json()) as {
      error: string;
      code: string;
      layer: string;
      rejected: unknown[];
    };

    expect(response.status).toBe(409);
    expect(body.error).toBe("Marketplace floor listings are stale");
    expect(body.code).toBe("STALE_MARKETPLACE_LISTINGS");
    expect(body.layer).toBe("marketplace");
    expect(body.rejected).toHaveLength(2);
  });

  it("keeps trying same-price MMM floor mints after one stale sell_state", async () => {
    const buyer = "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf";
    const seller = "FrogSeller111111111111111111111111111111111";
    const fulfillUrls: string[] = [];
    const simulationTransactions: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/listings")) {
        const offset = new URL(url).searchParams.get("offset");
        if (offset !== "0") return Response.json([]);
        return Response.json([
          {
            tokenMint: "So11111111111111111111111111111111111111112",
            seller,
            name: "Stale Same-Floor MMM Frog",
            price: 0.032,
            listingSource: "MMM",
          },
          {
            tokenMint: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            seller,
            name: "Executable Same-Floor MMM Frog",
            price: 0.032,
            listingSource: "MMM",
          },
        ]);
      }
      if (url.includes("/mmm/pools")) {
        return Response.json({
          results: [
            {
              poolKey: "MmmPool11111111111111111111111111111111111",
              poolType: "two_sided",
              mints: [
                "So11111111111111111111111111111111111111112",
                "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
              ],
              sellsideAssetAmount: 2,
              buysideCreatorRoyaltyBp: 100,
              poolOwner: seller,
            },
          ],
        });
      }
      if (url.includes("/instructions/mmm/sol-fulfill-sell")) {
        fulfillUrls.push(url);
        return Response.json({
          tx: fulfillUrls.length === 1 ? btoa("\x01") : btoa("\x02"),
        });
      }
      if (url.startsWith("https://rpc.test")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          params?: [string];
        };
        const transaction = body.params?.[0] ?? "";
        simulationTransactions.push(transaction);
        if (transaction === "AQ==") {
          return Response.json({
            result: {
              context: { slot: 1 },
              value: {
                err: { InstructionError: [1, { Custom: 3012 }] },
                logs: ["Program log: AnchorError caused by account: sell_state"],
              },
            },
          });
        }
        return Response.json({
          result: {
            context: { slot: 2 },
            value: { err: null, logs: [] },
          },
        });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const response = await postNftBuyFloor(
      new Request("https://frogx.test/api/frogx/nfts/buy-floor", {
        method: "POST",
        body: JSON.stringify({ buyer, quantity: 1 }),
      }),
      {
        FROGX_NFT_PREFLIGHT_ENABLED: "true",
        FROGX_NFT_LISTING_SCAN_LIMIT: "2",
        FROGX_NFT_PREFLIGHT_SCAN_LIMIT: "2",
        SOLANA_RPC_URL: "https://rpc.test",
      },
    );
    const body = (await response.json()) as {
      estimatedTotalSol: number;
      transactions: Array<{
        tokenMint: string;
        priceSol: number;
        transactionBase64: string;
      }>;
      rejected: unknown[];
    };

    expect(response.status).toBe(200);
    expect(body.estimatedTotalSol).toBe(0.032);
    expect(body.transactions).toHaveLength(1);
    expect(body.transactions[0].tokenMint).toBe(
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    );
    expect(body.transactions[0].priceSol).toBe(0.032);
    expect(body.transactions[0].transactionBase64).toBe("Ag==");
    expect(body.rejected).toHaveLength(1);
    expect(fulfillUrls).toHaveLength(2);
    expect(simulationTransactions).toEqual(["AQ==", "Ag=="]);
  });

  it("fails closed instead of using a higher quote when a stale MMM wall blocks the floor", async () => {
    const buyer = "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf";
    const staleSeller = "FrogSeller111111111111111111111111111111111";
    const m2Seller = "FrogSeller222222222222222222222222222222222";
    const fulfillUrls: string[] = [];
    const buyNowUrls: string[] = [];
    const simulationTransactions: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/listings")) {
        const offset = new URL(url).searchParams.get("offset");
        if (offset === "0") {
          return Response.json([
            {
              tokenMint: "So11111111111111111111111111111111111111112",
              seller: staleSeller,
              name: "Stale MMM Frog 1",
              price: 0.032,
              listingSource: "MMM",
            },
            {
              tokenMint: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
              seller: staleSeller,
              name: "Stale MMM Frog 2",
              price: 0.033,
              listingSource: "MMM",
            },
          ]);
        }
        if (offset === "100") {
          return Response.json([
            {
              tokenMint: "11111111111111111111111111111111",
              tokenAccount: "TokenAta3333333333333333333333333333333333",
              seller: m2Seller,
              name: "Executable M2 Frog 1",
              price: 0.06,
              listingSource: "M2",
            },
            {
              tokenMint: "Sysvar1111111111111111111111111111111111111",
              tokenAccount: "TokenAta4444444444444444444444444444444444",
              seller: m2Seller,
              name: "Executable M2 Frog 2",
              price: 0.07,
              listingSource: "M2",
            },
          ]);
        }
        return Response.json([]);
      }
      if (url.includes("/mmm/pools")) {
        return Response.json({
          results: [
            {
              poolKey: "MmmPool11111111111111111111111111111111111",
              poolType: "two_sided",
              mints: [
                "So11111111111111111111111111111111111111112",
                "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
              ],
              sellsideAssetAmount: 2,
              buysideCreatorRoyaltyBp: 100,
              poolOwner: staleSeller,
            },
          ],
        });
      }
      if (url.includes("/instructions/mmm/sol-fulfill-sell")) {
        fulfillUrls.push(url);
        return Response.json({ tx: btoa("\x01") });
      }
      if (url.includes("/instructions/buy_now")) {
        buyNowUrls.push(url);
        return Response.json({
          tx: buyNowUrls.length === 1 ? btoa("\x02") : btoa("\x03"),
        });
      }
      if (url.startsWith("https://rpc.test")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          params?: [string];
        };
        const transaction = body.params?.[0] ?? "";
        simulationTransactions.push(transaction);
        if (transaction === "AQ==") {
          return Response.json({
            result: {
              context: { slot: 1 },
              value: {
                err: { InstructionError: [1, { Custom: 3012 }] },
                logs: ["Program log: AnchorError caused by account: sell_state"],
              },
            },
          });
        }
        return Response.json({
          result: {
            context: { slot: 2 },
            value: { err: null, logs: [] },
          },
        });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const response = await postNftBuyFloor(
      new Request("https://frogx.test/api/frogx/nfts/buy-floor", {
        method: "POST",
        body: JSON.stringify({ buyer, quantity: 2 }),
      }),
      {
        FROGX_NFT_PREFLIGHT_ENABLED: "true",
        FROGX_NFT_LISTING_SCAN_LIMIT: "150",
        SOLANA_RPC_URL: "https://rpc.test",
      },
    );
    const body = (await response.json()) as {
      error: string;
      code: string;
      selectedPriceSol: number | null;
      lowestBlockedPriceSol: number;
      rejectedSummary: Array<{ reason: string; count: number }>;
    };

    expect(response.status).toBe(409);
    expect(body.error).toBe(
      "Magic Eden floor listings are stale; no higher-price fallback was staged",
    );
    expect(body.code).toBe("LOWER_FLOOR_NOT_EXECUTABLE");
    expect(body.selectedPriceSol).toBe(0.06);
    expect(body.lowestBlockedPriceSol).toBe(0.032);
    expect(body.rejectedSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "stale_marketplace", count: 2 }),
      ]),
    );
    expect(fulfillUrls).toHaveLength(2);
    expect(buyNowUrls).toHaveLength(2);
    expect(simulationTransactions).toEqual(["AQ==", "AQ==", "Ag==", "Aw=="]);
  });

  it("keeps scanning same-price MMM floor mints after several stale sell_states", async () => {
    const buyer = "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf";
    const staleSeller = "FrogSeller111111111111111111111111111111111";
    const floorMints = Array.from(
      { length: 22 },
      (_, index) => `FrogFloorMint${String(index + 1).padStart(2, "0")}`,
    );
    const fulfillUrls: string[] = [];
    const buyNowUrls: string[] = [];
    const simulationTransactions: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/listings")) {
        const offset = new URL(url).searchParams.get("offset");
        if (offset === "0") {
          return Response.json(
            floorMints.map((tokenMint, index) => ({
              tokenMint,
              seller: staleSeller,
              name:
                index === floorMints.length - 1
                  ? "Executable Same-Floor Frog"
                  : `Stale Floor Pool Frog ${index + 1}`,
              price: 0.032,
              listingSource: "MMM",
            })),
          );
        }
        return Response.json([]);
      }
      if (url.includes("/mmm/pools")) {
        return Response.json({
          results: [
            {
              poolKey: "MmmPool11111111111111111111111111111111111",
              poolType: "two_sided",
              mints: floorMints,
              sellsideAssetAmount: 2,
              buysideCreatorRoyaltyBp: 100,
              poolOwner: staleSeller,
            },
          ],
        });
      }
      if (url.includes("/instructions/mmm/sol-fulfill-sell")) {
        fulfillUrls.push(url);
        return Response.json({
          tx: fulfillUrls.length < floorMints.length ? btoa("\x01") : btoa("\x02"),
        });
      }
      if (url.includes("/instructions/buy_now")) {
        buyNowUrls.push(url);
        return Response.json({ tx: btoa("\x03") });
      }
      if (url.startsWith("https://rpc.test")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          params?: [string];
        };
        const transaction = body.params?.[0] ?? "";
        simulationTransactions.push(transaction);
        if (transaction === "AQ==") {
          return Response.json({
            result: {
              context: { slot: 1 },
              value: {
                err: { InstructionError: [1, { Custom: 3012 }] },
                logs: ["Program log: AnchorError caused by account: sell_state"],
              },
            },
          });
        }
        return Response.json({
          result: {
            context: { slot: 2 },
            value: { err: null, logs: [] },
          },
        });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const response = await postNftBuyFloor(
      new Request("https://frogx.test/api/frogx/nfts/buy-floor", {
        method: "POST",
        body: JSON.stringify({ buyer, quantity: 1 }),
      }),
      {
        FROGX_NFT_PREFLIGHT_ENABLED: "true",
        FROGX_NFT_PREFLIGHT_SCAN_LIMIT: "25",
        FROGX_NFT_LISTING_SCAN_LIMIT: "150",
        SOLANA_RPC_URL: "https://rpc.test",
      },
    );
    const body = (await response.json()) as {
      estimatedTotalSol: number;
      transactions: Array<{
        priceSol: number;
        source: string | null;
        transactionBase64: string;
      }>;
      rejected: unknown[];
      rejectedSummary: Array<{ reason: string; count: number }>;
    };

    expect(response.status).toBe(200);
    expect(body.estimatedTotalSol).toBe(0.032);
    expect(body.transactions).toHaveLength(1);
    expect(body.transactions[0].priceSol).toBe(0.032);
    expect(body.transactions[0].source).toBe("MMM");
    expect(body.transactions[0].transactionBase64).toBe("Ag==");
    expect(body.rejected).toHaveLength(5);
    expect(body.rejectedSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "stale_marketplace", count: 21 }),
      ]),
    );
    expect(fulfillUrls).toHaveLength(floorMints.length);
    expect(buyNowUrls).toHaveLength(0);
    expect(simulationTransactions).toEqual([
      ...Array<string>(floorMints.length - 1).fill("AQ=="),
      "Ag==",
    ]);
  });

  it("continues through a same-price MMM mint rejection without blocking the pool", async () => {
    const buyer = "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf";
    const seller = "FrogSeller111111111111111111111111111111111";
    const floorMints = Array.from(
      { length: 14 },
      (_, index) => `FrogFloorMint${String(index + 1).padStart(2, "0")}`,
    );
    const fulfillUrls: string[] = [];
    const simulationTransactions: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/listings")) {
        const offset = new URL(url).searchParams.get("offset");
        if (offset !== "0") return Response.json([]);
        return Response.json(
          floorMints.map((tokenMint, index) => ({
            tokenMint,
            seller,
            name: `Floor Frog ${index + 1}`,
            price: 0.032,
            listingSource: "MMM",
          })),
        );
      }
      if (url.includes("/mmm/pools")) {
        return Response.json({
          results: [
            {
              poolKey: "MmmPool11111111111111111111111111111111111",
              poolType: "two_sided",
              mints: floorMints,
              sellsideAssetAmount: floorMints.length,
              buysideCreatorRoyaltyBp: 100,
              poolOwner: seller,
            },
          ],
        });
      }
      if (url.includes("/instructions/mmm/sol-fulfill-sell")) {
        fulfillUrls.push(url);
        if (fulfillUrls.length <= 11) return Response.json({ tx: btoa("\x01") });
        if (fulfillUrls.length === 12) return Response.json({ tx: btoa("\x02") });
        return Response.json({ tx: btoa("\x03") });
      }
      if (url.startsWith("https://rpc.test")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          params?: [string];
        };
        const transaction = body.params?.[0] ?? "";
        simulationTransactions.push(transaction);
        if (transaction === "AQ==") {
          return Response.json({
            result: {
              context: { slot: 1 },
              value: {
                err: { InstructionError: [1, { Custom: 3012 }] },
                logs: ["Program log: AnchorError caused by account: sell_state"],
              },
            },
          });
        }
        if (transaction === "Ag==") {
          return Response.json({
            result: {
              context: { slot: 2 },
              value: {
                err: { InstructionError: [1, { Custom: 6009 }] },
                logs: ["Program log: Error Code: InvalidPaymentMint"],
              },
            },
          });
        }
        return Response.json({
          result: {
            context: { slot: 3 },
            value: { err: null, logs: [] },
          },
        });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const response = await postNftBuyFloor(
      new Request("https://frogx.test/api/frogx/nfts/buy-floor", {
        method: "POST",
        body: JSON.stringify({ buyer, quantity: 1 }),
      }),
      {
        FROGX_NFT_PREFLIGHT_ENABLED: "true",
        FROGX_NFT_PREFLIGHT_SCAN_LIMIT: "14",
        SOLANA_RPC_URL: "https://rpc.test",
      },
    );
    const body = (await response.json()) as {
      estimatedTotalSol: number;
      transactions: Array<{ priceSol: number; source: string | null; transactionBase64: string }>;
      rejectedSummary: Array<{ reason: string; count: number }>;
    };

    expect(response.status).toBe(200);
    expect(body.estimatedTotalSol).toBe(0.032);
    expect(body.transactions).toHaveLength(1);
    expect(body.transactions[0].priceSol).toBe(0.032);
    expect(body.transactions[0].source).toBe("MMM");
    expect(body.transactions[0].transactionBase64).toBe("Aw==");
    expect(body.rejectedSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "stale_marketplace", count: 11 }),
        expect.objectContaining({ reason: "preflight_rejected", count: 1 }),
      ]),
    );
    expect(fulfillUrls).toHaveLength(13);
    expect(simulationTransactions).toEqual([
      ...Array<string>(11).fill("AQ=="),
      "Ag==",
      "Aw==",
    ]);
  });

  it("samples across a large same-price MMM wall before exhausting low mints", async () => {
    const buyer = "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf";
    const seller = "FrogSeller111111111111111111111111111111111";
    const floorMints = Array.from(
      { length: 30 },
      (_, index) => `FrogFloorMint${String(index + 1).padStart(2, "0")}`,
    );
    const executableMint = floorMints[Math.floor(floorMints.length / 2)];
    const fulfilledMints: string[] = [];
    const simulationTransactions: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/listings")) {
        const offset = new URL(url).searchParams.get("offset");
        if (offset !== "0") return Response.json([]);
        return Response.json(
          floorMints.map((tokenMint, index) => ({
            tokenMint,
            seller,
            name: `Floor Frog ${index + 1}`,
            price: 0.032,
            listingSource: "MMM",
          })),
        );
      }
      if (url.includes("/mmm/pools")) {
        return Response.json({
          results: [
            {
              poolKey: "MmmPool11111111111111111111111111111111111",
              poolType: "two_sided",
              mints: floorMints,
              sellsideAssetAmount: floorMints.length,
              buysideCreatorRoyaltyBp: 100,
              poolOwner: seller,
            },
          ],
        });
      }
      if (url.includes("/instructions/mmm/sol-fulfill-sell")) {
        const mint = new URL(url).searchParams.get("assetMint") || "";
        fulfilledMints.push(mint);
        return Response.json({ tx: mint === executableMint ? btoa("\x02") : btoa("\x01") });
      }
      if (url.startsWith("https://rpc.test")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          params?: [string];
        };
        const transaction = body.params?.[0] ?? "";
        simulationTransactions.push(transaction);
        if (transaction === "AQ==") {
          return Response.json({
            result: {
              context: { slot: 1 },
              value: {
                err: { InstructionError: [1, { Custom: 3012 }] },
                logs: ["Program log: AnchorError caused by account: sell_state"],
              },
            },
          });
        }
        return Response.json({
          result: {
            context: { slot: 2 },
            value: { err: null, logs: [] },
          },
        });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const response = await postNftBuyFloor(
      new Request("https://frogx.test/api/frogx/nfts/buy-floor", {
        method: "POST",
        body: JSON.stringify({ buyer, quantity: 1 }),
      }),
      {
        FROGX_NFT_PREFLIGHT_ENABLED: "true",
        FROGX_NFT_PREFLIGHT_SCAN_LIMIT: "4",
        SOLANA_RPC_URL: "https://rpc.test",
      },
    );
    const body = (await response.json()) as {
      estimatedTotalSol: number;
      transactions: Array<{ tokenMint: string; priceSol: number; transactionBase64: string }>;
      rejectedSummary: Array<{ reason: string; count: number }>;
    };

    expect(response.status).toBe(200);
    expect(body.estimatedTotalSol).toBe(0.032);
    expect(body.transactions).toHaveLength(1);
    expect(body.transactions[0].tokenMint).toBe(executableMint);
    expect(body.transactions[0].priceSol).toBe(0.032);
    expect(body.transactions[0].transactionBase64).toBe("Ag==");
    expect(body.rejectedSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "stale_marketplace", count: 1 }),
      ]),
    );
    expect(fulfilledMints).toEqual([floorMints[0], executableMint]);
    expect(simulationTransactions).toEqual(["AQ==", "Ag=="]);
  });

  it("skips high-buyer-royalty MMM pools before selecting an executable listing", async () => {
    const buyer = "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf";
    const highRoyaltySeller = "FrogSeller111111111111111111111111111111111";
    const m2Seller = "FrogSeller222222222222222222222222222222222";
    const fulfillUrls: string[] = [];
    const buyNowUrls: string[] = [];
    const simulationTransactions: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/listings")) {
        const offset = new URL(url).searchParams.get("offset");
        if (offset !== "0") return Response.json([]);
        return Response.json([
          {
            tokenMint: "So11111111111111111111111111111111111111112",
            seller: highRoyaltySeller,
            name: "High Royalty MMM Frog 1",
            price: 0.035,
            listingSource: "MMM",
          },
          {
            tokenMint: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            seller: highRoyaltySeller,
            name: "High Royalty MMM Frog 2",
            price: 0.035,
            listingSource: "MMM",
          },
          {
            tokenMint: "11111111111111111111111111111111",
            tokenAccount: "TokenAta3333333333333333333333333333333333",
            seller: m2Seller,
            name: "Executable M2 Frog",
            price: 0.053,
            listingSource: "M2",
          },
        ]);
      }
      if (url.includes("/mmm/pools")) {
        return Response.json({
          results: [
            {
              poolKey: "MmmPool11111111111111111111111111111111111",
              poolType: "two_sided",
              mints: [
                "So11111111111111111111111111111111111111112",
                "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
              ],
              sellsideAssetAmount: 2,
              buysideCreatorRoyaltyBp: 10000,
              poolOwner: highRoyaltySeller,
            },
          ],
        });
      }
      if (url.includes("/instructions/mmm/sol-fulfill-sell")) {
        fulfillUrls.push(url);
        return Response.json({ tx: btoa("\x01") });
      }
      if (url.includes("/instructions/buy_now")) {
        buyNowUrls.push(url);
        return Response.json({ tx: btoa("\x02") });
      }
      if (url.startsWith("https://rpc.test")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          params?: [string];
        };
        const transaction = body.params?.[0] ?? "";
        simulationTransactions.push(transaction);
        return Response.json({
          result: {
            context: { slot: 2 },
            value: { err: null, logs: [] },
          },
        });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const response = await postNftBuyFloor(
      new Request("https://frogx.test/api/frogx/nfts/buy-floor", {
        method: "POST",
        body: JSON.stringify({ buyer, quantity: 1 }),
      }),
      {
        FROGX_NFT_PREFLIGHT_ENABLED: "true",
        FROGX_NFT_LISTING_SCAN_LIMIT: "3",
        FROGX_NFT_SWEEP_ITEM_DELAY_MS: "0",
        SOLANA_RPC_URL: "https://rpc.test",
      },
    );
    const body = (await response.json()) as {
      error: string;
      code: string;
      selectedPriceSol: number | null;
      lowestBlockedPriceSol: number;
      rejectedSummary: Array<{ reason: string; count: number }>;
    };

    expect(response.status).toBe(409);
    expect(body.error).toBe("Lower floor listings are not executable");
    expect(body.code).toBe("LOWER_FLOOR_NOT_EXECUTABLE");
    expect(body.selectedPriceSol).toBe(0.053);
    expect(body.lowestBlockedPriceSol).toBe(0.035);
    expect(body.rejectedSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "high_royalty_mmm_pool", count: 2 }),
      ]),
    );
    expect(fulfillUrls).toHaveLength(0);
    expect(buyNowUrls).toHaveLength(1);
    expect(simulationTransactions).toEqual(["Ag=="]);
  });

  it("fails closed without higher fallback when one floor listing is unproven", async () => {
    const buyer = "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf";
    const lowSeller = "FrogSeller111111111111111111111111111111111";
    const m2Seller = "FrogSeller222222222222222222222222222222222";
    const fulfillUrls: string[] = [];
    const buyNowUrls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/listings")) {
        const offset = new URL(url).searchParams.get("offset");
        if (offset === "0") {
          return Response.json([
            {
              tokenMint: "So11111111111111111111111111111111111111112",
              seller: lowSeller,
              name: "Rejected Low MMM Frog",
              price: 0.035,
              listingSource: "MMM",
            },
            {
              tokenMint: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
              tokenAccount: "TokenAta2222222222222222222222222222222222",
              seller: m2Seller,
              name: "Higher M2 Frog",
              price: 0.053,
              listingSource: "M2",
            },
          ]);
        }
        return Response.json([]);
      }
      if (url.includes("/mmm/pools")) {
        return Response.json({
          results: [
            {
              poolKey: "MmmPool11111111111111111111111111111111111",
              poolType: "two_sided",
              mints: ["So11111111111111111111111111111111111111112"],
              sellsideAssetAmount: 1,
              buysideCreatorRoyaltyBp: 250,
              poolOwner: lowSeller,
            },
          ],
        });
      }
      if (url.includes("/instructions/mmm/sol-fulfill-sell")) {
        fulfillUrls.push(url);
        return Response.json({ tx: btoa("\x01") });
      }
      if (url.includes("/instructions/buy_now")) {
        buyNowUrls.push(url);
        return Response.json({ tx: btoa("\x02") });
      }
      if (url.startsWith("https://rpc.test")) {
        JSON.parse(String(init?.body ?? "{}"));
        return Response.json({
          result: {
            context: { slot: 1 },
            value: {
              err: { InstructionError: [1, { Custom: 6009 }] },
              logs: ["Program log: AnchorError occurred. Error Code: Custom6009"],
            },
          },
        });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const response = await postNftBuyFloor(
      new Request("https://frogx.test/api/frogx/nfts/buy-floor", {
        method: "POST",
        body: JSON.stringify({ buyer, quantity: 1 }),
      }),
      {
        FROGX_NFT_PREFLIGHT_ENABLED: "true",
        SOLANA_RPC_URL: "https://rpc.test",
      },
    );
    const body = (await response.json()) as {
      error: string;
      code: string;
    };

    expect(response.status).toBe(409);
    expect(body.error).toBe("No executable floor listings available");
    expect(body.code).toBe("NO_EXECUTABLE_LISTINGS");
    expect(fulfillUrls).toHaveLength(1);
    expect(buyNowUrls).toHaveLength(0);
  });

  it("reports Magic Eden build failures directly for one-frog floor quotes", async () => {
    const buyer = "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf";
    let buyBuildCalls = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/listings")) {
        return Response.json([
          {
            tokenMint: "So11111111111111111111111111111111111111112",
            tokenAccount: "TokenAta1111111111111111111111111111111111",
            seller: "FrogSeller111111111111111111111111111111111",
            price: 0.2,
          },
        ]);
      }
      if (url.includes("/instructions/buy_now")) {
        buyBuildCalls += 1;
        return Response.json(
          { error: "rate limited" },
          { status: 429, headers: { "Retry-After": "0" } },
        );
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const response = await postNftBuyFloor(
      new Request("https://frogx.test/api/frogx/nfts/buy-floor", {
        method: "POST",
        body: JSON.stringify({ buyer, quantity: 1 }),
      }),
      {},
    );
    const body = (await response.json()) as {
      error: string;
      code: string;
      layer: string;
      detail: string;
    };

    expect(response.status).toBe(502);
    expect(body.error).toBe("NFT marketplace transaction build temporarily unavailable");
    expect(body.code).toBe("MARKETPLACE_BUILD_UNAVAILABLE");
    expect(body.layer).toBe("marketplace");
    expect(body.detail).toContain("MAGIC_EDEN_429");
    expect(buyBuildCalls).toBeGreaterThan(1);
  });

  it("uses the Magic Eden MMM fulfill-sell builder for MMM floor listings", async () => {
    const buyer = "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf";
    const seller = "FrogSeller111111111111111111111111111111111";
    const fulfillUrls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/stats")) {
        return Response.json({ floorPrice: 200_000_000, listedCount: 12 });
      }
      if (url.includes("/listings")) {
        return Response.json([
          {
            tokenMint: "So11111111111111111111111111111111111111112",
            seller,
            price: 0.2020606,
            listingSource: "MMM",
          },
        ]);
      }
      if (url.includes("/mmm/pools")) {
        return Response.json({
          results: [
            {
              poolKey: "MmmPool11111111111111111111111111111111111",
              poolType: "sell_sided",
              mints: ["So11111111111111111111111111111111111111112"],
              spotPrice: 200_000_000,
              curveType: "exp",
              curveDelta: 3,
              lpFeeBp: 100,
              sellsideAssetAmount: 1,
              buysideCreatorRoyaltyBp: 250,
              poolOwner: seller,
            },
          ],
        });
      }
      if (url.includes("/instructions/mmm/sol-fulfill-sell")) {
        fulfillUrls.push(url);
        return Response.json({ tx: btoa("\x07\x08\x09") });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const response = await postNftBuyFloor(
      new Request("https://frogx.test/api/frogx/nfts/buy-floor", {
        method: "POST",
        body: JSON.stringify({ buyer, quantity: 1 }),
      }),
      {},
    );
    const body = (await response.json()) as {
      transactions: Array<{ transactionBase64: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.transactions[0].transactionBase64).toBe("BwgJ");
    expect(fulfillUrls).toHaveLength(1);

    const fulfill = new URL(fulfillUrls[0]);
    expect(fulfill.searchParams.get("pool")).toBe(
      "MmmPool11111111111111111111111111111111111",
    );
    expect(fulfill.searchParams.get("buyer")).toBe(buyer);
    expect(fulfill.searchParams.get("assetMint")).toBe(
      "So11111111111111111111111111111111111111112",
    );
    expect(fulfill.searchParams.get("maxPaymentAmount")).toBe("202060600");
    expect(fulfill.searchParams.get("buysideCreatorRoyaltyBp")).toBe("250");
  });

  it("rejects buy-floor sweeps over the configured max total before building buy transactions", async () => {
    const requestedUrls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("/stats")) {
        return Response.json({ floorPrice: 200_000_000 });
      }
      return Response.json([
        {
          tokenMint: "So11111111111111111111111111111111111111112",
          tokenAccount: "TokenAta1111111111111111111111111111111111",
          seller: "FrogSeller111111111111111111111111111111111",
          price: 0.2,
        },
      ]);
    }) as typeof fetch;

    const response = await postNftBuyFloor(
      new Request("https://frogx.test/api/frogx/nfts/buy-floor", {
        method: "POST",
        body: JSON.stringify({
          buyer: "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf",
          quantity: 1,
        }),
      }),
      { FROGX_NFT_MAX_TOTAL_SOL: "0.1" },
    );
    const body = (await response.json()) as {
      error?: string;
      maxTotalSol?: number;
    };

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/max total/i);
    expect(body.maxTotalSol).toBe(0.1);
    expect(requestedUrls.some((url) => url.includes("/instructions/buy_now"))).toBe(false);
  });

  it("fails closed when Magic Eden is unavailable", async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({ error: "nope" }, { status: 503 }),
    ) as typeof fetch;

    const response = await getNftFloor(
      new Request("https://frogx.test/api/frogx/nfts/floor"),
      {},
    );

    expect(response.status).toBe(502);
  });

  it("rejects Telegram execution while bot signer gates are disabled", async () => {
    const response = await postNftExecuteFloor(
      new Request("https://frogx.test/api/frogx/nfts/execute-floor", {
        method: "POST",
        body: JSON.stringify({
          telegramUserId: 123,
          quantity: 1,
        }),
      }),
      {},
    );
    const body = (await response.json()) as {
      error?: string;
      missing?: Record<string, boolean>;
    };

    expect(response.status).toBe(503);
    expect(body.error).toMatch(/not enabled/i);
    expect(body.missing?.botTradingEnabled).toBe(false);
  });

  it("executes a Telegram buy-floor confirmation through a delegated Privy Solana wallet", async () => {
    const buyer = "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf";
    const tokenMint = "So11111111111111111111111111111111111111112";
    const seller = "FrogSeller111111111111111111111111111111111";
    const signCalls: Array<{
      walletId: string;
      transaction: string;
      authorizationKey: string | undefined;
      caip2: string;
    }> = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/stats")) {
        return Response.json({ floorPrice: 200_000_000, listedCount: 12 });
      }
      if (url.includes("/listings")) {
        return Response.json([
          {
            tokenMint,
            tokenAccount: "TokenAta1111111111111111111111111111111111",
            seller,
            price: 0.2,
          },
        ]);
      }
      if (url.includes("/instructions/buy_now")) {
        return Response.json({ tx: btoa("\x01\x02\x03") });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const response = await postNftExecuteFloor(
      new Request("https://frogx.test/api/frogx/nfts/execute-floor", {
        method: "POST",
        headers: {
          authorization: "Bearer bot-token",
        },
        body: JSON.stringify({
          telegramUserId: 123,
          telegramUsername: "aklo360",
          quantity: 1,
          intentId: "intent-123",
          expectedTokenMint: tokenMint,
          maxTotalSol: 0.25,
        }),
      }),
      {
        FROGX_ACCOUNT_MODE_ENABLED: "true",
        FROGX_BOT_TRADING_ENABLED: "true",
        FROGX_BOT_EXECUTION_ENABLED: "true",
        FROGX_BOT_API_TOKEN: "bot-token",
        FROGX_NFT_SWEEP_ITEM_DELAY_MS: "0",
        PRIVY_APP_ID: "app-id",
        PRIVY_APP_SECRET: "app-secret",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: "auth-private-key",
	      },
      {
        getBalanceLamports: async () => 300_000_000n,
        confirmTransaction: async () => ({
          confirmed: true,
          confirmationStatus: "confirmed",
          slot: 123,
          pending: false,
          detail: null,
        }),
        createPrivyClient: () => ({
          users: () => ({
            getByTelegramUserID: async () => ({
              id: "did:privy:user",
              linked_accounts: [
                {
                  id: "wallet-id",
                  address: buyer,
                  type: "wallet",
                  chain_type: "solana",
                  connector_type: "embedded",
                  delegated: true,
                  wallet_client: "privy",
                },
              ],
            }),
          }),
          wallets: () => ({
            solana: () => ({
              signAndSendTransaction: async (walletId, input) => {
                signCalls.push({
                  walletId,
                  transaction: input.transaction,
                  authorizationKey:
                    input.authorization_context.authorization_private_keys?.[0],
                  caip2: input.caip2,
                });
                return { hash: "tx-hash", caip2: input.caip2 };
              },
            }),
          }),
        }),
      },
    );
    const body = (await response.json()) as {
      buyer: string;
      submittedCount: number;
      confirmedCount: number;
      submitted: Array<{ hash: string; tokenMint: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.buyer).toBe(buyer);
    expect(body.submittedCount).toBe(1);
    expect(body.confirmedCount).toBe(1);
    expect(body.submitted[0]).toMatchObject({ hash: "tx-hash", tokenMint });
	    expect(signCalls).toEqual([
      {
        walletId: "wallet-id",
        transaction: "AQID",
        authorizationKey: "auth-private-key",
        caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      },
	    ]);
	  });

	  it("blocks Telegram execution when the FTX trade wallet needs more SOL", async () => {
	    const buyer = "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf";
	    const tokenMint = "So11111111111111111111111111111111111111112";
	    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
	      const url = String(input);
	      if (url.includes("/stats")) {
	        return Response.json({ floorPrice: 200_000_000, listedCount: 12 });
	      }
	      if (url.includes("/listings")) {
	        return Response.json([
	          {
	            tokenMint,
	            tokenAccount: "TokenAta1111111111111111111111111111111111",
	            seller: "FrogSeller111111111111111111111111111111111",
	            price: 0.2,
	          },
	        ]);
	      }
	      if (url.includes("/instructions/buy_now")) {
	        return Response.json({ tx: btoa("\x01\x02\x03") });
	      }
	      return Response.json({ error: "unexpected" }, { status: 500 });
	    }) as typeof fetch;

	    const response = await postNftExecuteFloor(
	      new Request("https://frogx.test/api/frogx/nfts/execute-floor", {
	        method: "POST",
	        headers: {
	          authorization: "Bearer bot-token",
	        },
	        body: JSON.stringify({
	          telegramUserId: 123,
	          quantity: 1,
	          expectedTokenMint: tokenMint,
	          maxTotalSol: 0.25,
	        }),
	      }),
	      {
	        FROGX_ACCOUNT_MODE_ENABLED: "true",
	        FROGX_BOT_TRADING_ENABLED: "true",
	        FROGX_BOT_EXECUTION_ENABLED: "true",
	        FROGX_BOT_API_TOKEN: "bot-token",
	        PRIVY_APP_ID: "app-id",
	        PRIVY_APP_SECRET: "app-secret",
	        PRIVY_AUTHORIZATION_PRIVATE_KEY: "auth-private-key",
	      },
	      {
	        getBalanceLamports: async () => 100_000_000n,
	        createPrivyClient: () => ({
	          users: () => ({
	            getByTelegramUserID: async () => ({
	              id: "did:privy:user",
	              linked_accounts: [
	                {
	                  id: "wallet-id",
	                  address: buyer,
	                  type: "wallet",
	                  chain_type: "solana",
	                  connector_type: "embedded",
	                  delegated: true,
	                  wallet_client: "privy",
	                },
	              ],
	            }),
	          }),
	          wallets: () => ({
	            solana: () => ({
	              signAndSendTransaction: async () => {
	                throw new Error("should not sign unfunded wallet");
	              },
	            }),
	          }),
	        }),
	      },
	    );
	    const body = (await response.json()) as {
	      error: string;
	      balanceSol: number;
	      requiredSol: number;
	    };

	    expect(response.status).toBe(402);
	    expect(body.error).toBe("Insufficient SOL in FTX trade wallet");
	    expect(body.balanceSol).toBe(0.1);
	    expect(body.requiredSol).toBe(0.21);
	  });

	  it("returns a specific transaction-rejected code when Privy cannot broadcast the buy", async () => {
	    const buyer = "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf";
	    const tokenMint = "So11111111111111111111111111111111111111112";
	    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
	      const url = String(input);
	      if (url.includes("/stats")) {
	        return Response.json({ floorPrice: 200_000_000, listedCount: 12 });
	      }
	      if (url.includes("/listings")) {
	        return Response.json([
	          {
	            tokenMint,
	            tokenAccount: "TokenAta1111111111111111111111111111111111",
	            seller: "FrogSeller111111111111111111111111111111111",
	            price: 0.2,
	          },
	        ]);
	      }
	      if (url.includes("/instructions/buy_now")) {
	        return Response.json({ tx: btoa("\x01\x02\x03") });
	      }
	      return Response.json({ error: "unexpected" }, { status: 500 });
	    }) as typeof fetch;

	    const response = await postNftExecuteFloor(
	      new Request("https://frogx.test/api/frogx/nfts/execute-floor", {
	        method: "POST",
	        headers: {
	          authorization: "Bearer bot-token",
	        },
	        body: JSON.stringify({
	          telegramUserId: 123,
	          quantity: 1,
	          expectedTokenMint: tokenMint,
	          maxTotalSol: 0.25,
	        }),
	      }),
	      {
	        FROGX_ACCOUNT_MODE_ENABLED: "true",
	        FROGX_BOT_TRADING_ENABLED: "true",
	        FROGX_BOT_EXECUTION_ENABLED: "true",
	        FROGX_BOT_API_TOKEN: "bot-token",
	        PRIVY_APP_ID: "app-id",
	        PRIVY_APP_SECRET: "app-secret",
	        PRIVY_AUTHORIZATION_PRIVATE_KEY: "auth-private-key",
	      },
	      {
	        getBalanceLamports: async () => 300_000_000n,
	        createPrivyClient: () => ({
	          users: () => ({
	            getByTelegramUserID: async () => ({
	              id: "did:privy:user",
	              linked_accounts: [
	                {
	                  id: "wallet-id",
	                  address: buyer,
	                  type: "wallet",
	                  chain_type: "solana",
	                  connector_type: "embedded",
	                  delegated: true,
	                  wallet_client: "privy",
	                },
	              ],
	            }),
	          }),
	          wallets: () => ({
	            solana: () => ({
	              signAndSendTransaction: async () => {
	                throw new Error("Transaction simulation failed: Blockhash not found");
	              },
	            }),
	          }),
	        }),
	      },
	    );
	    const body = (await response.json()) as {
	      error: string;
	      code: string;
	      layer: string;
	      detail: string;
	    };

	    expect(response.status).toBe(409);
	    expect(body.error).toBe("NFT transaction was rejected before execution");
	    expect(body.code).toBe("TRANSACTION_REJECTED");
	    expect(body.layer).toBe("chain");
	    expect(body.detail).toMatch(/blockhash/i);
	  });

  it("retries a transient Magic Eden 429 during Telegram execution builds", async () => {
    const buyer = "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf";
    const tokenMint = "So11111111111111111111111111111111111111112";
    let buyBuildCalls = 0;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/listings")) {
        return Response.json([
          {
            tokenMint,
            tokenAccount: "TokenAta1111111111111111111111111111111111",
            seller: "FrogSeller111111111111111111111111111111111",
            price: 0.2,
          },
        ]);
      }
      if (url.includes("/instructions/buy_now")) {
        buyBuildCalls += 1;
        if (buyBuildCalls === 1) {
          return Response.json(
            { error: "rate limited" },
            { status: 429, headers: { "Retry-After": "0" } },
          );
        }
        return Response.json({ tx: btoa("\x01\x02\x03") });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const response = await postNftExecuteFloor(
      new Request("https://frogx.test/api/frogx/nfts/execute-floor", {
        method: "POST",
        headers: {
          authorization: "Bearer bot-token",
        },
        body: JSON.stringify({
          telegramUserId: 123,
          quantity: 1,
          expectedTokenMint: tokenMint,
          maxTotalSol: 0.25,
        }),
      }),
      {
        FROGX_ACCOUNT_MODE_ENABLED: "true",
        FROGX_BOT_TRADING_ENABLED: "true",
        FROGX_BOT_EXECUTION_ENABLED: "true",
        FROGX_BOT_API_TOKEN: "bot-token",
        PRIVY_APP_ID: "app-id",
        PRIVY_APP_SECRET: "app-secret",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: "auth-private-key",
      },
      {
        getBalanceLamports: async () => 300_000_000n,
        confirmTransaction: async () => ({
          confirmed: true,
          confirmationStatus: "confirmed",
          slot: 123,
          pending: false,
          detail: null,
        }),
        createPrivyClient: () => ({
          users: () => ({
            getByTelegramUserID: async () => ({
              id: "did:privy:user",
              linked_accounts: [
                {
                  id: "wallet-id",
                  address: buyer,
                  type: "wallet",
                  chain_type: "solana",
                  connector_type: "embedded",
                  delegated: true,
                  wallet_client: "privy",
                },
              ],
            }),
          }),
          wallets: () => ({
            solana: () => ({
              signAndSendTransaction: async (_walletId, input) => ({
                hash: "tx-hash",
                caip2: input.caip2,
              }),
            }),
          }),
        }),
      },
    );
    const body = (await response.json()) as {
      submittedCount: number;
      confirmedCount: number;
      submitted: Array<{ hash: string; tokenMint: string }>;
    };

    expect(response.status).toBe(200);
    expect(buyBuildCalls).toBe(2);
    expect(body.submittedCount).toBe(1);
    expect(body.confirmedCount).toBe(1);
    expect(body.submitted[0]).toMatchObject({ hash: "tx-hash", tokenMint });
  });

  it("executes Telegram sweeps one confirmed floor buy at a time", async () => {
    const buyer = "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf";
    const tokenMints = [
      "So11111111111111111111111111111111111111112",
      "Es9vMFrzaCERmJfrF4H2FYD4KCoNkYJPvJkkHpfD9L9y",
    ];
    const events: string[] = [];
    let listingCalls = 0;
    let buyCalls = 0;
    let signCalls = 0;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/listings")) {
        const tokenMint = tokenMints[Math.min(listingCalls, tokenMints.length - 1)];
        listingCalls += 1;
        events.push(`listings-${listingCalls}`);
        return Response.json([
          {
            tokenMint,
            tokenAccount: `TokenAta${listingCalls}1111111111111111111111111111111`,
            seller: "FrogSeller111111111111111111111111111111111",
            price: listingCalls === 1 ? 0.2 : 0.21,
          },
        ]);
      }
      if (url.includes("/instructions/buy_now")) {
        buyCalls += 1;
        events.push(`buy-${buyCalls}`);
        return Response.json({
          tx: btoa(String.fromCharCode(buyCalls)),
        });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const response = await postNftExecuteFloor(
      new Request("https://frogx.test/api/frogx/nfts/execute-floor", {
        method: "POST",
        headers: {
          authorization: "Bearer bot-token",
        },
        body: JSON.stringify({
          telegramUserId: 123,
          quantity: 2,
          intentId: "sweep-intent",
          maxTotalSol: 0.5,
        }),
      }),
      {
        FROGX_ACCOUNT_MODE_ENABLED: "true",
        FROGX_BOT_TRADING_ENABLED: "true",
        FROGX_BOT_EXECUTION_ENABLED: "true",
        FROGX_BOT_API_TOKEN: "bot-token",
        FROGX_NFT_SWEEP_ITEM_DELAY_MS: "0",
        PRIVY_APP_ID: "app-id",
        PRIVY_APP_SECRET: "app-secret",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: "auth-private-key",
      },
      {
        getBalanceLamports: async () => 1_000_000_000n,
        confirmTransaction: async (_env, signature) => {
          events.push(`confirm-${signature}`);
          return {
            confirmed: true,
            confirmationStatus: "confirmed",
            slot: 123,
            pending: false,
            detail: null,
          };
        },
        createPrivyClient: () => ({
          users: () => ({
            getByTelegramUserID: async () => ({
              id: "did:privy:user",
              linked_accounts: [
                {
                  id: "wallet-id",
                  address: buyer,
                  type: "wallet",
                  chain_type: "solana",
                  connector_type: "embedded",
                  delegated: true,
                  wallet_client: "privy",
                },
              ],
            }),
          }),
          wallets: () => ({
            solana: () => ({
              signAndSendTransaction: async (_walletId, input) => {
                signCalls += 1;
                events.push(`sign-${signCalls}`);
                return {
                  hash: `tx-hash-${signCalls}`,
                  caip2: input.caip2,
                };
              },
            }),
          }),
        }),
      },
    );
    const body = (await response.json()) as {
      partial: boolean;
      submittedCount: number;
      confirmedCount: number;
      submitted: Array<{ hash: string; tokenMint: string; confirmed: boolean }>;
      estimatedTotalSol: number;
    };

    expect(response.status).toBe(200);
    expect(body.partial).toBe(false);
    expect(body.submittedCount).toBe(2);
    expect(body.confirmedCount).toBe(2);
    expect(body.estimatedTotalSol).toBe(0.41);
    expect(body.submitted.map((tx) => tx.tokenMint)).toEqual(tokenMints);
    expect(body.submitted.every((tx) => tx.confirmed)).toBe(true);
    expect(events).toEqual([
      "listings-1",
      "buy-1",
      "sign-1",
      "confirm-tx-hash-1",
      "listings-2",
      "buy-2",
      "sign-2",
      "confirm-tx-hash-2",
    ]);
  });

  it("does not retry known stale mints between Telegram sweep items", async () => {
    const buyer = "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf";
    const staleMint = "So11111111111111111111111111111111111111112";
    const firstMint = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkYJPvJkkHpfD9L9y";
    const secondMint = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    const buyBuildMints: string[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/listings")) {
        return Response.json([
          {
            tokenMint: staleMint,
            tokenAccount: "TokenAtaStale111111111111111111111111111111",
            seller: "FrogSeller111111111111111111111111111111111",
            price: 0.2,
          },
          {
            tokenMint: firstMint,
            tokenAccount: "TokenAtaFirst111111111111111111111111111111",
            seller: "FrogSeller111111111111111111111111111111111",
            price: 0.2,
          },
          {
            tokenMint: secondMint,
            tokenAccount: "TokenAtaSecond11111111111111111111111111111",
            seller: "FrogSeller111111111111111111111111111111111",
            price: 0.2,
          },
        ]);
      }
      if (url.includes("/instructions/buy_now")) {
        const tokenMint = new URL(url).searchParams.get("tokenMint") ?? "";
        buyBuildMints.push(tokenMint);
        if (tokenMint === staleMint) return Response.json({ tx: btoa("\x01") });
        if (tokenMint === firstMint) return Response.json({ tx: btoa("\x02") });
        return Response.json({ tx: btoa("\x03") });
      }
      if (url.startsWith("https://rpc.test")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          params?: [string];
        };
        const transaction = body.params?.[0] ?? "";
        if (transaction === "AQ==") {
          return Response.json({
            result: {
              context: { slot: 1 },
              value: {
                err: { InstructionError: [1, { Custom: 3012 }] },
                logs: ["Program log: AnchorError caused by account: sell_state"],
              },
            },
          });
        }
        return Response.json({
          result: {
            context: { slot: 2 },
            value: { err: null, logs: [] },
          },
        });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const response = await postNftExecuteFloor(
      new Request("https://frogx.test/api/frogx/nfts/execute-floor", {
        method: "POST",
        headers: {
          authorization: "Bearer bot-token",
        },
        body: JSON.stringify({
          telegramUserId: 123,
          quantity: 2,
          intentId: "sweep-intent",
          maxTotalSol: 0.5,
        }),
      }),
      {
        FROGX_ACCOUNT_MODE_ENABLED: "true",
        FROGX_BOT_TRADING_ENABLED: "true",
        FROGX_BOT_EXECUTION_ENABLED: "true",
        FROGX_BOT_API_TOKEN: "bot-token",
        FROGX_NFT_SWEEP_ITEM_DELAY_MS: "0",
        FROGX_NFT_PREFLIGHT_ENABLED: "true",
        FROGX_NFT_LISTING_SCAN_LIMIT: "3",
        SOLANA_RPC_URL: "https://rpc.test",
        PRIVY_APP_ID: "app-id",
        PRIVY_APP_SECRET: "app-secret",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: "auth-private-key",
      },
      {
        getBalanceLamports: async () => 1_000_000_000n,
        confirmTransaction: async () => ({
          confirmed: true,
          confirmationStatus: "confirmed",
          slot: 123,
          pending: false,
          detail: null,
        }),
        createPrivyClient: () => ({
          users: () => ({
            getByTelegramUserID: async () => ({
              id: "did:privy:user",
              linked_accounts: [
                {
                  id: "wallet-id",
                  address: buyer,
                  type: "wallet",
                  chain_type: "solana",
                  connector_type: "embedded",
                  delegated: true,
                  wallet_client: "privy",
                },
              ],
            }),
          }),
          wallets: () => ({
            solana: () => ({
              signAndSendTransaction: async (_walletId, input) => ({
                hash:
                  input.transaction === "Ag==" ? "tx-hash-1" : "tx-hash-2",
                caip2: input.caip2,
              }),
            }),
          }),
        }),
      },
    );
    const body = (await response.json()) as {
      submittedCount: number;
      confirmedCount: number;
      submitted: Array<{ tokenMint: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.submittedCount).toBe(2);
    expect(body.confirmedCount).toBe(2);
    expect(body.submitted.map((tx) => tx.tokenMint)).toEqual([
      firstMint,
      secondMint,
    ]);
    expect(buyBuildMints).toEqual([staleMint, firstMint, secondMint]);
  });

  it("returns partial Telegram sweep results when a later submitted transaction fails", async () => {
    const buyer = "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf";
    const tokenMints = [
      "So11111111111111111111111111111111111111112",
      "Es9vMFrzaCERmJfrF4H2FYD4KCoNkYJPvJkkHpfD9L9y",
    ];
    let listingCalls = 0;
    let signCalls = 0;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/listings")) {
        const tokenMint = tokenMints[Math.min(listingCalls, tokenMints.length - 1)];
        listingCalls += 1;
        return Response.json([
          {
            tokenMint,
            tokenAccount: `TokenAta${listingCalls}1111111111111111111111111111111`,
            seller: "FrogSeller111111111111111111111111111111111",
            price: listingCalls === 1 ? 0.2 : 0.21,
          },
        ]);
      }
      if (url.includes("/instructions/buy_now")) {
        return Response.json({
          tx: btoa(String.fromCharCode(listingCalls)),
        });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const response = await postNftExecuteFloor(
      new Request("https://frogx.test/api/frogx/nfts/execute-floor", {
        method: "POST",
        headers: {
          authorization: "Bearer bot-token",
        },
        body: JSON.stringify({
          telegramUserId: 123,
          quantity: 2,
          intentId: "sweep-intent",
          maxTotalSol: 0.5,
        }),
      }),
      {
        FROGX_ACCOUNT_MODE_ENABLED: "true",
        FROGX_BOT_TRADING_ENABLED: "true",
        FROGX_BOT_EXECUTION_ENABLED: "true",
        FROGX_BOT_API_TOKEN: "bot-token",
        FROGX_NFT_SWEEP_ITEM_DELAY_MS: "0",
        PRIVY_APP_ID: "app-id",
        PRIVY_APP_SECRET: "app-secret",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: "auth-private-key",
      },
      {
        getBalanceLamports: async () => 1_000_000_000n,
        confirmTransaction: async (_env, signature) => {
          if (signature === "tx-hash-2") {
            throw new Error(
              'SOLANA_CONFIRMATION_REJECTED {"InstructionError":[0,"Custom"]}',
            );
          }
          return {
            confirmed: true,
            confirmationStatus: "confirmed",
            slot: 123,
            pending: false,
            detail: null,
          };
        },
        createPrivyClient: () => ({
          users: () => ({
            getByTelegramUserID: async () => ({
              id: "did:privy:user",
              linked_accounts: [
                {
                  id: "wallet-id",
                  address: buyer,
                  type: "wallet",
                  chain_type: "solana",
                  connector_type: "embedded",
                  delegated: true,
                  wallet_client: "privy",
                },
              ],
            }),
          }),
          wallets: () => ({
            solana: () => ({
              signAndSendTransaction: async (_walletId, input) => {
                signCalls += 1;
                return {
                  hash: `tx-hash-${signCalls}`,
                  caip2: input.caip2,
                };
              },
            }),
          }),
        }),
      },
    );
    const body = (await response.json()) as {
      partial: boolean;
      code: string;
      submittedCount: number;
      confirmedCount: number;
      submitted: Array<{ hash: string; tokenMint: string; confirmed: boolean }>;
      failed: Array<{ hash: string; code: string; tokenMint: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.partial).toBe(true);
    expect(body.code).toBe("TRANSACTION_REJECTED");
    expect(body.submittedCount).toBe(1);
    expect(body.confirmedCount).toBe(1);
    expect(body.submitted).toEqual([
      expect.objectContaining({
        hash: "tx-hash-1",
        tokenMint: tokenMints[0],
        confirmed: true,
      }),
    ]);
    expect(body.failed).toEqual([
      expect.objectContaining({
        hash: "tx-hash-2",
        tokenMint: tokenMints[1],
        code: "TRANSACTION_REJECTED",
      }),
    ]);
  });
	});
