import type { TradeHistoryEntry } from "@/lib/tapestry/types";

export const PROFILE_NFT_PAGE_SIZE = 8;

export type ProfileMilestone = {
  id: "hotshot" | "samurai" | "trailblazer";
  label: string;
  icon: string;
  earned: boolean;
  progress: string;
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

export const shortMint = (mint: string) =>
  mint.length > 10 ? `${mint.slice(0, 4)}...${mint.slice(-4)}` : mint;

export type TradeTone = "buy" | "sell" | "swap";

export const tradeChip = (
  trade: Pick<TradeHistoryEntry, "tradeType">,
): { label: string; tone: TradeTone } => {
  if (trade.tradeType === "buy") return { label: "BUY", tone: "buy" };
  if (trade.tradeType === "sell") return { label: "SELL", tone: "sell" };
  return { label: "SWAP", tone: "swap" };
};

export const formatTokenAmount = (value: number) => {
  if (!Number.isFinite(value)) return "0";
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000_000)
    return `${(value / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "")}B`;
  if (magnitude >= 1_000_000)
    return `${(value / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (magnitude >= 10_000)
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  if (magnitude >= 1) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  if (magnitude === 0) return "0";
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
};

export const formatUsd = (value: number) => {
  if (!Number.isFinite(value)) return null;
  const magnitude = Math.abs(value);
  if (magnitude > 0 && magnitude < 0.01) return "<$0.01";
  return `${value < 0 ? "-" : ""}$${magnitude.toLocaleString("en-US", {
    minimumFractionDigits: magnitude < 1000 ? 2 : 0,
    maximumFractionDigits: magnitude < 1000 ? 2 : 0,
  })}`;
};

export const timeAgo = (timestamp: number, now = Date.now()) => {
  const elapsed = now - timestamp;
  if (!Number.isFinite(elapsed) || elapsed < 0) return "just now";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
};

export const activityLabel = (type: string) => {
  switch (type) {
    case "new_follower":
      return "New follower";
    case "following":
      return "Followed";
    case "like":
      return "Like";
    case "comment":
      return "Comment";
    case "new_content":
      return "Post";
    default:
      return "Activity";
  }
};
