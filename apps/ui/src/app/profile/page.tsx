"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { WalletButton } from "@/components/WalletButton";
import { Ticker } from "@/components/Ticker";
import { DEFAULT_TOKEN_MAP, formatMintAddress } from "@/lib/tokens";
import type {
  ActivityFeedItem,
  ProfileContentItem,
  SocialProfileSummary,
  SwapActivityItem,
  TokenHoldingSummary,
  TradeHistoryEntry,
  TapestryWallet,
} from "@/lib/tapestry/types";
import { useAudio } from "@/providers/AudioProvider";
import { useWallet } from "@solana/wallet-adapter-react";
import type { AppProfileResponse } from "@/lib/tapestry/types";
import {
  DEFAULT_INCLUDE_COMPRESSED,
  DEFAULT_NFT_COLLECTION,
  DEFAULT_NFT_PAGE_SIZE,
} from "@/lib/tapestry/constants";
import homeStyles from "../page.module.css";
import styles from "./profile.module.css";

type FetchState = "idle" | "loading" | "error";

const deriveDefaultUsername = (address: string) =>
  `frog-${address.slice(0, 4)}${address.slice(-2)}`.toLowerCase();

const normalizeTimestamp = (value: number | undefined) => {
  if (!value) return null;
  const isMilliseconds = value > 1_000_000_000_000;
  return new Date(isMilliseconds ? value : value * 1000);
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
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [lastOperation, setLastOperation] = useState<
    "CREATED" | "FOUND" | null
  >(null);
  const [formState, setFormState] = useState({
    username: "",
    bio: "",
    image: "",
  });
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
      setFormState({
        username: "",
        bio: "",
        image: "",
      });
      setFetchState("idle");
      setErrorMessage(null);
      setLastOperation(null);
      return;
    }

    const controller = new AbortController();
    let canceled = false;

    const loadProfile = async () => {
      setFetchState("loading");
      setErrorMessage(null);
      setFeedback(null);

      try {
        const query = new URLSearchParams({
          walletAddress,
          nftPage: String(nftPage),
          nftLimit: String(DEFAULT_NFT_PAGE_SIZE),
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
          setFormState({
            username: deriveDefaultUsername(walletAddress),
            bio: "",
            image: "",
          });
          setLastOperation(null);
          setFetchState("idle");
          return;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || "Failed to load profile");
        }

        const data = (await response.json()) as AppProfileResponse;
        if (canceled) return;

        setProfileData(data);
        setFormState({
          username: data.profile.username,
          bio: data.profile.bio ?? "",
          image: data.profile.image ?? "",
        });
        setLastOperation(data.operation ?? null);
        if (data.nfts?.page && data.nfts.page !== nftPage) {
          setNftPage(data.nfts.page);
        }
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
  }, [walletAddress, nftPage]);

  const handleFieldChange =
    (field: "username" | "bio" | "image") =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { value } = event.target;
      setFormState((current) => ({
        ...current,
        [field]: value,
      }));
      setFeedback(null);
    };

  const resetForm = () => {
    if (profileData) {
      setFormState({
        username: profileData.profile.username,
        bio: profileData.profile.bio ?? "",
        image: profileData.profile.image ?? "",
      });
    } else if (walletAddress) {
      setFormState({
        username: deriveDefaultUsername(walletAddress),
        bio: "",
        image: "",
      });
    } else {
      setFormState({
        username: "",
        bio: "",
        image: "",
      });
    }
    setFeedback(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!walletAddress || saving) return;

    const trimmedUsername = formState.username.trim();
    if (!trimmedUsername) {
      setErrorMessage("Username is required.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setFeedback(null);

    const trimmedBio = formState.bio.trim();
    const trimmedImage = formState.image.trim();

    try {
      const response = await fetch("/api/tapestry/profiles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: trimmedUsername,
          bio: trimmedBio.length ? trimmedBio : null,
          image: trimmedImage.length ? trimmedImage : null,
          walletAddress,
          profileId: profileData?.profile.id,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to save profile");
      }

      const data = (await response.json()) as AppProfileResponse;
      setProfileData(data);
      setFormState({
        username: data.profile.username,
        bio: data.profile.bio ?? "",
        image: data.profile.image ?? "",
      });
      setLastOperation(data.operation ?? "FOUND");
      setFeedback(
        data.operation === "CREATED"
          ? "Profile created successfully."
          : "Profile updated.",
      );
    } catch (error) {
      console.error("Error saving Tapestry profile", error);
      setErrorMessage("We could not save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const hasProfile = Boolean(profileData);
  const createdAt = hasProfile
    ? normalizeTimestamp(profileData.profile.createdAt)
    : null;

  const bioMatches =
    (profileData?.profile.bio ?? "").trim() === formState.bio.trim();
  const imageMatches =
    (profileData?.profile.image ?? "").trim() === formState.image.trim();
  const usernameMatches =
    (profileData?.profile.username ?? "").trim() ===
    formState.username.trim();

  const isDirty = hasProfile
    ? !(bioMatches && imageMatches && usernameMatches)
    : Boolean(formState.username.trim());

  const followerProfiles = profileData?.followers?.profiles ?? [];
  const followingProfiles = profileData?.following?.profiles ?? [];
  const followerTotal = profileData?.followers?.total ?? profileData?.socialCounts.followers ?? 0;
  const followingTotal = profileData?.following?.total ?? profileData?.socialCounts.following ?? 0;
  const walletList = profileData?.wallets ?? [];
  const walletSocialCounts = profileData?.walletSocialCounts ?? null;
  const activityFeed = profileData?.activity ?? [];
  const swapActivity = profileData?.swapActivity ?? [];
  const tradeHistory = profileData?.tradeHistory ?? [];
  const tokenSummary = profileData?.tokenSummary ?? [];
  const contentItems = profileData?.contents?.items ?? [];
  const contentTotal = profileData?.contents?.total ?? 0;
  const identityProfiles = profileData?.identities ?? [];
  const nftMeta = profileData?.nfts;
  const nftItems = nftMeta?.items ?? [];
  const nftCurrentPage = nftMeta?.page ?? nftPage;
  const nftPerPage = nftMeta?.limit ?? DEFAULT_NFT_PAGE_SIZE;
  const nftTotal = nftMeta?.total ?? 0;
  const nftTotalPages = Math.max(1, Math.ceil(nftTotal / nftPerPage));
  const canPrevNfts = nftCurrentPage > 1;
  const canNextNfts = nftCurrentPage < nftTotalPages;

  const formatAddress = (address: string) =>
    `${address.slice(0, 4)}…${address.slice(-4)}`;

  const formatToken = (mint: string) => {
    const tokenMeta = DEFAULT_TOKEN_MAP.get(mint);
    return tokenMeta?.symbol ?? formatMintAddress(mint);
  };

  const formatAmount = (value: number) => {
    if (!Number.isFinite(value)) return "—";
    if (Math.abs(value) >= 1) {
      return value.toLocaleString(undefined, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      });
    }
    return value.toFixed(4);
  };

  const activityLabel = (item: ActivityFeedItem) => {
    switch (item.type) {
      case "following":
        return `${item.actor_username} followed ${item.target_username ?? "a profile"}`;
      case "new_content":
        return `${item.actor_username} shared new content`;
      case "like":
        return `${item.actor_username} liked ${item.target_username ?? "a post"}`;
      case "comment":
        return `${item.actor_username} commented`; 
      case "new_follower":
        return `New follower: ${item.actor_username}`;
      default:
        return item.activity;
    }
  };

  const formatTimestampLabel = (value: number | string | undefined) => {
    if (!value) return "Just now";
    const numeric = typeof value === "string" ? Number(value) : value;
    const date = Number.isFinite(numeric)
      ? normalizeTimestamp(numeric as number)
      : new Date(value as string);
    if (!date || Number.isNaN(date.getTime())) return "Just now";
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const tradeTimestampLabel = (timestamp: number) => {
    const date = normalizeTimestamp(timestamp);
    if (!date) return "";
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const initialsFor = (value: string) =>
    value.trim().slice(0, 2).toUpperCase() || "??";

  const handlePrevNfts = () => {
    if (canPrevNfts) {
      setNftPage((prev) => Math.max(1, prev - 1));
    }
  };

  const handleNextNfts = () => {
    if (canNextNfts) {
      setNftPage((prev) => prev + 1);
    }
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
        <div className={styles.profileShell}>
          <div className={styles.column}>
            <div className={styles.panel}>
              <div className={styles.profileHeader}>
                <div className={styles.avatar}>
                  {formState.image ? (
                    <div
                      className={styles.avatarImage}
                      style={{ backgroundImage: `url(${formState.image})` }}
                      aria-label="Profile avatar preview"
                    />
                  ) : (
                    <div className={styles.avatarFallback} aria-hidden="true">
                      {formState.username.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <p className={styles.profileEyebrow}>FROG SOCIAL PROFILE</p>
                  <h1 className={styles.profileTitle}>
                    {formState.username || "Choose a handle"}
                  </h1>
                  <div className={styles.metaRow}>
                    {createdAt ? (
                      <span>
                        Joined&nbsp;
                        {createdAt.toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    ) : (
                      <span>Let&apos;s get your profile set up.</span>
                    )}
                    {walletAddress ? (
                      <span className={styles.walletTag}>
                        {formatAddress(walletAddress)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <dl className={styles.statsRow}>
                <div className={styles.statItem}>
                  <dt>Followers</dt>
                  <dd>{followerTotal}</dd>
                </div>
                <div className={styles.statItem}>
                  <dt>Following</dt>
                  <dd>{followingTotal}</dd>
                </div>
                <div className={styles.statItem}>
                  <dt>Status</dt>
                  <dd>
                    {fetchState === "loading"
                      ? "Syncing…"
                      : lastOperation === "CREATED"
                      ? "Created"
                      : hasProfile
                      ? "Live"
                      : "Not published"}
                  </dd>
                </div>
              </dl>
              {errorMessage ? (
                <p className={styles.errorBanner}>{errorMessage}</p>
              ) : null}
              {feedback ? (
                <p className={styles.successBanner}>{feedback}</p>
              ) : null}
              <form className={styles.profileForm} onSubmit={handleSubmit}>
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Username</span>
                  <input
                    type="text"
                    value={formState.username}
                    onChange={handleFieldChange("username")}
                    className={styles.textInput}
                    placeholder="frog-commander"
                    maxLength={32}
                    required
                  />
                </label>
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Bio</span>
                  <textarea
                    value={formState.bio}
                    onChange={handleFieldChange("bio")}
                    className={styles.textArea}
                    rows={4}
                    placeholder="Tell your fellow frogs what you swap for."
                  />
                </label>
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Avatar image URL</span>
                  <input
                    type="url"
                    value={formState.image}
                    onChange={handleFieldChange("image")}
                    className={styles.textInput}
                    placeholder="https://..."
                  />
                </label>
                <div className={styles.formActions}>
                  <button
                    type="submit"
                    className={styles.primaryButton}
                    disabled={!isDirty || saving}
                  >
                    {saving ? "Saving…" : hasProfile ? "Save profile" : "Create profile"}
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={resetForm}
                    disabled={saving}
                  >
                    Reset
                  </button>
                </div>
              </form>
            </div>

            <div className={styles.panel}>
              <h2 className={styles.sectionTitle}>Wallet NFTs</h2>
              {nftItems.length ? (
                <>
                  <div className={styles.nftGridLarge}>
                    {nftItems.map((nft) => (
                      <div key={nft.id} className={styles.nftCardLarge}>
                        <div className={styles.nftImageWrapLarge}>
                          {nft.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={nft.image}
                              alt={nft.name}
                              className={styles.nftImageLarge}
                              loading="lazy"
                            />
                          ) : (
                            <div className={styles.nftPlaceholder} aria-hidden="true">
                              {initialsFor(nft.name)}
                            </div>
                          )}
                        </div>
                        <div className={styles.nftMeta}>
                          <p className={styles.nftName}>{nft.name}</p>
                          <p className={styles.nftCollection}>
                            {nft.collection ?? "Core collectible"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {nftTotalPages > 1 ? (
                    <div className={styles.paginationControls}>
                      <button
                        type="button"
                        className={styles.paginationButton}
                        onClick={handlePrevNfts}
                        disabled={!canPrevNfts || fetchState === "loading"}
                      >
                        Prev
                      </button>
                      <span className={styles.paginationLabel}>
                        Page {nftCurrentPage} / {nftTotalPages}
                      </span>
                      <button
                        type="button"
                        className={styles.paginationButton}
                        onClick={handleNextNfts}
                        disabled={!canNextNfts || fetchState === "loading"}
                      >
                        Next
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className={styles.emptyState}>
                  No core NFTs detected yet. Mint something fresh and it will appear here.
                </p>
              )}
            </div>

            <div className={styles.panel}>
              <h2 className={styles.sectionTitle}>Activity Feed</h2>
              <ul className={styles.activityList}>
                {activityFeed.length ? (
                  activityFeed.slice(0, 8).map((item) => (
                    <li key={`${item.type}-${item.timestamp}-${item.actor_id}`}>
                      <div className={styles.activityHeader}>
                        <span className={styles.activityType}>{activityLabel(item)}</span>
                        <span className={styles.activityTime}>
                          {formatTimestampLabel(item.timestamp)}
                        </span>
                      </div>
                      {item.activity ? (
                        <p className={styles.activityBody}>{item.activity}</p>
                      ) : null}
                    </li>
                  ))
                ) : (
                  <li className={styles.emptyState}>No social activity yet. Start following friends to populate this feed.</li>
                )}
              </ul>
            </div>

            <div className={styles.panel}>
              <h2 className={styles.sectionTitle}>Recent Trades</h2>
              {tradeHistory.length ? (
                <div className={styles.tradeTableWrapper}>
                  <table className={styles.tradeTable}>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Type</th>
                        <th>Route</th>
                        <th>Amounts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tradeHistory.slice(0, 6).map((trade) => (
                        <tr key={trade.transactionSignature}>
                          <td>{tradeTimestampLabel(trade.timestamp)}</td>
                          <td className={styles.tradeType}>{trade.tradeType.toUpperCase()}</td>
                          <td>{`${formatToken(trade.inputMint)} → ${formatToken(trade.outputMint)}`}</td>
                          <td>
                            <div className={styles.tradeAmounts}>
                              <span>-{formatAmount(trade.inputAmount)} {formatToken(trade.inputMint)}</span>
                              <span className={styles.tradeArrow}>↳</span>
                              <span>+{formatAmount(trade.outputAmount)} {formatToken(trade.outputMint)}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={styles.emptyState}>Swap with Titan to unlock trade analytics.</p>
              )}

              {swapActivity.length ? (
                <div className={styles.swapSection}>
                  <h3 className={styles.subTitle}>Following swaps</h3>
                  <ul className={styles.swapList}>
                    {swapActivity.slice(0, 5).map((item) => (
                      <li key={`${item.signature}-${item.timestamp}`}>
                        <div className={styles.swapHeader}>
                          <span className={styles.swapUser}>{item.username}</span>
                          <span className={styles.swapTime}>{formatTimestampLabel(item.timestamp)}</span>
                        </div>
                        <p className={styles.swapRoute}>
                          {formatAmount(item.from.amount)} {formatToken(item.from.token)} → {formatAmount(item.to.amount)} {formatToken(item.to.token)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>

          <aside className={styles.column}>
            <div className={styles.panel}>
              <h2 className={styles.sectionTitle}>Wallet overview</h2>
              <ul className={styles.walletList}>
                {walletList.length ? (
                  walletList.map((wallet) => (
                    <li key={wallet.id}>
                      <span className={styles.walletAddress}>{formatAddress(wallet.id)}</span>
                      <span className={styles.walletBadge}>{wallet.blockchain}</span>
                      {wallet.wallet_type ? (
                        <span className={styles.walletType}>{wallet.wallet_type}</span>
                      ) : null}
                    </li>
                  ))
                ) : walletAddress ? (
                  <li>
                    <span className={styles.walletAddress}>{formatAddress(walletAddress)}</span>
                    <span className={styles.walletBadge}>SOLANA</span>
                  </li>
                ) : (
                  <li className={styles.emptyState}>No wallets linked yet.</li>
                )}
              </ul>
              {walletSocialCounts ? (
                <div className={styles.socialGrid}>
                  <div>
                    <span className={styles.infoLabel}>Followers</span>
                    <span className={styles.statNumber}>{walletSocialCounts.followers.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className={styles.infoLabel}>Following</span>
                    <span className={styles.statNumber}>{walletSocialCounts.following.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className={styles.infoLabel}>Global followers</span>
                    <span className={styles.statNumber}>{walletSocialCounts.globalFollowers.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className={styles.infoLabel}>Global following</span>
                    <span className={styles.statNumber}>{walletSocialCounts.globalFollowing.toLocaleString()}</span>
                  </div>
                </div>
              ) : null}
              <ul className={styles.infoList}>
                <li>
                  <span className={styles.infoLabel}>Namespace</span>
                  <span className={styles.infoValue}>
                    {profileData?.namespace?.readableName ??
                      profileData?.profile.namespace ??
                      "frogx"}
                  </span>
                </li>
                <li>
                  <span className={styles.infoLabel}>Operation</span>
                  <span className={styles.infoValue}>
                    {lastOperation ?? (hasProfile ? "FOUND" : "—")}
                  </span>
                </li>
                {profileData?.contact ? (
                  <li>
                    <span className={styles.infoLabel}>Primary contact</span>
                    <span className={styles.infoValue}>
                      {profileData.contact.type.toLowerCase()} · {profileData.contact.id}
                    </span>
                  </li>
                ) : null}
              </ul>
            </div>

            <div className={styles.panel}>
              <h2 className={styles.sectionTitle}>Tokens &amp; assets</h2>
              {tokenSummary.length ? (
                <ul className={styles.tokenList}>
                  {tokenSummary.map((token) => (
                    <li
                      key={token.mint}
                      className={`${styles.tokenListItem} ${
                        token.direction === "positive"
                          ? styles.tokenPositive
                          : token.direction === "negative"
                          ? styles.tokenNegative
                          : styles.tokenNeutral
                      }`}
                    >
                      <div className={styles.tokenMetaLine}>
                        <span className={styles.tokenSymbol}>{token.symbol ?? formatToken(token.mint)}</span>
                        <span className={styles.tokenMint}>{formatMintAddress(token.mint)}</span>
                      </div>
                      <div className={styles.tokenValues}>
                        <span>{formatAmount(token.netAmount)}</span>
                        <span>
                          {Number.isFinite(token.netUsd)
                            ? `${token.netUsd >= 0 ? "+" : ""}${token.netUsd.toFixed(2)} USD`
                            : "—"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.emptyState}>Trade to generate token insights.</p>
              )}

              {identityProfiles.length ? (
                <div className={styles.identitySection}>
                  <p className={styles.identityLabel}>Linked identities</p>
                  <ul className={styles.identityList}>
                    {identityProfiles.map((identity) => (
                      <li key={`${identity.profile.id}-${identity.profile.namespace}`}>
                        <span className={styles.identityName}>{identity.profile.username}</span>
                        <span className={styles.identityNamespace}>
                          {identity.namespace?.readableName ?? identity.profile.namespace}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className={styles.panel}>
              <h2 className={styles.sectionTitle}>Followers &amp; following</h2>
              <div className={styles.followGrid}>
                <div>
                  <h3 className={styles.subTitle}>Followers ({followerTotal})</h3>
                  <ul className={styles.profileList}>
                    {followerProfiles.length ? (
                      followerProfiles.slice(0, 6).map((profile) => (
                        <li key={profile.id}>
                          <span className={styles.profileAvatar} aria-hidden="true">
                            {profile.image ? (
                              <span
                                className={styles.profileAvatarImage}
                                style={{ backgroundImage: `url(${profile.image})` }}
                              />
                            ) : (
                              initialsFor(profile.username)
                            )}
                          </span>
                          <div className={styles.profileMeta}>
                            <span className={styles.profileHandle}>{profile.username}</span>
                            <span className={styles.profileNamespace}>{profile.namespace}</span>
                          </div>
                        </li>
                      ))
                    ) : (
                      <li className={styles.emptyState}>No followers yet.</li>
                    )}
                  </ul>
                </div>
                <div>
                  <h3 className={styles.subTitle}>Following ({followingTotal})</h3>
                  <ul className={styles.profileList}>
                    {followingProfiles.length ? (
                      followingProfiles.slice(0, 6).map((profile) => (
                        <li key={profile.id}>
                          <span className={styles.profileAvatar} aria-hidden="true">
                            {profile.image ? (
                              <span
                                className={styles.profileAvatarImage}
                                style={{ backgroundImage: `url(${profile.image})` }}
                              />
                            ) : (
                              initialsFor(profile.username)
                            )}
                          </span>
                          <div className={styles.profileMeta}>
                            <span className={styles.profileHandle}>{profile.username}</span>
                            <span className={styles.profileNamespace}>{profile.namespace}</span>
                          </div>
                        </li>
                      ))
                    ) : (
                      <li className={styles.emptyState}>You&apos;re not following anyone yet.</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>

            <div className={styles.panel}>
              <h2 className={styles.sectionTitle}>Latest posts</h2>
              {contentItems.length ? (
                <ul className={styles.contentList}>
                  {contentItems.slice(0, 6).map((item) => (
                    <li key={item.id}>
                      <div className={styles.contentHeader}>
                        <span className={styles.contentNamespace}>{item.namespace}</span>
                        <span className={styles.contentTime}>{formatTimestampLabel(item.created_at)}</span>
                      </div>
                      {item.externalLinkURL ? (
                        <a
                          href={item.externalLinkURL}
                          target="_blank"
                          rel="noreferrer"
                          className={styles.contentLink}
                        >
                          {item.externalLinkURL}
                        </a>
                      ) : (
                        <p className={styles.contentLink}>On-chain content</p>
                      )}
                      <div className={styles.contentStats}>
                        <span>❤️ {item.likeCount}</span>
                        <span>💬 {item.commentCount}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.emptyState}>
                  Publish something through Tapestry to light up this feed.
                </p>
              )}
              {contentTotal > contentItems.length ? (
                <p className={styles.contentFootnote}>
                  Showing {contentItems.length} of {contentTotal} posts
                </p>
              ) : null}
            </div>
          </aside>
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
      </section>
    </main>
  );
}
