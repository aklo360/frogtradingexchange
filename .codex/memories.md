# Memories [keep under 2200 chars]

FTX/FrogX is a Next 15 UI and Cloudflare Worker. Ribbot is a standalone Telegraf runtime and thin UX/cache; wallet, risk, lifecycle, Business Frog ownership, and execution authority remain in FTX. Eliza is obsolete and must not be deployed.

The public UI exposes only `/` and `/profile`; unfinished `/perps`, `/leaderboard`, `/airdrop`, and `/ribbot` pages are removed. The buyback-and-burn tracker remains on the homepage and Profile shares its background. Pages keeps `/api/tapestry/*` local and proxies other `/api/*` calls to the API Worker.

Profile uses Privy React with the same app ID as Ribbot, offers Telegram-first recovery, lists Solana wallets, and creates a wallet only after an explicit action when none exists. Privy secrets remain Worker-only. The target wallet `9p9UcNW4QaAcw6pRAMFtaJHuNChL6dFFnbYzARTnJSWY` was live on Solana on 2026-07-12; ownership recovery still requires the user's Privy Telegram login.

Business Frog holdings are independent of Tapestry. The web Profile sends every Privy-linked Solana wallet plus the currently connected Solana wallet to `/api/frogx/nfts`; authenticated `/api/frogx/trading-bot/nfts` derives all embedded slots from the stored Telegram account. Both hard-filter collection `J7r...BkeMG` and verify current ownership. Profile holdings remain visible during social outages.

Accounts persist up to ten embedded Privy Solana wallet slots plus an active ID; linked external wallets are excluded. Legacy fields project the active slot. Telegram selection is complete; additional wallet creation/import, disperse, bridge, and true multi-wallet Bundle Buy are not.

FTX owns mode, presets/fees, protection, automation opt-ins, Instant Auto Buy, copytrade state, execution locks, and reconciliation. Every live path requires false-by-default gates, account opt-in, matching managed wallet, signer config, no revocation, and RPC/risk checks. Ambiguous sends stay locked; wallet/chain-validated GET-only reconciliation never resends.

Referral payouts do not exist. PNL is estimated from confirmed Solana balance fills with event fallback and has no realized/FIFO accounting. Production Ribbot is the standalone LaunchAgent; do not restart Eliza.
