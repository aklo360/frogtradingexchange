import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getProfilesByWalletAddress } from "./client";

const TEST_WALLET = "11111111111111111111111111111111";

describe("Tapestry client", () => {
  const originalApiKey = process.env.TAPESTRY_API_KEY;
  const originalBaseUrl = process.env.TAPESTRY_API_BASE_URL;

  beforeEach(() => {
    process.env.TAPESTRY_API_KEY = "test-tapestry-key";
    delete process.env.TAPESTRY_API_BASE_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalApiKey === undefined) delete process.env.TAPESTRY_API_KEY;
    else process.env.TAPESTRY_API_KEY = originalApiKey;
    if (originalBaseUrl === undefined) delete process.env.TAPESTRY_API_BASE_URL;
    else process.env.TAPESTRY_API_BASE_URL = originalBaseUrl;
  });

  it("uses Tapestry's current production v1 base path", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ profiles: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getProfilesByWalletAddress(TEST_WALLET);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `https://api.usetapestry.dev/v1/profiles?apiKey=test-tapestry-key&walletAddress=${TEST_WALLET}&pageSize=50`,
    );
  });
});
