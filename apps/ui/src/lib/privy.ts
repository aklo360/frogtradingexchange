export type PrivySolanaWallet = {
  id: string | null;
  address: string;
  embedded: boolean;
  walletIndex: number | null;
};

type UnknownRecord = Record<string, unknown>;

const stringField = (record: UnknownRecord, ...keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
};

const numberField = (record: UnknownRecord, ...keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0
    ) {
      return value;
    }
  }
  return null;
};

export const getPrivySolanaWallets = (
  linkedAccounts: readonly unknown[] | null | undefined,
): PrivySolanaWallet[] => {
  const wallets = new Map<
    string,
    PrivySolanaWallet & { sourceIndex: number }
  >();

  for (const [sourceIndex, account] of (linkedAccounts ?? []).entries()) {
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
      embedded:
        walletClientType === "privy" || walletClientType === "privy-v2",
      walletIndex: numberField(record, "walletIndex", "wallet_index"),
      sourceIndex,
    });
  }

  return [...wallets.values()]
    .sort((left, right) => {
      if (left.embedded !== right.embedded) {
        return Number(right.embedded) - Number(left.embedded);
      }
      if (left.embedded && right.embedded) {
        if (left.walletIndex === null && right.walletIndex !== null) return 1;
        if (left.walletIndex !== null && right.walletIndex === null) return -1;
        if (
          left.walletIndex !== null &&
          right.walletIndex !== null &&
          left.walletIndex !== right.walletIndex
        ) {
          return left.walletIndex - right.walletIndex;
        }
      }
      return left.sourceIndex - right.sourceIndex;
    })
    .map(({ id, address, embedded, walletIndex }) => ({
      id,
      address,
      embedded,
      walletIndex,
    }));
};

export const getProfileNftWalletAddresses = (
  wallets: readonly PrivySolanaWallet[],
  connectedAddress?: string | null,
) => {
  let embeddedWalletIncluded = false;
  return [
    ...new Set([
      ...wallets
        .filter((wallet) => {
          if (!wallet.embedded) return true;
          if (embeddedWalletIncluded) return false;
          embeddedWalletIncluded = true;
          return true;
        })
        .map((wallet) => wallet.address),
      ...(connectedAddress?.trim() ? [connectedAddress.trim()] : []),
    ]),
  ];
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
