import { PrivyClient } from "@privy-io/node";
import {
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

import type { Env } from "./env";
import {
  BUSINESS_FROG_COLLECTION,
  fetchWalletNftHoldings,
} from "./nftHoldings";
import {
  authorizeTradingBotRequest,
  getManagedPrivyWallet,
  getManagedSolanaTransactionStatus,
  managedSolanaExecutionMissingRequirements,
  PrivyWalletRpcError,
  signAndSendManagedSolanaTransaction,
} from "./tradingBot";

const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAGIC_EDEN_MMM_PROGRAM =
  "mmm3XBJg5gk8XJxEKBvdgptZz6SgK4tXvn36sodowMc";
const DEFAULT_ME_BASE_URL = "https://api-mainnet.magiceden.dev/v2";
const DEFAULT_ME_COLLECTION_SYMBOL = "solana_business_frogs";
const DEFAULT_ME_POOLS_PATH = "/mmm/pools";
const DEFAULT_ME_FULFILL_BUY_PATH =
  "/instructions/mmm/sol-fulfill-buy";
const ME_POOL_LIMIT = 500;
const MIN_PAYMENT_BPS = 9_400n;
const BPS_DENOMINATOR = 10_000n;
const TELEGRAM_USER_ID_PATTERN = /^\d{1,20}$/;
const EXECUTION_ID_PATTERN = /^[A-Za-z0-9:_-]{1,80}$/;
const LAMPORTS_PATTERN = /^\d{1,20}$/;
const SOLANA_MAINNET_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

type MagicEdenPool = {
  poolKey?: unknown;
  poolType?: unknown;
  spotPrice?: unknown;
  expiry?: unknown;
  buyOrdersAmount?: unknown;
  buysidePaymentAmount?: unknown;
  collectionSymbol?: unknown;
  updatedAt?: unknown;
};

export type MagicEdenTopOffer = {
  pool: string;
  spotPriceLamports: string;
  spotPriceSol: number;
  minimumPaymentLamports: string;
  minimumPaymentSol: number;
  updatedAt: string | null;
};

type MagicEdenConfig = {
  baseUrl: string;
  apiKey: string | null;
  apiKeyHeader: string;
  apiKeyPrefix: string | null;
  collectionSymbol: string;
};

class SellRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const json = (data: unknown, init?: ResponseInit) =>
  Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...init?.headers,
    },
  });

const stringValue = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const integerValue = (value: unknown): number | null => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

const validSolanaAddress = (value: string) => {
  if (!SOLANA_ADDRESS_PATTERN.test(value)) return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
};

const resolveMagicEdenConfig = (env: Env): MagicEdenConfig => {
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
  };
};

const resolveMagicEdenUrl = (baseUrl: string, path: string) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ""), normalizedBase);
};

const magicEdenHeaders = (config: MagicEdenConfig) => {
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
): Promise<T> => {
  const response = await fetch(url.toString(), {
    headers: magicEdenHeaders(config),
  });
  if (!response.ok) {
    throw new SellRequestError(
      response.status === 401 || response.status === 403 ? 503 : 502,
      "MAGIC_EDEN_UNAVAILABLE",
      "Magic Eden offers are temporarily unavailable",
    );
  }
  return (await response.json()) as T;
};

const poolIsActive = (
  pool: MagicEdenPool,
  collectionSymbol: string,
  nowSeconds: number,
) => {
  const poolType = stringValue(pool.poolType);
  const expiry = integerValue(pool.expiry);
  const buyOrdersAmount = integerValue(pool.buyOrdersAmount);
  const paymentAmount = integerValue(pool.buysidePaymentAmount);
  const spotPrice = integerValue(pool.spotPrice);
  return (
    stringValue(pool.collectionSymbol) === collectionSymbol &&
    poolType !== "sell_sided" &&
    expiry !== null &&
    (expiry === 0 || expiry > nowSeconds) &&
    buyOrdersAmount !== null &&
    buyOrdersAmount > 0 &&
    paymentAmount !== null &&
    spotPrice !== null &&
    spotPrice > 0 &&
    paymentAmount >= spotPrice &&
    validSolanaAddress(stringValue(pool.poolKey) ?? "")
  );
};

export const selectHighestLiveOffer = (
  pools: MagicEdenPool[],
  collectionSymbol: string,
  now = new Date(),
): MagicEdenTopOffer | null => {
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  const pool = pools
    .filter((entry) => poolIsActive(entry, collectionSymbol, nowSeconds))
    .sort(
      (left, right) =>
        (integerValue(right.spotPrice) ?? 0) -
        (integerValue(left.spotPrice) ?? 0),
    )[0];
  if (!pool) return null;

  const spotPrice = BigInt(integerValue(pool.spotPrice) as number);
  const minimumPayment =
    (spotPrice * MIN_PAYMENT_BPS) / BPS_DENOMINATOR;
  return {
    pool: stringValue(pool.poolKey) as string,
    spotPriceLamports: spotPrice.toString(),
    spotPriceSol: Number(spotPrice) / 1_000_000_000,
    minimumPaymentLamports: minimumPayment.toString(),
    minimumPaymentSol: Number(minimumPayment) / 1_000_000_000,
    updatedAt: stringValue(pool.updatedAt),
  };
};

const getTopOffer = async (
  env: Env,
  now = new Date(),
): Promise<MagicEdenTopOffer> => {
  const config = resolveMagicEdenConfig(env);
  const url = resolveMagicEdenUrl(config.baseUrl, DEFAULT_ME_POOLS_PATH);
  url.search = new URLSearchParams({
    collectionSymbol: config.collectionSymbol,
    limit: String(ME_POOL_LIMIT),
  }).toString();
  const data = await readMagicEdenJson<{ results?: MagicEdenPool[] }>(
    url,
    config,
  );
  const offer = selectHighestLiveOffer(
    Array.isArray(data.results) ? data.results : [],
    config.collectionSymbol,
    now,
  );
  if (!offer) {
    throw new SellRequestError(
      404,
      "NO_LIVE_OFFER",
      "No live Magic Eden offer is available",
    );
  }
  return offer;
};

const bearerToken = (request: Request) => {
  const authorization = request.headers.get("Authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
};

const authenticateWallet = async (
  request: Request,
  env: Env,
  walletAddress: string,
) => {
  const appId = env.PRIVY_APP_ID?.trim();
  const appSecret = env.PRIVY_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    throw new SellRequestError(
      503,
      "PRIVY_UNAVAILABLE",
      "Wallet authentication is temporarily unavailable",
    );
  }
  const token = bearerToken(request);
  if (!token) {
    throw new SellRequestError(401, "AUTH_REQUIRED", "Sign in with Privy first");
  }

  try {
    const client = new PrivyClient({
      appId,
      appSecret,
      ...(env.PRIVY_API_BASE_URL?.trim()
        ? { apiUrl: env.PRIVY_API_BASE_URL.trim() }
        : {}),
    });
    const claims = await client.utils().auth().verifyAccessToken(token);
    const user = await client.users()._get(claims.user_id);
    const ownsWallet = user.linked_accounts.some((account) => {
      const candidate = account as {
        type?: unknown;
        address?: unknown;
        chain_type?: unknown;
        wallet_client_type?: unknown;
      };
      return (
        candidate.type === "wallet" &&
        candidate.chain_type === "solana" &&
        candidate.wallet_client_type === "privy" &&
        candidate.address === walletAddress
      );
    });
    if (!ownsWallet) {
      throw new SellRequestError(
        403,
        "WALLET_NOT_LINKED",
        "This wallet is not linked to the signed-in Privy account",
      );
    }
  } catch (error) {
    if (error instanceof SellRequestError) throw error;
    throw new SellRequestError(
      401,
      "AUTH_INVALID",
      "Your Privy session could not be verified",
    );
  }
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

const validateSaleTransaction = (
  transaction: Uint8Array,
  seller: string,
  mint: string,
  pool: string,
) => {
  const sellerKey = new PublicKey(seller).toBase58();
  const mintKey = new PublicKey(mint).toBase58();
  const poolKey = new PublicKey(pool).toBase58();
  try {
    const versioned = VersionedTransaction.deserialize(transaction);
    const keys = versioned.message.staticAccountKeys.map((key) =>
      key.toBase58(),
    );
    const signers = keys.slice(
      0,
      versioned.message.header.numRequiredSignatures,
    );
    if (
      keys[0] !== sellerKey ||
      !signers.includes(sellerKey) ||
      !keys.includes(MAGIC_EDEN_MMM_PROGRAM) ||
      !keys.includes(mintKey) ||
      !keys.includes(poolKey)
    ) {
      return false;
    }
    return true;
  } catch {
    try {
      const legacy = Transaction.from(transaction);
      const message = legacy.compileMessage();
      const keys = message.accountKeys.map((key) => key.toBase58());
      const signers = keys.slice(0, message.header.numRequiredSignatures);
      return (
        keys[0] === sellerKey &&
        signers.includes(sellerKey) &&
        keys.includes(MAGIC_EDEN_MMM_PROGRAM) &&
        keys.includes(mintKey) &&
        keys.includes(poolKey)
      );
    } catch {
      return false;
    }
  }
};

const transactionPayloads = (value: unknown): Uint8Array[] => {
  if (typeof value === "string" && value.trim()) {
    const payloads: Uint8Array[] = [];
    if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(value)) {
      try {
        payloads.push(bs58.decode(value));
      } catch {
        // Try base64 below.
      }
    }
    try {
      payloads.push(base64ToBytes(value));
    } catch {
      // The validated result below will reject unsupported payloads.
    }
    return payloads;
  }
  if (
    value &&
    typeof value === "object" &&
    Array.isArray((value as { data?: unknown }).data)
  ) {
    return [
      Uint8Array.from((value as { data: number[] }).data),
    ];
  }
  return [];
};

const extractSaleTransaction = (
  response: Record<string, unknown>,
  seller: string,
  mint: string,
  pool: string,
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
      if (validateSaleTransaction(payload, seller, mint, pool)) return payload;
    }
  }
  throw new SellRequestError(
    502,
    "INVALID_SALE_TRANSACTION",
    "Magic Eden returned an invalid sale transaction",
  );
};

const requestSaleTransaction = async (
  env: Env,
  input: {
    seller: string;
    mint: string;
    offer: MagicEdenTopOffer;
  },
) => {
  const config = resolveMagicEdenConfig(env);
  if (!config.apiKey) {
    throw new SellRequestError(
      503,
      "MAGIC_EDEN_UNAVAILABLE",
      "Magic Eden trading is not configured",
    );
  }
  const url = resolveMagicEdenUrl(
    config.baseUrl,
    DEFAULT_ME_FULFILL_BUY_PATH,
  );
  url.search = new URLSearchParams({
    pool: input.offer.pool,
    assetAmount: "1",
    minPaymentAmount: input.offer.minimumPaymentSol.toFixed(9),
    seller: input.seller,
    assetMint: input.mint,
    // Metaplex Core assets use the asset account itself; they have no SPL ATA.
    assetTokenAccount: input.mint,
    skipDelist: "true",
  }).toString();
  const response = await readMagicEdenJson<Record<string, unknown>>(
    url,
    config,
  );
  return extractSaleTransaction(
    response,
    input.seller,
    input.mint,
    input.offer.pool,
  );
};

const enabled = (value?: string) =>
  ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");

const executionReferenceId = async (
  telegramUserId: string,
  executionId: string,
) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${telegramUserId}:${executionId}`),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `me-sell:${hex.slice(0, 56)}`;
};

const parseExecutionRequest = async (request: Request) => {
  let body: {
    telegramUserId?: unknown;
    walletAddress?: unknown;
    mint?: unknown;
    executionId?: unknown;
    minimumPaymentLamports?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    throw new SellRequestError(
      400,
      "INVALID_JSON",
      "A valid JSON request body is required",
    );
  }
  const telegramUserId = stringValue(body.telegramUserId);
  const walletAddress = stringValue(body.walletAddress);
  const mint = stringValue(body.mint);
  const executionId = stringValue(body.executionId);
  const minimumPaymentLamports = stringValue(body.minimumPaymentLamports);
  if (
    !telegramUserId ||
    !TELEGRAM_USER_ID_PATTERN.test(telegramUserId) ||
    !walletAddress ||
    !validSolanaAddress(walletAddress) ||
    !mint ||
    !validSolanaAddress(mint) ||
    !executionId ||
    !EXECUTION_ID_PATTERN.test(executionId) ||
    !minimumPaymentLamports ||
    !LAMPORTS_PATTERN.test(minimumPaymentLamports)
  ) {
    throw new SellRequestError(
      400,
      "INVALID_EXECUTION_REQUEST",
      "A valid Telegram account, wallet, Frog mint, execution ID, and payment floor are required",
    );
  }
  return {
    telegramUserId,
    walletAddress,
    mint,
    executionId,
    minimumPaymentLamports,
  };
};

const authorizeBackendExecution = (request: Request, env: Env) => {
  const authorization = authorizeTradingBotRequest(request, env);
  if (authorization === "missing") {
    throw new SellRequestError(
      503,
      "BACKEND_AUTH_UNAVAILABLE",
      "Backend execution authentication is not configured",
    );
  }
  if (authorization === "denied") {
    throw new SellRequestError(401, "UNAUTHORIZED", "Unauthorized");
  }
};

const handleError = (error: unknown) => {
  if (error instanceof SellRequestError) {
    return json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  console.error("[me-sell] Unexpected request failure");
  return json(
    { error: "The sale transaction could not be prepared" },
    { status: 500 },
  );
};

export const getMagicEdenTopOffer = async (
  _request: Request,
  env: Env,
): Promise<Response> => {
  try {
    return json({ offer: await getTopOffer(env) });
  } catch (error) {
    return handleError(error);
  }
};

export const postMagicEdenSellTransaction = async (
  request: Request,
  env: Env,
): Promise<Response> => {
  try {
    const body = (await request.json()) as {
      walletAddress?: unknown;
      mint?: unknown;
    };
    const walletAddress = stringValue(body.walletAddress);
    const mint = stringValue(body.mint);
    if (
      !walletAddress ||
      !mint ||
      !validSolanaAddress(walletAddress) ||
      !validSolanaAddress(mint)
    ) {
      throw new SellRequestError(
        400,
        "INVALID_SALE_REQUEST",
        "A valid walletAddress and Frog mint are required",
      );
    }

    await authenticateWallet(request, env, walletAddress);
    const holdings = await fetchWalletNftHoldings(env, {
      walletAddress,
      page: 1,
      limit: 50,
      collectionAddress: BUSINESS_FROG_COLLECTION,
    });
    if (!holdings.items.some((item) => item.mint === mint)) {
      throw new SellRequestError(
        409,
        "FROG_NOT_OWNED",
        "This wallet no longer owns that Business Frog",
      );
    }

    const offer = await getTopOffer(env);
    const transaction = await requestSaleTransaction(env, {
      seller: walletAddress,
      mint,
      offer,
    });
    return json({
      transaction: bytesToBase64(transaction),
      encoding: "base64",
      chain: "solana:mainnet",
      walletAddress,
      mint,
      offer,
      expiresAt: new Date(Date.now() + 45_000).toISOString(),
    });
  } catch (error) {
    return handleError(error);
  }
};

export const postMagicEdenSellExecution = async (
  request: Request,
  env: Env,
): Promise<Response> => {
  try {
    authorizeBackendExecution(request, env);
    if (!enabled(env.MAGIC_EDEN_SELL_EXECUTION_ENABLED)) {
      throw new SellRequestError(
        503,
        "EXECUTION_DISABLED",
        "Magic Eden backend sale execution is disabled",
      );
    }
    const missing = managedSolanaExecutionMissingRequirements(env);
    if (missing.length > 0) {
      return json(
        { status: "not_configured", required: missing },
        { status: 503 },
      );
    }

    const input = await parseExecutionRequest(request);
    const managedWallet = await getManagedPrivyWallet(
      env,
      input.telegramUserId,
      input.walletAddress,
    );
    if ("error" in managedWallet) {
      throw new SellRequestError(
        managedWallet.status,
        "MANAGED_WALLET_UNAVAILABLE",
        managedWallet.error,
      );
    }
    const holdings = await fetchWalletNftHoldings(env, {
      walletAddress: input.walletAddress,
      page: 1,
      limit: 50,
      collectionAddress: BUSINESS_FROG_COLLECTION,
    });
    if (!holdings.items.some((item) => item.mint === input.mint)) {
      throw new SellRequestError(
        409,
        "FROG_NOT_OWNED",
        "This wallet no longer owns that Business Frog",
      );
    }

    const offer = await getTopOffer(env);
    if (
      BigInt(offer.minimumPaymentLamports) <
      BigInt(input.minimumPaymentLamports)
    ) {
      throw new SellRequestError(
        409,
        "OFFER_BELOW_FLOOR",
        "The live Magic Eden offer fell below the approved payment floor",
      );
    }
    const transaction = await requestSaleTransaction(env, {
      seller: input.walletAddress,
      mint: input.mint,
      offer,
    });
    const referenceId = await executionReferenceId(
      input.telegramUserId,
      input.executionId,
    );
    let execution;
    try {
      execution = await signAndSendManagedSolanaTransaction(env, {
        walletId: managedWallet.wallet.walletId,
        transactionBase64: bytesToBase64(transaction),
        referenceId,
      });
    } catch (error) {
      if (
        error instanceof PrivyWalletRpcError &&
        error.status >= 400 &&
        error.status < 500 &&
        ![408, 409, 425, 429].includes(error.status)
      ) {
        return json(
          {
            status: "rejected",
            code: "PRIVY_REJECTED_TRANSACTION",
            privyStatus: error.status,
            privyFailureKind: error.kind,
            referenceId,
            walletAddress: input.walletAddress,
            mint: input.mint,
            offer,
            error: "Privy rejected the sale transaction before broadcast.",
          },
          { status: 502 },
        );
      }
      return json(
        {
          status: "pending_reconciliation",
          privyStatus:
            error instanceof PrivyWalletRpcError && error.status > 0
              ? error.status
              : null,
          privyFailureKind:
            error instanceof PrivyWalletRpcError ? error.kind : "unknown",
          referenceId,
          walletAddress: input.walletAddress,
          mint: input.mint,
          offer,
          error:
            "The Privy response was not confirmed. Check this execution ID before attempting another sale.",
        },
        { status: 503 },
      );
    }
    if (!execution.signature) {
      return json(
        {
          status: "pending_reconciliation",
          transactionId: execution.transactionId,
          referenceId: execution.referenceId,
          walletAddress: input.walletAddress,
          mint: input.mint,
          offer,
          error:
            "Privy accepted the request without returning a transaction signature.",
        },
        { status: 503 },
      );
    }
    return json({
      status: "executed",
      mode: "privy_sign_and_send",
      signature: execution.signature,
      transactionId: execution.transactionId,
      referenceId: execution.referenceId,
      caip2: execution.caip2,
      walletAddress: input.walletAddress,
      mint: input.mint,
      offer,
      solscanUrl: `https://solscan.io/tx/${execution.signature}`,
      executedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleError(error);
  }
};

export const postMagicEdenSellExecutionStatus = async (
  request: Request,
  env: Env,
): Promise<Response> => {
  try {
    authorizeBackendExecution(request, env);
    const input = await parseExecutionRequest(request);
    const managedWallet = await getManagedPrivyWallet(
      env,
      input.telegramUserId,
      input.walletAddress,
    );
    if ("error" in managedWallet) {
      throw new SellRequestError(
        managedWallet.status,
        "MANAGED_WALLET_UNAVAILABLE",
        managedWallet.error,
      );
    }
    const referenceId = await executionReferenceId(
      input.telegramUserId,
      input.executionId,
    );
    const transaction = await getManagedSolanaTransactionStatus(
      env,
      referenceId,
    );
    if (!transaction) {
      return json({
        status: "not_found",
        referenceId,
        error: "Privy has not returned a transaction for this execution ID.",
      });
    }
    if (
      transaction.walletId !== managedWallet.wallet.walletId ||
      transaction.caip2 !== SOLANA_MAINNET_CAIP2
    ) {
      throw new SellRequestError(
        409,
        "EXECUTION_MISMATCH",
        "The Privy transaction does not match Wallet 2 on Solana",
      );
    }
    const terminalSuccess =
      transaction.status === "confirmed" ||
      transaction.status === "finalized";
    const terminalFailure = [
      "execution_reverted",
      "failed",
      "provider_error",
      "replaced",
    ].includes(transaction.status);
    return json({
      status: terminalSuccess
        ? "executed"
        : terminalFailure
          ? "failed"
          : "pending",
      providerStatus: transaction.status,
      signature: transaction.signature,
      transactionId: transaction.transactionId,
      referenceId: transaction.referenceId,
      solscanUrl: transaction.signature
        ? `https://solscan.io/tx/${transaction.signature}`
        : null,
    });
  } catch (error) {
    return handleError(error);
  }
};
