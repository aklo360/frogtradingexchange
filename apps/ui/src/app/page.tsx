"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SwapCard } from "@/components/SwapCard";
import { WalletButton } from "@/components/WalletButton";
import { Ticker } from "@/components/Ticker";
import { useAudio } from "@/providers/AudioProvider";
import { useWallet } from "@solana/wallet-adapter-react";
import styles from "./page.module.css";

export default function Home() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { muted, toggleMuted } = useAudio();
  const { connected } = useWallet();

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

  return (
    <main className={styles.main}>
      <header className={styles.headerBar}>
        <div className={styles.headerInner}>
          <div className={styles.brandGroup}>
            <div className={styles.brandRow}>
              <video
                src="/sticker/excited.webm"
                className={`${styles.headerSticker} ${styles.headerStickerLarge}`}
                autoPlay
                loop
                muted
                playsInline
                aria-hidden="true"
              />
              <h1>
                <span className={styles.srOnly}>Frog Trading Exchange</span>
                <img
                  src="/logo.png"
                  alt="Frog Trading Exchange"
                  className={styles.brandLogo}
                  loading="lazy"
                />
              </h1>
              <video
                src="/sticker/wink.webm"
                className={`${styles.headerSticker} ${styles.headerStickerLarge}`}
                autoPlay
                loop
                muted
                playsInline
                aria-hidden="true"
              />
            </div>
            <p className={styles.tagline}>Powered by Titan for the best prices on Solana</p>
          </div>
        </div>
        <div className={styles.rightControls}>
          {connected ? (
            <div className={styles.xpChip} aria-label="Your XP">
              <span className={styles.xpValue}>4,269 XP</span>
              <img src="/sparkle.svg" alt="" className={styles.sparkleIcon} />
            </div>
          ) : null}
          <button
            type="button"
            className={styles.menuButton}
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            onClick={toggleMenu}
          >
            <img src="/wallet.svg" alt="" className={styles.menuButtonIcon} />
          </button>
        </div>
        <div
          className={`${styles.menuSheet} ${menuOpen ? styles.menuSheetOpen : ""}`}
          aria-hidden={!menuOpen}
        >
          <nav aria-label="Main navigation" className={styles.menuList}>
            <div className={styles.menuWalletWrapper} onClick={closeMenu}>
              <WalletButton className={styles.menuWallet} />
            </div>
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                closeMenu();
                router.push("/leaderboard");
              }}
            >
              <img
                src="/trophy.svg"
                alt=""
                className={`${styles.menuIcon} ${styles.pixelIcon}`}
              />
              <span>LEADERBOARD</span>
            </button>
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => { handleToggleMute(); closeMenu(); }}
            >
              <img
                src={muted ? "/mute.svg" : "/sound.svg"}
                alt=""
                className={styles.menuIcon}
              />
              <span>{muted ? "Unmute" : "Mute"}</span>
            </button>
            <button type="button" className={styles.menuItem} onClick={closeMenu}>
              <img src="/info.svg" alt="" className={styles.menuIcon} />
              <span>Help</span>
            </button>
            <button type="button" className={styles.menuItem} onClick={closeMenu}>
              <img src="/chat.svg" alt="" className={styles.menuIcon} />
              <span>Chat</span>
            </button>
          </nav>
        </div>
        {menuOpen ? (
          <button
            type="button"
            className={styles.menuBackdrop}
            aria-hidden="true"
            onClick={closeMenu}
          />
        ) : null}
      </header>
      <Ticker />
      <SwapCard />
    </main>
  );
}
