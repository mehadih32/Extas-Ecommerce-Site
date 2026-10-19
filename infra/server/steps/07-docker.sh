# shellcheck shell=bash
# PR 4 — Docker Engine + Compose from Docker's own repository; log rotation; live-restore so a Docker upgrade does
# not stop the shop; boot order after the NVMe unit and the data-disk mounts.
step_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -q >/dev/null
  fi
  apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  local c1 c2
  c1="$(write_file /etc/docker/daemon.json 0644 <<'CONF'
{
  "log-driver": "local",
  "log-opts": { "max-size": "20m", "max-file": "5" },
  "live-restore": true,
  "default-ulimits": { "nofile": { "Name": "nofile", "Soft": 65536, "Hard": 1048576 } },
  "features": { "buildkit": true }
}
CONF
)"
  local r="$EXTAS_ROOT"
  c2="$(write_file /etc/systemd/system/docker.service.d/10-extas.conf 0644 <<CONF
# EXTAS (PR 4, 601, A2.9.14) — boot order: NVMe first, then the data disk, then Docker and everything in it.
[Unit]
Requires=extas-nvme.service
After=extas-nvme.service
RequiresMountsFor=$r $r/data/postgres $r/data/redis $r/data/search $r/data/media $r/backups $r/logs /var/lib/docker
CONF
)"
  systemctl daemon-reload
  systemctl enable docker.service containerd.service >/dev/null 2>&1
  if [ -n "$c1$c2" ] && systemctl is-active -q docker; then systemctl restart docker; fi
  systemctl start docker
  id ghrunner >/dev/null 2>&1 && usermod -aG docker ghrunner
  docker network inspect extas >/dev/null 2>&1 || docker network create extas >/dev/null
  apply_cloudflare_only
  report OK "PR 4 · Docker" "$(docker --version | cut -d, -f1), compose $(docker compose version --short); logs rotated; starts after NVMe + data disk"
}
