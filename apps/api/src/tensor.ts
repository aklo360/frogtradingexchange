import type { Env } from "./env";

const DEFAULT_TENSOR_API_BASE_URL = "https://api.mainnet.tensordev.io/api/v1";
const DEFAULT_TENSOR_COLLECTION_SLUG = "sbf";

export type TensorHealth = {
  ok: boolean;
  configured: boolean;
  endpoint: string;
  status: number | null;
  collectionSlug: string;
  collection: {
    id: string | null;
    slugDisplay: string | null;
    name: string | null;
  } | null;
  error: string | null;
};

type TensorConfig = {
  apiKey: string;
  baseUrl: string;
  collectionSlug: string;
};

type FetchLike = typeof fetch;

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const asRecord = (value: unknown) =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

const readString = (record: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

export const getTensorConfig = (env: Env): TensorConfig => ({
  apiKey: env.TENSOR_API_KEY?.trim() || "",
  baseUrl: trimTrailingSlash(
    env.TENSOR_API_BASE_URL?.trim() || DEFAULT_TENSOR_API_BASE_URL,
  ),
  collectionSlug:
    env.TENSOR_COLLECTION_SLUG?.trim() || DEFAULT_TENSOR_COLLECTION_SLUG,
});

export const buildTensorCollectionsUrl = (config: TensorConfig) => {
  const url = new URL(`${config.baseUrl}/collections`);
  url.searchParams.set("sortBy", "slugDisplay:asc");
  url.searchParams.set("limit", "1");
  url.searchParams.append("slugDisplays", config.collectionSlug);
  return url;
};

const parseCollection = (payload: unknown) => {
  const root = asRecord(payload);
  const candidates = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.collections)
      ? root.collections
      : Array.isArray(root?.data)
        ? root.data
        : Array.isArray(root?.results)
          ? root.results
          : [];
  const first = asRecord(candidates[0]);
  if (!first) return null;

  return {
    id: readString(first, "id", "collId", "uuid"),
    slugDisplay: readString(first, "slugDisplay", "slug"),
    name: readString(first, "name", "nameDisplay", "title"),
  };
};

export async function checkTensorApiKey(
  env: Env,
  fetchImpl: FetchLike = fetch,
): Promise<TensorHealth> {
  const config = getTensorConfig(env);
  const url = buildTensorCollectionsUrl(config);

  if (!config.apiKey) {
    return {
      ok: false,
      configured: false,
      endpoint: url.toString(),
      status: null,
      collectionSlug: config.collectionSlug,
      collection: null,
      error: "TENSOR_API_KEY is not configured",
    };
  }

  try {
    const response = await fetchImpl(url.toString(), {
      headers: {
        Accept: "application/json",
        "x-tensor-api-key": config.apiKey,
      },
    });
    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        configured: true,
        endpoint: url.toString(),
        status: response.status,
        collectionSlug: config.collectionSlug,
        collection: null,
        error: text.slice(0, 240) || `Tensor returned HTTP ${response.status}`,
      };
    }

    return {
      ok: true,
      configured: true,
      endpoint: url.toString(),
      status: response.status,
      collectionSlug: config.collectionSlug,
      collection: parseCollection(payload),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      endpoint: url.toString(),
      status: null,
      collectionSlug: config.collectionSlug,
      collection: null,
      error: error instanceof Error ? error.message : "Tensor request failed",
    };
  }
}
