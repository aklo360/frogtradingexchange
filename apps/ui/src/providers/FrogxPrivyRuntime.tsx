"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";

type Props = {
  appId: string;
  children: React.ReactNode;
};

const getHttpEndpoint = () => {
  const publicHttp = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (publicHttp) return publicHttp;
  if (typeof window !== "undefined") return `${window.location.origin}/rpc`;
  return "https://api.mainnet-beta.solana.com";
};

const getWsEndpoint = () => {
  const publicWs = process.env.NEXT_PUBLIC_SOLANA_WS_URL;
  if (publicWs) return publicWs;
  return "wss://api.mainnet-beta.solana.com";
};

export const FrogxPrivyRuntime = ({ appId, children }: Props) => {
  const httpEndpoint = getHttpEndpoint();
  const wsEndpoint = getWsEndpoint();

  return (
    <PrivyProvider
      appId={appId}
      config={{
        solana: {
          rpcs: {
            "solana:mainnet": {
              rpc: createSolanaRpc(httpEndpoint),
              rpcSubscriptions: createSolanaRpcSubscriptions(wsEndpoint),
            },
          },
        },
        appearance: {
          accentColor: "#14f195",
          logo: "/sbficon.png",
          showWalletLoginFirst: false,
          theme: "dark",
          walletChainType: "ethereum-and-solana",
          walletList: [
            "phantom",
            "metamask",
            "detected_solana_wallets",
            "detected_ethereum_wallets",
            "wallet_connect_qr_solana",
            "wallet_connect_qr",
          ],
        },
        loginMethodsAndOrder: {
          primary: ["telegram", "google", "phantom", "metamask"],
          overflow: [
            "detected_solana_wallets",
            "detected_ethereum_wallets",
            "email",
          ],
        },
        externalWallets: {
          solana: {
            connectors: toSolanaWalletConnectors(),
          },
        },
        embeddedWallets: {
          disableAutomaticMigration: true,
          showWalletUIs: true,
          ethereum: {
            createOnLogin: "off",
          },
          solana: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
};
