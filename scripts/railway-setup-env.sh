#!/usr/bin/env bash
#
# One-shot Railway environment setup for the Elbakri portal.
#
# Sets every variable the app needs on the currently linked Railway service,
# generating the JWT secrets on first run. Safe to re-run: existing values are
# left alone unless --rotate-secrets is passed, so a second run never silently
# invalidates everyone's login sessions.
#
# Usage:
#   npm i -g @railway/cli
#   railway login
#   railway link                      # pick the project, then the APP service
#   ./scripts/railway-setup-env.sh
#
# Options:
#   --postgres-service NAME   Name of the Postgres service (default: Postgres)
#   --rotate-secrets          Regenerate JWT_SECRET / REFRESH_TOKEN_SECRET even
#                             if they are already set. Logs every user out.
#   --no-volume-vars          Skip UPLOAD_DIR / PRIVATE_UPLOAD_DIR / PDF_DIR
#                             (only if you have not attached a Volume yet).
#   --volume-mount PATH       Volume mount path (default: /data)

set -euo pipefail

PG_SERVICE="Postgres"
ROTATE=0
SET_VOLUME_VARS=1
VOLUME_MOUNT="/data"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --postgres-service) PG_SERVICE="$2"; shift 2 ;;
    --rotate-secrets)   ROTATE=1; shift ;;
    --no-volume-vars)   SET_VOLUME_VARS=0; shift ;;
    --volume-mount)     VOLUME_MOUNT="$2"; shift 2 ;;
    -h|--help)          sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if ! command -v railway >/dev/null 2>&1; then
  echo "❌ Railway CLI not found. Install it first:" >&2
  echo "   npm i -g @railway/cli && railway login && railway link" >&2
  exit 1
fi

if ! railway status >/dev/null 2>&1; then
  echo "❌ This directory is not linked to a Railway service." >&2
  echo "   Run: railway link   (choose the project, then the APP service — not Postgres)" >&2
  exit 1
fi

echo "▸ Linked service:"
railway status || true
echo

# Current variables, so an existing secret is never overwritten by accident.
EXISTING="$(railway variables --kv 2>/dev/null || railway variables 2>/dev/null || true)"

has_var() { grep -qE "^${1}=" <<<"$EXISTING"; }

gen_secret() { openssl rand -base64 48 | tr -d '\n'; }

ARGS=()
add() { ARGS+=(--set "$1=$2"); echo "   • $1"; }

echo "▸ Variables to set:"

# ── Database ────────────────────────────────────────────────────────────────
# A Railway reference variable: resolved at deploy time to the private-network
# URL, so it never leaves Railway's network and survives a credential rotation.
add "DATABASE_URL" "\${{ ${PG_SERVICE}.DATABASE_URL }}"

# ── Runtime ─────────────────────────────────────────────────────────────────
add "NODE_ENV" "production"
# Public origin AND the allowed CORS origin — must match the browser's URL.
add "BASE_URL" "https://\${{ RAILWAY_PUBLIC_DOMAIN }}"

# ── Auth secrets ────────────────────────────────────────────────────────────
# src/config/env.ts refuses to boot in production if these are missing, equal to
# each other, or still the .env.example placeholders.
if [[ $ROTATE -eq 1 ]] || ! has_var JWT_SECRET; then
  add "JWT_SECRET" "$(gen_secret)"
else
  echo "   · JWT_SECRET already set — kept (use --rotate-secrets to replace)"
fi

if [[ $ROTATE -eq 1 ]] || ! has_var REFRESH_TOKEN_SECRET; then
  add "REFRESH_TOKEN_SECRET" "$(gen_secret)"
else
  echo "   · REFRESH_TOKEN_SECRET already set — kept (use --rotate-secrets to replace)"
fi

add "JWT_EXPIRES_IN" "1h"
add "REFRESH_TOKEN_EXPIRES_IN" "30d"

# ── Persistent storage ──────────────────────────────────────────────────────
# The container filesystem is recreated on every deploy, so these must point
# inside an attached Volume or uploads and generated PDFs are lost on redeploy.
if [[ $SET_VOLUME_VARS -eq 1 ]]; then
  add "UPLOAD_DIR"         "${VOLUME_MOUNT}/uploads"
  add "PRIVATE_UPLOAD_DIR" "${VOLUME_MOUNT}/uploads-private"
  add "PDF_DIR"            "${VOLUME_MOUNT}/generated"
fi

echo
echo "▸ Applying…"
railway variables "${ARGS[@]}"

echo
echo "✅ Variables applied."
echo
echo "Still to do by hand in the Railway dashboard:"
if [[ $SET_VOLUME_VARS -eq 1 ]]; then
  echo "  1. Attach a Volume to this service, mount path: ${VOLUME_MOUNT}"
  echo "     (without it, every upload and generated PDF is wiped on the next deploy)"
fi
echo "  2. Settings → Networking → Generate Domain (BASE_URL resolves to it automatically)"
echo "  3. Redeploy, then check:  https://<your-domain>/api/health"
echo "                            https://<your-domain>/api/health?db=1"
echo "  4. Seed once:  railway run npm run db:seed"
echo "                 railway run npm run db:seed:mea"
echo "                 railway run npm run db:seed:hotels"
