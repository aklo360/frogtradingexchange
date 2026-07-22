"use client";

import { ConnectionProvider } from "@solana/wallet-adapter-react";

type Props = {
  children: React.ReactNode;
};

export const SolanaProvider = ({ children }: Props) => {
  const isBrowser = typeof window !== "undefined";
  const publicHttp = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  const publicWs = process.env.NEXT_PUBLIC_SOLANA_WS_URL;

  const endpoint =
    publicHttp ?? (isBrowser ? `${window.location.origin}/rpc` : "https://api.mainnet-beta.solana.com");

  // Derive ws endpoint if provided or from HTTP; helps local dev avoid WS rewrite issues
  const wsEndpoint =
    publicWs ??
    (publicHttp
      ? publicHttp.replace(/^http(\w*):/i, (_, s) => (s && s.toLowerCase().startsWith("s") ? "wss:" : "ws:"))
      : isBrowser
        ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/rpc`
        : undefined);

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "processed", wsEndpoint }}>
      {children}
    </ConnectionProvider>
  );
};
