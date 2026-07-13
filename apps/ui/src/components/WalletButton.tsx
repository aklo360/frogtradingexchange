"use client";

import { useCallback, useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@solana/wallet-adapter-react";

import { getPrivySolanaWallets } from "@/lib/privy";

type Props = {
  className?: string;
};

const formatAddress = (address: string) =>
  `${address.slice(0, 4)}…${address.slice(-4)}`;

export const WalletButton = ({ className }: Props) => {
  const {
    ready,
    authenticated,
    user,
    login,
    logout,
  } = usePrivy();
  const { connected, connecting, disconnecting, publicKey, disconnect } =
    useWallet();
  const privyWallet = useMemo(
    () => getPrivySolanaWallets(user?.linkedAccounts)[0],
    [user?.linkedAccounts],
  );

  const label = useMemo(() => {
    if (!ready) return "Loading account…";
    if (connecting) return "Connecting…";
    if (disconnecting) return "Disconnecting…";
    if (authenticated) {
      return privyWallet ? formatAddress(privyWallet.address) : "FTX Account";
    }
    if (connected && publicKey) {
      return formatAddress(publicKey.toBase58());
    }
    return "Sign in / Create account";
  }, [
    authenticated,
    connected,
    connecting,
    disconnecting,
    privyWallet,
    publicKey,
    ready,
  ]);

  const handleClick = useCallback(() => {
    if (!ready || connecting || disconnecting) return;
    if (authenticated) {
      void Promise.all([logout(), connected ? disconnect() : Promise.resolve()]);
      return;
    }
    if (connected) {
      void disconnect();
      return;
    }
    login({ loginMethods: ["telegram", "email", "wallet"] });
  }, [
    authenticated,
    connected,
    connecting,
    disconnect,
    disconnecting,
    login,
    logout,
    ready,
  ]);

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      disabled={!ready || connecting || disconnecting}
      aria-live="polite"
    >
      {label}
    </button>
  );
};
