# Changelog

## 2025-10-15 — TBD
- Tweaked the header: logo re-centered with Titan subtitle flanked by `sticker/excited.webm` and `sticker/wink.webm` on desktop, while mobile keeps the logo inset 16px and hides the sticker/tagline; also thinned the hamburger bars/border for a lighter touch.
- Flattened the swap card header so Swap/Disconnect share a row, trimmed pay/receive/quote spacing, lowered the balance shortcuts, and shortened the quote preview label to "Min" for a leaner mobile scan.
- Refreshed engineering guidelines to capture the updated header treatment and compact swap layout.

## 2025-10-14 — d43f725
- Replaced the header text with the branded `logo.png`, tightened global CSS, and widened ticker spacing/tempo.
- Refreshed the responsive header: left-aligned a smaller logo, removed the subtitle, added a green hamburger menu (with wallet/audio/help/chat actions), and tuned mobile spacing.
- Streamlined the swap token selector layout so the asset dropdown sits inline with the amount input (Titan-style), plus tightened responsive spacing.
- Introduced a Jupiter-backed token selector modal (`TokenSelector.tsx`) with verified search, arbitrary mint loading, and sponsor slots (ROCK, zenBTC, SSE) managed via `lib/tokens.ts`.
- Added a live `Ticker` component that streams Jupiter’s top-organic verified set (6 h price deltas) with fallback data and refresh interval handling.
- Expanded the swap card styling/logic to cooperate with the new selector and ticker, refreshed success toast UX, and centralized default token metadata.

## 2025-10-12 — fe32b42
- Updated `app/icon.tsx` to render the production frog PNG (88×88) directly via `next/og`, avoiding Vercel’s fallback favicon and fixing prod parity.

## 2025-10-12 — df7cd5a
- Added a Next.js App Router metadata route (`app/icon.tsx`) that serves our frog favicon dynamically rather than the framework default.

## 2025-10-11 — 83042e3
- Committed `favicon.png` (32×32) into `apps/ui/public/` so builds can reference the asset bundle.

## 2025-10-11 — 5a4125b
- Updated `app/layout.tsx` metadata to advertise both `.ico` and `.png` favicons, ensuring browsers pick the intended pixel art icon in production.

## 2025-10-11 — 2105b34
- Cleaned `SwapCard.tsx` by removing `any` casts, trimming unused values, and aligning effect dependencies to silence prod build warnings without altering layout.

## 2025-10-11 — 0fc0ed0
- Reworked quote preview layout into left/center/right columns, added explicit `$` formatting for USDC estimates, surfaced 1 SOL USD pricing, and refined the success toast dismissal logic for “user rejected” errors.

## 2025-10-10 — facd00a
- Shipped a toast modal with Solscan link, token-agnostic balance handling (SOL vs. SPL), and 50 %/Max shortcuts.
- Added USDC estimates by chaining Titan quotes, refreshed header sticker sizing/background glow, and removed the money-rain effect.
- Enhanced Solana provider with WebSocket support, introduced `/rpc` proxying in dev/Pages worker, and added a remote-dev toggle to `dev-worker.mjs`.

## 2025-10-10 — 796423c
- Dropped new sticker `webm` assets and polished the hero styling (background gradients, layout tweaks) alongside incremental swap card CSS adjustments.

## 2025-10-10 — 2cc8a3d
- Added audio controls (`BackgroundAudio`, `SpeakerToggle`), chat/help buttons, wallet button styling, and refreshed static assets (SVG icons, favicons).
- Extended swap card styles and logic to match the neon theme and bundled supporting CSS modules.

## 2025-10-10 — d9bbd23
- Overhauled `AGENTS.md` with expanded engineering guidelines, environment details, and repo overview.

## 2025-10-10 — 1849655
- Replaced the top-level `_worker.js` with `worker-entry.mjs`, wiring the Pages edge worker to proxy `/api/*` and `/rpc`, and adjusted package metadata accordingly.

## 2025-10-10 — 993734f
- Scrubbed committed `.next/` build artifacts, updated `.gitignore`, and refreshed `.env.example`.
- Added a real `_worker.js` implementation plus `worker-entry.ts`, tweaked Next config, refreshed provider wiring, and brought public assets (frog icon, SVGs) into the repo.

## 2025-10-09 — a6f9e49
- Minor follow-up to the monorepo migration: synchronized Next build manifests and ensured the Pages worker bundle referenced the freshly generated assets.

## 2025-10-09 — 0eeb5aa
- Restructured the project into a pnpm monorepo (`apps/api`, `apps/ui`, `packages/shared`), added Cloudflare Worker sources (`env.ts`, `routes.ts`, `titan.ts`), and migrated UI sources under `apps/ui`.
- Added workspace tooling (Wrangler, Next-on-Pages, vitest setup), reorganized public assets, and introduced Solana/Titan libraries plus tests.

## 2025-10-09 — ce3b888
- Simplified the swap card header controls and attendant CSS, trimming redundant buttons while keeping layout intact.

## 2025-10-09 — 72aedc6
- Introduced the scrolling ticker header styling, adjusted page layout to host it, and cleaned swap card dependencies/tests accordingly.

## 2025-10-09 — 55ef72d
- Refined `AGENTS.md` contributor guidance with updated instructions and expectations.

## 2025-10-09 — 2f50f4a
- Integrated Titan swap execution: added `/api/frogx/quotes`, expanded swap card logic for route execution, updated tests, and extended quote preview hooks.

## 2025-10-09 — 0c76661
- Reverted to a quote-only swap card while expanding dependencies (pnpm lockfile, config, provider) and adjusting routes/tests to stabilize the UI.

## 2025-10-09 — 696eab4
- Added a pixel-art toggle control to the swap card, with matching CSS for hover/active states.

## 2025-10-09 — 43181c1
- Delivered a full swap card redesign (new layout, CSS module, hooks) and updated unit tests to match the refreshed structure.

## 2025-10-09 — b111af8
- Marked `SwapCard` and `useQuotePreview` as client-side modules to satisfy Next.js App Router requirements.

## 2025-10-09 — 55d7833
- Bootstrapped Frog Trading Exchange: initial Next.js app, Titan quote routes, swap card component/tests, Solana validation utilities, and PRD documentation.

## 2025-10-09 — 933b60a
- Initial commit seeding the repository with the MIT license.
