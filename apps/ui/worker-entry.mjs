const DEFAULT_API_ORIGIN = "https://frogx-api.aklo.workers.dev";
const isPagesApiRoute = (pathname) =>
  pathname === "/api/tapestry" || pathname.startsWith("/api/tapestry/");

const methodHasBody = (method) => {
  const upper = method.toUpperCase();
  return upper !== "GET" && upper !== "HEAD";
};

const cloneHeaders = (headers) => {
  const copy = new Headers();
  const skipped = new Set([
    "host",
    "content-length",
    "connection",
    "cf-connecting-ip",
    "cf-ipcountry",
    "cf-ray",
    "cf-visitor",
    "cdn-loop",
  ]);
  headers.forEach((value, key) => {
    if (skipped.has(key.toLowerCase())) return;
    copy.set(key, value);
  });
  return copy;
};

const proxyFetch = async (request, target) => {
  const body = methodHasBody(request.method)
    ? await request.arrayBuffer()
    : undefined;
  const execute = () =>
    fetch(target, {
      method: request.method,
      headers: cloneHeaders(request.headers),
      redirect: request.redirect,
      body: body?.slice(0),
    });

  try {
    return await execute();
  } catch (firstError) {
    console.error("[api-proxy] upstream request failed; retrying", firstError);
    try {
      return await execute();
    } catch (secondError) {
      console.error("[api-proxy] upstream retry failed", secondError);
      return Response.json(
        { error: "FTX API is temporarily unavailable" },
        { status: 502 },
      );
    }
  }
};

const getNextWorker = async () => {
  const mod = await import("./.vercel/output/static/_worker.js");
  return mod.default ?? mod;
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/") && !isPagesApiRoute(url.pathname)) {
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
