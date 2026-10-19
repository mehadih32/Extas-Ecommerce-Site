#!/usr/bin/env bash
# EXTAS S0A — server setup as code (PR 1–10, 601, 604). Idempotent: re-running is safe and only changes what differs.
# Runs on the VM through .github/workflows/server-setup.yml on the self-hosted runner `extas-vm` (CN-003).
# Build order: Blueprint A2.9.16. Writes a short machine report (no secrets) to $EXTAS_ROOT/reports/latest.md,
# which the workflow commits to docs/reports/server/.
#   sudo infra/server/setup.sh [--only step,step]
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"
for f in "$HERE"/steps/*.sh; do
  # shellcheck disable=SC1090
  . "$f"
done
need_root

ONLY="${1:-}"; [ "$ONLY" = "--only" ] && ONLY=",${2:-}," || ONLY=""
: > "$REPORT_FILE"; : > "$REPORT_FILE.profile"

# name  function        critical(1 = stop the run if it fails, because later steps depend on it)
STEPS="specs     step_specs     1
os        step_os        1
harden    step_harden    1
nvme      step_nvme      1
datadisk  step_datadisk  1
kernel    step_kernel    0
docker    step_docker    1
profile   step_profile   1
stack     step_stack     1
backup    step_backup    0
monitor   step_monitor   0
k6        step_k6        0
public    step_public    0"

# Public check: does https://<staging host> answer through Cloudflare? (401 = the preview password page = good)
step_public() {
  local code
  code="$(curl -s -o /dev/null -m 15 -w '%{http_code}' "https://$EXTAS_STAGING_HOST/" 2>/dev/null || echo 000)"
  case "$code" in
    401|200) report OK "public HTTPS" "https://$EXTAS_STAGING_HOST answers ($code — password page)" ;;
    000) report WARN "public HTTPS" "no answer from https://$EXTAS_STAGING_HOST yet (DNS record new → this VM not in place?)" ;;
    52[0-9]) report WARN "public HTTPS" "Cloudflare error $code — SSL mode must be Full (strict) or Full" ;;
    *) report WARN "public HTTPS" "https://$EXTAS_STAGING_HOST answered $code" ;;
  esac
  echo "$code" > "$EXTAS_STATE_DIR/public-https.code" 2>/dev/null || true
}

FAILED=0
while read -r name fn critical; do
  [ -z "$name" ] && continue
  if [ -n "$ONLY" ] && [[ "$ONLY" != *",$name,"* ]]; then continue; fi
  log "=== $name ==="
  before="$(grep -c '| FAIL |' "$REPORT_FILE" || true)"
  ( set -e; "$fn" ) </dev/null; rc=$?
  if [ "$rc" -ne 0 ]; then
    FAILED=1
    [ "$(grep -c '| FAIL |' "$REPORT_FILE" || true)" -gt "$before" ] || report FAIL "$name" "step failed (see the workflow log)"
    if [ "$critical" = 1 ]; then report FAIL "run stopped" "later steps depend on '$name'"; break; fi
  fi
done <<<"$STEPS"

# Final report
mkdir -p "$EXTAS_REPORT_DIR" 2>/dev/null || EXTAS_REPORT_DIR=/tmp
{
  echo "# Server report — $(date '+%Y-%m-%d %H:%M %Z')"
  echo
  echo "Run by \`infra/server/setup.sh\` (S0A) from commit \`${GITHUB_SHA:-local}\`. Overall: **$([ $FAILED = 0 ] && echo PASS || echo 'NEEDS ATTENTION')**."
  echo
  cat "$REPORT_FILE"
  cat "$REPORT_FILE.profile"
} > "$EXTAS_REPORT_DIR/latest.md"
cp "$EXTAS_REPORT_DIR/latest.md" "$EXTAS_REPORT_DIR/$(date +%Y-%m-%d-%H%M).md"
echo "$EXTAS_REPORT_DIR/latest.md"
exit $FAILED
