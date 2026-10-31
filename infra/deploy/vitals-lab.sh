#!/usr/bin/env bash
# S11 · PR 234 — the monthly lab measurement of the shop's speed, on the VM (vitals-monthly.yml): the home, a category
# and a product page on a phone over slow 4G, and an admin page on a desktop as the read-only check account
# (tools/vitals-lab.mjs, through Cloudflare with the preview login). The result goes to state/vitals-lab.json; the
# admin (Website → SEO "Real visitors' speed", Server → Speed) reads it, judges it against `seo.vitals.targets` and
# keeps each run once as SpeedMeasurement rows (source "lab").
#   sudo infra/deploy/vitals-lab.sh [<commit sha>]
# The check account gets a fresh password and two-step seed the same way as the smoke test (smoke.sh); they stay in a
# root-only temporary file and are gone when this ends. Exit 0 = the run finished (missing a target is not a failure:
# the admin shows it in red).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
CONF="${EXTAS_CONFIG_FILE:-/etc/extas/server.conf}"
# shellcheck source=../config/server.conf
. "$CONF"
SHA="${1:-}"
R="$EXTAS_ROOT"; SEC="$R/config/secrets"; STATE="$R/state"
IMG="extas-smoke:$SMOKE_PLAYWRIGHT_VERSION"
log() { echo "[vitals-lab $(date +%H:%M:%S)] $*"; }

work="$(mktemp -d "$SEC/.vitals.XXXXXX")"
trap 'rm -rf "$work"' EXIT
mkdir -p "$STATE"

mig="$(jq -r '.migrate // empty' "$STATE/last-good-deploy.json" 2>/dev/null || true)"
if [ -z "$mig" ] || ! docker image inspect "$mig" >/dev/null 2>&1; then
  mig="$(docker images --format '{{.Repository}}:{{.Tag}}' extas-migrate | head -n 1 || true)"
fi
[ -n "$mig" ] || { log "FAIL: no migrate image on this server (deploy first)"; exit 1; }

log "check account (read-only, fresh password and two-step seed)"
grep -E '^(DATABASE_DIRECT_URL|VAULT_MASTER_KEY)=' "$SEC/app.env" > "$work/db.env"
mkdir -m 0700 "$work/acct"
chown "${SMOKE_IMAGE_UID:-1000}:${SMOKE_IMAGE_UID:-1000}" "$work/acct"
docker run --rm --name "extas-check-$$" --network extas --env-file "$work/db.env" -v "$work/acct:/out" \
  -e SMOKE_CHECK_EMAIL="$SMOKE_CHECK_EMAIL" -e SMOKE_CHECK_NAME="$SMOKE_CHECK_NAME" "$mig" \
  sh -c 'cd /repo/packages/auth && exec ./node_modules/.bin/tsx src/cli.ts check-account --email "$SMOKE_CHECK_EMAIL" --name "$SMOKE_CHECK_NAME" --write-to /out/check.env'
[ -s "$work/acct/check.env" ] || { log "FAIL: the check account could not be prepared"; exit 1; }
{
  cat "$work/acct/check.env"
  echo "SMOKE_HTTP_USER=$EXTAS_STAGING_USER"
  echo "SMOKE_HTTP_PASSWORD=$(grep '^STAGING_PASSWORD=' "$SEC/staging.env" | cut -d= -f2-)"
} > "$work/lab.env"
rm -f "$work/acct/check.env"

if ! docker image inspect "$IMG" >/dev/null 2>&1; then
  log "building the browser image $IMG (once)"
  docker build -q -f "$HERE/smoke.Dockerfile" --build-arg PLAYWRIGHT_VERSION="$SMOKE_PLAYWRIGHT_VERSION" -t "$IMG" "$HERE" >/dev/null
fi

log "measuring https://$EXTAS_STAGING_HOST"
mkdir -m 0777 "$work/out"
at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
timeout "$((SMOKE_TIMEOUT_MIN * 60))" docker run --rm --name "extas-vitals-$$" --ipc=host --env-file "$work/lab.env" \
  -e BASE="https://$EXTAS_STAGING_HOST" -e LAB_OUT=/out/vitals-lab.json -e LAB_AT="$at" -e LAB_SHA="${SHA:0:12}" \
  -v "$REPO/tools:/w/tools:ro" -v "$work/out:/out" \
  "$IMG" node /w/tools/vitals-lab.mjs >/dev/null
jq -e '.pages | length > 0' "$work/out/vitals-lab.json" >/dev/null || { log "FAIL: no page was measured"; exit 1; }
cp "$work/out/vitals-lab.json" "$STATE/vitals-lab.json.tmp"
chmod 0644 "$STATE/vitals-lab.json.tmp" && mv "$STATE/vitals-lab.json.tmp" "$STATE/vitals-lab.json"
log "$(jq -r '[.pages[] | "\(.kind) LCP \(.lcpMs // "-") ms, \(.kb // "-") KB"] | join("; ")' "$STATE/vitals-lab.json")"
