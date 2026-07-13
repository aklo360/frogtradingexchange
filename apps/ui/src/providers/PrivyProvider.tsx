"use client";

import { PrivyProvider as ReactPrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";

type Props = {
  children: React.ReactNode;
};

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const solanaConnectors = toSolanaWalletConnectors({ shouldAutoConnect: true });

export const PrivyProvider = ({ children }: Props) => {
  if (!appId) {
    throw new Error("NEXT_PUBLIC_PRIVY_APP_ID is not configured");
  }

  return (
    <ReactPrivyProvider
      appId={appId}
      config={{
        loginMethods: ["telegram", "email", "wallet"],
        appearance: {
          theme: "dark",
          accentColor: "#18e299",
          walletChainType: "solana-only",
          showWalletLoginFirst: false,
        },
        embeddedWallets: {
          solana: { createOnLogin: "off" },
        },
        externalWallets: {
          solana: { connectors: solanaConnectors },
        },
      }}
    >
      {children}
    </ReactPrivyProvider>
  );
};
