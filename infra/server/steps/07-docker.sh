# shellcheck shell=bash
# PR 4 — Docker Engine + Compose from Docker's own repository; log rotation; live-restore so a Docker upgrade does
# not stop the shop; boot order after the NVMe unit and the data-disk mounts (containerd's store too, 31 Oct); the
# build cache capped by BuildKit's own garbage collection (31 Oct).
docker_daemon_conf() { # docker_daemon_conf [<extra json members>] — /etc/docker/daemon.json
  cat <<CONF
{
  "log-driver": "local",
  "log-opts": { "max-size": "20m", "max-file": "5" },
  "live-restore": true,
  "default-ulimits": { "nofile": { "Name": "nofile", "Soft": 65536, "Hard": 1048576 } },
  "features": { "buildkit": true }${1:-}
}
CONF
}

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
  local c1 c2 c3 conf gcnote="build cache ≤ ${DOCKER_BUILD_CACHE_KEEP_GB} GB"
  # PR 4 follow-up (31 Oct): BuildKit keeps its build cache under DOCKER_BUILD_CACHE_KEEP_GB by itself (the clean-up
  # after each deploy does the same at once, infra/deploy/disk-tidy.sh). dockerd checks the file first: an option this
  # Docker does not know would stop it from starting, so the file is then written without the limit.
  # Docker 28+ names the ceiling defaultMaxUsedSpace; older ones only know defaultKeepStorage.
  local key ok=no
  conf="$(mktemp)"
  for key in defaultMaxUsedSpace defaultKeepStorage; do
    docker_daemon_conf ",
  \"builder\": { \"gc\": { \"enabled\": true, \"$key\": \"${DOCKER_BUILD_CACHE_KEEP_GB}GB\" } }" > "$conf"
    if ! command -v dockerd >/dev/null 2>&1 || dockerd --validate --config-file "$conf" >/dev/null 2>&1; then ok=yes; break; fi
  done
  if [ "$ok" = no ]; then
    docker_daemon_conf > "$conf"
    gcnote="build-cache limit not accepted by this Docker (the clean-up after each deploy still applies)"
  fi
  c1="$(write_file /etc/docker/daemon.json 0644 < "$conf")"
  rm -f "$conf"
  local r="$EXTAS_ROOT"
  c2="$(write_file /etc/systemd/system/docker.service.d/10-extas.conf 0644 <<CONF
# EXTAS (PR 4, 601, A2.9.14) — boot order: NVMe first, then the data disk, then Docker and everything in it.
[Unit]
Requires=extas-nvme.service
After=extas-nvme.service
RequiresMountsFor=$r $r/data/postgres $r/data/redis $r/data/search $r/data/media $r/backups $r/logs /var/lib/docker $CONTAINERD_ROOT
CONF
)"
  # containerd holds Docker 29's images and build cache. Once its store has its own volume (steps/13-osdisk.sh) it
  # must never start without it: it would quietly begin a new, empty store on /.
  c3="$(write_file /etc/systemd/system/containerd.service.d/10-extas.conf 0644 <<CONF
# EXTAS (PR 4 follow-up, 31 Oct) — containerd's store is on the data disk (LV $EXTAS_VG/containerd).
[Unit]
RequiresMountsFor=$CONTAINERD_ROOT
CONF
)"
  systemctl daemon-reload
  systemctl enable docker.service containerd.service >/dev/null 2>&1
  if [ -n "$c1$c2" ] && systemctl is-active -q docker; then systemctl restart docker; fi
  [ -z "$c3" ] || log "containerd: starts only with its store mounted"
  systemctl start docker
  id ghrunner >/dev/null 2>&1 && usermod -aG docker ghrunner
  docker network inspect extas >/dev/null 2>&1 || docker network create extas >/dev/null
  apply_cloudflare_only
  report OK "PR 4 · Docker" "$(docker --version | cut -d, -f1), compose $(docker compose version --short); logs rotated; $gcnote; starts after NVMe + data disk"
}
