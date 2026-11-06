#!/usr/bin/env bash
# S19 · PR 653 (CN-036) — the WordPress map of the redirect table filled from the old shop's PUBLIC sitemap, on the VM
# (.github/workflows/redirect-import.yml, BY HAND ONLY).
#   sudo infra/deploy/redirect-import.sh <out-dir> <old site host> <dry|commit> [<commit sha>]
# 1. Read-only toward the old site: GET requests for its public sitemap files ONLY — the index (wp-sitemap.xml, else
#    sitemap_index.xml, else sitemap.xml) and the sitemap files it lists on the same host (https, a `…sitemap….xml` name,
#    at most SITEMAP_MAX_FILES, each at most SITEMAP_MAX_MB). No login, no cookie, no other path, no redirect followed,
#    nothing sent but the GET; the old site is never changed.
# 2. tools/redirect-import/server/import.ts in the live version's migrate image matches every address to its new page
#    and, with `commit`, files the pairs as Redirect rows of source `wordpress` (the redirect manager's rules, audited as
#    the system). Those rows forward only while `seo.redirects.wordpressMapLive` is on (off until the go-live switch).
# 3. The report (every address, its page, the ones without a twin) goes to <out-dir>/README.md and result.json.
# Exit 0 = the import ran; 1 = it could not. No password or database address is printed or kept.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
CONF="${EXTAS_CONFIG_FILE:-/etc/extas/server.conf}"
# shellcheck source=../config/server.conf
. "$CONF"
OUT="${1:?usage: redirect-import.sh <out-dir> <old site host> <dry|commit> [<commit sha>]}"
OLD="${2:-}"; OLD="${OLD,,}"; OLD="${OLD%.}"; OLD="${OLD#https://}"; OLD="${OLD%%/*}"
MODE="${3:-dry}"
SHA="${4:-}"
R="$EXTAS_ROOT"; SEC="$R/config/secrets"; STATE="$R/state"
MAX_FILES="${SITEMAP_MAX_FILES:-50}"; [[ "$MAX_FILES" =~ ^[0-9]{1,3}$ ]] || MAX_FILES=50
MAX_MB="${SITEMAP_MAX_MB:-5}"; [[ "$MAX_MB" =~ ^[0-9]{1,2}$ ]] || MAX_MB=5
log() { echo "[redirect-import $(date +%H:%M:%S)] $*"; }

[[ "$MODE" == dry || "$MODE" == commit ]] || { log "FAIL: mode must be dry or commit"; exit 1; }
if ! [[ $OLD =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || [ "$OLD" = "${EXTAS_STAGING_HOST,,}" ]; then
  log "FAIL: not the old site's host name: '$OLD' (a plain host name such as the main domain, never the staging host)"
  exit 1
fi

work="$(mktemp -d "$SEC/.redirect-import.XXXXXX")"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/xml" "$OUT"; rm -rf "${OUT:?}"/*
chown "${GATE_IMAGE_UID:-1000}:${GATE_IMAGE_UID:-1000}" "$work/xml" "$OUT"   # the migrate image runs as `node`

# ---- 1. the public sitemap, GET only ------------------------------------------------------------------------------
fetch() {  # <url> <file>: one GET, https only, no redirect, no cookie, size and time capped; prints the status
  curl -sS -X GET --proto '=https' --max-redirs 0 --max-time 30 --max-filesize "$((MAX_MB * 1024 * 1024))" \
    -H 'Accept: application/xml,text/xml' -A "extas-redirect-import (read-only; PR 653)" -o "$2" -w '%{http_code}' "$1" 2>/dev/null || echo 000
}
index=""
for name in wp-sitemap.xml sitemap_index.xml sitemap.xml; do
  code="$(fetch "https://$OLD/$name" "$work/index.xml")"
  log "GET https://$OLD/$name → $code"
  if [ "$code" = 200 ] && grep -q '<loc>' "$work/index.xml"; then index="$name"; break; fi
done
[ -n "$index" ] || { log "FAIL: no public sitemap answered on https://$OLD"; exit 1; }
cp "$work/index.xml" "$work/xml/00-index.xml"
n=0
host_re="${OLD//./\\.}"; host_re="${host_re#www\\.}"
while IFS= read -r loc; do
  [[ $loc =~ ^https://(www\.)?${host_re}/[A-Za-z0-9._-]*sitemap[A-Za-z0-9._-]*\.xml$ ]] || continue
  [ "$loc" = "https://$OLD/$index" ] && continue
  n=$((n + 1)); [ "$n" -le "$MAX_FILES" ] || { log "more than $MAX_FILES sitemap files: the rest are left out"; break; }
  code="$(fetch "$loc" "$work/xml/$(printf '%02d' "$n").xml")"
  log "GET $loc → $code"
  [ "$code" = 200 ] || rm -f "$work/xml/$(printf '%02d' "$n").xml"
done < <(grep -o '<loc>[^<]*</loc>' "$work/index.xml" | sed -e 's#^<loc>[[:space:]]*##' -e 's#[[:space:]]*</loc>$##' -e 's#&amp;#\&#g')
chmod 0644 "$work/xml"/*.xml

# ---- 2. match and (with commit) write, in the live version's migrate image ------------------------------------------
mig="$(jq -r '.migrate // empty' "$STATE/last-good-deploy.json" 2>/dev/null || true)"
if [ -z "$mig" ] || ! docker image inspect "$mig" >/dev/null 2>&1; then
  mig="$(docker images --format '{{.Repository}}:{{.Tag}}' extas-migrate | head -n 1 || true)"
fi
[ -n "$mig" ] || { log "FAIL: no migrate image on this server (deploy first)"; exit 1; }
TSX=/repo/packages/jobs/node_modules/.bin/tsx
{
  if grep -q '^DATABASE_URL=postgresql://extas_app:' "$SEC/app.env"; then
    grep -E '^DATABASE_URL=' "$SEC/app.env" | head -n 1
  else
    grep -E '^DATABASE_DIRECT_URL=' "$SEC/app.env" | sed 's/^DATABASE_DIRECT_URL=/DATABASE_URL=/'
  fi
} > "$work/db.env"
grep -q '^DATABASE_URL=' "$work/db.env" || { log "FAIL: no database address in the server's secrets"; exit 1; }
args=(--in /in --old-site "$OLD" --out /out)
[ "$MODE" = commit ] && args+=(--commit)
log "matching the old addresses with the live shop ($MODE)"
docker run --rm --name "extas-redirect-import-$$" --network extas --env-file "$work/db.env" \
  -e IMPORT_SHA="${SHA:0:12}" -e IMPORT_AT="$(TZ="$EXTAS_TIMEZONE" date '+%Y-%m-%d %H:%M') ($EXTAS_TIMEZONE)" -e IMPORT_REASON="${IMPORT_REASON:-}" \
  -v "$REPO/tools/redirect-import:/repo/apps/web/redirect-import:ro" -v "$work/xml:/in:ro" -v "$OUT:/out" \
  -w /repo/apps/web/redirect-import/server "$mig" "$TSX" import.ts "${args[@]}"
[ -f "$OUT/README.md" ] || { log "FAIL: the import wrote no report"; exit 1; }
