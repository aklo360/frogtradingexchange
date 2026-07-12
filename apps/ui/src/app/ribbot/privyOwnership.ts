export type PrivyOwnershipStatus =
  | "loading"
  | "signed_out"
  | "wrong_privy_user"
  | "wrong_telegram_user"
  | "wallet_missing"
  | "verified";

export type PrivyOwnershipInput = {
  ready: boolean;
  authenticated: boolean;
  expectedPrivyUserId?: string;
  expectedTelegramUserId: string;
  expectedWalletAddress?: string;
  authenticatedPrivyUserId?: string;
  authenticatedTelegramUserId?: string;
  walletAddresses: string[];
};

export function resolvePrivyOwnershipStatus(
  input: PrivyOwnershipInput,
): PrivyOwnershipStatus {
  if (!input.ready) return "loading";
  if (!input.authenticated || !input.authenticatedPrivyUserId) {
    return "signed_out";
  }
  if (
    !input.expectedPrivyUserId ||
    input.authenticatedPrivyUserId !== input.expectedPrivyUserId
  ) {
    return "wrong_privy_user";
  }
  if (input.authenticatedTelegramUserId !== input.expectedTelegramUserId) {
    return "wrong_telegram_user";
  }
  if (
    !input.expectedWalletAddress ||
    !input.walletAddresses.includes(input.expectedWalletAddress)
  ) {
    return "wallet_missing";
  }
  return "verified";
}
