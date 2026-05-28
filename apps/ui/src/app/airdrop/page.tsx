"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";

import { Ticker } from "@/components/Ticker";
import { WalletButton } from "@/components/WalletButton";

import homeStyles from "../page.module.css";
import styles from "./airdrop.module.css";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isPhantom?: boolean;
};

type AirdropStats = {
  totalClaims: number;
  allocatedDaemon: string;
  remainingDaemon: string;
  finalized: boolean;
  vrfTx: string | null;
};

type ClaimStatus = {
  solAddress: string;
  ethAddress: string;
  sequence: number;
  frogCount: number;
  status: string;
  amountDaemon: string | null;
  payoutStatus: string | null;
  payoutTxHash: string | null;
  paidAt: string | null;
  createdAt: string;
  finalizedAt: string | null;
};

type AirdropResponse = {
  config?: {
    enabled: boolean;
    campaignId: string;
    collectionAddress: string;
    daemonTokenAddress: string;
    escrowAddress: string;
    daemonDecimals: number;
    minFrogs: number;
    fullPrizeMinFrogs: number;
    poolDaemon: string;
    minPrizeDaemon: string;
    maxPrizeDaemon: string;
    claimOpen: boolean;
    requireEthSignature: boolean;
    stats?: AirdropStats;
  };
  enabled?: boolean;
  campaignId?: string;
  collectionAddress?: string;
  daemonTokenAddress?: string;
  escrowAddress?: string;
  daemonDecimals?: number;
  minFrogs?: number;
  fullPrizeMinFrogs?: number;
  poolDaemon?: string;
  minPrizeDaemon?: string;
  maxPrizeDaemon?: string;
  claimOpen?: boolean;
  requireEthSignature?: boolean;
  stats?: AirdropStats;
  claim?: ClaimStatus | null;
};

type ChallengeResponse = {
  nonce: string;
  message: string;
  expiresAt: string;
  solAddress: string;
  ethAddress: string;
  error?: string;
};

type ClaimResponse = {
  eligible?: boolean;
  claim?: ClaimStatus;
  stats?: AirdropStats;
  error?: string;
};

type EligibilityResponse = {
  solAddress: string;
  eligible: boolean;
  frogCount: number | null;
  minFrogs: number;
  unavailable?: boolean;
  error?: string;
};

declare global {
  interface Window {
    phantom?: {
      ethereum?: EthereumProvider;
    };
  }
}

const ethAddressPattern = /^0x[a-fA-F0-9]{40}$/;

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const formatAddress = (address: string) =>
  `${address.slice(0, 4)}...${address.slice(-4)}`;

const normalizeConfig = (data: AirdropResponse) => data.config ?? data;

const getEthereumProvider = () =>
  window.phantom?.ethereum ??
  (window as typeof window & { ethereum?: EthereumProvider }).ethereum ??
  null;

const getClaimButtonText = (claim: ClaimStatus | null, loading: boolean) => {
  if (loading) return "Signing";
  if (!claim) return "Claim";
  if (claim.payoutTxHash) return "Airdropped";
  if (claim.status === "not_selected") return "Pool exhausted";
  return "Reserved";
};

const getClaimResultLabel = (claim: ClaimStatus) => {
  if (claim.payoutTxHash) return "Airdropped";
  if (claim.status === "not_selected") return "Pool exhausted";
  if (claim.status === "won") return "Reserved, not sent";
  return "Claim recorded";
};

export default function AirdropPage() {
  const router = useRouter();
  const { publicKey, signMessage, connected } = useWallet();
  const solAddress = publicKey?.toBase58() ?? "";
  const [airdrop, setAirdrop] = useState<AirdropResponse | null>(null);
  const [ethAddress, setEthAddress] = useState("");
  const [ethConnectedAddress, setEthConnectedAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [eligibility, setEligibility] = useState<EligibilityResponse | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");
  const toggleMenu = () => setMenuOpen((open) => !open);
  const closeMenu = () => setMenuOpen(false);

  const config = useMemo(
    () => (airdrop ? normalizeConfig(airdrop) : null),
    [airdrop],
  );
  const stats = config?.stats ?? airdrop?.stats;
  const claim = airdrop?.claim ?? null;
  const validEthAddress = ethAddressPattern.test(ethAddress);
  const eligible = eligibility?.eligible === true;
  const frogCount = eligibility?.frogCount ?? 0;
  const minFrogs = eligibility?.minFrogs ?? config?.minFrogs ?? 1;
  const fullPrizeMinFrogs = config?.fullPrizeMinFrogs ?? 10;
  const frogsNeeded = Math.max(0, minFrogs - frogCount);
  const currentPrize =
    frogCount >= fullPrizeMinFrogs
      ? (config?.maxPrizeDaemon ?? "1.00")
      : (config?.minPrizeDaemon ?? "0.10");
  const ethReady =
    validEthAddress &&
    ethConnectedAddress.toLowerCase() === ethAddress.toLowerCase();
  const canClaim =
    Boolean(config?.enabled && config?.claimOpen) &&
    connected &&
    Boolean(solAddress) &&
    eligible &&
    validEthAddress &&
    Boolean(signMessage) &&
    !claim;

  const loadAirdropStatus = useCallback(
    async (signal?: AbortSignal) => {
      const query = solAddress ? `?solAddress=${encodeURIComponent(solAddress)}` : "";
      const response = await fetch(`/api/frogx/airdrop${query}`, { signal });
      if (!response.ok) return;
      const data = (await response.json()) as AirdropResponse;
      setAirdrop(data);
    },
    [solAddress],
  );

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    const controller = new AbortController();
    loadAirdropStatus(controller.signal).catch(() => {
      if (!controller.signal.aborted) {
        setError("Airdrop status is unavailable.");
      }
    });
    return () => controller.abort();
  }, [loadAirdropStatus]);

  useEffect(() => {
    if (!claim || claim.payoutTxHash || !solAddress) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      loadAirdropStatus().catch(() => undefined);
    }, 10000);

    return () => window.clearInterval(interval);
  }, [claim, loadAirdropStatus, solAddress]);

  useEffect(() => {
    setEligibility(null);
    if (!solAddress) {
      return undefined;
    }

    const controller = new AbortController();
    const checkEligibility = async () => {
      setEligibilityLoading(true);
      const response = await fetch(
        `/api/frogx/airdrop/eligibility?solAddress=${encodeURIComponent(solAddress)}`,
        { signal: controller.signal },
      );
      const data = (await response.json()) as EligibilityResponse;
      if (!response.ok) {
        throw new Error(data.error ?? "Eligibility check failed.");
      }
      setEligibility(data);
    };

    checkEligibility()
      .catch((caught) => {
        if (!controller.signal.aborted) {
          const message =
            caught instanceof Error
              ? caught.message
              : "Eligibility check failed.";
          setError(message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setEligibilityLoading(false);
        }
      });

    return () => controller.abort();
  }, [solAddress]);

  const connectEth = async () => {
    setError("");
    const provider = getEthereumProvider();
    if (!provider) {
      setError("No Ethereum wallet provider found.");
      return;
    }
    try {
      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      const account = accounts?.[0] ?? "";
      if (!ethAddressPattern.test(account)) {
        setError("Ethereum wallet did not return a valid address.");
        return;
      }
      setEthConnectedAddress(account);
      setEthAddress(account);
    } catch {
      setError("Ethereum wallet connection was rejected.");
    }
  };

  const submitClaim = async () => {
    setError("");
    setStatusText("");
    if (!solAddress || !signMessage) {
      setError("Connect a Solana wallet that can sign messages.");
      return;
    }
    if (!eligible) {
      setError(`This Solana wallet must hold at least ${minFrogs} frog.`);
      return;
    }
    if (!validEthAddress) {
      setError("Enter a valid Ethereum payout address.");
      return;
    }

    const provider = getEthereumProvider();

    setLoading(true);
    try {
      setStatusText("Preparing claim proof...");
      const challengeResponse = await fetch("/api/frogx/airdrop/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ solAddress, ethAddress }),
      });
      const challenge = (await challengeResponse.json()) as ChallengeResponse;
      if (!challengeResponse.ok || challenge.error) {
        throw new Error(challenge.error ?? "Unable to create claim challenge.");
      }

      setStatusText("Sign the Solana proof...");
      const solSignatureBytes = await signMessage(
        new TextEncoder().encode(challenge.message),
      );
      const solSignature = bytesToBase64(solSignatureBytes);

      let ethSignature = "";
      if (provider && ethReady) {
        setStatusText("Sign the optional Ethereum payout proof...");
        ethSignature = (await provider.request({
          method: "personal_sign",
          params: [challenge.message, ethAddress],
        })) as string;
      }

      setStatusText("Verifying frog holdings...");
      const claimResponse = await fetch("/api/frogx/airdrop/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          solAddress,
          ethAddress,
          nonce: challenge.nonce,
          solSignature,
          ethSignature,
        }),
      });
      const claimData = (await claimResponse.json()) as ClaimResponse;
      if (!claimResponse.ok || claimData.error) {
        throw new Error(claimData.error ?? "Claim failed.");
      }

      setAirdrop((current) => ({
        ...(current ?? {}),
        claim: claimData.claim ?? null,
        stats: claimData.stats ?? stats,
      }));
      setStatusText("Claim recorded. Payout has not been sent yet.");
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Claim could not be submitted.";
      setError(message);
      setStatusText("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={homeStyles.main}>
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
            <p className={homeStyles.tagline}>Powered by Titan for the best prices on Solana</p>
          </button>
        </div>
        <div className={homeStyles.rightControls}>
          <button
            type="button"
            className={homeStyles.menuButton}
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            onClick={toggleMenu}
          >
            <img src="/wallet.svg" alt="" className={homeStyles.menuButtonIcon} />
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
            <button
              type="button"
              className={homeStyles.menuItem}
              onClick={() => {
                closeMenu();
                router.push("/");
              }}
            >
              <img
                src="/swap.svg"
                alt=""
                className={`${homeStyles.menuIcon} ${homeStyles.pixelIcon}`}
              />
              <span>SWAP</span>
            </button>
          </nav>
        </div>
      </header>
      <Ticker />
      <div className={homeStyles.swapStack}>
        <section className={styles.panel} aria-labelledby="airdrop-title">
          <header className={styles.header}>
            <div>
              <span className={styles.badge}>Frog holder drop</span>
              <h2 id="airdrop-title">$DAEMON Airdrop</h2>
            </div>
          </header>

          <div className={styles.summaryGrid}>
            <div>
              <span>Gate</span>
              <strong>{config?.minFrogs ?? 1}+ Frog</strong>
            </div>
            <div>
              <span>Pool</span>
              <strong>{config?.poolDaemon ?? "10.00"} $DAEMON</strong>
            </div>
            <div>
              <span>Prize</span>
              <strong>
                {config?.minPrizeDaemon ?? "0.10"} / {config?.maxPrizeDaemon ?? "1.00"}
              </strong>
            </div>
            <div>
              <span>Unreserved</span>
              <strong>{stats?.remainingDaemon ?? config?.poolDaemon ?? "10.00"} $DAEMON</strong>
            </div>
          </div>

          {!config?.enabled || !config?.claimOpen ? (
            <div className={styles.notice}>
              Claims are not open. This page is wired for the $DAEMON drop and will
              activate when the campaign is enabled.
            </div>
          ) : null}

          <div className={styles.steps}>
            <div className={styles.step}>
              <span className={styles.stepIndex}>1</span>
              <div>
                <h3>Solana frog wallet</h3>
                <p>
                  {!solAddress
                    ? "Connect the wallet holding frogs."
                    : eligibilityLoading
                      ? `${formatAddress(solAddress)} checking frogs...`
                      : eligible
                        ? `${formatAddress(solAddress)} holds ${frogCount} frogs; ${currentPrize} $DAEMON tier`
                        : eligibility?.unavailable
                          ? "Frog count check unavailable. Try again shortly."
                          : `${formatAddress(solAddress)} holds ${frogCount}/${minFrogs} frogs; ${frogsNeeded} more needed`}
                </p>
              </div>
            </div>

            <div className={`${styles.step} ${!eligible ? styles.stepDisabled : ""}`}>
              <span className={styles.stepIndex}>2</span>
              <div>
                <h3>Ethereum payout</h3>
                <p>
                  {ethReady
                    ? `${formatAddress(ethAddress)} verified`
                    : validEthAddress
                      ? `${formatAddress(ethAddress)} entered`
                      : "Paste any Ethereum wallet, or connect Phantom EVM."}
                </p>
              </div>
              <div className={styles.ethControls}>
                <input
                  value={ethAddress}
                  onChange={(event) => setEthAddress(event.target.value.trim())}
                  placeholder="0x..."
                  spellCheck={false}
                  aria-label="Ethereum payout address"
                  disabled={!eligible}
                />
                <button type="button" onClick={connectEth} disabled={!eligible}>
                  Connect ETH Wallet
                </button>
              </div>
            </div>

            <div className={`${styles.step} ${!eligible ? styles.stepDisabled : ""}`}>
              <span className={styles.stepIndex}>3</span>
              <div>
                <h3>Claim queue</h3>
                <p>
                  {claim
                    ? claim.payoutTxHash
                      ? `Airdropped ${claim.amountDaemon ?? "0.00"} $DAEMON to ${formatAddress(claim.ethAddress)}.`
                      : claim.amountDaemon
                        ? `Claim #${claim.sequence} reserved ${claim.amountDaemon} $DAEMON for ${claim.frogCount} frogs. No airdrop has been sent yet.`
                        : `Claim #${claim.sequence} recorded with ${claim.frogCount} frogs. Payout is not sent yet.`
                    : `Sign with your Solana frog wallet. ${fullPrizeMinFrogs}+ frogs gets 1 $DAEMON; 1+ gets 0.1. We cover all gas fees.`}
                </p>
              </div>
              <button
                type="button"
                className={styles.claimButton}
                disabled={!canClaim || loading}
                onClick={submitClaim}
              >
                {getClaimButtonText(claim, loading)}
              </button>
            </div>
          </div>

          {claim ? (
            <div className={styles.result}>
              <span>{getClaimResultLabel(claim)}</span>
              <strong>
                {claim.amountDaemon === null
                  ? "No payout amount yet"
                  : `${claim.amountDaemon} $DAEMON`}
              </strong>
              {claim.payoutTxHash ? (
                <a
                  href={`https://etherscan.io/tx/${claim.payoutTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View tx
                </a>
              ) : (
                <em>No transfer tx yet</em>
              )}
            </div>
          ) : null}
          {statusText ? <p className={styles.status}>{statusText}</p> : null}
          {error ? <p className={styles.error}>{error}</p> : null}
        </section>
      </div>
    </main>
  );
}
