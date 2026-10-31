# S21 · PR 417 (REP-07c) — whether "Measure now" on Reports › Site health › Speed asks for a lab run (sourced by
# infra/deploy/vitals-lab.sh and the infra tests). VITALS_REQUESTED comes from speed-settings.env (extas-vault-sync).
# shellcheck shell=bash

# speed_asked <requested> <last run>: prints "asked" and returns 0 when the press (seconds since 1970) is newer than the
# last lab run (the same); returns 1 otherwise, also for an empty or malformed press.
speed_asked() {
  local req="${1:-}" last="${2:-0}"
  [[ "$last" =~ ^[0-9]+$ ]] || last=0
  [[ "$req" =~ ^[0-9]+$ ]] || return 1
  [ "$req" -gt "$last" ] || return 1
  echo "asked"
}
