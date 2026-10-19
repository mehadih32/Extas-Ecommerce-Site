# R02 · Nginx + TLS (and the Caddy equivalent the master register chose)

*Prohori প্রহরী · A360-02 · module 2 of 11 · level: Graduate → Post-graduate · version 1.0 · as of October 2026*

**Stack note:** the master register's PR 7 says **Caddy** (automatic TLS, HTTP/2 + HTTP/3, compression, security headers).
This module teaches Nginx because the owner's other systems (ERP, legacy PHP) may run behind it. Whichever proxy is
live, the **same checklist (§5)** applies. Changing PR 7 from Caddy to Nginx is an owner/lead decision (README).

---

## 1. TLS settings [OFFICIAL — NGINX docs]

```nginx
worker_processes auto;
http {
  ssl_session_cache   shared:SSL:10m;   # ~4,000 sessions per MB, shared across workers
  ssl_session_timeout 10m;              # default is 5m
  server {
    listen 443 ssl;
    http2 on;                           # nginx ≥ 1.25.1 syntax; older: "listen 443 ssl http2;"
    server_name extas.com.bd www.extas.com.bd;   # placeholder domain
    ssl_certificate     /etc/letsencrypt/live/extas/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/extas/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;      # default since nginx 1.27.3 if OpenSSL supports them
    keepalive_timeout 70;
  }
}
```
- The handshake is the most CPU-heavy step; session cache + keepalive reduce handshakes **[OFFICIAL]**.
- Default `ssl_ciphers HIGH:!aNULL:!MD5`; disable old CBC ciphers if you set your own list **[OFFICIAL]**.
- `http2 on;` directive form: **[HOUSE — check the installed nginx version (`nginx -v`) before using]**.
- Mozilla's Server Side TLS guidance has **moved** (wiki page now points to a community project at docs.tlsref.org) **[OFFICIAL — Mozilla wiki, Jun 2026]**; generate cipher lists from there when needed rather than copying old blog configs.

## 2. Certificates — automation is mandatory [OFFICIAL — Let's Encrypt]

- Let's Encrypt default lifetime is still **90 days**; optional **6-day** certificates exist; Let's Encrypt plans **45-day maximum by February 2028**; industry rules cap lifetimes at **47 days from 15 March 2029**.
- So: renewal must be automatic (certbot timer / Caddy built-in / acme client), **and monitored** — an expiry alert at 14 days and 7 days in R08 **[HOUSE]**.
- Cloudflare in front (profile): use "Full (strict)" mode with a valid origin certificate; never "Flexible" (it sends traffic to the origin unencrypted) **[HOUSE — verify the Cloudflare setting name in the dashboard]**.

## 3. Security headers (set once, at the proxy) [HOUSE — values to verify with the audit runner]

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;  # add 'preload' only after an owner decision
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(self)" always;
add_header Content-Security-Policy-Report-Only "default-src 'self'; img-src 'self' data: https:; script-src 'self' https://connect.facebook.net https://www.googletagmanager.com; frame-ancestors 'self'" always;
```
- CSP starts **Report-Only**, because Meta Pixel, GTM, payment gateway redirects and the WhatsApp widget need entries; switch to enforcing after a clean week of reports.
- HSTS `preload` is hard to undo → owner decision.

## 4. Reloads without dropping connections [COMMUNITY — one guide read; prove it on staging: run a k6 load (PR 10) during a reload and expect 0 failed requests]

- Always `sudo nginx -t` first; then `sudo systemctl reload nginx` (or `nginx -s reload`).
- On reload the master starts **new workers with the new config and gracefully retires old workers** — active connections finish. **Never `restart`** for a config change.
- Old workers can linger while long connections (WebSockets, slow downloads) finish — memory briefly doubles; expected.

Rate limiting and request size limits live here too (R06 §4): `limit_req_zone` for login/OTP/checkout POSTs, `client_max_body_size` matched to the photo upload limit.

## 5. Proxy checklist (Nginx or Caddy)

- [ ] HTTP → HTTPS 301; one canonical host (www or not — Doot D01 decides)
- [ ] TLS 1.2 + 1.3 only; cert auto-renews; expiry alert in Telegram at 14/7 days
- [ ] Session cache/keepalive set (Nginx) — Caddy does this itself
- [ ] Security headers present on every response incl. errors (`always`)
- [ ] CSP report-only → enforced after a clean week
- [ ] Upstream app reachable only via loopback/Docker network
- [ ] `nginx -t` in the deploy script before reload; reload not restart
- [ ] Rate limits on login/OTP/checkout/webhook endpoints (R06)
- [ ] Real client IP passed (`X-Forwarded-For` from Cloudflare only — trust Cloudflare ranges, not everyone)

## 6. Worked example — certificate expired on a Friday night
Symptom: Telegram uptime alert "TLS handshake failed" 23:10. Check `certbot certificates` → expired; renewal failed for 3 weeks because port 80 was closed in the NSG during a hardening change. Mitigate: open 80 for ACME, renew, reload. Fix the system: expiry alert at 14 days (was missing), ACME check in the weekly audit (R11), change-request template now lists "ACME port 80" as a dependency. Postmortem (R09).

---

**Sources** (type in brackets):
- [Official — NGINX docs] NGINX SSL termination: https://docs.nginx.com/nginx/admin-guide/security-controls/terminating-ssl-http/
- [Official — Mozilla wiki] Security/Server Side TLS (moved notice): https://wiki.mozilla.org/Security/Server%20Side%20TLS
- [Official — Let's Encrypt] Certificate lifetime rationale and plans: https://letsencrypt.org/si/docs/cert-lifetimes/
- [Practitioner guide] nixCraft, gracefully reload nginx: https://www.cyberciti.biz/faq/howto-unix-linux-gracefully-reload-restart-nginx-webserver/
- [Internal] master register PR 7 (Caddy), prohori.md (Cloudflare)

**Not verified:** exact HSTS/CSP values (house defaults, to be confirmed by the audit runner); Cloudflare SSL mode names.

*As of October 2026.*
