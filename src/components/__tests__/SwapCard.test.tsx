import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { SwapCard } from "../SwapCard";

const disconnectMock = vi.fn();
const getBalanceMock = vi.fn().mockResolvedValue(1_500_000_000);
vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({
    connected: true,
    publicKey: { toBase58: () => "mock-public-key" },
    disconnect: disconnectMock,
    disconnecting: false,
  }),
  useConnection: () => ({
    connection: {
      getBalance: getBalanceMock,
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
  };

  beforeEach(() => {
    disconnectMock.mockReset();
    getBalanceMock.mockResolvedValue(1_500_000_000);
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

    expect(
      screen.getByRole("heading", { name: /frog trading exchange/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/you pay/i)).toBeInTheDocument();
    expect(screen.getByText(/you receive/i)).toBeInTheDocument();

    expect(await screen.findByText(/quote preview/i)).toBeInTheDocument();
  });
});
