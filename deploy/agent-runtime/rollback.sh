#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(readlink -f "${1:?app root required}")"
TARGET_RELEASE="$(readlink -f "${2:?rollback release required}")"
RELEASES_ROOT="$(readlink -f "$APP_ROOT/releases")"
ARTIFACT_DIR="$APP_ROOT/shared/agent-artifacts"

delete_pm2_process() {
  local process_name="$1"
  local process_pid
  if timeout --signal=TERM --kill-after=5s 15s pm2 delete "$process_name" >/dev/null 2>&1; then
    return
  fi
  process_pid="$(pm2 pid "$process_name" 2>/dev/null | tail -n 1 || true)"
  if [[ "$process_pid" =~ ^[0-9]+$ ]] && (( process_pid > 1 )); then
    kill -KILL "$process_pid" >/dev/null 2>&1 || true
  fi
  timeout --signal=TERM --kill-after=5s 10s pm2 delete "$process_name" >/dev/null 2>&1 || true
}

replace_pm2_runtime() {
  local process_name
  for process_name in zhiyuan-web zhiyuan-job-assistant zhiyuan-agent-worker; do
    delete_pm2_process "$process_name"
  done
  pm2 start "$APP_ROOT/current/ecosystem.config.cjs" --update-env
}

case "$TARGET_RELEASE/" in
  "$RELEASES_ROOT"/*) ;;
  *) echo "rollback release must be inside $RELEASES_ROOT" >&2; exit 1 ;;
esac

mkdir -p "$ARTIFACT_DIR"
export AGENT_ARTIFACT_DIR="$ARTIFACT_DIR"
if pm2 describe zhiyuan-agent-worker >/dev/null 2>&1; then
  export AGENT_WORKER_PAUSE_CLAIMS=1
  pm2 restart zhiyuan-agent-worker --update-env
  sleep 5
  unset AGENT_WORKER_PAUSE_CLAIMS
fi

rm -f "$APP_ROOT/current.next"
ln -s "$TARGET_RELEASE" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"
replace_pm2_runtime
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3100/login >/dev/null
pm2 save
