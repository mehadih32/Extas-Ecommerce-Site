# shellcheck shell=bash
# PR 8 — backup timers, the first backup and the first restore test (a backup never restored is not a backup).
timer_unit() { # timer_unit <name> <description> <command> <OnCalendar>
  write_file "/etc/systemd/system/$1.service" 0644 >/dev/null <<UNIT
[Unit]
Description=$2
After=docker.service
Requires=docker.service
[Service]
Type=oneshot
Nice=10
IOSchedulingClass=idle
ExecStart=$3
UNIT
  write_file "/etc/systemd/system/$1.timer" 0644 >/dev/null <<UNIT
[Unit]
Description=$2 (timer)
[Timer]
OnCalendar=$4
Persistent=true
RandomizedDelaySec=20
[Install]
WantedBy=timers.target
UNIT
}

step_backup() {
  local b
  for b in extas-backup extas-restore; do install -m 0755 "$EXTAS_REPO_DIR/infra/server/bin/$b" "/usr/local/sbin/$b"; done
  install -m 0644 "$EXTAS_REPO_DIR/infra/config/server.conf" /etc/extas/server.conf
  timer_unit extas-backup-daily "EXTAS daily backup" "/usr/local/sbin/extas-backup daily" "*-*-* $BACKUP_TIME:00"
  timer_unit extas-backup-wal "EXTAS WAL push to Blob" "/usr/local/sbin/extas-backup wal" "*-*-* *:*:30"
  timer_unit extas-backup-prune "EXTAS backup retention" "/usr/local/sbin/extas-backup prune" "*-*-* 05:15:00"
  timer_unit extas-restore-test "EXTAS monthly restore test" "/usr/local/sbin/extas-restore test" "*-*-01 03:30:00"
  systemctl daemon-reload
  systemctl enable --now extas-backup-daily.timer extas-backup-wal.timer extas-backup-prune.timer extas-restore-test.timer >/dev/null 2>&1

  # First backup now if there is none yet, then prove it restores.
  if [ -z "$(ls -A "$EXTAS_ROOT/backups/base" 2>/dev/null)" ]; then
    pg_exec psql -qX -U extas -d extas -c "SELECT pg_switch_wal()" >/dev/null 2>&1 || true
    /usr/local/sbin/extas-backup daily >/dev/null 2>&1 || true
  fi
  local bl dr
  bl="$(jq -r '.result + " — " + .detail' "$EXTAS_STATE_DIR/backup-daily-blob.json" 2>/dev/null || echo "not run")"
  dr="$(jq -r '.result + " — " + .detail' "$EXTAS_STATE_DIR/backup-daily-drive.json" 2>/dev/null || echo "not run")"
  if jq -e '.result=="ok"' "$EXTAS_STATE_DIR/backup-daily-local.json" >/dev/null 2>&1; then
    report OK "PR 8 · backup (data disk)" "$(jq -r .detail "$EXTAS_STATE_DIR/backup-daily-local.json"); daily at $BACKUP_TIME, WAL every minute"
  else
    report FAIL "PR 8 · backup (data disk)" "first backup failed"
  fi
  report INFO "PR 8 · Azure Blob" "$bl"
  report INFO "PR 8 · Google Drive" "$dr"
  if /usr/local/sbin/extas-restore test >/dev/null 2>&1; then
    report OK "PR 8 · restore test" "$(jq -r .detail "$EXTAS_STATE_DIR/restore-test.json")"
  else
    report FAIL "PR 8 · restore test" "$(jq -r .detail "$EXTAS_STATE_DIR/restore-test.json" 2>/dev/null || echo 'did not run')"
  fi
}
