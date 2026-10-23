#!/usr/bin/env bash
# PR 4 (owner, 20 Oct) — "log in → the admin loads" on the production images, as a fresh installation gets them:
# an empty PostgreSQL, the migrate image's own command (schema, settings, auth, mother store, default pack — exactly
# what every deploy runs first), the first owner made the way owner-account.yml does it (create-owner with a generated
# first password), then the app image, and a real browser signs in (tools/smoke.mjs, E2E mode). Runs in CI after the
# images are built, so every deploy (deploy.yml waits for CI) has passed it.
#   tools/admin-login-e2e.sh <web-image> <migrate-image>
# Needs Docker and the `playwright` package on NODE_PATH. Throwaway passwords and keys only; nothing is printed.
set -euo pipefail
WEB="${1:?usage: admin-login-e2e.sh <web-image> <migrate-image>}"
MIGRATE="${2:?usage: admin-login-e2e.sh <web-image> <migrate-image>}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NET="extas-e2e-$$"
PORT="${E2E_PORT:-3100}"
WORK="$(mktemp -d)"
EMAIL="owner@example.test"

cleanup() {
  docker rm -f "$NET-app" "$NET-worker" "$NET-redis" "$NET-pg" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

rand() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
PG_PW="$(rand)"
URL="postgresql://extas:$PG_PW@$NET-pg:5432/extas"
{
  echo "DATABASE_URL=$URL"
  echo "DATABASE_DIRECT_URL=$URL"
  echo "SESSION_SECRET=$(rand)$(rand)"
  echo "VAULT_MASTER_KEY=$(rand)$(rand)"
} > "$WORK/app.env"

docker network create "$NET" >/dev/null
docker run -d --name "$NET-pg" --network "$NET" -e POSTGRES_USER=extas -e POSTGRES_PASSWORD="$PG_PW" -e POSTGRES_DB=extas \
  postgres:17 >/dev/null
for _ in $(seq 1 60); do docker exec "$NET-pg" pg_isready -U extas -d extas >/dev/null 2>&1 && break; sleep 1; done

echo "e2e: migrate image (what every deploy runs first)"
docker run --rm --network "$NET" --env-file "$WORK/app.env" "$MIGRATE" | tail -n 3

echo "e2e: the first owner, with a generated first password"
# The container's user writes the file (mode 0600 on the server); here the runner reads it, so it is opened up.
mkdir -p "$WORK/out" && chmod 0777 "$WORK/out"
docker run --rm --network "$NET" --env-file "$WORK/app.env" -v "$WORK/out:/out" "$MIGRATE" \
  sh -c "cd /repo/packages/auth && ./node_modules/.bin/tsx src/cli.ts create-owner --email $EMAIL --name 'E2E owner' --generate-to /out/first-password && chmod 0644 /out/first-password" \
  | sed -E 's/[0-9a-f-]{36}/<id>/'

echo "e2e: the background worker (PR 6: the migrate image, as infra/stack/app.yml runs it) and its queue store"
docker run -d --name "$NET-redis" --network "$NET" redis:7.4-alpine redis-server --maxmemory-policy noeviction >/dev/null
echo "REDIS_QUEUE_URL=redis://$NET-redis:6379/0" >> "$WORK/app.env"
docker run -d --name "$NET-worker" --network "$NET" --env-file "$WORK/app.env" -e EXTAS_WORKER_HEALTH_FILE=/tmp/worker-health.json \
  -u node -w /repo/packages/jobs "$MIGRATE" ./node_modules/.bin/tsx src/main.ts >/dev/null
# The same check as the container's health check in app.yml: a heartbeat file newer than its stale limit.
for _ in $(seq 1 60); do
  docker exec "$NET-worker" node -e "const h=JSON.parse(require('fs').readFileSync('/tmp/worker-health.json','utf8'));process.exit(Date.now()-h.at<h.staleMs?0:1)" \
    >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$NET-worker" test -f /tmp/worker-health.json || { echo "e2e: the worker never beat"; docker logs --tail 50 "$NET-worker" 2>&1 | grep -viE 'password|secret|postgresql://'; exit 1; }

echo "e2e: the app image"
docker run -d --name "$NET-app" --network "$NET" --env-file "$WORK/app.env" -p "127.0.0.1:$PORT:3000" "$WEB" >/dev/null
for _ in $(seq 1 90); do curl -fs -o /dev/null "http://localhost:$PORT/api/health" && break; sleep 1; done
curl -fs -o /dev/null "http://localhost:$PORT/api/health" || { docker logs --tail 50 "$NET-app"; exit 1; }

rc=0
BASE="http://localhost:$PORT" E2E_EMAIL="$EMAIL" E2E_PASSWORD_FILE="$WORK/out/first-password" node "$HERE/smoke.mjs" || rc=$?
if [ "$rc" -ne 0 ]; then
  echo "e2e: the app's log (last 60 lines)"
  docker logs --tail 60 "$NET-app" 2>&1 | grep -viE 'password|secret|postgresql://' || true
fi
exit "$rc"
