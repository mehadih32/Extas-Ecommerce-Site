#!/usr/bin/env bash
# PR 7 — the preview gate for the staging host, as a Caddy snippet (auth.caddy), printed to standard output:
#   auth-block.sh <fingerprint line> <user> <bcrypt hash> <cookie token> <cookie days>
# The first visit asks for the preview login (basic auth). After it passes, Caddy sets an HttpOnly cookie that holds a
# token derived on the server from the preview password (never the password itself); every later request with that
# cookie passes without asking again. Without the cookie, the browser's own requests (the admin sign-in's fetch, for
# one) outside the first page's path were answered 401 and the browser asked for the login again (owner, 20 Oct
# 15:36). `route` keeps the order: the cookie is set only after the login passed, never on a 401.
# Follow-up 80 (PR 196): exactly one request passes without the preview login: POST /api/erp/webhook, the outside
# ERP's message. It has no browser and no cookie, and it proves itself with its HMAC signature (the app refuses every
# message without a good one, and every message while no webhook secret is in the vault). Every other path, and every
# other method on that path, stays behind the gate. Two separate `not` lines in one matcher must both hold (Caddy
# answers false as soon as one negated set matches), so the gate asks when there is no cookie AND the request is not
# that one POST. The path is the app's own route (apps/web/src/app/api/erp/webhook), not a setting.
set -euo pipefail
tag="${1:?}"; user="${2:?}"; hash="${3:?}"; token="${4:?}"; days="${5:?}"
[[ "$token" =~ ^[0-9a-f]{32,128}$ ]] || { echo "auth-block: the cookie token must be hex" >&2; exit 2; }
[[ "$days" =~ ^[0-9]+$ ]] || { echo "auth-block: cookie days must be a number" >&2; exit 2; }
printf '%s\n' "$tag"
printf '@preview_needed {\n'
printf '\tnot header_regexp Cookie (?:^|;\\s*)extas_preview=%s(?:;|$)\n' "$token"
printf '\tnot {\n\t\tmethod POST\n\t\tpath /api/erp/webhook\n\t}\n}\n'
printf 'route @preview_needed {\n\tbasic_auth {\n\t\t%s %s\n\t}\n' "$user" "$hash"
printf '\theader Set-Cookie "extas_preview=%s; Path=/; Max-Age=%s; Secure; HttpOnly; SameSite=Lax"\n}\n' "$token" "$((days * 86400))"
