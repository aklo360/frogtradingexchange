"use client";

/* eslint-disable @next/next/no-img-element -- NFT metadata image hosts are dynamic. */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";

import { Ticker } from "@/components/Ticker";
import { WalletButton } from "@/components/WalletButton";
import { isV1 } from "@/lib/version";
import {
  DEFAULT_INCLUDE_COMPRESSED,
  DEFAULT_NFT_COLLECTION,
} from "@/lib/tapestry/constants";
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
  return cleaned || "Frog";
};

export default function ProfilePage() {
  const router = useRouter();
  const { muted, toggleMuted } = useAudio();
  const { publicKey, connected } = useWallet();
  const walletAddress = useMemo(
    () => publicKey?.toBase58() ?? "",
    [publicKey],
  );

  const [profileData, setProfileData] = useState<AppProfileResponse | null>(
    null,
  );
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [nftPage, setNftPage] = useState(1);
  const [selectingPfp, setSelectingPfp] = useState(false);
  const [pfpSaving, setPfpSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [pfpError, setPfpError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);

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
          nftPage: "1",
          nftLimit: "1000",
        });
        if (DEFAULT_NFT_COLLECTION) {
          query.set("nftCollection", DEFAULT_NFT_COLLECTION);
        }
        if (DEFAULT_INCLUDE_COMPRESSED) query.set("nftMode", "all");

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

  const refreshProfile = () => setRequestVersion((version) => version + 1);

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
        const text = await response.text();
        throw new Error(text || "Profile creation failed");
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
        const text = await response.text();
        throw new Error(text || `Failed with status ${response.status}`);
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
  const allNfts = profileData?.nfts?.items ?? [];
  const totalFrogs = Math.max(profileData?.nfts?.total ?? 0, allNfts.length);
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
    frogCount: totalFrogs,
    followerCount: followerTotal,
    recentTradeCount,
  });

  const nftTotalPages = Math.max(
    1,
    Math.ceil(Math.max(totalFrogs, 1) / PROFILE_NFT_PAGE_SIZE),
  );
  const hasPrevNfts = nftPage > 1;
  const hasNextNfts = nftPage < nftTotalPages;
  const currentStart = totalFrogs
    ? (nftPage - 1) * PROFILE_NFT_PAGE_SIZE + 1
    : 0;
  const currentEnd = Math.min(
    nftPage * PROFILE_NFT_PAGE_SIZE,
    totalFrogs || allNfts.length,
  );
  const pagedNfts = allNfts.slice(
    (nftPage - 1) * PROFILE_NFT_PAGE_SIZE,
    nftPage * PROFILE_NFT_PAGE_SIZE,
  );

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
              ["/perps", "/sparkle.svg", "PERPS"],
              ["/ribbot", "/chat.svg", "RIBBOT"],
              ["/airdrop", "/sparkle.svg", "AIRDROP"],
              ["/profile", "/bank.svg", "PROFILE"],
              ["/leaderboard", "/trophy.svg", "LEADERBOARD"],
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
        {!connected || !walletAddress ? (
          <section className={styles.connectState}>
            <div className={styles.connectArtwork} aria-hidden="true">
              <img src="/sbficon.png" alt="" />
            </div>
            <div className={styles.connectCopy}>
              <p className={styles.eyebrow}>Frog profile</p>
              <h1>Your wallet is your identity.</h1>
              <p>
                Connect a Solana wallet to load your profile, frogs, milestones,
                and recent exchange activity.
              </p>
              <WalletButton className={styles.primaryButton} />
            </div>
          </section>
        ) : fetchState === "loading" && !profileData ? (
          <section className={styles.loadingState} aria-live="polite">
            <div className={`${styles.skeleton} ${styles.skeletonAvatar}`} />
            <div className={styles.loadingLines}>
              <div className={`${styles.skeleton} ${styles.skeletonLabel}`} />
              <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
              <div className={`${styles.skeleton} ${styles.skeletonBody}`} />
            </div>
            <span>Syncing wallet profile</span>
          </section>
        ) : fetchState === "error" && !profileData ? (
          <section className={styles.emptyProfileState}>
            <img src="/sbficon.png" alt="" className={styles.emptyMascot} />
            <div>
              <p className={styles.eyebrow}>Sync interrupted</p>
              <h1>Profile data is unavailable.</h1>
              <p>{errorMessage}</p>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={refreshProfile}
              >
                Retry sync
              </button>
            </div>
          </section>
        ) : !profileData ? (
          <section className={styles.emptyProfileState}>
            <img src="/sbficon.png" alt="" className={styles.emptyMascot} />
            <div>
              <p className={styles.eyebrow}>Wallet connected</p>
              <h1>Create your Frog profile.</h1>
              <p>
                Start with a wallet-derived handle. Your owned frogs can become
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
            </div>
          </section>
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
                <dt>Frogs</dt>
                <dd>{totalFrogs.toLocaleString()}</dd>
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
              <section className={styles.collectionSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.eyebrow}>Wallet collection</p>
                    <h2>Solana Business Frogs</h2>
                  </div>
                  {nftTotalPages > 1 ? (
                    <div className={styles.pagination}>
                      <span>
                        {currentStart}-{currentEnd} of {totalFrogs}
                      </span>
                      <button
                        type="button"
                        onClick={() => setNftPage((page) => Math.max(1, page - 1))}
                        disabled={!hasPrevNfts}
                        aria-label="Previous frogs"
                        title="Previous frogs"
                      >
                        &lsaquo;
                      </button>
                      <button
                        type="button"
                        onClick={() => setNftPage((page) => Math.min(nftTotalPages, page + 1))}
                        disabled={!hasNextNfts}
                        aria-label="Next frogs"
                        title="Next frogs"
                      >
                        &rsaquo;
                      </button>
                    </div>
                  ) : (
                    <span className={styles.sectionCount}>{totalFrogs} total</span>
                  )}
                </div>

                {pagedNfts.length ? (
                  <div className={styles.nftGrid}>
                    {pagedNfts.map((nft) => {
                      const number = extractNftNumber(nft.name, nft.collection);
                      const name = cleanNftName(nft.name, number);
                      const label = number ? `${name} #${number}` : name;
                      const isCurrent = pfpMint === nft.id;
                      return (
                        <article key={nft.id} className={styles.nftCard}>
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
                            <strong>{label}</strong>
                            <button
                              type="button"
                              onClick={() => void handleSelectPfp(nft.id, nft.image)}
                              disabled={isCurrent || pfpSaving}
                            >
                              {isCurrent ? "Current frog" : "Set as profile"}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.collectionEmpty}>
                    <img src="/sbficon.png" alt="" />
                    <div>
                      <h3>No frogs in this wallet</h3>
                      <p>Your collection will appear here after the next profile sync.</p>
                    </div>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={refreshProfile}
                    >
                      Refresh
                    </button>
                  </div>
                )}
              </section>

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
                    <button type="button" onClick={() => router.push("/leaderboard")}>Rankings</button>
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
                const isCurrent = pfpMint === nft.id;
                return (
                  <button
                    key={nft.id}
                    type="button"
                    className={isCurrent ? styles.pfpChoiceActive : styles.pfpChoice}
                    onClick={() => void handleSelectPfp(nft.id, nft.image)}
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
