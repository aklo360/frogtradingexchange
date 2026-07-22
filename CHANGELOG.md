# Changelog

## Unreleased

### Workspace
- Migrated active work from legacy `/Users/aklo/dev/ftx` into managed workspace `/Users/aklo/projects/ftx`.
- Moved the managed repo from `/Users/aklo/projects/ftx` to nested path `/Users/aklo/projects/solanaBFS/ftx` because Frog Trading Exchange is a SolanaBFS subproject.
- Added Codex/Claude local context files for the managed workspace model.
- Added a Cloudflare Single Redirect rule for the vanity domain
  `hyperribbit.xyz`, redirecting apex and `www` traffic to
  `https://frogtrading.exchange` with path/query preservation. No Worker or
  Pages deployment was performed.
- Set production Cloudflare Worker secret names for `AIRDROP_ADMIN_TOKEN` and `AIRDROP_ETH_RPC_URL`; `AIRDROP_ESCROW_PRIVATE_KEY` remains unset pending the escrow signer.
- Created temporary Solana deposit wallet `7p8n64DoGj1kQ2ChT7mXvbztVgjQEgESgrrqExryoNay` for DAEMON airdrop ETH gas bridging; private key stored in `~/.secrets.env:FROGX_DAEMON_GAS_SOL_DEPOSIT_SECRET_20260528180237`.
- Bridged `0.12 SOL` from the temporary deposit wallet to Ethereum mainnet escrow gas via deBridge order `0xe0b7ac08e8b0e4ecc19f79be011d1f4ce54b20b628d52eb2e6ac80f5def2d57a`; Solana creation tx `4TsdedhxEyyPa31RWHEigxERa1gKpmoAUGNTJKtpPBzpRVbK1TMqqLSvo1HA1khasNFGks2AAdxRE1sv2Km6yQFQ`, Ethereum fulfillment tx `0x48132942dcca7f67fafa39db8d06b83c28dfd7f7d929cbe759bbba6a91a9ad19`.
- Consolidated `0.0073 SOL` more into the temporary gas wallet via txs `A1RbohNvDCZFmjdXZYpkfWHV5jrUzSoQt2J5cUru4XJdFB3JpHCQgFyRnQTtEPvYrm1sCPc9hm4Wvqoq7d7B1PQ` and `2bLrmYrqov7XySCr6t2nKrWphTkhGHadik9wpQPKDGUWahiGV4e7DhiGW2EPKWexGY9YMcrJRVLqSq4v5fw7rxPC`; deBridge still rejected the usable amount as below current economic minimum after transaction rent/fee headroom.
- Created new controllable Ethereum airdrop escrow `0x2c475831b645620A2bE61f1435c2863242470B71`, funded it with `0.01 ETH`, and set its signer as the production Worker secret `AIRDROP_ESCROW_PRIVATE_KEY`; the new escrow still needs `10 $DAEMON` before payout flags can be enabled.
- Replaced the production `AIRDROP_ESCROW_PRIVATE_KEY` with the original escrow signer after verifying the seed derives `0xC853Fc4dE86fC8868Fa89FC3B207d4592Db19e46`, moved `0.009 ETH` from the new escrow to the original escrow in tx `0xbf2264236ec8677e693507d8bb1eac6e72529fc372afd881c288675c2abf87ad`, and enabled payout/autopayout flags.
- Deployed payout-enabled Worker version `62dd0d2c-86fe-4346-888c-753f86d5f9ad` and sent claim #1 payout of `0.10 $DAEMON` to `0xF39221B3382879B35cE360344406937C21d1ee90` in tx `0x1e1c7607714dc7fa9acc6c1e192cc288375d50319a8d1b7dedaef300694b04d2`.

### Added
- Added configurable Telegram sweep item pacing with `FROGX_NFT_SWEEP_ITEM_DELAY_MS` (2.5s in production) so `/sweep 10` builds Magic Eden buy transactions sequentially instead of tripping rate limits.
- Privy account-mode shell for the profile UI, including a client-only provider,
  account panel, embedded Solana hot-wallet creation control, Telegram login
  visibility, and verification-only external wallet status.
- Public Privy app id and JWKS URL placeholders for local/prod configuration.
- Google + Telegram account linking controls in the FrogX account panel, so a
  user can log in with one provider and attach the other to the same Privy user.
- Account architecture API routes:
  `GET /api/frogx/account/config` and `POST /api/frogx/account/intents`.
  Bot trade intents can be staged for `swap` and `buy-floor`; automated bot
  execution remains disabled unless account mode, bot trading, bot auth, and
  signer-policy gates are all enabled. The old FTX Preview buy-floor handoff is
  superseded for Ribbot by Telegram confirmation callbacks.
- Telegram account creation route:
  `POST /api/frogx/account/telegram` lets Ribbot create or find the
  Telegram-linked Privy user and ensure an embedded Solana wallet before sending
  a buy/sweep approval card, so new users do not have to leave Telegram just to
  create an FTX account.
- The Telegram account route now returns all wallet accounts linked to the same
  FTX/Privy user, marking which delegated embedded Solana wallet Ribbot can use
  for Telegram approvals while keeping external wallets verification-only.
- Public account config now exposes `accountCreation.ftxWebEnabled`,
  `accountCreation.telegramBotEnabled`, the enabled surfaces, and
  `telegram_user_id` as the Ribbot convergence key, making FTX web and Telegram
  bot account creation first-class independent entry points.
- FTX web and Telegram account creation readiness are now split correctly:
  FTX web requires `NEXT_PUBLIC_PRIVY_APP_ID`, while Telegram bot creation can
  use server-side Privy credentials plus bot auth and delegated-wallet signer
  configuration.
- Account readiness probe:
  `pnpm --filter @frogx/api run account:check` checks public production config
  for at least one live account creation surface, reports FTX web and Telegram
  bot gates separately, and verifies fail-closed Ribbot safety without printing
  secrets.
- Telegram account setup readiness now exposes `telegramSetupReadiness` and
  `telegramSetupMissing` in account config, and protected
  `/api/frogx/account/telegram` 503 responses return the same missing-gate map
  so Ribbot and ops can distinguish account-creation blockers from trade
  execution blockers without reading secrets.
- Added authenticated non-mutating Telegram setup probe
  `POST /api/frogx/account/telegram/probe`. It verifies bot bearer auth and
  returns Telegram account setup readiness without creating a Privy user or
  wallet. `account:check -- --telegram-probe` can call it when
  `FROGX_BOT_API_TOKEN` is present in the local environment.
- `account:check -- --cloudflare-secrets` now checks Cloudflare Worker secret
  binding names only, reporting missing Privy/Magic Eden/Ribbot bindings without
  reading or printing secret values.
- Added `pnpm --filter @frogx/api run secret:put -- <NAME>` to install the
  remaining Privy Worker secrets from clipboard/stdin/env without printing the
  secret value.
- Installed the required production Privy Worker secrets:
  `PRIVY_APP_SECRET`, `PRIVY_SIGNER_ID`, and
  `PRIVY_AUTHORIZATION_PRIVATE_KEY`, verifying by binding name only.
- Magic Eden NFT routes for Solana Business Frogs:
  `GET /api/frogx/nfts/floor` returns floor/listing data and
  `POST /api/frogx/nfts/buy-floor` prepares Magic Eden buy transactions for the
  caller's connected wallet to sign/send client-side.
- Ribbot Telegram execution route:
  `POST /api/frogx/nfts/execute-floor` verifies bot auth, finds the
  Telegram-linked delegated embedded Privy Solana wallet, rebuilds fresh Magic
  Eden buy transactions, enforces token/total limits, and submits through
  Privy `signAndSendTransaction`. It fails closed until bot execution flags,
  Privy app secret, Privy authorization key, and policy gates are configured.
- Deployed the fail-closed account/Telegram execution API to production Worker
  version `f66f1c64-f3f5-40db-a0ea-af332996acf8`. Live config now reports bot
  API auth configured while bot trading/execution remain off and Privy app
  secret, signer id, and authorization signer remain unset.
- Generated `FROGX_BOT_API_TOKEN` for Ribbot-to-FrogX API auth and stored it
  without printing the value in Cloudflare Worker secret `frogx-api` and Mini
  `/Users/llphant/.secrets.env`.
- Tensor REST API key health check helper and `pnpm --filter @frogx/api run
  tensor:check` script for validating old Tensor keys against the current
  `api.mainnet.tensordev.io` endpoint without printing the key.
- Unit tests covering account-mode config, bot intent authorization/disabled
  execution behavior, Magic Eden floor normalization/fail-closed behavior, and
  user-wallet NFT buy transaction preparation.
- Read-only `/perps` terminal prototype with Imperial market data, Coinbase-backed 15-minute candlestick charts for supported markets, route preview, funding/cost panels, GMGN chart links for mapped Solana assets, and a `PERPS` hamburger menu link.
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
- Added Privy, Solana Kit, Solana program, and optional peer dependencies needed
  for Privy Solana embedded-wallet support.
- Replaced the visible wallet-adapter connect entry point with the Privy account
  login flow. The swap card now uses the Privy FrogX Solana wallet for signing
  executable swap transactions, and airdrop/profile/leaderboard connection
  state now comes from Privy instead of wallet-adapter hooks.
- Changed Privy embedded Solana wallet creation to auto-create for users
  without wallets while keeping `/profile` as the explicit manual recovery path
  for the future FTX/Ribbot wallet.
- Disabled automatic embedded wallet creation for Ethereum, disabled automatic
  embedded-wallet migration, and kept embedded wallet UI modals enabled for
  wallet creation and signing prompts.
- Moved the FrogX account setup panel off the swap home page and onto
  `/profile`, with profile navigation available before login and in v1 mode.
- Extended `.env.example` with Privy, FrogX account-mode, Ribbot bot-auth, and
  Magic Eden integration flags while keeping signing secrets out of git.
- Enabled Google in the Privy login method list and added Telegram CSP allowances
  for the login widget script/iframe.
- Changed the current Privy primary login order to Telegram, Google, Phantom,
  MetaMask so Telegram-created users can enter FTX web through the same account
  before linking Google or Phantom.
- Set production Worker non-secret account-mode vars in `wrangler.toml` while
  leaving Ribbot bot execution disabled.
- Added `NEXT_PUBLIC_PRIVY_APP_ID` to Worker vars so public account readiness can
  report the FTX web account surface independently from Telegram server
  credentials.
- Made the UI Pages deploy script explicitly deploy branch `main` for
  production and added `deploy:pages:preview` for feature-branch previews.
- Perps charts now use TradingView Lightweight Charts instead of the hand-drawn SVG candle renderer.
- Background music now defaults to muted, and the perps page includes the shared header mute/unmute button.
- Replaced the shared top-right wallet-shaped navigation trigger with a hamburger icon while keeping the airdrop reachable from the menu.
- Enabled the DAEMON airdrop claim/reservation flow in production config while keeping automatic ERC20 payout flags off until the escrow signer secret is installed.
- Header navigation includes XP readout when connected.
- Leaderboard headers now match pixel SNES styling with neon accents.
- Top 3 leaderboard rows highlight gold/silver/bronze (avatar halo + text glow).

### Fixed
- Reduced Magic Eden 429 failures during Telegram sweep execution in production
  Worker `62233716-d21b-49ed-a2eb-81f5713bbb76`: `execute-floor` now carries
  a per-sweep exclusion set so later sweep items do not retry mints already
  proven stale or already submitted in the same sweep, and Magic Eden 429
  retries now use a longer bounded backoff. API tests pass 59/59, including a
  regression proving stale mints are not rebuilt again on item 2 of a sweep.
- Fixed the SBF MMM floor quote blocker in production Worker
  `e4374ed9-b16a-4881-86ab-ad5d1260092a`: `/nfts/buy-floor` now sends MMM
  `maxPaymentAmount` as the exact raw lamport sell price, matching the
  existing buyback path, and computes that price from the pool spot price,
  curve delta, and LP fee when present. The prior SOL-decimal cap caused the
  current `0.032007782` floor wall to reject with `InvalidRequestedPrice`.
  API tests pass 58/58; live no-submit probes against the Telegram-linked FTX
  wallet now return executable/preflight-OK MMM quotes for quantity 1 and
  quantity 2 at `0.032007782` per frog.
- Restored strict SBF floor-buy behavior after the bad `0.053494` fallback:
  `buy-floor` now keeps searching the visible `0.032007782` Magic Eden MMM floor
  wall up to the 50-deep production preflight scan, separates the internal
  scanner cap from the public `/floor` response cap, and refuses to stage a
  higher-price confirmation card while cheaper frogs are visible. Buyer low-SOL
  preflight errors now stop immediately with `INSUFFICIENT_SOL` instead of
  blocking the MMM pool and causing misleading marketplace errors. Production
  Worker `5997afb3-44f9-4ae3-bda1-82c94e366c13` was deployed with API tests
  passing 55/55; a live no-submit dust-wallet probe now reaches the 0.032 floor
  transaction and reports the wallet funding blocker instead of a stale/higher
  fallback quote.
- Floor buy routing now gets past the current SBF stale/high-fee Magic Eden
  floor wall: the API retries multiple same-pool MMM mints before marking a
  stale pool, skips MMM pools with buyer-side royalty above 10%, and allows the
  first executable normal-cost listing while still failing closed on non-stale
  cheaper preflight failures. Production Worker
  `73bdc776-f9e1-4e7c-aa15-1332bf1e9c7f` was deployed with API tests passing
  54/54; a live no-submit probe skipped stale `0.032007782` MMM listings and
  `10000`-bp buyer-royalty MMM tiers, then built/preflighted an executable M2
  quote at `0.053494` SOL.
- Stale lower-floor MMM walls now return the top-level error
  `Magic Eden floor listings are stale; no higher-price fallback was staged`,
  so Ribbot describes the actual floor-wall failure instead of the generic
  lower-floor blocker; production Worker
  `394555e8-d120-4672-af1f-5a0da88577a2` was deployed with API tests passing
  52/52.
- One-frog floor quote failures now fall through to the specific Magic Eden
  build/stale/no-executable blocker instead of reporting the higher-fallback
  guard when no quote was selected; production Worker
  `d3e935d8-a1e7-4e04-aef6-8010663ad3af` was deployed with API tests passing
  52/52.
- Floor quote selection now fails closed if any cheaper visible candidate fails
  build/preflight, including stale MMM floor walls, so Ribbot cannot stage a
  higher-price quote while lower frogs are visible; production Worker
  `ae5df98a-c616-4800-b70f-3687c3cf265d` was deployed with API tests passing
  51/51.
- Magic Eden transaction-build requests now retry transient 429 responses with
  bounded backoff, including Telegram execution builds; production Worker
  `acd782b1-4361-4b96-818d-44d73a860292` was deployed with API tests passing
  51/51.
- Missing or placeholder `NEXT_PUBLIC_PRIVY_APP_ID` values no longer crash the
  home page; Privy runtime modules and the account panel are loaded only after
  the public app id passes the local guard.
- The Privy app-id guard now accepts current `c...` Privy app ids, and the UI no
  longer externalizes Solana packages into browser `require()` calls.
- Privy login now uses explicit primary order: Telegram, Google, Phantom,
  MetaMask. Wallet-first ordering is disabled and secondary wallets/email are
  behind “More options.”
- FrogX account setup now avoids the user-facing “hot wallet not created”
  wording and surfaces Google/Telegram link startup errors in the profile panel.
- Home swap no longer creates embedded wallets. It signs with a connected
  external Solana wallet such as Phantom first, falls back to an existing FrogX
  wallet, and opens Privy’s Solana-only wallet link modal if no Solana wallet is
  connected.
- Telegram profile linking now uses Privy's callback-backed `useLinkAccount()`
  path and passes Telegram WebApp init data when available for Mini App linking.
- Profile account panel now uses FTX user-facing naming, shows the active swap
  wallet explicitly, and removes embedded-wallet creation from the status grid.
- Visible account, swap-signing, and airdrop-signing prompts now say `FTX`
  instead of `FrogX`.
- Restored embedded Solana wallet setup on `/profile` for the future
  FTX/Ribbot wallet while keeping swap execution external-wallet-first. Wallet
  setup now has success/error/timeout states instead of leaving the button in a
  permanent creating state, and Privy now auto-creates Solana embedded wallets
  for users without wallets.
- Production Privy auth no longer blocks Telegram startup: CSP allows
  `https://auth.privy.io` for the injected Telegram helper script and embedded
  wallet frame, duplicate `loginMethods`/`loginMethodsAndOrder` config was
  removed, login/link errors surface in the account panel, and provider tests
  cover Solana auto-create behavior.
- FTX/TG account creation is now convergent for Ribbot: the Telegram ensure
  endpoint treats only delegated embedded Solana wallets as Ribbot-ready,
  creates an idempotent delegated Ribbot wallet on the same Telegram-linked
  Privy user when the web app created a normal wallet first, and refetches the
  Telegram user if a concurrent web login/link wins the create race. Profile
  copy now says users can start in FTX or Telegram; either surface can create
  the account, and Telegram linking merges web-created accounts into Ribbot
  approvals.
- Deployed the dual FTX/TG account creation flow to production: Worker version
  `fde043bc-c213-4def-8007-d7546455bb1e` and Pages deployment
  `f11b1f3b`. Verified public account readiness, required Worker secret binding
  names, unauthorized 401 on Telegram setup routes, live API contract tests, and
  production browser render of the Telegram-first account login modal.
- Enabled live Ribbot Telegram approval execution in production Worker version
  `5f9ce6ca-810c-4373-8177-335b8e30a093`. Public config now reports
  `bot.tradingEnabled`, `bot.executionEnabled`, and
  `nftPurchases.telegramButtonExecutionEnabled` as true; unauthenticated
  execution still returns 401, and account readiness now requires the Telegram
  execution flags.
- Deployed production Worker version `b2322281-434e-4fae-809e-558a84b7647e`
  with Telegram execution preflight: the API checks the FTX trade wallet SOL
  balance before Privy signing and returns explicit safe blockers for low SOL,
  signing authorization, and marketplace transaction-build failures.
- Deployed production Worker version `f39a9603-30ad-409b-8ae8-8ad1b9d9296a`
  with `nodejs_compat` enabled, fixing the Cloudflare Worker `Buffer is not
  defined` runtime crash seen after Telegram Yes approval reached Privy signing.
- Deployed production Worker version `48c3d247-c660-4cab-b345-77049ff015ba`
  with structured Telegram NFT execution errors. Live no-send Magic Eden floor
  and buy transaction builds succeeded, and remaining execution failures now
  return explicit wallet, Privy, marketplace, chain, or network codes instead
  of only `NFT execution temporarily unavailable`.
- Deployed production Worker version `258321ad-2542-4a98-8470-88329a2d6629`
  with Solana preflight on `POST /api/frogx/nfts/buy-floor`. The route scans
  up to `FROGX_NFT_PREFLIGHT_SCAN_LIMIT=10` floor candidates, skips listings
  whose built Magic Eden transaction rejects during simulation, and returns
  `NO_EXECUTABLE_LISTINGS` instead of handing Ribbot a stale approval card. It
  also maps missing/unfunded buyer accounts to `INSUFFICIENT_SOL`.
  Verified API tests 44/44, Wrangler dry-run/deploy, public floor probe,
  no-send buy-floor fail-closed probe, unauthenticated execute-floor 401, and
  account readiness/secret binding names.
- Deployed production Worker version `6d58b4ba-5a48-4988-866e-5e512133f1aa`
  with stricter Magic Eden MMM handling: the MMM fulfill-sell builder now sends
  `maxPaymentAmount` as a SOL decimal, and all-scanned stale MMM floor pool
  rejections are classified as `STALE_MARKETPLACE_LISTINGS` instead of telling
  Ribbot users to refresh the same quote. The SOL-decimal assumption was later
  superseded by the raw-lamport MMM fix. Verified API tests 45/45 and a live
  no-send buy-floor probe returning the new stale-marketplace blocker.
- Deployed the Privy auth fix to production in Pages deployment `bd1804f4`.
  Verified `frogtrading.exchange/profile` headers, desktop modal resources,
  mobile-width modal resources, and Telegram OAuth popup launch with no
  production browser console/page errors.
- Deployed the swap wallet-selection and Telegram link fixes in Pages deployment
  `dd5a16ff`. Verified production home renders without a create-wallet CTA while
  logged out; Phantom pass-through is covered by focused UI tests.
- Deployed the account panel move in Pages deployment `271b6b68`. Verified
  production home keeps account setup off the swap page, the v1 menu exposes
  `PROFILE`, and `/profile` renders the FTX account panel.
- Deployed the FTX wording/profile cleanup to production in Pages deployment
  `b433c8c7`. Verified `/profile` renders `FTX account` without the old
  `FrogX`/`Privy account`/`Verification wallets` copy, and the Privy modal
  order remains Google, Telegram, Phantom, MetaMask, then More options.
- Deployed the explicit embedded FTX/Ribbot wallet setup fix to production in
  Pages deployment `4acbf483`. Verified logged-out `/profile` renders FTX copy
  without old account wording and the Privy modal order remains Google,
  Telegram, Phantom, MetaMask, then More options.
- Deployed the strict Privy account flow to production in Pages deployment
  `d77a8f10`. Verified `https://frogtrading.exchange/?v=d77a8f10` renders the
  `Account Login` entry point and the Privy modal order is Google, Telegram,
  Phantom, MetaMask, then More options, with no wallet-creation step before
  provider selection.
- Deployed the account-mode work to production: Worker version
  `b6fbb317-c728-4bfb-8152-a8deebfe72c1` and Pages deployment
  `065bff5d-85c8-49dd-9762-eb00a5edc609` on branch `main` serving
  `https://frogtrading.exchange`. Verified HTTP 200 on production URLs, browser
  render of the account panel and login modal order, account config, and Magic
  Eden floor data.
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
- Swap execution now survives Titan REST swap-builder outages: when
  `/api/frogx/swap` returns 404/502, the UI refreshes an executable quote,
  compiles returned Titan instructions and address lookup tables into unsigned
  Solana v0 transaction bytes, and sends those bytes through Privy Solana
  `signTransaction`. Covered by SwapCard fallback tests and direct ALT
  serializer tests.
- Deployed the verified swap-fallback UI to non-production Pages preview
  `https://21bf4fad.frogx-ui.pages.dev`. Verified preview desktop/mobile render,
  production desktop/mobile Privy modal order, production account config, Magic
  Eden floor data, and production Titan quote instructions. Production UI
  promotion remains pending because generated Pages preview origins are not
  Privy allowed origins.
- Titan quote errors now redact WebSocket `auth=` query values and Bearer tokens
  before logging or throwing aggregate quote errors. API tests and Worker dry-run
  pass, and the fix is deployed to production Worker version
  `0f31cdc6-e923-4a1e-a267-dc0feed32d28` from a clean temporary clone. Rotate
  the exposed Titan token before further production quote-error debugging.
- Added `deploy:pages:privy-preview` for a stable non-production Pages branch
  alias at `https://privy-preview.frogx-ui.pages.dev`, avoiding throwaway hash
  origins for Privy reproduction. Deployed and verified the stable preview on
  desktop and iPhone viewport through the Privy provider-selection modal, and
  verified its `/api` proxy returns account config and executable Titan quote
  instructions.
- Replaced the skipped UI e2e placeholder with a live FrogX API contract test.
  `pnpm --filter @frogx/ui run test:e2e` now checks production account safety
  gates, Magic Eden SBF floor data, executable Titan quote payloads, and
  fail-closed REST swap-builder behavior.
- Added `/privy-proof` funded-swap readiness handoff to the stable
  non-production Privy preview. The page now checks SOL fee balance after the
  live API probe and no-send transaction-signing proof, only marks the flow
  ready for a funded swap after all checks pass, and links to the swap page.
  Deployed to `https://privy-preview.frogx-ui.pages.dev` via Pages deployment
  `https://0af48958.frogx-ui.pages.dev`; verified route/root 200 and provider
  order Google, Telegram, Phantom, MetaMask, More options.
- Extended `GET /api/frogx/nfts/floor` with a bounded `limit` query for
  Magic Eden floor sweeps. The response now includes `listings[]`,
  `lowestListing`, and `listingLimit` so Ribbot can estimate requests like
  `sweep 10 frogs` without executing a trade.
- Added wallet-confirmed NFT buy/sweep execution to `/privy-proof`: Telegram
  buy-floor links can build fresh Magic Eden buy transactions through
  `/api/frogx/nfts/buy-floor`, then the connected Solana wallet must explicitly
  sign and send each transaction. Telegram text still never executes trades.
- The NFT buy builder supports current Magic Eden MMM floor listings through
  `/instructions/mmm/sol-fulfill-sell` and prepares sweep transactions
  sequentially to avoid Magic Eden 429 rate limits.
- Deployed the bounded NFT floor scanner to production Worker version
  `967be0e9-9c6d-4051-85fd-101d1760baa8`. `buy-floor` now scans wider
  Magic Eden listing pages with unaggregated buy candidates, skips unsupported
  Tensor sources until a Tensor builder exists, caps expensive marketplace
  transaction builds, and stops retrying MMM pools that fail preflight. Live
  no-send quantity-3 SBF probe returned three M2 transactions with successful
  Solana preflight and estimated total `0.141988 SOL`.
- Deployed lower-floor protection to production Worker version
  `f5732b20-f12d-4b0b-b2a4-0e029dbf8cb6`. `buy-floor` now tries lower
  distinct MMM pools before M2, applies a 1% MMM max-payment cap buffer for
  transaction building, and fails closed with `LOWER_FLOOR_NOT_EXECUTABLE`
  instead of staging a higher-priced fallback while cheaper floor candidates are
  present but fail preflight. Live no-send probe returned no tx, lowest blocked
  price `0.034923111`, with the selected fallback suppressed.
- Corrected the MMM max-payment cap to Magic Eden's buyer-fee envelope and
  deployed Worker version `551f8564-85f5-465a-a867-6b8ba3698da6`. Live no-send
  probes now return executable lower MMM floor quotes: quantity 1 at
  `0.034923111` and quantity 3 at `0.104769333`, all preflight OK, while still
  skipping the stale `0.032007782` MMM wall. This buyer-fee-envelope approach
  was later superseded by the raw-lamport MMM sell-price fix.
- Deployed Worker version `bd883261-b106-4e94-b1fe-dade34ddd46a` with
  sequential Telegram sweep execution. `execute-floor` now builds, sends, and
  confirms one floor buy before refreshing the next, returns `confirmedCount`
  and partial sweep details, and stops instead of racing stale prebuilt MMM
  transactions. Verified API tests 50/50 plus production read-only config,
  floor, and unauthenticated execute guard checks.
