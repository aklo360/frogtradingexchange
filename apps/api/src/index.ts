import type { Env } from "./env";
import { getInfo, postQuotes, postSwap } from "./routes";

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
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
