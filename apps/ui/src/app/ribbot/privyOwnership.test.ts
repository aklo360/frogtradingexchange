import { describe, expect, it } from "vitest";

import { resolvePrivyOwnershipStatus } from "./privyOwnership";

const base = {
  ready: true,
  authenticated: true,
  expectedPrivyUserId: "did:privy:r1",
  expectedTelegramUserId: "123456",
  expectedWalletAddress: "Wallet1111111111111111111111111111111111111",
  authenticatedPrivyUserId: "did:privy:r1",
  authenticatedTelegramUserId: "123456",
  walletAddresses: ["Wallet1111111111111111111111111111111111111"],
};

describe("resolvePrivyOwnershipStatus", () => {
  it("waits for Privy and wallet state before evaluating ownership", () => {
    expect(resolvePrivyOwnershipStatus({ ...base, ready: false })).toBe(
      "loading",
    );
  });

  it("requires a signed-in Privy user", () => {
    expect(
      resolvePrivyOwnershipStatus({
        ...base,
        authenticated: false,
        authenticatedPrivyUserId: undefined,
      }),
    ).toBe("signed_out");
  });

  it("rejects mismatched Privy and Telegram identities", () => {
    expect(
      resolvePrivyOwnershipStatus({
        ...base,
        authenticatedPrivyUserId: "did:privy:other",
      }),
    ).toBe("wrong_privy_user");
    expect(
      resolvePrivyOwnershipStatus({
        ...base,
        authenticatedTelegramUserId: "999999",
      }),
    ).toBe("wrong_telegram_user");
  });

  it("requires the exact FTX-managed wallet in the Privy session", () => {
    expect(
      resolvePrivyOwnershipStatus({
        ...base,
        walletAddresses: ["DifferentWallet111111111111111111111111111111"],
      }),
    ).toBe("wallet_missing");
  });

  it("verifies only the exact user, Telegram account, and wallet tuple", () => {
    expect(resolvePrivyOwnershipStatus(base)).toBe("verified");
  });
});
