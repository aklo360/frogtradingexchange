import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_PRIVY_APP_ID = "privy-app-test";
  process.env.NEXT_PUBLIC_PRIVY_BOT_SIGNER_ID = "signer-test";
  process.env.NEXT_PUBLIC_PRIVY_BOT_POLICY_IDS = "policy-a,policy-b";
  return {
    authenticated: true,
    user: {
      id: "did:privy:r1",
      telegram: { telegramUserId: "123456" },
      linkedAccounts: [
        {
          type: "wallet",
          address: "Wallet1111111111111111111111111111111111111",
        },
      ],
    } as {
      id: string;
      telegram?: { telegramUserId: string };
      linkedAccounts: Array<{ type: string; address?: string }>;
    } | null,
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    exportWallet: vi.fn(async () => undefined),
    addSigners: vi.fn(async () => ({ user: {} })),
    removeSigners: vi.fn(async () => ({ user: {} })),
  };
});

vi.mock("@privy-io/react-auth", () => ({
  PrivyProvider: ({ children }: { children: React.ReactNode }) => children,
  usePrivy: () => ({
    authenticated: mocks.authenticated,
    ready: true,
    user: mocks.user,
  }),
  useLoginWithTelegram: () => ({ login: mocks.login }),
  useLogout: () => ({ logout: mocks.logout }),
  useSigners: () => ({
    addSigners: mocks.addSigners,
    removeSigners: mocks.removeSigners,
  }),
}));

vi.mock("@privy-io/react-auth/solana", () => ({
  useWallets: () => ({
    ready: true,
    wallets: [{ address: "Wallet1111111111111111111111111111111111111" }],
  }),
  useExportWallet: () => ({ exportWallet: mocks.exportWallet }),
}));

import { PrivyWalletControls } from "./PrivyWalletControls";

const account = {
  telegramUserId: "123456",
  privyUserId: "did:privy:r1",
  solanaWalletAddress: "Wallet1111111111111111111111111111111111111",
};

describe("PrivyWalletControls", () => {
  beforeEach(() => {
    mocks.authenticated = true;
    mocks.user = {
      id: "did:privy:r1",
      telegram: { telegramUserId: "123456" },
      linkedAccounts: [
        {
          type: "wallet",
          address: "Wallet1111111111111111111111111111111111111",
        },
      ],
    };
    mocks.login.mockClear();
    mocks.logout.mockClear();
    mocks.exportWallet.mockClear();
    mocks.addSigners.mockClear();
    mocks.removeSigners.mockClear();
  });

  afterEach(() => cleanup());

  it("opens Telegram login when the user is signed out", async () => {
    mocks.authenticated = false;
    mocks.user = null;
    render(
      <PrivyWalletControls
        account={account}
        sessionActive
        onRecordAction={vi.fn(async () => true)}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Sign in with Telegram" }),
    );
    await waitFor(() => expect(mocks.login).toHaveBeenCalledOnce());
  });

  it("refuses wallet controls for a different Privy identity", () => {
    mocks.user = { ...mocks.user!, id: "did:privy:other" };
    render(
      <PrivyWalletControls
        account={account}
        sessionActive
        onRecordAction={vi.fn(async () => true)}
      />,
    );

    expect(screen.getByText("Account mismatch")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Export key" })).toBeNull();
  });

  it("exports only the exact managed wallet and records the flow in FTX", async () => {
    const onRecordAction = vi.fn(async () => true);
    render(
      <PrivyWalletControls
        account={account}
        sessionActive
        onRecordAction={onRecordAction}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Export key" }));
    await waitFor(() =>
      expect(mocks.exportWallet).toHaveBeenCalledWith({
        address: account.solanaWalletAddress,
      }),
    );
    expect(onRecordAction).toHaveBeenCalledWith("export");
  });

  it("requires confirmation before removing every app signer", async () => {
    const onRecordAction = vi.fn(async () => true);
    render(
      <PrivyWalletControls
        account={account}
        sessionActive
        onRecordAction={onRecordAction}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove app signers" }));
    expect(mocks.removeSigners).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));

    await waitFor(() =>
      expect(mocks.removeSigners).toHaveBeenCalledWith({
        address: account.solanaWalletAddress,
      }),
    );
    expect(onRecordAction).toHaveBeenCalledWith("revoke");
    expect(onRecordAction.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.removeSigners.mock.invocationCallOrder[0],
    );
  });

  it("does not remove Privy signers unless FTX pauses first", async () => {
    const onRecordAction = vi.fn(async () => false);
    render(
      <PrivyWalletControls
        account={account}
        sessionActive
        onRecordAction={onRecordAction}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove app signers" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));

    expect(
      await screen.findByText(
        "FTX could not pause bot access before signer removal.",
      ),
    ).toBeVisible();
    expect(mocks.removeSigners).not.toHaveBeenCalled();
  });

  it("restores the configured signer and policies before clearing FTX pause", async () => {
    const onRecordAction = vi.fn(async () => true);
    render(
      <PrivyWalletControls
        account={{ ...account, botAccessRevokedAt: "2026-07-10T00:00:00.000Z" }}
        sessionActive
        onRecordAction={onRecordAction}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Restore signer" }));
    await waitFor(() =>
      expect(mocks.addSigners).toHaveBeenCalledWith({
        address: account.solanaWalletAddress,
        signers: [
          {
            signerId: "signer-test",
            policyIds: ["policy-a", "policy-b"],
          },
        ],
      }),
    );
    expect(onRecordAction).toHaveBeenCalledWith("restore");
  });

  it("retries only the FTX sync after Privy signer restoration succeeds", async () => {
    const onRecordAction = vi
      .fn<(_: "claim" | "export" | "revoke" | "restore") => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    render(
      <PrivyWalletControls
        account={{
          ...account,
          botAccessRevokedAt: "2026-07-10T00:00:00.000Z",
        }}
        sessionActive
        onRecordAction={onRecordAction}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Restore signer" }));
    expect(
      await screen.findByRole("button", { name: "Sync FTX access" }),
    ).toBeVisible();
    expect(mocks.addSigners).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Sync FTX access" }));
    await waitFor(() => expect(onRecordAction).toHaveBeenCalledTimes(2));
    expect(mocks.addSigners).toHaveBeenCalledOnce();
  });
});
