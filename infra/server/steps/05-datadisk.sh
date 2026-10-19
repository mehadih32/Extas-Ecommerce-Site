# shellcheck shell=bash
# PR 1, 3 — LVM on the separate 1 TB data disk (A2.9.3). Postgres data, Docker, Redis persistence, search index,
# local media fallback, backups, kept logs, config/secrets/certificates — each on its own volume so none can
# starve another. 16 GB swap. fstab by UUID with noatime.
step_datadisk() {
  local disk cands n
  if vgs "$EXTAS_VG" >/dev/null 2>&1; then
    disk="$(pvs --noheadings -o pv_name,vg_name | awk -v vg="$EXTAS_VG" '$2==vg{print $1; exit}')"
  elif [ -n "${EXTAS_DATA_DISK:-}" ]; then
    disk="$EXTAS_DATA_DISK"
    if [ -n "$(blkid -p "$disk" 2>/dev/null)" ] || [ "$(lsblk -no NAME "$disk" | wc -l)" -ne 1 ]; then
      report FAIL "PR 3 · data disk" "$disk is not empty — refusing to touch it"; return 1
    fi
  else
    cands="$("$EXTAS_REPO_DIR/infra/server/bin/extas-find-data-disk")"
    n="$(grep -c . <<<"$cands" || true)"
    if [ "$n" -ne 1 ]; then
      report FAIL "PR 3 · data disk" "found $n empty candidate disks ($(echo $cands)); set the workflow input data_disk"; return 1
    fi
    disk="$cands"
  fi

  if ! vgs "$EXTAS_VG" >/dev/null 2>&1; then
    wipefs -n "$disk" | grep -q . && { report FAIL "PR 3 · data disk" "$disk has a signature — refusing"; return 1; }
    pvcreate -q "$disk" && vgcreate -q "$EXTAS_VG" "$disk"
  fi

  # name size mountpoint (base first: the others are nested under /srv/extas)
  local spec="base $LV_BASE_GB $EXTAS_ROOT
postgres $LV_POSTGRES_GB $EXTAS_ROOT/data/postgres
redis $LV_REDIS_GB $EXTAS_ROOT/data/redis
search $LV_SEARCH_GB $EXTAS_ROOT/data/search
media $LV_MEDIA_GB $EXTAS_ROOT/data/media
backup $LV_BACKUP_GB $EXTAS_ROOT/backups
logs $LV_LOGS_GB $EXTAS_ROOT/logs
docker $LV_DOCKER_GB /var/lib/docker"
  local name size mp dev uuid tmp
  while read -r name size mp; do
    dev="/dev/$EXTAS_VG/$name"
    [ -e "$dev" ] || lvcreate -q -y -L "${size}G" -n "$name" "$EXTAS_VG" >/dev/null
    [ -n "$(blkid -s TYPE -o value "$dev" 2>/dev/null)" ] || mkfs.ext4 -q -L "extas-$name" "$dev"
    uuid="$(blkid -s UUID -o value "$dev")"
    grep -q "UUID=$uuid" /etc/fstab || echo "UUID=$uuid $mp ext4 defaults,noatime,nofail,x-systemd.device-timeout=60s 0 2" >> /etc/fstab
    if ! mountpoint -q "$mp"; then
      if [ -d "$mp" ] && [ -n "$(ls -A "$mp" 2>/dev/null)" ]; then
        # Existing content (e.g. Docker installed earlier) moves onto the new volume first. Nothing is deleted:
        # the old copy stays under the mount as <mp>.pre-lvm.
        tmp="$(mktemp -d)"; mount "$dev" "$tmp"; rsync -aHAX "$mp"/ "$tmp"/; umount "$tmp"; rmdir "$tmp"
        mv "$mp" "$mp.pre-lvm"; mkdir -p "$mp"
      fi
      mkdir -p "$mp"; mount "$mp"
    fi
  done <<<"$spec"

  # Swap on the data disk (A2.5 PR 3: 16 GB)
  dev="/dev/$EXTAS_VG/swap"
  [ -e "$dev" ] || { lvcreate -q -y -L "${LV_SWAP_GB}G" -n swap "$EXTAS_VG" >/dev/null; mkswap -q -L extas-swap "$dev" >/dev/null; }
  grep -q "^$dev " /etc/fstab || echo "$dev none swap sw,nofail 0 0" >> /etc/fstab
  swapon --show=NAME --noheadings | grep -q "$(readlink -f "$dev")" || swapon "$dev"
  systemctl daemon-reload

  install -d -m 0700 "$EXTAS_ROOT/config" "$EXTAS_ROOT/config/secrets"
  install -d -m 0755 "$EXTAS_ROOT/state" "$EXTAS_ROOT/reports" "$EXTAS_ROOT/stack" "$EXTAS_ROOT/www"
  local free
  free="$(vgs --noheadings --units g -o vg_free "$EXTAS_VG" | tr -d ' ')"
  report OK "PR 3 · data disk" "$disk → VG $EXTAS_VG: 8 volumes + ${LV_SWAP_GB} GB swap mounted, $free free for growth"
}
