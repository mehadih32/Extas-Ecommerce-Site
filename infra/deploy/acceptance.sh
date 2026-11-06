#!/usr/bin/env bash
# PR 393 follow-up (CN-036) — the acceptance run on the VM (.github/workflows/acceptance.yml, BY HAND ONLY): the go-live
# runs that already exist, one after the other on the live version, with one summary. Nothing is re-implemented here:
#   1. smoke.sh        every built page signed out and as the admin (kind "acceptance"; no rollback: SMOKE_ROLLS_BACK
#                      stays unset), state/smoke.json as after any smoke run;
#   2. journeys.sh     the go-live gate journeys (group go-live-gate, now): they order and change nothing;
#   3. gate-orders.sh  the 18 go-live test-order scenarios on the mocks (every order cancelled, the test products
#                      archived, the owner's cash on delivery put back), then its sweep;
#   4. gate-c360.sh    one test customer's whole life cycle on the mocks (cancelled and archived after).
# Each part keeps its own guards (preview host only, mocks only, the server-only check account) and writes its own report
# into <out-dir>/<part>/. A part that fails or is refused does not stop the next one. Then tools/acceptance/summary.mjs
# (in the smoke test's browser image, which has node) writes <out-dir>/README.md and result.json, and
# state/acceptance.json gets the summary for the go-live page (shown beside its "acceptance" row; a person still
# confirms that row).
#   sudo [ACCEPT_ALLOW_COD=yes] infra/deploy/acceptance.sh <out-dir> [<commit sha>]
# ACCEPT_ALLOW_COD=yes is the workflow's `allow_cod` (the owner's OK), passed to gate-orders only.
# Exit 0 = every part passed; 1 = a part failed or did not run; 2 = wrong use.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
CONF="${EXTAS_CONFIG_FILE:-/etc/extas/server.conf}"
# shellcheck source=../config/server.conf
. "$CONF"
OUT="${1:?usage: acceptance.sh <out-dir> [<commit sha>]}"
SHA="${2:-}"
if [ -n "$SHA" ] && ! [[ "$SHA" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "usage: acceptance.sh <out-dir> [<commit sha>] (a commit hash)" >&2
  exit 2
fi
COD="no"; [ "${ACCEPT_ALLOW_COD:-no}" = yes ] && COD="yes"
STATE="$EXTAS_ROOT/state"
IMG="extas-smoke:$SMOKE_PLAYWRIGHT_VERSION"
log() { echo "[acceptance $(date +%H:%M:%S)] $*"; }
at="$(TZ="$EXTAS_TIMEZONE" date '+%Y-%m-%d %H:%M') ($EXTAS_TIMEZONE)"
at_iso="$(TZ="$EXTAS_TIMEZONE" date -Iseconds)"

mkdir -p "$OUT" "$STATE"
rm -rf "${OUT:?}/smoke" "$OUT/journeys" "$OUT/gate-orders" "$OUT/gate-c360" "$OUT/README.md" "$OUT/result.json" "$OUT/exits.json"
declare -A EXIT

part() {   # <key> <command...>: runs one part, keeps its exit code, never stops the run
  local key="$1"; shift
  log "part $key: start"
  local rc=0
  "$@" || rc=$?
  EXIT[$key]=$rc
  log "part $key: exit $rc"
}

part smoke env SMOKE_HOST="" SMOKE_ROLLS_BACK=0 bash "$HERE/smoke.sh" "$OUT/smoke" acceptance "$SHA"
part journeys bash "$HERE/journeys.sh" "$OUT/journeys" now "$SHA" go-live-gate
part gate-orders env GATE_PLAN=gate GATE_ALLOW_COD="$COD" bash "$HERE/gate-orders.sh" "$OUT/gate-orders" all "$SHA"
# the gate's own last word on the owner's setting (as gate-orders.yml's if: always() step)
env GATE_PLAN=gate bash "$HERE/gate-orders.sh" --sweep "$OUT/gate-orders" || log "the gate-orders sweep did not finish (the workflow's last step runs it again)"
part gate-c360 bash "$HERE/gate-c360.sh" "$OUT/gate-c360" "$SHA" all

printf '{"smoke":%s,"journeys":%s,"gate-orders":%s,"gate-c360":%s}\n' "${EXIT[smoke]}" "${EXIT[journeys]}" "${EXIT[gate-orders]}" "${EXIT[gate-c360]}" > "$OUT/exits.json"
rc=0
docker run --rm --name "extas-acceptance-$$" -v "$REPO/tools:/w/tools:ro" -v "$OUT:/out" "$IMG" node /w/tools/acceptance/summary.mjs /out "$at" "$at_iso" "${SHA:0:12}" || rc=$?
if [ ! -f "$OUT/result.json" ]; then
  log "the summary could not be written (exit $rc)"
  jq -n --arg at "$at" --arg iso "$at_iso" --arg sha "${SHA:0:12}" --slurpfile e "$OUT/exits.json" '{kind: "acceptance", at: $at, iso: $iso, sha: $sha, ok: false, passed: 0, total: 4, parts: [], exits: $e[0], problem: "the summary could not be written"}' > "$OUT/result.json"
  printf '# The acceptance run on the preview site\n\n**সারকথা:** সারাংশ লেখা যায়নি — প্রতিটা অংশের নিজের রিপোর্ট দেখুন।\n\n- The summary could not be written (exit %s); each part kept its own report.\n' "$rc" > "$OUT/README.md"
  rc=1
fi
jq -c '{at: .iso, atText: .at, sha, ok, passed, total, parts: [.parts[] | {key, ok, line}]}' "$OUT/result.json" > "$STATE/acceptance.json.tmp" && mv "$STATE/acceptance.json.tmp" "$STATE/acceptance.json"
log "$(jq -r '"\(if .ok then "PASS" else "FAIL" end): \(.passed) of \(.total) parts"' "$OUT/result.json")"
[ "$(jq -r '.ok' "$OUT/result.json")" = true ] && exit 0
exit 1
