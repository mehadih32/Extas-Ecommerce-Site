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
  local when="$1" view="" du_out d sz note img root snap
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
        printf "- `%s` %.1f GB\n", p, $1/1048576; if (++c == 10) exit }' || true  # awk stops after 10 rows; sort's broken pipe is not a failure
    echo
    img="$(docker info -f '{{.Driver}} ({{range .DriverStatus}}{{index . 0}}={{index . 1}} {{end}})' 2>/dev/null || true)"
    echo "Docker image store: ${img:-Docker not answering}; Docker folder: $(docker info -f '{{.DockerRootDir}}' 2>/dev/null || echo '?')."
    snap="$(ls -1t "$EXTAS_ROOT/logs/disk-snapshots" 2>/dev/null | head -1 || true)"
    if [ -n "$snap" ]; then
      echo
      echo "Last disk snapshot by the monitor (\`logs/disk-snapshots/$snap\`, / passed ${DISK_SNAPSHOT_PCT}%):"
      echo
      echo '```'
      head -60 "$EXTAS_ROOT/logs/disk-snapshots/$snap"
      echo '```'
    fi
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
  # A crashed job's leftovers in /tmp never pile up between restarts (Ubuntu only empties /tmp at boot).
  printf '# EXTAS (PR 4 follow-up) — temp files untouched %s days are removed\ne /tmp - - - %sd\ne /var/tmp - - - %sd\n' \
    "$TMP_KEEP_DAYS" "$TMP_KEEP_DAYS" "$TMP_KEEP_DAYS" | write_file /etc/tmpfiles.d/extas-tmp.conf 0644 >/dev/null
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
  local sound_before="" i
  for i in $(echo "$img_before" | grep -v '<none>'); do osdisk_image_sound "$i" && sound_before="$sound_before $i"; done
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
  local sick=""
  for i in $sound_before; do osdisk_image_sound "$i" || sick="$sick $i"; done
  if [ -n "$sick" ]; then rm -f "$EXTAS_STATE_DIR/containerd-moved.at"; osdisk_putback "" "images lost files on the new store:$sick"; return 1; fi
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
  # The view is private (no later mount reaches it), and the folder must be the old copy on / itself: never the
  # volume (31 Oct: a shared view took the volume with it and the removal went into the live store).
  mount --make-private "$view" 2>/dev/null || true
  if [ -d "$view$CONTAINERD_ROOT" ]; then
    if mountpoint -q "$view$CONTAINERD_ROOT" || [ "$(stat -c %d "$view$CONTAINERD_ROOT")" != "$(stat -c %d "$view")" ] \
       || [ "$(stat -c %d "$view$CONTAINERD_ROOT")" = "$(stat -c %d "$CONTAINERD_ROOT")" ]; then
      umount -l "$view" 2>/dev/null || true; rmdir "$view" 2>/dev/null || true
      report FAIL "PR 4 · containerd store" "the old copy could not be told apart from the volume; nothing removed"; return 1
    fi
    find "$view$CONTAINERD_ROOT" -mindepth 1 -maxdepth 1 -exec rm -rf --one-file-system {} +
  fi
  umount "$view" 2>/dev/null || umount -l "$view" 2>/dev/null || true; rmdir "$view" 2>/dev/null || true
  rm -f "$marker"
  OSDISK_NOTE="${OSDISK_NOTE:+$OSDISK_NOTE; }the old copy on / removed"
  return 0
}

# PR 4 follow-up (31 Oct, after the move): the old copy's removal went through a view of / that the new volume had
# reached (a bind mount of a shared / takes later mounts with it), so files went missing from the new store under
# running containers. postgres:17 still ran (its programs were loaded), but inside it `tr` and pg_isready were gone,
# its health check failed and every deploy rolled back. A sound image or container has a shell and the basic tools.
OSDISK_TOOLS='for b in ls cat tr; do command -v "$b" >/dev/null || exit 1; done'
osdisk_image_sound() { docker run --rm --network none --entrypoint sh "$1" -c "$OSDISK_TOOLS" </dev/null >/dev/null 2>&1; }
osdisk_container_sound() { docker exec "$1" sh -c "$OSDISK_TOOLS" </dev/null >/dev/null 2>&1; }

# The full name containerd keeps an image under (Docker's short names: postgres:17 → docker.io/library/postgres:17).
osdisk_image_ref() {
  case "$1" in
    */*/*|*.*/*|localhost/*) echo "$1" ;;
    */*) echo "docker.io/$1" ;;
    *) echo "docker.io/library/$1" ;;
  esac
}

# A view of / left mounted by an earlier removal (with the store volume inside it) is taken down; nothing is deleted.
osdisk_stale_views() {
  local t
  for t in $(findmnt -rn -o TARGET 2>/dev/null | grep -E "^/tmp/tmp\.[A-Za-z0-9]+${CONTAINERD_ROOT}\$" || true); do
    umount -l "$t" 2>/dev/null || true
    umount -l "${t%"$CONTAINERD_ROOT"}" 2>/dev/null || true
    rmdir "${t%"$CONTAINERD_ROOT"}" 2>/dev/null || true
    log "took down a stale view of / ($t)"
  done
}

# osdisk_pull <image> — pulls it and checks it; on failure the error's last line is left in OSDISK_PULL_ERR.
osdisk_pull() {
  local out
  if out="$(docker pull -q "$1" </dev/null 2>&1)" && osdisk_image_sound "$1"; then return 0; fi
  OSDISK_PULL_ERR="$(printf '%s' "$out" | tail -1 | cut -c1-200)"; [ -n "$OSDISK_PULL_ERR" ] || OSDISK_PULL_ERR="pulled, but its tools are missing"
  return 1
}

# Docker Hub answers (401 without a token is an answer): a failed pull is then the store's fault, not the network's.
osdisk_registry_up() { curl -s -o /dev/null -m 15 -w '%{http_code}' https://registry-1.docker.io/v2/ 2>/dev/null | grep -qE '^(200|401)$'; }

# osdisk_reset_store — the last resort when pulls fail although the registry answers (31 Oct: the store's own records
# pointed at files that were gone, so even a fresh pull could not unpack). Docker is stopped, everything in the store
# is set aside on the same volume (nothing is deleted now; a later run removes it after STORE_ASIDE_KEEP_DAYS), Docker
# starts on an empty store, and every container (its layers were in that store) and the build cache are removed. All
# the stack's data is in host folders; the images are pulled or built again and the next deploy builds the app.
# Every container goes (their layers are in the store being set aside); their data is in host folders.
osdisk_rm_all() {
  local ids
  ids="$(docker ps -aq </dev/null | paste -sd' ')"
  # shellcheck disable=SC2086  # a list of container ids
  [ -z "$ids" ] || docker rm -f $ids </dev/null >/dev/null 2>&1 || true
}

# R1 ops review (M6): a reset removes every container, the live app's too, so it is only for a store that is really
# broken. A pull refused by Docker Hub's rate limit or by a full disk is not that (a full store also fails the image
# check's `docker run`): nothing is reset then, and OSDISK_NO_RESET says why.
osdisk_reset_allowed() { # osdisk_reset_allowed <last pull error>
  local pct
  case "${1,,}" in
    *toomanyrequests*|*"rate limit"*|*"too many requests"*) OSDISK_NO_RESET="Docker Hub's rate limit, not a broken store"; return 1 ;;
    *"no space left"*) OSDISK_NO_RESET="the disk is full, not a broken store"; return 1 ;;
  esac
  pct="$(df --output=pcent "$CONTAINERD_ROOT" 2>/dev/null | tail -1 | tr -dc '0-9')"
  if [ -n "$pct" ] && [ "$pct" -ge "${OSDISK_RESET_MAX_PCT:-90}" ]; then
    OSDISK_NO_RESET="the image store is ${pct}% full (OSDISK_RESET_MAX_PCT ${OSDISK_RESET_MAX_PCT:-90}), not broken"; return 1
  fi
  return 0
}

osdisk_reset_store() {
  local aside i
  mountpoint -q "$CONTAINERD_ROOT" || { report FAIL "PR 4 · image check" "pulls fail and the store is not on its own volume: not reset"; return 1; }
  aside="$CONTAINERD_ROOT/broken-$(date -u +%Y%m%d%H%M%S)"
  log "image check: pulls fail with the registry up — setting the store aside in $aside and starting on an empty one"
  osdisk_rm_all
  systemctl stop docker.socket docker.service containerd.service
  mkdir -p "$aside"
  find "$CONTAINERD_ROOT" -mindepth 1 -maxdepth 1 ! -name 'broken-*' ! -name lost+found -exec mv -t "$aside" {} +
  osdisk_services_up
  for i in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 2; done
  osdisk_rm_all
  docker builder prune -af >/dev/null 2>&1 || true
  date -u +%s > "$EXTAS_STATE_DIR/store-reset.at"
  # R1 ops review (M6): the app's containers went with the store, and a deploy only runs on a merge, so server-setup.yml
  # starts one at once when it finds this file (and removes it).
  date -u +%s > "$EXTAS_STATE_DIR/store-reset.redeploy"
  report WARN "PR 4 · image check" "the image store was broken beyond repair: set aside ($(basename "$aside")) and started empty; images pulled and built again, a deploy is started at once to build the app again"
}

# The set-aside stores go after STORE_ASIDE_KEEP_DAYS (never the live store: only broken-* folders at its top level).
osdisk_aside_cleanup() {
  mountpoint -q "$CONTAINERD_ROOT" || return 0
  find "$CONTAINERD_ROOT" -mindepth 1 -maxdepth 1 -name 'broken-*' -mtime +"${STORE_ASIDE_KEEP_DAYS:-2}" -exec rm -rf --one-file-system {} + 2>/dev/null || true
}

# osdisk_repair_images — the stack's pulled images (IMG_* in server.conf) and its containers (container_name in
# infra/stack/compose.yml) are checked. A missing or broken pulled image is removed with containerd's own clean-up at
# once and pulled again; a container that is broken, or runs from a broken image, or is not running, is stopped and
# removed so the stack step makes it again (all their data is in host folders, never in a container). When pulls still
# fail with the registry up, the store is reset once (osdisk_reset_store). Images built here go for the stack step's
# --build; the app's own images are made again by the next deploy.
osdisk_repair_images() {
  local names name img imgs=() bad_img=() bad_ct=() fixed=() built=() failed=() rc=0 last
  osdisk_stale_views
  osdisk_aside_cleanup
  for img in "${IMG_POSTGRES:-}" "${IMG_REDIS:-}" "${IMG_MEILI:-}" "${IMG_CADDY:-}"; do [ -z "$img" ] || imgs+=("$img"); done
  names="$(sed -n 's/^ *container_name: *//p' "$EXTAS_REPO_DIR/infra/stack/compose.yml" 2>/dev/null | tr -d '"' | sort -u)"
  for name in $names; do
    img="$(docker inspect -f '{{.Config.Image}}' "$name" </dev/null 2>/dev/null || true)"
    [ -n "$img" ] || continue
    if [ "$(docker inspect -f '{{.State.Running}}' "$name" </dev/null 2>/dev/null)" != true ] || ! osdisk_container_sound "$name"; then
      bad_ct+=("$name")
    fi
    case " ${imgs[*]} " in *" $img "*) ;; *) imgs+=("$img") ;; esac
  done
  for img in "${imgs[@]}"; do
    case "$img" in extas/*|extas-*) docker image inspect "$img" >/dev/null 2>&1 || continue ;; esac
    osdisk_image_sound "$img" || bad_img+=("$img")
  done
  for img in "${bad_img[@]}"; do
    for name in $names; do
      [ "$(docker inspect -f '{{.Config.Image}}' "$name" </dev/null 2>/dev/null)" = "$img" ] || continue
      case " ${bad_ct[*]} " in *" $name "*) ;; *) bad_ct+=("$name") ;; esac
    done
  done
  [ "${#bad_ct[@]}" -gt 0 ] || [ "${#bad_img[@]}" -gt 0 ] || { log "image check: the stack's images and containers are sound"; return 0; }
  log "image check: making again ${bad_ct[*]:-no container}; pulling again ${bad_img[*]:-no image}"
  for name in "${bad_ct[@]}"; do
    docker stop -t 60 "$name" </dev/null >/dev/null 2>&1 || true
    docker rm -f "$name" </dev/null >/dev/null 2>&1 || true
  done
  for img in "${bad_img[@]}"; do
    docker rmi -f "$img" </dev/null >/dev/null 2>&1 || true
    case "$img" in extas/*|extas-*) built+=("$img"); continue ;; esac   # the stack step builds it again (--build)
    ctr -n moby images rm --sync "$(osdisk_image_ref "$img")" </dev/null >/dev/null 2>&1 || true
  done
  for img in "${bad_img[@]}"; do
    case "$img" in extas/*|extas-*) continue ;; esac
    if osdisk_pull "$img"; then fixed+=("$img"); else failed+=("$img"); last="$OSDISK_PULL_ERR"; fi
  done
  if [ "${#failed[@]}" -gt 0 ]; then
    if ! osdisk_registry_up; then
      report FAIL "PR 4 · image check" "could not pull ${failed[*]} and Docker Hub does not answer (${last:-?}); nothing reset"; return 1
    elif [ -f "$EXTAS_STATE_DIR/store-reset.at" ] && [ $(( $(date -u +%s) - $(cat "$EXTAS_STATE_DIR/store-reset.at") )) -lt 21600 ]; then
      report FAIL "PR 4 · image check" "could not pull ${failed[*]} (${last:-?}); the store was already reset in the last 6 hours"; return 1
    elif ! osdisk_reset_allowed "${last:-}"; then
      report FAIL "PR 4 · image check" "could not pull ${failed[*]} (${last:-?}); $OSDISK_NO_RESET: nothing reset, the app keeps running"; return 1
    fi
    osdisk_reset_store || return 1
    imgs=("${failed[@]}" "${fixed[@]}"); failed=()
    for img in "${imgs[@]}"; do
      if osdisk_pull "$img"; then case " ${fixed[*]} " in *" $img "*) ;; *) fixed+=("$img") ;; esac
      else failed+=("$img"); report FAIL "PR 4 · image check" "$img does not pull on an empty store: $OSDISK_PULL_ERR"; rc=1; fi
    done
  fi
  report OK "PR 4 · image check" "files had gone missing in the store: made again by the stack step: ${bad_ct[*]:-none}; pulled again: ${fixed[*]:-none}; built again: ${built[*]:-none}"
  return "$rc"
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
  osdisk_repair_images || rc=1
  osdisk_usage "after this run"
  free="$(root_free_gb /)"
  pct="$(df --output=pcent / | tail -1 | tr -dc '0-9')"
  if [ "${pct:-100}" -ge "$EXTAS_DISK_ALARM_PCT" ] || [ "${free:-0}" -lt "$DISK_ROOT_MIN_FREE_GB" ]; then st=WARN; fi
  [ "$rc" = 0 ] || st=FAIL
  report "$st" "PR 4 · OS disk" "/ ${pct:-?}% used, ${free:-?} GB free (a deploy needs $DISK_ROOT_MIN_FREE_GB); containerd store: ${OSDISK_NOTE:-not moved}; build cache ≤ ${DOCKER_BUILD_CACHE_KEEP_GB} GB; journal ≤ ${JOURNAL_MAX_USE_MB} MB; runner logs ${RUNNER_DIAG_KEEP_DAYS} days"
  return "$rc"
}
