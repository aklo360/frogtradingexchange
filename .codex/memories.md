# Memories [keep under 2200 chars]

FTX/FrogX is a Next 15 UI and Cloudflare Worker. Ribbot is a separate standalone Node Telegram runtime and thin UX/cache; wallet, risk, lifecycle, and execution authority remain in FTX. Eliza is an obsolete reference implementation and must not be deployed as Ribbot.

The public UI currently exposes only `/`, `/profile`, and `/ribbot`. Unfinished `/perps`, `/leaderboard`, and `/airdrop` routes and navigation are removed. The Pages entrypoint keeps `/api/tapestry/*` in the Next edge worker and proxies other `/api/*` calls to the FTX API Worker. Profile creation uses Tapestry and returns visible errors; optional social/activity enrichment cannot invalidate a successful profile creation.

Privy React is installed for scoped `/ribbot` wallet ownership controls, and the public app ID is embedded at build time. Telegram login creates no wallet (`createOnLogin: off`), export stays in Privy's isolated modal, and controls require the exact Privy user, Telegram ID, and Solana wallet. No Privy secret belongs in the browser. Full live Worker/Ribbot credential compatibility and existing-wallet recovery still require private verification.

Accounts persist up to 10 embedded Privy Solana wallet slots plus an active ID; linked external wallets are excluded. Legacy fields project the active slot. Telegram selection is complete; additional wallet creation/import, disperse, bridge, and true multi-wallet Bundle Buy are not.

FTX owns mode, confirmation, buy/sell presets and fees, sell protection, automation opt-ins, Instant Auto Buy, copytrade strategy/filter state, execution locks, and reconciliation. Simple mode forces confirmation off. Every live path requires false-by-default feature gates, account opt-in, matching managed wallet, signer config, no revocation, and RPC/risk checks. Privy POSTs use deterministic references/idempotency keys. Ambiguous sends stay locked; wallet/chain-validated GET-only reconciliation never resends.

Referral payouts do not exist. PNL is estimated from confirmed Solana balance fills with event fallback and has no realized/FIFO accounting. The standalone Ribbot service remains stopped pending an explicit runtime/Worker compatibility decision; do not restart Eliza.
