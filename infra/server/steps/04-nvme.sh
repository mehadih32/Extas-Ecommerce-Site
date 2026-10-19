# shellcheck shell=bash
# PR 601 — NVMe temporary-disk boot unit. Installs the script and the systemd unit, then runs it once now.
step_nvme() {
  install -m 0755 "$EXTAS_REPO_DIR/infra/server/bin/extas-nvme-prepare" /usr/local/sbin/extas-nvme-prepare
  install -d -m 0755 /etc/extas
  install -m 0644 "$EXTAS_REPO_DIR/infra/config/server.conf" /etc/extas/server.conf
  local changed
  changed="$(write_file /etc/systemd/system/extas-nvme.service 0644 < "$EXTAS_REPO_DIR/infra/server/files/extas-nvme.service")"
  [ -n "$changed" ] && systemctl daemon-reload
  systemctl enable extas-nvme.service >/dev/null 2>&1
  systemctl restart extas-nvme.service || { report FAIL "PR 601 · NVMe" "boot unit failed: $(journalctl -u extas-nvme -n 3 --no-pager | tail -1)"; return 1; }
  local st dev free
  st="$(jq -r .status /run/extas/nvme.json)"; dev="$(jq -r .device /run/extas/nvme.json)"; free="$(jq -r .free_gb /run/extas/nvme.json)"
  if [ "$st" = "missing" ]; then
    report WARN "PR 601 · NVMe" "no temporary NVMe found; folders made on the OS disk, alert armed"
  else
    report OK "PR 601 · NVMe" "$dev $st at $EXTAS_NVME_MOUNT, $free GB free; unit runs at every boot before Docker"
  fi
}
