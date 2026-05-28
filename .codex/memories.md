# Memories [~90% - keep under 2200 chars]

FTX (Frog Trading Exchange) is managed at `/Users/aklo/projects/ftx`. Git remote is `https://github.com/aklo360/frogtradingexchange.git`; default push identity is `aklo360`.

Stack: pnpm monorepo with Next.js 15 UI in `apps/ui` and Cloudflare Worker API in `apps/api`. Confirm before deploying or changing Cloudflare/Titan/Solana secrets.

DAEMON airdrop is disabled by default: `/airdrop` UI plus Worker `/api/frogx/airdrop/*` and `AirdropCoordinator`. It requires at least 1 Business Frog and a Solana signature binding the entered ETH payout address; Phantom/EVM signature is optional. Finalization assigns FCFS tiers: 1-9 frogs get `0.10` `$DAEMON`, 10+ frogs get `1.00` `$DAEMON`, until the 10 `$DAEMON` pool is exhausted.

Payout config: token `0x43298327b0249caF5A4942C6951F5Ac6AD7297A0`, escrow `0xC853Fc4dE86fC8868Fa89FC3B207d4592Db19e46`, 18 decimals. Keep `AIRDROP_ENABLED=false`, `AIRDROP_PAYOUT_ENABLED=false`, and `AIRDROP_AUTO_PAYOUT_ENABLED=false` until token bytecode exists, escrow has 10 `$DAEMON`, escrow has ETH gas, and `AIRDROP_ETH_RPC_URL`/`AIRDROP_ESCROW_PRIVATE_KEY` Worker secrets are set.

Temporary gas wallet `7p8n64DoGj1kQ2ChT7mXvbztVgjQEgESgrrqExryoNay`; key stored in `~/.secrets.env:FROGX_DAEMON_GAS_SOL_DEPOSIT_SECRET_20260528180237`. Bridged `0.12 SOL` to escrow ETH via deBridge order `0xe0b7...d57a`; Solana tx `4Tsd...6yQFQ`, Ethereum tx `0x4813...ad19`. Escrow ETH verified around `0.00427738 ETH`.

Local eligibility needs a Helius/DAS-capable `SOLANA_RPC_URL`. `scripts/dev-worker.mjs` writes forwarded env into ignored `apps/api/.dev.vars` instead of CLI `--var` args so secrets do not appear in `ps`.

For future points, the Durable Object records append-only wallet events (`eligibility_checked`, `eligibility_unavailable`, `challenge_created`, `claim_queued`, `payout_sent`, `payout_failed`) in admin export. Treat signed challenge/claim events as stronger evidence than unsigned eligibility checks.
