"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { WalletButton } from "@/components/WalletButton";
import { Ticker } from "@/components/Ticker";
import { useAudio } from "@/providers/AudioProvider";
import { useWallet } from "@solana/wallet-adapter-react";
import type { AppProfileResponse } from "@/lib/tapestry/types";
import {
  DEFAULT_INCLUDE_COMPRESSED,
  DEFAULT_NFT_COLLECTION,
} from "@/lib/tapestry/constants";
import homeStyles from "../page.module.css";
import styles from "./profile.module.css";

type FetchState = "idle" | "loading" | "error";

const NFT_PAGE_SIZE = 8;

const deriveDefaultUsername = (address: string) =>
  `frog-${address.slice(0, 4)}${address.slice(-2)}`.toLowerCase();

const profileCache = new Map<string, AppProfileResponse>();

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

  const toggleMenu = () => setMenuOpen((open) => !open);
  const closeMenu = () => setMenuOpen(false);
  const handleToggleMute = () => {
    toggleMuted();
  };

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    setNftPage(1);
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress) {
      setProfileData(null);
      setFetchState("idle");
      setErrorMessage(null);
      return;
    }

    // Serve from cache immediately
    const cached = profileCache.get(walletAddress);
    if (cached) {
      setProfileData(cached);
    }

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
        if (DEFAULT_INCLUDE_COMPRESSED) {
          query.set("nftMode", "all");
        }
        const response = await fetch(
          `/api/tapestry/profiles?${query.toString()}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (response.status === 404) {
          if (canceled) return;
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
        if (controller.signal.aborted) return;
        console.error("Error loading Tapestry profile", error);
        if (!canceled) {
          setFetchState("error");
          setErrorMessage("Unable to load your profile right now.");
        }
      }
    };

    loadProfile();

    return () => {
      canceled = true;
      controller.abort();
    };
  }, [walletAddress]);

  const followerTotal =
    profileData?.followers?.total ?? profileData?.socialCounts.followers ?? 0;
  const followingTotal =
    profileData?.following?.total ?? profileData?.socialCounts.following ?? 0;
  const profileRecord = profileData?.profile;
  const displayUsername =
    profileRecord?.username ??
    (walletAddress ? deriveDefaultUsername(walletAddress) : "Your frog handle");
  const displayBio =
    profileRecord?.bio ??
    "Add a bio to share your frog lore and trading style.";
  const avatarUrl = profileRecord?.image ?? null;
  const allNfts = profileData?.nfts?.items ?? [];
  const totalFrogs = Math.min(profileData?.nfts?.total ?? allNfts.length, 999);
  const nftCurrentPage = nftPage;
  const nftTotalPages = Math.max(1, Math.ceil(Math.max(totalFrogs, 1) / NFT_PAGE_SIZE));
  const hasPrevNfts = nftCurrentPage > 1;
  const hasNextNfts = nftCurrentPage < nftTotalPages;
  const currentStart = (nftCurrentPage - 1) * NFT_PAGE_SIZE + 1;
  const currentEnd = Math.min(nftCurrentPage * NFT_PAGE_SIZE, totalFrogs || allNfts.length);
  const pagedNfts = allNfts.slice(
    (nftCurrentPage - 1) * NFT_PAGE_SIZE,
    nftCurrentPage * NFT_PAGE_SIZE,
  );

  const handlePrevNfts = () => {
    if (hasPrevNfts) {
      setNftPage((prev) => Math.max(1, prev - 1));
    }
  };

  const handleNextNfts = () => {
    if (hasNextNfts) {
      setNftPage((prev) => prev + 1);
    }
  };

  const handleFirstNfts = () => {
    if (nftCurrentPage !== 1) {
      setNftPage(1);
    }
  };

  const handleLastNfts = () => {
    if (nftCurrentPage !== nftTotalPages) {
      setNftPage(nftTotalPages);
    }
  };

  const initialsFor = (value: string) =>
    value.trim().slice(0, 2).toUpperCase() || "??";

  const formatAddress = (address: string) =>
    `${address.slice(0, 4)}…${address.slice(-4)}`;

  const points =
    Math.max(
      0,
      Math.round(
        (profileData?.tokenSummary ?? []).reduce((sum, token) => {
          const usd = Number(token.netUsd ?? 0);
          return Number.isFinite(usd) ? sum + usd : sum;
        }, 0) * 100,
      ),
    ) || followerTotal * 10;
  const leaderboardRank =
    points > 0 ? Math.max(1, 999 - Math.min(points, 900)) : null;

  const badgeDeck = [
    { icon: "/badge-hotshot.svg", label: "Hotshot" },
    { icon: "/badge-samurai.svg", label: "Samurai" },
    { icon: "/badge-trailblazer.svg", label: "Trailblazer" },
  ];

  const extractNftNumber = (name: string, collection?: string | null) => {
    const fromName = name.match(/(\d+)/g);
    if (fromName && fromName.length) {
      return fromName[fromName.length - 1];
    }
    if (collection) {
      const fromCollection = collection.match(/(\d+)/g);
      if (fromCollection && fromCollection.length) {
        return fromCollection[fromCollection.length - 1];
      }
    }
    return null;
  };

  const cleanNftName = (raw: string, number: string | null) => {
    let cleaned = raw.replace(/solana business frogs?/gi, "");
    if (number) {
      const numberPattern = new RegExp(`#?${number}`, "gi");
      cleaned = cleaned.replace(numberPattern, "");
    }
    cleaned = cleaned.replace(/#?\d+/g, "");
    cleaned = cleaned.replace(/\s+/g, " ").trim();
    if (cleaned.length === 0) {
      return "Frog";
    }
    return cleaned;
  };

  return (
    <main className={homeStyles.main}>
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
                  loading="lazy"
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
          {connected ? (
            <div className={homeStyles.xpChip} aria-label="Your XP">
              <span className={homeStyles.xpValue}>4,269 XP</span>
              <img src="/sparkle.svg" alt="" className={homeStyles.sparkleIcon} />
            </div>
          ) : null}
          <button
            type="button"
            className={homeStyles.menuButton}
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            onClick={toggleMenu}
          >
            <img src="/wallet.svg" alt="" className={homeStyles.menuButtonIcon} />
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
            {connected ? (
              <button
                type="button"
                className={homeStyles.menuItem}
                onClick={() => {
                  closeMenu();
                  router.push("/profile");
                }}
              >
                <img src="/bank.svg" alt="" className={homeStyles.menuIcon} />
                <span>PROFILE</span>
              </button>
            ) : null}
            <button
              type="button"
              className={homeStyles.menuItem}
              onClick={() => {
                closeMenu();
                router.push("/leaderboard");
              }}
            >
              <img
                src="/trophy.svg"
                alt=""
                className={`${homeStyles.menuIcon} ${homeStyles.pixelIcon} ${homeStyles.trophyIcon}`}
              />
              <span>LEADERBOARD</span>
            </button>
            <button
              type="button"
              className={homeStyles.menuItem}
              onClick={() => {
                handleToggleMute();
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
            <button type="button" className={homeStyles.menuItem} onClick={closeMenu}>
              <img src="/info.svg" alt="" className={homeStyles.menuIcon} />
              <span>Help</span>
            </button>
            <button type="button" className={homeStyles.menuItem} onClick={closeMenu}>
              <img src="/chat.svg" alt="" className={homeStyles.menuIcon} />
              <span>Chat</span>
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

      <section className={styles.content}>
        <div className={styles.heroCard}>
          <div className={styles.avatarWrap}>
            {avatarUrl ? (
              <div
                className={styles.avatarImage}
                style={{ backgroundImage: `url(${avatarUrl})` }}
                aria-label="Profile avatar"
              />
            ) : (
              <div className={styles.avatarFallback}>{initialsFor(displayUsername)}</div>
            )}
          </div>
          <div className={styles.heroMeta}>
            <p className={styles.eyebrow}>FROG SOCIAL PROFILE</p>
            <h1 className={styles.title}>{displayUsername}</h1>
            <p className={styles.bio}>{displayBio}</p>
            <div className={styles.statRow}>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Followers</span>
                <span className={styles.statValue}>{followerTotal.toLocaleString()}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Following</span>
                <span className={styles.statValue}>{followingTotal.toLocaleString()}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Frogs held</span>
                <span className={styles.statValue}>{totalFrogs.toLocaleString()}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Points</span>
                <span className={styles.statValue}>{points.toLocaleString()}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Leaderboard</span>
                <span className={styles.statValue}>
                  {leaderboardRank ? `#${leaderboardRank}` : "—"}
                </span>
              </div>
            </div>
            {walletAddress ? (
              <p className={styles.walletTag}>Wallet: {formatAddress(walletAddress)}</p>
            ) : null}
          </div>
        </div>

        <div className={styles.badgePanel}>
          <div className={styles.panelHeader}>
            <h2>Badges</h2>
            <span className={styles.panelHint}>Earned across your adventures</span>
          </div>
          <div className={styles.badgeCarousel} role="list">
            {badgeDeck.map((badge) => (
              <div key={badge.label} className={styles.badge} role="listitem">
                <img src={badge.icon} alt="" className={styles.badgeIcon} />
                <span>{badge.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Solana Business Frogs</h2>
            {nftTotalPages > 1 ? (
              <div className={styles.pagination}>
                <button
                  type="button"
                  onClick={handleFirstNfts}
                  disabled={!hasPrevNfts || fetchState === "loading"}
                >
                  First
                </button>
                <button
                  type="button"
                  onClick={handlePrevNfts}
                  disabled={!hasPrevNfts || fetchState === "loading"}
                >
                  Prev
                </button>
                <span className={styles.paginationLabel}>
                  Page {nftCurrentPage} / {nftTotalPages} · {currentStart}–{currentEnd} of{" "}
                  {totalFrogs}
                </span>
                <button
                  type="button"
                  onClick={handleNextNfts}
                  disabled={!hasNextNfts || fetchState === "loading"}
                >
                  Next
                </button>
                <button
                  type="button"
                  onClick={handleLastNfts}
                  disabled={!hasNextNfts || fetchState === "loading"}
                >
                  Last
                </button>
              </div>
            ) : null}
          </div>
          {pagedNfts.length ? (
            <div className={styles.nftGrid}>
              {pagedNfts.map((nft) => {
                const num = extractNftNumber(nft.name, nft.collection);
                const displayName = cleanNftName(nft.name, num);
                const label = num ? `${displayName} #${num}` : displayName;
                return (
                  <div key={nft.id} className={styles.nftCard}>
                    <div className={styles.nftImageWrap}>
                      {nft.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={nft.image}
                          alt={label}
                          className={styles.nftImage}
                          loading="lazy"
                        />
                      ) : (
                        <div className={styles.nftPlaceholder}>{initialsFor(label)}</div>
                      )}
                    </div>
                    <div className={styles.nftMeta}>
                      <p className={styles.nftName}>{label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className={styles.emptyState}>
              No NFTs found yet. Mint or collect to show them off here.
            </p>
          )}
        </div>

        {!connected ? (
          <div className={styles.overlayMessage}>
            <p>Connect a wallet to personalize your Frog Social profile.</p>
          </div>
        ) : fetchState === "loading" && !profileData ? (
          <div className={styles.overlayMessage}>
            <p>Fetching your Tapestry profile…</p>
          </div>
        ) : null}

        {errorMessage ? <p className={styles.errorBanner}>{errorMessage}</p> : null}
      </section>
    </main>
  );
}
