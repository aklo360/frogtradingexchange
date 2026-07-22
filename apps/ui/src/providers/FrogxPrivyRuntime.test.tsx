import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FrogxPrivyRuntime } from "./FrogxPrivyRuntime";

const privyConfigMock = vi.hoisted(() => ({
  value: null as unknown,
}));

vi.mock("@privy-io/react-auth", () => ({
  PrivyProvider: ({
    children,
    config,
  }: {
    children: ReactNode;
    config: unknown;
  }) => {
    privyConfigMock.value = config;
    return <div data-testid="privy-provider">{children}</div>;
  },
}));

vi.mock("@privy-io/react-auth/solana", () => ({
  toSolanaWalletConnectors: () => ["solana-connector"],
}));

vi.mock("@solana/kit", () => ({
  createSolanaRpc: (endpoint: string) => ({ endpoint }),
  createSolanaRpcSubscriptions: (endpoint: string) => ({ endpoint }),
}));

describe("FrogxPrivyRuntime", () => {
  beforeEach(() => {
    privyConfigMock.value = null;
  });

  it("auto-creates a Solana embedded wallet for users without wallets", () => {
    render(
      <FrogxPrivyRuntime appId="cmqhok8w0007y0cjo5znwyvt5">
        <span>FTX ready</span>
      </FrogxPrivyRuntime>,
    );

    expect(screen.getByText("FTX ready")).toBeInTheDocument();
    const config = privyConfigMock.value as {
      appearance?: {
        showWalletLoginFirst?: boolean;
      };
      embeddedWallets?: {
        solana?: {
          createOnLogin?: string;
        };
      };
      loginMethodsAndOrder?: {
        primary?: string[];
      };
      loginMethods?: unknown;
    };
    expect(config.loginMethods).toBeUndefined();
    expect(config.appearance?.showWalletLoginFirst).toBe(false);
    expect(config.loginMethodsAndOrder?.primary).toEqual([
      "telegram",
      "google",
      "phantom",
      "metamask",
    ]);
    expect(config.embeddedWallets?.solana?.createOnLogin).toBe(
      "users-without-wallets",
    );
  });
});
