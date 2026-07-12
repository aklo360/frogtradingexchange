"use client";

import { useMemo, useState } from "react";
import {
  PrivyProvider,
  useLoginWithTelegram,
  useLogout,
  usePrivy,
  useSigners,
} from "@privy-io/react-auth";
import { useExportWallet, useWallets } from "@privy-io/react-auth/solana";

import styles from "./ribbot.module.css";
import { resolvePrivyOwnershipStatus } from "./privyOwnership";

export type PrivyControlAccount = {
  telegramUserId: string;
  privyUserId?: string;
  solanaWalletAddress?: string;
  botAccessRevokedAt?: string;
};

type WalletAction = "claim" | "export" | "revoke" | "restore";

type PrivyWalletControlsProps = {
  account: PrivyControlAccount;
  sessionActive: boolean;
  onRecordAction: (action: WalletAction) => Promise<boolean>;
};

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
const botSignerId = process.env.NEXT_PUBLIC_PRIVY_BOT_SIGNER_ID?.trim();
const botPolicyIds = (process.env.NEXT_PUBLIC_PRIVY_BOT_POLICY_IDS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

export function PrivyWalletControls(props: PrivyWalletControlsProps) {
  if (!privyAppId) {
    return (
      <div className={styles.privyUnavailable} role="status">
        Privy ownership controls are unavailable.
      </div>
    );
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ["telegram"],
        embeddedWallets: {
          solana: { createOnLogin: "off" },
        },
      }}
    >
      <PrivyWalletControlsInner {...props} />
    </PrivyProvider>
  );
}

function PrivyWalletControlsInner({
  account,
  sessionActive,
  onRecordAction,
}: PrivyWalletControlsProps) {
  const { authenticated, ready, user } = usePrivy();
  const { login } = useLoginWithTelegram();
  const { logout } = useLogout();
  const { ready: walletsReady, wallets } = useWallets();
  const { exportWallet } = useExportWallet();
  const { addSigners, removeSigners } = useSigners();
  const [busy, setBusy] = useState<WalletAction | "login" | "logout" | null>(
    null,
  );
  const [confirmSignerRemoval, setConfirmSignerRemoval] = useState(false);
  const [restorePendingSync, setRestorePendingSync] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const walletAddresses = useMemo(() => {
    const addresses = new Set(wallets.map((wallet) => wallet.address));
    for (const linkedAccount of user?.linkedAccounts ?? []) {
      if (
        "address" in linkedAccount &&
        typeof linkedAccount.address === "string"
      ) {
        addresses.add(linkedAccount.address);
      }
    }
    return Array.from(addresses);
  }, [user, wallets]);

  const ownershipStatus = resolvePrivyOwnershipStatus({
    ready: ready && (!authenticated || walletsReady),
    authenticated,
    expectedPrivyUserId: account.privyUserId,
    expectedTelegramUserId: account.telegramUserId,
    expectedWalletAddress: account.solanaWalletAddress,
    authenticatedPrivyUserId: user?.id,
    authenticatedTelegramUserId: user?.telegram?.telegramUserId,
    walletAddresses,
  });
  const verified = ownershipStatus === "verified";
  const disabled = !sessionActive || busy !== null;

  const run = async (
    action: WalletAction | "login" | "logout",
    operation: () => Promise<void>,
  ) => {
    setBusy(action);
    setNotice("");
    setError("");
    try {
      await operation();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Privy could not complete this wallet action.",
      );
    } finally {
      setBusy(null);
    }
  };

  const record = async (action: WalletAction, success: string) => {
    if (!(await onRecordAction(action))) {
      throw new Error("FTX could not synchronize the wallet action.");
    }
    setNotice(success);
  };

  const handleExport = () =>
    run("export", async () => {
      if (!account.solanaWalletAddress) {
        throw new Error("FTX has no managed wallet address for this account.");
      }
      await exportWallet({ address: account.solanaWalletAddress });
      await record("export", "Privy export flow closed.");
    });

  const handleRemoveSigners = () =>
    run("revoke", async () => {
      if (!account.solanaWalletAddress) {
        throw new Error("FTX has no managed wallet address for this account.");
      }
      if (!(await onRecordAction("revoke"))) {
        throw new Error(
          "FTX could not pause bot access before signer removal.",
        );
      }
      await removeSigners({ address: account.solanaWalletAddress });
      setNotice("FTX bot access paused and app signers removed.");
      setConfirmSignerRemoval(false);
    });

  const handleRestoreSigner = () =>
    run("restore", async () => {
      if (!account.solanaWalletAddress || !botSignerId) {
        throw new Error("Privy bot signer restoration is not configured.");
      }
      if (!restorePendingSync) {
        await addSigners({
          address: account.solanaWalletAddress,
          signers: [{ signerId: botSignerId, policyIds: botPolicyIds }],
        });
        setRestorePendingSync(true);
      }
      await record(
        "restore",
        "Privy bot signer restored and FTX access enabled.",
      );
      setRestorePendingSync(false);
    });

  return (
    <div className={styles.privyControl}>
      <div className={styles.privyStatusRow}>
        <span>Privy ownership</span>
        <strong data-status={ownershipStatus}>
          {ownershipStatusLabel(ownershipStatus)}
        </strong>
      </div>

      {ownershipStatus === "signed_out" ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => run("login", () => login())}
        >
          {busy === "login" ? "Opening Privy" : "Sign in with Telegram"}
        </button>
      ) : null}

      {ownershipStatus === "wrong_privy_user" ||
      ownershipStatus === "wrong_telegram_user" ? (
        <div className={styles.privyMismatch}>
          <span>This Privy session does not match the Ribbot account.</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => run("logout", () => logout())}
          >
            {busy === "logout" ? "Signing out" : "Use another account"}
          </button>
        </div>
      ) : null}

      {ownershipStatus === "wallet_missing" ? (
        <div className={styles.privyMismatch}>
          The authenticated Privy user does not expose the FTX-managed Solana
          wallet.
        </div>
      ) : null}

      {verified ? (
        <div className={styles.privyActionGrid}>
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              run("claim", () =>
                record("claim", "Privy wallet ownership verified."),
              )
            }
          >
            {busy === "claim" ? "Verifying" : "Verify claim"}
          </button>
          <button type="button" disabled={disabled} onClick={handleExport}>
            {busy === "export" ? "Opening Privy" : "Export key"}
          </button>
          {account.botAccessRevokedAt ? (
            <button
              type="button"
              disabled={disabled || !botSignerId}
              onClick={handleRestoreSigner}
            >
              {busy === "restore"
                ? "Restoring"
                : restorePendingSync
                  ? "Sync FTX access"
                  : "Restore signer"}
            </button>
          ) : (
            <button
              type="button"
              className={styles.dangerButton}
              disabled={disabled}
              onClick={() => setConfirmSignerRemoval(true)}
            >
              Remove app signers
            </button>
          )}
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={disabled}
            onClick={() => run("logout", () => logout())}
          >
            {busy === "logout" ? "Signing out" : "Sign out"}
          </button>
        </div>
      ) : null}

      {confirmSignerRemoval ? (
        <div className={styles.signerConfirmation} role="alert">
          <span>Remove every additional signer from this wallet?</span>
          <div>
            <button
              type="button"
              className={styles.dangerButton}
              disabled={disabled}
              onClick={handleRemoveSigners}
            >
              {busy === "revoke" ? "Removing" : "Confirm removal"}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={disabled}
              onClick={() => setConfirmSignerRemoval(false)}
            >
              Keep access
            </button>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className={styles.privyNotice} role="status">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className={styles.privyError} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function ownershipStatusLabel(
  status: ReturnType<typeof resolvePrivyOwnershipStatus>,
) {
  switch (status) {
    case "loading":
      return "Checking";
    case "signed_out":
      return "Sign-in required";
    case "wrong_privy_user":
    case "wrong_telegram_user":
      return "Account mismatch";
    case "wallet_missing":
      return "Wallet mismatch";
    case "verified":
      return "Verified";
  }
}
