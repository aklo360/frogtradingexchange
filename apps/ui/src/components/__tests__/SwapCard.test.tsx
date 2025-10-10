import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SystemProgram } from "@solana/web3.js";
import { afterEach, beforeEach, vi } from "vitest";
import { SwapCard } from "../SwapCard";

const walletPublicKey = SystemProgram.programId;
const disconnectMock = vi.fn();
const getBalanceMock = vi.fn().mockResolvedValue(1_500_000_000);
const sendTransactionMock = vi.fn().mockResolvedValue("mock-signature");
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
vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({
    connected: true,
    publicKey: walletPublicKey,
    disconnect: disconnectMock,
    disconnecting: false,
    sendTransaction: sendTransactionMock,
  }),
  useConnection: () => ({
    connection: {
      getBalance: getBalanceMock,
      confirmTransaction: confirmTransactionMock,
      getAddressLookupTable: getAddressLookupTableMock,
      getLatestBlockhash: getLatestBlockhashMock,
    },
  }),
}));

vi.mock("@solana/wallet-adapter-react-ui", () => ({
  useWalletModal: () => ({
    setVisible: vi.fn(),
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
    disconnectMock.mockReset();
    getBalanceMock.mockResolvedValue(1_500_000_000);
    sendTransactionMock.mockReset();
    confirmTransactionMock.mockClear();
    getAddressLookupTableMock.mockClear();
    getLatestBlockhashMock.mockClear();
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
    await waitFor(() => expect(sendTransactionMock).toHaveBeenCalled());
  });
});
