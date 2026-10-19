# R03 · Node / PHP deployment with zero downtime

*Prohori প্রহরী · A360-02 · module 3 of 11 · level: Post-graduate · version 1.0 · as of October 2026*

Goal: a customer in the middle of checkout never sees a 502/503 because we deployed. Every deploy is reversible in
one step.

---

## 1. Node (Next.js) with PM2 [OFFICIAL — PM2 docs]

- **Cluster mode** (`instances: "max"` or a number) + **`pm2 reload`** = PM2's "0-second-downtime reload"; `restart` kills and restarts.
- If the app can't reload cleanly, PM2 **falls back to a restart after a timeout** → zero downtime depends on the app shutting down properly.
- **Graceful shutdown:** on `SIGINT` call `server.close()` (stop new connections, finish current), close DB/Redis, then `process.exit(0)`. PM2 sends SIGKILL after **`kill_timeout` (default 1,600 ms)** — raise it (e.g. 10 s) for checkout requests that call payment APIs.
- **Readiness:** `wait_ready: true` + `process.send('ready')` after DB connect and `listen()`; **`listen_timeout` default 3,000 ms**, after which PM2 assumes ready anyway — set it above real startup time.
- **Stateless processes:** no sessions or carts in process memory — Redis/PostgreSQL only.

```js
// ecosystem.config.js (sketch)
module.exports = { apps: [{ name: 'extas-web', script: 'server.js', instances: 2, exec_mode: 'cluster',
  wait_ready: true, listen_timeout: 15000, kill_timeout: 10000, env: { NODE_ENV: 'production' } }] };
```

If the live stack runs Next.js in **Docker** instead of PM2 (profile says Docker), the same idea is **blue-green**: start the new container, health-check it, switch the proxy upstream, then stop the old one **[HOUSE]**.

## 2. PHP (ERP or legacy) — atomic symlink releases [OFFICIAL — Deployer docs]

```
/var/www/erp/releases/2026-10-19_1530/   ← new code built here
/var/www/erp/shared/ (.env*, uploads)    ← symlinked into each release
/var/www/erp/current -> releases/2026-10-19_1530   ← one atomic switch
```
- OPcache keys on paths: if Nginx passes `SCRIPT_FILENAME` via the `current` **symlink**, PHP can keep serving **old code** after the switch. Reloading php-fpm fixes it but can drop in-flight requests.
- **Fix:** in Nginx use **`$realpath_root`** instead of `$document_root` for both `SCRIPT_FILENAME` and `DOCUMENT_ROOT` fastcgi params (Caddy: `resolve_root_symlink`; Apache: `opcache.revalidate_path=1`). Check: `$_SERVER['SCRIPT_FILENAME']` must not contain `current`.
- (*.env should become vault-sourced — R05.)

## 3. Database migrations — expand / migrate / contract [COMMUNITY — Harness blog; widely used pattern, test before use]

1. **Expand:** add new columns/tables (nullable / with defaults) — old code still works.
2. **Migrate:** deploy code that writes both / reads new; backfill in small idempotent batches.
3. **Contract:** drop the old column in a **later** deploy, after all traffic uses the new one.
- Renaming or dropping a column is **not** backward compatible; adding a nullable column is.
- Schema changes can take locks → run heavy ones off-peak, in batches; for PostgreSQL, check the lock level of each statement before running it on production **[HOUSE]**.
- **EXTAS rule [HOUSE]:** a release whose migration is not backward compatible cannot be rolled back by code alone → it needs a fresh backup (R04) **and** the lead's sign-off.

## 4. The EXTAS deploy pipeline [HOUSE]

```
CI: lint · hardcode guard (PR 494) · unit tests · build · Playwright smoke on staging (R10)
 ↓
backup check: last nightly backup OK? (if migration is non-reversible → take a fresh one)
 ↓
deploy to prod: new release/container → migrations (expand only) → health check /healthz (DB + Redis + version)
 ↓
switch: pm2 reload | proxy upstream swap | symlink switch
 ↓
post-deploy smoke (2 min): home, PDP, add to bag, checkout to payment page, admin login, a webhook dry-run
 ↓
pass → Telegram "✅ deployed vX.Y" · fail → automatic rollback to previous release + Telegram alert → incident (R09)
```
- **Deploy windows:** not during campaign launches, Friday-night sale peaks or Eid rush; the audit runner's calendar blocks them (owner-editable).
- **Feature flags** for risky changes — the owner's "switch, off by default" rule doubles as a kill switch.

## 5. Rollback checklist
- [ ] Previous release still on disk / previous image tag kept (keep last 5)
- [ ] One command: `pm2 reload` previous | swap upstream back | point `current` to previous
- [ ] Migrations of the failed release were expand-only (else restore plan ready)
- [ ] Caches (CDN, OPcache) don't serve mixed versions — asset filenames hashed
- [ ] Telegram message says who/what/when and links the incident

## 6. Worked example — checkout 502s during deploy
Symptom: 40 s of 502s during every deploy. Cause: `pm2 restart` in the script, single instance. Fix: cluster mode 2 instances, `pm2 reload`, graceful SIGINT handler, `wait_ready`. Proof: k6 checkout script running during deploy → 0 errors (PR 10 baseline). Lesson written: "reload, never restart".

---

**Sources** (type in brackets):
- [Official — PM2 docs] Graceful shutdown: https://doc.pm2.io/en/runtime/best-practices/graceful-shutdown/
- [Official — PM2 docs] Cluster mode: https://pm2.keymetrics.io/docs/usage/cluster-mode/index.html
- [Official — Deployer docs] Avoid php-fpm reloading ($realpath_root): https://deployer.org/docs/8.x/avoid-php-fpm-reloading
- [Vendor blog] Harness, Zero-downtime database migrations: https://www.harness.io/blog/zero-downtime-database-migrations-safe-schema-changes
- [Internal] master register PR 10 (k6 baseline), PR 494 (hardcode guard)

*As of October 2026.*
