#!/usr/bin/env bash
# PR 414 follow-up (CN-013 go-live gate, phase 2; the owner's OK of 1 Nov 2026) — the go-live test orders on the preview
# site, on the VM (.github/workflows/gate-orders.yml, BY HAND ONLY — never on a schedule).
#   sudo infra/deploy/gate-orders.sh <out-dir> [all|1,5,7] [<commit sha>]
# 1. The host guard: the run starts only when server.conf names a preview host (EXTAS_STAGING_HOST) that is not one of
#    the hosts the shop sells on (EXTAS_EXTRA_HOSTS). The browser run checks it again against the shop's own saved
#    preview host and its store domains, and opens nothing but https on that host.
# 2. The oracle (tools/gate-orders/server/oracle.ts: the shop's own package functions, every connection on its mock)
#    runs in the live version's migrate image with only the shop's database address, a random token of this run and
#    the run's id, in a root-only temporary file that is gone when this ends. It is on the database network and on a
#    private network of this run, which the browser container alone shares.
# 3. The browser image of the smoke test (extas-smoke:<SMOKE_PLAYWRIGHT_VERSION>) walks the scenarios
#    (tools/gate-orders/shop.mjs) through Cloudflare with the preview login: phones and desktops on throttled networks
#    place the test orders like customers; at the end every test order is cancelled and the test products archived.
# 4. A safety net: when the browser run ended without its clean-up (stopped at the time limit, or crashed), the oracle's
#    one-shot clean-up runs here. Nothing is deleted, ever.
# 5. Live run 1 Nov — paying on the mocks. The run's own mock-payment grant (tools/gate-orders/lib/test-shop.ts openRun,
#    apps/web/src/lib/shop/gate-run.ts): a second random token of this run goes to the browser only (its cookie); the
#    oracle gets only its SHA-256, the preview host and the run's minutes. The practice gateway answers for that
#    browser alone, on the preview host, never for a real visitor; `payments.testPayments` stays as the owner set it.
#    GATE_ALLOW_COD=yes (the workflow's `allow_cod`, the owner's OK; anything else is no) switches cash on delivery on
#    for the run and puts the exact earlier value back. Whatever happens — a finished run, a failure, a crash, a stop at
#    the time limit, SIGINT or SIGTERM — the trap closes the grant and puts cash on delivery back (oracle --close-run),
#    each with an audit line as the system actor. No real payment key, price, discount or COD amount is touched.
# 6. Live run 2 (1 Nov: the browser run died in scenario 13 and the report did not say what happened to cash on
#    delivery). The owner's setting comes first, every time:
#    - at the start, before anything else is written, the oracle closes what an earlier run left open and puts cash on
#      delivery back from that run's own record (`--close-run --earlier`: its grant row, or its own setting-change line
#      when the row is gone); the report says so;
#    - the trap ignores a second INT/TERM while it works, stops the browser, closes this run's grant and puts cash on
#      delivery back FIRST, and only then cancels the test orders (that can take minutes);
#    - the report ALWAYS ends with a "Safety net" line: "cash on delivery put back to <previous>" (or "not touched") and
#      "test-pay grant closed" (or why not), in README.md and result.json (`safetyNet`), also when the browser run left
#      no report at all;
#    - `gate-orders.sh --sweep <out-dir>` is the workflow's last step (if: always(), so also after a cancelled job): the
#      same start check once more, said in the report when it found anything.
# <out-dir> gets README.md, result.json and a picture of each failed scenario; state/gate-orders.json the summary. No
# password, token, sign-in code or connection string is printed or kept. Exit 0 = passed (or nothing could run, with
# the reason in the report); 1 = a scenario or the clean-up failed; 2 = refused (wrong use, or the host guard).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
CONF="${EXTAS_CONFIG_FILE:-/etc/extas/server.conf}"
# shellcheck source=../config/server.conf
. "$CONF"
SWEEP=""
if [ "${1:-}" = --sweep ]; then SWEEP=yes; shift; fi
OUT="${1:?usage: gate-orders.sh [--sweep] <out-dir> [all|1,5,7] [<commit sha>]}"
ASKED="${2:-all}"
SHA="${3:-}"
ALLOW_COD="no"; [ "${GATE_ALLOW_COD:-no}" = yes ] && ALLOW_COD="yes"
R="$EXTAS_ROOT"; SEC="$R/config/secrets"; STATE="$R/state"
IMG="extas-smoke:$SMOKE_PLAYWRIGHT_VERSION"
PORT=8790
log() { echo "[gate-orders $(date +%H:%M:%S)] $*"; }

# ---- 1. what was asked, and the host guard ----
if ! [[ "$ASKED" =~ ^(all|[0-9]{1,2}([ ,]+[0-9]{1,2})*)$ ]]; then
  echo "usage: gate-orders.sh <out-dir> [all|1,5,7] (scenario numbers only)" >&2
  exit 2
fi
host_re='^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
preview="$(printf '%s' "${EXTAS_STAGING_HOST:-}" | tr 'A-Z' 'a-z')"
if ! [[ "$preview" =~ $host_re ]]; then
  log "refused: server.conf names no preview host (EXTAS_STAGING_HOST)"
  exit 2
fi
for h in ${EXTAS_EXTRA_HOSTS:-}; do
  if [ "$(printf '%s' "$h" | tr 'A-Z' 'a-z')" = "$preview" ]; then
    log "refused: the preview host is one of the hosts the shop sells on (EXTAS_EXTRA_HOSTS)"
    exit 2
  fi
done

mig="$(jq -r '.migrate // empty' "$STATE/last-good-deploy.json" 2>/dev/null || true)"
if [ -z "$mig" ] || ! docker image inspect "$mig" >/dev/null 2>&1; then
  mig="$(docker images --format '{{.Repository}}:{{.Tag}}' extas-migrate | head -n 1 || true)"
fi
[ -n "$mig" ] || { log "FAIL: no migrate image on this server (deploy first)"; exit 1; }


run_id="$(date -u +%Y%m%d%H%M%S)"
[ -z "$SWEEP" ] || run_id="sweep-$run_id"
net="extas-gate-$$"
oracle="extas-gate-oracle-$$"
work="$(mktemp -d "$SEC/.gate-orders.XXXXXX")"
oracle_up=""
shop_pid=""
start_note=""
at="$(TZ="$EXTAS_TIMEZONE" date '+%Y-%m-%d %H:%M')"

# ---- the report's "Safety net" (live run 2): what happened to the owner's cash on delivery and the run's grant ----

# The report in <out-dir>, whatever happened before (the browser run's own, else a short one that says it stopped).
ensure_report() {
  mkdir -p "$OUT"
  [ -f "$OUT/result.json" ] && [ -f "$OUT/README.md" ] && return 0
  if [ -f "$work/out/result.json" ] && [ -f "$work/out/README.md" ]; then
    cp "$work/out/README.md" "$work/out/result.json" "$OUT/"
    return 0
  fi
  printf '# Go-live gate — test orders on the preview site\n\n**সারকথা:** পরীক্ষা শেষ হয়নি — নিচে দেখুন।\n\n- The run stopped before the browser run wrote its report.\n' > "$OUT/README.md"
  jq -n --arg at "$at" '{kind: "gate-orders", at: $at, ok: false, scenarios: 0, passed: 0, failed: 0, skipped: 0, orders: 0, started: false, problems: ["the run stopped before the browser run wrote its report"]}' > "$OUT/result.json"
}

# Appends the Safety net lines to README.md and result.json (`safetyNet`): cash on delivery and the test-pay grant,
# read from the close's own answer (close-run.json: how this run's grant stands now, closed by whichever step).
safety_net() {
  local f="$work/net/close-run.json" cod="" grant="" cword gword bn
  if [ -z "$oracle_up" ]; then
    cod="not touched"; grant="none"
  elif [ -f "$f" ]; then
    cod="$(jq -r '.state.cod // empty' "$f" 2>/dev/null || true)"
    grant="$(jq -r '.state.grant // empty' "$f" 2>/dev/null || true)"
  fi
  case "$cod" in
    "") cword="cash on delivery: not known here — the close did not answer (the next run's start check puts it back first)"; bn="ক্যাশ অন ডেলিভারির অবস্থা জানা যায়নি — পরের রানের শুরুতেই আগের মতো ফেরানো হবে।" ;;
    "not touched"*) cword="cash on delivery $cod"; bn="ক্যাশ অন ডেলিভারিতে হাত দেওয়া হয়নি।" ;;
    "put back to "*) cword="cash on delivery $cod"; bn="ক্যাশ অন ডেলিভারি আগের অবস্থায় ফেরানো হয়েছে।" ;;
    *) cword="cash on delivery: $cod"; bn="ক্যাশ অন ডেলিভারি: নিচের ইংরেজি লাইন দেখুন।" ;;
  esac
  case "$grant" in
    closed) gword="test-pay grant closed"; bn="$bn টেস্ট-পেমেন্টের অনুমতি বন্ধ।" ;;
    none) gword="test-pay grant not opened"; bn="$bn টেস্ট-পেমেন্টের অনুমতি খোলাই হয়নি।" ;;
    open) gword="test-pay grant STILL OPEN — it expires by itself and the next run closes it first"; bn="$bn টেস্ট-পেমেন্টের অনুমতি এখনো খোলা — নিজে থেকেই বন্ধ হবে।" ;;
    *) gword="test-pay grant: not known here — the close did not answer (it expires by itself; the next run closes it first)"; bn="$bn টেস্ট-পেমেন্টের অনুমতির অবস্থা জানা যায়নি।" ;;
  esac
  grep -q '^## Safety net' "$OUT/README.md" || printf '\n## Safety net\n\n' >> "$OUT/README.md"
  {
    printf -- '- Safety net: %s; %s.\n' "$cword" "$gword"
    printf -- '- %s\n' "$bn"
    [ -z "$start_note" ] || printf -- '- Start check: %s\n' "$start_note"
  } >> "$OUT/README.md"
  jq --arg cod "$cword" --arg grant "$gword" --arg start "$start_note" '.safetyNet = {cod: $cod, grant: $grant, start: (if $start == "" then null else $start end)}' "$OUT/result.json" > "$OUT/.r.json" && mv "$OUT/.r.json" "$OUT/result.json"
}

# The start check's answer (earlier.json) in the report's words.
earlier_words() {
  local f="$1"
  [ -f "$f" ] || { echo "the check could not run here (the run went on; its own close still puts back what it changes)"; return; }
  jq -r '
    if (.closed // 0) == 0 and (.stray // null) == null then "nothing left open by an earlier run"
    else ([ (if (.closed // 0) > 0 then "an earlier run left \(.closed) test-pay grant(s) open: closed first (\((.runs // []) | map("run \(.run): cash on delivery \(.cod)") | join("; ")))" else empty end),
            (.stray // empty) ] | join("; ")) end' "$f"
}

finish() {
  local code=$?
  set +e
  trap '' INT TERM   # a second signal never cuts the owner's setting short
  # a signal while the browser run is on: stop it first (bash runs the trap at once because the run waits in `wait`)
  if [ -n "$shop_pid" ]; then
    kill "$shop_pid" >/dev/null 2>&1
    docker rm -f "extas-gate-shop-$$" >/dev/null 2>&1
  fi
  # 1. the owner's setting first: the run's grant closed and cash on delivery put back (safe twice), and how it stands
  if [ -n "$oracle_up" ]; then
    oracle_run --rm --name "$oracle-close" -- --close-run --out /out/close-run.json >/dev/null 2>&1 || log "the run's grant could not be closed here: the next run's start check closes it first, and it expires by itself"
  fi
  # 2. then the test orders (minutes): cancelled, the products archived
  if [ -n "$shop_pid" ]; then
    log "stopped by a signal: cancelling every open test order and archiving the test products now"
    oracle_run --rm --name "$oracle-cleanup" -- --cleanup --out /out/cleanup.json >/dev/null 2>&1 || log "the clean-up could not run here: the next run cancels every open test order first"
    ensure_report
    if [ -f "$work/net/cleanup.json" ]; then
      printf '\n## Safety net\n\n- Stopped by a signal; the server ran the clean-up: %s test orders cancelled, %s test products archived.\n' "$(jq -r '.cancelled // 0' "$work/net/cleanup.json")" "$(jq -r '.productsArchived // 0' "$work/net/cleanup.json")" >> "$OUT/README.md"
    fi
    shop_pid=""
  fi
  # 3. the report always says it
  if [ -z "$SWEEP" ]; then
    ensure_report
    safety_net
    log "safety net: $(jq -r '"\(.safetyNet.cod); \(.safetyNet.grant)"' "$OUT/result.json" 2>/dev/null)"
  fi
  docker rm -f "$oracle" >/dev/null 2>&1
  docker network rm "$net" >/dev/null 2>&1
  rm -rf "$work"
  exit "$code"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir -p "$OUT" "$STATE" "$work/out" "$work/net"
[ -n "$SWEEP" ] || rm -f "$OUT/README.md" "$OUT/result.json" "$OUT"/*.jpg   # never an older run's report in this run's place
chown "${GATE_IMAGE_UID:-1000}:${GATE_IMAGE_UID:-1000}" "$work/net"   # the migrate image runs as `node`

# ---- 2. the oracle: the database address (the app's own role once it has one, as erp-acceptance.sh), a random token ----
limit_min="${GATE_ORDERS_TIMEOUT_MIN:-120}"
[[ "$limit_min" =~ ^[0-9]{1,3}$ ]] || limit_min=120
token="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
pay_token="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
pay_hash="$(printf '%s' "$pay_token" | sha256sum | cut -d' ' -f1)"
{
  if grep -q '^DATABASE_URL=postgresql://extas_app:' "$SEC/app.env"; then
    grep -E '^DATABASE_URL=' "$SEC/app.env" | head -n 1
  else
    grep -E '^DATABASE_DIRECT_URL=' "$SEC/app.env" | sed 's/^DATABASE_DIRECT_URL=/DATABASE_URL=/'
  fi
  echo "GATE_ORACLE_TOKEN=$token"
  echo "GATE_RUN_ID=$run_id"
  echo "GATE_PAY_TOKEN_HASH=$pay_hash"
  echo "GATE_PREVIEW_HOST=$preview"
  echo "GATE_RUN_MINUTES=$((limit_min + 15))"
  echo "GATE_ALLOW_COD=$ALLOW_COD"
} > "$work/oracle.env"
grep -q '^DATABASE_URL=' "$work/oracle.env" || { log "FAIL: no database address in the server's secrets"; exit 1; }
{
  echo "GATE_ORACLE_TOKEN=$token"
  echo "GATE_PAY_TOKEN=$pay_token"
  echo "SMOKE_HTTP_USER=$EXTAS_STAGING_USER"
  echo "SMOKE_HTTP_PASSWORD=$(grep '^STAGING_PASSWORD=' "$SEC/staging.env" | cut -d= -f2-)"
} > "$work/shop.env"

TSX=/repo/packages/jobs/node_modules/.bin/tsx
oracle_run() {   # <docker run options> -- <oracle.ts arguments>: the migrate image with this checkout's tools/gate-orders
  local opts=()  # mounted where the @extas packages resolve (apps/web/node_modules)
  while [ "$#" -gt 0 ] && [ "$1" != -- ]; do opts+=("$1"); shift; done
  shift
  docker run "${opts[@]}" --network extas --env-file "$work/oracle.env" -v "$REPO/tools/gate-orders:/repo/apps/web/gate-orders:ro" \
    -v "$work/net:/out" -w /repo/apps/web/gate-orders/server "$mig" "$TSX" oracle.ts "$@"
}
if ! docker run --rm --name "extas-gate-probe-$$" "$mig" test -x "$TSX"; then
  log "FAIL: the migrate image $mig has no tsx (an image older than this run)"
  exit 1
fi

# ---- the start check (live run 2): what an earlier run left open is closed and cash on delivery put back FIRST ----
if [ -n "$SWEEP" ]; then
  oracle_run --rm --name "$oracle-sweep" -- --close-run --earlier --out /out/earlier.json >/dev/null 2>&1 || true
  said="$(earlier_words "$work/net/earlier.json")"
  log "sweep: $said"
  if [ -f "$work/net/earlier.json" ] && [ "$said" != "nothing left open by an earlier run" ] && [ -f "$OUT/README.md" ] && [ -f "$OUT/result.json" ]; then
    printf -- '- The workflow'"'"'s last step: %s\n' "$said" >> "$OUT/README.md"
    jq --arg s "$said" '.safetyNet.sweep = $s' "$OUT/result.json" > "$OUT/.r.json" && mv "$OUT/.r.json" "$OUT/result.json"
  fi
  exit 0
fi
oracle_up=yes   # from here on the trap closes this run's grant and puts cash on delivery back, whatever happens
oracle_run --rm --name "$oracle-earlier" -- --close-run --earlier --out /out/earlier.json >/dev/null 2>&1 || log "the start check did not finish (see the report)"
start_note="$(earlier_words "$work/net/earlier.json")"
log "start check: $start_note"

docker network create "$net" >/dev/null
oracle_run -d --name "$oracle" -- --serve "$PORT" >/dev/null
docker network connect "$net" "$oracle"

if ! docker image inspect "$IMG" >/dev/null 2>&1; then
  log "building the browser image $IMG (once)"
  docker build -q -f "$HERE/smoke.Dockerfile" --build-arg PLAYWRIGHT_VERSION="$SMOKE_PLAYWRIGHT_VERSION" -t "$IMG" "$HERE" >/dev/null
fi

# ---- 3. the browser run, on the run's own network only (no database network, no database address) ----
log "test orders on https://$preview (scenarios: $ASKED; cash on delivery for the run: $ALLOW_COD), at most $limit_min min"
rc=0
timeout "$((limit_min * 60))" docker run --rm --name "extas-gate-shop-$$" --ipc=host --network "$net" --env-file "$work/shop.env" -e BASE="https://$preview" -e GATE_PREVIEW_HOST="$preview" -e GATE_EXTRA_HOSTS="${EXTAS_EXTRA_HOSTS:-}" -e GATE_ORACLE_URL="http://$oracle:$PORT" -e GATE_SCENARIOS="$ASKED" -e GATE_OUT=/out -e GATE_RUN_ID="$run_id" -e GATE_SHA="${SHA:0:12}" -e GATE_AT="$at ($EXTAS_TIMEZONE)" -e GATE_LHRC=/w/lighthouserc.json -v "$REPO/tools:/w/tools:ro" -v "$REPO/lighthouserc.json:/w/lighthouserc.json:ro" -v "$work/out:/out" "$IMG" node /w/tools/gate-orders/shop.mjs &
shop_pid=$!   # in the background and waited for, so SIGINT/SIGTERM reach the trap at once, not after the browser run
wait "$shop_pid" || rc=$?
shop_pid=""
[ "$rc" = 124 ] && { docker rm -f "extas-gate-shop-$$" >/dev/null 2>&1 || true; log "stopped after $limit_min min"; }

# ---- 4. the safety net: the clean-up when the browser run ended without one ----
# (a run the browser side refused before it made anything, `started` false, needs none and gets none)
if [ ! -f "$work/out/result.json" ] || [ "$(jq -r 'if .started == true then (.cleanup.ok // false) else true end' "$work/out/result.json")" != true ]; then
  log "the run ended without a full clean-up: cancelling every open test order and archiving the test products now"
  docker rm -f "$oracle" >/dev/null 2>&1 || true
  oracle_run --rm --name "$oracle" -- --cleanup --out /out/cleanup.json || true
  browser_rc="$rc"; rc=1   # a run that needed the safety net failed, whatever the browser's own exit was
  if [ ! -f "$work/out/result.json" ]; then
    printf '# Go-live gate — test orders on the preview site\n\n**সারকথা:** পরীক্ষা শেষ হয়নি; সব টেস্ট অর্ডার বাতিল করার চেষ্টা হয়েছে — নিচে দেখুন।\n\n- The browser run ended without a report (exit %s).\n' "$browser_rc" > "$work/out/README.md"
    jq -n --arg at "$at" --argjson rc "$browser_rc" '{kind: "gate-orders", at: $at, ok: false, scenarios: 0, passed: 0, failed: 0, skipped: 0, orders: 0, started: true, problems: ["the browser run ended without a report (exit \($rc))"]}' > "$work/out/result.json"
  elif [ "$(jq -r '.finished // true' "$work/out/result.json")" = false ]; then
    printf '\n- The browser run stopped after the scenarios above (exit %s); the report is what it had written by then.\n' "$browser_rc" >> "$work/out/README.md"
  fi
  if [ -f "$work/net/cleanup.json" ]; then
    jq --slurpfile c "$work/net/cleanup.json" '.cleanup = $c[0] | .ok = false' "$work/out/result.json" > "$work/out/r.json" && mv "$work/out/r.json" "$work/out/result.json"
    printf '\n## Safety net\n\n- The run ended without its clean-up; the server ran it afterwards: %s test orders cancelled, %s test products archived%s.\n' \
      "$(jq -r '.cancelled' "$work/net/cleanup.json")" "$(jq -r '.productsArchived // 0' "$work/net/cleanup.json")" "$(jq -r 'if .ok then "" else " (not complete — see result.json)" end' "$work/net/cleanup.json")" >> "$work/out/README.md"
  else
    printf '\n## Safety net\n\n- The clean-up could not run here either: the next run cancels every open test order first.\n' >> "$work/out/README.md"
  fi
fi
cp "$work/out/README.md" "$work/out/result.json" "$OUT/"
find "$work/out" -maxdepth 1 -name 'scenario-*.jpg' -size -400k -exec cp {} "$OUT/" \;   # a picture of each failed scenario
jq -c --argjson rc "$rc" '{at, exit: $rc, ok, scenarios, passed, failed, skipped, orders, cleanup: (.cleanup.ok // false)}' "$OUT/result.json" > "$STATE/gate-orders.json"
log "$(jq -r '"\(if .ok then "PASS" else "FAIL" end): \(.passed) passed, \(.failed) failed, \(.skipped) skipped, \(.orders) test orders"' "$OUT/result.json")"
exit "$rc"
