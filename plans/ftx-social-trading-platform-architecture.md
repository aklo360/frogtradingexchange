# FTX Social Trading Platform Architecture

This plan follows `~/.codex/PLANS.md`. It is the architecture direction for turning
Frog Trading Exchange into a full-featured social trading app with user profiles
and points, on par with the strongest Solana trading platforms. It is a living
document; update the Progress and Decision Log sections as phases execute.

## Purpose / Big Picture

FTX today is a Titan-powered swap with a buyback/burn flywheel, a Privy identity
shared between web and Telegram (Ribbot), a gated trading engine in the Worker,
and verified Business Frog holdings via DAS. The goal is to grow that into the
kind of product Jupiter, Drift, Tensor, Axiom, and Photon represent: persistent
user profiles, a points/season economy, shareable PNL, referrals, and a social
graph — without ever again depending on a third-party social vendor (Tapestry
was removed after its API died) and without touching the safety model of the
trading engine.

## Architecture Principles

1. Privy is the identity layer, not the database. The Privy DID is the canonical
   user ID everywhere (web, Ribbot, Worker). Linked accounts give us Telegram,
   wallets, and email for free. Privy custom metadata holds only small
   self-describing identity fields (username, pfp mint/image, short bio) so a
   user's own profile renders instantly client-side with zero API calls.
   Anything queryable across users lives in our own store.
2. Own every fill. The Worker already builds and executes swaps (web) and bot
   trades (Ribbot), and already has a bounded, no-resend on-chain reconciliation
   pattern. Record every fill in our own ledger keyed by transaction signature.
   Fills are the substrate for trade logs, PNL cards, volume points,
   leaderboards, and referral fee-share. Never derive money-adjacent numbers
   from a third party.
3. Points are an event-sourced ledger, never a mutable counter. Append-only
   `points_events` rows with idempotency keys tied to verifiable facts
   (tx signature, day-key for holding bonuses, referral edge). Balances and
   leaderboards are materialized views. This is how serious platforms avoid
   points drift, double-credit exploits, and unexplainable balances.
4. Stay on Cloudflare (the 90/10 rule). Durable Objects remain the per-account
   strongly consistent store for trading state (they already are). Add D1 as the
   cross-user query layer (profiles index, points events, follows, referrals,
   fills index), KV/Cache API for hot public reads, R2 only if media appears.
   No new vendors.
5. Social/points layers are read-only observers of trading. They consume fill
   events; they can never build, sign, gate, or retry an execution. The existing
   live-execution gates and Privy signing boundary are untouched.
6. House rule carried forward: no fabricated metrics. Every number on a profile
   traces to a verified fill, a verified holding, or an explicit user action.

## Target Component Map

    Client (Next.js, static)          Ribbot (Telegram)
        |  Privy access token             |  bot token (existing)
        v                                 v
    frogx-api Worker  — single gateway, route modules:
        /swap /quotes ...   existing trading (unchanged)
        /profile            Privy JWT verify -> custom metadata + D1 mirror
        /points             read balances/leaderboard (D1 materialized)
        /social             follows, public profiles, activity (D1)
        /referral           codes + fee-share accounting (D1 + fills)
        internal: fill recorder + reconciler -> D1 fills, points emitter
    Durable Objects: per-account trading state (existing)
    D1: profiles, fills, points_events, points_balances, follows, referrals
    Privy: users, linked accounts, embedded wallets, custom metadata

Auth middleware: verify Privy access tokens in the Worker via JWKS (jose) —
the app secret already lives in the Worker from the bot wallet work. Public
reads (profiles, leaderboard) are unauthenticated but cached and rate-limited.

## Points Design (Season 1 sketch)

- Sources: swap volume through FTX (per verified fill, fee actually collected),
  frog-holding daily multiplier (verified via DAS, the same service as the
  vault), burn-event bonuses (ties points to the flywheel), referrals (both
  sides), quest-style one-offs (first swap, first frog, profile completed).
- Every event: `(did, season, source, amount, idempotency_key, evidence)` where
  evidence is a tx signature or day-key. Unique index on idempotency_key.
- Anti-gaming: daily caps per source, min-fee thresholds, wash-trade heuristics
  later; points never convert to anything on-chain without an explicit,
  separately approved program.
- Seasons reset leaderboards, not history. The `/leaderboard` route stub in the
  UI becomes real, reading a materialized D1 view.

## Phases

- [x] Phase 1 — Own the profile surface (shipped 2026-07-15): Tapestry removed;
      profile renders FTX-owned data only; PFP selection persists per wallet in
      browser storage as interim.
- [ ] Phase 2 — Privy as user DB: Worker `/profile` route with Privy JWT
      verification; store username/bio/pfp in Privy custom metadata; mirror to
      D1 for public lookup; web + Ribbot read/write the same identity. Removes
      the browser-storage interim.
- [ ] Phase 3 — Fills ledger: record web swap fills at build/confirm time and
      Ribbot fills (already recorded per-account) into D1 keyed by signature;
      bounded reconciler reuse; profile trade log + shareable PNL card.
- [ ] Phase 4 — Points Season 1: points_events + materialized balances,
      leaderboard page live, frog-holding multiplier, burn bonuses.
- [ ] Phase 5 — Social + referrals: follows, public profile pages by username,
      activity feed derived from fills, referral codes unified with Ribbot's
      existing scaffolding, fee-share accounting from the ledger.

Each phase is independently shippable and additive. Phases 2+ require frogx-api
Worker deploys, which stay approval-gated per project rules.

## Decision Log

- Decision: Remove Tapestry entirely rather than wait out the outage.
  Rationale: vendor API TLS-dead on prod and dev hosts for days, no status
  page, team publicly pivoted to a consumer game; social data is core product
  surface and must be owned. Date: 2026-07-15.
- Decision: Privy = identity + small self-describing metadata; D1 = queryable
  app data. Rationale: Privy metadata is not queryable across users (no
  leaderboards/social graph) and is size-limited; D1 keeps the stack
  Cloudflare-native. Date: 2026-07-15.
- Decision: Points must be event-sourced with verifiable evidence and
  idempotency keys. Rationale: prevents drift/exploits; matches how mature
  platforms (Drift/Tensor seasons) operate. Date: 2026-07-15.

## Progress

- [x] (2026-07-15) Phase 1 shipped to production (`frogx-ui`).
- [ ] Phase 2 design: Privy JWKS verification in Workers, metadata size audit.

## Outcomes & Retrospective

- Phase 1: profile no longer depends on any third-party social API; UI build is
  fully static again. Lesson: social surface belongs on owned rails.
