# Changelog

## Unreleased

### Workspace
- Migrated active work from legacy `/Users/aklo/dev/ftx` into managed workspace `/Users/aklo/projects/ftx`.
- Added Codex/Claude local context files for the managed workspace model.
- Set production Cloudflare Worker secret names for `AIRDROP_ADMIN_TOKEN` and `AIRDROP_ETH_RPC_URL`; `AIRDROP_ESCROW_PRIVATE_KEY` remains unset pending the escrow signer.
- Created temporary Solana deposit wallet `7p8n64DoGj1kQ2ChT7mXvbztVgjQEgESgrrqExryoNay` for DAEMON airdrop ETH gas bridging; private key stored in `~/.secrets.env:FROGX_DAEMON_GAS_SOL_DEPOSIT_SECRET_20260528180237`.
- Bridged `0.12 SOL` from the temporary deposit wallet to Ethereum mainnet escrow gas via deBridge order `0xe0b7ac08e8b0e4ecc19f79be011d1f4ce54b20b628d52eb2e6ac80f5def2d57a`; Solana creation tx `4TsdedhxEyyPa31RWHEigxERa1gKpmoAUGNTJKtpPBzpRVbK1TMqqLSvo1HA1khasNFGks2AAdxRE1sv2Km6yQFQ`, Ethereum fulfillment tx `0x48132942dcca7f67fafa39db8d06b83c28dfd7f7d929cbe759bbba6a91a9ad19`.

### Added
- DAEMON airdrop claim flow gated to wallets holding at least 1 Solana Business Frog, with a 10+ frog full-prize tier.
- Cloudflare Durable Object coordinator for airdrop claim ordering, duplicate prevention, used Frog mint tracking, and FCFS tiered payout finalization.
- Airdrop API endpoints for config/status, challenge creation, claim submission, admin finalization, and admin export.
- Guarded airdrop payout endpoint and scheduled autopayout path for automatic `$DAEMON` ERC20 sends from the configured escrow signer once production payout switches and chain checks pass.
- Airdrop page matching the home shell with Solana wallet proof, optional Phantom/EVM payout verification, manual Ethereum payout entry, and queued claim status.
- Final `$DAEMON` ERC20 contract and escrow wallet are exposed through airdrop config and admin payout export metadata.
- API unit tests for airdrop config parsing and deterministic tiered payout math.
- Local airdrop eligibility checks can reuse `NEXT_PUBLIC_SOLANA_RPC_URL` as a `SOLANA_RPC_URL` fallback when running the Worker dev harness.
- XP header chip that persists across routes (placeholder `4,269 XP` with sparkle).
- Ribbit profile hub with wardrobe selection, stats, achievements, activity timeline, and quests.
- AudioProvider to keep background music playing between navigations.
- Ribbit XP leaderboard page with glow tiers for top performers.
- Pixel trophy, wallet, swap, and sparkle icons in `/public`.

### Changed
- Enabled the DAEMON airdrop claim/reservation flow in production config while keeping automatic ERC20 payout flags off until the escrow signer secret is installed.
- Header hamburger uses pixel wallet icon and includes XP readout when connected.
- Leaderboard headers now match pixel SNES styling with neon accents.
- Top 3 leaderboard rows highlight gold/silver/bronze (avatar halo + text glow).

### Fixed
- Airdrop UI now distinguishes reserved claims from completed ERC20 payouts: claim status says “Reserved, not sent” until a payout transaction hash exists, the pool counter is labeled as unreserved supply, and paid claims link to Etherscan.
- Airdrop claims now reserve deterministic FCFS `$DAEMON` amounts immediately at claim time, so successful claims show the amount instead of remaining in a queued state.
- Airdrop queued state no longer says “Awaiting finalization,” since payout amounts are deterministic FCFS tiers and no VRF/random prize draw remains.
- Swap confirmation now checks confirmed on-chain errors before showing success.
- Swap execution now refreshes the executable quote immediately before signing instead of reusing a stale preview transaction.
- Platform fee routing now verifies the fee token account exists and matches the fee mint before sending it to Titan; invalid fee accounts are skipped so swaps do not fail.
- Platform fee mint selection now prefers stablecoin fee accounts when available before falling back to wSOL.
- Titan WebSocket protocol negotiation now only advertises the documented uncompressed `v1.api.titan.ag` protocol.
- Buyback progress now includes configured fee token accounts instead of only native SOL above reserve.
- Tapestry server config now resolves secrets lazily so Pages builds do not require local secret material.
- Eliminated duplicate background audio playback when navigating.
- Local Worker dev no longer exposes forwarded env values in process command-line args; it writes ignored `apps/api/.dev.vars` instead.
- Airdrop eligibility now only counts DAS assets whose `ownership.owner` exactly matches the connected Solana wallet, excluding burned/compressed assets so delegated or stale collection matches cannot inflate frog counts.
- Airdrop coordinator now keeps an append-only wallet event log for eligibility checks, challenge creation, and queued claims; admin export includes these events for future points analysis.
- Airdrop payout amounts are now deterministic FCFS tiers: 1-9 frogs receive `0.10` `$DAEMON`; 10+ frogs receive `1.00` `$DAEMON`, until the 10 `$DAEMON` pool is exhausted.
