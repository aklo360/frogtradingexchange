import { getPrivySolanaWallets, getTelegramAccount } from "@/lib/privy";

export type ControlWallet = {
  walletId: string;
  label: string;
  role?: "spot_nft" | "portfolio";
  walletSource: "privy" | "external";
  privyUserId?: string;
  privyWalletId?: string;
  solanaWalletAddress: string;
  createdAt?: string;
};

export type ControlAccount = {
  telegramUserId: string;
  username?: string;
  walletSource?: "privy" | "external";
  privyUserId?: string;
  privyWalletId?: string;
  solanaWalletAddress?: string;
  activeWalletId?: string;
  wallets?: ControlWallet[];
  walletExportRequestedAt?: string;
  botAccessRevokedAt?: string;
};

export type IdentityStatus =
  | "missing-session"
  | "login-required"
  | "telegram-mismatch"
  | "privy-mismatch"
  | "identity-ready"
  | "wallet-missing"
  | "wallet-not-linked"
  | "ready";

export const normalizeControlCode = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);

export const controlCodeFromHash = (hash: string) => {
  const value = hash.startsWith("#") ? hash.slice(1) : hash;
  return normalizeControlCode(new URLSearchParams(value).get("code") ?? "");
};

export const shortAddress = (address: string) =>
  address.length <= 12
    ? address
    : `${address.slice(0, 4)}...${address.slice(-4)}`;

export const activeControlWallet = (
  account: ControlAccount | null,
): ControlWallet | null => {
  if (!account) return null;
  const wallets = account.wallets ?? [];
  const active =
    wallets.find((wallet) => wallet.walletId === account.activeWalletId) ??
    wallets.find(
      (wallet) => wallet.solanaWalletAddress === account.solanaWalletAddress,
    );
  if (active) return active;
  if (
    account.walletSource &&
    account.privyWalletId &&
    account.solanaWalletAddress
  ) {
    return {
      walletId: account.privyWalletId,
      label: "Active wallet",
      walletSource: account.walletSource,
      privyUserId: account.privyUserId,
      privyWalletId: account.privyWalletId,
      solanaWalletAddress: account.solanaWalletAddress,
    };
  }
  return null;
};

export const spotControlWallet = (
  account: ControlAccount | null,
): ControlWallet | null => {
  if (!account) return null;
  const managedWallets = (account.wallets ?? []).filter(
    (wallet) => wallet.walletSource === "privy",
  );
  const spotWallet =
    managedWallets.find((wallet) => wallet.role === "spot_nft") ??
    managedWallets.find((wallet) =>
      /^(spot\/nft wallet|wallet 1)\b/i.test(wallet.label),
    ) ??
    managedWallets[0];
  if (spotWallet) return spotWallet;

  const activeWallet = activeControlWallet(account);
  return activeWallet?.walletSource === "privy" ? activeWallet : null;
};

export const controlIdentityStatus = ({
  account,
  authenticated,
  linkedAccounts,
  privyUserId,
}: {
  account: ControlAccount | null;
  authenticated: boolean;
  linkedAccounts: readonly unknown[] | null | undefined;
  privyUserId: string | null | undefined;
}): IdentityStatus => {
  if (!account) return "missing-session";
  if (!authenticated) return "login-required";

  const telegram = getTelegramAccount(linkedAccounts);
  if (telegram?.userId !== account.telegramUserId) {
    return "telegram-mismatch";
  }
  if (account.privyUserId && privyUserId !== account.privyUserId) {
    return "privy-mismatch";
  }

  const wallet = spotControlWallet(account);
  const hasWalletMetadata = Boolean(
    account.walletSource ||
      account.privyWalletId ||
      account.solanaWalletAddress ||
      account.activeWalletId ||
      account.wallets?.length,
  );
  if (!wallet && !hasWalletMetadata) return "identity-ready";
  if (!wallet || wallet.walletSource !== "privy") return "wallet-missing";

  const linkedWallet = getPrivySolanaWallets(linkedAccounts).find(
    (candidate) => candidate.address === wallet.solanaWalletAddress,
  );
  if (!linkedWallet?.embedded) return "wallet-not-linked";

  return "ready";
};

export const identityStatusMessage = (status: IdentityStatus) => {
  switch (status) {
    case "missing-session":
      return "Enter the short-lived code from Ribbot to load your control session.";
    case "login-required":
      return "Sign in with the same Telegram account you use in Ribbot.";
    case "telegram-mismatch":
      return "This Privy login is not the Telegram account that requested the Ribbot control code.";
    case "privy-mismatch":
      return "This Privy user does not match the Frog Trading Exchange-managed Ribbot wallet owner.";
    case "identity-ready":
      return "Your Frog Trading Exchange account is connected. Ribbot features will use this same account.";
    case "wallet-missing":
      return "The Spot & NFT wallet is not managed by Frog Trading Exchange.";
    case "wallet-not-linked":
      return "The Spot & NFT wallet was not found in this Privy account.";
    case "ready":
      return "Verified. Privy secures your Spot & NFT wallet.";
  }
};
