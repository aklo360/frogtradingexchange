import { describe, expect, it } from "vitest";

import {
  activityLabel,
  buildProfileMilestones,
  deriveDefaultUsername,
  formatShortAddress,
  formatTokenAmount,
  formatUsd,
  normalizeEpochMilliseconds,
  shortMint,
  timeAgo,
  tradeChip,
} from "./profileView";

describe("profile view model", () => {
  it("derives stable wallet labels without inventing profile metrics", () => {
    const address = "So11111111111111111111111111111111111111112";

    expect(deriveDefaultUsername(address)).toBe("frog-so1112");
    expect(formatShortAddress(address)).toBe("So11...1112");
    expect(shortMint(address)).toBe("So11...1112");
    expect(normalizeEpochMilliseconds(1_700_000_000)).toBe(1_700_000_000_000);
  });

  it("earns milestones only from their documented thresholds", () => {
    const milestones = buildProfileMilestones({
      frogCount: 4,
      followerCount: 10,
      recentTradeCount: 1,
    });

    expect(milestones.map(({ id, earned }) => ({ id, earned }))).toEqual([
      { id: "hotshot", earned: true },
      { id: "samurai", earned: false },
      { id: "trailblazer", earned: true },
    ]);
  });

  it("maps trade types to deterministic chips", () => {
    expect(tradeChip({ tradeType: "buy" })).toEqual({
      label: "BUY",
      tone: "buy",
    });
    expect(tradeChip({ tradeType: "sell" })).toEqual({
      label: "SELL",
      tone: "sell",
    });
    expect(tradeChip({ tradeType: "swap" })).toEqual({
      label: "SWAP",
      tone: "swap",
    });
  });

  it("formats token amounts compactly without fabricating precision", () => {
    expect(formatTokenAmount(12_400_000)).toBe("12.4M");
    expect(formatTokenAmount(184_000)).toBe("184K");
    expect(formatTokenAmount(2.5)).toBe("2.5");
    expect(formatTokenAmount(0.1234567)).toBe("0.1235");
    expect(formatTokenAmount(0)).toBe("0");
  });

  it("formats USD values with honest sub-cent handling", () => {
    expect(formatUsd(412.5)).toBe("$412.50");
    expect(formatUsd(-137.5)).toBe("-$137.50");
    expect(formatUsd(0.004)).toBe("<$0.01");
    expect(formatUsd(3_034)).toBe("$3,034");
  });

  it("reports relative time from a fixed clock", () => {
    const now = 1_700_000_000_000;

    expect(timeAgo(now - 30_000, now)).toBe("just now");
    expect(timeAgo(now - 5 * 60_000, now)).toBe("5m ago");
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(timeAgo(now - 2 * 86_400_000, now)).toBe("2d ago");
  });

  it("labels social activity types in plain language", () => {
    expect(activityLabel("new_follower")).toBe("New follower");
    expect(activityLabel("comment")).toBe("Comment");
    expect(activityLabel("unknown_kind")).toBe("Activity");
  });
});
