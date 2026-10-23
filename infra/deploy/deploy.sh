#!/usr/bin/env bash
# PR 4 / PR 17 — zero-downtime app deploy with automatic rollback (A2.9, START-HERE step 2).
# Runs on the VM through .github/workflows/deploy.yml (self-hosted runner extas-vm, CN-003).
#   sudo infra/deploy/deploy.sh <image> <migrate-image>
#                                           migrate the database with <migrate-image>, then start <image> in the idle
#                                           colour, smoke-test it, switch Caddy, stop the old
#   sudo infra/deploy/deploy.sh rollback    bring the previous image back the same way (the database stays as it is)
#   sudo infra/deploy/deploy.sh public-health
#                                           one JSON line: does https://<staging host>/api/health answer through Cloudflare
#                                           (with the preview login, read on the server and never printed)?
# Database first (PR 13, 496): before the new colour starts, the migrate image runs `prisma migrate deploy` straight to
# PostgreSQL and then the settings sync, on the extas network. If either fails, nothing else happens: the live colour
# keeps the traffic. Migrations only add (expand first, contract in a later release), so the old colour keeps working
# on the migrated database while the new one starts, and a rollback needs no down-migration.
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
die() { log "FAIL: $*"; LAST_ERR="$*"; exit 1; }
MIGRATION="not reached"; RECORDED=0; LAST_ERR=""

record() { # record <result> <detail>  (the newest entry is last-deploy.json; history stays in state/deploys/)
  local f; f="$STATE/deploys/$(date +%Y%m%d-%H%M%S).json"
  # `migration` and `run` (the workflow run, EXTAS_DEPLOY_RUN_ID) feed the deploy report deploy.yml commits back.
  jq -n --arg result "$1" --arg detail "$2" --arg image "${IMAGE:-}" --arg sha "${GIT_SHA:-}" \
    --arg color "${NEW:-}" --arg previous "${PREV_IMAGE:-}" --arg migrate "${MIGRATE_IMAGE:-}" --arg at "$(date -Is)" \
    --arg migration "$MIGRATION" --arg run "${EXTAS_DEPLOY_RUN_ID:-}" \
    --arg worker "${WORKER_NOTE:-not reached}" \
    '{result:$result,detail:$detail,image:$image,sha:$sha,color:$color,previous:$previous,migrate:$migrate,at:$at,migration:$migration,run:$run,worker:$worker}' > "$f"
  cp "$f" "$STATE/last-deploy.json"
  [ "$1" = ok ] && cp "$f" "$STATE/last-good-deploy.json"
  RECORDED=1
  return 0
}

# A run that stops before it records its result (an image missing, a setup file missing) still leaves one, so the
# deploy report never shows an older run's result as this one's.
on_exit() {
  local rc=$?
  if [ "$rc" -ne 0 ] && [ "$RECORDED" = 0 ] && [ -d "$STATE/deploys" ]; then
    record fail "stopped before the switch: ${LAST_ERR:-see the run log}; live version unchanged" || true
  fi
  return "$rc"
}

public_health() { # one JSON line; the preview login reaches curl through a file descriptor, never argv or output
  local pw code body url="https://$EXTAS_STAGING_HOST/api/health" i
  pw="$(grep '^STAGING_PASSWORD=' "$SEC/staging.env" 2>/dev/null | cut -d= -f2- || true)"
  body="$(mktemp)"
  for i in 1 2 3 4 5 6; do
    code="$(curl -sS -m 15 -o "$body" -w '%{http_code}' -K <(printf 'user = "%s:%s"\n' "$EXTAS_STAGING_USER" "$pw") \
      -H 'cache-control: no-cache' "$url" 2>/dev/null || true)"
    [ "$code" = 200 ] && grep -q '"ok":true' "$body" && break
    [ "$i" = 6 ] || sleep 5
  done
  jq -cn --arg url "$url" --arg code "${code:-000}" --slurpfile b <(jq -c . "$body" 2>/dev/null || echo '{}') \
    '{url:$url,code:($code|tonumber? // 0),ok:(($b[0].ok // false)==true),commit:($b[0].commit // ""),color:($b[0].color // "")}'
  rm -f "$body"
}

app() { # app <color> <compose args...>  (the web app and the background worker of one colour)
  local color="$1"; shift
  EXTAS_COLOR="$color" APP_IMAGE="$IMAGE_FOR_COLOR" EXTAS_ROOT="$R" EXTAS_NVME_MOUNT="$EXTAS_NVME_MOUNT" \
    EXTAS_TIMEZONE="$EXTAS_TIMEZONE" WORKER_IMAGE="${WORKER_IMAGE:-$IMAGE_FOR_COLOR}" WORKER_REPLICAS="${WORKER_REPLICAS:-0}" \
    JOBS_REPLICA_MEM_MB="$JOBS_REPLICA_MEM_MB" JOBS_NODE_HEAP_MB="$JOBS_NODE_HEAP_MB" \
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

migrate_db() { # migrate_db <image>: schema migrations, then the settings sync — never prints a secret
  local img="$1" envf rc=0
  # Only the two connection strings go into the one-shot container (not the session or vault keys), through a
  # root-only file in the secrets folder that is removed straight after.
  envf="$(mktemp "$SEC/.migrate.XXXXXX")"
  grep -E '^(DATABASE_URL|DATABASE_DIRECT_URL)=' "$SEC/app.env" > "$envf" || true
  if ! grep -q '^DATABASE_DIRECT_URL=' "$envf"; then
    rm -f "$envf"; log "DATABASE_DIRECT_URL is not in app.env — run server-setup (stack) first"; return 1
  fi
  docker run --rm --name "extas-migrate-$$" --network extas --env-file "$envf" "$img" || rc=$?
  rm -f "$envf"
  return "$rc"
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
if [ "${1:-}" = public-health ]; then public_health; exit 0; fi
trap on_exit EXIT

# ---- what to deploy -------------------------------------------------------------------------------------------
CUR="$(cat "$STATE/app.color" 2>/dev/null || echo none)"
PREV_IMAGE="$(jq -r '.image // empty' "$STATE/last-good-deploy.json" 2>/dev/null || true)"
if [ "${1:-}" = rollback ]; then
  IMAGE="$(jq -r '.previous // empty' "$STATE/last-good-deploy.json" 2>/dev/null || true)"
  [ -n "$IMAGE" ] || die "no previous image to roll back to"
  log "rollback to $IMAGE"
else
  IMAGE="${1:?usage: deploy.sh <image> <migrate-image> | rollback}"
  MIGRATE_IMAGE="${2:?usage: deploy.sh <image> <migrate-image> | rollback}"
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
# The docs folder app.yml mounts read-only (PR 594, CN-011); deploy.yml fills it with docs-sync.sh before this runs.
[ -d "$R/docs" ] || install -d -m 0755 "$R/docs"

# ---- the background worker (PR 6, CN-022) ------------------------------------------------------------------------
# It runs in each colour next to the web app, from the same commit's migrate image (extas-migrate:<tag>, which holds
# the workspace sources), so it starts, is health-checked and rolls back together with the app. A version from before
# the worker (a rollback) or a server whose queue store is not set up yet runs without it (0 copies), and the record
# says so; the Server page then shows the heartbeat as stale.
profile_get() { sed -n "s/^$1=//p" "$R/config/profile.env" | tail -n 1; }
WORKER_IMAGE="${MIGRATE_IMAGE:-extas-migrate:${IMAGE##*:}}"
WORKER_REPLICAS=0
JOBS_REPLICAS="$(profile_get JOBS_REPLICAS)"; JOBS_REPLICAS="${JOBS_REPLICAS:-1}"
JOBS_REPLICA_MEM_MB="$(profile_get JOBS_REPLICA_MEM_MB)"
[ -n "$JOBS_REPLICA_MEM_MB" ] || JOBS_REPLICA_MEM_MB=$(( $(profile_get JOBS_MEM_MB) / JOBS_REPLICAS ))
JOBS_NODE_HEAP_MB="$(profile_get JOBS_NODE_HEAP_MB)"
# A profile.env from before PR 6 has no worker lines: the same split extas-profile makes, from server.conf.
[ -n "$JOBS_NODE_HEAP_MB" ] || JOBS_NODE_HEAP_MB=$(( JOBS_REPLICA_MEM_MB * PROFILE_APP_HEAP_PCT / 100 ))
if ! docker image inspect "$WORKER_IMAGE" >/dev/null 2>&1; then
  WORKER_NOTE="off: image $WORKER_IMAGE is not on this server"
elif ! docker run --rm --entrypoint test "$WORKER_IMAGE" -f /repo/packages/jobs/src/main.ts; then
  WORKER_NOTE="off: this version has no background worker"
elif ! grep -q '^REDIS_QUEUE_URL=' "$SEC/app-connections.env"; then
  WORKER_NOTE="off: REDIS_QUEUE_URL is not in app-connections.env (run server-setup stack)"
else
  WORKER_REPLICAS="$JOBS_REPLICAS"
  WORKER_NOTE="on: $WORKER_REPLICAS copy/copies from $WORKER_IMAGE"
fi
[ "$WORKER_REPLICAS" != 0 ] || WORKER_IMAGE="$IMAGE" # a service of 0 copies still needs an image name
log "worker: $WORKER_NOTE"

# ---- 0. the database: schema migrations, then the settings migration (PR 496) --------------------------------
if [ -n "${MIGRATE_IMAGE:-}" ]; then
  docker image inspect "$MIGRATE_IMAGE" >/dev/null 2>&1 || die "migrate image $MIGRATE_IMAGE is not on this server"
  log "migrating the database with $MIGRATE_IMAGE"
  if ! migrate_db "$MIGRATE_IMAGE"; then
    MIGRATION="failed"
    record fail "database migration failed; live version unchanged"
    die "database migration failed (live version unchanged)"
  fi
  MIGRATION="ok"
  log "database migrated and settings in sync"
else
  MIGRATION="skipped (rollback: the database stays as it is)"
  log "rollback: the database stays as it is (migrations only go forward)"
fi

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
docker images --format '{{.Repository}}:{{.Tag}} {{.CreatedAt}}' extas-migrate | sort -k2 -r | awk 'NR>3{print $1}' \
  | xargs -r docker rmi >/dev/null 2>&1 || true
log "done: $IMAGE on $NEW"
