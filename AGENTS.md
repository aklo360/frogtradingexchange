# Repository Guidelines

## Project Structure & Module Organization
The project targets a Next.js App Router setup with TypeScript. Keep routes in `app/`, reusable components in `components/`, and shared logic in `lib/` (Titan clients, Solana helpers). Server-only utilities belong under `app/api/` with domain folders such as `frogx/quotes` and `frogx/swap`. Place colocated unit specs in `__tests__/`, cross-cutting integration suites in `tests/`, and public assets in `public/`. Scripts for Solana or Titan maintenance should sit in `scripts/`. Treat `docs/prd.md` as the product reference and file related RFCs beside it.

## Build, Test, and Development Commands
Install dependencies with `pnpm install`; pnpm is the team default for reproducible lockfiles. Use `pnpm dev` to run the Next.js dev server against Titan’s demo cluster. Validate builds with `pnpm build` followed by `pnpm start`. Run `pnpm lint` for ESLint/Prettier enforcement and `pnpm test` for Vitest unit suites; both run in CI. Execute `pnpm test:e2e` for smoke flows against the demo cluster using mock wallets.

## Coding Style & Naming Conventions
Adopt Prettier defaults (2-space indent, single quotes) with the ESLint config extending `next/core-web-vitals`. Use PascalCase for React components, camelCase for functions and hooks, and SCREAMING_SNAKE_CASE for runtime environment constants. Name files in kebab-case (e.g., `quote-ticker.tsx`); hooks live in `lib/hooks/` and begin with `use`. Guard Titan credentials in server-only modules and expose configuration through typed helpers in `lib/config.ts`.

## Testing Guidelines
Vitest plus React Testing Library drives unit coverage; name files `<subject>.test.ts[x]`. Integration and API contract suites under `tests/` must stress Titan stream edge cases and Solana transaction flows, storing fixtures in `tests/fixtures/`. Target ≥80% branch coverage on quote selection and swap execution logic. Before merge, run `pnpm test` and `pnpm test:e2e`; never hit production endpoints.

## Commit & Pull Request Guidelines
Follow Conventional Commits (`feat(swap-card): guard stale quotes`) with one logical change per commit and matching tests. Pull requests need a summary, linked ticket, UI or CLI evidence when relevant, and confirmation that lint/tests passed. Surface risks tied to Titan API changes or Solana assumptions so reviewers can focus on integration hotspots.

## Security & Configuration Tips
Record required variables in `.env.example` and keep secrets in `.env.local`. Titan tokens and Solana keypairs stay server-side; API routes read them through helpers only. Rotate credentials regularly and monitor unusual quote reconnect rates. When adding dependencies, disable optional telemetry by default.
