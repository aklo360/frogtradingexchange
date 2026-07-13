import type { Env } from "./env";
import {
  getAirdrop,
  getAirdropEligibility,
  getAirdropExport,
  AirdropCoordinator,
  postAirdropChallenge,
  postAirdropClaim,
  postAirdropFinalize,
  postAirdropPayout,
  runAirdropPayout,
} from "./airdrop";
import { runBuyback } from "./buyback";
import { getNftHoldings } from "./nftHoldings";
import {
  getBuyback,
  getInfo,
  postBuybackBurn,
  postBuybackExecute,
  postQuotes,
  postSwap,
} from "./routes";
import {
  getTradingBotAccount,
  getTradingBotActivity,
  getTradingBotAutoBuyConfigs,
  getTradingBotAutoSellConfigs,
  getTradingBotBundleBuyConfigs,
  getTradingBotConfig,
  getTradingBotOrders,
  getTradingBotOperatorReviews,
  getTradingBotNfts,
  getTradingBotPnl,
  getTradingBotReferrals,
  postTradingBotControlCode,
  postTradingBotControlPreference,
  postTradingBotControlSession,
  postTradingBotControlWallet,
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
  runTradingBotAdvancedAutomationMonitors,
  runTradingBotScheduledOrders,
  TradingBotAccountStore,
} from "./tradingBot";

const methodHasBody = (method: string) => {
  const upper = method.toUpperCase();
  return upper !== "GET" && upper !== "HEAD";
};

const cloneHeaders = (headers: Headers) => {
  const copy = new Headers();
  headers.forEach((value, key) => {
    if (key.toLowerCase() === "host") return;
    copy.set(key, value);
  });
  return copy;
};

/**
 * Proxies Solana JSON-RPC requests to the configured RPC endpoint.
 * SECURITY: Only allows whitelisted RPC methods to prevent abuse.
 */
async function proxyRpc(request: Request, env: Env): Promise<Response> {
  const rpcUrl = (env as unknown as { SOLANA_RPC_URL?: string }).SOLANA_RPC_URL;
  if (!rpcUrl) {
    return new Response(JSON.stringify({ error: "RPC not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Only allow POST for JSON-RPC
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse and validate the RPC request
  let rpcBody: {
    method?: string;
    params?: unknown;
    id?: unknown;
    jsonrpc?: string;
  };
  try {
    rpcBody = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // SECURITY: Whitelist allowed RPC methods to prevent abuse
  const allowedMethods = new Set([
    // Read-only account/balance queries
    "getAccountInfo",
    "getBalance",
    "getTokenAccountBalance",
    "getTokenAccountsByOwner",
    "getMultipleAccounts",
    // Transaction queries
    "getTransaction",
    "getSignatureStatuses",
    "getSignaturesForAddress",
    "getLatestBlockhash",
    "getRecentPrioritizationFees",
    // Block/slot queries
    "getSlot",
    "getBlockHeight",
    "getEpochInfo",
    // Transaction submission
    "sendTransaction",
    "simulateTransaction",
    // Health checks
    "getHealth",
    "getVersion",
  ]);

  const method = rpcBody?.method;
  if (!method || !allowedMethods.has(method)) {
    return new Response(
      JSON.stringify({ error: "RPC method not allowed", method }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  // Forward the validated request
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rpcBody),
  });

  // Return the RPC response with appropriate headers
  const responseBody = await response.text();
  return new Response(responseBody, {
    status: response.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/frogx/info" && request.method === "GET") {
      return getInfo(env);
    }
    if (
      (url.pathname === "/api/frogx/airdrop" ||
        url.pathname === "/api/frogx/airdrop/config" ||
        url.pathname === "/api/frogx/airdrop/status") &&
      request.method === "GET"
    ) {
      return getAirdrop(request, env);
    }
    if (
      url.pathname === "/api/frogx/airdrop/eligibility" &&
      request.method === "GET"
    ) {
      return getAirdropEligibility(request, env);
    }
    if (
      url.pathname === "/api/frogx/airdrop/challenge" &&
      request.method === "POST"
    ) {
      return postAirdropChallenge(request, env);
    }
    if (
      url.pathname === "/api/frogx/airdrop/claim" &&
      request.method === "POST"
    ) {
      return postAirdropClaim(request, env);
    }
    if (
      url.pathname === "/api/frogx/airdrop/finalize" &&
      request.method === "POST"
    ) {
      return postAirdropFinalize(request, env);
    }
    if (
      url.pathname === "/api/frogx/airdrop/payout" &&
      request.method === "POST"
    ) {
      return postAirdropPayout(request, env);
    }
    if (
      url.pathname === "/api/frogx/airdrop/export" &&
      request.method === "GET"
    ) {
      return getAirdropExport(request, env);
    }
    if (url.pathname === "/api/frogx/buyback" && request.method === "GET") {
      return getBuyback(env);
    }
    if (url.pathname === "/api/frogx/nfts" && request.method === "GET") {
      return getNftHoldings(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/config" &&
      request.method === "GET"
    ) {
      return getTradingBotConfig(env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/account" &&
      request.method === "GET"
    ) {
      return getTradingBotAccount(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/activity" &&
      request.method === "GET"
    ) {
      return getTradingBotActivity(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/operator/reviews" &&
      request.method === "GET"
    ) {
      return getTradingBotOperatorReviews(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/operator/reviews/acknowledge" &&
      request.method === "POST"
    ) {
      return postTradingBotOperatorReviewAcknowledge(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/operator/reviews/reconcile" &&
      request.method === "POST"
    ) {
      return postTradingBotOperatorReviewReconcile(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/pnl" &&
      request.method === "GET"
    ) {
      return getTradingBotPnl(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/nfts" &&
      request.method === "GET"
    ) {
      return getTradingBotNfts(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/referrals" &&
      request.method === "GET"
    ) {
      return getTradingBotReferrals(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/referrals" &&
      request.method === "POST"
    ) {
      return postTradingBotReferral(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/control/code" &&
      request.method === "POST"
    ) {
      return postTradingBotControlCode(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/control/session" &&
      request.method === "POST"
    ) {
      return postTradingBotControlSession(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/control/preferences" &&
      request.method === "POST"
    ) {
      return postTradingBotControlPreference(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/control/wallet" &&
      request.method === "POST"
    ) {
      return postTradingBotControlWallet(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/wallet" &&
      request.method === "POST"
    ) {
      return postTradingBotWallet(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/swap" &&
      request.method === "POST"
    ) {
      return postTradingBotSwap(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/execute" &&
      request.method === "POST"
    ) {
      return postTradingBotExecution(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/execute/status" &&
      request.method === "POST"
    ) {
      return postTradingBotExecutionStatus(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/positions" &&
      request.method === "POST"
    ) {
      return postTradingBotPositions(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/token-cleanup/review" &&
      request.method === "POST"
    ) {
      return postTradingBotTokenCleanupReview(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/token-safety" &&
      request.method === "POST"
    ) {
      return postTradingBotTokenSafety(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/market-risk" &&
      request.method === "POST"
    ) {
      return postTradingBotMarketRisk(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/orders/validate" &&
      request.method === "POST"
    ) {
      return postTradingBotOrderValidation(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/orders" &&
      request.method === "POST"
    ) {
      return postTradingBotOrderStorage(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/orders" &&
      request.method === "GET"
    ) {
      return getTradingBotOrders(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/orders/cancel" &&
      request.method === "POST"
    ) {
      return postTradingBotOrderCancel(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/withdrawals/validate" &&
      request.method === "POST"
    ) {
      return postTradingBotWithdrawalValidation(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/withdrawals/execute" &&
      request.method === "POST"
    ) {
      return postTradingBotWithdrawalExecution(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/withdrawals/status" &&
      request.method === "POST"
    ) {
      return postTradingBotWithdrawalExecutionStatus(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/copytrade/validate" &&
      request.method === "POST"
    ) {
      return postTradingBotCopyTradeValidation(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/copytrade" &&
      request.method === "POST"
    ) {
      return postTradingBotCopyTradeStorage(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/copytrade" &&
      request.method === "GET"
    ) {
      return getTradingBotCopyTradeConfigs(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/copytrade/cancel" &&
      request.method === "POST"
    ) {
      return postTradingBotCopyTradeCancel(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/copytrade/control" &&
      request.method === "POST"
    ) {
      return postTradingBotCopyTradeControl(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/copytrade/update" &&
      request.method === "POST"
    ) {
      return postTradingBotCopyTradeUpdate(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/copytrade/duplicate" &&
      request.method === "POST"
    ) {
      return postTradingBotCopyTradeDuplicate(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/copytrade/status" &&
      request.method === "POST"
    ) {
      return postTradingBotCopyTradeExecutionStatus(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/sniper/validate" &&
      request.method === "POST"
    ) {
      return postTradingBotSniperValidation(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/sniper" &&
      request.method === "POST"
    ) {
      return postTradingBotSniperStorage(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/sniper" &&
      request.method === "GET"
    ) {
      return getTradingBotSniperConfigs(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/sniper/cancel" &&
      request.method === "POST"
    ) {
      return postTradingBotSniperCancel(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/sniper/status" &&
      request.method === "POST"
    ) {
      return postTradingBotSniperExecutionStatus(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/auto-buy/validate" &&
      request.method === "POST"
    ) {
      return postTradingBotAutoBuyValidation(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/auto-buy" &&
      request.method === "POST"
    ) {
      return postTradingBotAutoBuyStorage(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/auto-buy" &&
      request.method === "GET"
    ) {
      return getTradingBotAutoBuyConfigs(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/auto-buy/cancel" &&
      request.method === "POST"
    ) {
      return postTradingBotAutoBuyCancel(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/auto-buy/status" &&
      request.method === "POST"
    ) {
      return postTradingBotAutoBuyExecutionStatus(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/bundle-buy/validate" &&
      request.method === "POST"
    ) {
      return postTradingBotBundleBuyValidation(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/bundle-buy" &&
      request.method === "POST"
    ) {
      return postTradingBotBundleBuyStorage(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/bundle-buy" &&
      request.method === "GET"
    ) {
      return getTradingBotBundleBuyConfigs(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/bundle-buy/cancel" &&
      request.method === "POST"
    ) {
      return postTradingBotBundleBuyCancel(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/bundle-buy/execute" &&
      request.method === "POST"
    ) {
      return postTradingBotBundleBuyExecution(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/bundle-buy/status" &&
      request.method === "POST"
    ) {
      return postTradingBotBundleBuyExecutionStatus(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/auto-sell/validate" &&
      request.method === "POST"
    ) {
      return postTradingBotAutoSellValidation(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/auto-sell" &&
      request.method === "POST"
    ) {
      return postTradingBotAutoSellStorage(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/auto-sell" &&
      request.method === "GET"
    ) {
      return getTradingBotAutoSellConfigs(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/auto-sell/cancel" &&
      request.method === "POST"
    ) {
      return postTradingBotAutoSellCancel(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/auto-sell/status" &&
      request.method === "POST"
    ) {
      return postTradingBotAutoSellExecutionStatus(request, env);
    }
    if (
      url.pathname === "/api/frogx/trading-bot/preferences/validate" &&
      request.method === "POST"
    ) {
      return postTradingBotPreferenceValidation(request, env);
    }
    if (
      url.pathname === "/api/frogx/buyback/execute" &&
      request.method === "POST"
    ) {
      return postBuybackExecute(request, env);
    }
    if (
      url.pathname === "/api/frogx/buyback/burn" &&
      request.method === "POST"
    ) {
      return postBuybackBurn(request, env);
    }
    if (url.pathname === "/api/frogx/quotes" && request.method === "POST") {
      return postQuotes(request, env);
    }
    if (url.pathname === "/api/frogx/swap" && request.method === "POST") {
      return postSwap(request, env);
    }
    // Dev convenience: proxy JSON-RPC during local Next.js rewrites
    if (url.pathname === "/rpc") {
      return proxyRpc(request, env);
    }
    return new Response("Not found", { status: 404 });
  },
  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(runBuyback(env));
    ctx.waitUntil(runAirdropPayout(env));
    ctx.waitUntil(runTradingBotScheduledOrders(env));
    ctx.waitUntil(runTradingBotAdvancedAutomationMonitors(env));
  },
} satisfies ExportedHandler<Env>;

export { AirdropCoordinator, TradingBotAccountStore };
