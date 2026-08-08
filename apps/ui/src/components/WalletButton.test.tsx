import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WalletButton } from "./WalletButton";

const mocks = vi.hoisted(() => ({
  connected: false,
  disconnect: vi.fn(),
  connect: vi.fn(),
}));

vi.mock("@/providers/PublicWalletProvider", () => ({
  usePublicWallet: () => ({
    ready: true,
    connecting: false,
    disconnecting: false,
    connect: mocks.connect,
    disconnect: mocks.disconnect,
    wallet: mocks.connected
      ? {
          address: "9p9UcNW4QaAcw6pRAMFtaJHuNChL6dFFnbYzARTnJSWY",
          standardWallet: { name: "Phantom" },
        }
      : null,
  }),
}));

describe("WalletButton", () => {
  beforeEach(() => {
    mocks.connected = false;
    mocks.disconnect.mockReset().mockResolvedValue(undefined);
    mocks.connect.mockReset();
  });

  it("requests the guarded Privy connection when disconnected", () => {
    render(<WalletButton />);

    fireEvent.click(screen.getByRole("button", { name: "Connect Wallet" }));

    expect(mocks.connect).toHaveBeenCalledOnce();
  });

  it("disconnects the Privy-connected wallet when connected", async () => {
    mocks.connected = true;
    render(<WalletButton />);

    fireEvent.click(screen.getByRole("button"));

    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(mocks.connect).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "9p9U…JSWY" }),
      ).not.toBeDisabled(),
    );
  });
});
