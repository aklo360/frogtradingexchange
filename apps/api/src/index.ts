import type { Env } from "./env";
import { runBuyback } from "./buyback";
import {
  getBuyback,
  getInfo,
  postBuybackBurn,
  postBuybackExecute,
  postQuotes,
  postSwap,
} from "./routes";

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
  let rpcBody: { method?: string; params?: unknown; id?: unknown; jsonrpc?: string };
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
      { status: 403, headers: { "Content-Type": "application/json" } }
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
    if (url.pathname === "/api/frogx/buyback" && request.method === "GET") {
      return getBuyback(env);
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
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runBuyback(env));
  },
} satisfies ExportedHandler<Env>;
