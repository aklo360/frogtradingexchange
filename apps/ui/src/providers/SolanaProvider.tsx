"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";

import "@solana/wallet-adapter-react-ui/styles.css";

type Props = {
  children: React.ReactNode;
};

export const SolanaProvider = ({ children }: Props) => {
  const endpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
    (typeof window !== "undefined"
      ? `${window.location.origin}/rpc`
      : "https://api.mainnet-beta.solana.com");

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "processed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
