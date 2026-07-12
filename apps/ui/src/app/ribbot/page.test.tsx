import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
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

vi.mock("./PrivyWalletControls", () => ({
  PrivyWalletControls: () => <div data-testid="privy-controls" />,
}));

import RibbotControlPage from "./page";

const accountFixture = () => ({
  telegramUserId: "123456789",
  username: "pond-chief",
  walletSource: "privy" as const,
  privyUserId: "did:privy:pond-chief",
  privyWalletId: "wallet-ribbot-1",
  solanaWalletAddress: "11111111111111111111111111111111",
  settings: {
    slippageBps: 500,
    priorityFee: 1_000,
    sellPriorityFee: 2_000,
    defaultBuyAmountIn: "100000000",
    buyPresetAmountsIn: ["100000000", "250000000", "500000000"],
    sellPresetBps: [2500, 5000, 7500, 10000],
    botMode: "advanced" as const,
    confirmTrades: true,
    sellProtection: true,
    autoBuyEnabled: false,
    instantAutoBuyEnabled: false,
    instantAutoBuyAmountIn: "100000000",
    instantAutoBuyMinLiquidityUsd: 1000,
    instantAutoBuyMaxMarketCapUsd: 2_000_000,
    autoSellEnabled: true,
    sniperEnabled: false,
    mevProtection: true,
  },
  watchlist: ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"],
  hiddenTokens: [],
  createdAt: "2026-07-01T12:00:00.000Z",
  updatedAt: "2026-07-12T12:00:00.000Z",
});

describe("RibbotControlPage", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    window.history.replaceState({}, "", "/ribbot");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders a focused access workspace before a control session opens", () => {
    render(<RibbotControlPage />);

    expect(
      screen.getByRole("heading", { name: "Ribbot Control" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Telegram ID")).toBeEnabled();
    expect(screen.getByLabelText("Control code")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Open session" })).toBeEnabled();
    expect(screen.getByText("No control session")).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("opens the FTX account workspace and saves FTX-owned mode changes", async () => {
    const user = userEvent.setup();
    const account = accountFixture();
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        Response.json({
          status: "ready",
          account,
          sessionToken: "session-token",
          sessionExpiresAt: "2099-07-12T13:00:00.000Z",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          status: "accepted",
          account: {
            ...account,
            settings: {
              ...account.settings,
              botMode: "simple",
              confirmTrades: false,
            },
          },
          warnings: [],
        }),
      );

    render(<RibbotControlPage />);
    await user.type(screen.getByLabelText("Telegram ID"), "123456789");
    await user.type(screen.getByLabelText("Control code"), "abcd-efgh-2345");
    await user.click(screen.getByRole("button", { name: "Open session" }));

    expect(
      await screen.findByRole("heading", { name: "Trading Defaults" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Wallet & Access" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Watchlist" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Hidden" })).toBeVisible();
    expect(screen.getByText("pond-chief")).toBeVisible();
    expect(screen.getByText("FTX / Privy")).toBeVisible();
    expect(screen.getByTestId("privy-controls")).toBeVisible();
    expect(screen.getByLabelText("Buy amount SOL")).toHaveValue("0.1");
    expect(screen.getByLabelText("Minimum liquidity USD")).toHaveValue(
      "1000",
    );

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      telegramUserId: "123456789",
      code: "ABCDEFGH2345",
    });

    await user.click(screen.getByRole("button", { name: "Simple" }));
    await user.click(screen.getByLabelText("Instant CA"));
    await user.click(screen.getByRole("button", { name: "Save defaults" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const preferenceBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(preferenceBody).toMatchObject({
      telegramUserId: "123456789",
      sessionToken: "session-token",
      kind: "settings",
      action: "set",
      botMode: "simple",
      confirmTrades: false,
      instantAutoBuyEnabled: true,
      instantAutoBuyAmountIn: "100000000",
      instantAutoBuyMinLiquidityUsd: 1000,
      instantAutoBuyMaxMarketCapUsd: 2_000_000,
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/frogx/trading-bot/control/preferences",
    );
  });
});
