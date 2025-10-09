"use client";

import { useMemo, useState } from "react";
import { useQuotePreview } from "@/lib/hooks/useQuotePreview";
import { clampSlippage, toBaseUnits } from "@/lib/solana/validation";
import styles from "./SwapCard.module.css";

type TokenOption = {
  label: string;
  mint: string;
  decimals: number;
};

type PriorityFeeKey = "standard" | "fast" | "turbo";

const DEMO_TOKENS: TokenOption[] = [
  {
    label: "SOL",
    mint: "So11111111111111111111111111111111111111112",
    decimals: 9,
  },
  {
    label: "USDC",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
  },
  {
    label: "FROG",
    mint: "Fr0g1111111111111111111111111111111111111111",
    decimals: 6,
  },
];

const PRIORITY_FEE_PRESETS: Record<PriorityFeeKey, number> = {
  standard: 0,
  fast: 5_000,
  turbo: 10_000,
};

const formatMint = (mint: string) =>
  `${mint.slice(0, 4)}…${mint.slice(mint.length - 4)}`;

const formatNumber = (value: number, maximumFractionDigits = 6) =>
  Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits,
      }).format(value)
    : "—";

export const SwapCard = () => {
  const [fromMint, setFromMint] = useState(DEMO_TOKENS[0]);
  const [toMint, setToMint] = useState(DEMO_TOKENS[1]);
  const [amountIn, setAmountIn] = useState("1.00");
  const [slippageBps, setSlippageBps] = useState(50);
  const [priorityFee, setPriorityFee] = useState<PriorityFeeKey>("standard");

  const parsedAmount = Number(amountIn);
  const sanitizedAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
  const sanitizedSlippage = clampSlippage(slippageBps);

  const amountInBaseUnits =
    sanitizedAmount > 0
      ? toBaseUnits(sanitizedAmount, fromMint.decimals)
      : "0";

  const quoteState = useQuotePreview({
    inMint: fromMint.mint,
    outMint: toMint.mint,
    amountIn: amountInBaseUnits,
    slippageBps: sanitizedSlippage,
    priorityFee: PRIORITY_FEE_PRESETS[priorityFee],
  });

  const quoteData = quoteState.status === "success" ? quoteState.data : null;

  const amountOutValue = useMemo(() => {
    if (!quoteData) return 0;
    const numeric = Number(quoteData.amountOut);
    const divisor = 10 ** toMint.decimals;
    return Number.isFinite(numeric) ? numeric / divisor : 0;
  }, [quoteData, toMint.decimals]);

  const minReceived = amountOutValue * (1 - sanitizedSlippage / 10_000);
  const pricePerIn = sanitizedAmount > 0 ? amountOutValue / sanitizedAmount : 0;

  const routersLabel = quoteData
    ? quoteData.routers.join(" → ")
    : quoteState.status === "error"
      ? "Failed to load"
      : "Streaming…";

  const priceImpactLabel = quoteData
    ? `${(quoteData.priceImpactBps / 100).toFixed(2)}%`
    : "—";

  const quoteStatusLabel = (() => {
    if (quoteState.status === "loading") return "Refreshing quote…";
    if (quoteState.status === "error") {
      const message = quoteState.error ?? "Unknown";
      return `Error: ${message}`;
    }
    if (quoteData) {
      return quoteData.executable
        ? `Executable as of ${new Date(quoteData.updatedAt).toLocaleTimeString()}`
        : "Quote stale";
    }
    return "Awaiting input";
  })();

  const statusBadge = (() => {
    if (quoteState.status === "error") {
      return { label: "Error", tone: styles.statusError };
    }
    if (quoteState.status === "loading") {
      return { label: "Loading", tone: styles.statusPending };
    }
    if (quoteData) {
      return quoteData.executable
        ? { label: "Executable", tone: styles.statusSuccess }
        : { label: "Stale", tone: styles.statusPending };
    }
    return { label: "Idle", tone: styles.statusPending };
  })();

  const formattedAmountOut =
    amountOutValue > 0 ? formatNumber(amountOutValue, 6) : "0.000000";

  const minReceivedLabel =
    minReceived > 0
      ? `${formatNumber(minReceived, 6)} ${toMint.label}`
      : "—";

  const pricePerInLabel =
    pricePerIn > 0 ? `${formatNumber(pricePerIn, 6)} ${toMint.label}` : "—";

  const handleSwitchTokens = () => {
    setFromMint(toMint);
    setToMint(fromMint);
  };

  const handleAmountChange = (value: string) => {
    if (value === "" || /^\d*(\.\d*)?$/.test(value)) {
      setAmountIn(value);
    }
  };

  return (
    <div className={styles.swapCard}>
      <header className={styles.header}>
        <div>
          <span className={styles.badge}>Swap</span>
          <h1>Frog Trading Exchange</h1>
          <p className={styles.tagline}>
            Titan-powered Solana swaps with a Super Nintendo frog gloss.
          </p>
        </div>
        <div className={styles.swapMeta}>
          <span className={`${styles.statusPill} ${statusBadge.tone}`}>
            {statusBadge.label}
          </span>
          <span className={styles.metaNote}>Quotes auto-refresh in demo mode</span>
        </div>
      </header>

      <section className={styles.tradeBox}>
        <div className={styles.tokenRow}>
          <div className={styles.rowHeader}>
            <span className={styles.rowLabel}>You Pay</span>
            <button type="button" className={styles.balanceButton}>
              Balance: 0.00 {fromMint.label}
            </button>
          </div>

          <div className={styles.tokenControls}>
            <div className={styles.tokenSelectGroup}>
              <label className={styles.srOnly} htmlFor="fromMint">
                Select token to pay
              </label>
              <select
                id="fromMint"
                className={styles.tokenSelect}
                value={fromMint.mint}
                onChange={(event) => {
                  const next = DEMO_TOKENS.find(
                    (token) => token.mint === event.target.value,
                  );
                  if (!next) return;

                  setFromMint(next);

                  if (next.mint === toMint.mint) {
                    const fallback = DEMO_TOKENS.find(
                      (token) => token.mint !== next.mint,
                    );
                    if (fallback) {
                      setToMint(fallback);
                    }
                  }
                }}
              >
                {DEMO_TOKENS.map((token) => (
                  <option key={token.mint} value={token.mint}>
                    {token.label}
                  </option>
                ))}
              </select>
              <span className={styles.mintHint}>{formatMint(fromMint.mint)}</span>
            </div>

            <div className={styles.amountGroup}>
              <label className={styles.srOnly} htmlFor="fromAmount">
                Amount to pay
              </label>
              <input
                id="fromAmount"
                className={styles.tokenAmount}
                inputMode="decimal"
                value={amountIn}
                onChange={(event) => handleAmountChange(event.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          className={styles.switchButton}
          onClick={handleSwitchTokens}
          aria-label="Switch tokens"
        >
          <span className={styles.switchIcon} aria-hidden="true" />
          <span className={styles.srOnly}>Switch tokens</span>
        </button>

        <div className={styles.tokenRow}>
          <div className={styles.rowHeader}>
            <span className={styles.rowLabel}>You Receive</span>
            <span className={styles.estimateTag}>
              Est. Output: {formattedAmountOut} {toMint.label}
            </span>
          </div>

          <div className={styles.tokenControls}>
            <div className={styles.tokenSelectGroup}>
              <label className={styles.srOnly} htmlFor="toMint">
                Select token to receive
              </label>
              <select
                id="toMint"
                className={styles.tokenSelect}
                value={toMint.mint}
                onChange={(event) => {
                  const next = DEMO_TOKENS.find(
                    (token) => token.mint === event.target.value,
                  );
                  if (next && next.mint !== fromMint.mint) {
                    setToMint(next);
                  }
                }}
              >
                {DEMO_TOKENS.map((token) => (
                  <option key={token.mint} value={token.mint}>
                    {token.label}
                  </option>
                ))}
              </select>
              <span className={styles.mintHint}>{formatMint(toMint.mint)}</span>
            </div>

            <div className={styles.amountGroup}>
              <label className={styles.srOnly} htmlFor="toAmount">
                Estimated amount to receive
              </label>
              <input
                id="toAmount"
                className={styles.tokenAmount}
                value={formattedAmountOut}
                readOnly
              />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.settingsRow}>
        <div className={styles.setting}>
          <span className={styles.settingLabel}>Slippage (bps)</span>
          <input
            className={styles.settingControl}
            id="slippage"
            inputMode="numeric"
            value={slippageBps}
            onChange={(event) => {
              const next = Number(event.target.value);
              setSlippageBps(Number.isFinite(next) ? next : slippageBps);
            }}
            min={5}
            max={500}
            step={5}
          />
        </div>
        <div className={styles.setting}>
          <span className={styles.settingLabel}>Priority Fee</span>
          <select
            id="priority"
            className={styles.settingControl}
            value={priorityFee}
            onChange={(event) =>
              setPriorityFee(event.target.value as PriorityFeeKey)
            }
          >
            <option value="standard">Standard</option>
            <option value="fast">Fast</option>
            <option value="turbo">Turbo</option>
          </select>
        </div>
      </section>

      <section className={styles.quoteSummary}>
        <h2>Quote Preview</h2>
        <div className={styles.summaryGrid}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Route</span>
            <span className={styles.summaryValue}>{routersLabel}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Price Impact</span>
            <span className={styles.summaryValue}>{priceImpactLabel}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>1 {fromMint.label}</span>
            <span className={styles.summaryValue}>{pricePerInLabel}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Min Received</span>
            <span className={styles.summaryValue}>{minReceivedLabel}</span>
          </div>
        </div>
        <p className={styles.summaryHelp}>{quoteStatusLabel}</p>
      </section>

      <button className={styles.swapButton} type="button" disabled>
        Connect Wallet to Swap
      </button>
    </div>
  );
};
