import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

import type { Env } from "./env";
import {
  authorizeTradingBotRequest,
  getManagedPrivyWallet,
  getManagedSolanaTransactionStatus,
  managedSolanaExecutionMissingRequirements,
  PrivyWalletRpcError,
  privyRpcFailureWasNotBroadcast,
  signAndSendManagedSolanaTransaction,
} from "./tradingBot";
import { fetchMagicEdenTopOffer } from "./magicEdenSell";

const MAGIC_EDEN_MMM_PROGRAM =
  "mmm3XBJg5gk8XJxEKBvdgptZz6SgK4tXvn36sodowMc";
const MAGIC_EDEN_V2_PROGRAM =
  "M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K";
const DEFAULT_ME_BASE_URL = "https://api-mainnet.magiceden.dev/v2";
const DEFAULT_ME_COLLECTION_SYMBOL = "solana_business_frogs";
const DEFAULT_ME_LISTINGS_PATH = "/collections/{symbol}/listings";
const DEFAULT_ME_LISTINGS_QUERY =
  "offset=0&limit=100&sort=listPrice&sort_direction=asc";
const DEFAULT_ME_BUY_NOW_PATH = "/instructions/buy_now";
const DEFAULT_ME_MMM_POOLS_PATH = "/mmm/pools";
const DEFAULT_ME_MMM_FULFILL_SELL_PATH =
  "/instructions/mmm/sol-fulfill-sell";
const EXECUTABLE_FLOOR_LISTING_LIMIT = 50;
const EXECUTABLE_FLOOR_PREFLIGHT_LIMIT = 20;
const MAX_EXCLUDED_SWEEP_MINTS = 10;
const MMM_MAX_SAFE_BUYER_ROYALTY_BPS = 1_000;
const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TELEGRAM_USER_ID_PATTERN = /^\d{1,20}$/;
const EXECUTION_ID_PATTERN = /^[A-Za-z0-9:_-]{1,80}$/;
const LAMPORTS_PATTERN = /^\d{1,20}$/;
const SOLANA_MAINNET_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

type MagicEdenConfig = {
  baseUrl: string;
  apiKey: string | null;
  apiKeyHeader: string;
  apiKeyPrefix: string | null;
  collectionSymbol: string;
  listingsPath: string;
  listingsQuery: string;
  buyNowPath: string;
};

type FloorListing = {
  mint: string;
  name: string | null;
  image: string | null;
  priceLamports: string;
  priceSol: number;
  seller: string | null;
  tokenAccount: string | null;
  auctionHouse: string | null;
  source: string | null;
};

type MmmPool = {
  poolKey?: unknown;
  pool_key?: unknown;
  poolType?: unknown;
  pool_type?: unknown;
  mints?: unknown;
  sellsideAssetAmount?: unknown;
  sellside_asset_amount?: unknown;
  buysideCreatorRoyaltyBp?: unknown;
  buyside_creator_royalty_bp?: unknown;
  poolOwner?: unknown;
  pool_owner?: unknown;
  spotPrice?: unknown;
  spot_price?: unknown;
  curveType?: unknown;
  curve_type?: unknown;
  curveDelta?: unknown;
  curve_delta?: unknown;
  lpFeeBp?: unknown;
  lp_fee_bp?: unknown;
};

class BuyRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly candidateUnavailable = false,
  ) {
    super(message);
  }
}

const json = (data: unknown, init?: ResponseInit) =>
  Response.json(data, {
    ...init,
    headers: { "Cache-Control": "no-store", ...init?.headers },
  });

const stringValue = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const imageUrl = (value: unknown): string | null => {
  const raw = stringValue(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

const enabled = (value?: string) =>
  ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");

const validSolanaAddress = (value: string) => {
  if (!SOLANA_ADDRESS_PATTERN.test(value)) return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
};

const resolveConfig = (env: Env): MagicEdenConfig => {
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
    listingsPath: env.ME_LISTINGS_PATH?.trim() || DEFAULT_ME_LISTINGS_PATH,
    listingsQuery: env.ME_LISTINGS_QUERY?.trim() || DEFAULT_ME_LISTINGS_QUERY,
    buyNowPath: env.ME_BUY_NOW_PATH?.trim() || DEFAULT_ME_BUY_NOW_PATH,
  };
};

const resolveUrl = (baseUrl: string, path: string) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ""), normalizedBase);
};

const headersFor = (config: MagicEdenConfig) => {
  const headers = new Headers({
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
  });
  if (config.apiKey) {
    headers.set(
      config.apiKeyHeader,
      config.apiKeyPrefix
        ? `${config.apiKeyPrefix} ${config.apiKey}`
        : config.apiKey,
    );
  }
  return headers;
};

const readMagicEdenJson = async <T>(
  url: URL,
  config: MagicEdenConfig,
  listingSpecific = false,
) => {
  const response = await fetch(url.toString(), { headers: headersFor(config) });
  if (!response.ok) {
    if (listingSpecific && [400, 404, 409, 410, 422].includes(response.status)) {
      throw new BuyRequestError(
        409,
        "LISTING_CHANGED",
        "The Frog listing changed before purchase",
        true,
      );
    }
    throw new BuyRequestError(
      response.status === 401 || response.status === 403 ? 503 : 502,
      "MAGIC_EDEN_UNAVAILABLE",
      "Magic Eden listings are temporarily unavailable",
    );
  }
  return (await response.json()) as T;
};

const lamportsFromListing = (listing: Record<string, unknown>) => {
  const rawLamports =
    listing.priceLamports ??
    listing.price_lamports ??
    (listing.priceInfo as { solPrice?: { rawAmount?: unknown } } | undefined)
      ?.solPrice?.rawAmount ??
    (listing.price_info as { solPrice?: { rawAmount?: unknown } } | undefined)
      ?.solPrice?.rawAmount;
  try {
    if (rawLamports !== undefined && rawLamports !== null) {
      const value = BigInt(String(rawLamports));
      return value > 0n ? value : null;
    }
    const rawPrice =
      listing.price ??
      (listing.price_info as { price?: unknown } | undefined)?.price ??
      (listing.priceInfo as { price?: unknown } | undefined)?.price;
    const priceSol = Number(rawPrice);
    if (!Number.isFinite(priceSol) || priceSol <= 0) return null;
    return BigInt(Math.round(priceSol * 1_000_000_000));
  } catch {
    return null;
  }
};

const parseListing = (value: unknown): FloorListing | null => {
  if (!value || typeof value !== "object") return null;
  const listing = value as Record<string, unknown>;
  const token =
    listing.token && typeof listing.token === "object"
      ? (listing.token as Record<string, unknown>)
      : null;
  const priceLamports = lamportsFromListing(listing);
  const mint = stringValue(
    listing.tokenMint ??
      listing.mint ??
      token?.mint ??
      token?.mintAddress,
  );
  if (!priceLamports || !mint || !validSolanaAddress(mint)) return null;
  const seller = stringValue(listing.seller ?? listing.sellerAddress);
  const tokenAccount = stringValue(
    listing.tokenAccount ??
      listing.tokenAccountAddress ??
      (listing.token as { tokenAccount?: unknown } | undefined)?.tokenAccount,
  );
  const auctionHouse = stringValue(
    listing.auctionHouseAddress ?? listing.auctionHouse,
  );
  const source = stringValue(
    listing.listingSource ?? listing.listing_source ?? listing.listingType,
  );
  return {
    mint,
    name: stringValue(listing.name ?? token?.name),
    image: imageUrl(listing.image ?? token?.image),
    priceLamports: priceLamports.toString(),
    priceSol: Number(priceLamports) / 1_000_000_000,
    seller,
    tokenAccount,
    auctionHouse,
    source,
  };
};

const frogListingCandidates = (payload: unknown): FloorListing[] => {
  const record = payload && typeof payload === "object"
    ? (payload as { listings?: unknown; results?: unknown })
    : null;
  const values = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.listings)
      ? record.listings
      : Array.isArray(record?.results)
        ? record.results
        : [];
  const seenMints = new Set<string>();
  return values
    .map(parseListing)
    .filter((listing): listing is FloorListing => listing !== null)
    .filter((listing) => {
      if (seenMints.has(listing.mint)) return false;
      seenMints.add(listing.mint);
      return true;
    })
    .sort((left, right) =>
      BigInt(left.priceLamports) < BigInt(right.priceLamports) ? -1 :
      BigInt(left.priceLamports) > BigInt(right.priceLamports) ? 1 : 0,
    );
};

export const selectLowestFrogListing = (payload: unknown): FloorListing => {
  const listings = frogListingCandidates(payload);
  if (!listings[0]) {
    throw new BuyRequestError(404, "NO_LISTINGS", "No Frog is listed for sale");
  }
  return listings[0];
};

const fetchFloorCandidates = async (env: Env) => {
  const config = resolveConfig(env);
  const url = resolveUrl(
    config.baseUrl,
    config.listingsPath.replace("{symbol}", config.collectionSymbol),
  );
  url.search = config.listingsQuery;
  url.searchParams.set("offset", "0");
  url.searchParams.set("limit", String(EXECUTABLE_FLOOR_LISTING_LIMIT));
  url.searchParams.set("sort", "listPrice");
  url.searchParams.set("sort_direction", "asc");
  url.searchParams.set("listingAggMode", "false");
  const listings = frogListingCandidates(
    await readMagicEdenJson<unknown>(url, config),
  ).slice(0, EXECUTABLE_FLOOR_LISTING_LIMIT);
  if (!listings[0]) {
    throw new BuyRequestError(404, "NO_LISTINGS", "No Frog is listed for sale");
  }
  return listings;
};

const integerValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

const fetchMmmPools = async (env: Env) => {
  const config = resolveConfig(env);
  const url = resolveUrl(config.baseUrl, DEFAULT_ME_MMM_POOLS_PATH);
  url.search = new URLSearchParams({
    collectionSymbol: config.collectionSymbol,
    limit: "500",
  }).toString();
  const data = await readMagicEdenJson<unknown>(url, config);
  if (Array.isArray(data)) return data as MmmPool[];
  if (data && typeof data === "object") {
    const record = data as { results?: unknown; pools?: unknown };
    if (Array.isArray(record.results)) return record.results as MmmPool[];
    if (Array.isArray(record.pools)) return record.pools as MmmPool[];
  }
  return [];
};

const selectMmmPool = (pools: MmmPool[], listing: FloorListing) => {
  const matches = pools.filter((pool) => {
    const mints = Array.isArray(pool.mints) ? pool.mints : [];
    return (
      mints.includes(listing.mint) &&
      stringValue(pool.poolType ?? pool.pool_type) !== "buy_sided" &&
      (integerValue(pool.sellsideAssetAmount ?? pool.sellside_asset_amount) ?? 0) > 0 &&
      validSolanaAddress(stringValue(pool.poolKey ?? pool.pool_key) ?? "")
    );
  });
  return (
    matches.find(
      (pool) => stringValue(pool.poolOwner ?? pool.pool_owner) === listing.seller,
    ) ??
    matches[0] ??
    null
  );
};

const nonNegativeInteger = (value: unknown) => {
  try {
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value) || value < 0) return null;
      return BigInt(value);
    }
    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      return BigInt(value.trim());
    }
  } catch {
    return null;
  }
  return null;
};

const computeMmmSellPriceLamports = (pool: MmmPool) => {
  const spotPrice = nonNegativeInteger(pool.spotPrice ?? pool.spot_price);
  if (!spotPrice || spotPrice <= 0n) return null;

  const curveType = stringValue(pool.curveType ?? pool.curve_type)?.toLowerCase();
  const curveDelta = nonNegativeInteger(pool.curveDelta ?? pool.curve_delta) ?? 0n;
  const lpFeeBp = nonNegativeInteger(pool.lpFeeBp ?? pool.lp_fee_bp) ?? 0n;
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

const withMmmPoolPrice = (listing: FloorListing, pool: MmmPool) => {
  const priceLamports = computeMmmSellPriceLamports(pool);
  if (!priceLamports) return listing;
  return {
    ...listing,
    priceLamports: priceLamports.toString(),
    priceSol: Number(priceLamports) / 1_000_000_000,
  };
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const bytesToBase64 = (value: Uint8Array) => {
  let binary = "";
  for (let offset = 0; offset < value.length; offset += 8_192) {
    binary += String.fromCharCode(...value.subarray(offset, offset + 8_192));
  }
  return btoa(binary);
};

type SolanaSimulationResponse = {
  error?: { code?: unknown; message?: unknown };
  result?: {
    context?: { slot?: unknown };
    value?: { err?: unknown; logs?: unknown };
  };
};

const resolveRpcUrl = (env: Env) =>
  env.SOLANA_RPC_URL?.trim() || env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || "";

const simulationFailureKind = (err: unknown, logs: unknown): string => {
  const normalizedError = (() => {
    try { return JSON.stringify(err).toLowerCase(); }
    catch { return String(err).toLowerCase(); }
  })();
  const normalizedLogs = Array.isArray(logs)
    ? logs.filter((value): value is string => typeof value === "string").join(" ").toLowerCase()
    : "";
  if (
    normalizedLogs.includes("insufficient funds") ||
    normalizedLogs.includes("insufficient lamports") ||
    normalizedLogs.includes("attempt to debit") ||
    normalizedLogs.includes("accountnotfound") ||
    normalizedLogs.includes("account not found") ||
    normalizedError.includes("accountnotfound")
  ) {
    return "insufficient_funds";
  }
  if (
    normalizedLogs.includes("accountnotinitialized") ||
    normalizedLogs.includes("account not initialized") ||
    normalizedLogs.includes("sell_state") ||
    normalizedError.includes('"custom":3012')
  ) {
    return "stale_listing";
  }
  if (
    err === "BlockhashNotFound" ||
    (err &&
      typeof err === "object" &&
      !Array.isArray(err) &&
      "BlockhashNotFound" in err)
  ) {
    return "blockhash_not_found";
  }
  return "instruction_rejected";
};

const simulatePurchaseTransaction = async (
  env: Env,
  transactionBase64: string,
) => {
  const rpcUrl = resolveRpcUrl(env);
  if (!rpcUrl) {
    throw new BuyRequestError(
      503,
      "PURCHASE_PREFLIGHT_UNAVAILABLE",
      "Solana purchase safety checks are temporarily unavailable",
    );
  }

  let response: Response;
  try {
    response = await fetch(rpcUrl, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "frogx-me-buy-preflight",
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
  } catch {
    throw new BuyRequestError(
      503,
      "PURCHASE_PREFLIGHT_UNAVAILABLE",
      "Solana purchase safety checks are temporarily unavailable",
    );
  }

  const payload = (await response.json().catch(() => null)) as SolanaSimulationResponse | null;
  if (!response.ok || !payload || payload.error || !payload.result?.value) {
    console.error("[me-buy] Solana purchase preflight unavailable", {
      status: response.status,
      rpcError: Boolean(payload?.error),
    });
    throw new BuyRequestError(
      503,
      "PURCHASE_PREFLIGHT_UNAVAILABLE",
      "Solana purchase safety checks are temporarily unavailable",
    );
  }

  const { err, logs } = payload.result.value;
  if (err) {
    const failureKind = simulationFailureKind(err, logs);
    console.warn("[me-buy] Solana purchase preflight rejected", { failureKind });
    throw new BuyRequestError(
      failureKind === "insufficient_funds" ? 402 : 409,
      failureKind === "insufficient_funds"
        ? "INSUFFICIENT_SOL"
        : "PURCHASE_PREFLIGHT_REJECTED",
      failureKind === "insufficient_funds"
        ? "Your Spot & NFT Wallet needs more SOL for this Frog and network fees"
        : "The pictured floor Frog cannot be bought right now. Open a new floor quote",
      failureKind === "stale_listing",
    );
  }
};

const transactionPayloads = (value: unknown): Uint8Array[] => {
  if (typeof value === "string" && value.trim()) {
    const payloads: Uint8Array[] = [];
    if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(value)) {
      try { payloads.push(bs58.decode(value)); } catch { /* try base64 */ }
    }
    try { payloads.push(base64ToBytes(value)); } catch { /* reject below */ }
    return payloads;
  }
  if (value && typeof value === "object" && Array.isArray((value as { data?: unknown }).data)) {
    return [Uint8Array.from((value as { data: number[] }).data)];
  }
  return [];
};

const validatePurchaseTransaction = (
  transaction: Uint8Array,
  buyer: string,
  listing: FloorListing,
  marketplaceProgram: string,
  pool?: string,
) => {
  const required = [buyer, listing.mint, marketplaceProgram];
  if (listing.seller) required.push(listing.seller);
  if (listing.auctionHouse) required.push(listing.auctionHouse);
  if (pool) required.push(pool);
  const validKeys = (keys: string[], signerCount: number) =>
    keys[0] === buyer &&
    keys.slice(0, signerCount).includes(buyer) &&
    required.every((key) => keys.includes(key));
  try {
    const versioned = VersionedTransaction.deserialize(transaction);
    return validKeys(
      versioned.message.staticAccountKeys.map((key) => key.toBase58()),
      versioned.message.header.numRequiredSignatures,
    );
  } catch {
    try {
      const message = Transaction.from(transaction).compileMessage();
      return validKeys(
        message.accountKeys.map((key) => key.toBase58()),
        message.header.numRequiredSignatures,
      );
    } catch {
      return false;
    }
  }
};

const extractTransaction = (
  response: Record<string, unknown>,
  buyer: string,
  listing: FloorListing,
  marketplaceProgram: string,
  pool?: string,
) => {
  const candidates = [
    response.txSigned,
    response.tx,
    response.transaction,
    response.txBase64,
    response.transactionBase64,
    (response.data as { tx?: unknown } | undefined)?.tx,
  ];
  for (const candidate of candidates) {
    for (const payload of transactionPayloads(candidate)) {
      if (validatePurchaseTransaction(payload, buyer, listing, marketplaceProgram, pool)) {
        return payload;
      }
    }
  }
  throw new BuyRequestError(
    502,
    "INVALID_BUY_TRANSACTION",
    "Magic Eden returned an invalid purchase transaction",
  );
};

const requestPurchaseTransaction = async (
  env: Env,
  buyer: string,
  listing: FloorListing,
  mmmPools?: MmmPool[],
  selectedMmmPool?: MmmPool,
) => {
  const config = resolveConfig(env);
  if (!config.apiKey) {
    throw new BuyRequestError(503, "MAGIC_EDEN_UNAVAILABLE", "Magic Eden trading is not configured");
  }
  const listingSource = listing.source?.trim().toLowerCase() ?? "";
  if (listingSource.startsWith("tensor")) {
    throw new BuyRequestError(
      409,
      "UNSUPPORTED_LISTING_SOURCE",
      "The lowest Frog uses a listing source this purchase route cannot verify",
    );
  }
  const isMmm = listingSource === "mmm";
  if (isMmm) {
    const pool =
      selectedMmmPool ??
      selectMmmPool(mmmPools ?? (await fetchMmmPools(env)), listing);
    const poolKey = stringValue(pool?.poolKey ?? pool?.pool_key);
    if (!pool || !poolKey) {
      throw new BuyRequestError(
        409,
        "LISTING_CHANGED",
        "The Frog listing changed before purchase",
        true,
      );
    }
    const buyerRoyaltyBps = integerValue(
      pool.buysideCreatorRoyaltyBp ?? pool.buyside_creator_royalty_bp,
    ) ?? 0;
    if (buyerRoyaltyBps > MMM_MAX_SAFE_BUYER_ROYALTY_BPS) {
      throw new BuyRequestError(
        409,
        "UNSAFE_BUYER_ROYALTY",
        "The Frog listing has an unsafe buyer royalty",
        true,
      );
    }
    const url = resolveUrl(config.baseUrl, DEFAULT_ME_MMM_FULFILL_SELL_PATH);
    const maxPaymentLamports =
      computeMmmSellPriceLamports(pool)?.toString() ?? listing.priceLamports;
    url.search = new URLSearchParams({
      pool: poolKey,
      assetAmount: "1",
      maxPaymentAmount: maxPaymentLamports,
      buysideCreatorRoyaltyBp: String(buyerRoyaltyBps),
      buyer,
      assetMint: listing.mint,
    }).toString();
    const response = await readMagicEdenJson<Record<string, unknown>>(url, config, true);
    return extractTransaction(response, buyer, listing, MAGIC_EDEN_MMM_PROGRAM, poolKey);
  }

  if (!listing.seller || !validSolanaAddress(listing.seller)) {
    throw new BuyRequestError(
      409,
      "LISTING_CHANGED",
      "The Frog listing is incomplete",
      true,
    );
  }
  const tokenAccount =
    listing.tokenAccount ??
    getAssociatedTokenAddressSync(
      new PublicKey(listing.mint),
      new PublicKey(listing.seller),
      true,
    ).toBase58();
  const url = resolveUrl(config.baseUrl, config.buyNowPath);
  const query = new URLSearchParams({
    buyer,
    seller: listing.seller,
    tokenMint: listing.mint,
    tokenATA: tokenAccount,
    price: listing.priceSol.toFixed(9),
    sellerExpiry: "0",
  });
  if (listing.auctionHouse) query.set("auctionHouseAddress", listing.auctionHouse);
  url.search = query.toString();
  const response = await readMagicEdenJson<Record<string, unknown>>(url, config, true);
  return extractTransaction(response, buyer, listing, MAGIC_EDEN_V2_PROGRAM);
};

type PreparedExecutableFloor = {
  listing: FloorListing;
  transactionBase64: string;
};

const prepareExecutableFloor = async (
  env: Env,
  buyer: string,
  options: {
    expectedMint?: string;
    maximumPaymentLamports?: string;
    excludedMints?: string[];
  } = {},
): Promise<PreparedExecutableFloor> => {
  const listings = await fetchFloorCandidates(env);
  const excludedMints = new Set(options.excludedMints ?? []);
  const availableListings = listings.filter(
    (listing) => !excludedMints.has(listing.mint),
  );
  const candidates = options.expectedMint
    ? availableListings.filter((listing) => listing.mint === options.expectedMint)
    : availableListings;
  if (!candidates[0]) {
    throw new BuyRequestError(
      409,
      "LISTING_CHANGED",
      "The pictured floor Frog is no longer listed. Open a new floor quote",
    );
  }

  const mmmPools = candidates.some(
    (listing) => listing.source?.toLowerCase() === "mmm",
  )
    ? await fetchMmmPools(env)
    : undefined;
  const pricedCandidates = candidates
    .map((listing) => {
      const pool = listing.source?.toLowerCase() === "mmm"
        ? selectMmmPool(mmmPools ?? [], listing)
        : null;
      return {
        listing: pool ? withMmmPoolPrice(listing, pool) : listing,
        pool,
      };
    })
    .filter(
      ({ listing, pool }) =>
        options.expectedMint || listing.source?.toLowerCase() !== "mmm" || pool,
    )
    .sort(({ listing: left }, { listing: right }) =>
      BigInt(left.priceLamports) < BigInt(right.priceLamports) ? -1 :
      BigInt(left.priceLamports) > BigInt(right.priceLamports) ? 1 : 0,
    );

  let preflightAttempts = 0;
  for (const { listing, pool } of pricedCandidates) {
    if (
      options.maximumPaymentLamports &&
      BigInt(listing.priceLamports) > BigInt(options.maximumPaymentLamports)
    ) {
      throw new BuyRequestError(
        409,
        "FLOOR_ABOVE_CAP",
        "The lowest executable Frog is above the approved payment cap",
      );
    }
    if (preflightAttempts >= EXECUTABLE_FLOOR_PREFLIGHT_LIMIT) break;
    preflightAttempts += 1;
    try {
      const transaction = await requestPurchaseTransaction(
        env,
        buyer,
        listing,
        mmmPools,
        pool ?? undefined,
      );
      const transactionBase64 = bytesToBase64(transaction);
      await simulatePurchaseTransaction(env, transactionBase64);
      return { listing, transactionBase64 };
    } catch (error) {
      // Advancing the floor is safe only when this specific listing is unavailable.
      if (!(error instanceof BuyRequestError) || !error.candidateUnavailable) {
        throw error;
      }
      if (options.expectedMint) throw error;
    }
  }

  throw new BuyRequestError(
    409,
    "NO_EXECUTABLE_LISTINGS",
    "No executable Frog floor listing is available right now",
  );
};

const authorize = (request: Request, env: Env) => {
  const authorization = authorizeTradingBotRequest(request, env);
  if (authorization === "missing") {
    throw new BuyRequestError(503, "BACKEND_AUTH_UNAVAILABLE", "Backend execution authentication is not configured");
  }
  if (authorization === "denied") {
    throw new BuyRequestError(401, "UNAUTHORIZED", "Unauthorized");
  }
};

const parseRequest = async (request: Request, execution = false) => {
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { throw new BuyRequestError(400, "INVALID_JSON", "A valid JSON request body is required"); }
  const telegramUserId = stringValue(body.telegramUserId);
  const walletAddress = stringValue(body.walletAddress);
  const executionId = stringValue(body.executionId);
  const maximumPaymentLamports = stringValue(body.maximumPaymentLamports);
  const expectedMint = stringValue(body.expectedMint) ?? undefined;
  const excludedMints = body.excludedMints === undefined
    ? []
    : Array.isArray(body.excludedMints)
      ? body.excludedMints.map(stringValue)
      : null;
  if (
    !telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId) ||
    !walletAddress || !validSolanaAddress(walletAddress) ||
    (execution && (!executionId || !EXECUTION_ID_PATTERN.test(executionId))) ||
    (execution && (!maximumPaymentLamports || !LAMPORTS_PATTERN.test(maximumPaymentLamports))) ||
    (expectedMint !== undefined && !validSolanaAddress(expectedMint)) ||
    excludedMints === null ||
    excludedMints.length > MAX_EXCLUDED_SWEEP_MINTS ||
    excludedMints.some(
      (mint): mint is null => mint === null || !validSolanaAddress(mint),
    ) ||
    new Set(excludedMints).size !== excludedMints.length ||
    (expectedMint !== undefined && excludedMints.includes(expectedMint))
  ) {
    throw new BuyRequestError(400, "INVALID_BUY_REQUEST", "A valid Telegram account, managed wallet, execution ID, and payment cap are required");
  }
  return {
    telegramUserId,
    walletAddress,
    executionId,
    maximumPaymentLamports,
    expectedMint,
    excludedMints: excludedMints as string[],
  };
};

const managedWallet = async (
  env: Env,
  input: { telegramUserId: string; walletAddress: string },
) => {
  const result = await getManagedPrivyWallet(env, input.telegramUserId, input.walletAddress);
  if ("error" in result) {
    throw new BuyRequestError(
      result.status,
      result.code ?? "MANAGED_WALLET_UNAVAILABLE",
      result.error,
    );
  }
  return result.wallet;
};

const referenceId = async (telegramUserId: string, executionId: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${telegramUserId}:${executionId}`),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `me-buy:${hex.slice(0, 56)}`;
};

const handleError = (error: unknown) => {
  if (error instanceof BuyRequestError) {
    return json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error("[me-buy] Unexpected request failure");
  return json({ error: "The Frog purchase could not be prepared" }, { status: 500 });
};

export const postMagicEdenFrogMarket = async (request: Request, env: Env) => {
  try {
    authorize(request, env);
    const input = await parseRequest(request);
    await managedWallet(env, input);
    const [prepared, offer] = await Promise.all([
      prepareExecutableFloor(env, input.walletAddress),
      fetchMagicEdenTopOffer(env).catch(() => null),
    ]);
    const floor = prepared.listing;
    return json({ status: "ready", walletAddress: input.walletAddress, floor, offer, quotedAt: new Date().toISOString() });
  } catch (error) {
    return handleError(error);
  }
};

export const postMagicEdenBuyExecution = async (request: Request, env: Env) => {
  try {
    authorize(request, env);
    if (!enabled(env.MAGIC_EDEN_BUY_EXECUTION_ENABLED)) {
      throw new BuyRequestError(503, "EXECUTION_DISABLED", "Magic Eden backend purchase execution is disabled");
    }
    const missing = managedSolanaExecutionMissingRequirements(env);
    if (missing.length > 0) return json({ status: "not_configured", required: missing }, { status: 503 });
    const input = await parseRequest(request, true);
    const wallet = await managedWallet(env, input);
    const { listing, transactionBase64 } = await prepareExecutableFloor(
      env,
      input.walletAddress,
      {
        expectedMint: input.expectedMint,
        maximumPaymentLamports: input.maximumPaymentLamports as string,
        excludedMints: input.excludedMints,
      },
    );
    const ref = await referenceId(input.telegramUserId, input.executionId as string);
    let execution;
    try {
      execution = await signAndSendManagedSolanaTransaction(env, {
        walletId: wallet.walletId,
        transactionBase64,
        referenceId: ref,
      });
    } catch (error) {
      if (
        error instanceof PrivyWalletRpcError &&
        privyRpcFailureWasNotBroadcast(error)
      ) {
        console.error("[me-buy] Privy purchase was not broadcast", {
          status: error.status,
          kind: error.kind,
          providerCode: error.providerCode,
        });
        return json(
          {
            status: "rejected",
            code: "PRIVY_REJECTED_TRANSACTION",
            providerStatus: error.status > 0 ? error.status : null,
            providerKind: error.kind,
            providerCode: error.providerCode,
            referenceId: ref,
            walletAddress: input.walletAddress,
            listing,
            error: privyBuyFailureMessage(error.providerCode),
          },
          { status: 502 },
        );
      }
      console.error("[me-buy] Privy purchase response is ambiguous", {
        status: error instanceof PrivyWalletRpcError ? error.status : null,
        kind: error instanceof PrivyWalletRpcError ? error.kind : "unknown",
        providerCode:
          error instanceof PrivyWalletRpcError ? error.providerCode : null,
      });
      return json({ status: "pending_reconciliation", referenceId: ref, walletAddress: input.walletAddress, listing, error: "The Privy response was not confirmed. Check this execution ID before attempting another purchase." }, { status: 503 });
    }
    if (!execution.signature) {
      return json({ status: "pending_reconciliation", transactionId: execution.transactionId, referenceId: execution.referenceId, walletAddress: input.walletAddress, listing, error: "Privy accepted the request without returning a transaction signature." }, { status: 503 });
    }
    return json({ status: "submitted", mode: "privy_sign_and_send", signature: execution.signature, transactionId: execution.transactionId, referenceId: execution.referenceId, caip2: execution.caip2, walletAddress: input.walletAddress, listing, solscanUrl: `https://solscan.io/tx/${execution.signature}`, submittedAt: new Date().toISOString() });
  } catch (error) {
    return handleError(error);
  }
};

const privyBuyFailureMessage = (providerCode: string | null): string => {
  if (providerCode === "policy_violation") {
    return "Ribbot access does not allow this Magic Eden purchase. Reconnect your account before trying again.";
  }
  if (providerCode === "insufficient_funds") {
    return "Your Spot & NFT Wallet does not have enough SOL for this purchase.";
  }
  if (
    providerCode &&
    [
      "missing_or_empty_authorization_header",
      "zero_correct_authorization_signatures",
      "insufficient_correct_authorization_signatures",
      "incorrect_quantity_of_authorization_signatures",
      "request_expired",
      "no_valid_user_session_keys",
      "user_session_keys_expired",
    ].includes(providerCode)
  ) {
    return "Ribbot access needs to be refreshed. Reconnect your account before trying again.";
  }
  if (providerCode === "transaction_broadcast_failure") {
    return "The purchase was not broadcast. Open a new floor quote and try again.";
  }
  return "Privy rejected the purchase transaction before broadcast.";
};

export const postMagicEdenBuyExecutionStatus = async (request: Request, env: Env) => {
  try {
    authorize(request, env);
    const input = await parseRequest(request, true);
    const wallet = await managedWallet(env, input);
    const ref = await referenceId(input.telegramUserId, input.executionId as string);
    const transaction = await getManagedSolanaTransactionStatus(env, ref);
    if (!transaction) return json({ status: "not_found", referenceId: ref });
    if (transaction.walletId !== wallet.walletId || transaction.caip2 !== SOLANA_MAINNET_CAIP2) {
      throw new BuyRequestError(409, "EXECUTION_MISMATCH", "The Privy transaction does not match the managed Spot & NFT wallet on Solana");
    }
    const success = transaction.status === "confirmed" || transaction.status === "finalized";
    const failure = ["execution_reverted", "failed", "provider_error", "replaced"].includes(transaction.status);
    return json({ status: success ? "executed" : failure ? "failed" : "pending", providerStatus: transaction.status, signature: transaction.signature, transactionId: transaction.transactionId, referenceId: transaction.referenceId, solscanUrl: transaction.signature ? `https://solscan.io/tx/${transaction.signature}` : null });
  } catch (error) {
    return handleError(error);
  }
};
