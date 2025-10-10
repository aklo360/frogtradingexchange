const DEFAULT_API_ORIGIN = "https://frogx-api.aklo.workers.dev";

const methodHasBody = (method) => {
  const upper = method.toUpperCase();
  return upper !== "GET" && upper !== "HEAD";
};

const cloneHeaders = (headers) => {
  const copy = new Headers();
  headers.forEach((value, key) => {
    if (key.toLowerCase() === "host") return;
    copy.set(key, value);
  });
  return copy;
};

const proxyFetch = async (request, target) => {
  const init = {
    method: request.method,
    headers: cloneHeaders(request.headers),
    redirect: request.redirect,
  };

  if (methodHasBody(request.method)) {
    init.body = await request.arrayBuffer();
  }

  return fetch(target, init);
};

const getNextWorker = async () => {
  const mod = await import("./.vercel/output/static/_worker.js");
  return mod.default ?? mod;
};

export default {
  async fetch(request, env, ctx) {
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
      return proxyFetch(request, rpcUrl);
    }

    const nextWorker = await getNextWorker();
    return nextWorker.fetch(request, env, ctx);
  },
};
