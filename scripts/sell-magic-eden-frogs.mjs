const apiBase = (process.env.FROGX_API_BASE_URL ?? "https://frogtrading.exchange")
  .trim()
  .replace(/\/+$/, "");
const token = process.env.FROGX_BOT_API_TOKEN?.trim();
const telegramUserId = process.env.TELEGRAM_USER_ID?.trim();
const walletAddress = process.env.WALLET_ADDRESS?.trim();
const execute = process.env.EXECUTE === "true";
const maxSales = Number.parseInt(process.env.MAX_SALES ?? "50", 10);
const runId =
  process.env.SALE_RUN_ID?.trim() ??
  new Date().toISOString().replace(/\D/g, "").slice(0, 14);

if (!token || !telegramUserId || !walletAddress) {
  throw new Error(
    "FROGX_BOT_API_TOKEN, TELEGRAM_USER_ID, and WALLET_ADDRESS are required",
  );
}
if (!Number.isInteger(maxSales) || maxSales < 1 || maxSales > 50) {
  throw new Error("MAX_SALES must be an integer between 1 and 50");
}

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const readJson = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      typeof data.error === "string"
        ? data.error
        : `Request failed with status ${response.status}`,
    );
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
};

const get = async (path) =>
  readJson(
    await fetch(`${apiBase}${path}`, {
      signal: AbortSignal.timeout(30_000),
    }),
  );

const post = async (path, body) =>
  readJson(
    await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    }),
  );

const getHoldings = async () => {
  const query = new URLSearchParams({
    walletAddress,
    page: "1",
    limit: "50",
  });
  const data = await get(`/api/frogx/nfts?${query}`);
  return Array.isArray(data.items) ? data.items : [];
};

const getOffer = async () => {
  const data = await get("/api/frogx/magic-eden/top-offer");
  if (!data.offer) throw new Error("No live Magic Eden offer is available");
  return data.offer;
};

const waitForTerminalStatus = async (requestBody) => {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const status = await post(
      "/api/frogx/magic-eden/execute-sell/status",
      requestBody,
    );
    if (status.status === "executed" || status.status === "failed") {
      return status;
    }
    if (attempt < 20) await sleep(3_000);
  }
  return { status: "pending" };
};

const soldMints = new Set();
let totalMinimumLamports = 0n;

for (let index = 0; index < maxSales; index += 1) {
  const holdings = await getHoldings();
  const frog = holdings.find((item) => !soldMints.has(item.mint));
  if (!frog) break;

  const offer = await getOffer();
  const executionId = `${runId}:${index + 1}:${frog.mint.slice(0, 12)}`;
  const requestBody = {
    telegramUserId,
    walletAddress,
    mint: frog.mint,
    executionId,
    minimumPaymentLamports: offer.minimumPaymentLamports,
  };

  if (!execute) {
    console.log(
      `[dry-run] ${index + 1}: ${frog.mint} at ${offer.spotPriceSol} SOL gross, ${offer.minimumPaymentSol} SOL minimum`,
    );
    soldMints.add(frog.mint);
    continue;
  }

  console.log(
    `[submit] ${index + 1}: ${frog.mint} at ${offer.spotPriceSol} SOL gross, ${offer.minimumPaymentSol} SOL minimum`,
  );
  try {
    await post("/api/frogx/magic-eden/execute-sell", requestBody);
  } catch (error) {
    if (error.data?.status !== "pending_reconciliation") throw error;
  }

  const terminal = await waitForTerminalStatus(requestBody);
  if (terminal.status !== "executed" || !terminal.signature) {
    throw new Error(
      `Sale ${executionId} did not confirm; status=${terminal.status}. Do not retry it blindly.`,
    );
  }

  soldMints.add(frog.mint);
  totalMinimumLamports += BigInt(offer.minimumPaymentLamports);
  console.log(
    `[confirmed] ${frog.mint} ${terminal.signature} (${soldMints.size} sold)`,
  );
}

console.log(
  execute
    ? `Finished: ${soldMints.size} confirmed sales, minimum ${Number(totalMinimumLamports) / 1_000_000_000} SOL`
    : `Dry run: ${soldMints.size} Frogs would be submitted one at a time`,
);
