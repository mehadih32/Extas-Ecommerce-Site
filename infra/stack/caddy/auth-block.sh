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
# PR 292: the WhatsApp Business Platform's webhook passes the same way, GET (Meta's handshake: the app answers only
# the verify token from the vault) and POST (signed with the app secret; refused while no secret is in the vault) on
# /api/whatsapp/webhook only. Each exemption is its own `not` set, so all must hold for the gate to ask.
# PR 620: the ERP's own calls to the shop pass the same way, GET only, on exactly its two paths (/erp-api/top-products
# and /erp-api/customers). Each is signed with the asking store's own secret, and the app refuses every call while no
# store has them switched on (`erp.siteApi.enabled`, off by default) and every call without a good signature.
# qa-gate (30 Oct): Caddy's `path` matcher ignores case and compares the decoded, cleaned path, while the app routes on
# the raw one: `/ERP-API/CUSTOMER%53` or `/x%2f..%2ferp-api%2fcustomers` matched the exemption and reached the app (its
# not-found page) with no login. Every exemption therefore matches the raw request target as it arrived
# ({http.request.orig_uri}: the path exactly as sent, then any query), case for case, by one anchored pattern of its
# exact path: an encoded letter or slash, a dot segment, a double or trailing slash, other capitals, HEAD or any other
# method all stay behind the gate. `[?]` keeps the patterns free of backslashes.
set -euo pipefail
tag="${1:?}"; user="${2:?}"; hash="${3:?}"; token="${4:?}"; days="${5:?}"
[[ "$token" =~ ^[0-9a-f]{32,128}$ ]] || { echo "auth-block: the cookie token must be hex" >&2; exit 2; }
[[ "$days" =~ ^[0-9]+$ ]] || { echo "auth-block: cookie days must be a number" >&2; exit 2; }
printf '%s\n' "$tag"
printf '@preview_needed {\n'
printf '\tnot header_regexp Cookie (?:^|;\\s*)extas_preview=%s(?:;|$)\n' "$token"
exempt() { printf '\tnot {\n\t\tmethod %s\n\t\texpression `{http.request.orig_uri}.matches(\x27^%s([?].*)?$\x27)`\n\t}\n' "$1" "$2"; }
exempt POST '/api/erp/webhook'
exempt 'GET POST' '/api/whatsapp/webhook'
exempt GET '/erp-api/(top-products|customers)'
printf '}\n'
printf 'route @preview_needed {\n\tbasic_auth {\n\t\t%s %s\n\t}\n' "$user" "$hash"
printf '\theader Set-Cookie "extas_preview=%s; Path=/; Max-Age=%s; Secure; HttpOnly; SameSite=Lax"\n}\n' "$token" "$((days * 86400))"
