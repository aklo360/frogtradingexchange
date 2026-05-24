# Changelog

## Unreleased

### Workspace
- Migrated active work from legacy `/Users/aklo/dev/ftx` into managed workspace `/Users/aklo/projects/ftx`.
- Added Codex/Claude local context files for the managed workspace model.

### Added
- XP header chip that persists across routes (placeholder `4,269 XP` with sparkle).
- Ribbit profile hub with wardrobe selection, stats, achievements, activity timeline, and quests.
- AudioProvider to keep background music playing between navigations.
- Ribbit XP leaderboard page with glow tiers for top performers.
- Pixel trophy, wallet, swap, and sparkle icons in `/public`.

### Changed
- Header hamburger uses pixel wallet icon and includes XP readout when connected.
- Leaderboard headers now match pixel SNES styling with neon accents.
- Top 3 leaderboard rows highlight gold/silver/bronze (avatar halo + text glow).

### Fixed
- Swap confirmation now checks confirmed on-chain errors before showing success.
- Swap execution now refreshes the executable quote immediately before signing instead of reusing a stale preview transaction.
- Platform fee routing now verifies the fee token account exists and matches the fee mint before sending it to Titan; invalid fee accounts are skipped so swaps do not fail.
- Platform fee mint selection now prefers stablecoin fee accounts when available before falling back to wSOL.
- Titan WebSocket protocol negotiation now only advertises the documented uncompressed `v1.api.titan.ag` protocol.
- Buyback progress now includes configured fee token accounts instead of only native SOL above reserve.
- Tapestry server config now resolves secrets lazily so Pages builds do not require local secret material.
- Eliminated duplicate background audio playback when navigating.
