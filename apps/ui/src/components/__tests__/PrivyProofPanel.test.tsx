import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrivyProofPanel } from "../PrivyProofPanel";

const loginMock = vi.fn();
const logoutMock = vi.fn();
const linkWalletMock = vi.fn();
const linkGoogleMock = vi.fn();
const linkTelegramMock = vi.fn();
const createWalletMock = vi.fn();
const signTransactionMock = vi.fn(async ({ transaction }) => ({
  signedTransaction: transaction,
}));
const getLatestBlockhashMock = vi.fn().mockResolvedValue({
  blockhash: "AKnfknHkttp42Mpjj2D5GK3qH6zza1H9vTCNi783Wf8X",
  lastValidBlockHeight: 123456,
});
const getBalanceMock = vi.fn().mockResolvedValue(12_000_000);
const sendRawTransactionMock = vi.fn().mockResolvedValue(
  "BuySig111111111111111111111111111111111111111111111111111111111",
);
const confirmTransactionMock = vi.fn().mockResolvedValue({
  value: {
    err: null,
  },
});
let searchParamsMock = new URLSearchParams();
const linkAccountCallbacksMock = vi.hoisted(() => ({
  value: null as null | {
    onSuccess?: () => void;
    onError?: (
      error: unknown,
      details: {
        linkMethod: string;
      },
    ) => void;
  },
}));

let authenticatedMock = true;
let readyMock = true;
let walletsReadyMock = true;
let userMock: {
  id: string;
  linkedAccounts: Array<Record<string, string>>;
} | null = null;
let solanaWalletsMock: Array<{
  address: string;
  standardWallet: {
    name: string;
  };
}> = [];

vi.mock("@privy-io/react-auth", () => ({
  useLinkAccount: (callbacks: typeof linkAccountCallbacksMock.value) => {
    linkAccountCallbacksMock.value = callbacks;
    return {
      linkGoogle: linkGoogleMock,
      linkTelegram: linkTelegramMock,
    };
  },
  usePrivy: () => ({
    authenticated: authenticatedMock,
    linkWallet: linkWalletMock,
    login: loginMock,
    logout: logoutMock,
    ready: readyMock,
    user: userMock,
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
    ready: walletsReadyMock,
    wallets: solanaWalletsMock,
  }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsMock,
}));

vi.mock("@solana/wallet-adapter-react", () => ({
  useConnection: () => ({
    connection: {
      confirmTransaction: confirmTransactionMock,
      getBalance: getBalanceMock,
      getLatestBlockhash: getLatestBlockhashMock,
      sendRawTransaction: sendRawTransactionMock,
    },
  }),
}));

type TelegramTestWindow = Window & {
  Telegram?: {
    WebApp?: {
      initData?: string;
    };
  };
};

const phantomAddress = "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf";

const setAuthenticatedReadyState = () => {
  authenticatedMock = true;
  readyMock = true;
  walletsReadyMock = true;
  userMock = {
    id: "did:privy:test-user",
    linkedAccounts: [
      {
        type: "google_oauth",
        email: "frog@example.com",
      },
      {
        type: "telegram",
        username: "frogtester",
      },
    ],
  };
  solanaWalletsMock = [
    {
      address: phantomAddress,
      standardWallet: {
        name: "Phantom",
      },
    },
    {
      address: "Privy11111111111111111111111111111111111",
      standardWallet: {
        name: "Privy",
      },
    },
  ];
};

describe("PrivyProofPanel", () => {
  beforeEach(() => {
    authenticatedMock = false;
    readyMock = true;
    walletsReadyMock = true;
    userMock = null;
    solanaWalletsMock = [];
    loginMock.mockReset();
    logoutMock.mockReset();
    linkWalletMock.mockReset();
    linkGoogleMock.mockReset();
    linkTelegramMock.mockReset();
    createWalletMock.mockReset();
    createWalletMock.mockResolvedValue({
      wallet: {
        address: "Privy11111111111111111111111111111111111",
      },
    });
    signTransactionMock.mockClear();
    getBalanceMock.mockClear();
    getLatestBlockhashMock.mockClear();
    sendRawTransactionMock.mockClear();
    confirmTransactionMock.mockClear();
    searchParamsMock = new URLSearchParams();
    vi.unstubAllGlobals();
    delete (window as TelegramTestWindow).Telegram;
  });

  it("opens account login before an authenticated session exists", () => {
    render(<PrivyProofPanel />);

    expect(
      screen.getByText((_, node) => node?.textContent === "Final state: not ready"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /account login/i }));

    expect(loginMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Not logged in")).toBeInTheDocument();
  });

  it("links Telegram with Mini App launch params", () => {
    authenticatedMock = true;
    userMock = {
      id: "did:privy:test-user",
      linkedAccounts: [],
    };
    (window as TelegramTestWindow).Telegram = {
      WebApp: {
        initData: "telegram-init-data",
      },
    };

    render(<PrivyProofPanel />);

    fireEvent.click(screen.getByRole("button", { name: /link telegram/i }));

    expect(linkTelegramMock).toHaveBeenCalledWith({
      launchParams: {
        initDataRaw: "telegram-init-data",
      },
    });
  });

  it("shows Telegram buy-floor intent details from the DM link", () => {
    searchParamsMock = new URLSearchParams({
      intent: "550e8400-e29b-41d4-a716-446655440000",
      action: "buy-floor",
      qty: "10",
      mint: "128U4K9Si6YzrfEXResFNQvC6zyi7MJ872EP97TD9tYs",
      estSol: "0.320078",
    });

    render(<PrivyProofPanel />);

    expect(screen.getByRole("heading", { name: /telegram intent/i })).toBeInTheDocument();
    expect(screen.getByText("buy-floor")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("0.320078 SOL before fees")).toBeInTheDocument();
    expect(screen.getByText(/builds fresh Magic Eden buy transactions/i)).toBeInTheDocument();
  });

  it("proves live API readiness and transaction signing without sending", async () => {
    setAuthenticatedReadyState();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/frogx/account/config")) {
        return Promise.resolve(
          Response.json({
            accountModeEnabled: true,
            privy: {
              configured: true,
              jwksConfigured: true,
              externalWalletsVerificationOnly: true,
            },
            bot: {
              tradingEnabled: false,
              executionEnabled: false,
            },
            safety: {
              ribbotHoldsPrivateKeys: false,
              linkedExternalWalletsTradeableByBot: false,
              liveExecutionRequiresPrivySignerPolicies: true,
            },
          }),
        );
      }
      if (url.includes("/api/frogx/nfts/floor")) {
        return Promise.resolve(
          Response.json({
            floorLamports: "32000000",
            floorSol: 0.032,
            lowestListing: {
              mint: "frog",
            },
            purchase: {
              userWalletExecutionEnabled: true,
            },
          }),
        );
      }
      return Promise.resolve(
        Response.json({
          executable: true,
          amountOut: "123456789",
          instructions: [
            {
              programId: SystemProgram.programId.toBase58(),
            },
          ],
          addressLookupTables: ["lookup"],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PrivyProofPanel />);

    const activeWallet = screen.getByText("Active Solana wallet").closest("article");
    expect(activeWallet).not.toBeNull();
    expect(within(activeWallet as HTMLElement).getByText(/phantom/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /run api probe/i }));
    await waitFor(() => {
      expect(screen.getAllByText(/quote executable/i).length).toBeGreaterThan(0);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/frogx/quotes",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(`"userPublicKey":"${phantomAddress}"`),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /sign tx proof/i }));
    await waitFor(() => expect(signTransactionMock).toHaveBeenCalled());
    expect(getLatestBlockhashMock).toHaveBeenCalledWith("finalized");
    expect(signTransactionMock.mock.calls[0][0].wallet.standardWallet.name).toBe(
      "Phantom",
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("sendRawTransaction"),
      expect.anything(),
    );

    fireEvent.click(screen.getByRole("button", { name: /check balance/i }));
    await waitFor(() => {
      expect(screen.getAllByText(/SOL available for network fees/i).length).toBeGreaterThan(
        0,
      );
    });
    expect(getBalanceMock).toHaveBeenCalledWith(
      new PublicKey(phantomAddress),
      "processed",
    );
    expect(
      screen.getByText(
        (_, node) =>
          node?.textContent === "Final state: ready for a funded swap test",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open swap/i })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("builds, signs, and submits Telegram NFT buy transactions from the connected wallet", async () => {
    setAuthenticatedReadyState();
    searchParamsMock = new URLSearchParams({
      intent: "550e8400-e29b-41d4-a716-446655440000",
      action: "buy-floor",
      qty: "2",
      mint: "128U4K9Si6YzrfEXResFNQvC6zyi7MJ872EP97TD9tYs",
      estSol: "0.064000",
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/frogx/nfts/buy-floor")) {
        return Promise.resolve(
          Response.json({
            quantity: 2,
            estimatedTotalSol: 0.064,
            transactions: [
              {
                tokenMint: "So11111111111111111111111111111111111111112",
                priceLamports: "32000000",
                priceSol: 0.032,
                transactionBase64: "AQID",
              },
              {
                tokenMint: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                priceLamports: "32000000",
                priceSol: 0.032,
                transactionBase64: "BAUG",
              },
            ],
          }),
        );
      }
      return Promise.resolve(Response.json({ ok: true }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PrivyProofPanel />);

    fireEvent.click(screen.getByRole("button", { name: /build buy tx/i }));
    await waitFor(() => {
      expect(screen.getAllByText(/Built 2 buy txs/i).length).toBeGreaterThan(0);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/frogx/nfts/buy-floor",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(`"buyer":"${phantomAddress}"`),
      }),
    );
    expect(fetchMock.mock.calls[0][1]?.body).toEqual(
      expect.stringContaining('"quantity":2'),
    );

    fireEvent.click(screen.getByRole("button", { name: /sign & send sweep/i }));
    await waitFor(() => expect(sendRawTransactionMock).toHaveBeenCalledTimes(2));
    expect(signTransactionMock).toHaveBeenCalledTimes(2);
    expect(confirmTransactionMock).toHaveBeenCalledWith(
      "BuySig111111111111111111111111111111111111111111111111111111111",
      "confirmed",
    );
    expect(screen.getAllByText(/Sent 2 buy txs/i).length).toBeGreaterThan(0);
  });
});
