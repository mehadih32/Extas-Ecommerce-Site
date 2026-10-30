#!/usr/bin/env bash
# PR 620 · p3 review round 2 — where a request comes from, as a Caddy snippet (client-ip.caddy) for the global
# `servers` options, printed to standard output:
#   client-ip-block.sh <ranges file> [more ranges files…]
# The app counts refused ERP calls and webhooks per client address (packages/inventory erp-call-budget.ts) and logs
# the address of admin actions (apps/web lib/admin-auth.ts `requestContext`). Caddy is the only source of that address:
# - `trusted_proxies static …` lists Cloudflare's ranges (infra/config/cloudflare-ips.txt, or the lists the setup
#   fetched fresh); `client_ip_headers CF-Connecting-IP` makes Caddy read the visitor's address from that header only
#   when the request really came from one of them. From anyone else, {client_ip} is the real remote address.
# - The upstream (infra/deploy/deploy.sh `upstream_for`) then sends `header_up CF-Connecting-IP {client_ip}`, so the
#   header the app reads is always Caddy's answer: a forged header from a non-Cloudflare address never reaches it.
# Every line must be an IPv4 or IPv6 range (CIDR); anything else stops the script (exit 2), and so does a file with no
# range, so a broken list never ends up trusting nobody or everybody by accident.
set -euo pipefail
[ "$#" -ge 1 ] || { echo "client-ip-block: give the ranges file" >&2; exit 2; }
v4='^([0-9]{1,3}\.){3}[0-9]{1,3}/([0-9]|[12][0-9]|3[0-2])$'
v6='^[0-9a-fA-F:]*:[0-9a-fA-F:]*/([0-9]|[1-9][0-9]|1[01][0-9]|12[0-8])$'
ranges=()
for f in "$@"; do
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%%#*}"
    line="$(printf '%s' "$line" | tr -d '[:space:]')"
    [ -n "$line" ] || continue
    if [[ "$line" =~ $v4 || "$line" =~ $v6 ]]; then ranges+=("$line")
    else echo "client-ip-block: not an address range: $line" >&2; exit 2
    fi
  done < "$f"
done
[ "${#ranges[@]}" -gt 0 ] || { echo "client-ip-block: no address range given" >&2; exit 2; }
printf '# client address from Cloudflare only (infra/stack/caddy/client-ip-block.sh)\n'
printf 'trusted_proxies static %s\n' "${ranges[*]}"
printf 'client_ip_headers CF-Connecting-IP\n'
