# FrogTradingExchange — PRD

## 0) Context & environments

* **Titan demo** = mainnet, limited resources; used for integration & early updates.
* **Titan prod** = mainnet, higher capacity; will require a new token + endpoint.
* **Auth**: Bearer JWT in `Authorization` header.
* **WS**: `wss://<region>/api/v1/ws` (quotes stream).
* **REST**: `https://<region>/api/v1/*` (swap build/tx, info).
* **Regions** (demo): `us1`, `de1`, `jp1` (strings provided).

Environment matrix (config-only):

* `TITAN_BASE_URL` (demo/prod), `TITAN_WS_URL`, `TITAN_TOKEN`
* Region preference & failover order.

---

## 1) Objectives

* Deliver a **fast, single-screen Solana swap** with a **SNES/Super Nintendo frog** skin that leverages Titan’s best-route streaming quotes.
* Phase 2 adds **wallet connection + user profile (“Swamp”)**, showing frog holdings, swap history, points, and badges.

---

## 2) Phase 1 — Swap MVP

### 2.1 UX (single screen)

* **Controls**: From/To token selectors, Amount In (ExactIn), Slippage %, Priority fee preset.
* **Live quote**: best route, est. out, price impact, route path (routers list), “Simulated ✓/✗”.
* **CTA**: Swap (disabled if quote stale or wallet not connected).
* **Theme**: SNES pixel font, Solana purple `#9945FF`, green `#14F195`, CRT scanline overlay.

### 2.2 Frontend (Next.js + React)

* **Components**

  * `SwapCard`: form inputs, live quote panel, CTA.
  * `TokenPicker`: search by symbol/mint; shows balance when wallet connected (Phase 2).
  * `QuoteTicker`: renders incoming quote snapshots, chooses current executable.
  * `Snackbar/Toasts`: success/failure with tx sig.
* **State**

  * Pair (`inMint`, `outMint`), `amountIn`, `slippageBps`, `priorityFee`.
  * `quoteState`: `{status, updatedAt, outAmount, priceImpactBps, routers, executable, routeId}`.
  * `connectionState`: WS status, current region, failovers attempted.
* **Quote freshness rule**

  * “Executable” = simulated OK + not older than N seconds (config, e.g., 3s).
  * Disable Swap if not executable.

### 2.3 Server (Next.js API routes; token stays server-side)

* **/api/frogx/info [GET]**

  * Proxies Titan `GetInfo` (network, supported routers, min/max constraints).
* **/api/frogx/quotes [POST → SSE or WS-bridge]**

  * Body: `{ inMint, outMint, amountIn, slippageBps, priorityFee }`
  * Opens server→Titan WS (`NewSwapQuoteStream`), relays updates as SSE to client.
  * Handles region failover: `us1 → de1 → jp1` with capped retries.
  * Sanitizes/normalizes output for UI.
* **/api/frogx/swap [POST]**

  * Body: `{ userPubkey, inMint, outMint, amountIn, slippageBps, priorityFee }`
  * Calls Titan swap build endpoint.
  * Returns either `{ mode:"tx_base64", txBase64, meta }` **or** `{ mode:"route", route, meta }`.
  * Enforces server-side validation (mint format, amounts >0, slippage bounds).

### 2.4 Wallet interaction (Phase 1 minimal)

* Require wallet to **sign/send** built transaction.
* Support Phantom/Backpack via wallet-adapter (lightweight modal).
* If `mode: tx_base64`: deserialize → `signTransaction` → `sendRawTransaction`.
* If `mode: route`: build locally (helper util) → sign → send. (Keep abstraction to swap in Titan’s evolving API.)

### 2.5 Token metadata

* Token list service (coingecko/solana.tokenlist JSON or internal curated list).
* On first render, load list + per-mint decimals; fallback to on-chain decimals query.
* Cache in-memory + revalidate on interval.

### 2.6 Error taxonomy & handling

* **Auth** (401/403): show “Service unavailable” and log (no token leakage).
* **WS**: network, protocol, backoff & region rotation; surface to UI as “Reconnecting…”.
* **Build**: invalid params, insufficient balance/ATA, slippage exceeded, blockhash expired.
* **Send**: user reject, RPC errors, simulation fail (show logs if available).

### 2.7 Security & compliance

* Token strictly **server-only**; never shipped to client.
* Rate-limit `/api/frogx/*` (IP+fingerprint).
* Validate inputs; clamp slippage & priority fee to sane ranges.
* No PII. Only wallet pubkeys/tx sigs. Respect CSP, no inline eval.

### 2.8 Performance

* Quotes: binary WS from Titan → server parses → minimal JSON SSE to client.
* UI re-render throttle (~200ms) to avoid flicker on rapid updates.
* Prewarm RPC connection; cache `GetRecentBlockhash` (or use `getLatestBlockhash` on send).

### 2.9 Telemetry (internal)

* Events: `quote_connected`, `quote_update`, `swap_click`, `tx_submitted`, `tx_confirmed`, `tx_failed`.
* Metrics: time-to-first-quote, quote staleness, swap success rate, median confirmation time.

---

## 3) Phase 2 — Wallet Connect, Profiles (“Swamp”), Points & Badges

### 3.1 Goals

* Persist a **user profile** keyed by wallet.
* Display **frog holdings** (“your Swamp”) and swap history.
* Introduce **points** and **badges** for engagement.

### 3.2 Auth & identity

* **Wallet-first auth** (no email required).
* Flow:

  1. Connect wallet (wallet-adapter).
  2. Request nonce from `/api/auth/nonce`.
  3. User signs `Sign-In With Solana` message.
  4. Send signature → `/api/auth/verify` → issue **short-lived session JWT** (HttpOnly cookie).
* Optional: allow multiple wallets to link to one profile (advanced).

### 3.3 Data model (storage: Postgres/Neon or Supabase)

* **users**

  * `id (uuid)`, `primary_wallet (text)`, `username (text, unique?)`, `created_at`
  * `avatar_url`, `bio` (optional)
* **wallets**

  * `id`, `user_id`, `pubkey (text, unique)`, `created_at`
* **holdings_snapshots**

  * `id`, `user_id`, `ts`, `nft_count`, `tokens (jsonb)` (per-mint balances)
* **frog_assets**

  * `mint`, `collection` (verified collection address), `name`, `image_uri`, `traits (jsonb)`
* **swaps**

  * `id`, `user_id`, `tx_sig`, `ts`, `inMint`, `outMint`, `amountIn`, `amountOut`, `priceImpactBps`, `routers (jsonb)`
* **points_ledger**

  * `id`, `user_id`, `ts`, `event_type`, `amount`, `meta (jsonb)`
* **badges**

  * `id`, `slug`, `name`, `description`, `criteria (jsonb)`
* **user_badges**

  * `id`, `user_id`, `badge_id`, `awarded_ts`, `meta (jsonb)`

### 3.4 Holdings (“Swamp”) pipeline

* **Source**: Helius DAS, SimpleHash, or on-chain via RPC + Metaplex standard.
* **Scope**: Collection = *Solana Business Frogs* (verified collection address).
* **Process**

  * On profile load or on schedule: fetch NFTs by owner → filter by collection → store/update `frog_assets` and `holdings_snapshots`.
  * Also fetch SPL token balances (for featured mints).
* **UI**

  * Grid of frog NFTs with rarity/traits, totals, and quick-links to marketplaces.
  * Token balances summary.

### 3.5 Points system (config-driven)

* **Earning events (examples)**

  * Connect wallet (one-time): +50
  * Complete a swap via FTX (FrogTradingExchange): +10 per swap
  * Volume milestones (per day/week thresholds): +X
  * “Swamp” size milestones (own ≥ N frogs): +Y
  * Daily check-in streaks: +1 → +N
* **Anti-abuse**

  * Cooldowns; per-wallet rate limits; exclude self-swaps between identical mints; volume counted post-confirmation; cap points per window.

### 3.6 Badges (examples)

* **“Tadpole”**: first swap.
* **“Bog Baron”**: 10 swaps.
* **“Lily Pad Tycoon”**: ≥ 10 frogs held.
* **“Marsh Whale”**: ≥ 100 SOL volume.
* **“Green Flash”**: 3 swaps in 24h.
* Criteria stored in `badges.criteria` (JSON rules), evaluated by a rules engine (simple server functions/cron).

### 3.7 Profile UI

* **Header**: PFP (generated frog-style if none), username, linked wallets.
* **Tabs**

  * **Swamp**: NFT grid, traits filters, counts.
  * **Activity**: swap history with tx sig links.
  * **Points**: total, recent earns, leaderboards (global & weekly).
  * **Badges**: earned vs locked, hover criteria.
* **Edit profile**: set username, avatar (IPFS or upload), short bio.

### 3.8 Services & APIs (server)

* **/api/auth/nonce [GET]**, **/api/auth/verify [POST]**
* **/api/profile [GET/PUT]** (JWT required)
* **/api/holdings [GET]** (fetch + hydrate; cache for N mins)
* **/api/swaps [GET]** (by user; pagination)
* **/api/points/earn [POST]** (internal hooks on swap confirm)
* **/api/badges [GET]**, **/api/badges/claim [POST]** (if any manual claims)

### 3.9 Jobs & schedulers

* **Swap confirmation listener**: subscribes to tx sigs from Phase 1, writes to `swaps`, triggers points/badges.
* **Holdings refresher**: on-demand and periodic (e.g., 6h cron) for active users.
* **Leaderboard rollups**: daily/weekly aggregates for quick reads.

### 3.10 Security & privacy

* SIWS (Sign-In With Solana); session JWT in HttpOnly cookie.
* CSRF protection on state-changing endpoints.
* Per-user RBAC minimal (self-access only).
* Log redaction; never store private keys.

---

## 4) Shared concerns

### 4.1 Validation

* **Mints**: base58, 32 bytes.
* **Amounts**: positive, decimal → integer in base units by token decimals.
* **Slippage**: clamp to `[5, 500] bps` defaults; override only with explicit user consent.
* **Priority fee**: sensible presets; cap maximum.

### 4.2 Observability

* Structured logs with correlation IDs (quote stream ↔ swap build ↔ tx).
* Error codes + user-safe messages.
* Metrics to dashboard: quote latency, swap success, WS reconnects, API error rates.

### 4.3 Dependencies

* Next.js (App Router), React.
* `@solana/web3.js`, `@solana/wallet-adapter-*`.
* DB: Postgres (Supabase/Neon).
* Holdings: Helius DAS (preferred) or SimpleHash (fallback).
* MessagePack decoder (server) for Titan WS if required.

### 4.4 Theming (SNES)

* Fonts: Press Start 2P or VT323.
* 9-slice “cartridge” card, chunky buttons, CRT overlay.
* Sound hooks (optional, gated by user setting).

---

## 5) Acceptance criteria

### Phase 1

* Connect wallet, pick tokens, enter amount, see **live updating quote** within 1s of typing.
* Swap succeeds with a **ready-to-sign tx** or locally built tx path.
* Quote staleness guard prevents swapping against old quotes.
* Region failover works (observably rotates after WS failure).

### Phase 2

* SIWS auth establishes a profile session.
* “Swamp” shows correct frog NFTs for connected wallet(s).
* Points accrue on qualifying swaps; badges award on thresholds.
* Leaderboard renders weekly totals.

---

## 6) Risks & mitigations

* **API drift** (demo gets updates first): pin an **interface layer**; feature flag new fields; keep backward-compatible parsing.
* **Quote/tx mismatch** due to slot drift: enforce time window; re-validate at send; auto-refresh if expired.
* **Wallet UX friction**: keep number of signature prompts minimal; preflight simulation.
* **Points abuse**: cooldowns, distinct tx checks, per-wallet/day caps, dedupe by tx sig.

---

## 7) Open questions (to close with Titan / internal)

1. **Swap build**: guaranteed **base64 tx** return path? When does it return route-only?
2. **Quote message schema**: final field names/types; simulation success flag; routeId semantics.
3. **Recommended WS protocol headers** (subprotocol/compression); MessagePack details.
4. **Prod endpoints** list + auth token issuance flow & expiry/refresh.
5. **Routing metadata**: can we safely display router names/weights?
6. **Rate limits** per token/region for demo vs prod.
7. **Holdings**: Confirm verified collection address(es) for Solana Business Frogs to filter NFTs.

---