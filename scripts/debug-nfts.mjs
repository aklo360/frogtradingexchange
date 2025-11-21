#!/usr/bin/env node

/**
 * Quick CLI helper to debug NFT lookups via Helius DAS searchAssets.
 *
 * Usage:
 *   SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=..." \
 *   node scripts/debug-nfts.mjs <ownerAddress> [collectionAddress]
 *
 * The script prints the total number of matches and the first few entries so
 * you can verify that the RPC returns data for the wallet/collection pair.
 */

const endpoint =
  process.env.SOLANA_RPC_URL ?? process.env.NEXT_PUBLIC_SOLANA_RPC_URL;

if (!endpoint) {
  console.error(
    "Missing SOLANA_RPC_URL (or NEXT_PUBLIC_SOLANA_RPC_URL) env var. Set it to your Helius DAS RPC before running this script.",
  );
  process.exit(1);
}

const [, , ownerArg, collectionArg] = process.argv;

const ownerAddress =
  ownerArg ??
  process.env.NFT_OWNER ??
  "AKLo8A86RvBbuSvz3LzJFMWNLf7d4KYtqwQrw2nYt5k9";

const collectionAddress =
  collectionArg ?? process.env.NFT_COLLECTION ?? undefined;

if (!ownerAddress) {
  console.error("Provide a wallet address as the first argument.");
  process.exit(1);
}

const body = {
  jsonrpc: "2.0",
  id: "debug-nfts",
  method: "searchAssets",
  params: {
    ownerAddress,
    tokenType: "nonFungible",
    grouping: collectionAddress ? ["collection", collectionAddress] : undefined,
    page: Number(process.env.NFT_PAGE ?? 1),
    limit: Number(process.env.NFT_LIMIT ?? 10),
    displayOptions: {
      showCollectionMetadata: true,
      showUnverifiedCollections: true,
    },
  },
};

console.log("RPC endpoint:", endpoint);
console.log("Owner address:", ownerAddress);
if (collectionAddress) {
  console.log("Collection filter:", collectionAddress);
}

try {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.error("HTTP status:", response.status);
    console.error(await response.text());
    process.exit(1);
  }

  const data = await response.json();

  if (data.error) {
    console.error("RPC error:", data.error);
    process.exit(1);
  }

  const total = data.result?.total ?? 0;
  const items = data.result?.items ?? [];

  console.log(`Total items reported: ${total}`);
  console.log(`Returned in this page: ${items.length}`);
  console.log("Sample entries:");
  items.forEach((item, index) => {
    const image =
      item.content?.links?.image ??
      item.content?.files?.[0]?.uri ??
      item.content?.json_uri ??
      "no image in payload";

    console.log(
      `#${index + 1} ${item.id} | interface=${item.interface} | compressed=${
        item.compression?.compressed ?? false
      }`,
    );
    console.log(`    image/link: ${image}`);
  });
} catch (error) {
  console.error("Failed to fetch NFTs:", error);
  process.exit(1);
}
