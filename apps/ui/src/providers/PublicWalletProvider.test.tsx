import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PublicWalletProvider,
  usePublicWallet,
} from "./PublicWalletProvider";

const address = "9p9UcNW4QaAcw6pRAMFtaJHuNChL6dFFnbYzARTnJSWY";
const spotAddress = "11111111111111111111111111111111";
const perpsAddress = "So11111111111111111111111111111111111111112";

const mocks = vi.hoisted(() => ({
  authenticated: false,
  linkedAccounts: [] as Array<Record<string, unknown>>,
  modalOpen: false,
  createWallet: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  loginComplete:
    undefined as
      | ((params: {
          loginMethod: string | null;
          user: object;
          isNewUser: boolean;
          wasAlreadyAuthenticated: boolean;
          loginAccount: null;
        }) => void)
      | undefined,
  wallets: [] as Array<{
    address: string;
    disconnect: ReturnType<typeof vi.fn>;
    standardWallet: { name: string };
  }>,
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({
    ready: true,
    authenticated: mocks.authenticated,
    user: mocks.authenticated
      ? { linkedAccounts: mocks.linkedAccounts }
      : null,
    logout: mocks.logout,
  }),
  useModalStatus: () => ({ isOpen: mocks.modalOpen }),
  useLogin: (callbacks?: {
    onComplete?: (params: {
      loginMethod: string | null;
      user: object;
      isNewUser: boolean;
      wasAlreadyAuthenticated: boolean;
      loginAccount: null;
    }) => void;
  }) => {
    mocks.loginComplete = callbacks?.onComplete;
    return { login: mocks.login };
  },
}));

vi.mock("@privy-io/react-auth/solana", () => ({
  useCreateWallet: () => ({ createWallet: mocks.createWallet }),
  useWallets: () => ({
    ready: true,
    wallets: mocks.wallets,
  }),
}));

const Probe = () => {
  const { wallet, connect } = usePublicWallet();

  return (
    <>
      <span data-testid="wallet">{wallet?.address ?? "none"}</span>
      <button type="button" onClick={connect}>
        Connect
      </button>
    </>
  );
};

const renderProvider = () =>
  render(
    <PublicWalletProvider>
      <Probe />
    </PublicWalletProvider>,
  );

const completeLogin = (loginMethod: string) => {
  mocks.loginComplete?.({
    loginMethod,
    user: {},
    isNewUser: false,
    wasAlreadyAuthenticated: false,
    loginAccount: null,
  });
};

describe("PublicWalletProvider", () => {
  beforeEach(() => {
    mocks.authenticated = false;
    mocks.linkedAccounts = [];
    mocks.modalOpen = false;
    mocks.createWallet.mockReset();
    mocks.createWallet.mockResolvedValue({ wallet: { address: spotAddress } });
    mocks.login.mockReset();
    mocks.logout.mockReset();
    mocks.loginComplete = undefined;
    mocks.wallets = [
      {
        address,
        disconnect: vi.fn().mockResolvedValue(undefined),
        standardWallet: { name: "Phantom" },
      },
    ];
  });

  it("ignores a discovered extension wallet while Privy is signed out", () => {
    renderProvider();

    expect(screen.getByTestId("wallet")).toHaveTextContent("none");
  });

  it("creates Wallet 1 instead of activating an external wallet", async () => {
    mocks.authenticated = true;
    renderProvider();

    expect(screen.getByTestId("wallet")).toHaveTextContent("none");

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(mocks.createWallet).toHaveBeenCalledOnce());
    expect(screen.getByTestId("wallet")).toHaveTextContent("none");
  });

  it("automatically selects the authenticated Privy spot wallet", () => {
    mocks.authenticated = true;
    mocks.linkedAccounts = [
      {
        type: "wallet",
        chainType: "solana",
        walletClientType: "privy-v2",
        walletIndex: 1,
        address: perpsAddress,
      },
      {
        type: "wallet",
        chainType: "solana",
        walletClientType: "privy",
        walletIndex: 0,
        address: spotAddress,
      },
    ];
    mocks.wallets = [
      ...mocks.wallets,
      {
        address: perpsAddress,
        disconnect: vi.fn().mockResolvedValue(undefined),
        standardWallet: { name: "Privy" },
      },
      {
        address: spotAddress,
        disconnect: vi.fn().mockResolvedValue(undefined),
        standardWallet: { name: "Privy" },
      },
    ];

    renderProvider();

    expect(screen.getByTestId("wallet")).toHaveTextContent(spotAddress);
  });

  it("does not activate a discovered wallet after non-wallet login", () => {
    const view = renderProvider();
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(mocks.login).toHaveBeenCalledWith({
      loginMethods: ["telegram", "google", "apple", "wallet"],
    });

    act(() => {
      completeLogin("telegram");
      mocks.authenticated = true;
    });
    view.rerender(
      <PublicWalletProvider>
        <Probe />
      </PublicWalletProvider>,
    );

    expect(screen.getByTestId("wallet")).toHaveTextContent("none");
  });

  it("does not use an external wallet for execution after wallet login", () => {
    const view = renderProvider();
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    act(() => {
      completeLogin("siws");
      mocks.authenticated = true;
    });
    view.rerender(
      <PublicWalletProvider>
        <Probe />
      </PublicWalletProvider>,
    );

    expect(screen.getByTestId("wallet")).toHaveTextContent("none");
  });
});
