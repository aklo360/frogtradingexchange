import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FrogxAccountPanel } from "../FrogxAccountPanel";

const loginMock = vi.fn();
const logoutMock = vi.fn();
const linkTelegramMock = vi.fn();
const linkWalletMock = vi.fn();
const linkGoogleMock = vi.fn();
const createWalletMock = vi.fn();
const loginCallbacksMock = vi.hoisted(() => ({
  value: null as null | {
    onComplete?: () => void;
    onError?: (error: unknown) => void;
  },
}));
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
} | null = {
  id: "did:privy:test-user",
  linkedAccounts: [],
};
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
      linkTelegram: linkTelegramMock,
      linkGoogle: linkGoogleMock,
    };
  },
  useLogin: (callbacks: typeof loginCallbacksMock.value) => {
    loginCallbacksMock.value = callbacks;
    return {
      login: loginMock,
    };
  },
  usePrivy: () => ({
    authenticated: authenticatedMock,
    linkWallet: linkWalletMock,
    logout: logoutMock,
    ready: readyMock,
    user: userMock,
  }),
}));

vi.mock("@privy-io/react-auth/solana", () => ({
  useCreateWallet: () => ({
    createWallet: createWalletMock,
  }),
  useWallets: () => ({
    ready: walletsReadyMock,
    wallets: solanaWalletsMock,
  }),
}));

type TelegramTestWindow = Window & {
  Telegram?: {
    WebApp?: {
      initData?: string;
    };
  };
};

describe("FrogxAccountPanel", () => {
  beforeEach(() => {
    authenticatedMock = true;
    readyMock = true;
    walletsReadyMock = true;
    userMock = {
      id: "did:privy:test-user",
      linkedAccounts: [],
    };
    solanaWalletsMock = [
      {
        address: "Phantom111111111111111111111111111111111",
        standardWallet: {
          name: "Phantom",
        },
      },
    ];
    loginCallbacksMock.value = null;
    linkAccountCallbacksMock.value = null;
    loginMock.mockReset();
    logoutMock.mockReset();
    linkTelegramMock.mockReset();
    linkWalletMock.mockReset();
    linkGoogleMock.mockReset();
    createWalletMock.mockReset();
    createWalletMock.mockResolvedValue({
      wallet: {
        address: "Privy11111111111111111111111111111111111",
      },
    });
    delete (window as TelegramTestWindow).Telegram;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as TelegramTestWindow).Telegram;
  });

  it("uses FTX copy before login", () => {
    authenticatedMock = false;
    userMock = null;
    solanaWalletsMock = [];

    render(<FrogxAccountPanel />);

    expect(screen.getByRole("heading", { name: /ftx account/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /account login/i })).toBeInTheDocument();
    expect(
      screen.getByText(/log in with telegram, google, phantom, or metamask/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/if ribbot made your account first/i)).toBeInTheDocument();
    expect(screen.queryByText(/frogx/i)).not.toBeInTheDocument();
  });

  it("surfaces login errors from Privy", () => {
    authenticatedMock = false;
    userMock = null;
    solanaWalletsMock = [];

    render(<FrogxAccountPanel />);

    fireEvent.click(screen.getByRole("button", { name: /account login/i }));
    act(() => {
      loginCallbacksMock.value?.onError?.("telegram_oauth_error");
    });

    expect(loginMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/login failed: telegram_oauth_error/i)).toBeInTheDocument();
  });

  it("links Telegram with Mini App launch params when present", () => {
    (window as TelegramTestWindow).Telegram = {
      WebApp: {
        initData: "telegram-init-data",
      },
    };

    render(<FrogxAccountPanel />);

    const telegramMetric = screen.getByText("Telegram").closest("div");
    expect(telegramMetric).not.toBeNull();
    expect(
      within(telegramMetric as HTMLElement).getByText(
        /choose telegram first if ribbot already made your ftx account/i,
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      within(telegramMetric as HTMLElement).getByRole("button", { name: "Link" }),
    );

    expect(linkTelegramMock).toHaveBeenCalledWith({
      launchParams: {
        initDataRaw: "telegram-init-data",
      },
    });
  });

  it("surfaces Telegram link errors from Privy", () => {
    render(<FrogxAccountPanel />);

    const telegramMetric = screen.getByText("Telegram").closest("div");
    expect(telegramMetric).not.toBeNull();
    fireEvent.click(
      within(telegramMetric as HTMLElement).getByRole("button", { name: "Link" }),
    );

    act(() => {
      linkAccountCallbacksMock.value?.onError?.("oauth_domain_mismatch", {
        linkMethod: "telegram",
      });
    });

    expect(screen.getByText(/telegram link failed: oauth_domain_mismatch/i)).toBeInTheDocument();
  });

  it("creates an explicit embedded FTX wallet from profile", async () => {
    render(<FrogxAccountPanel />);

    fireEvent.click(screen.getByRole("button", { name: /create ftx wallet/i }));

    await waitFor(() => {
      expect(createWalletMock).toHaveBeenCalledWith({ createAdditional: false });
    });
    expect(await screen.findByText(/ftx wallet ready/i)).toBeInTheDocument();
    expect(screen.getByText("Priv...1111")).toBeInTheDocument();
  });

  it("shows an existing embedded wallet without another create button", () => {
    solanaWalletsMock = [
      {
        address: "Privy11111111111111111111111111111111111",
        standardWallet: {
          name: "Privy",
        },
      },
    ];

    render(<FrogxAccountPanel />);

    expect(screen.getByText("Priv...1111")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /create ftx wallet/i }),
    ).not.toBeInTheDocument();
  });

  it("times out wallet creation instead of leaving the button stuck", async () => {
    vi.useFakeTimers();
    createWalletMock.mockReturnValue(new Promise(() => undefined));

    render(<FrogxAccountPanel />);

    fireEvent.click(screen.getByRole("button", { name: /create ftx wallet/i }));
    expect(screen.getByRole("button", { name: /creating/i })).toBeDisabled();

    await act(async () => {
      vi.advanceTimersByTime(25_000);
    });

    expect(
      screen.getByRole("button", { name: /create ftx wallet/i }),
    ).not.toBeDisabled();
    expect(screen.getByText(/still pending in privy/i)).toBeInTheDocument();
  });
});
