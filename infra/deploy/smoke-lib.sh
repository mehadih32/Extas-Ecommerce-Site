# S21 · PR 418 (REP-07e) — the smoke test's newest run of each kind for Reports › Site health › Smoke runs (sourced by
# infra/deploy/smoke.sh, journeys.sh (PR 419: run_history; PR 424: run_alert) and the infra tests). The admin reads state/smoke-runs/<deploy|scheduled>/ through the app's
# read-only /state mount: result.json, rows.json (each page × screen, tools/smoke.mjs) and the pictures.
# shellcheck shell=bash

# smoke_slot <kind>: "deploy" for the run after a deploy, "scheduled" for every other (nightly, first week, by hand).
smoke_slot() {
  case "${1:-}" in
    "after deploy") echo deploy ;;
    *) echo scheduled ;;
  esac
}

# smoke_keep <out-dir> <runs-dir> <slot>: puts the run's result.json, rows.json and *.jpg in <runs-dir>/<slot>, in
# place of that slot's previous run (built aside and moved in, so the admin never reads half a run). Files are readable
# by the app (0644); only those three kinds of file are copied. Returns 1 when the run wrote no result.json.
smoke_keep() {
  local out="$1" dir="$2" slot="$3" tmp f
  [ -f "$out/result.json" ] || return 1
  mkdir -p "$dir"
  chmod 0755 "$dir"
  tmp="$(mktemp -d "$dir/.$slot.XXXXXX")"
  for f in "$out"/result.json "$out"/rows.json "$out"/*.jpg; do
    [ -f "$f" ] && [ ! -L "$f" ] && cp "$f" "$tmp/"
  done
  chmod 0755 "$tmp"
  find "$tmp" -type f -exec chmod 0644 {} +
  if [ -d "$dir/$slot" ]; then
    mv "$dir/$slot" "$dir/.$slot.old.$$"
  fi
  mv "$tmp" "$dir/$slot"
  rm -rf "${dir:?}/.$slot.old.$$"
}

# PR 419 (B7.3) — run_history <smoke|journeys> <run folder> <migrate image> <env file>: keeps the run in the history
# (SiteAuditRun with its findings; packages/jobs/src/run-history-cli.ts in the release's migrate image, as the node
# user, the folder read-only). Never fails the caller: a release without the command, or a database that cannot be
# written, is said in one line and the run goes on.
run_history() {
  local tool="$1" dir="$2" img="$3" envf="$4" rc=0
  if ! docker run --rm --name "extas-history-probe-$$" "$img" test -f /repo/packages/jobs/src/run-history-cli.ts >/dev/null 2>&1; then
    echo "run history: this release cannot keep runs yet (no run-history-cli.ts)"
    return 0
  fi
  # shellcheck disable=SC2016  # $1 is the tool, expanded inside the container
  docker run --rm --name "extas-history-$$" --network extas --env-file "$envf" -v "$dir:/in:ro" "$img" \
    sh -c 'cd /repo/packages/jobs && exec ./node_modules/.bin/tsx src/run-history-cli.ts --tool "$1" --dir /in' sh "$tool" || rc=$?
  [ "$rc" -eq 0 ] || echo "run history: not kept (exit $rc)"
  return 0
}

# PR 424 (B7.3) — run_alert <smoke|journeys> <summary json> <state dir> <secrets dir> <admin host> <alert log>: a
# Telegram line to the owner when the test failed (state/smoke.json or state/journeys.json, always written by the
# caller), again at most every RUN_ALERTS_REPEAT_H hours while it keeps failing, and one line when it passes again
# after a line was sent. The owner's switches are run-alerts.env (Reports › Site health › Run history, extas-vault-sync;
# read line by line, never run); missing or off, nothing is sent. Every line goes to the alert log; it reaches Telegram
# only when telegram.env holds the bot (the vault, PR 392), else the log is the mock. The test's own state is
# <state dir>/run-alerts/<tool>.json (failing, since, told = the last line's time) and is kept whether the lines are on or not, so "passes again"
# is never said for a failure that was not told. Says what it did in one line; never fails the caller.
run_alert() {
  local tool="$1" sum="$2" st="$3" sec="$4" host="$5" logf="$6"
  local f="$st/run-alerts/$tool.json" now ok was=false since told name link text on want repeat rec
  _run_alert_val() { [ -f "$sec/run-alerts.env" ] && sed -n "s/^$1='\(.*\)'\$/\1/p" "$sec/run-alerts.env" | tail -n 1; return 0; }
  on="$(_run_alert_val RUN_ALERTS_ON)"; rec="$(_run_alert_val RUN_ALERTS_RECOVERED)"; repeat="$(_run_alert_val RUN_ALERTS_REPEAT_H)"
  case "$tool" in
    smoke) want="$(_run_alert_val RUN_ALERTS_SMOKE)"; name='স্মোক টেস্ট' ;;
    journeys) want="$(_run_alert_val RUN_ALERTS_JOURNEYS)"; name='সেভ করা জার্নি' ;;
    *) echo "run alert: unknown test $tool"; return 0 ;;
  esac
  [[ "$repeat" =~ ^[0-9]{1,3}$ ]] && [ "$repeat" -ge 1 ] || repeat=24
  ok="$(jq -r 'if .ok == true then "yes" else "no" end' "$sum" 2>/dev/null || echo no)"
  now="$(date +%s)"
  mkdir -p "$st/run-alerts" && chmod 0755 "$st/run-alerts"
  if [ "$(jq -r '.failing == true' "$f" 2>/dev/null)" = true ]; then was=true; fi
  since="$(jq -r '.since // 0 | floor' "$f" 2>/dev/null || echo 0)"; [[ "$since" =~ ^[0-9]+$ ]] || since=0
  told="$(jq -r '.told // 0 | floor' "$f" 2>/dev/null || echo 0)"; [[ "$told" =~ ^[0-9]+$ ]] || told=0
  link="https://$host/admin/reports/health/history?tool=$tool"
  text=""
  if [ "$ok" = yes ]; then
    if [ "$was" = true ] && [ "$told" -gt 0 ] && [ "$on" = yes ] && [ "$want" = yes ] && [ "$rec" = yes ]; then
      text="✅ $host: $name আবার পাস করেছে ($(jq -r '.at // ""' "$sum" 2>/dev/null))। $link"
      told="$now"
    fi
    # the last line's time stays for the admin page ("passing; last line …")
    jq -cn --argjson told "$told" '{failing:false, told:$told}' > "$f.$$.tmp"
  else
    [ "$was" = true ] || { since="$now"; told=0; }
    if [ "$on" = yes ] && [ "$want" = yes ] && { [ "$told" -eq 0 ] || [ $((now - told)) -ge $((repeat * 3600)) ]; }; then
      local what; what="$(jq -r '[(.problems // [])[:3][] | tostring | .[:160]] | join("; ")' "$sum" 2>/dev/null || true)"
      if [ "$told" -eq 0 ]; then
        text="⚠️ $host: $name ব্যর্থ ($(jq -r '.at // ""' "$sum" 2>/dev/null))। ${what:-কারণ লেখা নেই}। দেখুন: $link&result=failed"
      else
        text="⚠️ $host: $name এখনো ব্যর্থ, $(((now - since) / 3600)) ঘণ্টা ধরে। ${what:-কারণ লেখা নেই}। দেখুন: $link&result=failed"
      fi
      told="$now"
    fi
    jq -cn --argjson since "$since" --argjson told "$told" '{failing:true, since:$since, told:$told}' > "$f.$$.tmp"
  fi
  chmod 0644 "$f.$$.tmp" && mv "$f.$$.tmp" "$f"
  if [ -z "$text" ]; then
    if [ "$on" = yes ] && [ "$want" = yes ]; then echo "run alert: nothing to say"; else echo "run alert: off"; fi
    return 0
  fi
  echo "run alert: $(alert_send "$text" "$sec" "$logf")"
  return 0
}

# alert_send <text> <secrets dir> <alert log>: the line goes to the alert log, and to the owner's Telegram when
# telegram.env holds the bot (PR 392); says which. Never fails. (PR 424; PR 570 shares it with the audit's report.)
alert_send() {
  local text="$1" sec="$2" logf="$3"
  mkdir -p "$(dirname "$logf")"
  echo "$(date -Is) $text" >> "$logf"
  if [ -f "$sec/telegram.env" ] && ( set +u
      # shellcheck disable=SC1091
      . "$sec/telegram.env"
      [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ] || exit 1
      curl -fsS -m 10 "${TELEGRAM_API_BASE:-https://api.telegram.org}/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" --data-urlencode "text=$text" >/dev/null 2>&1 ); then
    echo "sent on Telegram"
  else
    echo "written to the alert log (Telegram not connected or not reached)"
  fi
  return 0
}
