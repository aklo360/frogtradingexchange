"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { Ticker } from "@/components/Ticker";
import { WalletButton } from "@/components/WalletButton";
import homeStyles from "../page.module.css";
import { PrivyWalletControls } from "./PrivyWalletControls";
import styles from "./ribbot.module.css";

type TradingAccountSettings = {
  slippageBps: number;
  priorityFee: number;
  sellPriorityFee: number;
  defaultBuyAmountIn: string;
  buyPresetAmountsIn: string[];
  sellPresetBps: number[];
  botMode: "simple" | "advanced";
  confirmTrades: boolean;
  sellProtection: boolean;
  autoBuyEnabled: boolean;
  instantAutoBuyEnabled: boolean;
  instantAutoBuyAmountIn: string;
  instantAutoBuyMinLiquidityUsd: number;
  instantAutoBuyMaxMarketCapUsd?: number;
  autoSellEnabled: boolean;
  sniperEnabled: boolean;
  mevProtection: boolean;
};

type TradingAccountSnapshot = {
  telegramUserId: string;
  username?: string;
  walletSource?: "privy" | "external";
  privyUserId?: string;
  privyWalletId?: string;
  solanaWalletAddress?: string;
  walletClaimRequestedAt?: string;
  walletExportRequestedAt?: string;
  botAccessRevokedAt?: string;
  settings: TradingAccountSettings;
  watchlist: string[];
  hiddenTokens: string[];
  createdAt: string;
  updatedAt: string;
};

type ControlSessionResponse = {
  status?: "ready" | "not_configured";
  account?: TradingAccountSnapshot;
  sessionToken?: string;
  sessionExpiresAt?: string;
  required?: string[];
  error?: string;
};

type PreferenceResponse = {
  status?: "accepted" | "not_configured";
  account?: TradingAccountSnapshot;
  warnings?: string[];
  required?: string[];
  error?: string;
};

type WalletAction = "claim" | "export" | "revoke" | "restore";

type WalletActionResponse = {
  status?:
    | "claim_requested"
    | "export_requested"
    | "revoked"
    | "restored"
    | "not_configured";
  action?: WalletAction;
  account?: TradingAccountSnapshot;
  walletAddress?: string | null;
  claimUrl?: string | null;
  warnings?: string[];
  required?: string[];
  error?: string;
};

const solMint = "So11111111111111111111111111111111111111112";
const solanaAddressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const defaultBuyPresets = ["0.1", "0.25", "0.5", "1"];
const defaultSellPresets = ["25", "50", "75", "100"];

const shortAddress = (value?: string) =>
  value && value.length > 10
    ? `${value.slice(0, 4)}...${value.slice(-4)}`
    : value || "none";

const formatDateTime = (value?: string) =>
  value ? new Date(value).toLocaleString() : "Not recorded";

const lamportsToSol = (value: string) => {
  const lamports = Number(value);
  if (!Number.isFinite(lamports)) return "0";
  return (lamports / 1_000_000_000).toString();
};

const solToLamports = (value: string) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return Math.round(amount * 1_000_000_000).toString();
};

const presetFields = (values: string[], defaults: string[]) => {
  const normalized = values.slice(0, 4);
  while (normalized.length < 4) normalized.push("");
  return normalized.some(Boolean) ? normalized : defaults;
};

const normalizeControlCode = (value: string) =>
  value
    .toUpperCase()
    .replace(/[\s-]+/g, "")
    .slice(0, 12);

export default function RibbotControlPage() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [telegramUserId, setTelegramUserId] = useState("");
  const [code, setCode] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [sessionExpiresAt, setSessionExpiresAt] = useState("");
  const [account, setAccount] = useState<TradingAccountSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");
  const [walletActionSaving, setWalletActionSaving] =
    useState<WalletAction | null>(null);
  const [confirmPause, setConfirmPause] = useState(false);
  const [slippagePercent, setSlippagePercent] = useState("5");
  const [priorityFee, setPriorityFee] = useState("0");
  const [sellPriorityFee, setSellPriorityFee] = useState("0");
  const [defaultBuySol, setDefaultBuySol] = useState("0.1");
  const [buyPresetsSol, setBuyPresetsSol] =
    useState<string[]>(defaultBuyPresets);
  const [sellPresetsPercent, setSellPresetsPercent] =
    useState<string[]>(defaultSellPresets);
  const [botMode, setBotMode] = useState<"simple" | "advanced">("advanced");
  const [confirmTrades, setConfirmTrades] = useState(true);
  const [sellProtection, setSellProtection] = useState(true);
  const [mevProtection, setMevProtection] = useState(true);
  const [autoBuyEnabled, setAutoBuyEnabled] = useState(false);
  const [instantAutoBuyEnabled, setInstantAutoBuyEnabled] = useState(false);
  const [instantAutoBuySol, setInstantAutoBuySol] = useState("0.1");
  const [instantAutoBuyMinLiquidityUsd, setInstantAutoBuyMinLiquidityUsd] =
    useState("1000");
  const [instantAutoBuyMaxMarketCapUsd, setInstantAutoBuyMaxMarketCapUsd] =
    useState("");
  const [autoSellEnabled, setAutoSellEnabled] = useState(false);
  const [sniperEnabled, setSniperEnabled] = useState(false);
  const [watchMint, setWatchMint] = useState("");
  const [hiddenMint, setHiddenMint] = useState("");

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const telegramId = params.get("telegramUserId");
    const rawCode = params.get("code");
    if (telegramId) setTelegramUserId(telegramId);
    if (rawCode) setCode(normalizeControlCode(rawCode));
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!account) return;
    setSlippagePercent((account.settings.slippageBps / 100).toString());
    setPriorityFee(account.settings.priorityFee.toString());
    setSellPriorityFee(account.settings.sellPriorityFee.toString());
    setDefaultBuySol(lamportsToSol(account.settings.defaultBuyAmountIn));
    setBuyPresetsSol(
      presetFields(
        account.settings.buyPresetAmountsIn.map(lamportsToSol),
        defaultBuyPresets,
      ),
    );
    setSellPresetsPercent(
      presetFields(
        account.settings.sellPresetBps.map((value) => (value / 100).toString()),
        defaultSellPresets,
      ),
    );
    setBotMode(account.settings.botMode);
    setConfirmTrades(account.settings.confirmTrades);
    setSellProtection(account.settings.sellProtection);
    setMevProtection(account.settings.mevProtection);
    setAutoBuyEnabled(account.settings.autoBuyEnabled);
    setInstantAutoBuyEnabled(account.settings.instantAutoBuyEnabled);
    setInstantAutoBuySol(
      lamportsToSol(account.settings.instantAutoBuyAmountIn),
    );
    setInstantAutoBuyMinLiquidityUsd(
      account.settings.instantAutoBuyMinLiquidityUsd.toString(),
    );
    setInstantAutoBuyMaxMarketCapUsd(
      account.settings.instantAutoBuyMaxMarketCapUsd?.toString() ?? "",
    );
    setAutoSellEnabled(account.settings.autoSellEnabled);
    setSniperEnabled(account.settings.sniperEnabled);
  }, [account]);

  const sessionActive = useMemo(() => {
    if (!sessionToken || !sessionExpiresAt) return false;
    return new Date(sessionExpiresAt).getTime() > Date.now();
  }, [sessionExpiresAt, sessionToken]);

  const exchangeCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setStatusText("");
    setLoading(true);

    try {
      const response = await fetch("/api/frogx/trading-bot/control/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramUserId: telegramUserId.trim(),
          code: normalizeControlCode(code),
        }),
      });
      const data = (await response.json()) as ControlSessionResponse;
      if (!response.ok || data.error || data.status === "not_configured") {
        throw new Error(
          data.error ??
            `Missing: ${(data.required ?? []).join(", ") || "FTX account storage"}`,
        );
      }
      if (!data.account || !data.sessionToken || !data.sessionExpiresAt) {
        throw new Error("FTX did not return a control session.");
      }
      setAccount(data.account);
      setSessionToken(data.sessionToken);
      setSessionExpiresAt(data.sessionExpiresAt);
      setCode("");
      setStatusText("Control session opened.");
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Control code exchange failed.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const defaultBuyAmountIn = solToLamports(defaultBuySol);
    const instantAutoBuyAmountIn = solToLamports(instantAutoBuySol);
    const instantMinLiquidity = Number(instantAutoBuyMinLiquidityUsd);
    const instantMaxMarketCap = instantAutoBuyMaxMarketCapUsd.trim()
      ? Number(instantAutoBuyMaxMarketCapUsd)
      : undefined;
    const slippageBps = Math.round(Number(slippagePercent) * 100);
    const priority = Number(priorityFee);
    const sellPriority = Number(sellPriorityFee);
    const buyPresetAmountsIn = buyPresetsSol
      .map((value) => value.trim())
      .filter(Boolean)
      .map(solToLamports);
    const sellPresetBps = sellPresetsPercent
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => Math.round(Number(value) * 100));
    if (
      !defaultBuyAmountIn ||
      !Number.isInteger(slippageBps) ||
      slippageBps < 0
    ) {
      setError("Settings are invalid.");
      return;
    }
    if (
      !instantAutoBuyAmountIn ||
      !Number.isFinite(instantMinLiquidity) ||
      instantMinLiquidity <= 0 ||
      (instantMaxMarketCap !== undefined &&
        (!Number.isFinite(instantMaxMarketCap) || instantMaxMarketCap <= 0))
    ) {
      setError("Instant Auto Buy limits are invalid.");
      return;
    }
    if (
      !Number.isInteger(priority) ||
      priority < 0 ||
      !Number.isInteger(sellPriority) ||
      sellPriority < 0
    ) {
      setError("Priority fee is invalid.");
      return;
    }
    if (
      buyPresetAmountsIn.length < 2 ||
      buyPresetAmountsIn.length > 4 ||
      buyPresetAmountsIn.some((value) => !value) ||
      new Set(buyPresetAmountsIn).size !== buyPresetAmountsIn.length
    ) {
      setError("Enter two to four unique positive buy presets.");
      return;
    }
    if (
      sellPresetBps.length < 2 ||
      sellPresetBps.length > 4 ||
      sellPresetBps.some(
        (value) => !Number.isInteger(value) || value <= 0 || value > 10_000,
      ) ||
      new Set(sellPresetBps).size !== sellPresetBps.length
    ) {
      setError("Enter two to four unique sell presets above 0% through 100%.");
      return;
    }
    await updatePreference({
      kind: "settings",
      action: "set",
      slippageBps,
      priorityFee: priority,
      sellPriorityFee: sellPriority,
      defaultBuyAmountIn,
      buyPresetAmountsIn,
      sellPresetBps,
      botMode,
      confirmTrades: botMode === "simple" ? false : confirmTrades,
      sellProtection,
      mevProtection,
      autoBuyEnabled,
      instantAutoBuyEnabled,
      instantAutoBuyAmountIn,
      instantAutoBuyMinLiquidityUsd: instantMinLiquidity,
      instantAutoBuyMaxMarketCapUsd: instantMaxMarketCap,
      autoSellEnabled,
      sniperEnabled,
    });
  };

  const updateTokenList = async (
    kind: "watchlist" | "hiddenToken",
    action: "add" | "remove",
    mint: string,
  ) => {
    if (!solanaAddressPattern.test(mint) || mint === solMint) {
      setError("Enter an SPL token mint.");
      return;
    }
    await updatePreference({
      kind,
      action,
      mint,
      priorityFee: Number(priorityFee) || 0,
    });
    if (kind === "watchlist") setWatchMint("");
    if (kind === "hiddenToken") setHiddenMint("");
  };

  const updatePreference = async (body: Record<string, unknown>) => {
    if (!account || !sessionActive) {
      setError("Open a fresh control session.");
      return;
    }
    setError("");
    setStatusText("");
    setSaving(true);
    try {
      const response = await fetch(
        "/api/frogx/trading-bot/control/preferences",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            telegramUserId: account.telegramUserId,
            sessionToken,
            userPublicKey: account.solanaWalletAddress,
            ...body,
          }),
        },
      );
      const data = (await response.json()) as PreferenceResponse;
      if (!response.ok || data.error || data.status === "not_configured") {
        throw new Error(
          data.error ??
            `Missing: ${(data.required ?? []).join(", ") || "FTX account storage"}`,
        );
      }
      if (!data.account) throw new Error("FTX did not return account state.");
      setAccount(data.account);
      setStatusText(data.warnings?.[0] ?? "Account updated.");
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "FTX could not update account state.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const runWalletAction = async (action: WalletAction): Promise<boolean> => {
    if (!account || !sessionActive) {
      setError("Open a fresh control session.");
      return false;
    }
    if (account.walletSource !== "privy") {
      setError("Wallet actions require an FTX/FrogX-managed Privy wallet.");
      return false;
    }
    setError("");
    setStatusText("");
    setWalletActionSaving(action);
    try {
      const response = await fetch("/api/frogx/trading-bot/control/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramUserId: account.telegramUserId,
          sessionToken,
          userPublicKey: account.solanaWalletAddress,
          action,
        }),
      });
      const data = (await response.json()) as WalletActionResponse;
      if (!response.ok || data.error || data.status === "not_configured") {
        throw new Error(
          data.error ??
            `Missing: ${(data.required ?? []).join(", ") || "FTX account storage"}`,
        );
      }
      if (!data.account) throw new Error("FTX did not return account state.");
      setAccount(data.account);
      if (action === "revoke") setConfirmPause(false);
      setStatusText(
        data.warnings?.join(" ") ??
          (action === "restore"
            ? "Bot access restored."
            : action === "revoke"
              ? "Bot access paused."
              : "Wallet action recorded."),
      );
      return true;
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "FTX could not update wallet controls.";
      setError(message);
      return false;
    } finally {
      setWalletActionSaving(null);
    }
  };

  return (
    <main className={`${homeStyles.main} ${styles.page}`}>
      <header className={homeStyles.headerBar}>
        <div className={homeStyles.headerInner}>
          <button
            type="button"
            className={`${homeStyles.brandGroup} ${homeStyles.brandHomeButton}`}
            onClick={() => {
              closeMenu();
              router.push("/");
            }}
            aria-label="Go to swap home"
          >
            <div className={homeStyles.brandRow}>
              <video
                src="/sticker/excited.webm"
                className={`${homeStyles.headerSticker} ${homeStyles.headerStickerLarge}`}
                autoPlay
                loop
                muted
                playsInline
                aria-hidden="true"
              />
              <h1>
                <span className={homeStyles.srOnly}>Frog Trading Exchange</span>
                <img
                  src="/logo.png"
                  alt="Frog Trading Exchange"
                  className={homeStyles.brandLogo}
                  loading="lazy"
                />
              </h1>
              <video
                src="/sticker/wink.webm"
                className={`${homeStyles.headerSticker} ${homeStyles.headerStickerLarge}`}
                autoPlay
                loop
                muted
                playsInline
                aria-hidden="true"
              />
            </div>
            <p className={homeStyles.tagline}>
              Powered by Titan for the best prices on Solana
            </p>
          </button>
        </div>
        <div className={homeStyles.rightControls}>
          <button
            type="button"
            className={homeStyles.menuButton}
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className={homeStyles.menuButtonBars} aria-hidden="true" />
          </button>
        </div>
        <div
          className={`${homeStyles.menuSheet} ${menuOpen ? homeStyles.menuSheetOpen : ""}`}
          aria-hidden={!menuOpen}
        >
          <nav aria-label="Main navigation" className={homeStyles.menuList}>
            <div className={homeStyles.menuWalletWrapper} onClick={closeMenu}>
              <WalletButton className={homeStyles.menuWallet} />
            </div>
            {[
              ["/", "/swap.svg", "SWAP"],
              ["/perps", "/sparkle.svg", "PERPS"],
              ["/ribbot", "/chat.svg", "RIBBOT"],
              ["/profile", "/bank.svg", "PROFILE"],
              ["/leaderboard", "/trophy.svg", "LEADERBOARD"],
              ["/airdrop", "/sparkle.svg", "AIRDROP"],
            ].map(([href, icon, label]) => (
              <button
                key={href}
                type="button"
                className={homeStyles.menuItem}
                aria-current={href === "/ribbot" ? "page" : undefined}
                onClick={() => {
                  closeMenu();
                  router.push(href);
                }}
              >
                <img src={icon} alt="" className={homeStyles.menuIcon} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>
        {menuOpen ? (
          <button
            type="button"
            className={homeStyles.menuBackdrop}
            aria-hidden="true"
            onClick={closeMenu}
          />
        ) : null}
      </header>
      <Ticker />

      <section className={styles.shell} aria-labelledby="ribbot-title">
        <header className={styles.workspaceHeader}>
          <div className={styles.titleBlock}>
            <span className={styles.eyebrow}>FTX / Telegram</span>
            <h2 id="ribbot-title">Ribbot Control</h2>
          </div>
          <div
            className={styles.sessionStatus}
            data-active={sessionActive ? "true" : "false"}
          >
            <span className={styles.statusDot} aria-hidden="true" />
            <div>
              <span>Session</span>
              <strong>{sessionActive ? "Active" : "Not connected"}</strong>
            </div>
          </div>
        </header>

        <section className={styles.accessBand} aria-label="Control session">
          <div className={styles.accessHeading}>
            <span>Secure session</span>
            <strong>Telegram access</strong>
          </div>
          <form className={styles.codeForm} onSubmit={exchangeCode}>
            <label>
              <span>Telegram ID</span>
              <input
                inputMode="numeric"
                value={telegramUserId}
                onChange={(event) => setTelegramUserId(event.target.value)}
                placeholder="123456789"
                disabled={loading}
              />
            </label>
            <label>
              <span>Control code</span>
              <input
                value={code}
                onChange={(event) =>
                  setCode(normalizeControlCode(event.target.value))
                }
                placeholder="ABCDEFGH2345"
                disabled={loading}
              />
            </label>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={loading}
            >
              {loading ? "Opening" : "Open session"}
            </button>
          </form>
        </section>

        {error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : null}
        {statusText ? (
          <div className={styles.status} role="status">
            {statusText}
          </div>
        ) : null}

        {account ? (
          <>
            <dl className={styles.summaryGrid} aria-label="Account summary">
              <div>
                <dt>User</dt>
                <dd>{account.username || account.telegramUserId}</dd>
              </div>
              <div>
                <dt>Wallet</dt>
                <dd>{shortAddress(account.solanaWalletAddress)}</dd>
              </div>
              <div>
                <dt>Custody</dt>
                <dd>
                  {account.walletSource === "privy"
                    ? "FTX / Privy"
                    : account.walletSource === "external"
                      ? "External"
                      : "None"}
                </dd>
              </div>
              <div>
                <dt>Last sync</dt>
                <dd>{new Date(account.updatedAt).toLocaleString()}</dd>
              </div>
            </dl>

            <div className={styles.workspaceGrid}>
              <section className={styles.panel}>
                <header className={styles.panelHeader}>
                  <div>
                    <span className={styles.sectionIndex}>01</span>
                    <h3>Trading Defaults</h3>
                  </div>
                  <span>
                    {sessionExpiresAt
                      ? `Until ${new Date(sessionExpiresAt).toLocaleTimeString()}`
                      : ""}
                  </span>
                </header>
                <form className={styles.settingsForm} onSubmit={saveSettings}>
                  <fieldset className={styles.settingsGroup}>
                    <legend>Interface</legend>
                    <div className={styles.segmentedControl}>
                      <button
                        type="button"
                        aria-pressed={botMode === "simple"}
                        onClick={() => {
                          setBotMode("simple");
                          setConfirmTrades(false);
                        }}
                      >
                        Simple
                      </button>
                      <button
                        type="button"
                        aria-pressed={botMode === "advanced"}
                        onClick={() => setBotMode("advanced")}
                      >
                        Advanced
                      </button>
                    </div>
                  </fieldset>

                  <div className={styles.numericGrid}>
                    <label>
                      <span>Default buy SOL</span>
                      <input
                        inputMode="decimal"
                        value={defaultBuySol}
                        onChange={(event) =>
                          setDefaultBuySol(event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>Slippage %</span>
                      <input
                        inputMode="decimal"
                        value={slippagePercent}
                        onChange={(event) =>
                          setSlippagePercent(event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>Buy fee lamports</span>
                      <input
                        inputMode="numeric"
                        value={priorityFee}
                        onChange={(event) => setPriorityFee(event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Sell fee lamports</span>
                      <input
                        inputMode="numeric"
                        value={sellPriorityFee}
                        onChange={(event) =>
                          setSellPriorityFee(event.target.value)
                        }
                      />
                    </label>
                  </div>

                  <PresetInputs
                    label="Buy presets SOL"
                    values={buyPresetsSol}
                    onChange={setBuyPresetsSol}
                    inputMode="decimal"
                  />
                  <PresetInputs
                    label="Sell presets %"
                    values={sellPresetsPercent}
                    onChange={setSellPresetsPercent}
                    inputMode="decimal"
                  />
                  <div className={styles.switchGrid}>
                    <label>
                      <input
                        type="checkbox"
                        checked={confirmTrades}
                        disabled={botMode === "simple"}
                        onChange={(event) =>
                          setConfirmTrades(event.target.checked)
                        }
                      />
                      <span>Confirm</span>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={sellProtection}
                        onChange={(event) =>
                          setSellProtection(event.target.checked)
                        }
                      />
                      <span>Sell protection</span>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={mevProtection}
                        onChange={(event) =>
                          setMevProtection(event.target.checked)
                        }
                      />
                      <span>MEV</span>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={autoBuyEnabled}
                        onChange={(event) =>
                          setAutoBuyEnabled(event.target.checked)
                        }
                      />
                      <span>Auto buy</span>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={instantAutoBuyEnabled}
                        onChange={(event) =>
                          setInstantAutoBuyEnabled(event.target.checked)
                        }
                      />
                      <span>Instant CA</span>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={autoSellEnabled}
                        onChange={(event) =>
                          setAutoSellEnabled(event.target.checked)
                        }
                      />
                      <span>Auto sell</span>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={sniperEnabled}
                        onChange={(event) =>
                          setSniperEnabled(event.target.checked)
                        }
                      />
                      <span>Sniper</span>
                    </label>
                  </div>
                  <fieldset className={styles.settingsGroup}>
                    <legend>Instant CA buy</legend>
                    <div className={styles.numericGrid}>
                      <label>
                        <span>Buy amount SOL</span>
                        <input
                          inputMode="decimal"
                          value={instantAutoBuySol}
                          onChange={(event) =>
                            setInstantAutoBuySol(event.target.value)
                          }
                        />
                      </label>
                      <label>
                        <span>Minimum liquidity USD</span>
                        <input
                          inputMode="decimal"
                          value={instantAutoBuyMinLiquidityUsd}
                          onChange={(event) =>
                            setInstantAutoBuyMinLiquidityUsd(event.target.value)
                          }
                        />
                      </label>
                      <label>
                        <span>Maximum market cap USD</span>
                        <input
                          inputMode="decimal"
                          placeholder="No limit"
                          value={instantAutoBuyMaxMarketCapUsd}
                          onChange={(event) =>
                            setInstantAutoBuyMaxMarketCapUsd(event.target.value)
                          }
                        />
                      </label>
                    </div>
                  </fieldset>
                  <button
                    type="submit"
                    className={styles.primaryButton}
                    disabled={saving || !sessionActive}
                  >
                    {saving ? "Saving" : "Save defaults"}
                  </button>
                </form>
              </section>

              <section className={styles.panel}>
                <header className={styles.panelHeader}>
                  <div>
                    <span className={styles.sectionIndex}>02</span>
                    <h3>Wallet &amp; Access</h3>
                  </div>
                  <span>
                    {account.walletSource === "privy"
                      ? "Privy managed"
                      : "External"}
                  </span>
                </header>
                <div className={styles.walletRows}>
                  <div>
                    <span>Address</span>
                    <strong>{account.solanaWalletAddress ?? "none"}</strong>
                  </div>
                  <div>
                    <span>Privy user</span>
                    <strong>{shortAddress(account.privyUserId)}</strong>
                  </div>
                  <div>
                    <span>Privy wallet</span>
                    <strong>{shortAddress(account.privyWalletId)}</strong>
                  </div>
                  <div>
                    <span>Claim flow</span>
                    <strong>
                      {formatDateTime(account.walletClaimRequestedAt)}
                    </strong>
                  </div>
                  <div>
                    <span>Export flow</span>
                    <strong>
                      {formatDateTime(account.walletExportRequestedAt)}
                    </strong>
                  </div>
                  <div>
                    <span>Bot access</span>
                    <strong>
                      {account.botAccessRevokedAt
                        ? `Revoked ${formatDateTime(account.botAccessRevokedAt)}`
                        : "Enabled"}
                    </strong>
                  </div>
                </div>
                {account.walletSource === "privy" ? (
                  <PrivyWalletControls
                    account={account}
                    sessionActive={sessionActive}
                    onRecordAction={runWalletAction}
                  />
                ) : (
                  <div className={styles.privyUnavailable}>
                    External wallets remain quote-only.
                  </div>
                )}

                <div className={styles.localSafetyControl}>
                  <div>
                    <strong>FTX bot access</strong>
                    <span>
                      {account.botAccessRevokedAt ? "Paused" : "Enabled"}
                    </span>
                  </div>
                  {confirmPause ? (
                    <div className={styles.localSafetyActions} role="alert">
                      <button
                        type="button"
                        className={styles.dangerButton}
                        disabled={Boolean(walletActionSaving)}
                        onClick={() => runWalletAction("revoke")}
                      >
                        {walletActionSaving === "revoke"
                          ? "Pausing"
                          : "Confirm pause"}
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={Boolean(walletActionSaving)}
                        onClick={() => setConfirmPause(false)}
                      >
                        Keep enabled
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={styles.dangerButton}
                      disabled={
                        Boolean(walletActionSaving) ||
                        !sessionActive ||
                        account.walletSource !== "privy" ||
                        Boolean(account.botAccessRevokedAt)
                      }
                      onClick={() => setConfirmPause(true)}
                    >
                      Pause bot
                    </button>
                  )}
                </div>
              </section>
              <TokenListPanel
                title="Watchlist"
                tokens={account.watchlist}
                value={watchMint}
                onChange={setWatchMint}
                onAdd={() => updateTokenList("watchlist", "add", watchMint)}
                onRemove={(mint) =>
                  updateTokenList("watchlist", "remove", mint)
                }
                disabled={saving || !sessionActive}
              />
              <TokenListPanel
                title="Hidden"
                tokens={account.hiddenTokens}
                value={hiddenMint}
                onChange={setHiddenMint}
                onAdd={() => updateTokenList("hiddenToken", "add", hiddenMint)}
                onRemove={(mint) =>
                  updateTokenList("hiddenToken", "remove", mint)
                }
                disabled={saving || !sessionActive}
              />
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>
            <Image
              src="/sbficon.png"
              alt=""
              width={88}
              height={88}
              aria-hidden="true"
            />
            <div>
              <span>Waiting for access</span>
              <strong>No control session</strong>
              <p>Use a current Ribbot control code to load this workspace.</p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function TokenListPanel({
  title,
  tokens,
  value,
  onChange,
  onAdd,
  onRemove,
  disabled,
}: {
  title: string;
  tokens: string[];
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (mint: string) => void;
  disabled: boolean;
}) {
  return (
    <section className={styles.panel}>
      <header className={styles.panelHeader}>
        <div>
          <span className={styles.sectionIndex}>
            {title === "Watchlist" ? "03" : "04"}
          </span>
          <h3>{title}</h3>
        </div>
        <span>{tokens.length}</span>
      </header>
      <div className={styles.tokenInput}>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value.trim())}
          placeholder="SPL mint"
          disabled={disabled}
        />
        <button type="button" onClick={onAdd} disabled={disabled}>
          Add
        </button>
      </div>
      <div className={styles.tokenList}>
        {tokens.length === 0 ? (
          <span className={styles.muted}>Empty</span>
        ) : (
          tokens.slice(0, 12).map((mint) => (
            <div key={mint} className={styles.tokenRow}>
              <span>{shortAddress(mint)}</span>
              <button
                type="button"
                onClick={() => onRemove(mint)}
                disabled={disabled}
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function PresetInputs({
  label,
  values,
  onChange,
  inputMode,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  inputMode: "decimal" | "numeric";
}) {
  return (
    <fieldset className={styles.settingsGroup}>
      <legend>{label}</legend>
      <div className={styles.presetGrid}>
        {values.map((value, index) => (
          <label key={index}>
            <span>Preset {index + 1}</span>
            <input
              inputMode={inputMode}
              value={value}
              onChange={(event) => {
                const next = [...values];
                next[index] = event.target.value;
                onChange(next);
              }}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
