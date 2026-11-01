#!/usr/bin/env bash
# PR 414 follow-up (CN-013 phase 2, owner 1 Nov 2026) — the go-live gate's customer 360° run, on the VM (gate-c360.yml,
# by hand only). One test customer walks the whole life cycle on the preview: before, during and after an order, his
# account and support (tools/gate-c360/run.mjs; the owner OK'd real test orders on the preview, 1 Nov).
#   sudo infra/deploy/gate-c360.sh <out-dir> [<commit sha>] [<scenarios>]
#   <scenarios>: all (default) or a list of before, order, account, support, after.
# 1. It refuses to run unless the address is the preview host of server.conf (EXTAS_STAGING_HOST), that host is not a
#    public one (EXTAS_EXTRA_HOSTS), and the main domain is not open yet (EXTAS_MAIN_OPEN): after go-live the preview and
#    the real shop share one database. Nothing about the host is written here.
# 2. It refuses to run while any customer-facing connection (courier, SMS, payment, WhatsApp, e-mail, Messenger, ad
#    platforms, AI, fraud check, ERP) is anything but its mock (tools/gate-c360/helper.ts guard; A1.3). The run itself
#    stops at once if the sign-in code did not go through the mock SMS.
# 3. The gate's number is made fresh each run (gate-c360.json phonePrefix + 8 random digits) and refused when a real
#    customer has it; every row it makes is named "GATE TEST …".
# 4. The read-only check account gets a fresh password and two-step seed, exactly as for the smoke test (smoke.sh); they
#    go to a root-only temporary file and are gone when this ends. No password, seed, code or connection string is
#    printed or kept.
# 5. The browser image of the smoke test walks the run; its questions for the database (the mock SMS inbox, moving the
#    order on the mocks, the stored facts, the messages' words) come as files in a bridge folder that a loop here answers
#    with helper.ts from the live version's migrate image (only the actions on the list below).
# 6. At the end the gate cancels what is still open and archives its rows (helper.ts cleanup, run again here in case the
#    browser part stopped early). Nothing is deleted, ever.
# 7. <out-dir> gets README.md, result.json and a picture of each failed step (gate-c360.yml commits them).
# 8. Live run 1 Nov (no products, nothing to pay with): before the browser part the run makes its own GATE TEST
#    products (tools/gate-orders/lib/test-shop.ts, shared with gate-orders, mounted beside helper.ts) and opens its
#    run's mock-payment grant: a random token goes to the browser only (its cookie, in the root-only env file), the
#    helper gets its SHA-256 and the preview host. The practice gateway answers for that browser alone; cash on delivery
#    and `payments.testPayments` stay as the owner set them. The trap closes the grant on any exit, a failure or a signal
#    included (an audit line as the system actor), and the clean-up archives the products.
# Exit 0 = every step passed or was skipped with its reason; 1 = a step failed or the run could not finish; 2 = refused.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
CONF="${EXTAS_CONFIG_FILE:-/etc/extas/server.conf}"
# shellcheck source=../config/server.conf
. "$CONF"
OUT="${1:?usage: gate-c360.sh <out-dir> [<commit sha>] [<scenarios>]}"
SHA="${2:-}"
SCENARIOS="${3:-all}"
R="$EXTAS_ROOT"; SEC="$R/config/secrets"; STATE="$R/state"
CFG="$REPO/tools/gate-c360/gate-c360.json"
IMG="extas-smoke:$SMOKE_PLAYWRIGHT_VERSION"
log() { echo "[gate-c360 $(date +%H:%M:%S)] $*"; }

# gate_host_refusal <preview host> <extra hosts> <main open>: prints why the run may not go on (nothing: it may).
gate_host_refusal() {
  local host="${1:-}" extra="${2:-}" open="${3:-no}" h
  [ -n "$host" ] || { echo "no preview host in server.conf (EXTAS_STAGING_HOST)"; return; }
  for h in $extra; do
    [ "$h" = "$host" ] && { echo "the preview host is also a public host (EXTAS_EXTRA_HOSTS)"; return; }
  done
  [ "$open" = yes ] && { echo "the main domain is open (EXTAS_MAIN_OPEN=yes): the gate never orders beside real customers"; return; }
  return 0
}

# gate_scenarios_ok <list>: only the scenario names, commas and spaces (never anything else into an argument).
gate_scenarios_ok() {
  [[ "${1:-}" =~ ^[a-z,\ ]{1,60}$ ]]
}

# gate_action_ok <action>: what the browser part may ask of the database through the bridge.
gate_action_ok() {
  case "${1:-}" in otp | deliver | facts | messages | customer | cleanup | switches) return 0 ;; *) return 1 ;; esac
}

why="$(gate_host_refusal "${EXTAS_STAGING_HOST:-}" "${EXTAS_EXTRA_HOSTS:-}" "${EXTAS_MAIN_OPEN:-no}")"
if [ -n "$why" ]; then log "REFUSED: $why"; exit 2; fi
if ! gate_scenarios_ok "$SCENARIOS"; then log "REFUSED: scenarios are a list of before, order, account, support, after"; exit 2; fi
BASE="https://$EXTAS_STAGING_HOST"

work="$(mktemp -d "$SEC/.gate-c360.XXXXXX")"
loop_pid=""
pay_open=""
run=""
c360_pid=""
cleanup_work() {
  # a signal while the browser run is on: stop it and clean up its orders and products (helper cleanup is safe twice)
  if [ -n "$c360_pid" ]; then
    kill "$c360_pid" 2>/dev/null || true
    docker rm -f "extas-gate-c360-$$" >/dev/null 2>&1 || true
    log "stopped by a signal — clean-up: $(helper cleanup "{\"phone\":\"$phone\"}" | jq -c 'del(.leftAlone)' 2>/dev/null || echo 'no answer')"
  fi
  [ -n "$loop_pid" ] && kill "$loop_pid" 2>/dev/null || true
  # the run's mock-payment grant closed, whatever ended the run (safe twice)
  local pc="" grant="test-pay grant not opened"
  if [ -n "$pay_open" ]; then
    pc="$(helper payclose "{\"run\":\"$run\"}" 2>/dev/null || true)"
    log "closing the run's mock-payment grant: $(printf '%s' "$pc" | jq -c '{ok, closed}' 2>/dev/null || echo 'no answer: it expires by itself')"
    if [ "$(printf '%s' "$pc" | jq -r '.ok // false' 2>/dev/null || true)" = true ]; then grant="test-pay grant closed"
    else grant="test-pay grant: not known here — the close did not answer (it expires by itself; the next run closes it first)"; fi
  fi
  safety_line "$grant" || true
  rm -rf "$work"
}
# Live run 2 (1 Nov): the report always ends with its Safety net line. This gate opens its grant with cash on delivery
# "no", so the owner's setting is never touched; the line says so, and how the grant stands.
safety_line() {
  [ -d "$OUT" ] || return 0
  if [ ! -f "$OUT/result.json" ] || [ ! -f "$OUT/README.md" ]; then
    jq -n --arg at "${at:-}" --arg sha "${SHA:0:12}" '{at:$at, sha:$sha, ok:false, steps:0, problems:["the run stopped before the browser part wrote its report"]}' > "$OUT/result.json"
    printf '# Customer 360° gate — FAIL\n\n%s · the run stopped before the browser part wrote its report. See the workflow log.\n' "${at:-}" > "$OUT/README.md"
  fi
  printf '\n## Safety net\n\n- Safety net: cash on delivery not touched (this gate never switches it on); %s.\n' "$1" >> "$OUT/README.md"
  jq --arg cod "cash on delivery not touched" --arg grant "$1" '.safetyNet = {cod: $cod, grant: $grant}' "$OUT/result.json" > "$OUT/.r.json" && mv "$OUT/.r.json" "$OUT/result.json"
}
trap cleanup_work EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir -p "$OUT"
rm -rf "${OUT:?}"/*

# The live version's migrate image holds the auth command and the workspace packages helper.ts uses (as in smoke.sh).
mig="$(jq -r '.migrate // empty' "$STATE/last-good-deploy.json" 2>/dev/null || true)"
if [ -z "$mig" ] || ! docker image inspect "$mig" >/dev/null 2>&1; then
  mig="$(docker images --format '{{.Repository}}:{{.Tag}}' extas-migrate | head -n 1 || true)"
fi
[ -n "$mig" ] || { log "FAIL: no migrate image on this server (deploy first)"; exit 1; }
grep -E '^(DATABASE_DIRECT_URL|VAULT_MASTER_KEY)=' "$SEC/app.env" > "$work/db.env"

# helper <action> <json>: one helper.ts action; its one-line JSON answer on stdout.
helper() {
  # shellcheck disable=SC2016  # expanded inside the container
  docker run --rm --network extas --env-file "$work/db.env" \
    -v "$REPO/tools/gate-c360/helper.ts:/repo/packages/jobs/.gate-c360/helper.ts:ro" -v "$REPO/tools/gate-orders:/repo/packages/jobs/.gate-orders:ro" "$mig" \
    sh -c 'cd /repo/packages/jobs && exec ./node_modules/.bin/tsx .gate-c360/helper.ts "$@"' gate "$1" "$2" 2>/dev/null | tail -n 1
}

log "guard: every customer-facing connection must be its mock"
g="$(helper guard '{}' || true)"
if [ "$(printf '%s' "$g" | jq -r '.ok // false' 2>/dev/null)" != true ]; then
  log "REFUSED: not every provider is a mock ($(printf '%s' "$g" | jq -r '(.live // []) | join(", ")' 2>/dev/null || echo "the guard did not answer"))"
  exit 2
fi

# The gate's number: the operator prefix and eight fresh digits, refused when a real customer has it.
prefix="$(jq -r '.phonePrefix' "$CFG")"
phone=""
for _ in 1 2 3 4 5; do
  n="$(od -An -N4 -tu4 /dev/urandom | tr -d ' \n')"
  cand="$(printf '%s%08d' "$prefix" "$((n % 100000000))")"
  [[ "$cand" =~ ^01[3-9][0-9]{8}$ ]] || continue
  if [ "$(helper facts "{\"phone\":\"$cand\"}" | jq -r '.ok // false' 2>/dev/null)" = true ]; then phone="$cand"; break; fi
done
[ -n "$phone" ] || { log "FAIL: no free test number found"; exit 1; }
run="$(date +%Y%m%d%H%M)"

log "the run's own GATE TEST products, and its mock-payment grant on $EXTAS_STAGING_HOST"
made="$(helper products "{\"run\":\"$run\"}" || true)"
paths="$(printf '%s' "$made" | jq -r '(.products // []) | map(.path) | join(",")' 2>/dev/null || true)"
[[ "$paths" =~ ^[a-z0-9/,-]{0,400}$ ]] || paths=""
[ -n "$paths" ] || log "no GATE TEST products could be made ($(printf '%s' "$made" | jq -r '.error // "no answer"' 2>/dev/null)): the steps that need one are a SKIP"
pay_token="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
pay_hash="$(printf '%s' "$pay_token" | sha256sum | cut -d' ' -f1)"
minutes="$(jq -r '.waits.runMin // 45' "$CFG")"
[[ "$minutes" =~ ^[0-9]+$ ]] || minutes=45
pay_open=yes
g="$(helper payopen "{\"run\":\"$run\",\"hash\":\"$pay_hash\",\"host\":\"$EXTAS_STAGING_HOST\",\"minutes\":$((minutes + 15)),\"cod\":\"no\"}" || true)"
log "mock-payment grant: $(printf '%s' "$g" | jq -c '{open, why}' 2>/dev/null || echo 'no answer')"
[ "$(printf '%s' "$g" | jq -r '.open // false' 2>/dev/null)" = true ] || pay_token=""

log "check account (read-only, fresh password and two-step seed)"
mkdir -m 0700 "$work/acct"
chown "${SMOKE_IMAGE_UID:-1000}:${SMOKE_IMAGE_UID:-1000}" "$work/acct"
docker run --rm --name "extas-gcheck-$$" --network extas --env-file "$work/db.env" -v "$work/acct:/out" \
  -e SMOKE_CHECK_EMAIL="$SMOKE_CHECK_EMAIL" -e SMOKE_CHECK_NAME="$SMOKE_CHECK_NAME" "$mig" \
  sh -c 'cd /repo/packages/auth && exec ./node_modules/.bin/tsx src/cli.ts check-account --email "$SMOKE_CHECK_EMAIL" --name "$SMOKE_CHECK_NAME" --write-to /out/check.env'
[ -s "$work/acct/check.env" ] || { log "FAIL: the check account could not be prepared"; exit 1; }
{
  cat "$work/acct/check.env"
  echo "SMOKE_HTTP_USER=$EXTAS_STAGING_USER"
  echo "SMOKE_HTTP_PASSWORD=$(grep '^STAGING_PASSWORD=' "$SEC/staging.env" | cut -d= -f2-)"
  echo "GATE_PAY_TOKEN=$pay_token"
  echo "GATE_PRODUCT_PATHS=$paths"
} > "$work/gate.env"
rm -f "$work/acct/check.env"

if ! docker image inspect "$IMG" >/dev/null 2>&1; then
  log "building the browser image $IMG (once)"
  docker build -q -f "$HERE/smoke.Dockerfile" --build-arg PLAYWRIGHT_VERSION="$SMOKE_PLAYWRIGHT_VERSION" -t "$IMG" "$HERE" >/dev/null
fi

# The bridge: the browser part writes req-<id>.json ({action, args}); this loop answers res-<id>.json.
bridge="$work/bridge"
mkdir -m 0700 "$bridge"
chown "${SMOKE_IMAGE_UID:-1000}:${SMOKE_IMAGE_UID:-1000}" "$bridge"
(
  while [ ! -e "$bridge/.stop" ]; do
    for req in "$bridge"/req-*.json; do
      [ -e "$req" ] || continue
      id="${req##*/req-}"; id="${id%.json}"
      if ! [[ "$id" =~ ^[0-9]+-[0-9]+$ ]] || [ "$(stat -c %s "$req")" -gt 4096 ]; then rm -f "$req"; continue; fi
      action="$(jq -r '.action // ""' "$req" 2>/dev/null || true)"
      args="$(jq -c '.args // {}' "$req" 2>/dev/null || echo '{}')"
      if gate_action_ok "$action"; then
        echo "[gate-c360 $(date +%H:%M:%S)] bridge: $action" >&2
        answer="$(helper "$action" "$args" || true)"
      else
        answer='{"ok":false,"error":"this action is not allowed through the bridge"}'
      fi
      [ -n "$answer" ] || answer='{"ok":false,"error":"no answer"}'
      printf '%s\n' "$answer" > "$bridge/.res-$id.json"
      chmod 0644 "$bridge/.res-$id.json"
      mv "$bridge/.res-$id.json" "$bridge/res-$id.json"
      rm -f "$req"
    done
    sleep 0.5
  done
) &
loop_pid=$!

log "walking one test customer through the life cycle on $BASE (scenarios: $SCENARIOS)"
at="$(TZ="$EXTAS_TIMEZONE" date '+%Y-%m-%d %H:%M')"
rc=0
timeout "$((minutes * 60))" docker run --rm --name "extas-gate-c360-$$" --ipc=host --env-file "$work/gate.env" \
  -e BASE="$BASE" -e GATE_PREVIEW_HOST="$EXTAS_STAGING_HOST" -e GATE_EXTRA_HOSTS="${EXTAS_EXTRA_HOSTS:-}" -e GATE_MAIN_OPEN="${EXTAS_MAIN_OPEN:-no}" \
  -e GATE_PHONE="$phone" -e GATE_RUN="$run" -e GATE_SCENARIOS="$SCENARIOS" -e GATE_OUT=/out -e GATE_BRIDGE=/bridge \
  -e GATE_SHA="${SHA:0:12}" -e GATE_AT="$at ($EXTAS_TIMEZONE)" -e GATE_KIND="by hand" \
  -v "$REPO/tools:/w/tools:ro" -v "$REPO/docs/qa:/w/docs/qa:ro" -v "$OUT:/out" -v "$bridge:/bridge" \
  "$IMG" node /w/tools/gate-c360/run.mjs &
c360_pid=$!   # in the background and waited for, so SIGINT/SIGTERM reach the trap at once, not after the browser run
wait "$c360_pid" || rc=$?
c360_pid=""

touch "$bridge/.stop"
wait "$loop_pid" 2>/dev/null || true
loop_pid=""

# The clean-up again (it is safe twice): the browser part may have stopped before its own.
c="$(helper cleanup "{\"phone\":\"$phone\"}" || true)"
log "clean-up: $(printf '%s' "$c" | jq -c 'del(.leftAlone)' 2>/dev/null || echo 'no answer')"
if [ ! -f "$OUT/result.json" ]; then
  jq -n --arg at "$at" --arg sha "${SHA:0:12}" --arg rc "$rc" '{at:$at, sha:$sha, ok:false, steps:0, problems:["the run did not finish (exit " + $rc + ")"]}' > "$OUT/result.json"
  printf '# Customer 360° gate — FAIL\n\n%s · the run did not finish (exit %s). See the workflow log.\n' "$at" "$rc" > "$OUT/README.md"
fi
log "$(jq -r 'if .ok then "PASS: \(.pass) pass, \(.skip) skip of \(.steps) steps" else "FAIL: \((.problems // [])[:5] | join("; "))" end' "$OUT/result.json")"
exit "$rc"
