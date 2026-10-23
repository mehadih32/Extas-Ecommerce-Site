#!/usr/bin/env bash
# PR 508 (PROGRESS follow-up 19) — the admin session end to end on this checkout's own build, against a fresh
# installation on a throwaway database:
#   1. a new database on the given PostgreSQL server (random name, dropped at the end);
#   2. the migrate image's own command (apps/web/Dockerfile, stage `migrate`: schema, settings, auth, gazetteer, mother
#      store, default pack), read from the Dockerfile and run from the workspace, so this is what every deploy runs;
#   3. a test-only admin (create-owner) with a first password generated at run time into a private temporary file;
#   4. the standalone server of `pnpm --filter @extas/web build`, with throwaway session and vault keys;
#   5. the browser journey (tools/admin-session-e2e.mjs): sign in, refresh, the sign-in page while signed in, log out.
#   E2E_DATABASE_ADMIN_URL=postgresql://<user>:<pw>@<host>:<port>/<db> tools/admin-session-e2e.sh
# The user must be allowed to CREATE DATABASE (CI: the web job's PostgreSQL service). Needs the web build, psql, and the
# `playwright` package on NODE_PATH. No password, key or connection string is printed or kept; nothing touches a real
# installation or the owner's data.
set -euo pipefail
ADMIN_URL="${E2E_DATABASE_ADMIN_URL:?set E2E_DATABASE_ADMIN_URL (a PostgreSQL server where this user may CREATE DATABASE)}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STANDALONE="$ROOT/apps/web/.next/standalone"
PORT="${E2E_PORT:-3200}"
EMAIL="e2e-admin@example.test"
WORK="$(mktemp -d)"
chmod 0700 "$WORK"
rand() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
DB="extas_e2e_$(rand | cut -c1-12)"
SERVER_PID=""

[ -f "$STANDALONE/apps/web/server.js" ] || { echo "e2e: no web build (run pnpm --filter @extas/web build first)"; exit 1; }

cleanup() {
  # Every part runs, whatever failed before (a killed server's `wait` answers 143, which errexit would stop on).
  set +e
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
  fi
  psql -q "$ADMIN_URL" -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" >/dev/null 2>&1 \
    || echo "e2e: could not drop the throwaway database $DB"
  rm -rf "$WORK"
}
trap cleanup EXIT

# The same server, the throwaway database (keeps user, password, host and port; swaps only the database name).
DB_URL="$(node -e 'const u = new URL(process.argv[1]); u.pathname = "/" + process.argv[2]; process.stdout.write(u.toString())' "$ADMIN_URL" "$DB")"
psql -q "$ADMIN_URL" -c "CREATE DATABASE \"$DB\"" >/dev/null
export DATABASE_URL="$DB_URL" DATABASE_DIRECT_URL="$DB_URL"
SESSION_SECRET="$(rand)$(rand)"
VAULT_MASTER_KEY="$(rand)$(rand)"
export SESSION_SECRET VAULT_MASTER_KEY PRISMA_HIDE_UPDATE_MESSAGE=1

echo "e2e: fresh installation (the migrate image's command, from the Dockerfile)"
MIGRATE_CMD="$(node -e '
  const lines = require("fs").readFileSync(process.argv[1], "utf8").split("\n");
  const from = lines.findIndex((l) => /^FROM\s+\S+\s+AS\s+migrate\b/i.test(l));
  const cmd = from >= 0 && lines.slice(from + 1).find((l) => /^(FROM|CMD)\s/.test(l));
  if (!cmd || !cmd.startsWith("CMD ")) { console.error("no CMD in the migrate stage"); process.exit(1); }
  const argv = JSON.parse(cmd.slice(4));
  process.stdout.write(argv[argv.length - 1].replaceAll("/repo/", process.argv[2] + "/"));
' "$ROOT/apps/web/Dockerfile" "$ROOT")"
NODE_ENV=production sh -c "$MIGRATE_CMD" > "$WORK/migrate.log" 2>&1 || { tail -n 30 "$WORK/migrate.log" | grep -viE 'password|secret|postgres(ql)?://'; exit 1; }
tail -n 3 "$WORK/migrate.log"

echo "e2e: the test-only admin, with a first password generated now"
(cd "$ROOT/packages/auth" && ./node_modules/.bin/tsx src/cli.ts create-owner --email "$EMAIL" --name "E2E admin" --generate-to "$WORK/first-password") \
  | sed -E 's/[0-9a-f-]{36}|\b[0-9a-z]{20,}\b/<id>/g'

echo "e2e: the web build (standalone server)"
# The standalone output has no static files or public folder of its own; CI's Lighthouse step copies them the same way.
mkdir -p "$STANDALONE/apps/web/.next"
cp -r "$ROOT/apps/web/.next/static" "$STANDALONE/apps/web/.next/"
[ -d "$ROOT/apps/web/public" ] && cp -r "$ROOT/apps/web/public" "$STANDALONE/apps/web/"
NODE_ENV=production PORT="$PORT" HOSTNAME=127.0.0.1 node "$STANDALONE/apps/web/server.js" > "$WORK/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 60); do curl -fs -o /dev/null "http://127.0.0.1:$PORT/api/health" && break; sleep 1; done
curl -fs -o /dev/null "http://127.0.0.1:$PORT/api/health" || { tail -n 40 "$WORK/server.log" | grep -viE 'password|secret|postgres(ql)?://'; exit 1; }

echo "e2e: the admin session journey"
rc=0
BASE="http://localhost:$PORT" E2E_EMAIL="$EMAIL" E2E_PASSWORD_FILE="$WORK/first-password" node "$ROOT/tools/admin-session-e2e.mjs" || rc=$?
if [ "$rc" -ne 0 ]; then
  echo "e2e: the app's log (last 60 lines)"
  tail -n 60 "$WORK/server.log" | grep -viE 'password|secret|postgres(ql)?://' || true
fi
exit "$rc"
