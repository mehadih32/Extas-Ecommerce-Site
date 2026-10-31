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
# PR 292: and the WhatsApp webhook (GET handshake, signed POST) on its one path, as a second negated set.
# PR 620: and the ERP's two signed GET calls (/erp-api/top-products, /erp-api/customers), as a third.
# qa-gate (30 Oct): each one matches the raw request target ({http.request.orig_uri}), case for case, anchored on its
# exact path; never Caddy's `path` matcher, which ignores case and decodes and cleans the path first.
x() { printf '\tnot {\n\t\tmethod %s\n\t\texpression `{http.request.orig_uri}.matches(\x27^%s([?].*)?$\x27)`\n\t}' "$1" "$2"; }
want_ex="$(x POST /api/erp/webhook; echo; x 'GET POST' /api/whatsapp/webhook; echo; x GET '/erp-api/(top-products|customers)')"
check "gate: the ERP and WhatsApp webhooks and the ERP's calls are the only exemptions" "$(grep -c 'not {' <<<"$blk"):$(grep -c 'method ' <<<"$blk"):$(grep -c 'expression ' <<<"$blk"):$(grep -c 'path ' <<<"$blk")" "3:3:3:0"
check "gate: the exemptions match the raw target, never a cleaned path" "$(grep -c '{http.request.orig_uri}.matches(.^/' <<<"$blk"):$(grep -cE '\b(path|path_regexp|http\.request\.uri\.path)\b' <<<"$blk")" "3:0"
check "gate: the exemption blocks, word for word" "$(sed -n '/^\tnot {$/,/^\t}$/p' <<<"$blk")" "$want_ex"
check "gate: cookie test and exemptions in one matcher" "$(sed -n '/^@preview_needed {$/,/^}$/p' <<<"$blk" | grep -c $'^\tnot ')" "4"
check "gate: the server re-writes an older gate (fingerprint v5)" "$(grep -c '# preview gate v5 for' ../server/steps/09-stack.sh)" "1"
# With a Caddy binary (CADDY_BIN, or caddy on PATH), the gate runs for real: the webhook POST reaches the app with no
# login and no cookie, and nothing else does. CI downloads the release that matches the server's image (IMG_CADDY) and
# runs this part; anywhere else it runs when a Caddy is installed.
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
  check "gate (caddy): the WhatsApp webhook GET and POST pass with no login" "$(code "$u/api/whatsapp/webhook?hub.mode=subscribe"):$(code -X POST "$u/api/whatsapp/webhook" -d '{}')" "200:200"
  check "gate (caddy): its other methods and paths still ask" "$(code -X PUT "$u/api/whatsapp/webhook"):$(code -X DELETE "$u/api/whatsapp/webhook"):$(code "$u/api/whatsapp/webhook/x"):$(code -X POST "$u/api/whatsapp"):$(code "$u/api/whatsapp/webhooks")" "401:401:401:401:401"
  check "gate (caddy): the ERP's two GET calls pass with no login" "$(code "$u/erp-api/top-products?from=2026-10-01&to=2026-10-22"):$(code "$u/erp-api/customers?page=1")" "200:200"
  check "gate (caddy): nothing else under /erp-api passes" "$(code -X POST "$u/erp-api/customers"):$(code "$u/erp-api/orders"):$(code "$u/erp-api/customers/x"):$(code "$u/erp-api")" "401:401:401:401"
  # qa-gate (30 Oct): Caddy's `path` matcher ignores case and matches the decoded, cleaned path while the app routes on
  # the raw one, so the exemptions match the raw request target, case for case. None of these reaches the app.
  check "gate (caddy): no other spelling of the ERP's calls passes" "$(code "$u/ERP-API/CUSTOMERS"):$(code "$u/ERP-API/CUSTOMER%53"):$(code "$u/erp-api/customer%73"):$(code --path-as-is "$u/x%2f..%2ferp-api%2fcustomers"):$(code --path-as-is "$u/about%2f..%2ferp-api%2fcustomers"):$(code "$u/erp-api%2Fcustomers"):$(code -I "$u/erp-api/customers"):$(code "$u/erp-api/customers/"):$(code --path-as-is "$u/erp-api/./customers"):$(code --path-as-is "$u/erp-api//customers")" "401:401:401:401:401:401:401:401:401:401"
  check "gate (caddy): the exact ERP calls with any query still pass" "$(code "$u/erp-api/customers"):$(code "$u/erp-api/top-products"):$(code "$u/erp-api/customers?search=a%2Fb&page=2")" "200:200:200"
  check "gate (caddy): no other spelling of the ERP webhook passes" "$(code -X POST "$u/API/ERP/WEBHOOK"):$(code -X POST "$u/api/erp/webhoo%6b"):$(code -X POST --path-as-is "$u/x%2f..%2fapi%2ferp%2fwebhook"):$(code -X POST "$u/api/erp/webhook/"):$(code -X POST "$u/api%2ferp%2fwebhook")" "401:401:401:401:401"
  check "gate (caddy): no other spelling of the WhatsApp webhook passes" "$(code "$u/API/WHATSAPP/WEBHOOK"):$(code -X POST "$u/api/whatsapp/webhoo%6b"):$(code --path-as-is "$u/x%2f..%2fapi%2fwhatsapp%2fwebhook"):$(code -I "$u/api/whatsapp/webhook")" "401:401:401:401"
  kill "$cpid" 2>/dev/null || true; wait "$cpid" 2>/dev/null || true
  rm -rf "$T"
elif [ -n "${CI:-}" ]; then
  # CI downloads the pinned Caddy (.github/workflows/ci.yml): a CI run without it would pass the gate unchecked.
  check "gate (caddy): CI runs the live gate checks" "no Caddy binary (CADDY_BIN)" "a Caddy binary"
else
  echo "SKIP gate (caddy): no Caddy binary here (set CADDY_BIN to run the live gate checks)"
fi

# PR 620 · p3 review round 2: the client address the app counts refused ERP calls by is Caddy's alone. Caddy believes
# CF-Connecting-IP only from Cloudflare's ranges (client-ip-block.sh, from infra/config/cloudflare-ips.txt) and the
# upstream overwrites the header with {client_ip}, so a forged header from anyone else never reaches the app.
CB=../stack/caddy/client-ip-block.sh
cfr="$(grep -cvE '^\s*(#|$)' ../config/cloudflare-ips.txt)"
cblk="$(bash "$CB" ../config/cloudflare-ips.txt)"
check "client ip: every Cloudflare range is trusted, v4 and v6, and only the Cloudflare header is read" "$(grep -c '^trusted_proxies static ' <<<"$cblk"):$(sed -n 's/^trusted_proxies static //p' <<<"$cblk" | wc -w):$(grep -c ':' <<<"$(sed -n 's/^trusted_proxies static //p' <<<"$cblk" | tr ' ' '\n')"):$(grep -cx 'client_ip_headers CF-Connecting-IP' <<<"$cblk")" "1:$cfr:$(grep -vE '^\s*(#|$)' ../config/cloudflare-ips.txt | grep -c ':'):1"
T="$(mktemp -d)"
printf '10.0.0.0/8\nnot-a-range\n' > "$T/bad.txt"; printf '# nothing\n\n' > "$T/empty.txt"; printf '10.0.0.0/33\n' > "$T/wide.txt"
check "client ip: a broken or empty range list is refused" "$(bash "$CB" "$T/bad.txt" >/dev/null 2>&1; echo $?):$(bash "$CB" "$T/empty.txt" >/dev/null 2>&1; echo $?):$(bash "$CB" "$T/wide.txt" >/dev/null 2>&1; echo $?):$(bash "$CB" >/dev/null 2>&1; echo $?)" "2:2:2:2"
rm -rf "$T"
check "client ip: the Caddyfile reads the trusted ranges inside its servers options" "$(awk '/^\tservers \{$/{f=1} f&&/^\t\}$/{f=0} f&&/import \/etc\/caddy\/sites\/client-ip\*\.caddy/{n++} END{print n+0}' ../stack/caddy/Caddyfile)" "1"
# Round 3: the deploy sends Caddy's own client address only when Caddy's live configuration trusts Cloudflare alone;
# otherwise the upstream is exactly as before (overwriting the header then would give everyone a Cloudflare address).
up0="$(EXTAS_CONFIG_FILE=../config/server.conf bash ../deploy/deploy.sh upstream blue)"
up="$(EXTAS_CONFIG_FILE=../config/server.conf bash ../deploy/deploy.sh upstream blue client-ip)"
check "client ip: the upstream without trusted_proxies is as before, with them it sends Caddy's own client address" "$(grep -c 'header_up' <<<"$up0"):$(tail -n 1 <<<"$up0"):$(grep -cxF $'\theader_up CF-Connecting-IP {client_ip}' <<<"$up"):$(tail -n 1 <<<"$up"):$(diff <(grep -v '^\s*#' <<<"$up0") <(grep -v '^\s*#' <<<"$up" | grep -v 'header_up') >/dev/null && echo same)" "0:}:1:}:same"
check "client ip: the deploy asks Caddy's live configuration before it adds the header" "$(grep -c '^if caddy_trusts_proxies; then CLIENT_IP=client-ip;' ../deploy/deploy.sh):$(grep -c '^upstream_for "$NEW" "$CLIENT_IP" >' ../deploy/deploy.sh)" "1:1"
# (a) the Caddyfile is copied into the same inode (a single-file bind mount never sees a new file).
T="$(mktemp -d)"
(
  # shellcheck source=/dev/null
  . ../deploy/caddy-live.sh
  printf 'old\n' > "$T/live"; ino="$(stat -c %i "$T/live")"; printf 'new\n' > "$T/repo"
  a="$(caddyfile_copy_inplace "$T/repo" "$T/live")"; b="$(caddyfile_copy_inplace "$T/repo" "$T/live")"
  c="$(caddyfile_copy_inplace "$T/repo" "$T/fresh")"
  echo "$a:$b:$([ "$(stat -c %i "$T/live")" = "$ino" ] && echo same-inode):$(cat "$T/live"):$c:$(cat "$T/fresh")"
) > "$T/out"
check "caddy (a): the Caddyfile is copied in place, the mounted inode sees the new content" "$(cat "$T/out")" "changed::same-inode:new:changed:new"
check "caddy (a): server setup copies the Caddyfile in place and never by rsync" "$(grep -c -- "--exclude /caddy/Caddyfile" ../server/steps/09-stack.sh):$(grep -c 'caddyfile_copy_inplace "$STACK_DIR_REPO/caddy/Caddyfile" "$EXTAS_ROOT/stack/caddy/Caddyfile"' ../server/steps/09-stack.sh):$(grep -c 'caddy reload.*|| true' ../server/steps/09-stack.sh):$(grep -c 'caddy_apply || caddy_rc=' ../server/steps/09-stack.sh)" "1:1:0:1"
# (a)+(b) caddy_apply against a stand-in docker and compose: what the running Caddy reads, its reload, its live config.
apply_case() { # apply_case <live sum ok|old> <recreate fixes yes|no> <reload rc> <live trusted yes|no>
  (
    export EXTAS_REPO_DIR; EXTAS_REPO_DIR="$(cd ../.. && pwd)"
    # shellcheck source=/dev/null
    . ../server/steps/09-stack.sh
    EXTAS_ROOT="$T/root"; mkdir -p "$EXTAS_ROOT/stack/caddy" "$EXTAS_ROOT/logs"; printf 'repo caddyfile\n' > "$EXTAS_ROOT/stack/caddy/Caddyfile"
    want="$(sha256sum < "$EXTAS_ROOT/stack/caddy/Caddyfile" | cut -d' ' -f1)"
    if [ "$1" = ok ]; then echo "$want" > "$T/live.sum"; else echo 0000 > "$T/live.sum"; fi
    : > "$T/calls"; : > "$T/report"
    report() { echo "$1 $2" >> "$T/report"; }
    compose() { echo "compose $*" >> "$T/calls"; [ "$FIX" = yes ] && echo "$want" > "$T/live.sum"; return 0; }
    docker() {
      case "$2 $3" in
        "extas-caddy sha256sum") printf '%s  /etc/caddy/Caddyfile\n' "$(cat "$T/live.sum")" ;;
        "extas-caddy caddy") echo "reload" >> "$T/calls"; [ "$RELOAD" = 0 ] || { echo "Error: adapting config" >&2; return 1; } ;;
        "extas-caddy wget") if [ "$TRUST" = yes ]; then printf '{"srv0":{"client_ip_headers":["CF-Connecting-IP"],"trusted_proxies":{"ranges":["173.245.48.0/20"],"source":"static"}}}'; else printf '{"srv0":{"listen":[":443"]}}'; fi ;;
        *) return 1 ;;
      esac
    }
    FIX="$2" RELOAD="$3" TRUST="$4"
    rc=0; caddy_apply >/dev/null 2>&1 || rc=$?
    echo "rc=$rc $(grep -c 'force-recreate.*caddy' "$T/calls") $(grep -c reload "$T/calls") $(tr '\n' ';' < "$T/report")"
  )
}
check "caddy (b): in step, reloaded, live trusted_proxies → OK only from the live check" "$(apply_case ok no 0 yes)" "rc=0 0 1 OK PR 620 · client address;"
check "caddy (a): an older Caddyfile in the container → caddy recreated, then checked live" "$(apply_case old yes 0 yes)" "rc=0 1 0 WARN PR 7 · Caddy;OK PR 620 · client address;"
check "caddy (a): still not the repo's Caddyfile after recreating → FAIL" "$(apply_case old no 0 yes)" "rc=1 1 0 FAIL PR 7 · Caddy;"
check "caddy (a): a failed reload is a FAIL, never swallowed" "$(apply_case ok no 1 yes)" "rc=1 0 1 FAIL PR 7 · Caddy;"
check "caddy (b): no trusted_proxies in the running configuration → FAIL" "$(apply_case ok no 0 no)" "rc=1 0 1 FAIL PR 620 · client address;"
rm -rf "$T"
check "client ip: the server setup writes the trusted ranges for Caddy" "$(grep -c 'write_caddy_client_ip "$d"' ../server/steps/09-stack.sh):$(grep -c 'bash "$STACK_DIR_REPO/caddy/client-ip-block.sh"' ../server/steps/09-stack.sh)" "1:2"
if [ -n "$CADDY" ] && [ -x "$CADDY" ]; then
  T="$(mktemp -d)"; pf=18481; pn=18482; pb=18483
  # "far": a list without this machine (the caller is not Cloudflare); "near": this machine stands in for Cloudflare.
  printf '192.0.2.0/24\n2001:db8::/32\n' > "$T/far.txt"; printf '127.0.0.0/8\n::1/128\n' > "$T/near.txt"
  bash "$CB" "$T/far.txt" > "$T/far.caddy"; bash "$CB" "$T/near.txt" > "$T/near.caddy"
  hu="$(grep -F 'header_up CF-Connecting-IP' <<<"$up" | tr -d '\t')"
  {
    printf '{\n\tadmin localhost:18484\n\tservers :%s {\n\t\timport %s/far.caddy\n\t}\n\tservers :%s {\n\t\timport %s/near.caddy\n\t}\n}\n' "$pf" "$T" "$pn" "$T"
    printf ':%s {\n\treverse_proxy 127.0.0.1:%s {\n\t\t%s\n\t}\n}\n' "$pf" "$pb" "$hu"
    printf ':%s {\n\treverse_proxy 127.0.0.1:%s {\n\t\t%s\n\t}\n}\n' "$pn" "$pb" "$hu"
    printf ':%s {\n\trespond "{http.request.header.CF-Connecting-IP}" 200\n}\n' "$pb"
  } > "$T/Caddyfile"
  "$CADDY" run --config "$T/Caddyfile" --adapter caddyfile >"$T/log" 2>&1 & cpid=$!
  for _ in $(seq 50); do curl -s -o /dev/null "127.0.0.1:$pf" && curl -s -o /dev/null "127.0.0.1:$pn" && break; sleep 0.1; done
  seen() { curl -s "$@"; }
  check "client ip (caddy): a forged CF-Connecting-IP from a non-Cloudflare address never reaches the app" "$(seen -H 'CF-Connecting-IP: 203.0.113.9' "127.0.0.1:$pf/"):$(seen -H 'cf-connecting-ip: 198.51.100.4' "127.0.0.1:$pf/api/erp/webhook"):$(seen "127.0.0.1:$pf/")" "127.0.0.1:127.0.0.1:127.0.0.1"
  check "client ip (caddy): from Cloudflare's ranges, the visitor's address is passed on" "$(seen -H 'CF-Connecting-IP: 203.0.113.9' "127.0.0.1:$pn/"):$(seen "127.0.0.1:$pn/")" "203.0.113.9:127.0.0.1"
  # (b) and (c) live: `caddy_trusts_proxies` reads a running Caddy's admin API (docker exec stands in for the container).
  live_trust() { # live_trust <admin port>
    (
      # shellcheck source=/dev/null
      . ../deploy/caddy-live.sh
      docker() { shift 2; [ "$1" = wget ] && curl -s "$3"; }
      CADDY_ADMIN_PORT="$1"
      caddy_trusts_proxies && echo trusted || echo not-trusted
    )
  }
  printf '{\n\tadmin localhost:18486\n}\n:18487 {\n\trespond "plain" 200\n}\n' > "$T/plain.Caddyfile"
  "$CADDY" run --config "$T/plain.Caddyfile" --adapter caddyfile >"$T/plain.log" 2>&1 & ppid=$!
  for _ in $(seq 50); do curl -s -o /dev/null "127.0.0.1:18487" && break; sleep 0.1; done
  check "client ip (caddy): the live check sees trusted_proxies only in a Caddy that runs them" "$(live_trust 18484):$(live_trust 18486):$(live_trust 18499)" "trusted:not-trusted:not-trusted"
  kill "$ppid" 2>/dev/null || true; wait "$ppid" 2>/dev/null || true
  kill "$cpid" 2>/dev/null || true; wait "$cpid" 2>/dev/null || true
  rm -rf "$T"
elif [ -n "${CI:-}" ]; then
  check "client ip (caddy): CI runs the live client-address checks" "no Caddy binary (CADDY_BIN)" "a Caddy binary"
else
  echo "SKIP client ip (caddy): no Caddy binary here (set CADDY_BIN to run the live client-address checks)"
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
if [ "$1" = inspect ]; then case "$*" in *Config.Env*) printf 'POSTGRES_PASSWORD=ownerpw\nPATH=/usr/bin:/bin\n' ;; *) echo 'postgres:17 running since 2026-10-31' ;; esac; exit 0; fi
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
check "app role: an unreadable database is a problem" "$(guards | cut -c1-60)" "problem: the append-only check could not read the database ("
check "app role: the problem says why (image, PATH) and never shows the password" "$(g="$(guards)"; case "$g" in *postgres:17*PATH=/usr/bin:/bin*) echo why ;; esac; grep -c ownerpw <<<"$g" || true)" "why
0"
check "pg_exec: the tool runs from PostgreSQL's own folder, whatever PATH the exec gets (31 Oct: the /usr/bin wrapper answered)" "$(grep -c "ARGS exec -i extas-postgres sh -c for d in /usr/lib/postgresql/\*/bin; do \[ -x \"\$d/psql\" \] && PATH=\"\$d:\$PATH\"; done; export PATH; exec \"\$@\" pg psql -qtAX" "$T/docker.log")" "$(grep -c '^ARGS exec -i' "$T/docker.log")"
check "pg_exec: no call site runs psql through docker exec directly" "$(grep -rn 'docker exec[^|]*extas-postgres psql' ../deploy ../server/steps | grep -v ':[0-9]*:\s*#' | grep -c . || true)" "0"
rm -rf "$T"

# Follow-up 82 (PR 6): a rollback starts the previous good version's worker too. The record names each version's
# worker image; the clean-up after a deploy keeps the newest few images and never one a record still needs, however
# many failed builds came after it (infra/deploy/images.sh).
T="$(mktemp -d)"
img() { bash -c '. ../deploy/images.sh; "$@"' _ "$@"; }
check "images: a version's worker image is its record's, else the same commit's migrate image" \
  "$(img worker_image_of extas-web:aaa extas-migrate:bbb):$(img worker_image_of extas-web:aaa)" "extas-migrate:bbb:extas-migrate:aaa"
echo '{"image":"extas-web:new","previous":"extas-web:old","worker_image":"extas-migrate:new","previous_worker":"extas-migrate:oldw"}' > "$T/good.json"
check "images: the rollback target is the previous app and its own worker" "$(img rollback_target "$T/good.json")" "extas-web:old extas-migrate:oldw"
echo '{"image":"extas-web:new","previous":"extas-web:old"}' > "$T/legacy.json"
check "images: a record from before names the worker by the commit" "$(img rollback_target "$T/legacy.json")" "extas-web:old extas-migrate:old"
echo '{"image":"extas-web:new"}' > "$T/first.json"
check "images: no previous version, no rollback target" "$(img rollback_target "$T/first.json")" ""
echo '{"image":"extas-web:bad","migrate":"extas-migrate:bad","previous":"extas-web:new"}' > "$T/last.json"
img needed_images "$T/good.json" "$T/last.json" "$T/missing.json" > "$T/needed"
check "images: the records' images are all kept" "$(paste -sd' ' "$T/needed")" \
  "extas-migrate:bad extas-migrate:new extas-migrate:oldw extas-web:bad extas-web:new extas-web:old"
{ for i in 1 2 3 4 5 6; do echo "extas-migrate:fail$i 2026-10-2$i 10:00:00 +0000 UTC"; done
  echo "extas-migrate:oldw 2026-10-19 10:00:00 +0000 UTC"; echo "extas-migrate:ancient 2026-10-18 10:00:00 +0000 UTC"; } > "$T/list"
check "images: six failed builds later the rollback worker is still kept" "$(img images_to_remove 3 "$T/needed" < "$T/list" | paste -sd' ')" \
  "extas-migrate:fail3 extas-migrate:fail2 extas-migrate:fail1 extas-migrate:ancient"
: > "$T/none"
check "images: with no record the newest few are kept" "$(img images_to_remove 7 "$T/none" < "$T/list")" "extas-migrate:ancient"
# The whole rollback with a stand-in docker and curl: the worker comes back from the previous version's own image.
mkdir -p "$T/bin" "$T/root/state/deploys" "$T/root/config/secrets" "$T/root/config/caddy/sites"
cat > "$T/bin/docker" <<'FAKE'
#!/usr/bin/env bash
# stand-in for docker in deploy.sh: images exist when listed in FAKE_IMAGES; compose logs what each colour runs
echo "ARGS $*" >> "$FAKE_LOG"
case "$1" in
  image) img="${*: -1}"; grep -qxF -e "$img" <(tr ' ' '\n' <<<"$FAKE_IMAGES") || exit 1
         [ "${2:-}" != inspect ] || [ "${3:-}" != -f ] || echo "GIT_SHA=${img##*:}" ;;
  compose) echo "COMPOSE ${*: -4} WORKER_IMAGE=$WORKER_IMAGE WORKER_REPLICAS=$WORKER_REPLICAS APP_IMAGE=$APP_IMAGE" >> "$FAKE_LOG" ;;
  exec) case "$*" in *wget*) echo '{"ok":true}' ;; esac ;;
  images) tr ' ' '\n' <<<"$FAKE_IMAGES" | grep "^${*: -1}:" | sed 's/$/ 2026-10-20 10:00:00 +0000 UTC/' ;;
  rmi) echo "RMI ${*:2}" >> "$FAKE_LOG" ;;
esac
exit 0
FAKE
printf '#!/usr/bin/env bash\necho %s\n' "'{\"ok\":true,\"color\":\"blue\",\"color\":\"green\"}'" > "$T/bin/curl"
printf '#!/usr/bin/env bash\nexit 0\n' > "$T/bin/sleep"
chmod +x "$T/bin/docker" "$T/bin/curl" "$T/bin/sleep"
printf 'EXTAS_ROOT=%s\nEXTAS_NVME_MOUNT=/nvme\nEXTAS_TIMEZONE=Asia/Dhaka\nPROFILE_APP_HEAP_PCT=75\nEXTAS_STAGING_HOST=example.test\nEXTAS_STAGING_USER=extas\n' "$T/root" > "$T/conf"
printf 'APP_NODE_HEAP_MB=2048\nJOBS_REPLICAS=1\nJOBS_REPLICA_MEM_MB=4096\nJOBS_NODE_HEAP_MB=3072\n' > "$T/root/config/profile.env"
printf 'SESSION_SECRET=x\n' > "$T/root/config/secrets/app.env"
printf 'REDIS_QUEUE_URL=redis://q\n' > "$T/root/config/secrets/app-connections.env"
echo green > "$T/root/state/app.color"
cp "$T/good.json" "$T/root/state/last-good-deploy.json"
dep() { PATH="$T/bin:$PATH" FAKE_LOG="$T/docker.log" EXTAS_CONFIG_FILE="$T/conf" DEPLOY_DRAIN_SECONDS=0 bash ../deploy/deploy.sh "$@" >/dev/null 2>&1; }
rc=0; FAKE_IMAGES="extas-web:new extas-web:old extas-migrate:new extas-migrate:oldw" dep rollback || rc=$?
check "rollback: runs" "$rc:$(jq -r .result "$T/root/state/last-deploy.json")" "0:ok"
check "rollback: the previous version's worker starts with the app" \
  "$(grep '^COMPOSE -d --wait ' "$T/docker.log" | sed 's/^COMPOSE -d --wait --wait-timeout 180 //')" "WORKER_IMAGE=extas-migrate:oldw WORKER_REPLICAS=1 APP_IMAGE=extas-web:old"
check "rollback: the record names the worker it runs" "$(jq -r '.image, .worker_image, .worker' "$T/root/state/last-deploy.json" | paste -sd'|')" \
  "extas-web:old|extas-migrate:oldw|on: 1 copy/copies from extas-migrate:oldw"
check "rollback: the rolled-back-from version is the next rollback target, with its worker" "$(jq -r '.previous, .previous_worker' "$T/root/state/last-deploy.json" | paste -sd'|')" "extas-web:new|extas-migrate:new"
check "rollback: no image a record needs is removed" "$(grep -c '^RMI' "$T/docker.log" || true)" "0"
: > "$T/docker.log"; cp "$T/good.json" "$T/root/state/last-good-deploy.json"
rc=0; FAKE_IMAGES="extas-web:new extas-web:old extas-migrate:new" dep rollback || rc=$?
check "rollback: a worker image that is gone runs 0 copies and says why" "$rc:$(jq -r .worker "$T/root/state/last-deploy.json"):$(jq -r .worker_image "$T/root/state/last-deploy.json")" \
  "0:off: image extas-migrate:oldw is not on this server:"
# PR 602: after the switch the deploy asks the new colour to clear every cache layer once — inside the Docker network,
# with the server's own token, and never failing the deploy. Without the token (setup not re-run) it only says so.
check "cache hook: no token, no call" "$(grep -c 'cache/deployed' "$T/docker.log" || true)" "0"
printf 'SESSION_SECRET=x\nCACHE_HOOK_TOKEN=tok-0123456789abcdef0123456789abcdef\n' > "$T/root/config/secrets/app.env"
: > "$T/docker.log"; cp "$T/good.json" "$T/root/state/last-good-deploy.json"
rc=0; FAKE_IMAGES="extas-web:new extas-web:old extas-migrate:new extas-migrate:oldw" dep rollback || rc=$?
check "cache hook: the deploy still succeeds" "$rc:$(jq -r .result "$T/root/state/last-deploy.json")" "0:ok"
check "cache hook: one call to the new colour, with the token" \
  "$(grep -cE "^ARGS exec extas-caddy wget .*x-extas-cache-hook: tok-0123456789abcdef0123456789abcdef http://app-(blue|green):3000/api/internal/cache/deployed$" "$T/docker.log" || true)" "1"
rm -rf "$T"

# PR 621 (CN-029): erp-acceptance.sh runs the acceptance CLI in the migrate image with only the database address (the
# app role's once the app runs as extas_app, else the direct one, as DATABASE_URL — qa-gate N5) and the vault key, in a
# root-only file gone afterwards; an image without the CLI is "not run" (exit 0); a run past the limit is "not
# finished" (exit 0, qa-gate B1); a failed check is exit 1; state/erp-acceptance.json gets the result. Docker is a
# stand-in.
T="$(mktemp -d)"; mkdir -p "$T/bin" "$T/root/config/secrets" "$T/root/state"
{ cat ../config/server.conf; printf 'EXTAS_ROOT=%s\n' "$T/root"; } > "$T/conf"
printf 'DATABASE_DIRECT_URL=postgresql://u:dbpw@h/d\nDATABASE_URL=postgresql://pooled\nVAULT_MASTER_KEY=vk\nOTHER=x\n' > "$T/root/config/secrets/app.env"
echo '{"image":"extas-web:aaa","migrate":"extas-migrate:aaa"}' > "$T/root/state/last-good-deploy.json"
cat > "$T/bin/docker" <<'STUB'
#!/usr/bin/env bash
echo "docker $*" >> "$FAKE_LOG"
case "$1" in
  image) exit 0 ;;
  images) echo "extas-migrate:newest"; exit 0 ;;
esac
if grep -q 'test -f' <<<"$*"; then [ "${FAKE_HAS_CLI:-1}" = 1 ]; exit; fi
out=""; envf=""; prev=""
for a in "$@"; do
  [ "$prev" = -v ] && case "$a" in *:/out) out="${a%:/out}" ;; esac
  [ "$prev" = --env-file ] && envf="$a"
  prev="$a"
done
cp "$envf" "$FAKE_SEEN"
[ -z "${FAKE_EXIT:-}" ] || exit "$FAKE_EXIT"   # killed by the time limit before it wrote anything
printf '{"state":"RAN","passed":%s,"failed":%s,"skipped":0,"unreachable":false,"keyRefused":false}\n' "$FAKE_PASSED" "$FAKE_FAILED" > "$out/report.json"
echo "# ERP acceptance" > "$out/README.md"
[ "$FAKE_FAILED" = 0 ]
STUB
chmod +x "$T/bin/docker"
ea() { env PATH="$T/bin:$PATH" EXTAS_CONFIG_FILE="$T/conf" ERP_ACCEPTANCE_IMAGE_UID="$(id -u)" FAKE_LOG="$T/docker.log" FAKE_SEEN="$T/seen.env" \
  "$@" bash ../deploy/erp-acceptance.sh "$T/out"; }
rc=0; ea FAKE_PASSED=21 FAKE_FAILED=0 >/dev/null || rc=$?
check "erp acceptance: a passing run exits 0 and records it" "$rc:$(jq -c '{exit,state,passed,failed}' "$T/root/state/erp-acceptance.json")" '0:{"exit":0,"state":"RAN","passed":21,"failed":0}'
check "erp acceptance: only the direct database address (as DATABASE_URL) and the vault key go in" \
  "$(sort "$T/seen.env" | tr '\n' ' ')" "DATABASE_URL=postgresql://u:dbpw@h/d VAULT_MASTER_KEY=vk "
check "erp acceptance: the live version's migrate image runs it" "$(grep -c 'extas-migrate:aaa sh -c cd /repo/packages/jobs' "$T/docker.log")" "1"
check "erp acceptance: the report is written" "$(cat "$T/out/README.md")" "# ERP acceptance"
check "erp acceptance: the secrets file is gone" "$(find "$T/root/config/secrets" -name '.erp-acceptance.*' | wc -l | tr -d ' ')" "0"
rc=0; ea FAKE_PASSED=20 FAKE_FAILED=1 >/dev/null || rc=$?
check "erp acceptance: a failed check exits 1 (the release waits)" "$rc:$(jq -c '.failed' "$T/root/state/erp-acceptance.json")" "1:1"
rc=0; ea FAKE_HAS_CLI=0 FAKE_PASSED=0 FAKE_FAILED=0 >/dev/null || rc=$?
check "erp acceptance: a version without the run is not run, not failed" "$rc:$(jq -r '.state' "$T/root/state/erp-acceptance.json")" "0:NOT_IN_VERSION"
rm -rf "$T/out"
rc=0; ea FAKE_EXIT=124 FAKE_PASSED=0 FAKE_FAILED=0 >/dev/null || rc=$?
check "erp acceptance: a run past the time limit is not finished, not failed (qa-gate B1)" \
  "$rc:$(jq -r '.state' "$T/root/state/erp-acceptance.json"):$(grep -c 'Not finished' "$T/out/README.md")" "0:NOT_FINISHED:1"
rc=0; ea FAKE_EXIT=3 FAKE_PASSED=0 FAKE_FAILED=0 >/dev/null || rc=$?
check "erp acceptance: a run that stops without a report still fails" "$rc" "1"
printf 'DATABASE_DIRECT_URL=postgresql://u:dbpw@h/d\nDATABASE_URL=postgresql://extas_app:apppw@pgb/d?pgbouncer=true\nVAULT_MASTER_KEY=vk\n' > "$T/root/config/secrets/app.env"
rc=0; ea FAKE_PASSED=21 FAKE_FAILED=0 >/dev/null || rc=$?
check "erp acceptance: once the app runs as extas_app, that role's address goes in, never the owner's (qa-gate N5)" \
  "$rc:$(sort "$T/seen.env" | tr '\n' ' ')" "0:DATABASE_URL=postgresql://extas_app:apppw@pgb/d?pgbouncer=true VAULT_MASTER_KEY=vk "
# qa-gate B2: the release runs it inside deploy.sh, after the migration and before the new colour starts; deploy.yml
# has no separate step before the migration any more.
check "workflows: the deploy runs it after the migration, before the new colour; ci ignores its reports" \
  "$(awk '/^  if ! migrate_db "\$MIGRATE_IMAGE"/{m=NR} /erp-acceptance.sh" "\$ERP_ACCEPTANCE_OUT"/{a=NR} /^if ! app "\$NEW" up/{u=NR} END{print (m && a && u && m<a && a<u) ? "between" : "wrong"}' ../deploy/deploy.sh):$(grep -c 'ERP_ACCEPTANCE_OUT="$RUNNER_TEMP/erp-acceptance" ERP_ACCEPTANCE_TIMEOUT_MIN=8 bash infra/deploy/deploy.sh "extas-web' ../../.github/workflows/deploy.yml):$(grep -c 'bash infra/deploy/erp-acceptance.sh' ../../.github/workflows/deploy.yml):$(grep -c 'docs/reports/erp-acceptance/\*\*' ../../.github/workflows/ci.yml)" "between:1:0:1"
check "workflows: the nightly run holds no secret" "$(grep -ciE 'secrets\.|api[_-]?key' ../../.github/workflows/erp-acceptance.yml)" "0"
rm -rf "$T"

# PR 602: Caddy's cache rules — the never-kept pages (both languages), the hashed files, the internal addresses closed.
CF=../stack/caddy/Caddyfile
check "caddy cache: the site imports the cache rules" "$(grep -c '^	import cache_headers$' "$CF")" "1"
never="$(grep '@never_cached path' "$CF")"
miss=""; for p in /bag /checkout /account /bn/bag /bn/checkout /bn/account /admin /api/; do
  grep -q " $p" <<<"$never" || miss="$miss $p"; done
check "caddy cache: bag, checkout, account, admin and the API are never kept" "${miss:-none}" "none"
check "caddy cache: never kept means no-store for the browser and Cloudflare" \
  "$(grep -c 'Cache-Control "private, no-store"' "$CF"):$(grep -c 'CDN-Cache-Control "no-store"' "$CF")" "1:1"
check "caddy cache: hashed files keep a year at Cloudflare" "$(grep -c '@hashed_files CDN-Cache-Control "public, max-age=31536000, immutable"' "$CF")" "1"
check "caddy cache: the internal addresses answer 404 from outside" "$(grep -c '^	respond @internal 404$' "$CF")" "1"
check "setup: the cache hook token is made on the server" "$(grep -c 'gen_secret "$s/app.env" CACHE_HOOK_TOKEN 48' ../server/steps/09-stack.sh)" "1"


# PR 4 follow-up (31 Oct): / reached 97% and the deploy's build killed the runner twice. disk-tidy.sh cleans up (never a
# tagged image a deploy record needs, untagged images only, the build cache above its setting, old runner logs, apt,
# the journal); the deploy refuses to build when / still has too little free space, and its report says why in words.
T="$(mktemp -d)"
mkdir -p "$T/bin" "$T/root/state" "$T/runner/_diag"
printf 'EXTAS_ROOT=%s\nDOCKER_BUILD_CACHE_KEEP_GB=40\nDEPLOY_KEEP_WEB_IMAGES=1\nDEPLOY_KEEP_MIGRATE_IMAGES=1\nDISK_ROOT_MIN_FREE_GB=15\nJOURNAL_MAX_USE_MB=512\nRUNNER_DIR=%s\nRUNNER_DIAG_KEEP_DAYS=7\n' \
  "$T/root" "$T/runner" > "$T/conf"
cat > "$T/bin/docker" <<'FAKE'
#!/usr/bin/env bash
# stand-in for docker in disk-tidy.sh: the image list comes from FAKE_LIST; `builder prune --help` names the new flag
echo "ARGS $*" >> "$FAKE_LOG"
case "$1 ${2:-}" in
  "images --format") grep "^${*: -1}:" "$FAKE_LIST" ;;
  "builder prune") case "$*" in *--help*) [ -n "${FAKE_OLD_DOCKER:-}" ] && echo "--keep-storage" || echo "--max-used-space --keep-storage" ;; esac ;;
esac
exit 0
FAKE
printf '#!/usr/bin/env bash\necho "Filesystem 1G-blocks Used Available Capacity Mounted"\necho "/dev/root 125G 100G ${FAKE_FREE}G 80%% /"\n' > "$T/bin/df"
printf '#!/usr/bin/env bash\necho "ARGS $(basename "$0") $*" >> "$FAKE_LOG"\n' > "$T/bin/apt-get"
cp "$T/bin/apt-get" "$T/bin/journalctl"
chmod +x "$T/bin/"*
printf 'extas-web:new3 2026-10-31\nextas-web:live 2026-10-30\nextas-web:prev 2026-10-29\nextas-web:old 2026-10-01\nextas-migrate:live 2026-10-30\nextas-migrate:prev 2026-10-29\nextas-migrate:old 2026-10-01\n' > "$T/list"
echo '{"image":"extas-web:live","previous":"extas-web:prev","worker_image":"extas-migrate:live","previous_worker":"extas-migrate:prev"}' > "$T/root/state/last-good-deploy.json"
touch -d '10 days ago' "$T/runner/_diag/Worker_old.log"; touch "$T/runner/_diag/Worker_now.log"
tidy() { PATH="$T/bin:$PATH" FAKE_LOG="$T/docker.log" FAKE_LIST="$T/list" EXTAS_CONFIG_FILE="$T/conf" bash ../deploy/disk-tidy.sh "$@"; }
rc=0; out="$(FAKE_FREE=20 tidy --guard "$T/disk.json")" || rc=$?
check "disk tidy: enough free space passes the guard" "$rc:$(jq -c . "$T/disk.json")" \
  '0:{"ok":true,"mode":"guard","free_gb_before":20,"free_gb":20,"min_free_gb":15}'
check "disk tidy: old extas images go, never the live, previous or rollback ones" "$(sed -n 's/^ARGS rmi //p' "$T/docker.log" | paste -sd' ')" \
  "extas-web:old extas-migrate:old"
check "disk tidy: untagged images only (no -a), the build cache down to its setting" \
  "$(grep -c '^ARGS image prune -f$' "$T/docker.log"):$(grep -c '^ARGS builder prune -af --max-used-space 40gb$' "$T/docker.log"):$(grep -c 'prune -a ' "$T/docker.log" || true)" "1:1:0"
check "disk tidy: runner logs past their days, the apt cache, the journal over its cap" \
  "$([ -e "$T/runner/_diag/Worker_old.log" ] && echo kept || echo gone):$([ -e "$T/runner/_diag/Worker_now.log" ] && echo kept || echo gone):$(grep -c '^ARGS apt-get clean$' "$T/docker.log"):$(grep -c '^ARGS journalctl --vacuum-size=512M$' "$T/docker.log")" \
  "gone:kept:1:1"
rc=0; out="$(FAKE_FREE=3 tidy --guard "$T/disk.json")" || rc=$?
check "disk tidy: too little free space fails the guard, with the setting named" \
  "$rc:$(jq -r '.ok' "$T/disk.json"):$(grep -c '::error::.*only 3 GB free.*DISK_ROOT_MIN_FREE_GB' <<<"$out")" "1:false:1"
rc=0; FAKE_FREE=3 tidy --tidy >/dev/null || rc=$?
check "disk tidy: a rollback only tidies, never stops on it" "$rc" "0"
: > "$T/docker.log"; FAKE_OLD_DOCKER=1 FAKE_FREE=20 tidy --tidy >/dev/null
check "disk tidy: an older Docker gets --keep-storage" "$(grep -c '^ARGS builder prune -af --keep-storage 40gb$' "$T/docker.log")" "1"
check "disk tidy: a wrong mode is refused" "$(FAKE_FREE=20 tidy --all >/dev/null 2>&1; echo $?)" "2"
# The deploy report says it in words; the disk line shows in every report where the check ran.
printf 'EXTAS_ROOT=%s\nEXTAS_TIMEZONE=Asia/Dhaka\nEXTAS_STAGING_HOST=example.test\n' "$T" > "$T/rconf"
echo '{"ok":false,"mode":"guard","free_gb_before":2,"free_gb":3,"min_free_gb":15}' > "$T/disk.json"
env EXTAS_CONFIG_FILE="$T/rconf" DEPLOY_JSON="$T/none.json" SHA=aaaabbbbccccdddd RUN_ID=50 CHECKOUT=success DISK=failure \
  DISK_JSON="$T/disk.json" BUILD=skipped DEPLOY=skipped NOW=1760947200 bash ../deploy/deploy-report.sh "$T/out"
check "report: a full main disk in words, nothing built" \
  "$(grep -c '| Result | \*\*FAILED\*\* |' "$T/out/deploy-latest.md"):$(grep -c "main disk (/) was too full to build: 3 GB free after the clean-up, at least 15 GB needed" "$T/out/deploy-latest.md"):$(grep -c '| Main disk (/) | TOO FULL — 3 GB free' "$T/out/deploy-latest.md")" "1:1:1"
echo '{"ok":true,"mode":"guard","free_gb_before":20,"free_gb":60,"min_free_gb":15}' > "$T/disk.json"
echo '{"result":"ok","detail":"green live","sha":"aaaabbbbccccdddd","migration":"ok","run":"51","color":"green"}' > "$T/dep.json"
env EXTAS_CONFIG_FILE="$T/rconf" DEPLOY_JSON="$T/dep.json" SHA=aaaabbbbccccdddd RUN_ID=51 CHECKOUT=success DISK=success \
  DISK_JSON="$T/disk.json" BUILD=success DEPLOY=success NOW=1760947200 bash ../deploy/deploy-report.sh "$T/out"
check "report: the free space on / after the clean-up" \
  "$(grep -c '\*\*OK\*\*' "$T/out/deploy-latest.md"):$(grep -c '| Main disk (/) | 60 GB free after the clean-up (was 20 GB), at least 15 GB needed |' "$T/out/deploy-latest.md")" "1:1"
# The deploy: the check runs before the docs copy and the build; a deploy tidies after the switch; the report gets it.
W=../../.github/workflows/deploy.yml
check "workflows: the disk check runs before the docs copy and the build, and the report reads it" \
  "$(awk '/- name: Free space on the main disk/{d=NR} /- name: Copy the docs/{c=NR} /- name: Build the images/{b=NR} END{print (d && c && b && d<c && c<b) ? "first" : "wrong"}' "$W"):$(grep -c 'bash infra/deploy/disk-tidy.sh "$mode" "$RUNNER_TEMP/disk.json"' "$W"):$(grep -c 'DISK: ${{ steps.disk.outcome }}' "$W"):$(grep -c 'DISK_JSON="$RUNNER_TEMP/disk.json"' "$W")" "first:1:1:1"
check "deploy: the clean-up after the switch keeps the records' images (disk-tidy.sh)" \
  "$(awk '/^record ok "\$NEW live"/{r=NR} /^tidy_docker "\$STATE" \|\| true$/{t=NR} END{print (r && t && r<t) ? "after" : "wrong"}' ../deploy/deploy.sh):$(grep -c 'docker rmi' ../deploy/deploy.sh)" "after:0"
# Docker: BuildKit's own garbage collection from the setting (the file is valid JSON); containerd and Docker start only
# with containerd's store mounted; setup runs the OS-disk step right after Docker.
check "docker: daemon.json keeps the build cache under the setting" \
  "$(bash -c '. ../server/steps/07-docker.sh; docker_daemon_conf ",
  \"builder\": { \"gc\": { \"enabled\": true, \"defaultKeepStorage\": \"40GB\" } }"' | jq -r '[.["live-restore"], .builder.gc.enabled, .builder.gc.defaultKeepStorage] | map(tostring) | join(" ")'):$(grep -c 'dockerd --validate --config-file' ../server/steps/07-docker.sh):$(grep -c 'for key in defaultMaxUsedSpace defaultKeepStorage; do' ../server/steps/07-docker.sh):$(grep -c '\\"$key\\": \\"${DOCKER_BUILD_CACHE_KEEP_GB}GB\\"' ../server/steps/07-docker.sh)" \
  "true true 40GB:1:1:1"
check "docker: containerd and Docker wait for containerd's store" \
  "$(grep -c '^RequiresMountsFor=.* /var/lib/docker \$CONTAINERD_ROOT$' ../server/steps/07-docker.sh):$(grep -c '^RequiresMountsFor=\$CONTAINERD_ROOT$' ../server/steps/07-docker.sh)" "1:1"
check "setup: the OS-disk step runs right after Docker, not critical" "$(grep -A1 '^docker    step_docker' ../server/setup.sh | tail -1 | tr -s ' ')" "osdisk step_osdisk 0"
for k in LV_CONTAINERD_GB CONTAINERD_ROOT DOCKER_BUILD_CACHE_KEEP_GB DEPLOY_KEEP_WEB_IMAGES DEPLOY_KEEP_MIGRATE_IMAGES DISK_ROOT_MIN_FREE_GB JOURNAL_MAX_USE_MB RUNNER_DIR RUNNER_DIAG_KEEP_DAYS DISK_SNAPSHOT_PCT DISK_SNAPSHOT_KEEP TMP_KEEP_DAYS; do
  grep -q "^$k=" ../config/server.conf || { echo "FAIL server.conf has no $k"; fail=1; }
done
check "monitor: a snapshot of what fills / (folders, big files, deleted files held open) once / passes DISK_SNAPSHOT_PCT" \
  "$(grep -q 'DISK_SNAPSHOT_PCT' ../server/bin/extas-monitor && grep -q "(deleted)" ../server/bin/extas-monitor && grep -q 'DISK_SNAPSHOT_KEEP' ../server/bin/extas-monitor && echo yes)" "yes"
check "osdisk: the top-10 folders list survives sort's broken pipe under set -e (failed on the server 31 Oct)" \
  "$(bash -c 'set -euo pipefail; seq 1 200000 | sort -rn | awk "{ if (++c == 10) exit }" || true; echo ok')" "ok"
check "osdisk: old files in /tmp and /var/tmp age out; the report shows the last snapshot" \
  "$(grep -q 'e /tmp - - - %sd' ../server/steps/13-osdisk.sh && grep -q 'disk-snapshots' ../server/steps/13-osdisk.sh && echo yes)" "yes"
check "osdisk: the volume leaves room in the VG (218 GB free when it came)" "$(bash -c '. ../config/server.conf; echo $(( LV_CONTAINERD_GB < 200 ))')" "1"

# The move of containerd's store (steps/13-osdisk.sh) with stand-ins for every system command (no disk, no Docker):
# the order of the steps, the checks before anything is removed, and every failure puts things back with Docker running.
sed -e "s#^EXTAS_ROOT=.*#EXTAS_ROOT=\"$T/root\"#" -e "s#^CONTAINERD_ROOT=.*#CONTAINERD_ROOT=\"$T/var/lib/containerd\"#" \
  ../config/server.conf > "$T/sconf"
mkdir -p "$T/var/lib/containerd"
cat > "$T/stubs.sh" <<'STUBS'
# stand-ins as shell functions: every call is logged in order; the store is "mounted" while $T/mounted exists
L="$T/osd.log"; STORE="$CONTAINERD_ROOT"
mountpoint() { [ "${*: -1}" = "$STORE" ] && [ -f "$T/mounted" ]; }
du() { printf '%s\t%s\n' "${FAKE_DU_KB:-1048576}" "${*: -1}"; }
vgs() { echo "  218.00"; }
lvcreate() { echo "lvcreate $*" >> "$L"; }
blkid() { case "$*" in *TYPE*) echo ext4 ;; *UUID*) echo uuid-cd ;; esac; }
mkfs.ext4() { echo "mkfs $*" >> "$L"; }
mount() { echo "mount $*" >> "$L"; [ "${*: -1}" != "$STORE" ] || touch "$T/mounted"; [ "${*: -1}" != "$STORE" ] || [ -z "${FAIL_MOUNT:-}" ]; }
umount() { echo "umount $*" >> "$L"; [ "${*: -1}" != "$STORE" ] || rm -f "$T/mounted"; }
rsync() { local n; n=$(( $(cat "$T/rsyncs" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$T/rsyncs"; echo "rsync$n $*" >> "$L"; [ "$n" != "${FAIL_RSYNC:-0}" ]; }
systemctl() { echo "systemctl $*" >> "$L"; [ "$1" != is-active ] || echo active; }
sleep() { :; }
docker() {
  echo "docker $*" >> "$L"
  case "$1 ${2:-}" in
    "ps -q") echo cid1; echo cid2 ;;
    "ps -aq") [ -f "$T/wiped" ] || { echo cid1; echo cid2; } ;;
    "images --format") if [ -f "$T/mounted" ] && [ -n "${LOSE_IMAGE:-}" ]; then echo extas-web:live; else printf 'extas-web:live\npostgres:17\n'; fi ;;
    "inspect -f") case "$3" in
        *StartedAt*) if [ -f "$T/restarted" ]; then date -u -d '+1 minute' +%Y-%m-%dT%H:%M:%SZ; else echo 2026-10-20T00:00:00Z; fi ;;
        *Status*) echo running ;; *Name*) echo /extas-postgres ;;
        *Config.Image*) [ -f "$T/gone-$4" ] && return 1; case "$4" in extas-postgres) echo postgres:17 ;; extas-pgbouncer) echo extas/pgbouncer:local ;; *) echo redis:7 ;; esac ;;
        *State.Running*) [ "$4" = "${STOPPED_CT:-}" ] && echo false || echo true ;; esac ;;
    "restart -t") [ -n "${RESTART_FAILS:-}" ] || touch "$T/restarted" ;;
    "run --rm") case "$*" in
        *"--entrypoint sh"*) [ "$7" != "${SICK_IMAGE:-}" ] || [ -f "$T/pulled" ] || return 1
          [ "${7%%:*}" != "${SICK_ON_NEW:-}" ] || [ ! -f "$T/mounted" ] ;;
        *) [ -z "${FAIL_RUN:-}" ] ;; esac ;;
    "exec "*) [ "$2" != "${SICK_CT:-}" ] ;;
    "rm -f") touch "$T/gone-$3"; [ "$3" != cid1 ] || touch "$T/wiped" ;;
    "pull -q") if [ -n "${FAIL_PULL_ONCE:-}" ] && [ ! -f "$T/pullfailed" ]; then touch "$T/pullfailed"; echo "unpack: no such file"; return 1; fi
      if [ -n "${FAIL_PULL:-}" ]; then echo "failed to extract layer: no such file"; return 1; fi; touch "$T/pulled" ;;
    "image inspect") : ;;
    "info "*|"info") : ;;
  esac
}
ctr() { echo "ctr $*" >> "$L"; }
curl() { echo "${FAKE_REG:-401}"; }
findmnt() { [ -z "${FAKE_VIEW:-}" ] || echo "$FAKE_VIEW$STORE"; }
STUBS
osd() { # osd <function> [env…]: one run in its own shell; prints the return code
  ( for kv in "${@:2}"; do export "${kv?}"; done
    EXTAS_REPO_DIR="$(cd ../.. && pwd)"
    export EXTAS_FSTAB="$T/fstab" EXTAS_CONFIG_FILE="$T/sconf" REPORT_FILE="$T/report" T EXTAS_REPO_DIR
    # shellcheck source=../server/lib.sh
    . ../server/lib.sh; . ../server/steps/13-osdisk.sh; . "$T/stubs.sh"
    rc=0; "$1" 2>/dev/null || rc=$?; echo "$rc" )
}
reset_osd() { rm -f "$T/mounted" "$T/rsyncs" "$T/restarted" "$T/pulled" "$T/pullfailed" "$T"/gone-* "$T/root/state/containerd-moved.at" "$T/root/state/store-reset.at" "$T/wiped"; rm -rf "$T/var/lib/containerd/"broken-*; : > "$T/osd.log"; : > "$T/fstab"; : > "$T/report"; }
mkdir -p "$T/root/state"; reset_osd
rc="$(osd containerd_to_lv)"
order="$(awk '/^rsync1 /{a=NR} /^systemctl stop docker.socket docker.service containerd.service/{b=NR} /^rsync2 /{c=NR} /^mount \/dev\/extas\/containerd .*var\/lib\/containerd$/{d=NR} /^systemctl start containerd.service docker.socket docker.service/{if(!e)e=NR} /^docker run --rm --network none --entrypoint test extas-web:live -d \//{f=NR}
  END{print (a<b && b<c && c<d && d<e && e<f) ? "in order" : "wrong " a" "b" "c" "d" "e" "f}' "$T/osd.log")"
check "osdisk move: copy, stop, final copy, mount, start, then the live image starts from the new store" "$rc:$order" "0:in order"
check "osdisk move: the volume is made once, in VG extas, with the size from server.conf" "$(grep -c '^lvcreate -q -y -L 120G -n containerd extas$' "$T/osd.log")" "1"
check "osdisk move: copied with hard links, ACLs, xattrs and numeric owners, one file system" "$(grep -c '^rsync[12] -aHAX --numeric-ids -x --delete ' "$T/osd.log")" "2"
check "osdisk move: the mount comes back at boot only after the checks passed" "$(cat "$T/fstab")" "UUID=uuid-cd $T/var/lib/containerd ext4 defaults,noatime,nofail,x-systemd.device-timeout=60s 0 2"
check "osdisk move: nothing is removed during the move" "$(grep -cE '^docker (rmi|restart)|rm -rf' "$T/osd.log" || true):$([ -f "$T/root/state/containerd-moved.at" ] && echo marked)" "0:marked"
# A store that is already a volume is left alone
: > "$T/osd.log"
check "osdisk move: a second run changes nothing" "$(osd containerd_to_lv):$(grep -c 'systemctl stop\|rsync' "$T/osd.log" || true)" "0:0"
# Failures: everything back as it was, Docker and containerd started again, no boot entry, FAIL in the report
for case in "FAIL_RSYNC=2:final copy failed" "LOSE_IMAGE=1:images missing on the new store: postgres:17" "SICK_ON_NEW=postgres:images lost files on the new store: postgres:17" "FAIL_RUN=1:the live image extas-web:live does not start" "FAIL_MOUNT=1:the volume did not mount"; do
  reset_osd
  rc="$(osd containerd_to_lv "${case%%:*}")"
  back="$(awk '/^systemctl stop docker.socket/{s=NR} /^systemctl start containerd.service docker.socket docker.service/{t=NR} END{print (t>s) ? "started" : "left stopped"}' "$T/osd.log")"
  check "osdisk move fails (${case%%:*}): put back, Docker started, no boot entry" \
    "$rc:$back:$([ -f "$T/mounted" ] && echo mounted || echo old-store):$(wc -c < "$T/fstab"):$(grep -c "| FAIL | ${case#*:}" "$T/report")" "1:started:old-store:0:1"
done
reset_osd; rc="$(osd containerd_to_lv FAKE_DU_KB=200000000)"
check "osdisk move: a store bigger than the volume is never moved" "$rc:$(grep -c 'systemctl stop\|lvcreate' "$T/osd.log" || true):$(grep -c 'raise it in infra/config/server.conf' "$T/report")" "1:0:1"
# The old copy goes only after every container that ran from it restarted
reset_osd; touch "$T/mounted"; date -u +%s > "$T/root/state/containerd-moved.at"
rc="$(osd containerd_old_copy_cleanup)"
check "osdisk old copy: the containers restart first, then the copy is removed" \
  "$rc:$(awk '/^docker restart -t 30 cid1 cid2$/{r=NR} /^mount --bind \/ /{b=NR} END{print (r && b && r<b) ? "restart, then remove" : "wrong"}' "$T/osd.log"):$([ -f "$T/root/state/containerd-moved.at" ] && echo kept || echo "done")" \
  "0:restart, then remove:done"
reset_osd; touch "$T/mounted"; date -u +%s > "$T/root/state/containerd-moved.at"
rc="$(osd containerd_old_copy_cleanup RESTART_FAILS=1)"
check "osdisk old copy: kept while a container still runs from it" \
  "$rc:$(grep -c '^mount --bind' "$T/osd.log" || true):$([ -f "$T/root/state/containerd-moved.at" ] && echo kept):$(grep -c '| FAIL | still running from the old copy: extas-postgres' "$T/report")" "1:0:kept:1"
# The image check after the store move (31 Oct: files had gone missing under the running database)
reset_osd; rc="$(osd osdisk_repair_images)"
check "osdisk image check: all sound, nothing stopped, removed or pulled" "$rc:$(grep -cE '^docker (stop|rm|rmi|pull)|^ctr' "$T/osd.log" || true)" "0:0"
reset_osd; rc="$(osd osdisk_repair_images SICK_CT=extas-postgres)"
check "osdisk image check: a broken container (sound image) is stopped gently and removed, its image kept" \
  "$rc:$(grep -c '^docker stop -t 60 extas-postgres$' "$T/osd.log"):$(grep -c '^docker rm -f extas-postgres$' "$T/osd.log"):$(grep -cE '^docker (rmi|pull)|^ctr' "$T/osd.log" || true):$(grep -c '| OK | files had gone missing in the store: made again by the stack step: extas-postgres;' "$T/report")" "0:1:1:0:1"
reset_osd; rc="$(osd osdisk_repair_images SICK_IMAGE=postgres:17)"
check "osdisk image check: a broken pulled image: its container goes, containerd drops it at once, pulled again" \
  "$rc:$(awk '/^docker rm -f extas-postgres$/{a=NR} /^docker rmi -f postgres:17$/{b=NR} /^ctr -n moby images rm --sync docker.io\/library\/postgres:17$/{c=NR} /^docker pull -q postgres:17$/{d=NR} END{print (a&&a<b&&b<c&&c<d) ? "in order" : "wrong " a" "b" "c" "d}' "$T/osd.log"):$(grep -c 'pulled again: postgres:17;' "$T/report")" "0:in order:1"
reset_osd; rc="$(osd osdisk_repair_images SICK_IMAGE=postgres:17 FAIL_PULL=1 FAKE_REG=000)"
check "osdisk image check: pull fails and Docker Hub does not answer: FAIL with the error, the store is not reset" \
  "$rc:$(grep -c '| FAIL | could not pull postgres:17 and Docker Hub does not answer (failed to extract layer: no such file); nothing reset' "$T/report"):$(grep -c '^systemctl stop' "$T/osd.log" || true)" "1:1:0"
reset_osd; touch "$T/mounted"; mkdir -p "$T/var/lib/containerd/io.containerd.content.v1.content"
rc="$(osd osdisk_repair_images SICK_IMAGE=postgres:17 FAIL_PULL_ONCE=1)"
check "osdisk image check: pull fails with the registry up: all containers go, store set aside (not deleted), empty store, pulled again" \
  "$rc:$(awk '/^docker rm -f cid1 cid2$/{if(!a)a=NR} /^systemctl stop docker.socket docker.service containerd.service$/{b=NR} /^systemctl start containerd.service/{if(b&&!c)c=NR} /^docker builder prune -af$/{d=NR} END{print (a&&a<b&&b<c&&c<d) ? "in order" : "wrong " a" "b" "c" "d}' "$T/osd.log"):$(ls -d "$T"/var/lib/containerd/broken-*/io.containerd.content.v1.content >/dev/null 2>&1 && echo aside):$([ -e "$T/var/lib/containerd/io.containerd.content.v1.content" ] && echo still || echo empty):$(grep -c '| WARN | the image store was broken beyond repair' "$T/report"):$(grep -c 'pulled again: postgres:17' "$T/report")" \
  "0:in order:aside:empty:1:1"
rm -f "$T/pullfailed" "$T/pulled" "$T/wiped"; : > "$T/report"; rc="$(osd osdisk_repair_images SICK_IMAGE=postgres:17 FAIL_PULL=1)"
check "osdisk image check: never a second reset within 6 hours" "$rc:$(grep -c 'already reset in the last 6 hours' "$T/report")" "1:1"
reset_osd; touch "$T/mounted"; rc="$(osd osdisk_repair_images SICK_IMAGE=postgres:17 FAIL_PULL=1)"
check "osdisk image check: still not pulling on an empty store is a FAIL with the reason" "$rc:$(grep -c '| FAIL | postgres:17 does not pull on an empty store: failed to extract layer' "$T/report")" "1:1"
mkdir -p "$T/var/lib/containerd/broken-old" "$T/var/lib/containerd/io.containerd.keep"; touch -d '5 days ago' "$T/var/lib/containerd/broken-old"; reset_osd 2>/dev/null; mkdir -p "$T/var/lib/containerd/broken-old"; touch -d '5 days ago' "$T/var/lib/containerd/broken-old"; touch "$T/mounted"
rc="$(osd osdisk_aside_cleanup)"
check "osdisk image check: a set-aside store goes after its days, the live store stays" "$rc:$([ -d "$T/var/lib/containerd/broken-old" ] && echo kept || echo gone):$([ -d "$T/var/lib/containerd/io.containerd.keep" ] && echo live)" "0:gone:live"
reset_osd; rc="$(osd osdisk_repair_images SICK_IMAGE=extas/pgbouncer:local)"
check "osdisk image check: an image built here is removed for the stack step to build, never pulled" \
  "$rc:$(grep -c '^docker rmi -f extas/pgbouncer:local$' "$T/osd.log"):$(grep -cE '^docker pull|^ctr' "$T/osd.log" || true):$(grep -c 'built again: extas/pgbouncer:local' "$T/report")" "0:1:0:1"
reset_osd; rc="$(osd osdisk_repair_images STOPPED_CT=extas-caddy)"
check "osdisk image check: a stack container that is not running is made again" "$rc:$(grep -c '^docker rm -f extas-caddy$' "$T/osd.log")" "0:1"
reset_osd; rc="$(osd osdisk_repair_images FAKE_VIEW=/tmp/tmp.AbC123)"
check "osdisk image check: a stale view of / with the volume inside is taken down (nothing deleted)" \
  "$rc:$(grep -c "^umount -l /tmp/tmp.AbC123$T/var/lib/containerd\$" "$T/osd.log"):$(grep -c '^umount -l /tmp/tmp.AbC123$' "$T/osd.log")" "0:1:1"
rm -rf "$T"

exit $fail
