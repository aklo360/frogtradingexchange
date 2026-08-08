import { PrivyClient } from "@privy-io/node";

import type { Env } from "./env";
import { getAuthenticatedTradingBotPerpsWalletSnapshot } from "./tradingBot";

const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TELEGRAM_USER_ID_PATTERN = /^\d{1,32}$/;

type UnknownRecord = Record<string, unknown>;

const json = (data: unknown, init?: ResponseInit) =>
  Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...init?.headers,
    },
  });

const stringField = (record: UnknownRecord, ...keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

const bearerToken = (request: Request) => {
  const authorization = request.headers.get("Authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
};

const accountRecords = (value: unknown): UnknownRecord[] =>
  Array.isArray(value)
    ? value.filter(
        (account): account is UnknownRecord =>
          Boolean(account) && typeof account === "object",
      )
    : [];

const telegramUserIdFromAccounts = (accounts: UnknownRecord[]) => {
  const telegram = accounts.find(
    (account) => stringField(account, "type") === "telegram",
  );
  if (!telegram) return null;
  const userId = stringField(
    telegram,
    "telegram_user_id",
    "telegramUserId",
  );
  return userId && TELEGRAM_USER_ID_PATTERN.test(userId) ? userId : null;
};

const primaryEmbeddedSolanaWallet = (accounts: UnknownRecord[]) => {
  const wallets = accounts
    .map((account, sourceIndex) => {
      const walletClientType = stringField(
        account,
        "wallet_client_type",
        "walletClientType",
        "walletClient",
      );
      const address = stringField(account, "address");
      const rawIndex = account.wallet_index ?? account.walletIndex;
      const walletIndex =
        typeof rawIndex === "number" &&
        Number.isInteger(rawIndex) &&
        rawIndex >= 0
          ? rawIndex
          : null;
      return {
        sourceIndex,
        address,
        walletIndex,
        valid:
          stringField(account, "type") === "wallet" &&
          stringField(account, "chain_type", "chainType") === "solana" &&
          (walletClientType === "privy" || walletClientType === "privy-v2") &&
          Boolean(address && SOLANA_ADDRESS_PATTERN.test(address)),
      };
    })
    .filter((wallet) => wallet.valid && wallet.address)
    .sort((left, right) => {
      if (left.walletIndex === 0 && right.walletIndex !== 0) return -1;
      if (right.walletIndex === 0 && left.walletIndex !== 0) return 1;
      if (left.walletIndex === null && right.walletIndex !== null) return 1;
      if (right.walletIndex === null && left.walletIndex !== null) return -1;
      if (
        left.walletIndex !== null &&
        right.walletIndex !== null &&
        left.walletIndex !== right.walletIndex
      ) {
        return left.walletIndex - right.walletIndex;
      }
      return left.sourceIndex - right.sourceIndex;
    });

  return wallets[0]?.address ?? null;
};

export async function getProfilePerpsWallet(
  request: Request,
  env: Env,
): Promise<Response> {
  const appId = env.PRIVY_APP_ID?.trim();
  const appSecret = env.PRIVY_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    return json(
      { error: "Wallet authentication is temporarily unavailable" },
      { status: 503 },
    );
  }

  const token = bearerToken(request);
  if (!token) {
    return json({ error: "Sign in with Privy first" }, { status: 401 });
  }

  const client = new PrivyClient({
    appId,
    appSecret,
    ...(env.PRIVY_API_BASE_URL?.trim()
      ? { apiUrl: env.PRIVY_API_BASE_URL.trim() }
      : {}),
  });

  let privyUserId: string;
  let accounts: UnknownRecord[];
  try {
    const claims = await client.utils().auth().verifyAccessToken(token);
    const user = await client.users()._get(claims.user_id);
    privyUserId = claims.user_id;
    accounts = accountRecords(user.linked_accounts);
  } catch {
    return json(
      { error: "Your Privy session could not be verified" },
      { status: 401 },
    );
  }

  const telegramUserId = telegramUserIdFromAccounts(accounts);
  const authorityWalletAddress = primaryEmbeddedSolanaWallet(accounts);

  if (!telegramUserId || !authorityWalletAddress) {
    return json({ status: "not_connected" });
  }

  const resolution = await getAuthenticatedTradingBotPerpsWalletSnapshot(
    env,
    {
      telegramUserId,
      privyUserId,
      authorityWalletAddress,
    },
  );
  if ("error" in resolution) {
    if (resolution.status === 404 || resolution.status === 409) {
      return json({ status: "not_connected" });
    }
    return json(
      { error: resolution.error },
      { status: resolution.status },
    );
  }

  return json({ status: "ready", ...resolution.snapshot });
}
