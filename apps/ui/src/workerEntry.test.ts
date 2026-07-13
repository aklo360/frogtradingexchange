import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "../worker-entry.mjs";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Pages API proxy", () => {
  it("retries a thrown upstream fetch and strips Cloudflare transport headers", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("intermittent subrequest failure"))
      .mockResolvedValueOnce(Response.json({ total: 8 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await worker.fetch(
      new Request("https://frogtrading.exchange/api/frogx/nfts", {
        headers: { "cf-ray": "test-ray", Accept: "application/json" },
      }),
      { API_ORIGIN: "https://frogx-api.example" },
      {},
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://frogx-api.example/api/frogx/nfts",
    );
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).has("cf-ray"),
    ).toBe(false);
  });

  it("returns a bounded JSON error when both upstream attempts throw", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValue(new Error("upstream unavailable")),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await worker.fetch(
      new Request("https://frogtrading.exchange/api/frogx/nfts"),
      { API_ORIGIN: "https://frogx-api.example" },
      {},
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "FTX API is temporarily unavailable",
    });
  });
});
