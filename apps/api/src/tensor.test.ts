import { describe, expect, it, vi } from "vitest";

import { checkTensorApiKey } from "./tensor";

describe("Tensor API key health check", () => {
  it("fails locally before calling Tensor when the key is missing", async () => {
    const fetchMock = vi.fn();

    const result = await checkTensorApiKey({}, fetchMock as typeof fetch);

    expect(result.ok).toBe(false);
    expect(result.configured).toBe(false);
    expect(result.error).toBe("TENSOR_API_KEY is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks the current Tensor REST endpoint with x-tensor-api-key", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        collections: [
          {
            id: "collection-id",
            slugDisplay: "sbf",
            name: "Solana Business Frogs",
          },
        ],
      }),
    );

    const result = await checkTensorApiKey(
      { TENSOR_API_KEY: "test-key" },
      fetchMock as typeof fetch,
    );

    expect(result.ok).toBe(true);
    expect(result.collection).toEqual({
      id: "collection-id",
      slugDisplay: "sbf",
      name: "Solana Business Frogs",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mainnet.tensordev.io/api/v1/collections?sortBy=slugDisplay%3Aasc&limit=1&slugDisplays=sbf",
      {
        headers: {
          Accept: "application/json",
          "x-tensor-api-key": "test-key",
        },
      },
    );
  });

  it("reports a rejected old Tensor API key without exposing it", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("invalid x-tensor-api-key access denied", { status: 403 }),
    );

    const result = await checkTensorApiKey(
      { TENSOR_API_KEY: "old-key" },
      fetchMock as typeof fetch,
    );

    expect(result.ok).toBe(false);
    expect(result.configured).toBe(true);
    expect(result.status).toBe(403);
    expect(result.error).toBe("invalid x-tensor-api-key access denied");
    expect(JSON.stringify(result)).not.toContain("old-key");
  });
});
