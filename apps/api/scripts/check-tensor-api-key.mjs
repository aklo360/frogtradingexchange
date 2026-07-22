#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const DEFAULT_TENSOR_API_BASE_URL = "https://api.mainnet.tensordev.io/api/v1";
const DEFAULT_TENSOR_COLLECTION_SLUG = "sbf";

const readStdin = async () => {
  if (process.stdin.isTTY) return "";
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input.trim();
};

const apiKey = process.env.TENSOR_API_KEY?.trim() || (await readStdin());
const baseUrl = (
  process.env.TENSOR_API_BASE_URL?.trim() || DEFAULT_TENSOR_API_BASE_URL
).replace(/\/+$/, "");
const collectionSlug =
  process.env.TENSOR_COLLECTION_SLUG?.trim() || DEFAULT_TENSOR_COLLECTION_SLUG;

const url = new URL(`${baseUrl}/collections`);
url.searchParams.set("sortBy", "slugDisplay:asc");
url.searchParams.set("limit", "1");
url.searchParams.append("slugDisplays", collectionSlug);

if (!apiKey) {
  console.error(
    "TENSOR_API_KEY is not set and no key was provided on stdin. Refusing to run without a key.",
  );
  process.exit(2);
}

try {
  const { status, text } = await fetchTensor(url, apiKey);

  if (status < 200 || status >= 300) {
    console.error(`Tensor API key rejected: HTTP ${status}`);
    if (text) console.error(text.slice(0, 240));
    process.exit(1);
  }

  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  const collections = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.collections)
      ? payload.collections
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.results)
          ? payload.results
          : [];
  const first = collections[0] || {};

  console.log("Tensor API key accepted.");
  console.log(
    JSON.stringify(
      {
        endpoint: url.toString(),
        status,
        collectionSlug,
        collection: {
          id: first.id || first.collId || first.uuid || null,
          slugDisplay: first.slugDisplay || first.slug || null,
          name: first.name || first.nameDisplay || first.title || null,
        },
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("Tensor API check failed before receiving a response.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function fetchTensor(url, apiKey) {
  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "x-tensor-api-key": apiKey,
      },
    });
    return { status: response.status, text: await response.text() };
  } catch (error) {
    const curlResult = fetchTensorWithCurl(url, apiKey);
    if (curlResult) return curlResult;
    throw error;
  }
}

function fetchTensorWithCurl(url, apiKey) {
  const config = [
    `url = "${escapeCurlConfig(url.toString())}"`,
    'header = "Accept: application/json"',
    `header = "x-tensor-api-key: ${escapeCurlConfig(apiKey)}"`,
    "silent",
    "show-error",
    'write-out = "\\n__HTTP_STATUS__:%{http_code}"',
    "",
  ].join("\n");
  const result = spawnSync("curl", ["-K", "-"], {
    input: config,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status === null) return null;
  const output = result.stdout || "";
  const match = output.match(/\n__HTTP_STATUS__:(\d{3})\s*$/);
  if (!match) return null;
  const text = output.slice(0, match.index).trim();
  return {
    status: Number(match[1]),
    text: text || (result.stderr || "").trim(),
  };
}

function escapeCurlConfig(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
