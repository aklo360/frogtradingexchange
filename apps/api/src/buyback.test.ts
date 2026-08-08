import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  amountAfterReserve,
  formatLamportsAsSol,
  getBuybackFeeAccountRepairPlan,
  isAuthorizedBuybackTrigger,
  selectCheapestListing,
} from "./buyback";
import type { Env } from "./env";
import { postBuybackRepairFeeAccounts } from "./routes";

const COLLECTOR = new PublicKey(
  "FRoGhxGx2kugimLMTiq3qra7yarFmnfpm6E3y38myzWh",
);

describe("buyback fee account repair", () => {
  it("derives only the collector's canonical WSOL, USDC, and USDT accounts", () => {
    const plan = getBuybackFeeAccountRepairPlan(COLLECTOR);

    expect(
      plan.map(({ symbol, address }) => [symbol, address.toBase58()]),
    ).toEqual([
      ["WSOL", "8ZS7hMekbggef1a2cbHj3U7UebLB4qWHH9PyGd6RMdye"],
      ["USDC", "7NcR9WU2kzJV1RcN9NcGXakkbU9289rxZdAoyMxNuCsE"],
      ["USDT", "7a2LNckdNtNFneyTiYiz5uZTYiL79vZvBUKPFCT2MXBa"],
    ]);

    for (const { address, instruction } of plan) {
      expect(instruction.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(
        true,
      );
      expect(instruction.keys[0]).toMatchObject({
        isSigner: true,
        isWritable: true,
      });
      expect(instruction.keys[0].pubkey.equals(COLLECTOR)).toBe(true);
      expect(instruction.keys[1].pubkey.equals(address)).toBe(true);
      expect(instruction.keys[2].pubkey.equals(COLLECTOR)).toBe(true);
      expect(instruction.keys[5].pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
      expect(Array.from(instruction.data)).toEqual([1]);
    }
  });

  it("rejects repair requests when the trigger token is absent", async () => {
    const response = await postBuybackRepairFeeAccounts(
      new Request("https://frogx.test/api/frogx/buyback/repair-fee-accounts", {
        method: "POST",
      }),
      { BUYBACK_TRIGGER_TOKEN: "repair-secret" } as Env,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("uses exact bearer-token authorization", () => {
    const env = { BUYBACK_TRIGGER_TOKEN: "repair-secret" } as Env;
    expect(
      isAuthorizedBuybackTrigger(
        new Request("https://frogx.test", {
          headers: { authorization: "Bearer repair-secret" },
        }),
        env,
      ),
    ).toBe(true);
    expect(
      isAuthorizedBuybackTrigger(
        new Request("https://frogx.test", {
          headers: { authorization: "Bearer repair-secrex" },
        }),
        env,
      ),
    ).toBe(false);
  });
});

describe("buyback pricing", () => {
  it("subtracts only the configured SOL reserve from progress funds", () => {
    expect(amountAfterReserve(6_674_525n, 5_000_000n)).toBe(1_674_525n);
    expect(amountAfterReserve(4_999_999n, 5_000_000n)).toBe(0n);
  });

  it("formats MMM maximum payment amounts in SOL", () => {
    expect(formatLamportsAsSol(31_559_656n)).toBe("0.031559656");
  });

  it("selects the cheapest valid listing regardless of response order", () => {
    const listing = selectCheapestListing([
      { tokenMint: "expensive", price: 0.04 },
      { tokenMint: "invalid", price: "not-a-number" },
      {
        tokenMint: "cheapest",
        priceLamports: "31559656",
        listingSource: "mmm",
      },
      { tokenMint: "middle", price: 0.035 },
    ]);

    expect(listing).toMatchObject({
      tokenMint: "cheapest",
      priceLamports: 31_559_656n,
      source: "mmm",
    });
  });
});
