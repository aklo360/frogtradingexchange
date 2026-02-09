import {
  ACCOUNT_SIZE,
  createCloseAccountInstruction,
  createInitializeAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import type { Env } from "./env";
import { getTitanConfig } from "./env";
import { resolveHttpUrl } from "./titan";

const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

const DEFAULT_ME_BASE_URL = "https://api-mainnet.magiceden.dev/v2";
const DEFAULT_ME_STATS_PATH = "/collections/{symbol}/stats";
const DEFAULT_ME_LISTINGS_PATH = "/collections/{symbol}/listings";
const DEFAULT_ME_LISTINGS_QUERY = "offset=0&limit=1&sort=price";
const DEFAULT_ME_BUY_NOW_PATH = "/instructions/buy_now";
const DEFAULT_ME_MMM_POOLS_PATH = "/mmm/pools";
const DEFAULT_ME_MMM_FULFILL_SELL_PATH = "/instructions/mmm/sol-fulfill-sell";
const DEFAULT_ME_WALLET_TOKENS_PATH = "/wallets/{wallet}/tokens";
const DEFAULT_ME_MMM_POOLS_LIMIT = 500;

const DEFAULT_RESERVE_SOL = 0.05;
const DEFAULT_RESERVE_USDC = 1;
const DEFAULT_RESERVE_USDT = 1;
const DEFAULT_RESERVE_WSOL = 1;
const DEFAULT_MIN_SWAP_USDC = 1;
const DEFAULT_MIN_SWAP_USDT = 1;
const DEFAULT_SWAP_SLIPPAGE_BPS = 100;

type BuybackConfig = {
  enabled: boolean;
  dryRun: boolean;
  burnEnabled: boolean;
  rpcUrl: string | null;
  walletAddress: string | null;
  walletSecret: string | null;
  reserveLamports: bigint;
  reserveUsdc: bigint;
  reserveUsdt: bigint;
  reserveWsol: bigint;
  minSwapUsdc: bigint;
  minSwapUsdt: bigint;
  swapSlippageBps: number;
  swapPriorityFee: number;
  magicEden: {
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
    floorUnit: "lamports" | "sol";
  };
  incinerator: {
    baseUrl: string | null;
    apiKey: string | null;
    apiKeyHeader: string;
    apiKeyPrefix: string | null;
    burnPath: string;
    burnMethod: "POST" | "GET";
  };
  triggerToken: string | null;
};

type BuybackStatus = {
  enabled: boolean;
  wallet: string | null;
  collectedLamports: string | null;
  floorLamports: string | null;
  collectedSol: number | null;
  floorSol: number | null;
  progress: number | null;
  remainingSol: number | null;
  updatedAt: string;
};

type FloorListing = {
  priceLamports: bigint;
  tokenMint: string;
  tokenAccount?: string;
  seller?: string;
  auctionHouse?: string;
  source?: string;
};

type MmmPool = {
  poolKey: string;
  poolType?: string;
  mints?: string[];
  sellsideAssetAmount?: number;
  buysideCreatorRoyaltyBp?: number;
  poolOwner?: string;
};

type WalletToken = {
  mint: string;
  name?: string;
};

const normalizeWalletTokenList = (data: unknown): unknown[] => {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const candidate =
      record.results ??
      record.tokens ??
      record.items ??
      record.data ??
      record.walletTokens ??
      record.assets;
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
};

const parseWalletToken = (token: unknown): WalletToken | null => {
  if (!token || typeof token !== "object") {
    return null;
  }
  const record = token as Record<string, unknown>;
  const mint =
    (record.mintAddress as string | undefined) ??
    (record.mint as string | undefined) ??
    (record.tokenMint as string | undefined) ??
    (record.tokenAddress as string | undefined) ??
    (record.token as { mint?: string } | undefined)?.mint;
  if (!mint) {
    return null;
  }
  const name =
    (record.name as string | undefined) ??
    (record.title as string | undefined) ??
    (record.token as { name?: string } | undefined)?.name;
  return { mint, name };
};

const extractWalletTokens = (data: unknown): WalletToken[] =>
  normalizeWalletTokenList(data)
    .map((token) => parseWalletToken(token))
    .filter((token): token is WalletToken => Boolean(token));

const parseBool = (value: string | undefined) => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
};

const parseNumber = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const parseSolAmount = (value: string | undefined, fallbackSol: number) => {
  const numeric = parseNumber(value, fallbackSol);
  return BigInt(Math.max(0, Math.round(numeric * LAMPORTS_PER_SOL)));
};

const parseTokenAmount = (
  value: string | undefined,
  decimals: number,
  fallback: number,
) => {
  const numeric = parseNumber(value, fallback);
  const scaled = Math.max(0, Math.round(numeric * 10 ** decimals));
  return BigInt(scaled);
};

const decodeSecretKey = (value: string): Uint8Array => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("BUYBACK_SECRET_EMPTY");
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const parsed = JSON.parse(trimmed) as number[];
    return Uint8Array.from(parsed);
  }

  return bs58.decode(trimmed);
};

const toLamportsString = (value: bigint | null) =>
  value === null ? null : value.toString();

const toSolNumber = (value: bigint | null) =>
  value === null ? null : Number(value) / LAMPORTS_PER_SOL;

const buildHeaders = (
  apiKey: string | null,
  apiKeyHeader: string,
  apiKeyPrefix: string | null,
) => {
  if (!apiKey) return {};
  const headerValue = apiKeyPrefix ? `${apiKeyPrefix} ${apiKey}` : apiKey;
  return { [apiKeyHeader]: headerValue };
};

const resolveBuybackConfig = (env: Env): BuybackConfig => {
  const platformEnabled = parseBool(env.PLATFORM_FEE_ENABLED);
  const enabled = env.BUYBACK_ENABLED
    ? parseBool(env.BUYBACK_ENABLED)
    : platformEnabled;
  const dryRun = parseBool(env.BUYBACK_DRY_RUN);
  const burnEnabled =
    env.BUYBACK_BURN_ENABLED !== undefined
      ? parseBool(env.BUYBACK_BURN_ENABLED)
      : true;

  const rpcUrl = env.SOLANA_RPC_URL?.trim() || null;

  const walletSecret = env.BUYBACK_WALLET_SECRET?.trim() || null;
  const walletAddress =
    env.BUYBACK_WALLET_ADDRESS?.trim() ||
    env.PLATFORM_FEE_RECIPIENT?.trim() ||
    null;

  const magicEdenKeyHeader =
    env.ME_API_KEY_HEADER?.trim() || "Authorization";
  const magicEdenKeyPrefix =
    env.ME_API_KEY_PREFIX?.trim() ||
    (magicEdenKeyHeader.toLowerCase() === "authorization" ? "Bearer" : "");
  const incineratorKeyHeader =
    env.SOL_INCINERATOR_API_KEY_HEADER?.trim() || "x-api-key";
  const incineratorKeyPrefix =
    env.SOL_INCINERATOR_API_KEY_PREFIX?.trim() || "";

  return {
    enabled,
    dryRun,
    burnEnabled,
    rpcUrl,
    walletSecret,
    walletAddress,
    reserveLamports: parseSolAmount(
      env.BUYBACK_SOL_RESERVE,
      DEFAULT_RESERVE_SOL,
    ),
    reserveUsdc: parseTokenAmount(
      env.BUYBACK_TOKEN_RESERVE_USDC,
      6,
      DEFAULT_RESERVE_USDC,
    ),
    reserveUsdt: parseTokenAmount(
      env.BUYBACK_TOKEN_RESERVE_USDT,
      6,
      DEFAULT_RESERVE_USDT,
    ),
    reserveWsol: parseTokenAmount(
      env.BUYBACK_TOKEN_RESERVE_WSOL,
      9,
      DEFAULT_RESERVE_WSOL,
    ),
    minSwapUsdc: parseTokenAmount(
      env.BUYBACK_MIN_SWAP_USDC,
      6,
      DEFAULT_MIN_SWAP_USDC,
    ),
    minSwapUsdt: parseTokenAmount(
      env.BUYBACK_MIN_SWAP_USDT,
      6,
      DEFAULT_MIN_SWAP_USDT,
    ),
    swapSlippageBps: Math.round(
      parseNumber(env.BUYBACK_SWAP_SLIPPAGE_BPS, DEFAULT_SWAP_SLIPPAGE_BPS),
    ),
    swapPriorityFee: Math.round(parseNumber(env.BUYBACK_PRIORITY_FEE, 0)),
    magicEden: {
      baseUrl: env.ME_API_BASE_URL?.trim() || DEFAULT_ME_BASE_URL,
      apiKey: env.ME_API_KEY?.trim() || null,
      apiKeyHeader: magicEdenKeyHeader,
      apiKeyPrefix: magicEdenKeyPrefix || null,
      collectionSymbol:
        env.ME_COLLECTION_SYMBOL?.trim() || "solana_business_frogs",
      statsPath: env.ME_STATS_PATH?.trim() || DEFAULT_ME_STATS_PATH,
      listingsPath: env.ME_LISTINGS_PATH?.trim() || DEFAULT_ME_LISTINGS_PATH,
      listingsQuery:
        env.ME_LISTINGS_QUERY?.trim() || DEFAULT_ME_LISTINGS_QUERY,
      buyNowPath: env.ME_BUY_NOW_PATH?.trim() || DEFAULT_ME_BUY_NOW_PATH,
      buyNowMethod:
        (env.ME_BUY_NOW_METHOD?.trim().toUpperCase() as "GET" | "POST") ||
        "GET",
      floorUnit:
        (env.ME_FLOOR_PRICE_UNIT?.trim().toLowerCase() as
          | "lamports"
          | "sol") || "lamports",
    },
    incinerator: {
      baseUrl: env.SOL_INCINERATOR_API_URL?.trim() || null,
      apiKey: env.SOL_INCINERATOR_API_KEY?.trim() || null,
      apiKeyHeader: incineratorKeyHeader,
      apiKeyPrefix: incineratorKeyPrefix || null,
      burnPath: env.SOL_INCINERATOR_BURN_PATH?.trim() || "/burn",
      burnMethod:
        (env.SOL_INCINERATOR_BURN_METHOD?.trim().toUpperCase() as
          | "GET"
          | "POST") || "POST",
    },
    triggerToken: env.BUYBACK_TRIGGER_TOKEN?.trim() || null,
  };
};

const resolveWalletKeypair = (secret: string) => {
  const secretBytes = decodeSecretKey(secret);
  return Keypair.fromSecretKey(secretBytes);
};

const decodeBase64 = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const decodeTransactionPayload = (value: unknown): Uint8Array => {
  if (!value) {
    throw new Error("TRANSACTION_MISSING");
  }
  if (typeof value === "string") {
    const base58Pattern = /^[1-9A-HJ-NP-Za-km-z]+$/;
    if (base58Pattern.test(value)) {
      return bs58.decode(value);
    }
    try {
      return decodeBase64(value);
    } catch {
      return bs58.decode(value);
    }
  }
  if (typeof value === "object") {
    const obj = value as { data?: number[] };
    if (Array.isArray(obj.data)) {
      return Uint8Array.from(obj.data);
    }
  }
  throw new Error("TRANSACTION_UNSUPPORTED");
};

const decodeLamportsToSol = (lamports: bigint) =>
  Number(lamports) / LAMPORTS_PER_SOL;

const fetchJson = async <T>(
  url: string,
  init?: RequestInit,
): Promise<T> => {
  // IMPORTANT: Add cache-busting headers to always get fresh data (e.g., floor prices)
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  headers.set("Pragma", "no-cache");

  const response = await fetch(url, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP_${response.status}`);
  }
  return (await response.json()) as T;
};

const resolvePath = (template: string, symbol: string) =>
  template.replace("{symbol}", symbol);

const resolveWalletPath = (template: string, wallet: string) =>
  template.replace("{wallet}", wallet);

const resolveMagicEdenUrl = (baseUrl: string, path: string) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, normalizedBase);
};

// Magic Eden fee structure (as of 2024):
// - Marketplace fee: 2% (200 bps)
// - Creator royalties: 2.5% (250 bps) for SBF collection
// Total: 4.5% on top of listing price
const ME_MARKETPLACE_FEE_BPS = 200;
const ME_CREATOR_ROYALTY_BPS = 250;
const ME_TOTAL_FEE_BPS = ME_MARKETPLACE_FEE_BPS + ME_CREATOR_ROYALTY_BPS;

/**
 * Calculates total cost to buy including fees.
 * Magic Eden shows "total cost" on their UI which includes marketplace + royalty fees.
 */
const addBuyerFees = (basePriceLamports: bigint): bigint => {
  // Total cost = base price * (1 + fee%)
  // fee% = 4.5% = 450 bps = 0.045
  const feeMultiplier = 10000n + BigInt(ME_TOTAL_FEE_BPS);
  return (basePriceLamports * feeMultiplier) / 10000n;
};

const getFloorPriceLamports = async (
  config: BuybackConfig,
): Promise<bigint> => {
  const url = resolveMagicEdenUrl(
    config.magicEden.baseUrl,
    resolvePath(config.magicEden.statsPath, config.magicEden.collectionSymbol),
  );
  const headers = buildHeaders(
    config.magicEden.apiKey,
    config.magicEden.apiKeyHeader,
    config.magicEden.apiKeyPrefix,
  );
  const data = await fetchJson<Record<string, unknown>>(url.toString(), {
    headers,
  });

  const raw =
    (data.floorPrice as number | string | undefined) ??
    (data.floor_price as number | string | undefined) ??
    (data.floorPriceLamports as number | string | undefined) ??
    (data.floor_price_lamports as number | string | undefined);

  if (raw === undefined || raw === null) {
    throw new Error("FLOOR_PRICE_MISSING");
  }

  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    throw new Error("FLOOR_PRICE_INVALID");
  }

  let basePriceLamports: bigint;
  if (config.magicEden.floorUnit === "sol") {
    basePriceLamports = BigInt(Math.round(numeric * LAMPORTS_PER_SOL));
  } else {
    basePriceLamports = BigInt(Math.round(numeric));
  }

  // Add buyer fees (marketplace + royalties) to get total cost
  return addBuyerFees(basePriceLamports);
};

const pickListing = (payload: unknown): FloorListing => {
  const list = Array.isArray(payload)
    ? payload
    : (payload as { listings?: unknown[]; results?: unknown[] })?.listings ??
      (payload as { listings?: unknown[]; results?: unknown[] })?.results ??
      [];
  const first = Array.isArray(list) ? list[0] : null;
  if (!first || typeof first !== "object") {
    throw new Error("NO_LISTINGS");
  }
  const listing = first as Record<string, unknown>;
  const rawLamports =
    listing.priceLamports ??
    listing.price_lamports ??
    (listing.priceInfo as { solPrice?: { rawAmount?: string | number } } | undefined)
      ?.solPrice?.rawAmount ??
    (listing.price_info as { solPrice?: { rawAmount?: string | number } } | undefined)
      ?.solPrice?.rawAmount;
  const rawPrice =
    listing.price ??
    (listing.price_info as { price?: number | string } | undefined)?.price ??
    (listing.priceInfo as { price?: number | string } | undefined)?.price;

  const lamportsValue =
    rawLamports !== undefined && rawLamports !== null
      ? Number(rawLamports)
      : Number(rawPrice) * LAMPORTS_PER_SOL;

  if (!Number.isFinite(lamportsValue)) {
    throw new Error("LISTING_PRICE_MISSING");
  }

  const tokenMint =
    (listing.tokenMint as string | undefined) ??
    (listing.mint as string | undefined) ??
    (listing.token as { mint?: string } | undefined)?.mint;
  if (!tokenMint) {
    throw new Error("LISTING_MINT_MISSING");
  }

  const tokenAccount =
    (listing.tokenAccount as string | undefined) ??
    (listing.tokenAccountAddress as string | undefined) ??
    (listing.token as { tokenAccount?: string } | undefined)?.tokenAccount;

  const seller =
    (listing.seller as string | undefined) ??
    (listing.sellerAddress as string | undefined);

  const auctionHouse =
    (listing.auctionHouseAddress as string | undefined) ??
    (listing.auctionHouse as string | undefined);

  const source =
    (listing.listingSource as string | undefined) ??
    (listing.listing_source as string | undefined) ??
    (listing.listingType as string | undefined);

  return {
    priceLamports: BigInt(Math.round(lamportsValue)),
    tokenMint,
    tokenAccount,
    seller,
    auctionHouse,
    source,
  };
};

const fetchFloorListing = async (
  config: BuybackConfig,
): Promise<FloorListing> => {
  const url = resolveMagicEdenUrl(
    config.magicEden.baseUrl,
    resolvePath(
      config.magicEden.listingsPath,
      config.magicEden.collectionSymbol,
    ),
  );
  url.search = config.magicEden.listingsQuery;
  const headers = buildHeaders(
    config.magicEden.apiKey,
    config.magicEden.apiKeyHeader,
    config.magicEden.apiKeyPrefix,
  );
  const data = await fetchJson<unknown>(url.toString(), { headers });
  return pickListing(data);
};

const pickWalletToken = (payload: unknown): WalletToken => {
  const tokens = extractWalletTokens(payload);
  const first = tokens[0];
  if (!first) {
    throw new Error("WALLET_TOKEN_MISSING");
  }
  return first;
};

const fetchWalletToken = async (
  config: BuybackConfig,
  wallet: string,
): Promise<WalletToken> => {
  const tokens = await fetchWalletTokens(config, wallet, 1);
  const first = tokens[0];
  if (!first) {
    throw new Error("WALLET_TOKEN_MISSING");
  }
  return first;
};

const fetchWalletTokens = async (
  config: BuybackConfig,
  wallet: string,
  limitOverride?: number,
): Promise<WalletToken[]> => {
  const headers = buildHeaders(
    config.magicEden.apiKey,
    config.magicEden.apiKeyHeader,
    config.magicEden.apiKeyPrefix,
  );
  const limit = limitOverride ?? 200;
  const tokens: WalletToken[] = [];
  let offset = 0;
  while (true) {
    const url = resolveMagicEdenUrl(
      config.magicEden.baseUrl,
      resolveWalletPath(DEFAULT_ME_WALLET_TOKENS_PATH, wallet),
    );
    const params = new URLSearchParams({
      collectionSymbol: config.magicEden.collectionSymbol,
      limit: limit.toString(),
      offset: offset.toString(),
    });
    url.search = params.toString();
    const data = await fetchJson<unknown>(url.toString(), { headers });
    const batch = extractWalletTokens(data);
    if (batch.length === 0) {
      break;
    }
    tokens.push(...batch);
    if (batch.length < limit) {
      break;
    }
    offset += limit;
    if (offset >= 2000) {
      console.warn("[buyback] Wallet token pagination capped", { offset });
      break;
    }
  }
  return tokens;
};

const fetchMmmPools = async (
  config: BuybackConfig,
): Promise<MmmPool[]> => {
  const url = resolveMagicEdenUrl(
    config.magicEden.baseUrl,
    DEFAULT_ME_MMM_POOLS_PATH,
  );
  const params = new URLSearchParams({
    collectionSymbol: config.magicEden.collectionSymbol,
    limit: DEFAULT_ME_MMM_POOLS_LIMIT.toString(),
  });
  url.search = params.toString();
  const headers = buildHeaders(
    config.magicEden.apiKey,
    config.magicEden.apiKeyHeader,
    config.magicEden.apiKeyPrefix,
  );
  const data = await fetchJson<{ results?: MmmPool[] }>(url.toString(), {
    headers,
  });
  return Array.isArray(data.results) ? data.results : [];
};

const selectMmmPoolForMint = (
  pools: MmmPool[],
  listing: FloorListing,
): MmmPool | null => {
  const mint = listing.tokenMint;
  const seller = listing.seller;
  const matchesMint = (pool: MmmPool) =>
    Array.isArray(pool.mints) && pool.mints.includes(mint);
  const isSellable = (pool: MmmPool) =>
    pool.poolType !== "buy_sided" &&
    (pool.sellsideAssetAmount ?? 0) > 0;
  const matchesSeller = (pool: MmmPool) =>
    !seller || pool.poolOwner === seller;

  const primary = pools.find(
    (pool) => matchesMint(pool) && isSellable(pool) && matchesSeller(pool),
  );
  if (primary) return primary;

  const fallback = pools.find(
    (pool) => matchesMint(pool) && isSellable(pool),
  );
  return fallback ?? null;
};

const requestMmmFulfillSellTx = async (
  config: BuybackConfig,
  listing: FloorListing,
  buyer: string,
  pool: MmmPool,
): Promise<Uint8Array> => {
  const url = resolveMagicEdenUrl(
    config.magicEden.baseUrl,
    DEFAULT_ME_MMM_FULFILL_SELL_PATH,
  );
  const headers = buildHeaders(
    config.magicEden.apiKey,
    config.magicEden.apiKeyHeader,
    config.magicEden.apiKeyPrefix,
  );
  const params = new URLSearchParams({
    pool: pool.poolKey,
    assetAmount: "1",
    maxPaymentAmount: listing.priceLamports.toString(),
    buysideCreatorRoyaltyBp: String(pool.buysideCreatorRoyaltyBp ?? 0),
    buyer,
    assetMint: listing.tokenMint,
  });
  if (config.swapPriorityFee > 0) {
    params.set("priorityFee", String(config.swapPriorityFee));
  }
  url.search = params.toString();

  const responseData = await fetchJson<Record<string, unknown>>(url.toString(), {
    headers,
  });

  const txPayload =
    responseData.txSigned ??
    responseData.tx ??
    responseData.transaction ??
    responseData.txBase64 ??
    responseData.transactionBase64 ??
    (responseData.data as { tx?: unknown } | undefined)?.tx;

  if (!txPayload) {
    throw new Error("MMM_TX_MISSING");
  }

  return decodeTransactionPayload(txPayload);
};

const requestBuyNowTx = async (
  config: BuybackConfig,
  listing: FloorListing,
  buyer: string,
): Promise<Uint8Array> => {
  if (!listing.seller) {
    throw new Error("LISTING_SELLER_MISSING");
  }
  const url = resolveMagicEdenUrl(
    config.magicEden.baseUrl,
    config.magicEden.buyNowPath,
  );
  const headers = {
    "Content-Type": "application/json",
    ...buildHeaders(
      config.magicEden.apiKey,
      config.magicEden.apiKeyHeader,
      config.magicEden.apiKeyPrefix,
    ),
  };

  const tokenAta =
    listing.tokenAccount ??
    (listing.seller
      ? getAssociatedTokenAddressSync(
          new PublicKey(listing.tokenMint),
          new PublicKey(listing.seller),
          true,
        ).toBase58()
      : null);

  if (!tokenAta) {
    throw new Error("TOKEN_ATA_MISSING");
  }

  const payload = {
    buyer,
    seller: listing.seller,
    tokenMint: listing.tokenMint,
    tokenATA: tokenAta,
    auctionHouseAddress: listing.auctionHouse,
    price: decodeLamportsToSol(listing.priceLamports),
    sellerExpiry: 0,
  };

  let responseData: Record<string, unknown>;
  if (config.magicEden.buyNowMethod === "GET") {
    const query = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      query.set(key, String(value));
    });
    url.search = query.toString();
    responseData = await fetchJson<Record<string, unknown>>(url.toString(), {
      headers,
    });
  } else {
    responseData = await fetchJson<Record<string, unknown>>(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  }

  const txPayload =
    responseData.txSigned ??
    responseData.tx ??
    responseData.transaction ??
    responseData.txBase64 ??
    responseData.transactionBase64 ??
    (responseData.data as { tx?: unknown } | undefined)?.tx;

  if (!txPayload) {
    throw new Error("BUY_NOW_TX_MISSING");
  }

  return decodeTransactionPayload(txPayload);
};

const requestIncineratorTx = async (
  config: BuybackConfig,
  mint: string,
  owner: string,
): Promise<Uint8Array> => {
  if (!config.incinerator.baseUrl) {
    throw new Error("INCINERATOR_URL_MISSING");
  }

  const url = new URL(config.incinerator.burnPath, config.incinerator.baseUrl);
  const headers = {
    "Content-Type": "application/json",
    ...buildHeaders(
      config.incinerator.apiKey,
      config.incinerator.apiKeyHeader,
      config.incinerator.apiKeyPrefix,
    ),
  };

  const payload = { userPublicKey: owner, assetId: mint };

  let responseData: Record<string, unknown>;
  if (config.incinerator.burnMethod === "GET") {
    const query = new URLSearchParams({ userPublicKey: owner, assetId: mint });
    url.search = query.toString();
    responseData = await fetchJson<Record<string, unknown>>(url.toString(), {
      headers,
    });
  } else {
    responseData = await fetchJson<Record<string, unknown>>(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  }

  const txPayload =
    responseData.serializedTransaction ??
    responseData.txSigned ??
    responseData.tx ??
    responseData.transaction ??
    responseData.txBase64 ??
    responseData.transactionBase64 ??
    (responseData.data as { tx?: unknown } | undefined)?.tx;

  if (!txPayload) {
    throw new Error("INCINERATOR_TX_MISSING");
  }

  return decodeTransactionPayload(txPayload);
};

const normalizeLabel = (label: string) =>
  label.trim().toUpperCase().replace(/\s+/g, "_");

const assertSignatureStatus = async (
  connection: Connection,
  signature: string,
  label: string,
) => {
  const { value } = await connection.getSignatureStatuses(
    [signature],
    { searchTransactionHistory: true },
  );
  const status = value[0];
  if (!status) {
    throw new Error(`${label}_STATUS_MISSING`);
  }
  if (status.err) {
    throw new Error(`${label}_FAILED:${JSON.stringify(status.err)}`);
  }
  if (
    status.confirmationStatus !== "confirmed" &&
    status.confirmationStatus !== "finalized"
  ) {
    throw new Error(`${label}_NOT_CONFIRMED`);
  }
  return status;
};

const sendTransaction = async (
  connection: Connection,
  keypair: Keypair,
  txBytes: Uint8Array,
  label = "transaction",
) => {
  let signature: string;
  try {
    const transaction = VersionedTransaction.deserialize(txBytes);
    transaction.sign([keypair]);
    signature = await connection.sendRawTransaction(
      transaction.serialize(),
    );
  } catch {
    const transaction = Transaction.from(txBytes);
    transaction.partialSign(keypair);
    signature = await connection.sendRawTransaction(
      transaction.serialize(),
    );
  }
  const normalizedLabel = normalizeLabel(label);
  const confirmation = await connection.confirmTransaction(
    signature,
    "confirmed",
  );
  if (confirmation.value?.err) {
    throw new Error(
      `${normalizedLabel}_CONFIRM_FAILED:${JSON.stringify(confirmation.value.err)}`,
    );
  }
  const status = await assertSignatureStatus(
    connection,
    signature,
    normalizedLabel,
  );
  console.log(`[buyback] ${label} confirmed`, {
    signature,
    confirmationStatus: status.confirmationStatus ?? "unknown",
    slot: status.slot,
  });
  return signature;
};

const unwrapWsol = async (
  connection: Connection,
  keypair: Keypair,
  amount: bigint,
) => {
  const owner = keypair.publicKey;
  const wsolMint = new PublicKey(WRAPPED_SOL_MINT);
  const sourceAta = getAssociatedTokenAddressSync(wsolMint, owner, true);
  const tempAccount = Keypair.generate();
  const rentLamports = await connection.getMinimumBalanceForRentExemption(
    ACCOUNT_SIZE,
  );

  const createIx = SystemProgram.createAccount({
    fromPubkey: owner,
    newAccountPubkey: tempAccount.publicKey,
    lamports: rentLamports,
    space: ACCOUNT_SIZE,
    programId: TOKEN_PROGRAM_ID,
  });
  const initIx = createInitializeAccountInstruction(
    tempAccount.publicKey,
    wsolMint,
    owner,
  );
  const transferIx = createTransferInstruction(
    sourceAta,
    tempAccount.publicKey,
    owner,
    amount,
  );
  const closeIx = createCloseAccountInstruction(
    tempAccount.publicKey,
    owner,
    owner,
  );

  const tx = new Transaction().add(createIx, initIx, transferIx, closeIx);
  const latest = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latest.blockhash;
  tx.feePayer = owner;
  tx.sign(keypair, tempAccount);

  const signature = await connection.sendRawTransaction(tx.serialize());
  const confirmation = await connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    "confirmed",
  );
  if (confirmation.value?.err) {
    throw new Error(`WSOL_UNWRAP_FAILED:${JSON.stringify(confirmation.value.err)}`);
  }
  await assertSignatureStatus(connection, signature, "WSOL_UNWRAP");
  return signature;
};

const getSplTokenBalance = async (
  connection: Connection,
  owner: PublicKey,
  mint: string,
) => {
  try {
    const mintKey = new PublicKey(mint);
    const accounts = await connection.getParsedTokenAccountsByOwner(
      owner,
      { mint: mintKey },
      "confirmed",
    );
    return accounts.value.reduce((total, account) => {
      const amount =
        (account.account.data as { parsed?: { info?: { tokenAmount?: { amount?: string } } } })
          ?.parsed?.info?.tokenAmount?.amount ?? "0";
      try {
        return total + BigInt(amount);
      } catch {
        return total;
      }
    }, 0n);
  } catch {
    return 0n;
  }
};

const getSolBalance = async (connection: Connection, owner: PublicKey) => {
  const lamports = await connection.getBalance(owner, "confirmed");
  return BigInt(lamports);
};

const swapToSol = async (
  config: BuybackConfig,
  titanConfig: ReturnType<typeof getTitanConfig>,
  connection: Connection,
  keypair: Keypair,
  mint: string,
  amountIn: bigint,
) => {
  if (!config.rpcUrl) {
    throw new Error("RPC_URL_MISSING");
  }
  if (!titanConfig.token) {
    throw new Error("TITAN_TOKEN_MISSING");
  }
  const url = resolveHttpUrl(titanConfig, "/frogx/swap", titanConfig.preferredRegions[0]);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${titanConfig.token}`,
    },
    body: JSON.stringify({
      userPubkey: keypair.publicKey.toBase58(),
      inMint: mint,
      outMint: WRAPPED_SOL_MINT,
      amountIn: amountIn.toString(),
      slippageBps: config.swapSlippageBps,
      priorityFee: config.swapPriorityFee,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "SWAP_TX_FETCH_FAILED");
  }

  const data = (await response.json()) as { txBase64?: string | null };
  if (!data.txBase64) {
    throw new Error("SWAP_TX_MISSING");
  }

  return sendTransaction(
    connection,
    keypair,
    decodeBase64(data.txBase64),
    "swap-to-sol",
  );
};

export const getBuybackStatus = async (env: Env): Promise<BuybackStatus> => {
  const config = resolveBuybackConfig(env);
  const updatedAt = new Date().toISOString();

  if (!config.enabled || !config.rpcUrl || !config.walletAddress) {
    return {
      enabled: false,
      wallet: config.walletAddress,
      collectedLamports: null,
      floorLamports: null,
      collectedSol: null,
      floorSol: null,
      progress: null,
      remainingSol: null,
      updatedAt,
    };
  }

  let walletKey: PublicKey;
  try {
    walletKey = new PublicKey(config.walletAddress);
  } catch {
    return {
      enabled: false,
      wallet: config.walletAddress,
      collectedLamports: null,
      floorLamports: null,
      collectedSol: null,
      floorSol: null,
      progress: null,
      remainingSol: null,
      updatedAt,
    };
  }

  const connection = new Connection(config.rpcUrl, "confirmed");

  const [solLamports, floorLamports] = await Promise.all([
    getSolBalance(connection, walletKey),
    getFloorPriceLamports(config).catch((error) => {
      console.warn("[buyback] Failed to fetch floor price", error);
      return null;
    }),
  ]);

  const availableSol = solLamports > config.reserveLamports
    ? solLamports - config.reserveLamports
    : 0n;

  const progress =
    floorLamports && floorLamports > 0n
      ? Math.min(Number(availableSol) / Number(floorLamports), 1)
      : null;

  const remaining =
    floorLamports && floorLamports > availableSol
      ? Number(floorLamports - availableSol) / LAMPORTS_PER_SOL
      : 0;

  return {
    enabled: config.enabled,
    wallet: config.walletAddress,
    collectedLamports: toLamportsString(availableSol),
    floorLamports: toLamportsString(floorLamports),
    collectedSol: toSolNumber(availableSol),
    floorSol: toSolNumber(floorLamports),
    progress,
    remainingSol: floorLamports ? remaining : null,
    updatedAt,
  };
};

export const burnBuybackAsset = async (
  env: Env,
  mintOverride?: string,
): Promise<{ mint: string; signature: string }> => {
  const config = resolveBuybackConfig(env);
  if (!config.walletSecret) {
    throw new Error("BUYBACK_WALLET_SECRET_MISSING");
  }
  if (!config.rpcUrl) {
    throw new Error("RPC_URL_MISSING");
  }
  if (!config.incinerator.baseUrl) {
    throw new Error("INCINERATOR_URL_MISSING");
  }

  const keypair = resolveWalletKeypair(config.walletSecret);
  const owner = keypair.publicKey.toBase58();
  if (config.walletAddress && owner !== config.walletAddress) {
    console.warn("[buyback] Wallet address mismatch; using secret key address", {
      configured: config.walletAddress,
      derived: owner,
    });
  }

  const mint =
    mintOverride?.trim() || (await fetchWalletToken(config, owner)).mint;

  const connection = new Connection(config.rpcUrl, "confirmed");
  const burnTx = await requestIncineratorTx(config, mint, owner);
  const signature = await sendTransaction(
    connection,
    keypair,
    burnTx,
    "buyback-burn",
  );
  return { mint, signature };
};

const burnHeldFrogs = async (
  config: BuybackConfig,
  connection: Connection,
  keypair: Keypair,
) => {
  if (!config.burnEnabled) {
    return;
  }
  if (!config.incinerator.baseUrl) {
    console.warn("[buyback] Burn enabled but incinerator URL missing");
    return;
  }
  const owner = keypair.publicKey.toBase58();
  let tokens: WalletToken[];
  try {
    tokens = await fetchWalletTokens(config, owner);
  } catch (error) {
    console.error("[buyback] Failed to fetch wallet tokens for burn", error);
    return;
  }
  if (tokens.length === 0) {
    return;
  }
  const seen = new Set<string>();
  for (const token of tokens) {
    if (seen.has(token.mint)) {
      continue;
    }
    seen.add(token.mint);
    try {
      const burnTx = await requestIncineratorTx(
        config,
        token.mint,
        owner,
      );
      const burnSig = await sendTransaction(
        connection,
        keypair,
        burnTx,
        "held-burn",
      );
      console.log("[buyback] Burned held frog", {
        mint: token.mint,
        signature: burnSig,
      });
    } catch (error) {
      console.error("[buyback] Failed to burn held frog", {
        mint: token.mint,
        error,
      });
    }
  }
};

export const runBuyback = async (env: Env): Promise<void> => {
  const config = resolveBuybackConfig(env);
  if (!config.enabled) {
    console.log("[buyback] Disabled");
    return;
  }
  if (!config.walletSecret) {
    console.warn("[buyback] Wallet secret missing");
    return;
  }
  if (!config.rpcUrl) {
    console.warn("[buyback] RPC URL missing");
    return;
  }

  const keypair = resolveWalletKeypair(config.walletSecret);
  if (config.walletAddress && keypair.publicKey.toBase58() !== config.walletAddress) {
    console.warn("[buyback] Wallet address mismatch; using secret key address", {
      configured: config.walletAddress,
      derived: keypair.publicKey.toBase58(),
    });
  }

  const connection = new Connection(config.rpcUrl, "confirmed");
  const owner = keypair.publicKey;
  const titanConfig = getTitanConfig(env);

  const [usdcBalance, usdtBalance] = await Promise.all([
    getSplTokenBalance(connection, owner, USDC_MINT),
    getSplTokenBalance(connection, owner, USDT_MINT),
  ]);

  const swappableUsdc =
    usdcBalance > config.reserveUsdc ? usdcBalance - config.reserveUsdc : 0n;
  const swappableUsdt =
    usdtBalance > config.reserveUsdt ? usdtBalance - config.reserveUsdt : 0n;

  if (swappableUsdc >= config.minSwapUsdc) {
    console.log("[buyback] Swapping USDC -> SOL", swappableUsdc.toString());
    if (!config.dryRun) {
      try {
        await swapToSol(
          config,
          titanConfig,
          connection,
          keypair,
          USDC_MINT,
          swappableUsdc,
        );
      } catch (error) {
        console.error("[buyback] USDC swap failed", error);
      }
    }
  }

  if (swappableUsdt >= config.minSwapUsdt) {
    console.log("[buyback] Swapping USDT -> SOL", swappableUsdt.toString());
    if (!config.dryRun) {
      try {
        await swapToSol(
          config,
          titanConfig,
          connection,
          keypair,
          USDT_MINT,
          swappableUsdt,
        );
      } catch (error) {
        console.error("[buyback] USDT swap failed", error);
      }
    }
  }

  const wsolBalance = await getSplTokenBalance(
    connection,
    owner,
    WRAPPED_SOL_MINT,
  );
  const swappableWsol =
    wsolBalance > config.reserveWsol ? wsolBalance - config.reserveWsol : 0n;
  if (swappableWsol > 0n) {
    console.log("[buyback] Unwrapping wSOL -> SOL", swappableWsol.toString());
    if (!config.dryRun) {
      try {
        const unwrapSig = await unwrapWsol(connection, keypair, swappableWsol);
        console.log("[buyback] wSOL unwrap submitted", unwrapSig);
      } catch (error) {
        console.error("[buyback] wSOL unwrap failed", error);
      }
    }
  }

  if (!config.dryRun) {
    await burnHeldFrogs(config, connection, keypair);
  }

  const solLamports = await getSolBalance(connection, owner);
  const availableSol = solLamports > config.reserveLamports
    ? solLamports - config.reserveLamports
    : 0n;

  let floorLamports: bigint;
  try {
    floorLamports = await getFloorPriceLamports(config);
  } catch (error) {
    console.error("[buyback] Failed to load floor price", error);
    return;
  }
  if (availableSol < floorLamports) {
    console.log("[buyback] Floor not reached", {
      available: availableSol.toString(),
      floor: floorLamports.toString(),
    });
    return;
  }

  let listing: FloorListing;
  try {
    listing = await fetchFloorListing(config);
  } catch (error) {
    console.error("[buyback] Failed to fetch listings", error);
    return;
  }
  if (listing.priceLamports > availableSol) {
    console.log("[buyback] Listing exceeds available SOL", {
      listing: listing.priceLamports.toString(),
      available: availableSol.toString(),
    });
    return;
  }

  const isMmm = listing.source?.toLowerCase() === "mmm";

  if (config.dryRun) {
    console.log("[buyback] Dry run: would buy & burn", {
      mint: listing.tokenMint,
      price: listing.priceLamports.toString(),
      source: listing.source ?? "unknown",
    });
    return;
  }

  let buyTx: Uint8Array;
  if (isMmm) {
    const pools = await fetchMmmPools(config);
    const pool = selectMmmPoolForMint(pools, listing);
    if (!pool) {
      console.error("[buyback] MMM pool not found for mint", {
        mint: listing.tokenMint,
        source: listing.source,
      });
      return;
    }
    buyTx = await requestMmmFulfillSellTx(
      config,
      listing,
      owner.toBase58(),
      pool,
    );
  } else {
    buyTx = await requestBuyNowTx(
      config,
      listing,
      owner.toBase58(),
    );
  }
  let buySig: string;
  try {
    buySig = await sendTransaction(
      connection,
      keypair,
      buyTx,
      "buyback-purchase",
    );
  } catch (error) {
    console.error("[buyback] Purchase failed", error);
    return;
  }
  console.log("[buyback] Purchase confirmed", buySig);

  if (!config.burnEnabled) {
    console.log("[buyback] Burn disabled; skipping incinerator");
    return;
  }

  try {
    const burnTx = await requestIncineratorTx(
      config,
      listing.tokenMint,
      owner.toBase58(),
    );
    const burnSig = await sendTransaction(
      connection,
      keypair,
      burnTx,
      "buyback-burn",
    );
    console.log("[buyback] Burn confirmed", burnSig);
  } catch (error) {
    console.error("[buyback] Burn failed", error);
  }
};

/**
 * Validates authorization for buyback trigger requests.
 * SECURITY: Returns false by default if no trigger token is configured.
 * Uses constant-time comparison to prevent timing attacks.
 */
export const isAuthorizedBuybackTrigger = (
  request: Request,
  env: Env,
): boolean => {
  const config = resolveBuybackConfig(env);
  // SECURITY FIX: Require token to be configured - don't allow open access
  if (!config.triggerToken) return false;
  const header = request.headers.get("authorization");
  if (!header) return false;
  const token = header.includes(" ") ? header.split(" ").pop() : header;
  if (!token) return false;
  // SECURITY: Use constant-time comparison to prevent timing attacks
  if (token.length !== config.triggerToken.length) return false;
  let result = 0;
  for (let i = 0; i < token.length; i++) {
    result |= token.charCodeAt(i) ^ config.triggerToken.charCodeAt(i);
  }
  return result === 0;
};
