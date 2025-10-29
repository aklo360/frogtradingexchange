"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { WalletButton } from "@/components/WalletButton";
import { Ticker } from "@/components/Ticker";
import { useAudio } from "@/providers/AudioProvider";
import { useWallet } from "@solana/wallet-adapter-react";
import homeStyles from "../page.module.css";
import styles from "./leaderboard.module.css";

type LeaderboardEntry = {
  rank: number;
  trader: string;
  points: number;
};

const TOTAL_ROWS = 100;
const PAGE_SIZE = 20;

const HANDLE_POOL = [
  "FROGMASTER",
  "LILYPADLARRY",
  "RIBBITQUEEN",
  "CROAKDEALER",
  "SWAMPWIZARD",
  "PIXELTOAD",
  "DANKFROG",
  "HOPLITE",
  "NEONTADPOLE",
  "TURBOTOAD",
];

const generateRows = (): LeaderboardEntry[] =>
  Array.from({ length: TOTAL_ROWS }, (_, index) => {
    const base = HANDLE_POOL[index % HANDLE_POOL.length];
    return {
      rank: index + 1,
      trader: `${base}#${(index + 123).toString().padStart(3, "0")}`,
      points: 420_000 - index * 3_175 + ((index * 911) % 8_700),
    };
  });

const pointsFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export default function LeaderboardPage() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { muted, toggleMuted } = useAudio();
  const { connected } = useWallet();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const rows = useMemo(generateRows, []);
  const visibleRows = useMemo(
    () => rows.slice(0, visibleCount),
    [rows, visibleCount],
  );

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
    if (visibleCount >= rows.length) return undefined;
    const sentinel = sentinelRef.current;
    if (!sentinel) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, rows.length));
        }
      },
      { rootMargin: "0px 0px 240px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [rows.length, visibleCount]);

  return (
    <main className={homeStyles.main}>
      <header className={homeStyles.headerBar}>
        <div className={homeStyles.headerInner}>
          <div className={homeStyles.brandGroup}>
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
          </div>
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
          className={`${homeStyles.menuSheet} ${
            menuOpen ? homeStyles.menuSheetOpen : ""
          }`}
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
                closeMenu();
                router.push("/");
              }}
            >
              <img src="/swap.svg" alt="" className={homeStyles.menuIcon} />
              <span>SWAP</span>
            </button>
            <button
              type="button"
              className={homeStyles.menuItem}
              onClick={() => { handleToggleMute(); closeMenu(); }}
            >
              <img
                src={muted ? "/mute.svg" : "/sound.svg"}
                alt=""
                className={homeStyles.menuIcon}
              />
              <span>{muted ? "UNMUTE" : "MUTE"}</span>
            </button>
            <button type="button" className={homeStyles.menuItem} onClick={closeMenu}>
              <img src="/info.svg" alt="" className={homeStyles.menuIcon} />
              <span>HELP</span>
            </button>
            <button type="button" className={homeStyles.menuItem} onClick={closeMenu}>
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
            onClick={closeMenu}
          />
        ) : null}
      </header>

      <Ticker />

      <div className={styles.content}>
        <section className={styles.hero}>
          <h1 className={styles.title}>RIBBIT XP LEADERBOARD</h1>
          <p className={styles.subtitle}>
            THIS IS THE ULTIMATE GAME OF LEAP FROG. WHO WILL HOP TO THE TOP? ONLY THE MOST CLEVER OF FROGS WILL FIGURE OUT EVERY WAY TO STACK XP. LET THE GAMES BEGIN.
          </p>
        </section>

        <section className={styles.board}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col" className={styles.rankCol}>
                  RANK
                </th>
                <th scope="col" className={styles.avatarCol} aria-label="Avatar" />
                <th scope="col" className={styles.traderCol}>
                  SOLANA BUSINESS FROG
                </th>
                <th scope="col" className={styles.pointsCol}>
                  <img src="/sparkle.svg" alt="" className={styles.sparkleIcon} />
                  <span>XP POINTS</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((entry) => {
                const highlightClass =
                  entry.rank === 1
                    ? styles.goldRow
                    : entry.rank === 2
                      ? styles.silverRow
                      : entry.rank === 3
                        ? styles.bronzeRow
                        : "";

                return (
                  <tr key={entry.rank} className={`${styles.row} ${highlightClass}`}>
                    <td className={styles.rankCell}>{entry.rank.toString().padStart(2, "0")}</td>
                    <td className={styles.avatarCell}>
                      <Image
                        src="/sbficon.png"
                        alt=""
                        width={44}
                        height={44}
                        className={styles.avatarImg}
                      />
                    </td>
                    <td className={styles.traderCell}>{entry.trader}</td>
                    <td className={styles.pointsCell}>{pointsFormatter.format(entry.points)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div ref={sentinelRef} className={styles.sentinel} />
          {visibleCount < rows.length ? (
            <div className={styles.loading}>LOADING MORE CHAMPIONS…</div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
