# System Architecture

## Workspace

- Path: `/Users/aklo/projects/ftx`
- Repo: `https://github.com/aklo360/frogtradingexchange.git`
- Legacy source before migration: `/Users/aklo/dev/ftx`
- Default branch: `main`

## App Layout

- `apps/ui`: Next.js 15 App Router frontend for Frog Trading Exchange.
- `apps/api`: Cloudflare Worker API for Titan quote/swap integration.
- `apps/api/src/airdrop.ts`: DAEMON airdrop API and `AirdropCoordinator` Durable Object. It stores claim challenges, queued claims, used Frog mint IDs, finalization state, payout transaction hashes/status, and wallet event rows.
- `packages/shared`: placeholder shared workspace package.
- `scripts/dev-worker.mjs`: local Wrangler dev harness used by `pnpm dev`.

## Runtime Notes

- Local dev uses `pnpm dev` from the repo root.
- UI dev rewrites `/api/*` and `/rpc` to the local Worker.
- `scripts/dev-worker.mjs` loads root `.env*` files and writes forwarded Worker env into ignored `apps/api/.dev.vars` with owner-only permissions before starting Wrangler. Do not reintroduce secret-bearing `--var` command-line args.
- The airdrop route `/airdrop` is safe to ship disabled: `AIRDROP_ENABLED=false` in `wrangler.toml`. It uses the same home shell but disables background music on that route. Enabling claims requires Worker secret `AIRDROP_ADMIN_TOKEN` and claim dates if desired. Finalization assigns FCFS tiers from claim-time frog count: 1-9 frogs receive `0.10` `$DAEMON`, 10+ frogs receive `1.00` `$DAEMON`, until the 10 `$DAEMON` pool is exhausted. Enabling sends additionally requires `AIRDROP_PAYOUT_ENABLED=true`, optional `AIRDROP_AUTO_PAYOUT_ENABLED=true`, Worker secrets `AIRDROP_ETH_RPC_URL` and `AIRDROP_ESCROW_PRIVATE_KEY`, live Ethereum token bytecode, escrow `$DAEMON` balance, and escrow ETH gas.
- DAEMON payout metadata is first-class Worker config: token `0x43298327b0249caF5A4942C6951F5Ac6AD7297A0`, escrow `0xC853Fc4dE86fC8868Fa89FC3B207d4592Db19e46`, 18 decimals. Admin export includes human `$DAEMON` amounts and ERC20 base-unit amounts.
- Airdrop frog counts use Solana DAS `searchAssets`, so local/prod eligibility requires a DAS-capable RPC such as Helius. Without it the UI must keep the payout/claim steps disabled.
- Production deployment is `pnpm run deploy:prod`, which deploys the API Worker and Cloudflare Pages UI. Confirm target/environment before any deploy.
- Secrets live outside git in env files and Cloudflare secrets; do not read, print, or rotate them unless AKLO explicitly asks.
