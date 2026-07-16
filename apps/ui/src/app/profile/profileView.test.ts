import { describe, expect, it } from "vitest";

import {
  buildProfileMilestones,
  deriveDefaultUsername,
  formatShortAddress,
  loadStoredPfp,
  storePfp,
} from "./profileView";

const memoryStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
};

describe("profile view model", () => {
  it("derives stable wallet labels without inventing profile metrics", () => {
    const address = "So11111111111111111111111111111111111111112";

    expect(deriveDefaultUsername(address)).toBe("frog-so1112");
    expect(formatShortAddress(address)).toBe("So11...1112");
  });

  it("earns badges only from verified frog holdings", () => {
    const none = buildProfileMilestones({ frogCount: 0 });
    expect(none.every((milestone) => !milestone.earned)).toBe(true);

    const four = buildProfileMilestones({ frogCount: 4 });
    expect(four.map(({ id, earned }) => ({ id, earned }))).toEqual([
      { id: "hotshot", earned: true },
      { id: "samurai", earned: false },
      { id: "trailblazer", earned: false },
    ]);

    const whale = buildProfileMilestones({ frogCount: 15 });
    expect(whale.every((milestone) => milestone.earned)).toBe(true);
  });

  it("round-trips the stored profile frog per wallet", () => {
    const storage = memoryStorage();
    const wallet = "9p9UcNW4QaAcw6pRAMFtaJHuNChL6dFFnbYzARTnJSWY";

    expect(loadStoredPfp(wallet, storage)).toBeNull();

    storePfp(wallet, storage, { mint: "frog-mint-42", image: "/frog.png" });
    expect(loadStoredPfp(wallet, storage)).toEqual({
      mint: "frog-mint-42",
      image: "/frog.png",
    });

    expect(loadStoredPfp("OtherWallet1111111111111111111111", storage)).toBeNull();
  });

  it("ignores malformed stored profile frogs", () => {
    const storage = memoryStorage();
    const wallet = "Vote111111111111111111111111111111111111111";

    storage.setItem(`ftx-profile-pfp:${wallet}`, "not-json");
    expect(loadStoredPfp(wallet, storage)).toBeNull();

    storage.setItem(`ftx-profile-pfp:${wallet}`, JSON.stringify({ image: 5 }));
    expect(loadStoredPfp(wallet, storage)).toBeNull();

    expect(loadStoredPfp(wallet, null)).toBeNull();
    expect(() =>
      storePfp(wallet, null, { mint: "m", image: null }),
    ).not.toThrow();
  });
});
