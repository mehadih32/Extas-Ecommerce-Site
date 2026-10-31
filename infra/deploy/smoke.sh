#!/usr/bin/env bash
# CN-016 (PR 4/17) — the smoke test against the preview host, on the VM: after every deploy (deploy.yml, which rolls
# back when it fails) and every night (smoke.yml).
#   sudo [SMOKE_ROLLS_BACK=1] [SMOKE_HOST=<host>|main] infra/deploy/smoke.sh <out-dir> <kind> [<commit sha>]
#   (1 = deploy.yml rolls back on failure; SMOKE_HOST: below, R1 ops review M7)
# 1. The read-only check account gets a fresh password and two-step seed (auth cli.ts check-account, run in the live
#    migrate image like extas-owner-create); they go to a root-only temporary file and are gone when this ends.
# 2. A browser (extas-smoke:<SMOKE_PLAYWRIGHT_VERSION>, built once from smoke.Dockerfile) opens every built
#    storefront page signed out and every admin page signed in, on a phone and a desktop screen, through Cloudflare
#    with the preview login (tools/smoke.mjs, docs/qa/smoke.json).
# 3. <out-dir> gets README.md, result.json and the storefront screenshots (deploy.yml / smoke.yml commit them to
#    docs/reports/smoke/latest/); state/smoke.json gets the result for the status page. Review R1 (security M1): the
#    admin pages' screenshots carry customers' names, phones and addresses after go-live, so they go only to the
#    server's root-only folder SMOKE_PRIVATE_DIR (default <EXTAS_ROOT>/private/smoke-admin, the last run's), never
#    into <out-dir> or Git.
# Exit 0 = every page passed. No password, seed or connection string is printed or kept.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
CONF="${EXTAS_CONFIG_FILE:-/etc/extas/server.conf}"
# shellcheck source=../config/server.conf
. "$CONF"
OUT="${1:?usage: smoke.sh <out-dir> <kind> [<commit sha>]}"
KIND="${2:?usage: smoke.sh <out-dir> <kind> [<commit sha>]}"
SHA="${3:-}"
R="$EXTAS_ROOT"; SEC="$R/config/secrets"; STATE="$R/state"
IMG="extas-smoke:$SMOKE_PLAYWRIGHT_VERSION"
log() { echo "[smoke $(date +%H:%M:%S)] $*"; }

# R1 ops review (M7, PR 402): which host. SMOKE_HOST empty = the staging host (after every deploy, every night);
# "main" = the main domain, the first of EXTAS_EXTRA_HOSTS (runbook step 7, the first-week watch); otherwise exactly
# the staging host or one of the extra hosts, never any other address. The preview login goes along, except on an extra
# host once it is open (server.conf EXTAS_MAIN_OPEN="yes", PR 403).
# shellcheck source=caddy-live.sh
. "$HERE/caddy-live.sh"
EXTRAS="$(site_extra_hosts "$EXTAS_STAGING_HOST" "${EXTAS_EXTRA_HOSTS:-}" 2>/dev/null)"
HOST="${SMOKE_HOST:-}"; HOST="${HOST,,}"
case "$HOST" in
  ""|"${EXTAS_STAGING_HOST,,}") HOST="$EXTAS_STAGING_HOST" ;;
  main) HOST="${EXTRAS%% *}"
    if [ -z "$HOST" ]; then HOST="$EXTAS_STAGING_HOST"; log "no main domain in EXTAS_EXTRA_HOSTS yet: the staging host instead"; fi ;;
  *) case " $EXTRAS " in *" $HOST "*) ;; *) log "FAIL: $HOST is not a host this server serves (EXTAS_STAGING_HOST, EXTAS_EXTRA_HOSTS)"; exit 2 ;; esac ;;
esac
GATE=yes
[ "$HOST" != "$EXTAS_STAGING_HOST" ] && [ "${EXTAS_MAIN_OPEN:-no}" = yes ] && GATE=no
# R2 ops review (M2): which kind of host, for the checks that belong to one (smoke.json `host`): the preview-only
# noindex check never runs on the main domain, where the first-week watch would fail on it every run.
HOST_KIND=staging
[ "$HOST" = "$EXTAS_STAGING_HOST" ] || HOST_KIND=extra

work="$(mktemp -d "$SEC/.smoke.XXXXXX")"
trap 'rm -rf "$work"' EXIT
mkdir -p "$OUT" "$STATE"
PRIV="${SMOKE_PRIVATE_DIR:-$R/private/smoke-admin}"
mkdir -p "$(dirname "$PRIV")"; install -d -m 0700 "$PRIV"

# The live version's migrate image holds the auth command; a docs-only deploy records a tag that was never built,
# so the newest migrate image stands in.
mig="$(jq -r '.migrate // empty' "$STATE/last-good-deploy.json" 2>/dev/null || true)"
if [ -z "$mig" ] || ! docker image inspect "$mig" >/dev/null 2>&1; then
  mig="$(docker images --format '{{.Repository}}:{{.Tag}}' extas-migrate | head -n 1 || true)"
fi
[ -n "$mig" ] || { log "FAIL: no migrate image on this server (deploy first)"; exit 1; }

log "check account (read-only, fresh password and two-step seed)"
grep -E '^(DATABASE_DIRECT_URL|VAULT_MASTER_KEY)=' "$SEC/app.env" > "$work/db.env"
mkdir -m 0700 "$work/acct"
chown "${SMOKE_IMAGE_UID:-1000}:${SMOKE_IMAGE_UID:-1000}" "$work/acct"   # the migrate image runs as `node` (uid 1000)
docker run --rm --name "extas-check-$$" --network extas --env-file "$work/db.env" -v "$work/acct:/out" \
  -e SMOKE_CHECK_EMAIL="$SMOKE_CHECK_EMAIL" -e SMOKE_CHECK_NAME="$SMOKE_CHECK_NAME" "$mig" \
  sh -c 'cd /repo/packages/auth && exec ./node_modules/.bin/tsx src/cli.ts check-account --email "$SMOKE_CHECK_EMAIL" --name "$SMOKE_CHECK_NAME" --write-to /out/check.env'
[ -s "$work/acct/check.env" ] || { log "FAIL: the check account could not be prepared"; exit 1; }
{
  cat "$work/acct/check.env"
  if [ "$GATE" = yes ]; then
    echo "SMOKE_HTTP_USER=$EXTAS_STAGING_USER"
    echo "SMOKE_HTTP_PASSWORD=$(grep '^STAGING_PASSWORD=' "$SEC/staging.env" | cut -d= -f2-)"
  fi
} > "$work/smoke.env"
rm -f "$work/acct/check.env"

if ! docker image inspect "$IMG" >/dev/null 2>&1; then
  log "building the browser image $IMG (once)"
  docker build -q -f "$HERE/smoke.Dockerfile" --build-arg PLAYWRIGHT_VERSION="$SMOKE_PLAYWRIGHT_VERSION" -t "$IMG" "$HERE" >/dev/null
fi

log "opening every page on https://$HOST ($KIND$([ "$GATE" = yes ] && echo ', with the preview login'))"
rm -rf "${OUT:?}"/* "${PRIV:?}"/*
at="$(TZ="$EXTAS_TIMEZONE" date '+%Y-%m-%d %H:%M')"
# R1 ops review (M8): state/smoke.json's `at` is ISO with its offset (the app reads it with Date.parse in UTC, where
# "2026-10-31 19:10 (Asia/Dhaka)" was 6 hours in the future, so the go-live smoke line stayed red after a pass); the
# words for people stay in `atText`.
at_iso="$(date -Is)"
rc=0
timeout "$((SMOKE_TIMEOUT_MIN * 60))" docker run --rm --name "extas-smoke-$$" --ipc=host --env-file "$work/smoke.env" \
  -e BASE="https://$HOST" -e SMOKE_HOST_KIND="$HOST_KIND" -e SMOKE_OUT=/out -e SMOKE_PRIVATE_OUT=/private -e SMOKE_KIND="$KIND" -e SMOKE_ROLLS_BACK="${SMOKE_ROLLS_BACK:-0}" -e SMOKE_SHA="${SHA:0:12}" -e SMOKE_AT="$at ($EXTAS_TIMEZONE)" \
  -v "$REPO/tools:/w/tools:ro" -v "$REPO/docs/qa:/w/docs/qa:ro" -v "$OUT:/out" -v "$PRIV:/private" \
  "$IMG" node /w/tools/smoke.mjs || rc=$?
# Review R1 (security M1): an admin picture that still landed in the report folder (an older smoke.mjs) moves to the
# private folder.
find "$OUT" -maxdepth 1 -type f -name 'admin*' -exec mv -f -t "$PRIV" {} + 2>/dev/null || true

# PR 139 (CN-022): the audit log and the history tables are still append-only (each trigger on; the app's role has no
# UPDATE, DELETE or TRUNCATE on them), checked as the owner; and which role the live app connects as.
# shellcheck source=app-role.sh
. "$HERE/app-role.sh"
guards="$(app_role_guards)"
app_role="the owner role (the switch waits for server setup and the next deploy)"
grep -q '^DATABASE_URL=postgresql://extas_app:' "$SEC/app.env" && app_role="extas_app"
log "database: $guards; the app connects as $app_role"
if [ -f "$OUT/result.json" ]; then
  jq --arg g "$guards" --arg role "$app_role" '.database = {appendOnly: $g, appRole: $role}
    | if ($g | startswith("problem")) then .ok = false | .problems += [$g] else . end' "$OUT/result.json" > "$OUT/result.json.tmp"
  mv "$OUT/result.json.tmp" "$OUT/result.json"
  printf '\nDatabase (PR 139): %s; the app connects as %s.\n' "$guards" "$app_role" >> "$OUT/README.md"
fi
case "$guards" in problem:*) [ "$rc" -ne 0 ] || rc=1 ;; esac

if [ -f "$OUT/result.json" ]; then
  jq -c --arg kind "$KIND" --arg iso "$at_iso" --arg host "$HOST" '{at: $iso, atText: .at, host: $host, kind: $kind, sha, ok, pages, failed, problems: (.problems[:20])}' "$OUT/result.json" > "$STATE/smoke.json.tmp"
else
  jq -cn --arg at "$at_iso" --arg text "$at ($EXTAS_TIMEZONE)" --arg kind "$KIND" --arg sha "${SHA:0:12}" --arg rc "$rc" --arg host "$HOST" \
    '{at:$at, atText:$text, host:$host, kind:$kind, sha:$sha, ok:false, pages:0, failed:0, problems:["the smoke test did not finish (exit " + $rc + ")"]}' > "$STATE/smoke.json.tmp"
fi
chmod 0644 "$STATE/smoke.json.tmp" && mv "$STATE/smoke.json.tmp" "$STATE/smoke.json"
log "$(jq -r 'if .ok then "PASS: \(.pages) page views" else "FAIL: \(.problems | join("; "))" end' "$STATE/smoke.json")"
exit "$rc"
