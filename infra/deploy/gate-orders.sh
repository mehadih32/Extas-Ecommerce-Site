#!/usr/bin/env bash
# PR 414 follow-up (CN-013 go-live gate, phase 2; the owner's OK of 1 Nov 2026) — the go-live test orders on the preview
# site, on the VM (.github/workflows/gate-orders.yml, BY HAND ONLY — never on a schedule).
#   sudo infra/deploy/gate-orders.sh <out-dir> [all|1,5,7] [<commit sha>]
# 1. The host guard: the run starts only when server.conf names a preview host (EXTAS_STAGING_HOST) that is not one of
#    the hosts the shop sells on (EXTAS_EXTRA_HOSTS). The browser run checks it again against the shop's own saved
#    preview host and its store domains, and opens nothing but https on that host.
# 2. The oracle (tools/gate-orders/server/oracle.ts: the shop's own package functions, every connection on its mock)
#    runs in the live version's migrate image with only the shop's database address, a random token of this run and
#    the run's id, in a root-only temporary file that is gone when this ends. It is on the database network and on a
#    private network of this run, which the browser container alone shares.
# 3. The browser image of the smoke test (extas-smoke:<SMOKE_PLAYWRIGHT_VERSION>) walks the scenarios
#    (tools/gate-orders/shop.mjs) through Cloudflare with the preview login: phones and desktops on throttled networks
#    place the test orders like customers; at the end every test order is cancelled and the test products archived.
# 4. A safety net: when the browser run ended without its clean-up (stopped at the time limit, or crashed), the oracle's
#    one-shot clean-up runs here. Nothing is deleted, ever.
# <out-dir> gets README.md and result.json; state/gate-orders.json the summary. No password, token, sign-in code or
# connection string is printed or kept. Exit 0 = passed (or nothing could run, with the reason in the report); 1 = a
# scenario or the clean-up failed; 2 = refused (wrong use, or the host guard).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
CONF="${EXTAS_CONFIG_FILE:-/etc/extas/server.conf}"
# shellcheck source=../config/server.conf
. "$CONF"
OUT="${1:?usage: gate-orders.sh <out-dir> [all|1,5,7] [<commit sha>]}"
ASKED="${2:-all}"
SHA="${3:-}"
R="$EXTAS_ROOT"; SEC="$R/config/secrets"; STATE="$R/state"
IMG="extas-smoke:$SMOKE_PLAYWRIGHT_VERSION"
PORT=8790
log() { echo "[gate-orders $(date +%H:%M:%S)] $*"; }

# ---- 1. what was asked, and the host guard ----
if ! [[ "$ASKED" =~ ^(all|[0-9]{1,2}([ ,]+[0-9]{1,2})*)$ ]]; then
  echo "usage: gate-orders.sh <out-dir> [all|1,5,7] (scenario numbers only)" >&2
  exit 2
fi
host_re='^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
preview="$(printf '%s' "${EXTAS_STAGING_HOST:-}" | tr 'A-Z' 'a-z')"
if ! [[ "$preview" =~ $host_re ]]; then
  log "refused: server.conf names no preview host (EXTAS_STAGING_HOST)"
  exit 2
fi
for h in ${EXTAS_EXTRA_HOSTS:-}; do
  if [ "$(printf '%s' "$h" | tr 'A-Z' 'a-z')" = "$preview" ]; then
    log "refused: the preview host is one of the hosts the shop sells on (EXTAS_EXTRA_HOSTS)"
    exit 2
  fi
done

mig="$(jq -r '.migrate // empty' "$STATE/last-good-deploy.json" 2>/dev/null || true)"
if [ -z "$mig" ] || ! docker image inspect "$mig" >/dev/null 2>&1; then
  mig="$(docker images --format '{{.Repository}}:{{.Tag}}' extas-migrate | head -n 1 || true)"
fi
[ -n "$mig" ] || { log "FAIL: no migrate image on this server (deploy first)"; exit 1; }

run_id="$(date -u +%Y%m%d%H%M%S)"
net="extas-gate-$$"
oracle="extas-gate-oracle-$$"
work="$(mktemp -d "$SEC/.gate-orders.XXXXXX")"
cleanup() {
  docker rm -f "$oracle" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT
mkdir -p "$OUT" "$STATE" "$work/out" "$work/net"
rm -f "$OUT/README.md" "$OUT/result.json"   # never an older run's report in this run's place
chown "${GATE_IMAGE_UID:-1000}:${GATE_IMAGE_UID:-1000}" "$work/net"   # the migrate image runs as `node`

# ---- 2. the oracle: the database address (the app's own role once it has one, as erp-acceptance.sh), a random token ----
token="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
{
  if grep -q '^DATABASE_URL=postgresql://extas_app:' "$SEC/app.env"; then
    grep -E '^DATABASE_URL=' "$SEC/app.env" | head -n 1
  else
    grep -E '^DATABASE_DIRECT_URL=' "$SEC/app.env" | sed 's/^DATABASE_DIRECT_URL=/DATABASE_URL=/'
  fi
  echo "GATE_ORACLE_TOKEN=$token"
  echo "GATE_RUN_ID=$run_id"
} > "$work/oracle.env"
grep -q '^DATABASE_URL=' "$work/oracle.env" || { log "FAIL: no database address in the server's secrets"; exit 1; }
{
  echo "GATE_ORACLE_TOKEN=$token"
  echo "SMOKE_HTTP_USER=$EXTAS_STAGING_USER"
  echo "SMOKE_HTTP_PASSWORD=$(grep '^STAGING_PASSWORD=' "$SEC/staging.env" | cut -d= -f2-)"
} > "$work/shop.env"

TSX=/repo/packages/jobs/node_modules/.bin/tsx
oracle_run() {   # <docker run options> -- <oracle.ts arguments>: the migrate image with this checkout's tools/gate-orders
  local opts=()  # mounted where the @extas packages resolve (apps/web/node_modules)
  while [ "$#" -gt 0 ] && [ "$1" != -- ]; do opts+=("$1"); shift; done
  shift
  docker run "${opts[@]}" --network extas --env-file "$work/oracle.env" -v "$REPO/tools/gate-orders:/repo/apps/web/gate-orders:ro" \
    -v "$work/net:/out" -w /repo/apps/web/gate-orders/server "$mig" "$TSX" oracle.ts "$@"
}
if ! docker run --rm --name "extas-gate-probe-$$" "$mig" test -x "$TSX"; then
  log "FAIL: the migrate image $mig has no tsx (an image older than this run)"
  exit 1
fi
docker network create "$net" >/dev/null
oracle_run -d --name "$oracle" -- --serve "$PORT" >/dev/null
docker network connect "$net" "$oracle"

if ! docker image inspect "$IMG" >/dev/null 2>&1; then
  log "building the browser image $IMG (once)"
  docker build -q -f "$HERE/smoke.Dockerfile" --build-arg PLAYWRIGHT_VERSION="$SMOKE_PLAYWRIGHT_VERSION" -t "$IMG" "$HERE" >/dev/null
fi

# ---- 3. the browser run, on the run's own network only (no database network, no database address) ----
limit_min="${GATE_ORDERS_TIMEOUT_MIN:-120}"
at="$(TZ="$EXTAS_TIMEZONE" date '+%Y-%m-%d %H:%M')"
log "test orders on https://$preview (scenarios: $ASKED), at most $limit_min min"
rc=0
timeout "$((limit_min * 60))" docker run --rm --name "extas-gate-shop-$$" --ipc=host --network "$net" --env-file "$work/shop.env" -e BASE="https://$preview" -e GATE_PREVIEW_HOST="$preview" -e GATE_EXTRA_HOSTS="${EXTAS_EXTRA_HOSTS:-}" -e GATE_ORACLE_URL="http://$oracle:$PORT" -e GATE_SCENARIOS="$ASKED" -e GATE_OUT=/out -e GATE_RUN_ID="$run_id" -e GATE_SHA="${SHA:0:12}" -e GATE_AT="$at ($EXTAS_TIMEZONE)" -e GATE_LHRC=/w/lighthouserc.json -v "$REPO/tools:/w/tools:ro" -v "$REPO/lighthouserc.json:/w/lighthouserc.json:ro" -v "$work/out:/out" "$IMG" node /w/tools/gate-orders/shop.mjs || rc=$?
[ "$rc" = 124 ] && { docker rm -f "extas-gate-shop-$$" >/dev/null 2>&1 || true; log "stopped after $limit_min min"; }

# ---- 4. the safety net: the clean-up when the browser run ended without one ----
# (a run the browser side refused before it made anything, `started` false, needs none and gets none)
if [ ! -f "$work/out/result.json" ] || [ "$(jq -r 'if .started == true then (.cleanup.ok // false) else true end' "$work/out/result.json")" != true ]; then
  log "the run ended without a full clean-up: cancelling every open test order and archiving the test products now"
  docker rm -f "$oracle" >/dev/null 2>&1 || true
  oracle_run --rm --name "$oracle" -- --cleanup --out /out/cleanup.json || true
  browser_rc="$rc"; rc=1   # a run that needed the safety net failed, whatever the browser's own exit was
  if [ ! -f "$work/out/result.json" ]; then
    printf '# Go-live gate — test orders on the preview site\n\n**সারকথা:** পরীক্ষা শেষ হয়নি; সব টেস্ট অর্ডার বাতিল করার চেষ্টা হয়েছে — নিচে দেখুন।\n\n- The browser run ended without a report (exit %s).\n' "$browser_rc" > "$work/out/README.md"
    jq -n --arg at "$at" --argjson rc "$browser_rc" '{kind: "gate-orders", at: $at, ok: false, scenarios: 0, passed: 0, failed: 0, skipped: 0, orders: 0, started: true, problems: ["the browser run ended without a report (exit \($rc))"]}' > "$work/out/result.json"
  fi
  if [ -f "$work/net/cleanup.json" ]; then
    jq --slurpfile c "$work/net/cleanup.json" '.cleanup = $c[0] | .ok = false' "$work/out/result.json" > "$work/out/r.json" && mv "$work/out/r.json" "$work/out/result.json"
    printf '\n## Safety net\n\n- The run ended without its clean-up; the server ran it afterwards: %s test orders cancelled, %s test products archived%s.\n' \
      "$(jq -r '.cancelled' "$work/net/cleanup.json")" "$(jq -r '.productsArchived // 0' "$work/net/cleanup.json")" "$(jq -r 'if .ok then "" else " (not complete — see result.json)" end' "$work/net/cleanup.json")" >> "$work/out/README.md"
  else
    printf '\n## Safety net\n\n- The clean-up could not run here either: the next run cancels every open test order first.\n' >> "$work/out/README.md"
  fi
fi
cp "$work/out/README.md" "$work/out/result.json" "$OUT/"
jq -c --argjson rc "$rc" '{at, exit: $rc, ok, scenarios, passed, failed, skipped, orders, cleanup: (.cleanup.ok // false)}' "$OUT/result.json" > "$STATE/gate-orders.json"
log "$(jq -r '"\(if .ok then "PASS" else "FAIL" end): \(.passed) passed, \(.failed) failed, \(.skipped) skipped, \(.orders) test orders"' "$OUT/result.json")"
exit "$rc"
