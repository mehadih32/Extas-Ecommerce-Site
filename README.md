# EXTAS — E-commerce platform

> **বাংলায় সংক্ষেপে:** এটা EXTAS-এর নতুন অনলাইন দোকানের পুরো কোড আর কাগজপত্রের ঘর। নিচে এক নজরে দেখা যায়: কোন ধাপ
> কতটা শেষ (৬০০টা PR-এর মধ্যে ১৭৮টা), কী চালু হয়েছে, কী বাকি, আর আপনার কোন সিদ্ধান্ত লাগবে। প্রতিটা PR মার্জের পর এই
> পাতা আপডেট হয়। কোড পড়তে হবে না — শুধু বাংলা লাইনগুলো পড়লেই চলবে।

**EXTAS** is a Bangladeshi menswear brand (polos, T-shirts, shirts, denim, trousers, panjabi and more). This private
repository builds its new online shop: a phone-first storefront, a full admin backend, and the server it runs on.
The owner's **EXTAS ERP** stays the master for SKUs, stock and accounts; this shop reads from it and sends business
documents to it ([how](#how-it-is-built)).

| | |
|---|---|
| **Preview (the build)** | **new.extas.com.bd** — password-protected and `noindex`. Every merge to `main` deploys here by itself. The password is never written anywhere; the owner reads it on the server ([`docs/owner/PREVIEW-LOGIN.md`](docs/owner/PREVIEW-LOGIN.md)). Today the home address opens the Bengali progress page (`/status`); the admin is at `/admin`. |
| **The old shop** | **extas.com.bd** (WordPress) stays live and untouched until go-live day. Then the main domain is switched and every old address gets a 301 redirect (S19, PR 587) — only on the owner's explicit word. |
| **Specification** | [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md) (V2.1 final + change notes) · [`docs/MASTER-REGISTER.md`](docs/MASTER-REGISTER.md) (606 PRs, 28 stages) · UI truth: [`docs/demo/EXTAS-demo-V12.2.html`](docs/demo/EXTAS-demo-V12.2.html) (V12.1 and V12 kept as history) |
| **Every session starts with** | [`CLAUDE.md`](CLAUDE.md) → [`docs/START-HERE.md`](docs/START-HERE.md) → [`PROGRESS.md`](PROGRESS.md) and [`BLOCKED.md`](BLOCKED.md) |

**Contents:** [Status](#status-dashboard) · [How it is built](#how-it-is-built) ·
[Local setup](#local-setup-and-useful-commands) · [The server](#the-server) · [Folder structure](#folder-structure) ·
[Features by area](#features-by-area) · [PR log](#pr-log) · [Change notes](#change-notes) · [Docs map](#docs-map) ·
[For a future developer](#for-a-future-developer)

---


## Running problems (CN-015)
> বাংলায়: কাস্টমারের সাইট ব্যবহারের সময় যে সমস্যাগুলো ধরা পড়ে, সেগুলো নিজে থেকেই এখানে উঠবে, পাশে লেখা থাকবে ঠিক হয়েছে কিনা।

| Date | Problem | Visitors hit | Status |
|---|---|---|---|
| 20 Oct | Admin: right after signing in, the page said "This page couldn't load". Cause: a fresh installation had no mother store, and every admin page works on it | The owner (first sign-in) | **Fixed** in #19 (PR 508: the migrate step makes the mother store; PR 4: CI signs in end to end before every deploy) |
| 20 Oct | Admin: the owner could not sign in with his own password, and the browser's "Sign in" box kept coming up. Cause: the sign-in request went out without the preview login, so the preview gate asked again and the form said "not right" | The owner | **Fixed** in #19 (PR 7: the preview login is asked once, then a cookie; PR 15: a new first password from the server when he cannot sign in, `owner-reset.yml`) |
| — | Customer problems fill this list automatically once the shop's checkout is live on new.extas.com.bd. | — | — |

## Status dashboard

> **বাংলায় সংক্ষেপে:** সার্ভার (S0A), ভিত্তি (S00), পণ্য-ছবি-ক্যাটালগ (S01), স্টক-ERP (S09) আর স্মার্ট নিয়ম (S10) — এই পাঁচটা ধাপ পুরো শেষ।
> এখন দোকানের সামনের অংশ (S02), কম্বো (S03), ব্যাগ, চেকআউট আর কাস্টমার অ্যাকাউন্ট (S04), অর্ডারের হিসাব (S05) আর ডেলিভারি এলাকা (S06) তৈরি হচ্ছে। মোট ৬০০টা PR-এর মধ্যে ১৮৩টা মার্জ হয়েছে।

| Item | Now |
|---|---|
| Stages | **S0A 12/12 · S00 19/19 · S01 22/22 · S09 17/17** (wave 1 done) · **S10 12/12** · **S02 41/58** · **S03 16/22** · **S06 6/33** (wave 2) · **S04 31/41** · **S05 7/20** (wave 3) · total **183/600** active PRs |
| Live on the preview | Bengali progress page (`/status`), admin sign-in, Keys & connections, products (list, new, edit, publish queue, import from a link, audit, back-in-stock), size charts, stock and ERP pages (practice ERP until the owner adds the ERP keys), Smart Rules (`/admin/rules`, notices and pop-ups) |
| Last deploy | 20 Oct 2026, 12:43 (Dhaka) · commit `f3822d0` (CN-009, documents) · **success**. Last code deploy: 11:42, PR [197–207](docs/stages/S09.md) (#17) |
| Smoke test | Every built page, phone and desktop, as a customer and as the admin, after every deploy and every night: [latest result](docs/reports/smoke/latest/README.md) (CN-016) |
| Waiting on the owner | 7 items open in [`BLOCKED.md`](BLOCKED.md) (13, 14, 15, 17, 18, 19 and 20); none stops the build ([table below](#what-waits-on-the-owner)). 18 and 19 are money questions from follow-ups 39 (a set's price in the free-delivery limit) and 121 (the band charge in the COD limit); nothing changes until he says so |
| Next | The CN-022 foundation items (worker PR [6](docs/stages/S0A.md#pr-6), ERP webhook PR [196](docs/stages/S09.md#pr-196), one "Sales" KPI PR [155](docs/stages/S05.md#pr-155), append-only audit log PR [139](docs/stages/S05.md#pr-139)) are live (deploy 23 Oct 17:35); the back-office follow-ups 80, 82, 92, 93, 54, 16 and 14 (ERP webhook through the preview gate, worker on rollback, KPI report views, band charge in the rules engine, shortage cards, hardcode-guard cases) go live with the next deploy; the new 14-section admin shell (PR 12: sidebar, tabs, search palette, guide panel, the Dashboard with Delivered sales / Ordered value and Needs you now, role start pages) is built and goes live with the next deploy, so the S05 order screens go on it; S02 continues (templates T2 / T3 and Find my size built: PR [50–52](docs/stages/S02.md), 58; next the size reports and reviews: PR [59](docs/stages/S02.md#pr-59), 65 …); S04 after checkout: customer accounts built (PR [129–135](docs/stages/S04.md), 137; the live SMS sender waits for its key); next "Add to this parcel" (PR [127](docs/stages/S04.md#pr-127) …) and the invoice (PR [136](docs/stages/S04.md#pr-136)); the order states, refunds and returns wait for the owner's approval of the architecture draft (CN-022); S03: the shop's combo pages are built (PR [91–95](docs/stages/S03.md), 102, 103: the combo page, the sets landing page, the set offer on the product page); next the set builder (PR [98](docs/stages/S03.md#pr-98), 100) and the templates 572–574, 576 |
| Last update | 23 Oct 2026 |

The truth for these numbers is the **Progress** line and the **Build status** table of
[`docs/MASTER-REGISTER.md`](docs/MASTER-REGISTER.md#build-status). Keep the "Stages" row above identical to it.

### All 28 stages

States: **Done** = every PR merged · **In progress** = work started · **Not started** · **Parked** = waits for the
owner's word (handover pack). Waves are the build order from Blueprint
[E3](docs/BLUEPRINT.md#e3-order-of-work); 2–3 agents build at once.

| Stage | Name | Wave | PR numbers | Done / total | State |
|---|---|:-:|---|:-:|---|
| [S0A](docs/stages/S0A.md) | [Server foundation](docs/stages/S0A.md) | [0](docs/stages/README.md#wave-0) | [1–10](docs/stages/S0A.md), [601](docs/stages/S0A.md#pr-601), [604](docs/stages/S0A.md#pr-604) | 12 / 12 | **Done** (all live on the server) |
| [S00](docs/stages/S00.md) | [Foundation — repo, CI, schema, auth, settings framework](docs/stages/S00.md) | [1](docs/stages/README.md#wave-1) | [11–18](docs/stages/S00.md), [491–496](docs/stages/S00.md), [500](docs/stages/S00.md#pr-500), [508–510](docs/stages/S00.md), [603](docs/stages/S00.md#pr-603) | 19 / 19 | **Done** |
| [S01](docs/stages/S01.md) | [Catalog, media & images](docs/stages/S01.md) | [1](docs/stages/README.md#wave-1) | [19–39](docs/stages/S01.md), [590](docs/stages/S01.md#pr-590) | 22 / 22 | **Done** |
| [S02](docs/stages/S02.md) | [Storefront](docs/stages/S02.md) | [2](docs/stages/README.md#wave-2) | [40–88](docs/stages/S02.md), [501](docs/stages/S02.md#pr-501), [503](docs/stages/S02.md#pr-503), [595–600](docs/stages/S02.md), [602](docs/stages/S02.md#pr-602) | 41 / 58 | In progress |
| [S03](docs/stages/S03.md) | [Combo & bundles](docs/stages/S03.md) | [2](docs/stages/README.md#wave-2) | [89–104](docs/stages/S03.md), [571–576](docs/stages/S03.md) | 16 / 22 | In progress |
| [S04](docs/stages/S04.md) | [Cart, checkout, accounts](docs/stages/S04.md) | [3](docs/stages/README.md#wave-3) | [105–137](docs/stages/S04.md), [558](docs/stages/S04.md#pr-558), [560](docs/stages/S04.md#pr-560), [561](docs/stages/S04.md#pr-561), [563](docs/stages/S04.md#pr-563), [565](docs/stages/S04.md#pr-565), [566](docs/stages/S04.md#pr-566), [605](docs/stages/S04.md#pr-605), [606](docs/stages/S04.md#pr-606) | 31 / 41 | In progress |
| [S05](docs/stages/S05.md) | [Order management](docs/stages/S05.md) | [3](docs/stages/README.md#wave-3) | [138–155](docs/stages/S05.md), [541](docs/stages/S05.md#pr-541), [546](docs/stages/S05.md#pr-546) | 7 / 20 | In progress |
| [S06](docs/stages/S06.md) | [Fraud & location](docs/stages/S06.md) | [4](docs/stages/README.md#wave-4) | [156–164](docs/stages/S06.md), [502](docs/stages/S06.md#pr-502), [519–524](docs/stages/S06.md), [540](docs/stages/S06.md#pr-540), [542–545](docs/stages/S06.md), [549–557](docs/stages/S06.md), [559](docs/stages/S06.md#pr-559), [562](docs/stages/S06.md#pr-562), [567](docs/stages/S06.md#pr-567) | 6 / 33 | In progress |
| [S07](docs/stages/S07.md) | [Payments & wallet](docs/stages/S07.md) | [3](docs/stages/README.md#wave-3) | [165–174](docs/stages/S07.md) | 0 / 10 | Not started |
| [S08](docs/stages/S08.md) | [Courier, returns, exchange](docs/stages/S08.md) | [3](docs/stages/README.md#wave-3) | [175–193](docs/stages/S08.md), [525–526](docs/stages/S08.md), [564](docs/stages/S08.md#pr-564) | 0 / 22 | Not started |
| [S09](docs/stages/S09.md) | [Inventory & ERP sync](docs/stages/S09.md) | [1](docs/stages/README.md#wave-1) | [194–207](docs/stages/S09.md), [497–499](docs/stages/S09.md) | 17 / 17 | **Done** |
| [S10](docs/stages/S10.md) | [Smart Rules](docs/stages/S10.md) | [2](docs/stages/README.md#wave-2) | [208–219](docs/stages/S10.md) | 12 / 12 | **Done** |
| [S11](docs/stages/S11.md) | [SEO engine](docs/stages/S11.md) | [5](docs/stages/README.md#wave-5) | [220–238](docs/stages/S11.md), [527](docs/stages/S11.md#pr-527), [586](docs/stages/S11.md#pr-586), [588](docs/stages/S11.md#pr-588) | 0 / 22 | In progress (PR 222 partly) |
| [S12](docs/stages/S12.md) | [Content & blog](docs/stages/S12.md) | [5](docs/stages/README.md#wave-5) | [239–253](docs/stages/S12.md), [528–530](docs/stages/S12.md), [547](docs/stages/S12.md#pr-547), [591–593](docs/stages/S12.md) | 0 / 22 | Not started |
| [S13](docs/stages/S13.md) | [Marketing & ads](docs/stages/S13.md) | [5](docs/stages/README.md#wave-5) | [254–283](docs/stages/S13.md), [531–532](docs/stages/S13.md), [548](docs/stages/S13.md#pr-548), [569](docs/stages/S13.md#pr-569), [589](docs/stages/S13.md#pr-589) | 0 / 35 | Not started |
| [S14](docs/stages/S14.md) | [CRM & customers](docs/stages/S14.md) | [4](docs/stages/README.md#wave-4) | [284–303](docs/stages/S14.md), [505](docs/stages/S14.md#pr-505), [533–535](docs/stages/S14.md) | 0 / 24 | Not started |
| [S15](docs/stages/S15.md) | [AI 360 Control Room](docs/stages/S15.md) | [6](docs/stages/README.md#wave-6) | [304–341](docs/stages/S15.md), [506](docs/stages/S15.md#pr-506), [577–585](docs/stages/S15.md) | 0 / 48 | Not started |
| [S16](docs/stages/S16.md) | [Finance, costs & reports](docs/stages/S16.md) | [6](docs/stages/README.md#wave-6) | [342–355](docs/stages/S16.md), [504](docs/stages/S16.md#pr-504), [536–537](docs/stages/S16.md), [568](docs/stages/S16.md#pr-568) | 0 / 18 | Not started |
| [S17](docs/stages/S17.md) | [Multi-store](docs/stages/S17.md) | [8](docs/stages/README.md#wave-8) | [356–377](docs/stages/S17.md), [511–512](docs/stages/S17.md) | 0 / 24 | Not started |
| [S18](docs/stages/S18.md) | [Compliance, security, manual](docs/stages/S18.md) | [8](docs/stages/README.md#wave-8) | [378–390](docs/stages/S18.md) | 0 / 13 | Not started |
| [S19](docs/stages/S19.md) | [Deploy, backup, go-live](docs/stages/S19.md) | [8](docs/stages/README.md#wave-8) | [391–403](docs/stages/S19.md), [507](docs/stages/S19.md#pr-507), [587](docs/stages/S19.md#pr-587) | 0 / 15 | Not started |
| [S20](docs/stages/S20.md) | [Fulfilment & documents](docs/stages/S20.md) | [4](docs/stages/README.md#wave-4) | [404–412](docs/stages/S20.md) | 0 / 9 | Not started |
| [S21](docs/stages/S21.md) | [Site Health & Audit](docs/stages/S21.md) | [6](docs/stages/README.md#wave-6) | [413–424](docs/stages/S21.md), [570](docs/stages/S21.md#pr-570), [594](docs/stages/S21.md#pr-594) | 0 / 14 | In progress (PR 594 readme-guard) |
| [S22](docs/stages/S22.md) | [Support (all-in-one)](docs/stages/S22.md) | [4](docs/stages/README.md#wave-4) | [425–436](docs/stages/S22.md), [538](docs/stages/S22.md#pr-538) | 0 / 13 | Not started |
| [S23](docs/stages/S23.md) | [Social & content studio](docs/stages/S23.md) | [5](docs/stages/README.md#wave-5) | [437–443](docs/stages/S23.md) | 0 / 7 | Not started |
| [S24](docs/stages/S24.md) | [Virtual Photoshoot Studio](docs/stages/S24.md) | [7](docs/stages/README.md#wave-7) | [444–480](docs/stages/S24.md), [539](docs/stages/S24.md#pr-539) | 0 / 38 | Not started |
| [S25](docs/stages/S25.md) | [Video & Campaign Creative Studio](docs/stages/S25.md) | [7](docs/stages/README.md#wave-7) | [481–490](docs/stages/S25.md) | 0 / 10 | Not started |
| [S26](docs/stages/S26.md) | [Installation, documentation & distribution](docs/stages/S26.md) | [—](docs/stages/README.md#parked) | [513–518](docs/stages/S26.md) | — / 6 | **Parked** (handover pack) |
| [S27](docs/stages/S27.md) | [No-ERP stock module](docs/stages/S27.md) | [—](docs/stages/README.md#parked) | not numbered yet | — | **Parked** (handover pack) |
| | **Total** | | **606 PRs** | **183 / 600 active** | 6 parked |

> যেকোনো স্টেজ বা PR নম্বরে ক্লিক করলে তার বাংলা সারাংশ আর পুরো বিস্তারিত দেখবেন — [সব স্টেজ আর wave এক পাতায়](docs/stages/README.md)।

### What waits on the owner

From [`BLOCKED.md`](BLOCKED.md) (the Bengali questions live there). Every open item has a safe default, so the build
never stops. Owner data (delivery charges, prices, COD, area lists, photos …) is never a blocker: the owner types it
in the backend later (CN-009).

| # | What | State |
|---|---|---|
| 4 | Read the new preview password on the server (Azure → Run command → `extas-preview-login`) | Done (CN-009): the owner has read it |
| 12 | ERP address, API key and webhook secret on Keys & connections, and which ERP warehouse is the shared one | Owner data, not a question: he types it in Keys & connections; the practice ERP runs meanwhile |
| 13 | Which locations count as sellable online stock (main warehouse only, or showrooms too) | Open — default: main warehouse only |
| 14 | Should stock-count differences ever be sent to the ERP as a correction by themselves? | Open — default: report only, nothing sent |
| 15 | Block, warn or ignore when publishing a product with no ERP stock | Open — default: check off |
| 17 | "Build your own set" price style on the desktop home tile: the owner picks style 1, 2 or 3 (Note 58) | Open — default: "None" until he picks |
| 18 | Free-delivery limit for a set: count the set price or the pieces' own prices (today: the pieces' prices); a money decision (follow-up 39) | Open — default: unchanged |
| 19 | COD limit: add the band's delivery charge the customer pays (follow-up 121) | Open — default: unchanged |
| 20 | Two orders of one customer sent as one parcel: should the system propose giving back the second delivery charge (a refund request he approves)? (PR 145) | Open — default: both orders keep their charges, nothing is given back |
| Sim 1–9 | The nine questions of the 50-order simulation (prepaid reward, risky customers, delivery-day and Day-1 messages, sets, exchange charge, Eid pre-order, rider overcharge, apology credit, coupons) | Answered (CN-018); questions 3 and 9 decided in CN-019 (Messages control centre) |
| 16 | Who receives low-stock alerts, and from how many pieces | Owner data, not a question: set in the backend; default 2 pieces, shown in the admin, no message sent |
| 5 | The admin login e-mail | Answered (CN-009/CN-010): the owner account is opened on the server by `owner-account.yml`; he reads the first password with `extas-owner-login` ([steps in Bengali](docs/owner/OWNER-LOGIN.md)); never committed |
| 6 | Delivery charges, free-delivery limit, COD, exchange limit, AI budget | Answered (CN-009): owner data, entered later in the backend |
| 7 | Watermark text on downloaded photos | Answered (CN-009): www.extas.com.bd, set in the live store by `store-settings.yml` (not in Git) |
| 8 | May unused photos ever be deleted? | Answered (CN-009): never — archive only |
| 10 | Where the struck-through "was" price comes from | Answered (CN-009): the real MRP where it exists; combos = sum of separate prices; never invented; store value set by `store-settings.yml` |
| 1, 2, 3 | Runner on the server · Cloudflare `new` record · 4-piece prices | Done (20 Oct) |

---

## How it is built

> **বাংলায় সংক্ষেপে:** দোকানটা একটাই সার্ভারে চলে (Azure, মালয়েশিয়া)। কোড GitHub-এ মার্জ হলে সার্ভারের ভেতরের "রানার"
> নিজে থেকে নতুন সংস্করণ বসায়, পুরোনোটা না থামিয়ে; সমস্যা হলে আগেরটায় ফিরে যায়। স্টক আর হিসাবের আসল খাতা আপনার ERP।

### The stack

Blueprint [A3.1](docs/BLUEPRINT.md#a31-the-stack) and [A2.9](docs/BLUEPRINT.md#a29-server-specification--v21--19-oct-2333-owner-cn-001--locked).

| Layer | What we use |
|---|---|
| App | Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · zod |
| Data | PostgreSQL 17 behind PgBouncer (transaction pool) · Prisma 6 (one schema, 333 models, `storeId` on every store table) |
| Queues and cache | Redis, split in two: an LRU cache (on the fast NVMe) and a no-eviction queue store (AOF, data disk) for BullMQ |
| Search | Meilisearch (PostgreSQL `pg_trgm` only for fuzzy matching such as fraud checks) |
| Images | sharp: 5 sizes × AVIF / WebP / JPEG at 4:5 |
| Web server | Caddy (automatic HTTPS, HTTP/3, password + `noindex` on the preview) behind Cloudflare |
| Runtime | Docker Compose; every container's RAM and CPU from one auto profile ([`infra/config/server.conf`](infra/config/server.conf), PR 604) |
| Media storage | Storage adapter: local disk on the media volume (default today), Azure Blob or S3-compatible once their keys are in |
| Backups | Data disk + Azure Blob (WAL, point in time) + Google Drive (encrypted daily dump) — Blob and Drive switch on when their keys are entered |
| Package manager | pnpm 10 workspace, Node 22 |

### Architecture overview

```
           Cloudflare  ──►  Caddy (HTTPS, preview password)  ──►  app: Next.js, blue/green, 6 replicas
                                                                     │  apps/web (pages + /api routes)
                                                                     │  uses packages/*  (domain logic)
                      ┌──────────────────────┬──────────────────────┼───────────────────┬────────────────┐
                 PostgreSQL 17          Redis cache /         Meilisearch        media volume /      EXTAS ERP
                 (via PgBouncer)        Redis queue                              Blob / S3           (HTTP API, CN-005)
```

- **`apps/web`** is the only app: the storefront (from S02), the admin (`/admin/*`), the admin API
  (`/api/admin/*`), the public API (`/api/back-in-stock`, `/api/health`, media) and the status page. Route handlers
  are thin: they check the session and permission, then call a package.
- **`packages/*`** hold all business logic, each with its own tests: `settings`, `vault`, `auth`, `db`, `adapters`,
  `media`, `catalogue`, `inventory`, `jobs`, `seed` ([folder list](#folder-structure)). Long jobs are job functions
  run by the background worker (`packages/jobs`, PR 6: BullMQ on the queue Redis, one scheduler leader, a `JobRun`
  row per attempt, retries and a dead letter); a few (image sizes) still run inline right after the answer.
- **`infra/`** is the server as code: S0A setup scripts, the Docker stack, the deploy script and the backup, restore
  and monitor tools.
- **Settings, not code.** Every name, number, text and limit is a declared setting (store → installation → default),
  every key is in the encrypted vault, every integration is an adapter that runs on a mock until its key arrives
  (Blueprint [A1.3](docs/BLUEPRINT.md#a13-nothing-is-ever-blocked-waiting-for-a-credential), [A7](docs/BLUEPRINT.md#a7-settings-framework-and-handover-ready-rules-v2--s00-additions-approved-18-oct)).
- **Multi-store ready.** One server, one codebase, up to three stores (Blueprint [A4](docs/BLUEPRINT.md#a4-multi-store--three-stores-one-server-one-codebase)); every store table carries `storeId`. The store switcher comes with S17.

### The ERP is the master

Blueprint [A3](docs/BLUEPRINT.md#a3-architecture--the-erp-is-the-master) and the contract
[`docs/ERP-API-CONTRACT.md`](docs/ERP-API-CONTRACT.md) (CN-005).

- **The ERP owns** variants and SKUs, stock on hand, goods receiving, purchasing, suppliers, production and all the
  accounting. **The shop owns** the storefront, presentation and SEO, content, customer accounts, cart and checkout,
  payments, combos, fraud and location checks, CRM and marketing, the AI agents and the reports.
- **ERP → shop:** variants and stock (pulled into a local mirror for fast pages). **Shop → ERP:** confirmed orders,
  payments, shipments, returns and ad spend — always as **business documents, never journal lines**.
- Cart holds stay local and are never pushed; after the order is confirmed the ERP's own reservation takes over.
- Every call carries the company; a key for the wrong company stops the sync.
- **The ERP is optional** (PR 497–499): each store runs on our ERP, another ERP, or no ERP; every ERP-dependent path
  has a written behaviour for each case. The endpoints on the ERP side are built in the owner's ERP project.

### Deploy: the runner on the VM (CN-003)

Cloud build sessions cannot open SSH to the VM. Instead a **GitHub Actions self-hosted runner** lives on the VM
(label `extas-vm`), installed once by the owner through Azure *Run command*
([`docs/owner/RUNNER-SETUP.md`](docs/owner/RUNNER-SETUP.md), [`infra/bootstrap/install-runner.sh`](infra/bootstrap/install-runner.sh)).
No SSH key is exchanged.

| Workflow | Runs on | When | What it does |
|---|---|---|---|
| [`ci.yml`](.github/workflows/ci.yml) | GitHub-hosted | every pull request and every push to `main` | **infra:** shellcheck + infra unit tests · **web:** manifest and font checks, hardcode guard, owner-data check, lint, type-check, unit tests, build, Lighthouse budget, both Docker images · **db:** migrations on PostgreSQL 17 with a drift check, every package's database tests, settings / auth / sample sync run twice (second run must change nothing), installation export / import |
| [`deploy.yml`](.github/workflows/deploy.yml) | `extas-vm` | after `ci` passes on `main` (or by hand, with a "rollback" switch) | builds the app and migrate images on the VM, then [`infra/deploy/deploy.sh`](infra/deploy/deploy.sh): migrate the database (schema, settings sync, auth sync, default pack), start the new colour beside the old, smoke-test it, switch Caddy gracefully, keep the old colour on any failure; writes `state/last-deploy.json` |
| [`smoke.yml`](.github/workflows/smoke.yml) | `extas-vm` | every night at 03:30 Dhaka, and by hand | the smoke test (below) on the live version; commits the report to [`docs/reports/smoke/latest/`](docs/reports/smoke/latest/README.md) |
| [`server-setup.yml`](.github/workflows/server-setup.yml) | `extas-vm` | by hand, or when `infra/server`, `infra/stack` or `infra/config` change | runs [`infra/server/setup.sh`](infra/server/setup.sh) (idempotent), commits the machine report to [`docs/reports/server/`](docs/reports/server/latest.md); inputs: only some steps, data-disk override, k6 re-measure, rotate the preview password |

Migrations only add (expand first, contract later), so the old colour keeps working while the new one starts and a
rollback needs no down-migration.

**Smoke test (CN-016).** After every deploy and every night, [`infra/deploy/smoke.sh`](infra/deploy/smoke.sh) opens
every built storefront page signed out and every admin page signed in, on a phone (390×844) and a desktop (1366×900)
screen, through Cloudflare like a visitor ([`tools/smoke.mjs`](tools/smoke.mjs), page list in
[`docs/qa/smoke.json`](docs/qa/smoke.json)). It signs in with a read-only check account (`smoke-check` role, read
permissions only) whose password and two-step seed are made fresh on the server each run and never leave it. A page
fails on a 5xx, the error screen, a console or page error, or a failed request. After a deploy, a failure puts the
previous version back by itself and the run goes red; the fix comes before any new PR. The report and one picture per
page and screen go to [`docs/reports/smoke/latest/`](docs/reports/smoke/latest/README.md); the result is on `/status`
and in the deploy report. Settings: `SMOKE_*` in [`infra/config/server.conf`](infra/config/server.conf). CI runs the
same journey on the production images before every merge (sign-in end to end, PR 4).

### Staging now, go-live later

- **Now:** every merge goes live on **new.extas.com.bd** (password + `noindex`). The owner follows progress there.
- **Go-live gate** (Blueprint [E3](docs/BLUEPRINT.md#e3-order-of-work), START-HERE): Blob and Drive backups with the
  first restore test, Telegram alerts, every server item of A2.9 (Server page, monthly speed check, report
  pre-computation) and the Appendix C QA gate green.
- **Go-live day** (S19, PR 587): extas.com.bd switches to the new shop, every old WordPress address 301-redirects.
  This needs the owner's explicit go-ahead. The domain is a setting, never code.

---

## Local setup and useful commands

> **বাংলায় সংক্ষেপে:** এই অংশ ডেভেলপারের জন্য — নিজের কম্পিউটারে কোড চালানোর নিয়ম।

Requires **Node.js 22** and **pnpm 10** (through corepack). Docker for a local PostgreSQL.

```bash
corepack enable
pnpm install                 # installs every workspace package; @extas/db generates the Prisma client
pnpm status:gen              # builds the status page data from the register and BLOCKED.md
pnpm dev                     # the web app on http://localhost:3000 (redirects to /status)
```

For anything that touches the database, start a PostgreSQL 17 and set `DATABASE_URL` and `DATABASE_DIRECT_URL`
(PgBouncer and direct; both the same locally), then `pnpm --filter @extas/db migrate:deploy`,
`pnpm --filter @extas/settings sync`, `pnpm --filter @extas/auth sync` and, for demo data,
`pnpm --filter @extas/seed sample`. Database tests need `TEST_DATABASE_ADMIN_URL` (a user who may create
databases); **without it they are skipped silently**, so check the test count. The vault needs `VAULT_MASTER_KEY`
(generated on the server; use any throwaway value locally). Never commit an `.env`.

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server for `apps/web` |
| `pnpm build` | status data, then every package's build |
| `pnpm lint` | ESLint in every package (`eslint-config-next` in the app, `typescript-eslint` in packages; Prisma validate + format check in `db`) |
| `pnpm typecheck` | `tsc --noEmit` everywhere |
| `pnpm test` | vitest in every package |
| `pnpm guard` | the hardcode guard ([`tools/hardcode-guard.mjs`](tools/hardcode-guard.mjs)) |
| `pnpm check` | guard + lint + typecheck + test — run before every push |
| `pnpm status:gen` | [`tools/make-status.mjs`](tools/make-status.mjs): register + BLOCKED.md → `apps/web/src/generated/status.json` |
| `pnpm --filter @extas/db migrate:deploy` · `migrate:diff` · `validate` · `format` | Prisma through `packages/db/scripts/prisma.mjs` |
| `pnpm --filter @extas/settings sync` | write the settings declarations to the database (idempotent, locked) |
| `pnpm --filter @extas/auth sync` · `create-owner` | permission catalogue + owner role; the first owner (on the server only) |
| `pnpm --filter @extas/seed pack:apply` · `sample` · `owner-data:check` · `export:installation` · `import:installation` | default pack, sample catalogue, owner-data check, installation export / import |
| `pnpm --filter @extas/media render-pending` | make the missing photo sizes |
| `infra/tests/run.sh` | infra unit tests (no root, no real disks) |

> The machine that builds the app needs memory: a type-check of the full Prisma client takes about 3 GB of heap
> (`NODE_OPTIONS=--max-old-space-size=4096`, as CI and the Dockerfile set).

---

## The server

> **বাংলায় সংক্ষেপে:** সার্ভার পুরো তৈরি আর পরীক্ষা করা (S0A, ১২/১২)। প্রতিদিন ব্যাকআপ হয়, প্রতি মিনিটে নজরদারি চলে,
> ব্যাকআপ থেকে ফেরানোর পরীক্ষাও পাস। Azure Blob, Google Drive আর টেলিগ্রাম চালু হবে আপনি অ্যাডমিনে কী বসালে।
> সহজ বাংলায় পুরো বিবরণ: [`docs/SERVER.md`](docs/SERVER.md)।

Latest machine report: **[`docs/reports/server/latest.md`](docs/reports/server/latest.md)** (written by every
`server-setup` run; overall PASS). Specification: Blueprint
[A2.9](docs/BLUEPRINT.md#a29-server-specification--v21--19-oct-2333-owner-cn-001--locked).

**The machine.** Azure **E8ds_v6** (8 vCPU, 64 GB), Malaysia West zone 1 (CN-002), Ubuntu Server 24.04 LTS.
OS disk 128 GB; a separate **1 TB data disk** in LVM; a **440 GB local NVMe** that is blank on every boot. Inbound
22 / 80 / 443 only.

**What `infra/server/setup.sh` sets up (S0A), step by step** — each step is idempotent and checks before it changes:

| Step file | PR | What it does |
|---|---|---|
| `01-specs.sh` | 1 | Records size, CPU, RAM, disks, region (read-only) into the report |
| `02-os.sh` | 2 | Verifies Ubuntu 24.04 and applies every update |
| `03-harden.sh` | 3 | SSH keys only, no root login, fail2ban, unattended security updates, UFW 22/80/443, Asia/Dhaka time zone; an optional Cloudflare-only mode |
| `04-nvme.sh` | 601 | Installs `extas-nvme.service`: at every boot, before Docker, the NVMe is prepared and mounted at `/mnt/nvme` (temp files, Redis cache, backup staging); OS-disk fallback with an alert |
| `05-datadisk.sh` | 1, 3 | LVM on the data disk: separate volumes for base, PostgreSQL (250 GB), Redis, search, media (100 GB), backups (150 GB), logs, Docker, plus 16 GB swap; room left to grow |
| `06-kernel.sh` | 3, 5 | Network and kernel tuning (backlog, BBR, swappiness 10, huge pages off, file limits) |
| `07-docker.sh` | 4 | Docker Engine + Compose, log rotation, live-restore, boot order NVMe → data disk → Docker |
| `08-profile.sh` | 604 | Auto profile: reads CPU and RAM and computes every container limit (on this box: 6 app replicas, PostgreSQL 16 GB, Redis 4 + 2 GB, Meilisearch 4 GB, image worker 6 GB, 11 GB kept for the OS) |
| `09-stack.sh` | 5, 6, 7 | PostgreSQL 17 tuned from the profile with PgBouncer, temp files on NVMe, WAL archive, slow-query log over 100 ms; Redis cache + queue; Meilisearch; Caddy with HTTPS, HTTP/3, the preview password and `noindex`. Secrets are generated on the server (`/srv/extas/config/secrets`, mode 600) |
| `10-backup.sh` | 8 | Backup timers, the first backup and the first restore test |
| `11-monitor.sh` | 9 | The monitor timer |
| `12-k6.sh` | 10 | k6 load baseline (recorded: p95 about 7 ms at about 15,000 requests a second on the plain page) |

**Server tools** (installed to `/usr/local/sbin`, sources in [`infra/server/bin/`](infra/server/bin)):

- **`extas-backup`** (PR 8) — `daily` at 02:30: base backup for point-in-time restore + logical dump + config,
  staged on NVMe, kept on the data disk, uploaded to Azure Blob and, encrypted, to Google Drive. `wal` every minute
  pushes WAL to Blob. `prune` keeps the retention. Blob and Drive say "not connected" until their keys are in the
  vault; local backups run regardless. Product photos go in too (a full archive every
  `BACKUP_MEDIA_FULL_EVERY_DAYS`, only changes in between, a checksum list; `BACKUP_MEDIA="no"` switches it off), and
  a dated docs bundle (README, blueprint, register, all of docs/, with the commit hash; CN-011).
- **`extas-restore`** (PR 8) — `test` restores the newest base backup + WAL into a throwaway PostgreSQL on the NVMe
  and checks it (run after every setup; monthly by timer later, PR 395/507). `--from local|blob|drive
  [--at "YYYY-MM-DD HH:MM"] [--target staging|production]` — production needs the typed word RESTORE and keeps the old
  data. The test also restores one sample photo (checksum) and unpacks the newest docs bundle (commit must match).
  `media --from local|blob|drive [--into live]` brings all photos back; into live it only adds missing ones. Last
  test: 336 tables restored, matching live.
- **`extas-monitor`** (PR 9) — every minute: disks (alert at 80%), services, NVMe, backups, speed → writes
  `state/health.json` (read by the status page now, by the admin Server page later). Sends to Telegram once the bot
  key is in Keys & connections; until then to the log.
- **`extas-profile`** (PR 604), **`extas-nvme-prepare`** (PR 601), **`extas-find-data-disk`** (finds the 1 TB disk
  safely), **`extas-preview-login`** (the owner reads the preview password; CN-007).

**The admin Server page** `/admin/server` (permission `system.read`) — **first part built** with the background
worker (PR 6, 23 Oct): a verdict (ok · stale · stopped · never started), the leader, jobs waiting / running / failed
in the last hours, the failed jobs with their reason and next try, and every worker's last heartbeat. The rest
(plain-language CPU, RAM, disks, services, cache hit, slow queries, last backups, speed) is **planned** — S21, PR 423
(with 601, 602, 603, 604); the demo shows it at `#/admin/server`. Until then that state is on `/status` and in the
committed server reports. Guide: [docs/admin-guide/server.md](docs/admin-guide/server.md).

---

## Folder structure

> **বাংলায় সংক্ষেপে:** কোন ফোল্ডারে কী আছে, এক লাইনে।

```
.
├── CLAUDE.md                 owner's standing rules for every build session (read first)
├── PROGRESS.md               the exact stopping point, one line per merged PR group
├── BLOCKED.md                questions only the owner can answer (Bengali), newest first
├── README.md                 this page: the live front page
├── package.json              root scripts (dev, build, lint, typecheck, test, guard, check, status:gen)
├── pnpm-workspace.yaml       workspace = apps/* + packages/*
├── lighthouserc.json         the Lighthouse speed budget and the pages it measures
├── .github/
│   ├── workflows/            ci.yml · deploy.yml · server-setup.yml
│   └── pull_request_template.md
├── .claude/agents/           build-agent roles: stage-builder, qa-gate, infra-prohori
├── apps/
│   └── web/                  the Next.js app (storefront from S02, admin, API, status page)
│       ├── src/app/          pages and route handlers: admin/*, api/admin/*, api/*, media/*, status
│       ├── src/components/   admin/ (frame, products, stock, size charts, integrations) and media/ (ResponsiveImage)
│       ├── src/lib/          thin glue: admin auth, API handlers per area, i18n, settings, status, nav
│       ├── src/fonts/        self-hosted fonts (Hind Siliguri, Instrument Sans, Archivo; OFL-1.1)
│       ├── messages/         every visible text, English + Bengali JSON per screen
│       └── Dockerfile        app image + one-shot migrate image
├── packages/
│   ├── db/                   Prisma schema (333 models), migrations, client, schema tests
│   ├── settings/             settings registry, resolver, sync, owner-data register, admin settings API
│   ├── vault/                encrypted credential vault
│   ├── auth/                 staff and customer sign-in, sessions, 2FA, permissions, roles, audit log
│   ├── adapters/             adapter framework (mock / sandbox / live), storage, ERP, page reader
│   ├── media/                image pipeline, watermark, delivery, media library
│   ├── catalogue/            products, variants, categories, colours, fabrics, naming, publish, size charts, CSV …
│   ├── inventory/            ERP mode and guard, sync, stock pull, holds, pushes, counts, reports, ERP webhooks
│   ├── jobs/                 background worker: BullMQ queues, scheduler leader, JobRun per attempt, heartbeat
│   ├── metrics/              the one KPI definition: Sales (delivered) and Ordered value for every report
│   └── seed/                 default pack, sample catalogue, owner-data check, installation export / import
├── infra/
│   ├── bootstrap/            install-runner.sh (one-time runner install by the owner)
│   ├── config/server.conf    the one server config file (no secrets)
│   ├── server/               setup.sh, lib.sh, steps/01–12, bin/ (server tools), files/ (systemd units)
│   ├── stack/                compose.yml (database, cache, search, Caddy), app.yml (blue/green app), Caddyfile, PgBouncer image
│   ├── deploy/deploy.sh      zero-downtime deploy with automatic rollback
│   ├── deploy/app-role.sh    the app's own database role (extas_app), its login and the append-only check
│   └── tests/                infra unit tests and fixtures
├── tools/                    hardcode guard (+ rules JSON), status generator, their tests
└── docs/                     blueprint, register, demo, owner notes, QA, agents, reports — see docs/README.md
```

Every package's `src/index.ts` starts with a short comment saying what the package is for; its `package.json`
`description` says the same in one line.

---

## Features by area

> **বাংলায় সংক্ষেপে:** প্রতিটা ধাপে কী কী তৈরি হয়েছে — কোন পাতা, কোন বোতাম, পেছনে কী হয়। যেগুলো এখনো হয়নি, সেখানে
> শুধু লেখা আছে কোন PR-এ আসবে।

Areas are in build order (waves). Built areas list their screens, API routes, settings, permissions and tests; each
PR's full scope is its row in the register's **Build status** table.

### S0A · Server foundation — Done (12/12, live)

> **বাংলায়:** সার্ভার কোড দিয়ে তৈরি — নিরাপত্তা, ডিস্ক, ডাটাবেস, ব্যাকআপ, নজরদারি, গতি মাপা। সব চালু।

PR 1–10, 601, 604. Everything is described under [The server](#the-server). Highlights: idempotent setup as code,
NVMe boot unit (601), hardware-aware auto profile (604), tuned PostgreSQL + PgBouncer, split Redis, Caddy with the
preview password (PR 7; the password is generated on the server, rotatable, never in chat — CN-007), backups with a
tested restore (8), monitoring every minute (9), k6 baseline (10). **Background worker (PR 6, CN-022, 23 Oct):**
`packages/jobs` runs every long job off the web process — BullMQ on the no-eviction queue Redis, one scheduler leader
(a Redis lock), a `JobRun` row per attempt (status, tries, next try, reason), backoff and a dead letter, a run that
already succeeded is never repeated, a dead worker's run is closed as `WORKER_LOST` and taken over; heartbeats in
`WorkerHeartbeat` (migration `0008_worker`). It runs as the `worker` service of each deploy colour
([`infra/stack/app.yml`](infra/stack/app.yml), from the migrate image, sized by `extas-profile`); settings `jobs.*`
(registry v22, group system); the admin Server page shows it; the smoke test checks its heartbeat. A rollback starts the previous good
version's worker too: the deploy record keeps `worker_image` / `previous_worker`, and the image clean-up never removes
an image a record still needs ([`infra/deploy/images.sh`](infra/deploy/images.sh), follow-up 82). **Preview gate and
the ERP (PR 7, follow-up 80):** only `POST /api/erp/webhook` passes without the preview login (the message proves
itself with its signature, PR 196); every other method and path still asks; a smoke check sends an anonymous POST and
expects the app's own answer, not the login box. Deploys (PR 4) now commit their result back to
[`docs/reports/server/deploy-latest.md`](docs/reports/server/) with a history line (`[skip ci]`, no loop). Tests: shellcheck and
[`infra/tests/run.sh`](infra/tests/run.sh) in CI. Register: [S0A](docs/MASTER-REGISTER.md#s0a--server-foundation--pr-110) ·
report: [`docs/reports/2026-10-20-S0A.md`](docs/reports/2026-10-20-S0A.md).

### S00 · Foundation — Done (19/19)

> **বাংলায়:** কোডের ভিত্তি: সেটিংস, কী রাখার ভল্ট, লগইন আর অনুমতি, পুরো ডাটাবেসের নকশা, "কিছুই কোডে লেখা নয়" পাহারা,
> অ্যাডমিনে ঢোকা আর "Keys & connections" পাতা।

PR 11–18, 491–496, 500, 508–510, 603. Register: [S00](docs/MASTER-REGISTER.md#s00--foundation--pr-1118) ·
report: [`docs/reports/2026-10-20-S00.md`](docs/reports/2026-10-20-S00.md).

**Repository, CI and deploy (PR 11, 12, 17).** pnpm workspace, Next.js 16 + TypeScript strict + Tailwind 4,
[`docs/CONVENTIONS.md`](docs/CONVENTIONS.md), the PR template, CI and the blue/green deploy
([above](#deploy-the-runner-on-the-vm-cn-003)). The Lighthouse gate measures real paint under 4G + 4× CPU
throttling, median of 3, on every admin page listed in [`lighthouserc.json`](lighthouserc.json).

**Status page (`/status`).** Bengali progress page: stages and PRs done (from the register), the last good deploy,
server health and the last backups (from the server's `state/` files: `last-good-deploy.json`, `health.json`,
`backup-daily-*.json`), and what waits for the owner (from BLOCKED.md).
`noindex`. The home address `/` redirects here until the storefront exists.

**Database (PR 13, 603) — `packages/db`.** The full Prisma schema for all 28 stages in one pass: 333 models,
`storeId` on every store table (exceptions listed and guarded by a test), settings, vault, roles. Index pack:
category page, variant by colour/size, order by phone, history, list filters, style hierarchy; `pg_trgm` GIN
indexes; 4 report materialized views. Migrations: `0001_init`, `0002_archived_links` (columns only). CI applies them
to PostgreSQL 17 and fails on any drift.

**Hardcode guard (PR 494) — `tools/hardcode-guard.mjs`.** First CI step. Rules are data
([`tools/hardcode-guard.json`](tools/hardcode-guard.json)): secrets, owner data (brand, domain, phones, e-mails), ৳
amounts, business numbers, visible JSX text, and since 23 Oct (follow-up 14, SIM-F-033, F-031) reply hours, promises
to the customer and fixed calendar dates written into code; the simulation's hard-coded texts are its test cases. An
opt-out needs a written reason.

**Credential vault (PR 493) — `packages/vault`.** Envelope encryption: server master key → HKDF → wrapped data keys
→ AES-256-GCM per secret, bound to its name and store. Every read is logged; revoke without delete; data-key and
master-key rotation; tamper is refused.

**Settings framework (PR 491, 492, 496, 510) — `packages/settings`.** Every setting is declared once (key, zod
schema, default, scope, who may change it, Bengali/English label) in `registry*.ts`. `settings sync` writes the
declarations to the database on every deploy. Resolver: store value → installation value → declared default,
cached and refreshed when any setting changes. Changes are validated, versioned and logged (who, when, old → new);
reset to default goes one level up. Owner data has no default. API: `GET /api/admin/settings` (read-only list of
keys, effective values and their source; needs `settings.read`; never owner data or vault entries).

**Adapter framework (PR 18) — `packages/adapters`.** Every integration is one adapter with mock / sandbox / live,
chosen per store or installation from its connection row. The Test button records each run; a connection leaves
mock only after a passing test (audited); keys come from the vault, cached briefly, scrubbed from messages. Storage
adapter: local disk (default, on the media volume), Azure Blob, S3-compatible — tested against Azurite and an S3
server in CI.

**Sign-in, permissions, roles (PR 15, 16, 495) — `packages/auth`.** Staff login (e-mail + password, scrypt,
wrong-try pause, login alerts) and customer password login per store; opaque session tokens stored hashed in
`__Host-` cookies with idle and total limits; device list and "log out everywhere"; optional 2FA by authenticator
app (seed in the vault). Every admin action is permission-checked on the server. Role builder: the permission
catalogue is code ([`packages/auth/src/catalogue.ts`](packages/auth/src/catalogue.ts)), roles are data; the owner
role always holds every permission; nobody grants more than they hold; the last owner cannot be paused or removed;
roles are archived, never deleted; every staff/role change goes to the append-only audit log.
The first owner account is opened on the server by [`owner-account.yml`](.github/workflows/owner-account.yml)
(e-mail masked, first password made on the VM, read with `/usr/local/sbin/extas-owner-login`; a second run refuses). When the owner cannot
sign in, [`owner-reset.yml`](.github/workflows/owner-reset.yml) gives his account a new first password the same way
(`infra/server/bin/extas-owner-reset`: sessions ended, a wrong-try wait lifted, two-step login kept) and its report
says why the sign-ins failed (counts only).

| Route | Purpose |
|---|---|
| `POST /api/admin/auth/login` · `/2fa` · `/logout` | sign in (then the 2-step code if on), sign out |
| `GET /api/admin/auth/me` | who is signed in and what they may do |
| `POST /api/admin/auth/password` · `/totp` | change own password (other sessions end) · set up / switch 2FA |
| `GET/POST /api/admin/auth/sessions` | device list, log out everywhere |
| `GET/POST /api/admin/staff` · `PATCH …/[id]` · `POST …/[id]/roles` | staff accounts; give or take a role per store or all stores |
| `GET/POST /api/admin/roles` · `PATCH …/[id]` · `GET /api/admin/permissions` | role builder and its catalogue |

Permissions so far: `settings.read/write`, `vault.read/write`, `roles.read/manage`, `staff.read/manage`,
`audit.read`, `security.read`, plus the media, catalogue and inventory keys listed in their areas below.

**Owner data, default pack, sample catalogue (PR 509, 508, 14) — `packages/seed` + `packages/settings/src/owner-data.ts`.**
The "my own data" register (owner settings, 5 key prefixes, 23 tables, 2 columns, all media) with a CI check
(`owner-data:check`) and an installation export / import that leaves all of it out and refuses on any owner value.
The general default pack (`packages/seed/data/default-pack.json`): garment types, 7 hidden categories, 3 delivery
bands switched off with no charge, 14 SMS / WhatsApp / e-mail templates in Bengali + English; applied add-only on
every deploy. The sample catalogue (`sample`): the demo's 17 products, 227 variants, size charts, collections, tags
and one demo order in a "Sample" store; a second run changes nothing.
The owner's own values reach the live store only from the server: [`store-settings.yml`](.github/workflows/store-settings.yml)
runs `settings cli.ts set` with the live migrate image (validated, logged with the reason, owner-OK flag for money
settings; the log names keys only).

**Admin frame and Keys & connections (PR 500).**

| Screen | What it does |
|---|---|
| `/admin/login` | sign in, the 2FA step and the first-password step; English / বাংলা switch; an e-mail without "@" gets "write the full e-mail address" and is not sent (owner, 20 Oct; smoke-checked) |
| ~~admin frame~~ | ~~sidebar grouped Catalogue / Inventory / System from [`apps/web/src/lib/admin-nav.ts`](apps/web/src/lib/admin-nav.ts) (only pages that exist); `/admin` opens the first page~~ replaced by the admin shell below (PR 12, 23 Oct) |
| `/admin/integrations` — **Keys & connections** | every declared connection with its state; save a key → it goes into the vault → it is tested → the connection leaves mock only on a pass; remove = revoke, nothing deleted; every step audited; a saved key is never shown again. The connection list is data ([`packages/adapters/src/catalogue.ts`](packages/adapters/src/catalogue.ts)); "Our ERP" and the page reader are on it |

API: `GET /api/admin/integrations`, `POST /api/admin/integrations/[id]` (save / test / remove). Screenshots:
[`docs/qa/screenshots/pr-500/`](docs/qa/screenshots/pr-500). Guides: [docs/admin-guide/login.md](docs/admin-guide/login.md) (sign-in and the frame),
[docs/admin-guide/integrations.md](docs/admin-guide/integrations.md) (Keys & connections).

**The new admin shell (PR 12, updated 23 Oct, CN-018 / CN-022; demo V12.3 `#/admin`).**

> **বাংলায়:** অ্যাডমিনের নতুন কাঠামো: বাঁ পাশে ১৪টা সেকশন চার ভাগে, প্রতিটার পাশে অপেক্ষার কাজের সংখ্যা; ট্যাবলেটে শুধু আইকন,
> ফোনে পাশ থেকে খোলা মেনু আর নিচে বার। Ctrl K বা "/" চাপলে সব খোঁজা যায়। প্রতিটা পাতায় "এই সেকশনে কী করা যায়" চাপলে
> বাংলা গাইড পাশে খোলে। নতুন ড্যাশবোর্ড: বিক্রি আর অর্ডারের মূল্য আলাদা ঘরে, আর "এখনই করতে হবে"। যে সেকশন এখনো তৈরি
> হয়নি, সেখানে সৎভাবে "পরের ধাপে আসছে" লেখা। সব পাতার ঠিকানা আগের মতো; শুধু ডেলিভারি এখন `/admin/delivery/zones`।

| Screen / part | What it does |
|---|---|
| sidebar, top bar | 14 sections in four groups (daily work: Dashboard, Orders, Products, Customers, Delivery, Messages, Support · grow: Marketing, Website · business: Money, Reports, AI Center · bottom: Settings, Help & Build) from [`apps/web/src/lib/admin-shell/sections.ts`](apps/web/src/lib/admin-shell/sections.ts); shown by permission, AI Center to owners only; waiting-work badges (`GET /api/admin/shell/badges`, cached `admin.shell.badgeCacheSeconds` 30 s); icon rail at 768–1023 px; drawer and bottom bar (Home · Orders · Support · Search · More) on a phone; search, bell, EN \| বাং, account menu (open the shop, sign out) |
| section tabs | each section's built pages as tabs, the rest under "More ▾"; "Section › Tab" breadcrumb and the guide button on every page |
| search palette | Ctrl K / ⌘ K / "/": pages, settings, products, orders, customers (`GET /api/admin/search?q=`); `>` actions, `#` order numbers, `?` guides; Bengali words and digits; limits `admin.shell.searchPerGroup` 5, `searchMinChars` 2 |
| guide panel (SH-05, follow-up 84) | the section's or tab's Bengali guide beside the page, read from the deployed docs copy (`GET /api/admin/help/<slug>`); `/admin/help` lists every section with its guide |
| notifications | the person's own (`GET /api/admin/notifications`); none are made yet, so it says so |
| `/admin` — Dashboard (DSH-01) | greeting, date, store; **Delivered sales** (M1, provisional) and **Ordered value** (final) for today / 7 / 30 days through `@extas/metrics` with ▲/▼ and a small line (PR 155, follow-up 90; `metrics.read`); **Needs you now** from the real queues (`GET /api/admin/dashboard/queues`); a role with a start page (`admin.startPages`, PR 495, empty) opens there instead; `?home=1` always shows the Dashboard |
| unbuilt sections | `/admin/orders`, `/admin/customers`, `/admin/messages`, `/admin/support`, `/admin/website`, `/admin/money`, `/admin/reports`, `/admin/ai`, `/admin/settings`: an honest placeholder with the coming pages and links to what exists |
| states (SH-07) | not found (HTTP 404), no permission (names the permission), error with retry and an error id, all inside the shell |
| moved | `/admin/delivery` → `/admin/delivery/zones` (308); every other URL kept |

Permissions `dashboard.read`, `metrics.read`, `help.read`. Settings registry v33 (`registry-admin-shell.ts`): `admin.shell`,
`admin.dashboard` {ranges [1, 7, 30], afternoonHour 12, eveningHour 17, sparkDays 14}, `admin.startPages` {}. No migration.
Smoke: every admin page and placeholder (`docs/qa/smoke.json` `admin`), the endpoints, the palette, the 404 and the states;
device gate: Dashboard, Help, a placeholder, the not-found state. Guides: [dashboard](docs/admin-guide/dashboard.md),
[sign-in and the shell](docs/admin-guide/login.md). Screenshots: [`docs/qa/screenshots/pr-12/`](docs/qa/screenshots/pr-12).

### S01 · Catalog, media & images — Done (22/22)

> **বাংলায়:** পণ্য রাখা, সাজানো আর ছবির পুরো ব্যবস্থা: রং-সাইজ-SKU, ক্যাটাগরি, কাপড়, নাম-লিংক, ছবি (৫ সাইজ), চালুর আগে
> যাচাই, সাইজ চার্ট, কালেকশন, CSV, লিংক থেকে পণ্য, "আবার এলে জানাবেন", অডিট।

PR 19–39, 590. Register: [S01](docs/MASTER-REGISTER.md#s01--catalog-media--images--pr-1939) · report:
[`docs/reports/2026-10-20-S01.md`](docs/reports/2026-10-20-S01.md). Packages: `@extas/catalogue`, `@extas/media`.

**Catalogue domain (PR 19, 20, 30, 31, 590).** Products and variants keyed by the **ERP SKU** (format setting,
unique per store, never changed, a retired SKU never reused, one variant per colour × size). Prices need
`catalogue.prices` and every change writes PriceHistory. Category tree with sub-categories and inherited garment
types; a changed category link forwards 301. Colour library (one hex, bilingual names and synonyms, family,
"similar shade" note, true-colour photo). Structured fabric and care from owner-editable bilingual dictionaries
(GSM optional, never invented); plain product facts in en/bn for the page and the AI. Naming and links: a real
brand field, shop-wide templates with `{brand} {name} {style} {type} {cat} {colour} {price} {fit} {shop}…`, changed
links forward without chains, every rename kept with a before/after orders report, bulk rename and template apply
with preview + hash.

**Image pipeline and media library (PR 22, 23, 24, 25, 37).** Upload → the original archived byte for byte → 5
sizes (thumb 160, card 400, card2x 800, main 1200, zoom 2000) at 4:5, each AVIF + WebP + JPEG, quality 78, dominant
colour stored, hashed names, reuse by checksum. The watermark is only on the download copy
(`/api/media/<id>/download`); shop images stay clean. `<ResponsiveImage>` serves `<picture>` with srcset (a phone
never gets the 2000 size), width/height always set, colour box, eager first screen. Photo minimum: front, back,
detail, on-model. Media library: search, "where used", orphan archive only by an explicit, logged admin action;
nothing is removed from storage. 26 `media.*` settings.

**Product admin and publishing (PR 21, 26, 29, 35).**

| Screen | What it does |
|---|---|
| `/admin/products` | list with search (name, colour, SKU), status and category chips, counters, issue chips, health score; bulk publish / unpublish / recheck / archive / restore |
| `/admin/products/new` | create a draft |
| `/admin/products/[id]` | edit basics, category, fabric, style, descriptions, care, link and Google fields (with preview), colours, sizes, the SKU × price × stock grid (prices only with `catalogue.prices`, never filled in for the owner), photo slots; one ordered save |
| `/admin/products/queue` | the publish queue: waiting / ready, a Fix link per product; publish refuses until every switched-on check passes |

The publish checklist is a set of switchable checks (`catalogue.publish.checks`); failing checks are named in
Bengali and English; a 0–100 health score with owner-set weights and bands. Screenshots:
[`docs/qa/screenshots/pr-21/`](docs/qa/screenshots/pr-21). Guides: [docs/admin-guide/products.md](docs/admin-guide/products.md) (list, queue, import, audit,
back in stock), [docs/admin-guide/size-charts.md](docs/admin-guide/size-charts.md).

**Size charts (PR 27, 28) — `/admin/size-charts`.** Per garment type and fit; inches stored, cm shown; ease;
how-to-measure drawing; default per category + fit, a product can carry its own; coverage check against the
product's ERP sizes; paste from Excel, add row, copy for another fit, "back to auto"; archived, never deleted.
Screenshots: [`docs/qa/screenshots/pr-28/`](docs/qa/screenshots/pr-28).

**Collections and tags (PR 32).** Manual or rule-based, seasonal (upcoming / live / ended), changed link forwards
301; bilingual tags with a per-product limit. Taking a product out of a collection, a tag off, or a size chart back
to auto **archives the link** (`archivedAt`), never deletes it.

**CSV export and import (PR 34).** Export has no cost, ERP or owner data. Import: preview with row-level errors and a
hash, then apply the same file; never deletes; prices only with `catalogue.prices`.

**Honest "was" price (PR 38).** Source per category: none / MRP / price history / combo sum; shown only from a real,
recorded price. Off everywhere until set (owner answer in CN-009: real MRP where it exists, combos = sum of separate
prices).

**Import from a link (PR 33) — `/admin/products/import`.** Reads a supplier or brand page through the page-reader
adapter (on its mock until switched on); private addresses refused on every hop; makes exactly **one DRAFT** —
never published, a price on the page is never copied, photos not copied.

**Ghost archive and back-in-stock (PR 36) — `/admin/products/back-in-stock`.** A once-live product keeps its page as
out of stock with alternatives (the storefront page comes with S02/S03). Customers leave a phone or e-mail through
the public `POST /api/back-in-stock`; counts need `catalogue.read`, contacts need `catalogue.interest`.

**Product audit (PR 39) — `/admin/products/audit`.** Every incomplete product with its failing checks, live-but-
blocked first; a Fix link opens the right section; stale health rechecked in batches. Screenshots:
[`docs/qa/screenshots/pr-39/`](docs/qa/screenshots/pr-39).

| API (all under `/api/admin/catalogue/`) | Purpose |
|---|---|
| `products` (GET/POST), `products/[id]` (GET/PATCH), `products/bulk`, `products/[id]/form`, `…/publish`, `…/readiness`, `…/colours`, `…/tags`, `…/naming`, `…/facts` | products, the edit form's save, publishing, checklist, colours, tags, names, plain facts |
| `variants`, `variants/[id]`, `sizes`, `sizes/[id]` | variants by SKU or product; sizes |
| `categories`, `garment-types`, `colours`, `fabrics`, `brands` (+ `/[id]`) | the libraries |
| `naming`, `naming/preview`, `naming/templates`, `naming/bulk-rename`, `naming/renames(/[id])`, `naming/redirects(/[id])` | names, links, 301s, rename history |
| `publish-queue`, `audit` | publish queue, audit report |
| `size-charts(/[id])`, `size-charts/[id]/copy`, `size-charts/assign`, `size-charts/unassign`, `size-charts/resolve` | size charts |
| `collections(/[id])`, `collections/[id]/products`, `tags(/[id])`, `tags/[id]/products` | collections and tags |
| `csv/export`, `csv/import` | catalogue CSV |
| `was-price`, `was-price/resolve` | "was" price sources |
| `link-import` | import from a link |
| `back-in-stock`, `back-in-stock/requests` | interest counts; contacts and marking |

Media API: `/api/admin/media` (search, upload), `/api/admin/media/[id]`, `/orphans`, `/regenerate`,
`/products/[productId]`; public `/media/<key>` and `/api/media/<id>/download`.

Permissions: `media.read/upload/manage`, `catalogue.read/write/prices/publish/import/export/interest`. Settings:
`catalogue.*`, `naming.*`, `media.*`. Tests: package tests in `packages/catalogue/test` and `packages/media/test`
(pure + PostgreSQL), API tests in `apps/web/src/lib/*.db.test.ts`, UI model tests beside the components.

**Left for later stages:** the image worker on BullMQ (inline until then), zoom viewer and storefront pages (S02),
storefront size chart / collection pages and "was" price display (S02), AI spec-sheet reading (AI stage), sending
back-in-stock messages (notifications).

### S09 · Inventory & ERP sync — Done (17/17)

> **বাংলায়:** স্টক আসে ERP থেকে। ব্যাগে রাখা পিস আটকে রাখা, অর্ডার ERP-তে কাগজ হিসেবে পাঠানো, কম স্টকের সতর্কতা,
> বারকোডে গোনা, সিঙ্ক ঠিক চলছে কিনা দেখার পাতা, আর স্টকের আসা-যাওয়ার রিপোর্ট। আসল ERP-এর কী না বসানো পর্যন্ত
> "প্র্যাকটিস ERP" চলে — আসল স্টকে কিছু বদলায় না।

PR 194–207, 497–499. Register: [S09](docs/MASTER-REGISTER.md#s09--inventory--erp-sync--pr-194207). Packages:
`@extas/inventory`, the ERP adapter in `@extas/adapters`.

- **ERP adapter (PR 498).** One contract (health, variants, stock, stock for one SKU; stable error codes), an HTTP
  client for [`docs/ERP-API-CONTRACT.md`](docs/ERP-API-CONTRACT.md) (Bearer key, timeout, Retry-After, rows checked
  one by one), webhook signature check (HMAC-SHA256, age limit), and a practice ERP with sample companies and
  warehouses. A second ERP is one more adapter.
- **ERP mode and guard (PR 497, 499).** Per store: our ERP · another ERP · no ERP. Every ERP-dependent path has a
  written behaviour for no ERP / practice / not usable / connected (`ERP_DEPENDENT_PATHS`).
- **Sync layer (PR 194).** Timeouts, retry with backoff and jitter, Retry-After honoured, AUTH and bad requests never
  retried; errors in plain words on ErpSyncRun / ErpSyncState; a key never appears in an error.
- **Stock pull (PR 195).** Per SKU / colour / size into StockLevel (variant × location), incremental, paged,
  resumable; one idempotent StockMovement per change; unknown SKUs counted, never guessed.
- **Company and warehouse mapping (PR 196).** The key decides the company, checked before every sync
  (`COMPANY_MISMATCH` stops it); local warehouses link one-to-one to ERP warehouses.
- **ERP webhooks (PR 196, CN-022, 23 Oct).** `POST /api/erp/webhook` takes the ERP's `stock.changed` and
  `variant.changed`: signed with the webhook secret from the vault (no secret → every request refused with 401),
  timestamp window, stored once in `WebhookEvent` (a retry within `erp.webhook.dedupeHours` is the same event),
  applied by the background worker; a change older than the shop's copy is ignored, and the poll afterwards adds no
  second movement. `variant.changed` refreshes the ERP mirror (barcode, ERP price, average cost), never the sale price.
  The poll stays the fallback; the practice ERP makes signed test events. Answers in [`docs/ERP-API-CONTRACT.md`](docs/ERP-API-CONTRACT.md).
- **Warehouses and locations (PR 201).** Warehouse, showroom, in transit, damaged; every warehouse keeps a damaged
  bin; damaged stock is never sellable; nothing deleted.
- **Cart holds (PR 197, 198).** One shared stock pool across stores, so two stores never sell the last piece twice;
  row locks in id order, retried; holds expire and are swept; never pushed to the ERP. Callers arrive with S04.
- **Order push (PR 199, 200).** A business document through a transactional outbox, never journal lines; relay with
  backoff, a dead state after the set tries, "send again" by hand; a deterministic idempotency key, so a retry never
  moves stock twice.
- **Low stock (PR 202).** Per variant on the shared sellable number; threshold 2 by default with per-SKU overrides;
  raises once, clears on restock. Messages wait for the notification stage (BLOCKED 16).
- **Oversold stock is never hidden (follow-up 16, SIM-F-006).** The shared balance is never clipped: −1 shows as −1
  on the stock answer, the colour × size grid (`balance`, totals `short`) and the low-stock alert. Every open order
  still waiting to be packed with a short SKU gets one shortage card (`PackingIssue` kind `SHORTAGE`, after every
  stock change and in the low-stock sweep); booking with a courier is refused while it is open (`assertBookable`,
  `SHORTAGE_OPEN`); a person with `inventory.audit` decides — swap the size, ship the rest, cancel the line, or the
  piece was found (`decideShortage`, audited; the order flow carries it out). Cards never close by themselves. The
  packing screen that shows them comes with S08 (follow-up 123).
- **Stock count (PR 203).** By barcode or SKU, one open count per location, a reason for each difference; a report
  only — the ERP's stock is never changed (BLOCKED 14).
- **Publish by real stock (PR 204).** Check `sellableStock`, off by default (BLOCKED 15); "find new styles in the ERP".
- **Sync health, re-sync, movement report (PR 205, 206, 207).**

| Screen | What it does |
|---|---|
| `/admin/stock` | sync health verdict (ok · practice · late · failing · down · off), last pull and its age, ERP connection and mode, documents waiting / failed / dead with "send again", pieces held in checkout, low stock, publish queue with real stock, recent runs; "sync all stock now" and one product. Opens even when the ERP is down |
| `/admin/stock/counts` · `/admin/stock/counts/[id]` | start a count of a location; scan + quantity (Enter keeps the field ready for a scanner), compare with the ERP, reasons, finish or cancel |
| `/admin/stock/movements` | per SKU and location: opening, in, out, closing, a mark where the ledger does not add up; reconcile with the ERP |

Guide: [docs/admin-guide/stock.md](docs/admin-guide/stock.md).

| API (all under `/api/admin/inventory/`) | Purpose |
|---|---|
| `erp` (GET/PUT), `erp/verify`, `erp/warehouses`, `erp/styles` | mode and mapping; which company a key belongs to; ERP warehouses; ERP styles not in the shop |
| `stock`, `low-stock`, `health`, `publish-queue` | stock per SKU or grid; alerts; health panel; queue with real stock |
| `warehouses(/[id])`, `warehouses/[id]/locations`, `locations/[id]` | warehouses and locations |
| `pushes`, `pushes/retry` | documents sent to the ERP; send again |
| `resync`, `reconcile`, `movements` | re-sync now; check against the ERP (changes nothing); movement report |
| `audits(/[id])`, `audit-lines/[id]` | stock counts |

Public (no session, signed): `POST /api/erp/webhook` — the ERP's webhooks (PR 196).

Permissions: `inventory.read/locations/erp/sync/audit`. Settings: `erp.*`, `inventory.*` (registry v11; `erp.webhook.*` v22). Tests in
`packages/inventory/test` and `packages/adapters/test` (pure + PostgreSQL, including two carts racing for the last
piece). Screenshots: [`docs/qa/screenshots/pr-205/`](docs/qa/screenshots/pr-205). No schema change in S09.

### S02 · Storefront — In progress (41/58)

> **বাংলায়:** দোকানের কাঠামো (হেডার, মেনু, ফুটার, নিচের বার), চারটা থিম, লোগো, বাংলা আর ইংরেজি, হোম পেজ (হিরোর চলন্ত ছবি, ক্যাটাগরি, নতুন পণ্য, রিভিউ) ক্যাটাগরি পেজ (ফিল্টার, সাজানো, আটকে থাকা বার, প্রশ্ন-উত্তর), পণ্যের পাতা (ছবি আর জুম, প্রতিটা রঙের নিজের লিংক, সাইজ, সাইজ চার্ট, স্টক, দাম, এক্সচেঞ্জ-ডেলিভারির কথা Smart Rules থেকে, কাপড় ও যত্ন, ব্যাগে রাখুন, নিচে "এর সাথে পরুন" আর "আগে দেখা" সারি; তিনটা টেমপ্লেট T1, T2, T3; "আমার সাইজ খুঁজুন" — উচ্চতা আর ওজন দিলে প্রোডাক্টের নিজের চার্ট থেকে সাইজ, কারণসহ), উইশলিস্ট, ফোনের মেনুতে সাব-ক্যাটাগরি, সাহায্যের পাতা (প্রশ্ন-উত্তর, এক্সচেঞ্জ, যোগাযোগ …) আর সার্চ (হেডারের খোঁজার জানালা, লিখতে লিখতে পরামর্শ, ফলাফলের পাতা ফিল্টার আর সাজানো সহ, বাংলা শব্দেও) তৈরি — ডেমো V12.2-এর মতো। পাতাগুলো এখন আরও তাড়াতাড়ি হাতে সাড়া দেয় (পণ্যের পাতায় আটকে থাকার সময় 263 থেকে 24 ms), দেখতে একদম আগের মতো।

**Built (PR 82, 501, 503, 84, 42, 40, 85, 41, 43, 45, 46, 47, 48, 54, 55, 56, 57, 60, 61, 62, 63, 64, 49, 53, 67, 68, 69, 70, 71, 74, 75, 72, 73, 52, 50, 58, 51, 88, 66, 87, 86), matched to demo V12.2 (CN-012).**
- **Screens / routes:** `/` and `/bn` (home), `/collections/<slug>` and `/bn/collections/<slug>` (category pages; `new-in` = the newest styles of every category), `/p/<product>` and `/p/<product>/<colour>` with `/bn/…` (product pages; the prefix is the setting `naming.productPathPrefix`), `/account/wishlist` (wishlist), `/help/faq`, `/help/delivery`, `/help/exchange`, `/help/privacy`, `/help/terms`, `/help/story`, `/help/contact` (help pages), `/search?q=` and `/bn/search?q=` (search results; `GET /search/suggest` answers the header panel), `/checkout` (empty checkout with the slim header), the shop 404; every
  storefront route not built yet shows "Coming soon" in the shell (CN-010). `/status` is the progress page.
- **Shell (40):** announcement bar, header, phone menu, bottom bar, footer (phone bands with the social row incl.
  WhatsApp; desktop: the owner's reference layout with link icons, WhatsApp and Hotline boxes, social tiles); the
  "Get new drops first" form waits for the sign-up list (PR 123 / 298; CN-017).
- **Themes, brand, language (82, 501, 503, 84):** four themes on one token set (contrast tested), the 11 logo styles,
  English at `/` and Bengali at `/bn` with a language gate test (CN-017).
- **Home (41, 43):** sections in the owner's order, hero text panel, the hero's sliding pictures with fitted pins,
  category tiles, new in, reviews; one slider engine with separate touch / mouse / keyboard pauses, each with a
  tested resume (42). The hero's default words make no count, season or year claim; a test keeps every shop word
  and setting default free of such claims (CN-017).
- **Category page (45–48):** crumbs, title and blurb, the grid with "Showing X of Y" and Show more (24 a page), the
  no-match state, the SEO block and questions (general ones only when their rule is on); filters built from the
  category's own products with live counts (a sold-out size is crossed out, never hidden), price bands from its own
  prices, the owner's quick chips; the sort as a real listbox; the phone's sticky Filter · Sort · On sale row and
  the desktop's active filters. Every choice is in the address, so a shared link opens the same page.
- **Product page (49, 54–57, 60–64):** template T1. Phone: photos, the buy column and the buy bar held at the bottom;
  computer: photos left, a sticky buy column right, the breadcrumb, and a slim bar under the header once the buttons
  have scrolled away. Photos: one swipe strip per colour, arrows, thumbnails, a full-screen zoom (pinch, double tap,
  keyboard), on a computer a slightly shorter photo with at most 5 thumbnails, the last "+N". Colours: swatches, each
  colour its own address (a shared link opens that colour), "All N colours" and its sheet. Sizes on one row from S to
  4XL, a size sold out everywhere crossed out and never hidden (SIM-F-035), the chosen size's measurements, the size
  chart popup in inches or cm; "Tell me when it is back" is built and off until the alert is sent (PR 71). Stock line
  and "Only N left"; price block (struck price only by the honesty rule; the ৳ never split from its number); the
  promise row and Delivery · Exchange · Returns from the live Smart Rules (the same exchange window and free-delivery
  limit as the bag; nothing said without a live rule); Fabric & care and the details. "Add to Bag" and the
  added-to-bag panel are the bag's own (S04); "Order Now" goes to checkout. A product taken off sale keeps its page,
  all sold out.
- **Product page extras (53, 67–70):** the first-screen budget (`pdp.fit`: on a phone the sizes and the
  measurement line always end above the buy bar; the device gate checks it on every product page); "Wear it with" and
  "You may also like" rows by category and "Recently viewed" from this browser, each sliding with its own touch /
  mouse / keyboard pauses; the floating rail (heart, WhatsApp) and the share tiles (Facebook, Messenger, WhatsApp,
  Instagram, copy link), the rail off by default as in the demo; the site-wide floating WhatsApp button is a switch,
  off (the header's icon does the job), with a choice per kind of page.
- **Templates and Find My Size (50–52, 58):** a product page uses the product's own template (chosen at upload), else
  its category's (the nearest up the tree), else the shop's default T1; `?template=T2` previews another (never
  indexed). T2 Editorial: on a phone the next photo peeks in, on a computer every photo stacked two across beside a
  410 px buy column, a white page and a larger title. T3 Fit-first: the sizes, the finder and the chosen size's
  measurements in one card (no frame on a phone; on a computer the finder box after the buttons), thumbnails under the
  photo. Find My Size: height and weight give a size from the product's own size chart and its ease, with the reasons
  in plain English and Bengali (what the chest or waist needs, the room this fit gives, the length for the height),
  never offered without a chart; the card under the sizes (T1, T2) opens a popup with hold-to-repeat steppers; the
  answer is kept on the phone (a small cookie, 365 days), so the size opens chosen and tagged "Your size"; "Not sure?
  Find my size" in the size chart; `?finder=1` opens it. Each answer is kept for the size reports (PR 59) with no name
  or phone, worked out again on the server (`POST`/`PATCH /api/size-finder`). The SIM-F-012 test checks that a size
  question in chat gets the same size (`answerSizeText`).
- **Wishlist (71):** hearts kept for this browser on the server (no login), the wishlist page with Add to bag (the
  saved size), Choose a size and Remove, the empty list with the newest products on a computer, the bag's "Move to
  wishlist" with Undo; "Tell me when it is back" waits for a real sender (follow-up 70).
- **Menu and help pages (74, 75):** the phone menu opens a category's sub-categories in place ("View all" first, a
  count on each row); help pages from the live Smart Rules' texts, the owner's own words and the store's details —
  privacy, terms and our story wait for the owner's words and say "Coming soon" until then (CN-017); on a computer a
  help centre with the topic list and "Still stuck?". The phone header keeps a two-word store name on one line with
  the WhatsApp disc on (follow-up 59).
- **Search (72, 73):** the header's search icon and the phone menu's "Search" open the demo's window on a phone and
  the panel under the header on a computer (D-014); while typing it suggests help pages ("delivery", "exchange",
  Bengali words; a page still "Coming soon" is never offered), categories and products, with "See all N results".
  One index across products, categories and help pages with prefix, typo and synonym matching and Bengali keywords
  (sample lists in `search.words`, the owner adds his own later); Meilisearch when its URL and key are set on the
  server and its index is current, otherwise PostgreSQL, so search always works (`@extas/search`); the worker's
  `search.index` job indexes once per catalogue version. Only live, sellable products appear. The results page
  (noindex) shows the help answers, the categories found and the category page's own listing (filters, "Best match"
  sort, Show more; a size sold out in every colour crossed out, never hidden: SIM-F-035); when nothing is found it
  says so and offers "Did you mean …", popular words or categories, WhatsApp (only with the store's number) and the
  products with some of the words.
- **Speed (88):** the first load no longer blocks the phone: every script chunk carries V8's compile hint, so Chrome 136+
  compiles the code on a background thread while it downloads (`tools/compile-hints.mjs` runs after `next build`); the
  size chart, the Find My Size window and the photo viewer load only when opened (fetched once the page is idle, so a tap
  opens them at once); every heart reads one shared copy of the wishlist; the product page re-fits only when its fonts
  arrive late. Seeded Lighthouse blocking time (median), before → after: product page T1 263 → 24 ms in English and
  254 → 80 ms in Bengali, T2 and T3 at most 110 ms, every other storefront page 24–122 ms; the look is pixel for pixel the
  same. The register's weights (a category page under 1 MB, a category image under 40 KB, a product image under 150 KB)
  are checked on the seeded runs in CI (`docs/qa/page-weight.json`, `tools/page-weight.mjs`); with the real photos on the
  preview and from Dhaka over 4G later (follow-ups 160, 161).
- **Questions, celebration, sweeps (66, 87, 86):** "Questions & answers" under the product page shows only the
  questions the shop answered and approved (`ProductQuestion`, APPROVED, answered, not archived; never one made up): the
  newest open in its own box with who answered and when, the others folded, 3 at first and "See all questions · N more",
  then "Not answered here?" with the WhatsApp button and the hours; with no answered question only the WhatsApp ask, and
  without a WhatsApp number no block (`pdp.qa`, on; drawn on the server with the browser's own `<details>`, no script).
  The thank-you page's celebration (`thanks.celebrate`, off): balloons or light streaks with the owner's words for an
  occasion's days, at most 2.5 s, any tap skips it, never blocking the page, never on a slow or low-end phone, the still
  words for reduced motion, `?celebrate=preview` to see it first. The light sweeps: one place knows every sweep of the
  shop, a master switch and one switch per sweep (`shop.sweep`; Add to Bag off as designed), written as one small
  stylesheet only when the owner changes something; the checkout and Order Now buttons keep theirs when "all other green
  buttons" is off; reduced motion always wins. Screenshots: [`docs/qa/screenshots/pr-136/`](docs/qa/screenshots/pr-136).
- **Follow-ups (23 Oct; 41, 40, 45, 56, 74, 222):** on a computer a card shows its back view and Quick add with the
  size buttons on mouse hover or keyboard focus (`card.desk`, on; `GET /api/shop/card/<id>`; the bag's own added panel,
  also on the home and category pages), and the home page's cards fit like the category page's; the phone slogan steps
  to its short form, then out, and the footer's slogan wraps; BreadcrumbList and ItemList JSON-LD on category pages and
  Product, Offer and BreadcrumbList JSON-LD on product pages from their own price and stock, no rating
  (`seo.structuredData`, on; Organization is still to come, follow-up 110); the owner's word under each size box
  (`pdp.sizeWords`, empty = off) and "Your size" on the size this browser last put in the bag (`pdp.usualSize`, off);
  a sample sub-category so the gate measures the menu accordion.
- **Settings:** `theme.*`, `brand.*`, `shell.*`, `language.*`, `slider.engine`, `home.*` (registry v16; `home.hero` v17), `category.*` (registry v17), `pdp.*` (registry v19: page, gallery, colour, size, chart, stock, price, trust, rules, details, buy, sweep; no admin screen yet, CN-019); registry v23: `pdp.fit`, `pdp.rows`, `pdp.icons`, `pdp.share`, `shell.fab`, `shell.menuSubs`, `wish.list`, `pages.help`, `pages.text` (owner data); registry v28: `pdp.templates` (default T1, per category, T2 and T3 options), `pdp.finder` (the body estimate, tolerance, length check, stepper range, keep and record switches); registry v24: `search.engine`, `search.match`, `search.words`, `search.help`,
  `search.panel`, `search.results`. No schema change, no new permission.
- **Settings (66, 86, 87):** `pdp.qa` in `registry-product.ts` and `shop.sweep`, `thanks.celebrate` in
  `packages/settings/src/registry-motion.ts` (registry v31), labels in `packages/settings/messages/storefront.*.json`; the
  words in `apps/web/messages/shop-more.*.json` (`qa.*`, `celebrate.*`). No schema change, no admin screen (CN-019).
- **Settings (follow-ups):** `card.desk`, `seo.structuredData`, `pdp.sizeWords`, `pdp.usualSize`, `thanks.page` in
  `packages/settings/src/registry-storefront-fu.ts` (registry v25), labels in `packages/settings/messages/storefront-fu.*.json`.
- **Tests and gates:** unit tests beside the code (`apps/web/src/lib/shop/*.test.ts`, `packages/settings/test`),
  device gate 0 fails in 372 storefront checks and 124 product-page checks (2077 checks with T1, T2 and T3 in both languages, PR 50–58), storefront pages in the Lighthouse budget
  (TBT under 200 ms; the product page T1 and T3 in both languages and T2 in the seeded budget, `lighthouserc.seeded.json`; page and image weights, `tools/page-weight.mjs`) and in the
  smoke test (`docs/qa/smoke.json`; product pages are found from New in, never named). Screenshots:
  `docs/qa/screenshots/pr-40/`, `pr-41/`, `pr-43/`, `pr-45/` … `pr-48/`, `pr-49/`, `pr-53/` (PR 53, 67–71, 74, 75), `pr-72/` (PR 72, 73).

Next: the size reports and reviews (59, 65 …). The CI device gate itself (PR 85, CI part) runs on every pull
request: 15 phones, 10 tablets and 6 desktop sizes (`tools/device-gate.mjs`, `docs/qa/device-gate.json`). Since 23 Oct it
also signs in on the sample data, so admin controls that only show with data are checked at 44 × 44 too (0 fails in
620 checks). Register:
[S02](docs/MASTER-REGISTER.md#s02--storefront--pr-4088).

### S03 · Combo & bundles — In progress

> **বাংলায় সংক্ষেপে:** অ্যাডমিনে "কম্বো" পেজে নির্দিষ্ট কম্বো বানানো, রঙের জোড়ার রুল দিলে নিজে থেকে কম্বো, সেটের দাম আর কত বাঁচে, পিসের ছবি দিয়ে সেটের ছবি, আর কম্বো রিপোর্ট। সেটের দাম আপনি নিজে বসাবেন। ~~দোকানের কম্বো পাতা পরে আসবে (S02/S03-এর বাকি PR)।~~ দোকানের কম্বো পাতা এখন তৈরি (২৩ অক্টোবর): কাস্টমার প্রতিটা পিসের রং আর সাইজ বেছে পুরো সেট এক দামে ব্যাগে নেয়; সব সেটের একটা পাতা `/combos`, আর প্রোডাক্ট পাতায় "এটা দিয়ে সেট"। নিজের মতো সেট বানানোর পাতা পরে আসবে।

**Combo core (PR 89, 90, 571, 99, 101, 96, 97, 575, 104, `@extas/combos`, migration `0004_combos`).**
- **Model (89):** pieces, set price, saving against buying separately, active window.
- **Admin `/admin/combos` (90, 571):** fixed combos with a price box and switches and a live editor; auto colour-pair rules with an 8-step wizard, a rules tab and archive (nothing deleted).
- **Set tiers (99):** "any 2 for X, any 3 for Y" read from Smart Rules (S10 PR 212).
- **Validation, summary, bag (101, 96, 97):** what is still missing before adding; set summary and price (a struck price only from a real "was" price); `addSetToBag` adds one set with its price locked, guarded against double adds, overselling, stale and above-regular prices.
- **Set photo (575):** composed from the piece photos with sharp; "Make set photo" in the admin.
- **Report (104):** `?tab=report` — which sets sell, which colour pairs get picked. Since PR 155 it shows "Ordered value" (placed orders) and "Sales (delivered)" as separate figures from `@extas/metrics`.
- **Permissions:** `combos.read`, `combos.write`, `combos.publish`, `combos.prices` (owner only, CLAUDE.md rule 6). Guide: [docs/admin-guide/combos.md](docs/admin-guide/combos.md).
- **Settings:** registry v14, `registry-combos.ts`. ~~Still planned: 91–95, 98, 100, 102, 103, 572–574, 576 (storefront combo pages and the rest).~~ Still planned: 98, 100, 572–574, 576 (the set builder and the page templates).

**Combo storefront (PR 91, 92, 93, 94, 95, 102, 103; demo V12.2 `40-combo.js`, `42-combo-auto.js`; 23 Oct).**
- **Combo page `/combo/<link>`, `/bn/combo/<link>` (91):** template C1 (one card per piece) with the crumbs, the picked colours, the price box from `@extas/combos` only (set price, separately, the saving, each piece's regular price on a computer), the rules card (each line only when its rule is on), set summary, "Add set to Bag" / "Order Now", WhatsApp only with the shop's number, the phone's bar. A phone shows a toast with "View bag" (touch, mouse and keyboard pause it separately); a computer opens the added panel. An ended combo keeps its page with "Buy them separately". Noindex unless the combo is featured. The bag's set links and "Change" open this page.
- **C2 step by step (92):** `combos.page.layout` = C2: one piece at a time, "Next: <piece>", then a review.
- **Gallery (93):** the set picture of the picked colours, a tab per piece, front / back / detail / true colour.
- **Popular pairs (94):** one tap sets every colour; a pair not made in the size already picked is greyed; learned from real picks.
- **Each piece's colour and size (95):** sizes not made or sold out struck, "Same size as item 1", measurements in inches or cm, "Only N left", the reason a pick cannot go in the bag; "Update set in bag" changes the set in place.
- **Set offer on the product page (102):** under the stock line, each running set that holds the product, with its price and saving.
- **More sets and the landing page `/combos` (103):** rows of 2-piece packs, 3-piece packs and top + bottom sets, season tabs, four columns shared on a computer; off shows "Coming soon".
- **API:** `POST /api/bag/sets` (add, one tap one add), `PATCH /api/bag/sets` (change a set in the bag), `POST /api/shop/combo` (view and colour-pick counts, the price of exact picks). Same-site only.
- **Settings (registry v30, `registry-combo-pages.ts`, no admin screen, CN-019):** `combos.page.layout` (C1), `combos.page.popularPairs` (on, 6, learn after 3 picks), `combos.page.parts` (summary, WhatsApp, rules card, item prices on; the whole-set exchange promise off), `combos.page.moreSets` (on, 12), `combos.landing` (on, season tabs, 8 a row), `combos.pdpOffer` (on, 2). Words: `apps/web/messages/shop-combo.<lang>.json`.
- **Tests and gates:** engine tests (`page-model`, `page.db`), web model and API tests on PostgreSQL; device gate 0 fails on the new pages; seeded Lighthouse on the combo page and `/combos` in both languages; smoke opens `/combos` and the combo pages its cards link to.

### S10 · Smart Rules — Done (12/12)

> **বাংলায়:** দোকানের সব নিয়ম (ডেলিভারি, এক্সচেঞ্জ, সেট-কম্বো, ছাড়, কুপন, উৎসবের শেষ সময়, নোটিশ-পপআপ) এক জায়গায়।
> একবার বদলালে পণ্যের পাতা, ব্যাগ, চেকআউট আর মেসেজে লেখা নিজে থেকে বদলায়। টাকার নিয়ম মালিকের অনুমতি ছাড়া চালু হয় না।

PR 208–219. Register: [S10](docs/MASTER-REGISTER.md#s10--smart-rules--pr-208219). Package: `@extas/rules`.

- **Engine (PR 208).** One rule = kind (delivery · exchange · setTier · discount · festive · payment · policy ·
  fulfilment), typed params, scope, conditions, priority and an active window; drafts, versions and archive, never
  deleted. A broken rule never runs on a guess.
- **Rule admin with live preview (PR 209).** "Customers see" line changes as you type; preview of every place the text
  changes, before and after, and what changes in money. Money changes need the owner's OK (`rules.approve`).
- **Delivery, exchange, set tiers (PR 210, 211, 212).** Charges per band and a free-delivery threshold (empty and off
  until the owner sets them); exchange window (default text "Exchange within 72 hours for size or fault", 72 hours is a
  setting); any 2 for X, any 3 for Y, best price worked out in the bag (`quoteCart`).
- **Discounts and coupons (PR 213).** Coupons start off and need the owner's OK. The "was" price follows CN-009: the
  real MRP, combos = sum of separate prices, never invented (`discountWasFor`, switch off).
- **Festive cut-offs (PR 214)** stop by themselves when the date passes. **Eid order-by dates (23 Oct, CN-014 g):** a
  date per delivery band and per district (a district's own date wins), cut-off time in the store's time zone, a banner
  from `rules.eid.showDaysBefore` days before, and "may arrive after Eid" once a place has closed; pre-order with a fixed
  or percentage advance, where the amount due on delivery is the total minus the advance. Everything is off and empty
  (`rules.eid.*`); switching on is refused while anything is missing (`EID_INVALID`), and the pre-order needs the owner's
  OK (`rules.approve`). Engine, settings and `/api/admin/rules/eid` only: the screen comes under Marketing → Campaigns
  after the owner approves `docs/ADMIN-ARCHITECTURE.md`; the storefront banner and checkout lines come with S02/S04.
- **Rule text everywhere (PR 215).** `ruleTextsFor`, `RuleText`, `NoticeBar`, `RulePopup` for S02 to place.
- **Notices and pop-ups (PR 216).** Bar, in-page note, pop-up; never on arrival, capped per visitor, pause and resume
  tested; all start off.
- **Conflicts, history, simulation (PR 217, 218, 219).** Old text found elsewhere (e.g. "7 days" in an FAQ) with "fix
  everywhere"; who changed what and when, restore; what past orders would have cost under a draft.

| Screen | What it does |
|---|---|
| `/admin/rules` | rule list, editor with the live line, preview, approval, history and restore, simulation, coupons |
| `/admin/rules/notices` | notices and pop-ups: placement, timing, frequency cap |

Guide: [docs/admin-guide/rules.md](docs/admin-guide/rules.md).

API: one catch-all `/api/admin/rules/[[...path]]`. Permissions: `rules.read/write/publish/approve`. Settings:
`rules.*` (registry v13, 16 keys). Schema migration `0003_smart_rules`. Tests in `packages/rules/test` (59, 18 on
PostgreSQL) and the web rules API (10 + 3 on PostgreSQL). Screenshots:
[`docs/qa/screenshots/pr-209/`](docs/qa/screenshots/pr-209). Report: [S10](docs/reports/2026-10-20-S10.md). Left for
S02/S04: placing the storefront pieces and the bag's use of `quoteCart` / `discountWasFor`.

### S04 · Cart, checkout, accounts — In progress (31/41)

> **বাংলায়:** ব্যাগ তৈরি — পণ্য রাখা, রং-সাইজ-সংখ্যা বদলানো, পরে কেনার জন্য রাখা, সরানো আর ফিরিয়ে আনা, সেট, অফারের ঘর, দুই সাইজের প্রশ্ন, অর্ডারের হিসাব, কোড, ফ্রি ডেলিভারির অগ্রগতি আর "আপনার পছন্দ হতে পারে"; "ব্যাগে রাখা হয়েছে" শিট। চেকআউটও তৈরি — নাম-ফোন-ঠিকানা, ঠিকানা থেকে এলাকা আর চার্জ (না বুঝলে জিজ্ঞেস করে), পেমেন্টের উপায়, ওয়ালেট, অফারের টিক, কনফার্ম বোতাম, একবার চাপলে একটাই অর্ডার, আর ধন্যবাদ পাতা। কার্ড/মোবাইল পেমেন্ট এখন টেস্ট পাতায়, কোনো টাকা নড়ে না। ডেমো V12.2-এর মতো, বাংলা আর ইংরেজি দুটোতেই।

**Built (PR 105, 106, 108, 109, 110, 111, 112, 113, 114, 107), matched to demo V12.2 (CN-012).** Package `@extas/cart`, migration `0006_bag`.
- **Screens / routes:** `/bag` and `/bn/bag` (out of "Coming soon"; noindex); `/bag/try` (test page, only with `EXTAS_SHOP_TEST_PAGES=1`).
- **The bag (105):** one bag per visitor (HttpOnly `__Host-extas_bag` cookie, SameSite=Lax, kept `bag.keepDays` days), lines and quantities, colour and size changed in place, save for later, take out = archived with Undo (nothing deleted); a double tap is one add; the piece count glows on the header bag and the bottom bar.
- **Added-to-bag panel (106):** phone sheet or desktop drawer (`bag.panel.style`), "Just added" first, the bag's count and total, a COD / exchange line when delivery is not free (only what is switched on; never "add ৳X more"), "Complete the look" by the fill rule (`bag.panel.fill`, `bag.panel.gapPx`). The product page (PR 49) mounts the same `<AddToBag>` and `<AddedPanel>`.
- **Lines, sets, two sizes (107, 108, 110):** each set one line with its pieces linking to their own products; the two-sizes notice asked once ("one is for someone else" never flags a family, SIM-F-036).
- **Offers and totals (109, 111, 112, 113, 114):** one offer slot under the lines, never empty; the tier box (full on a computer, a preview on the phone); the order summary with "You save" in sale red; the discount code with the engine's reason in words (a member-only code says so; a public code works for guests, SIM-F-009); free-delivery progress; "You may also like" from the bag's own categories. Every amount comes from the rules engine in minor units.
- **API:** `/api/bag/lines` (POST), `/api/bag/lines/<id>` (PATCH, DELETE), `/api/bag/lines/<id>/restore`, `/api/bag/sizes` (PUT), `/api/bag/code` (POST, DELETE), `/api/bag/try` (test servers only); same-site requests only, bodies up to 2 KB.
- **Settings:** `bag.*` in `packages/settings/src/registry-bag.ts` (registry v18), labels in `packages/settings/messages/bag.*.json`; every claim off unless backed (`bag.trust.*`, `bag.upsell.originalLine`). No admin screen yet (CN-019); no new permission.
- **Tests and gates:** `packages/cart` (pure and PostgreSQL), `apps/web/src/lib/shop/bag-*.test.ts`, the coupon audience in `packages/rules`; device gate 0 fails in 775 checks including the filled bag (`docs/qa/device-gate.json` `filled`); `/bag` and `/bn/bag` in the Lighthouse budget and the smoke test. Screenshots: `docs/qa/screenshots/pr-107/`.

**Built (PR 115–126): the checkout, matched to demo V12.2 (CN-012).** Package `@extas/checkout`, migration `0007_checkout` (payment methods Rocket, Upay, Online).
- **Screens / routes:** `/checkout` and `/bn/checkout`; `/checkout/pay/<number>` (the test payment page until the S07 gateways) and `/checkout/thanks/<number>` (both noindex, only for the browser that placed the order).
- **Form (115, 116, 124):** the steps header, the phone's order-summary bar and sticky Confirm, the desktop side summary; name, phone, address in the owner's order (`checkout.fieldOrder`) with one set of checks for browser and server; Confirm never looks off: it shows the first missing field with a Bengali line in its box (`checkout.confirm.style`).
- **Address and charge (117, 118, 119):** the S06 gazetteer reads the address on the server (longest name first); an unclear line asks "Where is this address?" with each band's charge and hours, never guesses; the charge is the owner's band figure (never from text), "+ delivery" while a band has no charge, the rules only decide free delivery. Since follow-up 54 the rules engine uses the same band figure, so the rule admin's preview and simulation say what the checkout charges (the COD limit check is unchanged; follow-up 121 waits for the owner).
- **Payment, wallet, opt-in, items (120–123):** COD only when the owner's switch, the COD rule and the band's limit allow it; mobile banking, card & bank, Pay online; the prepaid reward system (off, no value; the owner sets it); "Use my wallet" for signed-in customers; SMS offers ticked, WhatsApp not, each a dated consent; quantity and Remove with Undo in the summary.
- **Placing the order (125):** one transaction, one order per press (order key), the bag locked, stock held, order number under a lock (`checkout.order.numberPrefix`, `numberStart`), the money shown is the money stored (SIM-F-003) or PRICE_CHANGED with the new figures; unclear address or unset charge = the order flagged with a call task. The order is created in its first state only; order states, refunds and returns wait for the owner (CN-022). Failed payments are kept with a call task and "Try again" (SIM-F-026); unfinished checkouts are kept only with `checkout.capture.enabled` (off).
- **Thank-you page (126):** first name, promise in hours, order number with Copy, COD due / paid / Pay now / Try again, items and totals as stored, WhatsApp with the order number. Since 23 Oct (follow-up 58): the delivery note he wrote said back (`thanks.page`, on), the trial-at-the-door line while that service is on, and "What happens next" (off, as in the demo).
- **Address suggestions (117, follow-up 57):** the matching places drop down under the address box while he types (`delivery.suggest.enabled`, `delivery.suggest.minChars`): arrows, Enter, Escape and tap, read at once on a pick; a band's charge shows only once the owner priced it.
- **API:** `POST /api/checkout/quote`, `/api/checkout/orders`, `/api/checkout/payments` (test payments only), `/api/checkout/draft`; same-site only, the bag cookie decides whose order it is.
- **Settings:** `checkout.*` in `packages/settings/src/registry-checkout.ts` (registry v20), labels in `packages/settings/messages/checkout.*.json`; optional features off. No admin screen yet (CN-019).
- **Tests and gates:** `packages/checkout` (43, on PostgreSQL: SIM-F-003 and SIM-F-026, one press one order, receipt), `apps/web/src/lib/shop/checkout-api.db.test.ts`; device gate 0 fails on every storefront and checkout page; checkout pages in the Lighthouse budget and the smoke test. Screenshots: [`docs/qa/screenshots/pr-115/`](docs/qa/screenshots/pr-115).

**Built (PR 129–135, 137): customer accounts, matched to demo V12.2 (CN-012).** Package `@extas/accounts`; no migration (the S00 schema holds it all).
> **বাংলায়:** প্রথম অর্ডারেই অ্যাকাউন্ট তৈরি হয়, কোনো পাসওয়ার্ড ছাড়া; লগইন মোবাইল নম্বর আর এসএমএস কোডে (এসএমএস এখন টেস্ট মোডে, চাবি এলে আসল)। আমার অ্যাকাউন্টে অর্ডার, পার্সেল কোথায়, দেরি হলে সেটাও, ওয়ালেট, পছন্দের তালিকা, প্রোফাইল-ঠিকানা; অর্ডারের পুরো পাতা; চেকআউট নিজে থেকেই নাম-নম্বর-ঠিকানা বসিয়ে দেয়। অফার ব্যানার, ছবি আর "ঠিক কত টাকা" লাইন শুরুতে বন্ধ।
- **Screens / routes:** `/account/login`, `/account` (orders), `/account/foryou`, `/account/rewards`, `/account/wallet`, `/account/wishlist`, `/account/profile`, `/account/orders/<number>` (+ `/bn/…`, all noindex; old names like `/account/addresses` redirect); a signed-out visitor sees the log-in prompt.
- **The account from the first order (129):** the order's phone finds or makes the customer (`account.autoCreate.enabled`), never with a password (SIM-F-039 test: the phone number as the password opens nothing); the thank-you card says the number he logs in with (`account.thanksCard.enabled`).
- **Log in (130, follow-up 18):** a one-time SMS code (`account.code.limits`, `account.code.text`), stored only as salted hashes, rate-limited per phone and per IP; an own password if he sets one, with the code on a new device (`account.login`); the SMS goes through the mock sender until the gateway key arrives (A1.3) and no code is ever shown on production. The browser's wishlist joins the account at sign-in (follow-up 71).
- **My account (131–133):** header with orders, wallet and saved; the sections the owner shows (`account.tabs`); order cards with the parcel's journey as stored (CN-022: nothing moves an order here) and a "Late" tag; For you, Rewards, the wallet ledger; Profile with up to `account.addresses.max` addresses, password, SMS / WhatsApp consent rows; the offer banner (`account.offerBanner`, off: only his real wallet balance or the owner's offers whose coupon works for him); the profile photo (`account.photo`, off: cropped and kept only in his browser).
- **Order page and tracking (134, 135):** every line with its picture, add-on and set marks, the money as stored and how it is paid; the steps with their times and the band's promise in hours; the courier and tracking code once booked; past the promise "Late — we are chasing the courier" with WhatsApp (`account.track.late`, SIM-F-018 test); "Track your order" on the thank-you page opens it with the welcome panel (`account.track.welcome`: his account, log in by SMS code, never a password); the exact amount for the rider with a report link (`account.track.exactAmount`, off; CN-014 idea 10).
- **Checkout fills itself (137):** a signed-in customer's name, number and address (`checkout.autofill.account`); the browser's autofill read on the first touch (C6.4); the browser's memory of the last order only with `checkout.autofill.browserDays` above 0 (off).
- **API:** `POST /api/account/<action>`: `code`, `login`, `password`, `logout`, `profile`, `consent` (`test-code` and `try` only on test servers with the mock SMS); same-site only, small bodies, no answer says whether a number has an account.
- **Settings:** `account.*` and `checkout.autofill` in `packages/settings/src/registry-accounts.ts` (registry v29), labels in `packages/settings/messages/accounts.*.json`; the words in `apps/web/messages/shop-account.*.json`. No admin screen (CN-019); no new permission.
- **Tests and gates:** `packages/accounts` (PostgreSQL: codes and limits, login, SIM-F-039, the dashboard, the late card, offers, the checkout prefill; pure: steps, SIM-F-018, the rider amount), the receipt in `packages/checkout`, `apps/web/src/lib/shop/account-api.test.ts`, `draft.test.ts`; the device gate opens every account page signed in (the sample account fill `/api/account/try`); the account pages are in the Lighthouse budget and the smoke test (signed out).

**Built (PR 136): the invoice of an order (with follow-up 147).** No migration.
- **Screens / routes:** `/account/orders/<number>/invoice` and `/bn/…` (noindex): the printable invoice, with "Download
  invoice" (`…/invoice/file`, one self-contained HTML file that opens and prints anywhere) and "Print or save as PDF"
  (the browser's own print). "Get invoice" on the order page, an invoice icon on each My orders card, a button on the
  thank-you page.
- **What it shows:** everything as stored on the order — each line's unit price, its discount, the wallet, the delivery
  charge (or "charged on the call" / free), the total and what is still due (COD due / paid / failed); never
  recomputed. The shop's name, slogan, WhatsApp or phone, address and e-mail, and the registered name, trade licence,
  DBID and BIN only when the owner has filled them (`legal.bin` new, owner data, empty); the bill-to, address and the
  courier and tracking code once booked; the exchange summary while exchange is on.
- **Who sees it:** the customer whose order it is, the browser that placed it, or staff with the new `orders.invoice`
  permission; anyone else gets the order page's log-in prompt.
- **Settings:** `account.invoice` (registry v31; on; number `INV-{digits}`, each block on a switch, SKU off, the owner's
  note and footer empty, download on) and `legal.bin` in `packages/settings/src/registry-accounts.ts`. No admin screen
  (CN-019): the staff's button on the S05 order screen is follow-up 180.
- **Tests and gates:** `apps/web/src/lib/shop/invoice.test.ts`, the receipt's stored line figures and the staff read in
  `packages/checkout` (`place.db.test.ts`); device gate 2642 checks with 0 new fails (the invoice page filled and
  signed in, English and Bengali; the 25 known `/admin/size-charts` tap-target fails aside); both invoice paths in the Lighthouse budget, the seeded budget and the smoke test.

Next: "Add to this parcel" (127 …), the rest of S04. Register: [S04](docs/MASTER-REGISTER.md#s04--cart-checkout-accounts--pr-105137).

### S05 · Order management — In progress (7/20)

> **বাংলায়:** "বিক্রি" এখন একটাই হিসাব — শুধু ডেলিভারি হওয়া অর্ডার, ডেলিভারির দিনে গোনা; "অর্ডারের মূল্য" (সব দেওয়া অর্ডার) আলাদা করে পাশে দেখায়। সব রিপোর্ট একই হিসাব থেকে নেয়। অডিট লগ আর অন্য ইতিহাস এখন ডাটাবেসেই আটকানো: ওয়েবসাইট নতুন লাইন লিখতে পারে, কিন্তু বদলাতে বা মুছতে পারে না, কেউই পারে না। অর্ডারের ধাপ এখন একটাই নিয়মে চলে: ভুল ধাপ আটকে যায়, প্রতিটা বদল টাইমলাইনে লেখা থাকে; কারণসহ বাতিল আর হোল্ড, টাকা দেওয়া অর্ডার বাতিলে শুধু রিফান্ডের অনুরোধ (টাকা যায় না), ডুপ্লিকেট অর্ডারের যাচাই-তালিকা, নোট আর ফ্ল্যাগ। অ্যাডমিন পাতা পরে আসবে। রিফান্ড আর রিটার্ন পরের ধাপে।

**Built (PR 138, 144, 145, 147, 153): the order core.** Package `@extas/orders`, migration `0018_order_core`, settings group `orders` (registry v32), no admin pages yet (follow-up 193).
- **One order service (138):** the states DRAFT, PLACED, AWAITING_ADVANCE, CONFIRMED, ON_HOLD, PROCESSING, PACKED, HANDED_OVER, IN_TRANSIT, DELIVERED, PARTIALLY_DELIVERED, RETURNED, CANCELLED and every command's from → to in `src/pure.ts`; `execute()` runs each command with the order's row lock, the screen's `version` (STALE), the plan (ILLEGAL_TRANSITION with the commands open now), its effects, an OrderEvent (who, when, from, to, reason) and an AuditLog row in one transaction, and an `Idempotency-Key` (a repeat gets the first answer). Flags cancelPending and customerWantsChange; courier, payment and return statuses stay their own records, moved only through the hooks (`awaitAdvance`, `recordAdvance`, `orderStep`) S06–S08 will call. A guard test fails when any other code writes Order.status.
- **Cancel (144):** nine fixed reason codes with the owner's words in both languages (`orders.cancel.reasons`; "Other" needs a note). The cancel releases the order's stock holds, closes a payment still waiting, closes call tasks and reviews, queues the CANCELLED status for the ERP when it had the order, and for anything paid (online or wallet) records a refund **request** only — no money moves (SIM-F-041). A booked order is never cancelled in one step: cancel after booking, then the courier's answer (confirmed → cancelled; refused → the parcel goes on, "customer wants a change", never a risk signal; SIM-F-004). The customer's own cancel (CN-020 (5), SIM-F-056): one tap until the cut-off (`orders.cancel.customer`: off / never / until confirmed (default) / until packed), then a request the team approves or refuses, until booking; `POST /api/account/cancel` and `cancel-state` (no shop button yet, follow-up 190).
- **Duplicate defence (145):** the checkout's one-press key and the converted bag; then, when the order lands, other open orders of the same customer or phone in `orders.duplicates.lookbackDays` (5) days, high (same SKU, or same product and colour), medium (same product, other colour) or low (same category); from `reviewFrom` (medium) the order waits in the review queue and cannot be confirmed; decisions not a duplicate / cancel as duplicate / hold / ask the customer (a call task) / one parcel (an OrderGroup, money untouched), each with a FraudDecision, audit and timeline row; auto-hold of a high match off by default.
- **Notes and flags (147):** internal notes (archived, never deleted; `orders.notes.maxChars`), internal flags from `orders.flags.list`.
- **Hold and release (153):** a reason from `orders.hold.reasons` (support reads it on the order), release back to where it was held from; `orderFollowUps` makes one call task for a hold older than `orders.hold.reviewHours` or an advance past `orders.advance.waitHours` (both 0 = off) and never cancels (SIM-F-043).
- **Admin API:** `GET /api/admin/orders` (views new, awaiting advance, on hold, cancel requests, cancel pending, in review, finished, with counts; search; cursor), `/reasons`, `/reviews`, `/reviews/:id`, `/merge`, `/:id`, `/:id/confirm|hold|release|cancel|cancel-request/approve|cancel-request/refuse|cancel-after-booking|courier-cancel|flags|notes`. Permissions `orders.read`, `orders.confirm`, `orders.hold`, `orders.cancel`, `orders.cancelAfterBooking`, `orders.cancelRequests`, `orders.notes`, `orders.risk.read`, `orders.risk.decide`, `orders.merge`.
- **Tests:** every legal and illegal (command, state) pair against a table written from §6.5.1; PostgreSQL tests with orders placed through the real checkout: two commands at once (one wins, one refused), STALE, idempotent replay and mismatch, the append-only timeline and decision log, every cancel effect, SIM-F-041, F-043, F-056, F-004, hold and release, notes and flags, every duplicate decision; the admin API end to end (login, same site, a reader gets 403). Guide: [orders](docs/admin-guide/orders.md).

**Built (PR 155): one KPI definition (CN-022, owner 23 Oct).** Package `@extas/metrics`.
- **The rule, once (`src/pure.ts`):** Sales = orders in DELIVERED, counted on the delivered day (`deliveredAt`); Ordered value = every placed order (all but DRAFT, cancelled and returned too), counted on the placed day; archived orders count in neither; days are shop days in `store.timeZone`. Until the order state machine exists nothing reaches DELIVERED, so Sales shows 0.
- **Functions (`src/metrics.ts`):** `kpi` (the headline pair), `kpiByDay` (every day filled), `kpiByZone`, `kpiByPaymentMethod`, `lines` / `linesBoth` with `sumLines` / `groupLines` for one product's or combo's own lines.
- **Views on it:** the combo report `/admin/combos?tab=report` (tiles "Ordered value" and "Sales (delivered)" side by side, sets ordered, per-combo ordered and sales; it showed ordered value labelled as sales before) and the rename before/after report (PR 590).
- **Guard:** `packages/metrics/src/guard.test.ts` fails on an ad-hoc sum of order or line money, or a read of the PR 603 `mv_` views, anywhere else in the app.
- **Tests and gates:** pure tests and PostgreSQL tests with orders in every state (PLACED never in Sales), two stores, zones, payment methods, a late-evening delivery; smoke `figures` check on the combo report (`docs/qa/smoke.json`); device gate on the report page (0 fails). Guides: [combos](docs/admin-guide/combos.md), [analytics](docs/admin-guide/analytics.md).
- **Report views (follow-ups 92, 93):** migration `0012_kpi_report_views` — `mv_kpi_daily` (per store, basis and shop day) and `mv_kpi_lines_monthly` (per product, category, style group, district, upazila), counted exactly like the package; refreshed by `extas_refresh_kpi_views()` (`refreshKpiViews`, the app role may run it); read only through `kpiByDayFromView` / `linesByMonthFromView`, which answer live when the asked zone is not the views' zone; the four PR 603 `mv_` views are kept and marked superseded; index `idx_order_sales_delivered` on Order (storeId, status, deliveredAt). PostgreSQL tests: view = live, another zone answers live, the time-zone setting moves the views.
- **Dashboard tiles (follow-up 90, built 23 Oct):** Delivered sales and Ordered value on `/admin` (the new admin shell, S00), today / 7 / 30 days, each with its status; smoke `figures` reads them.
- **Planned:** the order analytics screen (follow-up 91).

**Built (PR 139): the audit log and the history tables are append-only at the database (CN-022).** Migration `0010_append_only`.
- **Two guards:** the app connects as its own role `extas_app`, which may insert and read but has no UPDATE, DELETE or TRUNCATE on AuditLog, SecurityEvent, SettingChange, SecretAccessLog, OrderEvent, StockMovement, WalletEntry, RewardEntry, PriceHistory, ProductRename, SmartRuleVersion, CheckoutFlagEvent, FraudDecision and ShipmentEvent; and a trigger on each refuses those for every role, the owner included. A correction is a new row.
- **Which models:** `packages/db/src/schema-meta.ts` lists the locked ones and every other `@append-only` model with its reason; the schema guard fails when a new one is in neither list.
- **Server:** server setup makes the role's password (`APP_DB_PASSWORD`, never in Git) and PgBouncer's login; the deploy, after the migrations, gives the role its login and points `DATABASE_URL` and `REPORT_DATABASE_URL` at it (`infra/deploy/app-role.sh`; it never fails a deploy and puts the old settings back when a run fails). Migrations, the settings sync, the seed, backups and the owner scripts keep the owner role. The smoke test checks every guard after each deploy and every night.
- **Retention:** how a purge would work is documented in the migration (owner role, an audit row, trigger off for one transaction); not built (follow-up 95). Guide: [team](docs/admin-guide/team.md).

Register: [S05](docs/MASTER-REGISTER.md#s05--order-management--pr-138155).

### S07 · Payments & wallet — Not started

Planned — see register PRs 165–174: [S07](docs/MASTER-REGISTER.md#s07--payments--wallet--pr-165174).

### S08 · Courier, returns, exchange — Not started

Planned — see register PRs 175–193, 525–526, 564: [S08](docs/MASTER-REGISTER.md#s08--courier-returns-exchange--pr-175193).

### S06 · Fraud & location — In progress

> **বাংলায় সংক্ষেপে:** ঠিকানা থেকে দোকান নিজে ডেলিভারি এলাকা আর চার্জ বের করে, আন্দাজে কখনো না; না বুঝলে কাস্টমারকে জিজ্ঞেস করে। অ্যাডমিনে "ডেলিভারি" পেজে তিনটা ব্যান্ড, আপনার সাব-এরিয়ার তালিকা, আর একটা ঠিকানা দিয়ে পরীক্ষা। চার্জ আপনি নিজে বসাবেন; শুরুতে সব বন্ধ।

**Delivery-zone engine (PR 549–553, 555, `@extas/delivery`).**
- **Gazetteer (549):** division → district → upazila/thana → area with Bengali, English and Banglish names; importer and a shared index. A public **sample** list ships; the national list comes later.
- **Bands (550):** Dhaka City = the DNCC + DSCC map; the owner's sub-area list; one flat outside band. Bands ship **off with no charge** (owner data).
- **Resolver (551) and guard (553):** the whole line decides, after a pause or leaving the field; still ambiguous → "Where is this address?". A charge only ever comes from a resolved place; the collision suite fails the build.
- **Autocomplete (552):** `GET /api/delivery/suggest`, each row with its district and charge.
- **Phone-first (555):** `POST /api/delivery/phone-area` fills the area only, limited per IP; the full address needs a login or an SMS code.
- **Admin:** ~~`/admin/delivery`~~ `/admin/delivery/zones` (Delivery › Zones in the new admin shell; the old address redirects) — three bands (charge, hours, on/off), the sub-area list (add, remove, put back), Try an address. Permissions `delivery.read`, `delivery.charges`, `delivery.areas`. Guide: [docs/admin-guide/delivery.md](docs/admin-guide/delivery.md).
- **Settings:** registry v15, group `delivery` (suggestions, phone-first limits, resolver waits) — every number editable.
- **Tests:** gazetteer, bands, resolver, suggest, phone helper, collision suite; device gate 0 fails.
- Still planned in S06: fraud and duplicate-order engine (156–164, 519–524, 540, 542–545), courier zone sync (554), the rest (502, 556–557, 559, 562, 567).

### S14 · CRM & customers — Not started

Planned — see register PRs 284–303, 505, 533–535: [S14](docs/MASTER-REGISTER.md#s14--crm--customers--pr-284303).

### S20 · Fulfilment & documents — Not started

Planned — see register PRs 404–412: [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604).

### S22 · Support (all-in-one) — Not started

Planned — see register PRs 425–436, 538: [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604).

### S11 · SEO engine — In progress (0/22)

> **বাংলায়:** গুগলের জন্য পণ্য আর ক্যাটাগরি পাতায় কাঠামোবদ্ধ তথ্য (দাম, স্টক, পথ) বসেছে; দোকানের পরিচয়ের অংশ বাকি, তাই PR 222 এখনো গোনা হয়নি।

Started: PR 222 partly (follow-up 61, not counted as built): Product, Offer and BreadcrumbList JSON-LD on the product
page and BreadcrumbList and ItemList on the category page (PR 45), from the page's own price and stock, no rating until
real reviews (`seo.structuredData`); Organization is follow-up 110. Planned — see register PRs 220–238, 527, 586, 588: [S11](docs/MASTER-REGISTER.md#s11--seo-engine--pr-220238).

### S12 · Content & blog — Not started

Planned — see register PRs 239–253, 528–530, 547, 591–593: [S12](docs/MASTER-REGISTER.md#s12--content--blog--pr-239253).

### S13 · Marketing & ads — Not started

Planned — see register PRs 254–283, 531–532, 548, 569, 589: [S13](docs/MASTER-REGISTER.md#s13--marketing--ads--pr-254283).

### S23 · Social & content studio — Not started

Planned — see register PRs 437–443: [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604).

### S15 · AI 360 Control Room — Not started

Planned — see register PRs 304–341, 506, 577–585: [S15](docs/MASTER-REGISTER.md#s15--ai-360-control-room--pr-304341).

### S16 · Finance, costs & reports — Not started

Planned — see register PRs 342–355, 504, 536–537, 568: [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604).

### S21 · Site Health & Audit — In progress (0/14)

Started: `readme-guard` in CI (scope on PR 594, CN-011) fails a pull request whose README PR log, stage counts or
feature states disagree with the register. Every deploy copies README.md and docs/ to `$EXTAS_ROOT/docs/<commit>/`
(`infra/deploy/docs-sync.sh`, `current` link, newest `DOCS_KEEP_VERSIONS` kept), mounted read-only in the app as
`/docs/current` for the admin tabs still to be built. Planned — see register PRs 413–424, 570, 594 (594 = the PR register and "Blueprint & files" inside the admin;
423 = the Server page): [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604).

### S24 · Virtual Photoshoot Studio — Not started

Planned — see register PRs 444–480, 539: [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604).

### S25 · Video & Campaign Creative Studio — Not started

Planned — see register PRs 481–490: [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604).

### S17 · Multi-store — Not started

Planned — see register PRs 356–377, 511–512: [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604) and
[A4](docs/BLUEPRINT.md#a4-multi-store--three-stores-one-server-one-codebase).

### S18 · Compliance, security, manual — Not started

Planned — see register PRs 378–390: [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604).

### S19 · Deploy, backup, go-live — Not started

Planned — see register PRs 391–403, 507, 587 (backup settings and monthly restore drills, WordPress migration on
go-live day): [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604).

### S26 · Installation, documentation & distribution — Parked

Parked — register PRs 513–518, built only when the owner hands the system to someone else:
[the parking lot](docs/MASTER-REGISTER.md#the-parking-lot).

### S27 · No-ERP stock module — Parked

Parked — not numbered yet; the seam is kept open by PR 497–499: [the parking lot](docs/MASTER-REGISTER.md#the-parking-lot).

---

## PR log

> **বাংলায় সংক্ষেপে:** `main`-এ যা যা মার্জ হয়েছে, নতুনটা আগে। প্রতিটা সারিতে এক লাইনে কী যোগ হলো।

Newest first. Times are Dhaka time (20 Oct 2026 unless shown). "#n" is the GitHub pull request; "direct" is a
documents-only commit to `main`; "server report" commits are written by the `server-setup` workflow.

| GitHub | Register PRs / title | Date | What it added |
|---|---|---|---|
| #35 | PR [12](docs/stages/S00.md#pr-12), [155](docs/stages/S05.md#pr-155), [495](docs/stages/S00.md#pr-495), [28](docs/stages/S01.md#pr-28) | 24 Oct | The new admin shell (CN-018, CN-022; demo V12.3 `#/admin`; settings v33, no migration). Every admin page now sits in one of 14 sections in four groups (Daily work, Grow, Business, and Settings / Help & Build at the bottom), with section tabs and "More", an icon rail on a tablet and a drawer plus Home · Orders · Support · Search · More on a phone. The menu shows only what a person's role can open, with waiting-work badges. Ctrl K or "/" opens one search for pages, settings, products, orders and customers. Each section has its Bengali guide in a side panel. `/admin` is the Dashboard: "Needs you now" from the real queues, plus Delivered sales and Ordered value for today / 7 / 30 days from `@extas/metrics`. A role can start on its own section (off by default); the size-chart links' tap area is 44 px. `/admin/delivery` moved to `/admin/delivery/zones` (redirected). |
| #35 | PR [138](docs/stages/S05.md#pr-138), [144](docs/stages/S05.md#pr-144), [145](docs/stages/S05.md#pr-145), [147](docs/stages/S05.md#pr-147), [153](docs/stages/S05.md#pr-153) | 23 Oct | Order core (S05, BACKEND-ARCHITECTURE §6.5.1, settings v32, migration `0018_order_core`, admin API only, the screens come with the new admin). One order service runs every order step: a wrong step is refused, two people pressing at once get one answer and one "already changed", and every change writes the order's timeline and the audit log in one go. Cancel with reason codes frees the held stock; a paid order only gets a refund request, no money moves; after booking it asks the courier first. Hold and release with a reason support can see. Internal notes and flags. Duplicate orders of one customer go to a review queue and wait for a decision before they can be confirmed. |
| #34 | PR [136](docs/stages/S04.md#pr-136), [66](docs/stages/S02.md#pr-66), [87](docs/stages/S02.md#pr-87), [86](docs/stages/S02.md#pr-86) | 23 Oct | Invoice, product questions and the shop's motion (S04/S02, settings v31, no admin screen, no migration). Every order has its invoice in English and Bengali at `/account/orders/<n>/invoice`, drawn from the order as stored, printable and downloadable, for the order's customer, the browser that placed it or staff with `orders.invoice`; the shop's legal details show once the owner fills them. The product page shows the shop's own approved answers with "See all questions" and the WhatsApp ask. The order-placed celebration (off until the owner switches it on, never on a slow phone, any tap ends it) and one switch board for every light sweep. |
| #34 | PR [91](docs/stages/S03.md#pr-91), [92](docs/stages/S03.md#pr-92), [93](docs/stages/S03.md#pr-93), [94](docs/stages/S03.md#pr-94), [95](docs/stages/S03.md#pr-95), [102](docs/stages/S03.md#pr-102), [103](docs/stages/S03.md#pr-103) | 23 Oct | Combo storefront (S03, demo V12.2, settings v30, no admin screen, no migration). Every combo has its own page `/combo/<link>` (+ `/bn/`) in template C1 (all on one page) or C2 (step by step), with the set picture and a tab per piece, popular colour pairs, each piece's own colour and size with "Same size as item 1", the rules card and the set price and saving from `@extas/combos` only; one tap adds the set to the bag (a toast on the phone, the added panel on a computer) and "Change" in the bag edits it in place. An ended combo keeps its page with "Buy them separately". The product page offers the running sets that hold it, every combo page ends with "More sets", and `/combos` lists all sets by piece count with season tabs. |
| #34 | PR [129](docs/stages/S04.md#pr-129), [130](docs/stages/S04.md#pr-130), [71](docs/stages/S02.md#pr-71), [131](docs/stages/S04.md#pr-131), [132](docs/stages/S04.md#pr-132), [133](docs/stages/S04.md#pr-133), [134](docs/stages/S04.md#pr-134), [135](docs/stages/S04.md#pr-135), [137](docs/stages/S04.md#pr-137) | 23 Oct | Customer accounts (S04, demo V12.2, settings v29, no admin screen, no migration). The first order makes the account with no password (SIM-F-039), and the thank-you page says which number to log in with; login by one-time SMS code (mock sender until the owner adds the key) with an optional own password; the browser's wishlist joins the account; My account with orders, For you, Rewards, Wallet, Wishlist and Profile; the offer banner and profile photo (both off); the order page with tracking, the courier and the late flag past the promise (SIM-F-018); the checkout fills itself for a signed-in customer. Order states, refunds and returns still wait for the owner (CN-022). |
| #34 | PR [52](docs/stages/S02.md#pr-52), [50](docs/stages/S02.md#pr-50), [58](docs/stages/S02.md#pr-58), [51](docs/stages/S02.md#pr-51), [88](docs/stages/S02.md#pr-88) | 23 Oct | Product page templates and Find My Size (S02, demo V12.2, settings v28, no admin screen, no migration). A product page uses the product's own template, else its category's, else the shop default T1, with a `?template=` preview that search engines skip; T2 Editorial (photos peek on a phone, two across on a computer, a larger title) and T3 Fit-first (sizes, the finder and the measurements in one card). Find My Size gives a size from height and weight on the product's own chart and ease, with the reasons in both languages; no chart, no finder; the answer is kept on the phone and recorded without a name for PR [59](docs/stages/S02.md#pr-59); it shares the one "Your size" tag with the last-bag size (follow-up 62) and comes first. SIM-F-012 acceptance test. Storefront speed (PR [88](docs/stages/S02.md#pr-88)): the product page's blocking time drops from about 250 ms to 24–110 ms (V8 compile hints, popups loaded on demand, one shared wishlist reader) and CI checks the page and image weight targets. |
| #33 | PR [74](docs/stages/S02.md#pr-74), [41](docs/stages/S02.md#pr-41), [40](docs/stages/S02.md#pr-40), [45](docs/stages/S02.md#pr-45), [222](docs/stages/S11.md#pr-222), [56](docs/stages/S02.md#pr-56), [117](docs/stages/S04.md#pr-117), [126](docs/stages/S04.md#pr-126) | 23 Oct | Storefront follow-ups (settings v25, no admin screen). On a computer, cards show their back view and Quick add on hover or keyboard focus, with the bag's added panel on the home and category pages; the home page's cards fit like the category page's; a long phone slogan steps to its short form instead of being cut; BreadcrumbList / ItemList JSON-LD on category pages and Product / Offer / BreadcrumbList JSON-LD on product pages from their own price and stock (no rating; PR [222](docs/stages/S11.md#pr-222) partly built, Organization still to come); the owner's words under each size box and "Your size" (both off until set); address suggestions under the checkout's address box; the thank-you page says the delivery note back and can show "What happens next"; a sample sub-category so CI measures the phone menu's accordion. |
| #32 | PR [72](docs/stages/S02.md#pr-72), [73](docs/stages/S02.md#pr-73) | 23 Oct | Storefront search (S02, demo V12.2, settings v24, no admin screen). The header search opens the demo's window on the phone and a panel under the header on the computer, with live suggestions from one index across products, categories and help pages (prefix and typo matching, synonyms and Bengali words from settings; only live, sellable products; a help page still "Coming soon" is never offered). Meilisearch answers when the server has it, PostgreSQL otherwise, indexed by the background worker. `/search?q=` (+ `/bn/`) shows help cards, categories, then the category page's own listing with filters and "Best match" sort; an empty search suggests words, categories and WhatsApp. |
| #31 | PR [7](docs/stages/S0A.md#pr-7), [6](docs/stages/S0A.md#pr-6), [155](docs/stages/S05.md#pr-155), [119](docs/stages/S04.md#pr-119), [195](docs/stages/S09.md#pr-195), [494](docs/stages/S00.md#pr-494) | 23 Oct | Back-office and server follow-ups (no new settings, no admin screen). The preview password lets only the signed ERP webhook POST through (follow-up 80); a rollback starts the old version's worker too (82); KPI report views and a Sales index that count exactly like `@extas/metrics`, the old views kept and marked superseded (92, 93); the rules engine's delivery figure is the band charge the checkout uses (54); oversold stock shows as a negative number and raises shortage cards that block booking until a person decides (16); the hardcode guard catches the simulation's hard-coded customer texts (14, first half). Two money questions go to the owner (BLOCKED 18, 19); nothing changes until he answers. |
| #30 | PR [53](docs/stages/S02.md#pr-53), [67](docs/stages/S02.md#pr-67), [68](docs/stages/S02.md#pr-68), [69](docs/stages/S02.md#pr-69), [70](docs/stages/S02.md#pr-70), [71](docs/stages/S02.md#pr-71), [74](docs/stages/S02.md#pr-74), [75](docs/stages/S02.md#pr-75), [40](docs/stages/S02.md#pr-40) | 23 Oct | Storefront batch 3 (S02, demo V12.2, settings v23, no admin screen). The product page's first-screen budget as one setting with a device-gate check; "Wear it with" and "Recently viewed" rows that slide and pause for mouse, touch and keyboard; the floating rail (wishlist heart, WhatsApp) and the share tiles, both off by default; the site-wide WhatsApp button as a switch, off; the wishlist at `/account/wishlist` kept per browser on the server, with "Move to wishlist" in the bag; the phone menu's sub-categories opening in place; help pages at `/help/<slug>` built only from live rules and the owner's words ("Coming soon" until then); the phone header stays one line with WhatsApp on. Device gate 0 fails in 1302 checks. |
| #29 | PR [6](docs/stages/S0A.md#pr-6), [196](docs/stages/S09.md#pr-196), [155](docs/stages/S05.md#pr-155), [139](docs/stages/S05.md#pr-139) | 23 Oct | The owner's CN-022 foundation items. A background worker (`@extas/jobs`): BullMQ with one scheduler leader, a `JobRun` row per attempt with retries, backoff and a dead letter, a heartbeat, and a retry never repeats a finished run; stock pull, cart-hold expiry, the ERP outbox and reconcile run on it; the Server page (`/admin/server`) shows the worker's state and the failed jobs (PR [6](docs/stages/S0A.md#pr-6)). An ERP webhook receiver (`POST /api/erp/webhook`) for `stock.changed` and `variant.changed`: signature checked with the key in the vault (refuses everything until it is entered), a time window, stored once per event id, an older change than the shop holds is ignored; polling stays as the fallback and the practice ERP stays until the owner connects the real one (PR [196](docs/stages/S09.md#pr-196)). One KPI definition (`@extas/metrics`): "Sales" = delivered orders only, "Ordered value" shown beside it; the combo report now shows both, and a test fails any report that adds up order money on its own (PR [155](docs/stages/S05.md#pr-155)). The audit log and 13 other history tables are append-only at the database: the app runs as its own role, which cannot change or delete those rows, and a trigger refuses it for every role (PR [139](docs/stages/S05.md#pr-139)). |
| #28 | PR [115](docs/stages/S04.md#pr-115), [116](docs/stages/S04.md#pr-116), [117](docs/stages/S04.md#pr-117), [118](docs/stages/S04.md#pr-118), [119](docs/stages/S04.md#pr-119), [120](docs/stages/S04.md#pr-120), [121](docs/stages/S04.md#pr-121), [122](docs/stages/S04.md#pr-122), [123](docs/stages/S04.md#pr-123), [124](docs/stages/S04.md#pr-124), [125](docs/stages/S04.md#pr-125), [126](docs/stages/S04.md#pr-126) | 23 Oct | The checkout on new.extas.com.bd (S04 22/41): `/checkout` and `/bn/checkout` from demo V12.2 with the steps header and the phone's order-summary bar; name, phone and address with inline checks; the address read by the national gazetteer, and "where is this address?" instead of a guess; the delivery charge from the zone, shown before typing; payment methods with Cash on Delivery only when the owner's switch and the Smart Rules allow it, and mobile banking, card and online on a test payment page until the gateways' keys arrive (no money moves); quantity and remove, wallet, the marketing opt-in, Confirm button states; order placement that is idempotent (one press, one order) and stores exactly the money shown (SIM-F-003), keeps failed payments with a retry (SIM-F-026); the thank-you page. The order is created in its first state only; order states, refunds and returns wait for the owner (CN-022). Every option is a `checkout.*` setting (registry v20), off or empty where optional, no admin screen (CN-019). Also filed: CN-022 (worker, ERP webhook, one "Sales" KPI, append-only audit log). |
| #27 | PR [82](docs/stages/S02.md#pr-82), [54](docs/stages/S02.md#pr-54), [55](docs/stages/S02.md#pr-55), [56](docs/stages/S02.md#pr-56), [57](docs/stages/S02.md#pr-57), [60](docs/stages/S02.md#pr-60), [61](docs/stages/S02.md#pr-61), [62](docs/stages/S02.md#pr-62), [63](docs/stages/S02.md#pr-63), [64](docs/stages/S02.md#pr-64), [49](docs/stages/S02.md#pr-49) | 23 Oct | The product page on new.extas.com.bd (S02 23/58): template T1 at `/p/<product>` and `/p/<product>/<colour>` (and `/bn/…`), photos with one swipe strip per colour, thumbnails and full-screen zoom; colour swatches with each colour's own address and "All N colours"; size pills S to 4XL where a sold-out size is crossed out, never hidden (SIM-F-035); the size chart popup in inches and cm; the stock line and "Only N left"; the price block with the ৳ never split from its number; the promise row and the Delivery · Exchange · Returns cells read live from Smart Rules; Fabric & care; and the bag's Add button with the added-to-bag panel (follow-up 38). Every option is a `pdp.*` setting (registry v19), off or empty where it is optional, no admin screen (CN-019). Bengali pages with products no longer stall on fonts (PR [82](docs/stages/S02.md#pr-82), follow-up 23), with a seeded Lighthouse check in CI. |
| #26 | PR [105](docs/stages/S04.md#pr-105), [106](docs/stages/S04.md#pr-106), [108](docs/stages/S04.md#pr-108), [109](docs/stages/S04.md#pr-109), [110](docs/stages/S04.md#pr-110), [111](docs/stages/S04.md#pr-111), [112](docs/stages/S04.md#pr-112), [113](docs/stages/S04.md#pr-113), [114](docs/stages/S04.md#pr-114), [107](docs/stages/S04.md#pr-107) | 23 Oct | The bag on new.extas.com.bd (S04 10/41): `/bag` and `/bn/bag` from demo V12.2, kept across visits in a secure cookie for 30 days (a setting); lines with size, quantity and price, removed lines archived with Undo (never deleted); set lines with each piece linking to its product; the added-to-bag panel (mounted by the product page, follow-up 38); one offer slot and the tier box; the two-sizes notice asked once (SIM-F-036); the order summary; the discount code box with every refusal in words (SIM-F-009); free-delivery progress; "You may also like". Every word in English and Bengali, every amount and switch a setting (registry v18), no admin screen (CN-019). CI now starts the app as the Dockerfile does (all addresses), so `/bn` pages are measured in Bengali, and runs the bag tests on PostgreSQL. |
| #25 | PR [41](docs/stages/S02.md#pr-41), [85](docs/stages/S02.md#pr-85), [45](docs/stages/S02.md#pr-45), [46](docs/stages/S02.md#pr-46), [47](docs/stages/S02.md#pr-47), [48](docs/stages/S02.md#pr-48) | 23 Oct | Category page on new.extas.com.bd (S02 13/58): `/collections/[slug]` and `/bn/collections/[slug]`, with `/collections/new-in` for the newest styles; a grid with breadcrumb, SEO text block and questions, and Show more pages; filters built from the category's own products with live counts (stock, size, colour, fit, price band, on sale, quick chips; a sold-out size is crossed out, never hidden, SIM-F-035); a real listbox for sort; a sticky filter bar; all settings in `categoryPage` (registry v17), no admin screen (CN-019). The home hero's default words no longer claim a count, season or year, and a test keeps every shop default free of such claims (PR [41](docs/stages/S02.md#pr-41), CN-017). When the device gate fails, CI prints and keeps the app's log (PR [85](docs/stages/S02.md#pr-85)). |
| #24 | PR [11](docs/stages/S00.md#pr-11), [85](docs/stages/S02.md#pr-85), [214](docs/stages/S10.md#pr-214), [508](docs/stages/S00.md#pr-508) | 23 Oct | Follow-ups: every package lints with ESLint and says what it is for at the top of `src/index.ts` (PR [11](docs/stages/S00.md#pr-11)); the device gate signs in on the sample data, so admin controls that only show with data are checked at 44 × 44, 0 fails in 620 checks (PR [85](docs/stages/S02.md#pr-85)); Eid order-by dates per band and district with a pre-order advance, as engine, settings and API, all off and empty, with no admin screen until the admin architecture is approved (PR [214](docs/stages/S10.md#pr-214)).; the admin session end to end runs in CI on every pull request in real Chromium: sign in, refresh, the sign-in page while signed in, log out, and the old session refused afterwards (PR [508](docs/stages/S00.md#pr-508)). |
| #23 | PR [82](docs/stages/S02.md#pr-82), [501](docs/stages/S02.md#pr-501), [503](docs/stages/S02.md#pr-503), [84](docs/stages/S02.md#pr-84), [42](docs/stages/S02.md#pr-42), [40](docs/stages/S02.md#pr-40), [85](docs/stages/S02.md#pr-85), [41](docs/stages/S02.md#pr-41), [43](docs/stages/S02.md#pr-43), [4](docs/stages/S0A.md#pr-4) | 23 Oct | Storefront foundation and home page on new.extas.com.bd (S02 9/58): four themes on one token set, branding and the eleven logo styles from settings, English and Bengali shop (`/bn`, language switch, hreflang), one slider engine with separate touch, mouse and keyboard pauses, the store shell (announcement bar, header, phone menu, bottom bar, footer, checkout header, coming-soon pages, 404), 44 px tap layers, the home page and the hero slider, matched to demo V12.2; storefront pages in the device gate and the Lighthouse budget (TBT under 200 ms); the footer sign-up form stays hidden until the sign-up list exists (CN-017: no promise the shop can't keep). The nightly smoke test now runs the checks of the live version, so a check merged before its deploy can't give a false alarm (PR [4](docs/stages/S0A.md#pr-4)). |
| #22 | PR [89](docs/stages/S03.md#pr-89), [90](docs/stages/S03.md#pr-90), [571](docs/stages/S03.md#pr-571), [99](docs/stages/S03.md#pr-99), [101](docs/stages/S03.md#pr-101), [96](docs/stages/S03.md#pr-96), [97](docs/stages/S03.md#pr-97), [575](docs/stages/S03.md#pr-575), [104](docs/stages/S03.md#pr-104), [549–553](docs/stages/S06.md), [555](docs/stages/S06.md#pr-555), [500](docs/stages/S00.md#pr-500) | 22 Oct | S03 combo core: combo model, admin `/admin/combos` (fixed combos, auto colour-pair rules, set photo, report), set tiers from Smart Rules, set validation, summary and add-to-bag with a locked price; S06 delivery-zone engine: gazetteer (sample list), bands (Dhaka City map, sub-area list, outside), whole-line resolver with "Where is this address?", charge only from a resolved place (collision suite), autocomplete, phone-first area fill; admin `/admin/delivery` with its Bengali guide; sign-in says "write the full e-mail address" when the e-mail has no "@" (PR [500](docs/stages/S00.md#pr-500), smoke-checked); Bengali guides for every built admin section (CN-014) |
| #20 | PR [4](docs/stages/S0A.md#pr-4), [85](docs/stages/S02.md#pr-85), [8](docs/stages/S0A.md#pr-8), [594](docs/stages/S21.md#pr-594), [17](docs/stages/S00.md#pr-17) | 20 Oct | CI parses every workflow file (PR [17](docs/stages/S00.md#pr-17)); Smoke test on new.extas.com.bd after every deploy and every night (every built page signed out and as a read-only check account, phone and desktop; a failure rolls the deploy back; pictures in `docs/reports/smoke/latest/`, CN-016); device gate (15 phones, 10 tablets, 6 desktops) in CI, 0/341 fails, admin tap targets 44×44; product photos and a dated docs bundle in every nightly backup, checked by the restore test; docs copied to the server on every deploy with the commit hash (CN-011) |
| #19 | PR [208–219](docs/stages/S10.md), [594](docs/stages/S21.md#pr-594), [509](docs/stages/S00.md#pr-509), [508](docs/stages/S00.md#pr-508), [4](docs/stages/S0A.md#pr-4), [17](docs/stages/S00.md#pr-17), [15](docs/stages/S00.md#pr-15), [7](docs/stages/S0A.md#pr-7) | 20 Oct | Admin sign-in fixed: a fresh installation gets its mother store in the migrate step (PR [508](docs/stages/S00.md#pr-508)), and CI signs in end to end on the production images before every deploy (PR [4](docs/stages/S0A.md#pr-4)); S10 Smart Rules complete (engine, rule admin with live preview, delivery/exchange/set/discount/festive rules, coupons, notices and pop-ups, conflicts, history, simulation); `readme-guard` CI check; store-settings falls back to the newest migrate image; `ci.yml` parses again (PR [17](docs/stages/S00.md#pr-17)), so CI and deploys run; the owner's way back in when he cannot sign in: `owner-reset.yml` gives his account a new first password on the server (PR [15](docs/stages/S00.md#pr-15)) |
| #18 | PR [509](docs/stages/S00.md#pr-509), [17](docs/stages/S00.md#pr-17), [15](docs/stages/S00.md#pr-15), [4](docs/stages/S0A.md#pr-4) + CN-010 | 20 Oct | Owner values go into the live store from the server (`store-settings.yml`), the owner-account workflow and Bengali password steps, deploy result committed back, CI checks one register PR per commit and README against the register; BLOCKED answers struck through |
| direct | CN-011: README as the A-to-Z front page; docs on the server and in backups | 20 Oct | This page rewritten as the full front page, `docs/README.md` index, CN-011 in blueprint and register, CLAUDE.md rules |
| direct `f3822d0` | CN-009: owner answers (Note 52) | 12:22 | Watermark text, photos never deleted, honest "was" price, defaults; owner data is never a blocker |
| direct `303b342` | CN-008: demo V12.1 | 12:13 | Demo V12.1 (owner desktop review, 44 items), QA and admin audit reports, owner notes, agent skills; README as live status page |
| #17 `1c8a4d6` | PR [197–200](docs/stages/S09.md), [202–207](docs/stages/S09.md) | 11:17 | S09 complete: cart holds, ERP order documents, low stock, stock counts, sync health page, re-sync, movement report |
| #16 `a8face8` | PR [33](docs/stages/S01.md#pr-33), [36](docs/stages/S01.md#pr-36), [39](docs/stages/S01.md#pr-39) (+ [27](docs/stages/S01.md#pr-27)/[32](docs/stages/S01.md#pr-32) and [22](docs/stages/S01.md#pr-22) follow-ups) | 10:08 | Import from a link, ghost archive and back-in-stock, product audit; links archived never deleted; storage-mock photo fix |
| #15 `4563976` | PR [497](docs/stages/S09.md#pr-497), [498](docs/stages/S09.md#pr-498), [499](docs/stages/S09.md#pr-499), [194](docs/stages/S09.md#pr-194), [195](docs/stages/S09.md#pr-195), [196](docs/stages/S09.md#pr-196), [201](docs/stages/S09.md#pr-201) | 09:15 | ERP adapter and practice ERP, ERP mode and guard, sync layer, stock pull, company/warehouse mapping, locations |
| #14 `26d2b1f` | PR [21](docs/stages/S01.md#pr-21), [26–29](docs/stages/S01.md), [32](docs/stages/S01.md#pr-32), [34](docs/stages/S01.md#pr-34), [35](docs/stages/S01.md#pr-35), [38](docs/stages/S01.md#pr-38) | 08:22 | Product admin screens, publish checklist and health score, publish queue, size charts, collections and tags, CSV, "was" price |
| #13 `54b7d95` | PR [500](docs/stages/S00.md#pr-500) (fix) | 07:24 | Self-hosted fonts, so the image build never downloads fonts |
| #12 `28ea164` | PR [19](docs/stages/S01.md#pr-19), [20](docs/stages/S01.md#pr-20), [22–25](docs/stages/S01.md), [30](docs/stages/S01.md#pr-30), [31](docs/stages/S01.md#pr-31), [37](docs/stages/S01.md#pr-37), [590](docs/stages/S01.md#pr-590) | 06:54 | Catalogue domain and API, image pipeline, watermark, responsive images, photo minimum, media library, naming and links |
| #11 `4407ddf` | PR [500](docs/stages/S00.md#pr-500) | 06:10 | Admin sign-in and frame, Keys & connections page; S0A and S00 reports |
| #10 `b5fe56d` | PR [509](docs/stages/S00.md#pr-509), [508](docs/stages/S00.md#pr-508), [14](docs/stages/S00.md#pr-14) | 05:20 | Owner-data register and check, general default pack, sample catalogue |
| #9 `fa6b77e` | PR [15](docs/stages/S00.md#pr-15), [16](docs/stages/S00.md#pr-16), [495](docs/stages/S00.md#pr-495) | 05:09 | Staff and customer sign-in, permission checks on every admin action, role builder, audit log |
| server report `5c0656e` | server report 04:34 | 04:34 | Machine report after PR [18](docs/stages/S00.md#pr-18)'s setup run |
| #8 `1861652` | PR [18](docs/stages/S00.md#pr-18) | 04:34 | Adapter framework (mock / sandbox / live) and the storage adapter |
| server report `72f88b1` | server report 04:21 | 04:21 | Machine report |
| #7 `aaa5f76` | PR [491](docs/stages/S00.md#pr-491), [492](docs/stages/S00.md#pr-492), [496](docs/stages/S00.md#pr-496), [510](docs/stages/S00.md#pr-510) | 04:20 | Settings framework, resolver, settings migration on deploy, reset to default |
| #6 `5667515` | PR [493](docs/stages/S00.md#pr-493) (+ PR [17](docs/stages/S00.md#pr-17) fix) | 04:12 | Credential vault; Lighthouse gate on real throttled paint |
| #5 `9959d1b` | PR [494](docs/stages/S00.md#pr-494) | 03:44 | Hardcode guard as the first CI step |
| #4 `3122834` | PR [13](docs/stages/S00.md#pr-13), [603](docs/stages/S00.md#pr-603) | 03:39 | Full Prisma schema with `storeId`, index pack, CI `db` job |
| server report `50daeb7` | server report 03:00 | 03:00 | Machine report |
| #3 `d2ed429` | PR [11](docs/stages/S00.md#pr-11), [12](docs/stages/S00.md#pr-12), [17](docs/stages/S00.md#pr-17) | 02:59 | App skeleton, CI gates, zero-downtime deploy, Bengali status page; first deploy live at 03:03 |
| server report `5bddc39` | server report 02:47 | 02:47 | Machine report |
| #2 `3a8d198` | PR [7](docs/stages/S0A.md#pr-7) (CN-007) | 02:46 | Preview password stays on the server, rotatable |
| server report `d5f2220` | server report 02:40 | 02:40 | First machine report |
| #1 `c96b258` | PR [1–10](docs/stages/S0A.md), [601](docs/stages/S0A.md#pr-601), [604](docs/stages/S0A.md#pr-604) | 02:38 | S0A: server setup as code, workflows on the runner |
| direct `ae1e461` | CN-006 | 02:34 | Run without stopping: no wave-boundary stop, no permission asks, auto-resume |
| direct `4c2be88` | Owner rule | 02:29 | Plans and reports by stage/PR, never by days |
| direct `59865ae` | CN-005 | 02:22 | ERP ↔ shop API contract (`docs/ERP-API-CONTRACT.md`) |
| direct `9895254` | CN-004 | 02:02 | Agent/skill changes exported to `docs/agents/live`; runner script sh-compatible |
| direct `dc0936a` | Session 0 | 01:33 | Repository set up: blueprint V2.1 final, register, demo V12, QA tools, agent files, CLAUDE.md, START-HERE, runner bootstrap |
| `7222f55` | Initial commit | 15 Oct | Empty repository |

---

## Change notes

> **বাংলায় সংক্ষেপে:** মালিকের প্রতিটা নতুন সিদ্ধান্ত একটা "পরিবর্তনের নোট" (CN) হয়ে ব্লুপ্রিন্ট আর রেজিস্টারে ওঠে।

A change note records what the owner asked, which PRs it lands on and the date (process:
[How changes are made after V2](docs/BLUEPRINT.md#how-changes-are-made-after-v2),
[`docs/owner/CHANGE-PROCESS.md`](docs/owner/CHANGE-PROCESS.md)). The notes sit as dated blocks in the blueprint and
the register.

| Note | Date | One line | Where |
|---|---|---|---|
| CN-001 | 19 Oct 23:33 | The owner's server specification: blueprint V2 → V2.1, new PR 601–604, dated scope on many server PRs | [V2 → V2.1 change log](docs/BLUEPRINT.md#v2--v21-change-log-cn-001-owner-19-oct-2333) · [A2.9](docs/BLUEPRINT.md#a29-server-specification--v21--19-oct-2333-owner-cn-001--locked) |
| CN-002 | 20 Oct 00:45 | VM created in Malaysia West zone 1 (kept instead of Southeast Asia); Blob in the same region; ports 22/80/443 verified | [Blueprint front matter](docs/BLUEPRINT.md) |
| CN-003 | 20 Oct 01:30 | Server reached through a self-hosted runner, no SSH; build deploys to new.extas.com.bd, extas.com.bd untouched until go-live; repo and entry files; 4-piece prices stay demo default | [A1](docs/BLUEPRINT.md#a1-how-this-build-runs) |
| CN-004 | 20 Oct 02:01 | Agent profiles, skills and lessons changed in the AI panel are exported to `docs/agents/live/` | [A1](docs/BLUEPRINT.md#a1-how-this-build-runs) |
| CN-005 | 20 Oct 02:25 | The ERP ↔ shop API is fixed in `docs/ERP-API-CONTRACT.md` | [A3](docs/BLUEPRINT.md#a3-architecture--the-erp-is-the-master) |
| CN-006 | 20 Oct 02:33 | The build never stops for the owner: report at wave ends and continue; only money / deletion / irreversible items and the go-live switch need him | [A1](docs/BLUEPRINT.md#a1-how-this-build-runs) |
| CN-007 | 20 Oct | The preview password never goes through chat, logs or artifacts; the owner reads it on the VM; rotatable | [A1](docs/BLUEPRINT.md#a1-how-this-build-runs) |
| CN-008 | 20 Oct | Owner desktop review of V12 (44 items, invoices, admin screens) built into demo V12.1, the new UI truth | [A1](docs/BLUEPRINT.md#a1-how-this-build-runs) · [register](docs/MASTER-REGISTER.md#build-status) |
| CN-009 | 20 Oct 12:22 | Owner answers (Note 52): watermark text, photos never deleted, honest "was" price, defaults; owner data is never a blocker | [A1](docs/BLUEPRINT.md#a1-how-this-build-runs) · [register](docs/MASTER-REGISTER.md#build-status) |
| CN-010 | 20 Oct 12:47 | Owner Note 53: the home page shows the store (built parts, "শিগগির আসছে" elsewhere; progress only at `/status`), S02 now beside the rest, the owner's admin account opened on the server | [A1](docs/BLUEPRINT.md#a1-how-this-build-runs) · [register](docs/MASTER-REGISTER.md) |
| CN-011 | 20 Oct | README is the live, detailed front page; every deploy copies `docs/` to the server for the admin's register tabs; every backup carries a dated docs bundle; an organisation standard every PR keeps | [A1](docs/BLUEPRINT.md#a1-how-this-build-runs) · [register](docs/MASTER-REGISTER.md#build-status) |
| CN-012 | 20 Oct | Owner Note 54: hero campaigns with ready templates; checkout texts, field order, bag style and payment options are settings; design changes reach the phone only after the device gate | [register](docs/MASTER-REGISTER.md#build-status) |
| CN-013 | 20 Oct | Think beyond the ask: the 50-order journey simulation is a go-live gate; every finding gets fix, prevention, core review and growth ideas | [register](docs/MASTER-REGISTER.md#build-status) |
| CN-014 | 20 Oct | Eight simulation ideas as optional settings (off by default); gift mode is new PR 605; a Bengali guide per admin section | [register](docs/MASTER-REGISTER.md#build-status) · [`docs/admin-guide/`](docs/admin-guide/README.md) |
| CN-015 | 20 Oct | Customer problems found automatically: "Running problems" in the admin and at the top of this README | [register](docs/MASTER-REGISTER.md#build-status) |
| CN-016 | 20 Oct | Nothing reaches the owner broken: smoke test after every deploy and every night, rollback on failure | [register](docs/MASTER-REGISTER.md#build-status) |
| CN-017 | 23 Oct | 50-order simulation on demo V12.2: 39 findings, each a required acceptance test of its PR; bulk / corporate lane is new PR 606 | [register](docs/MASTER-REGISTER.md#build-status) · [report](docs/qa/SIMULATION-REPORT.md) |
| CN-018 | 23 Oct | Owner's answers to the simulation questions, all as backend settings; "build the system, never ask for numbers"; simple admin architecture first | [register](docs/MASTER-REGISTER.md#build-status) |
| CN-019 | 23 Oct | One Messages control centre; a modern, simple admin with mock-ups first; a detailed Bengali manual; 20 more simulation orders | [register](docs/MASTER-REGISTER.md#build-status) |

---

## Docs map

> **বাংলায় সংক্ষেপে:** কোন কাগজ কোথায় আছে। পুরো তালিকা [`docs/README.md`](docs/README.md)-এ।

| What | Where |
|---|---|
| Full specification (V2.1 final + change notes) | [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md) — older versions in [`docs/history/`](docs/history) |
| All 606 PRs, build status, stage table | [`docs/MASTER-REGISTER.md`](docs/MASTER-REGISTER.md) |
| UI truth: the clickable demo | [`docs/demo/EXTAS-demo-V12.2.html`](docs/demo/EXTAS-demo-V12.2.html) (download, open in a browser) · source in [`docs/demo/src/`](docs/demo/src) · V12.1 and V12 kept beside it as history · public share build: see [`docs/README.md`](docs/README.md) |
| Every owner note | [`docs/owner/ROUND15.md`](docs/owner/ROUND15.md) (and `ROUND14.md`) |
| Owner reviews, research and plans | [`docs/owner/`](docs/owner) — desktop and phone reviews, combo research and ranking, Google traffic plan, blog plan, server spec, change process |
| QA checklist and reports | [`docs/qa/ECOMMERCE-CHECKLIST.md`](docs/qa/ECOMMERCE-CHECKLIST.md) · reports and tools in [`docs/qa/`](docs/qa) · gates in Blueprint [Appendix C](docs/BLUEPRINT.md#appendix-c--qa-gate-definition-and-test-inventory) |
| Agents, skills, lessons | [`docs/agents/`](docs/agents) — seven agent profiles, protocol, curriculum, skills, [`lessons/ALL.md`](docs/agents/lessons/ALL.md) |
| ERP API contract | [`docs/ERP-API-CONTRACT.md`](docs/ERP-API-CONTRACT.md) |
| How sessions run, coding mechanics | [`docs/START-HERE.md`](docs/START-HERE.md) · [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) |
| Server in plain Bengali | [`docs/SERVER.md`](docs/SERVER.md) · latest machine report [`docs/reports/server/latest.md`](docs/reports/server/latest.md) |
| Stage reports in Bengali | [`docs/reports/`](docs/reports) |
| Admin guides in Bengali, one per section (CN-014) | [`docs/admin-guide/`](docs/admin-guide/README.md) |
| Owner guides | [`RUNNER-SETUP.md`](docs/owner/RUNNER-SETUP.md) (runner, once) · [`PREVIEW-LOGIN.md`](docs/owner/PREVIEW-LOGIN.md) (preview password) · [`AZURE-VM-GUIDE.pdf`](docs/owner/AZURE-VM-GUIDE.pdf) (the VM) · [`OWNER-PRECODE-CHECKLIST.md`](docs/owner/OWNER-PRECODE-CHECKLIST.md) |

---

## For a future developer

> **বাংলায় সংক্ষেপে:** ৫ বছর পরে নতুন কেউ এলে যেন সব বোঝে — কোড লেখার নিয়ম, নতুন সেটিং যোগ করার নিয়ম, নতুন কাজ রেজিস্টারে
> তোলার নিয়ম, আর হস্তান্তরের নিয়ম।

**README must stay current (readme-guard, CN-011).** CI's `readme-guard` job ([`tools/readme-guard.mjs`](tools/readme-guard.mjs))
fails any pull request into `main` whose title names a PR with no row in the PR log below, whose stage counts differ
from the register's Build status, or that touches a stage still marked "Not started" under Features. Update the
dashboard, the PR log and the feature section in the same pull request; nothing merges while any check is red.

### Read in this order

1. [`CLAUDE.md`](CLAUDE.md) — the owner's hard rules. 2. [`docs/START-HERE.md`](docs/START-HERE.md) — how a session
runs. 3. [`PROGRESS.md`](PROGRESS.md) and [`BLOCKED.md`](BLOCKED.md) — where things stand. 4. The register row of the
PR you build (with every dated "Updated …" scope) and its blueprint section. 5. For UI, the matching demo screen.
6. [`docs/agents/lessons/ALL.md`](docs/agents/lessons/ALL.md) — the owner's past corrections.

### Coding standards found in the repo

- **TypeScript strict** everywhere (`tsconfig.json` in each package). **ESLint:** `eslint-config-next` in
  `apps/web`, `@eslint/js` + `typescript-eslint` recommended in packages (unused variables are errors unless prefixed
  `_`). The schema is checked with `prisma validate` and `prisma format --check`. There is no Prettier config; keep
  the style of the file you edit.
- **Tests beside the code.** Packages keep tests in `packages/<name>/test/` (`*.test.ts` pure,
  `*.db.test.ts` on a throwaway PostgreSQL); the app keeps them next to the file (`apps/web/src/lib/*.test.ts`,
  `components/**/*.test.ts(x)`); tools have `tools/*.test.mjs`; infra has `infra/tests/run.sh`. vitest everywhere.
- **No visible text in code:** every word comes from a messages file (English + Bengali). **No number or limit in
  code:** it is a setting. **No key in code:** it is in the vault. The hardcode guard enforces it.
- **Nothing is deleted:** records are archived (`archivedAt`), links forward, removed features become switches,
  superseded text is struck through.
- **Clear names and a header comment.** Files start with a comment naming their PR and purpose; each package's
  `src/index.ts` explains the package.
- **Commits and PRs** ([`docs/CONVENTIONS.md`](docs/CONVENTIONS.md), CLAUDE.md "Commits"): title
  `PR <number>: <what it does>` (change notes `CN-###: …`), branch `pr-<number>-<slug>`, body from
  [`.github/pull_request_template.md`](.github/pull_request_template.md), merged after the gates pass. After each PR:
  the register Build status row, PROGRESS.md, BLOCKED.md if needed, and this README (dashboard, PR log row, the
  area's feature section).

### How to add a setting

1. Declare it in `packages/settings/src/registry*.ts` with `setting({ schema, default, scope, valueType, group,
   labelKey, helpKey, isOwnerData })` — owner data has **no default**.
2. Add its English and Bengali label and help in `packages/settings/messages/*.json`.
3. Read it through the resolver (`displaySettings` / the package's settings reader), never from the environment.
4. Deploy runs `settings sync`, which gives every installation the new key; nothing else to bump.
5. If it is the owner's own data, it also belongs in the owner-data register
   ([`packages/settings/src/owner-data.ts`](packages/settings/src/owner-data.ts)).

A new permission is one line in [`packages/auth/src/catalogue.ts`](packages/auth/src/catalogue.ts) plus its labels
in `packages/auth/messages/auth.*.json`; the deploy's `auth sync` grants it to the owner role.

### How to add a PR to the register (change process)

1. Is it scope on an existing PR? Then add a dated "**Updated <date>:** …" to that PR's row; the total does not move.
2. Otherwise it takes the **next free number** inside the stage it belongs to (numbers from 491 on are identities,
   not positions); update the totals at the top of the register in the same edit.
3. Write a change note **CN-###** (next free number) as a dated block in `docs/MASTER-REGISTER.md` (before "The stage
   table") and in `docs/BLUEPRINT.md` (under "A1. How this build runs"), and add it to the table above.
4. Only then build it. Full process: [`docs/owner/CHANGE-PROCESS.md`](docs/owner/CHANGE-PROCESS.md).

### Handover rules

- **Nothing hardcoded** (PR 491–496, guard PR 494): every name, number, price, text, key or limit is a setting.
- **The owner's own data never ships** (PR 509): store name, logo, contacts, bank details, customers, orders, every
  money setting and all media are listed in the owner-data register; the installation export leaves them out and
  refuses if one slips in. The repo holds sample data only.
- **No secrets in Git, ever:** keys live in the vault and are typed in by the owner on Keys & connections; server
  secrets are generated on the server.
- **Every integration runs on a mock until its key arrives** (A1.3).
- **Docs travel with the code** (CN-011): `docs/` goes to the server on every deploy and into every backup, so a
  restore brings back the documentation of that exact version. Filed as a rule; built with the deploy workflow,
  PR 594 and PR 8 / 395 / 507 (not running yet).
