#!/usr/bin/env node
import dns from "node:dns";
import { spawnSync } from "node:child_process";

dns.setDefaultResultOrder("ipv4first");

const DEFAULT_FROGX_API_ORIGIN = "https://frogtrading.exchange";

const args = new Set(process.argv.slice(2));
const strict = args.has("--strict");
const jsonOnly = args.has("--json");
const probeTelegram = args.has("--telegram-probe");
const inspectCloudflareSecrets = args.has("--cloudflare-secrets");
const origin = (
  process.env.FROGX_API_ORIGIN?.trim() || DEFAULT_FROGX_API_ORIGIN
).replace(/\/+$/, "");

const requiredWorkerSecrets = [
  { name: "FROGX_BOT_API_TOKEN", purpose: "Ribbot bearer auth" },
  { name: "PRIVY_APP_SECRET", purpose: "Privy user lookup/create" },
  { name: "PRIVY_SIGNER_ID", purpose: "delegated Telegram wallet creation" },
  {
    name: "PRIVY_AUTHORIZATION_PRIVATE_KEY",
    purpose: "server-authorized Telegram execution",
  },
  { name: "ME_API_KEY", purpose: "Magic Eden floor/buy routing" },
];

const optionalWorkerSecrets = [
  { name: "PRIVY_POLICY_IDS", purpose: "delegated wallet policy override" },
];

const checks = [
  {
    key: "accountModeEnabled",
    label: "Account mode enabled",
    read: (body) => body.accountModeEnabled === true,
  },
  {
    key: "accountCreation.anySurfaceEnabled",
    label: "FTX or Telegram account creation enabled",
    read: readAnyAccountCreationSurfaceEnabled,
  },
  {
    key: "accountCreation.ftxWebEnabled",
    label: "FTX web account creation enabled",
    required: false,
    read: readFtxWebAccountCreationEnabled,
  },
  {
    key: "bot.apiAuthConfigured",
    label: "Ribbot API auth configured",
    required: false,
    read: (body) => body.bot?.apiAuthConfigured === true,
  },
  {
    key: "privy.configured",
    label: "Privy app id configured",
    read: (body) => body.privy?.configured === true,
  },
  {
    key: "privy.jwksConfigured",
    label: "Privy JWKS configured",
    read: (body) => body.privy?.jwksConfigured === true,
  },
  {
    key: "privy.appSecretConfigured",
    label: "Privy app secret configured",
    required: false,
    read: (body) => body.privy?.appSecretConfigured === true,
  },
  {
    key: "privy.signerConfigured",
    label: "Privy authorization signer configured",
    required: false,
    read: (body) => body.privy?.signerConfigured === true,
  },
  {
    key: "privy.signerIdConfigured",
    label: "Privy delegated wallet signer id configured",
    required: false,
    read: (body) => body.privy?.signerIdConfigured === true,
  },
  {
    key: "accountCreation.telegramBotEnabled",
    label: "Telegram bot account creation enabled",
    required: false,
    read: (body) =>
      body.accountCreation?.telegramBotEnabled === true ||
      body.privy?.telegramBotAccountCreationEnabled === true,
  },
  {
    key: "bot.tradingEnabled",
    label: "Ribbot trading enabled",
    read: (body) => body.bot?.tradingEnabled === true,
  },
  {
    key: "bot.executionEnabled",
    label: "Ribbot Telegram execution enabled",
    read: (body) => body.bot?.executionEnabled === true,
  },
  {
    key: "nftPurchases.telegramButtonExecutionEnabled",
    label: "NFT Telegram approval buttons execute",
    read: (body) =>
      body.nftPurchases?.telegramButtonExecutionEnabled === true &&
      body.nftPurchases?.telegramButtonExecutesTrades === true,
  },
  {
    key: "safety.telegramTextExecutesTrades",
    label: "Telegram text does not execute trades",
    read: (body) => body.nftPurchases?.telegramTextExecutesTrades === false,
  },
  {
    key: "safety.externalWalletsVerificationOnly",
    label: "External wallets remain verification-only for Ribbot",
    read: (body) => body.safety?.linkedExternalWalletsTradeableByBot === false,
  },
];

try {
  const url = `${origin}/api/frogx/account/config`;
  const { status, text } = await fetchJsonText(url);
  const body = JSON.parse(text);
  const results = checks.map((check) => ({
    key: check.key,
    label: check.label,
    required: check.required !== false,
    ok: Boolean(check.read(body)),
  }));
  const missing = results.filter((result) => result.required && !result.ok);
  const telegramSetupMissing =
    body.accountCreation?.telegramSetupMissing ??
    deriveTelegramSetupMissing(Object.fromEntries(
      results.map((result) => [result.key, result.ok]),
    ));
  const telegramProbe = probeTelegram
    ? await runTelegramSetupProbe(origin)
    : null;
  const cloudflareSecrets = inspectCloudflareSecrets
    ? runCloudflareSecretNameCheck()
    : null;
  const configReady = status === 200 && missing.length === 0;
  const payload = {
    origin,
    status,
    ready:
      configReady &&
      (!telegramProbe || telegramProbe.ready === true) &&
      (!cloudflareSecrets || cloudflareSecrets.ready === true),
    missing: missing.map((result) => result.key),
    telegramSetupMissing,
    telegramProbe,
    cloudflareSecrets,
    checks: results,
  };

  if (jsonOnly) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`FrogX account readiness: ${payload.ready ? "ready" : "not ready"}`);
    console.log(`Origin: ${origin}`);
    for (const result of results) {
      const marker = result.ok ? "PASS" : result.required ? "MISS" : "INFO";
      console.log(`${marker} ${result.label}`);
    }
    if (missing.length) {
      console.log(`Missing gates: ${missing.map((result) => result.key).join(", ")}`);
    }
    const telegramSetupMissing = payload.telegramSetupMissing;
    if (
      telegramSetupMissing &&
      typeof telegramSetupMissing === "object" &&
      Object.keys(telegramSetupMissing).length
    ) {
      console.log(
        `Telegram setup missing: ${Object.keys(telegramSetupMissing).join(", ")}`,
      );
    }
    if (telegramProbe) {
      if (telegramProbe.skipped) {
        console.log(`Telegram probe skipped: ${telegramProbe.reason}`);
      } else {
        console.log(
          `Telegram probe: ${telegramProbe.ready ? "ready" : "not ready"} status=${telegramProbe.status}`,
        );
      }
    }
    if (cloudflareSecrets) {
      if (cloudflareSecrets.error) {
        console.log(`Cloudflare secret metadata check failed: ${cloudflareSecrets.error}`);
      } else {
        console.log(
          `Cloudflare secret metadata: ${cloudflareSecrets.ready ? "ready" : "not ready"}`,
        );
        if (cloudflareSecrets.missingRequired.length) {
          console.log(
            `Missing Worker secrets: ${cloudflareSecrets.missingRequired.join(", ")}`,
          );
        }
        if (cloudflareSecrets.missingOptional.length) {
          console.log(
            `Optional Worker secrets not set: ${cloudflareSecrets.missingOptional.join(", ")}`,
          );
        }
      }
    }
  }

  if (strict && !payload.ready) {
    process.exit(1);
  }
} catch (error) {
  console.error("FrogX account readiness check failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function runTelegramSetupProbe(origin) {
  const token = process.env.FROGX_BOT_API_TOKEN?.trim();
  if (!token) {
    return {
      skipped: true,
      reason: "FROGX_BOT_API_TOKEN env is not set",
    };
  }
  const url = `${origin}/api/frogx/account/telegram/probe`;
  const { status, text } = await fetchJsonText(url, {
    method: "POST",
    allowCurlFallback: false,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
    },
  });
  const body = JSON.parse(text);
  return {
    skipped: false,
    status,
    ready: status === 200 && body?.ready === true && body?.mutates === false,
    mutates: body?.mutates === true,
    missing: body?.missing ?? null,
    error: typeof body?.error === "string" ? body.error : undefined,
  };
}

function runCloudflareSecretNameCheck() {
  const result = spawnSync("pnpm", ["exec", "wrangler", "secret", "list"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status === null || result.status !== 0) {
    return buildCloudflareSecretFailure(
      firstLine(result.stderr || result.stdout || result.error?.message),
    );
  }

  let list;
  try {
    list = JSON.parse(result.stdout);
  } catch {
    return buildCloudflareSecretFailure("Unable to parse wrangler secret list output");
  }

  const names = new Set(
    Array.isArray(list)
      ? list.map((entry) => (typeof entry?.name === "string" ? entry.name : ""))
      : [],
  );
  const required = requiredWorkerSecrets.map((secret) => ({
    name: secret.name,
    purpose: secret.purpose,
    ok: names.has(secret.name),
  }));
  const optional = optionalWorkerSecrets.map((secret) => ({
    name: secret.name,
    purpose: secret.purpose,
    ok: names.has(secret.name),
  }));
  return {
    ready: required.every((secret) => secret.ok),
    required,
    missingRequired: required
      .filter((secret) => !secret.ok)
      .map((secret) => secret.name),
    optional,
    missingOptional: optional
      .filter((secret) => !secret.ok)
      .map((secret) => secret.name),
  };
}

function buildCloudflareSecretFailure(error) {
  return {
    ready: false,
    error,
    required: requiredWorkerSecrets.map((secret) => ({
      name: secret.name,
      purpose: secret.purpose,
      ok: false,
    })),
    missingRequired: requiredWorkerSecrets.map((secret) => secret.name),
    optional: optionalWorkerSecrets.map((secret) => ({
      name: secret.name,
      purpose: secret.purpose,
      ok: false,
    })),
    missingOptional: optionalWorkerSecrets.map((secret) => secret.name),
  };
}

function firstLine(value) {
  return String(value || "").split(/\r?\n/).find(Boolean)?.slice(0, 240) || "";
}

function hasAccountCreationConfig(body) {
  return Boolean(body.accountCreation && typeof body.accountCreation === "object");
}

function readAnyAccountCreationSurfaceEnabled(body) {
  if (hasAccountCreationConfig(body)) {
    return (
      body.accountCreation?.ftxWebEnabled === true ||
      body.accountCreation?.telegramBotEnabled === true
    );
  }
  return body.accountModeEnabled === true && body.privy?.configured === true;
}

function readFtxWebAccountCreationEnabled(body) {
  if (hasAccountCreationConfig(body)) {
    return body.accountCreation?.ftxWebEnabled === true;
  }
  return body.accountModeEnabled === true && body.privy?.configured === true;
}

async function fetchJsonText(url, init = {}) {
  const { allowCurlFallback = true, headers: initHeaders, ...fetchInit } = init;
  try {
    const response = await fetch(url, {
      ...fetchInit,
      headers: { accept: "application/json", ...initHeaders },
    });
    return { status: response.status, text: await response.text() };
  } catch (error) {
    const curlResult = allowCurlFallback ? fetchJsonTextWithCurl(url) : null;
    if (curlResult) return curlResult;
    throw error;
  }
}

function fetchJsonTextWithCurl(url) {
  const result = spawnSync(
    "curl",
    [
      "-sS",
      "-H",
      "Accept: application/json",
      "-w",
      "\n__HTTP_STATUS__:%{http_code}",
      url,
    ],
    {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.error || result.status === null || result.status !== 0) {
    return null;
  }
  const output = result.stdout || "";
  const match = output.match(/\n__HTTP_STATUS__:(\d{3})\s*$/);
  if (!match) return null;
  return {
    status: Number(match[1]),
    text: output.slice(0, match.index).trim(),
  };
}

function deriveTelegramSetupMissing(resultMap) {
  const missing = {};
  if (resultMap.accountModeEnabled === false) {
    missing.accountModeEnabled = false;
  }
  if (resultMap["bot.apiAuthConfigured"] === false) {
    missing.botApiAuthConfigured = false;
  }
  if (resultMap["privy.appSecretConfigured"] === false) {
    missing.privyAppCredentialsConfigured = false;
  }
  if (resultMap["privy.signerIdConfigured"] === false) {
    missing.privySignerIdConfigured = false;
  }
  return missing;
}
