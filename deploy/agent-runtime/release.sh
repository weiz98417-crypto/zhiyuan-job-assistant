#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(readlink -f "${1:?app root required}")"
RELEASE_DIR="$(readlink -f "${2:?release directory required}")"
RELEASES_ROOT="$(readlink -f "$APP_ROOT/releases")"
ARTIFACT_DIR="$APP_ROOT/shared/agent-artifacts"

case "$RELEASE_DIR/" in
  "$RELEASES_ROOT"/*) ;;
  *) echo "release must be inside $RELEASES_ROOT" >&2; exit 1 ;;
esac

mkdir -p "$ARTIFACT_DIR"
export AGENT_ARTIFACT_DIR="$ARTIFACT_DIR"

cd "$RELEASE_DIR"
npm ci
npm run build:production
npm run backup:postgres
npm run check:agent-runtime

rm -f "$APP_ROOT/current.next"
ln -s "$RELEASE_DIR" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"
pm2 startOrReload "$APP_ROOT/current/ecosystem.config.cjs" --update-env
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/api/health >/dev/null
pm2 save
