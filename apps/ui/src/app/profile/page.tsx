"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { WalletButton } from "@/components/WalletButton";
import { Ticker } from "@/components/Ticker";
import { useAudio } from "@/providers/AudioProvider";
import { useWallet } from "@solana/wallet-adapter-react";
import homeStyles from "../page.module.css";
import styles from "./profile.module.css";

type FrogPfp = {
  id: string;
  name: string;
  rarity: "Legendary" | "Epic" | "Rare" | "Uncommon";
  gradient: string;
  xp: number;
  tagline: string;
};

type Stat = {
  label: string;
  value: string;
  sublabel: string;
};

type Achievement = {
  title: string;
  description: string;
  icon: string;
  status: "claimed" | "in-progress" | "locked";
};

type Activity = {
  title: string;
  timestamp: string;
  detail: string;
};

type Quest = {
  name: string;
  progress: number;
  reward: string;
};

const PFP_LIBRARY: FrogPfp[] = [
  {
    id: "neon",
    name: "Arcade Shogun",
    rarity: "Legendary",
    gradient: "linear-gradient(135deg, #14f195, #7c3bff)",
    xp: 4269,
    tagline: "Runs the Ribbit routing table.",
  },
  {
    id: "retro",
    name: "Pixel Bard",
    rarity: "Epic",
    gradient: "linear-gradient(135deg, #ff8ecb, #6136ff)",
    xp: 3180,
    tagline: "Sings slippage-free ballads.",
  },
  {
    id: "chrome",
    name: "Cyber Lily",
    rarity: "Rare",
    gradient: "linear-gradient(135deg, #34d8ff, #1470f1)",
    xp: 2765,
    tagline: "Glides between liquidity pools.",
  },
  {
    id: "swamp",
    name: "Swamp Scout",
    rarity: "Uncommon",
    gradient: "linear-gradient(135deg, #5dfa96, #0b2f1f)",
    xp: 1984,
    tagline: "Finds hidden fee rebates.",
  },
];

const CORE_STATS: Stat[] = [
  { label: "Season XP", value: "4,269", sublabel: "+420 today" },
  { label: "Lifetime Volume", value: "$189,452", sublabel: "Top 3% of frogs" },
  { label: "Quests Cleared", value: "17", sublabel: "2 active" },
  { label: "Holder Since", value: "Feb 2022", sublabel: "Minted Frog #331" },
  { label: "Frogs Collected", value: "12", sublabel: "3 Legendary" },
];

const ACHIEVEMENTS: Achievement[] = [
  {
    title: "Slippage Samurai",
    description: "Execute 50 swaps under 0.3% slippage.",
    icon: "/badge-samurai.svg",
    status: "claimed",
  },
  {
    title: "Titan Trailblazer",
    description: "Route volume through 5 different Titan regions.",
    icon: "/badge-trailblazer.svg",
    status: "in-progress",
  },
  {
    title: "Helius Hotshot",
    description: "Complete 10 RPC quests without timeout.",
    icon: "/badge-hotshot.svg",
    status: "locked",
  },
];

const ACTIVITY_LOG: Activity[] = [
  {
    title: "Swapped 420.69 BONK → USDC",
    timestamp: "3 minutes ago",
    detail: "Gasless route via Titan JP1",
  },
  {
    title: "Equipped badge: Slippage Samurai",
    timestamp: "18 minutes ago",
    detail: "+150 XP bonus",
  },
  {
    title: "Claimed quest: Ribbit Relay",
    timestamp: "1 hour ago",
    detail: "Routed through 3 pools in under 30s",
  },
  {
    title: "Joined party: LP Rainmakers",
    timestamp: "2 hours ago",
    detail: "Synergy buff active for 24h",
  },
];

const QUEST_BOARD: Quest[] = [
  { name: "Combo Chain x5", progress: 80, reward: "+250 XP" },
  { name: "Titan Trifecta", progress: 45, reward: "+1 Mystery Capsule" },
  { name: "Helius Harmony", progress: 22, reward: "+75 XP" },
];

const LOADOUT = [
  "Arcade HUD v2.3",
  "Slippage Shield +15",
  "Referral Boost x1.5",
  "Quest Tracker AI",
];

export default function ProfilePage() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PFP_LIBRARY.length);
  const { muted, toggleMuted } = useAudio();
  const { connected } = useWallet();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const [selectedPfp, setSelectedPfp] = useState<FrogPfp>(PFP_LIBRARY[0]);
  const [username, setUsername] = useState("ribbitlord420");
  const [editingUsername, setEditingUsername] = useState(false);

  const currentStats = useMemo(() => CORE_STATS, []);

  const onUsernameChange = (value: string) => {
    const trimmed = value.trim();
    setUsername(trimmed.length > 0 ? trimmed : "ribbitlord420");
  };

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisibleCount(PFP_LIBRARY.length);
      }
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <main className={homeStyles.main}>
      <header className={homeStyles.headerBar}>
        <div className={homeStyles.headerInner}>
          <button
            type="button"
            className={`${homeStyles.brandGroup} ${homeStyles.brandHomeButton}`}
            onClick={() => {
              setMenuOpen(false);
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
            <p className={homeStyles.tagline}>Powered by Titan for the best prices on Solana</p>
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
            onClick={() => setMenuOpen((open) => !open)}
          >
            <img src="/wallet.svg" alt="" className={homeStyles.menuButtonIcon} />
          </button>
        </div>
        <div
          className={`${homeStyles.menuSheet} ${menuOpen ? homeStyles.menuSheetOpen : ""}`}
          aria-hidden={!menuOpen}
        >
          <nav aria-label="Main navigation" className={homeStyles.menuList}>
            <div className={homeStyles.menuWalletWrapper} onClick={() => setMenuOpen(false)}>
              <WalletButton className={homeStyles.menuWallet} />
            </div>
            {connected ? (
              <button
                type="button"
                className={homeStyles.menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  router.push("/profile");
                }}
              >
                <img
                  src="/bank.svg"
                  alt=""
                  className={homeStyles.menuIcon}
                />
                <span>PROFILE</span>
              </button>
            ) : null}
            <button
              type="button"
              className={homeStyles.menuItem}
              onClick={() => {
                setMenuOpen(false);
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
                toggleMuted();
                setMenuOpen(false);
              }}
            >
              <img
                src={muted ? "/mute.svg" : "/sound.svg"}
                alt=""
                className={homeStyles.menuIcon}
              />
              <span>{muted ? "UNMUTE" : "MUTE"}</span>
            </button>
            <button
              type="button"
              className={homeStyles.menuItem}
              onClick={() => setMenuOpen(false)}
            >
              <img src="/info.svg" alt="" className={homeStyles.menuIcon} />
              <span>HELP</span>
            </button>
            <button
              type="button"
              className={homeStyles.menuItem}
              onClick={() => setMenuOpen(false)}
            >
              <img src="/chat.svg" alt="" className={homeStyles.menuIcon} />
              <span>CHAT</span>
            </button>
          </nav>
        </div>
        {menuOpen ? (
          <button
            type="button"
            className={homeStyles.menuBackdrop}
            aria-hidden="true"
            onClick={() => setMenuOpen(false)}
          />
        ) : null}
      </header>

      <Ticker />

      <div className={styles.content}>
        <section className={styles.profileHero}>
          <div className={styles.heroCard}>
            <div
              className={styles.heroAvatar}
              style={{ backgroundImage: selectedPfp.gradient }}
            >
              <span>{selectedPfp.name.slice(0, 2)}</span>
            </div>
            <div className={styles.heroDetails}>
              <div className={styles.usernameDisplay}>
                <div className={styles.usernameHeader}>
                  <span className={styles.usernameLabel}>Username</span>
                  <button type="button" className={styles.usernameEdit} onClick={() => setEditingUsername(true)}>
                    <img src="/pencil.svg" alt="Edit username" className={styles.usernameIcon} />
                  </button>
                </div>
                {editingUsername ? (
                  <input
                    id="profile-username"
                    className={styles.usernameInput}
                    defaultValue={username}
                    maxLength={32}
                    autoFocus
                    onBlur={(event) => {
                      onUsernameChange(event.target.value);
                      setEditingUsername(false);
                    }}
                  />
                ) : (
                  <button type="button" className={styles.usernameValue} onClick={() => setEditingUsername(true)}>
                    {username}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className={styles.heroRight}>
            <div className={`${styles.statsGrid} ${styles.heroStats}`}>
              {currentStats.map((stat) => (
                <div key={stat.label} className={styles.statCard}>
                  <p className={styles.statLabel}>{stat.label}</p>
                  <p className={styles.statValue}>{stat.value}</p>
                  <p className={styles.statSublabel}>{stat.sublabel}</p>
                </div>
              ))}
            </div>

          </div>
        </section>

        

        <section className={styles.achievementSection}>
          <div className={styles.sectionHeader}>
            <h3>Achievements</h3>
            <span>Flex your Achievement Badges</span>
          </div>
          <div className={styles.badgeGrid}>
            {ACHIEVEMENTS.map((achievement) => (
              <div
                key={achievement.title}
                className={`${styles.badgeCard} ${styles[`badge_${achievement.status.toUpperCase()}`]}`}
              >
                <div className={styles.badgeCardContent}>
                  <img
                    src={achievement.icon}
                    alt={`${achievement.title} badge`}
                    className={styles.badgeIcon}
                  />
                  <div className={styles.badgeDetails}>
                    <span className={styles.badgeStatus}>{achievement.status.toUpperCase()}</span>
                    <h4>{achievement.title}</h4>
                    <p>{achievement.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.loadoutSection}>
          <div className={styles.sectionHeader}>
            <h3>Deploy Frogs</h3>
            <span>Place frogs in your swamp for XP multipliers</span>
          </div>
          <ul className={styles.loadoutList}>
            {LOADOUT.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className={styles.questBoard}>
          <div className={styles.sectionHeader}>
            <h3>Quest Board</h3>
            <span>Complete runs to claim bonuses</span>
          </div>
          <div className={styles.questList}>
            {QUEST_BOARD.map((quest) => (
              <div key={quest.name} className={styles.questRow}>
                <div>
                  <p className={styles.questName}>{quest.name}</p>
                  <div className={styles.questProgress}>
                    <div
                      className={styles.questProgressFill}
                      style={{ width: `${quest.progress}%` }}
                    />
                  </div>
                </div>
                <span className={styles.questReward}>{quest.reward}</span>
              </div>
            ))}
          </div>
        </section><section className={styles.activitySection}>
          <div className={styles.sectionHeader}>
            <h3>Recent Activity</h3>
            <span>Autoplay recap of your latest feats</span>
          </div>
          <ul className={styles.activityTimeline}>
            {ACTIVITY_LOG.map((entry) => (
              <li key={entry.title}>
                <div className={styles.timelineDot} />
                <div className={styles.timelineCard}>
                  <div className={styles.timelineHeader}>
                    <h4>{entry.title}</h4>
                    <time>{entry.timestamp}</time>
                  </div>
                  <p>{entry.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        
      </div>
    </main>
  );
}
