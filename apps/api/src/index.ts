import type { Env } from "./env";
import { getInfo, postQuotes, postSwap } from "./routes";

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

async function proxyRpc(request: Request, env: Env): Promise<Response> {
  const rpcUrl = (env as unknown as { SOLANA_RPC_URL?: string }).SOLANA_RPC_URL;
  if (!rpcUrl) {
    return new Response("SOLANA_RPC_URL not configured", { status: 500 });
  }
  const init: RequestInit = {
    method: request.method,
    headers: cloneHeaders(request.headers),
    redirect: request.redirect,
  };
  if (methodHasBody(request.method)) {
    init.body = await request.arrayBuffer();
  }
  return fetch(rpcUrl, init);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/frogx/info" && request.method === "GET") {
      return getInfo(env);
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
} satisfies ExportedHandler<Env>;
