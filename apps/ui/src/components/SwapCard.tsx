"use client";

import { Buffer } from "buffer";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
import { buildApiUrl } from "@/lib/api";
import { toBaseUnits } from "@/lib/solana/validation";
import type { TokenOption } from "@/lib/tokens";
import {
  DEFAULT_TOKEN_OPTIONS,
  WRAPPED_SOL_MINT,
} from "@/lib/tokens";
import { TokenSelector } from "./TokenSelector";
import styles from "./SwapCard.module.css";

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

const DEFAULT_SLIPPAGE_BPS = 50;
const DEFAULT_PRIORITY_FEE = 0;

const formatNumber = (value: number, maximumFractionDigits = 6) =>
  Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits,
      }).format(value)
    : "—";

export const SwapCard = () => {
  const [fromToken, setFromToken] = useState<TokenOption>(
    DEFAULT_TOKEN_OPTIONS[0],
  );
  const [toToken, setToToken] = useState<TokenOption>(
    DEFAULT_TOKEN_OPTIONS[1],
  );
  const [amountIn, setAmountIn] = useState("0");
  // Balance of the currently selected pay token (display units, e.g., SOL/USDC)
  const [payBalance, setPayBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [lastSignature, setLastSignature] = useState<string | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const isBrowser = typeof window !== "undefined";

  const extractUiAmount = (data: unknown): number => {
    if (typeof data !== "object" || data === null) return 0;
    const maybeParsed = (data as Record<string, unknown>)["parsed"];
    if (typeof maybeParsed !== "object" || maybeParsed === null) return 0;
    const info = (maybeParsed as Record<string, unknown>)["info"];
    if (typeof info !== "object" || info === null) return 0;
    const tokenAmount = (info as Record<string, unknown>)["tokenAmount"];
    if (typeof tokenAmount !== "object" || tokenAmount === null) return 0;
    const uiAmount = (tokenAmount as Record<string, unknown>)["uiAmount"];
    return typeof uiAmount === "number" && Number.isFinite(uiAmount) ? uiAmount : 0;
  };

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
      ? toBaseUnits(sanitizedAmount, fromToken.decimals)
      : "0";

  const quoteState = useQuotePreview({
    inMint: fromToken.mint,
    outMint: toToken.mint,
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
      setPayBalance(null);
      return;
    }

    const refreshBalance = async () => {
      try {
        setBalanceLoading(true);
        // SOL uses native balance; SPL tokens use parsed token accounts by mint
        if (fromToken.mint === WRAPPED_SOL_MINT) {
          const lamports = await connection.getBalance(publicKey, {
            commitment: "processed",
          });
          if (!cancelled) {
            setPayBalance(lamports / LAMPORTS_PER_SOL);
          }
        } else {
          const mintKey = new PublicKey(fromToken.mint);
          const parsed = await connection.getParsedTokenAccountsByOwner(
            publicKey,
            { mint: mintKey },
            "processed",
          );
          const total = parsed.value.reduce((sum, acc) => {
            const amt = extractUiAmount(acc.account.data as unknown);
            return sum + (Number.isFinite(amt) ? amt : 0);
          }, 0);
          if (!cancelled) {
            setPayBalance(total);
          }
        }
      } catch (error) {
        if (!cancelled) setPayBalance(0);
        console.error("Failed to load token balance", error);
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
  }, [connection, publicKey, walletConnected, fromToken]);

  // Auto-dismiss benign wallet errors like "user rejected the request"
  useEffect(() => {
    if (!swapError) return;
    const normalized = swapError.toLowerCase();
    if (!normalized.includes("user rejected")) return;
    const timer = setTimeout(() => setSwapError(null), 5000);
    return () => clearTimeout(timer);
  }, [swapError]);

  const amountOutValue = useMemo(() => {
    if (!quoteData) return 0;
    const numeric = Number(quoteData.amountOut);
    const divisor = 10 ** toToken.decimals;
    return Number.isFinite(numeric) ? numeric / divisor : 0;
  }, [quoteData, toToken.decimals]);

  const minReceived = amountOutValue * (1 - DEFAULT_SLIPPAGE_BPS / 10_000);

  const routersLabel = quoteData
    ? quoteData.routers.join(" → ")
    : quoteState.status === "error"
      ? "Failed to load"
      : "Streaming…";

  // priceImpactLabel and quoteStatusLabel omitted from UI for now to reduce noise


  const formattedAmountOut =
    walletConnected && amountOutValue > 0
      ? formatNumber(amountOutValue, 6)
      : "0.000000";

  // USDC estimate of the output amount using Titan quotes
  const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const [usdcEstimate, setUsdcEstimate] = useState<number | null>(null);
  const [usdcEstimateLoading, setUsdcEstimateLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    if (!walletConnected || !publicKeyBase58 || !quoteData) {
      setUsdcEstimate(null);
      return () => controller.abort();
    }
    const outTokens = amountOutValue;
    if (!outTokens || outTokens <= 0) {
      setUsdcEstimate(null);
      return () => controller.abort();
    }
    if (toToken.mint === USDC_MINT) {
      setUsdcEstimate(outTokens);
      return () => controller.abort();
    }
    const fetchEstimate = async () => {
      try {
        setUsdcEstimateLoading(true);
        const res = await fetch(buildApiUrl("/api/frogx/quotes"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inMint: toToken.mint,
            outMint: USDC_MINT,
            amountIn: toBaseUnits(outTokens, toToken.decimals),
            slippageBps: 0,
            priorityFee: 0,
            userPublicKey: publicKeyBase58,
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { amountOut?: string };
        const outRaw = Number(data?.amountOut ?? 0);
        const usdc = Number.isFinite(outRaw) ? outRaw / 10 ** 6 : 0;
        setUsdcEstimate(usdc > 0 ? usdc : 0);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setUsdcEstimate(null);
        }
      } finally {
        setUsdcEstimateLoading(false);
      }
    };
    fetchEstimate();
    return () => controller.abort();
  }, [walletConnected, publicKeyBase58, quoteData, amountOutValue, toToken.mint, toToken.decimals]);

  const formattedUsdcEstimate =
    usdcEstimate !== null && usdcEstimate > 0
      ? formatNumber(usdcEstimate, 2)
      : usdcEstimateLoading
        ? "…"
        : "—";

  // Price of 1 SOL in USDC (via Titan)
  const [solUsdcPrice, setSolUsdcPrice] = useState<number | null>(null);
  const [solPriceLoading, setSolPriceLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    if (!walletConnected || !publicKeyBase58) {
      setSolUsdcPrice(null);
      return () => controller.abort();
    }
    const fetchSolPrice = async () => {
      try {
        setSolPriceLoading(true);
        const res = await fetch(buildApiUrl("/api/frogx/quotes"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inMint: WRAPPED_SOL_MINT,
            outMint: USDC_MINT,
            amountIn: toBaseUnits(1, 9),
            slippageBps: 0,
            priorityFee: 0,
            userPublicKey: publicKeyBase58,
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { amountOut?: string };
        const outRaw = Number(data?.amountOut ?? 0);
        const price = Number.isFinite(outRaw) ? outRaw / 10 ** 6 : 0;
        setSolUsdcPrice(price > 0 ? price : 0);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSolUsdcPrice(null);
        }
      } finally {
        setSolPriceLoading(false);
      }
    };
    fetchSolPrice();
    return () => controller.abort();
  }, [walletConnected, publicKeyBase58]);

  const minReceivedLabel =
    walletConnected && minReceived > 0
      ? `${formatNumber(minReceived, 6)} ${toToken.symbol}`
      : "—";

  // price per input omitted from UI for now

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
    setFromToken(toToken);
    setToToken(fromToken);
  };

  const handleSelectFromToken = (token: TokenOption) => {
    if (token.mint === fromToken.mint) {
      setFromToken(token);
      return;
    }
    const previousFrom = fromToken;
    setFromToken(token);
    if (token.mint === toToken.mint) {
      setToToken(previousFrom);
    }
  };

  const handleSelectToToken = (token: TokenOption) => {
    if (token.mint === toToken.mint) {
      setToToken(token);
      return;
    }
    const previousTo = toToken;
    setToToken(token);
    if (token.mint === fromToken.mint) {
      setFromToken(previousTo);
    }
  };

  const handleAmountChange = (value: string) => {
    if (value === "" || /^\d*(\.\d*)?$/.test(value)) {
      setAmountIn(value);
    }
  };

  const balanceLabel = walletConnected
    ? balanceLoading
      ? "…"
      : formatNumber(payBalance ?? 0, 6)
    : "—";

  const canUseBalanceShortcuts = walletConnected && payBalance !== null;
  const displayedBalance = balanceLabel;

  const toInputAmount = (value: number) => {
    const fixed = value.toFixed(6);
    return fixed.replace(/\.0+$|0+$/, "").replace(/\.$/, "");
  };

  const handleBalanceShortcut = (ratio: number) => {
    if (!canUseBalanceShortcuts) return;
    const target = (payBalance ?? 0) * ratio;
    setAmountIn(target > 0 ? toInputAmount(target) : "0");
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

      if (quoteData?.transactionBase64) {
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
      // Success toast overlay with money sticker; stays until user closes
      setShowSuccessToast(true);
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
      {showSuccessToast && isBrowser &&
        createPortal(
          <div
            className={styles.successToastOverlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="swap-success-title"
          >
            <div className={styles.successToastContent}>
              <button
                type="button"
                className={styles.successToastCloseIcon}
                onClick={() => setShowSuccessToast(false)}
                aria-label="Close success message"
                title="Close"
              >
                ×
              </button>
              <video
                className={styles.successToastVideo}
                src="/sticker/money.webm"
                autoPlay
                loop
                muted
                playsInline
              />
              <h3 id="swap-success-title" className={styles.successToastTitle}>
                Swap Successful!
              </h3>
              {lastSignature && (
                <a
                  className={styles.successToastLink}
                  href={`https://solscan.io/tx/${lastSignature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={lastSignature}
                >
                  View on Solscan
                </a>
              )}
            </div>
          </div>,
          document.body,
        )}
      <header className={styles.header}>
        <div>
          <span className={styles.badge}>Swap</span>
        </div>
        <div className={styles.swapMeta}>
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
                Balance: {displayedBalance} {fromToken.symbol}
              </span>
            </div>
          </div>

          <div className={styles.tokenControls}>
            <div className={styles.tokenSelectGroup}>
              <TokenSelector
                id="fromToken"
                label="Select token to pay"
                selectedToken={fromToken}
                onSelect={handleSelectFromToken}
                disallowMint={toToken.mint}
              />
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
              {canUseBalanceShortcuts && (
                <div className={styles.shortcutRow}>
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
                </div>
              )}
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
              {usdcEstimate !== null && usdcEstimate > 0
                ? `$${formattedUsdcEstimate}`
                : usdcEstimateLoading
                  ? "…"
                  : "—"}
            </span>
          </div>

          <div className={styles.tokenControls}>
            <div className={styles.tokenSelectGroup}>
              <TokenSelector
                id="toToken"
                label="Select token to receive"
                selectedToken={toToken}
                onSelect={handleSelectToToken}
                disallowMint={fromToken.mint}
              />
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
              <span className={styles.summaryLabel}>Min</span>
              <span className={styles.summaryValue}>{minReceivedLabel}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>1 SOL</span>
              <span className={styles.summaryValue}>
                {solUsdcPrice !== null && solUsdcPrice > 0
                  ? `$${formatNumber(solUsdcPrice, 2)}`
                  : solPriceLoading
                    ? "…"
                    : "—"}
              </span>
            </div>
          </div>
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
      {/* Success message now shown in the toast overlay only */}
    </div>
  );
};
