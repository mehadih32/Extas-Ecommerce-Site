#!/usr/bin/env bash
# PR 4 follow-up (31 Oct) — keep the OS disk / from filling. / reached 97% and the deploy's build killed the runner
# twice: every deploy builds two images and nothing pruned the build cache or the untagged layers.
#   sudo infra/deploy/disk-tidy.sh --guard [<json>]   deploy.yml, before the build: tidy, then fail (exit 1) when / still
#                                                     has less free space than DISK_ROOT_MIN_FREE_GB, so a build never
#                                                     starts on a full disk; <json> gets the numbers for the report
#   sudo infra/deploy/disk-tidy.sh --tidy [<json>]    the same tidy, never fails (a rollback; server-setup)
# Sourced by deploy.sh (tidy_docker after every deploy) and steps/13-osdisk.sh. The tidy never removes a tagged image a
# deploy record names (the live version, the previous one, the rollback target, web and worker: images.sh); it keeps
# the newest DEPLOY_KEEP_WEB_IMAGES / DEPLOY_KEEP_MIGRATE_IMAGES, removes untagged (dangling) images only, and cuts the
# build cache down to DOCKER_BUILD_CACHE_KEEP_GB. On the host: the runner's _diag logs older than RUNNER_DIAG_KEEP_DAYS,
# the apt package cache, and the journal above JOURNAL_MAX_USE_MB.
TIDY_HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=images.sh
. "$TIDY_HERE/images.sh"

# Whole GB free on a path (default /).
root_free_gb() { df -P -BG "${1:-/}" 2>/dev/null | awk 'NR==2{gsub(/G/,"",$4); print $4+0}'; }

# tidy_docker <state dir> — old tagged extas images (never a needed one), untagged images, build cache above the limit.
# The fallbacks are the numbers deploy.sh used before these settings, for a server whose installed server.conf is older.
tidy_docker() {
  local state="$1" needed
  local keep_web="${DEPLOY_KEEP_WEB_IMAGES:-5}" keep_mig="${DEPLOY_KEEP_MIGRATE_IMAGES:-3}" cache="${DOCKER_BUILD_CACHE_KEEP_GB:-40}"
  command -v docker >/dev/null 2>&1 || return 0
  needed="$(mktemp)"
  needed_images "$state/last-good-deploy.json" "$state/last-deploy.json" > "$needed"
  docker images --format '{{.Repository}}:{{.Tag}} {{.CreatedAt}}' extas-web | images_to_remove "$keep_web" "$needed" \
    | xargs -r docker rmi >/dev/null 2>&1 || true
  docker images --format '{{.Repository}}:{{.Tag}} {{.CreatedAt}}' extas-migrate | images_to_remove "$keep_mig" "$needed" \
    | xargs -r docker rmi >/dev/null 2>&1 || true
  rm -f "$needed"
  # Untagged images only (no -a): a tagged image — live, previous, rollback — is never touched here.
  docker image prune -f >/dev/null 2>&1 || true
  # Docker 28+ names the limit --max-used-space; older ones --keep-storage. Oldest unused cache goes first.
  if docker builder prune --help 2>/dev/null | grep -q -- '--max-used-space'; then
    docker builder prune -af --max-used-space "${cache}gb" >/dev/null 2>&1 || true
  else
    docker builder prune -af --keep-storage "${cache}gb" >/dev/null 2>&1 || true
  fi
  return 0
}

# tidy_host — the runner's old logs, the apt cache, the journal above its cap. Never anything of the shop.
tidy_host() {
  local diag="${RUNNER_DIR:-}/_diag"
  if [ -n "${RUNNER_DIR:-}" ] && [ -d "$diag" ]; then
    find "$diag" -type f -mtime +"${RUNNER_DIAG_KEEP_DAYS:-7}" -delete 2>/dev/null || true
  fi
  apt-get clean >/dev/null 2>&1 || true
  journalctl --vacuum-size="${JOURNAL_MAX_USE_MB:-1024}M" >/dev/null 2>&1 || true
  return 0
}

tidy_main() {
  local mode="${1:-}" out="${2:-}" conf before after min ok=true store free low=""
  case "$mode" in --guard|--tidy) ;; *) echo "usage: disk-tidy.sh --guard|--tidy [<json>]" >&2; return 2 ;; esac
  conf="${EXTAS_CONFIG_FILE:-/etc/extas/server.conf}"
  # shellcheck source=../config/server.conf
  . "$conf"
  min="${DISK_ROOT_MIN_FREE_GB:-15}"
  before="$(root_free_gb /)"
  tidy_docker "$EXTAS_ROOT/state"
  tidy_host
  after="$(root_free_gb /)"
  [ "$mode" = --guard ] && [ "${after:-0}" -lt "$min" ] && ok=false
  # R1 ops review (minor 1): the build lands in containerd's store, on its own volume since the PR 4 follow-up, and
  # Docker's own folder is another; checking / alone let a full store fail the build half way. Each one that is its
  # own mount needs DISK_STORE_MIN_FREE_GB free.
  for store in "${CONTAINERD_ROOT:-/var/lib/containerd}" /var/lib/docker; do
    mountpoint -q "$store" 2>/dev/null || continue
    free="$(root_free_gb "$store")"
    if [ -n "$free" ] && [ "$free" -lt "${DISK_STORE_MIN_FREE_GB:-20}" ]; then
      low="${low:+$low, }$store ($free GB)"
      [ "$mode" = --guard ] && ok=false
    fi
  done
  if [ -n "$out" ]; then
    mkdir -p "$(dirname "$out")"
    jq -n --argjson ok "$ok" --arg mode "${mode#--}" --argjson before "${before:-0}" --argjson free "${after:-0}" \
      --argjson min "$min" --arg low "$low" '{ok:$ok,mode:$mode,free_gb_before:$before,free_gb:$free,min_free_gb:$min}
        + (if $low == "" then {} else {stores_low:$low} end)' > "$out"
  fi
  echo "main disk /: ${after:-?} GB free after the clean-up (was ${before:-?} GB; a build needs at least $min GB)"
  if [ "$ok" = false ] && [ -n "$low" ]; then
    echo "::error::The image store has too little free space: $low; at least ${DISK_STORE_MIN_FREE_GB:-20} GB is needed (DISK_STORE_MIN_FREE_GB in infra/config/server.conf). A build now would fail half way, so this deploy stops here; the live site is untouched."
    return 1
  fi
  if [ "$ok" = false ]; then
    echo "::error::The server's main disk (/) has only ${after:-0} GB free, at least $min GB is needed (DISK_ROOT_MIN_FREE_GB in infra/config/server.conf). A build now would fill it and stop the runner, so this deploy stops here; the live site is untouched. Run server-setup: it moves Docker's store to the data disk and lists what fills / in docs/reports/server/latest.md."
    return 1
  fi
  return 0
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  set -uo pipefail
  tidy_main "$@"
  exit $?
fi
