"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildApiUrl } from "@/lib/api";
import styles from "./BuybackProgress.module.css";

type BuybackStatus = {
  enabled: boolean;
  wallet: string | null;
  collectedSol: number | null;
  floorSol: number | null;
  progress: number | null;
  remainingSol: number | null;
  feeAccounts?: {
    ready: boolean;
    wsol: boolean;
    usdc: boolean;
    usdt: boolean;
  };
  automation?: {
    ready: boolean;
    reason: string | null;
  };
  updatedAt: string;
};

const solFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});

const formatSol = (value: number | null) =>
  value === null || !Number.isFinite(value)
    ? null
    : solFormatter.format(value);

const TOAST_DURATION_MS = 2000;
const POP_DURATION_MS = 650;

export const BuybackProgress = () => {
  const [status, setStatus] = useState<BuybackStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const prevProgressRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);
  const popTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let activeController: AbortController | null = null;

    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      const controller = new AbortController();
      activeController = controller;
      try {
        setError(null);
        const response = await fetch(buildApiUrl("/api/frogx/buyback"), {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`status ${response.status}`);
        }
        const data = (await response.json()) as BuybackStatus;
        if (!cancelled) {
          setStatus(data);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError" && !cancelled) {
          setError("Buyback feed offline");
        }
      } finally {
        if (activeController === controller) {
          activeController = null;
        }
        inFlight = false;
      }
    };

    void load();
    const interval = window.setInterval(() => void load(), 5_000);
    return () => {
      cancelled = true;
      activeController?.abort();
      window.clearInterval(interval);
    };
  }, []);

  const rawProgress = useMemo(() => {
    if (!status) return 0;
    if (typeof status.progress === "number") {
      return Math.min(Math.max(status.progress, 0), 1);
    }
    if (
      typeof status.collectedSol === "number" &&
      typeof status.floorSol === "number" &&
      status.floorSol > 0
    ) {
      return Math.min(status.collectedSol / status.floorSol, 1);
    }
    return 0;
  }, [status]);

  useEffect(() => {
    const prev = prevProgressRef.current;
    if (prev < 1 && rawProgress >= 1) {
      setCelebrate(true);
      setToastVisible(true);
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      if (popTimerRef.current) {
        window.clearTimeout(popTimerRef.current);
      }
      popTimerRef.current = window.setTimeout(() => {
        setCelebrate(false);
      }, POP_DURATION_MS);
      toastTimerRef.current = window.setTimeout(() => {
        setToastVisible(false);
      }, TOAST_DURATION_MS);
    }
    prevProgressRef.current = rawProgress;
  }, [rawProgress]);

  useEffect(() => () => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    if (popTimerRef.current) {
      window.clearTimeout(popTimerRef.current);
    }
  }, []);

  const percent = rawProgress * 100;
  const roundedPercent = Math.round(percent);
  const percentLabel =
    percent > 0 && percent < 1 ? "<1%" : `${roundedPercent}%`;
  const automationPaused = status?.automation?.ready === false;

  const solLabel = useMemo(() => {
    if (!status) return null;
    const collected = formatSol(status.collectedSol);
    if (collected === null) return null;
    const floor = formatSol(status.floorSol);
    return floor === null ? `${collected} SOL` : `${collected} / ${floor} SOL`;
  }, [status]);

  return (
    <section
      className={`${styles.panel} ${celebrate ? styles.celebrate : ""}`}
      aria-live="polite"
    >
      {toastVisible ? (
        <div className={styles.toast} role="status">
          <div className={styles.confetti} aria-hidden="true">
            {Array.from({ length: 12 }).map((_, index) => (
              <span key={`confetti-${index}`} className={styles.confettiPiece} />
            ))}
          </div>
          <div className={styles.toastBubble}>Burn ready! Frog incoming.</div>
        </div>
      ) : null}
      <h2 className={styles.heading}>Buy Back &amp; Burn Progress</h2>
      <div className={styles.barRow}>
        <div
          className={styles.track}
          role="progressbar"
          aria-label="Progress to next frog burn"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={error ? undefined : Number(percent.toFixed(2))}
        >
          <div
            className={styles.fill}
            style={{ width: `${error ? 0 : percent}%` }}
          />
        </div>
        <span className={styles.fire} aria-hidden="true">
          🔥
        </span>
      </div>
      <p className={styles.label}>
        {error
          ? "—"
          : solLabel
            ? `${solLabel} · ${percentLabel}${automationPaused ? " · automation paused" : ""}`
            : `${percentLabel}${automationPaused ? " · automation paused" : ""}`}
      </p>
    </section>
  );
};
