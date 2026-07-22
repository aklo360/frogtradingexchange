"use client";

import { useMemo, useRef, useState } from "react";
import { useLinkAccount, useLogin, usePrivy } from "@privy-io/react-auth";
import { useCreateWallet, useWallets } from "@privy-io/react-auth/solana";
import styles from "./FrogxAccountPanel.module.css";

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
  subject?: string;
};

type TelegramWebAppWindow = Window & {
  Telegram?: {
    WebApp?: {
      initData?: string;
    };
  };
};

const formatAddress = (address: string) =>
  `${address.slice(0, 4)}...${address.slice(-4)}`;

const getLinkedAccounts = (value: unknown): LinkedAccount[] =>
  Array.isArray(value) ? (value as LinkedAccount[]) : [];

const getTelegramLinkOptions = () => {
  if (typeof window === "undefined") return undefined;
  const initDataRaw = (window as TelegramWebAppWindow).Telegram?.WebApp?.initData;
  return initDataRaw ? { launchParams: { initDataRaw } } : undefined;
};

const getWalletName = (wallet: LinkedAccount) =>
  wallet.walletClientType ??
  wallet.connectorType ??
  "Solana wallet";

const CREATE_WALLET_TIMEOUT_MS = 25_000;

const getWalletCreationError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (normalized.includes("already") && normalized.includes("wallet")) {
    return "FTX wallet already exists. Refresh the profile if the address is not visible yet.";
  }
  if (normalized.includes("exited") || normalized.includes("cancel")) {
    return "FTX wallet setup was canceled.";
  }
  return message || "Unable to create the FTX wallet.";
};

export const FrogxAccountPanel = () => {
  const {
    authenticated,
    linkWallet,
    logout,
    ready,
    user,
  } = usePrivy();
  const [linking, setLinking] = useState<"google" | "telegram" | "wallet" | null>(null);
  const [linkError, setLinkError] = useState("");
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [createdWalletAddress, setCreatedWalletAddress] = useState("");
  const [walletStatus, setWalletStatus] = useState("");
  const [walletError, setWalletError] = useState("");
  const createAttemptRef = useRef(0);
  const { login } = useLogin({
    onComplete: () => {
      setLinkError("");
    },
    onError: (error) => {
      setLinkError(`Login failed: ${String(error)}`);
    },
  });
  const { linkGoogle, linkTelegram } = useLinkAccount({
    onSuccess: () => {
      setLinking(null);
      setLinkError("");
    },
    onError: (error, details) => {
      const provider =
        details.linkMethod === "google"
          ? "Google"
          : details.linkMethod === "telegram"
            ? "Telegram"
            : "Account";
      setLinking(null);
      setLinkError(`${provider} link failed: ${String(error)}`);
    },
  });
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();

  const linkedAccounts = useMemo(
    () => getLinkedAccounts(user?.linkedAccounts),
    [user],
  );
  const telegram = linkedAccounts.find((account) =>
    account.type?.toLowerCase().includes("telegram"),
  );
  const google = linkedAccounts.find((account) =>
    account.type?.toLowerCase().includes("google"),
  );
  const externalWallets = linkedAccounts.filter((account) => {
    const chain = account.chainType?.toLowerCase() ?? "";
    const type = account.type?.toLowerCase() ?? "";
    return type === "wallet" && chain.includes("solana") && account.address;
  });
  const connectedExternalWallet = wallets.find(
    (wallet) => !wallet.standardWallet.name.toLowerCase().includes("privy"),
  );
  const hotWallet = wallets.find((wallet) =>
    wallet.standardWallet.name.toLowerCase().includes("privy"),
  );
  const ribbotWalletAddress = hotWallet?.address ?? createdWalletAddress;
  const activeSwapWallet = connectedExternalWallet ?? hotWallet ?? null;
  const firstLinkedWallet = externalWallets[0];
  const swapWalletLabel = activeSwapWallet
    ? `${activeSwapWallet.standardWallet.name} ${formatAddress(activeSwapWallet.address)}`
    : firstLinkedWallet?.address
      ? `${getWalletName(firstLinkedWallet)} linked`
      : "No Solana wallet";
  const linkedWalletCount = Math.max(externalWallets.length, wallets.length);
  const telegramLabel =
    telegram?.username
      ? `@${telegram.username}`
      : [telegram?.firstName, telegram?.lastName].filter(Boolean).join(" ") || "";

  const openLinkFlow = (
    provider: "google" | "telegram" | "wallet",
    action: () => void,
  ) => {
    setLinking(provider);
    setLinkError("");
    try {
      action();
      window.setTimeout(() => {
        setLinking((current) => (current === provider ? null : current));
      }, 4_000);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to start account link.";
      setLinking(null);
      setLinkError(message);
    }
  };

  const handleCreateRibbotWallet = async () => {
    if (!authenticated || creatingWallet || hotWallet) return;
    const attempt = createAttemptRef.current + 1;
    createAttemptRef.current = attempt;
    setCreatingWallet(true);
    setWalletStatus("Creating FTX wallet...");
    setWalletError("");

    const walletPromise = createWallet({ createAdditional: false });
    const timeoutPromise = new Promise<"timeout">((resolve) => {
      window.setTimeout(() => resolve("timeout"), CREATE_WALLET_TIMEOUT_MS);
    });

    walletPromise
      .then(({ wallet }) => {
        if (createAttemptRef.current !== attempt) return;
        if (wallet.address) setCreatedWalletAddress(wallet.address);
        setWalletStatus("FTX wallet ready.");
        setWalletError("");
      })
      .catch((error) => {
        if (createAttemptRef.current !== attempt) return;
        setWalletStatus("");
        setWalletError(getWalletCreationError(error));
      })
      .finally(() => {
        if (createAttemptRef.current === attempt) {
          setCreatingWallet(false);
        }
      });

    const result = await Promise.race([
      walletPromise.then(() => "settled" as const).catch(() => "settled" as const),
      timeoutPromise,
    ]);
    if (result === "timeout" && createAttemptRef.current === attempt) {
      setCreatingWallet(false);
      setWalletStatus("");
      setWalletError(
        "FTX wallet creation is still pending in Privy. If the wallet does not appear, refresh this profile and retry.",
      );
    }
  };

  if (!ready) {
    return (
      <section className={styles.panel} aria-label="FTX account mode">
        <div className={styles.statusLine}>Loading FTX account mode...</div>
      </section>
    );
  }

  if (!authenticated) {
    return (
      <section className={styles.panel} aria-label="FTX account mode">
        <div>
          <p className={styles.eyebrow}>Account mode</p>
          <h2 className={styles.title}>FTX account</h2>
          <p className={styles.copy}>
            Log in with Telegram, Google, Phantom, or MetaMask to manage your
            linked accounts and swap wallet.
          </p>
          <p className={styles.copy}>
            Start in FTX or Telegram. If Ribbot made your account first, choose
            Telegram here first; then link Google or Phantom inside that same
            FTX account.
          </p>
        </div>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => {
            setLinkError("");
            login();
          }}
        >
          Account Login
        </button>
        {linkError ? <p className={styles.errorText}>{linkError}</p> : null}
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-label="FTX account mode">
      <div className={styles.headerRow}>
        <div>
          <p className={styles.eyebrow}>FTX account</p>
          <h2 className={styles.title}>Account ready</h2>
        </div>
        <button type="button" className={styles.secondaryButton} onClick={logout}>
          Logout
        </button>
      </div>
      <div className={styles.grid}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Swap wallet</span>
          <strong>{walletsReady ? swapWalletLabel : "Loading..."}</strong>
          {!activeSwapWallet && walletsReady ? (
            <button
              type="button"
              className={styles.inlineButton}
              onClick={() =>
                openLinkFlow("wallet", () =>
                  linkWallet({
                    walletChainType: "solana-only",
                    description: "Connect Phantom or another Solana wallet for swaps.",
                  }),
                )
              }
              disabled={linking === "wallet"}
            >
              {linking === "wallet" ? "Opening..." : "Link wallet"}
            </button>
          ) : null}
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Telegram</span>
          <strong>{telegramLabel || "Add Telegram"}</strong>
          {!telegram ? (
            <span className={styles.metricHint}>
              Link Telegram before Ribbot approvals, or log out and choose
              Telegram first if Ribbot already made your FTX account.
            </span>
          ) : null}
          {!telegram ? (
            <button
              type="button"
              className={styles.inlineButton}
              onClick={() =>
                openLinkFlow("telegram", () => linkTelegram(getTelegramLinkOptions()))
              }
              disabled={linking === "telegram"}
            >
              {linking === "telegram" ? "Opening..." : "Link"}
            </button>
          ) : null}
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Google</span>
          <strong>{google ? google.email ?? "Linked" : "Add Google"}</strong>
          {!google ? (
            <button
              type="button"
              className={styles.inlineButton}
              onClick={() => openLinkFlow("google", linkGoogle)}
              disabled={linking === "google"}
            >
              {linking === "google" ? "Opening..." : "Link"}
            </button>
          ) : null}
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Ribbot wallet</span>
          <strong>
            {ribbotWalletAddress ? formatAddress(ribbotWalletAddress) : "Not enabled"}
          </strong>
          <span className={styles.metricHint}>
            Required for future Telegram and bot trading
          </span>
          {!ribbotWalletAddress && walletsReady ? (
            <button
              type="button"
              className={styles.inlineButton}
              onClick={handleCreateRibbotWallet}
              disabled={creatingWallet}
            >
              {creatingWallet ? "Creating..." : "Create FTX wallet"}
            </button>
          ) : null}
          {walletStatus ? (
            <span className={styles.metricHint}>{walletStatus}</span>
          ) : null}
          {walletError ? (
            <span className={styles.metricError}>{walletError}</span>
          ) : null}
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Linked wallets</span>
          <strong>{linkedWalletCount}</strong>
          {firstLinkedWallet?.address ? (
            <span className={styles.metricHint}>
              {getWalletName(firstLinkedWallet)} {formatAddress(firstLinkedWallet.address)}
            </span>
          ) : null}
        </div>
      </div>
      <p className={styles.notice}>
        Swaps use the connected Solana wallet above. The FTX wallet is for
        future Ribbot and Telegram trading after signer policies are live.
      </p>
      {linkError ? <p className={styles.errorText}>{linkError}</p> : null}
    </section>
  );
};
