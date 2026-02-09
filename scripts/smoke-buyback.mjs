#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const loadDotenv = async () => {
  try {
    const mod = await import("dotenv");
    return mod.config;
  } catch {
    return () => undefined;
  }
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

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

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getFlagValue = (flag) => {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : null;
};

const showHelp = hasFlag("--help") || hasFlag("-h");
if (showHelp) {
  console.log(`
Usage: node scripts/smoke-buyback.mjs [--execute] [--base <url>] [--token <token>]

Options:
  --execute        Call POST /api/frogx/buyback/execute after status check
  --base <url>     Override base URL (default: http://localhost:<WORKER_PORT|8787>)
  --token <token>  Override BUYBACK_TRIGGER_TOKEN for execute call
`);
  process.exit(0);
}

const port = process.env.WORKER_PORT ?? "8787";
const baseFromEnv = process.env.BUYBACK_SMOKE_BASE_URL;
const baseFromArg = getFlagValue("--base");
const baseUrl = (baseFromArg || baseFromEnv || `http://localhost:${port}`).trim();
const triggerToken = getFlagValue("--token") ?? process.env.BUYBACK_TRIGGER_TOKEN ?? "";

const requestJson = async (url, init) => {
  const response = await fetch(url, init);
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: response.ok, status: response.status, data };
};

const statusUrl = new URL("/api/frogx/buyback", baseUrl).toString();
const executeUrl = new URL("/api/frogx/buyback/execute", baseUrl).toString();

console.log(`[smoke-buyback] GET ${statusUrl}`);
const status = await requestJson(statusUrl);
console.log(`[smoke-buyback] status=${status.status}`, status.data);

if (hasFlag("--execute")) {
  const headers = {};
  if (triggerToken) {
    headers.Authorization = `Bearer ${triggerToken}`;
  }
  console.log(`[smoke-buyback] POST ${executeUrl}`);
  const execute = await requestJson(executeUrl, { method: "POST", headers });
  console.log(`[smoke-buyback] execute=${execute.status}`, execute.data);

  console.log(`[smoke-buyback] GET ${statusUrl}`);
  const postStatus = await requestJson(statusUrl);
  console.log(`[smoke-buyback] status=${postStatus.status}`, postStatus.data);
}
