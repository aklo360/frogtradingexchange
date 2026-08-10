import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  privyReady: true,
  privyAuthenticated: true,
  walletlessAccount: false,
  revokedAccount: false,
  exportWallet: vi.fn(),
  addSigners: vi.fn(),
  removeSigners: vi.fn(),
  signMessage: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("telegramUserId=1640077203"),
}));

vi.mock("@privy-io/react-auth", () => ({
  useSigners: () => ({
    addSigners: mocks.addSigners,
    removeSigners: mocks.removeSigners,
  }),
  usePrivy: () => ({
    ready: mocks.privyReady,
    authenticated: mocks.privyAuthenticated,
    user: mocks.privyAuthenticated
      ? {
          id: "did:privy:test",
          linkedAccounts: [
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
          ],
        }
      : null,
    login: mocks.login,
    logout: mocks.logout,
  }),
}));

vi.mock("@privy-io/react-auth/solana", () => ({
  useExportWallet: () => ({ exportWallet: mocks.exportWallet }),
  useSignMessage: () => ({ signMessage: mocks.signMessage }),
  useWallets: () => ({
    ready: true,
    wallets: [
      {
        address: "So11111111111111111111111111111111111111112",
      },
      {
        address: "9p9UcNW4QaAcw6pRAMFtaJHuNChL6dFFnbYzARTnJSWY",
      },
    ],
  }),
}));

import { RibbotControlClient } from "./RibbotControlClient";

describe("RibbotControlClient", () => {
  beforeEach(() => {
    mocks.privyReady = true;
    mocks.privyAuthenticated = true;
    mocks.walletlessAccount = false;
    mocks.revokedAccount = false;
    mocks.exportWallet.mockReset();
    mocks.addSigners.mockReset();
    mocks.addSigners.mockResolvedValue({ user: {} });
    mocks.removeSigners.mockReset();
    mocks.removeSigners.mockResolvedValue({ user: {} });
    mocks.signMessage.mockReset();
    mocks.signMessage.mockResolvedValue({
      signature: new Uint8Array(64).fill(1),
    });
    mocks.login.mockReset();
    mocks.logout.mockReset();
    window.location.hash = "#code=zfnx-2d83-vbuc";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input, init) => {
        const url = String(input);
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (url === "/api/frogx/trading-bot/control/session") {
          expect(body).toMatchObject({
            telegramUserId: "1640077203",
            code: "ZFNX2D83VBUC",
          });
          return Response.json({
            status: "ready",
            sessionToken: "SESSIONTOKEN",
            sessionExpiresAt: "2026-07-26T23:38:12.986Z",
            imperialConnection: null,
            automationSigner: {
              signerId: "auth-key",
              policyIds: ["spot-nft-policy"],
            },
            automationSignerReady: false,
            account: mocks.walletlessAccount
              ? {
                  telegramUserId: "1640077203",
                }
              : {
                  telegramUserId: "1640077203",
                  walletSource: "privy",
                  privyUserId: "did:privy:test",
                  privyWalletId: "wallet_1",
                  solanaWalletAddress:
                    "So11111111111111111111111111111111111111112",
                  activeWalletId: "wallet_1",
                  ...(mocks.revokedAccount
                    ? {
                        botAccessRevokedAt:
                          "2026-07-31T03:00:00.000Z",
                      }
                    : {}),
                  wallets: [
                    {
                      walletId: "wallet_1",
                      label: "Spot & NFT Wallet (Privy)",
                      role: "spot_nft",
                      walletSource: "privy",
                      privyUserId: "did:privy:test",
                      privyWalletId: "wallet_1",
                      solanaWalletAddress:
                        "So11111111111111111111111111111111111111112",
                    },
                  ],
                },
          });
        }
        if (url === "/api/frogx/trading-bot/control/wallet") {
          if (body.action === "verify_signer") {
            expect(body).toMatchObject({
              telegramUserId: "1640077203",
              sessionToken: "SESSIONTOKEN",
              userPublicKey:
                "So11111111111111111111111111111111111111112",
              action: "verify_signer",
            });
            return Response.json({
              status: "signer_check_requested",
              automationSignerReady: true,
            });
          }
          if (body.action === "export") {
            expect(body).toMatchObject({
              telegramUserId: "1640077203",
              sessionToken: "SESSIONTOKEN",
              userPublicKey:
                "So11111111111111111111111111111111111111112",
              action: "export",
            });
            return Response.json({
              status: "export_requested",
              warnings: ["recorded"],
            });
          }
          if (body.action === "revoke") {
            expect(body).toMatchObject({
              telegramUserId: "1640077203",
              sessionToken: "SESSIONTOKEN",
              userPublicKey:
                "So11111111111111111111111111111111111111112",
              action: "revoke",
            });
            return Response.json({
              status: "revoked",
              account: {
                telegramUserId: "1640077203",
                walletSource: "privy",
                privyUserId: "did:privy:test",
                privyWalletId: "wallet_1",
                solanaWalletAddress:
                  "So11111111111111111111111111111111111111112",
                activeWalletId: "wallet_1",
                botAccessRevokedAt: "2026-07-31T03:00:00.000Z",
                wallets: [
                  {
                    walletId: "wallet_1",
                    label: "Spot & NFT Wallet (Privy)",
                    role: "spot_nft",
                    walletSource: "privy",
                    privyUserId: "did:privy:test",
                    privyWalletId: "wallet_1",
                    solanaWalletAddress:
                      "So11111111111111111111111111111111111111112",
                  },
                ],
              },
            });
          }
          if (body.action === "restore") {
            expect(body).toMatchObject({
              telegramUserId: "1640077203",
              sessionToken: "SESSIONTOKEN",
              userPublicKey:
                "So11111111111111111111111111111111111111112",
              action: "restore",
            });
            return Response.json({
              status: "restored",
              account: {
                telegramUserId: "1640077203",
                walletSource: "privy",
                privyUserId: "did:privy:test",
                privyWalletId: "wallet_1",
                solanaWalletAddress:
                  "So11111111111111111111111111111111111111112",
                activeWalletId: "wallet_1",
                wallets: [
                  {
                    walletId: "wallet_1",
                    label: "Spot & NFT Wallet (Privy)",
                    role: "spot_nft",
                    walletSource: "privy",
                    privyUserId: "did:privy:test",
                    privyWalletId: "wallet_1",
                    solanaWalletAddress:
                      "So11111111111111111111111111111111111111112",
                  },
                ],
              },
            });
          }
          throw new Error(`Unexpected wallet action: ${body.action}`);
        }
        if (url === "/api/frogx/trading-bot/control/imperial") {
          expect(body).toMatchObject({
            telegramUserId: "1640077203",
            sessionToken: "SESSIONTOKEN",
            wallet: "So11111111111111111111111111111111111111112",
          });
          expect(body.message).toMatch(
            /^imperial:mobile-connect:So11111111111111111111111111111111111111112:\d{13}$/,
          );
          expect(body.signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{80,100}$/);
          return Response.json({
            status: "connected",
            connection: {
              status: "connected",
              authorityWalletAddress:
                "So11111111111111111111111111111111111111112",
              profileAddress: "Vote111111111111111111111111111111111111111",
              profileIndex: 1,
              expiresAt: 1893456000,
              connectedAt: "2026-07-30T23:00:00.000Z",
              referrerUsername: "sbf",
            },
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
  });

  afterEach(() => {
    window.location.hash = "";
    cleanup();
    vi.unstubAllGlobals();
  });

  it("walks the user through Frog Trading Exchange account setup", async () => {
    render(<RibbotControlClient />);

    expect(
      screen.getByRole("heading", {
        name: "Connect Frog Trading Exchange",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Ribbot" })).toHaveAttribute(
      "src",
      "/ribbot-pfp.png",
    );
    expect(
      screen.queryByText(
        "Ribbot is the Telegram trading assistant for Frog Trading Exchange.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("This matches your Ribbot DM to this setup session."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Telegram connects your account. Ribbot cannot read your chats.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/app signer/)).not.toBeInTheDocument();
    expect(screen.queryByText(/private key/)).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Spot Trading Coming Soon",
      }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Enable Ribbot" }),
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText("Control code")).toHaveValue(
        "ZFNX2D83VBUC",
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect Telegram" }));

    expect(
      await screen.findByRole("button", { name: "Enable Ribbot" }),
    ).toBeEnabled();
    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
    expect(screen.queryByLabelText("Control code")).not.toBeInTheDocument();
    expect(
      screen.getByText("Spot & NFT Wallet (Privy) So11...1112"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Privy secures your private key. Ribbot, Frog Trading Exchange, and Imperial never receive it. A separate removable app signer lets Frog Trading Exchange submit transactions for Ribbot automation. It cannot access your key or change wallet ownership.",
      ),
    ).toBeInTheDocument();
  });

  it("explains Telegram access only when Telegram verification is required", async () => {
    mocks.privyAuthenticated = false;
    render(<RibbotControlClient />);

    await waitFor(() => {
      expect(screen.getByLabelText("Control code")).toHaveValue(
        "ZFNX2D83VBUC",
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect Telegram" }));

    expect(
      await screen.findByText(
        "Privy verifies the same Telegram account. Telegram cannot sign wallet transactions.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Connect Telegram" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect Telegram" }),
    ).toBeEnabled();
    expect(screen.queryByText(/app signer/)).not.toBeInTheDocument();
  });

  it("shows an actionable stop when Ribbot has not provisioned a wallet", async () => {
    mocks.walletlessAccount = true;
    render(<RibbotControlClient />);

    await waitFor(() => {
      expect(screen.getByLabelText("Control code")).toHaveValue(
        "ZFNX2D83VBUC",
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect Telegram" }));

    await screen.findByText(
      "Wallet setup did not finish. Return to Ribbot and tap Connect Account again.",
    );
    expect(screen.getByText("Wallet unavailable")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Enable Ribbot" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Account tools")).not.toBeInTheDocument();
  });

  it("funds the Imperial profile PDA while exporting the one Privy key", async () => {
    render(<RibbotControlClient />);

    await waitFor(() => {
      expect(screen.getByLabelText("Control code")).toHaveValue(
        "ZFNX2D83VBUC",
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect Telegram" }));

    const connectButton = await screen.findByRole("button", {
      name: "Enable Ribbot",
    });
    expect(connectButton).toBeEnabled();
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(mocks.addSigners).toHaveBeenCalledWith({
        address: "So11111111111111111111111111111111111111112",
        signers: [
          {
            signerId: "auth-key",
            policyIds: ["spot-nft-policy"],
          },
        ],
      });
      expect(mocks.signMessage).toHaveBeenCalledOnce();
    });
    const dialog = await screen.findByRole("dialog", {
      name: "Ribbot is ready",
    });
    expect(dialog).toHaveTextContent(
      "Your Frog Trading Exchange account is ready for NFT trading and Imperial perps. Spot Trading is coming soon. Privy holds the only private key.",
    );
    expect(dialog).toHaveTextContent("Spot & NFT Wallet (Privy)");
    expect(dialog).toHaveTextContent(
      "So11111111111111111111111111111111111111112",
    );
    expect(dialog).toHaveTextContent("Imperial Perps Wallet");
    expect(dialog).toHaveTextContent(
      "Send SOL to the Spot & NFT Wallet for Frog trades. Spot swaps are coming soon. Send at least 50 USDC on Solana to the Imperial Perps Wallet for perps trading.",
    );
    expect(dialog).toHaveTextContent(
      "Vote111111111111111111111111111111111111111",
    );
    expect(dialog).toHaveTextContent(
      "Ribbot sent the setup result to Telegram. You can close this page.",
    );
    expect(dialog).not.toHaveTextContent("Privy secures your key.");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Export Spot & NFT key" }),
    );

    await waitFor(() => {
      expect(mocks.exportWallet).toHaveBeenCalledWith({
        address: "So11111111111111111111111111111111111111112",
      });
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("heading", { name: "Ribbot is ready" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Send SOL to the Spot & NFT Wallet for Frog trades. Spot swaps are coming soon. Send at least 50 USDC on Solana to the Imperial Perps Wallet for perps trading.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Vote111111111111111111111111111111111111111",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Your wallet controls" }),
    ).toBeInTheDocument();
  });

  it("restores revoked Ribbot access before completing setup", async () => {
    mocks.revokedAccount = true;
    render(<RibbotControlClient />);

    await waitFor(() => {
      expect(screen.getByLabelText("Control code")).toHaveValue(
        "ZFNX2D83VBUC",
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect Telegram" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable Ribbot" }),
    );

    await screen.findByRole("dialog", { name: "Ribbot is ready" });
    const walletRequests = vi
      .mocked(fetch)
      .mock.calls.filter(
        ([input]) =>
          String(input) === "/api/frogx/trading-bot/control/wallet",
      )
      .map(([, init]) => JSON.parse(String(init?.body)) as { action: string });
    expect(walletRequests.map(({ action }) => action)).toEqual([
      "verify_signer",
      "restore",
    ]);
  });

  it("disables FTX trading before removing every Privy app signer", async () => {
    render(<RibbotControlClient />);

    await waitFor(() => {
      expect(screen.getByLabelText("Control code")).toHaveValue(
        "ZFNX2D83VBUC",
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect Telegram" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable Ribbot" }),
    );
    const successDialog = await screen.findByRole("dialog", {
      name: "Ribbot is ready",
    });
    fireEvent.click(
      within(successDialog).getByRole("button", { name: "Done" }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Remove Ribbot access" }),
    );
    const removalDialog = await screen.findByRole("dialog", {
      name: "Remove Ribbot access?",
    });
    expect(removalDialog).toHaveTextContent(
      "This stops automated trading and removes every app signer.",
    );
    fireEvent.click(
      within(removalDialog).getByRole("button", { name: "Remove access" }),
    );

    await waitFor(() => {
      expect(mocks.removeSigners).toHaveBeenCalledWith({
        address: "So11111111111111111111111111111111111111112",
      });
    });
    expect(
      screen.getAllByText(
        "Ribbot access removed. Only you can transact with this wallet.",
      ),
    ).not.toHaveLength(0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
