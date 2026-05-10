#!/usr/bin/env bash
set -euo pipefail

PLIST="$HOME/Library/LaunchAgents/com.yomiru.capibara.plist"
LABEL="com.yomiru.capibara"
UID_NUM="$(id -u)"
DOMAIN="gui/$UID_NUM"
LOG="$HOME/Library/Logs/yomiru-capibara.log"

case "${1:-}" in
  start)
    launchctl bootstrap "$DOMAIN" "$PLIST" 2>/dev/null || launchctl enable "$DOMAIN/$LABEL"
    launchctl kickstart -k "$DOMAIN/$LABEL"
    echo "started"
    ;;
  stop|pause)
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    echo "stopped"
    ;;
  status)
    launchctl print "$DOMAIN/$LABEL" 2>/dev/null | grep -E "state|last exit|pid" || echo "not loaded"
    ;;
  run)
    bash "$(dirname "$0")/sync-capibara.sh"
    ;;
  logs)
    tail -f "$LOG"
    ;;
  *)
    echo "usage: $0 {start|stop|status|run|logs}"
    exit 1
    ;;
esac
