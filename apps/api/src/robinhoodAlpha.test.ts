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

function pool(index: number, createdAt = "2026-07-10T00:00:00.000Z"): RobinhoodAlphaPool {
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
    expect(result.snapshot.warnings.join(" ")).toContain("not a full 30-day sample");
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
      (item) => item.walletAddress === leader && item.tokenAddress !== fixture.pools[0].tokenAddress,
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
      config: getRobinhoodAlphaConfig({ ROBINHOOD_ALPHA_MAX_SPRAY_RATIO: "0.8" }),
      pools: fixture.pools,
      trades: [...fixture.trades, duplicate, ...copied],
    });

    expect(result.trades.filter((item) => item.id === duplicate.id)).toHaveLength(1);
    expect(result.snapshot.roster.some((wallet) => wallet.walletAddress === address(copiedWallet))).toBe(false);
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

function namespace(handler: (request: Request) => Promise<Response> | Response): DurableObjectNamespace {
  return {
    idFromName: () => ({}) as DurableObjectId,
    get: () => ({
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        handler(input instanceof Request ? input : new Request(input, init)),
    }) as unknown as DurableObjectStub,
  } as unknown as DurableObjectNamespace;
}

describe("Robinhood Chain alpha API and scheduling", () => {
  it("requires the shared Ribbot bearer token", async () => {
    const response = await getRobinhoodAlphaSignals(
      new Request("https://frogx.example/api/frogx/trading-bot/robinhood-alpha"),
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
      new Request("https://frogx.example/api/frogx/trading-bot/robinhood-alpha", {
        headers: { Authorization: "Bearer secret" },
      }),
      env,
    );
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(body.status).toBe("provisional");
    expect(body).not.toHaveProperty("trades");
  });

  it("is a no-op while the operator scanner gate is disabled", async () => {
    const fetcher = vi.fn();
    await runRobinhoodAlphaScanner({}, { fetch: fetcher as typeof fetch, now: () => NOW });
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
    });

    expect(marketFetch).toHaveBeenCalled();
    expect(stored.snapshot.signals).toHaveLength(1);
    expect(stored.snapshot.lastError).toBe("market data unavailable");
    expect(stored.snapshot.warnings.join(" ")).toContain("last good scanner snapshot");
  });
});
