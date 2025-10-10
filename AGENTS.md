# Frog Trading Exchange — Engineering Guidelines

## 1. Monorepo Overview

```
apps/
  api/            # Cloudflare Worker backend (Wrangler)
    src/env.ts    # Env parsing helpers
    src/routes.ts # GET/POST handlers for info/quotes/swaps
    src/titan.ts  # Titan WebSocket + normalization logic
    package.json
    wrangler.toml
  ui/             # Next.js 15 App Router frontend
    src/app/      # Layout and pages
    src/components/
    src/lib/
    src/providers/
    worker-entry.mjs      # Custom entry for Pages worker
    next.config.ts
    package.json
packages/
  shared/         # Placeholder for shared packages
scripts/
  dev-worker.mjs  # Local Wrangler dev launcher
pnpm-workspace.yaml
package.json       # Root scripts including deploy:prod
```

- Managed with **pnpm workspaces**. Run `pnpm install` once at the repo root.
- UI: Next.js App Router, TypeScript, Vitest tests under `src/**/__tests__`.
- Backend: Cloudflare Worker (`wrangler`), handles Titan WebSocket and REST calls.
- Pages worker proxies `/api/*` → Worker and `/rpc` → private Solana RPC.

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

## 5. Flow Summary

1. UI fetches `/api/frogx/quotes|swap|info` → Pages worker proxies to `https://frogx-api.aklo.workers.dev` → Worker negotiates with Titan.
2. Wallet RPC calls go to `/rpc` → Pages worker proxies to secret `SOLANA_RPC_URL` (Helius) → Solana RPC responds. No private key leaks to the client.
3. Worker handles Titan WebSocket negotiation, picks best route, returns normalized JSON (transaction base64 + instructions).

## 6. Coding Practices

- TypeScript, strict mode. PascalCase components, camelCase functions/hooks, SCREAMING_SNAKE_CASE constants.
- Keep reusable logic under `src/lib`, server-only logic under `apps/api/src`.
- Document new env vars in `.env.example`. Never commit real tokens.
- Prefer small, pure functions; add unit tests with Vitest/RTL.
- Titan integration: expect connection drops; surface errors with context.

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

Keep this document updated when architecture or tooling shifts. With the monorepo stabilized and one-command deploys, focus on swap UX, Titan resiliency, and Solana-edge testing.
