# Memories [keep under 2200 chars]

FTX/FrogX is a Next 15 UI and Cloudflare Worker. Ribbot is a standalone Telegraf runtime and thin UX/cache; wallet, risk, lifecycle, Business Frog ownership, external-chain ingestion, and execution authority remain in FTX. Eliza is obsolete and must not be deployed.

The public UI exposes only `/` and `/profile`; unfinished `/perps`, `/leaderboard`, `/airdrop`, and `/ribbot` pages are removed. Profile uses Privy React with Telegram-first recovery, lists Solana wallets, and creates a wallet only after explicit action. Privy secrets remain Worker-only. The target wallet `9p9UcNW4QaAcw6pRAMFtaJHuNChL6dFFnbYzARTnJSWY` was live on Solana on 2026-07-12; ownership recovery still requires the user's Privy Telegram login.

Business Frog holdings are FTX-owned and independent of social providers. Public and Ribbot routes hard-filter collection `J7r...BkeMG`, verify ownership, and aggregate up to ten embedded Privy Solana wallet slots; linked external wallets are excluded. Additional wallet creation/import, disperse, bridge, and true multi-wallet Bundle Buy are not complete.

FTX owns settings, presets/fees, protection, automation opt-ins, Instant Auto Buy, copytrade state, execution locks, and reconciliation. Every live path requires false-by-default gates, account opt-in, a matching managed wallet, signer config, no revocation, and RPC/risk checks. Ambiguous sends stay locked; wallet/chain-validated GET-only reconciliation never resends.

FTX also owns Ribbot's read-only Robinhood Chain signals. The scanner is false by default with an approved production-only override. Live Worker `23602e96-af77-4f7f-a8fb-314bd2e08c84` reuses one scan to union bounded top/trending/new pools, rank volume/new-pair leaders, and detect new-pair, threshold, surge, and wallet-convergence events. Its first volume snapshot sampled 30 pools and stored 25 leaders plus 17 baseline signals. The authenticated route exposes public results only and has no wallet, Privy, swap, or execution capability.

Referral payouts do not exist. PNL has no realized/FIFO accounting. Production Ribbot is the standalone LaunchAgent; do not restart Eliza.
