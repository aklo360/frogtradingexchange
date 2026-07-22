"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLinkAccount, usePrivy } from "@privy-io/react-auth";
import {
  useCreateWallet,
  useSignTransaction,
  useWallets,
} from "@privy-io/react-auth/solana";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { buildApiUrl } from "@/lib/api";
import { serializeVersionedTransaction } from "@/lib/solana/serializeVersionedTransaction";
import { WRAPPED_SOL_MINT } from "@/lib/tokens";
import styles from "./PrivyProofPanel.module.css";

type LinkedAccount = {
  type?: string;
  address?: string;
  chainType?: string;
  walletClientType?: string;
  connectorType?: string;
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
};

type CheckState = "pass" | "pending" | "warn" | "fail";
type AsyncStatus = "idle" | "running" | "passed" | "failed";

type AsyncProof = {
  status: AsyncStatus;
  message: string;
};

type AccountConfigResponse = {
  accountModeEnabled?: boolean;
  privy?: {
    configured?: boolean;
    jwksConfigured?: boolean;
    externalWalletsVerificationOnly?: boolean;
  };
  bot?: {
    tradingEnabled?: boolean;
    executionEnabled?: boolean;
  };
  safety?: {
    ribbotHoldsPrivateKeys?: boolean;
    linkedExternalWalletsTradeableByBot?: boolean;
    liveExecutionRequiresPrivySignerPolicies?: boolean;
  };
};

type FloorResponse = {
  floorLamports?: string;
  floorSol?: number;
  lowestListing?: unknown;
  purchase?: {
    userWalletExecutionEnabled?: boolean;
    maxQuantity?: number;
    maxTotalSol?: number;
  };
};

type QuoteResponse = {
  executable?: boolean;
  amountOut?: string;
  transactionBase64?: string;
  instructions?: unknown[];
  addressLookupTables?: string[];
};

type TelegramIntent = {
  intentId: string;
  action: string;
  quantity: string;
  mint: string;
  estimatedSol: string;
};

type NftBuyTransaction = {
  tokenMint: string;
  priceLamports: string;
  priceSol: number;
  transactionBase64: string;
};

type NftBuyPlan = {
  quantity: number;
  estimatedTotalSol: number;
  transactions: NftBuyTransaction[];
};

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const ONE_SOL_LAMPORTS = "1000000000";

const getLinkedAccounts = (value: unknown): LinkedAccount[] =>
  Array.isArray(value) ? (value as LinkedAccount[]) : [];

const formatAddress = (address: string) =>
  `${address.slice(0, 4)}...${address.slice(-4)}`;

const getTelegramLabel = (telegram?: LinkedAccount) =>
  telegram?.username
    ? `@${telegram.username}`
    : [telegram?.firstName, telegram?.lastName].filter(Boolean).join(" ") ||
      "Linked";

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: {
      initData?: string;
    };
  };
};

const getTelegramLinkOptions = () => {
  if (typeof window === "undefined") return undefined;
  const initDataRaw = (window as TelegramWindow).Telegram?.WebApp?.initData;
  return initDataRaw ? { launchParams: { initDataRaw } } : undefined;
};

const getProofClass = (state: CheckState) =>
  `${styles.check} ${styles[state]}`;

const readJson = async <T,>(response: Response, label: string): Promise<T> => {
  if (!response.ok) {
    throw new Error(`${label} returned ${response.status}`);
  }
  return (await response.json()) as T;
};

const readTelegramIntent = (params: URLSearchParams): TelegramIntent | null => {
  const intentId = params.get("intent")?.trim() ?? "";
  if (!intentId) return null;
  return {
    intentId,
    action: params.get("action")?.trim() || "buy-floor",
    quantity: params.get("qty")?.trim() || "1",
    mint: params.get("mint")?.trim() || "",
    estimatedSol: params.get("estSol")?.trim() || "",
  };
};

const decodeBase64Transaction = (value: string) => {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const readIntentQuantity = (intent: TelegramIntent | null) => {
  const quantity = Number.parseInt(intent?.quantity ?? "1", 10);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
};

export const PrivyProofPanel = () => {
  const searchParams = useSearchParams();
  const { authenticated, linkWallet, login, logout, ready, user } = usePrivy();
  const { linkGoogle, linkTelegram } = useLinkAccount({
    onSuccess: () => {
      setLinkProof({ status: "passed", message: "Account link completed." });
    },
    onError: (error, details) => {
      setLinkProof({
        status: "failed",
        message: `${details.linkMethod} link failed: ${String(error)}`,
      });
    },
  });
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();
  const { signTransaction } = useSignTransaction();
  const { connection } = useConnection();
  const [linkProof, setLinkProof] = useState<AsyncProof>({
    status: "idle",
    message: "",
  });
  const [walletProof, setWalletProof] = useState<AsyncProof>({
    status: "idle",
    message: "",
  });
  const [apiProof, setApiProof] = useState<AsyncProof>({
    status: "idle",
    message: "",
  });
  const [balanceProof, setBalanceProof] = useState<AsyncProof>({
    status: "idle",
    message: "",
  });
  const [transactionProof, setTransactionProof] = useState<AsyncProof>({
    status: "idle",
    message: "",
  });
  const [nftBuyProof, setNftBuyProof] = useState<AsyncProof>({
    status: "idle",
    message: "",
  });
  const [nftBuyPlan, setNftBuyPlan] = useState<NftBuyPlan | null>(null);

  const linkedAccounts = useMemo(
    () => getLinkedAccounts(user?.linkedAccounts),
    [user],
  );
  const google = linkedAccounts.find((account) =>
    account.type?.toLowerCase().includes("google"),
  );
  const telegram = linkedAccounts.find((account) =>
    account.type?.toLowerCase().includes("telegram"),
  );
  const externalLinkedWallets = linkedAccounts.filter((account) => {
    const type = account.type?.toLowerCase() ?? "";
    const chain = account.chainType?.toLowerCase() ?? "";
    return type === "wallet" && chain.includes("solana") && account.address;
  });
  const externalWallet = wallets.find(
    (wallet) => !wallet.standardWallet.name.toLowerCase().includes("privy"),
  );
  const embeddedWallet = wallets.find((wallet) =>
    wallet.standardWallet.name.toLowerCase().includes("privy"),
  );
  const activeWallet = externalWallet ?? embeddedWallet ?? null;
  const walletLabel = activeWallet
    ? `${activeWallet.standardWallet.name} ${formatAddress(activeWallet.address)}`
    : externalLinkedWallets[0]?.address
      ? `${formatAddress(externalLinkedWallets[0].address)} linked`
      : "Missing";
  const telegramIntent = useMemo(
    () => readTelegramIntent(new URLSearchParams(searchParams?.toString() ?? "")),
    [searchParams],
  );

  const runLink = (label: string, action: () => void) => {
    setLinkProof({ status: "running", message: `Opening ${label}...` });
    try {
      action();
      window.setTimeout(() => {
        setLinkProof((current) =>
          current.status === "running"
            ? { status: "idle", message: "" }
            : current,
        );
      }, 4_000);
    } catch (error) {
      setLinkProof({
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleCreateWallet = async () => {
    if (!authenticated || embeddedWallet || walletProof.status === "running") {
      return;
    }
    setWalletProof({ status: "running", message: "Creating FTX wallet..." });
    try {
      const result = await createWallet({ createAdditional: false });
      setWalletProof({
        status: "passed",
        message: `FTX wallet ready: ${formatAddress(result.wallet.address)}`,
      });
    } catch (error) {
      setWalletProof({
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleApiProbe = async () => {
    if (!activeWallet?.address) {
      setApiProof({
        status: "failed",
        message: "Connect a Solana wallet before probing quotes.",
      });
      return;
    }
    setApiProof({ status: "running", message: "Checking live API..." });
    try {
      const [accountConfig, floor, quote] = await Promise.all([
        fetch(buildApiUrl("/api/frogx/account/config")).then((response) =>
          readJson<AccountConfigResponse>(response, "Account config"),
        ),
        fetch(buildApiUrl("/api/frogx/nfts/floor?collection=sbf")).then(
          (response) => readJson<FloorResponse>(response, "SBF floor"),
        ),
        fetch(buildApiUrl("/api/frogx/quotes"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            inMint: WRAPPED_SOL_MINT,
            outMint: USDC_MINT,
            amountIn: ONE_SOL_LAMPORTS,
            slippageBps: 50,
            priorityFee: 0,
            userPublicKey: activeWallet.address,
          }),
        }).then((response) => readJson<QuoteResponse>(response, "Titan quote")),
      ]);

      const accountReady =
        accountConfig.accountModeEnabled &&
        accountConfig.privy?.configured &&
        accountConfig.privy.jwksConfigured &&
        accountConfig.privy.externalWalletsVerificationOnly &&
        accountConfig.bot?.tradingEnabled === false &&
        accountConfig.bot.executionEnabled === false &&
        accountConfig.safety?.ribbotHoldsPrivateKeys === false &&
        accountConfig.safety.linkedExternalWalletsTradeableByBot === false &&
        accountConfig.safety.liveExecutionRequiresPrivySignerPolicies === true;
      const floorReady =
        Number(floor.floorLamports ?? 0) > 0 &&
        Number(floor.floorSol ?? 0) > 0 &&
        Boolean(floor.lowestListing) &&
        floor.purchase?.userWalletExecutionEnabled === true;
      const quoteReady =
        quote.executable === true &&
        Number(quote.amountOut ?? 0) > 0 &&
        (Boolean(quote.transactionBase64) ||
          (Array.isArray(quote.instructions) && quote.instructions.length > 0));

      if (!accountReady || !floorReady || !quoteReady) {
        throw new Error("Live API probe returned incomplete readiness data.");
      }

      setApiProof({
        status: "passed",
        message: `Quote executable, floor ${floor.floorSol?.toFixed(4) ?? "ok"} SOL, ${quote.addressLookupTables?.length ?? 0} lookup tables.`,
      });
    } catch (error) {
      setApiProof({
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleTransactionProof = async () => {
    if (!activeWallet?.address) {
      setTransactionProof({
        status: "failed",
        message: "Connect a Solana wallet before signing.",
      });
      return;
    }
    setTransactionProof({
      status: "running",
      message: "Preparing transaction proof...",
    });
    try {
      const payerKey = new PublicKey(activeWallet.address);
      const { blockhash } = await connection.getLatestBlockhash("finalized");
      const proofInstruction = new TransactionInstruction({
        programId: SystemProgram.programId,
        keys: [
          {
            pubkey: payerKey,
            isSigner: true,
            isWritable: false,
          },
        ],
        data: new Uint8Array() as unknown as Buffer,
      });
      const message = new TransactionMessage({
        payerKey,
        recentBlockhash: blockhash,
        instructions: [proofInstruction],
      }).compileToV0Message();
      const transaction = serializeVersionedTransaction(
        new VersionedTransaction(message),
      );
      const { signedTransaction } = await signTransaction({
        transaction,
        wallet: activeWallet,
        chain: "solana:mainnet",
        options: {
          uiOptions: {
            description:
              "Sign this FTX preview transaction proof. It is not submitted.",
          },
        },
      });

      if (signedTransaction.length === 0) {
        throw new Error("Wallet returned an empty signed transaction.");
      }
      setTransactionProof({
        status: "passed",
        message: `Signed ${signedTransaction.length} bytes. Transaction was not submitted.`,
      });
    } catch (error) {
      setTransactionProof({
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleBalanceProbe = async () => {
    if (!activeWallet?.address) {
      setBalanceProof({
        status: "failed",
        message: "Connect a Solana wallet before checking balance.",
      });
      return;
    }
    setBalanceProof({
      status: "running",
      message: "Checking SOL balance...",
    });
    try {
      const lamports = await connection.getBalance(
        new PublicKey(activeWallet.address),
        "processed",
      );
      if (lamports <= 0) {
        setBalanceProof({
          status: "failed",
          message: "0 SOL available for network fees.",
        });
        return;
      }
      const sol = lamports / 1_000_000_000;
      setBalanceProof({
        status: "passed",
        message: `${sol.toFixed(sol >= 0.01 ? 4 : 6)} SOL available for network fees.`,
      });
    } catch (error) {
      setBalanceProof({
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleBuildNftBuy = async () => {
    if (!telegramIntent) {
      setNftBuyProof({
        status: "failed",
        message: "Open this page from a Telegram buy or sweep intent link.",
      });
      return;
    }
    if (!activeWallet?.address) {
      setNftBuyProof({
        status: "failed",
        message: "Connect a Solana wallet before building the buy.",
      });
      return;
    }

    setNftBuyPlan(null);
    setNftBuyProof({
      status: "running",
      message: "Building fresh Magic Eden buy transactions...",
    });
    try {
      const plan = await fetch(buildApiUrl("/api/frogx/nfts/buy-floor"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          buyer: activeWallet.address,
          quantity: readIntentQuantity(telegramIntent),
          intentId: telegramIntent.intentId,
        }),
      }).then((response) => readJson<NftBuyPlan>(response, "NFT buy builder"));

      if (!Array.isArray(plan.transactions) || plan.transactions.length === 0) {
        throw new Error("Magic Eden returned no buy transactions.");
      }

      setNftBuyPlan(plan);
      setNftBuyProof({
        status: "passed",
        message: `Built ${plan.transactions.length} buy tx${plan.transactions.length === 1 ? "" : "s"} for ${plan.estimatedTotalSol.toFixed(4)} SOL before fees.`,
      });
    } catch (error) {
      setNftBuyProof({
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleExecuteNftBuy = async () => {
    if (!activeWallet?.address) {
      setNftBuyProof({
        status: "failed",
        message: "Connect a Solana wallet before signing the buy.",
      });
      return;
    }
    if (!nftBuyPlan) {
      setNftBuyProof({
        status: "failed",
        message: "Build the Magic Eden buy transactions first.",
      });
      return;
    }

    setNftBuyProof({
      status: "running",
      message: "Waiting for wallet signatures...",
    });
    const signatures: string[] = [];
    try {
      for (const [index, transaction] of nftBuyPlan.transactions.entries()) {
        const { signedTransaction } = await signTransaction({
          transaction: decodeBase64Transaction(transaction.transactionBase64),
          wallet: activeWallet,
          chain: "solana:mainnet",
          options: {
            uiOptions: {
              description: `Sign FTX floor buy ${index + 1}/${nftBuyPlan.transactions.length}: ${formatAddress(transaction.tokenMint)} for ${transaction.priceSol.toFixed(4)} SOL before fees.`,
              showWalletUIs: true,
            },
          },
        });
        const signature = await connection.sendRawTransaction(signedTransaction, {
          skipPreflight: false,
        });
        const confirmation = await connection.confirmTransaction(
          signature,
          "confirmed",
        );
        if (confirmation.value?.err) {
          throw new Error(`Buy transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }
        signatures.push(signature);
      }

      setNftBuyProof({
        status: "passed",
        message: `Sent ${signatures.length} buy tx${signatures.length === 1 ? "" : "s"}: ${signatures.map(formatAddress).join(", ")}`,
      });
    } catch (error) {
      const submitted = signatures.length
        ? ` Submitted ${signatures.length}: ${signatures.map(formatAddress).join(", ")}.`
        : "";
      setNftBuyProof({
        status: "failed",
        message: `${error instanceof Error ? error.message : String(error)}${submitted}`,
      });
    }
  };

  const checks: Array<{
    label: string;
    value: string;
    state: CheckState;
  }> = [
    {
      label: "Privy SDK",
      value: ready ? "Loaded" : "Loading",
      state: ready ? "pass" : "pending",
    },
    {
      label: "Session",
      value: authenticated ? "Logged in" : "Not logged in",
      state: authenticated ? "pass" : "pending",
    },
    {
      label: "Google",
      value: google?.email ?? (google ? "Linked" : "Missing"),
      state: google ? "pass" : "pending",
    },
    {
      label: "Telegram",
      value: telegram ? getTelegramLabel(telegram) : "Missing",
      state: telegram ? "pass" : "pending",
    },
    {
      label: "Wallets ready",
      value: walletsReady ? `${wallets.length} detected` : "Loading",
      state: walletsReady ? "pass" : "pending",
    },
    {
      label: "Active Solana wallet",
      value: walletLabel,
      state: activeWallet ? "pass" : "pending",
    },
    {
      label: "FTX wallet",
      value: embeddedWallet ? formatAddress(embeddedWallet.address) : "Missing",
      state: embeddedWallet ? "pass" : "warn",
    },
    {
      label: "Live API",
      value: apiProof.message || "Not run",
      state:
        apiProof.status === "passed"
          ? "pass"
          : apiProof.status === "failed"
            ? "fail"
            : apiProof.status === "running"
              ? "pending"
              : "warn",
    },
    {
      label: "Transaction signing",
      value: transactionProof.message || "Not run",
      state:
        transactionProof.status === "passed"
          ? "pass"
          : transactionProof.status === "failed"
            ? "fail"
            : transactionProof.status === "running"
              ? "pending"
              : "warn",
    },
    {
      label: "Fee balance",
      value: balanceProof.message || "Not run",
      state:
        balanceProof.status === "passed"
          ? "pass"
          : balanceProof.status === "failed"
            ? "fail"
            : balanceProof.status === "running"
              ? "pending"
            : "warn",
    },
    {
      label: "NFT buy txs",
      value: nftBuyProof.message || "Not built",
      state:
        nftBuyProof.status === "passed"
          ? "pass"
          : nftBuyProof.status === "failed"
            ? "fail"
            : nftBuyProof.status === "running"
              ? "pending"
              : telegramIntent
                ? "warn"
                : "pending",
    },
  ];

  const proofReady =
    authenticated &&
    Boolean(google) &&
    Boolean(telegram) &&
    Boolean(activeWallet) &&
    apiProof.status === "passed" &&
    transactionProof.status === "passed";
  const finalReady = proofReady && balanceProof.status === "passed";
  const finalState = telegramIntent
    ? nftBuyPlan
      ? "ready to sign and send NFT buy"
      : finalReady
        ? "ready to build NFT buy"
        : proofReady
          ? "needs fee balance check"
          : "not ready"
    : finalReady
      ? "ready for a funded swap test"
      : proofReady
        ? "needs fee balance check"
        : "not ready";

  return (
    <main className={styles.shell}>
      <section className={styles.panel} aria-label="FTX Privy proof">
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>FTX preview proof</p>
            <h1 className={styles.title}>Privy account and wallet checklist</h1>
          </div>
          {authenticated ? (
            <button
              type="button"
              className={`${styles.button} ${styles.secondaryButton}`}
              onClick={logout}
            >
              Logout
            </button>
          ) : null}
        </header>

        {telegramIntent ? (
          <section className={styles.card} aria-label="Telegram trade intent">
            <h2 className={styles.sectionTitle}>Telegram intent</h2>
            <div className={styles.intentGrid}>
              <div>
                <p className={styles.checkLabel}>Action</p>
                <p className={styles.checkValue}>{telegramIntent.action}</p>
              </div>
              <div>
                <p className={styles.checkLabel}>Quantity</p>
                <p className={styles.checkValue}>{telegramIntent.quantity}</p>
              </div>
              <div>
                <p className={styles.checkLabel}>Estimate</p>
                <p className={styles.checkValue}>
                  {telegramIntent.estimatedSol
                    ? `${telegramIntent.estimatedSol} SOL before fees`
                    : "Pending market refresh"}
                </p>
              </div>
              <div>
                <p className={styles.checkLabel}>Intent</p>
                <p className={styles.checkValue}>
                  {formatAddress(telegramIntent.intentId)}
                </p>
              </div>
              {telegramIntent.mint ? (
                <div>
                  <p className={styles.checkLabel}>Floor mint</p>
                  <p className={styles.checkValue}>
                    {formatAddress(telegramIntent.mint)}
                  </p>
                </div>
              ) : null}
            </div>
            <p className={styles.summary}>
              This page proves the linked account and wallet, then builds fresh
              Magic Eden buy transactions for your connected Solana wallet.
              Telegram text never executes the buy.
            </p>
          </section>
        ) : null}

        <div className={styles.grid}>
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>Readiness</h2>
            <div className={styles.checkList}>
              {checks.map((check) => (
                <article
                  className={getProofClass(check.state)}
                  key={check.label}
                  data-state={check.state}
                >
                  <span className={styles.dot} aria-hidden="true" />
                  <div>
                    <p className={styles.checkLabel}>{check.label}</p>
                    <p className={styles.checkValue}>{check.value}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <aside className={styles.card}>
            <h2 className={styles.sectionTitle}>Controls</h2>
            <p className={styles.summary}>
              Final state: {finalState}
            </p>
            <div className={styles.actions}>
              {!authenticated ? (
                <button type="button" className={styles.button} onClick={login}>
                  Account Login
                </button>
              ) : null}
              {authenticated && !google ? (
                <button
                  type="button"
                  className={styles.button}
                  onClick={() => runLink("Google", linkGoogle)}
                  disabled={linkProof.status === "running"}
                >
                  Link Google
                </button>
              ) : null}
              {authenticated && !telegram ? (
                <button
                  type="button"
                  className={styles.button}
                  onClick={() =>
                    runLink("Telegram", () =>
                      linkTelegram(getTelegramLinkOptions()),
                    )
                  }
                  disabled={linkProof.status === "running"}
                >
                  Link Telegram
                </button>
              ) : null}
              {authenticated ? (
                <button
                  type="button"
                  className={styles.button}
                  onClick={() =>
                    runLink("Solana wallet", () =>
                      linkWallet({
                        walletChainType: "solana-only",
                        description:
                          "Connect Phantom or another Solana wallet for FTX preview testing.",
                      }),
                    )
                  }
                  disabled={linkProof.status === "running"}
                >
                  Link Solana
                </button>
              ) : null}
              {authenticated && !embeddedWallet && walletsReady ? (
                <button
                  type="button"
                  className={styles.button}
                  onClick={handleCreateWallet}
                  disabled={walletProof.status === "running"}
                >
                  Create FTX Wallet
                </button>
              ) : null}
              <button
                type="button"
                className={styles.button}
                onClick={handleApiProbe}
                disabled={!activeWallet || apiProof.status === "running"}
              >
                Run API Probe
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={handleTransactionProof}
                disabled={!activeWallet || transactionProof.status === "running"}
              >
                Sign Tx Proof
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={handleBalanceProbe}
                disabled={!activeWallet || balanceProof.status === "running"}
              >
                Check Balance
              </button>
              {telegramIntent ? (
                <button
                  type="button"
                  className={styles.button}
                  onClick={handleBuildNftBuy}
                  disabled={!activeWallet || nftBuyProof.status === "running"}
                >
                  Build Buy Tx
                </button>
              ) : null}
              {telegramIntent && nftBuyPlan ? (
                <button
                  type="button"
                  className={styles.button}
                  onClick={handleExecuteNftBuy}
                  disabled={!activeWallet || nftBuyProof.status === "running"}
                >
                  Sign & Send {nftBuyPlan.quantity === 1 ? "Buy" : "Sweep"}
                </button>
              ) : null}
              {finalReady && !telegramIntent ? (
                <Link className={`${styles.button} ${styles.swapLink}`} href="/">
                  Open Swap
                </Link>
              ) : null}
            </div>
            {linkProof.message ? (
              <p
                className={`${styles.resultText} ${
                  linkProof.status === "failed" ? styles.errorText : ""
                }`}
              >
                {linkProof.message}
              </p>
            ) : null}
            {walletProof.message ? (
              <p
                className={`${styles.resultText} ${
                  walletProof.status === "failed" ? styles.errorText : ""
                }`}
              >
                {walletProof.message}
              </p>
            ) : null}
            {apiProof.message ? (
              <p
                className={`${styles.resultText} ${
                  apiProof.status === "failed" ? styles.errorText : ""
                }`}
              >
                {apiProof.message}
              </p>
            ) : null}
            {transactionProof.message ? (
              <p
                className={`${styles.resultText} ${
                  transactionProof.status === "failed" ? styles.errorText : ""
                }`}
              >
                {transactionProof.message}
              </p>
            ) : null}
            {balanceProof.message ? (
              <p
                className={`${styles.resultText} ${
                  balanceProof.status === "failed" ? styles.errorText : ""
                }`}
              >
                {balanceProof.message}
              </p>
            ) : null}
            {nftBuyProof.message ? (
              <p
                className={`${styles.resultText} ${
                  nftBuyProof.status === "failed" ? styles.errorText : ""
                }`}
              >
                {nftBuyProof.message}
              </p>
            ) : null}
          </aside>
        </div>
      </section>
    </main>
  );
};
