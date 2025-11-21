import type { NFTAsset } from "@/lib/tapestry/types";
import { solanaRpcConfig } from "@/server/env";

type DasFile = {
  uri?: string;
  mime?: string;
};

type DasAsset = {
  id: string;
  interface?: string;
  ownership?: {
    owner?: string;
  };
  content?: {
    metadata?: {
      name?: string;
      description?: string;
      attributes?: Array<{ trait_type?: string; value?: string | number }>;
      links?: {
        image?: string;
      };
    };
    files?: DasFile[];
    json_uri?: string;
    links?: {
      image?: string;
    };
  };
  compression?: {
    compressed?: boolean;
  };
  grouping?: Array<{
    group_key: string;
    group_value: string;
  }>;
};

type DasResponse = {
  result: {
    items: DasAsset[];
    page: number;
    limit: number;
    total: number;
  };
};

const { endpoint } = solanaRpcConfig;

const normalizeUri = (uri?: string | null): string | null => {
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) {
    const path = uri.replace("ipfs://", "");
    return `https://ipfs.io/ipfs/${path}`;
  }
  if (uri.startsWith("https://") || uri.startsWith("http://")) {
    return uri;
  }
  return null;
};

const pickImage = (asset: DasAsset): string | null => {
  const linksImage =
    asset.content?.links?.image ??
    asset.content?.metadata?.links?.image ??
    null;
  const normalizedLink = normalizeUri(linksImage);
  if (normalizedLink) return normalizedLink;

  const files = asset.content?.files ?? [];
  for (const file of files) {
    if (!file.uri) continue;
    if (file.mime && file.mime.startsWith("image/")) {
      const normalized = normalizeUri(file.uri);
      if (normalized) return normalized;
    }
  }

  if (asset.content?.json_uri) {
    const normalized = normalizeUri(asset.content.json_uri);
    if (normalized) return normalized;
  }

  return null;
};

const fetchImageFromMetadata = async (
  asset: DasAsset,
): Promise<string | null> => {
  const jsonUri = normalizeUri(asset.content?.json_uri);
  if (!jsonUri) return null;

  try {
    const response = await fetch(jsonUri, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const metadata = (await response.json()) as {
      image?: string;
    };
    return normalizeUri(metadata.image ?? null);
  } catch {
    return null;
  }
};

const getCollectionFromGrouping = (
  asset: DasAsset,
): string | null => {
  const group = asset.grouping?.find(
    (entry) => entry.group_key === "collection",
  );
  return group?.group_value ?? null;
};

export async function getWalletNfts(options: {
  ownerAddress: string;
  page?: number;
  limit?: number;
  collectionAddress?: string | null;
  includeCompressed?: boolean;
}): Promise<{
  items: NFTAsset[];
  page: number;
  limit: number;
  total: number;
}> {
  const {
    ownerAddress,
    collectionAddress,
    includeCompressed = false,
  } = options;
  if (!ownerAddress || !endpoint) {
    return {
      items: [],
      page: options.page ?? 1,
      limit: options.limit ?? 12,
      total: 0,
    };
  }

  const page = options.page && options.page > 0 ? options.page : 1;
  const limit =
    options.limit && options.limit > 0 && options.limit <= 100
      ? options.limit
      : 12;

  const body = {
    jsonrpc: "2.0",
    id: "frog-profile-nfts",
    method: "searchAssets",
    params: {
      ownerAddress,
      tokenType: "nonFungible",
      grouping:
        collectionAddress && collectionAddress.length > 0
          ? ["collection", collectionAddress]
          : undefined,
      page,
      limit,
      displayOptions: {
        showCollectionMetadata: true,
        showUnverifiedCollections: true,
      },
    },
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Solana RPC request failed (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as DasResponse;
  const result = data.result ?? {
    items: [],
    page,
    limit,
    total: 0,
  };

  const filtered = result.items.filter((item) => {
    const isCompressed = item.compression?.compressed === true;
    if (!includeCompressed && isCompressed) {
      return false;
    }

    if (collectionAddress) {
      const grouping = getCollectionFromGrouping(item);
      if (!grouping) {
        return false;
      }
      if (grouping.toLowerCase() !== collectionAddress.toLowerCase()) {
        return false;
      }
    }

    return true;
  });

  const items: NFTAsset[] = [];

  for (const item of filtered) {
    const metadata = item.content?.metadata;
    let image = pickImage(item);
    if (!image) {
      image = await fetchImageFromMetadata(item);
    }

    if (!image) {
      // If metadata JSON also lacks image, still keep it but mark as null.
      // Continue to include this item so UI can display a placeholder.
    }

    items.push({
      id: item.id,
      name: metadata?.name ?? "Untitled NFT",
      description: metadata?.description ?? null,
      image: image ?? null,
      collection:
        getCollectionFromGrouping(item) ?? collectionAddress ?? null,
      owner: item.ownership?.owner ?? null,
      attributes: metadata?.attributes,
    });
  }

  return {
    items,
    page: result.page ?? page,
    limit: result.limit ?? limit,
    total: result.total ?? items.length,
  };
}
