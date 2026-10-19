# shellcheck shell=bash
# PR 604 — compute the RAM/CPU profile for this machine into the stack's env file.
step_profile() {
  local out="$EXTAS_ROOT/config/profile.env"
  "$EXTAS_REPO_DIR/infra/server/bin/extas-profile" > "$out.new"
  mv "$out.new" "$out"; chmod 644 "$out"
  install -m 0755 "$EXTAS_REPO_DIR/infra/server/bin/extas-profile" /usr/local/sbin/extas-profile
  # shellcheck disable=SC1090
  . "$out"
  {
    echo
    echo "## Auto profile (PR 604)"
    echo
    echo "Detected $PROFILE_DETECTED_CPU vCPU / $PROFILE_DETECTED_RAM_GB GB (reference box: $PROFILE_IS_REFERENCE)."
    echo
    echo "| Service | RAM limit | CPU |"
    echo "|---|---|---|"
    echo "| PostgreSQL | $((PG_MEM_MB/1024)) GB (shared_buffers), container cap $((PG_LIMIT_MB/1024)) GB | $PG_CPUS |"
    echo "| Redis (cache + queue) | $REDIS_CACHE_MEM_MB + $REDIS_QUEUE_MEM_MB MB | $REDIS_CPUS |"
    echo "| Meilisearch | $MEILI_MEM_MB MB | $MEILI_CPUS |"
    echo "| App | $APP_REPLICAS × $APP_REPLICA_MEM_MB MB | $APP_REPLICAS × $APP_REPLICA_CPUS |"
    echo "| Image/video worker | $WORKER_MEM_MB MB | $WORKER_CPUS |"
    echo "| Background jobs | $JOBS_MEM_MB MB | $JOBS_CPUS |"
    echo "| Caddy | $CADDY_MEM_MB MB | $CADDY_CPUS |"
    echo "| OS reserve | $OS_RESERVE_MB MB | — |"
  } >> "$REPORT_FILE.profile"
  report OK "PR 604 · auto profile" "$PROFILE_DETECTED_CPU vCPU / $PROFILE_DETECTED_RAM_GB GB → $APP_REPLICAS app replicas, PG $((PG_MEM_MB/1024)) GB"
}
