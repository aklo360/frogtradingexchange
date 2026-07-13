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
import { getPrivySolanaWallets, getTelegramAccount } from "@/lib/privy";
import { isV1 } from "@/lib/version";
import type { AppProfileResponse } from "@/lib/tapestry/types";
import { useAudio } from "@/providers/AudioProvider";
import homeStyles from "../page.module.css";
import styles from "./profile.module.css";
import {
  PROFILE_NFT_PAGE_SIZE,
  buildProfileMilestones,
  buildProfileTimeline,
  deriveDefaultUsername,
  formatShortAddress,
  normalizeEpochMilliseconds,
} from "./profileView";

type FetchState = "idle" | "loading" | "error";

const profileCache = new Map<string, AppProfileResponse>();

const readResponseError = async (response: Response, fallback: string) => {
  const text = await response.text();
  if (!text) return fallback;
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

const formatActivityDate = (value: number) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));

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
  onSelectPfp,
}: NftHoldingsSectionProps) {
  const currentStart = total ? (page - 1) * PROFILE_NFT_PAGE_SIZE + 1 : 0;
  const currentEnd = Math.min(page * PROFILE_NFT_PAGE_SIZE, total);

  return (
    <section className={styles.collectionSection} aria-label="NFT holdings">
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>Active wallet</p>
          <h2>NFT holdings</h2>
        </div>
        {totalPages > 1 ? (
          <div className={styles.pagination}>
            <span>
              {currentStart}-{currentEnd} of {total}
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
            {state === "loading" && !items.length ? "Loading" : `${total} total`}
          </span>
        )}
      </div>

      {items.length ? (
        <div className={styles.nftGrid} aria-busy={state === "loading"}>
          {items.map((nft) => {
            const number = extractNftNumber(nft.name, nft.collection);
            const name = cleanNftName(nft.name, number);
            const label = number ? `${name} #${number}` : name;
            const isCurrent = pfpMint === nft.mint;
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
                    <span>{initialsFor(label)}</span>
                  )}
                  {isCurrent ? (
                    <span className={styles.currentMarker}>Profile</span>
                  ) : null}
                </div>
                <div className={styles.nftMeta}>
                  <strong title={nft.name}>{label}</strong>
                  {onSelectPfp ? (
                    <button
                      type="button"
                      onClick={() => onSelectPfp(nft.mint, nft.image)}
                      disabled={isCurrent || pfpSaving}
                    >
                      {isCurrent ? "Current profile" : "Set as profile"}
                    </button>
                  ) : (
                    <span className={styles.nftMint} title={nft.mint}>
                      {formatShortAddress(nft.mint)}
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
          <img src="/sbficon.png" alt="" />
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
            <h3>No NFTs in this wallet</h3>
            <p>This active wallet does not currently hold any NFTs.</p>
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
  const [createdWalletAddress, setCreatedWalletAddress] = useState<string | null>(
    null,
  );
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
    return wallets;
  }, [createdWalletAddress, user?.linkedAccounts]);
  const telegramAccount = useMemo(
    () => getTelegramAccount(user?.linkedAccounts),
    [user?.linkedAccounts],
  );
  const primaryPrivyWallet = privyWallets[0];
  const walletAddress = useMemo(
    () => primaryPrivyWallet?.address ?? publicKey?.toBase58() ?? "",
    [primaryPrivyWallet?.address, publicKey],
  );
  const hasAccount = authenticated || connected;

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
  }, [walletAddress]);

  useEffect(() => {
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
  }, [requestVersion, walletAddress]);

  useEffect(() => {
    if (!walletAddress) {
      setNftData(null);
      setNftFetchState("idle");
      setNftError(null);
      return;
    }

    const controller = new AbortController();
    let canceled = false;

    const loadNfts = async () => {
      setNftFetchState("loading");
      setNftError(null);

      try {
        const query = new URLSearchParams({
          walletAddress,
          page: String(nftPage),
          limit: String(PROFILE_NFT_PAGE_SIZE),
        });
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
  }, [nftPage, nftRequestVersion, walletAddress]);

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
  const recentTradeCount = profileData?.tradeHistory?.length ?? 0;
  const pfpMint = profileData?.pfpMint ?? null;
  const avatarUrl =
    profileData?.pfpImage ?? profileRecord?.image ?? "/sbficon.png";
  const displayUsername =
    profileRecord?.username ??
    (walletAddress ? deriveDefaultUsername(walletAddress) : "Frog profile");
  const displayBio = profileRecord?.bio?.trim() || "No bio added yet.";
  const timeline = profileData ? buildProfileTimeline(profileData) : [];
  const milestones = buildProfileMilestones({
    nftCount: totalNfts,
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
      onSelectPfp={
        profileData
          ? (mint, image) => void handleSelectPfp(mint, image)
          : undefined
      }
    />
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
            {[
              ["/profile", "/bank.svg", "PROFILE"],
            ].map(([href, icon, label]) => (
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
        {authenticated ? (
          <section className={styles.accountBand} aria-label="Privy account">
            <div className={styles.accountHeading}>
              <div>
                <p className={styles.eyebrow}>FTX account</p>
                <h1>
                  {telegramAccount?.username
                    ? `@${telegramAccount.username}`
                    : telegramAccount?.firstName ?? "Privy account"}
                </h1>
              </div>
              <span className={styles.privyStatus}>Privy secured</span>
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
                      className={styles.secondaryButton}
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
        ) : null}

        {!hasAccount ? (
          <section className={styles.connectState}>
            <div className={styles.connectArtwork} aria-hidden="true">
              <img src="/sbficon.png" alt="" />
            </div>
            <div className={styles.connectCopy}>
              <p className={styles.eyebrow}>Recover or create account</p>
              <h1>One Privy wallet, on web and Telegram.</h1>
              <p>
                Continue with the Telegram account you used in Ribbot to recover
                its existing wallet. New users can sign up here, then explicitly
                create a Solana wallet.
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
            </div>
          </section>
        ) : authenticated && !walletAddress ? (
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
        ) : fetchState === "loading" && !profileData ? (
          <>
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
              <img src="/sbficon.png" alt="" className={styles.emptyMascot} />
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
          </>
        ) : !profileData ? (
          <>
            <section className={styles.emptyProfileState}>
              <img src="/sbficon.png" alt="" className={styles.emptyMascot} />
              <div>
                <p className={styles.eyebrow}>Wallet connected</p>
                <h1>Create your Frog profile.</h1>
                <p>
                  Start with a wallet-derived handle. Your owned NFTs can become
                  the profile picture after creation.
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
          </>
        ) : (
          <>
            <section className={styles.identityBand}>
              <button
                type="button"
                className={styles.avatarButton}
                onClick={() => allNfts.length && setSelectingPfp(true)}
                disabled={!allNfts.length}
                aria-label="Choose a profile frog"
                title={allNfts.length ? "Choose a profile frog" : "No frogs available"}
              >
                <img
                  src={avatarUrl}
                  alt={`${displayUsername} profile`}
                  referrerPolicy="no-referrer"
                />
                {allNfts.length ? <span>Change</span> : null}
              </button>

              <div className={styles.identityCopy}>
                <div className={styles.identityHeading}>
                  <div>
                    <p className={styles.eyebrow}>Frog profile</p>
                    <h1>{displayUsername}</h1>
                  </div>
                  {fetchState === "loading" ? (
                    <span className={styles.syncStatus}>Syncing</span>
                  ) : (
                    <span className={styles.syncStatus}>Synced</span>
                  )}
                </div>
                <p className={styles.bio}>{displayBio}</p>
                <div className={styles.identityMeta}>
                  <span title={walletAddress}>{formatShortAddress(walletAddress)}</span>
                  <span>Joined {formatProfileDate(profileRecord?.createdAt)}</span>
                </div>
              </div>

              <div className={styles.identityActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setSelectingPfp(true)}
                  disabled={!allNfts.length}
                >
                  <img src="/pencil.svg" alt="" />
                  Profile frog
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => router.push("/")}
                >
                  <img src="/swap.svg" alt="" />
                  Trade
                </button>
              </div>
            </section>

            <dl className={styles.metricsBar}>
              <div>
                <dt>NFTs</dt>
                <dd>{totalNfts.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Followers</dt>
                <dd>{followerTotal.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Following</dt>
                <dd>{followingTotal.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Recent trades</dt>
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
              {nftHoldingsSection}

              <aside className={styles.sideRail}>
                <section className={styles.railSection}>
                  <div className={styles.railHeading}>
                    <h2>Recent activity</h2>
                    <button type="button" onClick={refreshProfile} title="Refresh profile">
                      Refresh
                    </button>
                  </div>
                  {timeline.length ? (
                    <ol className={styles.timeline}>
                      {timeline.map((item) => (
                        <li key={item.id}>
                          <span className={styles.timelineDot} aria-hidden="true" />
                          <div>
                            <strong>{item.label}</strong>
                            <p>{item.detail}</p>
                          </div>
                          <time dateTime={new Date(item.timestamp).toISOString()}>
                            {formatActivityDate(item.timestamp)}
                          </time>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className={styles.railEmpty}>No recent profile or trade activity.</p>
                  )}
                </section>

                <section className={styles.railSection}>
                  <div className={styles.railHeading}>
                    <h2>Milestones</h2>
                  </div>
                  <ul className={styles.milestoneList}>
                    {milestones.map((milestone) => (
                      <li
                        key={milestone.id}
                        className={milestone.earned ? styles.milestoneEarned : ""}
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
                <h2 id="pfp-title">Choose your profile frog</h2>
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
                const number = extractNftNumber(nft.name, nft.collection);
                const name = cleanNftName(nft.name, number);
                const label = number ? `${name} #${number}` : name;
                const isCurrent = pfpMint === nft.mint;
                return (
                  <button
                    key={nft.mint}
                    type="button"
                    className={isCurrent ? styles.pfpChoiceActive : styles.pfpChoice}
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
                    <span>{label}</span>
                    <small>{isCurrent ? "Current" : "Select"}</small>
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
