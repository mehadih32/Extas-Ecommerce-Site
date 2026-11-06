# Go-live check (PR 587) — before the owner's "go live"

**সারকথা:** চালুর আগে দরকারি 16টার 4টা হয়ে গেছে, 12টা বাকি। রিডাইরেক্ট: 0টা পুরনো লিংক (এখনো বন্ধ — চালুর দিনে চালু হবে)। সাইটম্যাপ: 3টা ঠিকানা, 0টা সমস্যা। ডোমেইন বদলের মহড়া (শুধু কপিতে): ঠিক আছে। কিছুই বদলানো হয়নি।

- Run: 2026-11-06 08:28 (Asia/Dhaka) · version `21f4d9a583e6` · host: the staging host only (read-only check account) · result **NOT READY**
- Nothing was changed: no setting, no sign-off, no server file. The main domain was never asked.

## Needed before go-live (4/16 done)

| | Row | PR | Kind | Detail |
|---|---|---|---|---|
| ✅ | Every page opens (smoke test) (`smoke`) | 393 | auto | pages: 418 · failed: 0 |
| ✅ | The server's health check is clean (`health`) | 393 | auto | problems: 0 |
| ✅ | Last night's backup on the server (`backups`) | 393 | auto | todo: 0 |
| ✅ | Every server item of A2.9 in place (`server`) | 394 | auto | steps: 25 · fail: 0 · warn: 0 · failed: — |
| ❌ | Cloudflare Origin certificate on the server (`originCert`) | 397 | auto | names: — · days: 0 · missing: — · error: — |
| ❌ | Cloudflare SSL/TLS mode is Full (strict) (`sslStrict`) | 397 | signoff | — |
| ❌ | Main domain open to search engines (`indexing`) | 401 | auto | hosts: — · on: off |
| ❌ | Search Console on the main domain, sitemap sent (`searchConsole`) | 401 | signoff | — |
| ❌ | Test payments off, every online method on a real gateway (`testPayments`) | 400 | auto | stores: — · methods: : bkash, : nagad, : rocket, : visa, : mastercard, : amex, : bank, : online |
| ❌ | Request limits enforce (`rateLimit`) | 393 | auto | mode: observe |
| ❌ | Two-step sign-in for every staff member who can change things (`staffTwoFactor`) | 393 | auto | without: 1 · required: off |
| ❌ | Go-live runbook read, rollback rehearsed (`runbook`) | 398 | signoff | — |
| ❌ | QA gate green (Blueprint Appendix C) (`qaGate`) | 393 | signoff | — |
| ❌ | Staging acceptance list walked through (`acceptance`) | 393 | signoff | — |
| ❌ | Real iPhone and real Android (`realPhones`) | 393 | signoff | — |
| ❌ | The real-life journey simulation passed on staging (`simulation`) | 393 | signoff | — |

## Soon after go-live (0/6 done; they never hold the switch back)

| | Row | PR | Kind | Detail |
|---|---|---|---|---|
| 🟡 | Off-server backup (Azure Blob and Google Drive) (`offServer`) | 391 | auto | todo: 4 |
| 🟡 | Restore drill of the off-server copies (`restoreDrill`) | 507 | auto | todo: 2 |
| 🟡 | Store details and legal numbers (owner data) (`ownerData`) | 399 | auto | stores: 1 · missing: contact.phone, contact.address, delivery band |
| 🟡 | Live payment, courier and SMS keys (`connections`) | 400 | auto | live: — · missing: PAYMENT, COURIER, SMS |
| 🟡 | Telegram connected (`telegram`) | 400 | auto | — |
| 🟡 | Outside security review (`securityReview`) | 381 | signoff | — |

## Redirects of the old shop (WordPress map, PR 235 / 587)

- Rows: **0** (the old sitemap listed 49 addresses on 19 Oct 2026, docs/owner/GOOGLE-TRAFFIC-PLAN.md F1) · map live: **off — switched on on go-live day**
- Targets opened on the staging host: 0, problems: 1
  - no WordPress row yet: load the old shop's addresses (Website › SEO › Redirects › Import, kind WordPress)

## Sitemap

- /sitemap.xml: 200 · files: 4 · addresses: 3 · written for host: new.extas.com.bd
- Every address's path opened on the staging host: 3, problems: 0

## Domain switch, dry run (nothing applied)

- ✅ the live Caddy configuration with extas.com.bd www.extas.com.bd OPEN (no preview password, no noindex) validates; the staging host's own block keeps both (checked in a copy, nothing applied)

## What only the owner gives

- His "go live" for the day and the quiet hour; then `node tools/golive-switch.mjs --domain <main domain> --confirm "GO LIVE <main domain>"` (docs/golive/RUNBOOK.md, PR 587 section).
- The DNS change in Cloudflare (runbook step 5) when the Cloudflare account is his alone.
