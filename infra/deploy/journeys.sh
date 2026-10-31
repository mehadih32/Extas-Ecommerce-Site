#!/usr/bin/env bash
# S21 · PR 414 (B7.3) — the saved browser journeys against the preview host, on the VM (journeys.yml, every hour).
#   sudo infra/deploy/journeys.sh <out-dir> [due|now] [<commit sha>]
#   due  (the hourly check): runs only when a "Run now" press or the owner's schedule says so (journeys-lib.sh;
#        Reports › Site health → journeys-settings.env); otherwise it says "not due" and ends at once (exit 0).
#   now  (by hand from Actions): runs at once.
# 1. The read-only check account gets a fresh password and two-step seed, exactly as for the smoke test (smoke.sh);
#    they go to a root-only temporary file and are gone when this ends.
# 2. The browser image of the smoke test (extas-smoke:<SMOKE_PLAYWRIGHT_VERSION>) walks docs/qa/journeys.json
#    (tools/journeys.mjs): a customer signed out, then the admin, an accountant and the warehouse as the check account,
#    on a phone and a desktop screen, through Cloudflare with the preview login. The customer never puts anything in the
#    bag and never orders.
# 3. <out-dir> gets README.md, result.json and a picture of each failed step (journeys.yml commits them when a run
#    fails, or passes again after a failure); state/journeys.json gets the summary for Reports › Site health, and
#    state/journeys/<time>.json keeps each run for comparison (the newest JOURNEYS_KEEP).
# Exit 0 = every step passed, or nothing was due. No password, seed or connection string is printed or kept.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
CONF="${EXTAS_CONFIG_FILE:-/etc/extas/server.conf}"
# shellcheck source=../config/server.conf
. "$CONF"
# shellcheck source=journeys-lib.sh
. "$HERE/journeys-lib.sh"
OUT="${1:?usage: journeys.sh <out-dir> [due|now] [<commit sha>]}"
MODE="${2:-due}"
SHA="${3:-}"
R="$EXTAS_ROOT"; SEC="$R/config/secrets"; STATE="$R/state"
IMG="extas-smoke:$SMOKE_PLAYWRIGHT_VERSION"
log() { echo "[journeys $(date +%H:%M:%S)] $*"; }

# The owner's schedule wins over server.conf's defaults (written by extas-vault-sync; only KEY='value' lines).
if [ -f "$SEC/journeys-settings.env" ]; then
  # shellcheck disable=SC1091
  . "$SEC/journeys-settings.env"
fi
[[ "$JOURNEYS_KEEP" =~ ^[0-9]+$ ]] && [ "$JOURNEYS_KEEP" -ge 1 ] || JOURNEYS_KEEP=1

now="$(date +%s)"
last="$(stat -c %Y "$STATE/journeys.json" 2>/dev/null || echo 0)"
case "$MODE" in
  now) why="by hand" ;;
  due)
    if ! why="$(journeys_due "$now" "$last" "$EXTAS_TIMEZONE")"; then
      log "not due (schedule ${JOURNEYS_ON}/${JOURNEYS_EVERY})"
      exit 0
    fi ;;
  *) echo "usage: journeys.sh <out-dir> [due|now] [<commit sha>]" >&2; exit 2 ;;
esac

work="$(mktemp -d "$SEC/.journeys.XXXXXX")"
trap 'rm -rf "$work"' EXIT
mkdir -p "$OUT" "$STATE/journeys"

# The live version's migrate image holds the auth command (as in smoke.sh).
mig="$(jq -r '.migrate // empty' "$STATE/last-good-deploy.json" 2>/dev/null || true)"
if [ -z "$mig" ] || ! docker image inspect "$mig" >/dev/null 2>&1; then
  mig="$(docker images --format '{{.Repository}}:{{.Tag}}' extas-migrate | head -n 1 || true)"
fi
[ -n "$mig" ] || { log "FAIL: no migrate image on this server (deploy first)"; exit 1; }

log "check account (read-only, fresh password and two-step seed)"
grep -E '^(DATABASE_DIRECT_URL|VAULT_MASTER_KEY)=' "$SEC/app.env" > "$work/db.env"
mkdir -m 0700 "$work/acct"
chown "${SMOKE_IMAGE_UID:-1000}:${SMOKE_IMAGE_UID:-1000}" "$work/acct"
docker run --rm --name "extas-jcheck-$$" --network extas --env-file "$work/db.env" -v "$work/acct:/out" \
  -e SMOKE_CHECK_EMAIL="$SMOKE_CHECK_EMAIL" -e SMOKE_CHECK_NAME="$SMOKE_CHECK_NAME" "$mig" \
  sh -c 'cd /repo/packages/auth && exec ./node_modules/.bin/tsx src/cli.ts check-account --email "$SMOKE_CHECK_EMAIL" --name "$SMOKE_CHECK_NAME" --write-to /out/check.env'
[ -s "$work/acct/check.env" ] || { log "FAIL: the check account could not be prepared"; exit 1; }
{
  cat "$work/acct/check.env"
  echo "SMOKE_HTTP_USER=$EXTAS_STAGING_USER"
  echo "SMOKE_HTTP_PASSWORD=$(grep '^STAGING_PASSWORD=' "$SEC/staging.env" | cut -d= -f2-)"
} > "$work/journeys.env"
rm -f "$work/acct/check.env"

if ! docker image inspect "$IMG" >/dev/null 2>&1; then
  log "building the browser image $IMG (once)"
  docker build -q -f "$HERE/smoke.Dockerfile" --build-arg PLAYWRIGHT_VERSION="$SMOKE_PLAYWRIGHT_VERSION" -t "$IMG" "$HERE" >/dev/null
fi

log "walking the saved journeys on https://$EXTAS_STAGING_HOST ($why)"
rm -rf "${OUT:?}"/*
at="$(TZ="$EXTAS_TIMEZONE" date '+%Y-%m-%d %H:%M')"
kind="$([ "$why" = scheduled ] && echo scheduled || echo "run now")"
rc=0
timeout "$((JOURNEYS_TIMEOUT_MIN * 60))" docker run --rm --name "extas-journeys-$$" --ipc=host --env-file "$work/journeys.env" \
  -e BASE="https://$EXTAS_STAGING_HOST" -e JOURNEYS_OUT=/out -e JOURNEYS_KIND="$kind" -e JOURNEYS_SHA="${SHA:0:12}" -e JOURNEYS_AT="$at ($EXTAS_TIMEZONE)" \
  -v "$REPO/tools:/w/tools:ro" -v "$REPO/docs/qa:/w/docs/qa:ro" -v "$OUT:/out" \
  "$IMG" node /w/tools/journeys.mjs || rc=$?

if [ -f "$OUT/result.json" ]; then
  jq -c --arg kind "$kind" '{at, kind: $kind, sha, ok, journeys, failed, steps, skipped, problems: (.problems[:20])}' "$OUT/result.json" > "$STATE/journeys.json.tmp"
else
  jq -cn --arg at "$at" --arg kind "$kind" --arg sha "${SHA:0:12}" --arg rc "$rc" \
    '{at:$at, kind:$kind, sha:$sha, ok:false, journeys:0, failed:0, steps:0, skipped:0, problems:["the journeys did not finish (exit " + $rc + ")"]}' > "$STATE/journeys.json.tmp"
fi
chmod 0644 "$STATE/journeys.json.tmp"
cp "$STATE/journeys.json.tmp" "$STATE/journeys/$(date -d "@$now" +%Y%m%d-%H%M%S).json"
mv "$STATE/journeys.json.tmp" "$STATE/journeys.json"
journeys_keep "$STATE/journeys" "$JOURNEYS_KEEP"
log "$(jq -r 'if .ok then "PASS: \(.journeys) journeys, \(.steps) steps (\(.skipped) skipped)" else "FAIL: \(.problems | join("; "))" end' "$STATE/journeys.json")"
exit "$rc"
