# shellcheck shell=bash
# PR 4 follow-up (31 Oct) — the OS disk / stays small. / reached 97% and the deploy's build killed the runner twice:
# Docker 29 (fresh install) keeps images and the BuildKit cache in containerd's store ($CONTAINERD_ROOT) on /, not on the
# docker volume, and nothing pruned it. This step:
#   1. writes what fills / into the report (read-only; a bind mount of / alone also shows what hides under a mount),
#   2. tidies (infra/deploy/disk-tidy.sh: build cache, untagged images, old extas images, runner logs, apt, journal),
#   3. caps the journal (JOURNAL_MAX_USE_MB) and keeps the runner's _diag logs RUNNER_DIAG_KEEP_DAYS days,
#   4. moves containerd's store onto its own volume in VG $EXTAS_VG (LV_CONTAINERD_GB), once: copy while running, stop
#      Docker and containerd (live-restore keeps the containers running), final copy, mount, start, check; any failure
#      puts everything back as it was and starts the services again,
#   5. then restarts the containers that still run from the old copy and only then removes that copy from /.
# Idempotent: a store that is already a mountpoint is left alone; a run that stopped between 4 and 5 finishes 5.
OSDISK_NOTE=""
OSDISK_FSTAB="${EXTAS_FSTAB:-/etc/fstab}"

# osdisk_usage <when> — read-only: df of / and the size of each big folder on the OS disk, into the report.
osdisk_usage() {
  local when="$1" view="" du_out d sz note img root
  du_out="$(mktemp)"
  view="$(mktemp -d)"
  # Only the OS disk itself (no volume mounted under it), so content hidden under a mountpoint is counted too.
  if mount --bind / "$view" 2>/dev/null; then mount -o remount,bind,ro "$view" 2>/dev/null || true
  else rmdir "$view"; view=""; fi
  timeout 900 du -x -k -d 4 "${view:-/}" 2>/dev/null > "$du_out" || true
  sz_of() { awk -F'\t' -v p="$1" '$2==p{printf "%.1f GB", $1/1048576; f=1} END{if(!f) printf "—"}' "$du_out"; }
  {
    echo
    echo "## OS disk (/) — $when"
    echo
    echo '```'
    df -h / | sed 's/[[:space:]]*$//'
    echo '```'
    echo
    echo "| Folder | On the OS disk | Note |"
    echo "|---|---|---|"
    for d in "$CONTAINERD_ROOT" /var/lib/docker /var/lib/docker.pre-lvm "$RUNNER_DIR" "$RUNNER_DIR/_work" "$RUNNER_DIR/_diag" \
      /home /root /var/log /var/log/journal /var/cache /var/tmp /tmp; do
      [ -e "$view$d" ] || continue
      sz="$(sz_of "$view$d")"
      note=""
      if mountpoint -q "$d" 2>/dev/null; then note="own volume here ($(df -h --output=used "$d" | tail -1 | tr -d ' ') used on it)"; fi
      echo "| \`$d\` | $sz | $note |"
    done
    echo
    echo "Largest folders on the OS disk:"
    echo
    root="${view:-}"
    sort -rn "$du_out" | awk -F'\t' -v v="$root" '
      { p = substr($2, length(v) + 1); if (p == "" || p == "/") next; n = gsub(/\//, "/", p); if (n > 3) next
        printf "- `%s` %.1f GB\n", p, $1/1048576; if (++c == 10) exit }'
    echo
    img="$(docker info -f '{{.Driver}} ({{range .DriverStatus}}{{index . 0}}={{index . 1}} {{end}})' 2>/dev/null || true)"
    echo "Docker image store: ${img:-Docker not answering}; Docker folder: $(docker info -f '{{.DockerRootDir}}' 2>/dev/null || echo '?')."
  } >> "$REPORT_FILE.profile"
  if [ -n "$view" ]; then umount "$view" 2>/dev/null || true; rmdir "$view" 2>/dev/null || true; fi
  rm -f "$du_out"
}

# The journal cap and the runner's log rule (systemd-tmpfiles cleans _diag daily).
osdisk_limits() {
  local c
  c="$(printf '# EXTAS (PR 4 follow-up) — the journal never takes more than this on /\n[Journal]\nSystemMaxUse=%sM\n' \
    "$JOURNAL_MAX_USE_MB" | write_file /etc/systemd/journald.conf.d/10-extas.conf 0644)"
  [ -z "$c" ] || systemctl restart systemd-journald
  if [ -d "$RUNNER_DIR" ]; then
    printf '# EXTAS (PR 4 follow-up) — the runner keeps its own logs %s days\ne %s/_diag - - - %sd\n' \
      "$RUNNER_DIAG_KEEP_DAYS" "$RUNNER_DIR" "$RUNNER_DIAG_KEEP_DAYS" | write_file /etc/tmpfiles.d/extas-runner.conf 0644 >/dev/null
  fi
  return 0
}

osdisk_services_up() { systemctl start containerd.service docker.socket docker.service >/dev/null 2>&1 || true; }

# osdisk_putback <temp mount or ""> <why> — the old store back in place (the copy unmounted), the services started.
osdisk_putback() {
  systemctl stop docker.socket docker.service containerd.service >/dev/null 2>&1 || true
  if [ -n "$1" ]; then umount "$1" 2>/dev/null || true; rmdir "$1" 2>/dev/null || true; fi
  if mountpoint -q "$CONTAINERD_ROOT"; then umount "$CONTAINERD_ROOT" 2>/dev/null || umount -l "$CONTAINERD_ROOT" 2>/dev/null || true; fi
  osdisk_services_up
  report FAIL "PR 4 · containerd store" "$2 — put back: the store stays on /, docker $(systemctl is-active docker 2>/dev/null || echo '?'); the copy on LV $EXTAS_VG/containerd is redone next run"
}

# osdisk_wait_up <container>... — every one running (and healthy when it has a health check), up to 3 minutes.
osdisk_wait_up() {
  local i id st ok
  for i in $(seq 1 90); do
    ok=1
    for id in "$@"; do
      st="$(docker inspect -f '{{.State.Status}}{{if .State.Health}}/{{.State.Health.Status}}{{end}}' "$id" 2>/dev/null || true)"
      case "$st" in running|running/healthy) ;; *) ok=0 ;; esac
    done
    [ "$ok" = 1 ] && return 0
    [ "$i" = 90 ] || sleep 2
  done
  return 1
}

# containerd_to_lv — step 4 above. Returns 1 (after putting everything back) when anything fails.
containerd_to_lv() {
  local store="$CONTAINERD_ROOT" dev="/dev/$EXTAS_VG/containerd" tmp used_kb free_g uuid i
  local ps_before ps_after img_before img_after live missing
  if mountpoint -q "$store"; then OSDISK_NOTE="on its own volume ($(df -h --output=used "$store" | tail -1 | tr -d ' ') used of ${LV_CONTAINERD_GB}G)"; return 0; fi
  case "$store" in /?*/?*) ;; *) report FAIL "PR 4 · containerd store" "CONTAINERD_ROOT '$store' is not a folder path"; return 1 ;; esac
  used_kb="$(du -sxk "$store" 2>/dev/null | cut -f1)"; used_kb="${used_kb:-0}"
  if [ "$used_kb" -gt $(( LV_CONTAINERD_GB * 1048576 * 85 / 100 )) ]; then
    report FAIL "PR 4 · containerd store" "the store on / holds $(( used_kb / 1048576 )) GB, more than 85% of LV_CONTAINERD_GB ($LV_CONTAINERD_GB GB): raise it in infra/config/server.conf; nothing was moved"
    return 1
  fi
  if [ ! -e "$dev" ]; then
    free_g="$(vgs --noheadings --units g --nosuffix -o vg_free "$EXTAS_VG" 2>/dev/null | awk '{printf "%d", $1}')"
    if [ "${free_g:-0}" -lt "$LV_CONTAINERD_GB" ]; then
      report FAIL "PR 4 · containerd store" "VG $EXTAS_VG has ${free_g:-0} GB free, LV_CONTAINERD_GB asks $LV_CONTAINERD_GB; nothing was moved"; return 1
    fi
    lvcreate -q -y -L "${LV_CONTAINERD_GB}G" -n containerd "$EXTAS_VG" >/dev/null \
      || { report FAIL "PR 4 · containerd store" "lvcreate failed; nothing was moved"; return 1; }
  fi
  if [ -z "$(blkid -s TYPE -o value "$dev" 2>/dev/null)" ]; then
    mkfs.ext4 -q -L extas-containerd "$dev" || { report FAIL "PR 4 · containerd store" "mkfs failed; nothing was moved"; return 1; }
  fi
  mkdir -p "$store"
  tmp="$(mktemp -d)"
  if ! mount "$dev" "$tmp"; then rmdir "$tmp"; report FAIL "PR 4 · containerd store" "the new volume does not mount; nothing was moved"; return 1; fi
  # First copy while everything runs (most of the data, no pause).
  if ! rsync -aHAX --numeric-ids -x --delete "$store"/ "$tmp"/; then
    umount "$tmp"; rmdir "$tmp"; report FAIL "PR 4 · containerd store" "first copy failed; nothing was stopped or moved"; return 1
  fi
  ps_before="$(docker ps -q --no-trunc | sort)"
  img_before="$(docker images --format '{{.Repository}}:{{.Tag}}' | sort -u)"
  # From here on Docker is never left stopped: putback (or the EXIT trap) starts it again.
  trap osdisk_services_up EXIT
  systemctl stop docker.socket docker.service containerd.service
  if ! rsync -aHAX --numeric-ids -x --delete "$store"/ "$tmp"/; then osdisk_putback "$tmp" "final copy failed"; return 1; fi
  umount "$tmp"; rmdir "$tmp"
  # Mounted over the old store: the old content stays underneath, untouched, until the checks and restarts passed.
  date +%s > "$EXTAS_STATE_DIR/containerd-moved.at"
  if ! mount "$dev" "$store"; then rm -f "$EXTAS_STATE_DIR/containerd-moved.at"; osdisk_putback "" "the volume did not mount at $store"; return 1; fi
  osdisk_services_up
  for i in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 2; done
  if ! docker info >/dev/null 2>&1; then rm -f "$EXTAS_STATE_DIR/containerd-moved.at"; osdisk_putback "" "Docker did not answer on the new store"; return 1; fi
  ps_after="$(docker ps -q --no-trunc | sort)"
  missing="$(comm -23 <(echo "$ps_before") <(echo "$ps_after") | grep -c . || true)"
  if [ "$missing" != 0 ]; then rm -f "$EXTAS_STATE_DIR/containerd-moved.at"; osdisk_putback "" "$missing running container(s) were not there after the start"; return 1; fi
  img_after="$(docker images --format '{{.Repository}}:{{.Tag}}' | sort -u)"
  missing="$(comm -23 <(echo "$img_before") <(echo "$img_after") | grep . | paste -sd' ')"
  if [ -n "$missing" ]; then rm -f "$EXTAS_STATE_DIR/containerd-moved.at"; osdisk_putback "" "images missing on the new store: $missing"; return 1; fi
  live="$(jq -r '.image // empty' "$EXTAS_STATE_DIR/last-good-deploy.json" 2>/dev/null || true)"
  if [ -n "$live" ] && grep -qxF "$live" <<<"$img_before"; then
    if ! docker image inspect "$live" >/dev/null 2>&1 || ! docker run --rm --network none --entrypoint test "$live" -d / >/dev/null 2>&1; then
      rm -f "$EXTAS_STATE_DIR/containerd-moved.at"; osdisk_putback "" "the live image $live does not start from the new store"; return 1
    fi
  fi
  # Every check passed: the mount comes back at boot (by UUID), and containerd and Docker wait for it (07-docker.sh).
  uuid="$(blkid -s UUID -o value "$dev")"
  grep -q "UUID=$uuid" "$OSDISK_FSTAB" || echo "UUID=$uuid $store ext4 defaults,noatime,nofail,x-systemd.device-timeout=60s 0 2" >> "$OSDISK_FSTAB"
  systemctl daemon-reload
  OSDISK_NOTE="moved to LV $EXTAS_VG/containerd (${LV_CONTAINERD_GB}G, $(( used_kb / 1048576 )) GB copied)"
  log "containerd store on its own volume; $(echo "$ps_after" | grep -c .) containers kept running"
  return 0
}

# containerd_old_copy_cleanup — step 5: the containers still running from the old copy restart (so they run from the
# volume), then the old copy under the mount goes. Runs only after containerd_to_lv passed, now or on an earlier run.
containerd_old_copy_cleanup() {
  local marker="$EXTAS_STATE_DIR/containerd-moved.at" moved id started stale=() view names
  [ -f "$marker" ] || return 0
  mountpoint -q "$CONTAINERD_ROOT" || { rm -f "$marker"; return 0; }
  case "$CONTAINERD_ROOT" in /?*/?*) ;; *) return 1 ;; esac
  moved="$(cat "$marker")"
  stale_list() {
    stale=()
    for id in $(docker ps -q); do
      started="$(date -d "$(docker inspect -f '{{.State.StartedAt}}' "$id" 2>/dev/null)" +%s 2>/dev/null || echo 0)"
      [ "$started" -gt "$moved" ] || stale+=("$id")
    done
  }
  stale_list
  if [ "${#stale[@]}" -gt 0 ]; then
    log "restarting ${#stale[@]} container(s) so they run from the new store"
    docker restart -t 30 "${stale[@]}" >/dev/null 2>&1 || true
    osdisk_wait_up "${stale[@]}" || report WARN "PR 4 · containerd store" "not every restarted container was healthy within 3 minutes ($(docker ps -a --filter status=exited --format '{{.Names}}' | paste -sd' '))"
    stale_list
  fi
  if [ "${#stale[@]}" -gt 0 ]; then
    names="$(for id in "${stale[@]}"; do docker inspect -f '{{.Name}}' "$id"; done | tr -d / | paste -sd' ')"
    report FAIL "PR 4 · containerd store" "still running from the old copy: $names — the old copy stays on / until they restart (next server-setup run)"
    return 1
  fi
  view="$(mktemp -d)"
  if ! mount --bind / "$view"; then rmdir "$view"; report FAIL "PR 4 · containerd store" "could not reach the old copy to remove it"; return 1; fi
  [ -d "$view$CONTAINERD_ROOT" ] && find "$view$CONTAINERD_ROOT" -mindepth 1 -maxdepth 1 -exec rm -rf --one-file-system {} +
  umount "$view"; rmdir "$view"
  rm -f "$marker"
  OSDISK_NOTE="${OSDISK_NOTE:+$OSDISK_NOTE; }the old copy on / removed"
  return 0
}

step_osdisk() {
  local rc=0 free pct st=OK
  # shellcheck source=../../deploy/disk-tidy.sh
  . "$EXTAS_REPO_DIR/infra/deploy/disk-tidy.sh"
  osdisk_usage "before this run"
  tidy_docker "$EXTAS_STATE_DIR" || true
  tidy_host || true
  osdisk_limits || rc=1
  if containerd_to_lv; then containerd_old_copy_cleanup || rc=1; else rc=1; fi
  osdisk_services_up
  osdisk_usage "after this run"
  free="$(root_free_gb /)"
  pct="$(df --output=pcent / | tail -1 | tr -dc '0-9')"
  if [ "${pct:-100}" -ge "$EXTAS_DISK_ALARM_PCT" ] || [ "${free:-0}" -lt "$DISK_ROOT_MIN_FREE_GB" ]; then st=WARN; fi
  [ "$rc" = 0 ] || st=FAIL
  report "$st" "PR 4 · OS disk" "/ ${pct:-?}% used, ${free:-?} GB free (a deploy needs $DISK_ROOT_MIN_FREE_GB); containerd store: ${OSDISK_NOTE:-not moved}; build cache ≤ ${DOCKER_BUILD_CACHE_KEEP_GB} GB; journal ≤ ${JOURNAL_MAX_USE_MB} MB; runner logs ${RUNNER_DIAG_KEEP_DAYS} days"
  return "$rc"
}
