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
| [`MASTER-REGISTER.md`](MASTER-REGISTER.md) | All 606 PRs in 28 stages (600 active, 6 parked): the Build status table (merged / live), change notes, the stage table, the parking lot, PR rows for S0A–S15 (S16–S25 rows are in Blueprint Appendix A) |
| [`START-HERE.md`](START-HERE.md) | How every build session runs: reading order, build order, the gates, speed targets, the go-live gate |
| [`LAUNCH-TRACK.md`](LAUNCH-TRACK.md) | **The build order (CN-027):** the Launch list (what real orders need, built first) and the After-launch list (built automatically right after), with counts and status per PR |
| [`CONVENTIONS.md`](CONVENTIONS.md) | Branches, PR titles, commits, what to update after every PR, code mechanics (PR 11) |
| [`ERP-API-CONTRACT.md`](ERP-API-CONTRACT.md) | The ERP ↔ shop API: security, endpoints under `/api/v1/ecommerce`, webhooks, rules (CN-005) |
| [`SERVER.md`](SERVER.md) | The server in plain Bengali: what runs, the three disks, restart, RAM/CPU split, alerts, restore, where to see status (PR 10 runbook) |
| [`README.md`](README.md) | This index |

## `agents/` — the seven fixed agents (PR 577–585)

| Path | What it is |
|---|---|
| [`admin-guide/README.md`](admin-guide/README.md) | Bengali guide per admin section (CN-014), the index |
| [`admin-guide/dashboard.md`](admin-guide/dashboard.md) | The Dashboard: Sales and Ordered value tiles, Needs you now, role start pages (`/admin`, PR 12, 155, 495) |
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
| `qa/screenshots/pr-<n>/` | Real-app screenshots per PR, phone 390 and desktop 1366, with a README of Bengali captions (PR 21, 28, 39, 40, 41, 43, 49 (the product page, PR 49, 54–57, 60–64), 107 (the bag, PR 105–114), 115 (the checkout, PR 115–126), 53 (product-page extras, wishlist, menu, help pages: PR 53, 67–71, 74, 75), 72 (search: PR 72, 73), 136 (invoice, product-page questions, celebration: PR 136, 66, 87, 86), 12 (the new admin shell: PR 12, 155, 495), 65 (product reviews and the review form: PR 65, 59), 205, 209, 500, 44 (the home flash sale), 572, 573, 574 (the combo list, pair page and bag templates); PR 40 also phone 440) |
| [`qa/COMBO-TEMPLATE-MATRIX.md`](qa/COMBO-TEMPLATE-MATRIX.md) · [`combo-matrix.json`](qa/combo-matrix.json) · [`combo-ranking/latest.json`](qa/combo-ranking/latest.json) | PR 576: every combo list, pair page and bag template played on the sample sets at four screens and scored out of 100 (Bengali summary first); the config and the raw runs. Rerun with `node tools/combo-matrix.mjs --base=<server>` |
| [`qa/smoke.json`](qa/smoke.json) | The smoke test's page list, screens and known requests to ignore (CN-016; admin pages come from the admin menu) |
| `qa/tools/timing-audit-tools/` | Timing audit suites (sliders, drag, hover, overlays …) |
| `qa/tools/blog-qa-tools/` | Blog QA checks, journeys and captures |
| `qa/tools/desktop-fix-bag-tools/` | Bag and desktop fix checks, pixel diff |
| `qa/tools/admin-shots-register/` | Admin register screen tests |
| `qa/tools/server-admin/` | Server admin pages checks |
| `qa/tools/owner-answers/`, `owner-fix-B-tests/`, `owner-fix-C/`, `owner-fix-E/`, `owner-fix-QA-tools3/` | Tests and before-copies from the owner fix rounds |
| `qa/tools/v2/` | Scripts that built and verified blueprint V2 / V2.1 |

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

## `reports/` — what got built, in Bengali

| Path | What it is |
|---|---|
| [`reports/2026-10-20-S0A.md`](reports/2026-10-20-S0A.md) | S0A stage report: the server (12/12) |
| [`reports/2026-10-20-S00.md`](reports/2026-10-20-S00.md) | S00 stage report: the foundation (19/19) |
| [`reports/2026-10-20-S01.md`](reports/2026-10-20-S01.md) | S01 stage report: products, photos and catalogue (22/22) |
| [`reports/2026-10-20-S10.md`](reports/2026-10-20-S10.md) | S10 stage report: Smart Rules (12/12) |
| [`reports/2026-10-24-S05.md`](reports/2026-10-24-S05.md) | S05 stage report: Order management (20/20) |
| [`reports/2026-10-24-S03.md`](reports/2026-10-24-S03.md) | S03 stage report: combos and sets, with the template ranking (22/22) |
| [`reports/server/latest.md`](reports/server/latest.md) | The newest machine report from the `server-setup` workflow (no secrets) |
| `reports/server/2026-10-20-*-setup.md` | Earlier machine reports, one per setup run |
| [`reports/smoke/latest/README.md`](reports/smoke/latest/README.md) | The newest smoke test (after every deploy and every night): each page and screen, its result and picture (CN-016) |

## Where the docs also live (CN-011)

The rule is filed in CN-011; the copying is built in the deploy workflow, PR 594 and PR 8 / 395 / 507, and is
not running yet.

- **On the server:** every deploy copies this folder (with the root `README.md`) to the server, one way, so the
  admin's "PR register" and "Blueprint & files" tabs (PR 594) always show the latest.
- **In every backup:** each backup (PR 8 / 395 / 507, Azure Blob and Google Drive) carries a dated docs bundle with
  the commit hash, so a restore brings back the documentation of that exact version.
