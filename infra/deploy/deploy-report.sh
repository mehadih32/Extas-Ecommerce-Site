#!/usr/bin/env bash
# PR 4 — the deploy report (owner audit, 20 Oct). deploy.yml runs this after every deploy, success or failure, and
# commits the result to main ([skip ci], so the report commit starts nothing):
#   docs/reports/server/deploy-latest.md    the last deploy: commit, time (EXTAS_TIMEZONE), result, migration,
#                                           public health check, and on failure the failing step in plain English
#   docs/reports/server/deploy-history.md   one line per deploy, appended
# It reads only deploy.sh's own record (state/last-deploy.json) and the health line (deploy.sh public-health), never a
# secret file, and passes every value through `clean`, so a password, connection string or e-mail can never end up in
# Git.
#   deploy-report.sh <out-dir>     writes <out-dir>/deploy-latest.md and <out-dir>/deploy-history.line
# Inputs (environment): SHA, RUN_URL, ROLLBACK (true|false), CHECKOUT, BUILD, DEPLOY, HEALTH_STEP (step outcomes:
# success|failure|skipped|cancelled), RUN_ID, DEPLOY_JSON (default $EXTAS_ROOT/state/last-deploy.json),
# HEALTH_JSON (file with deploy.sh public-health's line), NOW (epoch seconds, for tests); DOCS (the docs-sync step's
# outcome, PR 594) with DOCS_JSON (default $EXTAS_ROOT/state/docs-latest.json, used only when it is this commit's);
# SMOKE and SMOKE_ROLLBACK (the smoke test's and its rollback's outcomes, CN-016) with SMOKE_JSON (default
# $EXTAS_ROOT/state/smoke.json, smoke.sh's result); DISK (the main-disk check's outcome, PR 4 follow-up 31 Oct) with
# DISK_JSON (disk-tidy.sh's numbers).
set -euo pipefail
OUT="${1:?usage: deploy-report.sh <out-dir>}"
CONF="${EXTAS_CONFIG_FILE:-/etc/extas/server.conf}"
# shellcheck source=../config/server.conf
[ -f "$CONF" ] && . "$CONF"
TZ_NAME="${EXTAS_TIMEZONE:-Asia/Dhaka}"
HOST="${EXTAS_STAGING_HOST:-the preview site}"
DEPLOY_JSON="${DEPLOY_JSON:-${EXTAS_ROOT:-/srv/extas}/state/last-deploy.json}"
mkdir -p "$OUT"

# One line, no table breaks, nothing that looks like a credential, a connection string or an e-mail address.
clean() {
  printf '%s' "$1" | tr '\n\r' '  ' \
    | sed -E 's#[A-Za-z][A-Za-z0-9+.-]*://[^ ]*@[^ ]*#(link hidden)#g; s#[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}#(e-mail hidden)#g; s#(password|passwd|secret|token|key)[=:][^ ]*#\1=(hidden)#Ig; s#\|#/#g' \
    | cut -c1-300
}

field() { # field <jq path> from this run's deploy record ("" when the record is from another run or missing)
  [ -n "$REC" ] || { echo ""; return; }
  jq -r "$1 // \"\"" <<<"$REC"
}

REC=""
if [ -f "$DEPLOY_JSON" ] && [ -n "${RUN_ID:-}" ] && [ "$(jq -r '.run // ""' "$DEPLOY_JSON" 2>/dev/null)" = "$RUN_ID" ]; then
  REC="$(jq -c . "$DEPLOY_JSON")"
fi

sha="$(field .sha)"; [ -n "$sha" ] || sha="${SHA:-unknown}"
short="${sha:0:12}"
when="$(TZ="$TZ_NAME" date -d "@${NOW:-$(date +%s)}" '+%Y-%m-%d %H:%M')"
kind="deploy"; [ "${ROLLBACK:-false}" = true ] && kind="rollback"

# The result and, on failure, the failing step in plain English.
result="OK"; failed=""
if [ "${CHECKOUT:-success}" != success ]; then
  result="FAILED"; failed="Getting the code onto the server failed, so nothing was built. The live site was not touched."
elif [ "${DISK:-success}" = failure ]; then
  result="FAILED"
  failed="The server's main disk (/) was too full to build: $(jq -r '"\(.free_gb) GB free after the clean-up, at least \(.min_free_gb) GB needed"' "${DISK_JSON:-/nonexistent}" 2>/dev/null || echo "the check failed") (DISK_ROOT_MIN_FREE_GB). Nothing was built and the live site was not touched. server-setup moves Docker's store to the data disk and lists what fills / in docs/reports/server/latest.md."
elif [ "${BUILD:-success}" = failure ]; then
  result="FAILED"; failed="Building the new version on the server failed (the app or the migrate image did not build). The live site was not touched."
elif [ "${DEPLOY:-success}" != success ]; then
  result="FAILED"
  d="$(clean "$(field .detail)")"
  if [ -n "$d" ]; then failed="The deploy stopped: $d."
  else failed="The deploy script stopped before it could record why (see the run log). The live version is unchanged."; fi
elif [ "$(field .result)" != ok ] && [ -n "$REC" ]; then
  result="FAILED"; failed="The deploy reported: $(clean "$(field .detail)")."
fi
[ "${BUILD:-success}" = cancelled ] || [ "${DEPLOY:-success}" = cancelled ] && { result="CANCELLED"; failed="The run was cancelled before it finished."; }

migration="$(clean "$(field .migration)")"
if [ -z "$migration" ]; then
  if [ "${ROLLBACK:-false}" = true ]; then migration="skipped (rollback: the database stays as it is)"
  else migration="not reached"; fi
fi

# PR 594 (CN-011): README.md + docs/ on the server for the admin's register tabs and the backups
docs=""
DOCS_JSON="${DOCS_JSON:-${EXTAS_ROOT:-/srv/extas}/state/docs-latest.json}"
dsha="$(jq -r '.sha // ""' "$DOCS_JSON" 2>/dev/null || true)"
case "${DOCS:-}" in
  success)
    if [ -n "$dsha" ] && [ "${dsha:0:12}" = "$short" ]; then docs="\`$short\` — README.md + docs/ ($(jq -r '.files' "$DOCS_JSON") files)"
    else docs="copied, but its record is missing"; fi ;;
  failure) docs="FAILED — the server keeps the previous copy${dsha:+ (\`${dsha:0:12}\`)}" ;;
esac

# PR 4 follow-up (31 Oct): free space on / before the build (disk-tidy.sh --guard), when the check ran
disk=""
if [ -n "${DISK:-}" ] && [ -s "${DISK_JSON:-}" ] && jq -e . "$DISK_JSON" >/dev/null 2>&1; then
  disk="$(jq -r '"\(.free_gb) GB free after the clean-up (was \(.free_gb_before) GB), at least \(.min_free_gb) GB needed"' "$DISK_JSON")"
  [ "$DISK" = failure ] && disk="TOO FULL — $disk"
fi

# CN-016: the smoke test (every built page, signed out and as the admin, phone and desktop). A failure rolled back.
smoke=""; smoke_short="—"
SMOKE_JSON="${SMOKE_JSON:-${EXTAS_ROOT:-/srv/extas}/state/smoke.json}"
case "${SMOKE:-}" in
  success)
    smoke="OK — $(jq -r '.pages // 0' "$SMOKE_JSON" 2>/dev/null || echo 0) page views, signed out and as the admin, phone and desktop (storefront pictures: \`docs/reports/smoke/latest/\`; the admin pictures stay on the server)"
    smoke_short="OK" ;;
  failure)
    p="$(clean "$(jq -r '(.problems // []) | .[:3] | join("; ")' "$SMOKE_JSON" 2>/dev/null || true)")"
    smoke="FAILED — ${p:-see the run log}"; smoke_short="FAILED"
    if [ "${SMOKE_ROLLBACK:-}" = success ]; then
      result="FAILED, ROLLED BACK"
      failed="The new version went live, but the smoke test found a problem (${p:-see the run log}), so the previous version was put back automatically. The fix comes before any new work."
    else
      result="FAILED, ROLLBACK FAILED"
      failed="The smoke test found a problem (${p:-see the run log}) and putting the previous version back failed too (see the run log)."
    fi ;;
esac

health="not checked"; health_short="not checked"
if [ -n "${HEALTH_JSON:-}" ] && [ -s "$HEALTH_JSON" ] && jq -e . "$HEALTH_JSON" >/dev/null 2>&1; then
  code="$(jq -r '.code' "$HEALTH_JSON")"; ok="$(jq -r '.ok' "$HEALTH_JSON")"
  hc="$(clean "$(jq -r '.commit // ""' "$HEALTH_JSON")")"; hcol="$(clean "$(jq -r '.color // ""' "$HEALTH_JSON")")"
  if [ "$ok" = true ] && [ "$code" = 200 ]; then
    health="OK — HTTP 200 from https://$HOST/api/health${hc:+, version ${hc:0:12}}${hcol:+, colour $hcol}"
    health_short="OK"
    if [ "$result" = OK ] && [ -n "$hc" ] && [ "${hc:0:12}" != "$short" ]; then
      health="$health — but it is not the commit just deployed ($short)"; health_short="OK, other version"
    fi
  else
    health="FAILED — https://$HOST/api/health answered HTTP $code"
    [ "$code" = 0 ] && health="FAILED — no answer from https://$HOST/api/health"
    case "$code" in 52[0-9]) health="$health (a Cloudflare error: the server did not answer Cloudflare)" ;; 401) health="$health (the preview password was not accepted)" ;; esac
    health_short="FAILED ($code)"
    if [ "$result" = OK ]; then
      result="DEPLOYED, HEALTH CHECK FAILED"
      failed="The new version is live on the server, but the public check through Cloudflare failed: ${health#FAILED — }."
    fi
  fi
fi

{
  echo "# Deploy report — the last $kind"
  echo
  echo "Written by \`deploy.yml\` after every deploy (\`infra/deploy/deploy-report.sh\`). History: \`deploy-history.md\`."
  echo
  echo "| | |"
  echo "|---|---|"
  echo "| Commit | \`$short\` |"
  echo "| Time ($TZ_NAME) | $when |"
  echo "| Result | **$result** |"
  echo "| Database migration | $migration |"
  echo "| Health check on $HOST | $health |"
  [ -n "$smoke" ] && echo "| Smoke test (every page) | $smoke |"
  [ -n "$docs" ] && echo "| Docs on the server | $docs |"
  [ -n "$disk" ] && echo "| Main disk (/) | $disk |"
  [ -n "$failed" ] && echo "| What failed | $failed |"
  [ -n "$REC" ] && [ -n "$(field .color)" ] && [ "$result" = OK ] && echo "| Live colour | $(clean "$(field .color)") |"
  [ -n "${RUN_URL:-}" ] && echo "| Run log | ${RUN_URL} |"
  true
} > "$OUT/deploy-latest.md"

# The history keeps its seven columns (older lines have no smoke test): the smoke result rides in the health column.
[ "$smoke_short" = "—" ] || health_short="$health_short, smoke $smoke_short"
printf '| %s | `%s` | %s | %s | %s | %s | %s |\n' "$when" "$short" "$kind" "$result" "$migration" "$health_short" \
  "${failed:-—}" > "$OUT/deploy-history.line"
# The history file's head, for the first deploy that creates it.
{
  printf '# Deploy history\n\nOne line per deploy, newest last, appended by `deploy.yml`. Time: %s.\n\n' "$TZ_NAME"
  printf '| Time | Commit | Kind | Result | Migration | Health check | What failed |\n|---|---|---|---|---|---|---|\n'
} > "$OUT/deploy-history.head"
printf '%s %s\n' "$short" "$result" > "$OUT/summary"
