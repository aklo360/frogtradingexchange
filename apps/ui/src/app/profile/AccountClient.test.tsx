import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ready: true,
  authenticated: false,
  linkedAccounts: [] as Array<Record<string, unknown>>,
  login: vi.fn(),
  logout: vi.fn(),
  linkWallet: vi.fn(),
  getAccessToken: vi.fn(),
  createWallet: vi.fn(),
  exportWallet: vi.fn(),
  connection: {
    getBalance: vi.fn(),
  },
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({
    ready: mocks.ready,
    authenticated: mocks.authenticated,
    user: mocks.authenticated
      ? { id: "did:privy:test", linkedAccounts: mocks.linkedAccounts }
      : null,
    login: mocks.login,
    logout: mocks.logout,
    linkWallet: mocks.linkWallet,
    getAccessToken: mocks.getAccessToken,
  }),
}));

vi.mock("@privy-io/react-auth/solana", () => ({
  useCreateWallet: () => ({ createWallet: mocks.createWallet }),
  useExportWallet: () => ({ exportWallet: mocks.exportWallet }),
}));

vi.mock("@/providers/SolanaProvider", () => ({
  useSolanaConnection: () => mocks.connection,
}));

vi.mock("@/components/Ticker", () => ({
  Ticker: () => <div data-testid="ticker" />,
}));

import AccountClient from "./AccountClient";

describe("AccountClient", () => {
  beforeEach(() => {
    mocks.ready = true;
    mocks.authenticated = false;
    mocks.linkedAccounts = [];
    mocks.login.mockReset();
    mocks.logout.mockReset();
    mocks.linkWallet.mockReset();
    mocks.getAccessToken.mockReset();
    mocks.getAccessToken.mockResolvedValue("privy-access-token");
    mocks.createWallet.mockReset();
    mocks.exportWallet.mockReset();
    mocks.connection.getBalance.mockReset();
    mocks.connection.getBalance.mockResolvedValue(2_000_000_000);
    mocks.push.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          walletAddress: "",
          walletAddresses: [],
          items: [],
          page: 1,
          limit: 50,
          total: 0,
        }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("opens Privy from the minimal disconnected state", () => {
    render(<AccountClient />);

    fireEvent.click(
      screen.getByRole("button", { name: "Log in / Sign up" }),
    );

    expect(mocks.login).toHaveBeenCalledWith({
      loginMethods: ["telegram", "google", "apple", "wallet"],
    });
    expect(screen.getByText("Secured by Privy")).toBeVisible();
  });

  it("shows the connected Telegram identity and full wallet address", async () => {
    mocks.authenticated = true;
    mocks.linkedAccounts = [
      {
        type: "telegram",
        telegramUserId: "1640077203",
        username: "aklo360",
      },
      {
        type: "wallet",
        chainType: "solana",
        walletClientType: "privy",
        walletIndex: 0,
        address: "9p9UcNW4QaAcw6pRAMFtaJHuNChL6dFFnbYzARTnJSWY",
      },
      {
        type: "wallet",
        chainType: "solana",
        walletClientType: "privy-v2",
        walletIndex: 1,
        address: "So11111111111111111111111111111111111111112",
      },
    ];

    render(<AccountClient />);

    expect(screen.getByText("@aklo360")).toBeVisible();
    expect(screen.getByText("ID 1640077203")).toBeVisible();
    expect(
      screen.getByText("9p9UcNW4QaAcw6pRAMFtaJHuNChL6dFFnbYzARTnJSWY"),
    ).toBeVisible();
    expect(screen.getByText("Spot & NFT Wallet (Privy)")).toBeVisible();
    expect(screen.queryByText("Perps Wallet (Privy)")).not.toBeInTheDocument();
    expect(
      screen.queryByText("So11111111111111111111111111111111111111112"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Legacy Wallet/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Export wallet 2" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Solana Business Frogs")).toBeVisible();
    expect(screen.queryByText("Holder perks")).not.toBeInTheDocument();
    expect(await screen.findByText("0 Frogs")).toBeVisible();
    expect(screen.getAllByText("0 Frogs")).toHaveLength(1);
    await waitFor(() => {
      expect(mocks.connection.getBalance).toHaveBeenCalledTimes(1);
    });
  });

  it("shows the user's Imperial PDA as the perps deposit wallet", async () => {
    const spotWallet = "11111111111111111111111111111111";
    const profileAddress = "Vote111111111111111111111111111111111111111";
    mocks.authenticated = true;
    mocks.linkedAccounts = [
      {
        type: "telegram",
        telegramUserId: "1640077203",
        username: "aklo360",
      },
      {
        type: "wallet",
        chainType: "solana",
        walletClientType: "privy",
        walletIndex: 0,
        address: spotWallet,
      },
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/frogx/account/perps-wallet")) {
        return Response.json({
          status: "ready",
          telegramUserId: "1640077203",
          authorityWalletAddress: spotWallet,
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
      }
      return Response.json({
        walletAddress: spotWallet,
        walletAddresses: [spotWallet],
        items: [],
        page: 1,
        limit: 50,
        total: 0,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountClient />);

    expect(
      await screen.findByText("Perps Deposit Wallet (Imperial)"),
    ).toBeVisible();
    expect(screen.getByText(profileAddress)).toBeVisible();
    expect(screen.getByText("80 USDC")).toBeVisible();
    expect(screen.getByText("Minimum 50 USDC")).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Copy Perps Deposit Wallet address",
      }),
    ).toBeVisible();
    expect(screen.getAllByRole("button", { name: /Export wallet/ })).toHaveLength(
      1,
    );
    expect(mocks.getAccessToken).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/frogx/account/perps-wallet",
      expect.objectContaining({
        headers: { Authorization: "Bearer privy-access-token" },
      }),
    );
    await waitFor(() => {
      expect(mocks.connection.getBalance).toHaveBeenCalledTimes(1);
    });
    const nftRequest = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("/api/frogx/nfts?"),
    );
    expect(String(nftRequest?.[0])).not.toContain(profileAddress);
  });

  it("opens Privy export for an embedded wallet", async () => {
    const address = "9p9UcNW4QaAcw6pRAMFtaJHuNChL6dFFnbYzARTnJSWY";
    mocks.authenticated = true;
    mocks.linkedAccounts = [
      {
        type: "wallet",
        chainType: "solana",
        walletClientType: "privy",
        walletIndex: 0,
        address,
      },
    ];
    mocks.exportWallet.mockResolvedValue(undefined);

    render(<AccountClient />);
    fireEvent.click(screen.getByRole("button", { name: "Export wallet 1" }));

    await waitFor(() => {
      expect(mocks.exportWallet).toHaveBeenCalledWith({ address });
    });
  });

  it("adds an ownership-verified read-only wallet to balances and Frog perks", async () => {
    const portfolioAddress =
      "Vote111111111111111111111111111111111111111";
    mocks.authenticated = true;
    mocks.linkedAccounts = [
      {
        type: "wallet",
        chainType: "solana",
        walletClientType: "privy",
        walletIndex: 0,
        address: "11111111111111111111111111111111",
      },
      {
        type: "wallet",
        chainType: "solana",
        walletClientType: "privy-v2",
        walletIndex: 1,
        address: "So11111111111111111111111111111111111111112",
      },
      {
        type: "wallet",
        chainType: "solana",
        walletClientType: "phantom",
        address: portfolioAddress,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          walletAddress: "11111111111111111111111111111111",
          walletAddresses: mocks.linkedAccounts
            .filter((account) => account.type === "wallet")
            .map((account) => account.address),
          items: [
            {
              mint: "Frog111111111111111111111111111111111111111",
              name: "Solana Business Frog #1",
              description: null,
              image: "/sbficon.png",
              collection: "Solana Business Frogs",
              owner: portfolioAddress,
              compressed: false,
              attributes: [],
            },
          ],
          page: 1,
          limit: 50,
          total: 1,
        }),
      ),
    );

    render(<AccountClient />);
    fireEvent.click(
      screen.getByRole("button", { name: "Add portfolio wallet" }),
    );

    expect(mocks.linkWallet).toHaveBeenCalledWith({
      walletChainType: "solana-only",
      description:
        "Add a wallet to view its balance and Business Frogs. It stays read only.",
    });
    expect(screen.getByText("Portfolio Wallet (Read only)")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Export wallet 2" }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("Frog holder verified")).toBeVisible();
    expect(screen.getByText("1 Frog")).toBeVisible();
    await waitFor(() => {
      expect(mocks.connection.getBalance).toHaveBeenCalledTimes(2);
    });
  });

  it("signs out of the Privy account", async () => {
    mocks.authenticated = true;
    mocks.logout.mockResolvedValue(undefined);

    render(<AccountClient />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => {
      expect(mocks.logout).toHaveBeenCalledOnce();
    });
  });
});
