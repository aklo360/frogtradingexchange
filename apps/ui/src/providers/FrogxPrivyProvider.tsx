"use client";

import dynamic from "next/dynamic";

type Props = {
  children: React.ReactNode;
};

const FrogxPrivyRuntime = dynamic(
  () => import("./FrogxPrivyRuntime").then((mod) => mod.FrogxPrivyRuntime),
  { ssr: false },
);

const getPrivyAppId = () => {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? "";
  return /^c[a-z0-9]{20,}$/i.test(appId) ? appId : "";
};

export const isPrivyConfigured = () =>
  Boolean(getPrivyAppId());

export const FrogxPrivyProvider = ({ children }: Props) => {
  const appId = getPrivyAppId();
  if (!appId) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#08021e",
          color: "#f5fbff",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <section>
          <h1 style={{ margin: "0 0 12px", fontSize: "24px" }}>
            Account mode is not configured
          </h1>
          <p style={{ margin: 0, maxWidth: "520px", lineHeight: 1.5 }}>
            Set NEXT_PUBLIC_PRIVY_APP_ID before loading Frog Trading Exchange.
          </p>
        </section>
      </main>
    );
  }

  return (
    <FrogxPrivyRuntime appId={appId}>
      {children}
    </FrogxPrivyRuntime>
  );
};
