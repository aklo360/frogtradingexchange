import { PrivyClient } from "@privy-io/node";
import type { Env } from "./env";

type BotAction = "swap" | "buy-floor";

type TradeIntentBody = {
  action?: string;
  telegramUserId?: string | number;
  telegramUsername?: string;
  chatId?: string | number;
  chatType?: string;
  text?: string;
  params?: Record<string, unknown>;
};

type EnsureTelegramAccountBody = {
  telegramUserId?: string | number;
  telegramUsername?: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
};

type PrivyLinkedAccountLike = {
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

type AccountWalletSummary = {
  id: string | null;
  address: string;
  chainType: string | null;
  connectorType: string | null;
  delegated: boolean;
  walletClient: string | null;
  walletClientType: string | null;
  tradeableByRibbot: boolean;
};

type PrivyUserLike = {
  id: string;
  linked_accounts?: PrivyLinkedAccountLike[];
};

type PrivyWalletLike = {
  id?: string | null;
  address?: string | null;
  chain_type?: string;
};

type PrivyAccountClientLike = {
  users(): {
    getByTelegramUserID(input: { telegram_user_id: string }): Promise<PrivyUserLike>;
    create(input: {
      linked_accounts: Array<{
        type: "telegram";
        telegram_user_id: string;
        username?: string;
        first_name?: string;
        last_name?: string;
        photo_url?: string;
      }>;
      custom_metadata?: Record<string, string | number | boolean>;
    }): Promise<PrivyUserLike>;
  };
  wallets(): {
    create(input: {
      chain_type: "solana";
      owner: { user_id: string };
      display_name?: string;
      external_id?: string;
      additional_signers?: Array<{
        signer_id: string;
        override_policy_ids?: string[];
      }>;
      policy_ids?: string[];
      idempotency_key?: string;
    }): Promise<PrivyWalletLike>;
  };
};

type EnsureDeps = {
  createPrivyClient?: (env: Env) => PrivyAccountClientLike;
};

type AccountPolicy = {
  maxTradeSol: number;
  dailySpendSol: number;
  maxSlippageBps: number;
  intentTtlSeconds: number;
  allowedActions: BotAction[];
  requiresTelegramDmConfirmation: boolean;
};

type TelegramAccountSetupReadiness = {
  accountModeEnabled: boolean;
  botApiAuthConfigured: boolean;
  privyAppCredentialsConfigured: boolean;
  privySignerIdConfigured: boolean;
};

const DEFAULT_MAX_TRADE_SOL = 0.25;
const DEFAULT_DAILY_SPEND_SOL = 1;
const DEFAULT_MAX_SLIPPAGE_BPS = 100;
const DEFAULT_INTENT_TTL_SECONDS = 120;
const DEFAULT_MAX_NFT_SWEEP_QUANTITY = 10;
const DEFAULT_MAX_NFT_TOTAL_SOL = 1;

const json = (data: unknown, init?: ResponseInit) => Response.json(data, init);

const parseBool = (value: string | undefined) => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const parsePositiveNumber = (value: string | undefined, fallback: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const parsePositiveInteger = (
  value: string | undefined,
  fallback: number,
  max: number,
) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0
    ? Math.min(Math.floor(numeric), max)
    : fallback;
};

const getPolicy = (env: Env): AccountPolicy => ({
  maxTradeSol: parsePositiveNumber(
    env.FROGX_BOT_MAX_TRADE_SOL,
    DEFAULT_MAX_TRADE_SOL,
  ),
  dailySpendSol: parsePositiveNumber(
    env.FROGX_BOT_DAILY_SPEND_SOL,
    DEFAULT_DAILY_SPEND_SOL,
  ),
  maxSlippageBps: Math.round(
    parsePositiveNumber(
      env.FROGX_BOT_MAX_SLIPPAGE_BPS,
      DEFAULT_MAX_SLIPPAGE_BPS,
    ),
  ),
  intentTtlSeconds: Math.round(
    parsePositiveNumber(
      env.FROGX_BOT_INTENT_TTL_SECONDS,
      DEFAULT_INTENT_TTL_SECONDS,
    ),
  ),
  allowedActions: ["swap", "buy-floor"],
  requiresTelegramDmConfirmation: true,
});

const getBearerToken = (request: Request) => {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
};

const constantTimeEqual = async (left: string, right: string) => {
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let diff = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ (rightBytes[index] ?? 0);
  }
  return diff === 0;
};

const normalizeAction = (value: string | undefined): BotAction | null => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "swap" || normalized === "buy-floor") return normalized;
  return null;
};

const safeString = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : undefined;

const safeTelegramId = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  return /^\d{1,32}$/.test(normalized) ? normalized : "";
};

export const hasConfiguredBotAuth = (env: Env) =>
  Boolean(env.FROGX_BOT_API_TOKEN?.trim());

export const isAuthorizedBot = async (request: Request, env: Env) => {
  const expected = env.FROGX_BOT_API_TOKEN?.trim();
  if (!expected) return false;
  const received = getBearerToken(request);
  if (!received) return false;
  return constantTimeEqual(received, expected);
};

const getPrivyServerAppId = (env: Env) =>
  env.PRIVY_APP_ID?.trim() || env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() || "";

const getPrivyServerAppIdConfigured = (env: Env) =>
  Boolean(getPrivyServerAppId(env));

const getPrivyWebAppIdConfigured = (env: Env) =>
  Boolean(env.NEXT_PUBLIC_PRIVY_APP_ID?.trim());

const getPrivyCredentialsConfigured = (env: Env) =>
  Boolean(getPrivyServerAppIdConfigured(env) && env.PRIVY_APP_SECRET?.trim());

const getPrivyBotWalletCreationConfigured = (env: Env) =>
  getPrivyCredentialsConfigured(env) && Boolean(env.PRIVY_SIGNER_ID?.trim());

const getTelegramAccountSetupReadiness = (
  env: Env,
  accountModeEnabled = parseBool(env.FROGX_ACCOUNT_MODE_ENABLED),
): TelegramAccountSetupReadiness => ({
  accountModeEnabled,
  botApiAuthConfigured: hasConfiguredBotAuth(env),
  privyAppCredentialsConfigured: getPrivyCredentialsConfigured(env),
  privySignerIdConfigured: Boolean(env.PRIVY_SIGNER_ID?.trim()),
});

const getReadinessMissing = <T extends Record<string, boolean>>(readiness: T) =>
  Object.fromEntries(
    Object.entries(readiness).filter(([, ready]) => ready === false),
  ) as Partial<Record<keyof T, false>>;

const createPrivyAccountClient = (env: Env): PrivyAccountClientLike => {
  const appId = getPrivyServerAppId(env);
  const appSecret = env.PRIVY_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    throw new Error("PRIVY_APP_CREDENTIALS_MISSING");
  }
  return new PrivyClient({ appId, appSecret }) as unknown as PrivyAccountClientLike;
};

const readPolicyIds = (env: Env) =>
  (env.PRIVY_POLICY_IDS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 1);

const buildAdditionalSigners = (env: Env) => {
  const signerId = env.PRIVY_SIGNER_ID?.trim();
  if (!signerId) return undefined;
  const policyIds = readPolicyIds(env);
  return [
    {
      signer_id: signerId,
      ...(policyIds.length ? { override_policy_ids: policyIds } : {}),
    },
  ];
};

const buildWalletInput = (env: Env) => {
  const policyIds = readPolicyIds(env);
  return {
    chain_type: "solana" as const,
    ...(buildAdditionalSigners(env)
      ? { additional_signers: buildAdditionalSigners(env) }
      : {}),
    ...(policyIds.length ? { policy_ids: policyIds } : {}),
  };
};

const getErrorStatus = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "status" in error &&
  typeof (error as { status?: unknown }).status === "number"
    ? (error as { status: number }).status
    : undefined;

const getPrivyUserByTelegramId = async (
  client: PrivyAccountClientLike,
  telegramUserId: string,
) => {
  try {
    return await client.users().getByTelegramUserID({
      telegram_user_id: telegramUserId,
    });
  } catch (error) {
    if (getErrorStatus(error) === 404) return null;
    throw error;
  }
};

const selectDelegatedEmbeddedSolanaWallet = (user: PrivyUserLike) => {
  const accounts = Array.isArray(user.linked_accounts) ? user.linked_accounts : [];
  return (
    accounts.find(
      (account) =>
        account.type === "wallet" &&
        account.chain_type === "solana" &&
        account.connector_type === "embedded" &&
        account.delegated === true &&
        Boolean(account.address) &&
        Boolean(account.id) &&
        (account.wallet_client_type === "privy" ||
          account.wallet_client === "privy"),
    ) ?? null
  );
};

const normalizeAccountWallet = (
  account: PrivyLinkedAccountLike | PrivyWalletLike,
  options: { tradeableByRibbot?: boolean } = {},
): AccountWalletSummary | null => {
  const address =
    "address" in account
      ? account.address?.trim()
      : undefined;
  if (!address) return null;

  const linkedAccount =
    "type" in account ? (account as PrivyLinkedAccountLike) : null;
  return {
    id: account.id ?? null,
    address,
    chainType: account.chain_type ?? null,
    connectorType: linkedAccount?.connector_type ?? null,
    delegated: linkedAccount?.delegated === true || options.tradeableByRibbot === true,
    walletClient: linkedAccount?.wallet_client ?? null,
    walletClientType: linkedAccount?.wallet_client_type ?? null,
    tradeableByRibbot: options.tradeableByRibbot === true,
  };
};

const listAccountWallets = (
  user: PrivyUserLike,
  ribbotWallet: PrivyLinkedAccountLike | PrivyWalletLike | null,
) => {
  const wallets = new Map<string, AccountWalletSummary>();
  const accounts = Array.isArray(user.linked_accounts) ? user.linked_accounts : [];
  for (const account of accounts) {
    if (account.type !== "wallet") continue;
    const normalized = normalizeAccountWallet(account, {
      tradeableByRibbot: Boolean(
        ribbotWallet?.id &&
          account.id &&
          account.id === ribbotWallet.id,
      ),
    });
    if (normalized) wallets.set(normalized.address, normalized);
  }

  const normalizedRibbotWallet = ribbotWallet
    ? normalizeAccountWallet(ribbotWallet, { tradeableByRibbot: true })
    : null;
  if (normalizedRibbotWallet) {
    wallets.set(normalizedRibbotWallet.address, normalizedRibbotWallet);
  }

  return [...wallets.values()];
};

const buildTelegramLinkedAccount = (
  body: EnsureTelegramAccountBody,
  telegramUserId: string,
) => ({
  type: "telegram" as const,
  telegram_user_id: telegramUserId,
  ...(safeString(body.telegramUsername, 64)
    ? { username: safeString(body.telegramUsername, 64) }
    : {}),
  ...(safeString(body.firstName, 64)
    ? { first_name: safeString(body.firstName, 64) }
    : {}),
  ...(safeString(body.lastName, 64)
    ? { last_name: safeString(body.lastName, 64) }
    : {}),
  ...(safeString(body.photoUrl, 280)
    ? { photo_url: safeString(body.photoUrl, 280) }
    : {}),
});

const createOrGetTelegramPrivyUser = async (
  client: PrivyAccountClientLike,
  body: EnsureTelegramAccountBody,
  telegramUserId: string,
) => {
  const existingUser = await getPrivyUserByTelegramId(client, telegramUserId);
  if (existingUser) {
    return { user: existingUser, userCreated: false };
  }

  try {
    const user = await client.users().create({
      linked_accounts: [buildTelegramLinkedAccount(body, telegramUserId)],
      custom_metadata: {
        created_from: "ribbot_telegram",
      },
    });
    return { user, userCreated: true };
  } catch (error) {
    const status = getErrorStatus(error);
    if (status === 400 || status === 409) {
      const racedUser = await getPrivyUserByTelegramId(client, telegramUserId);
      if (racedUser) {
        return { user: racedUser, userCreated: false };
      }
    }
    throw error;
  }
};

export const getAccountConfig = (env: Env) => {
  const accountModeEnabled = parseBool(env.FROGX_ACCOUNT_MODE_ENABLED);
  const botTradingEnabled = parseBool(env.FROGX_BOT_TRADING_ENABLED);
  const privyServerAppIdConfigured = getPrivyServerAppIdConfigured(env);
  const privyWebAppIdConfigured = getPrivyWebAppIdConfigured(env);
  const privyAppIdConfigured =
    privyServerAppIdConfigured || privyWebAppIdConfigured;
  const telegramBotAccountCreationEnabled =
    accountModeEnabled &&
    hasConfiguredBotAuth(env) &&
    getPrivyBotWalletCreationConfigured(env);
  const telegramAccountSetupReadiness = getTelegramAccountSetupReadiness(
    env,
    accountModeEnabled,
  );
  const ftxWebAccountCreationEnabled =
    accountModeEnabled && privyWebAppIdConfigured;
  const executionEnabled =
    accountModeEnabled &&
    botTradingEnabled &&
    parseBool(env.FROGX_BOT_EXECUTION_ENABLED) &&
    hasConfiguredBotAuth(env) &&
    Boolean(env.PRIVY_APP_SECRET?.trim()) &&
    Boolean(env.PRIVY_AUTHORIZATION_PRIVATE_KEY?.trim());

  return {
    accountModeEnabled,
    accountCreation: {
      ftxWebEnabled: ftxWebAccountCreationEnabled,
      telegramBotEnabled: telegramBotAccountCreationEnabled,
      surfaces: [
        ...(ftxWebAccountCreationEnabled ? ["ftx"] : []),
        ...(telegramBotAccountCreationEnabled ? ["telegram"] : []),
      ],
      convergenceKey: "telegram_user_id",
      requiresTelegramLinkForRibbot: true,
      telegramSetupReadiness: telegramAccountSetupReadiness,
      telegramSetupMissing: getReadinessMissing(telegramAccountSetupReadiness),
    },
    privy: {
      configured: privyAppIdConfigured,
      webAppIdConfigured: privyWebAppIdConfigured,
      serverAppIdConfigured: privyServerAppIdConfigured,
      jwksConfigured: Boolean(env.PRIVY_JWKS_URL?.trim()),
      appSecretConfigured: Boolean(env.PRIVY_APP_SECRET?.trim()),
      signerConfigured: Boolean(env.PRIVY_AUTHORIZATION_PRIVATE_KEY?.trim()),
      signerIdConfigured: Boolean(env.PRIVY_SIGNER_ID?.trim()),
      appFirstTelegramLinking: true,
      telegramBotAccountCreationEnabled,
      embeddedSolanaHotWallet: true,
      externalWalletsVerificationOnly: true,
    },
    bot: {
      tradingEnabled: botTradingEnabled,
      executionEnabled,
      apiAuthConfigured: hasConfiguredBotAuth(env),
      confirmation: "telegram_dm",
    },
    nftPurchases: {
      userWalletExecutionEnabled: true,
      telegramButtonExecutionEnabled: executionEnabled,
      maxSweepQuantity: parsePositiveInteger(
        env.FROGX_NFT_MAX_SWEEP_QUANTITY,
        DEFAULT_MAX_NFT_SWEEP_QUANTITY,
        DEFAULT_MAX_NFT_SWEEP_QUANTITY,
      ),
      maxTotalSol: parsePositiveNumber(
        env.FROGX_NFT_MAX_TOTAL_SOL,
        DEFAULT_MAX_NFT_TOTAL_SOL,
      ),
      executionRequiresUserWalletSignature: !executionEnabled,
      telegramTextExecutesTrades: false,
      telegramButtonExecutesTrades: executionEnabled,
    },
    policy: getPolicy(env),
    safety: {
      ribbotHoldsPrivateKeys: false,
      linkedExternalWalletsTradeableByBot: false,
      liveExecutionRequiresPrivySignerPolicies: true,
    },
  };
};

export async function getAccountConfigRoute(env: Env): Promise<Response> {
  return json(getAccountConfig(env), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function postTelegramAccountProbe(
  request: Request,
  env: Env,
): Promise<Response> {
  const config = getAccountConfig(env);
  if (!hasConfiguredBotAuth(env)) {
    return json(
      {
        ready: false,
        mutates: false,
        error: "Bot API auth is not configured",
        missing: config.accountCreation.telegramSetupMissing,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!(await isAuthorizedBot(request, env))) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  return json(
    {
      ready: config.accountCreation.telegramBotEnabled,
      mutates: false,
      accountCreation: config.accountCreation,
      missing: config.accountCreation.telegramSetupMissing,
      nextStep: config.accountCreation.telegramBotEnabled
        ? "Ribbot can create or find Telegram-linked FTX accounts."
        : "Telegram account setup is blocked until the missing server-side gates are configured.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function postEnsureTelegramAccount(
  request: Request,
  env: Env,
  deps: EnsureDeps = {},
): Promise<Response> {
  const config = getAccountConfig(env);
  if (!config.accountModeEnabled) {
    return json(
      {
        error: "FrogX account mode is not enabled",
        missing: config.accountCreation.telegramSetupMissing,
      },
      { status: 503 },
    );
  }
  if (!hasConfiguredBotAuth(env)) {
    return json(
      {
        error: "Bot API auth is not configured",
        missing: config.accountCreation.telegramSetupMissing,
      },
      { status: 503 },
    );
  }
  if (!(await isAuthorizedBot(request, env))) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!getPrivyCredentialsConfigured(env)) {
    return json(
      {
        error: "Privy app credentials are not configured",
        missing: config.accountCreation.telegramSetupMissing,
      },
      { status: 503 },
    );
  }
  if (!env.PRIVY_SIGNER_ID?.trim()) {
    return json(
      {
        error: "Privy signer id is not configured",
        missing: config.accountCreation.telegramSetupMissing,
      },
      { status: 503 },
    );
  }

  let body: EnsureTelegramAccountBody;
  try {
    body = (await request.json()) as EnsureTelegramAccountBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const telegramUserId = safeTelegramId(body.telegramUserId);
  if (!telegramUserId) {
    return json({ error: "Telegram user id is required" }, { status: 400 });
  }

  try {
    const client = (deps.createPrivyClient ?? createPrivyAccountClient)(env);
    const { user, userCreated } = await createOrGetTelegramPrivyUser(
      client,
      body,
      telegramUserId,
    );

    const existingWallet = selectDelegatedEmbeddedSolanaWallet(user);
    const createdWallet = existingWallet
      ? null
      : await client.wallets().create({
          ...buildWalletInput(env),
          owner: { user_id: user.id },
          display_name: "FTX Telegram Wallet",
          external_id: `tg_${telegramUserId}`.slice(0, 64),
          idempotency_key: `frogx-telegram-wallet-${telegramUserId}`,
        });

    const walletAddress = existingWallet?.address ?? createdWallet?.address ?? null;
    const walletId = existingWallet?.id ?? createdWallet?.id ?? null;
    const accountWallets = listAccountWallets(user, existingWallet ?? createdWallet);

    return json(
      {
        source: "privy",
        userCreated,
        walletCreated: !existingWallet && Boolean(createdWallet),
        walletDelegated: Boolean(existingWallet || createdWallet),
        telegramUserId,
        telegramUsername: safeString(body.telegramUsername, 64) ?? null,
        userId: user.id,
        wallet: walletAddress
          ? {
              id: walletId,
              address: walletAddress,
              chainType: "solana",
            }
          : null,
        wallets: accountWallets,
        ready: Boolean(walletAddress),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "[account] Failed to ensure Telegram account",
      error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
    );
    return json(
      { error: "Telegram account setup temporarily unavailable" },
      { status: 502 },
    );
  }
}

export async function postTradeIntent(
  request: Request,
  env: Env,
): Promise<Response> {
  const config = getAccountConfig(env);

  let body: TradeIntentBody;
  try {
    body = (await request.json()) as TradeIntentBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = normalizeAction(body.action);
  if (!action) {
    return json({ error: "Unsupported trade intent action" }, { status: 400 });
  }

  if (config.bot.tradingEnabled && !(await isAuthorizedBot(request, env))) {
    return json(
      {
        error: config.bot.apiAuthConfigured
          ? "Unauthorized"
          : "Bot API auth is not configured",
      },
      { status: config.bot.apiAuthConfigured ? 401 : 503 },
    );
  }

  const now = Date.now();
  const expiresAt = new Date(
    now + config.policy.intentTtlSeconds * 1000,
  ).toISOString();
  const userWalletExecutionEnabled =
    action === "buy-floor" &&
    config.accountModeEnabled &&
    config.nftPurchases.userWalletExecutionEnabled;
  const status = config.bot.executionEnabled
    ? "pending_dm_confirmation"
    : config.accountModeEnabled
      ? "execution_disabled"
      : "account_mode_disabled";

  return json(
    {
      intentId: crypto.randomUUID(),
      status,
      action,
      executionEnabled: config.bot.executionEnabled,
      userWalletExecutionEnabled,
      confirmationRequired: "telegram_dm",
      expiresAt,
      policy: config.policy,
      nftPurchases: config.nftPurchases,
      accountModeEnabled: config.accountModeEnabled,
      request: {
        telegramUserId: safeString(String(body.telegramUserId ?? ""), 64),
        telegramUsername: safeString(body.telegramUsername, 64),
        chatId: safeString(String(body.chatId ?? ""), 64),
        chatType: safeString(body.chatType, 32),
        text: safeString(body.text, 280),
        params: body.params && typeof body.params === "object" ? body.params : {},
      },
      nextStep: config.bot.executionEnabled
        ? "Confirm this intent in the user's Telegram DM before execution."
        : config.accountModeEnabled
          ? "Telegram execution is blocked until bot auth, Privy app secret, and Privy authorization signer are configured."
          : "FrogX account mode and Privy signer policy enforcement must be enabled before this can execute.",
    },
    {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
