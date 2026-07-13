export type PrivySolanaWallet = {
  id: string | null;
  address: string;
  embedded: boolean;
};

type UnknownRecord = Record<string, unknown>;

const stringField = (record: UnknownRecord, ...keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
};

export const getPrivySolanaWallets = (
  linkedAccounts: readonly unknown[] | null | undefined,
): PrivySolanaWallet[] => {
  const wallets = new Map<string, PrivySolanaWallet>();

  for (const account of linkedAccounts ?? []) {
    if (!account || typeof account !== "object") continue;
    const record = account as UnknownRecord;
    if (stringField(record, "type") !== "wallet") continue;
    if (stringField(record, "chainType", "chain_type") !== "solana") continue;

    const address = stringField(record, "address");
    if (!address) continue;
    const walletClientType = stringField(
      record,
      "walletClientType",
      "wallet_client_type",
    );

    wallets.set(address, {
      id: stringField(record, "id") ?? null,
      address,
      embedded: walletClientType === "privy",
    });
  }

  return [...wallets.values()].sort(
    (left, right) => Number(right.embedded) - Number(left.embedded),
  );
};

export const getTelegramAccount = (
  linkedAccounts: readonly unknown[] | null | undefined,
) => {
  for (const account of linkedAccounts ?? []) {
    if (!account || typeof account !== "object") continue;
    const record = account as UnknownRecord;
    if (stringField(record, "type") !== "telegram") continue;
    return {
      userId:
        stringField(record, "telegramUserId", "telegram_user_id") ?? null,
      username: stringField(record, "username") ?? null,
      firstName: stringField(record, "firstName", "first_name") ?? null,
    };
  }
  return null;
};
