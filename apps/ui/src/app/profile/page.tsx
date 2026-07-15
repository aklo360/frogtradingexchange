"use client";

/* eslint-disable @next/next/no-img-element -- NFT metadata image hosts are dynamic. */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useCreateWallet } from "@privy-io/react-auth/solana";
import { useWallet } from "@solana/wallet-adapter-react";

import { Ticker } from "@/components/Ticker";
import { WalletButton } from "@/components/WalletButton";
import type { NftHolding, NftHoldingsPage } from "@/lib/nfts";
import {
  getPrivySolanaWallets,
  getProfileNftWalletAddresses,
  getTelegramAccount,
} from "@/lib/privy";
import { isV1 } from "@/lib/version";
import type { AppProfileResponse } from "@/lib/tapestry/types";
import { useAudio } from "@/providers/AudioProvider";
import homeStyles from "../page.module.css";
import styles from "./profile.module.css";
import {
  PROFILE_NFT_PAGE_SIZE,
  activityLabel,
  buildProfileMilestones,
  deriveDefaultUsername,
  formatShortAddress,
  formatTokenAmount,
  formatUsd,
  normalizeEpochMilliseconds,
  shortMint,
  timeAgo,
  tradeChip,
} from "./profileView";
import {
  demoNftPage,
  demoPrivyWallets,
  demoProfileResponse,
  demoTelegramAccount,
} from "./demoFixtures";

type FetchState = "idle" | "loading" | "error";

const profileCache = new Map<string, AppProfileResponse>();

const readResponseError = async (response: Response, fallback: string) => {
  const text = await response.text();
  if (!text) return fallback;
  if (
    response.headers.get("content-type")?.includes("text/html") ||
    text.trimStart().startsWith("<")
  ) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    return typeof parsed.error === "string" && parsed.error.trim()
      ? parsed.error
      : fallback;
  } catch {
    return text;
  }
};

const initialsFor = (value: string) =>
  value.trim().slice(0, 2).toUpperCase() || "??";

const formatProfileDate = (value?: number) => {
  if (!value) return "Unknown";
  const timestamp = normalizeEpochMilliseconds(value);
  if (!Number.isFinite(timestamp)) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
};

const extractNftNumber = (name: string, collection?: string | null) => {
  const fromName = name.match(/(\d+)/g);
  if (fromName?.length) return fromName[fromName.length - 1];
  const fromCollection = collection?.match(/(\d+)/g);
  return fromCollection?.length
    ? fromCollection[fromCollection.length - 1]
    : null;
};

const cleanNftName = (raw: string, number: string | null) => {
  let cleaned = raw.replace(/solana business frogs?/gi, "");
  if (number) cleaned = cleaned.replace(new RegExp(`#?${number}`, "gi"), "");
  cleaned = cleaned.replace(/#?\d+/g, "").replace(/\s+/g, " ").trim();
  return cleaned || (/frog/i.test(raw) ? "Frog" : "NFT");
};

const nftLabel = (nft: NftHolding) => {
  const number = extractNftNumber(nft.name, nft.collection);
  const name = cleanNftName(nft.name, number);
  return number ? `${name} #${number}` : name;
};

type NftHoldingsSectionProps = {
  items: NftHolding[];
  total: number;
  page: number;
  totalPages: number;
  state: FetchState;
  error: string | null;
  pfpMint: string | null;
  pfpSaving: boolean;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
  profileWalletAddress?: string;
  onSelectPfp?: (mint: string, image: string | null) => void;
};

function NftHoldingsSection({
  items,
  total,
  page,
  totalPages,
  state,
  error,
  pfpMint,
  pfpSaving,
  onPageChange,
  onRefresh,
  profileWalletAddress,
  onSelectPfp,
}: NftHoldingsSectionProps) {
  return (
    <section className={styles.collectionSection} aria-label="NFT holdings">
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>Vault · FTX account wallets</p>
          <h2>Solana Business Frogs</h2>
        </div>
        {totalPages > 1 ? (
          <div className={styles.pagination}>
            <span>
              PG {page}/{totalPages}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1 || state === "loading"}
              aria-label="Previous NFTs"
              title="Previous NFTs"
            >
              &lsaquo;
            </button>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages || state === "loading"}
              aria-label="Next NFTs"
              title="Next NFTs"
            >
              &rsaquo;
            </button>
          </div>
        ) : (
          <span className={styles.sectionCount}>
            {state === "loading" && !items.length
              ? "Loading"
              : `${total} total`}
          </span>
        )}
      </div>

      {items.length ? (
        <div className={styles.nftGrid} aria-busy={state === "loading"}>
          {items.map((nft) => {
            const label = nftLabel(nft);
            const isCurrent = pfpMint === nft.mint;
            const canSetProfile =
              Boolean(onSelectPfp) && nft.owner === profileWalletAddress;
            return (
              <article key={nft.mint} className={styles.nftCard}>
                <div className={styles.nftImageWrap}>
                  {nft.image ? (
                    <img
                      src={nft.image}
                      alt={label}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className={styles.nftFallbackGlyph}>
                      {initialsFor(label)}
                    </span>
                  )}
                  {isCurrent ? (
                    <span className={styles.currentMarker}>PFP</span>
                  ) : null}
                </div>
                <div className={styles.nftMeta}>
                  <strong title={nft.name}>{label}</strong>
                  {canSetProfile ? (
                    <button
                      type="button"
                      onClick={() => onSelectPfp?.(nft.mint, nft.image)}
                      disabled={isCurrent || pfpSaving}
                    >
                      {isCurrent ? "Current profile" : "Set as profile"}
                    </button>
                  ) : (
                    <span className={styles.nftMint} title={nft.mint}>
                      {formatShortAddress(nft.owner)}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : state === "loading" ? (
        <div className={styles.collectionLoading} aria-live="polite">
          <div className={`${styles.skeleton} ${styles.nftLoadingTile}`} />
          <div className={`${styles.skeleton} ${styles.nftLoadingTile}`} />
          <div className={`${styles.skeleton} ${styles.nftLoadingTile}`} />
          <div className={`${styles.skeleton} ${styles.nftLoadingTile}`} />
        </div>
      ) : state === "error" ? (
        <div className={styles.collectionEmpty}>
          <video src="/sticker/cry.webm" autoPlay loop muted playsInline />
          <div>
            <h3>Holdings unavailable</h3>
            <p>{error ?? "NFT holdings could not be loaded right now."}</p>
          </div>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onRefresh}
          >
            Retry
          </button>
        </div>
      ) : (
        <div className={styles.collectionEmpty}>
          <img src="/sbficon.png" alt="" />
          <div>
            <h3>No Business Frogs found</h3>
            <p>
              Your linked wallets do not currently hold any Solana Business
              Frogs.
            </p>
          </div>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onRefresh}
          >
            Refresh
          </button>
        </div>
      )}
    </section>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { muted, toggleMuted } = useAudio();
  const { publicKey, connected, disconnect } = useWallet();
  const {
    ready: privyReady,
    authenticated,
    user,
    login,
    logout,
  } = usePrivy();
  const { createWallet } = useCreateWallet();
  const [demoMode, setDemoMode] = useState(false);
  const [createdWalletAddress, setCreatedWalletAddress] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (
      process.env.NODE_ENV === "development" &&
      window.location.search.includes("demo=1")
    ) {
      setDemoMode(true);
    }
  }, []);

  const privyWallets = useMemo(() => {
    const wallets = getPrivySolanaWallets(user?.linkedAccounts);
    if (
      createdWalletAddress &&
      !wallets.some((wallet) => wallet.address === createdWalletAddress)
    ) {
      return [
        { id: null, address: createdWalletAddress, embedded: true },
        ...wallets,
      ];
    }
    if (demoMode && !wallets.length) return demoPrivyWallets;
    return wallets;
  }, [createdWalletAddress, demoMode, user?.linkedAccounts]);
  const telegramAccount = useMemo(() => {
    const account = getTelegramAccount(user?.linkedAccounts);
    if (account) return account;
    return demoMode ? demoTelegramAccount : null;
  }, [demoMode, user?.linkedAccounts]);
  const primaryPrivyWallet = privyWallets[0];
  const walletAddress = useMemo(
    () => primaryPrivyWallet?.address ?? publicKey?.toBase58() ?? "",
    [primaryPrivyWallet?.address, publicKey],
  );
  const nftWalletAddresses = useMemo(() => {
    return getProfileNftWalletAddresses(privyWallets, publicKey?.toBase58());
  }, [privyWallets, publicKey]);
  const nftWalletKey = nftWalletAddresses.join(",");
  const hasAccount = authenticated || connected || demoMode;

  const [profileData, setProfileData] = useState<AppProfileResponse | null>(
    null,
  );
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nftData, setNftData] = useState<NftHoldingsPage | null>(null);
  const [nftFetchState, setNftFetchState] = useState<FetchState>("idle");
  const [nftError, setNftError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [nftPage, setNftPage] = useState(1);
  const [selectingPfp, setSelectingPfp] = useState(false);
  const [pfpSaving, setPfpSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [walletCreating, setWalletCreating] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [pfpError, setPfpError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const [nftRequestVersion, setNftRequestVersion] = useState(0);

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    if (!menuOpen && !selectingPfp) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeMenu();
      setSelectingPfp(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen, selectingPfp]);

  useEffect(() => {
    if (isV1) router.replace("/");
  }, [router]);

  useEffect(() => {
    setNftPage(1);
    setSelectingPfp(false);
  }, [nftWalletKey, walletAddress]);

  useEffect(() => {
    if (demoMode) {
      setProfileData(demoProfileResponse(Date.now()));
      setFetchState("idle");
      setErrorMessage(null);
      return;
    }
    if (!walletAddress) {
      setProfileData(null);
      setFetchState("idle");
      setErrorMessage(null);
      return;
    }

    const cached = profileCache.get(walletAddress);
    if (cached) setProfileData(cached);

    const controller = new AbortController();
    let canceled = false;

    const loadProfile = async () => {
      setFetchState("loading");
      setErrorMessage(null);

      try {
        const query = new URLSearchParams({
          walletAddress,
          nftCollection: "all",
          nftMode: "all",
        });

        const response = await fetch(
          `/api/tapestry/profiles?${query.toString()}`,
          { cache: "no-store", signal: controller.signal },
        );

        if (response.status === 404) {
          if (canceled) return;
          profileCache.delete(walletAddress);
          setProfileData(null);
          setFetchState("idle");
          return;
        }
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || "Failed to load profile");
        }

        const data = (await response.json()) as AppProfileResponse;
        if (canceled) return;
        profileCache.set(walletAddress, data);
        setProfileData(data);
        setFetchState("idle");
      } catch (error) {
        if (controller.signal.aborted || canceled) return;
        console.error("Error loading Tapestry profile", error);
        setFetchState("error");
        setErrorMessage("Your profile could not be synced right now.");
      }
    };

    void loadProfile();
    return () => {
      canceled = true;
      controller.abort();
    };
  }, [demoMode, requestVersion, walletAddress]);

  useEffect(() => {
    if (demoMode) {
      setNftData(demoNftPage(nftPage, PROFILE_NFT_PAGE_SIZE));
      setNftFetchState("idle");
      setNftError(null);
      return;
    }
    if (!nftWalletKey) {
      setNftData(null);
      setNftFetchState("idle");
      setNftError(null);
      return;
    }

    const controller = new AbortController();
    let canceled = false;
    const walletAddresses = nftWalletKey.split(",").filter(Boolean);

    const loadNfts = async () => {
      setNftFetchState("loading");
      setNftError(null);

      try {
        const query = new URLSearchParams({
          page: String(nftPage),
          limit: String(PROFILE_NFT_PAGE_SIZE),
        });
        for (const address of walletAddresses) {
          query.append("walletAddress", address);
        }
        const response = await fetch(`/api/frogx/nfts?${query.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(
            await readResponseError(
              response,
              "NFT holdings are temporarily unavailable",
            ),
          );
        }

        const data = (await response.json()) as NftHoldingsPage;
        if (canceled) return;
        const lastPage = Math.max(
          1,
          Math.ceil(Math.max(data.total, 1) / PROFILE_NFT_PAGE_SIZE),
        );
        if (nftPage > lastPage) {
          setNftPage(lastPage);
          return;
        }
        setNftData(data);
        setNftFetchState("idle");
      } catch (error) {
        if (controller.signal.aborted || canceled) return;
        console.error("Error loading NFT holdings", error);
        setNftFetchState("error");
        setNftError(
          error instanceof Error
            ? error.message
            : "NFT holdings are temporarily unavailable",
        );
      }
    };

    void loadNfts();
    return () => {
      canceled = true;
      controller.abort();
    };
  }, [demoMode, nftPage, nftRequestVersion, nftWalletKey]);

  const refreshProfile = () => setRequestVersion((version) => version + 1);
  const refreshNfts = () => setNftRequestVersion((version) => version + 1);

  const handleCreateWallet = async () => {
    if (!authenticated || privyWallets.length > 0) return;
    setWalletCreating(true);
    setWalletError(null);
    try {
      const result = await createWallet();
      setCreatedWalletAddress(result.wallet.address);
    } catch (error) {
      setWalletError(
        error instanceof Error
          ? error.message
          : "The Solana wallet could not be created.",
      );
    } finally {
      setWalletCreating(false);
    }
  };

  const handleCopyWallet = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      window.setTimeout(() => setCopiedAddress(null), 1600);
    } catch {
      setWalletError("The wallet address could not be copied.");
    }
  };

  const handleSignOut = async () => {
    await logout();
    if (connected) await disconnect();
  };

  const handleCreateProfile = async () => {
    if (!walletAddress) return;
    setProfileSaving(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/tapestry/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: deriveDefaultUsername(walletAddress),
          walletAddress,
          bio: null,
        }),
      });
      if (!response.ok) {
        throw new Error(
          await readResponseError(response, "Profile creation failed"),
        );
      }
      const data = (await response.json()) as AppProfileResponse;
      profileCache.set(walletAddress, data);
      setProfileData(data);
      setFetchState("idle");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Profile creation failed.",
      );
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSelectPfp = async (mint: string, image: string | null) => {
    const profile = profileData?.profile;
    if (!walletAddress || !profile) return;
    setPfpSaving(true);
    setPfpError(null);
    try {
      const response = await fetch("/api/tapestry/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: profile.username,
          walletAddress,
          profileId: profile.id,
          bio: profile.bio ?? null,
          pfpMint: mint,
          pfpImage: image,
        }),
      });
      if (!response.ok) {
        throw new Error(
          await readResponseError(
            response,
            `Failed with status ${response.status}`,
          ),
        );
      }
      const data = (await response.json()) as AppProfileResponse;
      profileCache.set(walletAddress, data);
      setProfileData(data);
      setSelectingPfp(false);
    } catch (error) {
      setPfpError(error instanceof Error ? error.message : "Failed to set PFP");
    } finally {
      setPfpSaving(false);
    }
  };

  const followerTotal =
    profileData?.followers?.total ?? profileData?.socialCounts.followers ?? 0;
  const followingTotal =
    profileData?.following?.total ?? profileData?.socialCounts.following ?? 0;
  const profileRecord = profileData?.profile;
  const allNfts = nftData?.items ?? [];
  const totalNfts = Math.max(nftData?.total ?? 0, allNfts.length);
  const tradeHistory = profileData?.tradeHistory ?? [];
  const recentTradeCount = tradeHistory.length;
  const activityFeed = profileData?.activity ?? [];
  const tokenSummary = profileData?.tokenSummary ?? [];
  const followerProfiles = profileData?.followers?.profiles ?? [];
  const followingProfiles = profileData?.following?.profiles ?? [];
  const pfpMint = profileData?.pfpMint ?? null;
  const avatarUrl =
    profileData?.pfpImage ?? profileRecord?.image ?? "/sbficon.png";
  const displayUsername =
    profileRecord?.username ??
    (walletAddress ? deriveDefaultUsername(walletAddress) : "Frog profile");
  const displayBio = profileRecord?.bio?.trim() || "No bio added yet.";
  const milestones = buildProfileMilestones({
    frogCount: totalNfts,
    followerCount: followerTotal,
    recentTradeCount,
  });

  const nftTotalPages = Math.max(
    1,
    Math.ceil(Math.max(totalNfts, 1) / PROFILE_NFT_PAGE_SIZE),
  );
  const nftHoldingsSection = walletAddress ? (
    <NftHoldingsSection
      items={allNfts}
      total={totalNfts}
      page={nftPage}
      totalPages={nftTotalPages}
      state={nftFetchState}
      error={nftError}
      pfpMint={pfpMint}
      pfpSaving={pfpSaving}
      onPageChange={setNftPage}
      onRefresh={refreshNfts}
      profileWalletAddress={walletAddress}
      onSelectPfp={
        profileData
          ? (mint, image) => void handleSelectPfp(mint, image)
          : undefined
      }
    />
  ) : null;

  const accountConsole = authenticated || demoMode ? (
    <section className={styles.accountBand} aria-label="Privy account">
      <div>
        <p className={styles.eyebrowPurple}>Wallet console</p>
        <div className={styles.accountHeading}>
          <h2>
            {telegramAccount?.username
              ? `@${telegramAccount.username}`
              : telegramAccount?.firstName ?? "Privy account"}
          </h2>
          <span className={styles.privyStatus}>Privy secured</span>
        </div>
      </div>

      <div className={styles.walletInventory}>
        {privyWallets.length ? (
          privyWallets.map((wallet, index) => (
            <div className={styles.walletRow} key={wallet.address}>
              <div>
                <span>
                  {wallet.embedded ? "Embedded wallet" : "Linked wallet"}
                  {index === 0 ? " · Active" : ""}
                </span>
                <strong title={wallet.address}>{wallet.address}</strong>
              </div>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => void handleCopyWallet(wallet.address)}
              >
                {copiedAddress === wallet.address ? "Copied" : "Copy"}
              </button>
            </div>
          ))
        ) : (
          <div className={styles.walletEmpty}>
            <div>
              <strong>No Solana wallet is linked yet.</strong>
              <span>
                Create one only if this is a new account. To recover a bot
                wallet, sign out and use the same Telegram account first.
              </span>
            </div>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void handleCreateWallet()}
              disabled={walletCreating}
            >
              {walletCreating ? "Creating wallet" : "Create Solana wallet"}
            </button>
          </div>
        )}
      </div>

      <div className={styles.accountFooter}>
        <span>
          {telegramAccount
            ? "Telegram and web use this same Privy identity."
            : "Link or sign in with Telegram to use this account in the bot."}
        </span>
        <button
          type="button"
          className={styles.accountSignOut}
          onClick={() => void handleSignOut()}
        >
          Sign out
        </button>
      </div>
      {walletError ? (
        <div className={styles.inlineError} role="alert">
          <span>{walletError}</span>
        </div>
      ) : null}
    </section>
  ) : null;

  if (isV1) return null;

  return (
    <main className={`${homeStyles.main} ${styles.page}`}>
      <header className={homeStyles.headerBar}>
        <div className={homeStyles.headerInner}>
          <button
            type="button"
            className={`${homeStyles.brandGroup} ${homeStyles.brandHomeButton}`}
            onClick={() => {
              closeMenu();
              router.push("/");
            }}
            aria-label="Go to swap home"
          >
            <div className={homeStyles.brandRow}>
              <video
                src="/sticker/excited.webm"
                className={`${homeStyles.headerSticker} ${homeStyles.headerStickerLarge}`}
                autoPlay
                loop
                muted
                playsInline
                aria-hidden="true"
              />
              <h1>
                <span className={homeStyles.srOnly}>Frog Trading Exchange</span>
                <img
                  src="/logo.png"
                  alt="Frog Trading Exchange"
                  className={homeStyles.brandLogo}
                />
              </h1>
              <video
                src="/sticker/wink.webm"
                className={`${homeStyles.headerSticker} ${homeStyles.headerStickerLarge}`}
                autoPlay
                loop
                muted
                playsInline
                aria-hidden="true"
              />
            </div>
            <p className={homeStyles.tagline}>
              Powered by Titan for the best prices on Solana
            </p>
          </button>
        </div>
        <div className={homeStyles.rightControls}>
          <button
            type="button"
            className={homeStyles.menuButton}
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className={homeStyles.menuButtonBars} aria-hidden="true" />
          </button>
        </div>
        <div
          className={`${homeStyles.menuSheet} ${menuOpen ? homeStyles.menuSheetOpen : ""}`}
          aria-hidden={!menuOpen}
        >
          <nav aria-label="Main navigation" className={homeStyles.menuList}>
            <div className={homeStyles.menuWalletWrapper} onClick={closeMenu}>
              <WalletButton className={homeStyles.menuWallet} />
            </div>
            {[["/profile", "/bank.svg", "PROFILE"]].map(([href, icon, label]) => (
              <button
                key={href}
                type="button"
                className={homeStyles.menuItem}
                onClick={() => {
                  closeMenu();
                  router.push(href);
                }}
              >
                <img src={icon} alt="" className={homeStyles.menuIcon} />
                <span>{label}</span>
              </button>
            ))}
            <button
              type="button"
              className={homeStyles.menuItem}
              onClick={() => {
                toggleMuted();
                closeMenu();
              }}
            >
              <img
                src={muted ? "/mute.svg" : "/sound.svg"}
                alt=""
                className={homeStyles.menuIcon}
              />
              <span>{muted ? "Unmute" : "Mute"}</span>
            </button>
          </nav>
        </div>
        {menuOpen ? (
          <button
            type="button"
            className={homeStyles.menuBackdrop}
            aria-hidden="true"
            onClick={closeMenu}
          />
        ) : null}
      </header>
      <Ticker />

      <section className={styles.shell} aria-label="Frog profile">
        {!hasAccount ? (
          <section className={styles.connectState}>
            <div className={styles.connectArtwork} aria-hidden="true">
              <video src="/sticker/LFG.webm" autoPlay loop muted playsInline />
            </div>
            <div className={styles.connectCopy}>
              <p className={styles.eyebrow}>Player login</p>
              <h1>One Privy wallet, on web and Telegram.</h1>
              <p className={styles.bodyCopy}>
                Continue with the Telegram account you used in Ribbot to
                recover its existing wallet. New users can sign up here, then
                explicitly create a Solana wallet.
              </p>
              <div className={styles.connectActions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => login({ loginMethods: ["telegram"] })}
                  disabled={!privyReady}
                >
                  {privyReady ? "Continue with Telegram" : "Loading account"}
                </button>
                <WalletButton className={styles.secondaryButton} />
              </div>
              <span className={styles.pressStart} aria-hidden="true">
                ▶ Press start to enter the pond
              </span>
            </div>
          </section>
        ) : authenticated && !walletAddress ? (
          <>
            {accountConsole}
            <section className={styles.emptyProfileState}>
              <img src="/sbficon.png" alt="" className={styles.emptyMascot} />
              <div>
                <p className={styles.eyebrow}>Account ready</p>
                <h1>No Solana wallet is linked.</h1>
                <p>
                  Recover an existing bot wallet by signing in with the same
                  Telegram account. Create a wallet only for a genuinely new
                  account.
                </p>
              </div>
            </section>
          </>
        ) : fetchState === "loading" && !profileData ? (
          <>
            {accountConsole}
            <section className={styles.loadingState} aria-live="polite">
              <div className={`${styles.skeleton} ${styles.skeletonAvatar}`} />
              <div className={styles.loadingLines}>
                <div className={`${styles.skeleton} ${styles.skeletonLabel}`} />
                <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
                <div className={`${styles.skeleton} ${styles.skeletonBody}`} />
              </div>
              <span>Syncing wallet profile</span>
            </section>
            {nftHoldingsSection}
          </>
        ) : fetchState === "error" && !profileData ? (
          <>
            <section className={styles.emptyProfileState}>
              <video
                src="/sticker/cry.webm"
                className={styles.emptyMascot}
                autoPlay
                loop
                muted
                playsInline
                aria-hidden="true"
              />
              <div>
                <p className={styles.eyebrow}>Social profile sync paused</p>
                <h1>Your wallet is connected.</h1>
                <p>
                  Your Privy account and wallet remain available. Frog profile
                  data could not be synced from Tapestry right now.
                </p>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={refreshProfile}
                >
                  Retry social sync
                </button>
              </div>
            </section>
            {nftHoldingsSection}
            {accountConsole}
          </>
        ) : !profileData ? (
          <>
            <section className={styles.emptyProfileState}>
              <img src="/sbficon.png" alt="" className={styles.emptyMascot} />
              <div>
                <p className={styles.eyebrow}>Wallet connected</p>
                <h1>Create your Frog profile.</h1>
                <p>
                  Start with a wallet-derived handle. Your owned NFTs can
                  become the profile picture after creation.
                </p>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void handleCreateProfile()}
                  disabled={profileSaving}
                >
                  {profileSaving ? "Creating profile" : "Create profile"}
                </button>
                {errorMessage ? (
                  <div className={styles.inlineError} role="alert">
                    <span>{errorMessage}</span>
                  </div>
                ) : null}
              </div>
            </section>
            {nftHoldingsSection}
            {accountConsole}
          </>
        ) : (
          <>
            <section className={styles.hero} aria-label="Player card">
              <button
                type="button"
                className={styles.avatarButton}
                onClick={() => allNfts.length && setSelectingPfp(true)}
                disabled={!allNfts.length}
                aria-label="Choose a profile frog"
                title={
                  allNfts.length ? "Choose a profile frog" : "No frogs available"
                }
              >
                <img
                  src={avatarUrl}
                  alt={`${displayUsername} profile`}
                  referrerPolicy="no-referrer"
                />
                {allNfts.length ? <span>Change</span> : null}
              </button>

              <div className={styles.identity}>
                <p className={styles.eyebrow}>Player profile</p>
                <div className={styles.identityTopRow}>
                  <h1 className={styles.username}>{displayUsername}</h1>
                  {fetchState === "loading" ? (
                    <span className={styles.syncStatusBusy}>Syncing</span>
                  ) : (
                    <span className={styles.syncStatus}>Synced</span>
                  )}
                </div>
                <p className={styles.bio}>{displayBio}</p>
                <div className={styles.chipRow}>
                  <button
                    type="button"
                    className={styles.chipButton}
                    onClick={() => void handleCopyWallet(walletAddress)}
                    title={walletAddress}
                  >
                    <span className={styles.chipLabel}>Wallet</span>
                    {copiedAddress === walletAddress
                      ? "Copied!"
                      : formatShortAddress(walletAddress)}
                  </button>
                  <span className={styles.chip}>
                    <span className={styles.chipLabel}>Joined</span>
                    {formatProfileDate(profileRecord?.createdAt)}
                  </span>
                  {telegramAccount?.username ? (
                    <span className={styles.chip}>
                      <span className={styles.chipLabel}>TG</span>@
                      {telegramAccount.username}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className={styles.heroActions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => router.push("/")}
                >
                  <img src="/swap.svg" alt="" />
                  Trade
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setSelectingPfp(true)}
                  disabled={!allNfts.length}
                >
                  <img src="/pencil.svg" alt="" />
                  Profile frog
                </button>
              </div>
            </section>

            <dl className={styles.hud}>
              <div className={styles.hudTile}>
                <dt>
                  <img src="/sbficon.png" alt="" />
                  Frogs
                </dt>
                <dd>{totalNfts.toLocaleString()}</dd>
              </div>
              <div className={styles.hudTile}>
                <dt>
                  <img src="/chat.svg" alt="" />
                  Followers
                </dt>
                <dd>{followerTotal.toLocaleString()}</dd>
              </div>
              <div className={styles.hudTile}>
                <dt>
                  <img src="/sparkle.svg" alt="" />
                  Following
                </dt>
                <dd>{followingTotal.toLocaleString()}</dd>
              </div>
              <div className={styles.hudTile}>
                <dt>
                  <img src="/swap.svg" alt="" />
                  Recent trades
                </dt>
                <dd>{recentTradeCount.toLocaleString()}</dd>
              </div>
            </dl>

            {errorMessage ? (
              <div className={styles.inlineError} role="status">
                <span>{errorMessage}</span>
                <button type="button" onClick={refreshProfile}>
                  Retry
                </button>
              </div>
            ) : null}

            <div className={styles.workspace}>
              <div className={styles.mainColumn}>
                {nftHoldingsSection}

                <section className={styles.tradeSection} aria-label="Trade log">
                  <div className={styles.sectionHeader}>
                    <div>
                      <p className={styles.eyebrow}>Quest log</p>
                      <h2>Trade log</h2>
                    </div>
                    <span className={styles.sectionCount}>
                      {recentTradeCount
                        ? `${recentTradeCount} logged`
                        : "0 logged"}
                    </span>
                  </div>
                  {tradeHistory.length ? (
                    <ol className={styles.tradeList}>
                      {tradeHistory.slice(0, 8).map((trade) => {
                        const chip = tradeChip(trade);
                        const rowClass =
                          chip.tone === "buy"
                            ? styles.tradeRowBuy
                            : chip.tone === "sell"
                              ? styles.tradeRowSell
                              : styles.tradeRowSwap;
                        const chipClass =
                          chip.tone === "buy"
                            ? styles.tradeChipBuy
                            : chip.tone === "sell"
                              ? styles.tradeChipSell
                              : styles.tradeChipSwap;
                        const timestamp = normalizeEpochMilliseconds(
                          trade.timestamp,
                        );
                        const usd =
                          trade.outputValueUSD ?? trade.inputValueUSD ?? null;
                        const usdLabel =
                          usd !== null ? formatUsd(usd) : null;
                        return (
                          <li
                            key={`${trade.transactionSignature}-${trade.id}`}
                            className={rowClass}
                          >
                            <span className={chipClass}>{chip.label}</span>
                            <div className={styles.tradeDetail}>
                              <span className={styles.tradePair}>
                                {shortMint(trade.inputMint)} →{" "}
                                {shortMint(trade.outputMint)}
                              </span>
                              <span className={styles.tradeAmounts}>
                                {formatTokenAmount(trade.inputAmount)} →{" "}
                                {formatTokenAmount(trade.outputAmount)}
                              </span>
                            </div>
                            <div className={styles.tradeSide}>
                              {usdLabel ? (
                                <span className={styles.tradeUsd}>
                                  {usdLabel}
                                </span>
                              ) : null}
                              <time
                                className={styles.tradeTime}
                                dateTime={new Date(timestamp).toISOString()}
                              >
                                {timeAgo(timestamp)}
                              </time>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className={styles.logEmpty}>
                      No trades recorded yet. Hit the swap terminal to start
                      your quest log.
                    </p>
                  )}
                </section>
              </div>

              <aside className={styles.sideRail}>
                {tokenSummary.length ? (
                  <section
                    className={styles.railSection}
                    aria-label="Token summary"
                  >
                    <div className={styles.railHeading}>
                      <h2>Token bag</h2>
                    </div>
                    <ul className={styles.tokenList}>
                      {tokenSummary.slice(0, 6).map((token) => {
                        const valueClass =
                          token.direction === "positive"
                            ? styles.tokenValuePositive
                            : token.direction === "negative"
                              ? styles.tokenValueNegative
                              : styles.tokenValueNeutral;
                        const usdLabel = formatUsd(token.netUsd);
                        return (
                          <li key={token.mint} className={styles.tokenRow}>
                            <span className={styles.tokenLogo}>
                              {token.logoURI ? (
                                <img
                                  src={token.logoURI}
                                  alt=""
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                initialsFor(token.symbol ?? token.mint)
                              )}
                            </span>
                            <span className={styles.tokenName}>
                              <strong>
                                {token.symbol ?? shortMint(token.mint)}
                              </strong>
                              <span>
                                {formatTokenAmount(token.netAmount)} net
                              </span>
                            </span>
                            <span className={valueClass}>
                              {token.direction === "positive"
                                ? "▲ "
                                : token.direction === "negative"
                                  ? "▼ "
                                  : ""}
                              {usdLabel ?? "—"}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ) : null}

                <section className={styles.railSection} aria-label="Party">
                  <div className={styles.railHeading}>
                    <h2>Party</h2>
                  </div>
                  <div className={styles.partyGroup}>
                    <span className={styles.partyLabel}>
                      Latest followers <b>{followerTotal.toLocaleString()}</b>
                    </span>
                    {followerProfiles.length ? (
                      <div className={styles.partyStrip}>
                        {followerProfiles.slice(0, 8).map((member) => (
                          <span
                            key={member.id}
                            className={styles.partyAvatar}
                            title={member.username}
                          >
                            {member.image ? (
                              <img
                                src={member.image}
                                alt={member.username}
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              initialsFor(member.username)
                            )}
                          </span>
                        ))}
                        {followerTotal > 8 ? (
                          <span className={styles.partyMore}>
                            +{Math.min(followerTotal - 8, 99)}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <p className={styles.logEmpty}>No followers yet.</p>
                    )}
                  </div>
                  <div className={styles.partyGroup}>
                    <span className={styles.partyLabel}>
                      Recently followed <b>{followingTotal.toLocaleString()}</b>
                    </span>
                    {followingProfiles.length ? (
                      <div className={styles.partyStrip}>
                        {followingProfiles.slice(0, 8).map((member) => (
                          <span
                            key={member.id}
                            className={styles.partyAvatar}
                            title={member.username}
                          >
                            {member.image ? (
                              <img
                                src={member.image}
                                alt={member.username}
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              initialsFor(member.username)
                            )}
                          </span>
                        ))}
                        {followingTotal > 8 ? (
                          <span className={styles.partyMore}>
                            +{Math.min(followingTotal - 8, 99)}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <p className={styles.logEmpty}>
                        Not following anyone yet.
                      </p>
                    )}
                  </div>
                </section>

                <section className={styles.railSection} aria-label="Activity">
                  <div className={styles.railHeading}>
                    <h2>Guild log</h2>
                    <button
                      type="button"
                      className={styles.ghostButton}
                      onClick={refreshProfile}
                      title="Refresh profile"
                    >
                      Refresh
                    </button>
                  </div>
                  {activityFeed.length ? (
                    <ol className={styles.guildList}>
                      {activityFeed.slice(0, 6).map((item, index) => {
                        const timestamp = normalizeEpochMilliseconds(
                          item.timestamp,
                        );
                        return (
                          <li key={`${item.type}-${item.timestamp}-${index}`}>
                            <span
                              className={styles.guildDot}
                              aria-hidden="true"
                            />
                            <div className={styles.guildBody}>
                              <strong>{activityLabel(item.type)}</strong>
                              <p>{item.activity}</p>
                            </div>
                            <time
                              dateTime={new Date(timestamp).toISOString()}
                            >
                              {timeAgo(timestamp)}
                            </time>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className={styles.logEmpty}>
                      No recent social activity.
                    </p>
                  )}
                </section>

                <section
                  className={styles.railSection}
                  aria-label="Achievements"
                >
                  <div className={styles.railHeading}>
                    <h2>Achievements</h2>
                  </div>
                  <ul className={styles.milestoneList}>
                    {milestones.map((milestone) => (
                      <li
                        key={milestone.id}
                        className={
                          milestone.earned ? styles.milestoneEarned : ""
                        }
                      >
                        <img src={milestone.icon} alt="" />
                        <div>
                          <strong>{milestone.label}</strong>
                          <span>{milestone.progress}</span>
                        </div>
                        <small>{milestone.earned ? "Earned" : "Locked"}</small>
                      </li>
                    ))}
                  </ul>
                </section>
              </aside>
            </div>

            {accountConsole}
          </>
        )}
      </section>

      {selectingPfp ? (
        <div
          className={styles.pfpOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectingPfp(false);
          }}
        >
          <div
            className={styles.pfpDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pfp-title"
          >
            <div className={styles.dialogHeader}>
              <div>
                <p className={styles.eyebrow}>Wallet collection</p>
                <h2 id="pfp-title">Choose your fighter</h2>
              </div>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setSelectingPfp(false)}
                aria-label="Close profile frog picker"
                title="Close"
              >
                &times;
              </button>
            </div>
            {pfpError ? <p className={styles.dialogError}>{pfpError}</p> : null}
            <div className={styles.pfpGrid}>
              {allNfts.map((nft) => {
                const label = nftLabel(nft);
                const isCurrent = pfpMint === nft.mint;
                return (
                  <button
                    key={nft.mint}
                    type="button"
                    className={
                      isCurrent ? styles.pfpChoiceActive : styles.pfpChoice
                    }
                    onClick={() => void handleSelectPfp(nft.mint, nft.image)}
                    disabled={pfpSaving}
                  >
                    <span className={styles.pfpImage}>
                      {nft.image ? (
                        <img src={nft.image} alt="" referrerPolicy="no-referrer" />
                      ) : (
                        initialsFor(label)
                      )}
                    </span>
                    <span className={styles.pfpChoiceName}>{label}</span>
                    <small className={styles.pfpChoiceState}>
                      {isCurrent ? "Current" : "Select"}
                    </small>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
