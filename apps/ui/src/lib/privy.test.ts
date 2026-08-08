import { describe, expect, it } from "vitest";

import {
  getPrivySolanaWallets,
  getProfileNftWalletAddresses,
  getTelegramAccount,
} from "./privy";

describe("Privy account helpers", () => {
  it("prioritizes an existing embedded Solana wallet", () => {
    expect(
      getPrivySolanaWallets([
        {
          type: "wallet",
          chainType: "solana",
          address: "External1111111111111111111111111111111111",
          walletClientType: "phantom",
        },
        {
          type: "wallet",
          chain_type: "solana",
          address: "9p9UcNW4QaAcw6pRAMFtaJHuNChL6dFFnbYzARTnJSWY",
          wallet_client_type: "privy",
          id: "wallet-id",
        },
      ]),
    ).toEqual([
      {
        id: "wallet-id",
        address: "9p9UcNW4QaAcw6pRAMFtaJHuNChL6dFFnbYzARTnJSWY",
        embedded: true,
        walletIndex: null,
      },
      {
        id: null,
        address: "External1111111111111111111111111111111111",
        embedded: false,
        walletIndex: null,
      },
    ]);
  });

  it("orders embedded wallets by their stable Privy wallet index", () => {
    expect(
      getPrivySolanaWallets([
        {
          type: "wallet",
          chainType: "solana",
          address: "So11111111111111111111111111111111111111112",
          walletClientType: "privy-v2",
          walletIndex: 1,
          id: "wallet-2",
        },
        {
          type: "wallet",
          chainType: "solana",
          address: "11111111111111111111111111111111",
          walletClientType: "privy",
          walletIndex: 0,
          id: "wallet-1",
        },
      ]),
    ).toEqual([
      {
        id: "wallet-1",
        address: "11111111111111111111111111111111",
        embedded: true,
        walletIndex: 0,
      },
      {
        id: "wallet-2",
        address: "So11111111111111111111111111111111111111112",
        embedded: true,
        walletIndex: 1,
      },
    ]);
  });

  it("reads the Telegram identity used by the bot", () => {
    expect(
      getTelegramAccount([
        {
          type: "telegram",
          telegramUserId: "12345",
          username: "frogtrader",
          firstName: "Frog",
        },
      ]),
    ).toEqual({
      userId: "12345",
      username: "frogtrader",
      firstName: "Frog",
    });
  });

  it("includes one embedded wallet and every read-only portfolio wallet", () => {
    expect(
      getProfileNftWalletAddresses(
        [
          {
            id: "current-wallet",
            address: "Bru511111111111111111111111111111111111111",
            embedded: true,
            walletIndex: 0,
          },
          {
            id: "perps-wallet",
            address: "So11111111111111111111111111111111111111112",
            embedded: true,
            walletIndex: 1,
          },
          {
            id: "recovered-wallet",
            address: "9p9UcNW4QaAcw6pRAMFtaJHuNChL6dFFnbYzARTnJSWY",
            embedded: false,
            walletIndex: null,
          },
        ],
        "Connected111111111111111111111111111111111",
      ),
    ).toEqual([
      "Bru511111111111111111111111111111111111111",
      "9p9UcNW4QaAcw6pRAMFtaJHuNChL6dFFnbYzARTnJSWY",
      "Connected111111111111111111111111111111111",
    ]);
  });
});
