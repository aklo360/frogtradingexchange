import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
import type {
  AppProfile,
  AppProfileResponse,
  ActivityFeedItem,
  ProfileContentItem,
  SocialProfileSummary,
  SwapActivityItem,
  TapestryIdentityProfile,
  TapestryProfileDetails,
  TapestryWallet,
  TokenHoldingSummary,
  TradeHistoryEntry,
  WalletSocialCounts,
  NFTAsset,
} from "@/lib/tapestry/types";
import {
  TapestryAPIError,
  getActivityFeed,
  findOrCreateProfile,
  getProfileDetails,
  getProfileContents,
  getProfileFollowers,
  getProfileFollowing,
  getProfileWallets,
  getProfilesByWalletAddress,
  getProfilesForIdentity,
  getSwapActivity,
  getTradeHistory,
  getWalletSocialCounts,
  pickAppProfile,
} from "@/server/tapestry/client";
import { getWalletNfts } from "@/server/solana/assets";
import { DEFAULT_TOKEN_MAP } from "@/lib/tokens";
import {
  DEFAULT_INCLUDE_COMPRESSED,
  DEFAULT_NFT_COLLECTION,
} from "@/lib/tapestry/constants";

const INVALID_REQUEST = NextResponse.json(
  { error: "Invalid request" },
  { status: 400 },
);

const NOT_FOUND = NextResponse.json(
  { error: "Profile not found" },
  { status: 404 },
);

/**
 * SECURITY: Validate origin header for CSRF protection
 * Only allows requests from same origin or allowed origins
 */
const isValidOrigin = (request: NextRequest): boolean => {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  // Allow same-origin requests
  if (!origin) {
    // No origin header typically means same-origin request
    return true;
  }

  try {
    const originUrl = new URL(origin);
    // Check if origin matches host
    if (host && originUrl.host === host) {
      return true;
    }
    // Allow localhost in development
    if (process.env.NODE_ENV === "development" && originUrl.hostname === "localhost") {
      return true;
    }
  } catch {
    return false;
  }

  return false;
};

/**
 * SECURITY: Validate Solana address format
 */
const isValidSolanaAddress = (address: string | undefined): boolean => {
  if (!address) return false;
  // Solana addresses are base58 encoded, 32-44 characters
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
};

/**
 * SECURITY: Validate username format
 */
const isValidUsername = (username: string | undefined): boolean => {
  if (!username) return false;
  // Username: 1-50 chars, alphanumeric, underscores, hyphens
  return /^[a-zA-Z0-9_-]{1,50}$/.test(username);
};

/**
 * SECURITY: Validate bio length
 */
const isValidBio = (bio: string | null | undefined): boolean => {
  if (!bio) return true;
  return bio.length <= 500;
};

/**
 * SECURITY: Validate image URL
 */
const isValidImageUrl = (url: string | null | undefined): boolean => {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};


type ProfileResponsePayload = AppProfileResponse;

const normalizeProfile = (profile: {
  id: string;
  namespace: string;
  created_at: number;
  username: string;
  bio?: string | null;
  image?: string | null;
  properties?: Array<{ key: string; value: string }>;
}): AppProfile => ({
  id: profile.id,
  namespace: profile.namespace,
  createdAt: profile.created_at,
  username: profile.username,
  bio: profile.bio ?? undefined,
  image: profile.image ?? undefined,
  properties: profile.properties ?? undefined,
});

const getPfpFromProfile = (profile: {
  properties?: Array<{ key: string; value: string }>;
}) => {
  const props = profile.properties ?? [];
  const mint = props.find((p) => p.key === "pfp_mint")?.value ?? null;
  const image = props.find((p) => p.key === "pfp_image")?.value ?? null;
  return { mint, image };
};

const normalizeSocialProfile = (
  profile: SocialProfileSummary,
): SocialProfileSummary => ({
  id: profile.id,
  namespace: profile.namespace,
  created_at: profile.created_at,
  username: profile.username,
  bio: profile.bio ?? undefined,
  image: profile.image ?? undefined,
  wallet: profile.wallet ?? null,
});

type BuildPayloadArgs = {
  details: TapestryProfileDetails | null;
  selectedIdentity?: TapestryIdentityProfile;
  identities?: TapestryIdentityProfile[];
  fallbackWallet?: string;
  operation?: "CREATED" | "FOUND";
  pfpMint?: string | null;
  pfpImage?: string | null;
  followers?: {
    profiles: SocialProfileSummary[];
    total: number;
  };
  following?: {
    profiles: SocialProfileSummary[];
    total: number;
  };
  wallets?: TapestryWallet[];
  walletSocialCounts?: WalletSocialCounts | null;
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

function buildProfilePayload({
  details,
  selectedIdentity,
  identities,
  fallbackWallet,
  operation,
  followers,
  following,
  wallets,
  walletSocialCounts,
  activity,
  swapActivity,
  tradeHistory,
  tokenSummary,
  contents,
  nfts,
  pfpMint,
  pfpImage,
}: BuildPayloadArgs): ProfileResponsePayload {
  const resolvedIdentity =
    selectedIdentity ??
    (identities ? pickAppProfile(identities) : undefined);

  const profileSource = details?.profile ?? resolvedIdentity?.profile;

  if (!profileSource) {
    throw new Error("Cannot build profile response without profile data");
  }

  const payload: ProfileResponsePayload = {
    profile: normalizeProfile(profileSource),
    socialCounts:
      details?.socialCounts ?? resolvedIdentity?.socialCounts ?? {
        followers: 0,
        following: 0,
      },
    walletAddress:
      details?.walletAddress ??
      resolvedIdentity?.wallet?.address ??
      fallbackWallet,
    namespace:
      details?.namespace ?? resolvedIdentity?.namespace ?? undefined,
    contact: details?.contact ?? resolvedIdentity?.contact ?? undefined,
    hashedPhoneNumber: details?.hashedPhoneNumber,
  };

  if (identities) {
    payload.identities = identities;
  }

  if (operation) {
    payload.operation = operation;
  }

  if (followers) {
    payload.followers = {
      profiles: followers.profiles.map(normalizeSocialProfile),
      total: followers.total,
    };
  }

  if (following) {
    payload.following = {
      profiles: following.profiles.map(normalizeSocialProfile),
      total: following.total,
    };
  }

  if (wallets && wallets.length > 0) {
    payload.wallets = wallets;
  }

  if (walletSocialCounts) {
    payload.walletSocialCounts = walletSocialCounts;
  }

  if (activity) {
    payload.activity = activity;
  }

  if (swapActivity) {
    payload.swapActivity = swapActivity;
  }

  if (tradeHistory) {
    payload.tradeHistory = tradeHistory;
  }

  if (tokenSummary) {
    payload.tokenSummary = tokenSummary;
  }

  if (contents) {
    payload.contents = contents;
  }

  if (nfts) {
    payload.nfts = nfts;
  }

  payload.pfpMint = pfpMint ?? null;
  payload.pfpImage = pfpImage ?? null;

  return payload;
}

const mergeWallets = (
  wallets: TapestryWallet[] | undefined,
  fallbackWallet?: string,
): TapestryWallet[] | undefined => {
  if (!fallbackWallet) return wallets;
  const existing = wallets ?? [];
  if (existing.some((wallet) => wallet.id === fallbackWallet)) {
    return existing.length ? existing : undefined;
  }
  return [
    ...existing,
    {
      id: fallbackWallet,
      created_at: Date.now(),
      blockchain: "SOLANA",
      wallet_type: null,
    },
  ];
};

const summarizeTrades = (
  trades: TradeHistoryEntry[],
): TokenHoldingSummary[] => {
  const aggregates = new Map<
    string,
    { netAmount: number; netUsd: number; lastActivity: number }
  >();

  for (const trade of trades) {
    const timestamp = trade.timestamp ?? 0;

    if (trade.outputMint) {
      const entry = aggregates.get(trade.outputMint) ?? {
        netAmount: 0,
        netUsd: 0,
        lastActivity: 0,
      };
      entry.netAmount += trade.outputAmount ?? 0;
      entry.netUsd += trade.outputValueUSD ?? 0;
      entry.lastActivity = Math.max(entry.lastActivity, timestamp);
      aggregates.set(trade.outputMint, entry);
    }

    if (trade.inputMint) {
      const entry = aggregates.get(trade.inputMint) ?? {
        netAmount: 0,
        netUsd: 0,
        lastActivity: 0,
      };
      entry.netAmount -= trade.inputAmount ?? 0;
      entry.netUsd -= trade.inputValueUSD ?? 0;
      entry.lastActivity = Math.max(entry.lastActivity, timestamp);
      aggregates.set(trade.inputMint, entry);
    }
  }

  const MIN_AMOUNT = 0.000001;
  const MIN_USD = 0.01;

  return Array.from(aggregates.entries())
    .map(([mint, summary]) => {
      const meta = DEFAULT_TOKEN_MAP.get(mint);
      const direction =
        summary.netAmount > MIN_AMOUNT
          ? "positive"
          : summary.netAmount < -MIN_AMOUNT
          ? "negative"
          : "neutral";

      return {
        mint,
        netAmount: summary.netAmount,
        netUsd: summary.netUsd,
        lastActivity: summary.lastActivity,
        direction,
        symbol: meta?.symbol,
        name: meta?.name,
        logoURI: meta?.logoURI,
      } satisfies TokenHoldingSummary;
    })
    .filter((entry) =>
      Math.abs(entry.netUsd) >= MIN_USD || Math.abs(entry.netAmount) >= MIN_AMOUNT,
    )
    .sort((a, b) => {
      const usdDelta = Math.abs(b.netUsd) - Math.abs(a.netUsd);
      if (Math.abs(usdDelta) > 0) return usdDelta;
      return Math.abs(b.netAmount) - Math.abs(a.netAmount);
    })
    .slice(0, 5);
};

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const walletAddress = url.searchParams.get("walletAddress");
  const profileId = url.searchParams.get("profileId");
  const collectionParam = url.searchParams.get("nftCollection");
  const resolvedCollection =
    collectionParam === "all"
      ? null
      : collectionParam ?? DEFAULT_NFT_COLLECTION;
  const nftMode = url.searchParams.get("nftMode");
  const includeCompressed =
    nftMode === "all" ? true : DEFAULT_INCLUDE_COMPRESSED;

  try {
    if (profileId) {
      try {
        const details = await getProfileDetails(profileId);

        let relatedIdentities: TapestryIdentityProfile[] | undefined;
        let selectedIdentity: TapestryIdentityProfile | undefined;

        if (details.walletAddress) {
          relatedIdentities = await getProfilesForIdentity(details.walletAddress);
          const appProfiles = await getProfilesByWalletAddress(
            details.walletAddress,
          );
          selectedIdentity = appProfiles.find(
            (entry) => entry.profile.id === details.profile.id,
          );
        }

        const walletForData =
          details.walletAddress ?? selectedIdentity?.wallet?.address;
        const profileIdForData = details.profile.id;
        const usernameForData = details.profile.username;

        const [
          followersRes,
          followingRes,
          walletsRes,
          walletSocialCounts,
          activity,
          swapActivity,
          tradeHistory,
          contents,
          nftRes,
        ] = await Promise.all([
          getProfileFollowers(profileIdForData, { pageSize: 12 }),
          getProfileFollowing(profileIdForData, { pageSize: 12 }),
          getProfileWallets(profileIdForData),
          getWalletSocialCounts(walletForData ?? ""),
          getActivityFeed(usernameForData, { pageSize: 25 }),
          getSwapActivity(usernameForData, { pageSize: 10 }),
          getTradeHistory(walletForData ?? "", { limit: 50 }),
          getProfileContents(profileIdForData, { pageSize: 12 }),
          walletForData
            ? getWalletNfts({
                ownerAddress: walletForData,
                page: 1,
                limit: 1000,
                collectionAddress: resolvedCollection,
                includeCompressed,
              }).catch(() => ({
                items: [],
                page: 1,
                limit: 1000,
                total: 0,
              }))
            : Promise.resolve({
                items: [],
                page: 1,
                limit: 1000,
                total: 0,
              }),
        ]);

        const tradeHistoryLimited = tradeHistory.slice(0, 20);
        const tokenSummary = summarizeTrades(tradeHistoryLimited);

        const pfpProps = getPfpFromProfile(details.profile);
        const ownedMints = new Set(nftRes.items.map((item) => item.id));
        const pfpMint =
          pfpProps.mint && ownedMints.has(pfpProps.mint) ? pfpProps.mint : null;
        const pfpImage = pfpMint ? pfpProps.image ?? details.profile.image ?? null : null;

        const payload = buildProfilePayload({
          details,
          selectedIdentity,
          identities: relatedIdentities,
          fallbackWallet: walletForData,
          followers: {
            profiles: followersRes.profiles,
            total: followersRes.totalCount,
          },
          following: {
            profiles: followingRes.profiles,
            total: followingRes.totalCount,
          },
          wallets: mergeWallets(walletsRes, walletForData),
          walletSocialCounts,
          activity,
          swapActivity,
          tradeHistory: tradeHistoryLimited,
          tokenSummary,
          contents: {
            items: contents.items,
            total: contents.total,
          },
          nfts: nftRes,
          pfpMint,
          pfpImage,
        });

        return NextResponse.json(payload);
      } catch (error) {
        if (error instanceof TapestryAPIError && error.status === 404) {
          return NOT_FOUND;
        }
        throw error;
      }
    }

    if (!walletAddress) {
      return INVALID_REQUEST;
    }

    const [identities, appProfiles] = await Promise.all([
      getProfilesForIdentity(walletAddress),
      getProfilesByWalletAddress(walletAddress),
    ]);

    const target = pickAppProfile(appProfiles);

    if (!target) {
      return NOT_FOUND;
    }

    let details: TapestryProfileDetails | null = null;
    try {
      details = await getProfileDetails(target.profile.id);
    } catch (error) {
      if (!(error instanceof TapestryAPIError && error.status === 404)) {
        throw error;
      }
    }

    const profileIdForData = details?.profile.id ?? target.profile.id;
    const usernameForData =
      details?.profile.username ?? target.profile.username;
    const walletForData =
      details?.walletAddress ?? target.wallet?.address ?? walletAddress;

    const [
      followersRes,
      followingRes,
      walletsRes,
      walletSocialCounts,
      activity,
      swapActivity,
      tradeHistory,
      contents,
      nftRes,
    ] = await Promise.all([
      profileIdForData
        ? getProfileFollowers(profileIdForData, { pageSize: 12 })
        : Promise.resolve({
            profiles: [],
            page: 1,
            pageSize: 12,
            totalCount: 0,
          }),
      profileIdForData
        ? getProfileFollowing(profileIdForData, { pageSize: 12 })
        : Promise.resolve({
            profiles: [],
            page: 1,
            pageSize: 12,
            totalCount: 0,
          }),
      profileIdForData
        ? getProfileWallets(profileIdForData)
        : Promise.resolve<TapestryWallet[]>([]),
      walletForData ? getWalletSocialCounts(walletForData) : Promise.resolve(null),
      usernameForData ? getActivityFeed(usernameForData, { pageSize: 25 }) : Promise.resolve<ActivityFeedItem[]>([]),
      usernameForData ? getSwapActivity(usernameForData, { pageSize: 10 }) : Promise.resolve<SwapActivityItem[]>([]),
      walletForData ? getTradeHistory(walletForData, { limit: 50 }) : Promise.resolve<TradeHistoryEntry[]>([]),
      profileIdForData
        ? getProfileContents(profileIdForData, { pageSize: 12 })
        : Promise.resolve({ items: [], total: 0 }),
      walletForData
        ? getWalletNfts({
            ownerAddress: walletForData,
            page: 1,
            limit: 1000,
            collectionAddress: resolvedCollection,
            includeCompressed,
          }).catch(() => ({
            items: [],
            page: 1,
            limit: 1000,
            total: 0,
          }))
        : Promise.resolve({
            items: [],
            page: 1,
            limit: 1000,
            total: 0,
          }),
    ]);

    const tradeHistoryLimited = tradeHistory.slice(0, 20);
    const tokenSummary = summarizeTrades(tradeHistoryLimited);
    const pfpProps = details?.profile
      ? getPfpFromProfile(details.profile)
      : { mint: null, image: null };
    const ownedMints = new Set(nftRes.items.map((item) => item.id));
    const pfpMint =
      pfpProps.mint && ownedMints.has(pfpProps.mint) ? pfpProps.mint : null;
    const pfpImage = pfpMint
      ? pfpProps.image ?? details?.profile.image ?? null
      : null;

    const payload = buildProfilePayload({
      details,
      selectedIdentity: target,
      identities,
      fallbackWallet: walletForData,
      followers: {
        profiles: followersRes.profiles,
        total: followersRes.totalCount,
      },
      following: {
        profiles: followingRes.profiles,
        total: followingRes.totalCount,
      },
      wallets: mergeWallets(walletsRes, walletForData),
      walletSocialCounts,
      activity,
      swapActivity,
      tradeHistory: tradeHistoryLimited,
      tokenSummary,
      contents: {
        items: contents.items,
        total: contents.total,
      },
      nfts: nftRes,
      pfpMint,
      pfpImage,
    });

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof TapestryAPIError) {
      let message = "Tapestry request failed";
      try {
        const parsed = JSON.parse(error.responseBody);
        if (parsed && typeof parsed.error === "string") {
          message = parsed.error;
        }
      } catch {
        // ignore JSON parse errors and fall back to generic message
        message = error.responseBody || message;
      }

      return NextResponse.json(
        { error: message },
        { status: error.status },
      );
    }

    console.error("Failed to fetch Tapestry profile", error);
    return NextResponse.json(
      { error: "Failed to load profile" },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  // SECURITY: CSRF protection - validate origin
  if (!isValidOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // SECURITY: Validate Content-Type header
  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type must be application/json" },
      { status: 415 }
    );
  }

  let body: {
    username?: string;
    walletAddress?: string;
    bio?: string | null;
    image?: string | null;
    profileId?: string;
    referredById?: string;
    pfpMint?: string | null;
    pfpImage?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return INVALID_REQUEST;
  }

  // SECURITY: Input validation
  if (!isValidUsername(body.username)) {
    return NextResponse.json(
      { error: "Invalid username format (1-50 alphanumeric characters, underscores, hyphens)" },
      { status: 400 }
    );
  }

  if (body.walletAddress && !isValidSolanaAddress(body.walletAddress)) {
    return NextResponse.json(
      { error: "Invalid wallet address format" },
      { status: 400 }
    );
  }

  if (!isValidBio(body.bio)) {
    return NextResponse.json(
      { error: "Bio must be 500 characters or less" },
      { status: 400 }
    );
  }

  if (!isValidImageUrl(body.image) || !isValidImageUrl(body.pfpImage)) {
    return NextResponse.json(
      { error: "Invalid image URL format" },
      { status: 400 }
    );
  }

  try {
    // Validate PFP ownership if provided
    const pfpMint: string | null = body.pfpMint ?? null;
    let pfpImage: string | null = body.pfpImage ?? null;
    if (pfpMint) {
      const nftCheck = await getWalletNfts({
        ownerAddress: body.walletAddress ?? "",
        page: 1,
        limit: 1000,
        collectionAddress: null,
        includeCompressed: DEFAULT_INCLUDE_COMPRESSED,
      });
      const owns = nftCheck.items.some((item) => item.id === pfpMint);
      if (!owns) {
        return NextResponse.json(
          { error: "PFP mint not owned by wallet" },
          { status: 400 },
        );
      }
      if (!pfpImage) {
        const match = nftCheck.items.find((item) => item.id === pfpMint);
        pfpImage = match?.image ?? null;
      }
    }

    // username is guaranteed to be defined after validation above
    const result = await findOrCreateProfile({
      username: body.username!,
      walletAddress: body.walletAddress,
      bio: body.bio,
      image: pfpImage ?? body.image,
      profileId: body.profileId,
      referredById: body.referredById,
      properties: pfpMint
        ? [
            { key: "pfp_mint", value: pfpMint },
            ...(pfpImage ? [{ key: "pfp_image", value: pfpImage }] : []),
          ]
        : undefined,
    });

    const details = await getProfileDetails(result.profile.id);

    const walletToQuery =
      body.walletAddress ?? result.walletAddress ?? details.walletAddress;

    let identities: TapestryIdentityProfile[] | undefined;
    let appProfiles: TapestryIdentityProfile[] | undefined;

    if (walletToQuery) {
      [identities, appProfiles] = await Promise.all([
        getProfilesForIdentity(walletToQuery),
        getProfilesByWalletAddress(walletToQuery),
      ]);
    }

  const selectedIdentity = appProfiles?.find(
    (entry) => entry.profile.id === details.profile.id,
  );

  const [
    followersRes,
    followingRes,
    walletsRes,
    walletSocialCounts,
    activity,
    swapActivity,
    tradeHistory,
    contents,
  ] = await Promise.all([
    getProfileFollowers(details.profile.id, { pageSize: 12 }),
    getProfileFollowing(details.profile.id, { pageSize: 12 }),
    getProfileWallets(details.profile.id),
    walletToQuery ? getWalletSocialCounts(walletToQuery) : Promise.resolve(null),
      getActivityFeed(details.profile.username, { pageSize: 25 }),
      getSwapActivity(details.profile.username, { pageSize: 10 }),
      walletToQuery ? getTradeHistory(walletToQuery, { limit: 50 }) : Promise.resolve<TradeHistoryEntry[]>([]),
      getProfileContents(details.profile.id, { pageSize: 12 }),
    ]);

    const nftRes =
      walletToQuery
        ? await getWalletNfts({
            ownerAddress: walletToQuery,
            page: 1,
            limit: 1000,
            collectionAddress: DEFAULT_NFT_COLLECTION,
            includeCompressed: DEFAULT_INCLUDE_COMPRESSED,
          }).catch(() => ({
            items: [],
            page: 1,
            limit: 1000,
            total: 0,
          }))
        : { items: [], page: 1, limit: 1000, total: 0 };

    const tradeHistoryLimited = tradeHistory.slice(0, 20);
    const tokenSummary = summarizeTrades(tradeHistoryLimited);
    const pfpProps = details.profile
      ? getPfpFromProfile(details.profile)
      : { mint: null, image: null };
    const ownedMints = new Set(nftRes.items.map((item) => item.id));
    const resolvedPfpMint =
      pfpProps.mint && ownedMints.has(pfpProps.mint) ? pfpProps.mint : null;
    const resolvedPfpImage = resolvedPfpMint
      ? pfpProps.image ?? details.profile.image ?? null
      : null;

    const payload = buildProfilePayload({
      details,
      selectedIdentity,
      identities,
      fallbackWallet: walletToQuery,
      operation: result.operation,
      followers: {
        profiles: followersRes.profiles,
        total: followersRes.totalCount,
      },
      following: {
        profiles: followingRes.profiles,
        total: followingRes.totalCount,
      },
      wallets: mergeWallets(walletsRes, walletToQuery ?? undefined),
      walletSocialCounts,
      activity,
      swapActivity,
      tradeHistory: tradeHistoryLimited,
      tokenSummary,
      contents: {
        items: contents.items,
        total: contents.total,
      },
      nfts: nftRes,
      pfpMint: resolvedPfpMint,
      pfpImage: resolvedPfpImage,
    });

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof TapestryAPIError) {
      let message = "Tapestry request failed";
      try {
        const parsed = JSON.parse(error.responseBody);
        if (parsed && typeof parsed.error === "string") {
          message = parsed.error;
        }
      } catch {
        message = error.responseBody || message;
      }

      return NextResponse.json(
        { error: message },
        { status: error.status },
      );
    }

    console.error("Failed to upsert Tapestry profile", error);
    return NextResponse.json(
      { error: "Failed to save profile" },
      { status: 502 },
    );
  }
}
