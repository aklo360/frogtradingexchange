import type { Env } from "./env";

const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_PAGE_SIZE = 50;
const MAX_WALLET_COUNT = 10;

export const BUSINESS_FROG_COLLECTION =
  "J7rxtKmEpNJEtrfkagiTF1gsmLyVus6BQZFY4ouBkeMG";

type DasAsset = {
  id?: string;
  burnt?: boolean;
  ownership?: { owner?: string };
  compression?: { compressed?: boolean };
  grouping?: Array<{ group_key?: string; group_value?: string }>;
  content?: {
    metadata?: {
      name?: string;
      description?: string;
      attributes?: Array<{ trait_type?: string; value?: string | number }>;
    };
    links?: { image?: string };
    files?: Array<{ uri?: string; mime?: string }>;
  };
};

type DasResponse = {
  result?: {
    items?: DasAsset[];
    page?: number;
    limit?: number;
    total?: number;
  };
  error?: { message?: string };
};

export type NftHolding = {
  mint: string;
  name: string;
  description: string | null;
  image: string | null;
  collection: string | null;
  owner: string;
  compressed: boolean;
  attributes: Array<{ traitType: string; value: string | number }>;
};

export type NftHoldingsPage = {
  walletAddress: string;
  walletAddresses: string[];
  items: NftHolding[];
  page: number;
  limit: number;
  total: number;
};

const normalizeUri = (value?: string | null) => {
  if (!value) return null;
  if (value.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${value.slice("ipfs://".length)}`;
  }
  return value.startsWith("https://") || value.startsWith("http://")
    ? value
    : null;
};

const assetImage = (asset: DasAsset) => {
  const linked = normalizeUri(asset.content?.links?.image);
  if (linked) return linked;

  for (const file of asset.content?.files ?? []) {
    if (file.mime && !file.mime.startsWith("image/")) continue;
    const uri = normalizeUri(file.uri);
    if (uri) return uri;
  }
  return null;
};

const assetCollection = (asset: DasAsset) =>
  asset.grouping?.find((entry) => entry.group_key === "collection")
    ?.group_value ?? null;

const boundedInteger = (
  value: string | number | null | undefined,
  fallback: number,
  min: number,
  max: number,
) => {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

export async function fetchWalletNftHoldings(
  env: Env,
  input: {
    walletAddress: string;
    page?: number;
    limit?: number;
    collectionAddress?: string | null;
  },
): Promise<NftHoldingsPage> {
  const rpcUrl = env.SOLANA_RPC_URL?.trim();
  if (!rpcUrl) throw new Error("SOLANA_RPC_URL is not configured");

  const page = boundedInteger(input.page, 1, 1, 10_000);
  const limit = boundedInteger(input.limit, 24, 1, MAX_PAGE_SIZE);
  const collectionAddress = input.collectionAddress?.trim() || null;

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `frogx-nfts-${page}`,
      method: "searchAssets",
      params: {
        ownerAddress: input.walletAddress,
        tokenType: "nonFungible",
        grouping: collectionAddress
          ? ["collection", collectionAddress]
          : undefined,
        page,
        limit,
        displayOptions: {
          showCollectionMetadata: true,
          showUnverifiedCollections: true,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Solana RPC request failed (${response.status})`);
  }

  const data = (await response.json()) as DasResponse;
  if (data.error) {
    throw new Error(data.error.message ?? "Solana RPC returned an error");
  }

  const result = data.result;
  const items = (result?.items ?? [])
    .filter((asset) => {
      if (!asset.id || asset.burnt === true) return false;
      if (
        asset.ownership?.owner?.toLowerCase() !==
        input.walletAddress.toLowerCase()
      ) {
        return false;
      }
      return (
        !collectionAddress ||
        assetCollection(asset)?.toLowerCase() ===
          collectionAddress.toLowerCase()
      );
    })
    .map((asset): NftHolding => ({
      mint: asset.id as string,
      name: asset.content?.metadata?.name?.trim() || "Untitled NFT",
      description: asset.content?.metadata?.description?.trim() || null,
      image: assetImage(asset),
      collection: assetCollection(asset),
      owner: input.walletAddress,
      compressed: asset.compression?.compressed === true,
      attributes: (asset.content?.metadata?.attributes ?? [])
        .filter(
          (attribute) =>
            typeof attribute.trait_type === "string" &&
            (typeof attribute.value === "string" ||
              typeof attribute.value === "number"),
        )
        .map((attribute) => ({
          traitType: attribute.trait_type as string,
          value: attribute.value as string | number,
        })),
    }));

  return {
    walletAddress: input.walletAddress,
    walletAddresses: [input.walletAddress],
    items,
    page: result?.page ?? page,
    limit: result?.limit ?? limit,
    total: result?.total ?? items.length,
  };
}

export async function fetchWalletsNftHoldings(
  env: Env,
  input: {
    walletAddresses: string[];
    page?: number;
    limit?: number;
  },
): Promise<NftHoldingsPage> {
  const walletAddresses = [...new Set(input.walletAddresses)].slice(
    0,
    MAX_WALLET_COUNT,
  );
  const page = boundedInteger(input.page, 1, 1, 10_000);
  const limit = boundedInteger(input.limit, 24, 1, MAX_PAGE_SIZE);
  const pages = await Promise.all(
    walletAddresses.map((walletAddress) =>
      fetchWalletNftHoldings(env, {
        walletAddress,
        page: 1,
        limit: MAX_PAGE_SIZE,
        collectionAddress: BUSINESS_FROG_COLLECTION,
      }),
    ),
  );
  const uniqueItems = new Map<string, NftHolding>();
  for (const walletPage of pages) {
    for (const item of walletPage.items) uniqueItems.set(item.mint, item);
  }
  const allItems = [...uniqueItems.values()];
  const start = (page - 1) * limit;

  return {
    walletAddress: walletAddresses[0] ?? "",
    walletAddresses,
    items: allItems.slice(start, start + limit),
    page,
    limit,
    total: allItems.length,
  };
}

export async function getNftHoldings(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const walletAddresses = [
    ...new Set(
      url.searchParams
        .getAll("walletAddress")
        .map((walletAddress) => walletAddress.trim())
        .filter(Boolean),
    ),
  ];
  if (
    walletAddresses.length === 0 ||
    walletAddresses.length > MAX_WALLET_COUNT ||
    walletAddresses.some(
      (walletAddress) => !SOLANA_ADDRESS_PATTERN.test(walletAddress),
    )
  ) {
    return Response.json(
      {
        error: `Provide between 1 and ${MAX_WALLET_COUNT} valid Solana walletAddress values`,
      },
      { status: 400 },
    );
  }

  try {
    const result = await fetchWalletsNftHoldings(env, {
      walletAddresses,
      page: boundedInteger(url.searchParams.get("page"), 1, 1, 10_000),
      limit: boundedInteger(
        url.searchParams.get("limit"),
        24,
        1,
        MAX_PAGE_SIZE,
      ),
    });
    return Response.json(result, {
      headers: { "Cache-Control": "public, max-age=20" },
    });
  } catch (error) {
    console.error("[nft-holdings] DAS lookup failed", error);
    const notConfigured =
      error instanceof Error && error.message.includes("not configured");
    return Response.json(
      { error: "NFT holdings are temporarily unavailable" },
      { status: notConfigured ? 503 : 502 },
    );
  }
}
