"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  useLogin,
  useModalStatus,
  usePrivy,
} from "@privy-io/react-auth";
import {
  useCreateWallet,
  useWallets,
  type ConnectedStandardSolanaWallet,
} from "@privy-io/react-auth/solana";

import { getPrivySolanaWallets } from "@/lib/privy";

const LOGIN_METHODS = ["telegram", "google", "apple", "wallet"] as const;

type PublicWalletContextValue = {
  authenticated: boolean;
  ready: boolean;
  wallet: ConnectedStandardSolanaWallet | null;
  connecting: boolean;
  disconnecting: boolean;
  connect: () => void;
  disconnect: () => Promise<void>;
};

const PublicWalletContext = createContext<PublicWalletContextValue | null>(
  null,
);

type Props = {
  children: React.ReactNode;
};

export const PublicWalletProvider = ({ children }: Props) => {
  const {
    ready: privyReady,
    authenticated,
    user,
    logout,
  } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const { isOpen: isPrivyModalOpen } = useModalStatus();

  const privyWallets = useMemo(
    () => getPrivySolanaWallets(user?.linkedAccounts),
    [user?.linkedAccounts],
  );
  const spotWalletAddress = useMemo(
    () =>
      privyWallets.find(
        (candidate) =>
          candidate.embedded && candidate.walletIndex === 0,
      )?.address ??
      privyWallets.find(
        (candidate) =>
          candidate.embedded && candidate.walletIndex === null,
      )?.address ??
      null,
    [privyWallets],
  );
  const spotWallet = useMemo(
    () =>
      authenticated && spotWalletAddress
        ? (wallets.find(
            (candidate) => candidate.address === spotWalletAddress,
          ) ?? null)
        : null,
    [authenticated, spotWalletAddress, wallets],
  );
  const wallet = authenticated ? spotWallet : null;

  const { login } = useLogin();

  const connect = useCallback(() => {
    if (
      !privyReady ||
      !walletsReady ||
      isPrivyModalOpen ||
      creatingWallet
    ) {
      return;
    }

    if (authenticated) {
      if (spotWalletAddress) return;
      setCreatingWallet(true);
      void createWallet()
        .catch((error: unknown) => {
          console.error("Failed to create Spot & NFT Wallet (Privy)", error);
        })
        .finally(() => setCreatingWallet(false));
      return;
    }

    login({ loginMethods: [...LOGIN_METHODS] });
  }, [
    authenticated,
    createWallet,
    creatingWallet,
    isPrivyModalOpen,
    login,
    privyReady,
    spotWalletAddress,
    walletsReady,
  ]);

  const disconnect = useCallback(async () => {
    if (!wallet || disconnecting) return;

    setDisconnecting(true);
    try {
      await logout();
    } finally {
      setDisconnecting(false);
    }
  }, [disconnecting, logout, wallet]);

  const value = useMemo<PublicWalletContextValue>(
    () => ({
      authenticated,
      ready: privyReady && walletsReady,
      wallet,
      connecting: creatingWallet || (isPrivyModalOpen && !wallet),
      disconnecting,
      connect,
      disconnect,
    }),
    [
      authenticated,
      connect,
      creatingWallet,
      disconnect,
      disconnecting,
      isPrivyModalOpen,
      privyReady,
      wallet,
      walletsReady,
    ],
  );

  return (
    <PublicWalletContext.Provider value={value}>
      {children}
    </PublicWalletContext.Provider>
  );
};

export const usePublicWallet = () => {
  const context = useContext(PublicWalletContext);

  if (!context) {
    throw new Error("usePublicWallet must be used within PublicWalletProvider");
  }

  return context;
};
