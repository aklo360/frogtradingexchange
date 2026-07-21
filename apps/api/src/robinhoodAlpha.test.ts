import { describe, expect, it, vi } from "vitest";

import type { Env } from "./env";
import {
  buildRobinhoodAlphaSnapshot,
  getRobinhoodAlphaConfig,
  getRobinhoodAlphaSignals,
  runRobinhoodAlphaScanner,
  type RobinhoodAlphaPool,
  type RobinhoodAlphaStoredState,
  type RobinhoodAlphaTrade,
} from "./robinhoodAlpha";

const NOW = new Date("2026-07-21T03:00:00.000Z");

const address = (value: number) => `0x${value.toString(16).padStart(40, "0")}`;
const txHash = (value: number) => `0x${value.toString(16).padStart(64, "0")}`;

function pool(
  index: number,
  createdAt = "2026-07-10T00:00:00.000Z",
): RobinhoodAlphaPool {
  const tokenAddress = address(1_000 + index);
  const poolAddress = address(2_000 + index);
  return {
    poolAddress,
    tokenAddress,
    tokenName: `Token ${index}`,
    tokenSymbol: `T${index}`,
    dex: "uniswap-v3-robinhood",
    createdAt,
    priceUsd: 2,
    priceChange24h: 50,
    volume24hUsd: 100_000,
    liquidityUsd: 50_000,
    buys24h: 25,
    sells24h: 15,
    geckoUrl: `https://www.geckoterminal.com/robinhood/pools/${poolAddress}`,
    explorerUrl: `https://robinhoodchain.blockscout.com/token/${tokenAddress}`,
  };
}

function trade(input: {
  id: number;
  wallet: number;
  pool: RobinhoodAlphaPool;
  timestamp: string;
  kind?: "buy" | "sell";
  volumeUsd?: number;
  tokenAmount?: number;
}): RobinhoodAlphaTrade {
  return {
    id: `trade-${input.id}`,
    txHash: txHash(input.id),
    poolAddress: input.pool.poolAddress,
    tokenAddress: input.pool.tokenAddress,
    walletAddress: address(input.wallet),
    kind: input.kind ?? "buy",
    tokenAmount: input.tokenAmount ?? 100,
    volumeUsd: input.volumeUsd ?? 100,
    tokenPriceUsd: 1,
    timestamp: input.timestamp,
  };
}

function convergenceFixture(walletCount = 4) {
  const pools = Array.from({ length: 10 }, (_, index) =>
    pool(
      index,
      index === 0
        ? "2026-07-21T02:00:00.000Z"
        : `2026-07-${String(10 + index).padStart(2, "0")}T00:00:00.000Z`,
    ),
  );
  const trades: RobinhoodAlphaTrade[] = [];
  let id = 1;
  for (let walletIndex = 0; walletIndex < walletCount; walletIndex += 1) {
    for (let tokenIndex = 1; tokenIndex <= 3; tokenIndex += 1) {
      trades.push(
        trade({
          id: id++,
          wallet: 100 + walletIndex,
          pool: pools[tokenIndex],
          timestamp: `2026-07-${String(10 + tokenIndex).padStart(2, "0")}T${String(walletIndex * 2).padStart(2, "0")}:00:00.000Z`,
        }),
      );
    }
    trades.push(
      trade({
        id: id++,
        wallet: 100 + walletIndex,
        pool: pools[0],
        timestamp: `2026-07-21T02:5${walletIndex}:00.000Z`,
      }),
    );
  }
  for (let tokenIndex = 4; tokenIndex < pools.length; tokenIndex += 1) {
    trades.push(
      trade({
        id: id++,
        wallet: 500 + tokenIndex,
        pool: pools[tokenIndex],
        timestamp: `2026-07-${String(10 + tokenIndex).padStart(2, "0")}T12:00:00.000Z`,
      }),
    );
  }
  return { pools, trades };
}

describe("Robinhood Chain alpha scoring", () => {
  it("emits one provisional signal when four profitable roster wallets converge", () => {
    const fixture = convergenceFixture(4);
    const result = buildRobinhoodAlphaSnapshot({
      now: NOW,
      config: getRobinhoodAlphaConfig({}),
      pools: fixture.pools,
      trades: fixture.trades,
    });

    expect(result.snapshot.status).toBe("provisional");
    expect(result.snapshot.roster).toHaveLength(4);
    expect(result.snapshot.signals).toHaveLength(1);
    expect(result.snapshot.signals[0]).toMatchObject({
      tokenAddress: fixture.pools[0].tokenAddress,
      qualifiedWalletCount: 4,
      provisional: true,
    });
    expect(result.snapshot.warnings.join(" ")).toContain(
      "not a full 30-day sample",
    );
  });

  it("does not signal with only three qualified wallets", () => {
    const fixture = convergenceFixture(3);
    const result = buildRobinhoodAlphaSnapshot({
      now: NOW,
      config: getRobinhoodAlphaConfig({}),
      pools: fixture.pools,
      trades: fixture.trades,
    });
    expect(result.snapshot.roster).toHaveLength(3);
    expect(result.snapshot.signals).toHaveLength(0);
  });

  it("deduplicates trades and filters a consistently copy-correlated wallet", () => {
    const fixture = convergenceFixture(4);
    const copiedWallet = 900;
    const leader = address(100);
    const leaderTrades = fixture.trades.filter(
      (item) =>
        item.walletAddress === leader &&
        item.tokenAddress !== fixture.pools[0].tokenAddress,
    );
    const copied = leaderTrades.map((item, index) => ({
      ...item,
      id: `copied-${index}`,
      txHash: txHash(8_000 + index),
      walletAddress: address(copiedWallet),
    }));
    const duplicate = fixture.trades[0];
    const result = buildRobinhoodAlphaSnapshot({
      now: NOW,
      config: getRobinhoodAlphaConfig({
        ROBINHOOD_ALPHA_MAX_SPRAY_RATIO: "0.8",
      }),
      pools: fixture.pools,
      trades: [...fixture.trades, duplicate, ...copied],
    });

    expect(
      result.trades.filter((item) => item.id === duplicate.id),
    ).toHaveLength(1);
    expect(
      result.snapshot.roster.some(
        (wallet) => wallet.walletAddress === address(copiedWallet),
      ),
    ).toBe(false);
  });

  it("rejects a repeated wallet whose estimated positions are unprofitable", () => {
    const pools = [pool(1), pool(2), pool(3)].map((item) => ({
      ...item,
      priceUsd: 0.5,
    }));
    const trades = pools.map((item, index) =>
      trade({
        id: index + 1,
        wallet: 42,
        pool: item,
        timestamp: `2026-07-${String(11 + index).padStart(2, "0")}T00:00:00.000Z`,
      }),
    );
    const result = buildRobinhoodAlphaSnapshot({
      now: NOW,
      config: getRobinhoodAlphaConfig({ ROBINHOOD_ALPHA_MAX_SPRAY_RATIO: "1" }),
      pools,
      trades,
    });

    expect(result.snapshot.roster).toHaveLength(0);
    expect(result.snapshot.signals).toHaveLength(0);
  });

  it("does not alert on convergence trades outside the tight signal window", () => {
    const fixture = convergenceFixture(4);
    const result = buildRobinhoodAlphaSnapshot({
      now: new Date("2026-07-21T04:00:00.000Z"),
      config: getRobinhoodAlphaConfig({}),
      pools: fixture.pools,
      trades: fixture.trades,
    });

    expect(result.snapshot.roster).toHaveLength(4);
    expect(result.snapshot.signals).toHaveLength(0);
  });
});

describe("Robinhood Chain volume scanning", () => {
  it("removes USDG and wrapped WETH while presenting native ETH as ETH", () => {
    const usdg = {
      ...pool(20),
      tokenAddress: "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
      tokenName: "Global Dollar",
      tokenSymbol: "USDG",
    };
    const wrappedEth = {
      ...pool(21),
      tokenAddress: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
      tokenName: "Wrapped Ether",
      tokenSymbol: "WETH",
    };
    const nativeEth = {
      ...pool(22),
      tokenAddress: "0x0000000000000000000000000000000000000000",
      tokenName: "Wrapped Ether",
      tokenSymbol: "WETH",
    };
    const pools = [usdg, wrappedEth, nativeEth];
    const trades = pools.map((item, index) =>
      trade({
        id: index + 1,
        wallet: 700 + index,
        pool: item,
        timestamp: "2026-07-21T02:45:00.000Z",
      }),
    );

    const result = buildRobinhoodAlphaSnapshot({
      now: NOW,
      config: getRobinhoodAlphaConfig({}),
      pools,
      discoveredPools: pools,
      trades,
    });

    expect(result.snapshot.runnerPools).toHaveLength(1);
    expect(result.snapshot.volumeLeaders).toHaveLength(1);
    expect(result.snapshot.volumeLeaders[0]).toMatchObject({
      tokenAddress: nativeEth.tokenAddress,
      tokenName: "Ethereum",
      tokenSymbol: "ETH",
    });
    expect(result.snapshot.volumeSignals).toHaveLength(1);
    expect(result.snapshot.volumeSignals[0].tokenSymbol).toBe("ETH");
    expect(result.trades.map((item) => item.tokenAddress)).toEqual([
      nativeEth.tokenAddress,
    ]);
    expect(result.pools.map((item) => item.tokenAddress)).toEqual([
      nativeEth.tokenAddress,
    ]);
  });

  it("ranks the bounded pool universe by 24h volume", () => {
    const pools = [
      { ...pool(1), volume24hUsd: 30_000 },
      { ...pool(2), volume24hUsd: 90_000 },
      { ...pool(3), volume24hUsd: 50_000 },
    ];
    const result = buildRobinhoodAlphaSnapshot({
      now: NOW,
      config: getRobinhoodAlphaConfig({}),
      pools: [],
      discoveredPools: pools,
      trades: [],
    });

    expect(
      result.snapshot.volumeLeaders.map((leader) => leader.tokenSymbol),
    ).toEqual(["T2", "T3", "T1"]);
    expect(result.snapshot.volumeLeaders[0]).toMatchObject({
      rank: 1,
      transactions24h: 40,
    });
    expect(result.snapshot.summary.volumePools).toBe(3);
  });

  it("signals a newly discovered pair after it clears the new-pair volume floor", () => {
    const fresh = {
      ...pool(10, "2026-07-21T02:30:00.000Z"),
      volume24hUsd: 15_000,
    };
    const result = buildRobinhoodAlphaSnapshot({
      now: NOW,
      config: getRobinhoodAlphaConfig({}),
      pools: [],
      discoveredPools: [fresh],
      trades: [],
    });

    expect(result.snapshot.volumeSignals).toHaveLength(1);
    expect(result.snapshot.volumeSignals[0]).toMatchObject({
      tokenAddress: fresh.tokenAddress,
      reasons: ["new_pair"],
      isNewPair: true,
    });
  });

  it("signals a high-volume threshold crossing and a later volume surge", () => {
    const base = { ...pool(11), volume24hUsd: 20_000 };
    const previous = buildRobinhoodAlphaSnapshot({
      now: NOW,
      config: getRobinhoodAlphaConfig({}),
      pools: [],
      discoveredPools: [base],
      trades: [],
    });
    const crossed = buildRobinhoodAlphaSnapshot({
      now: new Date("2026-07-21T04:01:00.000Z"),
      config: getRobinhoodAlphaConfig({}),
      pools: [],
      discoveredPools: [{ ...base, volume24hUsd: 35_000 }],
      trades: [],
      previous,
    });

    expect(crossed.snapshot.volumeSignals.at(-1)?.reasons).toEqual(
      expect.arrayContaining(["high_volume", "volume_surge"]),
    );
  });

  it("does not duplicate an unchanged pool signal inside the cooldown", () => {
    const hot = { ...pool(12), volume24hUsd: 50_000 };
    const previous = buildRobinhoodAlphaSnapshot({
      now: NOW,
      config: getRobinhoodAlphaConfig({}),
      pools: [],
      discoveredPools: [hot],
      trades: [],
    });
    const current = buildRobinhoodAlphaSnapshot({
      now: new Date("2026-07-21T03:15:00.000Z"),
      config: getRobinhoodAlphaConfig({}),
      pools: [],
      discoveredPools: [hot],
      trades: [],
      previous,
    });

    expect(current.snapshot.volumeSignals).toHaveLength(1);
    expect(current.snapshot.volumeSignals[0].signalId).toBe(
      previous.snapshot.volumeSignals[0].signalId,
    );
  });
});

function namespace(
  handler: (request: Request) => Promise<Response> | Response,
): DurableObjectNamespace {
  return {
    idFromName: () => ({}) as DurableObjectId,
    get: () =>
      ({
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          handler(input instanceof Request ? input : new Request(input, init)),
      }) as unknown as DurableObjectStub,
  } as unknown as DurableObjectNamespace;
}

describe("Robinhood Chain alpha API and scheduling", () => {
  it("requires the shared Ribbot bearer token", async () => {
    const response = await getRobinhoodAlphaSignals(
      new Request(
        "https://frogx.example/api/frogx/trading-bot/robinhood-alpha",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "secret" },
    );
    expect(response.status).toBe(401);
  });

  it("returns only the public snapshot from stored state", async () => {
    const fixture = convergenceFixture(4);
    const stored = buildRobinhoodAlphaSnapshot({
      now: NOW,
      config: getRobinhoodAlphaConfig({}),
      pools: fixture.pools,
      trades: fixture.trades,
    });
    const env: Env = {
      RIBBOT_TRADING_BOT_TOKEN: "secret",
      TRADING_BOT_ACCOUNTS: namespace(() =>
        Response.json({ status: "ready", state: stored }),
      ),
    };
    const response = await getRobinhoodAlphaSignals(
      new Request(
        "https://frogx.example/api/frogx/trading-bot/robinhood-alpha",
        {
          headers: { Authorization: "Bearer secret" },
        },
      ),
      env,
    );
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(body.status).toBe("provisional");
    expect(body).not.toHaveProperty("trades");
  });

  it("sanitizes excluded assets from a retained pre-policy snapshot", async () => {
    const fixture = convergenceFixture(4);
    const stored = buildRobinhoodAlphaSnapshot({
      now: NOW,
      config: getRobinhoodAlphaConfig({}),
      pools: fixture.pools,
      trades: fixture.trades,
    });
    stored.snapshot.signals[0] = {
      ...stored.snapshot.signals[0],
      tokenAddress: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
      tokenSymbol: "WETH",
    };
    stored.snapshot.volumeLeaders[0] = {
      ...stored.snapshot.volumeLeaders[0],
      tokenAddress: "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
      tokenSymbol: "USDG",
    };
    stored.snapshot.volumeSignals[0] = {
      ...stored.snapshot.volumeSignals[0],
      tokenAddress: "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
      tokenSymbol: "USDG",
    };
    const env: Env = {
      RIBBOT_TRADING_BOT_TOKEN: "secret",
      TRADING_BOT_ACCOUNTS: namespace(() =>
        Response.json({ status: "ready", state: stored }),
      ),
    };

    const response = await getRobinhoodAlphaSignals(
      new Request(
        "https://frogx.example/api/frogx/trading-bot/robinhood-alpha",
        { headers: { Authorization: "Bearer secret" } },
      ),
      env,
    );
    const body = (await response.json()) as RobinhoodAlphaStoredState["snapshot"];
    const symbols = [
      ...body.signals,
      ...body.volumeLeaders,
      ...body.volumeSignals,
    ].map((item) => item.tokenSymbol);

    expect(response.status).toBe(200);
    expect(symbols).not.toContain("USDG");
    expect(symbols).not.toContain("WETH");
    expect(body.volumeLeaders[0].rank).toBe(1);
  });

  it("is a no-op while the operator scanner gate is disabled", async () => {
    const fetcher = vi.fn();
    await runRobinhoodAlphaScanner(
      {},
      { fetch: fetcher as typeof fetch, now: () => NOW },
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("honors persisted nextScanAt without making market-data calls", async () => {
    const fixture = convergenceFixture(4);
    const stored: RobinhoodAlphaStoredState = buildRobinhoodAlphaSnapshot({
      now: NOW,
      config: getRobinhoodAlphaConfig({}),
      pools: fixture.pools,
      trades: fixture.trades,
    });
    const marketFetch = vi.fn();
    const env: Env = {
      ROBINHOOD_ALPHA_SCANNER_ENABLED: "true",
      TRADING_BOT_ACCOUNTS: namespace(() =>
        Response.json({ status: "ready", state: stored }),
      ),
    };
    await runRobinhoodAlphaScanner(env, {
      fetch: marketFetch as typeof fetch,
      now: () => new Date("2026-07-21T03:05:00.000Z"),
    });
    expect(marketFetch).not.toHaveBeenCalled();
  });

  it("retains the last good snapshot and records a bounded refresh error", async () => {
    const fixture = convergenceFixture(4);
    let stored: RobinhoodAlphaStoredState = buildRobinhoodAlphaSnapshot({
      now: NOW,
      config: getRobinhoodAlphaConfig({}),
      pools: fixture.pools,
      trades: fixture.trades,
    });
    const env: Env = {
      ROBINHOOD_ALPHA_SCANNER_ENABLED: "true",
      TRADING_BOT_ACCOUNTS: namespace(async (request) => {
        if (request.method === "PUT") {
          stored = (await request.json()) as RobinhoodAlphaStoredState;
          return Response.json({ status: "ready" });
        }
        return Response.json({ status: "ready", state: stored });
      }),
    };
    const marketFetch = vi.fn(async () => {
      throw new Error("market data unavailable");
    });

    await runRobinhoodAlphaScanner(env, {
      fetch: marketFetch as typeof fetch,
      now: () => new Date("2026-07-21T03:20:00.000Z"),
      requestIntervalMs: 0,
    });

    expect(marketFetch).toHaveBeenCalled();
    expect(stored.snapshot.signals).toHaveLength(1);
    expect(stored.snapshot.lastError).toBe(
      "Every GeckoTerminal pool discovery feed failed",
    );
    expect(stored.snapshot.warnings.join(" ")).toContain(
      "last good scanner snapshot",
    );
  });

  it("backs off after a GeckoTerminal 429 and serializes pool discovery", async () => {
    let stored: RobinhoodAlphaStoredState | undefined;
    const env: Env = {
      ROBINHOOD_ALPHA_SCANNER_ENABLED: "true",
      TRADING_BOT_ACCOUNTS: namespace(async (request) => {
        if (request.method === "PUT") {
          stored = (await request.json()) as RobinhoodAlphaStoredState;
          return Response.json({ status: "ready" });
        }
        return Response.json({ status: "not_found" }, { status: 404 });
      }),
    };
    const responses = [
      Response.json(
        { error: "rate limited" },
        { status: 429, headers: { "Retry-After": "0" } },
      ),
      Response.json({ data: [] }),
      Response.json({ data: [] }),
      Response.json({ data: [] }),
    ];
    const marketFetch = vi.fn(async function (this: unknown) {
      expect(this).toBeUndefined();
      return responses.shift()!;
    }) as unknown as typeof fetch;
    const pause = vi.fn(async (_milliseconds: number) => undefined);

    await runRobinhoodAlphaScanner(env, {
      fetch: marketFetch,
      now: () => NOW,
      sleep: pause,
      requestIntervalMs: 1,
    });

    expect(marketFetch).toHaveBeenCalledTimes(4);
    expect(pause).toHaveBeenNthCalledWith(1, 0);
    expect(pause).toHaveBeenNthCalledWith(2, 1);
    expect(pause).toHaveBeenNthCalledWith(3, 1);
    expect(stored?.snapshot.status).toBe("provisional");
  });

  it("keeps partial pool discovery and labels the skipped feed", async () => {
    let stored: RobinhoodAlphaStoredState | undefined;
    const env: Env = {
      ROBINHOOD_ALPHA_SCANNER_ENABLED: "true",
      TRADING_BOT_ACCOUNTS: namespace(async (request) => {
        if (request.method === "PUT") {
          stored = (await request.json()) as RobinhoodAlphaStoredState;
          return Response.json({ status: "ready" });
        }
        return Response.json({ status: "not_found" }, { status: 404 });
      }),
    };
    const responses = [
      Response.json({ error: "unavailable" }, { status: 400 }),
      Response.json({ data: [] }),
      Response.json({ data: [] }),
    ];
    const marketFetch = vi.fn(async () => responses.shift()!) as unknown as typeof fetch;

    await runRobinhoodAlphaScanner(env, {
      fetch: marketFetch,
      now: () => NOW,
      requestIntervalMs: 0,
    });

    expect(stored?.snapshot.warnings.join(" ")).toContain(
      "Skipped GeckoTerminal top pool discovery",
    );
    expect(stored?.snapshot.summary.volumePools).toBe(0);
  });
});
