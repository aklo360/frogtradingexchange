import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { generateAuthorizationSignature } from "@privy-io/node";

import { getTitanConfig, type Env } from "./env";
import { getPlatformFeeConfig } from "./fees";
import { fetchWalletsNftHoldings } from "./nftHoldings";
import {
  readRobinhoodAlphaStoreRequest,
  writeRobinhoodAlphaStoreRequest,
} from "./robinhoodAlpha";
import { postQuotes, postSwap } from "./routes";
import {
  authorizeTradingBotRequest,
  resolveTradingBotToken,
} from "./tradingBotAuth";

export { authorizeTradingBotRequest } from "./tradingBotAuth";

const DEFAULT_PRIVY_API_BASE_URL = "https://api.privy.io/v1";
const DEFAULT_IMPERIAL_API_BASE_URL = "https://api.imperial.space";
const IMPERIAL_REFERRER_USERNAME = "sbf";
const DEFAULT_JUPITER_PRICE_API_URL = "https://api.jup.ag/price/v3";
const DEFAULT_JUPITER_TOKENS_API_URL = "https://api.jup.ag/tokens/v2/recent";
const SOLANA_MAINNET_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TELEGRAM_USER_ID_PATTERN = /^\d{1,32}$/;
const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
// Ribbot exposes one fixed Delta Neutral / Routed Arb beta contract.
const DELTA_NEUTRAL_STRATEGY = "delta_neutral";
const DELTA_NEUTRAL_PRESET = "low";
const DELTA_NEUTRAL_PROFILE_INDEX = 1;
const DELTA_NEUTRAL_MINIMUM_PROFILE_USDC = 50;
const IMPERIAL_PROFILE_REQUEST_TIMEOUT_MS = 5_000;
const DELTA_NEUTRAL_DAILY_BUDGET_USD = 5;
const DELTA_NEUTRAL_LIVE_ENTRY_CAP_USD = 60;
const DELTA_NEUTRAL_MAX_CYCLES = 1;
const DELTA_NEUTRAL_WAIT_SECONDS = 5;
const DELTA_NEUTRAL_RETRY_UNTIL_CLEAN_SECONDS = 600;
const DELTA_NEUTRAL_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:_-]{8,128}$/;
const PUMP_FUN_BONDING_CURVE_PROGRAM_ID =
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const MAX_TRADING_BOT_TOKEN_LIST = 250;
const CONTROL_CODE_TTL_MS = 10 * 60 * 1000;
const CONTROL_SESSION_TTL_MS = 30 * 60 * 1000;
const CONTROL_CODE_LENGTH = 12;
const CONTROL_SESSION_TOKEN_LENGTH = 32;
const CONTROL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CONTROL_CODE_PATTERN = /^[A-Z2-9]{12}$/;
const CONTROL_SESSION_TOKEN_PATTERN = /^[A-Z2-9]{32}$/;
const TRADING_BOT_EXECUTION_REFERENCE_PATTERN = /^[A-Za-z0-9:_-]{1,64}$/;
const TRADING_BOT_ORDER_ID_PATTERN = /^[A-Za-z0-9:_-]{1,64}$/;
const TRADING_BOT_ADVANCED_CONFIG_ID_PATTERN = /^[A-Za-z0-9:_-]{1,64}$/;
const TRADING_BOT_ORDER_STORE_NAME = "__ribbot_trading_orders__";
const DEFAULT_TRADING_BOT_SCHEDULER_MAX_ORDERS = 25;
const DEFAULT_TRADING_BOT_SCHEDULER_RECONCILE_AFTER_SECONDS = 60;
const DEFAULT_TRADING_BOT_ADVANCED_MONITOR_MAX_CONFIGS = 25;
const DEFAULT_TRADING_BOT_ADVANCED_RECONCILE_AFTER_SECONDS = 60;
const DEFAULT_TRADING_BOT_MANUAL_REVIEW_AFTER_SECONDS = 15 * 60;
const DEFAULT_TRADING_BOT_MANUAL_REVIEW_LIMIT = 50;
const DEFAULT_TRADING_BOT_PNL_RECONCILE_MAX_FILLS = 12;
const DEFAULT_TRADING_BOT_SNIPER_COOLDOWN_SECONDS = 60;
const TRADING_BOT_PRESET_MIN_COUNT = 2;
const TRADING_BOT_PRESET_MAX_COUNT = 4;
const TRADING_BOT_SELL_PROTECTION_BPS = 7_500;
const DEFAULT_TRADING_BOT_BUY_PRESET_AMOUNTS_IN = [
  "100000000",
  "250000000",
  "500000000",
  "1000000000",
];
const DEFAULT_TRADING_BOT_SELL_PRESET_BPS = [2_500, 5_000, 7_500, 10_000];
const MAX_TRADING_BOT_SNIPER_PROCESSED_MINTS = 100;
const TOKEN_CLEANUP_DUST_USD_THRESHOLD = 1;
const TOKEN_CLEANUP_MAX_CANDIDATES = 50;
const REFERRAL_CODE_PATTERN = /^[A-Z2-9]{6,16}$/;
const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REFERRAL_CODE_LENGTH = 8;
const SPOT_NFT_WALLET_LABEL = "Spot & NFT Wallet (Privy)";
const PORTFOLIO_WALLET_LABEL = "Portfolio Wallet (Read only)";

const json = (data: unknown, init?: ResponseInit) => Response.json(data, init);

type PrivyLinkedAccount = {
  type?: string;
  id?: string;
  address?: string;
  chain_type?: string;
  wallet_index?: number | null;
  walletIndex?: number | null;
  wallet_client_type?: string;
  walletClientType?: string;
  walletClient?: string;
};

type PrivyUser = {
  id: string;
  linked_accounts?: PrivyLinkedAccount[];
};

type PrivyWallet = {
  id: string;
  address: string;
  chain_type: string;
  additional_signers?: Array<{
    signer_id: string;
    override_policy_ids?: string[];
  }>;
};

type TradingBotWalletBody = {
  telegramUserId?: unknown;
  username?: unknown;
  externalAddress?: unknown;
  action?: unknown;
  walletId?: unknown;
};

type TradingBotSwapBody = {
  telegramUserId?: unknown;
  userPublicKey?: unknown;
  inMint?: unknown;
  outMint?: unknown;
  amountIn?: unknown;
  slippageBps?: unknown;
  priorityFee?: unknown;
};

type TradingBotExecutionBody = TradingBotSwapBody & {
  orderId?: unknown;
  executionMode?: unknown;
};

type TradingBotExecutionStatusBody = TradingBotExecutionBody;

type TradingBotDeltaNeutralBody = {
  telegramUserId?: unknown;
  idempotencyKey?: unknown;
  confirmLive?: unknown;
};

type TradingBotPositionsBody = {
  telegramUserId?: unknown;
  userPublicKey?: unknown;
};

type TradingBotTokenCleanupReviewBody = TradingBotPositionsBody & {
  hiddenTokens?: unknown;
  dustUsdThreshold?: unknown;
};

type TradingBotTokenSafetyBody = {
  telegramUserId?: unknown;
  mint?: unknown;
};

type TradingBotMarketRiskBody = TradingBotTokenSafetyBody & {
  userPublicKey?: unknown;
  amountIn?: unknown;
  slippageBps?: unknown;
  priorityFee?: unknown;
  priorityFeeLamports?: unknown;
  minLiquidityUsd?: unknown;
  maxMarketCapUsd?: unknown;
  maxPriceImpactBps?: unknown;
};

type TradingBotPnlBody = {
  telegramUserId?: unknown;
};

type TradingBotReferralBody = {
  telegramUserId?: unknown;
  username?: unknown;
  referralCode?: unknown;
};

type TradingBotOrderKind = "limit" | "dca" | "stop" | "trailing";
type TradingBotOrderSide = "buy" | "sell";
type TriggerDirection = "above" | "below";

type TradingBotOrderValidationBody = {
  telegramUserId?: unknown;
  userPublicKey?: unknown;
  kind?: unknown;
  side?: unknown;
  mint?: unknown;
  inMint?: unknown;
  outMint?: unknown;
  amountIn?: unknown;
  amountLabel?: unknown;
  slippageBps?: unknown;
  priorityFee?: unknown;
  priorityFeeLamports?: unknown;
  triggerPrice?: unknown;
  triggerDirection?: unknown;
  orderCount?: unknown;
  intervalMinutes?: unknown;
  trailingBps?: unknown;
};

type TradingBotWithdrawalValidationBody = {
  telegramUserId?: unknown;
  userPublicKey?: unknown;
  mint?: unknown;
  amountIn?: unknown;
  amountLabel?: unknown;
  destinationAddress?: unknown;
};

type TradingBotWithdrawalExecutionBody = TradingBotWithdrawalValidationBody & {
  withdrawalId?: unknown;
};

type TradingBotWithdrawalExecutionStatusBody =
  TradingBotWithdrawalExecutionBody;

type TradingBotCopyTradeValidationBody = {
  telegramUserId?: unknown;
  userPublicKey?: unknown;
  tag?: unknown;
  targetWallet?: unknown;
  buyMode?: unknown;
  buyPercentageBps?: unknown;
  maxBuyAmountIn?: unknown;
  amountLabel?: unknown;
  slippageBps?: unknown;
  priorityFee?: unknown;
  priorityFeeLamports?: unknown;
  sellPriorityFee?: unknown;
  sellPriorityFeeLamports?: unknown;
  copySells?: unknown;
  duplicateBuys?: unknown;
  onlyRenounced?: unknown;
  excludePumpFunTokens?: unknown;
  minTargetBuyAmountIn?: unknown;
  minLiquidityUsd?: unknown;
  minMarketCapUsd?: unknown;
  maxMarketCapUsd?: unknown;
  blacklistMints?: unknown;
};

type TradingBotCopyTradeUpdateBody = TradingBotCopyTradeValidationBody & {
  configId?: unknown;
};

type TradingBotCopyTradeDuplicateBody = {
  telegramUserId?: unknown;
  configId?: unknown;
  tag?: unknown;
};

type TradingBotCopyTradeBuyMode = "fixed" | "percentage";

type TradingBotSniperSource = "any" | "pump" | "raydium" | "moonshot";

type TradingBotSniperValidationBody = {
  telegramUserId?: unknown;
  userPublicKey?: unknown;
  source?: unknown;
  maxBuyAmountIn?: unknown;
  amountLabel?: unknown;
  slippageBps?: unknown;
  priorityFee?: unknown;
  priorityFeeLamports?: unknown;
  minLiquidityUsd?: unknown;
  maxMarketCapUsd?: unknown;
  maxSnipes?: unknown;
};

type TradingBotAutoBuyValidationBody = {
  telegramUserId?: unknown;
  userPublicKey?: unknown;
  mint?: unknown;
  maxBuyAmountIn?: unknown;
  amountLabel?: unknown;
  slippageBps?: unknown;
  priorityFee?: unknown;
  priorityFeeLamports?: unknown;
  minLiquidityUsd?: unknown;
  maxMarketCapUsd?: unknown;
};

type TradingBotBundleBuyItemBody = {
  mint?: unknown;
  maxBuyAmountIn?: unknown;
  amountLabel?: unknown;
};

type TradingBotBundleBuyValidationBody = {
  telegramUserId?: unknown;
  userPublicKey?: unknown;
  items?: unknown;
  amountLabel?: unknown;
  slippageBps?: unknown;
  priorityFee?: unknown;
  priorityFeeLamports?: unknown;
  minLiquidityUsd?: unknown;
  maxMarketCapUsd?: unknown;
};

type TradingBotBundleBuyExecutionBody = {
  telegramUserId?: unknown;
  userPublicKey?: unknown;
  configId?: unknown;
};

type TradingBotAdvancedAutomationStatusBody = TradingBotBundleBuyExecutionBody;

type TradingBotAdvancedAutomationControlBody = {
  telegramUserId?: unknown;
  configId?: unknown;
  action?: unknown;
};

type TradingBotAutoSellValidationBody = {
  telegramUserId?: unknown;
  userPublicKey?: unknown;
  mint?: unknown;
  sellBps?: unknown;
  amountLabel?: unknown;
  slippageBps?: unknown;
  priorityFee?: unknown;
  priorityFeeLamports?: unknown;
  triggerPrice?: unknown;
  triggerDirection?: unknown;
};

type TradingBotPreferenceKind = "settings" | "watchlist" | "hiddenToken";
type TradingBotPreferenceAction = "set" | "add" | "remove";
type TradingBotMode = "simple" | "advanced";

type TradingBotPreferenceValidationBody = {
  telegramUserId?: unknown;
  userPublicKey?: unknown;
  kind?: unknown;
  action?: unknown;
  mint?: unknown;
  slippageBps?: unknown;
  priorityFee?: unknown;
  priorityFeeLamports?: unknown;
  sellPriorityFee?: unknown;
  sellPriorityFeeLamports?: unknown;
  defaultBuyAmountIn?: unknown;
  buyPresetAmountsIn?: unknown;
  sellPresetBps?: unknown;
  botMode?: unknown;
  confirmTrades?: unknown;
  sellProtection?: unknown;
  autoBuyEnabled?: unknown;
  instantAutoBuyEnabled?: unknown;
  instantAutoBuyAmountIn?: unknown;
  instantAutoBuyMinLiquidityUsd?: unknown;
  instantAutoBuyMaxMarketCapUsd?: unknown;
  autoSellEnabled?: unknown;
  sniperEnabled?: unknown;
  mevProtection?: unknown;
};

type TradingBotAccountWalletBody = {
  telegramUserId?: unknown;
  username?: unknown;
  walletSource?: unknown;
  privyUserId?: unknown;
  privyWalletId?: unknown;
  solanaWalletAddress?: unknown;
};

type TradingBotAccountWalletSyncBody = {
  telegramUserId?: unknown;
  username?: unknown;
  privyUserId?: unknown;
  wallets?: unknown;
};

type TradingBotAccountWalletSelectBody = {
  telegramUserId?: unknown;
  walletId?: unknown;
};

type TradingBotControlCodeBody = {
  telegramUserId?: unknown;
  username?: unknown;
};

type TradingBotSetupResetBody = {
  telegramUserId?: unknown;
};

type TradingBotControlSessionBody = {
  telegramUserId?: unknown;
  code?: unknown;
};

type TradingBotControlImperialBody = {
  telegramUserId?: unknown;
  sessionToken?: unknown;
  wallet?: unknown;
  message?: unknown;
  signature?: unknown;
};

type TradingBotControlPreferenceBody = TradingBotPreferenceValidationBody & {
  sessionToken?: unknown;
};

type TradingBotControlWalletAction =
  | "claim"
  | "export"
  | "revoke"
  | "restore"
  | "verify_signer";

type TradingBotControlWalletBody = {
  telegramUserId?: unknown;
  sessionToken?: unknown;
  action?: unknown;
  userPublicKey?: unknown;
  claimUrl?: unknown;
};

type TradingBotOperatorReviewBody = {
  caseId?: unknown;
  note?: unknown;
};

type NormalizedTradingBotOrder = {
  telegramUserId: string;
  userPublicKey: string;
  kind: TradingBotOrderKind;
  side: TradingBotOrderSide;
  mint: string;
  inMint: string;
  outMint: string;
  amountIn: string;
  amountLabel?: string;
  slippageBps: number;
  priorityFee: number;
  triggerPrice?: string;
  triggerDirection?: TriggerDirection;
  orderCount?: number;
  intervalMinutes?: number;
  perOrderAmountIn?: string;
  trailingBps?: number;
};

type TradingBotStoredAutomationOrderStatus =
  | "staged"
  | "executing"
  | "executed"
  | "failed"
  | "cancelled";

type TradingBotAutomationOrderSchedulerState = {
  lastCheckedAt?: string;
  lastPriceUsd?: number;
  peakPriceUsd?: number;
  nextRunAt?: string;
  executedCount?: number;
  dryRunTriggerCount?: number;
  lastTriggerAt?: string;
  lastTriggerReason?: string;
  lastError?: string;
  executionId?: string;
  executionStartedAt?: string;
  executionCompletedAt?: string;
  executionSignature?: string;
  executionTransactionId?: string;
  executionReferenceId?: string;
  executionSolscanUrl?: string;
  reconciliationCheckedAt?: string;
  reconciliationStatus?: PrivyTransactionStatus | "not_found" | "error";
  manualReviewAfter?: string;
  manualReviewRequiredAt?: string;
  manualReviewReason?: string;
};

type TradingBotAutomationOrderUpdateExpectation = {
  status: TradingBotStoredAutomationOrderStatus;
  executionId?: string;
};

type TradingBotStoredAutomationOrderSnapshot = {
  telegramUserId: string;
  orderId: string;
  kind: TradingBotOrderKind;
  side: TradingBotOrderSide;
  status: TradingBotStoredAutomationOrderStatus;
  mint: string;
  inMint: string;
  outMint: string;
  amountIn: string;
  amountLabel?: string;
  walletAddress: string;
  slippageBps: number;
  priorityFee: number;
  triggerPrice?: string;
  triggerDirection?: TriggerDirection;
  orderCount?: number;
  intervalMinutes?: number;
  perOrderAmountIn?: string;
  trailingBps?: number;
  createdAt: string;
  updatedAt: string;
  validation: {
    validatedAt: string;
    warnings: string[];
  };
  scheduler: TradingBotAutomationOrderSchedulerState;
};

type NormalizedTradingBotSwap = {
  telegramUserId: string;
  userPublicKey: string;
  inMint: string;
  outMint: string;
  amountIn: string;
  slippageBps: number;
  priorityFee: number;
};

type NormalizedTradingBotExecution = NormalizedTradingBotSwap & {
  orderId: string;
  executionMode?: "instant_auto_buy";
};

type NormalizedTradingBotWithdrawal = {
  telegramUserId: string;
  userPublicKey: string;
  mint: string;
  amountIn: string;
  amountLabel?: string;
  destinationAddress: string;
  assetType: "sol" | "spl";
};

type NormalizedTradingBotWithdrawalExecution =
  NormalizedTradingBotWithdrawal & {
    withdrawalId: string;
  };

type NormalizedTradingBotCopyTrade = {
  telegramUserId: string;
  userPublicKey: string;
  tag?: string;
  targetWallet: string;
  buyMode: TradingBotCopyTradeBuyMode;
  buyPercentageBps: number;
  maxBuyAmountIn: string;
  amountLabel?: string;
  slippageBps: number;
  priorityFee: number;
  sellPriorityFee: number;
  copySells: boolean;
  duplicateBuys: boolean;
  onlyRenounced: boolean;
  excludePumpFunTokens: boolean;
  minTargetBuyAmountIn?: string;
  minLiquidityUsd: number;
  minMarketCapUsd?: number;
  maxMarketCapUsd?: number;
  blacklistMints: string[];
};

type NormalizedTradingBotSniper = {
  telegramUserId: string;
  userPublicKey: string;
  source: TradingBotSniperSource;
  maxBuyAmountIn: string;
  amountLabel?: string;
  slippageBps: number;
  priorityFee: number;
  minLiquidityUsd: number;
  maxMarketCapUsd?: number;
  maxSnipes: number;
};

type NormalizedTradingBotAutoBuy = {
  telegramUserId: string;
  userPublicKey: string;
  mint: string;
  maxBuyAmountIn: string;
  amountLabel?: string;
  slippageBps: number;
  priorityFee: number;
  minLiquidityUsd: number;
  maxMarketCapUsd?: number;
};

type NormalizedTradingBotBundleBuyItem = {
  mint: string;
  maxBuyAmountIn: string;
  amountLabel?: string;
};

type NormalizedTradingBotBundleBuy = {
  telegramUserId: string;
  userPublicKey: string;
  items: NormalizedTradingBotBundleBuyItem[];
  maxBuyAmountIn: string;
  amountLabel?: string;
  slippageBps: number;
  priorityFee: number;
  minLiquidityUsd: number;
  maxMarketCapUsd?: number;
};

type NormalizedTradingBotBundleBuyExecution = {
  telegramUserId: string;
  userPublicKey: string;
  configId: string;
};

type NormalizedTradingBotAutoSell = {
  telegramUserId: string;
  userPublicKey: string;
  mint: string;
  sellBps: number;
  amountLabel?: string;
  slippageBps: number;
  priorityFee: number;
  triggerPrice?: string;
  triggerDirection?: TriggerDirection;
};

type NormalizedTradingBotAdvancedAutomationConfig =
  | NormalizedTradingBotCopyTrade
  | NormalizedTradingBotSniper
  | NormalizedTradingBotAutoBuy
  | NormalizedTradingBotBundleBuy
  | NormalizedTradingBotAutoSell;

type TradingBotAdvancedAutomationKind =
  | "copytrade"
  | "sniper"
  | "auto_buy"
  | "bundle_buy"
  | "auto_sell";
type TradingBotStoredAdvancedAutomationConfigStatus =
  | "staged"
  | "paused"
  | "executing"
  | "failed"
  | "cancelled"
  | "executed";

type TradingBotAdvancedAutomationMonitorState = {
  lastCheckedAt?: string;
  lastMatchedAt?: string;
  lastObservedSignature?: string;
  lastObservedMint?: string;
  lastPriceUsd?: number;
  lastTriggerAt?: string;
  lastTriggerReason?: string;
  matchCount?: number;
  executedCount?: number;
  dryRunTriggerCount?: number;
  executionStartedAt?: string;
  executionCompletedAt?: string;
  executionId?: string;
  executionReferenceId?: string;
  executionSignature?: string;
  executionTransactionId?: string;
  executionSolscanUrl?: string;
  executionAmountIn?: string;
  executionMint?: string;
  executionSide?: "buy" | "sell";
  reconciliationCheckedAt?: string;
  reconciliationStatus?: PrivyTransactionStatus | "not_found" | "error";
  manualReviewAfter?: string;
  manualReviewRequiredAt?: string;
  manualReviewReason?: string;
  launchCursorAt?: string;
  launchCursorId?: string;
  launchpad?: string;
  launchName?: string;
  launchSymbol?: string;
  launchLiquidityUsd?: number;
  launchMarketCapUsd?: number;
  launchOrganicScore?: number;
  processedMints?: string[];
  bundleAttemptedItems?: number;
  bundleConfirmedItems?: number;
  lastError?: string;
};

type TradingBotAdvancedAutomationUpdateExpectation = {
  status: TradingBotStoredAdvancedAutomationConfigStatus;
  executionId?: string;
};

type TradingBotStoredAdvancedAutomationConfigSnapshot = {
  telegramUserId: string;
  configId: string;
  kind: TradingBotAdvancedAutomationKind;
  status: TradingBotStoredAdvancedAutomationConfigStatus;
  walletAddress: string;
  mint?: string;
  tag?: string;
  targetWallet?: string;
  buyMode?: TradingBotCopyTradeBuyMode;
  buyPercentageBps?: number;
  source?: TradingBotSniperSource;
  maxBuyAmountIn: string;
  amountLabel?: string;
  slippageBps: number;
  priorityFee: number;
  sellPriorityFee?: number;
  copySells?: boolean;
  duplicateBuys?: boolean;
  onlyRenounced?: boolean;
  excludePumpFunTokens?: boolean;
  minTargetBuyAmountIn?: string;
  minLiquidityUsd: number;
  minMarketCapUsd?: number;
  maxMarketCapUsd?: number;
  blacklistMints?: string[];
  maxSnipes?: number;
  bundleItems?: NormalizedTradingBotBundleBuyItem[];
  sellBps?: number;
  triggerPrice?: string;
  triggerDirection?: TriggerDirection;
  createdAt: string;
  updatedAt: string;
  validation: {
    validatedAt: string;
    warnings: string[];
  };
  monitor: TradingBotAdvancedAutomationMonitorState;
};

type NormalizedTradingBotPreference = {
  telegramUserId: string;
  userPublicKey?: string;
  kind: TradingBotPreferenceKind;
  action: TradingBotPreferenceAction;
  mint?: string;
  settings?: {
    slippageBps?: number;
    priorityFee: number;
    sellPriorityFee?: number;
    defaultBuyAmountIn?: string;
    buyPresetAmountsIn?: string[];
    sellPresetBps?: number[];
    botMode?: TradingBotMode;
    confirmTrades?: boolean;
    sellProtection?: boolean;
    autoBuyEnabled?: boolean;
    instantAutoBuyEnabled?: boolean;
    instantAutoBuyAmountIn?: string;
    instantAutoBuyMinLiquidityUsd?: number;
    instantAutoBuyMaxMarketCapUsd?: number;
    autoSellEnabled?: boolean;
    sniperEnabled?: boolean;
    mevProtection?: boolean;
  };
};

type TradingBotStoredSettings = {
  slippageBps: number;
  priorityFee: number;
  sellPriorityFee: number;
  defaultBuyAmountIn: string;
  buyPresetAmountsIn: string[];
  sellPresetBps: number[];
  botMode: TradingBotMode;
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

type TradingBotAccountSnapshot = {
  telegramUserId: string;
  username?: string;
  walletSource?: "privy" | "external";
  privyUserId?: string;
  privyWalletId?: string;
  solanaWalletAddress?: string;
  activeWalletId?: string;
  wallets: TradingBotAccountWalletSlot[];
  walletClaimRequestedAt?: string;
  walletExportRequestedAt?: string;
  botAccessRevokedAt?: string;
  settings: TradingBotStoredSettings;
  watchlist: string[];
  hiddenTokens: string[];
  referralCode?: string;
  referredByCode?: string;
  referredByTelegramUserId?: string;
  createdAt: string;
  updatedAt: string;
};

type TradingBotSetupStatus = {
  walletReady: boolean;
  automationSignerReady: boolean;
  imperialConnected: boolean;
  botAccessEnabled: boolean;
  complete: boolean;
};

type TradingBotAccountWalletSlot = {
  walletId: string;
  label: string;
  role: TradingBotWalletRole;
  walletSource: "privy" | "external";
  privyUserId?: string;
  privyWalletId?: string;
  solanaWalletAddress: string;
  createdAt: string;
};

type TradingBotWalletRole = "spot_nft" | "portfolio";

type TradingBotAccountRow = {
  telegram_user_id: string;
  username: string | null;
  wallet_source: string | null;
  privy_user_id: string | null;
  privy_wallet_id: string | null;
  solana_wallet_address: string | null;
  active_wallet_id: string | null;
  wallets_json: string;
  wallet_claim_requested_at: string | null;
  wallet_export_requested_at: string | null;
  bot_access_revoked_at: string | null;
  settings_json: string;
  watchlist_json: string;
  hidden_tokens_json: string;
  referral_code: string | null;
  referred_by_code: string | null;
  referred_by_telegram_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type TradingBotReferralSummary = {
  telegramUserId: string;
  referralCode: string;
  referredByCode?: string;
  referredByTelegramUserId?: string;
  referredUsers: number;
  rewardStatus: "tracking_only";
  claimableRewards: [];
  updatedAt: string;
  warnings: string[];
};

type TradingBotControlCodeRow = {
  telegram_user_id: string;
  code_hash: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

type TradingBotControlSessionRow = {
  telegram_user_id: string;
  session_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  last_used_at: string;
};

type TradingBotImperialSessionRow = {
  telegram_user_id: string;
  wallet_address: string;
  jwt: string;
  expires_at: number;
  connected_at: string;
  updated_at: string;
  referrer_username: string | null;
  profile_address: string | null;
  profile_usdc_native: number | null;
  profile_synced_at: string | null;
};

type TradingBotImperialConnection = {
  status: "connected";
  authorityWalletAddress: string;
  profileAddress: string | null;
  profileIndex: typeof DELTA_NEUTRAL_PROFILE_INDEX;
  expiresAt: number;
  connectedAt: string;
  referrerUsername: typeof IMPERIAL_REFERRER_USERNAME;
};

type TradingBotDeltaNeutralRunRow = {
  telegram_user_id: string;
  run_id: string;
  idempotency_key: string;
  wallet_address: string;
  status: string;
  service_status_json: string;
  created_at: string;
  updated_at: string;
};

type DeltaNeutralServiceRunStatus = {
  strategy: typeof DELTA_NEUTRAL_STRATEGY;
  preset: typeof DELTA_NEUTRAL_PRESET;
  wallet: string;
  runId: string | null;
  launching: boolean;
  running: boolean;
  stopRequested: boolean;
  completedCycles: number;
  maxCycles: number;
  dailyBudgetUsd: number;
  estimatedRunCostUsd: number;
  completedVolumeUsd: number;
  startedAtUnix: number | null;
  stoppedAtUnix: number | null;
  lastMessage: string | null;
  failed: boolean;
};

type DeltaNeutralServicePreview = {
  strategy: typeof DELTA_NEUTRAL_STRATEGY;
  preset: typeof DELTA_NEUTRAL_PRESET;
  wallet: string;
  profileIndex: number;
  profileAddress: string | null;
  profileUsdc: number;
  minimumProfileUsdc: number;
  profileFunded: boolean;
  liveReady: boolean;
  liveEntryCapUsd: number;
  serviceLiveEntryCapUsd: number;
  entryCapCompatible: boolean;
  maxCycles: number;
  blockers: string[];
};

export type TradingBotPerpsWalletSnapshot = {
  telegramUserId: string;
  authorityWalletAddress: string;
  profileAddress: string | null;
  profileIndex: number;
  profileUsdc: number;
  minimumProfileUsdc: number;
  funded: boolean;
  fundingLocation: "imperial_profile";
  imperialProfileVerified: boolean;
  strategyReady: boolean;
  liveExecutionEnabled: boolean;
  blockers: string[];
};

export type TradingBotProfilePerpsWalletSnapshot = Pick<
  TradingBotPerpsWalletSnapshot,
  | "telegramUserId"
  | "authorityWalletAddress"
  | "profileAddress"
  | "profileIndex"
  | "profileUsdc"
  | "minimumProfileUsdc"
  | "funded"
  | "fundingLocation"
  | "imperialProfileVerified"
> & {
  balanceStatus: "live" | "cached";
  balanceUpdatedAt: string;
};

type TradingBotPerpsWalletResolution =
  | { snapshot: TradingBotPerpsWalletSnapshot }
  | { error: string; status: number };

type TradingBotProfilePerpsWalletResolution =
  | { snapshot: TradingBotProfilePerpsWalletSnapshot }
  | { error: string; status: number };

type ImperialReferralAttributionResult =
  | { referrerUsername: typeof IMPERIAL_REFERRER_USERNAME }
  | { error: string; status: number };

type ImperialReferralLookupResult =
  | { referrerUsername: string | null }
  | { error: string; status: number };

async function getImperialReferrerUsername(
  wallet: string,
  fetcher: typeof fetch,
): Promise<ImperialReferralLookupResult> {
  try {
    const response = await fetcher(
      `${DEFAULT_IMPERIAL_API_BASE_URL}/api/v1/profile/${encodeURIComponent(wallet)}/stats?period=ALL`,
      { headers: { Accept: "application/json" } },
    );
    const data = (await response.json().catch(() => null)) as unknown;
    if (
      !response.ok ||
      !data ||
      typeof data !== "object" ||
      Array.isArray(data)
    ) {
      return {
        error: "Imperial referral verification is temporarily unavailable",
        status: 502,
      };
    }

    const referredBy = (data as Record<string, unknown>).referredBy;
    if (referredBy === null || referredBy === undefined) {
      return { referrerUsername: null };
    }

    const referrerUsername =
      stringValue(referredBy) ??
      (typeof referredBy === "object" && !Array.isArray(referredBy)
        ? stringValue(
            (referredBy as Record<string, unknown>).username,
          )
        : undefined);
    if (!referrerUsername) {
      return {
        error: "Imperial returned invalid referral information",
        status: 502,
      };
    }
    return { referrerUsername };
  } catch {
    return {
      error: "Imperial referral verification is temporarily unavailable",
      status: 502,
    };
  }
}

function verifyImperialSbfReferrer(
  lookup: ImperialReferralLookupResult,
): ImperialReferralAttributionResult | null {
  if ("error" in lookup) return lookup;
  if (!lookup.referrerUsername) return null;
  if (
    lookup.referrerUsername.toLowerCase() ===
    IMPERIAL_REFERRER_USERNAME
  ) {
    return { referrerUsername: IMPERIAL_REFERRER_USERNAME };
  }
  return {
    error: "This Imperial account already uses a different referral",
    status: 409,
  };
}

export async function ensureImperialSbfReferral(
  wallet: string,
  fetcher: typeof fetch = fetch,
): Promise<ImperialReferralAttributionResult> {
  const currentLookup = await getImperialReferrerUsername(wallet, fetcher);
  const currentAttribution = verifyImperialSbfReferrer(currentLookup);
  if (currentAttribution) return currentAttribution;

  let referralResponse: Response;
  try {
    referralResponse = await fetcher(
      `${DEFAULT_IMPERIAL_API_BASE_URL}/api/v1/passthrough/referrals`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refereeWallet: wallet,
          referrerUsername: IMPERIAL_REFERRER_USERNAME,
        }),
      },
    );
  } catch {
    return {
      error: "Imperial referral setup is temporarily unavailable",
      status: 502,
    };
  }

  const verifiedLookup = await getImperialReferrerUsername(wallet, fetcher);
  const verifiedAttribution = verifyImperialSbfReferrer(verifiedLookup);
  if (verifiedAttribution) return verifiedAttribution;

  if (!referralResponse.ok) {
    const data = (await referralResponse.json().catch(() => null)) as unknown;
    const detail =
      data && typeof data === "object" && !Array.isArray(data)
        ? stringValue((data as Record<string, unknown>).error) ??
          stringValue((data as Record<string, unknown>).message)
        : undefined;
    return {
      error: detail
        ? `Imperial rejected the SBF referral: ${detail.slice(0, 200)}`
        : "Imperial rejected the SBF referral",
      status: 502,
    };
  }

  return {
    error: "Imperial did not confirm the SBF referral",
    status: 502,
  };
}

type TradingBotAccountEventRow = {
  telegram_user_id: string;
  event_id: string;
  event_type: string;
  metadata_json: string;
  created_at: string;
};

type TradingBotAccountEventSnapshot = {
  telegramUserId: string;
  eventId: string;
  eventType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type TradingBotManualReviewCaseStatus = "open" | "acknowledged" | "resolved";
type TradingBotManualReviewCaseStatusFilter =
  | TradingBotManualReviewCaseStatus
  | "active"
  | "all";
type TradingBotManualReviewResolution = "executed" | "failed";

type TradingBotManualReviewCase = {
  caseId: string;
  telegramUserId: string;
  executionKind: string;
  resourceId: string;
  executionId: string;
  referenceId: string;
  executionStartedAt?: string;
  manualReviewAfter?: string;
  manualReviewRequiredAt: string;
  reason?: string;
  status: TradingBotManualReviewCaseStatus;
  acknowledgedAt?: string;
  operatorNote?: string;
  lastCheckedAt?: string;
  lastCheckStatus?: string;
  lastCheckError?: string;
  resolution?: TradingBotManualReviewResolution;
  providerStatus?: string;
  signature?: string;
  transactionId?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type TradingBotManualReviewEvidence = {
  checkedAt: string;
  checkStatus: string;
  checkError?: string;
  resolution?: TradingBotManualReviewResolution;
  providerStatus?: string;
  signature?: string;
  transactionId?: string;
};

type TradingBotManualReviewCaseRow = {
  case_id: string;
  telegram_user_id: string;
  execution_kind: string;
  resource_id: string;
  execution_id: string;
  reference_id: string;
  execution_started_at: string | null;
  manual_review_after: string | null;
  manual_review_required_at: string;
  reason: string | null;
  status: string;
  acknowledged_at: string | null;
  operator_note: string | null;
  last_checked_at: string | null;
  last_check_status: string | null;
  last_check_error: string | null;
  resolution: string | null;
  provider_status: string | null;
  signature: string | null;
  transaction_id: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

type TradingBotActivitySummary = {
  totalEvents: number;
  latestEventAt?: string;
  eventTypes: Record<string, number>;
};

type TradingBotAutomationOrderRow = {
  telegram_user_id: string;
  order_id: string;
  kind: string;
  side: string;
  status: string;
  mint: string;
  in_mint: string;
  out_mint: string;
  amount_in: string;
  amount_label: string | null;
  wallet_address: string;
  slippage_bps: number;
  priority_fee: number;
  trigger_price: string | null;
  trigger_direction: string | null;
  order_count: number | null;
  interval_minutes: number | null;
  per_order_amount_in: string | null;
  trailing_bps: number | null;
  validation_json: string;
  scheduler_json: string;
  created_at: string;
  updated_at: string;
};

type TradingBotAdvancedAutomationConfigRow = {
  telegram_user_id: string;
  config_id: string;
  kind: string;
  status: string;
  wallet_address: string;
  mint: string | null;
  target_wallet: string | null;
  source: string | null;
  max_buy_amount_in: string;
  amount_label: string | null;
  slippage_bps: number;
  priority_fee: number;
  copy_sells: number | null;
  min_liquidity_usd: number;
  max_market_cap_usd: number | null;
  max_snipes: number | null;
  bundle_items_json: string | null;
  sell_bps: number | null;
  trigger_price: string | null;
  trigger_direction: string | null;
  strategy_json: string;
  validation_json: string;
  monitor_json: string;
  created_at: string;
  updated_at: string;
};

type RpcResponse<T> = {
  result?: T;
  error?: unknown;
};

type TokenAccountRpcResult = {
  value?: Array<{
    pubkey?: string;
    account?: {
      data?: {
        parsed?: {
          info?: {
            mint?: string;
            tokenAmount?: {
              amount?: string;
              decimals?: number;
              uiAmount?: number | null;
              uiAmountString?: string;
            };
          };
        };
      };
    };
  }>;
};

type ParsedTransactionTokenBalance = {
  accountIndex?: number;
  mint?: string;
  owner?: string;
  uiTokenAmount?: {
    amount?: string;
    decimals?: number;
    uiAmount?: number | null;
    uiAmountString?: string;
  };
};

type ParsedTransactionRpcResult = {
  slot?: number;
  blockTime?: number | null;
  transaction?: {
    message?: {
      accountKeys?: Array<
        | string
        | {
            pubkey?: string;
          }
      >;
    };
  };
  meta?: {
    err?: unknown;
    fee?: number;
    preBalances?: number[];
    postBalances?: number[];
    preTokenBalances?: ParsedTransactionTokenBalance[];
    postTokenBalances?: ParsedTransactionTokenBalance[];
  } | null;
};

type TradingBotConfirmedSwapFill = {
  amountSemantics: "wallet_asset_delta_excluding_network_fee";
  sourceEventId: string;
  signature: string;
  walletAddress: string;
  inMint: string;
  outMint: string;
  amountIn: string;
  amountOut: string;
  inputDecimals: number;
  outputDecimals: number;
  nativeDeltaLamports: string;
  networkFeeLamports: string;
  walletPaidNetworkFee: boolean;
  slot?: number;
  blockTime?: number;
  reconciledAt: string;
};

type TradingBotFillReconciliation = {
  events: TradingBotAccountEventSnapshot[];
  attemptedThisRequest: number;
  reconciledThisRequest: number;
};

type TradingBotPositionsSnapshot = {
  walletAddress: string;
  sol: {
    lamports: string;
    uiAmount: number;
  };
  tokens: Array<{
    mint: string;
    tokenAccount: string;
    amount: string;
    decimals: number;
    uiAmount?: number | null;
    uiAmountString: string;
  }>;
  generatedAt: string;
};

type AccountInfoRpcResult = {
  value?: unknown | null;
};

type LatestBlockhashRpcResult = {
  value?: {
    blockhash?: string;
  };
};

type SignatureInfoRpcResult = Array<{
  signature?: string;
  slot?: number;
  err?: unknown;
  memo?: string | null;
  blockTime?: number | null;
}>;

type TransferSourceTokenAccount = {
  pubkey: string;
  decimals: number;
  amount: bigint;
};

type PrivyConfig = {
  appId: string;
  appSecret: string;
  apiBaseUrl: string;
  authorizationKeyId?: string;
  authorizationPrivateKey?: string;
  walletPolicyIds: string[];
};

type TradingBotSwapBuildResult = {
  mode?: string;
  txBase64?: string | null;
  route?: unknown;
  meta?: Record<string, unknown>;
  error?: string;
};

type TradingBotQuoteBuildResult = {
  amountOut?: string;
  priceImpactBps?: number;
  routers?: unknown[];
  routeId?: string;
  provider?: string;
  executable?: boolean;
  error?: string;
};

type TradingBotWithdrawalBuildResult = {
  txBase64: string;
  recentBlockhash: string;
  sourceTokenAccount?: string;
  destinationTokenAccount?: string;
  createdDestinationTokenAccount?: boolean;
};

type JupiterPriceEntry = {
  usdPrice?: number;
  decimals?: number;
  priceChange24h?: number;
};

type JupiterRecentToken = {
  mint: string;
  name?: string;
  symbol?: string;
  launchpad?: string;
  liquidityUsd?: number;
  marketCapUsd?: number;
  usdPrice?: number;
  organicScore?: number;
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
  firstPoolId: string;
  firstPoolCreatedAt: string;
};

type TokenCleanupReason = "zero" | "dust" | "unpriced" | "hidden";
type TokenCleanupAction = "hide" | "sell";

type TokenSafetyFlagSeverity = "info" | "warning" | "danger";
type TokenSafetyRiskLevel = "low" | "medium" | "high" | "unknown";

type TokenSafetyFlag = {
  code: string;
  severity: TokenSafetyFlagSeverity;
  message: string;
};

type MintAccountParsedInfo = {
  mintAuthority?: string | null;
  supply?: string;
  decimals?: number;
  isInitialized?: boolean;
  freezeAuthority?: string | null;
};

type MintAccountInfoRpcResult = {
  result?: {
    value?: {
      owner?: string;
      executable?: boolean;
      lamports?: number;
      data?:
        | {
            parsed?: {
              type?: string;
              info?: MintAccountParsedInfo;
            };
          }
        | unknown[];
    } | null;
  };
};

type PrivySolanaSignAndSendResponse = {
  method?: string;
  data?: {
    hash?: string;
    signed_transaction?: string;
    caip2?: string;
    transaction_id?: string;
    reference_id?: string | null;
  };
};

export type ManagedPrivyWallet = {
  walletId: string;
  walletAddress: string;
  label: string;
};

export type ManagedSolanaExecution = {
  signature: string | null;
  transactionId: string | null;
  referenceId: string;
  caip2: string;
};

export type ManagedSolanaTransactionStatus = {
  walletId: string;
  status: PrivyTransactionStatus;
  signature: string | null;
  transactionId: string;
  referenceId: string;
  caip2: string;
};

export class PrivyWalletRpcError extends Error {
  constructor(
    readonly status: number,
    readonly kind: "authorization" | "transport" | "http" = "http",
    readonly providerCode: string | null = null,
  ) {
    super(
      kind === "http"
        ? `Privy wallet RPC failed with status ${status}${providerCode ? ` (${providerCode})` : ""}`
        : `Privy wallet RPC failed during ${kind}`,
    );
  }
}

const PRIVY_DEFINITE_NON_BROADCAST_CODES = new Set([
  "policy_violation",
  "insufficient_funds",
  "transaction_broadcast_failure",
  "missing_or_empty_authorization_header",
  "zero_correct_authorization_signatures",
  "insufficient_correct_authorization_signatures",
  "incorrect_quantity_of_authorization_signatures",
  "request_expired",
  "no_valid_user_session_keys",
  "user_session_keys_expired",
]);

export function privyRpcFailureWasNotBroadcast(
  error: PrivyWalletRpcError,
): boolean {
  if (
    error.providerCode &&
    PRIVY_DEFINITE_NON_BROADCAST_CODES.has(error.providerCode)
  ) {
    return true;
  }
  return (
    error.kind === "authorization" ||
    (error.kind === "http" &&
      error.status >= 400 &&
      error.status < 500 &&
      ![408, 409, 425, 429].includes(error.status))
  );
}

type PrivyTransactionStatus =
  | "broadcasted"
  | "confirmed"
  | "execution_reverted"
  | "failed"
  | "replaced"
  | "finalized"
  | "provider_error"
  | "pending";

type PrivyTransaction = {
  id: string;
  wallet_id: string;
  status: PrivyTransactionStatus;
  transaction_hash: string | null;
  caip2: string;
  created_at: number;
  reference_id?: string | null;
};

type TradingBotScheduledOrderEvaluationStatus =
  | "waiting"
  | "not_due"
  | "unpriced"
  | "triggered"
  | "failed";

type TradingBotScheduledOrderEvaluation = {
  status: TradingBotScheduledOrderEvaluationStatus;
  order: TradingBotStoredAutomationOrderSnapshot;
  scheduler: TradingBotAutomationOrderSchedulerState;
  reason: string;
  currentPriceUsd?: number;
  executeAmountIn?: string;
};

type TradingBotAdvancedAutomationMonitorEvaluationStatus =
  | "baseline"
  | "waiting"
  | "observed"
  | "unsupported"
  | "failed";

type TradingBotAdvancedAutomationMonitorEvaluation = {
  status: TradingBotAdvancedAutomationMonitorEvaluationStatus;
  config: TradingBotStoredAdvancedAutomationConfigSnapshot;
  monitor: TradingBotAdvancedAutomationMonitorState;
  reason: string;
  observedSignature?: string;
  observedMint?: string;
  currentPriceUsd?: number;
  triggerPrice?: number;
  triggerDirection?: TriggerDirection;
  launchCandidate?: JupiterRecentToken;
};

type TradingBotAdvancedAutomationExecutionResult =
  | {
      ok: true;
      signature?: string | null;
      transactionId?: string | null;
      referenceId?: string | null;
      solscanUrl?: string | null;
      copyTradeSide?: "buy" | "sell";
      mint?: string | null;
      amountIn?: string | null;
      sellBps?: number | null;
      observedSignature?: string | null;
    }
  | {
      ok: false;
      error: string;
      reconciliationRequired?: boolean;
      referenceId?: string | null;
      transactionId?: string | null;
      copyTradeSide?: "buy" | "sell";
      mint?: string | null;
      amountIn?: string | null;
      sellBps?: number | null;
      observedSignature?: string | null;
    };

type TradingBotScheduledOrderExecutionResult =
  | {
      ok: true;
      signature?: string | null;
      transactionId?: string | null;
      referenceId?: string | null;
      solscanUrl?: string | null;
    }
  | { ok: false; error: string; reconciliationRequired: boolean };

type TradingBotBundleBuyExecutionItemResult = {
  mint: string;
  amountIn: string;
  signature?: string | null;
  transactionId?: string | null;
  referenceId?: string | null;
  solscanUrl?: string | null;
};

type TradingBotBundleBuyExecutionResult =
  | {
      ok: true;
      executions: TradingBotBundleBuyExecutionItemResult[];
      attemptedItems: number;
    }
  | {
      ok: false;
      error: string;
      partial?: boolean;
      executions?: TradingBotBundleBuyExecutionItemResult[];
      attemptedItems: number;
      reconciliationRequired: boolean;
    };

type TradingBotCopyTradeIntent = {
  side: "buy" | "sell";
  mint: string;
  targetSignature: string;
  targetSolDeltaLamports: string;
  targetTokenDelta: string;
  amountIn?: string;
  sellBps?: number;
};

class TradingBotExecutionError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = "TradingBotExecutionError";
  }
}

export async function getTradingBotConfig(env: Env): Promise<Response> {
  const titanConfig = getTitanConfig(env);
  const feeConfig = getPlatformFeeConfig(env);
  const privyConfig = resolvePrivyConfig(env);
  const botAuthConfigured = Boolean(resolveTradingBotToken(env));
  const liveExecutionEnabled = isTradingBotLiveExecutionEnabled(env);
  const schedulerEnabled = isTradingBotSchedulerEnabled(env);
  const schedulerLiveExecutionEnabled =
    isTradingBotSchedulerLiveExecutionEnabled(env);
  const schedulerReconcileAfterSeconds = clampInteger(
    numberValue(env.TRADING_BOT_SCHEDULER_RECONCILE_AFTER_SECONDS),
    1,
    86_400,
    DEFAULT_TRADING_BOT_SCHEDULER_RECONCILE_AFTER_SECONDS,
  );
  const manualReviewAfterSeconds = tradingBotManualReviewAfterSeconds(env);
  const advancedMonitorEnabled = isTradingBotAdvancedMonitorEnabled(env);
  const positionsConfigured = Boolean(resolveRpcUrl(env));
  const deltaNeutralConfigured =
    deltaNeutralServiceMissingRequirements(env, false).length === 0;
  const deltaNeutralLiveReady =
    deltaNeutralConfigured && isDeltaNeutralLiveExecutionEnabled(env);
  const liveSigningReady = Boolean(
    liveExecutionEnabled &&
      privyConfig &&
      signerConfigured(privyConfig) &&
      env.TRADING_BOT_ACCOUNTS,
  );
  const liveWithdrawalsReady = Boolean(liveSigningReady && positionsConfigured);

  return json(
    {
      id: "ribbot-trading",
      name: "Ribbot Trading",
      chain: "solana-mainnet",
      caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      quoteEndpoint: "/api/frogx/quotes",
      swapEndpoint: "/api/frogx/trading-bot/swap",
      executionEndpoint: "/api/frogx/trading-bot/execute",
      executionStatusEndpoint: "/api/frogx/trading-bot/execute/status",
      publicSwapEndpoint: "/api/frogx/swap",
      positionsEndpoint: "/api/frogx/trading-bot/positions",
      pnlEndpoint: "/api/frogx/trading-bot/pnl",
      tokenCleanupEndpoint: "/api/frogx/trading-bot/token-cleanup/review",
      tokenSafetyEndpoint: "/api/frogx/trading-bot/token-safety",
      marketRiskEndpoint: "/api/frogx/trading-bot/market-risk",
      accountEndpoint: "/api/frogx/trading-bot/account",
      activityEndpoint: "/api/frogx/trading-bot/activity",
      perpsStatusEndpoint: "/api/frogx/trading-bot/perps/status",
      deltaNeutralPreviewEndpoint:
        "/api/frogx/trading-bot/perps/delta-neutral/preview",
      deltaNeutralStartEndpoint:
        "/api/frogx/trading-bot/perps/delta-neutral/start",
      deltaNeutralStatusEndpoint:
        "/api/frogx/trading-bot/perps/delta-neutral/status",
      deltaNeutralStopEndpoint:
        "/api/frogx/trading-bot/perps/delta-neutral/stop",
      robinhoodAlphaEndpoint: "/api/frogx/trading-bot/robinhood-alpha",
      controlCodeEndpoint: "/api/frogx/trading-bot/control/code",
      setupResetEndpoint: "/api/frogx/trading-bot/setup/reset",
      controlSessionEndpoint: "/api/frogx/trading-bot/control/session",
      controlImperialEndpoint: "/api/frogx/trading-bot/control/imperial",
      controlPreferencesEndpoint: "/api/frogx/trading-bot/control/preferences",
      controlWalletEndpoint: "/api/frogx/trading-bot/control/wallet",
      controlUrl: env.RIBBOT_CONTROL_URL?.trim() || null,
      walletEndpoint: "/api/frogx/trading-bot/wallet",
      referralsEndpoint: "/api/frogx/trading-bot/referrals",
      ordersEndpoint: "/api/frogx/trading-bot/orders/validate",
      ordersStorageEndpoint: "/api/frogx/trading-bot/orders",
      ordersCancelEndpoint: "/api/frogx/trading-bot/orders/cancel",
      withdrawalsEndpoint: "/api/frogx/trading-bot/withdrawals/validate",
      withdrawalExecutionEndpoint: "/api/frogx/trading-bot/withdrawals/execute",
      withdrawalExecutionStatusEndpoint:
        "/api/frogx/trading-bot/withdrawals/status",
      copyTradeEndpoint: "/api/frogx/trading-bot/copytrade/validate",
      copyTradeStorageEndpoint: "/api/frogx/trading-bot/copytrade",
      copyTradeCancelEndpoint: "/api/frogx/trading-bot/copytrade/cancel",
      copyTradeControlEndpoint: "/api/frogx/trading-bot/copytrade/control",
      copyTradeUpdateEndpoint: "/api/frogx/trading-bot/copytrade/update",
      copyTradeDuplicateEndpoint: "/api/frogx/trading-bot/copytrade/duplicate",
      copyTradeStatusEndpoint: "/api/frogx/trading-bot/copytrade/status",
      sniperEndpoint: "/api/frogx/trading-bot/sniper/validate",
      sniperStorageEndpoint: "/api/frogx/trading-bot/sniper",
      sniperCancelEndpoint: "/api/frogx/trading-bot/sniper/cancel",
      sniperStatusEndpoint: "/api/frogx/trading-bot/sniper/status",
      autoBuyEndpoint: "/api/frogx/trading-bot/auto-buy/validate",
      autoBuyStorageEndpoint: "/api/frogx/trading-bot/auto-buy",
      autoBuyCancelEndpoint: "/api/frogx/trading-bot/auto-buy/cancel",
      autoBuyStatusEndpoint: "/api/frogx/trading-bot/auto-buy/status",
      bundleBuyEndpoint: "/api/frogx/trading-bot/bundle-buy/validate",
      bundleBuyStorageEndpoint: "/api/frogx/trading-bot/bundle-buy",
      bundleBuyCancelEndpoint: "/api/frogx/trading-bot/bundle-buy/cancel",
      bundleBuyExecutionEndpoint: "/api/frogx/trading-bot/bundle-buy/execute",
      bundleBuyExecutionStatusEndpoint:
        "/api/frogx/trading-bot/bundle-buy/status",
      autoSellEndpoint: "/api/frogx/trading-bot/auto-sell/validate",
      autoSellStorageEndpoint: "/api/frogx/trading-bot/auto-sell",
      autoSellCancelEndpoint: "/api/frogx/trading-bot/auto-sell/cancel",
      autoSellStatusEndpoint: "/api/frogx/trading-bot/auto-sell/status",
      preferencesEndpoint: "/api/frogx/trading-bot/preferences/validate",
      rpcEndpoint: "/rpc",
      inputMints: {
        sol: "So11111111111111111111111111111111111111112",
        usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        usdt: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
      },
      defaults: {
        defaultBuySol: 0.1,
        buyPresetsSol: DEFAULT_TRADING_BOT_BUY_PRESET_AMOUNTS_IN.map(
          (amount) => Number(amount) / 1_000_000_000,
        ),
        sellPresetsPercent: DEFAULT_TRADING_BOT_SELL_PRESET_BPS.map(
          (bps) => bps / 100,
        ),
        slippageBps: 500,
        priorityFeeLamports: 0,
        sellPriorityFeeLamports: 0,
        botMode: "advanced",
        sellProtection: true,
        sellProtectionThresholdBps: TRADING_BOT_SELL_PROTECTION_BPS,
      },
      scheduler: {
        enabled: schedulerEnabled,
        liveExecutionEnabled: schedulerLiveExecutionEnabled,
        reconciliationEnabled: Boolean(schedulerEnabled && privyConfig),
        reconcileAfterSeconds: schedulerReconcileAfterSeconds,
      },
      reconciliation: {
        manualReviewAfterSeconds,
        automaticRetry: false,
        operatorReviewConfigured: Boolean(
          env.TRADING_BOT_OPERATOR_TOKEN?.trim() && env.TRADING_BOT_ACCOUNTS,
        ),
      },
      capabilities: {
        quotePreview: true,
        swapBuild: Boolean(titanConfig.token),
        liveSigning: liveSigningReady,
        liveExecution: liveSigningReady,
        liveExecutionGate: liveExecutionEnabled,
        executionStatus: Boolean(
          env.TRADING_BOT_ACCOUNTS && privyConfig && botAuthConfigured,
        ),
        positions: positionsConfigured,
        pnl: Boolean(env.TRADING_BOT_ACCOUNTS && positionsConfigured),
        privyWallets: Boolean(privyConfig && botAuthConfigured),
        marketBuy: true,
        marketSell: Boolean(resolveRpcUrl(env)),
        tokenCleanup: positionsConfigured,
        tokenSafety: positionsConfigured,
        marketRisk: positionsConfigured,
        orderValidation: true,
        limitOrders: true,
        stopLoss: true,
        trailingStops: true,
        dca: true,
        serverOrderStorage: Boolean(env.TRADING_BOT_ACCOUNTS),
        scheduledExecution: Boolean(
          env.TRADING_BOT_ACCOUNTS && schedulerEnabled,
        ),
        liveScheduledExecution: Boolean(
          schedulerEnabled &&
            schedulerLiveExecutionEnabled &&
            liveSigningReady &&
            botAuthConfigured,
        ),
        withdrawalValidation: true,
        withdrawals: true,
        liveWithdrawals: liveWithdrawalsReady,
        copyTrading: true,
        copyTradeValidation: true,
        serverCopyTradeStorage: Boolean(env.TRADING_BOT_ACCOUNTS),
        copyTradeMonitoring: Boolean(
          env.TRADING_BOT_ACCOUNTS &&
            positionsConfigured &&
            advancedMonitorEnabled &&
            isTradingBotCopyTradeMonitorEnabled(env),
        ),
        liveCopyTrading: Boolean(
          env.TRADING_BOT_ACCOUNTS &&
            positionsConfigured &&
            advancedMonitorEnabled &&
            isTradingBotCopyTradeMonitorEnabled(env) &&
            isTradingBotCopyTradeLiveExecutionEnabled(env) &&
            isTradingBotLiveExecutionEnabled(env),
        ),
        sniper: true,
        sniperValidation: true,
        serverSniperStorage: Boolean(env.TRADING_BOT_ACCOUNTS),
        sniperMonitoring: Boolean(
          env.TRADING_BOT_ACCOUNTS &&
            advancedMonitorEnabled &&
            isTradingBotSniperMonitorEnabled(env) &&
            env.JUPITER_API_KEY?.trim(),
        ),
        liveSniper: Boolean(
          env.TRADING_BOT_ACCOUNTS &&
            positionsConfigured &&
            advancedMonitorEnabled &&
            isTradingBotSniperMonitorEnabled(env) &&
            isTradingBotSniperLiveExecutionEnabled(env) &&
            isTradingBotLiveExecutionEnabled(env) &&
            env.JUPITER_API_KEY?.trim(),
        ),
        autoBuy: true,
        autoBuyValidation: true,
        serverAutoBuyStorage: Boolean(env.TRADING_BOT_ACCOUNTS),
        autoBuyMonitoring: Boolean(
          env.TRADING_BOT_ACCOUNTS &&
            advancedMonitorEnabled &&
            isTradingBotAutoBuyMonitorEnabled(env),
        ),
        liveAutoBuy: Boolean(
          env.TRADING_BOT_ACCOUNTS &&
            advancedMonitorEnabled &&
            isTradingBotAutoBuyMonitorEnabled(env) &&
            isTradingBotAutoBuyLiveExecutionEnabled(env) &&
            isTradingBotLiveExecutionEnabled(env),
        ),
        bundleBuy: true,
        bundleBuyValidation: true,
        serverBundleBuyStorage: Boolean(env.TRADING_BOT_ACCOUNTS),
        liveBundleBuy: Boolean(
          env.TRADING_BOT_ACCOUNTS &&
            positionsConfigured &&
            isTradingBotBundleBuyLiveExecutionEnabled(env) &&
            isTradingBotLiveExecutionEnabled(env),
        ),
        autoSell: true,
        autoSellValidation: true,
        serverAutoSellStorage: Boolean(env.TRADING_BOT_ACCOUNTS),
        autoSellMonitoring: Boolean(
          env.TRADING_BOT_ACCOUNTS &&
            advancedMonitorEnabled &&
            isTradingBotAutoSellMonitorEnabled(env),
        ),
        liveAutoSell: Boolean(
          env.TRADING_BOT_ACCOUNTS &&
            advancedMonitorEnabled &&
            isTradingBotAutoSellMonitorEnabled(env) &&
            isTradingBotAutoSellLiveExecutionEnabled(env) &&
            isTradingBotLiveExecutionEnabled(env),
        ),
        preferences: true,
        accountStorage: Boolean(env.TRADING_BOT_ACCOUNTS),
        activity: Boolean(env.TRADING_BOT_ACCOUNTS),
        robinhoodAlphaSignals: Boolean(env.TRADING_BOT_ACCOUNTS),
        robinhoodAlphaScannerEnabled: ["1", "true", "yes", "on"].includes(
          env.ROBINHOOD_ALPHA_SCANNER_ENABLED?.trim().toLowerCase() ?? "",
        ),
        controlCodes: Boolean(env.TRADING_BOT_ACCOUNTS),
        walletControls: Boolean(env.TRADING_BOT_ACCOUNTS),
        botAccessRevocation: Boolean(env.TRADING_BOT_ACCOUNTS),
        serverPreferenceStorage: Boolean(env.TRADING_BOT_ACCOUNTS),
        watchlists: true,
        hiddenTokens: true,
        mevProtection: true,
        referrals: true,
        serverReferralStorage: Boolean(env.TRADING_BOT_ACCOUNTS),
        rewardTracking: Boolean(env.TRADING_BOT_ACCOUNTS),
        deltaNeutral: deltaNeutralConfigured,
        liveDeltaNeutral: Boolean(
          deltaNeutralLiveReady && env.TRADING_BOT_ACCOUNTS && botAuthConfigured,
        ),
      },
      perps: {
        defaultStrategy: DELTA_NEUTRAL_STRATEGY,
        defaultPreset: DELTA_NEUTRAL_PRESET,
        profileIndex: DELTA_NEUTRAL_PROFILE_INDEX,
        minimumProfileUsdc: 50,
        liveEntryCapUsd: DELTA_NEUTRAL_LIVE_ENTRY_CAP_USD,
        dailyBudgetUsd: DELTA_NEUTRAL_DAILY_BUDGET_USD,
        maxCycles: DELTA_NEUTRAL_MAX_CYCLES,
        explicitConfirmationRequired: true,
      },
      botAuth: {
        required: Boolean(privyConfig),
        configured: botAuthConfigured,
      },
      platformFee: {
        enabled: feeConfig.enabled,
        feeBps: feeConfig.feeBps,
      },
      generatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    },
  );
}

export async function runTradingBotScheduledOrders(env: Env): Promise<void> {
  if (!isTradingBotSchedulerEnabled(env)) return;

  const store = tradingBotOrderStore(env);
  if (!store) {
    console.warn(
      "[trading-bot] Scheduled order runner missing TRADING_BOT_ACCOUNTS",
    );
    return;
  }

  const limit = clampInteger(
    numberValue(env.TRADING_BOT_SCHEDULER_MAX_ORDERS),
    1,
    500,
    DEFAULT_TRADING_BOT_SCHEDULER_MAX_ORDERS,
  );
  const response = await store.fetch(
    new Request(
      `https://trading-bot-account.local/automation-orders/active?limit=${limit}`,
    ),
  );
  if (!response.ok) {
    console.warn("[trading-bot] Scheduled order scan failed", response.status);
    return;
  }

  const data = (await response.json()) as {
    orders?: TradingBotStoredAutomationOrderSnapshot[];
    executingOrders?: TradingBotStoredAutomationOrderSnapshot[];
  };
  const orders = data.orders ?? [];
  const now = new Date();
  await reconcileTradingBotScheduledOrders(
    data.executingOrders ?? [],
    store,
    env,
    now,
  );
  if (orders.length === 0) return;

  const prices = await fetchJupiterPrices(
    env,
    uniqueStrings(
      orders.filter((order) => order.kind !== "dca").map((order) => order.mint),
    ).slice(0, 50),
  );
  const liveScheduler = isTradingBotSchedulerLiveExecutionEnabled(env);
  const liveSchedulerMissing = liveScheduler
    ? tradingBotScheduledExecutionMissingRequirements(env)
    : [];
  const liveSchedulerReady = liveScheduler && liveSchedulerMissing.length === 0;

  for (const order of orders) {
    const evaluation = evaluateTradingBotScheduledOrder(
      order,
      prices[order.mint],
      now,
    );
    let schedulerUpdate = evaluation.scheduler;
    let nextStatus: TradingBotStoredAutomationOrderStatus | undefined;
    let updateExpectation:
      | TradingBotAutomationOrderUpdateExpectation
      | undefined;
    let completionEvent:
      | {
          eventType: string;
          metadata: Record<string, unknown>;
        }
      | undefined;

    if (evaluation.status === "triggered") {
      await recordTradingBotAccountEvent(env, order.telegramUserId, {
        eventType: "automation_order_triggered",
        metadata: {
          orderId: order.orderId,
          kind: order.kind,
          side: order.side,
          mint: order.mint,
          walletAddress: order.walletAddress,
          reason: evaluation.reason,
          currentPriceUsd: evaluation.currentPriceUsd ?? null,
          liveScheduler,
          liveSchedulerReady,
          missingRequirements: liveSchedulerMissing,
        },
      });

      if (liveSchedulerReady) {
        const claim = await claimStoredAutomationOrderForExecution(
          store,
          order,
        );
        if (!claim) continue;
        updateExpectation = {
          status: "executing",
          executionId: claim.executionId,
        };

        const execution = await executeTradingBotScheduledOrder(
          claim.order,
          evaluation.executeAmountIn ?? order.amountIn,
          claim.executionId,
          env,
        );
        const executionCompletedAt = new Date().toISOString();
        if (execution.ok) {
          schedulerUpdate = schedulerAfterScheduledExecution(
            order,
            {
              ...schedulerUpdate,
              executionId: claim.executionId,
              executionStartedAt: claim.order.scheduler.executionStartedAt,
              executionCompletedAt,
              ...(execution.signature
                ? { executionSignature: execution.signature }
                : {}),
              ...(execution.transactionId
                ? { executionTransactionId: execution.transactionId }
                : {}),
              ...(execution.referenceId
                ? { executionReferenceId: execution.referenceId }
                : {}),
              ...(execution.solscanUrl
                ? { executionSolscanUrl: execution.solscanUrl }
                : {}),
            },
            now,
          );
          delete schedulerUpdate.lastError;
          nextStatus = scheduledOrderStatusAfterExecution(
            order,
            schedulerUpdate,
          );
          completionEvent = {
            eventType: "automation_order_executed",
            metadata: {
              orderId: order.orderId,
              executionId: claim.executionId,
              kind: order.kind,
              side: order.side,
              mint: order.mint,
              amountIn: evaluation.executeAmountIn ?? order.amountIn,
              signature: execution.signature ?? null,
              transactionId: execution.transactionId ?? null,
              referenceId: execution.referenceId ?? null,
              solscanUrl: execution.solscanUrl ?? null,
              executedCount: schedulerUpdate.executedCount ?? null,
              orderCount: order.orderCount ?? null,
            },
          };
        } else {
          const schedulerFailureUpdate: TradingBotAutomationOrderSchedulerState =
            {
              ...schedulerUpdate,
              executionId: claim.executionId,
              executionStartedAt: claim.order.scheduler.executionStartedAt,
              executionReferenceId: claim.order.scheduler.executionReferenceId,
              reconciliationCheckedAt: execution.reconciliationRequired
                ? executionCompletedAt
                : undefined,
              reconciliationStatus: execution.reconciliationRequired
                ? "error"
                : undefined,
              ...(!execution.reconciliationRequired
                ? { executionCompletedAt }
                : {}),
              lastError: execution.error,
            };
          schedulerUpdate = execution.reconciliationRequired
            ? withTradingBotManualReview(
                schedulerFailureUpdate,
                env,
                claim.order.scheduler.executionStartedAt,
                new Date(executionCompletedAt),
                "pending_reconciliation",
              )
            : clearTradingBotManualReview(schedulerFailureUpdate);
          nextStatus = execution.reconciliationRequired ? undefined : "failed";
          completionEvent = {
            eventType: execution.reconciliationRequired
              ? "automation_order_reconciliation_required"
              : "automation_order_failed",
            metadata: {
              orderId: order.orderId,
              executionId: claim.executionId,
              kind: order.kind,
              side: order.side,
              mint: order.mint,
              amountIn: evaluation.executeAmountIn ?? order.amountIn,
              reason: execution.error,
              reconciliationRequired: execution.reconciliationRequired,
            },
          };
        }
      } else if (liveScheduler) {
        schedulerUpdate = {
          ...schedulerUpdate,
          lastError: `Scheduled live execution is missing ${liveSchedulerMissing.join(", ")}`,
        };
      } else {
        schedulerUpdate = schedulerAfterDryRunTrigger(
          order,
          schedulerUpdate,
          now,
        );
      }
    }

    const persisted = await updateStoredAutomationOrderScheduler(
      store,
      order,
      schedulerUpdate,
      nextStatus,
      updateExpectation,
    );
    if (persisted && completionEvent) {
      await recordTradingBotAccountEvent(
        env,
        order.telegramUserId,
        completionEvent,
      );
    }
  }
}

async function persistTradingBotScheduledOrderUnresolved(
  store: DurableObjectStub,
  env: Env,
  order: TradingBotStoredAutomationOrderSnapshot,
  scheduler: TradingBotAutomationOrderSchedulerState,
  expectation: TradingBotAutomationOrderUpdateExpectation,
  now: Date,
  referenceId: string,
  unresolvedStatus: string,
): Promise<void> {
  const reviewedScheduler = withTradingBotManualReview(
    scheduler,
    env,
    scheduler.executionStartedAt ?? order.scheduler.executionStartedAt,
    now,
    unresolvedStatus,
  );
  const persisted = await updateStoredAutomationOrderScheduler(
    store,
    order,
    reviewedScheduler,
    undefined,
    expectation,
  );
  if (!persisted) return;
  await recordTradingBotManualReviewRequired(env, {
    telegramUserId: order.telegramUserId,
    executionKind: `scheduled_${order.kind}`,
    resourceId: order.orderId,
    executionId: scheduler.executionId ?? order.orderId,
    referenceId,
    executionStartedAt:
      scheduler.executionStartedAt ?? order.scheduler.executionStartedAt,
    state: reviewedScheduler,
  });
}

async function reconcileTradingBotScheduledOrders(
  orders: TradingBotStoredAutomationOrderSnapshot[],
  store: DurableObjectStub,
  env: Env,
  now: Date,
): Promise<void> {
  if (orders.length === 0) return;
  const privyConfig = resolvePrivyConfig(env);
  if (!privyConfig) return;

  const reconcileAfterSeconds = clampInteger(
    numberValue(env.TRADING_BOT_SCHEDULER_RECONCILE_AFTER_SECONDS),
    1,
    86_400,
    DEFAULT_TRADING_BOT_SCHEDULER_RECONCILE_AFTER_SECONDS,
  );
  const nowIso = now.toISOString();

  for (const order of orders) {
    const executionStartedAt = order.scheduler.executionStartedAt;
    const startedAtMs = executionStartedAt
      ? Date.parse(executionStartedAt)
      : NaN;
    if (
      Number.isFinite(startedAtMs) &&
      now.getTime() - startedAtMs < reconcileAfterSeconds * 1000
    ) {
      continue;
    }

    const executionId = order.scheduler.executionId;
    if (!executionId) {
      const scheduler = clearTradingBotManualReview({
        ...order.scheduler,
        reconciliationCheckedAt: nowIso,
        reconciliationStatus: "error" as const,
        executionCompletedAt: nowIso,
        lastError: "Executing order is missing its execution ID",
      });
      await updateStoredAutomationOrderScheduler(
        store,
        order,
        scheduler,
        "failed",
        {
          status: "executing",
        },
      );
      continue;
    }
    const updateExpectation: TradingBotAutomationOrderUpdateExpectation = {
      status: "executing",
      executionId,
    };

    const referenceId =
      order.scheduler.executionReferenceId ??
      (await tradingBotExecutionReferenceId(order.telegramUserId, executionId));
    const accountResult = await getStoredTradingBotAccount(
      env,
      order.telegramUserId,
    );
    const spotWallet =
      "error" in accountResult || !accountResult.account
        ? null
        : spotNftPrivyWallet(accountResult.account);
    if (
      "error" in accountResult ||
      !spotWallet?.privyWalletId
    ) {
      const scheduler = {
        ...order.scheduler,
        executionReferenceId: referenceId,
        reconciliationCheckedAt: nowIso,
        reconciliationStatus: "error" as const,
        lastError:
          "error" in accountResult
            ? accountResult.error
            : "Executing order no longer has an FTX-managed Privy wallet",
      };
      await persistTradingBotScheduledOrderUnresolved(
        store,
        env,
        order,
        scheduler,
        updateExpectation,
        now,
        referenceId,
        "account_lookup_error",
      );
      continue;
    }

    let transaction: PrivyTransaction | null;
    try {
      transaction = await getPrivyTransactionByReferenceId(
        privyConfig,
        referenceId,
      );
    } catch (error) {
      const scheduler = {
        ...order.scheduler,
        executionReferenceId: referenceId,
        reconciliationCheckedAt: nowIso,
        reconciliationStatus: "error" as const,
        lastError: error instanceof Error ? error.message : String(error),
      };
      await persistTradingBotScheduledOrderUnresolved(
        store,
        env,
        order,
        scheduler,
        updateExpectation,
        now,
        referenceId,
        "lookup_error",
      );
      continue;
    }

    if (!transaction) {
      const scheduler = {
        ...order.scheduler,
        executionReferenceId: referenceId,
        reconciliationCheckedAt: nowIso,
        reconciliationStatus: "not_found" as const,
        lastError:
          "No Privy transaction found for this execution reference yet",
      };
      await persistTradingBotScheduledOrderUnresolved(
        store,
        env,
        order,
        scheduler,
        updateExpectation,
        now,
        referenceId,
        "not_found",
      );
      continue;
    }

    if (
      transaction.wallet_id !== spotWallet.privyWalletId ||
      transaction.caip2 !== SOLANA_MAINNET_CAIP2
    ) {
      const scheduler = clearTradingBotManualReview({
        ...order.scheduler,
        executionReferenceId: referenceId,
        reconciliationCheckedAt: nowIso,
        reconciliationStatus: "error" as const,
        lastError:
          "Privy transaction does not match the stored wallet and Solana chain",
      });
      await updateStoredAutomationOrderScheduler(
        store,
        order,
        scheduler,
        "failed",
        updateExpectation,
      );
      continue;
    }

    const transactionFields: TradingBotAutomationOrderSchedulerState = {
      ...order.scheduler,
      executionReferenceId: transaction.reference_id ?? referenceId,
      executionTransactionId: transaction.id,
      reconciliationCheckedAt: nowIso,
      reconciliationStatus: transaction.status,
      ...(transaction.transaction_hash
        ? {
            executionSignature: transaction.transaction_hash,
            executionSolscanUrl: `https://solscan.io/tx/${transaction.transaction_hash}`,
          }
        : {}),
    };

    if (
      transaction.status === "confirmed" ||
      transaction.status === "finalized"
    ) {
      transactionFields.executionCompletedAt = nowIso;
      delete transactionFields.lastError;
      const resolvedFields = clearTradingBotManualReview(transactionFields);
      const scheduler = schedulerAfterScheduledExecution(
        order,
        resolvedFields,
        now,
      );
      const status = scheduledOrderStatusAfterExecution(order, scheduler);
      const persisted = await updateStoredAutomationOrderScheduler(
        store,
        order,
        scheduler,
        status,
        updateExpectation,
      );
      if (persisted) {
        await recordTradingBotAccountEvent(env, order.telegramUserId, {
          eventType: "automation_order_reconciled",
          metadata: {
            orderId: order.orderId,
            executionId,
            kind: order.kind,
            side: order.side,
            mint: order.mint,
            resolution: "executed",
            privyStatus: transaction.status,
            signature: transaction.transaction_hash,
            transactionId: transaction.id,
            referenceId: transaction.reference_id ?? referenceId,
            executedCount: scheduler.executedCount ?? null,
            orderCount: order.orderCount ?? null,
          },
        });
        await resolveTradingBotManualReviewCaseFromTerminalEvidence(env, {
          referenceId,
          resolution: "executed",
          providerStatus: transaction.status,
          signature: transaction.transaction_hash,
          transactionId: transaction.id,
          checkedAt: nowIso,
        });
      }
      continue;
    }

    if (
      transaction.status === "execution_reverted" ||
      transaction.status === "failed" ||
      transaction.status === "provider_error" ||
      transaction.status === "replaced"
    ) {
      transactionFields.executionCompletedAt = nowIso;
      transactionFields.lastError = `Privy transaction ended with ${transaction.status}`;
      const resolvedFields = clearTradingBotManualReview(transactionFields);
      const persisted = await updateStoredAutomationOrderScheduler(
        store,
        order,
        resolvedFields,
        "failed",
        updateExpectation,
      );
      if (persisted) {
        await recordTradingBotAccountEvent(env, order.telegramUserId, {
          eventType: "automation_order_reconciled",
          metadata: {
            orderId: order.orderId,
            executionId,
            kind: order.kind,
            side: order.side,
            mint: order.mint,
            resolution: "failed",
            privyStatus: transaction.status,
            signature: transaction.transaction_hash,
            transactionId: transaction.id,
            referenceId: transaction.reference_id ?? referenceId,
            reason: resolvedFields.lastError,
          },
        });
        await resolveTradingBotManualReviewCaseFromTerminalEvidence(env, {
          referenceId,
          resolution: "failed",
          providerStatus: transaction.status,
          signature: transaction.transaction_hash,
          transactionId: transaction.id,
          checkedAt: nowIso,
        });
      }
      continue;
    }

    delete transactionFields.lastError;
    await persistTradingBotScheduledOrderUnresolved(
      store,
      env,
      order,
      transactionFields,
      updateExpectation,
      now,
      transaction.reference_id ?? referenceId,
      transaction.status,
    );
  }
}

export async function runTradingBotAdvancedAutomationMonitors(
  env: Env,
): Promise<void> {
  if (!isTradingBotAdvancedMonitorEnabled(env)) return;

  const store = tradingBotOrderStore(env);
  if (!store) {
    console.warn(
      "[trading-bot] Advanced monitor runner missing TRADING_BOT_ACCOUNTS",
    );
    return;
  }

  const kinds: TradingBotAdvancedAutomationKind[] = [];
  if (isTradingBotCopyTradeMonitorEnabled(env)) kinds.push("copytrade");
  if (isTradingBotSniperMonitorEnabled(env)) kinds.push("sniper");
  if (isTradingBotAutoBuyMonitorEnabled(env)) kinds.push("auto_buy");
  if (isTradingBotAutoSellMonitorEnabled(env)) kinds.push("auto_sell");
  if (kinds.length === 0) return;

  const limit = clampInteger(
    numberValue(env.TRADING_BOT_ADVANCED_MONITOR_MAX_CONFIGS),
    1,
    500,
    DEFAULT_TRADING_BOT_ADVANCED_MONITOR_MAX_CONFIGS,
  );
  const now = new Date();
  const liveAutoBuy =
    isTradingBotAutoBuyLiveExecutionEnabled(env) &&
    isTradingBotLiveExecutionEnabled(env);
  const liveAutoSell =
    isTradingBotAutoSellLiveExecutionEnabled(env) &&
    isTradingBotLiveExecutionEnabled(env);
  const liveCopyTrading =
    isTradingBotCopyTradeLiveExecutionEnabled(env) &&
    isTradingBotLiveExecutionEnabled(env);
  const liveSniper =
    isTradingBotSniperLiveExecutionEnabled(env) &&
    isTradingBotLiveExecutionEnabled(env);

  for (const kind of kinds) {
    const response = await store.fetch(
      new Request(
        `https://trading-bot-account.local/automation-configs/active?kind=${kind}&limit=${limit}`,
      ),
    );
    if (!response.ok) {
      console.warn(
        "[trading-bot] Advanced automation config scan failed",
        kind,
        response.status,
      );
      continue;
    }

    const data = (await response.json()) as {
      configs?: TradingBotStoredAdvancedAutomationConfigSnapshot[];
      executingConfigs?: TradingBotStoredAdvancedAutomationConfigSnapshot[];
    };
    await reconcileTradingBotAdvancedAutomationConfigs(
      data.executingConfigs ?? [],
      store,
      env,
      now,
    );

    for (const config of data.configs ?? []) {
      const evaluation = await evaluateTradingBotAdvancedAutomationConfig(
        config,
        env,
        now,
      );
      let monitorUpdate = evaluation.monitor;
      let nextStatus:
        | TradingBotStoredAdvancedAutomationConfigStatus
        | undefined;
      let updateExpectation:
        | TradingBotAdvancedAutomationUpdateExpectation
        | undefined;
      let persistedConfig = config;
      let liveExecution:
        | TradingBotAdvancedAutomationExecutionResult
        | undefined;
      if (evaluation.status === "observed") {
        const liveExecutionEnabled =
          (config.kind === "copytrade" && liveCopyTrading) ||
          (config.kind === "sniper" && liveSniper) ||
          (config.kind === "auto_buy" && liveAutoBuy) ||
          (config.kind === "auto_sell" && liveAutoSell);
        if (liveExecutionEnabled) {
          const executionId = await advancedAutomationExecutionId(
            config,
            evaluation,
          );
          if (!executionId) {
            monitorUpdate = {
              ...monitorUpdate,
              lastError: `Live execution is unsupported for ${config.kind}`,
            };
          } else {
            const executionReferenceId = await tradingBotExecutionReferenceId(
              config.telegramUserId,
              executionId,
            );
            const executionStartedAt = new Date().toISOString();
            const claim = await claimStoredAdvancedAutomationConfigForExecution(
              store,
              config,
              {
                ...evaluation.monitor,
                executionId,
                executionReferenceId,
                executionStartedAt,
                ...(evaluation.observedMint
                  ? { executionMint: evaluation.observedMint }
                  : config.mint
                    ? { executionMint: config.mint }
                    : {}),
                ...(config.kind === "auto_buy" || config.kind === "sniper"
                  ? {
                      executionSide: "buy" as const,
                      executionAmountIn: config.maxBuyAmountIn,
                    }
                  : config.kind === "auto_sell"
                    ? { executionSide: "sell" as const }
                    : {}),
              },
            );
            if (!claim) continue;

            persistedConfig = claim;
            updateExpectation = { status: "executing", executionId };
            if (config.kind === "copytrade") {
              liveExecution = await executeTradingBotCopyTradeConfig(
                claim,
                evaluation,
                executionId,
                env,
              );
            } else if (config.kind === "sniper") {
              liveExecution = await executeTradingBotSniperConfig(
                claim,
                evaluation,
                executionId,
                env,
              );
            } else if (config.kind === "auto_buy") {
              liveExecution = await executeTradingBotAutoBuyConfig(
                claim,
                executionId,
                env,
              );
            } else {
              liveExecution = await executeTradingBotAutoSellConfig(
                claim,
                executionId,
                env,
              );
            }

            const executionFinishedAt = new Date().toISOString();
            monitorUpdate = monitorWithAdvancedAutomationExecutionResult(
              claim,
              evaluation.monitor,
              executionId,
              executionReferenceId,
              liveExecution,
            );
            if (liveExecution.ok) {
              monitorUpdate = monitorAfterAdvancedAutomationExecution(claim, {
                ...monitorUpdate,
                executionCompletedAt: executionFinishedAt,
                reconciliationStatus: "confirmed",
              });
              delete monitorUpdate.lastError;
              nextStatus = advancedAutomationStatusAfterSuccessfulExecution(
                claim,
                monitorUpdate,
              );
            } else if (liveExecution.reconciliationRequired) {
              monitorUpdate = withTradingBotManualReview(
                {
                  ...monitorUpdate,
                  reconciliationCheckedAt: executionFinishedAt,
                  reconciliationStatus: "error",
                  lastError: liveExecution.error,
                },
                env,
                claim.monitor.executionStartedAt,
                new Date(executionFinishedAt),
                "pending_reconciliation",
              );
            } else {
              monitorUpdate = {
                ...monitorUpdate,
                executionCompletedAt: executionFinishedAt,
                lastError: liveExecution.error,
              };
              nextStatus = "staged";
            }
          }
        } else if (config.kind === "auto_sell" || config.kind === "sniper") {
          monitorUpdate = monitorAfterAdvancedAutomationDryRunTrigger(
            config,
            monitorUpdate,
          );
        }
      }

      const persisted = await updateStoredAdvancedAutomationConfigMonitor(
        store,
        persistedConfig,
        monitorUpdate,
        nextStatus,
        false,
        updateExpectation,
      );
      if (!persisted || evaluation.status !== "observed") continue;

      await recordTradingBotAccountEvent(env, config.telegramUserId, {
        eventType: "advanced_automation_config_observed",
        metadata: {
          configId: config.configId,
          kind: config.kind,
          walletAddress: config.walletAddress,
          targetWallet: config.targetWallet,
          source: config.source,
          observedSignature: evaluation.observedSignature ?? null,
          observedMint: evaluation.observedMint ?? null,
          currentPriceUsd: evaluation.currentPriceUsd ?? null,
          triggerPrice: evaluation.triggerPrice ?? null,
          triggerDirection: evaluation.triggerDirection ?? null,
          reason: evaluation.reason,
          liveMonitor:
            config.kind === "copytrade"
              ? liveCopyTrading
              : config.kind === "sniper"
                ? liveSniper
                : config.kind === "auto_buy"
                  ? liveAutoBuy
                  : config.kind === "auto_sell"
                    ? liveAutoSell
                    : false,
          executionStatus: liveExecution
            ? liveExecution.ok
              ? "executed"
              : liveExecution.reconciliationRequired
                ? "pending_reconciliation"
                : "failed"
            : "not_requested",
          executionError:
            liveExecution && !liveExecution.ok ? liveExecution.error : null,
          signature: liveExecution?.ok
            ? (liveExecution.signature ?? null)
            : null,
          referenceId: liveExecution?.referenceId ?? null,
          copyTradeSide: liveExecution?.copyTradeSide ?? null,
          copyTradeMint: liveExecution?.mint ?? null,
          copyTradeAmountIn: liveExecution?.amountIn ?? null,
          copyTradeSellBps: liveExecution?.sellBps ?? null,
        },
      });

      if (liveExecution?.ok) {
        await recordTradingBotAccountEvent(env, config.telegramUserId, {
          eventType: "advanced_automation_config_executed",
          metadata: {
            configId: config.configId,
            executionId: monitorUpdate.executionId ?? null,
            kind: config.kind,
            mint: liveExecution.mint ?? config.mint,
            walletAddress: config.walletAddress,
            targetWallet: config.targetWallet ?? null,
            observedSignature:
              liveExecution.observedSignature ??
              evaluation.observedSignature ??
              null,
            copyTradeSide: liveExecution.copyTradeSide ?? null,
            maxBuyAmountIn:
              config.kind === "auto_buy" || config.kind === "sniper"
                ? config.maxBuyAmountIn
                : null,
            amountIn: liveExecution.amountIn ?? null,
            sellBps:
              liveExecution.sellBps ??
              (config.kind === "auto_sell" ? (config.sellBps ?? 10_000) : null),
            triggerPrice: evaluation.triggerPrice ?? null,
            triggerDirection: evaluation.triggerDirection ?? null,
            currentPriceUsd: evaluation.currentPriceUsd ?? null,
            signature: liveExecution.signature ?? null,
            transactionId: liveExecution.transactionId ?? null,
            referenceId: liveExecution.referenceId ?? null,
            solscanUrl: liveExecution.solscanUrl ?? null,
          },
        });
      }
    }
  }
}

async function persistTradingBotAdvancedAutomationUnresolved(
  store: DurableObjectStub,
  env: Env,
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
  monitor: TradingBotAdvancedAutomationMonitorState,
  expectation: TradingBotAdvancedAutomationUpdateExpectation,
  now: Date,
  referenceId: string,
  unresolvedStatus: string,
): Promise<void> {
  const reviewedMonitor = withTradingBotManualReview(
    monitor,
    env,
    monitor.executionStartedAt ?? config.monitor.executionStartedAt,
    now,
    unresolvedStatus,
  );
  const persisted = await updateStoredAdvancedAutomationConfigMonitor(
    store,
    config,
    reviewedMonitor,
    undefined,
    false,
    expectation,
  );
  if (!persisted) return;
  await recordTradingBotManualReviewRequired(env, {
    telegramUserId: config.telegramUserId,
    executionKind: config.kind,
    resourceId: config.configId,
    executionId: monitor.executionId ?? config.configId,
    referenceId,
    executionStartedAt:
      monitor.executionStartedAt ?? config.monitor.executionStartedAt,
    state: reviewedMonitor,
  });
}

async function reconcileTradingBotAdvancedAutomationConfigs(
  configs: TradingBotStoredAdvancedAutomationConfigSnapshot[],
  store: DurableObjectStub,
  env: Env,
  now: Date,
): Promise<void> {
  if (configs.length === 0) return;
  const privyConfig = resolvePrivyConfig(env);
  if (!privyConfig) return;

  const reconcileAfterSeconds = clampInteger(
    numberValue(env.TRADING_BOT_ADVANCED_RECONCILE_AFTER_SECONDS),
    1,
    86_400,
    DEFAULT_TRADING_BOT_ADVANCED_RECONCILE_AFTER_SECONDS,
  );
  const nowIso = now.toISOString();

  for (const config of configs) {
    const startedAtMs = config.monitor.executionStartedAt
      ? Date.parse(config.monitor.executionStartedAt)
      : NaN;
    if (
      Number.isFinite(startedAtMs) &&
      now.getTime() - startedAtMs < reconcileAfterSeconds * 1000
    ) {
      continue;
    }

    const executionId = config.monitor.executionId;
    if (!executionId) {
      await updateStoredAdvancedAutomationConfigMonitor(
        store,
        config,
        clearTradingBotManualReview({
          ...config.monitor,
          reconciliationCheckedAt: nowIso,
          reconciliationStatus: "error",
          executionCompletedAt: nowIso,
          lastError: "Executing config is missing its execution ID",
        }),
        "failed",
        false,
        { status: "executing" },
      );
      continue;
    }
    const expectation: TradingBotAdvancedAutomationUpdateExpectation = {
      status: "executing",
      executionId,
    };
    const referenceId =
      config.monitor.executionReferenceId ??
      (await tradingBotExecutionReferenceId(
        config.telegramUserId,
        executionId,
      ));
    const accountResult = await getStoredTradingBotAccount(
      env,
      config.telegramUserId,
    );
    const spotWallet =
      "error" in accountResult || !accountResult.account
        ? null
        : spotNftPrivyWallet(accountResult.account);
    if (
      "error" in accountResult ||
      !spotWallet?.privyWalletId ||
      spotWallet.solanaWalletAddress !== config.walletAddress
    ) {
      await persistTradingBotAdvancedAutomationUnresolved(
        store,
        env,
        config,
        {
          ...config.monitor,
          executionReferenceId: referenceId,
          reconciliationCheckedAt: nowIso,
          reconciliationStatus: "error",
          lastError:
            "error" in accountResult
              ? accountResult.error
              : "Executing config no longer matches an FTX-managed Privy wallet",
        },
        expectation,
        now,
        referenceId,
        "account_lookup_error",
      );
      continue;
    }

    let transaction: PrivyTransaction | null;
    try {
      transaction = await getPrivyTransactionByReferenceId(
        privyConfig,
        referenceId,
      );
    } catch (error) {
      await persistTradingBotAdvancedAutomationUnresolved(
        store,
        env,
        config,
        {
          ...config.monitor,
          executionReferenceId: referenceId,
          reconciliationCheckedAt: nowIso,
          reconciliationStatus: "error",
          lastError: error instanceof Error ? error.message : String(error),
        },
        expectation,
        now,
        referenceId,
        "lookup_error",
      );
      continue;
    }

    if (!transaction) {
      await persistTradingBotAdvancedAutomationUnresolved(
        store,
        env,
        config,
        {
          ...config.monitor,
          executionReferenceId: referenceId,
          reconciliationCheckedAt: nowIso,
          reconciliationStatus: "not_found",
          lastError:
            "No Privy transaction found for this execution reference yet",
        },
        expectation,
        now,
        referenceId,
        "not_found",
      );
      continue;
    }

    if (
      transaction.wallet_id !== spotWallet.privyWalletId ||
      transaction.caip2 !== SOLANA_MAINNET_CAIP2
    ) {
      await persistTradingBotAdvancedAutomationUnresolved(
        store,
        env,
        config,
        {
          ...config.monitor,
          executionReferenceId: referenceId,
          reconciliationCheckedAt: nowIso,
          reconciliationStatus: "error",
          lastError:
            "Privy transaction does not match the stored wallet and Solana chain",
        },
        expectation,
        now,
        referenceId,
        "wallet_or_chain_mismatch",
      );
      continue;
    }

    const transactionMonitor: TradingBotAdvancedAutomationMonitorState = {
      ...config.monitor,
      executionReferenceId: transaction.reference_id ?? referenceId,
      executionTransactionId: transaction.id,
      reconciliationCheckedAt: nowIso,
      reconciliationStatus: transaction.status,
      ...(transaction.transaction_hash
        ? {
            executionSignature: transaction.transaction_hash,
            executionSolscanUrl: `https://solscan.io/tx/${transaction.transaction_hash}`,
          }
        : {}),
    };

    if (
      transaction.status === "confirmed" ||
      transaction.status === "finalized"
    ) {
      transactionMonitor.executionCompletedAt = nowIso;
      delete transactionMonitor.lastError;
      const resolvedTransactionMonitor =
        clearTradingBotManualReview(transactionMonitor);
      const monitor = monitorAfterAdvancedAutomationExecution(
        config,
        resolvedTransactionMonitor,
      );
      const status = advancedAutomationStatusAfterSuccessfulExecution(
        config,
        monitor,
      );
      const persisted = await updateStoredAdvancedAutomationConfigMonitor(
        store,
        config,
        monitor,
        status,
        true,
        expectation,
      );
      if (persisted) {
        const mint = config.monitor.executionMint ?? config.mint ?? null;
        const side = config.monitor.executionSide ?? null;
        await recordTradingBotAccountEvent(env, config.telegramUserId, {
          eventId: referenceId,
          eventType: "swap_executed",
          metadata: {
            orderId: executionId,
            configId: config.configId,
            kind: config.kind,
            reconciliation: true,
            walletAddress: config.walletAddress,
            inMint: side === "sell" ? mint : WRAPPED_SOL_MINT,
            outMint: side === "sell" ? WRAPPED_SOL_MINT : mint,
            amountIn: config.monitor.executionAmountIn ?? null,
            slippageBps: config.slippageBps,
            priorityFee: config.priorityFee,
            signature: transaction.transaction_hash,
            transactionId: transaction.id,
            referenceId: transaction.reference_id ?? referenceId,
            solscanUrl: transaction.transaction_hash
              ? `https://solscan.io/tx/${transaction.transaction_hash}`
              : null,
            executedAt: nowIso,
          },
        });
        await recordTradingBotAccountEvent(env, config.telegramUserId, {
          eventId: await tradingBotLifecycleEventId(
            "advanced-executed",
            referenceId,
          ),
          eventType: "advanced_automation_config_reconciled",
          metadata: {
            configId: config.configId,
            executionId,
            kind: config.kind,
            resolution: "executed",
            providerStatus: transaction.status,
            signature: transaction.transaction_hash,
            transactionId: transaction.id,
            referenceId: transaction.reference_id ?? referenceId,
            mint: config.monitor.executionMint ?? config.mint ?? null,
            amountIn: config.monitor.executionAmountIn ?? null,
            side: config.monitor.executionSide ?? null,
          },
        });
        await resolveTradingBotManualReviewCaseFromTerminalEvidence(env, {
          referenceId,
          resolution: "executed",
          providerStatus: transaction.status,
          signature: transaction.transaction_hash,
          transactionId: transaction.id,
          checkedAt: nowIso,
        });
      }
      continue;
    }

    if (
      transaction.status === "execution_reverted" ||
      transaction.status === "failed" ||
      transaction.status === "provider_error" ||
      transaction.status === "replaced"
    ) {
      transactionMonitor.executionCompletedAt = nowIso;
      transactionMonitor.lastError = `Privy transaction ended with ${transaction.status}`;
      const resolvedTransactionMonitor =
        clearTradingBotManualReview(transactionMonitor);
      const status =
        config.kind === "copytrade" || config.kind === "sniper"
          ? "staged"
          : "failed";
      const persisted = await updateStoredAdvancedAutomationConfigMonitor(
        store,
        config,
        resolvedTransactionMonitor,
        status,
        false,
        expectation,
      );
      if (persisted) {
        await recordTradingBotAccountEvent(env, config.telegramUserId, {
          eventId: referenceId,
          eventType: "swap_execution_failed",
          metadata: {
            orderId: executionId,
            configId: config.configId,
            kind: config.kind,
            reconciliation: true,
            walletAddress: config.walletAddress,
            inMint:
              config.monitor.executionSide === "sell"
                ? (config.monitor.executionMint ?? config.mint ?? null)
                : WRAPPED_SOL_MINT,
            outMint:
              config.monitor.executionSide === "sell"
                ? WRAPPED_SOL_MINT
                : (config.monitor.executionMint ?? config.mint ?? null),
            amountIn: config.monitor.executionAmountIn ?? null,
            signature: transaction.transaction_hash,
            transactionId: transaction.id,
            referenceId: transaction.reference_id ?? referenceId,
            reason: resolvedTransactionMonitor.lastError,
            checkedAt: nowIso,
          },
        });
        await recordTradingBotAccountEvent(env, config.telegramUserId, {
          eventId: await tradingBotLifecycleEventId(
            "advanced-failed",
            referenceId,
          ),
          eventType: "advanced_automation_config_reconciled",
          metadata: {
            configId: config.configId,
            executionId,
            kind: config.kind,
            resolution: "failed",
            providerStatus: transaction.status,
            signature: transaction.transaction_hash,
            transactionId: transaction.id,
            referenceId: transaction.reference_id ?? referenceId,
            reason: resolvedTransactionMonitor.lastError,
          },
        });
        await resolveTradingBotManualReviewCaseFromTerminalEvidence(env, {
          referenceId,
          resolution: "failed",
          providerStatus: transaction.status,
          signature: transaction.transaction_hash,
          transactionId: transaction.id,
          checkedAt: nowIso,
        });
      }
      continue;
    }

    delete transactionMonitor.lastError;
    await persistTradingBotAdvancedAutomationUnresolved(
      store,
      env,
      config,
      transactionMonitor,
      expectation,
      now,
      transaction.reference_id ?? referenceId,
      transaction.status,
    );
  }
}

export async function getTradingBotAccount(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const telegramUserId = stringValue(url.searchParams.get("telegramUserId"));
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return json({ error: "telegramUserId is required" }, { status: 400 });
  }

  const store = tradingBotAccountStore(env, telegramUserId);
  if (!store) {
    return json(
      {
        status: "not_configured",
        required: ["TRADING_BOT_ACCOUNTS"],
      },
      { status: 503 },
    );
  }

  const response = await store.fetch(
    new Request(
      `https://trading-bot-account.local/account?telegramUserId=${telegramUserId}`,
    ),
  );
  if (!response.ok) return response;

  const data = (await response.json()) as {
    status?: string;
    account?: TradingBotAccountSnapshot;
    setup?: { imperialConnected?: boolean };
  };
  if (data.status !== "ready" || !data.account) {
    return json(data, { status: response.status });
  }

  const spotWallet = spotNftPrivyWallet(data.account);
  const walletReady = Boolean(spotWallet?.privyWalletId);
  const botAccessEnabled = !data.account.botAccessRevokedAt;
  const imperialConnected = data.setup?.imperialConnected === true;
  let automationSignerReady = false;
  const config = resolvePrivyConfig(env);

  if (config && spotWallet?.privyWalletId) {
    try {
      const privyWallet = await getPrivyWallet(
        config,
        spotWallet.privyWalletId,
      );
      automationSignerReady =
        privyWallet.id === spotWallet.privyWalletId &&
        privyWallet.address === spotWallet.solanaWalletAddress &&
        privyWallet.chain_type === "solana" &&
        hasConfiguredAutomationSigner(privyWallet, config);
    } catch {
      automationSignerReady = false;
    }
  }

  const setup: TradingBotSetupStatus = {
    walletReady,
    automationSignerReady,
    imperialConnected,
    botAccessEnabled,
    complete:
      walletReady &&
      automationSignerReady &&
      imperialConnected &&
      botAccessEnabled,
  };

  return json({ ...data, setup }, { status: response.status });
}

export async function getTradingBotNfts(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const telegramUserId = stringValue(url.searchParams.get("telegramUserId"));
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return json({ error: "telegramUserId is required" }, { status: 400 });
  }

  const accountResult = await getStoredTradingBotAccount(env, telegramUserId);
  if ("error" in accountResult) {
    const status = accountResult.status ?? 503;
    return json(
      {
        status: status === 404 ? "wallet_required" : "unavailable",
        error: accountResult.error,
      },
      { status },
    );
  }
  const account = accountResult.account;
  const walletAddresses = [
    ...new Set([
      ...(account?.wallets ?? [])
        .map((wallet) => wallet.solanaWalletAddress),
      ...(account?.solanaWalletAddress
        ? [account.solanaWalletAddress]
        : []),
    ]),
  ];
  if (!walletAddresses.length) {
    return json(
      { status: "wallet_required", error: "No wallet is linked" },
      { status: 404 },
    );
  }

  try {
    const holdings = await fetchWalletsNftHoldings(env, {
      walletAddresses,
      page: url.searchParams.has("page")
        ? Number(url.searchParams.get("page"))
        : undefined,
      limit: url.searchParams.has("limit")
        ? Number(url.searchParams.get("limit"))
        : undefined,
    });
    return json({ status: "ready", ...holdings });
  } catch (error) {
    console.error("[trading-bot] NFT holdings lookup failed", error);
    const notConfigured =
      error instanceof Error && error.message.includes("not configured");
    return json(
      {
        status: "unavailable",
        error: "NFT holdings are temporarily unavailable",
      },
      { status: notConfigured ? 503 : 502 },
    );
  }
}

export async function getTradingBotPnl(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const telegramUserId = stringValue(url.searchParams.get("telegramUserId"));
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return json({ error: "telegramUserId is required" }, { status: 400 });
  }

  const store = tradingBotAccountStore(env, telegramUserId);
  if (!store) {
    return json(
      {
        status: "not_configured",
        required: ["TRADING_BOT_ACCOUNTS"],
      },
      { status: 503 },
    );
  }

  const rpcUrl = resolveRpcUrl(env);
  if (!rpcUrl) {
    return json(
      {
        status: "not_configured",
        required: ["SOLANA_RPC_URL"],
      },
      { status: 503 },
    );
  }

  const accountResult = await getStoredTradingBotAccount(env, telegramUserId);
  if ("error" in accountResult) {
    return json(
      { error: accountResult.error },
      { status: accountResult.status ?? 500 },
    );
  }
  const account = accountResult.account;
  if (!account) {
    return json({ status: "not_found", telegramUserId }, { status: 404 });
  }
  if (!account.solanaWalletAddress) {
    return json({ status: "no_wallet", telegramUserId }, { status: 409 });
  }

  try {
    const [events, positions] = await Promise.all([
      getStoredTradingBotEvents(env, telegramUserId, 500),
      loadTradingBotPositions(env, account.solanaWalletAddress),
    ]);
    const mints = [
      WRAPPED_SOL_MINT,
      ...positions.tokens.map((token) => token.mint),
      ...events
        .filter((event) => event.eventType === "swap_executed")
        .flatMap((event) => [
          stringValue(event.metadata.inMint),
          stringValue(event.metadata.outMint),
        ]),
    ].filter((mint): mint is string => Boolean(mint));
    const [fillReconciliation, prices] = await Promise.all([
      reconcileTradingBotSwapFills(
        env,
        telegramUserId,
        account.solanaWalletAddress,
        events,
      ),
      fetchJupiterPrices(env, uniqueStrings(mints).slice(0, 50)),
    ]);
    const report = buildTradingBotPnlReport({
      account,
      events: fillReconciliation.events,
      positions,
      prices,
      fillReconciliation,
    });

    return json(report, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[trading-bot] PNL lookup failed", error);
    return json(
      { error: "PNL service temporarily unavailable" },
      { status: 502 },
    );
  }
}

export async function getTradingBotActivity(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const telegramUserId = stringValue(url.searchParams.get("telegramUserId"));
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return json({ error: "telegramUserId is required" }, { status: 400 });
  }

  const store = tradingBotAccountStore(env, telegramUserId);
  if (!store) {
    return json(
      {
        status: "not_configured",
        required: ["TRADING_BOT_ACCOUNTS"],
      },
      { status: 503 },
    );
  }

  const limit = clampInteger(
    numberValue(url.searchParams.get("limit")),
    1,
    100,
    25,
  );
  try {
    await reconcileTradingBotPerpsDeposit(env, telegramUserId);
  } catch (error) {
    console.warn("[trading-bot] Perps deposit reconciliation failed", error);
  }
  const events = await getStoredTradingBotEvents(env, telegramUserId, limit);

  return json(
    {
      status: "ready",
      telegramUserId,
      generatedAt: new Date().toISOString(),
      summary: tradingBotActivitySummary(events),
      events,
      warnings: [
        "Activity is reconstructed from FTX/FrogX non-secret account events.",
        "This feed does not read private keys, sign transactions, broadcast transactions, or contact Telegram users.",
      ],
    },
    {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    },
  );
}

async function resolveTradingBotPerpsWallet(
  env: Env,
  telegramUserId: string,
  identity?: {
    privyUserId: string;
    authorityWalletAddress: string;
  },
): Promise<TradingBotPerpsWalletResolution> {
  if (!env.TRADING_BOT_ACCOUNTS) {
    return {
      error: "Trading account storage is not configured",
      status: 503,
    };
  }

  const accountResult = await getStoredTradingBotAccount(env, telegramUserId);
  if ("error" in accountResult) {
    return {
      error: accountResult.error,
      status: accountResult.status ?? 503,
    };
  }
  if (!accountResult.account) {
    return { error: "Account not found", status: 404 };
  }

  const wallet = tradingBotAccountWalletByRole(
    accountResult.account,
    "spot_nft",
  );
  if (!wallet) {
    return { error: "Spot & NFT wallet is not configured", status: 409 };
  }
  if (
    identity &&
    (accountResult.account.privyUserId !== identity.privyUserId ||
      wallet.walletSource !== "privy" ||
      wallet.solanaWalletAddress !== identity.authorityWalletAddress)
  ) {
    return { error: "Account identity does not match", status: 403 };
  }

  const previewResult = await getStoredTradingBotDeltaNeutralPreview(
    env,
    telegramUserId,
    wallet.solanaWalletAddress,
  );
  if ("error" in previewResult) return previewResult;

  const { preview, liveExecutionEnabled } = previewResult;
  return {
    snapshot: {
      telegramUserId,
      authorityWalletAddress: wallet.solanaWalletAddress,
      profileAddress: preview.profileAddress,
      profileIndex: preview.profileIndex,
      profileUsdc: preview.profileUsdc,
      minimumProfileUsdc: preview.minimumProfileUsdc,
      funded: preview.profileFunded,
      fundingLocation: "imperial_profile",
      imperialProfileVerified: Boolean(preview.profileAddress),
      strategyReady: preview.liveReady,
      liveExecutionEnabled,
      blockers: preview.blockers,
    },
  };
}

export async function getAuthenticatedTradingBotPerpsWalletSnapshot(
  env: Env,
  identity: {
    telegramUserId: string;
    privyUserId: string;
    authorityWalletAddress: string;
  },
): Promise<TradingBotProfilePerpsWalletResolution> {
  const store = tradingBotAccountStore(env, identity.telegramUserId);
  if (!store) {
    return {
      error: "Trading account storage is not configured",
      status: 503,
    };
  }

  const response = await store.fetch(
    new Request("https://trading-bot-account.local/imperial-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(identity),
    }),
  );
  const data = (await response.json().catch(() => null)) as unknown;
  const record = recordValue(data);
  if (!response.ok) {
    return {
      error:
        stringValue(record?.error) ?? "Imperial profile is temporarily unavailable",
      status: response.status,
    };
  }

  const snapshotRecord = recordValue(record?.snapshot);
  const profileAddress = stringValue(snapshotRecord?.profileAddress);
  const authorityWalletAddress = stringValue(
    snapshotRecord?.authorityWalletAddress,
  );
  const profileUsdc = numberValue(snapshotRecord?.profileUsdc);
  const minimumProfileUsdc = numberValue(
    snapshotRecord?.minimumProfileUsdc,
  );
  const balanceUpdatedAt = stringValue(snapshotRecord?.balanceUpdatedAt);
  if (
    !profileAddress ||
    !SOLANA_ADDRESS_PATTERN.test(profileAddress) ||
    authorityWalletAddress !== identity.authorityWalletAddress ||
    !Number.isFinite(profileUsdc) ||
    Number(profileUsdc) < 0 ||
    !Number.isFinite(minimumProfileUsdc) ||
    Number(minimumProfileUsdc) < 0 ||
    !balanceUpdatedAt ||
    !Number.isFinite(Date.parse(balanceUpdatedAt))
  ) {
    return { error: "Imperial returned an invalid profile", status: 502 };
  }

  return {
    snapshot: {
      telegramUserId: identity.telegramUserId,
      authorityWalletAddress,
      profileAddress,
      profileIndex: DELTA_NEUTRAL_PROFILE_INDEX,
      profileUsdc: Number(profileUsdc),
      minimumProfileUsdc: Number(minimumProfileUsdc),
      funded: snapshotRecord?.funded === true,
      fundingLocation: "imperial_profile",
      imperialProfileVerified: true,
      balanceStatus:
        snapshotRecord?.balanceStatus === "cached" ? "cached" : "live",
      balanceUpdatedAt,
    },
  };
}

export async function getTradingBotPerpsStatus(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const telegramUserId = stringValue(url.searchParams.get("telegramUserId"));
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return json({ error: "telegramUserId is required" }, { status: 400 });
  }
  try {
    const resolution = await resolveTradingBotPerpsWallet(
      env,
      telegramUserId,
    );
    if ("error" in resolution) {
      if (resolution.status === 404) {
        return json(
          { status: "not_found", telegramUserId },
          { status: 404 },
        );
      }
      if (
        resolution.status === 409 &&
        resolution.error === "Spot & NFT wallet is not configured"
      ) {
        return json({ status: "no_wallet", telegramUserId });
      }
      if (
        resolution.status === 503 &&
        resolution.error === "Trading account storage is not configured"
      ) {
        return json(
          { status: "not_configured", required: ["TRADING_BOT_ACCOUNTS"] },
          { status: 503 },
        );
      }
      return json(
        { error: resolution.error },
        { status: resolution.status },
      );
    }

    const { snapshot } = resolution;
    const eventId = snapshot.profileAddress
      ? `imperial-profile-funded:${snapshot.profileAddress}`
      : null;
    if (
      snapshot.funded &&
      eventId &&
      !(await getStoredTradingBotEvent(env, telegramUserId, eventId))
    ) {
      await recordTradingBotAccountEvent(env, telegramUserId, {
        eventId,
        eventType: "imperial_deposit_confirmed",
        metadata: {
          authorityWalletAddress: snapshot.authorityWalletAddress,
          profileAddress: snapshot.profileAddress,
          profileIndex: snapshot.profileIndex,
          uiAmountString: String(snapshot.profileUsdc),
          minimumUiAmountString: String(snapshot.minimumProfileUsdc),
          fundingLocation: "imperial_profile",
        },
      });
    }

    return json(
      {
        status: "ready",
        ...snapshot,
        checkedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      },
    );
  } catch (error) {
    console.error("[trading-bot] Perps status lookup failed", error);
    return json(
      { error: "Perps status temporarily unavailable" },
      { status: 502 },
    );
  }
}

export async function postTradingBotDeltaNeutralPreview(
  request: Request,
  env: Env,
): Promise<Response> {
  return forwardTradingBotDeltaNeutralRequest(request, env, "preview", false);
}

export async function postTradingBotDeltaNeutralStart(
  request: Request,
  env: Env,
): Promise<Response> {
  return forwardTradingBotDeltaNeutralRequest(request, env, "start", true);
}

export async function postTradingBotDeltaNeutralStatus(
  request: Request,
  env: Env,
): Promise<Response> {
  return forwardTradingBotDeltaNeutralRequest(request, env, "status", false);
}

export async function postTradingBotDeltaNeutralStop(
  request: Request,
  env: Env,
): Promise<Response> {
  return forwardTradingBotDeltaNeutralRequest(request, env, "stop", false);
}

export async function getTradingBotOperatorReviews(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotOperatorRequest(request, env);
  if (auth === "missing") {
    return json(
      { status: "not_configured", required: ["TRADING_BOT_OPERATOR_TOKEN"] },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const store = tradingBotOrderStore(env);
  if (!store) {
    return json(
      { status: "not_configured", required: ["TRADING_BOT_ACCOUNTS"] },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const status = manualReviewCaseStatusFilterValue(
    url.searchParams.get("status"),
  );
  if (!status) return json({ error: "status is invalid" }, { status: 400 });
  const limit = clampInteger(
    numberValue(url.searchParams.get("limit")),
    1,
    500,
    DEFAULT_TRADING_BOT_MANUAL_REVIEW_LIMIT,
  );
  const response = await store.fetch(
    new Request(
      `https://trading-bot-account.local/manual-reviews?status=${status}&limit=${limit}`,
    ),
  );
  if (!response.ok) return response;
  const data = (await response.json()) as {
    cases?: TradingBotManualReviewCase[];
  };
  const cases = data.cases ?? [];
  return json(
    {
      status: "ready",
      filter: status,
      generatedAt: new Date().toISOString(),
      count: cases.length,
      cases,
      automaticRetry: false,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function postTradingBotOperatorReviewAcknowledge(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotOperatorRequest(request, env);
  if (auth === "missing") {
    return json(
      { status: "not_configured", required: ["TRADING_BOT_OPERATOR_TOKEN"] },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: TradingBotOperatorReviewBody;
  try {
    body = (await request.json()) as TradingBotOperatorReviewBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const caseId = stringValue(body.caseId);
  const note = stringValue(body.note)?.slice(0, 240);
  if (!caseId || !TRADING_BOT_EXECUTION_REFERENCE_PATTERN.test(caseId)) {
    return json({ error: "caseId is required" }, { status: 400 });
  }
  const store = tradingBotOrderStore(env);
  if (!store) {
    return json(
      { status: "not_configured", required: ["TRADING_BOT_ACCOUNTS"] },
      { status: 503 },
    );
  }
  const response = await store.fetch(
    new Request("https://trading-bot-account.local/manual-review/acknowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId, note }),
    }),
  );
  const data = (await response.json()) as {
    error?: string;
    case?: TradingBotManualReviewCase;
  };
  if (!response.ok || !data.case) {
    return json(
      { error: data.error ?? "Manual review acknowledgement failed" },
      { status: response.status },
    );
  }
  await recordTradingBotManualReviewAcknowledgementEvent(env, data.case);
  return json(
    { status: "acknowledged", case: data.case },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function postTradingBotOperatorReviewReconcile(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotOperatorRequest(request, env);
  if (auth === "missing") {
    return json(
      { status: "not_configured", required: ["TRADING_BOT_OPERATOR_TOKEN"] },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: TradingBotOperatorReviewBody;
  try {
    body = (await request.json()) as TradingBotOperatorReviewBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const caseId = stringValue(body.caseId);
  const note = stringValue(body.note)?.slice(0, 240);
  if (!caseId || !TRADING_BOT_EXECUTION_REFERENCE_PATTERN.test(caseId)) {
    return json({ error: "caseId is required" }, { status: 400 });
  }
  const store = tradingBotOrderStore(env);
  if (!store) {
    return json(
      { status: "not_configured", required: ["TRADING_BOT_ACCOUNTS"] },
      { status: 503 },
    );
  }
  let reviewCase = await getStoredTradingBotManualReviewCase(store, caseId);
  if (!reviewCase) {
    return json({ error: "Manual review case not found" }, { status: 404 });
  }
  if (reviewCase.status === "resolved") {
    return json(
      {
        status: "resolved",
        case: reviewCase,
        automaticRetry: false,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  if (reviewCase.status === "open") {
    const acknowledged = await acknowledgeStoredTradingBotManualReviewCase(
      store,
      caseId,
      note,
    );
    if (!acknowledged) {
      return json(
        { error: "Manual review acknowledgement failed" },
        { status: 503 },
      );
    }
    reviewCase = acknowledged;
    await recordTradingBotManualReviewAcknowledgementEvent(env, acknowledged);
  }

  const evidence = await reconcileTradingBotManualReviewCase(
    env,
    store,
    reviewCase,
  );
  const updated = await updateStoredTradingBotManualReviewCaseCheck(
    store,
    reviewCase.caseId,
    evidence,
  );
  if (!updated) {
    return json({ error: "Manual review case update failed" }, { status: 503 });
  }
  if (evidence.resolution) {
    await recordTradingBotManualReviewResolutionEvent(env, updated, evidence);
  }
  return json(
    {
      status: evidence.resolution ? "resolved" : "unresolved",
      case: updated,
      evidence,
      automaticRetry: false,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function getTradingBotReferrals(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const telegramUserId = stringValue(url.searchParams.get("telegramUserId"));
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return json({ error: "telegramUserId is required" }, { status: 400 });
  }

  const store = tradingBotAccountStore(env, telegramUserId);
  if (!store) {
    return json(
      {
        status: "not_configured",
        required: ["TRADING_BOT_ACCOUNTS"],
      },
      { status: 503 },
    );
  }

  const response = await store.fetch(
    new Request(
      `https://trading-bot-account.local/referral?telegramUserId=${encodeURIComponent(
        telegramUserId,
      )}`,
    ),
  );
  const data = await response.json();
  return json(data, { status: response.status });
}

export async function postTradingBotReferral(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TradingBotReferralBody;
  try {
    body = (await request.json()) as TradingBotReferralBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const telegramUserId = stringValue(body.telegramUserId);
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return json({ error: "telegramUserId is required" }, { status: 400 });
  }

  const store = tradingBotAccountStore(env, telegramUserId);
  if (!store) {
    return json(
      {
        status: "not_configured",
        required: ["TRADING_BOT_ACCOUNTS"],
      },
      { status: 503 },
    );
  }

  const response = await store.fetch(
    new Request("https://trading-bot-account.local/referral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const data = await response.json();
  return json(data, { status: response.status });
}

export async function postTradingBotControlCode(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TradingBotControlCodeBody;
  try {
    body = (await request.json()) as TradingBotControlCodeBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const telegramUserId = stringValue(body.telegramUserId);
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return json({ error: "telegramUserId is required" }, { status: 400 });
  }

  const store = tradingBotAccountStore(env, telegramUserId);
  if (!store) {
    return json(
      {
        status: "not_configured",
        required: ["TRADING_BOT_ACCOUNTS"],
      },
      { status: 503 },
    );
  }

  const response = await store.fetch(
    new Request("https://trading-bot-account.local/control-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const data = (await response.json()) as Record<string, unknown>;
  return json(
    {
      ...data,
      controlUrl: env.RIBBOT_CONTROL_URL?.trim() || null,
    },
    { status: response.status },
  );
}

export async function postTradingBotSetupReset(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TradingBotSetupResetBody;
  try {
    body = (await request.json()) as TradingBotSetupResetBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const telegramUserId = stringValue(body.telegramUserId);
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return json({ error: "telegramUserId is required" }, { status: 400 });
  }

  const store = tradingBotAccountStore(env, telegramUserId);
  if (!store) {
    return json(
      {
        status: "not_configured",
        required: ["TRADING_BOT_ACCOUNTS"],
      },
      { status: 503 },
    );
  }

  return store.fetch(
    new Request("https://trading-bot-account.local/setup-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function postTradingBotControlSession(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: TradingBotControlSessionBody;
  try {
    body = (await request.json()) as TradingBotControlSessionBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const telegramUserId = stringValue(body.telegramUserId);
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return json({ error: "telegramUserId is required" }, { status: 400 });
  }

  const store = tradingBotAccountStore(env, telegramUserId);
  if (!store) {
    return json(
      {
        status: "not_configured",
        required: ["TRADING_BOT_ACCOUNTS"],
      },
      { status: 503 },
    );
  }

  const response = await store.fetch(
    new Request("https://trading-bot-account.local/control-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  if (!response.ok) return response;

  const data = (await response.json()) as Record<string, unknown> & {
    account?: TradingBotAccountSnapshot;
  };
  const config = resolvePrivyConfig(env);
  const automationSigner = config
    ? automationSignerDescriptor(config)
    : null;
  let automationSignerReady = false;
  const spotWallet = data.account
    ? spotNftPrivyWallet(data.account)
    : null;

  if (config && automationSigner && spotWallet?.privyWalletId) {
    try {
      const privyWallet = await getPrivyWallet(
        config,
        spotWallet.privyWalletId,
      );
      automationSignerReady =
        privyWallet.id === spotWallet.privyWalletId &&
        privyWallet.address === spotWallet.solanaWalletAddress &&
        privyWallet.chain_type === "solana" &&
        hasConfiguredAutomationSigner(privyWallet, config);
    } catch {
      automationSignerReady = false;
    }
  }

  return json(
    {
      ...data,
      automationSigner,
      automationSignerReady,
    },
    { status: response.status },
  );
}

export async function postTradingBotControlImperial(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: TradingBotControlImperialBody;
  try {
    body = (await request.json()) as TradingBotControlImperialBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const telegramUserId = stringValue(body.telegramUserId);
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return json({ error: "telegramUserId is required" }, { status: 400 });
  }

  const store = tradingBotAccountStore(env, telegramUserId);
  if (!store) {
    return json(
      {
        status: "not_configured",
        required: ["TRADING_BOT_ACCOUNTS"],
      },
      { status: 503 },
    );
  }

  return store.fetch(
    new Request("https://trading-bot-account.local/control-imperial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function postTradingBotControlPreference(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: TradingBotControlPreferenceBody;
  try {
    body = (await request.json()) as TradingBotControlPreferenceBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const telegramUserId = stringValue(body.telegramUserId);
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return json({ error: "telegramUserId is required" }, { status: 400 });
  }

  const store = tradingBotAccountStore(env, telegramUserId);
  if (!store) {
    return json(
      {
        status: "not_configured",
        required: ["TRADING_BOT_ACCOUNTS"],
      },
      { status: 503 },
    );
  }

  return store.fetch(
    new Request("https://trading-bot-account.local/control-preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function postTradingBotControlWallet(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: TradingBotControlWalletBody;
  try {
    body = (await request.json()) as TradingBotControlWalletBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const telegramUserId = stringValue(body.telegramUserId);
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return json({ error: "telegramUserId is required" }, { status: 400 });
  }

  const store = tradingBotAccountStore(env, telegramUserId);
  if (!store) {
    return json(
      {
        status: "not_configured",
        required: ["TRADING_BOT_ACCOUNTS"],
      },
      { status: 503 },
    );
  }

  const action = controlWalletActionValue(body.action);
  const response = await store.fetch(
    new Request("https://trading-bot-account.local/control-wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...body,
        claimUrl:
          env.RIBBOT_WALLET_CLAIM_URL?.trim() ||
          env.RIBBOT_CONTROL_URL?.trim() ||
          null,
      }),
    }),
  );
  if (action !== "verify_signer" || !response.ok) return response;

  const data = (await response.json()) as Record<string, unknown> & {
    account?: TradingBotAccountSnapshot;
  };
  const config = resolvePrivyConfig(env);
  const automationSigner = config
    ? automationSignerDescriptor(config)
    : null;
  if (!config || !automationSigner) {
    return json(
      { error: "Ribbot automation signer is not configured" },
      { status: 503 },
    );
  }

  const spotWallet = data.account
    ? spotNftPrivyWallet(data.account)
    : null;
  if (!spotWallet?.privyWalletId) {
    return json(
      { error: "Spot & NFT Wallet (Privy) is unavailable" },
      { status: 409 },
    );
  }

  try {
    const privyWallet = await getPrivyWallet(config, spotWallet.privyWalletId);
    const automationSignerReady =
      privyWallet.id === spotWallet.privyWalletId &&
      privyWallet.address === spotWallet.solanaWalletAddress &&
      privyWallet.chain_type === "solana" &&
      hasConfiguredAutomationSigner(privyWallet, config);
    if (!automationSignerReady) {
      return json(
        {
          error: "Privy did not confirm Ribbot access",
          automationSignerReady: false,
        },
        { status: 409 },
      );
    }
    return json({ ...data, automationSignerReady: true });
  } catch {
    return json(
      { error: "Privy wallet verification is temporarily unavailable" },
      { status: 503 },
    );
  }
}

export async function postTradingBotWallet(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: TradingBotWalletBody;
  try {
    body = (await request.json()) as TradingBotWalletBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const telegramUserId = stringValue(body.telegramUserId);
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return json({ error: "telegramUserId is required" }, { status: 400 });
  }

  const username = stringValue(body.username);
  const externalAddress = stringValue(body.externalAddress);
  const action = stringValue(body.action);
  const walletId = stringValue(body.walletId);

  if (action && action !== "select") {
    return json({ error: "action must be select" }, { status: 400 });
  }

  if (action === "select") {
    const auth = authorizeTradingBotRequest(request, env);
    if (auth === "missing") {
      return json(
        { status: "not_configured", required: ["RIBBOT_TRADING_BOT_TOKEN"] },
        { status: 503 },
      );
    }
    if (auth === "denied") {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!walletId) {
      return json({ error: "walletId is required" }, { status: 400 });
    }
    const selection = await selectStoredTradingBotWallet(env, {
      telegramUserId,
      walletId,
    });
    if (selection.status === "not_configured") {
      return json(selection, { status: 503 });
    }
    if (selection.error || !selection.account) {
      return json(
        { error: selection.error ?? "Wallet selection failed" },
        { status: selection.responseStatus ?? 500 },
      );
    }
    const account = selection.account;
    return json({
      status: "ready",
      walletSource: account.walletSource,
      privyUserId: account.privyUserId,
      privyWalletId: account.privyWalletId,
      solanaWalletAddress: account.solanaWalletAddress,
      activeWalletId: account.activeWalletId,
      wallets: account.wallets,
      account,
    });
  }

  const privyConfig = resolvePrivyConfig(env);

  if (externalAddress) {
    if (!SOLANA_ADDRESS_PATTERN.test(externalAddress)) {
      return json(
        { error: "externalAddress must be a Solana address" },
        { status: 400 },
      );
    }

    const account =
      authorizeTradingBotRequest(request, env) === "allowed"
        ? await upsertTradingBotWallet(env, {
            telegramUserId,
            username,
            walletSource: "external",
            solanaWalletAddress: externalAddress,
          })
        : undefined;

    return json({
      status: "ready",
      walletSource: "external",
      solanaWalletAddress: externalAddress,
      ...(account ? { account } : {}),
    });
  }

  if (!privyConfig) {
    return json({
      status: "not_configured",
      required: ["PRIVY_APP_ID", "PRIVY_APP_SECRET"],
    });
  }

  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const privyUser =
      (await getUserByTelegramId(privyConfig, telegramUserId)) ??
      (await createTelegramUser(privyConfig, telegramUserId, username));

    const existingWallet = findSolanaWallets(privyUser)[0];
    const provisionedWallet: PrivyWallet = existingWallet
      ? {
          id: existingWallet.id as string,
          address: existingWallet.address as string,
          chain_type: "solana",
        }
      : await createSolanaWallet(
          privyConfig,
          privyUser.id,
          telegramUserId,
          0,
        );
    const managedWallets = [provisionedWallet].map((wallet) => ({
      walletId: wallet.id,
      label: SPOT_NFT_WALLET_LABEL,
      role: "spot_nft" as const,
      walletSource: "privy" as const,
      privyUserId: privyUser.id,
      privyWalletId: wallet.id,
      solanaWalletAddress: wallet.address,
      createdAt: new Date().toISOString(),
    }));
    const account = await syncTradingBotPrivyWallets(env, {
      telegramUserId,
      username,
      privyUserId: privyUser.id,
      wallets: managedWallets,
    });
    const activeWallet =
      account?.wallets.find(
        (wallet) => wallet.walletId === account.activeWalletId,
      ) ?? managedWallets[0];

    return json({
      status: "ready",
      walletSource: "privy",
      privyUserId: privyUser.id,
      privyWalletId: activeWallet.privyWalletId,
      solanaWalletAddress: activeWallet.solanaWalletAddress,
      activeWalletId: activeWallet.walletId,
      wallets: account?.wallets ?? managedWallets,
      signerConfigured: signerConfigured(privyConfig),
      ...(account ? { account } : {}),
    });
  } catch (error) {
    console.error("[trading-bot] Privy wallet setup failed", error);
    return json(
      { error: "Wallet service temporarily unavailable" },
      { status: 502 },
    );
  }
}

export async function postTradingBotSwap(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TradingBotSwapBody;
  try {
    body = (await request.json()) as TradingBotSwapBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = normalizeTradingBotSwap(body);
  if ("error" in result) {
    return json({ error: result.error }, { status: 400 });
  }

  return buildTradingBotSwap(result.normalized, request.url, env);
}

export async function postTradingBotExecution(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TradingBotExecutionBody;
  try {
    body = (await request.json()) as TradingBotExecutionBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = normalizeTradingBotExecution(body);
  if ("error" in result) {
    return json({ error: result.error }, { status: 400 });
  }
  const normalized = result.normalized;

  const missing = tradingBotExecutionMissingRequirements(env);
  if (missing.length > 0) {
    return json(
      {
        status: "not_configured",
        required: missing,
      },
      { status: 503 },
    );
  }

  const accountResult = await getStoredTradingBotAccount(
    env,
    normalized.telegramUserId,
  );
  if ("error" in accountResult) {
    return json(
      { error: accountResult.error },
      { status: accountResult.status ?? 500 },
    );
  }

  const account = accountResult.account;
  if (!account) {
    return json({ error: "Trading account not found" }, { status: 404 });
  }
  const spotWallet = spotNftPrivyWallet(account);
  if (!spotWallet?.privyWalletId) {
    return json(
      { error: "Live execution requires Spot & NFT Wallet (Privy)" },
      { status: 409 },
    );
  }
  if (spotWallet.solanaWalletAddress !== normalized.userPublicKey) {
    return json({ error: "Trading wallet mismatch" }, { status: 409 });
  }
  if (account.botAccessRevokedAt) {
    return json(
      {
        status: "revoked",
        error: "FTX bot access has been revoked for this account",
        revokedAt: account.botAccessRevokedAt,
      },
      { status: 409 },
    );
  }

  if (normalized.executionMode === "instant_auto_buy") {
    if (
      normalized.inMint !== WRAPPED_SOL_MINT ||
      normalized.outMint === WRAPPED_SOL_MINT
    ) {
      return json(
        {
          status: "not_executable",
          error: "Instant Auto Buy only supports SOL-to-token buys",
        },
        { status: 409 },
      );
    }
    if (!account.settings.instantAutoBuyEnabled) {
      return json(
        {
          status: "not_executable",
          error: "Instant Auto Buy is disabled in the FTX account",
        },
        { status: 409 },
      );
    }
    if (
      normalized.amountIn !== account.settings.instantAutoBuyAmountIn ||
      normalized.slippageBps !== account.settings.slippageBps ||
      normalized.priorityFee !== account.settings.priorityFee
    ) {
      return json(
        {
          status: "not_executable",
          error: "Instant Auto Buy request does not match FTX account settings",
        },
        { status: 409 },
      );
    }

    try {
      const review = await loadTradingBotMarketRisk(env, {
        telegramUserId: normalized.telegramUserId,
        userPublicKey: normalized.userPublicKey,
        mint: normalized.outMint,
        amountIn: normalized.amountIn,
        slippageBps: account.settings.slippageBps,
        priorityFee: account.settings.priorityFee,
        minLiquidityUsd: account.settings.instantAutoBuyMinLiquidityUsd,
        maxMarketCapUsd: account.settings.instantAutoBuyMaxMarketCapUsd,
        maxPriceImpactBps: Math.max(account.settings.slippageBps, 1500),
        requestUrl: request.url,
      });
      const danger = review.risk.flags.find(
        (flag) => flag.severity === "danger",
      );
      if (danger) {
        return json(
          {
            status: "not_executable",
            error: `Instant Auto Buy market-risk check failed: ${danger.message}`,
          },
          { status: 409 },
        );
      }
      if (review.quoteProbe.status !== "ready") {
        return json(
          {
            status: "not_executable",
            error: `Instant Auto Buy blocked before execution: ${tradingBotQuoteProbeBlockingReason(review.quoteProbe)}`,
          },
          { status: 409 },
        );
      }
      if (!review.quoteProbe.executable) {
        return json(
          {
            status: "not_executable",
            error: "Instant Auto Buy quote probe is not executable",
          },
          { status: 409 },
        );
      }
      if (
        account.settings.instantAutoBuyMaxMarketCapUsd !== undefined &&
        review.marketCap.withinLimit !== true
      ) {
        return json(
          {
            status: "not_executable",
            error:
              "Instant Auto Buy could not verify the configured market-cap limit",
          },
          { status: 409 },
        );
      }
    } catch (error) {
      console.warn("[trading-bot] Instant Auto Buy risk check failed", error);
      return json(
        {
          status: "not_executable",
          error: "Instant Auto Buy risk checks are temporarily unavailable",
        },
        { status: 503 },
      );
    }
  }

  const swapResponse = await buildTradingBotSwap(normalized, request.url, env);
  const swap = (await swapResponse.json()) as TradingBotSwapBuildResult;
  if (!swapResponse.ok || swap.error) {
    return json(
      { error: "Swap service temporarily unavailable" },
      { status: swapResponse.status || 502 },
    );
  }
  if (swap.mode !== "tx_base64" || !swap.txBase64) {
    return json(
      {
        status: "not_executable",
        error: "FrogX returned a route-only swap payload",
      },
      { status: 409 },
    );
  }

  const privyConfig = resolvePrivyConfig(env);
  if (!privyConfig || !signerConfigured(privyConfig)) {
    return json(
      {
        status: "not_configured",
        required: [
          "PRIVY_APP_ID",
          "PRIVY_APP_SECRET",
          "PRIVY_AUTHORIZATION_KEY_ID",
          "PRIVY_AUTHORIZATION_PRIVATE_KEY",
        ],
      },
      { status: 503 },
    );
  }

  const quote = await tryBuildTradingBotQuote(normalized, request.url, env);
  const referenceId = await tradingBotExecutionReferenceId(
    normalized.telegramUserId,
    normalized.orderId,
  );
  let execution: PrivySolanaSignAndSendResponse;
  try {
    execution = await privySignAndSendSolanaTransaction(privyConfig, {
      walletId: spotWallet.privyWalletId,
      transactionBase64: swap.txBase64,
      referenceId,
      sponsor: boolFlag(env.TRADING_BOT_SOLANA_GAS_SPONSORSHIP_ENABLED),
    });
  } catch (error) {
    console.error(
      "[trading-bot] Privy swap execution status is ambiguous",
      error,
    );
    const reconciliation = await recordTradingBotDirectReconciliationRequired(
      env,
      {
        executionKind: "swap",
        executionId: normalized.orderId,
        telegramUserId: normalized.telegramUserId,
        userPublicKey: normalized.userPublicKey,
        referenceId,
      },
    );
    return json(
      {
        status: "pending_reconciliation",
        referenceId,
        executionStartedAt: reconciliation.executionStartedAt,
        ...tradingBotManualReviewResponse(reconciliation),
        error:
          "FTX could not confirm the Privy response. Check execution status before taking another action; this request must not be resent blindly.",
      },
      { status: 503 },
    );
  }

  const signature = execution.data?.hash;
  const resolvedReferenceId = execution.data?.reference_id ?? referenceId;
  if (!signature) {
    const reconciliation = await recordTradingBotDirectReconciliationRequired(
      env,
      {
        executionKind: "swap",
        executionId: normalized.orderId,
        telegramUserId: normalized.telegramUserId,
        userPublicKey: normalized.userPublicKey,
        referenceId: resolvedReferenceId,
      },
    );
    return json(
      {
        status: "pending_reconciliation",
        transactionId: execution.data?.transaction_id ?? null,
        referenceId: resolvedReferenceId,
        executionStartedAt: reconciliation.executionStartedAt,
        ...tradingBotManualReviewResponse(reconciliation),
        error:
          "Privy accepted the request without returning a transaction hash. Check execution status before taking another action.",
      },
      { status: 503 },
    );
  }

  const executedAt = new Date().toISOString();
  const responseBody = {
    status: "executed",
    mode: "privy_sign_and_send",
    signature,
    transactionId: execution.data?.transaction_id ?? null,
    referenceId: resolvedReferenceId,
    caip2: execution.data?.caip2 ?? SOLANA_MAINNET_CAIP2,
    signedTransactionAvailable: Boolean(execution.data?.signed_transaction),
    executedAt,
    solscanUrl: `https://solscan.io/tx/${signature}`,
  };
  await recordTradingBotAccountEvent(env, normalized.telegramUserId, {
    eventId: referenceId,
    eventType: "swap_executed",
    metadata: {
      orderId: normalized.orderId,
      executionMode: normalized.executionMode ?? "manual",
      walletAddress: normalized.userPublicKey,
      inMint: normalized.inMint,
      outMint: normalized.outMint,
      amountIn: normalized.amountIn,
      slippageBps: normalized.slippageBps,
      priorityFee: normalized.priorityFee,
      estimatedAmountOut: quote?.amountOut ?? null,
      quoteProvider: quote?.provider ?? null,
      quoteRouteId: quote?.routeId ?? null,
      signature: responseBody.signature,
      transactionId: responseBody.transactionId,
      referenceId: responseBody.referenceId,
      solscanUrl: responseBody.solscanUrl,
      executedAt,
    },
  });

  return json(responseBody);
}

export async function postTradingBotExecutionStatus(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      { status: "not_configured", required: ["RIBBOT_TRADING_BOT_TOKEN"] },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TradingBotExecutionStatusBody;
  try {
    body = (await request.json()) as TradingBotExecutionStatusBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = normalizeTradingBotExecution(body);
  if ("error" in result) {
    return json({ error: result.error }, { status: 400 });
  }
  const normalized = result.normalized;
  return getTradingBotDirectExecutionStatus(env, {
    executionKind: "swap",
    executionId: normalized.orderId,
    referenceSubject: normalized.orderId,
    telegramUserId: normalized.telegramUserId,
    userPublicKey: normalized.userPublicKey,
    successEventType: "swap_executed",
    failureEventType: "swap_execution_failed",
    eventMetadata: {
      orderId: normalized.orderId,
      walletAddress: normalized.userPublicKey,
      inMint: normalized.inMint,
      outMint: normalized.outMint,
      amountIn: normalized.amountIn,
      slippageBps: normalized.slippageBps,
      priorityFee: normalized.priorityFee,
    },
  });
}

export async function postTradingBotOrderValidation(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TradingBotOrderValidationBody;
  try {
    body = (await request.json()) as TradingBotOrderValidationBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = normalizeTradingBotOrder(body);
  if ("error" in result) {
    return json({ error: result.error }, { status: 400 });
  }

  return json({
    status: "accepted",
    orderKind: result.normalized.kind,
    normalized: result.normalized,
    warnings: orderValidationWarnings(
      result.normalized,
      isTradingBotSchedulerEnabled(env),
    ),
    validatedAt: new Date().toISOString(),
  });
}

export async function postTradingBotOrderStorage(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!env.TRADING_BOT_ACCOUNTS) {
    return json(
      {
        status: "not_configured",
        required: ["TRADING_BOT_ACCOUNTS"],
      },
      { status: 503 },
    );
  }

  let body: TradingBotOrderValidationBody;
  try {
    body = (await request.json()) as TradingBotOrderValidationBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = normalizeTradingBotOrder(body);
  if ("error" in result) {
    return json({ error: result.error }, { status: 400 });
  }

  const warnings = orderValidationWarnings(
    result.normalized,
    isTradingBotSchedulerEnabled(env),
  );
  const validatedAt = new Date().toISOString();
  const store = tradingBotOrderStore(env);
  if (!store) {
    return json(
      {
        status: "not_configured",
        required: ["TRADING_BOT_ACCOUNTS"],
      },
      { status: 503 },
    );
  }

  const response = await store.fetch(
    new Request("https://trading-bot-account.local/automation-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: generateTradingBotAutomationOrderId(),
        order: result.normalized,
        validation: {
          validatedAt,
          warnings,
        },
      }),
    }),
  );
  const data = await response.json();
  if (response.ok) {
    const stored = data as { order?: TradingBotStoredAutomationOrderSnapshot };
    if (stored.order) {
      await recordTradingBotAccountEvent(env, stored.order.telegramUserId, {
        eventType: "automation_order_staged",
        metadata: {
          orderId: stored.order.orderId,
          kind: stored.order.kind,
          side: stored.order.side,
          mint: stored.order.mint,
          walletAddress: stored.order.walletAddress,
        },
      });
    }
  }
  return json(data, { status: response.status });
}

export async function getTradingBotOrders(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!env.TRADING_BOT_ACCOUNTS) {
    return json(
      {
        status: "not_configured",
        required: ["TRADING_BOT_ACCOUNTS"],
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const telegramUserId = stringValue(url.searchParams.get("telegramUserId"));
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return json({ error: "telegramUserId is required" }, { status: 400 });
  }

  const store = tradingBotOrderStore(env);
  if (!store) {
    return json(
      {
        status: "not_configured",
        required: ["TRADING_BOT_ACCOUNTS"],
      },
      { status: 503 },
    );
  }

  const response = await store.fetch(
    new Request(
      `https://trading-bot-account.local/automation-orders?telegramUserId=${telegramUserId}`,
    ),
  );
  const data = await response.json();
  return json(data, { status: response.status });
}

export async function postTradingBotOrderCancel(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!env.TRADING_BOT_ACCOUNTS) {
    return json(
      {
        status: "not_configured",
        required: ["TRADING_BOT_ACCOUNTS"],
      },
      { status: 503 },
    );
  }

  let body: { telegramUserId?: unknown; orderId?: unknown };
  try {
    body = (await request.json()) as {
      telegramUserId?: unknown;
      orderId?: unknown;
    };
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const telegramUserId = stringValue(body.telegramUserId);
  const orderId = stringValue(body.orderId);
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return json({ error: "telegramUserId is required" }, { status: 400 });
  }
  if (!orderId || !TRADING_BOT_ORDER_ID_PATTERN.test(orderId)) {
    return json({ error: "orderId is required" }, { status: 400 });
  }

  const store = tradingBotOrderStore(env);
  if (!store) {
    return json(
      {
        status: "not_configured",
        required: ["TRADING_BOT_ACCOUNTS"],
      },
      { status: 503 },
    );
  }

  const response = await store.fetch(
    new Request("https://trading-bot-account.local/automation-order/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramUserId, orderId }),
    }),
  );
  const data = await response.json();
  if (response.ok) {
    const cancelled = data as {
      order?: TradingBotStoredAutomationOrderSnapshot;
    };
    if (cancelled.order) {
      await recordTradingBotAccountEvent(env, cancelled.order.telegramUserId, {
        eventType: "automation_order_cancelled",
        metadata: {
          orderId: cancelled.order.orderId,
          kind: cancelled.order.kind,
          side: cancelled.order.side,
          mint: cancelled.order.mint,
        },
      });
    }
  }
  return json(data, { status: response.status });
}

export async function postTradingBotWithdrawalValidation(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TradingBotWithdrawalValidationBody;
  try {
    body = (await request.json()) as TradingBotWithdrawalValidationBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = normalizeTradingBotWithdrawal(body);
  if ("error" in result) {
    return json({ error: result.error }, { status: 400 });
  }

  return json({
    status: "accepted",
    normalized: result.normalized,
    warnings: withdrawalValidationWarnings(result.normalized),
    validatedAt: new Date().toISOString(),
  });
}

export async function postTradingBotWithdrawalExecution(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TradingBotWithdrawalExecutionBody;
  try {
    body = (await request.json()) as TradingBotWithdrawalExecutionBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = normalizeTradingBotWithdrawalExecution(body);
  if ("error" in result) {
    return json({ error: result.error }, { status: 400 });
  }

  const normalized = result.normalized;
  const missingRequirements =
    tradingBotWithdrawalExecutionMissingRequirements(env);
  if (missingRequirements.length > 0) {
    return json(
      {
        status: "not_configured",
        required: missingRequirements,
      },
      { status: 503 },
    );
  }

  const accountResult = await getStoredTradingBotAccount(
    env,
    normalized.telegramUserId,
  );
  if ("error" in accountResult) {
    return json(
      { error: accountResult.error },
      { status: accountResult.status ?? 500 },
    );
  }

  const account = accountResult.account;
  if (!account) {
    return json({ error: "Trading account not found" }, { status: 404 });
  }
  const spotWallet = spotNftPrivyWallet(account);
  if (!spotWallet?.privyWalletId) {
    return json(
      { error: "Live withdrawals require Spot & NFT Wallet (Privy)" },
      { status: 409 },
    );
  }
  if (spotWallet.solanaWalletAddress !== normalized.userPublicKey) {
    return json({ error: "Trading wallet mismatch" }, { status: 409 });
  }
  if (account.botAccessRevokedAt) {
    return json(
      {
        status: "revoked",
        error: "FTX bot access has been revoked for this account",
        revokedAt: account.botAccessRevokedAt,
      },
      { status: 409 },
    );
  }

  const privyConfig = resolvePrivyConfig(env);
  if (!privyConfig || !signerConfigured(privyConfig)) {
    return json(
      {
        status: "not_configured",
        required: [
          "PRIVY_APP_ID",
          "PRIVY_APP_SECRET",
          "PRIVY_AUTHORIZATION_KEY_ID",
          "PRIVY_AUTHORIZATION_PRIVATE_KEY",
        ],
      },
      { status: 503 },
    );
  }

  let transfer: TradingBotWithdrawalBuildResult;
  try {
    transfer = await buildTradingBotWithdrawalTransaction(normalized, env);
  } catch (error) {
    if (error instanceof TradingBotExecutionError) {
      return json(
        { status: "not_executable", error: error.message },
        { status: error.status },
      );
    }
    console.error("[trading-bot] Withdrawal transaction build failed", error);
    return json(
      {
        status: "not_executable",
        error:
          "Withdrawal transaction could not be built before Privy was called",
      },
      { status: 502 },
    );
  }

  const referenceId = await tradingBotExecutionReferenceId(
    normalized.telegramUserId,
    `withdrawal_${normalized.withdrawalId}`,
  );
  let execution: PrivySolanaSignAndSendResponse;
  try {
    execution = await privySignAndSendSolanaTransaction(privyConfig, {
      walletId: spotWallet.privyWalletId,
      transactionBase64: transfer.txBase64,
      referenceId,
      sponsor: boolFlag(env.TRADING_BOT_SOLANA_GAS_SPONSORSHIP_ENABLED),
    });
  } catch (error) {
    console.error(
      "[trading-bot] Privy withdrawal execution status is ambiguous",
      error,
    );
    const reconciliation = await recordTradingBotDirectReconciliationRequired(
      env,
      {
        executionKind: "withdrawal",
        executionId: normalized.withdrawalId,
        telegramUserId: normalized.telegramUserId,
        userPublicKey: normalized.userPublicKey,
        referenceId,
      },
    );
    return json(
      {
        status: "pending_reconciliation",
        referenceId,
        executionStartedAt: reconciliation.executionStartedAt,
        ...tradingBotManualReviewResponse(reconciliation),
        error:
          "FTX could not confirm the Privy response. Check withdrawal status before taking another action; this request must not be resent blindly.",
      },
      { status: 503 },
    );
  }

  const signature = execution.data?.hash;
  const resolvedReferenceId = execution.data?.reference_id ?? referenceId;
  if (!signature) {
    const reconciliation = await recordTradingBotDirectReconciliationRequired(
      env,
      {
        executionKind: "withdrawal",
        executionId: normalized.withdrawalId,
        telegramUserId: normalized.telegramUserId,
        userPublicKey: normalized.userPublicKey,
        referenceId: resolvedReferenceId,
      },
    );
    return json(
      {
        status: "pending_reconciliation",
        transactionId: execution.data?.transaction_id ?? null,
        referenceId: resolvedReferenceId,
        executionStartedAt: reconciliation.executionStartedAt,
        ...tradingBotManualReviewResponse(reconciliation),
        error:
          "Privy accepted the withdrawal without returning a transaction hash. Check withdrawal status before taking another action.",
      },
      { status: 503 },
    );
  }

  const executedAt = new Date().toISOString();
  const responseBody = {
    status: "executed",
    mode: "privy_sign_and_send",
    assetType: normalized.assetType,
    mint: normalized.mint,
    amountIn: normalized.amountIn,
    destinationAddress: normalized.destinationAddress,
    signature,
    transactionId: execution.data?.transaction_id ?? null,
    referenceId: resolvedReferenceId,
    caip2: execution.data?.caip2 ?? SOLANA_MAINNET_CAIP2,
    signedTransactionAvailable: Boolean(execution.data?.signed_transaction),
    sourceTokenAccount: transfer.sourceTokenAccount ?? null,
    destinationTokenAccount: transfer.destinationTokenAccount ?? null,
    createdDestinationTokenAccount:
      transfer.createdDestinationTokenAccount ?? false,
    executedAt,
    solscanUrl: `https://solscan.io/tx/${signature}`,
  };
  await recordTradingBotAccountEvent(env, normalized.telegramUserId, {
    eventId: referenceId,
    eventType: "withdrawal_executed",
    metadata: {
      withdrawalId: normalized.withdrawalId,
      walletAddress: normalized.userPublicKey,
      mint: normalized.mint,
      assetType: normalized.assetType,
      amountIn: normalized.amountIn,
      destinationAddress: normalized.destinationAddress,
      sourceTokenAccount: responseBody.sourceTokenAccount,
      destinationTokenAccount: responseBody.destinationTokenAccount,
      createdDestinationTokenAccount:
        responseBody.createdDestinationTokenAccount,
      signature: responseBody.signature,
      transactionId: responseBody.transactionId,
      referenceId: responseBody.referenceId,
      solscanUrl: responseBody.solscanUrl,
      executedAt,
    },
  });

  return json(responseBody);
}

export async function postTradingBotWithdrawalExecutionStatus(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      { status: "not_configured", required: ["RIBBOT_TRADING_BOT_TOKEN"] },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TradingBotWithdrawalExecutionStatusBody;
  try {
    body = (await request.json()) as TradingBotWithdrawalExecutionStatusBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = normalizeTradingBotWithdrawalExecution(body);
  if ("error" in result) {
    return json({ error: result.error }, { status: 400 });
  }
  const normalized = result.normalized;
  return getTradingBotDirectExecutionStatus(env, {
    executionKind: "withdrawal",
    executionId: normalized.withdrawalId,
    referenceSubject: `withdrawal_${normalized.withdrawalId}`,
    telegramUserId: normalized.telegramUserId,
    userPublicKey: normalized.userPublicKey,
    successEventType: "withdrawal_executed",
    failureEventType: "withdrawal_execution_failed",
    eventMetadata: {
      withdrawalId: normalized.withdrawalId,
      walletAddress: normalized.userPublicKey,
      mint: normalized.mint,
      assetType: normalized.assetType,
      amountIn: normalized.amountIn,
      destinationAddress: normalized.destinationAddress,
    },
  });
}

export async function postTradingBotCopyTradeValidation(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TradingBotCopyTradeValidationBody;
  try {
    body = (await request.json()) as TradingBotCopyTradeValidationBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = normalizeTradingBotCopyTrade(body);
  if ("error" in result) {
    return json({ error: result.error }, { status: 400 });
  }

  return json({
    status: "accepted",
    normalized: result.normalized,
    warnings: copyTradeValidationWarnings(result.normalized),
    validatedAt: new Date().toISOString(),
  });
}

export async function postTradingBotCopyTradeStorage(
  request: Request,
  env: Env,
): Promise<Response> {
  return postTradingBotAdvancedAutomationConfigStorage(
    request,
    env,
    "copytrade",
  );
}

export async function getTradingBotCopyTradeConfigs(
  request: Request,
  env: Env,
): Promise<Response> {
  return getTradingBotAdvancedAutomationConfigs(request, env, "copytrade");
}

export async function postTradingBotCopyTradeCancel(
  request: Request,
  env: Env,
): Promise<Response> {
  return postTradingBotAdvancedAutomationConfigCancel(
    request,
    env,
    "copytrade",
  );
}

export async function postTradingBotCopyTradeControl(
  request: Request,
  env: Env,
): Promise<Response> {
  return postTradingBotAdvancedAutomationConfigControl(
    request,
    env,
    "copytrade",
  );
}

export async function postTradingBotCopyTradeUpdate(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      { status: "not_configured", required: ["RIBBOT_TRADING_BOT_TOKEN"] },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!env.TRADING_BOT_ACCOUNTS) {
    return json(
      { status: "not_configured", required: ["TRADING_BOT_ACCOUNTS"] },
      { status: 503 },
    );
  }

  let body: TradingBotCopyTradeUpdateBody;
  try {
    body = (await request.json()) as TradingBotCopyTradeUpdateBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const configId = stringValue(body.configId);
  if (!configId || !TRADING_BOT_ADVANCED_CONFIG_ID_PATTERN.test(configId)) {
    return json({ error: "configId is required" }, { status: 400 });
  }
  const normalizedResult = normalizeTradingBotCopyTrade(body);
  if ("error" in normalizedResult) {
    return json({ error: normalizedResult.error }, { status: 400 });
  }

  const normalized = normalizedResult.normalized;
  const validatedAt = new Date().toISOString();
  const warnings = copyTradeValidationWarnings(normalized, true);
  warnings[0] = "FTX/FrogX updated this copytrade config.";
  warnings[1] =
    "The update request did not start a monitor, build a copied swap, sign, or broadcast.";
  const store = tradingBotOrderStore(env);
  if (!store) {
    return json(
      { status: "not_configured", required: ["TRADING_BOT_ACCOUNTS"] },
      { status: 503 },
    );
  }
  const response = await store.fetch(
    new Request("https://trading-bot-account.local/automation-config/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        configId,
        kind: "copytrade",
        config: normalized,
        validation: { validatedAt, warnings },
      }),
    }),
  );
  const data = (await response.json()) as {
    status?: string;
    targetChanged?: boolean;
    config?: TradingBotStoredAdvancedAutomationConfigSnapshot;
    error?: string;
  };
  if (response.ok && data.config) {
    await recordTradingBotAccountEvent(env, normalized.telegramUserId, {
      eventType: "advanced_automation_config_updated",
      metadata: {
        configId: data.config.configId,
        kind: data.config.kind,
        targetWallet: data.config.targetWallet,
        tag: data.config.tag,
        targetChanged: Boolean(data.targetChanged),
      },
    });
  }
  return json(data, { status: response.status });
}

export async function postTradingBotCopyTradeDuplicate(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      { status: "not_configured", required: ["RIBBOT_TRADING_BOT_TOKEN"] },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!env.TRADING_BOT_ACCOUNTS) {
    return json(
      { status: "not_configured", required: ["TRADING_BOT_ACCOUNTS"] },
      { status: 503 },
    );
  }

  let body: TradingBotCopyTradeDuplicateBody;
  try {
    body = (await request.json()) as TradingBotCopyTradeDuplicateBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const telegramUserId = stringValue(body.telegramUserId);
  const configId = stringValue(body.configId);
  const tag = copyTradeTagValue(body.tag);
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return json({ error: "telegramUserId is required" }, { status: 400 });
  }
  if (!configId || !TRADING_BOT_ADVANCED_CONFIG_ID_PATTERN.test(configId)) {
    return json({ error: "configId is required" }, { status: 400 });
  }
  if (body.tag !== undefined && !tag) {
    return json(
      { error: "tag must be 1 to 32 safe characters" },
      { status: 400 },
    );
  }

  const store = tradingBotOrderStore(env);
  if (!store) {
    return json(
      { status: "not_configured", required: ["TRADING_BOT_ACCOUNTS"] },
      { status: 503 },
    );
  }
  const response = await store.fetch(
    new Request(
      "https://trading-bot-account.local/automation-config/duplicate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramUserId,
          configId,
          kind: "copytrade",
          ...(tag ? { tag } : {}),
        }),
      },
    ),
  );
  const data = (await response.json()) as {
    status?: string;
    sourceConfigId?: string;
    config?: TradingBotStoredAdvancedAutomationConfigSnapshot;
    error?: string;
  };
  if (response.ok && data.config) {
    await recordTradingBotAccountEvent(env, telegramUserId, {
      eventType: "advanced_automation_config_duplicated",
      metadata: {
        sourceConfigId: data.sourceConfigId ?? configId,
        configId: data.config.configId,
        kind: data.config.kind,
        targetWallet: data.config.targetWallet,
        tag: data.config.tag,
      },
    });
  }
  return json(data, { status: response.status });
}

export async function postTradingBotCopyTradeExecutionStatus(
  request: Request,
  env: Env,
): Promise<Response> {
  return postTradingBotAdvancedAutomationExecutionStatus(
    request,
    env,
    "copytrade",
  );
}

export async function postTradingBotSniperValidation(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TradingBotSniperValidationBody;
  try {
    body = (await request.json()) as TradingBotSniperValidationBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = normalizeTradingBotSniper(body);
  if ("error" in result) {
    return json({ error: result.error }, { status: 400 });
  }

  return json({
    status: "accepted",
    normalized: result.normalized,
    warnings: sniperValidationWarnings(result.normalized),
    validatedAt: new Date().toISOString(),
  });
}

export async function postTradingBotSniperStorage(
  request: Request,
  env: Env,
): Promise<Response> {
  return postTradingBotAdvancedAutomationConfigStorage(request, env, "sniper");
}

export async function getTradingBotSniperConfigs(
  request: Request,
  env: Env,
): Promise<Response> {
  return getTradingBotAdvancedAutomationConfigs(request, env, "sniper");
}

export async function postTradingBotSniperCancel(
  request: Request,
  env: Env,
): Promise<Response> {
  return postTradingBotAdvancedAutomationConfigCancel(request, env, "sniper");
}

export async function postTradingBotSniperExecutionStatus(
  request: Request,
  env: Env,
): Promise<Response> {
  return postTradingBotAdvancedAutomationExecutionStatus(
    request,
    env,
    "sniper",
  );
}

export async function postTradingBotAutoBuyValidation(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TradingBotAutoBuyValidationBody;
  try {
    body = (await request.json()) as TradingBotAutoBuyValidationBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = normalizeTradingBotAutoBuy(body);
  if ("error" in result) {
    return json({ error: result.error }, { status: 400 });
  }

  const warnings = await autoBuyValidationWarningsWithMarketRisk(
    env,
    result.normalized,
    request.url,
  );

  return json({
    status: "accepted",
    normalized: result.normalized,
    warnings,
    validatedAt: new Date().toISOString(),
  });
}

export async function postTradingBotAutoBuyStorage(
  request: Request,
  env: Env,
): Promise<Response> {
  return postTradingBotAdvancedAutomationConfigStorage(
    request,
    env,
    "auto_buy",
  );
}

export async function getTradingBotAutoBuyConfigs(
  request: Request,
  env: Env,
): Promise<Response> {
  return getTradingBotAdvancedAutomationConfigs(request, env, "auto_buy");
}

export async function postTradingBotAutoBuyCancel(
  request: Request,
  env: Env,
): Promise<Response> {
  return postTradingBotAdvancedAutomationConfigCancel(request, env, "auto_buy");
}

export async function postTradingBotAutoBuyExecutionStatus(
  request: Request,
  env: Env,
): Promise<Response> {
  return postTradingBotAdvancedAutomationExecutionStatus(
    request,
    env,
    "auto_buy",
  );
}

export async function postTradingBotBundleBuyValidation(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TradingBotBundleBuyValidationBody;
  try {
    body = (await request.json()) as TradingBotBundleBuyValidationBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = normalizeTradingBotBundleBuy(body);
  if ("error" in result) {
    return json({ error: result.error }, { status: 400 });
  }

  return json({
    status: "accepted",
    normalized: result.normalized,
    warnings: bundleBuyValidationWarnings(result.normalized),
    validatedAt: new Date().toISOString(),
  });
}

export async function postTradingBotBundleBuyStorage(
  request: Request,
  env: Env,
): Promise<Response> {
  return postTradingBotAdvancedAutomationConfigStorage(
    request,
    env,
    "bundle_buy",
  );
}

export async function getTradingBotBundleBuyConfigs(
  request: Request,
  env: Env,
): Promise<Response> {
  return getTradingBotAdvancedAutomationConfigs(request, env, "bundle_buy");
}

export async function postTradingBotBundleBuyCancel(
  request: Request,
  env: Env,
): Promise<Response> {
  return postTradingBotAdvancedAutomationConfigCancel(
    request,
    env,
    "bundle_buy",
  );
}

export async function postTradingBotBundleBuyExecution(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TradingBotBundleBuyExecutionBody;
  try {
    body = (await request.json()) as TradingBotBundleBuyExecutionBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = normalizeTradingBotBundleBuyExecution(body);
  if ("error" in result) {
    return json({ error: result.error }, { status: 400 });
  }
  const normalized = result.normalized;

  const missingRequirements =
    tradingBotBundleBuyExecutionMissingRequirements(env);
  if (missingRequirements.length > 0) {
    return json(
      {
        status: "not_configured",
        required: missingRequirements,
      },
      { status: 503 },
    );
  }

  const store = tradingBotOrderStore(env);
  if (!store) {
    return json(
      {
        status: "not_configured",
        required: ["TRADING_BOT_ACCOUNTS"],
      },
      { status: 503 },
    );
  }

  const configResult = await loadStoredTradingBotBundleBuyConfig(
    store,
    normalized.telegramUserId,
    normalized.configId,
  );
  if ("error" in configResult) {
    return json(
      {
        status: configResult.status === 404 ? "not_found" : "error",
        error: configResult.error,
      },
      { status: configResult.status ?? 500 },
    );
  }
  const config = configResult.config;
  if (config.status === "executing") {
    return getTradingBotBundleBuyExecutionStatusResponse(config, env, store);
  }
  if (config.status !== "staged") {
    return json(
      {
        status: "not_executable",
        error: `Bundle-buy basket is ${config.status}`,
      },
      { status: 409 },
    );
  }
  if (config.walletAddress !== normalized.userPublicKey) {
    return json({ error: "Trading wallet mismatch" }, { status: 409 });
  }

  const claim = await claimStoredBundleBuyConfigForExecution(store, config);
  if (!claim.claimed) {
    if (claim.config?.status === "executing") {
      return getTradingBotBundleBuyExecutionStatusResponse(
        claim.config,
        env,
        store,
      );
    }
    return json(
      {
        status: "not_executable",
        error: claim.error,
        configStatus: claim.config?.status ?? config.status,
      },
      { status: claim.status || 409 },
    );
  }

  const executingConfig = claim.config;
  const execution = await executeTradingBotBundleBuyConfig(
    executingConfig,
    env,
    store,
  );
  if (!execution.ok) {
    const now = new Date().toISOString();
    const nowDate = new Date(now);
    const nextStatus = execution.reconciliationRequired
      ? "executing"
      : execution.attemptedItems > 0
        ? "failed"
        : "staged";
    const monitorBase: TradingBotAdvancedAutomationMonitorState = {
      ...executingConfig.monitor,
      bundleAttemptedItems: execution.attemptedItems,
      bundleConfirmedItems: execution.executions?.length ?? 0,
      ...(execution.reconciliationRequired
        ? { reconciliationCheckedAt: now }
        : execution.attemptedItems > 0
          ? { executionCompletedAt: now }
          : {}),
      lastError: execution.error,
    };
    const nextMonitor = execution.reconciliationRequired
      ? withTradingBotManualReview(
          monitorBase,
          env,
          executingConfig.monitor.executionStartedAt,
          nowDate,
          "pending_reconciliation",
        )
      : clearTradingBotManualReview(monitorBase);
    await updateStoredAdvancedAutomationConfigMonitor(
      store,
      executingConfig,
      nextMonitor,
      nextStatus,
      false,
      { status: "executing" },
    );
    return json(
      {
        status: execution.reconciliationRequired
          ? "pending_reconciliation"
          : "not_executable",
        configId: executingConfig.configId,
        configStatus: nextStatus,
        attemptedItems: execution.attemptedItems,
        confirmedItems: execution.executions?.length ?? 0,
        totalItems: executingConfig.bundleItems?.length ?? 0,
        ...tradingBotManualReviewResponse(nextMonitor),
        error: execution.error,
        ...(execution.executions ? { executions: execution.executions } : {}),
      },
      { status: execution.reconciliationRequired ? 503 : 409 },
    );
  }

  const executedAt = new Date().toISOString();
  const monitor = monitorAfterAdvancedAutomationExecution(executingConfig, {
    ...executingConfig.monitor,
    lastMatchedAt: executedAt,
    lastTriggerAt: executedAt,
    lastTriggerReason: "Bundle-buy basket executed by user request",
    bundleAttemptedItems: execution.attemptedItems,
    bundleConfirmedItems: execution.executions.length,
    executionCompletedAt: executedAt,
  });
  await updateStoredAdvancedAutomationConfigMonitor(
    store,
    executingConfig,
    monitor,
    "executed",
    false,
    { status: "executing" },
  );
  await recordTradingBotAccountEvent(env, executingConfig.telegramUserId, {
    eventId: bundleBuyAggregateEventId(executingConfig.configId, "executed"),
    eventType: "advanced_automation_config_executed",
    metadata: {
      configId: executingConfig.configId,
      kind: executingConfig.kind,
      walletAddress: executingConfig.walletAddress,
      itemCount: execution.executions.length,
      totalAmountIn: executingConfig.maxBuyAmountIn,
      mints: execution.executions.map((item) => item.mint),
      signatures: execution.executions.map((item) => item.signature ?? null),
      executedAt,
    },
  });

  return json({
    status: "executed",
    mode: "bundle_buy_sequence",
    configId: executingConfig.configId,
    itemCount: execution.executions.length,
    totalAmountIn: executingConfig.maxBuyAmountIn,
    executions: execution.executions,
    executedAt,
  });
}

export async function postTradingBotBundleBuyExecutionStatus(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      { status: "not_configured", required: ["RIBBOT_TRADING_BOT_TOKEN"] },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TradingBotBundleBuyExecutionBody;
  try {
    body = (await request.json()) as TradingBotBundleBuyExecutionBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const result = normalizeTradingBotBundleBuyExecution(body);
  if ("error" in result) {
    return json({ error: result.error }, { status: 400 });
  }
  const normalized = result.normalized;
  const store = tradingBotOrderStore(env);
  if (!store) {
    return json(
      { status: "not_configured", required: ["TRADING_BOT_ACCOUNTS"] },
      { status: 503 },
    );
  }
  const configResult = await loadStoredTradingBotBundleBuyConfig(
    store,
    normalized.telegramUserId,
    normalized.configId,
  );
  if ("error" in configResult) {
    return json(
      {
        status: configResult.status === 404 ? "not_found" : "lookup_error",
        error: configResult.error,
      },
      { status: configResult.status ?? 500 },
    );
  }
  if (configResult.config.walletAddress !== normalized.userPublicKey) {
    return json(
      { status: "mismatch", error: "Trading wallet mismatch" },
      { status: 409 },
    );
  }
  return getTradingBotBundleBuyExecutionStatusResponse(
    configResult.config,
    env,
    store,
  );
}

async function getTradingBotBundleBuyExecutionStatusResponse(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
  env: Env,
  store: DurableObjectStub,
): Promise<Response> {
  const items = config.bundleItems ?? [];
  const reviewReferenceId =
    config.monitor.executionReferenceId ??
    (await tradingBotExecutionReferenceId(
      config.telegramUserId,
      config.configId,
    ));
  const totalItems = items.length;
  const attemptedItems = Math.min(
    Math.max(config.monitor.bundleAttemptedItems ?? 0, 0),
    totalItems,
  );
  const confirmedItems = Math.min(
    Math.max(config.monitor.bundleConfirmedItems ?? 0, 0),
    attemptedItems,
  );
  const common = {
    configId: config.configId,
    configStatus: config.status,
    attemptedItems,
    confirmedItems,
    totalItems,
    checkedAt: new Date().toISOString(),
    ...tradingBotManualReviewResponse(config.monitor),
  };

  if (config.status === "staged") {
    return json({
      status: "not_started",
      ...common,
      error: "Bundle-buy execution has not started in FTX/FrogX.",
    });
  }
  if (config.status === "executed") {
    await resolveTradingBotManualReviewCaseFromTerminalEvidence(env, {
      referenceId: reviewReferenceId,
      resolution: "executed",
      checkedAt: common.checkedAt,
    });
    return json({
      status: "executed",
      ...common,
      itemCount: totalItems,
      totalAmountIn: config.maxBuyAmountIn,
      executions: [],
      executedAt: config.monitor.executionCompletedAt ?? config.updatedAt,
    });
  }
  if (config.status === "failed") {
    await resolveTradingBotManualReviewCaseFromTerminalEvidence(env, {
      referenceId: reviewReferenceId,
      resolution: "failed",
      checkedAt: common.checkedAt,
    });
    return json({
      status: "failed",
      ...common,
      executions: [],
      error: config.monitor.lastError ?? "Bundle-buy execution failed.",
    });
  }
  if (config.status !== "executing" || attemptedItems < 1) {
    return json(
      {
        status: "lookup_error",
        ...common,
        error: "Executing bundle-buy basket has no persisted item attempt.",
      },
      { status: 503 },
    );
  }

  if (!config.monitor.reconciliationCheckedAt) {
    const reconcileAfterSeconds = clampInteger(
      numberValue(env.TRADING_BOT_ADVANCED_RECONCILE_AFTER_SECONDS),
      1,
      86_400,
      DEFAULT_TRADING_BOT_ADVANCED_RECONCILE_AFTER_SECONDS,
    );
    const updatedAtMs = Date.parse(config.updatedAt);
    if (
      Number.isFinite(updatedAtMs) &&
      Date.now() - updatedAtMs < reconcileAfterSeconds * 1000
    ) {
      return json(
        {
          status: "pending_reconciliation",
          ...common,
          error:
            "Bundle execution is still inside the active request window. FTX will check Privy after the safety delay and will not resend any item.",
        },
        { status: 503 },
      );
    }
  }

  const executions: TradingBotBundleBuyExecutionItemResult[] = [];
  const pendingErrors: string[] = [];
  const terminalErrors: string[] = [];
  for (let index = 0; index < attemptedItems; index += 1) {
    const item = items[index];
    const orderId = await bundleBuyItemOrderId(config.configId, index);
    const response = await getTradingBotDirectExecutionStatus(env, {
      executionKind: "swap",
      executionId: orderId,
      referenceSubject: orderId,
      telegramUserId: config.telegramUserId,
      userPublicKey: config.walletAddress,
      successEventType: "swap_executed",
      failureEventType: "swap_execution_failed",
      eventMetadata: {
        orderId,
        configId: config.configId,
        kind: "bundle_buy",
        bundleItemIndex: index,
        walletAddress: config.walletAddress,
        inMint: WRAPPED_SOL_MINT,
        outMint: item.mint,
        amountIn: item.maxBuyAmountIn,
        slippageBps: config.slippageBps,
        priorityFee: config.priorityFee,
      },
    });
    const data = (await response.json()) as {
      status?: string;
      providerStatus?: string;
      error?: string;
      signature?: string | null;
      transactionId?: string | null;
      referenceId?: string | null;
      solscanUrl?: string | null;
    };
    if (data.status === "executed") {
      executions.push({
        mint: item.mint,
        amountIn: item.maxBuyAmountIn,
        signature: data.signature,
        transactionId: data.transactionId,
        referenceId: data.referenceId,
        solscanUrl: data.solscanUrl,
      });
    } else if (data.status === "failed") {
      terminalErrors.push(
        data.error ?? `Bundle item ${index + 1} ended in terminal failure`,
      );
    } else {
      pendingErrors.push(
        data.error ??
          `Bundle item ${index + 1} status is ${data.providerStatus ?? data.status ?? "unknown"}`,
      );
    }
  }

  const checkedAtDate = new Date();
  const checkedAt = checkedAtDate.toISOString();
  if (pendingErrors.length > 0) {
    const error = pendingErrors.join(" | ").slice(0, 240);
    const reviewedMonitor = withTradingBotManualReview(
      {
        ...config.monitor,
        reconciliationCheckedAt: checkedAt,
        bundleConfirmedItems: executions.length,
        lastError: error,
      },
      env,
      config.monitor.executionStartedAt,
      checkedAtDate,
      "bundle_item_unresolved",
    );
    await updateStoredAdvancedAutomationConfigMonitor(
      store,
      config,
      reviewedMonitor,
      "executing",
      false,
      { status: "executing" },
    );
    await recordTradingBotManualReviewRequired(env, {
      telegramUserId: config.telegramUserId,
      executionKind: "bundle_buy",
      resourceId: config.configId,
      executionId: config.configId,
      referenceId: reviewReferenceId,
      executionStartedAt: config.monitor.executionStartedAt,
      state: reviewedMonitor,
    });
    return json(
      {
        status: "pending_reconciliation",
        ...common,
        configStatus: "executing",
        confirmedItems: executions.length,
        checkedAt,
        executions,
        ...tradingBotManualReviewResponse(reviewedMonitor),
        error,
      },
      { status: 503 },
    );
  }

  if (terminalErrors.length > 0 || attemptedItems < totalItems) {
    const error = (
      terminalErrors.length > 0
        ? terminalErrors.join(" | ")
        : `Bundle execution stopped after ${attemptedItems} of ${totalItems} items. FTX will not auto-resume; create a fresh basket for remaining items.`
    ).slice(0, 240);
    await updateStoredAdvancedAutomationConfigMonitor(
      store,
      config,
      clearTradingBotManualReview({
        ...config.monitor,
        reconciliationCheckedAt: checkedAt,
        executionCompletedAt: checkedAt,
        bundleConfirmedItems: executions.length,
        lastError: error,
      }),
      "failed",
      false,
      { status: "executing" },
    );
    await recordTradingBotAccountEvent(env, config.telegramUserId, {
      eventId: bundleBuyAggregateEventId(config.configId, "failed"),
      eventType: "advanced_automation_config_failed",
      metadata: {
        configId: config.configId,
        kind: config.kind,
        attemptedItems,
        confirmedItems: executions.length,
        totalItems,
        reason: error,
        checkedAt,
      },
    });
    await resolveTradingBotManualReviewCaseFromTerminalEvidence(env, {
      referenceId: reviewReferenceId,
      resolution: "failed",
      checkedAt,
    });
    return json({
      status: "failed",
      ...common,
      configStatus: "failed",
      confirmedItems: executions.length,
      checkedAt,
      executions,
      error,
    });
  }

  const executedAt = checkedAt;
  const reconciledMonitor = monitorAfterAdvancedAutomationExecution(
    config,
    clearTradingBotManualReview({
      ...config.monitor,
      reconciliationCheckedAt: checkedAt,
      executionCompletedAt: executedAt,
      bundleConfirmedItems: executions.length,
    }),
  );
  delete reconciledMonitor.lastError;
  await updateStoredAdvancedAutomationConfigMonitor(
    store,
    config,
    reconciledMonitor,
    "executed",
    true,
    { status: "executing" },
  );
  await recordTradingBotAccountEvent(env, config.telegramUserId, {
    eventId: bundleBuyAggregateEventId(config.configId, "executed"),
    eventType: "advanced_automation_config_executed",
    metadata: {
      configId: config.configId,
      kind: config.kind,
      walletAddress: config.walletAddress,
      itemCount: executions.length,
      totalAmountIn: config.maxBuyAmountIn,
      mints: executions.map((item) => item.mint),
      signatures: executions.map((item) => item.signature ?? null),
      reconciliation: true,
      executedAt,
    },
  });
  await resolveTradingBotManualReviewCaseFromTerminalEvidence(env, {
    referenceId: reviewReferenceId,
    resolution: "executed",
    checkedAt,
  });
  return json({
    status: "executed",
    ...common,
    configStatus: "executed",
    confirmedItems: executions.length,
    checkedAt,
    itemCount: executions.length,
    totalAmountIn: config.maxBuyAmountIn,
    executions,
    executedAt,
  });
}

async function bundleBuyItemOrderId(
  configId: string,
  index: number,
): Promise<string> {
  const raw = `bundle_buy:${configId}:${index + 1}`;
  if (raw.length <= 64) return raw;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `bundle_buy:${index + 1}:${hex.slice(0, 49)}`;
}

function bundleBuyAggregateEventId(
  configId: string,
  status: "executed" | "failed",
): string {
  return `bundle-${status}-${configId}`.slice(0, 64);
}

export async function postTradingBotAutoSellValidation(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TradingBotAutoSellValidationBody;
  try {
    body = (await request.json()) as TradingBotAutoSellValidationBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = normalizeTradingBotAutoSell(body);
  if ("error" in result) {
    return json({ error: result.error }, { status: 400 });
  }

  return json({
    status: "accepted",
    normalized: result.normalized,
    warnings: autoSellValidationWarnings(result.normalized),
    validatedAt: new Date().toISOString(),
  });
}

export async function postTradingBotAutoSellStorage(
  request: Request,
  env: Env,
): Promise<Response> {
  return postTradingBotAdvancedAutomationConfigStorage(
    request,
    env,
    "auto_sell",
  );
}

export async function getTradingBotAutoSellConfigs(
  request: Request,
  env: Env,
): Promise<Response> {
  return getTradingBotAdvancedAutomationConfigs(request, env, "auto_sell");
}

export async function postTradingBotAutoSellCancel(
  request: Request,
  env: Env,
): Promise<Response> {
  return postTradingBotAdvancedAutomationConfigCancel(
    request,
    env,
    "auto_sell",
  );
}

export async function postTradingBotAutoSellExecutionStatus(
  request: Request,
  env: Env,
): Promise<Response> {
  return postTradingBotAdvancedAutomationExecutionStatus(
    request,
    env,
    "auto_sell",
  );
}

async function postTradingBotAdvancedAutomationConfigStorage(
  request: Request,
  env: Env,
  kind: TradingBotAdvancedAutomationKind,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!env.TRADING_BOT_ACCOUNTS) {
    return json(
      {
        status: "not_configured",
        required: ["TRADING_BOT_ACCOUNTS"],
      },
      { status: 503 },
    );
  }

  let body:
    | TradingBotCopyTradeValidationBody
    | TradingBotSniperValidationBody
    | TradingBotAutoBuyValidationBody
    | TradingBotBundleBuyValidationBody
    | TradingBotAutoSellValidationBody;
  try {
    body = (await request.json()) as
      | TradingBotCopyTradeValidationBody
      | TradingBotSniperValidationBody
      | TradingBotAutoBuyValidationBody
      | TradingBotBundleBuyValidationBody
      | TradingBotAutoSellValidationBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = normalizeTradingBotAdvancedAutomationConfig(kind, body);
  if ("error" in result) {
    return json({ error: result.error }, { status: 400 });
  }

  const warnings =
    kind === "auto_buy"
      ? await autoBuyValidationWarningsWithMarketRisk(
          env,
          result.normalized as NormalizedTradingBotAutoBuy,
          request.url,
          true,
        )
      : advancedAutomationValidationWarnings(kind, result.normalized, true);
  const validatedAt = new Date().toISOString();
  const store = tradingBotOrderStore(env);
  if (!store) {
    return json(
      {
        status: "not_configured",
        required: ["TRADING_BOT_ACCOUNTS"],
      },
      { status: 503 },
    );
  }

  const response = await store.fetch(
    new Request("https://trading-bot-account.local/automation-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        configId: generateTradingBotAdvancedConfigId(kind),
        kind,
        config: result.normalized,
        validation: {
          validatedAt,
          warnings,
        },
      }),
    }),
  );
  const data = await response.json();
  if (response.ok) {
    const stored = data as {
      config?: TradingBotStoredAdvancedAutomationConfigSnapshot;
    };
    if (stored.config) {
      await recordTradingBotAccountEvent(env, stored.config.telegramUserId, {
        eventType: "advanced_automation_config_staged",
        metadata: {
          configId: stored.config.configId,
          kind: stored.config.kind,
          walletAddress: stored.config.walletAddress,
          mint: stored.config.mint,
          targetWallet: stored.config.targetWallet,
          source: stored.config.source,
        },
      });
    }
  }
  return json(data, { status: response.status });
}

async function getTradingBotAdvancedAutomationConfigs(
  request: Request,
  env: Env,
  kind: TradingBotAdvancedAutomationKind,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!env.TRADING_BOT_ACCOUNTS) {
    return json(
      {
        status: "not_configured",
        required: ["TRADING_BOT_ACCOUNTS"],
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const telegramUserId = stringValue(url.searchParams.get("telegramUserId"));
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return json({ error: "telegramUserId is required" }, { status: 400 });
  }

  const store = tradingBotOrderStore(env);
  if (!store) {
    return json(
      {
        status: "not_configured",
        required: ["TRADING_BOT_ACCOUNTS"],
      },
      { status: 503 },
    );
  }

  const response = await store.fetch(
    new Request(
      `https://trading-bot-account.local/automation-configs?telegramUserId=${telegramUserId}&kind=${kind}`,
    ),
  );
  const data = await response.json();
  return json(data, { status: response.status });
}

async function postTradingBotAdvancedAutomationConfigCancel(
  request: Request,
  env: Env,
  kind: TradingBotAdvancedAutomationKind,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!env.TRADING_BOT_ACCOUNTS) {
    return json(
      {
        status: "not_configured",
        required: ["TRADING_BOT_ACCOUNTS"],
      },
      { status: 503 },
    );
  }

  let body: { telegramUserId?: unknown; configId?: unknown };
  try {
    body = (await request.json()) as {
      telegramUserId?: unknown;
      configId?: unknown;
    };
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const telegramUserId = stringValue(body.telegramUserId);
  const configId = stringValue(body.configId);
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return json({ error: "telegramUserId is required" }, { status: 400 });
  }
  if (!configId || !TRADING_BOT_ADVANCED_CONFIG_ID_PATTERN.test(configId)) {
    return json({ error: "configId is required" }, { status: 400 });
  }

  const store = tradingBotOrderStore(env);
  if (!store) {
    return json(
      {
        status: "not_configured",
        required: ["TRADING_BOT_ACCOUNTS"],
      },
      { status: 503 },
    );
  }

  const response = await store.fetch(
    new Request("https://trading-bot-account.local/automation-config/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramUserId, configId, kind }),
    }),
  );
  const data = await response.json();
  if (response.ok) {
    const cancelled = data as {
      config?: TradingBotStoredAdvancedAutomationConfigSnapshot;
    };
    if (cancelled.config) {
      await recordTradingBotAccountEvent(env, cancelled.config.telegramUserId, {
        eventType: "advanced_automation_config_cancelled",
        metadata: {
          configId: cancelled.config.configId,
          kind: cancelled.config.kind,
          mint: cancelled.config.mint,
          targetWallet: cancelled.config.targetWallet,
          source: cancelled.config.source,
        },
      });
    }
  }
  return json(data, { status: response.status });
}

async function postTradingBotAdvancedAutomationConfigControl(
  request: Request,
  env: Env,
  kind: TradingBotAdvancedAutomationKind,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      { status: "not_configured", required: ["RIBBOT_TRADING_BOT_TOKEN"] },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TradingBotAdvancedAutomationControlBody;
  try {
    body = (await request.json()) as TradingBotAdvancedAutomationControlBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const telegramUserId = stringValue(body.telegramUserId);
  const configId = stringValue(body.configId);
  const action = stringValue(body.action)?.toLowerCase();
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return json({ error: "telegramUserId is required" }, { status: 400 });
  }
  if (!configId || !TRADING_BOT_ADVANCED_CONFIG_ID_PATTERN.test(configId)) {
    return json({ error: "configId is required" }, { status: 400 });
  }
  if (action !== "pause" && action !== "resume") {
    return json({ error: "action must be pause or resume" }, { status: 400 });
  }

  const store = tradingBotOrderStore(env);
  if (!store) {
    return json(
      { status: "not_configured", required: ["TRADING_BOT_ACCOUNTS"] },
      { status: 503 },
    );
  }
  const response = await store.fetch(
    new Request("https://trading-bot-account.local/automation-config/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramUserId, configId, kind, action }),
    }),
  );
  const data = (await response.json()) as {
    status?: string;
    config?: TradingBotStoredAdvancedAutomationConfigSnapshot;
    error?: string;
  };
  if (response.ok && data.config) {
    await recordTradingBotAccountEvent(env, telegramUserId, {
      eventType: `advanced_automation_config_${data.status}`,
      metadata: {
        configId: data.config.configId,
        kind: data.config.kind,
        targetWallet: data.config.targetWallet,
        tag: data.config.tag,
      },
    });
  }
  return json(data, { status: response.status });
}

async function postTradingBotAdvancedAutomationExecutionStatus(
  request: Request,
  env: Env,
  kind: "copytrade" | "sniper" | "auto_buy" | "auto_sell",
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      { status: "not_configured", required: ["RIBBOT_TRADING_BOT_TOKEN"] },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TradingBotAdvancedAutomationStatusBody;
  try {
    body = (await request.json()) as TradingBotAdvancedAutomationStatusBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const result = normalizeTradingBotBundleBuyExecution(body);
  if ("error" in result) {
    return json({ error: result.error }, { status: 400 });
  }
  const normalized = result.normalized;
  const store = tradingBotOrderStore(env);
  if (!store) {
    return json(
      { status: "not_configured", required: ["TRADING_BOT_ACCOUNTS"] },
      { status: 503 },
    );
  }

  const loaded = await loadStoredTradingBotAdvancedAutomationConfig(
    store,
    normalized.telegramUserId,
    normalized.configId,
    kind,
  );
  if ("error" in loaded) {
    return json(
      {
        status: loaded.status === 404 ? "not_found" : "lookup_error",
        error: loaded.error,
      },
      { status: loaded.status ?? 500 },
    );
  }
  if (loaded.config.walletAddress !== normalized.userPublicKey) {
    return json(
      { status: "mismatch", error: "Trading wallet mismatch" },
      { status: 409 },
    );
  }

  let config = loaded.config;
  if (config.status === "executing") {
    if (!resolvePrivyConfig(env)) {
      return json(
        {
          status: "not_configured",
          required: ["PRIVY_APP_ID", "PRIVY_APP_SECRET"],
          config,
        },
        { status: 503 },
      );
    }
    await reconcileTradingBotAdvancedAutomationConfigs(
      [config],
      store,
      env,
      new Date(),
    );
    const refreshed = await loadStoredTradingBotAdvancedAutomationConfig(
      store,
      normalized.telegramUserId,
      normalized.configId,
      kind,
    );
    if ("error" in refreshed) {
      return json(
        { status: "lookup_error", error: refreshed.error },
        { status: refreshed.status ?? 500 },
      );
    }
    config = refreshed.config;
  }

  return tradingBotAdvancedAutomationExecutionStatusResponse(config);
}

function tradingBotAdvancedAutomationExecutionStatusResponse(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
): Response {
  const providerStatus = config.monitor.reconciliationStatus ?? null;
  const common = {
    kind: config.kind,
    configId: config.configId,
    configStatus: config.status,
    standing:
      config.kind === "copytrade" ||
      (config.kind === "sniper" && config.status === "staged"),
    providerStatus,
    executionId: config.monitor.executionId ?? null,
    referenceId: config.monitor.executionReferenceId ?? null,
    transactionId: config.monitor.executionTransactionId ?? null,
    signature: config.monitor.executionSignature ?? null,
    solscanUrl: config.monitor.executionSolscanUrl ?? null,
    checkedAt:
      config.monitor.reconciliationCheckedAt ?? new Date().toISOString(),
    ...tradingBotManualReviewResponse(config.monitor),
    config,
  };

  if (config.status === "executing") {
    return json(
      {
        status: "pending_reconciliation",
        ...common,
        error:
          config.monitor.lastError ??
          "FTX is waiting for a terminal Privy transaction status. The execution remains locked and will not be resent.",
      },
      { status: 503 },
    );
  }
  if (config.status === "executed") {
    return json({ status: "executed", ...common });
  }
  if (config.status === "failed") {
    return json({
      status: "failed",
      ...common,
      error: config.monitor.lastError ?? "Advanced execution failed.",
    });
  }
  if (config.status === "cancelled") {
    return json({ status: "cancelled", ...common });
  }
  if (config.status === "paused") {
    return json({ status: "paused", ...common });
  }

  if (providerStatus === "confirmed" || providerStatus === "finalized") {
    return json({ status: "executed", ...common });
  }
  if (
    providerStatus === "execution_reverted" ||
    providerStatus === "failed" ||
    providerStatus === "provider_error" ||
    providerStatus === "replaced"
  ) {
    return json({
      status: "failed",
      ...common,
      error:
        config.monitor.lastError ??
        `Privy transaction ended with ${providerStatus}`,
    });
  }
  return json({ status: "monitoring", ...common });
}

export async function postTradingBotPreferenceValidation(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TradingBotPreferenceValidationBody;
  try {
    body = (await request.json()) as TradingBotPreferenceValidationBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = normalizeTradingBotPreference(body);
  if ("error" in result) {
    return json({ error: result.error }, { status: 400 });
  }

  const account = await applyTradingBotPreference(env, result.normalized);

  return json({
    status: "accepted",
    normalized: result.normalized,
    accountStorage: account ? "stored" : "not_configured",
    ...(account ? { account } : {}),
    warnings: preferenceValidationWarnings(result.normalized, Boolean(account)),
    validatedAt: new Date().toISOString(),
  });
}

export async function postTradingBotPositions(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const rpcUrl = resolveRpcUrl(env);
  if (!rpcUrl) {
    return json(
      {
        status: "not_configured",
        required: ["SOLANA_RPC_URL"],
      },
      { status: 503 },
    );
  }

  let body: TradingBotPositionsBody;
  try {
    body = (await request.json()) as TradingBotPositionsBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const telegramUserId = stringValue(body.telegramUserId);
  const userPublicKey = stringValue(body.userPublicKey);
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return json({ error: "telegramUserId is required" }, { status: 400 });
  }
  if (!userPublicKey || !SOLANA_ADDRESS_PATTERN.test(userPublicKey)) {
    return json(
      { error: "userPublicKey must be a Solana address" },
      { status: 400 },
    );
  }

  try {
    return json(await loadTradingBotPositions(env, userPublicKey));
  } catch (error) {
    console.error("[trading-bot] Position lookup failed", error);
    return json(
      { error: "Position service temporarily unavailable" },
      { status: 502 },
    );
  }
}

export async function postTradingBotTokenCleanupReview(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const rpcUrl = resolveRpcUrl(env);
  if (!rpcUrl) {
    return json(
      {
        status: "not_configured",
        required: ["SOLANA_RPC_URL"],
      },
      { status: 503 },
    );
  }

  let body: TradingBotTokenCleanupReviewBody;
  try {
    body = (await request.json()) as TradingBotTokenCleanupReviewBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const telegramUserId = stringValue(body.telegramUserId);
  const userPublicKey = stringValue(body.userPublicKey);
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return json({ error: "telegramUserId is required" }, { status: 400 });
  }
  if (!userPublicKey || !SOLANA_ADDRESS_PATTERN.test(userPublicKey)) {
    return json(
      { error: "userPublicKey must be a Solana address" },
      { status: 400 },
    );
  }

  const dustUsdThreshold =
    numberValue(body.dustUsdThreshold) ?? TOKEN_CLEANUP_DUST_USD_THRESHOLD;
  if (
    !Number.isFinite(dustUsdThreshold) ||
    dustUsdThreshold <= 0 ||
    dustUsdThreshold > 100
  ) {
    return json(
      {
        error: "dustUsdThreshold must be a positive number no greater than 100",
      },
      { status: 400 },
    );
  }

  try {
    const positions = await loadTradingBotPositions(env, userPublicKey);
    const storedAccount = await getStoredTradingBotAccount(env, telegramUserId);
    const storedHiddenTokens =
      "account" in storedAccount
        ? (storedAccount.account?.hiddenTokens ?? [])
        : [];
    const hiddenTokens = uniqueStrings([
      ...storedHiddenTokens,
      ...tokenListValue(body.hiddenTokens),
    ]);
    const prices = await fetchJupiterPrices(
      env,
      uniqueStrings(positions.tokens.map((token) => token.mint)).slice(0, 50),
    );

    return json(
      buildTradingBotTokenCleanupReview({
        positions,
        prices,
        hiddenTokens,
        dustUsdThreshold,
      }),
      {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      },
    );
  } catch (error) {
    console.error("[trading-bot] Token cleanup review failed", error);
    return json(
      { error: "Token cleanup service temporarily unavailable" },
      { status: 502 },
    );
  }
}

export async function postTradingBotTokenSafety(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const rpcUrl = resolveRpcUrl(env);
  if (!rpcUrl) {
    return json(
      {
        status: "not_configured",
        required: ["SOLANA_RPC_URL"],
      },
      { status: 503 },
    );
  }

  let body: TradingBotTokenSafetyBody;
  try {
    body = (await request.json()) as TradingBotTokenSafetyBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const telegramUserId = stringValue(body.telegramUserId);
  const mint = stringValue(body.mint);
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return json({ error: "telegramUserId is required" }, { status: 400 });
  }
  if (!mint || !SOLANA_ADDRESS_PATTERN.test(mint)) {
    return json({ error: "mint must be a Solana token mint" }, { status: 400 });
  }

  try {
    return json(await loadTradingBotTokenSafety(env, mint), {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[trading-bot] Token safety lookup failed", error);
    return json(
      { error: "Token safety service temporarily unavailable" },
      { status: 502 },
    );
  }
}

export async function postTradingBotMarketRisk(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      {
        status: "not_configured",
        required: ["RIBBOT_TRADING_BOT_TOKEN"],
      },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const rpcUrl = resolveRpcUrl(env);
  if (!rpcUrl) {
    return json(
      {
        status: "not_configured",
        required: ["SOLANA_RPC_URL"],
      },
      { status: 503 },
    );
  }

  let body: TradingBotMarketRiskBody;
  try {
    body = (await request.json()) as TradingBotMarketRiskBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const telegramUserId = stringValue(body.telegramUserId);
  const userPublicKey = stringValue(body.userPublicKey);
  const mint = stringValue(body.mint);
  const amountIn = stringValue(body.amountIn) ?? "100000000";
  const slippageBps = numberValue(body.slippageBps) ?? 500;
  const priorityFee =
    numberValue(body.priorityFeeLamports) ?? numberValue(body.priorityFee) ?? 0;
  const minLiquidityUsd = positiveNumberValue(body.minLiquidityUsd);
  const maxMarketCapUsd = positiveNumberValue(body.maxMarketCapUsd);
  const maxPriceImpactBps = numberValue(body.maxPriceImpactBps) ?? 1500;

  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return json({ error: "telegramUserId is required" }, { status: 400 });
  }
  if (userPublicKey && !SOLANA_ADDRESS_PATTERN.test(userPublicKey)) {
    return json(
      { error: "userPublicKey must be a Solana address" },
      { status: 400 },
    );
  }
  if (!mint || !SOLANA_ADDRESS_PATTERN.test(mint)) {
    return json({ error: "mint must be a Solana token mint" }, { status: 400 });
  }
  if (!/^[1-9]\d*$/.test(amountIn)) {
    return json(
      { error: "amountIn must be a positive integer string" },
      { status: 400 },
    );
  }
  if (
    !Number.isInteger(slippageBps) ||
    slippageBps < 0 ||
    slippageBps > 10_000
  ) {
    return json(
      { error: "slippageBps must be an integer from 0 to 10000" },
      { status: 400 },
    );
  }
  if (!Number.isInteger(priorityFee) || priorityFee < 0) {
    return json(
      { error: "priorityFee must be a non-negative integer" },
      { status: 400 },
    );
  }
  if (
    !Number.isInteger(maxPriceImpactBps) ||
    maxPriceImpactBps < 1 ||
    maxPriceImpactBps > 10_000
  ) {
    return json(
      { error: "maxPriceImpactBps must be an integer from 1 to 10000" },
      { status: 400 },
    );
  }

  try {
    const review = await loadTradingBotMarketRisk(env, {
      telegramUserId,
      userPublicKey,
      mint,
      amountIn,
      slippageBps,
      priorityFee,
      minLiquidityUsd,
      maxMarketCapUsd,
      maxPriceImpactBps,
      requestUrl: request.url,
    });
    return json(review, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[trading-bot] Market risk review failed", error);
    return json(
      { error: "Market risk service temporarily unavailable" },
      { status: 502 },
    );
  }
}

export class TradingBotAccountStore {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    this.state.blockConcurrencyWhile(async () => {
      this.state.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS accounts (
          telegram_user_id TEXT PRIMARY KEY,
          username TEXT,
          wallet_source TEXT,
          privy_user_id TEXT,
          privy_wallet_id TEXT,
          solana_wallet_address TEXT,
          active_wallet_id TEXT,
          wallets_json TEXT NOT NULL DEFAULT '[]',
          wallet_claim_requested_at TEXT,
          wallet_export_requested_at TEXT,
          bot_access_revoked_at TEXT,
          settings_json TEXT NOT NULL,
          watchlist_json TEXT NOT NULL,
          hidden_tokens_json TEXT NOT NULL,
          referral_code TEXT,
          referred_by_code TEXT,
          referred_by_telegram_user_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS account_events (
          telegram_user_id TEXT NOT NULL,
          event_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          metadata_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (telegram_user_id, event_id)
        );
        CREATE INDEX IF NOT EXISTS idx_account_events_user_created
          ON account_events (telegram_user_id, created_at);
        CREATE TABLE IF NOT EXISTS manual_review_cases (
          case_id TEXT PRIMARY KEY,
          telegram_user_id TEXT NOT NULL,
          execution_kind TEXT NOT NULL,
          resource_id TEXT NOT NULL,
          execution_id TEXT NOT NULL,
          reference_id TEXT NOT NULL,
          execution_started_at TEXT,
          manual_review_after TEXT,
          manual_review_required_at TEXT NOT NULL,
          reason TEXT,
          status TEXT NOT NULL,
          acknowledged_at TEXT,
          operator_note TEXT,
          last_checked_at TEXT,
          last_check_status TEXT,
          last_check_error TEXT,
          resolution TEXT,
          provider_status TEXT,
          signature TEXT,
          transaction_id TEXT,
          resolved_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_manual_review_cases_status_required
          ON manual_review_cases (status, manual_review_required_at);
        CREATE TABLE IF NOT EXISTS control_codes (
          telegram_user_id TEXT NOT NULL,
          code_hash TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          consumed_at TEXT,
          created_at TEXT NOT NULL,
          PRIMARY KEY (telegram_user_id, code_hash)
        );
        CREATE INDEX IF NOT EXISTS idx_control_codes_user_expires
          ON control_codes (telegram_user_id, expires_at);
        CREATE TABLE IF NOT EXISTS control_sessions (
          telegram_user_id TEXT NOT NULL,
          session_hash TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          revoked_at TEXT,
          created_at TEXT NOT NULL,
          last_used_at TEXT NOT NULL,
          PRIMARY KEY (telegram_user_id, session_hash)
        );
        CREATE INDEX IF NOT EXISTS idx_control_sessions_user_expires
          ON control_sessions (telegram_user_id, expires_at);
        CREATE TABLE IF NOT EXISTS imperial_sessions (
          telegram_user_id TEXT PRIMARY KEY,
          wallet_address TEXT NOT NULL,
          jwt TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          connected_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          referrer_username TEXT NOT NULL DEFAULT '',
          profile_address TEXT,
          profile_usdc_native INTEGER,
          profile_synced_at TEXT
        );
        CREATE TABLE IF NOT EXISTS delta_neutral_runs (
          telegram_user_id TEXT NOT NULL,
          run_id TEXT PRIMARY KEY,
          idempotency_key TEXT NOT NULL,
          wallet_address TEXT NOT NULL,
          status TEXT NOT NULL,
          service_status_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (telegram_user_id, idempotency_key)
        );
        CREATE INDEX IF NOT EXISTS idx_delta_neutral_runs_user_updated
          ON delta_neutral_runs (telegram_user_id, updated_at);
        CREATE INDEX IF NOT EXISTS idx_delta_neutral_runs_wallet_status
          ON delta_neutral_runs (wallet_address, status);
        CREATE TABLE IF NOT EXISTS automation_orders (
          telegram_user_id TEXT NOT NULL,
          order_id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          side TEXT NOT NULL,
          status TEXT NOT NULL,
          mint TEXT NOT NULL,
          in_mint TEXT NOT NULL,
          out_mint TEXT NOT NULL,
          amount_in TEXT NOT NULL,
          amount_label TEXT,
          wallet_address TEXT NOT NULL,
          slippage_bps INTEGER NOT NULL,
          priority_fee INTEGER NOT NULL,
          trigger_price TEXT,
          trigger_direction TEXT,
          order_count INTEGER,
          interval_minutes INTEGER,
          per_order_amount_in TEXT,
          trailing_bps INTEGER,
          validation_json TEXT NOT NULL,
          scheduler_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_automation_orders_user_created
          ON automation_orders (telegram_user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_automation_orders_user_status_created
          ON automation_orders (telegram_user_id, status, created_at);
        CREATE TABLE IF NOT EXISTS automation_configs (
          telegram_user_id TEXT NOT NULL,
          config_id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          status TEXT NOT NULL,
          wallet_address TEXT NOT NULL,
          mint TEXT,
          target_wallet TEXT,
          source TEXT,
          max_buy_amount_in TEXT NOT NULL,
          amount_label TEXT,
          slippage_bps INTEGER NOT NULL,
          priority_fee INTEGER NOT NULL,
          copy_sells INTEGER,
          min_liquidity_usd REAL NOT NULL,
          max_market_cap_usd REAL,
          max_snipes INTEGER,
          bundle_items_json TEXT,
          sell_bps INTEGER,
          trigger_price TEXT,
          trigger_direction TEXT,
          strategy_json TEXT NOT NULL DEFAULT '{}',
          validation_json TEXT NOT NULL,
          monitor_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_automation_configs_user_kind_created
          ON automation_configs (telegram_user_id, kind, created_at);
        CREATE INDEX IF NOT EXISTS idx_automation_configs_kind_status_updated
          ON automation_configs (kind, status, updated_at);
      `);
      for (const statement of [
        "ALTER TABLE accounts ADD COLUMN wallet_claim_requested_at TEXT",
        "ALTER TABLE accounts ADD COLUMN wallet_export_requested_at TEXT",
        "ALTER TABLE accounts ADD COLUMN bot_access_revoked_at TEXT",
        "ALTER TABLE accounts ADD COLUMN active_wallet_id TEXT",
        "ALTER TABLE accounts ADD COLUMN wallets_json TEXT NOT NULL DEFAULT '[]'",
        "ALTER TABLE accounts ADD COLUMN referral_code TEXT",
        "ALTER TABLE accounts ADD COLUMN referred_by_code TEXT",
        "ALTER TABLE accounts ADD COLUMN referred_by_telegram_user_id TEXT",
        "ALTER TABLE imperial_sessions ADD COLUMN referrer_username TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE imperial_sessions ADD COLUMN profile_address TEXT",
        "ALTER TABLE imperial_sessions ADD COLUMN profile_usdc_native INTEGER",
        "ALTER TABLE imperial_sessions ADD COLUMN profile_synced_at TEXT",
        "ALTER TABLE automation_orders ADD COLUMN scheduler_json TEXT NOT NULL DEFAULT '{}'",
        "ALTER TABLE automation_configs ADD COLUMN mint TEXT",
        "ALTER TABLE automation_configs ADD COLUMN sell_bps INTEGER",
        "ALTER TABLE automation_configs ADD COLUMN trigger_price TEXT",
        "ALTER TABLE automation_configs ADD COLUMN trigger_direction TEXT",
        "ALTER TABLE automation_configs ADD COLUMN bundle_items_json TEXT",
        "ALTER TABLE automation_configs ADD COLUMN strategy_json TEXT NOT NULL DEFAULT '{}'",
      ]) {
        try {
          this.state.storage.sql.exec(statement);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          if (!message.toLowerCase().includes("duplicate column")) throw error;
        }
      }
      for (const statement of [
        `CREATE INDEX IF NOT EXISTS idx_accounts_referral_code
          ON accounts (referral_code)`,
        `CREATE INDEX IF NOT EXISTS idx_accounts_referred_by_user
          ON accounts (referred_by_telegram_user_id)`,
      ]) {
        this.state.storage.sql.exec(statement);
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/robinhood-alpha-state" && request.method === "GET") {
      return readRobinhoodAlphaStoreRequest(this.state);
    }
    if (url.pathname === "/robinhood-alpha-state" && request.method === "PUT") {
      return writeRobinhoodAlphaStoreRequest(request, this.state);
    }

    if (url.pathname === "/account" && request.method === "GET") {
      const telegramUserId = stringValue(
        url.searchParams.get("telegramUserId"),
      );
      if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
        return json({ error: "telegramUserId is required" }, { status: 400 });
      }

      const account = this.getAccount(telegramUserId);
      if (!account) {
        return json({ status: "not_found", telegramUserId }, { status: 404 });
      }
      const spotWallet = tradingBotAccountWalletByRole(account, "spot_nft");
      return json({
        status: "ready",
        account,
        setup: {
          imperialConnected: Boolean(
            spotWallet &&
              this.getImperialSession(
                telegramUserId,
                spotWallet.solanaWalletAddress,
              ),
          ),
        },
      });
    }

    if (url.pathname === "/events" && request.method === "GET") {
      const telegramUserId = stringValue(
        url.searchParams.get("telegramUserId"),
      );
      if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
        return json({ error: "telegramUserId is required" }, { status: 400 });
      }
      const limit = clampInteger(
        numberValue(url.searchParams.get("limit")),
        1,
        500,
        100,
      );
      return json({
        status: "ready",
        telegramUserId,
        events: this.getEvents(telegramUserId, limit),
      });
    }

    if (url.pathname === "/event" && request.method === "GET") {
      const telegramUserId = stringValue(
        url.searchParams.get("telegramUserId"),
      );
      const eventId = stringValue(url.searchParams.get("eventId"));
      if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
        return json({ error: "telegramUserId is required" }, { status: 400 });
      }
      if (!eventId || !TRADING_BOT_EXECUTION_REFERENCE_PATTERN.test(eventId)) {
        return json({ error: "eventId is required" }, { status: 400 });
      }
      const event = this.getEvent(telegramUserId, eventId);
      if (!event) {
        return json({ status: "not_found", eventId }, { status: 404 });
      }
      return json({ status: "ready", event });
    }

    if (url.pathname === "/event" && request.method === "POST") {
      let body: {
        telegramUserId?: unknown;
        eventId?: unknown;
        eventType?: unknown;
        metadata?: unknown;
      };
      try {
        body = (await request.json()) as {
          telegramUserId?: unknown;
          eventId?: unknown;
          eventType?: unknown;
          metadata?: unknown;
        };
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const telegramUserId = stringValue(body.telegramUserId);
      const eventId = stringValue(body.eventId);
      const eventType = stringValue(body.eventType);
      if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
        return json({ error: "telegramUserId is required" }, { status: 400 });
      }
      if (eventId && !TRADING_BOT_EXECUTION_REFERENCE_PATTERN.test(eventId)) {
        return json({ error: "eventId is invalid" }, { status: 400 });
      }
      if (!eventType || !/^[a-z_]{3,64}$/.test(eventType)) {
        return json({ error: "eventType is required" }, { status: 400 });
      }
      const metadata =
        body.metadata &&
        typeof body.metadata === "object" &&
        !Array.isArray(body.metadata)
          ? (body.metadata as Record<string, unknown>)
          : {};
      const event = this.recordAccountEvent(
        telegramUserId,
        eventType,
        metadata,
        eventId,
      );
      return json({ status: "ready", event });
    }

    if (url.pathname === "/manual-reviews" && request.method === "GET") {
      const status = manualReviewCaseStatusFilterValue(
        url.searchParams.get("status"),
      );
      if (!status) {
        return json({ error: "status is invalid" }, { status: 400 });
      }
      const limit = clampInteger(
        numberValue(url.searchParams.get("limit")),
        1,
        500,
        DEFAULT_TRADING_BOT_MANUAL_REVIEW_LIMIT,
      );
      return json({
        status: "ready",
        filter: status,
        cases: this.listManualReviewCases(status, limit),
      });
    }

    if (url.pathname === "/manual-review" && request.method === "GET") {
      const caseId = stringValue(url.searchParams.get("caseId"));
      if (!caseId || !TRADING_BOT_EXECUTION_REFERENCE_PATTERN.test(caseId)) {
        return json({ error: "caseId is required" }, { status: 400 });
      }
      const reviewCase = this.getManualReviewCase(caseId);
      if (!reviewCase) {
        return json({ status: "not_found", caseId }, { status: 404 });
      }
      return json({ status: "ready", case: reviewCase });
    }

    if (url.pathname === "/manual-review" && request.method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }
      const result = this.storeManualReviewCase(body);
      if ("error" in result) {
        return json({ error: result.error }, { status: result.status ?? 400 });
      }
      return json({ status: "ready", case: result.case });
    }

    if (
      url.pathname === "/manual-review/acknowledge" &&
      request.method === "POST"
    ) {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }
      const result = this.acknowledgeManualReviewCase(body);
      if ("error" in result) {
        return json({ error: result.error }, { status: result.status ?? 400 });
      }
      return json({ status: "acknowledged", case: result.case });
    }

    if (url.pathname === "/manual-review/check" && request.method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }
      const result = this.updateManualReviewCaseCheck(body);
      if ("error" in result) {
        return json({ error: result.error }, { status: result.status ?? 400 });
      }
      return json({ status: "ready", case: result.case });
    }

    if (url.pathname === "/wallet" && request.method === "POST") {
      let body: TradingBotAccountWalletBody;
      try {
        body = (await request.json()) as TradingBotAccountWalletBody;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const result = this.upsertWallet(body);
      if ("error" in result) {
        return json({ error: result.error }, { status: 400 });
      }
      return json({ status: "ready", account: result.account });
    }

    if (url.pathname === "/wallet/sync" && request.method === "POST") {
      let body: TradingBotAccountWalletSyncBody;
      try {
        body = (await request.json()) as TradingBotAccountWalletSyncBody;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }
      const result = this.syncPrivyWallets(body);
      if ("error" in result) {
        return json({ error: result.error }, { status: result.status ?? 400 });
      }
      return json({ status: "ready", account: result.account });
    }

    if (url.pathname === "/wallet/select" && request.method === "POST") {
      let body: TradingBotAccountWalletSelectBody;
      try {
        body = (await request.json()) as TradingBotAccountWalletSelectBody;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }
      const result = this.selectWallet(body);
      if ("error" in result) {
        return json({ error: result.error }, { status: result.status ?? 400 });
      }
      return json({ status: "ready", account: result.account });
    }

    if (url.pathname === "/referral" && request.method === "GET") {
      const telegramUserId = stringValue(
        url.searchParams.get("telegramUserId"),
      );
      if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
        return json({ error: "telegramUserId is required" }, { status: 400 });
      }

      const account = this.ensureAccount(telegramUserId);
      return json({
        status: "ready",
        summary: this.referralSummary(account),
      });
    }

    if (url.pathname === "/referral" && request.method === "POST") {
      let body: TradingBotReferralBody;
      try {
        body = (await request.json()) as TradingBotReferralBody;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const result = this.applyReferral(body);
      if ("error" in result) {
        return json({ error: result.error }, { status: result.status ?? 400 });
      }
      return json({
        status: "accepted",
        applied: result.applied,
        summary: result.summary,
        warnings: result.summary.warnings,
      });
    }

    if (url.pathname === "/control-code" && request.method === "POST") {
      let body: TradingBotControlCodeBody;
      try {
        body = (await request.json()) as TradingBotControlCodeBody;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const result = await this.createControlCode(body);
      if ("error" in result) {
        return json({ error: result.error }, { status: result.status ?? 400 });
      }
      return json({
        status: "ready",
        telegramUserId: result.telegramUserId,
        code: result.code,
        expiresAt: result.expiresAt,
      });
    }

    if (url.pathname === "/setup-reset" && request.method === "POST") {
      let body: TradingBotSetupResetBody;
      try {
        body = (await request.json()) as TradingBotSetupResetBody;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const result = this.resetSetup(body);
      if ("error" in result) {
        return json({ error: result.error }, { status: result.status ?? 400 });
      }
      return json({
        status: "reset",
        telegramUserId: result.telegramUserId,
        walletAddress: result.walletAddress,
        resetAt: result.resetAt,
      });
    }

    if (url.pathname === "/control-session" && request.method === "POST") {
      let body: TradingBotControlSessionBody;
      try {
        body = (await request.json()) as TradingBotControlSessionBody;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const result = await this.consumeControlCode(body);
      if ("error" in result) {
        return json({ error: result.error }, { status: result.status ?? 400 });
      }
      return json({
        status: "ready",
        account: result.account,
        sessionToken: result.sessionToken,
        sessionExpiresAt: result.sessionExpiresAt,
        imperialConnection: result.imperialConnection,
      });
    }

    if (url.pathname === "/control-imperial" && request.method === "POST") {
      let body: TradingBotControlImperialBody;
      try {
        body = (await request.json()) as TradingBotControlImperialBody;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const result = await this.connectImperial(body);
      if ("error" in result) {
        return json({ error: result.error }, { status: result.status ?? 400 });
      }
      return json({
        status: "connected",
        connection: result.connection,
      });
    }

    if (url.pathname === "/imperial-profile" && request.method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const result = await this.getAuthenticatedImperialProfile(body);
      if ("error" in result) {
        return json({ error: result.error }, { status: result.status });
      }
      return json({ status: "ready", snapshot: result.snapshot });
    }

    if (
      url.pathname === "/delta-neutral/preview" &&
      request.method === "POST"
    ) {
      const body = await parseDeltaNeutralRequestBody(request);
      if ("error" in body) return json(body, { status: 400 });
      return this.previewDeltaNeutral(body.telegramUserId);
    }

    if (
      url.pathname === "/delta-neutral/start" &&
      request.method === "POST"
    ) {
      const body = await parseDeltaNeutralRequestBody(request, true);
      if ("error" in body) return json(body, { status: 400 });
      return this.startDeltaNeutral(body);
    }

    if (
      url.pathname === "/delta-neutral/status" &&
      request.method === "POST"
    ) {
      const body = await parseDeltaNeutralRequestBody(request);
      if ("error" in body) return json(body, { status: 400 });
      return this.getDeltaNeutralStatus(body.telegramUserId);
    }

    if (
      url.pathname === "/delta-neutral/stop" &&
      request.method === "POST"
    ) {
      const body = await parseDeltaNeutralRequestBody(request);
      if ("error" in body) return json(body, { status: 400 });
      return this.stopDeltaNeutral(body.telegramUserId);
    }

    if (url.pathname === "/control-preferences" && request.method === "POST") {
      let body: TradingBotControlPreferenceBody;
      try {
        body = (await request.json()) as TradingBotControlPreferenceBody;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const result = await this.applyControlPreference(body);
      if ("error" in result) {
        return json({ error: result.error }, { status: result.status ?? 400 });
      }
      return json({
        status: "accepted",
        normalized: result.normalized,
        accountStorage: "stored",
        account: result.account,
        warnings: preferenceValidationWarnings(result.normalized, true),
        validatedAt: new Date().toISOString(),
      });
    }

    if (url.pathname === "/control-wallet" && request.method === "POST") {
      let body: TradingBotControlWalletBody;
      try {
        body = (await request.json()) as TradingBotControlWalletBody;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const result = await this.applyControlWalletAction(body);
      if ("error" in result) {
        return json({ error: result.error }, { status: result.status ?? 400 });
      }
      return json({
        status: result.status,
        action: result.action,
        account: result.account,
        walletAddress: result.account.solanaWalletAddress ?? null,
        claimUrl: result.claimUrl ?? null,
        warnings: result.warnings,
        updatedAt: result.updatedAt,
      });
    }

    if (url.pathname === "/automation-order" && request.method === "POST") {
      let body: {
        orderId?: unknown;
        order?: TradingBotOrderValidationBody;
        validation?: { validatedAt?: unknown; warnings?: unknown };
      };
      try {
        body = (await request.json()) as {
          orderId?: unknown;
          order?: TradingBotOrderValidationBody;
          validation?: { validatedAt?: unknown; warnings?: unknown };
        };
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const result = this.storeAutomationOrder(body);
      if ("error" in result) {
        return json({ error: result.error }, { status: result.status ?? 400 });
      }
      return json({
        status: "stored",
        orderKind: result.order.kind,
        order: result.order,
        normalized: storedOrderToNormalizedOrder(result.order),
        warnings: result.order.validation.warnings,
        validatedAt: result.order.validation.validatedAt,
      });
    }

    if (url.pathname === "/automation-orders" && request.method === "GET") {
      const telegramUserId = stringValue(
        url.searchParams.get("telegramUserId"),
      );
      if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
        return json({ error: "telegramUserId is required" }, { status: 400 });
      }
      return json({
        status: "ready",
        telegramUserId,
        orders: this.listAutomationOrders(telegramUserId),
      });
    }

    if (
      url.pathname === "/automation-orders/active" &&
      request.method === "GET"
    ) {
      const limit = clampInteger(
        numberValue(url.searchParams.get("limit")),
        1,
        500,
        DEFAULT_TRADING_BOT_SCHEDULER_MAX_ORDERS,
      );
      return json({
        status: "ready",
        orders: this.listActiveAutomationOrders(limit),
        executingOrders: this.listAutomationOrdersByStatus("executing", limit),
      });
    }

    if (
      url.pathname === "/automation-order/claim" &&
      request.method === "POST"
    ) {
      let body: {
        telegramUserId?: unknown;
        orderId?: unknown;
        executionId?: unknown;
        executionReferenceId?: unknown;
      };
      try {
        body = (await request.json()) as {
          telegramUserId?: unknown;
          orderId?: unknown;
          executionId?: unknown;
          executionReferenceId?: unknown;
        };
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const result = this.claimAutomationOrder(body);
      if ("error" in result) {
        return json(
          {
            status: result.status === 409 ? "not_claimed" : "error",
            error: result.error,
            ...(result.order ? { order: result.order } : {}),
          },
          { status: result.status ?? 400 },
        );
      }
      return json({
        status: "claimed",
        executionId: result.executionId,
        order: result.order,
      });
    }

    if (
      url.pathname === "/automation-order/check" &&
      request.method === "POST"
    ) {
      let body: {
        telegramUserId?: unknown;
        orderId?: unknown;
        scheduler?: unknown;
        status?: unknown;
        expectedStatus?: unknown;
        expectedExecutionId?: unknown;
      };
      try {
        body = (await request.json()) as {
          telegramUserId?: unknown;
          orderId?: unknown;
          scheduler?: unknown;
          status?: unknown;
          expectedStatus?: unknown;
          expectedExecutionId?: unknown;
        };
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const result = this.updateAutomationOrderScheduler(body);
      if ("error" in result) {
        return json({ error: result.error }, { status: result.status ?? 400 });
      }
      return json({
        status: "ready",
        order: result.order,
      });
    }

    if (
      url.pathname === "/automation-order/cancel" &&
      request.method === "POST"
    ) {
      let body: { telegramUserId?: unknown; orderId?: unknown };
      try {
        body = (await request.json()) as {
          telegramUserId?: unknown;
          orderId?: unknown;
        };
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const result = this.cancelAutomationOrder(body);
      if ("error" in result) {
        return json({ error: result.error }, { status: result.status ?? 400 });
      }
      return json({
        status: "cancelled",
        order: result.order,
      });
    }

    if (url.pathname === "/automation-config" && request.method === "POST") {
      let body: {
        configId?: unknown;
        kind?: unknown;
        config?:
          | TradingBotCopyTradeValidationBody
          | TradingBotSniperValidationBody
          | TradingBotAutoBuyValidationBody
          | TradingBotBundleBuyValidationBody
          | TradingBotAutoSellValidationBody;
        validation?: { validatedAt?: unknown; warnings?: unknown };
      };
      try {
        body = (await request.json()) as {
          configId?: unknown;
          kind?: unknown;
          config?:
            | TradingBotCopyTradeValidationBody
            | TradingBotSniperValidationBody
            | TradingBotAutoBuyValidationBody
            | TradingBotBundleBuyValidationBody
            | TradingBotAutoSellValidationBody;
          validation?: { validatedAt?: unknown; warnings?: unknown };
        };
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const result = this.storeAdvancedAutomationConfig(body);
      if ("error" in result) {
        return json({ error: result.error }, { status: result.status ?? 400 });
      }
      return json({
        status: "stored",
        configKind: result.config.kind,
        config: result.config,
        normalized: storedAdvancedConfigToNormalizedConfig(result.config),
        warnings: result.config.validation.warnings,
        validatedAt: result.config.validation.validatedAt,
      });
    }

    if (
      url.pathname === "/automation-config/update" &&
      request.method === "POST"
    ) {
      let body: {
        configId?: unknown;
        kind?: unknown;
        config?: TradingBotCopyTradeValidationBody;
        validation?: { validatedAt?: unknown; warnings?: unknown };
      };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }
      const result = this.updateAdvancedAutomationConfig(body);
      if ("error" in result) {
        return json(
          { error: result.error, config: result.config },
          { status: result.status ?? 400 },
        );
      }
      return json({
        status: "updated",
        targetChanged: result.targetChanged,
        config: result.config,
        normalized: storedAdvancedConfigToNormalizedConfig(result.config),
        warnings: result.config.validation.warnings,
        validatedAt: result.config.validation.validatedAt,
      });
    }

    if (
      url.pathname === "/automation-config/duplicate" &&
      request.method === "POST"
    ) {
      let body: {
        telegramUserId?: unknown;
        configId?: unknown;
        kind?: unknown;
        tag?: unknown;
      };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }
      const result = this.duplicateAdvancedAutomationConfig(body);
      if ("error" in result) {
        return json(
          { error: result.error, config: result.config },
          { status: result.status ?? 400 },
        );
      }
      return json({
        status: "duplicated",
        sourceConfigId: result.sourceConfigId,
        config: result.config,
        normalized: storedAdvancedConfigToNormalizedConfig(result.config),
        warnings: result.config.validation.warnings,
        validatedAt: result.config.validation.validatedAt,
      });
    }

    if (url.pathname === "/automation-configs" && request.method === "GET") {
      const telegramUserId = stringValue(
        url.searchParams.get("telegramUserId"),
      );
      const kind = advancedAutomationKindValue(url.searchParams.get("kind"));
      if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
        return json({ error: "telegramUserId is required" }, { status: 400 });
      }
      return json({
        status: "ready",
        telegramUserId,
        kind: kind ?? null,
        configs: this.listAdvancedAutomationConfigs(telegramUserId, kind),
      });
    }

    if (
      url.pathname === "/automation-configs/active" &&
      request.method === "GET"
    ) {
      const kind = advancedAutomationKindValue(url.searchParams.get("kind"));
      const limit = clampInteger(
        numberValue(url.searchParams.get("limit")),
        1,
        500,
        DEFAULT_TRADING_BOT_ADVANCED_MONITOR_MAX_CONFIGS,
      );
      return json({
        status: "ready",
        kind: kind ?? null,
        configs: this.listActiveAdvancedAutomationConfigs(kind, limit),
        executingConfigs: this.listAdvancedAutomationConfigsByStatus(
          "executing",
          kind,
          limit,
        ),
      });
    }

    if (
      url.pathname === "/automation-config/claim" &&
      request.method === "POST"
    ) {
      let body: {
        telegramUserId?: unknown;
        configId?: unknown;
        kind?: unknown;
        monitor?: unknown;
      };
      try {
        body = (await request.json()) as {
          telegramUserId?: unknown;
          configId?: unknown;
          kind?: unknown;
          monitor?: unknown;
        };
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const result = this.claimAdvancedAutomationConfig(body);
      if ("error" in result) {
        return json(
          { error: result.error, config: result.config },
          { status: result.status ?? 400 },
        );
      }
      return json({ status: "claimed", config: result.config });
    }

    if (
      url.pathname === "/automation-config/check" &&
      request.method === "POST"
    ) {
      let body: {
        telegramUserId?: unknown;
        configId?: unknown;
        kind?: unknown;
        monitor?: unknown;
        status?: unknown;
        clearLastError?: unknown;
        expectedStatus?: unknown;
        expectedExecutionId?: unknown;
      };
      try {
        body = (await request.json()) as {
          telegramUserId?: unknown;
          configId?: unknown;
          kind?: unknown;
          monitor?: unknown;
          status?: unknown;
          clearLastError?: unknown;
          expectedStatus?: unknown;
          expectedExecutionId?: unknown;
        };
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const result = this.updateAdvancedAutomationConfigMonitor(body);
      if ("error" in result) {
        return json({ error: result.error }, { status: result.status ?? 400 });
      }
      return json({
        status: "ready",
        config: result.config,
      });
    }

    if (
      url.pathname === "/automation-config/control" &&
      request.method === "POST"
    ) {
      let body: {
        telegramUserId?: unknown;
        configId?: unknown;
        kind?: unknown;
        action?: unknown;
      };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const result = this.controlAdvancedAutomationConfig(body);
      if ("error" in result) {
        return json(
          { error: result.error, config: result.config },
          { status: result.status ?? 400 },
        );
      }
      return json({ status: result.action, config: result.config });
    }

    if (
      url.pathname === "/automation-config/cancel" &&
      request.method === "POST"
    ) {
      let body: {
        telegramUserId?: unknown;
        configId?: unknown;
        kind?: unknown;
      };
      try {
        body = (await request.json()) as {
          telegramUserId?: unknown;
          configId?: unknown;
          kind?: unknown;
        };
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const result = this.cancelAdvancedAutomationConfig(body);
      if ("error" in result) {
        return json(
          { error: result.error, config: result.config },
          { status: result.status ?? 400 },
        );
      }
      return json({
        status: "cancelled",
        config: result.config,
      });
    }

    if (url.pathname === "/preferences" && request.method === "POST") {
      let preference: NormalizedTradingBotPreference;
      try {
        preference = (await request.json()) as NormalizedTradingBotPreference;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const result = this.applyPreference(preference);
      if ("error" in result) {
        return json({ error: result.error }, { status: 400 });
      }
      return json({ status: "ready", account: result.account });
    }

    return json({ error: "Not found" }, { status: 404 });
  }

  private upsertWallet(
    body: TradingBotAccountWalletBody,
  ): { account: TradingBotAccountSnapshot } | { error: string } {
    const telegramUserId = stringValue(body.telegramUserId);
    const username = stringValue(body.username);
    const walletSource = walletSourceValue(body.walletSource);
    const privyUserId = stringValue(body.privyUserId);
    const privyWalletId = stringValue(body.privyWalletId);
    const solanaWalletAddress = stringValue(body.solanaWalletAddress);

    if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
      return { error: "telegramUserId is required" };
    }
    if (!walletSource) {
      return { error: "walletSource must be privy or external" };
    }
    if (
      !solanaWalletAddress ||
      !SOLANA_ADDRESS_PATTERN.test(solanaWalletAddress)
    ) {
      return { error: "solanaWalletAddress must be a Solana address" };
    }
    if (walletSource === "privy" && (!privyUserId || !privyWalletId)) {
      return { error: "Privy wallets require privyUserId and privyWalletId" };
    }

    const account = this.getOrCreateAccount(telegramUserId, {
      username,
      solanaWalletAddress,
    });
    account.username = username ?? account.username;
    const walletId =
      walletSource === "privy" && privyWalletId
        ? privyWalletId
        : `external:${solanaWalletAddress}`;
    const existing = account.wallets.find(
      (wallet) =>
        wallet.walletId === walletId ||
        wallet.solanaWalletAddress === solanaWalletAddress,
    );
    const replacedWallet =
      existing ??
      (walletSource === "privy"
        ? account.wallets.find((wallet) => wallet.walletSource === "privy")
        : undefined);
    if (!replacedWallet && account.wallets.length >= 10) {
      return { error: "Trading accounts support at most 10 wallets" };
    }
    const slot: TradingBotAccountWalletSlot = {
      walletId,
      label:
        walletSource === "external"
          ? PORTFOLIO_WALLET_LABEL
          : SPOT_NFT_WALLET_LABEL,
      role: walletSource === "external" ? "portfolio" : "spot_nft",
      walletSource,
      ...(privyUserId ? { privyUserId } : {}),
      ...(privyWalletId ? { privyWalletId } : {}),
      solanaWalletAddress,
      createdAt: replacedWallet?.createdAt ?? new Date().toISOString(),
    };
    account.wallets = replacedWallet
      ? account.wallets.map((wallet) =>
          wallet.walletId === replacedWallet.walletId ? slot : wallet,
        )
      : [...account.wallets, slot];
    if (slot.role !== "portfolio") {
      activateTradingBotAccountWallet(account, slot);
    }
    account.updatedAt = new Date().toISOString();

    this.saveAccount(account);
    this.recordAccountEvent(account.telegramUserId, "wallet_updated", {
      walletSource,
      solanaWalletAddress,
      hasPrivyUserId: Boolean(account.privyUserId),
      hasPrivyWalletId: Boolean(account.privyWalletId),
      walletId,
      walletCount: account.wallets.length,
    });
    return { account };
  }

  private syncPrivyWallets(
    body: TradingBotAccountWalletSyncBody,
  ):
    | { account: TradingBotAccountSnapshot }
    | { error: string; status?: number } {
    const telegramUserId = stringValue(body.telegramUserId);
    const username = stringValue(body.username);
    const privyUserId = stringValue(body.privyUserId);
    if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
      return { error: "telegramUserId is required" };
    }
    if (!privyUserId) return { error: "privyUserId is required" };
    const now = new Date().toISOString();
    const incoming = tradingBotAccountWalletSlotsValue(body.wallets, now).filter(
      (wallet) =>
        wallet.walletSource === "privy" &&
        wallet.privyUserId === privyUserId,
    );
    if (incoming.length === 0) {
      return { error: "At least one managed Privy wallet is required" };
    }

    const account = this.getOrCreateAccount(telegramUserId, { username });
    account.username = username ?? account.username;
    const existingById = new Map(
      account.wallets.map((wallet) => [wallet.walletId, wallet]),
    );
    const managed = incoming.slice(0, 1).map((wallet) => ({
      ...wallet,
      label: SPOT_NFT_WALLET_LABEL,
      role: "spot_nft" as const,
      createdAt: existingById.get(wallet.walletId)?.createdAt ?? wallet.createdAt,
    }));
    account.wallets = [
      ...account.wallets.filter((wallet) => wallet.walletSource === "external"),
      ...managed,
    ].slice(0, 10);
    activateTradingBotAccountWallet(account, managed[0]);
    account.updatedAt = now;
    this.saveAccount(account);
    this.recordAccountEvent(account.telegramUserId, "wallet_inventory_synced", {
      activeWalletId: account.activeWalletId,
      managedWalletCount: managed.length,
      walletCount: account.wallets.length,
    });
    return { account };
  }

  private selectWallet(
    body: TradingBotAccountWalletSelectBody,
  ):
    | { account: TradingBotAccountSnapshot }
    | { error: string; status?: number } {
    const telegramUserId = stringValue(body.telegramUserId);
    const walletId = stringValue(body.walletId);
    if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
      return { error: "telegramUserId is required" };
    }
    if (!walletId) return { error: "walletId is required" };
    const account = this.getAccount(telegramUserId);
    if (!account) return { error: "Trading account not found", status: 404 };
    const selection = selectTradingBotAccountWallet(account, walletId);
    if ("error" in selection) return { error: selection.error, status: 404 };
    const wallet = selection.wallet;
    account.updatedAt = new Date().toISOString();
    this.saveAccount(account);
    this.recordAccountEvent(account.telegramUserId, "active_wallet_selected", {
      walletId: wallet.walletId,
      walletSource: wallet.walletSource,
      solanaWalletAddress: wallet.solanaWalletAddress,
    });
    return { account };
  }

  private applyPreference(
    preference: NormalizedTradingBotPreference,
  ): { account: TradingBotAccountSnapshot } | { error: string } {
    const valid = validateNormalizedPreference(preference);
    if (valid) return { error: valid };

    const account = this.getOrCreateAccount(preference.telegramUserId, {
      solanaWalletAddress: preference.userPublicKey,
    });
    if (preference.userPublicKey && !account.solanaWalletAddress) {
      account.solanaWalletAddress = preference.userPublicKey;
    }

    if (preference.kind === "settings" && preference.settings) {
      account.settings = mergeStoredSettings(
        account.settings,
        preference.settings,
      );
    } else if (preference.kind === "watchlist" && preference.mint) {
      account.watchlist = applyTokenListAction(
        account.watchlist,
        preference.action,
        preference.mint,
      );
    } else if (preference.kind === "hiddenToken" && preference.mint) {
      account.hiddenTokens = applyTokenListAction(
        account.hiddenTokens,
        preference.action,
        preference.mint,
      );
    }

    account.updatedAt = new Date().toISOString();
    this.saveAccount(account);
    this.recordAccountEvent(account.telegramUserId, "preference_updated", {
      kind: preference.kind,
      action: preference.action,
      mint: preference.mint,
      settings: preference.settings
        ? Object.keys(preference.settings).sort()
        : undefined,
    });
    return { account };
  }

  private applyReferral(body: TradingBotReferralBody):
    | {
        applied: boolean;
        summary: TradingBotReferralSummary;
      }
    | { error: string; status?: number } {
    const telegramUserId = stringValue(body.telegramUserId);
    const username = stringValue(body.username);
    const referralCode = stringValue(body.referralCode)?.toUpperCase();

    if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
      return { error: "telegramUserId is required" };
    }
    if (!referralCode || !REFERRAL_CODE_PATTERN.test(referralCode)) {
      return { error: "referralCode is required" };
    }

    const account = this.ensureAccount(telegramUserId, { username });
    if (account.referralCode === referralCode) {
      return { error: "Users cannot apply their own referral code" };
    }

    const referrer = this.getAccountByReferralCode(referralCode);
    if (!referrer) {
      return { error: "Referral code was not found", status: 404 };
    }

    if (account.referredByTelegramUserId) {
      const sameReferrer =
        account.referredByTelegramUserId === referrer.telegramUserId;
      if (sameReferrer) {
        return {
          applied: false,
          summary: this.referralSummary(account),
        };
      }
      return {
        error: "Referral code has already been set for this account",
        status: 409,
      };
    }

    account.referredByCode = referrer.referralCode;
    account.referredByTelegramUserId = referrer.telegramUserId;
    account.updatedAt = new Date().toISOString();
    this.saveAccount(account);
    this.recordAccountEvent(account.telegramUserId, "referral_applied", {
      referralCode,
      referrerTelegramUserId: referrer.telegramUserId,
    });
    this.recordAccountEvent(referrer.telegramUserId, "referral_received", {
      referredTelegramUserId: account.telegramUserId,
      referralCode,
    });

    return {
      applied: true,
      summary: this.referralSummary(account),
    };
  }

  private ensureAccount(
    telegramUserId: string,
    defaults: { username?: string; solanaWalletAddress?: string } = {},
  ): TradingBotAccountSnapshot {
    const account = this.getOrCreateAccount(telegramUserId, defaults);
    if (defaults.username) account.username = defaults.username;
    if (defaults.solanaWalletAddress && !account.solanaWalletAddress) {
      account.solanaWalletAddress = defaults.solanaWalletAddress;
    }
    if (!account.referralCode) {
      account.referralCode = this.generateUniqueReferralCode();
    }
    account.updatedAt = new Date().toISOString();
    this.saveAccount(account);
    return account;
  }

  private referralSummary(
    account: TradingBotAccountSnapshot,
  ): TradingBotReferralSummary {
    const referralCode =
      account.referralCode ?? this.generateUniqueReferralCode();
    if (!account.referralCode) {
      account.referralCode = referralCode;
      account.updatedAt = new Date().toISOString();
      this.saveAccount(account);
    }

    const referredUsers =
      this.state.storage.sql
        .exec<{ count: number }>(
          `SELECT COUNT(*) as count
          FROM accounts
          WHERE referred_by_telegram_user_id = ?`,
          account.telegramUserId,
        )
        .toArray()[0]?.count ?? 0;

    return {
      telegramUserId: account.telegramUserId,
      referralCode,
      ...(account.referredByCode
        ? { referredByCode: account.referredByCode }
        : {}),
      ...(account.referredByTelegramUserId
        ? { referredByTelegramUserId: account.referredByTelegramUserId }
        : {}),
      referredUsers,
      rewardStatus: "tracking_only",
      claimableRewards: [],
      updatedAt: account.updatedAt,
      warnings: referralWarnings(),
    };
  }

  private getAccountByReferralCode(
    referralCode: string,
  ): TradingBotAccountSnapshot | null {
    const row =
      this.state.storage.sql
        .exec<TradingBotAccountRow>(
          "SELECT * FROM accounts WHERE referral_code = ? LIMIT 1",
          referralCode,
        )
        .toArray()[0] ?? null;
    return row ? rowToTradingBotAccount(row) : null;
  }

  private generateUniqueReferralCode(): string {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const code = generateReferralCode();
      if (!this.getAccountByReferralCode(code)) return code;
    }
    return `R${Date.now().toString(36).toUpperCase()}`;
  }

  private storeAutomationOrder(body: {
    orderId?: unknown;
    order?: TradingBotOrderValidationBody;
    validation?: { validatedAt?: unknown; warnings?: unknown };
  }):
    | { order: TradingBotStoredAutomationOrderSnapshot }
    | { error: string; status?: number } {
    const orderId =
      stringValue(body.orderId) ?? generateTradingBotAutomationOrderId();
    if (!TRADING_BOT_ORDER_ID_PATTERN.test(orderId)) {
      return { error: "orderId is invalid" };
    }
    if (!body.order || typeof body.order !== "object") {
      return { error: "order is required" };
    }

    const normalizedResult = normalizeTradingBotOrder(body.order);
    if ("error" in normalizedResult) return { error: normalizedResult.error };

    const normalized = normalizedResult.normalized;
    const existing = this.getAutomationOrder(
      normalized.telegramUserId,
      orderId,
    );
    if (existing) {
      return { error: "orderId already exists", status: 409 };
    }

    const now = new Date().toISOString();
    const validation = automationOrderValidationValue(
      body.validation,
      orderValidationWarnings(normalized),
      now,
    );

    const order: TradingBotStoredAutomationOrderSnapshot = {
      telegramUserId: normalized.telegramUserId,
      orderId,
      kind: normalized.kind,
      side: normalized.side,
      status: "staged",
      mint: normalized.mint,
      inMint: normalized.inMint,
      outMint: normalized.outMint,
      amountIn: normalized.amountIn,
      ...(normalized.amountLabel
        ? { amountLabel: normalized.amountLabel }
        : {}),
      walletAddress: normalized.userPublicKey,
      slippageBps: normalized.slippageBps,
      priorityFee: normalized.priorityFee,
      ...(normalized.triggerPrice
        ? { triggerPrice: normalized.triggerPrice }
        : {}),
      ...(normalized.triggerDirection
        ? { triggerDirection: normalized.triggerDirection }
        : {}),
      ...(normalized.orderCount !== undefined
        ? { orderCount: normalized.orderCount }
        : {}),
      ...(normalized.intervalMinutes !== undefined
        ? { intervalMinutes: normalized.intervalMinutes }
        : {}),
      ...(normalized.perOrderAmountIn
        ? { perOrderAmountIn: normalized.perOrderAmountIn }
        : {}),
      ...(normalized.trailingBps !== undefined
        ? { trailingBps: normalized.trailingBps }
        : {}),
      createdAt: now,
      updatedAt: now,
      validation,
      scheduler: {},
    };

    this.state.storage.sql.exec(
      `INSERT INTO automation_orders (
        telegram_user_id, order_id, kind, side, status, mint, in_mint, out_mint,
        amount_in, amount_label, wallet_address, slippage_bps, priority_fee,
        trigger_price, trigger_direction, order_count, interval_minutes,
        per_order_amount_in, trailing_bps, validation_json, scheduler_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      order.telegramUserId,
      order.orderId,
      order.kind,
      order.side,
      order.status,
      order.mint,
      order.inMint,
      order.outMint,
      order.amountIn,
      order.amountLabel ?? null,
      order.walletAddress,
      order.slippageBps,
      order.priorityFee,
      order.triggerPrice ?? null,
      order.triggerDirection ?? null,
      order.orderCount ?? null,
      order.intervalMinutes ?? null,
      order.perOrderAmountIn ?? null,
      order.trailingBps ?? null,
      JSON.stringify(order.validation),
      JSON.stringify(order.scheduler),
      order.createdAt,
      order.updatedAt,
    );
    return { order };
  }

  private listAutomationOrders(
    telegramUserId: string,
  ): TradingBotStoredAutomationOrderSnapshot[] {
    return this.state.storage.sql
      .exec<TradingBotAutomationOrderRow>(
        `SELECT * FROM automation_orders
        WHERE telegram_user_id = ?
        ORDER BY created_at DESC`,
        telegramUserId,
      )
      .toArray()
      .map(rowToTradingBotAutomationOrder);
  }

  private listActiveAutomationOrders(
    limit: number,
  ): TradingBotStoredAutomationOrderSnapshot[] {
    return this.listAutomationOrdersByStatus("staged", limit);
  }

  private listAutomationOrdersByStatus(
    status: TradingBotStoredAutomationOrderStatus,
    limit: number,
  ): TradingBotStoredAutomationOrderSnapshot[] {
    return this.state.storage.sql
      .exec<TradingBotAutomationOrderRow>(
        `SELECT * FROM automation_orders
        WHERE status = ?
        ORDER BY updated_at ASC, created_at ASC
        LIMIT ?`,
        status,
        limit,
      )
      .toArray()
      .map(rowToTradingBotAutomationOrder);
  }

  private claimAutomationOrder(body: {
    telegramUserId?: unknown;
    orderId?: unknown;
    executionId?: unknown;
    executionReferenceId?: unknown;
  }):
    | {
        executionId: string;
        order: TradingBotStoredAutomationOrderSnapshot;
      }
    | {
        error: string;
        status?: number;
        order?: TradingBotStoredAutomationOrderSnapshot;
      } {
    const telegramUserId = stringValue(body.telegramUserId);
    const orderId = stringValue(body.orderId);
    const executionId = stringValue(body.executionId);
    const executionReferenceId = stringValue(body.executionReferenceId);
    if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
      return { error: "telegramUserId is required" };
    }
    if (!orderId || !TRADING_BOT_ORDER_ID_PATTERN.test(orderId)) {
      return { error: "orderId is required" };
    }
    if (
      !executionId ||
      !TRADING_BOT_EXECUTION_REFERENCE_PATTERN.test(executionId)
    ) {
      return { error: "executionId is required" };
    }
    if (
      !executionReferenceId ||
      !TRADING_BOT_EXECUTION_REFERENCE_PATTERN.test(executionReferenceId)
    ) {
      return { error: "executionReferenceId is required" };
    }

    const existing = this.getAutomationOrder(telegramUserId, orderId);
    if (!existing) return { error: "Order not found", status: 404 };
    if (existing.status !== "staged") {
      return {
        error: `Order cannot be claimed from ${existing.status} status`,
        status: 409,
        order: existing,
      };
    }

    const now = new Date().toISOString();
    const scheduler: TradingBotAutomationOrderSchedulerState = {
      ...existing.scheduler,
    };
    delete scheduler.executionCompletedAt;
    delete scheduler.executionSignature;
    delete scheduler.executionTransactionId;
    delete scheduler.executionReferenceId;
    delete scheduler.executionSolscanUrl;
    delete scheduler.reconciliationCheckedAt;
    delete scheduler.reconciliationStatus;
    delete scheduler.manualReviewAfter;
    delete scheduler.manualReviewRequiredAt;
    delete scheduler.manualReviewReason;
    delete scheduler.lastError;
    scheduler.executionId = executionId;
    scheduler.executionReferenceId = executionReferenceId;
    scheduler.executionStartedAt = now;

    this.state.storage.sql.exec(
      `UPDATE automation_orders
      SET status = ?, scheduler_json = ?, updated_at = ?
      WHERE telegram_user_id = ? AND order_id = ? AND status = ?`,
      "executing",
      JSON.stringify(scheduler),
      now,
      telegramUserId,
      orderId,
      "staged",
    );

    return {
      executionId,
      order: {
        ...existing,
        status: "executing",
        scheduler,
        updatedAt: now,
      },
    };
  }

  private updateAutomationOrderScheduler(body: {
    telegramUserId?: unknown;
    orderId?: unknown;
    scheduler?: unknown;
    status?: unknown;
    expectedStatus?: unknown;
    expectedExecutionId?: unknown;
  }):
    | { order: TradingBotStoredAutomationOrderSnapshot }
    | { error: string; status?: number } {
    const telegramUserId = stringValue(body.telegramUserId);
    const orderId = stringValue(body.orderId);
    if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
      return { error: "telegramUserId is required" };
    }
    if (!orderId || !TRADING_BOT_ORDER_ID_PATTERN.test(orderId)) {
      return { error: "orderId is required" };
    }

    const existing = this.getAutomationOrder(telegramUserId, orderId);
    if (!existing) return { error: "Order not found", status: 404 };

    const status =
      body.status === undefined
        ? existing.status
        : optionalAutomationOrderStatusValue(body.status);
    if (!status) return { error: "status is invalid" };

    const expectedStatus =
      body.expectedStatus === undefined
        ? undefined
        : optionalAutomationOrderStatusValue(body.expectedStatus);
    if (body.expectedStatus !== undefined && !expectedStatus) {
      return { error: "expectedStatus is invalid" };
    }

    const expectedExecutionId = stringValue(body.expectedExecutionId);
    if (
      body.expectedExecutionId !== undefined &&
      (!expectedExecutionId ||
        !TRADING_BOT_EXECUTION_REFERENCE_PATTERN.test(expectedExecutionId))
    ) {
      return { error: "expectedExecutionId is invalid" };
    }
    if (expectedStatus && existing.status !== expectedStatus) {
      return {
        error: `Order state changed from expected ${expectedStatus} status`,
        status: 409,
      };
    }
    if (
      expectedExecutionId &&
      existing.scheduler.executionId !== expectedExecutionId
    ) {
      return { error: "Order execution attempt has changed", status: 409 };
    }

    const scheduler = automationOrderSchedulerStateValue(body.scheduler);
    const now = new Date().toISOString();
    this.state.storage.sql.exec(
      `UPDATE automation_orders
      SET status = ?, scheduler_json = ?, updated_at = ?
      WHERE telegram_user_id = ? AND order_id = ?`,
      status,
      JSON.stringify(scheduler),
      now,
      telegramUserId,
      orderId,
    );

    return {
      order: {
        ...existing,
        status,
        scheduler,
        updatedAt: now,
      },
    };
  }

  private cancelAutomationOrder(body: {
    telegramUserId?: unknown;
    orderId?: unknown;
  }):
    | { order: TradingBotStoredAutomationOrderSnapshot }
    | { error: string; status?: number } {
    const telegramUserId = stringValue(body.telegramUserId);
    const orderId = stringValue(body.orderId);
    if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
      return { error: "telegramUserId is required" };
    }
    if (!orderId || !TRADING_BOT_ORDER_ID_PATTERN.test(orderId)) {
      return { error: "orderId is required" };
    }

    const existing = this.getAutomationOrder(telegramUserId, orderId);
    if (!existing) return { error: "Order not found", status: 404 };
    if (existing.status === "cancelled") return { order: existing };
    if (existing.status === "executing") {
      return { error: "Order execution is already in progress", status: 409 };
    }
    if (existing.status === "executed") {
      return { error: "Executed orders cannot be cancelled", status: 409 };
    }

    const now = new Date().toISOString();
    this.state.storage.sql.exec(
      `UPDATE automation_orders
      SET status = ?, updated_at = ?
      WHERE telegram_user_id = ? AND order_id = ?`,
      "cancelled",
      now,
      telegramUserId,
      orderId,
    );
    return {
      order: {
        ...existing,
        status: "cancelled",
        updatedAt: now,
      },
    };
  }

  private getAutomationOrder(
    telegramUserId: string,
    orderId: string,
  ): TradingBotStoredAutomationOrderSnapshot | null {
    const row =
      this.state.storage.sql
        .exec<TradingBotAutomationOrderRow>(
          `SELECT * FROM automation_orders
          WHERE telegram_user_id = ? AND order_id = ?
          LIMIT 1`,
          telegramUserId,
          orderId,
        )
        .toArray()[0] ?? null;
    return row ? rowToTradingBotAutomationOrder(row) : null;
  }

  private storeAdvancedAutomationConfig(body: {
    configId?: unknown;
    kind?: unknown;
    config?:
      | TradingBotCopyTradeValidationBody
      | TradingBotSniperValidationBody
      | TradingBotAutoBuyValidationBody
      | TradingBotBundleBuyValidationBody
      | TradingBotAutoSellValidationBody;
    validation?: { validatedAt?: unknown; warnings?: unknown };
  }):
    | { config: TradingBotStoredAdvancedAutomationConfigSnapshot }
    | { error: string; status?: number } {
    const kind = advancedAutomationKindValue(body.kind);
    if (!kind) {
      return {
        error:
          "kind must be copytrade, sniper, auto_buy, bundle_buy, or auto_sell",
      };
    }
    const configId =
      stringValue(body.configId) ?? generateTradingBotAdvancedConfigId(kind);
    if (!TRADING_BOT_ADVANCED_CONFIG_ID_PATTERN.test(configId)) {
      return { error: "configId is invalid" };
    }
    if (!body.config || typeof body.config !== "object") {
      return { error: "config is required" };
    }

    const normalizedResult = normalizeTradingBotAdvancedAutomationConfig(
      kind,
      body.config,
    );
    if ("error" in normalizedResult) return { error: normalizedResult.error };

    const normalized = normalizedResult.normalized;
    const existing = this.getAdvancedAutomationConfig(
      normalized.telegramUserId,
      configId,
    );
    if (existing) {
      return { error: "configId already exists", status: 409 };
    }

    const now = new Date().toISOString();
    const validation = advancedAutomationConfigValidationValue(
      body.validation,
      advancedAutomationValidationWarnings(kind, normalized, true),
      now,
    );

    const config: TradingBotStoredAdvancedAutomationConfigSnapshot = {
      telegramUserId: normalized.telegramUserId,
      configId,
      kind,
      status: "staged",
      walletAddress: normalized.userPublicKey,
      maxBuyAmountIn:
        "maxBuyAmountIn" in normalized ? normalized.maxBuyAmountIn : "0",
      ...(normalized.amountLabel
        ? { amountLabel: normalized.amountLabel }
        : {}),
      slippageBps: normalized.slippageBps,
      priorityFee: normalized.priorityFee,
      minLiquidityUsd:
        "minLiquidityUsd" in normalized ? normalized.minLiquidityUsd : 0,
      ...(normalized.maxMarketCapUsd !== undefined
        ? { maxMarketCapUsd: normalized.maxMarketCapUsd }
        : {}),
      createdAt: now,
      updatedAt: now,
      validation,
      monitor: {},
    };

    if (kind === "copytrade") {
      const copyConfig = normalized as NormalizedTradingBotCopyTrade;
      config.tag = copyConfig.tag;
      config.targetWallet = copyConfig.targetWallet;
      config.buyMode = copyConfig.buyMode;
      config.buyPercentageBps = copyConfig.buyPercentageBps;
      config.sellPriorityFee = copyConfig.sellPriorityFee;
      config.copySells = copyConfig.copySells;
      config.duplicateBuys = copyConfig.duplicateBuys;
      config.onlyRenounced = copyConfig.onlyRenounced;
      config.excludePumpFunTokens = copyConfig.excludePumpFunTokens;
      config.minTargetBuyAmountIn = copyConfig.minTargetBuyAmountIn;
      config.minMarketCapUsd = copyConfig.minMarketCapUsd;
      config.blacklistMints = [...copyConfig.blacklistMints];
    } else if (kind === "sniper") {
      const sniperConfig = normalized as NormalizedTradingBotSniper;
      config.source = sniperConfig.source;
      config.maxSnipes = sniperConfig.maxSnipes;
    } else if (kind === "auto_buy") {
      const autoBuyConfig = normalized as NormalizedTradingBotAutoBuy;
      config.mint = autoBuyConfig.mint;
    } else if (kind === "bundle_buy") {
      const bundleBuyConfig = normalized as NormalizedTradingBotBundleBuy;
      config.bundleItems = bundleBuyConfig.items;
    } else {
      const autoSellConfig = normalized as NormalizedTradingBotAutoSell;
      config.mint = autoSellConfig.mint;
      config.sellBps = autoSellConfig.sellBps;
      if (autoSellConfig.triggerPrice) {
        config.triggerPrice = autoSellConfig.triggerPrice;
      }
      if (autoSellConfig.triggerDirection) {
        config.triggerDirection = autoSellConfig.triggerDirection;
      }
    }

    this.state.storage.sql.exec(
      `INSERT INTO automation_configs (
        telegram_user_id, config_id, kind, status, wallet_address,
        mint, target_wallet, source, max_buy_amount_in, amount_label, slippage_bps,
        priority_fee, copy_sells, min_liquidity_usd, max_market_cap_usd,
        max_snipes, bundle_items_json, sell_bps, trigger_price, trigger_direction,
        strategy_json, validation_json, monitor_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      config.telegramUserId,
      config.configId,
      config.kind,
      config.status,
      config.walletAddress,
      config.mint ?? null,
      config.targetWallet ?? null,
      config.source ?? null,
      config.maxBuyAmountIn,
      config.amountLabel ?? null,
      config.slippageBps,
      config.priorityFee,
      config.copySells === undefined ? null : config.copySells ? 1 : 0,
      config.minLiquidityUsd,
      config.maxMarketCapUsd ?? null,
      config.maxSnipes ?? null,
      config.bundleItems ? JSON.stringify(config.bundleItems) : null,
      config.sellBps ?? null,
      config.triggerPrice ?? null,
      config.triggerDirection ?? null,
      JSON.stringify(advancedAutomationStrategyRecord(config)),
      JSON.stringify(config.validation),
      JSON.stringify(config.monitor),
      config.createdAt,
      config.updatedAt,
    );
    return { config };
  }

  private updateAdvancedAutomationConfig(body: {
    configId?: unknown;
    kind?: unknown;
    config?: TradingBotCopyTradeValidationBody;
    validation?: { validatedAt?: unknown; warnings?: unknown };
  }):
    | {
        config: TradingBotStoredAdvancedAutomationConfigSnapshot;
        targetChanged: boolean;
      }
    | {
        error: string;
        status?: number;
        config?: TradingBotStoredAdvancedAutomationConfigSnapshot;
      } {
    const configId = stringValue(body.configId);
    const kind = advancedAutomationKindValue(body.kind);
    if (!configId || !TRADING_BOT_ADVANCED_CONFIG_ID_PATTERN.test(configId)) {
      return { error: "configId is required" };
    }
    if (kind !== "copytrade") {
      return { error: "Only copytrade configs can be updated" };
    }
    if (!body.config || typeof body.config !== "object") {
      return { error: "config is required" };
    }
    const normalizedResult = normalizeTradingBotCopyTrade(body.config);
    if ("error" in normalizedResult) return { error: normalizedResult.error };
    const normalized = normalizedResult.normalized;
    const existing = this.getAdvancedAutomationConfig(
      normalized.telegramUserId,
      configId,
    );
    if (!existing || existing.kind !== kind) {
      return { error: "Config not found", status: 404 };
    }
    if (existing.status !== "staged" && existing.status !== "paused") {
      return {
        error: `Config cannot be updated from ${existing.status} status`,
        status: 409,
        config: existing,
      };
    }
    if (normalized.userPublicKey !== existing.walletAddress) {
      return {
        error: "Copytrade wallet cannot be changed",
        status: 409,
        config: existing,
      };
    }

    const now = new Date().toISOString();
    const targetChanged = normalized.targetWallet !== existing.targetWallet;
    const validation = advancedAutomationConfigValidationValue(
      body.validation,
      copyTradeValidationWarnings(normalized, true),
      now,
    );
    const config: TradingBotStoredAdvancedAutomationConfigSnapshot = {
      ...existing,
      tag: normalized.tag,
      targetWallet: normalized.targetWallet,
      buyMode: normalized.buyMode,
      buyPercentageBps: normalized.buyPercentageBps,
      maxBuyAmountIn: normalized.maxBuyAmountIn,
      amountLabel: normalized.amountLabel,
      slippageBps: normalized.slippageBps,
      priorityFee: normalized.priorityFee,
      sellPriorityFee: normalized.sellPriorityFee,
      copySells: normalized.copySells,
      duplicateBuys: normalized.duplicateBuys,
      onlyRenounced: normalized.onlyRenounced,
      excludePumpFunTokens: normalized.excludePumpFunTokens,
      minTargetBuyAmountIn: normalized.minTargetBuyAmountIn,
      minLiquidityUsd: normalized.minLiquidityUsd,
      minMarketCapUsd: normalized.minMarketCapUsd,
      maxMarketCapUsd: normalized.maxMarketCapUsd,
      blacklistMints: [...normalized.blacklistMints],
      validation,
      monitor: targetChanged ? {} : existing.monitor,
      updatedAt: now,
    };

    this.state.storage.sql.exec(
      `UPDATE automation_configs
      SET target_wallet = ?, max_buy_amount_in = ?, amount_label = ?,
          slippage_bps = ?, priority_fee = ?, copy_sells = ?,
          min_liquidity_usd = ?, max_market_cap_usd = ?, strategy_json = ?,
          validation_json = ?, monitor_json = ?, updated_at = ?
      WHERE telegram_user_id = ? AND config_id = ? AND kind = ?`,
      config.targetWallet ?? null,
      config.maxBuyAmountIn,
      config.amountLabel ?? null,
      config.slippageBps,
      config.priorityFee,
      config.copySells ? 1 : 0,
      config.minLiquidityUsd,
      config.maxMarketCapUsd ?? null,
      JSON.stringify(advancedAutomationStrategyRecord(config)),
      JSON.stringify(config.validation),
      JSON.stringify(config.monitor),
      config.updatedAt,
      config.telegramUserId,
      config.configId,
      config.kind,
    );
    return { config, targetChanged };
  }

  private duplicateAdvancedAutomationConfig(body: {
    telegramUserId?: unknown;
    configId?: unknown;
    kind?: unknown;
    tag?: unknown;
  }):
    | {
        sourceConfigId: string;
        config: TradingBotStoredAdvancedAutomationConfigSnapshot;
      }
    | {
        error: string;
        status?: number;
        config?: TradingBotStoredAdvancedAutomationConfigSnapshot;
      } {
    const telegramUserId = stringValue(body.telegramUserId);
    const configId = stringValue(body.configId);
    const kind = advancedAutomationKindValue(body.kind);
    const requestedTag = copyTradeTagValue(body.tag);
    if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
      return { error: "telegramUserId is required" };
    }
    if (!configId || !TRADING_BOT_ADVANCED_CONFIG_ID_PATTERN.test(configId)) {
      return { error: "configId is required" };
    }
    if (kind !== "copytrade") {
      return { error: "Only copytrade configs can be duplicated" };
    }
    if (body.tag !== undefined && !requestedTag) {
      return { error: "tag must be 1 to 32 safe characters" };
    }

    const existing = this.getAdvancedAutomationConfig(telegramUserId, configId);
    if (!existing || existing.kind !== kind) {
      return { error: "Config not found", status: 404 };
    }
    const duplicateTag =
      requestedTag ??
      (existing.tag
        ? `${existing.tag.slice(0, 27).trimEnd()} Copy`
        : undefined);
    const normalized = {
      ...storedAdvancedConfigToNormalizedCopyTrade(existing),
      tag: duplicateTag,
    };
    const validatedAt = new Date().toISOString();
    const result = this.storeAdvancedAutomationConfig({
      kind,
      config: normalized,
      validation: {
        validatedAt,
        warnings: copyTradeValidationWarnings(normalized, true),
      },
    });
    if ("error" in result) return result;
    return { sourceConfigId: existing.configId, config: result.config };
  }

  private listAdvancedAutomationConfigs(
    telegramUserId: string,
    kind?: TradingBotAdvancedAutomationKind,
  ): TradingBotStoredAdvancedAutomationConfigSnapshot[] {
    const rows = kind
      ? this.state.storage.sql
          .exec<TradingBotAdvancedAutomationConfigRow>(
            `SELECT * FROM automation_configs
            WHERE telegram_user_id = ? AND kind = ?
            ORDER BY created_at DESC`,
            telegramUserId,
            kind,
          )
          .toArray()
      : this.state.storage.sql
          .exec<TradingBotAdvancedAutomationConfigRow>(
            `SELECT * FROM automation_configs
            WHERE telegram_user_id = ?
            ORDER BY created_at DESC`,
            telegramUserId,
          )
          .toArray();
    return rows.map(rowToTradingBotAdvancedAutomationConfig);
  }

  private listActiveAdvancedAutomationConfigs(
    kind: TradingBotAdvancedAutomationKind | undefined,
    limit: number,
  ): TradingBotStoredAdvancedAutomationConfigSnapshot[] {
    return this.listAdvancedAutomationConfigsByStatus("staged", kind, limit);
  }

  private listAdvancedAutomationConfigsByStatus(
    status: TradingBotStoredAdvancedAutomationConfigStatus,
    kind: TradingBotAdvancedAutomationKind | undefined,
    limit: number,
  ): TradingBotStoredAdvancedAutomationConfigSnapshot[] {
    const rows = kind
      ? this.state.storage.sql
          .exec<TradingBotAdvancedAutomationConfigRow>(
            `SELECT * FROM automation_configs
            WHERE kind = ? AND status = ?
            ORDER BY updated_at ASC, created_at ASC
            LIMIT ?`,
            kind,
            status,
            limit,
          )
          .toArray()
      : this.state.storage.sql
          .exec<TradingBotAdvancedAutomationConfigRow>(
            `SELECT * FROM automation_configs
            WHERE status = ?
            ORDER BY updated_at ASC, created_at ASC
            LIMIT ?`,
            status,
            limit,
          )
          .toArray();
    return rows.map(rowToTradingBotAdvancedAutomationConfig);
  }

  private claimAdvancedAutomationConfig(body: {
    telegramUserId?: unknown;
    configId?: unknown;
    kind?: unknown;
    monitor?: unknown;
  }):
    | { config: TradingBotStoredAdvancedAutomationConfigSnapshot }
    | {
        error: string;
        status?: number;
        config?: TradingBotStoredAdvancedAutomationConfigSnapshot;
      } {
    const telegramUserId = stringValue(body.telegramUserId);
    const configId = stringValue(body.configId);
    const kind = advancedAutomationKindValue(body.kind);
    if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
      return { error: "telegramUserId is required" };
    }
    if (!configId || !TRADING_BOT_ADVANCED_CONFIG_ID_PATTERN.test(configId)) {
      return { error: "configId is required" };
    }
    if (!kind) return { error: "kind is required" };

    const existing = this.getAdvancedAutomationConfig(telegramUserId, configId);
    if (!existing || existing.kind !== kind) {
      return { error: "Config not found", status: 404 };
    }
    if (existing.status !== "staged") {
      return {
        error: `Config cannot be claimed from ${existing.status} status`,
        status: 409,
        config: existing,
      };
    }

    const monitor = { ...existing.monitor };
    delete monitor.executionId;
    delete monitor.executionReferenceId;
    delete monitor.executionSignature;
    delete monitor.executionTransactionId;
    delete monitor.executionSolscanUrl;
    delete monitor.executionAmountIn;
    delete monitor.executionMint;
    delete monitor.executionSide;
    Object.assign(monitor, advancedAutomationMonitorStateValue(body.monitor));
    delete monitor.lastError;
    delete monitor.executionCompletedAt;
    delete monitor.reconciliationCheckedAt;
    delete monitor.reconciliationStatus;
    delete monitor.manualReviewAfter;
    delete monitor.manualReviewRequiredAt;
    delete monitor.manualReviewReason;
    const now = new Date().toISOString();
    this.state.storage.sql.exec(
      `UPDATE automation_configs
      SET status = ?, monitor_json = ?, updated_at = ?
      WHERE telegram_user_id = ? AND config_id = ? AND status = ?`,
      "executing",
      JSON.stringify(monitor),
      now,
      telegramUserId,
      configId,
      "staged",
    );

    return {
      config: {
        ...existing,
        status: "executing",
        monitor,
        updatedAt: now,
      },
    };
  }

  private updateAdvancedAutomationConfigMonitor(body: {
    telegramUserId?: unknown;
    configId?: unknown;
    kind?: unknown;
    monitor?: unknown;
    status?: unknown;
    clearLastError?: unknown;
    expectedStatus?: unknown;
    expectedExecutionId?: unknown;
  }):
    | { config: TradingBotStoredAdvancedAutomationConfigSnapshot }
    | { error: string; status?: number } {
    const telegramUserId = stringValue(body.telegramUserId);
    const configId = stringValue(body.configId);
    const kind = advancedAutomationKindValue(body.kind);
    if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
      return { error: "telegramUserId is required" };
    }
    if (!configId || !TRADING_BOT_ADVANCED_CONFIG_ID_PATTERN.test(configId)) {
      return { error: "configId is required" };
    }

    const existing = this.getAdvancedAutomationConfig(telegramUserId, configId);
    if (!existing || (kind && existing.kind !== kind)) {
      return { error: "Config not found", status: 404 };
    }

    const status =
      body.status === undefined
        ? existing.status
        : optionalAdvancedAutomationStatusValue(body.status);
    if (!status) return { error: "status is invalid" };

    const expectedStatus =
      body.expectedStatus === undefined
        ? undefined
        : optionalAdvancedAutomationStatusValue(body.expectedStatus);
    if (body.expectedStatus !== undefined && !expectedStatus) {
      return { error: "expectedStatus is invalid" };
    }
    const expectedExecutionId = stringValue(body.expectedExecutionId);
    if (
      body.expectedExecutionId !== undefined &&
      (!expectedExecutionId ||
        !TRADING_BOT_EXECUTION_REFERENCE_PATTERN.test(expectedExecutionId))
    ) {
      return { error: "expectedExecutionId is invalid" };
    }
    if (expectedStatus && existing.status !== expectedStatus) {
      return {
        error: `Config state changed from expected ${expectedStatus} status`,
        status: 409,
      };
    }
    if (
      expectedExecutionId &&
      existing.monitor.executionId !== expectedExecutionId
    ) {
      return { error: "Config execution attempt has changed", status: 409 };
    }
    const monitor = {
      ...existing.monitor,
      ...advancedAutomationMonitorStateValue(body.monitor),
    };
    if (body.clearLastError === true) delete monitor.lastError;
    const now = new Date().toISOString();
    this.state.storage.sql.exec(
      `UPDATE automation_configs
      SET status = ?, monitor_json = ?, updated_at = ?
      WHERE telegram_user_id = ? AND config_id = ?`,
      status,
      JSON.stringify(monitor),
      now,
      telegramUserId,
      configId,
    );

    return {
      config: {
        ...existing,
        status,
        monitor,
        updatedAt: now,
      },
    };
  }

  private cancelAdvancedAutomationConfig(body: {
    telegramUserId?: unknown;
    configId?: unknown;
    kind?: unknown;
  }):
    | { config: TradingBotStoredAdvancedAutomationConfigSnapshot }
    | {
        error: string;
        status?: number;
        config?: TradingBotStoredAdvancedAutomationConfigSnapshot;
      } {
    const telegramUserId = stringValue(body.telegramUserId);
    const configId = stringValue(body.configId);
    const kind = advancedAutomationKindValue(body.kind);
    if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
      return { error: "telegramUserId is required" };
    }
    if (!configId || !TRADING_BOT_ADVANCED_CONFIG_ID_PATTERN.test(configId)) {
      return { error: "configId is required" };
    }

    const existing = this.getAdvancedAutomationConfig(telegramUserId, configId);
    if (!existing || (kind && existing.kind !== kind)) {
      return { error: "Config not found", status: 404 };
    }
    if (existing.status === "cancelled") return { config: existing };
    if (existing.status === "executing") {
      return {
        error: "Config execution is already in progress",
        status: 409,
        config: existing,
      };
    }
    if (existing.status === "executed") {
      return {
        error: "Executed configs cannot be cancelled",
        status: 409,
        config: existing,
      };
    }

    const now = new Date().toISOString();
    this.state.storage.sql.exec(
      `UPDATE automation_configs
      SET status = ?, updated_at = ?
      WHERE telegram_user_id = ? AND config_id = ?`,
      "cancelled",
      now,
      telegramUserId,
      configId,
    );
    return {
      config: {
        ...existing,
        status: "cancelled",
        updatedAt: now,
      },
    };
  }

  private controlAdvancedAutomationConfig(body: {
    telegramUserId?: unknown;
    configId?: unknown;
    kind?: unknown;
    action?: unknown;
  }):
    | {
        action: "paused" | "resumed";
        config: TradingBotStoredAdvancedAutomationConfigSnapshot;
      }
    | {
        error: string;
        status?: number;
        config?: TradingBotStoredAdvancedAutomationConfigSnapshot;
      } {
    const telegramUserId = stringValue(body.telegramUserId);
    const configId = stringValue(body.configId);
    const kind = advancedAutomationKindValue(body.kind);
    const action = stringValue(body.action)?.toLowerCase();
    if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
      return { error: "telegramUserId is required" };
    }
    if (!configId || !TRADING_BOT_ADVANCED_CONFIG_ID_PATTERN.test(configId)) {
      return { error: "configId is required" };
    }
    if (!kind) return { error: "kind is required" };
    if (action !== "pause" && action !== "resume") {
      return { error: "action must be pause or resume" };
    }

    const existing = this.getAdvancedAutomationConfig(telegramUserId, configId);
    if (!existing || existing.kind !== kind) {
      return { error: "Config not found", status: 404 };
    }
    const expectedStatus = action === "pause" ? "staged" : "paused";
    const nextStatus = action === "pause" ? "paused" : "staged";
    if (existing.status !== expectedStatus) {
      return {
        error: `Config cannot ${action} from ${existing.status} status`,
        status: 409,
        config: existing,
      };
    }

    const now = new Date().toISOString();
    this.state.storage.sql.exec(
      `UPDATE automation_configs
      SET status = ?, updated_at = ?
      WHERE telegram_user_id = ? AND config_id = ? AND status = ?`,
      nextStatus,
      now,
      telegramUserId,
      configId,
      expectedStatus,
    );
    return {
      action: action === "pause" ? "paused" : "resumed",
      config: { ...existing, status: nextStatus, updatedAt: now },
    };
  }

  private getAdvancedAutomationConfig(
    telegramUserId: string,
    configId: string,
  ): TradingBotStoredAdvancedAutomationConfigSnapshot | null {
    const row =
      this.state.storage.sql
        .exec<TradingBotAdvancedAutomationConfigRow>(
          `SELECT * FROM automation_configs
          WHERE telegram_user_id = ? AND config_id = ?
          LIMIT 1`,
          telegramUserId,
          configId,
        )
        .toArray()[0] ?? null;
    return row ? rowToTradingBotAdvancedAutomationConfig(row) : null;
  }

  private async createControlCode(
    body: TradingBotControlCodeBody,
  ): Promise<
    | { code: string; expiresAt: string; telegramUserId: string }
    | { error: string; status?: number }
  > {
    const telegramUserId = stringValue(body.telegramUserId);
    const username = stringValue(body.username);
    if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
      return { error: "telegramUserId is required" };
    }

    const account = this.getOrCreateAccount(telegramUserId, { username });
    const nowDate = new Date();
    const now = nowDate.toISOString();
    if (username) {
      account.username = username;
      account.updatedAt = now;
    }
    this.saveAccount(account);

    this.state.storage.sql.exec(
      "DELETE FROM control_codes WHERE telegram_user_id = ? AND expires_at <= ?",
      telegramUserId,
      now,
    );

    const code = generateControlCode();
    const codeHash = await hashControlCode(telegramUserId, code);
    const expiresAt = new Date(
      nowDate.getTime() + CONTROL_CODE_TTL_MS,
    ).toISOString();

    this.state.storage.sql.exec(
      `INSERT INTO control_codes (
        telegram_user_id, code_hash, expires_at, consumed_at, created_at
      ) VALUES (?, ?, ?, NULL, ?)`,
      telegramUserId,
      codeHash,
      expiresAt,
      now,
    );
    this.recordAccountEvent(telegramUserId, "control_code_created", {
      expiresAt,
    });

    return { code, expiresAt, telegramUserId };
  }

  private async consumeControlCode(body: TradingBotControlSessionBody): Promise<
    | {
        account: TradingBotAccountSnapshot;
        sessionToken: string;
        sessionExpiresAt: string;
        imperialConnection: TradingBotImperialConnection | null;
      }
    | { error: string; status?: number }
  > {
    const telegramUserId = stringValue(body.telegramUserId);
    if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
      return { error: "telegramUserId is required" };
    }

    const code = normalizeControlCode(body.code);
    if (!code) {
      return { error: "Control code is invalid or expired", status: 401 };
    }

    const now = new Date().toISOString();
    const codeHash = await hashControlCode(telegramUserId, code);
    const row =
      this.state.storage.sql
        .exec<TradingBotControlCodeRow>(
          `SELECT * FROM control_codes
          WHERE telegram_user_id = ?
            AND code_hash = ?
            AND consumed_at IS NULL
            AND expires_at > ?
          LIMIT 1`,
          telegramUserId,
          codeHash,
          now,
        )
        .toArray()[0] ?? null;

    if (!row) {
      return { error: "Control code is invalid or expired", status: 401 };
    }

    this.state.storage.sql.exec(
      `UPDATE control_codes
      SET consumed_at = ?
      WHERE telegram_user_id = ? AND code_hash = ?`,
      now,
      telegramUserId,
      codeHash,
    );

    const account = this.getAccount(telegramUserId);
    if (!account) {
      return { error: "Account not found", status: 404 };
    }

    const sessionToken = generateControlSessionToken();
    const sessionHash = await hashControlSessionToken(
      telegramUserId,
      sessionToken,
    );
    const sessionExpiresAt = new Date(
      new Date(now).getTime() + CONTROL_SESSION_TTL_MS,
    ).toISOString();

    this.state.storage.sql.exec(
      "DELETE FROM control_sessions WHERE telegram_user_id = ? AND expires_at <= ?",
      telegramUserId,
      now,
    );
    this.state.storage.sql.exec(
      `INSERT INTO control_sessions (
        telegram_user_id, session_hash, expires_at, revoked_at, created_at, last_used_at
      ) VALUES (?, ?, ?, NULL, ?, ?)`,
      telegramUserId,
      sessionHash,
      sessionExpiresAt,
      now,
      now,
    );

    this.recordAccountEvent(telegramUserId, "control_session_started", {
      codeCreatedAt: row.created_at,
      codeExpiresAt: row.expires_at,
      sessionExpiresAt,
    });

    return {
      account,
      sessionToken,
      sessionExpiresAt,
      imperialConnection: await this.getImperialConnection(
        telegramUserId,
        tradingBotAccountWalletByRole(account, "spot_nft")
          ?.solanaWalletAddress,
      ),
    };
  }

  private async connectImperial(
    body: TradingBotControlImperialBody,
  ): Promise<
    | { connection: TradingBotImperialConnection }
    | { error: string; status?: number }
  > {
    const session = await this.verifyControlSession(body);
    if ("error" in session) return session;

    const account = this.getAccount(session.telegramUserId);
    if (!account) return { error: "Account not found", status: 404 };

    const wallet = stringValue(body.wallet);
    if (!wallet || !SOLANA_ADDRESS_PATTERN.test(wallet)) {
      return { error: "wallet must be a Solana address" };
    }
    const authorityWallet = tradingBotAccountWalletByRole(account, "spot_nft");
    if (!authorityWallet) {
      return { error: "Spot & NFT wallet is not configured", status: 409 };
    }
    if (authorityWallet.solanaWalletAddress !== wallet) {
      return { error: "Spot & NFT wallet mismatch", status: 409 };
    }

    const message = stringValue(body.message);
    const expectedPrefix = `imperial:mobile-connect:${wallet}:`;
    const nonce = message?.startsWith(expectedPrefix)
      ? message.slice(expectedPrefix.length)
      : "";
    if (
      !message ||
      message.length > 160 ||
      !nonce ||
      !/^\d{10,13}$/.test(nonce)
    ) {
      return { error: "Imperial authorization message is invalid" };
    }

    const signature = stringValue(body.signature);
    if (
      !signature ||
      !/^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(signature)
    ) {
      return { error: "Imperial authorization signature is invalid" };
    }

    const connectResult = await this.postImperialJson(
      "/api/v1/mobile/connect",
      { wallet, message, signature },
    );
    if ("error" in connectResult) return connectResult;

    const code = stringValue(connectResult.data.code);
    if (!code) {
      return {
        error: "Imperial returned an invalid connection code",
        status: 502,
      };
    }

    const exchangeResult = await this.postImperialJson(
      "/api/v1/mobile/exchange",
      { code },
    );
    if ("error" in exchangeResult) return exchangeResult;

    const jwt = stringValue(exchangeResult.data.jwt);
    const expiresAt = Number(exchangeResult.data.expiresAt);
    const nowUnix = Math.floor(Date.now() / 1000);
    if (
      !jwt ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= nowUnix
    ) {
      return {
        error: "Imperial returned an invalid authorization session",
        status: 502,
      };
    }

    const referralResult = await ensureImperialSbfReferral(wallet);
    if ("error" in referralResult) return referralResult;

    const connectedAt = new Date().toISOString();
    this.state.storage.sql.exec(
      `INSERT INTO imperial_sessions (
        telegram_user_id, wallet_address, jwt, expires_at, connected_at, updated_at,
        referrer_username, profile_address, profile_usdc_native, profile_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
      ON CONFLICT(telegram_user_id) DO UPDATE SET
        wallet_address = excluded.wallet_address,
        jwt = excluded.jwt,
        expires_at = excluded.expires_at,
        connected_at = excluded.connected_at,
        updated_at = excluded.updated_at,
        referrer_username = excluded.referrer_username,
        profile_address = NULL,
        profile_usdc_native = NULL,
        profile_synced_at = NULL`,
      session.telegramUserId,
      wallet,
      jwt,
      expiresAt,
      connectedAt,
      connectedAt,
      referralResult.referrerUsername,
    );

    const connection =
      (await this.getImperialConnection(session.telegramUserId, wallet)) ?? {
        status: "connected" as const,
        authorityWalletAddress: wallet,
        profileAddress: null,
        profileIndex: DELTA_NEUTRAL_PROFILE_INDEX,
        expiresAt,
        connectedAt,
        referrerUsername: referralResult.referrerUsername,
      };
    this.recordAccountEvent(session.telegramUserId, "imperial_connected", {
      authorityWalletAddress: wallet,
      profileAddress: connection.profileAddress,
      profileIndex: connection.profileIndex,
      expiresAt,
      connectedAt,
      referrerUsername: referralResult.referrerUsername,
    });

    return { connection };
  }

  private async previewDeltaNeutral(
    telegramUserId: string,
  ): Promise<Response> {
    const missing = deltaNeutralServiceMissingRequirements(this.env, false);
    if (missing.length > 0) {
      return json(
        { status: "not_configured", required: missing },
        { status: 503 },
      );
    }
    const context = this.getDeltaNeutralContext(telegramUserId);
    if ("error" in context) {
      return json({ error: context.error }, { status: context.status });
    }

    const result = await this.callDeltaNeutralService("preview", {
      accountId: telegramUserId,
      wallet: context.walletAddress,
      imperialJwt: context.imperialSession.jwt,
      imperialJwtExpiresAtUnix: context.imperialSession.expires_at,
      profileIndex: DELTA_NEUTRAL_PROFILE_INDEX,
    });
    if ("error" in result) {
      return json(
        { error: result.error, retryable: result.retryable },
        { status: result.status },
      );
    }
    const preview = deltaNeutralPreviewValue(
      result.data,
      context.walletAddress,
    );
    if (!preview) {
      return json(
        { error: "Delta Neutral returned an invalid preview" },
        { status: 502 },
      );
    }

    return json(
      {
        status: "ready",
        defaultStrategy: DELTA_NEUTRAL_STRATEGY,
        defaultPreset: DELTA_NEUTRAL_PRESET,
        preview,
        liveExecutionEnabled: isDeltaNeutralLiveExecutionEnabled(this.env),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  private async startDeltaNeutral(body: {
    telegramUserId: string;
    idempotencyKey: string;
    confirmLive: true;
  }): Promise<Response> {
    const missing = deltaNeutralServiceMissingRequirements(this.env, true);
    if (missing.length > 0) {
      return json(
        { status: "not_configured", required: missing },
        { status: 503 },
      );
    }
    const context = this.getDeltaNeutralContext(body.telegramUserId);
    if ("error" in context) {
      return json({ error: context.error }, { status: context.status });
    }

    const existing = this.getDeltaNeutralRunByIdempotencyKey(
      body.telegramUserId,
      body.idempotencyKey,
    );
    if (existing) {
      return json(
        {
          status: existing.status,
          idempotent: true,
          run: deltaNeutralStoredRunValue(existing),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const active = this.getActiveDeltaNeutralRun(body.telegramUserId);
    if (active) {
      return json(
        {
          error: "Delta Neutral already has an active run",
          run: deltaNeutralStoredRunValue(active),
        },
        { status: 409 },
      );
    }

    const previewResult = await this.callDeltaNeutralService("preview", {
      accountId: body.telegramUserId,
      wallet: context.walletAddress,
      imperialJwt: context.imperialSession.jwt,
      imperialJwtExpiresAtUnix: context.imperialSession.expires_at,
      profileIndex: DELTA_NEUTRAL_PROFILE_INDEX,
    });
    if ("error" in previewResult) {
      return json(
        { error: previewResult.error, retryable: previewResult.retryable },
        { status: previewResult.status },
      );
    }
    const preview = deltaNeutralPreviewValue(
      previewResult.data,
      context.walletAddress,
    );
    if (!preview) {
      return json(
        { error: "Delta Neutral returned an invalid preview" },
        { status: 502 },
      );
    }
    if (!preview.entryCapCompatible) {
      return json(
        {
          status: "blocked",
          error: deltaNeutralEntryCapBlocker(
            preview.serviceLiveEntryCapUsd,
          ),
          blockers: preview.blockers,
        },
        { status: 409 },
      );
    }

    const runId = `ribbot-${body.idempotencyKey}`;
    const now = new Date().toISOString();
    this.state.storage.sql.exec(
      `INSERT INTO delta_neutral_runs (
        telegram_user_id, run_id, idempotency_key, wallet_address, status,
        service_status_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'launching', '{}', ?, ?)`,
      body.telegramUserId,
      runId,
      body.idempotencyKey,
      context.walletAddress,
      now,
      now,
    );

    const result = await this.callDeltaNeutralService("start", {
      accountId: body.telegramUserId,
      wallet: context.walletAddress,
      imperialJwt: context.imperialSession.jwt,
      imperialJwtExpiresAtUnix: context.imperialSession.expires_at,
      idempotencyKey: body.idempotencyKey,
      confirmLive: body.confirmLive,
      strategy: DELTA_NEUTRAL_STRATEGY,
      preset: DELTA_NEUTRAL_PRESET,
      profileIndex: DELTA_NEUTRAL_PROFILE_INDEX,
      dailyBudgetUsd: DELTA_NEUTRAL_DAILY_BUDGET_USD,
      waitSecs: DELTA_NEUTRAL_WAIT_SECONDS,
      retryUntilCleanSecs: DELTA_NEUTRAL_RETRY_UNTIL_CLEAN_SECONDS,
      maxCycles: DELTA_NEUTRAL_MAX_CYCLES,
    });
    if ("error" in result) {
      const status = result.retryable ? "pending_reconciliation" : "blocked";
      this.updateDeltaNeutralRun(runId, status, {});
      return json(
        {
          status,
          error: result.error,
          retryable: result.retryable,
          runId,
        },
        { status: result.status },
      );
    }

    const serviceRun = deltaNeutralRunStatusValue(
      result.data,
      context.walletAddress,
    );
    if (!serviceRun) {
      this.updateDeltaNeutralRun(runId, "pending_reconciliation", {});
      return json(
        {
          status: "pending_reconciliation",
          error: "Delta Neutral returned an invalid start response",
          retryable: true,
          runId,
        },
        { status: 502 },
      );
    }

    const status = deltaNeutralRunState(serviceRun);
    this.updateDeltaNeutralRun(runId, status, serviceRun);
    this.recordAccountEvent(body.telegramUserId, "delta_neutral_started", {
      runId,
      walletAddress: context.walletAddress,
      strategy: DELTA_NEUTRAL_STRATEGY,
      preset: DELTA_NEUTRAL_PRESET,
      maxCycles: DELTA_NEUTRAL_MAX_CYCLES,
      liveEntryCapUsd: DELTA_NEUTRAL_LIVE_ENTRY_CAP_USD,
      dailyBudgetUsd: DELTA_NEUTRAL_DAILY_BUDGET_USD,
    });
    return json(
      { status, idempotent: false, run: serviceRun },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  private async getDeltaNeutralStatus(
    telegramUserId: string,
  ): Promise<Response> {
    const missing = deltaNeutralServiceMissingRequirements(this.env, false);
    if (missing.length > 0) {
      return json(
        { status: "not_configured", required: missing },
        { status: 503 },
      );
    }
    const context = this.getDeltaNeutralContext(telegramUserId);
    if ("error" in context) {
      return json({ error: context.error }, { status: context.status });
    }

    const result = await this.callDeltaNeutralService("status", {
      accountId: telegramUserId,
      wallet: context.walletAddress,
    });
    if ("error" in result) {
      return json(
        { error: result.error, retryable: result.retryable },
        { status: result.status },
      );
    }
    const serviceStatus = deltaNeutralServiceStatusValue(
      result.data,
      context.walletAddress,
    );
    if (!serviceStatus) {
      return json(
        { error: "Delta Neutral returned an invalid status" },
        { status: 502 },
      );
    }

    const latest = this.getLatestDeltaNeutralRun(telegramUserId);
    if (latest && serviceStatus.run) {
      this.updateDeltaNeutralRun(
        latest.run_id,
        deltaNeutralRunState(serviceStatus.run),
        serviceStatus.run,
      );
    }
    return json(
      {
        status: "ready",
        defaultStrategy: DELTA_NEUTRAL_STRATEGY,
        defaultPreset: DELTA_NEUTRAL_PRESET,
        configured: serviceStatus.configured,
        enabled: serviceStatus.enabled,
        liveExecutionEnabled:
          isDeltaNeutralLiveExecutionEnabled(this.env) &&
          serviceStatus.liveEnabled,
        run:
          serviceStatus.run ??
          (latest ? deltaNeutralStoredRunValue(latest) : null),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  private async stopDeltaNeutral(telegramUserId: string): Promise<Response> {
    const missing = deltaNeutralServiceMissingRequirements(this.env, false);
    if (missing.length > 0) {
      return json(
        { status: "not_configured", required: missing },
        { status: 503 },
      );
    }
    const context = this.getDeltaNeutralContext(telegramUserId);
    if ("error" in context) {
      return json({ error: context.error }, { status: context.status });
    }

    const result = await this.callDeltaNeutralService("stop", {
      accountId: telegramUserId,
      wallet: context.walletAddress,
    });
    if ("error" in result) {
      return json(
        { error: result.error, retryable: result.retryable },
        { status: result.status },
      );
    }
    const serviceRun = deltaNeutralRunStatusValue(
      result.data,
      context.walletAddress,
    );
    if (!serviceRun) {
      return json(
        { error: "Delta Neutral returned an invalid stop response" },
        { status: 502 },
      );
    }

    const latest = this.getLatestDeltaNeutralRun(telegramUserId);
    if (latest) {
      this.updateDeltaNeutralRun(
        latest.run_id,
        deltaNeutralRunState(serviceRun),
        serviceRun,
      );
    }
    this.recordAccountEvent(telegramUserId, "delta_neutral_stop_requested", {
      runId: latest?.run_id ?? serviceRun.runId,
      walletAddress: context.walletAddress,
    });
    return json(
      { status: deltaNeutralRunState(serviceRun), run: serviceRun },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  private getDeltaNeutralContext(
    telegramUserId: string,
  ):
    | {
        walletAddress: string;
        imperialSession: TradingBotImperialSessionRow;
      }
    | { error: string; status: number } {
    const account = this.getAccount(telegramUserId);
    if (!account) return { error: "Account not found", status: 404 };
    if (account.botAccessRevokedAt) {
      return { error: "Ribbot access is disabled", status: 403 };
    }
    const wallet = tradingBotAccountWalletByRole(account, "spot_nft");
    if (!wallet) {
      return { error: "Spot & NFT wallet is not configured", status: 409 };
    }
    const imperialSession = this.getImperialSession(
      telegramUserId,
      wallet.solanaWalletAddress,
    );
    if (!imperialSession) {
      return { error: "Reconnect Imperial and try again", status: 409 };
    }
    return {
      walletAddress: wallet.solanaWalletAddress,
      imperialSession,
    };
  }

  private getImperialSession(
    telegramUserId: string,
    activeWalletAddress: string,
  ): TradingBotImperialSessionRow | null {
    const row =
      this.state.storage.sql
        .exec<TradingBotImperialSessionRow>(
          "SELECT * FROM imperial_sessions WHERE telegram_user_id = ?",
          telegramUserId,
        )
        .toArray()[0] ?? null;
    if (!row) return null;
    if (row.expires_at <= Math.floor(Date.now() / 1000) + 60) {
      if (row.expires_at <= Math.floor(Date.now() / 1000)) {
        this.state.storage.sql.exec(
          "DELETE FROM imperial_sessions WHERE telegram_user_id = ?",
          telegramUserId,
        );
      }
      return null;
    }
    if (row.wallet_address !== activeWalletAddress) return null;
    if (
      row.referrer_username?.toLowerCase() !== IMPERIAL_REFERRER_USERNAME
    ) {
      return null;
    }
    return row;
  }

  private imperialProfileSnapshot(
    row: TradingBotImperialSessionRow,
    balanceStatus: "live" | "cached",
  ): TradingBotProfilePerpsWalletSnapshot | null {
    if (
      !row.profile_address ||
      !SOLANA_ADDRESS_PATTERN.test(row.profile_address) ||
      !Number.isSafeInteger(row.profile_usdc_native) ||
      Number(row.profile_usdc_native) < 0 ||
      !row.profile_synced_at ||
      !Number.isFinite(Date.parse(row.profile_synced_at))
    ) {
      return null;
    }

    const profileUsdc = Number(row.profile_usdc_native) / 1_000_000;
    return {
      telegramUserId: row.telegram_user_id,
      authorityWalletAddress: row.wallet_address,
      profileAddress: row.profile_address,
      profileIndex: DELTA_NEUTRAL_PROFILE_INDEX,
      profileUsdc,
      minimumProfileUsdc: DELTA_NEUTRAL_MINIMUM_PROFILE_USDC,
      funded: profileUsdc >= DELTA_NEUTRAL_MINIMUM_PROFILE_USDC,
      fundingLocation: "imperial_profile",
      imperialProfileVerified: true,
      balanceStatus,
      balanceUpdatedAt: row.profile_synced_at,
    };
  }

  private async refreshImperialProfile(
    row: TradingBotImperialSessionRow,
  ): Promise<TradingBotProfilePerpsWalletResolution> {
    const cached = this.imperialProfileSnapshot(row, "cached");
    try {
      const response = await fetch(
        `${DEFAULT_IMPERIAL_API_BASE_URL}/api/v1/mobile/balances`,
        {
          headers: { Authorization: `Bearer ${row.jwt}` },
          signal: AbortSignal.timeout(IMPERIAL_PROFILE_REQUEST_TIMEOUT_MS),
        },
      );
      const data = (await response.json().catch(() => null)) as unknown;
      const record = recordValue(data);
      if (!response.ok) {
        if (cached) return { snapshot: cached };
        return {
          error:
            response.status === 401
              ? "Reconnect Imperial and try again"
              : "Imperial profile is temporarily unavailable",
          status: response.status === 401 ? 409 : 502,
        };
      }
      if (stringValue(record?.wallet) !== row.wallet_address) {
        return cached
          ? { snapshot: cached }
          : { error: "Imperial returned the wrong wallet", status: 502 };
      }

      const profiles = Array.isArray(record?.profiles)
        ? record.profiles.map(recordValue).filter(Boolean)
        : [];
      const profile = profiles.find(
        (candidate) =>
          numberValue(candidate?.profileIndex) === DELTA_NEUTRAL_PROFILE_INDEX,
      );
      const profileAddress = stringValue(profile?.profilePda);
      const profileUsdcNative = numberValue(profile?.usdc);
      if (
        !profileAddress ||
        !SOLANA_ADDRESS_PATTERN.test(profileAddress) ||
        typeof profileUsdcNative !== "number" ||
        !Number.isSafeInteger(profileUsdcNative) ||
        profileUsdcNative < 0
      ) {
        return cached
          ? { snapshot: cached }
          : { error: "Imperial returned an invalid profile", status: 502 };
      }

      const syncedAt = new Date().toISOString();
      this.state.storage.sql.exec(
        `UPDATE imperial_sessions
        SET profile_address = ?, profile_usdc_native = ?, profile_synced_at = ?,
          updated_at = ?
        WHERE telegram_user_id = ? AND wallet_address = ?`,
        profileAddress,
        profileUsdcNative,
        syncedAt,
        syncedAt,
        row.telegram_user_id,
        row.wallet_address,
      );
      const snapshot = this.imperialProfileSnapshot(
        {
          ...row,
          profile_address: profileAddress,
          profile_usdc_native: profileUsdcNative,
          profile_synced_at: syncedAt,
        },
        "live",
      );
      if (!snapshot) {
        return { error: "Imperial returned an invalid profile", status: 502 };
      }
      return { snapshot };
    } catch {
      return cached
        ? { snapshot: cached }
        : { error: "Imperial profile is temporarily unavailable", status: 502 };
    }
  }

  private async getAuthenticatedImperialProfile(
    body: Record<string, unknown>,
  ): Promise<TradingBotProfilePerpsWalletResolution> {
    const telegramUserId = stringValue(body.telegramUserId);
    const privyUserId = stringValue(body.privyUserId);
    const authorityWalletAddress = stringValue(body.authorityWalletAddress);
    if (
      !telegramUserId ||
      !TELEGRAM_USER_ID_PATTERN.test(telegramUserId) ||
      !privyUserId ||
      !authorityWalletAddress ||
      !SOLANA_ADDRESS_PATTERN.test(authorityWalletAddress)
    ) {
      return { error: "Account identity is invalid", status: 400 };
    }

    const account = this.getAccount(telegramUserId);
    const wallet = account
      ? tradingBotAccountWalletByRole(account, "spot_nft")
      : null;
    if (!account || !wallet) {
      return { error: "Account not found", status: 404 };
    }
    if (
      account.privyUserId !== privyUserId ||
      wallet.walletSource !== "privy" ||
      wallet.solanaWalletAddress !== authorityWalletAddress
    ) {
      return { error: "Account identity does not match", status: 403 };
    }

    const session = this.getImperialSession(
      telegramUserId,
      authorityWalletAddress,
    );
    if (!session) {
      return { error: "Imperial is not connected", status: 409 };
    }
    return this.refreshImperialProfile(session);
  }

  private async callDeltaNeutralService(
    action: "preview" | "start" | "status" | "stop",
    body: Record<string, unknown>,
  ): Promise<
    | { data: unknown }
    | { error: string; status: number; retryable: boolean }
  > {
    const service = resolveDeltaNeutralService(this.env);
    if (!service) {
      return {
        error: "Delta Neutral service is not configured",
        status: 503,
        retryable: false,
      };
    }
    try {
      const response = await fetch(
        `${service.url}/api/ribbot/delta-neutral/${action}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${service.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      const data = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        const record = recordValue(data);
        return {
          error:
            stringValue(record?.error) ??
            "Delta Neutral rejected the request",
          status: deltaNeutralProxyStatus(response.status),
          retryable: response.status >= 500,
        };
      }
      return { data };
    } catch {
      return {
        error: "Delta Neutral is temporarily unavailable",
        status: 502,
        retryable: true,
      };
    }
  }

  private getDeltaNeutralRunByIdempotencyKey(
    telegramUserId: string,
    idempotencyKey: string,
  ): TradingBotDeltaNeutralRunRow | null {
    return (
      this.state.storage.sql
        .exec<TradingBotDeltaNeutralRunRow>(
          `SELECT * FROM delta_neutral_runs
          WHERE telegram_user_id = ? AND idempotency_key = ?
          LIMIT 1`,
          telegramUserId,
          idempotencyKey,
        )
        .toArray()[0] ?? null
    );
  }

  private getActiveDeltaNeutralRun(
    telegramUserId: string,
  ): TradingBotDeltaNeutralRunRow | null {
    return (
      this.state.storage.sql
        .exec<TradingBotDeltaNeutralRunRow>(
          `SELECT * FROM delta_neutral_runs
          WHERE telegram_user_id = ?
            AND status IN ('launching', 'running', 'stopping', 'pending_reconciliation')
          ORDER BY updated_at DESC
          LIMIT 1`,
          telegramUserId,
        )
        .toArray()[0] ?? null
    );
  }

  private getLatestDeltaNeutralRun(
    telegramUserId: string,
  ): TradingBotDeltaNeutralRunRow | null {
    return (
      this.state.storage.sql
        .exec<TradingBotDeltaNeutralRunRow>(
          `SELECT * FROM delta_neutral_runs
          WHERE telegram_user_id = ?
          ORDER BY updated_at DESC
          LIMIT 1`,
          telegramUserId,
        )
        .toArray()[0] ?? null
    );
  }

  private updateDeltaNeutralRun(
    runId: string,
    status: string,
    serviceStatus: object,
  ): void {
    this.state.storage.sql.exec(
      `UPDATE delta_neutral_runs
      SET status = ?, service_status_json = ?, updated_at = ?
      WHERE run_id = ?`,
      status,
      JSON.stringify(serviceStatus),
      new Date().toISOString(),
      runId,
    );
  }

  private resetSetup(
    body: TradingBotSetupResetBody,
  ):
    | {
        telegramUserId: string;
        walletAddress: string | null;
        resetAt: string;
      }
    | { error: string; status?: number } {
    const telegramUserId = stringValue(body.telegramUserId);
    if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
      return { error: "telegramUserId is required" };
    }

    const account = this.getAccount(telegramUserId);
    if (!account) return { error: "Account not found", status: 404 };

    this.state.storage.sql.exec(
      "DELETE FROM imperial_sessions WHERE telegram_user_id = ?",
      telegramUserId,
    );
    this.state.storage.sql.exec(
      "DELETE FROM control_sessions WHERE telegram_user_id = ?",
      telegramUserId,
    );
    this.state.storage.sql.exec(
      "DELETE FROM control_codes WHERE telegram_user_id = ?",
      telegramUserId,
    );

    const resetAt = new Date().toISOString();
    account.botAccessRevokedAt = resetAt;
    account.updatedAt = resetAt;
    this.saveAccount(account);
    this.recordAccountEvent(telegramUserId, "setup_reset", {
      walletAddress: account.solanaWalletAddress,
      botAccessRevokedAt: resetAt,
      resetAt,
    });

    return {
      telegramUserId,
      walletAddress: account.solanaWalletAddress ?? null,
      resetAt,
    };
  }

  private async postImperialJson(
    path: string,
    body: Record<string, unknown>,
  ): Promise<
    | { data: Record<string, unknown> }
    | { error: string; status?: number }
  > {
    try {
      const response = await fetch(`${DEFAULT_IMPERIAL_API_BASE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as unknown;
      const record =
        data && typeof data === "object" && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : null;

      if (!response.ok) {
        const detail =
          stringValue(record?.error) ?? stringValue(record?.message);
        return {
          error: detail
            ? `Imperial rejected the connection: ${detail.slice(0, 200)}`
            : "Imperial rejected the connection",
          status:
            response.status === 400 || response.status === 401 ? 400 : 502,
        };
      }
      if (!record) {
        return { error: "Imperial returned an invalid response", status: 502 };
      }
      return { data: record };
    } catch {
      return {
        error: "Imperial is temporarily unavailable",
        status: 502,
      };
    }
  }

  private async getImperialConnection(
    telegramUserId: string,
    activeWalletAddress?: string,
  ): Promise<TradingBotImperialConnection | null> {
    const row =
      this.state.storage.sql
        .exec<TradingBotImperialSessionRow>(
          "SELECT * FROM imperial_sessions WHERE telegram_user_id = ?",
          telegramUserId,
        )
        .toArray()[0] ?? null;
    if (!row) return null;

    if (row.expires_at <= Math.floor(Date.now() / 1000)) {
      this.state.storage.sql.exec(
        "DELETE FROM imperial_sessions WHERE telegram_user_id = ?",
        telegramUserId,
      );
      return null;
    }
    if (activeWalletAddress && row.wallet_address !== activeWalletAddress) {
      return null;
    }
    if (
      row.referrer_username?.toLowerCase() !==
      IMPERIAL_REFERRER_USERNAME
    ) {
      return null;
    }

    const profileResult = await this.refreshImperialProfile(row);
    const profileAddress =
      "snapshot" in profileResult
        ? profileResult.snapshot.profileAddress
        : null;

    return {
      status: "connected",
      authorityWalletAddress: row.wallet_address,
      profileAddress,
      profileIndex: DELTA_NEUTRAL_PROFILE_INDEX,
      expiresAt: row.expires_at,
      connectedAt: row.connected_at,
      referrerUsername: IMPERIAL_REFERRER_USERNAME,
    };
  }

  private async applyControlPreference(
    body: TradingBotControlPreferenceBody,
  ): Promise<
    | {
        normalized: NormalizedTradingBotPreference;
        account: TradingBotAccountSnapshot;
      }
    | { error: string; status?: number }
  > {
    const session = await this.verifyControlSession(body);
    if ("error" in session) return session;

    const result = normalizeTradingBotPreference(body);
    if ("error" in result) return { error: result.error };
    if (result.normalized.telegramUserId !== session.telegramUserId) {
      return { error: "Control session is invalid or expired", status: 401 };
    }

    const applied = this.applyPreference(result.normalized);
    if ("error" in applied) return { error: applied.error };

    this.recordAccountEvent(
      session.telegramUserId,
      "control_preference_updated",
      {
        kind: result.normalized.kind,
        action: result.normalized.action,
        mint: result.normalized.mint,
        settings: result.normalized.settings
          ? Object.keys(result.normalized.settings).sort()
          : undefined,
      },
    );

    return { normalized: result.normalized, account: applied.account };
  }

  private async applyControlWalletAction(
    body: TradingBotControlWalletBody,
  ): Promise<
    | {
        status:
          | "claim_requested"
          | "export_requested"
          | "revoked"
          | "restored"
          | "signer_check_requested";
        action: TradingBotControlWalletAction;
        account: TradingBotAccountSnapshot;
        updatedAt: string;
        claimUrl?: string | null;
        warnings: string[];
      }
    | { error: string; status?: number }
  > {
    const session = await this.verifyControlSession(body);
    if ("error" in session) return session;

    const action = controlWalletActionValue(body.action);
    if (!action) {
      return {
        error:
          "action must be claim, export, revoke, restore, or verify_signer",
      };
    }

    const account = this.getAccount(session.telegramUserId);
    if (!account) return { error: "Account not found", status: 404 };
    const requestedWalletAddress = stringValue(body.userPublicKey);
    const managedWallet =
      account.wallets.find(
        (wallet) =>
          wallet.role === "spot_nft" &&
          wallet.walletSource === "privy" &&
          (!requestedWalletAddress ||
            wallet.solanaWalletAddress === requestedWalletAddress),
      ) ??
      (account.wallets.length === 0 &&
      account.walletSource === "privy" &&
      account.privyUserId &&
      account.privyWalletId &&
      account.solanaWalletAddress
        ? {
            walletId: account.privyWalletId,
            label: "Active wallet",
            role: "spot_nft" as const,
            walletSource: "privy" as const,
            privyUserId: account.privyUserId,
            privyWalletId: account.privyWalletId,
            solanaWalletAddress: account.solanaWalletAddress,
            createdAt: account.createdAt,
          }
        : null);
    if (!managedWallet) {
      return {
        error: "Wallet actions require an FTX/FrogX-managed Privy wallet",
        status: 409,
      };
    }

    if (
      requestedWalletAddress &&
      requestedWalletAddress !== managedWallet.solanaWalletAddress
    ) {
      return { error: "Trading wallet mismatch", status: 409 };
    }

    const now = new Date().toISOString();
    const claimUrl = stringValue(body.claimUrl) ?? null;
    let status:
      | "claim_requested"
      | "export_requested"
      | "revoked"
      | "restored"
      | "signer_check_requested";
    let eventType: string;
    let warnings: string[];

    if (action === "claim") {
      account.walletClaimRequestedAt = now;
      status = "claim_requested";
      eventType = "wallet_claim_requested";
      warnings = [
        "FTX recorded the claim request. Complete wallet claim by logging into the FTX/FrogX app with the same Telegram account through Privy.",
        "No private key or signer secret was exposed to this control session.",
      ];
    } else if (action === "export") {
      account.walletExportRequestedAt = now;
      status = "export_requested";
      eventType = "wallet_export_requested";
      warnings = [
        "FTX recorded the export request, but private-key export must happen through a Privy-secured user export flow.",
        "This control session never returns private key material.",
      ];
    } else if (action === "revoke") {
      account.botAccessRevokedAt = now;
      status = "revoked";
      eventType = "bot_access_revoked";
      warnings = [
        "FTX bot access is revoked for this account. Ribbot live actions will be refused until the user restores the Privy app signer and FTX access through an authenticated control session.",
      ];
    } else if (action === "restore") {
      delete account.botAccessRevokedAt;
      status = "restored";
      eventType = "bot_access_restored";
      warnings = [
        "FTX bot access is restored. Live actions still require the Privy app signer, wallet policy, and every FTX execution gate.",
      ];
    } else {
      return {
        status: "signer_check_requested",
        action,
        account,
        updatedAt: account.updatedAt,
        warnings: [],
      };
    }

    account.updatedAt = now;
    this.saveAccount(account);
    this.recordAccountEvent(account.telegramUserId, eventType, {
      walletAddress: managedWallet.solanaWalletAddress,
      privyUserId: managedWallet.privyUserId,
      privyWalletId: managedWallet.privyWalletId,
      claimUrl,
      updatedAt: now,
    });

    return {
      status,
      action,
      account,
      updatedAt: now,
      claimUrl,
      warnings,
    };
  }

  private async verifyControlSession(body: {
    telegramUserId?: unknown;
    sessionToken?: unknown;
  }): Promise<{ telegramUserId: string } | { error: string; status?: number }> {
    const telegramUserId = stringValue(body.telegramUserId);
    if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
      return { error: "telegramUserId is required" };
    }

    const sessionToken = normalizeControlSessionToken(body.sessionToken);
    if (!sessionToken) {
      return { error: "Control session is invalid or expired", status: 401 };
    }

    const now = new Date().toISOString();
    const sessionHash = await hashControlSessionToken(
      telegramUserId,
      sessionToken,
    );
    this.state.storage.sql.exec(
      "DELETE FROM control_sessions WHERE telegram_user_id = ? AND expires_at <= ?",
      telegramUserId,
      now,
    );
    const row =
      this.state.storage.sql
        .exec<TradingBotControlSessionRow>(
          `SELECT * FROM control_sessions
          WHERE telegram_user_id = ?
            AND session_hash = ?
            AND revoked_at IS NULL
            AND expires_at > ?
          LIMIT 1`,
          telegramUserId,
          sessionHash,
          now,
        )
        .toArray()[0] ?? null;

    if (!row) {
      return { error: "Control session is invalid or expired", status: 401 };
    }

    this.state.storage.sql.exec(
      `UPDATE control_sessions
      SET last_used_at = ?
      WHERE telegram_user_id = ? AND session_hash = ?`,
      now,
      telegramUserId,
      sessionHash,
    );

    return { telegramUserId };
  }

  private getOrCreateAccount(
    telegramUserId: string,
    defaults: { username?: string; solanaWalletAddress?: string } = {},
  ): TradingBotAccountSnapshot {
    const existing = this.getAccount(telegramUserId);
    if (existing) {
      if (!existing.referralCode) {
        existing.referralCode = this.generateUniqueReferralCode();
        existing.updatedAt = new Date().toISOString();
        this.saveAccount(existing);
      }
      return existing;
    }

    const now = new Date().toISOString();
    return {
      telegramUserId,
      ...(defaults.username ? { username: defaults.username } : {}),
      ...(defaults.solanaWalletAddress
        ? { solanaWalletAddress: defaults.solanaWalletAddress }
        : {}),
      wallets: [],
      settings: defaultTradingBotSettings(),
      watchlist: [],
      hiddenTokens: [],
      referralCode: this.generateUniqueReferralCode(),
      createdAt: now,
      updatedAt: now,
    };
  }

  private getAccount(telegramUserId: string): TradingBotAccountSnapshot | null {
    const row =
      this.state.storage.sql
        .exec<TradingBotAccountRow>(
          "SELECT * FROM accounts WHERE telegram_user_id = ?",
          telegramUserId,
        )
        .toArray()[0] ?? null;
    return row ? rowToTradingBotAccount(row) : null;
  }

  private saveAccount(account: TradingBotAccountSnapshot): void {
    this.state.storage.sql.exec(
      `INSERT INTO accounts (
        telegram_user_id, username, wallet_source, privy_user_id, privy_wallet_id,
        solana_wallet_address, active_wallet_id, wallets_json,
        wallet_claim_requested_at, wallet_export_requested_at,
        bot_access_revoked_at, settings_json, watchlist_json, hidden_tokens_json,
        referral_code, referred_by_code, referred_by_telegram_user_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(telegram_user_id) DO UPDATE SET
        username = excluded.username,
        wallet_source = excluded.wallet_source,
        privy_user_id = excluded.privy_user_id,
        privy_wallet_id = excluded.privy_wallet_id,
        solana_wallet_address = excluded.solana_wallet_address,
        active_wallet_id = excluded.active_wallet_id,
        wallets_json = excluded.wallets_json,
        wallet_claim_requested_at = excluded.wallet_claim_requested_at,
        wallet_export_requested_at = excluded.wallet_export_requested_at,
        bot_access_revoked_at = excluded.bot_access_revoked_at,
        settings_json = excluded.settings_json,
        watchlist_json = excluded.watchlist_json,
        hidden_tokens_json = excluded.hidden_tokens_json,
        referral_code = excluded.referral_code,
        referred_by_code = excluded.referred_by_code,
        referred_by_telegram_user_id = excluded.referred_by_telegram_user_id,
        updated_at = excluded.updated_at`,
      account.telegramUserId,
      account.username ?? null,
      account.walletSource ?? null,
      account.privyUserId ?? null,
      account.privyWalletId ?? null,
      account.solanaWalletAddress ?? null,
      account.activeWalletId ?? null,
      JSON.stringify(account.wallets),
      account.walletClaimRequestedAt ?? null,
      account.walletExportRequestedAt ?? null,
      account.botAccessRevokedAt ?? null,
      JSON.stringify(account.settings),
      JSON.stringify(account.watchlist),
      JSON.stringify(account.hiddenTokens),
      account.referralCode ?? null,
      account.referredByCode ?? null,
      account.referredByTelegramUserId ?? null,
      account.createdAt,
      account.updatedAt,
    );
  }

  private storeManualReviewCase(
    body: Record<string, unknown>,
  ): { case: TradingBotManualReviewCase } | { error: string; status?: number } {
    const caseId = stringValue(body.caseId);
    const telegramUserId = stringValue(body.telegramUserId);
    const executionKind = stringValue(body.executionKind);
    const resourceId = stringValue(body.resourceId);
    const executionId = stringValue(body.executionId);
    const referenceId = stringValue(body.referenceId);
    const executionStartedAt = optionalIsoTimestamp(body.executionStartedAt);
    const manualReviewAfter = optionalIsoTimestamp(body.manualReviewAfter);
    const manualReviewRequiredAt = optionalIsoTimestamp(
      body.manualReviewRequiredAt,
    );
    const reason = stringValue(body.reason)?.slice(0, 240);
    if (!caseId || !TRADING_BOT_EXECUTION_REFERENCE_PATTERN.test(caseId)) {
      return { error: "caseId is required" };
    }
    if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
      return { error: "telegramUserId is required" };
    }
    if (!executionKind || !/^[a-z_]{2,40}$/.test(executionKind)) {
      return { error: "executionKind is required" };
    }
    if (
      !resourceId ||
      !TRADING_BOT_EXECUTION_REFERENCE_PATTERN.test(resourceId)
    ) {
      return { error: "resourceId is required" };
    }
    if (
      !executionId ||
      !TRADING_BOT_EXECUTION_REFERENCE_PATTERN.test(executionId)
    ) {
      return { error: "executionId is required" };
    }
    if (
      !referenceId ||
      !TRADING_BOT_EXECUTION_REFERENCE_PATTERN.test(referenceId)
    ) {
      return { error: "referenceId is required" };
    }
    if (!manualReviewRequiredAt) {
      return { error: "manualReviewRequiredAt is required" };
    }

    const existing = this.getManualReviewCase(caseId);
    if (existing) return { case: existing };

    const now = new Date().toISOString();
    this.state.storage.sql.exec(
      `INSERT INTO manual_review_cases (
        case_id, telegram_user_id, execution_kind, resource_id, execution_id,
        reference_id, execution_started_at, manual_review_after,
        manual_review_required_at, reason, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      caseId,
      telegramUserId,
      executionKind,
      resourceId,
      executionId,
      referenceId,
      executionStartedAt ?? null,
      manualReviewAfter ?? null,
      manualReviewRequiredAt,
      reason ?? null,
      "open",
      now,
      now,
    );
    const reviewCase = this.getManualReviewCase(caseId);
    return reviewCase
      ? { case: reviewCase }
      : { error: "Manual review case was not stored", status: 500 };
  }

  private acknowledgeManualReviewCase(
    body: Record<string, unknown>,
  ): { case: TradingBotManualReviewCase } | { error: string; status?: number } {
    const caseId = stringValue(body.caseId);
    const note = stringValue(body.note)?.slice(0, 240);
    if (!caseId || !TRADING_BOT_EXECUTION_REFERENCE_PATTERN.test(caseId)) {
      return { error: "caseId is required" };
    }
    const existing = this.getManualReviewCase(caseId);
    if (!existing)
      return { error: "Manual review case not found", status: 404 };
    if (existing.status === "resolved") {
      return { error: "Manual review case is already resolved", status: 409 };
    }
    if (existing.status === "acknowledged") return { case: existing };

    const now = new Date().toISOString();
    this.state.storage.sql.exec(
      `UPDATE manual_review_cases
      SET status = ?, acknowledged_at = ?, operator_note = ?, updated_at = ?
      WHERE case_id = ? AND status = ?`,
      "acknowledged",
      now,
      note ?? null,
      now,
      caseId,
      "open",
    );
    const reviewCase = this.getManualReviewCase(caseId);
    return reviewCase
      ? { case: reviewCase }
      : { error: "Manual review case not found", status: 404 };
  }

  private updateManualReviewCaseCheck(
    body: Record<string, unknown>,
  ): { case: TradingBotManualReviewCase } | { error: string; status?: number } {
    const caseId = stringValue(body.caseId);
    const checkedAt = optionalIsoTimestamp(body.checkedAt);
    const checkStatus = stringValue(body.checkStatus)?.slice(0, 64);
    const checkError = stringValue(body.checkError)?.slice(0, 240);
    const resolution = manualReviewResolutionValue(body.resolution);
    const providerStatus = stringValue(body.providerStatus)?.slice(0, 64);
    const signature = stringValue(body.signature)?.slice(0, 128);
    const transactionId = stringValue(body.transactionId)?.slice(0, 128);
    if (!caseId || !TRADING_BOT_EXECUTION_REFERENCE_PATTERN.test(caseId)) {
      return { error: "caseId is required" };
    }
    if (!checkedAt || !checkStatus) {
      return { error: "checkedAt and checkStatus are required" };
    }
    if (body.resolution !== undefined && !resolution) {
      return { error: "resolution is invalid" };
    }
    const existing = this.getManualReviewCase(caseId);
    if (!existing)
      return { error: "Manual review case not found", status: 404 };
    if (existing.status === "resolved") return { case: existing };

    this.state.storage.sql.exec(
      `UPDATE manual_review_cases
      SET status = ?, last_checked_at = ?, last_check_status = ?,
        last_check_error = ?, resolution = ?, provider_status = ?,
        signature = ?, transaction_id = ?, resolved_at = ?, updated_at = ?
      WHERE case_id = ? AND status != ?`,
      resolution ? "resolved" : existing.status,
      checkedAt,
      checkStatus,
      checkError ?? null,
      resolution ?? null,
      providerStatus ?? null,
      signature ?? null,
      transactionId ?? null,
      resolution ? checkedAt : null,
      checkedAt,
      caseId,
      "resolved",
    );
    const reviewCase = this.getManualReviewCase(caseId);
    return reviewCase
      ? { case: reviewCase }
      : { error: "Manual review case not found", status: 404 };
  }

  private listManualReviewCases(
    status: TradingBotManualReviewCaseStatusFilter,
    limit: number,
  ): TradingBotManualReviewCase[] {
    const query =
      status === "all"
        ? `SELECT * FROM manual_review_cases
          ORDER BY manual_review_required_at ASC LIMIT ?`
        : status === "active"
          ? `SELECT * FROM manual_review_cases
            WHERE status IN ('open', 'acknowledged')
            ORDER BY manual_review_required_at ASC LIMIT ?`
          : `SELECT * FROM manual_review_cases
            WHERE status = ?
            ORDER BY manual_review_required_at ASC LIMIT ?`;
    const rows =
      status === "all" || status === "active"
        ? this.state.storage.sql
            .exec<TradingBotManualReviewCaseRow>(query, limit)
            .toArray()
        : this.state.storage.sql
            .exec<TradingBotManualReviewCaseRow>(query, status, limit)
            .toArray();
    return rows.map(rowToTradingBotManualReviewCase);
  }

  private getManualReviewCase(
    caseId: string,
  ): TradingBotManualReviewCase | null {
    const row = this.state.storage.sql
      .exec<TradingBotManualReviewCaseRow>(
        `SELECT * FROM manual_review_cases WHERE case_id = ? LIMIT 1`,
        caseId,
      )
      .toArray()[0];
    return row ? rowToTradingBotManualReviewCase(row) : null;
  }

  private getEvents(
    telegramUserId: string,
    limit: number,
  ): TradingBotAccountEventSnapshot[] {
    return this.state.storage.sql
      .exec<TradingBotAccountEventRow>(
        `SELECT * FROM account_events
        WHERE telegram_user_id = ?
        ORDER BY created_at DESC
        LIMIT ?`,
        telegramUserId,
        limit,
      )
      .toArray()
      .map(rowToTradingBotAccountEvent);
  }

  private getEvent(
    telegramUserId: string,
    eventId: string,
  ): TradingBotAccountEventSnapshot | null {
    const row = this.state.storage.sql
      .exec<TradingBotAccountEventRow>(
        `SELECT * FROM account_events
        WHERE telegram_user_id = ? AND event_id = ?
        LIMIT 1`,
        telegramUserId,
        eventId,
      )
      .toArray()[0];
    return row ? rowToTradingBotAccountEvent(row) : null;
  }

  private recordAccountEvent(
    telegramUserId: string,
    eventType: string,
    metadata: Record<string, unknown>,
    requestedEventId?: string,
  ): TradingBotAccountEventSnapshot {
    const eventId = requestedEventId ?? crypto.randomUUID();
    const createdAt = new Date().toISOString();
    this.state.storage.sql.exec(
      `INSERT OR IGNORE INTO account_events (
        telegram_user_id, event_id, event_type, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?)`,
      telegramUserId,
      eventId,
      eventType,
      JSON.stringify(metadata),
      createdAt,
    );
    return (
      this.getEvent(telegramUserId, eventId) ?? {
        telegramUserId,
        eventId,
        eventType,
        metadata,
        createdAt,
      }
    );
  }
}

async function getUserByTelegramId(
  config: PrivyConfig,
  telegramUserId: string,
): Promise<PrivyUser | null> {
  const response = await privyRequest(
    config,
    "/users/telegram/telegram_user_id",
    {
      method: "POST",
      body: JSON.stringify({ telegram_user_id: telegramUserId }),
    },
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Privy user lookup failed with status ${response.status}`);
  }

  return (await response.json()) as PrivyUser;
}

async function createTelegramUser(
  config: PrivyConfig,
  telegramUserId: string,
  username?: string,
): Promise<PrivyUser> {
  const response = await privyRequest(config, "/users", {
    method: "POST",
    body: JSON.stringify({
      linked_accounts: [
        {
          type: "telegram",
          telegram_user_id: telegramUserId,
          ...(username ? { username } : {}),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Privy user create failed with status ${response.status}`);
  }

  return (await response.json()) as PrivyUser;
}

async function createSolanaWallet(
  config: PrivyConfig,
  privyUserId: string,
  telegramUserId: string,
  walletIndex: number,
): Promise<PrivyWallet> {
  const additionalSigners = config.authorizationKeyId
    ? [
        {
          signer_id: config.authorizationKeyId,
          override_policy_ids: config.walletPolicyIds,
        },
      ]
    : undefined;

  const response = await privyRequest(config, "/wallets", {
    method: "POST",
    headers: {
      "privy-idempotency-key": `ribbot-tg-${telegramUserId}-solana-wallet-${walletIndex + 1}`,
    },
    body: JSON.stringify({
      chain_type: "solana",
      display_name:
        walletIndex === 0
          ? `Ribbot ${telegramUserId} Spot/NFT`
          : `Ribbot ${telegramUserId} Perps`,
      external_id: `ribbot_tg_${telegramUserId}_${walletIndex + 1}`,
      owner: { user_id: privyUserId },
      ...(additionalSigners ? { additional_signers: additionalSigners } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Privy wallet create failed with status ${response.status}`,
    );
  }

  return (await response.json()) as PrivyWallet;
}

function privyRequest(
  config: PrivyConfig,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("privy-app-id", config.appId);
  headers.set("Authorization", `Basic ${encodeBasicAuth(config)}`);

  return fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers,
  });
}

async function getPrivyWallet(
  config: PrivyConfig,
  walletId: string,
): Promise<PrivyWallet> {
  const response = await privyRequest(
    config,
    `/wallets/${encodeURIComponent(walletId)}`,
    { method: "GET" },
  );
  if (!response.ok) {
    throw new Error(
      `Privy wallet lookup failed with status ${response.status}`,
    );
  }
  return (await response.json()) as PrivyWallet;
}

function automationSignerDescriptor(config: PrivyConfig): {
  signerId: string;
  policyIds: string[];
} | null {
  return signerConfigured(config) && config.authorizationKeyId
    ? {
        signerId: config.authorizationKeyId,
        policyIds: config.walletPolicyIds,
      }
    : null;
}

function hasConfiguredAutomationSigner(
  wallet: PrivyWallet,
  config: PrivyConfig,
): boolean {
  const signerId = config.authorizationKeyId;
  if (!signerId) return false;
  const expectedPolicyIds = [...config.walletPolicyIds].sort();
  return Boolean(
    wallet.additional_signers?.some((signer) => {
      if (signer.signer_id !== signerId) return false;
      const actualPolicyIds = [...(signer.override_policy_ids ?? [])].sort();
      return (
        actualPolicyIds.length === expectedPolicyIds.length &&
        actualPolicyIds.every(
          (policyId, index) => policyId === expectedPolicyIds[index],
        )
      );
    }),
  );
}

async function getPrivyTransactionByReferenceId(
  config: PrivyConfig,
  referenceId: string,
): Promise<PrivyTransaction | null> {
  const response = await privyRequest(
    config,
    `/transactions?reference_id=${encodeURIComponent(referenceId)}`,
    { method: "GET" },
  );
  if (!response.ok) {
    throw new Error(
      `Privy transaction lookup failed with status ${response.status}`,
    );
  }

  const data = (await response.json()) as { transactions?: unknown };
  if (!Array.isArray(data.transactions)) return null;
  const transactions: PrivyTransaction[] = [];
  for (const value of data.transactions) {
    const record =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    const id = stringValue(record.id);
    const walletId = stringValue(record.wallet_id);
    const status = privyTransactionStatusValue(record.status);
    const caip2 = stringValue(record.caip2);
    const transactionHash = stringValue(record.transaction_hash) ?? null;
    const transactionReferenceId = stringValue(record.reference_id) ?? null;
    const createdAt = numberValue(record.created_at);
    if (!id || !walletId || !status || !caip2 || createdAt === undefined)
      continue;
    if (transactionReferenceId && transactionReferenceId !== referenceId)
      continue;
    transactions.push({
      id,
      wallet_id: walletId,
      status,
      transaction_hash: transactionHash,
      caip2,
      created_at: createdAt,
      reference_id: transactionReferenceId,
    });
  }
  return transactions.sort((a, b) => b.created_at - a.created_at)[0] ?? null;
}

type TradingBotManualReviewFields = {
  manualReviewAfter?: string;
  manualReviewRequiredAt?: string;
  manualReviewReason?: string;
};

function tradingBotManualReviewAfterSeconds(env: Env): number {
  return clampInteger(
    numberValue(env.TRADING_BOT_MANUAL_REVIEW_AFTER_SECONDS),
    1,
    7 * 24 * 60 * 60,
    DEFAULT_TRADING_BOT_MANUAL_REVIEW_AFTER_SECONDS,
  );
}

function withTradingBotManualReview<T extends TradingBotManualReviewFields>(
  state: T,
  env: Env,
  executionStartedAt: string | undefined,
  now: Date,
  unresolvedStatus: string,
): T {
  if (!executionStartedAt) return state;
  const startedAtMs = Date.parse(executionStartedAt);
  if (!Number.isFinite(startedAtMs)) return state;

  const thresholdSeconds = tradingBotManualReviewAfterSeconds(env);
  const manualReviewAfter = new Date(
    startedAtMs + thresholdSeconds * 1000,
  ).toISOString();
  const manualReviewRequired =
    Boolean(state.manualReviewRequiredAt) ||
    now.getTime() >= Date.parse(manualReviewAfter);
  const next = { ...state, manualReviewAfter };
  if (!manualReviewRequired) return next;

  return {
    ...next,
    manualReviewRequiredAt: state.manualReviewRequiredAt ?? now.toISOString(),
    manualReviewReason:
      state.manualReviewReason ??
      `Execution remains unresolved after ${thresholdSeconds} seconds (${unresolvedStatus}). Inspect Privy and Solana before any manual state change; do not resend.`,
  };
}

function clearTradingBotManualReview<T extends TradingBotManualReviewFields>(
  state: T,
): T {
  const next = { ...state };
  delete next.manualReviewAfter;
  delete next.manualReviewRequiredAt;
  delete next.manualReviewReason;
  return next;
}

function tradingBotManualReviewResponse(state?: TradingBotManualReviewFields): {
  manualReviewRequired: boolean;
  manualReviewAfter: string | null;
  manualReviewRequiredAt: string | null;
  manualReviewReason: string | null;
} {
  return {
    manualReviewRequired: Boolean(state?.manualReviewRequiredAt),
    manualReviewAfter: state?.manualReviewAfter ?? null,
    manualReviewRequiredAt: state?.manualReviewRequiredAt ?? null,
    manualReviewReason: state?.manualReviewReason ?? null,
  };
}

async function recordTradingBotManualReviewRequired(
  env: Env,
  input: {
    telegramUserId: string;
    executionKind: string;
    resourceId?: string;
    executionId: string;
    referenceId: string;
    executionStartedAt?: string;
    state: TradingBotManualReviewFields;
  },
): Promise<void> {
  if (!input.state.manualReviewRequiredAt) return;
  const eventId = await tradingBotLifecycleEventId(
    "manual-review",
    input.referenceId,
  );
  await recordTradingBotAccountEvent(env, input.telegramUserId, {
    eventId,
    eventType: "execution_manual_review_required",
    metadata: {
      executionKind: input.executionKind,
      resourceId: input.resourceId ?? input.executionId,
      executionId: input.executionId,
      referenceId: input.referenceId,
      executionStartedAt: input.executionStartedAt ?? null,
      manualReviewAfter: input.state.manualReviewAfter ?? null,
      manualReviewRequiredAt: input.state.manualReviewRequiredAt,
      reason: input.state.manualReviewReason ?? null,
      automaticRetry: false,
    },
  });
  await storeTradingBotManualReviewCase(env, {
    caseId: eventId,
    telegramUserId: input.telegramUserId,
    executionKind: input.executionKind,
    resourceId: input.resourceId ?? input.executionId,
    executionId: input.executionId,
    referenceId: input.referenceId,
    executionStartedAt: input.executionStartedAt,
    manualReviewAfter: input.state.manualReviewAfter,
    manualReviewRequiredAt: input.state.manualReviewRequiredAt,
    reason: input.state.manualReviewReason,
  });
}

async function storeTradingBotManualReviewCase(
  env: Env,
  reviewCase: {
    caseId: string;
    telegramUserId: string;
    executionKind: string;
    resourceId: string;
    executionId: string;
    referenceId: string;
    executionStartedAt?: string;
    manualReviewAfter?: string;
    manualReviewRequiredAt: string;
    reason?: string;
  },
): Promise<TradingBotManualReviewCase | undefined> {
  const store = tradingBotOrderStore(env);
  if (!store) return undefined;
  try {
    const response = await store.fetch(
      new Request("https://trading-bot-account.local/manual-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reviewCase),
      }),
    );
    if (!response.ok) {
      console.warn(
        "[trading-bot] Manual review case storage failed",
        response.status,
      );
      return undefined;
    }
    const data = (await response.json()) as {
      case?: TradingBotManualReviewCase;
    };
    return data.case;
  } catch (error) {
    console.warn("[trading-bot] Manual review case storage unavailable", error);
    return undefined;
  }
}

async function getStoredTradingBotManualReviewCase(
  store: DurableObjectStub,
  caseId: string,
): Promise<TradingBotManualReviewCase | null> {
  const response = await store.fetch(
    new Request(
      `https://trading-bot-account.local/manual-review?caseId=${encodeURIComponent(caseId)}`,
    ),
  );
  if (response.status === 404) return null;
  if (!response.ok) return null;
  const data = (await response.json()) as {
    case?: TradingBotManualReviewCase;
  };
  return data.case ?? null;
}

async function acknowledgeStoredTradingBotManualReviewCase(
  store: DurableObjectStub,
  caseId: string,
  note?: string,
): Promise<TradingBotManualReviewCase | null> {
  const response = await store.fetch(
    new Request("https://trading-bot-account.local/manual-review/acknowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId, note }),
    }),
  );
  if (!response.ok) return null;
  const data = (await response.json()) as {
    case?: TradingBotManualReviewCase;
  };
  return data.case ?? null;
}

async function updateStoredTradingBotManualReviewCaseCheck(
  store: DurableObjectStub,
  caseId: string,
  evidence: TradingBotManualReviewEvidence,
): Promise<TradingBotManualReviewCase | null> {
  const response = await store.fetch(
    new Request("https://trading-bot-account.local/manual-review/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId, ...evidence }),
    }),
  );
  if (!response.ok) return null;
  const data = (await response.json()) as {
    case?: TradingBotManualReviewCase;
  };
  return data.case ?? null;
}

async function recordTradingBotManualReviewAcknowledgementEvent(
  env: Env,
  reviewCase: TradingBotManualReviewCase,
): Promise<void> {
  await recordTradingBotAccountEvent(env, reviewCase.telegramUserId, {
    eventId: await tradingBotLifecycleEventId("review-ack", reviewCase.caseId),
    eventType: "execution_manual_review_acknowledged",
    metadata: {
      caseId: reviewCase.caseId,
      executionKind: reviewCase.executionKind,
      resourceId: reviewCase.resourceId,
      executionId: reviewCase.executionId,
      referenceId: reviewCase.referenceId,
      acknowledgedAt: reviewCase.acknowledgedAt ?? null,
      automaticRetry: false,
    },
  });
}

async function recordTradingBotManualReviewResolutionEvent(
  env: Env,
  reviewCase: TradingBotManualReviewCase,
  evidence: TradingBotManualReviewEvidence,
): Promise<void> {
  if (!evidence.resolution) return;
  await recordTradingBotAccountEvent(env, reviewCase.telegramUserId, {
    eventId: await tradingBotLifecycleEventId(
      "review-resolved",
      reviewCase.caseId,
    ),
    eventType: "execution_manual_review_resolved",
    metadata: {
      caseId: reviewCase.caseId,
      executionKind: reviewCase.executionKind,
      resourceId: reviewCase.resourceId,
      executionId: reviewCase.executionId,
      referenceId: reviewCase.referenceId,
      resolution: evidence.resolution,
      providerStatus: evidence.providerStatus ?? null,
      signature: evidence.signature ?? null,
      transactionId: evidence.transactionId ?? null,
      checkedAt: evidence.checkedAt,
      automaticRetry: false,
    },
  });
}

async function resolveTradingBotManualReviewCaseFromTerminalEvidence(
  env: Env,
  input: {
    referenceId: string;
    resolution: TradingBotManualReviewResolution;
    providerStatus?: string;
    signature?: string | null;
    transactionId?: string | null;
    checkedAt: string;
  },
): Promise<void> {
  const store = tradingBotOrderStore(env);
  if (!store) return;
  const caseId = await tradingBotLifecycleEventId(
    "manual-review",
    input.referenceId,
  );
  const reviewCase = await getStoredTradingBotManualReviewCase(store, caseId);
  if (!reviewCase || reviewCase.status === "resolved") return;
  const evidence: TradingBotManualReviewEvidence = {
    checkedAt: input.checkedAt,
    checkStatus: input.resolution,
    resolution: input.resolution,
    ...(input.providerStatus ? { providerStatus: input.providerStatus } : {}),
    ...(input.signature ? { signature: input.signature } : {}),
    ...(input.transactionId ? { transactionId: input.transactionId } : {}),
  };
  const updated = await updateStoredTradingBotManualReviewCaseCheck(
    store,
    caseId,
    evidence,
  );
  if (updated) {
    await recordTradingBotManualReviewResolutionEvent(env, updated, evidence);
  }
}

async function reconcileTradingBotManualReviewCase(
  env: Env,
  store: DurableObjectStub,
  reviewCase: TradingBotManualReviewCase,
): Promise<TradingBotManualReviewEvidence> {
  const checkedAt = new Date().toISOString();
  if (!resolvePrivyConfig(env)) {
    return {
      checkedAt,
      checkStatus: "not_configured",
      checkError: "Privy app credentials are not configured in FTX",
    };
  }

  if (
    reviewCase.executionKind === "swap" ||
    reviewCase.executionKind === "withdrawal"
  ) {
    const expectedReferenceId = await tradingBotExecutionReferenceId(
      reviewCase.telegramUserId,
      reviewCase.executionId,
    );
    if (expectedReferenceId !== reviewCase.referenceId) {
      return {
        checkedAt,
        checkStatus: "reference_mismatch",
        checkError: "Stored review reference does not match the execution ID",
      };
    }
    const accountResult = await getStoredTradingBotAccount(
      env,
      reviewCase.telegramUserId,
    );
    const spotWallet =
      "error" in accountResult || !accountResult.account
        ? null
        : spotNftPrivyWallet(accountResult.account);
    if (
      "error" in accountResult ||
      !spotWallet
    ) {
      return {
        checkedAt,
        checkStatus: "account_lookup_error",
        checkError:
          "error" in accountResult
            ? accountResult.error
            : "FTX trading account has no Solana wallet",
      };
    }
    const response = await getTradingBotDirectExecutionStatus(env, {
      executionKind: reviewCase.executionKind,
      executionId: reviewCase.executionId,
      referenceSubject: reviewCase.executionId,
      telegramUserId: reviewCase.telegramUserId,
      userPublicKey: spotWallet.solanaWalletAddress,
      successEventType:
        reviewCase.executionKind === "swap"
          ? "swap_executed"
          : "withdrawal_executed",
      failureEventType:
        reviewCase.executionKind === "swap"
          ? "swap_execution_failed"
          : "withdrawal_execution_failed",
      eventMetadata: {
        manualReviewCaseId: reviewCase.caseId,
        operatorReconciliation: true,
      },
    });
    const data = (await response.json()) as {
      status?: string;
      providerStatus?: string;
      error?: string;
      signature?: string | null;
      transactionId?: string | null;
      checkedAt?: string;
    };
    return manualReviewEvidenceFromResult(data, checkedAt);
  }

  if (reviewCase.executionKind.startsWith("scheduled_")) {
    const order = await loadStoredTradingBotAutomationOrder(
      store,
      reviewCase.telegramUserId,
      reviewCase.resourceId,
    );
    if (!order) {
      return {
        checkedAt,
        checkStatus: "not_found",
        checkError: "Scheduled order no longer exists in FTX",
      };
    }
    if (
      order.scheduler.executionId &&
      order.scheduler.executionId !== reviewCase.executionId
    ) {
      return {
        checkedAt,
        checkStatus: "stale_execution",
        checkError: "Scheduled order now points to a different execution",
      };
    }
    if (order.status === "executing") {
      await reconcileTradingBotScheduledOrders([order], store, env, new Date());
    }
    const refreshed =
      (await loadStoredTradingBotAutomationOrder(
        store,
        reviewCase.telegramUserId,
        reviewCase.resourceId,
      )) ?? order;
    if (
      refreshed.scheduler.executionId &&
      refreshed.scheduler.executionId !== reviewCase.executionId
    ) {
      return {
        checkedAt,
        checkStatus: "stale_execution",
        checkError: "Scheduled order changed execution during reconciliation",
      };
    }
    return manualReviewEvidenceFromStoredState({
      checkedAt,
      lifecycleStatus: refreshed.status,
      providerStatus: refreshed.scheduler.reconciliationStatus,
      error: refreshed.scheduler.lastError,
      signature: refreshed.scheduler.executionSignature,
      transactionId: refreshed.scheduler.executionTransactionId,
    });
  }

  if (reviewCase.executionKind === "bundle_buy") {
    const loaded = await loadStoredTradingBotBundleBuyConfig(
      store,
      reviewCase.telegramUserId,
      reviewCase.resourceId,
    );
    if ("error" in loaded) {
      return {
        checkedAt,
        checkStatus: "not_found",
        checkError: loaded.error,
      };
    }
    const response = await getTradingBotBundleBuyExecutionStatusResponse(
      loaded.config,
      env,
      store,
    );
    const data = (await response.json()) as {
      status?: string;
      error?: string;
      checkedAt?: string;
    };
    return manualReviewEvidenceFromResult(data, checkedAt);
  }

  const kind = advancedAutomationKindValue(reviewCase.executionKind);
  if (kind && kind !== "bundle_buy") {
    const loaded = await loadStoredTradingBotAdvancedAutomationConfig(
      store,
      reviewCase.telegramUserId,
      reviewCase.resourceId,
      kind,
    );
    if ("error" in loaded) {
      return {
        checkedAt,
        checkStatus: "not_found",
        checkError: loaded.error,
      };
    }
    if (
      loaded.config.monitor.executionId &&
      loaded.config.monitor.executionId !== reviewCase.executionId
    ) {
      return {
        checkedAt,
        checkStatus: "stale_execution",
        checkError: "Automation config now points to a different execution",
      };
    }
    if (loaded.config.status === "executing") {
      await reconcileTradingBotAdvancedAutomationConfigs(
        [loaded.config],
        store,
        env,
        new Date(),
      );
    }
    const refreshed = await loadStoredTradingBotAdvancedAutomationConfig(
      store,
      reviewCase.telegramUserId,
      reviewCase.resourceId,
      kind,
    );
    const config = "error" in refreshed ? loaded.config : refreshed.config;
    if (
      config.monitor.executionId &&
      config.monitor.executionId !== reviewCase.executionId
    ) {
      return {
        checkedAt,
        checkStatus: "stale_execution",
        checkError: "Automation config changed execution during reconciliation",
      };
    }
    return manualReviewEvidenceFromStoredState({
      checkedAt,
      lifecycleStatus: config.status,
      providerStatus: config.monitor.reconciliationStatus,
      error: config.monitor.lastError,
      signature: config.monitor.executionSignature,
      transactionId: config.monitor.executionTransactionId,
    });
  }

  return {
    checkedAt,
    checkStatus: "unsupported_execution_kind",
    checkError: `Unsupported review execution kind: ${reviewCase.executionKind}`,
  };
}

function manualReviewEvidenceFromResult(
  result: {
    status?: string;
    providerStatus?: string;
    error?: string;
    signature?: string | null;
    transactionId?: string | null;
    checkedAt?: string;
  },
  fallbackCheckedAt: string,
): TradingBotManualReviewEvidence {
  const resolution =
    result.status === "executed"
      ? "executed"
      : result.status === "failed"
        ? "failed"
        : undefined;
  return {
    checkedAt: optionalIsoTimestamp(result.checkedAt) ?? fallbackCheckedAt,
    checkStatus: result.status ?? "lookup_error",
    ...(result.error ? { checkError: result.error.slice(0, 240) } : {}),
    ...(resolution ? { resolution } : {}),
    ...(result.providerStatus ? { providerStatus: result.providerStatus } : {}),
    ...(result.signature ? { signature: result.signature } : {}),
    ...(result.transactionId ? { transactionId: result.transactionId } : {}),
  };
}

function manualReviewEvidenceFromStoredState(input: {
  checkedAt: string;
  lifecycleStatus: string;
  providerStatus?: string;
  error?: string;
  signature?: string;
  transactionId?: string;
}): TradingBotManualReviewEvidence {
  const providerResolution = manualReviewResolutionFromProviderStatus(
    input.providerStatus,
  );
  return {
    checkedAt: input.checkedAt,
    checkStatus: `${input.lifecycleStatus}:${input.providerStatus ?? "unknown"}`,
    ...(input.error ? { checkError: input.error.slice(0, 240) } : {}),
    ...(providerResolution ? { resolution: providerResolution } : {}),
    ...(input.providerStatus ? { providerStatus: input.providerStatus } : {}),
    ...(input.signature ? { signature: input.signature } : {}),
    ...(input.transactionId ? { transactionId: input.transactionId } : {}),
  };
}

function manualReviewResolutionFromProviderStatus(
  providerStatus: string | undefined,
): TradingBotManualReviewResolution | undefined {
  if (providerStatus === "confirmed" || providerStatus === "finalized") {
    return "executed";
  }
  return providerStatus === "execution_reverted" ||
    providerStatus === "failed" ||
    providerStatus === "provider_error" ||
    providerStatus === "replaced"
    ? "failed"
    : undefined;
}

async function recordTradingBotDirectReconciliationRequired(
  env: Env,
  input: {
    executionKind: "swap" | "withdrawal";
    executionId: string;
    telegramUserId: string;
    userPublicKey: string;
    referenceId: string;
  },
): Promise<TradingBotManualReviewFields & { executionStartedAt: string }> {
  const submittedAt = new Date().toISOString();
  const eventId = await tradingBotLifecycleEventId(
    "reconciliation",
    input.referenceId,
  );
  const event = await recordTradingBotAccountEvent(env, input.telegramUserId, {
    eventId,
    eventType: "execution_reconciliation_required",
    metadata: {
      executionKind: input.executionKind,
      executionId: input.executionId,
      walletAddress: input.userPublicKey,
      referenceId: input.referenceId,
      executionStartedAt: submittedAt,
      automaticRetry: false,
    },
  });
  const executionStartedAt = event?.createdAt ?? submittedAt;
  const state: TradingBotManualReviewFields & { executionStartedAt: string } = {
    executionStartedAt,
  };
  return withTradingBotManualReview(
    state,
    env,
    executionStartedAt,
    new Date(submittedAt),
    "pending_reconciliation",
  );
}

async function getTradingBotDirectReconciliationState(
  env: Env,
  telegramUserId: string,
  referenceId: string,
): Promise<TradingBotManualReviewFields & { executionStartedAt?: string }> {
  const reconciliationEventId = await tradingBotLifecycleEventId(
    "reconciliation",
    referenceId,
  );
  const manualReviewEventId = await tradingBotLifecycleEventId(
    "manual-review",
    referenceId,
  );
  const [event, manualReviewEvent] = await Promise.all([
    getStoredTradingBotEvent(env, telegramUserId, reconciliationEventId),
    getStoredTradingBotEvent(env, telegramUserId, manualReviewEventId),
  ]);
  if (!event && !manualReviewEvent) return {};
  const executionStartedAt =
    stringValue(event?.metadata.executionStartedAt) ??
    event?.createdAt ??
    stringValue(manualReviewEvent?.metadata.executionStartedAt);
  const manualReviewAfter = stringValue(
    manualReviewEvent?.metadata.manualReviewAfter,
  );
  const manualReviewRequiredAt = stringValue(
    manualReviewEvent?.metadata.manualReviewRequiredAt,
  );
  const manualReviewReason = stringValue(manualReviewEvent?.metadata.reason);
  return {
    ...(executionStartedAt ? { executionStartedAt } : {}),
    ...(manualReviewAfter ? { manualReviewAfter } : {}),
    ...(manualReviewRequiredAt ? { manualReviewRequiredAt } : {}),
    ...(manualReviewReason ? { manualReviewReason } : {}),
  };
}

async function getTradingBotDirectExecutionStatus(
  env: Env,
  input: {
    executionKind: "swap" | "withdrawal";
    executionId: string;
    referenceSubject: string;
    telegramUserId: string;
    userPublicKey: string;
    successEventType: "swap_executed" | "withdrawal_executed";
    failureEventType: "swap_execution_failed" | "withdrawal_execution_failed";
    eventMetadata: Record<string, unknown>;
  },
): Promise<Response> {
  const required: string[] = [];
  if (!env.TRADING_BOT_ACCOUNTS) required.push("TRADING_BOT_ACCOUNTS");
  const privyConfig = resolvePrivyConfig(env);
  if (!privyConfig) required.push("PRIVY_APP_ID", "PRIVY_APP_SECRET");
  if (required.length > 0 || !privyConfig) {
    return json(
      { status: "not_configured", required: Array.from(new Set(required)) },
      { status: 503 },
    );
  }

  const accountResult = await getStoredTradingBotAccount(
    env,
    input.telegramUserId,
  );
  if ("error" in accountResult) {
    return json(
      { status: "lookup_error", error: accountResult.error },
      { status: accountResult.status ?? 503 },
    );
  }
  const account = accountResult.account;
  const spotWallet = account ? spotNftPrivyWallet(account) : null;
  if (!spotWallet?.privyWalletId) {
    return json(
      {
        status: "not_executable",
        error: "Execution status requires Spot & NFT Wallet (Privy)",
      },
      { status: 409 },
    );
  }
  if (spotWallet.solanaWalletAddress !== input.userPublicKey) {
    return json(
      { status: "mismatch", error: "Trading wallet mismatch" },
      { status: 409 },
    );
  }

  const referenceId = await tradingBotExecutionReferenceId(
    input.telegramUserId,
    input.referenceSubject,
  );
  const checkedAtDate = new Date();
  const checkedAt = checkedAtDate.toISOString();
  const reconciliationState = await getTradingBotDirectReconciliationState(
    env,
    input.telegramUserId,
    referenceId,
  );
  let transaction: PrivyTransaction | null;
  try {
    transaction = await getPrivyTransactionByReferenceId(
      privyConfig,
      referenceId,
    );
  } catch (error) {
    console.warn("[trading-bot] Direct execution status lookup failed", error);
    const manualReview = withTradingBotManualReview(
      reconciliationState,
      env,
      reconciliationState.executionStartedAt,
      checkedAtDate,
      "lookup_error",
    );
    await recordTradingBotManualReviewRequired(env, {
      telegramUserId: input.telegramUserId,
      executionKind: input.executionKind,
      executionId: input.executionId,
      referenceId,
      executionStartedAt: reconciliationState.executionStartedAt,
      state: manualReview,
    });
    return json(
      {
        status: "lookup_error",
        executionKind: input.executionKind,
        executionId: input.executionId,
        referenceId,
        checkedAt,
        executionStartedAt: reconciliationState.executionStartedAt ?? null,
        ...tradingBotManualReviewResponse(manualReview),
        error:
          "Privy execution status is temporarily unavailable. Do not resend the original execution request.",
      },
      { status: 503 },
    );
  }

  if (!transaction) {
    const manualReview = withTradingBotManualReview(
      reconciliationState,
      env,
      reconciliationState.executionStartedAt,
      checkedAtDate,
      "not_found",
    );
    await recordTradingBotManualReviewRequired(env, {
      telegramUserId: input.telegramUserId,
      executionKind: input.executionKind,
      executionId: input.executionId,
      referenceId,
      executionStartedAt: reconciliationState.executionStartedAt,
      state: manualReview,
    });
    return json({
      status: "not_found",
      executionKind: input.executionKind,
      executionId: input.executionId,
      referenceId,
      checkedAt,
      executionStartedAt: reconciliationState.executionStartedAt ?? null,
      ...tradingBotManualReviewResponse(manualReview),
      error:
        "Privy has not returned a transaction for this reference yet. Do not resend the original execution request.",
    });
  }

  if (
    transaction.wallet_id !== spotWallet.privyWalletId ||
    transaction.caip2 !== SOLANA_MAINNET_CAIP2
  ) {
    const manualReview = withTradingBotManualReview(
      reconciliationState,
      env,
      reconciliationState.executionStartedAt,
      checkedAtDate,
      "wallet_or_chain_mismatch",
    );
    await recordTradingBotManualReviewRequired(env, {
      telegramUserId: input.telegramUserId,
      executionKind: input.executionKind,
      executionId: input.executionId,
      referenceId,
      executionStartedAt: reconciliationState.executionStartedAt,
      state: manualReview,
    });
    return json(
      {
        status: "mismatch",
        executionKind: input.executionKind,
        executionId: input.executionId,
        referenceId,
        checkedAt,
        executionStartedAt: reconciliationState.executionStartedAt ?? null,
        ...tradingBotManualReviewResponse(manualReview),
        error:
          "Privy transaction does not match the stored wallet and Solana chain",
      },
      { status: 409 },
    );
  }

  const resolvedReferenceId = transaction.reference_id ?? referenceId;
  const signature = transaction.transaction_hash;
  const common = {
    executionKind: input.executionKind,
    executionId: input.executionId,
    providerStatus: transaction.status,
    transactionId: transaction.id,
    referenceId: resolvedReferenceId,
    signature,
    solscanUrl: signature ? `https://solscan.io/tx/${signature}` : null,
    checkedAt,
    executionStartedAt: reconciliationState.executionStartedAt ?? null,
  };

  if (
    transaction.status === "confirmed" ||
    transaction.status === "finalized"
  ) {
    if (!signature) {
      const manualReview = withTradingBotManualReview(
        reconciliationState,
        env,
        reconciliationState.executionStartedAt,
        checkedAtDate,
        `${transaction.status}_without_signature`,
      );
      await recordTradingBotManualReviewRequired(env, {
        telegramUserId: input.telegramUserId,
        executionKind: input.executionKind,
        executionId: input.executionId,
        referenceId,
        executionStartedAt: reconciliationState.executionStartedAt,
        state: manualReview,
      });
      return json({
        status: "pending",
        ...common,
        ...tradingBotManualReviewResponse(manualReview),
        error:
          "Privy reports success but has not returned a transaction hash yet.",
      });
    }
    await recordTradingBotAccountEvent(env, input.telegramUserId, {
      eventId: referenceId,
      eventType: input.successEventType,
      metadata: {
        ...input.eventMetadata,
        reconciliation: true,
        providerStatus: transaction.status,
        signature,
        transactionId: transaction.id,
        referenceId: resolvedReferenceId,
        solscanUrl: `https://solscan.io/tx/${signature}`,
        executedAt: checkedAt,
      },
    });
    await resolveTradingBotManualReviewCaseFromTerminalEvidence(env, {
      referenceId,
      resolution: "executed",
      providerStatus: transaction.status,
      signature,
      transactionId: transaction.id,
      checkedAt,
    });
    return json({
      status: "executed",
      ...common,
      ...tradingBotManualReviewResponse(),
      executedAt: checkedAt,
    });
  }

  if (
    transaction.status === "execution_reverted" ||
    transaction.status === "failed" ||
    transaction.status === "provider_error" ||
    transaction.status === "replaced"
  ) {
    const error = `Privy transaction ended with ${transaction.status}`;
    await recordTradingBotAccountEvent(env, input.telegramUserId, {
      eventId: referenceId,
      eventType: input.failureEventType,
      metadata: {
        ...input.eventMetadata,
        reconciliation: true,
        providerStatus: transaction.status,
        signature,
        transactionId: transaction.id,
        referenceId: resolvedReferenceId,
        reason: error,
        checkedAt,
      },
    });
    await resolveTradingBotManualReviewCaseFromTerminalEvidence(env, {
      referenceId,
      resolution: "failed",
      providerStatus: transaction.status,
      signature,
      transactionId: transaction.id,
      checkedAt,
    });
    return json({
      status: "failed",
      ...common,
      ...tradingBotManualReviewResponse(),
      error,
    });
  }

  const manualReview = withTradingBotManualReview(
    reconciliationState,
    env,
    reconciliationState.executionStartedAt,
    checkedAtDate,
    transaction.status,
  );
  await recordTradingBotManualReviewRequired(env, {
    telegramUserId: input.telegramUserId,
    executionKind: input.executionKind,
    executionId: input.executionId,
    referenceId,
    executionStartedAt: reconciliationState.executionStartedAt,
    state: manualReview,
  });
  return json({
    status: "pending",
    ...common,
    ...tradingBotManualReviewResponse(manualReview),
    error: "Privy has not reached a terminal transaction state yet.",
  });
}

async function buildTradingBotSwap(
  swap: NormalizedTradingBotSwap,
  requestUrl: string,
  env: Env,
): Promise<Response> {
  const swapRequest = new Request(requestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userPubkey: swap.userPublicKey,
      inMint: swap.inMint,
      outMint: swap.outMint,
      amountIn: swap.amountIn,
      slippageBps: swap.slippageBps,
      priorityFee: swap.priorityFee,
    }),
  });

  return postSwap(swapRequest, env);
}

async function getStoredTradingBotAccount(
  env: Env,
  telegramUserId: string,
): Promise<
  | { account: TradingBotAccountSnapshot | null }
  | { error: string; status?: number }
> {
  const store = tradingBotAccountStore(env, telegramUserId);
  if (!store) {
    return { error: "Trading account storage is not configured", status: 503 };
  }

  const response = await store.fetch(
    new Request(
      `https://trading-bot-account.local/account?telegramUserId=${telegramUserId}`,
    ),
  );
  const data = (await response.json()) as {
    status?: string;
    account?: TradingBotAccountSnapshot;
    error?: string;
  };

  if (response.status === 404 || data.status === "not_found") {
    return { account: null };
  }
  if (!response.ok || data.error) {
    return {
      error: data.error ?? "Trading account storage unavailable",
      status: response.status,
    };
  }

  return { account: data.account ?? null };
}

export async function getManagedPrivyWallet(
  env: Env,
  telegramUserId: string,
  walletAddress: string,
): Promise<
  | { wallet: ManagedPrivyWallet }
  | { error: string; status: number; code?: string }
> {
  const accountResult = await getStoredTradingBotAccount(env, telegramUserId);
  if ("error" in accountResult) {
    return {
      error: accountResult.error,
      status: accountResult.status ?? 503,
    };
  }
  const account = accountResult.account;
  if (!account) {
    return { error: "Trading account not found", status: 404 };
  }
  if (account.botAccessRevokedAt) {
    return { error: "FTX bot access has been revoked", status: 409 };
  }
  const wallet = account.wallets.find(
    (entry) =>
      entry.role === "spot_nft" &&
      entry.solanaWalletAddress === walletAddress,
  );
  if (
    !wallet ||
    wallet.walletSource !== "privy" ||
    !wallet.privyWalletId
  ) {
    return {
      error: "Spot and NFT trading requires Spot & NFT Wallet (Privy)",
      status: 409,
    };
  }

  const config = resolvePrivyConfig(env);
  if (!config || !signerConfigured(config)) {
    return {
      error: "Ribbot automation signer is not configured",
      status: 503,
    };
  }

  let privyWallet: PrivyWallet;
  try {
    privyWallet = await getPrivyWallet(config, wallet.privyWalletId);
  } catch {
    return {
      error: "Privy wallet verification is temporarily unavailable",
      status: 503,
    };
  }
  if (
    privyWallet.id !== wallet.privyWalletId ||
    privyWallet.address !== wallet.solanaWalletAddress ||
    privyWallet.chain_type !== "solana"
  ) {
    return {
      error: "Stored Spot & NFT wallet does not match Privy",
      status: 409,
    };
  }
  if (!hasConfiguredAutomationSigner(privyWallet, config)) {
    return {
      error: "Ribbot access is not enabled for Spot & NFT Wallet (Privy)",
      status: 409,
      code: "RIBBOT_ACCESS_REQUIRED",
    };
  }
  return {
    wallet: {
      walletId: wallet.privyWalletId,
      walletAddress: wallet.solanaWalletAddress,
      label: wallet.label,
    },
  };
}

export function managedSolanaExecutionMissingRequirements(env: Env): string[] {
  const required: string[] = [];
  if (!env.TRADING_BOT_ACCOUNTS) required.push("TRADING_BOT_ACCOUNTS");
  const config = resolvePrivyConfig(env);
  if (!config) {
    required.push("PRIVY_APP_ID", "PRIVY_APP_SECRET");
  } else if (!signerConfigured(config)) {
    required.push(
      "PRIVY_AUTHORIZATION_KEY_ID",
      "PRIVY_AUTHORIZATION_PRIVATE_KEY",
    );
  }
  return Array.from(new Set(required));
}

export async function signAndSendManagedSolanaTransaction(
  env: Env,
  input: {
    walletId: string;
    transactionBase64: string;
    referenceId: string;
  },
): Promise<ManagedSolanaExecution> {
  const config = resolvePrivyConfig(env);
  if (!config || !signerConfigured(config)) {
    throw new Error("Privy managed-wallet signer is not configured");
  }
  const execution = await privySignAndSendSolanaTransaction(config, {
    ...input,
    sponsor: boolFlag(env.TRADING_BOT_SOLANA_GAS_SPONSORSHIP_ENABLED),
  });
  return {
    signature: execution.data?.hash ?? null,
    transactionId: execution.data?.transaction_id ?? null,
    referenceId: execution.data?.reference_id ?? input.referenceId,
    caip2: execution.data?.caip2 ?? SOLANA_MAINNET_CAIP2,
  };
}

export async function getManagedSolanaTransactionStatus(
  env: Env,
  referenceId: string,
): Promise<ManagedSolanaTransactionStatus | null> {
  const config = resolvePrivyConfig(env);
  if (!config) {
    throw new Error("Privy managed-wallet service is not configured");
  }
  const transaction = await getPrivyTransactionByReferenceId(
    config,
    referenceId,
  );
  if (!transaction) return null;
  return {
    walletId: transaction.wallet_id,
    status: transaction.status,
    signature: transaction.transaction_hash,
    transactionId: transaction.id,
    referenceId: transaction.reference_id ?? referenceId,
    caip2: transaction.caip2,
  };
}

async function privySignAndSendSolanaTransaction(
  config: PrivyConfig,
  input: {
    walletId: string;
    transactionBase64: string;
    referenceId: string;
    sponsor: boolean;
  },
): Promise<PrivySolanaSignAndSendResponse> {
  const path = `/wallets/${encodeURIComponent(input.walletId)}/rpc`;
  const url = `${config.apiBaseUrl}${path}`;
  const body = {
    method: "signAndSendTransaction",
    caip2: SOLANA_MAINNET_CAIP2,
    sponsor: input.sponsor,
    reference_id: input.referenceId,
    params: {
      transaction: input.transactionBase64,
      encoding: "base64",
    },
  };
  const requestExpiry = String(Date.now() + 2 * 60 * 1000);
  const signedHeaders = {
    "privy-app-id": config.appId,
    "privy-idempotency-key": input.referenceId,
    "privy-request-expiry": requestExpiry,
  };
  let authorizationSignature: string;
  try {
    authorizationSignature = await generatePrivyAuthorizationSignature(config, {
      url,
      method: "POST",
      headers: signedHeaders,
      body,
    });
  } catch (error) {
    throw new PrivyWalletRpcError(
      0,
      "authorization",
      readPrivyAuthorizationErrorCode(error),
    );
  }

  const headers = new Headers({
    "Content-Type": "application/json",
    "privy-app-id": config.appId,
    "privy-idempotency-key": input.referenceId,
    "privy-request-expiry": requestExpiry,
    "privy-authorization-signature": authorizationSignature,
    Authorization: `Basic ${encodeBasicAuth(config)}`,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    throw new PrivyWalletRpcError(0, "transport");
  }
  if (!response.ok) {
    throw new PrivyWalletRpcError(
      response.status,
      "http",
      await readPrivyErrorCode(response),
    );
  }

  return (await response.json()) as PrivySolanaSignAndSendResponse;
}

async function readPrivyErrorCode(response: Response): Promise<string | null> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const nestedError =
    record.error &&
    typeof record.error === "object" &&
    !Array.isArray(record.error)
      ? (record.error as Record<string, unknown>)
      : null;
  const candidates = [
    nestedError?.code,
    nestedError?.error_code,
    nestedError?.type,
    record.code,
    record.error_code,
    typeof record.error === "string" ? record.error : null,
  ];
  for (const candidate of candidates) {
    if (
      typeof candidate === "string" &&
      /^[a-z][a-z0-9_-]{0,127}$/i.test(candidate)
    ) {
      return candidate.toLowerCase();
    }
  }
  return null;
}

function readPrivyAuthorizationErrorCode(error: unknown): string {
  if (!(error instanceof Error)) {
    return "authorization_signature_generation_failed";
  }
  if (error.message === "Invalid wallet authorization private key") {
    return "invalid_authorization_private_key";
  }
  if (
    error.message === "Failed to serialize request for authorization signature"
  ) {
    return "authorization_serialization_failed";
  }
  if (
    error instanceof ReferenceError &&
    /\bBuffer\b.*\bnot defined\b/i.test(error.message)
  ) {
    return "authorization_runtime_incompatible";
  }
  return "authorization_signature_generation_failed";
}

async function buildTradingBotWithdrawalTransaction(
  withdrawal: NormalizedTradingBotWithdrawal,
  env: Env,
): Promise<TradingBotWithdrawalBuildResult> {
  const rpcUrl = resolveRpcUrl(env);
  if (!rpcUrl) {
    throw new TradingBotExecutionError("SOLANA_RPC_URL is required", 503);
  }

  const commitment = env.SOLANA_COMMITMENT?.trim() || "confirmed";
  const owner = new PublicKey(withdrawal.userPublicKey);
  const destination = new PublicKey(withdrawal.destinationAddress);
  const recentBlockhash = await getRecentBlockhash(rpcUrl, commitment);
  const transaction = new Transaction({
    feePayer: owner,
    recentBlockhash,
  });

  if (withdrawal.assetType === "sol") {
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: owner,
        toPubkey: destination,
        lamports: integerStringToSafeNumber(withdrawal.amountIn, "amountIn"),
      }),
    );

    return {
      txBase64: serializeUnsignedSolanaTransaction(transaction),
      recentBlockhash,
    };
  }

  const mint = new PublicKey(withdrawal.mint);
  const amount = BigInt(withdrawal.amountIn);
  const sourceTokenAccount = await findWithdrawalSourceTokenAccount(
    rpcUrl,
    withdrawal.userPublicKey,
    withdrawal.mint,
    amount,
    commitment,
  );
  const destinationTokenAccount = getAssociatedTokenAddressSync(
    mint,
    destination,
    true,
  );
  const destinationAccount = await rpcRequest<AccountInfoRpcResult>(
    rpcUrl,
    "getAccountInfo",
    [destinationTokenAccount.toBase58(), { encoding: "base64", commitment }],
  );
  const createdDestinationTokenAccount = !destinationAccount.result?.value;
  if (createdDestinationTokenAccount) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        owner,
        destinationTokenAccount,
        destination,
        mint,
      ),
    );
  }

  transaction.add(
    createTransferCheckedInstruction(
      new PublicKey(sourceTokenAccount.pubkey),
      mint,
      destinationTokenAccount,
      owner,
      amount,
      sourceTokenAccount.decimals,
    ),
  );

  return {
    txBase64: serializeUnsignedSolanaTransaction(transaction),
    recentBlockhash,
    sourceTokenAccount: sourceTokenAccount.pubkey,
    destinationTokenAccount: destinationTokenAccount.toBase58(),
    createdDestinationTokenAccount,
  };
}

async function getRecentBlockhash(
  rpcUrl: string,
  commitment: string,
): Promise<string> {
  const blockhash = await rpcRequest<LatestBlockhashRpcResult>(
    rpcUrl,
    "getLatestBlockhash",
    [{ commitment }],
  );
  const value = blockhash.result?.value?.blockhash;
  if (!value) {
    throw new TradingBotExecutionError(
      "Solana RPC did not return a blockhash",
      502,
    );
  }
  return value;
}

async function findWithdrawalSourceTokenAccount(
  rpcUrl: string,
  owner: string,
  mint: string,
  amount: bigint,
  commitment: string,
): Promise<TransferSourceTokenAccount> {
  const accounts = await rpcRequest<TokenAccountRpcResult>(
    rpcUrl,
    "getTokenAccountsByOwner",
    [owner, { mint }, { encoding: "jsonParsed", commitment }],
  );
  const candidates = (accounts.result?.value ?? [])
    .map((entry): TransferSourceTokenAccount | null => {
      const tokenAmount = entry.account?.data?.parsed?.info?.tokenAmount;
      const rawAmount = tokenAmount?.amount;
      const decimals = tokenAmount?.decimals;
      if (
        !entry.pubkey ||
        !rawAmount ||
        decimals === undefined ||
        !/^\d+$/.test(rawAmount)
      ) {
        return null;
      }
      return {
        pubkey: entry.pubkey,
        decimals,
        amount: BigInt(rawAmount),
      };
    })
    .filter((entry): entry is TransferSourceTokenAccount => Boolean(entry))
    .filter((entry) => entry.amount >= amount)
    .sort((a, b) => (a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1));

  const source = candidates[0];
  if (!source) {
    throw new TradingBotExecutionError(
      "No source token account has enough balance for this withdrawal",
    );
  }
  return source;
}

function serializeUnsignedSolanaTransaction(transaction: Transaction): string {
  const serialized = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  return bytesToBase64(serialized);
}

function integerStringToSafeNumber(value: string, field: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new TradingBotExecutionError(
      `${field} must be a positive integer string`,
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TradingBotExecutionError(
      `${field} exceeds the supported safe integer range`,
    );
  }
  return parsed;
}

async function generatePrivyAuthorizationSignature(
  config: PrivyConfig,
  request: {
    url: string;
    method: "POST" | "PUT" | "PATCH" | "DELETE";
    headers: {
      "privy-app-id": string;
      "privy-idempotency-key"?: string;
      "privy-request-expiry"?: string;
    };
    body: unknown;
  },
): Promise<string> {
  if (!config.authorizationPrivateKey) {
    throw new Error("Privy authorization private key is not configured");
  }
  return generateAuthorizationSignature({
    authorizationPrivateKey: normalizePrivateKeyBase64(
      config.authorizationPrivateKey,
    ),
    input: {
      version: 1,
      method: request.method,
      url: request.url,
      body: request.body,
      headers: request.headers,
    },
  });
}

function normalizePrivateKeyBase64(value: string): string {
  return value
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function bytesToBase64(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value));
}

function tradingBotExecutionMissingRequirements(env: Env): string[] {
  const required: string[] = [];
  if (!boolFlag(env.TRADING_BOT_LIVE_EXECUTION_ENABLED)) {
    required.push("TRADING_BOT_LIVE_EXECUTION_ENABLED");
  }
  if (!env.TRADING_BOT_ACCOUNTS) required.push("TRADING_BOT_ACCOUNTS");
  const privyConfig = resolvePrivyConfig(env);
  if (!privyConfig) {
    required.push("PRIVY_APP_ID", "PRIVY_APP_SECRET");
  } else if (!signerConfigured(privyConfig)) {
    required.push(
      "PRIVY_AUTHORIZATION_KEY_ID",
      "PRIVY_AUTHORIZATION_PRIVATE_KEY",
    );
  }
  return Array.from(new Set(required));
}

function tradingBotScheduledExecutionMissingRequirements(env: Env): string[] {
  const required = tradingBotExecutionMissingRequirements(env);
  if (!boolFlag(env.TRADING_BOT_SCHEDULER_LIVE_EXECUTION_ENABLED)) {
    required.push("TRADING_BOT_SCHEDULER_LIVE_EXECUTION_ENABLED");
  }
  if (!resolveTradingBotToken(env)) {
    required.push("RIBBOT_TRADING_BOT_TOKEN");
  }
  return Array.from(new Set(required));
}

function tradingBotWithdrawalExecutionMissingRequirements(env: Env): string[] {
  const required = tradingBotExecutionMissingRequirements(env);
  if (!resolveRpcUrl(env)) required.push("SOLANA_RPC_URL");
  return Array.from(new Set(required));
}

function tradingBotBundleBuyExecutionMissingRequirements(env: Env): string[] {
  const required = tradingBotExecutionMissingRequirements(env);
  if (!boolFlag(env.TRADING_BOT_BUNDLE_BUY_LIVE_EXECUTION_ENABLED)) {
    required.push("TRADING_BOT_BUNDLE_BUY_LIVE_EXECUTION_ENABLED");
  }
  if (!resolveRpcUrl(env)) required.push("SOLANA_RPC_URL");
  return Array.from(new Set(required));
}

function isTradingBotLiveExecutionEnabled(env: Env): boolean {
  return boolFlag(env.TRADING_BOT_LIVE_EXECUTION_ENABLED);
}

function isTradingBotSchedulerEnabled(env: Env): boolean {
  return boolFlag(env.TRADING_BOT_SCHEDULER_ENABLED);
}

function isTradingBotSchedulerLiveExecutionEnabled(env: Env): boolean {
  return boolFlag(env.TRADING_BOT_SCHEDULER_LIVE_EXECUTION_ENABLED);
}

function isTradingBotAdvancedMonitorEnabled(env: Env): boolean {
  return boolFlag(env.TRADING_BOT_ADVANCED_MONITOR_ENABLED);
}

function isTradingBotCopyTradeMonitorEnabled(env: Env): boolean {
  return boolFlag(env.TRADING_BOT_COPYTRADE_MONITOR_ENABLED);
}

function isTradingBotCopyTradeLiveExecutionEnabled(env: Env): boolean {
  return boolFlag(env.TRADING_BOT_COPYTRADE_LIVE_EXECUTION_ENABLED);
}

function isTradingBotSniperMonitorEnabled(env: Env): boolean {
  return boolFlag(env.TRADING_BOT_SNIPER_MONITOR_ENABLED);
}

function isTradingBotSniperLiveExecutionEnabled(env: Env): boolean {
  return boolFlag(env.TRADING_BOT_SNIPER_LIVE_EXECUTION_ENABLED);
}

function isTradingBotAutoBuyMonitorEnabled(env: Env): boolean {
  return boolFlag(env.TRADING_BOT_AUTO_BUY_MONITOR_ENABLED);
}

function isTradingBotAutoBuyLiveExecutionEnabled(env: Env): boolean {
  return boolFlag(env.TRADING_BOT_AUTO_BUY_LIVE_EXECUTION_ENABLED);
}

function isTradingBotBundleBuyLiveExecutionEnabled(env: Env): boolean {
  return boolFlag(env.TRADING_BOT_BUNDLE_BUY_LIVE_EXECUTION_ENABLED);
}

function isTradingBotAutoSellMonitorEnabled(env: Env): boolean {
  return boolFlag(env.TRADING_BOT_AUTO_SELL_MONITOR_ENABLED);
}

function isTradingBotAutoSellLiveExecutionEnabled(env: Env): boolean {
  return boolFlag(env.TRADING_BOT_AUTO_SELL_LIVE_EXECUTION_ENABLED);
}

async function tradingBotExecutionReferenceId(
  telegramUserId: string,
  orderId: string,
): Promise<string> {
  const raw = `ribbot-${telegramUserId}-${orderId}`;
  if (raw.length <= 64) return raw;

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `ribbot-${hex.slice(0, 57)}`;
}

async function tradingBotLifecycleEventId(
  scope: string,
  subject: string,
): Promise<string> {
  const raw = `${scope}:${subject}`;
  if (raw.length <= 64 && TRADING_BOT_EXECUTION_REFERENCE_PATTERN.test(raw)) {
    return raw;
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const prefix = scope.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 20);
  return `${prefix}:${hex.slice(0, 63 - prefix.length)}`;
}

async function advancedAutomationExecutionId(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
  evaluation: TradingBotAdvancedAutomationMonitorEvaluation,
): Promise<string | null> {
  const prefix =
    config.kind === "copytrade"
      ? "copytrade"
      : config.kind === "sniper"
        ? "sniper"
        : config.kind === "auto_buy"
          ? "auto_buy"
          : config.kind === "auto_sell"
            ? "auto_sell"
            : null;
  if (!prefix) return null;

  if (config.kind !== "copytrade" && config.kind !== "sniper") {
    const raw = `${prefix}:${config.configId}`;
    if (raw.length <= 64) return raw;
  }

  const subject =
    config.kind === "copytrade"
      ? `${config.configId}:${evaluation.observedSignature ?? ""}`
      : config.kind === "sniper"
        ? `${config.configId}:${evaluation.observedSignature ?? evaluation.observedMint ?? ""}`
        : config.configId;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${prefix}:${subject}`),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${prefix}:${hex.slice(0, 64 - prefix.length - 1)}`;
}

function boolFlag(value?: string): boolean {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

function normalizeTradingBotSwap(
  body: TradingBotSwapBody,
): { normalized: NormalizedTradingBotSwap } | { error: string } {
  const telegramUserId = stringValue(body.telegramUserId);
  const userPublicKey = stringValue(body.userPublicKey);
  const inMint = stringValue(body.inMint);
  const outMint = stringValue(body.outMint);
  const amountIn = stringValue(body.amountIn);
  const slippageBps = numberValue(body.slippageBps);
  const priorityFee = numberValue(body.priorityFee);

  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return { error: "telegramUserId is required" };
  }
  if (!userPublicKey || !SOLANA_ADDRESS_PATTERN.test(userPublicKey)) {
    return { error: "userPublicKey must be a Solana address" };
  }
  if (!inMint || !SOLANA_ADDRESS_PATTERN.test(inMint)) {
    return { error: "inMint must be a Solana mint" };
  }
  if (!outMint || !SOLANA_ADDRESS_PATTERN.test(outMint)) {
    return { error: "outMint must be a Solana mint" };
  }
  if (inMint === outMint) {
    return { error: "inMint and outMint must differ" };
  }
  if (!amountIn || !/^[1-9]\d*$/.test(amountIn)) {
    return { error: "amountIn must be a positive integer string" };
  }
  if (
    slippageBps === undefined ||
    !Number.isInteger(slippageBps) ||
    slippageBps < 0 ||
    slippageBps > 10_000
  ) {
    return { error: "slippageBps must be an integer from 0 to 10000" };
  }
  if (
    priorityFee === undefined ||
    !Number.isInteger(priorityFee) ||
    priorityFee < 0
  ) {
    return { error: "priorityFee must be a non-negative integer" };
  }

  return {
    normalized: {
      telegramUserId,
      userPublicKey,
      inMint,
      outMint,
      amountIn,
      slippageBps,
      priorityFee,
    },
  };
}

function normalizeTradingBotExecution(
  body: TradingBotExecutionBody,
): { normalized: NormalizedTradingBotExecution } | { error: string } {
  const result = normalizeTradingBotSwap(body);
  if ("error" in result) return result;
  const orderId = stringValue(body.orderId);
  const executionMode = stringValue(body.executionMode);
  if (!orderId || !TRADING_BOT_EXECUTION_REFERENCE_PATTERN.test(orderId)) {
    return { error: "orderId is required" };
  }
  if (executionMode && executionMode !== "instant_auto_buy") {
    return { error: "executionMode must be instant_auto_buy" };
  }
  return {
    normalized: {
      ...result.normalized,
      orderId,
      ...(executionMode === "instant_auto_buy" ? { executionMode } : {}),
    },
  };
}

function normalizeTradingBotOrder(
  body: TradingBotOrderValidationBody,
): { normalized: NormalizedTradingBotOrder } | { error: string } {
  const telegramUserId = stringValue(body.telegramUserId);
  const userPublicKey = stringValue(body.userPublicKey);
  const kind = orderKindValue(body.kind);
  const side = orderSideValue(body.side);
  const mint = stringValue(body.mint);
  const inMint = stringValue(body.inMint);
  const outMint = stringValue(body.outMint);
  const amountIn = stringValue(body.amountIn);
  const amountLabel = stringValue(body.amountLabel);
  const slippageBps = numberValue(body.slippageBps);
  const priorityFee = numberValue(body.priorityFee ?? body.priorityFeeLamports);
  const trailingBps = numberValue(body.trailingBps);

  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return { error: "telegramUserId is required" };
  }
  if (!userPublicKey || !SOLANA_ADDRESS_PATTERN.test(userPublicKey)) {
    return { error: "userPublicKey must be a Solana address" };
  }
  if (!kind) {
    return { error: "kind must be limit, dca, stop, or trailing" };
  }
  if (!side) {
    return { error: "side must be buy or sell" };
  }
  if (!mint || !SOLANA_ADDRESS_PATTERN.test(mint)) {
    return { error: "mint must be a Solana mint" };
  }
  if (!inMint || !SOLANA_ADDRESS_PATTERN.test(inMint)) {
    return { error: "inMint must be a Solana mint" };
  }
  if (!outMint || !SOLANA_ADDRESS_PATTERN.test(outMint)) {
    return { error: "outMint must be a Solana mint" };
  }
  if (inMint === outMint) {
    return { error: "inMint and outMint must differ" };
  }
  if (side === "buy" && (inMint !== WRAPPED_SOL_MINT || outMint !== mint)) {
    return { error: "buy orders must route SOL into the token mint" };
  }
  if (side === "sell" && (inMint !== mint || outMint !== WRAPPED_SOL_MINT)) {
    return { error: "sell orders must route the token mint into SOL" };
  }
  if (!amountIn || !/^[1-9]\d*$/.test(amountIn)) {
    return { error: "amountIn must be a positive integer string" };
  }
  if (
    slippageBps === undefined ||
    !Number.isInteger(slippageBps) ||
    slippageBps < 0 ||
    slippageBps > 10_000
  ) {
    return { error: "slippageBps must be an integer from 0 to 10000" };
  }
  if (
    priorityFee === undefined ||
    !Number.isInteger(priorityFee) ||
    priorityFee < 0
  ) {
    return { error: "priorityFee must be a non-negative integer" };
  }

  const shared: Omit<
    NormalizedTradingBotOrder,
    | "kind"
    | "triggerPrice"
    | "triggerDirection"
    | "orderCount"
    | "intervalMinutes"
    | "perOrderAmountIn"
    | "trailingBps"
  > = {
    telegramUserId,
    userPublicKey,
    side,
    mint,
    inMint,
    outMint,
    amountIn,
    slippageBps,
    priorityFee,
  };
  if (amountLabel) {
    shared.amountLabel = amountLabel;
  }

  if (kind === "limit" || kind === "stop") {
    const triggerPrice = decimalStringValue(body.triggerPrice);
    const triggerDirection = triggerDirectionValue(body.triggerDirection);
    if (!triggerPrice) {
      return { error: "triggerPrice must be a positive decimal string" };
    }
    if (!triggerDirection) {
      return { error: "triggerDirection must be above or below" };
    }
    if (kind === "stop" && side !== "sell") {
      return { error: "stop orders must be sell orders" };
    }
    if (kind === "stop" && triggerDirection !== "below") {
      return { error: "stop-loss orders must trigger below a price" };
    }

    return {
      normalized: {
        ...shared,
        kind,
        triggerPrice,
        triggerDirection,
      },
    };
  }

  if (kind === "trailing") {
    if (side !== "sell") {
      return { error: "trailing stop orders must be sell orders" };
    }
    if (
      trailingBps === undefined ||
      !Number.isInteger(trailingBps) ||
      trailingBps < 1 ||
      trailingBps > 10_000
    ) {
      return { error: "trailingBps must be an integer from 1 to 10000" };
    }

    return {
      normalized: {
        ...shared,
        kind,
        trailingBps,
      },
    };
  }

  const orderCount = numberValue(body.orderCount);
  const intervalMinutes = numberValue(body.intervalMinutes);
  if (
    orderCount === undefined ||
    !Number.isInteger(orderCount) ||
    orderCount < 2 ||
    orderCount > 100
  ) {
    return { error: "orderCount must be an integer from 2 to 100" };
  }
  if (
    intervalMinutes === undefined ||
    !Number.isInteger(intervalMinutes) ||
    intervalMinutes < 1 ||
    intervalMinutes > 10_080
  ) {
    return { error: "intervalMinutes must be an integer from 1 to 10080" };
  }

  const perOrderAmountIn = (BigInt(amountIn) / BigInt(orderCount)).toString();
  if (perOrderAmountIn === "0") {
    return { error: "amountIn is too small for orderCount" };
  }

  return {
    normalized: {
      ...shared,
      kind,
      orderCount,
      intervalMinutes,
      perOrderAmountIn,
    },
  };
}

function orderValidationWarnings(
  order: NormalizedTradingBotOrder,
  schedulerEnabled = false,
): string[] {
  const warnings = schedulerEnabled
    ? [
        "FTX/FrogX scheduler can evaluate this staged order, but live execution still requires explicit live scheduler and signer gates.",
      ]
    : ["Validation only: scheduled execution is not enabled in FTX/FrogX yet."];

  if (order.kind === "limit") {
    warnings.push(
      schedulerEnabled
        ? "Limit trigger uses Jupiter Price V3 USD prices while the scheduler is enabled."
        : "Limit trigger is staged as a user-defined threshold; no price monitor was started.",
    );
  }
  if (order.kind === "dca") {
    warnings.push(
      schedulerEnabled
        ? "DCA schedule is persisted for interval evaluation by the scheduler."
        : "DCA schedule is staged only; no timer was started.",
    );
  }
  if (order.kind === "stop") {
    warnings.push(
      schedulerEnabled
        ? "Stop-loss trigger uses Jupiter Price V3 USD prices while the scheduler is enabled."
        : "Stop-loss trigger is staged only; no price monitor was started.",
    );
  }
  if (order.kind === "trailing") {
    warnings.push(
      schedulerEnabled
        ? "Trailing stop peak tracking is persisted by the FTX scheduler."
        : "Trailing stop is staged only; no peak price tracker or execution monitor was started.",
    );
  }

  return warnings;
}

function normalizeTradingBotWithdrawal(
  body: TradingBotWithdrawalValidationBody,
): { normalized: NormalizedTradingBotWithdrawal } | { error: string } {
  const telegramUserId = stringValue(body.telegramUserId);
  const userPublicKey = stringValue(body.userPublicKey);
  const mint = stringValue(body.mint);
  const amountIn = stringValue(body.amountIn);
  const amountLabel = stringValue(body.amountLabel);
  const destinationAddress = stringValue(body.destinationAddress);

  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return { error: "telegramUserId is required" };
  }
  if (!userPublicKey || !SOLANA_ADDRESS_PATTERN.test(userPublicKey)) {
    return { error: "userPublicKey must be a Solana address" };
  }
  if (!mint || !SOLANA_ADDRESS_PATTERN.test(mint)) {
    return { error: "mint must be a Solana mint" };
  }
  if (!amountIn || !/^[1-9]\d*$/.test(amountIn)) {
    return { error: "amountIn must be a positive integer string" };
  }
  if (!destinationAddress || !SOLANA_ADDRESS_PATTERN.test(destinationAddress)) {
    return { error: "destinationAddress must be a Solana address" };
  }
  if (destinationAddress === userPublicKey) {
    return { error: "destinationAddress must differ from userPublicKey" };
  }

  const normalized: NormalizedTradingBotWithdrawal = {
    telegramUserId,
    userPublicKey,
    mint,
    amountIn,
    destinationAddress,
    assetType: mint === WRAPPED_SOL_MINT ? "sol" : "spl",
  };
  if (amountLabel) {
    normalized.amountLabel = amountLabel;
  }

  return { normalized };
}

function normalizeTradingBotWithdrawalExecution(
  body: TradingBotWithdrawalExecutionBody,
): { normalized: NormalizedTradingBotWithdrawalExecution } | { error: string } {
  const result = normalizeTradingBotWithdrawal(body);
  if ("error" in result) return result;

  const withdrawalId = stringValue(body.withdrawalId);
  if (
    !withdrawalId ||
    !TRADING_BOT_EXECUTION_REFERENCE_PATTERN.test(withdrawalId)
  ) {
    return { error: "withdrawalId is required" };
  }

  return {
    normalized: {
      ...result.normalized,
      withdrawalId,
    },
  };
}

function withdrawalValidationWarnings(
  withdrawal: NormalizedTradingBotWithdrawal,
): string[] {
  const warnings = [
    "Validation only: no transfer transaction was built, signed, or broadcast.",
    "Use the Telegram confirmation button to request FTX/FrogX live execution when live gates are enabled.",
  ];

  if (withdrawal.assetType === "sol") {
    warnings.push(
      "Keep enough SOL in the wallet for future rent and network fees.",
    );
  }

  return warnings;
}

function normalizeTradingBotCopyTrade(
  body: TradingBotCopyTradeValidationBody,
): { normalized: NormalizedTradingBotCopyTrade } | { error: string } {
  const telegramUserId = stringValue(body.telegramUserId);
  const userPublicKey = stringValue(body.userPublicKey);
  const tag = copyTradeTagValue(body.tag);
  const targetWallet = stringValue(body.targetWallet);
  const buyMode = copyTradeBuyModeValue(body.buyMode) ?? "percentage";
  const buyPercentageBps = numberValue(body.buyPercentageBps) ?? 10_000;
  const maxBuyAmountIn = stringValue(body.maxBuyAmountIn);
  const amountLabel = stringValue(body.amountLabel);
  const slippageBps = numberValue(body.slippageBps);
  const priorityFee = numberValue(body.priorityFee ?? body.priorityFeeLamports);
  const sellPriorityFee = numberValue(
    body.sellPriorityFee ?? body.sellPriorityFeeLamports,
  );
  const copySells = booleanValue(body.copySells) ?? false;
  const duplicateBuys = booleanValue(body.duplicateBuys) ?? true;
  const onlyRenounced = booleanValue(body.onlyRenounced) ?? false;
  const excludePumpFunTokens = booleanValue(body.excludePumpFunTokens) ?? false;
  const minTargetBuyAmountIn = positiveIntegerStringValue(
    body.minTargetBuyAmountIn,
  );
  const minLiquidityUsd = numberValue(body.minLiquidityUsd);
  const minMarketCapUsd = numberValue(body.minMarketCapUsd);
  const maxMarketCapUsd = numberValue(body.maxMarketCapUsd);
  const blacklistMints = copyTradeBlacklistMintsValue(body.blacklistMints);

  const common = validateAutomationCommon({
    telegramUserId,
    userPublicKey,
    maxBuyAmountIn,
    slippageBps,
    priorityFee,
    minLiquidityUsd,
  });
  if (common) return { error: common };
  if (!targetWallet || !SOLANA_ADDRESS_PATTERN.test(targetWallet)) {
    return { error: "targetWallet must be a Solana address" };
  }
  if (targetWallet === userPublicKey) {
    return { error: "targetWallet must differ from userPublicKey" };
  }
  if (body.tag !== undefined && !tag) {
    return {
      error:
        "tag must be 1 to 32 letters, numbers, spaces, periods, underscores, or hyphens",
    };
  }
  if (body.buyMode !== undefined && !copyTradeBuyModeValue(body.buyMode)) {
    return { error: "buyMode must be fixed or percentage" };
  }
  if (
    !Number.isInteger(buyPercentageBps) ||
    buyPercentageBps < 1 ||
    buyPercentageBps > 10_000
  ) {
    return { error: "buyPercentageBps must be an integer from 1 to 10000" };
  }
  if (
    sellPriorityFee !== undefined &&
    (!Number.isInteger(sellPriorityFee) || sellPriorityFee < 0)
  ) {
    return { error: "sellPriorityFee must be a non-negative integer" };
  }
  if (body.minTargetBuyAmountIn !== undefined && !minTargetBuyAmountIn) {
    return { error: "minTargetBuyAmountIn must be a positive integer string" };
  }
  if (
    minMarketCapUsd !== undefined &&
    (!Number.isFinite(minMarketCapUsd) || minMarketCapUsd <= 0)
  ) {
    return { error: "minMarketCapUsd must be a positive number" };
  }
  if (
    maxMarketCapUsd !== undefined &&
    (!Number.isFinite(maxMarketCapUsd) || maxMarketCapUsd <= 0)
  ) {
    return { error: "maxMarketCapUsd must be a positive number" };
  }
  if (
    minMarketCapUsd !== undefined &&
    maxMarketCapUsd !== undefined &&
    minMarketCapUsd > maxMarketCapUsd
  ) {
    return { error: "minMarketCapUsd must not exceed maxMarketCapUsd" };
  }
  if (blacklistMints.error) return { error: blacklistMints.error };

  const normalized: NormalizedTradingBotCopyTrade = {
    telegramUserId: telegramUserId!,
    userPublicKey: userPublicKey!,
    ...(tag ? { tag } : {}),
    targetWallet,
    buyMode,
    buyPercentageBps,
    maxBuyAmountIn: maxBuyAmountIn!,
    slippageBps: slippageBps!,
    priorityFee: priorityFee!,
    sellPriorityFee: sellPriorityFee ?? priorityFee!,
    copySells,
    duplicateBuys,
    onlyRenounced,
    excludePumpFunTokens,
    ...(minTargetBuyAmountIn ? { minTargetBuyAmountIn } : {}),
    minLiquidityUsd: minLiquidityUsd!,
    ...(minMarketCapUsd !== undefined ? { minMarketCapUsd } : {}),
    blacklistMints: blacklistMints.values ?? [],
  };
  if (amountLabel) normalized.amountLabel = amountLabel;
  if (maxMarketCapUsd !== undefined)
    normalized.maxMarketCapUsd = maxMarketCapUsd;

  return { normalized };
}

function normalizeTradingBotSniper(
  body: TradingBotSniperValidationBody,
): { normalized: NormalizedTradingBotSniper } | { error: string } {
  const telegramUserId = stringValue(body.telegramUserId);
  const userPublicKey = stringValue(body.userPublicKey);
  const source = sniperSourceValue(body.source);
  const maxBuyAmountIn = stringValue(body.maxBuyAmountIn);
  const amountLabel = stringValue(body.amountLabel);
  const slippageBps = numberValue(body.slippageBps);
  const priorityFee = numberValue(body.priorityFee ?? body.priorityFeeLamports);
  const minLiquidityUsd = numberValue(body.minLiquidityUsd);
  const maxMarketCapUsd = numberValue(body.maxMarketCapUsd);
  const maxSnipes = numberValue(body.maxSnipes);

  const common = validateAutomationCommon({
    telegramUserId,
    userPublicKey,
    maxBuyAmountIn,
    slippageBps,
    priorityFee,
    minLiquidityUsd,
  });
  if (common) return { error: common };
  if (!source) {
    return { error: "source must be any, pump, raydium, or moonshot" };
  }
  if (
    maxMarketCapUsd !== undefined &&
    (!Number.isFinite(maxMarketCapUsd) || maxMarketCapUsd <= 0)
  ) {
    return { error: "maxMarketCapUsd must be a positive number" };
  }
  if (
    maxSnipes === undefined ||
    !Number.isInteger(maxSnipes) ||
    maxSnipes < 1 ||
    maxSnipes > 100
  ) {
    return { error: "maxSnipes must be an integer from 1 to 100" };
  }

  const normalized: NormalizedTradingBotSniper = {
    telegramUserId: telegramUserId!,
    userPublicKey: userPublicKey!,
    source,
    maxBuyAmountIn: maxBuyAmountIn!,
    slippageBps: slippageBps!,
    priorityFee: priorityFee!,
    minLiquidityUsd: minLiquidityUsd!,
    maxSnipes,
  };
  if (amountLabel) normalized.amountLabel = amountLabel;
  if (maxMarketCapUsd !== undefined)
    normalized.maxMarketCapUsd = maxMarketCapUsd;

  return { normalized };
}

function normalizeTradingBotAutoBuy(
  body: TradingBotAutoBuyValidationBody,
): { normalized: NormalizedTradingBotAutoBuy } | { error: string } {
  const telegramUserId = stringValue(body.telegramUserId);
  const userPublicKey = stringValue(body.userPublicKey);
  const mint = stringValue(body.mint);
  const maxBuyAmountIn = stringValue(body.maxBuyAmountIn);
  const amountLabel = stringValue(body.amountLabel);
  const slippageBps = numberValue(body.slippageBps);
  const priorityFee = numberValue(body.priorityFee ?? body.priorityFeeLamports);
  const minLiquidityUsd = numberValue(body.minLiquidityUsd);
  const maxMarketCapUsd = numberValue(body.maxMarketCapUsd);

  const common = validateAutomationCommon({
    telegramUserId,
    userPublicKey,
    maxBuyAmountIn,
    slippageBps,
    priorityFee,
    minLiquidityUsd,
  });
  if (common) return { error: common };
  if (
    !mint ||
    !SOLANA_ADDRESS_PATTERN.test(mint) ||
    mint === WRAPPED_SOL_MINT
  ) {
    return { error: "mint must be an SPL token mint" };
  }
  if (
    maxMarketCapUsd !== undefined &&
    (!Number.isFinite(maxMarketCapUsd) || maxMarketCapUsd <= 0)
  ) {
    return { error: "maxMarketCapUsd must be a positive number" };
  }

  const normalized: NormalizedTradingBotAutoBuy = {
    telegramUserId: telegramUserId!,
    userPublicKey: userPublicKey!,
    mint,
    maxBuyAmountIn: maxBuyAmountIn!,
    slippageBps: slippageBps!,
    priorityFee: priorityFee!,
    minLiquidityUsd: minLiquidityUsd!,
  };
  if (amountLabel) normalized.amountLabel = amountLabel;
  if (maxMarketCapUsd !== undefined)
    normalized.maxMarketCapUsd = maxMarketCapUsd;

  return { normalized };
}

function normalizeTradingBotBundleBuy(
  body: TradingBotBundleBuyValidationBody,
): { normalized: NormalizedTradingBotBundleBuy } | { error: string } {
  const telegramUserId = stringValue(body.telegramUserId);
  const userPublicKey = stringValue(body.userPublicKey);
  const amountLabel = stringValue(body.amountLabel);
  const slippageBps = numberValue(body.slippageBps);
  const priorityFee = numberValue(body.priorityFee ?? body.priorityFeeLamports);
  const minLiquidityUsd = numberValue(body.minLiquidityUsd);
  const maxMarketCapUsd = numberValue(body.maxMarketCapUsd);

  const common = validateAutomationCommon({
    telegramUserId,
    userPublicKey,
    maxBuyAmountIn: "1",
    slippageBps,
    priorityFee,
    minLiquidityUsd,
  });
  if (common) return { error: common };
  if (!Array.isArray(body.items)) {
    return { error: "items must be an array" };
  }
  if (body.items.length < 2 || body.items.length > 10) {
    return { error: "bundle buys require 2 to 10 token items" };
  }
  if (
    maxMarketCapUsd !== undefined &&
    (!Number.isFinite(maxMarketCapUsd) || maxMarketCapUsd <= 0)
  ) {
    return { error: "maxMarketCapUsd must be a positive number" };
  }

  const seenMints = new Set<string>();
  const items: NormalizedTradingBotBundleBuyItem[] = [];
  let totalAmount = 0n;
  for (const rawItem of body.items) {
    const item =
      rawItem && typeof rawItem === "object" && !Array.isArray(rawItem)
        ? (rawItem as TradingBotBundleBuyItemBody)
        : {};
    const mint = stringValue(item.mint);
    const maxBuyAmountIn = stringValue(item.maxBuyAmountIn);
    const itemAmountLabel = stringValue(item.amountLabel);
    if (
      !mint ||
      !SOLANA_ADDRESS_PATTERN.test(mint) ||
      mint === WRAPPED_SOL_MINT
    ) {
      return { error: "bundle item mint must be an SPL token mint" };
    }
    if (seenMints.has(mint)) {
      return { error: "bundle item mints must be unique" };
    }
    if (!maxBuyAmountIn || !/^[1-9]\d*$/.test(maxBuyAmountIn)) {
      return {
        error: "bundle item maxBuyAmountIn must be a positive integer string",
      };
    }
    seenMints.add(mint);
    totalAmount += BigInt(maxBuyAmountIn);
    items.push({
      mint,
      maxBuyAmountIn,
      ...(itemAmountLabel ? { amountLabel: itemAmountLabel } : {}),
    });
  }

  const normalized: NormalizedTradingBotBundleBuy = {
    telegramUserId: telegramUserId!,
    userPublicKey: userPublicKey!,
    items,
    maxBuyAmountIn: totalAmount.toString(),
    slippageBps: slippageBps!,
    priorityFee: priorityFee!,
    minLiquidityUsd: minLiquidityUsd!,
  };
  if (amountLabel) normalized.amountLabel = amountLabel;
  if (maxMarketCapUsd !== undefined)
    normalized.maxMarketCapUsd = maxMarketCapUsd;

  return { normalized };
}

function normalizeTradingBotBundleBuyExecution(
  body: TradingBotBundleBuyExecutionBody,
): { normalized: NormalizedTradingBotBundleBuyExecution } | { error: string } {
  const telegramUserId = stringValue(body.telegramUserId);
  const userPublicKey = stringValue(body.userPublicKey);
  const configId = stringValue(body.configId);
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return { error: "telegramUserId is required" };
  }
  if (!userPublicKey || !SOLANA_ADDRESS_PATTERN.test(userPublicKey)) {
    return { error: "userPublicKey must be a Solana address" };
  }
  if (!configId || !TRADING_BOT_ADVANCED_CONFIG_ID_PATTERN.test(configId)) {
    return { error: "configId is required" };
  }
  return {
    normalized: {
      telegramUserId,
      userPublicKey,
      configId,
    },
  };
}

function normalizeTradingBotAutoSell(
  body: TradingBotAutoSellValidationBody,
): { normalized: NormalizedTradingBotAutoSell } | { error: string } {
  const telegramUserId = stringValue(body.telegramUserId);
  const userPublicKey = stringValue(body.userPublicKey);
  const mint = stringValue(body.mint);
  const sellBps = numberValue(body.sellBps);
  const amountLabel = stringValue(body.amountLabel);
  const slippageBps = numberValue(body.slippageBps);
  const priorityFee = numberValue(body.priorityFee ?? body.priorityFeeLamports);
  const triggerPrice = decimalStringValue(body.triggerPrice);
  const triggerDirection = triggerDirectionValue(body.triggerDirection);

  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return { error: "telegramUserId is required" };
  }
  if (!userPublicKey || !SOLANA_ADDRESS_PATTERN.test(userPublicKey)) {
    return { error: "userPublicKey must be a Solana address" };
  }
  if (
    !mint ||
    !SOLANA_ADDRESS_PATTERN.test(mint) ||
    mint === WRAPPED_SOL_MINT
  ) {
    return { error: "mint must be an SPL token mint" };
  }
  if (
    sellBps === undefined ||
    !Number.isInteger(sellBps) ||
    sellBps < 1 ||
    sellBps > 10_000
  ) {
    return { error: "sellBps must be an integer from 1 to 10000" };
  }
  if (
    slippageBps === undefined ||
    !Number.isInteger(slippageBps) ||
    slippageBps < 0 ||
    slippageBps > 10_000
  ) {
    return { error: "slippageBps must be an integer from 0 to 10000" };
  }
  if (
    priorityFee === undefined ||
    !Number.isInteger(priorityFee) ||
    priorityFee < 0
  ) {
    return { error: "priorityFee must be a non-negative integer" };
  }
  if (
    (triggerPrice && !triggerDirection) ||
    (!triggerPrice && triggerDirection)
  ) {
    return {
      error: "triggerPrice and triggerDirection must be provided together",
    };
  }

  const normalized: NormalizedTradingBotAutoSell = {
    telegramUserId,
    userPublicKey,
    mint,
    sellBps,
    slippageBps,
    priorityFee,
  };
  if (amountLabel) normalized.amountLabel = amountLabel;
  if (triggerPrice && triggerDirection) {
    normalized.triggerPrice = triggerPrice;
    normalized.triggerDirection = triggerDirection;
  }

  return { normalized };
}

function normalizeTradingBotAdvancedAutomationConfig(
  kind: TradingBotAdvancedAutomationKind,
  body:
    | TradingBotCopyTradeValidationBody
    | TradingBotSniperValidationBody
    | TradingBotAutoBuyValidationBody
    | TradingBotBundleBuyValidationBody
    | TradingBotAutoSellValidationBody,
):
  | { normalized: NormalizedTradingBotAdvancedAutomationConfig }
  | { error: string } {
  switch (kind) {
    case "copytrade":
      return normalizeTradingBotCopyTrade(
        body as TradingBotCopyTradeValidationBody,
      );
    case "sniper":
      return normalizeTradingBotSniper(body as TradingBotSniperValidationBody);
    case "auto_buy":
      return normalizeTradingBotAutoBuy(
        body as TradingBotAutoBuyValidationBody,
      );
    case "bundle_buy":
      return normalizeTradingBotBundleBuy(
        body as TradingBotBundleBuyValidationBody,
      );
    case "auto_sell":
      return normalizeTradingBotAutoSell(
        body as TradingBotAutoSellValidationBody,
      );
  }
}

function validateAutomationCommon(input: {
  telegramUserId?: string;
  userPublicKey?: string;
  maxBuyAmountIn?: string;
  slippageBps?: number;
  priorityFee?: number;
  minLiquidityUsd?: number;
}): string | undefined {
  if (
    !input.telegramUserId ||
    !TELEGRAM_USER_ID_PATTERN.test(input.telegramUserId)
  ) {
    return "telegramUserId is required";
  }
  if (
    !input.userPublicKey ||
    !SOLANA_ADDRESS_PATTERN.test(input.userPublicKey)
  ) {
    return "userPublicKey must be a Solana address";
  }
  if (!input.maxBuyAmountIn || !/^[1-9]\d*$/.test(input.maxBuyAmountIn)) {
    return "maxBuyAmountIn must be a positive integer string";
  }
  if (
    input.slippageBps === undefined ||
    !Number.isInteger(input.slippageBps) ||
    input.slippageBps < 0 ||
    input.slippageBps > 10_000
  ) {
    return "slippageBps must be an integer from 0 to 10000";
  }
  if (
    input.priorityFee === undefined ||
    !Number.isInteger(input.priorityFee) ||
    input.priorityFee < 0
  ) {
    return "priorityFee must be a non-negative integer";
  }
  if (
    input.minLiquidityUsd === undefined ||
    !Number.isFinite(input.minLiquidityUsd) ||
    input.minLiquidityUsd <= 0
  ) {
    return "minLiquidityUsd must be a positive number";
  }
  return undefined;
}

function copyTradeValidationWarnings(
  config: NormalizedTradingBotCopyTrade,
  stored = false,
): string[] {
  const warnings = [
    stored
      ? "FTX/FrogX stored this copytrade config for future server-side monitoring."
      : "Validation only: no copytrade config was stored.",
    "The storage request does not start a monitor, build a copied swap, sign, or broadcast.",
    "FTX never blindly retries a failed or ambiguous copied transaction; unresolved sends stay locked for read-only reconciliation.",
  ];
  if (config.buyMode === "fixed") {
    warnings.push(
      "Fixed sizing copies the configured SOL amount regardless of the target buy size, subject to balance and risk gates.",
    );
  } else {
    warnings.push(
      `Percentage sizing copies ${config.buyPercentageBps / 100}% of the target SOL spend up to the configured cap.`,
    );
  }
  if (!config.duplicateBuys) {
    warnings.push(
      "Duplicate buys are disabled while the FTX wallet still holds the token.",
    );
  }
  if (config.excludePumpFunTokens) {
    warnings.push(
      "PumpFun exclusion rejects target transactions that invoke the official Pump bonding-curve program; graduated PumpSwap trades are not excluded.",
    );
  }
  return warnings;
}

function sniperValidationWarnings(
  _config: NormalizedTradingBotSniper,
  stored = false,
): string[] {
  const warnings = [
    stored
      ? "FTX/FrogX stored this sniper config for Jupiter recent-pool monitoring."
      : "Validation only: no sniper config was stored.",
    "The storage request does not start a monitor, build a swap, sign, or broadcast.",
    "Live sniping requires account opt-in, the advanced and sniper monitor flags, the separate sniper and base live gates, Jupiter launch data, RPC and market-risk checks, and Privy signer readiness.",
  ];
  return warnings;
}

function autoBuyValidationWarnings(
  _config: NormalizedTradingBotAutoBuy,
  stored = false,
): string[] {
  return [
    stored
      ? "FTX/FrogX stored this auto-buy rule for server-side automation."
      : "Validation only: no auto-buy rule was stored.",
    "Live auto-buy execution requires the auto-buy monitor, the extra live auto-buy gate, account auto-buy opt-in, FTX market-risk checks, and the normal Privy signer gates.",
    "No swap build, signing, or broadcast was started by this request.",
  ];
}

function bundleBuyValidationWarnings(
  config: NormalizedTradingBotBundleBuy,
  stored = false,
): string[] {
  return [
    stored
      ? "FTX/FrogX stored this bundle-buy basket for future server-side execution."
      : "Validation only: no bundle-buy basket was stored.",
    `Bundle contains ${config.items.length} token buys with shared liquidity and market-cap filters.`,
    "No bundle execution was requested by this validation/storage call.",
  ];
}

async function autoBuyValidationWarningsWithMarketRisk(
  env: Env,
  config: NormalizedTradingBotAutoBuy,
  requestUrl: string,
  stored = false,
): Promise<string[]> {
  const warnings = autoBuyValidationWarnings(config, stored);
  if (!resolveRpcUrl(env)) {
    return [
      ...warnings,
      "Market-risk review skipped: SOLANA_RPC_URL is not configured.",
    ];
  }

  try {
    const review = await loadTradingBotMarketRisk(env, {
      telegramUserId: config.telegramUserId,
      userPublicKey: config.userPublicKey,
      mint: config.mint,
      amountIn: config.maxBuyAmountIn,
      slippageBps: config.slippageBps,
      priorityFee: config.priorityFee,
      minLiquidityUsd: config.minLiquidityUsd,
      maxMarketCapUsd: config.maxMarketCapUsd,
      maxPriceImpactBps: Math.max(config.slippageBps, 1500),
      requestUrl,
    });
    const riskWarnings = review.warnings.slice(0, 3);
    return [
      ...warnings,
      `Market-risk review: ${review.risk.level.toUpperCase()} (${review.risk.score}/100).`,
      ...riskWarnings.map((warning) => `Market-risk warning: ${warning}`),
    ];
  } catch {
    return [
      ...warnings,
      "Market-risk review unavailable from FTX/FrogX right now.",
    ];
  }
}

function autoSellValidationWarnings(
  _config: NormalizedTradingBotAutoSell,
  stored = false,
): string[] {
  return [
    stored
      ? "FTX/FrogX stored this auto-sell rule for server-side automation."
      : "Validation only: no auto-sell rule was stored.",
    "Live auto-sell execution requires the auto-sell monitor, the extra live auto-sell gate, account auto-sell opt-in, and the normal Privy signer gates.",
    "No swap build, signing, or broadcast was started by this request.",
  ];
}

function advancedAutomationValidationWarnings(
  kind: TradingBotAdvancedAutomationKind,
  config: NormalizedTradingBotAdvancedAutomationConfig,
  stored = false,
): string[] {
  switch (kind) {
    case "copytrade":
      return copyTradeValidationWarnings(
        config as NormalizedTradingBotCopyTrade,
        stored,
      );
    case "sniper":
      return sniperValidationWarnings(
        config as NormalizedTradingBotSniper,
        stored,
      );
    case "auto_buy":
      return autoBuyValidationWarnings(
        config as NormalizedTradingBotAutoBuy,
        stored,
      );
    case "bundle_buy":
      return bundleBuyValidationWarnings(
        config as NormalizedTradingBotBundleBuy,
        stored,
      );
    case "auto_sell":
      return autoSellValidationWarnings(
        config as NormalizedTradingBotAutoSell,
        stored,
      );
  }
}

function normalizeTradingBotPreference(
  body: TradingBotPreferenceValidationBody,
): { normalized: NormalizedTradingBotPreference } | { error: string } {
  const telegramUserId = stringValue(body.telegramUserId);
  const userPublicKey = stringValue(body.userPublicKey);
  const kind = preferenceKindValue(body.kind);
  const action = preferenceActionValue(body.action);
  const mint = stringValue(body.mint);

  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return { error: "telegramUserId is required" };
  }
  if (userPublicKey && !SOLANA_ADDRESS_PATTERN.test(userPublicKey)) {
    return { error: "userPublicKey must be a Solana address" };
  }
  if (!kind) {
    return { error: "kind must be settings, watchlist, or hiddenToken" };
  }
  if (!action) {
    return { error: "action must be set, add, or remove" };
  }

  const shared: Omit<NormalizedTradingBotPreference, "mint" | "settings"> = {
    telegramUserId,
    kind,
    action,
  };
  if (userPublicKey) {
    shared.userPublicKey = userPublicKey;
  }

  if (kind === "watchlist" || kind === "hiddenToken") {
    if (action === "set") {
      return { error: "token list actions must be add or remove" };
    }
    if (
      !mint ||
      !SOLANA_ADDRESS_PATTERN.test(mint) ||
      mint === WRAPPED_SOL_MINT
    ) {
      return { error: "mint must be an SPL token mint" };
    }

    return {
      normalized: {
        ...shared,
        mint,
      },
    };
  }

  if (action !== "set") {
    return { error: "settings action must be set" };
  }

  const slippageBps = numberValue(body.slippageBps);
  const priorityFee = numberValue(body.priorityFee ?? body.priorityFeeLamports);
  const sellPriorityFee = numberValue(
    body.sellPriorityFee ?? body.sellPriorityFeeLamports,
  );
  const defaultBuyAmountIn = stringValue(body.defaultBuyAmountIn);
  const buyPresetAmountsIn = tradingBotBuyPresetAmountsValue(
    body.buyPresetAmountsIn,
  );
  const sellPresetBps = tradingBotSellPresetBpsValue(body.sellPresetBps);
  const botMode = tradingBotModeValue(body.botMode);
  const confirmTrades = booleanValue(body.confirmTrades);
  const sellProtection = booleanValue(body.sellProtection);
  const autoBuyEnabled = booleanValue(body.autoBuyEnabled);
  const instantAutoBuyEnabled = booleanValue(body.instantAutoBuyEnabled);
  const instantAutoBuyAmountIn = stringValue(body.instantAutoBuyAmountIn);
  const instantAutoBuyMinLiquidityUsd = numberValue(
    body.instantAutoBuyMinLiquidityUsd,
  );
  const instantAutoBuyMaxMarketCapUsd = numberValue(
    body.instantAutoBuyMaxMarketCapUsd,
  );
  const autoSellEnabled = booleanValue(body.autoSellEnabled);
  const sniperEnabled = booleanValue(body.sniperEnabled);
  const mevProtection = booleanValue(body.mevProtection);

  if (
    slippageBps !== undefined &&
    (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10_000)
  ) {
    return { error: "slippageBps must be an integer from 0 to 10000" };
  }
  if (
    priorityFee === undefined ||
    !Number.isInteger(priorityFee) ||
    priorityFee < 0
  ) {
    return { error: "priorityFee must be a non-negative integer" };
  }
  if (
    sellPriorityFee !== undefined &&
    (!Number.isInteger(sellPriorityFee) || sellPriorityFee < 0)
  ) {
    return { error: "sellPriorityFee must be a non-negative integer" };
  }
  if (
    defaultBuyAmountIn !== undefined &&
    !/^[1-9]\d*$/.test(defaultBuyAmountIn)
  ) {
    return { error: "defaultBuyAmountIn must be a positive integer string" };
  }
  if (
    instantAutoBuyAmountIn !== undefined &&
    !/^[1-9]\d*$/.test(instantAutoBuyAmountIn)
  ) {
    return {
      error: "instantAutoBuyAmountIn must be a positive integer string",
    };
  }
  if (
    instantAutoBuyMinLiquidityUsd !== undefined &&
    (!Number.isFinite(instantAutoBuyMinLiquidityUsd) ||
      instantAutoBuyMinLiquidityUsd <= 0)
  ) {
    return { error: "instantAutoBuyMinLiquidityUsd must be positive" };
  }
  if (
    instantAutoBuyMaxMarketCapUsd !== undefined &&
    (!Number.isFinite(instantAutoBuyMaxMarketCapUsd) ||
      instantAutoBuyMaxMarketCapUsd <= 0)
  ) {
    return { error: "instantAutoBuyMaxMarketCapUsd must be positive" };
  }
  if (buyPresetAmountsIn.error) return { error: buyPresetAmountsIn.error };
  if (sellPresetBps.error) return { error: sellPresetBps.error };
  if (body.botMode !== undefined && !botMode) {
    return { error: "botMode must be simple or advanced" };
  }
  if (
    slippageBps === undefined &&
    sellPriorityFee === undefined &&
    defaultBuyAmountIn === undefined &&
    buyPresetAmountsIn.values === undefined &&
    sellPresetBps.values === undefined &&
    botMode === undefined &&
    confirmTrades === undefined &&
    sellProtection === undefined &&
    autoBuyEnabled === undefined &&
    instantAutoBuyEnabled === undefined &&
    instantAutoBuyAmountIn === undefined &&
    instantAutoBuyMinLiquidityUsd === undefined &&
    instantAutoBuyMaxMarketCapUsd === undefined &&
    autoSellEnabled === undefined &&
    sniperEnabled === undefined &&
    mevProtection === undefined
  ) {
    return { error: "at least one setting must be provided" };
  }

  const settings: NonNullable<NormalizedTradingBotPreference["settings"]> = {
    priorityFee,
  };
  if (slippageBps !== undefined) settings.slippageBps = slippageBps;
  if (sellPriorityFee !== undefined) settings.sellPriorityFee = sellPriorityFee;
  if (defaultBuyAmountIn !== undefined)
    settings.defaultBuyAmountIn = defaultBuyAmountIn;
  if (buyPresetAmountsIn.values !== undefined)
    settings.buyPresetAmountsIn = buyPresetAmountsIn.values;
  if (sellPresetBps.values !== undefined)
    settings.sellPresetBps = sellPresetBps.values;
  if (botMode !== undefined) settings.botMode = botMode;
  if (botMode === "simple") settings.confirmTrades = false;
  else if (confirmTrades !== undefined) settings.confirmTrades = confirmTrades;
  if (sellProtection !== undefined) settings.sellProtection = sellProtection;
  if (autoBuyEnabled !== undefined) settings.autoBuyEnabled = autoBuyEnabled;
  if (instantAutoBuyEnabled !== undefined)
    settings.instantAutoBuyEnabled = instantAutoBuyEnabled;
  if (instantAutoBuyAmountIn !== undefined)
    settings.instantAutoBuyAmountIn = instantAutoBuyAmountIn;
  if (instantAutoBuyMinLiquidityUsd !== undefined)
    settings.instantAutoBuyMinLiquidityUsd = instantAutoBuyMinLiquidityUsd;
  if (instantAutoBuyMaxMarketCapUsd !== undefined)
    settings.instantAutoBuyMaxMarketCapUsd = instantAutoBuyMaxMarketCapUsd;
  if (autoSellEnabled !== undefined) settings.autoSellEnabled = autoSellEnabled;
  if (sniperEnabled !== undefined) settings.sniperEnabled = sniperEnabled;
  if (mevProtection !== undefined) settings.mevProtection = mevProtection;

  return {
    normalized: {
      ...shared,
      settings,
    },
  };
}

function preferenceValidationWarnings(
  preference: NormalizedTradingBotPreference,
  stored: boolean,
): string[] {
  const warnings = stored
    ? ["FTX/FrogX stored this Ribbot preference in account state."]
    : [
        "FTX/FrogX account storage is not configured; Ribbot may store this preference locally only.",
      ];

  if (
    preference.settings?.autoBuyEnabled ||
    preference.settings?.autoSellEnabled ||
    preference.settings?.sniperEnabled
  ) {
    warnings.push(
      "Automation toggles remain inert until their FTX monitor and live execution gates are enabled.",
    );
  }
  if (preference.settings?.instantAutoBuyEnabled) {
    warnings.push(
      "Instant Auto Buy remains inert until Ribbot and FTX live execution gates are enabled.",
    );
  }
  if (preference.settings?.botMode === "simple") {
    warnings.push(
      "Simple mode stores confirmTrades=false; sell protection can still require confirmation above 75%.",
    );
  }
  if (preference.settings?.sellProtection === false) {
    warnings.push(
      "Sell protection is disabled; confirm-off sells can execute without an extra Telegram confirmation.",
    );
  }
  if (preference.kind === "hiddenToken") {
    warnings.push(
      "Hidden tokens affect Ribbot display only in this milestone.",
    );
  }

  return warnings;
}

async function upsertTradingBotWallet(
  env: Env,
  body: {
    telegramUserId: string;
    username?: string;
    walletSource: "privy" | "external";
    privyUserId?: string;
    privyWalletId?: string;
    solanaWalletAddress: string;
  },
): Promise<TradingBotAccountSnapshot | undefined> {
  const store = tradingBotAccountStore(env, body.telegramUserId);
  if (!store) return undefined;

  try {
    const response = await store.fetch(
      new Request("https://trading-bot-account.local/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    if (!response.ok) {
      console.warn(
        "[trading-bot] Account wallet storage failed",
        response.status,
      );
      return undefined;
    }
    const data = (await response.json()) as {
      account?: TradingBotAccountSnapshot;
    };
    return data.account;
  } catch (error) {
    console.warn("[trading-bot] Account wallet storage unavailable", error);
    return undefined;
  }
}

async function syncTradingBotPrivyWallets(
  env: Env,
  body: {
    telegramUserId: string;
    username?: string;
    privyUserId: string;
    wallets: TradingBotAccountWalletSlot[];
  },
): Promise<TradingBotAccountSnapshot | undefined> {
  const store = tradingBotAccountStore(env, body.telegramUserId);
  if (!store) return undefined;
  try {
    const response = await store.fetch(
      new Request("https://trading-bot-account.local/wallet/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    if (!response.ok) {
      console.warn(
        "[trading-bot] Account wallet inventory sync failed",
        response.status,
      );
      return undefined;
    }
    const data = (await response.json()) as {
      account?: TradingBotAccountSnapshot;
    };
    return data.account;
  } catch (error) {
    console.warn("[trading-bot] Account wallet inventory unavailable", error);
    return undefined;
  }
}

async function selectStoredTradingBotWallet(
  env: Env,
  body: { telegramUserId: string; walletId: string },
): Promise<{
  status: "ready" | "not_configured";
  account?: TradingBotAccountSnapshot;
  required?: string[];
  error?: string;
  responseStatus?: number;
}> {
  const store = tradingBotAccountStore(env, body.telegramUserId);
  if (!store) {
    return {
      status: "not_configured",
      required: ["TRADING_BOT_ACCOUNTS"],
    };
  }
  try {
    const response = await store.fetch(
      new Request("https://trading-bot-account.local/wallet/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    const data = (await response.json()) as {
      account?: TradingBotAccountSnapshot;
      error?: string;
    };
    return {
      status: "ready",
      account: data.account,
      error: data.error,
      responseStatus: response.status,
    };
  } catch (error) {
    return {
      status: "ready",
      error: error instanceof Error ? error.message : String(error),
      responseStatus: 503,
    };
  }
}

async function applyTradingBotPreference(
  env: Env,
  preference: NormalizedTradingBotPreference,
): Promise<TradingBotAccountSnapshot | undefined> {
  const store = tradingBotAccountStore(env, preference.telegramUserId);
  if (!store) return undefined;

  try {
    const response = await store.fetch(
      new Request("https://trading-bot-account.local/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preference),
      }),
    );
    if (!response.ok) {
      console.warn(
        "[trading-bot] Account preference storage failed",
        response.status,
      );
      return undefined;
    }
    const data = (await response.json()) as {
      account?: TradingBotAccountSnapshot;
    };
    return data.account;
  } catch (error) {
    console.warn("[trading-bot] Account preference storage unavailable", error);
    return undefined;
  }
}

async function recordTradingBotAccountEvent(
  env: Env,
  telegramUserId: string,
  input: {
    eventId?: string;
    eventType: string;
    metadata: Record<string, unknown>;
  },
): Promise<TradingBotAccountEventSnapshot | undefined> {
  const store = tradingBotAccountStore(env, telegramUserId);
  if (!store) return undefined;

  try {
    const response = await store.fetch(
      new Request("https://trading-bot-account.local/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramUserId,
          eventId: input.eventId,
          eventType: input.eventType,
          metadata: input.metadata,
        }),
      }),
    );
    if (!response.ok) {
      console.warn(
        "[trading-bot] Account event storage failed",
        response.status,
      );
      return undefined;
    }
    const data = (await response.json()) as {
      event?: TradingBotAccountEventSnapshot;
    };
    return data.event;
  } catch (error) {
    console.warn("[trading-bot] Account event storage unavailable", error);
    return undefined;
  }
}

async function getStoredTradingBotEvents(
  env: Env,
  telegramUserId: string,
  limit: number,
): Promise<TradingBotAccountEventSnapshot[]> {
  const store = tradingBotAccountStore(env, telegramUserId);
  if (!store) return [];

  const response = await store.fetch(
    new Request(
      `https://trading-bot-account.local/events?telegramUserId=${telegramUserId}&limit=${limit}`,
    ),
  );
  if (!response.ok) {
    throw new Error(
      `Trading account event storage failed with status ${response.status}`,
    );
  }

  const data = (await response.json()) as {
    events?: TradingBotAccountEventSnapshot[];
  };
  return data.events ?? [];
}

async function getStoredTradingBotEvent(
  env: Env,
  telegramUserId: string,
  eventId: string,
): Promise<TradingBotAccountEventSnapshot | null> {
  const store = tradingBotAccountStore(env, telegramUserId);
  if (!store) return null;

  try {
    const response = await store.fetch(
      new Request(
        `https://trading-bot-account.local/event?telegramUserId=${encodeURIComponent(telegramUserId)}&eventId=${encodeURIComponent(eventId)}`,
      ),
    );
    if (response.status === 404) return null;
    if (!response.ok) {
      console.warn(
        "[trading-bot] Account event lookup failed",
        response.status,
      );
      return null;
    }
    const data = (await response.json()) as {
      event?: TradingBotAccountEventSnapshot;
    };
    return data.event ?? null;
  } catch (error) {
    console.warn("[trading-bot] Account event lookup unavailable", error);
    return null;
  }
}

async function reconcileTradingBotPerpsDeposit(
  env: Env,
  telegramUserId: string,
): Promise<void> {
  const accountResult = await getStoredTradingBotAccount(env, telegramUserId);
  if ("error" in accountResult || !accountResult.account) return;

  const wallet = tradingBotAccountWalletByRole(
    accountResult.account,
    "spot_nft",
  );
  if (!wallet) return;

  const previewResult = await getStoredTradingBotDeltaNeutralPreview(
    env,
    telegramUserId,
    wallet.solanaWalletAddress,
  );
  if ("error" in previewResult) return;
  const { preview } = previewResult;
  if (!preview.profileAddress || !preview.profileFunded) return;

  const eventId = `imperial-profile-funded:${preview.profileAddress}`;
  if (await getStoredTradingBotEvent(env, telegramUserId, eventId)) return;

  await recordTradingBotAccountEvent(env, telegramUserId, {
    eventId,
    eventType: "imperial_deposit_confirmed",
    metadata: {
      authorityWalletAddress: wallet.solanaWalletAddress,
      profileAddress: preview.profileAddress,
      profileIndex: preview.profileIndex,
      uiAmountString: String(preview.profileUsdc),
      minimumUiAmountString: String(preview.minimumProfileUsdc),
      fundingLocation: "imperial_profile",
    },
  });
}

async function getStoredTradingBotDeltaNeutralPreview(
  env: Env,
  telegramUserId: string,
  expectedWalletAddress: string,
): Promise<
  | {
      preview: DeltaNeutralServicePreview;
      liveExecutionEnabled: boolean;
    }
  | { error: string; status: number }
> {
  const store = tradingBotAccountStore(env, telegramUserId);
  if (!store) {
    return { error: "Trading account storage is not configured", status: 503 };
  }

  const response = await store.fetch(
    new Request("https://trading-bot-account.local/delta-neutral/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramUserId }),
    }),
  );
  const data = (await response.json().catch(() => null)) as unknown;
  const record = recordValue(data);
  if (!response.ok) {
    return {
      error:
        stringValue(record?.error) ?? "Imperial profile is temporarily unavailable",
      status: response.status,
    };
  }
  const preview = deltaNeutralPreviewValue(
    record?.preview,
    expectedWalletAddress,
  );
  if (!preview) {
    return { error: "Imperial returned an invalid profile", status: 502 };
  }
  return {
    preview,
    liveExecutionEnabled: record?.liveExecutionEnabled === true,
  };
}

async function forwardTradingBotDeltaNeutralRequest(
  request: Request,
  env: Env,
  action: "preview" | "start" | "status" | "stop",
  requireLiveConfirmation: boolean,
): Promise<Response> {
  const auth = authorizeTradingBotRequest(request, env);
  if (auth === "missing") {
    return json(
      { status: "not_configured", required: ["RIBBOT_TRADING_BOT_TOKEN"] },
      { status: 503 },
    );
  }
  if (auth === "denied") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = requireLiveConfirmation
    ? await parseDeltaNeutralRequestBody(request, true)
    : await parseDeltaNeutralRequestBody(request);
  if ("error" in body) {
    return json({ error: body.error }, { status: 400 });
  }

  const store = tradingBotAccountStore(env, body.telegramUserId);
  if (!store) {
    return json(
      { status: "not_configured", required: ["TRADING_BOT_ACCOUNTS"] },
      { status: 503 },
    );
  }

  return store.fetch(
    new Request(`https://trading-bot-account.local/delta-neutral/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function parseDeltaNeutralRequestBody(
  request: Request,
  requireLiveConfirmation: true,
): Promise<
  | {
      telegramUserId: string;
      idempotencyKey: string;
      confirmLive: true;
    }
  | { error: string }
>;
async function parseDeltaNeutralRequestBody(
  request: Request,
  requireLiveConfirmation?: false,
): Promise<{ telegramUserId: string } | { error: string }>;
async function parseDeltaNeutralRequestBody(
  request: Request,
  requireLiveConfirmation = false,
): Promise<
  | { telegramUserId: string }
  | {
      telegramUserId: string;
      idempotencyKey: string;
      confirmLive: true;
    }
  | { error: string }
> {
  let raw: TradingBotDeltaNeutralBody;
  try {
    raw = (await request.json()) as TradingBotDeltaNeutralBody;
  } catch {
    return { error: "Invalid JSON" };
  }

  const telegramUserId = stringValue(raw.telegramUserId);
  if (!telegramUserId || !TELEGRAM_USER_ID_PATTERN.test(telegramUserId)) {
    return { error: "telegramUserId is required" };
  }
  if (!requireLiveConfirmation) return { telegramUserId };

  const idempotencyKey = stringValue(raw.idempotencyKey);
  if (
    !idempotencyKey ||
    !DELTA_NEUTRAL_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)
  ) {
    return { error: "idempotencyKey is invalid" };
  }
  if (raw.confirmLive !== true) {
    return { error: "confirmLive must be true" };
  }
  return { telegramUserId, idempotencyKey, confirmLive: true };
}

function isDeltaNeutralEnabled(env: Env): boolean {
  return booleanValue(env.PERP_FARMER_ENABLED) === true;
}

function isDeltaNeutralLiveExecutionEnabled(env: Env): boolean {
  return (
    isDeltaNeutralEnabled(env) &&
    booleanValue(env.PERP_FARMER_LIVE_EXECUTION_ENABLED) === true
  );
}

function resolveDeltaNeutralService(
  env: Env,
): { url: string; token: string } | null {
  const rawUrl = stringValue(env.PERP_FARMER_SERVICE_URL);
  const token = stringValue(env.PERP_FARMER_SERVICE_TOKEN);
  if (!rawUrl || !token) return null;

  try {
    const url = new URL(rawUrl);
    const localHttp =
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost");
    if (url.protocol !== "https:" && !localHttp) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return { url: url.toString().replace(/\/$/, ""), token };
  } catch {
    return null;
  }
}

function deltaNeutralServiceMissingRequirements(
  env: Env,
  requireLive: boolean,
): string[] {
  const missing: string[] = [];
  if (!isDeltaNeutralEnabled(env)) missing.push("PERP_FARMER_ENABLED");
  if (!stringValue(env.PERP_FARMER_SERVICE_URL)) {
    missing.push("PERP_FARMER_SERVICE_URL");
  }
  if (!stringValue(env.PERP_FARMER_SERVICE_TOKEN)) {
    missing.push("PERP_FARMER_SERVICE_TOKEN");
  }
  if (!resolveDeltaNeutralService(env)) {
    missing.push("PERP_FARMER_SERVICE_CONFIGURATION");
  }
  if (requireLive && !isDeltaNeutralLiveExecutionEnabled(env)) {
    missing.push("PERP_FARMER_LIVE_EXECUTION_ENABLED");
  }
  return uniqueStrings(missing);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function deltaNeutralProxyStatus(status: number): number {
  return [400, 409, 429].includes(status) ? status : 502;
}

function finiteNonNegativeNumber(value: unknown): number | null {
  const parsed = numberValue(value);
  return parsed !== undefined && Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : null;
}

export function deltaNeutralPreviewValue(
  value: unknown,
  expectedWallet: string,
): DeltaNeutralServicePreview | null {
  const record = recordValue(value);
  const profileUsdc = finiteNonNegativeNumber(record?.profileUsdc);
  const minimumProfileUsdc = finiteNonNegativeNumber(
    record?.minimumProfileUsdc,
  );
  const liveEntryCapUsd = finiteNonNegativeNumber(record?.liveEntryCapUsd);
  const maxCycles = nonNegativeSafeInteger(record?.maxCycles);
  const blockers = record?.blockers;
  const profileAddress = record?.profileAddress;
  if (
    record?.strategy !== DELTA_NEUTRAL_STRATEGY ||
    record?.preset !== DELTA_NEUTRAL_PRESET ||
    record?.wallet !== expectedWallet ||
    record?.profileIndex !== DELTA_NEUTRAL_PROFILE_INDEX ||
    profileUsdc === null ||
    minimumProfileUsdc !== 50 ||
    typeof record?.profileFunded !== "boolean" ||
    typeof record?.liveReady !== "boolean" ||
    liveEntryCapUsd === null ||
    maxCycles !== DELTA_NEUTRAL_MAX_CYCLES ||
    !Array.isArray(blockers) ||
    !blockers.every((blocker) => typeof blocker === "string") ||
    !(
      profileAddress === null ||
      profileAddress === undefined ||
      typeof profileAddress === "string"
    )
  ) {
    return null;
  }
  const entryCapCompatible =
    liveEntryCapUsd === DELTA_NEUTRAL_LIVE_ENTRY_CAP_USD;
  const normalizedBlockers = blockers as string[];
  return {
    strategy: DELTA_NEUTRAL_STRATEGY,
    preset: DELTA_NEUTRAL_PRESET,
    wallet: expectedWallet,
    profileIndex: DELTA_NEUTRAL_PROFILE_INDEX,
    profileAddress: typeof profileAddress === "string" ? profileAddress : null,
    profileUsdc,
    minimumProfileUsdc,
    profileFunded: record.profileFunded,
    liveReady: record.liveReady && entryCapCompatible,
    liveEntryCapUsd: DELTA_NEUTRAL_LIVE_ENTRY_CAP_USD,
    serviceLiveEntryCapUsd: liveEntryCapUsd,
    entryCapCompatible,
    maxCycles,
    blockers: entryCapCompatible
      ? normalizedBlockers
      : uniqueStrings([
          ...normalizedBlockers,
          deltaNeutralEntryCapBlocker(liveEntryCapUsd),
        ]),
  };
}

function deltaNeutralEntryCapBlocker(serviceLiveEntryCapUsd: number): string {
  return `Delta Neutral requires a $${serviceLiveEntryCapUsd} live entry cap, above the $${DELTA_NEUTRAL_LIVE_ENTRY_CAP_USD} Frog Trading Exchange beta limit.`;
}

function deltaNeutralRunStatusValue(
  value: unknown,
  expectedWallet: string,
): DeltaNeutralServiceRunStatus | null {
  const record = recordValue(value);
  const completedCycles = nonNegativeSafeInteger(record?.completedCycles);
  const maxCycles = nonNegativeSafeInteger(record?.maxCycles);
  const dailyBudgetUsd = finiteNonNegativeNumber(record?.dailyBudgetUsd);
  const estimatedRunCostUsd = finiteNonNegativeNumber(
    record?.estimatedRunCostUsd,
  );
  const completedVolumeUsd = finiteNonNegativeNumber(
    record?.completedVolumeUsd,
  );
  const runId = record?.runId;
  const startedAtUnix = record?.startedAtUnix;
  const stoppedAtUnix = record?.stoppedAtUnix;
  const lastMessage = record?.lastMessage;
  if (
    record?.strategy !== DELTA_NEUTRAL_STRATEGY ||
    record?.preset !== DELTA_NEUTRAL_PRESET ||
    record?.wallet !== expectedWallet ||
    !(
      runId === null ||
      (typeof runId === "string" && runId.startsWith("ribbot-"))
    ) ||
    typeof record?.launching !== "boolean" ||
    typeof record?.running !== "boolean" ||
    typeof record?.stopRequested !== "boolean" ||
    completedCycles === null ||
    maxCycles !== DELTA_NEUTRAL_MAX_CYCLES ||
    dailyBudgetUsd !== DELTA_NEUTRAL_DAILY_BUDGET_USD ||
    estimatedRunCostUsd === null ||
    completedVolumeUsd === null ||
    !(
      startedAtUnix === null ||
      (typeof startedAtUnix === "number" && Number.isSafeInteger(startedAtUnix))
    ) ||
    !(
      stoppedAtUnix === null ||
      (typeof stoppedAtUnix === "number" && Number.isSafeInteger(stoppedAtUnix))
    ) ||
    !(lastMessage === null || typeof lastMessage === "string") ||
    typeof record?.failed !== "boolean"
  ) {
    return null;
  }
  return {
    strategy: DELTA_NEUTRAL_STRATEGY,
    preset: DELTA_NEUTRAL_PRESET,
    wallet: expectedWallet,
    runId: runId as string | null,
    launching: record.launching,
    running: record.running,
    stopRequested: record.stopRequested,
    completedCycles,
    maxCycles,
    dailyBudgetUsd,
    estimatedRunCostUsd,
    completedVolumeUsd,
    startedAtUnix: startedAtUnix as number | null,
    stoppedAtUnix: stoppedAtUnix as number | null,
    lastMessage: lastMessage as string | null,
    failed: record.failed,
  };
}

function deltaNeutralServiceStatusValue(
  value: unknown,
  expectedWallet: string,
): {
  configured: boolean;
  enabled: boolean;
  liveEnabled: boolean;
  run: DeltaNeutralServiceRunStatus | null;
} | null {
  const record = recordValue(value);
  if (
    typeof record?.configured !== "boolean" ||
    typeof record?.enabled !== "boolean" ||
    typeof record?.liveEnabled !== "boolean" ||
    record?.strategy !== DELTA_NEUTRAL_STRATEGY ||
    record?.preset !== DELTA_NEUTRAL_PRESET
  ) {
    return null;
  }
  const run =
    record.run === null
      ? null
      : deltaNeutralRunStatusValue(record.run, expectedWallet);
  if (record.run !== null && !run) return null;
  return {
    configured: record.configured,
    enabled: record.enabled,
    liveEnabled: record.liveEnabled,
    run,
  };
}

function deltaNeutralRunState(run: DeltaNeutralServiceRunStatus): string {
  if (run.failed) return "failed";
  if (run.launching) return "launching";
  if (run.running) return run.stopRequested ? "stopping" : "running";
  if (run.completedCycles >= run.maxCycles) return "completed";
  if (run.stoppedAtUnix !== null || run.stopRequested) return "stopped";
  return "idle";
}

function deltaNeutralStoredRunValue(
  row: TradingBotDeltaNeutralRunRow,
): DeltaNeutralServiceRunStatus | Record<string, unknown> {
  try {
    const parsed = deltaNeutralRunStatusValue(
      JSON.parse(row.service_status_json),
      row.wallet_address,
    );
    if (parsed) return parsed;
  } catch {
    // Return the durable FTX metadata when service state is not yet available.
  }
  return {
    runId: row.run_id,
    wallet: row.wallet_address,
    strategy: DELTA_NEUTRAL_STRATEGY,
    preset: DELTA_NEUTRAL_PRESET,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function tradingBotAccountStore(
  env: Env,
  telegramUserId: string,
): DurableObjectStub | null {
  if (!env.TRADING_BOT_ACCOUNTS) return null;
  return env.TRADING_BOT_ACCOUNTS.get(
    env.TRADING_BOT_ACCOUNTS.idFromName(telegramUserId),
  );
}

function tradingBotOrderStore(env: Env): DurableObjectStub | null {
  if (!env.TRADING_BOT_ACCOUNTS) return null;
  return env.TRADING_BOT_ACCOUNTS.get(
    env.TRADING_BOT_ACCOUNTS.idFromName(TRADING_BOT_ORDER_STORE_NAME),
  );
}

function evaluateTradingBotScheduledOrder(
  order: TradingBotStoredAutomationOrderSnapshot,
  price: JupiterPriceEntry | undefined,
  now: Date,
): TradingBotScheduledOrderEvaluation {
  const nowIso = now.toISOString();
  const scheduler: TradingBotAutomationOrderSchedulerState = {
    ...order.scheduler,
    lastCheckedAt: nowIso,
  };

  if (order.kind === "dca") {
    const nextRunAt = order.scheduler.nextRunAt
      ? Date.parse(order.scheduler.nextRunAt)
      : undefined;
    if (nextRunAt && Number.isFinite(nextRunAt) && nextRunAt > now.getTime()) {
      return {
        status: "not_due",
        order,
        scheduler,
        reason: `Next DCA slice is due at ${order.scheduler.nextRunAt}`,
      };
    }
    const executedCount = order.scheduler.executedCount ?? 0;
    if (order.orderCount !== undefined && executedCount >= order.orderCount) {
      return {
        status: "waiting",
        order,
        scheduler,
        reason: "DCA order has no remaining slices",
      };
    }
    return {
      status: "triggered",
      order,
      scheduler: {
        ...scheduler,
        lastTriggerAt: nowIso,
        lastTriggerReason: "DCA interval is due",
      },
      reason: "DCA interval is due",
      executeAmountIn: order.perOrderAmountIn ?? order.amountIn,
    };
  }

  const currentPriceUsd = price?.usdPrice;
  if (
    currentPriceUsd === undefined ||
    !Number.isFinite(currentPriceUsd) ||
    currentPriceUsd <= 0
  ) {
    return {
      status: "unpriced",
      order,
      scheduler: {
        ...scheduler,
        lastError: "Jupiter Price V3 price unavailable",
      },
      reason: "Jupiter Price V3 price unavailable",
    };
  }

  scheduler.lastPriceUsd = currentPriceUsd;

  if (order.kind === "trailing") {
    const previousPeak = order.scheduler.peakPriceUsd ?? currentPriceUsd;
    const peakPriceUsd = Math.max(previousPeak, currentPriceUsd);
    scheduler.peakPriceUsd = peakPriceUsd;
    const trailingBps = order.trailingBps ?? 0;
    const triggerPriceUsd = peakPriceUsd * (1 - trailingBps / 10_000);
    if (trailingBps > 0 && currentPriceUsd <= triggerPriceUsd) {
      return {
        status: "triggered",
        order,
        scheduler: {
          ...scheduler,
          lastTriggerAt: now.toISOString(),
          lastTriggerReason: `Trailing stop triggered at ${currentPriceUsd}`,
        },
        reason: `Trailing stop triggered at ${currentPriceUsd}`,
        currentPriceUsd,
        executeAmountIn: order.amountIn,
      };
    }
    return {
      status: "waiting",
      order,
      scheduler,
      reason: `Current price ${currentPriceUsd} is above trailing trigger ${triggerPriceUsd}`,
      currentPriceUsd,
    };
  }

  const triggerPriceUsd = Number(order.triggerPrice);
  if (!Number.isFinite(triggerPriceUsd) || triggerPriceUsd <= 0) {
    return {
      status: "failed",
      order,
      scheduler: {
        ...scheduler,
        lastError: "Order trigger price is invalid",
      },
      reason: "Order trigger price is invalid",
      currentPriceUsd,
    };
  }

  const triggered =
    order.triggerDirection === "above"
      ? currentPriceUsd >= triggerPriceUsd
      : currentPriceUsd <= triggerPriceUsd;
  if (!triggered) {
    return {
      status: "waiting",
      order,
      scheduler,
      reason: `Current price ${currentPriceUsd} has not crossed ${order.triggerDirection} ${triggerPriceUsd}`,
      currentPriceUsd,
    };
  }

  return {
    status: "triggered",
    order,
    scheduler: {
      ...scheduler,
      lastTriggerAt: nowIso,
      lastTriggerReason: `Current price ${currentPriceUsd} crossed ${order.triggerDirection} ${triggerPriceUsd}`,
    },
    reason: `Current price ${currentPriceUsd} crossed ${order.triggerDirection} ${triggerPriceUsd}`,
    currentPriceUsd,
    executeAmountIn: order.amountIn,
  };
}

function schedulerAfterDryRunTrigger(
  order: TradingBotStoredAutomationOrderSnapshot,
  scheduler: TradingBotAutomationOrderSchedulerState,
  now: Date,
): TradingBotAutomationOrderSchedulerState {
  const next = {
    ...scheduler,
    dryRunTriggerCount: (scheduler.dryRunTriggerCount ?? 0) + 1,
  };
  if (order.kind === "dca" && order.intervalMinutes) {
    next.nextRunAt = new Date(
      now.getTime() + order.intervalMinutes * 60_000,
    ).toISOString();
  }
  return next;
}

function schedulerAfterScheduledExecution(
  order: TradingBotStoredAutomationOrderSnapshot,
  scheduler: TradingBotAutomationOrderSchedulerState,
  now: Date,
): TradingBotAutomationOrderSchedulerState {
  if (order.kind !== "dca") return scheduler;
  const executedCount = (scheduler.executedCount ?? 0) + 1;
  const next: TradingBotAutomationOrderSchedulerState = {
    ...scheduler,
    executedCount,
  };
  if (!order.orderCount || executedCount < order.orderCount) {
    next.nextRunAt = new Date(
      now.getTime() + (order.intervalMinutes ?? 1) * 60_000,
    ).toISOString();
  }
  return next;
}

function scheduledOrderStatusAfterExecution(
  order: TradingBotStoredAutomationOrderSnapshot,
  scheduler: TradingBotAutomationOrderSchedulerState,
): TradingBotStoredAutomationOrderStatus {
  if (order.kind !== "dca") return "executed";
  return (scheduler.executedCount ?? 0) >= (order.orderCount ?? 1)
    ? "executed"
    : "staged";
}

async function evaluateTradingBotAdvancedAutomationConfig(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
  env: Env,
  now: Date,
): Promise<TradingBotAdvancedAutomationMonitorEvaluation> {
  const nowIso = now.toISOString();
  const monitor: TradingBotAdvancedAutomationMonitorState = {
    ...config.monitor,
    lastCheckedAt: nowIso,
  };
  delete monitor.lastError;

  if (config.kind === "auto_buy") {
    return evaluateTradingBotAutoBuyMonitorConfig(config, env, monitor);
  }

  if (config.kind === "auto_sell") {
    return evaluateTradingBotAutoSellMonitorConfig(
      config,
      env,
      nowIso,
      monitor,
    );
  }

  if (config.kind === "sniper") {
    return evaluateTradingBotSniperMonitorConfig(config, env, now, monitor);
  }

  if (
    !config.targetWallet ||
    !SOLANA_ADDRESS_PATTERN.test(config.targetWallet)
  ) {
    return {
      status: "failed",
      config,
      monitor: {
        ...monitor,
        lastError: "Copytrade target wallet is invalid",
      },
      reason: "Copytrade target wallet is invalid",
    };
  }

  const rpcUrl = resolveRpcUrl(env);
  if (!rpcUrl) {
    return {
      status: "failed",
      config,
      monitor: {
        ...monitor,
        lastError: "SOLANA_RPC_URL is required for copytrade monitoring",
      },
      reason: "SOLANA_RPC_URL is required for copytrade monitoring",
    };
  }

  try {
    const signatures = await loadSolanaSignaturesForAddress(
      env,
      config.targetWallet,
      10,
    );
    const latest = signatures[0];
    if (!latest?.signature) {
      return {
        status: "waiting",
        config,
        monitor,
        reason: "No target wallet signatures observed",
      };
    }

    if (!config.monitor.lastObservedSignature) {
      return {
        status: "baseline",
        config,
        monitor: {
          ...monitor,
          lastObservedSignature: latest.signature,
        },
        reason: "Baseline target wallet signature recorded",
      };
    }

    if (latest.signature === config.monitor.lastObservedSignature) {
      return {
        status: "waiting",
        config,
        monitor,
        reason: "No new target wallet signature observed",
      };
    }

    return {
      status: "observed",
      config,
      monitor: {
        ...monitor,
        lastObservedSignature: latest.signature,
        lastMatchedAt: nowIso,
        matchCount: (config.monitor.matchCount ?? 0) + 1,
      },
      reason: "New target wallet signature observed",
      observedSignature: latest.signature,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      config,
      monitor: {
        ...monitor,
        lastError: message.slice(0, 240),
      },
      reason: message,
    };
  }
}

async function evaluateTradingBotSniperMonitorConfig(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
  env: Env,
  now: Date,
  monitor: TradingBotAdvancedAutomationMonitorState,
): Promise<TradingBotAdvancedAutomationMonitorEvaluation> {
  const maxSnipes = config.maxSnipes ?? 0;
  if (maxSnipes < 1) {
    return {
      status: "failed",
      config,
      monitor: { ...monitor, lastError: "Sniper max-snipes cap is invalid" },
      reason: "Sniper max-snipes cap is invalid",
    };
  }
  if ((config.monitor.executedCount ?? 0) >= maxSnipes) {
    return {
      status: "waiting",
      config,
      monitor,
      reason: "Sniper max-snipes cap has been reached",
    };
  }

  const cooldownSeconds = clampInteger(
    numberValue(env.TRADING_BOT_SNIPER_COOLDOWN_SECONDS),
    1,
    86_400,
    DEFAULT_TRADING_BOT_SNIPER_COOLDOWN_SECONDS,
  );
  const lastTriggerAtMs = config.monitor.lastTriggerAt
    ? Date.parse(config.monitor.lastTriggerAt)
    : NaN;
  if (
    Number.isFinite(lastTriggerAtMs) &&
    now.getTime() - lastTriggerAtMs < cooldownSeconds * 1000
  ) {
    return {
      status: "waiting",
      config,
      monitor,
      reason: `Sniper cooldown remains active for ${cooldownSeconds} seconds after a match`,
    };
  }

  let launches: JupiterRecentToken[];
  try {
    launches = await fetchJupiterRecentTokens(env);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      config,
      monitor: { ...monitor, lastError: reason.slice(0, 240) },
      reason,
    };
  }
  const latest = launches.at(-1);
  if (!latest) {
    return {
      status: "waiting",
      config,
      monitor: { ...monitor, lastError: "Jupiter returned no recent pools" },
      reason: "Jupiter returned no recent pools",
    };
  }

  if (!config.monitor.launchCursorAt || !config.monitor.launchCursorId) {
    return {
      status: "baseline",
      config,
      monitor: {
        ...monitor,
        launchCursorAt: latest.firstPoolCreatedAt,
        launchCursorId: latest.firstPoolId,
        lastObservedMint: latest.mint,
      },
      reason:
        "Baseline recent-pool cursor recorded; existing pools were not traded",
      observedMint: latest.mint,
    };
  }

  const processed = new Set(config.monitor.processedMints ?? []);
  const unseen = launches.filter(
    (launch) =>
      launchAfterCursor(
        launch,
        config.monitor.launchCursorAt!,
        config.monitor.launchCursorId!,
      ) && !processed.has(launch.mint),
  );
  const candidate = unseen.find((launch) =>
    sniperSourceMatchesLaunch(config.source ?? "any", launch.launchpad),
  );
  if (!candidate) {
    return {
      status: "waiting",
      config,
      monitor: {
        ...monitor,
        launchCursorAt: latest.firstPoolCreatedAt,
        launchCursorId: latest.firstPoolId,
        lastObservedMint: latest.mint,
      },
      reason:
        unseen.length > 0
          ? `No new Jupiter pool matched sniper source ${config.source ?? "any"}`
          : "No new Jupiter first-pool launch observed",
      observedMint: latest.mint,
    };
  }

  const processedMints = [
    ...(config.monitor.processedMints ?? []).filter(
      (mint) => mint !== candidate.mint,
    ),
    candidate.mint,
  ].slice(-MAX_TRADING_BOT_SNIPER_PROCESSED_MINTS);
  const candidateMonitor: TradingBotAdvancedAutomationMonitorState = {
    ...monitor,
    launchCursorAt: candidate.firstPoolCreatedAt,
    launchCursorId: candidate.firstPoolId,
    launchpad: candidate.launchpad ?? "unclassified",
    launchName: candidate.name,
    launchSymbol: candidate.symbol,
    launchLiquidityUsd: candidate.liquidityUsd,
    launchMarketCapUsd: candidate.marketCapUsd,
    launchOrganicScore: candidate.organicScore,
    processedMints,
    lastObservedSignature: candidate.firstPoolId,
    lastObservedMint: candidate.mint,
  };
  const rejection = sniperLaunchCandidateRejection(config, candidate);
  if (rejection) {
    return {
      status: "failed",
      config,
      monitor: {
        ...candidateMonitor,
        lastError: rejection,
      },
      reason: rejection,
      observedSignature: candidate.firstPoolId,
      observedMint: candidate.mint,
      currentPriceUsd: candidate.usdPrice,
      launchCandidate: candidate,
    };
  }

  const nowIso = now.toISOString();
  const reason = `New ${candidate.launchpad ?? "unclassified"} first pool matched sniper filters`;
  return {
    status: "observed",
    config,
    monitor: {
      ...candidateMonitor,
      lastMatchedAt: nowIso,
      lastTriggerAt: nowIso,
      lastTriggerReason: reason,
      matchCount: (config.monitor.matchCount ?? 0) + 1,
    },
    reason,
    observedSignature: candidate.firstPoolId,
    observedMint: candidate.mint,
    currentPriceUsd: candidate.usdPrice,
    launchCandidate: candidate,
  };
}

function launchAfterCursor(
  launch: JupiterRecentToken,
  cursorAt: string,
  cursorId: string,
): boolean {
  const launchTime = Date.parse(launch.firstPoolCreatedAt);
  const cursorTime = Date.parse(cursorAt);
  if (!Number.isFinite(cursorTime)) return true;
  if (launchTime !== cursorTime) return launchTime > cursorTime;
  return launch.firstPoolId.localeCompare(cursorId) > 0;
}

function sniperSourceMatchesLaunch(
  source: TradingBotSniperSource,
  launchpad?: string,
): boolean {
  if (source === "any") return true;
  const normalized = launchpad?.toLowerCase().replace(/[^a-z0-9]+/g, "") ?? "";
  if (!normalized) return false;
  if (source === "pump") return normalized.includes("pump");
  if (source === "raydium") return normalized.includes("raydium");
  return normalized.includes("moonshot");
}

function sniperLaunchCandidateRejection(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
  launch: JupiterRecentToken,
): string | undefined {
  if (launch.mintAuthority) {
    return "Sniper rejected launch because mint authority is still enabled";
  }
  if (launch.freezeAuthority) {
    return "Sniper rejected launch because freeze authority is still enabled";
  }
  if (
    launch.liquidityUsd === undefined ||
    launch.liquidityUsd < config.minLiquidityUsd
  ) {
    return `Sniper rejected launch because Jupiter liquidity is below $${config.minLiquidityUsd}`;
  }
  if (config.maxMarketCapUsd !== undefined) {
    if (launch.marketCapUsd === undefined) {
      return "Sniper rejected launch because Jupiter market cap is unavailable";
    }
    if (launch.marketCapUsd > config.maxMarketCapUsd) {
      return `Sniper rejected launch because market cap exceeds $${config.maxMarketCapUsd}`;
    }
  }
  return undefined;
}

async function evaluateTradingBotAutoBuyMonitorConfig(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
  env: Env,
  monitor: TradingBotAdvancedAutomationMonitorState,
): Promise<TradingBotAdvancedAutomationMonitorEvaluation> {
  if (!config.mint || !SOLANA_ADDRESS_PATTERN.test(config.mint)) {
    return {
      status: "failed",
      config,
      monitor: {
        ...monitor,
        lastError: "Auto-buy token mint is invalid",
      },
      reason: "Auto-buy token mint is invalid",
    };
  }

  const prices = await fetchJupiterPrices(env, [config.mint]);
  const currentPriceUsd = prices[config.mint]?.usdPrice;
  const nextMonitor: TradingBotAdvancedAutomationMonitorState = {
    ...monitor,
    lastObservedMint: config.mint,
    lastError: "Auto-buy liquidity monitoring source is not configured yet",
  };
  if (
    currentPriceUsd !== undefined &&
    Number.isFinite(currentPriceUsd) &&
    currentPriceUsd > 0
  ) {
    nextMonitor.lastPriceUsd = currentPriceUsd;
  } else {
    return {
      status: "waiting",
      config,
      monitor: {
        ...nextMonitor,
        lastError: "Jupiter Price V3 price unavailable",
      },
      reason: "Jupiter Price V3 price unavailable",
      observedMint: config.mint,
    };
  }

  const liveAutoBuy =
    isTradingBotAutoBuyLiveExecutionEnabled(env) &&
    isTradingBotLiveExecutionEnabled(env);
  if (liveAutoBuy) {
    const reason =
      "Auto-buy live execution requested after price availability check";
    return {
      status: "observed",
      config,
      monitor: {
        ...nextMonitor,
        lastMatchedAt: monitor.lastCheckedAt,
        lastTriggerAt: monitor.lastCheckedAt,
        lastTriggerReason: reason,
        matchCount: (config.monitor.matchCount ?? 0) + 1,
      },
      reason,
      observedMint: config.mint,
      currentPriceUsd: nextMonitor.lastPriceUsd,
    };
  }

  return {
    status: "unsupported",
    config,
    monitor: nextMonitor,
    reason: "Auto-buy liquidity monitoring source is not configured yet",
    observedMint: config.mint,
    ...(nextMonitor.lastPriceUsd !== undefined
      ? { currentPriceUsd: nextMonitor.lastPriceUsd }
      : {}),
  };
}

async function evaluateTradingBotAutoSellMonitorConfig(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
  env: Env,
  nowIso: string,
  monitor: TradingBotAdvancedAutomationMonitorState,
): Promise<TradingBotAdvancedAutomationMonitorEvaluation> {
  if (!config.mint || !SOLANA_ADDRESS_PATTERN.test(config.mint)) {
    return {
      status: "failed",
      config,
      monitor: {
        ...monitor,
        lastError: "Auto-sell token mint is invalid",
      },
      reason: "Auto-sell token mint is invalid",
    };
  }

  if (!config.triggerPrice || !config.triggerDirection) {
    return {
      status: "unsupported",
      config,
      monitor: {
        ...monitor,
        lastObservedMint: config.mint,
        lastError: "Auto-sell trigger price is not configured",
      },
      reason: "Auto-sell trigger price is not configured",
      observedMint: config.mint,
    };
  }

  const triggerPriceUsd = Number(config.triggerPrice);
  if (!Number.isFinite(triggerPriceUsd) || triggerPriceUsd <= 0) {
    return {
      status: "failed",
      config,
      monitor: {
        ...monitor,
        lastObservedMint: config.mint,
        lastError: "Auto-sell trigger price is invalid",
      },
      reason: "Auto-sell trigger price is invalid",
      observedMint: config.mint,
    };
  }

  const prices = await fetchJupiterPrices(env, [config.mint]);
  const currentPriceUsd = prices[config.mint]?.usdPrice;
  if (
    currentPriceUsd === undefined ||
    !Number.isFinite(currentPriceUsd) ||
    currentPriceUsd <= 0
  ) {
    return {
      status: "waiting",
      config,
      monitor: {
        ...monitor,
        lastObservedMint: config.mint,
        lastError: "Jupiter Price V3 price unavailable",
      },
      reason: "Jupiter Price V3 price unavailable",
      observedMint: config.mint,
      triggerPrice: triggerPriceUsd,
      triggerDirection: config.triggerDirection,
    };
  }

  const baseMonitor: TradingBotAdvancedAutomationMonitorState = {
    ...monitor,
    lastObservedMint: config.mint,
    lastPriceUsd: currentPriceUsd,
  };
  const triggered =
    config.triggerDirection === "above"
      ? currentPriceUsd >= triggerPriceUsd
      : currentPriceUsd <= triggerPriceUsd;
  if (!triggered) {
    return {
      status: "waiting",
      config,
      monitor: baseMonitor,
      reason: `Current price ${currentPriceUsd} has not crossed ${config.triggerDirection} ${triggerPriceUsd}`,
      observedMint: config.mint,
      currentPriceUsd,
      triggerPrice: triggerPriceUsd,
      triggerDirection: config.triggerDirection,
    };
  }

  const reason = `Current price ${currentPriceUsd} crossed ${config.triggerDirection} ${triggerPriceUsd}`;
  return {
    status: "observed",
    config,
    monitor: {
      ...baseMonitor,
      lastMatchedAt: nowIso,
      lastTriggerAt: nowIso,
      lastTriggerReason: reason,
      matchCount: (config.monitor.matchCount ?? 0) + 1,
    },
    reason,
    observedMint: config.mint,
    currentPriceUsd,
    triggerPrice: triggerPriceUsd,
    triggerDirection: config.triggerDirection,
  };
}

async function claimStoredAutomationOrderForExecution(
  store: DurableObjectStub,
  order: TradingBotStoredAutomationOrderSnapshot,
): Promise<{
  executionId: string;
  order: TradingBotStoredAutomationOrderSnapshot;
} | null> {
  const executionId = `scheduled:${crypto.randomUUID()}`;
  const executionReferenceId = await tradingBotExecutionReferenceId(
    order.telegramUserId,
    executionId,
  );
  const response = await store.fetch(
    new Request("https://trading-bot-account.local/automation-order/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telegramUserId: order.telegramUserId,
        orderId: order.orderId,
        executionId,
        executionReferenceId,
      }),
    }),
  );
  if (response.status === 409) return null;
  if (!response.ok) {
    console.warn(
      "[trading-bot] Scheduled order claim failed",
      order.orderId,
      response.status,
    );
    return null;
  }

  const data = (await response.json()) as {
    status?: string;
    executionId?: string;
    order?: TradingBotStoredAutomationOrderSnapshot;
  };
  if (data.status !== "claimed" || !data.executionId || !data.order) {
    console.warn(
      "[trading-bot] Scheduled order claim returned an invalid response",
    );
    return null;
  }
  return { executionId: data.executionId, order: data.order };
}

async function executeTradingBotScheduledOrder(
  order: TradingBotStoredAutomationOrderSnapshot,
  amountIn: string,
  executionId: string,
  env: Env,
): Promise<TradingBotScheduledOrderExecutionResult> {
  const token = resolveTradingBotToken(env);
  if (!token) {
    return {
      ok: false,
      error: "RIBBOT_TRADING_BOT_TOKEN is not configured",
      reconciliationRequired: false,
    };
  }

  const response = await postTradingBotExecution(
    new Request(
      "https://trading-bot-scheduler.local/api/frogx/trading-bot/execute",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orderId: executionId,
          telegramUserId: order.telegramUserId,
          userPublicKey: order.walletAddress,
          inMint: order.inMint,
          outMint: order.outMint,
          amountIn,
          slippageBps: order.slippageBps,
          priorityFee: order.priorityFee,
        }),
      },
    ),
    env,
  );
  const data = (await response.json()) as {
    status?: string;
    error?: string;
    signature?: string | null;
    transactionId?: string | null;
    referenceId?: string | null;
    solscanUrl?: string | null;
  };
  if (response.ok && data.status === "executed") {
    return {
      ok: true,
      signature: data.signature,
      transactionId: data.transactionId,
      referenceId: data.referenceId,
      solscanUrl: data.solscanUrl,
    };
  }
  return {
    ok: false,
    error:
      data.error ?? `Scheduled execution failed with status ${response.status}`,
    reconciliationRequired: response.status >= 500,
  };
}

async function executeTradingBotCopyTradeConfig(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
  evaluation: TradingBotAdvancedAutomationMonitorEvaluation,
  executionId: string,
  env: Env,
): Promise<TradingBotAdvancedAutomationExecutionResult> {
  const token = resolveTradingBotToken(env);
  if (!token)
    return { ok: false, error: "RIBBOT_TRADING_BOT_TOKEN is not configured" };
  if (config.kind !== "copytrade") {
    return {
      ok: false,
      error: "Only copytrade configs can execute from this path",
    };
  }
  if (
    !config.targetWallet ||
    !SOLANA_ADDRESS_PATTERN.test(config.targetWallet)
  ) {
    return { ok: false, error: "Copytrade target wallet is invalid" };
  }
  if (!evaluation.observedSignature) {
    return {
      ok: false,
      error: "Copytrade execution requires an observed signature",
    };
  }

  const accountResult = await getStoredTradingBotAccount(
    env,
    config.telegramUserId,
  );
  if ("error" in accountResult) {
    return { ok: false, error: accountResult.error };
  }
  const account = accountResult.account;
  if (!account) return { ok: false, error: "Trading account not found" };
  const spotWallet = spotNftPrivyWallet(account);
  if (!spotWallet) {
    return {
      ok: false,
      error: "Copytrade execution requires Spot & NFT Wallet (Privy)",
    };
  }
  if (spotWallet.solanaWalletAddress !== config.walletAddress) {
    return { ok: false, error: "Trading wallet mismatch" };
  }

  let intent: TradingBotCopyTradeIntent;
  let amountIn: string;
  try {
    const transaction = await loadSolanaParsedTransaction(
      env,
      evaluation.observedSignature,
    );
    const derived = deriveTradingBotCopyTradeIntent(
      config,
      transaction,
      evaluation.observedSignature,
    );
    if ("error" in derived) {
      return { ok: false, error: derived.error };
    }
    intent = derived.intent;

    if (intent.side === "buy") {
      amountIn = intent.amountIn ?? "";
      if (!/^[1-9]\d*$/.test(amountIn)) {
        return { ok: false, error: "Copytrade buy amount is invalid" };
      }
      const positions = await loadTradingBotPositions(
        env,
        config.walletAddress,
      );
      if (
        config.duplicateBuys === false &&
        positions.tokens.some(
          (token) => token.mint === intent.mint && BigInt(token.amount) > 0n,
        )
      ) {
        return {
          ok: false,
          error: "Copytrade duplicate buy is disabled for an existing position",
        };
      }
      if (BigInt(positions.sol.lamports) < BigInt(amountIn)) {
        return {
          ok: false,
          error: "Copytrade SOL balance is below the copied buy amount",
        };
      }

      const review = await loadTradingBotMarketRisk(env, {
        telegramUserId: config.telegramUserId,
        userPublicKey: config.walletAddress,
        mint: intent.mint,
        amountIn,
        slippageBps: config.slippageBps,
        priorityFee: config.priorityFee,
        minLiquidityUsd: config.minLiquidityUsd,
        maxMarketCapUsd: config.maxMarketCapUsd,
        maxPriceImpactBps: Math.max(config.slippageBps, 1500),
        requestUrl:
          "https://trading-bot-advanced-monitor.local/api/frogx/trading-bot/market-risk",
      });
      const danger = review.risk.flags.find(
        (flag) => flag.severity === "danger",
      );
      if (danger) {
        return {
          ok: false,
          error: `Copytrade market-risk check failed: ${danger.message}`,
        };
      }
      if (
        config.onlyRenounced &&
        review.tokenSafety.mintAccount?.mintAuthority
      ) {
        return {
          ok: false,
          error: "Copytrade requires a renounced mint authority",
        };
      }
      if (config.minMarketCapUsd !== undefined) {
        if (review.marketCap.usd === null) {
          return {
            ok: false,
            error: "Copytrade minimum market cap could not be verified",
          };
        }
        if (review.marketCap.usd < config.minMarketCapUsd) {
          return {
            ok: false,
            error: "Copytrade market cap is below the configured minimum",
          };
        }
      }
      if (review.quoteProbe.status !== "ready") {
        return {
          ok: false,
          error: `Copytrade blocked before execution: ${tradingBotQuoteProbeBlockingReason(review.quoteProbe)}`,
        };
      }
      if (!review.quoteProbe.executable) {
        return { ok: false, error: "Copytrade quote probe is not executable" };
      }
    } else {
      if (!config.copySells) {
        return {
          ok: false,
          error: "Copy-sell execution is disabled for this config",
        };
      }
      const positions = await loadTradingBotPositions(
        env,
        config.walletAddress,
      );
      const tokenPosition = positions.tokens.find(
        (token) => token.mint === intent.mint,
      );
      if (!tokenPosition) {
        return {
          ok: false,
          error: "Copytrade sell token balance is unavailable",
        };
      }
      const sellBps = clampInteger(intent.sellBps, 1, 10_000, 10_000);
      amountIn = (
        (BigInt(tokenPosition.amount) * BigInt(sellBps)) /
        10_000n
      ).toString();
      if (amountIn === "0") {
        return { ok: false, error: "Copytrade sell amount rounds to zero" };
      }
      intent = {
        ...intent,
        sellBps,
        amountIn,
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const response = await postTradingBotExecution(
    new Request(
      "https://trading-bot-advanced-monitor.local/api/frogx/trading-bot/execute",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orderId: executionId,
          telegramUserId: config.telegramUserId,
          userPublicKey: config.walletAddress,
          inMint: intent.side === "buy" ? WRAPPED_SOL_MINT : intent.mint,
          outMint: intent.side === "buy" ? intent.mint : WRAPPED_SOL_MINT,
          amountIn,
          slippageBps: config.slippageBps,
          priorityFee:
            intent.side === "sell"
              ? (config.sellPriorityFee ?? config.priorityFee)
              : config.priorityFee,
        }),
      },
    ),
    env,
  );
  const data = (await response.json()) as {
    status?: string;
    error?: string;
    signature?: string | null;
    transactionId?: string | null;
    referenceId?: string | null;
    solscanUrl?: string | null;
  };
  if (response.ok && data.status === "executed") {
    return {
      ok: true,
      signature: data.signature,
      transactionId: data.transactionId,
      referenceId: data.referenceId,
      solscanUrl: data.solscanUrl,
      copyTradeSide: intent.side,
      mint: intent.mint,
      amountIn,
      sellBps: intent.side === "sell" ? (intent.sellBps ?? null) : null,
      observedSignature: intent.targetSignature,
    };
  }
  if (data.status === "pending_reconciliation") {
    return {
      ok: false,
      error: data.error ?? "Copytrade execution requires reconciliation",
      reconciliationRequired: true,
      referenceId: data.referenceId,
      transactionId: data.transactionId,
      copyTradeSide: intent.side,
      mint: intent.mint,
      amountIn,
      sellBps: intent.side === "sell" ? (intent.sellBps ?? null) : null,
      observedSignature: intent.targetSignature,
    };
  }
  return {
    ok: false,
    error:
      data.error ?? `Copytrade execution failed with status ${response.status}`,
  };
}

async function executeTradingBotBundleBuyConfig(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
  env: Env,
  store: DurableObjectStub,
): Promise<TradingBotBundleBuyExecutionResult> {
  const token = resolveTradingBotToken(env);
  if (!token) {
    return bundleBuyExecutionFailure(
      "RIBBOT_TRADING_BOT_TOKEN is not configured",
    );
  }
  if (config.kind !== "bundle_buy") {
    return bundleBuyExecutionFailure(
      "Only bundle-buy configs can execute from this path",
    );
  }
  const items = config.bundleItems ?? [];
  if (items.length < 2) {
    return bundleBuyExecutionFailure(
      "Bundle-buy basket has no executable items",
    );
  }

  const accountResult = await getStoredTradingBotAccount(
    env,
    config.telegramUserId,
  );
  if ("error" in accountResult) {
    return bundleBuyExecutionFailure(accountResult.error);
  }
  const account = accountResult.account;
  if (!account) return bundleBuyExecutionFailure("Trading account not found");
  const spotWallet = spotNftPrivyWallet(account);
  if (!spotWallet?.privyWalletId) {
    return bundleBuyExecutionFailure(
      "Bundle-buy execution requires Spot & NFT Wallet (Privy)",
    );
  }
  if (spotWallet.solanaWalletAddress !== config.walletAddress) {
    return bundleBuyExecutionFailure("Trading wallet mismatch");
  }
  if (account.botAccessRevokedAt) {
    return bundleBuyExecutionFailure(
      "FTX bot access has been revoked for this account",
    );
  }

  try {
    const positions = await loadTradingBotPositions(env, config.walletAddress);
    if (BigInt(positions.sol.lamports) < BigInt(config.maxBuyAmountIn)) {
      return bundleBuyExecutionFailure(
        "Bundle-buy SOL balance is below the basket total",
      );
    }

    for (const item of items) {
      const review = await loadTradingBotMarketRisk(env, {
        telegramUserId: config.telegramUserId,
        userPublicKey: config.walletAddress,
        mint: item.mint,
        amountIn: item.maxBuyAmountIn,
        slippageBps: config.slippageBps,
        priorityFee: config.priorityFee,
        minLiquidityUsd: config.minLiquidityUsd,
        maxMarketCapUsd: config.maxMarketCapUsd,
        maxPriceImpactBps: Math.max(config.slippageBps, 1500),
        requestUrl:
          "https://trading-bot-bundle-buy.local/api/frogx/trading-bot/market-risk",
      });
      const danger = review.risk.flags.find(
        (flag) => flag.severity === "danger",
      );
      if (danger) {
        return bundleBuyExecutionFailure(
          `Bundle-buy market-risk check failed for ${item.mint}: ${danger.message}`,
        );
      }
      if (review.quoteProbe.status !== "ready") {
        return bundleBuyExecutionFailure(
          `Bundle-buy blocked before execution for ${item.mint}: ${tradingBotQuoteProbeBlockingReason(review.quoteProbe)}`,
        );
      }
      if (!review.quoteProbe.executable) {
        return bundleBuyExecutionFailure(
          `Bundle-buy quote probe is not executable for ${item.mint}`,
        );
      }
    }
  } catch (error) {
    return bundleBuyExecutionFailure(
      error instanceof Error ? error.message : String(error),
    );
  }

  const executions: TradingBotBundleBuyExecutionItemResult[] = [];
  for (const [index, item] of items.entries()) {
    const attemptedItems = index + 1;
    const orderId = await bundleBuyItemOrderId(config.configId, index);
    await updateStoredAdvancedAutomationConfigMonitor(
      store,
      config,
      {
        ...config.monitor,
        bundleAttemptedItems: attemptedItems,
        bundleConfirmedItems: executions.length,
      },
      "executing",
      false,
      { status: "executing" },
    );
    const response = await postTradingBotExecution(
      new Request(
        "https://trading-bot-bundle-buy.local/api/frogx/trading-bot/execute",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            orderId,
            telegramUserId: config.telegramUserId,
            userPublicKey: config.walletAddress,
            inMint: WRAPPED_SOL_MINT,
            outMint: item.mint,
            amountIn: item.maxBuyAmountIn,
            slippageBps: config.slippageBps,
            priorityFee: config.priorityFee,
          }),
        },
      ),
      env,
    );
    const data = (await response.json()) as {
      status?: string;
      error?: string;
      signature?: string | null;
      transactionId?: string | null;
      referenceId?: string | null;
      solscanUrl?: string | null;
    };
    if (data.status === "pending_reconciliation") {
      return bundleBuyExecutionFailure(
        data.error ??
          `Bundle-buy item ${attemptedItems} requires reconciliation`,
        attemptedItems,
        executions,
        true,
      );
    }
    if (!response.ok || data.status !== "executed") {
      return bundleBuyExecutionFailure(
        data.error ??
          `Bundle-buy item ${attemptedItems} execution failed with status ${response.status}`,
        attemptedItems,
        executions,
      );
    }
    executions.push({
      mint: item.mint,
      amountIn: item.maxBuyAmountIn,
      signature: data.signature,
      transactionId: data.transactionId,
      referenceId: data.referenceId,
      solscanUrl: data.solscanUrl,
    });
    await updateStoredAdvancedAutomationConfigMonitor(
      store,
      config,
      {
        ...config.monitor,
        bundleAttemptedItems: attemptedItems,
        bundleConfirmedItems: executions.length,
      },
      "executing",
      false,
      { status: "executing" },
    );
  }

  return { ok: true, executions, attemptedItems: items.length };
}

function bundleBuyExecutionFailure(
  error: string,
  attemptedItems = 0,
  executions: TradingBotBundleBuyExecutionItemResult[] = [],
  reconciliationRequired = false,
): Extract<TradingBotBundleBuyExecutionResult, { ok: false }> {
  return {
    ok: false,
    error,
    attemptedItems,
    reconciliationRequired,
    partial: executions.length > 0,
    executions,
  };
}

async function executeTradingBotSniperConfig(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
  evaluation: TradingBotAdvancedAutomationMonitorEvaluation,
  executionId: string,
  env: Env,
): Promise<TradingBotAdvancedAutomationExecutionResult> {
  const token = resolveTradingBotToken(env);
  if (!token)
    return { ok: false, error: "RIBBOT_TRADING_BOT_TOKEN is not configured" };
  if (config.kind !== "sniper") {
    return {
      ok: false,
      error: "Only sniper configs can execute from this path",
    };
  }
  const candidate = evaluation.launchCandidate;
  const mint = evaluation.observedMint;
  if (!candidate || !mint || !SOLANA_ADDRESS_PATTERN.test(mint)) {
    return { ok: false, error: "Sniper execution requires a validated launch" };
  }
  if (candidate.mint !== mint) {
    return { ok: false, error: "Sniper launch mint mismatch" };
  }
  const candidateRejection = sniperLaunchCandidateRejection(config, candidate);
  if (candidateRejection) return { ok: false, error: candidateRejection };
  if ((config.monitor.executedCount ?? 0) >= (config.maxSnipes ?? 1)) {
    return { ok: false, error: "Sniper max-snipes cap has been reached" };
  }

  const accountResult = await getStoredTradingBotAccount(
    env,
    config.telegramUserId,
  );
  if ("error" in accountResult)
    return { ok: false, error: accountResult.error };
  const account = accountResult.account;
  if (!account) return { ok: false, error: "Trading account not found" };
  if (!account.settings.sniperEnabled) {
    return { ok: false, error: "Account sniper setting is disabled" };
  }
  const spotWallet = spotNftPrivyWallet(account);
  if (!spotWallet) {
    return {
      ok: false,
      error: "Sniper execution requires Spot & NFT Wallet (Privy)",
    };
  }
  if (spotWallet.solanaWalletAddress !== config.walletAddress) {
    return { ok: false, error: "Trading wallet mismatch" };
  }

  try {
    const positions = await loadTradingBotPositions(env, config.walletAddress);
    if (BigInt(positions.sol.lamports) < BigInt(config.maxBuyAmountIn)) {
      return {
        ok: false,
        error: "Sniper SOL balance is below the configured max buy",
      };
    }

    const review = await loadTradingBotMarketRisk(env, {
      telegramUserId: config.telegramUserId,
      userPublicKey: config.walletAddress,
      mint,
      amountIn: config.maxBuyAmountIn,
      slippageBps: config.slippageBps,
      priorityFee: config.priorityFee,
      minLiquidityUsd: config.minLiquidityUsd,
      maxMarketCapUsd: config.maxMarketCapUsd,
      maxPriceImpactBps: Math.max(config.slippageBps, 1500),
      requestUrl:
        "https://trading-bot-sniper-monitor.local/api/frogx/trading-bot/market-risk",
    });
    const danger = review.risk.flags.find((flag) => flag.severity === "danger");
    if (danger) {
      return {
        ok: false,
        error: `Sniper market-risk check failed: ${danger.message}`,
      };
    }
    if (review.quoteProbe.status !== "ready") {
      return {
        ok: false,
        error: `Sniper blocked before execution: ${tradingBotQuoteProbeBlockingReason(review.quoteProbe)}`,
      };
    }
    if (!review.quoteProbe.executable) {
      return { ok: false, error: "Sniper quote probe is not executable" };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const response = await postTradingBotExecution(
    new Request(
      "https://trading-bot-sniper-monitor.local/api/frogx/trading-bot/execute",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orderId: executionId,
          telegramUserId: config.telegramUserId,
          userPublicKey: config.walletAddress,
          inMint: WRAPPED_SOL_MINT,
          outMint: mint,
          amountIn: config.maxBuyAmountIn,
          slippageBps: config.slippageBps,
          priorityFee: config.priorityFee,
        }),
      },
    ),
    env,
  );
  const data = (await response.json()) as {
    status?: string;
    error?: string;
    signature?: string | null;
    transactionId?: string | null;
    referenceId?: string | null;
    solscanUrl?: string | null;
  };
  if (response.ok && data.status === "executed") {
    return {
      ok: true,
      signature: data.signature,
      transactionId: data.transactionId,
      referenceId: data.referenceId,
      solscanUrl: data.solscanUrl,
      copyTradeSide: "buy",
      mint,
      amountIn: config.maxBuyAmountIn,
      observedSignature: candidate.firstPoolId,
    };
  }
  if (data.status === "pending_reconciliation") {
    return {
      ok: false,
      error: data.error ?? "Sniper execution requires reconciliation",
      reconciliationRequired: true,
      referenceId: data.referenceId,
      transactionId: data.transactionId,
      copyTradeSide: "buy",
      mint,
      amountIn: config.maxBuyAmountIn,
      observedSignature: candidate.firstPoolId,
    };
  }
  return {
    ok: false,
    error:
      data.error ?? `Sniper execution failed with status ${response.status}`,
  };
}

async function executeTradingBotAutoBuyConfig(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
  executionId: string,
  env: Env,
): Promise<TradingBotAdvancedAutomationExecutionResult> {
  const token = resolveTradingBotToken(env);
  if (!token)
    return { ok: false, error: "RIBBOT_TRADING_BOT_TOKEN is not configured" };
  if (config.kind !== "auto_buy") {
    return {
      ok: false,
      error: "Only auto-buy configs can execute from this path",
    };
  }
  if (!config.mint || !SOLANA_ADDRESS_PATTERN.test(config.mint)) {
    return { ok: false, error: "Auto-buy token mint is invalid" };
  }
  if (!/^[1-9]\d*$/.test(config.maxBuyAmountIn)) {
    return { ok: false, error: "Auto-buy max buy amount is invalid" };
  }

  const accountResult = await getStoredTradingBotAccount(
    env,
    config.telegramUserId,
  );
  if ("error" in accountResult) {
    return { ok: false, error: accountResult.error };
  }
  const account = accountResult.account;
  if (!account) return { ok: false, error: "Trading account not found" };
  if (!account.settings.autoBuyEnabled) {
    return { ok: false, error: "Account auto-buy setting is disabled" };
  }
  const spotWallet = spotNftPrivyWallet(account);
  if (!spotWallet) {
    return {
      ok: false,
      error: "Auto-buy execution requires Spot & NFT Wallet (Privy)",
    };
  }
  if (spotWallet.solanaWalletAddress !== config.walletAddress) {
    return { ok: false, error: "Trading wallet mismatch" };
  }

  try {
    const positions = await loadTradingBotPositions(env, config.walletAddress);
    if (BigInt(positions.sol.lamports) < BigInt(config.maxBuyAmountIn)) {
      return {
        ok: false,
        error: "Auto-buy SOL balance is below the configured buy amount",
      };
    }

    const review = await loadTradingBotMarketRisk(env, {
      telegramUserId: config.telegramUserId,
      userPublicKey: config.walletAddress,
      mint: config.mint,
      amountIn: config.maxBuyAmountIn,
      slippageBps: config.slippageBps,
      priorityFee: config.priorityFee,
      minLiquidityUsd: config.minLiquidityUsd,
      maxMarketCapUsd: config.maxMarketCapUsd,
      maxPriceImpactBps: Math.max(config.slippageBps, 1500),
      requestUrl:
        "https://trading-bot-advanced-monitor.local/api/frogx/trading-bot/market-risk",
    });
    const danger = review.risk.flags.find((flag) => flag.severity === "danger");
    if (danger) {
      return {
        ok: false,
        error: `Auto-buy market-risk check failed: ${danger.message}`,
      };
    }
    if (review.quoteProbe.status !== "ready") {
      return {
        ok: false,
        error: `Auto-buy blocked before execution: ${tradingBotQuoteProbeBlockingReason(review.quoteProbe)}`,
      };
    }
    if (!review.quoteProbe.executable) {
      return { ok: false, error: "Auto-buy quote probe is not executable" };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const response = await postTradingBotExecution(
    new Request(
      "https://trading-bot-advanced-monitor.local/api/frogx/trading-bot/execute",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orderId: executionId,
          telegramUserId: config.telegramUserId,
          userPublicKey: config.walletAddress,
          inMint: WRAPPED_SOL_MINT,
          outMint: config.mint,
          amountIn: config.maxBuyAmountIn,
          slippageBps: config.slippageBps,
          priorityFee: config.priorityFee,
        }),
      },
    ),
    env,
  );
  const data = (await response.json()) as {
    status?: string;
    error?: string;
    signature?: string | null;
    transactionId?: string | null;
    referenceId?: string | null;
    solscanUrl?: string | null;
  };
  if (response.ok && data.status === "executed") {
    return {
      ok: true,
      signature: data.signature,
      transactionId: data.transactionId,
      referenceId: data.referenceId,
      solscanUrl: data.solscanUrl,
      copyTradeSide: "buy",
      mint: config.mint,
      amountIn: config.maxBuyAmountIn,
    };
  }
  if (data.status === "pending_reconciliation") {
    return {
      ok: false,
      error: data.error ?? "Auto-buy execution requires reconciliation",
      reconciliationRequired: true,
      referenceId: data.referenceId,
      transactionId: data.transactionId,
      copyTradeSide: "buy",
      mint: config.mint,
      amountIn: config.maxBuyAmountIn,
    };
  }
  return {
    ok: false,
    error:
      data.error ?? `Auto-buy execution failed with status ${response.status}`,
  };
}

async function executeTradingBotAutoSellConfig(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
  executionId: string,
  env: Env,
): Promise<TradingBotAdvancedAutomationExecutionResult> {
  const token = resolveTradingBotToken(env);
  if (!token)
    return { ok: false, error: "RIBBOT_TRADING_BOT_TOKEN is not configured" };
  if (config.kind !== "auto_sell") {
    return {
      ok: false,
      error: "Only auto-sell configs can execute from this path",
    };
  }
  if (!config.mint || !SOLANA_ADDRESS_PATTERN.test(config.mint)) {
    return { ok: false, error: "Auto-sell token mint is invalid" };
  }

  const accountResult = await getStoredTradingBotAccount(
    env,
    config.telegramUserId,
  );
  if ("error" in accountResult) {
    return { ok: false, error: accountResult.error };
  }
  const account = accountResult.account;
  if (!account) return { ok: false, error: "Trading account not found" };
  if (!account.settings.autoSellEnabled) {
    return { ok: false, error: "Account auto-sell setting is disabled" };
  }
  const spotWallet = spotNftPrivyWallet(account);
  if (!spotWallet) {
    return {
      ok: false,
      error: "Auto-sell execution requires Spot & NFT Wallet (Privy)",
    };
  }
  if (spotWallet.solanaWalletAddress !== config.walletAddress) {
    return { ok: false, error: "Trading wallet mismatch" };
  }

  let amountIn: string;
  try {
    const positions = await loadTradingBotPositions(env, config.walletAddress);
    const tokenPosition = positions.tokens.find(
      (token) => token.mint === config.mint,
    );
    if (!tokenPosition) {
      return { ok: false, error: "Auto-sell token balance is unavailable" };
    }
    const sellBps = clampInteger(config.sellBps, 1, 10_000, 10_000);
    amountIn = (
      (BigInt(tokenPosition.amount) * BigInt(sellBps)) /
      10_000n
    ).toString();
    if (amountIn === "0") {
      return { ok: false, error: "Auto-sell amount rounds to zero" };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const response = await postTradingBotExecution(
    new Request(
      "https://trading-bot-advanced-monitor.local/api/frogx/trading-bot/execute",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orderId: executionId,
          telegramUserId: config.telegramUserId,
          userPublicKey: config.walletAddress,
          inMint: config.mint,
          outMint: WRAPPED_SOL_MINT,
          amountIn,
          slippageBps: config.slippageBps,
          priorityFee: config.priorityFee,
        }),
      },
    ),
    env,
  );
  const data = (await response.json()) as {
    status?: string;
    error?: string;
    signature?: string | null;
    transactionId?: string | null;
    referenceId?: string | null;
    solscanUrl?: string | null;
  };
  if (response.ok && data.status === "executed") {
    return {
      ok: true,
      signature: data.signature,
      transactionId: data.transactionId,
      referenceId: data.referenceId,
      solscanUrl: data.solscanUrl,
      copyTradeSide: "sell",
      mint: config.mint,
      amountIn,
      sellBps: config.sellBps ?? 10_000,
    };
  }
  if (data.status === "pending_reconciliation") {
    return {
      ok: false,
      error: data.error ?? "Auto-sell execution requires reconciliation",
      reconciliationRequired: true,
      referenceId: data.referenceId,
      transactionId: data.transactionId,
      copyTradeSide: "sell",
      mint: config.mint,
      amountIn,
      sellBps: config.sellBps ?? 10_000,
    };
  }
  return {
    ok: false,
    error:
      data.error ?? `Auto-sell execution failed with status ${response.status}`,
  };
}

function monitorAfterAdvancedAutomationDryRunTrigger(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
  monitor: TradingBotAdvancedAutomationMonitorState,
): TradingBotAdvancedAutomationMonitorState {
  return {
    ...monitor,
    dryRunTriggerCount: (config.monitor.dryRunTriggerCount ?? 0) + 1,
  };
}

function monitorWithAdvancedAutomationExecutionResult(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
  monitor: TradingBotAdvancedAutomationMonitorState,
  executionId: string,
  executionReferenceId: string,
  result: TradingBotAdvancedAutomationExecutionResult,
): TradingBotAdvancedAutomationMonitorState {
  const updated: TradingBotAdvancedAutomationMonitorState = {
    ...config.monitor,
    ...monitor,
    executionId,
    executionReferenceId: result.referenceId ?? executionReferenceId,
  };
  if (result.transactionId) {
    updated.executionTransactionId = result.transactionId;
  }
  if (result.copyTradeSide) updated.executionSide = result.copyTradeSide;
  if (result.mint) updated.executionMint = result.mint;
  if (result.amountIn) updated.executionAmountIn = result.amountIn;
  if (result.ok) {
    if (result.signature) updated.executionSignature = result.signature;
    if (result.solscanUrl) updated.executionSolscanUrl = result.solscanUrl;
  }
  return updated;
}

function monitorAfterAdvancedAutomationExecution(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
  monitor: TradingBotAdvancedAutomationMonitorState,
): TradingBotAdvancedAutomationMonitorState {
  return {
    ...monitor,
    executedCount: (config.monitor.executedCount ?? 0) + 1,
  };
}

function advancedAutomationStatusAfterSuccessfulExecution(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
  monitor: TradingBotAdvancedAutomationMonitorState,
): TradingBotStoredAdvancedAutomationConfigStatus {
  if (config.kind === "copytrade") return "staged";
  if (config.kind === "sniper") {
    return (monitor.executedCount ?? 0) >= (config.maxSnipes ?? 1)
      ? "executed"
      : "staged";
  }
  return "executed";
}

async function loadStoredTradingBotAutomationOrder(
  store: DurableObjectStub,
  telegramUserId: string,
  orderId: string,
): Promise<TradingBotStoredAutomationOrderSnapshot | null> {
  const response = await store.fetch(
    new Request(
      `https://trading-bot-account.local/automation-orders?telegramUserId=${encodeURIComponent(telegramUserId)}`,
    ),
  );
  if (!response.ok) return null;
  const data = (await response.json()) as {
    orders?: TradingBotStoredAutomationOrderSnapshot[];
  };
  return (data.orders ?? []).find((order) => order.orderId === orderId) ?? null;
}

async function loadStoredTradingBotAdvancedAutomationConfig(
  store: DurableObjectStub,
  telegramUserId: string,
  configId: string,
  kind: TradingBotAdvancedAutomationKind,
): Promise<
  | { config: TradingBotStoredAdvancedAutomationConfigSnapshot }
  | { error: string; status?: number }
> {
  const response = await store.fetch(
    new Request(
      `https://trading-bot-account.local/automation-configs?telegramUserId=${telegramUserId}&kind=${kind}`,
    ),
  );
  if (!response.ok) {
    return {
      error: `Advanced config lookup failed with status ${response.status}`,
      status: response.status,
    };
  }
  const data = (await response.json()) as {
    configs?: TradingBotStoredAdvancedAutomationConfigSnapshot[];
  };
  const config = (data.configs ?? []).find(
    (entry) => entry.configId === configId && entry.kind === kind,
  );
  if (!config) return { error: "Advanced config not found", status: 404 };
  return { config };
}

async function loadStoredTradingBotBundleBuyConfig(
  store: DurableObjectStub,
  telegramUserId: string,
  configId: string,
): Promise<
  | { config: TradingBotStoredAdvancedAutomationConfigSnapshot }
  | { error: string; status?: number }
> {
  const result = await loadStoredTradingBotAdvancedAutomationConfig(
    store,
    telegramUserId,
    configId,
    "bundle_buy",
  );
  if ("error" in result) {
    return {
      error:
        result.status === 404 ? "Bundle-buy basket not found" : result.error,
      status: result.status,
    };
  }
  return result;
}

async function claimStoredBundleBuyConfigForExecution(
  store: DurableObjectStub,
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
): Promise<
  | { claimed: true; config: TradingBotStoredAdvancedAutomationConfigSnapshot }
  | {
      claimed: false;
      config?: TradingBotStoredAdvancedAutomationConfigSnapshot;
      error: string;
      status: number;
    }
> {
  const now = new Date().toISOString();
  const response = await store.fetch(
    new Request("https://trading-bot-account.local/automation-config/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telegramUserId: config.telegramUserId,
        configId: config.configId,
        kind: "bundle_buy",
        monitor: {
          ...config.monitor,
          executionStartedAt: now,
          bundleAttemptedItems: 0,
          bundleConfirmedItems: 0,
        },
      }),
    }),
  );
  const data = (await response.json()) as {
    status?: string;
    error?: string;
    config?: TradingBotStoredAdvancedAutomationConfigSnapshot;
  };
  if (!response.ok || data.status !== "claimed" || !data.config) {
    return {
      claimed: false,
      config: data.config,
      error:
        data.error ?? `Bundle-buy claim failed with status ${response.status}`,
      status: response.status,
    };
  }
  return { claimed: true, config: data.config };
}

async function claimStoredAdvancedAutomationConfigForExecution(
  store: DurableObjectStub,
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
  monitor: TradingBotAdvancedAutomationMonitorState,
): Promise<TradingBotStoredAdvancedAutomationConfigSnapshot | null> {
  const response = await store.fetch(
    new Request("https://trading-bot-account.local/automation-config/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telegramUserId: config.telegramUserId,
        configId: config.configId,
        kind: config.kind,
        monitor,
      }),
    }),
  );
  if (response.status === 409) return null;
  if (!response.ok) {
    console.warn(
      "[trading-bot] Advanced automation config claim failed",
      config.configId,
      response.status,
    );
    return null;
  }
  const data = (await response.json()) as {
    status?: string;
    config?: TradingBotStoredAdvancedAutomationConfigSnapshot;
  };
  if (data.status !== "claimed" || !data.config) {
    console.warn(
      "[trading-bot] Advanced automation config claim returned an invalid response",
      config.configId,
    );
    return null;
  }
  return data.config;
}

async function updateStoredAutomationOrderScheduler(
  store: DurableObjectStub,
  order: TradingBotStoredAutomationOrderSnapshot,
  scheduler: TradingBotAutomationOrderSchedulerState,
  status?: TradingBotStoredAutomationOrderStatus,
  expectation?: TradingBotAutomationOrderUpdateExpectation,
): Promise<boolean> {
  const response = await store.fetch(
    new Request("https://trading-bot-account.local/automation-order/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telegramUserId: order.telegramUserId,
        orderId: order.orderId,
        scheduler,
        status,
        ...(expectation
          ? {
              expectedStatus: expectation.status,
              ...(expectation.executionId
                ? { expectedExecutionId: expectation.executionId }
                : {}),
            }
          : {}),
      }),
    }),
  );
  if (!response.ok) {
    if (response.status !== 409) {
      console.warn(
        "[trading-bot] Scheduled order state update failed",
        order.orderId,
        response.status,
      );
    }
    return false;
  }
  return true;
}

async function updateStoredAdvancedAutomationConfigMonitor(
  store: DurableObjectStub,
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
  monitor: TradingBotAdvancedAutomationMonitorState,
  status?: TradingBotStoredAdvancedAutomationConfigStatus,
  clearLastError = false,
  expectation?: TradingBotAdvancedAutomationUpdateExpectation,
): Promise<boolean> {
  const response = await store.fetch(
    new Request("https://trading-bot-account.local/automation-config/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telegramUserId: config.telegramUserId,
        configId: config.configId,
        kind: config.kind,
        monitor,
        status,
        clearLastError,
        ...(expectation
          ? {
              expectedStatus: expectation.status,
              ...(expectation.executionId
                ? { expectedExecutionId: expectation.executionId }
                : {}),
            }
          : {}),
      }),
    }),
  );
  if (!response.ok) {
    if (response.status !== 409) {
      console.warn(
        "[trading-bot] Advanced automation monitor state update failed",
        config.configId,
        response.status,
      );
    }
    return false;
  }
  return true;
}

function defaultTradingBotSettings(): TradingBotStoredSettings {
  return {
    slippageBps: 500,
    priorityFee: 0,
    sellPriorityFee: 0,
    defaultBuyAmountIn: "100000000",
    buyPresetAmountsIn: [...DEFAULT_TRADING_BOT_BUY_PRESET_AMOUNTS_IN],
    sellPresetBps: [...DEFAULT_TRADING_BOT_SELL_PRESET_BPS],
    botMode: "advanced",
    confirmTrades: true,
    sellProtection: true,
    autoBuyEnabled: false,
    instantAutoBuyEnabled: false,
    instantAutoBuyAmountIn: "100000000",
    instantAutoBuyMinLiquidityUsd: 1000,
    autoSellEnabled: false,
    sniperEnabled: false,
    mevProtection: true,
  };
}

function generateTradingBotAutomationOrderId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `a_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function generateTradingBotAdvancedConfigId(
  kind: TradingBotAdvancedAutomationKind,
): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const prefix =
    kind === "copytrade"
      ? "c"
      : kind === "sniper"
        ? "s"
        : kind === "auto_buy"
          ? "ab"
          : kind === "bundle_buy"
            ? "bb"
            : "as";
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function automationOrderValidationValue(
  value: unknown,
  fallbackWarnings: string[],
  fallbackValidatedAt: string,
): TradingBotStoredAutomationOrderSnapshot["validation"] {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const validatedAt = stringValue(record.validatedAt) ?? fallbackValidatedAt;
  return {
    validatedAt,
    warnings: warningListValue(record.warnings, fallbackWarnings),
  };
}

function advancedAutomationConfigValidationValue(
  value: unknown,
  fallbackWarnings: string[],
  fallbackValidatedAt: string,
): TradingBotStoredAdvancedAutomationConfigSnapshot["validation"] {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const validatedAt = stringValue(record.validatedAt) ?? fallbackValidatedAt;
  return {
    validatedAt,
    warnings: warningListValue(record.warnings, fallbackWarnings),
  };
}

function automationOrderSchedulerStateValue(
  value: unknown,
): TradingBotAutomationOrderSchedulerState {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const state: TradingBotAutomationOrderSchedulerState = {};
  const lastCheckedAt = stringValue(record.lastCheckedAt);
  const nextRunAt = stringValue(record.nextRunAt);
  const lastTriggerAt = stringValue(record.lastTriggerAt);
  const lastTriggerReason = stringValue(record.lastTriggerReason);
  const lastError = stringValue(record.lastError);
  const executionId = stringValue(record.executionId);
  const executionStartedAt = stringValue(record.executionStartedAt);
  const executionCompletedAt = stringValue(record.executionCompletedAt);
  const executionSignature = stringValue(record.executionSignature);
  const executionTransactionId = stringValue(record.executionTransactionId);
  const executionReferenceId = stringValue(record.executionReferenceId);
  const executionSolscanUrl = stringValue(record.executionSolscanUrl);
  const reconciliationCheckedAt = stringValue(record.reconciliationCheckedAt);
  const reconciliationStatus =
    privyTransactionStatusValue(record.reconciliationStatus) ??
    (record.reconciliationStatus === "not_found" ||
    record.reconciliationStatus === "error"
      ? record.reconciliationStatus
      : undefined);
  const manualReviewAfter = stringValue(record.manualReviewAfter);
  const manualReviewRequiredAt = stringValue(record.manualReviewRequiredAt);
  const manualReviewReason = stringValue(record.manualReviewReason);
  const lastPriceUsd = numberValue(record.lastPriceUsd);
  const peakPriceUsd = numberValue(record.peakPriceUsd);
  const executedCount = numberValue(record.executedCount);
  const dryRunTriggerCount = numberValue(record.dryRunTriggerCount);

  if (lastCheckedAt) state.lastCheckedAt = lastCheckedAt;
  if (nextRunAt) state.nextRunAt = nextRunAt;
  if (lastTriggerAt) state.lastTriggerAt = lastTriggerAt;
  if (lastTriggerReason)
    state.lastTriggerReason = lastTriggerReason.slice(0, 240);
  if (lastError) state.lastError = lastError.slice(0, 240);
  if (
    executionId &&
    TRADING_BOT_EXECUTION_REFERENCE_PATTERN.test(executionId)
  ) {
    state.executionId = executionId;
  }
  if (executionStartedAt) state.executionStartedAt = executionStartedAt;
  if (executionCompletedAt) state.executionCompletedAt = executionCompletedAt;
  if (executionSignature)
    state.executionSignature = executionSignature.slice(0, 128);
  if (executionTransactionId) {
    state.executionTransactionId = executionTransactionId.slice(0, 128);
  }
  if (executionReferenceId) {
    state.executionReferenceId = executionReferenceId.slice(0, 64);
  }
  if (executionSolscanUrl?.startsWith("https://solscan.io/tx/")) {
    state.executionSolscanUrl = executionSolscanUrl.slice(0, 240);
  }
  if (reconciliationCheckedAt) {
    state.reconciliationCheckedAt = reconciliationCheckedAt;
  }
  if (reconciliationStatus) state.reconciliationStatus = reconciliationStatus;
  if (manualReviewAfter && Number.isFinite(Date.parse(manualReviewAfter))) {
    state.manualReviewAfter = new Date(manualReviewAfter).toISOString();
  }
  if (
    manualReviewRequiredAt &&
    Number.isFinite(Date.parse(manualReviewRequiredAt))
  ) {
    state.manualReviewRequiredAt = new Date(
      manualReviewRequiredAt,
    ).toISOString();
  }
  if (manualReviewReason) {
    state.manualReviewReason = manualReviewReason.slice(0, 240);
  }
  if (
    lastPriceUsd !== undefined &&
    Number.isFinite(lastPriceUsd) &&
    lastPriceUsd > 0
  ) {
    state.lastPriceUsd = lastPriceUsd;
  }
  if (
    peakPriceUsd !== undefined &&
    Number.isFinite(peakPriceUsd) &&
    peakPriceUsd > 0
  ) {
    state.peakPriceUsd = peakPriceUsd;
  }
  if (
    executedCount !== undefined &&
    Number.isInteger(executedCount) &&
    executedCount >= 0
  ) {
    state.executedCount = executedCount;
  }
  if (
    dryRunTriggerCount !== undefined &&
    Number.isInteger(dryRunTriggerCount) &&
    dryRunTriggerCount >= 0
  ) {
    state.dryRunTriggerCount = dryRunTriggerCount;
  }
  return state;
}

function advancedAutomationMonitorStateValue(
  value: unknown,
): TradingBotAdvancedAutomationMonitorState {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const state: TradingBotAdvancedAutomationMonitorState = {};
  const lastCheckedAt = stringValue(record.lastCheckedAt);
  const lastMatchedAt = stringValue(record.lastMatchedAt);
  const lastObservedSignature = stringValue(record.lastObservedSignature);
  const lastObservedMint = stringValue(record.lastObservedMint);
  const lastPriceUsd = numberValue(record.lastPriceUsd);
  const lastTriggerAt = stringValue(record.lastTriggerAt);
  const lastTriggerReason = stringValue(record.lastTriggerReason);
  const lastError = stringValue(record.lastError);
  const matchCount = numberValue(record.matchCount);
  const executedCount = numberValue(record.executedCount);
  const dryRunTriggerCount = numberValue(record.dryRunTriggerCount);
  const executionStartedAt = stringValue(record.executionStartedAt);
  const executionCompletedAt = stringValue(record.executionCompletedAt);
  const executionId = stringValue(record.executionId);
  const executionReferenceId = stringValue(record.executionReferenceId);
  const executionSignature = stringValue(record.executionSignature);
  const executionTransactionId = stringValue(record.executionTransactionId);
  const executionSolscanUrl = stringValue(record.executionSolscanUrl);
  const executionAmountIn = stringValue(record.executionAmountIn);
  const executionMint = stringValue(record.executionMint);
  const executionSide = stringValue(record.executionSide);
  const reconciliationCheckedAt = stringValue(record.reconciliationCheckedAt);
  const reconciliationStatus =
    privyTransactionStatusValue(record.reconciliationStatus) ??
    (record.reconciliationStatus === "not_found" ||
    record.reconciliationStatus === "error"
      ? record.reconciliationStatus
      : undefined);
  const manualReviewAfter = stringValue(record.manualReviewAfter);
  const manualReviewRequiredAt = stringValue(record.manualReviewRequiredAt);
  const manualReviewReason = stringValue(record.manualReviewReason);
  const launchCursorAt = stringValue(record.launchCursorAt);
  const launchCursorId = stringValue(record.launchCursorId);
  const launchpad = stringValue(record.launchpad);
  const launchName = stringValue(record.launchName);
  const launchSymbol = stringValue(record.launchSymbol);
  const launchLiquidityUsd = numberValue(record.launchLiquidityUsd);
  const launchMarketCapUsd = numberValue(record.launchMarketCapUsd);
  const launchOrganicScore = numberValue(record.launchOrganicScore);
  const processedMints = Array.isArray(record.processedMints)
    ? record.processedMints
        .filter(
          (mint): mint is string =>
            typeof mint === "string" && SOLANA_ADDRESS_PATTERN.test(mint),
        )
        .slice(-MAX_TRADING_BOT_SNIPER_PROCESSED_MINTS)
    : [];
  const bundleAttemptedItems = numberValue(record.bundleAttemptedItems);
  const bundleConfirmedItems = numberValue(record.bundleConfirmedItems);

  if (lastCheckedAt) state.lastCheckedAt = lastCheckedAt;
  if (lastMatchedAt) state.lastMatchedAt = lastMatchedAt;
  if (lastObservedSignature)
    state.lastObservedSignature = lastObservedSignature.slice(0, 128);
  if (lastObservedMint && SOLANA_ADDRESS_PATTERN.test(lastObservedMint)) {
    state.lastObservedMint = lastObservedMint;
  }
  if (
    lastPriceUsd !== undefined &&
    Number.isFinite(lastPriceUsd) &&
    lastPriceUsd > 0
  ) {
    state.lastPriceUsd = lastPriceUsd;
  }
  if (lastTriggerAt) state.lastTriggerAt = lastTriggerAt;
  if (lastTriggerReason)
    state.lastTriggerReason = lastTriggerReason.slice(0, 240);
  if (lastError) state.lastError = lastError.slice(0, 240);
  if (
    matchCount !== undefined &&
    Number.isInteger(matchCount) &&
    matchCount >= 0
  ) {
    state.matchCount = matchCount;
  }
  if (
    executedCount !== undefined &&
    Number.isInteger(executedCount) &&
    executedCount >= 0
  ) {
    state.executedCount = executedCount;
  }
  if (
    dryRunTriggerCount !== undefined &&
    Number.isInteger(dryRunTriggerCount) &&
    dryRunTriggerCount >= 0
  ) {
    state.dryRunTriggerCount = dryRunTriggerCount;
  }
  if (executionStartedAt) state.executionStartedAt = executionStartedAt;
  if (executionCompletedAt) state.executionCompletedAt = executionCompletedAt;
  if (
    executionId &&
    TRADING_BOT_EXECUTION_REFERENCE_PATTERN.test(executionId)
  ) {
    state.executionId = executionId;
  }
  if (
    executionReferenceId &&
    TRADING_BOT_EXECUTION_REFERENCE_PATTERN.test(executionReferenceId)
  ) {
    state.executionReferenceId = executionReferenceId;
  }
  if (executionSignature) {
    state.executionSignature = executionSignature.slice(0, 128);
  }
  if (executionTransactionId) {
    state.executionTransactionId = executionTransactionId.slice(0, 128);
  }
  if (executionSolscanUrl?.startsWith("https://solscan.io/tx/")) {
    state.executionSolscanUrl = executionSolscanUrl.slice(0, 240);
  }
  if (executionAmountIn && /^\d+$/.test(executionAmountIn)) {
    state.executionAmountIn = executionAmountIn;
  }
  if (executionMint && SOLANA_ADDRESS_PATTERN.test(executionMint)) {
    state.executionMint = executionMint;
  }
  if (executionSide === "buy" || executionSide === "sell") {
    state.executionSide = executionSide;
  }
  if (reconciliationCheckedAt) {
    state.reconciliationCheckedAt = reconciliationCheckedAt;
  }
  if (reconciliationStatus) state.reconciliationStatus = reconciliationStatus;
  if (manualReviewAfter && Number.isFinite(Date.parse(manualReviewAfter))) {
    state.manualReviewAfter = new Date(manualReviewAfter).toISOString();
  }
  if (
    manualReviewRequiredAt &&
    Number.isFinite(Date.parse(manualReviewRequiredAt))
  ) {
    state.manualReviewRequiredAt = new Date(
      manualReviewRequiredAt,
    ).toISOString();
  }
  if (manualReviewReason) {
    state.manualReviewReason = manualReviewReason.slice(0, 240);
  }
  if (launchCursorAt && Number.isFinite(Date.parse(launchCursorAt))) {
    state.launchCursorAt = new Date(launchCursorAt).toISOString();
  }
  if (launchCursorId && SOLANA_ADDRESS_PATTERN.test(launchCursorId)) {
    state.launchCursorId = launchCursorId;
  }
  if (launchpad) state.launchpad = launchpad.slice(0, 80);
  if (launchName) state.launchName = launchName.slice(0, 80);
  if (launchSymbol) state.launchSymbol = launchSymbol.slice(0, 24);
  if (
    launchLiquidityUsd !== undefined &&
    Number.isFinite(launchLiquidityUsd) &&
    launchLiquidityUsd >= 0
  ) {
    state.launchLiquidityUsd = launchLiquidityUsd;
  }
  if (
    launchMarketCapUsd !== undefined &&
    Number.isFinite(launchMarketCapUsd) &&
    launchMarketCapUsd >= 0
  ) {
    state.launchMarketCapUsd = launchMarketCapUsd;
  }
  if (
    launchOrganicScore !== undefined &&
    Number.isFinite(launchOrganicScore) &&
    launchOrganicScore >= 0 &&
    launchOrganicScore <= 100
  ) {
    state.launchOrganicScore = launchOrganicScore;
  }
  if (processedMints.length > 0) state.processedMints = processedMints;
  if (
    bundleAttemptedItems !== undefined &&
    Number.isInteger(bundleAttemptedItems) &&
    bundleAttemptedItems >= 0 &&
    bundleAttemptedItems <= 10
  ) {
    state.bundleAttemptedItems = bundleAttemptedItems;
  }
  if (
    bundleConfirmedItems !== undefined &&
    Number.isInteger(bundleConfirmedItems) &&
    bundleConfirmedItems >= 0 &&
    bundleConfirmedItems <= 10
  ) {
    state.bundleConfirmedItems = bundleConfirmedItems;
  }

  return state;
}

function bundleBuyItemsValue(
  value: unknown,
): NormalizedTradingBotBundleBuyItem[] {
  const source =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            return [];
          }
        })()
      : value;
  if (!Array.isArray(source)) return [];
  const items: NormalizedTradingBotBundleBuyItem[] = [];
  const seenMints = new Set<string>();
  for (const entry of source) {
    const record =
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : {};
    const mint = stringValue(record.mint);
    const maxBuyAmountIn = stringValue(record.maxBuyAmountIn);
    const amountLabel = stringValue(record.amountLabel);
    if (!mint || !SOLANA_ADDRESS_PATTERN.test(mint) || seenMints.has(mint)) {
      continue;
    }
    if (!maxBuyAmountIn || !/^[1-9]\d*$/.test(maxBuyAmountIn)) {
      continue;
    }
    seenMints.add(mint);
    items.push({
      mint,
      maxBuyAmountIn,
      ...(amountLabel ? { amountLabel } : {}),
    });
  }
  return items.slice(0, 10);
}

function warningListValue(value: unknown, fallback: string[] = []): string[] {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function privyTransactionStatusValue(
  value: unknown,
): PrivyTransactionStatus | undefined {
  const normalized = stringValue(value);
  return normalized === "broadcasted" ||
    normalized === "confirmed" ||
    normalized === "execution_reverted" ||
    normalized === "failed" ||
    normalized === "replaced" ||
    normalized === "finalized" ||
    normalized === "provider_error" ||
    normalized === "pending"
    ? normalized
    : undefined;
}

function optionalIsoTimestamp(value: unknown): string | undefined {
  const raw = stringValue(value);
  if (!raw || !Number.isFinite(Date.parse(raw))) return undefined;
  return new Date(raw).toISOString();
}

function manualReviewCaseStatusValue(
  value: unknown,
): TradingBotManualReviewCaseStatus | undefined {
  const normalized = stringValue(value);
  return normalized === "open" ||
    normalized === "acknowledged" ||
    normalized === "resolved"
    ? normalized
    : undefined;
}

function manualReviewCaseStatusFilterValue(
  value: unknown,
): TradingBotManualReviewCaseStatusFilter | undefined {
  const normalized = stringValue(value) ?? "active";
  return normalized === "active" || normalized === "all"
    ? normalized
    : manualReviewCaseStatusValue(normalized);
}

function manualReviewResolutionValue(
  value: unknown,
): TradingBotManualReviewResolution | undefined {
  const normalized = stringValue(value);
  return normalized === "executed" || normalized === "failed"
    ? normalized
    : undefined;
}

function optionalAutomationOrderStatusValue(
  value: unknown,
): TradingBotStoredAutomationOrderStatus | undefined {
  const normalized = stringValue(value);
  return normalized === "executing" ||
    normalized === "executed" ||
    normalized === "failed" ||
    normalized === "cancelled" ||
    normalized === "staged"
    ? normalized
    : undefined;
}

function automationOrderStatusValue(
  value: unknown,
): TradingBotStoredAutomationOrderStatus {
  return optionalAutomationOrderStatusValue(value) ?? "staged";
}

function optionalAdvancedAutomationStatusValue(
  value: unknown,
): TradingBotStoredAdvancedAutomationConfigStatus | undefined {
  const normalized = stringValue(value);
  return normalized === "executing" ||
    normalized === "paused" ||
    normalized === "failed" ||
    normalized === "cancelled" ||
    normalized === "executed" ||
    normalized === "staged"
    ? normalized
    : undefined;
}

function advancedAutomationStatusValue(
  value: unknown,
): TradingBotStoredAdvancedAutomationConfigStatus {
  return optionalAdvancedAutomationStatusValue(value) ?? "staged";
}

function storedOrderToNormalizedOrder(
  order: TradingBotStoredAutomationOrderSnapshot,
): NormalizedTradingBotOrder {
  return {
    telegramUserId: order.telegramUserId,
    userPublicKey: order.walletAddress,
    kind: order.kind,
    side: order.side,
    mint: order.mint,
    inMint: order.inMint,
    outMint: order.outMint,
    amountIn: order.amountIn,
    ...(order.amountLabel ? { amountLabel: order.amountLabel } : {}),
    slippageBps: order.slippageBps,
    priorityFee: order.priorityFee,
    ...(order.triggerPrice ? { triggerPrice: order.triggerPrice } : {}),
    ...(order.triggerDirection
      ? { triggerDirection: order.triggerDirection }
      : {}),
    ...(order.orderCount !== undefined ? { orderCount: order.orderCount } : {}),
    ...(order.intervalMinutes !== undefined
      ? { intervalMinutes: order.intervalMinutes }
      : {}),
    ...(order.perOrderAmountIn
      ? { perOrderAmountIn: order.perOrderAmountIn }
      : {}),
    ...(order.trailingBps !== undefined
      ? { trailingBps: order.trailingBps }
      : {}),
  };
}

function storedAdvancedConfigToNormalizedCopyTrade(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
): NormalizedTradingBotCopyTrade {
  return {
    telegramUserId: config.telegramUserId,
    userPublicKey: config.walletAddress,
    ...(config.tag ? { tag: config.tag } : {}),
    targetWallet: config.targetWallet ?? "",
    buyMode: config.buyMode ?? "percentage",
    buyPercentageBps: config.buyPercentageBps ?? 10_000,
    maxBuyAmountIn: config.maxBuyAmountIn,
    ...(config.amountLabel ? { amountLabel: config.amountLabel } : {}),
    slippageBps: config.slippageBps,
    priorityFee: config.priorityFee,
    sellPriorityFee: config.sellPriorityFee ?? config.priorityFee,
    copySells: config.copySells ?? false,
    duplicateBuys: config.duplicateBuys ?? true,
    onlyRenounced: config.onlyRenounced ?? false,
    excludePumpFunTokens: config.excludePumpFunTokens ?? false,
    ...(config.minTargetBuyAmountIn
      ? { minTargetBuyAmountIn: config.minTargetBuyAmountIn }
      : {}),
    minLiquidityUsd: config.minLiquidityUsd,
    ...(config.minMarketCapUsd !== undefined
      ? { minMarketCapUsd: config.minMarketCapUsd }
      : {}),
    ...(config.maxMarketCapUsd !== undefined
      ? { maxMarketCapUsd: config.maxMarketCapUsd }
      : {}),
    blacklistMints: [...(config.blacklistMints ?? [])],
  };
}

function storedAdvancedConfigToNormalizedSniper(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
): NormalizedTradingBotSniper {
  return {
    telegramUserId: config.telegramUserId,
    userPublicKey: config.walletAddress,
    source: config.source ?? "any",
    maxBuyAmountIn: config.maxBuyAmountIn,
    ...(config.amountLabel ? { amountLabel: config.amountLabel } : {}),
    slippageBps: config.slippageBps,
    priorityFee: config.priorityFee,
    minLiquidityUsd: config.minLiquidityUsd,
    ...(config.maxMarketCapUsd !== undefined
      ? { maxMarketCapUsd: config.maxMarketCapUsd }
      : {}),
    maxSnipes: config.maxSnipes ?? 1,
  };
}

function storedAdvancedConfigToNormalizedAutoBuy(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
): NormalizedTradingBotAutoBuy {
  return {
    telegramUserId: config.telegramUserId,
    userPublicKey: config.walletAddress,
    mint: config.mint ?? "",
    maxBuyAmountIn: config.maxBuyAmountIn,
    ...(config.amountLabel ? { amountLabel: config.amountLabel } : {}),
    slippageBps: config.slippageBps,
    priorityFee: config.priorityFee,
    minLiquidityUsd: config.minLiquidityUsd,
    ...(config.maxMarketCapUsd !== undefined
      ? { maxMarketCapUsd: config.maxMarketCapUsd }
      : {}),
  };
}

function storedAdvancedConfigToNormalizedBundleBuy(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
): NormalizedTradingBotBundleBuy {
  return {
    telegramUserId: config.telegramUserId,
    userPublicKey: config.walletAddress,
    items: config.bundleItems ?? [],
    maxBuyAmountIn: config.maxBuyAmountIn,
    ...(config.amountLabel ? { amountLabel: config.amountLabel } : {}),
    slippageBps: config.slippageBps,
    priorityFee: config.priorityFee,
    minLiquidityUsd: config.minLiquidityUsd,
    ...(config.maxMarketCapUsd !== undefined
      ? { maxMarketCapUsd: config.maxMarketCapUsd }
      : {}),
  };
}

function storedAdvancedConfigToNormalizedAutoSell(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
): NormalizedTradingBotAutoSell {
  return {
    telegramUserId: config.telegramUserId,
    userPublicKey: config.walletAddress,
    mint: config.mint ?? "",
    sellBps: config.sellBps ?? 10_000,
    ...(config.amountLabel ? { amountLabel: config.amountLabel } : {}),
    slippageBps: config.slippageBps,
    priorityFee: config.priorityFee,
    ...(config.triggerPrice ? { triggerPrice: config.triggerPrice } : {}),
    ...(config.triggerDirection
      ? { triggerDirection: config.triggerDirection }
      : {}),
  };
}

function storedAdvancedConfigToNormalizedConfig(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
): NormalizedTradingBotAdvancedAutomationConfig {
  switch (config.kind) {
    case "copytrade":
      return storedAdvancedConfigToNormalizedCopyTrade(config);
    case "sniper":
      return storedAdvancedConfigToNormalizedSniper(config);
    case "auto_buy":
      return storedAdvancedConfigToNormalizedAutoBuy(config);
    case "bundle_buy":
      return storedAdvancedConfigToNormalizedBundleBuy(config);
    case "auto_sell":
      return storedAdvancedConfigToNormalizedAutoSell(config);
  }
}

function generateControlCode(): string {
  return generateControlSecret(CONTROL_CODE_LENGTH);
}

function generateControlSessionToken(): string {
  return generateControlSecret(CONTROL_SESSION_TOKEN_LENGTH);
}

function generateControlSecret(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(
    bytes,
    (value) => CONTROL_CODE_ALPHABET[value % CONTROL_CODE_ALPHABET.length],
  ).join("");
}

function normalizeControlCode(value: unknown): string | undefined {
  const code = stringValue(value)
    ?.toUpperCase()
    .replace(/[\s-]+/g, "");
  return code && CONTROL_CODE_PATTERN.test(code) ? code : undefined;
}

function normalizeControlSessionToken(value: unknown): string | undefined {
  const token = stringValue(value)
    ?.toUpperCase()
    .replace(/[\s-]+/g, "");
  return token && CONTROL_SESSION_TOKEN_PATTERN.test(token) ? token : undefined;
}

async function hashControlCode(
  telegramUserId: string,
  code: string,
): Promise<string> {
  return hashControlSecret(telegramUserId, "code", code);
}

async function hashControlSessionToken(
  telegramUserId: string,
  sessionToken: string,
): Promise<string> {
  return hashControlSecret(telegramUserId, "session", sessionToken);
}

async function hashControlSecret(
  telegramUserId: string,
  scope: string,
  secret: string,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    `${scope}:${telegramUserId}:${secret}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function rowToTradingBotAccount(
  row: TradingBotAccountRow,
): TradingBotAccountSnapshot {
  const walletSource = walletSourceValue(row.wallet_source ?? undefined);
  const wallets = tradingBotAccountWalletSlotsValue(
    parseJson(row.wallets_json ?? "[]"),
    row.created_at,
  );
  if (
    wallets.length === 0 &&
    walletSource &&
    row.solana_wallet_address
  ) {
    const role = walletSource === "privy" ? "spot_nft" : "portfolio";
    wallets.push({
      walletId:
        walletSource === "privy" && row.privy_wallet_id
          ? row.privy_wallet_id
          : `external:${row.solana_wallet_address}`,
      label: tradingBotWalletLabel(role),
      role,
      walletSource,
      ...(row.privy_user_id ? { privyUserId: row.privy_user_id } : {}),
      ...(row.privy_wallet_id ? { privyWalletId: row.privy_wallet_id } : {}),
      solanaWalletAddress: row.solana_wallet_address,
      createdAt: row.created_at,
    });
  }
  const activeWallet =
    wallets.find((wallet) => wallet.walletId === row.active_wallet_id) ??
    wallets.find(
      (wallet) => wallet.solanaWalletAddress === row.solana_wallet_address,
    ) ??
    wallets[0];
  return {
    telegramUserId: row.telegram_user_id,
    ...(row.username ? { username: row.username } : {}),
    ...(activeWallet
      ? {
          walletSource: activeWallet.walletSource,
          activeWalletId: activeWallet.walletId,
          ...(activeWallet.privyUserId
            ? { privyUserId: activeWallet.privyUserId }
            : {}),
          ...(activeWallet.privyWalletId
            ? { privyWalletId: activeWallet.privyWalletId }
            : {}),
          solanaWalletAddress: activeWallet.solanaWalletAddress,
        }
      : {}),
    wallets,
    ...(row.wallet_claim_requested_at
      ? { walletClaimRequestedAt: row.wallet_claim_requested_at }
      : {}),
    ...(row.wallet_export_requested_at
      ? { walletExportRequestedAt: row.wallet_export_requested_at }
      : {}),
    ...(row.bot_access_revoked_at
      ? { botAccessRevokedAt: row.bot_access_revoked_at }
      : {}),
    settings: parseStoredSettings(row.settings_json),
    watchlist: parseStoredTokenList(row.watchlist_json),
    hiddenTokens: parseStoredTokenList(row.hidden_tokens_json),
    ...(row.referral_code ? { referralCode: row.referral_code } : {}),
    ...(row.referred_by_code ? { referredByCode: row.referred_by_code } : {}),
    ...(row.referred_by_telegram_user_id
      ? { referredByTelegramUserId: row.referred_by_telegram_user_id }
      : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function activateTradingBotAccountWallet(
  account: TradingBotAccountSnapshot,
  wallet: TradingBotAccountWalletSlot,
): void {
  account.activeWalletId = wallet.walletId;
  account.walletSource = wallet.walletSource;
  account.solanaWalletAddress = wallet.solanaWalletAddress;
  if (wallet.walletSource === "privy") {
    account.privyUserId = wallet.privyUserId;
    account.privyWalletId = wallet.privyWalletId;
  } else {
    delete account.privyUserId;
    delete account.privyWalletId;
  }
}

export function selectTradingBotAccountWallet(
  account: TradingBotAccountSnapshot,
  walletId: string,
):
  | { account: TradingBotAccountSnapshot; wallet: TradingBotAccountWalletSlot }
  | { error: string } {
  const wallet = account.wallets.find((entry) => entry.walletId === walletId);
  if (!wallet) return { error: "Wallet is not linked to this account" };
  if (wallet.role === "portfolio") {
    return { error: "Read-only portfolio wallets cannot be used for trading" };
  }
  activateTradingBotAccountWallet(account, wallet);
  return { account, wallet };
}

function tradingBotAccountWalletByRole(
  account: TradingBotAccountSnapshot,
  role: TradingBotWalletRole,
): TradingBotAccountWalletSlot | undefined {
  return account.wallets.find((wallet) => wallet.role === role);
}

function tradingBotAccountWalletSlotsValue(
  value: unknown,
  fallbackCreatedAt: string,
): TradingBotAccountWalletSlot[] {
  if (!Array.isArray(value)) return [];
  const slots: TradingBotAccountWalletSlot[] = [];
  const walletIds = new Set<string>();
  const addresses = new Set<string>();
  let managedWalletIndex = 0;
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const walletId = stringValue(record.walletId)?.slice(0, 128);
    const walletSource = walletSourceValue(record.walletSource);
    const solanaWalletAddress = stringValue(record.solanaWalletAddress);
    const privyUserId = stringValue(record.privyUserId)?.slice(0, 128);
    const privyWalletId = stringValue(record.privyWalletId)?.slice(0, 128);
    if (
      !walletId ||
      !walletSource ||
      !solanaWalletAddress ||
      !SOLANA_ADDRESS_PATTERN.test(solanaWalletAddress) ||
      walletIds.has(walletId) ||
      addresses.has(solanaWalletAddress) ||
      (walletSource === "privy" && (!privyUserId || !privyWalletId))
    ) {
      continue;
    }
    if (walletSource === "privy" && managedWalletIndex > 0) continue;
    const createdAt = optionalIsoTimestamp(record.createdAt) ?? fallbackCreatedAt;
    const role =
      walletSource === "external"
        ? "portfolio"
        : "spot_nft";
    slots.push({
      walletId,
      label: tradingBotWalletLabel(role),
      role,
      walletSource,
      ...(privyUserId ? { privyUserId } : {}),
      ...(privyWalletId ? { privyWalletId } : {}),
      solanaWalletAddress,
      createdAt,
    });
    walletIds.add(walletId);
    addresses.add(solanaWalletAddress);
    if (walletSource === "privy") managedWalletIndex += 1;
    if (slots.length >= 10) break;
  }
  return slots;
}

function rowToTradingBotAccountEvent(
  row: TradingBotAccountEventRow,
): TradingBotAccountEventSnapshot {
  return {
    telegramUserId: row.telegram_user_id,
    eventId: row.event_id,
    eventType: row.event_type,
    metadata: parseJsonRecord(row.metadata_json),
    createdAt: row.created_at,
  };
}

function rowToTradingBotManualReviewCase(
  row: TradingBotManualReviewCaseRow,
): TradingBotManualReviewCase {
  const status = manualReviewCaseStatusValue(row.status) ?? "open";
  const resolution = manualReviewResolutionValue(row.resolution);
  return {
    caseId: row.case_id,
    telegramUserId: row.telegram_user_id,
    executionKind: row.execution_kind,
    resourceId: row.resource_id,
    executionId: row.execution_id,
    referenceId: row.reference_id,
    ...(row.execution_started_at
      ? { executionStartedAt: row.execution_started_at }
      : {}),
    ...(row.manual_review_after
      ? { manualReviewAfter: row.manual_review_after }
      : {}),
    manualReviewRequiredAt: row.manual_review_required_at,
    ...(row.reason ? { reason: row.reason } : {}),
    status,
    ...(row.acknowledged_at ? { acknowledgedAt: row.acknowledged_at } : {}),
    ...(row.operator_note ? { operatorNote: row.operator_note } : {}),
    ...(row.last_checked_at ? { lastCheckedAt: row.last_checked_at } : {}),
    ...(row.last_check_status
      ? { lastCheckStatus: row.last_check_status }
      : {}),
    ...(row.last_check_error ? { lastCheckError: row.last_check_error } : {}),
    ...(resolution ? { resolution } : {}),
    ...(row.provider_status ? { providerStatus: row.provider_status } : {}),
    ...(row.signature ? { signature: row.signature } : {}),
    ...(row.transaction_id ? { transactionId: row.transaction_id } : {}),
    ...(row.resolved_at ? { resolvedAt: row.resolved_at } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToTradingBotAutomationOrder(
  row: TradingBotAutomationOrderRow,
): TradingBotStoredAutomationOrderSnapshot {
  const kind = orderKindValue(row.kind) ?? "limit";
  const side = orderSideValue(row.side) ?? "buy";
  const triggerDirection = triggerDirectionValue(
    row.trigger_direction ?? undefined,
  );
  return {
    telegramUserId: row.telegram_user_id,
    orderId: row.order_id,
    kind,
    side,
    status: automationOrderStatusValue(row.status),
    mint: row.mint,
    inMint: row.in_mint,
    outMint: row.out_mint,
    amountIn: row.amount_in,
    ...(row.amount_label ? { amountLabel: row.amount_label } : {}),
    walletAddress: row.wallet_address,
    slippageBps: integerSetting(row.slippage_bps, 500, 0, 10_000),
    priorityFee: integerSetting(row.priority_fee, 0, 0),
    ...(row.trigger_price ? { triggerPrice: row.trigger_price } : {}),
    ...(triggerDirection ? { triggerDirection } : {}),
    ...(row.order_count !== null ? { orderCount: row.order_count } : {}),
    ...(row.interval_minutes !== null
      ? { intervalMinutes: row.interval_minutes }
      : {}),
    ...(row.per_order_amount_in
      ? { perOrderAmountIn: row.per_order_amount_in }
      : {}),
    ...(row.trailing_bps !== null ? { trailingBps: row.trailing_bps } : {}),
    validation: automationOrderValidationValue(
      parseJsonRecord(row.validation_json),
      [],
      row.created_at,
    ),
    scheduler: automationOrderSchedulerStateValue(
      parseJsonRecord(row.scheduler_json),
    ),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToTradingBotAdvancedAutomationConfig(
  row: TradingBotAdvancedAutomationConfigRow,
): TradingBotStoredAdvancedAutomationConfigSnapshot {
  const kind = advancedAutomationKindValue(row.kind) ?? "copytrade";
  const source = sniperSourceValue(row.source ?? undefined);
  const bundleItems = bundleBuyItemsValue(row.bundle_items_json);
  const strategy = parseJsonRecord(row.strategy_json);
  const copyTradeStrategy =
    kind === "copytrade"
      ? copyTradeStrategyRecordValue(strategy, row.priority_fee)
      : {};
  return {
    telegramUserId: row.telegram_user_id,
    configId: row.config_id,
    kind,
    status: advancedAutomationStatusValue(row.status),
    walletAddress: row.wallet_address,
    ...(row.mint ? { mint: row.mint } : {}),
    ...(row.target_wallet ? { targetWallet: row.target_wallet } : {}),
    ...copyTradeStrategy,
    ...(source ? { source } : {}),
    maxBuyAmountIn: row.max_buy_amount_in,
    ...(row.amount_label ? { amountLabel: row.amount_label } : {}),
    slippageBps: integerSetting(row.slippage_bps, 500, 0, 10_000),
    priorityFee: integerSetting(row.priority_fee, 0, 0),
    ...(row.copy_sells !== null ? { copySells: row.copy_sells === 1 } : {}),
    minLiquidityUsd:
      typeof row.min_liquidity_usd === "number" &&
      Number.isFinite(row.min_liquidity_usd) &&
      row.min_liquidity_usd > 0
        ? row.min_liquidity_usd
        : kind === "auto_sell"
          ? 0
          : 1,
    ...(row.max_market_cap_usd !== null &&
    Number.isFinite(row.max_market_cap_usd) &&
    row.max_market_cap_usd > 0
      ? { maxMarketCapUsd: row.max_market_cap_usd }
      : {}),
    ...(row.max_snipes !== null
      ? { maxSnipes: integerSetting(row.max_snipes, 1, 1, 100) }
      : {}),
    ...(bundleItems.length > 0 ? { bundleItems } : {}),
    ...(row.sell_bps !== null
      ? { sellBps: integerSetting(row.sell_bps, 10_000, 1, 10_000) }
      : {}),
    ...(row.trigger_price ? { triggerPrice: row.trigger_price } : {}),
    ...(triggerDirectionValue(row.trigger_direction)
      ? { triggerDirection: triggerDirectionValue(row.trigger_direction) }
      : {}),
    validation: advancedAutomationConfigValidationValue(
      parseJsonRecord(row.validation_json),
      [],
      row.created_at,
    ),
    monitor: advancedAutomationMonitorStateValue(
      parseJsonRecord(row.monitor_json),
    ),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function advancedAutomationStrategyRecord(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
): Record<string, unknown> {
  if (config.kind !== "copytrade") return {};
  return {
    tag: config.tag,
    buyMode: config.buyMode ?? "percentage",
    buyPercentageBps: config.buyPercentageBps ?? 10_000,
    sellPriorityFee: config.sellPriorityFee ?? config.priorityFee,
    duplicateBuys: config.duplicateBuys ?? true,
    onlyRenounced: config.onlyRenounced ?? false,
    excludePumpFunTokens: config.excludePumpFunTokens ?? false,
    minTargetBuyAmountIn: config.minTargetBuyAmountIn,
    minMarketCapUsd: config.minMarketCapUsd,
    blacklistMints: [...(config.blacklistMints ?? [])],
  };
}

function copyTradeStrategyRecordValue(
  value: Record<string, unknown>,
  legacyPriorityFee: number,
): Partial<TradingBotStoredAdvancedAutomationConfigSnapshot> {
  const blacklist = copyTradeBlacklistMintsValue(value.blacklistMints).values;
  const minTargetBuyAmountIn = positiveIntegerStringValue(
    value.minTargetBuyAmountIn,
  );
  const minMarketCapUsd = positiveNumberValue(value.minMarketCapUsd);
  const tag = copyTradeTagValue(value.tag);
  return {
    ...(tag ? { tag } : {}),
    buyMode: copyTradeBuyModeValue(value.buyMode) ?? "percentage",
    buyPercentageBps: clampInteger(
      numberValue(value.buyPercentageBps),
      1,
      10_000,
      10_000,
    ),
    sellPriorityFee: integerSetting(
      value.sellPriorityFee,
      integerSetting(legacyPriorityFee, 0, 0),
      0,
    ),
    duplicateBuys: booleanSetting(value.duplicateBuys, true),
    onlyRenounced: booleanSetting(value.onlyRenounced, false),
    excludePumpFunTokens: booleanSetting(value.excludePumpFunTokens, false),
    ...(minTargetBuyAmountIn ? { minTargetBuyAmountIn } : {}),
    ...(minMarketCapUsd !== undefined ? { minMarketCapUsd } : {}),
    blacklistMints: blacklist ?? [],
  };
}

function parseStoredSettings(value: string): TradingBotStoredSettings {
  const parsed = parseJsonRecord(value);
  const defaults = defaultTradingBotSettings();
  const buyPresetAmountsIn = tradingBotBuyPresetAmountsValue(
    parsed.buyPresetAmountsIn,
  ).values;
  const sellPresetBps = tradingBotSellPresetBpsValue(
    parsed.sellPresetBps,
  ).values;
  return {
    slippageBps: integerSetting(
      parsed.slippageBps,
      defaults.slippageBps,
      0,
      10_000,
    ),
    priorityFee: integerSetting(parsed.priorityFee, defaults.priorityFee, 0),
    sellPriorityFee: integerSetting(
      parsed.sellPriorityFee,
      integerSetting(parsed.priorityFee, defaults.priorityFee, 0),
      0,
    ),
    defaultBuyAmountIn:
      typeof parsed.defaultBuyAmountIn === "string" &&
      /^[1-9]\d*$/.test(parsed.defaultBuyAmountIn)
        ? parsed.defaultBuyAmountIn
        : defaults.defaultBuyAmountIn,
    buyPresetAmountsIn: buyPresetAmountsIn ?? [...defaults.buyPresetAmountsIn],
    sellPresetBps: sellPresetBps ?? [...defaults.sellPresetBps],
    botMode: tradingBotModeValue(parsed.botMode) ?? defaults.botMode,
    confirmTrades:
      tradingBotModeValue(parsed.botMode) === "simple"
        ? false
        : booleanSetting(parsed.confirmTrades, defaults.confirmTrades),
    sellProtection: booleanSetting(
      parsed.sellProtection,
      defaults.sellProtection,
    ),
    autoBuyEnabled: booleanSetting(
      parsed.autoBuyEnabled,
      defaults.autoBuyEnabled,
    ),
    instantAutoBuyEnabled: booleanSetting(
      parsed.instantAutoBuyEnabled,
      defaults.instantAutoBuyEnabled,
    ),
    instantAutoBuyAmountIn:
      typeof parsed.instantAutoBuyAmountIn === "string" &&
      /^[1-9]\d*$/.test(parsed.instantAutoBuyAmountIn)
        ? parsed.instantAutoBuyAmountIn
        : defaults.instantAutoBuyAmountIn,
    instantAutoBuyMinLiquidityUsd:
      positiveNumberValue(parsed.instantAutoBuyMinLiquidityUsd) ??
      defaults.instantAutoBuyMinLiquidityUsd,
    ...(positiveNumberValue(parsed.instantAutoBuyMaxMarketCapUsd) !== undefined
      ? {
          instantAutoBuyMaxMarketCapUsd: positiveNumberValue(
            parsed.instantAutoBuyMaxMarketCapUsd,
          ),
        }
      : {}),
    autoSellEnabled: booleanSetting(
      parsed.autoSellEnabled,
      defaults.autoSellEnabled,
    ),
    sniperEnabled: booleanSetting(parsed.sniperEnabled, defaults.sniperEnabled),
    mevProtection: booleanSetting(parsed.mevProtection, defaults.mevProtection),
  };
}

function mergeStoredSettings(
  current: TradingBotStoredSettings,
  update: NonNullable<NormalizedTradingBotPreference["settings"]>,
): TradingBotStoredSettings {
  const merged: TradingBotStoredSettings = {
    ...current,
    ...(update.slippageBps !== undefined
      ? { slippageBps: update.slippageBps }
      : {}),
    priorityFee: update.priorityFee,
    ...(update.sellPriorityFee !== undefined
      ? { sellPriorityFee: update.sellPriorityFee }
      : {}),
    ...(update.defaultBuyAmountIn !== undefined
      ? { defaultBuyAmountIn: update.defaultBuyAmountIn }
      : {}),
    ...(update.buyPresetAmountsIn !== undefined
      ? { buyPresetAmountsIn: [...update.buyPresetAmountsIn] }
      : {}),
    ...(update.sellPresetBps !== undefined
      ? { sellPresetBps: [...update.sellPresetBps] }
      : {}),
    ...(update.botMode !== undefined ? { botMode: update.botMode } : {}),
    ...(update.confirmTrades !== undefined
      ? { confirmTrades: update.confirmTrades }
      : {}),
    ...(update.sellProtection !== undefined
      ? { sellProtection: update.sellProtection }
      : {}),
    ...(update.autoBuyEnabled !== undefined
      ? { autoBuyEnabled: update.autoBuyEnabled }
      : {}),
    ...(update.instantAutoBuyEnabled !== undefined
      ? { instantAutoBuyEnabled: update.instantAutoBuyEnabled }
      : {}),
    ...(update.instantAutoBuyAmountIn !== undefined
      ? { instantAutoBuyAmountIn: update.instantAutoBuyAmountIn }
      : {}),
    ...(update.instantAutoBuyMinLiquidityUsd !== undefined
      ? {
          instantAutoBuyMinLiquidityUsd:
            update.instantAutoBuyMinLiquidityUsd,
        }
      : {}),
    ...(update.instantAutoBuyMaxMarketCapUsd !== undefined
      ? {
          instantAutoBuyMaxMarketCapUsd:
            update.instantAutoBuyMaxMarketCapUsd,
        }
      : {}),
    ...(update.autoSellEnabled !== undefined
      ? { autoSellEnabled: update.autoSellEnabled }
      : {}),
    ...(update.sniperEnabled !== undefined
      ? { sniperEnabled: update.sniperEnabled }
      : {}),
    ...(update.mevProtection !== undefined
      ? { mevProtection: update.mevProtection }
      : {}),
  };
  if (merged.botMode === "simple") merged.confirmTrades = false;
  return merged;
}

function parseStoredTokenList(value: string): string[] {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((entry): entry is string => typeof entry === "string")
    .filter(
      (entry) =>
        SOLANA_ADDRESS_PATTERN.test(entry) && entry !== WRAPPED_SOL_MINT,
    )
    .slice(0, MAX_TRADING_BOT_TOKEN_LIST);
}

function tokenListValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(
    value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(
        (entry) =>
          SOLANA_ADDRESS_PATTERN.test(entry) && entry !== WRAPPED_SOL_MINT,
      ),
  ).slice(0, MAX_TRADING_BOT_TOKEN_LIST);
}

function applyTokenListAction(
  list: string[],
  action: TradingBotPreferenceAction,
  mint: string,
): string[] {
  const current = list.filter(
    (entry) => SOLANA_ADDRESS_PATTERN.test(entry) && entry !== WRAPPED_SOL_MINT,
  );
  if (action === "remove") {
    return current.filter((entry) => entry !== mint);
  }
  if (!current.includes(mint)) current.push(mint);
  return current.slice(0, MAX_TRADING_BOT_TOKEN_LIST);
}

function validateNormalizedPreference(
  preference: NormalizedTradingBotPreference,
): string | undefined {
  if (
    !preference.telegramUserId ||
    !TELEGRAM_USER_ID_PATTERN.test(preference.telegramUserId)
  ) {
    return "telegramUserId is required";
  }
  if (
    preference.userPublicKey &&
    !SOLANA_ADDRESS_PATTERN.test(preference.userPublicKey)
  ) {
    return "userPublicKey must be a Solana address";
  }
  if (!["settings", "watchlist", "hiddenToken"].includes(preference.kind)) {
    return "kind must be settings, watchlist, or hiddenToken";
  }
  if (!["set", "add", "remove"].includes(preference.action)) {
    return "action must be set, add, or remove";
  }
  if (preference.kind === "settings") {
    return preference.action === "set" && preference.settings
      ? undefined
      : "settings action must be set";
  }
  if (preference.action === "set") {
    return "token list actions must be add or remove";
  }
  if (
    !preference.mint ||
    !SOLANA_ADDRESS_PATTERN.test(preference.mint) ||
    preference.mint === WRAPPED_SOL_MINT
  ) {
    return "mint must be an SPL token mint";
  }
  return undefined;
}

function tradingBotModeValue(value: unknown): TradingBotMode | undefined {
  const normalized = stringValue(value)?.toLowerCase();
  return normalized === "simple" || normalized === "advanced"
    ? normalized
    : undefined;
}

function tradingBotBuyPresetAmountsValue(value: unknown): {
  values?: string[];
  error?: string;
} {
  if (value === undefined) return {};
  if (
    !Array.isArray(value) ||
    value.length < TRADING_BOT_PRESET_MIN_COUNT ||
    value.length > TRADING_BOT_PRESET_MAX_COUNT
  ) {
    return {
      error: `buyPresetAmountsIn must contain ${TRADING_BOT_PRESET_MIN_COUNT} to ${TRADING_BOT_PRESET_MAX_COUNT} amounts`,
    };
  }
  const values: string[] = [];
  for (const entry of value) {
    const amount = stringValue(entry);
    if (!amount || !/^[1-9]\d*$/.test(amount)) {
      return {
        error: "buyPresetAmountsIn must contain positive integer strings",
      };
    }
    if (values.includes(amount)) {
      return { error: "buyPresetAmountsIn must not contain duplicates" };
    }
    values.push(amount);
  }
  return { values };
}

function tradingBotSellPresetBpsValue(value: unknown): {
  values?: number[];
  error?: string;
} {
  if (value === undefined) return {};
  if (
    !Array.isArray(value) ||
    value.length < TRADING_BOT_PRESET_MIN_COUNT ||
    value.length > TRADING_BOT_PRESET_MAX_COUNT
  ) {
    return {
      error: `sellPresetBps must contain ${TRADING_BOT_PRESET_MIN_COUNT} to ${TRADING_BOT_PRESET_MAX_COUNT} values`,
    };
  }
  const values: number[] = [];
  for (const entry of value) {
    const bps = numberValue(entry);
    if (
      bps === undefined ||
      !Number.isInteger(bps) ||
      bps < 1 ||
      bps > 10_000
    ) {
      return { error: "sellPresetBps must contain integers from 1 to 10000" };
    }
    if (values.includes(bps)) {
      return { error: "sellPresetBps must not contain duplicates" };
    }
    values.push(bps);
  }
  return { values };
}

function walletSourceValue(value: unknown): "privy" | "external" | undefined {
  const normalized = stringValue(value);
  return normalized === "privy" || normalized === "external"
    ? normalized
    : undefined;
}

function tradingBotWalletRoleValue(
  value: unknown,
): TradingBotWalletRole | undefined {
  const normalized = stringValue(value);
  if (
    normalized === "spot_nft" ||
    normalized === "portfolio"
  ) {
    return normalized;
  }
  return undefined;
}

function tradingBotWalletLabel(role: TradingBotWalletRole): string {
  if (role === "spot_nft") return SPOT_NFT_WALLET_LABEL;
  return PORTFOLIO_WALLET_LABEL;
}

function controlWalletActionValue(
  value: unknown,
): TradingBotControlWalletAction | undefined {
  const normalized = stringValue(value);
  if (
    normalized === "claim" ||
    normalized === "export" ||
    normalized === "revoke" ||
    normalized === "restore" ||
    normalized === "verify_signer"
  ) {
    return normalized;
  }
  return undefined;
}

function parseJsonRecord(value: string): Record<string, unknown> {
  const parsed = parseJson(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function integerSetting(
  value: unknown,
  fallback: number,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
    ? value
    : fallback;
}

function booleanSetting(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

async function loadTradingBotPositions(
  env: Env,
  userPublicKey: string,
): Promise<TradingBotPositionsSnapshot> {
  const rpcUrl = resolveRpcUrl(env);
  if (!rpcUrl) {
    throw new Error("SOLANA_RPC_URL is required");
  }

  const commitment = env.SOLANA_COMMITMENT?.trim() || "confirmed";
  const [balance, tokenAccounts] = await Promise.all([
    rpcRequest<{ value?: number }>(rpcUrl, "getBalance", [
      userPublicKey,
      { commitment },
    ]),
    rpcRequest<TokenAccountRpcResult>(rpcUrl, "getTokenAccountsByOwner", [
      userPublicKey,
      { programId: TOKEN_PROGRAM_ID },
      { encoding: "jsonParsed", commitment },
    ]),
  ]);

  const lamports = String(balance.result?.value ?? 0);
  const tokens = (tokenAccounts.result?.value ?? [])
    .map((entry) => {
      const info = entry.account?.data?.parsed?.info;
      const tokenAmount = info?.tokenAmount;
      return {
        mint: info?.mint ?? "",
        tokenAccount: entry.pubkey ?? "",
        amount: tokenAmount?.amount ?? "0",
        decimals: tokenAmount?.decimals ?? 0,
        uiAmount: tokenAmount?.uiAmount ?? null,
        uiAmountString: tokenAmount?.uiAmountString ?? "0",
      };
    })
    .filter(
      (token) => token.mint && token.tokenAccount && token.amount !== "0",
    );

  return {
    walletAddress: userPublicKey,
    sol: {
      lamports,
      uiAmount: Number(lamports) / 1_000_000_000,
    },
    tokens,
    generatedAt: new Date().toISOString(),
  };
}

async function loadTradingBotTokenSafety(env: Env, mint: string) {
  const rpcUrl = resolveRpcUrl(env);
  if (!rpcUrl) {
    throw new Error("SOLANA_RPC_URL is required");
  }

  const commitment = env.SOLANA_COMMITMENT?.trim() || "confirmed";
  const [accountInfo, prices] = await Promise.all([
    rpcRequest<MintAccountInfoRpcResult>(rpcUrl, "getAccountInfo", [
      mint,
      { encoding: "jsonParsed", commitment },
    ]),
    fetchJupiterPrices(env, [mint]),
  ]);
  return buildTradingBotTokenSafetyReport(
    mint,
    accountInfo.result?.value ?? null,
    prices[mint],
  );
}

function buildTradingBotTokenSafetyReport(
  mint: string,
  account: NonNullable<MintAccountInfoRpcResult["result"]>["value"] | null,
  price: JupiterPriceEntry | undefined,
) {
  const generatedAt = new Date().toISOString();
  if (!account) {
    return {
      status: "not_found",
      mint,
      generatedAt,
      risk: {
        level: "unknown" satisfies TokenSafetyRiskLevel,
        score: 0,
        flags: [
          {
            code: "mint_account_not_found",
            severity: "danger" satisfies TokenSafetyFlagSeverity,
            message: "No token mint account was found for this address.",
          },
        ],
      },
      warnings: ["No token mint account was found for this address."],
    };
  }

  const data =
    account.data &&
    typeof account.data === "object" &&
    !Array.isArray(account.data)
      ? account.data
      : undefined;
  const parsed = data?.parsed;
  const info = parsed?.info;
  const mintAuthority = stringValue(info?.mintAuthority) ?? null;
  const freezeAuthority = stringValue(info?.freezeAuthority) ?? null;
  const supply = stringValue(info?.supply) ?? "0";
  const decimals = numberValue(info?.decimals);
  const isInitialized = Boolean(info?.isInitialized);
  const usdPrice = price?.usdPrice;
  const flags: TokenSafetyFlag[] = [];

  if (account.owner !== TOKEN_PROGRAM_ID) {
    flags.push({
      code: "not_spl_token_program",
      severity: "danger",
      message: "Mint account is not owned by the SPL Token program.",
    });
  }
  if (parsed?.type !== "mint") {
    flags.push({
      code: "not_mint_account",
      severity: "danger",
      message: "RPC data did not parse this account as an SPL token mint.",
    });
  }
  if (!isInitialized) {
    flags.push({
      code: "mint_not_initialized",
      severity: "danger",
      message: "Token mint is not initialized.",
    });
  }
  if (mintAuthority) {
    flags.push({
      code: "mint_authority_enabled",
      severity: "danger",
      message: "Mint authority is still enabled, so supply can be increased.",
    });
  } else {
    flags.push({
      code: "mint_authority_disabled",
      severity: "info",
      message: "Mint authority is disabled.",
    });
  }
  if (freezeAuthority) {
    flags.push({
      code: "freeze_authority_enabled",
      severity: "danger",
      message:
        "Freeze authority is still enabled, so token accounts can be frozen.",
    });
  } else {
    flags.push({
      code: "freeze_authority_disabled",
      severity: "info",
      message: "Freeze authority is disabled.",
    });
  }
  if (supply === "0") {
    flags.push({
      code: "zero_supply",
      severity: "warning",
      message: "Token supply is zero or unavailable from RPC.",
    });
  }
  if (!usdPrice || !Number.isFinite(usdPrice) || usdPrice <= 0) {
    flags.push({
      code: "jupiter_price_unavailable",
      severity: "warning",
      message: "Jupiter Price V3 does not currently return a USD price.",
    });
  } else {
    flags.push({
      code: "jupiter_price_available",
      severity: "info",
      message: "Jupiter Price V3 returned a USD price.",
    });
  }

  const dangerCount = flags.filter((flag) => flag.severity === "danger").length;
  const warningCount = flags.filter(
    (flag) => flag.severity === "warning",
  ).length;
  const riskLevel: TokenSafetyRiskLevel =
    dangerCount > 0 ? "high" : warningCount > 0 ? "medium" : "low";
  const score = Math.max(0, 100 - dangerCount * 35 - warningCount * 15);
  const warnings = flags
    .filter((flag) => flag.severity !== "info")
    .map((flag) => flag.message);

  return {
    status: "ready",
    mint,
    generatedAt,
    mintAccount: {
      owner: account.owner ?? null,
      executable: Boolean(account.executable),
      lamports: account.lamports ?? null,
      decimals: decimals ?? null,
      supply,
      isInitialized,
      mintAuthority,
      freezeAuthority,
    },
    pricing: {
      source: "jupiter-price-v3",
      usdPrice: usdPrice ?? null,
      priceChange24h: price?.priceChange24h ?? null,
      priced: Boolean(usdPrice && Number.isFinite(usdPrice) && usdPrice > 0),
    },
    risk: {
      level: riskLevel,
      score,
      flags,
    },
    warnings,
  };
}

async function loadTradingBotMarketRisk(
  env: Env,
  input: {
    telegramUserId: string;
    userPublicKey?: string;
    mint: string;
    amountIn: string;
    slippageBps: number;
    priorityFee: number;
    minLiquidityUsd?: number;
    maxMarketCapUsd?: number;
    maxPriceImpactBps: number;
    requestUrl: string;
  },
) {
  const [tokenSafety, solPrices] = await Promise.all([
    loadTradingBotTokenSafety(env, input.mint),
    fetchJupiterPrices(env, [WRAPPED_SOL_MINT]),
  ]);
  const solUsdPrice = solPrices[WRAPPED_SOL_MINT]?.usdPrice ?? null;
  const probeAmountIn = quoteProbeAmountIn(
    input.amountIn,
    input.minLiquidityUsd,
    solUsdPrice,
  );
  const quoteProbe = await loadTradingBotMarketQuoteProbe(
    env,
    input,
    probeAmountIn,
    solUsdPrice,
  );
  const marketCapUsd = tokenSafetyMarketCapUsd(tokenSafety);
  const flags: TokenSafetyFlag[] = [...tokenSafety.risk.flags];

  if (input.maxMarketCapUsd) {
    if (marketCapUsd === null) {
      flags.push({
        code: "market_cap_unavailable",
        severity: "warning",
        message:
          "Market cap could not be estimated from supply and Jupiter price.",
      });
    } else if (marketCapUsd > input.maxMarketCapUsd) {
      flags.push({
        code: "market_cap_above_limit",
        severity: "danger",
        message: "Estimated market cap is above the configured maximum.",
      });
    } else {
      flags.push({
        code: "market_cap_within_limit",
        severity: "info",
        message: "Estimated market cap is within the configured maximum.",
      });
    }
  }

  if (quoteProbe.status === "ready") {
    if (!quoteProbe.executable) {
      flags.push({
        code: "quote_not_executable",
        severity: "danger",
        message: "FTX/FrogX could not produce an executable buy quote.",
      });
    }
    if (!/^[1-9]\d*$/.test(quoteProbe.amountOut)) {
      flags.push({
        code: "quote_zero_output",
        severity: "danger",
        message: "FTX/FrogX quote probe returned no output tokens.",
      });
    }
    if (quoteProbe.priceImpactBps === null) {
      flags.push({
        code: "price_impact_unavailable",
        severity: "warning",
        message: "FTX/FrogX quote probe did not return price impact.",
      });
    } else if (quoteProbe.priceImpactBps > input.maxPriceImpactBps) {
      flags.push({
        code: "price_impact_above_limit",
        severity: "danger",
        message:
          "FTX/FrogX quote probe price impact is above the configured maximum.",
      });
    } else {
      flags.push({
        code: "price_impact_within_limit",
        severity: "info",
        message:
          "FTX/FrogX quote probe price impact is within the configured maximum.",
      });
    }

    if (input.minLiquidityUsd) {
      if (quoteProbe.amountInUsd === null) {
        flags.push({
          code: "liquidity_probe_usd_unavailable",
          severity: "warning",
          message:
            "SOL USD price is unavailable, so the liquidity probe size is approximate.",
        });
      } else if (quoteProbe.amountInUsd < input.minLiquidityUsd) {
        flags.push({
          code: "liquidity_probe_below_filter",
          severity: "warning",
          message:
            "Quote probe notional is below the configured minimum liquidity filter.",
        });
      } else {
        flags.push({
          code: "liquidity_probe_passed",
          severity: "info",
          message:
            "FTX/FrogX quoted the requested minimum-liquidity probe size.",
        });
      }
    }
  } else if (quoteProbe.status === "not_configured") {
    flags.push({
      code: "quote_probe_not_configured",
      severity: "warning",
      message: "FTX/FrogX quote probing requires Titan quote credentials.",
    });
  } else {
    flags.push({
      code: "quote_probe_unavailable",
      severity: "warning",
      message: quoteProbe.reason,
    });
  }

  const dangerCount = flags.filter((flag) => flag.severity === "danger").length;
  const warningCount = flags.filter(
    (flag) => flag.severity === "warning",
  ).length;
  const riskLevel: TokenSafetyRiskLevel =
    dangerCount > 0 ? "high" : warningCount > 0 ? "medium" : "low";
  const score = Math.max(0, 100 - dangerCount * 25 - warningCount * 10);

  return {
    status: "ready",
    mint: input.mint,
    generatedAt: new Date().toISOString(),
    tokenSafety,
    pricing: {
      solUsdPrice,
    },
    marketCap: {
      usd: marketCapUsd,
      maxMarketCapUsd: input.maxMarketCapUsd ?? null,
      withinLimit:
        input.maxMarketCapUsd && marketCapUsd !== null
          ? marketCapUsd <= input.maxMarketCapUsd
          : null,
    },
    quoteProbe,
    thresholds: {
      minLiquidityUsd: input.minLiquidityUsd ?? null,
      maxMarketCapUsd: input.maxMarketCapUsd ?? null,
      maxPriceImpactBps: input.maxPriceImpactBps,
    },
    risk: {
      level: riskLevel,
      score,
      flags,
    },
    warnings: flags
      .filter((flag) => flag.severity !== "info")
      .map((flag) => flag.message),
  };
}

async function loadTradingBotMarketQuoteProbe(
  env: Env,
  input: {
    telegramUserId: string;
    userPublicKey?: string;
    mint: string;
    slippageBps: number;
    priorityFee: number;
    requestUrl: string;
  },
  amountIn: string,
  solUsdPrice: number | null,
) {
  const amountInUsd = amountInUsdValue(amountIn, solUsdPrice);
  if (!getTitanConfig(env).token) {
    return {
      status: "not_configured" as const,
      required: ["TITAN_TOKEN"],
      amountIn,
      amountInUsd,
    };
  }
  if (!input.userPublicKey) {
    return {
      status: "skipped" as const,
      reason: "userPublicKey is required for an FTX/FrogX quote probe.",
      amountIn,
      amountInUsd,
    };
  }

  const quote = await tryBuildTradingBotQuote(
    {
      telegramUserId: input.telegramUserId,
      userPublicKey: input.userPublicKey,
      inMint: WRAPPED_SOL_MINT,
      outMint: input.mint,
      amountIn,
      slippageBps: input.slippageBps,
      priorityFee: input.priorityFee,
    },
    input.requestUrl,
    env,
  );

  if (!quote) {
    return {
      status: "unavailable" as const,
      reason: "FTX/FrogX quote probe is unavailable.",
      amountIn,
      amountInUsd,
    };
  }

  return {
    status: "ready" as const,
    inMint: WRAPPED_SOL_MINT,
    outMint: input.mint,
    amountIn,
    amountInUsd,
    amountOut: quote.amountOut ?? "0",
    priceImpactBps:
      typeof quote.priceImpactBps === "number" &&
      Number.isFinite(quote.priceImpactBps)
        ? quote.priceImpactBps
        : null,
    executable: Boolean(quote.executable),
    provider: quote.provider ?? null,
    routeId: quote.routeId ?? null,
    routers: Array.isArray(quote.routers)
      ? quote.routers.map((router) => String(router)).slice(0, 5)
      : [],
  };
}

function tradingBotQuoteProbeBlockingReason(
  quoteProbe: Awaited<ReturnType<typeof loadTradingBotMarketQuoteProbe>>,
): string {
  if (quoteProbe.status === "not_configured") {
    const required = quoteProbe.required.join(", ") || "quote credentials";
    return `FTX/FrogX did not verify liquidity or price impact because ${required} is not configured. This is not a safety pass.`;
  }
  if (quoteProbe.status === "ready") {
    return "FTX/FrogX quote verification completed.";
  }
  return `FTX/FrogX did not verify liquidity or price impact: ${quoteProbe.reason} This is not a safety pass.`;
}

function quoteProbeAmountIn(
  amountIn: string,
  minLiquidityUsd: number | undefined,
  solUsdPrice: number | null,
): string {
  if (!minLiquidityUsd || !solUsdPrice || solUsdPrice <= 0) return amountIn;
  const requiredLamports = BigInt(
    Math.ceil((minLiquidityUsd / solUsdPrice) * 1e9),
  );
  const requestedLamports = BigInt(amountIn);
  return (
    requiredLamports > requestedLamports ? requiredLamports : requestedLamports
  ).toString();
}

function amountInUsdValue(
  amountIn: string,
  solUsdPrice: number | null,
): number | null {
  if (!solUsdPrice || solUsdPrice <= 0) return null;
  const amount = Number(amountIn) / 1_000_000_000;
  const value = amount * solUsdPrice;
  return Number.isFinite(value) ? value : null;
}

function tokenSafetyMarketCapUsd(
  safety: Awaited<ReturnType<typeof loadTradingBotTokenSafety>>,
): number | null {
  if (safety.status !== "ready") return null;
  const usdPrice = safety.pricing.usdPrice;
  const decimals = safety.mintAccount.decimals;
  if (!usdPrice || decimals === null || decimals < 0) return null;
  const supply = Number(safety.mintAccount.supply) / 10 ** decimals;
  const marketCap = supply * usdPrice;
  return Number.isFinite(marketCap) && marketCap > 0 ? marketCap : null;
}

async function tryBuildTradingBotQuote(
  swap: NormalizedTradingBotSwap,
  requestUrl: string,
  env: Env,
): Promise<TradingBotQuoteBuildResult | null> {
  try {
    const quoteResponse = await buildTradingBotQuote(swap, requestUrl, env);
    if (!quoteResponse.ok) return null;
    const quote = (await quoteResponse.json()) as TradingBotQuoteBuildResult;
    return quote.error ? null : quote;
  } catch (error) {
    console.warn(
      "[trading-bot] Quote estimate unavailable for execution event",
      error,
    );
    return null;
  }
}

function buildTradingBotQuote(
  swap: NormalizedTradingBotSwap,
  requestUrl: string,
  env: Env,
): Promise<Response> {
  const quoteRequest = new Request(requestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userPublicKey: swap.userPublicKey,
      inMint: swap.inMint,
      outMint: swap.outMint,
      amountIn: swap.amountIn,
      slippageBps: swap.slippageBps,
      priorityFee: swap.priorityFee,
    }),
  });

  return postQuotes(quoteRequest, env);
}

async function fetchJupiterPrices(
  env: Env,
  mints: string[],
): Promise<Record<string, JupiterPriceEntry>> {
  if (mints.length === 0) return {};

  try {
    const url = new URL(
      env.JUPITER_PRICE_API_URL?.trim() || DEFAULT_JUPITER_PRICE_API_URL,
    );
    url.searchParams.set("ids", mints.join(","));

    const headers = new Headers();
    const apiKey = env.JUPITER_API_KEY?.trim();
    if (apiKey) headers.set("x-api-key", apiKey);

    const response = await fetch(url.toString(), { headers });
    if (!response.ok) {
      console.warn(
        "[trading-bot] Jupiter price lookup failed",
        response.status,
      );
      return {};
    }

    const data = (await response.json()) as Record<string, JupiterPriceEntry>;
    return Object.fromEntries(
      Object.entries(data).filter(
        ([mint, price]) =>
          SOLANA_ADDRESS_PATTERN.test(mint) &&
          typeof price?.usdPrice === "number" &&
          Number.isFinite(price.usdPrice),
      ),
    );
  } catch (error) {
    console.warn("[trading-bot] Jupiter price lookup unavailable", error);
    return {};
  }
}

async function fetchJupiterRecentTokens(
  env: Env,
): Promise<JupiterRecentToken[]> {
  const apiKey = env.JUPITER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("JUPITER_API_KEY is required for sniper launch monitoring");
  }

  const url =
    env.JUPITER_TOKENS_API_URL?.trim() || DEFAULT_JUPITER_TOKENS_API_URL;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "x-api-key": apiKey,
    },
  });
  if (!response.ok) {
    throw new Error(
      `Jupiter recent-pool lookup failed with status ${response.status}`,
    );
  }

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error("Jupiter recent-pool response is invalid");
  }

  return data
    .flatMap((value): JupiterRecentToken[] => {
      if (!value || typeof value !== "object" || Array.isArray(value))
        return [];
      const record = value as Record<string, unknown>;
      const firstPoolRecord =
        record.firstPool &&
        typeof record.firstPool === "object" &&
        !Array.isArray(record.firstPool)
          ? (record.firstPool as Record<string, unknown>)
          : undefined;
      const mint = stringValue(record.id);
      const firstPoolId = stringValue(firstPoolRecord?.id);
      const firstPoolCreatedAt = stringValue(firstPoolRecord?.createdAt);
      if (
        !mint ||
        !SOLANA_ADDRESS_PATTERN.test(mint) ||
        !firstPoolId ||
        !SOLANA_ADDRESS_PATTERN.test(firstPoolId) ||
        !firstPoolCreatedAt ||
        !Number.isFinite(Date.parse(firstPoolCreatedAt))
      ) {
        return [];
      }

      const name = stringValue(record.name);
      const symbol = stringValue(record.symbol);
      const launchpad = stringValue(record.launchpad);
      const liquidityUsd = positiveFiniteNumber(record.liquidity);
      const marketCapUsd = positiveFiniteNumber(record.mcap);
      const usdPrice = positiveFiniteNumber(record.usdPrice);
      const organicScore = nonNegativeFiniteNumber(record.organicScore);
      const mintAuthority = nullableStringValue(record.mintAuthority);
      const freezeAuthority = nullableStringValue(record.freezeAuthority);

      return [
        {
          mint,
          firstPoolId,
          firstPoolCreatedAt: new Date(firstPoolCreatedAt).toISOString(),
          ...(name ? { name: name.slice(0, 80) } : {}),
          ...(symbol ? { symbol: symbol.slice(0, 24) } : {}),
          ...(launchpad ? { launchpad: launchpad.slice(0, 80) } : {}),
          ...(liquidityUsd !== undefined ? { liquidityUsd } : {}),
          ...(marketCapUsd !== undefined ? { marketCapUsd } : {}),
          ...(usdPrice !== undefined ? { usdPrice } : {}),
          ...(organicScore !== undefined ? { organicScore } : {}),
          ...(mintAuthority !== undefined ? { mintAuthority } : {}),
          ...(freezeAuthority !== undefined ? { freezeAuthority } : {}),
        },
      ];
    })
    .sort((a, b) => {
      const byTime =
        Date.parse(a.firstPoolCreatedAt) - Date.parse(b.firstPoolCreatedAt);
      return byTime || a.firstPoolId.localeCompare(b.firstPoolId);
    });
}

function positiveFiniteNumber(value: unknown): number | undefined {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

function nonNegativeFiniteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
}

function nullableStringValue(value: unknown): string | null | undefined {
  if (value === null) return null;
  return stringValue(value);
}

async function loadSolanaSignaturesForAddress(
  env: Env,
  address: string,
  limit: number,
): Promise<
  Array<{ signature: string; slot?: number; blockTime?: number | null }>
> {
  const rpcUrl = resolveRpcUrl(env);
  if (!rpcUrl) {
    throw new Error("SOLANA_RPC_URL is required");
  }

  const signatures = await rpcRequest<SignatureInfoRpcResult>(
    rpcUrl,
    "getSignaturesForAddress",
    [
      address,
      {
        limit: clampInteger(limit, 1, 25, 10),
        commitment: env.SOLANA_COMMITMENT?.trim() || "confirmed",
      },
    ],
  );

  return (signatures.result ?? [])
    .filter(
      (
        entry,
      ): entry is {
        signature: string;
        slot?: number;
        blockTime?: number | null;
      } => typeof entry.signature === "string" && entry.signature.length > 0,
    )
    .map((entry) => ({
      signature: entry.signature.slice(0, 128),
      ...(typeof entry.slot === "number" ? { slot: entry.slot } : {}),
      ...(entry.blockTime !== undefined ? { blockTime: entry.blockTime } : {}),
    }));
}

async function loadSolanaParsedTransaction(
  env: Env,
  signature: string,
): Promise<ParsedTransactionRpcResult> {
  const transaction = await fetchSolanaParsedTransaction(env, signature);
  if (!transaction) {
    throw new Error("Copytrade target transaction was not found");
  }
  if (transaction.meta?.err) {
    throw new Error("Copytrade target transaction failed on-chain");
  }
  return transaction;
}

async function fetchSolanaParsedTransaction(
  env: Env,
  signature: string,
): Promise<ParsedTransactionRpcResult | null> {
  const rpcUrl = resolveRpcUrl(env);
  if (!rpcUrl) {
    throw new Error("SOLANA_RPC_URL is required");
  }

  const transaction = await rpcRequest<ParsedTransactionRpcResult | null>(
    rpcUrl,
    "getTransaction",
    [
      signature,
      {
        encoding: "jsonParsed",
        commitment: env.SOLANA_COMMITMENT?.trim() || "confirmed",
        maxSupportedTransactionVersion: 0,
      },
    ],
  );
  return transaction.result ?? null;
}

async function reconcileTradingBotSwapFills(
  env: Env,
  telegramUserId: string,
  walletAddress: string,
  events: TradingBotAccountEventSnapshot[],
): Promise<TradingBotFillReconciliation> {
  const existingFills = confirmedSwapFillsBySignature(events, walletAddress);
  const candidateSignatures = new Set<string>();
  const candidates: TradingBotAccountEventSnapshot[] = [];

  for (const event of events) {
    if (event.eventType !== "swap_executed") continue;
    const signature = stringValue(event.metadata.signature);
    const inMint = stringValue(event.metadata.inMint);
    const outMint = stringValue(event.metadata.outMint);
    const eventWallet = stringValue(event.metadata.walletAddress);
    if (
      !signature ||
      signature.length > 128 ||
      !inMint ||
      !outMint ||
      inMint === outMint ||
      !SOLANA_ADDRESS_PATTERN.test(inMint) ||
      !SOLANA_ADDRESS_PATTERN.test(outMint) ||
      (eventWallet && eventWallet !== walletAddress) ||
      candidateSignatures.has(signature) ||
      existingFills.has(signature)
    ) {
      continue;
    }
    candidateSignatures.add(signature);
    candidates.push(event);
    if (candidates.length >= DEFAULT_TRADING_BOT_PNL_RECONCILE_MAX_FILLS) {
      break;
    }
  }

  const reconciled = await Promise.all(
    candidates.map(async (event) => {
      const signature = stringValue(event.metadata.signature);
      const inMint = stringValue(event.metadata.inMint);
      const outMint = stringValue(event.metadata.outMint);
      if (!signature || !inMint || !outMint) return undefined;

      try {
        const transaction = await fetchSolanaParsedTransaction(env, signature);
        if (!transaction) return undefined;
        const fill = deriveTradingBotConfirmedSwapFill({
          sourceEventId: event.eventId,
          signature,
          walletAddress,
          inMint,
          outMint,
          transaction,
        });
        if (!fill) return undefined;

        const eventId = await tradingBotLifecycleEventId(
          "swap-fill-v1",
          signature,
        );
        const metadata: Record<string, unknown> = {
          accountingVersion: 1,
          fillSource: "solana_confirmed_balances",
          ...fill,
        };
        return (
          (await recordTradingBotAccountEvent(env, telegramUserId, {
            eventId,
            eventType: "swap_fill_reconciled",
            metadata,
          })) ?? {
            telegramUserId,
            eventId,
            eventType: "swap_fill_reconciled",
            metadata,
            createdAt: fill.reconciledAt,
          }
        );
      } catch {
        return undefined;
      }
    }),
  );
  const reconciledEvents = reconciled.filter(
    (event): event is TradingBotAccountEventSnapshot => Boolean(event),
  );
  const merged = new Map(events.map((event) => [event.eventId, event]));
  for (const event of reconciledEvents) merged.set(event.eventId, event);

  return {
    events: Array.from(merged.values()).sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    ),
    attemptedThisRequest: candidates.length,
    reconciledThisRequest: reconciledEvents.length,
  };
}

function deriveTradingBotConfirmedSwapFill(input: {
  sourceEventId: string;
  signature: string;
  walletAddress: string;
  inMint: string;
  outMint: string;
  transaction: ParsedTransactionRpcResult;
}): TradingBotConfirmedSwapFill | null {
  const { transaction, walletAddress, inMint, outMint } = input;
  const meta = transaction.meta;
  if (!meta || meta.err !== null) return null;

  const accountKeys = transaction.transaction?.message?.accountKeys ?? [];
  const walletIndex = accountKeys.findIndex(
    (key) => parsedTransactionAccountKey(key) === walletAddress,
  );
  if (walletIndex < 0) return null;

  const tokenAccounts = walletTokenAccountsForTransaction(
    meta.preTokenBalances ?? [],
    meta.postTokenBalances ?? [],
    walletAddress,
  );
  if (!tokenAccounts) return null;
  const tokenDeltas = walletTokenDeltasForTransaction(
    meta.preTokenBalances ?? [],
    meta.postTokenBalances ?? [],
    tokenAccounts,
  );
  if (!tokenDeltas) return null;

  const lamportIndices = new Set([walletIndex, ...tokenAccounts.keys()]);
  // Including wallet-owned token accounts cancels ATA rent and close refunds.
  let nativeDeltaLamports = 0n;
  for (const index of lamportIndices) {
    const pre = lamportsAt(meta.preBalances, index);
    const post = lamportsAt(meta.postBalances, index);
    if (pre === null || post === null) return null;
    nativeDeltaLamports += post - pre;
  }

  const networkFeeLamports = nonNegativeSafeIntegerBigInt(meta.fee);
  if (networkFeeLamports === null) return null;
  const walletPaidNetworkFee = walletIndex === 0;
  if (walletPaidNetworkFee) nativeDeltaLamports += networkFeeLamports;

  const allowedMints = new Set([inMint, outMint, WRAPPED_SOL_MINT]);
  if (tokenDeltas.some((token) => !allowedMints.has(token.mint))) {
    return null;
  }
  if (
    inMint !== WRAPPED_SOL_MINT &&
    outMint !== WRAPPED_SOL_MINT &&
    nativeDeltaLamports !== 0n
  ) {
    return null;
  }

  const inputToken = tokenDeltas.find((token) => token.mint === inMint);
  const outputToken = tokenDeltas.find((token) => token.mint === outMint);
  const amountIn =
    inMint === WRAPPED_SOL_MINT
      ? nativeDeltaLamports < 0n
        ? -nativeDeltaLamports
        : null
      : inputToken && inputToken.delta < 0n
        ? -inputToken.delta
        : null;
  const amountOut =
    outMint === WRAPPED_SOL_MINT
      ? nativeDeltaLamports > 0n
        ? nativeDeltaLamports
        : null
      : outputToken && outputToken.delta > 0n
        ? outputToken.delta
        : null;
  if (
    amountIn === null ||
    amountOut === null ||
    amountIn <= 0n ||
    amountOut <= 0n
  ) {
    return null;
  }

  return {
    amountSemantics: "wallet_asset_delta_excluding_network_fee",
    sourceEventId: input.sourceEventId,
    signature: input.signature,
    walletAddress,
    inMint,
    outMint,
    amountIn: amountIn.toString(),
    amountOut: amountOut.toString(),
    inputDecimals:
      inMint === WRAPPED_SOL_MINT ? 9 : (inputToken?.decimals ?? 0),
    outputDecimals:
      outMint === WRAPPED_SOL_MINT ? 9 : (outputToken?.decimals ?? 0),
    nativeDeltaLamports: nativeDeltaLamports.toString(),
    networkFeeLamports: networkFeeLamports.toString(),
    walletPaidNetworkFee,
    ...(nonNegativeSafeInteger(transaction.slot) !== null
      ? { slot: transaction.slot }
      : {}),
    ...(nonNegativeSafeInteger(transaction.blockTime) !== null
      ? { blockTime: transaction.blockTime ?? undefined }
      : {}),
    reconciledAt: new Date().toISOString(),
  };
}

function walletTokenAccountsForTransaction(
  preBalances: ParsedTransactionTokenBalance[],
  postBalances: ParsedTransactionTokenBalance[],
  walletAddress: string,
): Map<number, { mint: string; decimals: number }> | null {
  const accounts = new Map<number, { mint: string; decimals: number }>();
  for (const balance of [...preBalances, ...postBalances]) {
    if (balance.owner !== walletAddress) continue;
    const accountIndex = nonNegativeSafeInteger(balance.accountIndex);
    const mint = stringValue(balance.mint);
    const decimals = nonNegativeSafeInteger(balance.uiTokenAmount?.decimals);
    const amount = integerBigIntValue(balance.uiTokenAmount?.amount);
    if (
      accountIndex === null ||
      !mint ||
      !SOLANA_ADDRESS_PATTERN.test(mint) ||
      decimals === null ||
      decimals > 18 ||
      amount === undefined
    ) {
      return null;
    }
    const existing = accounts.get(accountIndex);
    if (
      existing &&
      (existing.mint !== mint || existing.decimals !== decimals)
    ) {
      return null;
    }
    accounts.set(accountIndex, { mint, decimals });
  }
  return accounts;
}

function walletTokenDeltasForTransaction(
  preBalances: ParsedTransactionTokenBalance[],
  postBalances: ParsedTransactionTokenBalance[],
  accounts: Map<number, { mint: string; decimals: number }>,
): Array<{
  mint: string;
  decimals: number;
  preAmount: bigint;
  postAmount: bigint;
  delta: bigint;
}> | null {
  const byMint = new Map<
    string,
    { decimals: number; preAmount: bigint; postAmount: bigint }
  >();
  for (const [accountIndex, account] of accounts) {
    const preAmount = transactionTokenAmountAt(
      preBalances,
      accountIndex,
      account,
    );
    const postAmount = transactionTokenAmountAt(
      postBalances,
      accountIndex,
      account,
    );
    if (preAmount === null || postAmount === null) return null;
    const current = byMint.get(account.mint) ?? {
      decimals: account.decimals,
      preAmount: 0n,
      postAmount: 0n,
    };
    if (current.decimals !== account.decimals) return null;
    current.preAmount += preAmount;
    current.postAmount += postAmount;
    byMint.set(account.mint, current);
  }
  return Array.from(byMint, ([mint, balance]) => ({
    mint,
    decimals: balance.decimals,
    preAmount: balance.preAmount,
    postAmount: balance.postAmount,
    delta: balance.postAmount - balance.preAmount,
  })).filter((token) => token.delta !== 0n);
}

function transactionTokenAmountAt(
  balances: ParsedTransactionTokenBalance[],
  accountIndex: number,
  account: { mint: string; decimals: number },
): bigint | null {
  const balance = balances.find((entry) => entry.accountIndex === accountIndex);
  if (!balance) return 0n;
  if (
    balance.mint !== account.mint ||
    balance.uiTokenAmount?.decimals !== account.decimals
  ) {
    return null;
  }
  return integerBigIntValue(balance.uiTokenAmount?.amount) ?? null;
}

function deriveTradingBotCopyTradeIntent(
  config: TradingBotStoredAdvancedAutomationConfigSnapshot,
  transaction: ParsedTransactionRpcResult,
  targetSignature: string,
): { intent: TradingBotCopyTradeIntent } | { error: string } {
  if (!config.targetWallet) {
    return { error: "Copytrade target wallet is invalid" };
  }
  if (!/^[1-9]\d*$/.test(config.maxBuyAmountIn)) {
    return { error: "Copytrade max buy amount is invalid" };
  }

  const accountKeys = transaction.transaction?.message?.accountKeys ?? [];
  const targetAccountIndex = accountKeys.findIndex(
    (key) => parsedTransactionAccountKey(key) === config.targetWallet,
  );
  if (targetAccountIndex < 0) {
    return { error: "Copytrade target wallet is absent from the transaction" };
  }
  const pumpFunExclusionError = copyTradePumpFunExclusionError(
    config.excludePumpFunTokens === true,
    transaction,
  );
  if (pumpFunExclusionError) return { error: pumpFunExclusionError };

  const meta = transaction.meta;
  const preSol = lamportsAt(meta?.preBalances, targetAccountIndex);
  const postSol = lamportsAt(meta?.postBalances, targetAccountIndex);
  if (preSol === null || postSol === null) {
    return { error: "Copytrade target SOL balance delta is unavailable" };
  }
  const solDelta = postSol - preSol;
  const tokenDeltas = targetTokenDeltas(
    meta?.preTokenBalances ?? [],
    meta?.postTokenBalances ?? [],
    config.targetWallet,
  );
  const positiveTokenDeltas = tokenDeltas.filter((token) => token.delta > 0n);
  const negativeTokenDeltas = tokenDeltas.filter((token) => token.delta < 0n);

  if (
    solDelta < 0n &&
    positiveTokenDeltas.length === 1 &&
    negativeTokenDeltas.length === 0
  ) {
    const targetAmountIn = -solDelta;
    if (
      config.minTargetBuyAmountIn &&
      targetAmountIn < BigInt(config.minTargetBuyAmountIn)
    ) {
      return { error: "Copytrade target buy is below the configured minimum" };
    }
    const copiedAmountIn =
      config.buyMode === "fixed"
        ? BigInt(config.maxBuyAmountIn)
        : minBigInt(
            (targetAmountIn * BigInt(config.buyPercentageBps ?? 10_000)) /
              10_000n,
            BigInt(config.maxBuyAmountIn),
          );
    if (copiedAmountIn <= 0n) {
      return { error: "Copytrade buy amount is zero" };
    }
    const token = positiveTokenDeltas[0];
    if (config.blacklistMints?.includes(token.mint)) {
      return { error: "Copytrade token is blacklisted" };
    }
    return {
      intent: {
        side: "buy",
        mint: token.mint,
        targetSignature,
        targetSolDeltaLamports: solDelta.toString(),
        targetTokenDelta: token.delta.toString(),
        amountIn: copiedAmountIn.toString(),
      },
    };
  }

  if (
    solDelta > 0n &&
    negativeTokenDeltas.length === 1 &&
    positiveTokenDeltas.length === 0
  ) {
    if (!config.copySells) {
      return { error: "Copy-sell execution is disabled for this config" };
    }
    const token = negativeTokenDeltas[0];
    if (config.blacklistMints?.includes(token.mint)) {
      return { error: "Copytrade token is blacklisted" };
    }
    if (token.preAmount <= 0n) {
      return { error: "Copytrade target sell percentage is unavailable" };
    }
    const soldAmount = -token.delta;
    const rawSellBps = (soldAmount * 10_000n) / token.preAmount;
    const sellBps = Number(
      minBigInt(10_000n, rawSellBps > 0n ? rawSellBps : 1n),
    );
    return {
      intent: {
        side: "sell",
        mint: token.mint,
        targetSignature,
        targetSolDeltaLamports: solDelta.toString(),
        targetTokenDelta: token.delta.toString(),
        sellBps,
      },
    };
  }

  return {
    error: "Copytrade transaction is not a simple SOL/token buy or sell",
  };
}

export function isPumpFunBondingCurveTransaction(transaction: {
  transaction?: {
    message?: {
      accountKeys?: Array<string | { pubkey?: string }>;
    };
  };
}): boolean {
  return (transaction.transaction?.message?.accountKeys ?? []).some(
    (key) =>
      parsedTransactionAccountKey(key) === PUMP_FUN_BONDING_CURVE_PROGRAM_ID,
  );
}

export function copyTradePumpFunExclusionError(
  excludePumpFunTokens: boolean,
  transaction: {
    transaction?: {
      message?: {
        accountKeys?: Array<string | { pubkey?: string }>;
      };
    };
  },
): string | undefined {
  return excludePumpFunTokens && isPumpFunBondingCurveTransaction(transaction)
    ? "Copytrade excludes PumpFun bonding-curve transactions"
    : undefined;
}

function buildTradingBotPnlReport(input: {
  account: TradingBotAccountSnapshot;
  events: TradingBotAccountEventSnapshot[];
  positions: TradingBotPositionsSnapshot;
  prices: Record<string, JupiterPriceEntry>;
  fillReconciliation: TradingBotFillReconciliation;
}) {
  const { account, events, positions, prices, fillReconciliation } = input;
  const solPrice = prices[WRAPPED_SOL_MINT]?.usdPrice;
  const swapHistory = summarizeSwapHistory(events, positions.walletAddress);
  const historyByMint = swapHistory.byMint;
  const tokenReports = positions.tokens.map((token) => {
    const price = prices[token.mint];
    const decimals = price?.decimals ?? token.decimals;
    const uiAmount = rawAmountToNumber(token.amount, decimals);
    const currentValueUsd =
      typeof price?.usdPrice === "number" ? uiAmount * price.usdPrice : null;
    const history = historyByMint.get(token.mint);
    const netSolCost =
      history && history.missingAmountCount === 0
        ? rawAmountToNumber(
            String(
              history.solSpentLamports > history.solReceivedLamports
                ? history.solSpentLamports - history.solReceivedLamports
                : 0n,
            ),
            9,
          )
        : null;
    const estimatedCostUsd =
      netSolCost !== null && typeof solPrice === "number"
        ? netSolCost * solPrice
        : null;
    const unrealizedPnlUsd =
      currentValueUsd !== null && estimatedCostUsd !== null
        ? currentValueUsd - estimatedCostUsd
        : null;
    const unrealizedPnlPct =
      unrealizedPnlUsd !== null && estimatedCostUsd && estimatedCostUsd > 0
        ? (unrealizedPnlUsd / estimatedCostUsd) * 100
        : null;

    return {
      mint: token.mint,
      tokenAccount: token.tokenAccount,
      amount: token.amount,
      decimals,
      uiAmount,
      uiAmountString: token.uiAmountString,
      hidden: account.hiddenTokens.includes(token.mint),
      usdPrice: price?.usdPrice ?? null,
      priceChange24h: price?.priceChange24h ?? null,
      currentValueUsd,
      estimatedCostUsd,
      unrealizedPnlUsd,
      unrealizedPnlPct,
      buyCount: history?.buyCount ?? 0,
      sellCount: history?.sellCount ?? 0,
      estimatedSolSpent: history
        ? rawAmountToNumber(String(history.solSpentLamports), 9)
        : null,
      estimatedSolReceived: history
        ? rawAmountToNumber(String(history.solReceivedLamports), 9)
        : null,
      confirmedFillCount: history?.confirmedFillCount ?? 0,
      estimatedFillCount: history?.estimatedFillCount ?? 0,
      costBasisStatus: !price
        ? "price_unavailable"
        : history
          ? history.missingAmountCount > 0
            ? "missing_execution_amounts"
            : history.confirmedFillCount > 0 && history.estimatedFillCount === 0
              ? "confirmed_net_flow"
              : history.confirmedFillCount > 0
                ? "mixed_net_flow"
                : "estimated"
          : "missing_execution_history",
    };
  });

  const currentTokenValueUsd = sumNullable(
    tokenReports.map((token) => token.currentValueUsd),
  );
  const estimatedCostUsd = sumNullable(
    tokenReports.map((token) => token.estimatedCostUsd),
  );
  const unrealizedPnlUsd =
    currentTokenValueUsd !== null && estimatedCostUsd !== null
      ? currentTokenValueUsd - estimatedCostUsd
      : null;
  const solValueUsd =
    typeof solPrice === "number" ? positions.sol.uiAmount * solPrice : null;
  const executionEvents = events.filter((event) =>
    ["swap_executed", "withdrawal_executed"].includes(event.eventType),
  );
  const recentExecutions = executionEvents.slice(0, 8).map((event) => {
    const fill = confirmedFillForSwapEvent(event, swapHistory.confirmedFills);
    return {
      eventType: event.eventType,
      createdAt: event.createdAt,
      signature: stringValue(event.metadata.signature) ?? null,
      mint:
        stringValue(event.metadata.mint) ??
        stringValue(event.metadata.outMint) ??
        stringValue(event.metadata.inMint) ??
        null,
      side: eventSide(event),
      solscanUrl: stringValue(event.metadata.solscanUrl) ?? null,
      fillStatus:
        event.eventType === "swap_executed"
          ? fill
            ? "confirmed"
            : "estimated"
          : "not_applicable",
      amountIn: fill?.amountIn ?? stringValue(event.metadata.amountIn) ?? null,
      amountOut:
        fill?.amountOut ??
        stringValue(event.metadata.estimatedAmountOut) ??
        null,
      inputDecimals: fill?.inputDecimals ?? null,
      outputDecimals: fill?.outputDecimals ?? null,
      networkFeeLamports: fill?.networkFeeLamports ?? null,
    };
  });

  return {
    status: "ready",
    walletAddress: positions.walletAddress,
    generatedAt: new Date().toISOString(),
    pricing: {
      source: "jupiter-price-v3",
      pricedMints: Object.keys(prices).length,
      solUsdPrice: solPrice ?? null,
    },
    executionAccounting: {
      source: "solana-confirmed-balances-with-event-fallback",
      amountSemantics: "wallet_asset_delta_excluding_network_fee",
      totalSwapExecutions: swapHistory.totalSwapExecutions,
      confirmedFillCount: swapHistory.confirmedFillCount,
      estimatedFillCount: swapHistory.estimatedFillCount,
      confirmedFillRatePct:
        swapHistory.totalSwapExecutions > 0
          ? (swapHistory.confirmedFillCount / swapHistory.totalSwapExecutions) *
            100
          : null,
      attemptedThisRequest: fillReconciliation.attemptedThisRequest,
      reconciledThisRequest: fillReconciliation.reconciledThisRequest,
      costBasisMethod: "net_sol_flow_at_current_sol_price",
      taxLotAccounting: false,
    },
    totals: {
      solUiAmount: positions.sol.uiAmount,
      solValueUsd,
      currentTokenValueUsd,
      currentPortfolioValueUsd:
        currentTokenValueUsd !== null && solValueUsd !== null
          ? currentTokenValueUsd + solValueUsd
          : null,
      estimatedCostUsd,
      unrealizedPnlUsd,
      unrealizedPnlPct:
        unrealizedPnlUsd !== null && estimatedCostUsd && estimatedCostUsd > 0
          ? (unrealizedPnlUsd / estimatedCostUsd) * 100
          : null,
      pricedPositionCount: tokenReports.filter(
        (token) => token.currentValueUsd !== null,
      ).length,
      unpricedPositionCount: tokenReports.filter(
        (token) => token.currentValueUsd === null,
      ).length,
      executionEventCount: executionEvents.length,
      confirmedFillCount: swapHistory.confirmedFillCount,
      estimatedFillCount: swapHistory.estimatedFillCount,
    },
    tokens: tokenReports.sort(
      (a, b) => (b.currentValueUsd ?? 0) - (a.currentValueUsd ?? 0),
    ),
    recentExecutions,
    warnings: pnlWarnings(tokenReports, events, swapHistory),
  };
}

function buildTradingBotTokenCleanupReview(input: {
  positions: TradingBotPositionsSnapshot;
  prices: Record<string, JupiterPriceEntry>;
  hiddenTokens: string[];
  dustUsdThreshold: number;
}) {
  const { positions, prices, hiddenTokens, dustUsdThreshold } = input;
  const hiddenTokenSet = new Set(hiddenTokens);
  const tokenReports = positions.tokens.map((token) => {
    const price = prices[token.mint];
    const decimals = price?.decimals ?? token.decimals;
    const uiAmount = rawAmountToNumber(token.amount, decimals);
    const currentValueUsd =
      typeof price?.usdPrice === "number" ? uiAmount * price.usdPrice : null;
    const hidden = hiddenTokenSet.has(token.mint);
    const reason = tokenCleanupReason({
      amount: token.amount,
      uiAmount,
      currentValueUsd,
      hidden,
      dustUsdThreshold,
    });
    const suggestedActions: TokenCleanupAction[] = [];
    if (!hidden) suggestedActions.push("hide");
    if (token.amount !== "0") suggestedActions.push("sell");

    return {
      mint: token.mint,
      tokenAccount: token.tokenAccount,
      amount: token.amount,
      decimals,
      uiAmount,
      uiAmountString: token.uiAmountString,
      hidden,
      usdPrice: price?.usdPrice ?? null,
      priceChange24h: price?.priceChange24h ?? null,
      currentValueUsd,
      cleanupReason: reason,
      suggestedActions,
    };
  });
  const candidates = tokenReports
    .filter(
      (token): typeof token & { cleanupReason: TokenCleanupReason } =>
        token.cleanupReason !== null,
    )
    .sort(
      (a, b) =>
        cleanupReasonRank(a.cleanupReason) -
          cleanupReasonRank(b.cleanupReason) ||
        (a.currentValueUsd ?? Number.MAX_SAFE_INTEGER) -
          (b.currentValueUsd ?? Number.MAX_SAFE_INTEGER) ||
        a.mint.localeCompare(b.mint),
    )
    .slice(0, TOKEN_CLEANUP_MAX_CANDIDATES);

  const pricedTokens = tokenReports.filter(
    (token) => token.currentValueUsd !== null,
  ).length;
  const hiddenPositions = tokenReports.filter((token) => token.hidden).length;
  const dustValueUsd = sumNullable(
    candidates
      .filter((token) => token.cleanupReason === "dust")
      .map((token) => token.currentValueUsd),
  );

  return {
    status: "ready",
    walletAddress: positions.walletAddress,
    generatedAt: new Date().toISOString(),
    pricing: {
      source: "jupiter-price-v3",
      pricedMints: Object.keys(prices).length,
    },
    summary: {
      totalTokens: positions.tokens.length,
      cleanupCandidates: candidates.length,
      hiddenPositions,
      pricedTokens,
      unpricedTokens: tokenReports.length - pricedTokens,
      dustUsdThreshold,
      dustValueUsd,
    },
    candidates,
    warnings: [
      "Review only: no token preferences changed and no sell transaction was built.",
      "Use a Ribbot cleanup action to hide a token or stage a separate confirmed sell ticket through FTX/FrogX.",
    ],
  };
}

function tokenCleanupReason(input: {
  amount: string;
  uiAmount: number;
  currentValueUsd: number | null;
  hidden: boolean;
  dustUsdThreshold: number;
}): TokenCleanupReason | null {
  if (input.amount === "0" || input.uiAmount <= 0) return "zero";
  if (input.hidden) return "hidden";
  if (input.currentValueUsd === null) return "unpriced";
  if (input.currentValueUsd < input.dustUsdThreshold) return "dust";
  return null;
}

function cleanupReasonRank(reason: TokenCleanupReason): number {
  switch (reason) {
    case "zero":
      return 0;
    case "dust":
      return 1;
    case "unpriced":
      return 2;
    case "hidden":
      return 3;
  }
}

type TradingBotMintSwapHistory = {
  buyCount: number;
  sellCount: number;
  solSpentLamports: bigint;
  solReceivedLamports: bigint;
  confirmedFillCount: number;
  estimatedFillCount: number;
  missingAmountCount: number;
};

function confirmedSwapFillsBySignature(
  events: TradingBotAccountEventSnapshot[],
  walletAddress: string,
): Map<string, TradingBotConfirmedSwapFill> {
  const fills = new Map<string, TradingBotConfirmedSwapFill>();
  for (const event of events) {
    const fill = confirmedSwapFillFromEvent(event, walletAddress);
    if (fill && !fills.has(fill.signature)) fills.set(fill.signature, fill);
  }
  return fills;
}

function confirmedSwapFillFromEvent(
  event: TradingBotAccountEventSnapshot,
  walletAddress: string,
): TradingBotConfirmedSwapFill | null {
  if (
    event.eventType !== "swap_fill_reconciled" ||
    event.metadata.fillSource !== "solana_confirmed_balances" ||
    event.metadata.amountSemantics !==
      "wallet_asset_delta_excluding_network_fee" ||
    numberValue(event.metadata.accountingVersion) !== 1
  ) {
    return null;
  }
  const sourceEventId = stringValue(event.metadata.sourceEventId);
  const signature = stringValue(event.metadata.signature);
  const storedWallet = stringValue(event.metadata.walletAddress);
  const inMint = stringValue(event.metadata.inMint);
  const outMint = stringValue(event.metadata.outMint);
  const amountIn = integerBigIntValue(event.metadata.amountIn);
  const amountOut = integerBigIntValue(event.metadata.amountOut);
  const inputDecimals = nonNegativeSafeInteger(event.metadata.inputDecimals);
  const outputDecimals = nonNegativeSafeInteger(event.metadata.outputDecimals);
  const nativeDeltaLamports = signedIntegerBigIntValue(
    event.metadata.nativeDeltaLamports,
  );
  const networkFeeLamports = integerBigIntValue(
    event.metadata.networkFeeLamports,
  );
  const walletPaidNetworkFee = event.metadata.walletPaidNetworkFee;
  const slot = nonNegativeSafeInteger(event.metadata.slot);
  const blockTime = nonNegativeSafeInteger(event.metadata.blockTime);
  const reconciledAt = stringValue(event.metadata.reconciledAt);
  if (
    !sourceEventId ||
    !signature ||
    signature.length > 128 ||
    storedWallet !== walletAddress ||
    !inMint ||
    !outMint ||
    inMint === outMint ||
    !SOLANA_ADDRESS_PATTERN.test(inMint) ||
    !SOLANA_ADDRESS_PATTERN.test(outMint) ||
    amountIn === undefined ||
    amountIn <= 0n ||
    amountOut === undefined ||
    amountOut <= 0n ||
    inputDecimals === null ||
    inputDecimals > 18 ||
    outputDecimals === null ||
    outputDecimals > 18 ||
    nativeDeltaLamports === undefined ||
    networkFeeLamports === undefined ||
    typeof walletPaidNetworkFee !== "boolean" ||
    !reconciledAt
  ) {
    return null;
  }
  return {
    amountSemantics: "wallet_asset_delta_excluding_network_fee",
    sourceEventId,
    signature,
    walletAddress,
    inMint,
    outMint,
    amountIn: amountIn.toString(),
    amountOut: amountOut.toString(),
    inputDecimals,
    outputDecimals,
    nativeDeltaLamports: nativeDeltaLamports.toString(),
    networkFeeLamports: networkFeeLamports.toString(),
    walletPaidNetworkFee,
    ...(slot !== null ? { slot } : {}),
    ...(blockTime !== null ? { blockTime } : {}),
    reconciledAt,
  };
}

function confirmedFillForSwapEvent(
  event: TradingBotAccountEventSnapshot,
  fills: Map<string, TradingBotConfirmedSwapFill>,
): TradingBotConfirmedSwapFill | undefined {
  if (event.eventType !== "swap_executed") return undefined;
  const signature = stringValue(event.metadata.signature);
  if (!signature) return undefined;
  const fill = fills.get(signature);
  if (
    !fill ||
    fill.sourceEventId !== event.eventId ||
    fill.inMint !== stringValue(event.metadata.inMint) ||
    fill.outMint !== stringValue(event.metadata.outMint)
  ) {
    return undefined;
  }
  const eventWallet = stringValue(event.metadata.walletAddress);
  return eventWallet && eventWallet !== fill.walletAddress ? undefined : fill;
}

function summarizeSwapHistory(
  events: TradingBotAccountEventSnapshot[],
  walletAddress: string,
) {
  const byMint = new Map<string, TradingBotMintSwapHistory>();
  const confirmedFills = confirmedSwapFillsBySignature(events, walletAddress);
  let totalSwapExecutions = 0;
  let confirmedFillCount = 0;
  let estimatedFillCount = 0;

  for (const event of events) {
    if (event.eventType !== "swap_executed") continue;
    totalSwapExecutions += 1;
    const fill = confirmedFillForSwapEvent(event, confirmedFills);
    if (fill) confirmedFillCount += 1;
    else estimatedFillCount += 1;
    const inMint = stringValue(event.metadata.inMint);
    const outMint = stringValue(event.metadata.outMint);
    if (!inMint || !outMint) continue;
    const amountIn = fill
      ? BigInt(fill.amountIn)
      : integerBigIntValue(event.metadata.amountIn);
    const amountOut = fill
      ? BigInt(fill.amountOut)
      : integerBigIntValue(event.metadata.estimatedAmountOut);

    if (inMint === WRAPPED_SOL_MINT && outMint !== WRAPPED_SOL_MINT) {
      const current = swapHistoryForMint(byMint, outMint);
      current.buyCount += 1;
      if (fill) current.confirmedFillCount += 1;
      else current.estimatedFillCount += 1;
      if (amountIn === undefined) current.missingAmountCount += 1;
      else current.solSpentLamports += amountIn;
      continue;
    }
    if (outMint === WRAPPED_SOL_MINT && inMint !== WRAPPED_SOL_MINT) {
      const current = swapHistoryForMint(byMint, inMint);
      current.sellCount += 1;
      if (fill) current.confirmedFillCount += 1;
      else current.estimatedFillCount += 1;
      if (amountOut === undefined) current.missingAmountCount += 1;
      else current.solReceivedLamports += amountOut;
    }
  }

  return {
    byMint,
    confirmedFills,
    totalSwapExecutions,
    confirmedFillCount,
    estimatedFillCount,
  };
}

function swapHistoryForMint(
  byMint: Map<string, TradingBotMintSwapHistory>,
  mint: string,
) {
  const existing = byMint.get(mint);
  if (existing) return existing;
  const created = {
    buyCount: 0,
    sellCount: 0,
    solSpentLamports: 0n,
    solReceivedLamports: 0n,
    confirmedFillCount: 0,
    estimatedFillCount: 0,
    missingAmountCount: 0,
  };
  byMint.set(mint, created);
  return created;
}

function pnlWarnings(
  tokens: Array<{ costBasisStatus: string }>,
  events: TradingBotAccountEventSnapshot[],
  swapHistory: ReturnType<typeof summarizeSwapHistory>,
): string[] {
  const warnings: string[] = [];
  if (swapHistory.totalSwapExecutions === 0) {
    warnings.push("No FTX swap execution history is available yet.");
  } else if (swapHistory.estimatedFillCount > 0) {
    warnings.push(
      `${swapHistory.confirmedFillCount} of ${swapHistory.totalSwapExecutions} FTX swap fills are confirmed from Solana balances; ${swapHistory.estimatedFillCount} still use execution metadata.`,
    );
  } else {
    warnings.push(
      `All ${swapHistory.confirmedFillCount} FTX swap fills in this report are confirmed from Solana balances.`,
    );
  }
  warnings.push(
    "USD cost and PNL remain estimates based on net SOL flow at the current SOL price; realized/FIFO tax-lot accounting is not implemented.",
  );
  if (tokens.some((token) => token.costBasisStatus === "price_unavailable")) {
    warnings.push("Some token prices are unavailable from Jupiter Price V3.");
  }
  if (
    tokens.some(
      (token) => token.costBasisStatus === "missing_execution_history",
    )
  ) {
    warnings.push(
      "Some positions do not have FTX execution history for cost basis.",
    );
  }
  if (
    tokens.some(
      (token) => token.costBasisStatus === "missing_execution_amounts",
    )
  ) {
    warnings.push(
      "Some FTX executions do not yet have a confirmed fill or a complete execution-time amount.",
    );
  }
  if (events.some((event) => event.eventType === "swap_fill_reconciled")) {
    warnings.push(
      "Confirmed fill indexing is read-only and never signs, broadcasts, or resends a transaction.",
    );
  }
  return warnings;
}

function eventSide(event: TradingBotAccountEventSnapshot): string {
  if (event.eventType === "withdrawal_executed") return "withdrawal";
  const inMint = stringValue(event.metadata.inMint);
  const outMint = stringValue(event.metadata.outMint);
  if (inMint === WRAPPED_SOL_MINT) return "buy";
  if (outMint === WRAPPED_SOL_MINT) return "sell";
  return "swap";
}

function rawAmountToNumber(amount: string, decimals: number): number {
  if (!/^\d+$/.test(amount)) return 0;
  return Number(amount) / 10 ** decimals;
}

function parsedTransactionAccountKey(
  key: string | { pubkey?: string },
): string | undefined {
  return typeof key === "string" ? key : stringValue(key.pubkey);
}

function lamportsAt(
  values: number[] | undefined,
  index: number,
): bigint | null {
  const value = values?.[index];
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    !Number.isSafeInteger(value)
  ) {
    return null;
  }
  return BigInt(value);
}

function targetTokenDeltas(
  preBalances: ParsedTransactionTokenBalance[],
  postBalances: ParsedTransactionTokenBalance[],
  targetWallet: string,
): Array<{
  mint: string;
  preAmount: bigint;
  postAmount: bigint;
  delta: bigint;
}> {
  const pre = targetTokenBalanceByMint(preBalances, targetWallet);
  const post = targetTokenBalanceByMint(postBalances, targetWallet);
  const mints = new Set([...pre.keys(), ...post.keys()]);
  return Array.from(mints)
    .map((mint) => {
      const preAmount = pre.get(mint) ?? 0n;
      const postAmount = post.get(mint) ?? 0n;
      return {
        mint,
        preAmount,
        postAmount,
        delta: postAmount - preAmount,
      };
    })
    .filter((token) => token.delta !== 0n);
}

function targetTokenBalanceByMint(
  balances: ParsedTransactionTokenBalance[],
  targetWallet: string,
): Map<string, bigint> {
  const byMint = new Map<string, bigint>();
  for (const balance of balances) {
    if (balance.owner !== targetWallet) continue;
    const mint = stringValue(balance.mint);
    if (
      !mint ||
      !SOLANA_ADDRESS_PATTERN.test(mint) ||
      mint === WRAPPED_SOL_MINT
    ) {
      continue;
    }
    const amount = integerBigIntValue(balance.uiTokenAmount?.amount);
    if (amount === undefined) continue;
    byMint.set(mint, (byMint.get(mint) ?? 0n) + amount);
  }
  return byMint;
}

function minBigInt(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

function sumNullable(values: Array<number | null>): number | null {
  const available = values.filter((value): value is number => value !== null);
  if (available.length === 0) return null;
  return available.reduce((sum, value) => sum + value, 0);
}

function integerBigIntValue(value: unknown): bigint | undefined {
  const raw = stringValue(value);
  return raw && /^\d+$/.test(raw) ? BigInt(raw) : undefined;
}

function signedIntegerBigIntValue(value: unknown): bigint | undefined {
  const raw = stringValue(value);
  return raw && /^-?\d+$/.test(raw) ? BigInt(raw) : undefined;
}

function nonNegativeSafeInteger(value: unknown): number | null {
  const numeric = numberValue(value);
  return numeric !== undefined && Number.isSafeInteger(numeric) && numeric >= 0
    ? numeric
    : null;
}

function nonNegativeSafeIntegerBigInt(value: unknown): bigint | null {
  const numeric = nonNegativeSafeInteger(value);
  return numeric === null ? null : BigInt(numeric);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function generateReferralCode(): string {
  const bytes = new Uint8Array(REFERRAL_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(
    bytes,
    (byte) => REFERRAL_CODE_ALPHABET[byte % REFERRAL_CODE_ALPHABET.length],
  ).join("");
}

function referralWarnings(): string[] {
  return [
    "Referral tracking is non-secret account metadata stored by FTX/FrogX.",
    "Rewards are tracking-only in this milestone; no fee share, token payout, claimable balance, signing, or transfer is created.",
  ];
}

function tradingBotActivitySummary(
  events: TradingBotAccountEventSnapshot[],
): TradingBotActivitySummary {
  const eventTypes: Record<string, number> = {};
  for (const event of events) {
    eventTypes[event.eventType] = (eventTypes[event.eventType] ?? 0) + 1;
  }

  return {
    totalEvents: events.length,
    ...(events[0] ? { latestEventAt: events[0].createdAt } : {}),
    eventTypes,
  };
}

function clampInteger(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!value || !Number.isInteger(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function resolvePrivyConfig(env: Env): PrivyConfig | null {
  const appId = env.PRIVY_APP_ID?.trim();
  const appSecret = env.PRIVY_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;

  return {
    appId,
    appSecret,
    apiBaseUrl:
      env.PRIVY_API_BASE_URL?.trim().replace(/\/+$/, "") ||
      DEFAULT_PRIVY_API_BASE_URL,
    authorizationKeyId:
      env.PRIVY_AUTHORIZATION_KEY_ID?.trim() ||
      env.PRIVY_SIGNER_ID?.trim() ||
      undefined,
    authorizationPrivateKey:
      env.PRIVY_AUTHORIZATION_PRIVATE_KEY?.trim() || undefined,
    walletPolicyIds: parseCsv(env.PRIVY_WALLET_POLICY_IDS),
  };
}

async function rpcRequest<T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<RpcResponse<T>> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: method,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC ${method} failed with status ${response.status}`);
  }

  const data = (await response.json()) as RpcResponse<T>;
  if (data.error) {
    throw new Error(`RPC ${method} returned an error`);
  }
  return data;
}

function resolveRpcUrl(env: Env): string {
  return (
    env.SOLANA_RPC_URL?.trim() || env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || ""
  );
}

function authorizeTradingBotOperatorRequest(
  request: Request,
  env: Env,
): "allowed" | "denied" | "missing" {
  const token = env.TRADING_BOT_OPERATOR_TOKEN?.trim();
  if (!token) return "missing";
  const authorization = request.headers.get("Authorization") ?? "";
  return authorization === `Bearer ${token}` ? "allowed" : "denied";
}

function findSolanaWallets(user: PrivyUser): PrivyLinkedAccount[] {
  return (user.linked_accounts ?? [])
    .map((account, sourceIndex) => ({ account, sourceIndex }))
    .filter(({ account }) => {
      const walletClientType =
        account.wallet_client_type ??
        account.walletClientType ??
        account.walletClient;
      return (
        account.type === "wallet" &&
        account.chain_type === "solana" &&
        (walletClientType === "privy" || walletClientType === "privy-v2") &&
        Boolean(account.id) &&
        Boolean(account.address)
      );
    })
    .sort((left, right) => {
      const leftIndex =
        left.account.wallet_index ?? left.account.walletIndex ?? null;
      const rightIndex =
        right.account.wallet_index ?? right.account.walletIndex ?? null;
      if (leftIndex === null && rightIndex === null) {
        return left.sourceIndex - right.sourceIndex;
      }
      if (leftIndex === null) return 1;
      if (rightIndex === null) return -1;
      return leftIndex - rightIndex || left.sourceIndex - right.sourceIndex;
    })
    .map(({ account }) => account);
}

function signerConfigured(config: PrivyConfig): boolean {
  return Boolean(config.authorizationKeyId && config.authorizationPrivateKey);
}

function spotNftPrivyWallet(
  account: TradingBotAccountSnapshot,
): TradingBotAccountWalletSlot | null {
  const wallet = account.wallets.find(
    (entry) =>
      entry.role === "spot_nft" && entry.walletSource === "privy",
  );
  if (wallet) return wallet;
  if (
    account.wallets.length === 0 &&
    account.walletSource === "privy" &&
    account.privyWalletId &&
    account.solanaWalletAddress
  ) {
    return {
      walletId: account.privyWalletId,
      label: SPOT_NFT_WALLET_LABEL,
      role: "spot_nft",
      walletSource: "privy",
      privyUserId: account.privyUserId,
      privyWalletId: account.privyWalletId,
      solanaWalletAddress: account.solanaWalletAddress,
      createdAt: account.createdAt,
    };
  }
  return null;
}

function encodeBasicAuth(config: PrivyConfig): string {
  return btoa(`${config.appId}:${config.appSecret}`);
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function positiveNumberValue(value: unknown): number | undefined {
  const parsed = numberValue(value);
  return parsed !== undefined && Number.isFinite(parsed) && parsed > 0
    ? parsed
    : undefined;
}

function positiveIntegerStringValue(value: unknown): string | undefined {
  const normalized = stringValue(value);
  return normalized && /^[1-9]\d*$/.test(normalized) ? normalized : undefined;
}

function copyTradeBuyModeValue(
  value: unknown,
): TradingBotCopyTradeBuyMode | undefined {
  const normalized = stringValue(value)?.toLowerCase();
  return normalized === "fixed" || normalized === "percentage"
    ? normalized
    : undefined;
}

function copyTradeTagValue(value: unknown): string | undefined {
  const normalized = stringValue(value);
  return normalized && /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,31}$/.test(normalized)
    ? normalized
    : undefined;
}

function copyTradeBlacklistMintsValue(value: unknown): {
  values?: string[];
  error?: string;
} {
  if (value === undefined) return {};
  if (!Array.isArray(value) || value.length > 20) {
    return { error: "blacklistMints must contain at most 20 token mints" };
  }
  const values: string[] = [];
  for (const entry of value) {
    const mint = stringValue(entry);
    if (
      !mint ||
      !SOLANA_ADDRESS_PATTERN.test(mint) ||
      mint === WRAPPED_SOL_MINT
    ) {
      return { error: "blacklistMints must contain SPL token mints" };
    }
    if (!values.includes(mint)) values.push(mint);
  }
  return { values };
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  const normalized = stringValue(value)?.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized ?? "")) return true;
  if (["0", "false", "no", "off"].includes(normalized ?? "")) return false;
  return undefined;
}

function orderKindValue(value: unknown): TradingBotOrderKind | undefined {
  const normalized = stringValue(value)?.toLowerCase();
  return normalized === "limit" ||
    normalized === "dca" ||
    normalized === "stop" ||
    normalized === "trailing"
    ? normalized
    : undefined;
}

function orderSideValue(value: unknown): TradingBotOrderSide | undefined {
  const normalized = stringValue(value)?.toLowerCase();
  return normalized === "buy" || normalized === "sell" ? normalized : undefined;
}

function triggerDirectionValue(value: unknown): TriggerDirection | undefined {
  const normalized = stringValue(value)?.toLowerCase();
  return normalized === "above" || normalized === "below"
    ? normalized
    : undefined;
}

function sniperSourceValue(value: unknown): TradingBotSniperSource | undefined {
  const normalized = stringValue(value)?.toLowerCase();
  return normalized === "any" ||
    normalized === "pump" ||
    normalized === "raydium" ||
    normalized === "moonshot"
    ? normalized
    : undefined;
}

function advancedAutomationKindValue(
  value: unknown,
): TradingBotAdvancedAutomationKind | undefined {
  const normalized = stringValue(value)?.toLowerCase();
  return normalized === "copytrade" ||
    normalized === "sniper" ||
    normalized === "auto_buy" ||
    normalized === "bundle_buy" ||
    normalized === "auto_sell"
    ? normalized
    : undefined;
}

function preferenceKindValue(
  value: unknown,
): TradingBotPreferenceKind | undefined {
  const normalized = stringValue(value);
  return normalized === "settings" ||
    normalized === "watchlist" ||
    normalized === "hiddenToken"
    ? normalized
    : undefined;
}

function preferenceActionValue(
  value: unknown,
): TradingBotPreferenceAction | undefined {
  const normalized = stringValue(value);
  return normalized === "set" || normalized === "add" || normalized === "remove"
    ? normalized
    : undefined;
}

function decimalStringValue(value: unknown): string | undefined {
  const raw =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : stringValue(value);
  if (!raw || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)) return undefined;
  return Number(raw) > 0 ? raw : undefined;
}

function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
