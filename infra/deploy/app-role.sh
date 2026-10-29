# shellcheck shell=bash
# PR 139 (CN-022) — the app's own database role, extas_app. Sourced by infra/deploy/deploy.sh (after the migrations)
# and infra/server/steps/09-stack.sh (server setup).
#
# Migration 0010_append_only makes the role (no login), gives it read and write on the shop's tables and takes UPDATE,
# DELETE and TRUNCATE away on the audit log and the other history tables. The server gives the role its login here,
# with a password generated on the server (postgres.env APP_DB_PASSWORD, never in Git, never printed), and then points
# the app's DATABASE_URL and REPORT_DATABASE_URL at it. Migrations, the deploy's settings sync and seed, backups and
# the owner scripts keep the owner role (DATABASE_DIRECT_URL).
#
# Nothing here can fail a deploy: when something is missing, the app keeps the role it has and the reason is printed.
# Order on a server: server setup writes the password and PgBouncer's login for both roles; the next deploy migrates
# (0010), gives the role its login and switches app.env; the new colour starts on it. A deploy that fails after the
# switch puts the old app.env back (deploy.sh on_exit), so the old colour and a rollback start exactly as before.

APP_DB_ROLE=extas_app

# The owner's psql inside the database container; the SQL comes on stdin (never on a command line, where ps sees it).
app_role_psql() { docker exec -i extas-postgres psql -qtAX -v ON_ERROR_STOP=1 -U extas -d extas; }

# True when migration 0010 is in: the role may insert audit rows, may not update them, and the trigger is there.
app_role_ready() {
  local r
  r="$(printf '%s\n' "SELECT has_table_privilege('$APP_DB_ROLE', 'public.\"AuditLog\"', 'INSERT')
    AND NOT has_table_privilege('$APP_DB_ROLE', 'public.\"AuditLog\"', 'UPDATE')
    AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'AuditLog_append_only' AND tgenabled = 'O');" \
    | app_role_psql 2>/dev/null || true)"
  [ "$r" = t ]
}

# The SQL behind app_role_guards (also run by the db package's tests, so the check itself is tested on PostgreSQL).
# PR 608 (migration 0049): the ERP event ledger has a guard of its own (its body is fixed, its processing state moves):
# both of its triggers on extas_erp_event_fixed must be on, and the app role may never DELETE or TRUNCATE it.
APP_ROLE_GUARDS_SQL="WITH g AS (
  SELECT c.oid, c.relname, bool_and(t.tgenabled = 'O') AS enabled, count(*) AS n
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE p.proname = 'extas_append_only' AND NOT t.tgisinternal
   GROUP BY c.oid, c.relname),
e AS (
  SELECT c.oid, count(t.oid) FILTER (WHERE p.proname = 'extas_erp_event_fixed' AND t.tgenabled = 'O' AND NOT t.tgisinternal) AS n
    FROM pg_class c LEFT JOIN pg_trigger t ON t.tgrelid = c.oid LEFT JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE c.relname = 'ErpEvent' AND c.relkind = 'r'
   GROUP BY c.oid)
SELECT CASE
  WHEN NOT EXISTS (SELECT 1 FROM g WHERE relname = 'AuditLog') THEN 'problem: AuditLog has no append-only guard'
  WHEN EXISTS (SELECT 1 FROM e WHERE n < 2 OR has_table_privilege('$APP_DB_ROLE', oid, 'DELETE')
       OR has_table_privilege('$APP_DB_ROLE', oid, 'TRUNCATE')) THEN 'problem: guard off or app role may change ErpEvent'
  ELSE COALESCE('problem: guard off or app role may change ' || (SELECT string_agg(relname, ', ' ORDER BY relname) FROM g
    WHERE NOT enabled OR n < 2 OR has_table_privilege('$APP_DB_ROLE', oid, 'UPDATE')
       OR has_table_privilege('$APP_DB_ROLE', oid, 'DELETE') OR has_table_privilege('$APP_DB_ROLE', oid, 'TRUNCATE')),
    'ok: ' || (SELECT count(*) FROM g) || ' tables append-only') END;"

# app_role_guards: the smoke test's database check (deploy and nightly). Prints "ok: N tables append-only" or
# "problem: …" naming the tables whose trigger is off or that the app role may change.
app_role_guards() {
  local r
  r="$(printf '%s\n' "$APP_ROLE_GUARDS_SQL" | app_role_psql 2>/dev/null || true)"
  case "$r" in ok:*|problem:*) echo "$r" ;; *) echo "problem: the append-only check could not read the database" ;; esac
}

# app_role_password <secrets dir>: the generated password (letters and digits only), or nothing.
app_role_password() {
  local pw
  pw="$(grep '^APP_DB_PASSWORD=' "$1/postgres.env" 2>/dev/null | head -1 | cut -d= -f2- || true)"
  [[ "$pw" =~ ^[A-Za-z0-9]{20,}$ ]] && printf '%s' "$pw"
  return 0
}

# app_role_login <secrets dir>: gives the role its login with the generated password (idempotent; also after a restore,
# since a dump carries no passwords). Statement logging is off for this one session, so the password never reaches
# the PostgreSQL log.
app_role_login() {
  local pw; pw="$(app_role_password "$1")"
  [ -n "$pw" ] || return 1
  printf "SET log_statement = 'none';\nSET log_min_duration_statement = -1;\nALTER ROLE %s LOGIN PASSWORD '%s';\n" \
    "$APP_DB_ROLE" "$pw" | app_role_psql >/dev/null 2>&1
}

# app_role_rewrite <file> <KEY> <password>: points KEY's postgresql:// URL at the app role; prints "changed" when it did.
app_role_rewrite() {
  local file="$1" key="$2" tmp
  [ -f "$file" ] || return 0
  tmp="$(mktemp "$(dirname "$file")/.role.XXXXXX")"
  APP_ROLE_PW="$3" APP_ROLE="$APP_DB_ROLE" awk -v k="$key" '
    BEGIN { pw = ENVIRON["APP_ROLE_PW"]; role = ENVIRON["APP_ROLE"] }
    index($0, k "=postgresql://") == 1 {
      rest = substr($0, length(k "=postgresql://") + 1)
      at = index(rest, "@")
      if (at > 0) { print k "=postgresql://" role ":" pw substr(rest, at); next }
    }
    { print }' "$file" > "$tmp"
  if cmp -s "$tmp" "$file"; then rm -f "$tmp"; return 0; fi
  chmod 600 "$tmp"; mv "$tmp" "$file"
  echo changed
}

# app_role_use <secrets dir> <PgBouncer userlist>: when everything is in place, gives the role its login and points the
# app at it. Prints one line: "switched", "in use", or "kept the owner role: <why>". Always returns 0.
app_role_use() {
  local sec="$1" userlist="$2" pw changed=""
  pw="$(app_role_password "$sec")"
  if [ -z "$pw" ]; then echo "kept the owner role: no APP_DB_PASSWORD yet (server setup makes it)"; return 0; fi
  if ! grep -q "^\"$APP_DB_ROLE\" " "$userlist" 2>/dev/null; then
    echo "kept the owner role: PgBouncer has no $APP_DB_ROLE login yet (server setup writes it)"; return 0
  fi
  if ! app_role_ready; then echo "kept the owner role: migration 0010_append_only is not in the database"; return 0; fi
  if ! app_role_login "$sec"; then echo "kept the owner role: could not give $APP_DB_ROLE its login"; return 0; fi
  changed="$(app_role_rewrite "$sec/app.env" DATABASE_URL "$pw")$(app_role_rewrite "$sec/app-connections.env" REPORT_DATABASE_URL "$pw")"
  if [ -n "$changed" ]; then echo switched; else echo "in use"; fi
  return 0
}
