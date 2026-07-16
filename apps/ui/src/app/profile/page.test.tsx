import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NftHoldingsPage } from "@/lib/nfts";

const mocks = vi.hoisted(() => ({
  walletAddress: "",
  privyReady: true,
  privyAuthenticated: false,
  linkedAccounts: [] as Array<Record<string, unknown>>,
  createWallet: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  disconnect: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  toggleMuted: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({
    connected: Boolean(mocks.walletAddress),
    publicKey: mocks.walletAddress
      ? { toBase58: () => mocks.walletAddress }
      : null,
    disconnect: mocks.disconnect,
  }),
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({
    ready: mocks.privyReady,
    authenticated: mocks.privyAuthenticated,
    user: mocks.privyAuthenticated
      ? { id: "did:privy:test", linkedAccounts: mocks.linkedAccounts }
      : null,
    login: mocks.login,
    logout: mocks.logout,
  }),
}));

vi.mock("@privy-io/react-auth/solana", () => ({
  useCreateWallet: () => ({ createWallet: mocks.createWallet }),
}));

vi.mock("@/providers/AudioProvider", () => ({
  useAudio: () => ({ muted: true, toggleMuted: mocks.toggleMuted }),
}));

vi.mock("@/components/Ticker", () => ({
  Ticker: () => <div data-testid="ticker" />,
}));

vi.mock("@/components/WalletButton", () => ({
  WalletButton: ({ className }: { className?: string }) => (
    <button type="button" className={className}>
      Connect Wallet
    </button>
  ),
}));

vi.mock("@/lib/version", () => ({ isV1: false }));

import ProfilePage from "./page";

const nftFixture = (): NftHoldingsPage => ({
  walletAddress: mocks.walletAddress,
  walletAddresses: [mocks.walletAddress],
  page: 1,
  limit: 8,
  total: 1,
  items: [
    {
      mint: "frog-mint-42",
      name: "Solana Business Frog #42",
      description: null,
      image: null,
      collection: "Solana Business Frogs",
      owner: mocks.walletAddress,
      compressed: false,
      attributes: [],
    },
  ],
});

const mockNfts = (response: Response) => {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith("/api/frogx/nfts?")) {
      return response.clone();
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
};

describe("ProfilePage", () => {
  beforeEach(() => {
    mocks.walletAddress = "";
    mocks.privyReady = true;
    mocks.privyAuthenticated = false;
    mocks.linkedAccounts = [];
    mocks.createWallet.mockReset();
    mocks.login.mockReset();
    mocks.logout.mockReset();
    mocks.disconnect.mockReset();
    mocks.push.mockReset();
    mocks.replace.mockReset();
    mocks.toggleMuted.mockReset();
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows an honest connect state without placeholder profile metrics", () => {
    render(<ProfilePage />);

    expect(
      screen.getByRole("heading", {
        name: "One Privy wallet, on web and Telegram.",
      }),
    ).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "Connect Wallet" }),
    ).not.toHaveLength(0);
    expect(screen.queryByText("Points")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("recovers and displays the existing Telegram Privy wallet", () => {
    mocks.privyAuthenticated = true;
    mocks.linkedAccounts = [
      {
        type: "telegram",
        telegramUserId: "12345",
        username: "frogtrader",
      },
      {
        type: "wallet",
        chainType: "solana",
        walletClientType: "privy",
        id: "wallet-id",
        address: "9p9UcNW4QaAcw6pRAMFtaJHuNChL6dFFnbYzARTnJSWY",
      },
    ];
    vi.mocked(fetch).mockImplementation(
      () => new Promise<Response>(() => undefined),
    );

    render(<ProfilePage />);

    expect(screen.getByRole("heading", { name: "@frogtrader" })).toBeVisible();
    expect(
      screen.getByText("9p9UcNW4QaAcw6pRAMFtaJHuNChL6dFFnbYzARTnJSWY"),
    ).toBeVisible();
    expect(screen.getByText("Embedded wallet · Active")).toBeVisible();
    expect(mocks.createWallet).not.toHaveBeenCalled();
  });

  it("creates a wallet only after an explicit click for a new web account", async () => {
    mocks.privyAuthenticated = true;
    mocks.linkedAccounts = [{ type: "email", address: "frog@example.com" }];
    mocks.createWallet.mockResolvedValue({
      wallet: { address: "NewWallet11111111111111111111111111111111111" },
    });
    vi.mocked(fetch).mockResolvedValue(Response.json(nftFixture()));

    render(<ProfilePage />);
    expect(mocks.createWallet).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Create Solana wallet" }),
    );

    expect(
      await screen.findByText("NewWallet11111111111111111111111111111111111"),
    ).toBeVisible();
    expect(mocks.createWallet).toHaveBeenCalledOnce();
  });

  it("requests Business Frogs from every embedded Privy wallet", async () => {
    const firstWallet = "9p9UcNW4QaAcw6pRAMFtaJHuNChL6dFFnbYzARTnJSWY";
    const secondWallet = "Vote111111111111111111111111111111111111111";
    mocks.privyAuthenticated = true;
    mocks.linkedAccounts = [
      {
        type: "wallet",
        chainType: "solana",
        walletClientType: "privy",
        address: firstWallet,
      },
      {
        type: "wallet",
        chainType: "solana",
        walletClientType: "privy",
        address: secondWallet,
      },
    ];
    mockNfts(
      Response.json({
        ...nftFixture(),
        walletAddress: firstWallet,
        walletAddresses: [firstWallet, secondWallet],
        items: [],
        total: 0,
      }),
    );

    render(<ProfilePage />);

    await waitFor(() => {
      const nftCall = vi
        .mocked(fetch)
        .mock.calls.find(([input]) =>
          String(input).startsWith("/api/frogx/nfts?"),
        );
      expect(nftCall).toBeDefined();
      const query = new URL(String(nftCall?.[0]), "https://frogx.test")
        .searchParams;
      expect(query.getAll("walletAddress")).toEqual([
        firstWallet,
        secondWallet,
      ]);
    });
  });

  it("does not expose an upstream HTML error document in the holdings panel", async () => {
    mocks.walletAddress = "BPFLoader1111111111111111111111111111111111";
    mockNfts(
      new Response("<!DOCTYPE html><title>Worker threw exception</title>", {
        status: 500,
        headers: { "Content-Type": "text/html" },
      }),
    );

    render(<ProfilePage />);

    expect(await screen.findByText("Holdings unavailable")).toBeVisible();
    expect(
      screen.getByText("NFT holdings are temporarily unavailable"),
    ).toBeVisible();
    expect(screen.queryByText(/DOCTYPE html/)).not.toBeInTheDocument();
  });

  it("renders only real collection and badge values with no social calls", async () => {
    mocks.walletAddress = "Stake11111111111111111111111111111111111111";
    mockNfts(Response.json(nftFixture()));

    render(<ProfilePage />);

    expect(
      await screen.findByRole("heading", { name: "frog-stak11" }),
    ).toBeVisible();
    expect(screen.getByText("Frogs").parentElement).toHaveTextContent("1");
    expect(screen.getByText("Wallets").parentElement).toHaveTextContent("1");
    expect(screen.getByText("Badges").parentElement).toHaveTextContent("1/3");
    expect(screen.getByText("Frog #42")).toBeVisible();
    expect(screen.getByText("Hotshot").closest("li")).toHaveTextContent(
      "Earned",
    );
    expect(screen.getByText("Samurai").closest("li")).toHaveTextContent(
      "Locked",
    );
    expect(screen.queryByText("Points")).not.toBeInTheDocument();
    expect(screen.queryByText("Followers")).not.toBeInTheDocument();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    for (const [input] of vi.mocked(fetch).mock.calls) {
      expect(String(input)).toMatch(/^\/api\/frogx\/nfts\?/);
    }
  });

  it("persists the selected profile frog per wallet in browser storage", async () => {
    mocks.walletAddress = "Config1111111111111111111111111111111111111";
    mockNfts(Response.json(nftFixture()));

    render(<ProfilePage />);

    const setButton = await screen.findByRole("button", {
      name: "Set as profile",
    });
    fireEvent.click(setButton);

    expect(await screen.findByText("PFP")).toBeVisible();
    expect(screen.getByText("Current profile")).toBeVisible();

    const stored = window.localStorage.getItem(
      `ftx-profile-pfp:${mocks.walletAddress}`,
    );
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored ?? "{}")).toEqual({
      mint: "frog-mint-42",
      image: null,
    });
  });
});
