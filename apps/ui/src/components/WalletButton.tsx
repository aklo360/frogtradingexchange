"use client";

import { useCallback, useMemo } from "react";

import { usePublicWallet } from "@/providers/PublicWalletProvider";

type Props = {
  className?: string;
};

const formatAddress = (address: string) =>
  `${address.slice(0, 4)}…${address.slice(-4)}`;

export const WalletButton = ({ className }: Props) => {
  const {
    ready,
    wallet,
    connecting,
    disconnecting,
    connect,
    disconnect,
  } = usePublicWallet();

  const label = useMemo(() => {
    if (!ready) return "Loading…";
    if (connecting) return "Connecting…";
    if (disconnecting) return "Disconnecting…";
    if (wallet) {
      return formatAddress(wallet.address);
    }
    return "Connect Wallet";
  }, [connecting, disconnecting, ready, wallet]);

  const handleClick = useCallback(() => {
    if (!ready || connecting || disconnecting) return;
    if (wallet) {
      void disconnect();
      return;
    }
    connect();
  }, [
    connect,
    connecting,
    disconnect,
    disconnecting,
    ready,
    wallet,
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
