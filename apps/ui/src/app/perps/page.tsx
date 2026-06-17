"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type CandlestickData,
  type UTCTimestamp,
} from "lightweight-charts";

import { Ticker } from "@/components/Ticker";
import { WalletButton } from "@/components/WalletButton";
import { useAudio } from "@/providers/AudioProvider";
import { isV1 } from "@/lib/version";

import homeStyles from "../page.module.css";
import styles from "./perps.module.css";

const IMPERIAL_BASE = "https://api.imperial.space/api/v1";

const GMGN_CHARTS: Record<string, string> = {
  SOL: "So11111111111111111111111111111111111111112",
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  BONK: "DezXAZ8z7PnrnRJjz3pQYHjMW8nC5Wto7By1pPB263ny",
  WIF: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzL7kkjNS4",
};

const COINBASE_PRODUCTS: Record<string, string> = {
  SOL: "SOL-USD",
  BTC: "BTC-USD",
  ETH: "ETH-USD",
  JUP: "JUP-USD",
  BONK: "BONK-USD",
  WIF: "WIF-USD",
  AAVE: "AAVE-USD",
  ADA: "ADA-USD",
  AVAX: "AVAX-USD",
  BCH: "BCH-USD",
  BNB: "BNB-USD",
  DOGE: "DOGE-USD",
  DOT: "DOT-USD",
  LINK: "LINK-USD",
  LTC: "LTC-USD",
};

const DEFAULT_SYMBOLS = ["SOL", "BTC", "ETH", "JUP", "BONK", "WIF", "XAU", "SPY"];

const venueLabels = {
  jupiter: "Jupiter",
  flash_trade: "Flash",
  flash: "Flash",
  phoenix: "Phoenix",
  gmtrade: "GMTrade",
} as const;

type Side = "long" | "short";
type RouteVenue = "jupiter" | "flash_trade" | "phoenix" | "gmtrade";
type DataVenue = "jupiter" | "flash" | "phoenix" | "gmtrade";

type VenueFunding = {
  source: string;
  longFundingRatePerHourPercent: number | null;
  shortFundingRatePerHourPercent: number | null;
  longBorrowRatePerHourPercent: number | null;
  shortBorrowRatePerHourPercent: number | null;
};

type FundingRow = {
  symbol: string;
} & Partial<Record<DataVenue, VenueFunding | null>>;

type VenueMark = {
  source: string;
  price: number;
  fetchedAtUnixMs: number;
};

type MarkPriceRow = {
  symbol: string;
} & Partial<Record<DataVenue, VenueMark | null>>;

type CostBreakdown = {
  openFee: number;
  closeFee: number;
  openSlip: number;
  closeSlip: number;
  borrow: number;
  expectedLiqCost: number;
  pLiq: number;
  total: number;
};

type RouteCandidate = {
  venue: RouteVenue;
  expectedCostUsd: number;
  costBreakdown: CostBreakdown;
  maxLeverage: number;
  filteredReason?: string | null;
};

type RouteResult = RouteCandidate & {
  reason: string;
  clamped: boolean;
  clampedMaxLeverage?: number | null;
  candidates: RouteCandidate[];
  marketsVersion?: number;
};

type StatusResponse = {
  db?: string;
  indexer?: {
    status?: string;
    grpcStream?: string | null;
    db?: string | null;
    lastProcessedSlot?: number | null;
  } | null;
  orderBot?: {
    status?: string;
    rpc?: string | null;
  } | null;
};

type StatsResponse = {
  volume24hUsd: string;
  openInterestUsd: string;
  activeTraders24h: number;
  asOf: string;
};

type MarketSnapshot = {
  fundingRows: FundingRow[];
  markRows: MarkPriceRow[];
  status: StatusResponse | null;
  stats: StatsResponse | null;
};

type Candle = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const PerpsCandleChart = ({
  candles,
  symbol,
}: {
  candles: Candle[];
  symbol: string;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const candleData = useMemo<CandlestickData<UTCTimestamp>[]>(
    () =>
      candles.map((candle) => ({
        time: Math.floor(candle.openTime / 1000) as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    [candles],
  );
  const latestCandle = candles.at(-1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || candleData.length === 0) return undefined;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "rgba(3, 0, 18, 0)" },
        textColor: "rgba(234, 253, 244, 0.62)",
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(20, 241, 149, 0.08)" },
        horzLines: { color: "rgba(20, 241, 149, 0.08)" },
      },
      crosshair: {
        vertLine: {
          color: "rgba(234, 253, 244, 0.42)",
          labelBackgroundColor: "#08021e",
        },
        horzLine: {
          color: "rgba(234, 253, 244, 0.42)",
          labelBackgroundColor: "#08021e",
        },
      },
      rightPriceScale: {
        borderColor: "rgba(20, 241, 149, 0.18)",
        scaleMargins: {
          top: 0.08,
          bottom: 0.12,
        },
      },
      timeScale: {
        borderColor: "rgba(20, 241, 149, 0.18)",
        timeVisible: true,
        secondsVisible: false,
      },
      localization: {
        priceFormatter: (price: number) =>
          new Intl.NumberFormat("en-US", {
            maximumFractionDigits: price >= 1000 ? 2 : 6,
          }).format(price),
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "rgba(20, 241, 149, 0.72)",
      downColor: "rgba(255, 122, 156, 0.72)",
      borderUpColor: "#14f195",
      borderDownColor: "#ff7a9c",
      wickUpColor: "#14f195",
      wickDownColor: "#ff7a9c",
      priceLineColor: "rgba(20, 241, 149, 0.75)",
      priceLineWidth: 1,
      lastValueVisible: true,
      priceLineVisible: true,
    });

    candlestickSeries.setData(candleData);
    chart.timeScale().fitContent();

    return () => {
      chart.remove();
    };
  }, [candleData]);

  return (
    <div className={styles.lightweightChartShell}>
      <div className={styles.chartOverlay} aria-hidden="true">
        <span>{symbol} 15M</span>
        <strong>{formatUsd(latestCandle?.close)}</strong>
      </div>
      <div
        ref={containerRef}
        className={styles.lightweightChart}
        role="img"
        aria-label={`${symbol} 15 minute candlestick chart`}
      />
    </div>
  );
};

const routeVenueToDataVenue = (venue?: RouteVenue): DataVenue | null => {
  if (!venue) return null;
  return venue === "flash_trade" ? "flash" : venue;
};

const formatUsd = (value: number | string | null | undefined, options?: Intl.NumberFormatOptions) => {
  if (value === null || value === undefined) return "--";
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numeric)) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: numeric >= 1000 ? 0 : 4,
    ...options,
  }).format(numeric);
};

const formatNumber = (
  value: number | string | null | undefined,
  options?: Intl.NumberFormatOptions,
) => {
  if (value === null || value === undefined) return "--";
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numeric)) return "--";
  return new Intl.NumberFormat("en-US", options).format(numeric);
};

const formatPercent = (value: number | null | undefined, decimals = 4) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
};

const getFundingForSide = (row: FundingRow | undefined, venue: DataVenue | null, side: Side) => {
  if (!row || !venue) return { funding: null, borrow: null, source: null };
  const rates = row[venue];
  if (!rates) return { funding: null, borrow: null, source: null };
  return {
    funding:
      side === "long"
        ? rates.longFundingRatePerHourPercent
        : rates.shortFundingRatePerHourPercent,
    borrow:
      side === "long"
        ? rates.longBorrowRatePerHourPercent
        : rates.shortBorrowRatePerHourPercent,
    source: rates.source,
  };
};

export default function PerpsPage() {
  const router = useRouter();
  const { connected } = useWallet();
  const { muted, toggleMuted } = useAudio();
  const [menuOpen, setMenuOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<MarketSnapshot>({
    fundingRows: [],
    markRows: [],
    status: null,
    stats: null,
  });
  const [loadingMarkets, setLoadingMarkets] = useState(true);
  const [marketError, setMarketError] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState("SOL");
  const [search, setSearch] = useState("");
  const [side, setSide] = useState<Side>("long");
  const [collateral, setCollateral] = useState("100");
  const [leverage, setLeverage] = useState(5);
  const [holdHours, setHoldHours] = useState(24);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeError, setRouteError] = useState("");
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loadingCandles, setLoadingCandles] = useState(false);
  const [candleError, setCandleError] = useState("");

  const toggleMenu = () => setMenuOpen((open) => !open);
  const closeMenu = () => setMenuOpen(false);
  const handleToggleMute = () => {
    toggleMuted();
  };

  const fetchMarkets = useCallback(async () => {
    setLoadingMarkets(true);
    setMarketError("");
    try {
      const [fundingResponse, marksResponse, statusResponse, statsResponse] =
        await Promise.all([
          fetch(`${IMPERIAL_BASE}/funding-rates`),
          fetch(`${IMPERIAL_BASE}/mark-prices`),
          fetch(`${IMPERIAL_BASE}/status`),
          fetch(`${IMPERIAL_BASE}/stats/summary`),
        ]);

      if (!fundingResponse.ok || !marksResponse.ok) {
        throw new Error("Imperial market data unavailable.");
      }

      const [fundingData, marksData, statusData, statsData] = await Promise.all([
        fundingResponse.json() as Promise<{ rows: FundingRow[] }>,
        marksResponse.json() as Promise<{ rows: MarkPriceRow[] }>,
        statusResponse.ok ? (statusResponse.json() as Promise<StatusResponse>) : null,
        statsResponse.ok ? (statsResponse.json() as Promise<StatsResponse>) : null,
      ]);

      setSnapshot({
        fundingRows: fundingData.rows ?? [],
        markRows: marksData.rows ?? [],
        status: statusData,
        stats: statsData,
      });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Imperial market data unavailable.";
      setMarketError(message);
    } finally {
      setLoadingMarkets(false);
    }
  }, []);

  useEffect(() => {
    void fetchMarkets();
    const interval = window.setInterval(() => {
      void fetchMarkets();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [fetchMarkets]);

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

  const collateralNumber = Number(collateral);
  const notional = Number.isFinite(collateralNumber) ? collateralNumber * leverage : 0;

  useEffect(() => {
    if (!selectedSymbol || notional <= 0 || leverage <= 0) {
      setRoute(null);
      return undefined;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoadingRoute(true);
      setRouteError("");
      try {
        const params = new URLSearchParams({
          asset: selectedSymbol,
          side,
          notional: String(notional),
          desiredLeverage: String(leverage),
          holdHours: String(holdHours),
        });
        const response = await fetch(`${IMPERIAL_BASE}/route?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("No route for this setup.");
        }
        setRoute((await response.json()) as RouteResult);
      } catch (caught) {
        if (controller.signal.aborted) return;
        const message = caught instanceof Error ? caught.message : "No route for this setup.";
        setRoute(null);
        setRouteError(message);
      } finally {
        if (!controller.signal.aborted) {
          setLoadingRoute(false);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [holdHours, leverage, notional, selectedSymbol, side]);

  useEffect(() => {
    const coinbaseProduct = COINBASE_PRODUCTS[selectedSymbol];
    if (!coinbaseProduct) {
      setCandles([]);
      setCandleError("No candle feed for this market yet.");
      setLoadingCandles(false);
      return undefined;
    }

    const controller = new AbortController();
    const fetchCandles = async () => {
      setLoadingCandles(true);
      setCandleError("");
      try {
        const params = new URLSearchParams({
          granularity: "900",
        });
        const response = await fetch(
          `https://api.exchange.coinbase.com/products/${coinbaseProduct}/candles?${params}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error("Candle feed unavailable.");
        }
        const rows = (await response.json()) as number[][];
        setCandles(
          rows
            .map((row) => ({
              openTime: row[0] * 1000,
              low: row[1],
              high: row[2],
              open: row[3],
              close: row[4],
              volume: row[5],
            }))
            .sort((a, b) => a.openTime - b.openTime)
            .slice(-80),
        );
      } catch (caught) {
        if (controller.signal.aborted) return;
        const message = caught instanceof Error ? caught.message : "Candle feed unavailable.";
        setCandles([]);
        setCandleError(message);
      } finally {
        if (!controller.signal.aborted) {
          setLoadingCandles(false);
        }
      }
    };

    void fetchCandles();
    return () => controller.abort();
  }, [selectedSymbol]);

  const markBySymbol = useMemo(() => {
    const map = new Map<string, MarkPriceRow>();
    snapshot.markRows.forEach((row) => map.set(row.symbol, row));
    return map;
  }, [snapshot.markRows]);

  const fundingBySymbol = useMemo(() => {
    const map = new Map<string, FundingRow>();
    snapshot.fundingRows.forEach((row) => map.set(row.symbol, row));
    return map;
  }, [snapshot.fundingRows]);

  const selectedMarkRow = markBySymbol.get(selectedSymbol);
  const selectedFundingRow = fundingBySymbol.get(selectedSymbol);
  const dataVenue = routeVenueToDataVenue(route?.venue);
  const selectedVenueMark = dataVenue ? selectedMarkRow?.[dataVenue] : null;
  const firstMark = selectedMarkRow
    ? selectedMarkRow.gmtrade ??
      selectedMarkRow.phoenix ??
      selectedMarkRow.flash ??
      selectedMarkRow.jupiter ??
      null
    : null;
  const displayMark = selectedVenueMark ?? firstMark;
  const funding = getFundingForSide(selectedFundingRow, dataVenue, side);
  const chartMint = GMGN_CHARTS[selectedSymbol];
  const chartUrl = chartMint
    ? `https://www.gmgn.cc/kline/sol/${chartMint}?theme=dark&interval=15`
    : null;
  const orderBotHealthy = snapshot.status?.orderBot?.status === "healthy";
  const marketSymbols = useMemo(() => {
    const merged = new Set<string>();
    DEFAULT_SYMBOLS.forEach((symbol) => merged.add(symbol));
    snapshot.markRows.forEach((row) => merged.add(row.symbol));
    const normalizedSearch = search.trim().toUpperCase();
    return Array.from(merged)
      .filter((symbol) => !normalizedSearch || symbol.includes(normalizedSearch))
      .slice(0, 42);
  }, [search, snapshot.markRows]);

  const marketRows = useMemo(() => {
    return marketSymbols.map((symbol) => {
      const row = markBySymbol.get(symbol);
      const mark = row?.gmtrade ?? row?.phoenix ?? row?.flash ?? row?.jupiter ?? null;
      return { symbol, mark };
    });
  }, [markBySymbol, marketSymbols]);

  return (
    <main className={`${homeStyles.main} ${styles.main}`}>
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
          {connected && !isV1 ? (
            <div className={homeStyles.xpChip} aria-label="Your XP">
              <span className={homeStyles.xpValue}>4,269 XP</span>
              <img src="/sparkle.svg" alt="" className={homeStyles.sparkleIcon} />
            </div>
          ) : null}
          <button
            type="button"
            className={homeStyles.speakerButton}
            aria-label={muted ? "Unmute audio" : "Mute audio"}
            onClick={handleToggleMute}
          >
            <img
              src={muted ? "/mute.svg" : "/sound.svg"}
              alt=""
              className={homeStyles.speakerIcon}
            />
          </button>
          <button
            type="button"
            className={homeStyles.menuButton}
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            onClick={toggleMenu}
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
            <button type="button" className={homeStyles.menuItem} onClick={closeMenu}>
              <img
                src="/sparkle.svg"
                alt=""
                className={`${homeStyles.menuIcon} ${homeStyles.pixelIcon}`}
              />
              <span>PERPS</span>
            </button>
            <button
              type="button"
              className={homeStyles.menuItem}
              onClick={() => {
                closeMenu();
                router.push("/airdrop");
              }}
            >
              <img
                src="/sparkle.svg"
                alt=""
                className={`${homeStyles.menuIcon} ${homeStyles.pixelIcon}`}
              />
              <span>AIRDROP</span>
            </button>
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

      <div className={styles.terminal}>
        <section className={styles.topBar} aria-label="Perps account summary">
          <div>
            <span className={styles.eyebrow}>PERPS</span>
            <h2>{selectedSymbol}-USD</h2>
          </div>
          <div className={styles.statsStrip}>
            <div>
              <span>Mark</span>
              <strong>{formatUsd(displayMark?.price)}</strong>
            </div>
            <div>
              <span>24h Volume</span>
              <strong>{formatUsd(snapshot.stats?.volume24hUsd, { maximumFractionDigits: 0 })}</strong>
            </div>
            <div>
              <span>Open Interest</span>
              <strong>{formatUsd(snapshot.stats?.openInterestUsd, { maximumFractionDigits: 0 })}</strong>
            </div>
            <div className={orderBotHealthy ? styles.liveStatus : styles.offlineStatus}>
              <span>Imperial</span>
              <strong>{orderBotHealthy ? "LIVE" : "READ"}</strong>
            </div>
          </div>
        </section>

        <section className={styles.grid}>
          <aside className={styles.marketPanel} aria-label="Markets">
            <div className={styles.panelHeader}>
              <h3>Markets</h3>
              <span>{loadingMarkets ? "SYNC" : `${snapshot.markRows.length} PAIRS`}</span>
            </div>
            <input
              className={styles.search}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              aria-label="Search perps markets"
            />
            <div className={styles.marketList}>
              {marketRows.map(({ symbol, mark }) => (
                <button
                  key={symbol}
                  type="button"
                  className={`${styles.marketRow} ${
                    selectedSymbol === symbol ? styles.marketRowActive : ""
                  }`}
                  onClick={() => setSelectedSymbol(symbol)}
                >
                  <span>{symbol}</span>
                  <strong>{formatUsd(mark?.price)}</strong>
                </button>
              ))}
            </div>
          </aside>

          <section className={styles.chartPanel} aria-label={`${selectedSymbol} chart`}>
            <div className={styles.panelHeader}>
              <h3>Chart</h3>
              {chartUrl ? (
                <a href={chartUrl} target="_blank" rel="noreferrer" className={styles.chartLink}>
                  GMGN
                </a>
              ) : (
                <span>MARK DATA</span>
              )}
            </div>
            <div className={styles.chartFallback}>
              {candles.length > 0 ? (
                <PerpsCandleChart candles={candles} symbol={selectedSymbol} />
              ) : (
                <div className={styles.routeChart} aria-label="Venue route cost comparison">
                  <p>{loadingCandles ? "Loading candles..." : candleError}</p>
                  {(route?.candidates ?? []).slice(0, 4).map((candidate) => {
                    const maxCost = Math.max(
                      ...(route?.candidates ?? [candidate]).map((item) => item.expectedCostUsd),
                      1,
                    );
                    return (
                      <div key={candidate.venue} className={styles.routeChartRow}>
                        <span>{venueLabels[candidate.venue]}</span>
                        <div>
                          <span
                            style={{
                              width: `${Math.max(8, (candidate.expectedCostUsd / maxCost) * 100)}%`,
                            }}
                          />
                        </div>
                        <strong>{formatUsd(candidate.expectedCostUsd)}</strong>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className={styles.fallbackGrid}>
                <div>
                  <span>Best Venue</span>
                  <strong>{route ? venueLabels[route.venue] : "--"}</strong>
                </div>
                <div>
                  <span>Expected Cost</span>
                  <strong>{formatUsd(route?.expectedCostUsd)}</strong>
                </div>
                <div>
                  <span>Funding</span>
                  <strong>{formatPercent(funding.funding)}</strong>
                </div>
                <div>
                  <span>Borrow</span>
                  <strong>{formatPercent(funding.borrow)}</strong>
                </div>
              </div>
            </div>
          </section>

          <aside className={styles.ticket} aria-label="Trade ticket">
            <div className={styles.panelHeader}>
              <h3>Trade</h3>
              <span>{route?.venue ? venueLabels[route.venue] : "ROUTE"}</span>
            </div>
            <div className={styles.sideSwitch}>
              <button
                type="button"
                className={side === "long" ? styles.sideActive : ""}
                onClick={() => setSide("long")}
              >
                Long
              </button>
              <button
                type="button"
                className={side === "short" ? styles.sideActive : ""}
                onClick={() => setSide("short")}
              >
                Short
              </button>
            </div>
            <label className={styles.field}>
              <span>Collateral</span>
              <input
                value={collateral}
                onChange={(event) => setCollateral(event.target.value)}
                inputMode="decimal"
                aria-label="Collateral in USDC"
              />
              <small>USDC</small>
            </label>
            <label className={styles.rangeField}>
              <span>Leverage {leverage}x</span>
              <input
                type="range"
                min="1"
                max="25"
                step="1"
                value={leverage}
                onChange={(event) => setLeverage(Number(event.target.value))}
              />
            </label>
            <label className={styles.rangeField}>
              <span>Hold {holdHours}h</span>
              <input
                type="range"
                min="1"
                max="72"
                step="1"
                value={holdHours}
                onChange={(event) => setHoldHours(Number(event.target.value))}
              />
            </label>
            <div className={styles.ticketSummary}>
              <div>
                <span>Position</span>
                <strong>{formatUsd(notional)}</strong>
              </div>
              <div>
                <span>Cost</span>
                <strong>{loadingRoute ? "..." : formatUsd(route?.expectedCostUsd)}</strong>
              </div>
              <div>
                <span>Liq Risk</span>
                <strong>
                  {route ? formatPercent(route.costBreakdown.pLiq * 100, 3) : "--"}
                </strong>
              </div>
            </div>
            {routeError ? <p className={styles.error}>{routeError}</p> : null}
            <button className={styles.submitButton} type="button" disabled>
              {orderBotHealthy ? "Connect Imperial" : "Read-only preview"}
            </button>
          </aside>
        </section>

        <section className={styles.detailGrid} aria-label="Route details">
          <div className={styles.routePanel}>
            <div className={styles.panelHeader}>
              <h3>Route</h3>
              <span>{route?.clamped ? "CLAMPED" : "BEST"}</span>
            </div>
            <p>{route?.reason ?? (marketError || "Imperial route preview loading.")}</p>
            <div className={styles.candidateList}>
              {(route?.candidates ?? []).slice(0, 4).map((candidate) => (
                <div key={candidate.venue} className={styles.candidateRow}>
                  <span>{venueLabels[candidate.venue]}</span>
                  <strong>{formatUsd(candidate.expectedCostUsd)}</strong>
                  <small>{formatNumber(candidate.maxLeverage, { maximumFractionDigits: 1 })}x max</small>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.positionsPanel}>
            <div className={styles.panelHeader}>
              <h3>Positions</h3>
              <span>{connected ? "WALLET" : "OFF"}</span>
            </div>
            <div className={styles.emptyState}>
              <span>No open perps positions</span>
              <strong>{connected ? "Profile 0" : "Connect wallet"}</strong>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
