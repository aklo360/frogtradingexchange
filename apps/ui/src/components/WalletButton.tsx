"use client";

import { useCallback, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

type Props = {
  className?: string;
};

const formatAddress = (address: string) =>
  `${address.slice(0, 4)}…${address.slice(-4)}`;

export const WalletButton = ({ className }: Props) => {
  const { connected, connecting, disconnecting, publicKey, disconnect } =
    useWallet();
  const { setVisible } = useWalletModal();

  const label = useMemo(() => {
    if (connecting) return "Connecting…";
    if (disconnecting) return "Disconnecting…";
    if (connected && publicKey) {
      return formatAddress(publicKey.toBase58());
    }
    return "Connect Wallet";
  }, [connected, connecting, disconnecting, publicKey]);

  const handleClick = useCallback(() => {
    if (connecting || disconnecting) return;
    if (connected) {
      void disconnect();
      return;
    }
    setVisible(true);
  }, [connected, connecting, disconnecting, disconnect, setVisible]);

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      disabled={connecting || disconnecting}
      aria-live="polite"
    >
      {label}
    </button>
  );
};
