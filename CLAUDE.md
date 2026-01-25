# CLAUDE.md — Frog Trading Exchange Codebase Guide

> Quick reference for understanding and working with this codebase.

## Project Overview

**Frog Trading Exchange (FrogX)** is a Titan-powered Solana DEX swap interface built for the Solana Business Frogs community. Key differentiator: 100% of platform fees are used to buy back and burn FROG NFTs.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        FROG TRADING EXCHANGE                            │
├─────────────────────────────────────────────────────────────────────────┤
│  Frontend (Next.js 15)  ──→  API Worker  ──→  Titan Exchange            │
│         │                       │                   │                   │
│         └── Wallet Adapter      ├── Buyback ←── Magic Eden API          │
│                                 └── Solana RPC                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Commands

```bash
pnpm install          # Install all dependencies
pnpm dev              # Start dev (Next.js :3000 + Worker :8787)
pnpm build            # Build all apps
pnpm deploy:prod      # Deploy to Cloudflare (Worker + Pages)
```

---

## Monorepo Structure

```
ftx/
├── apps/
│   ├── api/                    # Cloudflare Worker backend
│   │   ├── src/
│   │   │   ├── index.ts        # Main router + scheduled handler
│   │   │   ├── routes.ts       # REST handlers (/info, /quotes, /swap)
│   │   │   ├── titan.ts        # Titan WebSocket client (msgpack protocol)
│   │   │   ├── buyback.ts      # Automated NFT buyback/burn logic
│   │   │   ├── fees.ts         # Platform fee configuration + ATA derivation
│   │   │   └── env.ts          # Environment validation
│   │   └── wrangler.toml       # Cloudflare Worker config
│   │
│   └── ui/                     # Next.js 15 frontend
│       ├── src/
│       │   ├── app/
│       │   │   ├── page.tsx              # Main swap interface
│       │   │   ├── layout.tsx            # Root layout + fonts
│       │   │   ├── leaderboard/          # XP leaderboard
│       │   │   ├── profile/              # User profiles + NFT viewer
│       │   │   └── api/tapestry/         # Edge API for social profiles
│       │   ├── components/
│       │   │   ├── SwapCard.tsx          # Core swap UI (770 lines)
│       │   │   ├── TokenSelector.tsx     # Token picker modal
│       │   │   ├── Ticker.tsx            # Price ticker marquee
│       │   │   └── BuybackProgress.tsx   # Buyback status widget
│       │   ├── lib/
│       │   │   ├── tokens.ts             # Default token list
│       │   │   └── hooks/useQuotePreview.ts
│       │   ├── providers/
│       │   │   ├── SolanaProvider.tsx    # Wallet adapter context
│       │   │   └── AudioProvider.tsx     # Background music state
│       │   └── server/tapestry/          # Tapestry API client
│       ├── worker-entry.mjs    # Cloudflare Pages proxy
│       └── next.config.ts      # Dev rewrites + env loading
│
├── packages/shared/            # (placeholder for shared utilities)
├── scripts/
│   ├── dev-worker.mjs          # Local dev harness
│   └── sync-env.sh             # Environment sync helper
├── .env.example                # Environment template
└── pnpm-workspace.yaml
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER BROWSER                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│   │   SwapCard   │    │   Profile    │    │ Leaderboard  │                  │
│   │              │    │              │    │              │                  │
│   │ Token Select │    │ NFT Viewer   │    │ XP Rankings  │                  │
│   │ Quote Stream │    │ Followers    │    │ Mock Data    │                  │
│   │ Tx Submit    │    │ Activity     │    │              │                  │
│   └──────┬───────┘    └──────┬───────┘    └──────────────┘                  │
│          │                   │                                               │
│          └─────────┬─────────┘                                               │
│                    ▼                                                         │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │                    CLOUDFLARE PAGES WORKER                          │    │
│   │                    (worker-entry.mjs)                               │    │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ │    │
│   │  │ /api/* ────────→ frogx-api  │  │ /rpc ──→ Private Solana RPC │ │    │
│   │  └─────────────┘  └─────────────┘  └─────────────────────────────┘ │    │
│   └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         CLOUDFLARE WORKER (frogx-api)                         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐    │
│   │                           ENDPOINTS                                  │    │
│   ├─────────────────────────────────────────────────────────────────────┤    │
│   │  GET  /api/frogx/info         → System info                         │    │
│   │  GET  /api/frogx/buyback      → Buyback status                      │    │
│   │  POST /api/frogx/buyback/execute → Trigger buyback (auth required)  │    │
│   │  POST /api/frogx/buyback/burn    → Trigger burn (auth required)     │    │
│   │  POST /api/frogx/quotes       → Get swap quotes                     │    │
│   │  POST /api/frogx/swap         → Build swap transaction              │    │
│   │  CRON */5 * * * *            → Scheduled buyback check              │    │
│   └─────────────────────────────────────────────────────────────────────┘    │
│                                                                               │
│   ┌───────────────┐   ┌───────────────┐   ┌───────────────────────────┐      │
│   │   titan.ts    │   │  buyback.ts   │   │        fees.ts            │      │
│   │               │   │               │   │                           │      │
│   │ WebSocket     │   │ Floor Price   │   │ Fee Config (100 bps)      │      │
│   │ msgpack proto │   │ NFT Purchase  │   │ ATA Derivation            │      │
│   │ Multi-region  │   │ Burn via API  │   │ SOL/USDC/USDT accounts    │      │
│   └───────┬───────┘   └───────┬───────┘   └───────────────────────────┘      │
│           │                   │                                               │
└───────────┼───────────────────┼───────────────────────────────────────────────┘
            │                   │
            ▼                   ▼
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────────┐
│  TITAN EXCHANGE   │   │    MAGIC EDEN     │   │    SOL INCINERATOR    │
│                   │   │                   │   │                       │
│  wss://titan.ag   │   │ Floor prices      │   │  Burn NFTs            │
│  Quote streaming  │   │ Listings          │   │  POST /burn           │
│  Swap building    │   │ Buy instructions  │   │                       │
└───────────────────┘   └───────────────────┘   └───────────────────────┘
```

---

## Data Flow: Swap Execution

```
1. User enters amount in SwapCard
         │
         ▼
2. useQuotePreview polls POST /api/frogx/quotes
         │
         ▼
3. Worker opens Titan WebSocket
   ├─ Sends NewSwapQuoteStream (msgpack)
   ├─ Receives SwapQuotes response
   └─ Transforms to JSON, picks best route
         │
         ▼
4. Frontend displays quote + price impact
         │
         ▼
5. User clicks SWAP → POST /api/frogx/swap
         │
         ▼
6. Worker calls Titan HTTP API → returns tx_base64
         │
         ▼
7. Wallet signs transaction
         │
         ▼
8. Frontend submits via sendTransaction()
   └─ Uses /rpc proxy → private Solana RPC
         │
         ▼
9. Blockchain executes swap + fee transfer
```

---

## Technology Stack

| Layer      | Technology                    | Purpose                           |
|------------|-------------------------------|-----------------------------------|
| Frontend   | Next.js 15 (App Router)       | React framework                   |
| Frontend   | React 19                      | UI library                        |
| Frontend   | CSS Modules                   | Scoped styling (retro pixel art)  |
| Frontend   | @solana/wallet-adapter        | Phantom/Solflare integration      |
| Backend    | Cloudflare Workers            | Serverless API                    |
| Backend    | Wrangler                      | Worker tooling                    |
| Protocol   | msgpackr                      | Titan WebSocket encoding          |
| Protocol   | @solana/web3.js               | Blockchain interaction            |
| Hosting    | Cloudflare Pages              | Frontend deployment               |
| Package    | pnpm workspaces               | Monorepo management               |

---

## Key Files Reference

### Backend (apps/api/src/)

| File           | Lines | Purpose                                      |
|----------------|-------|----------------------------------------------|
| `index.ts`     | ~200  | Main router, CORS, scheduled handler         |
| `titan.ts`     | ~714  | Titan WebSocket client, quote normalization  |
| `routes.ts`    | ~300  | REST handlers, request validation            |
| `buyback.ts`   | ~200  | NFT buyback/burn automation                  |
| `fees.ts`      | ~206  | Platform fee config, ATA derivation          |
| `env.ts`       | ~100  | Environment variable parsing                 |

### Frontend (apps/ui/src/)

| File                      | Lines | Purpose                                |
|---------------------------|-------|----------------------------------------|
| `components/SwapCard.tsx` | ~770  | Core swap UI, wallet integration       |
| `components/TokenSelector.tsx` | ~653 | Token picker with search            |
| `components/Ticker.tsx`   | ~212  | Price ticker marquee                   |
| `app/api/tapestry/profiles/route.ts` | ~896 | Edge API for social profiles |
| `server/tapestry/client.ts` | ~450 | Tapestry API HTTP client             |
| `lib/hooks/useQuotePreview.ts` | ~164 | Quote polling hook                 |

---

## External Integrations

### Titan Exchange
- **Protocol**: msgpack over WebSocket (`v1.api.titan.ag+msgpack`)
- **Regions**: us1, de1, jp1 (with failover)
- **Auth**: Bearer token in WebSocket headers
- **Operations**: Quote streaming, swap transaction building

### Solana Blockchain
- **RPC**: Private endpoint proxied via `/rpc`
- **Operations**: Balances, account info, transaction submission

### Magic Eden API
- **Endpoints**: `/collections/{symbol}/stats`, `/instructions/buy_now`
- **Purpose**: NFT floor prices and purchase instructions for buyback

### Sol Incinerator
- **Endpoint**: `/burn`
- **Purpose**: Burn purchased NFTs

### Tapestry Social API
- **Base**: `https://api.usetapestry.dev/api/v1`
- **Purpose**: User profiles, followers, activity feeds, trade history

### Jupiter API
- **Purpose**: Token lists, trending tokens, price data
- **Used by**: Ticker, TokenSelector

---

## Environment Variables

### Required (Worker Secrets)
```bash
TITAN_TOKEN=<bearer-token>          # Titan API authentication
SOLANA_RPC_URL=<private-rpc>        # Private Solana RPC endpoint
```

### Optional Configuration
```bash
# Titan
TITAN_BASE_URL=https://{region}.api.titan.exchange/api/v1
TITAN_WS_URL=wss://{region}.api.titan.exchange/api/v1/ws
TITAN_REGION_ORDER=us1,de1,jp1
QUOTE_FRESHNESS_SECONDS=3

# Platform Fees
PLATFORM_FEE_ENABLED=true
PLATFORM_FEE_BPS=100                # 1%
PLATFORM_FEE_RECIPIENT=<wallet>

# Buyback
BUYBACK_ENABLED=true
BUYBACK_WALLET_SECRET=<base58-keypair>
BUYBACK_SOL_RESERVE=0.05
ME_API_BASE_URL=https://api-mainnet.magiceden.dev/v2

# UI Build
NEXT_PUBLIC_FROGX_VERSION=v1        # v1=buyback-focused, v2=full features
```

---

## Development Workflow

### Local Setup
```bash
pnpm install                    # Bootstrap workspace
cp .env.example .env            # Configure environment
pnpm dev                        # Start all services
```

### Local Architecture
- **Frontend**: http://localhost:3000 (Next.js dev server)
- **Worker**: http://localhost:8787 (Wrangler dev)
- **Rewrites**: `/api/*` and `/rpc` → localhost:8787

### Deployment
```bash
# Worker
pnpm --filter @frogx/api run deploy

# Frontend (Cloudflare Pages)
pnpm --filter @frogx/ui run deploy:pages

# Full production deploy
pnpm run deploy:prod
```

### Secrets Management
```bash
# Worker secrets
wrangler secret put TITAN_TOKEN
wrangler secret put BUYBACK_WALLET_SECRET

# Pages secrets
wrangler pages secret put SOLANA_RPC_URL --project-name frogx-ui
```

---

## Security Considerations

1. **RPC Whitelisting**: Worker only allows specific Solana RPC methods
2. **CSRF Protection**: Profile routes validate Origin header
3. **Input Validation**: Address format, username regex, bio length limits
4. **CSP Headers**: Strict Content-Security-Policy in middleware
5. **Secrets**: Never in plaintext, managed via Wrangler secrets
6. **No NEXT_PUBLIC_ secrets**: Careful separation of public/private vars

---

## Code Patterns

### Naming Conventions
- **Components**: PascalCase (`SwapCard.tsx`)
- **Functions/Hooks**: camelCase (`useQuotePreview`)
- **Constants**: SCREAMING_SNAKE_CASE
- **CSS Modules**: `*.module.css`

### File Organization
- Reusable logic: `src/lib/`
- Server-only code: `apps/api/src/`
- React components: `src/components/`
- Route handlers: `src/app/api/`

### Testing
```bash
pnpm --filter @frogx/ui run test      # Unit tests (Vitest)
pnpm --filter @frogx/ui run lint      # ESLint
```

---

## Version Flags

The `isV1` flag distinguishes feature sets:

| Feature            | V1 (buyback-focused) | V2+ (full features) |
|--------------------|----------------------|---------------------|
| SwapCard           | Yes                  | Yes                 |
| BuybackProgress    | Yes                  | No                  |
| Profile page       | No                   | Yes                 |
| Leaderboard        | No                   | Yes                 |
| XP system          | No                   | Yes                 |

---

## Troubleshooting

| Issue                    | Solution                                           |
|--------------------------|----------------------------------------------------|
| `/rpc` 404               | Redeploy UI, verify Pages secret `SOLANA_RPC_URL`  |
| Titan WebSocket errors   | Check token, region list, msgpack decode logs      |
| Quotes timing out        | Verify Titan status, check region availability     |
| Jupiter API issues       | Falls back to curated defaults, check console      |
| Build failures           | Ensure npm connectivity for `next-on-pages`        |

---

## Quick Reference: API Endpoints

```
GET  /api/frogx/info              → { version, timestamp, region }
GET  /api/frogx/buyback           → { floor, collected, progress }
POST /api/frogx/quotes            → { quotes: [...], bestRoute }
POST /api/frogx/swap              → { tx_base64, instructions }
POST /api/frogx/buyback/execute   → (auth) Trigger buyback
POST /api/frogx/buyback/burn      → (auth) Trigger burn
```

---

*Keep this document updated when architecture or tooling changes.*
