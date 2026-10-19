# shellcheck shell=bash
# A2.5 item 4 (PR 3/5) — network and kernel tuning: backlog, file descriptors, swappiness,
# transparent huge pages off for PostgreSQL and Redis, ulimits.
step_kernel() {
  local changed
  changed="$(write_file /etc/sysctl.d/60-extas.conf 0644 <<'CONF'
# EXTAS — managed by infra/server/steps/06-kernel.sh
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 16384
net.ipv4.tcp_max_syn_backlog = 8192
net.ipv4.ip_local_port_range = 10240 65535
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_slow_start_after_idle = 0
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
fs.file-max = 2097152
fs.inotify.max_user_watches = 524288
vm.swappiness = 10
vm.overcommit_memory = 1
vm.dirty_background_ratio = 5
vm.dirty_ratio = 15
CONF
)"
  [ -n "$changed" ] && sysctl -q --system >/dev/null
  write_file /etc/systemd/system/extas-thp-off.service 0644 >/dev/null <<'CONF'
[Unit]
Description=EXTAS: transparent huge pages off (PostgreSQL, Redis)
DefaultDependencies=no
Before=docker.service
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/sh -c 'echo never > /sys/kernel/mm/transparent_hugepage/enabled; echo never > /sys/kernel/mm/transparent_hugepage/defrag'
[Install]
WantedBy=multi-user.target
CONF
  systemctl daemon-reload
  systemctl enable --now extas-thp-off.service >/dev/null 2>&1
  write_file /etc/security/limits.d/60-extas.conf 0644 >/dev/null <<'CONF'
*    soft nofile 65536
*    hard nofile 1048576
root soft nofile 65536
root hard nofile 1048576
CONF
  report OK "kernel tuning" "sysctl (backlog, fq+bbr, swappiness 10), THP off, nofile 65536"
}
