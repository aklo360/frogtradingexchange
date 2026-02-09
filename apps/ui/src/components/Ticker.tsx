"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import styles from "@/app/page.module.css";
import { DEFAULT_TOKEN_OPTIONS } from "@/lib/tokens";

const API_BASE = "https://lite-api.jup.ag/tokens/v2";
const TOP_ORGANIC_URL = `${API_BASE}/toporganicscore/5m?limit=50`;
const MIN_ORGANIC_SCORE = 93;
const MAX_TICKER_ITEMS = 25;

type JupiterTokenStats = {
  priceChange?: number;
};

type JupiterTokenResponse = {
  id: string;
  symbol?: string;
  name?: string;
  organicScore?: number;
  isVerified?: boolean;
  tags?: string[];
  stats24h?: JupiterTokenStats;
  stats6h?: JupiterTokenStats;
  stats1h?: JupiterTokenStats;
  stats5m?: JupiterTokenStats;
};

type TickerEntry = {
  id: string;
  symbol: string;
  priceChangePct: number;
};

const FALLBACK_ENTRIES: TickerEntry[] = DEFAULT_TOKEN_OPTIONS.slice(0, 8).map(
  (token, index) => ({
    id: `${token.mint}-${index}`,
    symbol: token.symbol,
    priceChangePct: 0,
  }),
);

const pickPriceChange = (token: JupiterTokenResponse): number | null => {
  const stats = token.stats6h;
  if (!stats) return null;
  const value = stats.priceChange;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

export const Ticker = () => {
  const [entries, setEntries] = useState<TickerEntry[]>([]);
  const [repeatCount, setRepeatCount] = useState(1);
  const [durationSeconds, setDurationSeconds] = useState(28);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadTicker = async () => {
      try {
        const response = await fetch(TOP_ORGANIC_URL, {
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`Ticker request failed (${response.status})`);
        }

        const tokens = (await response.json()) as JupiterTokenResponse[];
        if (cancelled) return;

        const filtered = tokens
          .filter((token) => {
            const verified = token.isVerified || token.tags?.includes("verified");
            const score = token.organicScore ?? 0;
            return verified && score >= MIN_ORGANIC_SCORE;
          })
          .map((token) => {
            const priceChange = pickPriceChange(token);
            return {
              id: token.id,
              symbol: token.symbol ?? token.name ?? token.id.slice(0, 4),
              priceChangePct: priceChange ?? 0,
            } satisfies TickerEntry;
          })
          .filter((entry) => entry.symbol);

        if (!filtered.length) return;

        setEntries(filtered.slice(0, MAX_TICKER_ITEMS));
      } catch (error) {
        console.error("Failed to load ticker tokens", error);
      }
    };

    void loadTicker();

    const interval = window.setInterval(loadTicker, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const displayEntries = useMemo(() => {
    if (entries.length === 0) return FALLBACK_ENTRIES;
    return entries;
  }, [entries]);

  useEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    let frame: number | null = null;

    const update = () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      frame = requestAnimationFrame(() => {
        const containerWidth = container.offsetWidth;
        const contentWidth = measure.scrollWidth;
        if (!containerWidth || !contentWidth) return;

        const nextRepeat = Math.max(1, Math.ceil(containerWidth / contentWidth));
        setRepeatCount((prev) => (prev === nextRepeat ? prev : nextRepeat));

        const sequenceWidth = contentWidth * nextRepeat;
        const pixelsPerSecond = 35;
        const nextDuration = Math.max(
          18,
          Math.round((sequenceWidth / pixelsPerSecond) * 10) / 10,
        );
        setDurationSeconds((prev) =>
          prev === nextDuration ? prev : nextDuration,
        );
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    observer.observe(measure);

    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [displayEntries]);

  const sequenceEntries = useMemo(() => {
    if (repeatCount <= 1) return displayEntries;
    const repeated: TickerEntry[] = [];
    for (let i = 0; i < repeatCount; i += 1) {
      repeated.push(...displayEntries);
    }
    return repeated;
  }, [displayEntries, repeatCount]);

  const renderItems = (items: TickerEntry[], keyPrefix: string) =>
    items.map((item, index) => {
      const price = Number.isFinite(item.priceChangePct)
        ? item.priceChangePct
        : 0;
      const formatted = price === 0 ? "0.0" : price.toFixed(1);
      const sign = price > 0 ? "+" : "";
      const isPositive = price >= 0;

      return (
        <span
          key={`${keyPrefix}-${item.id}-${index}-${sign}${formatted}`}
          className={`${styles.tickerItem} ${
            isPositive ? styles.tickerPositive : styles.tickerNegative
          }`}
        >
          {item.symbol} {sign}
          {formatted}%
        </span>
      );
    });

  return (
    <div
      className={styles.tickerBar}
      ref={containerRef}
      style={{ "--ticker-duration": `${durationSeconds}s` } as CSSProperties}
      aria-label="Top Solana tokens by organic score"
    >
      <div className={styles.tickerTrack}>
        <div className={styles.tickerContent}>
          {renderItems(sequenceEntries, "a")}
        </div>
        <div className={styles.tickerContent} aria-hidden="true">
          {renderItems(sequenceEntries, "b")}
        </div>
      </div>
      <div
        className={`${styles.tickerTrack} ${styles.tickerMeasure}`}
        ref={measureRef}
        aria-hidden="true"
      >
        <div className={styles.tickerContent}>
          {renderItems(displayEntries, "m")}
        </div>
      </div>
    </div>
  );
};
