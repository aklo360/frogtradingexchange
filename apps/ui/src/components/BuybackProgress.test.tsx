import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BuybackProgress } from "./BuybackProgress";

const statusFixture = (progress: number) => ({
  enabled: true,
  wallet: "FRoGhxGx2kugimLMTiq3qra7yarFmnfpm6E3y38myzWh",
  collectedSol: progress >= 1 ? 0.031559656 : 0.001674525,
  floorSol: 0.031559656,
  progress,
  remainingSol: progress >= 1 ? 0 : 0.029885131,
  feeAccounts: {
    ready: true,
    wsol: true,
    usdc: true,
    usdt: true,
  },
  automation: {
    ready: true,
    reason: null,
  },
  updatedAt: "2026-07-30T12:00:00.000Z",
});

describe("BuybackProgress", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(statusFixture(0.053059591))),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders precise live progress from the buyback status", async () => {
    render(<BuybackProgress />);

    expect(
      screen.getByRole("heading", { name: "Buy Back & Burn Progress" }),
    ).toBeInTheDocument();

    const progressbar = await screen.findByRole("progressbar");

    expect(progressbar).toHaveAttribute("aria-valuenow", "5.31");
    expect(progressbar.firstElementChild).toHaveStyle({
      width: "5.3059591%",
    });
    expect(screen.getByText(/0\.0017 \/ 0\.0316 SOL · 5%/)).toBeInTheDocument();
  });

  it("does not reset a completed bar before the backend balance changes", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(statusFixture(1))),
    );
    render(<BuybackProgress />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100);
    });

    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    expect(screen.getByText(/100%/)).toBeInTheDocument();
  });
});
