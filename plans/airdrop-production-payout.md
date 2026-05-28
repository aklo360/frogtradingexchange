# DAEMON Airdrop Production Payout Readiness

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `~/.codex/PLANS.md`.

## Purpose / Big Picture

The airdrop already lets a Solana wallet prove it holds enough Business Frogs and bind an Ethereum payout address. This work adds the missing production payout layer: after claims are finalized in first-come-first-served order, the backend can automatically send exact `$DAEMON` ERC20 amounts from the configured Ethereum escrow wallet, record transaction hashes, and keep the system disabled until the token contract and escrow signer are ready. The observable outcome is an admin-only payout endpoint and scheduled autopayout path that refuse to run early, then send winner payments once enabled.

## Progress

- [x] (2026-05-28) Confirmed current airdrop backend collects, checks, finalizes, and exports claims, but does not send ERC20 payouts.
- [x] (2026-05-28) Confirmed production config uses the final `$DAEMON` contract address and final escrow address.
- [x] (2026-05-28) Add guarded ERC20 payout execution and transaction-hash persistence.
- [x] (2026-05-28) Add production-safe env vars and documentation without committing or printing secrets.
- [x] (2026-05-28) Run backend typecheck and unit tests.
- [x] (2026-05-28) Run Wrangler dry-run packaging/config validation.
- [x] (2026-05-28) Set available production secrets without exposing values: `AIRDROP_ADMIN_TOKEN` and `AIRDROP_ETH_RPC_URL`.
- [x] (2026-05-28) Change prize logic from random/VRF quarter steps to deterministic tiers: 1-9 frogs get `0.10` `$DAEMON`, 10+ frogs get `1.00` `$DAEMON`, FCFS until pool exhaustion.
- [ ] Set `AIRDROP_ESCROW_PRIVATE_KEY` after AKLO provides the escrow signer or chooses a Safe/relayer path.
- [ ] Leave final live claim and payout switches off until token bytecode exists and the escrow signer/gas are confirmed.

## Surprises & Discoveries

- Observation: The user-provided final `$DAEMON` address is configured in code, but earlier raw Ethereum JSON-RPC checks returned no contract code at that address.
  Evidence: `eth_getCode` returned `0x`, so payout execution must check bytecode before sending.

## Decision Log

- Decision: Keep `AIRDROP_ENABLED=false` and add a separate `AIRDROP_PAYOUT_ENABLED=false` production switch until launch.
  Rationale: Claims and sends are irreversible user-facing actions. The backend should be deployable now without opening claims or sending transfers early.
  Date/Author: 2026-05-28 / Codex

- Decision: Implement automatic sends from an escrow EOA private key only as a disabled, secret-backed production path.
  Rationale: The provided escrow address alone cannot sign transactions. A Worker can only send automatically if it has a platform secret for the EOA private key, or if a separate Safe/relayer integration is configured later.
  Date/Author: 2026-05-28 / Codex

## Outcomes & Retrospective

Backend payout implementation is complete locally. It is not live-enabled: the production defaults keep claims and payouts disabled, and the payout path refuses to run unless payout switches and required signer/RPC secrets exist.

Available production secrets were set without printing values. `AIRDROP_ESCROW_PRIVATE_KEY` remains intentionally unset because it must be the private key for the configured escrow address or replaced by a Safe/relayer integration.

Prize logic is now deterministic and does not need VRF randomness: 1-9 frogs receive `0.10` `$DAEMON`, 10+ frogs receive `1.00` `$DAEMON`, and later claims are marked not selected once the 10 `$DAEMON` pool is exhausted.

## Context and Orientation

This repository is `/Users/aklo/projects/ftx`. The backend lives in `apps/api` as a Cloudflare Worker. The airdrop coordinator is `apps/api/src/airdrop.ts`; it uses a Durable Object, which is a small Cloudflare-hosted stateful object with SQLite storage. Public routes are wired in `apps/api/src/index.ts`. Worker environment variable names are typed in `apps/api/src/env.ts` and non-secret defaults are in `apps/api/wrangler.toml`.

The existing airdrop stores claims, assigns deterministic tiered `$DAEMON` prizes during finalization, and exports payout rows. `$DAEMON` is an ERC20 token on Ethereum mainnet. Sending it automatically requires an Ethereum RPC URL and a private key for the configured escrow wallet, both stored as Cloudflare Worker secrets. Gas means ETH in the escrow wallet to pay Ethereum transaction fees.

## Plan of Work

Add payout columns to the Durable Object claims table for transaction hash, payout status, payout error, attempted time, and paid time. Existing Durable Object tables must be upgraded additively with `ALTER TABLE` calls that safely ignore columns that already exist.

Add a payout endpoint inside `AirdropCoordinator` that only selects finalized `won` claims with positive amounts and no existing payout transaction hash. Before any send, it must verify `AIRDROP_PAYOUT_ENABLED=true`, `AIRDROP_ETH_RPC_URL` exists, `AIRDROP_ESCROW_PRIVATE_KEY` exists, the private key address matches `AIRDROP_ESCROW_ADDRESS`, the `$DAEMON` contract has bytecode at `AIRDROP_DAEMON_TOKEN_ADDRESS`, the escrow has enough `$DAEMON`, and the escrow has ETH for gas. A dry-run mode should perform the checks without sending.

Wire admin route `POST /api/frogx/airdrop/payout` and scheduled autopayout that runs only when `AIRDROP_AUTO_PAYOUT_ENABLED=true`. Keep both production switches false by default so the code can deploy before token launch.

Update `.env.example`, `AGENTS.md`, `CHANGELOG.md`, `.codex/memories.md`, and `.codex/sys_arch.md` with the new production payout state. Run backend typecheck and tests.

## Concrete Steps

From `/Users/aklo/projects/ftx`, edit:

- `apps/api/src/airdrop.ts`
- `apps/api/src/index.ts`
- `apps/api/src/env.ts`
- `apps/api/wrangler.toml`
- `.env.example`
- project docs/context files

Then run:

    apps/ui/node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit
    pnpm --filter @frogx/api run test

After code validation, production secret setup should use Cloudflare Worker secrets and never print values:

    wrangler secret put AIRDROP_ADMIN_TOKEN
    wrangler secret put AIRDROP_ETH_RPC_URL
    wrangler secret put AIRDROP_ESCROW_PRIVATE_KEY

## Validation and Acceptance

The code is accepted when typecheck passes, unit tests pass, production config shows `AIRDROP_MIN_FROGS="1"` and `AIRDROP_FULL_PRIZE_MIN_FROGS="10"`, payout is disabled by default, and the payout endpoint refuses to run without `AIRDROP_PAYOUT_ENABLED=true`. A dry run should return a clear contract-not-live or missing-secret error instead of sending anything when the token address has no bytecode or signer secrets are absent.

Final launch readiness requires these external facts to be true: the `$DAEMON` token contract exists on Ethereum mainnet at `0x43298327b0249caF5A4942C6951F5Ac6AD7297A0`, the escrow wallet `0xC853Fc4dE86fC8868Fa89FC3B207d4592Db19e46` holds at least 10 `$DAEMON`, the escrow holds enough ETH gas, and Cloudflare has the payout signer secret.

## Idempotence and Recovery

Adding columns is idempotent because repeated `ALTER TABLE` failures for existing columns are ignored. Payout sends are idempotent per claim because a claim with `payout_tx_hash` set is never selected again. If a transfer attempt fails before returning a transaction hash, the claim remains retryable and records the sanitized error. If a transfer returns a hash, the hash is persisted before moving on.

## Artifacts and Notes

No production secret values belong in this plan, terminal output, repo files, or chat.

Validation run:

    apps/ui/node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit
    pnpm --filter @frogx/api run test
    ✓ src/airdrop.test.ts (9 tests)

## Interfaces and Dependencies

Use `viem` for Ethereum RPC and signing because it is already installed in `apps/api`. The new exported backend interfaces should be:

- `postAirdropPayout(request: Request, env: Env): Promise<Response>`
- `runAirdropPayout(env: Env): Promise<void>`

The Worker env type should include:

- `AIRDROP_PAYOUT_ENABLED?: string`
- `AIRDROP_AUTO_PAYOUT_ENABLED?: string`
- `AIRDROP_ETH_RPC_URL?: string`
- `AIRDROP_ESCROW_PRIVATE_KEY?: string`
- `AIRDROP_PAYOUT_BATCH_SIZE?: string`
- `AIRDROP_PAYOUT_WAIT_FOR_RECEIPTS?: string`
