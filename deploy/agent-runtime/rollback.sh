#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(readlink -f "${1:?app root required}")"
TARGET_RELEASE="$(readlink -f "${2:?rollback release required}")"
RELEASES_ROOT="$(readlink -f "$APP_ROOT/releases")"
ARTIFACT_DIR="$APP_ROOT/shared/agent-artifacts"

case "$TARGET_RELEASE/" in
  "$RELEASES_ROOT"/*) ;;
  *) echo "rollback release must be inside $RELEASES_ROOT" >&2; exit 1 ;;
esac

mkdir -p "$ARTIFACT_DIR"
export AGENT_ARTIFACT_DIR="$ARTIFACT_DIR"
export AGENT_WORKER_PAUSE_CLAIMS=1
pm2 restart zhiyuan-agent-worker --update-env
sleep 5

rm -f "$APP_ROOT/current.next"
ln -s "$TARGET_RELEASE" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"
unset AGENT_WORKER_PAUSE_CLAIMS
pm2 startOrReload "$APP_ROOT/current/ecosystem.config.cjs" --update-env
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/api/health >/dev/null
pm2 save
