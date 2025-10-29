import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
const loadDotenv = async () => {
  try {
    const mod = await import("dotenv");
    return mod.config;
  } catch (error) {
    console.warn(
      "[dev-worker] dotenv not found; skipping root env loading. Install it with `pnpm add -D dotenv` at the repo root if needed.",
    );
    return () => undefined;
  }
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const workerDir = path.join(rootDir, "apps/api");

const envName = process.env.NODE_ENV ?? "development";

const envFiles = [
  { path: path.join(rootDir, ".env"), override: false },
  { path: path.join(rootDir, `.env.${envName}`), override: false },
  { path: path.join(rootDir, ".env.local"), override: true },
  { path: path.join(rootDir, `.env.${envName}.local`), override: true },
];

const loadEnvConfigRef = await loadDotenv();

for (const candidate of envFiles) {
  if (!fs.existsSync(candidate.path)) continue;
  if (typeof loadEnvConfigRef === "function") {
    loadEnvConfigRef({
      path: candidate.path,
      override: candidate.override,
    });
  }
}

const forwardPrefixes = ["TITAN_", "SOLANA_", "QUOTE_", "PLATFORM_FEE_"];

const varArgs = [];
for (const [key, value] of Object.entries(process.env)) {
  if (!value) continue;
  if (!forwardPrefixes.some((prefix) => key.startsWith(prefix))) {
    continue;
  }
  varArgs.push("--var");
  varArgs.push(`${key}=${value}`);
}

const port = process.env.WORKER_PORT ?? "8787";

const useRemote =
  process.env.WRANGLER_DEV_REMOTE === "1" ||
  process.env.WORKER_REMOTE === "1" ||
  process.env.DEV_WORKER_REMOTE === "1";

const wranglerArgs = ["dev", "--port", port, ...varArgs];
if (useRemote) {
  wranglerArgs.push("--remote");
  console.log("[dev-worker] Using Cloudflare remote dev for Worker (WS-friendly)…");
}

const child = spawn("wrangler", wranglerArgs, {
  cwd: workerDir,
  stdio: "inherit",
  env: process.env,
});

const signals = ["SIGINT", "SIGTERM", "SIGQUIT"];
for (const signal of signals) {
  process.on(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
}

child.on("close", (code) => {
  process.exit(code ?? 0);
});
