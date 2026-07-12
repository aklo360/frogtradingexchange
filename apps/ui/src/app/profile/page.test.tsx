import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppProfileResponse } from "@/lib/tapestry/types";

const mocks = vi.hoisted(() => ({
  walletAddress: "",
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
  }),
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
  nfts: {
    page: 1,
    limit: 1000,
    total: 1,
    items: [
      {
        id: "frog-mint-42",
        name: "Solana Business Frog #42",
        image: null,
        collection: "Solana Business Frogs",
      },
    ],
  },
});

describe("ProfilePage", () => {
  beforeEach(() => {
    mocks.walletAddress = "";
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

    expect(screen.getByRole("heading", { name: "Your wallet is your identity." })).toBeVisible();
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
    vi.mocked(fetch).mockResolvedValue(new Response("upstream unavailable", { status: 502 }));

    render(<ProfilePage />);

    expect(
      await screen.findByRole("heading", { name: "Profile data is unavailable." }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry sync" })).toBeEnabled();
  });

  it("renders only real profile, collection, trade, and milestone values", async () => {
    mocks.walletAddress = "Stake11111111111111111111111111111111111111";
    vi.mocked(fetch).mockResolvedValue(Response.json(profileFixture()));

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

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it("creates a missing profile and replaces the empty state", async () => {
    mocks.walletAddress = "Config1111111111111111111111111111111111111";
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json({ error: "Profile not found" }, { status: 404 }),
      )
      .mockResolvedValueOnce(Response.json(profileFixture()));

    render(<ProfilePage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Create profile" }),
    );

    expect(
      await screen.findByRole("heading", { name: "pond-chief" }),
    ).toBeVisible();
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/tapestry/profiles",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows the API error when profile creation fails", async () => {
    mocks.walletAddress = "SysvarRent111111111111111111111111111111111";
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json({ error: "Profile not found" }, { status: 404 }),
      )
      .mockResolvedValueOnce(
        Response.json(
          { error: "Profile service is temporarily unavailable" },
          { status: 502 },
        ),
      );

    render(<ProfilePage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Create profile" }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Profile service is temporarily unavailable");
  });
});
