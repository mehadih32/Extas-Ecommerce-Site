#!/usr/bin/env bash
# S21 · PR 570 (B7.3, Note 14/21) — the checklist audit on the preview host, on the VM (audit.yml, every hour).
#   sudo infra/deploy/audit.sh <out-dir> [due|now] [<commit sha>]
#   due  (the hourly check): runs only when a "Run now" press or the owner's schedule says so (AI › Checklist audit →
#        audit-settings.env, audit_due in audit-lib.sh); otherwise it says "not due" and ends at once (exit 0).
#   now  (by hand from Actions): runs at once.
# 1. The smoke test opens every page on a phone and a desktop screen (smoke.sh, kind "audit"), then the saved journeys
#    walk with every UI check on (journeys.sh now, AUDIT_UI). Both keep their own results, history and alerts as always.
# 2. tools/audit-report.mjs judges each checklist group the owner chose (docs/qa/audit-checklist.json) from those runs
#    (docs/qa/audit-groups.json): failed, passed, or waiting for the audit agents (AI; a mock until its key is in the
#    vault — the report says how many were asked and that none ran).
# 3. state/audit.json gets the summary for AI › Checklist audit and the Site health hub; state/audit/<time>.json keeps
#    each audit (the newest AUDIT_KEEP); with the owner's Telegram switch on, the report and the problem list go to
#    him (audit_tell). Nothing is fixed here: fixes go through Fixes to approve (PR 420).
# Exit 0 = every chosen group passed or waits for the agents, or nothing was due.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
CONF="${EXTAS_CONFIG_FILE:-/etc/extas/server.conf}"
# shellcheck source=../config/server.conf
. "$CONF"
# shellcheck source=journeys-lib.sh
. "$HERE/journeys-lib.sh"
# shellcheck source=smoke-lib.sh
. "$HERE/smoke-lib.sh"
# shellcheck source=audit-lib.sh
. "$HERE/audit-lib.sh"
OUT="${1:?usage: audit.sh <out-dir> [due|now] [<commit sha>]}"
MODE="${2:-due}"
SHA="${3:-}"
R="$EXTAS_ROOT"; SEC="$R/config/secrets"; STATE="$R/state"
IMG="extas-smoke:$SMOKE_PLAYWRIGHT_VERSION"
log() { echo "[audit $(date +%H:%M:%S)] $*"; }

# shellcheck disable=SC2034  # the hour, weekday and press are read by audit_due (audit-lib.sh)
AUDIT_ON=no; AUDIT_EVERY=weekly; AUDIT_HOUR=3; AUDIT_WEEKDAY=1; AUDIT_GROUPS=''; AUDIT_AGENTS=1; AUDIT_TELEGRAM=no
AUDIT_KEEP=12; AUDIT_REQUESTED=''
# The owner's choices (written by extas-vault-sync; only KEY='value' lines).
if [ -f "$SEC/audit-settings.env" ]; then
  # shellcheck disable=SC1091
  . "$SEC/audit-settings.env"
fi
audit_clean

now="$(date +%s)"
last="$(stat -c %Y "$STATE/audit.json" 2>/dev/null || echo 0)"
case "$MODE" in
  now) why="by hand" ;;
  due)
    if ! why="$(audit_due "$now" "$last" "$EXTAS_TIMEZONE")"; then
      log "not due (schedule ${AUDIT_ON}/${AUDIT_EVERY})"
      exit 0
    fi ;;
  *) echo "usage: audit.sh <out-dir> [due|now] [<commit sha>]" >&2; exit 2 ;;
esac

mkdir -p "$OUT" "$STATE/audit"
rm -rf "${OUT:?}"/*
mkdir -p "$OUT/smoke" "$OUT/journeys"
at="$(TZ="$EXTAS_TIMEZONE" date '+%Y-%m-%d %H:%M')"
kind="$([ "$why" = scheduled ] && echo scheduled || echo "run now")"
log "checklist audit ($why): groups ${AUDIT_GROUPS:-all}, ${AUDIT_AGENTS} agents asked"
log "1/3 the smoke test, every page"
bash "$HERE/smoke.sh" "$OUT/smoke" audit "$SHA" || log "the smoke test failed (its pages count against their groups)"
log "2/3 the saved journeys with every UI check"
AUDIT_UI="layout,text,images,taps" bash "$HERE/journeys.sh" "$OUT/journeys" now "$SHA" || log "the journeys failed (their steps count against their groups)"

log "3/3 the report per checklist group"
rc=0
docker run --rm --name "extas-audit-$$" --network none -e AUDIT_IN=/in -e AUDIT_OUT=/in -e AUDIT_GROUPS="$AUDIT_GROUPS" -e AUDIT_AGENTS="$AUDIT_AGENTS" \
  -e AUDIT_AT="$at ($EXTAS_TIMEZONE)" -e AUDIT_SHA="${SHA:0:12}" -e AUDIT_KIND="$kind" \
  -v "$REPO/tools:/w/tools:ro" -v "$REPO/docs/qa:/w/docs/qa:ro" -v "$OUT:/in" "$IMG" node /w/tools/audit-report.mjs || rc=$?

if [ -f "$OUT/result.json" ]; then
  jq -c '{at, kind, sha, ok, chosen, points, passedGroups, failedGroups, agentGroups, agents, ran,
    groups: [.groups[] | {id, status, pages, failedPages, failedSteps, problems: (.problems[:3])}], problems: (.problems[:20])}' \
    "$OUT/result.json" > "$STATE/audit.json.tmp"
else
  jq -cn --arg at "$at" --arg kind "$kind" --arg sha "${SHA:0:12}" --arg rc "$rc" \
    '{at:$at, kind:$kind, sha:$sha, ok:false, chosen:0, points:0, passedGroups:0, failedGroups:0, agentGroups:0, groups:[],
      problems:["the audit report was not written (exit " + $rc + ")"]}' > "$STATE/audit.json.tmp"
  [ "$rc" -ne 0 ] || rc=1
fi
chmod 0755 "$STATE/audit"
chmod 0644 "$STATE/audit.json.tmp"
cp "$STATE/audit.json.tmp" "$STATE/audit/$(date -d "@$now" +%Y%m%d-%H%M%S).json"
mv "$STATE/audit.json.tmp" "$STATE/audit.json"
journeys_keep "$STATE/audit" "$AUDIT_KEEP"
if [ "$AUDIT_TELEGRAM" = yes ]; then
  log "$(audit_tell "$STATE/audit.json" "$SEC" "$EXTAS_STAGING_HOST" "$R/logs/alerts.log")"
fi
log "$(jq -r 'if .ok then "PASS: \(.chosen) groups (\(.passedGroups) passed, \(.agentGroups) wait for the agents)" else "FAIL: \(.problems[:5] | join("; "))" end' "$STATE/audit.json")"
exit "$rc"
