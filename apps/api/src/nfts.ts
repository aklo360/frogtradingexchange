import { PrivyClient, type AuthorizationContext } from "@privy-io/node";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { getAccountConfig, isAuthorizedBot } from "./account";
import type { Env } from "./env";

const LAMPORTS_PER_SOL = 1_000_000_000;
const DEFAULT_ME_BASE_URL = "https://api-mainnet.magiceden.dev/v2";
const DEFAULT_ME_COLLECTION_SYMBOL = "solana_business_frogs";
const DEFAULT_ME_STATS_PATH = "/collections/{symbol}/stats";
const DEFAULT_ME_LISTINGS_PATH = "/collections/{symbol}/listings";
const DEFAULT_ME_LISTINGS_QUERY =
  "offset=0&limit=1&sort=listPrice&sort_direction=asc&listingAggMode=true";
const DEFAULT_ME_BUY_NOW_PATH = "/instructions/buy_now";
const DEFAULT_ME_MMM_POOLS_PATH = "/mmm/pools";
const DEFAULT_ME_MMM_FULFILL_SELL_PATH = "/instructions/mmm/sol-fulfill-sell";
const DEFAULT_ME_MMM_POOLS_LIMIT = 500;
const MAX_LISTING_LIMIT = 20;
const MAX_PREFLIGHT_SCAN_LIMIT = 80;
const DEFAULT_MAX_BUY_QUANTITY = 10;
const DEFAULT_MAX_BUY_TOTAL_SOL = 1;
const DEFAULT_PREFLIGHT_SCAN_LIMIT = 10;
const DEFAULT_LISTING_SCAN_LIMIT = 600;
const MAX_LISTING_SCAN_LIMIT = 1_000;
const LISTING_SCAN_PAGE_LIMIT = 100;
const MAX_MARKETPLACE_BUILD_ATTEMPTS = 80;
const SAME_PRICE_SPREAD_MIN_LISTINGS = 24;
const MAGIC_EDEN_MAX_RETRIES = 5;
const MAGIC_EDEN_RETRY_BASE_MS = 500;
const MAGIC_EDEN_RETRY_MAX_MS = 3_000;
const STALE_MMM_POOL_RETRY_LIMIT = 50;
const MMM_MAX_SAFE_BUYER_ROYALTY_BPS = 1_000;
const DEFAULT_SOLANA_MAINNET_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const DEFAULT_SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";
const TELEGRAM_BUY_FEE_BUFFER_LAMPORTS = 10_000_000n;
const DEFAULT_TELEGRAM_SWEEP_ITEM_DELAY_MS = 2_500;
const MAX_TELEGRAM_SWEEP_ITEM_DELAY_MS = 10_000;

type MagicEdenConfig = {
  baseUrl: string;
  apiKey: string | null;
  apiKeyHeader: string;
  apiKeyPrefix: string | null;
  collectionSymbol: string;
  statsPath: string;
  listingsPath: string;
  listingsQuery: string;
  buyNowPath: string;
  buyNowMethod: "GET" | "POST";
  mmmPoolsPath: string;
  mmmFulfillSellPath: string;
  floorUnit: "lamports" | "sol";
  maxBuyQuantity: number;
  maxBuyTotalSol: number;
  preflightEnabled: boolean;
  preflightScanLimit: number;
  listingScanLimit: number;
};

type FloorListing = {
  tokenMint: string | null;
  priceLamports: string | null;
  priceSol: number | null;
  seller: string | null;
  tokenAccount: string | null;
  auctionHouse: string | null;
  sellerExpiry: number | null;
  tokenName: string | null;
  image: string | null;
  source: string | null;
};

type PricedFloorListing = FloorListing & {
  tokenMint: string;
  priceLamports: string;
  priceSol: number;
  seller: string;
};

type TelegramExecuteBody = {
  telegramUserId?: string | number;
  telegramUsername?: string;
  quantity?: number | string;
  intentId?: string;
  expectedTokenMint?: string;
  maxTotalSol?: number | string;
};

type PreparedBuyTransaction = {
  tokenMint: string;
  seller: string;
  tokenAccount: string | null;
  auctionHouse: string | null;
  source: string | null;
  tokenName: string | null;
  image: string | null;
  priceLamports: string;
  priceSol: number;
  transactionBase64: string;
  preflight: {
    ok: boolean;
    slot: number | null;
  } | null;
};

type PreparedBuyFloor = {
  source: "magic_eden";
  action: "buy-floor";
  buyer: string;
  quantity: number;
  requestedQuantity: number;
  intentId: string | null;
  collectionSymbol: string;
  estimatedTotalLamports: string;
  estimatedTotalSol: number | null;
  transactions: PreparedBuyTransaction[];
  rejected?: Array<{
    tokenMint: string;
    priceSol: number;
    source: string | null;
    reason: string;
  }>;
  rejectedSummary?: Array<{
    source: string | null;
    reason: string;
    count: number;
    firstTokenMint: string;
    firstPriceSol: number;
    firstDetail: string;
  }>;
  updatedAt: string;
};

type SubmittedTransactionConfirmation = {
  confirmed: boolean;
  confirmationStatus: string | null;
  slot: number | null;
  pending: boolean;
  detail: string | null;
};

type SubmittedNftTransaction = {
  tokenMint: string;
  priceSol: number;
  hash: string;
  caip2: string;
  transactionId: string | null;
  confirmed: boolean;
  confirmation: SubmittedTransactionConfirmation;
};

type ExecutionStop = {
  status: number;
  error: string;
  code: string;
  layer: string;
  detail: string;
};

type PrivyUserLinkedAccount = {
  id?: string | null;
  address?: string;
  public_key?: string;
  type?: string;
  chain_type?: string;
  connector_type?: string;
  delegated?: boolean;
  wallet_client?: string;
  wallet_client_type?: string;
};

type PrivyUserLike = {
  id: string;
  linked_accounts?: PrivyUserLinkedAccount[];
};

type PrivyClientLike = {
  users(): {
    getByTelegramUserID(input: { telegram_user_id: string }): Promise<PrivyUserLike>;
  };
  wallets(): {
    solana(): {
      signAndSendTransaction(
        walletId: string,
        input: {
          caip2: string;
          transaction: string;
          authorization_context: AuthorizationContext;
          sponsor?: boolean;
          idempotency_key?: string;
        },
      ): Promise<{ hash: string; caip2: string; transaction_id?: string }>;
    };
  };
};

type ExecuteDeps = {
  createPrivyClient?: (env: Env) => PrivyClientLike;
  getBalanceLamports?: (env: Env, address: string) => Promise<bigint | null>;
  confirmTransaction?: (
    env: Env,
    signature: string,
  ) => Promise<SubmittedTransactionConfirmation>;
};

type ExecutionErrorCode =
  | "INSUFFICIENT_SOL"
  | "SIGNING_NOT_AUTHORIZED"
  | "MARKETPLACE_BUILD_UNAVAILABLE"
  | "TRANSACTION_REJECTED"
  | "TRANSACTION_CONFIRMATION_PENDING"
  | "EXECUTION_TEMPORARILY_UNAVAILABLE";

type MmmPool = {
  poolKey?: string;
  poolType?: string;
  mints?: string[];
  spotPrice?: number;
  curveType?: string;
  curveDelta?: number;
  lpFeeBp?: number;
  sellsideAssetAmount?: number;
  buysideCreatorRoyaltyBp?: number;
  poolOwner?: string;
};

const json = (data: unknown, init?: ResponseInit) => Response.json(data, init);

const resolvePath = (template: string, symbol: string) =>
  template.replace("{symbol}", encodeURIComponent(symbol));

const resolveMagicEdenUrl = (baseUrl: string, path: string) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, normalizedBase);
};

const applyListingsQuery = (
  url: URL,
  query: string,
  limit: number,
  offset = 0,
) => {
  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (!params.has("sort")) params.set("sort", "listPrice");
  if (!params.has("sort_direction")) params.set("sort_direction", "asc");
  if (!params.has("listingAggMode")) params.set("listingAggMode", "true");
  url.search = params.toString();
};

const buildHeaders = (
  apiKey: string | null,
  apiKeyHeader: string,
  apiKeyPrefix: string | null,
) => {
  const headers = new Headers({
    Accept: "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
  });
  if (apiKey) {
    headers.set(apiKeyHeader, apiKeyPrefix ? `${apiKeyPrefix} ${apiKey}` : apiKey);
  }
  return headers;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const parseRetryAfterMs = (value: string | null) => {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAGIC_EDEN_RETRY_MAX_MS, Math.round(seconds * 1_000));
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.min(
    MAGIC_EDEN_RETRY_MAX_MS,
    Math.max(0, timestamp - Date.now()),
  );
};

const magicEdenRetryDelayMs = (response: Response, attempt: number) => {
  const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
  if (retryAfterMs !== null) return retryAfterMs;
  return Math.min(
    MAGIC_EDEN_RETRY_MAX_MS,
    MAGIC_EDEN_RETRY_BASE_MS * 2 ** attempt,
  );
};

const fetchMagicEden = async (
  url: URL,
  init: RequestInit = {},
) => {
  for (let attempt = 0; attempt <= MAGIC_EDEN_MAX_RETRIES; attempt += 1) {
    const response = await fetch(url.toString(), {
      ...init,
      headers: init.headers,
    });
    if (response.status !== 429 || attempt >= MAGIC_EDEN_MAX_RETRIES) {
      return response;
    }
    await sleep(magicEdenRetryDelayMs(response, attempt));
  }

  throw new Error("MAGIC_EDEN_RETRY_EXHAUSTED");
};

const fetchJson = async <T>(url: URL, config: MagicEdenConfig): Promise<T> => {
  const response = await fetchMagicEden(url, {
    headers: buildHeaders(
      config.apiKey,
      config.apiKeyHeader,
      config.apiKeyPrefix,
    ),
  });
  if (!response.ok) {
    throw new Error(`MAGIC_EDEN_${response.status}`);
  }
  return (await response.json()) as T;
};

const getMagicEdenConfig = (env: Env): MagicEdenConfig => {
  const apiKeyHeader = env.ME_API_KEY_HEADER?.trim() || "Authorization";
  const apiKeyPrefix =
    env.ME_API_KEY_PREFIX?.trim() ||
    (apiKeyHeader.toLowerCase() === "authorization" ? "Bearer" : "");

  return {
    baseUrl: env.ME_API_BASE_URL?.trim() || DEFAULT_ME_BASE_URL,
    apiKey: env.ME_API_KEY?.trim() || null,
    apiKeyHeader,
    apiKeyPrefix: apiKeyPrefix || null,
    collectionSymbol:
      env.ME_COLLECTION_SYMBOL?.trim() || DEFAULT_ME_COLLECTION_SYMBOL,
    statsPath: env.ME_STATS_PATH?.trim() || DEFAULT_ME_STATS_PATH,
    listingsPath: env.ME_LISTINGS_PATH?.trim() || DEFAULT_ME_LISTINGS_PATH,
    listingsQuery:
      env.ME_LISTINGS_QUERY?.trim() || DEFAULT_ME_LISTINGS_QUERY,
    buyNowPath: env.ME_BUY_NOW_PATH?.trim() || DEFAULT_ME_BUY_NOW_PATH,
    buyNowMethod:
      (env.ME_BUY_NOW_METHOD?.trim().toUpperCase() as "GET" | "POST") ||
      "GET",
    mmmPoolsPath: env.ME_MMM_POOLS_PATH?.trim() || DEFAULT_ME_MMM_POOLS_PATH,
    mmmFulfillSellPath:
      env.ME_MMM_FULFILL_SELL_PATH?.trim() ||
      DEFAULT_ME_MMM_FULFILL_SELL_PATH,
    floorUnit:
      (env.ME_FLOOR_PRICE_UNIT?.trim().toLowerCase() as "lamports" | "sol") ||
      "lamports",
    maxBuyQuantity: clampInteger(
      Number(env.FROGX_NFT_MAX_SWEEP_QUANTITY),
      1,
      DEFAULT_MAX_BUY_QUANTITY,
      DEFAULT_MAX_BUY_QUANTITY,
    ),
    maxBuyTotalSol: parsePositiveNumber(
      env.FROGX_NFT_MAX_TOTAL_SOL,
      DEFAULT_MAX_BUY_TOTAL_SOL,
    ),
    preflightEnabled: parseEnvBool(env.FROGX_NFT_PREFLIGHT_ENABLED),
    preflightScanLimit: clampInteger(
      Number(env.FROGX_NFT_PREFLIGHT_SCAN_LIMIT),
      1,
      MAX_PREFLIGHT_SCAN_LIMIT,
      DEFAULT_PREFLIGHT_SCAN_LIMIT,
    ),
    listingScanLimit: clampInteger(
      Number(env.FROGX_NFT_LISTING_SCAN_LIMIT),
      1,
      MAX_LISTING_SCAN_LIMIT,
      DEFAULT_LISTING_SCAN_LIMIT,
    ),
  };
};

const parsePositiveNumber = (value: string | undefined, fallback: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const parseMaybePositiveNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const clampInteger = (
  value: number,
  min: number,
  max: number,
  fallback: number,
) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), min), max);
};

const parseLamports = (
  raw: number | string | undefined | null,
  unit: "lamports" | "sol",
) => {
  if (raw === undefined || raw === null) return null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return unit === "sol"
    ? BigInt(Math.round(numeric * LAMPORTS_PER_SOL))
    : BigInt(Math.round(numeric));
};

const lamportsToSol = (lamports: bigint | null) =>
  lamports === null ? null : Number(lamports) / LAMPORTS_PER_SOL;

const lamportsStringToSolString = (lamports: string) => {
  const value = BigInt(lamports);
  const whole = value / BigInt(LAMPORTS_PER_SOL);
  const fractional = value % BigInt(LAMPORTS_PER_SOL);
  if (fractional === 0n) return whole.toString();
  return `${whole}.${fractional
    .toString()
    .padStart(9, "0")
    .replace(/0+$/, "")}`;
};

const solToLamports = (sol: number) =>
  BigInt(Math.max(0, Math.round(sol * LAMPORTS_PER_SOL)));

const firstArray = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const candidate = record.results ?? record.listings ?? record.items ?? record.data;
  return Array.isArray(candidate) ? candidate : [];
};

const asRecord = (value: unknown) =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

const readString = (record: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

const parseListingRecord = (
  value: unknown,
  floorUnit: "lamports" | "sol",
): FloorListing | null => {
  const first = asRecord(value);
  if (!first) return null;

  const priceInfo = asRecord(first.priceInfo) ?? asRecord(first.price_info);
  const solPrice = priceInfo
    ? asRecord(priceInfo.solPrice) ?? asRecord(priceInfo.sol_price)
    : null;
  const rawLamports =
    first.priceLamports ??
    first.price_lamports ??
    solPrice?.rawAmount ??
    solPrice?.raw_amount;
  const rawPrice = first.price ?? priceInfo?.price ?? solPrice?.uiAmount;
  const priceLamports =
    parseLamports(rawLamports as number | string | undefined, "lamports") ??
    parseLamports(rawPrice as number | string | undefined, "sol");
  const token = asRecord(first.token);
  const sellerExpiryRaw =
    first.sellerExpiry ??
    first.seller_expiry ??
    first.expiry ??
    first.expiration;
  const sellerExpiry = Number(sellerExpiryRaw);

  return {
    tokenMint:
      readString(first, "tokenMint", "mint", "mintAddress") ??
      (token ? readString(token, "mint", "tokenMint", "mintAddress") : null),
    priceLamports: priceLamports?.toString() ?? null,
    priceSol: lamportsToSol(priceLamports),
    seller: readString(first, "seller", "sellerAddress"),
    tokenAccount:
      readString(first, "tokenAccount", "tokenAccountAddress", "tokenAta") ??
      (token
        ? readString(token, "tokenAccount", "tokenAccountAddress", "tokenAta")
        : null),
    auctionHouse: readString(first, "auctionHouseAddress", "auctionHouse"),
    sellerExpiry: Number.isFinite(sellerExpiry) ? sellerExpiry : null,
    tokenName:
      readString(first, "name", "title") ??
      (token ? readString(token, "name", "title") : null),
    image:
      readString(first, "image", "imageUrl", "img") ??
      (token ? readString(token, "image", "imageUrl", "img") : null),
    source: readString(first, "listingSource", "listingType", "source"),
  };
};

const parseListings = (payload: unknown, floorUnit: "lamports" | "sol") =>
  firstArray(payload)
    .map((listing) => parseListingRecord(listing, floorUnit))
    .filter((listing): listing is FloorListing => Boolean(listing));

const parseListing = (
  payload: unknown,
  floorUnit: "lamports" | "sol",
): FloorListing | null => parseListings(payload, floorUnit)[0] ?? null;

const readListingLimit = (request: Request) => {
  const url = new URL(request.url);
  const numeric = Number(url.searchParams.get("limit"));
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(Math.max(Math.floor(numeric), 1), MAX_LISTING_LIMIT);
};

const readBuyQuantity = (value: unknown, config: MagicEdenConfig) =>
  clampInteger(Number(value), 1, config.maxBuyQuantity, 1);

const readTelegramSweepItemDelayMs = (env: Env) =>
  clampInteger(
    Number(env.FROGX_NFT_SWEEP_ITEM_DELAY_MS),
    0,
    MAX_TELEGRAM_SWEEP_ITEM_DELAY_MS,
    DEFAULT_TELEGRAM_SWEEP_ITEM_DELAY_MS,
  );

const parseEnvBool = (value: string | undefined) => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const safeErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/authorization_private_keys?["':\s\[]+[A-Za-z0-9._~+/=-]+/gi, "authorization_private_key [redacted]")
    .slice(0, 240);
};

const normalizeOptionalMint = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return new PublicKey(value.trim()).toBase58();
  } catch {
    return null;
  }
};

const getSolanaCaip2 = (env: Env) =>
  env.SOLANA_CAIP2?.trim() || DEFAULT_SOLANA_MAINNET_CAIP2;

const getSolanaRpcUrl = (env: Env) =>
  env.SOLANA_RPC_URL?.trim() ||
  env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
  DEFAULT_SOLANA_RPC_URL;

const getWalletBalanceLamports = async (env: Env, address: string) => {
  try {
    const connection = new Connection(getSolanaRpcUrl(env), "confirmed");
    return BigInt(await connection.getBalance(new PublicKey(address), "confirmed"));
  } catch (error) {
    console.warn("[nfts] Failed to read Telegram wallet balance", safeErrorMessage(error));
    return null;
  }
};

const waitForSubmittedTransaction = async (
  env: Env,
  signature: string,
): Promise<SubmittedTransactionConfirmation> => {
  const delaysMs = [0, 500, 1_000, 1_500, 2_500, 3_500];
  let lastStatus: SubmittedTransactionConfirmation = {
    confirmed: false,
    confirmationStatus: null,
    slot: null,
    pending: true,
    detail: "Signature status not found yet",
  };

  for (const delayMs of delaysMs) {
    if (delayMs > 0) await sleep(delayMs);
    const response = await fetch(getSolanaRpcUrl(env), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "frogx-nft-signature-status",
        method: "getSignatureStatuses",
        params: [[signature], { searchTransactionHistory: true }],
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
      result?: {
        value?: Array<{
          slot?: number;
          err?: unknown;
          confirmationStatus?: string | null;
        } | null>;
      };
    } | null;

    if (!response.ok || payload?.error) {
      throw new Error(
        `SOLANA_CONFIRMATION_RPC_${response.status}: ${
          payload?.error?.message ?? "RPC request failed"
        }`,
      );
    }

    const status = payload?.result?.value?.[0] ?? null;
    if (!status) {
      lastStatus = {
        confirmed: false,
        confirmationStatus: null,
        slot: null,
        pending: true,
        detail: "Signature status not found yet",
      };
      continue;
    }

    const confirmationStatus = status.confirmationStatus ?? null;
    const slot = typeof status.slot === "number" ? status.slot : null;
    if (status.err) {
      throw new Error(
        `SOLANA_CONFIRMATION_REJECTED ${JSON.stringify(status.err)}`,
      );
    }
    if (
      confirmationStatus === "confirmed" ||
      confirmationStatus === "finalized"
    ) {
      return {
        confirmed: true,
        confirmationStatus,
        slot,
        pending: false,
        detail: null,
      };
    }

    lastStatus = {
      confirmed: false,
      confirmationStatus,
      slot,
      pending: true,
      detail: "Signature is not confirmed yet",
    };
  }

  return lastStatus;
};

const simulateTransactionBase64 = async (env: Env, transactionBase64: string) => {
  const response = await fetch(getSolanaRpcUrl(env), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "frogx-nft-preflight",
      method: "simulateTransaction",
      params: [
        transactionBase64,
        {
          commitment: "confirmed",
          encoding: "base64",
          replaceRecentBlockhash: true,
          sigVerify: false,
        },
      ],
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    result?: {
      context?: { slot?: number };
      value?: {
        err?: unknown;
        logs?: string[];
      };
    };
  } | null;

  if (!response.ok || payload?.error) {
    throw new Error(
      `SOLANA_PREFLIGHT_RPC_${response.status}: ${
        payload?.error?.message ?? "RPC request failed"
      }`,
    );
  }

  const value = payload?.result?.value;
  if (value?.err) {
    const logs = Array.isArray(value.logs) ? value.logs.slice(-4).join(" | ") : "";
    throw new Error(
      `SOLANA_PREFLIGHT_REJECTED ${JSON.stringify(value.err)}${
        logs ? ` Logs: ${logs}` : ""
      }`,
    );
  }

  return {
    ok: true,
    slot:
      typeof payload?.result?.context?.slot === "number"
        ? payload.result.context.slot
        : null,
  };
};

const classifyExecutionError = (
  error: unknown,
): {
  code: ExecutionErrorCode;
  layer: "wallet" | "privy" | "marketplace" | "chain" | "network";
  error: string;
  status: number;
  detail: string;
} => {
  const message = safeErrorMessage(error);
  const normalized = message.toLowerCase();
  if (
    normalized.includes("insufficient") ||
    normalized.includes("not enough sol") ||
    normalized.includes("insufficient funds") ||
    normalized.includes("attempt to debit") ||
    normalized.includes("accountnotfound") ||
    normalized.includes("account not found") ||
    normalized.includes("custom program error: 0x1")
  ) {
    return {
      code: "INSUFFICIENT_SOL",
      layer: "wallet",
      error: "Insufficient SOL in FTX trade wallet",
      status: 402,
      detail: message,
    };
  }
  if (
    normalized.includes("authorization") ||
    normalized.includes("policy") ||
    normalized.includes("delegat") ||
    normalized.includes("signer") ||
    normalized.includes("permission") ||
    normalized.includes("forbidden")
  ) {
    return {
      code: "SIGNING_NOT_AUTHORIZED",
      layer: "privy",
      error: "FTX trade wallet signing is not authorized",
      status: 503,
      detail: message,
    };
  }
  if (normalized.includes("magic_eden")) {
    return {
      code: "MARKETPLACE_BUILD_UNAVAILABLE",
      layer: "marketplace",
      error: "NFT marketplace transaction build temporarily unavailable",
      status: 502,
      detail: message,
    };
  }
  if (
    normalized.includes("blockhash") ||
    normalized.includes("simulation") ||
    normalized.includes("preflight") ||
    normalized.includes("confirmation_rejected") ||
    normalized.includes("failed to send") ||
    normalized.includes("broadcast") ||
    normalized.includes("transaction") ||
    normalized.includes("signature verification") ||
    normalized.includes("custom program error")
  ) {
    return {
      code: "TRANSACTION_REJECTED",
      layer: "chain",
      error: "NFT transaction was rejected before execution",
      status: 409,
      detail: message,
    };
  }
  return {
    code: "EXECUTION_TEMPORARILY_UNAVAILABLE",
    layer:
      normalized.includes("timeout") || normalized.includes("fetch failed")
        ? "network"
        : "privy",
    error: "NFT execution temporarily unavailable",
    status: 502,
    detail: message,
  };
};

const executionErrorResponse = (error: unknown) => {
  const classified = classifyExecutionError(error);
  return json(
    {
      error: classified.error,
      code: classified.code,
      layer: classified.layer,
      detail: classified.detail,
    },
    { status: classified.status },
  );
};

const responseExecutionStop = async (response: Response) => {
  const body = (await response.json().catch(() => null)) as unknown;
  const record = asRecord(body);
  return {
    status: response.status,
    error:
      typeof record?.error === "string"
        ? record.error
        : "NFT execution stopped before the full sweep completed",
    code:
      typeof record?.code === "string"
        ? record.code
        : "EXECUTION_TEMPORARILY_UNAVAILABLE",
    layer:
      typeof record?.layer === "string"
        ? record.layer
        : response.status >= 500
          ? "network"
          : "marketplace",
    detail:
      typeof record?.detail === "string"
        ? record.detail
        : `HTTP ${response.status}`,
  };
};

const errorExecutionStop = (error: unknown) => {
  const classified = classifyExecutionError(error);
  return {
    status: classified.status,
    error: classified.error,
    code: classified.code,
    layer: classified.layer,
    detail: classified.detail,
  };
};

const pendingExecutionStop = (
  confirmation: SubmittedTransactionConfirmation,
) => ({
  status: 202,
  error: "NFT transaction submitted but not confirmed yet",
  code: "TRANSACTION_CONFIRMATION_PENDING",
  layer: "chain",
  detail: confirmation.detail ?? "Signature confirmation is still pending",
});

const buildTelegramExecutionResponse = ({
  buyer,
  telegramUserId,
  telegramUsername,
  requestedQuantity,
  intentId,
  estimatedTotalLamports,
  submitted,
  failed,
  stop,
}: {
  buyer: string;
  telegramUserId: string;
  telegramUsername: string | null;
  requestedQuantity: number;
  intentId: string | null;
  estimatedTotalLamports: bigint;
  submitted: SubmittedNftTransaction[];
  failed: Array<Record<string, unknown>>;
  stop?: ExecutionStop;
}) => {
  const confirmedCount = submitted.filter((tx) => tx.confirmed).length;
  const partial =
    confirmedCount < requestedQuantity ||
    Boolean(stop) ||
    failed.length > 0;

  return json(
    {
      source: "privy",
      action: "buy-floor",
      buyer,
      telegramUserId,
      telegramUsername,
      quantity: requestedQuantity,
      requestedQuantity,
      intentId,
      estimatedTotalLamports: estimatedTotalLamports.toString(),
      estimatedTotalSol: lamportsToSol(estimatedTotalLamports),
      submittedCount: submitted.length,
      confirmedCount,
      partial,
      submitted,
      ...(failed.length ? { failed } : {}),
      ...(stop
        ? {
            error: stop.error,
            code: stop.code,
            layer: stop.layer,
            detail: stop.detail,
          }
        : {}),
      updatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    },
  );
};

const isWalletFundingPreflightError = (reason: string) => {
  const normalized = reason.toLowerCase();
  return (
    normalized.includes("accountnotfound") ||
    normalized.includes("account not found") ||
    normalized.includes("insufficient") ||
    normalized.includes("attempt to debit")
  );
};

const isStaleMarketplacePreflightError = (reason: string) => {
  const normalized = reason.toLowerCase();
  return (
    normalized.includes("stale_mmm_pool") ||
    normalized.includes("accountnotinitialized") ||
    normalized.includes("sell_state") ||
    normalized.includes('"custom":3012') ||
    (normalized.includes("sell_state") && normalized.includes("not initialized"))
  );
};

const isHighRoyaltyMmmPoolError = (reason: string) =>
  reason.toLowerCase().includes("high_buyer_royalty_mmm_pool");

const classifyRejectedReason = (reason: string) => {
  const normalized = reason.toLowerCase();
  if (isWalletFundingPreflightError(reason)) return "wallet_funding";
  if (isStaleMarketplacePreflightError(reason)) return "stale_marketplace";
  if (isHighRoyaltyMmmPoolError(reason)) return "high_royalty_mmm_pool";
  if (normalized.includes("unsupported_marketplace_source")) {
    return "unsupported_source";
  }
  if (normalized.includes("blocked_mmm_pool")) return "blocked_pool";
  if (normalized.includes("attempt_limit")) return "attempt_limit";
  if (normalized.includes("magic_eden_buy")) return "marketplace_buy_build";
  if (normalized.includes("magic_eden")) return "marketplace_build";
  if (normalized.includes("solana_preflight_rejected")) return "preflight_rejected";
  if (normalized.includes("max_total_exceeded")) return "max_total_exceeded";
  return "other";
};

const summarizeRejectedCandidates = (
  candidates: Array<{
    tokenMint: string;
    priceSol: number;
    source: string | null;
    reason: string;
  }>,
) => {
  const summary = new Map<
    string,
    {
      source: string | null;
      reason: string;
      count: number;
      firstTokenMint: string;
      firstPriceSol: number;
      firstDetail: string;
    }
  >();
  candidates.forEach((candidate) => {
    const reason = classifyRejectedReason(candidate.reason);
    const key = `${candidate.source ?? "unknown"}:${reason}`;
    const current = summary.get(key);
    if (current) {
      current.count += 1;
      return;
    }
    summary.set(key, {
      source: candidate.source,
      reason,
      count: 1,
      firstTokenMint: candidate.tokenMint,
      firstPriceSol: candidate.priceSol,
      firstDetail: candidate.reason.slice(0, 160),
    });
  });
  return [...summary.values()];
};

const createPrivyClient = (env: Env): PrivyClientLike => {
  const appId = env.PRIVY_APP_ID?.trim() || env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
  const appSecret = env.PRIVY_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    throw new Error("PRIVY_APP_CREDENTIALS_MISSING");
  }
  return new PrivyClient({ appId, appSecret }) as unknown as PrivyClientLike;
};

const selectDelegatedPrivySolanaWallet = (user: PrivyUserLike) => {
  const accounts = Array.isArray(user.linked_accounts) ? user.linked_accounts : [];
  return (
    accounts.find(
      (account) =>
        account.type === "wallet" &&
        account.chain_type === "solana" &&
        (account.wallet_client_type === "privy" ||
          account.wallet_client === "privy") &&
        account.connector_type === "embedded" &&
        Boolean(account.id) &&
        account.delegated === true,
    ) ??
    null
  );
};

const asPricedListing = (listing: FloorListing): PricedFloorListing | null => {
  if (
    !listing.tokenMint ||
    !listing.priceLamports ||
    listing.priceSol === null ||
    !listing.seller
  ) {
    return null;
  }
  return {
    ...listing,
    tokenMint: listing.tokenMint,
    priceLamports: listing.priceLamports,
    priceSol: listing.priceSol,
    seller: listing.seller,
  };
};

const spreadSamePriceGroup = (group: PricedFloorListing[]) => {
  if (group.length < SAME_PRICE_SPREAD_MIN_LISTINGS) return group;

  const ordered: PricedFloorListing[] = [];
  const seen = new Set<number>();
  const anchors = [
    0,
    Math.floor(group.length / 2),
    group.length - 1,
    Math.floor(group.length / 4),
    Math.floor((group.length * 3) / 4),
  ];
  const add = (index: number) => {
    if (index < 0 || index >= group.length || seen.has(index)) return;
    seen.add(index);
    ordered.push(group[index]);
  };

  for (let radius = 0; ordered.length < group.length; radius += 1) {
    anchors.forEach((anchor) => {
      if (radius === 0) {
        add(anchor);
      } else {
        add(anchor - radius);
        add(anchor + radius);
      }
    });
  }

  return ordered;
};

const spreadSamePriceListings = (listings: PricedFloorListing[]) => {
  const ordered: PricedFloorListing[] = [];
  let groupStart = 0;
  while (groupStart < listings.length) {
    let groupEnd = groupStart + 1;
    while (
      groupEnd < listings.length &&
      listings[groupEnd].priceLamports === listings[groupStart].priceLamports
    ) {
      groupEnd += 1;
    }
    ordered.push(...spreadSamePriceGroup(listings.slice(groupStart, groupEnd)));
    groupStart = groupEnd;
  }
  return ordered;
};

const sortPricedListingsByPrice = (listings: PricedFloorListing[]) => {
  const sorted = listings
    .map((listing, index) => ({ listing, index }))
    .sort((a, b) => {
      const aLamports = BigInt(a.listing.priceLamports);
      const bLamports = BigInt(b.listing.priceLamports);
      if (aLamports < bLamports) return -1;
      if (aLamports > bLamports) return 1;
      return a.index - b.index;
    })
    .map(({ listing }) => listing);

  return spreadSamePriceListings(sorted);
};

const fetchListingsPage = async (
  config: MagicEdenConfig,
  listingLimit: number,
  offset = 0,
  listingAggMode?: "true" | "false",
) => {
  const listingsUrl = resolveMagicEdenUrl(
    config.baseUrl,
    resolvePath(config.listingsPath, config.collectionSymbol),
  );
  applyListingsQuery(listingsUrl, config.listingsQuery, listingLimit, offset);
  if (listingAggMode) listingsUrl.searchParams.set("listingAggMode", listingAggMode);
  const payload = await fetchJson<unknown>(listingsUrl, config);
  return parseListings(payload, config.floorUnit);
};

const fetchListingCandidatesForBuy = async (
  config: MagicEdenConfig,
  scanLimit: number,
) => {
  const listings: FloorListing[] = [];
  const seenMints = new Set<string>();
  let offset = 0;

  while (listings.length < scanLimit && offset < scanLimit) {
    const page = await fetchListingsPage(
      config,
      LISTING_SCAN_PAGE_LIMIT,
      offset,
      "false",
    );
    if (page.length === 0) break;

    page.forEach((listing) => {
      const mint = listing.tokenMint;
      if (!mint || seenMints.has(mint) || listings.length >= scanLimit) return;
      seenMints.add(mint);
      listings.push(listing);
    });

    offset += Math.max(LISTING_SCAN_PAGE_LIMIT, page.length);
  }

  return listings;
};

const fetchFloorPayload = async (config: MagicEdenConfig, listingLimit: number) => {
  const statsUrl = resolveMagicEdenUrl(
    config.baseUrl,
    resolvePath(config.statsPath, config.collectionSymbol),
  );

  const [stats, listings] = await Promise.all([
    fetchJson<Record<string, unknown>>(statsUrl, config),
    fetchListingsPage(config, listingLimit, 0),
  ]);

  return {
    stats,
    listings: listings.slice(0, listingLimit),
  };
};

const decodeBase64 = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const encodeBase64 = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const decodeTransactionPayload = (value: unknown): Uint8Array => {
  if (!value) throw new Error("TRANSACTION_MISSING");
  if (typeof value === "string") {
    try {
      return decodeBase64(value);
    } catch {
      return bs58.decode(value);
    }
  }
  if (typeof value === "object") {
    const data = (value as { data?: unknown }).data;
    if (Array.isArray(data)) return Uint8Array.from(data as number[]);
  }
  throw new Error("TRANSACTION_UNSUPPORTED");
};

const extractTransactionPayload = (payload: Record<string, unknown>) =>
  payload.txSigned ??
  payload.tx ??
  payload.transaction ??
  payload.txBase64 ??
  payload.transactionBase64 ??
  (asRecord(payload.data)?.tx ?? null);

const isMmmListing = (listing: PricedFloorListing) =>
  listing.source?.trim().toUpperCase() === "MMM";

const isUnsupportedMagicEdenBuySource = (listing: PricedFloorListing) => {
  const source = listing.source?.trim().toUpperCase() ?? "";
  return source.startsWith("TENSOR");
};

const parseMmmPools = (payload: unknown): MmmPool[] => {
  const pools = firstArray(payload);
  return pools
    .map((pool) => asRecord(pool))
    .filter((pool): pool is Record<string, unknown> => Boolean(pool))
    .map((pool) => ({
      poolKey: readString(pool, "poolKey", "pool_key"),
      poolType: readString(pool, "poolType", "pool_type") ?? undefined,
      mints: Array.isArray(pool.mints)
        ? pool.mints.filter((mint): mint is string => typeof mint === "string")
        : undefined,
      spotPrice:
        typeof pool.spotPrice === "number"
          ? pool.spotPrice
          : Number(pool.spot_price),
      curveType: readString(pool, "curveType", "curve_type") ?? undefined,
      curveDelta:
        typeof pool.curveDelta === "number"
          ? pool.curveDelta
          : Number(pool.curve_delta),
      lpFeeBp:
        typeof pool.lpFeeBp === "number"
          ? pool.lpFeeBp
          : Number(pool.lp_fee_bp),
      sellsideAssetAmount:
        typeof pool.sellsideAssetAmount === "number"
          ? pool.sellsideAssetAmount
          : Number(pool.sellside_asset_amount),
      buysideCreatorRoyaltyBp:
        typeof pool.buysideCreatorRoyaltyBp === "number"
          ? pool.buysideCreatorRoyaltyBp
          : Number(pool.buyside_creator_royalty_bp),
      poolOwner: readString(pool, "poolOwner", "pool_owner") ?? undefined,
    }))
    .filter((pool) => Boolean(pool.poolKey));
};

const fetchMmmPools = async (config: MagicEdenConfig) => {
  const url = resolveMagicEdenUrl(config.baseUrl, config.mmmPoolsPath);
  url.search = new URLSearchParams({
    collectionSymbol: config.collectionSymbol,
    limit: String(DEFAULT_ME_MMM_POOLS_LIMIT),
  }).toString();
  const payload = await fetchJson<unknown>(url, config);
  return parseMmmPools(payload);
};

const selectMmmPoolForListing = (
  pools: MmmPool[],
  listing: PricedFloorListing,
) => {
  const matchesMint = (pool: MmmPool) =>
    Array.isArray(pool.mints) && pool.mints.includes(listing.tokenMint);
  const isSellable = (pool: MmmPool) =>
    pool.poolType !== "buy_sided" && Number(pool.sellsideAssetAmount ?? 0) > 0;
  const matchesSeller = (pool: MmmPool) =>
    !listing.seller || pool.poolOwner === listing.seller;

  return (
    pools.find((pool) => matchesMint(pool) && isSellable(pool) && matchesSeller(pool)) ??
    pools.find((pool) => matchesMint(pool) && isSellable(pool)) ??
    null
  );
};

const readNonNegativeInteger = (value: number | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return BigInt(Math.floor(value));
};

const computeMmmSellPriceLamports = (pool: MmmPool) => {
  const spotPrice = readNonNegativeInteger(pool.spotPrice);
  if (!spotPrice || spotPrice <= 0n) return null;

  const curveType = pool.curveType?.trim().toLowerCase() ?? "";
  const curveDelta = readNonNegativeInteger(pool.curveDelta) ?? 0n;
  const lpFeeBp = readNonNegativeInteger(pool.lpFeeBp) ?? 0n;
  let numerator = spotPrice;
  let denominator = 1n;

  if (curveDelta > 0n) {
    if (curveType === "exp" || curveType === "exponential") {
      numerator *= 10_000n + curveDelta;
      denominator *= 10_000n;
    } else if (curveType === "linear") {
      numerator += curveDelta;
    }
  }

  if (lpFeeBp > 0n) {
    numerator *= 10_000n + lpFeeBp;
    denominator *= 10_000n;
  }

  return numerator / denominator;
};

const buildBuyNowPayload = (buyer: string, listing: PricedFloorListing) => {
  const tokenAta =
    listing.tokenAccount ||
    getAssociatedTokenAddressSync(
      new PublicKey(listing.tokenMint),
      new PublicKey(listing.seller),
      true,
    ).toBase58();

  return {
    buyer,
    seller: listing.seller,
    tokenMint: listing.tokenMint,
    tokenATA: tokenAta,
    auctionHouseAddress: listing.auctionHouse || undefined,
    price: listing.priceSol,
    sellerExpiry: listing.sellerExpiry ?? 0,
  };
};

const requestBuyNowTransaction = async (
  config: MagicEdenConfig,
  buyer: string,
  listing: PricedFloorListing,
) => {
  const url = resolveMagicEdenUrl(config.baseUrl, config.buyNowPath);
  const payload = buildBuyNowPayload(buyer, listing);
  let data: Record<string, unknown>;

  if (config.buyNowMethod === "POST") {
    const headers = buildHeaders(
      config.apiKey,
      config.apiKeyHeader,
      config.apiKeyPrefix,
    );
    headers.set("Content-Type", "application/json");
    const response = await fetchMagicEden(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`MAGIC_EDEN_BUY_${response.status}`);
    data = (await response.json()) as Record<string, unknown>;
  } else {
    const query = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      query.set(key, String(value));
    });
    url.search = query.toString();
    data = await fetchJson<Record<string, unknown>>(url, config);
  }

  return encodeBase64(decodeTransactionPayload(extractTransactionPayload(data)));
};

const requestMmmFulfillSellTransaction = async (
  config: MagicEdenConfig,
  buyer: string,
  listing: PricedFloorListing,
  pools?: MmmPool[],
) => {
  const pool = selectMmmPoolForListing(pools ?? (await fetchMmmPools(config)), listing);
  if (!pool?.poolKey) throw new Error("MMM_POOL_MISSING");
  const buysideCreatorRoyaltyBp = Number(pool.buysideCreatorRoyaltyBp || 0);
  if (buysideCreatorRoyaltyBp > MMM_MAX_SAFE_BUYER_ROYALTY_BPS) {
    throw new Error(
      `HIGH_BUYER_ROYALTY_MMM_POOL ${pool.poolKey} ${buysideCreatorRoyaltyBp}`,
    );
  }
  const maxPaymentLamports =
    computeMmmSellPriceLamports(pool)?.toString() ?? listing.priceLamports;

  const url = resolveMagicEdenUrl(config.baseUrl, config.mmmFulfillSellPath);
  url.search = new URLSearchParams({
    pool: pool.poolKey,
    assetAmount: "1",
    maxPaymentAmount: maxPaymentLamports,
    buysideCreatorRoyaltyBp: String(buysideCreatorRoyaltyBp),
    buyer,
    assetMint: listing.tokenMint,
  }).toString();

  const data = await fetchJson<Record<string, unknown>>(url, config);
  return encodeBase64(decodeTransactionPayload(extractTransactionPayload(data)));
};

const requestPurchaseTransaction = (
  config: MagicEdenConfig,
  buyer: string,
  listing: PricedFloorListing,
  mmmPools?: MmmPool[],
) =>
  isMmmListing(listing)
    ? requestMmmFulfillSellTransaction(config, buyer, listing, mmmPools)
    : requestBuyNowTransaction(config, buyer, listing);

const prepareNftBuyFloor = async ({
  config,
  env,
  buyer,
  quantity,
  intentId,
  expectedTokenMint,
  excludedTokenMints,
  maxTotalSol,
}: {
  config: MagicEdenConfig;
  env: Env;
  buyer: string;
  quantity: number;
  intentId?: string;
  expectedTokenMint?: string | null;
  excludedTokenMints?: Set<string>;
  maxTotalSol?: number | null;
}): Promise<PreparedBuyFloor | Response> => {
  const listingScanLimit = expectedTokenMint
    ? Math.max(quantity, config.listingScanLimit)
    : Math.max(quantity, config.preflightEnabled ? config.listingScanLimit : quantity);
  const listings = await fetchListingCandidatesForBuy(
    config,
    Math.min(MAX_LISTING_SCAN_LIMIT, listingScanLimit),
  );
  const pricedCandidates = listings
    .map(asPricedListing)
    .filter((listing): listing is PricedFloorListing => Boolean(listing));
  const candidateListings = expectedTokenMint
    ? pricedCandidates.filter((listing) => listing.tokenMint === expectedTokenMint)
    : sortPricedListingsByPrice(
        pricedCandidates.filter(
          (listing) => !excludedTokenMints?.has(listing.tokenMint),
        ),
      );

  if (expectedTokenMint && candidateListings.length === 0) {
    return json(
      {
        error: "Floor listing changed before confirmation",
        expectedTokenMint,
        currentTokenMint: pricedCandidates[0]?.tokenMint ?? null,
      },
      { status: 409 },
    );
  }

  if (candidateListings.length < quantity) {
    return json(
      { error: "Not enough buyable floor listings available" },
      { status: 409 },
    );
  }

  const maxTotalLamports = solToLamports(
    Math.min(config.maxBuyTotalSol, maxTotalSol ?? config.maxBuyTotalSol),
  );
  const firstQuantityTotalLamports = candidateListings
    .slice(0, quantity)
    .reduce((total, listing) => total + BigInt(listing.priceLamports), 0n);
  if (firstQuantityTotalLamports > maxTotalLamports) {
    return json(
      {
        error: "Sweep exceeds configured max total",
        maxTotalSol: lamportsToSol(maxTotalLamports),
        estimatedTotalSol: lamportsToSol(firstQuantityTotalLamports),
      },
      { status: 400 },
    );
  }

  const mmmPools = candidateListings.some(isMmmListing)
    ? await fetchMmmPools(config)
    : undefined;
  const blockedMmmPoolKeys = new Set<string>();
  const staleMmmPoolKeys = new Set<string>();
  const highRoyaltyMmmPoolKeys = new Set<string>();
  const staleMmmPoolRejectCounts = new Map<string, number>();
  const transactions: PreparedBuyTransaction[] = [];
  const rejectedCandidates: Array<{
    tokenMint: string;
    priceSol: number;
    source: string | null;
    reason: string;
  }> = [];
  let selectedLamports = 0n;
  let marketplaceBuildAttempts = 0;
  let lowestUnprovenRejectedPriceSol: number | null = null;
  const maxMarketplaceBuildAttempts = Math.min(
    MAX_MARKETPLACE_BUILD_ATTEMPTS,
    Math.max(quantity * 2 + 6, config.preflightScanLimit),
  );

  for (const listing of candidateListings) {
    if (transactions.length >= quantity) break;
    if (
      !expectedTokenMint &&
      lowestUnprovenRejectedPriceSol !== null &&
      listing.priceSol > lowestUnprovenRejectedPriceSol
    ) {
      break;
    }
    if (isUnsupportedMagicEdenBuySource(listing)) {
      rejectedCandidates.push({
        tokenMint: listing.tokenMint,
        priceSol: listing.priceSol,
        source: listing.source,
        reason: `UNSUPPORTED_MARKETPLACE_SOURCE ${listing.source}`,
      });
      lowestUnprovenRejectedPriceSol = Math.min(
        lowestUnprovenRejectedPriceSol ?? listing.priceSol,
        listing.priceSol,
      );
      continue;
    }

    const selectedMmmPool =
      mmmPools && isMmmListing(listing)
        ? selectMmmPoolForListing(mmmPools, listing)
        : null;
    if (selectedMmmPool?.poolKey && blockedMmmPoolKeys.has(selectedMmmPool.poolKey)) {
      const blockedPoolReason = staleMmmPoolKeys.has(selectedMmmPool.poolKey)
        ? `STALE_MMM_POOL ${selectedMmmPool.poolKey}`
        : highRoyaltyMmmPoolKeys.has(selectedMmmPool.poolKey)
          ? `HIGH_BUYER_ROYALTY_MMM_POOL ${selectedMmmPool.poolKey}`
          : `BLOCKED_MMM_POOL ${selectedMmmPool.poolKey}`;
      rejectedCandidates.push({
        tokenMint: listing.tokenMint,
        priceSol: listing.priceSol,
        source: listing.source,
        reason: blockedPoolReason,
      });
      if (
        !staleMmmPoolKeys.has(selectedMmmPool.poolKey) &&
        !highRoyaltyMmmPoolKeys.has(selectedMmmPool.poolKey)
      ) {
        lowestUnprovenRejectedPriceSol = Math.min(
          lowestUnprovenRejectedPriceSol ?? listing.priceSol,
          listing.priceSol,
        );
      }
      continue;
    }

    const nextTotalLamports = selectedLamports + BigInt(listing.priceLamports);
    if (nextTotalLamports > maxTotalLamports) {
      rejectedCandidates.push({
        tokenMint: listing.tokenMint,
        priceSol: listing.priceSol,
        source: listing.source,
        reason: "MAX_TOTAL_EXCEEDED",
      });
      lowestUnprovenRejectedPriceSol = Math.min(
        lowestUnprovenRejectedPriceSol ?? listing.priceSol,
        listing.priceSol,
      );
      continue;
    }
    if (!expectedTokenMint && marketplaceBuildAttempts >= maxMarketplaceBuildAttempts) {
      rejectedCandidates.push({
        tokenMint: listing.tokenMint,
        priceSol: listing.priceSol,
        source: listing.source,
        reason: "MARKETPLACE_BUILD_ATTEMPT_LIMIT_REACHED",
      });
      lowestUnprovenRejectedPriceSol = Math.min(
        lowestUnprovenRejectedPriceSol ?? listing.priceSol,
        listing.priceSol,
      );
      continue;
    }

    let transactionBase64: string;
    let preflight: PreparedBuyTransaction["preflight"] = null;
    try {
      marketplaceBuildAttempts += 1;
      transactionBase64 = await requestPurchaseTransaction(
        config,
        buyer,
        listing,
        selectedMmmPool ? [selectedMmmPool] : mmmPools,
      );
      if (config.preflightEnabled) {
        preflight = await simulateTransactionBase64(env, transactionBase64);
      }
    } catch (error) {
      const message = safeErrorMessage(error);
      const staleMarketplace = isStaleMarketplacePreflightError(message);
      const highRoyaltyMmmPool = isHighRoyaltyMmmPoolError(message);
      const walletFunding = isWalletFundingPreflightError(message);
      if (selectedMmmPool?.poolKey && highRoyaltyMmmPool) {
        blockedMmmPoolKeys.add(selectedMmmPool.poolKey);
        highRoyaltyMmmPoolKeys.add(selectedMmmPool.poolKey);
      }
      if (selectedMmmPool?.poolKey && staleMarketplace) {
        const staleCount =
          (staleMmmPoolRejectCounts.get(selectedMmmPool.poolKey) ?? 0) + 1;
        staleMmmPoolRejectCounts.set(selectedMmmPool.poolKey, staleCount);
        if (staleCount >= STALE_MMM_POOL_RETRY_LIMIT) {
          blockedMmmPoolKeys.add(selectedMmmPool.poolKey);
          staleMmmPoolKeys.add(selectedMmmPool.poolKey);
        }
      }
      rejectedCandidates.push({
        tokenMint: listing.tokenMint,
        priceSol: listing.priceSol,
        source: listing.source,
        reason: message,
      });
      if (walletFunding) {
        return executionErrorResponse(error);
      }
      if (
        !staleMarketplace &&
        !highRoyaltyMmmPool &&
        !walletFunding
      ) {
        lowestUnprovenRejectedPriceSol = Math.min(
          lowestUnprovenRejectedPriceSol ?? listing.priceSol,
          listing.priceSol,
        );
      }
      if (expectedTokenMint) {
        return executionErrorResponse(error);
      }
      continue;
    }

    transactions.push({
      tokenMint: listing.tokenMint,
      seller: listing.seller,
      tokenAccount: listing.tokenAccount,
      auctionHouse: listing.auctionHouse,
      source: listing.source,
      tokenName: listing.tokenName,
      image: listing.image,
      priceLamports: listing.priceLamports,
      priceSol: listing.priceSol,
      transactionBase64,
      preflight,
    });
    selectedLamports = nextTotalLamports;
  }

  const selectedPrices = transactions.map((transaction) => transaction.priceSol);
  const highestSelectedPriceSol = selectedPrices.length
    ? Math.max(...selectedPrices)
    : null;
  const lowestSelectedPriceSol = selectedPrices.length
    ? Math.min(...selectedPrices)
    : null;
  const lowerRejectedCandidates =
    !expectedTokenMint && highestSelectedPriceSol !== null
      ? rejectedCandidates.filter(
          (candidate) =>
          candidate.priceSol < highestSelectedPriceSol &&
            !isWalletFundingPreflightError(candidate.reason),
        )
      : [];
  const lowestBlockedPriceSol = lowerRejectedCandidates.length
    ? Math.min(...lowerRejectedCandidates.map((candidate) => candidate.priceSol))
    : lowestUnprovenRejectedPriceSol;
  if (!expectedTokenMint && lowerRejectedCandidates.length > 0) {
    const allLowerRejectedStale = lowerRejectedCandidates.every((candidate) =>
      isStaleMarketplacePreflightError(candidate.reason),
    );
    return json(
      {
        error: allLowerRejectedStale
          ? "Magic Eden floor listings are stale; no higher-price fallback was staged"
          : "Lower floor listings are not executable",
        code: "LOWER_FLOOR_NOT_EXECUTABLE",
        layer: "marketplace",
        selectedPriceSol: lowestSelectedPriceSol,
        lowestBlockedPriceSol,
        rejected: rejectedCandidates.slice(0, 5),
        rejectedSummary: summarizeRejectedCandidates(rejectedCandidates),
      },
      { status: 409 },
    );
  }

  if (transactions.length < quantity) {
    const nonStaleRejectedCandidates = rejectedCandidates.filter(
      (candidate) => !isStaleMarketplacePreflightError(candidate.reason),
    );
    if (
      nonStaleRejectedCandidates.length > 0 &&
      nonStaleRejectedCandidates.every((candidate) =>
        isWalletFundingPreflightError(candidate.reason),
      )
    ) {
      return executionErrorResponse(
        new Error(nonStaleRejectedCandidates[0].reason),
      );
    }
    if (
      rejectedCandidates.length > 0 &&
      rejectedCandidates.every((candidate) =>
        isWalletFundingPreflightError(candidate.reason),
      )
    ) {
      return executionErrorResponse(new Error(rejectedCandidates[0].reason));
    }
    const marketplaceBuildFailure = rejectedCandidates.find((candidate) => {
      const normalized = candidate.reason.toLowerCase();
      if (normalized.includes("marketplace_build_attempt_limit")) return false;
      return (
        normalized.includes("magic_eden") ||
        normalized.includes("marketplace_build") ||
        normalized.includes("too many requests") ||
        normalized.includes("rate limited")
      );
    });
    if (marketplaceBuildFailure) {
      return executionErrorResponse(new Error(marketplaceBuildFailure.reason));
    }
    if (
      rejectedCandidates.some((candidate) =>
        isStaleMarketplacePreflightError(candidate.reason),
      )
    ) {
      return json(
        {
          error: "Marketplace floor listings are stale",
          code: "STALE_MARKETPLACE_LISTINGS",
          layer: "marketplace",
          rejected: rejectedCandidates.slice(0, 5),
          rejectedSummary: summarizeRejectedCandidates(rejectedCandidates),
        },
        { status: 409 },
      );
    }
    return json(
      {
        error: "No executable floor listings available",
        code: "NO_EXECUTABLE_LISTINGS",
        layer: "chain",
        rejected: rejectedCandidates.slice(0, 5),
        rejectedSummary: summarizeRejectedCandidates(rejectedCandidates),
      },
      { status: 409 },
    );
  }

  return {
    source: "magic_eden",
    action: "buy-floor",
    buyer,
    quantity,
    requestedQuantity: quantity,
    intentId: typeof intentId === "string" ? intentId.slice(0, 80) : null,
    collectionSymbol: config.collectionSymbol,
    estimatedTotalLamports: selectedLamports.toString(),
    estimatedTotalSol: lamportsToSol(selectedLamports),
    transactions,
    ...(rejectedCandidates.length
      ? {
          rejected: rejectedCandidates.slice(0, 5),
          rejectedSummary: summarizeRejectedCandidates(rejectedCandidates),
        }
      : {}),
    updatedAt: new Date().toISOString(),
  };
};

export async function getNftFloor(
  request: Request,
  env: Env,
): Promise<Response> {
  const config = getMagicEdenConfig(env);
  const listingLimit = readListingLimit(request);

  try {
    const { stats, listings } = await fetchFloorPayload(config, listingLimit);
    const floorLamports = parseLamports(
      (stats.floorPrice as number | string | undefined) ??
        (stats.floor_price as number | string | undefined) ??
        (stats.floorPriceLamports as number | string | undefined) ??
        (stats.floor_price_lamports as number | string | undefined),
      config.floorUnit,
    );

    return json(
      {
        collectionSymbol: config.collectionSymbol,
        source: "magic_eden",
        floorLamports: floorLamports?.toString() ?? null,
        floorSol: lamportsToSol(floorLamports),
        listedCount:
          typeof stats.listedCount === "number"
            ? stats.listedCount
            : stats.listed_count ?? null,
        avgPrice24hLamports:
          stats.avgPrice24hr !== undefined && stats.avgPrice24hr !== null
            ? String(stats.avgPrice24hr)
            : null,
        volumeAllLamports:
          stats.volumeAll !== undefined && stats.volumeAll !== null
            ? String(stats.volumeAll)
            : null,
        lowestListing: listings[0] ?? null,
        listings,
        listingLimit,
        purchase: {
          userWalletExecutionEnabled: true,
          maxQuantity: config.maxBuyQuantity,
          maxTotalSol: config.maxBuyTotalSol,
        },
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      },
    );
  } catch (error) {
    console.error("[nfts] Failed to fetch Magic Eden floor", error);
    return json(
      { error: "NFT market data temporarily unavailable" },
      { status: 502 },
    );
  }
}

export async function postNftBuyFloor(
  request: Request,
  env: Env,
): Promise<Response> {
  const config = getMagicEdenConfig(env);
  let body: { buyer?: string; quantity?: number | string; intentId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let buyer: string;
  try {
    buyer = new PublicKey(String(body.buyer ?? "")).toBase58();
  } catch {
    return json({ error: "Invalid buyer wallet" }, { status: 400 });
  }

  const quantity = readBuyQuantity(body.quantity, config);
  const expectedTokenMint = normalizeOptionalMint(body.expectedTokenMint);
  if (expectedTokenMint && quantity !== 1) {
    return json(
      { error: "Exact mint quotes must use quantity 1" },
      { status: 400 },
    );
  }
  try {
    const prepared = await prepareNftBuyFloor({
      config,
      env,
      buyer,
      quantity,
      intentId: body.intentId,
      expectedTokenMint,
    });
    if (prepared instanceof Response) return prepared;

    return json(
      prepared,
      {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      },
    );
  } catch (error) {
    console.error("[nfts] Failed to prepare Magic Eden buy", error);
    return json(
      { error: "NFT purchase transaction temporarily unavailable" },
      { status: 502 },
    );
  }
}

export async function postNftExecuteFloor(
  request: Request,
  env: Env,
  deps: ExecuteDeps = {},
): Promise<Response> {
  const accountConfig = getAccountConfig(env);
  if (!accountConfig.bot.executionEnabled) {
    return json(
      {
        error: "Telegram execution is not enabled",
        missing: {
          botTradingEnabled: accountConfig.bot.tradingEnabled,
          botExecutionEnabled: parseEnvBool(env.FROGX_BOT_EXECUTION_ENABLED),
          botApiAuthConfigured: accountConfig.bot.apiAuthConfigured,
          privyAppSecretConfigured: accountConfig.privy.appSecretConfigured,
          privySignerConfigured: accountConfig.privy.signerConfigured,
        },
      },
      { status: 503 },
    );
  }
  if (!(await isAuthorizedBot(request, env))) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = getMagicEdenConfig(env);
  let body: TelegramExecuteBody;
  try {
    body = (await request.json()) as TelegramExecuteBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const telegramUserId = String(body.telegramUserId ?? "").trim();
  if (!telegramUserId) {
    return json({ error: "Telegram user id is required" }, { status: 400 });
  }

  const quantity = readBuyQuantity(body.quantity, config);
  const expectedTokenMint = normalizeOptionalMint(body.expectedTokenMint);
  const maxTotalSol = parseMaybePositiveNumber(body.maxTotalSol);

  try {
    const client = (deps.createPrivyClient ?? createPrivyClient)(env);
    const user = await client.users().getByTelegramUserID({
      telegram_user_id: telegramUserId,
    });
    const wallet = selectDelegatedPrivySolanaWallet(user);
    if (!wallet?.id || !wallet.address) {
      return json(
        {
          error:
            "Telegram-linked Privy user does not have a delegated embedded Solana wallet",
        },
        { status: 409 },
      );
    }

    const buyer = new PublicKey(wallet.address).toBase58();
    if (expectedTokenMint && quantity !== 1) {
      return json(
        { error: "Exact mint confirmations must use quantity 1" },
        { status: 400 },
      );
    }
    const authorizationKey = env.PRIVY_AUTHORIZATION_PRIVATE_KEY?.trim();
    if (!authorizationKey) {
      return json({ error: "Privy authorization key missing" }, { status: 503 });
    }
    const authorization_context: AuthorizationContext = {
      authorization_private_keys: [authorizationKey],
    };

    const caip2 = getSolanaCaip2(env);
    const confirmTransaction =
      deps.confirmTransaction ?? waitForSubmittedTransaction;
    const approvedMaxLamports = solToLamports(
      Math.min(config.maxBuyTotalSol, maxTotalSol ?? config.maxBuyTotalSol),
    );
    const telegramUsername =
      typeof body.telegramUsername === "string"
        ? body.telegramUsername.slice(0, 64)
        : null;
    const submitted: SubmittedNftTransaction[] = [];
    const failed: Array<Record<string, unknown>> = [];
    const excludedExecutionMints = new Set<string>();
    const sweepItemDelayMs = readTelegramSweepItemDelayMs(env);
    let submittedLamports = 0n;
    let responseIntentId: string | null =
      typeof body.intentId === "string" ? body.intentId.slice(0, 80) : null;

    for (let index = 0; index < quantity; index += 1) {
      if (index > 0 && sweepItemDelayMs > 0) {
        await sleep(sweepItemDelayMs);
      }
      const remainingLamports = approvedMaxLamports - submittedLamports;
      if (remainingLamports <= 0n) {
        const stop: ExecutionStop = {
          status: 400,
          error: "Sweep exceeds configured max total",
          code: "MAX_TOTAL_EXCEEDED",
          layer: "marketplace",
          detail: "Approved max total was consumed before the sweep completed",
        };
        if (submitted.length === 0) {
          return json(
            {
              error: stop.error,
              code: stop.code,
              layer: stop.layer,
              detail: stop.detail,
            },
            { status: stop.status },
          );
        }
        return buildTelegramExecutionResponse({
          buyer,
          telegramUserId,
          telegramUsername,
          requestedQuantity: quantity,
          intentId: responseIntentId,
          estimatedTotalLamports: submittedLamports,
          submitted,
          failed,
          stop,
        });
      }

      const prepared = await prepareNftBuyFloor({
        config,
        env,
        buyer,
        quantity: 1,
        intentId: body.intentId,
        expectedTokenMint: index === 0 ? expectedTokenMint : null,
        excludedTokenMints: excludedExecutionMints,
        maxTotalSol: lamportsToSol(remainingLamports),
      });
      if (prepared instanceof Response) {
        if (submitted.length === 0) return prepared;
        return buildTelegramExecutionResponse({
          buyer,
          telegramUserId,
          telegramUsername,
          requestedQuantity: quantity,
          intentId: responseIntentId,
          estimatedTotalLamports: submittedLamports,
          submitted,
          failed,
          stop: await responseExecutionStop(prepared),
        });
      }

      responseIntentId = prepared.intentId;
      prepared.rejected?.forEach((candidate) => {
        excludedExecutionMints.add(candidate.tokenMint);
      });
      const tx = prepared.transactions[0];
      if (!tx) {
        const stop: ExecutionStop = {
          status: 409,
          error: "No executable floor listings available",
          code: "NO_EXECUTABLE_LISTINGS",
          layer: "chain",
          detail: "Magic Eden did not return a buy transaction",
        };
        if (submitted.length === 0) {
          return json(
            {
              error: stop.error,
              code: stop.code,
              layer: stop.layer,
              detail: stop.detail,
            },
            { status: stop.status },
          );
        }
        return buildTelegramExecutionResponse({
          buyer,
          telegramUserId,
          telegramUsername,
          requestedQuantity: quantity,
          intentId: responseIntentId,
          estimatedTotalLamports: submittedLamports,
          submitted,
          failed,
          stop,
        });
      }

      const balanceLamports = await (
        deps.getBalanceLamports ?? getWalletBalanceLamports
      )(env, buyer);
      const requiredLamports =
        BigInt(tx.priceLamports) + TELEGRAM_BUY_FEE_BUFFER_LAMPORTS;
      if (balanceLamports !== null && balanceLamports < requiredLamports) {
        const stop: ExecutionStop = {
          status: 402,
          error: "Insufficient SOL in FTX trade wallet",
          code: "INSUFFICIENT_SOL",
          layer: "wallet",
          detail: `Balance ${lamportsToSol(balanceLamports)} SOL, required ${lamportsToSol(requiredLamports)} SOL`,
        };
        if (submitted.length === 0) {
          return json(
            {
              error: stop.error,
              balanceSol: lamportsToSol(balanceLamports),
              requiredSol: lamportsToSol(requiredLamports),
              estimatedTotalSol: prepared.estimatedTotalSol,
            },
            { status: stop.status },
          );
        }
        return buildTelegramExecutionResponse({
          buyer,
          telegramUserId,
          telegramUsername,
          requestedQuantity: quantity,
          intentId: responseIntentId,
          estimatedTotalLamports: submittedLamports,
          submitted,
          failed,
          stop,
        });
      }

      let result: { hash: string; caip2: string; transaction_id?: string };
      try {
        result = await client.wallets().solana().signAndSendTransaction(
          wallet.id,
          {
            caip2,
            transaction: tx.transactionBase64,
            authorization_context,
            idempotency_key: [
              "ribbot-buy-floor",
              telegramUserId,
              prepared.intentId ?? "no-intent",
              String(index + 1),
              tx.tokenMint,
            ].join(":"),
          },
        );
      } catch (error) {
        const stop = errorExecutionStop(error);
        failed.push({
          tokenMint: tx.tokenMint,
          priceSol: tx.priceSol,
          code: stop.code,
          layer: stop.layer,
          detail: stop.detail,
        });
        if (submitted.length === 0) throw error;
        return buildTelegramExecutionResponse({
          buyer,
          telegramUserId,
          telegramUsername,
          requestedQuantity: quantity,
          intentId: responseIntentId,
          estimatedTotalLamports: submittedLamports,
          submitted,
          failed,
          stop,
        });
      }

      let confirmation: SubmittedTransactionConfirmation;
      try {
        confirmation = await confirmTransaction(env, result.hash);
      } catch (error) {
        const stop = errorExecutionStop(error);
        failed.push({
          tokenMint: tx.tokenMint,
          priceSol: tx.priceSol,
          hash: result.hash,
          code: stop.code,
          layer: stop.layer,
          detail: stop.detail,
        });
        if (submitted.length === 0) throw error;
        return buildTelegramExecutionResponse({
          buyer,
          telegramUserId,
          telegramUsername,
          requestedQuantity: quantity,
          intentId: responseIntentId,
          estimatedTotalLamports: submittedLamports,
          submitted,
          failed,
          stop,
        });
      }

      submitted.push({
        tokenMint: tx.tokenMint,
        priceSol: tx.priceSol,
        hash: result.hash,
        caip2: result.caip2,
        transactionId: result.transaction_id ?? null,
        confirmed: confirmation.confirmed,
        confirmation,
      });
      excludedExecutionMints.add(tx.tokenMint);
      submittedLamports += BigInt(tx.priceLamports);

      if (!confirmation.confirmed) {
        return buildTelegramExecutionResponse({
          buyer,
          telegramUserId,
          telegramUsername,
          requestedQuantity: quantity,
          intentId: responseIntentId,
          estimatedTotalLamports: submittedLamports,
          submitted,
          failed,
          stop: pendingExecutionStop(confirmation),
        });
      }
    }

    return buildTelegramExecutionResponse({
      buyer,
      telegramUserId,
      telegramUsername,
      requestedQuantity: quantity,
      intentId: responseIntentId,
      estimatedTotalLamports: submittedLamports,
      submitted,
      failed,
    });
  } catch (error) {
    const classified = classifyExecutionError(error);
    console.error(
      "[nfts] Failed to execute Telegram NFT buy",
      {
        code: classified.code,
        layer: classified.layer,
        detail: classified.detail,
      },
    );
    return executionErrorResponse(error);
  }
}
