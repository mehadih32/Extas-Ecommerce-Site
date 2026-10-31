#!/usr/bin/env bash
# PR 4 / PR 17 — zero-downtime app deploy with automatic rollback (A2.9, START-HERE step 2).
# Runs on the VM through .github/workflows/deploy.yml (self-hosted runner extas-vm, CN-003).
#   sudo infra/deploy/deploy.sh <image> <migrate-image>
#                                           migrate the database with <migrate-image>, then start <image> in the idle
#                                           colour, smoke-test it, switch Caddy, stop the old
#   sudo infra/deploy/deploy.sh rollback    bring the previous image back the same way, with that version's own
#                                           worker image (images.sh; the database stays as it is)
#   sudo infra/deploy/deploy.sh public-health
#                                           one JSON line: does https://<staging host>/api/health answer through Cloudflare
#                                           (with the preview login, read on the server and never printed)?
# Database first (PR 13, 496): before the new colour starts, the migrate image runs `prisma migrate deploy` straight to
# PostgreSQL and then the settings sync, on the extas network. If either fails, nothing else happens: the live colour
# keeps the traffic. Then (PR 621) the ERP acceptance run against the demo ERP, when deploy.yml asks for it. Migrations only add (expand first, contract in a later release), so the old colour keeps working
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
MIGRATION="not reached"; RECORDED=0; LAST_ERR=""; ROLE_SWITCHED=0

record() { # record <result> <detail>  (the newest entry is last-deploy.json; history stays in state/deploys/)
  local f; f="$STATE/deploys/$(date +%Y%m%d-%H%M%S).json"
  # `migration` and `run` (the workflow run, EXTAS_DEPLOY_RUN_ID) feed the deploy report deploy.yml commits back.
  # `worker_image` is the image the worker of this version runs (empty when it runs none), `previous_worker` the
  # rollback target's (follow-up 82, images.sh): a rollback starts that version's worker too.
  jq -n --arg result "$1" --arg detail "$2" --arg image "${IMAGE:-}" --arg sha "${GIT_SHA:-}" \
    --arg color "${NEW:-}" --arg previous "${PREV_IMAGE:-}" --arg migrate "${MIGRATE_IMAGE:-}" --arg at "$(date -Is)" \
    --arg migration "$MIGRATION" --arg run "${EXTAS_DEPLOY_RUN_ID:-}" \
    --arg worker "${WORKER_NOTE:-not reached}" --arg worker_image "${WORKER_ON_IMAGE:-}" \
    --arg previous_worker "${PREV_WORKER_IMAGE:-}" --arg kind "${DEPLOY_KIND:-deploy}" \
    '{result:$result,detail:$detail,image:$image,sha:$sha,color:$color,previous:$previous,migrate:$migrate,at:$at,migration:$migration,run:$run,worker:$worker,worker_image:$worker_image,previous_worker:$previous_worker,kind:$kind}' > "$f"
  cp "$f" "$STATE/last-deploy.json"
  [ "$1" = ok ] && cp "$f" "$STATE/last-good-deploy.json"
  RECORDED=1
  return 0
}

# A run that stops before it records its result (an image missing, a setup file missing) still leaves one, so the
# deploy report never shows an older run's result as this one's.
on_exit() {
  local rc=$?
  # PR 139: a run that moved the app to its own database role and then failed puts the connection strings back, so
  # the old colour and a rollback start exactly as before; the next deploy tries the switch again.
  if [ "$rc" -ne 0 ] && [ "$ROLE_SWITCHED" = 1 ]; then
    mv -f "$SEC/.app.env.before-role" "$SEC/app.env" 2>/dev/null || true
    mv -f "$SEC/.app-connections.env.before-role" "$SEC/app-connections.env" 2>/dev/null || true
    log "the app's database role is back to what it was before this run"
  fi
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

# shellcheck source=caddy-live.sh
. "$HERE/caddy-live.sh"

# upstream_for <colour> [client-ip] — the Caddy upstream block for one colour: every replica, found through Docker DNS.
# PR 620 · p3 review round 3: with `client-ip` (only when Caddy's live configuration has trusted_proxies,
# `caddy_trusts_proxies`) the app's client address is Caddy's own answer (Cloudflare's header only from its ranges,
# infra/stack/caddy/client-ip-block.sh), never a header the caller wrote. Without it the block is exactly as before:
# overwriting the header with {client_ip} then would give every visitor a Cloudflare server's address.
upstream_for() {
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
CONF
  if [ "${2:-}" = client-ip ]; then
    printf '\t# Caddy runs with trusted_proxies (checked live): the client address is its own answer.\n'
    printf '\theader_up CF-Connecting-IP {client_ip}\n'
  fi
  printf '}\n'
}

migrate_db() { # migrate_db <image>: schema migrations, then the settings sync — never prints a secret
  local img="$1" envf rc=0
  # Only the two connection strings go into the one-shot container (not the session or vault keys), through a
  # root-only file in the secrets folder that is removed straight after.
  # Both point at the owner role (PR 139): the migrations, the settings and auth sync, the place import and the seed
  # are the owner's work; the app itself runs as extas_app (app-role.sh), which may not change history.
  envf="$(mktemp "$SEC/.migrate.XXXXXX")"
  grep -E '^DATABASE_DIRECT_URL=' "$SEC/app.env" > "$envf" || true
  sed -n 's/^DATABASE_DIRECT_URL=/DATABASE_URL=/p' "$SEC/app.env" >> "$envf" || true
  if ! grep -q '^DATABASE_DIRECT_URL=' "$envf"; then
    rm -f "$envf"; log "DATABASE_DIRECT_URL is not in app.env — run server-setup (stack) first"; return 1
  fi
  docker run --rm --name "extas-migrate-$$" --network extas --env-file "$envf" "$img" || rc=$?
  rm -f "$envf"
  return "$rc"
}

caddy_reload() { docker exec extas-caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null; }

# PR 602: after a deploy the new version clears every cache layer once (its own pages, the other copies through Redis,
# Cloudflare when connected). Inside the Docker network only — Caddy answers /api/internal/* from outside with 404.
# Best effort: a missing token (server-setup stack not run since PR 602) or a failed call never fails the deploy.
cache_hook() { # cache_hook <color>
  local token
  token="$(sed -n 's/^CACHE_HOOK_TOKEN=//p' "$SEC/app.env" 2>/dev/null | tail -n 1)"
  if [ -z "$token" ]; then log "cache: no CACHE_HOOK_TOKEN in app.env (run server-setup stack) — not cleared"; return 0; fi
  if docker exec extas-caddy wget -qO- --post-data='' --header "x-extas-cache-hook: $token" \
    "http://app-$1:$APP_PORT/api/internal/cache/deployed" 2>/dev/null | grep -q '"ok":true'; then
    log "cache: cleared after the deploy"
  else
    log "cache: the clear-after-deploy call did not answer ok (pages renew by their own times)"
  fi
  return 0
}

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

# CI prints the upstream block to validate it with Caddy: deploy.sh upstream <color> [client-ip]
if [ "${1:-}" = upstream ]; then upstream_for "${2:?colour}" "${3:-}"; exit 0; fi
if [ "${1:-}" = public-health ]; then public_health; exit 0; fi
trap on_exit EXIT
# shellcheck source=images.sh
. "$HERE/images.sh"

# ---- what to deploy -------------------------------------------------------------------------------------------
CUR="$(cat "$STATE/app.color" 2>/dev/null || echo none)"
PREV_IMAGE="$(jq -r '.image // empty' "$STATE/last-good-deploy.json" 2>/dev/null || true)"
PREV_WORKER_IMAGE=""
[ -z "$PREV_IMAGE" ] || PREV_WORKER_IMAGE="$(worker_image_of "$PREV_IMAGE" \
  "$(jq -r '.worker_image // empty' "$STATE/last-good-deploy.json" 2>/dev/null || true)")"
ROLLBACK_WORKER=""
if [ "${1:-}" = rollback ]; then
  # R1 ops review (M3): a rollback's record names no rollback target of its own. Its `previous` used to be the version
  # it had just left — the broken one — so a second "Go back to the previous version" (after the smoke test's automatic
  # rollback, say) brought the broken version back. Now the second one is refused with the reason; a fix is deployed.
  DEPLOY_KIND=rollback
  if [ "$(jq -r '.kind // empty' "$STATE/last-good-deploy.json" 2>/dev/null || true)" = rollback ]; then
    die "the live version was itself put back by a rollback; the version before it is the one that failed, so there is nothing safe to go back to (deploy a fix instead)"
  fi
  read -r IMAGE ROLLBACK_WORKER < <(rollback_target "$STATE/last-good-deploy.json") || true
  [ -n "${IMAGE:-}" ] || die "no previous image to roll back to"
  PREV_IMAGE=""; PREV_WORKER_IMAGE=""
  log "rollback to $IMAGE (worker: $ROLLBACK_WORKER)"
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
# A rollback runs the worker image its record names (follow-up 82); the clean-up below never removes it.
WORKER_IMAGE="${MIGRATE_IMAGE:-${ROLLBACK_WORKER:-$(worker_image_of "$IMAGE")}}"
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
WORKER_ON_IMAGE=""; [ "$WORKER_REPLICAS" = 0 ] || WORKER_ON_IMAGE="$WORKER_IMAGE"
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
  # PR 139: the app connects as its own role, which may not change or remove history (app-role.sh). Never fails the
  # deploy: when something is missing the app keeps the role it has and the reason is logged.
  # shellcheck source=app-role.sh
  . "$HERE/app-role.sh"
  cp -p "$SEC/app.env" "$SEC/.app.env.before-role"
  cp -p "$SEC/app-connections.env" "$SEC/.app-connections.env.before-role"
  role="$(app_role_use "$SEC" "$R/config/pgbouncer/userlist.txt" 2>/dev/null)" || role="kept the owner role: check failed"
  [ "$role" = switched ] && ROLE_SWITCHED=1
  [ "$ROLE_SWITCHED" = 1 ] || rm -f "$SEC/.app.env.before-role" "$SEC/.app-connections.env.before-role"
  log "the app's database role: $role"
else
  MIGRATION="skipped (rollback: the database stays as it is)"
  log "rollback: the database stays as it is (migrations only go forward)"
fi

# ---- 0b. PR 621 (qa-gate B2): the ERP v6 acceptance run against the demo ERP -----------------------------------
# On the migrated database (so the new version reads the vault and the settings with its own schema), before the new
# colour starts. deploy.yml passes ERP_ACCEPTANCE_OUT (where the report goes). A failed check stops the release here:
# the live colour keeps the traffic (it works on the migrated database: migrations only add). Waiting for the demo key,
# a demo ERP that cannot be reached, a run that is not finished in time or could not read the database is reported
# and lets the release go (erp-acceptance.sh exits 0). A rollback runs no migration and no acceptance.
if [ -n "${MIGRATE_IMAGE:-}" ] && [ -n "${ERP_ACCEPTANCE_OUT:-}" ]; then
  log "ERP acceptance against the demo ERP (or waiting for its key)"
  if ! bash "$HERE/erp-acceptance.sh" "$ERP_ACCEPTANCE_OUT" "$MIGRATE_IMAGE"; then
    record fail "ERP acceptance: a check failed against the demo ERP; live version unchanged"
    die "ERP acceptance found a failed check (live version unchanged)"
  fi
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
# PR 620 · p3 review round 3: Caddy's own client address only when its running configuration trusts Cloudflare alone.
CLIENT_IP=""
if caddy_trusts_proxies; then CLIENT_IP=client-ip; else log "Caddy runs without trusted_proxies: the upstream keeps the caller's CF-Connecting-IP (run server-setup stack)"; fi
upstream_for "$NEW" "$CLIENT_IP" > "$SITES/upstream.caddy.new" && mv "$SITES/upstream.caddy.new" "$SITES/upstream.caddy"
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
cache_hook "$NEW"
record ok "$NEW live"
rm -f "$SEC/.app.env.before-role" "$SEC/.app-connections.env.before-role"
# Keep the newest images; older ones only take disk space. Never removed, however many failed builds came after
# them: the live version's and the rollback target's app and worker images (follow-up 82, images.sh). Then (PR 4
# follow-up, 31 Oct) the untagged layers and the build cache above DOCKER_BUILD_CACHE_KEEP_GB go too (disk-tidy.sh), so
# two builds per deploy never fill the disk again.
# shellcheck source=disk-tidy.sh
. "$HERE/disk-tidy.sh"
tidy_docker "$STATE" || true
log "done: $IMAGE on $NEW"
