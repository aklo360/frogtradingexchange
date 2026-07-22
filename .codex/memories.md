# Memories [keep under 2200 chars]

FTX: `/Users/aklo/projects/solanaBFS/ftx`; remote
`git@github.com:aklo360/frogtradingexchange.git`. Confirm target before deploy.
`frogtrading.exchange` is prod; `hyperribbit.xyz`/`www` 301 to it via
CF redirect preserving path/query. Preview:
`https://privy-preview.frogx-ui.pages.dev`; Ribbot must not open it.
Login order: TG, Google, Phantom, MetaMask.

Swap: prod returns account config, Magic Eden SBF floor, and executable Titan
quote instructions. Titan REST `/frogx/swap` 404s -> API 502; UI falls back to
`/quotes`, compiles instructions/ALTs, and signs with Privy.

Security: `apps/api/src/titan.ts` redacts `auth=` and Bearer tokens.

Account APIs: `/account/config`, `/account/intents`, `/nfts/floor`,
`/nfts/buy-floor`, `/account/telegram`, `/nfts/execute-floor`. TG text never
buys. Web + TG are equal surfaces keyed by `telegram_user_id`; only the
delegated Ribbot wallet trades. External wallets verify only.
Prod Worker `eea8c1c1` has live TG approval execution, NFT approval buttons,
unauth execute 401, and `nodejs_compat` for Privy signing. `buy-floor` scans
unaggregated listings, sorts by price, preflights ME txs before Ribbot cards,
skips Tensor until a builder exists, retries transient ME 429 builds with
bounded backoff, scans up to 50 same-price MMM floor mints before marking a
stale pool, skips MMM pools with >10% buyer-side royalty. Must never
stage a higher quote while cheaper visible frogs exist. MMM fulfill-sell
`maxPaymentAmount` must be raw lamports, not SOL decimal; compute it from spot
price, curve delta, and LP fee when pool fields exist. Live no-submit probes
return preflight-OK 0.032007782 MMM floor quotes for qty 1/2/10.
`execute-floor` sweeps build/send/confirm one frog at a time, waits
2.5s between ME builds in prod (`FROGX_NFT_SWEEP_ITEM_DELAY_MS`), skips mints already stale/submitted earlier in the same sweep, and returns `confirmedCount`
plus partial/pending details. API tests pass 59/59. Bot token is on Mini;
never print it.

Tensor key name `TENSOR_API_KEY` exists as a write-only `frogx-api` Worker
secret. Validation command: `pnpm --filter @frogx/api run tensor:check`; never
print the key.
