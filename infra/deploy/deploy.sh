#!/usr/bin/env bash
# PR 4 / PR 17 — zero-downtime app deploy with automatic rollback (A2.9, START-HERE step 2).
# Runs on the VM through .github/workflows/deploy.yml (self-hosted runner extas-vm, CN-003).
#   sudo infra/deploy/deploy.sh <image>     start <image> in the idle colour, smoke-test it, switch Caddy, stop the old
#   sudo infra/deploy/deploy.sh rollback    bring the previous image back the same way
# Blue/green: the live colour (blue|green) is in $EXTAS_ROOT/state/app.color. The new colour starts next to the old
# one, must pass its health check and the smoke test, then Caddy switches its upstream with a graceful reload (open
# requests finish). If anything fails before or right after the switch, the old colour keeps or takes back the
# traffic and the run fails. Every run writes state/last-deploy.json for the status page and the admin Server page.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
CONF="${EXTAS_CONFIG_FILE:-/etc/extas/server.conf}"
# shellcheck source=../config/server.conf
. "$CONF"
R="$EXTAS_ROOT"; STATE="$R/state"; SEC="$R/config/secrets"; SITES="$R/config/caddy/sites"
APP_PORT="${APP_PORT:-3000}"

log() { echo "[deploy $(date +%H:%M:%S)] $*"; }
die() { log "FAIL: $*"; exit 1; }

record() { # record <result> <detail>  (the newest entry is last-deploy.json; history stays in state/deploys/)
  local f; f="$STATE/deploys/$(date +%Y%m%d-%H%M%S).json"
  jq -n --arg result "$1" --arg detail "$2" --arg image "${IMAGE:-}" --arg sha "${GIT_SHA:-}" \
    --arg color "${NEW:-}" --arg previous "${PREV_IMAGE:-}" --arg at "$(date -Is)" \
    '{result:$result,detail:$detail,image:$image,sha:$sha,color:$color,previous:$previous,at:$at}' > "$f"
  cp "$f" "$STATE/last-deploy.json"
  [ "$1" = ok ] && cp "$f" "$STATE/last-good-deploy.json"
  return 0
}

app() { # app <color> <compose args...>
  local color="$1"; shift
  EXTAS_COLOR="$color" APP_IMAGE="$IMAGE_FOR_COLOR" EXTAS_ROOT="$R" EXTAS_NVME_MOUNT="$EXTAS_NVME_MOUNT" \
    EXTAS_TIMEZONE="$EXTAS_TIMEZONE" \
    docker compose -p "extas-app-$color" -f "$REPO/infra/stack/app.yml" --env-file "$R/config/profile.env" "$@"
}

upstream_for() { # the Caddy upstream block for one colour: every replica, found through Docker DNS
  cat <<CONF
# live colour: $1 (written by infra/deploy/deploy.sh)
reverse_proxy {
	dynamic a {
		name app-$1
		port $APP_PORT
		refresh 5s
	}
	lb_policy least_conn
	lb_try_duration 5s
	fail_duration 10s
}
CONF
}

caddy_reload() { docker exec extas-caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null; }

smoke() { # smoke <color>: health + the status page, straight to the new replicas (before any traffic moves)
  local c="$1" i
  for i in $(seq 1 30); do
    if docker exec extas-caddy wget -qO- "http://app-$c:$APP_PORT/api/health" 2>/dev/null | grep -q '"ok":true'; then break; fi
    [ "$i" = 30 ] && return 1
    sleep 2
  done
  docker exec extas-caddy wget -qO /dev/null "http://app-$c:$APP_PORT/status" || return 1
}

verify_live() { # through Caddy's internal port: every answer must come from the new colour
  local c="$1" i body
  for i in $(seq 1 20); do
    body="$(curl -fsS -m 5 http://127.0.0.1:8080/api/health 2>/dev/null || true)"
    echo "$body" | grep -q "\"color\":\"$c\"" || return 1
    sleep 0.2
  done
}

# CI prints the upstream block to validate it with Caddy: deploy.sh upstream <color>
if [ "${1:-}" = upstream ]; then upstream_for "${2:?colour}"; exit 0; fi

# ---- what to deploy -------------------------------------------------------------------------------------------
CUR="$(cat "$STATE/app.color" 2>/dev/null || echo none)"
PREV_IMAGE="$(jq -r '.image // empty' "$STATE/last-good-deploy.json" 2>/dev/null || true)"
if [ "${1:-}" = rollback ]; then
  IMAGE="$(jq -r '.previous // empty' "$STATE/last-good-deploy.json" 2>/dev/null || true)"
  [ -n "$IMAGE" ] || die "no previous image to roll back to"
  log "rollback to $IMAGE"
else
  IMAGE="${1:?usage: deploy.sh <image> | rollback}"
fi
mkdir -p "$STATE/deploys"
docker image inspect "$IMAGE" >/dev/null 2>&1 || die "image $IMAGE is not on this server"
GIT_SHA="$(docker image inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$IMAGE" | sed -n 's/^GIT_SHA=//p')"
case "$CUR" in blue) NEW=green ;; *) NEW=blue ;; esac
IMAGE_FOR_COLOR="$IMAGE"
log "live: $CUR · new: $NEW · image: $IMAGE"

# Secrets the app reads; app-connections.env is filled from the vault later (PR 493), empty until then.
[ -f "$SEC/app.env" ] || die "app.env missing — run server-setup (stack) first"
grep -q '^APP_NODE_HEAP_MB=' "$R/config/profile.env" || die "profile.env is older than this app — run server-setup (profile) first"
[ -f "$SEC/app-connections.env" ] || install -m 0600 /dev/null "$SEC/app-connections.env"

# ---- 1. start the new colour next to the old one --------------------------------------------------------------
app "$NEW" down --remove-orphans >/dev/null 2>&1 || true
if ! app "$NEW" up -d --wait --wait-timeout 180; then
  app "$NEW" logs --tail 80 || true
  app "$NEW" down >/dev/null 2>&1 || true
  record fail "new version did not become healthy; live version unchanged"
  die "new containers not healthy (live version unchanged)"
fi
if ! smoke "$NEW"; then
  app "$NEW" logs --tail 80 || true
  app "$NEW" down >/dev/null 2>&1 || true
  record fail "smoke test failed; live version unchanged"
  die "smoke test failed (live version unchanged)"
fi
log "new colour $NEW healthy and smoke-tested"

# ---- 2. switch Caddy (graceful: open requests finish on the old colour) ---------------------------------------
cp "$SITES/upstream.caddy" "$SITES/upstream.caddy.before" 2>/dev/null || true
upstream_for "$NEW" > "$SITES/upstream.caddy.new" && mv "$SITES/upstream.caddy.new" "$SITES/upstream.caddy"
if ! caddy_reload || ! verify_live "$NEW"; then
  log "switch check failed — giving the traffic back to $CUR"
  mv "$SITES/upstream.caddy.before" "$SITES/upstream.caddy"; caddy_reload || true
  app "$NEW" down >/dev/null 2>&1 || true
  record fail "after the switch the new version did not answer; rolled back to $CUR"
  die "rolled back to $CUR"
fi
echo "$NEW" > "$STATE/app.color"
log "traffic is on $NEW"

# ---- 3. stop the old colour after open requests drain; keep its image for rollback ----------------------------
if [ "$CUR" = blue ] || [ "$CUR" = green ]; then
  sleep "${DEPLOY_DRAIN_SECONDS:-15}"
  IMAGE_FOR_COLOR="$IMAGE" app "$CUR" down >/dev/null 2>&1 || true
fi
record ok "$NEW live"
# Keep the newest images (current + rollback targets); older ones only take disk space.
docker images --format '{{.Repository}}:{{.Tag}} {{.CreatedAt}}' extas-web | sort -k2 -r | awk 'NR>5{print $1}' \
  | xargs -r docker rmi >/dev/null 2>&1 || true
log "done: $IMAGE on $NEW"
