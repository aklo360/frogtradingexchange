import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NftHoldingsPage } from "@/lib/nfts";
import type { AppProfileResponse } from "@/lib/tapestry/types";

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

const profileFixture = (): AppProfileResponse => ({
  profile: {
    id: "profile-42",
    namespace: "frogx",
    createdAt: 1_700_000_000,
    username: "pond-chief",
    bio: "Trading from the lily pad.",
  },
  socialCounts: { followers: 12, following: 4 },
  followers: { profiles: [], total: 12 },
  following: { profiles: [], total: 4 },
  pfpMint: "frog-mint-42",
  pfpImage: null,
  tradeHistory: [
    {
      id: 1,
      transactionSignature: "signature-42",
      walletAddress: mocks.walletAddress,
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: "TokenMint22222222222222222222222222222222222",
      inputAmount: 1,
      outputAmount: 2,
      timestamp: 1_700_000_000,
      tradeType: "buy",
      platform: "main",
      createdAt: "2023-11-14T22:13:20.000Z",
      updatedAt: "2023-11-14T22:13:20.000Z",
    },
  ],
});

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

const mockProfileAndNfts = (
  profileResponse: Response | (() => Promise<Response>),
  nftResponse: Response = Response.json(nftFixture()),
) => {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith("/api/frogx/nfts?")) return nftResponse;
    return typeof profileResponse === "function"
      ? profileResponse()
      : profileResponse;
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
    expect(screen.getAllByRole("button", { name: "Connect Wallet" })).not.toHaveLength(0);
    expect(screen.queryByText("Points")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows a stable loading state while the connected profile resolves", () => {
    mocks.walletAddress = "11111111111111111111111111111111";
    vi.mocked(fetch).mockImplementation(() => new Promise<Response>(() => undefined));

    render(<ProfilePage />);

    expect(screen.getByText("Syncing wallet profile")).toBeVisible();
  });

  it("offers a retry when the profile request fails", async () => {
    mocks.walletAddress = "Vote111111111111111111111111111111111111111";
    mockProfileAndNfts(
      new Response("upstream unavailable", { status: 502 }),
      Response.json(nftFixture()),
    );

    render(<ProfilePage />);

    expect(
      await screen.findByRole("heading", { name: "Your wallet is connected." }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Retry social sync" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("heading", { name: "Solana Business Frogs" }),
    ).toBeVisible();
    expect(screen.getByText("Frog #42")).toBeVisible();
  });

  it("does not expose an upstream HTML error document in the holdings panel", async () => {
    mocks.walletAddress = "BPFLoader1111111111111111111111111111111111";
    mockProfileAndNfts(
      Response.json(profileFixture()),
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
    mockProfileAndNfts(
      Response.json({ error: "Profile not found" }, { status: 404 }),
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
        .mock.calls.find(([input]) => String(input).startsWith("/api/frogx/nfts?"));
      expect(nftCall).toBeDefined();
      const query = new URL(String(nftCall?.[0]), "https://frogx.test")
        .searchParams;
      expect(query.getAll("walletAddress")).toEqual([
        firstWallet,
        secondWallet,
      ]);
    });
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
    vi.mocked(fetch).mockImplementation(() => new Promise<Response>(() => undefined));

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
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ error: "Profile not found" }, { status: 404 }),
    );

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

  it("renders only real profile, collection, trade, and milestone values", async () => {
    mocks.walletAddress = "Stake11111111111111111111111111111111111111";
    mockProfileAndNfts(Response.json(profileFixture()));

    render(<ProfilePage />);

    expect(await screen.findByRole("heading", { name: "pond-chief" })).toBeVisible();
    expect(screen.getByText("Trading from the lily pad.")).toBeVisible();
    expect(screen.getByText("Frogs").parentElement).toHaveTextContent("1");
    expect(screen.getByText("Followers").parentElement).toHaveTextContent("12");
    expect(screen.getByText("Recent trades").parentElement).toHaveTextContent("1");
    expect(screen.getByText("Frog #42")).toBeVisible();
    expect(screen.getByText("Hotshot").closest("li")).toHaveTextContent("Earned");
    expect(screen.getByText("Samurai").closest("li")).toHaveTextContent("Locked");
    expect(screen.queryByText("Points")).not.toBeInTheDocument();

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/frogx\/nfts\?.*walletAddress=/),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("creates a missing profile and replaces the empty state", async () => {
    mocks.walletAddress = "Config1111111111111111111111111111111111111";
    let profileGetComplete = false;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/frogx/nfts?")) {
        return Response.json(nftFixture());
      }
      if (init?.method === "POST") return Response.json(profileFixture());
      if (!profileGetComplete) {
        profileGetComplete = true;
        return Response.json({ error: "Profile not found" }, { status: 404 });
      }
      return Response.json(profileFixture());
    });

    render(<ProfilePage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Create profile" }),
    );

    expect(
      await screen.findByRole("heading", { name: "pond-chief" }),
    ).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(
      "/api/tapestry/profiles",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows the API error when profile creation fails", async () => {
    mocks.walletAddress = "SysvarRent111111111111111111111111111111111";
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/frogx/nfts?")) {
        return Response.json(nftFixture());
      }
      if (init?.method === "POST") {
        return Response.json(
          { error: "Profile service is temporarily unavailable" },
          { status: 502 },
        );
      }
      return Response.json({ error: "Profile not found" }, { status: 404 });
    });

    render(<ProfilePage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Create profile" }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Profile service is temporarily unavailable");
  });
});
