# docs/ — index

> **বাংলায় সংক্ষেপে:** `docs` ফোল্ডারে কোন কাগজ কী কাজের, এক লাইনে। সবচেয়ে দরকারি তিনটা: `BLUEPRINT.md` (পুরো
> নির্দেশনা), `MASTER-REGISTER.md` (সব PR আর কোনটা কতদূর), আর ডেমো `demo/EXTAS-demo-V12.4.html` (দোকান দেখতে কেমন হবে)।

Every file and folder in `docs/`, one line each. Large tool and skill folders are listed by folder. The repository's
front page is [`../README.md`](../README.md). This index is updated in the same PR that adds, moves or removes a
docs file (CN-011).

## Top level

| [`BACKEND-ARCHITECTURE.md`](BACKEND-ARCHITECTURE.md) | **Approved (CN-022)** backend and admin architecture: 14 sections, page tree, state machines, ERP syncs, KPI registry, jobs, audit, roadmap |
| [`ADMIN-ARCHITECTURE.md`](ADMIN-ARCHITECTURE.md) | The admin layout: 13 sections, 81 tabs, feature map (CN-018/019); mock-ups in `owner/admin-arch/` |
| File | What it is |
|---|---|
| [`BLUEPRINT.md`](BLUEPRINT.md) | The full build specification, V2.1 final, with every change note (CN-###) as a dated block; read it from here |
| [`MASTER-REGISTER.md`](MASTER-REGISTER.md) | All 624 PRs in 28 stages (618 active, 6 parked): the Build status table (merged / live), change notes, the stage table, the parking lot, PR rows for S0A–S15 (S16–S25 rows are in Blueprint Appendix A) |
| [`START-HERE.md`](START-HERE.md) | How every build session runs: reading order, build order, the gates, speed targets, the go-live gate |
| [`LAUNCH-TRACK.md`](LAUNCH-TRACK.md) | **The build order (CN-027):** the Launch list (what real orders need, built first) and the After-launch list (built automatically right after), with counts and status per PR |
| [`CONVENTIONS.md`](CONVENTIONS.md) | Branches, PR titles, commits, what to update after every PR, code mechanics (PR 11) |
| [`ERP-API-CONTRACT.md`](ERP-API-CONTRACT.md) | The ERP ↔ shop API: security, endpoints under `/api/v1/ecommerce`, webhooks, rules (CN-005) |
| [`RETAIL-ERP-MODEL.md`](RETAIL-ERP-MODEL.md) | **CN-028 (25 Oct 2026)** — Retail as the ERP's separate buyer: who keeps which books, the two ledgers, the day/week/month/year/lifetime match engine, exchange and return flow, hold, switch-over, settings, permissions and requests to the ERP (supersedes the parts of the ERP sync that CN-028 names) |
| [`erp/`](erp/) | The ERP project's own contract text, kept as received: `site-changes-v5.md` (history) and `site-changes-v6.md` (controlling) |
| [`golive/ACCEPTANCE.md`](golive/ACCEPTANCE.md) | The staging acceptance list walked before real orders (PR 393); confirmed on Settings → System → Go-live |
| [`golive/RUNBOOK.md`](golive/RUNBOOK.md) | The go-live runbook and rollback plan for the main-domain switch (PR 398); rehearsed and confirmed on Settings → System → Go-live |
| [`SERVER.md`](SERVER.md) | The server in plain Bengali: what runs, the three disks, restart, RAM/CPU split, alerts, restore, where to see status (PR 10 runbook) |
| [`README.md`](README.md) | This index |

## `agents/` — the seven fixed agents (PR 577–585)

| Path | What it is |
|---|---|
| [`admin-guide/README.md`](admin-guide/README.md) | Bengali guide per admin section (CN-014), the index |
| `admin-guide/pages/<section>/` | One Bengali guide per built admin page in six fixed parts, plus `index.md` per section (the section overview); opened from the admin top bar's guide icon; CI fails on a built page without one (`tools/admin-guide-check.mjs`; PR 594, CN-026) |
| `MANUAL.md` (on the server only) | The Site manual in one Markdown file (PR 390): made on every deploy in the server's copy of `docs/` by `infra/deploy/manual-md.sh` (from `docs-sync.sh`), beside `BLUEPRINT.md`; in every backup's docs bundle and downloadable from Help › Site manual. Never committed |
| [`admin-guide/marks.json`](admin-guide/marks.json) | The Site manual's pictures (PR 388): which page guide gets a screenshot and which parts of the page get numbered marks; the smoke test takes them and writes `reports/smoke/latest/marks.json` |
| [`admin-guide/dashboard.md`](admin-guide/dashboard.md) | The Dashboard: ~~Sales and Ordered value tiles, Needs you now~~ the V12.4 default design (delivered-sales story, where orders are now, four cards, Money & marketing), role start pages (`/admin`, PR 12, 155, 495) |
| [`admin-guide/admin-look.md`](admin-guide/admin-look.md) | Settings → Admin look: page designs and where the guide opens (`/admin/settings/look`, PR 12, CN-025, CN-026) |
| [`admin-guide/HOW-TO-ADD-A-DESIGN.md`](admin-guide/HOW-TO-ADD-A-DESIGN.md) | How to add a design to an admin page: `pnpm admin:design <page> <KEY>` (English, Bengali summary; PR 12, CN-025) |
| [`admin-guide/delivery.md`](admin-guide/delivery.md) | Delivery areas and charges (`/admin/delivery/zones`, moved from `/admin/delivery` in PR 12; S06) |
| [`admin-guide/login.md`](admin-guide/login.md) | Admin sign-in and the admin shell: 14 sections, search, notifications, guide panel (`/admin/login`, S00; PR 12) |
| [`admin-guide/integrations.md`](admin-guide/integrations.md) | Keys & connections (`/admin/integrations`, S00, S09) |
| [`admin-guide/products.md`](admin-guide/products.md) | Products: list, new, edit, publish queue, import from a link, audit, back in stock (`/admin/products/*`, S01) |
| [`admin-guide/size-charts.md`](admin-guide/size-charts.md) | Size charts (`/admin/size-charts`, S01) |
| [`admin-guide/stock.md`](admin-guide/stock.md) | Stock and ERP sync, stock counts, movements (`/admin/stock/*`, S09) |
| [`admin-guide/rules.md`](admin-guide/rules.md) | Smart Rules and notices & pop-ups (`/admin/rules/*`, S10) |
| [`agents/README.md`](agents/README.md) | The seven agents with Bengali names and profile files |
| [`agents/AGENT-PROTOCOL.md`](agents/AGENT-PROTOCOL.md) | How agents keep their skills and duties (PR 577, 321–323) |
| [`agents/APPRAISAL-TEMPLATE.md`](agents/APPRAISAL-TEMPLATE.md) | Template for agent reports and appraisals (PR 578) |
| [`agents/CURRICULUM.md`](agents/CURRICULUM.md) | Degree-path curriculum per agent (PR 579) |
| [`agents/gyani.md`](agents/gyani.md) | Gyani (জ্ঞানী, A360-01), chief agent / virtual CEO |
| [`agents/prohori.md`](agents/prohori.md) | Prohori (প্রহরী, A360-02), foundation: server, security, deploys |
| [`agents/bhandari.md`](agents/bhandari.md) | Bhandari (ভান্ডারী, A360-03), warehouse: products, stock, ERP sync |
| [`agents/sawdagor.md`](agents/sawdagor.md) | Sawdagor (সওদাগর, A360-04), shop: storefront, checkout, combos |
| [`agents/shilpi.md`](agents/shilpi.md) | Shilpi (শিল্পী, A360-05), design: UI, photos |
| [`agents/doot.md`](agents/doot.md) | Doot (দূত, A360-06), promotion: SEO, content, CRM messages |
| [`agents/tirondaj.md`](agents/tirondaj.md) | Tirondaj (তীরন্দাজ, A360-07), ads |
| [`agents/lessons/ALL.md`](agents/lessons/ALL.md) | The owner's corrections every agent replays before work — read before building |
| `agents/lessons/<agent>.md` | Lessons per agent (bhandari, doot, gyani, prohori, sawdagor, shilpi, tirondaj) |
| `agents/worklog/<agent>.log` | Work log per agent |
| `agents/skills/<agent>/` | Each agent's skill files (numbered topics, `EXAM.md`, `MYTHS.md`, `README.md`; Doot and Tirondaj also `LEARNING-LOOP.md`, `PAID-TOOLS.md`, `PRACTICE-TASKS.md`, `TRIAL-PLAN.md`; Bhandari `PHOTO-STANDARD.md`) |
| `agents/skills/gyani/executive/` · `gyani/studio/` | Gyani's executive skills (root cause, KPI trees, appraising agents, approval boundaries) and the walk-out template |
| `agents/skills/shilpi/photo/` · `shilpi/ux/` | Shilpi's photo skills (shot types, colour, framing, set photos, delivery, alt text) and UX skills (mobile-first, touch targets, Bengali typography, accessibility, tokens, motion, tablets) |
| `agents/skills/<agent>/ext/` | Copies of external skill packs the agent uses (document, data, marketing and ecommerce helpers); reference only, not part of the app |

## `demo/` — the approved clickable demo (UI truth)

| Path | What it is |
|---|---|
| [`demo/EXTAS-demo-V12.2.html`](demo/EXTAS-demo-V12.2.html) | **The UI truth** (23 Oct: owner Notes 54–58, CN-012/014): one HTML file, download and open in a browser |
| [`demo/EXTAS-demo-V12.1.html`](demo/EXTAS-demo-V12.1.html) | V12.1 (CN-008), kept as history |
| [`demo/EXTAS-demo-V12.html`](demo/EXTAS-demo-V12.html) | V12, kept as history |
| Public share build (no file here) | A slim build of V12.2 (the docs data left out, under 2 MB; owner Note 58), published as a claude.ai artifact that the owner shares himself. The full V12.2 file above stays the UI truth; the link is the owner's and is not written in the repo |
| `demo/src/` | The demo's source, one JS file per screen or engine (data, core, layout, home, category, product, combo, bag, checkout, account, blog, every admin screen, server pages, register, docs, site builder) |
| `demo/tools/build.sh` | Builds the single demo HTML from `src/` |
| `demo/tools/*-test.js`, `journey.js`, `smoke.js` | Demo test suites, journeys and smoke checks |
| `demo/tools/vshot.js`, `d-view.js` | Screenshot and view helpers |
| `demo/tools/make-register.py`, `register-state.json` | Generator and state for the demo's PR register screen |
| `demo/tools/extract-admin-bn.py` | Extracts the admin's Bengali labels |

## `history/` — earlier blueprint versions (never edited)

| File | What it is |
|---|---|
| [`history/EXTAS-ECOMMERCE-V1.md`](history/EXTAS-ECOMMERCE-V1.md) | Blueprint V1.0, 18 Oct 2026 |
| [`history/EXTAS-ECOMMERCE-V2.md`](history/EXTAS-ECOMMERCE-V2.md) | Blueprint V2.0, 19 Oct 2026 |
| [`history/EXTAS-ECOMMERCE-V2.1.md`](history/EXTAS-ECOMMERCE-V2.1.md) | Blueprint V2.1 as first filed, 19 Oct 23:33 (the live copy is `BLUEPRINT.md`) |

## `owner/` — the owner's notes, decisions and guides

| File | What it is |
|---|---|
| [`owner/ROUND15.md`](owner/ROUND15.md) | Every owner note from review round 15 on (Note 52 is the newest on `main`) — the record of his decisions |
| [`owner/ROUND14.md`](owner/ROUND14.md) | Round 14: the owner's points after demo version 9 |
| [`owner/CHANGE-PROCESS.md`](owner/CHANGE-PROCESS.md) | How a new idea or change enters the build (Bengali; part of PR 594) |
| [`owner/RUNNER-SETUP.md`](owner/RUNNER-SETUP.md) | Owner guide: install the GitHub runner on the server, once, 5 minutes (Bengali) |
| [`owner/PREVIEW-LOGIN.md`](owner/PREVIEW-LOGIN.md) | Owner guide: how to read the new.extas.com.bd password on the server (Bengali) |
| [`owner/AZURE-VM-GUIDE.pdf`](owner/AZURE-VM-GUIDE.pdf) | Guide to the Azure VM |
| [`owner/SERVER-SETUP-SPEC-OWNER.md`](owner/SERVER-SETUP-SPEC-OWNER.md) | The owner's final server and performance specification (source of CN-001) |
| [`owner/OWNER-PRECODE-CHECKLIST.md`](owner/OWNER-PRECODE-CHECKLIST.md) | The owner's task list before code started (Bengali) |
| [`owner/DESKTOP-REVIEW.md`](owner/DESKTOP-REVIEW.md) | Storefront desktop review (audit only) |
| [`owner/PHONE-REVIEW.md`](owner/PHONE-REVIEW.md) | The owner's phone UI/UX points |
| [`owner/AGENT-AUDIT.md`](owner/AGENT-AUDIT.md) | Independent phone audit of the demo store |
| [`owner/COMBO-RESEARCH.md`](owner/COMBO-RESEARCH.md) | Combo and set research for EXTAS |
| [`owner/COMBO-AUDIT.md`](owner/COMBO-AUDIT.md) | Combo page audit (round 15) |
| [`owner/COMBO-RANKING.md`](owner/COMBO-RANKING.md) | Combo template ranking (PR 576) |
| [`owner/GOOGLE-TRAFFIC-PLAN.md`](owner/GOOGLE-TRAFFIC-PLAN.md) | Google traffic plan: English `/` + Bengali `/bn/` (S11 additions) |
| [`owner/BLOG-CONTENT-PLAN.md`](owner/BLOG-CONTENT-PLAN.md) | The blog (Journal) as the traffic engine (S12 additions) |
| [`owner/HANDOFF-A.md`](owner/HANDOFF-A.md) · [`HANDOFF-B.md`](owner/HANDOFF-B.md) · [`HANDOFF-C.md`](owner/HANDOFF-C.md) | Handoffs from the demo-phase agents: shared core; product page, combo and set; bag, checkout, thank-you and account |
| [`owner/owner-side-zone-2026-10-19.png`](owner/owner-side-zone-2026-10-19.png) | The owner's marking of the desktop side-canvas zones (PR 596) |
| `owner/shots/` | Owner screenshots (checkout struck price) |

## `qa/` — the QA checklist, reports and tools

| Path | What it is |
|---|---|
| [`qa/ECOMMERCE-CHECKLIST.md`](qa/ECOMMERCE-CHECKLIST.md) | The master QA checklist (gates in Blueprint Appendix C) |
| [`qa/TIMING-AUDIT.md`](qa/TIMING-AUDIT.md) | Timing audit: every stop needs its resume (checklist L32/L33) |
| [`qa/QA-REPORT-V12B.md`](qa/QA-REPORT-V12B.md) | Independent QA of demo V12b (44/44 owner items pass; Bengali) |
| [`qa/QA-V12B-PROGRESS.md`](qa/QA-V12B-PROGRESS.md) | Progress log of that QA round |
| [`qa/ADMIN-AUDIT.md`](qa/ADMIN-AUDIT.md) | Admin backend audit of demo V12 |
| [`qa/PHONE-AUDIT-PROGRESS.md`](qa/PHONE-AUDIT-PROGRESS.md) | Phone and tablet audit progress log |
| [`qa/DESKTOP-QA-REPORT.md`](qa/DESKTOP-QA-REPORT.md) | Desktop functional QA of the demo |
| [`qa/BLOG-QA-REPORT.md`](qa/BLOG-QA-REPORT.md) | Blog QA and UX review |
| [`qa/QA-REPORT-R15.md`](qa/QA-REPORT-R15.md) · [`QA-REPORT-R15b.md`](qa/QA-REPORT-R15b.md) | Demo QA round R15 and its independent rerun |
| [`qa/device-matrix.js`](qa/device-matrix.js) · [`devices.json`](qa/devices.json) | The device gate: phones, tablets and desktops to test on |
| `qa/screenshots/pr-<n>/` | Real-app screenshots per PR, phone 390 and desktop 1366, with a README of Bengali captions (PR 21, 28, 39, 40, 41, 43, 49 (the product page, PR 49, 54–57, 60–64), 107 (the bag, PR 105–114), 115 (the checkout, PR 115–126), 53 (product-page extras, wishlist, menu, help pages: PR 53, 67–71, 74, 75), 72 (search: PR 72, 73), 136 (invoice, product-page questions, celebration: PR 136, 66, 87, 86), 12 (the new admin shell: PR 12, 155, 495), 12-look (the admin look and the V12.4 Dashboard: PR 12, CN-025), 65 (product reviews and the review form: PR 65, 59), 205, 209, 500, 44 (the home flash sale), 572, 573, 574 (the combo list, pair page and bag templates); PR 40 also phone 440) |
| [`qa/COMBO-TEMPLATE-MATRIX.md`](qa/COMBO-TEMPLATE-MATRIX.md) · [`combo-matrix.json`](qa/combo-matrix.json) · [`combo-ranking/latest.json`](qa/combo-ranking/latest.json) | PR 576: every combo list, pair page and bag template played on the sample sets at four screens and scored out of 100 (Bengali summary first); the config and the raw runs. Rerun with `node tools/combo-matrix.mjs --base=<server>` |
| [`qa/smoke.json`](qa/smoke.json) | The smoke test's page list, screens and known requests to ignore (CN-016; admin pages come from the admin menu) |
| [`qa/audit-checklist.json`](qa/audit-checklist.json) | PR 570: the checklist's groups, points and newest QA marks, generated from `ECOMMERCE-CHECKLIST.md` by `tools/audit-checklist.mjs` (AI › Checklist audit; a test fails when it is out of date) |
| [`qa/audit-groups.json`](qa/audit-groups.json) | PR 570: which smoke-test pages and saved journeys cover each checklist group, for the audit's report (`tools/audit-report.mjs`, `infra/deploy/audit.sh`, `audit.yml`) |
| [`qa/journeys.json`](qa/journeys.json) | PR 414: the saved browser journeys (customer, admin, accountant, warehouse; phone and desktop) replayed by `tools/journeys.mjs` on the owner's schedule (Reports › Site health; `infra/deploy/journeys.sh`, `journeys.yml`); failed runs report to `reports/journeys/latest/` |
| [`qa/FINAL-ANALYSIS-2026-11.md`](qa/FINAL-ANALYSIS-2026-11.md) | PR 414 follow-up (CN-013 go-live gate, phase 2): the customer 360° — every life-cycle stage (automatic, needs a person, needs a key), the angles the owner did not list, the local findings with file:line, and the live results; the run is `tools/gate-c360/`, `infra/deploy/gate-c360.sh`, `gate-c360.yml`, reporting to `reports/gate-c360/latest/` (Bengali summary first) |
| `qa/tools/timing-audit-tools/` | Timing audit suites (sliders, drag, hover, overlays …) |
| `qa/tools/blog-qa-tools/` | Blog QA checks, journeys and captures |
| `qa/tools/desktop-fix-bag-tools/` | Bag and desktop fix checks, pixel diff |
| `qa/tools/admin-shots-register/` | Admin register screen tests |
| `qa/tools/server-admin/` | Server admin pages checks |
| `qa/tools/owner-answers/`, `owner-fix-B-tests/`, `owner-fix-C/`, `owner-fix-E/`, `owner-fix-QA-tools3/` | Tests and before-copies from the owner fix rounds |
| `qa/tools/v2/` | Scripts that built and verified blueprint V2 / V2.1 |

## `security/` — security review, runbooks and edge protection (S18)

| Path | What it is |
|---|---|
| [`security/REVIEW.md`](security/REVIEW.md) | The independent security review before real money flows: the automated checks (dependency audit `tools/dep-audit.mjs`, PR 381), the review list R1–R14, findings and the sign-off the payment gateways' live keys wait for |
| [`security/BREAK-GLASS-RESTORE.md`](security/BREAK-GLASS-RESTORE.md) | The break-glass restore runbook (PR 385): locking the Blob backups (immutable, `extas-backup lock-check`), stopping an intrusion, restoring through `restore.yml` (test → staging → production with the owner's written OK), rebuilding on a fresh VM, practice |

## `stages/` — stage and PR pages (generated)

| Path | What it is |
|---|---|
| [`stages/README.md`](stages/README.md) | Index of the waves and the 28 stages, each with a Bengali line and its done / total count |
| `stages/S<id>.md` (for example [`stages/S01.md`](stages/S01.md)) | One page per stage (S0A, S00–S27): a Bengali summary, the PR table, then one section per PR (`#pr-<n>`) with a Bengali line and the English details (scope, dated updates and CN notes, status, what was built, links) |
| [`stages/register.json`](stages/register.json) | The same data, structured, for the admin "PR register" tab (PR 594) |
| [`stages/bn.json`](stages/bn.json) | The hand-written Bengali text (stage and wave summaries, one line per built PR); the only file here edited by hand |

Made by `tools/docs/gen-stage-pages.mjs` (`pnpm docs:stages`) from `MASTER-REGISTER.md`, `BLUEPRINT.md` (Appendix A,
E3) and `stages/bn.json`; it also links the stage names, waves and PR numbers in the root `README.md`. CI fails when
the pages are out of date.

## `admin-guide/` — one Bengali guide per admin section (CN-014)

| File | What it is |
|---|---|
| [`admin-guide/README.md`](admin-guide/README.md) | Index of the admin section guides |
| [`admin-guide/combos.md`](admin-guide/combos.md) | Combos & customer sets (`/admin/combos`): the tabs, every setting with its default, what happens after each action |
| [`admin-guide/pages/orders/risk-rules.md`](admin-guide/pages/orders/risk-rules.md) | Page guide (CN-026 six parts): Orders › Risk rules, its Levels card (`/admin/orders/risk-rules`, PR 161) and the Advance request card (PR 542) |
| [`admin-guide/pages/orders/advance-request.md`](admin-guide/pages/orders/advance-request.md) | Page guide (CN-026 six parts): "Request advance" on the order page, the pay link `/pay/<token>` and the Advance request card (PR 542) |
| [`admin-guide/pages/orders/invoices.md`](admin-guide/pages/orders/invoices.md) | Page guide (CN-026 six parts): Orders › Packing & print › Invoices (`/admin/orders/packing/invoices`): the list, printing on paper, roll or as a picture, the invoice cards (PR 407) |
| [`admin-guide/pages/products/erp-import.md`](admin-guide/pages/products/erp-import.md) | Page guide (CN-026 six parts): Products › Import from ERP (`/admin/products/erp-import`): a style code to drafts, the buying prices that changed, the selling-price floor (PR 609) |
| [`admin-guide/pages/settings/erp-link.md`](admin-guide/pages/settings/erp-link.md) | Page guide (CN-026 six parts): Settings › ERP link (`/admin/settings/erp-link?storeId=`): each store's own ERP keys, queues, balance, books, the switch-over (PR 619) and the demo-key card of the ERP acceptance run (PR 621) |
| [`admin-guide/pages/settings/security.md`](admin-guide/pages/settings/security.md) | Page guide (CN-026 six parts): Settings › Sign-in & security (`/admin/settings/security`): 2FA required, session limits, the admin address list, your devices, the security events (PR 380) |
| [`admin-guide/pages/settings/backups.md`](admin-guide/pages/settings/backups.md) | Page guide (CN-026 six parts): Settings › System › Backups (`/admin/settings/system/backups`): Google Drive in one click (PR 395), the backup settings, "Back up now" and the monthly restore drill (PR 507) |
| [`admin-guide/pages/settings/store.md`](admin-guide/pages/settings/store.md) | Page guide (CN-026 six parts): Settings › Store details (`/admin/settings/store`): the legal numbers (registered name, trade licence, DBID, VAT BIN) and the guard against filler text (PR 383) |
| [`admin-guide/pages/settings/privacy.md`](admin-guide/pages/settings/privacy.md) | Page guide (CN-026 six parts): Settings › Privacy & data (`/admin/settings/privacy`): how long orders keep address, device and location facts, the clean-up, erasure requests (PR 382) |
| [`admin-guide/pages/settings/policies.md`](admin-guide/pages/settings/policies.md) | Page guide (CN-026 six parts): Settings › Policies & texts (`/admin/settings/policies`): the help pages, their Smart Rules texts, the owner's own words and rule tokens (PR 384) |
| [`admin-guide/pages/settings/edge.md`](admin-guide/pages/settings/edge.md) | Page guide (CN-026 six parts): Settings › Sign-in & security › Cloudflare protection (`/admin/settings/security/edge`): the shop's protection rules (PR 386) and cache rules (PR 362), Send to Cloudflare |
| [`admin-guide/pages/settings/go-live.md`](admin-guide/pages/settings/go-live.md) | Page guide (CN-026 six parts): Settings › System › Go-live (`/admin/settings/system/go-live`): the automatic, confirmed and owner rows before real orders (PR 393, 394, 397–401), the first-week watch (PR 402) |
| [`admin-guide/pages/reports/health.md`](admin-guide/pages/reports/health.md) | Page guide (CN-026 six parts): Reports › Site health (`/admin/reports/health`): the five status lines and when each turns yellow (PR 413) |
| [`admin-guide/pages/money/overview.md`](admin-guide/pages/money/overview.md) | Page guide (CN-026 six parts): Money › Overview (`/admin/money`): cash received, COD the couriers owe, refunds waiting (PR 342) |
| [`admin-guide/pages/website/redirects.md`](admin-guide/pages/website/redirects.md) | Page guide (CN-026 six parts): Website › SEO › Redirects & 404 (`/admin/website/seo/redirects`): the redirect table, import, the 404 report and its fixes (PR 235), the demo-link switch (PR 586) |
| [`admin-guide/pages/website/seo-categories.md`](admin-guide/pages/website/seo-categories.md) | Page guide (CN-026 six parts): Website › SEO › Collection pages (`/admin/website/seo/categories`): a collection's own search words and the named filter pages that may be listed (PR 227) |
| [`admin-guide/pages/website/seo-bengali.md`](admin-guide/pages/website/seo-bengali.md) | Page guide (CN-026 six parts): Website › SEO › Bengali pages (`/admin/website/seo/bengali`): the Bengali coverage report, "Mark ready" / "Not ready" and what a not-ready Bengali page shows (PR 588) |
| [`admin-guide/pages/reports/health-problems.md`](admin-guide/pages/reports/health-problems.md) | Page guide (CN-026 six parts): Reports › Site health › Customer problems (`/admin/reports/health/problems`): what visitors ran into, Urgent first, and the recorder card (PR 423) |
| [`admin-guide/pages/reports/health-problem.md`](admin-guide/pages/reports/health-problem.md) | Page guide (CN-026 six parts): one customer problem (`/admin/reports/health/problems/[id]`): devices, browsers, networks, the last reports and its status with a note (PR 423) |
| [`admin-guide/pages/orders/calls.md`](admin-guide/pages/orders/calls.md) | Page guide (CN-026 six parts): Orders › To confirm › Calls to make (`/admin/orders/confirm/calls`): every call task by reason, the new-customer call (off as shipped), recording what a call found, the outcomes card (PR 545) |
| [`admin-guide/pages/orders/digest.md`](admin-guide/pages/orders/digest.md) | Page guide (CN-026 six parts): Orders › Today's digest (`/admin/orders/digest`): a day's orders in one sentence, held and cancelled by reason, what waits for a person's OK, and the permission gate that turns every engine action into a proposal (PR 540) |
| [`admin-guide/pages/reports/flags.md`](admin-guide/pages/reports/flags.md) | Page guide (CN-026 six parts): Reports › Flag outcomes (`/admin/reports/flags`): of the customers asked to pay ahead — at checkout per layer and after ordering per way asked — who paid, waits, walked away or ordered without the ask, what the paid ones became, the advance collected, and the layers losing customers (PR 562) |
| [`admin-guide/pages/reports/learning.md`](admin-guide/pages/reports/learning.md) | Page guide (CN-026 six parts): Reports › Decisions & learning (`/admin/reports/learning`): every decision on the engine's stops and proposals with its note, per rule and per person, how the orders let go ended, and suggestions only (PR 543) |
| [`admin-guide/pages/reports/stopped.md`](admin-guide/pages/reports/stopped.md) | Page guide (CN-026 six parts): Reports › Stopped by the engine (`/admin/reports/stopped`): every order the risk engine stopped by itself, its rule, how sure, what became of it, the rules to check and the good customers spared (PR 524) |
| [`admin-guide/pages/reports/fraud.md`](admin-guide/pages/reports/fraud.md) | Page guide (CN-026 six parts): Reports › Fraud & RTO (`/admin/reports/fraud`): what each risk step caught and what became of it, the cost probably saved, the RTO cost book in taka (PR 164) |
| [`admin-guide/pages/money/refunds.md`](admin-guide/pages/money/refunds.md) | Page guide (CN-026 six parts): Money › Refunds & wallet (`/admin/money/refunds`): the money owed, refunds to approve, pay out and record, the money rules (PR 172 and 171 follow-ups, go-live gate F-041, F-054) |
| [`admin-guide/pages/reports/delivery.md`](admin-guide/pages/reports/delivery.md) | Page guide (CN-026 six parts): Reports › Delivery & RTO (`/admin/reports/delivery`): courier performance by zone and district, parcels past their promise, the RTO cost book, charge mismatches (PR 192, 564) |
| [`admin-guide/pages/support/rider-issues.md`](admin-guide/pages/support/rider-issues.md) | Page guide (CN-026 six parts): Support › Rider issues (`/admin/support/rider-issues`): a rider's overcharge with photo proof, a second person's approval, the claim (PR 192) |
| [`admin-guide/pages/delivery/settings.md`](admin-guide/pages/delivery/settings.md) | Page guide (CN-026 six parts): Delivery › Settings (`/admin/delivery/settings`): holiday mode, Latin letters on the sticker, delivery hours per district, the voice address (PR 193; PR 179, 550, 117 follow-ups) |
| [`admin-guide/pages/marketing/eid.md`](admin-guide/pages/marketing/eid.md) | Page guide (CN-026 six parts): Smart Rules › Eid order-by dates (`/admin/rules/eid`): the last order day per band and district, the banner, pre-order with an advance (PR 193) |
| [`admin-guide/pages/help/site-manual.md`](admin-guide/pages/help/site-manual.md) | Page guide (CN-026 six parts): Help & Build › Site manual (`/admin/help/manual`): the whole admin as one book, its pictures with numbered marks, search, What's new and the .md download (PR 387–390) |
| [`admin-guide/pages/reports/health-speed.md`](admin-guide/pages/reports/health-speed.md) | Page guide (CN-026 six parts): Reports › Site health › Speed (`/admin/reports/health/speed`): the monthly lab run against the targets, real visitors, month by month, Measure now (PR 417) |
| [`admin-guide/pages/reports/health-smoke.md`](admin-guide/pages/reports/health-smoke.md) | Page guide (CN-026 six parts): Reports › Site health › Smoke runs (`/admin/reports/health/smoke`): the newest deploy and nightly runs, every page with its picture (PR 418) |
| [`admin-guide/pages/reports/health-history.md`](admin-guide/pages/reports/health-history.md) | Page guide (CN-026 six parts): Reports › Site health › Run history (`/admin/reports/health/history`): every smoke test and journeys run, the Telegram card (PR 419, 424) |
| [`admin-guide/pages/reports/health-history-run.md`](admin-guide/pages/reports/health-history-run.md) | Page guide (CN-026 six parts): One run (`/admin/reports/health/history/[id]`): its findings, new or still failing, what was fixed and "What this run says" (PR 419, 422) |
| [`admin-guide/pages/reports/health-fixes.md`](admin-guide/pages/reports/health-fixes.md) | Page guide (CN-026 six parts): Reports › Site health › Fixes to approve (`/admin/reports/health/fixes`): agents' fixes and new skills waiting for the owner's OK (PR 420) |
| [`admin-guide/pages/ai/audit.md`](admin-guide/pages/ai/audit.md) | Page guide (CN-026 six parts): AI › Checklist audit (`/admin/ai/audit`): the last audit per checklist group, Run now and the runner card (PR 570) |
| [`admin-guide/pages/money/cost-ledger.md`](admin-guide/pages/money/cost-ledger.md) | Page guide (CN-026 six parts): Money › Cost ledger (`/admin/money/cost-ledger`): costs by service, prepaid balances and top-ups, the CSV export (PR 343) |
| [`admin-guide/pages/money/expenses.md`](admin-guide/pages/money/expenses.md) | Page guide (CN-026 six parts): Money › Expenses (`/admin/money/expenses`): quick entry on the owner's heads, reversals, receipts (PR 344) |
| [`admin-guide/pages/money/fees.md`](admin-guide/pages/money/fees.md) | Page guide (CN-026 six parts): Money › Costs & fees (`/admin/money/fees`): gateway fees, packaging, the USD rate, courier rate cards (PR 345) |
| [`admin-guide/pages/money/month-end.md`](admin-guide/pages/money/month-end.md) | Page guide (CN-026 six parts): Money › Month-end (`/admin/money/month-end`): the month's close sheet, read-only (PR 346) |
| [`admin-guide/pages/marketing/tracking.md`](admin-guide/pages/marketing/tracking.md) | Page guide (CN-026 six parts): Marketing › Tracking (`/admin/marketing/tracking`): server-side events to Meta, Google and TikTok, test events, the settings (PR 257) |
| [`admin-guide/pages/support/inbox.md`](admin-guide/pages/support/inbox.md) | Page guide (CN-026 six parts): Support › Inbox (`/admin/support`): the views, search, the rows (PR 425) |
| [`admin-guide/pages/support/conversation.md`](admin-guide/pages/support/conversation.md) | Page guide (CN-026 six parts): one conversation (`/admin/support/c/[id]`): reply, internal note, files, take / give, status, the who-did-what log (PR 425) |
| [`admin-guide/pages/support/settings.md`](admin-guide/pages/support/settings.md) | Page guide (CN-026 six parts): Support settings (`/admin/support/settings`): inbox, files, the customer-number line (PR 425) |
| [`admin-guide/pages/delivery/zones.md`](admin-guide/pages/delivery/zones.md) | Page guide (CN-026 six parts): Delivery › Zones & charges (`/admin/delivery/zones`): the three bands, COD limits, the sub-area switch, the area admin (PR 550, 551, 502) |
| [`admin-guide/pages/messages/journey.md`](admin-guide/pages/messages/journey.md) | Page guide (CN-026 six parts): Messages › Order journey (`/admin/messages/journey`): which event sends which message, each step's switch, channel, fallback, time and template (PR 505) |
| [`admin-guide/pages/messages/templates.md`](admin-guide/pages/messages/templates.md) | Page guide (CN-026 six parts): Messages › Templates (`/admin/messages/templates`): the words in both languages, the live preview, Reset to default, the auto-reply (PR 505) |
| [`admin-guide/pages/messages/log.md`](admin-guide/pages/messages/log.md) | Page guide (CN-026 six parts): Messages › Message log (`/admin/messages/log`): every message, its parts and cost, Try again (PR 291) |
| [`admin-guide/pages/messages/channels.md`](admin-guide/pages/messages/channels.md) | Page guide (CN-026 six parts): Messages › Channels & limits (`/admin/messages/channels`): each channel's service and mode, caps, quiet hours, masking, WhatsApp templates (PR 291, 292) |
| [`admin-guide/pages/messages/consent.md`](admin-guide/pages/messages/consent.md) | Page guide (CN-026 six parts): Messages › Channels & limits › Consent (`/admin/messages/consent`): who stopped messages, the team's record, the stop words (PR 298) |

## `reports/` — what got built, in Bengali

| Path | What it is |
|---|---|
| [`reports/2026-10-20-S0A.md`](reports/2026-10-20-S0A.md) | S0A stage report: the server (12/12) |
| [`reports/2026-10-20-S00.md`](reports/2026-10-20-S00.md) | S00 stage report: the foundation (19/19) |
| [`reports/2026-10-20-S01.md`](reports/2026-10-20-S01.md) | S01 stage report: products, photos and catalogue (22/22) |
| [`reports/2026-10-20-S10.md`](reports/2026-10-20-S10.md) | S10 stage report: Smart Rules (12/12) |
| [`reports/2026-10-30-S01.md`](reports/2026-10-30-S01.md) | S01 stage report: done with PR 609, import from the ERP by style code (23/23) |
| [`reports/2026-10-30-S05.md`](reports/2026-10-30-S05.md) | S05 stage report: done with PR 610, orders to the ERP v6 (21/21) |
| [`reports/2026-10-24-S04.md`](reports/2026-10-24-S04.md) | S04 stage report: bag, checkout, accounts (41/41) |
| [`reports/2026-10-24-S05.md`](reports/2026-10-24-S05.md) | S05 stage report: Order management (20/20) |
| [`reports/2026-10-24-S03.md`](reports/2026-10-24-S03.md) | S03 stage report: combos and sets, with the template ranking (22/22) |
| [`reports/2026-11-01-S07.md`](reports/2026-11-01-S07.md) | S07 stage report: done with PR 168 and 169, Nagad and card (10/10) |
| [`reports/2026-11-01-S08.md`](reports/2026-11-01-S08.md) | S08 stage report: done with PR 178, 186, 192, 193 and 564 (26/26) |
| [`reports/2026-11-01-S18.md`](reports/2026-11-01-S18.md) | S18 stage report: done with PR 387–390, the Site manual (14/14) |
| [`reports/server/latest.md`](reports/server/latest.md) | The newest machine report from the `server-setup` workflow (no secrets) |
| `reports/server/2026-10-20-*-setup.md` | Earlier machine reports, one per setup run |
| [`reports/smoke/latest/README.md`](reports/smoke/latest/README.md) | The newest smoke test (after every deploy and every night): each page and screen, its result and picture (CN-016) |
| `reports/erp-acceptance/latest/` | The newest ERP v6 acceptance run against the demo ERP (every night and before every release; "waiting for the demo key" until the owner types it): README.md with a Bengali summary line and report.json (PR 621) |
| `reports/gate-orders/latest/` | The newest go-live test-order run on the preview site (by hand only: GitHub › Actions › gate-orders; `tools/gate-orders/`, `infra/deploy/gate-orders.sh`): 18 scenarios on phones and desktops over throttled networks, the six gate checks 1, 4, 7, 21, 23, 24, every address typed → stored → admin → courier → sticker, timings, and the clean-up (every test order cancelled, the test products archived, nothing deleted). README.md with a Bengali summary line and result.json (PR 414 follow-up, CN-013 phase 2) |

## Where the docs also live (CN-011)

The rule is filed in CN-011; the copying is built in the deploy workflow, PR 594 and PR 8 / 395 / 507, and is
not running yet.

- **On the server:** every deploy copies this folder (with the root `README.md`) to the server, one way, so the
  admin's "PR register" and "Blueprint & files" tabs (PR 594) always show the latest.
- **In every backup:** each backup (PR 8 / 395 / 507, Azure Blob and Google Drive) carries a dated docs bundle with
  the commit hash, so a restore brings back the documentation of that exact version.
