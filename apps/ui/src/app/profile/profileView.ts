import type { AppProfileResponse, TradeHistoryEntry } from "@/lib/tapestry/types";

export const PROFILE_NFT_PAGE_SIZE = 8;

export type ProfileMilestone = {
  id: "hotshot" | "samurai" | "trailblazer";
  label: string;
  icon: string;
  earned: boolean;
  progress: string;
};

export type ProfileTimelineItem = {
  id: string;
  label: string;
  detail: string;
  timestamp: number;
  successful: boolean;
};

export const deriveDefaultUsername = (address: string) =>
  `frog-${address.slice(0, 4)}${address.slice(-2)}`.toLowerCase();

export const formatShortAddress = (address: string) =>
  address.length > 10
    ? `${address.slice(0, 4)}...${address.slice(-4)}`
    : address;

export const normalizeEpochMilliseconds = (value: number) =>
  value > 0 && value < 10_000_000_000 ? value * 1000 : value;

export const buildProfileMilestones = (input: {
  frogCount: number;
  followerCount: number;
  recentTradeCount: number;
}): ProfileMilestone[] => [
  {
    id: "hotshot",
    label: "Hotshot",
    icon: "/badge-hotshot.svg",
    earned: input.recentTradeCount >= 1,
    progress: `${Math.min(input.recentTradeCount, 1)}/1 recent trade`,
  },
  {
    id: "samurai",
    label: "Samurai",
    icon: "/badge-samurai.svg",
    earned: input.frogCount >= 5,
    progress: `${Math.min(input.frogCount, 5)}/5 frogs held`,
  },
  {
    id: "trailblazer",
    label: "Trailblazer",
    icon: "/badge-trailblazer.svg",
    earned: input.followerCount >= 10,
    progress: `${Math.min(input.followerCount, 10)}/10 followers`,
  },
];

const tokenLabel = (mint: string) =>
  mint.length > 10 ? `${mint.slice(0, 4)}...${mint.slice(-4)}` : mint;

const tradeLabel = (trade: TradeHistoryEntry) => {
  if (trade.tradeType === "buy") return "Bought";
  if (trade.tradeType === "sell") return "Sold";
  return "Swapped";
};

export const buildProfileTimeline = (
  profile: AppProfileResponse,
): ProfileTimelineItem[] => {
  const trades = (profile.tradeHistory ?? []).map((trade) => ({
    id: `trade-${trade.transactionSignature}`,
    label: tradeLabel(trade),
    detail: `${tokenLabel(trade.inputMint)} to ${tokenLabel(trade.outputMint)}`,
    timestamp: normalizeEpochMilliseconds(trade.timestamp),
    successful: true,
  }));

  const social = (profile.activity ?? []).map((activity, index) => ({
    id: `social-${activity.type}-${activity.timestamp}-${index}`,
    label: activity.type === "new_follower" ? "New follower" : "Social activity",
    detail: activity.activity,
    timestamp: normalizeEpochMilliseconds(activity.timestamp),
    successful: true,
  }));

  return [...trades, ...social]
    .filter((item) => Number.isFinite(item.timestamp) && item.timestamp > 0)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 6);
};
