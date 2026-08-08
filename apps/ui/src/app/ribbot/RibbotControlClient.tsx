"use client";

/* eslint-disable @next/next/no-img-element -- Pixel art assets are static and intentionally unoptimized. */

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePrivy, useSigners } from "@privy-io/react-auth";
import {
  useExportWallet,
  useSignMessage,
  useWallets,
} from "@privy-io/react-auth/solana";
import bs58 from "bs58";

import { getTelegramAccount } from "@/lib/privy";
import {
  controlCodeFromHash,
  controlIdentityStatus,
  identityStatusMessage,
  normalizeControlCode,
  spotControlWallet,
  shortAddress,
  type ControlAccount,
} from "./control";
import styles from "./ribbot.module.css";

type ImperialConnection = {
  status: "connected";
  authorityWalletAddress: string;
  profileAddress: string | null;
  profileIndex: 1;
  expiresAt: number;
  connectedAt: string;
  referrerUsername: "sbf";
};

type AutomationSigner = {
  signerId: string;
  policyIds: string[];
};

type ControlSessionResponse =
  | {
      status: "ready";
      account: ControlAccount;
      sessionToken: string;
      sessionExpiresAt: string;
      imperialConnection?: ImperialConnection | null;
      automationSigner?: AutomationSigner | null;
      automationSignerReady?: boolean;
    }
  | {
      status?: string;
      error?: string;
      required?: string[];
    };

type WalletActionResponse = {
  status?: string;
  error?: string;
  warnings?: string[];
  updatedAt?: string;
  account?: ControlAccount;
  automationSignerReady?: boolean;
};

type ImperialConnectionResponse = {
  status?: string;
  connection?: ImperialConnection;
  error?: string;
};

const readApiError = async (response: Response, fallback: string) => {
  const text = await response.text();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    return typeof parsed.error === "string" && parsed.error.trim()
      ? parsed.error
      : fallback;
  } catch {
    return fallback;
  }
};

export function RibbotControlClient() {
  const searchParams = useSearchParams();
  const initialTelegramUserId = searchParams.get("telegramUserId") ?? "";
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { addSigners, removeSigners } = useSigners();
  const { exportWallet } = useExportWallet();
  const { signMessage } = useSignMessage();
  const { ready: walletsReady, wallets: privyStandardWallets } = useWallets();
  const [telegramUserId, setTelegramUserId] = useState(initialTelegramUserId);
  const [code, setCode] = useState("");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [account, setAccount] = useState<ControlAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [removingAccess, setRemovingAccess] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [signersRemoved, setSignersRemoved] = useState(false);
  const [enablingRibbot, setEnablingRibbot] = useState(false);
  const [imperialConnection, setImperialConnection] =
    useState<ImperialConnection | null>(null);
  const [automationSigner, setAutomationSigner] =
    useState<AutomationSigner | null>(null);
  const [automationSignerReady, setAutomationSignerReady] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const spotWallet = useMemo(() => spotControlWallet(account), [account]);
  const telegramAccount = useMemo(
    () => getTelegramAccount(user?.linkedAccounts),
    [user?.linkedAccounts],
  );
  const identityStatus = controlIdentityStatus({
    account,
    authenticated,
    linkedAccounts: user?.linkedAccounts,
    privyUserId: user?.id,
  });
  const imperialSigningWallet = useMemo(
    () =>
      spotWallet
        ? privyStandardWallets.find(
            (wallet) =>
              wallet.address === spotWallet.solanaWalletAddress,
          ) ?? null
        : null,
    [spotWallet, privyStandardWallets],
  );
  const canExport =
    identityStatus === "ready" &&
    Boolean(spotWallet?.solanaWalletAddress) &&
    Boolean(sessionToken) &&
    !exporting;
  const canRemoveAccess =
    identityStatus === "ready" &&
    Boolean(spotWallet?.solanaWalletAddress) &&
    Boolean(account && sessionToken) &&
    !removingAccess &&
    !signersRemoved;
  const canEnableRibbot =
    identityStatus === "ready" &&
    Boolean(
      account &&
        sessionToken &&
        spotWallet &&
        imperialSigningWallet &&
        automationSigner,
    ) &&
    walletsReady &&
    !enablingRibbot;

  useEffect(() => {
    const linkedCode = controlCodeFromHash(window.location.hash);
    if (linkedCode) setCode((currentCode) => currentCode || linkedCode);
  }, []);

  const exchangeCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const normalizedCode = normalizeControlCode(code);
    const normalizedTelegramUserId = telegramUserId.trim();
    if (!normalizedTelegramUserId || !normalizedCode) {
      setError("Telegram ID and control code are required.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        "/api/frogx/trading-bot/control/session",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            telegramUserId: normalizedTelegramUserId,
            code: normalizedCode,
          }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await readApiError(response, "Control code exchange failed."),
        );
      }
      const data = (await response.json()) as ControlSessionResponse;
      if (data.status !== "ready" || !("account" in data)) {
        throw new Error(
          "error" in data && data.error
            ? data.error
            : "Control session is not ready.",
        );
      }
      setAccount(data.account);
      setSessionToken(data.sessionToken);
      setImperialConnection(data.imperialConnection ?? null);
      setAutomationSigner(data.automationSigner ?? null);
      setAutomationSignerReady(Boolean(data.automationSignerReady));
      setShowSuccessDialog(false);
      setConfirmingRemoval(false);
      setSignersRemoved(false);
    } catch (exchangeError) {
      setAccount(null);
      setSessionToken(null);
      setImperialConnection(null);
      setAutomationSigner(null);
      setAutomationSignerReady(false);
      setShowSuccessDialog(false);
      setConfirmingRemoval(false);
      setSignersRemoved(false);
      setError(
        exchangeError instanceof Error
          ? exchangeError.message
          : "Control code exchange failed.",
      );
    } finally {
      setLoading(false);
    }
  };

  const enableRibbot = async () => {
    if (
      !account ||
      !sessionToken ||
      !spotWallet?.solanaWalletAddress ||
      !imperialSigningWallet
    ) {
      return;
    }

    setError(null);
    setMessage(null);
    setEnablingRibbot(true);
    try {
      const wallet = spotWallet.solanaWalletAddress;
      if (!automationSignerReady) {
        if (!automationSigner) {
          throw new Error("Ribbot automation is unavailable.");
        }
        await addSigners({
          address: wallet,
          signers: [automationSigner],
        });
        const signerResponse = await fetch(
          "/api/frogx/trading-bot/control/wallet",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              telegramUserId: account.telegramUserId,
              sessionToken,
              userPublicKey: wallet,
              action: "verify_signer",
            }),
          },
        );
        if (!signerResponse.ok) {
          throw new Error(
            await readApiError(
              signerResponse,
              "Privy could not confirm Ribbot access.",
            ),
          );
        }
        const signerData =
          (await signerResponse.json()) as WalletActionResponse;
        if (!signerData.automationSignerReady) {
          throw new Error("Privy could not confirm Ribbot access.");
        }
        setAutomationSignerReady(true);
      }

      if (account.botAccessRevokedAt) {
        const restoreResponse = await fetch(
          "/api/frogx/trading-bot/control/wallet",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              telegramUserId: account.telegramUserId,
              sessionToken,
              userPublicKey: wallet,
              action: "restore",
            }),
          },
        );
        if (!restoreResponse.ok) {
          throw new Error(
            await readApiError(
              restoreResponse,
              "Frog Trading Exchange could not restore Ribbot access.",
            ),
          );
        }
        const restoreData =
          (await restoreResponse.json()) as WalletActionResponse;
        if (!restoreData.account || restoreData.account.botAccessRevokedAt) {
          throw new Error(
            "Frog Trading Exchange could not restore Ribbot access.",
          );
        }
        setAccount(restoreData.account);
      }

      if (imperialConnection) {
        setShowSuccessDialog(true);
        return;
      }

      const authMessage = `imperial:mobile-connect:${wallet}:${Date.now()}`;
      const signed = await signMessage({
        message: new TextEncoder().encode(authMessage),
        wallet: imperialSigningWallet,
      });
      const response = await fetch(
        "/api/frogx/trading-bot/control/imperial",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            telegramUserId: account.telegramUserId,
            sessionToken,
            wallet,
            message: authMessage,
            signature: bs58.encode(signed.signature),
          }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await readApiError(response, "Imperial connection failed."),
        );
      }
      const data = (await response.json()) as ImperialConnectionResponse;
      if (data.status !== "connected" || !data.connection) {
        throw new Error(data.error || "Imperial connection failed.");
      }

      setImperialConnection(data.connection);
      setShowSuccessDialog(true);
    } catch (connectionError) {
      setError(
        connectionError instanceof Error
          ? connectionError.message
          : "Ribbot setup failed.",
      );
    } finally {
      setEnablingRibbot(false);
    }
  };

  const openExportModal = async () => {
    if (!account || !sessionToken || !spotWallet?.solanaWalletAddress) return;
    setError(null);
    setMessage(null);
    setExporting(true);
    try {
      const response = await fetch("/api/frogx/trading-bot/control/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramUserId: account.telegramUserId,
          sessionToken,
          userPublicKey: spotWallet.solanaWalletAddress,
          action: "export",
        }),
      });
      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            "Frog Trading Exchange could not record the export request.",
          ),
        );
      }
      const data = (await response.json()) as WalletActionResponse;
      if (data.error) throw new Error(data.error);
      await exportWallet({ address: spotWallet.solanaWalletAddress });
      setMessage("Private key export finished in Privy.");
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Privy export could not be opened.",
      );
    } finally {
      setExporting(false);
    }
  };

  const removeRibbotAccess = async () => {
    if (!account || !sessionToken || !spotWallet?.solanaWalletAddress) return;
    setError(null);
    setMessage(null);
    setRemovingAccess(true);
    let ftxAccessRevoked = false;

    try {
      const response = await fetch("/api/frogx/trading-bot/control/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramUserId: account.telegramUserId,
          sessionToken,
          userPublicKey: spotWallet.solanaWalletAddress,
          action: "revoke",
        }),
      });
      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            "Frog Trading Exchange could not disable Ribbot trading.",
          ),
        );
      }
      const data = (await response.json()) as WalletActionResponse;
      if (data.error) throw new Error(data.error);
      if (data.account) setAccount(data.account);
      ftxAccessRevoked = true;

      await removeSigners({ address: spotWallet.solanaWalletAddress });
      setAutomationSignerReady(false);
      setSignersRemoved(true);
      setConfirmingRemoval(false);
      setMessage(
        "Ribbot access removed. Only you can transact with this wallet.",
      );
    } catch (removalError) {
      setError(
        ftxAccessRevoked
          ? "Ribbot trading is disabled, but Privy could not remove every app signer. Try again."
          : removalError instanceof Error
            ? removalError.message
            : "Ribbot access could not be removed.",
      );
    } finally {
      setRemovingAccess(false);
    }
  };

  const accountIdentityReady =
    identityStatus === "ready" || identityStatus === "identity-ready";
  const setupComplete = Boolean(
    accountIdentityReady &&
      automationSignerReady &&
      imperialConnection &&
      !account?.botAccessRevokedAt,
  );
  const progressLabel = setupComplete
    ? "Setup complete"
    : account && accountIdentityReady
      ? "Step 2 of 2"
      : "Step 1 of 2";
  const walletLabel = spotWallet?.label ?? "Spot & NFT Wallet (Privy)";

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-label="Ribbot setup">
        <div className={styles.brandRow}>
          <img
            src="/ribbot-pfp.png"
            alt="Ribbot"
            className={styles.icon}
          />
          <div>
            <p className={styles.eyebrow}>Ribbot</p>
            <h1>Connect Frog Trading Exchange</h1>
          </div>
        </div>

        <div className={styles.releaseStatus}>
          <span className={styles.statusDot} aria-hidden="true" />
          {progressLabel}
        </div>

        {!account ? (
          <form className={styles.step} onSubmit={exchangeCode}>
            <div className={styles.sectionHeading}>
              <span>01</span>
              <div>
                <h2>Connect Telegram</h2>
                <p>Link Ribbot to your Frog Trading Exchange account.</p>
              </div>
            </div>
            <label className={styles.label}>
              Telegram ID
              <input
                value={telegramUserId}
                onChange={(event) => setTelegramUserId(event.target.value)}
                inputMode="numeric"
                autoComplete="off"
                className={styles.input}
              />
            </label>
            <label className={styles.label}>
              Control code
              <input
                value={code}
                onChange={(event) =>
                  setCode(normalizeControlCode(event.target.value))
                }
                autoComplete="one-time-code"
                className={styles.input}
                placeholder="ZFNX2D83VBUC"
              />
            </label>
            <button type="submit" className={styles.primary} disabled={loading}>
              {loading ? "Connecting" : "Connect Telegram"}
            </button>
            <p className={styles.integrationNotice}>
              Telegram connects your account. Ribbot cannot read your chats.
            </p>
          </form>
        ) : null}

        {account && !accountIdentityReady ? (
          <section className={styles.step} aria-labelledby="verify-account-title">
            <div className={styles.sectionHeading}>
              <span>01</span>
              <div>
                <h2 id="verify-account-title">Connect Telegram</h2>
                <p>
                  Privy verifies the same Telegram account. Telegram cannot
                  sign wallet transactions.
                </p>
              </div>
            </div>
            <div className={styles.summaryList}>
              <div>
                <span>Ribbot account</span>
                <strong>Telegram {account.telegramUserId}</strong>
              </div>
              <div>
                <span>Current login</span>
                <strong>
                  {authenticated
                    ? telegramAccount?.username
                      ? `@${telegramAccount.username}`
                      : telegramAccount?.userId
                        ? `Telegram ${telegramAccount.userId}`
                        : "Signed in"
                    : "Not signed in"}
                </strong>
              </div>
            </div>
            <p className={styles.warningText}>
              {identityStatusMessage(identityStatus)}
            </p>
            {!authenticated ? (
              <button
                type="button"
                className={styles.primary}
                onClick={() => login({ loginMethods: ["telegram"] })}
                disabled={!ready}
              >
                {ready ? "Connect Telegram" : "Loading Privy"}
              </button>
            ) : (
              <button
                type="button"
                className={styles.secondary}
                onClick={logout}
              >
                Sign in with a different account
              </button>
            )}
          </section>
        ) : null}

        {account && accountIdentityReady && !setupComplete ? (
          <section
            className={styles.step}
            aria-labelledby="ribbot-setup-title"
          >
            <div className={styles.sectionHeading}>
              <span>02</span>
              <div>
                <h2 id="ribbot-setup-title">Enable Ribbot</h2>
                <p>Set up Spot & NFT trading and Imperial perps.</p>
              </div>
            </div>
            <div className={styles.summaryList}>
              <div>
                <span>Telegram</span>
                <strong>
                  {telegramAccount?.username
                    ? `@${telegramAccount.username}`
                    : `Telegram ${account.telegramUserId}`}
                </strong>
              </div>
              <div>
                <span>Spot & NFT Wallet</span>
                <strong>
                  {spotWallet
                    ? `${walletLabel} ${shortAddress(spotWallet.solanaWalletAddress)}`
                    : "Wallet unavailable"}
                </strong>
              </div>
            </div>
            {spotWallet ? (
              <>
                <p className={styles.integrationNotice}>
                  Privy secures your private key. Ribbot, Frog Trading
                  Exchange, and Imperial never receive it. A separate removable
                  app signer lets Frog Trading Exchange submit transactions for
                  Ribbot automation. It cannot access your key or change wallet
                  ownership.
                </p>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={enableRibbot}
                  disabled={!canEnableRibbot}
                >
                  {enablingRibbot ? "Enabling Ribbot" : "Enable Ribbot"}
                </button>
                {!automationSigner ? (
                  <p className={styles.warningText}>
                    Ribbot automation is unavailable.
                  </p>
                ) : null}
                {!imperialSigningWallet ? (
                  <p className={styles.warningText}>
                    Sign in with the Privy account that owns this wallet.
                  </p>
                ) : null}
              </>
            ) : (
              <p className={styles.warningText}>
                Wallet setup did not finish. Return to Ribbot and tap Connect
                Account again.
              </p>
            )}
          </section>
        ) : null}

        {account && setupComplete && imperialConnection ? (
          <section
            className={styles.completion}
            aria-labelledby="setup-complete-title"
          >
            <span className={styles.successMark} aria-hidden="true">
              &#10003;
            </span>
            <h2 id="setup-complete-title">Ribbot is ready</h2>
            <p>
              One Frog Trading Exchange account now handles Spot & NFT trading
              and Imperial perps. Privy holds the only private key.
            </p>
            <div className={styles.summaryList}>
              <div>
                <span>Spot & NFT Wallet (Privy)</span>
                <strong>{spotWallet?.solanaWalletAddress}</strong>
              </div>
              <div>
                <span>Imperial Perps Wallet</span>
                <strong>
                  {imperialConnection.profileAddress ?? "Run /status in Ribbot"}
                </strong>
              </div>
            </div>
            {imperialConnection.profileAddress ? (
              <>
                <p className={styles.fundingPrompt}>Next: fund your wallet</p>
                <p>
                  Send SOL to the Spot & NFT Wallet for swaps and frogs. Send at
                  least 50 USDC on Solana to the Imperial Perps Wallet for perps
                  trading.
                </p>
                <p>Ribbot sent both wallet details to your Telegram DM.</p>
              </>
            ) : (
              <p className={styles.warningText}>
                Imperial is connected. Run /status in Ribbot for the profile address.
              </p>
            )}
            <section
              className={styles.walletControls}
              aria-labelledby="wallet-controls-title"
            >
              <h3 id="wallet-controls-title">Your wallet controls</h3>
              <p>
                Privy opens key export privately. Removing Ribbot access
                disables automated trading and removes every app signer.
              </p>
              {account.botAccessRevokedAt || signersRemoved ? (
                <p className={styles.accessRemoved}>
                  {signersRemoved
                    ? "Ribbot access removed. Only you can transact with this wallet."
                    : "Ribbot trading is disabled. Remove app signers in Privy to finish."}
                </p>
              ) : null}
              <div className={styles.controlActions}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={openExportModal}
                  disabled={!canExport}
                >
                  {exporting ? "Opening Privy" : "Export Spot & NFT key"}
                </button>
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() => setConfirmingRemoval(true)}
                  disabled={!canRemoveAccess}
                >
                  {removingAccess
                    ? "Removing access"
                    : signersRemoved
                      ? "Access removed"
                      : "Remove Ribbot access"}
                </button>
              </div>
            </section>
          </section>
        ) : null}

        <div className={styles.feedback} aria-live="polite">
          {message ? <p className={styles.message}>{message}</p> : null}
          {error ? <p className={styles.error}>{error}</p> : null}
        </div>
      </section>

      {showSuccessDialog && imperialConnection ? (
        <div className={styles.modalBackdrop}>
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ribbot-success-title"
          >
            <span className={styles.successMark} aria-hidden="true">
              &#10003;
            </span>
            <h2 id="ribbot-success-title">Ribbot is ready</h2>
            <p>
              Your Frog Trading Exchange account is ready for Spot & NFT trading
              and Imperial perps. Privy holds the only private key.
            </p>
            <div className={styles.summaryList}>
              <div>
                <span>Spot & NFT Wallet (Privy)</span>
                <strong>{spotWallet?.solanaWalletAddress}</strong>
              </div>
              <div>
                <span>Imperial Perps Wallet</span>
                <strong>
                  {imperialConnection.profileAddress ?? "Run /status in Ribbot"}
                </strong>
              </div>
            </div>
            {imperialConnection.profileAddress ? (
              <>
                <p className={styles.fundingPrompt}>Next: fund your wallet</p>
                <p>
                  Send SOL to the Spot & NFT Wallet for swaps and frogs. Send at
                  least 50 USDC on Solana to the Imperial Perps Wallet for perps
                  trading.
                </p>
              </>
            ) : (
              <p className={styles.warningText}>
                Run /status in Ribbot for the profile address.
              </p>
            )}
            <p className={styles.closeNotice}>
              Ribbot sent the setup result to Telegram. You can close this page.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={openExportModal}
                disabled={!canExport}
              >
                {exporting ? "Opening Privy" : "Export Spot & NFT key"}
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={() => setShowSuccessDialog(false)}
              >
                Done
              </button>
            </div>
            {message ? <p className={styles.message}>{message}</p> : null}
            {error ? <p className={styles.error}>{error}</p> : null}
          </section>
        </div>
      ) : null}

      {confirmingRemoval ? (
        <div className={styles.modalBackdrop}>
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-access-title"
          >
            <h2 id="remove-access-title">Remove Ribbot access?</h2>
            <p>
              This stops automated trading and removes every app signer. You
              must reconnect Ribbot before it can trade again.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setConfirmingRemoval(false)}
                disabled={removingAccess}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.danger}
                onClick={removeRibbotAccess}
                disabled={!canRemoveAccess}
              >
                {removingAccess ? "Removing access" : "Remove access"}
              </button>
            </div>
            {error ? <p className={styles.error}>{error}</p> : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
