# shellcheck shell=bash
# PR 8 — backup timers, the first backup and the first restore test (a backup never restored is not a backup).
# R1 ops review (minor 8): [timeout minutes] — a one-shot unit that hangs (an upload that never ends) stays "active" and
# its timer starts nothing more until it is stopped; with a limit systemd stops it and the next run starts as planned.
timer_unit() { # timer_unit <name> <description> <command> <OnCalendar> [timeout minutes]
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
${5:+TimeoutStartSec=${5}min}
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
  timer_unit extas-backup-daily "EXTAS daily backup" "/usr/local/sbin/extas-backup daily" "*-*-* $BACKUP_TIME:00" "${BACKUP_UNIT_TIMEOUT_MIN:-360}"
  timer_unit extas-backup-wal "EXTAS WAL push to Blob" "/usr/local/sbin/extas-backup wal" "*-*-* *:*:30" "${BACKUP_WAL_TIMEOUT_MIN:-30}"
  timer_unit extas-backup-prune "EXTAS backup retention" "/usr/local/sbin/extas-backup prune" "*-*-* 05:15:00" "${BACKUP_UNIT_TIMEOUT_MIN:-360}"
  # PR 507: the monthly drill restores the server's own copy and, when connected, Blob's and Drive's; the day and time
  # come from the admin's settings (extas-backup schedule, below).
  timer_unit extas-restore-test "EXTAS monthly restore drill" "/usr/local/sbin/extas-restore drill" "*-*-01 03:30:00" "${BACKUP_UNIT_TIMEOUT_MIN:-360}"
  systemctl daemon-reload
  systemctl enable --now extas-backup-daily.timer extas-backup-wal.timer extas-backup-prune.timer extas-restore-test.timer >/dev/null 2>&1
  /usr/local/sbin/extas-backup schedule >/dev/null 2>&1 || true

  # A backup now if there is no whole base backup yet or the last one failed (31 Oct 2026: a failed first backup left
  # an empty folder that counted as "there is one"), then prove it restores.
  if [ -z "$(find "$EXTAS_ROOT/backups/base" -mindepth 2 -maxdepth 2 -name base.tar.gz -print -quit 2>/dev/null)" ] \
    || ! jq -e '.result=="ok"' "$EXTAS_STATE_DIR/backup-daily-local.json" >/dev/null 2>&1; then
    pg_exec psql -qX -U extas -d extas -c "SELECT pg_switch_wal()" >/dev/null 2>&1 || true
    /usr/local/sbin/extas-backup daily >/dev/null 2>&1 || true
  fi
  local bl dr
  bl="$(jq -r '.result + " — " + .detail' "$EXTAS_STATE_DIR/backup-daily-blob.json" 2>/dev/null || echo "not run")"
  dr="$(jq -r '.result + " — " + .detail' "$EXTAS_STATE_DIR/backup-daily-drive.json" 2>/dev/null || echo "not run")"
  if jq -e '.result=="ok"' "$EXTAS_STATE_DIR/backup-daily-local.json" >/dev/null 2>&1; then
    report OK "PR 8 · backup (data disk)" "$(jq -r .detail "$EXTAS_STATE_DIR/backup-daily-local.json"); daily at $BACKUP_TIME, WAL every minute"
  else
    report FAIL "PR 8 · backup (data disk)" "$(jq -r .detail "$EXTAS_STATE_DIR/backup-daily-local.json" 2>/dev/null || echo 'first backup failed'); $(df -P "$EXTAS_ROOT/backups" | awk 'NR==2 {print $5}') of the backup disk used"
  fi
  report INFO "PR 8 · Azure Blob" "$bl"
  report INFO "PR 8 · Google Drive" "$dr"
  if /usr/local/sbin/extas-restore test >/dev/null 2>&1; then
    report OK "PR 8 · restore test" "$(jq -r .detail "$EXTAS_STATE_DIR/restore-test.json")"
  else
    report FAIL "PR 8 · restore test" "$(jq -r .detail "$EXTAS_STATE_DIR/restore-test.json" 2>/dev/null || echo 'did not run')"
  fi
}
