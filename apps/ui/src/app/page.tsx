"use client";

import { useState } from "react";
import { SwapCard } from "@/components/SwapCard";
import { WalletButton } from "@/components/WalletButton";
import { BackgroundAudio } from "@/components/BackgroundAudio";
import { SpeakerToggle } from "@/components/SpeakerToggle";
import { HelpButton } from "@/components/HelpButton";
import { ChatButton } from "@/components/ChatButton";
import styles from "./page.module.css";

export default function Home() {
  const [muted, setMuted] = useState(false);

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
            <h1>Frog Trading Exchange</h1>
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
        </div>
        <div className={styles.rightControls}>
          <WalletButton className={styles.walletButton} />
        </div>
        <p className={styles.tagline}>Powered by Titan for the best prices on Solana.</p>
      </header>
      <div className={styles.tickerBar} aria-label="Top Solana memecoins">
        <div className={styles.tickerTrack}>
          <div className={styles.tickerContent}>
            <span className={`${styles.tickerItem} ${styles.tickerPositive}`}>BONK +5.2%</span>
            <span className={`${styles.tickerItem} ${styles.tickerNegative}`}>SLERF −2.1%</span>
            <span className={`${styles.tickerItem} ${styles.tickerPositive}`}>WIF +8.7%</span>
            <span className={`${styles.tickerItem} ${styles.tickerPositive}`}>FROG +12.4%</span>
            <span className={`${styles.tickerItem} ${styles.tickerNegative}`}>MEW −1.3%</span>
            <span className={`${styles.tickerItem} ${styles.tickerPositive}`}>SAMO +4.9%</span>
            <span className={`${styles.tickerItem} ${styles.tickerPositive}`}>TURBO +3.1%</span>
            <span className={`${styles.tickerItem} ${styles.tickerPositive}`}>PONK +6.5%</span>
          </div>
          <div className={styles.tickerContent} aria-hidden="true">
            <span className={`${styles.tickerItem} ${styles.tickerPositive}`}>BONK +5.2%</span>
            <span className={`${styles.tickerItem} ${styles.tickerNegative}`}>SLERF −2.1%</span>
            <span className={`${styles.tickerItem} ${styles.tickerPositive}`}>WIF +8.7%</span>
            <span className={`${styles.tickerItem} ${styles.tickerPositive}`}>FROG +12.4%</span>
            <span className={`${styles.tickerItem} ${styles.tickerNegative}`}>MEW −1.3%</span>
            <span className={`${styles.tickerItem} ${styles.tickerPositive}`}>SAMO +4.9%</span>
            <span className={`${styles.tickerItem} ${styles.tickerPositive}`}>TURBO +3.1%</span>
            <span className={`${styles.tickerItem} ${styles.tickerPositive}`}>PONK +6.5%</span>
          </div>
        </div>
      </div>
      <SwapCard />
      <SpeakerToggle muted={muted} onToggle={setMuted} />
      <HelpButton />
      <ChatButton />
    </main>
  );
}
