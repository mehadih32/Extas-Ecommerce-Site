# R06 · OWASP Top 10 for e-commerce — auth, sessions, CSRF, rate limits, payment callbacks

*Prohori প্রহরী · A360-02 · module 6 of 11 · level: Post-graduate → PhD · version 1.0 · as of October 2026*

---

## 1. OWASP Top 10:2025 mapped to EXTAS [OFFICIAL — OWASP list; HOUSE mapping]

| # | Category | Where it bites EXTAS | First control |
|---|---|---|---|
| A01 | **Broken Access Control** | customer A opens `/account/orders/1043` of customer B; staff role sees refunds; agent tools exceed scope | server-side ownership check on every object; role matrix; agents' scope lock |
| A02 | Security Misconfiguration | open Redis/DB ports, debug pages, default admin paths, missing headers | R01/R02 checklists, audit runner |
| A03 | **Software Supply Chain Failures** | npm/composer packages, WordPress-style plugins, CDN scripts (Pixel/GTM) | lockfiles, `npm audit`/advisories in CI, pin versions, CSP |
| A04 | Cryptographic Failures | secrets in DB plaintext, HTTP anywhere, weak hashing | vault (R05), TLS (R02), argon2/bcrypt for any password |
| A05 | Injection | search box, admin filters, address field into SQL or HTML | parameterised queries (Prisma), output encoding, CSP |
| A06 | Insecure Design | coupon stacking, negative quantity, price taken from the client, COD abuse | server recomputes totals; business-rule tests |
| A07 | **Authentication Failures** | OTP brute force, SIM-swap takeovers of accounts, admin without 2FA | OTP limits (§4), admin 2FA, session rules (§3) |
| A08 | Software or Data Integrity Failures | **unverified payment callbacks**, unsigned webhooks, auto-updating scripts | R07 webhook rules, signed deploys |
| A09 | Security Logging and Alerting Failures | nobody notices 500 failed logins or 30 refunds | log auth/refund/price changes; Telegram alerts (R08) |
| A10 | Mishandling of Exceptional Conditions | payment API timeout → order marked paid; courier API down → stock lost; stack traces to users | fail **closed** on money, fail **open** on browsing; idempotent retries |

## 2. CSRF [OFFICIAL — OWASP CSRF Prevention Cheat Sheet]

1. **Use the framework's built-in CSRF protection first.**
2. Stateful apps: **synchronizer token** validated server-side on every state-changing request.
3. Stateless apps: **signed** double-submit cookie (HMAC bound to the session); the naive version is discouraged.
4. **Fetch Metadata** (`Sec-Fetch-Site`) is now described as the **primary signal**, with a **mandatory fallback** to Origin checks for older browsers.
5. **SameSite cookies are defence in depth, not the defence.**
6. Custom request headers suit AJAX/API endpoints (they force a CORS preflight — keep allowed origins tight).
7. **Never change state with GET** (SameSite=Lax still sends cookies on top-level GET).
8. **XSS defeats every CSRF defence** — CSP and output encoding matter.

EXTAS state-changing endpoints: add to bag, place order, cancel order, change address, admin price/stock edits, refunds, agent approvals.

## 3. Sessions [2-SRC — Authgear guide + MITRE EMB3D MID-073 (which cites OWASP) for cookie flags; HOUSE for the rest]

- Cookies: **`Secure`, `HttpOnly`, `SameSite=Lax`** (Strict for the admin), narrow `Path`/`Domain`, sensible expiry **[2-SRC]**.
- Session IDs: unique, unpredictable (CSPRNG), unrelated to user data, managed by the framework **[2-SRC]**.
- **[HOUSE]** New session ID on login, on privilege change (customer → staff), after password/phone change; idle timeout customer 30 days "remember me" / admin 30 min; absolute admin timeout 12 h; logout invalidates server-side; "log out all devices" in account.
- **[HOUSE]** Guest cart is not a session: cart ID cookie is separate and carries no rights.

## 4. Rate limits and abuse controls [HOUSE — numbers are starting values, tune from logs]

| Endpoint | Limit (per IP and per phone) | On exceed |
|---|---|---|
| Send OTP | 3 per 10 min per phone; 10 per hour per IP | wait message + Telegram if a phone gets > 10/day (SMS cost attack) |
| Verify OTP | 5 tries per code; code valid 5 min | code invalidated |
| Admin login | 5 per 15 min per account + IP | lock 15 min, alert |
| Place order (COD) | 5 per hour per phone; 20 per hour per IP | soft block → manual review queue (never auto-ban: approval list) |
| Search / API | generous; protects the DB | 429 |
| Webhooks | allow-list + signature (R07); no rate limit that could drop real payments | — |

- Implement at the proxy (`limit_req` zones) **and** in the app (per phone needs app logic) — two layers.
- OTP inputs allow paste and `autocomplete="one-time-code"` (WCAG 3.3.8, Shilpi U09).
- **Blocking customers is on the approval list** — the system may throttle and queue, only the owner blocks.

## 5. Payment callbacks — the five rules (detail in R07) [HOUSE, from gateway docs]
1. The **browser return** (success URL) is never proof of payment.
2. Confirm by a **server-to-server** check (validation/query API) or a **verified** signed notification.
3. Match **amount, currency, our order/transaction ID** to the order in our DB.
4. Process **idempotently** (the same notification twice = one payment).
5. Order states change only in a DB transaction; failures go to a review queue, not "paid".

## 6. Worked example — IDOR on invoices
Finding (audit runner): `/invoice/1043.pdf` downloadable by anyone who changes the number. Severity: high (names, phones, addresses = personal data). Fix: invoices served only via `/account/orders/{orderId}/invoice` with ownership check, or a signed URL with expiry for SMS/WhatsApp links; order numbers stay human-friendly but are never the access key. Test: Playwright logged in as customer B requests A's invoice → 404. Lesson filed for Bhandari (invoice owner, PR 407).

## 7. Checklist (pre-launch and quarterly)
- [ ] Every object read/write checks ownership/role server-side
- [ ] CSRF: framework token + Fetch Metadata/Origin check on all state changes; no state-changing GET
- [ ] Session cookie flags; ID rotation on login; admin timeouts
- [ ] OTP/login/order rate limits live; alerts on abuse
- [ ] Totals, discounts and delivery charge recomputed server-side; client prices ignored
- [ ] Payment callbacks follow R07; idempotency key per order
- [ ] Dependencies scanned in CI; scripts pinned; CSP report-only → enforced
- [ ] Errors: generic to users, full detail to logs; money paths fail closed

---

**Sources** (type in brackets):
- [Official — OWASP] OWASP Top 10:2025: https://owasp.org/Top10/2025/
- [Official — OWASP] Cross-Site Request Forgery Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- [Vendor guide] Authgear, Session management threats and best practices: https://www.authgear.com/post/session-management/
- [Official — MITRE EMB3D] MID-073 Secure HTTP Session Management: https://emb3d.mitre.org/mitigations/MID-073.html
- [Official — W3C] WCAG 2.2 new criteria (3.3.8 accessible authentication): https://w3.org/WAI/standards-guidelines/wcag/new-in-22/
- [Internal] AGENT-PROTOCOL.md approval list (blocking), master register PR 407

**Not read this session:** OWASP Session Management and Authentication cheat sheets themselves (not reachable); session rules marked [HOUSE] accordingly.

*As of October 2026.*
