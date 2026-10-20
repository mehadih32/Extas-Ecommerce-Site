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
rm -rf "$T"

exit $fail
