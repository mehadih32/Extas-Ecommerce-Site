# R08 · Monitoring and alerting to Telegram

*Prohori প্রহরী · A360-02 · module 8 of 11 · level: Post-graduate · version 1.0 · as of October 2026*

Filed: PR 9 monitoring (uptime, queue depth, error rate, disk, memory → Telegram); PR 423 health page with spike +
AI diagnosis (approval to act). Chain of command: every Telegram message starts with the sender's identity line.

---

## 1. What to watch — the four golden signals [COMMUNITY — Google SRE book read through a chapter summary; read the original sre.google chapter to upgrade the tag. Adopted as [HOUSE] monitoring structure meanwhile]

| Signal | EXTAS metric | Example threshold [HOUSE — tune after 2 weeks of data] |
|---|---|---|
| **Latency** | p95 page TTFB; p95 checkout API; **track slow errors separately** | PDP p95 > 1.5 s for 10 min |
| **Traffic** | requests/min; orders/hour vs same hour last week | orders/hour 0 for 60 min between 09:00–23:00 |
| **Errors** | 5xx rate; failed payment validations; courier API errors | 5xx > 2% for 5 min |
| **Saturation** | CPU, RAM, disk, DB connections, queue depth; **predict "disk full in N hours"** | disk > 80% or full in < 48 h |

SRE alerting rules **[COMMUNITY — same summary; adopted as HOUSE]**: page on **symptoms** (customers affected), use causes for diagnosis; **never alert because something "seems a bit weird"**; simple, robust rules with low noise; every page takes a human away from improving the system, so it must be justified.

## 2. EXTAS alert levels [HOUSE]

| Level | Meaning | Channel | Example |
|---|---|---|---|
| 🔴 P1 | customers can't buy / money at risk | Telegram to owner + Prohori + Gyani, repeat every 10 min until acked | site down, checkout 5xx, payment webhook signature failures spike, backup missing 2 nights |
| 🟠 P2 | degraded or will break soon | Telegram to Prohori + Gyani | p95 slow, disk full in 48 h, cert expires in 7 days, courier API failing |
| 🟡 P3 | needs a look this week | daily digest | dependency advisory, unattended-upgrade needs reboot |
| ℹ️ info | done/OK | weekly digest | backup OK, deploy OK, restore drill OK |

Each alert text: identity line · what is broken in plain Bengali · since when · customer impact · first check · link to the health page. No secrets or customer phone numbers in alerts.

## 3. Telegram mechanics [OFFICIAL — Telegram Bots FAQ]
- Limits: **~1 message/second to one chat** (short bursts tolerated), **20 messages/minute in a group**, **~30 messages/second** bulk; over the limit → HTTP **429**.
- **[HOUSE]** So: dedupe and group alerts (one message per incident, edits for updates, not 50 messages); queue with retry/backoff on 429; a separate bot token per environment; token in the vault.
- **[HOUSE]** Telegram itself can fail → P1 also goes by SMS to the owner (SMS gateway already used for orders).

## 4. Tools
- **Uptime Kuma** (self-hosted): HTTP(s), **HTTP keyword**, TCP, ping, DNS, push and Docker checks; **Telegram among 90+ notification services**; status pages; certificate info **[OFFICIAL — project README]**. Use for: home, PDP, checkout page keyword ("অর্ডার কনফার্ম"), admin login, API `/healthz`, cert expiry.
- **Push monitors = dead-man switches:** the backup job, courier sync job and stock reconcile job ping Kuma when done; silence → alert **[HOUSE]**.
- External check from **outside Azure** too (a monitor on the same VM can't report the VM is down) **[HOUSE]**.
- Host metrics + app metrics (Prometheus/Netdata or the PR 423 health page) — whichever is built; same thresholds.

## 5. Business monitors (the ones that catch silent failures) [HOUSE]
- Orders/hour vs same weekday last 4 weeks (drop > 60% in campaign hours → P2).
- Payment: validations failed / total > 10% → P1.
- Courier: bookings stuck "In Review" > 24 h; webhook updates stopped for 6 h → P2.
- Stock: negative stock anywhere → P2 (Bhandari).
- SMS: OTP sends per hour spike (cost attack) → P2.
- Meta CAPI / Pixel events per order ratio drops (Tirondaj T02) → P3.

## 6. Checklist
- [ ] External uptime checks for 5 key URLs with keyword match
- [ ] Golden-signal dashboards + thresholds; disk forecast
- [ ] Dead-man pings for every scheduled job
- [ ] Alert levels and recipients set in the admin; dedupe/grouping on
- [ ] Telegram 429 handling + SMS fallback for P1
- [ ] Monthly: test alert from the health page reaches everyone
- [ ] Alert noise review: any alert that fired > 5 times with no action → fix or delete

## 7. Worked example — the silent courier sync
No error, site up, but 0 courier status updates since 14:00. Push monitor "courier-sync" goes silent → P2 at 15:00: "🛡️ প্রহরী · কুরিয়ার আপডেট ১ ঘণ্টা বন্ধ · ডেলিভারি স্ট্যাটাস পুরনো দেখাচ্ছে · প্রথমে দেখুন: Steadfast API key/expiry". Cause: courier rotated keys. Fix with Bhandari; add expiry date to the rotation calendar (R05).

---

**Sources** (type in brackets):
- [Book notes on Google SRE book] SRE book notes — Monitoring distributed systems: https://bitmaybewise.substack.com/p/sre-book-notes-monitoring-distributed
- [Official — Telegram] Bots FAQ (rate limits): https://core.telegram.org/bots/faq
- [Official — project README] Uptime Kuma 1.22.1 README (mirror): https://git.hackliberty.org/Infra-Mirrors/uptime-kuma/raw/tag/1.22.1/README.md
- [Internal] master register PR 9, PR 423; AGENT-PROTOCOL.md (identity line)

*As of October 2026.*
