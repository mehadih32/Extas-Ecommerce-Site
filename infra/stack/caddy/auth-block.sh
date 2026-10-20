#!/usr/bin/env bash
# PR 7 — the preview gate for the staging host, as a Caddy snippet (auth.caddy), printed to standard output:
#   auth-block.sh <fingerprint line> <user> <bcrypt hash> <cookie token> <cookie days>
# The first visit asks for the preview login (basic auth). After it passes, Caddy sets an HttpOnly cookie that holds a
# token derived on the server from the preview password (never the password itself); every later request with that
# cookie passes without asking again. Without the cookie, the browser's own requests (the admin sign-in's fetch, for
# one) outside the first page's path were answered 401 and the browser asked for the login again (owner, 20 Oct
# 15:36). `route` keeps the order: the cookie is set only after the login passed, never on a 401.
set -euo pipefail
tag="${1:?}"; user="${2:?}"; hash="${3:?}"; token="${4:?}"; days="${5:?}"
[[ "$token" =~ ^[0-9a-f]{32,128}$ ]] || { echo "auth-block: the cookie token must be hex" >&2; exit 2; }
[[ "$days" =~ ^[0-9]+$ ]] || { echo "auth-block: cookie days must be a number" >&2; exit 2; }
printf '%s\n' "$tag"
printf '@preview_needed not header_regexp Cookie (?:^|;\\s*)extas_preview=%s(?:;|$)\n' "$token"
printf 'route @preview_needed {\n\tbasic_auth {\n\t\t%s %s\n\t}\n' "$user" "$hash"
printf '\theader Set-Cookie "extas_preview=%s; Path=/; Max-Age=%s; Secure; HttpOnly; SameSite=Lax"\n}\n' "$token" "$((days * 86400))"
