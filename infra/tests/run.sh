#!/usr/bin/env bash
# Infra unit tests — run in CI (no root, no real disks). Exit non-zero on the first failure.
set -euo pipefail
cd "$(dirname "$0")"
B=../server/bin
fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1: expected [$3] got [$2]"; fail=1; fi; }

# Data disk finder (PR 3)
check "data disk on Azure v6 layout" "$(LSBLK_JSON=lsblk-azure-v6.json ROOT_SRC=/dev/nvme0n1p1 $B/extas-find-data-disk)" "/dev/nvme0n2"
jq '.blockdevices[1].fstype="ext4"' lsblk-azure-v6.json > /tmp/lsblk-used.json
check "used disk is never picked" "$(LSBLK_JSON=/tmp/lsblk-used.json ROOT_SRC=/dev/nvme0n1p1 $B/extas-find-data-disk)" ""
jq '.blockdevices[1].size=10737418240' lsblk-azure-v6.json > /tmp/lsblk-small.json
check "small disk is never picked" "$(LSBLK_JSON=/tmp/lsblk-small.json ROOT_SRC=/dev/nvme0n1p1 $B/extas-find-data-disk)" ""

# Hardware-aware profile (PR 604): exact A2.9.5 table on the reference box
P="$($B/extas-profile --cpu 8 --mem-kb 65842000)"
g() { grep "^$1=" <<<"$P" | cut -d= -f2; }
check "64 GB nominal" "$(g PROFILE_DETECTED_RAM_GB)" "64"
check "pg 16 GB" "$(g PG_MEM_MB)" "16384"
check "shared_buffers 16 GB" "$(g PG_SHARED_BUFFERS_MB)" "16384"
check "effective_cache 40 GB" "$(g PG_EFFECTIVE_CACHE_MB)" "40960"
check "redis 6 GB" "$(g REDIS_MEM_MB)" "6144"
check "redis queue 2 GB" "$(g REDIS_QUEUE_MEM_MB)" "2048"
check "meili 4 GB" "$(g MEILI_MEM_MB)" "4096"
check "app 16 GB" "$(g APP_MEM_MB)" "16384"
check "6 replicas" "$(g APP_REPLICAS)" "6"
check "node heap 75% of a replica" "$(g APP_NODE_HEAP_MB)" "2048"
check "worker 6 GB" "$(g WORKER_MEM_MB)" "6144"
check "jobs 4 GB" "$(g JOBS_MEM_MB)" "4096"
check "one background worker (PR 6)" "$(g JOBS_REPLICAS)" "1"
check "worker memory per copy" "$(g JOBS_REPLICA_MEM_MB)" "4096"
check "worker heap 75% of its memory" "$(g JOBS_NODE_HEAP_MB)" "3072"
check "caddy 1 GB" "$(g CADDY_MEM_MB)" "1024"
check "OS 11 GB" "$(g OS_RESERVE_MB)" "11264"
check "total 64 GB" "$(g PROFILE_TOTAL_MB)" "65536"
# Smaller server (4 vCPU / 16 GB): computed, never above the machine
P="$($B/extas-profile --cpu 4 --mem-kb 16384000)"
check "16 GB nominal" "$(g PROFILE_DETECTED_RAM_GB)" "16"
check "3 replicas on 4 vCPU" "$(g APP_REPLICAS)" "3"
check "total fits 16 GB" "$([ "$(g PROFILE_TOTAL_MB)" -le 16384 ] && echo yes)" "yes"
P="$($B/extas-profile --cpu 2 --mem-kb 4000000)"
check "tiny box still 1 replica" "$(g APP_REPLICAS)" "1"

# NVMe detection (PR 601): only the Direct Disk is ever chosen
T="$(mktemp -d)"
mkdir -p "$T/nvme0n1/device" "$T/nvme0n2/device" "$T/nvme1n1/device" "$T/nvme0n1p1"
echo "MSFT NVMe Accelerator v1.0" > "$T/nvme0n1/device/model"
echo "MSFT NVMe Accelerator v1.0" > "$T/nvme0n2/device/model"
echo "Microsoft NVMe Direct Disk v2" > "$T/nvme1n1/device/model"
check "temp NVMe is the Direct Disk only" "$(SYS_BLOCK=$T EXTAS_CONFIG_FILE=/nonexistent $B/extas-nvme-prepare --list)" "/dev/nvme1n1"
rm -rf "$T"

# env_set (PR 491–496: the database URLs in app.env): replaces in place, keeps other lines, adds a missing key,
# prints nothing, keeps mode 600 and leaves the file alone when nothing changes
# shellcheck source=../server/lib.sh
EXTAS_CONFIG_FILE=../config/server.conf . ../server/lib.sh
T="$(mktemp -d)"; E="$T/app.env"
printf 'SESSION_SECRET=keep\nDATABASE_URL=old\n' > "$E"; chmod 644 "$E"
out="$(env_set "$E" DATABASE_URL 'postgresql://u:p@h:6432/d?pgbouncer=true&x=\1')"
env_set "$E" DATABASE_DIRECT_URL 'postgresql://u:p@h:5432/d'
check "env_set replaces in place" "$(sed -n 2p "$E")" 'DATABASE_URL=postgresql://u:p@h:6432/d?pgbouncer=true&x=\1'
check "env_set keeps other lines" "$(sed -n 1p "$E")" "SESSION_SECRET=keep"
check "env_set adds a missing key" "$(sed -n 3p "$E")" "DATABASE_DIRECT_URL=postgresql://u:p@h:5432/d"
check "env_set prints nothing" "$out" ""
check "env_set file is 600" "$(stat -c %a "$E")" "600"
inode="$(stat -c %i "$E")"
env_set "$E" DATABASE_DIRECT_URL 'postgresql://u:p@h:5432/d'
check "env_set leaves an unchanged file alone" "$(stat -c %i "$E"):$(wc -l < "$E")" "$inode:3"
rm -rf "$T"

# First owner account (PR 15, CN-009): extas-owner-create with a stand-in `docker` (no server, no database). The
# e-mail never reaches the output or the report, the first password lands in a 0600 file the reader shows, a second
# run refuses and changes nothing, a database that already has an owner is refused, and a bad e-mail stops early.
T="$(mktemp -d)"
mkdir -p "$T/root/config/secrets" "$T/root/state" "$T/bin"
printf 'EXTAS_ROOT=%s\nEXTAS_TIMEZONE=Asia/Dhaka\nEXTAS_STAGING_HOST=example.test\n' "$T/root" > "$T/server.conf"
printf 'SESSION_SECRET=s\nDATABASE_URL=postgresql://u:p@pgb:6432/d\nDATABASE_DIRECT_URL=postgresql://u:p@pg:5432/d\n' > "$T/root/config/secrets/app.env"
echo '{"migrate":"extas-migrate:abc"}' > "$T/root/state/last-good-deploy.json"
cat > "$T/bin/docker" <<'FAKE'
#!/usr/bin/env bash
# stand-in for docker: `image inspect` / `images` answer; `run` checks its inputs like the container would
case "$1" in
  image) exit 0 ;;
  images) echo "extas-migrate:abc"; exit 0 ;;
  run)
    shift; envs=(); out=""
    while [ $# -gt 0 ]; do
      case "$1" in --env-file) envs+=("$2"); shift 2 ;; -v) out="${2%%:*}"; shift 2 ;; --name|--network) shift 2 ;; --rm) shift ;; *) break ;; esac
    done
    db="$(cat "${envs[0]}")"; own="$(cat "${envs[1]}")"
    [ "$db" = "DATABASE_DIRECT_URL=postgresql://u:p@pg:5432/d" ] || { echo "db env file holds more than the direct URL"; exit 9; }
    grep -q '^OWNER_EMAIL=owner@example.test$' <<<"$own" || { echo "no e-mail in the owner env file"; exit 9; }
    echo "$*" >> "$FAKE_LOG"
    if [ -n "${FAKE_OWNER_EXISTS:-}" ]; then echo "auth create-owner: FAILED — an owner exists already: add more owners in the admin"; exit 1; fi
    (umask 077; echo "First-Pass-123" > "$out/first-password")
    echo "auth create-owner: owner account st_1 created (first password in the file given; change it at the first login)"
    ;;
esac
FAKE
chmod +x "$T/bin/docker"
OC=(env PATH="$T/bin:$PATH" EXTAS_CONFIG_FILE="$T/server.conf" FAKE_LOG="$T/docker.log" OWNER_IMAGE_UID="$(id -u)" "$B/extas-owner-create")
echo "owner@example.test" > "$T/email"; echo "Mr Owner" > "$T/name"
rc=0; out="$("${OC[@]}" --email-file "$T/email" --name-file "$T/name" 2>&1)" || rc=$?
check "owner: first run creates" "$rc:$(jq -r .result "$T/root/state/owner-account.json")" "0:ok"
check "owner: e-mail file removed" "$([ -e "$T/email" ] && echo left || echo gone)" "gone"
check "owner: e-mail never in the output" "$(grep -c 'owner@example.test' <<<"$out" || true)" "0"
check "owner: e-mail never in the report" "$(cat "$T/root/state/owner-account.md" "$T/root/state/owner-account.json" | grep -c 'owner@example.test' || true)" "0"
check "owner: login file is 600" "$(stat -c %a "$T/root/config/secrets/owner-login.env")" "600"
check "owner: no temp files left" "$(find "$T/root/config/secrets" -name '.owner*' | wc -l)" "0"
check "owner: name reaches create-owner" "$(grep -c -- '--name' "$T/docker.log")" "1"
rd="$(EXTAS_CONFIG_FILE="$T/server.conf" "$B/extas-owner-login")"
check "owner: reader shows the e-mail" "$(grep -c 'owner@example.test' <<<"$rd")" "1"
check "owner: reader shows the first password" "$(grep -c 'First-Pass-123' <<<"$rd")" "1"
before="$(sha256sum "$T/root/config/secrets/owner-login.env")"
echo "other@example.test" > "$T/email"
rc=0; "${OC[@]}" --email-file "$T/email" >/dev/null 2>&1 || rc=$?
check "owner: second run refuses" "$rc:$(jq -r .result "$T/root/state/owner-account.json")" "3:refused"
check "owner: second run changes nothing" "$(sha256sum "$T/root/config/secrets/owner-login.env"):$(wc -l < "$T/docker.log")" "$before:1"
rm -f "$T/root/config/secrets/owner-login.env"
echo "owner@example.test" > "$T/email"
rc=0; FAKE_OWNER_EXISTS=1 "${OC[@]}" --email-file "$T/email" >/dev/null 2>&1 || rc=$?
check "owner: an owner in the database is refused" "$rc:$(jq -r .result "$T/root/state/owner-account.json")" "3:refused"
check "owner: refused run keeps no password" "$([ -e "$T/root/config/secrets/owner-login.env" ] && echo kept || echo none):$(find "$T/root/config/secrets" -name '.owner*' | wc -l)" "none:0"
echo "not an e-mail" > "$T/email"
rc=0; out="$("${OC[@]}" --email-file "$T/email" 2>&1)" || rc=$?
check "owner: a bad e-mail stops before the database" "$rc:$(wc -l < "$T/docker.log")" "1:2"
check "owner: a bad e-mail is never echoed" "$(grep -c 'not an e-mail' <<<"$out" || true)" "0"
check "owner: reader without an account says so" "$(EXTAS_CONFIG_FILE="$T/server.conf" "$B/extas-owner-login" >/dev/null 2>&1; echo $?)" "1"

# Owner reset (PR 15, owner 20 Oct 15:26): a new first password for the owner, readable with extas-owner-login, the
# report says why sign-ins failed and never holds the e-mail or the password.
cat > "$T/bin/docker" <<'FAKE'
#!/usr/bin/env bash
case "$1" in
  image) exit 0 ;;
  images) echo "extas-migrate:abc"; exit 0 ;;
  run)
    shift; envs=(); out=""
    while [ $# -gt 0 ]; do
      case "$1" in --env-file) envs+=("$2"); shift 2 ;; -v) out="${2%%:*}"; shift 2 ;; --name|--network) shift 2 ;; --rm) shift ;; *) break ;; esac
    done
    [ "$(cat "${envs[0]}")" = "DATABASE_DIRECT_URL=postgresql://u:p@pg:5432/d" ] || { echo "db env file holds more than the direct URL"; exit 9; }
    echo "$*" >> "$FAKE_LOG"
    if [ -n "${FAKE_NO_OWNER:-}" ]; then echo "auth reset-owner: FAILED — no active owner account: make it with create-owner first"; exit 1; fi
    printf 'OWNER_EMAIL=owner@example.test\nOWNER_FIRST_PASSWORD=Reset-Pass-456\n' > "$out/owner.env"
    echo "auth reset-owner: own password set before: yes"
    echo "auth reset-owner: waiting after wrong tries when reset: yes"
    echo "auth reset-owner: owner sign-in tries in the last 24 h: locked 2, ok 1, password 5"
    echo "auth reset-owner: owner account st_1 has a new first password (in the file given; change it at the next sign-in)"
    ;;
esac
FAKE
ORS=(env PATH="$T/bin:$PATH" EXTAS_CONFIG_FILE="$T/server.conf" FAKE_LOG="$T/docker.log" OWNER_IMAGE_UID="$(id -u)" "$B/extas-owner-reset")
rc=0; out="$("${ORS[@]}" 2>&1)" || rc=$?
check "owner reset: done" "$rc:$(jq -r .result "$T/root/state/owner-reset.json")" "0:ok"
check "owner reset: runs reset-owner" "$(grep -c 'reset-owner --write-to' "$T/docker.log")" "1"
rd="$(EXTAS_CONFIG_FILE="$T/server.conf" "$B/extas-owner-login")"
check "owner reset: the reader shows the new password" "$(grep -c 'Reset-Pass-456' <<<"$rd"):$(grep -c 'owner@example.test' <<<"$rd")" "1:1"
check "owner reset: the report says why" "$(grep -c 'waiting after wrong tries when reset: yes' "$T/root/state/owner-reset.md")" "1"
check "owner reset: no e-mail or password in the output or report" "$(cat "$T/root/state/owner-reset.md" "$T/root/state/owner-reset.json" <<<"$out" | grep -cE 'owner@example|Reset-Pass' || true):$(grep -cE 'owner@example|Reset-Pass' <<<"$out" || true)" "0:0"
check "owner reset: login file 600, no temp files" "$(stat -c %a "$T/root/config/secrets/owner-login.env"):$(find "$T/root/config/secrets" -name '.reset*' -o -name '.owner-login*' | wc -l)" "600:0"
before="$(sha256sum "$T/root/config/secrets/owner-login.env")"
rc=0; FAKE_NO_OWNER=1 "${ORS[@]}" >/dev/null 2>&1 || rc=$?
check "owner reset: a failed reset keeps the old login file" "$rc:$(jq -r .result "$T/root/state/owner-reset.json"):$(sha256sum "$T/root/config/secrets/owner-login.env")" "1:fail:$before"
rm -rf "$T"

# Preview gate (PR 7, owner 20 Oct 15:36): the login once, then a cookie; the cookie is set only after the login
# passed (inside the route, after basic_auth), and only a hex token is accepted.
AB=../stack/caddy/auth-block.sh
tok="$(printf x | sha256sum | cut -c1-64)"
blk="$(bash "$AB" "# fp" extas 'HASH' "$tok" 30)"
want="$(printf '\t')not header_regexp Cookie (?:^|;\\s*)extas_preview=$tok(?:;|\$)"
check "gate: cookie match and route" "$(grep -cxF "$want" <<<"$blk"):$(grep -c '^route @preview_needed {$' <<<"$blk")" "1:1"
check "gate: the cookie comes after the login" "$(awk '/basic_auth/{a=NR} /Set-Cookie/{c=NR} END{print (a<c)}' <<<"$blk")" "1"
check "gate: 30 days, Secure and HttpOnly" "$(grep -c 'Max-Age=2592000; Secure; HttpOnly; SameSite=Lax' <<<"$blk")" "1"
check "gate: a token that is not hex is refused" "$(bash "$AB" "# fp" extas H 'x;y' 30 >/dev/null 2>&1; echo $?)" "2"
# Follow-up 80 (PR 196): only POST /api/erp/webhook passes without the preview login (it proves itself with its HMAC
# signature); the exemption is one negated set of exactly that method and that path, beside the cookie test.
want_ex="$(printf '\tnot {\n\t\tmethod POST\n\t\tpath /api/erp/webhook\n\t}')"
check "gate: the ERP webhook POST is the one exemption" "$(grep -c 'not {' <<<"$blk"):$(grep -c 'method ' <<<"$blk"):$(grep -c 'path ' <<<"$blk")" "1:1:1"
check "gate: the exemption block, word for word" "$(sed -n '/^\tnot {$/,/^\t}$/p' <<<"$blk")" "$want_ex"
check "gate: cookie test and exemption in one matcher" "$(sed -n '/^@preview_needed {$/,/^}$/p' <<<"$blk" | grep -c $'^\tnot ')" "2"
check "gate: the server re-writes an older gate (fingerprint v3)" "$(grep -c '# preview gate v3 for' ../server/steps/09-stack.sh)" "1"
# With a Caddy binary (CADDY_BIN, or caddy on PATH), the gate runs for real: the webhook POST reaches the app with no
# login and no cookie, and nothing else does. CI has no Caddy, so this part runs where one is installed.
CADDY="${CADDY_BIN:-$(command -v caddy || true)}"
if [ -n "$CADDY" ] && [ -x "$CADDY" ]; then
  T="$(mktemp -d)"; port=18471
  bash "$AB" "# fp" extas "$("$CADDY" hash-password --plaintext gate-pw)" "$tok" 30 > "$T/auth.caddy"
  printf '{\n\tadmin off\n}\n:%s {\n\timport %s/auth.caddy\n\trespond "app" 200\n}\n' "$port" "$T" > "$T/Caddyfile"
  "$CADDY" run --config "$T/Caddyfile" --adapter caddyfile >"$T/log" 2>&1 & cpid=$!
  for _ in $(seq 50); do curl -s -o /dev/null "localhost:$port" && break; sleep 0.1; done
  code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
  u="http://localhost:$port"
  check "gate (caddy): the webhook POST passes with no login" "$(code -X POST "$u/api/erp/webhook" -d '{}'):$(code -X POST "$u/api/erp/webhook?x=1")" "200:200"
  check "gate (caddy): other methods and paths still ask" "$(code "$u/api/erp/webhook"):$(code -X PUT "$u/api/erp/webhook"):$(code -X POST "$u/api/erp/webhook/x"):$(code -X POST "$u/api/erp/webhooks"):$(code -X POST "$u/admin/login"):$(code "$u/")" "401:401:401:401:401:401"
  check "gate (caddy): the cookie and the login still work" "$(code -H "Cookie: extas_preview=$tok" "$u/"):$(code -u extas:gate-pw "$u/"):$(code -u extas:wrong "$u/")" "200:200:401"
  check "gate (caddy): the webhook answer sets no preview cookie" "$(curl -s -D - -o /dev/null -X POST "$u/api/erp/webhook" | grep -ci 'set-cookie' || true)" "0"
  kill "$cpid" 2>/dev/null || true; wait "$cpid" 2>/dev/null || true
  rm -rf "$T"
else
  echo "SKIP gate (caddy): no Caddy binary here (set CADDY_BIN to run the live gate checks)"
fi

# Deploy report (PR 4): commit, Dhaka time, result, migration, health check, the failing step in plain English — and
# nothing that looks like a connection string or an e-mail, and never an older run's result.
T="$(mktemp -d)"; D=../deploy/deploy-report.sh
printf 'EXTAS_ROOT=%s\nEXTAS_TIMEZONE=Asia/Dhaka\nEXTAS_STAGING_HOST=example.test\n' "$T" > "$T/conf"
echo '{"result":"fail","detail":"database migration failed; live version unchanged postgresql://u:pw@h/d owner@example.test","sha":"aaaabbbbccccdddd","migration":"failed","run":"42","color":"green"}' > "$T/dep.json"
echo '{"url":"u","code":200,"ok":true,"commit":"999988887777aaaa","color":"blue"}' > "$T/h.json"
rep() { env EXTAS_CONFIG_FILE="$T/conf" DEPLOY_JSON="$T/dep.json" HEALTH_JSON="$T/h.json" SHA=aaaabbbbccccdddd \
  CHECKOUT=success BUILD=success NOW=1760947200 "$@" bash "$D" "$T/out"; }
rep RUN_ID=42 DEPLOY=failure
L="$(cat "$T/out/deploy-latest.md")"
check "report: commit" "$(grep -c '| Commit | `aaaabbbbcccc` |' <<<"$L")" "1"
check "report: Dhaka time" "$(grep -c '| Time (Asia/Dhaka) | 2025-10-20 14:00 |' <<<"$L")" "1"
check "report: failed" "$(grep -c '| Result | \*\*FAILED\*\* |' <<<"$L")" "1"
check "report: migration result" "$(grep -c '| Database migration | failed |' <<<"$L")" "1"
check "report: the failing step in words" "$(grep -c 'What failed | The deploy stopped: database migration failed' <<<"$L")" "1"
check "report: health of the live site" "$(grep -c 'Health check on example.test | OK — HTTP 200' <<<"$L")" "1"
check "report: no connection string, no e-mail" "$(grep -cE 'pw@|owner@example' "$T/out/deploy-latest.md" "$T/out/deploy-history.line" | awk -F: '{s+=$2} END {print s}')" "0"
check "report: history line" "$(cut -d'|' -f3,5,6 "$T/out/deploy-history.line" | tr -s ' ')" ' `aaaabbbbcccc` | FAILED | failed '
rep RUN_ID=43 DEPLOY=failure
check "report: an older run's record is never used" "$(grep -c 'stopped before it could record why' "$T/out/deploy-latest.md"):$(grep -c 'migration | not reached' "$T/out/deploy-latest.md")" "1:1"
echo '{"result":"ok","detail":"green live","sha":"999988887777aaaa","migration":"ok","run":"44","color":"green"}' > "$T/dep.json"
rep RUN_ID=44 DEPLOY=success
check "report: success with a matching health check" "$(grep -c '\*\*OK\*\*' "$T/out/deploy-latest.md"):$(grep -c 'What failed' "$T/out/deploy-latest.md")" "1:0"
echo '{"url":"u","code":522,"ok":false,"commit":"","color":""}' > "$T/h.json"
rep RUN_ID=44 DEPLOY=success
check "report: live but the public check failed" "$(grep -c 'DEPLOYED, HEALTH CHECK FAILED' "$T/out/deploy-latest.md"):$(grep -c 'Cloudflare error' "$T/out/deploy-latest.md")" "1:2"
rep RUN_ID=44 BUILD=failure DEPLOY=skipped
check "report: build failure in words" "$(grep -c 'Building the new version on the server failed' "$T/out/deploy-latest.md")" "1"
echo '{"result":"ok","sha":"999988887777aaaa","files":12}' > "$T/docs.json"
rep RUN_ID=44 DEPLOY=success DOCS=success DOCS_JSON="$T/docs.json"
check "report: the docs copy on the server" "$(grep -c '| Docs on the server | `999988887777` — README.md + docs/ (12 files) |' "$T/out/deploy-latest.md")" "1"
rep RUN_ID=44 DEPLOY=success DOCS=failure DOCS_JSON="$T/docs.json"
check "report: a failed docs copy says what is still there" "$(grep -c 'Docs on the server | FAILED — the server keeps the previous copy' "$T/out/deploy-latest.md")" "1"
rep RUN_ID=44 DEPLOY=success
check "report: no docs line when the step did not run" "$(grep -c 'Docs on the server' "$T/out/deploy-latest.md")" "0"
echo '{"ok":true,"pages":26,"problems":[]}' > "$T/smoke.json"
rep RUN_ID=44 DEPLOY=success SMOKE=success SMOKE_JSON="$T/smoke.json"
check "report: a passed smoke test" "$(grep -c '| Smoke test (every page) | OK — 26 page views' "$T/out/deploy-latest.md"):$(grep -c 'smoke OK' "$T/out/deploy-history.line")" "1:1"
echo '{"ok":false,"pages":26,"problems":["/admin (phone): shows the error screen","x (desktop): owner@example.test"]}' > "$T/smoke.json"
rep RUN_ID=44 DEPLOY=success SMOKE=failure SMOKE_ROLLBACK=success SMOKE_JSON="$T/smoke.json"
check "report: a failed smoke test rolled back, in words" "$(grep -c 'FAILED, ROLLED BACK' "$T/out/deploy-latest.md"):$(grep -c 'previous version was put back' "$T/out/deploy-latest.md"):$(grep -c 'owner@example' "$T/out/deploy-latest.md")" "1:1:0"
rep RUN_ID=44 DEPLOY=success SMOKE=failure SMOKE_ROLLBACK=failure SMOKE_JSON="$T/smoke.json"
check "report: a failed rollback says so" "$(grep -c 'FAILED, ROLLBACK FAILED' "$T/out/deploy-latest.md")" "1"
check "report: the history keeps seven columns" "$(tr -cd '|' < "$T/out/deploy-history.line" | wc -c)" "8"
rep RUN_ID=44 DEPLOY=success
check "report: no smoke line when it did not run" "$(grep -c 'Smoke test' "$T/out/deploy-latest.md")" "0"
rm -rf "$T"

# Smoke test (CN-016): smoke.sh makes the check account in the live migrate image, hands its sign-in to the browser
# container in a root-only file that is gone afterwards, writes state/smoke.json for the status page and passes the
# browser's exit code on. Docker is a stand-in that plays both containers.
T="$(mktemp -d)"; mkdir -p "$T/bin" "$T/root/config/secrets" "$T/root/state"
{ cat ../config/server.conf; printf 'EXTAS_ROOT=%s\n' "$T/root"; } > "$T/conf"
printf 'DATABASE_DIRECT_URL=postgresql://u:dbpw@h/d\nVAULT_MASTER_KEY=vk\nOTHER=x\n' > "$T/root/config/secrets/app.env"
printf 'STAGING_PASSWORD=stagepw\n' > "$T/root/config/secrets/staging.env"
echo '{"image":"extas-web:aaa","migrate":"extas-migrate:aaa"}' > "$T/root/state/last-good-deploy.json"
cat > "$T/bin/docker" <<'STUB'
#!/usr/bin/env bash
echo "docker $*" >> "$FAKE_LOG"
case "$1" in
  image) [ "$3" != "extas-migrate:gone" ]; exit ;;
  images) echo "extas-migrate:newest"; exit 0 ;;
  build) exit 0 ;;
  exec) cat > /dev/null; echo "${FAKE_GUARDS:-ok: 14 tables append-only}"; exit 0 ;;   # the append-only check (PR 139)
esac
out=""; envf=""; prev=""
for a in "$@"; do
  [ "$prev" = -v ] && case "$a" in *:/out) out="${a%:/out}" ;; esac
  [ "$prev" = --env-file ] && envf="$a"
  prev="$a"
done
if grep -q check-account <<<"$*"; then
  grep -q '^VAULT_MASTER_KEY=vk$' "$envf" && ! grep -q OTHER "$envf" || exit 9
  printf 'SMOKE_EMAIL=c@check.invalid\nSMOKE_PASSWORD=pw1\nSMOKE_TOTP_SECRET=SEED\n' > "$out/check.env"; exit 0
fi
cp "$envf" "$FAKE_SEEN"
printf '{"at":"x","sha":"s","ok":%s,"pages":4,"failed":%s,"problems":%s}\n' "$FAKE_OK" "$FAKE_FAILED" "$FAKE_PROBLEMS" > "$out/result.json"
echo "# r" > "$out/README.md"
[ "$FAKE_OK" = true ]
STUB
chmod +x "$T/bin/docker"
sm() { env PATH="$T/bin:$PATH" EXTAS_CONFIG_FILE="$T/conf" SMOKE_IMAGE_UID="$(id -u)" FAKE_LOG="$T/docker.log" FAKE_SEEN="$T/seen.env" \
  "$@" bash ../deploy/smoke.sh "$T/out" "after deploy" 0123456789abcdef0123; }
rc=0; sm FAKE_OK=true FAKE_FAILED=0 FAKE_PROBLEMS='[]' >/dev/null || rc=$?
check "smoke: a passing run exits 0 and records it" "$rc:$(jq -c '{ok,pages,kind}' "$T/root/state/smoke.json")" '0:{"ok":true,"pages":4,"kind":"after deploy"}'
check "smoke: the browser gets the check account and the preview login" "$(grep -c '^SMOKE_PASSWORD=pw1$' "$T/seen.env"):$(grep -c '^SMOKE_HTTP_PASSWORD=stagepw$' "$T/seen.env"):$(grep -c '^SMOKE_HTTP_USER=extas$' "$T/seen.env")" "1:1:1"
check "smoke: the browser never gets the database or the vault key" "$(grep -cE 'DATABASE|VAULT' "$T/seen.env")" "0"
check "smoke: no sign-in file is left behind" "$(find "$T/root/config/secrets" -mindepth 1 -name '.smoke*' | wc -l)" "0"
check "smoke: the live migrate image makes the account" "$(grep -c 'run .*extas-migrate:aaa sh -c' "$T/docker.log")" "1"
check "smoke: the preview host" "$(grep -c 'BASE=https://new.extas.com.bd' "$T/docker.log")" "1"
rc=0; sm FAKE_OK=false FAKE_FAILED=1 FAKE_PROBLEMS='["/admin (phone): shows the error screen"]' >/dev/null || rc=$?
check "smoke: a failing run fails and says what" "$rc:$(jq -r '.problems[0]' "$T/root/state/smoke.json")" "1:/admin (phone): shows the error screen"
# PR 139: the database check rides along — recorded in result.json and README; a guard problem fails a passing run
check "smoke: the append-only check is recorded" "$(jq -r '.database.appendOnly' "$T/out/result.json"):$(grep -c 'Database (PR 139): ok: 14 tables append-only' "$T/out/README.md")" "ok: 14 tables append-only:1"
rc=0; sm FAKE_OK=true FAKE_FAILED=0 FAKE_PROBLEMS='[]' FAKE_GUARDS='problem: guard off or app role may change AuditLog' >/dev/null || rc=$?
check "smoke: a guard problem fails the run and says which table" "$rc:$(jq -c '{ok,problems}' "$T/root/state/smoke.json")" '1:{"ok":false,"problems":["problem: guard off or app role may change AuditLog"]}'
echo '{"migrate":"extas-migrate:gone"}' > "$T/root/state/last-good-deploy.json"; : > "$T/docker.log"
sm FAKE_OK=true FAKE_FAILED=0 FAKE_PROBLEMS='[]' >/dev/null
check "smoke: a missing migrate image falls back to the newest" "$(grep -c 'run .*extas-migrate:newest sh -c' "$T/docker.log")" "1"
rm -rf "$T"

# Docs on the server (PR 594, CN-011): docs-sync.sh copies README.md + docs/ of a checkout to $EXTAS_ROOT/docs/<sha12>/
# with a COMMIT file, points `current` at it in one step, links unchanged files to the previous copy, keeps the newest
# DOCS_KEEP_VERSIONS (never the current one), copies nothing back and refuses anything that is not a commit hash.
T="$(mktemp -d)"; DS=../deploy/docs-sync.sh; DD="$T/root/docs"
mkdir -p "$T/repo/docs/sub" "$T/root"
{ cat ../config/server.conf; printf 'EXTAS_ROOT=%s\nDOCS_KEEP_VERSIONS=2\n' "$T/root"; } > "$T/conf"
echo readme > "$T/repo/README.md"; echo bp1 > "$T/repo/docs/BLUEPRINT.md"; echo reg > "$T/repo/docs/MASTER-REGISTER.md"
echo x > "$T/repo/docs/sub/x.md"
ds() { env EXTAS_CONFIG_FILE="$T/conf" bash "$DS" "$1" "$T/repo"; }
s1=aaaaaaaaaaaa1111111111111111111111111111; s2=bbbbbbbbbbbb2222222222222222222222222222; s3=cccccccccccc3333333333333333333333333333
out="$(ds $s1)"
check "docs: copied under the commit, current points at it" "$([ -L "$DD/current" ] && readlink "$DD/current"):$(cat "$DD/current/README.md"):$(cat "$DD/current/docs/sub/x.md")" "aaaaaaaaaaaa:readme:x"
check "docs: COMMIT holds the hash and the Dhaka time" "$(grep -c "^commit=$s1$" "$DD/current/COMMIT"):$(grep -c '^timezone=Asia/Dhaka$' "$DD/current/COMMIT"):$(grep -cE '^copied=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}$' "$DD/current/COMMIT")" "1:1:1"
check "docs: readable by the app" "$(stat -c %a "$DD/current/docs/BLUEPRINT.md"):$(stat -c %a "$DD/aaaaaaaaaaaa/docs/sub")" "644:755"
check "docs: state record" "$(jq -r '.sha + " " + (.files|tostring)' "$T/root/state/docs-latest.json")" "$s1 5"
check "docs: one line out" "$(wc -l <<<"$out"):$(grep -c 'aaaaaaaaaaaa on the server' <<<"$out")" "1:1"
echo bp2 > "$T/repo/docs/BLUEPRINT.md"; rm "$T/repo/docs/sub/x.md"
ds $s2 >/dev/null
check "docs: the next commit becomes current" "$(readlink "$DD/current"):$(cat "$DD/current/docs/BLUEPRINT.md"):$([ -e "$DD/current/docs/sub/x.md" ] && echo still || echo gone)" "bbbbbbbbbbbb:bp2:gone"
check "docs: the earlier copy is untouched" "$(cat "$DD/aaaaaaaaaaaa/docs/BLUEPRINT.md"):$(cat "$DD/aaaaaaaaaaaa/docs/sub/x.md")" "bp1:x"
check "docs: an unchanged file costs nothing (hard link)" "$(stat -c %i "$DD/aaaaaaaaaaaa/docs/MASTER-REGISTER.md")" "$(stat -c %i "$DD/bbbbbbbbbbbb/docs/MASTER-REGISTER.md")"
ds $s3 >/dev/null
check "docs: the newest DOCS_KEEP_VERSIONS copies are kept" "$(find "$DD" -mindepth 1 -maxdepth 1 -printf '%f\n' | sort | tr '\n' ' ')" "bbbbbbbbbbbb cccccccccccc current "
inode="$(stat -c %i "$DD/bbbbbbbbbbbb/COMMIT")"
ds $s2 >/dev/null
check "docs: going back to a kept commit points current at it without copying again" "$(readlink "$DD/current"):$(stat -c %i "$DD/bbbbbbbbbbbb/COMMIT")" "bbbbbbbbbbbb:$inode"
ds $s1 >/dev/null
check "docs: a commit deployed again after it was pruned is copied again; the oldest copy goes" "$(find "$DD" -mindepth 1 -maxdepth 1 -printf '%f\n' | sort | tr '\n' ' ')" "aaaaaaaaaaaa bbbbbbbbbbbb current "
check "docs: nothing copied back into the checkout" "$(find "$T/repo" -type f | wc -l):$(cat "$T/repo/docs/BLUEPRINT.md")" "3:bp2"
rc=0; ds 'x; rm -rf /' >/dev/null 2>&1 || rc=$?
check "docs: anything but a commit hash is refused" "$rc:$(readlink "$DD/current")" "2:aaaaaaaaaaaa"
rm -rf "$T"

# Backups (PR 8): extas-backup daily, prune and extas-restore test / media with stand-ins for docker, rclone, chown and
# sleep (no server, no database; real tar and gpg). The product photos on the local disk are in every daily backup —
# a full archive, then diffs since it — on the data disk, in Blob and encrypted on Drive; the restore test brings one
# sample photo back and compares its checksum; extas-restore media gives every photo back from each of the three.
T="$(mktemp -d)"; BR="$T/root"
mkdir -p "$BR/config/secrets" "$BR/state" "$BR/backups/wal" "$BR/data/media/p/ab" "$T/nvme" "$T/bin" "$T/remote" "$T/pg"
{ cat ../config/server.conf; printf 'EXTAS_ROOT=%s\nEXTAS_NVME_MOUNT=%s\n' "$BR" "$T/nvme"; } > "$T/server.conf"
printf 'RCLONE_CONFIG_BLOB_TYPE=test\nRCLONE_CONFIG_DRIVE_TYPE=test\n' > "$BR/config/secrets/backup.env"
echo 17 > "$T/pg/PG_VERSION"
cat > "$T/bin/docker" <<'FAKE'
#!/usr/bin/env bash
# stand-in for docker: the base backup is a real tar of a fake data folder; the database answers like a healthy one
case "$1" in
  exec)
    case "$*" in
      *pg_basebackup*) d="$(grep -o '\.bb-[0-9-]*' <<<"$*" | head -1)"; mkdir -p "$FAKE_NVME/pgtemp/$d"
        tar -czf "$FAKE_NVME/pgtemp/$d/base.tar.gz" -C "$FAKE_PG" . ;;
      *pg_dump*) echo "dump of the database" ;;
      *pg_is_in_recovery*) echo t ;;
      *information_schema.tables*) echo 42 ;;
    esac ;;
  run) echo fake-container ;;
esac
exit 0
FAKE
cat > "$T/bin/rclone" <<'FAKE'
#!/usr/bin/env bash
# stand-in for rclone: blob:<path> and drive:<path> are folders under $FAKE_REMOTE; copy / lsf / delete with --include
set -euo pipefail
p() { case "$1" in blob:*|drive:*) echo "$FAKE_REMOTE/${1%%:*}/${1#*:}" ;; *) echo "$1" ;; esac; }
cmd="$1"; shift; args=(); inc=(); dirs=""
while [ $# -gt 0 ]; do
  case "$1" in
    -q|--ignore-existing) shift ;;
    --min-age) shift 2 ;;
    --include) inc+=("$2"); shift 2 ;;
    --dirs-only) dirs=1; shift ;;
    *) args+=("$1"); shift ;;
  esac
done
want() { local b; b="$(basename "$1")"; [ ${#inc[@]} -eq 0 ] && return 0; for i in "${inc[@]}"; do [[ $b == $i ]] && return 0; done; return 1; }
echo "$cmd ${args[*]}" >> "$FAKE_REMOTE/log"
case "$cmd" in
  copy)
    s="$(p "${args[0]}")"; d="$(p "${args[1]}")"; mkdir -p "$d"
    if [ -f "$s" ]; then cp -p "$s" "$d/"; exit 0; fi
    [ -d "$s" ] || exit 0
    (cd "$s" && find . -type f) | while read -r f; do want "$f" || continue; mkdir -p "$d/$(dirname "$f")"; cp -p "$s/$f" "$d/$f"; done ;;
  lsf)
    s="$(p "${args[0]}")"; [ -d "$s" ] || exit 0
    if [ -n "$dirs" ]; then find "$s" -mindepth 1 -maxdepth 1 -type d -printf '%f/\n' | sort
    else find "$s" -mindepth 1 -maxdepth 1 -type f -printf '%f\n' | sort | while read -r f; do if want "$f"; then echo "$f"; fi; done; fi ;;
esac
FAKE
printf '#!/bin/sh\nexit 0\n' > "$T/bin/chown"; printf '#!/bin/sh\nexit 0\n' > "$T/bin/sleep"
chmod +x "$T/bin/"*
BENV=(env PATH="$T/bin:$PATH" EXTAS_CONFIG_FILE="$T/server.conf" FAKE_NVME="$T/nvme" FAKE_PG="$T/pg" FAKE_REMOTE="$T/remote")
stamp() { date -d "$1" +%Y%m%d-%H%M; }
A="$(stamp '2 days ago')"; Bs="$(stamp '1 day ago')"; C="$(stamp '10 minutes ago')"
M="$BR/data/media"; L="$BR/backups/media"; LD="$BR/backups/docs"
# The docs on the server as deploy.yml leaves them (docs-sync.sh, PR 594), for the docs bundle (CN-011)
DSHA=dddddddddddd4444444444444444444444444444
mkdir -p "$T/repo/docs/qa"
echo readme > "$T/repo/README.md"; echo blueprint > "$T/repo/docs/BLUEPRINT.md"; echo register > "$T/repo/docs/MASTER-REGISTER.md"
echo checklist > "$T/repo/docs/qa/CHECKLIST.md"
env EXTAS_CONFIG_FILE="$T/server.conf" bash ../deploy/docs-sync.sh "$DSHA" "$T/repo" >/dev/null
echo "photo one" > "$M/p/ab/one.avif"; echo "photo two" > "$M/p/two.webp"; echo "photo three" > "$M/three.jpg"
rc=0; "${BENV[@]}" EXTAS_BACKUP_STAMP="$A" "$B/extas-backup" daily >/dev/null 2>&1 || rc=$?
check "backup: daily runs" "$rc:$(jq -r .result "$BR/state/backup-daily-local.json")" "0:ok"
check "backup: first photo archive is full" "$(ls "$L" | tr '\n' ' ')" "media-$A-full.snar media-$A-full.tar media-$A.sha256 "
check "backup: every photo has its checksum" "$(wc -l < "$L/media-$A.sha256")" "3"
check "backup: the checksums are the photos'" "$(cd "$M" && sha256sum --quiet -c "$L/media-$A.sha256" && echo ok)" "ok"
check "backup: status names the photos" "$(jq -r .detail "$BR/state/backup-daily-local.json" | grep -c 'photos: all 3 in a full archive')" "1"
check "backup: photos in Blob" "$(ls "$T/remote/blob/extas-backups/media" | tr '\n' ' ')" "media-$A-full.tar media-$A.sha256 "
check "backup: photos on Drive, encrypted, with the database" "$(find "$T/remote/drive/EXTAS-backups/$A" -name 'media-*.gpg' | wc -l):$(find "$T/remote/drive/EXTAS-backups/$A" -name 'extas-*.dump.gpg' | wc -l)" "2:1"
gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$BR/config/secrets/backup.key" -o "$T/drive.tar" -d "$T/remote/drive/EXTAS-backups/$A/media-$A-full.tar.gpg" 2>/dev/null
check "backup: the Drive copy opens with the database's key" "$(cmp -s "$T/drive.tar" "$L/media-$A-full.tar" && echo same)" "same"
check "backup: no photo name in the clear on Drive" "$(grep -rlc 'one.avif' "$T/remote/drive" | wc -l)" "0"
check "backup: staging on NVMe cleared" "$(ls "$T/nvme/backup-staging")" ""
check "backup: a dated docs bundle with its commit" "$(ls "$LD" | tr '\n' ' '):$(cat "$LD/docs-$A.commit")" "docs-$A.commit docs-$A.tar.gz :$DSHA"
check "backup: the bundle holds README, blueprint, register, all docs and COMMIT" "$(tar -tzf "$LD/docs-$A.tar.gz" | grep -cxE '\./(README\.md|docs/BLUEPRINT\.md|docs/MASTER-REGISTER\.md|docs/qa/CHECKLIST\.md|COMMIT)')" "5"
check "backup: status names the docs" "$(jq -r .detail "$BR/state/backup-daily-local.json" | grep -c 'docs of dddddddddddd')" "1"
check "backup: docs bundle in Blob" "$(ls "$T/remote/blob/extas-backups/docs" | tr '\n' ' ')" "docs-$A.commit docs-$A.tar.gz "
gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$BR/config/secrets/backup.key" -o "$T/docs.tgz" -d "$T/remote/drive/EXTAS-backups/$A/docs-$A.tar.gz.gpg" 2>/dev/null
check "backup: docs bundle on Drive, encrypted with the same key" "$(cmp -s "$T/docs.tgz" "$LD/docs-$A.tar.gz" && echo same):$(find "$T/remote/drive/EXTAS-backups/$A" -name 'docs-*.gpg' | wc -l)" "same:2"
echo "photo four" > "$M/p/four.avif"
"${BENV[@]}" EXTAS_BACKUP_STAMP="$Bs" "$B/extas-backup" daily >/dev/null 2>&1
check "backup: next day only what is new" "$([ -f "$L/media-$Bs-diff-$A.tar" ] && echo diff):$(cut -c67- "$L/media-$Bs.sha256")" "diff:./p/four.avif"
check "backup: a diff has no snapshot of its own" "$(find "$L" -name '*.snar' | wc -l)" "1"
rm "$M/p/two.webp"; echo "photo five" > "$M/five.jpg"
"${BENV[@]}" EXTAS_BACKUP_STAMP="$C" "$B/extas-backup" daily >/dev/null 2>&1
check "backup: a diff carries everything since the full one" "$(cut -c67- "$L/media-$C.sha256" | sort | tr '\n' ' ')" "./five.jpg ./p/four.avif "
# The restore test: database as before, plus one sample photo checked against its checksum
rc=0; out="$("${BENV[@]}" bash "$B/extas-restore" test 2>&1)" || rc=$?
check "restore test: passes" "$rc:$(jq -r .result "$BR/state/restore-test.json")" "0:ok"
check "restore test: a sample photo came back with its checksum" "$(jq -r .detail "$BR/state/restore-test.json" | grep -c "restored from media-$C-diff-$A.tar, checksum matches")" "1"
check "restore test: its work folder is removed" "$(ls "$T/nvme/scratch" 2>/dev/null | wc -l)" "0"
cp "$L/media-$C.sha256" "$T/keep.sha256"
sed -i 's/^./0/' "$L/media-$C.sha256"
rc=0; "${BENV[@]}" bash "$B/extas-restore" test >/dev/null 2>&1 || rc=$?
check "restore test: a photo that comes back different fails it" "$rc:$(jq -r .result "$BR/state/restore-test.json"):$(jq -r .detail "$BR/state/restore-test.json" | grep -c 'different checksum')" "1:fail:1"
cp "$T/keep.sha256" "$L/media-$C.sha256"
check "restore test: the docs bundle came back with its COMMIT" "$("${BENV[@]}" bash "$B/extas-restore" test >/dev/null 2>&1; jq -r .detail "$BR/state/restore-test.json" | grep -c "docs: docs-$C.tar.gz back with README, blueprint and register, COMMIT dddddddddddd matches")" "1"
cp "$LD/docs-$C.commit" "$T/keep.commit"; echo eeeeeeeeeeee5555555555555555555555555555 > "$LD/docs-$C.commit"
rc=0; "${BENV[@]}" bash "$B/extas-restore" test >/dev/null 2>&1 || rc=$?
check "restore test: a docs bundle whose COMMIT does not match fails it" "$rc:$(jq -r .detail "$BR/state/restore-test.json" | grep -c 'does not match')" "1:1"
cp "$T/keep.commit" "$LD/docs-$C.commit"
tar -C "$T" -czf "$T/broken.tgz" repo/README.md; cp "$LD/docs-$C.tar.gz" "$T/keep.tgz"; cp "$T/broken.tgz" "$LD/docs-$C.tar.gz"
rc=0; "${BENV[@]}" bash "$B/extas-restore" test >/dev/null 2>&1 || rc=$?
check "restore test: an incomplete docs bundle fails it" "$rc:$(jq -r .detail "$BR/state/restore-test.json" | grep -c 'did not come back')" "1:1"
cp "$T/keep.tgz" "$LD/docs-$C.tar.gz"
# Every photo back, from each copy: deleted photos stay deleted, every checksum is checked, the live folder untouched
for from in local blob drive; do
  rm -rf "$T/nvme/scratch"
  rc=0; out="$("${BENV[@]}" bash "$B/extas-restore" media --from "$from" 2>&1)" || rc=$?
  got="$(find "$T/nvme/scratch" -path '*/media/*' -type f -printf '%P\n' 2>/dev/null | sed 's#^[^/]*/media/##' | sort | tr '\n' ' ')"
  [ "$rc" = 0 ] || echo "$out" | tail -5
  check "restore media from $from: every photo, checksums match" "$rc:$(grep -c '^OK: 4 photos restored' <<<"$out")" "0:1"
  check "restore media from $from: the same photos as the live folder" "$got" "five.jpg p/ab/one.avif p/four.avif three.jpg "
done
check "restore media: the live folder is untouched" "$(find "$M" -type f | wc -l)" "4"
rm "$M/three.jpg"
rc=0; out="$(echo RESTORE | "${BENV[@]}" bash "$B/extas-restore" media --from local --into live 2>&1)" || rc=$?
check "restore media --into live: a missing photo is copied back" "$rc:$(cat "$M/three.jpg" 2>/dev/null)" "0:photo three"
echo "changed on purpose" > "$M/five.jpg"
echo RESTORE | "${BENV[@]}" bash "$B/extas-restore" media --from local --into live >/dev/null 2>&1
check "restore media --into live: never overwrites a photo" "$(cat "$M/five.jpg")" "changed on purpose"
echo "photo five" > "$M/five.jpg"
# Retention: by BACKUP_KEEP_LOCAL_DAYS; the newest set always stays; a diff without its full archive goes
Z="$(stamp '20 days ago')"; Zd="$(stamp '19 days ago')"
for f in "media-$Z-full.tar" "media-$Z-full.snar" "media-$Z.sha256" "media-$Zd-diff-$Z.tar" "media-$Zd.sha256" "media-$Zd-diff-19990101-0000.tar"; do
  : > "$L/$f"; touch -d '20 days ago' "$L/$f"
done
touch -d '9 days ago' "$L/media-$A-full.tar" "$L/media-$A-full.snar" "$L/media-$A.sha256" "$L/media-$Bs-diff-$A.tar" "$L/media-$Bs.sha256" "$L/media-$C-diff-$A.tar" "$L/media-$C.sha256"
"${BENV[@]}" "$B/extas-backup" prune >/dev/null 2>&1
check "prune: old photo archives go, the newest set stays" "$(ls "$L" | tr '\n' ' ')" "media-$A-full.snar media-$A-full.tar media-$A.sha256 media-$C-diff-$A.tar media-$C.sha256 "
# The cadence: a full archive at least as often as the shortest retention
sed -i 's/^BACKUP_KEEP_LOCAL_DAYS=.*/BACKUP_KEEP_LOCAL_DAYS=1/' "$T/server.conf"
"${BENV[@]}" "$B/extas-backup" daily >/dev/null 2>&1
check "backup: a full archive again when the shortest retention says so" "$(find "$L" -name '*-full.tar' | wc -l)" "2"
# Switched off: no photo archive, the backup and the restore test still pass and say so
sed -i 's/^BACKUP_MEDIA=.*/BACKUP_MEDIA="no"/' "$T/server.conf"
rm -rf "${L:?}"/*
rc=0; "${BENV[@]}" EXTAS_BACKUP_STAMP="$(stamp '5 minutes ago')" "$B/extas-backup" daily >/dev/null 2>&1 || rc=$?
check "backup: photos switched off" "$rc:$(ls "$L" | wc -l):$(jq -r .detail "$BR/state/backup-daily-local.json" | grep -c 'switched off')" "0:0:1"
rc=0; "${BENV[@]}" bash "$B/extas-restore" test >/dev/null 2>&1 || rc=$?
check "restore test: no photos to check is not a failure" "$rc:$(jq -r .detail "$BR/state/restore-test.json" | grep -c 'none on the local disk yet')" "0:1"
# Docs: before the first deploy there are none (not a failure); a server copy without any bundle fails the test
rm -rf "${BR:?}/docs" "${LD:?}"/*
rc=0; "${BENV[@]}" EXTAS_BACKUP_STAMP="$(stamp '4 minutes ago')" "$B/extas-backup" daily >/dev/null 2>&1 || rc=$?
check "backup: no docs on the server yet is not a failure" "$rc:$(ls "$LD" | wc -l):$(jq -r .detail "$BR/state/backup-daily-local.json" | grep -c 'docs: none on the server yet')" "0:0:1"
rc=0; "${BENV[@]}" bash "$B/extas-restore" test >/dev/null 2>&1 || rc=$?
check "restore test: no docs yet is not a failure" "$rc:$(jq -r .detail "$BR/state/restore-test.json" | grep -c 'docs: none on the server yet')" "0:1"
env EXTAS_CONFIG_FILE="$T/server.conf" bash ../deploy/docs-sync.sh "$DSHA" "$T/repo" >/dev/null
rc=0; "${BENV[@]}" bash "$B/extas-restore" test >/dev/null 2>&1 || rc=$?
check "restore test: docs on the server but no bundle fails it" "$rc:$(jq -r .detail "$BR/state/restore-test.json" | grep -c 'no docs bundle')" "1:1"
rm "$T/repo/docs/MASTER-REGISTER.md"
env EXTAS_CONFIG_FILE="$T/server.conf" bash ../deploy/docs-sync.sh eeeeeeeeeeee5555555555555555555555555555 "$T/repo" >/dev/null
rc=0; "${BENV[@]}" EXTAS_BACKUP_STAMP="$(stamp '3 minutes ago')" "$B/extas-backup" daily >/dev/null 2>&1 || rc=$?
check "backup: a docs copy without the register fails the backup" "$rc:$(jq -r .result "$BR/state/backup-daily-local.json"):$(jq -r .detail "$BR/state/backup-daily-local.json" | grep -c 'MASTER-REGISTER.md is missing')" "1:fail:1"
sed -i 's/^BACKUP_MEDIA=.*/BACKUP_MEDIA="yes"/' "$T/server.conf"
rc=0; "${BENV[@]}" bash "$B/extas-restore" test >/dev/null 2>&1 || rc=$?
check "restore test: photos on disk but no archive fails it" "$rc:$(jq -r .detail "$BR/state/restore-test.json" | grep -c 'no photo archive')" "1:1"
rm -rf "$T"

# The app's own database role (PR 139, infra/deploy/app-role.sh) with a stand-in `docker`: nothing switches until the
# password, PgBouncer's login and migration 0010 are all there; then only the app's two URLs move to extas_app (host,
# port, database and options kept; the direct URL stays the owner's), the password goes to psql on stdin only (never
# on a command line or in the output) with statement logging off, a second run changes nothing, and a failed login
# leaves everything as it was.
T="$(mktemp -d)"; mkdir -p "$T/bin" "$T/sec"
cat > "$T/bin/docker" <<'FAKE'
#!/usr/bin/env bash
# stand-in for `docker exec -i extas-postgres psql …`: logs the arguments and the SQL, answers like the database would
echo "ARGS $*" >> "$FAKE_LOG"
sql="$(cat)"; printf 'SQL %s\n' "$sql" >> "$FAKE_LOG"
case "$sql" in
  *extas_append_only*) [ -n "${FAKE_GUARDS:-}" ] && echo "$FAKE_GUARDS" || exit 2 ;;
  *has_table_privilege*) [ "${FAKE_READY:-f}" = t ] && echo t || { echo 'ERROR: role "extas_app" does not exist' >&2; exit 1; } ;;
  *"ALTER ROLE"*) exit "${FAKE_LOGIN_RC:-0}" ;;
esac
exit 0
FAKE
chmod +x "$T/bin/docker"
APW="Abc123def456ghi789jkl012mno345pqr678stu9"
printf 'SESSION_SECRET=keep\nDATABASE_URL=postgresql://extas:ownerpw@extas-pgbouncer:6432/extas?pgbouncer=true\nDATABASE_DIRECT_URL=postgresql://extas:ownerpw@extas-postgres:5432/extas\n' > "$T/sec/app.env"
printf 'REPORT_DATABASE_URL=postgresql://extas:ownerpw@extas-pgbouncer:6432/extas_report?pgbouncer=true\nMEILI_URL=http://extas-meilisearch:7700\n' > "$T/sec/app-connections.env"
chmod 600 "$T/sec/app.env" "$T/sec/app-connections.env"
printf 'POSTGRES_PASSWORD=ownerpw\n' > "$T/sec/postgres.env"
printf '"extas" "ownerpw"\n' > "$T/userlist.txt"
cp "$T/sec/app.env" "$T/app.env.orig"
role() { PATH="$T/bin:$PATH" FAKE_LOG="$T/docker.log" bash -c '. ../deploy/app-role.sh; app_role_use "$1" "$2"' _ "$T/sec" "$T/userlist.txt"; }
check "app role: no password yet keeps the owner role" "$(role)" "kept the owner role: no APP_DB_PASSWORD yet (server setup makes it)"
printf 'APP_DB_PASSWORD=%s\n' "$APW" >> "$T/sec/postgres.env"
check "app role: no PgBouncer login yet keeps the owner role" "$(role)" "kept the owner role: PgBouncer has no extas_app login yet (server setup writes it)"
printf '"extas_app" "%s"\n' "$APW" >> "$T/userlist.txt"
check "app role: before migration 0010 keeps the owner role" "$(FAKE_READY=f role)" "kept the owner role: migration 0010_append_only is not in the database"
check "app role: app.env untouched while waiting" "$(cmp -s "$T/app.env.orig" "$T/sec/app.env" && echo same)" "same"
check "app role: a failed login keeps the owner role" "$(FAKE_READY=t FAKE_LOGIN_RC=1 role)" "kept the owner role: could not give extas_app its login"
check "app role: app.env untouched after a failed login" "$(cmp -s "$T/app.env.orig" "$T/sec/app.env" && echo same)" "same"
: > "$T/docker.log"
out="$(FAKE_READY=t role)"
check "app role: switches when everything is in place" "$out" "switched"
check "app role: the app's URL moves to extas_app, the rest kept" "$(grep '^DATABASE_URL=' "$T/sec/app.env")" "DATABASE_URL=postgresql://extas_app:$APW@extas-pgbouncer:6432/extas?pgbouncer=true"
check "app role: the direct URL stays the owner's" "$(grep '^DATABASE_DIRECT_URL=' "$T/sec/app.env")" "DATABASE_DIRECT_URL=postgresql://extas:ownerpw@extas-postgres:5432/extas"
check "app role: the report URL moves too" "$(grep '^REPORT_DATABASE_URL=' "$T/sec/app-connections.env")" "REPORT_DATABASE_URL=postgresql://extas_app:$APW@extas-pgbouncer:6432/extas_report?pgbouncer=true"
check "app role: other lines kept" "$(sed -n 1p "$T/sec/app.env"):$(sed -n 2p "$T/sec/app-connections.env")" "SESSION_SECRET=keep:MEILI_URL=http://extas-meilisearch:7700"
check "app role: files stay 600" "$(stat -c %a "$T/sec/app.env"):$(stat -c %a "$T/sec/app-connections.env")" "600:600"
check "app role: the password never on a command line" "$(grep '^ARGS' "$T/docker.log" | grep -c "$APW" || true)" "0"
check "app role: the login is given on stdin with statement logging off" "$(grep -c "ALTER ROLE extas_app LOGIN PASSWORD '$APW'" "$T/docker.log"):$(grep -c "SET log_statement = 'none'" "$T/docker.log")" "1:1"
check "app role: no temp files left" "$(find "$T/sec" -name '.role.*' | wc -l)" "0"
cp "$T/sec/app.env" "$T/app.env.switched"
check "app role: a second run changes nothing" "$(FAKE_READY=t role)" "in use"
check "app role: app.env the same after the second run" "$(cmp -s "$T/app.env.switched" "$T/sec/app.env" && echo same)" "same"
# The smoke test's database check: the database's own answer, or a problem when it cannot be read
guards() { PATH="$T/bin:$PATH" FAKE_LOG="$T/docker.log" bash -c '. ../deploy/app-role.sh; app_role_guards'; }
check "app role: guards ok passes through" "$(FAKE_GUARDS='ok: 14 tables append-only' guards)" "ok: 14 tables append-only"
check "app role: a guard problem passes through" "$(FAKE_GUARDS='problem: guard off or app role may change AuditLog' guards)" "problem: guard off or app role may change AuditLog"
check "app role: an unreadable database is a problem" "$(guards)" "problem: the append-only check could not read the database"
rm -rf "$T"

exit $fail
