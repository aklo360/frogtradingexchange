# FrogX Swap API

> Route swaps through FrogX. All swaps include a 1% platform fee that automatically funds NFT buyback and burns.

## Base URL

```
https://frogx.trade/api/frogx
```

## How It Works

```
Your App                    FrogX API                   Blockchain
   │                            │                            │
   ├── POST /quotes ──────────► │                            │
   │◄─── quote + fee info ───── │                            │
   │                            │                            │
   ├── POST /swap ────────────► │                            │
   │◄─── signed transaction ─── │                            │
   │                            │                            │
   ├── wallet signs ──────────────────────────────────────► │
   │                            │                            │
   │                      1% fee goes to ──────────────────► Fee Wallet
   │                            │                            │
   │                    (automated cron)                     │
   │                            │                            │
   │                      When fee wallet                    │
   │                      ≥ NFT floor price ───► Buy NFT ──► Burn
```

**You just call `/quotes` and `/swap`. Buybacks happen automatically.**

---

## Endpoints

### POST /quotes

Get a swap quote with expected output amount.

**Request:**
```json
{
  "inMint": "So11111111111111111111111111111111111111112",
  "outMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "amountIn": "1000000000",
  "slippageBps": 50,
  "userPublicKey": "UserWalletAddressHere"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `inMint` | string | Yes | Input token mint (base58) |
| `outMint` | string | Yes | Output token mint (base58) |
| `amountIn` | string | Yes | Amount in smallest units (lamports) |
| `slippageBps` | number | Yes | Slippage tolerance (50 = 0.5%) |
| `userPublicKey` | string | Yes | User's wallet address |
| `priorityFee` | number | No | Priority fee in lamports |

**Response:**
```json
{
  "status": "executable",
  "inMint": "So11111111111111111111111111111111111111112",
  "outMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "amountIn": "1000000000",
  "amountOut": "142500000",
  "priceImpactBps": 12,
  "routers": ["Orca", "Raydium"],
  "platformFee": {
    "mint": "So11111111111111111111111111111111111111112",
    "amount": "10000000",
    "feeBps": 100,
    "direction": "input"
  }
}
```

---

### POST /swap

Build a swap transaction for the user to sign.

**Request:**
```json
{
  "userPubkey": "UserWalletAddressHere",
  "inMint": "So11111111111111111111111111111111111111112",
  "outMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "amountIn": "1000000000",
  "slippageBps": 50
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userPubkey` | string | Yes | User's wallet address |
| `inMint` | string | Yes | Input token mint |
| `outMint` | string | Yes | Output token mint |
| `amountIn` | string | Yes | Amount in smallest units |
| `slippageBps` | number | Yes | Slippage tolerance |
| `priorityFee` | number | No | Priority fee in lamports |

**Response:**
```json
{
  "mode": "tx_base64",
  "txBase64": "AQAAAA...base64_encoded_transaction..."
}
```

---

## Integration Example

```typescript
import { VersionedTransaction } from '@solana/web3.js';

const API = 'https://frogx.trade/api/frogx';

// 1. Get quote (poll this while user types)
async function getQuote(inMint: string, outMint: string, amountIn: string, userPublicKey: string) {
  const res = await fetch(`${API}/quotes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inMint, outMint, amountIn, slippageBps: 50, userPublicKey }),
  });
  return res.json();
}

// 2. Build swap transaction
async function buildSwap(userPubkey: string, inMint: string, outMint: string, amountIn: string) {
  const res = await fetch(`${API}/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userPubkey, inMint, outMint, amountIn, slippageBps: 50 }),
  });
  return res.json();
}

// 3. Execute swap (with wallet adapter)
async function executeSwap(wallet, connection, inMint, outMint, amountIn) {
  const { txBase64 } = await buildSwap(wallet.publicKey.toString(), inMint, outMint, amountIn);

  const tx = VersionedTransaction.deserialize(Buffer.from(txBase64, 'base64'));
  const signature = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction(signature, 'confirmed');

  return signature;
}
```

---

## Common Tokens

| Token | Mint | Decimals |
|-------|------|----------|
| SOL | `So11111111111111111111111111111111111111112` | 9 |
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | 6 |
| USDT | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` | 6 |

For full token list: `https://token.jup.ag/strict`

---

## Amount Conversion

```typescript
// UI amount → base units (for API)
const toBaseUnits = (amount: number, decimals: number) =>
  BigInt(Math.floor(amount * 10 ** decimals)).toString();

// Base units → UI amount (for display)
const toUiAmount = (baseUnits: string, decimals: number) =>
  Number(baseUnits) / 10 ** decimals;

// Examples:
// 1 SOL = toBaseUnits(1, 9) → "1000000000"
// 100 USDC = toBaseUnits(100, 6) → "100000000"
```

---

## Platform Fee

- **Rate**: 1% (100 basis points)
- **Enforcement**: Baked into every transaction server-side
- **Purpose**: 100% funds automated NFT buyback and burns
- **Your responsibility**: None - just use the API

The `platformFee` in quote responses shows what will be collected:
```json
{
  "platformFee": {
    "mint": "So11111111111111111111111111111111111111112",
    "amount": "10000000",
    "feeBps": 100,
    "direction": "input"
  }
}
```

---

## Error Handling

```json
{ "error": "Error message" }
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request (missing fields) |
| 502 | Upstream unavailable (retry) |

```typescript
async function fetchWithRetry(url: string, options: RequestInit, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, options);
    if (res.ok) return res.json();
    if (res.status !== 502) throw new Error(await res.text());
    await new Promise(r => setTimeout(r, 1000 * (i + 1)));
  }
  throw new Error('Service unavailable');
}
```

---

## RPC Proxy (Optional)

If you need a Solana RPC for `sendTransaction`:

```
POST https://frogx.trade/rpc
Content-Type: application/json

{"jsonrpc":"2.0","id":1,"method":"sendTransaction","params":["base64tx..."]}
```

Whitelisted methods: `getBalance`, `getAccountInfo`, `getLatestBlockhash`, `sendTransaction`, `simulateTransaction`, `getSignatureStatuses`, etc.
