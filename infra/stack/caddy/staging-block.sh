#!/usr/bin/env bash
# CN-052 (14 Nov 2026) — the site block of the OPTIONAL staging host (server.conf EXTAS_STAGING_HOST), printed to
# standard output for sites/staging.caddy:
#   staging-block.sh <host>
# It was the Caddyfile's own `{$EXTAS_STAGING_HOST} { ... }` block until the staging host new.extas.com.bd was retired;
# with no host the block would be an invalid site address, so server setup (steps/09-stack.sh) now writes this file only
# while a staging host is set and removes it when it is empty (the Caddyfile imports sites/staging*.caddy, a glob).
# A staging host is ALWAYS behind the preview password and noindex, also when the main domain is open (PR 403).
set -euo pipefail
h="${1:?usage: staging-block.sh <host>}"
# A plain host name; an address with a scheme or a port is allowed for the tests only (http://name:port).
[[ $h =~ ^(http://)?[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]+)?$ ]] || { echo "staging-block: not a host name: $h" >&2; exit 2; }
printf '# CN-052: the staging host: ALWAYS behind the preview password and noindex\n'
printf '%s {\n' "$h"
printf '\timport extas_site\n'
printf '\timport gated_cache\n'
printf '\timport /etc/caddy/sites/noindex.caddy\n'
printf '\timport /etc/caddy/sites/auth.caddy\n'
printf '\timport /etc/caddy/sites/upstream.caddy\n'
printf '}\n'
