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
  updatedAt: string;
};

const numberFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

const formatSol = (value: number | null) =>
  value === null || !Number.isFinite(value)
    ? "—"
    : numberFormatter.format(value);

const TOAST_DURATION_MS = 2000;
const POP_DURATION_MS = 650;
const RESET_DELAY_MS = 5000;

export const BuybackProgress = () => {
  const [status, setStatus] = useState<BuybackStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [forceReset, setForceReset] = useState(false);
  const prevProgressRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);
  const popTimerRef = useRef<number | null>(null);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
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
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    const interval = window.setInterval(load, 5_000);
    return () => {
      cancelled = true;
      controller.abort();
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
      setForceReset(false);
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      if (popTimerRef.current) {
        window.clearTimeout(popTimerRef.current);
      }
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current);
      }
      popTimerRef.current = window.setTimeout(() => {
        setCelebrate(false);
      }, POP_DURATION_MS);
      toastTimerRef.current = window.setTimeout(() => {
        setToastVisible(false);
      }, TOAST_DURATION_MS);
      resetTimerRef.current = window.setTimeout(() => {
        setForceReset(true);
      }, RESET_DELAY_MS);
    }
    if (rawProgress < 1) {
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current);
      }
      setForceReset(false);
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
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
    }
  }, []);

  const remainingSol = useMemo(() => {
    if (!status) return null;
    if (typeof status.remainingSol === "number") {
      return status.remainingSol;
    }
    if (
      typeof status.collectedSol === "number" &&
      typeof status.floorSol === "number"
    ) {
      return Math.max(status.floorSol - status.collectedSol, 0);
    }
    return null;
  }, [status]);

  const displayProgress = useMemo(() => {
    if (forceReset) return 0;
    return rawProgress;
  }, [forceReset, rawProgress]);

  const displayRemainingSol = useMemo(() => {
    if (!status) return null;
    if (forceReset && typeof status.floorSol === "number") {
      return status.floorSol;
    }
    return remainingSol;
  }, [forceReset, remainingSol, status]);

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
          <div className={styles.toastBubble}>
            Burn ready! Frog incoming.
          </div>
        </div>
      ) : null}
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>SBF BUYBACK + BURN</p>
          <h2 className={styles.title}>Next frog burn tracker</h2>
        </div>
        <span className={styles.status}>
          {loading ? "Loading..." : status?.enabled ? "Live" : "Offline"}
        </span>
      </div>
      {error ? (
        <p className={styles.error}>{error}</p>
      ) : (
        <>
          <div className={styles.metrics}>
            <div>
              <p className={styles.metricLabel}>Floor price</p>
              <p className={styles.metricValue}>
                {formatSol(status?.floorSol ?? null)}
              </p>
            </div>
            <div>
              <p className={styles.metricLabel}>SOL needed</p>
              <p className={styles.metricValue}>
                {formatSol(displayRemainingSol)}
              </p>
            </div>
          </div>
          <div className={styles.progressBar} role="img" aria-label="Buyback progress">
            <div
              className={styles.progressFill}
              style={{ width: `${Math.round(displayProgress * 100)}%` }}
            />
          </div>
          <p className={styles.progressLabel}>
            {Math.round(displayProgress * 100)}% to next burn
          </p>
        </>
      )}
    </section>
  );
};
