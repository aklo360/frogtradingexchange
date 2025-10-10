import type { ExecutionContext } from "@cloudflare/workers-types";
import nextWorker from "./.vercel/output/static/_worker.js";

const DEFAULT_API_ORIGIN = "https://frogx-api.aklo.workers.dev";

const methodHasBody = (method: string) => {
  const upper = method.toUpperCase();
  return upper !== "GET" && upper !== "HEAD";
};

const cloneHeaders = (original: Headers) => {
  const headers = new Headers();
  original.forEach((value, key) => {
    if (key.toLowerCase() === "host") return;
    headers.set(key, value);
  });
  return headers;
};

const proxyFetch = async (request: Request, target: string) => {
  const init: RequestInit = {
    method: request.method,
    headers: cloneHeaders(request.headers),
    redirect: request.redirect,
  };

  if (methodHasBody(request.method)) {
    init.body = await request.arrayBuffer();
  }

  return fetch(target, init);
};

export default {
  async fetch(request: Request, env: Record<string, string>, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const apiOrigin = env.API_ORIGIN ?? DEFAULT_API_ORIGIN;
      const target = new URL(apiOrigin);
      target.pathname = url.pathname;
      target.search = url.search;
      return proxyFetch(request, target.toString());
    }

    if (url.pathname === "/rpc") {
      const rpcUrl = env.SOLANA_RPC_URL ?? env.SOLANA_RPC_ENDPOINT;
      if (!rpcUrl) {
        return new Response("SOLANA_RPC_URL not configured", { status: 500 });
      }
      const target = new URL(rpcUrl);
      target.search = url.search;
      return proxyFetch(request, target.toString());
    }

    return nextWorker.fetch(request, env, ctx);
  },
};

export type {};
