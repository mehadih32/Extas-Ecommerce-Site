#!/usr/bin/env bash
# PR 403 — the site block for the extra host names (server.conf EXTAS_EXTRA_HOSTS: the main domain on go-live day, a
# store's own domain), printed to standard output for sites/hosts.caddy:
#   hosts-block.sh <open: yes|no> <host>...
# The staging host (EXTAS_STAGING_HOST) has its own block in the Caddyfile and always keeps the preview password and
# `noindex`. These hosts share the app, the headers and the certificate choice, and are LOCKED the same way (the preview
# login, an X-Robots-Tag "noindex, nofollow" header and a robots.txt that disallows everything) until the owner opens
# them on go-live day: server.conf EXTAS_MAIN_OPEN="yes" (only the exact word "yes" opens; BLOCKED 25, runbook step 4).
# Open, the block has neither: the app answers robots.txt itself, open only on a store's primary domain with search
# engines let in (Website → SEO), so the staging host stays closed at the app level too.
# With no host names, server setup writes no file at all (the Caddyfile imports sites/hosts*.caddy, a glob).
set -euo pipefail
open="${1:?usage: hosts-block.sh <open: yes|no> <host>...}"; shift
[ "$#" -gt 0 ] || { echo "hosts-block: no host names" >&2; exit 2; }
for h in "$@"; do
  # Plain host names only (infra/deploy/caddy-live.sh site_extra_hosts cleans them); an address with a scheme or a port
  # is allowed for the tests only (http://name:port).
  [[ $h =~ ^(http://)?[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]+)?$ ]] || { echo "hosts-block: not a host name: $h" >&2; exit 2; }
done
if [ "$open" = yes ]; then
  printf '# PR 403: OPEN (EXTAS_MAIN_OPEN=yes) — no preview password and no noindex on these hosts\n'
else
  printf '# PR 403: LOCKED (EXTAS_MAIN_OPEN is not "yes") — the preview password and noindex, like the staging host\n'
fi
printf '%s {\n' "$*"
printf '\timport extas_site\n'
if [ "$open" != yes ]; then
  printf '\timport gated_cache\n'   # R2 security review (m3): Cloudflare never keeps a page of a locked host
  printf '\theader X-Robots-Tag "noindex, nofollow"\n'
  printf '\trespond /robots.txt "User-agent: *\nDisallow: /\n" 200\n'
  printf '\timport /etc/caddy/sites/auth.caddy\n'
fi
printf '\timport /etc/caddy/sites/upstream.caddy\n'
printf '}\n'
