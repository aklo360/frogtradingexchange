/*
  Dev-only fixtures for the profile page demo mode (`/profile?demo=1`).
  Only reachable when NODE_ENV === "development"; production builds
  compile the demo branch away. Never used in tests or live data paths.
*/

import type { NftHolding, NftHoldingsPage } from "@/lib/nfts";
import type { PrivySolanaWallet } from "@/lib/privy";
import type { AppProfileResponse } from "@/lib/tapestry/types";

export const DEMO_WALLET_ADDRESS =
  "9p9UcNW4QaAcw6pRAMFtaJHuNChL6dFFnbYzARTnJSWY";

const DEMO_LINKED_ADDRESS = "bru5cksNVW9nDYpH1zCLPd1jbAyGXtQ89t54qBqZi7om";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const FROG_MINT = "FRoGmintDeMo1111111111111111111111111111111";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const BONK_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

export const demoPrivyWallets: PrivySolanaWallet[] = [
  { id: "demo-embedded", address: DEMO_WALLET_ADDRESS, embedded: true },
  { id: "demo-linked", address: DEMO_LINKED_ADDRESS, embedded: false },
];

export const demoTelegramAccount = {
  userId: "0",
  username: "pondchief",
  firstName: "Pond",
};

const hoursAgo = (hours: number, now: number) =>
  now - Math.round(hours * 3_600_000);

export const demoProfileResponse = (now: number): AppProfileResponse => ({
  profile: {
    id: "demo-profile",
    namespace: "frogx",
    createdAt: hoursAgo(24 * 212, now),
    username: "pond-chief",
    bio: "Full-time lily pad operator. Swing trading SOL and hoarding business frogs since the great pond crash.",
  },
  socialCounts: { followers: 42, following: 17 },
  walletAddress: DEMO_WALLET_ADDRESS,
  pfpMint: "demo-frog-1",
  pfpImage: "/sbficon.png",
  followers: {
    total: 42,
    profiles: Array.from({ length: 9 }, (_, index) => ({
      id: `demo-follower-${index}`,
      namespace: "frogx",
      created_at: hoursAgo(24 * (index + 3), now),
      username: `frogfren-${index + 1}`,
      image: index % 3 === 0 ? "/sbficon.png" : null,
    })),
  },
  following: {
    total: 17,
    profiles: Array.from({ length: 6 }, (_, index) => ({
      id: `demo-following-${index}`,
      namespace: "frogx",
      created_at: hoursAgo(24 * (index + 5), now),
      username: `pondpal-${index + 1}`,
      image: index % 2 === 0 ? "/sbficon.png" : null,
    })),
  },
  activity: [
    {
      type: "new_follower",
      actor_id: "demo-actor-1",
      actor_username: "frogfren-1",
      timestamp: hoursAgo(2, now),
      activity: "frogfren-1 followed pond-chief",
    },
    {
      type: "like",
      actor_id: "demo-actor-2",
      actor_username: "pondpal-2",
      timestamp: hoursAgo(9, now),
      activity: "pondpal-2 liked your swap call",
    },
    {
      type: "comment",
      actor_id: "demo-actor-3",
      actor_username: "frogfren-4",
      timestamp: hoursAgo(30, now),
      activity: "frogfren-4 commented: ribbit and hold",
    },
    {
      type: "new_follower",
      actor_id: "demo-actor-4",
      actor_username: "pondpal-5",
      timestamp: hoursAgo(52, now),
      activity: "pondpal-5 followed pond-chief",
    },
  ],
  tradeHistory: [
    {
      id: 1,
      transactionSignature: "demo-signature-1",
      walletAddress: DEMO_WALLET_ADDRESS,
      inputMint: SOL_MINT,
      outputMint: FROG_MINT,
      inputAmount: 2.5,
      outputAmount: 184_000,
      inputValueUSD: 412.5,
      outputValueUSD: 409.9,
      timestamp: hoursAgo(1.4, now),
      tradeType: "buy",
      platform: "main",
      createdAt: new Date(hoursAgo(1.4, now)).toISOString(),
      updatedAt: new Date(hoursAgo(1.4, now)).toISOString(),
    },
    {
      id: 2,
      transactionSignature: "demo-signature-2",
      walletAddress: DEMO_WALLET_ADDRESS,
      inputMint: BONK_MINT,
      outputMint: SOL_MINT,
      inputAmount: 12_400_000,
      outputAmount: 1.62,
      inputValueUSD: 268.4,
      outputValueUSD: 267.2,
      timestamp: hoursAgo(7, now),
      tradeType: "sell",
      platform: "main",
      createdAt: new Date(hoursAgo(7, now)).toISOString(),
      updatedAt: new Date(hoursAgo(7, now)).toISOString(),
    },
    {
      id: 3,
      transactionSignature: "demo-signature-3",
      walletAddress: DEMO_WALLET_ADDRESS,
      inputMint: USDC_MINT,
      outputMint: SOL_MINT,
      inputAmount: 500,
      outputAmount: 3.02,
      inputValueUSD: 500,
      outputValueUSD: 498.1,
      timestamp: hoursAgo(26, now),
      tradeType: "swap",
      platform: "main",
      createdAt: new Date(hoursAgo(26, now)).toISOString(),
      updatedAt: new Date(hoursAgo(26, now)).toISOString(),
    },
    {
      id: 4,
      transactionSignature: "demo-signature-4",
      walletAddress: DEMO_WALLET_ADDRESS,
      inputMint: SOL_MINT,
      outputMint: BONK_MINT,
      inputAmount: 0.8,
      outputAmount: 6_120_000,
      inputValueUSD: 131.8,
      outputValueUSD: 130.9,
      timestamp: hoursAgo(49, now),
      tradeType: "buy",
      platform: "main",
      createdAt: new Date(hoursAgo(49, now)).toISOString(),
      updatedAt: new Date(hoursAgo(49, now)).toISOString(),
    },
    {
      id: 5,
      transactionSignature: "demo-signature-5",
      walletAddress: DEMO_WALLET_ADDRESS,
      inputMint: FROG_MINT,
      outputMint: SOL_MINT,
      inputAmount: 60_000,
      outputAmount: 0.71,
      timestamp: hoursAgo(30 * 24, now),
      tradeType: "sell",
      platform: "main",
      createdAt: new Date(hoursAgo(30 * 24, now)).toISOString(),
      updatedAt: new Date(hoursAgo(30 * 24, now)).toISOString(),
    },
  ],
  tokenSummary: [
    {
      mint: SOL_MINT,
      netAmount: 18.4,
      netUsd: 3_034.2,
      lastActivity: hoursAgo(1.4, now),
      direction: "positive",
      symbol: "SOL",
      name: "Solana",
    },
    {
      mint: FROG_MINT,
      netAmount: 1_240_000,
      netUsd: 812.6,
      lastActivity: hoursAgo(1.4, now),
      direction: "positive",
      symbol: "FROG",
      name: "Frog Coin",
    },
    {
      mint: BONK_MINT,
      netAmount: -6_280_000,
      netUsd: -137.5,
      lastActivity: hoursAgo(7, now),
      direction: "negative",
      symbol: "BONK",
      name: "Bonk",
    },
    {
      mint: USDC_MINT,
      netAmount: -500,
      netUsd: -500,
      lastActivity: hoursAgo(26, now),
      direction: "neutral",
      symbol: "USDC",
      name: "USD Coin",
    },
  ],
});

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
