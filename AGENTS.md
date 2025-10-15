# Frog Trading Exchange — Engineering Guidelines

## 1. Monorepo Overview

### Directory Layout

```
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
      sticker/                  # Header webm loops
    src/
      app/
        layout.tsx              # Root layout + font wiring
        page.tsx                # Landing page, embeds <Ticker/> + <SwapCard/>
        page.module.css         # Hero layout, ticker animation, header chrome
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
packages/
  shared/                       # (placeholder for shared packages)
scripts/
  dev-worker.mjs                # Local Wrangler dev harness
pnpm-workspace.yaml
package.json                    # Workspace scripts (incl. deploy:prod)
```

- Managed with **pnpm workspaces** – run `pnpm install` at the repo root once.
- UI: Next.js App Router, TypeScript, Vitest. Tests live under `src/**/__tests__`.
- Backend: Cloudflare Worker (Wrangler) handles Titan WebSocket + REST APIs.
- Cloudflare Pages worker proxies `/api/*` → Worker and `/rpc` → private Solana RPC.

## 2. Local Development

```
pnpm install               # bootstrap workspace
pnpm dev                   # start Next.js (3000) + worker (8787)
  └─ scripts/dev-worker.mjs loads root .env and forwards TITAN_/SOLANA_/QUOTE_ vars
```

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
  ```
  pnpm install --frozen-lockfile
  pnpm --filter @frogx/api run deploy
  pnpm --filter @frogx/ui run deploy:pages
  ```
  `deploy:pages` triggers `next-on-pages --custom-entrypoint ./worker-entry.mjs` then `wrangler pages deploy`.

## 5. Architecture & Feature Overview

### Request flows

1. **Quotes & swaps**  
   UI → `/api/frogx/*` → Pages worker → `frogx-api` Worker → Titan WebSocket/REST → normalized response (transaction base64, instructions, routing metadata).

2. **Wallet RPC**  
   UI → `/rpc` → Pages worker → private `SOLANA_RPC_URL` (Helius). Keeps RPC key server-side while dApps use the proxy.

3. **Live token data**  
   UI fetches Jupiter Token API v2:
   - `tokens/v2/tag?query=verified` (baseline)
   - `tokens/v2/toporganicscore/5m?limit=50` (suggested + ticker)
   - `tokens/v2/search?query=...` (picker search)

### Frontend modules

- **`SwapCard`**: Wallet-aware Titan swap surface. Streams quote previews via `/api/frogx/quotes`, handles balance polling (native SOL vs SPL), assembles transactions (lookup tables) and submits via wallet adapter. Includes Titan router insights and USDC estimates, with a compact mobile layout that keeps Swap/Disconnect headers aligned and trims vertical padding across sections.
- **`TokenSelector`**: Jupiter-style modal picker with verified suggestions (organic score ≥93), search across symbol/name/mint, arbitrary mint support (falls back to on-chain mint decimals), and sponsor slots (ROCK, zenBTC, SSE) injected via `featured` metadata.
- **`Ticker`**: Header marquee listing top verified tokens (organic score ≥93) from Jupiter, showing the **6‑hour** price change. Refreshes every 60s and gracefully degrades to curated defaults.
- **`SolanaProvider`**: Wraps wallet adapter contexts, shared across the App Router tree.
- **Branding**: Header uses `logo.png` (slightly reduced on mobile) with the `sticker/excited.webm` loop pinned to its left on all breakpoints, while larger screens cycle the broader sticker set. A compact neon hamburger menu replaces the header wallet button on narrow viewports, housing wallet/audio/help/chat shortcuts. Favicon/icon pipeline relies on `sbficon.png` via Next metadata route.

### Backend modules

- **`env.ts`**: Runtime env validation (Titan + Solana keys).
- **`routes.ts`**: REST surface for `/info`, `/quotes`, `/swap`. Bridges HTTP requests to Titan logic and formats responses for the UI.
- **`titan.ts`**: Maintains Titan WebSocket sessions, normalizes quotes/swaps, handles failover and region ordering.

### Styling system

- CSS Modules per component (e.g., `SwapCard.module.css`, `page.module.css`) deliver bespoke retro styling (animated borders, ticker marquee). Fonts via `next/font` (Geist, Press Start 2P).
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
- Manual smoke checks before deploy: wallet connects, quote renders, swap returns Titan payload.

## 8. Deployment Checklist

1. Update `.env.local` / Cloudflare secrets if credentials change.
2. `pnpm run deploy:prod`
3. Verify Worker endpoints (`/api/frogx/info`, `/api/frogx/quotes`).
4. Confirm `https://frogtrading.exchange/` shows wallet balance and live quotes.
5. Monitor Cloudflare Worker logs (`wrangler tail`) for errors.

## 9. Troubleshooting

- `/rpc` 404 → redeploy UI after running `build:worker`; ensure Pages secret `SOLANA_RPC_URL` is set.
- Titan WebSocket errors → check Titan token, region list, or messagepack decode errors in Worker logs.
- `pnpm install` prompts → add `--frozen-lockfile` in CI to enforce lock consistency.
- Build failure in `next-on-pages` due to offline registry access → rerun on a machine with npm connectivity.
- Jupiter API anomalies → verify `lite-api.jup.ag` availability; ticker/picker fall back to curated defaults but should surface console warnings.

Keep this document updated when architecture or tooling shifts. With the monorepo stabilized and one-command deploys, focus on swap UX, Titan resiliency, and Solana-edge testing.
