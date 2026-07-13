import { describe, expect, it } from "vitest";

import { getPrivySolanaWallets, getTelegramAccount } from "./privy";

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
      },
      {
        id: null,
        address: "External1111111111111111111111111111111111",
        embedded: false,
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
});
