#!/usr/bin/env bash
set -euo pipefail

REPO="/Users/anthonirivera/dev/yomiru"
LOG_DIR="$HOME/Library/Logs"
LOCK="/tmp/yomiru-capibara.lock"

mkdir -p "$LOG_DIR"

if [ -e "$LOCK" ] && kill -0 "$(cat "$LOCK")" 2>/dev/null; then
  echo "[$(date -u +%FT%TZ)] already running pid=$(cat "$LOCK"), skip" >> "$LOG_DIR/yomiru-capibara.log"
  exit 0
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

cd "$REPO"

export PATH="/opt/homebrew/bin:/usr/local/bin:/Users/anthonirivera/.nvm/versions/node/v20.12.2/bin:$PATH"

if ! ping -c1 -W2000 capibaratraductor.com >/dev/null 2>&1; then
  echo "[$(date -u +%FT%TZ)] no network, skip" >> "$LOG_DIR/yomiru-capibara.log"
  exit 0
fi

{
  echo "==== $(date -u +%FT%TZ) match ===="
  npx tsx tools/match-capibara.ts
  echo "==== $(date -u +%FT%TZ) ingest ===="
  npx tsx tools/ingest-capibara-extra.ts
  echo "==== $(date -u +%FT%TZ) update matched ===="
  npx tsx tools/update-capibara-matched.ts
  echo "==== $(date -u +%FT%TZ) done ===="
} >> "$LOG_DIR/yomiru-capibara.log" 2>&1
