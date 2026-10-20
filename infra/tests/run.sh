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
want="@preview_needed not header_regexp Cookie (?:^|;\\s*)extas_preview=$tok(?:;|\$)"
check "gate: cookie match and route" "$(grep -cxF "$want" <<<"$blk"):$(grep -c '^route @preview_needed {$' <<<"$blk")" "1:1"
check "gate: the cookie comes after the login" "$(awk '/basic_auth/{a=NR} /Set-Cookie/{c=NR} END{print (a<c)}' <<<"$blk")" "1"
check "gate: 30 days, Secure and HttpOnly" "$(grep -c 'Max-Age=2592000; Secure; HttpOnly; SameSite=Lax' <<<"$blk")" "1"
check "gate: a token that is not hex is refused" "$(bash "$AB" "# fp" extas H 'x;y' 30 >/dev/null 2>&1; echo $?)" "2"

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
M="$BR/data/media"; L="$BR/backups/media"
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
sed -i 's/^BACKUP_MEDIA=.*/BACKUP_MEDIA="yes"/' "$T/server.conf"
rc=0; "${BENV[@]}" bash "$B/extas-restore" test >/dev/null 2>&1 || rc=$?
check "restore test: photos on disk but no archive fails it" "$rc:$(jq -r .detail "$BR/state/restore-test.json" | grep -c 'no photo archive')" "1:1"
rm -rf "$T"

exit $fail
