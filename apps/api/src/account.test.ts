import { describe, expect, it } from "vitest";
import { PrivyClient } from "@privy-io/node";

import {
  getAccountConfig,
  getAccountConfigRoute,
  postEnsureTelegramAccount,
  postTelegramAccountProbe,
  postTradeIntent,
} from "./account";

describe("account mode config", () => {
  it("uses Privy SDK methods that exist for Telegram lookup and wallet creation", () => {
    const client = new PrivyClient({
      appId: "test-app-id",
      appSecret: "test-app-secret",
    });

    expect(typeof client.users().getByTelegramUserID).toBe("function");
    expect(typeof client.users().create).toBe("function");
    expect(typeof client.wallets().create).toBe("function");
  });

  it("defaults to disabled non-custodial bot execution", async () => {
    const config = getAccountConfig({});

    expect(config.accountModeEnabled).toBe(false);
    expect(config.accountCreation).toEqual({
      ftxWebEnabled: false,
      telegramBotEnabled: false,
      surfaces: [],
      convergenceKey: "telegram_user_id",
      requiresTelegramLinkForRibbot: true,
      telegramSetupReadiness: {
        accountModeEnabled: false,
        botApiAuthConfigured: false,
        privyAppCredentialsConfigured: false,
        privySignerIdConfigured: false,
      },
      telegramSetupMissing: {
        accountModeEnabled: false,
        botApiAuthConfigured: false,
        privyAppCredentialsConfigured: false,
        privySignerIdConfigured: false,
      },
    });
    expect(config.bot.tradingEnabled).toBe(false);
    expect(config.bot.executionEnabled).toBe(false);
    expect(config.nftPurchases).toMatchObject({
      userWalletExecutionEnabled: true,
      maxSweepQuantity: 10,
      maxTotalSol: 1,
      executionRequiresUserWalletSignature: true,
      telegramTextExecutesTrades: false,
    });
    expect(config.safety).toEqual({
      ribbotHoldsPrivateKeys: false,
      linkedExternalWalletsTradeableByBot: false,
      liveExecutionRequiresPrivySignerPolicies: true,
    });

    const response = await getAccountConfigRoute({});
    expect(response.status).toBe(200);
  });

  it("exposes FTX and Telegram as independent account creation surfaces", () => {
    const config = getAccountConfig({
      FROGX_ACCOUNT_MODE_ENABLED: "true",
      FROGX_BOT_API_TOKEN: "bot-token",
      NEXT_PUBLIC_PRIVY_APP_ID: "app-id",
      PRIVY_APP_SECRET: "app-secret",
      PRIVY_SIGNER_ID: "signer-id",
    });

    expect(config.accountCreation).toEqual({
      ftxWebEnabled: true,
      telegramBotEnabled: true,
      surfaces: ["ftx", "telegram"],
      convergenceKey: "telegram_user_id",
      requiresTelegramLinkForRibbot: true,
      telegramSetupReadiness: {
        accountModeEnabled: true,
        botApiAuthConfigured: true,
        privyAppCredentialsConfigured: true,
        privySignerIdConfigured: true,
      },
      telegramSetupMissing: {},
    });
    expect(config.privy.telegramBotAccountCreationEnabled).toBe(true);
    expect(config.privy.webAppIdConfigured).toBe(true);
    expect(config.privy.serverAppIdConfigured).toBe(true);
  });

  it("reports web-only account creation while Telegram server gates are missing", () => {
    const config = getAccountConfig({
      FROGX_ACCOUNT_MODE_ENABLED: "true",
      NEXT_PUBLIC_PRIVY_APP_ID: "app-id",
      FROGX_BOT_API_TOKEN: "bot-token",
    });

    expect(config.accountCreation.ftxWebEnabled).toBe(true);
    expect(config.accountCreation.telegramBotEnabled).toBe(false);
    expect(config.accountCreation.surfaces).toEqual(["ftx"]);
    expect(config.accountCreation.telegramSetupReadiness).toEqual({
      accountModeEnabled: true,
      botApiAuthConfigured: true,
      privyAppCredentialsConfigured: false,
      privySignerIdConfigured: false,
    });
    expect(config.accountCreation.telegramSetupMissing).toEqual({
      privyAppCredentialsConfigured: false,
      privySignerIdConfigured: false,
    });
    expect(config.privy.webAppIdConfigured).toBe(true);
    expect(config.privy.serverAppIdConfigured).toBe(true);
  });

  it("reports Telegram-only account creation when only server-side Privy credentials are configured", () => {
    const config = getAccountConfig({
      FROGX_ACCOUNT_MODE_ENABLED: "true",
      FROGX_BOT_API_TOKEN: "bot-token",
      PRIVY_APP_ID: "server-app-id",
      PRIVY_APP_SECRET: "app-secret",
      PRIVY_SIGNER_ID: "signer-id",
    });

    expect(config.accountCreation).toMatchObject({
      ftxWebEnabled: false,
      telegramBotEnabled: true,
      surfaces: ["telegram"],
      convergenceKey: "telegram_user_id",
      requiresTelegramLinkForRibbot: true,
      telegramSetupMissing: {},
    });
    expect(config.privy.configured).toBe(true);
    expect(config.privy.webAppIdConfigured).toBe(false);
    expect(config.privy.serverAppIdConfigured).toBe(true);
  });

  it("stages but does not execute intents while account mode is disabled", async () => {
    const request = new Request("https://frogx.test/api/frogx/account/intents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "buy-floor",
        telegramUserId: 123,
        chatType: "private",
        text: "/buyfloor",
      }),
    });

    const response = await postTradeIntent(request, {});
    const body = (await response.json()) as {
      status: string;
      executionEnabled: boolean;
      action: string;
    };

    expect(response.status).toBe(202);
    expect(body.action).toBe("buy-floor");
    expect(body.status).toBe("account_mode_disabled");
    expect(body.executionEnabled).toBe(false);
  });

  it("stages buy-floor intents without browser handoff when signer gates are disabled", async () => {
    const request = new Request("https://frogx.test/api/frogx/account/intents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "buy-floor",
        telegramUserId: 123,
        chatType: "private",
        text: "sweep 10 frogs",
      }),
    });

    const response = await postTradeIntent(request, {
      FROGX_ACCOUNT_MODE_ENABLED: "true",
    });
    const body = (await response.json()) as {
      status: string;
      executionEnabled: boolean;
      userWalletExecutionEnabled: boolean;
      nextStep: string;
    };

    expect(response.status).toBe(202);
    expect(body.status).toBe("execution_disabled");
    expect(body.executionEnabled).toBe(false);
    expect(body.userWalletExecutionEnabled).toBe(true);
    expect(body.nextStep).toMatch(/Privy authorization signer/i);
  });

  it("requires bot API auth once bot trading is enabled", async () => {
    const env = {
      FROGX_ACCOUNT_MODE_ENABLED: "true",
      FROGX_BOT_TRADING_ENABLED: "true",
      FROGX_BOT_API_TOKEN: "secret-token",
    };
    const request = new Request("https://frogx.test/api/frogx/account/intents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "swap" }),
    });

    const response = await postTradeIntent(request, env);

    expect(response.status).toBe(401);
  });

  it("accepts authorized bot intents without enabling execution by default", async () => {
    const env = {
      FROGX_ACCOUNT_MODE_ENABLED: "true",
      FROGX_BOT_TRADING_ENABLED: "true",
      FROGX_BOT_API_TOKEN: "secret-token",
    };
    const request = new Request("https://frogx.test/api/frogx/account/intents", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret-token",
      },
      body: JSON.stringify({ action: "swap", text: "0.1 SOL to USDC" }),
    });

    const response = await postTradeIntent(request, env);
    const body = (await response.json()) as {
      status: string;
      executionEnabled: boolean;
    };

    expect(response.status).toBe(202);
    expect(body.status).toBe("execution_disabled");
    expect(body.executionEnabled).toBe(false);
  });

  it("probes Telegram account setup without mutating Privy", async () => {
    const response = await postTelegramAccountProbe(
      new Request("https://frogx.test/api/frogx/account/telegram/probe", {
        method: "POST",
        headers: {
          authorization: "Bearer bot-token",
        },
      }),
      {
        FROGX_ACCOUNT_MODE_ENABLED: "true",
        FROGX_BOT_API_TOKEN: "bot-token",
        NEXT_PUBLIC_PRIVY_APP_ID: "app-id",
      },
    );
    const body = (await response.json()) as {
      ready: boolean;
      mutates: boolean;
      missing: Record<string, boolean>;
    };

    expect(response.status).toBe(200);
    expect(body.ready).toBe(false);
    expect(body.mutates).toBe(false);
    expect(body.missing).toEqual({
      privyAppCredentialsConfigured: false,
      privySignerIdConfigured: false,
    });
  });

  it("requires bot authorization for the Telegram setup probe", async () => {
    const response = await postTelegramAccountProbe(
      new Request("https://frogx.test/api/frogx/account/telegram/probe", {
        method: "POST",
      }),
      {
        FROGX_ACCOUNT_MODE_ENABLED: "true",
        FROGX_BOT_API_TOKEN: "bot-token",
        NEXT_PUBLIC_PRIVY_APP_ID: "app-id",
      },
    );

    expect(response.status).toBe(401);
  });

  it("reuses an existing Telegram Privy user and embedded Solana wallet", async () => {
    const response = await postEnsureTelegramAccount(
      new Request("https://frogx.test/api/frogx/account/telegram", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer bot-token",
        },
        body: JSON.stringify({
          telegramUserId: 123,
          telegramUsername: "aklo360",
        }),
      }),
      {
        FROGX_ACCOUNT_MODE_ENABLED: "true",
        FROGX_BOT_API_TOKEN: "bot-token",
        PRIVY_APP_ID: "app-id",
        PRIVY_APP_SECRET: "app-secret",
        PRIVY_SIGNER_ID: "signer-id",
      },
      {
        createPrivyClient: () => ({
          users: () => ({
            getByTelegramUserID: async () => ({
              id: "did:privy:user",
              linked_accounts: [
                {
                  id: "wallet-id",
                  address: "FrogWallet11111111111111111111111111111111",
                  type: "wallet",
                  chain_type: "solana",
                  connector_type: "embedded",
                  delegated: true,
                  wallet_client: "privy",
                },
              ],
            }),
            create: async () => {
              throw new Error("should not create user");
            },
          }),
          wallets: () => ({
            create: async () => {
              throw new Error("should not create wallet");
            },
          }),
        }),
      },
    );
	    const body = (await response.json()) as {
	      ready: boolean;
	      userCreated: boolean;
	      walletCreated: boolean;
	      wallet: { id: string; address: string } | null;
	      wallets: Array<{
	        id: string | null;
	        address: string;
	        tradeableByRibbot: boolean;
	      }>;
	    };

    expect(response.status).toBe(200);
    expect(body.ready).toBe(true);
    expect(body.userCreated).toBe(false);
    expect(body.walletCreated).toBe(false);
	    expect(body.wallet).toMatchObject({
	      id: "wallet-id",
	      address: "FrogWallet11111111111111111111111111111111",
	    });
	    expect(body.wallets).toEqual([
	      expect.objectContaining({
	        id: "wallet-id",
	        address: "FrogWallet11111111111111111111111111111111",
	        tradeableByRibbot: true,
	      }),
	    ]);
	  });

  it("adds a delegated Ribbot wallet to an existing web-created Telegram account", async () => {
    const calls: Array<{ type: string; input: unknown }> = [];
    const response = await postEnsureTelegramAccount(
      new Request("https://frogx.test/api/frogx/account/telegram", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer bot-token",
        },
        body: JSON.stringify({
          telegramUserId: 123,
          telegramUsername: "aklo360",
        }),
      }),
      {
        FROGX_ACCOUNT_MODE_ENABLED: "true",
        FROGX_BOT_API_TOKEN: "bot-token",
        PRIVY_APP_ID: "app-id",
        PRIVY_APP_SECRET: "app-secret",
        PRIVY_SIGNER_ID: "signer-id",
      },
      {
        createPrivyClient: () => ({
          users: () => ({
            getByTelegramUserID: async () => ({
              id: "did:privy:web-first",
	              linked_accounts: [
	                {
	                  id: "web-wallet-id",
	                  address: "WebWallet111111111111111111111111111111111",
                  type: "wallet",
                  chain_type: "solana",
                  connector_type: "embedded",
	                  delegated: false,
	                  wallet_client: "privy",
	                },
	                {
	                  id: "phantom-wallet-id",
	                  address: "PhantomWallet111111111111111111111111111111",
	                  type: "wallet",
	                  chain_type: "solana",
	                  connector_type: "injected",
	                  delegated: false,
	                  wallet_client: "phantom",
	                },
	              ],
	            }),
            create: async () => {
              throw new Error("should not create user");
            },
          }),
          wallets: () => ({
            create: async (input) => {
              calls.push({ type: "wallet", input });
              return {
                id: "ribbot-wallet-id",
                address: "RibbotWallet111111111111111111111111111111",
                chain_type: "solana",
              };
            },
          }),
        }),
      },
    );
    const body = (await response.json()) as {
      ready: boolean;
      userCreated: boolean;
      walletCreated: boolean;
      walletDelegated: boolean;
	      userId: string;
	      wallet: { id: string; address: string } | null;
	      wallets: Array<{
	        id: string | null;
	        address: string;
	        tradeableByRibbot: boolean;
	      }>;
	    };

    expect(response.status).toBe(200);
    expect(body.ready).toBe(true);
    expect(body.userCreated).toBe(false);
    expect(body.walletCreated).toBe(true);
    expect(body.walletDelegated).toBe(true);
    expect(body.userId).toBe("did:privy:web-first");
	    expect(body.wallet).toMatchObject({
	      id: "ribbot-wallet-id",
	      address: "RibbotWallet111111111111111111111111111111",
	    });
	    expect(body.wallets).toEqual([
	      expect.objectContaining({
	        id: "web-wallet-id",
	        address: "WebWallet111111111111111111111111111111111",
	        tradeableByRibbot: false,
	      }),
	      expect.objectContaining({
	        id: "phantom-wallet-id",
	        address: "PhantomWallet111111111111111111111111111111",
	        tradeableByRibbot: false,
	      }),
	      expect.objectContaining({
	        id: "ribbot-wallet-id",
	        address: "RibbotWallet111111111111111111111111111111",
	        tradeableByRibbot: true,
	      }),
	    ]);
	    expect(calls).toEqual([
      {
        type: "wallet",
        input: {
          chain_type: "solana",
          owner: { user_id: "did:privy:web-first" },
          display_name: "FTX Telegram Wallet",
          external_id: "tg_123",
          idempotency_key: "frogx-telegram-wallet-123",
          additional_signers: [{ signer_id: "signer-id" }],
        },
      },
    ]);
  });

  it("creates a Privy user and Solana wallet from a Telegram id", async () => {
    const calls: Array<{ type: string; input: unknown }> = [];
    const response = await postEnsureTelegramAccount(
      new Request("https://frogx.test/api/frogx/account/telegram", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer bot-token",
        },
        body: JSON.stringify({
          telegramUserId: 123,
          telegramUsername: "newfrog",
          firstName: "New",
        }),
      }),
      {
        FROGX_ACCOUNT_MODE_ENABLED: "true",
        FROGX_BOT_API_TOKEN: "bot-token",
        PRIVY_APP_ID: "app-id",
        PRIVY_APP_SECRET: "app-secret",
        PRIVY_SIGNER_ID: "signer-id",
        PRIVY_POLICY_IDS: "policy-id",
      },
      {
        createPrivyClient: () => ({
          users: () => ({
            getByTelegramUserID: async () => {
              const error = new Error("not found") as Error & { status: number };
              error.status = 404;
              throw error;
            },
            create: async (input) => {
              calls.push({ type: "user", input });
              return { id: "did:privy:new", linked_accounts: [] };
            },
          }),
          wallets: () => ({
            create: async (input) => {
              calls.push({ type: "wallet", input });
              return {
                id: "new-wallet-id",
                address: "NewWallet111111111111111111111111111111111",
                chain_type: "solana",
              };
            },
          }),
        }),
      },
    );
    const body = (await response.json()) as {
      ready: boolean;
      userCreated: boolean;
      walletCreated: boolean;
      userId: string;
      wallet: { id: string; address: string } | null;
    };

    expect(response.status).toBe(200);
    expect(body.ready).toBe(true);
    expect(body.userCreated).toBe(true);
    expect(body.walletCreated).toBe(true);
    expect(body.userId).toBe("did:privy:new");
    expect(body.wallet?.address).toBe("NewWallet111111111111111111111111111111111");
    expect(calls[0]).toMatchObject({
      type: "user",
      input: {
        linked_accounts: [
          {
            type: "telegram",
            telegram_user_id: "123",
            username: "newfrog",
            first_name: "New",
          },
        ],
      },
    });
    expect(calls[1]).toMatchObject({
      type: "wallet",
      input: {
        chain_type: "solana",
        owner: { user_id: "did:privy:new" },
        additional_signers: [
          {
            signer_id: "signer-id",
            override_policy_ids: ["policy-id"],
          },
        ],
        policy_ids: ["policy-id"],
      },
    });
  });

  it("reuses the Telegram Privy user if web login wins the create race", async () => {
    let lookupCount = 0;
    const response = await postEnsureTelegramAccount(
      new Request("https://frogx.test/api/frogx/account/telegram", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer bot-token",
        },
        body: JSON.stringify({
          telegramUserId: 123,
          telegramUsername: "aklo360",
        }),
      }),
      {
        FROGX_ACCOUNT_MODE_ENABLED: "true",
        FROGX_BOT_API_TOKEN: "bot-token",
        PRIVY_APP_ID: "app-id",
        PRIVY_APP_SECRET: "app-secret",
        PRIVY_SIGNER_ID: "signer-id",
      },
      {
        createPrivyClient: () => ({
          users: () => ({
            getByTelegramUserID: async () => {
              lookupCount += 1;
              if (lookupCount === 1) {
                const error = new Error("not found") as Error & { status: number };
                error.status = 404;
                throw error;
              }
              return {
                id: "did:privy:raced",
                linked_accounts: [
                  {
                    id: "wallet-id",
                    address: "RacedWallet111111111111111111111111111111",
                    type: "wallet",
                    chain_type: "solana",
                    connector_type: "embedded",
                    delegated: true,
                    wallet_client: "privy",
                  },
                ],
              };
            },
            create: async () => {
              const error = new Error("already linked") as Error & { status: number };
              error.status = 409;
              throw error;
            },
          }),
          wallets: () => ({
            create: async () => {
              throw new Error("should not create wallet");
            },
          }),
        }),
      },
    );
    const body = (await response.json()) as {
      ready: boolean;
      userCreated: boolean;
      walletCreated: boolean;
      userId: string;
      wallet: { id: string; address: string } | null;
    };

    expect(response.status).toBe(200);
    expect(lookupCount).toBe(2);
    expect(body.ready).toBe(true);
    expect(body.userCreated).toBe(false);
    expect(body.walletCreated).toBe(false);
    expect(body.userId).toBe("did:privy:raced");
    expect(body.wallet?.address).toBe("RacedWallet111111111111111111111111111111");
  });

  it("does not create Telegram bot wallets without a Privy signer id", async () => {
    const response = await postEnsureTelegramAccount(
      new Request("https://frogx.test/api/frogx/account/telegram", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer bot-token",
        },
        body: JSON.stringify({
          telegramUserId: 123,
          telegramUsername: "newfrog",
        }),
      }),
      {
        FROGX_ACCOUNT_MODE_ENABLED: "true",
        FROGX_BOT_API_TOKEN: "bot-token",
        PRIVY_APP_ID: "app-id",
        PRIVY_APP_SECRET: "app-secret",
      },
      {
        createPrivyClient: () => {
          throw new Error("should not create privy client");
        },
      },
    );
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(503);
    expect(body.error).toMatch(/signer id/i);
    expect(body).toMatchObject({
      missing: {
        privySignerIdConfigured: false,
      },
    });
  });
});
