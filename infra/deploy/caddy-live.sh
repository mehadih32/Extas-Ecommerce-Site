# shellcheck shell=bash
# PR 620 · p3 review round 3 — what Caddy is really running, not what was written to disk. Sourced by
# infra/server/steps/09-stack.sh (server setup) and infra/deploy/deploy.sh.
#
# - The stack mounts the single file ./caddy/Caddyfile into the container. A bind mount of one file stays on the file's
#   inode, so a copy that makes a new file (rsync's default: temp file + rename) is never seen by the running Caddy and
#   every reload reads the old Caddyfile. `caddyfile_copy_inplace` writes into the same inode instead, and
#   `caddyfile_live_matches` compares what the container reads with the repo's file.
# - `caddy_trusts_proxies` reads Caddy's live configuration through its admin API (localhost:2019 inside the
#   container, 127.0.0.1:2019): only when it has `trusted_proxies` (infra/stack/caddy/client-ip-block.sh loaded) may the app's upstream
#   overwrite CF-Connecting-IP with {client_ip}. Without it, {client_ip} is the Cloudflare server's address, and every
#   visitor would share one address in the app's per-address limits and logs.
# Every function only reads, except the copy; none prints a secret.

CADDY_CONTAINER="${CADDY_CONTAINER:-extas-caddy}"

# caddyfile_copy_inplace <source> <target> — the target gets the source's content in its own inode (created when it
# does not exist yet). Prints "changed" when the content changed.
caddyfile_copy_inplace() {
  local src="$1" dst="$2"
  if [ -f "$dst" ] && cmp -s "$src" "$dst"; then return 0; fi
  cat "$src" > "$dst"
  chmod 0644 "$dst"
  echo changed
}

# caddyfile_live_matches <file> — the Caddyfile the running container reads is byte for byte <file>.
caddyfile_live_matches() {
  local want have
  want="$(sha256sum < "$1" | cut -d' ' -f1)"
  have="$(docker exec "$CADDY_CONTAINER" sha256sum /etc/caddy/Caddyfile 2>/dev/null | cut -d' ' -f1)" || return 1
  [ -n "$have" ] && [ "$want" = "$have" ]
}

# caddy_live_servers — Caddy's live server configuration (JSON) from its admin API, or nothing. The admin endpoint
# `localhost:2019` listens on 127.0.0.1 only (not ::1), so the address is written out.
caddy_live_servers() {
  docker exec "$CADDY_CONTAINER" wget -qO- "http://127.0.0.1:${CADDY_ADMIN_PORT:-2019}/config/apps/http/servers" 2>/dev/null || true
}

# caddy_trusts_proxies — the live configuration believes CF-Connecting-IP only from trusted proxies.
caddy_trusts_proxies() {
  local live
  live="$(caddy_live_servers)"
  grep -q '"trusted_proxies"' <<<"$live" && grep -q '"client_ip_headers"' <<<"$live"
}
