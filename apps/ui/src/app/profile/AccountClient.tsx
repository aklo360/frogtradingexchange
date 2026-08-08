"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import {
  useCreateWallet,
  useExportWallet,
} from "@privy-io/react-auth/solana";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

import { Ticker } from "@/components/Ticker";
import type { NftHoldingsPage } from "@/lib/nfts";
import {
  getProfileNftWalletAddresses,
  getPrivySolanaWallets,
  getTelegramAccount,
  type PrivySolanaWallet,
} from "@/lib/privy";
import { useSolanaConnection } from "@/providers/SolanaProvider";
import homeStyles from "../page.module.css";
import styles from "./account.module.css";

const walletLabel = (wallet: PrivySolanaWallet) => {
  if (!wallet.embedded) return "Portfolio Wallet (Read only)";
  return "Spot & NFT Wallet (Privy)";
};

const formatSolBalance = (balance: number | null | undefined) => {
  if (balance === undefined) return "Loading balance";
  if (balance === null) return "Balance unavailable";
  return `${balance.toLocaleString(undefined, {
    maximumFractionDigits: 4,
  })} SOL`;
};

const formatUsdcBalance = (balance: number) =>
  `${balance.toLocaleString(undefined, {
    maximumFractionDigits: 6,
  })} USDC`;

type PerpsWallet = {
  profileAddress: string;
  authorityWalletAddress: string;
  profileUsdc: number;
  minimumProfileUsdc: number;
};

type PerpsWalletResponse =
  | ({ status: "ready" } & PerpsWallet)
  | { status?: string; error?: string };

export default function AccountClient() {
  const router = useRouter();
  const connection = useSolanaConnection();
  const {
    ready,
    authenticated,
    user,
    login,
    logout,
    linkWallet,
    getAccessToken,
  } = usePrivy();
  const { createWallet } = useCreateWallet();
  const { exportWallet } = useExportWallet();
  const [createdWalletAddress, setCreatedWalletAddress] = useState<
    string | null
  >(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<
    "create" | "logout" | string | null
  >(null);
  const [walletBalances, setWalletBalances] = useState<
    Record<string, number | null>
  >({});
  const [frogPortfolio, setFrogPortfolio] =
    useState<NftHoldingsPage | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [perpsWallet, setPerpsWallet] = useState<PerpsWallet | null>(null);
  const [error, setError] = useState<string | null>(null);

  const telegramAccount = useMemo(
    () => getTelegramAccount(user?.linkedAccounts),
    [user?.linkedAccounts],
  );
  const wallets = useMemo(() => {
    const linkedWallets = getPrivySolanaWallets(user?.linkedAccounts);
    const embeddedWallets = linkedWallets.filter((wallet) => wallet.embedded);
    const embeddedWallet =
      embeddedWallets.find((wallet) => wallet.walletIndex === 0) ??
      embeddedWallets.find((wallet) => wallet.walletIndex === null) ??
      embeddedWallets[0];
    const portfolioWallets = linkedWallets.filter(
      (wallet) => !wallet.embedded,
    );
    if (
      createdWalletAddress &&
      embeddedWallet?.address !== createdWalletAddress
    ) {
      return [
        {
          id: null,
          address: createdWalletAddress,
          embedded: true,
          walletIndex: 0,
        },
        ...portfolioWallets,
      ];
    }
    return embeddedWallet
      ? [embeddedWallet, ...portfolioWallets]
      : portfolioWallets;
  }, [createdWalletAddress, user?.linkedAccounts]);
  const spotWalletAddress =
    wallets.find(
      (wallet) => wallet.embedded && wallet.walletIndex === 0,
    )?.address ??
    wallets.find(
      (wallet) => wallet.embedded && wallet.walletIndex === null,
    )?.address ??
    wallets.find((wallet) => wallet.embedded)?.address ??
    null;
  const balanceWalletAddresses = useMemo(
    () => wallets.map((wallet) => wallet.address),
    [wallets],
  );
  const frogWalletAddresses = useMemo(
    () => getProfileNftWalletAddresses(wallets),
    [wallets],
  );
  const frogCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const frog of frogPortfolio?.items ?? []) {
      counts.set(frog.owner, (counts.get(frog.owner) ?? 0) + 1);
    }
    return counts;
  }, [frogPortfolio]);

  const telegramName = telegramAccount?.username
    ? `@${telegramAccount.username}`
    : telegramAccount?.firstName ?? "Not connected";

  useEffect(() => {
    if (!authenticated || !telegramAccount?.userId || !spotWalletAddress) {
      setPerpsWallet(null);
      return;
    }

    const controller = new AbortController();
    void getAccessToken()
      .then((token) => {
        if (!token) return null;
        return fetch("/api/frogx/account/perps-wallet", {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
      })
      .then(async (response) => {
        if (!response?.ok) return null;
        return (await response.json()) as PerpsWalletResponse;
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (
          result?.status === "ready" &&
          "profileAddress" in result &&
          result.profileAddress &&
          result.authorityWalletAddress === spotWalletAddress
        ) {
          setPerpsWallet({
            profileAddress: result.profileAddress,
            authorityWalletAddress: result.authorityWalletAddress,
            profileUsdc: result.profileUsdc,
            minimumProfileUsdc: result.minimumProfileUsdc,
          });
          return;
        }
        setPerpsWallet(null);
      })
      .catch((perpsWalletError: unknown) => {
        if (
          !controller.signal.aborted &&
          perpsWalletError instanceof Error &&
          perpsWalletError.name !== "AbortError"
        ) {
          setPerpsWallet(null);
        }
      });

    return () => controller.abort();
  }, [
    authenticated,
    getAccessToken,
    spotWalletAddress,
    telegramAccount?.userId,
  ]);

  useEffect(() => {
    if (!authenticated || balanceWalletAddresses.length === 0) {
      setWalletBalances({});
      return;
    }

    let cancelled = false;
    void Promise.all(
      balanceWalletAddresses.map(async (address) => {
        try {
          const lamports = await connection.getBalance(new PublicKey(address));
          return [address, lamports / LAMPORTS_PER_SOL] as const;
        } catch {
          return [address, null] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) setWalletBalances(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [authenticated, balanceWalletAddresses, connection]);

  useEffect(() => {
    if (!authenticated || frogWalletAddresses.length === 0) {
      setFrogPortfolio(null);
      setPortfolioLoading(false);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ limit: "50" });
    for (const address of frogWalletAddresses) {
      params.append("walletAddress", address);
    }
    setPortfolioLoading(true);
    void fetch(`/api/frogx/nfts?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Frog portfolio is unavailable.");
        return (await response.json()) as NftHoldingsPage;
      })
      .then((portfolio) => {
        if (!controller.signal.aborted) setFrogPortfolio(portfolio);
      })
      .catch((portfolioError: unknown) => {
        if (
          !controller.signal.aborted &&
          portfolioError instanceof Error &&
          portfolioError.name !== "AbortError"
        ) {
          setFrogPortfolio(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPortfolioLoading(false);
      });

    return () => controller.abort();
  }, [authenticated, frogWalletAddresses]);

  const handleCopy = async (address: string) => {
    setError(null);
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      window.setTimeout(() => setCopiedAddress(null), 1600);
    } catch {
      setError("Could not copy the wallet address.");
    }
  };

  const handleExport = async (address: string) => {
    if (busyAction) return;
    setBusyAction(address);
    setError(null);
    try {
      await exportWallet({ address });
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Privy could not open wallet export.",
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateWallet = async () => {
    if (busyAction || wallets.some((wallet) => wallet.embedded)) return;
    setBusyAction("create");
    setError(null);
    try {
      const result = await createWallet();
      setCreatedWalletAddress(result.wallet.address);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create the Solana wallet.",
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleAddPortfolioWallet = () => {
    setError(null);
    linkWallet({
      walletChainType: "solana-only",
      description:
        "Add a wallet to view its balance and Business Frogs. It stays read only.",
    });
  };

  const handleLogout = async () => {
    if (busyAction) return;
    setBusyAction("logout");
    setError(null);
    try {
      await logout();
    } catch (logoutError) {
      setError(
        logoutError instanceof Error
          ? logoutError.message
          : "Could not sign out.",
      );
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <main className={`${homeStyles.main} ${styles.page}`}>
      <header className={homeStyles.headerBar}>
        <div className={homeStyles.headerInner}>
          <button
            type="button"
            className={`${homeStyles.brandGroup} ${homeStyles.brandHomeButton}`}
            onClick={() => router.push("/")}
            aria-label="Go to swap home"
          >
            <div className={homeStyles.brandRow}>
              <video
                src="/sticker/excited.webm"
                className={`${homeStyles.headerSticker} ${homeStyles.headerStickerLarge}`}
                autoPlay
                loop
                muted
                playsInline
                aria-hidden="true"
              />
              <h1>
                <span className={homeStyles.srOnly}>
                  Frog Trading Exchange
                </span>
                <img
                  src="/logo.png"
                  alt="Frog Trading Exchange"
                  className={homeStyles.brandLogo}
                />
              </h1>
              <video
                src="/sticker/wink.webm"
                className={`${homeStyles.headerSticker} ${homeStyles.headerStickerLarge}`}
                autoPlay
                loop
                muted
                playsInline
                aria-hidden="true"
              />
            </div>
            <p className={homeStyles.tagline}>
              Powered by Titan for the best prices on Solana
            </p>
          </button>
        </div>
        <div className={homeStyles.rightControls}>
          <button
            type="button"
            className={styles.swapButton}
            onClick={() => router.push("/")}
            aria-label="Back to swap"
            title="Back to swap"
          >
            <img src="/swap.svg" alt="" />
          </button>
        </div>
      </header>
      <Ticker />

      <section className={styles.panel} aria-labelledby="account-title">
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>Frog Trading Exchange</span>
            <h1 id="account-title">Account</h1>
          </div>
          {authenticated ? (
            <span className={styles.connectedStatus}>Connected</span>
          ) : null}
        </div>

        {!authenticated ? (
          <div className={styles.connectState}>
            <img src="/sbficon.png" alt="" />
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() =>
                login({
                  loginMethods: ["telegram", "google", "apple", "wallet"],
                })
              }
              disabled={!ready}
            >
              {ready ? "Log in / Sign up" : "Loading"}
            </button>
            <span>Secured by Privy</span>
          </div>
        ) : (
          <>
            <section className={styles.identitySection} aria-label="Telegram">
              <span className={styles.sectionLabel}>Telegram</span>
              <strong>{telegramName}</strong>
              {telegramAccount?.userId ? (
                <span className={styles.identityMeta}>
                  ID {telegramAccount.userId}
                </span>
              ) : null}
            </section>

            <section className={styles.walletSection} aria-label="Wallets">
              <div className={styles.sectionHeading}>
                <div>
                  <h2>Wallets</h2>
                  <span>{wallets.length + (perpsWallet ? 1 : 0)}</span>
                </div>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={handleAddPortfolioWallet}
                >
                  Add portfolio wallet
                </button>
              </div>

              {wallets.length ? (
                <div className={styles.walletList}>
                  {wallets.map((wallet, index) => {
                    return (
                      <Fragment key={wallet.address}>
                        <div className={styles.walletRow}>
                          <div className={styles.walletIdentity}>
                            <span>{walletLabel(wallet)}</span>
                            <strong title={wallet.address}>
                              {wallet.address}
                            </strong>
                            <div className={styles.walletStats}>
                              <span>
                                {formatSolBalance(
                                  walletBalances[wallet.address],
                                )}
                              </span>
                              {!wallet.embedded ||
                              wallet.address === spotWalletAddress ? (
                                <span>
                                  {portfolioLoading
                                    ? "Checking Frogs"
                                    : `${frogCounts.get(wallet.address) ?? 0} ${
                                        (frogCounts.get(wallet.address) ?? 0) ===
                                        1
                                          ? "Frog"
                                          : "Frogs"
                                      }`}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className={styles.walletActions}>
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              onClick={() => void handleCopy(wallet.address)}
                              aria-label={`Copy wallet ${index + 1} address`}
                            >
                              {copiedAddress === wallet.address
                                ? "Copied"
                                : "Copy"}
                            </button>
                            {wallet.embedded ? (
                              <button
                                type="button"
                                className={styles.secondaryButton}
                                onClick={() =>
                                  void handleExport(wallet.address)
                                }
                                disabled={Boolean(busyAction)}
                                aria-label={`Export wallet ${index + 1}`}
                              >
                                {busyAction === wallet.address
                                  ? "Opening"
                                  : "Export"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                        {wallet.address === spotWalletAddress && perpsWallet ? (
                          <div className={styles.walletRow}>
                            <div className={styles.walletIdentity}>
                              <span>Perps Deposit Wallet (Imperial)</span>
                              <strong title={perpsWallet.profileAddress}>
                                {perpsWallet.profileAddress}
                              </strong>
                              <div className={styles.walletStats}>
                                <span>
                                  {formatUsdcBalance(perpsWallet.profileUsdc)}
                                </span>
                                <span>
                                  Minimum {perpsWallet.minimumProfileUsdc} USDC
                                </span>
                              </div>
                            </div>
                            <div className={styles.walletActions}>
                              <button
                                type="button"
                                className={styles.secondaryButton}
                                onClick={() =>
                                  void handleCopy(perpsWallet.profileAddress)
                                }
                                aria-label="Copy Perps Deposit Wallet address"
                              >
                                {copiedAddress === perpsWallet.profileAddress
                                  ? "Copied"
                                  : "Copy"}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </div>
              ) : null}
              {!spotWalletAddress ? (
                <div className={styles.emptyWallet}>
                  <span>No Solana wallet yet.</span>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => void handleCreateWallet()}
                    disabled={Boolean(busyAction)}
                  >
                    {busyAction === "create"
                      ? "Creating"
                      : "Create Solana Wallet"}
                  </button>
                </div>
              ) : null}
            </section>

            <section
              className={styles.portfolioSection}
              aria-labelledby="frog-portfolio-title"
            >
              <div className={styles.portfolioHeading}>
                <div>
                  <h2 id="frog-portfolio-title">
                    Solana Business Frogs
                  </h2>
                </div>
                <strong>
                  {portfolioLoading ? "Checking" : (frogPortfolio?.total ?? 0)}
                </strong>
              </div>
              {!portfolioLoading && (frogPortfolio?.total ?? 0) > 0 ? (
                <>
                  <p className={styles.holderStatus}>Frog holder verified</p>
                  <div className={styles.frogGrid}>
                    {(frogPortfolio?.items ?? []).slice(0, 8).map((frog) => (
                      <div className={styles.frogItem} key={frog.mint}>
                        {frog.image ? (
                          <img src={frog.image} alt="" loading="lazy" />
                        ) : (
                          <img src="/sbficon.png" alt="" />
                        )}
                        <span title={frog.name}>{frog.name}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className={styles.portfolioEmpty}>
                  {portfolioLoading
                    ? "Checking every wallet on your account."
                    : "No Business Frogs found in your wallets."}
                </p>
              )}
            </section>

            <div className={styles.accountFooter}>
              <span>Sign out to use another account.</span>
              <button
                type="button"
                className={styles.signOutButton}
                onClick={() => void handleLogout()}
                disabled={Boolean(busyAction)}
              >
                {busyAction === "logout" ? "Signing out" : "Sign out"}
              </button>
            </div>
          </>
        )}

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
