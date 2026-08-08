import { afterEach, describe, expect, it, vi } from "vitest";
import { encode as encodeMsgpack } from "msgpackr";

import type { Env } from "./env";
import {
  copyTradePumpFunExclusionError,
  deltaNeutralPreviewValue,
  ensureImperialSbfReferral,
  getAuthenticatedTradingBotPerpsWalletSnapshot,
  getManagedPrivyWallet,
  getTradingBotAccount,
  getTradingBotActivity,
  getTradingBotAutoBuyConfigs,
  getTradingBotAutoSellConfigs,
  getTradingBotBundleBuyConfigs,
  getTradingBotConfig,
  getTradingBotOrders,
  getTradingBotOperatorReviews,
  getTradingBotPerpsStatus,
  getTradingBotPnl,
  getTradingBotReferrals,
  isPumpFunBondingCurveTransaction,
  postTradingBotDeltaNeutralPreview,
  postTradingBotDeltaNeutralStart,
  postTradingBotDeltaNeutralStatus,
  postTradingBotDeltaNeutralStop,
  postTradingBotControlCode,
  postTradingBotControlImperial,
  postTradingBotControlPreference,
  postTradingBotControlSession,
  postTradingBotControlWallet,
  postTradingBotSetupReset,
  getTradingBotCopyTradeConfigs,
  postTradingBotAutoBuyCancel,
  postTradingBotAutoBuyExecutionStatus,
  postTradingBotAutoBuyStorage,
  postTradingBotAutoBuyValidation,
  postTradingBotAutoSellCancel,
  postTradingBotAutoSellExecutionStatus,
  postTradingBotAutoSellStorage,
  postTradingBotAutoSellValidation,
  postTradingBotBundleBuyCancel,
  postTradingBotBundleBuyExecution,
  postTradingBotBundleBuyExecutionStatus,
  postTradingBotBundleBuyStorage,
  postTradingBotBundleBuyValidation,
  postTradingBotCopyTradeCancel,
  postTradingBotCopyTradeControl,
  postTradingBotCopyTradeDuplicate,
  postTradingBotCopyTradeExecutionStatus,
  postTradingBotCopyTradeStorage,
  postTradingBotCopyTradeUpdate,
  postTradingBotCopyTradeValidation,
  postTradingBotExecution,
  postTradingBotExecutionStatus,
  postTradingBotMarketRisk,
  postTradingBotOrderCancel,
  postTradingBotOrderStorage,
  postTradingBotOrderValidation,
  postTradingBotOperatorReviewAcknowledge,
  postTradingBotOperatorReviewReconcile,
  postTradingBotPreferenceValidation,
  postTradingBotPositions,
  postTradingBotReferral,
  getTradingBotSniperConfigs,
  postTradingBotSniperCancel,
  postTradingBotSniperExecutionStatus,
  postTradingBotSniperStorage,
  postTradingBotSniperValidation,
  postTradingBotSwap,
  postTradingBotTokenCleanupReview,
  postTradingBotTokenSafety,
  postTradingBotWallet,
  postTradingBotWithdrawalExecution,
  postTradingBotWithdrawalExecutionStatus,
  postTradingBotWithdrawalValidation,
  PrivyWalletRpcError,
  privyRpcFailureWasNotBroadcast,
  runTradingBotAdvancedAutomationMonitors,
  runTradingBotScheduledOrders,
  selectTradingBotAccountWallet,
  signAndSendManagedSolanaTransaction,
} from "./tradingBot";

const originalFetch = globalThis.fetch;
const originalWebSocket = globalThis.WebSocket;

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.WebSocket = originalWebSocket;
  vi.restoreAllMocks();
});

const requestJson = (
  body: unknown,
  headers?: HeadersInit,
  path = "/api/frogx/trading-bot/wallet",
) =>
  new Request(`https://frogx.example${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
    body: JSON.stringify(body),
  });

const fakeTradingBotAccounts = (
  fetcher: (request: Request) => Promise<Response> | Response,
  eventLookup?: (request: Request) => Promise<Response> | Response,
  manualReviewHandler?: (request: Request) => Promise<Response> | Response,
): DurableObjectNamespace =>
  ({
    idFromName: (name: string) => ({ name }),
    get: () => ({
      fetch: (request: Request) => {
        const url = new URL(request.url);
        if (url.pathname === "/event" && request.method === "GET") {
          return eventLookup
            ? eventLookup(request)
            : Response.json({ status: "not_found" }, { status: 404 });
        }
        if (url.pathname.startsWith("/manual-review") && manualReviewHandler) {
          return manualReviewHandler(request);
        }
        if (url.pathname === "/manual-review" && request.method === "GET") {
          return Response.json({ status: "not_found" }, { status: 404 });
        }
        if (url.pathname === "/manual-review" && request.method === "POST") {
          return request.json().then((body) =>
            Response.json({
              status: "ready",
              case: {
                ...(body as Record<string, unknown>),
                status: "open",
                createdAt: "2026-07-10T00:00:00.000Z",
                updatedAt: "2026-07-10T00:00:00.000Z",
              },
            }),
          );
        }
        return fetcher(request);
      },
    }),
  }) as unknown as DurableObjectNamespace;

const storedAccount = (overrides: Record<string, unknown> = {}) => ({
  telegramUserId: "123456",
  solanaWalletAddress: "So11111111111111111111111111111111111111112",
  wallets: [],
  settings: {
    slippageBps: 400,
    priorityFee: 1000,
    sellPriorityFee: 2000,
    defaultBuyAmountIn: "100000000",
    buyPresetAmountsIn: ["100000000", "250000000", "500000000", "1000000000"],
    sellPresetBps: [2500, 5000, 7500, 10000],
    botMode: "advanced",
    confirmTrades: true,
    sellProtection: true,
    autoBuyEnabled: false,
    instantAutoBuyEnabled: false,
    instantAutoBuyAmountIn: "100000000",
    instantAutoBuyMinLiquidityUsd: 1000,
    autoSellEnabled: false,
    sniperEnabled: false,
    mevProtection: true,
  },
  watchlist: ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"],
  hiddenTokens: [],
  createdAt: "2026-07-04T00:00:00.000Z",
  updatedAt: "2026-07-04T00:00:01.000Z",
  ...overrides,
});

const generateTestAuthorizationPrivateKey = async (): Promise<string> => {
  const key = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"],
  );
  const exported = await crypto.subtle.exportKey("pkcs8", key.privateKey);
  return Buffer.from(exported).toString("base64");
};

const installTitanQuoteWebSocketMock = (input: {
  amountIn: number;
  amountOut: number;
  priceImpactBps: number;
}) => {
  class FakeTitanWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState = FakeTitanWebSocket.CONNECTING;
    private listeners = new Map<
      string,
      Set<(event: Event | { data: Uint8Array }) => void>
    >();

    constructor() {
      setTimeout(() => {
        this.readyState = FakeTitanWebSocket.OPEN;
        this.dispatch("open", new Event("open"));
      }, 0);
    }

    addEventListener(
      type: string,
      listener: (event: Event | { data: Uint8Array }) => void,
    ) {
      const listeners = this.listeners.get(type) ?? new Set();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    }

    removeEventListener(
      type: string,
      listener: (event: Event | { data: Uint8Array }) => void,
    ) {
      this.listeners.get(type)?.delete(listener);
    }

    send() {
      setTimeout(() => {
        this.dispatch("message", {
          data: encodeMsgpack({ Response: { stream: { id: 1 } } }),
        });
        this.dispatch("message", {
          data: encodeMsgpack({
            StreamData: {
              id: 1,
              payload: {
                SwapQuotes: {
                  id: "route-auto-buy",
                  quotes: {
                    titan: {
                      inAmount: input.amountIn,
                      outAmount: input.amountOut,
                      slippageBps: input.priceImpactBps,
                      steps: [{ label: "titan" }],
                      transaction: "AQID",
                      instructions: [],
                      addressLookupTables: [],
                    },
                  },
                },
              },
            },
          }),
        });
      }, 0);
    }

    close() {
      this.readyState = FakeTitanWebSocket.CLOSED;
    }

    private dispatch(type: string, event: Event | { data: Uint8Array }) {
      for (const listener of this.listeners.get(type) ?? []) {
        listener(event);
      }
    }
  }

  globalThis.WebSocket = FakeTitanWebSocket as unknown as typeof WebSocket;
};

describe("Imperial SBF referral attribution", () => {
  const wallet = "So11111111111111111111111111111111111111112";

  it("keeps reconnects already attributed to sbf idempotent", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        referredBy: {
          wallet: "SbfReferrer111111111111111111111111111111111",
          username: "sbf",
        },
      }),
    );

    await expect(
      ensureImperialSbfReferral(wallet, fetcher as typeof fetch),
    ).resolves.toEqual({ referrerUsername: "sbf" });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("registers new wallets through the sbf referral and verifies it", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ referredBy: null }))
      .mockResolvedValueOnce(Response.json({ status: "created" }))
      .mockResolvedValueOnce(
        Response.json({
          referredBy: {
            wallet: "SbfReferrer111111111111111111111111111111111",
            username: "sbf",
          },
        }),
      );

    await expect(
      ensureImperialSbfReferral(wallet, fetcher as typeof fetch),
    ).resolves.toEqual({ referrerUsername: "sbf" });
    expect(fetcher).toHaveBeenCalledTimes(3);

    const [url, init] = fetcher.mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "https://api.imperial.space/api/v1/passthrough/referrals",
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      refereeWallet: wallet,
      referrerUsername: "sbf",
    });
  });

  it("rejects wallets attributed to a different referrer", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        referredBy: {
          wallet: "OtherReferrer1111111111111111111111111111111",
          username: "someone-else",
        },
      }),
    );

    await expect(
      ensureImperialSbfReferral(wallet, fetcher as typeof fetch),
    ).resolves.toEqual({
      error: "This Imperial account already uses a different referral",
      status: 409,
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("fails closed when Imperial does not confirm the sbf referral", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ referredBy: null }))
      .mockResolvedValueOnce(Response.json({ status: "created" }))
      .mockResolvedValueOnce(Response.json({ referredBy: null }));

    await expect(
      ensureImperialSbfReferral(wallet, fetcher as typeof fetch),
    ).resolves.toEqual({
      error: "Imperial did not confirm the SBF referral",
      status: 502,
    });
  });
});

describe("trading bot config", () => {
  it("exposes non-secret Ribbot routes and hides managed wallets until bot auth is configured", async () => {
    const response = await getTradingBotConfig({
      PRIVY_APP_ID: "privy-app",
      PRIVY_APP_SECRET: "privy-secret",
    } as Env);
    const data = (await response.json()) as {
      walletEndpoint: string;
      swapEndpoint: string;
      executionEndpoint: string;
      executionStatusEndpoint: string;
      publicSwapEndpoint: string;
      positionsEndpoint: string;
      pnlEndpoint: string;
      tokenCleanupEndpoint: string;
      tokenSafetyEndpoint: string;
      marketRiskEndpoint: string;
      referralsEndpoint: string;
      activityEndpoint: string;
      perpsStatusEndpoint: string;
      deltaNeutralPreviewEndpoint: string;
      deltaNeutralStartEndpoint: string;
      deltaNeutralStatusEndpoint: string;
      deltaNeutralStopEndpoint: string;
      ordersEndpoint: string;
      ordersStorageEndpoint: string;
      ordersCancelEndpoint: string;
      withdrawalsEndpoint: string;
      withdrawalExecutionEndpoint: string;
      withdrawalExecutionStatusEndpoint: string;
      copyTradeEndpoint: string;
      copyTradeStorageEndpoint: string;
      copyTradeCancelEndpoint: string;
      copyTradeControlEndpoint: string;
      copyTradeUpdateEndpoint: string;
      copyTradeDuplicateEndpoint: string;
      sniperEndpoint: string;
      sniperStorageEndpoint: string;
      sniperCancelEndpoint: string;
      sniperStatusEndpoint: string;
      autoBuyEndpoint: string;
      autoBuyStorageEndpoint: string;
      autoBuyCancelEndpoint: string;
      bundleBuyEndpoint: string;
      bundleBuyStorageEndpoint: string;
      bundleBuyCancelEndpoint: string;
      bundleBuyExecutionEndpoint: string;
      bundleBuyExecutionStatusEndpoint: string;
      autoSellEndpoint: string;
      autoSellStorageEndpoint: string;
      autoSellCancelEndpoint: string;
      preferencesEndpoint: string;
      accountEndpoint: string;
      controlCodeEndpoint: string;
      setupResetEndpoint: string;
      controlSessionEndpoint: string;
      controlImperialEndpoint: string;
      controlPreferencesEndpoint: string;
      controlWalletEndpoint: string;
      scheduler: {
        enabled: boolean;
        liveExecutionEnabled: boolean;
        reconciliationEnabled: boolean;
        reconcileAfterSeconds: number;
      };
      reconciliation: {
        manualReviewAfterSeconds: number;
        automaticRetry: boolean;
      };
      capabilities: {
        privyWallets: boolean;
        liveSigning: boolean;
        liveExecution: boolean;
        liveExecutionGate: boolean;
        executionStatus: boolean;
        accountStorage: boolean;
        pnl: boolean;
        tokenCleanup: boolean;
        tokenSafety: boolean;
        marketRisk: boolean;
        controlCodes: boolean;
        walletControls: boolean;
        botAccessRevocation: boolean;
        orderValidation: boolean;
        limitOrders: boolean;
        stopLoss: boolean;
        trailingStops: boolean;
        dca: boolean;
        serverOrderStorage: boolean;
        scheduledExecution: boolean;
        liveScheduledExecution: boolean;
        withdrawalValidation: boolean;
        withdrawals: boolean;
        liveWithdrawals: boolean;
        copyTrading: boolean;
        copyTradeValidation: boolean;
        serverCopyTradeStorage: boolean;
        copyTradeMonitoring: boolean;
        liveCopyTrading: boolean;
        sniper: boolean;
        sniperValidation: boolean;
        serverSniperStorage: boolean;
        sniperMonitoring: boolean;
        liveSniper: boolean;
        autoBuy: boolean;
        autoBuyValidation: boolean;
        serverAutoBuyStorage: boolean;
        autoBuyMonitoring: boolean;
        liveAutoBuy: boolean;
        bundleBuy: boolean;
        bundleBuyValidation: boolean;
        serverBundleBuyStorage: boolean;
        liveBundleBuy: boolean;
        autoSell: boolean;
        autoSellValidation: boolean;
        serverAutoSellStorage: boolean;
        autoSellMonitoring: boolean;
        liveAutoSell: boolean;
        preferences: boolean;
        serverPreferenceStorage: boolean;
        activity: boolean;
        watchlists: boolean;
        hiddenTokens: boolean;
        mevProtection: boolean;
        referrals: boolean;
        serverReferralStorage: boolean;
        rewardTracking: boolean;
        deltaNeutral: boolean;
        liveDeltaNeutral: boolean;
      };
      perps: {
        defaultStrategy: string;
        defaultPreset: string;
        profileIndex: number;
        minimumProfileUsdc: number;
        liveEntryCapUsd: number;
        dailyBudgetUsd: number;
        maxCycles: number;
        explicitConfirmationRequired: boolean;
      };
      botAuth: { required: boolean; configured: boolean };
    };

    expect(data.walletEndpoint).toBe("/api/frogx/trading-bot/wallet");
    expect(data.swapEndpoint).toBe("/api/frogx/trading-bot/swap");
    expect(data.executionEndpoint).toBe("/api/frogx/trading-bot/execute");
    expect(data.executionStatusEndpoint).toBe(
      "/api/frogx/trading-bot/execute/status",
    );
    expect(data.publicSwapEndpoint).toBe("/api/frogx/swap");
    expect(data.positionsEndpoint).toBe("/api/frogx/trading-bot/positions");
    expect(data.pnlEndpoint).toBe("/api/frogx/trading-bot/pnl");
    expect(data.tokenCleanupEndpoint).toBe(
      "/api/frogx/trading-bot/token-cleanup/review",
    );
    expect(data.tokenSafetyEndpoint).toBe(
      "/api/frogx/trading-bot/token-safety",
    );
    expect(data.marketRiskEndpoint).toBe("/api/frogx/trading-bot/market-risk");
    expect(data.referralsEndpoint).toBe("/api/frogx/trading-bot/referrals");
    expect(data.activityEndpoint).toBe("/api/frogx/trading-bot/activity");
    expect(data.perpsStatusEndpoint).toBe(
      "/api/frogx/trading-bot/perps/status",
    );
    expect(data.deltaNeutralPreviewEndpoint).toBe(
      "/api/frogx/trading-bot/perps/delta-neutral/preview",
    );
    expect(data.deltaNeutralStartEndpoint).toBe(
      "/api/frogx/trading-bot/perps/delta-neutral/start",
    );
    expect(data.deltaNeutralStatusEndpoint).toBe(
      "/api/frogx/trading-bot/perps/delta-neutral/status",
    );
    expect(data.deltaNeutralStopEndpoint).toBe(
      "/api/frogx/trading-bot/perps/delta-neutral/stop",
    );
    expect(data.ordersEndpoint).toBe("/api/frogx/trading-bot/orders/validate");
    expect(data.ordersStorageEndpoint).toBe("/api/frogx/trading-bot/orders");
    expect(data.ordersCancelEndpoint).toBe(
      "/api/frogx/trading-bot/orders/cancel",
    );
    expect(data.withdrawalsEndpoint).toBe(
      "/api/frogx/trading-bot/withdrawals/validate",
    );
    expect(data.withdrawalExecutionEndpoint).toBe(
      "/api/frogx/trading-bot/withdrawals/execute",
    );
    expect(data.withdrawalExecutionStatusEndpoint).toBe(
      "/api/frogx/trading-bot/withdrawals/status",
    );
    expect(data.copyTradeEndpoint).toBe(
      "/api/frogx/trading-bot/copytrade/validate",
    );
    expect(data.copyTradeStorageEndpoint).toBe(
      "/api/frogx/trading-bot/copytrade",
    );
    expect(data.copyTradeCancelEndpoint).toBe(
      "/api/frogx/trading-bot/copytrade/cancel",
    );
    expect(data.copyTradeControlEndpoint).toBe(
      "/api/frogx/trading-bot/copytrade/control",
    );
    expect(data.copyTradeUpdateEndpoint).toBe(
      "/api/frogx/trading-bot/copytrade/update",
    );
    expect(data.copyTradeDuplicateEndpoint).toBe(
      "/api/frogx/trading-bot/copytrade/duplicate",
    );
    expect(data.sniperEndpoint).toBe("/api/frogx/trading-bot/sniper/validate");
    expect(data.sniperStorageEndpoint).toBe("/api/frogx/trading-bot/sniper");
    expect(data.sniperCancelEndpoint).toBe(
      "/api/frogx/trading-bot/sniper/cancel",
    );
    expect(data.sniperStatusEndpoint).toBe(
      "/api/frogx/trading-bot/sniper/status",
    );
    expect(data.autoBuyEndpoint).toBe(
      "/api/frogx/trading-bot/auto-buy/validate",
    );
    expect(data.autoBuyStorageEndpoint).toBe("/api/frogx/trading-bot/auto-buy");
    expect(data.autoBuyCancelEndpoint).toBe(
      "/api/frogx/trading-bot/auto-buy/cancel",
    );
    expect(data.bundleBuyEndpoint).toBe(
      "/api/frogx/trading-bot/bundle-buy/validate",
    );
    expect(data.bundleBuyStorageEndpoint).toBe(
      "/api/frogx/trading-bot/bundle-buy",
    );
    expect(data.bundleBuyCancelEndpoint).toBe(
      "/api/frogx/trading-bot/bundle-buy/cancel",
    );
    expect(data.bundleBuyExecutionEndpoint).toBe(
      "/api/frogx/trading-bot/bundle-buy/execute",
    );
    expect(data.bundleBuyExecutionStatusEndpoint).toBe(
      "/api/frogx/trading-bot/bundle-buy/status",
    );
    expect(data.autoSellEndpoint).toBe(
      "/api/frogx/trading-bot/auto-sell/validate",
    );
    expect(data.autoSellStorageEndpoint).toBe(
      "/api/frogx/trading-bot/auto-sell",
    );
    expect(data.autoSellCancelEndpoint).toBe(
      "/api/frogx/trading-bot/auto-sell/cancel",
    );
    expect(data.preferencesEndpoint).toBe(
      "/api/frogx/trading-bot/preferences/validate",
    );
    expect(data.accountEndpoint).toBe("/api/frogx/trading-bot/account");
    expect(data.controlCodeEndpoint).toBe(
      "/api/frogx/trading-bot/control/code",
    );
    expect(data.setupResetEndpoint).toBe(
      "/api/frogx/trading-bot/setup/reset",
    );
    expect(data.controlSessionEndpoint).toBe(
      "/api/frogx/trading-bot/control/session",
    );
    expect(data.controlImperialEndpoint).toBe(
      "/api/frogx/trading-bot/control/imperial",
    );
    expect(data.controlPreferencesEndpoint).toBe(
      "/api/frogx/trading-bot/control/preferences",
    );
    expect(data.controlWalletEndpoint).toBe(
      "/api/frogx/trading-bot/control/wallet",
    );
    expect(data.scheduler).toEqual({
      enabled: false,
      liveExecutionEnabled: false,
      reconciliationEnabled: false,
      reconcileAfterSeconds: 60,
    });
    expect(data.reconciliation).toEqual({
      manualReviewAfterSeconds: 900,
      automaticRetry: false,
      operatorReviewConfigured: false,
    });
    expect(data.capabilities.privyWallets).toBe(false);
    expect(data.capabilities.liveSigning).toBe(false);
    expect(data.capabilities.liveExecution).toBe(false);
    expect(data.capabilities.liveExecutionGate).toBe(false);
    expect(data.capabilities.executionStatus).toBe(false);
    expect(data.capabilities.accountStorage).toBe(false);
    expect(data.capabilities.pnl).toBe(false);
    expect(data.capabilities.tokenCleanup).toBe(false);
    expect(data.capabilities.tokenSafety).toBe(false);
    expect(data.capabilities.marketRisk).toBe(false);
    expect(data.capabilities.controlCodes).toBe(false);
    expect(data.capabilities.walletControls).toBe(false);
    expect(data.capabilities.botAccessRevocation).toBe(false);
    expect(data.capabilities.orderValidation).toBe(true);
    expect(data.capabilities.limitOrders).toBe(true);
    expect(data.capabilities.stopLoss).toBe(true);
    expect(data.capabilities.trailingStops).toBe(true);
    expect(data.capabilities.dca).toBe(true);
    expect(data.capabilities.serverOrderStorage).toBe(false);
    expect(data.capabilities.scheduledExecution).toBe(false);
    expect(data.capabilities.liveScheduledExecution).toBe(false);
    expect(data.capabilities.withdrawalValidation).toBe(true);
    expect(data.capabilities.withdrawals).toBe(true);
    expect(data.capabilities.liveWithdrawals).toBe(false);
    expect(data.capabilities.copyTrading).toBe(true);
    expect(data.capabilities.copyTradeValidation).toBe(true);
    expect(data.capabilities.serverCopyTradeStorage).toBe(false);
    expect(data.capabilities.copyTradeMonitoring).toBe(false);
    expect(data.capabilities.liveCopyTrading).toBe(false);
    expect(data.capabilities.sniper).toBe(true);
    expect(data.capabilities.sniperValidation).toBe(true);
    expect(data.capabilities.serverSniperStorage).toBe(false);
    expect(data.capabilities.sniperMonitoring).toBe(false);
    expect(data.capabilities.liveSniper).toBe(false);
    expect(data.capabilities.autoBuy).toBe(true);
    expect(data.capabilities.autoBuyValidation).toBe(true);
    expect(data.capabilities.serverAutoBuyStorage).toBe(false);
    expect(data.capabilities.autoBuyMonitoring).toBe(false);
    expect(data.capabilities.liveAutoBuy).toBe(false);
    expect(data.capabilities.bundleBuy).toBe(true);
    expect(data.capabilities.bundleBuyValidation).toBe(true);
    expect(data.capabilities.serverBundleBuyStorage).toBe(false);
    expect(data.capabilities.liveBundleBuy).toBe(false);
    expect(data.capabilities.autoSell).toBe(true);
    expect(data.capabilities.autoSellValidation).toBe(true);
    expect(data.capabilities.serverAutoSellStorage).toBe(false);
    expect(data.capabilities.autoSellMonitoring).toBe(false);
    expect(data.capabilities.liveAutoSell).toBe(false);
    expect(data.capabilities.preferences).toBe(true);
    expect(data.capabilities.serverPreferenceStorage).toBe(false);
    expect(data.capabilities.activity).toBe(false);
    expect(data.capabilities.watchlists).toBe(true);
    expect(data.capabilities.hiddenTokens).toBe(true);
    expect(data.capabilities.mevProtection).toBe(true);
    expect(data.capabilities.referrals).toBe(true);
    expect(data.capabilities.serverReferralStorage).toBe(false);
    expect(data.capabilities.rewardTracking).toBe(false);
    expect(data.capabilities.deltaNeutral).toBe(false);
    expect(data.capabilities.liveDeltaNeutral).toBe(false);
    expect(data.perps).toEqual({
      defaultStrategy: "delta_neutral",
      defaultPreset: "low",
      profileIndex: 1,
      minimumProfileUsdc: 50,
      liveEntryCapUsd: 60,
      dailyBudgetUsd: 5,
      maxCycles: 1,
      explicitConfirmationRequired: true,
    });
    expect(data.botAuth).toEqual({ required: true, configured: false });
  });

  it("advertises managed wallets only when Privy and Ribbot auth are both configured", async () => {
    const response = await getTradingBotConfig({
      PRIVY_APP_ID: "privy-app",
      PRIVY_APP_SECRET: "privy-secret",
      RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
    } as Env);
    const data = (await response.json()) as {
      capabilities: { privyWallets: boolean };
      botAuth: { required: boolean; configured: boolean };
    };

    expect(data.capabilities.privyWallets).toBe(true);
    expect(data.botAuth).toEqual({ required: true, configured: true });
  });

  it("accepts the deployed legacy bot-token and Privy signer aliases", async () => {
    const response = await getTradingBotConfig({
      PRIVY_APP_ID: "privy-app",
      PRIVY_APP_SECRET: "privy-secret",
      PRIVY_SIGNER_ID: "legacy-signer-id",
      PRIVY_AUTHORIZATION_PRIVATE_KEY: "legacy-private-key",
      FROGX_BOT_API_TOKEN: "legacy-bot-token",
      TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(() =>
        Response.json({ status: "ready" }),
      ),
    } as Env);
    const data = (await response.json()) as {
      capabilities: { privyWallets: boolean; liveSigning: boolean };
      botAuth: { required: boolean; configured: boolean };
    };

    expect(data.capabilities.privyWallets).toBe(true);
    expect(data.capabilities.liveSigning).toBe(true);
    expect(data.botAuth).toEqual({ required: true, configured: true });
  });

  it("advertises server-side account storage when the Durable Object is bound", async () => {
    const response = await getTradingBotConfig({
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(() =>
        Response.json({ status: "ready" }),
      ),
      TRADING_BOT_OPERATOR_TOKEN: "operator-token",
    } as Env);
    const data = (await response.json()) as {
      capabilities: {
        accountStorage: boolean;
        controlCodes: boolean;
        walletControls: boolean;
        botAccessRevocation: boolean;
        serverPreferenceStorage: boolean;
      };
      reconciliation: { operatorReviewConfigured: boolean };
    };

    expect(data.capabilities.accountStorage).toBe(true);
    expect(data.capabilities.controlCodes).toBe(true);
    expect(data.capabilities.walletControls).toBe(true);
    expect(data.capabilities.botAccessRevocation).toBe(true);
    expect(data.capabilities.serverPreferenceStorage).toBe(true);
    expect(data.reconciliation.operatorReviewConfigured).toBe(true);
  });

  it("advertises advanced monitoring and live execution only when their FTX flags are enabled", async () => {
    const response = await getTradingBotConfig({
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(() =>
        Response.json({ status: "ready" }),
      ),
      TRADING_BOT_ADVANCED_MONITOR_ENABLED: "true",
      TRADING_BOT_COPYTRADE_MONITOR_ENABLED: "true",
      TRADING_BOT_COPYTRADE_LIVE_EXECUTION_ENABLED: "true",
      TRADING_BOT_SNIPER_MONITOR_ENABLED: "true",
      TRADING_BOT_SNIPER_LIVE_EXECUTION_ENABLED: "true",
      TRADING_BOT_AUTO_BUY_MONITOR_ENABLED: "true",
      TRADING_BOT_AUTO_SELL_MONITOR_ENABLED: "true",
      TRADING_BOT_BUNDLE_BUY_LIVE_EXECUTION_ENABLED: "true",
      TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
      SOLANA_RPC_URL: "https://rpc.example",
      JUPITER_API_KEY: "jupiter-key",
    } as Env);
    const data = (await response.json()) as {
      capabilities: {
        copyTradeMonitoring: boolean;
        liveCopyTrading: boolean;
        sniperMonitoring: boolean;
        liveSniper: boolean;
        autoBuyMonitoring: boolean;
        autoSellMonitoring: boolean;
        liveAutoBuy: boolean;
        liveBundleBuy: boolean;
        liveAutoSell: boolean;
      };
    };

    expect(data.capabilities.copyTradeMonitoring).toBe(true);
    expect(data.capabilities.liveCopyTrading).toBe(true);
    expect(data.capabilities.sniperMonitoring).toBe(true);
    expect(data.capabilities.liveSniper).toBe(true);
    expect(data.capabilities.autoBuyMonitoring).toBe(true);
    expect(data.capabilities.autoSellMonitoring).toBe(true);
    expect(data.capabilities.liveAutoBuy).toBe(false);
    expect(data.capabilities.liveBundleBuy).toBe(true);
    expect(data.capabilities.liveAutoSell).toBe(false);
  });

  it("keeps Delta Neutral disabled until both service and live gates are explicit", async () => {
    const base = {
      RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(() =>
        Response.json({ status: "ready" }),
      ),
      PERP_FARMER_ENABLED: "true",
      PERP_FARMER_SERVICE_URL: "https://perp-farmer.internal",
      PERP_FARMER_SERVICE_TOKEN: "service-token",
    } as Env;
    const previewOnly = (await (
      await getTradingBotConfig(base)
    ).json()) as {
      capabilities: { deltaNeutral: boolean; liveDeltaNeutral: boolean };
    };
    const live = (await (
      await getTradingBotConfig({
        ...base,
        PERP_FARMER_LIVE_EXECUTION_ENABLED: "true",
      })
    ).json()) as {
      capabilities: { deltaNeutral: boolean; liveDeltaNeutral: boolean };
    };

    expect(previewOnly.capabilities).toMatchObject({
      deltaNeutral: true,
      liveDeltaNeutral: false,
    });
    expect(live.capabilities).toMatchObject({
      deltaNeutral: true,
      liveDeltaNeutral: true,
    });
  });
});

describe("trading bot Delta Neutral proxy", () => {
  const envWithStore = (
    handler: (request: Request) => Promise<Response> | Response,
  ) =>
    ({
      RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(handler),
    }) as Env;

  it("requires bot auth and explicit live confirmation", async () => {
    const handler = vi.fn(() => Response.json({ status: "ready" }));
    const unauthorized = await postTradingBotDeltaNeutralPreview(
      requestJson(
        { telegramUserId: "123456" },
        undefined,
        "/api/frogx/trading-bot/perps/delta-neutral/preview",
      ),
      envWithStore(handler),
    );
    const unconfirmed = await postTradingBotDeltaNeutralStart(
      requestJson(
        {
          telegramUserId: "123456",
          idempotencyKey: "delta-neutral:12345678",
          confirmLive: false,
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/perps/delta-neutral/start",
      ),
      envWithStore(handler),
    );

    expect(unauthorized.status).toBe(401);
    expect(unconfirmed.status).toBe(400);
    await expect(unconfirmed.json()).resolves.toEqual({
      error: "confirmLive must be true",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("forwards only canonical identity and start fields to the account store", async () => {
    const requests: Array<{ path: string; body: unknown }> = [];
    const env = envWithStore(async (request) => {
      requests.push({
        path: new URL(request.url).pathname,
        body: await request.json(),
      });
      return Response.json({ status: "ready" });
    });
    const headers = { Authorization: "Bearer ribbot-token" };

    const responses = await Promise.all([
      postTradingBotDeltaNeutralPreview(
        requestJson(
          { telegramUserId: "123456", strategy: "untrusted" },
          headers,
        ),
        env,
      ),
      postTradingBotDeltaNeutralStart(
        requestJson(
          {
            telegramUserId: "123456",
            idempotencyKey: "delta-neutral:12345678",
            confirmLive: true,
            preset: "untrusted",
          },
          headers,
        ),
        env,
      ),
      postTradingBotDeltaNeutralStatus(
        requestJson({ telegramUserId: "123456" }, headers),
        env,
      ),
      postTradingBotDeltaNeutralStop(
        requestJson({ telegramUserId: "123456" }, headers),
        env,
      ),
    ]);

    expect(responses.every((response) => response.ok)).toBe(true);
    expect(requests).toEqual([
      {
        path: "/delta-neutral/preview",
        body: { telegramUserId: "123456" },
      },
      {
        path: "/delta-neutral/start",
        body: {
          telegramUserId: "123456",
          idempotencyKey: "delta-neutral:12345678",
          confirmLive: true,
        },
      },
      {
        path: "/delta-neutral/status",
        body: { telegramUserId: "123456" },
      },
      {
        path: "/delta-neutral/stop",
        body: { telegramUserId: "123456" },
      },
    ]);
  });
});

describe("Delta Neutral preview normalization", () => {
  const wallet = "So11111111111111111111111111111111111111112";
  const preview = (liveEntryCapUsd: number) =>
    deltaNeutralPreviewValue(
      {
        strategy: "delta_neutral",
        preset: "low",
        wallet,
        profileIndex: 1,
        profileAddress: "Vote111111111111111111111111111111111111111",
        profileUsdc: 70.67903,
        minimumProfileUsdc: 50,
        profileFunded: true,
        liveReady: true,
        liveEntryCapUsd,
        maxCycles: 1,
        blockers: [],
      },
      wallet,
    );

  it("keeps a matching service entry cap ready", () => {
    expect(preview(60)).toMatchObject({
      profileAddress: "Vote111111111111111111111111111111111111111",
      liveReady: true,
      liveEntryCapUsd: 60,
      serviceLiveEntryCapUsd: 60,
      entryCapCompatible: true,
      blockers: [],
    });
  });

  it("preserves the profile but blocks a service entry cap above the FTX limit", () => {
    expect(preview(75)).toMatchObject({
      profileAddress: "Vote111111111111111111111111111111111111111",
      profileUsdc: 70.67903,
      profileFunded: true,
      liveReady: false,
      liveEntryCapUsd: 60,
      serviceLiveEntryCapUsd: 75,
      entryCapCompatible: false,
      blockers: [
        "Delta Neutral requires a $75 live entry cap, above the $60 Frog Trading Exchange beta limit.",
      ],
    });
  });
});

describe("trading bot wallet provisioning", () => {
  it("links quote-only external wallets without requiring Privy config", async () => {
    const response = await postTradingBotWallet(
      requestJson({
        telegramUserId: "123456",
        externalAddress: "So11111111111111111111111111111111111111112",
      }),
      {} as Env,
    );
    const data = (await response.json()) as {
      status: string;
      walletSource: string;
      solanaWalletAddress: string;
    };

    expect(response.status).toBe(200);
    expect(data).toEqual({
      status: "ready",
      walletSource: "external",
      solanaWalletAddress: "So11111111111111111111111111111111111111112",
    });
  });

  it("reports missing Privy Worker secrets for managed wallet provisioning", async () => {
    const response = await postTradingBotWallet(
      requestJson({ telegramUserId: "123456" }),
      {} as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(200);
    expect(data).toEqual({
      status: "not_configured",
      required: ["PRIVY_APP_ID", "PRIVY_APP_SECRET"],
    });
  });

  it("requires FTX-side Ribbot auth before Privy-backed wallet creation", async () => {
    const response = await postTradingBotWallet(
      requestJson({ telegramUserId: "123456" }),
      {
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["RIBBOT_TRADING_BOT_TOKEN"],
    });
  });

  it("rejects wrong Ribbot auth tokens before calling Privy", async () => {
    const response = await postTradingBotWallet(
      requestJson(
        { telegramUserId: "123456" },
        { Authorization: "Bearer wrong-token" },
      ),
      {
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
      } as Env,
    );
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: "Unauthorized" });
  });

  it("syncs only the first linked Privy Solana wallet into FTX account storage", async () => {
    const wallets = [
      {
        type: "wallet",
        chain_type: "solana",
        wallet_client_type: "privy",
        id: "wallet_1",
        address: "11111111111111111111111111111111",
      },
      {
        type: "wallet",
        chain_type: "solana",
        wallet_client_type: "privy",
        id: "wallet_2",
        address: "So11111111111111111111111111111111111111112",
      },
      {
        type: "wallet",
        chain_type: "solana",
        wallet_client_type: "phantom",
        id: "external_wallet",
        address: "Vote111111111111111111111111111111111111111",
      },
    ];
    globalThis.fetch = vi.fn(async (input) => {
      expect(String(input)).toBe(
        "https://api.privy.io/v1/users/telegram/telegram_user_id",
      );
      return Response.json({ id: "user_123", linked_accounts: wallets });
    });
    const account = storedAccount({
      walletSource: "privy",
      privyUserId: "user_123",
      privyWalletId: "wallet_1",
      solanaWalletAddress: wallets[0].address,
      activeWalletId: "wallet_1",
      wallets: wallets.slice(0, 1).map((wallet) => ({
        walletId: wallet.id,
        label: "Spot & NFT Wallet (Privy)",
        role: "spot_nft",
        walletSource: "privy",
        privyUserId: "user_123",
        privyWalletId: wallet.id,
        solanaWalletAddress: wallet.address,
        createdAt: "2026-07-12T00:00:00.000Z",
      })),
    });

    const response = await postTradingBotWallet(
      requestJson(
        { telegramUserId: "123456", username: "ribbit" },
        { Authorization: "Bearer ribbot-token" },
      ),
      {
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          expect(new URL(request.url).pathname).toBe("/wallet/sync");
          const body = (await request.json()) as {
            privyUserId: string;
            wallets: Array<{ walletId: string; solanaWalletAddress: string }>;
          };
          expect(body.privyUserId).toBe("user_123");
          expect(body.wallets).toHaveLength(1);
          expect(body.wallets.map((wallet) => wallet.walletId)).toEqual([
            "wallet_1",
          ]);
          return Response.json({ status: "ready", account });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      activeWalletId: string;
      wallets: Array<{ walletId: string }>;
    };

    expect(response.status).toBe(200);
    expect(data.activeWalletId).toBe("wallet_1");
    expect(data.wallets.map((wallet) => wallet.walletId)).toEqual(["wallet_1"]);
  });

  it("reuses an existing Privy wallet without creating a second wallet", async () => {
    const spotAddress = "11111111111111111111111111111111";
    const privyFetch = vi.fn(async (input) => {
      const url = String(input);
      expect(url).toBe(
        "https://api.privy.io/v1/users/telegram/telegram_user_id",
      );
      return Response.json({
        id: "user_123",
        linked_accounts: [
          {
            type: "wallet",
            chain_type: "solana",
            wallet_client_type: "privy",
            wallet_index: 0,
            id: "wallet_1",
            address: spotAddress,
          },
        ],
      });
    });
    globalThis.fetch = privyFetch as typeof fetch;

    const response = await postTradingBotWallet(
      requestJson(
        { telegramUserId: "123456", username: "ribbit" },
        { Authorization: "Bearer ribbot-token" },
      ),
      {
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          expect(new URL(request.url).pathname).toBe("/wallet/sync");
          const body = (await request.json()) as {
            privyUserId: string;
            wallets: Array<{
              walletId: string;
              label: string;
              role: string;
              solanaWalletAddress: string;
            }>;
          };
          expect(body.wallets).toEqual([
            expect.objectContaining({
              walletId: "wallet_1",
              label: "Spot & NFT Wallet (Privy)",
              role: "spot_nft",
              solanaWalletAddress: spotAddress,
            }),
          ]);
          const account = storedAccount({
            walletSource: "privy",
            privyUserId: body.privyUserId,
            privyWalletId: "wallet_1",
            solanaWalletAddress: spotAddress,
            activeWalletId: "wallet_1",
            wallets: body.wallets,
          });
          return Response.json({ status: "ready", account });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      activeWalletId: string;
      wallets: Array<{ walletId: string; role: string }>;
    };

    expect(response.status).toBe(200);
    expect(data.activeWalletId).toBe("wallet_1");
    expect(data.wallets).toEqual([
      expect.objectContaining({ walletId: "wallet_1", role: "spot_nft" }),
    ]);
    expect(privyFetch).toHaveBeenCalledOnce();
  });

  it("selects an active wallet through authenticated FTX account storage", async () => {
    const account = storedAccount({
      walletSource: "privy",
      privyUserId: "user_123",
      privyWalletId: "wallet_1",
      solanaWalletAddress: "So11111111111111111111111111111111111111112",
      activeWalletId: "wallet_1",
      wallets: [],
    });
    const response = await postTradingBotWallet(
      requestJson(
        {
          telegramUserId: "123456",
          action: "select",
          walletId: "wallet_1",
        },
        { Authorization: "Bearer ribbot-token" },
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          expect(new URL(request.url).pathname).toBe("/wallet/select");
          expect(await request.json()).toEqual({
            telegramUserId: "123456",
            walletId: "wallet_1",
          });
          return Response.json({ status: "ready", account });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      activeWalletId: string;
      solanaWalletAddress: string;
    };

    expect(response.status).toBe(200);
    expect(data.activeWalletId).toBe("wallet_1");
    expect(data.solanaWalletAddress).toBe(
      "So11111111111111111111111111111111111111112",
    );
  });

  it("projects the selected wallet into the legacy active-wallet fields", () => {
    const account = storedAccount({
      walletSource: "privy",
      privyUserId: "user_123",
      privyWalletId: "wallet_1",
      solanaWalletAddress: "11111111111111111111111111111111",
      activeWalletId: "wallet_1",
      wallets: [
        {
          walletId: "wallet_1",
          label: "Spot & NFT Wallet (Privy)",
          role: "spot_nft",
          walletSource: "privy",
          privyUserId: "user_123",
          privyWalletId: "wallet_1",
          solanaWalletAddress: "11111111111111111111111111111111",
          createdAt: "2026-07-12T00:00:00.000Z",
        },
      ],
    }) as Parameters<typeof selectTradingBotAccountWallet>[0];

    const result = selectTradingBotAccountWallet(account, "wallet_1");
    expect(result).toMatchObject({
      account: {
        activeWalletId: "wallet_1",
        privyWalletId: "wallet_1",
        solanaWalletAddress: "11111111111111111111111111111111",
      },
    });
  });

  it("rejects selecting a read-only portfolio wallet for trading", () => {
    const account = storedAccount({
      walletSource: "privy",
      privyUserId: "user_123",
      privyWalletId: "wallet_1",
      solanaWalletAddress: "11111111111111111111111111111111",
      activeWalletId: "wallet_1",
      wallets: [
        {
          walletId: "wallet_1",
          label: "Spot & NFT Wallet (Privy)",
          role: "spot_nft",
          walletSource: "privy",
          privyUserId: "user_123",
          privyWalletId: "wallet_1",
          solanaWalletAddress: "11111111111111111111111111111111",
          createdAt: "2026-07-12T00:00:00.000Z",
        },
        {
          walletId: "external:So11111111111111111111111111111111111111112",
          label: "Portfolio Wallet (Read only)",
          role: "portfolio",
          walletSource: "external",
          solanaWalletAddress:
            "So11111111111111111111111111111111111111112",
          createdAt: "2026-07-12T00:00:00.000Z",
        },
      ],
    }) as Parameters<typeof selectTradingBotAccountWallet>[0];

    expect(
      selectTradingBotAccountWallet(
        account,
        "external:So11111111111111111111111111111111111111112",
      ),
    ).toEqual({
      error: "Read-only portfolio wallets cannot be used for trading",
    });
    expect(account.activeWalletId).toBe("wallet_1");
  });
});

describe("trading bot account state", () => {
  it("requires Ribbot auth before reading stored account state", async () => {
    const response = await getTradingBotAccount(
      new Request(
        "https://frogx.example/api/frogx/trading-bot/account?telegramUserId=123456",
      ),
      {} as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["RIBBOT_TRADING_BOT_TOKEN"],
    });
  });

  it("proxies authenticated account reads to the account Durable Object", async () => {
    const account = storedAccount();
    const response = await getTradingBotAccount(
      new Request(
        "https://frogx.example/api/frogx/trading-bot/account?telegramUserId=123456",
        {
          headers: { Authorization: "Bearer ribbot-token" },
        },
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts((request) => {
          const url = new URL(request.url);
          expect(url.pathname).toBe("/account");
          expect(url.searchParams.get("telegramUserId")).toBe("123456");
          return Response.json({ status: "ready", account });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      account: { telegramUserId: string; watchlist: string[] };
      setup: {
        walletReady: boolean;
        automationSignerReady: boolean;
        imperialConnected: boolean;
        botAccessEnabled: boolean;
        complete: boolean;
      };
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("ready");
    expect(data.account.telegramUserId).toBe("123456");
    expect(data.account.watchlist).toEqual([
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    ]);
    expect(data.setup).toEqual({
      walletReady: false,
      automationSignerReady: false,
      imperialConnected: false,
      botAccessEnabled: true,
      complete: false,
    });
  });

  it("reports setup complete only when wallet, signer, access, and Imperial are ready", async () => {
    const account = storedAccount({
      walletSource: "privy",
      privyUserId: "user_123",
      privyWalletId: "wallet_123",
      solanaWalletAddress:
        "So11111111111111111111111111111111111111112",
    });
    globalThis.fetch = vi.fn(async (input) => {
      expect(String(input)).toBe(
        "https://api.privy.io/v1/wallets/wallet_123",
      );
      return Response.json({
        id: "wallet_123",
        address: "So11111111111111111111111111111111111111112",
        chain_type: "solana",
        additional_signers: [
          {
            signer_id: "auth-key",
            override_policy_ids: ["spot-nft-policy"],
          },
        ],
      });
    }) as typeof fetch;

    const response = await getTradingBotAccount(
      new Request(
        "https://frogx.example/api/frogx/trading-bot/account?telegramUserId=123456",
        {
          headers: { Authorization: "Bearer ribbot-token" },
        },
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: "private-key",
        PRIVY_WALLET_POLICY_IDS: "spot-nft-policy",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(() =>
          Response.json({
            status: "ready",
            account,
            setup: { imperialConnected: true },
          }),
        ),
      } as Env,
    );
    const data = (await response.json()) as {
      setup: {
        walletReady: boolean;
        automationSignerReady: boolean;
        imperialConnected: boolean;
        botAccessEnabled: boolean;
        complete: boolean;
      };
    };

    expect(response.status).toBe(200);
    expect(data.setup).toEqual({
      walletReady: true,
      automationSignerReady: true,
      imperialConnected: true,
      botAccessEnabled: true,
      complete: true,
    });
  });
});

describe("trading bot control codes", () => {
  it("requires Ribbot auth before issuing account control codes", async () => {
    const response = await postTradingBotControlCode(
      requestJson(
        { telegramUserId: "123456" },
        undefined,
        "/api/frogx/trading-bot/control/code",
      ),
      {} as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["RIBBOT_TRADING_BOT_TOKEN"],
    });
  });

  it("proxies authenticated control-code creation to account storage", async () => {
    const response = await postTradingBotControlCode(
      requestJson(
        { telegramUserId: "123456", username: "ribbit" },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/control/code",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        RIBBOT_CONTROL_URL: "https://frogtrading.exchange/ribbot",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          expect(url.pathname).toBe("/control-code");
          const body = (await request.json()) as {
            telegramUserId: string;
            username: string;
          };
          expect(body.telegramUserId).toBe("123456");
          expect(body.username).toBe("ribbit");
          return Response.json({
            status: "ready",
            telegramUserId: "123456",
            code: "ABCDEFGH2345",
            expiresAt: "2026-07-04T00:10:00.000Z",
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      telegramUserId: string;
      code: string;
      expiresAt: string;
      controlUrl: string;
    };

    expect(response.status).toBe(200);
    expect(data).toEqual({
      status: "ready",
      telegramUserId: "123456",
      code: "ABCDEFGH2345",
      expiresAt: "2026-07-04T00:10:00.000Z",
      controlUrl: "https://frogtrading.exchange/ribbot",
    });
  });

  it("lets a control page exchange a code for the stored account snapshot", async () => {
    const account = storedAccount();
    const response = await postTradingBotControlSession(
      requestJson(
        { telegramUserId: "123456", code: "abcd-efgh-2345" },
        undefined,
        "/api/frogx/trading-bot/control/session",
      ),
      {
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          expect(url.pathname).toBe("/control-session");
          const body = (await request.json()) as {
            telegramUserId: string;
            code: string;
          };
          expect(body.telegramUserId).toBe("123456");
          expect(body.code).toBe("abcd-efgh-2345");
          return Response.json({
            status: "ready",
            account,
            sessionToken: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
            sessionExpiresAt: "2026-07-04T00:40:00.000Z",
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      account: { telegramUserId: string };
      sessionToken: string;
      sessionExpiresAt: string;
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("ready");
    expect(data.account.telegramUserId).toBe("123456");
    expect(data.sessionToken).toBe("ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
    expect(data.sessionExpiresAt).toBe("2026-07-04T00:40:00.000Z");
  });

  it("proxies an Imperial wallet authorization through account storage", async () => {
    const response = await postTradingBotControlImperial(
      requestJson(
        {
          telegramUserId: "123456",
          sessionToken: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
          wallet: "So11111111111111111111111111111111111111112",
          message:
            "imperial:mobile-connect:So11111111111111111111111111111111111111112:1785452400000",
          signature:
            "3vQB7B6MrGQZaxCuFg4oh7xCPNwQvH5G2fYqQ7nS2UQ8F1xPA8Dc9Tmtb4jLk3Rh6s8Ew2aJ6Kp9Nq7Vg5Uo1Zx",
        },
        undefined,
        "/api/frogx/trading-bot/control/imperial",
      ),
      {
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          expect(url.pathname).toBe("/control-imperial");
          const body = (await request.json()) as {
            telegramUserId: string;
            sessionToken: string;
            wallet: string;
            message: string;
            signature: string;
          };
          expect(body.telegramUserId).toBe("123456");
          expect(body.sessionToken).toBe(
            "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
          );
          expect(body.wallet).toBe(
            "So11111111111111111111111111111111111111112",
          );
          expect(body.message).toContain("imperial:mobile-connect:");
          expect(body.signature).toBeTruthy();
          return Response.json({
            status: "connected",
            connection: {
              status: "connected",
              authorityWalletAddress: body.wallet,
              profileAddress: "Vote111111111111111111111111111111111111111",
              profileIndex: 1,
              expiresAt: 1893456000,
              connectedAt: "2026-07-30T23:00:00.000Z",
              referrerUsername: "sbf",
            },
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      connection: {
        authorityWalletAddress: string;
        profileAddress: string;
        profileIndex: number;
        expiresAt: number;
        referrerUsername: string;
      };
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("connected");
    expect(data.connection.authorityWalletAddress).toBe(
      "So11111111111111111111111111111111111111112",
    );
    expect(data.connection.profileAddress).toBe(
      "Vote111111111111111111111111111111111111111",
    );
    expect(data.connection.profileIndex).toBe(1);
    expect(data.connection.expiresAt).toBe(1893456000);
    expect(data.connection.referrerUsername).toBe("sbf");
  });

  it("lets a control session update stored non-secret preferences", async () => {
    const account = storedAccount({
      settings: {
        ...storedAccount().settings,
        slippageBps: 250,
      },
    });
    const response = await postTradingBotControlPreference(
      requestJson(
        {
          telegramUserId: "123456",
          sessionToken: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
          kind: "settings",
          action: "set",
          slippageBps: 250,
          priorityFee: 1000,
        },
        undefined,
        "/api/frogx/trading-bot/control/preferences",
      ),
      {
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          expect(url.pathname).toBe("/control-preferences");
          const body = (await request.json()) as {
            telegramUserId: string;
            sessionToken: string;
            kind: string;
          };
          expect(body.telegramUserId).toBe("123456");
          expect(body.sessionToken).toBe("ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
          expect(body.kind).toBe("settings");
          return Response.json({
            status: "accepted",
            normalized: {
              telegramUserId: "123456",
              kind: "settings",
              action: "set",
              settings: { slippageBps: 250, priorityFee: 1000 },
            },
            accountStorage: "stored",
            account,
            warnings: [
              "FTX/FrogX stored this Ribbot preference in account state.",
            ],
            validatedAt: "2026-07-04T00:11:00.000Z",
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      account: { settings: { slippageBps: number } };
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("accepted");
    expect(data.account.settings.slippageBps).toBe(250);
  });

  it("lets a control session request wallet actions through account storage", async () => {
    const account = storedAccount({
      walletSource: "privy",
      privyUserId: "user_123",
      privyWalletId: "wallet_123",
      walletClaimRequestedAt: "2026-07-04T00:12:00.000Z",
    });
    const response = await postTradingBotControlWallet(
      requestJson(
        {
          telegramUserId: "123456",
          sessionToken: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
          userPublicKey: "So11111111111111111111111111111111111111112",
          action: "claim",
        },
        undefined,
        "/api/frogx/trading-bot/control/wallet",
      ),
      {
        RIBBOT_WALLET_CLAIM_URL: "https://frogtrading.exchange/ribbot",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          expect(url.pathname).toBe("/control-wallet");
          const body = (await request.json()) as {
            telegramUserId: string;
            sessionToken: string;
            action: string;
            claimUrl: string;
          };
          expect(body.telegramUserId).toBe("123456");
          expect(body.sessionToken).toBe("ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
          expect(body.action).toBe("claim");
          expect(body.claimUrl).toBe("https://frogtrading.exchange/ribbot");
          return Response.json({
            status: "claim_requested",
            action: "claim",
            account,
            walletAddress: account.solanaWalletAddress,
            claimUrl: body.claimUrl,
            warnings: ["FTX recorded the claim request."],
            updatedAt: "2026-07-04T00:12:00.000Z",
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      action: string;
      account: { walletClaimRequestedAt: string };
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("claim_requested");
    expect(data.action).toBe("claim");
    expect(data.account.walletClaimRequestedAt).toBe(
      "2026-07-04T00:12:00.000Z",
    );
    expect(data.warnings[0]).toContain("claim request");
  });

  it("routes authenticated Privy signer restoration through account storage", async () => {
    const account = storedAccount({
      walletSource: "privy",
      privyUserId: "user_123",
      privyWalletId: "wallet_123",
      botAccessRevokedAt: undefined,
    });
    const response = await postTradingBotControlWallet(
      requestJson(
        {
          telegramUserId: "123456",
          sessionToken: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
          userPublicKey: "So11111111111111111111111111111111111111112",
          action: "restore",
        },
        undefined,
        "/api/frogx/trading-bot/control/wallet",
      ),
      {
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          expect(url.pathname).toBe("/control-wallet");
          const body = (await request.json()) as {
            telegramUserId: string;
            action: string;
          };
          expect(body.telegramUserId).toBe("123456");
          expect(body.action).toBe("restore");
          return Response.json({
            status: "restored",
            action: "restore",
            account,
            walletAddress: account.solanaWalletAddress,
            warnings: ["FTX bot access is restored."],
            updatedAt: "2026-07-10T00:12:00.000Z",
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      action: string;
      account: { botAccessRevokedAt?: string };
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("restored");
    expect(data.action).toBe("restore");
    expect(data.account.botAccessRevokedAt).toBeUndefined();
  });

  it("verifies the configured signer on the Spot & NFT wallet", async () => {
    const account = storedAccount({
      walletSource: "privy",
      privyUserId: "user_123",
      privyWalletId: "wallet_123",
      wallets: [
        {
          walletId: "wallet_123",
          label: "Spot & NFT Wallet (Privy)",
          role: "spot_nft",
          walletSource: "privy",
          privyUserId: "user_123",
          privyWalletId: "wallet_123",
          solanaWalletAddress:
            "So11111111111111111111111111111111111111112",
          createdAt: "2026-07-04T00:00:00.000Z",
        },
      ],
    });
    globalThis.fetch = vi.fn(async (input) => {
      expect(String(input)).toBe(
        "https://api.privy.io/v1/wallets/wallet_123",
      );
      return Response.json({
        id: "wallet_123",
        address: "So11111111111111111111111111111111111111112",
        chain_type: "solana",
        additional_signers: [
          {
            signer_id: "auth-key",
            override_policy_ids: ["spot-nft-policy"],
          },
        ],
      });
    }) as typeof fetch;

    const response = await postTradingBotControlWallet(
      requestJson(
        {
          telegramUserId: "123456",
          sessionToken: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
          userPublicKey: "So11111111111111111111111111111111111111112",
          action: "verify_signer",
        },
        undefined,
        "/api/frogx/trading-bot/control/wallet",
      ),
      {
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: "private-key",
        PRIVY_WALLET_POLICY_IDS: "spot-nft-policy",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          expect(new URL(request.url).pathname).toBe("/control-wallet");
          return Response.json({
            status: "signer_check_requested",
            action: "verify_signer",
            account,
            warnings: [],
            updatedAt: account.updatedAt,
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      automationSignerReady: boolean;
    };

    expect(response.status).toBe(200);
    expect(data.automationSignerReady).toBe(true);
  });
});

describe("managed Spot & NFT wallet", () => {
  it("rejects read-only portfolio wallets before Privy execution", async () => {
    const portfolioAddress = "Vote111111111111111111111111111111111111111";
    const response = await getManagedPrivyWallet(
      {
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async () =>
          Response.json({
            status: "ready",
            account: storedAccount({
              wallets: [
                {
                  walletId: "portfolio_1",
                  label: "Portfolio Wallet (Read only)",
                  role: "portfolio",
                  walletSource: "external",
                  solanaWalletAddress: portfolioAddress,
                  createdAt: "2026-07-04T00:00:00.000Z",
                },
              ],
            }),
          }),
        ),
      } as Env,
      "123456",
      portfolioAddress,
    );

    expect(response).toEqual({
      error: "Spot and NFT trading requires Spot & NFT Wallet (Privy)",
      status: 409,
    });
  });

  it("returns only the exact Privy Spot & NFT wallet with the configured signer", async () => {
    const spotAddress = "So11111111111111111111111111111111111111112";
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        id: "wallet_123",
        address: spotAddress,
        chain_type: "solana",
        additional_signers: [
          {
            signer_id: "auth-key",
            override_policy_ids: ["spot-nft-policy"],
          },
        ],
      }),
    ) as typeof fetch;
    const response = await getManagedPrivyWallet(
      {
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: "private-key",
        PRIVY_WALLET_POLICY_IDS: "spot-nft-policy",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async () =>
          Response.json({
            status: "ready",
            account: storedAccount({
              wallets: [
                {
                  walletId: "wallet_123",
                  label: "Spot & NFT Wallet (Privy)",
                  role: "spot_nft",
                  walletSource: "privy",
                  privyUserId: "user_123",
                  privyWalletId: "wallet_123",
                  solanaWalletAddress: spotAddress,
                  createdAt: "2026-07-04T00:00:00.000Z",
                },
              ],
            }),
          }),
        ),
      } as Env,
      "123456",
      spotAddress,
    );

    expect(response).toEqual({
      wallet: {
        walletId: "wallet_123",
        walletAddress: spotAddress,
        label: "Spot & NFT Wallet (Privy)",
      },
    });
  });

  it("rejects the Spot & NFT wallet when Ribbot signer access is missing", async () => {
    const spotAddress = "So11111111111111111111111111111111111111112";
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        id: "wallet_123",
        address: spotAddress,
        chain_type: "solana",
        additional_signers: [],
      }),
    ) as typeof fetch;
    const response = await getManagedPrivyWallet(
      {
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: "private-key",
        PRIVY_WALLET_POLICY_IDS: "spot-nft-policy",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async () =>
          Response.json({
            status: "ready",
            account: storedAccount({
              wallets: [
                {
                  walletId: "wallet_123",
                  label: "Spot & NFT Wallet (Privy)",
                  role: "spot_nft",
                  walletSource: "privy",
                  privyUserId: "user_123",
                  privyWalletId: "wallet_123",
                  solanaWalletAddress: spotAddress,
                  createdAt: "2026-07-04T00:00:00.000Z",
                },
              ],
            }),
          }),
        ),
      } as Env,
      "123456",
      spotAddress,
    );

    expect(response).toEqual({
      error: "Ribbot access is not enabled for Spot & NFT Wallet (Privy)",
      status: 409,
      code: "RIBBOT_ACCESS_REQUIRED",
    });
  });
});

describe("trading bot setup reset", () => {
  it("requires Ribbot auth before resetting setup", async () => {
    const response = await postTradingBotSetupReset(
      requestJson(
        { telegramUserId: "123456" },
        undefined,
        "/api/frogx/trading-bot/setup/reset",
      ),
      {} as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["RIBBOT_TRADING_BOT_TOKEN"],
    });
  });

  it("proxies authenticated setup resets to account storage", async () => {
    const response = await postTradingBotSetupReset(
      requestJson(
        { telegramUserId: "123456" },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/setup/reset",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          expect(url.pathname).toBe("/setup-reset");
          expect(await request.json()).toEqual({
            telegramUserId: "123456",
          });
          return Response.json({
            status: "reset",
            telegramUserId: "123456",
            walletAddress:
              "So11111111111111111111111111111111111111112",
            resetAt: "2026-07-30T22:00:00.000Z",
          });
        }),
      } as Env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "reset",
      telegramUserId: "123456",
      walletAddress: "So11111111111111111111111111111111111111112",
      resetAt: "2026-07-30T22:00:00.000Z",
    });
  });
});

describe("trading bot swap building", () => {
  const validSwapBody = {
    telegramUserId: "123456",
    userPublicKey: "So11111111111111111111111111111111111111112",
    inMint: "So11111111111111111111111111111111111111112",
    outMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    amountIn: "100000000",
    slippageBps: 500,
    priorityFee: 0,
  };

  it("requires Ribbot auth before building Telegram swap transactions", async () => {
    const response = await postTradingBotSwap(
      requestJson(validSwapBody, undefined, "/api/frogx/trading-bot/swap"),
      {} as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["RIBBOT_TRADING_BOT_TOKEN"],
    });
  });

  it("rejects invalid swap intents before reaching Titan", async () => {
    const response = await postTradingBotSwap(
      requestJson(
        {
          ...validSwapBody,
          amountIn: "0",
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/swap",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(data).toEqual({
      error: "amountIn must be a positive integer string",
    });
  });

  it("delegates valid Telegram swap builds to the FrogX swap builder", async () => {
    const response = await postTradingBotSwap(
      requestJson(
        validSwapBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/swap",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as {
      mode: string;
      txBase64: string;
      meta: { mock: boolean };
    };

    expect(response.status).toBe(200);
    expect(data.mode).toBe("tx_base64");
    expect(data.txBase64).toBe("BASE64_TX_PLACEHOLDER");
    expect(data.meta.mock).toBe(true);
  });
});

describe("trading bot live execution", () => {
  const validExecutionBody = {
    telegramUserId: "123456",
    userPublicKey: "So11111111111111111111111111111111111111112",
    inMint: "So11111111111111111111111111111111111111112",
    outMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    amountIn: "100000000",
    slippageBps: 500,
    priorityFee: 0,
    orderId: "order_123",
  };

  it("requires the FTX live-execution gate before signing or sending", async () => {
    const response = await postTradingBotExecution(
      requestJson(
        validExecutionBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/execute",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data.status).toBe("not_configured");
    expect(data.required).toContain("TRADING_BOT_LIVE_EXECUTION_ENABLED");
    expect(data.required).toContain("TRADING_BOT_ACCOUNTS");
  });

  it("refuses live execution for quote-only external wallets", async () => {
    const response = await postTradingBotExecution(
      requestJson(
        validExecutionBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/execute",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: "not-used-for-external-wallet",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(() =>
          Response.json({
            status: "ready",
            account: storedAccount({ walletSource: "external" }),
          }),
        ),
      } as Env,
    );
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(409);
    expect(data.error).toBe(
      "Live execution requires Spot & NFT Wallet (Privy)",
    );
  });

  it("does not execute from legacy Privy fields when only a read-only wallet is registered", async () => {
    globalThis.fetch = vi.fn();
    const response = await postTradingBotExecution(
      requestJson(
        validExecutionBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/execute",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: "not-used-for-read-only-wallet",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(() =>
          Response.json({
            status: "ready",
            account: storedAccount({
              walletSource: "privy",
              privyUserId: "legacy-user",
              privyWalletId: "legacy-wallet",
              wallets: [
                {
                  walletId:
                    "external:So11111111111111111111111111111111111111112",
                  label: "Portfolio Wallet (Read only)",
                  role: "portfolio",
                  walletSource: "external",
                  solanaWalletAddress:
                    "So11111111111111111111111111111111111111112",
                  createdAt: "2026-07-12T00:00:00.000Z",
                },
              ],
            }),
          }),
        ),
      } as Env,
    );
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(409);
    expect(data.error).toBe(
      "Live execution requires Spot & NFT Wallet (Privy)",
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("refuses live execution after the control page revokes bot access", async () => {
    globalThis.fetch = vi.fn();
    const response = await postTradingBotExecution(
      requestJson(
        validExecutionBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/execute",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: "not-used-for-revoked-wallet",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(() =>
          Response.json({
            status: "ready",
            account: storedAccount({
              walletSource: "privy",
              privyUserId: "user_123",
              privyWalletId: "wallet_123",
              botAccessRevokedAt: "2026-07-04T00:15:00.000Z",
            }),
          }),
        ),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      error: string;
      revokedAt: string;
    };

    expect(response.status).toBe(409);
    expect(data).toEqual({
      status: "revoked",
      error: "FTX bot access has been revoked for this account",
      revokedAt: "2026-07-04T00:15:00.000Z",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("refuses instant Auto Buy execution when the FTX account profile is off", async () => {
    globalThis.fetch = vi.fn();
    const response = await postTradingBotExecution(
      requestJson(
        { ...validExecutionBody, executionMode: "instant_auto_buy" },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/execute",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: "not-used-for-disabled-profile",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(() =>
          Response.json({
            status: "ready",
            account: storedAccount({
              walletSource: "privy",
              privyWalletId: "wallet_123",
            }),
          }),
        ),
      } as Env,
    );
    const data = (await response.json()) as { status: string; error: string };

    expect(response.status).toBe(409);
    expect(data).toEqual({
      status: "not_executable",
      error: "Instant Auto Buy is disabled in the FTX account",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("refuses instant Auto Buy execution that differs from FTX-owned settings", async () => {
    globalThis.fetch = vi.fn();
    const response = await postTradingBotExecution(
      requestJson(
        { ...validExecutionBody, executionMode: "instant_auto_buy" },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/execute",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: "not-used-for-mismatch",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(() =>
          Response.json({
            status: "ready",
            account: storedAccount({
              walletSource: "privy",
              privyWalletId: "wallet_123",
              settings: {
                ...storedAccount().settings,
                instantAutoBuyEnabled: true,
                instantAutoBuyAmountIn: "250000000",
              },
            }),
          }),
        ),
      } as Env,
    );
    const data = (await response.json()) as { status: string; error: string };

    expect(response.status).toBe(409);
    expect(data.error).toBe(
      "Instant Auto Buy request does not match FTX account settings",
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("fails closed when FTX cannot rerun instant Auto Buy market-risk checks", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    globalThis.fetch = vi.fn(async () => Response.json({}));
    const response = await postTradingBotExecution(
      requestJson(
        { ...validExecutionBody, executionMode: "instant_auto_buy" },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/execute",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: "not-used-without-risk-checks",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(() =>
          Response.json({
            status: "ready",
            account: storedAccount({
              walletSource: "privy",
              privyWalletId: "wallet_123",
              settings: {
                ...storedAccount().settings,
                slippageBps: 500,
                priorityFee: 0,
                instantAutoBuyEnabled: true,
              },
            }),
          }),
        ),
      } as Env,
    );
    const data = (await response.json()) as { status: string; error: string };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_executable",
      error: "Instant Auto Buy risk checks are temporarily unavailable",
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(globalThis.fetch).mock.calls[0][0])).toContain(
      "https://api.jup.ag/price/v3",
    );
    expect(warning).toHaveBeenCalledWith(
      "[trading-bot] Instant Auto Buy risk check failed",
      expect.any(Error),
    );
  });

  it("does not treat missing Titan quote verification as an instant-buy safety pass", async () => {
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "https://rpc.example") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          method?: string;
        };
        expect(body.method).toBe("getAccountInfo");
        return Response.json({
          result: {
            value: {
              owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
              executable: false,
              lamports: 1_461_600,
              data: {
                parsed: {
                  type: "mint",
                  info: {
                    mintAuthority: null,
                    supply: "1000000000",
                    decimals: 6,
                    isInitialized: true,
                    freezeAuthority: null,
                  },
                },
              },
            },
          },
        });
      }
      if (url.startsWith("https://api.jup.ag/price/v3")) {
        return Response.json({
          So11111111111111111111111111111111111111112: {
            usdPrice: 100,
            decimals: 9,
          },
          EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
            usdPrice: 1,
            decimals: 6,
          },
        });
      }
      throw new Error(`Unexpected execution fetch: ${url}`);
    }) as unknown as typeof fetch;

    const response = await postTradingBotExecution(
      requestJson(
        { ...validExecutionBody, executionMode: "instant_auto_buy" },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/execute",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: "not-used-without-titan",
        SOLANA_RPC_URL: "https://rpc.example",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(() =>
          Response.json({
            status: "ready",
            account: storedAccount({
              walletSource: "privy",
              privyWalletId: "wallet_123",
              settings: {
                ...storedAccount().settings,
                slippageBps: 500,
                priorityFee: 0,
                instantAutoBuyEnabled: true,
              },
            }),
          }),
        ),
      } as Env,
    );
    const data = (await response.json()) as { status: string; error: string };

    expect(response.status).toBe(409);
    expect(data.status).toBe("not_executable");
    expect(data.error).toContain(
      "TITAN_TOKEN is not configured. This is not a safety pass.",
    );
    expect(
      vi.mocked(globalThis.fetch).mock.calls.some(([input]) =>
        String(input).includes("api.privy.io"),
      ),
    ).toBe(false);
  });

  it("submits a freshly built swap through Privy signAndSendTransaction", async () => {
    const privateKey = await generateTestAuthorizationPrivateKey();
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      expect(url).toBe("https://api.privy.io/v1/wallets/wallet_123/rpc");
      const headers = new Headers(init?.headers);
      expect(headers.get("privy-app-id")).toBe("privy-app");
      expect(headers.get("privy-authorization-signature")).toBeTruthy();
      expect(headers.get("privy-request-expiry")).toBeTruthy();
      const body = JSON.parse(String(init?.body)) as {
        method: string;
        caip2: string;
        sponsor: boolean;
        reference_id: string;
        params: { transaction: string; encoding: string };
      };
      expect(body.method).toBe("signAndSendTransaction");
      expect(body.caip2).toBe("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
      expect(body.reference_id).toBe("ribbot-123456-order_123");
      expect(headers.get("privy-idempotency-key")).toBe(body.reference_id);
      expect(body.params).toEqual({
        transaction: "BASE64_TX_PLACEHOLDER",
        encoding: "base64",
      });
      return Response.json({
        method: "signAndSendTransaction",
        data: {
          hash: "5xRibbotSignature",
          signed_transaction: "signed-tx",
          caip2: body.caip2,
          transaction_id: "privy-tx-123",
          reference_id: body.reference_id,
        },
      });
    });

    const response = await postTradingBotExecution(
      requestJson(
        validExecutionBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/execute",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: privateKey,
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(() =>
          Response.json({
            status: "ready",
            account: storedAccount({
              walletSource: "privy",
              privyUserId: "user_123",
              privyWalletId: "wallet_123",
            }),
          }),
        ),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      signature: string;
      transactionId: string;
      referenceId: string;
      signedTransactionAvailable: boolean;
      solscanUrl: string;
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("executed");
    expect(data.signature).toBe("5xRibbotSignature");
    expect(data.transactionId).toBe("privy-tx-123");
    expect(data.referenceId).toBe("ribbot-123456-order_123");
    expect(data.signedTransactionAvailable).toBe(true);
    expect(data.solscanUrl).toBe("https://solscan.io/tx/5xRibbotSignature");
  });

  it.each([
    [403, { error: { code: "policy_violation" } }, "policy_violation"],
    [403, { error: { error_code: "policy_violation" } }, "policy_violation"],
    [502, { code: "transaction_broadcast_failure" }, "transaction_broadcast_failure"],
  ])(
    "preserves a Privy non-broadcast error from HTTP %s without retaining the response body",
    async (status, body, expectedCode) => {
      const privateKey = await generateTestAuthorizationPrivateKey();
      globalThis.fetch = vi.fn(async () => Response.json(body, { status }));

      let caught: unknown;
      try {
        await signAndSendManagedSolanaTransaction(
          {
            PRIVY_APP_ID: "privy-app",
            PRIVY_APP_SECRET: "privy-secret",
            PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
            PRIVY_AUTHORIZATION_PRIVATE_KEY: privateKey,
          } as Env,
          {
            walletId: "wallet_123",
            transactionBase64: "BASE64_TX_PLACEHOLDER",
            referenceId: "frog-buy-reference",
          },
        );
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(PrivyWalletRpcError);
      expect(caught).toMatchObject({
        status,
        kind: "http",
        providerCode: expectedCode,
      });
      expect(
        privyRpcFailureWasNotBroadcast(caught as PrivyWalletRpcError),
      ).toBe(true);
      expect(caught).not.toHaveProperty("responseBody");
    },
  );

  it("classifies a malformed Privy authorization key before broadcast", async () => {
    globalThis.fetch = vi.fn();

    await expect(
      signAndSendManagedSolanaTransaction(
        {
          PRIVY_APP_ID: "privy-app",
          PRIVY_APP_SECRET: "privy-secret",
          PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
          PRIVY_AUTHORIZATION_PRIVATE_KEY: "not-a-pkcs8-private-key",
        } as Env,
        {
          walletId: "wallet_123",
          transactionBase64: "BASE64_TX_PLACEHOLDER",
          referenceId: "frog-buy-reference",
        },
      ),
    ).rejects.toMatchObject({
      status: 0,
      kind: "authorization",
      providerCode: "invalid_authorization_private_key",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("keeps a generic Privy 502 response in reconciliation", async () => {
    const error = new PrivyWalletRpcError(502, "http", null);

    expect(privyRpcFailureWasNotBroadcast(error)).toBe(false);
  });

  it("returns a reconciliation reference when the Privy send response is ambiguous", async () => {
    const privateKey = await generateTestAuthorizationPrivateKey();
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    globalThis.fetch = vi.fn(async () => {
      throw new Error("connection reset after request write");
    });

    const response = await postTradingBotExecution(
      requestJson(
        validExecutionBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/execute",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: privateKey,
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(() =>
          Response.json({
            status: "ready",
            account: storedAccount({
              walletSource: "privy",
              privyUserId: "user_123",
              privyWalletId: "wallet_123",
            }),
          }),
        ),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      referenceId: string;
      error: string;
    };

    expect(response.status).toBe(503);
    expect(data.status).toBe("pending_reconciliation");
    expect(data.referenceId).toBe("ribbot-123456-order_123");
    expect(data.error).toContain("must not be resent blindly");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: "confirmed",
      providerStatus: "confirmed",
      providerWalletId: "wallet_123",
      transactionHash: "5xConfirmed",
      expectedStatus: "executed",
      expectedHttpStatus: 200,
    },
    {
      name: "terminal failure",
      providerStatus: "failed",
      providerWalletId: "wallet_123",
      transactionHash: null,
      expectedStatus: "failed",
      expectedHttpStatus: 200,
    },
    {
      name: "pending",
      providerStatus: "pending",
      providerWalletId: "wallet_123",
      transactionHash: null,
      expectedStatus: "pending",
      expectedHttpStatus: 200,
    },
    {
      name: "not found",
      providerStatus: null,
      providerWalletId: "wallet_123",
      transactionHash: null,
      expectedStatus: "not_found",
      expectedHttpStatus: 200,
    },
    {
      name: "wallet mismatch",
      providerStatus: "confirmed",
      providerWalletId: "wallet_other",
      transactionHash: "5xWrongWallet",
      expectedStatus: "mismatch",
      expectedHttpStatus: 409,
    },
  ])(
    "performs a read-only Privy lookup for $name direct swap status",
    async ({
      providerStatus,
      providerWalletId,
      transactionHash,
      expectedStatus,
      expectedHttpStatus,
    }) => {
      const eventBodies: Array<Record<string, unknown>> = [];
      const accountStore = fakeTradingBotAccounts(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/account") {
          return Response.json({
            status: "ready",
            account: storedAccount({
              walletSource: "privy",
              privyUserId: "user_123",
              privyWalletId: "wallet_123",
            }),
          });
        }
        if (url.pathname === "/event") {
          eventBodies.push((await request.json()) as Record<string, unknown>);
          return Response.json({ status: "ready", event: {} });
        }
        return Response.json(
          { error: "unexpected account-store request" },
          { status: 500 },
        );
      });
      globalThis.fetch = vi.fn(async (input, init) => {
        const url = new URL(String(input));
        expect(url.pathname).toBe("/v1/transactions");
        expect(url.searchParams.get("reference_id")).toBe(
          "ribbot-123456-order_123",
        );
        expect(init?.method).toBe("GET");
        return Response.json({
          transactions: providerStatus
            ? [
                {
                  id: "privy-status-123",
                  wallet_id: providerWalletId,
                  status: providerStatus,
                  transaction_hash: transactionHash,
                  caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
                  created_at: 1_782_000_000,
                  reference_id: "ribbot-123456-order_123",
                },
              ]
            : [],
        });
      });

      const response = await postTradingBotExecutionStatus(
        requestJson(
          validExecutionBody,
          { Authorization: "Bearer ribbot-token" },
          "/api/frogx/trading-bot/execute/status",
        ),
        {
          RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
          PRIVY_APP_ID: "privy-app",
          PRIVY_APP_SECRET: "privy-secret",
          TRADING_BOT_ACCOUNTS: accountStore,
        } as Env,
      );
      const data = (await response.json()) as {
        status: string;
        signature?: string | null;
      };

      expect(response.status).toBe(expectedHttpStatus);
      expect(data.status).toBe(expectedStatus);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      if (expectedStatus === "executed") {
        expect(data.signature).toBe("5xConfirmed");
        expect(eventBodies[0]).toMatchObject({
          eventId: "ribbot-123456-order_123",
          eventType: "swap_executed",
        });
      } else if (expectedStatus === "failed") {
        expect(eventBodies[0]).toMatchObject({
          eventId: "ribbot-123456-order_123",
          eventType: "swap_execution_failed",
        });
      } else {
        expect(eventBodies).toHaveLength(0);
      }
    },
  );

  it("flags an aged direct execution for manual review without resending", async () => {
    const eventBodies: Array<Record<string, unknown>> = [];
    const reviewBodies: Array<Record<string, unknown>> = [];
    const executionStartedAt = "2026-07-10T00:00:00.000Z";
    globalThis.fetch = vi.fn(async (_input, init) => {
      expect(init?.method).toBe("GET");
      return Response.json({ transactions: [] });
    });

    const response = await postTradingBotExecutionStatus(
      requestJson(
        validExecutionBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/execute/status",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_MANUAL_REVIEW_AFTER_SECONDS: "1",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(
          async (request) => {
            const url = new URL(request.url);
            if (url.pathname === "/account") {
              return Response.json({
                status: "ready",
                account: storedAccount({
                  walletSource: "privy",
                  privyUserId: "user_123",
                  privyWalletId: "wallet_123",
                }),
              });
            }
            if (url.pathname === "/event") {
              eventBodies.push(
                (await request.json()) as Record<string, unknown>,
              );
              return Response.json({ status: "ready", event: {} });
            }
            return Response.json({ error: "unexpected path" }, { status: 500 });
          },
          (request) => {
            const eventId = new URL(request.url).searchParams.get("eventId");
            if (eventId?.startsWith("manual-review:")) {
              return Response.json({ status: "not_found" }, { status: 404 });
            }
            return Response.json({
              status: "ready",
              event: {
                telegramUserId: "123456",
                eventId: "reconciliation:ribbot-123456-order_123",
                eventType: "execution_reconciliation_required",
                metadata: { executionStartedAt },
                createdAt: executionStartedAt,
              },
            });
          },
          async (request) => {
            const body = (await request.json()) as Record<string, unknown>;
            reviewBodies.push(body);
            return Response.json({
              status: "ready",
              case: {
                ...body,
                status: "open",
                createdAt: executionStartedAt,
                updatedAt: executionStartedAt,
              },
            });
          },
        ),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      manualReviewRequired: boolean;
      manualReviewAfter: string;
      manualReviewRequiredAt: string;
      manualReviewReason: string;
    };

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      status: "not_found",
      manualReviewRequired: true,
      manualReviewAfter: "2026-07-10T00:00:01.000Z",
    });
    expect(data.manualReviewRequiredAt).toBeTruthy();
    expect(data.manualReviewReason).toContain("do not resend");
    expect(eventBodies).toHaveLength(1);
    expect(eventBodies[0]).toMatchObject({
      eventType: "execution_manual_review_required",
    });
    expect(reviewBodies).toHaveLength(1);
    expect(reviewBodies[0]).toMatchObject({
      executionKind: "swap",
      resourceId: "order_123",
      executionId: "order_123",
      referenceId: "ribbot-123456-order_123",
    });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });
});

describe("trading bot scheduled order validation", () => {
  const validLimitOrderBody = {
    telegramUserId: "123456",
    userPublicKey: "So11111111111111111111111111111111111111112",
    kind: "limit",
    side: "buy",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    inMint: "So11111111111111111111111111111111111111112",
    outMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    amountIn: "100000000",
    amountLabel: "0.1 SOL",
    slippageBps: 500,
    priorityFee: 0,
    triggerDirection: "below",
    triggerPrice: "0.0125",
  };

  it("requires Ribbot auth before validating scheduled orders", async () => {
    const response = await postTradingBotOrderValidation(
      requestJson(
        validLimitOrderBody,
        undefined,
        "/api/frogx/trading-bot/orders/validate",
      ),
      {} as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["RIBBOT_TRADING_BOT_TOKEN"],
    });
  });

  it("rejects invalid limit order definitions", async () => {
    const response = await postTradingBotOrderValidation(
      requestJson(
        {
          ...validLimitOrderBody,
          triggerPrice: "0",
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/orders/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(data).toEqual({
      error: "triggerPrice must be a positive decimal string",
    });
  });

  it("accepts valid limit order definitions without starting execution", async () => {
    const response = await postTradingBotOrderValidation(
      requestJson(
        validLimitOrderBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/orders/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      orderKind: string;
      normalized: {
        kind: string;
        side: string;
        amountIn: string;
        triggerDirection: string;
        triggerPrice: string;
      };
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("accepted");
    expect(data.orderKind).toBe("limit");
    expect(data.normalized).toMatchObject({
      kind: "limit",
      side: "buy",
      amountIn: "100000000",
      triggerDirection: "below",
      triggerPrice: "0.0125",
    });
    expect(data.warnings.join(" ")).toContain(
      "scheduled execution is not enabled",
    );
  });

  it("accepts and normalizes DCA order definitions", async () => {
    const response = await postTradingBotOrderValidation(
      requestJson(
        {
          ...validLimitOrderBody,
          kind: "dca",
          amountIn: "1000000000",
          amountLabel: "1 SOL total",
          orderCount: 4,
          intervalMinutes: 30,
          triggerDirection: undefined,
          triggerPrice: undefined,
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/orders/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      orderKind: string;
      normalized: {
        kind: string;
        orderCount: number;
        intervalMinutes: number;
        perOrderAmountIn: string;
      };
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("accepted");
    expect(data.orderKind).toBe("dca");
    expect(data.normalized).toMatchObject({
      kind: "dca",
      orderCount: 4,
      intervalMinutes: 30,
      perOrderAmountIn: "250000000",
    });
  });

  it("accepts stop-loss sell definitions without starting execution", async () => {
    const response = await postTradingBotOrderValidation(
      requestJson(
        {
          ...validLimitOrderBody,
          kind: "stop",
          side: "sell",
          inMint: validLimitOrderBody.outMint,
          outMint: validLimitOrderBody.inMint,
          amountIn: "500000",
          amountLabel: "50%",
          triggerDirection: "below",
          triggerPrice: "0.008",
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/orders/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      orderKind: string;
      normalized: {
        kind: string;
        side: string;
        triggerDirection: string;
        triggerPrice: string;
      };
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("accepted");
    expect(data.orderKind).toBe("stop");
    expect(data.normalized).toMatchObject({
      kind: "stop",
      side: "sell",
      triggerDirection: "below",
      triggerPrice: "0.008",
    });
    expect(data.warnings.join(" ")).toContain(
      "Stop-loss trigger is staged only",
    );
  });

  it("rejects stop-loss definitions that are not below-price sells", async () => {
    const response = await postTradingBotOrderValidation(
      requestJson(
        {
          ...validLimitOrderBody,
          kind: "stop",
          side: "buy",
          triggerDirection: "above",
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/orders/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(data.error).toBe("stop orders must be sell orders");
  });

  it("accepts trailing stop sell definitions without starting monitors", async () => {
    const response = await postTradingBotOrderValidation(
      requestJson(
        {
          ...validLimitOrderBody,
          kind: "trailing",
          side: "sell",
          inMint: validLimitOrderBody.outMint,
          outMint: validLimitOrderBody.inMint,
          amountIn: "750000",
          amountLabel: "75%",
          triggerDirection: undefined,
          triggerPrice: undefined,
          trailingBps: 1250,
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/orders/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      orderKind: string;
      normalized: {
        kind: string;
        side: string;
        trailingBps: number;
      };
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("accepted");
    expect(data.orderKind).toBe("trailing");
    expect(data.normalized).toMatchObject({
      kind: "trailing",
      side: "sell",
      trailingBps: 1250,
    });
    expect(data.warnings.join(" ")).toContain("Trailing stop is staged only");
  });
});

describe("trading bot scheduled order storage", () => {
  const validLimitOrderBody = {
    telegramUserId: "123456",
    userPublicKey: "So11111111111111111111111111111111111111112",
    kind: "limit",
    side: "buy",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    inMint: "So11111111111111111111111111111111111111112",
    outMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    amountIn: "100000000",
    amountLabel: "0.1 SOL",
    slippageBps: 500,
    priorityFee: 0,
    triggerDirection: "below",
    triggerPrice: "0.0125",
  };

  const storedAutomationOrder = {
    telegramUserId: "123456",
    orderId: "a_testorder",
    kind: "limit",
    side: "buy",
    status: "staged",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    inMint: "So11111111111111111111111111111111111111112",
    outMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    amountIn: "100000000",
    amountLabel: "0.1 SOL",
    walletAddress: "So11111111111111111111111111111111111111112",
    slippageBps: 500,
    priorityFee: 0,
    triggerDirection: "below",
    triggerPrice: "0.0125",
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z",
    validation: {
      validatedAt: "2026-07-04T00:00:00.000Z",
      warnings: [
        "Validation only: scheduled execution is not enabled in FTX/FrogX yet.",
      ],
    },
  };

  it("requires Ribbot auth before storing scheduled orders", async () => {
    const response = await postTradingBotOrderStorage(
      requestJson(
        validLimitOrderBody,
        undefined,
        "/api/frogx/trading-bot/orders",
      ),
      {} as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["RIBBOT_TRADING_BOT_TOKEN"],
    });
  });

  it("requires FTX account storage before storing scheduled orders", async () => {
    const response = await postTradingBotOrderStorage(
      requestJson(
        validLimitOrderBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/orders",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["TRADING_BOT_ACCOUNTS"],
    });
  });

  it("normalizes and stores scheduled orders through the account Durable Object", async () => {
    const response = await postTradingBotOrderStorage(
      requestJson(
        validLimitOrderBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/orders",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/event") {
            return Response.json({
              status: "ready",
              event: { eventId: "evt_1" },
            });
          }
          expect(url.pathname).toBe("/automation-order");
          const body = (await request.json()) as {
            orderId: string;
            order: {
              kind: string;
              side: string;
              priorityFee: number;
              triggerPrice: string;
            };
            validation: { warnings: string[]; validatedAt: string };
          };
          expect(body.orderId).toMatch(/^a_[a-f0-9]{24}$/);
          expect(body.order).toMatchObject({
            kind: "limit",
            side: "buy",
            priorityFee: 0,
            triggerPrice: "0.0125",
          });
          expect(body.validation.warnings.join(" ")).toContain(
            "scheduled execution is not enabled",
          );
          return Response.json({
            status: "stored",
            orderKind: "limit",
            order: {
              ...storedAutomationOrder,
              orderId: body.orderId,
              validation: body.validation,
            },
            normalized: body.order,
            warnings: body.validation.warnings,
            validatedAt: body.validation.validatedAt,
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      orderKind: string;
      order: {
        orderId: string;
        kind: string;
        status: string;
        walletAddress: string;
      };
      normalized: { kind: string; triggerPrice: string };
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("stored");
    expect(data.orderKind).toBe("limit");
    expect(data.order.orderId).toMatch(/^a_[a-f0-9]{24}$/);
    expect(data.order.status).toBe("staged");
    expect(data.order.walletAddress).toBe(validLimitOrderBody.userPublicKey);
    expect(data.normalized).toMatchObject({
      kind: "limit",
      triggerPrice: "0.0125",
    });
    expect(data.warnings.join(" ")).toContain(
      "scheduled execution is not enabled",
    );
  });

  it("lists stored scheduled orders through the account Durable Object", async () => {
    const response = await getTradingBotOrders(
      new Request(
        "https://frogx.example/api/frogx/trading-bot/orders?telegramUserId=123456",
        {
          headers: { Authorization: "Bearer ribbot-token" },
        },
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts((request) => {
          const url = new URL(request.url);
          expect(url.pathname).toBe("/automation-orders");
          expect(url.searchParams.get("telegramUserId")).toBe("123456");
          return Response.json({
            status: "ready",
            telegramUserId: "123456",
            orders: [storedAutomationOrder],
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      orders: Array<{ orderId: string; status: string }>;
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("ready");
    expect(data.orders).toHaveLength(1);
    expect(data.orders[0].orderId).toBe("a_testorder");
  });

  it("cancels stored scheduled orders through the account Durable Object", async () => {
    const response = await postTradingBotOrderCancel(
      requestJson(
        { telegramUserId: "123456", orderId: "a_testorder" },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/orders/cancel",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/event") {
            return Response.json({
              status: "ready",
              event: { eventId: "evt_1" },
            });
          }
          expect(url.pathname).toBe("/automation-order/cancel");
          const body = (await request.json()) as {
            telegramUserId: string;
            orderId: string;
          };
          expect(body).toEqual({
            telegramUserId: "123456",
            orderId: "a_testorder",
          });
          return Response.json({
            status: "cancelled",
            order: {
              ...storedAutomationOrder,
              status: "cancelled",
              updatedAt: "2026-07-04T00:00:01.000Z",
            },
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      order: { orderId: string; status: string };
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("cancelled");
    expect(data.order.orderId).toBe("a_testorder");
    expect(data.order.status).toBe("cancelled");
  });
});

describe("trading bot scheduled order runner", () => {
  const storedAutomationOrder = {
    telegramUserId: "123456",
    orderId: "a_testorder",
    kind: "limit",
    side: "buy",
    status: "staged",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    inMint: "So11111111111111111111111111111111111111112",
    outMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    amountIn: "100000000",
    amountLabel: "0.1 SOL",
    walletAddress: "So11111111111111111111111111111111111111112",
    slippageBps: 500,
    priorityFee: 0,
    triggerDirection: "below",
    triggerPrice: "0.0125",
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z",
    validation: {
      validatedAt: "2026-07-04T00:00:00.000Z",
      warnings: [],
    },
    scheduler: {},
  };

  it("does nothing when the scheduler flag is disabled", async () => {
    let called = false;
    await runTradingBotScheduledOrders({
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(() => {
        called = true;
        return Response.json({ status: "unexpected" });
      }),
    } as Env);

    expect(called).toBe(false);
  });

  it("scans global staged orders and records dry-run trigger state", async () => {
    const stateUpdates: Array<{
      scheduler: { dryRunTriggerCount?: number; lastPriceUsd?: number };
      status?: string;
    }> = [];
    const events: Array<{
      eventType: string;
      metadata: Record<string, unknown>;
    }> = [];
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        [storedAutomationOrder.mint]: {
          usdPrice: 0.01,
          decimals: 6,
        },
      }),
    ) as unknown as typeof fetch;

    await runTradingBotScheduledOrders({
      TRADING_BOT_SCHEDULER_ENABLED: "true",
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/automation-orders/active") {
          expect(url.searchParams.get("limit")).toBe("25");
          return Response.json({
            status: "ready",
            orders: [storedAutomationOrder],
          });
        }
        if (url.pathname === "/automation-order/check") {
          const body = (await request.json()) as {
            scheduler: { dryRunTriggerCount?: number; lastPriceUsd?: number };
            status?: string;
          };
          stateUpdates.push(body);
          return Response.json({
            status: "ready",
            order: { ...storedAutomationOrder, scheduler: body.scheduler },
          });
        }
        if (url.pathname === "/event") {
          const body = (await request.json()) as {
            eventType: string;
            metadata: Record<string, unknown>;
          };
          events.push(body);
          return Response.json({
            status: "ready",
            event: { eventId: "evt_1" },
          });
        }
        return Response.json({ error: "unexpected path" }, { status: 500 });
      }),
    } as Env);

    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0].status).toBeUndefined();
    expect(stateUpdates[0].scheduler.dryRunTriggerCount).toBe(1);
    expect(stateUpdates[0].scheduler.lastPriceUsd).toBe(0.01);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("automation_order_triggered");
    expect(events[0].metadata.orderId).toBe("a_testorder");
    expect(events[0].metadata.liveScheduler).toBe(false);
  });

  it("advances DCA dry-run intervals without consuming live slices", async () => {
    const dcaOrder = {
      ...storedAutomationOrder,
      orderId: "a_dca",
      kind: "dca",
      orderCount: 4,
      intervalMinutes: 30,
      perOrderAmountIn: "25000000",
      triggerDirection: undefined,
      triggerPrice: undefined,
    };
    const stateUpdates: Array<{
      scheduler: {
        dryRunTriggerCount?: number;
        executedCount?: number;
        nextRunAt?: string;
      };
    }> = [];
    globalThis.fetch = vi.fn(async () =>
      Response.json({}),
    ) as unknown as typeof fetch;

    await runTradingBotScheduledOrders({
      TRADING_BOT_SCHEDULER_ENABLED: "true",
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/automation-orders/active") {
          return Response.json({ status: "ready", orders: [dcaOrder] });
        }
        if (url.pathname === "/automation-order/check") {
          const body = (await request.json()) as {
            scheduler: {
              dryRunTriggerCount?: number;
              executedCount?: number;
              nextRunAt?: string;
            };
          };
          stateUpdates.push(body);
          return Response.json({
            status: "ready",
            order: { ...dcaOrder, scheduler: body.scheduler },
          });
        }
        if (url.pathname === "/event") {
          return Response.json({
            status: "ready",
            event: { eventId: "evt_1" },
          });
        }
        return Response.json({ error: "unexpected path" }, { status: 500 });
      }),
    } as Env);

    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0].scheduler.dryRunTriggerCount).toBe(1);
    expect(stateUpdates[0].scheduler.executedCount).toBeUndefined();
    expect(stateUpdates[0].scheduler.nextRunAt).toBeTruthy();
  });

  it.each([
    {
      name: "limit",
      order: storedAutomationOrder,
      price: 0.01,
      expectedAmountIn: "100000000",
      expectedStatus: "executed",
      expectedExecutedCount: undefined,
    },
    {
      name: "stop-loss",
      order: {
        ...storedAutomationOrder,
        orderId: "a_stop",
        kind: "stop",
        side: "sell",
        inMint: storedAutomationOrder.mint,
        outMint: "So11111111111111111111111111111111111111112",
        triggerPrice: "1.5",
      },
      price: 1,
      expectedAmountIn: "100000000",
      expectedStatus: "executed",
      expectedExecutedCount: undefined,
    },
    {
      name: "trailing-stop",
      order: {
        ...storedAutomationOrder,
        orderId: "a_trailing",
        kind: "trailing",
        side: "sell",
        inMint: storedAutomationOrder.mint,
        outMint: "So11111111111111111111111111111111111111112",
        triggerPrice: undefined,
        triggerDirection: undefined,
        trailingBps: 2500,
        scheduler: { peakPriceUsd: 2 },
      },
      price: 1,
      expectedAmountIn: "100000000",
      expectedStatus: "executed",
      expectedExecutedCount: undefined,
    },
    {
      name: "DCA",
      order: {
        ...storedAutomationOrder,
        orderId: "a_dca_live",
        kind: "dca",
        orderCount: 2,
        intervalMinutes: 30,
        perOrderAmountIn: "25000000",
        triggerPrice: undefined,
        triggerDirection: undefined,
      },
      price: undefined,
      expectedAmountIn: "25000000",
      expectedStatus: "staged",
      expectedExecutedCount: 1,
    },
  ])(
    "claims and executes a triggered $name order only through FTX and Privy",
    async ({
      order,
      price,
      expectedAmountIn,
      expectedStatus,
      expectedExecutedCount,
    }) => {
      const privateKey = await generateTestAuthorizationPrivateKey();
      const claims: Array<{
        orderId: string;
        executionId: string;
        executionReferenceId: string;
      }> = [];
      const stateUpdates: Array<{
        status?: string;
        expectedStatus?: string;
        expectedExecutionId?: string;
        scheduler: Record<string, unknown>;
      }> = [];
      const events: Array<{
        eventType: string;
        metadata: Record<string, unknown>;
      }> = [];
      let privyCalls = 0;

      globalThis.fetch = vi.fn(async (input, init) => {
        const url = String(input);
        if (url.startsWith("https://api.jup.ag/price/v3")) {
          return Response.json(
            price === undefined
              ? {}
              : {
                  [order.mint]: {
                    usdPrice: price,
                    decimals: 6,
                  },
                },
          );
        }
        if (url === "https://api.privy.io/v1/wallets/wallet_123/rpc") {
          privyCalls += 1;
          const headers = new Headers(init?.headers);
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            method: string;
            reference_id: string;
            params: { transaction: string };
          };
          expect(body.method).toBe("signAndSendTransaction");
          expect(body.params.transaction).toBe("BASE64_TX_PLACEHOLDER");
          expect(headers.get("privy-idempotency-key")).toBe(body.reference_id);
          expect(body.reference_id).toMatch(/^ribbot-123456-scheduled:/);
          return Response.json({
            method: "signAndSendTransaction",
            data: {
              hash: `5xScheduled${order.kind}Signature`,
              signed_transaction: "signed-tx",
              caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
              transaction_id: `privy-${order.kind}-tx`,
              reference_id: body.reference_id,
            },
          });
        }
        return Response.json(
          { error: { message: `unexpected fetch ${url}` } },
          { status: 500 },
        );
      }) as unknown as typeof fetch;

      await runTradingBotScheduledOrders({
        TRADING_BOT_SCHEDULER_ENABLED: "true",
        TRADING_BOT_SCHEDULER_LIVE_EXECUTION_ENABLED: "true",
        TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: privateKey,
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/automation-orders/active") {
            return Response.json({ status: "ready", orders: [order] });
          }
          if (url.pathname === "/automation-order/claim") {
            const body = (await request.json()) as {
              orderId: string;
              executionId: string;
              executionReferenceId: string;
            };
            claims.push(body);
            return Response.json({
              status: "claimed",
              executionId: body.executionId,
              order: {
                ...order,
                status: "executing",
                scheduler: {
                  ...order.scheduler,
                  executionId: body.executionId,
                  executionReferenceId: body.executionReferenceId,
                  executionStartedAt: "2026-07-10T00:00:00.000Z",
                },
              },
            });
          }
          if (url.pathname === "/account") {
            return Response.json({
              status: "ready",
              account: storedAccount({
                walletSource: "privy",
                privyUserId: "user_123",
                privyWalletId: "wallet_123",
              }),
            });
          }
          if (url.pathname === "/automation-order/check") {
            const body = (await request.json()) as {
              status?: string;
              expectedStatus?: string;
              expectedExecutionId?: string;
              scheduler: Record<string, unknown>;
            };
            stateUpdates.push(body);
            return Response.json({
              status: "ready",
              order: { ...order, ...body },
            });
          }
          if (url.pathname === "/event") {
            const body = (await request.json()) as {
              eventType: string;
              metadata: Record<string, unknown>;
            };
            events.push(body);
            return Response.json({
              status: "ready",
              event: { eventId: "evt_1" },
            });
          }
          return Response.json({ error: "unexpected path" }, { status: 500 });
        }),
      } as Env);

      expect(claims).toHaveLength(1);
      expect(claims[0].orderId).toBe(order.orderId);
      expect(claims[0].executionId).toMatch(/^scheduled:/);
      expect(claims[0].executionReferenceId).toMatch(
        /^ribbot-123456-scheduled:/,
      );
      expect(privyCalls).toBe(1);
      expect(stateUpdates).toHaveLength(1);
      expect(stateUpdates[0].status).toBe(expectedStatus);
      expect(stateUpdates[0].expectedStatus).toBe("executing");
      expect(stateUpdates[0].expectedExecutionId).toBe(claims[0].executionId);
      expect(stateUpdates[0].scheduler.executionId).toBe(claims[0].executionId);
      expect(stateUpdates[0].scheduler.executionSignature).toBe(
        `5xScheduled${order.kind}Signature`,
      );
      expect(stateUpdates[0].scheduler.executedCount).toBe(
        expectedExecutedCount,
      );
      if (order.kind === "dca") {
        expect(stateUpdates[0].scheduler.nextRunAt).toBeTruthy();
      }
      expect(events.map((event) => event.eventType)).toEqual([
        "automation_order_triggered",
        "swap_executed",
        "automation_order_executed",
      ]);
      expect(events[2].metadata.orderId).toBe(order.orderId);
      expect(events[2].metadata.executionId).toBe(claims[0].executionId);
      expect(events[2].metadata.amountIn).toBe(expectedAmountIn);
    },
  );

  it("keeps triggered orders staged when live scheduler dependencies are missing", async () => {
    const stateUpdates: Array<{
      status?: string;
      scheduler: { lastError?: string };
    }> = [];
    let claimCalls = 0;
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        [storedAutomationOrder.mint]: { usdPrice: 0.01, decimals: 6 },
      }),
    ) as unknown as typeof fetch;

    await runTradingBotScheduledOrders({
      TRADING_BOT_SCHEDULER_ENABLED: "true",
      TRADING_BOT_SCHEDULER_LIVE_EXECUTION_ENABLED: "true",
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/automation-orders/active") {
          return Response.json({
            status: "ready",
            orders: [storedAutomationOrder],
          });
        }
        if (url.pathname === "/automation-order/claim") {
          claimCalls += 1;
        }
        if (url.pathname === "/automation-order/check") {
          const body = (await request.json()) as {
            status?: string;
            scheduler: { lastError?: string };
          };
          stateUpdates.push(body);
          return Response.json({
            status: "ready",
            order: storedAutomationOrder,
          });
        }
        if (url.pathname === "/event") {
          return Response.json({
            status: "ready",
            event: { eventId: "evt_1" },
          });
        }
        return Response.json({ error: "unexpected path" }, { status: 500 });
      }),
    } as Env);

    expect(claimCalls).toBe(0);
    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0].status).toBeUndefined();
    expect(stateUpdates[0].scheduler.lastError).toContain(
      "TRADING_BOT_LIVE_EXECUTION_ENABLED",
    );
    expect(stateUpdates[0].scheduler.lastError).toContain(
      "RIBBOT_TRADING_BOT_TOKEN",
    );
  });

  it("does not execute when another scheduler run already claimed the order", async () => {
    const privateKey = await generateTestAuthorizationPrivateKey();
    let claimCalls = 0;
    let stateUpdateCalls = 0;
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        [storedAutomationOrder.mint]: { usdPrice: 0.01, decimals: 6 },
      }),
    ) as unknown as typeof fetch;

    await runTradingBotScheduledOrders({
      TRADING_BOT_SCHEDULER_ENABLED: "true",
      TRADING_BOT_SCHEDULER_LIVE_EXECUTION_ENABLED: "true",
      TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
      RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
      PRIVY_APP_ID: "privy-app",
      PRIVY_APP_SECRET: "privy-secret",
      PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
      PRIVY_AUTHORIZATION_PRIVATE_KEY: privateKey,
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/automation-orders/active") {
          return Response.json({
            status: "ready",
            orders: [storedAutomationOrder],
          });
        }
        if (url.pathname === "/automation-order/claim") {
          claimCalls += 1;
          return Response.json(
            { status: "not_claimed", error: "Order cannot be claimed" },
            { status: 409 },
          );
        }
        if (url.pathname === "/automation-order/check") {
          stateUpdateCalls += 1;
        }
        if (url.pathname === "/event") {
          return Response.json({
            status: "ready",
            event: { eventId: "evt_1" },
          });
        }
        return Response.json({ error: "unexpected path" }, { status: 500 });
      }),
    } as Env);

    expect(claimCalls).toBe(1);
    expect(stateUpdateCalls).toBe(0);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps an uncertain send executing for reconciliation instead of replaying it", async () => {
    const privateKey = await generateTestAuthorizationPrivateKey();
    const stateUpdates: Array<{
      status?: string;
      expectedStatus?: string;
      expectedExecutionId?: string;
      scheduler: {
        executionId?: string;
        reconciliationStatus?: string;
        lastError?: string;
        manualReviewAfter?: string;
      };
    }> = [];
    const events: string[] = [];
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.startsWith("https://api.jup.ag/price/v3")) {
        return Response.json({
          [storedAutomationOrder.mint]: { usdPrice: 0.01, decimals: 6 },
        });
      }
      if (url === "https://api.privy.io/v1/wallets/wallet_123/rpc") {
        return Response.json(
          { error: "provider unavailable" },
          { status: 500 },
        );
      }
      return Response.json({ error: "unexpected fetch" }, { status: 500 });
    }) as unknown as typeof fetch;

    await runTradingBotScheduledOrders({
      TRADING_BOT_SCHEDULER_ENABLED: "true",
      TRADING_BOT_SCHEDULER_LIVE_EXECUTION_ENABLED: "true",
      TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
      RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
      PRIVY_APP_ID: "privy-app",
      PRIVY_APP_SECRET: "privy-secret",
      PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
      PRIVY_AUTHORIZATION_PRIVATE_KEY: privateKey,
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/automation-orders/active") {
          return Response.json({
            status: "ready",
            orders: [storedAutomationOrder],
          });
        }
        if (url.pathname === "/automation-order/claim") {
          const body = (await request.json()) as {
            executionId: string;
            executionReferenceId: string;
          };
          return Response.json({
            status: "claimed",
            executionId: body.executionId,
            order: {
              ...storedAutomationOrder,
              status: "executing",
              scheduler: {
                executionId: body.executionId,
                executionReferenceId: body.executionReferenceId,
                executionStartedAt: "2026-07-10T00:00:00.000Z",
              },
            },
          });
        }
        if (url.pathname === "/account") {
          return Response.json({
            status: "ready",
            account: storedAccount({
              walletSource: "privy",
              privyUserId: "user_123",
              privyWalletId: "wallet_123",
            }),
          });
        }
        if (url.pathname === "/automation-order/check") {
          const body = (await request.json()) as {
            status?: string;
            expectedStatus?: string;
            expectedExecutionId?: string;
            scheduler: {
              executionId?: string;
              reconciliationStatus?: string;
              lastError?: string;
              manualReviewAfter?: string;
            };
          };
          stateUpdates.push(body);
          return Response.json({
            status: "ready",
            order: storedAutomationOrder,
          });
        }
        if (url.pathname === "/event") {
          const body = (await request.json()) as { eventType: string };
          events.push(body.eventType);
          return Response.json({
            status: "ready",
            event: { eventId: "evt_1" },
          });
        }
        return Response.json({ error: "unexpected path" }, { status: 500 });
      }),
    } as Env);

    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0].status).toBeUndefined();
    expect(stateUpdates[0].expectedStatus).toBe("executing");
    expect(stateUpdates[0].expectedExecutionId).toBe(
      stateUpdates[0].scheduler.executionId,
    );
    expect(stateUpdates[0].scheduler.executionId).toMatch(/^scheduled:/);
    expect(stateUpdates[0].scheduler.reconciliationStatus).toBe("error");
    expect(stateUpdates[0].scheduler.manualReviewAfter).toBe(
      "2026-07-10T00:15:00.000Z",
    );
    expect(stateUpdates[0].scheduler.lastError).toContain(
      "Check execution status before taking another action",
    );
    expect(events).toEqual([
      "automation_order_triggered",
      "execution_reconciliation_required",
      "automation_order_reconciliation_required",
    ]);
  });

  it.each([
    {
      name: "confirmed limit",
      privyStatus: "confirmed",
      orderOverrides: {},
      expectedOrderStatus: "executed",
      expectedExecutedCount: undefined,
      expectedResolution: "executed",
      stateUpdateStatus: 200,
      expectedEventCount: 1,
    },
    {
      name: "finalized DCA slice",
      privyStatus: "finalized",
      orderOverrides: {
        orderId: "a_reconcile_dca",
        kind: "dca",
        orderCount: 2,
        intervalMinutes: 30,
        perOrderAmountIn: "50000000",
        triggerPrice: undefined,
        triggerDirection: undefined,
      },
      expectedOrderStatus: "staged",
      expectedExecutedCount: 1,
      expectedResolution: "executed",
      stateUpdateStatus: 200,
      expectedEventCount: 1,
    },
    ...["execution_reverted", "failed", "provider_error", "replaced"].map(
      (privyStatus) => ({
        name: `${privyStatus} limit`,
        privyStatus,
        orderOverrides: {},
        expectedOrderStatus: "failed",
        expectedExecutedCount: undefined,
        expectedResolution: "failed",
        stateUpdateStatus: 200,
        expectedEventCount: 1,
      }),
    ),
    {
      name: "confirmed limit after its execution state changed",
      privyStatus: "confirmed",
      orderOverrides: {},
      expectedOrderStatus: "executed",
      expectedExecutedCount: undefined,
      expectedResolution: "executed",
      stateUpdateStatus: 409,
      expectedEventCount: 0,
    },
  ])(
    "reconciles an interrupted $name execution without resending it",
    async ({
      privyStatus,
      orderOverrides,
      expectedOrderStatus,
      expectedExecutedCount,
      expectedResolution,
      stateUpdateStatus,
      expectedEventCount,
    }) => {
      const referenceId = "ribbot-123456-scheduled:reconcile_1";
      const executingOrder = {
        ...storedAutomationOrder,
        ...orderOverrides,
        status: "executing",
        scheduler: {
          executionId: "scheduled:reconcile_1",
          executionReferenceId: referenceId,
          executionStartedAt: "2026-07-10T00:00:00.000Z",
        },
      };
      const stateUpdates: Array<{
        status?: string;
        expectedStatus?: string;
        expectedExecutionId?: string;
        scheduler: Record<string, unknown>;
      }> = [];
      const events: Array<{
        eventType: string;
        metadata: Record<string, unknown>;
      }> = [];

      globalThis.fetch = vi.fn(async (input, init) => {
        const url = new URL(String(input));
        expect(url.pathname).toBe("/v1/transactions");
        expect(url.searchParams.get("reference_id")).toBe(referenceId);
        expect(init?.method).toBe("GET");
        const headers = new Headers(init?.headers);
        expect(headers.get("privy-app-id")).toBe("privy-app");
        expect(headers.get("authorization")).toBeTruthy();
        return Response.json({
          transactions: [
            {
              id: "privy-reconcile-tx",
              wallet_id: "wallet_123",
              status: privyStatus,
              transaction_hash: "5xReconciledScheduledSignature",
              caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
              created_at: 1_788_000_000_000,
              reference_id: referenceId,
            },
          ],
        });
      }) as unknown as typeof fetch;

      await runTradingBotScheduledOrders({
        TRADING_BOT_SCHEDULER_ENABLED: "true",
        TRADING_BOT_SCHEDULER_RECONCILE_AFTER_SECONDS: "1",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/automation-orders/active") {
            return Response.json({
              status: "ready",
              orders: [],
              executingOrders: [executingOrder],
            });
          }
          if (url.pathname === "/account") {
            return Response.json({
              status: "ready",
              account: storedAccount({
                walletSource: "privy",
                privyUserId: "user_123",
                privyWalletId: "wallet_123",
              }),
            });
          }
          if (url.pathname === "/automation-order/check") {
            const body = (await request.json()) as {
              status?: string;
              expectedStatus?: string;
              expectedExecutionId?: string;
              scheduler: Record<string, unknown>;
            };
            stateUpdates.push(body);
            if (stateUpdateStatus === 409) {
              return Response.json(
                { error: "Order execution attempt has changed" },
                { status: 409 },
              );
            }
            return Response.json({
              status: "ready",
              order: { ...executingOrder, ...body },
            });
          }
          if (url.pathname === "/event") {
            const body = (await request.json()) as {
              eventType: string;
              metadata: Record<string, unknown>;
            };
            events.push(body);
            return Response.json({
              status: "ready",
              event: { eventId: "evt_1" },
            });
          }
          return Response.json({ error: "unexpected path" }, { status: 500 });
        }),
      } as Env);

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(stateUpdates).toHaveLength(1);
      expect(stateUpdates[0].status).toBe(expectedOrderStatus);
      expect(stateUpdates[0].expectedStatus).toBe("executing");
      expect(stateUpdates[0].expectedExecutionId).toBe(
        executingOrder.scheduler.executionId,
      );
      expect(stateUpdates[0].scheduler.reconciliationStatus).toBe(privyStatus);
      expect(stateUpdates[0].scheduler.executionSignature).toBe(
        "5xReconciledScheduledSignature",
      );
      expect(stateUpdates[0].scheduler.executedCount).toBe(
        expectedExecutedCount,
      );
      expect(events).toHaveLength(expectedEventCount);
      if (expectedEventCount > 0) {
        expect(events[0].eventType).toBe("automation_order_reconciled");
        expect(events[0].metadata.resolution).toBe(expectedResolution);
        expect(events[0].metadata.privyStatus).toBe(privyStatus);
      }
    },
  );

  it.each([
    {
      name: "pending",
      transactions: [
        {
          id: "privy-pending-tx",
          wallet_id: "wallet_123",
          status: "pending",
          transaction_hash: "5xPendingScheduledSignature",
          caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
          created_at: 1_788_000_000_000,
          reference_id: "ribbot-123456-scheduled:reconcile_2",
        },
      ],
      expectedReconciliationStatus: "pending",
      expectedLastError: undefined,
      responseStatus: 200,
    },
    {
      name: "not found",
      transactions: [],
      expectedReconciliationStatus: "not_found",
      expectedLastError:
        "No Privy transaction found for this execution reference yet",
      responseStatus: 200,
    },
    {
      name: "lookup error",
      transactions: [],
      expectedReconciliationStatus: "error",
      expectedLastError: "Privy transaction lookup failed with status 503",
      responseStatus: 503,
    },
  ])(
    "keeps an interrupted order executing while reconciliation is $name",
    async ({
      transactions,
      expectedReconciliationStatus,
      expectedLastError,
      responseStatus,
    }) => {
      const referenceId = "ribbot-123456-scheduled:reconcile_2";
      const executingOrder = {
        ...storedAutomationOrder,
        status: "executing",
        scheduler: {
          executionId: "scheduled:reconcile_2",
          executionReferenceId: referenceId,
          executionStartedAt: "2026-07-10T00:00:00.000Z",
          lastError: "old error",
        },
      };
      const stateUpdates: Array<{
        status?: string;
        expectedStatus?: string;
        expectedExecutionId?: string;
        scheduler: {
          reconciliationStatus?: string;
          lastError?: string;
          manualReviewAfter?: string;
          manualReviewRequiredAt?: string;
          manualReviewReason?: string;
        };
      }> = [];
      const events: string[] = [];
      globalThis.fetch = vi.fn(async () =>
        Response.json({ transactions }, { status: responseStatus }),
      ) as unknown as typeof fetch;

      await runTradingBotScheduledOrders({
        TRADING_BOT_SCHEDULER_ENABLED: "true",
        TRADING_BOT_SCHEDULER_RECONCILE_AFTER_SECONDS: "1",
        TRADING_BOT_MANUAL_REVIEW_AFTER_SECONDS: "1",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/automation-orders/active") {
            return Response.json({
              status: "ready",
              orders: [],
              executingOrders: [executingOrder],
            });
          }
          if (url.pathname === "/account") {
            return Response.json({
              status: "ready",
              account: storedAccount({
                walletSource: "privy",
                privyWalletId: "wallet_123",
              }),
            });
          }
          if (url.pathname === "/automation-order/check") {
            const body = (await request.json()) as {
              status?: string;
              expectedStatus?: string;
              expectedExecutionId?: string;
              scheduler: {
                reconciliationStatus?: string;
                lastError?: string;
                manualReviewAfter?: string;
                manualReviewRequiredAt?: string;
                manualReviewReason?: string;
              };
            };
            stateUpdates.push(body);
            return Response.json({ status: "ready", order: executingOrder });
          }
          if (url.pathname === "/event") {
            const body = (await request.json()) as { eventType: string };
            events.push(body.eventType);
            return Response.json({
              status: "ready",
              event: { eventId: "evt_1" },
            });
          }
          return Response.json({ error: "unexpected path" }, { status: 500 });
        }),
      } as Env);

      expect(stateUpdates).toHaveLength(1);
      expect(stateUpdates[0].status).toBeUndefined();
      expect(stateUpdates[0].expectedStatus).toBe("executing");
      expect(stateUpdates[0].expectedExecutionId).toBe(
        executingOrder.scheduler.executionId,
      );
      expect(stateUpdates[0].scheduler.reconciliationStatus).toBe(
        expectedReconciliationStatus,
      );
      expect(stateUpdates[0].scheduler.lastError).toBe(expectedLastError);
      expect(stateUpdates[0].scheduler.manualReviewAfter).toBe(
        "2026-07-10T00:00:01.000Z",
      );
      expect(stateUpdates[0].scheduler.manualReviewRequiredAt).toBeTruthy();
      expect(stateUpdates[0].scheduler.manualReviewReason).toContain(
        "do not resend",
      );
      expect(events).toEqual(["execution_manual_review_required"]);
    },
  );

  it("does not reconcile a newly claimed order inside the race window", async () => {
    const executingOrder = {
      ...storedAutomationOrder,
      status: "executing",
      scheduler: {
        executionId: "scheduled:recent",
        executionReferenceId: "ribbot-123456-scheduled:recent",
        executionStartedAt: new Date().toISOString(),
      },
    };
    let stateUpdateCalls = 0;
    globalThis.fetch = vi.fn();

    await runTradingBotScheduledOrders({
      TRADING_BOT_SCHEDULER_ENABLED: "true",
      TRADING_BOT_SCHEDULER_RECONCILE_AFTER_SECONDS: "60",
      PRIVY_APP_ID: "privy-app",
      PRIVY_APP_SECRET: "privy-secret",
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/automation-orders/active") {
          return Response.json({
            status: "ready",
            orders: [],
            executingOrders: [executingOrder],
          });
        }
        if (url.pathname === "/automation-order/check") {
          stateUpdateCalls += 1;
        }
        return Response.json({ error: "unexpected path" }, { status: 500 });
      }),
    } as Env);

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(stateUpdateCalls).toBe(0);
  });
});

describe("trading bot withdrawal validation", () => {
  const validWithdrawalBody = {
    telegramUserId: "123456",
    userPublicKey: "So11111111111111111111111111111111111111112",
    mint: "So11111111111111111111111111111111111111112",
    amountIn: "100000000",
    amountLabel: "0.1 SOL",
    destinationAddress: "11111111111111111111111111111111",
  };

  it("requires Ribbot auth before validating withdrawals", async () => {
    const response = await postTradingBotWithdrawalValidation(
      requestJson(
        validWithdrawalBody,
        undefined,
        "/api/frogx/trading-bot/withdrawals/validate",
      ),
      {} as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["RIBBOT_TRADING_BOT_TOKEN"],
    });
  });

  it("rejects invalid withdrawal destinations", async () => {
    const response = await postTradingBotWithdrawalValidation(
      requestJson(
        {
          ...validWithdrawalBody,
          destinationAddress: validWithdrawalBody.userPublicKey,
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/withdrawals/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(data).toEqual({
      error: "destinationAddress must differ from userPublicKey",
    });
  });

  it("accepts SOL withdrawal intents without building transfers", async () => {
    const response = await postTradingBotWithdrawalValidation(
      requestJson(
        validWithdrawalBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/withdrawals/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      normalized: {
        mint: string;
        amountIn: string;
        destinationAddress: string;
        assetType: string;
      };
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("accepted");
    expect(data.normalized).toMatchObject({
      mint: validWithdrawalBody.mint,
      amountIn: "100000000",
      destinationAddress: validWithdrawalBody.destinationAddress,
      assetType: "sol",
    });
    expect(data.warnings.join(" ")).toContain(
      "no transfer transaction was built",
    );
  });

  it("accepts SPL token withdrawal intents", async () => {
    const response = await postTradingBotWithdrawalValidation(
      requestJson(
        {
          ...validWithdrawalBody,
          mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          amountIn: "1234500",
          amountLabel: "1.2345 tokens",
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/withdrawals/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      normalized: {
        mint: string;
        amountIn: string;
        assetType: string;
      };
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("accepted");
    expect(data.normalized).toMatchObject({
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      amountIn: "1234500",
      assetType: "spl",
    });
  });
});

describe("trading bot live withdrawal execution", () => {
  const validWithdrawalExecutionBody = {
    telegramUserId: "123456",
    userPublicKey: "So11111111111111111111111111111111111111112",
    mint: "So11111111111111111111111111111111111111112",
    amountIn: "100000000",
    amountLabel: "0.1 SOL",
    destinationAddress: "11111111111111111111111111111111",
    withdrawalId: "w_123",
  };

  it("requires the FTX live-execution and RPC gates before sending", async () => {
    const response = await postTradingBotWithdrawalExecution(
      requestJson(
        validWithdrawalExecutionBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/withdrawals/execute",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data.status).toBe("not_configured");
    expect(data.required).toContain("TRADING_BOT_LIVE_EXECUTION_ENABLED");
    expect(data.required).toContain("TRADING_BOT_ACCOUNTS");
    expect(data.required).toContain("SOLANA_RPC_URL");
  });

  it("refuses live withdrawals for quote-only external wallets", async () => {
    const response = await postTradingBotWithdrawalExecution(
      requestJson(
        validWithdrawalExecutionBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/withdrawals/execute",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
        SOLANA_RPC_URL: "https://rpc.example",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: "not-used-for-external-wallet",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(() =>
          Response.json({
            status: "ready",
            account: storedAccount({ walletSource: "external" }),
          }),
        ),
      } as Env,
    );
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(409);
    expect(data.error).toBe(
      "Live withdrawals require Spot & NFT Wallet (Privy)",
    );
  });

  it("refuses live withdrawals after the control page revokes bot access", async () => {
    globalThis.fetch = vi.fn();
    const response = await postTradingBotWithdrawalExecution(
      requestJson(
        validWithdrawalExecutionBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/withdrawals/execute",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
        SOLANA_RPC_URL: "https://rpc.example",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: "not-used-for-revoked-wallet",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(() =>
          Response.json({
            status: "ready",
            account: storedAccount({
              walletSource: "privy",
              privyUserId: "user_123",
              privyWalletId: "wallet_123",
              botAccessRevokedAt: "2026-07-04T00:15:00.000Z",
            }),
          }),
        ),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      error: string;
      revokedAt: string;
    };

    expect(response.status).toBe(409);
    expect(data).toEqual({
      status: "revoked",
      error: "FTX bot access has been revoked for this account",
      revokedAt: "2026-07-04T00:15:00.000Z",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("builds a SOL transfer and submits it through Privy signAndSendTransaction", async () => {
    const privateKey = await generateTestAuthorizationPrivateKey();
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "https://rpc.example") {
        const body = JSON.parse(String(init?.body)) as {
          method: string;
          params: unknown[];
        };
        expect(body.method).toBe("getLatestBlockhash");
        return Response.json({
          jsonrpc: "2.0",
          id: body.method,
          result: {
            value: {
              blockhash: "11111111111111111111111111111111",
            },
          },
        });
      }

      expect(url).toBe("https://api.privy.io/v1/wallets/wallet_123/rpc");
      const headers = new Headers(init?.headers);
      expect(headers.get("privy-app-id")).toBe("privy-app");
      expect(headers.get("privy-authorization-signature")).toBeTruthy();
      expect(headers.get("privy-request-expiry")).toBeTruthy();
      const body = JSON.parse(String(init?.body)) as {
        method: string;
        caip2: string;
        reference_id: string;
        params: { transaction: string; encoding: string };
      };
      expect(body.method).toBe("signAndSendTransaction");
      expect(body.caip2).toBe("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
      expect(body.reference_id).toBe("ribbot-123456-withdrawal_w_123");
      expect(headers.get("privy-idempotency-key")).toBe(body.reference_id);
      expect(body.params.encoding).toBe("base64");
      expect(
        Buffer.from(body.params.transaction, "base64").length,
      ).toBeGreaterThan(0);
      return Response.json({
        method: "signAndSendTransaction",
        data: {
          hash: "5xWithdrawalSignature",
          signed_transaction: "signed-transfer-tx",
          caip2: body.caip2,
          transaction_id: "privy-transfer-123",
          reference_id: body.reference_id,
        },
      });
    });

    const response = await postTradingBotWithdrawalExecution(
      requestJson(
        validWithdrawalExecutionBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/withdrawals/execute",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
        SOLANA_RPC_URL: "https://rpc.example",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: privateKey,
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(() =>
          Response.json({
            status: "ready",
            account: storedAccount({
              walletSource: "privy",
              privyUserId: "user_123",
              privyWalletId: "wallet_123",
            }),
          }),
        ),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      signature: string;
      transactionId: string;
      referenceId: string;
      signedTransactionAvailable: boolean;
      solscanUrl: string;
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("executed");
    expect(data.signature).toBe("5xWithdrawalSignature");
    expect(data.transactionId).toBe("privy-transfer-123");
    expect(data.referenceId).toBe("ribbot-123456-withdrawal_w_123");
    expect(data.signedTransactionAvailable).toBe(true);
    expect(data.solscanUrl).toBe("https://solscan.io/tx/5xWithdrawalSignature");
  });

  it("locks an ambiguous withdrawal behind read-only reconciliation", async () => {
    const privateKey = await generateTestAuthorizationPrivateKey();
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    globalThis.fetch = vi.fn(async (input, init) => {
      if (String(input) === "https://rpc.example") {
        const body = JSON.parse(String(init?.body)) as { method: string };
        expect(body.method).toBe("getLatestBlockhash");
        return Response.json({
          jsonrpc: "2.0",
          id: body.method,
          result: { value: { blockhash: "11111111111111111111111111111111" } },
        });
      }
      throw new Error("connection reset after request write");
    });

    const response = await postTradingBotWithdrawalExecution(
      requestJson(
        validWithdrawalExecutionBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/withdrawals/execute",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
        SOLANA_RPC_URL: "https://rpc.example",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: privateKey,
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(() =>
          Response.json({
            status: "ready",
            account: storedAccount({
              walletSource: "privy",
              privyUserId: "user_123",
              privyWalletId: "wallet_123",
            }),
          }),
        ),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      referenceId: string;
      error: string;
    };

    expect(response.status).toBe(503);
    expect(data.status).toBe("pending_reconciliation");
    expect(data.referenceId).toBe("ribbot-123456-withdrawal_w_123");
    expect(data.error).toContain("must not be resent blindly");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(errorLog).toHaveBeenCalledOnce();
  });

  it("reconciles withdrawal status by reference without sending again", async () => {
    const eventBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("reference_id")).toBe(
        "ribbot-123456-withdrawal_w_123",
      );
      expect(init?.method).toBe("GET");
      return Response.json({
        transactions: [
          {
            id: "privy-withdrawal-status-123",
            wallet_id: "wallet_123",
            status: "finalized",
            transaction_hash: "5xWithdrawalReconciled",
            caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
            created_at: 1_782_000_001,
            reference_id: "ribbot-123456-withdrawal_w_123",
          },
        ],
      });
    });
    const response = await postTradingBotWithdrawalExecutionStatus(
      requestJson(
        validWithdrawalExecutionBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/withdrawals/status",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/account") {
            return Response.json({
              status: "ready",
              account: storedAccount({
                walletSource: "privy",
                privyUserId: "user_123",
                privyWalletId: "wallet_123",
              }),
            });
          }
          eventBodies.push((await request.json()) as Record<string, unknown>);
          return Response.json({ status: "ready", event: {} });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      providerStatus: string;
      signature: string;
    };

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      status: "executed",
      providerStatus: "finalized",
      signature: "5xWithdrawalReconciled",
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(eventBodies[0]).toMatchObject({
      eventId: "ribbot-123456-withdrawal_w_123",
      eventType: "withdrawal_executed",
    });
  });
});

describe("trading bot copytrade validation", () => {
  const validCopyTradeBody = {
    telegramUserId: "123456",
    userPublicKey: "So11111111111111111111111111111111111111112",
    targetWallet: "11111111111111111111111111111111",
    maxBuyAmountIn: "100000000",
    amountLabel: "0.1 SOL",
    slippageBps: 500,
    priorityFee: 0,
    copySells: false,
    minLiquidityUsd: 1000,
    maxMarketCapUsd: 1000000,
  };

  it("requires Ribbot auth before validating copytrade configs", async () => {
    const response = await postTradingBotCopyTradeValidation(
      requestJson(
        validCopyTradeBody,
        undefined,
        "/api/frogx/trading-bot/copytrade/validate",
      ),
      {} as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["RIBBOT_TRADING_BOT_TOKEN"],
    });
  });

  it("rejects self-copy copytrade configs", async () => {
    const response = await postTradingBotCopyTradeValidation(
      requestJson(
        {
          ...validCopyTradeBody,
          targetWallet: validCopyTradeBody.userPublicKey,
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/copytrade/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(data).toEqual({
      error: "targetWallet must differ from userPublicKey",
    });
  });

  it("accepts copytrade configs without starting wallet monitors", async () => {
    const response = await postTradingBotCopyTradeValidation(
      requestJson(
        validCopyTradeBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/copytrade/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      normalized: {
        targetWallet: string;
        buyMode: string;
        buyPercentageBps: number;
        maxBuyAmountIn: string;
        sellPriorityFee: number;
        duplicateBuys: boolean;
        onlyRenounced: boolean;
        excludePumpFunTokens: boolean;
        blacklistMints: string[];
        minLiquidityUsd: number;
        maxMarketCapUsd: number;
      };
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("accepted");
    expect(data.normalized).toMatchObject({
      targetWallet: validCopyTradeBody.targetWallet,
      buyMode: "percentage",
      buyPercentageBps: 10000,
      maxBuyAmountIn: "100000000",
      sellPriorityFee: 0,
      duplicateBuys: true,
      onlyRenounced: false,
      excludePumpFunTokens: false,
      blacklistMints: [],
      minLiquidityUsd: 1000,
      maxMarketCapUsd: 1000000,
    });
    expect(data.warnings.join(" ")).toContain(
      "storage request does not start a monitor",
    );
  });

  it("normalizes managed percentage sizing and safety filters", async () => {
    const response = await postTradingBotCopyTradeValidation(
      requestJson(
        {
          ...validCopyTradeBody,
          tag: "Whale One",
          buyMode: "percentage",
          buyPercentageBps: 5000,
          sellPriorityFee: 2500,
          copySells: true,
          duplicateBuys: false,
          onlyRenounced: true,
          excludePumpFunTokens: true,
          minTargetBuyAmountIn: "50000000",
          minMarketCapUsd: 100000,
          blacklistMints: ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"],
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/copytrade/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as {
      normalized: Record<string, unknown>;
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.normalized).toMatchObject({
      tag: "Whale One",
      buyMode: "percentage",
      buyPercentageBps: 5000,
      sellPriorityFee: 2500,
      copySells: true,
      duplicateBuys: false,
      onlyRenounced: true,
      excludePumpFunTokens: true,
      minTargetBuyAmountIn: "50000000",
      minMarketCapUsd: 100000,
      blacklistMints: ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"],
    });
    expect(data.warnings.join(" ")).toContain("copies 50%");
  });

  it("rejects contradictory market-cap filters", async () => {
    const response = await postTradingBotCopyTradeValidation(
      requestJson(
        {
          ...validCopyTradeBody,
          minMarketCapUsd: 2000000,
          maxMarketCapUsd: 1000000,
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/copytrade/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "minMarketCapUsd must not exceed maxMarketCapUsd",
    });
  });
});

describe("copytrade PumpFun bonding-curve detection", () => {
  it("blocks only the official Pump bonding-curve program, not PumpSwap", () => {
    expect(
      isPumpFunBondingCurveTransaction({
        transaction: {
          message: {
            accountKeys: [
              { pubkey: "11111111111111111111111111111111" },
              "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
            ],
          },
        },
      }),
    ).toBe(true);
    expect(
      isPumpFunBondingCurveTransaction({
        transaction: {
          message: {
            accountKeys: ["pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"],
          },
        },
      }),
    ).toBe(false);
    expect(
      copyTradePumpFunExclusionError(true, {
        transaction: {
          message: {
            accountKeys: ["6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"],
          },
        },
      }),
    ).toBe("Copytrade excludes PumpFun bonding-curve transactions");
    expect(
      copyTradePumpFunExclusionError(false, {
        transaction: {
          message: {
            accountKeys: ["6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"],
          },
        },
      }),
    ).toBeUndefined();
  });
});

describe("trading bot sniper validation", () => {
  const validSniperBody = {
    telegramUserId: "123456",
    userPublicKey: "So11111111111111111111111111111111111111112",
    source: "pump",
    maxBuyAmountIn: "50000000",
    amountLabel: "0.05 SOL",
    slippageBps: 800,
    priorityFee: 1000,
    minLiquidityUsd: 2500,
    maxMarketCapUsd: 500000,
    maxSnipes: 3,
  };

  it("requires Ribbot auth before validating sniper configs", async () => {
    const response = await postTradingBotSniperValidation(
      requestJson(
        validSniperBody,
        undefined,
        "/api/frogx/trading-bot/sniper/validate",
      ),
      {} as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["RIBBOT_TRADING_BOT_TOKEN"],
    });
  });

  it("rejects sniper configs without liquidity filters", async () => {
    const response = await postTradingBotSniperValidation(
      requestJson(
        {
          ...validSniperBody,
          minLiquidityUsd: 0,
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/sniper/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(data).toEqual({
      error: "minLiquidityUsd must be a positive number",
    });
  });

  it("accepts sniper configs without starting launch monitors", async () => {
    const response = await postTradingBotSniperValidation(
      requestJson(
        validSniperBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/sniper/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      normalized: {
        source: string;
        maxBuyAmountIn: string;
        minLiquidityUsd: number;
        maxSnipes: number;
      };
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("accepted");
    expect(data.normalized).toMatchObject({
      source: "pump",
      maxBuyAmountIn: "50000000",
      minLiquidityUsd: 2500,
      maxSnipes: 3,
    });
    expect(data.warnings.join(" ")).toContain("does not start a monitor");
  });
});

describe("trading bot auto-buy and auto-sell validation", () => {
  const validAutoBuyBody = {
    telegramUserId: "123456",
    userPublicKey: "So11111111111111111111111111111111111111112",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    maxBuyAmountIn: "100000000",
    amountLabel: "0.1 SOL",
    slippageBps: 500,
    priorityFee: 0,
    minLiquidityUsd: 1000,
    maxMarketCapUsd: 1000000,
  };

  const validAutoSellBody = {
    telegramUserId: "123456",
    userPublicKey: "So11111111111111111111111111111111111111112",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    sellBps: 5000,
    amountLabel: "50%",
    slippageBps: 500,
    priorityFee: 0,
    triggerPrice: "0.02",
    triggerDirection: "above",
  };

  it("accepts auto-buy rules without starting execution", async () => {
    const response = await postTradingBotAutoBuyValidation(
      requestJson(
        validAutoBuyBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/auto-buy/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      normalized: {
        mint: string;
        maxBuyAmountIn: string;
        minLiquidityUsd: number;
      };
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("accepted");
    expect(data.normalized).toMatchObject({
      mint: validAutoBuyBody.mint,
      maxBuyAmountIn: "100000000",
      minLiquidityUsd: 1000,
    });
    expect(data.warnings.join(" ")).toContain("extra live auto-buy gate");
  });

  it("adds market-risk context to auto-buy validation when RPC is configured", async () => {
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "https://rpc.example") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          method?: string;
        };
        expect(body.method).toBe("getAccountInfo");
        return Response.json({
          result: {
            value: {
              owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
              executable: false,
              lamports: 1_461_600,
              data: {
                parsed: {
                  type: "mint",
                  info: {
                    mintAuthority: null,
                    supply: "1000000000",
                    decimals: 6,
                    isInitialized: true,
                    freezeAuthority: null,
                  },
                },
              },
            },
          },
        });
      }
      if (url.startsWith("https://api.jup.ag/price/v3")) {
        const ids = new URL(url).searchParams.get("ids") ?? "";
        return Response.json({
          ...(ids.includes(validAutoBuyBody.mint)
            ? {
                [validAutoBuyBody.mint]: {
                  usdPrice: 2.5,
                  decimals: 6,
                  priceChange24h: 4.2,
                },
              }
            : {}),
          ...(ids.includes("So11111111111111111111111111111111111111112")
            ? {
                So11111111111111111111111111111111111111112: {
                  usdPrice: 100,
                  decimals: 9,
                },
              }
            : {}),
        });
      }
      return Response.json({ error: "unexpected fetch" }, { status: 500 });
    }) as unknown as typeof fetch;

    const response = await postTradingBotAutoBuyValidation(
      requestJson(
        validAutoBuyBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/auto-buy/validate",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        SOLANA_RPC_URL: "https://rpc.example",
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("accepted");
    expect(data.warnings.join(" ")).toContain("Market-risk review: MEDIUM");
    expect(data.warnings.join(" ")).toContain("quote probing requires Titan");
    expect(data.warnings.join(" ")).toContain("extra live auto-buy gate");
  });

  it("rejects invalid auto-sell percentages", async () => {
    const response = await postTradingBotAutoSellValidation(
      requestJson(
        {
          ...validAutoSellBody,
          sellBps: 0,
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/auto-sell/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(data.error).toBe("sellBps must be an integer from 1 to 10000");
  });

  it("accepts auto-sell rules without starting execution", async () => {
    const response = await postTradingBotAutoSellValidation(
      requestJson(
        validAutoSellBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/auto-sell/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      normalized: {
        mint: string;
        sellBps: number;
        triggerPrice: string;
        triggerDirection: string;
      };
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("accepted");
    expect(data.normalized).toMatchObject({
      mint: validAutoSellBody.mint,
      sellBps: 5000,
      triggerPrice: "0.02",
      triggerDirection: "above",
    });
    expect(data.warnings.join(" ")).toContain("extra live auto-sell gate");
  });
});

describe("trading bot bundle-buy validation", () => {
  const validBundleBuyBody = {
    telegramUserId: "123456",
    userPublicKey: "So11111111111111111111111111111111111111112",
    items: [
      {
        mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        maxBuyAmountIn: "50000000",
        amountLabel: "0.05 SOL",
      },
      {
        mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
        maxBuyAmountIn: "75000000",
        amountLabel: "0.075 SOL",
      },
    ],
    amountLabel: "0.125 SOL total",
    slippageBps: 500,
    priorityFee: 0,
    minLiquidityUsd: 1000,
    maxMarketCapUsd: 1000000,
  };

  it("requires Ribbot auth before validating bundle-buy baskets", async () => {
    const response = await postTradingBotBundleBuyValidation(
      requestJson(
        validBundleBuyBody,
        undefined,
        "/api/frogx/trading-bot/bundle-buy/validate",
      ),
      {} as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["RIBBOT_TRADING_BOT_TOKEN"],
    });
  });

  it("rejects duplicate bundle-buy token mints", async () => {
    const response = await postTradingBotBundleBuyValidation(
      requestJson(
        {
          ...validBundleBuyBody,
          items: [
            validBundleBuyBody.items[0],
            {
              ...validBundleBuyBody.items[0],
              maxBuyAmountIn: "25000000",
            },
          ],
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/bundle-buy/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(data.error).toBe("bundle item mints must be unique");
  });

  it("accepts bundle-buy baskets without starting execution", async () => {
    const response = await postTradingBotBundleBuyValidation(
      requestJson(
        validBundleBuyBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/bundle-buy/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      normalized: {
        items: Array<{ mint: string; maxBuyAmountIn: string }>;
        maxBuyAmountIn: string;
        minLiquidityUsd: number;
      };
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("accepted");
    expect(data.normalized.items).toHaveLength(2);
    expect(data.normalized.maxBuyAmountIn).toBe("125000000");
    expect(data.normalized.minLiquidityUsd).toBe(1000);
    expect(data.warnings.join(" ")).toContain(
      "no bundle-buy basket was stored",
    );
    expect(data.warnings.join(" ")).toContain(
      "No bundle execution was requested",
    );
  });
});

describe("trading bot advanced automation storage", () => {
  const validCopyTradeBody = {
    telegramUserId: "123456",
    userPublicKey: "So11111111111111111111111111111111111111112",
    targetWallet: "11111111111111111111111111111111",
    maxBuyAmountIn: "100000000",
    amountLabel: "0.1 SOL",
    slippageBps: 500,
    priorityFee: 0,
    copySells: true,
    minLiquidityUsd: 1000,
    maxMarketCapUsd: 1000000,
  };

  const validSniperBody = {
    telegramUserId: "123456",
    userPublicKey: "So11111111111111111111111111111111111111112",
    source: "pump",
    maxBuyAmountIn: "50000000",
    amountLabel: "0.05 SOL",
    slippageBps: 800,
    priorityFee: 1000,
    minLiquidityUsd: 2500,
    maxMarketCapUsd: 500000,
    maxSnipes: 3,
  };

  const validAutoBuyBody = {
    telegramUserId: "123456",
    userPublicKey: "So11111111111111111111111111111111111111112",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    maxBuyAmountIn: "100000000",
    amountLabel: "0.1 SOL",
    slippageBps: 500,
    priorityFee: 0,
    minLiquidityUsd: 1000,
    maxMarketCapUsd: 1000000,
  };

  const validAutoSellBody = {
    telegramUserId: "123456",
    userPublicKey: "So11111111111111111111111111111111111111112",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    sellBps: 5000,
    amountLabel: "50%",
    slippageBps: 500,
    priorityFee: 0,
    triggerPrice: "0.02",
    triggerDirection: "above",
  };

  const storedCopyTradeConfig = {
    telegramUserId: "123456",
    configId: "c_testcopy",
    kind: "copytrade",
    status: "staged",
    walletAddress: "So11111111111111111111111111111111111111112",
    targetWallet: "11111111111111111111111111111111",
    maxBuyAmountIn: "100000000",
    amountLabel: "0.1 SOL",
    slippageBps: 500,
    priorityFee: 0,
    copySells: true,
    minLiquidityUsd: 1000,
    maxMarketCapUsd: 1000000,
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z",
    validation: {
      validatedAt: "2026-07-04T00:00:00.000Z",
      warnings: [
        "FTX/FrogX stored this copytrade config for future server-side monitoring.",
        "This request did not start a target wallet monitor, build a copied swap, sign, or broadcast.",
      ],
    },
    monitor: {},
  };

  const storedAutoBuyConfig = {
    telegramUserId: "123456",
    configId: "ab_testbuy",
    kind: "auto_buy",
    status: "staged",
    walletAddress: "So11111111111111111111111111111111111111112",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    maxBuyAmountIn: "100000000",
    amountLabel: "0.1 SOL",
    slippageBps: 500,
    priorityFee: 0,
    minLiquidityUsd: 1000,
    maxMarketCapUsd: 1000000,
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z",
    validation: {
      validatedAt: "2026-07-04T00:00:00.000Z",
      warnings: [
        "FTX/FrogX stored this auto-buy rule for server-side automation.",
        "Live auto-buy execution requires the auto-buy monitor, the extra live auto-buy gate, account auto-buy opt-in, FTX market-risk checks, and the normal Privy signer gates.",
        "No swap build, signing, or broadcast was started by this request.",
      ],
    },
    monitor: {},
  };

  const storedBundleBuyConfig = {
    telegramUserId: "123456",
    configId: "bb_testbundle",
    kind: "bundle_buy",
    status: "staged",
    walletAddress: "So11111111111111111111111111111111111111112",
    maxBuyAmountIn: "125000000",
    amountLabel: "0.125 SOL total",
    slippageBps: 500,
    priorityFee: 0,
    minLiquidityUsd: 1000,
    maxMarketCapUsd: 1000000,
    bundleItems: [
      {
        mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        maxBuyAmountIn: "50000000",
        amountLabel: "0.05 SOL",
      },
      {
        mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
        maxBuyAmountIn: "75000000",
        amountLabel: "0.075 SOL",
      },
    ],
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z",
    validation: {
      validatedAt: "2026-07-04T00:00:00.000Z",
      warnings: [
        "FTX/FrogX stored this bundle-buy basket for future server-side execution.",
        "Bundle contains 2 token buys with shared liquidity and market-cap filters.",
        "No bundle execution was requested by this validation/storage call.",
      ],
    },
    monitor: {},
  };

  const installBundleBuyExecutionFetchMock = (
    onPrivyRpc: (
      body: { reference_id: string },
      callNumber: number,
    ) => Promise<Response> | Response,
  ) => {
    let privyRpcCalls = 0;
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.startsWith("https://api.jup.ag/price/v3")) {
        const ids = new URL(url).searchParams.get("ids") ?? "";
        return Response.json({
          ...(ids.includes(storedBundleBuyConfig.bundleItems[0].mint)
            ? {
                [storedBundleBuyConfig.bundleItems[0].mint]: {
                  usdPrice: 2.5,
                  decimals: 6,
                },
              }
            : {}),
          ...(ids.includes(storedBundleBuyConfig.bundleItems[1].mint)
            ? {
                [storedBundleBuyConfig.bundleItems[1].mint]: {
                  usdPrice: 1,
                  decimals: 6,
                },
              }
            : {}),
          ...(ids.includes("So11111111111111111111111111111111111111112")
            ? {
                So11111111111111111111111111111111111111112: {
                  usdPrice: 100,
                  decimals: 9,
                },
              }
            : {}),
        });
      }
      if (url === "https://rpc.example") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          method?: string;
        };
        if (body.method === "getBalance") {
          return Response.json({ result: { value: 1_000_000_000 } });
        }
        if (body.method === "getTokenAccountsByOwner") {
          return Response.json({ result: { value: [] } });
        }
        if (body.method === "getAccountInfo") {
          return Response.json({
            result: {
              value: {
                owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                executable: false,
                lamports: 1_461_600,
                data: {
                  parsed: {
                    type: "mint",
                    info: {
                      mintAuthority: null,
                      supply: "1000000000",
                      decimals: 6,
                      isInitialized: true,
                      freezeAuthority: null,
                    },
                  },
                },
              },
            },
          });
        }
      }
      if (url.includes("/frogx/swap")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          outMint: string;
        };
        return Response.json({
          txBase64: `BASE64_TX_${body.outMint.slice(0, 4)}`,
          meta: { routeId: `bundle-buy-${body.outMint.slice(0, 4)}` },
        });
      }
      if (url === "https://api.privy.io/v1/wallets/wallet_123/rpc") {
        privyRpcCalls += 1;
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          reference_id: string;
        };
        return onPrivyRpc(body, privyRpcCalls);
      }
      return Response.json(
        { error: { message: `unexpected fetch ${url}` } },
        { status: 500 },
      );
    }) as unknown as typeof fetch;

    return () => privyRpcCalls;
  };

  const runBundleBuyStatusCheck = async (input: {
    attemptedItems: number;
    confirmedItems: number;
    providerStatuses: Array<string | null>;
  }) => {
    const stateUpdates: Array<{
      status?: string;
      monitor: Record<string, unknown>;
    }> = [];
    const events: Array<Record<string, unknown>> = [];
    const privyRequests: Array<{
      method?: string;
      referenceId: string | null;
    }> = [];
    const config = {
      ...storedBundleBuyConfig,
      status: "executing",
      monitor: {
        executionStartedAt: "2026-07-10T00:00:00.000Z",
        bundleAttemptedItems: input.attemptedItems,
        bundleConfirmedItems: input.confirmedItems,
      },
    };
    const accountStore = fakeTradingBotAccounts(async (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/automation-configs") {
        return Response.json({ status: "ready", configs: [config] });
      }
      if (url.pathname === "/account") {
        return Response.json({
          status: "ready",
          account: storedAccount({
            walletSource: "privy",
            privyUserId: "user_123",
            privyWalletId: "wallet_123",
          }),
        });
      }
      if (url.pathname === "/automation-config/check") {
        const body = (await request.json()) as {
          status?: string;
          monitor: Record<string, unknown>;
        };
        stateUpdates.push(body);
        return Response.json({
          status: "ready",
          config: { ...config, ...body },
        });
      }
      if (url.pathname === "/event") {
        events.push((await request.json()) as Record<string, unknown>);
        return Response.json({ status: "ready", event: {} });
      }
      return Response.json(
        { error: `unexpected account path ${url.pathname}` },
        { status: 500 },
      );
    });
    globalThis.fetch = vi.fn(async (request, init) => {
      const url = new URL(String(request));
      const referenceId = url.searchParams.get("reference_id");
      privyRequests.push({ method: init?.method, referenceId });
      const itemIndex = referenceId?.endsWith(":2") ? 1 : 0;
      const providerStatus = input.providerStatuses[itemIndex] ?? null;
      return Response.json({
        transactions: providerStatus
          ? [
              {
                id: `privy-bundle-status-${itemIndex + 1}`,
                wallet_id: "wallet_123",
                status: providerStatus,
                transaction_hash:
                  providerStatus === "confirmed" ||
                  providerStatus === "finalized"
                    ? `5xBundleReconciled${itemIndex + 1}`
                    : null,
                caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
                created_at: 1_783_632_000 + itemIndex,
                reference_id: referenceId,
              },
            ]
          : [],
      });
    });

    const response = await postTradingBotBundleBuyExecutionStatus(
      requestJson(
        {
          telegramUserId: "123456",
          userPublicKey: storedBundleBuyConfig.walletAddress,
          configId: storedBundleBuyConfig.configId,
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/bundle-buy/status",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_MANUAL_REVIEW_AFTER_SECONDS: "1",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        TRADING_BOT_ACCOUNTS: accountStore,
      } as Env,
    );
    return { response, stateUpdates, events, privyRequests };
  };

  const storedAutoSellConfig = {
    telegramUserId: "123456",
    configId: "as_testsell",
    kind: "auto_sell",
    status: "staged",
    walletAddress: "So11111111111111111111111111111111111111112",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    maxBuyAmountIn: "0",
    amountLabel: "50%",
    slippageBps: 500,
    priorityFee: 0,
    minLiquidityUsd: 0,
    sellBps: 5000,
    triggerPrice: "0.02",
    triggerDirection: "above",
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z",
    validation: {
      validatedAt: "2026-07-04T00:00:00.000Z",
      warnings: [
        "FTX/FrogX stored this auto-sell rule for future server-side automation.",
        "No auto-sell monitor, swap build, signing, or broadcast was started.",
      ],
    },
    monitor: {},
  };

  it("requires Ribbot auth before storing advanced configs", async () => {
    const response = await postTradingBotCopyTradeStorage(
      requestJson(
        validCopyTradeBody,
        undefined,
        "/api/frogx/trading-bot/copytrade",
      ),
      {} as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["RIBBOT_TRADING_BOT_TOKEN"],
    });
  });

  it("requires FTX account storage before storing advanced configs", async () => {
    const response = await postTradingBotCopyTradeStorage(
      requestJson(
        validCopyTradeBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/copytrade",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["TRADING_BOT_ACCOUNTS"],
    });
  });

  it("normalizes and stores copytrade configs through the account Durable Object", async () => {
    const response = await postTradingBotCopyTradeStorage(
      requestJson(
        validCopyTradeBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/copytrade",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/event") {
            return Response.json({
              status: "ready",
              event: { eventId: "evt_1" },
            });
          }
          expect(url.pathname).toBe("/automation-config");
          const body = (await request.json()) as {
            configId: string;
            kind: string;
            config: {
              targetWallet: string;
              copySells: boolean;
              maxBuyAmountIn: string;
            };
            validation: { warnings: string[]; validatedAt: string };
          };
          expect(body.configId).toMatch(/^c_[a-f0-9]{24}$/);
          expect(body.kind).toBe("copytrade");
          expect(body.config).toMatchObject({
            targetWallet: validCopyTradeBody.targetWallet,
            copySells: true,
            maxBuyAmountIn: "100000000",
          });
          expect(body.validation.warnings.join(" ")).toContain(
            "stored this copytrade config",
          );
          return Response.json({
            status: "stored",
            configKind: "copytrade",
            config: {
              ...storedCopyTradeConfig,
              configId: body.configId,
              validation: body.validation,
            },
            normalized: body.config,
            warnings: body.validation.warnings,
            validatedAt: body.validation.validatedAt,
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      configKind: string;
      config: { configId: string; kind: string; status: string };
      normalized: { targetWallet: string };
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("stored");
    expect(data.configKind).toBe("copytrade");
    expect(data.config.configId).toMatch(/^c_[a-f0-9]{24}$/);
    expect(data.config.status).toBe("staged");
    expect(data.normalized.targetWallet).toBe(validCopyTradeBody.targetWallet);
    expect(data.warnings.join(" ")).toContain(
      "storage request does not start a monitor",
    );
  });

  it("lists stored copytrade configs through the account Durable Object", async () => {
    const response = await getTradingBotCopyTradeConfigs(
      new Request(
        "https://frogx.example/api/frogx/trading-bot/copytrade?telegramUserId=123456",
        {
          headers: { Authorization: "Bearer ribbot-token" },
        },
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts((request) => {
          const url = new URL(request.url);
          expect(url.pathname).toBe("/automation-configs");
          expect(url.searchParams.get("telegramUserId")).toBe("123456");
          expect(url.searchParams.get("kind")).toBe("copytrade");
          return Response.json({
            status: "ready",
            telegramUserId: "123456",
            kind: "copytrade",
            configs: [storedCopyTradeConfig],
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      configs: Array<{ configId: string; kind: string }>;
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("ready");
    expect(data.configs).toHaveLength(1);
    expect(data.configs[0].configId).toBe("c_testcopy");
  });

  it("cancels stored copytrade configs through the account Durable Object", async () => {
    const response = await postTradingBotCopyTradeCancel(
      requestJson(
        { telegramUserId: "123456", configId: "c_testcopy" },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/copytrade/cancel",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/event") {
            return Response.json({
              status: "ready",
              event: { eventId: "evt_1" },
            });
          }
          expect(url.pathname).toBe("/automation-config/cancel");
          const body = (await request.json()) as {
            telegramUserId: string;
            configId: string;
            kind: string;
          };
          expect(body).toEqual({
            telegramUserId: "123456",
            configId: "c_testcopy",
            kind: "copytrade",
          });
          return Response.json({
            status: "cancelled",
            config: {
              ...storedCopyTradeConfig,
              status: "cancelled",
              updatedAt: "2026-07-04T00:00:01.000Z",
            },
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      config: { configId: string; status: string };
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("cancelled");
    expect(data.config.configId).toBe("c_testcopy");
    expect(data.config.status).toBe("cancelled");
  });

  it("pauses a staged copytrade through the account Durable Object", async () => {
    const response = await postTradingBotCopyTradeControl(
      requestJson(
        {
          telegramUserId: "123456",
          configId: "c_testcopy",
          action: "pause",
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/copytrade/control",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/event") {
            return Response.json({ status: "ready", event: { eventId: "e" } });
          }
          expect(url.pathname).toBe("/automation-config/control");
          await expect(request.json()).resolves.toEqual({
            telegramUserId: "123456",
            configId: "c_testcopy",
            kind: "copytrade",
            action: "pause",
          });
          return Response.json({
            status: "paused",
            config: { ...storedCopyTradeConfig, status: "paused" },
          });
        }),
      } as Env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "paused",
      config: { configId: "c_testcopy", status: "paused" },
    });
  });

  it("validates and updates a staged copytrade through the account Durable Object", async () => {
    const response = await postTradingBotCopyTradeUpdate(
      requestJson(
        {
          ...validCopyTradeBody,
          configId: "c_testcopy",
          tag: "Edited Whale",
          buyMode: "percentage",
          buyPercentageBps: 2500,
          sellPriorityFee: 2500,
          duplicateBuys: false,
          onlyRenounced: true,
          excludePumpFunTokens: true,
          minTargetBuyAmountIn: "50000000",
          minMarketCapUsd: 100000,
          blacklistMints: ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"],
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/copytrade/update",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/event") {
            return Response.json({ status: "ready", event: { eventId: "e" } });
          }
          expect(url.pathname).toBe("/automation-config/update");
          const body = (await request.json()) as {
            configId: string;
            kind: string;
            config: Record<string, unknown>;
            validation: { warnings: string[] };
          };
          expect(body.configId).toBe("c_testcopy");
          expect(body.kind).toBe("copytrade");
          expect(body.config).toMatchObject({
            tag: "Edited Whale",
            buyMode: "percentage",
            buyPercentageBps: 2500,
            sellPriorityFee: 2500,
            duplicateBuys: false,
            onlyRenounced: true,
            excludePumpFunTokens: true,
            minTargetBuyAmountIn: "50000000",
            minMarketCapUsd: 100000,
          });
          expect(body.validation.warnings.join(" ")).toContain(
            "updated this copytrade config",
          );
          return Response.json({
            status: "updated",
            targetChanged: false,
            config: {
              ...storedCopyTradeConfig,
              ...body.config,
              tag: "Edited Whale",
              status: "staged",
            },
          });
        }),
      } as Env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "updated",
      targetChanged: false,
      config: {
        configId: "c_testcopy",
        tag: "Edited Whale",
        buyPercentageBps: 2500,
      },
    });
  });

  it("keeps executing copytrades immutable when FTX rejects an update", async () => {
    const response = await postTradingBotCopyTradeUpdate(
      requestJson(
        { ...validCopyTradeBody, configId: "c_testcopy" },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/copytrade/update",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(() =>
          Response.json(
            {
              error: "Config cannot be updated from executing status",
              config: { ...storedCopyTradeConfig, status: "executing" },
            },
            { status: 409 },
          ),
        ),
      } as Env,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "Config cannot be updated from executing status",
      config: { configId: "c_testcopy", status: "executing" },
    });
  });

  it("duplicates a copytrade as a fresh FTX config", async () => {
    const response = await postTradingBotCopyTradeDuplicate(
      requestJson(
        {
          telegramUserId: "123456",
          configId: "c_testcopy",
          tag: "Whale Copy",
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/copytrade/duplicate",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/event") {
            return Response.json({ status: "ready", event: { eventId: "e" } });
          }
          expect(url.pathname).toBe("/automation-config/duplicate");
          await expect(request.json()).resolves.toEqual({
            telegramUserId: "123456",
            configId: "c_testcopy",
            kind: "copytrade",
            tag: "Whale Copy",
          });
          return Response.json({
            status: "duplicated",
            sourceConfigId: "c_testcopy",
            config: {
              ...storedCopyTradeConfig,
              configId: "c_copy2",
              tag: "Whale Copy",
              status: "staged",
              monitor: {},
            },
          });
        }),
      } as Env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "duplicated",
      sourceConfigId: "c_testcopy",
      config: { configId: "c_copy2", status: "staged", monitor: {} },
    });
  });

  it("normalizes and stores sniper configs through the account Durable Object", async () => {
    const response = await postTradingBotSniperStorage(
      requestJson(
        validSniperBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/sniper",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/event") {
            return Response.json({
              status: "ready",
              event: { eventId: "evt_1" },
            });
          }
          expect(url.pathname).toBe("/automation-config");
          const body = (await request.json()) as {
            configId: string;
            kind: string;
            config: {
              source: string;
              maxSnipes: number;
              maxBuyAmountIn: string;
            };
            validation: { warnings: string[]; validatedAt: string };
          };
          expect(body.configId).toMatch(/^s_[a-f0-9]{24}$/);
          expect(body.kind).toBe("sniper");
          expect(body.config).toMatchObject({
            source: "pump",
            maxSnipes: 3,
            maxBuyAmountIn: "50000000",
          });
          expect(body.validation.warnings.join(" ")).toContain(
            "stored this sniper config",
          );
          return Response.json({
            status: "stored",
            configKind: "sniper",
            config: {
              telegramUserId: "123456",
              configId: body.configId,
              kind: "sniper",
              status: "staged",
              walletAddress: validSniperBody.userPublicKey,
              source: "pump",
              maxBuyAmountIn: "50000000",
              amountLabel: "0.05 SOL",
              slippageBps: 800,
              priorityFee: 1000,
              minLiquidityUsd: 2500,
              maxMarketCapUsd: 500000,
              maxSnipes: 3,
              createdAt: "2026-07-04T00:00:00.000Z",
              updatedAt: "2026-07-04T00:00:00.000Z",
              validation: body.validation,
              monitor: {},
            },
            normalized: body.config,
            warnings: body.validation.warnings,
            validatedAt: body.validation.validatedAt,
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      configKind: string;
      config: { configId: string; kind: string; source: string };
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("stored");
    expect(data.configKind).toBe("sniper");
    expect(data.config.configId).toMatch(/^s_[a-f0-9]{24}$/);
    expect(data.config.source).toBe("pump");
  });

  it("lists stored sniper configs through the account Durable Object", async () => {
    const response = await getTradingBotSniperConfigs(
      new Request(
        "https://frogx.example/api/frogx/trading-bot/sniper?telegramUserId=123456",
        {
          headers: { Authorization: "Bearer ribbot-token" },
        },
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts((request) => {
          const url = new URL(request.url);
          expect(url.pathname).toBe("/automation-configs");
          expect(url.searchParams.get("telegramUserId")).toBe("123456");
          expect(url.searchParams.get("kind")).toBe("sniper");
          return Response.json({
            status: "ready",
            telegramUserId: "123456",
            kind: "sniper",
            configs: [],
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      configs: unknown[];
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("ready");
    expect(data.configs).toEqual([]);
  });

  it("cancels stored sniper configs through the account Durable Object", async () => {
    const response = await postTradingBotSniperCancel(
      requestJson(
        { telegramUserId: "123456", configId: "s_testsnipe" },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/sniper/cancel",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/event") {
            return Response.json({
              status: "ready",
              event: { eventId: "evt_1" },
            });
          }
          expect(url.pathname).toBe("/automation-config/cancel");
          const body = (await request.json()) as {
            telegramUserId: string;
            configId: string;
            kind: string;
          };
          expect(body).toEqual({
            telegramUserId: "123456",
            configId: "s_testsnipe",
            kind: "sniper",
          });
          return Response.json({
            status: "cancelled",
            config: {
              configId: "s_testsnipe",
              kind: "sniper",
              status: "cancelled",
            },
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      config: { configId: string; status: string };
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("cancelled");
    expect(data.config.configId).toBe("s_testsnipe");
    expect(data.config.status).toBe("cancelled");
  });

  it("normalizes and stores auto-buy rules through the account Durable Object", async () => {
    const response = await postTradingBotAutoBuyStorage(
      requestJson(
        validAutoBuyBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/auto-buy",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/event") {
            return Response.json({
              status: "ready",
              event: { eventId: "evt_1" },
            });
          }
          expect(url.pathname).toBe("/automation-config");
          const body = (await request.json()) as {
            configId: string;
            kind: string;
            config: {
              mint: string;
              maxBuyAmountIn: string;
              minLiquidityUsd: number;
            };
            validation: { warnings: string[]; validatedAt: string };
          };
          expect(body.configId).toMatch(/^ab_[a-f0-9]{24}$/);
          expect(body.kind).toBe("auto_buy");
          expect(body.config).toMatchObject({
            mint: validAutoBuyBody.mint,
            maxBuyAmountIn: "100000000",
            minLiquidityUsd: 1000,
          });
          expect(body.validation.warnings.join(" ")).toContain(
            "stored this auto-buy rule",
          );
          return Response.json({
            status: "stored",
            configKind: "auto_buy",
            config: {
              ...storedAutoBuyConfig,
              configId: body.configId,
              validation: body.validation,
            },
            normalized: body.config,
            warnings: body.validation.warnings,
            validatedAt: body.validation.validatedAt,
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      configKind: string;
      config: { configId: string; kind: string; mint: string };
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("stored");
    expect(data.configKind).toBe("auto_buy");
    expect(data.config.configId).toMatch(/^ab_[a-f0-9]{24}$/);
    expect(data.config.mint).toBe(validAutoBuyBody.mint);
    expect(data.warnings.join(" ")).toContain("extra live auto-buy gate");
  });

  it("lists stored auto-buy rules through the account Durable Object", async () => {
    const response = await getTradingBotAutoBuyConfigs(
      new Request(
        "https://frogx.example/api/frogx/trading-bot/auto-buy?telegramUserId=123456",
        {
          headers: { Authorization: "Bearer ribbot-token" },
        },
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts((request) => {
          const url = new URL(request.url);
          expect(url.pathname).toBe("/automation-configs");
          expect(url.searchParams.get("telegramUserId")).toBe("123456");
          expect(url.searchParams.get("kind")).toBe("auto_buy");
          return Response.json({
            status: "ready",
            telegramUserId: "123456",
            kind: "auto_buy",
            configs: [storedAutoBuyConfig],
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      configs: Array<{ configId: string; kind: string; mint: string }>;
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("ready");
    expect(data.configs).toHaveLength(1);
    expect(data.configs[0].configId).toBe("ab_testbuy");
    expect(data.configs[0].mint).toBe(validAutoBuyBody.mint);
  });

  it("cancels stored auto-buy rules through the account Durable Object", async () => {
    const response = await postTradingBotAutoBuyCancel(
      requestJson(
        { telegramUserId: "123456", configId: "ab_testbuy" },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/auto-buy/cancel",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/event") {
            return Response.json({
              status: "ready",
              event: { eventId: "evt_1" },
            });
          }
          expect(url.pathname).toBe("/automation-config/cancel");
          const body = (await request.json()) as {
            telegramUserId: string;
            configId: string;
            kind: string;
          };
          expect(body).toEqual({
            telegramUserId: "123456",
            configId: "ab_testbuy",
            kind: "auto_buy",
          });
          return Response.json({
            status: "cancelled",
            config: {
              ...storedAutoBuyConfig,
              status: "cancelled",
              updatedAt: "2026-07-04T00:00:01.000Z",
            },
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      config: { configId: string; status: string };
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("cancelled");
    expect(data.config.configId).toBe("ab_testbuy");
    expect(data.config.status).toBe("cancelled");
  });

  it("normalizes and stores bundle-buy baskets through the account Durable Object", async () => {
    const response = await postTradingBotBundleBuyStorage(
      requestJson(
        {
          telegramUserId: "123456",
          userPublicKey: "So11111111111111111111111111111111111111112",
          items: [
            {
              mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
              maxBuyAmountIn: "50000000",
              amountLabel: "0.05 SOL",
            },
            {
              mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
              maxBuyAmountIn: "75000000",
              amountLabel: "0.075 SOL",
            },
          ],
          amountLabel: "0.125 SOL total",
          slippageBps: 500,
          priorityFee: 0,
          minLiquidityUsd: 1000,
          maxMarketCapUsd: 1000000,
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/bundle-buy",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/event") {
            return Response.json({
              status: "ready",
              event: { eventId: "evt_1" },
            });
          }
          expect(url.pathname).toBe("/automation-config");
          const body = (await request.json()) as {
            configId: string;
            kind: string;
            config: {
              items: Array<{ mint: string; maxBuyAmountIn: string }>;
              maxBuyAmountIn: string;
            };
            validation: { warnings: string[]; validatedAt: string };
          };
          expect(body.configId).toMatch(/^bb_[a-f0-9]{24}$/);
          expect(body.kind).toBe("bundle_buy");
          expect(body.config.items).toHaveLength(2);
          expect(body.config.maxBuyAmountIn).toBe("125000000");
          expect(body.validation.warnings.join(" ")).toContain(
            "stored this bundle-buy basket",
          );
          return Response.json({
            status: "stored",
            configKind: "bundle_buy",
            config: {
              ...storedBundleBuyConfig,
              configId: body.configId,
              validation: body.validation,
            },
            normalized: body.config,
            warnings: body.validation.warnings,
            validatedAt: body.validation.validatedAt,
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      configKind: string;
      config: {
        configId: string;
        kind: string;
        bundleItems: Array<{ mint: string }>;
      };
      normalized: { items: Array<{ mint: string }>; maxBuyAmountIn: string };
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("stored");
    expect(data.configKind).toBe("bundle_buy");
    expect(data.config.configId).toMatch(/^bb_[a-f0-9]{24}$/);
    expect(data.config.bundleItems).toHaveLength(2);
    expect(data.normalized.maxBuyAmountIn).toBe("125000000");
    expect(data.warnings.join(" ")).toContain(
      "No bundle execution was requested",
    );
  });

  it("lists stored bundle-buy baskets through the account Durable Object", async () => {
    const response = await getTradingBotBundleBuyConfigs(
      new Request(
        "https://frogx.example/api/frogx/trading-bot/bundle-buy?telegramUserId=123456",
        {
          headers: { Authorization: "Bearer ribbot-token" },
        },
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts((request) => {
          const url = new URL(request.url);
          expect(url.pathname).toBe("/automation-configs");
          expect(url.searchParams.get("telegramUserId")).toBe("123456");
          expect(url.searchParams.get("kind")).toBe("bundle_buy");
          return Response.json({
            status: "ready",
            telegramUserId: "123456",
            kind: "bundle_buy",
            configs: [storedBundleBuyConfig],
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      configs: Array<{
        configId: string;
        kind: string;
        bundleItems: Array<{ mint: string }>;
      }>;
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("ready");
    expect(data.configs).toHaveLength(1);
    expect(data.configs[0].configId).toBe("bb_testbundle");
    expect(data.configs[0].bundleItems).toHaveLength(2);
  });

  it("cancels stored bundle-buy baskets through the account Durable Object", async () => {
    const response = await postTradingBotBundleBuyCancel(
      requestJson(
        { telegramUserId: "123456", configId: "bb_testbundle" },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/bundle-buy/cancel",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/event") {
            return Response.json({
              status: "ready",
              event: { eventId: "evt_1" },
            });
          }
          expect(url.pathname).toBe("/automation-config/cancel");
          const body = (await request.json()) as {
            telegramUserId: string;
            configId: string;
            kind: string;
          };
          expect(body).toEqual({
            telegramUserId: "123456",
            configId: "bb_testbundle",
            kind: "bundle_buy",
          });
          return Response.json({
            status: "cancelled",
            config: {
              ...storedBundleBuyConfig,
              status: "cancelled",
              updatedAt: "2026-07-04T00:00:01.000Z",
            },
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      config: { configId: string; status: string };
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("cancelled");
    expect(data.config.configId).toBe("bb_testbundle");
    expect(data.config.status).toBe("cancelled");
  });

  it("executes stored bundle-buy baskets only through FTX live gates and Privy execution", async () => {
    const privateKey = await generateTestAuthorizationPrivateKey();
    installTitanQuoteWebSocketMock({
      amountIn: 75_000_000,
      amountOut: 2_500_000,
      priceImpactBps: 120,
    });
    const account = storedAccount({
      walletSource: "privy",
      privyUserId: "user_123",
      privyWalletId: "wallet_123",
    });
    const stateUpdates: Array<{
      status?: string;
      monitor: {
        executedCount?: number;
        lastTriggerReason?: string;
        bundleAttemptedItems?: number;
        bundleConfirmedItems?: number;
      };
    }> = [];
    const events: Array<{
      eventType: string;
      metadata: Record<string, unknown>;
    }> = [];
    const privyReferences: string[] = [];

    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.startsWith("https://api.jup.ag/price/v3")) {
        const ids = new URL(url).searchParams.get("ids") ?? "";
        return Response.json({
          ...(ids.includes(storedBundleBuyConfig.bundleItems[0].mint)
            ? {
                [storedBundleBuyConfig.bundleItems[0].mint]: {
                  usdPrice: 2.5,
                  decimals: 6,
                },
              }
            : {}),
          ...(ids.includes(storedBundleBuyConfig.bundleItems[1].mint)
            ? {
                [storedBundleBuyConfig.bundleItems[1].mint]: {
                  usdPrice: 1,
                  decimals: 6,
                },
              }
            : {}),
          ...(ids.includes("So11111111111111111111111111111111111111112")
            ? {
                So11111111111111111111111111111111111111112: {
                  usdPrice: 100,
                  decimals: 9,
                },
              }
            : {}),
        });
      }

      if (url === "https://rpc.example") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          method?: string;
        };
        if (body.method === "getBalance") {
          return Response.json({ result: { value: 1_000_000_000 } });
        }
        if (body.method === "getTokenAccountsByOwner") {
          return Response.json({ result: { value: [] } });
        }
        if (body.method === "getAccountInfo") {
          return Response.json({
            result: {
              value: {
                owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                executable: false,
                lamports: 1_461_600,
                data: {
                  parsed: {
                    type: "mint",
                    info: {
                      mintAuthority: null,
                      supply: "1000000000",
                      decimals: 6,
                      isInitialized: true,
                      freezeAuthority: null,
                    },
                  },
                },
              },
            },
          });
        }
      }

      if (url.includes("/frogx/swap")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          inMint: string;
          outMint: string;
          amountIn: string;
        };
        expect(body.inMint).toBe("So11111111111111111111111111111111111111112");
        expect(
          storedBundleBuyConfig.bundleItems.map((item) => item.mint),
        ).toContain(body.outMint);
        return Response.json({
          txBase64: `BASE64_TX_${body.outMint.slice(0, 4)}`,
          meta: { routeId: `bundle-buy-${body.outMint.slice(0, 4)}` },
        });
      }

      if (url === "https://api.privy.io/v1/wallets/wallet_123/rpc") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          method: string;
          reference_id: string;
          params: { transaction: string };
        };
        expect(body.method).toBe("signAndSendTransaction");
        privyReferences.push(body.reference_id);
        return Response.json({
          method: "signAndSendTransaction",
          data: {
            hash: `5xBundleSignature${privyReferences.length}`,
            signed_transaction: "signed-tx",
            caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
            transaction_id: `privy-bundle-tx-${privyReferences.length}`,
            reference_id: body.reference_id,
          },
        });
      }

      return Response.json(
        { error: { message: `unexpected fetch ${url}` } },
        { status: 500 },
      );
    }) as unknown as typeof fetch;

    const response = await postTradingBotBundleBuyExecution(
      requestJson(
        {
          telegramUserId: "123456",
          userPublicKey: storedBundleBuyConfig.walletAddress,
          configId: storedBundleBuyConfig.configId,
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/bundle-buy/execute",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_BUNDLE_BUY_LIVE_EXECUTION_ENABLED: "true",
        TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
        SOLANA_RPC_URL: "https://rpc.example",
        TITAN_TOKEN: "titan-token",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: privateKey,
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/automation-configs") {
            expect(url.searchParams.get("telegramUserId")).toBe("123456");
            expect(url.searchParams.get("kind")).toBe("bundle_buy");
            return Response.json({
              status: "ready",
              telegramUserId: "123456",
              kind: "bundle_buy",
              configs: [storedBundleBuyConfig],
            });
          }
          if (url.pathname === "/account") {
            return Response.json({
              status: "ready",
              account,
            });
          }
          if (url.pathname === "/automation-config/claim") {
            const body = (await request.json()) as {
              monitor: Record<string, unknown>;
            };
            return Response.json({
              status: "claimed",
              config: {
                ...storedBundleBuyConfig,
                status: "executing",
                monitor: body.monitor,
              },
            });
          }
          if (url.pathname === "/automation-config/check") {
            const body = (await request.json()) as {
              status?: string;
              monitor: { executedCount?: number; lastTriggerReason?: string };
            };
            stateUpdates.push(body);
            return Response.json({
              status: "ready",
              config: { ...storedBundleBuyConfig, monitor: body.monitor },
            });
          }
          if (url.pathname === "/event") {
            const body = (await request.json()) as {
              eventType: string;
              metadata: Record<string, unknown>;
            };
            events.push(body);
            return Response.json({
              status: "ready",
              event: { eventId: "evt_1" },
            });
          }
          return Response.json({ error: "unexpected path" }, { status: 500 });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      itemCount: number;
      executions: Array<{ mint: string; signature: string }>;
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("executed");
    expect(data.itemCount).toBe(2);
    expect(data.executions.map((item) => item.signature)).toEqual([
      "5xBundleSignature1",
      "5xBundleSignature2",
    ]);
    expect(privyReferences).toEqual([
      "ribbot-123456-bundle_buy:bb_testbundle:1",
      "ribbot-123456-bundle_buy:bb_testbundle:2",
    ]);
    expect(stateUpdates).toHaveLength(5);
    expect(stateUpdates.at(-1)?.status).toBe("executed");
    expect(stateUpdates.at(-1)?.monitor.executedCount).toBe(1);
    expect(stateUpdates.at(-1)?.monitor.bundleAttemptedItems).toBe(2);
    expect(stateUpdates.at(-1)?.monitor.bundleConfirmedItems).toBe(2);
    expect(events.map((event) => event.eventType)).toEqual([
      "swap_executed",
      "swap_executed",
      "advanced_automation_config_executed",
    ]);
    expect(events[2].metadata.kind).toBe("bundle_buy");
    expect(events[2].metadata.itemCount).toBe(2);
    expect(events[2].metadata.totalAmountIn).toBe("125000000");
  });

  it("locks an ambiguously submitted bundle item for read-only reconciliation", async () => {
    const privateKey = await generateTestAuthorizationPrivateKey();
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    installTitanQuoteWebSocketMock({
      amountIn: 75_000_000,
      amountOut: 2_500_000,
      priceImpactBps: 120,
    });
    const privyRpcCallCount = installBundleBuyExecutionFetchMock(
      (body, callNumber) => {
        if (callNumber === 2) {
          throw new Error("connection reset after bundle item request write");
        }
        return Response.json({
          method: "signAndSendTransaction",
          data: {
            hash: "5xBundleSignature1",
            signed_transaction: "signed-tx",
            caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
            transaction_id: "privy-bundle-tx-1",
            reference_id: body.reference_id,
          },
        });
      },
    );
    const stateUpdates: Array<{
      status?: string;
      monitor: {
        bundleAttemptedItems?: number;
        bundleConfirmedItems?: number;
      };
    }> = [];
    const events: Array<{ eventType: string }> = [];
    const executingConfig = {
      ...storedBundleBuyConfig,
      status: "executing",
      monitor: {
        executionStartedAt: "2026-07-10T00:00:00.000Z",
        bundleAttemptedItems: 0,
        bundleConfirmedItems: 0,
      },
    };
    const response = await postTradingBotBundleBuyExecution(
      requestJson(
        {
          telegramUserId: "123456",
          userPublicKey: storedBundleBuyConfig.walletAddress,
          configId: storedBundleBuyConfig.configId,
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/bundle-buy/execute",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_BUNDLE_BUY_LIVE_EXECUTION_ENABLED: "true",
        TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
        SOLANA_RPC_URL: "https://rpc.example",
        TITAN_TOKEN: "titan-token",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: privateKey,
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/automation-configs") {
            return Response.json({
              status: "ready",
              configs: [storedBundleBuyConfig],
            });
          }
          if (url.pathname === "/automation-config/claim") {
            return Response.json({
              status: "claimed",
              config: executingConfig,
            });
          }
          if (url.pathname === "/account") {
            return Response.json({
              status: "ready",
              account: storedAccount({
                walletSource: "privy",
                privyUserId: "user_123",
                privyWalletId: "wallet_123",
              }),
            });
          }
          if (url.pathname === "/automation-config/check") {
            const body = (await request.json()) as {
              status?: string;
              monitor: {
                bundleAttemptedItems?: number;
                bundleConfirmedItems?: number;
              };
            };
            stateUpdates.push(body);
            return Response.json({
              status: "ready",
              config: { ...executingConfig, ...body },
            });
          }
          if (url.pathname === "/event") {
            events.push((await request.json()) as { eventType: string });
            return Response.json({ status: "ready", event: {} });
          }
          return Response.json(
            { error: `unexpected account path ${url.pathname}` },
            { status: 500 },
          );
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      configStatus: string;
      attemptedItems: number;
      confirmedItems: number;
      totalItems: number;
    };

    expect(response.status).toBe(503);
    expect(data).toMatchObject({
      status: "pending_reconciliation",
      configStatus: "executing",
      attemptedItems: 2,
      confirmedItems: 1,
      totalItems: 2,
    });
    expect(privyRpcCallCount()).toBe(2);
    expect(stateUpdates.at(-1)).toMatchObject({
      status: "executing",
      monitor: { bundleAttemptedItems: 2, bundleConfirmedItems: 1 },
    });
    expect(events.map((event) => event.eventType)).toEqual([
      "swap_executed",
      "execution_reconciliation_required",
    ]);
    expect(errorLog).toHaveBeenCalledOnce();
  });

  it("does not race bundle status reconciliation against an active execution request", async () => {
    const config = {
      ...storedBundleBuyConfig,
      status: "executing",
      updatedAt: new Date().toISOString(),
      monitor: {
        executionStartedAt: new Date().toISOString(),
        bundleAttemptedItems: 1,
        bundleConfirmedItems: 0,
      },
    };
    let privyRequests = 0;
    globalThis.fetch = vi.fn(async () => {
      privyRequests += 1;
      return Response.json({ transactions: [] });
    }) as unknown as typeof fetch;

    const response = await postTradingBotBundleBuyExecutionStatus(
      requestJson(
        {
          telegramUserId: "123456",
          userPublicKey: storedBundleBuyConfig.walletAddress,
          configId: storedBundleBuyConfig.configId,
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/bundle-buy/status",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/automation-configs") {
            return Response.json({ status: "ready", configs: [config] });
          }
          return Response.json(
            { error: `unexpected account path ${url.pathname}` },
            { status: 500 },
          );
        }),
      } as Env,
    );
    const data = (await response.json()) as { status: string; error: string };

    expect(response.status).toBe(503);
    expect(data.status).toBe("pending_reconciliation");
    expect(data.error).toContain("active request window");
    expect(privyRequests).toBe(0);
  });

  it("keeps a bundle locked while any attempted Privy reference is unresolved", async () => {
    const { response, stateUpdates, events, privyRequests } =
      await runBundleBuyStatusCheck({
        attemptedItems: 2,
        confirmedItems: 1,
        providerStatuses: ["confirmed", "pending"],
      });
    const data = (await response.json()) as {
      status: string;
      configStatus: string;
      attemptedItems: number;
      confirmedItems: number;
      manualReviewRequired: boolean;
      manualReviewAfter: string;
      manualReviewReason: string;
    };

    expect(response.status).toBe(503);
    expect(data).toMatchObject({
      status: "pending_reconciliation",
      configStatus: "executing",
      attemptedItems: 2,
      confirmedItems: 1,
      manualReviewRequired: true,
      manualReviewAfter: "2026-07-10T00:00:01.000Z",
    });
    expect(data.manualReviewReason).toContain("do not resend");
    expect(privyRequests).toEqual([
      {
        method: "GET",
        referenceId: "ribbot-123456-bundle_buy:bb_testbundle:1",
      },
      {
        method: "GET",
        referenceId: "ribbot-123456-bundle_buy:bb_testbundle:2",
      },
    ]);
    expect(stateUpdates.at(-1)?.status).toBe("executing");
    expect(stateUpdates.at(-1)?.monitor).toMatchObject({
      manualReviewAfter: "2026-07-10T00:00:01.000Z",
    });
    expect(events.at(-1)).toMatchObject({
      eventType: "execution_manual_review_required",
    });
  });

  it("marks a fully confirmed bundle executed during read-only reconciliation", async () => {
    const { response, stateUpdates, events, privyRequests } =
      await runBundleBuyStatusCheck({
        attemptedItems: 2,
        confirmedItems: 1,
        providerStatuses: ["confirmed", "finalized"],
      });
    const data = (await response.json()) as {
      status: string;
      configStatus: string;
      itemCount: number;
      executions: Array<{ signature: string }>;
    };

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      status: "executed",
      configStatus: "executed",
      itemCount: 2,
    });
    expect(data.executions.map((execution) => execution.signature)).toEqual([
      "5xBundleReconciled1",
      "5xBundleReconciled2",
    ]);
    expect(privyRequests.every((request) => request.method === "GET")).toBe(
      true,
    );
    expect(stateUpdates.at(-1)?.status).toBe("executed");
    expect(events.at(-1)).toMatchObject({
      eventType: "advanced_automation_config_executed",
    });
  });

  it("fails a confirmed partial basket instead of auto-resuming unattempted items", async () => {
    const { response, stateUpdates, events, privyRequests } =
      await runBundleBuyStatusCheck({
        attemptedItems: 1,
        confirmedItems: 0,
        providerStatuses: ["confirmed"],
      });
    const data = (await response.json()) as {
      status: string;
      configStatus: string;
      attemptedItems: number;
      confirmedItems: number;
      totalItems: number;
      error: string;
    };

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      status: "failed",
      configStatus: "failed",
      attemptedItems: 1,
      confirmedItems: 1,
      totalItems: 2,
    });
    expect(data.error).toContain("will not auto-resume");
    expect(privyRequests).toHaveLength(1);
    expect(privyRequests[0].method).toBe("GET");
    expect(stateUpdates.at(-1)?.status).toBe("failed");
    expect(events.at(-1)).toMatchObject({
      eventType: "advanced_automation_config_failed",
    });
  });

  it("routes a competing bundle execution claim into status lookup without resending", async () => {
    const executingConfig = {
      ...storedBundleBuyConfig,
      status: "executing",
      monitor: {
        executionStartedAt: "2026-07-10T00:00:00.000Z",
        bundleAttemptedItems: 1,
        bundleConfirmedItems: 0,
      },
    };
    const privyMethods: string[] = [];
    globalThis.fetch = vi.fn(async (request, init) => {
      privyMethods.push(init?.method ?? "GET");
      const referenceId = new URL(String(request)).searchParams.get(
        "reference_id",
      );
      return Response.json({
        transactions: [
          {
            id: "privy-bundle-pending-1",
            wallet_id: "wallet_123",
            status: "pending",
            transaction_hash: null,
            caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
            created_at: 1_783_632_000,
            reference_id: referenceId,
          },
        ],
      });
    });
    const response = await postTradingBotBundleBuyExecution(
      requestJson(
        {
          telegramUserId: "123456",
          userPublicKey: storedBundleBuyConfig.walletAddress,
          configId: storedBundleBuyConfig.configId,
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/bundle-buy/execute",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_BUNDLE_BUY_LIVE_EXECUTION_ENABLED: "true",
        TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
        SOLANA_RPC_URL: "https://rpc.example",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: "test-private-key",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/automation-configs") {
            return Response.json({
              status: "ready",
              configs: [storedBundleBuyConfig],
            });
          }
          if (url.pathname === "/automation-config/claim") {
            return Response.json(
              {
                error: "Config execution is already in progress",
                config: executingConfig,
              },
              { status: 409 },
            );
          }
          if (url.pathname === "/account") {
            return Response.json({
              status: "ready",
              account: storedAccount({
                walletSource: "privy",
                privyUserId: "user_123",
                privyWalletId: "wallet_123",
              }),
            });
          }
          if (url.pathname === "/automation-config/check") {
            return Response.json({ status: "ready", config: executingConfig });
          }
          return Response.json(
            { error: `unexpected account path ${url.pathname}` },
            { status: 500 },
          );
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      configStatus: string;
    };

    expect(response.status).toBe(503);
    expect(data).toMatchObject({
      status: "pending_reconciliation",
      configStatus: "executing",
    });
    expect(privyMethods).toEqual(["GET"]);
  });

  it("normalizes and stores auto-sell rules through the account Durable Object", async () => {
    const response = await postTradingBotAutoSellStorage(
      requestJson(
        validAutoSellBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/auto-sell",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/event") {
            return Response.json({
              status: "ready",
              event: { eventId: "evt_1" },
            });
          }
          expect(url.pathname).toBe("/automation-config");
          const body = (await request.json()) as {
            configId: string;
            kind: string;
            config: {
              mint: string;
              sellBps: number;
              triggerPrice: string;
              triggerDirection: string;
            };
            validation: { warnings: string[]; validatedAt: string };
          };
          expect(body.configId).toMatch(/^as_[a-f0-9]{24}$/);
          expect(body.kind).toBe("auto_sell");
          expect(body.config).toMatchObject({
            mint: validAutoSellBody.mint,
            sellBps: 5000,
            triggerPrice: "0.02",
            triggerDirection: "above",
          });
          expect(body.validation.warnings.join(" ")).toContain(
            "stored this auto-sell rule",
          );
          return Response.json({
            status: "stored",
            configKind: "auto_sell",
            config: {
              ...storedAutoSellConfig,
              configId: body.configId,
              validation: body.validation,
            },
            normalized: body.config,
            warnings: body.validation.warnings,
            validatedAt: body.validation.validatedAt,
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      configKind: string;
      config: { configId: string; kind: string; sellBps: number };
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("stored");
    expect(data.configKind).toBe("auto_sell");
    expect(data.config.configId).toMatch(/^as_[a-f0-9]{24}$/);
    expect(data.config.sellBps).toBe(5000);
    expect(data.warnings.join(" ")).toContain("extra live auto-sell gate");
  });

  it("lists stored auto-sell rules through the account Durable Object", async () => {
    const response = await getTradingBotAutoSellConfigs(
      new Request(
        "https://frogx.example/api/frogx/trading-bot/auto-sell?telegramUserId=123456",
        {
          headers: { Authorization: "Bearer ribbot-token" },
        },
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts((request) => {
          const url = new URL(request.url);
          expect(url.pathname).toBe("/automation-configs");
          expect(url.searchParams.get("telegramUserId")).toBe("123456");
          expect(url.searchParams.get("kind")).toBe("auto_sell");
          return Response.json({
            status: "ready",
            telegramUserId: "123456",
            kind: "auto_sell",
            configs: [storedAutoSellConfig],
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      configs: Array<{ configId: string; kind: string; sellBps: number }>;
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("ready");
    expect(data.configs).toHaveLength(1);
    expect(data.configs[0].configId).toBe("as_testsell");
    expect(data.configs[0].sellBps).toBe(5000);
  });

  it("cancels stored auto-sell rules through the account Durable Object", async () => {
    const response = await postTradingBotAutoSellCancel(
      requestJson(
        { telegramUserId: "123456", configId: "as_testsell" },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/auto-sell/cancel",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/event") {
            return Response.json({
              status: "ready",
              event: { eventId: "evt_1" },
            });
          }
          expect(url.pathname).toBe("/automation-config/cancel");
          const body = (await request.json()) as {
            telegramUserId: string;
            configId: string;
            kind: string;
          };
          expect(body).toEqual({
            telegramUserId: "123456",
            configId: "as_testsell",
            kind: "auto_sell",
          });
          return Response.json({
            status: "cancelled",
            config: {
              ...storedAutoSellConfig,
              status: "cancelled",
              updatedAt: "2026-07-04T00:00:01.000Z",
            },
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      config: { configId: string; status: string };
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("cancelled");
    expect(data.config.configId).toBe("as_testsell");
    expect(data.config.status).toBe("cancelled");
  });

  const runAdvancedExecutionStatusCheck = async (input: {
    kind: "copytrade" | "sniper" | "auto_buy" | "auto_sell";
    baseConfig: Record<string, unknown>;
    providerStatus: "pending" | "confirmed" | "failed";
    executionStartedAt?: string;
  }) => {
    const configId = String(input.baseConfig.configId);
    const executionId = `${input.kind}:${configId}`;
    const referenceId = `ribbot-123456-${executionId}`;
    let current: Record<string, unknown> & {
      status: string;
      monitor: Record<string, unknown>;
    } = {
      ...input.baseConfig,
      status: "executing",
      monitor: {
        executionId,
        executionReferenceId: referenceId,
        executionStartedAt:
          input.executionStartedAt ?? "2026-01-01T00:00:00.000Z",
        executionMint:
          input.baseConfig.mint ??
          "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        executionSide: input.kind === "auto_sell" ? "sell" : "buy",
        executionAmountIn: "100000000",
        ...(input.kind === "copytrade"
          ? { lastObservedSignature: "sig_already_consumed" }
          : {}),
      },
    };
    const events: Array<{
      eventId?: string;
      eventType: string;
    }> = [];
    const privyMethods: string[] = [];
    globalThis.fetch = vi.fn(async (request, init) => {
      const url = new URL(String(request));
      expect(url.pathname).toBe("/v1/transactions");
      expect(url.searchParams.get("reference_id")).toBe(referenceId);
      privyMethods.push(init?.method ?? "GET");
      return Response.json({
        transactions: [
          {
            id: `privy-${input.kind}-status`,
            wallet_id: "wallet_123",
            status: input.providerStatus,
            transaction_hash:
              input.providerStatus === "confirmed"
                ? `5x${input.kind}Confirmed`
                : input.providerStatus === "failed"
                  ? `5x${input.kind}Failed`
                  : null,
            caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
            created_at: 1_788_000_000,
            reference_id: referenceId,
          },
        ],
      });
    }) as unknown as typeof fetch;

    const accountStore = fakeTradingBotAccounts(async (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/automation-configs") {
        expect(url.searchParams.get("kind")).toBe(input.kind);
        return Response.json({ status: "ready", configs: [current] });
      }
      if (url.pathname === "/account") {
        return Response.json({
          status: "ready",
          account: storedAccount({
            walletSource: "privy",
            privyUserId: "user_123",
            privyWalletId: "wallet_123",
          }),
        });
      }
      if (url.pathname === "/automation-config/check") {
        const body = (await request.json()) as {
          status?: string;
          monitor: Record<string, unknown>;
          expectedStatus?: string;
          expectedExecutionId?: string;
        };
        expect(body.expectedStatus).toBe("executing");
        expect(body.expectedExecutionId).toBe(executionId);
        current = {
          ...current,
          status: body.status ?? current.status,
          monitor: body.monitor,
        };
        return Response.json({ status: "ready", config: current });
      }
      if (url.pathname === "/event") {
        events.push((await request.json()) as (typeof events)[number]);
        return Response.json({ status: "ready", event: { eventId: "evt_1" } });
      }
      return Response.json(
        { error: `unexpected account path ${url.pathname}` },
        { status: 500 },
      );
    });
    const endpoint =
      input.kind === "copytrade"
        ? postTradingBotCopyTradeExecutionStatus
        : input.kind === "sniper"
          ? postTradingBotSniperExecutionStatus
          : input.kind === "auto_buy"
            ? postTradingBotAutoBuyExecutionStatus
            : postTradingBotAutoSellExecutionStatus;
    const segment =
      input.kind === "copytrade"
        ? "copytrade"
        : input.kind === "sniper"
          ? "sniper"
          : input.kind === "auto_buy"
            ? "auto-buy"
            : "auto-sell";
    const response = await endpoint(
      requestJson(
        {
          telegramUserId: "123456",
          userPublicKey: "So11111111111111111111111111111111111111112",
          configId,
        },
        { Authorization: "Bearer ribbot-token" },
        `/api/frogx/trading-bot/${segment}/status`,
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ADVANCED_RECONCILE_AFTER_SECONDS: "1",
        TRADING_BOT_MANUAL_REVIEW_AFTER_SECONDS: "1",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        TRADING_BOT_ACCOUNTS: accountStore,
      } as Env,
    );
    return { response, current, events, privyMethods };
  };

  it("checks pending auto-buy status through Privy GET without resending", async () => {
    const { response, current, events, privyMethods } =
      await runAdvancedExecutionStatusCheck({
        kind: "auto_buy",
        baseConfig: storedAutoBuyConfig,
        providerStatus: "pending",
      });
    const data = (await response.json()) as {
      status: string;
      configStatus: string;
      providerStatus: string;
      manualReviewRequired: boolean;
      manualReviewAfter: string;
      manualReviewRequiredAt: string;
      manualReviewReason: string;
    };

    expect(response.status).toBe(503);
    expect(data).toMatchObject({
      status: "pending_reconciliation",
      configStatus: "executing",
      providerStatus: "pending",
      manualReviewRequired: true,
      manualReviewAfter: "2026-01-01T00:00:01.000Z",
    });
    expect(data.manualReviewRequiredAt).toBeTruthy();
    expect(data.manualReviewReason).toContain("do not resend");
    expect(current.status).toBe("executing");
    expect(current.monitor).toMatchObject({
      manualReviewAfter: "2026-01-01T00:00:01.000Z",
    });
    expect(events.map((event) => event.eventType)).toEqual([
      "execution_manual_review_required",
    ]);
    expect(privyMethods).toEqual(["GET"]);
  });

  it("resolves confirmed auto-buy status through Privy GET without resending", async () => {
    const { response, current, events, privyMethods } =
      await runAdvancedExecutionStatusCheck({
        kind: "auto_buy",
        baseConfig: storedAutoBuyConfig,
        providerStatus: "confirmed",
      });
    const data = (await response.json()) as {
      status: string;
      configStatus: string;
      signature: string;
    };

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      status: "executed",
      configStatus: "executed",
      signature: "5xauto_buyConfirmed",
    });
    expect(current.status).toBe("executed");
    expect(privyMethods).toEqual(["GET"]);
    expect(events.map((event) => event.eventType)).toEqual([
      "swap_executed",
      "advanced_automation_config_reconciled",
    ]);
  });

  it("resolves confirmed sniper status while preserving the remaining snipe budget", async () => {
    const sniperConfig = {
      telegramUserId: "123456",
      configId: "s_status",
      kind: "sniper",
      status: "staged",
      walletAddress: "So11111111111111111111111111111111111111112",
      source: "pump",
      maxBuyAmountIn: "50000000",
      slippageBps: 800,
      priorityFee: 1000,
      minLiquidityUsd: 2500,
      maxSnipes: 3,
      createdAt: "2026-07-04T00:00:00.000Z",
      updatedAt: "2026-07-04T00:00:00.000Z",
      validation: {
        validatedAt: "2026-07-04T00:00:00.000Z",
        warnings: [],
      },
      monitor: {},
    };
    const { response, current, events, privyMethods } =
      await runAdvancedExecutionStatusCheck({
        kind: "sniper",
        baseConfig: sniperConfig,
        providerStatus: "confirmed",
      });
    const data = (await response.json()) as {
      status: string;
      configStatus: string;
      standing: boolean;
      signature: string;
    };

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      status: "executed",
      configStatus: "staged",
      standing: true,
      signature: "5xsniperConfirmed",
    });
    expect(current.status).toBe("staged");
    expect(current.monitor.executedCount).toBe(1);
    expect(privyMethods).toEqual(["GET"]);
    expect(events.map((event) => event.eventType)).toEqual([
      "swap_executed",
      "advanced_automation_config_reconciled",
    ]);
  });

  it("reports terminal copytrade failure while restoring standing monitoring", async () => {
    const { response, current, events, privyMethods } =
      await runAdvancedExecutionStatusCheck({
        kind: "copytrade",
        baseConfig: storedCopyTradeConfig,
        providerStatus: "failed",
      });
    const data = (await response.json()) as {
      status: string;
      configStatus: string;
      standing: boolean;
      providerStatus: string;
    };

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      status: "failed",
      configStatus: "staged",
      standing: true,
      providerStatus: "failed",
    });
    expect(current.status).toBe("staged");
    expect(current.monitor.lastObservedSignature).toBe("sig_already_consumed");
    expect(privyMethods).toEqual(["GET"]);
    expect(events.map((event) => event.eventType)).toEqual([
      "swap_execution_failed",
      "advanced_automation_config_reconciled",
    ]);
  });

  it("does not query Privy while an advanced execution is inside the safety window", async () => {
    const { response, current, privyMethods } =
      await runAdvancedExecutionStatusCheck({
        kind: "auto_sell",
        baseConfig: storedAutoSellConfig,
        providerStatus: "pending",
        executionStartedAt: new Date().toISOString(),
      });
    const data = (await response.json()) as {
      status: string;
      configStatus: string;
    };

    expect(response.status).toBe(503);
    expect(data).toMatchObject({
      status: "pending_reconciliation",
      configStatus: "executing",
    });
    expect(current.status).toBe("executing");
    expect(privyMethods).toEqual([]);
  });
});

describe("trading bot advanced automation monitor runner", () => {
  const storedCopyTradeConfig = {
    telegramUserId: "123456",
    configId: "c_copy",
    kind: "copytrade",
    status: "staged",
    walletAddress: "So11111111111111111111111111111111111111112",
    targetWallet: "11111111111111111111111111111111",
    maxBuyAmountIn: "100000000",
    amountLabel: "0.1 SOL",
    slippageBps: 500,
    priorityFee: 0,
    copySells: true,
    minLiquidityUsd: 1000,
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z",
    validation: {
      validatedAt: "2026-07-04T00:00:00.000Z",
      warnings: [],
    },
    monitor: {},
  };

  const storedSniperConfig = {
    telegramUserId: "123456",
    configId: "s_sniper",
    kind: "sniper",
    status: "staged",
    walletAddress: "So11111111111111111111111111111111111111112",
    source: "pump",
    maxBuyAmountIn: "50000000",
    amountLabel: "0.05 SOL",
    slippageBps: 800,
    priorityFee: 1000,
    minLiquidityUsd: 2500,
    maxSnipes: 3,
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z",
    validation: {
      validatedAt: "2026-07-04T00:00:00.000Z",
      warnings: [],
    },
    monitor: {},
  };

  const storedAutoBuyConfig = {
    telegramUserId: "123456",
    configId: "ab_buy",
    kind: "auto_buy",
    status: "staged",
    walletAddress: "So11111111111111111111111111111111111111112",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    maxBuyAmountIn: "100000000",
    amountLabel: "0.1 SOL",
    slippageBps: 500,
    priorityFee: 0,
    minLiquidityUsd: 1000,
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z",
    validation: {
      validatedAt: "2026-07-04T00:00:00.000Z",
      warnings: [],
    },
    monitor: {},
  };

  const storedAutoSellConfig = {
    telegramUserId: "123456",
    configId: "as_sell",
    kind: "auto_sell",
    status: "staged",
    walletAddress: "So11111111111111111111111111111111111111112",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    maxBuyAmountIn: "0",
    amountLabel: "50%",
    slippageBps: 500,
    priorityFee: 0,
    minLiquidityUsd: 0,
    sellBps: 5000,
    triggerPrice: "2.5",
    triggerDirection: "above",
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z",
    validation: {
      validatedAt: "2026-07-04T00:00:00.000Z",
      warnings: [],
    },
    monitor: {},
  };

  it("does nothing when the advanced monitor flag is disabled", async () => {
    let called = false;
    await runTradingBotAdvancedAutomationMonitors({
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(() => {
        called = true;
        return Response.json({ status: "unexpected" });
      }),
    } as Env);

    expect(called).toBe(false);
  });

  it("baselines copytrade target wallet signatures without recording an event", async () => {
    const stateUpdates: Array<{
      monitor: { lastObservedSignature?: string; lastCheckedAt?: string };
    }> = [];
    const events: Array<{ eventType: string }> = [];
    globalThis.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        method?: string;
        params?: unknown[];
      };
      expect(body.method).toBe("getSignaturesForAddress");
      expect(body.params?.[0]).toBe(storedCopyTradeConfig.targetWallet);
      return Response.json({
        result: [{ signature: "sig_new", slot: 123, err: null }],
      });
    }) as unknown as typeof fetch;

    await runTradingBotAdvancedAutomationMonitors({
      TRADING_BOT_ADVANCED_MONITOR_ENABLED: "true",
      TRADING_BOT_COPYTRADE_MONITOR_ENABLED: "true",
      SOLANA_RPC_URL: "https://rpc.example",
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/automation-configs/active") {
          expect(url.searchParams.get("kind")).toBe("copytrade");
          expect(url.searchParams.get("limit")).toBe("25");
          return Response.json({
            status: "ready",
            configs: [storedCopyTradeConfig],
          });
        }
        if (url.pathname === "/automation-config/check") {
          const body = (await request.json()) as {
            monitor: { lastObservedSignature?: string; lastCheckedAt?: string };
          };
          stateUpdates.push(body);
          return Response.json({
            status: "ready",
            config: { ...storedCopyTradeConfig, monitor: body.monitor },
          });
        }
        if (url.pathname === "/event") {
          events.push((await request.json()) as { eventType: string });
          return Response.json({
            status: "ready",
            event: { eventId: "evt_1" },
          });
        }
        return Response.json({ error: "unexpected path" }, { status: 500 });
      }),
    } as Env);

    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0].monitor.lastObservedSignature).toBe("sig_new");
    expect(stateUpdates[0].monitor.lastCheckedAt).toBeTruthy();
    expect(events).toEqual([]);
  });

  it("records a non-secret observation event for new copytrade signatures", async () => {
    const stateUpdates: Array<{
      monitor: {
        lastObservedSignature?: string;
        lastMatchedAt?: string;
        matchCount?: number;
      };
    }> = [];
    const events: Array<{
      eventType: string;
      metadata: Record<string, unknown>;
    }> = [];
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        result: [
          { signature: "sig_new", slot: 124, err: null },
          { signature: "sig_old", slot: 123, err: null },
        ],
      }),
    ) as unknown as typeof fetch;

    await runTradingBotAdvancedAutomationMonitors({
      TRADING_BOT_ADVANCED_MONITOR_ENABLED: "true",
      TRADING_BOT_COPYTRADE_MONITOR_ENABLED: "true",
      SOLANA_RPC_URL: "https://rpc.example",
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/automation-configs/active") {
          return Response.json({
            status: "ready",
            configs: [
              {
                ...storedCopyTradeConfig,
                monitor: { lastObservedSignature: "sig_old", matchCount: 2 },
              },
            ],
          });
        }
        if (url.pathname === "/automation-config/check") {
          const body = (await request.json()) as {
            monitor: {
              lastObservedSignature?: string;
              lastMatchedAt?: string;
              matchCount?: number;
            };
          };
          stateUpdates.push(body);
          return Response.json({
            status: "ready",
            config: { ...storedCopyTradeConfig, monitor: body.monitor },
          });
        }
        if (url.pathname === "/event") {
          const body = (await request.json()) as {
            eventType: string;
            metadata: Record<string, unknown>;
          };
          events.push(body);
          return Response.json({
            status: "ready",
            event: { eventId: "evt_1" },
          });
        }
        return Response.json({ error: "unexpected path" }, { status: 500 });
      }),
    } as Env);

    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0].monitor.lastObservedSignature).toBe("sig_new");
    expect(stateUpdates[0].monitor.lastMatchedAt).toBeTruthy();
    expect(stateUpdates[0].monitor.matchCount).toBe(3);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("advanced_automation_config_observed");
    expect(events[0].metadata.configId).toBe("c_copy");
    expect(events[0].metadata.observedSignature).toBe("sig_new");
    expect(events[0].metadata.liveMonitor).toBe(false);
  });

  it("executes simple copytrade buys only through the explicit live copytrade gate and Privy path", async () => {
    const privateKey = await generateTestAuthorizationPrivateKey();
    const copiedMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const observedSignature = "sig_new_copytrade";
    const managedCopyConfig = {
      ...storedCopyTradeConfig,
      buyMode: "percentage",
      buyPercentageBps: 5000,
      sellPriorityFee: 2500,
      duplicateBuys: false,
      onlyRenounced: true,
      excludePumpFunTokens: true,
      minMarketCapUsd: 1000,
      blacklistMints: [],
    } as const;
    installTitanQuoteWebSocketMock({
      amountIn: 50_000_000,
      amountOut: 2_500_000,
      priceImpactBps: 120,
    });
    const account = storedAccount({
      walletSource: "privy",
      privyUserId: "user_123",
      privyWalletId: "wallet_123",
    });
    const stateUpdates: Array<{
      status?: string;
      monitor: {
        lastObservedSignature?: string;
        executedCount?: number;
        matchCount?: number;
      };
    }> = [];
    const events: Array<{
      eventType: string;
      metadata: Record<string, unknown>;
    }> = [];
    let claimedReferenceId: string | undefined;

    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.startsWith("https://api.jup.ag/price/v3")) {
        const ids = new URL(url).searchParams.get("ids") ?? "";
        return Response.json({
          ...(ids.includes(copiedMint)
            ? {
                [copiedMint]: {
                  usdPrice: 2.5,
                  decimals: 6,
                },
              }
            : {}),
          ...(ids.includes("So11111111111111111111111111111111111111112")
            ? {
                So11111111111111111111111111111111111111112: {
                  usdPrice: 100,
                  decimals: 9,
                },
              }
            : {}),
        });
      }

      if (url === "https://rpc.example") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          method?: string;
        };
        if (body.method === "getSignaturesForAddress") {
          return Response.json({
            result: [
              { signature: observedSignature, slot: 124, err: null },
              { signature: "sig_old", slot: 123, err: null },
            ],
          });
        }
        if (body.method === "getTransaction") {
          return Response.json({
            result: {
              transaction: {
                message: {
                  accountKeys: [
                    { pubkey: storedCopyTradeConfig.targetWallet },
                    { pubkey: "TokenAccount11111111111111111111111111111" },
                  ],
                },
              },
              meta: {
                err: null,
                preBalances: [2_000_000_000, 0],
                postBalances: [1_900_000_000, 0],
                preTokenBalances: [],
                postTokenBalances: [
                  {
                    accountIndex: 1,
                    mint: copiedMint,
                    owner: storedCopyTradeConfig.targetWallet,
                    uiTokenAmount: {
                      amount: "2500000",
                      decimals: 6,
                      uiAmount: 2.5,
                      uiAmountString: "2.5",
                    },
                  },
                ],
              },
            },
          });
        }
        if (body.method === "getBalance") {
          return Response.json({ result: { value: 2_000_000_000 } });
        }
        if (body.method === "getTokenAccountsByOwner") {
          return Response.json({ result: { value: [] } });
        }
        if (body.method === "getAccountInfo") {
          return Response.json({
            result: {
              value: {
                owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                executable: false,
                lamports: 1_461_600,
                data: {
                  parsed: {
                    type: "mint",
                    info: {
                      mintAuthority: null,
                      supply: "1000000000",
                      decimals: 6,
                      isInitialized: true,
                      freezeAuthority: null,
                    },
                  },
                },
              },
            },
          });
        }
      }

      if (url.includes("/frogx/swap")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          inMint: string;
          outMint: string;
          amountIn: string;
        };
        expect(body.inMint).toBe("So11111111111111111111111111111111111111112");
        expect(body.outMint).toBe(copiedMint);
        expect(body.amountIn).toBe("50000000");
        return Response.json({
          txBase64: "BASE64_TX_PLACEHOLDER",
          meta: { routeId: "copytrade-buy-test" },
        });
      }

      if (url === "https://api.privy.io/v1/wallets/wallet_123/rpc") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          method: string;
          reference_id: string;
          params: { transaction: string };
        };
        expect(body.method).toBe("signAndSendTransaction");
        expect(body.reference_id).toBe(claimedReferenceId);
        expect(body.params.transaction).toBe("BASE64_TX_PLACEHOLDER");
        return Response.json({
          method: "signAndSendTransaction",
          data: {
            hash: "5xCopyTradeSignature",
            signed_transaction: "signed-tx",
            caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
            transaction_id: "privy-copytrade-tx",
            reference_id: body.reference_id,
          },
        });
      }

      return Response.json(
        { error: { message: `unexpected fetch ${url}` } },
        { status: 500 },
      );
    }) as unknown as typeof fetch;

    await runTradingBotAdvancedAutomationMonitors({
      TRADING_BOT_ADVANCED_MONITOR_ENABLED: "true",
      TRADING_BOT_COPYTRADE_MONITOR_ENABLED: "true",
      TRADING_BOT_COPYTRADE_LIVE_EXECUTION_ENABLED: "true",
      TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
      SOLANA_RPC_URL: "https://rpc.example",
      RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
      TITAN_TOKEN: "titan-token",
      PRIVY_APP_ID: "privy-app",
      PRIVY_APP_SECRET: "privy-secret",
      PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
      PRIVY_AUTHORIZATION_PRIVATE_KEY: privateKey,
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/automation-configs/active") {
          expect(url.searchParams.get("kind")).toBe("copytrade");
          return Response.json({
            status: "ready",
            configs: [
              {
                ...managedCopyConfig,
                monitor: { lastObservedSignature: "sig_old", matchCount: 2 },
              },
            ],
          });
        }
        if (url.pathname === "/account") {
          return Response.json({
            status: "ready",
            account,
          });
        }
        if (url.pathname === "/automation-config/claim") {
          const body = (await request.json()) as {
            monitor: Record<string, unknown> & {
              executionReferenceId?: string;
            };
          };
          claimedReferenceId = body.monitor.executionReferenceId;
          return Response.json({
            status: "claimed",
            config: {
              ...managedCopyConfig,
              status: "executing",
              monitor: body.monitor,
            },
          });
        }
        if (url.pathname === "/automation-config/check") {
          const body = (await request.json()) as {
            status?: string;
            monitor: {
              lastObservedSignature?: string;
              executedCount?: number;
              matchCount?: number;
            };
          };
          stateUpdates.push(body);
          return Response.json({
            status: "ready",
            config: { ...storedCopyTradeConfig, monitor: body.monitor },
          });
        }
        if (url.pathname === "/event") {
          const body = (await request.json()) as {
            eventType: string;
            metadata: Record<string, unknown>;
          };
          events.push(body);
          return Response.json({
            status: "ready",
            event: { eventId: "evt_1" },
          });
        }
        return Response.json({ error: "unexpected path" }, { status: 500 });
      }),
    } as Env);

    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0].status).toBe("staged");
    expect(stateUpdates[0].monitor.lastObservedSignature).toBe(
      observedSignature,
    );
    expect(stateUpdates[0].monitor.matchCount).toBe(3);
    expect(stateUpdates[0].monitor.executedCount).toBe(1);
    expect(events.map((event) => event.eventType)).toEqual([
      "swap_executed",
      "advanced_automation_config_observed",
      "advanced_automation_config_executed",
    ]);
    expect(events[1].metadata.kind).toBe("copytrade");
    expect(events[1].metadata.liveMonitor).toBe(true);
    expect(events[1].metadata.executionStatus).toBe("executed");
    expect(events[1].metadata.copyTradeSide).toBe("buy");
    expect(events[1].metadata.copyTradeMint).toBe(copiedMint);
    expect(events[1].metadata.copyTradeAmountIn).toBe("50000000");
    expect(events[1].metadata.signature).toBe("5xCopyTradeSignature");
    expect(events[2].metadata.kind).toBe("copytrade");
    expect(events[2].metadata.observedSignature).toBe(observedSignature);
    expect(events[2].metadata.copyTradeSide).toBe("buy");
    expect(events[2].metadata.mint).toBe(copiedMint);
    expect(events[2].metadata.amountIn).toBe("50000000");
    expect(events[2].metadata.signature).toBe("5xCopyTradeSignature");
  });

  it("baselines Jupiter recent pools without sniping existing launches", async () => {
    const stateUpdates: Array<{
      monitor: {
        launchCursorAt?: string;
        launchCursorId?: string;
        lastObservedMint?: string;
        lastError?: string;
      };
    }> = [];
    const events: Array<{ eventType: string }> = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      expect(String(input)).toBe("https://api.jup.ag/tokens/v2/recent");
      expect(new Headers(init?.headers).get("x-api-key")).toBe("jupiter-key");
      return Response.json([
        {
          id: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          name: "Baseline Token",
          symbol: "BASE",
          launchpad: "pump.fun",
          liquidity: 5000,
          mcap: 100000,
          organicScore: 20,
          mintAuthority: null,
          freezeAuthority: null,
          firstPool: {
            id: "11111111111111111111111111111111",
            createdAt: "2026-07-10T12:00:00.000Z",
          },
        },
      ]);
    }) as unknown as typeof fetch;

    await runTradingBotAdvancedAutomationMonitors({
      TRADING_BOT_ADVANCED_MONITOR_ENABLED: "true",
      TRADING_BOT_SNIPER_MONITOR_ENABLED: "true",
      JUPITER_API_KEY: "jupiter-key",
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/automation-configs/active") {
          expect(url.searchParams.get("kind")).toBe("sniper");
          return Response.json({
            status: "ready",
            configs: [storedSniperConfig],
          });
        }
        if (url.pathname === "/automation-config/check") {
          const body = (await request.json()) as {
            monitor: {
              launchCursorAt?: string;
              launchCursorId?: string;
              lastObservedMint?: string;
              lastError?: string;
            };
          };
          stateUpdates.push(body);
          return Response.json({
            status: "ready",
            config: { ...storedSniperConfig, monitor: body.monitor },
          });
        }
        if (url.pathname === "/event") {
          events.push((await request.json()) as { eventType: string });
          return Response.json({ status: "ready", event: { eventId: "evt" } });
        }
        return Response.json({ error: "unexpected path" }, { status: 500 });
      }),
    } as Env);

    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0].monitor).toMatchObject({
      launchCursorAt: "2026-07-10T12:00:00.000Z",
      launchCursorId: "11111111111111111111111111111111",
      lastObservedMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    });
    expect(stateUpdates[0].monitor.lastError).toBeUndefined();
    expect(events).toEqual([]);
  });

  it("observes and deduplicates a new matching sniper launch without live gates", async () => {
    const launchedMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const stateUpdates: Array<{
      monitor: {
        lastObservedMint?: string;
        processedMints?: string[];
        launchpad?: string;
        dryRunTriggerCount?: number;
      };
    }> = [];
    const events: Array<{
      eventType: string;
      metadata: Record<string, unknown>;
    }> = [];
    globalThis.fetch = vi.fn(async () =>
      Response.json([
        {
          id: launchedMint,
          name: "New Pump Token",
          symbol: "PUMP",
          launchpad: "pump.fun",
          liquidity: 5000,
          mcap: 100000,
          usdPrice: 0.001,
          organicScore: 25,
          mintAuthority: null,
          freezeAuthority: null,
          firstPool: {
            id: "11111111111111111111111111111112",
            createdAt: "2026-07-10T12:01:00.000Z",
          },
        },
      ]),
    ) as unknown as typeof fetch;

    await runTradingBotAdvancedAutomationMonitors({
      TRADING_BOT_ADVANCED_MONITOR_ENABLED: "true",
      TRADING_BOT_SNIPER_MONITOR_ENABLED: "true",
      JUPITER_API_KEY: "jupiter-key",
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/automation-configs/active") {
          return Response.json({
            status: "ready",
            configs: [
              {
                ...storedSniperConfig,
                monitor: {
                  launchCursorAt: "2026-07-10T12:00:00.000Z",
                  launchCursorId: "11111111111111111111111111111111",
                },
              },
            ],
          });
        }
        if (url.pathname === "/automation-config/check") {
          const body = (await request.json()) as (typeof stateUpdates)[number];
          stateUpdates.push(body);
          return Response.json({
            status: "ready",
            config: { ...storedSniperConfig, monitor: body.monitor },
          });
        }
        if (url.pathname === "/event") {
          const body = (await request.json()) as (typeof events)[number];
          events.push(body);
          return Response.json({ status: "ready", event: { eventId: "evt" } });
        }
        return Response.json({ error: "unexpected path" }, { status: 500 });
      }),
    } as Env);

    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0].monitor).toMatchObject({
      lastObservedMint: launchedMint,
      processedMints: [launchedMint],
      launchpad: "pump.fun",
      dryRunTriggerCount: 1,
    });
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("advanced_automation_config_observed");
    expect(events[0].metadata).toMatchObject({
      kind: "sniper",
      observedMint: launchedMint,
      liveMonitor: false,
      executionStatus: "not_requested",
    });
  });

  it("refuses a live-gated sniper when the account opt-in is off", async () => {
    const launchedMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const updates: Array<{
      status?: string;
      monitor: { lastError?: string; processedMints?: string[] };
    }> = [];
    globalThis.fetch = vi.fn(async (input) => {
      expect(String(input)).toBe("https://api.jup.ag/tokens/v2/recent");
      return Response.json([
        {
          id: launchedMint,
          launchpad: "pump.fun",
          liquidity: 5000,
          mcap: 100000,
          mintAuthority: null,
          freezeAuthority: null,
          firstPool: {
            id: "11111111111111111111111111111112",
            createdAt: "2026-07-10T12:01:00.000Z",
          },
        },
      ]);
    }) as unknown as typeof fetch;

    await runTradingBotAdvancedAutomationMonitors({
      TRADING_BOT_ADVANCED_MONITOR_ENABLED: "true",
      TRADING_BOT_SNIPER_MONITOR_ENABLED: "true",
      TRADING_BOT_SNIPER_LIVE_EXECUTION_ENABLED: "true",
      TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
      JUPITER_API_KEY: "jupiter-key",
      RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/automation-configs/active") {
          return Response.json({
            status: "ready",
            configs: [
              {
                ...storedSniperConfig,
                monitor: {
                  launchCursorAt: "2026-07-10T12:00:00.000Z",
                  launchCursorId: "11111111111111111111111111111111",
                },
              },
            ],
          });
        }
        if (url.pathname === "/account") {
          return Response.json({
            status: "ready",
            account: storedAccount({
              walletSource: "privy",
              privyUserId: "user_123",
              privyWalletId: "wallet_123",
              settings: {
                ...storedAccount().settings,
                sniperEnabled: false,
              },
            }),
          });
        }
        if (url.pathname === "/automation-config/claim") {
          const body = (await request.json()) as {
            monitor: Record<string, unknown>;
          };
          return Response.json({
            status: "claimed",
            config: {
              ...storedSniperConfig,
              status: "executing",
              monitor: body.monitor,
            },
          });
        }
        if (url.pathname === "/automation-config/check") {
          const body = (await request.json()) as (typeof updates)[number];
          updates.push(body);
          return Response.json({ status: "ready", config: storedSniperConfig });
        }
        if (url.pathname === "/event") {
          return Response.json({ status: "ready", event: { eventId: "evt" } });
        }
        return Response.json({ error: "unexpected path" }, { status: 500 });
      }),
    } as Env);

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe("staged");
    expect(updates[0].monitor.processedMints).toEqual([launchedMint]);
    expect(updates[0].monitor.lastError).toBe(
      "Account sniper setting is disabled",
    );
  });

  it("executes an eligible sniper only through opt-in, live gates, risk checks, and Privy", async () => {
    const privateKey = await generateTestAuthorizationPrivateKey();
    const launchedMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    installTitanQuoteWebSocketMock({
      amountIn: 50_000_000,
      amountOut: 2_500_000,
      priceImpactBps: 120,
    });
    const account = storedAccount({
      walletSource: "privy",
      privyUserId: "user_123",
      privyWalletId: "wallet_123",
      settings: {
        ...storedAccount().settings,
        sniperEnabled: true,
      },
    });
    const stateUpdates: Array<{
      status?: string;
      monitor: {
        executedCount?: number;
        processedMints?: string[];
        executionMint?: string;
      };
    }> = [];
    const events: Array<{
      eventType: string;
      metadata: Record<string, unknown>;
    }> = [];
    let privySendCount = 0;

    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "https://api.jup.ag/tokens/v2/recent") {
        return Response.json([
          {
            id: launchedMint,
            name: "New Pump Token",
            symbol: "PUMP",
            launchpad: "pump.fun",
            liquidity: 5000,
            mcap: 100000,
            usdPrice: 0.001,
            organicScore: 25,
            mintAuthority: null,
            freezeAuthority: null,
            firstPool: {
              id: "11111111111111111111111111111112",
              createdAt: "2026-07-10T12:01:00.000Z",
            },
          },
        ]);
      }
      if (url.startsWith("https://api.jup.ag/price/v3")) {
        const ids = new URL(url).searchParams.get("ids") ?? "";
        return Response.json({
          ...(ids.includes(launchedMint)
            ? { [launchedMint]: { usdPrice: 0.001, decimals: 6 } }
            : {}),
          ...(ids.includes("So11111111111111111111111111111111111111112")
            ? {
                So11111111111111111111111111111111111111112: {
                  usdPrice: 100,
                  decimals: 9,
                },
              }
            : {}),
        });
      }
      if (url === "https://rpc.example") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          method?: string;
        };
        if (body.method === "getBalance") {
          return Response.json({ result: { value: 2_000_000_000 } });
        }
        if (body.method === "getTokenAccountsByOwner") {
          return Response.json({ result: { value: [] } });
        }
        if (body.method === "getAccountInfo") {
          return Response.json({
            result: {
              value: {
                owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                executable: false,
                lamports: 1_461_600,
                data: {
                  parsed: {
                    type: "mint",
                    info: {
                      mintAuthority: null,
                      supply: "1000000000",
                      decimals: 6,
                      isInitialized: true,
                      freezeAuthority: null,
                    },
                  },
                },
              },
            },
          });
        }
      }
      if (url.includes("/frogx/swap")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          inMint: string;
          outMint: string;
          amountIn: string;
        };
        expect(body.inMint).toBe("So11111111111111111111111111111111111111112");
        expect(body.outMint).toBe(launchedMint);
        expect(body.amountIn).toBe("50000000");
        return Response.json({
          txBase64: "BASE64_TX_PLACEHOLDER",
          meta: { routeId: "sniper-buy-test" },
        });
      }
      if (url === "https://api.privy.io/v1/wallets/wallet_123/rpc") {
        privySendCount += 1;
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          reference_id: string;
        };
        expect(body.reference_id).toMatch(/^ribbot-/);
        expect(body.reference_id.length).toBeLessThanOrEqual(64);
        return Response.json({
          method: "signAndSendTransaction",
          data: {
            hash: "5xSniperSignature",
            signed_transaction: "signed-tx",
            caip2: "solana:5eykt4UsFv8NJdTREpY1vzqKqZKvdp",
            transaction_id: "privy-sniper-tx",
            reference_id: body.reference_id,
          },
        });
      }
      return Response.json(
        { error: { message: `unexpected fetch ${url}` } },
        { status: 500 },
      );
    }) as unknown as typeof fetch;

    await runTradingBotAdvancedAutomationMonitors({
      TRADING_BOT_ADVANCED_MONITOR_ENABLED: "true",
      TRADING_BOT_SNIPER_MONITOR_ENABLED: "true",
      TRADING_BOT_SNIPER_LIVE_EXECUTION_ENABLED: "true",
      TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
      TRADING_BOT_SNIPER_COOLDOWN_SECONDS: "1",
      JUPITER_API_KEY: "jupiter-key",
      SOLANA_RPC_URL: "https://rpc.example",
      RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
      TITAN_TOKEN: "titan-token",
      PRIVY_APP_ID: "privy-app",
      PRIVY_APP_SECRET: "privy-secret",
      PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
      PRIVY_AUTHORIZATION_PRIVATE_KEY: privateKey,
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/automation-configs/active") {
          return Response.json({
            status: "ready",
            configs: [
              {
                ...storedSniperConfig,
                maxMarketCapUsd: 500000,
                monitor: {
                  launchCursorAt: "2026-07-10T12:00:00.000Z",
                  launchCursorId: "11111111111111111111111111111111",
                },
              },
            ],
          });
        }
        if (url.pathname === "/account") {
          return Response.json({ status: "ready", account });
        }
        if (url.pathname === "/automation-config/claim") {
          const body = (await request.json()) as {
            monitor: Record<string, unknown>;
          };
          return Response.json({
            status: "claimed",
            config: {
              ...storedSniperConfig,
              maxMarketCapUsd: 500000,
              status: "executing",
              monitor: body.monitor,
            },
          });
        }
        if (url.pathname === "/automation-config/check") {
          const body = (await request.json()) as (typeof stateUpdates)[number];
          stateUpdates.push(body);
          return Response.json({
            status: "ready",
            config: { ...storedSniperConfig, monitor: body.monitor },
          });
        }
        if (url.pathname === "/event") {
          const body = (await request.json()) as (typeof events)[number];
          events.push(body);
          return Response.json({ status: "ready", event: { eventId: "evt" } });
        }
        return Response.json({ error: "unexpected path" }, { status: 500 });
      }),
    } as Env);

    expect(privySendCount).toBe(1);
    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0].status).toBe("staged");
    expect(stateUpdates[0].monitor).toMatchObject({
      executedCount: 1,
      processedMints: [launchedMint],
      executionMint: launchedMint,
    });
    expect(events.map((event) => event.eventType)).toEqual([
      "swap_executed",
      "advanced_automation_config_observed",
      "advanced_automation_config_executed",
    ]);
    expect(events[1].metadata).toMatchObject({
      kind: "sniper",
      liveMonitor: true,
      executionStatus: "executed",
      copyTradeMint: launchedMint,
      signature: "5xSniperSignature",
    });
    expect(events[2].metadata).toMatchObject({
      kind: "sniper",
      mint: launchedMint,
      amountIn: "50000000",
      signature: "5xSniperSignature",
    });
  });

  it("checks auto-buy rules without claiming liquidity support or starting execution", async () => {
    const stateUpdates: Array<{
      monitor: {
        lastObservedMint?: string;
        lastPriceUsd?: number;
        lastError?: string;
      };
    }> = [];
    const events: Array<{ eventType: string }> = [];
    globalThis.fetch = vi.fn(async (input) => {
      expect(String(input)).toContain("https://api.jup.ag/price/v3");
      return Response.json({
        [storedAutoBuyConfig.mint]: {
          usdPrice: 1.25,
          decimals: 6,
        },
      });
    }) as unknown as typeof fetch;

    await runTradingBotAdvancedAutomationMonitors({
      TRADING_BOT_ADVANCED_MONITOR_ENABLED: "true",
      TRADING_BOT_AUTO_BUY_MONITOR_ENABLED: "true",
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/automation-configs/active") {
          expect(url.searchParams.get("kind")).toBe("auto_buy");
          return Response.json({
            status: "ready",
            configs: [storedAutoBuyConfig],
          });
        }
        if (url.pathname === "/automation-config/check") {
          const body = (await request.json()) as {
            monitor: {
              lastObservedMint?: string;
              lastPriceUsd?: number;
              lastError?: string;
            };
          };
          stateUpdates.push(body);
          return Response.json({
            status: "ready",
            config: { ...storedAutoBuyConfig, monitor: body.monitor },
          });
        }
        if (url.pathname === "/event") {
          events.push((await request.json()) as { eventType: string });
          return Response.json({
            status: "ready",
            event: { eventId: "evt_1" },
          });
        }
        return Response.json({ error: "unexpected path" }, { status: 500 });
      }),
    } as Env);

    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0].monitor.lastObservedMint).toBe(
      storedAutoBuyConfig.mint,
    );
    expect(stateUpdates[0].monitor.lastPriceUsd).toBe(1.25);
    expect(stateUpdates[0].monitor.lastError).toContain(
      "liquidity monitoring source is not configured",
    );
    expect(events).toEqual([]);
  });

  it("executes auto-buy rules only through the explicit live auto-buy gate and market-risk checks", async () => {
    const privateKey = await generateTestAuthorizationPrivateKey();
    installTitanQuoteWebSocketMock({
      amountIn: 1_000_000_000,
      amountOut: 2_500_000,
      priceImpactBps: 120,
    });
    const account = storedAccount({
      walletSource: "privy",
      privyUserId: "user_123",
      privyWalletId: "wallet_123",
      settings: {
        ...storedAccount().settings,
        autoBuyEnabled: true,
      },
    });
    const stateUpdates: Array<{
      status?: string;
      monitor: {
        executedCount?: number;
        dryRunTriggerCount?: number;
        lastPriceUsd?: number;
      };
    }> = [];
    const events: Array<{
      eventType: string;
      metadata: Record<string, unknown>;
    }> = [];

    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.startsWith("https://api.jup.ag/price/v3")) {
        const ids = new URL(url).searchParams.get("ids") ?? "";
        return Response.json({
          ...(ids.includes(storedAutoBuyConfig.mint)
            ? {
                [storedAutoBuyConfig.mint]: {
                  usdPrice: 2.5,
                  decimals: 6,
                },
              }
            : {}),
          ...(ids.includes("So11111111111111111111111111111111111111112")
            ? {
                So11111111111111111111111111111111111111112: {
                  usdPrice: 100,
                  decimals: 9,
                },
              }
            : {}),
        });
      }

      if (url === "https://rpc.example") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          method?: string;
        };
        if (body.method === "getBalance") {
          return Response.json({ result: { value: 2_000_000_000 } });
        }
        if (body.method === "getTokenAccountsByOwner") {
          return Response.json({ result: { value: [] } });
        }
        if (body.method === "getAccountInfo") {
          return Response.json({
            result: {
              value: {
                owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                executable: false,
                lamports: 1_461_600,
                data: {
                  parsed: {
                    type: "mint",
                    info: {
                      mintAuthority: null,
                      supply: "1000000000",
                      decimals: 6,
                      isInitialized: true,
                      freezeAuthority: null,
                    },
                  },
                },
              },
            },
          });
        }
      }

      if (url.includes("/frogx/swap")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          inMint: string;
          outMint: string;
          amountIn: string;
        };
        expect(body.inMint).toBe("So11111111111111111111111111111111111111112");
        expect(body.outMint).toBe(storedAutoBuyConfig.mint);
        expect(body.amountIn).toBe("100000000");
        return Response.json({
          txBase64: "BASE64_TX_PLACEHOLDER",
          meta: { routeId: "auto-buy-test" },
        });
      }

      if (url === "https://api.privy.io/v1/wallets/wallet_123/rpc") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          method: string;
          reference_id: string;
          params: { transaction: string };
        };
        expect(body.method).toBe("signAndSendTransaction");
        expect(body.reference_id).toBe("ribbot-123456-auto_buy:ab_buy");
        expect(body.params.transaction).toBe("BASE64_TX_PLACEHOLDER");
        return Response.json({
          method: "signAndSendTransaction",
          data: {
            hash: "5xAutoBuySignature",
            signed_transaction: "signed-tx",
            caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
            transaction_id: "privy-auto-buy-tx",
            reference_id: body.reference_id,
          },
        });
      }

      return Response.json(
        { error: { message: `unexpected fetch ${url}` } },
        { status: 500 },
      );
    }) as unknown as typeof fetch;

    await runTradingBotAdvancedAutomationMonitors({
      TRADING_BOT_ADVANCED_MONITOR_ENABLED: "true",
      TRADING_BOT_AUTO_BUY_MONITOR_ENABLED: "true",
      TRADING_BOT_AUTO_BUY_LIVE_EXECUTION_ENABLED: "true",
      TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
      SOLANA_RPC_URL: "https://rpc.example",
      RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
      TITAN_TOKEN: "titan-token",
      PRIVY_APP_ID: "privy-app",
      PRIVY_APP_SECRET: "privy-secret",
      PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
      PRIVY_AUTHORIZATION_PRIVATE_KEY: privateKey,
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/automation-configs/active") {
          expect(url.searchParams.get("kind")).toBe("auto_buy");
          return Response.json({
            status: "ready",
            configs: [storedAutoBuyConfig],
          });
        }
        if (url.pathname === "/account") {
          return Response.json({
            status: "ready",
            account,
          });
        }
        if (url.pathname === "/automation-config/claim") {
          const body = (await request.json()) as {
            monitor: Record<string, unknown>;
          };
          return Response.json({
            status: "claimed",
            config: {
              ...storedAutoBuyConfig,
              status: "executing",
              monitor: body.monitor,
            },
          });
        }
        if (url.pathname === "/automation-config/check") {
          const body = (await request.json()) as {
            status?: string;
            monitor: {
              executedCount?: number;
              dryRunTriggerCount?: number;
              lastPriceUsd?: number;
            };
          };
          stateUpdates.push(body);
          return Response.json({
            status: "ready",
            config: { ...storedAutoBuyConfig, monitor: body.monitor },
          });
        }
        if (url.pathname === "/event") {
          const body = (await request.json()) as {
            eventType: string;
            metadata: Record<string, unknown>;
          };
          events.push(body);
          return Response.json({
            status: "ready",
            event: { eventId: "evt_1" },
          });
        }
        return Response.json({ error: "unexpected path" }, { status: 500 });
      }),
    } as Env);

    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0].status).toBe("executed");
    expect(stateUpdates[0].monitor.executedCount).toBe(1);
    expect(stateUpdates[0].monitor.dryRunTriggerCount).toBeUndefined();
    expect(stateUpdates[0].monitor.lastPriceUsd).toBe(2.5);
    expect(events.map((event) => event.eventType)).toEqual([
      "swap_executed",
      "advanced_automation_config_observed",
      "advanced_automation_config_executed",
    ]);
    expect(events[1].metadata.kind).toBe("auto_buy");
    expect(events[1].metadata.liveMonitor).toBe(true);
    expect(events[1].metadata.executionStatus).toBe("executed");
    expect(events[1].metadata.signature).toBe("5xAutoBuySignature");
    expect(events[2].metadata.kind).toBe("auto_buy");
    expect(events[2].metadata.maxBuyAmountIn).toBe("100000000");
    expect(events[2].metadata.signature).toBe("5xAutoBuySignature");
  });

  it("locks an ambiguous auto-buy and reconciles it without another Privy send", async () => {
    const privateKey = await generateTestAuthorizationPrivateKey();
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    installTitanQuoteWebSocketMock({
      amountIn: 1_000_000_000,
      amountOut: 2_500_000,
      priceImpactBps: 120,
    });
    const account = storedAccount({
      walletSource: "privy",
      privyUserId: "user_123",
      privyWalletId: "wallet_123",
      settings: {
        ...storedAccount().settings,
        autoBuyEnabled: true,
      },
    });
    let current = {
      ...storedAutoBuyConfig,
      status: "staged" as string,
      monitor: {} as Record<string, unknown>,
    };
    let providerStatus: "pending" | "confirmed" = "pending";
    let privySendCount = 0;
    let privyStatusCount = 0;
    const events: Array<{ eventType: string }> = [];

    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.startsWith("https://api.jup.ag/price/v3")) {
        const ids = new URL(url).searchParams.get("ids") ?? "";
        return Response.json({
          ...(ids.includes(storedAutoBuyConfig.mint)
            ? {
                [storedAutoBuyConfig.mint]: {
                  usdPrice: 2.5,
                  decimals: 6,
                },
              }
            : {}),
          ...(ids.includes("So11111111111111111111111111111111111111112")
            ? {
                So11111111111111111111111111111111111111112: {
                  usdPrice: 100,
                  decimals: 9,
                },
              }
            : {}),
        });
      }
      if (url === "https://rpc.example") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          method?: string;
        };
        if (body.method === "getBalance") {
          return Response.json({ result: { value: 2_000_000_000 } });
        }
        if (body.method === "getTokenAccountsByOwner") {
          return Response.json({ result: { value: [] } });
        }
        if (body.method === "getAccountInfo") {
          return Response.json({
            result: {
              value: {
                owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                executable: false,
                lamports: 1_461_600,
                data: {
                  parsed: {
                    type: "mint",
                    info: {
                      mintAuthority: null,
                      supply: "1000000000",
                      decimals: 6,
                      isInitialized: true,
                      freezeAuthority: null,
                    },
                  },
                },
              },
            },
          });
        }
      }
      if (url.includes("/frogx/swap")) {
        return Response.json({
          txBase64: "BASE64_TX_PLACEHOLDER",
          meta: { routeId: "ambiguous-auto-buy-test" },
        });
      }
      if (url === "https://api.privy.io/v1/wallets/wallet_123/rpc") {
        privySendCount += 1;
        throw new Error("Privy response connection closed");
      }
      if (
        url.startsWith("https://api.privy.io/v1/transactions?reference_id=")
      ) {
        privyStatusCount += 1;
        const referenceId = String(current.monitor.executionReferenceId);
        return Response.json({
          transactions: [
            {
              id: "privy-ambiguous-auto-buy",
              wallet_id: "wallet_123",
              status: providerStatus,
              transaction_hash:
                providerStatus === "confirmed" ? "5xReconciledAutoBuy" : null,
              caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
              created_at: 1_788_000_000,
              reference_id: referenceId,
            },
          ],
        });
      }
      return Response.json(
        { error: { message: `unexpected fetch ${url}` } },
        { status: 500 },
      );
    }) as unknown as typeof fetch;

    const env = {
      TRADING_BOT_ADVANCED_MONITOR_ENABLED: "true",
      TRADING_BOT_AUTO_BUY_MONITOR_ENABLED: "true",
      TRADING_BOT_AUTO_BUY_LIVE_EXECUTION_ENABLED: "true",
      TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
      TRADING_BOT_ADVANCED_RECONCILE_AFTER_SECONDS: "1",
      SOLANA_RPC_URL: "https://rpc.example",
      RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
      TITAN_TOKEN: "titan-token",
      PRIVY_APP_ID: "privy-app",
      PRIVY_APP_SECRET: "privy-secret",
      PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
      PRIVY_AUTHORIZATION_PRIVATE_KEY: privateKey,
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/automation-configs/active") {
          return Response.json({
            status: "ready",
            configs: current.status === "staged" ? [current] : [],
            executingConfigs: current.status === "executing" ? [current] : [],
          });
        }
        if (url.pathname === "/account") {
          return Response.json({ status: "ready", account });
        }
        if (url.pathname === "/automation-config/claim") {
          if (current.status !== "staged") {
            return Response.json(
              { error: "already claimed", config: current },
              { status: 409 },
            );
          }
          const body = (await request.json()) as {
            monitor: Record<string, unknown>;
          };
          current = {
            ...current,
            status: "executing",
            monitor: body.monitor,
          };
          return Response.json({ status: "claimed", config: current });
        }
        if (url.pathname === "/automation-config/check") {
          const body = (await request.json()) as {
            status?: string;
            monitor: Record<string, unknown>;
            expectedStatus?: string;
            expectedExecutionId?: string;
          };
          if (
            body.expectedStatus !== undefined &&
            body.expectedStatus !== current.status
          ) {
            return Response.json({ error: "stale status" }, { status: 409 });
          }
          if (
            body.expectedExecutionId !== undefined &&
            body.expectedExecutionId !== current.monitor.executionId
          ) {
            return Response.json({ error: "stale execution" }, { status: 409 });
          }
          current = {
            ...current,
            status: body.status ?? current.status,
            monitor: body.monitor,
          };
          return Response.json({ status: "ready", config: current });
        }
        if (url.pathname === "/event") {
          events.push((await request.json()) as { eventType: string });
          return Response.json({
            status: "ready",
            event: { eventId: "evt_1" },
          });
        }
        return Response.json({ error: "unexpected path" }, { status: 500 });
      }),
    } as Env;

    await runTradingBotAdvancedAutomationMonitors(env);

    expect(privySendCount).toBe(1);
    expect(current.status).toBe("executing");
    expect(current.monitor.executionId).toBe("auto_buy:ab_buy");
    expect(current.monitor.executionReferenceId).toBe(
      "ribbot-123456-auto_buy:ab_buy",
    );
    expect(current.monitor.reconciliationStatus).toBe("error");
    expect(current.monitor.manualReviewAfter).toEqual(expect.any(String));

    current = {
      ...current,
      monitor: {
        ...current.monitor,
        executionStartedAt: "2026-01-01T00:00:00.000Z",
      },
    };
    await runTradingBotAdvancedAutomationMonitors(env);

    expect(privySendCount).toBe(1);
    expect(privyStatusCount).toBe(1);
    expect(current.status).toBe("executing");
    expect(current.monitor.reconciliationStatus).toBe("pending");
    expect(current.monitor.manualReviewRequiredAt).toEqual(expect.any(String));
    expect(current.monitor.manualReviewReason).toContain("do not resend");

    providerStatus = "confirmed";
    await runTradingBotAdvancedAutomationMonitors(env);

    expect(privySendCount).toBe(1);
    expect(privyStatusCount).toBe(2);
    expect(current.status).toBe("executed");
    expect(current.monitor.executionSignature).toBe("5xReconciledAutoBuy");
    expect(current.monitor.executedCount).toBe(1);
    expect(current.monitor.manualReviewAfter).toBeUndefined();
    expect(current.monitor.manualReviewRequiredAt).toBeUndefined();
    expect(current.monitor.manualReviewReason).toBeUndefined();
    expect(
      events.filter((event) => event.eventType === "swap_executed"),
    ).toHaveLength(1);
    expect(events.map((event) => event.eventType)).toContain(
      "advanced_automation_config_reconciled",
    );
    expect(errorLog).toHaveBeenCalledOnce();
  });

  it("fails a terminal one-shot auto-buy reconciliation without resending", async () => {
    const referenceId = "ribbot-123456-auto_buy:ab_buy";
    const executingConfig = {
      ...storedAutoBuyConfig,
      status: "executing",
      monitor: {
        executionId: "auto_buy:ab_buy",
        executionReferenceId: referenceId,
        executionStartedAt: "2026-01-01T00:00:00.000Z",
        executionMint: storedAutoBuyConfig.mint,
        executionSide: "buy",
        executionAmountIn: storedAutoBuyConfig.maxBuyAmountIn,
      },
    };
    const updates: Array<{
      status?: string;
      expectedStatus?: string;
      expectedExecutionId?: string;
    }> = [];
    let sendCount = 0;
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (
        url.startsWith("https://api.privy.io/v1/transactions?reference_id=")
      ) {
        expect(init?.method).toBe("GET");
        return Response.json({
          transactions: [
            {
              id: "privy-failed-auto-buy",
              wallet_id: "wallet_123",
              status: "execution_reverted",
              transaction_hash: "5xFailedAutoBuy",
              caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
              created_at: 1_788_000_000,
              reference_id: referenceId,
            },
          ],
        });
      }
      sendCount += 1;
      return Response.json({ error: "unexpected send" }, { status: 500 });
    }) as unknown as typeof fetch;

    await runTradingBotAdvancedAutomationMonitors({
      TRADING_BOT_ADVANCED_MONITOR_ENABLED: "true",
      TRADING_BOT_AUTO_BUY_MONITOR_ENABLED: "true",
      TRADING_BOT_ADVANCED_RECONCILE_AFTER_SECONDS: "1",
      PRIVY_APP_ID: "privy-app",
      PRIVY_APP_SECRET: "privy-secret",
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/automation-configs/active") {
          return Response.json({
            status: "ready",
            configs: [],
            executingConfigs: [executingConfig],
          });
        }
        if (url.pathname === "/account") {
          return Response.json({
            status: "ready",
            account: storedAccount({
              walletSource: "privy",
              privyUserId: "user_123",
              privyWalletId: "wallet_123",
            }),
          });
        }
        if (url.pathname === "/automation-config/check") {
          updates.push((await request.json()) as (typeof updates)[number]);
          return Response.json({ status: "ready", config: executingConfig });
        }
        if (url.pathname === "/event") {
          return Response.json({
            status: "ready",
            event: { eventId: "evt_1" },
          });
        }
        return Response.json({ error: "unexpected path" }, { status: 500 });
      }),
    } as Env);

    expect(sendCount).toBe(0);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      status: "failed",
      expectedStatus: "executing",
      expectedExecutionId: "auto_buy:ab_buy",
    });
  });

  it("returns reconciled copytrade configs to standing monitoring without resending", async () => {
    const referenceId = "ribbot-123456-copytrade:existing";
    const executingConfig = {
      ...storedCopyTradeConfig,
      status: "executing",
      monitor: {
        lastObservedSignature: "sig_already_consumed",
        executionId: "copytrade:existing",
        executionReferenceId: referenceId,
        executionStartedAt: "2026-01-01T00:00:00.000Z",
        executionMint: storedAutoBuyConfig.mint,
        executionSide: "buy",
        executionAmountIn: "100000000",
      },
    };
    const updates: Array<{
      status?: string;
      monitor?: { executedCount?: number; lastObservedSignature?: string };
      expectedStatus?: string;
      expectedExecutionId?: string;
    }> = [];
    let sendCount = 0;
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (
        url.startsWith("https://api.privy.io/v1/transactions?reference_id=")
      ) {
        expect(init?.method).toBe("GET");
        return Response.json({
          transactions: [
            {
              id: "privy-confirmed-copytrade",
              wallet_id: "wallet_123",
              status: "confirmed",
              transaction_hash: "5xConfirmedCopytrade",
              caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
              created_at: 1_788_000_000,
              reference_id: referenceId,
            },
          ],
        });
      }
      sendCount += 1;
      return Response.json({ error: "unexpected send" }, { status: 500 });
    }) as unknown as typeof fetch;

    await runTradingBotAdvancedAutomationMonitors({
      TRADING_BOT_ADVANCED_MONITOR_ENABLED: "true",
      TRADING_BOT_COPYTRADE_MONITOR_ENABLED: "true",
      TRADING_BOT_ADVANCED_RECONCILE_AFTER_SECONDS: "1",
      PRIVY_APP_ID: "privy-app",
      PRIVY_APP_SECRET: "privy-secret",
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/automation-configs/active") {
          return Response.json({
            status: "ready",
            configs: [],
            executingConfigs: [executingConfig],
          });
        }
        if (url.pathname === "/account") {
          return Response.json({
            status: "ready",
            account: storedAccount({
              walletSource: "privy",
              privyUserId: "user_123",
              privyWalletId: "wallet_123",
            }),
          });
        }
        if (url.pathname === "/automation-config/check") {
          updates.push((await request.json()) as (typeof updates)[number]);
          return Response.json({ status: "ready", config: executingConfig });
        }
        if (url.pathname === "/event") {
          return Response.json({
            status: "ready",
            event: { eventId: "evt_1" },
          });
        }
        return Response.json({ error: "unexpected path" }, { status: 500 });
      }),
    } as Env);

    expect(sendCount).toBe(0);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      status: "staged",
      expectedStatus: "executing",
      expectedExecutionId: "copytrade:existing",
    });
    expect(updates[0].monitor?.executedCount).toBe(1);
    expect(updates[0].monitor?.lastObservedSignature).toBe(
      "sig_already_consumed",
    );
  });

  it("does not execute when another advanced monitor already claimed the config", async () => {
    let executionFetches = 0;
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.startsWith("https://api.jup.ag/price/v3")) {
        return Response.json({
          [storedAutoBuyConfig.mint]: { usdPrice: 2.5, decimals: 6 },
        });
      }
      executionFetches += 1;
      return Response.json(
        { error: "unexpected execution fetch" },
        { status: 500 },
      );
    }) as unknown as typeof fetch;

    await runTradingBotAdvancedAutomationMonitors({
      TRADING_BOT_ADVANCED_MONITOR_ENABLED: "true",
      TRADING_BOT_AUTO_BUY_MONITOR_ENABLED: "true",
      TRADING_BOT_AUTO_BUY_LIVE_EXECUTION_ENABLED: "true",
      TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/automation-configs/active") {
          return Response.json({
            status: "ready",
            configs: [storedAutoBuyConfig],
            executingConfigs: [],
          });
        }
        if (url.pathname === "/automation-config/claim") {
          return Response.json(
            {
              error: "Config cannot be claimed from executing status",
              config: { ...storedAutoBuyConfig, status: "executing" },
            },
            { status: 409 },
          );
        }
        if (url.pathname === "/event") {
          return Response.json({ error: "unexpected event" }, { status: 500 });
        }
        return Response.json({ error: "unexpected path" }, { status: 500 });
      }),
    } as Env);

    expect(executionFetches).toBe(0);
  });

  it("records a non-secret auto-sell trigger observation when price crosses", async () => {
    const stateUpdates: Array<{
      monitor: {
        lastObservedMint?: string;
        lastPriceUsd?: number;
        lastTriggerAt?: string;
        lastTriggerReason?: string;
        dryRunTriggerCount?: number;
        matchCount?: number;
      };
    }> = [];
    const events: Array<{
      eventType: string;
      metadata: Record<string, unknown>;
    }> = [];
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        [storedAutoSellConfig.mint]: {
          usdPrice: 3,
          decimals: 6,
        },
      }),
    ) as unknown as typeof fetch;

    await runTradingBotAdvancedAutomationMonitors({
      TRADING_BOT_ADVANCED_MONITOR_ENABLED: "true",
      TRADING_BOT_AUTO_SELL_MONITOR_ENABLED: "true",
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/automation-configs/active") {
          expect(url.searchParams.get("kind")).toBe("auto_sell");
          return Response.json({
            status: "ready",
            configs: [
              {
                ...storedAutoSellConfig,
                monitor: { dryRunTriggerCount: 2, matchCount: 2 },
              },
            ],
          });
        }
        if (url.pathname === "/automation-config/check") {
          const body = (await request.json()) as {
            monitor: {
              lastObservedMint?: string;
              lastPriceUsd?: number;
              lastTriggerAt?: string;
              lastTriggerReason?: string;
              dryRunTriggerCount?: number;
              matchCount?: number;
            };
          };
          stateUpdates.push(body);
          return Response.json({
            status: "ready",
            config: { ...storedAutoSellConfig, monitor: body.monitor },
          });
        }
        if (url.pathname === "/event") {
          const body = (await request.json()) as {
            eventType: string;
            metadata: Record<string, unknown>;
          };
          events.push(body);
          return Response.json({
            status: "ready",
            event: { eventId: "evt_1" },
          });
        }
        return Response.json({ error: "unexpected path" }, { status: 500 });
      }),
    } as Env);

    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0].monitor.lastObservedMint).toBe(
      storedAutoSellConfig.mint,
    );
    expect(stateUpdates[0].monitor.lastPriceUsd).toBe(3);
    expect(stateUpdates[0].monitor.lastTriggerAt).toBeTruthy();
    expect(stateUpdates[0].monitor.lastTriggerReason).toContain(
      "crossed above 2.5",
    );
    expect(stateUpdates[0].monitor.dryRunTriggerCount).toBe(3);
    expect(stateUpdates[0].monitor.matchCount).toBe(3);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("advanced_automation_config_observed");
    expect(events[0].metadata.configId).toBe("as_sell");
    expect(events[0].metadata.kind).toBe("auto_sell");
    expect(events[0].metadata.observedMint).toBe(storedAutoSellConfig.mint);
    expect(events[0].metadata.currentPriceUsd).toBe(3);
    expect(events[0].metadata.triggerPrice).toBe(2.5);
    expect(events[0].metadata.triggerDirection).toBe("above");
    expect(events[0].metadata.liveMonitor).toBe(false);
    expect(events[0].metadata.executionStatus).toBe("not_requested");
  });

  it("executes triggered auto-sell rules only through the explicit live auto-sell gate", async () => {
    const privateKey = await generateTestAuthorizationPrivateKey();
    const account = storedAccount({
      walletSource: "privy",
      privyUserId: "user_123",
      privyWalletId: "wallet_123",
      settings: {
        ...storedAccount().settings,
        autoSellEnabled: true,
      },
    });
    const stateUpdates: Array<{
      status?: string;
      monitor: {
        executedCount?: number;
        dryRunTriggerCount?: number;
        lastPriceUsd?: number;
      };
    }> = [];
    const events: Array<{
      eventType: string;
      metadata: Record<string, unknown>;
    }> = [];

    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.includes("api.jup.ag/price/v3")) {
        return Response.json({
          [storedAutoSellConfig.mint]: {
            usdPrice: 3,
            decimals: 6,
          },
        });
      }

      if (url === "https://rpc.example") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          method?: string;
        };
        if (body.method === "getBalance") {
          return Response.json({ result: { value: 2_000_000_000 } });
        }
        if (body.method === "getTokenAccountsByOwner") {
          return Response.json({
            result: {
              value: [
                {
                  pubkey: "TokenAcct1111111111111111111111111111111111",
                  account: {
                    data: {
                      parsed: {
                        info: {
                          mint: storedAutoSellConfig.mint,
                          tokenAmount: {
                            amount: "1234500",
                            decimals: 6,
                            uiAmount: 1.2345,
                            uiAmountString: "1.2345",
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
          });
        }
      }

      if (url === "https://api.privy.io/v1/wallets/wallet_123/rpc") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          method: string;
          reference_id: string;
          params: { transaction: string };
        };
        expect(body.method).toBe("signAndSendTransaction");
        expect(body.reference_id).toBe("ribbot-123456-auto_sell:as_sell");
        expect(body.params.transaction).toBe("BASE64_TX_PLACEHOLDER");
        return Response.json({
          method: "signAndSendTransaction",
          data: {
            hash: "5xAutoSellSignature",
            signed_transaction: "signed-tx",
            caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
            transaction_id: "privy-auto-sell-tx",
            reference_id: body.reference_id,
          },
        });
      }

      return Response.json(
        { error: { message: `unexpected fetch ${url}` } },
        { status: 500 },
      );
    }) as unknown as typeof fetch;

    await runTradingBotAdvancedAutomationMonitors({
      TRADING_BOT_ADVANCED_MONITOR_ENABLED: "true",
      TRADING_BOT_AUTO_SELL_MONITOR_ENABLED: "true",
      TRADING_BOT_AUTO_SELL_LIVE_EXECUTION_ENABLED: "true",
      TRADING_BOT_LIVE_EXECUTION_ENABLED: "true",
      SOLANA_RPC_URL: "https://rpc.example",
      RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
      PRIVY_APP_ID: "privy-app",
      PRIVY_APP_SECRET: "privy-secret",
      PRIVY_AUTHORIZATION_KEY_ID: "auth-key",
      PRIVY_AUTHORIZATION_PRIVATE_KEY: privateKey,
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/automation-configs/active") {
          expect(url.searchParams.get("kind")).toBe("auto_sell");
          return Response.json({
            status: "ready",
            configs: [storedAutoSellConfig],
          });
        }
        if (url.pathname === "/account") {
          return Response.json({
            status: "ready",
            account,
          });
        }
        if (url.pathname === "/automation-config/claim") {
          const body = (await request.json()) as {
            monitor: Record<string, unknown>;
          };
          return Response.json({
            status: "claimed",
            config: {
              ...storedAutoSellConfig,
              status: "executing",
              monitor: body.monitor,
            },
          });
        }
        if (url.pathname === "/automation-config/check") {
          const body = (await request.json()) as {
            status?: string;
            monitor: {
              executedCount?: number;
              dryRunTriggerCount?: number;
              lastPriceUsd?: number;
            };
          };
          stateUpdates.push(body);
          return Response.json({
            status: "ready",
            config: { ...storedAutoSellConfig, monitor: body.monitor },
          });
        }
        if (url.pathname === "/event") {
          const body = (await request.json()) as {
            eventType: string;
            metadata: Record<string, unknown>;
          };
          events.push(body);
          return Response.json({
            status: "ready",
            event: { eventId: "evt_1" },
          });
        }
        return Response.json({ error: "unexpected path" }, { status: 500 });
      }),
    } as Env);

    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0].status).toBe("executed");
    expect(stateUpdates[0].monitor.executedCount).toBe(1);
    expect(stateUpdates[0].monitor.dryRunTriggerCount).toBeUndefined();
    expect(stateUpdates[0].monitor.lastPriceUsd).toBe(3);
    expect(events.map((event) => event.eventType)).toEqual([
      "swap_executed",
      "advanced_automation_config_observed",
      "advanced_automation_config_executed",
    ]);
    expect(events[1].metadata.liveMonitor).toBe(true);
    expect(events[1].metadata.executionStatus).toBe("executed");
    expect(events[1].metadata.signature).toBe("5xAutoSellSignature");
    expect(events[2].metadata.kind).toBe("auto_sell");
    expect(events[2].metadata.signature).toBe("5xAutoSellSignature");
  });

  it("updates auto-sell rules without triggers as unsupported monitor state", async () => {
    const stateUpdates: Array<{ monitor: { lastError?: string } }> = [];

    await runTradingBotAdvancedAutomationMonitors({
      TRADING_BOT_ADVANCED_MONITOR_ENABLED: "true",
      TRADING_BOT_AUTO_SELL_MONITOR_ENABLED: "true",
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/automation-configs/active") {
          return Response.json({
            status: "ready",
            configs: [
              {
                ...storedAutoSellConfig,
                triggerPrice: undefined,
                triggerDirection: undefined,
              },
            ],
          });
        }
        if (url.pathname === "/automation-config/check") {
          const body = (await request.json()) as {
            monitor: { lastError?: string };
          };
          stateUpdates.push(body);
          return Response.json({
            status: "ready",
            config: { ...storedAutoSellConfig, monitor: body.monitor },
          });
        }
        if (url.pathname === "/event") {
          return Response.json({ error: "unexpected event" }, { status: 500 });
        }
        return Response.json({ error: "unexpected path" }, { status: 500 });
      }),
    } as Env);

    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0].monitor.lastError).toContain(
      "Auto-sell trigger price is not configured",
    );
  });
});

describe("trading bot preference validation", () => {
  const validSettingsBody = {
    telegramUserId: "123456",
    userPublicKey: "So11111111111111111111111111111111111111112",
    kind: "settings",
    action: "set",
    slippageBps: 400,
    priorityFee: 1000,
    sellPriorityFee: 2000,
    defaultBuyAmountIn: "100000000",
    buyPresetAmountsIn: ["100000000", "250000000", "500000000", "1000000000"],
    sellPresetBps: [2500, 5000, 7500, 10000],
    botMode: "advanced",
    confirmTrades: true,
    sellProtection: true,
    autoBuyEnabled: false,
    instantAutoBuyEnabled: true,
    instantAutoBuyAmountIn: "150000000",
    instantAutoBuyMinLiquidityUsd: 2500,
    instantAutoBuyMaxMarketCapUsd: 2_000_000,
    autoSellEnabled: false,
    sniperEnabled: true,
    mevProtection: true,
  };

  it("requires Ribbot auth before validating preferences", async () => {
    const response = await postTradingBotPreferenceValidation(
      requestJson(
        validSettingsBody,
        undefined,
        "/api/frogx/trading-bot/preferences/validate",
      ),
      {} as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["RIBBOT_TRADING_BOT_TOKEN"],
    });
  });

  it("accepts settings preferences and reports when account storage is unavailable", async () => {
    const response = await postTradingBotPreferenceValidation(
      requestJson(
        validSettingsBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/preferences/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      accountStorage: string;
      normalized: {
        kind: string;
        settings: {
          slippageBps: number;
          priorityFee: number;
          sellPriorityFee: number;
          defaultBuyAmountIn: string;
          buyPresetAmountsIn: string[];
          sellPresetBps: number[];
          botMode: string;
          confirmTrades: boolean;
          sellProtection: boolean;
          instantAutoBuyEnabled: boolean;
          instantAutoBuyAmountIn: string;
          instantAutoBuyMinLiquidityUsd: number;
          instantAutoBuyMaxMarketCapUsd: number;
          sniperEnabled: boolean;
          mevProtection: boolean;
        };
      };
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("accepted");
    expect(data.accountStorage).toBe("not_configured");
    expect(data.normalized).toMatchObject({
      kind: "settings",
      settings: {
        slippageBps: 400,
        priorityFee: 1000,
        sellPriorityFee: 2000,
        defaultBuyAmountIn: "100000000",
        buyPresetAmountsIn: [
          "100000000",
          "250000000",
          "500000000",
          "1000000000",
        ],
        sellPresetBps: [2500, 5000, 7500, 10000],
        botMode: "advanced",
        confirmTrades: true,
        sellProtection: true,
        instantAutoBuyEnabled: true,
        instantAutoBuyAmountIn: "150000000",
        instantAutoBuyMinLiquidityUsd: 2500,
        instantAutoBuyMaxMarketCapUsd: 2_000_000,
        sniperEnabled: true,
        mevProtection: true,
      },
    });
    expect(data.warnings.join(" ")).toContain(
      "account storage is not configured",
    );
  });

  it("stores settings preferences when the account Durable Object is bound", async () => {
    const account = storedAccount();
    const response = await postTradingBotPreferenceValidation(
      requestJson(
        validSettingsBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/preferences/validate",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          expect(new URL(request.url).pathname).toBe("/preferences");
          const body = (await request.json()) as { kind: string };
          expect(body.kind).toBe("settings");
          return Response.json({ status: "ready", account });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      accountStorage: string;
      account: {
        settings: {
          slippageBps: number;
          defaultBuyAmountIn: string;
        };
      };
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("accepted");
    expect(data.accountStorage).toBe("stored");
    expect(data.account.settings.slippageBps).toBe(400);
    expect(data.account.settings.defaultBuyAmountIn).toBe("100000000");
    expect(data.warnings.join(" ")).toContain("stored this Ribbot preference");
  });

  it("rejects unsafe settings values", async () => {
    const response = await postTradingBotPreferenceValidation(
      requestJson(
        {
          ...validSettingsBody,
          slippageBps: 10_001,
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/preferences/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(data).toEqual({
      error: "slippageBps must be an integer from 0 to 10000",
    });
  });

  it("forces confirm-off in simple mode while preserving sell protection", async () => {
    const response = await postTradingBotPreferenceValidation(
      requestJson(
        {
          ...validSettingsBody,
          botMode: "simple",
          confirmTrades: true,
          sellProtection: true,
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/preferences/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as {
      normalized: {
        settings: {
          botMode: string;
          confirmTrades: boolean;
          sellProtection: boolean;
        };
      };
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.normalized.settings).toMatchObject({
      botMode: "simple",
      confirmTrades: false,
      sellProtection: true,
    });
    expect(data.warnings.join(" ")).toContain(
      "Simple mode stores confirmTrades=false",
    );
  });

  it("rejects duplicate or out-of-range trade presets", async () => {
    const duplicateBuys = await postTradingBotPreferenceValidation(
      requestJson(
        {
          ...validSettingsBody,
          buyPresetAmountsIn: ["100000000", "100000000"],
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/preferences/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const invalidSells = await postTradingBotPreferenceValidation(
      requestJson(
        {
          ...validSettingsBody,
          sellPresetBps: [2500, 10001],
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/preferences/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );

    expect(duplicateBuys.status).toBe(400);
    expect(await duplicateBuys.json()).toEqual({
      error: "buyPresetAmountsIn must not contain duplicates",
    });
    expect(invalidSells.status).toBe(400);
    expect(await invalidSells.json()).toEqual({
      error: "sellPresetBps must contain integers from 1 to 10000",
    });
  });

  it("accepts watchlist token changes", async () => {
    const response = await postTradingBotPreferenceValidation(
      requestJson(
        {
          telegramUserId: "123456",
          kind: "watchlist",
          action: "add",
          mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/preferences/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      normalized: { kind: string; action: string; mint: string };
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("accepted");
    expect(data.normalized).toMatchObject({
      kind: "watchlist",
      action: "add",
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    });
  });

  it("accepts hidden token changes", async () => {
    const response = await postTradingBotPreferenceValidation(
      requestJson(
        {
          telegramUserId: "123456",
          kind: "hiddenToken",
          action: "remove",
          mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/preferences/validate",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      normalized: { kind: string; action: string };
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("accepted");
    expect(data.normalized).toMatchObject({
      kind: "hiddenToken",
      action: "remove",
    });
  });
});

describe("trading bot activity", () => {
  const activityEvents = [
    {
      telegramUserId: "123456",
      eventId: "evt_swap",
      eventType: "swap_executed",
      metadata: {
        signature: "abc123",
        mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        solscanUrl: "https://solscan.io/tx/abc123",
      },
      createdAt: "2026-07-04T00:00:03.000Z",
    },
    {
      telegramUserId: "123456",
      eventId: "evt_order",
      eventType: "automation_order_triggered",
      metadata: {
        orderId: "ord_1",
        kind: "limit",
        side: "buy",
      },
      createdAt: "2026-07-04T00:00:02.000Z",
    },
  ];

  it("requires Ribbot auth before returning account activity", async () => {
    const response = await getTradingBotActivity(
      new Request(
        "https://frogx.example/api/frogx/trading-bot/activity?telegramUserId=123456",
      ),
      {} as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["RIBBOT_TRADING_BOT_TOKEN"],
    });
  });

  it("returns non-secret account events through the account Durable Object", async () => {
    const response = await getTradingBotActivity(
      new Request(
        "https://frogx.example/api/frogx/trading-bot/activity?telegramUserId=123456&limit=2",
        { headers: { Authorization: "Bearer ribbot-token" } },
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts((request) => {
          const url = new URL(request.url);
          if (url.pathname === "/account") {
            return Response.json({ status: "not_found", account: null });
          }
          expect(url.pathname).toBe("/events");
          expect(url.searchParams.get("telegramUserId")).toBe("123456");
          expect(url.searchParams.get("limit")).toBe("2");
          return Response.json({
            status: "ready",
            telegramUserId: "123456",
            events: activityEvents,
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      summary: {
        totalEvents: number;
        latestEventAt: string;
        eventTypes: Record<string, number>;
      };
      events: Array<{ eventType: string; metadata: Record<string, unknown> }>;
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("ready");
    expect(data.summary.totalEvents).toBe(2);
    expect(data.summary.latestEventAt).toBe("2026-07-04T00:00:03.000Z");
    expect(data.summary.eventTypes.swap_executed).toBe(1);
    expect(data.summary.eventTypes.automation_order_triggered).toBe(1);
    expect(data.events[0].metadata.signature).toBe("abc123");
    expect(data.warnings.join(" ")).toContain("non-secret account events");
  });

  it("returns Imperial profile status and records one PDA funding event", async () => {
    const authorityWalletAddress =
      "So11111111111111111111111111111111111111112";
    const profileAddress = "Vote111111111111111111111111111111111111111";
    const persistedEvents: Array<{
      telegramUserId: string;
      eventId: string;
      eventType: string;
      metadata: Record<string, unknown>;
      createdAt: string;
    }> = [];
    const directFetch = vi.fn(async () => {
      throw new Error("Perps status must come from the Imperial profile service");
    });
    globalThis.fetch = directFetch as typeof fetch;

    const accounts = fakeTradingBotAccounts(
      async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/account") {
          return Response.json({
            status: "ready",
            account: storedAccount({
              walletSource: "privy",
              privyUserId: "privy-user",
              privyWalletId: "privy-wallet",
              solanaWalletAddress: authorityWalletAddress,
              activeWalletId: "privy-wallet",
              wallets: [
                {
                  walletId: "privy-wallet",
                  label: "Spot & NFT Wallet (Privy)",
                  role: "spot_nft",
                  walletSource: "privy",
                  privyUserId: "privy-user",
                  privyWalletId: "privy-wallet",
                  solanaWalletAddress: authorityWalletAddress,
                  createdAt: "2026-07-31T00:00:00.000Z",
                },
              ],
            }),
          });
        }
        if (url.pathname === "/delta-neutral/preview") {
          expect(request.method).toBe("POST");
          expect(await request.json()).toEqual({ telegramUserId: "123456" });
          return Response.json({
            status: "ready",
            liveExecutionEnabled: false,
            preview: {
              strategy: "delta_neutral",
              preset: "low",
              wallet: authorityWalletAddress,
              profileIndex: 1,
              profileAddress,
              profileUsdc: 70.67903,
              minimumProfileUsdc: 50,
              profileFunded: true,
              liveReady: false,
              liveEntryCapUsd: 60,
              maxCycles: 1,
              blockers: ["Live execution is disabled."],
            },
          });
        }
        if (url.pathname === "/event" && request.method === "POST") {
          const body = (await request.json()) as {
            telegramUserId: string;
            eventId: string;
            eventType: string;
            metadata: Record<string, unknown>;
          };
          const event = {
            ...body,
            createdAt: "2026-07-31T01:00:00.000Z",
          };
          if (
            !persistedEvents.some(
              (candidate) => candidate.eventId === event.eventId,
            )
          ) {
            persistedEvents.unshift(event);
          }
          return Response.json({ status: "ready", event });
        }
        if (url.pathname === "/events") {
          return Response.json({
            status: "ready",
            telegramUserId: "123456",
            events: persistedEvents,
          });
        }
        return Response.json(
          { error: "unexpected store path" },
          { status: 500 },
        );
      },
      (request) => {
        const eventId = new URL(request.url).searchParams.get("eventId");
        const event = persistedEvents.find(
          (candidate) => candidate.eventId === eventId,
        );
        return event
          ? Response.json({ status: "ready", event })
          : Response.json({ status: "not_found" }, { status: 404 });
      },
    );
    const env = {
      RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
      TRADING_BOT_ACCOUNTS: accounts,
    } as Env;
    const activityRequest = () =>
      new Request(
        "https://frogx.example/api/frogx/trading-bot/activity?telegramUserId=123456",
        { headers: { Authorization: "Bearer ribbot-token" } },
      );
    const statusResponse = await getTradingBotPerpsStatus(
      new Request(
        "https://frogx.example/api/frogx/trading-bot/perps/status?telegramUserId=123456",
        { headers: { Authorization: "Bearer ribbot-token" } },
      ),
      env,
    );
    const statusData = (await statusResponse.json()) as {
      status: string;
      authorityWalletAddress: string;
      profileAddress: string;
      profileIndex: number;
      profileUsdc: number;
      minimumProfileUsdc: number;
      funded: boolean;
      fundingLocation: string;
    };

    const first = await getTradingBotActivity(activityRequest(), env);
    const firstData = (await first.json()) as {
      events: typeof persistedEvents;
    };
    const second = await getTradingBotActivity(activityRequest(), env);
    const secondData = (await second.json()) as {
      events: typeof persistedEvents;
    };

    expect(statusResponse.status).toBe(200);
    expect(statusData).toMatchObject({
      status: "ready",
      authorityWalletAddress,
      profileAddress,
      profileIndex: 1,
      profileUsdc: 70.67903,
      minimumProfileUsdc: 50,
      funded: true,
      fundingLocation: "imperial_profile",
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstData.events).toHaveLength(1);
    expect(secondData.events).toHaveLength(1);
    expect(firstData.events[0]).toMatchObject({
      eventId: `imperial-profile-funded:${profileAddress}`,
      eventType: "imperial_deposit_confirmed",
      metadata: {
        authorityWalletAddress,
        profileAddress,
        profileIndex: 1,
        uiAmountString: "70.67903",
        minimumUiAmountString: "50",
        fundingLocation: "imperial_profile",
      },
    });
    expect(directFetch).not.toHaveBeenCalled();
  });

  it("rejects a profile PDA lookup when the Privy identity does not match", async () => {
    const authorityWalletAddress =
      "So11111111111111111111111111111111111111112";
    const accounts = fakeTradingBotAccounts(async (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/imperial-profile") {
        expect(await request.json()).toEqual({
          telegramUserId: "123456",
          privyUserId: "did:privy:not-owner",
          authorityWalletAddress,
        });
        return Response.json(
          { error: "Account identity does not match" },
          { status: 403 },
        );
      }
      throw new Error(`Unexpected store path: ${url.pathname}`);
    });

    const result = await getAuthenticatedTradingBotPerpsWalletSnapshot(
      { TRADING_BOT_ACCOUNTS: accounts } as Env,
      {
        telegramUserId: "123456",
        privyUserId: "did:privy:not-owner",
        authorityWalletAddress,
      },
    );

    expect(result).toEqual({
      error: "Account identity does not match",
      status: 403,
    });
  });

  it("loads the profile wallet without running a strategy preview", async () => {
    const authorityWalletAddress =
      "So11111111111111111111111111111111111111112";
    const profileAddress = "Vote111111111111111111111111111111111111111";
    const paths: string[] = [];
    const accounts = fakeTradingBotAccounts(async (request) => {
      const url = new URL(request.url);
      paths.push(url.pathname);
      if (url.pathname !== "/imperial-profile") {
        throw new Error(`Unexpected store path: ${url.pathname}`);
      }
      return Response.json({
        status: "ready",
        snapshot: {
          telegramUserId: "123456",
          authorityWalletAddress,
          profileAddress,
          profileIndex: 1,
          profileUsdc: 69.67903,
          minimumProfileUsdc: 50,
          funded: true,
          fundingLocation: "imperial_profile",
          imperialProfileVerified: true,
          balanceStatus: "live",
          balanceUpdatedAt: "2026-08-05T12:00:00.000Z",
        },
      });
    });

    const result = await getAuthenticatedTradingBotPerpsWalletSnapshot(
      { TRADING_BOT_ACCOUNTS: accounts } as Env,
      {
        telegramUserId: "123456",
        privyUserId: "did:privy:owner",
        authorityWalletAddress,
      },
    );

    expect(result).toEqual({
      snapshot: {
        telegramUserId: "123456",
        authorityWalletAddress,
        profileAddress,
        profileIndex: 1,
        profileUsdc: 69.67903,
        minimumProfileUsdc: 50,
        funded: true,
        fundingLocation: "imperial_profile",
        imperialProfileVerified: true,
        balanceStatus: "live",
        balanceUpdatedAt: "2026-08-05T12:00:00.000Z",
      },
    });
    expect(paths).toEqual(["/imperial-profile"]);
  });
});

describe("trading bot operator manual reviews", () => {
  const reviewCase = {
    caseId: "manual-review:ribbot-123456-order_123",
    telegramUserId: "123456",
    executionKind: "swap",
    resourceId: "order_123",
    executionId: "order_123",
    referenceId: "ribbot-123456-order_123",
    executionStartedAt: "2026-07-10T00:00:00.000Z",
    manualReviewAfter: "2026-07-10T00:15:00.000Z",
    manualReviewRequiredAt: "2026-07-10T00:16:00.000Z",
    reason: "Execution remains unresolved; do not resend.",
    status: "open",
    createdAt: "2026-07-10T00:16:00.000Z",
    updatedAt: "2026-07-10T00:16:00.000Z",
  };

  it("requires a separate operator token for the review queue", async () => {
    const missing = await getTradingBotOperatorReviews(
      new Request(
        "https://frogx.example/api/frogx/trading-bot/operator/reviews",
      ),
      {} as Env,
    );
    const denied = await getTradingBotOperatorReviews(
      new Request(
        "https://frogx.example/api/frogx/trading-bot/operator/reviews",
        { headers: { Authorization: "Bearer wrong-token" } },
      ),
      { TRADING_BOT_OPERATOR_TOKEN: "operator-token" } as Env,
    );

    expect(missing.status).toBe(503);
    await expect(missing.json()).resolves.toEqual({
      status: "not_configured",
      required: ["TRADING_BOT_OPERATOR_TOKEN"],
    });
    expect(denied.status).toBe(401);
    await expect(denied.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("lists active review cases without exposing the operator token", async () => {
    const response = await getTradingBotOperatorReviews(
      new Request(
        "https://frogx.example/api/frogx/trading-bot/operator/reviews?status=active&limit=10",
        { headers: { Authorization: "Bearer operator-token" } },
      ),
      {
        TRADING_BOT_OPERATOR_TOKEN: "operator-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(
          () => Response.json({ error: "unexpected path" }, { status: 500 }),
          undefined,
          (request) => {
            const url = new URL(request.url);
            expect(url.pathname).toBe("/manual-reviews");
            expect(url.searchParams.get("status")).toBe("active");
            expect(url.searchParams.get("limit")).toBe("10");
            return Response.json({ status: "ready", cases: [reviewCase] });
          },
        ),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      count: number;
      cases: Array<{ caseId: string }>;
      automaticRetry: boolean;
    };

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      status: "ready",
      count: 1,
      automaticRetry: false,
    });
    expect(data.cases[0].caseId).toBe(reviewCase.caseId);
    expect(JSON.stringify(data)).not.toContain("operator-token");
  });

  it("acknowledges a review without changing execution state", async () => {
    const events: Array<Record<string, unknown>> = [];
    globalThis.fetch = vi.fn(async () =>
      Response.json({ error: "unexpected external fetch" }, { status: 500 }),
    ) as unknown as typeof fetch;
    const acknowledgedCase = {
      ...reviewCase,
      status: "acknowledged",
      acknowledgedAt: "2026-07-10T00:20:00.000Z",
      operatorNote: "Investigating provider status",
    };
    const response = await postTradingBotOperatorReviewAcknowledge(
      requestJson(
        {
          caseId: reviewCase.caseId,
          note: "Investigating provider status",
        },
        { Authorization: "Bearer operator-token" },
        "/api/frogx/trading-bot/operator/reviews/acknowledge",
      ),
      {
        TRADING_BOT_OPERATOR_TOKEN: "operator-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(
          async (request) => {
            const url = new URL(request.url);
            if (url.pathname === "/event") {
              events.push((await request.json()) as Record<string, unknown>);
              return Response.json({ status: "ready", event: {} });
            }
            return Response.json({ error: "unexpected path" }, { status: 500 });
          },
          undefined,
          (request) => {
            expect(new URL(request.url).pathname).toBe(
              "/manual-review/acknowledge",
            );
            return Response.json({
              status: "acknowledged",
              case: acknowledgedCase,
            });
          },
        ),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      case: { status: string; resolution?: string };
    };

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      status: "acknowledged",
      case: { status: "acknowledged" },
    });
    expect(data.case.resolution).toBeUndefined();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "execution_manual_review_acknowledged",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("resolves a review only from terminal Privy GET evidence without resending", async () => {
    let currentCase: Record<string, unknown> = { ...reviewCase };
    const reviewChecks: Array<Record<string, unknown>> = [];
    const accountEvents: Array<Record<string, unknown>> = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      expect(url).toContain("/v1/transactions?reference_id=");
      expect(init?.method).toBe("GET");
      return Response.json({
        transactions: [
          {
            id: "privy-operator-resolved",
            wallet_id: "wallet_123",
            status: "confirmed",
            transaction_hash: "5xOperatorResolved",
            caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
            created_at: 1_788_000_000,
            reference_id: reviewCase.referenceId,
          },
        ],
      });
    }) as unknown as typeof fetch;

    const response = await postTradingBotOperatorReviewReconcile(
      requestJson(
        { caseId: reviewCase.caseId, note: "Read-only provider recheck" },
        { Authorization: "Bearer operator-token" },
        "/api/frogx/trading-bot/operator/reviews/reconcile",
      ),
      {
        TRADING_BOT_OPERATOR_TOKEN: "operator-token",
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(
          async (request) => {
            const url = new URL(request.url);
            if (url.pathname === "/account") {
              return Response.json({
                status: "ready",
                account: storedAccount({
                  walletSource: "privy",
                  privyWalletId: "wallet_123",
                }),
              });
            }
            if (url.pathname === "/event") {
              accountEvents.push(
                (await request.json()) as Record<string, unknown>,
              );
              return Response.json({ status: "ready", event: {} });
            }
            return Response.json({ error: "unexpected path" }, { status: 500 });
          },
          (request) => {
            const eventId = new URL(request.url).searchParams.get("eventId");
            if (eventId?.startsWith("reconciliation:")) {
              return Response.json({
                status: "ready",
                event: {
                  ...reviewCase,
                  eventId,
                  eventType: "execution_reconciliation_required",
                  metadata: {
                    executionStartedAt: reviewCase.executionStartedAt,
                  },
                },
              });
            }
            return Response.json({ status: "not_found" }, { status: 404 });
          },
          async (request) => {
            const url = new URL(request.url);
            if (url.pathname === "/manual-review" && request.method === "GET") {
              return Response.json({ status: "ready", case: currentCase });
            }
            if (url.pathname === "/manual-review/acknowledge") {
              currentCase = {
                ...currentCase,
                status: "acknowledged",
                acknowledgedAt: "2026-07-10T00:20:00.000Z",
              };
              return Response.json({
                status: "acknowledged",
                case: currentCase,
              });
            }
            if (url.pathname === "/manual-review/check") {
              const body = (await request.json()) as Record<string, unknown>;
              reviewChecks.push(body);
              currentCase = {
                ...currentCase,
                status: body.resolution
                  ? "resolved"
                  : String(currentCase.status),
                resolution: body.resolution as string | undefined,
                providerStatus: body.providerStatus as string | undefined,
                signature: body.signature as string | undefined,
                transactionId: body.transactionId as string | undefined,
                resolvedAt: body.resolution
                  ? (body.checkedAt as string)
                  : undefined,
              };
              return Response.json({ status: "ready", case: currentCase });
            }
            return Response.json(
              { error: "unexpected review path" },
              { status: 500 },
            );
          },
        ),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      case: { status: string; resolution?: string };
      evidence: { resolution?: string; providerStatus?: string };
      automaticRetry: boolean;
    };

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      status: "resolved",
      case: { status: "resolved", resolution: "executed" },
      evidence: { resolution: "executed", providerStatus: "confirmed" },
      automaticRetry: false,
    });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(reviewChecks.some((check) => check.resolution === "executed")).toBe(
      true,
    );
    expect(
      accountEvents.some((event) => event.eventType === "swap_executed"),
    ).toBe(true);
    expect(
      accountEvents.some(
        (event) => event.eventType === "execution_manual_review_resolved",
      ),
    ).toBe(true);
  });

  it("keeps a review locked when the Privy GET remains pending", async () => {
    const acknowledgedCase = {
      ...reviewCase,
      status: "acknowledged",
      acknowledgedAt: "2026-07-10T00:20:00.000Z",
    };
    let checkedBody: Record<string, unknown> | undefined;
    globalThis.fetch = vi.fn(async (_input, init) => {
      expect(init?.method).toBe("GET");
      return Response.json({
        transactions: [
          {
            id: "privy-still-pending",
            wallet_id: "wallet_123",
            status: "pending",
            transaction_hash: null,
            caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
            created_at: 1_788_000_000,
            reference_id: reviewCase.referenceId,
          },
        ],
      });
    }) as unknown as typeof fetch;

    const response = await postTradingBotOperatorReviewReconcile(
      requestJson(
        { caseId: reviewCase.caseId },
        { Authorization: "Bearer operator-token" },
        "/api/frogx/trading-bot/operator/reviews/reconcile",
      ),
      {
        TRADING_BOT_OPERATOR_TOKEN: "operator-token",
        PRIVY_APP_ID: "privy-app",
        PRIVY_APP_SECRET: "privy-secret",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(
          async (request) => {
            const url = new URL(request.url);
            if (url.pathname === "/account") {
              return Response.json({
                status: "ready",
                account: storedAccount({
                  walletSource: "privy",
                  privyWalletId: "wallet_123",
                }),
              });
            }
            if (url.pathname === "/event") {
              return Response.json({ status: "ready", event: {} });
            }
            return Response.json({ error: "unexpected path" }, { status: 500 });
          },
          (request) => {
            const eventId = new URL(request.url).searchParams.get("eventId");
            if (eventId?.startsWith("reconciliation:")) {
              return Response.json({
                status: "ready",
                event: {
                  eventId,
                  eventType: "execution_reconciliation_required",
                  metadata: {
                    executionStartedAt: reviewCase.executionStartedAt,
                  },
                  createdAt: reviewCase.executionStartedAt,
                },
              });
            }
            return Response.json({ status: "not_found" }, { status: 404 });
          },
          async (request) => {
            const url = new URL(request.url);
            if (url.pathname === "/manual-review" && request.method === "GET") {
              return Response.json({
                status: "ready",
                case: acknowledgedCase,
              });
            }
            if (
              url.pathname === "/manual-review" &&
              request.method === "POST"
            ) {
              return Response.json({
                status: "ready",
                case: acknowledgedCase,
              });
            }
            if (url.pathname === "/manual-review/check") {
              checkedBody = (await request.json()) as Record<string, unknown>;
              return Response.json({
                status: "ready",
                case: {
                  ...acknowledgedCase,
                  lastCheckStatus: checkedBody.checkStatus,
                  lastCheckedAt: checkedBody.checkedAt,
                },
              });
            }
            return Response.json(
              { error: "unexpected review path" },
              { status: 500 },
            );
          },
        ),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      case: { status: string; resolution?: string };
      evidence: { checkStatus: string; resolution?: string };
      automaticRetry: boolean;
    };

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      status: "unresolved",
      case: { status: "acknowledged" },
      evidence: { checkStatus: "pending" },
      automaticRetry: false,
    });
    expect(data.case.resolution).toBeUndefined();
    expect(data.evidence.resolution).toBeUndefined();
    expect(checkedBody?.resolution).toBeUndefined();
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });
});

describe("trading bot referrals", () => {
  const referralSummary = {
    telegramUserId: "123456",
    referralCode: "ABCD2345",
    referredUsers: 2,
    rewardStatus: "tracking_only",
    claimableRewards: [],
    updatedAt: "2026-07-04T00:00:01.000Z",
    warnings: [
      "Referral tracking is non-secret account metadata stored by FTX/FrogX.",
      "Rewards are tracking-only in this milestone; no fee share, token payout, claimable balance, signing, or transfer is created.",
    ],
  };

  it("requires Ribbot auth before returning referral summaries", async () => {
    const response = await getTradingBotReferrals(
      new Request(
        "https://frogx.example/api/frogx/trading-bot/referrals?telegramUserId=123456",
      ),
      {} as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["RIBBOT_TRADING_BOT_TOKEN"],
    });
  });

  it("returns referral summaries through the account Durable Object", async () => {
    const response = await getTradingBotReferrals(
      new Request(
        "https://frogx.example/api/frogx/trading-bot/referrals?telegramUserId=123456",
        { headers: { Authorization: "Bearer ribbot-token" } },
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts((request) => {
          const url = new URL(request.url);
          expect(url.pathname).toBe("/referral");
          expect(url.searchParams.get("telegramUserId")).toBe("123456");
          return Response.json({ status: "ready", summary: referralSummary });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      summary: {
        referralCode: string;
        referredUsers: number;
        rewardStatus: string;
        claimableRewards: unknown[];
        warnings: string[];
      };
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("ready");
    expect(data.summary.referralCode).toBe("ABCD2345");
    expect(data.summary.referredUsers).toBe(2);
    expect(data.summary.rewardStatus).toBe("tracking_only");
    expect(data.summary.claimableRewards).toEqual([]);
    expect(data.summary.warnings.join(" ")).toContain("tracking-only");
  });

  it("applies referral codes through the account Durable Object", async () => {
    const response = await postTradingBotReferral(
      requestJson(
        {
          telegramUserId: "123456",
          username: "ribbit",
          referralCode: "ABCD2345",
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/referrals",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
          expect(new URL(request.url).pathname).toBe("/referral");
          const body = (await request.json()) as {
            telegramUserId: string;
            username: string;
            referralCode: string;
          };
          expect(body).toMatchObject({
            telegramUserId: "123456",
            username: "ribbit",
            referralCode: "ABCD2345",
          });
          return Response.json({
            status: "accepted",
            applied: true,
            summary: {
              ...referralSummary,
              referredByCode: "ABCD2345",
              referredByTelegramUserId: "999999",
            },
            warnings: referralSummary.warnings,
          });
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      applied: boolean;
      summary: {
        referredByCode: string;
        referredByTelegramUserId: string;
      };
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("accepted");
    expect(data.applied).toBe(true);
    expect(data.summary.referredByCode).toBe("ABCD2345");
    expect(data.summary.referredByTelegramUserId).toBe("999999");
  });
});

describe("trading bot positions", () => {
  const validPositionsBody = {
    telegramUserId: "123456",
    userPublicKey: "So11111111111111111111111111111111111111112",
  };

  it("requires Ribbot auth before reading wallet positions", async () => {
    const response = await postTradingBotPositions(
      requestJson(
        validPositionsBody,
        undefined,
        "/api/frogx/trading-bot/positions",
      ),
      {} as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["RIBBOT_TRADING_BOT_TOKEN"],
    });
  });

  it("reports missing Solana RPC configuration after auth passes", async () => {
    const response = await postTradingBotPositions(
      requestJson(
        validPositionsBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/positions",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["SOLANA_RPC_URL"],
    });
  });

  it("returns parsed SOL and SPL balances from RPC", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        method?: string;
      };
      if (body.method === "getBalance") {
        return Response.json({ result: { value: 1_250_000_000 } });
      }
      if (body.method === "getTokenAccountsByOwner") {
        return Response.json({
          result: {
            value: [
              {
                pubkey: "TokenAcct1111111111111111111111111111111111",
                account: {
                  data: {
                    parsed: {
                      info: {
                        mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                        tokenAmount: {
                          amount: "1234500",
                          decimals: 6,
                          uiAmount: 1.2345,
                          uiAmountString: "1.2345",
                        },
                      },
                    },
                  },
                },
              },
              {
                pubkey: "EmptyAcct1111111111111111111111111111111111",
                account: {
                  data: {
                    parsed: {
                      info: {
                        mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
                        tokenAmount: {
                          amount: "0",
                          decimals: 6,
                          uiAmount: 0,
                          uiAmountString: "0",
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
        });
      }
      return Response.json({ error: { message: "unexpected method" } });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await postTradingBotPositions(
      requestJson(
        validPositionsBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/positions",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        SOLANA_RPC_URL: "https://rpc.example",
      } as Env,
    );
    const data = (await response.json()) as {
      sol: { lamports: string; uiAmount: number };
      tokens: Array<{
        mint: string;
        tokenAccount: string;
        amount: string;
        decimals: number;
        uiAmount: number | null;
        uiAmountString: string;
      }>;
    };

    expect(response.status).toBe(200);
    expect(data.sol).toEqual({ lamports: "1250000000", uiAmount: 1.25 });
    expect(data.tokens).toEqual([
      {
        mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        tokenAccount: "TokenAcct1111111111111111111111111111111111",
        amount: "1234500",
        decimals: 6,
        uiAmount: 1.2345,
        uiAmountString: "1.2345",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("trading bot token cleanup", () => {
  const validCleanupBody = {
    telegramUserId: "123456",
    userPublicKey: "So11111111111111111111111111111111111111112",
  };

  it("requires Ribbot auth before reviewing token cleanup", async () => {
    const response = await postTradingBotTokenCleanupReview(
      requestJson(
        validCleanupBody,
        undefined,
        "/api/frogx/trading-bot/token-cleanup/review",
      ),
      {} as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["RIBBOT_TRADING_BOT_TOKEN"],
    });
  });

  it("classifies dust, unpriced, and hidden SPL positions without mutating state", async () => {
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "https://rpc.example") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          method?: string;
        };
        if (body.method === "getBalance") {
          return Response.json({ result: { value: 750_000_000 } });
        }
        if (body.method === "getTokenAccountsByOwner") {
          return Response.json({
            result: {
              value: [
                {
                  pubkey: "DustAcct111111111111111111111111111111111",
                  account: {
                    data: {
                      parsed: {
                        info: {
                          mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                          tokenAmount: {
                            amount: "250000",
                            decimals: 6,
                            uiAmount: 0.25,
                            uiAmountString: "0.25",
                          },
                        },
                      },
                    },
                  },
                },
                {
                  pubkey: "UnpricedAcct111111111111111111111111111111",
                  account: {
                    data: {
                      parsed: {
                        info: {
                          mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
                          tokenAmount: {
                            amount: "1000000",
                            decimals: 6,
                            uiAmount: 1,
                            uiAmountString: "1",
                          },
                        },
                      },
                    },
                  },
                },
                {
                  pubkey: "HiddenAcct11111111111111111111111111111111",
                  account: {
                    data: {
                      parsed: {
                        info: {
                          mint: "DezXAZ8z7PnrnRJjz3Q4QJ4ZRq4fZkQam5pQxQxQxQx",
                          tokenAmount: {
                            amount: "2000000",
                            decimals: 5,
                            uiAmount: 20,
                            uiAmountString: "20",
                          },
                        },
                      },
                    },
                  },
                },
                {
                  pubkey: "LargeAcct111111111111111111111111111111111",
                  account: {
                    data: {
                      parsed: {
                        info: {
                          mint: "4k3Dyjzvzp8e7bMdfvBz9xEe1x5t5Bo8UHHhhh2HHhhh",
                          tokenAmount: {
                            amount: "10000000",
                            decimals: 6,
                            uiAmount: 10,
                            uiAmountString: "10",
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
          });
        }
      }
      if (url.startsWith("https://api.jup.ag/price/v3")) {
        return Response.json({
          EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
            usdPrice: 2,
            decimals: 6,
          },
          DezXAZ8z7PnrnRJjz3Q4QJ4ZRq4fZkQam5pQxQxQxQx: {
            usdPrice: 1,
            decimals: 5,
          },
          "4k3Dyjzvzp8e7bMdfvBz9xEe1x5t5Bo8UHHhhh2HHhhh": {
            usdPrice: 2,
            decimals: 6,
          },
        });
      }
      return Response.json({ error: "unexpected fetch" }, { status: 500 });
    });

    const response = await postTradingBotTokenCleanupReview(
      requestJson(
        {
          ...validCleanupBody,
          hiddenTokens: ["DezXAZ8z7PnrnRJjz3Q4QJ4ZRq4fZkQam5pQxQxQxQx"],
        },
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/token-cleanup/review",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        SOLANA_RPC_URL: "https://rpc.example",
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      summary: {
        totalTokens: number;
        cleanupCandidates: number;
        hiddenPositions: number;
        dustValueUsd: number | null;
      };
      candidates: Array<{
        mint: string;
        cleanupReason: string;
        currentValueUsd: number | null;
        suggestedActions: string[];
      }>;
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("ready");
    expect(data.summary).toMatchObject({
      totalTokens: 4,
      cleanupCandidates: 3,
      hiddenPositions: 1,
      dustValueUsd: 0.5,
    });
    expect(data.candidates.map((candidate) => candidate.cleanupReason)).toEqual(
      ["dust", "unpriced", "hidden"],
    );
    expect(data.candidates[0]).toMatchObject({
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      currentValueUsd: 0.5,
      suggestedActions: ["hide", "sell"],
    });
    expect(data.candidates[1]).toMatchObject({
      mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
      currentValueUsd: null,
      suggestedActions: ["hide", "sell"],
    });
    expect(data.candidates[2]).toMatchObject({
      mint: "DezXAZ8z7PnrnRJjz3Q4QJ4ZRq4fZkQam5pQxQxQxQx",
      suggestedActions: ["sell"],
    });
    expect(data.warnings.join(" ")).toContain("Review only");
  });
});

describe("trading bot token safety", () => {
  const validSafetyBody = {
    telegramUserId: "123456",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  };

  it("requires Ribbot auth before reading token safety", async () => {
    const response = await postTradingBotTokenSafety(
      requestJson(
        validSafetyBody,
        undefined,
        "/api/frogx/trading-bot/token-safety",
      ),
      {} as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["RIBBOT_TRADING_BOT_TOKEN"],
    });
  });

  it("reports missing Solana RPC configuration after auth passes", async () => {
    const response = await postTradingBotTokenSafety(
      requestJson(
        validSafetyBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/token-safety",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["SOLANA_RPC_URL"],
    });
  });

  it("returns high-risk flags for enabled mint and freeze authorities", async () => {
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "https://rpc.example") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          method?: string;
        };
        expect(body.method).toBe("getAccountInfo");
        return Response.json({
          result: {
            value: {
              owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
              executable: false,
              lamports: 1_461_600,
              data: {
                parsed: {
                  type: "mint",
                  info: {
                    mintAuthority: "Auth111111111111111111111111111111111111",
                    supply: "1000000000000",
                    decimals: 6,
                    isInitialized: true,
                    freezeAuthority: "Freeze111111111111111111111111111111111",
                  },
                },
              },
            },
          },
        });
      }
      if (url.startsWith("https://api.jup.ag/price/v3")) {
        return Response.json({
          [validSafetyBody.mint]: {
            usdPrice: 2.5,
            decimals: 6,
            priceChange24h: -12.5,
          },
        });
      }
      return Response.json({ error: "unexpected fetch" }, { status: 500 });
    }) as unknown as typeof fetch;

    const response = await postTradingBotTokenSafety(
      requestJson(
        validSafetyBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/token-safety",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        SOLANA_RPC_URL: "https://rpc.example",
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      mintAccount: {
        decimals: number;
        supply: string;
        mintAuthority: string | null;
        freezeAuthority: string | null;
      };
      pricing: { usdPrice: number | null; priced: boolean };
      risk: {
        level: string;
        score: number;
        flags: Array<{ code: string; severity: string; message: string }>;
      };
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("ready");
    expect(data.mintAccount).toMatchObject({
      decimals: 6,
      supply: "1000000000000",
      mintAuthority: "Auth111111111111111111111111111111111111",
      freezeAuthority: "Freeze111111111111111111111111111111111",
    });
    expect(data.pricing).toMatchObject({ usdPrice: 2.5, priced: true });
    expect(data.risk.level).toBe("high");
    expect(data.risk.score).toBe(30);
    expect(data.risk.flags.map((flag) => flag.code)).toEqual(
      expect.arrayContaining([
        "mint_authority_enabled",
        "freeze_authority_enabled",
        "jupiter_price_available",
      ]),
    );
    expect(data.warnings.join(" ")).toContain("supply can be increased");
    expect(data.warnings.join(" ")).toContain("token accounts can be frozen");
  });

  it("returns not_found when the mint account is absent", async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url === "https://rpc.example") {
        return Response.json({ result: { value: null } });
      }
      if (url.startsWith("https://api.jup.ag/price/v3")) {
        return Response.json({});
      }
      return Response.json({ error: "unexpected fetch" }, { status: 500 });
    }) as unknown as typeof fetch;

    const response = await postTradingBotTokenSafety(
      requestJson(
        validSafetyBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/token-safety",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        SOLANA_RPC_URL: "https://rpc.example",
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      risk: { level: string; flags: Array<{ code: string }> };
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("not_found");
    expect(data.risk.level).toBe("unknown");
    expect(data.risk.flags[0].code).toBe("mint_account_not_found");
  });
});

describe("trading bot market risk", () => {
  const validRiskBody = {
    telegramUserId: "123456",
    userPublicKey: "11111111111111111111111111111111",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    amountIn: "100000000",
    minLiquidityUsd: 1000,
    maxMarketCapUsd: 1000,
    maxPriceImpactBps: 500,
  };

  it("requires Ribbot auth before reviewing market risk", async () => {
    const response = await postTradingBotMarketRisk(
      requestJson(
        validRiskBody,
        undefined,
        "/api/frogx/trading-bot/market-risk",
      ),
      {} as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["RIBBOT_TRADING_BOT_TOKEN"],
    });
  });

  it("reports missing Solana RPC configuration after auth passes", async () => {
    const response = await postTradingBotMarketRisk(
      requestJson(
        validRiskBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/market-risk",
      ),
      { RIBBOT_TRADING_BOT_TOKEN: "ribbot-token" } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["SOLANA_RPC_URL"],
    });
  });

  it("combines token safety, market cap, and unavailable quote-probe flags", async () => {
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "https://rpc.example") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          method?: string;
        };
        expect(body.method).toBe("getAccountInfo");
        return Response.json({
          result: {
            value: {
              owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
              executable: false,
              lamports: 1_461_600,
              data: {
                parsed: {
                  type: "mint",
                  info: {
                    mintAuthority: null,
                    supply: "1000000000",
                    decimals: 6,
                    isInitialized: true,
                    freezeAuthority: null,
                  },
                },
              },
            },
          },
        });
      }
      if (url.startsWith("https://api.jup.ag/price/v3")) {
        const ids = new URL(url).searchParams.get("ids") ?? "";
        return Response.json({
          ...(ids.includes(validRiskBody.mint)
            ? {
                [validRiskBody.mint]: {
                  usdPrice: 2.5,
                  decimals: 6,
                  priceChange24h: 4.2,
                },
              }
            : {}),
          ...(ids.includes("So11111111111111111111111111111111111111112")
            ? {
                So11111111111111111111111111111111111111112: {
                  usdPrice: 100,
                  decimals: 9,
                },
              }
            : {}),
        });
      }
      return Response.json({ error: "unexpected fetch" }, { status: 500 });
    }) as unknown as typeof fetch;

    const response = await postTradingBotMarketRisk(
      requestJson(
        validRiskBody,
        { Authorization: "Bearer ribbot-token" },
        "/api/frogx/trading-bot/market-risk",
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        SOLANA_RPC_URL: "https://rpc.example",
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      marketCap: { usd: number | null; withinLimit: boolean | null };
      quoteProbe: {
        status: string;
        required?: string[];
        amountInUsd?: number | null;
      };
      risk: {
        level: string;
        flags: Array<{ code: string; severity: string }>;
      };
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("ready");
    expect(data.marketCap.usd).toBe(2500);
    expect(data.marketCap.withinLimit).toBe(false);
    expect(data.quoteProbe).toMatchObject({
      status: "not_configured",
      required: ["TITAN_TOKEN"],
    });
    expect(data.quoteProbe.amountInUsd).toBe(1000);
    expect(data.risk.level).toBe("high");
    expect(data.risk.flags.map((flag) => flag.code)).toEqual(
      expect.arrayContaining([
        "mint_authority_disabled",
        "freeze_authority_disabled",
        "market_cap_above_limit",
        "quote_probe_not_configured",
      ]),
    );
    expect(data.warnings.join(" ")).toContain("market cap is above");
    expect(data.warnings.join(" ")).toContain("quote probing requires Titan");
  });
});

describe("trading bot PNL", () => {
  it("requires Ribbot auth before reading PNL cards", async () => {
    const response = await getTradingBotPnl(
      new Request(
        "https://frogx.example/api/frogx/trading-bot/pnl?telegramUserId=123456",
      ),
      {} as Env,
    );
    const data = (await response.json()) as {
      status: string;
      required: string[];
    };

    expect(response.status).toBe(503);
    expect(data).toEqual({
      status: "not_configured",
      required: ["RIBBOT_TRADING_BOT_TOKEN"],
    });
  });

  it("returns estimated PNL from account events, live positions, and Jupiter prices", async () => {
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "https://rpc.example") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          method?: string;
        };
        if (body.method === "getBalance") {
          return Response.json({ result: { value: 2_000_000_000 } });
        }
        if (body.method === "getTokenAccountsByOwner") {
          return Response.json({
            result: {
              value: [
                {
                  pubkey: "TokenAcct1111111111111111111111111111111111",
                  account: {
                    data: {
                      parsed: {
                        info: {
                          mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                          tokenAmount: {
                            amount: "5000000",
                            decimals: 6,
                            uiAmount: 5,
                            uiAmountString: "5",
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
          });
        }
        if (body.method === "getTransaction") {
          return Response.json({
            result: {
              transaction: {
                message: {
                  accountKeys: ["11111111111111111111111111111111"],
                },
              },
              meta: {
                err: null,
                fee: 5_000,
                preBalances: [2_000_000_000],
                postBalances: [1_000_000_000],
                preTokenBalances: [],
                postTokenBalances: [],
              },
            },
          });
        }
      }
      if (url.startsWith("https://api.jup.ag/price/v3")) {
        expect(url).toContain("So11111111111111111111111111111111111111112");
        expect(url).toContain("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
        return Response.json({
          So11111111111111111111111111111111111111112: {
            usdPrice: 100,
            decimals: 9,
            priceChange24h: 1,
          },
          EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
            usdPrice: 2,
            decimals: 6,
            priceChange24h: -5,
          },
        });
      }
      return Response.json({ error: "unexpected fetch" }, { status: 500 });
    });

    const response = await getTradingBotPnl(
      new Request(
        "https://frogx.example/api/frogx/trading-bot/pnl?telegramUserId=123456",
        {
          headers: { Authorization: "Bearer ribbot-token" },
        },
      ),
      {
        RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
        SOLANA_RPC_URL: "https://rpc.example",
        TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts((request) => {
          const url = new URL(request.url);
          if (url.pathname === "/account") {
            return Response.json({
              status: "ready",
              account: storedAccount({
                walletSource: "privy",
                privyWalletId: "wallet_123",
              }),
            });
          }
          if (url.pathname === "/events") {
            return Response.json({
              status: "ready",
              events: [
                {
                  telegramUserId: "123456",
                  eventId: "event-1",
                  eventType: "swap_executed",
                  metadata: {
                    inMint: "So11111111111111111111111111111111111111112",
                    outMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                    amountIn: "1000000000",
                    estimatedAmountOut: "4000000",
                    signature: "5xSwapSignature",
                    solscanUrl: "https://solscan.io/tx/5xSwapSignature",
                  },
                  createdAt: "2026-07-04T00:01:00.000Z",
                },
              ],
            });
          }
          return Response.json(
            { error: "unexpected store path" },
            { status: 500 },
          );
        }),
      } as Env,
    );
    const data = (await response.json()) as {
      status: string;
      totals: {
        solValueUsd: number | null;
        currentTokenValueUsd: number | null;
        estimatedCostUsd: number | null;
        unrealizedPnlUsd: number | null;
        confirmedFillCount: number;
        estimatedFillCount: number;
      };
      tokens: Array<{
        mint: string;
        currentValueUsd: number | null;
        estimatedCostUsd: number | null;
        unrealizedPnlUsd: number | null;
        costBasisStatus: string;
      }>;
      recentExecutions: Array<{
        signature: string | null;
        side: string;
        fillStatus: string;
      }>;
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("ready");
    expect(data.totals.solValueUsd).toBe(200);
    expect(data.totals.currentTokenValueUsd).toBe(10);
    expect(data.totals.estimatedCostUsd).toBe(100);
    expect(data.totals.unrealizedPnlUsd).toBe(-90);
    expect(data.totals.confirmedFillCount).toBe(0);
    expect(data.totals.estimatedFillCount).toBe(1);
    expect(data.tokens[0]).toMatchObject({
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      currentValueUsd: 10,
      estimatedCostUsd: 100,
      unrealizedPnlUsd: -90,
      costBasisStatus: "estimated",
    });
    expect(data.recentExecutions[0]).toMatchObject({
      signature: "5xSwapSignature",
      side: "buy",
      fillStatus: "estimated",
    });
    expect(data.warnings.join(" ")).toContain("1 still use execution metadata");
  });

  it("indexes confirmed Solana fills once and uses exact net SOL flow", async () => {
    const walletAddress = "11111111111111111111111111111111";
    const tokenMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const tokenAccount = "TokenAcct1111111111111111111111111111111111";
    const sourceEvents = [
      {
        telegramUserId: "123456",
        eventId: "sell-event",
        eventType: "swap_executed",
        metadata: {
          walletAddress,
          inMint: tokenMint,
          outMint: "So11111111111111111111111111111111111111112",
          amountIn: "3500000",
          estimatedAmountOut: "600000000",
          signature: "5xConfirmedSellSignature",
          solscanUrl: "https://solscan.io/tx/5xConfirmedSellSignature",
        },
        createdAt: "2026-07-04T00:02:00.000Z",
      },
      {
        telegramUserId: "123456",
        eventId: "buy-event",
        eventType: "swap_executed",
        metadata: {
          walletAddress,
          inMint: "So11111111111111111111111111111111111111112",
          outMint: tokenMint,
          amountIn: "1200000000",
          estimatedAmountOut: "4000000",
          signature: "5xConfirmedBuySignature",
          solscanUrl: "https://solscan.io/tx/5xConfirmedBuySignature",
        },
        createdAt: "2026-07-04T00:01:00.000Z",
      },
    ];
    const persistedEvents: Array<{
      telegramUserId: string;
      eventId: string;
      eventType: string;
      metadata: Record<string, unknown>;
      createdAt: string;
    }> = [];
    let getTransactionCalls = 0;

    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "https://rpc.example") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          method?: string;
          params?: unknown[];
        };
        if (body.method === "getBalance") {
          return Response.json({ result: { value: 2_000_000_000 } });
        }
        if (body.method === "getTokenAccountsByOwner") {
          return Response.json({
            result: {
              value: [
                {
                  pubkey: tokenAccount,
                  account: {
                    data: {
                      parsed: {
                        info: {
                          mint: tokenMint,
                          tokenAmount: {
                            amount: "1000000",
                            decimals: 6,
                            uiAmount: 1,
                            uiAmountString: "1",
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
          });
        }
        if (body.method === "getTransaction") {
          getTransactionCalls += 1;
          const signature = body.params?.[0];
          if (signature === "5xConfirmedBuySignature") {
            return Response.json({
              result: {
                slot: 100,
                blockTime: 1_780_000_000,
                transaction: {
                  message: { accountKeys: [walletAddress, tokenAccount] },
                },
                meta: {
                  err: null,
                  fee: 5_000,
                  preBalances: [5_000_000_000, 0],
                  postBalances: [3_997_955_720, 2_039_280],
                  preTokenBalances: [],
                  postTokenBalances: [
                    {
                      accountIndex: 1,
                      mint: tokenMint,
                      owner: walletAddress,
                      uiTokenAmount: {
                        amount: "4500000",
                        decimals: 6,
                        uiAmount: 4.5,
                        uiAmountString: "4.5",
                      },
                    },
                  ],
                },
              },
            });
          }
          if (signature === "5xConfirmedSellSignature") {
            return Response.json({
              result: {
                slot: 101,
                blockTime: 1_780_000_060,
                transaction: {
                  message: { accountKeys: [walletAddress, tokenAccount] },
                },
                meta: {
                  err: null,
                  fee: 5_000,
                  preBalances: [3_000_000_000, 2_039_280],
                  postBalances: [3_799_995_000, 2_039_280],
                  preTokenBalances: [
                    {
                      accountIndex: 1,
                      mint: tokenMint,
                      owner: walletAddress,
                      uiTokenAmount: {
                        amount: "4500000",
                        decimals: 6,
                        uiAmount: 4.5,
                        uiAmountString: "4.5",
                      },
                    },
                  ],
                  postTokenBalances: [
                    {
                      accountIndex: 1,
                      mint: tokenMint,
                      owner: walletAddress,
                      uiTokenAmount: {
                        amount: "1000000",
                        decimals: 6,
                        uiAmount: 1,
                        uiAmountString: "1",
                      },
                    },
                  ],
                },
              },
            });
          }
        }
      }
      if (url.startsWith("https://api.jup.ag/price/v3")) {
        return Response.json({
          So11111111111111111111111111111111111111112: {
            usdPrice: 100,
            decimals: 9,
          },
          [tokenMint]: { usdPrice: 2, decimals: 6 },
        });
      }
      return Response.json({ error: "unexpected fetch" }, { status: 500 });
    });

    const env = {
      RIBBOT_TRADING_BOT_TOKEN: "ribbot-token",
      SOLANA_RPC_URL: "https://rpc.example",
      TRADING_BOT_ACCOUNTS: fakeTradingBotAccounts(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/account") {
          return Response.json({
            status: "ready",
            account: storedAccount({
              walletSource: "privy",
              privyWalletId: "wallet_123",
              solanaWalletAddress: walletAddress,
            }),
          });
        }
        if (url.pathname === "/events") {
          return Response.json({
            status: "ready",
            events: [...persistedEvents, ...sourceEvents],
          });
        }
        if (url.pathname === "/event" && request.method === "POST") {
          const body = (await request.json()) as {
            telegramUserId: string;
            eventId: string;
            eventType: string;
            metadata: Record<string, unknown>;
          };
          const existing = persistedEvents.find(
            (event) => event.eventId === body.eventId,
          );
          const event =
            existing ??
            ({
              ...body,
              createdAt: "2026-07-10T12:00:00.000Z",
            } satisfies (typeof persistedEvents)[number]);
          if (!existing) persistedEvents.unshift(event);
          return Response.json({ status: "ready", event });
        }
        return Response.json(
          { error: "unexpected store path" },
          { status: 500 },
        );
      }),
    } as Env;
    const requestPnl = () =>
      getTradingBotPnl(
        new Request(
          "https://frogx.example/api/frogx/trading-bot/pnl?telegramUserId=123456",
          { headers: { Authorization: "Bearer ribbot-token" } },
        ),
        env,
      );

    const firstResponse = await requestPnl();
    const first = (await firstResponse.json()) as {
      executionAccounting: {
        amountSemantics: string;
        totalSwapExecutions: number;
        confirmedFillCount: number;
        estimatedFillCount: number;
        attemptedThisRequest: number;
        reconciledThisRequest: number;
      };
      totals: {
        estimatedCostUsd: number | null;
        unrealizedPnlUsd: number | null;
        confirmedFillCount: number;
        estimatedFillCount: number;
      };
      tokens: Array<{
        costBasisStatus: string;
        confirmedFillCount: number;
        estimatedFillCount: number;
      }>;
      recentExecutions: Array<{
        signature: string | null;
        fillStatus: string;
        amountIn: string | null;
        amountOut: string | null;
      }>;
      warnings: string[];
    };

    expect(firstResponse.status).toBe(200);
    expect(first.executionAccounting).toMatchObject({
      amountSemantics: "wallet_asset_delta_excluding_network_fee",
      totalSwapExecutions: 2,
      confirmedFillCount: 2,
      estimatedFillCount: 0,
      attemptedThisRequest: 2,
      reconciledThisRequest: 2,
    });
    expect(first.totals).toMatchObject({
      estimatedCostUsd: 20,
      unrealizedPnlUsd: -18,
      confirmedFillCount: 2,
      estimatedFillCount: 0,
    });
    expect(first.tokens[0]).toMatchObject({
      costBasisStatus: "confirmed_net_flow",
      confirmedFillCount: 2,
      estimatedFillCount: 0,
    });
    expect(first.recentExecutions[0]).toMatchObject({
      signature: "5xConfirmedSellSignature",
      fillStatus: "confirmed",
      amountIn: "3500000",
      amountOut: "800000000",
    });
    expect(first.warnings.join(" ")).toContain("All 2 FTX swap fills");
    expect(persistedEvents).toHaveLength(2);
    expect(
      persistedEvents.find(
        (event) => event.metadata.sourceEventId === "buy-event",
      )?.metadata,
    ).toMatchObject({
      amountSemantics: "wallet_asset_delta_excluding_network_fee",
      amountIn: "1000000000",
      amountOut: "4500000",
      networkFeeLamports: "5000",
      walletPaidNetworkFee: true,
    });
    expect(
      persistedEvents.find(
        (event) => event.metadata.sourceEventId === "sell-event",
      )?.metadata,
    ).toMatchObject({ amountOut: "800000000" });
    expect(getTransactionCalls).toBe(2);

    const secondResponse = await requestPnl();
    const second = (await secondResponse.json()) as {
      executionAccounting: {
        attemptedThisRequest: number;
        reconciledThisRequest: number;
        confirmedFillCount: number;
      };
    };
    expect(secondResponse.status).toBe(200);
    expect(second.executionAccounting).toMatchObject({
      attemptedThisRequest: 0,
      reconciledThisRequest: 0,
      confirmedFillCount: 2,
    });
    expect(getTransactionCalls).toBe(2);
    expect(persistedEvents).toHaveLength(2);
  });
});
