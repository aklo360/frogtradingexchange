import { verifyAsync as verifySolanaMessage } from "@noble/ed25519";
import bs58 from "bs58";
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  getAddress,
  isAddress,
  http,
  type Address,
  verifyMessage,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

import type { Env } from "./env";

const DEFAULT_COLLECTION = "J7rxtKmEpNJEtrfkagiTF1gsmLyVus6BQZFY4ouBkeMG";
const DEFAULT_DAEMON_TOKEN_ADDRESS =
  "0x43298327b0249caF5A4942C6951F5Ac6AD7297A0";
const DEFAULT_ESCROW_ADDRESS = "0xC853Fc4dE86fC8868Fa89FC3B207d4592Db19e46";
const DEFAULT_CAMPAIGN_ID = "daemon-frog-holders-2026";
const DEFAULT_MIN_FROGS = 1;
const DEFAULT_FULL_PRIZE_MIN_FROGS = 10;
const DEFAULT_POOL_UNITS = 1000;
const DEFAULT_BASE_PRIZE_UNITS = 10;
const DEFAULT_MAX_PRIZE_UNITS = 100;
const DEFAULT_DAEMON_DECIMALS = 18;
const DEFAULT_PAYOUT_BATCH_SIZE = 10;
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const MAX_TRACKED_FROGS = 1000;
const MAX_PAYOUT_BATCH_SIZE = 25;
const MAX_EVENT_METADATA_CHARS = 4000;
const TRACKED_EVENT_TYPES = new Set([
  "eligibility_checked",
  "eligibility_unavailable",
  "challenge_created",
  "claim_queued",
  "payout_failed",
  "payout_sent",
]);

type AirdropConfig = {
  enabled: boolean;
  campaignId: string;
  collectionAddress: string;
  daemonTokenAddress: string;
  escrowAddress: string;
  daemonDecimals: number;
  minFrogs: number;
  fullPrizeMinFrogs: number;
  poolUnits: number;
  minPrizeUnits: number;
  maxPrizeUnits: number;
  claimOpenAt: string | null;
  claimCloseAt: string | null;
};

type ClaimInput = {
  solAddress?: string;
  ethAddress?: string;
  nonce?: string;
  solSignature?: string;
  ethSignature?: string;
};

type ChallengeInput = {
  solAddress?: string;
  ethAddress?: string;
};

type FinalizeInput = {
  vrfSeed?: string;
  vrfTx?: string;
};

type PayoutInput = {
  dryRun?: boolean;
  maxTransfers?: number;
  waitForReceipts?: boolean;
};

type WalletEventInput = {
  eventType?: string;
  solAddress?: string | null;
  ethAddress?: string | null;
  frogCount?: number | null;
  metadata?: Record<string, unknown>;
};

type FrogHolding = {
  mint: string;
  name: string;
};

type ClaimRow = {
  campaign_id: string;
  sol_address: string;
  eth_address: string;
  sequence: number;
  frog_count: number;
  frog_mints_json: string;
  sol_signature: string;
  eth_signature: string;
  message: string;
  nonce: string;
  amount_units: number | null;
  status: string;
  created_at: string;
  finalized_at: string | null;
  payout_tx_hash: string | null;
  payout_status: string | null;
  payout_error: string | null;
  payout_attempted_at: string | null;
  paid_at: string | null;
};

type NonceRow = {
  campaign_id: string;
  nonce: string;
  sol_address: string;
  eth_address: string;
  message: string;
  expires_at: string;
  consumed_at: string | null;
};

type CampaignStateRow = {
  campaign_id: string;
  vrf_seed: string | null;
  vrf_tx: string | null;
  finalized_at: string | null;
};

type WalletEventRow = {
  campaign_id: string;
  event_id: string;
  event_type: string;
  sol_address: string | null;
  eth_address: string | null;
  frog_count: number | null;
  metadata_json: string;
  created_at: string;
};

type DasAsset = {
  id?: string;
  burnt?: boolean;
  ownership?: {
    owner?: string;
  };
  content?: {
    metadata?: {
      name?: string;
    };
  };
  compression?: {
    compressed?: boolean;
  };
  grouping?: Array<{
    group_key?: string;
    group_value?: string;
  }>;
};

type DasResponse = {
  result?: {
    items?: DasAsset[];
    page?: number;
    limit?: number;
    total?: number;
  };
  error?: {
    message?: string;
  };
};

const json = (data: unknown, init?: ResponseInit) => Response.json(data, init);

const boolFromEnv = (value: string | undefined, fallback = false) => {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
};

const numberFromEnv = (
  value: string | undefined,
  fallback: number,
  min = 0,
) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
};

const daemonUnitsFromEnv = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.round(parsed * 100)
    : fallback;
};

const integerFromEnv = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) => {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const unitsToDaemon = (units: number) => (units / 100).toFixed(2);

const unitsToTokenBaseUnitsBigInt = (units: number, decimals: number) => {
  const wholeUnits = BigInt(Math.floor(units / 100));
  const cents = BigInt(units % 100);
  const scale = 10n ** BigInt(decimals);
  return wholeUnits * scale + (cents * scale) / 100n;
};

const unitsToTokenBaseUnits = (units: number, decimals: number) =>
  unitsToTokenBaseUnitsBigInt(units, decimals).toString();

const parseDateMs = (value: string | null) => {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

const isClaimOpen = (config: AirdropConfig, now = Date.now()) => {
  const openAt = parseDateMs(config.claimOpenAt);
  const closeAt = parseDateMs(config.claimCloseAt);
  if (openAt !== null && now < openAt) return false;
  if (closeAt !== null && now > closeAt) return false;
  return true;
};

const sanitizeSeed = (seed: string | undefined) => {
  const trimmed = seed?.trim() ?? "";
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return `0x${trimmed.toLowerCase()}`;
  return null;
};

const sanitizeTx = (tx: string | undefined) => {
  const trimmed = tx?.trim() ?? "";
  if (!trimmed) return null;
  return trimmed.slice(0, 160);
};

const sanitizeEventType = (eventType: string | undefined) => {
  const trimmed = eventType?.trim() ?? "";
  return TRACKED_EVENT_TYPES.has(trimmed) ? trimmed : null;
};

const validateSolAddress = (address: string | undefined) => {
  const trimmed = address?.trim() ?? "";
  try {
    const decoded = bs58.decode(trimmed);
    return decoded.length === 32 ? trimmed : null;
  } catch {
    return null;
  }
};

const normalizeEthAddress = (address: string | undefined) => {
  const trimmed = address?.trim() ?? "";
  return isAddress(trimmed) ? getAddress(trimmed) : null;
};

const normalizePrivateKey = (value: string | undefined) => {
  const trimmed = value?.trim() ?? "";
  const prefixed = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  return /^0x[0-9a-fA-F]{64}$/.test(prefixed)
    ? (prefixed as Hex)
    : null;
};

const ethAddressFromEnv = (value: string | undefined, fallback: string) =>
  normalizeEthAddress(value) ?? getAddress(fallback);

const bytesFromBase64 = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const textBytes = (value: string) => new TextEncoder().encode(value);

const stringifyEventMetadata = (metadata: Record<string, unknown> | undefined) => {
  const json = JSON.stringify(metadata ?? {});
  if (json.length <= MAX_EVENT_METADATA_CHARS) return json;
  return JSON.stringify({ truncated: true });
};

const sanitizePayoutError = (error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown payout error";
  return message
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/0x[0-9a-fA-F]{64}/g, "<hex>")
    .replace(/\s+/g, " ")
    .slice(0, 500);
};

const getPayoutBatchSize = (env: Env, requested?: number) => {
  const configured = integerFromEnv(
    env.AIRDROP_PAYOUT_BATCH_SIZE,
    DEFAULT_PAYOUT_BATCH_SIZE,
    1,
    MAX_PAYOUT_BATCH_SIZE,
  );
  if (requested === undefined) return configured;
  return Math.min(
    MAX_PAYOUT_BATCH_SIZE,
    Math.max(1, Math.floor(requested || configured)),
  );
};

export const getAirdropConfig = (env: Env): AirdropConfig => {
  const minPrizeUnits = daemonUnitsFromEnv(
    env.AIRDROP_MIN_PRIZE_DAEMON ?? env.AIRDROP_BASE_PRIZE_DAEMON,
    DEFAULT_BASE_PRIZE_UNITS,
  );
  const maxPrizeUnits = Math.max(
    minPrizeUnits,
    daemonUnitsFromEnv(
      env.AIRDROP_MAX_PRIZE_DAEMON ?? env.AIRDROP_FULL_PRIZE_DAEMON,
      DEFAULT_MAX_PRIZE_UNITS,
    ),
  );
  const minFrogs = Math.floor(
    numberFromEnv(env.AIRDROP_MIN_FROGS, DEFAULT_MIN_FROGS, 1),
  );

  return {
    enabled: boolFromEnv(env.AIRDROP_ENABLED, false),
    campaignId: env.AIRDROP_CAMPAIGN_ID?.trim() || DEFAULT_CAMPAIGN_ID,
    collectionAddress:
      env.AIRDROP_COLLECTION_ADDRESS?.trim() || DEFAULT_COLLECTION,
    daemonTokenAddress: ethAddressFromEnv(
      env.AIRDROP_DAEMON_TOKEN_ADDRESS,
      DEFAULT_DAEMON_TOKEN_ADDRESS,
    ),
    escrowAddress: ethAddressFromEnv(
      env.AIRDROP_ESCROW_ADDRESS,
      DEFAULT_ESCROW_ADDRESS,
    ),
    daemonDecimals: Math.floor(
      numberFromEnv(
        env.AIRDROP_DAEMON_DECIMALS,
        DEFAULT_DAEMON_DECIMALS,
        0,
      ),
    ),
    minFrogs,
    fullPrizeMinFrogs: Math.max(
      minFrogs,
      Math.floor(
        numberFromEnv(
          env.AIRDROP_FULL_PRIZE_MIN_FROGS,
          DEFAULT_FULL_PRIZE_MIN_FROGS,
          1,
        ),
      ),
    ),
    poolUnits: daemonUnitsFromEnv(env.AIRDROP_POOL_DAEMON, DEFAULT_POOL_UNITS),
    minPrizeUnits,
    maxPrizeUnits,
    claimOpenAt: env.AIRDROP_CLAIM_OPEN_AT?.trim() || null,
    claimCloseAt: env.AIRDROP_CLAIM_CLOSE_AT?.trim() || null,
  };
};

const publicConfig = (config: AirdropConfig, stats?: CampaignStats) => ({
  enabled: config.enabled,
  campaignId: config.campaignId,
  collectionAddress: config.collectionAddress,
  daemonTokenAddress: config.daemonTokenAddress,
  escrowAddress: config.escrowAddress,
  daemonDecimals: config.daemonDecimals,
  minFrogs: config.minFrogs,
  fullPrizeMinFrogs: config.fullPrizeMinFrogs,
  poolDaemon: unitsToDaemon(config.poolUnits),
  minPrizeDaemon: unitsToDaemon(config.minPrizeUnits),
  maxPrizeDaemon: unitsToDaemon(config.maxPrizeUnits),
  claimOpenAt: config.claimOpenAt,
  claimCloseAt: config.claimCloseAt,
  claimOpen: config.enabled && isClaimOpen(config),
  requireEthSignature: false,
  stats,
});

const createClaimMessage = (input: {
  campaignId: string;
  solAddress: string;
  ethAddress: string;
  nonce: string;
  expiresAt: string;
}) =>
  [
    "Frog Trading Exchange DAEMON Airdrop",
    "",
    `Campaign: ${input.campaignId}`,
    `Solana wallet: ${input.solAddress}`,
    `Ethereum payout: ${input.ethAddress}`,
    `Nonce: ${input.nonce}`,
    `Expires: ${input.expiresAt}`,
    "",
    "This proves claim intent only. It does not approve token spending, submit a transaction, or require the Ethereum wallet to pay gas.",
  ].join("\n");

const randomNonce = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
};

const randomEventId = () => randomNonce();

const getRpcUrl = (env: Env) =>
  env.SOLANA_RPC_URL?.trim() || env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || "";

const getCollectionFromGrouping = (asset: DasAsset) =>
  asset.grouping?.find((entry) => entry.group_key === "collection")
    ?.group_value ?? null;

const isCurrentOwner = (asset: DasAsset, ownerAddress: string) =>
  asset.ownership?.owner?.toLowerCase() === ownerAddress.toLowerCase();

const fetchFrogHoldings = async (
  env: Env,
  ownerAddress: string,
  collectionAddress: string,
): Promise<FrogHolding[]> => {
  const rpcUrl = getRpcUrl(env);
  if (!rpcUrl) {
    throw new Error("SOLANA_RPC_URL is not configured");
  }

  let page = 1;
  const limit = 100;
  const holdings: FrogHolding[] = [];

  while (holdings.length < MAX_TRACKED_FROGS) {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `airdrop-frogs-${page}`,
        method: "searchAssets",
        params: {
          ownerAddress,
          tokenType: "nonFungible",
          grouping: ["collection", collectionAddress],
          page,
          limit,
          displayOptions: {
            showCollectionMetadata: true,
            showUnverifiedCollections: true,
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Solana RPC request failed (${response.status})`);
    }

    const data = (await response.json()) as DasResponse;
    if (data.error) {
      throw new Error(data.error.message ?? "Solana RPC returned an error");
    }

    const result = data.result;
    const items = result?.items ?? [];
    for (const item of items) {
      if (!item.id) continue;
      if (item.burnt === true) continue;
      if (item.compression?.compressed === true) continue;
      if (!isCurrentOwner(item, ownerAddress)) continue;
      const grouping = getCollectionFromGrouping(item);
      if (grouping?.toLowerCase() !== collectionAddress.toLowerCase()) {
        continue;
      }
      holdings.push({
        mint: item.id,
        name: item.content?.metadata?.name ?? "Business Frog",
      });
    }

    const reachedEnd =
      (result?.page ?? page) * (result?.limit ?? limit) >=
      (result?.total ?? holdings.length);
    if (reachedEnd || items.length === 0) break;
    page += 1;
  }

  return holdings.slice(0, MAX_TRACKED_FROGS);
};

const verifySolSignature = async (
  solAddress: string,
  message: string,
  signatureBase64: string,
) => {
  try {
    const publicKey = bs58.decode(solAddress);
    const signature = bytesFromBase64(signatureBase64);
    if (signature.length !== 64) return false;
    return await verifySolanaMessage(signature, textBytes(message), publicKey);
  } catch {
    return false;
  }
};

const verifyEthSignature = async (
  ethAddress: string,
  message: string,
  signature: string,
) => {
  if (!signature.startsWith("0x")) return false;
  try {
    return await verifyMessage({
      address: ethAddress as Hex,
      message,
      signature: signature as Hex,
    });
  } catch {
    return false;
  }
};

export const calculateTierPrizeUnits = (input: {
  frogCount: number;
  minFrogs: number;
  fullPrizeMinFrogs: number;
  minPrizeUnits: number;
  maxPrizeUnits: number;
}) => {
  if (input.frogCount < input.minFrogs) return 0;
  return input.frogCount >= input.fullPrizeMinFrogs
    ? input.maxPrizeUnits
    : input.minPrizeUnits;
};

type CampaignStats = {
  totalClaims: number;
  allocatedDaemon: string;
  remainingDaemon: string;
  finalized: boolean;
  vrfTx: string | null;
};

const rowToClaimStatus = (row: ClaimRow | null) => {
  if (!row) return null;
  return {
    solAddress: row.sol_address,
    ethAddress: row.eth_address,
    sequence: row.sequence,
    frogCount: row.frog_count,
    status: row.status,
    amountDaemon:
      row.amount_units === null ? null : unitsToDaemon(row.amount_units),
    createdAt: row.created_at,
    finalizedAt: row.finalized_at,
    payoutStatus: row.payout_status ?? null,
    payoutTxHash: row.payout_tx_hash ?? null,
    paidAt: row.paid_at ?? null,
  };
};

const rowToWalletEvent = (row: WalletEventRow) => ({
  eventId: row.event_id,
  eventType: row.event_type,
  solAddress: row.sol_address,
  ethAddress: row.eth_address,
  frogCount: row.frog_count,
  metadata: (() => {
    try {
      return JSON.parse(row.metadata_json || "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
  })(),
  createdAt: row.created_at,
});

const requireAdmin = (request: Request, env: Env) => {
  const token = env.AIRDROP_ADMIN_TOKEN?.trim();
  if (!token) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${token}`;
};

export class AirdropCoordinator {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    this.state.blockConcurrencyWhile(async () => {
      this.state.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS campaign_state (
          campaign_id TEXT PRIMARY KEY,
          vrf_seed TEXT,
          vrf_tx TEXT,
          finalized_at TEXT
        );
        CREATE TABLE IF NOT EXISTS nonces (
          campaign_id TEXT NOT NULL,
          nonce TEXT NOT NULL,
          sol_address TEXT NOT NULL,
          eth_address TEXT NOT NULL,
          message TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          consumed_at TEXT,
          created_at TEXT NOT NULL,
          PRIMARY KEY (campaign_id, nonce)
        );
        CREATE TABLE IF NOT EXISTS claims (
          campaign_id TEXT NOT NULL,
          sol_address TEXT NOT NULL,
          eth_address TEXT NOT NULL,
          sequence INTEGER NOT NULL,
          frog_count INTEGER NOT NULL,
          frog_mints_json TEXT NOT NULL,
          sol_signature TEXT NOT NULL,
          eth_signature TEXT NOT NULL,
          message TEXT NOT NULL,
          nonce TEXT NOT NULL,
          amount_units INTEGER,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          finalized_at TEXT,
          payout_tx_hash TEXT,
          payout_status TEXT,
          payout_error TEXT,
          payout_attempted_at TEXT,
          paid_at TEXT,
          PRIMARY KEY (campaign_id, sol_address),
          UNIQUE (campaign_id, eth_address),
          UNIQUE (campaign_id, sequence)
        );
        CREATE TABLE IF NOT EXISTS used_frog_mints (
          campaign_id TEXT NOT NULL,
          mint TEXT NOT NULL,
          sol_address TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (campaign_id, mint)
        );
        CREATE TABLE IF NOT EXISTS wallet_events (
          campaign_id TEXT NOT NULL,
          event_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          sol_address TEXT,
          eth_address TEXT,
          frog_count INTEGER,
          metadata_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (campaign_id, event_id)
        );
        CREATE INDEX IF NOT EXISTS idx_wallet_events_campaign_created
          ON wallet_events (campaign_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_wallet_events_campaign_sol_created
          ON wallet_events (campaign_id, sol_address, created_at);
      `);
      for (const statement of [
        "ALTER TABLE claims ADD COLUMN payout_tx_hash TEXT",
        "ALTER TABLE claims ADD COLUMN payout_status TEXT",
        "ALTER TABLE claims ADD COLUMN payout_error TEXT",
        "ALTER TABLE claims ADD COLUMN payout_attempted_at TEXT",
        "ALTER TABLE claims ADD COLUMN paid_at TEXT",
      ]) {
        try {
          this.state.storage.sql.exec(statement);
        } catch {
          // Existing Durable Objects already have the column.
        }
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const config = getAirdropConfig(this.env);
    const url = new URL(request.url);

    if (
      (url.pathname === "/status" || url.pathname === "/config") &&
      request.method === "GET"
    ) {
      return json(this.status(config, url.searchParams.get("solAddress")));
    }

    if (url.pathname === "/challenge" && request.method === "POST") {
      let body: ChallengeInput;
      try {
        body = (await request.json()) as ChallengeInput;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }
      return respondCoordinatorResult(this.createChallenge(body, config));
    }

    if (url.pathname === "/claim" && request.method === "POST") {
      let body: ClaimInput;
      try {
        body = (await request.json()) as ClaimInput;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }
      return respondCoordinatorResult(await this.claim(body, config));
    }

    if (url.pathname === "/finalize" && request.method === "POST") {
      let body: FinalizeInput;
      try {
        body = (await request.json()) as FinalizeInput;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }
      return respondCoordinatorResult(await this.finalize(body, config));
    }

    if (url.pathname === "/payout" && request.method === "POST") {
      let body: PayoutInput;
      try {
        body = (await request.json()) as PayoutInput;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }
      return respondCoordinatorResult(await this.payout(body, config));
    }

    if (url.pathname === "/event" && request.method === "POST") {
      let body: WalletEventInput;
      try {
        body = (await request.json()) as WalletEventInput;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }
      return respondCoordinatorResult(this.recordEvent(body, config));
    }

    if (url.pathname === "/export" && request.method === "GET") {
      return json(this.exportClaims(config));
    }

    return json({ error: "Not found" }, { status: 404 });
  }

  getStats(config: AirdropConfig): CampaignStats {
    this.allocatePendingClaims(config);
    const aggregate = this.state.storage.sql
      .exec<{
        total_claims: number;
        allocated_units: number | null;
      }>(
        `SELECT COUNT(*) AS total_claims, COALESCE(SUM(amount_units), 0) AS allocated_units
         FROM claims
         WHERE campaign_id = ?`,
        config.campaignId,
      )
      .one();
    const campaign = this.state.storage.sql
      .exec<CampaignStateRow>(
        "SELECT * FROM campaign_state WHERE campaign_id = ?",
        config.campaignId,
      )
      .toArray()[0] ?? null;
    const allocatedUnits = aggregate.allocated_units ?? 0;
    return {
      totalClaims: aggregate.total_claims,
      allocatedDaemon: unitsToDaemon(allocatedUnits),
      remainingDaemon: unitsToDaemon(
        Math.max(0, config.poolUnits - allocatedUnits),
      ),
      finalized: Boolean(campaign?.finalized_at),
      vrfTx: campaign?.vrf_tx ?? null,
    };
  }

  allocatePendingClaims(config: AirdropConfig) {
    const pending = this.state.storage.sql
      .exec<ClaimRow>(
        `SELECT * FROM claims
         WHERE campaign_id = ?
           AND (amount_units IS NULL OR status = 'queued')
         ORDER BY sequence ASC`,
        config.campaignId,
      )
      .toArray();
    if (pending.length === 0) return;

    const allocated = this.state.storage.sql
      .exec<{ allocated_units: number | null }>(
        `SELECT COALESCE(SUM(amount_units), 0) AS allocated_units
         FROM claims
         WHERE campaign_id = ? AND amount_units IS NOT NULL`,
        config.campaignId,
      )
      .one().allocated_units ?? 0;
    let remaining = Math.max(0, config.poolUnits - allocated);
    const allocatedAt = new Date().toISOString();

    for (const claim of pending) {
      const tierAmount = calculateTierPrizeUnits({
        frogCount: claim.frog_count,
        minFrogs: config.minFrogs,
        fullPrizeMinFrogs: config.fullPrizeMinFrogs,
        minPrizeUnits: config.minPrizeUnits,
        maxPrizeUnits: config.maxPrizeUnits,
      });
      const amount = tierAmount > 0 && remaining >= tierAmount ? tierAmount : 0;
      const status = amount > 0 ? "won" : "not_selected";
      remaining -= amount;

      this.state.storage.sql.exec(
        `UPDATE claims
         SET amount_units = ?,
           status = ?,
           finalized_at = COALESCE(finalized_at, ?)
         WHERE campaign_id = ? AND sol_address = ?`,
        amount,
        status,
        allocatedAt,
        config.campaignId,
        claim.sol_address,
      );
    }
  }

  createChallenge(input: ChallengeInput, config: AirdropConfig) {
    if (!config.enabled || !isClaimOpen(config)) {
      return { error: "Airdrop claims are not open", status: 403 };
    }

    const solAddress = validateSolAddress(input.solAddress);
    const ethAddress = normalizeEthAddress(input.ethAddress);
    if (!solAddress || !ethAddress) {
      return { error: "Valid Solana and Ethereum addresses are required", status: 400 };
    }

    const nonce = randomNonce();
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
    const createdAt = new Date().toISOString();
    const message = createClaimMessage({
      campaignId: config.campaignId,
      solAddress,
      ethAddress,
      nonce,
      expiresAt,
    });

    this.state.storage.sql.exec(
      `INSERT INTO nonces (
        campaign_id, nonce, sol_address, eth_address, message, expires_at, consumed_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      config.campaignId,
      nonce,
      solAddress,
      ethAddress,
      message,
      expiresAt,
      createdAt,
    );

    this.recordEvent(
      {
        eventType: "challenge_created",
        solAddress,
        ethAddress,
        metadata: { expiresAt },
      },
      config,
    );

    return {
      nonce,
      message,
      expiresAt,
      solAddress,
      ethAddress,
    };
  }

  async claim(input: ClaimInput, config: AirdropConfig) {
    if (!config.enabled || !isClaimOpen(config)) {
      return { error: "Airdrop claims are not open", status: 403 };
    }

    const solAddress = validateSolAddress(input.solAddress);
    const ethAddress = normalizeEthAddress(input.ethAddress);
    const nonce = input.nonce?.trim() ?? "";
    const solSignature = input.solSignature?.trim() ?? "";
    const ethSignature = input.ethSignature?.trim() ?? "";
    if (!solAddress || !ethAddress || !nonce || !solSignature) {
      return { error: "Claim proof is incomplete", status: 400 };
    }

    const existing = this.state.storage.sql
      .exec<ClaimRow>(
        "SELECT * FROM claims WHERE campaign_id = ? AND sol_address = ?",
        config.campaignId,
        solAddress,
      )
      .toArray()[0] ?? null;
    if (existing) {
      return { claim: rowToClaimStatus(existing), duplicate: true };
    }

    const nonceRow = this.state.storage.sql
      .exec<NonceRow>(
        `SELECT * FROM nonces
         WHERE campaign_id = ? AND nonce = ? AND sol_address = ? AND eth_address = ?`,
        config.campaignId,
        nonce,
        solAddress,
        ethAddress,
      )
      .toArray()[0] ?? null;
    if (!nonceRow || nonceRow.consumed_at) {
      return { error: "Challenge is invalid or already used", status: 400 };
    }
    if (Date.parse(nonceRow.expires_at) < Date.now()) {
      return { error: "Challenge expired", status: 400 };
    }

    const solOk = await verifySolSignature(
      solAddress,
      nonceRow.message,
      solSignature,
    );
    if (!solOk) {
      return { error: "Wallet signature verification failed", status: 401 };
    }
    if (ethSignature) {
      const ethOk = await verifyEthSignature(
        ethAddress,
        nonceRow.message,
        ethSignature,
      );
      if (!ethOk) {
        return { error: "Ethereum signature verification failed", status: 401 };
      }
    }

    const frogs = await fetchFrogHoldings(
      this.env,
      solAddress,
      config.collectionAddress,
    );
    if (frogs.length < config.minFrogs) {
      return {
        eligible: false,
        frogCount: frogs.length,
        error: `Wallet must hold at least ${config.minFrogs} Business Frogs`,
        status: 403,
      };
    }

    const frogMints = frogs.map((frog) => frog.mint);
    const placeholders = frogMints.map(() => "?").join(", ");
    const usedMint =
      frogMints.length > 0
        ? this.state.storage.sql
            .exec<{ mint: string; sol_address: string }>(
              `SELECT mint, sol_address FROM used_frog_mints
               WHERE campaign_id = ? AND mint IN (${placeholders})
               LIMIT 1`,
              config.campaignId,
              ...frogMints,
            )
            .toArray()[0] ?? null
        : null;
    if (usedMint) {
      return {
        error: "One or more frogs in this wallet already backed another claim",
        status: 409,
      };
    }

    const ethDuplicate = this.state.storage.sql
      .exec<ClaimRow>(
        "SELECT * FROM claims WHERE campaign_id = ? AND eth_address = ?",
        config.campaignId,
        ethAddress,
      )
      .toArray()[0] ?? null;
    if (ethDuplicate) {
      return { error: "Ethereum payout address already claimed", status: 409 };
    }

    const sequenceRow = this.state.storage.sql
      .exec<{ next_sequence: number }>(
        "SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM claims WHERE campaign_id = ?",
        config.campaignId,
      )
      .one();
    const sequence = sequenceRow.next_sequence;
    const now = new Date().toISOString();
    this.allocatePendingClaims(config);
    const allocatedUnits = this.state.storage.sql
      .exec<{ allocated_units: number | null }>(
        `SELECT COALESCE(SUM(amount_units), 0) AS allocated_units
         FROM claims
         WHERE campaign_id = ? AND amount_units IS NOT NULL`,
        config.campaignId,
      )
      .one().allocated_units ?? 0;
    const tierAmount = calculateTierPrizeUnits({
      frogCount: frogs.length,
      minFrogs: config.minFrogs,
      fullPrizeMinFrogs: config.fullPrizeMinFrogs,
      minPrizeUnits: config.minPrizeUnits,
      maxPrizeUnits: config.maxPrizeUnits,
    });
    const amountUnits =
      tierAmount > 0 && config.poolUnits - allocatedUnits >= tierAmount
        ? tierAmount
        : 0;
    const claimStatus = amountUnits > 0 ? "won" : "not_selected";

    this.state.storage.sql.exec(
      `INSERT INTO claims (
        campaign_id, sol_address, eth_address, sequence, frog_count,
        frog_mints_json, sol_signature, eth_signature, message, nonce,
        amount_units, status, created_at, finalized_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      config.campaignId,
      solAddress,
      ethAddress,
      sequence,
      frogs.length,
      JSON.stringify(frogMints),
      solSignature,
      ethSignature || "",
      nonceRow.message,
      nonce,
      amountUnits,
      claimStatus,
      now,
      now,
    );

    for (const mint of frogMints) {
      this.state.storage.sql.exec(
        `INSERT INTO used_frog_mints (campaign_id, mint, sol_address, created_at)
         VALUES (?, ?, ?, ?)`,
        config.campaignId,
        mint,
        solAddress,
        now,
      );
    }
    this.state.storage.sql.exec(
      "UPDATE nonces SET consumed_at = ? WHERE campaign_id = ? AND nonce = ?",
      now,
      config.campaignId,
      nonce,
    );

    const row = this.state.storage.sql
      .exec<ClaimRow>(
        "SELECT * FROM claims WHERE campaign_id = ? AND sol_address = ?",
        config.campaignId,
        solAddress,
      )
      .one();

    this.recordEvent(
      {
        eventType: "claim_queued",
        solAddress,
        ethAddress,
        frogCount: frogs.length,
        metadata: {
          sequence,
          frogMints,
          amountDaemon: unitsToDaemon(amountUnits),
          status: claimStatus,
        },
      },
      config,
    );

    return {
      eligible: true,
      claim: rowToClaimStatus(row),
      stats: this.getStats(config),
    };
  }

  status(config: AirdropConfig, solAddress?: string | null) {
    const normalized = validateSolAddress(solAddress ?? undefined);
    const claim = normalized
      ? this.state.storage.sql
          .exec<ClaimRow>(
            "SELECT * FROM claims WHERE campaign_id = ? AND sol_address = ?",
            config.campaignId,
            normalized,
          )
          .toArray()[0] ?? null
      : null;
    return {
      config: publicConfig(config, this.getStats(config)),
      claim: rowToClaimStatus(claim),
    };
  }

  async finalize(input: FinalizeInput, config: AirdropConfig) {
    const seed = sanitizeSeed(input.vrfSeed);

    const alreadyFinalized = this.state.storage.sql
      .exec<CampaignStateRow>(
        "SELECT * FROM campaign_state WHERE campaign_id = ? AND finalized_at IS NOT NULL",
        config.campaignId,
      )
      .toArray()[0] ?? null;
    if (alreadyFinalized) {
      return { error: "Campaign already finalized", status: 409 };
    }

    const finalizedAt = new Date().toISOString();
    this.allocatePendingClaims(config);

    this.state.storage.sql.exec(
      `INSERT INTO campaign_state (campaign_id, vrf_seed, vrf_tx, finalized_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(campaign_id)
       DO UPDATE SET vrf_seed = excluded.vrf_seed,
         vrf_tx = excluded.vrf_tx,
         finalized_at = excluded.finalized_at`,
      config.campaignId,
      seed,
      sanitizeTx(input.vrfTx),
      finalizedAt,
    );

    return {
      ok: true,
      finalizedAt,
      stats: this.getStats(config),
    };
  }

  async payout(input: PayoutInput, config: AirdropConfig) {
    if (!boolFromEnv(this.env.AIRDROP_PAYOUT_ENABLED, false)) {
      return { error: "Airdrop payouts are not enabled", status: 403 };
    }
    this.allocatePendingClaims(config);

    const maxTransfers = getPayoutBatchSize(this.env, input.maxTransfers);
    const claims = this.state.storage.sql
      .exec<ClaimRow>(
        `SELECT * FROM claims
         WHERE campaign_id = ?
           AND status = 'won'
           AND COALESCE(amount_units, 0) > 0
           AND payout_tx_hash IS NULL
         ORDER BY sequence ASC
         LIMIT ?`,
        config.campaignId,
        maxTransfers,
      )
      .toArray();
    const remainingBefore = this.state.storage.sql
      .exec<{ remaining: number }>(
        `SELECT COUNT(*) AS remaining
         FROM claims
         WHERE campaign_id = ?
           AND status = 'won'
           AND COALESCE(amount_units, 0) > 0
           AND payout_tx_hash IS NULL`,
        config.campaignId,
      )
      .one().remaining;

    if (claims.length === 0) {
      return {
        ok: true,
        dryRun: Boolean(input.dryRun),
        sent: [],
        failed: [],
        remaining: 0,
        stats: this.getStats(config),
      };
    }

    const rpcUrl = this.env.AIRDROP_ETH_RPC_URL?.trim();
    if (!rpcUrl) {
      return { error: "AIRDROP_ETH_RPC_URL is not configured", status: 503 };
    }

    const privateKey = normalizePrivateKey(this.env.AIRDROP_ESCROW_PRIVATE_KEY);
    if (!privateKey) {
      return { error: "AIRDROP_ESCROW_PRIVATE_KEY is not configured", status: 503 };
    }

    const account = privateKeyToAccount(privateKey);
    if (getAddress(account.address) !== config.escrowAddress) {
      return {
        error: "Escrow signer does not match AIRDROP_ESCROW_ADDRESS",
        status: 409,
      };
    }

    const tokenAddress = config.daemonTokenAddress as Address;
    const escrowAddress = config.escrowAddress as Address;
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http(rpcUrl, { timeout: 15_000 }),
    });

    const tokenCode = await publicClient.getCode({ address: tokenAddress });
    if (!tokenCode || tokenCode === "0x") {
      return {
        error: "DAEMON token contract is not live at the configured address",
        status: 409,
      };
    }

    const payouts = claims.map((claim) => ({
      claim,
      amountTokenBaseUnits: unitsToTokenBaseUnitsBigInt(
        claim.amount_units ?? 0,
        config.daemonDecimals,
      ),
    }));
    const requiredTokenBaseUnits = payouts.reduce(
      (total, payout) => total + payout.amountTokenBaseUnits,
      0n,
    );
    const [tokenBalance, ethBalance] = await Promise.all([
      publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [escrowAddress],
      }),
      publicClient.getBalance({ address: escrowAddress }),
    ]);

    if (tokenBalance < requiredTokenBaseUnits) {
      return {
        error: "Escrow does not hold enough DAEMON for this payout batch",
        status: 409,
        requiredTokenBaseUnits: requiredTokenBaseUnits.toString(),
        escrowTokenBalanceBaseUnits: tokenBalance.toString(),
      };
    }
    if (ethBalance === 0n) {
      return {
        error: "Escrow has no ETH for gas",
        status: 409,
        escrowEthBalanceWei: ethBalance.toString(),
      };
    }

    let estimatedGasWei: string | null = null;
    try {
      const [first] = payouts;
      const gas = await publicClient.estimateContractGas({
        account,
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "transfer",
        args: [
          first.claim.eth_address as Address,
          first.amountTokenBaseUnits,
        ],
      });
      const gasPrice = await publicClient.getGasPrice();
      estimatedGasWei = (gas * gasPrice * BigInt(payouts.length)).toString();
    } catch {
      estimatedGasWei = null;
    }

    const dryRun = Boolean(input.dryRun);
    if (dryRun) {
      return {
        ok: true,
        dryRun: true,
        batchSize: payouts.length,
        remaining: remainingBefore,
        daemonTokenAddress: config.daemonTokenAddress,
        escrowAddress: config.escrowAddress,
        requiredTokenBaseUnits: requiredTokenBaseUnits.toString(),
        escrowTokenBalanceBaseUnits: tokenBalance.toString(),
        escrowEthBalanceWei: ethBalance.toString(),
        estimatedGasWei,
        payouts: payouts.map(({ claim, amountTokenBaseUnits }) => ({
          sequence: claim.sequence,
          solAddress: claim.sol_address,
          ethAddress: claim.eth_address,
          amountDaemon: unitsToDaemon(claim.amount_units ?? 0),
          amountTokenBaseUnits: amountTokenBaseUnits.toString(),
        })),
      };
    }

    const walletClient = createWalletClient({
      account,
      chain: mainnet,
      transport: http(rpcUrl, { timeout: 15_000 }),
    });
    const waitForReceipts =
      input.waitForReceipts ??
      boolFromEnv(this.env.AIRDROP_PAYOUT_WAIT_FOR_RECEIPTS, false);
    const sent: Array<{
      sequence: number;
      ethAddress: string;
      amountDaemon: string;
      txHash: string;
    }> = [];
    const failed: Array<{
      sequence: number;
      ethAddress: string;
      amountDaemon: string;
      error: string;
      txHash?: string;
    }> = [];

    for (const { claim, amountTokenBaseUnits } of payouts) {
      const attemptedAt = new Date().toISOString();
      this.state.storage.sql.exec(
        `UPDATE claims
         SET payout_status = 'sending',
           payout_attempted_at = ?,
           payout_error = NULL
         WHERE campaign_id = ? AND sol_address = ? AND payout_tx_hash IS NULL`,
        attemptedAt,
        config.campaignId,
        claim.sol_address,
      );

      let txHash: Hex | null = null;
      try {
        txHash = await walletClient.writeContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "transfer",
          args: [claim.eth_address as Address, amountTokenBaseUnits],
        });

        if (waitForReceipts) {
          const receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash,
          });
          if (receipt.status !== "success") {
            throw new Error("Payout transaction did not succeed");
          }
        }

        const paidAt = new Date().toISOString();
        this.state.storage.sql.exec(
          `UPDATE claims
           SET payout_tx_hash = ?,
             payout_status = 'sent',
             payout_error = NULL,
             paid_at = ?
           WHERE campaign_id = ? AND sol_address = ?`,
          txHash,
          paidAt,
          config.campaignId,
          claim.sol_address,
        );
        sent.push({
          sequence: claim.sequence,
          ethAddress: claim.eth_address,
          amountDaemon: unitsToDaemon(claim.amount_units ?? 0),
          txHash,
        });
        this.recordEvent(
          {
            eventType: "payout_sent",
            solAddress: claim.sol_address,
            ethAddress: claim.eth_address,
            frogCount: claim.frog_count,
            metadata: {
              sequence: claim.sequence,
              amountDaemon: unitsToDaemon(claim.amount_units ?? 0),
              txHash,
            },
          },
          config,
        );
      } catch (error) {
        const payoutError = sanitizePayoutError(error);
        this.state.storage.sql.exec(
          `UPDATE claims
           SET payout_status = 'failed',
             payout_error = ?,
             payout_tx_hash = COALESCE(payout_tx_hash, ?)
           WHERE campaign_id = ? AND sol_address = ?`,
          payoutError,
          txHash,
          config.campaignId,
          claim.sol_address,
        );
        failed.push({
          sequence: claim.sequence,
          ethAddress: claim.eth_address,
          amountDaemon: unitsToDaemon(claim.amount_units ?? 0),
          error: payoutError,
          txHash: txHash ?? undefined,
        });
        this.recordEvent(
          {
            eventType: "payout_failed",
            solAddress: claim.sol_address,
            ethAddress: claim.eth_address,
            frogCount: claim.frog_count,
            metadata: {
              sequence: claim.sequence,
              amountDaemon: unitsToDaemon(claim.amount_units ?? 0),
              error: payoutError,
              txHash,
            },
          },
          config,
        );
      }
    }

    return {
      ok: failed.length === 0,
      dryRun: false,
      sent,
      failed,
      remaining: Math.max(0, remainingBefore - sent.length),
      stats: this.getStats(config),
    };
  }

  recordEvent(input: WalletEventInput, config: AirdropConfig) {
    const eventType = sanitizeEventType(input.eventType);
    if (!eventType) {
      return { error: "Unsupported wallet event type", status: 400 };
    }

    const solAddress = input.solAddress
      ? validateSolAddress(input.solAddress)
      : null;
    const ethAddress = input.ethAddress
      ? normalizeEthAddress(input.ethAddress)
      : null;
    const frogCount =
      typeof input.frogCount === "number" &&
      Number.isFinite(input.frogCount) &&
      input.frogCount >= 0
        ? Math.floor(input.frogCount)
        : null;
    const metadataJson = stringifyEventMetadata(input.metadata);
    const eventId = randomEventId();
    const createdAt = new Date().toISOString();

    this.state.storage.sql.exec(
      `INSERT INTO wallet_events (
        campaign_id, event_id, event_type, sol_address, eth_address,
        frog_count, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      config.campaignId,
      eventId,
      eventType,
      solAddress,
      ethAddress,
      frogCount,
      metadataJson,
      createdAt,
    );

    return { ok: true, eventId };
  }

  exportClaims(config: AirdropConfig) {
    const claims = this.state.storage.sql
      .exec<ClaimRow>(
        "SELECT * FROM claims WHERE campaign_id = ? ORDER BY sequence ASC",
        config.campaignId,
      )
      .toArray();
    const state = this.state.storage.sql
      .exec<CampaignStateRow>(
        "SELECT * FROM campaign_state WHERE campaign_id = ?",
        config.campaignId,
      )
      .toArray()[0] ?? null;
    const events = this.state.storage.sql
      .exec<WalletEventRow>(
        "SELECT * FROM wallet_events WHERE campaign_id = ? ORDER BY created_at ASC",
        config.campaignId,
      )
      .toArray();
    return {
      campaignId: config.campaignId,
      finalizedAt: state?.finalized_at ?? null,
      vrfTx: state?.vrf_tx ?? null,
      daemonTokenAddress: config.daemonTokenAddress,
      escrowAddress: config.escrowAddress,
      daemonDecimals: config.daemonDecimals,
      totalPoolDaemon: unitsToDaemon(config.poolUnits),
      totalPoolTokenBaseUnits: unitsToTokenBaseUnits(
        config.poolUnits,
        config.daemonDecimals,
      ),
      claims: claims.map((claim) => ({
        sequence: claim.sequence,
        solAddress: claim.sol_address,
        ethAddress: claim.eth_address,
        frogCount: claim.frog_count,
        status: claim.status,
        amountDaemon:
          claim.amount_units === null ? null : unitsToDaemon(claim.amount_units),
        amountTokenBaseUnits:
          claim.amount_units === null
            ? null
            : unitsToTokenBaseUnits(claim.amount_units, config.daemonDecimals),
        payoutStatus: claim.payout_status ?? null,
        payoutTxHash: claim.payout_tx_hash ?? null,
        payoutError: claim.payout_error ?? null,
        payoutAttemptedAt: claim.payout_attempted_at ?? null,
        paidAt: claim.paid_at ?? null,
        createdAt: claim.created_at,
      })),
      walletEvents: events.map(rowToWalletEvent),
    };
  }
}

const getCoordinator = (env: Env) => {
  if (!env.AIRDROP_COORDINATOR) return null;
  const namespace = env.AIRDROP_COORDINATOR as DurableObjectNamespace & {
    getByName?: (name: string) => DurableObjectStub;
  };
  if (typeof namespace.getByName === "function") {
    return namespace.getByName("daemon-frog-airdrop");
  }
  return namespace.get(namespace.idFromName("daemon-frog-airdrop"));
};

const callCoordinator = (
  env: Env,
  path: string,
  init?: RequestInit,
): Promise<Response> | null => {
  const coordinator = getCoordinator(env);
  if (!coordinator) return null;
  return coordinator.fetch(`https://airdrop.local${path}`, init);
};

const recordAirdropEvent = async (
  env: Env,
  event: WalletEventInput,
): Promise<void> => {
  const response = callCoordinator(env, "/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  if (!response) return;
  try {
    await response;
  } catch (error) {
    console.error("[airdrop] Failed to record wallet event:", error);
  }
};

const respondCoordinatorResult = (result: unknown) => {
  const maybeError = result as { error?: string; status?: number };
  if (maybeError?.error) {
    return json({ error: maybeError.error }, { status: maybeError.status ?? 400 });
  }
  return json(result);
};

export async function getAirdrop(request: Request, env: Env): Promise<Response> {
  const config = getAirdropConfig(env);
  const url = new URL(request.url);
  const coordinatorResponse = callCoordinator(
    env,
    `/status${url.search}`,
    { method: "GET" },
  );
  if (!coordinatorResponse) {
    return json(publicConfig(config, undefined));
  }
  return coordinatorResponse;
}

export async function getAirdropEligibility(
  request: Request,
  env: Env,
): Promise<Response> {
  const config = getAirdropConfig(env);
  const url = new URL(request.url);
  const solAddress = validateSolAddress(
    url.searchParams.get("solAddress") ?? undefined,
  );

  if (!solAddress) {
    return json({ error: "Valid Solana address is required" }, { status: 400 });
  }

  try {
    const frogs = await fetchFrogHoldings(
      env,
      solAddress,
      config.collectionAddress,
    );
    await recordAirdropEvent(env, {
      eventType: "eligibility_checked",
      solAddress,
      frogCount: frogs.length,
      metadata: {
        eligible: frogs.length >= config.minFrogs,
        minFrogs: config.minFrogs,
      },
    });
    return json({
      solAddress,
      eligible: frogs.length >= config.minFrogs,
      frogCount: frogs.length,
      minFrogs: config.minFrogs,
    });
  } catch (error) {
    console.error("[airdrop] Eligibility check failed:", error);
    await recordAirdropEvent(env, {
      eventType: "eligibility_unavailable",
      solAddress,
      metadata: {
        minFrogs: config.minFrogs,
      },
    });
    return json({
      solAddress,
      eligible: false,
      frogCount: null,
      minFrogs: config.minFrogs,
      unavailable: true,
      error: "Eligibility check temporarily unavailable",
    });
  }
}

export async function postAirdropChallenge(
  request: Request,
  env: Env,
): Promise<Response> {
  const config = getAirdropConfig(env);
  let body: ChallengeInput;
  try {
    body = (await request.json()) as ChallengeInput;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const response = callCoordinator(env, "/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response ?? json({ error: "Airdrop storage is not configured" }, { status: 503 });
}

export async function postAirdropClaim(
  request: Request,
  env: Env,
): Promise<Response> {
  const config = getAirdropConfig(env);
  let body: ClaimInput;
  try {
    body = (await request.json()) as ClaimInput;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const response = callCoordinator(env, "/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response ?? json({ error: "Airdrop storage is not configured" }, { status: 503 });
}

export async function postAirdropFinalize(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!requireAdmin(request, env)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: FinalizeInput;
  try {
    body = (await request.json()) as FinalizeInput;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const response = callCoordinator(env, "/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response ?? json({ error: "Airdrop storage is not configured" }, { status: 503 });
}

export async function postAirdropPayout(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!requireAdmin(request, env)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: PayoutInput;
  try {
    body = (await request.json()) as PayoutInput;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const response = callCoordinator(env, "/payout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response ?? json({ error: "Airdrop storage is not configured" }, { status: 503 });
}

export async function getAirdropExport(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!requireAdmin(request, env)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const response = callCoordinator(env, "/export", { method: "GET" });
  return response ?? json({ error: "Airdrop storage is not configured" }, { status: 503 });
}

export async function runAirdropPayout(env: Env): Promise<void> {
  if (!boolFromEnv(env.AIRDROP_AUTO_PAYOUT_ENABLED, false)) return;
  const response = callCoordinator(env, "/payout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!response) return;
  try {
    const result = await response;
    if (!result.ok) {
      console.error("[airdrop] Automatic payout failed:", result.status);
    }
  } catch (error) {
    console.error("[airdrop] Automatic payout request failed:", error);
  }
}

export const __airdropTest = {
  getRpcUrl,
  isCurrentOwner,
  normalizePrivateKey,
  sanitizeSeed,
  unitsToTokenBaseUnits,
  unitsToDaemon,
};
