# Memories [keep under 2200 chars]

FTX/FrogX is a Next 15 UI and Cloudflare Worker. Ribbot is a separate standalone Node Telegram runtime and thin UX/cache; wallet, risk, lifecycle, and execution authority remain in FTX. Eliza is an obsolete reference implementation and must not be deployed as Ribbot.

The public UI currently exposes only `/` and `/profile`. Unfinished `/perps`, `/leaderboard`, `/airdrop`, and `/ribbot` routes and navigation are removed. The homepage buyback-and-burn tracker renders in both app versions, and Profile reuses the exact homepage background. The Pages entrypoint keeps `/api/tapestry/*` in the Next edge worker and proxies other `/api/*` calls to the FTX API Worker. Profile creation uses Tapestry and returns visible errors; optional social/activity enrichment cannot invalidate a successful profile creation.

There is no public web Privy wallet-control surface. Privy wallet ownership and execution remain FTX/standalone-Ribbot concerns, and no Privy secret belongs in a browser bundle. FTX publishes the known public app ID and accepts the deployed `FROGX_BOT_API_TOKEN`/`PRIVY_SIGNER_ID` compatibility aliases; private existing-wallet verification still requires the standalone bot runtime.

Accounts persist up to 10 embedded Privy Solana wallet slots plus an active ID; linked external wallets are excluded. Legacy fields project the active slot. Telegram selection is complete; additional wallet creation/import, disperse, bridge, and true multi-wallet Bundle Buy are not.

FTX owns mode, confirmation, buy/sell presets and fees, sell protection, automation opt-ins, Instant Auto Buy, copytrade strategy/filter state, execution locks, and reconciliation. Simple mode forces confirmation off. Every live path requires false-by-default feature gates, account opt-in, matching managed wallet, signer config, no revocation, and RPC/risk checks. Privy POSTs use deterministic references/idempotency keys. Ambiguous sends stay locked; wallet/chain-validated GET-only reconciliation never resends.

Referral payouts do not exist. PNL is estimated from confirmed Solana balance fills with event fallback and has no realized/FIFO accounting. The standalone Ribbot service remains stopped pending an explicit runtime/Worker compatibility decision; do not restart Eliza.
