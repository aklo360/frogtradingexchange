import type {
  ActivityFeedItem,
  ProfileContentItem,
  SocialProfileSummary,
  SwapActivityItem,
  TapestryIdentityProfile,
  TapestryProfileDetails,
  TapestryWallet,
  TradeHistoryEntry,
  WalletSocialCounts,
} from "@/lib/tapestry/types";
import { tapestryConfig } from "@/server/env";

const { apiKey, baseUrl, namespace } = tapestryConfig;

type HttpMethod = "GET" | "POST";

type RequestOptions = {
  method?: HttpMethod;
  searchParams?: Record<string, string | number | undefined | null>;
  body?: unknown;
};

export class TapestryAPIError extends Error {
  status: number;
  path: string;
  responseBody: string;

  constructor(status: number, path: string, responseBody: string) {
    super(`Tapestry request to ${path} failed with status ${status}`);
    this.status = status;
    this.path = path;
    this.responseBody = responseBody;
  }
}

async function tapestryFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", searchParams, body } = options;
  const normalizedBase = baseUrl.endsWith("/")
    ? baseUrl
    : `${baseUrl}/`;
  const relativePath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(relativePath, normalizedBase);

  url.searchParams.set("apiKey", apiKey);

  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      url.searchParams.set(key, String(value));
    });
  }

  const response = await fetch(url.toString(), {
    method,
    headers:
      method === "POST"
        ? {
            "Content-Type": "application/json",
          }
        : undefined,
    body: method === "POST" ? JSON.stringify(body) : undefined,
    // Avoid caching responses across users
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new TapestryAPIError(response.status, url.pathname, errorText);
  }

  return (await response.json()) as T;
}

export async function getProfilesForIdentity(
  identity: string,
): Promise<TapestryIdentityProfile[]> {
  if (!identity) return [];

  try {
    const data = await tapestryFetch<{
      profiles: TapestryIdentityProfile[];
    }>(`/identities/${identity}/profiles`);

    return data.profiles;
  } catch (error) {
    if (error instanceof TapestryAPIError && error.status === 404) {
      return [];
    }
    throw error;
  }
}

export async function getProfileDetails(
  profileId: string,
): Promise<TapestryProfileDetails> {
  return tapestryFetch<TapestryProfileDetails>(`/profiles/${profileId}`);
}

export async function getProfilesByWalletAddress(
  walletAddress: string,
): Promise<TapestryIdentityProfile[]> {
  if (!walletAddress) return [];

  const data = await tapestryFetch<{
    profiles: TapestryIdentityProfile[];
  }>("/profiles", {
    searchParams: {
      walletAddress,
      pageSize: 50,
    },
  });

  return data.profiles;
}

export type FindOrCreateProfileInput = {
  username: string;
  walletAddress?: string;
  bio?: string | null;
  image?: string | null;
  profileId?: string;
  referredById?: string;
};

export type FindOrCreateProfileResult = {
  operation: "CREATED" | "FOUND";
  profile: TapestryProfileDetails["profile"];
  walletAddress?: string;
};

export async function findOrCreateProfile(
  input: FindOrCreateProfileInput,
): Promise<FindOrCreateProfileResult> {
  const payload: Record<string, unknown> = {};

  payload.username = input.username;

  if (input.profileId) {
    payload.id = input.profileId;
  }

  if (input.walletAddress) {
    payload.walletAddress = input.walletAddress;
    payload.blockchain = "SOLANA";
  }

  if (input.bio && input.bio.trim().length > 0) {
    payload.bio = input.bio;
  }

  if (input.image && input.image.trim().length > 0) {
    payload.image = input.image;
  }

  if (input.referredById) {
    payload.referredById = input.referredById;
  }

  if (namespace) {
    // Using namespace as a custom property helps when debugging in the dashboard.
    payload.properties = [
      {
        key: "namespace",
        value: namespace,
      },
    ];
  }

  const data = await tapestryFetch<{
    profile: FindOrCreateProfileResult["profile"];
    operation: FindOrCreateProfileResult["operation"];
    walletAddress?: string;
  }>("/profiles/findOrCreate", {
    method: "POST",
    body: payload,
  });

  return data;
}

export function pickAppProfile(
  identities: TapestryIdentityProfile[],
): TapestryIdentityProfile | undefined {
  if (!identities.length) return undefined;

  if (!namespace) {
    return identities[0];
  }

  return (
    identities.find(
      (entry) =>
        entry.profile.namespace === namespace ||
        entry.namespace?.name === namespace,
    ) ?? identities[0]
  );
}

type FollowersApiResponse = {
  profiles: Array<
    SocialProfileSummary & {
      wallet?: TapestryWallet | null;
    }
  >;
  page: number;
  pageSize: number;
  totalCount: number;
};

export async function getProfileFollowers(
  profileId: string,
  options: { pageSize?: number } = {},
): Promise<FollowersApiResponse> {
  const { pageSize = 10 } = options;

  try {
    return await tapestryFetch<FollowersApiResponse>(
      `/profiles/${profileId}/followers`,
      {
        searchParams: {
          page: 1,
          pageSize,
        },
      },
    );
  } catch (error) {
    if (error instanceof TapestryAPIError && error.status === 404) {
      return { profiles: [], page: 1, pageSize, totalCount: 0 };
    }
    throw error;
  }
}

export async function getProfileFollowing(
  profileId: string,
  options: { pageSize?: number } = {},
): Promise<FollowersApiResponse> {
  const { pageSize = 10 } = options;

  try {
    return await tapestryFetch<FollowersApiResponse>(
      `/profiles/${profileId}/following`,
      {
        searchParams: {
          page: 1,
          pageSize,
        },
      },
    );
  } catch (error) {
    if (error instanceof TapestryAPIError && error.status === 404) {
      return { profiles: [], page: 1, pageSize, totalCount: 0 };
    }
    throw error;
  }
}

export async function getProfileWallets(
  profileId: string,
): Promise<TapestryWallet[]> {
  try {
    return await tapestryFetch<TapestryWallet[]>(`/profiles/${profileId}/wallets`);
  } catch (error) {
    if (error instanceof TapestryAPIError && error.status === 404) {
      return [];
    }
    throw error;
  }
}

export async function getWalletSocialCounts(
  walletAddress: string,
): Promise<WalletSocialCounts | null> {
  if (!walletAddress) return null;

  try {
    return await tapestryFetch<WalletSocialCounts>(
      `/wallets/${walletAddress}/socialCounts`,
    );
  } catch (error) {
    if (error instanceof TapestryAPIError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

type ActivityFeedResponse = {
  activities: ActivityFeedItem[];
  page: number;
  pageSize: number;
};

export async function getActivityFeed(
  username: string,
  options: { pageSize?: number } = {},
): Promise<ActivityFeedItem[]> {
  if (!username) return [];
  const { pageSize = 20 } = options;

  try {
    const data = await tapestryFetch<ActivityFeedResponse>("/activity/feed", {
      searchParams: {
        username,
        pageSize,
        page: 1,
      },
    });
    return data.activities;
  } catch (error) {
    if (error instanceof TapestryAPIError && error.status === 404) {
      return [];
    }
    throw error;
  }
}

type SwapActivityResponse = {
  transactions: SwapActivityItem[];
  page: number;
  pageSize: number;
};

export async function getSwapActivity(
  username: string,
  options: { pageSize?: number } = {},
): Promise<SwapActivityItem[]> {
  if (!username) return [];
  const { pageSize = 10 } = options;

  try {
    const data = await tapestryFetch<SwapActivityResponse>("/activity/swap", {
      searchParams: {
        username,
        pageSize,
        page: 1,
      },
    });
    return data.transactions;
  } catch (error) {
    if (error instanceof TapestryAPIError && error.status === 404) {
      return [];
    }
    throw error;
  }
}

type TradeHistoryResponse = {
  data: TradeHistoryEntry[];
  meta: {
    total: number;
    hasMore: boolean;
    oldestTimestamp?: number;
    newestTimestamp?: number;
  };
};

export async function getTradeHistory(
  walletAddress: string,
  options: { limit?: number } = {},
): Promise<TradeHistoryEntry[]> {
  if (!walletAddress) return [];
  const { limit = 50 } = options;

  try {
    const data = await tapestryFetch<TradeHistoryResponse>(
      "/trades/fetch-transaction-history",
      {
        searchParams: {
          walletAddress,
          limit,
          sortOrder: "desc",
        },
      },
    );
    return data.data;
  } catch (error) {
    if (error instanceof TapestryAPIError && error.status === 404) {
      return [];
    }
    throw error;
  }
}

type ContentResponse = {
  contents: Array<{
    content: {
      id: string;
      created_at: number;
      namespace: string;
      externalLinkURL?: string;
    } | null;
    socialCounts: {
      likeCount: number;
      commentCount: number;
    };
    requestingProfileSocialInfo?: {
      hasLiked?: boolean;
    };
  }>;
  totalCount: number;
};

export async function getProfileContents(
  profileId: string,
  options: { pageSize?: number } = {},
): Promise<{
  items: ProfileContentItem[];
  total: number;
}> {
  if (!profileId) return { items: [], total: 0 };
  const { pageSize = 10 } = options;

  try {
    const data = await tapestryFetch<ContentResponse>("/contents/", {
      searchParams: {
        profileId,
        pageSize,
        page: 1,
        orderByField: "created_at",
        orderByDirection: "DESC",
      },
    });

    const items: ProfileContentItem[] = data.contents
      .filter((entry) => entry.content !== null)
      .map((entry) => ({
        id: entry.content!.id,
        created_at: entry.content!.created_at,
        namespace: entry.content!.namespace,
        externalLinkURL: entry.content!.externalLinkURL,
        likeCount: entry.socialCounts.likeCount,
        commentCount: entry.socialCounts.commentCount,
        hasLiked: entry.requestingProfileSocialInfo?.hasLiked,
      }));

    return {
      items,
      total: data.totalCount,
    };
  } catch (error) {
    if (error instanceof TapestryAPIError && error.status === 404) {
      return { items: [], total: 0 };
    }
    throw error;
  }
}
