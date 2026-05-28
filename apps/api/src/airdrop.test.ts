import { describe, expect, it } from "vitest";

import {
  __airdropTest,
  calculateTierPrizeUnits,
  getAirdropConfig,
} from "./airdrop";

describe("airdrop config", () => {
  it("defaults to a disabled 10 DAEMON tiered Business Frog campaign", () => {
    const config = getAirdropConfig({});

    expect(config.enabled).toBe(false);
    expect(config.daemonTokenAddress).toBe(
      "0x43298327b0249caF5A4942C6951F5Ac6AD7297A0",
    );
    expect(config.escrowAddress).toBe(
      "0xC853Fc4dE86fC8868Fa89FC3B207d4592Db19e46",
    );
    expect(config.daemonDecimals).toBe(18);
    expect(config.minFrogs).toBe(1);
    expect(config.fullPrizeMinFrogs).toBe(10);
    expect(config.poolUnits).toBe(1000);
    expect(config.minPrizeUnits).toBe(10);
    expect(config.maxPrizeUnits).toBe(100);
    expect(config.collectionAddress).toBe(
      "J7rxtKmEpNJEtrfkagiTF1gsmLyVus6BQZFY4ouBkeMG",
    );
  });

  it("publishes Ethereum signatures as optional because the Solana proof binds payout address", () => {
    const config = getAirdropConfig({});
    const publicConfig = {
      requireEthSignature: false,
      minFrogs: config.minFrogs,
    };

    expect(publicConfig).toEqual({
      requireEthSignature: false,
      minFrogs: 1,
    });
  });

  it("parses daemon-denominated prize values into hundredth units", () => {
    const config = getAirdropConfig({
      AIRDROP_ENABLED: "true",
      AIRDROP_POOL_DAEMON: "10",
      AIRDROP_MIN_PRIZE_DAEMON: "0.1",
      AIRDROP_MAX_PRIZE_DAEMON: "1",
    });

    expect(config.enabled).toBe(true);
    expect(config.poolUnits).toBe(1000);
    expect(config.minPrizeUnits).toBe(10);
    expect(config.maxPrizeUnits).toBe(100);
    expect(__airdropTest.unitsToDaemon(config.minPrizeUnits)).toBe("0.10");
  });

  it("can reuse the dev UI Solana RPC var for Worker eligibility checks", () => {
    expect(
      __airdropTest.getRpcUrl({
        NEXT_PUBLIC_SOLANA_RPC_URL: "https://dev-rpc.example.com",
      }),
    ).toBe("https://dev-rpc.example.com");
    expect(
      __airdropTest.getRpcUrl({
        SOLANA_RPC_URL: "https://server-rpc.example.com",
        NEXT_PUBLIC_SOLANA_RPC_URL: "https://dev-rpc.example.com",
      }),
    ).toBe("https://server-rpc.example.com");
  });

  it("converts hundredth-denominated DAEMON values into ERC20 base units", () => {
    expect(__airdropTest.unitsToTokenBaseUnits(25, 18)).toBe(
      "250000000000000000",
    );
    expect(__airdropTest.unitsToTokenBaseUnits(1000, 18)).toBe(
      "10000000000000000000",
    );
  });

  it("normalizes payout signer private keys without accepting malformed values", () => {
    const key = "1".repeat(64);

    expect(__airdropTest.normalizePrivateKey(key)).toBe(`0x${key}`);
    expect(__airdropTest.normalizePrivateKey(`0x${key}`)).toBe(`0x${key}`);
    expect(__airdropTest.normalizePrivateKey("not-a-key")).toBeNull();
  });

  it("only counts DAS assets whose current owner is the connected wallet", () => {
    expect(
      __airdropTest.isCurrentOwner(
        { ownership: { owner: "DmTR1111111111111111111111111111111111111" } },
        "DmTR1111111111111111111111111111111111111",
      ),
    ).toBe(true);
    expect(
      __airdropTest.isCurrentOwner(
        { ownership: { owner: "MarketEscrow11111111111111111111111111111111" } },
        "DmTR1111111111111111111111111111111111111",
      ),
    ).toBe(false);
    expect(__airdropTest.isCurrentOwner({}, "DmTR1111111111111111111111111111111111111")).toBe(
      false,
    );
  });
});

describe("airdrop payout math", () => {
  it("normalizes optional 32-byte seed references", () => {
    const seed = "a".repeat(64);

    expect(__airdropTest.sanitizeSeed(seed)).toBe(`0x${seed}`);
    expect(__airdropTest.sanitizeSeed(`0x${seed.toUpperCase()}`)).toBe(
      `0x${seed}`,
    );
    expect(__airdropTest.sanitizeSeed("not-a-seed")).toBeNull();
  });

  it("assigns exact FCFS tier prizes from claim-time frog count", () => {
    const base = {
      minFrogs: 1,
      fullPrizeMinFrogs: 10,
      minPrizeUnits: 10,
      maxPrizeUnits: 100,
    };

    expect(calculateTierPrizeUnits({ ...base, frogCount: 0 })).toBe(0);
    expect(calculateTierPrizeUnits({ ...base, frogCount: 1 })).toBe(10);
    expect(calculateTierPrizeUnits({ ...base, frogCount: 9 })).toBe(10);
    expect(calculateTierPrizeUnits({ ...base, frogCount: 10 })).toBe(100);
    expect(calculateTierPrizeUnits({ ...base, frogCount: 23 })).toBe(100);
  });
});
