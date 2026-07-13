import { describe, expect, it } from "vitest";

import type { AppProfileResponse } from "@/lib/tapestry/types";
import {
  buildProfileMilestones,
  buildProfileTimeline,
  deriveDefaultUsername,
  formatShortAddress,
  normalizeEpochMilliseconds,
} from "./profileView";

const profileFixture = (overrides: Partial<AppProfileResponse> = {}) =>
  ({
    profile: {
      id: "profile-1",
      namespace: "frogx",
      createdAt: 1_700_000_000_000,
      username: "frog-one",
    },
    socialCounts: { followers: 0, following: 0 },
    ...overrides,
  }) satisfies AppProfileResponse;

describe("profile view model", () => {
  it("derives stable wallet labels without inventing profile metrics", () => {
    const address = "So11111111111111111111111111111111111111112";

    expect(deriveDefaultUsername(address)).toBe("frog-so1112");
    expect(formatShortAddress(address)).toBe("So11...1112");
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

  it("merges real trade and social rows in reverse chronological order", () => {
    const timeline = buildProfileTimeline(
      profileFixture({
        tradeHistory: [
          {
            id: 1,
            transactionSignature: "signature-1",
            walletAddress: "wallet",
            inputMint: "InputMint111111",
            outputMint: "OutputMint22222",
            inputAmount: 1,
            outputAmount: 2,
            timestamp: 1_700_000_000,
            tradeType: "buy",
            platform: "main",
            createdAt: "2023-11-14T22:13:20.000Z",
            updatedAt: "2023-11-14T22:13:20.000Z",
          },
        ],
        activity: [
          {
            type: "new_follower",
            actor_id: "actor-1",
            actor_username: "frog-two",
            timestamp: 1_700_000_100,
            activity: "frog-two followed frog-one",
          },
        ],
      }),
    );

    expect(timeline.map((item) => item.label)).toEqual([
      "New follower",
      "Bought",
    ]);
    expect(timeline[1].detail).toBe("Inpu...1111 to Outp...2222");
  });
});
