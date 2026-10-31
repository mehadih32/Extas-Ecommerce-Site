# S21 · PR 414 (B7.3) — whether the saved browser journeys are due, and how many runs are kept (sourced by
# infra/deploy/journeys.sh and the infra tests). The owner's schedule comes from journeys-settings.env (Reports › Site health, through extas-vault-sync) after
# the defaults in server.conf:
#   JOURNEYS_ON yes|no · JOURNEYS_EVERY hourly|daily|weekly · JOURNEYS_HOUR 0–23 · JOURNEYS_WEEKDAY 1 (Monday)–7
#   JOURNEYS_REQUESTED  the last "Run now" press, seconds since 1970 (empty: never pressed)
# shellcheck shell=bash

# journeys_slot <now> <tz>: the newest scheduled moment at or before <now> (seconds since 1970), in the time zone <tz>.
journeys_slot() {
  local now="$1" tz="$2" hh today back slot dow
  if [ "$JOURNEYS_EVERY" = hourly ]; then
    TZ="$tz" date -d "$(TZ="$tz" date -d "@$now" '+%F %H:00')" +%s
    return
  fi
  hh="$(printf '%02d:00' "$((10#$JOURNEYS_HOUR))")"
  today="$(TZ="$tz" date -d "@$now" +%F)"
  back=0
  if [ "$JOURNEYS_EVERY" = weekly ]; then
    dow="$(TZ="$tz" date -d "@$now" +%u)"
    back=$(( (dow - JOURNEYS_WEEKDAY + 7) % 7 ))
  fi
  slot="$(TZ="$tz" date -d "$(date -d "$today -$back day" +%F) $hh" +%s)"
  if [ "$slot" -gt "$now" ]; then
    back=$(( back + $([ "$JOURNEYS_EVERY" = weekly ] && echo 7 || echo 1) ))
    slot="$(TZ="$tz" date -d "$(date -d "$today -$back day" +%F) $hh" +%s)"
  fi
  echo "$slot"
}

# journeys_due <now> <last run> <tz>: prints why and returns 0 when a run is due; returns 1 otherwise.
# A "Run now" press newer than the last run is due whatever the schedule; otherwise only with the schedule on, when the
# last run is older than the newest scheduled moment (a missed hour is made up at the next check, once).
journeys_due() {
  local now="$1" last="${2:-0}" tz="$3" slot
  [[ "$last" =~ ^[0-9]+$ ]] || last=0
  if [[ "${JOURNEYS_REQUESTED:-}" =~ ^[0-9]+$ ]] && [ "$JOURNEYS_REQUESTED" -gt "$last" ]; then
    echo "asked"
    return 0
  fi
  [ "${JOURNEYS_ON:-no}" = yes ] || return 1
  case "${JOURNEYS_EVERY:-}" in hourly | daily | weekly) ;; *) return 1 ;; esac
  [[ "${JOURNEYS_HOUR:-}" =~ ^[0-9]{1,2}$ ]] && [ "$((10#$JOURNEYS_HOUR))" -le 23 ] || return 1
  [[ "${JOURNEYS_WEEKDAY:-}" =~ ^[1-7]$ ]] || return 1
  slot="$(journeys_slot "$now" "$tz")"
  if [ "$last" -lt "$slot" ]; then
    echo "scheduled"
    return 0
  fi
  return 1
}

# journeys_keep <dir> <n>: keeps the newest <n> kept runs (<YYYYmmdd-HHMMSS>.json, so the names sort by time) and
# removes the older ones (the owner's "Runs kept for comparison"). Any other file in <dir> is left alone.
journeys_keep() {
  local dir="$1" n="$2" f
  find "$dir" -maxdepth 1 -type f -name '*.json' -printf '%f\n' | grep -E '^[0-9]{8}-[0-9]{6}\.json$' | sort -r \
    | tail -n +"$((n + 1))" | while IFS= read -r f; do rm -f "${dir:?}/$f"; done || true
}
