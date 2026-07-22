"use client";

import { useCallback, useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets as usePrivySolanaWallets } from "@privy-io/react-auth/solana";

type Props = {
  className?: string;
};

const formatAddress = (address: string) =>
  `${address.slice(0, 4)}…${address.slice(-4)}`;

export const WalletButton = ({ className }: Props) => {
  const { authenticated, login, logout, ready, user } = usePrivy();
  const { wallets } = usePrivySolanaWallets();
  const isFrogxWallet = (wallet: (typeof wallets)[number]) =>
    wallet.standardWallet.name.toLowerCase().includes("privy");
  const displayWallet =
    wallets.find((wallet) => !isFrogxWallet(wallet)) ??
    wallets.find(isFrogxWallet) ??
    null;

  const label = useMemo(() => {
    if (!ready) return "Loading account...";
    if (authenticated) {
      if (displayWallet?.address) {
        return formatAddress(displayWallet.address);
      }
      if (user?.id) {
        return formatAddress(user.id);
      }
      return "FTX Account";
    }
    return "Account Login";
  }, [authenticated, displayWallet?.address, ready, user?.id]);

  const handleClick = useCallback(() => {
    if (!ready) return;
    if (authenticated) {
      void logout();
      return;
    }
    login();
  }, [authenticated, login, logout, ready]);

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      disabled={!ready}
      aria-live="polite"
    >
      {label}
    </button>
  );
};
