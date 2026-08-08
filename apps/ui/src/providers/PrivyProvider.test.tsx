import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connector: { id: "privy-solana-connector" },
  providerConfig: undefined as Record<string, unknown> | undefined,
  toSolanaWalletConnectors: vi.fn(),
}));

vi.mock("@privy-io/react-auth", () => ({
  PrivyProvider: ({
    children,
    config,
  }: {
    children: React.ReactNode;
    config: Record<string, unknown>;
  }) => {
    mocks.providerConfig = config;
    return children;
  },
}));

vi.mock("@privy-io/react-auth/solana", () => ({
  toSolanaWalletConnectors: mocks.toSolanaWalletConnectors,
}));

describe("PrivyProvider", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "test-privy-app");
    mocks.providerConfig = undefined;
    mocks.toSolanaWalletConnectors.mockReset().mockReturnValue([mocks.connector]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires explicit approval before reconnecting an external wallet", async () => {
    const { PrivyProvider } = await import("./PrivyProvider");

    render(
      <PrivyProvider>
        <span>App</span>
      </PrivyProvider>,
    );

    expect(screen.getByText("App")).toBeVisible();
    expect(mocks.toSolanaWalletConnectors).toHaveBeenCalledWith({
      shouldAutoConnect: false,
    });
    expect(mocks.providerConfig).toMatchObject({
      loginMethods: ["telegram", "google", "apple", "wallet"],
      externalWallets: {
        solana: { connectors: [mocks.connector] },
      },
    });
  });
});
