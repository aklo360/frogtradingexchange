import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SystemProgram } from "@solana/web3.js";
import { afterEach, beforeEach, vi } from "vitest";
import { SwapCard } from "../SwapCard";

const walletPublicKey = SystemProgram.programId;
const loginMock = vi.fn();
const linkWalletMock = vi.fn();
const logoutMock = vi.fn();
const getBalanceMock = vi.fn().mockResolvedValue(1_500_000_000);
const createWalletMock = vi.fn();
const signTransactionMock = vi.fn(async ({ transaction }) => ({
  signedTransaction: transaction,
}));
const sendRawTransactionMock = vi.fn().mockResolvedValue("mock-signature");
const confirmTransactionMock = vi
  .fn()
  .mockResolvedValue({ value: { err: null } });
const getAddressLookupTableMock = vi
  .fn()
  .mockResolvedValue({ value: null });
const getLatestBlockhashMock = vi.fn().mockResolvedValue({
  blockhash: "AKnfknHkttp42Mpjj2D5GK3qH6zza1H9vTCNi783Wf8X",
  lastValidBlockHeight: 123456,
});
let solanaWalletsMock = [
  {
    address: walletPublicKey.toBase58(),
    standardWallet: {
      name: "Privy",
    },
  },
];
const serializedTransactionBase64 =
  "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAIAAAwCAAAAAQAAAAAAAAAA";
vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({
    authenticated: true,
    linkWallet: linkWalletMock,
    login: loginMock,
    logout: logoutMock,
  }),
}));

vi.mock("@privy-io/react-auth/solana", () => ({
  useCreateWallet: () => ({
    createWallet: createWalletMock,
  }),
  useSignTransaction: () => ({
    signTransaction: signTransactionMock,
  }),
  useWallets: () => ({
    wallets: solanaWalletsMock,
  }),
}));

vi.mock("@solana/wallet-adapter-react", () => ({
  useConnection: () => ({
    connection: {
      getBalance: getBalanceMock,
      confirmTransaction: confirmTransactionMock,
      getAddressLookupTable: getAddressLookupTableMock,
      getLatestBlockhash: getLatestBlockhashMock,
      sendRawTransaction: sendRawTransactionMock,
    },
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
    transactionBase64: serializedTransactionBase64,
    instructions: [],
    addressLookupTables: [],
    computeUnitsSafe: undefined,
  };
  const mockSwapBuild = {
    mode: "tx_base64",
    txBase64: serializedTransactionBase64,
    meta: {
      provider: "titan",
    },
  };
  const mockInstructionQuote = {
    ...mockQuote,
    transactionBase64: undefined,
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
        data: "AQ==",
      },
    ],
    addressLookupTables: [],
  };

  const setupFetch = (
    swapResponse: Response = Response.json(mockSwapBuild),
    quoteResponse: Response = Response.json(mockQuote),
  ) => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/frogx/swap")) {
        return Promise.resolve(swapResponse.clone());
      }
      return Promise.resolve(quoteResponse.clone());
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  beforeEach(() => {
    solanaWalletsMock = [
      {
        address: walletPublicKey.toBase58(),
        standardWallet: {
          name: "Privy",
        },
      },
    ];
    loginMock.mockReset();
    linkWalletMock.mockReset();
    logoutMock.mockReset();
    getBalanceMock.mockResolvedValue(1_500_000_000);
    createWalletMock.mockReset();
    signTransactionMock.mockClear();
    sendRawTransactionMock.mockReset();
    sendRawTransactionMock.mockResolvedValue("mock-signature");
    confirmTransactionMock.mockClear();
    getAddressLookupTableMock.mockClear();
    getLatestBlockhashMock.mockClear();
    setupFetch();
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
    await waitFor(() => expect(signTransactionMock).toHaveBeenCalled());
    expect(sendRawTransactionMock).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      "/api/frogx/swap",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(`"userPubkey":"${walletPublicKey.toBase58()}"`),
      }),
    );
  });

  it("uses a connected external Solana wallet without creating an embedded wallet", async () => {
    solanaWalletsMock = [
      {
        address: walletPublicKey.toBase58(),
        standardWallet: {
          name: "Phantom",
        },
      },
    ];

    render(<SwapCard />);

    const amountInput = screen.getByLabelText(/amount to pay/i);
    fireEvent.change(amountInput, { target: { value: "1" } });

    const swapButton = await screen.findByRole("button", { name: /^swap$/i });
    expect(
      screen.queryByRole("button", { name: /create embedded wallet/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(swapButton);

    await waitFor(() => expect(signTransactionMock).toHaveBeenCalled());
    expect(signTransactionMock.mock.calls[0][0].wallet.standardWallet.name).toBe(
      "Phantom",
    );
    expect(createWalletMock).not.toHaveBeenCalled();
    expect(sendRawTransactionMock).toHaveBeenCalled();
  });

  it("falls back to a fresh instruction quote when Titan REST swap build is unavailable", async () => {
    setupFetch(
      Response.json(
        { error: "Swap service temporarily unavailable" },
        { status: 502 },
      ),
      Response.json(mockInstructionQuote),
    );

    render(<SwapCard />);

    const amountInput = screen.getByLabelText(/amount to pay/i);
    fireEvent.change(amountInput, { target: { value: "1" } });

    const swapButton = await screen.findByRole("button", { name: /^swap$/i });
    fireEvent.click(swapButton);

    await waitFor(() => expect(signTransactionMock).toHaveBeenCalled());
    expect(getLatestBlockhashMock).toHaveBeenCalledWith("finalized");
    expect(sendRawTransactionMock).toHaveBeenCalled();
  });

  it("opens the Solana wallet link modal when authenticated without a connected wallet", () => {
    solanaWalletsMock = [];

    render(<SwapCard />);

    const connectButton = screen.getByRole("button", {
      name: /connect solana wallet/i,
    });
    fireEvent.click(connectButton);

    expect(linkWalletMock).toHaveBeenCalledWith({
      walletChainType: "solana-only",
      description: "Connect Phantom or another Solana wallet to swap.",
    });
    expect(createWalletMock).not.toHaveBeenCalled();
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

  it("shows a final swap-build error without asking the wallet to sign", async () => {
    setupFetch(
      Response.json(
        { error: "Swap execution requires Titan credentials" },
        { status: 503 },
      ),
    );

    render(<SwapCard />);

    const amountInput = screen.getByLabelText(/amount to pay/i);
    fireEvent.change(amountInput, { target: { value: "1" } });

    const swapButton = await screen.findByRole("button", { name: /^swap$/i });
    fireEvent.click(swapButton);

    expect(
      await screen.findByText(/swap execution requires titan credentials/i),
    ).toBeInTheDocument();
    expect(signTransactionMock).not.toHaveBeenCalled();
    expect(sendRawTransactionMock).not.toHaveBeenCalled();
  });
});
