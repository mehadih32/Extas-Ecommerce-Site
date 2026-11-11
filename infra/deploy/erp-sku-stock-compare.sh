#!/usr/bin/env bash
# PR 654 (CN-044, ERP lane, task 2) — the read-only SKU/stock comparison between the shop's catalogue and the live
# ERP's own SKU and stock data, on the VM: on demand and nightly (.github/workflows/erp-sku-stock-compare.yml), with
# the live version's migrate image. It runs packages/jobs src/erp-sku-stock-compare-cli.ts in the migrate image with
# only DATABASE_URL (it reads the settings and the vault's rows) and VAULT_MASTER_KEY (to use the store's own ERP
# connection the owner already set up — never a new or separate key) in a root-only temporary file that is gone when
# this ends. No key, address or customer is printed or kept; every ERP call the CLI makes is a GET.
#   sudo infra/deploy/erp-sku-stock-compare.sh <out-dir> [<migrate image>]
# A store with no ERP, or still on the practice ERP, is skipped (not a failure); a real connection that cannot be
# reached is reported as failed. There is nothing here for a release to gate on (unlike erp-acceptance's checks
# against the demo ERP): exit is always 0 once a report is written.
# <out-dir> gets README.md and report.json.
set -euo pipefail
CONF="${EXTAS_CONFIG_FILE:-/etc/extas/server.conf}"
# shellcheck source=../config/server.conf
. "$CONF"
OUT="${1:?usage: erp-sku-stock-compare.sh <out-dir> [<migrate image>]}"
IMG="${2:-}"
R="$EXTAS_ROOT"; SEC="$R/config/secrets"; STATE="$R/state"
log() { echo "[erp-sku-stock-compare $(date +%H:%M:%S)] $*"; }

if [ -z "$IMG" ]; then
  IMG="$(jq -r '.migrate // empty' "$STATE/last-good-deploy.json" 2>/dev/null || true)"
  if [ -z "$IMG" ] || ! docker image inspect "$IMG" >/dev/null 2>&1; then
    IMG="$(docker images --format '{{.Repository}}:{{.Tag}}' extas-migrate | head -n 1 || true)"
  fi
fi
[ -n "$IMG" ] || { log "FAIL: no migrate image on this server (deploy first)"; exit 1; }

work="$(mktemp -d "$SEC/.erp-sku-stock-compare.XXXXXX")"
trap 'rm -rf "$work"' EXIT
mkdir -p "$OUT" "$STATE" "$work/out"
rm -f "$OUT/report.json" "$OUT/README.md"   # never an older run's report in this run's place
chown "${ERP_ACCEPTANCE_IMAGE_UID:-1000}:${ERP_ACCEPTANCE_IMAGE_UID:-1000}" "$work/out"   # the migrate image runs as `node`

if ! docker run --rm --name "extas-erp-sku-stock-compare-probe-$$" "$IMG" test -f /repo/packages/jobs/src/erp-sku-stock-compare-cli.ts; then
  log "the version in $IMG has no SKU/stock compare yet: nothing run, nothing failed"
  printf '# ERP SKU ও স্টক তুলনা\n\n**সারকথা:** এই ভার্সনে এই তুলনা এখনো নেই; পরের ডিপ্লয়ের পর চলবে।\n\n- Not run: the live version predates PR 654.\n' > "$OUT/README.md"
  echo '{"state":"NOT_IN_VERSION"}' > "$OUT/report.json"
  exit 0
fi

# qa-gate N5 (same as erp-acceptance.sh): the least role that can do it. Before the app-role switch this uses the
# direct owner address; after it, the app's own address through PgBouncer, exactly like the worker and web app.
{
  if grep -q '^DATABASE_URL=postgresql://extas_app:' "$SEC/app.env"; then
    grep -E '^DATABASE_URL=' "$SEC/app.env" | head -n 1
  else
    grep -E '^DATABASE_DIRECT_URL=' "$SEC/app.env" | sed 's/^DATABASE_DIRECT_URL=/DATABASE_URL=/'
  fi
  grep -E '^VAULT_MASTER_KEY=' "$SEC/app.env" || true
} > "$work/db.env"
grep -q '^DATABASE_URL=' "$work/db.env" || { log "FAIL: no database address in the server's secrets"; exit 1; }

limit_min="${ERP_SKU_STOCK_COMPARE_TIMEOUT_MIN:-15}"
log "comparing the catalogue against each store's live ERP with $IMG, for at most $limit_min min"
rc=0
timeout "$((limit_min * 60))" docker run --rm --name "extas-erp-sku-stock-compare-$$" --network extas --env-file "$work/db.env" \
  -v "$work/out:/out" "$IMG" \
  sh -c 'cd /repo/packages/jobs && exec ./node_modules/.bin/tsx src/erp-sku-stock-compare-cli.ts --out /out' || rc=$?

if [ "$rc" = 124 ]; then
  docker rm -f "extas-erp-sku-stock-compare-$$" >/dev/null 2>&1 || true
  log "not finished within $limit_min min: stopped, nothing failed"
  rm -f "$work/out/report.json" "$work/out/README.md"
  printf '# ERP SKU ও স্টক তুলনা\n\n**সারকথা:** আজকের তুলনা %s মিনিটে শেষ হয়নি, তাই থামানো হয়েছে। পরের রানে আবার চলবে।\n\n- Not finished: stopped after %s min.\n' "$limit_min" "$limit_min" > "$work/out/README.md"
  jq -n --argjson min "$limit_min" '{state: "NOT_FINISHED", limitMinutes: $min}' > "$work/out/report.json"
  rc=0
fi
cp -r "$work/out/." "$OUT/"
if [ ! -f "$OUT/report.json" ]; then
  log "FAIL: the run wrote no report (exit $rc)"
  rc=1
fi
exit "$rc"
