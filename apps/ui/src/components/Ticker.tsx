"use client";

import { useEffect, useMemo, useState } from "react";
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

  const renderItems = (items: TickerEntry[]) =>
    items.map((item) => {
      const price = Number.isFinite(item.priceChangePct)
        ? item.priceChangePct
        : 0;
      const formatted = price === 0 ? "0.0" : price.toFixed(1);
      const sign = price > 0 ? "+" : "";
      const isPositive = price >= 0;

      return (
        <span
          key={`${item.id}-${sign}${formatted}`}
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
    <div className={styles.tickerBar} aria-label="Top Solana tokens by organic score">
      <div className={styles.tickerTrack}>
        <div className={styles.tickerContent}>{renderItems(displayEntries)}</div>
        <div className={styles.tickerContent} aria-hidden="true">
          {renderItems(displayEntries)}
        </div>
      </div>
    </div>
  );
};
