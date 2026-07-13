import { afterEach, describe, expect, it, vi } from "vitest";

import type { Env } from "./env";
import { fetchWalletNftHoldings, getNftHoldings } from "./nftHoldings";
import { getTradingBotNfts } from "./tradingBot";

const WALLET = "11111111111111111111111111111111";

describe("NFT holdings", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns only NFTs currently owned by the requested wallet", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as {
        method: string;
        params: { ownerAddress: string; page: number; limit: number };
      };
      expect(request).toMatchObject({
        method: "searchAssets",
        params: { ownerAddress: WALLET, page: 2, limit: 10 },
      });
      return Response.json({
        result: {
          page: 2,
          limit: 10,
          total: 2,
          items: [
            {
              id: "frog-mint",
              ownership: { owner: WALLET },
              compression: { compressed: true },
              grouping: [
                { group_key: "collection", group_value: "frog-collection" },
              ],
              content: {
                metadata: {
                  name: "Business Frog #42",
                  attributes: [{ trait_type: "Hat", value: "Wizard" }],
                },
                links: { image: "ipfs://frog-image" },
              },
            },
            {
              id: "not-owned",
              ownership: {
                owner: "Vote111111111111111111111111111111111111111",
              },
            },
            { id: "burnt", burnt: true, ownership: { owner: WALLET } },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchWalletNftHoldings(
      { SOLANA_RPC_URL: "https://rpc.test" } as Env,
      { walletAddress: WALLET, page: 2, limit: 10 },
    );

    expect(result.items).toEqual([
      {
        mint: "frog-mint",
        name: "Business Frog #42",
        description: null,
        image: "https://ipfs.io/ipfs/frog-image",
        collection: "frog-collection",
        owner: WALLET,
        compressed: true,
        attributes: [{ traitType: "Hat", value: "Wizard" }],
      },
    ]);
    expect(result.walletAddresses).toEqual([WALLET]);
  });

  it("rejects malformed public wallet lookups before RPC", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const response = await getNftHoldings(
      new Request("https://frogx.test/api/frogx/nfts?walletAddress=bad"),
      { SOLANA_RPC_URL: "https://rpc.test" } as Env,
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aggregates Business Frogs across repeated embedded wallet parameters", async () => {
    const secondWallet = "Vote111111111111111111111111111111111111111";
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as {
        params: { ownerAddress: string; grouping: [string, string] };
      };
      expect(request.params.grouping).toEqual([
        "collection",
        "J7rxtKmEpNJEtrfkagiTF1gsmLyVus6BQZFY4ouBkeMG",
      ]);
      return Response.json({
        result: {
          page: 1,
          limit: 50,
          total: 1,
          items: [
            {
              id: `frog-${request.params.ownerAddress}`,
              ownership: { owner: request.params.ownerAddress },
              grouping: [
                {
                  group_key: "collection",
                  group_value:
                    "J7rxtKmEpNJEtrfkagiTF1gsmLyVus6BQZFY4ouBkeMG",
                },
              ],
              content: { metadata: { name: "Business Frog" } },
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getNftHoldings(
      new Request(
        `https://frogx.test/api/frogx/nfts?walletAddress=${WALLET}&walletAddress=${secondWallet}`,
      ),
      { SOLANA_RPC_URL: "https://rpc.test" } as Env,
    );
    const data = (await response.json()) as {
      walletAddresses: string[];
      total: number;
      items: Array<{ owner: string }>;
    };

    expect(response.status).toBe(200);
    expect(data.walletAddresses).toEqual([WALLET, secondWallet]);
    expect(data.total).toBe(2);
    expect(data.items.map((item) => item.owner)).toEqual([
      WALLET,
      secondWallet,
    ]);
  });

  it("derives Ribbot holdings from the FTX account instead of request input", async () => {
    const secondWallet = "Vote111111111111111111111111111111111111111";
    const requestedOwners: string[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as {
        params: { ownerAddress: string };
      };
      requestedOwners.push(request.params.ownerAddress);
      return Response.json({
        result: { page: 1, limit: 5, total: 0, items: [] },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const accountStore = {
      idFromName: () => ({ name: "123456" }),
      get: () => ({
        fetch: () =>
          Response.json({
            status: "ready",
            account: {
              telegramUserId: "123456",
              solanaWalletAddress: WALLET,
              walletSource: "privy",
              wallets: [
                {
                  walletId: "wallet-1",
                  walletSource: "privy",
                  solanaWalletAddress: WALLET,
                },
                {
                  walletId: "wallet-2",
                  walletSource: "privy",
                  solanaWalletAddress: secondWallet,
                },
              ],
            },
          }),
      }),
    } as unknown as DurableObjectNamespace;
    const response = await getTradingBotNfts(
      new Request(
        "https://frogx.test/api/frogx/trading-bot/nfts?telegramUserId=123456&page=1&limit=5&walletAddress=Vote111111111111111111111111111111111111111",
        { headers: { Authorization: "Bearer ribbot-token" } },
      ),
      {
        SOLANA_RPC_URL: "https://rpc.test",
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: accountStore,
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      walletAddress: string;
    };

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ status: "ready", walletAddress: WALLET });
    expect(requestedOwners).toEqual([WALLET, secondWallet]);
  });
});
