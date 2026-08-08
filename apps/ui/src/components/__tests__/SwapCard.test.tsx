import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { afterEach, beforeEach, vi } from "vitest";
import { SwapCard } from "../SwapCard";

const walletPublicKey = new PublicKey(
  "JDtBD7EZKhd33QKFzqnrcH9UAYJu7dyF21gvLmG9BXrj",
);
const privyState = vi.hoisted(() => ({
  authenticated: true,
  walletActive: true,
  wallets: [] as Array<{
    address: string;
    standardWallet: { name: string };
    disconnect: ReturnType<typeof vi.fn>;
  }>,
}));
const transactionBase64 =
  "AXEOsAAbUdj9AR6V62sJC60M2ZV4WqRDb/ytM91hMH4ejjJ4W/8L3KGpgNh26MT+Znwoz13zbLmVANepmPG9GgaAAQAAAf/jgyn4pnrtMG3GqFpCK+pmL2cup/P2hdrrxjxNNRVsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
const disconnectMock = vi.fn();
const connectWalletMock = vi.fn();
const getBalanceMock = vi.fn().mockResolvedValue(1_500_000_000);
const signAndSendTransactionMock = vi.fn().mockResolvedValue({
  signature: new Uint8Array([1, 2, 3]),
});
const confirmTransactionMock = vi
  .fn()
  .mockResolvedValue({ value: { err: null } });
const getAddressLookupTableMock = vi
  .fn()
  .mockResolvedValue({ value: null });
const getLatestBlockhashMock = vi.fn().mockResolvedValue({
  blockhash: "11111111111111111111111111111111",
  lastValidBlockHeight: 123456,
});
const simulateTransactionMock = vi.fn().mockResolvedValue({
  context: { slot: 1 },
  value: { err: null, logs: [] },
});
vi.mock("@/providers/PublicWalletProvider", () => ({
  usePublicWallet: () => ({
    authenticated: privyState.authenticated,
    ready: true,
    connecting: false,
    disconnecting: false,
    connect: connectWalletMock,
    disconnect: disconnectMock,
    wallet: privyState.walletActive ? (privyState.wallets[0] ?? null) : null,
  }),
}));

vi.mock("@privy-io/react-auth/solana", () => ({
  useSignAndSendTransaction: () => ({
    signAndSendTransaction: signAndSendTransactionMock,
  }),
}));

vi.mock("@/providers/SolanaProvider", () => ({
  useSolanaConnection: () => ({
    getBalance: getBalanceMock,
    confirmTransaction: confirmTransactionMock,
    getAddressLookupTable: getAddressLookupTableMock,
    getLatestBlockhash: getLatestBlockhashMock,
    simulateTransaction: simulateTransactionMock,
  }),
}));

describe("SwapCard", () => {
  const mockQuote = {
    amountOut: "980000",
    priceImpactBps: 12,
    routers: [
      { id: "titan", name: "Titan Direct" },
      { id: "jup", name: "Jupiter" },
    ],
    executable: true,
    updatedAt: new Date().toISOString(),
    transactionBase64,
    instructions: [
      {
        programId: SystemProgram.programId.toBase58(),
        accounts: [
          {
            pubkey: walletPublicKey.toBase58(),
            isSigner: true,
            isWritable: true,
          },
        ],
        data: "",
      },
    ],
    addressLookupTables: [],
    computeUnitsSafe: undefined,
  };

  beforeEach(() => {
    privyState.authenticated = true;
    privyState.walletActive = true;
    privyState.wallets = [
      {
        address: walletPublicKey.toBase58(),
        standardWallet: { name: "Phantom" },
        disconnect: disconnectMock,
      },
    ];
    disconnectMock.mockReset();
    connectWalletMock.mockReset();
    getBalanceMock.mockResolvedValue(1_500_000_000);
    signAndSendTransactionMock.mockReset().mockResolvedValue({
      signature: new Uint8Array([1, 2, 3]),
    });
    confirmTransactionMock.mockClear();
    getAddressLookupTableMock.mockClear();
    getLatestBlockhashMock.mockClear();
    simulateTransactionMock.mockReset();
    simulateTransactionMock.mockResolvedValue({
      context: { slot: 1 },
      value: { err: null, logs: [] },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockQuote,
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the Privy wallet action enabled while signed out", () => {
    privyState.authenticated = false;
    privyState.walletActive = false;

    render(<SwapCard />);

    const connectButton = screen.getByRole("button", {
      name: "Connect Wallet / Sign in",
    });
    expect(connectButton).not.toBeDisabled();

    fireEvent.click(connectButton);

    expect(connectWalletMock).toHaveBeenCalledOnce();
  });

  it("shows only the wallet action after the Privy account is signed in", () => {
    privyState.authenticated = true;
    privyState.walletActive = false;

    render(<SwapCard />);

    const connectButton = screen.getByRole("button", {
      name: "Connect Wallet",
    });
    expect(
      screen.queryByRole("button", { name: "Connect Wallet / Sign in" }),
    ).not.toBeInTheDocument();

    fireEvent.click(connectButton);

    expect(connectWalletMock).toHaveBeenCalledOnce();
  });

  it("renders the swap layout with quote data once wallet is connected", async () => {
    render(<SwapCard />);

    expect(screen.getByText(/you pay/i)).toBeInTheDocument();
    expect(screen.getByText(/you receive/i)).toBeInTheDocument();

    const amountInput = screen.getByLabelText(/amount to pay/i);
    fireEvent.change(amountInput, { target: { value: "1" } });

    expect(await screen.findByText(/quote preview/i)).toBeInTheDocument();
    const swapButton = await screen.findByRole("button", { name: /^swap$/i });
    expect(swapButton).not.toBeDisabled();

    fireEvent.click(swapButton);
    await waitFor(() =>
      expect(signAndSendTransactionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction: expect.any(Uint8Array),
          wallet: expect.objectContaining({
            address: walletPublicKey.toBase58(),
          }),
          options: expect.objectContaining({
            skipPreflight: false,
          }),
        }),
      ),
    );
    expect(simulateTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        replaceRecentBlockhash: true,
        sigVerify: false,
      }),
    );
  });

  it("does not open the wallet when route simulation fails", async () => {
    simulateTransactionMock.mockResolvedValueOnce({
      context: { slot: 1 },
      value: {
        err: { InstructionError: [2, { Custom: 26 }] },
        logs: [
          "Program log: Error: Custom program error: 0x1a",
          "Program TAMM failed: custom program error: 0x1a",
        ],
      },
    });

    render(<SwapCard />);

    fireEvent.change(screen.getByLabelText(/amount to pay/i), {
      target: { value: "1" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /^swap$/i }),
    );

    expect(
      await screen.findByText(/swap route failed before signing/i),
    ).toBeInTheDocument();
    expect(signAndSendTransactionMock).not.toHaveBeenCalled();
  });

  it("shows an error when the confirmed transaction failed on-chain", async () => {
    confirmTransactionMock.mockResolvedValueOnce({
      value: { err: { InstructionError: [6, { Custom: 6006 }] } },
    });

    render(<SwapCard />);

    const amountInput = screen.getByLabelText(/amount to pay/i);
    fireEvent.change(amountInput, { target: { value: "1" } });

    const swapButton = await screen.findByRole("button", { name: /^swap$/i });
    fireEvent.click(swapButton);

    expect(
      await screen.findByText(/swap failed on-chain/i),
    ).toBeInTheDocument();
  });
});
