import { afterEach, describe, expect, it, vi } from "vitest";

import { postSwap } from "./routes";

const buildRequest = (body: unknown) =>
  new Request("https://frogx.test/api/frogx/swap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("swap execution route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires a complete execution payload", async () => {
    const response = await postSwap(buildRequest({ action: "swap" }), {});
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/userPubkey/i);
  });

  it("does not return fake executable transactions without Titan credentials", async () => {
    const response = await postSwap(
      buildRequest({
        userPubkey: "11111111111111111111111111111111",
        inMint: "So11111111111111111111111111111111111111112",
        outMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        amountIn: "1000000",
        slippageBps: 50,
        priorityFee: 0,
      }),
      {},
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(503);
    expect(body.error).toMatch(/Titan credentials/i);
  });

  it("normalizes userPublicKey to Titan's userPubkey swap-build payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        txBase64: "AQID",
        meta: { provider: "titan" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await postSwap(
      buildRequest({
        userPublicKey: "11111111111111111111111111111111",
        inMint: "So11111111111111111111111111111111111111112",
        outMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        amountIn: "1000000",
        slippageBps: 50,
        priorityFee: 0,
      }),
      {
        TITAN_TOKEN: "test-token",
        TITAN_BASE_URL: "https://titan.test/api/v1",
      },
    );
    const body = (await response.json()) as {
      mode: string;
      txBase64: string;
      meta: Record<string, unknown>;
    };
    const forwarded = JSON.parse(
      fetchMock.mock.calls[0]?.[1]?.body as string,
    ) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://titan.test/api/v1/frogx/swap",
    );
    expect(forwarded.userPubkey).toBe("11111111111111111111111111111111");
    expect(forwarded).not.toHaveProperty("userPublicKey");
    expect(forwarded.inMint).toBe("So11111111111111111111111111111111111111112");
    expect(forwarded.outMint).toBe(
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    );
    expect(body.mode).toBe("tx_base64");
    expect(body.txBase64).toBe("AQID");
    expect(body.meta.provider).toBe("titan");
  });
});
