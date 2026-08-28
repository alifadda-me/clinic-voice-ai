#!/usr/bin/env bash
# production:check — verify liveness + readiness on a running app.
# Usage: APP_BASE_URL=https://your.app npm run production:check
set -euo pipefail

BASE="${APP_BASE_URL:-http://127.0.0.1:3000}"
BASE="${BASE%/}"

echo "Checking ${BASE}/health ..."
HEALTH="$(curl -sS -w '\n%{http_code}' "${BASE}/health")"
HEALTH_BODY="$(echo "$HEALTH" | sed '$d')"
HEALTH_CODE="$(echo "$HEALTH" | tail -n1)"
echo "$HEALTH_BODY"
if [[ "$HEALTH_CODE" != "200" ]]; then
  echo "FAIL: /health returned HTTP ${HEALTH_CODE}" >&2
  exit 1
fi

echo "Checking ${BASE}/ready ..."
READY="$(curl -sS -w '\n%{http_code}' "${BASE}/ready")"
READY_BODY="$(echo "$READY" | sed '$d')"
READY_CODE="$(echo "$READY" | tail -n1)"
echo "$READY_BODY"
if [[ "$READY_CODE" != "200" ]]; then
  echo "FAIL: /ready returned HTTP ${READY_CODE}" >&2
  exit 1
fi

echo "OK: health and readiness passed."
