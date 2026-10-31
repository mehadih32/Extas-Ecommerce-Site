# shellcheck shell=bash
# PR 5, 6, 7 (+ Meilisearch, PR 72's engine) — the server stack: PostgreSQL tuned from the profile behind PgBouncer,
# Redis cache + queue, Meilisearch, Caddy with automatic HTTPS and the preview password. Secrets are generated here,
# on the server, and never leave it (A1.3, CLAUDE.md rule 2).
STACK_DIR_REPO="$EXTAS_REPO_DIR/infra/stack"
# shellcheck source=../../deploy/caddy-live.sh
. "$EXTAS_REPO_DIR/infra/deploy/caddy-live.sh"
# shellcheck source=../../deploy/pg-exec.sh
. "$EXTAS_REPO_DIR/infra/deploy/pg-exec.sh"

write_stack_env() {
  local s="$EXTAS_SECRETS_DIR"
  gen_secret "$s/postgres.env" POSTGRES_PASSWORD 40
  gen_secret "$s/postgres.env" APP_DB_PASSWORD 40   # the app's own role, extas_app (PR 139, infra/deploy/app-role.sh)
  gen_secret "$s/redis.env" REDIS_PASSWORD 40
  gen_secret "$s/meili.env" MEILI_MASTER_KEY 48
  gen_secret "$s/app.env" SESSION_SECRET 64
  gen_secret "$s/app.env" VAULT_MASTER_KEY 64      # encrypts the credential vault (PR 493); never in Git
  gen_secret "$s/app.env" CACHE_HOOK_TOKEN 48      # PR 602: the deploy's "clear the cache" call to the new app
  # Rotation (workflow input rotate_staging_password): drop the old preview password so a new one is generated.
  if [ "${ROTATE_STAGING:-no}" = yes ] && [ -f "$s/staging.env" ]; then sed -i '/^STAGING_PASSWORD=/d' "$s/staging.env"; fi
  gen_secret "$s/staging.env" STAGING_PASSWORD 20
  gen_secret "$s/staging.env" PREVIEW_COOKIE_SALT 32   # the preview gate's cookie token is made from it (PR 7)
  # shellcheck disable=SC1091
  . "$EXTAS_ROOT/config/profile.env"
  local pg_pw redis_pw meili
  pg_pw="$(secret_get "$s/postgres.env" POSTGRES_PASSWORD)"
  redis_pw="$(secret_get "$s/redis.env" REDIS_PASSWORD)"
  meili="$(secret_get "$s/meili.env" MEILI_MASTER_KEY)"
  write_file "$EXTAS_ROOT/config/stack.env" 0600 >/dev/null <<ENV
EXTAS_ROOT=$EXTAS_ROOT
EXTAS_NVME_MOUNT=$EXTAS_NVME_MOUNT
EXTAS_STAGING_HOST=$EXTAS_STAGING_HOST
EXTAS_EXTRA_HOSTS="$(site_extra_hosts "$EXTAS_STAGING_HOST" "${EXTAS_EXTRA_HOSTS:-}")"
IMG_POSTGRES=$IMG_POSTGRES
IMG_REDIS=$IMG_REDIS
IMG_MEILI=$IMG_MEILI
IMG_CADDY=$IMG_CADDY
REDIS_PASSWORD=$redis_pw
REDIS_CACHE_MAX_MB=$((REDIS_CACHE_MEM_MB * 80 / 100))
REDIS_QUEUE_MAX_MB=$((REDIS_QUEUE_MEM_MB * 80 / 100))
MEILI_MASTER_KEY=$meili
MEILI_INDEX_MEM_MB=$((MEILI_MEM_MB * 60 / 100))
ENV
  # The database for the app and the deploy's migrate step (PR 13, 491–496), in app.env: the app goes through
  # PgBouncer (transaction pool, `pgbouncer=true` turns off Prisma's prepared statements); `prisma migrate deploy` and
  # the settings sync go straight to PostgreSQL. Derived from the generated password, so rewritten when it changes.
  # PR 139: once a deploy has moved the app to its own role (extas_app, app-role.sh), the app's two URLs keep it; the
  # direct URL (migrations, owner scripts, backups) stays the owner role.
  local app_user=extas app_pw="$pg_pw"
  if grep -q '^DATABASE_URL=postgresql://extas_app:' "$s/app.env" 2>/dev/null; then
    app_user=extas_app; app_pw="$(secret_get "$s/postgres.env" APP_DB_PASSWORD)"
  fi
  env_set "$s/app.env" DATABASE_URL "postgresql://$app_user:$app_pw@extas-pgbouncer:6432/extas?pgbouncer=true"
  env_set "$s/app.env" DATABASE_DIRECT_URL "postgresql://extas:$pg_pw@extas-postgres:5432/extas"
  # Everything else the app containers read (deploy.yml). DATABASE_URL and the direct URL moved to app.env (above),
  # where the migrate step reads them too.
  local app_extra="$s/app-connections.env"
  write_file "$app_extra" 0600 >/dev/null <<ENV
REPORT_DATABASE_URL=postgresql://$app_user:$app_pw@extas-pgbouncer:6432/extas_report?pgbouncer=true
REDIS_CACHE_URL=redis://:$redis_pw@extas-redis-cache:6379/0
REDIS_QUEUE_URL=redis://:$redis_pw@extas-redis-queue:6379/0
MEILI_URL=http://extas-meilisearch:7700
MEILI_MASTER_KEY=$meili
EXTAS_NVME_DIR=/nvme
EXTAS_MEDIA_DIR=/media
ENV
  # Local media storage (PR 18 storage adapter, used when no Blob/S3 is connected): the app runs as the image's
  # `node` user (uid 1000), so the media volume must be writable by it.
  install -d -o 1000 -g 1000 -m 0750 "$EXTAS_ROOT/data/media"
}

write_postgres_conf() {
  # shellcheck disable=SC1091
  . "$EXTAS_ROOT/config/profile.env"
  local gather=2; [ "$PG_MAX_PARALLEL" -lt 2 ] && gather="$PG_MAX_PARALLEL"
  install -d -m 0755 "$EXTAS_ROOT/config/postgres"
  install -d -o 999 -g 999 -m 0700 "$EXTAS_ROOT/backups/wal" "$EXTAS_ROOT/logs/postgres"
  write_file "$EXTAS_ROOT/config/postgres/postgresql.conf" 0644 <<CONF
# EXTAS PostgreSQL (PR 5) — generated from the auto profile (PR 604) by 09-stack.sh. Do not edit by hand.
listen_addresses = '*'
max_connections = $PG_MAX_CONNECTIONS
password_encryption = scram-sha-256
shared_buffers = ${PG_SHARED_BUFFERS_MB}MB
effective_cache_size = ${PG_EFFECTIVE_CACHE_MB}MB
work_mem = ${PG_WORK_MEM_MB}MB
maintenance_work_mem = ${PG_MAINT_WORK_MEM_MB}MB
huge_pages = try
wal_buffers = 64MB
min_wal_size = 1GB
max_wal_size = 8GB
checkpoint_timeout = 15min
checkpoint_completion_target = 0.9
random_page_cost = 1.1
effective_io_concurrency = 200
max_worker_processes = 8
max_parallel_workers = $PG_MAX_PARALLEL
max_parallel_workers_per_gather = $gather
max_parallel_maintenance_workers = $gather
# Temp files on the local NVMe (PR 601); a missing tablespace is ignored, never fatal.
temp_tablespaces = 'nvme_temp'
# WAL archive → point-in-time restore to the minute (PR 8)
wal_level = replica
archive_mode = on
# gzip-compressed (31 Oct 2026: the plain 16 MB segments, one a minute, filled the backup disk); extas-restore reads
# both. With wal_recycle off every new segment is zero-filled, so a segment closed early by archive_timeout compresses
# to almost nothing. R1 ops review (M4): a segment already in the archive with the same content (a crash or reboot
# after the rename but before PostgreSQL noted it as done) counts as archived, as the PostgreSQL manual asks; one with
# DIFFERENT content still fails, and extas-monitor alerts while archiving fails (pg_stat_archiver).
archive_command = 'if test -f /wal-archive/%f.gz; then test "\$(gzip -dc /wal-archive/%f.gz | sha256sum)" = "\$(sha256sum < %p)"; else gzip -1 -c %p > /wal-archive/%f.gz.part && mv /wal-archive/%f.gz.part /wal-archive/%f.gz; fi'
wal_recycle = off
archive_timeout = $PG_ARCHIVE_TIMEOUT_S
# Slow query log (PR 603): anything over ${PG_SLOW_MS} ms
logging_collector = on
log_directory = '/var/log/postgresql'
log_filename = 'postgresql-%a.log'
log_truncate_on_rotation = on
log_rotation_age = 1d
log_min_duration_statement = $PG_SLOW_MS
log_checkpoints = on
log_lock_waits = on
log_temp_files = 10MB
log_autovacuum_min_duration = 1s
log_timezone = '$EXTAS_TIMEZONE'
timezone = 'UTC'
shared_preload_libraries = 'pg_stat_statements'
pg_stat_statements.track = all
autovacuum_max_workers = 4
autovacuum_vacuum_scale_factor = 0.05
autovacuum_analyze_scale_factor = 0.02
CONF
}

write_pgbouncer_conf() {
  # shellcheck disable=SC1091
  . "$EXTAS_ROOT/config/profile.env"
  local pw app_pw
  pw="$(secret_get "$EXTAS_SECRETS_DIR/postgres.env" POSTGRES_PASSWORD)"
  app_pw="$(secret_get "$EXTAS_SECRETS_DIR/postgres.env" APP_DB_PASSWORD)"
  install -d -m 0755 "$EXTAS_ROOT/config/pgbouncer"
  write_file "$EXTAS_ROOT/config/pgbouncer/pgbouncer.ini" 0644 <<CONF
; EXTAS PgBouncer (PR 5) — generated by 09-stack.sh
[databases]
extas = host=extas-postgres port=5432 dbname=extas
; low-priority report pool (PR 603): few connections, larger work_mem
extas_report = host=extas-postgres port=5432 dbname=extas pool_size=4 connect_query='SET work_mem = ''${PG_REPORT_WORK_MEM_MB}MB'''

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
default_pool_size = $PGBOUNCER_POOL
max_client_conn = 2000
max_prepared_statements = 200
server_reset_query =
ignore_startup_parameters = extra_float_digits,options
admin_users = extas
CONF
  # The owner and the app's own role (PR 139). A changed list prints "changed", so PgBouncer reloads it.
  printf '"extas" "%s"\n"extas_app" "%s"\n' "$pw" "$app_pw" | write_file "$EXTAS_ROOT/config/pgbouncer/userlist.txt" 0644
}

# PR 620 · p3 review round 2: the client address comes from Caddy alone. Cloudflare's ranges are fetched fresh (they
# change rarely) and checked; when they differ from infra/config/cloudflare-ips.txt the report asks for that file to be
# updated; when the fetch fails, the file is used as it is (client-ip-block.sh refuses anything that is not a range).
write_caddy_client_ip() {
  local d="$1" repo="$EXTAS_REPO_DIR/infra/config/cloudflare-ips.txt" tmp src
  tmp="$(mktemp -d)"
  src="$repo"
  if curl -fsS -m 10 https://www.cloudflare.com/ips-v4 > "$tmp/v4" && curl -fsS -m 10 https://www.cloudflare.com/ips-v6 > "$tmp/v6" \
    && cat "$tmp/v4" <(echo) "$tmp/v6" > "$tmp/all" && bash "$STACK_DIR_REPO/caddy/client-ip-block.sh" "$tmp/all" > /dev/null 2>&1; then
    src="$tmp/all"
    if ! diff -q <(grep -vE '^\s*(#|$)' "$repo" | sort) <(grep -vE '^\s*(#|$)' "$tmp/all" | sort) > /dev/null; then
      report WARN "PR 620 · client address" "Cloudflare's ranges changed: the fresh list is used; update infra/config/cloudflare-ips.txt"
    fi
  fi
  if bash "$STACK_DIR_REPO/caddy/client-ip-block.sh" "$src" > "$tmp/client-ip.caddy"; then
    write_file "$d/client-ip.caddy" 0644 < "$tmp/client-ip.caddy" >/dev/null
    # Round 3: written is not live. The OK comes only from Caddy's own running configuration (`caddy_apply`).
    report INFO "PR 620 · client address" "Cloudflare's ranges written for Caddy; checked live after the reload"
  else
    # Never left without the file Caddy imports: with no trusted range, every client address is the remote one.
    [ -f "$d/client-ip.caddy" ] || printf '# no trusted proxy: the client address is the remote address\n' | write_file "$d/client-ip.caddy" 0644 >/dev/null
    report FAIL "PR 620 · client address" "the Cloudflare range list is broken; client-ip.caddy kept as it was"
  fi
  rm -rf "$tmp"
}

# PR 620 · p3 review round 3: the Caddyfile the running Caddy reads is the repo's, a reload that fails is a FAIL, and
# the client-address block is checked in Caddy's live configuration (infra/deploy/caddy-live.sh). The single-file mount
# stays on the file's inode, so step_stack copies the Caddyfile in place; when the container still reads another file
# (a copy made before this fix), the caddy service is recreated, which loads the mounted file fresh.
caddy_apply() {
  local file="$EXTAS_ROOT/stack/caddy/Caddyfile" err="$EXTAS_ROOT/logs/caddy-reload.err"
  if ! caddyfile_live_matches "$file"; then
    if compose up -d --force-recreate --wait --wait-timeout 120 caddy >/dev/null 2>"$err" && caddyfile_live_matches "$file"; then
      report WARN "PR 7 · Caddy" "the running Caddy read an older Caddyfile (single-file mount); the caddy container was recreated"
    else
      report FAIL "PR 7 · Caddy" "the running Caddy does not read the repo's Caddyfile, even after recreating it: $(tail -2 "$err" 2>/dev/null | tr '\n' ' ')"
      return 1
    fi
  elif ! docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>"$err"; then
    report FAIL "PR 7 · Caddy" "reload failed, the old configuration keeps running: $(tail -2 "$err" | tr '\n' ' ')"
    return 1
  fi
  if caddy_trusts_proxies; then
    report OK "PR 620 · client address" "live: CF-Connecting-IP believed from Cloudflare's ranges only (trusted_proxies in Caddy's running configuration)"
  else
    report FAIL "PR 620 · client address" "Caddy's running configuration has no trusted_proxies; the deploy keeps the upstream without header_up"
    return 1
  fi
}

write_caddy_sites() {
  local d="$EXTAS_ROOT/config/caddy/sites" pw hash salt
  install -d -m 0755 "$d" "$EXTAS_ROOT/config/caddy/data" "$EXTAS_ROOT/config/caddy/config" "$EXTAS_ROOT/logs/caddy"
  if [ "$EXTAS_NOINDEX" = "yes" ]; then
    write_file "$d/noindex.caddy" 0644 >/dev/null <<'CONF'
header X-Robots-Tag "noindex, nofollow"
respond /robots.txt "User-agent: *
Disallow: /
" 200
CONF
  else
    : | write_file "$d/noindex.caddy" 0644 >/dev/null
  fi
  pw="$(secret_get "$EXTAS_SECRETS_DIR/staging.env" STAGING_PASSWORD)"
  salt="$(secret_get "$EXTAS_SECRETS_DIR/staging.env" PREVIEW_COOKIE_SALT)"
  # The preview login, then a cookie so the browser is not asked again (auth-block.sh). Re-written whenever the user,
  # the password or the cookie days changed (a short fingerprint is kept, never the password).
  local tag token days="${EXTAS_PREVIEW_COOKIE_DAYS:-30}"
  # v3 (follow-up 80): the ERP webhook POST passes without the login; v4 (PR 292) the WhatsApp webhook GET and POST
  # too; v5 (PR 620) the ERP's two signed GET calls; v6 (PR 426) the Messenger webhook GET and POST. A server with an
  # older gate re-writes it.
  tag="# preview gate v6 for $EXTAS_STAGING_USER $(printf '%s' "$pw" | sha256sum | cut -c1-12) days $days"
  if [ ! -s "$d/auth.caddy" ] || ! grep -qxF "$tag" "$d/auth.caddy"; then
    hash="$(docker run --rm --quiet "$IMG_CADDY" caddy hash-password --plaintext "$pw")"
    token="$(printf 'extas-preview-cookie:%s:%s' "$salt" "$pw" | sha256sum | cut -c1-64)"
    bash "$STACK_DIR_REPO/caddy/auth-block.sh" "$tag" "$EXTAS_STAGING_USER" "$hash" "$token" "$days" \
      | write_file "$d/auth.caddy" 0600 >/dev/null
  fi
  write_caddy_client_ip "$d"
  # PR 403: the extra host names get their own site block (sites/hosts.caddy, infra/stack/caddy/hosts-block.sh), locked
  # like the staging host until server.conf EXTAS_MAIN_OPEN="yes" — the owner's go-live day step (BLOCKED 25, runbook
  # step 4). The staging host keeps the preview password and noindex always. No extra hosts, no file.
  if [ -n "${EXTAS_EXTRA_HOSTS:-}" ]; then
    local open=no
    [ "${EXTAS_MAIN_OPEN:-no}" = yes ] && open=yes
    # shellcheck disable=SC2086  # the cleaned host names, one word each (site_extra_hosts)
    bash "$STACK_DIR_REPO/caddy/hosts-block.sh" "$open" $EXTAS_EXTRA_HOSTS | write_file "$d/hosts.caddy" 0644 >/dev/null
    if [ "$open" = yes ]; then
      report INFO "PR 403 · main domain" "open: $EXTAS_EXTRA_HOSTS without the preview password and noindex; $EXTAS_STAGING_HOST stays locked"
    else
      report INFO "PR 403 · main domain" "locked: $EXTAS_EXTRA_HOSTS behind the preview password and noindex, like $EXTAS_STAGING_HOST (EXTAS_MAIN_OPEN=no)"
    fi
  else
    rm -f "$d/hosts.caddy"
  fi
  # PR 397: tls.caddy — the Cloudflare Origin certificate when its checked pair is in the vault (extas-vault-sync
  # brings it and runs the same script again), else Caddy's automatic certificate. The Caddy reload follows below.
  install -m 0755 "$EXTAS_REPO_DIR/infra/server/bin/extas-origin-cert" /usr/local/sbin/extas-origin-cert
  if ! /usr/local/sbin/extas-origin-cert apply --no-reload >/dev/null 2>&1; then
    [ -f "$d/tls.caddy" ] || printf 'tls {\n\tissuer acme\n\tissuer internal\n}\n' | write_file "$d/tls.caddy" 0644 >/dev/null
    report WARN "PR 397 · origin certificate" "could not be checked; the automatic certificate serves"
  fi
  # The upstream belongs to deploy.yml once the app exists; until then the static page.
  if [ ! -f "$d/upstream.caddy" ]; then
    printf 'root * /srv/www\nfile_server\n' | write_file "$d/upstream.caddy" 0644 >/dev/null
  fi
  install -d -m 0755 "$EXTAS_ROOT/www"
  [ -f "$EXTAS_ROOT/www/index.html" ] || install -m 0644 "$STACK_DIR_REPO/www/index.html" "$EXTAS_ROOT/www/index.html"
}

compose() {
  docker compose -p extas --project-directory "$EXTAS_ROOT/stack" -f "$EXTAS_ROOT/stack/compose.yml" \
    --env-file "$EXTAS_ROOT/config/profile.env" --env-file "$EXTAS_ROOT/config/stack.env" "$@"
}

# PR 5 follow-up (31 Oct): the database's own tools must run inside its container before anything else uses them. When
# they do not (a container left on a store that moved under it), it restarts once, from the image as it is now, and the
# report says why; the data lives on its own volume, so a restart loses nothing.
ensure_pg_tools() {
  pg_exec psql -qtAX -U extas -d extas -c 'SELECT 1' </dev/null >/dev/null 2>&1 && return 0
  local why
  why="$(pg_exec_diag)"
  report WARN "PR 5 · PostgreSQL tools" "psql did not run in the container ($why); restarting it once"
  docker restart -t 60 "$PG_CONTAINER" >/dev/null 2>&1 || true
  compose up -d --wait --wait-timeout 300 >/dev/null 2>&1 || true
  pg_exec psql -qtAX -U extas -d extas -c 'SELECT 1' </dev/null >/dev/null 2>&1 && return 0
  report FAIL "PR 5 · PostgreSQL tools" "psql still does not run in the container after a restart: $(pg_exec_diag)"
  return 1
}

ensure_pg_temp_tablespace() {
  local sub
  pg_exec psql -qtAX -U extas -d extas -c \
    "SELECT 1 FROM pg_tablespace WHERE spcname='nvme_temp'" | grep -q 1 \
    || pg_exec psql -qX -U extas -d extas -c "CREATE TABLESPACE nvme_temp LOCATION '/nvme/pgtemp'" >/dev/null
  sub="$(find "$EXTAS_NVME_MOUNT/pgtemp" -mindepth 1 -maxdepth 1 -name 'PG_*' -printf '%f\n' | head -1)"
  if [ -n "$sub" ]; then
    echo "$sub" | write_file /etc/extas/pgtemp.subdir 0644 >/dev/null
  else
    # The disk was wiped under a running server and the version folder is gone: recreate the tablespace.
    pg_exec psql -qX -U extas -d extas -c "DROP TABLESPACE IF EXISTS nvme_temp" >/dev/null 2>&1 || true
    pg_exec psql -qX -U extas -d extas -c "CREATE TABLESPACE nvme_temp LOCATION '/nvme/pgtemp'" >/dev/null
    find "$EXTAS_NVME_MOUNT/pgtemp" -mindepth 1 -maxdepth 1 -name 'PG_*' -printf '%f\n' | head -1 | write_file /etc/extas/pgtemp.subdir 0644 >/dev/null
  fi
  pg_exec psql -qX -U extas -d extas -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements" >/dev/null
  pg_exec psql -qX -U extas -d extas -c "CREATE EXTENSION IF NOT EXISTS pg_trgm" >/dev/null
}

step_stack() {
  write_stack_env
  local pg_changed pgb_changed
  pg_changed="$(write_postgres_conf)"
  pgb_changed="$(write_pgbouncer_conf)"
  write_caddy_sites
  # Round 3: the Caddyfile is copied in place (its inode is what the container's single-file mount sees).
  rsync -a --delete --exclude www --exclude /caddy/Caddyfile "$STACK_DIR_REPO"/ "$EXTAS_ROOT/stack"/
  caddyfile_copy_inplace "$STACK_DIR_REPO/caddy/Caddyfile" "$EXTAS_ROOT/stack/caddy/Caddyfile" >/dev/null
  compose pull -q --ignore-buildable >/dev/null 2>&1 || compose pull -q >/dev/null 2>&1 || true
  if ! compose up -d ${STACK_BUILD_FLAG:---build} --wait --wait-timeout 300 >/dev/null 2>"$EXTAS_ROOT/logs/stack-up.err"; then
    report FAIL "PR 5–7 · stack" "compose up failed: $(tail -2 "$EXTAS_ROOT/logs/stack-up.err" | tr '\n' ' ')"
    return 1
  fi
  # Tuning changes: Postgres needs a restart for shared_buffers (rare; only when the profile changes),
  # PgBouncer and Caddy reload without dropping connections.
  if [ -n "$pg_changed" ] && [ -f "$EXTAS_STATE_DIR/stack.started" ]; then
    docker restart -t 60 extas-postgres >/dev/null
    compose up -d --wait --wait-timeout 300 >/dev/null 2>&1 || true
  fi
  [ -n "$pgb_changed" ] && docker kill -s HUP extas-pgbouncer >/dev/null 2>&1 || true
  local caddy_rc=0
  caddy_apply || caddy_rc=$?
  touch "$EXTAS_STATE_DIR/stack.started"
  ensure_pg_tools || return 1
  ensure_pg_temp_tablespace
  # PR 139: the app's own role keeps its login in step with the generated password (also after a restore: a dump
  # carries no passwords). The switch of the app's URLs happens in the deploy, right after the migrations.
  # shellcheck source=../../deploy/app-role.sh
  . "$EXTAS_REPO_DIR/infra/deploy/app-role.sh"
  if app_role_ready; then
    if app_role_login "$EXTAS_SECRETS_DIR"; then
      report OK "PR 139 · app database role" "extas_app may add to the audit log and the history tables, never change or remove them"
    else
      report WARN "PR 139 · app database role" "could not give extas_app its login; the app keeps the owner role"
    fi
  else
    report INFO "PR 139 · app database role" "waits for the next deploy (migration 0010_append_only)"
  fi
  local ver up
  ver="$(pg_exec psql -qtAX -U extas -d extas -c 'SHOW server_version')"
  up="$(compose ps --format '{{.Service}}:{{.Health}}' | tr '\n' ' ')"
  report OK "PR 5 · PostgreSQL" "v$ver, shared_buffers $(pg_exec psql -qtAX -U extas -c 'SHOW shared_buffers'), temp on NVMe, WAL archive on, slow log > ${PROFILE_PG_SLOW_MS} ms, PgBouncer (transaction pool)"
  report OK "PR 6 · Redis" "cache (LRU, NVMe) + queue (no eviction, AOF on data disk)"
  [ "$caddy_rc" = 0 ] && report OK "PR 7 · Caddy" "$EXTAS_STAGING_HOST, auto HTTPS, HTTP/3, password + noindex"
  report INFO "stack health" "$up"
  # The preview password is never sent anywhere (not in chat, not in Git, not as an artifact). The owner reads it
  # on the VM himself: Azure portal → Run command → /usr/local/sbin/extas-preview-login (docs/owner/PREVIEW-LOGIN.md).
  install -m 0755 "$EXTAS_REPO_DIR/infra/server/bin/extas-preview-login" /usr/local/sbin/extas-preview-login
  # PR 15 / CN-009 — the same for the admin's first owner login (made by owner-account.yml, which also installs it).
  install -m 0700 "$EXTAS_REPO_DIR/infra/server/bin/extas-owner-login" /usr/local/sbin/extas-owner-login
  # Round 3: a Caddy that does not run the repo's configuration fails the step (after everything else was done).
  return "$caddy_rc"
}
