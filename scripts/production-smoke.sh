#!/usr/bin/env bash
# production:smoke — guided smoke checklist. Does NOT auto-book by default.
# Usage: APP_BASE_URL=https://your.app npm run production:smoke
set -euo pipefail

BASE="${APP_BASE_URL:-http://127.0.0.1:3000}"
BASE="${BASE%/}"

echo "=== Production smoke (safe checks only) ==="
echo "Base URL: ${BASE}"
echo ""
echo "WARNING: Do not book/cancel real patient appointments without a dedicated test patient."
echo "Full manual scenarios: docs/TESTING.md (Production smoke section)."
echo ""

npm run production:check

echo ""
echo "Next manual steps (you run these with a test token):"
echo "  1) POST ${BASE}/v1/conversations"
echo "  2) Anonymous chat: doctor search in Arabic (عايز دكتور قلب)"
echo "  3) Bearer enroll for a TEST phone only"
echo "  4) Availability + book on TEST calendar/patient only"
echo "  5) Confirm rows in Postgres; confirm Opik if enabled"
echo "  6) Confirm /ready still OK after Redis/Qdrant checks"
echo ""
echo "Automated suites:"
echo "  npm test"
echo "  npm run test:integration"
echo "  LIVE_EMBEDDINGS=1 npm run test:embeddings   # needs API key"
echo ""
echo "Safe smoke preamble finished."
