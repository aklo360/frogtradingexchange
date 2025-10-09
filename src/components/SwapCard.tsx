"use client";

import { useState } from "react";
import { useQuotePreview } from "@/lib/hooks/useQuotePreview";
import { clampSlippage, toBaseUnits } from "@/lib/solana/validation";
import styles from "./SwapCard.module.css";

type TokenOption = {
  label: string;
  mint: string;
  decimals: number;
};

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

type PriorityFeeKey = "standard" | "fast" | "turbo";

const PRIORITY_FEE_PRESETS: Record<PriorityFeeKey, number> = {
  standard: 0,
  fast: 5000,
  turbo: 10000,
};

const formatMint = (mint: string) =>
  `${mint.slice(0, 4)}…${mint.slice(mint.length - 4)}`;

export const SwapCard = () => {
  const [fromMint, setFromMint] = useState(DEMO_TOKENS[0]);
  const [toMint, setToMint] = useState(DEMO_TOKENS[1]);
  const [amountIn, setAmountIn] = useState("1.00");
  const [slippageBps, setSlippageBps] = useState(50);
  const [priorityFee, setPriorityFee] = useState<PriorityFeeKey>("standard");

  const amountNumeric = Number(amountIn);
  const amountInBaseUnits =
    Number.isFinite(amountNumeric) && amountNumeric > 0
      ? toBaseUnits(amountNumeric, fromMint.decimals)
      : "0";

  const quoteState = useQuotePreview({
    inMint: fromMint.mint,
    outMint: toMint.mint,
    amountIn: amountInBaseUnits,
    slippageBps: clampSlippage(slippageBps),
    priorityFee: PRIORITY_FEE_PRESETS[priorityFee],
  });

  const routersLabel =
    quoteState.status === "success"
      ? quoteState.data.routers.join(" → ")
      : quoteState.status === "error"
        ? "Failed to load"
        : "Streaming…";

  const priceImpactLabel =
    quoteState.status === "success"
      ? `${(quoteState.data.priceImpactBps / 100).toFixed(2)}%`
      : "—";

  const amountOutLabel =
    quoteState.status === "success" ? quoteState.data.amountOut : "—";

  const quoteStatusLabel = (() => {
    if (quoteState.status === "loading") return "Refreshing quote…";
    if (quoteState.status === "error")
      return `Error: ${quoteState.error.slice(0, 80)}`;
    if (quoteState.status === "success") {
      return quoteState.data.executable
        ? `Executable as of ${new Date(quoteState.data.updatedAt).toLocaleTimeString()}`
        : "Quote stale";
    }
    return "Awaiting input";
  })();

  return (
    <div className={styles.swapCard}>
      <header className={styles.header}>
        <h1>Frog Trading Exchange</h1>
        <p>Solana swaps with Titan’s streaming quotes.</p>
      </header>

      <section className={styles.panel}>
        <div className={styles.field}>
          <label htmlFor="fromMint">From</label>
          <select
            id="fromMint"
            value={fromMint.mint}
            onChange={(event) => {
              const next = DEMO_TOKENS.find(
                (token) => token.mint === event.target.value,
              );
              if (next) {
                setFromMint(next);
                if (next.mint === toMint.mint) {
                  setToMint(
                    DEMO_TOKENS.find((token) => token.mint !== next.mint) ??
                      DEMO_TOKENS[0],
                  );
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
          <span className={styles.hint}>{formatMint(fromMint.mint)}</span>
        </div>

        <div className={styles.field}>
          <label htmlFor="toMint">To</label>
          <select
            id="toMint"
            value={toMint.mint}
            onChange={(event) => {
              const next = DEMO_TOKENS.find(
                (token) =>
                  token.mint === event.target.value &&
                  token.mint !== fromMint.mint,
              );
              if (next) {
                setToMint(next);
              }
            }}
          >
            {DEMO_TOKENS.filter((token) => token.mint !== fromMint.mint).map(
              (token) => (
                <option key={token.mint} value={token.mint}>
                  {token.label}
                </option>
              ),
            )}
          </select>
          <span className={styles.hint}>{formatMint(toMint.mint)}</span>
        </div>

        <div className={styles.field}>
          <label htmlFor="amountIn">Amount In</label>
          <input
            id="amountIn"
            inputMode="decimal"
            value={amountIn}
            onChange={(event) => setAmountIn(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="slippage">Slippage (bps)</label>
          <input
            id="slippage"
            inputMode="numeric"
            value={slippageBps}
            onChange={(event) => setSlippageBps(Number(event.target.value))}
            min={5}
            max={500}
            step={5}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="priority">Priority Fee</label>
          <select
            id="priority"
            value={priorityFee}
            onChange={(event) => setPriorityFee(event.target.value as PriorityFeeKey)}
          >
            <option value="standard">Standard</option>
            <option value="fast">Fast</option>
            <option value="turbo">Turbo</option>
          </select>
        </div>

        <button className={styles.cta} type="button" disabled>
          Connect Wallet to Swap
        </button>
      </section>

      <aside className={styles.quote}>
        <h2>Quote Preview</h2>
        <dl>
          <div>
            <dt>Amount Out (mock units)</dt>
            <dd>{amountOutLabel}</dd>
          </div>
          <div>
            <dt>Routers</dt>
            <dd>{routersLabel}</dd>
          </div>
          <div>
            <dt>Price Impact</dt>
            <dd>{priceImpactLabel}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{quoteStatusLabel}</dd>
          </div>
        </dl>
        <p className={styles.disclaimer}>
          Live streaming quotes, Titan failover, and Solana transaction build
          will wire in once APIs are available.
        </p>
      </aside>
    </div>
  );
};
