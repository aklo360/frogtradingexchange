# Memories [keep under 2200 chars]

FTX/FrogX is a Next 15 UI and Worker. Ribbot is Telegram UX/cache; wallet, risk, lifecycle, and execution authority remain in FTX.

Accounts persist up to 10 embedded Privy Solana wallet slots plus an active ID; linked external wallets are excluded. Legacy fields project the active slot. Telegram selection is complete; additional wallet creation/import, disperse, bridge, and true multi-wallet Bundle Buy are not.

FTX owns mode, confirmation, 2-4 buy/sell presets, separate fees, sell protection, automation opt-ins, and a separate default-off Instant Auto Buy profile. Simple mode forces confirmation off; protected sells above 75% still confirm. Pasted-CA instant buys require a managed Privy wallet, FTX risk precheck, exact stored amount/buy fee/slippage, SOL-to-token direction, and a second FTX risk check inside tagged `/execute` before Privy.

FTX owns copytrade sizing/caps, controls, filters, pause, edit, and duplicate. Target changes and copies establish a fresh baseline.

UI `/ribbot` uses short sessions and includes Instant Auto Buy controls. Privy login requires exact identity/wallet match, creates no wallet, keeps export in Privy's modal, and controls app signers before syncing FTX pause. Live verification remains.

Live execution defaults off and requires base/per-feature gates, opt-in, matching managed wallet, signer config, no revocation, and RPC/risk checks. Privy POSTs use deterministic references/idempotency keys. Ambiguous sends stay locked; wallet/chain-validated GET-only reconciliation rejects stale writes and never resends.

Unresolved sends share a 900-second review threshold; closure requires terminal evidence. Cron atomically claims executions. Baskets never auto-resume. Sniper applies launch source/cooldown/cap/authority/liquidity/market-cap/balance/risk checks. All gates default false.

Referral payouts do not exist. PNL indexes confirmed Solana balance fills with event fallback; USD remains net-SOL/current-price estimated, with no realized/FIFO accounting. Code-level Instant Auto Buy is verified locally; no deploy, Telegram send, live Privy/Solana call, or secret change occurred.
