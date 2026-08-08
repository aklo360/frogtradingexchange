import { afterEach, describe, expect, it, vi } from "vitest";

const privyMocks = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
  getUser: vi.fn(),
}));

const tradingBotMocks = vi.hoisted(() => ({
  getAuthenticatedTradingBotPerpsWalletSnapshot: vi.fn(),
}));

vi.mock("@privy-io/node", () => ({
  PrivyClient: class {
    utils() {
      return {
        auth: () => ({
          verifyAccessToken: privyMocks.verifyAccessToken,
        }),
      };
    }

    users() {
      return { _get: privyMocks.getUser };
    }
  },
}));

vi.mock("./tradingBot", () => tradingBotMocks);

import type { Env } from "./env";
import { getProfilePerpsWallet } from "./profilePerpsWallet";

const env = {
  PRIVY_APP_ID: "test-app",
  PRIVY_APP_SECRET: "test-secret",
  TRADING_BOT_ACCOUNTS: {} as DurableObjectNamespace,
} satisfies Partial<Env> as Env;

describe("profile perps wallet", () => {
  afterEach(() => {
    privyMocks.verifyAccessToken.mockReset();
    privyMocks.getUser.mockReset();
    tradingBotMocks.getAuthenticatedTradingBotPerpsWalletSnapshot.mockReset();
  });

  it("returns the authenticated user's own Imperial PDA", async () => {
    const authorityWalletAddress =
      "11111111111111111111111111111111";
    const profileAddress =
      "Vote111111111111111111111111111111111111111";
    privyMocks.verifyAccessToken.mockResolvedValue({
      user_id: "did:privy:user-1",
    });
    privyMocks.getUser.mockResolvedValue({
      linked_accounts: [
        {
          type: "telegram",
          telegram_user_id: "1640077203",
        },
        {
          type: "wallet",
          chain_type: "solana",
          wallet_client_type: "privy-v2",
          wallet_index: 1,
          address: "So11111111111111111111111111111111111111112",
        },
        {
          type: "wallet",
          chain_type: "solana",
          wallet_client_type: "privy",
          wallet_index: 0,
          address: authorityWalletAddress,
        },
      ],
    });
    tradingBotMocks.getAuthenticatedTradingBotPerpsWalletSnapshot.mockResolvedValue(
      {
        snapshot: {
          telegramUserId: "1640077203",
          authorityWalletAddress,
          profileAddress,
          profileIndex: 1,
          profileUsdc: 80,
          minimumProfileUsdc: 50,
          funded: true,
          fundingLocation: "imperial_profile",
          imperialProfileVerified: true,
          strategyReady: false,
          liveExecutionEnabled: false,
          blockers: [],
        },
      },
    );

    const response = await getProfilePerpsWallet(
      new Request("https://frogtrading.exchange/api/frogx/account/perps-wallet", {
        headers: { Authorization: "Bearer user-token" },
      }),
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ready",
      telegramUserId: "1640077203",
      authorityWalletAddress,
      profileAddress,
      profileIndex: 1,
      profileUsdc: 80,
      minimumProfileUsdc: 50,
      funded: true,
      fundingLocation: "imperial_profile",
      imperialProfileVerified: true,
      strategyReady: false,
      liveExecutionEnabled: false,
      blockers: [],
    });
    expect(privyMocks.verifyAccessToken).toHaveBeenCalledWith("user-token");
    expect(
      tradingBotMocks.getAuthenticatedTradingBotPerpsWalletSnapshot,
    ).toHaveBeenCalledWith(env, {
      telegramUserId: "1640077203",
      privyUserId: "did:privy:user-1",
      authorityWalletAddress,
    });
  });

  it("requires a Privy access token", async () => {
    const response = await getProfilePerpsWallet(
      new Request("https://frogtrading.exchange/api/frogx/account/perps-wallet"),
      env,
    );

    expect(response.status).toBe(401);
    expect(
      tradingBotMocks.getAuthenticatedTradingBotPerpsWalletSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("does not expose a profile without a linked Telegram account", async () => {
    privyMocks.verifyAccessToken.mockResolvedValue({
      user_id: "did:privy:user-1",
    });
    privyMocks.getUser.mockResolvedValue({
      linked_accounts: [
        {
          type: "wallet",
          chain_type: "solana",
          wallet_client_type: "privy",
          wallet_index: 0,
          address: "11111111111111111111111111111111",
        },
      ],
    });

    const response = await getProfilePerpsWallet(
      new Request("https://frogtrading.exchange/api/frogx/account/perps-wallet", {
        headers: { Authorization: "Bearer user-token" },
      }),
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "not_connected",
    });
    expect(
      tradingBotMocks.getAuthenticatedTradingBotPerpsWalletSnapshot,
    ).not.toHaveBeenCalled();
  });
});
