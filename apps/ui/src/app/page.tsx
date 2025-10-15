"use client";

import { useEffect, useState } from "react";
import { SwapCard } from "@/components/SwapCard";
import { WalletButton } from "@/components/WalletButton";
import { BackgroundAudio } from "@/components/BackgroundAudio";
import { Ticker } from "@/components/Ticker";
import styles from "./page.module.css";

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [muted, setMuted] = useState(false);

  const toggleMenu = () => setMenuOpen((open) => !open);
  const closeMenu = () => setMenuOpen(false);
  const handleToggleMute = () => setMuted((prev) => !prev);

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
      <BackgroundAudio muted={muted} />
      <header className={styles.headerBar}>
        <div className={styles.headerInner}>
          <div className={styles.brandGroup}>
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
          </div>
        </div>
        <div className={styles.rightControls}>
          <button
            type="button"
            className={styles.menuButton}
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            onClick={toggleMenu}
          >
            <span />
            <span />
            <span />
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
              onClick={() => { handleToggleMute(); closeMenu(); }}
            >
              <img
                src={muted ? "/mute.svg" : "/sound.svg"}
                alt=""
                className={styles.menuIcon}
              />
              <span>{muted ? "Unmute Audio" : "Mute Audio"}</span>
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
