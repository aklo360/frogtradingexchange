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
  - `NEXT_PUBLIC_FROGX_VERSION` = `v1` (swap-only) or `v2` (swap + profile). The buyback burn bar renders in both versions.
- UI **does not** need `NEXT_PUBLIC_SOLANA_RPC_URL` if you rely on `/rpc` proxy. In local dev only, `scripts/dev-worker.mjs` can reuse it as `SOLANA_RPC_URL` for Worker eligibility checks if no server-side RPC var is set.
- Platform fees (currently disabled by default): flip `PLATFORM_FEE_ENABLED=true` when Titan enables fee management for our token, then set `PLATFORM_FEE_BPS`, `PLATFORM_FEE_RECIPIENT`, and optional `PLATFORM_FEE_{TOKEN}_ACCOUNT` env vars to direct SOL/USDC/USDT fees to specific ATAs.
- **Ribbot trading bot wallet provisioning (Worker secrets)**:
  - `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, optional `PRIVY_API_BASE_URL`
  - Optional signer/policy support: `PRIVY_AUTHORIZATION_KEY_ID`, `PRIVY_AUTHORIZATION_PRIVATE_KEY`, `PRIVY_WALLET_POLICY_IDS`
  - There is currently no FTX browser client for Ribbot or Privy wallet controls. Public identifiers `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_PRIVY_BOT_SIGNER_ID`, and optional comma-separated `NEXT_PUBLIC_PRIVY_BOT_POLICY_IDS` remain reserved for a future explicitly approved client. These IDs are not secrets; never expose `PRIVY_APP_SECRET` or `PRIVY_AUTHORIZATION_PRIVATE_KEY` through `NEXT_PUBLIC_*`.
  - `RIBBOT_TRADING_BOT_TOKEN` protects Ribbot-only trading-bot endpoints. Ribbot should send this as `RIBBOT_FTX_API_TOKEN`; Ribbot must not hold Privy app secrets or authorization private keys directly.
  - `TRADING_BOT_OPERATOR_TOKEN` separately protects the pull-based manual-review list/acknowledge/reconcile API. It must stay out of Ribbot and browser bundles. Acknowledge is audit-only; reconcile invokes existing Privy GET-only status paths and may resolve a case only from terminal provider/bundle evidence. There is no force-success/force-failure route.
  - Leave optional `RIBBOT_CONTROL_URL` unset while no browser control surface exists; `/ribbot` is intentionally removed.
  - Optional `RIBBOT_WALLET_CLAIM_URL` may point only to a separately reviewed Privy-authenticated handoff surface. No current FTX page implements wallet export or signer removal/restoration. FTX responses must never receive or return exported key material.
  - `TRADING_BOT_LIVE_EXECUTION_ENABLED` is the hard FTX-side market-order execution gate. Keep it false until AKLO approves live signer-policy execution. Optional `TRADING_BOT_SOLANA_GAS_SPONSORSHIP_ENABLED` asks Privy to sponsor Solana gas for `signAndSendTransaction`.
  - Optional scheduled orders: `TRADING_BOT_SCHEDULER_ENABLED=false` enables the FTX cron scanner for stored limit/stop/trailing/DCA orders; `TRADING_BOT_SCHEDULER_LIVE_EXECUTION_ENABLED=false` is a second explicit gate for live scheduled execution; `TRADING_BOT_SCHEDULER_MAX_ORDERS` caps each cron scan; `TRADING_BOT_SCHEDULER_RECONCILE_AFTER_SECONDS` sets the minimum age before an `executing` attempt is checked through Privy's transaction lookup. Live runs atomically claim orders in FTX, use distinct DCA slice execution IDs plus Privy idempotency keys, and persist executing/executed/failed state. Ambiguous responses remain `executing`; reconciliation is read-only, validates the stored wallet/chain, uses expected execution-state checks, and never resends. Keep live scheduler execution false until AKLO approves it.
  - Optional advanced automation monitors: `TRADING_BOT_ADVANCED_MONITOR_ENABLED=false` plus per-kind copytrade/sniper/auto-buy/auto-sell monitor flags lets FTX cron scan stored configs. Copytrade observes target-wallet signatures, sniper observes Jupiter Tokens V2 recent first pools, auto-buy records token-price state, and auto-sell observes Jupiter Price V3 trigger crossings. Sniper monitoring requires `JUPITER_API_KEY`, records a no-trade startup cursor, deduplicates processed mints, and uses `TRADING_BOT_SNIPER_COOLDOWN_SECONDS` between matches. Every execution kind has a separate false-by-default live gate (`TRADING_BOT_COPYTRADE_LIVE_EXECUTION_ENABLED`, `TRADING_BOT_SNIPER_LIVE_EXECUTION_ENABLED`, `TRADING_BOT_AUTO_BUY_LIVE_EXECUTION_ENABLED`, `TRADING_BOT_AUTO_SELL_LIVE_EXECUTION_ENABLED`) in addition to the base live gate, account/config opt-in, required RPC/risk checks, managed-wallet match, no revocation, and Privy signer credentials. Before any send, FTX atomically claims the config and persists its execution ID/reference. `TRADING_BOT_ADVANCED_RECONCILE_AFTER_SECONDS` controls GET-only Privy reconciliation; ambiguous attempts stay `executing`, stale writes are rejected, and `/copytrade/status`, `/sniper/status`, `/auto-buy/status`, and `/auto-sell/status` never execute or resend.
  - Bundle execution atomically claims the FTX-stored basket before any item, persists attempted/confirmed counts, and never auto-resumes an interrupted partial basket. `/api/frogx/trading-bot/bundle-buy/status` performs read-only Privy reconciliation for attempted item references; pending/not-found/lookup errors remain locked, all confirmed items resolve `executed`, and confirmed partial completion resolves `failed` so remaining items require a fresh basket.
  - Shared unresolved-execution escalation uses `TRADING_BOT_MANUAL_REVIEW_AFTER_SECONDS=900` by default. Direct, scheduled, bundle, and advanced status paths persist/return `manualReviewAfter`, `manualReviewRequiredAt`, and `manualReviewReason`, record a deduplicated non-secret `execution_manual_review_required` event, and upsert a global operator case after the deadline. Escalation never retries or changes state. The operator workflow is documented in Ribbot `plans/trading-bot-manual-review-runbook.md`; live use/configuration still requires AKLO approval.
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

2. **Ribbot Telegram trading bot**
   Ribbot Telegram commands call FTX/FrogX endpoints for wallet and trading services. `/api/frogx/trading-bot/config` exposes non-secret capability/default metadata. `/api/frogx/trading-bot/wallet` owns Privy user lookup/creation and Solana wallet provisioning in the Worker; Ribbot receives only wallet status, public addresses, and Privy metadata IDs for local non-secret state. `/api/frogx/trading-bot/account` returns FTX-stored non-secret account snapshots for authenticated Ribbot recovery. The control-code/session/preferences/wallet endpoints remain backend-only while no browser control surface exists; do not present `/ribbot` links or issue browser control codes until a replacement client is explicitly approved. Trading settings remain FTX-authoritative. No Worker JSON response may contain key material. `/api/frogx/trading-bot/positions` reads SOL/SPL balances through the configured Solana RPC; `/api/frogx/trading-bot/pnl` lazily reconciles a bounded set of confirmed swap signatures from wallet-owned Solana pre/post balances, stores deterministic non-secret fill events, and combines confirmed wallet-level asset flow or explicit execution-metadata fallback with live positions and Jupiter Price V3 data. This balance flow can be confirmed, but it is not decoded DEX-route execution and USD PNL remains net-SOL/current-price estimation without realized/FIFO tax lots. `/api/frogx/trading-bot/activity` returns recent non-secret account events for Telegram history; `/api/frogx/trading-bot/token-cleanup/review` returns review-only dust/hidden/unpriced SPL cleanup candidates without changing preferences or trading; `/api/frogx/trading-bot/token-safety` returns review-only SPL mint authority, freeze authority, supply, pricing, and risk flags; `/api/frogx/trading-bot/market-risk` combines token-safety, estimated market cap, and an optional Titan quote/liquidity probe for review-only pre-trade scans. These review/history routes never mutate preferences, sign, broadcast, or trade; PNL may only append derived non-secret fill-index events and never sends a transaction. `/api/frogx/trading-bot/swap` validates confirmed Telegram market-order tickets, requires the Ribbot bearer token, and builds FrogX swap transactions without signing or broadcasting. `/api/frogx/trading-bot/execute` is the stricter live swap path: it requires the FTX live-execution flag, stored Privy wallet/account match, no FTX bot-access revocation, Privy app credentials, and Privy authorization signer credentials before building a fresh swap and submitting Privy Solana `signAndSendTransaction`. Ambiguous sends return `pending_reconciliation`; `/api/frogx/trading-bot/execute/status` recomputes the deterministic Privy reference and performs a read-only wallet/chain-validated lookup without resending.

   `/api/frogx/trading-bot/orders/validate` validates staged limit/stop-loss/trailing-stop/DCA order definitions without storing them. `/api/frogx/trading-bot/orders` stores and lists those non-secret automation orders in the global FTX order registry, and `/api/frogx/trading-bot/orders/cancel` cancels cancellable stored orders. The FTX cron runner `runTradingBotScheduledOrders` can scan staged orders when `TRADING_BOT_SCHEDULER_ENABLED=true`, evaluate limit/stop/trailing triggers against Jupiter Price V3 USD prices, persist trailing peaks and DCA interval state, and record non-secret trigger events. Live scheduled execution additionally requires `TRADING_BOT_SCHEDULER_LIVE_EXECUTION_ENABLED=true`, `TRADING_BOT_LIVE_EXECUTION_ENABLED=true`, Ribbot auth, stored Privy wallet/account match, no FTX bot-access revocation, and Privy signer credentials. Before `/execute`, the global Durable Object atomically changes the order to `executing`; successful runs become `executed` or advance one DCA slice, definite failures become `failed`, competing claims are rejected, and every Privy send carries an idempotency key. Ambiguous transport/service responses stay `executing`; after the configured race window the cron reads Privy's transaction status by reference ID and resolves confirmed/finalized or terminal failure states without sending another transaction. Pending, not-found, and lookup-error states stay visible for later reconciliation/operator review, and execution-ID compare-and-set checks reject stale state writes.

   `/api/frogx/trading-bot/withdrawals/validate` validates staged SOL/SPL withdrawal intents without building, signing, or broadcasting transfer transactions; `/api/frogx/trading-bot/withdrawals/execute` uses the same live gate plus RPC access and stored Privy wallet checks before building SOL/SPL transfers and submitting Privy Solana `signAndSendTransaction`; `/api/frogx/trading-bot/withdrawals/status` performs the same read-only deterministic-reference reconciliation as swaps. `/api/frogx/trading-bot/copytrade/validate`, `/api/frogx/trading-bot/sniper/validate`, `/api/frogx/trading-bot/auto-buy/validate`, `/api/frogx/trading-bot/bundle-buy/validate`, and `/api/frogx/trading-bot/auto-sell/validate` validate advanced automation configs with max-buy, bundle basket, liquidity, sell-percentage, and optional trigger filters; auto-buy validation/storage also appends market-risk review warnings when Solana RPC is configured. The matching storage/cancel/status routes keep those non-secret configs in the global automation registry. Per-config status routes, including `/api/frogx/trading-bot/sniper/status`, reload FTX state and invoke GET-only reconciliation; they never execute or resend. `runTradingBotAdvancedAutomationMonitors` can scan copytrade/sniper/auto-buy/auto-sell configs when explicit advanced monitor flags are enabled, baseline/detect copytrade target-wallet signatures through Solana RPC, baseline/detect Jupiter Tokens V2 recent first-pool launches, record checked auto-buy token price state, observe auto-sell Jupiter Price V3 trigger crossings, and persist non-secret monitor state/events. Sniper observation requires `JUPITER_API_KEY`; its first poll records a cursor without trading existing pools, later polls filter/dedupe new launches, and dry-run observations cannot be retroactively executed. Copied trades, sniper buys, and auto rules can execute only behind their separate false-by-default live gates plus the base gate, feature/account opt-in, required RPC/risk checks, and the normal Privy wallet/signer/revocation checks through `/execute`. Bundle-buy baskets remain user-triggered, atomically claimed, and read-only reconciled without resending or auto-resuming. `/api/frogx/trading-bot/preferences/validate` validates settings, watchlist, and hidden-token changes, then persists them in `TradingBotAccountStore` when the Durable Object binding is available. `/api/frogx/trading-bot/referrals` issues referral codes, records referrer links, counts referred users, and reports tracking-only rewards without fee share, payout, claimable balance, signing, or transfer state.

3. **DAEMON airdrop claims**
   UI `/airdrop` → `/api/frogx/airdrop/*` → Worker Durable Object coordinator. Users sign a Solana claim proof binding their entered Ethereum payout address; Phantom/EVM signing is optional extra verification/autofill. The Worker verifies Business Frogs live via Solana DAS, records one FCFS claim per Solana wallet/ETH payout, and immediately reserves deterministic tiers: 1-9 frogs get `0.10` `$DAEMON`, 10+ frogs get `1.00` `$DAEMON`, until the 10 `$DAEMON` pool is exhausted. `POST /api/frogx/airdrop/payout` and scheduled autopayout only send when payout env switches, Ethereum RPC, escrow signer, token bytecode, escrow `$DAEMON`, and escrow ETH gas checks pass.

4. **Wallet XP (client-side)**
   XP badge currently shows a placeholder (4,269 XP) once a wallet connects. Replace with real stats when Titan exposes XP API.

5. **Wallet RPC**
   UI → `/rpc` → Pages worker → private `SOLANA_RPC_URL` (Helius). Keeps RPC key server-side while dApps use the proxy.

6. **Live token data**
   UI fetches Jupiter Token API v2:
   - `tokens/v2/tag?query=verified` (baseline)
   - `tokens/v2/toporganicscore/5m?limit=50` (suggested + ticker)
   - `tokens/v2/search?query=...` (picker search)

### Frontend modules

- **`SwapCard`**: Wallet-aware Titan swap surface. Streams quote previews via `/api/frogx/quotes`, handles balance polling (native SOL vs SPL), assembles transactions (lookup tables) and submits via wallet adapter. Includes Titan router insights and USDC estimates, with a compact mobile layout that keeps Swap/Disconnect headers aligned and trims vertical padding across sections.
- **`BuybackProgress`**: Polls `/api/frogx/buyback` to show fees collected vs SBF floor price in both app versions; once full, the Worker buys the lowest SBF listing and burns via Sol Incinerator.
- **`TokenSelector`**: Jupiter-style modal picker with verified suggestions (organic score ≥93), search across symbol/name/mint, arbitrary mint support (falls back to on-chain mint decimals), and sponsor slots (ROCK, zenBTC, SSE) injected via `featured` metadata.
- **`Ticker`**: Header marquee listing top verified tokens (organic score ≥93) from Jupiter, showing the **6‑hour** price change. Refreshes every 60s and gracefully degrades to curated defaults.
- **`Profile`** (`/profile`): Wallet-connected Frog identity workspace using real Tapestry profile/social/recent-trade data and owned Solana NFTs, with distinct disconnected/loading/error/no-profile states, no synthetic points or rank, and the same background as the homepage.
- **`SolanaProvider`**: Wraps wallet adapter contexts, shared across the App Router tree.
- **`AudioProvider`**: Ensures background music starts once and persists through route changes; exposes mute state for UI controls.
- **Branding**: Header centers `logo.png` with a Titan-powered subtitle flanked by `sticker/excited.webm` and `sticker/wink.webm` on desktop, while mobile keeps the logo tucked 16px from the edge and hides the sticker/tagline for clarity.
- Favicon/icon pipeline relies on `sbficon.png` via Next metadata route.

### Backend modules

- **`env.ts`**: Runtime env validation (Titan + Solana keys).
- **`routes.ts`**: REST surface for `/info`, `/quotes`, `/swap`. Bridges HTTP requests to Titan logic and formats responses for the UI.
- **`tradingBot.ts`**: Ribbot-facing trading-bot config, account storage/events, wallet provisioning, control sessions, control wallet actions, position/PNL lookup, token cleanup/safety/market-risk reviews, swap-build, live swap execution and direct read-only reconciliation, withdrawal validation/execution/status, scheduled-order validation/storage/cancel plus the guarded scheduled-order runner, copytrade/sniper/auto-buy/bundle-buy/auto-sell validation/storage/cancel/status plus guarded monitor checks and disabled-by-default live execution, and preference-validation routes. Privy calls and bot signer configuration stay server-side in this Worker.
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
