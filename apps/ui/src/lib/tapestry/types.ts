export type TapestryProfile = {
  id: string;
  namespace: string;
  created_at: number;
  username: string;
  bio?: string | null;
  image?: string | null;
};

export type AppProfile = {
  id: string;
  namespace: string;
  createdAt: number;
  username: string;
  bio?: string | null;
  image?: string | null;
};

export type TapestryWallet = {
  id: string;
  created_at: number;
  blockchain: "SOLANA" | "ETHEREUM";
  wallet_type?: "PHANTOM" | "WEB3AUTH" | null;
};

export type WalletSocialCounts = {
  followers: number;
  following: number;
  globalFollowers: number;
  globalFollowing: number;
};

export type TapestryNamespaceMetadata = {
  name: string | null;
  readableName: string | null;
  faviconURL: string | null;
  userProfileURL: string | null;
  externalProfileURL: string | null;
};

export type TapestryContact =
  | {
      id: string;
      type: "EMAIL" | "PHONE" | "TWITTER" | "FARCASTER";
      bio?: string;
      image?: string;
    }
  | undefined;

export type TapestrySocialCounts = {
  followers: number;
  following: number;
};

export type TapestryIdentityProfile = {
  profile: TapestryProfile;
  wallet?: {
    address: string;
  };
  namespace?: TapestryNamespaceMetadata;
  contact?: TapestryContact;
  socialCounts: TapestrySocialCounts;
};

export type TapestryProfileDetails = {
  profile: TapestryProfile;
  walletAddress?: string;
  hashedPhoneNumber?: string;
  contact?: TapestryContact;
  socialCounts: TapestrySocialCounts;
  namespace?: TapestryNamespaceMetadata;
};

export type SocialProfileSummary = {
  id: string;
  namespace: string;
  created_at: number;
  username: string;
  bio?: string | null;
  image?: string | null;
  wallet?: TapestryWallet | null;
};

export type ActivityFeedItem = {
  type: "following" | "new_content" | "like" | "comment" | "new_follower";
  actor_id: string;
  actor_username: string;
  target_id?: string | null;
  target_username?: string | null;
  comment_id?: string | null;
  timestamp: number;
  activity: string;
};

export type SwapActivityItem = {
  type: string;
  source: string;
  description: string;
  fee: number;
  timestamp: string;
  signature: string;
  success: boolean;
  walletAddress: string;
  username: string;
  from: {
    amount: number;
    token: string;
  };
  to: {
    amount: number;
    token: string;
  };
  profile?: {
    username: string;
    id: string;
  };
  accountsInvolved: string[];
  involvedProfiles?: Array<{
    address: string;
    profile: {
      username: string;
      id: string;
    };
  }>;
};

export type TradeHistoryEntry = {
  id: number;
  transactionSignature: string;
  walletAddress: string;
  profileId?: string;
  inputMint: string;
  outputMint: string;
  inputAmount: number;
  outputAmount: number;
  inputValueSOL?: number;
  outputValueSOL?: number;
  inputValueUSD?: number;
  outputValueUSD?: number;
  solPrice?: number;
  timestamp: number;
  source?: string;
  slippage?: number;
  priorityFee?: number;
  tradeType: "buy" | "sell" | "swap";
  platform: "trenches" | "main";
  sourceWallet?: string;
  sourceTransactionId?: string;
  createdAt: string;
  updatedAt: string;
};

export type TokenHoldingSummary = {
  mint: string;
  netAmount: number;
  netUsd: number;
  lastActivity: number;
  direction: "positive" | "negative" | "neutral";
  symbol?: string;
  name?: string;
  logoURI?: string;
};

export type ProfileContentItem = {
  id: string;
  created_at: number;
  namespace: string;
  externalLinkURL?: string;
  likeCount: number;
  commentCount: number;
  hasLiked?: boolean;
};

export type NFTAsset = {
  id: string;
  name: string;
  image: string | null;
  description?: string | null;
  collection?: string | null;
  owner?: string | null;
  attributes?: Array<{ trait_type?: string; value?: string | number }>;
};

export type AppProfileResponse = {
  profile: AppProfile;
  socialCounts: TapestrySocialCounts;
  walletAddress?: string;
  namespace?: TapestryNamespaceMetadata;
  contact?: TapestryContact;
  hashedPhoneNumber?: string;
  identities?: TapestryIdentityProfile[];
  operation?: "CREATED" | "FOUND";
  wallets?: TapestryWallet[];
  walletSocialCounts?: WalletSocialCounts;
  followers?: {
    profiles: SocialProfileSummary[];
    total: number;
  };
  following?: {
    profiles: SocialProfileSummary[];
    total: number;
  };
  activity?: ActivityFeedItem[];
  swapActivity?: SwapActivityItem[];
  tradeHistory?: TradeHistoryEntry[];
  tokenSummary?: TokenHoldingSummary[];
  contents?: {
    items: ProfileContentItem[];
    total: number;
  };
  nfts?: {
    items: NFTAsset[];
    page: number;
    limit: number;
    total: number;
  };
};
