"use client";

import { Connection } from "@solana/web3.js";
import { createContext, useContext, useMemo } from "react";

type Props = {
  children: React.ReactNode;
};

const SolanaConnectionContext = createContext<Connection | null>(null);

export const useSolanaConnection = () => {
  const connection = useContext(SolanaConnectionContext);

  if (!connection) {
    throw new Error(
      "useSolanaConnection must be used within a SolanaProvider",
    );
  }

  return connection;
};

export const SolanaProvider = ({ children }: Props) => {
  const isBrowser = typeof window !== "undefined";
  const publicHttp = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  const publicWs = process.env.NEXT_PUBLIC_SOLANA_WS_URL;

  const endpoint =
    publicHttp ??
    (isBrowser
      ? `${window.location.origin}/rpc`
      : "https://api.mainnet-beta.solana.com");

  const wsEndpoint =
    publicWs ??
    (publicHttp
      ? publicHttp.replace(/^http(\w*):/i, (_, suffix) =>
          suffix && suffix.toLowerCase().startsWith("s") ? "wss:" : "ws:",
        )
      : isBrowser
        ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/rpc`
        : undefined);

  const connection = useMemo(
    () =>
      new Connection(endpoint, {
        commitment: "processed",
        wsEndpoint,
      }),
    [endpoint, wsEndpoint],
  );

  return (
    <SolanaConnectionContext.Provider value={connection}>
      {children}
    </SolanaConnectionContext.Provider>
  );
};
