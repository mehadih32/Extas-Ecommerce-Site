#!/usr/bin/env bash
# S19 · PR 587 (CN-035 step 4c) — the go-live check before the owner's "go live", ON the VM (golive-check.yml, by hand).
# Read-only. It changes no setting, no sign-off and no server file, and it never sends a request to the main domain:
#   1. a dry run of the domain switch: the main domain's Caddy block, OPEN (infra/stack/caddy/hosts-block.sh yes), is
#      written into a COPY of the live Caddy configuration inside the Caddy container (/tmp) and validated there with
#      `caddy validate`; the copy is removed; the running Caddy, server.conf and sites/ are untouched;
#   2. tools/golive-check.mjs in the smoke test's browser image, signed in as the read-only check account through the
#      preview login on the staging host: the go-live list (Needed before / Soon after), the WordPress redirect map and
#      the sitemap.
#   golive-check.sh <out-dir> <main domain or empty> [<commit sha>]
# Exit 0 = the check ran (its findings are in <out-dir>/README.md); 1 = it could not run. No password is printed or kept.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
CONF="${EXTAS_CONFIG_FILE:-/etc/extas/server.conf}"
# shellcheck source=../config/server.conf
. "$CONF"
OUT="${1:?usage: golive-check.sh <out-dir> <main domain or empty> [<commit sha>]}"
DOMAIN="${2:-}"; DOMAIN="${DOMAIN,,}"; DOMAIN="${DOMAIN%.}"
SHA="${3:-}"
R="$EXTAS_ROOT"; SEC="$R/config/secrets"; STATE="$R/state"
IMG="extas-smoke:$SMOKE_PLAYWRIGHT_VERSION"
CADDY_CONTAINER="${CADDY_CONTAINER:-extas-caddy}"
log() { echo "[golive-check $(date +%H:%M:%S)] $*"; }

work="$(mktemp -d "$SEC/.golive.XXXXXX")"
trap 'rm -rf "$work"; docker exec "$CADDY_CONTAINER" rm -rf /tmp/golive-dry >/dev/null 2>&1 || true' EXIT
mkdir -p "$OUT"; rm -rf "${OUT:?}"/*

# ---- 1. the domain switch, dry run in a copy ---------------------------------------------------------------------
switch_json() { jq -cn --argjson ok "$1" --arg detail "$2" '{ok:$ok, detail:$detail}' > "$work/switch.json"; }
if [ -z "$DOMAIN" ]; then
  switch_json false "no main domain given (workflow input \`domain\`): the dry run needs the name the owner will switch"
elif ! [[ $DOMAIN =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || [ "$DOMAIN" = "${EXTAS_STAGING_HOST,,}" ]; then
  switch_json false "not a main domain: $DOMAIN (a plain host name, never the staging host)"
else
  hosts=("$DOMAIN"); [[ $DOMAIN == www.* ]] || hosts+=("www.$DOMAIN")
  bash "$REPO/infra/stack/caddy/hosts-block.sh" yes "${hosts[@]}" | sed 's#/etc/caddy/sites#/tmp/golive-dry/sites#g' > "$work/hosts.caddy"
  if docker exec -i "$CADDY_CONTAINER" sh -c 'rm -rf /tmp/golive-dry && mkdir -p /tmp/golive-dry/sites && cp -a /etc/caddy/sites/. /tmp/golive-dry/sites/ && cat > /tmp/golive-dry/sites/hosts.caddy && sed "s#/etc/caddy/sites#/tmp/golive-dry/sites#g" /etc/caddy/Caddyfile > /tmp/golive-dry/Caddyfile' < "$work/hosts.caddy" \
     && docker exec "$CADDY_CONTAINER" caddy validate --config /tmp/golive-dry/Caddyfile --adapter caddyfile > "$work/validate.log" 2>&1; then
    switch_json true "the live Caddy configuration with ${hosts[*]} OPEN (no preview password, no noindex) validates; the staging host's own block keeps both (checked in a copy, nothing applied)"
  else
    switch_json false "the live Caddy configuration with ${hosts[*]} open does NOT validate: $(tail -n 3 "$work/validate.log" 2>/dev/null | tr '\n' ' ' | cut -c1-300)"
  fi
fi
log "domain switch dry run: $(jq -r 'if .ok then "ok" else "FAIL — \(.detail)" end' "$work/switch.json")"

# ---- 2. the go-live list, the redirect map and the sitemap, as the read-only check account -------------------------
mig="$(jq -r '.migrate // empty' "$STATE/last-good-deploy.json" 2>/dev/null || true)"
if [ -z "$mig" ] || ! docker image inspect "$mig" >/dev/null 2>&1; then
  mig="$(docker images --format '{{.Repository}}:{{.Tag}}' extas-migrate | head -n 1 || true)"
fi
[ -n "$mig" ] || { log "FAIL: no migrate image on this server (deploy first)"; exit 1; }
grep -E '^(DATABASE_DIRECT_URL|VAULT_MASTER_KEY)=' "$SEC/app.env" > "$work/db.env"
mkdir -m 0700 "$work/acct"
chown "${SMOKE_IMAGE_UID:-1000}:${SMOKE_IMAGE_UID:-1000}" "$work/acct"
docker run --rm --name "extas-golive-acct-$$" --network extas --env-file "$work/db.env" -v "$work/acct:/out" \
  -e SMOKE_CHECK_EMAIL="$SMOKE_CHECK_EMAIL" -e SMOKE_CHECK_NAME="$SMOKE_CHECK_NAME" "$mig" \
  sh -c 'cd /repo/packages/auth && exec ./node_modules/.bin/tsx src/cli.ts check-account --email "$SMOKE_CHECK_EMAIL" --name "$SMOKE_CHECK_NAME" --write-to /out/check.env'
[ -s "$work/acct/check.env" ] || { log "FAIL: the check account could not be prepared"; exit 1; }
{
  cat "$work/acct/check.env"
  echo "SMOKE_HTTP_USER=$EXTAS_STAGING_USER"
  echo "SMOKE_HTTP_PASSWORD=$(grep '^STAGING_PASSWORD=' "$SEC/staging.env" | cut -d= -f2-)"
} > "$work/check.env"
rm -f "$work/acct/check.env"
if ! docker image inspect "$IMG" >/dev/null 2>&1; then
  log "building the browser image $IMG (once)"
  docker build -q -f "$HERE/smoke.Dockerfile" --build-arg PLAYWRIGHT_VERSION="$SMOKE_PLAYWRIGHT_VERSION" -t "$IMG" "$HERE" >/dev/null
fi
log "the go-live list, the redirect map and the sitemap on https://$EXTAS_STAGING_HOST (read-only)"
rc=0
timeout "$((SMOKE_TIMEOUT_MIN * 60))" docker run --rm --name "extas-golive-$$" --ipc=host --env-file "$work/check.env" \
  -e BASE="https://$EXTAS_STAGING_HOST" -e GOLIVE_OUT=/out -e SWITCH_JSON=/w/switch.json -e GOLIVE_TITLES=/w/titles.json \
  -e GOLIVE_SHA="${SHA:0:12}" -e GOLIVE_AT="$(TZ="$EXTAS_TIMEZONE" date '+%Y-%m-%d %H:%M') ($EXTAS_TIMEZONE)" \
  -v "$REPO/tools:/w/tools:ro" -v "$REPO/docs/qa:/w/docs/qa:ro" -v "$work/switch.json:/w/switch.json:ro" \
  -v "$REPO/apps/web/messages/admin-golive.en.json:/w/titles.json:ro" -v "$OUT:/out" \
  "$IMG" node /w/tools/golive-check.mjs || rc=$?
[ -f "$OUT/README.md" ] || { log "FAIL: the check wrote no report (exit $rc)"; exit 1; }
exit "$rc"
