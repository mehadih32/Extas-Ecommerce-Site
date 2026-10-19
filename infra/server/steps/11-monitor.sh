# shellcheck shell=bash
# PR 9 — monitoring and alerts, from the first hour.
step_monitor() {
  install -m 0755 "$EXTAS_REPO_DIR/infra/server/bin/extas-monitor" /usr/local/sbin/extas-monitor
  timer_unit extas-monitor "EXTAS health check and alerts" "/usr/local/sbin/extas-monitor" "*-*-* *:*:00"
  systemctl daemon-reload
  systemctl enable --now extas-monitor.timer >/dev/null 2>&1
  /usr/local/sbin/extas-monitor || true
  local tg="not connected — alerts go to the log until the Telegram bot is added in Keys & connections"
  [ -s "$EXTAS_SECRETS_DIR/telegram.env" ] && tg="connected"
  local probs
  probs="$(jq -r '.problems | if length==0 then "none" else join("; ") end' "$EXTAS_STATE_DIR/health.json" 2>/dev/null || echo "?")"
  report OK "PR 9 · monitoring" "every minute: disks (${EXTAS_DISK_ALARM_PCT}%), services, NVMe, backups, speed; Telegram $tg; problems now: $probs"
}
