#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const allowedSecrets = new Set([
  "PRIVY_APP_SECRET",
  "PRIVY_SIGNER_ID",
  "PRIVY_AUTHORIZATION_PRIVATE_KEY",
  "PRIVY_POLICY_IDS",
]);

const args = process.argv.slice(2);
const secretName = args.find((arg) => !arg.startsWith("--"));
const dryRun = args.includes("--dry-run");
const source =
  readOption("--source") ??
  (args.includes("--stdin") ? "stdin" : null) ??
  (args.includes("--env") ? "env" : null) ??
  "clipboard";

if (!secretName || !allowedSecrets.has(secretName)) {
  fail(
    `Usage: pnpm --filter @frogx/api run secret:put -- <${[...allowedSecrets].join("|")}> [--source=clipboard|stdin|env]`,
  );
}

if (!["clipboard", "stdin", "env"].includes(source)) {
  fail("--source must be clipboard, stdin, or env");
}

const value = readSecretValue(source, secretName);
if (!value.trim()) {
  fail(`${secretName} value is empty from ${source}`);
}

if (dryRun) {
  console.log(`Validated non-empty value for Cloudflare Worker secret ${secretName}.`);
  process.exit(0);
}

const result = spawnSync(
  "pnpm",
  ["exec", "wrangler", "secret", "put", secretName],
  {
    input: value,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  },
);

if (result.error || result.status !== 0) {
  const reason = firstLine(result.stderr || result.stdout || result.error?.message);
  fail(`Failed to set ${secretName}${reason ? `: ${reason}` : ""}`);
}

console.log(`Set Cloudflare Worker secret ${secretName}.`);

function readOption(name) {
  const prefix = `${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function readSecretValue(selectedSource, name) {
  if (selectedSource === "env") {
    return process.env[name] ?? "";
  }

  if (selectedSource === "stdin") {
    try {
      return readFileSync(0, "utf8");
    } catch {
      return "";
    }
  }

  const result = spawnSync("pbpaste", [], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    fail("Unable to read clipboard with pbpaste");
  }
  return result.stdout;
}

function firstLine(value) {
  return String(value || "").split(/\r?\n/).find(Boolean)?.slice(0, 240) || "";
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
