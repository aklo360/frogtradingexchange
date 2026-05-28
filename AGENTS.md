# Frog Trading Exchange — Engineering Guidelines

## 1. Monorepo Overview

### Directory Layout

```
  apps/
    api/                          # Cloudflare Worker (Wrangler)
    package.json
    wrangler.toml
    src/
      airdrop.ts                # DAEMON holder-gated airdrop coordinator + APIs
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
        airdrop/                # DAEMON claim page (home shell + Solana frog gate + ETH payout)
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
     (`NEXT_PUBLIC_SOLANA_RPC_URL` is reused as `SOLANA_RPC_URL` locally only)
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
- **UI build flag**:
  - `NEXT_PUBLIC_FROGX_VERSION` = `v1` (swap-only + buyback burn bar) or `v2` (full profile/leaderboard build)
- UI **does not** need `NEXT_PUBLIC_SOLANA_RPC_URL` if you rely on `/rpc` proxy. In local dev only, `scripts/dev-worker.mjs` can reuse it as `SOLANA_RPC_URL` for Worker eligibility checks if no server-side RPC var is set.
- Platform fees (currently disabled by default): flip `PLATFORM_FEE_ENABLED=true` when Titan enables fee management for our token, then set `PLATFORM_FEE_BPS`, `PLATFORM_FEE_RECIPIENT`, and optional `PLATFORM_FEE_{TOKEN}_ACCOUNT` env vars to direct SOL/USDC/USDT fees to specific ATAs.
- **Buyback automation (Worker secrets)**:
  - `BUYBACK_ENABLED`, `BUYBACK_DRY_RUN`, `BUYBACK_WALLET_SECRET`, `BUYBACK_WALLET_ADDRESS`
  - `BUYBACK_SOL_RESERVE`, `BUYBACK_MIN_SWAP_USDC`, `BUYBACK_MIN_SWAP_USDT`, `BUYBACK_SWAP_SLIPPAGE_BPS`, `BUYBACK_PRIORITY_FEE`
  - `ME_API_*` (Magic Eden creds + endpoints) and `SOL_INCINERATOR_*` (burn API creds + endpoints)
- **DAEMON airdrop (Worker vars/secrets)**:
  - `AIRDROP_ENABLED=false` by default; do not enable until claim dates, live token bytecode, escrow token balance, escrow ETH gas, and payout signer process are confirmed.
  - `AIRDROP_CAMPAIGN_ID`, `AIRDROP_COLLECTION_ADDRESS`, `AIRDROP_DAEMON_TOKEN_ADDRESS`, `AIRDROP_ESCROW_ADDRESS`, `AIRDROP_DAEMON_DECIMALS`, `AIRDROP_MIN_FROGS`, `AIRDROP_FULL_PRIZE_MIN_FROGS`, `AIRDROP_POOL_DAEMON`, `AIRDROP_MIN_PRIZE_DAEMON`, `AIRDROP_MAX_PRIZE_DAEMON`
  - Optional `AIRDROP_CLAIM_OPEN_AT`, `AIRDROP_CLAIM_CLOSE_AT`
  - `AIRDROP_PAYOUT_ENABLED=false` and `AIRDROP_AUTO_PAYOUT_ENABLED=false` by default; keep them false until launch. `AIRDROP_ETH_RPC_URL` and `AIRDROP_ESCROW_PRIVATE_KEY` are required Worker secrets for automatic ERC20 sends.
  - `AIRDROP_ADMIN_TOKEN` is required for `/api/frogx/airdrop/finalize`, `/api/frogx/airdrop/payout`, and `/api/frogx/airdrop/export`; store as a Worker secret only.

## 4. Commands

- Frontend: `pnpm --filter @frogx/ui run dev|build|lint|test`
- Backend: `pnpm --filter @frogx/api run dev|deploy|test`
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

2. **DAEMON airdrop claims**
   UI `/airdrop` → `/api/frogx/airdrop/*` → Worker Durable Object coordinator. Users sign a Solana claim proof binding their entered Ethereum payout address; Phantom/EVM signing is optional extra verification/autofill. The Worker verifies Business Frogs live via Solana DAS, records one FCFS claim per Solana wallet/ETH payout, and immediately reserves deterministic tiers: 1-9 frogs get `0.10` `$DAEMON`, 10+ frogs get `1.00` `$DAEMON`, until the 10 `$DAEMON` pool is exhausted. `POST /api/frogx/airdrop/payout` and scheduled autopayout only send when payout env switches, Ethereum RPC, escrow signer, token bytecode, escrow `$DAEMON`, and escrow ETH gas checks pass.

3. **Wallet XP (client-side)**
   XP badge currently shows a placeholder (4,269 XP) once a wallet connects. Replace with real stats when Titan exposes XP API.

4. **Wallet RPC**
   UI → `/rpc` → Pages worker → private `SOLANA_RPC_URL` (Helius). Keeps RPC key server-side while dApps use the proxy.

5. **Live token data**
   UI fetches Jupiter Token API v2:
   - `tokens/v2/tag?query=verified` (baseline)
   - `tokens/v2/toporganicscore/5m?limit=50` (suggested + ticker)
   - `tokens/v2/search?query=...` (picker search)

### Frontend modules

- **`SwapCard`**: Wallet-aware Titan swap surface. Streams quote previews via `/api/frogx/quotes`, handles balance polling (native SOL vs SPL), assembles transactions (lookup tables) and submits via wallet adapter. Includes Titan router insights and USDC estimates, with a compact mobile layout that keeps Swap/Disconnect headers aligned and trims vertical padding across sections. XP badge (4,269 XP) renders in the header when a wallet is connected.
- **`BuybackProgress`** (V1-only): Polls `/api/frogx/buyback` to show fees collected vs SBF floor price; once full, the Worker buys the lowest SBF listing and burns via Sol Incinerator.
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
