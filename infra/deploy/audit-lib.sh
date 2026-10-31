# S21 · PR 570 (B7.3, Note 14/21) — the checklist audit's helpers (sourced by infra/deploy/audit.sh and the infra tests,
# after journeys-lib.sh and smoke-lib.sh).
# shellcheck shell=bash

# audit_due <now> <last run> <tz>: the journeys' rule (journeys_due) on the audit's own schedule — "asked" after a
# "Run now" press newer than the last audit, "scheduled" when the daily or weekly slot has come; otherwise exit 1.
audit_due() {
  # shellcheck disable=SC2030,SC2031,SC2034  # the journeys' names are set in this subshell only, read by journeys_due
  ( JOURNEYS_ON="${AUDIT_ON:-no}" JOURNEYS_EVERY="${AUDIT_EVERY:-}" JOURNEYS_HOUR="${AUDIT_HOUR:-}" \
    JOURNEYS_WEEKDAY="${AUDIT_WEEKDAY:-}" JOURNEYS_REQUESTED="${AUDIT_REQUESTED:-}"
    case "$JOURNEYS_EVERY" in daily | weekly) ;; *) [[ "$JOURNEYS_REQUESTED" =~ ^[0-9]+$ ]] || exit 1; JOURNEYS_ON=no ;; esac
    journeys_due "$1" "$2" "$3" )
}

# audit_clean: the owner's values made safe (a bad value takes its default; the groups only ids and commas).
audit_clean() {
  [[ "${AUDIT_KEEP:-}" =~ ^[0-9]{1,3}$ ]] && [ "$AUDIT_KEEP" -ge 1 ] || AUDIT_KEEP=12
  [[ "${AUDIT_AGENTS:-}" =~ ^[1-3]$ ]] || AUDIT_AGENTS=1
  [[ "${AUDIT_GROUPS:-}" =~ ^[0-9a-z,]{0,200}$ ]] || AUDIT_GROUPS=''
  [ "${AUDIT_TELEGRAM:-no}" = yes ] || AUDIT_TELEGRAM=no
}

# audit_tell <state/audit.json> <secrets dir> <admin host> <alert log>: the audit's report and problem list to the
# owner (alert_send: Telegram when the bot is there, the alert log always). Says what it did in one line.
audit_tell() {
  local sum="$1" sec="$2" host="$3" logf="$4" text
  text="$(jq -r --arg host "$host" '
    "📋 \($host): চেকলিস্ট অডিট (\(.at // "")) — \(.chosen // 0)টা গ্রুপ, \(.points // 0)টা পয়েন্ট: \(.passedGroups // 0)টা পাস, \(.failedGroups // 0)টা ব্যর্থ, \(.agentGroups // 0)টা অডিট এজেন্টের অপেক্ষায়।"
    + (if ((.problems // []) | length) > 0 then " সমস্যা: " + ([(.problems // [])[:5][] | tostring | .[:160]] | join("; ")) + "।" else "" end)
    + " দেখুন: https://\($host)/admin/ai/audit"' "$sum" 2>/dev/null || true)"
  [ -n "$text" ] || { echo "audit report: nothing to send (no summary)"; return 0; }
  echo "audit report: $(alert_send "$text" "$sec" "$logf")"
}
