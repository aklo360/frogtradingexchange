#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
WORKER_NAME="frogx-api"
PAGES_PROJECT="frogx-ui"
WORKER_CONFIG="${ROOT_DIR}/apps/api/wrangler.toml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo ".env not found at $ENV_FILE" >&2
  exit 1
fi

# Load .env robustly
set -o allexport
# shellcheck source=/dev/null
source "$ENV_FILE"
set +o allexport

# Secrets for the Worker
WORKER_SECRETS=(
  TITAN_TOKEN
  TAPESTRY_API_KEY
  SOLANA_RPC_URL
  SOLANA_WS_URL
)

# Plain vars for the Worker (non-sensitive)
WORKER_VARS=(
  TITAN_BASE_URL
  TITAN_WS_URL
  TITAN_REGION_ORDER
  QUOTE_FRESHNESS_SECONDS
  PLATFORM_FEE_ENABLED
  PLATFORM_FEE_BPS
  PLATFORM_FEE_RECIPIENT
  PLATFORM_FEE_SOL_ACCOUNT
  PLATFORM_FEE_USDC_ACCOUNT
  PLATFORM_FEE_USDT_ACCOUNT
)

# Secrets for Pages (edge runtime)
PAGES_SECRETS=(
  SOLANA_RPC_URL
  SOLANA_WS_URL
  TAPESTRY_API_KEY
)

# Plain vars for Pages (optional/client-safe)
PAGES_VARS=(
  API_ORIGIN
  NEXT_PUBLIC_SOLANA_RPC_URL
  NEXT_PUBLIC_SOLANA_WS_URL
  NEXT_PUBLIC_API_BASE_URL
)

put_secret() {
  local key=$1 target=$2
  local val=${!key-}
  if [[ -n "$val" ]]; then
    printf "%s" "$val" | wrangler secret put "$key" --name "$target"
  else
    echo "Skipping $key (empty)"
  fi
}

put_var() {
  local key=$1 target=$2
  local val=${!key-}
  if [[ -n "$val" ]]; then
    wrangler --config "$WORKER_CONFIG" deploy --name "$target" --var "$key=$val" --dry-run >/dev/null
  else
    echo "Skipping $key (empty)"
  fi
}

# Worker secrets
for k in "${WORKER_SECRETS[@]}"; do put_secret "$k" "$WORKER_NAME"; done

# Worker vars (non-secret). Uncomment to push via deploy if you prefer remote overrides.
# for k in "${WORKER_VARS[@]}"; do put_var "$k" "$WORKER_NAME"; done
echo "Skipping worker vars (covered by wrangler.toml; deploy with --var if overrides needed)."
# Pages secrets
for k in "${PAGES_SECRETS[@]}"; do
  val=${!k-}
  if [[ -n "$val" ]]; then
    printf "%s" "$val" | wrangler pages secret put "$k" --project-name "$PAGES_PROJECT"
  else
    echo "Skipping $k (empty)"
  fi
done

# Pages vars (plain)
for k in "${PAGES_VARS[@]}"; do
  echo "Skipping Pages var $k (set via dashboard or deploy-time --var if needed)"
done

echo "Done. Redeploy worker/UI to apply."
