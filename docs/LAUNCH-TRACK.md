# EXTAS — Launch track

**CN-027 · 24 Oct 2026.** The build order until go-live and after it. Generated from `docs/MASTER-REGISTER.md` (Build status: total 243/615 on 25 Oct 2026) and Blueprint Appendix A. Counted in PRs, never in days. **25 Oct 2026 (CN-028):** PR 607–619 and 621 (Retail and the ERP supplier model) are added to Launch, PR 620 to After launch.

## বাংলায় সংক্ষেপে

- **লক্ষ্য:** আগে শুধু সেই কাজগুলো শেষ হবে, যেগুলো ছাড়া নিরাপদে আসল অর্ডার নেওয়া যায় না। এটাই **Launch** লিস্ট।
- **Launch-এ আছে:** দোকান ঘোরা, প্রোডাক্ট, কম্বো, ব্যাগ, চেকআউট আর কাস্টমার অ্যাকাউন্ট (বেশিরভাগ বানানো শেষ); অর্ডার; পেমেন্ট, অগ্রিম আর রিফান্ডের হিসাব; কুরিয়ার বুকিং আর ট্র্যাকিং; QC-সহ রিটার্ন আর এক্সচেঞ্জ; COD মেলানো; ঝুঁকির বেসিক নিয়ম; অর্ডারের SMS আর WhatsApp; প্রতিদিন দোকান চালানোর অ্যাডমিন পেজ; সিকিউরিটি; ব্যাকআপ, রিস্টোর পরীক্ষা আর মনিটরিং; গুগলে আসার বেসিক SEO; নীতিমালার পেজ; আর গো-লাইভের কাজ, সাথে 70-অর্ডারের সিমুলেশন আবার চালানো (CN-013)।
- **হিসাব:** Launch-এ মোট 305টা PR, এর মধ্যে 222টা বানানো শেষ। **লাইভে যাওয়ার আগে আর 83টা PR বাকি।** (২৫ অক্টোবর: রিটেইল আর ERP-র নতুন হিসাবের 14টা PR যোগ হয়েছে, CN-028।) সবচেয়ে বেশি বাকি কুরিয়ার-রিটার্নে (16টা), গো-লাইভে (15টা), SEO-তে (14টা), সিকিউরিটিতে (9টা) আর পেমেন্টে (8টা)।
- **লাইভের পরে (310টা PR, 21টা আগেই বানানো, বাকি 289টা):** পুরো অ্যাড কন্ট্রোল, ফটো-ভিডিও স্টুডিও, AI এজেন্ট আর স্কিল, মাল্টি-স্টোর, বড় রিপোর্ট, লয়্যালটি আর রেফারেল, A/B টেস্ট, কম্পিটিটর টুল, ব্লগ, আর ডিফল্টের বাইরের বাড়তি অ্যাডমিন ডিজাইন।
- **আপনাকে কিছু করতে হবে না।** Launch শেষ হলে বিল্ড নিজে থেকেই লাইভের পরের লিস্ট আগের ক্রমে বানাতে থাকবে। যা বানানো হয়নি, তা বন্ধ বা লুকানো থাকবে। টাকা, দাম, COD বা মেইন ডোমেইন বদলানো আগের মতোই আপনার লিখিত OK ছাড়া হবে না।

## The rule (CN-027)

1. The build finishes every **Launch** row below first, top to bottom, then carries straight on with the **After launch** list in its existing order (E3 waves, stage by stage, PR by PR). No owner input is needed for either step.
2. Nothing is re-scoped: every PR is built exactly as filed in the register and the blueprint, with its dated "Updated" lines and CN notes.
3. After-launch features ship switched off or hidden until they are built; no half-built page or switch is shown to a customer.
4. The hard rules do not move: no money, price, discount or COD automation and no blocking without the owner, and the main-domain switch only on his explicit go-ahead.
5. Open follow-ups in `PROGRESS.md` keep the CN-016 rule (built before new PRs).
6. Real orders start only when every Launch row is merged and live, the START-HERE go-live gate is met (Blob and Drive backups with a passed restore test, Telegram alerts, every server item), and the CN-013 / CN-017 simulation rerun passes on new.extas.com.bd.
7. A PR whose register row says "Slot" is not itemised in the register; its line here names the blueprint section it is built from. The build itemises it from that section when it gets there.

## Counts

| List | Done | Total | Left |
|---|---:|---:|---:|
| **Launch** | 222 | 305 | **83** |
| **After launch** | 21 | 310 | 289 |
| Active total | 243 | 615 | 372 |

Parked (not counted): S26 handover pack, PR 513–518, and S27 (unnumbered). They stay in the parking lot until the owner says so.

**Launch left, by stage (25 Oct 2026):** S01 1 · S05 1 · S08 15 · S09 2 · S11 14 · S13 1 · S14 7 · S16 9 · S17 1 · S18 9 · S19 17 · S20 1 · S21 3 · S22 2 = 83.

**After launch left, by stage (25 Oct 2026):** S02 13 · S06 14 · S07 2 · S08 5 · S11 8 · S12 22 · S13 34 · S14 17 · S15 48 · S16 13 · S17 23 · S18 5 · S20 8 · S21 11 · S22 11 · S23 7 · S24 38 · S25 10 = 289.

## Launch

Build order, top to bottom. Group A finishes the stages already in progress (S02, S04, S06); then the E3 waves in order: wave 3 money path (S07, S08), wave 4 (S14, S20, S22), wave 5 (S11, S13), wave 6 (S16, S21), wave 8 (S17 CDN item, S18, S19), then the simulation rerun gate and the go-live switch.

| # | PR | Stage | What it does | Status |
|---:|---:|---|---|---|
| 1 | 602 | S02 | Four-layer cache plus invalidation — browser, Cloudflare, server page cache, Redis; purge rules; 15 s stock display with live checks at… *(server spec §5)* | to build (stage in progress) |
| 2 | 558 | S04 | Parameter for Checkout panel — its own dashboard section, mixed with no earlier parameter | to build (stage in progress) |
| 3 | 560 | S04 | Advance-payment checkout mode — for a flagged customer only, and only once he has filled everything in: COD disappears, bKash, Nagad and… | to build (stage in progress) |
| 4 | 161 | S06 | Actions per risk level — watch, hold, confirmation call, delivery charge in advance, full advance, COD off | to build (stage in progress) |
| 5 | 542 | S06 | One-click advance-charge request — from the order itself: SMS, WhatsApp or call, with the payment link and the order's state change, in… | to build (stage in progress) |
| 6 | 502 | S06 | Zone, charge and area admin — the three charge bands, the COD limits, and every area: add, rename, merge, move an area between bands,… | to build (stage in progress) |
| 7 | 519 | S06 | Order Identity Graph — one identity built from phone, name, address, IP and device, so a customer who changes his phone number is still… *(server spec §6 item, A2.9.16)* | to build (stage in progress) |
| 8 | 607 | S09 | ERP contract v6 in the adapter and the mock ERP — typed calls, shop price only, old calls switched off at the switch date, behind `erp.model` (CN-028; 25 Oct 2026) | to build |
| 9 | 608 | S09 | ERP event ledger and webhook receiver v6 — every new event, permanent unique event ids, reversals, hourly pulls (CN-028; 25 Oct 2026) | to build |
| 10 | 609 | S01 | Import from ERP by style code — shop price as the buying price, B-grade listings, price-change flag, selling-price floor (CN-028; 25 Oct 2026) | to build |
| 11 | 610 | S05 | Orders to the ERP, v6 — line ids, whole-taka customer price split, `erpTotal` and `billedAt`, hold and short-stock handling, the packing-check short line (CN-028; 25 Oct 2026) | to build |
| 12 | 165 | S07 | Payment model, states, and the reconciliation fields | to build |
| 13 | 166 | S07 | Cash on Delivery: amount due, rider collection, settlement | to build |
| 14 | 167 | S07 | bKash integration behind the adapter, with the mock | to build |
| 15 | 170 | S07 | Payment callbacks with idempotency keys | to build |
| 16 | 171 | S07 | Wallet: credit, debit, balance, and the ledger behind it | to build |
| 17 | 172 | S07 | Refund to wallet, and the rules for when a refund is allowed | to build |
| 18 | 173 | S07 | Partial payment and advance for pre-orders, capped | to build |
| 19 | 174 | S07 | Payment reconciliation report against the gateway statements | to build |
| 20 | 175 | S08 | Courier adapter framework with the mock | to build |
| 21 | 176 | S08 | Steadfast integration — booking, consignment ID, status polling | to build |
| 22 | 554 | S06 | Courier zone sync — our gazetteer mapped to each courier's own city/zone/area ids, so a booking never fails on an area the courier does not… *(S06; needs the courier adapter 175/176)* | to build |
| 23 | 179 | S08 | Courier sticker — the one fulfilment document, custom size, barcode, COD amount, full item list | to build |
| 24 | 180 | S08 | Sticker print queue, reprint safety, and the handover sheet | to build |
| 25 | 181 | S08 | Daily consolidated picking list PDF | to build |
| 26 | 182 | S08 | Fulfilment page: pick, pack, hand over, all on one screen | to build |
| 27 | 183 | S08 | Defective or out-of-stock at packing: the resolution card and the hold | to build |
| 28 | 184 | S08 | Tracking status sync back to the order and the customer's tracking page | to build |
| 29 | 185 | S08 | Four-tier exchange engine | to build |
| 30 | 187 | S08 | Exchange QC — good or damaged — then restock or write-off | to build |
| 31 | 188 | S08 | Exchange variant switcher: same product, different size | to build |
| 32 | 189 | S08 | Return handling, with the policy that there are no returns after receipt | to build |
| 33 | 190 | S08 | Delivery charge rules for exchanges, and who pays | to build |
| 34 | 191 | S08 | Refused-parcel handling and the exclusion list it feeds | to build |
| 35 | 525 | S08 | True-delivery reconciliation — the courier marks a charge-paid return as "Delivered" | to build |
| 36 | 526 | S08 | Return-reason capture — the rider's note (didn't like it, size didn't fit, not as expected, ordered by mistake) recorded against the… | to build |
| 37 | 611 | S08 | Shipment at pickup and delivery results to the ERP — the "Partial delivery" box and the identification colour (CN-028; 25 Oct 2026) | to build |
| 38 | 612 | S08 | Courier return lists to the ERP — scan at hand-back, counted pieces and condition note, early courier claim (replaces the shop-side quality check) (CN-028; 25 Oct 2026) | to build |
| 39 | 613 | S08 | Returns section — seven tabs, parcel timelines, losses report, courier claims, nightly returns compare with the ERP (CN-028; 25 Oct 2026) | to build |
| 40 | 614 | S08 | Exchange through the ERP — line marking, price-difference consent, stock-first rule, the 4-day return watch, late-return mark (CN-028; 25 Oct 2026) | to build |
| 41 | 284 | S14 | Customer model, merge rules, and the single view by phone number | to build |
| 42 | 285 | S14 | Customers section: list, filters, search | to build |
| 43 | 286 | S14 | Customer detail — orders, exchanges, support history, lifetime value | to build |
| 44 | 291 | S14 | SMS adapter with masking approval, templates, delivery log | to build |
| 45 | 292 | S14 | WhatsApp Business API adapter, templates, delivery log | to build |
| 46 | 298 | S14 | Consent and opt-out handling, honoured across every channel | to build |
| 47 | 505 | S14 | Notification template editor — every SMS, email and WhatsApp template, the auto-replies, and which event sends which message, all… | to build |
| 48 | 407 | S20 | Customer invoice | to build |
| 49 | 425 | S22 | Support core: conversation/message model, threads, attachments, internal notes, assignment, who-replied log | to build |
| 50 | 426 | S22 | Channel connectors: Messenger Page API, WhatsApp Business API webhook in and out, website live-chat widget | to build |
| 51 | 220 | S11 | URL structure and canonical rules — English at /, Bengali at /bn/ behind the translation gate | to build |
| 52 | 221 | S11 | Title and meta description templates per page type, with AI drafting | to build |
| 53 | 222 | S11 | Structured data: Product, Offer, BreadcrumbList, Organization | to build |
| 54 | 227 | S11 | Sub-category SEO content and the filter-page indexing rules — indexed only where it genuinely earns traffic, not every combination… | to build |
| 55 | 228 | S11 | Sitemaps, split by type, with automatic regeneration | to build |
| 56 | 229 | S11 | robots.txt, and the switch for AI crawlers — GPTBot, ClaudeBot, PerplexityBot, Google-Extended | to build |
| 57 | 232 | S11 | Image alt text, auto-applied; English live, Bengali held in the dictionary | to build |
| 58 | 233 | S11 | Search Console and Bing Webmaster connection, with the verification flow | to build |
| 59 | 234 | S11 | Core Web Vitals monitoring against the real field data | to build |
| 60 | 235 | S11 | Redirect manager, and the 404 report with one-click fixes | to build |
| 61 | 236 | S11 | Hreflang and the language alternates | to build |
| 62 | 527 | S11 | Permanent URL policy — no product, category or page URL is ever deleted or allowed to 404 | to build |
| 63 | 586 | S11 | Hash-to-real-URL forwarder — a small script maps every old demo #/… link to its live URL (location.replace), with a test table, so no… *(go-live condition, E3)* | to build |
| 64 | 588 | S11 | Bengali translation gate — per page a "Bengali ready" flag (main content translated and approved) | to build |
| 65 | 257 | S13 | Server-side event tracking — view, add to bag, checkout, purchase *(Tracking & feeds, §13 R9: purchase events from day one)* | to build |
| 66 | 342 | S16 | Slot — money overview: cash received, COD due from couriers, refunds waiting (§5 MNY-01; B3.10) | to build |
| 67 | 343 | S16 | Slot — cost ledger: every paid call writes a cost row; prepaid SMS balance drawn down (B3.9) | to build |
| 68 | 344 | S16 | Slot — retail expenses quick entry; corrections are reversing entries (§5 MNY-04; B3.8, D2) | to build |
| 69 | 345 | S16 | Slot — costs & fees inputs: courier rates, gateway fees, packaging, RTO cost inputs (§5 MNY-06) | to build |
| 70 | 346 | S16 | Slot — month-end close sheet and the monthly expense push to the ERP (§5 MNY-05; B3.9, D2; needed before the first month end) *(before the first month end)* | to build |
| 71 | 615 | S16 | Retail's ERP account ledger and the pipeline stock — append-only entries, payments to the ERP, opening balance (CN-028; 25 Oct 2026) | to build |
| 72 | 616 | S16 | Books match engine — daily, weekly, monthly, yearly and lifetime match with the ERP, differences, month-close gate, explain view (CN-028; 25 Oct 2026) | to build |
| 73 | 617 | S16 | Daily summary to the ERP — 00:30 send, retry queue, `summary.missing`, gap fill, re-send window, categories not yet known, log (CN-028; 25 Oct 2026) | to build |
| 74 | 618 | S16 | Fixed costs and the extra cost lines — salary, rent, utilities, accessories, payment fees (CN-028; 25 Oct 2026) | to build |
| 75 | 413 | S21 | Slot — Site health hub: one status line each for problems, server, speed, audit, smoke (§5 REP-07) | to build |
| 76 | 414 | S21 | Slot — saved browser journeys (customer, admin, accountant, warehouse) replayed on a schedule, AI not needed (B7.3) | to build |
| 77 | 423 | S21 | Site health page with spike alerts | to build |
| 78 | 362 | S17 | Per-store domain, certificate and Cloudflare routing *(server spec §4 CDN item, A2.9.16; the extra store domains still come with S17)* | to build |
| 79 | 378 | S18 | Slot — security headers, CSP, CSRF and rate limits reviewed end to end (B6.1) | to build |
| 80 | 379 | S18 | Slot — invisible bot protection on login and checkout, no CAPTCHA (B6.3) | to build |
| 81 | 380 | S18 | Slot — admin 2FA required, session limits, IP allowlist option, new-login alerts (B6.1, B6.5; §5 SET-04d) | to build |
| 82 | 381 | S18 | Slot — dependency vulnerability scanning in CI and an independent security review before real money flows (B6.1) | to build |
| 83 | 382 | S18 | Slot — privacy and data: consent records, IP/GPS purge job, erasure requests (§5 SET-08d, CUS-07) | to build |
| 84 | 383 | S18 | Slot — legal numbers (DBID, trade licence, BIN) on the store details, and a guard so empty placeholders never reach the live site (§5 SET-01; F2 q27) | to build |
| 85 | 384 | S18 | Slot — policy pages: terms, privacy, exchange, delivery, filled from Smart Rules (§5 SET-03) | to build |
| 86 | 385 | S18 | Slot — immutable backups and the written break-glass restore runbook (B6.1, B6.2) | to build |
| 87 | 386 | S18 | Slot — Cloudflare WAF and DDoS protection in front of the shop (B6.1) | to build |
| 88 | 391 | S19 | Slot — Azure Blob and Google Drive backups switched live with the owner's keys (go-live gate; PR 8) | to build |
| 89 | 392 | S19 | Slot — Telegram alerts live (go-live gate; PR 9) | to build |
| 90 | 393 | S19 | Slot — staging acceptance list (§13 summary) and the Appendix C QA gate green | to build |
| 91 | 394 | S19 | Slot — every server item of A2.9 verified before go-live (A2.9.16) | to build |
| 92 | 395 | S19 | Google Drive backup and restore drills | to build |
| 93 | 396 | S19 | Restoring production: typed confirmation, staging first | to build |
| 94 | 397 | S19 | Slot — Cloudflare Origin certificate, Full (strict) on the main domain (PR 7 scope) | to build |
| 95 | 398 | S19 | Slot — go-live runbook and rollback plan for the domain switch (A1.5) | to build |
| 96 | 399 | S19 | Slot — owner-data check before go-live: legal numbers, contacts, charges entered by the owner (PR 509) | to build |
| 97 | 400 | S19 | Slot — payment, courier and SMS connections moved from mock to live after a passing test (A1.3) | to build |
| 98 | 401 | S19 | Slot — main-domain indexing: sitemap submitted, Search Console on the main domain | to build |
| 99 | 402 | S19 | Slot — first-week watch on the main domain: nightly smoke, alerts, daily check | to build |
| 100 | 403 | S19 | Slot — go-live day: preview password and noindex removed on the main domain only | to build |
| 101 | 507 | S19 | Backup settings and restore drills, Google Drive (with PR 395) | to build |
| 102 | 619 | S19 | Switch-over to the ERP model — switch date, opening balance, old-order list, backfill, the ERP link page (CN-028; 25 Oct 2026) | to build |
| 103 | 621 | S19 | ERP v6 acceptance suite against the demo ERP — the contract checklist and the books drills, run every night (CN-028; 25 Oct 2026) | to build |
| — | gate | CN-013 | **The 70-order real-life journey simulation rerun on new.extas.com.bd** (CN-013, CN-017 findings as acceptance tests, §13); real orders start only after it passes | to run |
| 104 | 587 | S19 | WordPress → new site migration (extas.com.bd) *(go-live day, after the gate)* | to build |

<details><summary>Launch PRs already built (201)</summary>

| PR | Stage | What it does | Status |
|---:|---|---|---|
| 1 | S0A | New VPS (Ubuntu 24.04 LTS): record specs from the owner's screenshot; provider snapshot before any change | live |
| 2 | S0A | OS: no in-place upgrade on the new VPS — verify Ubuntu 24.04 LTS and apply all updates | live |
| 3 | S0A | Base hardening — SSH keys only, no root login, fail2ban, unattended updates, UFW; ports 22/80/443 opened by us | live |
| 4 | S0A | Docker and Docker Compose, with the project's network and volume layout | live |
| 5 | S0A | PostgreSQL tuned for 8 vCPU / 64 GB — connections, shared buffers, work memory, autovacuum | live |
| 6 | S0A | Redis, and BullMQ queues with their dead-letter handling | live |
| 7 | S0A | Caddy with automatic TLS, HTTP/2 and HTTP/3, compression, and the security headers | live |
| 8 | S0A | Nightly encrypted backup of database, uploads and configuration to Google Drive, with one-command restore | live |
| 9 | S0A | Monitoring — uptime, queue depth, error rate, disk and memory, alerting to Telegram | live |
| 10 | S0A | k6 performance baseline, recorded as the number every later change is measured against | live |
| 601 | S0A | NVMe temporary-disk boot unit — format and mount at every boot, folder layout, systemd ordering before services, admin NVMe card and… | live |
| 604 | S0A | Hardware-aware auto profile and run-anywhere — limits from detected CPU and RAM, storage adapter (local / Blob / S3), CDN optional… | live |
| 11 | S00 | Repository, branch rules, commit and PR conventions, PROGRESS.md and BLOCKED.md | live |
| 12 | S00 | Next.js App Router + TypeScript skeleton, Tailwind and the component base | live |
| 13 | S00 | Full Prisma schema in one pass — every table the whole plan needs, including storeId on everything | merged |
| 14 | S00 | Seed data and fixtures: categories, products, colours, sizes, a demo order | merged |
| 15 | S00 | Authentication — customer accounts, admin accounts, sessions, password rules | merged |
| 16 | S00 | Role and permission model: owner, manager, support, auditor (read-only) | merged |
| 17 | S00 | CI — lint, type-check, unit tests, build, and the Lighthouse gate | live |
| 18 | S00 | The adapter framework: every integration has a mock / sandbox / live mode and a test-connection button | merged |
| 491 | S00 | Settings framework — a typed registry, held in the database, cached, every value readable and writable from the admin | merged |
| 492 | S00 | Two-tier resolver — installation level → store level, with inheritance | merged |
| 493 | S00 | Credential vault — every key encrypted at rest, entered from the admin, never in the repository or in Git | merged |
| 494 | S00 | Hardcode guard in CI — the build fails on a hardcoded key, name, number or policy string | merged |
| 495 | S00 | Role builder — the admin creates roles and permissions | merged |
| 496 | S00 | Settings migration — when a new setting ships, every existing installation receives it with its default | merged |
| 500 | S00 | Integrations settings screen — courier, SMS, payment, AI providers, Facebook, Google, YouTube, WhatsApp, Messenger, Telegram, Drive,… | merged |
| 508 | S00 | General default pack — policy shapes, charge structures, category structure, SMS and email template text, AI settings, theme, roles,… | merged |
| 509 | S00 | "My own data" register — the list of values that never ship to a new installation: store name, logo, every API key, phone, address, the… | merged |
| 510 | S00 | "Reset to default" | merged |
| 603 | S00 | Database performance pack — required indexes, pg_trgm, slow query log, slowest-queries page, report materialized views and low-priority… | merged |
| 19 | S01 | Product, variant, colour and size model, with the ERP's SKU as the key | merged |
| 20 | S01 | Category tree with sub-categories, and the per-category garment type | merged |
| 21 | S01 | Product admin — create, edit, publish, unpublish, bulk actions | merged |
| 22 | S01 | Image upload with standardisation: size, aspect, background, naming convention | merged |
| 23 | S01 | Watermark on download only, never on the storefront image | merged |
| 24 | S01 | High-resolution zoom, and the responsive image pipeline | merged |
| 25 | S01 | Minimum four photographs enforced at upload | merged |
| 26 | S01 | Upload-time validation block: missing photos, missing size chart, missing fabric notes | merged |
| 27 | S01 | Size chart system — per garment type, per fit, with the measurement fields | merged |
| 28 | S01 | Size chart admin: create, copy, assign to categories and to single products | merged |
| 29 | S01 | Product health score — what is missing before this product may go live | merged |
| 30 | S01 | Colour library with real hex values, the colour name dictionary, and true-colour reference | merged |
| 31 | S01 | Fabric and care content, structured so it can feed the page and the AI answers | merged |
| 32 | S01 | Collections and tags, including seasonal ones | merged |
| 34 | S01 | Bulk CSV import and export for the catalogue | merged |
| 35 | S01 | Publish queue — nothing reaches the storefront until its checklist passes | merged |
| 36 | S01 | Ghost archive: an out-of-stock product keeps its page and collects back-in-stock interest | merged |
| 37 | S01 | Media library with search, reuse, and orphan cleanup | merged |
| 38 | S01 | "Was" price source per category — MRP, price history or combo — with the honesty rule enforced | merged |
| 39 | S01 | Product audit report: everything incomplete, with a one-click route to fix it | merged |
| 590 | S01 | Product naming and URL control (owner, 19 Oct 12:04) | merged |
| 40 | S02 | Store shell — header, footer, bottom navigation, the slim checkout header | merged |
| 41 | S02 | Home page: hero, categories, new in, sets band, flash sale, reviews, journal | merged |
| 42 | S02 | One smooth slider engine | merged |
| 43 | S02 | Hero slider: 12–15 products across all categories, auto-sizing name-and-price pins | merged |
| 45 | S02 | Category page: grid, breadcrumb, category SEO text block, pagination | merged |
| 46 | S02 | Filter system — colour, size, fit, price band, on-sale, in-stock — with live counts | merged |
| 47 | S02 | Sort control built as a real listbox, never a native select (a phone draws that at the bottom of the screen) | merged |
| 48 | S02 | Sticky filter bar that stays stuck, with the active filters visible while scrolling | merged |
| 49 | S02 | Product page template T1 — gallery left, buy column right | merged |
| 52 | S02 | Template assignment per product and per category, with a preview | merged |
| 53 | S02 | The first-screen budget — PDP_FIT and the measured sizing that guarantees the size row and the measurement line land above the buy bar… | merged |
| 54 | S02 | Gallery: arrows, thumbnail sync, hand swipe, pinch zoom kept working | merged |
| 55 | S02 | Colour swatches, colour name, "All N colours" sheet, and true-colour photograph | merged |
| 56 | S02 | Size pills that fill the width and stay on one line from S to 4XL | merged |
| 57 | S02 | Size chart popup — fixed, not scrolling with the page, with cm and inches inside it | merged |
| 58 | S02 | Find My Size — height and weight to a recommended size, with the reasoning shown | merged |
| 60 | S02 | Stock line, low-stock urgency chip, and sold-out-in-this-colour handling | merged |
| 61 | S02 | Price block: price, discount, saving, free-delivery badge, payment line, all four combinations | merged |
| 62 | S02 | Trust row — exchange window, free delivery threshold, 100% original — reading live from Smart Rules | merged |
| 63 | S02 | Delivery / Exchange / Returns row, opening full width, one at a time | merged |
| 64 | S02 | Fabric & care, and the product detail accordions | merged |
| 65 | S02 | Product reviews on the page: up to three, photo reviews first, sliding | merged |
| 66 | S02 | Questions & answers block, with the WhatsApp ask | merged |
| 67 | S02 | "Goes well with" and "Recently viewed" rows, auto-sliding, category-driven | merged |
| 68 | S02 | The floating action rail — wishlist, share, WhatsApp — drifting with scroll, never over the title | merged |
| 69 | S02 | Share row: transparent floating tiles, Facebook, Messenger, WhatsApp, Instagram, copy link | merged |
| 71 | S02 | Wishlist — add, remove, the wishlist page, and back-in-stock alerts | merged |
| 72 | S02 | Search: the panel, the index across products, categories and help articles, prefix and synonym matching, Bengali keywords | merged |
| 73 | S02 | Search results page with filters and sort | merged |
| 74 | S02 | Hamburger menu with sub-categories — accordion in place, counts per row, "View all" as the first child | merged |
| 75 | S02 | Content pages: FAQ, delivery, exchange, privacy, terms, story, contact | merged |
| 82 | S02 | Four themes, with the token system behind them | merged |
| 84 | S02 | Bengali and English throughout, with the language switch | merged |
| 85 | S02 | Mobile hardening — 16px fields, no accidental zoom, 44px targets, no horizontal overflow, as CI gates | merged |
| 88 | S02 | Storefront performance: image loading, code splitting, the Lighthouse budget | merged |
| 501 | S02 | Branding & appearance from settings — name, logo, favicon, colours, fonts, banners, menu, footer, contact details, social links | merged |
| 503 | S02 | Language framework — both languages live, Bengali per page behind the gate; admin English by default with a Bengali switch | merged |
| 89 | S03 | Combo model: items, set price, savings, active window | merged |
| 90 | S03 | Combo admin — create, edit, activate, with live preview | merged |
| 91 | S03 | Combo page template C1 | merged |
| 93 | S03 | Combo gallery with the per-item colour switcher | merged |
| 94 | S03 | Popular pairs — three across, one tap applies both colours | merged |
| 95 | S03 | Per-item size and colour selection with the "same as item 1" shortcut | merged |
| 96 | S03 | Set summary, set price, and the saving against buying separately | merged |
| 97 | S03 | Add set to bag as one line, with the set price locked | merged |
| 98 | S03 | Build your own set — pick any N, the tier price applies automatically | merged |
| 99 | S03 | Set tier rules from Smart Rules: any 2 for X, any 3 for Y | merged |
| 100 | S03 | The set builder: slots, pick from a sliding row, swap, remove | merged |
| 101 | S03 | Set validation — what is still missing before it can be added | merged |
| 102 | S03 | Combos on the product page: the matching set offer | merged |
| 103 | S03 | "More sets" row, and the sets landing page | merged |
| 571 | S03 | Auto colour-pair combos (the owner's model) | merged |
| 575 | S03 | Set photo standard — the set picture is composed automatically from each piece's photo in the chosen colours (side by side / top + bottom /… | merged |
| 105 | S04 | Cart model, line items, quantities, persistence across sessions | merged |
| 106 | S04 | Add-to-bag sheet: name, size, price, bag count, and what shows when delivery is not free | merged |
| 107 | S04 | Cart page: lines, images, quantity, remove, save for later | merged |
| 108 | S04 | Set lines in the cart, with each piece linking to its own product page | merged |
| 109 | S04 | One offer slot | merged |
| 110 | S04 | The two-sizes-of-the-same-product notice, and the keep-or-change flow | merged |
| 111 | S04 | Order summary with product names, sizes and bold amounts | merged |
| 112 | S04 | Discount code entry, validation, and the better-offer explanation | merged |
| 113 | S04 | Free-delivery progress and what is still needed to reach it | merged |
| 114 | S04 | "Goes well with your bag" upsell row | merged |
| 115 | S04 | Checkout page shell, the steps header, and the mobile summary bar | merged |
| 116 | S04 | Name, phone and address capture with inline validation | merged |
| 117 | S04 | Dhaka address gazetteer — longest match across 140+ areas and 64 districts | merged |
| 118 | S04 | Zone detection with the ask-don't-guess question when confidence is low | merged |
| 119 | S04 | Delivery charge from the zone, shown before the customer types | merged |
| 120 | S04 | Payment method selection: COD, bKash, Nagad, card | merged |
| 121 | S04 | Quantity change and item removal at checkout, with the many-of-one-size guard | merged |
| 122 | S04 | Wallet credit applied at checkout | merged |
| 123 | S04 | Marketing opt-in, default on, with a clear way out | merged |
| 124 | S04 | Confirm button states — what is missing, and that the next step confirms the order | merged |
| 125 | S04 | Order placement, idempotency, and the failure path | merged |
| 126 | S04 | Thank-you page: order number, copy, track, payment due | merged |
| 127 | S04 | "Add to this parcel" — a real order line, visible everywhere the order is shown | merged |
| 128 | S04 | Complete-your-look block on the thank-you page | merged |
| 129 | S04 | Account auto-creation on first order, with the credentials shown once | merged |
| 130 | S04 | Customer login, password change, and the SMS code on a new device | merged |
| 131 | S04 | My account: orders, for you, rewards, wallet, wishlist, profile | merged |
| 132 | S04 | Account offer banner — wallet balance or a standing member offer, never empty | merged |
| 133 | S04 | Profile photo upload, cropped and stored client-side | merged |
| 134 | S04 | Order detail page with the full line list and the add-on items | merged |
| 135 | S04 | Order tracking page, the account welcome panel, and the tracking steps | merged |
| 136 | S04 | Invoice generation and download | merged |
| 137 | S04 | Draft capture and autofill — a started checkout is remembered | merged |
| 561 | S04 | Silent address backfill — a customer who writes only "Road 12, House 42" gets the Inside/Outside Dhaka question, unless his phone number is… | merged |
| 563 | S04 | No order is ever held over an address — an unresolved address, with no Inside/Outside choice made either, still confirms | merged |
| 565 | S04 | Free delivery is exempt — where delivery is free, none of the band machinery shows, corrects or messages | merged |
| 566 | S04 | Support explanation panel — one click gives the agent a summary of why this customer was asked for an advance, and why the delivery… | merged |
| 138 | S05 | Order model, states, and the event timeline | merged |
| 139 | S05 | Append-only audit log on every order change, with who and when | merged |
| 140 | S05 | Admin order list: filters, search, bulk selection | merged |
| 141 | S05 | Order detail for the admin, with the customer's history beside it | merged |
| 142 | S05 | Admin-side order edit, recording the source of every change | merged |
| 143 | S05 | Customer-side order edit until processing starts, capped | merged |
| 144 | S05 | Order cancellation, with reason codes | merged |
| 145 | S05 | Duplicate-order defence — four layers, from the submit guard to the review queue | merged |
| 146 | S05 | Two-size follow-up: the customer ordered S and M, which do they want | merged |
| 147 | S05 | Notes and internal flags on an order | merged |
| 148 | S05 | Order status notifications — SMS, WhatsApp, email — with the no-double-send guard | merged |
| 149 | S05 | Notification log with retries | merged |
| 150 | S05 | Customer dashboard order history and lifecycle | merged |
| 151 | S05 | Order export | merged |
| 152 | S05 | Bulk status change with confirmation | merged |
| 153 | S05 | Hold and release, with the reason visible to support | merged |
| 154 | S05 | Order search by phone, name, order number and tracking number | merged |
| 155 | S05 | Order analytics: by day, by zone, by payment method | merged |
| 541 | S05 | Risk-sectioned order dashboard — the moment an order lands it is scored, marked and placed in its section with a note, so the owner… | merged |
| 546 | S05 | Cancellation notice to the customer — when a duplicate is cancelled, a detailed WhatsApp or SMS explains why, with the tracking link to… | merged |
| 156 | S06 | Risk score model — the signals, their weights and the band thresholds, all set by the owner (answer 1) | merged |
| 157 | S06 | Phone history: past orders, refusals, returns on this number | merged |
| 158 | S06 | Address and zone checks against the gazetteer | merged |
| 159 | S06 | IP, device and GPS signals, with the 180-day deletion rule (answers 4 and 30) | merged |
| 160 | S06 | Risk panel on the order, showing why the score is what it is | merged |
| 549 | S06 | National gazetteer — division → district → upazila/thana → area for the whole of Bangladesh, with Bengali, English and Banglish spellings,… | merged |
| 550 | S06 | Band mapping — one band per area, simple | merged |
| 551 | S06 | Ambiguity resolver — reads the whole line, and waits | merged |
| 552 | S06 | Address autocomplete — type-ahead over the gazetteer, matching Bengali, English and the Banglish people actually type (Gabtali ↔… | merged |
| 553 | S06 | Charge accuracy guard — the delivery charge is never computed from free text, only from a resolved gazetteer entry | merged |
| 555 | S06 | Phone-first recognition at checkout — the customer has given a phone number before he has given anything else | merged |
| 194 | S09 | ERP sync adapter — authentication, retry, and the error surface | merged |
| 195 | S09 | Stock pull from the ERP at SKU / colour / size level | merged |
| 196 | S09 | companyId and warehouse mapping per store | merged |
| 197 | S09 | Global reservation across all three stores | merged |
| 198 | S09 | Reservation with row locking, and release on cart abandon | merged |
| 199 | S09 | Order push to the ERP as a document, never as journal lines | merged |
| 200 | S09 | Idempotency on every ERP push — no duplicate stock movement is possible | merged |
| 201 | S09 | Inventory locations including the damaged bin | merged |
| 202 | S09 | Low-stock alerts, per variant | merged |
| 203 | S09 | Stock audit by barcode, with variance and reason | merged |
| 204 | S09 | Product publishing queue driven by real ERP stock | merged |
| 205 | S09 | Sync health panel: last run, what failed, what is queued | merged |
| 206 | S09 | Manual re-sync and single-product re-sync | merged |
| 207 | S09 | Stock movement report, reconciled against the ERP | merged |
| 497 | S09 | ERP mode switch — EXTAS ERP · another ERP · no ERP | merged |
| 498 | S09 | Generic ERP adapter interface — one contract with mock, sandbox and live modes, so a second ERP is a new adapter and not a rewrite | merged |
| 499 | S09 | ERP-absent guard — every path that depends on the ERP has a defined behaviour when none is connected, proven by tests | merged |
| 208 | S10 | Rules engine: conditions, actions, priority, active window | merged |
| 209 | S10 | Rule admin with a live preview of what the customer will see | merged |
| 210 | S10 | Delivery rules — charges, free-delivery threshold, zones | merged |
| 211 | S10 | Exchange rules — window, who pays, what qualifies | merged |
| 212 | S10 | Set and combo tier rules: any 2 for X, any 3 for Y | merged |
| 213 | S10 | Discount and coupon rules, with the honesty guard on "was" prices | merged |
| 214 | S10 | Festive and seasonal rules, with cut-off dates | merged |
| 215 | S10 | Rule text everywhere reads from the rule | merged |
| 216 | S10 | Notices and pop-up builder, with placement and timing | merged |
| 217 | S10 | Rule conflict detection and the resolution order | merged |
| 218 | S10 | Rule history: what changed, when, and by whom | merged |

</details>

## After launch

Built automatically right after the Launch list, in the existing order: E3 waves 2 → 8, stage by stage, PR number order inside a stage. Each feature stays off or hidden until built.

| # | PR | Stage | What it does | Status |
|---:|---:|---|---|---|
| 1 | 76 | S02 | Page builder — sections, drag order, show/hide, per page | to build |
| 2 | 77 | S02 | Page builder coverage for every storefront page, not only the home page | to build |
| 3 | 78 | S02 | Label dictionary — every visible word editable by the owner, in both languages | to build |
| 4 | 79 | S02 | Front-end editing: open the page, change a label, publish | to build |
| 5 | 80 | S02 | Field-level show and hide — the eye-toggle system, with its defaults | to build |
| 6 | 81 | S02 | The eye-toggle dashboard: every switch in one list, searchable | to build |
| 7 | 83 | S02 | A/B test module for the storefront | to build |
| 8 | 595 | S02 | Page layout builder (home and every category page) | to build |
| 9 | 596 | S02 | Side canvas — the empty left and right gutters on desktop | to build |
| 10 | 597 | S02 | Launch default — save and restore (owner, 19 Oct 19:53) | to build |
| 11 | 598 | S02 | Site builder — the whole site dynamic (owner, 19 Oct 21:23: "like WordPress + Elementor, nothing fixed") | to build |
| 12 | 599 | S02 | In-dashboard help and the handover user manual (owner, 19 Oct 22:14: "no coder needed later; whoever takes over runs the whole site from… | to build |
| 13 | 600 | S02 | On-page edit mode (owner, 19 Oct 22:27–22:33, plan approved 100%) | to build |
| 14 | 572 | S03 | Combo category page — 5 templates — L1 pair grid (the promoted page), L2 one card per style, L3 combo hub with winter/summer tabs, L4… | to build |
| 15 | 573 | S03 | Combo product page — 5 templates — P1 pair page (2 taps to bag), P2 pick-your-colours, P3 top + bottom set, P4 mixed 3-item set, P5… | to build |
| 16 | 574 | S03 | Combo in the bag — 5 templates — B1 grouped card, B2 sizes editable in the bag (default), B3 "add 1 more" inside the card, B4 real item… | to build |
| 17 | 576 | S03 | Combo template test matrix and ranking — set types × 5–6 colours × S–3XL × phone sizes, a 100-point score per template (taps to bag,… | to build |
| 18 | 168 | S07 | Nagad integration behind the adapter, with the mock | to build |
| 19 | 169 | S07 | Card gateway integration behind the adapter, with the mock | to build |
| 20 | 177 | S08 | Second courier integration | to build |
| 21 | 178 | S08 | Courier selection by zone, weight and real cost | to build |
| 22 | 186 | S08 | Exchange request from the customer's account, within the window | to build |
| 23 | 192 | S08 | Courier performance report: on-time rate, refusal rate, by zone | to build |
| 24 | 193 | S08 | Holiday mode — cut-off dates, promised delivery windows, the storefront notice | to build |
| 25 | 564 | S08 | Charge mismatch log — when the courier resolves a different real location than the band the customer was charged for, nothing is changed… | to build |
| 26 | 162 | S06 | Blocklist with reasons and an undo | to build |
| 27 | 163 | S06 | Repeat-refuser handling, reversible by hand — COD off, delivery charge in advance, full advance, or nothing | to build |
| 28 | 164 | S06 | Fraud report: what was caught, what was wrong, and the cost avoided | to build |
| 29 | 520 | S06 | Duplicate & re-order rules engine — scenarios A–E and H–I as separate rules, each with its own window, confidence threshold and action:… | to build |
| 30 | 521 | S06 | Alert summary card — one click on an alert shows why it fired, which earlier orders matched, what the rider wrote, and the customer's… | to build |
| 31 | 522 | S06 | Multi-order bundling — several separate orders from one identity inside a window become one group and one parcel, with a note, instead… | to build |
| 32 | 523 | S06 | Block register, and the proposal that fills it | to build |
| 33 | 524 | S06 | False-positive protection — every rule carries a confidence score and a good-customer override, and a weekly report lists everything the… | to build |
| 34 | 540 | S06 | Approval digest and permission gate — the AI reports and then waits: *"50 orders today | to build |
| 35 | 543 | S06 | Decision learning loop — every approve and decline by the owner and by each employee, with its reason, is taken as training | to build |
| 36 | 544 | S06 | Rule master switches — every fraud and duplicate rule individually switchable from the backend | to build |
| 37 | 545 | S06 | New-customer verification queue — an identity with no history anywhere goes to a phone call, never to a decline | to build |
| 38 | 556 | S06 | In-transit duplicate notice — the moment the phone number identifies an order already on its way with the same product, colour and size,… | to build |
| 39 | 557 | S06 | Duplicate turned into an exchange — same product and colour, different size, earlier one still in transit: that is a size worry, not… | to build |
| 40 | 559 | S06 | Phone-entry risk check — our database and the courier fraud checks queried in the background while the customer keeps typing | to build |
| 41 | 562 | S06 | Flag outcome report — of the customers flagged: how many paid the advance, how many abandoned | to build |
| 42 | 567 | S06 | Multi-courier fraud data — Steadfast's and Pathao's own checks to begin with, and any aggregated source behind the same adapter | to build |
| 43 | 287 | S14 | Segments from real behaviour, saved and reusable | to build |
| 44 | 288 | S14 | Customer journey view: every touch, in order | to build |
| 45 | 289 | S14 | Journey builder — triggers, waits, conditions, messages | to build |
| 46 | 290 | S14 | Email marketing: templates, sends, and the delivery log | to build |
| 47 | 293 | S14 | AI campaign writer — the message drafted in the owner's voice | to build |
| 48 | 294 | S14 | AI segment and timing suggestions, with the reasoning shown | to build |
| 49 | 295 | S14 | Review requests after delivery, and the review manager behind them | to build |
| 50 | 296 | S14 | Rewards and points, with the rules the owner sets | to build |
| 51 | 297 | S14 | Customer tags and internal notes | to build |
| 52 | 299 | S14 | Customer export, with the retention rule applied | to build |
| 53 | 300 | S14 | Win-back campaigns for customers who have stopped ordering | to build |
| 54 | 301 | S14 | Birthday field capture, ready for the parked birthday module | to build |
| 55 | 302 | S14 | Customer data retention: customers are never auto-deleted (answer 50) | to build |
| 56 | 303 | S14 | CRM report: new, returning, churned, by segment | to build |
| 57 | 533 | S14 | Customer history summary at approval — one screen: orders, true deliveries, charge-paid returns and their reasons, refusals, exchanges | to build |
| 58 | 534 | S14 | Customer grading — badges, levels and a verified mark earned from real delivery history, feeding the fraud engine's good-customer override | to build |
| 59 | 535 | S14 | Legacy customer import — the existing business's order list brought in, de-duplicated, matched against new customers, so the shop opens… | to build |
| 60 | 404 | S20 | Slot — print run page: queue preview, printer size, reprints flagged (§5 ORD-04a) | to build |
| 61 | 405 | S20 | Slot — picking list page (§5 ORD-04b) | to build |
| 62 | 406 | S20 | Slot — handover sheet page per courier (§5 ORD-04c) | to build |
| 63 | 408 | S20 | Slot — printed accounting and print quality rules (B2.4) | to build |
| 64 | 409 | S20 | Invoice template editor — every word and block editable | to build |
| 65 | 410 | S20 | Slot — fulfilment & documents scope (B1.3–B2.4) | to build |
| 66 | 411 | S20 | Slot — fulfilment & documents scope (B1.3–B2.4) | to build |
| 67 | 412 | S20 | Slot — fulfilment & documents scope (B1.3–B2.4) | to build |
| 68 | 427 | S22 | Identity resolution: phone ↔ PSID ↔ customer matching, merge one person across channels | to build |
| 69 | 428 | S22 | Customer context panel: order count, delivered/returned ratio, fraud score, live order status | to build |
| 70 | 429 | S22 | Catalogue drawer: search, send photos, send tracked product link | to build |
| 71 | 430 | S22 | Mini-cart and one-click order creation with channel tag, stock check and fraud gate | to build |
| 72 | 431 | S22 | Ticketing: status, owner, SLA timers, resolution time, notifications | to build |
| 73 | 432 | S22 | AI support agent: answers from Smart Rules, the manual and order data; drafts; handover rules | to build |
| 74 | 433 | S22 | AI follow-up and conversion: no-order follow-up, offers, win-back, rule-capped | to build |
| 75 | 434 | S22 | Block list, employee permissions, customer data privacy inside support | to build |
| 76 | 435 | S22 | Support PWA: installable, support-only shell, push notifications | to build |
| 77 | 436 | S22 | Support analytics: per employee, per channel, chat → order, first-response and resolution time | to build |
| 78 | 538 | S22 | S22 addition — support scope of the 18 Oct round (B4); SIM-F-012 acceptance test | to build |
| 79 | 223 | S11 | Review schema emitted only from real review rows | to build |
| 80 | 224 | S11 | FAQ content from the real questions on the page, for customers and AI answers | to build |
| 81 | 225 | S11 | Product page content architecture — server-rendered accordions that search engines can read | to build |
| 82 | 226 | S11 | Category SEO content block, per category | to build |
| 83 | 230 | S11 | Answer-engine pack — the content shape that gets quoted by AI assistants | to build |
| 84 | 231 | S11 | Internal linking engine: related products, related categories, related articles | to build |
| 85 | 237 | S11 | SEO health dashboard: what is missing, page by page | to build |
| 86 | 238 | S11 | Organic performance report — traffic, position, and which AI assistants are citing the shop | to build |
| 87 | 239 | S12 | Article model, categories, authors, publish states | to build |
| 88 | 240 | S12 | Blog admin with the editor and the preview | to build |
| 89 | 241 | S12 | Blog listing and article pages, with the related-product block | to build |
| 90 | 242 | S12 | Topical cluster planner — which articles to write, and how they link | to build |
| 91 | 243 | S12 | AI article drafting from the PR 528 brief, in either language, per post (answer 11) | to build |
| 92 | 244 | S12 | Approval queue — the owner approves the topic list (monthly batch), not each post | to build |
| 93 | 245 | S12 | Article scheduling and the publish calendar | to build |
| 94 | 246 | S12 | Seasonal landing pages — Eid, winter, Puja — permanent and re-used each year | to build |
| 95 | 247 | S12 | Help articles as structured content: delivery, exchange, returns, payment | to build |
| 96 | 248 | S12 | Help articles indexed into search | to build |
| 97 | 249 | S12 | Article SEO: schema, meta, internal links | to build |
| 98 | 250 | S12 | Content performance report: which articles bring traffic and which bring orders | to build |
| 99 | 251 | S12 | Comment handling, or the decision to run without comments | to build |
| 100 | 252 | S12 | Content calendar shared with the social studio | to build |
| 101 | 253 | S12 | Article-to-product attribution: what an article actually sold | to build |
| 102 | 528 | S12 | Blog brief form — word count, keywords, topic and language chosen before a single word is written | to build |
| 103 | 529 | S12 | Source-link research writer — give it a link to an article anywhere in the world | to build |
| 104 | 530 | S12 | Seasonal page lifecycle — archived and live are states, never deletion | to build |
| 105 | 547 | S12 | Image sourcing for the blog — the owner's own product photographs first, then free-licence libraries the AI may draw on by itself | to build |
| 106 | 591 | S12 | Blog content pipeline (owner, 19 Oct 12:10–12:14) | to build |
| 107 | 592 | S12 | Blog as a complete, standard section of the shop, with our own ad placements (owner, 19 Oct 12:20) | to build |
| 108 | 593 | S12 | Blog writing team — five author agents under Doot (A360-06, head of content) | to build |
| 109 | 254 | S13 | Landing page builder — sections, templates, publish, per campaign | to build |
| 110 | 255 | S13 | Landing page templates and the component library | to build |
| 111 | 256 | S13 | Campaign model: audience, offer, creative, window, budget | to build |
| 112 | 258 | S13 | Delivered-purchase optimisation — the event that matters is delivery, not order | to build |
| 113 | 259 | S13 | Facebook and Instagram ads integration behind the adapter | to build |
| 114 | 260 | S13 | TikTok ads integration behind the adapter | to build |
| 115 | 261 | S13 | Google ads integration behind the adapter | to build |
| 116 | 262 | S13 | Audience Builder — segments from real order behaviour | to build |
| 117 | 263 | S13 | Value-based lookalike audiences from delivered revenue | to build |
| 118 | 264 | S13 | Refused-parcel exclusion list | to build |
| 119 | 265 | S13 | Ad spend import, per platform, per campaign | to build |
| 120 | 266 | S13 | USD rate as a setting | to build |
| 121 | 267 | S13 | Cost per order, cost per delivered order, and alert thresholds the owner sets from the dashboard (answer 19) | to build |
| 122 | 268 | S13 | Pause and budget change from the dashboard, with a confirm step — extended by PR 531 to full campaign control | to build |
| 123 | 269 | S13 | AI growth agent — reads performance, proposes changes, waits for approval | to build |
| 124 | 270 | S13 | Ad creative briefs generated from the product and the campaign | to build |
| 125 | 271 | S13 | Coupon engine, fully dynamic — percentage, fixed taka, free delivery, buy-one-get-one, buy-two-get-five, and offer shapes invented later… | to build |
| 126 | 272 | S13 | Coupon distribution, limits, and per-customer caps | to build |
| 127 | 273 | S13 | Referral programme | to build |
| 128 | 274 | S13 | Incomplete-order capture — the details typed before the order was placed | to build |
| 129 | 275 | S13 | Incomplete-order follow-up, capped at two messages | to build |
| 130 | 276 | S13 | Abandoned-cart recovery with the offer rules | to build |
| 131 | 277 | S13 | Campaign blast — SMS, WhatsApp, email — with the audience and the throttle | to build |
| 132 | 278 | S13 | YouTube module — channel, videos, and the attribution back to orders | to build |
| 133 | 279 | S13 | SEO outreach pipeline | to build |
| 134 | 280 | S13 | Seasonal homepage switching, scheduled | to build |
| 135 | 281 | S13 | Festive cut-off banners and the delivery promise | to build |
| 136 | 282 | S13 | Marketing calendar across ads, content and social | to build |
| 137 | 283 | S13 | Marketing report: spend, revenue, by channel, by campaign | to build |
| 138 | 531 | S13 | Full campaign control from the dashboard | to build |
| 139 | 532 | S13 | Deep conversion feed — server-side events enriched with the courier outcome and the visitor's intent, pushed to every platform, so the shop… | to build |
| 140 | 548 | S13 | Market and competitor intelligence — the owner supplies links to large pages in his market | to build |
| 141 | 569 | S13 | Geography-led ad guidance — the shop knows where parcels are actually *delivered and paid for*, district by district | to build |
| 142 | 589 | S13 | Merchant Center feed + Bangladesh test | to build |
| 143 | 437 | S23 | Studio core — brand asset library, templates, rules (part 1) | to build |
| 144 | 438 | S23 | Studio core — brand asset library, templates, rules (part 2) | to build |
| 145 | 439 | S23 | Video assembly engine — reels, shorts, image posts | to build |
| 146 | 440 | S23 | Publishing adapters — Facebook Page, Instagram feed/reel/story (part 1) | to build |
| 147 | 441 | S23 | Publishing adapters — TikTok draft + direct, YouTube (part 2) | to build |
| 148 | 442 | S23 | Content calendar, approval queue, auto-schedule rules, per-platform limits | to build |
| 149 | 443 | S23 | Comment and DM ingestion from Facebook, Instagram and TikTok into the Support Inbox | to build |
| 150 | 304 | S15 | AI 360 home screen — what is running, what it cost, what it decided | to build |
| 151 | 305 | S15 | Master switch | to build |
| 152 | 306 | S15 | Multi-provider adapter: Anthropic, OpenAI, Google, OpenRouter, all dynamic | to build |
| 153 | 307 | S15 | Per-agent model selection, with the recommendation note beside each | to build |
| 154 | 308 | S15 | Per-agent schedule | to build |
| 155 | 309 | S15 | Per-agent monthly spend cap | to build |
| 156 | 310 | S15 | Data-class routing — which class of data may reach which class of model | to build |
| 157 | 311 | S15 | The masking layer applied before anything leaves the server | to build |
| 158 | 312 | S15 | AI Cost Book — 60–90 job rows, searchable, with the model selector in the row | to build |
| 159 | 313 | S15 | Estimate versus actual, and the self-correction that follows | to build |
| 160 | 314 | S15 | What-if slider, and the Economy / Balanced / Premium presets | to build |
| 161 | 315 | S15 | One shared usage ledger behind every figure | to build |
| 162 | 316 | S15 | Free-form cost calculator | to build |
| 163 | 317 | S15 | The single approval queue — everything waiting on the owner, in one place | to build |
| 164 | 318 | S15 | Permission matrix: what each agent may decide alone | to build |
| 165 | 319 | S15 | AI diary — what each agent did, why, and what it changed | to build |
| 166 | 320 | S15 | Bug box: the agent reports what it could not do | to build |
| 167 | 321 | S15 | Skill library — import a skill, version it, roll it back | to build |
| 168 | 322 | S15 | Skill sandbox: try a skill on real data without touching production | to build |
| 169 | 323 | S15 | Continuous skill training — corrections become training examples | to build |
| 170 | 324 | S15 | AI-off fallback: every agent has a rule or template path that works without AI | to build |
| 171 | 325 | S15 | Support AI agent wiring | to build |
| 172 | 326 | S15 | Product content AI agent | to build |
| 173 | 327 | S15 | SEO and meta AI agent | to build |
| 174 | 328 | S15 | Size advice AI agent | to build |
| 175 | 329 | S15 | Fraud review AI agent | to build |
| 176 | 330 | S15 | Growth marketing AI agent | to build |
| 177 | 331 | S15 | Social content AI agent | to build |
| 178 | 332 | S15 | Photoshoot studio AI orchestration | to build |
| 179 | 333 | S15 | Analytics commentary agent — explains the numbers, never invents one | to build |
| 180 | 334 | S15 | System Q&A agent — the owner asks the system how it works | to build |
| 181 | 335 | S15 | Competitor Teardown agent — journey walker | to build |
| 182 | 336 | S15 | Competitor comparison and report engine | to build |
| 183 | 337 | S15 | Saved competitors, scheduling, and change alerts | to build |
| 184 | 338 | S15 | Site-wide analytics event layer | to build |
| 185 | 339 | S15 | Per-page funnels built on that layer | to build |
| 186 | 340 | S15 | The report section: what happened, what changed, what to do | to build |
| 187 | 341 | S15 | Weekly and monthly digests to Telegram and email | to build |
| 188 | 506 | S15 | AI-off proof — the whole site works with AI off | to build |
| 189 | 577 | S15 | Agent 360° profiles — each of the six fixed agents (প্রহরী Prohori, ভান্ডারী Bhandari, সওদাগর Sawdagor, শিল্পী Shilpi, দূত Doot, জ্ঞানী… | to build |
| 190 | 578 | S15 | Agent appraisal reports — daily, weekly, monthly and yearly reports per agent, written like an employee's: what it did, what it left… | to build |
| 191 | 579 | S15 | Agent curriculum and certification — each agent's field is taught as a degree path (graduate → post-graduate → PhD level) from… | to build |
| 192 | 580 | S15 | Model auto-suggest with free-model qualification | to build |
| 193 | 581 | S15 | তীরন্দাজ Tirondaj — the seventh agent, ads specialist | to build |
| 194 | 582 | S15 | Strong agent memory — every agent gets a long-term memory store inside the system (facts, decisions, owner instructions, past… | to build |
| 195 | 583 | S15 | Chief agent — জ্ঞানী Gyani as virtual CEO (প্রধান এজেন্ট), chain of command | to build |
| 196 | 584 | S15 | Telegram identity and command routing | to build |
| 197 | 585 | S15 | Continuous learning engine — Tirondaj (ads) and Doot (SEO/marketing) are the two power agents | to build |
| 198 | 347 | S16 | Slot — Costs section: by day, month, year, service and module, with export (B3.9) | to build |
| 199 | 348 | S16 | Slot — per-order cost allocation feeding the per-order profit figure (B3.9) | to build |
| 200 | 349 | S16 | Slot — money reporting: profit views on the money registry (B3.10) | to build |
| 201 | 350 | S16 | Slot — VAT system, per product and category, present and off (B3.10, answer 23) | to build |
| 202 | 351 | S16 | Slot — report frequency and the daily money report time set by the owner (B3.10, answer 24) | to build |
| 203 | 352 | S16 | Slot — staff performance badges, off by default (B3.10, answer 25) | to build |
| 204 | 353 | S16 | Slot — finance, costs & reports scope (B3.8–B3.10) | to build |
| 205 | 354 | S16 | Slot — finance, costs & reports scope (B3.8–B3.10) | to build |
| 206 | 355 | S16 | Slot — finance, costs & reports scope (B3.8–B3.10) | to build |
| 207 | 504 | S16 | S16 addition — profit per order with ad spend apportioned, by category and by style (B3.10 V2) | to build |
| 208 | 536 | S16 | S16 addition — expenses entered in the shop and later sent to the ERP (B3.10 V2) | to build |
| 209 | 537 | S16 | S16 addition — VAT and reporting additions of the 18 Oct round (B3.10 V2) | to build |
| 210 | 568 | S16 | Product and category sales by district and upazila | to build |
| 211 | 415 | S21 | Slot — customer problems found automatically, privacy-safe (CN-015) | to build |
| 212 | 416 | S21 | Slot — UI checks at phone and desktop widths in the scheduled runs (B7.3) | to build |
| 213 | 417 | S21 | Slot — speed page: monthly LCP, CLS, INP, TTFB vs targets (§5 REP-07c) | to build |
| 214 | 418 | S21 | Slot — smoke runs page (§5 REP-07e) | to build |
| 215 | 419 | S21 | Slot — run history: every run stored with what passed and failed (B7.3) | to build |
| 216 | 420 | S21 | Approval gate for agent auto-fixes and new skills | to build |
| 217 | 421 | S21 | Slot — site health & audit scope (B7.3) | to build |
| 218 | 422 | S21 | Slot — site health & audit scope (B7.3) | to build |
| 219 | 424 | S21 | Slot — site health & audit scope (B7.3) | to build |
| 220 | 570 | S21 | Checklist audit runner in the AI section | to build |
| 221 | 594 | S21 | PR register inside the backend (owner, 19 Oct 14:59) | to build |
| 222 | 444 | S24 | Asset model, role taxonomy, immutable originals, generated kept separate | to build |
| 223 | 445 | S24 | Model library with consent records | to build |
| 224 | 446 | S24 | Ghost-mannequin engine | to build |
| 225 | 447 | S24 | Garment prep and standardisation (cut-out, colour, canvas) | to build |
| 226 | 448 | S24 | Reference analysis and recommendation | to build |
| 227 | 449 | S24 | Provider adapter (FASHN + one other) — part 1 | to build |
| 228 | 450 | S24 | Provider adapter — part 2 (estimate, generate, status, fetch) | to build |
| 229 | 451 | S24 | Job orchestration: queue, state machine, idempotency — part 1 | to build |
| 230 | 452 | S24 | Job orchestration: per-view retry, concurrency, spend caps — part 2 | to build |
| 231 | 453 | S24 | Best-of-2 plus automatic scoring | to build |
| 232 | 454 | S24 | Detail re-projection for logos and prints | to build |
| 233 | 455 | S24 | Finishing pass (upscale, artifact repair) — part 1 | to build |
| 234 | 456 | S24 | Finishing pass (contact shadow, grade, sharpen) — part 2 | to build |
| 235 | 457 | S24 | In-admin image editor | to build |
| 236 | 458 | S24 | Review and approval UI with side-by-side and reasons | to build |
| 237 | 459 | S24 | Cost ledger, estimates, caps, reuse rules | to build |
| 238 | 460 | S24 | Recommendation-note system | to build |
| 239 | 461 | S24 | Front-end gallery, angle switcher, zoom, disclosure line | to build |
| 240 | 462 | S24 | Pilot harness and metrics (cost per approved image, first-pass rate) plus live A/B | to build |
| 241 | 463 | S24 | Detail finder — part 1 | to build |
| 242 | 464 | S24 | Detail finder — part 2 | to build |
| 243 | 465 | S24 | Footwear / product-only studio — part 1 | to build |
| 244 | 466 | S24 | Footwear / product-only studio — part 2 | to build |
| 245 | 467 | S24 | Download-watermark pipeline | to build |
| 246 | 468 | S24 | AI 360 wiring and Cost Book rows for every photoshoot sub-job | to build |
| 247 | 469 | S24 | Category recipe framework with the 13 recipes — part 1 | to build |
| 248 | 470 | S24 | Category recipe framework — part 2 | to build |
| 249 | 471 | S24 | Worn-accessory engine (caps, sunglasses, watches, carried bags) — part 1 | to build |
| 250 | 472 | S24 | Worn-accessory engine — part 2 | to build |
| 251 | 473 | S24 | Reflective and transparent product handling | to build |
| 252 | 474 | S24 | Ladies, kids and part-model libraries with styling guidelines | to build |
| 253 | 475 | S24 | Combo and gift-set composition studio | to build |
| 254 | 476 | S24 | Scene library | to build |
| 255 | 477 | S24 | Set product type and two-garment try-on — part 1 | to build |
| 256 | 478 | S24 | Set product type and two-garment try-on — part 2 | to build |
| 257 | 479 | S24 | Unisex / couple composition | to build |
| 258 | 480 | S24 | Occasion scene suggester with previews and approval | to build |
| 259 | 539 | S24 | S24 addition — virtual photoshoot scope (C7) | to build |
| 260 | 481 | S25 | Action / motion library | to build |
| 261 | 482 | S25 | Image-to-video engine with provider adapter and best-of-2 — part 1 | to build |
| 262 | 483 | S25 | Image-to-video engine — part 2 | to build |
| 263 | 484 | S25 | Image-to-video engine — part 3 | to build |
| 264 | 485 | S25 | Reel assembly with music, text, logo and aspect variants — part 1 | to build |
| 265 | 486 | S25 | Reel assembly — part 2 | to build |
| 266 | 487 | S25 | Campaign creative export — part 1 | to build |
| 267 | 488 | S25 | Campaign creative export — part 2 | to build |
| 268 | 489 | S25 | Campaign overlay system — page-level and time-bound | to build |
| 269 | 490 | S25 | Campaign creative brief and three-direction grooming flow | to build |
| 270 | 356 | S17 | Store entity and query scoping | to build |
| 271 | 357 | S17 | Store switcher | to build |
| 272 | 358 | S17 | Shared vs separate settings | to build |
| 273 | 359 | S17 | Combined all-stores view | to build |
| 274 | 360 | S17 | Isolation tests | to build |
| 275 | 361 | S17 | Per-store brand, theme, templates and page layouts | to build |
| 276 | 363 | S17 | Per-store ERP mapping to companyId and warehouse | to build |
| 277 | 364 | S17 | Per-store product listing and stock visibility | to build |
| 278 | 365 | S17 | Per-store payment, courier and SMS accounts | to build |
| 279 | 366 | S17 | Per-store WhatsApp, Facebook and support-inbox routing | to build |
| 280 | 367 | S17 | Per-store ad accounts, attribution and campaign separation | to build |
| 281 | 368 | S17 | Per-store SEO with cross-store duplicate-content detection | to build |
| 282 | 369 | S17 | Per-store AI 360 scoping, switches and cost attribution | to build |
| 283 | 370 | S17 | Theme engine with template sets, component variants and typography packs | to build |
| 284 | 371 | S17 | Store #2 complete theme build | to build |
| 285 | 372 | S17 | Store #3 complete theme build | to build |
| 286 | 373 | S17 | Per-store Studio identity (model roster, scene style, photo grade) | to build |
| 287 | 374 | S17 | Per-store AI copy voice and brand tone profile | to build |
| 288 | 375 | S17 | Cross-store sameness guard for look, copy and SEO | to build |
| 289 | 376 | S17 | "Add store" wizard with domain connection, Cloudflare and certificate automation | to build |
| 290 | 377 | S17 | Multi-store item from UI/UX round 1 (§41.24) | to build |
| 291 | 511 | S17 | Multi-store scope slot (A4) | to build |
| 292 | 512 | S17 | Multi-store scope slot (A4) | to build |
| 293 | 387 | S18 | Slot — the user manual: every menu, section and button, What · Why · How (B7.5) | to build |
| 294 | 388 | S18 | Slot — user manual screenshots with numbered marks (B7.5) | to build |
| 295 | 389 | S18 | Slot — user manual search and "What's new" (B7.5; §5 HLP-01) | to build |
| 296 | 390 | S18 | Slot — user manual copy kept with the blueprint documents (B7.5) | to build |
| 297 | 620 | S18 | Signed calls from the ERP to the shop — top products and customers on click (CN-028; 25 Oct 2026) | to build |

<details><summary>After-launch PRs already built (13; they stay as they are)</summary>

| PR | Stage | What it does | Status |
|---:|---|---|---|
| 33 | S01 | Product import from a link — read a supplier or brand page, draft the product | merged |
| 44 | S02 | Flash sale: two rows sliding in opposite directions, with a countdown that actually ticks | merged |
| 50 | S02 | Product page template T2 — stacked gallery | merged |
| 51 | S02 | Product page template T3 — fit-first | merged |
| 59 | S02 | Find My Size training engine — the chart data, the ease model, and the admin report | merged |
| 70 | S02 | Site-wide floating WhatsApp button — replaced 19 Oct by the header icon; kept as a switch, off | merged |
| 86 | S02 | The light-sweep system and its per-element switches | merged |
| 87 | S02 | Celebration overlay on order placement | merged |
| 92 | S03 | Combo page template C2 — step by step | merged |
| 104 | S03 | Combo analytics: which sets sell, which pairs get picked | merged |
| 605 | S04 | Gift mode — receiver name and phone, hide prices on the invoice, a gift note, a "deliver on or after" date; off by default (CN-014 h, 23… | merged |
| 606 | S04 | Bulk / corporate lane — enquiry from the cart, quote and order flow; minimum quantity, logo price and advance as settings, off by… | merged |
| 219 | S10 | Rule simulation: what would this order have cost under the new rule | merged |

</details>

## After launch: priority order (CN-031)

Once every Launch row is merged and live, the build carries straight on with these stage groups, in this order, one after the other, never waiting. Inside a stage the PR number order stays. After each group a short whole-site review runs (CN-031 § 4).

| Order | Stages | Why first | Left |
|---:|---|---|---:|
| 1 | S07 payments (2), S08 courier, returns, exchange (5), S06 fraud and location (14) | Money in and out, parcels and the duplicate / fake COD losses | 21 |
| 2 | S18 compliance (5), S21 site health (11), S16 finance (13), S20 fulfilment and documents (8) | The site stays safe, the books close, daily packing and invoices run | 37 |
| 3 | S22 support (11), S14 CRM (17) | Customers get answers, repeat buyers are known | 28 |
| 4 | S13 marketing and ads (34), S11 SEO (8), S12 content and blog (22) | Cheaper traffic and more orders | 64 |
| 5 | S02 storefront extras (13) | Page builder, more templates, polish | 13 |
| 6 | S17 multi-store (23) | The second and third shop on the same stock | 23 |
| 7 | S15 AI control room (48) | AI agents and skills, always off until the owner turns them on | 48 |
| 8 | S23 social studio (7), S25 video studio (10), S24 photoshoot studio (38) | Creative studios | 55 |

Total 289 (as of 31 Oct 2026); the table above is the order, the "Left" counts move as PRs are built.

## Launch lanes (CN-031)

The 46 open Launch rows are built by three builders at the same time on their own git worktrees; `qa-gate` reviews in batches.

| Lane | Rows | Notes |
|---|---|---|
| A · reach and growth | 426; 227, 228, 229, 232, 233, 234, 235, 236, 527, 586, 588; 257 | Redirects and permanent URLs (235, 527, 586) first, because the main-domain switch needs them |
| B · safety and health | 378–386; 362; 413, 414, 423 | Security before the go-live checks that depend on it |
| C · money and go-live | 342–346; 391–403, 507; then 587 after the gate | Drive backup (CN-030) and Telegram alerts early; 399 and 403 are the owner's steps, written as BLOCKED items without stopping the lane |

## Why these are After launch

- **CN-022 Q1:** AI agents and skills (S15), full ads control (S13 except server-side purchase events), the studios (S23, S24, S25) are not go-live gates.
- **Extra designs and builders:** page and site builders, eye-toggles, on-page editing, side canvas, A/B tests (S02 76–81, 83, 595–600) and the extra combo templates 572–574, 576 (C1, the set builder and the default bag set line are built). Texts already come from settings.
- **One of each is enough to open safely:** one courier (Steadfast, 176) and one wallet gateway (bKash, 167); Nagad, card and the second courier come right after, switched off until then.
- **Risk:** the score, panel, sections, actions per level, advance request, advance checkout and the identity graph are Launch; the extra duplicate scenarios, digests, learning loop and outside fraud data come after. Nothing ever auto-blocks.
- **Reports and growth:** blog, loyalty, referrals, segments, win-back, competitor tools, multi-store and advanced reports.

## Sources

`docs/BACKEND-ARCHITECTURE.md` §13 ("Before real orders?" and "Must exist before the first real order") · `docs/START-HERE.md` "Go-live gate" · Blueprint E3 (go-live conditions), A2.9.16 (every server item before go-live) · CN-013, CN-016, CN-017, CN-022 Q1.
