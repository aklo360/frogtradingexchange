/*
  Dev-only fixtures for the profile page demo mode (`/profile?demo=1`).
  Only reachable when NODE_ENV === "development"; production builds
  compile the demo branch away. Never used in tests or live data paths.
*/

import type { NftHolding, NftHoldingsPage } from "@/lib/nfts";
import type { PrivySolanaWallet } from "@/lib/privy";

export const DEMO_WALLET_ADDRESS =
  "9p9UcNW4QaAcw6pRAMFtaJHuNChL6dFFnbYzARTnJSWY";

const DEMO_LINKED_ADDRESS = "bru5cksNVW9nDYpH1zCLPd1jbAyGXtQ89t54qBqZi7om";

export const demoPrivyWallets: PrivySolanaWallet[] = [
  {
    id: "demo-embedded",
    address: DEMO_WALLET_ADDRESS,
    embedded: true,
    walletIndex: 0,
  },
  {
    id: "demo-linked",
    address: DEMO_LINKED_ADDRESS,
    embedded: false,
    walletIndex: null,
  },
];

export const demoTelegramAccount = {
  userId: "0",
  username: "pondchief",
  firstName: "Pond",
};

const demoNftItems: NftHolding[] = Array.from({ length: 23 }, (_, index) => ({
  mint: `demo-frog-${index + 1}`,
  name: `Solana Business Frog #${1000 + index * 37}`,
  description: null,
  image: index % 5 === 3 ? null : "/sbficon.png",
  collection: "Solana Business Frogs",
  owner: index % 4 === 0 ? DEMO_LINKED_ADDRESS : DEMO_WALLET_ADDRESS,
  compressed: false,
  attributes: [],
}));

export const demoNftPage = (page: number, limit: number): NftHoldingsPage => {
  const start = (page - 1) * limit;
  return {
    walletAddress: DEMO_WALLET_ADDRESS,
    walletAddresses: [DEMO_WALLET_ADDRESS, DEMO_LINKED_ADDRESS],
    items: demoNftItems.slice(start, start + limit),
    page,
    limit,
    total: demoNftItems.length,
  };
};
