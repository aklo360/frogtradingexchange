"use client";

import { useState } from "react";
import { SwapCard } from "@/components/SwapCard";
import { WalletButton } from "@/components/WalletButton";
import { BackgroundAudio } from "@/components/BackgroundAudio";
import { SpeakerToggle } from "@/components/SpeakerToggle";
import { HelpButton } from "@/components/HelpButton";
import { ChatButton } from "@/components/ChatButton";
import { Ticker } from "@/components/Ticker";
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
        </div>
        <div className={styles.rightControls}>
          <WalletButton className={styles.walletButton} />
        </div>
        <p className={styles.tagline}>Powered by Titan for the best prices on Solana.</p>
      </header>
      <Ticker />
      <SwapCard />
      <SpeakerToggle muted={muted} onToggle={setMuted} />
      <HelpButton />
      <ChatButton />
    </main>
  );
}
