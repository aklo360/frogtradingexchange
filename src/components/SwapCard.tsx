"use client";

import { Buffer } from "buffer";
import { useEffect, useMemo, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  AddressLookupTableAccount,
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { useQuotePreview } from "@/lib/hooks/useQuotePreview";
import { toBaseUnits } from "@/lib/solana/validation";
import styles from "./SwapCard.module.css";

type TokenOption = {
  label: string;
  mint: string;
  decimals: number;
};

type QuoteInstructionAccount = {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
};

type QuoteInstruction = {
  programId: string;
  accounts: QuoteInstructionAccount[];
  data: string;
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

const DEFAULT_SLIPPAGE_BPS = 50;
const DEFAULT_PRIORITY_FEE = 0;

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
  const [amountIn, setAmountIn] = useState("0");
  const [solBalanceLamports, setSolBalanceLamports] = useState<number | null>(
    null,
  );
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [lastSignature, setLastSignature] = useState<string | null>(null);

  const { connection } = useConnection();
  const { connected, publicKey, disconnect, disconnecting, sendTransaction } =
    useWallet();
  const { setVisible } = useWalletModal();

  const walletConnected = Boolean(connected && publicKey);
  const publicKeyBase58 = publicKey?.toBase58();

  const parsedAmount = Number(amountIn);
  const sanitizedAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;

  const amountInBaseUnits =
    sanitizedAmount > 0
      ? toBaseUnits(sanitizedAmount, fromMint.decimals)
      : "0";

  const quoteState = useQuotePreview({
    inMint: fromMint.mint,
    outMint: toMint.mint,
    amountIn: amountInBaseUnits,
    slippageBps: DEFAULT_SLIPPAGE_BPS,
    priorityFee: DEFAULT_PRIORITY_FEE,
    userPublicKey: publicKeyBase58,
    enabled: walletConnected,
  });

  const quoteData = quoteState.status === "success" ? quoteState.data : null;

  useEffect(() => {
    let cancelled = false;

    if (!walletConnected || !publicKey) {
      setSolBalanceLamports(null);
      return;
    }

    const refreshBalance = async () => {
      try {
        setBalanceLoading(true);
        const lamports = await connection.getBalance(publicKey, {
          commitment: "processed",
        });
        if (!cancelled) {
          setSolBalanceLamports(lamports);
        }
      } catch (error) {
        if (!cancelled) {
          setSolBalanceLamports(0);
        }
        console.error("Failed to load SOL balance", error);
      } finally {
        if (!cancelled) {
          setBalanceLoading(false);
        }
      }
    };

    void refreshBalance();

    return () => {
      cancelled = true;
    };
  }, [connection, publicKey, walletConnected]);

  const amountOutValue = useMemo(() => {
    if (!quoteData) return 0;
    const numeric = Number(quoteData.amountOut);
    const divisor = 10 ** toMint.decimals;
    return Number.isFinite(numeric) ? numeric / divisor : 0;
  }, [quoteData, toMint.decimals]);

  const minReceived = amountOutValue * (1 - DEFAULT_SLIPPAGE_BPS / 10_000);
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
    if (!walletConnected) {
      return "Connect a wallet to start streaming quotes.";
    }
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
    if (!walletConnected) {
      return { label: "Connect Wallet", tone: styles.statusPending };
    }
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
    walletConnected && amountOutValue > 0
      ? formatNumber(amountOutValue, 6)
      : "0.000000";

  const minReceivedLabel =
    walletConnected && minReceived > 0
      ? `${formatNumber(minReceived, 6)} ${toMint.label}`
      : "—";

  const pricePerInLabel =
    walletConnected && pricePerIn > 0
      ? `${formatNumber(pricePerIn, 6)} ${toMint.label}`
      : "—";

  const decodeBase64ToUint8Array = (value: string) => {
    if (typeof atob === "function") {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    }

    const buffer = Buffer.from(value, "base64");
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  };

  const toTransactionInstruction = (instruction: QuoteInstruction) =>
    new TransactionInstruction({
      programId: new PublicKey(instruction.programId),
      keys: instruction.accounts.map((account) => ({
        pubkey: new PublicKey(account.pubkey),
        isSigner: account.isSigner,
        isWritable: account.isWritable,
      })),
      data: Buffer.from(instruction.data, "base64"),
    });

  const loadLookupTables = async (addresses: string[]) => {
    if (!addresses.length) {
      return [] as AddressLookupTableAccount[];
    }

    const tables = await Promise.all(
      addresses.map(async (address) => {
        const lookup = await connection.getAddressLookupTable(
          new PublicKey(address),
        );
        return lookup.value ?? null;
      }),
    );

    return tables.filter(
      (table): table is AddressLookupTableAccount => Boolean(table),
    );
  };

  const buildTransactionFromInstructions = async () => {
    if (!quoteData?.instructions?.length || !publicKey) {
      throw new Error("Quote missing route instructions");
    }

    const instructionList =
      quoteData.instructions?.map(toTransactionInstruction) ?? [];
    const lookupTables = await loadLookupTables(
      quoteData.addressLookupTables ?? [],
    );
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("finalized");
    const message = new TransactionMessage({
      payerKey: publicKey,
      recentBlockhash: blockhash,
      instructions: instructionList,
    }).compileToV0Message(lookupTables);

    return {
      transaction: new VersionedTransaction(message),
      blockhash,
      lastValidBlockHeight,
    };
  };

  const handleSwitchTokens = () => {
    setFromMint(toMint);
    setToMint(fromMint);
  };

  const handleAmountChange = (value: string) => {
    if (value === "" || /^\d*(\.\d*)?$/.test(value)) {
      setAmountIn(value);
    }
  };

  const solBalance = solBalanceLamports !== null ? solBalanceLamports / LAMPORTS_PER_SOL : 0;
  const balanceLabel = walletConnected
    ? balanceLoading
      ? "…"
      : formatNumber(solBalance, 4)
    : "—";

  const isSolSelected = fromMint.mint === DEMO_TOKENS[0].mint;
  const canUseBalanceShortcuts = walletConnected && isSolSelected && solBalanceLamports !== null;
  const displayedBalance = isSolSelected ? balanceLabel : "—";

  const toInputAmount = (value: number) => {
    const fixed = value.toFixed(6);
    return fixed.replace(/\.0+$|0+$/, "").replace(/\.$/, "");
  };

  const handleBalanceShortcut = (ratio: number) => {
    if (!canUseBalanceShortcuts) return;
    const target = (solBalanceLamports ?? 0) * ratio;
    const amountInSol = target / LAMPORTS_PER_SOL;
    setAmountIn(amountInSol > 0 ? toInputAmount(amountInSol) : "0");
  };

  useEffect(() => {
    setSwapError(null);
    setLastSignature(null);
    setIsSwapping(false);
  }, [quoteData?.routeId, walletConnected]);

  const hasExecutableQuote = Boolean(
    walletConnected &&
      quoteData &&
      (quoteData.transactionBase64 ||
        (quoteData.instructions?.length ?? 0) > 0),
  );

  const handleSwap = async () => {
    if (!walletConnected) {
      setVisible(true);
      return;
    }

    if (!publicKey || !sendTransaction) {
      setSwapError("Wallet does not support sending transactions");
      return;
    }

    if (!hasExecutableQuote) {
      setSwapError("Quote not ready for execution");
      return;
    }

    try {
      setIsSwapping(true);
      setSwapError(null);

      let transaction: VersionedTransaction;
      let confirmationParams: { blockhash: string; lastValidBlockHeight: number } | null =
        null;

      if (quoteData.transactionBase64) {
        const bytes = decodeBase64ToUint8Array(quoteData.transactionBase64);
        transaction = VersionedTransaction.deserialize(bytes);
      } else {
        const built = await buildTransactionFromInstructions();
        transaction = built.transaction;
        confirmationParams = {
          blockhash: built.blockhash,
          lastValidBlockHeight: built.lastValidBlockHeight,
        };
      }

      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: false,
      });

      if (confirmationParams) {
        await connection.confirmTransaction(
          {
            signature,
            blockhash: confirmationParams.blockhash,
            lastValidBlockHeight: confirmationParams.lastValidBlockHeight,
          },
          "confirmed",
        );
      } else {
        await connection.confirmTransaction(signature, "confirmed");
      }

      setLastSignature(signature);
    } catch (error) {
      console.error("Swap failed", error);
      setSwapError((error as Error).message ?? "Swap failed");
    } finally {
      setIsSwapping(false);
    }
  };

  const primaryActionLabel = (() => {
    if (!walletConnected) return "Connect Wallet";
    if (isSwapping) return "Swapping...";
    if (hasExecutableQuote) return "Swap";
    if (quoteState.status === "loading") return "Fetching quote...";
    return "Swap (Coming Soon)";
  })();

  const primaryActionDisabled = walletConnected
    ? !hasExecutableQuote || isSwapping
    : false;

  const handlePrimaryAction = () => {
    if (!walletConnected) {
      setVisible(true);
      return;
    }

    if (!hasExecutableQuote || isSwapping) {
      return;
    }

    void handleSwap();
  };

  return (
    <div className={styles.swapCard}>
      <header className={styles.header}>
        <div>
          <span className={styles.badge}>Swap</span>
        </div>
        <div className={styles.swapMeta}>
          <span className={`${styles.statusPill} ${statusBadge.tone}`}>
            {statusBadge.label}
          </span>
          {walletConnected && (
            <button
              type="button"
              className={styles.disconnectButton}
              onClick={() => void disconnect()}
              disabled={disconnecting}
            >
              Disconnect
            </button>
          )}
        </div>
      </header>

      <section className={styles.tradeBox}>
        <div className={styles.tokenRow}>
          <div className={styles.rowHeader}>
            <span className={styles.rowLabel}>You Pay</span>
            <div className={styles.balanceGroup}>
              <span className={styles.balanceLabel}>
                Balance: {displayedBalance} {fromMint.label}
              </span>
              {canUseBalanceShortcuts && (
                <div className={styles.balanceShortcuts}>
                  <button
                    type="button"
                    className={styles.shortcutButton}
                    onClick={() => handleBalanceShortcut(0.5)}
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    className={styles.shortcutButton}
                    onClick={() => handleBalanceShortcut(1)}
                  >
                    Max
                  </button>
                </div>
              )}
            </div>
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
          <svg
            className={styles.switchIcon}
            viewBox="0 0 48 32"
            role="img"
            aria-hidden="true"
            focusable="false"
            shapeRendering="crispEdges"
          >
            <g className={styles.arrowUp}>
              <rect x="8" y="2" width="4" height="4" />
              <rect x="4" y="6" width="4" height="4" />
              <rect x="8" y="6" width="4" height="4" />
              <rect x="12" y="6" width="4" height="4" />
              <rect x="0" y="10" width="4" height="4" />
              <rect x="4" y="10" width="4" height="4" />
              <rect x="8" y="10" width="4" height="4" />
              <rect x="12" y="10" width="4" height="4" />
              <rect x="16" y="10" width="4" height="4" />
              <rect x="8" y="14" width="4" height="4" />
              <rect x="8" y="18" width="4" height="4" />
            </g>
            <g className={styles.arrowDown} transform="translate(24 0)">
              <rect x="8" y="26" width="4" height="4" />
              <rect x="4" y="22" width="4" height="4" />
              <rect x="8" y="22" width="4" height="4" />
              <rect x="12" y="22" width="4" height="4" />
              <rect x="0" y="18" width="4" height="4" />
              <rect x="4" y="18" width="4" height="4" />
              <rect x="8" y="18" width="4" height="4" />
              <rect x="12" y="18" width="4" height="4" />
              <rect x="16" y="18" width="4" height="4" />
              <rect x="8" y="14" width="4" height="4" />
              <rect x="8" y="10" width="4" height="4" />
            </g>
          </svg>
          <span className={styles.srOnly}>Switch tokens</span>
        </button>

        <div className={styles.tokenRow}>
          <div className={styles.rowHeader}>
            <span className={styles.rowLabel}>You Receive</span>
            <span className={styles.estimateTag}>
              ≈ {formattedAmountOut} {toMint.label}
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

      {walletConnected && (
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
      )}

      <button
        className={styles.swapButton}
        type="button"
        onClick={handlePrimaryAction}
        disabled={primaryActionDisabled || disconnecting}
      >
        {primaryActionLabel}
      </button>
      {swapError && (
        <p className={styles.swapFeedbackError}>{swapError}</p>
      )}
      {lastSignature && !swapError && (
        <p className={styles.swapFeedback}>
          Swap sent:
          {" "}
          <a
            href={`https://solscan.io/tx/${lastSignature}`}
            target="_blank"
            rel="noreferrer"
          >
            {lastSignature}
          </a>
        </p>
      )}
    </div>
  );
};
