#!/usr/bin/env bash
# Start a Cloudflare quick tunnel to the local app and print .env lines for Twilio + OpenRouter.
#
# Usage:
#   npm run local:tunnel
#   PORT=3000 npm run local:tunnel
#
# Requires: cloudflared (brew install cloudflare/cloudflare/cloudflared)
# Keep this terminal open while testing Twilio. Ctrl+C stops the tunnel.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-}"
if [[ -z "$PORT" && -f .env ]]; then
  PORT="$(grep -E '^PORT=' .env | tail -1 | cut -d= -f2- | tr -d '\r' || true)"
fi
PORT="${PORT:-3000}"

LOCAL_URL="http://127.0.0.1:${PORT}"
LOG="$(mktemp -t clinic-voice-ai-cloudflared.XXXXXX)"
trap 'rm -f "$LOG"' EXIT

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not found." >&2
  echo "Install: brew install cloudflare/cloudflare/cloudflared" >&2
  exit 1
fi

print_env_block() {
  local base="${1%/}"
  local host="${base#https://}"
  cat <<EOF

══════════════════════════════════════════════════════════════
 Paste into .env (then restart: npm start)
══════════════════════════════════════════════════════════════
PUBLIC_BASE_URL=${base}
OPENROUTER_HTTP_REFERER=${base}
TWILIO_VOICE_WEBHOOK_URL=${base}/v1/twilio/voice
TWILIO_MEDIA_STREAM_WS_URL=wss://${host}/v1/twilio/media
ENABLE_TWILIO=true

 Twilio voice webhook: ${base}/v1/twilio/voice
 Test console:         ${base}/test-console/
 Local app:            ${LOCAL_URL}
══════════════════════════════════════════════════════════════
Tunnel running — Ctrl+C to stop (URL changes on next run)

EOF
}

ENV_PRINTED=0
(
  while true; do
    if [[ "$ENV_PRINTED" -eq 0 ]]; then
      url="$(
        grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$LOG" 2>/dev/null | head -1 || true
      )"
      if [[ -n "$url" ]]; then
        ENV_PRINTED=1
        print_env_block "$url"
      fi
    fi
    sleep 1
  done
) &
MONITOR_PID=$!
trap 'kill "$MONITOR_PID" 2>/dev/null || true; rm -f "$LOG"' EXIT

echo "Starting cloudflared → ${LOCAL_URL}"
echo "Ensure the app is running: npm start (in another terminal)"
echo ""

if ! cloudflared tunnel --url "$LOCAL_URL" 2>&1 | tee "$LOG"; then
  kill "$MONITOR_PID" 2>/dev/null || true
  if [[ "$ENV_PRINTED" -eq 0 ]]; then
    echo "Tunnel exited before a public URL appeared. Last cloudflared output:" >&2
    cat "$LOG" >&2
  fi
  exit 1
fi

kill "$MONITOR_PID" 2>/dev/null || true
