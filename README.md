# Frog Trading Exchange

Frog Trading Exchange (FTX) is a Titan-powered Solana swap client built with Next.js App Router and a retro SNES-inspired UI. The application streams Titan quotes server-side, guards swap execution with freshness checks, and serves as the launchpad for the “Swamp” profile and gamification roadmap described in [`docs/prd.md`](docs/prd.md).

## Project Layout

- `src/app/` – App Router routes, including `/api/frogx/*` server handlers.
- `src/components/` – Reusable UI, starting with the `SwapCard` swap shell.
- `src/lib/` – Typed configuration, Titan client helpers, and Solana utilities.
- `scripts/` – Operational scripts (e.g. `prewarm-blockhash.ts`).
- `tests/` – Integration scaffolding and fixtures; unit specs live alongside source files.
- `docs/` – Product requirements and RFCs.

## Getting Started

```bash
pnpm install
pnpm dev
```

The dev server runs on [http://localhost:3000](http://localhost:3000). Default API handlers return mocked Titan data when `TITAN_TOKEN` is not present so the UI stays interactive offline.

## Key Commands

- `pnpm lint` – ESLint + Prettier conformance using `next/core-web-vitals` rules.
- `pnpm test` – Vitest unit suites (jsdom environment).
- `pnpm test:e2e` – Placeholder for streamed quote smoke tests (skip by default).
- `pnpm prewarm:blockhash` – Sample script hook for Solana RPC warmups.
- `pnpm build && pnpm start` – Production build verification.

## Environment

Duplicate `.env.example` into `.env.local` and add Titan + Solana credentials. Server handlers will throw if you attempt to call live Titan endpoints without the required token.

## Next Steps

1. Wire Titan WebSocket streaming into `/api/frogx/quotes` with region failover.
2. Implement wallet connectivity and Solana transaction submission in the client.
3. Expand test coverage (≥80% branch) on quote selection + swap send flows.
4. Flesh out Phase 2 profile (“Swamp”) modules and associated APIs.
