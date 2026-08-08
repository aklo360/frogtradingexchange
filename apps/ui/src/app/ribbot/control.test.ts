import { describe, expect, it } from "vitest";

import {
  activeControlWallet,
  controlCodeFromHash,
  controlIdentityStatus,
  normalizeControlCode,
  shortAddress,
  spotControlWallet,
  type ControlAccount,
} from "./control";

const account = (): ControlAccount => ({
  telegramUserId: "1640077203",
  walletSource: "privy",
  privyUserId: "did:privy:test",
  privyWalletId: "wallet_1",
  solanaWalletAddress: "So11111111111111111111111111111111111111112",
  activeWalletId: "wallet_1",
  wallets: [
    {
      walletId: "wallet_1",
      label: "Spot & NFT Wallet (Privy)",
      role: "spot_nft",
      walletSource: "privy",
      privyUserId: "did:privy:test",
      privyWalletId: "wallet_1",
      solanaWalletAddress: "So11111111111111111111111111111111111111112",
    },
  ],
});

const linkedAccounts = [
  {
    type: "telegram",
    telegramUserId: "1640077203",
    username: "aklo",
  },
  {
    type: "wallet",
    chainType: "solana",
    walletClientType: "privy",
    walletIndex: 0,
    address: "So11111111111111111111111111111111111111112",
  },
  {
    type: "wallet",
    chainType: "solana",
    walletClientType: "privy",
    walletIndex: 1,
    address: "9p9UcNW4QaAcw6pRAMFtaJHuNChL6dFFnbYzARTnJSWY",
  },
];

describe("Ribbot control helpers", () => {
  it("normalizes pasted control codes without leaking punctuation", () => {
    expect(normalizeControlCode("zfnx-2d83 vbuc!!!")).toBe("ZFNX2D83VBUC");
  });

  it("reads a control code from a URL fragment", () => {
    expect(controlCodeFromHash("#code=zfnx-2d83-vbuc")).toBe(
      "ZFNX2D83VBUC",
    );
  });

  it("selects the active Frog Trading Exchange wallet slot", () => {
    expect(activeControlWallet(account())?.role).toBe("spot_nft");
  });

  it("uses the single Spot & NFT wallet as the Imperial authority", () => {
    expect(spotControlWallet(account())?.role).toBe("spot_nft");
    expect(spotControlWallet(account())?.solanaWalletAddress).toBe(
      "So11111111111111111111111111111111111111112",
    );
  });

  it("requires matching Telegram, Privy user, and embedded wallet identity", () => {
    expect(
      controlIdentityStatus({
        account: account(),
        authenticated: true,
        linkedAccounts,
        privyUserId: "did:privy:test",
      }),
    ).toBe("ready");

    expect(
      controlIdentityStatus({
        account: account(),
        authenticated: true,
        linkedAccounts,
        privyUserId: "did:privy:other",
      }),
    ).toBe("privy-mismatch");

    expect(
      controlIdentityStatus({
        account: account(),
        authenticated: true,
        linkedAccounts: linkedAccounts.slice(1),
        privyUserId: "did:privy:test",
      }),
    ).toBe("telegram-mismatch");
  });

  it("accepts a verified new account before a wallet exists", () => {
    expect(
      controlIdentityStatus({
        account: {
          telegramUserId: "1640077203",
        },
        authenticated: true,
        linkedAccounts: [linkedAccounts[0]],
        privyUserId: "did:privy:new-user",
      }),
    ).toBe("identity-ready");
  });

  it("formats long addresses for compact status rows", () => {
    expect(shortAddress("9p9UcNW4QaAcw6pRAMFtaJHuNChL6dFFnbYzARTnJSWY")).toBe(
      "9p9U...JSWY",
    );
  });
});
