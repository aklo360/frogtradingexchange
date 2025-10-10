import { SwapCard } from "@/components/SwapCard";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <header className={styles.siteHeader}>
        <h1>Frog Trading Exchange</h1>
        <p>Powered by Titan for the best prices on Solana.</p>
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
    </main>
  );
}
