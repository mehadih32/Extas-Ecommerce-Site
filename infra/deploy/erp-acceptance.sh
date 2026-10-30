#!/usr/bin/env bash
# CN-029 Phase 2 · PR 621 — the ERP v6 acceptance run against the demo ERP, on the VM: every night
# (.github/workflows/erp-acceptance.yml, with the live version's migrate image) and before every release (deploy.sh,
# with the new version's migrate image, after the database is migrated and before the new colour starts — qa-gate B2;
# ~~before the database is migrated~~: a failed check stops the release before the switch).
#   sudo infra/deploy/erp-acceptance.sh <out-dir> [<migrate image>]
# It runs packages/jobs src/erp-acceptance-cli.ts in the migrate image with only DATABASE_URL (it reads the settings
# and the vault's rows) and VAULT_MASTER_KEY (to open the demo key the owner typed on Settings → ERP link) in a
# root-only temporary file that is gone when this ends. No key, address or customer is printed or kept.
# Until the owner types the demo key it answers "waiting for the demo key", calls nobody and fails nothing; a demo ERP
# that cannot be reached, refuses the key or has not deployed a call yet is reported, not failed (qa-gate B1); a run
# that could not read the database is "not run" (qa-gate B2); a run past ERP_ACCEPTANCE_TIMEOUT_MIN is stopped and
# reported "not finished". An image older than this run says so and exits 0.
# <out-dir> gets README.md and report.json; state/erp-acceptance.json gets the result for the status page.
# Exit 0 = passed, waiting, not run or not finished; 1 = a check failed (the release waits).
set -euo pipefail
CONF="${EXTAS_CONFIG_FILE:-/etc/extas/server.conf}"
# shellcheck source=../config/server.conf
. "$CONF"
OUT="${1:?usage: erp-acceptance.sh <out-dir> [<migrate image>]}"
IMG="${2:-}"
R="$EXTAS_ROOT"; SEC="$R/config/secrets"; STATE="$R/state"
log() { echo "[erp-acceptance $(date +%H:%M:%S)] $*"; }

if [ -z "$IMG" ]; then
  IMG="$(jq -r '.migrate // empty' "$STATE/last-good-deploy.json" 2>/dev/null || true)"
  if [ -z "$IMG" ] || ! docker image inspect "$IMG" >/dev/null 2>&1; then
    IMG="$(docker images --format '{{.Repository}}:{{.Tag}}' extas-migrate | head -n 1 || true)"
  fi
fi
[ -n "$IMG" ] || { log "FAIL: no migrate image on this server (deploy first)"; exit 1; }

work="$(mktemp -d "$SEC/.erp-acceptance.XXXXXX")"
trap 'rm -rf "$work"' EXIT
mkdir -p "$OUT" "$STATE" "$work/out"
rm -f "$OUT/report.json" "$OUT/README.md"   # never an older run's report in this run's place
chown "${ERP_ACCEPTANCE_IMAGE_UID:-1000}:${ERP_ACCEPTANCE_IMAGE_UID:-1000}" "$work/out"   # the migrate image runs as `node`

if ! docker run --rm --name "extas-erp-acceptance-probe-$$" "$IMG" test -f /repo/packages/jobs/src/erp-acceptance-cli.ts; then
  log "the version in $IMG has no ERP acceptance run yet: nothing run, nothing failed"
  printf '# ERP acceptance — demo ERP\n\n**সারকথা:** এই ভার্সনে ERP পরীক্ষা এখনো নেই; পরের ডিপ্লয়ের পর চলবে।\n\n- Not run: the live version predates PR 621.\n' > "$OUT/README.md"
  echo '{"state":"NOT_IN_VERSION"}' > "$OUT/report.json"
  cp "$OUT/report.json" "$STATE/erp-acceptance.json"
  exit 0
fi

# qa-gate N5: the least role that can do it. The server has no direct address for the app's own role (09-stack.sh
# writes DATABASE_DIRECT_URL for the owner role only), so once a deploy has moved the app to extas_app (app-role.sh)
# this run uses the app's own address, through PgBouncer like the app and the worker (it reads settings and vault rows
# and adds one vault access-log row, all allowed to that role). Before that switch it keeps the direct owner address.
{
  if grep -q '^DATABASE_URL=postgresql://extas_app:' "$SEC/app.env"; then
    grep -E '^DATABASE_URL=' "$SEC/app.env" | head -n 1
  else
    grep -E '^DATABASE_DIRECT_URL=' "$SEC/app.env" | sed 's/^DATABASE_DIRECT_URL=/DATABASE_URL=/'
  fi
  grep -E '^VAULT_MASTER_KEY=' "$SEC/app.env" || true
} > "$work/db.env"
grep -q '^DATABASE_URL=' "$work/db.env" || { log "FAIL: no database address in the server's secrets"; exit 1; }

limit_min="${ERP_ACCEPTANCE_TIMEOUT_MIN:-15}"
log "running against the demo ERP (or waiting for its key) with $IMG, for at most $limit_min min"
rc=0
timeout "$((limit_min * 60))" docker run --rm --name "extas-erp-acceptance-$$" --network extas --env-file "$work/db.env" \
  -v "$work/out:/out" "$IMG" \
  sh -c 'cd /repo/packages/jobs && exec ./node_modules/.bin/tsx src/erp-acceptance-cli.ts --out /out' || rc=$?

if [ "$rc" = 124 ]; then
  # qa-gate B1: past the limit. The run is stopped, reported "not finished" and fails nothing (a slow demo ERP never
  # stops a release; the practice ERP in CI is the hard gate).
  docker rm -f "extas-erp-acceptance-$$" >/dev/null 2>&1 || true
  log "not finished within $limit_min min: stopped, nothing failed"
  rm -f "$work/out/report.json" "$work/out/README.md"
  printf '# ERP acceptance — demo ERP\n\n**সারকথা:** ডেমো ERP-এর পরীক্ষা %s মিনিটে শেষ হয়নি, তাই থামানো হয়েছে; কোনো পরীক্ষা ফেল ধরা হয়নি। পরের রানে আবার চলবে।\n\n- Not finished: stopped after %s min. Nothing failed.\n' "$limit_min" "$limit_min" > "$work/out/README.md"
  jq -n --argjson min "$limit_min" '{state: "NOT_FINISHED", limitMinutes: $min}' > "$work/out/report.json"
  rc=0
fi
cp -r "$work/out/." "$OUT/"
if [ -f "$OUT/report.json" ]; then
  jq --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson rc "$rc" '{at: $at, exit: $rc, state, passed, failed, skipped, unreachable, keyRefused}' "$OUT/report.json" > "$STATE/erp-acceptance.json"
else
  log "FAIL: the run wrote no report (exit $rc)"
  rc=1
fi
exit "$rc"
