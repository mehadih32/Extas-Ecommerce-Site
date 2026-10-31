# shellcheck shell=bash
# PR 9 — monitoring and alerts, from the first hour.
step_monitor() {
  install -m 0755 "$EXTAS_REPO_DIR/infra/server/bin/extas-monitor" /usr/local/sbin/extas-monitor
  # S19 · PR 392: the vault's keys for the server's scripts (the Telegram bot first), every VAULT_SYNC_EVERY_MIN minutes.
  install -m 0755 "$EXTAS_REPO_DIR/infra/server/bin/extas-vault-sync" /usr/local/sbin/extas-vault-sync
  timer_unit extas-monitor "EXTAS health check and alerts" "/usr/local/sbin/extas-monitor" "*-*-* *:*:00"
  timer_unit extas-vault-sync "EXTAS vault keys for the server scripts" "/usr/local/sbin/extas-vault-sync" "*-*-* *:0/${VAULT_SYNC_EVERY_MIN}:15"
  systemctl daemon-reload
  systemctl enable --now extas-monitor.timer extas-vault-sync.timer >/dev/null 2>&1
  /usr/local/sbin/extas-vault-sync >/dev/null 2>&1 || true
  /usr/local/sbin/extas-monitor || true
  local tg="not connected — alerts go to the log until the Telegram bot is added in Keys & connections"
  [ -s "$EXTAS_SECRETS_DIR/telegram.env" ] && tg="connected"
  local probs
  probs="$(jq -r '.problems | if length==0 then "none" else join("; ") end' "$EXTAS_STATE_DIR/health.json" 2>/dev/null || echo "?")"
  report OK "PR 9 · monitoring" "every minute: disks (${EXTAS_DISK_ALARM_PCT}%), services, NVMe, backups, speed; Telegram $tg; problems now: $probs"
  report INFO "PR 392 · vault keys for the server" "every ${VAULT_SYNC_EVERY_MIN} min: $(jq -r '.result + " — " + .detail' "$EXTAS_STATE_DIR/vault-sync.json" 2>/dev/null || echo 'not run yet')"
}
