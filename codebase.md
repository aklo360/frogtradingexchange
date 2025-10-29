# .gitignore

```
# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# dependencies
/node_modules
/.pnp
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# env files (can opt-in for committing if needed)
.env*
!.env.example

# vercel
.vercel
.wrangler/
apps/*/.wrangler/

# typescript
*.tsbuildinfo
next-env.d.ts

# workspace caches
/apps/*/.next/
/apps/*/node_modules/

```

# AGENTS.md

```md
# Frog Trading Exchange — Engineering Guidelines

## 1. Monorepo Overview

### Directory Layout

\`\`\`
apps/
  api/                          # Cloudflare Worker (Wrangler)
    package.json
    wrangler.toml
    src/
      env.ts                    # Environment variable parsing + validation
      routes.ts                 # REST handlers for /info, /quotes, /swap
      titan.ts                  # Titan WebSocket client + quote normalization
  ui/                           # Next.js 15 App Router frontend
    package.json
    next.config.ts              # Loads root env files, dev rewrites
    worker-entry.mjs            # Pages worker proxy for /api/* and /rpc
    public/
      logo.png                  # Header mark (840x40)
      sbficon.png               # Pixel frog used for favicon + branding
      favicon.{ico,png}
      sparkle.svg               # Generic pixel sparkle
      swap.svg                  # Pixel swap glyph used for nav
      trophy.svg                # Pixel trophy used for leaderboard nav
      wallet.svg                # Pixel wallet used for hamburger menu
      sticker/                  # Header webm loops
    src/
      app/
        layout.tsx              # Root layout + font wiring
        page.tsx                # Landing page, embeds <Ticker/> + <SwapCard/>
        page.module.css         # Hero layout, ticker animation, header chrome
        leaderboard/            # Ribbit XP leaderboard route + styling
        profile/               # Player profile hub (wardrobe, stats, quests)
        icon.tsx                # Inline PNG favicon for Next metadata route
        globals.css
      components/
        SwapCard.tsx            # Titan swap UI + wallet interactions
        SwapCard.module.css     # SNES glassmorphism styling
        TokenSelector.tsx       # Jupiter-driven token picker modal (featured promos)
        Ticker.tsx              # Jupiter top-organic ticker (6h change)
        WalletButton.tsx
        BackgroundAudio.tsx
        SpeakerToggle.tsx
        HelpButton.tsx
        ChatButton.tsx
      lib/
        tokens.ts               # Default verified token metadata + helpers
      providers/
        SolanaProvider.tsx      # Wallet adapter context
        AudioProvider.tsx       # Shared background audio context
packages/
  shared/                       # (placeholder for shared packages)
scripts/
  dev-worker.mjs                # Local Wrangler dev harness
pnpm-workspace.yaml
package.json                    # Workspace scripts (incl. deploy:prod)
\`\`\`

- Managed with **pnpm workspaces** – run `pnpm install` at the repo root once.
- UI: Next.js App Router, TypeScript, Vitest. Tests live under `src/**/__tests__`.
- Backend: Cloudflare Worker (Wrangler) handles Titan WebSocket + REST APIs.
- Cloudflare Pages worker proxies `/api/*` → Worker and `/rpc` → private Solana RPC.

## 2. Local Development

\`\`\`
pnpm install               # bootstrap workspace
pnpm dev                   # start Next.js (3000) + worker (8787)
  └─ scripts/dev-worker.mjs loads root .env and forwards TITAN_/SOLANA_/QUOTE_ vars
\`\`\`

`apps/ui/next.config.ts` rewrites `/api/*` and `/rpc` to `http://localhost:8787/*` during dev, so the browser talks to the same endpoints as production.

## 3. Environment & Secrets

- Git ignores `.env*` except `.env.example`. Example values live at the repo root.
- **Worker secrets** (`apps/api`): `wrangler secret put <KEY>`
  - `TITAN_TOKEN`, `TITAN_BASE_URL`, `TITAN_WS_URL`, `TITAN_REGION_ORDER`
  - Optional: `SOLANA_RPC_URL`, `SOLANA_WS_URL`
- **Pages secrets** (`frogx-ui` project): `wrangler pages secret put <KEY> --project-name frogx-ui`
  - `SOLANA_RPC_URL` — private Helius RPC (used by `/rpc` proxy)
  - Optional: `API_ORIGIN` to point `/api/*` to a different worker base URL
- UI **does not** need `NEXT_PUBLIC_SOLANA_RPC_URL` if you rely on `/rpc` proxy.

## 4. Commands

- Frontend: `pnpm --filter @frogx/ui run dev|build|lint|test`
- Backend: `pnpm --filter @frogx/api run dev|deploy`
- Full deployment: `pnpm run deploy:prod`
  \`\`\`
  pnpm install --frozen-lockfile
  pnpm --filter @frogx/api run deploy
  pnpm --filter @frogx/ui run deploy:pages
  \`\`\`
  `deploy:pages` triggers `next-on-pages --custom-entrypoint ./worker-entry.mjs` then `wrangler pages deploy`.

## 5. Architecture & Feature Overview

### Request flows

1. **Quotes & swaps**  
   UI → `/api/frogx/*` → Pages worker → `frogx-api` Worker → Titan WebSocket/REST → normalized response (transaction base64, instructions, routing metadata).

2. **Wallet XP (client-side)**  
   XP badge currently shows a placeholder (4,269 XP) once a wallet connects. Replace with real stats when Titan exposes XP API.

3. **Wallet RPC**  
   UI → `/rpc` → Pages worker → private `SOLANA_RPC_URL` (Helius). Keeps RPC key server-side while dApps use the proxy.

4. **Live token data**  
   UI fetches Jupiter Token API v2:
   - `tokens/v2/tag?query=verified` (baseline)
   - `tokens/v2/toporganicscore/5m?limit=50` (suggested + ticker)
   - `tokens/v2/search?query=...` (picker search)

### Frontend modules

- **`SwapCard`**: Wallet-aware Titan swap surface. Streams quote previews via `/api/frogx/quotes`, handles balance polling (native SOL vs SPL), assembles transactions (lookup tables) and submits via wallet adapter. Includes Titan router insights and USDC estimates, with a compact mobile layout that keeps Swap/Disconnect headers aligned and trims vertical padding across sections. XP badge (4,269 XP) renders in the header when a wallet is connected.
- **`TokenSelector`**: Jupiter-style modal picker with verified suggestions (organic score ≥93), search across symbol/name/mint, arbitrary mint support (falls back to on-chain mint decimals), and sponsor slots (ROCK, zenBTC, SSE) injected via `featured` metadata.
- **`Ticker`**: Header marquee listing top verified tokens (organic score ≥93) from Jupiter, showing the **6‑hour** price change. Refreshes every 60s and gracefully degrades to curated defaults.
- **`Leaderboard`** (`/leaderboard`): Displays 100 mock Ribbit XP rows (lazy-loaded 20 at a time). Top 3 rows glow gold/silver/bronze with matching avatar halos. Uses same header + audio context as home.
- **`Profile`** (`/profile`): Ribbit XP player hub with wardrobe selection, arcade stats, badge cabinet, activity timeline, and quest board. All data mocked for now.
- **`SolanaProvider`**: Wraps wallet adapter contexts, shared across the App Router tree.
- **`AudioProvider`**: Ensures background music starts once and persists through route changes; exposes mute state for UI controls.
- **Branding**: Header centers `logo.png` with a Titan-powered subtitle flanked by `sticker/excited.webm` and `sticker/wink.webm` on desktop, while mobile keeps the logo tucked 16px from the edge and hides the sticker/tagline for clarity. A neon wallet icon replaces the hamburger bars, showing the XP badge when connected.
- Favicon/icon pipeline relies on `sbficon.png` via Next metadata route.

### Backend modules

- **`env.ts`**: Runtime env validation (Titan + Solana keys).
- **`routes.ts`**: REST surface for `/info`, `/quotes`, `/swap`. Bridges HTTP requests to Titan logic and formats responses for the UI.
- **`titan.ts`**: Maintains Titan WebSocket sessions, normalizes quotes/swaps, handles failover and region ordering. Concurrent region attempts via `Promise.any` with contextual errors.

### Styling system

- CSS Modules per component (e.g., `SwapCard.module.css`, `leaderboard.module.css`) deliver bespoke retro styling (animated borders, ticker marquee). Fonts via `next/font` (Geist, Press Start 2P).
- Accessibility aids: visually-hidden text for brand logo (`.srOnly`), keyboard-dismissable modals, descriptive aria labels for ticker and selectors.

## 6. Coding Practices

- TypeScript, strict mode. PascalCase components, camelCase functions/hooks, SCREAMING_SNAKE_CASE constants.
- Keep reusable logic under `src/lib`, server-only logic under `apps/api/src`.
- Document new env vars in `.env.example`. Never commit real tokens.
- Prefer small, pure functions; add unit tests with Vitest/RTL.
- Titan integration: expect connection drops; surface errors with context.
- External API usage (Jupiter, Titan) should include graceful fallbacks and logging when data is unavailable.

## 7. Testing & QA

- Unit tests: `pnpm --filter @frogx/ui run test`
- Lint: `pnpm --filter @frogx/ui run lint`
- Planned integration tests: `pnpm --filter @frogx/ui run test:e2e`
- Manual smoke checks before deploy: wallet connects, XP badge renders, quote stream returns data, swap returns Titan payload.

## 8. Deployment Checklist

1. Update `.env.local` / Cloudflare secrets if credentials change.
2. `pnpm run deploy:prod`
3. Verify Worker endpoints (`/api/frogx/info`, `/api/frogx/quotes`).
4. Confirm `https://frogtrading.exchange/` shows wallet balance, XP badge, and live quotes.
5. Monitor Cloudflare Worker logs (`wrangler tail`) for errors.

## 9. Troubleshooting

- `/rpc` 404 → redeploy UI after running `build:worker`; ensure Pages secret `SOLANA_RPC_URL` is set.
- Titan WebSocket errors → check Titan token, region list, or messagepack decode errors in Worker logs.
- `pnpm install` prompts → add `--frozen-lockfile` in CI to enforce lock consistency.
- Build failure in `next-on-pages` due to offline registry access → rerun on a machine with npm connectivity.
- Jupiter API anomalies → verify `lite-api.jup.ag` availability; ticker/picker fall back to curated defaults but should surface console warnings.
- Quotes timing out → Titan demo regions may be down; verify with `curl -X POST https://frogx-api.aklo.workers.dev/api/frogx/quotes` and Titan status.

Keep this document updated when architecture or tooling shifts. Focus on swap UX, Titan resiliency, Solana-edge testing, XP reporting, and Ribbit-themed leaderboard polish.


```

# apps/api/.dev.vars.example

```example
TITAN_TOKEN="paste-your-token-here"

# Optional: if you prefer configuring the Worker with a separate vars file instead of
# forwarding values from the repo root .env files, keep overrides here.
# TITAN_REGION_ORDER="us1.api.demo.titan.exchange,de1.api.demo.titan.exchange"
# TITAN_BASE_URL="https://{region}/api/v1"
# TITAN_WS_URL="wss://{region}/api/v1/ws"

```

# apps/api/package.json

```json
{
  "name": "@frogx/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node ../../scripts/dev-worker.mjs",
    "build": "echo \"Workers built by wrangler\"",
    "deploy": "wrangler deploy"
  },
  "dependencies": {
    "bs58": "^6.0.0",
    "msgpackr": "^1.11.2"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20241218.0",
    "wrangler": "^3.78.0"
  }
}

```

# apps/api/src/env.ts

```ts
const REGION_SEPARATORS = /[, ]+/;

const DEFAULT_REGION = "us1.api.demo.titan.exchange";
const DEFAULT_HTTP_BASE = "https://us1.api.demo.titan.exchange/api/v1";
const DEFAULT_WS_URL = "wss://us1.api.demo.titan.exchange/api/v1/ws";
const DEFAULT_QUOTE_FRESHNESS_SECONDS = 3;

const parseList = (value: string | undefined): string[] =>
  (value ?? "")
    .split(REGION_SEPARATORS)
    .map((entry) => entry.trim())
    .filter(Boolean);

const normalizeUrl = (value: string | undefined, fallback: string) => {
  if (!value) return fallback;
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) return fallback;
  return trimmed.replace(
    /^([a-zA-Z]+):+\/\//,
    (_, protocol: string) => `${protocol}://`,
  );
};

const toNumber = (value: string | undefined, fallback: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

export type Env = {
  TITAN_TOKEN?: string;
  TITAN_BASE_URL?: string;
  TITAN_WS_URL?: string;
  TITAN_REGION_ORDER?: string;
  TITAN_DEMO_API_TOKEN?: string;
  TITAN_DEMO_DEFAULT_REGION?: string;
  TITAN_DEMO_REGION_ORDER?: string;
  TITAN_DEMO_HTTP_BASE_SCHEME?: string;
  TITAN_DEMO_HTTP_BASE_PATH?: string;
  TITAN_DEMO_WS_BASE_SCHEME?: string;
  TITAN_DEMO_WS_PATH?: string;
  QUOTE_FRESHNESS_SECONDS?: string;
};

export type TitanConfig = {
  token: string;
  httpBaseUrl: string;
  wsUrl: string;
  preferredRegions: string[];
  quoteFreshnessSeconds: number;
};

const resolveToken = (env: Env) =>
  env.TITAN_TOKEN?.trim() || env.TITAN_DEMO_API_TOKEN?.trim() || "";

const resolveFallbackRegion = (env: Env) =>
  env.TITAN_DEMO_DEFAULT_REGION?.trim() || DEFAULT_REGION;

const resolveHttpBaseUrl = (env: Env, fallbackRegion: string) => {
  if (env.TITAN_BASE_URL) {
    return normalizeUrl(env.TITAN_BASE_URL, DEFAULT_HTTP_BASE);
  }

  const scheme = (env.TITAN_DEMO_HTTP_BASE_SCHEME ?? "https").trim() || "https";
  const path = env.TITAN_DEMO_HTTP_BASE_PATH ?? "/api/v1";
  return normalizeUrl(
    `${scheme}://${fallbackRegion}${path.startsWith("/") ? path : `/${path}`}`,
    DEFAULT_HTTP_BASE,
  );
};

const resolveWsUrl = (env: Env, fallbackRegion: string) => {
  if (env.TITAN_WS_URL) {
    return normalizeUrl(env.TITAN_WS_URL, DEFAULT_WS_URL);
  }

  const scheme = (env.TITAN_DEMO_WS_BASE_SCHEME ?? "wss").trim() || "wss";
  const path = env.TITAN_DEMO_WS_PATH ?? "/api/v1/ws";
  return normalizeUrl(
    `${scheme}://${fallbackRegion}${path.startsWith("/") ? path : `/${path}`}`,
    DEFAULT_WS_URL,
  );
};

const resolvePreferredRegions = (env: Env, fallbackRegion: string) => {
  const explicitRegions = parseList(env.TITAN_REGION_ORDER);
  if (explicitRegions.length > 0) {
    return explicitRegions;
  }

  const demoRegions = parseList(env.TITAN_DEMO_REGION_ORDER);
  if (demoRegions.length > 0) {
    return demoRegions;
  }

  return [fallbackRegion];
};

export const getTitanConfig = (env: Env): TitanConfig => {
  const fallbackRegion = resolveFallbackRegion(env);
  const preferredRegions = resolvePreferredRegions(env, fallbackRegion);

  return {
    token: resolveToken(env),
    httpBaseUrl: resolveHttpBaseUrl(env, fallbackRegion),
    wsUrl: resolveWsUrl(env, fallbackRegion),
    preferredRegions,
    quoteFreshnessSeconds: toNumber(
      env.QUOTE_FRESHNESS_SECONDS,
      DEFAULT_QUOTE_FRESHNESS_SECONDS,
    ),
  };
};

```

# apps/api/src/index.ts

```ts
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

```

# apps/api/src/routes.ts

```ts
import { getTitanConfig, type Env } from "./env";
import {
  fetchBestQuote,
  resolveHttpUrl,
  type QuoteRequest,
} from "./titan";

const json = (data: unknown, init?: ResponseInit) =>
  Response.json(data, init);

const createMockQuote = (payload: Partial<QuoteRequest>) =>
  json(
    {
      status: "executable",
      updatedAt: new Date().toISOString(),
      inMint: payload.inMint ?? "",
      outMint: payload.outMint ?? "",
      amountIn: payload.amountIn ?? "0",
      amountOut: "0",
      priceImpactBps: 0,
      routers: ["Titan"],
      provider: "Titan",
      routeId: "mock",
      inAmount: payload.amountIn ?? "0",
      instructions: [],
      addressLookupTables: [],
      executable: true,
      simulated: true,
    },
    { status: 200 },
  );

export async function getInfo(env: Env): Promise<Response> {
  const config = getTitanConfig(env);
  return json({
    routers: ["Titan Direct", "Jupiter"],
    preferredRegions: config.preferredRegions,
    quoteFreshnessSeconds: config.quoteFreshnessSeconds,
    mock: !config.token,
  });
}

export async function postQuotes(request: Request, env: Env): Promise<Response> {
  const config = getTitanConfig(env);
  console.log(
    "Titan quote request config",
    JSON.stringify({
      hasToken: Boolean(config.token),
      wsUrl: config.wsUrl,
      regions: config.preferredRegions,
    }),
  );
  let body: Partial<QuoteRequest> = {};
  try {
    body = (await request.json()) as Partial<QuoteRequest>;
  } catch (error) {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { inMint, outMint, amountIn, slippageBps, priorityFee, userPublicKey } =
    body;

  if (!userPublicKey) {
    return json({ error: "userPublicKey is required" }, { status: 400 });
  }

  if (!config.token) {
    return createMockQuote(body);
  }

  try {
    const quote = await fetchBestQuote(
      {
        inMint: inMint ?? "",
        outMint: outMint ?? "",
        amountIn: amountIn ?? "0",
        slippageBps: slippageBps ?? 0,
        priorityFee: priorityFee ?? 0,
        userPublicKey,
      },
      config,
    );
    return json(quote);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(
      {
        error: "Quote stream unavailable",
        details: message,
      },
      { status: 502 },
    );
  }
}

type SwapBuildPayload = {
  userPubkey: string;
  inMint: string;
  outMint: string;
  amountIn: string;
  slippageBps: number;
  priorityFee: number;
};

export async function postSwap(request: Request, env: Env): Promise<Response> {
  const config = getTitanConfig(env);
  console.log(
    "Titan swap request config",
    JSON.stringify({
      hasToken: Boolean(config.token),
      baseUrl: config.httpBaseUrl,
      region: config.preferredRegions[0],
    }),
  );
  let payload: SwapBuildPayload;
  try {
    payload = (await request.json()) as SwapBuildPayload;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!config.token) {
    return json(
      {
        mode: "tx_base64",
        txBase64: "BASE64_TX_PLACEHOLDER",
        meta: {
          mock: true,
          message: "Titan token missing; returning sample transaction.",
        },
      },
      { status: 200 },
    );
  }

  const region = config.preferredRegions[0];
  const url = resolveHttpUrl(config, "/frogx/swap", region);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    return json(
      { error: "Swap builder unavailable", details: text || undefined },
      { status: 502 },
    );
  }

  const data = (await response.json()) as {
    txBase64?: string | null;
    route?: unknown;
    meta?: Record<string, unknown>;
  };

  const mode = data.txBase64 ? "tx_base64" : "route";

  return json({
    mode,
    txBase64: data.txBase64 ?? null,
    route: data.route ?? null,
    meta: data.meta ?? null,
  });
}

```

# apps/api/src/titan.ts

```ts
import { decode, encode } from "msgpackr";
import bs58 from "bs58";
import type { TitanConfig } from "./env";

const TITAN_PROTOCOLS = ["v1.api.titan.ag+msgpack", "v1.api.titan.ag"];
const REQUEST_TIMEOUT_MS = 7_000;
const DEFAULT_UPDATE_INTERVAL_MS = 1_000;
const DEFAULT_NUM_QUOTES = 3;
const REGION_PLACEHOLDERS = [
  "{region}",
  "{{region}}",
  "<region>",
  "%region%",
  "{REGION}",
];

export type QuoteRequest = {
  inMint: string;
  outMint: string;
  amountIn: string;
  slippageBps: number;
  priorityFee: number;
  userPublicKey: string;
};

type TitanInstructionAccountPayload = {
  p: unknown;
  s?: boolean;
  w?: boolean;
};

type TitanInstructionPayload = {
  p: unknown;
  a?: TitanInstructionAccountPayload[];
  d?: unknown;
};

type TitanSwapRoute = {
  inAmount: number | bigint;
  outAmount: number | bigint;
  slippageBps?: number;
  steps?: Array<{ label?: string }>;
  transaction?: unknown;
  instructions?: TitanInstructionPayload[];
  addressLookupTables?: unknown;
  computeUnits?: number | bigint;
  computeUnitsSafe?: number | bigint;
};

type TitanSwapQuotes = {
  id: string;
  quotes: Record<string, TitanSwapRoute> | Map<string, TitanSwapRoute>;
};

export type QuoteResponse = {
  status: "executable";
  updatedAt: string;
  inMint: string;
  outMint: string;
  amountIn: string;
  amountOut: string;
  priceImpactBps: number;
  routers: string[];
  provider: string;
  routeId: string;
  transactionBase64?: string;
  inAmount: string;
  instructions: Array<{
    programId: string;
    accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
    data: string;
  }>;
  addressLookupTables: string[];
  computeUnits?: number;
  computeUnitsSafe?: number;
  executable: true;
  simulated: true;
};

const replaceRegionPlaceholder = (template: string, region?: string) => {
  if (!region) return template;
  let result = template;
  for (const placeholder of REGION_PLACEHOLDERS) {
    if (result.includes(placeholder)) {
      result = result.replaceAll(placeholder, region);
    }
  }
  return result;
};

const ensureProtocol = (value: string, defaultProtocol: "wss" | "https") => {
  if (/^[a-z]+:\/\//i.test(value)) return value;
  return `${defaultProtocol}://${value}`;
};

const ensureWsUrl = (
  template: string,
  region: string | undefined,
  token: string | undefined,
) => {
  const replaced = replaceRegionPlaceholder(template, region);
  const withProtocol = ensureProtocol(replaced, "wss");
  const parsed = new URL(withProtocol);

  if (replaced === template && region) {
    const hostnameParts = parsed.hostname.split(".").filter(Boolean);
    let resolvedHost: string | null = null;

    if (region.includes(".")) {
      resolvedHost = region;
    } else if (hostnameParts.length >= 1) {
      hostnameParts[0] = region;
      resolvedHost = hostnameParts.join(".");
    } else {
      resolvedHost = region;
    }

    if (resolvedHost) {
      parsed.hostname = resolvedHost;
    }
  }

  if (!parsed.pathname || parsed.pathname === "/") {
    parsed.pathname = "/api/v1/ws";
  }
  parsed.searchParams.delete("auth");
  if (token) {
    parsed.searchParams.set("auth", token);
  }
  return parsed.toString();
};

const ensureHttpBaseUrl = (template: string, region?: string) => {
  const replaced = replaceRegionPlaceholder(template, region);
  return ensureProtocol(replaced, "https");
};

export const joinUrl = (base: string, path: string) => {
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

const getCandidateWsUrls = (config: TitanConfig): string[] => {
  const base = config.wsUrl;
  const hasPlaceholder = REGION_PLACEHOLDERS.some((placeholder) =>
    base.includes(placeholder),
  );

  const candidates: string[] = [];
  const seen = new Set<string>();

  const addCandidate = (region: string | undefined) => {
    const url = ensureWsUrl(base, region, config.token);
    if (!seen.has(url)) {
      seen.add(url);
      candidates.push(url);
    }
  };

  if (config.preferredRegions.length > 0) {
    for (const region of config.preferredRegions) {
      addCandidate(region);
    }
  }

  if (!hasPlaceholder || config.preferredRegions.length === 0) {
    addCandidate(undefined);
  }

  return candidates;
};

const toBigInt = (value: number | bigint | undefined): bigint => {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  return BigInt(0);
};

const bigIntToString = (value: number | bigint | undefined): string =>
  toBigInt(value).toString();

const base58ToBytes = (value: string): Uint8Array => {
  try {
    return bs58.decode(value);
  } catch {
    throw new Error("INVALID_BASE58");
  }
};

const ensureUint8Array = (value: unknown): Uint8Array => {
  if (!value) {
    throw new Error("BUFFER_EMPTY");
  }

  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return new Uint8Array(
      view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength),
    );
  }
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return new Uint8Array();
    const binary = atob(normalized);
    const result = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      result[i] = binary.charCodeAt(i);
    }
    return result;
  }

  throw new Error("UNSUPPORTED_BUFFER_TYPE");
};

const bytesToBase58 = (value: Uint8Array): string => bs58.encode(value);

const toPubkeyString = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (!value) {
    throw new Error("EMPTY_PUBKEY");
  }
  if (value instanceof Uint8Array) {
    return bytesToBase58(value);
  }
  if (value instanceof ArrayBuffer) {
    return bytesToBase58(new Uint8Array(value));
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return bytesToBase58(
      new Uint8Array(
        view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength),
      ),
    );
  }
  if (Array.isArray(value)) {
    return bytesToBase58(Uint8Array.from(value as number[]));
  }
  throw new Error("UNSUPPORTED_PUBKEY_TYPE");
};

const bytesToBase64 = (value: Uint8Array | null): string | undefined => {
  if (!value || value.length === 0) return undefined;
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < value.length; i += chunkSize) {
    const chunk = value.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const normalizeInstructionAccount = (account: TitanInstructionAccountPayload) => ({
  pubkey: toPubkeyString(account?.p),
  isSigner: Boolean(account?.s),
  isWritable: Boolean(account?.w),
});

const normalizeInstruction = (instruction: TitanInstructionPayload) => ({
  programId: toPubkeyString(instruction?.p),
  accounts: Array.isArray(instruction?.a)
    ? instruction.a.map(normalizeInstructionAccount)
    : [],
  data: instruction?.d ? bytesToBase64(ensureUint8Array(instruction.d)) ?? "" : "",
});

const isMap = <K, V>(value: unknown): value is Map<K, V> =>
  value instanceof Map;

const toTransactionBytes = (value: unknown): Uint8Array | null => {
  if (!value) return null;
  try {
    return ensureUint8Array(value);
  } catch {
    return null;
  }
};

const pickBestRoute = (quotes: TitanSwapQuotes["quotes"]) => {
  const entries = isMap<string, TitanSwapRoute>(quotes)
    ? Array.from(quotes.entries())
    : Object.entries(quotes ?? {});

  if (!entries.length) {
    throw new Error("NO_QUOTES_AVAILABLE");
  }

  const sorted = entries.sort((a, b) => {
    const diff = toBigInt(b[1]?.outAmount) - toBigInt(a[1]?.outAmount);
    if (diff === 0n) return 0;
    return diff > 0n ? 1 : -1;
  });

  for (const entry of sorted) {
    const [, route] = entry;
    if (toTransactionBytes(route.transaction)) {
      return entry;
    }
  }

  return sorted[0];
};

const transformQuotes = (
  swapQuotes: TitanSwapQuotes,
  payload: QuoteRequest,
): QuoteResponse => {
  const [providerId, bestRoute] = pickBestRoute(swapQuotes.quotes);
  const routers = (bestRoute.steps ?? [])
    .map((step) => step.label)
    .filter((label): label is string => Boolean(label));

  const computeUnits =
    bestRoute.computeUnits !== undefined && bestRoute.computeUnits !== null
      ? Number(toBigInt(bestRoute.computeUnits))
      : undefined;

  const computeUnitsSafe =
    bestRoute.computeUnitsSafe !== undefined && bestRoute.computeUnitsSafe !== null
      ? Number(toBigInt(bestRoute.computeUnitsSafe))
      : undefined;

  const transactionBytes = toTransactionBytes(bestRoute.transaction);

  return {
    status: "executable",
    updatedAt: new Date().toISOString(),
    inMint: payload.inMint,
    outMint: payload.outMint,
    amountIn: payload.amountIn,
    amountOut: bigIntToString(bestRoute.outAmount),
    priceImpactBps: bestRoute.slippageBps ?? 0,
    routers: routers.length > 0 ? routers : [providerId],
    provider: providerId,
    routeId: swapQuotes.id,
    transactionBase64: bytesToBase64(transactionBytes),
    inAmount: bigIntToString(bestRoute.inAmount),
    instructions: Array.isArray(bestRoute.instructions)
      ? bestRoute.instructions.map(normalizeInstruction)
      : [],
    addressLookupTables: Array.isArray(bestRoute.addressLookupTables)
      ? bestRoute.addressLookupTables.map((entry) => toPubkeyString(entry))
      : [],
    computeUnits,
    computeUnitsSafe,
    executable: true,
    simulated: true,
  };
};

const toUint8ArrayMessage = async (data: unknown): Promise<Uint8Array> => {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    const arrayBuffer = await data.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }
  if (typeof data === "string") {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  throw new Error("UNSUPPORTED_MESSAGE_PAYLOAD");
};

type TitanQuoteResult = QuoteResponse;

const requestTitanQuotes = (
  wsUrl: string,
  payload: QuoteRequest,
  config: TitanConfig,
): Promise<TitanQuoteResult> =>
  new Promise((resolve, reject) => {
    const logError = (error: unknown) => {
      console.error("Titan WebSocket error", {
        message: error instanceof Error ? error.message : String(error),
      });
    };

    const ws =
      config.token && config.token.length > 0
        ? new (WebSocket as unknown as {
            new (
              url: string,
              protocols: string[],
              options: { headers: Record<string, string> },
            ): WebSocket;
          })(wsUrl, TITAN_PROTOCOLS, {
            headers: {
              Authentication: `Bearer ${config.token}`,
              Authorization: `Bearer ${config.token}`,
            },
          })
        : new WebSocket(wsUrl, TITAN_PROTOCOLS);

    let requestId = 1;
    let streamId: number | null = null;
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          ws.close(4000, "timeout");
        } catch {
          // ignore
        }
        reject(new Error("TITAN_TIMEOUT"));
      }
    }, REQUEST_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeoutId);
      ws.removeEventListener("open", handleOpen);
      ws.removeEventListener("message", handleMessage);
      ws.removeEventListener("error", handleError);
      ws.removeEventListener("close", handleClose);
    };

    const sendRequest = (data: Record<string, unknown>) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const message = { id: requestId++, data };
      ws.send(encode(message));
    };

    const finishWithError = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(4001, "error");
        }
      } catch {
        // ignore
      }
      logError(error);
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const finishWithResult = (result: TitanQuoteResult) => {
      if (settled) return;
      settled = true;
      if (streamId !== null) {
        try {
          sendRequest({ StopStream: { id: streamId } });
        } catch {
          // ignore
        }
      }
      cleanup();
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, "ok");
        }
      } catch {
        // ignore
      }
      resolve(result);
    };

    const handleOpen = () => {
      try {
        const swapRequest = {
          swap: {
            inputMint: base58ToBytes(payload.inMint),
            outputMint: base58ToBytes(payload.outMint),
            amount: BigInt(payload.amountIn),
            swapMode: "ExactIn",
            slippageBps: payload.slippageBps,
          },
          transaction: {
            userPublicKey: base58ToBytes(payload.userPublicKey),
          },
          update: {
            intervalMs: DEFAULT_UPDATE_INTERVAL_MS,
            numQuotes: DEFAULT_NUM_QUOTES,
          },
        };

        sendRequest({ NewSwapQuoteStream: swapRequest });
      } catch (error) {
        finishWithError(error);
      }
    };

    const handleMessage = async (event: MessageEvent) => {
      try {
        const raw = await toUint8ArrayMessage(event.data);
        const decoded = decode(raw) as Record<string, unknown>;

        if (decoded.Response) {
          const response = decoded.Response as {
            stream?: { id: number };
          };
          if (response.stream) {
            streamId = response.stream.id;
          }
          return;
        }

        if (decoded.Error) {
          const error = decoded.Error as { message?: string };
          throw new Error(error.message ?? "Titan error");
        }

        if (decoded.StreamData) {
          const streamData = decoded.StreamData as {
            id: number;
            payload: { SwapQuotes?: TitanSwapQuotes };
          };

          if (streamId !== null && streamData.id !== streamId) {
            return;
          }

          const swapQuotes = streamData.payload?.SwapQuotes;
          if (!swapQuotes) return;

          const normalized = transformQuotes(swapQuotes, payload);
          finishWithResult(normalized);
          return;
        }

        if (decoded.StreamEnd) {
          const streamEnd = decoded.StreamEnd as { errorMessage?: string };
          throw new Error(streamEnd.errorMessage ?? "STREAM_ENDED");
        }
      } catch (error) {
        finishWithError(error);
      }
    };

    const handleError = (event: Event) => {
      const error =
        event instanceof ErrorEvent
          ? event.error ?? new Error(event.message)
          : new Error("TITAN_CONNECTION_ERROR");
      finishWithError(error);
    };

    const handleClose = () => {
      if (!settled) {
        finishWithError(new Error("TITAN_CONNECTION_CLOSED"));
      }
    };

    ws.addEventListener("open", handleOpen);
    ws.addEventListener("message", handleMessage);
    ws.addEventListener("error", handleError);
    ws.addEventListener("close", handleClose);
  });

type QuoteAttemptError = Error & { url: string };

const wrapQuoteError = (url: string, error: unknown): QuoteAttemptError => {
  const baseError =
    error instanceof Error ? error : new Error(String(error ?? "UNKNOWN_ERROR"));
  const wrapped = new Error(baseError.message, { cause: baseError }) as QuoteAttemptError;
  wrapped.name = "TitanQuoteAttemptError";
  wrapped.url = url;
  return wrapped;
};

export const fetchBestQuote = async (
  payload: QuoteRequest,
  config: TitanConfig,
): Promise<QuoteResponse> => {
  const candidateUrls = getCandidateWsUrls(config);
  if (candidateUrls.length === 0) {
    throw new Error("NO_TITAN_REGIONS");
  }

  const attempts = candidateUrls.map((wsUrl) =>
    requestTitanQuotes(wsUrl, payload, config).catch((error) => {
      throw wrapQuoteError(wsUrl, error);
    }),
  );

  try {
    return await Promise.any(attempts);
  } catch (aggregate) {
    if (aggregate instanceof AggregateError && aggregate.errors.length > 0) {
      const messages = aggregate.errors
        .map((error) => {
          if (error instanceof Error) {
            const url =
              (error as QuoteAttemptError).url ??
              (error.cause && (error.cause as QuoteAttemptError).url);
            return url ? `${url}: ${error.message}` : error.message;
          }
          return String(error);
        })
        .join(" | ");
      throw new Error(messages || "QUOTE_STREAM_UNAVAILABLE");
    }
    throw aggregate;
  }
};

export const resolveHttpUrl = (
  config: TitanConfig,
  path: string,
  region?: string,
) => {
  const base = ensureHttpBaseUrl(config.httpBaseUrl, region);
  return joinUrl(base, path);
};

```

# apps/api/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["@cloudflare/workers-types"],
    "lib": ["esnext"],
    "allowJs": false
  },
  "include": ["src/**/*.ts"]
}

```

# apps/api/wrangler.toml

```toml
name = "frogx-api"
main = "src/index.ts"
compatibility_date = "2025-10-09"

[vars]
TITAN_ENV = "demo"
TITAN_DEMO_DEFAULT_REGION = "us1.api.demo.titan.exchange"
TITAN_DEMO_REGION_ORDER = "us1.api.demo.titan.exchange,de1.api.demo.titan.exchange,jp1.api.demo.titan.exchange"
TITAN_DEMO_WS_PATH = "/api/v1/ws"
TITAN_DEMO_HTTP_BASE_SCHEME = "https"
TITAN_DEMO_WS_BASE_SCHEME = "wss"
QUOTE_FRESHNESS_SECONDS = "3"
SOLANA_COMMITMENT = "confirmed"

```

# apps/ui/docs/prd.md

```md
# FrogTradingExchange — PRD

## 0) Context & environments

* **Titan demo** = mainnet, limited resources; used for integration & early updates.
* **Titan prod** = mainnet, higher capacity; will require a new token + endpoint.
* **Auth**: Bearer JWT in `Authorization` header.
* **WS**: `wss://<region>/api/v1/ws` (quotes stream).
* **REST**: `https://<region>/api/v1/*` (swap build/tx, info).
* **Regions** (demo): `us1`, `de1`, `jp1` (strings provided).

Environment matrix (config-only):

* `TITAN_BASE_URL` (demo/prod), `TITAN_WS_URL`, `TITAN_TOKEN`
* Region preference & failover order.

---

## 1) Objectives

* Deliver a **fast, single-screen Solana swap** with a **SNES/Super Nintendo frog** skin that leverages Titan’s best-route streaming quotes.
* Phase 2 adds **wallet connection + user profile (“Swamp”)**, showing frog holdings, swap history, points, and badges.

---

## 2) Phase 1 — Swap MVP

### 2.1 UX (single screen)

* **Controls**: From/To token selectors, Amount In (ExactIn), Slippage %, Priority fee preset.
* **Live quote**: best route, est. out, price impact, route path (routers list), “Simulated ✓/✗”.
* **CTA**: Swap (disabled if quote stale or wallet not connected).
* **Theme**: SNES pixel font, Solana purple `#9945FF`, green `#14F195`, CRT scanline overlay.

### 2.2 Frontend (Next.js + React)

* **Components**

  * `SwapCard`: form inputs, live quote panel, CTA.
  * `TokenPicker`: search by symbol/mint; shows balance when wallet connected (Phase 2).
  * `QuoteTicker`: renders incoming quote snapshots, chooses current executable.
  * `Snackbar/Toasts`: success/failure with tx sig.
* **State**

  * Pair (`inMint`, `outMint`), `amountIn`, `slippageBps`, `priorityFee`.
  * `quoteState`: `{status, updatedAt, outAmount, priceImpactBps, routers, executable, routeId}`.
  * `connectionState`: WS status, current region, failovers attempted.
* **Quote freshness rule**

  * “Executable” = simulated OK + not older than N seconds (config, e.g., 3s).
  * Disable Swap if not executable.

### 2.3 Server (Next.js API routes; token stays server-side)

* **/api/frogx/info [GET]**

  * Proxies Titan `GetInfo` (network, supported routers, min/max constraints).
* **/api/frogx/quotes [POST → SSE or WS-bridge]**

  * Body: `{ inMint, outMint, amountIn, slippageBps, priorityFee }`
  * Opens server→Titan WS (`NewSwapQuoteStream`), relays updates as SSE to client.
  * Handles region failover: `us1 → de1 → jp1` with capped retries.
  * Sanitizes/normalizes output for UI.
* **/api/frogx/swap [POST]**

  * Body: `{ userPubkey, inMint, outMint, amountIn, slippageBps, priorityFee }`
  * Calls Titan swap build endpoint.
  * Returns either `{ mode:"tx_base64", txBase64, meta }` **or** `{ mode:"route", route, meta }`.
  * Enforces server-side validation (mint format, amounts >0, slippage bounds).

### 2.4 Wallet interaction (Phase 1 minimal)

* Require wallet to **sign/send** built transaction.
* Support Phantom/Backpack via wallet-adapter (lightweight modal).
* If `mode: tx_base64`: deserialize → `signTransaction` → `sendRawTransaction`.
* If `mode: route`: build locally (helper util) → sign → send. (Keep abstraction to swap in Titan’s evolving API.)

### 2.5 Token metadata

* Token list service (coingecko/solana.tokenlist JSON or internal curated list).
* On first render, load list + per-mint decimals; fallback to on-chain decimals query.
* Cache in-memory + revalidate on interval.

### 2.6 Error taxonomy & handling

* **Auth** (401/403): show “Service unavailable” and log (no token leakage).
* **WS**: network, protocol, backoff & region rotation; surface to UI as “Reconnecting…”.
* **Build**: invalid params, insufficient balance/ATA, slippage exceeded, blockhash expired.
* **Send**: user reject, RPC errors, simulation fail (show logs if available).

### 2.7 Security & compliance

* Token strictly **server-only**; never shipped to client.
* Rate-limit `/api/frogx/*` (IP+fingerprint).
* Validate inputs; clamp slippage & priority fee to sane ranges.
* No PII. Only wallet pubkeys/tx sigs. Respect CSP, no inline eval.

### 2.8 Performance

* Quotes: binary WS from Titan → server parses → minimal JSON SSE to client.
* UI re-render throttle (~200ms) to avoid flicker on rapid updates.
* Prewarm RPC connection; cache `GetRecentBlockhash` (or use `getLatestBlockhash` on send).

### 2.9 Telemetry (internal)

* Events: `quote_connected`, `quote_update`, `swap_click`, `tx_submitted`, `tx_confirmed`, `tx_failed`.
* Metrics: time-to-first-quote, quote staleness, swap success rate, median confirmation time.

---

## 3) Phase 2 — Wallet Connect, Profiles (“Swamp”), Points & Badges

### 3.1 Goals

* Persist a **user profile** keyed by wallet.
* Display **frog holdings** (“your Swamp”) and swap history.
* Introduce **points** and **badges** for engagement.

### 3.2 Auth & identity

* **Wallet-first auth** (no email required).
* Flow:

  1. Connect wallet (wallet-adapter).
  2. Request nonce from `/api/auth/nonce`.
  3. User signs `Sign-In With Solana` message.
  4. Send signature → `/api/auth/verify` → issue **short-lived session JWT** (HttpOnly cookie).
* Optional: allow multiple wallets to link to one profile (advanced).

### 3.3 Data model (storage: Postgres/Neon or Supabase)

* **users**

  * `id (uuid)`, `primary_wallet (text)`, `username (text, unique?)`, `created_at`
  * `avatar_url`, `bio` (optional)
* **wallets**

  * `id`, `user_id`, `pubkey (text, unique)`, `created_at`
* **holdings_snapshots**

  * `id`, `user_id`, `ts`, `nft_count`, `tokens (jsonb)` (per-mint balances)
* **frog_assets**

  * `mint`, `collection` (verified collection address), `name`, `image_uri`, `traits (jsonb)`
* **swaps**

  * `id`, `user_id`, `tx_sig`, `ts`, `inMint`, `outMint`, `amountIn`, `amountOut`, `priceImpactBps`, `routers (jsonb)`
* **points_ledger**

  * `id`, `user_id`, `ts`, `event_type`, `amount`, `meta (jsonb)`
* **badges**

  * `id`, `slug`, `name`, `description`, `criteria (jsonb)`
* **user_badges**

  * `id`, `user_id`, `badge_id`, `awarded_ts`, `meta (jsonb)`

### 3.4 Holdings (“Swamp”) pipeline

* **Source**: Helius DAS, SimpleHash, or on-chain via RPC + Metaplex standard.
* **Scope**: Collection = *Solana Business Frogs* (verified collection address).
* **Process**

  * On profile load or on schedule: fetch NFTs by owner → filter by collection → store/update `frog_assets` and `holdings_snapshots`.
  * Also fetch SPL token balances (for featured mints).
* **UI**

  * Grid of frog NFTs with rarity/traits, totals, and quick-links to marketplaces.
  * Token balances summary.

### 3.5 Points system (config-driven)

* **Earning events (examples)**

  * Connect wallet (one-time): +50
  * Complete a swap via FTX (FrogTradingExchange): +10 per swap
  * Volume milestones (per day/week thresholds): +X
  * “Swamp” size milestones (own ≥ N frogs): +Y
  * Daily check-in streaks: +1 → +N
* **Anti-abuse**

  * Cooldowns; per-wallet rate limits; exclude self-swaps between identical mints; volume counted post-confirmation; cap points per window.

### 3.6 Badges (examples)

* **“Tadpole”**: first swap.
* **“Bog Baron”**: 10 swaps.
* **“Lily Pad Tycoon”**: ≥ 10 frogs held.
* **“Marsh Whale”**: ≥ 100 SOL volume.
* **“Green Flash”**: 3 swaps in 24h.
* Criteria stored in `badges.criteria` (JSON rules), evaluated by a rules engine (simple server functions/cron).

### 3.7 Profile UI

* **Header**: PFP (generated frog-style if none), username, linked wallets.
* **Tabs**

  * **Swamp**: NFT grid, traits filters, counts.
  * **Activity**: swap history with tx sig links.
  * **Points**: total, recent earns, leaderboards (global & weekly).
  * **Badges**: earned vs locked, hover criteria.
* **Edit profile**: set username, avatar (IPFS or upload), short bio.

### 3.8 Services & APIs (server)

* **/api/auth/nonce [GET]**, **/api/auth/verify [POST]**
* **/api/profile [GET/PUT]** (JWT required)
* **/api/holdings [GET]** (fetch + hydrate; cache for N mins)
* **/api/swaps [GET]** (by user; pagination)
* **/api/points/earn [POST]** (internal hooks on swap confirm)
* **/api/badges [GET]**, **/api/badges/claim [POST]** (if any manual claims)

### 3.9 Jobs & schedulers

* **Swap confirmation listener**: subscribes to tx sigs from Phase 1, writes to `swaps`, triggers points/badges.
* **Holdings refresher**: on-demand and periodic (e.g., 6h cron) for active users.
* **Leaderboard rollups**: daily/weekly aggregates for quick reads.

### 3.10 Security & privacy

* SIWS (Sign-In With Solana); session JWT in HttpOnly cookie.
* CSRF protection on state-changing endpoints.
* Per-user RBAC minimal (self-access only).
* Log redaction; never store private keys.

---

## 4) Shared concerns

### 4.1 Validation

* **Mints**: base58, 32 bytes.
* **Amounts**: positive, decimal → integer in base units by token decimals.
* **Slippage**: clamp to `[5, 500] bps` defaults; override only with explicit user consent.
* **Priority fee**: sensible presets; cap maximum.

### 4.2 Observability

* Structured logs with correlation IDs (quote stream ↔ swap build ↔ tx).
* Error codes + user-safe messages.
* Metrics to dashboard: quote latency, swap success, WS reconnects, API error rates.

### 4.3 Dependencies

* Next.js (App Router), React.
* `@solana/web3.js`, `@solana/wallet-adapter-*`.
* DB: Postgres (Supabase/Neon).
* Holdings: Helius DAS (preferred) or SimpleHash (fallback).
* MessagePack decoder (server) for Titan WS if required.

### 4.4 Theming (SNES)

* Fonts: Press Start 2P or VT323.
* 9-slice “cartridge” card, chunky buttons, CRT overlay.
* Sound hooks (optional, gated by user setting).

---

## 5) Acceptance criteria

### Phase 1

* Connect wallet, pick tokens, enter amount, see **live updating quote** within 1s of typing.
* Swap succeeds with a **ready-to-sign tx** or locally built tx path.
* Quote staleness guard prevents swapping against old quotes.
* Region failover works (observably rotates after WS failure).

### Phase 2

* SIWS auth establishes a profile session.
* “Swamp” shows correct frog NFTs for connected wallet(s).
* Points accrue on qualifying swaps; badges award on thresholds.
* Leaderboard renders weekly totals.

---

## 6) Risks & mitigations

* **API drift** (demo gets updates first): pin an **interface layer**; feature flag new fields; keep backward-compatible parsing.
* **Quote/tx mismatch** due to slot drift: enforce time window; re-validate at send; auto-refresh if expired.
* **Wallet UX friction**: keep number of signature prompts minimal; preflight simulation.
* **Points abuse**: cooldowns, distinct tx checks, per-wallet/day caps, dedupe by tx sig.

---

## 7) Open questions (to close with Titan / internal)

1. **Swap build**: guaranteed **base64 tx** return path? When does it return route-only?
2. **Quote message schema**: final field names/types; simulation success flag; routeId semantics.
3. **Recommended WS protocol headers** (subprotocol/compression); MessagePack details.
4. **Prod endpoints** list + auth token issuance flow & expiry/refresh.
5. **Routing metadata**: can we safely display router names/weights?
6. **Rate limits** per token/region for demo vs prod.
7. **Holdings**: Confirm verified collection address(es) for Solana Business Frogs to filter NFTs.

---
```

# apps/ui/eslint.config.mjs

```mjs
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;

```

# apps/ui/next-env.d.ts

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
/// <reference path="./.next/types/routes.d.ts" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.

```

# apps/ui/next.config.ts

```ts
import fs from "node:fs";
import path from "node:path";
import { config as loadEnvConfig } from "dotenv";
import type { NextConfig } from "next";

const loadRootEnv = () => {
  const env = process.env.NODE_ENV ?? "development";
  const rootDir = path.resolve(__dirname, "..", "..");
  const candidates: Array<{ path: string; override: boolean }> = [
    { path: path.join(rootDir, ".env"), override: false },
    { path: path.join(rootDir, `.env.${env}`), override: false },
    { path: path.join(rootDir, ".env.local"), override: true },
    { path: path.join(rootDir, `.env.${env}.local`), override: true },
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate.path)) {
      loadEnvConfig({
        path: candidate.path,
        override: candidate.override,
      });
    }
  }
};

loadRootEnv();

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    if (!isDev) return [];
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8787/api/:path*",
      },
      {
        source: "/rpc",
        destination: "http://localhost:8787/rpc",
      },
    ];
  },
};

export default nextConfig;

```

# apps/ui/package.json

```json
{
  "name": "@frogx/ui",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "build:worker": "pnpm exec next-on-pages --custom-entrypoint ./worker-entry.mjs",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "vitest run --config tests/vitest.e2e.config.ts",
    "prewarm:blockhash": "pnpm exec tsx scripts/prewarm-blockhash.ts",
    "deploy:pages": "pnpm run build:worker && wrangler pages deploy .vercel/output/static --project-name frogx-ui"
  },
  "dependencies": {
    "@solana/wallet-adapter-base": "^0.9.27",
    "@solana/wallet-adapter-react": "^0.15.39",
    "@solana/wallet-adapter-react-ui": "^0.9.39",
    "@solana/wallet-adapter-wallets": "^0.19.37",
    "@solana/web3.js": "^1.98.4",
    "next": "15.5.4",
    "react": "19.1.0",
    "react-dom": "19.1.0"
  },
  "devDependencies": {
    "@cloudflare/next-on-pages": "^1.11.0",
    "@eslint/eslintrc": "^3",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^4.3.4",
    "dotenv": "^16.4.5",
    "eslint": "^9",
    "eslint-config-next": "15.5.4",
    "jsdom": "^26.0.0",
    "pino-pretty": "^11.2.2",
    "tsx": "^4.19.2",
    "typescript": "^5",
    "vitest": "^3.0.2",
    "wrangler": "^3.78.0"
  }
}

```

# apps/ui/public/badge-hotshot.svg

This is a file of the type: SVG Image

# apps/ui/public/badge-samurai.svg

This is a file of the type: SVG Image

# apps/ui/public/badge-trailblazer.svg

This is a file of the type: SVG Image

# apps/ui/public/bank.svg

This is a file of the type: SVG Image

# apps/ui/public/bgmusic.mp3

This is a binary file of the type: Binary

# apps/ui/public/chat.svg

This is a file of the type: SVG Image

# apps/ui/public/favicon.ico

This is a binary file of the type: Binary

# apps/ui/public/favicon.png

This is a binary file of the type: Image

# apps/ui/public/file.svg

This is a file of the type: SVG Image

# apps/ui/public/globe.svg

This is a file of the type: SVG Image

# apps/ui/public/info.svg

This is a file of the type: SVG Image

# apps/ui/public/logo.png

This is a binary file of the type: Image

# apps/ui/public/mute.svg

This is a file of the type: SVG Image

# apps/ui/public/pencil.svg

This is a file of the type: SVG Image

# apps/ui/public/sbficon.png

This is a binary file of the type: Image

# apps/ui/public/sound.svg

This is a file of the type: SVG Image

# apps/ui/public/sparkle.svg

This is a file of the type: SVG Image

# apps/ui/public/sticker/cry.webm

This is a binary file of the type: Binary

# apps/ui/public/sticker/excited.webm

This is a binary file of the type: Binary

# apps/ui/public/sticker/LFG.webm

This is a binary file of the type: Binary

# apps/ui/public/sticker/money.webm

This is a binary file of the type: Binary

# apps/ui/public/sticker/wink.webm

This is a binary file of the type: Binary

# apps/ui/public/swap.svg

This is a file of the type: SVG Image

# apps/ui/public/trophy.svg

This is a file of the type: SVG Image

# apps/ui/public/wallet.svg

This is a file of the type: SVG Image

# apps/ui/public/window.svg

This is a file of the type: SVG Image

# apps/ui/README.md

```md
# Frog Trading Exchange

Frog Trading Exchange (FTX) is a Titan-powered Solana DEX brought to you by the Solana Business Frogs.
```

# apps/ui/scripts/prewarm-blockhash.ts

```ts
/**
 * Placeholder script that will eventually prewarm the Solana blockhash cache.
 * Add RPC requests via @solana/web3.js once RPC credentials are wired in.
 *
 * Run with `pnpm prewarm:blockhash`.
 */
console.log("TODO: Implement blockhash prewarm routine");

```

# apps/ui/src/app/favicon.ico

This is a binary file of the type: Binary

# apps/ui/src/app/globals.css

```css
:root {
  color-scheme: light;
  --background: #050315;
  --foreground: #eafdf4;
  --accent-primary: #14f195;
  --accent-secondary: #9945ff;
}

html,
body {
  max-width: 100vw;
  overflow-x: hidden;
}

body {
  color: var(--foreground);
  background: var(--background);
  font-family: var(--font-geist-sans), system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
  padding: 0;
  margin: 0;
}

a {
  color: inherit;
  text-decoration: none;
}

```

# apps/ui/src/app/icon.tsx

```tsx
import { ImageResponse } from "next/og";

const FROG_ICON_BASE64 = `
iVBORw0KGgoAAAANSUhEUgAAAFgAAABYCAYAAABxlTA0AAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFn
ZVJlYWR5ccllPAAAA4dpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/
IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6
bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDkuMS1jMDAzIDc5Ljk2OTBhODdmYywgMjAy
NS8wMy8wNi0yMDo1MDoxNiAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3Lncz
Lm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9
IiIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0UmVm
PSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VSZWYjIiB4bWxuczp4bXA9
Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1w
LmRpZDo5NzkxOTBhNS03MjM1LTQ0ZjktYTA2ZS0yOGM2MzMwZDk2NjQiIHhtcE1NOkRvY3VtZW50SUQ9
InhtcC5kaWQ6OTE2NDlEMzM5REFFMTFGMDkxRDFGMzA0MTM0NjA0RDMiIHhtcE1NOkluc3RhbmNlSUQ9
InhtcC5paWQ6OTE2NDlEMzI5REFFMTFGMDkxRDFGMzA0MTM0NjA0RDMiIHhtcDpDcmVhdG9yVG9vbD0i
QWRvYmUgUGhvdG9zaG9wIDI2LjExIChNYWNpbnRvc2gpIj4gPHhtcE1NOkRlcml2ZWRGcm9tIHN0UmVm
Omluc3RhbmNlSUQ9InhtcC5paWQ6MmE2YWZhNDMtNDRiNC00YTRlLWIzMTctYTRiMTdmZjFjMTM3IiBz
dFJlZjpkb2N1bWVudElEPSJhZG9iZTpkb2NpZDpwaG90b3Nob3A6YjQyMTM4YjgtNjJkYS1iODQzLTlh
OTAtODY3ZTNlMzRmYzlmIi8+IDwvcmRmOkRlc2NyaXB0aW9uPiA8L3JkZjpSREY+IDwveDp4bXBtZXRh
PiA8P3hwYWNrZXQgZW5kPSJyIj8+Q4LEpAAABD9JREFUeNrsnUtoE1EUhu+dmaRJmxoLgn1RW6FFio9q
BV2oVXDhQkWQ4sKqCxGEgghSqAv34gNJq7hQRASfYBFd6apdiSsrKNiNIhahRURIG5PM47r+T2FCSJom
5f93J7eZuf3n8M3puXem2hijVlI79w7BBHJWvKLnd9QixB+nnuhyHt9S1LKKBtPg2pZT6RP2HRgE5o7f
GYXxno42iLf6nyDORIKyzscWt6C+/Sfgk+nJ55oZTETQYGqZpJe7Dt4+gHVuanwExnvb2yEe+obMfdC9
BeILn79CHKhISfMLBGE9jbel2dExiKenHmlmMBFBg6lqZbBk7q3bl2B8c1tr+IQUzif1Ng3x+UMtED9+
Myt+odJyJm/LDPQgfnbvalFMZgYTETSYKmcvon/PWYN1pBN6yX5ONmBd6QdFXfPhM2txwmYB4pY/jRDn
ytxdifv/SspJZjARQYOpUhjcvw/r2oltd2HcN42h30+c+oVXtGDd7WMo6lqjsOwcmFmPv1DgldWgmBuF
+BozmIigwVQFGexrvAYHZy6GM1MoeTSHP22Vd02taQHr5PlEgePLXoUOBMNxuN4VH0SZwUQEDaZU1faD
rS4NB2w80gTj+a4s/vwc1rUfzuGaXDTIF3X+HQ/6kPnNeI/ILiJTZwa/FHAI57vjbj/ECzcN+8FEBA2m
VozBuheZmzilxL4FvIZBPY5nhn2xJieOHylua1jWzEHccn0j1skjafGHAB5fa4xtMf+sWRTfj5HBRAQN
plZsf7Dl1UHsWdh7kK0HK7BC19DiOpy58p4hmZnQzXi+lF0Uc6U8I+4RtuhPF1hjZAYTETSYqqZnNJwA
mRjzXYgjCgtlV2VCmbmEyUkcb3TxfBmVLq7OtyIiNsxgIoIGUzXL4KAVGZZI4d61HwYZ2WrFwhlpI3Pr
bwhmNuP5kincRxGIOteyxAbhOO6zSFxhBhMRNJhSVdMPtnticIDo2Vxo78HqdOQM8G//OVfsZStyP26z
HT4u6nBvPnzNz5a9lBx+8Pcy1+SICBpM1U4dXHBC67GOdQUE47m68AMUuT04ui68zvYcvKeo78xgIoIG
U6uXwb7o9/5+fRp7DZ5b2QzMYT+6bvcEM5iIoMFU1TDYaKwTI758giMq3lPmi3FkbublMWxVvHqoRANX
xLESUywrHtnA45kY1uFebIgZTETQYEpV6zMaehM2eNedxPEFBxlXt0Ew20JGp18MiuZBac/Zifa0WrLN
wUimI6PVs6d8bxoRQYOpmnl3pe5DJicFUuX+YKcjGrpmV3LdbiLiGRKxhvce92VkxgzfH0xE0GCqZhks
5fRH4IRrjuMiWlZccruztPcD+5Yr3g8s6twprHPztw3/jwYRQdHgVctgqegu3NvWcBivudvthT7LXJjB
+H3vHR4hf9/XzGAigqLBNJgGUzSYBtNgigbTYIoGV0z/BRgAc1MtGhTBU9QAAAAASUVORK5CYII=
`.replace(/\s/g, "");

const FROG_ICON_DATA_URI = `data:image/png;base64,${FROG_ICON_BASE64}`;

// Serve the exact pixel frog as the favicon
export const size = { width: 88, height: 88 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      // Inline the PNG to avoid cross-origin fetches in edge/runtime environments
      <img
        src={FROG_ICON_DATA_URI}
        width={size.width}
        height={size.height}
        style={{ display: "block", imageRendering: "pixelated" }}
        alt="Frog favicon"
      />
    ),
    size,
  );
}

```

# apps/ui/src/app/layout.tsx

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono, Press_Start_2P } from "next/font/google";
import "./globals.css";
import { SolanaProvider } from "@/providers/SolanaProvider";
import { AudioProvider } from "@/providers/AudioProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const pressStart = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-press-start",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Frog Trading Exchange",
  description:
    "Titan-powered Solana swap terminal with retro SNES frog theming.",
  icons: {
    // Prefer real .ico in root with PNG fallbacks
    icon: [
      { url: "/favicon.ico", rel: "icon", sizes: "any" },
      { url: "/favicon.png", rel: "icon", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${pressStart.variable}`}
      >
        <SolanaProvider>
          <AudioProvider>{children}</AudioProvider>
        </SolanaProvider>
      </body>
    </html>
  );
}

```

# apps/ui/src/app/leaderboard/leaderboard.module.css

```css
.content {
  width: min(960px, 100%);
  margin: 2.6rem auto 3.2rem;
  padding: 0 1.75rem 2.4rem;
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
  color: rgba(234, 253, 244, 0.9);
  font-family: var(--font-press-start), var(--font-geist-sans), system-ui, sans-serif;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.hero {
  border-radius: 24px;
  border: 1px solid rgba(153, 69, 255, 0.45);
  background: linear-gradient(145deg, rgba(12, 3, 36, 0.94), rgba(9, 2, 30, 0.82));
  box-shadow: 0 24px 70px rgba(20, 241, 149, 0.22);
  padding: 2rem 2.2rem;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.title {
  margin: 0;
  font-size: 1rem;
  color: #14f195;
  letter-spacing: 0.1em;
}

.subtitle {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.75;
  max-width: 58ch;
  color: rgba(234, 253, 244, 0.78);
}

.board {
  border-radius: 24px;
  border: 1px solid rgba(153, 69, 255, 0.4);
  background: linear-gradient(180deg, rgba(10, 2, 36, 0.9), rgba(7, 0, 28, 0.84));
  box-shadow: 0 26px 74px rgba(20, 241, 149, 0.22);
  padding: 1.6rem 0 1.4rem;
  position: relative;
  overflow: hidden;
}

.table {
  width: 100%;
  border-collapse: collapse;
  min-width: 640px;
}

.table thead {
  background: linear-gradient(180deg, rgba(94, 42, 205, 0.64), rgba(47, 21, 118, 0.86));
}

.table th {
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  color: #14f195;
  padding: 0.85rem 1.05rem;
  border-bottom: 1px solid rgba(153, 69, 255, 0.35);
}

.rankCol {
  width: 72px;
  text-align: center;
}

.avatarCol {
  width: 72px;
}

.traderCol {
  width: 40%;
  text-align: left;
}

.pointsCol {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.35rem;
  color: #14f195;
  text-align: right;
}

.table td {
  padding: 0.75rem 1.05rem;
  border-bottom: 1px solid rgba(153, 69, 255, 0.12);
  font-size: 0.68rem;
  letter-spacing: 0.05em;
  color: rgba(234, 253, 244, 0.88);
}

.row:nth-child(odd) {
  background: rgba(19, 8, 49, 0.62);
}

.row:nth-child(even) {
  background: rgba(13, 4, 36, 0.7);
}

.rankCell {
  text-align: center;
  color: rgba(234, 253, 244, 0.78);
}

.avatarCell {
  text-align: center;
}

.avatarImg {
  border-radius: 12px;
  border: 2px solid rgba(20, 241, 149, 0.65);
  background: rgba(12, 2, 40, 0.9);
  image-rendering: pixelated;
}

.traderCell {
  color: rgba(234, 253, 244, 0.78);
  text-align: left;
}

.pointsCell {
  text-align: right;
  color: #14f195;
}

.sentinel {
  width: 100%;
  height: 1px;
}

.loading {
  margin-top: 1rem;
  text-align: center;
  font-size: 0.74rem;
  letter-spacing: 0.06em;
  color: rgba(234, 253, 244, 0.72);
}

.sparkleIcon {
  width: 16px;
  height: 16px;
  image-rendering: pixelated;
  filter: invert(71%) sepia(67%) saturate(637%) hue-rotate(92deg)
    brightness(96%) contrast(95%);
}

.goldRow .rankCell,
.goldRow .traderCell,
.goldRow .pointsCell {
  color: #ffd83d;
  text-shadow: 0 0 8px rgba(255, 216, 61, 0.8);
}
.goldRow .avatarImg {
  border-color: rgba(255, 216, 61, 0.85);
  box-shadow: 0 0 12px rgba(255, 216, 61, 0.55);
}

.silverRow .rankCell,
.silverRow .traderCell,
.silverRow .pointsCell {
  color: #e4e9ff;
  text-shadow: 0 0 6px rgba(228, 233, 255, 0.75);
}
.silverRow .avatarImg {
  border-color: rgba(228, 233, 255, 0.85);
  box-shadow: 0 0 12px rgba(228, 233, 255, 0.45);
}

.bronzeRow .rankCell,
.bronzeRow .traderCell,
.bronzeRow .pointsCell {
  color: #f7a76c;
  text-shadow: 0 0 6px rgba(247, 167, 108, 0.65);
}
.bronzeRow .avatarImg {
  border-color: rgba(247, 167, 108, 0.9);
  box-shadow: 0 0 12px rgba(247, 167, 108, 0.45);
}

@media (max-width: 960px) {
  .content {
    padding: 0 1.2rem 2.8rem;
  }

  .hero {
    padding: 1.7rem 1.6rem;
    border-radius: 22px;
  }

  .board {
    border-radius: 20px;
  }
}

@media (max-width: 720px) {
  .content {
    padding: 0 1rem 2.2rem;
    gap: 1.4rem;
  }

  .hero {
    gap: 0.9rem;
  }

  .title {
    font-size: 0.9rem;
  }

  .subtitle {
    font-size: 0.72rem;
  }

  .board {
    overflow-x: auto;
  }

  .table {
    min-width: 520px;
  }

}

```

# apps/ui/src/app/leaderboard/page.tsx

```tsx
"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { WalletButton } from "@/components/WalletButton";
import { Ticker } from "@/components/Ticker";
import { useAudio } from "@/providers/AudioProvider";
import { useWallet } from "@solana/wallet-adapter-react";
import homeStyles from "../page.module.css";
import styles from "./leaderboard.module.css";

type LeaderboardEntry = {
  rank: number;
  trader: string;
  points: number;
};

const TOTAL_ROWS = 100;
const PAGE_SIZE = 20;

const HANDLE_POOL = [
  "FROGMASTER",
  "LILYPADLARRY",
  "RIBBITQUEEN",
  "CROAKDEALER",
  "SWAMPWIZARD",
  "PIXELTOAD",
  "DANKFROG",
  "HOPLITE",
  "NEONTADPOLE",
  "TURBOTOAD",
];

const generateRows = (): LeaderboardEntry[] =>
  Array.from({ length: TOTAL_ROWS }, (_, index) => {
    const base = HANDLE_POOL[index % HANDLE_POOL.length];
    return {
      rank: index + 1,
      trader: `${base}#${(index + 123).toString().padStart(3, "0")}`,
      points: 420_000 - index * 3_175 + ((index * 911) % 8_700),
    };
  });

const pointsFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export default function LeaderboardPage() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { muted, toggleMuted } = useAudio();
  const { connected } = useWallet();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const rows = useMemo(generateRows, []);
  const visibleRows = useMemo(
    () => rows.slice(0, visibleCount),
    [rows, visibleCount],
  );

  const toggleMenu = () => setMenuOpen((open) => !open);
  const closeMenu = () => setMenuOpen(false);
  const handleToggleMute = () => {
    toggleMuted();
  };

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    if (visibleCount >= rows.length) return undefined;
    const sentinel = sentinelRef.current;
    if (!sentinel) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, rows.length));
        }
      },
      { rootMargin: "0px 0px 240px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [rows.length, visibleCount]);

  return (
    <main className={homeStyles.main}>
      <header className={homeStyles.headerBar}>
        <div className={homeStyles.headerInner}>
          <div className={homeStyles.brandGroup}>
            <div className={homeStyles.brandRow}>
              <video
                src="/sticker/excited.webm"
                className={`${homeStyles.headerSticker} ${homeStyles.headerStickerLarge}`}
                autoPlay
                loop
                muted
                playsInline
                aria-hidden="true"
              />
              <h1>
                <span className={homeStyles.srOnly}>Frog Trading Exchange</span>
                <img
                  src="/logo.png"
                  alt="Frog Trading Exchange"
                  className={homeStyles.brandLogo}
                  loading="lazy"
                />
              </h1>
              <video
                src="/sticker/wink.webm"
                className={`${homeStyles.headerSticker} ${homeStyles.headerStickerLarge}`}
                autoPlay
                loop
                muted
                playsInline
                aria-hidden="true"
              />
            </div>
            <p className={homeStyles.tagline}>Powered by Titan for the best prices on Solana</p>
          </div>
        </div>
        <div className={homeStyles.rightControls}>
          {connected ? (
            <div className={homeStyles.xpChip} aria-label="Your XP">
              <span className={homeStyles.xpValue}>4,269 XP</span>
              <img src="/sparkle.svg" alt="" className={homeStyles.sparkleIcon} />
            </div>
          ) : null}
          <button
            type="button"
            className={homeStyles.menuButton}
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            onClick={toggleMenu}
          >
            <img src="/wallet.svg" alt="" className={homeStyles.menuButtonIcon} />
          </button>
        </div>
        <div
          className={`${homeStyles.menuSheet} ${
            menuOpen ? homeStyles.menuSheetOpen : ""
          }`}
          aria-hidden={!menuOpen}
        >
          <nav aria-label="Main navigation" className={homeStyles.menuList}>
            <div className={homeStyles.menuWalletWrapper} onClick={closeMenu}>
              <WalletButton className={homeStyles.menuWallet} />
            </div>
            {connected ? (
              <button
                type="button"
                className={homeStyles.menuItem}
                onClick={() => {
                  closeMenu();
                  router.push("/profile");
                }}
              >
                <img
                  src="/bank.svg"
                  alt=""
                  className={homeStyles.menuIcon}
                />
                <span>PROFILE</span>
              </button>
            ) : null}
            <button
              type="button"
              className={homeStyles.menuItem}
              onClick={() => {
                closeMenu();
                router.push("/");
              }}
            >
              <img src="/swap.svg" alt="" className={homeStyles.menuIcon} />
              <span>SWAP</span>
            </button>
            <button
              type="button"
              className={homeStyles.menuItem}
              onClick={() => { handleToggleMute(); closeMenu(); }}
            >
              <img
                src={muted ? "/mute.svg" : "/sound.svg"}
                alt=""
                className={homeStyles.menuIcon}
              />
              <span>{muted ? "UNMUTE" : "MUTE"}</span>
            </button>
            <button type="button" className={homeStyles.menuItem} onClick={closeMenu}>
              <img src="/info.svg" alt="" className={homeStyles.menuIcon} />
              <span>HELP</span>
            </button>
            <button type="button" className={homeStyles.menuItem} onClick={closeMenu}>
              <img src="/chat.svg" alt="" className={homeStyles.menuIcon} />
              <span>CHAT</span>
            </button>
          </nav>
        </div>
        {menuOpen ? (
          <button
            type="button"
            className={homeStyles.menuBackdrop}
            aria-hidden="true"
            onClick={closeMenu}
          />
        ) : null}
      </header>

      <Ticker />

      <div className={styles.content}>
        <section className={styles.hero}>
          <h1 className={styles.title}>RIBBIT XP LEADERBOARD</h1>
          <p className={styles.subtitle}>
            THIS IS THE ULTIMATE GAME OF LEAP FROG. WHO WILL HOP TO THE TOP? ONLY THE MOST CLEVER OF FROGS WILL FIGURE OUT EVERY WAY TO STACK XP. LET THE GAMES BEGIN.
          </p>
        </section>

        <section className={styles.board}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col" className={styles.rankCol}>
                  RANK
                </th>
                <th scope="col" className={styles.avatarCol} aria-label="Avatar" />
                <th scope="col" className={styles.traderCol}>
                  SOLANA BUSINESS FROG
                </th>
                <th scope="col" className={styles.pointsCol}>
                  <img src="/sparkle.svg" alt="" className={styles.sparkleIcon} />
                  <span>XP POINTS</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((entry) => {
                const highlightClass =
                  entry.rank === 1
                    ? styles.goldRow
                    : entry.rank === 2
                      ? styles.silverRow
                      : entry.rank === 3
                        ? styles.bronzeRow
                        : "";

                return (
                  <tr key={entry.rank} className={`${styles.row} ${highlightClass}`}>
                    <td className={styles.rankCell}>{entry.rank.toString().padStart(2, "0")}</td>
                    <td className={styles.avatarCell}>
                      <Image
                        src="/sbficon.png"
                        alt=""
                        width={44}
                        height={44}
                        className={styles.avatarImg}
                      />
                    </td>
                    <td className={styles.traderCell}>{entry.trader}</td>
                    <td className={styles.pointsCell}>{pointsFormatter.format(entry.points)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div ref={sentinelRef} className={styles.sentinel} />
          {visibleCount < rows.length ? (
            <div className={styles.loading}>LOADING MORE CHAMPIONS…</div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

```

# apps/ui/src/app/leaderboard/page.tsx.keep

```keep
"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { WalletButton } from "@/components/WalletButton";
import { Ticker } from "@/components/Ticker";
import { useAudio } from "@/providers/AudioProvider";
import homeStyles from "../page.module.css";
import styles from "./leaderboard.module.css";

type LeaderboardEntry = {
  rank: number;
  trader: string;
  points: number;
};

const TOTAL_ROWS = 100;
const PAGE_SIZE = 20;

const HANDLE_POOL = [
  "FROGMASTER",
  "LILYPADLARRY",
  "RIBBITQUEEN",
  "CROAKDEALER",
  "SWAMPWIZARD",
  "PIXELTOAD",
  "DANKFROG",
  "HOPLITE",
  "NEONTADPOLE",
  "TURBOTOAD",
];

const generateRows = (): LeaderboardEntry[] =>
  Array.from({ length: TOTAL_ROWS }, (_, index) => {
    const base = HANDLE_POOL[index % HANDLE_POOL.length];
    return {
      rank: index + 1,
      trader: `${base}#${(index + 123).toString().padStart(3, "0")}`,
      points: 420_000 - index * 3_175 + ((index * 911) % 8_700),
    };
  });

const pointsFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export default function LeaderboardPage() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { muted, toggleMuted } = useAudio();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const rows = useMemo(generateRows, []);
  const visibleRows = useMemo(
    () => rows.slice(0, visibleCount),
    [rows, visibleCount],
  );

  const toggleMenu = () => setMenuOpen((open) => !open);
  const closeMenu = () => setMenuOpen(false);
  const handleToggleMute = () => {
    toggleMuted();
  };

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    if (visibleCount >= rows.length) return undefined;
    const sentinel = sentinelRef.current;
    if (!sentinel) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, rows.length));
        }
      },
      { rootMargin: "0px 0px 240px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [rows.length, visibleCount]);

  return (
    <main className={homeStyles.main}>
      <header className={homeStyles.headerBar}>
        <div className={homeStyles.headerInner}>
          <div className={homeStyles.brandGroup}>
            <div className={homeStyles.brandRow}>
              <video
                src="/sticker/excited.webm"
                className={`${homeStyles.headerSticker} ${homeStyles.headerStickerLarge}`}
                autoPlay
                loop
                muted
                playsInline
                aria-hidden="true"
              />
              <h1>
                <span className={homeStyles.srOnly}>Frog Trading Exchange</span>
                <img
                  src="/logo.png"
                  alt="Frog Trading Exchange"
                  className={homeStyles.brandLogo}
                  loading="lazy"
                />
              </h1>
              <video
                src="/sticker/wink.webm"
                className={`${homeStyles.headerSticker} ${homeStyles.headerStickerLarge}`}
                autoPlay
                loop
                muted
                playsInline
                aria-hidden="true"
              />
            </div>
            <p className={homeStyles.tagline}>Powered by Titan for the best prices on Solana</p>
          </div>
        </div>
        <div className={homeStyles.rightControls}>
          <button
            type="button"
            className={homeStyles.menuButton}
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            onClick={toggleMenu}
          >
            <img src="/wallet.svg" alt="" className={homeStyles.menuButtonIcon} />
          </button>
        </div>
        <div
          className={`${homeStyles.menuSheet} ${
            menuOpen ? homeStyles.menuSheetOpen : ""
          }`}
          aria-hidden={!menuOpen}
        >
          <nav aria-label="Main navigation" className={homeStyles.menuList}>
            <div className={homeStyles.menuWalletWrapper} onClick={closeMenu}>
              <WalletButton className={homeStyles.menuWallet} />
            </div>
            <button
              type="button"
              className={homeStyles.menuItem}
              onClick={() => {
                closeMenu();
                router.push("/");
              }}
            >
              <img src="/swap.svg" alt="" className={homeStyles.menuIcon} />
              <span>SWAP</span>
            </button>
            <button
              type="button"
              className={homeStyles.menuItem}
              onClick={() => { handleToggleMute(); closeMenu(); }}
            >
              <img
                src={muted ? "/mute.svg" : "/sound.svg"}
                alt=""
                className={homeStyles.menuIcon}
              />
              <span>{muted ? "UNMUTE" : "MUTE"}</span>
            </button>
            <button type="button" className={homeStyles.menuItem} onClick={closeMenu}>
              <img src="/info.svg" alt="" className={homeStyles.menuIcon} />
              <span>HELP</span>
            </button>
            <button type="button" className={homeStyles.menuItem} onClick={closeMenu}>
              <img src="/chat.svg" alt="" className={homeStyles.menuIcon} />
              <span>CHAT</span>
            </button>
          </nav>
        </div>
        {menuOpen ? (
          <button
            type="button"
            className={homeStyles.menuBackdrop}
            aria-hidden="true"
            onClick={closeMenu}
          />
        ) : null}
      </header>

      <Ticker />

      <div className={styles.content}>
        <section className={styles.hero}>
          <h1 className={styles.title}>RIBBIT XP LEADERBOARD</h1>
          <p className={styles.subtitle}>
            THIS IS THE ULTIMATE GAME OF LEAP FROG. WHO WILL HOP TO THE TOP? ONLY THE MOST CLEVER OF FROGS WILL FIGURE OUT EVERY WAY TO STACK XP. LET THE GAMES BEGIN.
          </p>
        </section>

        <section className={styles.board}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col" className={styles.rankCol}>
                  RANK
                </th>
                <th scope="col" className={styles.avatarCol} aria-label="Avatar" />
                <th scope="col" className={styles.traderCol}>
                  SOLANA BUSINESS FROG
                </th>
                <th scope="col" className={styles.pointsCol}>
                  XP POINTS
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((entry) => (
                <tr key={entry.rank} className={styles.row}>
                  <td className={styles.rankCell}>{entry.rank.toString().padStart(2, "0")}</td>
                  <td className={styles.avatarCell}>
                    <Image
                      src="/sbficon.png"
                      alt=""
                      width={44}
                      height={44}
                      className={styles.avatarImg}
                    />
                  </td>
                  <td className={styles.traderCell}>{entry.trader}</td>
                  <td className={styles.pointsCell}>{pointsFormatter.format(entry.points)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div ref={sentinelRef} className={styles.sentinel} />
          {visibleCount < rows.length ? (
            <div className={styles.loading}>LOADING MORE CHAMPIONS…</div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

```

# apps/ui/src/app/page.module.css

```css
.main {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem 1.5rem 3rem;
  padding-top: 160px;
  background: radial-gradient(
    circle at 70% 80%,
    rgba(0, 0, 0, 0.88) 0%,
    rgba(23, 0, 69, 0.9) 55%,
    rgba(12, 6, 53, 0.92) 100%
  );
  isolation: isolate;
  filter: contrast(1.02) saturate(1.04);
}

.headerBar {
  position: fixed;
  top: 24px;
  left: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  z-index: 6;
}

.headerInner {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 960px;
  padding: 0 2.75rem;
  min-height: 2.6rem;
}

.brandGroup {
  display: flex;
  /* Arrange brand row (stickers + logo) above tagline on desktop */
  flex-direction: column;
  align-items: center;
  gap: 0.65rem;
  margin: 0 auto;
}

.brandHomeButton {
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  color: inherit;
  font: inherit;
}

.brandHomeButton:focus-visible {
  outline: 2px solid #14f195;
  outline-offset: 6px;
}

.brandHomeButton:active {
  transform: translateY(1px);
}

/*
  The first line of the brand: left webm, center logo, right webm.
  Keeps all three on the same horizontal line and centered to the viewport via the parent containers.
*/
.brandRow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}

.brandGroup h1 {
  font-family: var(--font-press-start), var(--font-geist-sans), system-ui,
    sans-serif;
  font-size: 1.18rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #14f195;
  margin: 0;
  line-height: 1;
}

.brandText {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
}

.brandLogo {
  display: block;
  height: 1.45rem;
  width: auto;
  image-rendering: pixelated;
}

.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.tagline {
  font-family: var(--font-press-start), var(--font-geist-sans), system-ui,
    sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  color: rgba(234, 253, 244, 0.85);
  margin: 0;
  text-transform: uppercase;
  text-align: center;
}

.headerSticker {
  height: 2.15rem;
  width: auto;
  image-rendering: pixelated;
  display: block;
}

.headerStickerLarge {
  /* Match live: title size + tagline size + gap */
  height: calc(1.55rem + 0.7rem + 0.65rem);
}

.rightControls {
  position: absolute;
  top: 50%;
  right: 24px;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  gap: 1rem;
}

.speakerButton {
  width: 42px;
  height: 42px;
  border: 2px solid rgba(234, 253, 244, 0.8);
  border-radius: 10px;
  background: rgba(20, 241, 149, 0.12);
  color: #eafdf4;
}

.walletButton {
  position: static;
  transform: none;
  padding: 0.45rem 1.1rem;
  border: 2px solid #14f195;
  border-radius: 10px;
  background: rgba(20, 241, 149, 0.12);
  color: #14f195;
  font-family: var(--font-press-start), var(--font-geist-sans), system-ui,
    sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease,
    background-color 150ms ease;
  min-width: 12rem;
  z-index: 10;
  pointer-events: auto;
}

.walletButton:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(20, 241, 149, 0.35);
  background: rgba(20, 241, 149, 0.18);
}

.walletButton:disabled {
  cursor: wait;
  opacity: 0.65;
}


.menuButton {
  display: inline-flex;
  width: 46px;
  height: 46px;
  border: 2px solid #14f195;
  border-radius: 12px;
  background: rgba(8, 2, 30, 0.65);
  color: #14f195;
  align-items: center;
  justify-content: center;
  padding: 6px;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease, background 150ms ease;
  box-shadow: 0 0 20px rgba(20, 241, 149, 0.35);
}

.menuButtonIcon {
  width: 28px;
  height: 28px;
  image-rendering: pixelated;
  filter: invert(71%) sepia(67%) saturate(637%) hue-rotate(92deg)
    brightness(96%) contrast(95%);
}

.menuButton:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 26px rgba(20, 241, 149, 0.35);
}

.menuButton:focus-visible {
  outline: 2px dashed rgba(20, 241, 149, 0.7);
  outline-offset: 2px;
}

.menuSheet {
  position: absolute;
  top: 88px;
  right: 32px;
  width: 220px;
  padding: 1.2rem 1.3rem;
  border-radius: 16px;
  background: rgba(8, 2, 30, 0.95);
  border: 1px solid rgba(153, 69, 255, 0.35);
  box-shadow: 0 18px 40px rgba(20, 241, 149, 0.25);
  backdrop-filter: blur(12px);
  opacity: 0;
  transform: translateY(-12px) scale(0.96);
  pointer-events: none;
  transition: opacity 180ms ease, transform 180ms ease;
  z-index: 7;
}

.menuSheetOpen {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}

.menuList {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.menuWalletWrapper {
  width: 100%;
}

.menuWallet {
  width: 100%;
  border-radius: 12px;
  border: 2px solid #14f195;
  background: rgba(20, 241, 149, 0.2);
  color: #14f195;
  font-family: var(--font-press-start), var(--font-geist-sans), system-ui,
    sans-serif;
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  padding: 0.6rem 0.75rem;
  text-transform: uppercase;
}

.menuItem {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.55rem 0.65rem;
  border-radius: 10px;
  border: 1px solid rgba(20, 241, 149, 0.35);
  background: rgba(8, 2, 30, 0.72);
  color: rgba(234, 253, 244, 0.85);
  font-family: var(--font-press-start), var(--font-geist-sans), system-ui,
    sans-serif;
  font-size: 0.55rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color 150ms ease, background 150ms ease;
}

.menuItem:hover {
  border-color: rgba(20, 241, 149, 0.8);
  background: rgba(20, 241, 149, 0.18);
}

.pixelIcon {
  filter: invert(100%) saturate(0%) brightness(120%);
}

.trophyIcon {
  filter: none;
}

.xpChip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.55rem 0.95rem;
  border-radius: 12px;
  border: 2px solid #14f195;
  background: rgba(8, 2, 30, 0.72);
  box-shadow: 0 0 18px rgba(20, 241, 149, 0.35);
}

.xpValue {
  font-family: var(--font-press-start), var(--font-geist-sans), system-ui,
    sans-serif;
  font-size: 0.62rem;
  letter-spacing: 0.1em;
  color: #14f195;
}

.sparkleIcon {
  width: 16px;
  height: 16px;
  image-rendering: pixelated;
  filter: invert(71%) sepia(67%) saturate(637%) hue-rotate(92deg)
    brightness(96%) contrast(95%);
}

.menuIcon {
  width: 18px;
  height: 18px;
  image-rendering: pixelated;
}

.menuBackdrop {
  position: fixed;
  inset: 0;
  border: none;
  background: transparent;
  cursor: default;
  z-index: 5;
}

.tickerBar {
  position: fixed;
  top: 104px;
  left: 0;
  width: 100%;
  overflow: hidden;
  padding: 0.5rem 0;
  pointer-events: none;
  z-index: 4;
}

.tickerTrack {
  display: inline-flex;
  white-space: nowrap;
  animation: ticker-scroll 28s linear infinite;
  font-family: var(--font-press-start), var(--font-geist-sans), system-ui,
    sans-serif;
  text-transform: uppercase;
  font-size: 0.55rem;
  letter-spacing: 0.06em;
}

.tickerContent {
  display: inline-flex;
  gap: 2.5rem;
}

.tickerItem {
  color: rgba(234, 253, 244, 0.85);
  display: inline-flex;
  gap: 0.4rem;
}

.tickerPositive {
  color: #14f195;
}

.tickerNegative {
  color: #ff7a9c;
}

@keyframes ticker-scroll {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}


.main::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background: repeating-linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.03) 0px,
    rgba(255, 255, 255, 0.03) 1px,
    rgba(0, 0, 0, 0) 3px,
    rgba(0, 0, 0, 0) 4px
  );
  animation: crt-scan 8s linear infinite;
}

.main::after {
  content: "";
  position: fixed;
  inset: 0;
  background: radial-gradient(
      closest-corner at 50% 42%,
      rgba(255, 255, 255, 0.02),
      rgba(255, 255, 255, 0) 60%
    ),
    radial-gradient(
      closest-side at 50% 50%,
      rgba(0, 0, 0, 0) 65%,
      rgba(0, 0, 0, 0.35) 100%
    );
  mix-blend-mode: overlay;
  opacity: 0.55;
  pointer-events: none;
  animation: crt-flicker 1.8s ease-in-out infinite alternate;
  z-index: 0;
}

@keyframes crt-scan {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(4px);
  }
}

@keyframes crt-flicker {
  0% {
    opacity: 0.52;
  }
  100% {
    opacity: 0.6;
  }
}

@media (max-width: 768px) {
  .main {
    padding: 2.35rem 1rem 2.6rem;
    padding-top: 108px;
  }

  .headerBar {
    align-items: flex-start;
  }

  .headerInner {
    padding: 0 1rem;
    justify-content: flex-start;
  }

  .brandGroup {
    gap: 0.55rem;
    margin: 0;
  }

  .brandText {
    align-items: flex-start;
    gap: 0.3rem;
  }

  /* 840x40 asset => 21:1 ratio; keep ~16px gutters on narrow viewports */
  .brandLogo {
    height: min(0.95rem, calc((100vw - 2rem) / 21));
  }

  .tagline {
    display: none;
  }

  .headerSticker,
  .headerStickerLarge {
    display: none;
  }

  .rightControls {
    right: 16px;
  }

  .menuButton {
    width: 32px;
    height: 32px;
    padding: 4px;
  }

  .menuSheet {
    top: 74px;
    right: 16px;
    width: calc(100% - 2.2rem);
  }

  .menuItem {
    font-size: 0.52rem;
    padding: 0.5rem 0.6rem;
  }

  .menuIcon {
    width: 16px;
    height: 16px;
  }

  .tickerBar {
    top: 80px;
  }

  .tickerTrack {
    animation-duration: 25s;
    font-size: 0.48rem;
  }
}

```

# apps/ui/src/app/page.tsx

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SwapCard } from "@/components/SwapCard";
import { WalletButton } from "@/components/WalletButton";
import { Ticker } from "@/components/Ticker";
import { useAudio } from "@/providers/AudioProvider";
import { useWallet } from "@solana/wallet-adapter-react";
import styles from "./page.module.css";

export default function Home() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { muted, toggleMuted } = useAudio();
  const { connected } = useWallet();

  const toggleMenu = () => setMenuOpen((open) => !open);
  const closeMenu = () => setMenuOpen(false);
  const handleToggleMute = () => {
    toggleMuted();
  };

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <main className={styles.main}>
      <header className={styles.headerBar}>
        <div className={styles.headerInner}>
          <button
            type="button"
            className={`${styles.brandGroup} ${styles.brandHomeButton}`}
            onClick={() => {
              closeMenu();
              router.push("/");
            }}
            aria-label="Go to swap home"
          >
            <div className={styles.brandRow}>
              <video
                src="/sticker/excited.webm"
                className={`${styles.headerSticker} ${styles.headerStickerLarge}`}
                autoPlay
                loop
                muted
                playsInline
                aria-hidden="true"
              />
              <h1>
                <span className={styles.srOnly}>Frog Trading Exchange</span>
                <img
                  src="/logo.png"
                  alt="Frog Trading Exchange"
                  className={styles.brandLogo}
                  loading="lazy"
                />
              </h1>
              <video
                src="/sticker/wink.webm"
                className={`${styles.headerSticker} ${styles.headerStickerLarge}`}
                autoPlay
                loop
                muted
                playsInline
                aria-hidden="true"
              />
            </div>
            <p className={styles.tagline}>Powered by Titan for the best prices on Solana</p>
          </button>
        </div>
        <div className={styles.rightControls}>
          {connected ? (
            <div className={styles.xpChip} aria-label="Your XP">
              <span className={styles.xpValue}>4,269 XP</span>
              <img src="/sparkle.svg" alt="" className={styles.sparkleIcon} />
            </div>
          ) : null}
          <button
            type="button"
            className={styles.menuButton}
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            onClick={toggleMenu}
          >
            <img src="/wallet.svg" alt="" className={styles.menuButtonIcon} />
          </button>
        </div>
        <div
          className={`${styles.menuSheet} ${menuOpen ? styles.menuSheetOpen : ""}`}
          aria-hidden={!menuOpen}
        >
          <nav aria-label="Main navigation" className={styles.menuList}>
            <div className={styles.menuWalletWrapper} onClick={closeMenu}>
              <WalletButton className={styles.menuWallet} />
            </div>
            {connected ? (
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => {
                  closeMenu();
                  router.push("/profile");
                }}
              >
                <img
                  src="/bank.svg"
                  alt=""
                  className={styles.menuIcon}
                />
                <span>PROFILE</span>
              </button>
            ) : null}
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                closeMenu();
                router.push("/leaderboard");
              }}
            >
              <img
                src="/trophy.svg"
                alt=""
                className={`${styles.menuIcon} ${styles.pixelIcon} ${styles.trophyIcon}`}
              />
              <span>LEADERBOARD</span>
            </button>
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => { handleToggleMute(); closeMenu(); }}
            >
              <img
                src={muted ? "/mute.svg" : "/sound.svg"}
                alt=""
                className={styles.menuIcon}
              />
              <span>{muted ? "Unmute" : "Mute"}</span>
            </button>
            <button type="button" className={styles.menuItem} onClick={closeMenu}>
              <img src="/info.svg" alt="" className={styles.menuIcon} />
              <span>Help</span>
            </button>
            <button type="button" className={styles.menuItem} onClick={closeMenu}>
              <img src="/chat.svg" alt="" className={styles.menuIcon} />
              <span>Chat</span>
            </button>
          </nav>
        </div>
        {menuOpen ? (
          <button
            type="button"
            className={styles.menuBackdrop}
            aria-hidden="true"
            onClick={closeMenu}
          />
        ) : null}
      </header>
      <Ticker />
      <SwapCard />
    </main>
  );
}

```

# apps/ui/src/app/profile/page.tsx

```tsx
"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { WalletButton } from "@/components/WalletButton";
import { Ticker } from "@/components/Ticker";
import { useAudio } from "@/providers/AudioProvider";
import { useWallet } from "@solana/wallet-adapter-react";
import homeStyles from "../page.module.css";
import styles from "./profile.module.css";

type FrogPfp = {
  id: string;
  name: string;
  rarity: "Legendary" | "Epic" | "Rare" | "Uncommon";
  gradient: string;
  xp: number;
  tagline: string;
};

type Stat = {
  label: string;
  value: string;
  sublabel: string;
};

type Achievement = {
  title: string;
  description: string;
  icon: string;
  status: "claimed" | "in-progress" | "locked";
};

type Activity = {
  title: string;
  timestamp: string;
  detail: string;
};

type Quest = {
  name: string;
  progress: number;
  reward: string;
};

const PFP_LIBRARY: FrogPfp[] = [
  {
    id: "neon",
    name: "Arcade Shogun",
    rarity: "Legendary",
    gradient: "linear-gradient(135deg, #14f195, #7c3bff)",
    xp: 4269,
    tagline: "Runs the Ribbit routing table.",
  },
  {
    id: "retro",
    name: "Pixel Bard",
    rarity: "Epic",
    gradient: "linear-gradient(135deg, #ff8ecb, #6136ff)",
    xp: 3180,
    tagline: "Sings slippage-free ballads.",
  },
  {
    id: "chrome",
    name: "Cyber Lily",
    rarity: "Rare",
    gradient: "linear-gradient(135deg, #34d8ff, #1470f1)",
    xp: 2765,
    tagline: "Glides between liquidity pools.",
  },
  {
    id: "swamp",
    name: "Swamp Scout",
    rarity: "Uncommon",
    gradient: "linear-gradient(135deg, #5dfa96, #0b2f1f)",
    xp: 1984,
    tagline: "Finds hidden fee rebates.",
  },
];

const CORE_STATS: Stat[] = [
  { label: "Season XP", value: "4,269", sublabel: "+420 today" },
  { label: "Lifetime Volume", value: "$189,452", sublabel: "Top 3% of frogs" },
  { label: "Quests Cleared", value: "17", sublabel: "2 active" },
  { label: "Holder Since", value: "Feb 2022", sublabel: "Minted Frog #331" },
  { label: "Frogs Collected", value: "12", sublabel: "3 Legendary" },
];

const ACHIEVEMENTS: Achievement[] = [
  {
    title: "Slippage Samurai",
    description: "Execute 50 swaps under 0.3% slippage.",
    icon: "/badge-samurai.svg",
    status: "claimed",
  },
  {
    title: "Titan Trailblazer",
    description: "Route volume through 5 different Titan regions.",
    icon: "/badge-trailblazer.svg",
    status: "in-progress",
  },
  {
    title: "Helius Hotshot",
    description: "Complete 10 RPC quests without timeout.",
    icon: "/badge-hotshot.svg",
    status: "locked",
  },
];

const ACTIVITY_LOG: Activity[] = [
  {
    title: "Swapped 420.69 BONK → USDC",
    timestamp: "3 minutes ago",
    detail: "Gasless route via Titan JP1",
  },
  {
    title: "Equipped badge: Slippage Samurai",
    timestamp: "18 minutes ago",
    detail: "+150 XP bonus",
  },
  {
    title: "Claimed quest: Ribbit Relay",
    timestamp: "1 hour ago",
    detail: "Routed through 3 pools in under 30s",
  },
  {
    title: "Joined party: LP Rainmakers",
    timestamp: "2 hours ago",
    detail: "Synergy buff active for 24h",
  },
];

const QUEST_BOARD: Quest[] = [
  { name: "Combo Chain x5", progress: 80, reward: "+250 XP" },
  { name: "Titan Trifecta", progress: 45, reward: "+1 Mystery Capsule" },
  { name: "Helius Harmony", progress: 22, reward: "+75 XP" },
];

const LOADOUT = [
  "Arcade HUD v2.3",
  "Slippage Shield +15",
  "Referral Boost x1.5",
  "Quest Tracker AI",
];

export default function ProfilePage() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PFP_LIBRARY.length);
  const { muted, toggleMuted } = useAudio();
  const { connected } = useWallet();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const [selectedPfp, setSelectedPfp] = useState<FrogPfp>(PFP_LIBRARY[0]);
  const [username, setUsername] = useState("ribbitlord420");
  const [editingUsername, setEditingUsername] = useState(false);

  const currentStats = useMemo(() => CORE_STATS, []);

  const onUsernameChange = (value: string) => {
    const trimmed = value.trim();
    setUsername(trimmed.length > 0 ? trimmed : "ribbitlord420");
  };

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisibleCount(PFP_LIBRARY.length);
      }
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <main className={homeStyles.main}>
      <header className={homeStyles.headerBar}>
        <div className={homeStyles.headerInner}>
          <button
            type="button"
            className={`${homeStyles.brandGroup} ${homeStyles.brandHomeButton}`}
            onClick={() => {
              setMenuOpen(false);
              router.push("/");
            }}
            aria-label="Go to swap home"
          >
            <div className={homeStyles.brandRow}>
              <video
                src="/sticker/excited.webm"
                className={`${homeStyles.headerSticker} ${homeStyles.headerStickerLarge}`}
                autoPlay
                loop
                muted
                playsInline
                aria-hidden="true"
              />
              <h1>
                <span className={homeStyles.srOnly}>Frog Trading Exchange</span>
                <img
                  src="/logo.png"
                  alt="Frog Trading Exchange"
                  className={homeStyles.brandLogo}
                  loading="lazy"
                />
              </h1>
              <video
                src="/sticker/wink.webm"
                className={`${homeStyles.headerSticker} ${homeStyles.headerStickerLarge}`}
                autoPlay
                loop
                muted
                playsInline
                aria-hidden="true"
              />
            </div>
            <p className={homeStyles.tagline}>Powered by Titan for the best prices on Solana</p>
          </button>
        </div>
        <div className={homeStyles.rightControls}>
          {connected ? (
            <div className={homeStyles.xpChip} aria-label="Your XP">
              <span className={homeStyles.xpValue}>4,269 XP</span>
              <img src="/sparkle.svg" alt="" className={homeStyles.sparkleIcon} />
            </div>
          ) : null}
          <button
            type="button"
            className={homeStyles.menuButton}
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <img src="/wallet.svg" alt="" className={homeStyles.menuButtonIcon} />
          </button>
        </div>
        <div
          className={`${homeStyles.menuSheet} ${menuOpen ? homeStyles.menuSheetOpen : ""}`}
          aria-hidden={!menuOpen}
        >
          <nav aria-label="Main navigation" className={homeStyles.menuList}>
            <div className={homeStyles.menuWalletWrapper} onClick={() => setMenuOpen(false)}>
              <WalletButton className={homeStyles.menuWallet} />
            </div>
            {connected ? (
              <button
                type="button"
                className={homeStyles.menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  router.push("/profile");
                }}
              >
                <img
                  src="/bank.svg"
                  alt=""
                  className={homeStyles.menuIcon}
                />
                <span>PROFILE</span>
              </button>
            ) : null}
            <button
              type="button"
              className={homeStyles.menuItem}
              onClick={() => {
                setMenuOpen(false);
                router.push("/leaderboard");
              }}
            >
              <img
                src="/trophy.svg"
                alt=""
                className={`${homeStyles.menuIcon} ${homeStyles.pixelIcon} ${homeStyles.trophyIcon}`}
              />
              <span>LEADERBOARD</span>
            </button>
            <button
              type="button"
              className={homeStyles.menuItem}
              onClick={() => {
                toggleMuted();
                setMenuOpen(false);
              }}
            >
              <img
                src={muted ? "/mute.svg" : "/sound.svg"}
                alt=""
                className={homeStyles.menuIcon}
              />
              <span>{muted ? "UNMUTE" : "MUTE"}</span>
            </button>
            <button
              type="button"
              className={homeStyles.menuItem}
              onClick={() => setMenuOpen(false)}
            >
              <img src="/info.svg" alt="" className={homeStyles.menuIcon} />
              <span>HELP</span>
            </button>
            <button
              type="button"
              className={homeStyles.menuItem}
              onClick={() => setMenuOpen(false)}
            >
              <img src="/chat.svg" alt="" className={homeStyles.menuIcon} />
              <span>CHAT</span>
            </button>
          </nav>
        </div>
        {menuOpen ? (
          <button
            type="button"
            className={homeStyles.menuBackdrop}
            aria-hidden="true"
            onClick={() => setMenuOpen(false)}
          />
        ) : null}
      </header>

      <Ticker />

      <div className={styles.content}>
        <section className={styles.profileHero}>
          <div className={styles.heroCard}>
            <div
              className={styles.heroAvatar}
              style={{ backgroundImage: selectedPfp.gradient }}
            >
              <span>{selectedPfp.name.slice(0, 2)}</span>
            </div>
            <div className={styles.heroDetails}>
              <div className={styles.usernameDisplay}>
                <div className={styles.usernameHeader}>
                  <span className={styles.usernameLabel}>Username</span>
                  <button type="button" className={styles.usernameEdit} onClick={() => setEditingUsername(true)}>
                    <img src="/pencil.svg" alt="Edit username" className={styles.usernameIcon} />
                  </button>
                </div>
                {editingUsername ? (
                  <input
                    id="profile-username"
                    className={styles.usernameInput}
                    defaultValue={username}
                    maxLength={32}
                    autoFocus
                    onBlur={(event) => {
                      onUsernameChange(event.target.value);
                      setEditingUsername(false);
                    }}
                  />
                ) : (
                  <button type="button" className={styles.usernameValue} onClick={() => setEditingUsername(true)}>
                    {username}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className={styles.heroRight}>
            <div className={`${styles.statsGrid} ${styles.heroStats}`}>
              {currentStats.map((stat) => (
                <div key={stat.label} className={styles.statCard}>
                  <p className={styles.statLabel}>{stat.label}</p>
                  <p className={styles.statValue}>{stat.value}</p>
                  <p className={styles.statSublabel}>{stat.sublabel}</p>
                </div>
              ))}
            </div>

          </div>
        </section>

        

        <section className={styles.achievementSection}>
          <div className={styles.sectionHeader}>
            <h3>Achievements</h3>
            <span>Flex your Achievement Badges</span>
          </div>
          <div className={styles.badgeGrid}>
            {ACHIEVEMENTS.map((achievement) => (
              <div
                key={achievement.title}
                className={`${styles.badgeCard} ${styles[`badge_${achievement.status.toUpperCase()}`]}`}
              >
                <div className={styles.badgeCardContent}>
                  <img
                    src={achievement.icon}
                    alt={`${achievement.title} badge`}
                    className={styles.badgeIcon}
                  />
                  <div className={styles.badgeDetails}>
                    <span className={styles.badgeStatus}>{achievement.status.toUpperCase()}</span>
                    <h4>{achievement.title}</h4>
                    <p>{achievement.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.loadoutSection}>
          <div className={styles.sectionHeader}>
            <h3>Deploy Frogs</h3>
            <span>Place frogs in your swamp for XP multipliers</span>
          </div>
          <ul className={styles.loadoutList}>
            {LOADOUT.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className={styles.questBoard}>
          <div className={styles.sectionHeader}>
            <h3>Quest Board</h3>
            <span>Complete runs to claim bonuses</span>
          </div>
          <div className={styles.questList}>
            {QUEST_BOARD.map((quest) => (
              <div key={quest.name} className={styles.questRow}>
                <div>
                  <p className={styles.questName}>{quest.name}</p>
                  <div className={styles.questProgress}>
                    <div
                      className={styles.questProgressFill}
                      style={{ width: `${quest.progress}%` }}
                    />
                  </div>
                </div>
                <span className={styles.questReward}>{quest.reward}</span>
              </div>
            ))}
          </div>
        </section><section className={styles.activitySection}>
          <div className={styles.sectionHeader}>
            <h3>Recent Activity</h3>
            <span>Autoplay recap of your latest feats</span>
          </div>
          <ul className={styles.activityTimeline}>
            {ACTIVITY_LOG.map((entry) => (
              <li key={entry.title}>
                <div className={styles.timelineDot} />
                <div className={styles.timelineCard}>
                  <div className={styles.timelineHeader}>
                    <h4>{entry.title}</h4>
                    <time>{entry.timestamp}</time>
                  </div>
                  <p>{entry.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        
      </div>
    </main>
  );
}

```

# apps/ui/src/app/profile/profile.module.css

```css
.content {
  width: min(1040px, 100%);
  margin: 2.5rem auto 3.5rem;
  padding: 0 1.75rem 2.5rem;
  display: flex;
  flex-direction: column;
  gap: 2.4rem;
  color: rgba(234, 253, 244, 0.9);
  font-family: var(--font-press-start), var(--font-geist-sans), system-ui,
    sans-serif;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.profileHero {
  display: grid;
  grid-template-columns: minmax(0, 380px) minmax(0, 1fr);
  gap: 1.6rem;
  padding: 2rem;
  border-radius: 24px;
  border: 1px solid rgba(153, 69, 255, 0.4);
  background: linear-gradient(135deg, rgba(12, 3, 36, 0.92), rgba(7, 0, 28, 0.82));
  box-shadow: 0 28px 70px rgba(20, 241, 149, 0.18);
}

.heroCard {
  display: flex;
  align-items: center;
  gap: 1.4rem;
  flex-wrap: wrap;
}

.heroAvatar {
  width: 180px;
  height: 180px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.2rem;
  color: #08021e;
  font-weight: 700;
  box-shadow: 0 0 26px rgba(20, 241, 149, 0.5);
  image-rendering: pixelated;
}

.heroAvatar span {
  text-transform: uppercase;
}

.heroDetails {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  align-items: flex-start;
}

.usernameDisplay {
  display:flex;
  flex-direction:column;
  gap:0.35rem;
}

.usernameHeader {
  display:flex;
  align-items:center;
  gap:0.4rem;
}

.heroLabel { display:none; }

.heroRight {
  display: flex;
  flex-direction: column;
}

.heroStats {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.heroStats {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.statsGrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 1rem;
}

.statCard {
  padding: 1rem 1.2rem;
  border-radius: 8px;
  border: 1px solid rgba(20, 241, 149, 0.3);
  background: rgba(7, 1, 26, 0.75);
  box-shadow: 0 16px 40px rgba(20, 241, 149, 0.15);
}

.statLabel {
  margin: 0;
  font-size: 0.6rem;
  color: rgba(234, 253, 244, 0.6);
}

.statValue {
  margin: 0.35rem 0;
  font-size: 0.95rem;
  color: #14f195;
}

.statSublabel {
  margin: 0;
  font-size: 0.56rem;
  color: rgba(234, 253, 244, 0.6);
  text-transform: none;
}

.heroBadge img {
  width: 18px;
  height: 18px;
  image-rendering: pixelated;
  filter: invert(71%) sepia(67%) saturate(637%) hue-rotate(92deg)
    brightness(96%) contrast(95%);
}

.sectionHeader {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.8rem;
  text-transform: uppercase;
}

.sectionHeader h3 {
  margin: 0;
  font-size: 0.82rem;
  letter-spacing: 0.1em;
  color: #14f195;
}

.sectionHeader span {
  font-size: 0.56rem;
  color: rgba(234, 253, 244, 0.6);
  text-transform: none;
}

.wardrobe {
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
  flex-wrap: wrap;
}

.pfpGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1.1rem;
}

.pfpCard {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.85rem;
  padding: 1.1rem;
  border-radius: 8px;
  border: 1px solid rgba(153, 69, 255, 0.35);
  background: rgba(7, 1, 26, 0.72);
  color: rgba(234, 253, 244, 0.85);
  cursor: pointer;
  transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
}

.pfpCard:hover {
  transform: translateY(-4px);
  border-color: #14f195;
  box-shadow: 0 18px 44px rgba(20, 241, 149, 0.28);
}

.pfpActive {
  border-color: #14f195;
  box-shadow: 0 18px 48px rgba(20, 241, 149, 0.35);
}

.pfpPreview {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.6rem;
  color: #08021e;
  font-weight: 700;
  image-rendering: pixelated;
}

.pfpMeta {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  text-align: left;
}

.pfpName {
  font-size: 0.68rem;
  color: rgba(234, 253, 244, 0.92);
}

.pfpRarity {
  font-size: 0.56rem;
  color: rgba(234, 253, 244, 0.68);
}

.pfpXp {
  font-size: 0.58rem;
  color: #14f195;
}

.achievementSection,
.loadoutSection,
.activitySection,
.questBoard {
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
  flex-wrap: wrap;
}

.badgeGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1.2rem;
}

.badgeCard {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0rem 0.5rem 0rem;
  border-radius: 14px;
  border: 1px solid rgba(153, 69, 255, 0.5);
  background: radial-gradient(circle at top, rgba(20, 241, 149, 0.2), rgba(8, 2, 30, 0.82));
  box-shadow: 0 24px 55px rgba(20, 241, 149, 0.18);
  min-height: 60px;
  overflow: hidden;
  text-transform: none;
}

.badgeCard::before {
  content: "";
  position: absolute;
  inset: -5%;
  border-radius: 20px;
  background: radial-gradient(circle at 30% 20%, rgba(255, 216, 61, 0.22), transparent 70%);
  mix-blend-mode: screen;
  opacity: 0.9;
}

.badgeCard::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 16px;
  border: 2px solid rgba(153, 69, 255, 0.2);
  pointer-events: none;
}

.badgeCardContent {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  align-items: center;
  justify-content: center;
  text-align: center;
  z-index: 1;
}

.badgeCard .badgeIcon {
  width: 44px;
  height: 44px;
  display: block;
  margin-bottom: 0.2rem;
  image-rendering: pixelated;
  filter: drop-shadow(0 0 6px rgba(20, 241, 149, 0.4));
}

.badgeDetails {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  text-transform: none;
  align-items: center;
  text-align: center;
}

.badgeCard h4 {
  margin: 0;
  font-size: 0.82rem;
  color: rgba(234, 253, 244, 0.96);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.badgeCard p {
  margin: 0.6rem 0 0;
  font-size: 0.62rem;
  color: rgba(234, 253, 244, 0.8);
  line-height: 1.55;
}

.badgeStatus {
  align-self: center;
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  font-size: 0.5rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  background: rgba(8, 2, 30, 0.92);
  border: 1px solid rgba(153, 69, 255, 0.5);
  color: rgba(234, 253, 244, 0.78);
  text-align: center;
}

.badge_claimed .badgeStatus {
  border-color: rgba(20, 241, 149, 0.6);
  color: #14f195;
  box-shadow: 0 0 12px rgba(20, 241, 149, 0.35);
}

.badge_claimed {
  border-color: rgba(20, 241, 149, 0.55);
  box-shadow: 0 28px 64px rgba(20, 241, 149, 0.28);
}

.badge_claimed::before {
  background: radial-gradient(circle at top, rgba(20, 241, 149, 0.4), transparent 70%);
}

.badge_claimed h4 {
  color: #14f195;
}

.badge_claimed .badgeIcon {
  filter: drop-shadow(0 0 10px rgba(20, 241, 149, 0.85));
}

.badge_in-progress .badgeStatus {
  border-color: rgba(255, 216, 61, 0.6);
  color: #ffd83d;
  box-shadow: 0 0 12px rgba(255, 216, 61, 0.35);
}

.badge_in-progress {
  border-color: rgba(255, 216, 61, 0.55);
}

.badge_in-progress::before {
  background: radial-gradient(circle at top, rgba(255, 216, 61, 0.38), transparent 70%);
}

.badge_in-progress .badgeIcon {
  filter: drop-shadow(0 0 10px rgba(255, 216, 61, 0.7));
}

.badge_locked .badgeStatus {
  border-color: rgba(153, 69, 255, 0.4);
  color: rgba(204, 206, 224, 0.75);
  background: rgba(12, 14, 24, 0.85);
}

.badge_locked {
  border-color: rgba(176, 178, 196, 0.55);
  background: linear-gradient(135deg, rgba(94, 98, 118, 0.45), rgba(18, 20, 32, 0.85));
  box-shadow: 0 18px 42px rgba(26, 28, 40, 0.35);
  filter: grayscale(0.75);
  opacity: 0.7;
}

.badge_locked h4 {
  color: rgba(210, 212, 226, 0.9);
}

.badge_locked p {
  color: rgba(190, 194, 210, 0.75);
}

.badge_locked .badgeIcon {
  filter: grayscale(1) opacity(0.65);
}

.loadoutList {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
}

.loadoutList li {
  padding: 0.9rem 1rem;
  border-radius: 16px;
  background: rgba(7, 1, 24, 0.85);
  border: 1px solid rgba(153, 69, 255, 0.3);
  font-size: 0.58rem;
  color: rgba(234, 253, 244, 0.8);
  text-transform: none;
}

.activityTimeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1.2rem;
}

.activityTimeline li {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 0.8rem;
  align-items: start;
}

.timelineDot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #14f195;
  box-shadow: 0 0 10px rgba(20, 241, 149, 0.65);
  margin-top: 0.3rem;
}

.timelineCard {
  padding: 1rem 1.1rem;
  border-radius: 16px;
  border: 1px solid rgba(20, 241, 149, 0.3);
  background: rgba(8, 2, 30, 0.78);
}

.timelineHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.8rem;
}

.timelineHeader h4 {
  margin: 0;
  font-size: 0.66rem;
  color: rgba(234, 253, 244, 0.9);
}

.timelineHeader time {
  font-size: 0.54rem;
  color: rgba(234, 253, 244, 0.64);
}

.timelineCard p {
  margin: 0.5rem 0 0;
  font-size: 0.56rem;
  color: rgba(234, 253, 244, 0.72);
  text-transform: none;
}

.questList {
  display: grid;
  gap: 0.85rem;
}

.questRow {
  display: flex;
  gap: 1rem;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.1rem;
  border-radius: 16px;
  border: 1px solid rgba(153, 69, 255, 0.35);
  background: rgba(7, 1, 26, 0.78);
}

.questName {
  margin: 0 0 0.55rem;
  font-size: 0.64rem;
  color: rgba(234, 253, 244, 0.88);
}

.questProgress {
  position: relative;
  width: 220px;
  height: 8px;
  border-radius: 999px;
  background: rgba(234, 253, 244, 0.15);
  overflow: hidden;
}

.questProgressFill {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(90deg, #14f195, #7d3bff);
}

.questReward {
  font-size: 0.6rem;
  color: #14f195;
}

@media (max-width: 960px) {
  .profileHero {
    grid-template-columns: 1fr;
  }

  .heroCard {
    justify-content: center;
  }

  .heroRight {
    gap: 0.8rem;
  }

  .statsGrid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .content {
    padding: 0 1rem 2rem;
    gap: 2rem;
  }

  .statsGrid {
    grid-template-columns: 1fr;
  }

  .pfpGrid {
    grid-template-columns: 1fr;
  }

  .heroBadges {
    grid-template-columns: 1fr;
  }
}

.usernameLabel {
  font-size:0.7rem;
  color:rgba(234,253,244,0.85);
  letter-spacing:0.1em;
}
.usernameIcon {
  width:18px;
  height:18px;
  image-rendering:pixelated;
  filter:none;
}
.usernameInput {
  display:block;
  width:100%;

  background:rgba(7,1,26,0.75);
  border:1px solid rgba(153,69,255,0.4);
  border-radius:10px;
  padding:0.6rem 0.8rem;
  font-family:var(--font-press-start), var(--font-geist-sans), system-ui, sans-serif;
  font-size:0.88rem;
  letter-spacing:0.12em;
  color:#fff;
  text-transform:uppercase;
}
.usernameInput:focus {
  outline:2px dashed rgba(20,241,149,0.7);
  outline-offset:2px;
}

.usernameEdit {
  background:transparent;
  border:none;
  padding:0;
  cursor:pointer;
}

.usernameValue {
  background:transparent;
  border:none;
  padding:0;
  font-family:var(--font-press-start), var(--font-geist-sans), system-ui, sans-serif;
  font-size:1.05rem;
  letter-spacing:0.12em;
  color:#14f195;
  text-transform:uppercase;
  text-align:left;
  cursor:pointer;
}

```

# apps/ui/src/components/__tests__/SwapCard.test.tsx

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SystemProgram } from "@solana/web3.js";
import { afterEach, beforeEach, vi } from "vitest";
import { SwapCard } from "../SwapCard";

const walletPublicKey = SystemProgram.programId;
const disconnectMock = vi.fn();
const getBalanceMock = vi.fn().mockResolvedValue(1_500_000_000);
const sendTransactionMock = vi.fn().mockResolvedValue("mock-signature");
const confirmTransactionMock = vi
  .fn()
  .mockResolvedValue({ value: { err: null } });
const getAddressLookupTableMock = vi
  .fn()
  .mockResolvedValue({ value: null });
const getLatestBlockhashMock = vi.fn().mockResolvedValue({
  blockhash: "11111111111111111111111111111111",
  lastValidBlockHeight: 123456,
});
vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({
    connected: true,
    publicKey: walletPublicKey,
    disconnect: disconnectMock,
    disconnecting: false,
    sendTransaction: sendTransactionMock,
  }),
  useConnection: () => ({
    connection: {
      getBalance: getBalanceMock,
      confirmTransaction: confirmTransactionMock,
      getAddressLookupTable: getAddressLookupTableMock,
      getLatestBlockhash: getLatestBlockhashMock,
    },
  }),
}));

vi.mock("@solana/wallet-adapter-react-ui", () => ({
  useWalletModal: () => ({
    setVisible: vi.fn(),
  }),
}));

describe("SwapCard", () => {
  const mockQuote = {
    amountOut: "980000",
    priceImpactBps: 12,
    routers: [
      { id: "titan", name: "Titan Direct" },
      { id: "jup", name: "Jupiter" },
    ],
    executable: true,
    updatedAt: new Date().toISOString(),
    instructions: [
      {
        programId: SystemProgram.programId.toBase58(),
        accounts: [
          {
            pubkey: walletPublicKey.toBase58(),
            isSigner: true,
            isWritable: true,
          },
        ],
        data: "",
      },
    ],
    addressLookupTables: [],
    computeUnitsSafe: undefined,
  };

  beforeEach(() => {
    disconnectMock.mockReset();
    getBalanceMock.mockResolvedValue(1_500_000_000);
    sendTransactionMock.mockReset();
    confirmTransactionMock.mockClear();
    getAddressLookupTableMock.mockClear();
    getLatestBlockhashMock.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockQuote,
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the swap layout with quote data once wallet is connected", async () => {
    render(<SwapCard />);

    expect(screen.getByText(/you pay/i)).toBeInTheDocument();
    expect(screen.getByText(/you receive/i)).toBeInTheDocument();

    const amountInput = screen.getByLabelText(/amount to pay/i);
    fireEvent.change(amountInput, { target: { value: "1" } });

    expect(await screen.findByText(/quote preview/i)).toBeInTheDocument();
    const swapButton = await screen.findByRole("button", { name: /^swap$/i });
    expect(swapButton).not.toBeDisabled();

    fireEvent.click(swapButton);
    await waitFor(() => expect(sendTransactionMock).toHaveBeenCalled());
  });
});

```

# apps/ui/src/components/BackgroundAudio.tsx

```tsx
"use client";

import { useEffect, useRef } from "react";

type Props = {
  muted: boolean;
};

export const BackgroundAudio = ({ muted }: Props) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.loop = true;
    audio.volume = 0.35;

    const attemptPlay = () => {
      audio
        .play()
        .catch(() => {
          /* autoplay blocked until user gesture */
        });
    };

    attemptPlay();

    const unlock = () => {
      attemptPlay();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = muted;
    if (!muted) {
      void audio.play().catch(() => {
        /* ignore */
      });
    }
  }, [muted]);

  return (
    <audio
      ref={audioRef}
      src="/bgmusic.mp3"
      preload="auto"
      muted={muted}
      aria-hidden="true"
    />
  );
};

```

# apps/ui/src/components/ChatButton.tsx

```tsx
"use client";

import styles from "./HelpChatButtons.module.css";

export const ChatButton = () => {
  return (
    <button
      type="button"
      className={`${styles.btn} ${styles.chatBtn}`}
      aria-label="Chat"
    >
      <img src="/chat.svg" alt="" className={styles.icon} />
    </button>
  );
};

```

# apps/ui/src/components/HelpButton.tsx

```tsx
"use client";

import styles from "./HelpChatButtons.module.css";

export const HelpButton = () => {
  return (
    <button
      type="button"
      className={`${styles.btn} ${styles.helpBtn}`}
      aria-label="Help"
    >
      <img src="/info.svg" alt="" className={`${styles.icon} ${styles.helpIcon}`} />
    </button>
  );
};

```

# apps/ui/src/components/HelpChatButtons.module.css

```css
.btn {
  position: fixed;
  bottom: 24px;
  width: 48px;
  height: 48px;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 150ms ease;
  z-index: 5;
}

.btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(20, 241, 149, 0.35);
  background: rgba(20, 241, 149, 0.18);
  border-radius: 12px;
}

.btn:focus-visible { outline: 2px dashed rgba(234, 253, 244, 0.7); outline-offset: 2px; }

.helpBtn { right: 82px; }
.chatBtn { right: 24px; }

.icon {
  width: 28px;
  height: 28px;
  image-rendering: pixelated;
}

.helpIcon {
  height: 25px; /* ~10% smaller than 28px */
  width: auto;
}

@media (max-width: 768px) {
  .btn { bottom: 16px; width: 44px; height: 44px; }
  .helpBtn { right: 70px; }
  .chatBtn { right: 16px; }
  .icon { width: 26px; height: 26px; }
  .helpIcon { height: 23px; }
}

```

# apps/ui/src/components/SpeakerToggle.module.css

```css
.toggle {
  position: fixed;
  right: 140px;
  bottom: 24px;
  width: 48px;
  height: 48px;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 150ms ease;
  z-index: 5;
}

.toggle:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(20, 241, 149, 0.35);
  background: rgba(20, 241, 149, 0.18);
  border-radius: 12px;
}

.toggle:focus-visible { outline: 2px dashed rgba(234, 253, 244, 0.7); outline-offset: 2px; }

.iconWrap {
  position: relative;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.icon {
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  display: block;
  transform: scaleX(-1);
  transform-origin: center;
}

.iconMuted {
  width: 80%;
  height: 80%;
}

/* Mask to hide waves on the right side of the SVG when muted */
.waveMask {
  position: absolute;
  top: 0;
  right: 0;
  width: 42%;
  height: 100%;
  background: rgba(20, 241, 149, 0.12);
}

@media (max-width: 768px) {
  .toggle {
    right: 124px;
    bottom: 16px;
    width: 44px;
    height: 44px;
    font-size: 1.3rem;
  }

  .iconWrap {
    width: 26px;
    height: 26px;
  }
}

```

# apps/ui/src/components/SpeakerToggle.tsx

```tsx
"use client";

import styles from "./SpeakerToggle.module.css";

type Props = {
  muted: boolean;
  onToggle: (muted: boolean) => void;
  className?: string;
};

export const SpeakerToggle = ({ muted, onToggle, className }: Props) => {
  return (
    <button
      type="button"
      className={`${styles.toggle} ${className ?? ""}`}
      onClick={() => onToggle(!muted)}
      aria-label={muted ? "Unmute background music" : "Mute background music"}
    >
      <span className={styles.iconWrap} aria-hidden="true">
        <img
          src={muted ? "/mute.svg" : "/sound.svg"}
          alt=""
          className={`${styles.icon} ${muted ? styles.iconMuted : ""}`}
        />
      </span>
    </button>
  );
};

```

# apps/ui/src/components/SwapCard.module.css

```css
.swapCard {
  position: relative;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: 1.9rem;
  max-width: 820px;
  width: 100%;
  padding: 2.5rem;
  border-radius: 24px;
  background: rgba(12, 6, 53, 0.88);
  border: none;
  box-shadow:
    0 0 24px rgba(20, 241, 149, 0.35),
    0 0 48px rgba(20, 241, 149, 0.2),
    0 0 32px rgba(0, 0, 0, 0.45),
    inset 0 0 8px rgba(153, 69, 255, 0.4);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  color: #eafdf4;
  font-family: var(--font-press-start), var(--font-geist-sans), system-ui,
    sans-serif;
}

/* Animated conic glow border ring */
.swapCard::before {
  content: "";
  position: absolute;
  inset: -3px;
  border-radius: 26px;
  padding: 3px;
  --angle: 0deg;
  background: conic-gradient(from var(--angle), #00eaff 0, #14f195 50%, #00eaff 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) border-box;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) border-box;
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  animation: swapcard-shift 8s linear infinite;
  z-index: 0;
}

@property --angle {
  syntax: "<angle>";
  initial-value: 0deg;
  inherits: false;
}

@keyframes swapcard-shift {
  to {
    --angle: 360deg;
  }
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 2rem;
  z-index: 1;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(20, 241, 149, 0.25), rgba(153, 69, 255, 0.35));
  color: #14f195;
  font-size: 0.6rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.swapMeta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(234, 253, 244, 0.6);
}

.disconnectButton {
  background: none;
  border: 1px solid rgba(148, 255, 239, 0.3);
  border-radius: 999px;
  padding: 0.25rem 0.6rem;
  font-size: 0.5rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-family: var(--font-press-start), var(--font-geist-sans), system-ui,
    sans-serif;
  color: rgba(148, 255, 239, 0.8);
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease;
}

.disconnectButton:hover {
  border-color: rgba(20, 241, 149, 0.75);
  color: #14f195;
}

.disconnectButton:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tradeBox {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  z-index: 1;
}

.tokenRow {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1.3rem 1.5rem;
  border-radius: 18px;
  background: rgba(8, 2, 30, 0.78);
  border: 2px solid rgba(153, 69, 255, 0.45);
}

.tokenRow:first-of-type {
  padding-bottom: 2.2rem;
}

.tokenRow:last-of-type {
  padding-top: 2.2rem;
}

.rowHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.rowLabel {
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(234, 253, 244, 0.7);
}

.balanceGroup {
  display: flex;
  align-items: center;
}

.balanceLabel {
  font-size: 0.5rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(148, 255, 239, 0.85);
}

.balanceShortcuts {
  display: inline-flex;
  gap: 0.35rem;
}

.shortcutRow {
  position: absolute;
  right: 0;
  top: calc(100% + 0.55rem);
  display: inline-flex;
  gap: 0.35rem;
  pointer-events: auto;
}

.shortcutButton {
  border: 1px solid rgba(148, 255, 239, 0.4);
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  font-size: 0.5rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: rgba(8, 2, 30, 0.7);
  color: rgba(148, 255, 239, 0.85);
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease;
}

.shortcutButton:hover {
  border-color: rgba(20, 241, 149, 0.8);
  color: #14f195;
  background: rgba(12, 4, 38, 0.85);
}

.tokenControls {
  display: flex;
  gap: 0.85rem;
  align-items: center;
  padding-top: 0.35rem;
}

.tokenSelectGroup {
  display: flex;
  align-items: center;
}

.tokenSelect {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
  width: 100%;
  text-align: left;
  background: rgba(14, 3, 44, 0.85);
  border: 2px solid rgba(153, 69, 255, 0.6);
  border-radius: 12px;
  padding: 0.6rem 0.9rem;
  font-size: 0.72rem;
  color: #eafdf4;
  font-family: inherit;
  outline: none;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.15s ease;
}

.tokenSelect:hover {
  border-color: rgba(20, 241, 149, 0.75);
  box-shadow: 0 0 12px rgba(20, 241, 149, 0.3);
}

.tokenSelect:focus-visible {
  border-color: #14f195;
  box-shadow: 0 0 14px rgba(20, 241, 149, 0.45);
}

.tokenSelectContent {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
}

 .tokenSelectSymbol {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.76rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #eafdf4;
}

.tokenSelectChevron {
  width: 16px;
  height: 16px;
  color: rgba(234, 253, 244, 0.7);
  transition: transform 0.2s ease;
}

.tokenSelect:hover .tokenSelectChevron {
  transform: translateY(2px);
}

.tokenLogo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(20, 241, 149, 0.15);
  color: #14f195;
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  overflow: hidden;
}

.tokenLogoSmall {
  width: 30px;
  height: 30px;
  font-size: 0.6rem;
}

.amountGroup {
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  gap: 0.45rem;
  position: relative;
}

.tokenAmount {
  width: 100%;
  background: transparent;
  border: none;
  text-align: right;
  font-size: 1.28rem;
  color: #eafdf4;
  font-family: inherit;
  outline: none;
}

.tokenAmount:focus {
  border: none;
}

.tokenAmount[readonly] {
  color: rgba(234, 253, 244, 0.85);
}

.tokenModalOverlay {
  position: fixed;
  inset: 0;
  background: rgba(7, 3, 20, 0.65);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
  padding: 1.25rem;
}

.tokenModal {
  width: min(520px, 100%);
  max-height: min(75vh, 620px);
  background: rgba(10, 4, 34, 0.96);
  border-radius: 20px;
  border: 1px solid rgba(153, 69, 255, 0.55);
  box-shadow:
    0 0 36px rgba(20, 241, 149, 0.25),
    0 0 20px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tokenModalHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem 0.5rem;
}

.tokenModalTitle {
  font-size: 0.9rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #eafdf4;
  font-family: var(--font-press-start), var(--font-geist-sans), system-ui, sans-serif;
}

.tokenModalClose {
  border: none;
  background: rgba(20, 241, 149, 0.12);
  border-radius: 8px;
  width: 32px;
  height: 32px;
  color: #14f195;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
}

.tokenModalClose:hover {
  background: rgba(20, 241, 149, 0.25);
}

.tokenSearchRow {
  padding: 0 1.25rem 0.75rem;
}

.tokenSearchInput {
  width: 100%;
  padding: 0.65rem 0.85rem;
  border-radius: 12px;
  border: 2px solid rgba(153, 69, 255, 0.5);
  background: rgba(14, 3, 44, 0.9);
  color: #eafdf4;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.tokenSearchInput:focus {
  border-color: #14f195;
  box-shadow: 0 0 12px rgba(20, 241, 149, 0.35);
}

.tokenModalBody {
  flex: 1;
  padding: 0 1.25rem 1.25rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.tokenStatus {
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  color: rgba(234, 253, 244, 0.7);
}

.tokenError {
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  color: #ff7a9c;
  margin-top: 0.4rem;
}

.tokenSection {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.tokenSectionTitle {
  font-size: 0.62rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(234, 253, 244, 0.65);
}

.tokenList {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.5rem;
  list-style: none;
  padding: 0;
  margin: 0;
}

.tokenListItem {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.6rem 0.7rem;
  border-radius: 12px;
  border: 1px solid rgba(153, 69, 255, 0.45);
  background: rgba(12, 4, 38, 0.9);
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.2s ease, transform 0.15s ease;
}

.tokenListItem:hover:not(.tokenListItemDisabled) {
  border-color: rgba(20, 241, 149, 0.7);
  transform: translateY(-1px);
}

.tokenListItemActive {
  border-color: #14f195;
  box-shadow: 0 0 14px rgba(20, 241, 149, 0.35);
}

.tokenListItemDisabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tokenMeta {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.tokenSymbol {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #eafdf4;
}

.tokenName {
  font-size: 0.6rem;
  color: rgba(234, 253, 244, 0.7);
}

.tokenMint {
  font-size: 0.52rem;
  letter-spacing: 0.08em;
  color: rgba(234, 253, 244, 0.5);
}

.tokenVerified {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0.9rem;
  height: 0.9rem;
  padding: 0 0.2rem;
  border-radius: 4px;
  background: rgba(20, 241, 149, 0.18);
  color: #14f195;
  font-size: 0.55rem;
  letter-spacing: 0;
}

.tokenEmpty {
  grid-column: 1 / -1;
  padding: 0.75rem;
  border-radius: 12px;
  background: rgba(14, 3, 44, 0.6);
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  text-align: center;
  color: rgba(234, 253, 244, 0.65);
}

.tokenCustomAction {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.85rem;
  border-radius: 12px;
  border: 1px dashed rgba(20, 241, 149, 0.45);
  background: rgba(8, 2, 30, 0.6);
}

.tokenCustomHint {
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  color: rgba(234, 253, 244, 0.7);
}

.tokenCustomButton {
  align-self: flex-start;
  border: 1px solid rgba(20, 241, 149, 0.8);
  background: rgba(20, 241, 149, 0.18);
  color: #14f195;
  border-radius: 999px;
  padding: 0.35rem 0.9rem;
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.tokenCustomButton:hover:not(:disabled) {
  background: rgba(20, 241, 149, 0.32);
}

.tokenCustomButton:disabled {
  opacity: 0.6;
  cursor: progress;
}

.switchButton {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 12px;
  border: 3px solid rgba(148, 255, 239, 0.5);
  background: linear-gradient(145deg, rgba(6, 0, 22, 0.95), rgba(24, 10, 54, 0.85));
  cursor: pointer;
  box-shadow:
    inset 0 0 0 2px rgba(20, 241, 149, 0.15),
    0 0 16px rgba(148, 255, 239, 0.25);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.switchButton:hover {
  border-color: rgba(20, 241, 149, 0.75);
  box-shadow:
    inset 0 0 0 2px rgba(20, 241, 149, 0.3),
    0 0 18px rgba(148, 255, 239, 0.45);
  transform: translate(-50%, -50%) translateY(-3px);
}

.switchIcon {
  width: 32px;
  height: 32px;
  display: block;
  image-rendering: pixelated;
}

.arrowUp rect,
.arrowDown rect {
  fill: #14f195;
}


.estimateTag {
  font-size: 0.55rem;
  letter-spacing: 0.08em;
  color: rgba(234, 253, 244, 0.6);
}

.quoteSummary {
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
  padding: 1.6rem;
  border-radius: 18px;
  background: rgba(8, 2, 30, 0.8);
  border: 2px solid rgba(153, 69, 255, 0.4);
  z-index: 1;
}

.quoteSummary h2 {
  font-size: 0.79rem;
  color: #94ffef;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.summaryGrid {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1.25rem;
  width: 100%;
}

/* Stretch 3 columns left / center / right */
.summaryItem {
  flex: 1 1 0;
  min-width: 0;
}

.summaryItem:nth-child(1) {
  text-align: left;
}

.summaryItem:nth-child(2) {
  text-align: center;
}

.summaryItem:nth-child(3) {
  text-align: right;
}

.summaryItem {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.summaryLabel {
  font-size: 0.53rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(234, 253, 244, 0.55);
}

.summaryValue {
  font-size: 0.7rem;
  color: #eafdf4;
}

.summaryHelp {
  margin-top: 0.25rem;
  font-size: 0.55rem;
  line-height: 1.6;
  color: rgba(234, 253, 244, 0.55);
}

.swapButton {
  align-self: stretch;
  background: linear-gradient(135deg, #14f195, #9945ff);
  border: none;
  border-radius: 18px;
  padding: 0.95rem 1.4rem;
  font-size: 0.84rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: #050315;
  font-family: inherit;
  cursor: not-allowed;
  opacity: 0.6;
  z-index: 1;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.swapButton:not(:disabled) {
  cursor: pointer;
  opacity: 1;
}

.swapButton:not(:disabled):hover {
  transform: translateY(-2px);
}

.swapFeedback {
  margin-top: 0.75rem;
  font-size: 0.55rem;
  letter-spacing: 0.08em;
  color: rgba(148, 255, 239, 0.85);
  word-break: break-word;
  position: relative;
  z-index: 2;
}

.swapFeedback a {
  color: #14f195;
  text-decoration: underline;
  pointer-events: auto;
}

/* Success toast overlay */
.successToastOverlay {
  position: fixed;
  left: 0;
  top: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.6);
  display: grid;
  place-items: center;
  z-index: 2147483647; /* ensure above any local stacking contexts */
  /* persistent until user closes */
  animation: none;
  pointer-events: all;
  will-change: opacity;
}

.successToastVideo {
  width: 160px;
  height: auto;
  object-fit: contain;
  filter: drop-shadow(0 10px 24px rgba(20, 241, 149, 0.35));
}

.successToastContent {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  text-align: center;
  position: relative; /* anchor close icon relative to centered content */
  padding: 1rem 1.25rem 1.25rem;
}

.successToastTitle {
  font-family: var(--font-press-start), var(--font-geist-sans), system-ui, sans-serif;
  font-size: 0.9rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #eafdf4;
}

.successToastLink {
  color: #14f195;
  text-decoration: underline;
  font-size: 0.8rem;
  font-family: var(--font-press-start), var(--font-geist-sans), system-ui, sans-serif;
}

.successToastCloseIcon {
  position: absolute;
  /* top-right corner of centered content */
  top: 8px;
  right: 8px;
  width: 42px;
  height: 42px;
  border: 2px solid #14f195;
  border-radius: 10px;
  background: rgba(20, 241, 149, 0.12);
  color: #14f195;
  font-family: var(--font-press-start), var(--font-geist-sans), system-ui, sans-serif;
  font-size: 1rem;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.swapFeedbackError {
  margin-top: 0.75rem;
  font-size: 0.55rem;
  letter-spacing: 0.08em;
  color: #ff7a9c;
}

.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

@media (max-width: 900px) {
  .header {
    flex-direction: row;
    align-items: center;
    gap: 1rem;
  }

  .swapMeta {
    flex-direction: row;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
  }

  .tokenControls {
    flex-direction: row; /* keep single-row layout on mobile */
    align-items: center;
  }

  .amountGroup {
    align-items: center;
    text-align: right;
  }

  .tokenAmount {
    text-align: right;
  }

  .switchButton {
    width: 48px;
    height: 48px;
  }

  .balanceGroup {
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.4rem;
  }
}

@media (max-width: 600px) {
  .swapCard {
    padding: 1.9rem 1.5rem;
    gap: 1.4rem;
  }

  .header h1 {
    font-size: 0.99rem;
  }

  .tokenRow {
    padding: 1rem 1.05rem;
    gap: 0.7rem;
  }

  .tokenRow:first-of-type {
    padding-bottom: 1.35rem;
  }

  .tokenRow:last-of-type {
    padding-top: 1.35rem;
  }

  .tokenAmount {
    font-size: 1.09rem;
  }

  .balanceGroup {
    flex-direction: column;
    align-items: flex-start;
  }

  .tradeBox {
    gap: 0.9rem;
  }

  .quoteSummary {
    padding: 1.25rem 1.1rem;
    gap: 0.85rem;
  }

  .summaryGrid {
    gap: 0.9rem;
  }
}

```

# apps/ui/src/components/SwapCard.tsx

```tsx
"use client";

import { Buffer } from "buffer";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  AddressLookupTableAccount,
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { useQuotePreview } from "@/lib/hooks/useQuotePreview";
import { buildApiUrl } from "@/lib/api";
import { toBaseUnits } from "@/lib/solana/validation";
import type { TokenOption } from "@/lib/tokens";
import {
  DEFAULT_TOKEN_OPTIONS,
  WRAPPED_SOL_MINT,
} from "@/lib/tokens";
import { TokenSelector } from "./TokenSelector";
import styles from "./SwapCard.module.css";

type QuoteInstructionAccount = {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
};

type QuoteInstruction = {
  programId: string;
  accounts: QuoteInstructionAccount[];
  data: string;
};

const DEFAULT_SLIPPAGE_BPS = 50;
const DEFAULT_PRIORITY_FEE = 0;

const formatNumber = (value: number, maximumFractionDigits = 6) =>
  Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits,
      }).format(value)
    : "—";

export const SwapCard = () => {
  const [fromToken, setFromToken] = useState<TokenOption>(
    DEFAULT_TOKEN_OPTIONS[0],
  );
  const [toToken, setToToken] = useState<TokenOption>(
    DEFAULT_TOKEN_OPTIONS[1],
  );
  const [amountIn, setAmountIn] = useState("0");
  // Balance of the currently selected pay token (display units, e.g., SOL/USDC)
  const [payBalance, setPayBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [lastSignature, setLastSignature] = useState<string | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const isBrowser = typeof window !== "undefined";

  const extractUiAmount = (data: unknown): number => {
    if (typeof data !== "object" || data === null) return 0;
    const maybeParsed = (data as Record<string, unknown>)["parsed"];
    if (typeof maybeParsed !== "object" || maybeParsed === null) return 0;
    const info = (maybeParsed as Record<string, unknown>)["info"];
    if (typeof info !== "object" || info === null) return 0;
    const tokenAmount = (info as Record<string, unknown>)["tokenAmount"];
    if (typeof tokenAmount !== "object" || tokenAmount === null) return 0;
    const uiAmount = (tokenAmount as Record<string, unknown>)["uiAmount"];
    return typeof uiAmount === "number" && Number.isFinite(uiAmount) ? uiAmount : 0;
  };

  const { connection } = useConnection();
  const { connected, publicKey, disconnect, disconnecting, sendTransaction } =
    useWallet();
  const { setVisible } = useWalletModal();

  const walletConnected = Boolean(connected && publicKey);
  const publicKeyBase58 = publicKey?.toBase58();

  const parsedAmount = Number(amountIn);
  const sanitizedAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;

  const amountInBaseUnits =
    sanitizedAmount > 0
      ? toBaseUnits(sanitizedAmount, fromToken.decimals)
      : "0";

  const quoteState = useQuotePreview({
    inMint: fromToken.mint,
    outMint: toToken.mint,
    amountIn: amountInBaseUnits,
    slippageBps: DEFAULT_SLIPPAGE_BPS,
    priorityFee: DEFAULT_PRIORITY_FEE,
    userPublicKey: publicKeyBase58,
    enabled: walletConnected,
  });

  const quoteData = quoteState.status === "success" ? quoteState.data : null;

  useEffect(() => {
    let cancelled = false;

    if (!walletConnected || !publicKey) {
      setPayBalance(null);
      return;
    }

    const refreshBalance = async () => {
      try {
        setBalanceLoading(true);
        // SOL uses native balance; SPL tokens use parsed token accounts by mint
        if (fromToken.mint === WRAPPED_SOL_MINT) {
          const lamports = await connection.getBalance(publicKey, {
            commitment: "processed",
          });
          if (!cancelled) {
            setPayBalance(lamports / LAMPORTS_PER_SOL);
          }
        } else {
          const mintKey = new PublicKey(fromToken.mint);
          const parsed = await connection.getParsedTokenAccountsByOwner(
            publicKey,
            { mint: mintKey },
            "processed",
          );
          const total = parsed.value.reduce((sum, acc) => {
            const amt = extractUiAmount(acc.account.data as unknown);
            return sum + (Number.isFinite(amt) ? amt : 0);
          }, 0);
          if (!cancelled) {
            setPayBalance(total);
          }
        }
      } catch (error) {
        if (!cancelled) setPayBalance(0);
        console.error("Failed to load token balance", error);
      } finally {
        if (!cancelled) {
          setBalanceLoading(false);
        }
      }
    };

    void refreshBalance();

    return () => {
      cancelled = true;
    };
  }, [connection, publicKey, walletConnected, fromToken]);

  // Auto-dismiss benign wallet errors like "user rejected the request"
  useEffect(() => {
    if (!swapError) return;
    const normalized = swapError.toLowerCase();
    if (!normalized.includes("user rejected")) return;
    const timer = setTimeout(() => setSwapError(null), 5000);
    return () => clearTimeout(timer);
  }, [swapError]);

  const amountOutValue = useMemo(() => {
    if (!quoteData) return 0;
    const numeric = Number(quoteData.amountOut);
    const divisor = 10 ** toToken.decimals;
    return Number.isFinite(numeric) ? numeric / divisor : 0;
  }, [quoteData, toToken.decimals]);

  const minReceived = amountOutValue * (1 - DEFAULT_SLIPPAGE_BPS / 10_000);

  const routersLabel = quoteData
    ? quoteData.routers.join(" → ")
    : quoteState.status === "error"
      ? "Failed to load"
      : "Streaming…";

  // priceImpactLabel and quoteStatusLabel omitted from UI for now to reduce noise


  const formattedAmountOut =
    walletConnected && amountOutValue > 0
      ? formatNumber(amountOutValue, 6)
      : "0.000000";

  // USDC estimate of the output amount using Titan quotes
  const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const [usdcEstimate, setUsdcEstimate] = useState<number | null>(null);
  const [usdcEstimateLoading, setUsdcEstimateLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    if (!walletConnected || !publicKeyBase58 || !quoteData) {
      setUsdcEstimate(null);
      return () => controller.abort();
    }
    const outTokens = amountOutValue;
    if (!outTokens || outTokens <= 0) {
      setUsdcEstimate(null);
      return () => controller.abort();
    }
    if (toToken.mint === USDC_MINT) {
      setUsdcEstimate(outTokens);
      return () => controller.abort();
    }
    const fetchEstimate = async () => {
      try {
        setUsdcEstimateLoading(true);
        const res = await fetch(buildApiUrl("/api/frogx/quotes"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inMint: toToken.mint,
            outMint: USDC_MINT,
            amountIn: toBaseUnits(outTokens, toToken.decimals),
            slippageBps: 0,
            priorityFee: 0,
            userPublicKey: publicKeyBase58,
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { amountOut?: string };
        const outRaw = Number(data?.amountOut ?? 0);
        const usdc = Number.isFinite(outRaw) ? outRaw / 10 ** 6 : 0;
        setUsdcEstimate(usdc > 0 ? usdc : 0);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setUsdcEstimate(null);
        }
      } finally {
        setUsdcEstimateLoading(false);
      }
    };
    fetchEstimate();
    return () => controller.abort();
  }, [walletConnected, publicKeyBase58, quoteData, amountOutValue, toToken.mint, toToken.decimals]);

  const formattedUsdcEstimate =
    usdcEstimate !== null && usdcEstimate > 0
      ? formatNumber(usdcEstimate, 2)
      : usdcEstimateLoading
        ? "…"
        : "—";

  // Price of 1 SOL in USDC (via Titan)
  const [solUsdcPrice, setSolUsdcPrice] = useState<number | null>(null);
  const [solPriceLoading, setSolPriceLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    if (!walletConnected || !publicKeyBase58) {
      setSolUsdcPrice(null);
      return () => controller.abort();
    }
    const fetchSolPrice = async () => {
      try {
        setSolPriceLoading(true);
        const res = await fetch(buildApiUrl("/api/frogx/quotes"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inMint: WRAPPED_SOL_MINT,
            outMint: USDC_MINT,
            amountIn: toBaseUnits(1, 9),
            slippageBps: 0,
            priorityFee: 0,
            userPublicKey: publicKeyBase58,
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { amountOut?: string };
        const outRaw = Number(data?.amountOut ?? 0);
        const price = Number.isFinite(outRaw) ? outRaw / 10 ** 6 : 0;
        setSolUsdcPrice(price > 0 ? price : 0);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSolUsdcPrice(null);
        }
      } finally {
        setSolPriceLoading(false);
      }
    };
    fetchSolPrice();
    return () => controller.abort();
  }, [walletConnected, publicKeyBase58]);

  const minReceivedLabel =
    walletConnected && minReceived > 0
      ? `${formatNumber(minReceived, 6)} ${toToken.symbol}`
      : "—";

  // price per input omitted from UI for now

  const decodeBase64ToUint8Array = (value: string) => {
    if (typeof atob === "function") {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    }

    const buffer = Buffer.from(value, "base64");
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  };

  const toTransactionInstruction = (instruction: QuoteInstruction) =>
    new TransactionInstruction({
      programId: new PublicKey(instruction.programId),
      keys: instruction.accounts.map((account) => ({
        pubkey: new PublicKey(account.pubkey),
        isSigner: account.isSigner,
        isWritable: account.isWritable,
      })),
      data: Buffer.from(instruction.data, "base64"),
    });

  const loadLookupTables = async (addresses: string[]) => {
    if (!addresses.length) {
      return [] as AddressLookupTableAccount[];
    }

    const tables = await Promise.all(
      addresses.map(async (address) => {
        const lookup = await connection.getAddressLookupTable(
          new PublicKey(address),
        );
        return lookup.value ?? null;
      }),
    );

    return tables.filter(
      (table): table is AddressLookupTableAccount => Boolean(table),
    );
  };

  const buildTransactionFromInstructions = async () => {
    if (!quoteData?.instructions?.length || !publicKey) {
      throw new Error("Quote missing route instructions");
    }

    const instructionList =
      quoteData.instructions?.map(toTransactionInstruction) ?? [];
    const lookupTables = await loadLookupTables(
      quoteData.addressLookupTables ?? [],
    );
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("finalized");
    const message = new TransactionMessage({
      payerKey: publicKey,
      recentBlockhash: blockhash,
      instructions: instructionList,
    }).compileToV0Message(lookupTables);

    return {
      transaction: new VersionedTransaction(message),
      blockhash,
      lastValidBlockHeight,
    };
  };

  const handleSwitchTokens = () => {
    setFromToken(toToken);
    setToToken(fromToken);
  };

  const handleSelectFromToken = (token: TokenOption) => {
    if (token.mint === fromToken.mint) {
      setFromToken(token);
      return;
    }
    const previousFrom = fromToken;
    setFromToken(token);
    if (token.mint === toToken.mint) {
      setToToken(previousFrom);
    }
  };

  const handleSelectToToken = (token: TokenOption) => {
    if (token.mint === toToken.mint) {
      setToToken(token);
      return;
    }
    const previousTo = toToken;
    setToToken(token);
    if (token.mint === fromToken.mint) {
      setFromToken(previousTo);
    }
  };

  const handleAmountChange = (value: string) => {
    if (value === "" || /^\d*(\.\d*)?$/.test(value)) {
      setAmountIn(value);
    }
  };

  const balanceLabel = walletConnected
    ? balanceLoading
      ? "…"
      : formatNumber(payBalance ?? 0, 6)
    : "—";

  const canUseBalanceShortcuts = walletConnected && payBalance !== null;
  const displayedBalance = balanceLabel;

  const toInputAmount = (value: number) => {
    const fixed = value.toFixed(6);
    return fixed.replace(/\.0+$|0+$/, "").replace(/\.$/, "");
  };

  const handleBalanceShortcut = (ratio: number) => {
    if (!canUseBalanceShortcuts) return;
    const target = (payBalance ?? 0) * ratio;
    setAmountIn(target > 0 ? toInputAmount(target) : "0");
  };

  useEffect(() => {
    setSwapError(null);
    setLastSignature(null);
    setIsSwapping(false);
  }, [quoteData?.routeId, walletConnected]);

  const hasExecutableQuote = Boolean(
    walletConnected &&
      quoteData &&
      (quoteData.transactionBase64 ||
        (quoteData.instructions?.length ?? 0) > 0),
  );

  const handleSwap = async () => {
    if (!walletConnected) {
      setVisible(true);
      return;
    }

    if (!publicKey || !sendTransaction) {
      setSwapError("Wallet does not support sending transactions");
      return;
    }

    if (!hasExecutableQuote) {
      setSwapError("Quote not ready for execution");
      return;
    }

    try {
      setIsSwapping(true);
      setSwapError(null);

      let transaction: VersionedTransaction;
      let confirmationParams: { blockhash: string; lastValidBlockHeight: number } | null =
        null;

      if (quoteData?.transactionBase64) {
        const bytes = decodeBase64ToUint8Array(quoteData.transactionBase64);
        transaction = VersionedTransaction.deserialize(bytes);
      } else {
        const built = await buildTransactionFromInstructions();
        transaction = built.transaction;
        confirmationParams = {
          blockhash: built.blockhash,
          lastValidBlockHeight: built.lastValidBlockHeight,
        };
      }

      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: false,
      });

      if (confirmationParams) {
        await connection.confirmTransaction(
          {
            signature,
            blockhash: confirmationParams.blockhash,
            lastValidBlockHeight: confirmationParams.lastValidBlockHeight,
          },
          "confirmed",
        );
      } else {
        await connection.confirmTransaction(signature, "confirmed");
      }

      setLastSignature(signature);
      // Success toast overlay with money sticker; stays until user closes
      setShowSuccessToast(true);
    } catch (error) {
      console.error("Swap failed", error);
      setSwapError((error as Error).message ?? "Swap failed");
    } finally {
      setIsSwapping(false);
    }
  };

  const primaryActionLabel = (() => {
    if (!walletConnected) return "Connect Wallet";
    if (isSwapping) return "Swapping...";
    if (hasExecutableQuote) return "Swap";
    if (quoteState.status === "loading") return "Fetching quote...";
    return "Swap (Coming Soon)";
  })();

  const primaryActionDisabled = walletConnected
    ? !hasExecutableQuote || isSwapping
    : false;

  const handlePrimaryAction = () => {
    if (!walletConnected) {
      setVisible(true);
      return;
    }

    if (!hasExecutableQuote || isSwapping) {
      return;
    }

    void handleSwap();
  };

  return (
    <div className={styles.swapCard}>
      {showSuccessToast && isBrowser &&
        createPortal(
          <div
            className={styles.successToastOverlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="swap-success-title"
          >
            <div className={styles.successToastContent}>
              <button
                type="button"
                className={styles.successToastCloseIcon}
                onClick={() => setShowSuccessToast(false)}
                aria-label="Close success message"
                title="Close"
              >
                ×
              </button>
              <video
                className={styles.successToastVideo}
                src="/sticker/money.webm"
                autoPlay
                loop
                muted
                playsInline
              />
              <h3 id="swap-success-title" className={styles.successToastTitle}>
                Swap Successful!
              </h3>
              {lastSignature && (
                <a
                  className={styles.successToastLink}
                  href={`https://solscan.io/tx/${lastSignature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={lastSignature}
                >
                  View on Solscan
                </a>
              )}
            </div>
          </div>,
          document.body,
        )}
      <header className={styles.header}>
        <div>
          <span className={styles.badge}>Swap</span>
        </div>
        <div className={styles.swapMeta}>
          {walletConnected && (
            <button
              type="button"
              className={styles.disconnectButton}
              onClick={() => void disconnect()}
              disabled={disconnecting}
            >
              Disconnect
            </button>
          )}
        </div>
      </header>

      <section className={styles.tradeBox}>
        <div className={styles.tokenRow}>
          <div className={styles.rowHeader}>
            <span className={styles.rowLabel}>You Pay</span>
            <div className={styles.balanceGroup}>
              <span className={styles.balanceLabel}>
                Balance: {displayedBalance} {fromToken.symbol}
              </span>
            </div>
          </div>

          <div className={styles.tokenControls}>
            <div className={styles.tokenSelectGroup}>
              <TokenSelector
                id="fromToken"
                label="Select token to pay"
                selectedToken={fromToken}
                onSelect={handleSelectFromToken}
                disallowMint={toToken.mint}
              />
            </div>

            <div className={styles.amountGroup}>
              <label className={styles.srOnly} htmlFor="fromAmount">
                Amount to pay
              </label>
              <input
                id="fromAmount"
                className={styles.tokenAmount}
                inputMode="decimal"
                value={amountIn}
                onChange={(event) => handleAmountChange(event.target.value)}
                placeholder="0.00"
              />
              {canUseBalanceShortcuts && (
                <div className={styles.shortcutRow}>
                  <div className={styles.balanceShortcuts}>
                    <button
                      type="button"
                      className={styles.shortcutButton}
                      onClick={() => handleBalanceShortcut(0.5)}
                    >
                      50%
                    </button>
                    <button
                      type="button"
                      className={styles.shortcutButton}
                      onClick={() => handleBalanceShortcut(1)}
                    >
                      Max
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          className={styles.switchButton}
          onClick={handleSwitchTokens}
          aria-label="Switch tokens"
        >
          <svg
            className={styles.switchIcon}
            viewBox="0 0 48 32"
            role="img"
            aria-hidden="true"
            focusable="false"
            shapeRendering="crispEdges"
          >
            <g className={styles.arrowUp}>
              <rect x="8" y="2" width="4" height="4" />
              <rect x="4" y="6" width="4" height="4" />
              <rect x="8" y="6" width="4" height="4" />
              <rect x="12" y="6" width="4" height="4" />
              <rect x="0" y="10" width="4" height="4" />
              <rect x="4" y="10" width="4" height="4" />
              <rect x="8" y="10" width="4" height="4" />
              <rect x="12" y="10" width="4" height="4" />
              <rect x="16" y="10" width="4" height="4" />
              <rect x="8" y="14" width="4" height="4" />
              <rect x="8" y="18" width="4" height="4" />
            </g>
            <g className={styles.arrowDown} transform="translate(24 0)">
              <rect x="8" y="26" width="4" height="4" />
              <rect x="4" y="22" width="4" height="4" />
              <rect x="8" y="22" width="4" height="4" />
              <rect x="12" y="22" width="4" height="4" />
              <rect x="0" y="18" width="4" height="4" />
              <rect x="4" y="18" width="4" height="4" />
              <rect x="8" y="18" width="4" height="4" />
              <rect x="12" y="18" width="4" height="4" />
              <rect x="16" y="18" width="4" height="4" />
              <rect x="8" y="14" width="4" height="4" />
              <rect x="8" y="10" width="4" height="4" />
            </g>
          </svg>
          <span className={styles.srOnly}>Switch tokens</span>
        </button>

        <div className={styles.tokenRow}>
          <div className={styles.rowHeader}>
            <span className={styles.rowLabel}>You Receive</span>
            <span className={styles.estimateTag}>
              {usdcEstimate !== null && usdcEstimate > 0
                ? `$${formattedUsdcEstimate}`
                : usdcEstimateLoading
                  ? "…"
                  : "—"}
            </span>
          </div>

          <div className={styles.tokenControls}>
            <div className={styles.tokenSelectGroup}>
              <TokenSelector
                id="toToken"
                label="Select token to receive"
                selectedToken={toToken}
                onSelect={handleSelectToToken}
                disallowMint={fromToken.mint}
              />
            </div>

            <div className={styles.amountGroup}>
              <label className={styles.srOnly} htmlFor="toAmount">
                Estimated amount to receive
              </label>
              <input
                id="toAmount"
                className={styles.tokenAmount}
                value={formattedAmountOut}
                readOnly
              />
            </div>
          </div>
        </div>
      </section>

      {walletConnected && (
        <section className={styles.quoteSummary}>
          <h2>Quote Preview</h2>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Route</span>
              <span className={styles.summaryValue}>{routersLabel}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Min</span>
              <span className={styles.summaryValue}>{minReceivedLabel}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>1 SOL</span>
              <span className={styles.summaryValue}>
                {solUsdcPrice !== null && solUsdcPrice > 0
                  ? `$${formatNumber(solUsdcPrice, 2)}`
                  : solPriceLoading
                    ? "…"
                    : "—"}
              </span>
            </div>
          </div>
        </section>
      )}

      <button
        className={styles.swapButton}
        type="button"
        onClick={handlePrimaryAction}
        disabled={primaryActionDisabled || disconnecting}
      >
        {primaryActionLabel}
      </button>
      {swapError && (
        <p className={styles.swapFeedbackError}>{swapError}</p>
      )}
      {/* Success message now shown in the toast overlay only */}
    </div>
  );
};

```

# apps/ui/src/components/Ticker.tsx

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "@/app/page.module.css";
import { DEFAULT_TOKEN_OPTIONS } from "@/lib/tokens";

const API_BASE = "https://lite-api.jup.ag/tokens/v2";
const TOP_ORGANIC_URL = `${API_BASE}/toporganicscore/5m?limit=50`;
const MIN_ORGANIC_SCORE = 93;
const MAX_TICKER_ITEMS = 25;

type JupiterTokenStats = {
  priceChange?: number;
};

type JupiterTokenResponse = {
  id: string;
  symbol?: string;
  name?: string;
  organicScore?: number;
  isVerified?: boolean;
  tags?: string[];
  stats24h?: JupiterTokenStats;
  stats6h?: JupiterTokenStats;
  stats1h?: JupiterTokenStats;
  stats5m?: JupiterTokenStats;
};

type TickerEntry = {
  id: string;
  symbol: string;
  priceChangePct: number;
};

const FALLBACK_ENTRIES: TickerEntry[] = DEFAULT_TOKEN_OPTIONS.slice(0, 8).map(
  (token, index) => ({
    id: `${token.mint}-${index}`,
    symbol: token.symbol,
    priceChangePct: 0,
  }),
);

const pickPriceChange = (token: JupiterTokenResponse): number | null => {
  const stats = token.stats6h;
  if (!stats) return null;
  const value = stats.priceChange;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

export const Ticker = () => {
  const [entries, setEntries] = useState<TickerEntry[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadTicker = async () => {
      try {
        const response = await fetch(TOP_ORGANIC_URL, {
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`Ticker request failed (${response.status})`);
        }

        const tokens = (await response.json()) as JupiterTokenResponse[];
        if (cancelled) return;

        const filtered = tokens
          .filter((token) => {
            const verified = token.isVerified || token.tags?.includes("verified");
            const score = token.organicScore ?? 0;
            return verified && score >= MIN_ORGANIC_SCORE;
          })
          .map((token) => {
            const priceChange = pickPriceChange(token);
            return {
              id: token.id,
              symbol: token.symbol ?? token.name ?? token.id.slice(0, 4),
              priceChangePct: priceChange ?? 0,
            } satisfies TickerEntry;
          })
          .filter((entry) => entry.symbol);

        if (!filtered.length) return;

        setEntries(filtered.slice(0, MAX_TICKER_ITEMS));
      } catch (error) {
        console.error("Failed to load ticker tokens", error);
      }
    };

    void loadTicker();

    const interval = window.setInterval(loadTicker, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const displayEntries = useMemo(() => {
    if (entries.length === 0) return FALLBACK_ENTRIES;
    return entries;
  }, [entries]);

  const renderItems = (items: TickerEntry[]) =>
    items.map((item) => {
      const price = Number.isFinite(item.priceChangePct)
        ? item.priceChangePct
        : 0;
      const formatted = price === 0 ? "0.0" : price.toFixed(1);
      const sign = price > 0 ? "+" : "";
      const isPositive = price >= 0;

      return (
        <span
          key={`${item.id}-${sign}${formatted}`}
          className={`${styles.tickerItem} ${
            isPositive ? styles.tickerPositive : styles.tickerNegative
          }`}
        >
          {item.symbol} {sign}
          {formatted}%
        </span>
      );
    });

  return (
    <div className={styles.tickerBar} aria-label="Top Solana tokens by organic score">
      <div className={styles.tickerTrack}>
        <div className={styles.tickerContent}>{renderItems(displayEntries)}</div>
        <div className={styles.tickerContent} aria-hidden="true">
          {renderItems(displayEntries)}
        </div>
      </div>
    </div>
  );
};

```

# apps/ui/src/components/TokenSelector.tsx

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { PublicKey } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import type { TokenOption } from "@/lib/tokens";
import {
  DEFAULT_TOKEN_MAP,
  DEFAULT_TOKEN_OPTIONS,
  TRENDING_TOKEN_MINTS,
  formatMintAddress,
} from "@/lib/tokens";
import styles from "./SwapCard.module.css";

const API_BASE = "https://lite-api.jup.ag/tokens/v2";
const SUGGESTED_LIMIT = 12;
const SEARCH_LIMIT = 200;

type JupiterToken = {
  id: string;
  name?: string;
  symbol?: string;
  icon?: string;
  logoURI?: string;
  decimals?: number;
  isVerified?: boolean;
  tags?: string[];
  organicScore?: number;
};

const convertToken = (token: JupiterToken): TokenOption => ({
  mint: token.id,
  symbol: token.symbol ?? formatMintAddress(token.id),
  name: token.name ?? token.symbol ?? formatMintAddress(token.id),
  decimals: typeof token.decimals === "number" ? token.decimals : 0,
  logoURI: token.icon ?? token.logoURI ?? undefined,
  isVerified: Boolean(token.isVerified || token.tags?.includes("verified")),
  tags: token.tags ?? [],
  organicScore: typeof token.organicScore === "number" ? token.organicScore : undefined,
});

const mergeTokens = (base: TokenOption[], extras: TokenOption[]) => {
  const map = new Map(base.map((token) => [token.mint, token]));
  for (const token of extras) {
    const existing = map.get(token.mint);
    if (!existing) {
      map.set(token.mint, token);
      continue;
    }
    map.set(token.mint, {
      ...existing,
      ...token,
      logoURI: token.logoURI ?? existing.logoURI,
      isVerified: existing.isVerified || token.isVerified,
      tags: token.tags?.length ? token.tags : existing.tags,
      organicScore:
        token.organicScore !== undefined
          ? token.organicScore
          : existing.organicScore,
    });
  }
  return Array.from(map.values()).sort((a, b) =>
    a.symbol.localeCompare(b.symbol, "en", { sensitivity: "base" }),
  );
};

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return (await response.json()) as T;
};

let verifiedCache: TokenOption[] | null = null;
let verifiedPromise: Promise<TokenOption[]> | null = null;

const loadVerifiedTokens = () => {
  if (verifiedCache) return Promise.resolve(verifiedCache);
  if (!verifiedPromise) {
    verifiedPromise = fetchJson<JupiterToken[]>(`${API_BASE}/tag?query=verified`)
      .then((tokens) => tokens.map(convertToken))
      .then((tokens) => {
        verifiedCache = tokens;
        return tokens;
      })
      .finally(() => {
        verifiedPromise = null;
      });
  }
  return verifiedPromise;
};

let trendingCache: TokenOption[] | null = null;
let trendingPromise: Promise<TokenOption[]> | null = null;

const loadTrendingTokens = () => {
  if (trendingCache) return Promise.resolve(trendingCache);
  if (!trendingPromise) {
    trendingPromise = fetchJson<JupiterToken[]>(
      `${API_BASE}/toporganicscore/5m?limit=50`,
    )
      .then((tokens) => tokens.map(convertToken))
      .then((tokens) => {
        trendingCache = tokens;
        return tokens;
      })
      .finally(() => {
        trendingPromise = null;
      });
  }
  return trendingPromise;
};

const searchCache = new Map<string, TokenOption[]>();

const searchTokens = async (query: string) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  if (searchCache.has(normalized)) {
    return searchCache.get(normalized)!;
  }
  const results = await fetchJson<JupiterToken[]>(
    `${API_BASE}/search?query=${encodeURIComponent(query)}&limit=${SEARCH_LIMIT}`,
  );
  const converted = results.map(convertToken);
  searchCache.set(normalized, converted);
  return converted;
};

const isValidMintAddress = (value: string) => {
  try {
    new PublicKey(value);
    return value.length >= 32 && value.length <= 44;
  } catch {
    return false;
  }
};

const buildSuggestedList = (candidates: TokenOption[]) => {
  const featuredTokens = DEFAULT_TOKEN_OPTIONS.filter((token) => token.featured);
  const seen = new Set<string>();
  const ordered: TokenOption[] = [];

  const maxPrimary = Math.max(
    0,
    SUGGESTED_LIMIT -
      featuredTokens.filter((token) => !seen.has(token.mint)).length,
  );

  for (const token of candidates) {
    if (token.featured) continue;
    if (seen.has(token.mint)) continue;
    ordered.push(token);
    seen.add(token.mint);
    if (ordered.length >= maxPrimary) break;
  }

  for (const token of featuredTokens) {
    if (seen.has(token.mint)) continue;
    ordered.push(token);
    seen.add(token.mint);
  }

  if (ordered.length < SUGGESTED_LIMIT) {
    for (const token of candidates) {
      if (seen.has(token.mint)) continue;
      ordered.push(token);
      seen.add(token.mint);
      if (ordered.length >= SUGGESTED_LIMIT) break;
    }
  }

  return ordered.slice(0, SUGGESTED_LIMIT);
};

type TokenSelectorProps = {
  id: string;
  label: string;
  selectedToken: TokenOption;
  onSelect: (token: TokenOption) => void;
  disallowMint?: string;
};

export const TokenSelector = ({
  id,
  label,
  selectedToken,
  onSelect,
  disallowMint,
}: TokenSelectorProps) => {
  const { connection } = useConnection();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const trimmedQuery = search.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseTokens, setBaseTokens] = useState<TokenOption[]>(() => [
    ...DEFAULT_TOKEN_OPTIONS,
  ]);
  const [suggestedTokens, setSuggestedTokens] = useState<TokenOption[]>(() =>
    buildSuggestedList(
      TRENDING_TOKEN_MINTS.map((mint) => DEFAULT_TOKEN_MAP.get(mint)!),
    ),
  );
  const [searchResults, setSearchResults] = useState<TokenOption[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  const tokenMap = useMemo(
    () => new Map(baseTokens.map((token) => [token.mint, token])),
    [baseTokens],
  );

  const isMintQuery = isValidMintAddress(trimmedQuery);

  const tokensToDisplay = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }
    return searchResults.slice(0, 200);
  }, [normalizedQuery, searchResults]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    let encounteredError: string | null = null;

    setLoading(true);
    setError(null);

    const hydrate = async () => {
      const [verified, trending] = await Promise.all([
        loadVerifiedTokens().catch((err) => {
          encounteredError =
            (err as Error).message ?? "Failed to load verified tokens";
          return [] as TokenOption[];
        }),
        loadTrendingTokens().catch((err) => {
          encounteredError =
            encounteredError ??
            ((err as Error).message ?? "Failed to load trending tokens");
          return [] as TokenOption[];
        }),
      ]);

      if (cancelled) return;

      if (verified.length) {
        setBaseTokens((prev) => mergeTokens(prev, verified));
      }

        if (trending.length) {
          setBaseTokens((prev) => mergeTokens(prev, trending));
          const trendingFiltered = trending
            .filter(
              (token) =>
                (token.isVerified || token.tags?.includes("verified")) &&
                (token.organicScore ?? 0) >= 93,
            )
            .sort(
              (a, b) => (b.organicScore ?? 0) - (a.organicScore ?? 0),
            );
          if (trendingFiltered.length) {
            setSuggestedTokens(buildSuggestedList(trendingFiltered));
          }
        }
    };

    const request = hydrate();
    request.finally(() => {
      if (!cancelled) {
        if (encounteredError) {
          setError(encounteredError);
        }
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(null);
      setCustomError(null);
      return;
    }

    if (!trimmedQuery) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      setSearchError(null);
      void searchTokens(trimmedQuery)
        .then((results) => {
          if (cancelled) return;
          setSearchResults(results);
          if (results.length) {
            setBaseTokens((prev) => mergeTokens(prev, results));
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setSearchError((err as Error).message ?? "Search failed");
          setSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) {
            setSearchLoading(false);
          }
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedQuery, open, trimmedQuery]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const closeModal = useCallback(() => {
    setOpen(false);
  }, []);

  const handleSelect = useCallback(
    (token: TokenOption) => {
      if (token.mint === disallowMint) {
        return;
      }
      onSelect(tokenMap.get(token.mint) ?? token);
      closeModal();
    },
    [closeModal, disallowMint, onSelect, tokenMap],
  );

  const loadCustomToken = useCallback(async () => {
    const mint = search.trim();
    if (!isValidMintAddress(mint)) {
      setCustomError("Enter a valid mint address");
      return;
    }

    setCustomLoading(true);
    setCustomError(null);

    try {
      const cached = tokenMap.get(mint) ?? DEFAULT_TOKEN_MAP.get(mint);
      if (cached) {
        handleSelect(cached);
        return;
      }

      const accountInfo = await connection.getParsedAccountInfo(
        new PublicKey(mint),
        "confirmed",
      );

      const decimals =
        (accountInfo.value?.data as { parsed?: { info?: { decimals?: number } } })
          ?.parsed?.info?.decimals;

      if (typeof decimals !== "number") {
        throw new Error("Mint account missing decimals");
      }

      const option: TokenOption = {
        mint,
        symbol: formatMintAddress(mint),
        name: "Custom token",
        decimals,
      };

      setBaseTokens((prev) => mergeTokens(prev, [option]));
      handleSelect(option);
    } catch (err) {
      setCustomError((err as Error).message ?? "Unable to load token");
    } finally {
      setCustomLoading(false);
    }
  }, [connection, handleSelect, search, tokenMap]);

  const modal = open
    ? createPortal(
        <div
          className={styles.tokenModalOverlay}
          role="presentation"
          onClick={closeModal}
        >
          <div
            className={styles.tokenModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-title`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.tokenModalHeader}>
              <h2 id={`${id}-title`} className={styles.tokenModalTitle}>
                Select a token
              </h2>
              <button
                type="button"
                className={styles.tokenModalClose}
                onClick={closeModal}
                aria-label="Close token selector"
              >
                ×
              </button>
            </header>
            <div className={styles.tokenSearchRow}>
              <label htmlFor={`${id}-search`} className={styles.srOnly}>
                Search tokens
              </label>
              <input
                id={`${id}-search`}
                className={styles.tokenSearchInput}
                placeholder="Search by symbol or mint"
                autoFocus
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setCustomError(null);
                }}
              />
            </div>

            <div className={styles.tokenModalBody}>
              {loading && (
                <div className={styles.tokenStatus}>Loading verified list…</div>
              )}
              {error && !loading && (
                <div className={styles.tokenError}>{error}</div>
              )}
              {searchLoading && (
                <div className={styles.tokenStatus}>Searching…</div>
              )}
              {searchError && !searchLoading && (
                <div className={styles.tokenError}>{searchError}</div>
              )}

              <section className={styles.tokenSection} aria-label="Suggested tokens">
                <h3 className={styles.tokenSectionTitle}>Suggested</h3>
                <ul className={styles.tokenList}>
                  {suggestedTokens.map((token) => (
                    <li key={token.mint}>
                      <button
                        type="button"
                        className={[
                          styles.tokenListItem,
                          token.mint === selectedToken.mint
                            ? styles.tokenListItemActive
                            : "",
                          token.mint === disallowMint
                            ? styles.tokenListItemDisabled
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => handleSelect(token)}
                        disabled={token.mint === disallowMint}
                      >
                        <TokenBadge token={token} />
                        <div className={styles.tokenMeta}>
                          <span className={styles.tokenSymbol}>
                            {token.symbol}
                            {token.isVerified && (
                              <span
                                className={styles.tokenVerified}
                                aria-label="Verified token"
                              >
                                ✓
                              </span>
                            )}
                          </span>
                          <span className={styles.tokenMint}>
                            {formatMintAddress(token.mint)}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <section className={styles.tokenSection} aria-label="Token results">
                <h3 className={styles.tokenSectionTitle}>Search results</h3>
                <ul className={styles.tokenList}>
                  {tokensToDisplay.map((token) => (
                    <li key={token.mint}>
                      <button
                        type="button"
                        className={[
                          styles.tokenListItem,
                          token.mint === selectedToken.mint
                            ? styles.tokenListItemActive
                            : "",
                          token.mint === disallowMint
                            ? styles.tokenListItemDisabled
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => handleSelect(token)}
                        disabled={token.mint === disallowMint}
                      >
                        <TokenBadge token={token} />
                        <div className={styles.tokenMeta}>
                          <span className={styles.tokenSymbol}>
                            {token.symbol}
                            {token.isVerified && (
                              <span
                                className={styles.tokenVerified}
                                aria-label="Verified token"
                              >
                                ✓
                              </span>
                            )}
                          </span>
                          <span className={styles.tokenName}>{token.name}</span>
                          <span className={styles.tokenMint}>
                            {formatMintAddress(token.mint)}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                  {tokensToDisplay.length === 0 && !normalizedQuery && (
                    <li className={styles.tokenEmpty}>Start typing to search the verified list.</li>
                  )}
                  {tokensToDisplay.length === 0 && normalizedQuery && !searchLoading && (
                    <li className={styles.tokenEmpty}>No tokens matched your search.</li>
                  )}
                </ul>
              </section>

              {isMintQuery &&
                !tokenMap.has(trimmedQuery) &&
                !searchLoading && (
                <div className={styles.tokenCustomAction}>
                  <p className={styles.tokenCustomHint}>
                    Paste any Solana mint address to load its metadata.
                  </p>
                  <button
                    type="button"
                    className={styles.tokenCustomButton}
                    onClick={() => void loadCustomToken()}
                    disabled={customLoading}
                  >
                    {customLoading ? "Checking mint…" : "Use this mint"}
                  </button>
                  {customError && (
                    <p className={styles.tokenError}>{customError}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <label className={styles.srOnly} htmlFor={id}>
        {label}
      </label>
      <button
        type="button"
        id={id}
        className={styles.tokenSelect}
        onClick={() => setOpen(true)}
        title={`${selectedToken.name} (${formatMintAddress(selectedToken.mint)})`}
      >
        <span className={styles.tokenSelectContent}>
          <TokenBadge token={selectedToken} small />
          <span className={styles.tokenSelectSymbol}>{selectedToken.symbol}</span>
        </span>
        <span className={styles.srOnly}>{formatMintAddress(selectedToken.mint)}</span>
        <svg
          className={styles.tokenSelectChevron}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M6.343 9.172a1 1 0 0 1 1.414 0L12 13.414l4.243-4.242a1 1 0 1 1 1.414 1.414l-4.95 4.95a1 1 0 0 1-1.414 0l-4.95-4.95a1 1 0 0 1 0-1.414z"
            fill="currentColor"
          />
        </svg>
      </button>
      {modal}
    </>
  );
};

type TokenBadgeProps = {
  token: TokenOption;
  small?: boolean;
};

const TokenBadge = ({ token, small = false }: TokenBadgeProps) => {
  const classNames = [
    styles.tokenLogo,
    small ? styles.tokenLogoSmall : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (token.logoURI) {
    return (
      <img
        className={classNames}
        src={token.logoURI}
        alt={`${token.symbol} logo`}
        onError={(event) => {
          (event.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  return (
    <span className={classNames} aria-hidden>
      {token.symbol?.slice(0, 2)?.toUpperCase() ?? "?"}
    </span>
  );
};

```

# apps/ui/src/components/WalletButton.tsx

```tsx
"use client";

import { useCallback, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

type Props = {
  className?: string;
};

const formatAddress = (address: string) =>
  `${address.slice(0, 4)}…${address.slice(-4)}`;

export const WalletButton = ({ className }: Props) => {
  const { connected, connecting, disconnecting, publicKey, disconnect } =
    useWallet();
  const { setVisible } = useWalletModal();

  const label = useMemo(() => {
    if (connecting) return "Connecting…";
    if (disconnecting) return "Disconnecting…";
    if (connected && publicKey) {
      return formatAddress(publicKey.toBase58());
    }
    return "Connect Wallet";
  }, [connected, connecting, disconnecting, publicKey]);

  const handleClick = useCallback(() => {
    if (connecting || disconnecting) return;
    if (connected) {
      void disconnect();
      return;
    }
    setVisible(true);
  }, [connected, connecting, disconnecting, disconnect, setVisible]);

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      disabled={connecting || disconnecting}
      aria-live="polite"
    >
      {label}
    </button>
  );
};

```

# apps/ui/src/lib/api.ts

```ts
export const buildApiUrl = (path: string) => path;

```

# apps/ui/src/lib/hooks/useQuotePreview.ts

```ts
"use client";

import { useEffect, useState } from "react";
import { buildApiUrl } from "@/lib/api";

type QuotePreviewParams = {
  inMint: string;
  outMint: string;
  amountIn: string;
  slippageBps: number;
  priorityFee: number;
  userPublicKey?: string;
  enabled?: boolean;
};

type QuotePreviewState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: string };

type QuoteInstructionAccount = {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
};

type QuoteInstruction = {
  programId: string;
  accounts: QuoteInstructionAccount[];
  data: string;
};

type QuotePreviewResponse = {
  amountOut: string;
  priceImpactBps: number;
  routers: Array<{ id?: string; name?: string } | string>;
  executable: boolean;
  updatedAt: string;
  provider?: string;
  routeId?: string;
  transactionBase64?: string;
  inAmount?: string;
  instructions?: QuoteInstruction[];
  addressLookupTables?: string[];
  computeUnits?: number;
  computeUnitsSafe?: number;
};

type QuotePreview = {
  amountOut: string;
  priceImpactBps: number;
  routers: string[];
  executable: boolean;
  updatedAt: string;
  provider?: string;
  routeId?: string;
  transactionBase64?: string;
  inAmount?: string;
  instructions?: QuoteInstruction[];
  addressLookupTables?: string[];
  computeUnits?: number;
  computeUnitsSafe?: number;
};

export const useQuotePreview = (params: QuotePreviewParams) => {
  const [state, setState] = useState<QuotePreviewState<QuotePreview>>({
    status: "idle",
  });

  const {
    inMint,
    outMint,
    amountIn,
    slippageBps,
    priorityFee,
    userPublicKey,
    enabled = true,
  } = params;

  useEffect(() => {
    const controller = new AbortController();

    if (!enabled || amountIn === "0" || !userPublicKey) {
      setState({ status: "idle" });
      return () => controller.abort();
    }

    const requestQuote = async () => {
      setState({ status: "loading" });

      try {
        const response = await fetch(buildApiUrl("/api/frogx/quotes"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inMint,
            outMint,
            amountIn,
            slippageBps,
            priorityFee,
            userPublicKey,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed with status ${response.status}`);
        }

        const raw = (await response.json()) as QuotePreviewResponse;
        const routers = raw.routers.map((router) =>
          typeof router === "string"
            ? router
            : router.name ?? router.id ?? "unknown-router",
        );

        setState({
          status: "success",
          data: {
            amountOut: raw.amountOut,
            priceImpactBps: raw.priceImpactBps,
            routers,
            executable: raw.executable,
            updatedAt: raw.updatedAt,
            provider: raw.provider,
            routeId: raw.routeId,
            transactionBase64: raw.transactionBase64,
            inAmount: raw.inAmount,
            instructions: raw.instructions ?? [],
            addressLookupTables: raw.addressLookupTables ?? [],
            computeUnits: raw.computeUnits,
            computeUnitsSafe: raw.computeUnitsSafe,
          },
        });
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        setState({
          status: "error",
          error: (error as Error).message ?? "Unknown error",
        });
      }
    };

    requestQuote();

    return () => controller.abort();
  }, [amountIn, enabled, inMint, outMint, priorityFee, slippageBps, userPublicKey]);

  return state;
};

```

# apps/ui/src/lib/solana/validation.ts

```ts
/**
 * Lightweight Solana mint + amount validation helpers.
 * These can be replaced with @solana/web3.js validations once RPC wiring lands.
 */
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const isValidMint = (value: string) => BASE58_REGEX.test(value);

export const clampSlippage = (bps: number, min = 5, max = 500) =>
  Math.min(Math.max(bps, min), max);

export const toBaseUnits = (amount: number, decimals: number) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be positive");
  }

  return BigInt(Math.round(amount * 10 ** decimals)).toString();
};

```

# apps/ui/src/lib/tokens.ts

```ts
export type TokenOption = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  isVerified?: boolean;
  tags?: string[];
  organicScore?: number;
  featured?: boolean;
};

export const WRAPPED_SOL_MINT =
  "So11111111111111111111111111111111111111112";

export const DEFAULT_TOKEN_OPTIONS: TokenOption[] = [
  {
    mint: WRAPPED_SOL_MINT,
    symbol: "SOL",
    name: "Wrapped SOL",
    decimals: 9,
    logoURI:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  },
  {
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    isVerified: true,
    logoURI:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
  },
  {
    mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    symbol: "USDT",
    name: "USDT",
    decimals: 6,
    isVerified: true,
    logoURI:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg",
  },
  {
    mint: "6dhTynDkYsVM7cbF7TKfC9DWB636TcEM935fq7JzL2ES",
    symbol: "BONK",
    name: "BONK",
    decimals: 9,
    isVerified: true,
    logoURI:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/6dhTynDkYsVM7cbF7TKfC9DWB636TcEM935fq7JzL2ES/logo.png",
  },
  {
    mint: "Coq3LbB52jzCxk5W8SJTyK3SB83sYTKEjs2JmHaoSGxS",
    symbol: "WIF",
    name: "dogwifhat",
    decimals: 9,
    logoURI:
      "https://raw.githubusercontent.com/FullMoonMiningCo/logos/main/wif-logo.png",
  },
  {
    mint: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    symbol: "SAMO",
    name: "Samoyed Coin",
    decimals: 9,
    isVerified: true,
    logoURI:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU/logo.png",
  },
  {
    mint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
    symbol: "mSOL",
    name: "Marinade Staked SOL",
    decimals: 9,
    isVerified: true,
    logoURI:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png",
  },
  {
    mint: "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1",
    symbol: "bSOL",
    name: "BlazeStake Staked SOL",
    decimals: 9,
    isVerified: true,
    logoURI:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1/logo.png",
  },
  {
    mint: "5VsPJ2EG7jjo3k2LPzQVriENKKQkNUTzujEzuaj4Aisf",
    symbol: "ROCK",
    name: "Zenrock",
    decimals: 6,
    isVerified: true,
    featured: true,
    logoURI:
      "https://spl-token-metadata.s3.eu-west-1.amazonaws.com/chain.png",
  },
  {
    mint: "9hX59xHHnaZXLU6quvm5uGY2iDiT3jczaReHy6A6TYKw",
    symbol: "zenBTC",
    name: "Zenrock BTC",
    decimals: 8,
    isVerified: true,
    featured: true,
    logoURI:
      "https://zenrock-public-images.s3.eu-west-1.amazonaws.com/zenBTC-logo.svg",
  },
  {
    mint: "H4phNbsqjV5rqk8u6FUACTLB6rNZRTAPGnBb8KXJpump",
    symbol: "SSE",
    name: "Solana Social Explorer",
    decimals: 6,
    isVerified: true,
    featured: true,
    logoURI:
      "https://ipfs.io/ipfs/QmT4fG3jhXv3dcvEVdkvAqi8RjXEmEcLS48PsUA5zSb1RY",
  },
];

export const DEFAULT_TOKEN_MAP = new Map(
  DEFAULT_TOKEN_OPTIONS.map((token) => [token.mint, token]),
);

export const TRENDING_TOKEN_MINTS = DEFAULT_TOKEN_OPTIONS.map(
  (token) => token.mint,
);

export const formatMintAddress = (mint: string) =>
  `${mint.slice(0, 4)}…${mint.slice(-4)}`;

```

# apps/ui/src/providers/AudioProvider.tsx

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { BackgroundAudio } from "@/components/BackgroundAudio";

type AudioContextValue = {
  muted: boolean;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
};

const AudioContext = createContext<AudioContextValue | undefined>(undefined);

export const AudioProvider = ({ children }: { children: ReactNode }) => {
  const [muted, setMuted] = useState(false);

  const toggleMuted = useCallback(() => {
    setMuted((prev) => !prev);
  }, []);

  const value = useMemo<AudioContextValue>(
    () => ({
      muted,
      setMuted,
      toggleMuted,
    }),
    [muted, toggleMuted],
  );

  return (
    <AudioContext.Provider value={value}>
      <BackgroundAudio muted={muted} />
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = (): AudioContextValue => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error("useAudio must be used within AudioProvider");
  }
  return context;
};


```

# apps/ui/src/providers/SolanaProvider.tsx

```tsx
"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";

import "@solana/wallet-adapter-react-ui/styles.css";

type Props = {
  children: React.ReactNode;
};

export const SolanaProvider = ({ children }: Props) => {
  const isBrowser = typeof window !== "undefined";
  const publicHttp = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  const publicWs = process.env.NEXT_PUBLIC_SOLANA_WS_URL;

  const endpoint =
    publicHttp ?? (isBrowser ? `${window.location.origin}/rpc` : "https://api.mainnet-beta.solana.com");

  // Derive ws endpoint if provided or from HTTP; helps local dev avoid WS rewrite issues
  const wsEndpoint =
    publicWs ??
    (publicHttp
      ? publicHttp.replace(/^http(\w*):/i, (_, s) => (s && s.toLowerCase().startsWith("s") ? "wss:" : "ws:"))
      : isBrowser
        ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/rpc`
        : undefined);

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "processed", wsEndpoint }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

```

# apps/ui/src/testing/test-utils.tsx

```tsx
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";

export const renderWithProviders = (ui: ReactElement) => render(ui);

```

# apps/ui/tests/fixtures/demo-quote.json

```json
{
  "status": "executable",
  "updatedAt": "2024-12-01T12:00:00.000Z",
  "inMint": "So11111111111111111111111111111111111111112",
  "outMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "amountIn": "1000000000",
  "amountOut": "980000",
  "priceImpactBps": 12,
  "routers": [
    { "id": "titan", "name": "Titan Direct", "weightBps": 6500 },
    { "id": "jup", "name": "Jupiter", "weightBps": 3500 }
  ],
  "routeId": "demo-route-123",
  "executable": true,
  "simulated": true
}

```

# apps/ui/tests/integration/quote-routing.test.ts

```ts
describe.skip("Titan quote routing integration", () => {
  it("selects an executable quote within the configured freshness window", () => {
    /**
     * TODO: Replace with integration harness that consumes Titan streaming
     * fixtures from tests/fixtures and asserts on quote freshness + region
     * failover behaviour.
     */
  });
});

```

# apps/ui/tests/vitest.e2e.config.ts

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["../vitest.setup.ts"],
  },
});

```

# apps/ui/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "allowJs": true,
    "incremental": true,
    "jsx": "preserve",
    "types": ["vitest/globals"],
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}

```

# apps/ui/vitest.config.ts

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: {
      modules: {
        classNameStrategy: "non-scoped",
      },
    },
  },
});

```

# apps/ui/vitest.setup.ts

```ts
import "@testing-library/jest-dom/vitest";

```

# apps/ui/worker-entry.mjs

```mjs
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

```

# CHANGELOG.md

```md
# Changelog

## Unreleased

### Added
- XP header chip that persists across routes (placeholder `4,269 XP` with sparkle).
- Ribbit profile hub with wardrobe selection, stats, achievements, activity timeline, and quests.
- AudioProvider to keep background music playing between navigations.
- Ribbit XP leaderboard page with glow tiers for top performers.
- Pixel trophy, wallet, swap, and sparkle icons in `/public`.

### Changed
- Header hamburger uses pixel wallet icon and includes XP readout when connected.
- Leaderboard headers now match pixel SNES styling with neon accents.
- Top 3 leaderboard rows highlight gold/silver/bronze (avatar halo + text glow).

### Fixed
- Eliminated duplicate background audio playback when navigating.


```

# package.json

```json
{
  "name": "frogtradingexchange",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "build": "pnpm -r build",
    "deploy": "pnpm --filter @frogx/api deploy && pnpm --filter @frogx/ui deploy:pages",
    "deploy:prod": "pnpm install --frozen-lockfile && pnpm --filter @frogx/api run deploy && pnpm --filter @frogx/ui run deploy:pages"
  },
  "devDependencies": {
    "dotenv": "^16.4.5"
  }
}

```

# packages/shared/package.json

```json
{
  "name": "@frogx/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module"
}

```

# pnpm-workspace.yaml

```yaml
packages:
  - "apps/*"
  - "packages/*"

```

# scripts/dev-worker.mjs

```mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
const loadDotenv = async () => {
  try {
    const mod = await import("dotenv");
    return mod.config;
  } catch (error) {
    console.warn(
      "[dev-worker] dotenv not found; skipping root env loading. Install it with `pnpm add -D dotenv` at the repo root if needed.",
    );
    return () => undefined;
  }
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const workerDir = path.join(rootDir, "apps/api");

const envName = process.env.NODE_ENV ?? "development";

const envFiles = [
  { path: path.join(rootDir, ".env"), override: false },
  { path: path.join(rootDir, `.env.${envName}`), override: false },
  { path: path.join(rootDir, ".env.local"), override: true },
  { path: path.join(rootDir, `.env.${envName}.local`), override: true },
];

const loadEnvConfigRef = await loadDotenv();

for (const candidate of envFiles) {
  if (!fs.existsSync(candidate.path)) continue;
  if (typeof loadEnvConfigRef === "function") {
    loadEnvConfigRef({
      path: candidate.path,
      override: candidate.override,
    });
  }
}

const forwardPrefixes = ["TITAN_", "SOLANA_", "QUOTE_"];

const varArgs = [];
for (const [key, value] of Object.entries(process.env)) {
  if (!value) continue;
  if (!forwardPrefixes.some((prefix) => key.startsWith(prefix))) {
    continue;
  }
  varArgs.push("--var");
  varArgs.push(`${key}=${value}`);
}

const port = process.env.WORKER_PORT ?? "8787";

const useRemote =
  process.env.WRANGLER_DEV_REMOTE === "1" ||
  process.env.WORKER_REMOTE === "1" ||
  process.env.DEV_WORKER_REMOTE === "1";

const wranglerArgs = ["dev", "--port", port, ...varArgs];
if (useRemote) {
  wranglerArgs.push("--remote");
  console.log("[dev-worker] Using Cloudflare remote dev for Worker (WS-friendly)…");
}

const child = spawn("wrangler", wranglerArgs, {
  cwd: workerDir,
  stdio: "inherit",
  env: process.env,
});

const signals = ["SIGINT", "SIGTERM", "SIGQUIT"];
for (const signal of signals) {
  process.on(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
}

child.on("close", (code) => {
  process.exit(code ?? 0);
});

```

# tsconfig.base.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["dom", "dom.iterable", "esnext"],
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  }
}

```

