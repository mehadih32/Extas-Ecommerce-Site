# EXTAS — E-commerce platform

> **বাংলায় সংক্ষেপে:** এটা EXTAS-এর নতুন অনলাইন দোকানের পুরো কোড আর কাগজপত্রের ঘর। নিচে এক নজরে দেখা যায়: কোন ধাপ
> কতটা শেষ (৫৯৮টা PR-এর মধ্যে ৭০টা), কী চালু হয়েছে, কী বাকি, আর আপনার কোন সিদ্ধান্ত লাগবে। প্রতিটা PR মার্জের পর এই
> পাতা আপডেট হয়। কোড পড়তে হবে না — শুধু বাংলা লাইনগুলো পড়লেই চলবে।

**EXTAS** is a Bangladeshi menswear brand (polos, T-shirts, shirts, denim, trousers, panjabi and more). This private
repository builds its new online shop: a phone-first storefront, a full admin backend, and the server it runs on.
The owner's **EXTAS ERP** stays the master for SKUs, stock and accounts; this shop reads from it and sends business
documents to it ([how](#how-it-is-built)).

| | |
|---|---|
| **Preview (the build)** | **new.extas.com.bd** — password-protected and `noindex`. Every merge to `main` deploys here by itself. The password is never written anywhere; the owner reads it on the server ([`docs/owner/PREVIEW-LOGIN.md`](docs/owner/PREVIEW-LOGIN.md)). Today the home address opens the Bengali progress page (`/status`); the admin is at `/admin`. |
| **The old shop** | **extas.com.bd** (WordPress) stays live and untouched until go-live day. Then the main domain is switched and every old address gets a 301 redirect (S19, PR 587) — only on the owner's explicit word. |
| **Specification** | [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md) (V2.1 final + change notes) · [`docs/MASTER-REGISTER.md`](docs/MASTER-REGISTER.md) (604 PRs, 28 stages) · UI truth: [`docs/demo/EXTAS-demo-V12.1.html`](docs/demo/EXTAS-demo-V12.1.html) |
| **Every session starts with** | [`CLAUDE.md`](CLAUDE.md) → [`docs/START-HERE.md`](docs/START-HERE.md) → [`PROGRESS.md`](PROGRESS.md) and [`BLOCKED.md`](BLOCKED.md) |

**Contents:** [Status](#status-dashboard) · [How it is built](#how-it-is-built) ·
[Local setup](#local-setup-and-useful-commands) · [The server](#the-server) · [Folder structure](#folder-structure) ·
[Features by area](#features-by-area) · [PR log](#pr-log) · [Change notes](#change-notes) · [Docs map](#docs-map) ·
[For a future developer](#for-a-future-developer)

---

## Status dashboard

> **বাংলায় সংক্ষেপে:** সার্ভার (S0A), ভিত্তি (S00), পণ্য-ছবি-ক্যাটালগ (S01) আর স্টক-ERP (S09) — এই চারটা ধাপ পুরো শেষ।
> এখন দোকানের সামনের অংশ (S02) শুরু হয়েছে। মোট ৫৯৮টা PR-এর মধ্যে ৭০টা মার্জ হয়েছে।

| Item | Now |
|---|---|
| Stages | **S0A 12/12 · S00 19/19 · S01 22/22 · S09 17/17** (wave 1 done) · S02 0/58 (wave 2 started) · total **70/598** active PRs |
| Live on the preview | Bengali progress page (`/status`), admin sign-in, Keys & connections, products (list, new, edit, publish queue, import from a link, audit, back-in-stock), size charts, stock and ERP pages (practice ERP until the owner adds the ERP keys) |
| Last deploy | 20 Oct 2026, 12:43 (Dhaka) · commit `f3822d0` (CN-009, documents) · **success**. Last code deploy: 11:42, PR 197–207 (#17) |
| Waiting on the owner | 7 items open in [`BLOCKED.md`](BLOCKED.md); none stops the build ([table below](#what-waits-on-the-owner)) |
| Next | S02 storefront (home, category, product page) with the four-layer cache, S03 combos, S10 Smart Rules |
| Last update | 20 Oct 2026 |

The truth for these numbers is the **Progress** line and the **Build status** table of
[`docs/MASTER-REGISTER.md`](docs/MASTER-REGISTER.md#build-status). Keep the "Stages" row above identical to it.

### All 28 stages

States: **Done** = every PR merged · **In progress** = work started · **Not started** · **Parked** = waits for the
owner's word (handover pack). Waves are the build order from Blueprint
[E3](docs/BLUEPRINT.md#e3-order-of-work); 2–3 agents build at once.

| Stage | Name | Wave | PR numbers | Done / total | State |
|---|---|:-:|---|:-:|---|
| S0A | Server foundation | 0 | 1–10, 601, 604 | 12 / 12 | **Done** (all live on the server) |
| S00 | Foundation — repo, CI, schema, auth, settings framework | 1 | 11–18, 491–496, 500, 508–510, 603 | 19 / 19 | **Done** |
| S01 | Catalog, media & images | 1 | 19–39, 590 | 22 / 22 | **Done** |
| S02 | Storefront | 2 | 40–88, 501, 503, 595–600, 602 | 0 / 58 | In progress |
| S03 | Combo & bundles | 2 | 89–104, 571–576 | 0 / 22 | Not started |
| S04 | Cart, checkout, accounts | 3 | 105–137, 558, 560, 561, 563, 565, 566 | 0 / 39 | Not started |
| S05 | Order management | 3 | 138–155, 541, 546 | 0 / 20 | Not started |
| S06 | Fraud & location | 4 | 156–164, 502, 519–524, 540, 542–545, 549–557, 559, 562, 567 | 0 / 33 | Not started |
| S07 | Payments & wallet | 3 | 165–174 | 0 / 10 | Not started |
| S08 | Courier, returns, exchange | 3 | 175–193, 525–526, 564 | 0 / 22 | Not started |
| S09 | Inventory & ERP sync | 1 | 194–207, 497–499 | 17 / 17 | **Done** |
| S10 | Smart Rules | 2 | 208–219 | 0 / 12 | Not started |
| S11 | SEO engine | 5 | 220–238, 527, 586, 588 | 0 / 22 | Not started |
| S12 | Content & blog | 5 | 239–253, 528–530, 547, 591–593 | 0 / 22 | Not started |
| S13 | Marketing & ads | 5 | 254–283, 531–532, 548, 569, 589 | 0 / 35 | Not started |
| S14 | CRM & customers | 4 | 284–303, 505, 533–535 | 0 / 24 | Not started |
| S15 | AI 360 Control Room | 6 | 304–341, 506, 577–585 | 0 / 48 | Not started |
| S16 | Finance, costs & reports | 6 | 342–355, 504, 536–537, 568 | 0 / 18 | Not started |
| S17 | Multi-store | 8 | 356–377, 511–512 | 0 / 24 | Not started |
| S18 | Compliance, security, manual | 8 | 378–390 | 0 / 13 | Not started |
| S19 | Deploy, backup, go-live | 8 | 391–403, 507, 587 | 0 / 15 | Not started |
| S20 | Fulfilment & documents | 4 | 404–412 | 0 / 9 | Not started |
| S21 | Site Health & Audit | 6 | 413–424, 570, 594 | 0 / 14 | Not started |
| S22 | Support (all-in-one) | 4 | 425–436, 538 | 0 / 13 | Not started |
| S23 | Social & content studio | 5 | 437–443 | 0 / 7 | Not started |
| S24 | Virtual Photoshoot Studio | 7 | 444–480, 539 | 0 / 38 | Not started |
| S25 | Video & Campaign Creative Studio | 7 | 481–490 | 0 / 10 | Not started |
| S26 | Installation, documentation & distribution | — | 513–518 | — / 6 | **Parked** (handover pack) |
| S27 | No-ERP stock module | — | not numbered yet | — | **Parked** (handover pack) |
| | **Total** | | **604 PRs** | **70 / 598 active** | 6 parked |

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
  `media`, `catalogue`, `inventory`, `seed` ([folder list](#folder-structure)). Long jobs are written as job functions
  ready for the BullMQ worker; until the worker runs they run inline right after the answer.
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
| [`server-setup.yml`](.github/workflows/server-setup.yml) | `extas-vm` | by hand, or when `infra/server`, `infra/stack` or `infra/config` change | runs [`infra/server/setup.sh`](infra/server/setup.sh) (idempotent), commits the machine report to [`docs/reports/server/`](docs/reports/server/latest.md); inputs: only some steps, data-disk override, k6 re-measure, rotate the preview password |

Migrations only add (expand first, contract later), so the old colour keeps working while the new one starts and a
rollback needs no down-migration.

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
  vault; local backups run regardless. *Known gap:* photos on the local media volume are not yet in the daily
  backup (noted in PROGRESS for S19).
- **`extas-restore`** (PR 8) — `test` restores the newest base backup + WAL into a throwaway PostgreSQL on the NVMe
  and checks it (run after every setup; monthly by timer later, PR 395/507). `--from local|blob|drive
  [--at "YYYY-MM-DD HH:MM"] [--target staging|production]` — production needs the typed word RESTORE and keeps the old
  data. Last test: 336 tables restored, matching live.
- **`extas-monitor`** (PR 9) — every minute: disks (alert at 80%), services, NVMe, backups, speed → writes
  `state/health.json` (read by the status page now, by the admin Server page later). Sends to Telegram once the bot
  key is in Keys & connections; until then to the log.
- **`extas-profile`** (PR 604), **`extas-nvme-prepare`** (PR 601), **`extas-find-data-disk`** (finds the 1 TB disk
  safely), **`extas-preview-login`** (the owner reads the preview password; CN-007).

**The admin Server page** (plain-language CPU, RAM, disks, services, cache hit, slow queries, last backups, speed)
is **planned** — S21, PR 423 (with 601, 602, 603, 604); the demo shows it at `#/admin/server`. Until then the state
is on `/status` and in the committed server reports.

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
│   ├── inventory/            ERP mode and guard, sync, stock pull, holds, pushes, counts, reports
│   └── seed/                 default pack, sample catalogue, owner-data check, installation export / import
├── infra/
│   ├── bootstrap/            install-runner.sh (one-time runner install by the owner)
│   ├── config/server.conf    the one server config file (no secrets)
│   ├── server/               setup.sh, lib.sh, steps/01–12, bin/ (server tools), files/ (systemd units)
│   ├── stack/                compose.yml (database, cache, search, Caddy), app.yml (blue/green app), Caddyfile, PgBouncer image
│   ├── deploy/deploy.sh      zero-downtime deploy with automatic rollback
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
tested restore (8), monitoring every minute (9), k6 baseline (10). Deploys (PR 4) now commit their result back to
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
amounts, business numbers, visible JSX text. An opt-out needs a written reason.

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
(e-mail masked, first password made on the VM, read with `/usr/local/sbin/extas-owner-login`; a second run refuses).

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
| `/admin/login` | sign in, the 2FA step and the first-password step; English / বাংলা switch |
| admin frame | sidebar grouped Catalogue / Inventory / System from [`apps/web/src/lib/admin-nav.ts`](apps/web/src/lib/admin-nav.ts) (only pages that exist); `/admin` opens the first page |
| `/admin/integrations` — **Keys & connections** | every declared connection with its state; save a key → it goes into the vault → it is tested → the connection leaves mock only on a pass; remove = revoke, nothing deleted; every step audited; a saved key is never shown again. The connection list is data ([`packages/adapters/src/catalogue.ts`](packages/adapters/src/catalogue.ts)); "Our ERP" and the page reader are on it |

API: `GET /api/admin/integrations`, `POST /api/admin/integrations/[id]` (save / test / remove). Screenshots:
[`docs/qa/screenshots/pr-500/`](docs/qa/screenshots/pr-500).

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
[`docs/qa/screenshots/pr-21/`](docs/qa/screenshots/pr-21).

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
- **Warehouses and locations (PR 201).** Warehouse, showroom, in transit, damaged; every warehouse keeps a damaged
  bin; damaged stock is never sellable; nothing deleted.
- **Cart holds (PR 197, 198).** One shared stock pool across stores, so two stores never sell the last piece twice;
  row locks in id order, retried; holds expire and are swept; never pushed to the ERP. Callers arrive with S04.
- **Order push (PR 199, 200).** A business document through a transactional outbox, never journal lines; relay with
  backoff, a dead state after the set tries, "send again" by hand; a deterministic idempotency key, so a retry never
  moves stock twice.
- **Low stock (PR 202).** Per variant on the shared sellable number; threshold 2 by default with per-SKU overrides;
  raises once, clears on restock. Messages wait for the notification stage (BLOCKED 16).
- **Stock count (PR 203).** By barcode or SKU, one open count per location, a reason for each difference; a report
  only — the ERP's stock is never changed (BLOCKED 14).
- **Publish by real stock (PR 204).** Check `sellableStock`, off by default (BLOCKED 15); "find new styles in the ERP".
- **Sync health, re-sync, movement report (PR 205, 206, 207).**

| Screen | What it does |
|---|---|
| `/admin/stock` | sync health verdict (ok · practice · late · failing · down · off), last pull and its age, ERP connection and mode, documents waiting / failed / dead with "send again", pieces held in checkout, low stock, publish queue with real stock, recent runs; "sync all stock now" and one product. Opens even when the ERP is down |
| `/admin/stock/counts` · `/admin/stock/counts/[id]` | start a count of a location; scan + quantity (Enter keeps the field ready for a scanner), compare with the ERP, reasons, finish or cancel |
| `/admin/stock/movements` | per SKU and location: opening, in, out, closing, a mark where the ledger does not add up; reconcile with the ERP |

| API (all under `/api/admin/inventory/`) | Purpose |
|---|---|
| `erp` (GET/PUT), `erp/verify`, `erp/warehouses`, `erp/styles` | mode and mapping; which company a key belongs to; ERP warehouses; ERP styles not in the shop |
| `stock`, `low-stock`, `health`, `publish-queue` | stock per SKU or grid; alerts; health panel; queue with real stock |
| `warehouses(/[id])`, `warehouses/[id]/locations`, `locations/[id]` | warehouses and locations |
| `pushes`, `pushes/retry` | documents sent to the ERP; send again |
| `resync`, `reconcile`, `movements` | re-sync now; check against the ERP (changes nothing); movement report |
| `audits(/[id])`, `audit-lines/[id]` | stock counts |

Permissions: `inventory.read/locations/erp/sync/audit`. Settings: `erp.*`, `inventory.*` (registry v11). Tests in
`packages/inventory/test` and `packages/adapters/test` (pure + PostgreSQL, including two carts racing for the last
piece). Screenshots: [`docs/qa/screenshots/pr-205/`](docs/qa/screenshots/pr-205). No schema change in S09.

### S02 · Storefront — In progress (0/58)

> **বাংলায়:** দোকানের সামনের অংশ — হোম, ক্যাটাগরি, পণ্যের পাতা, পেজ বিল্ডার, দ্রুত লোড হওয়ার ক্যাশ। কাজ শুরু হয়েছে, এখনো কিছু মার্জ হয়নি।

Planned — see register PRs 40–88, 501, 503, 595–600, 602: [S02](docs/MASTER-REGISTER.md#s02--storefront--pr-4088).

### S03 · Combo & bundles — Not started

Planned — see register PRs 89–104, 571–576: [S03](docs/MASTER-REGISTER.md#s03--combo--bundles--pr-89104).

### S10 · Smart Rules — Not started

Planned — see register PRs 208–219: [S10](docs/MASTER-REGISTER.md#s10--smart-rules--pr-208219).

### S04 · Cart, checkout, accounts — Not started

Planned — see register PRs 105–137, 558, 560, 561, 563, 565, 566: [S04](docs/MASTER-REGISTER.md#s04--cart-checkout-accounts--pr-105137).

### S05 · Order management — Not started

Planned — see register PRs 138–155, 541, 546: [S05](docs/MASTER-REGISTER.md#s05--order-management--pr-138155).

### S07 · Payments & wallet — Not started

Planned — see register PRs 165–174: [S07](docs/MASTER-REGISTER.md#s07--payments--wallet--pr-165174).

### S08 · Courier, returns, exchange — Not started

Planned — see register PRs 175–193, 525–526, 564: [S08](docs/MASTER-REGISTER.md#s08--courier-returns-exchange--pr-175193).

### S06 · Fraud & location — Not started

Planned — see register PRs 156–164, 502, 519–524, 540, 542–545, 549–557, 559, 562, 567: [S06](docs/MASTER-REGISTER.md#s06--fraud--location--pr-156164).

### S14 · CRM & customers — Not started

Planned — see register PRs 284–303, 505, 533–535: [S14](docs/MASTER-REGISTER.md#s14--crm--customers--pr-284303).

### S20 · Fulfilment & documents — Not started

Planned — see register PRs 404–412: [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604).

### S22 · Support (all-in-one) — Not started

Planned — see register PRs 425–436, 538: [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604).

### S11 · SEO engine — Not started

Planned — see register PRs 220–238, 527, 586, 588: [S11](docs/MASTER-REGISTER.md#s11--seo-engine--pr-220238).

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

### S21 · Site Health & Audit — Not started

Planned — see register PRs 413–424, 570, 594 (594 = the PR register and "Blueprint & files" inside the admin;
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
| #18 | PR 509, 17, 15, 4 + CN-010 | 20 Oct | Owner values go into the live store from the server (`store-settings.yml`), the owner-account workflow and Bengali password steps, deploy result committed back, CI checks one register PR per commit and README against the register; BLOCKED answers struck through |
| direct | CN-011: README as the A-to-Z front page; docs on the server and in backups | 20 Oct | This page rewritten as the full front page, `docs/README.md` index, CN-011 in blueprint and register, CLAUDE.md rules |
| direct `f3822d0` | CN-009: owner answers (Note 52) | 12:22 | Watermark text, photos never deleted, honest "was" price, defaults; owner data is never a blocker |
| direct `303b342` | CN-008: demo V12.1 | 12:13 | Demo V12.1 (owner desktop review, 44 items), QA and admin audit reports, owner notes, agent skills; README as live status page |
| #17 `1c8a4d6` | PR 197–200, 202–207 | 11:17 | S09 complete: cart holds, ERP order documents, low stock, stock counts, sync health page, re-sync, movement report |
| #16 `a8face8` | PR 33, 36, 39 (+ 27/32 and 22 follow-ups) | 10:08 | Import from a link, ghost archive and back-in-stock, product audit; links archived never deleted; storage-mock photo fix |
| #15 `4563976` | PR 497, 498, 499, 194, 195, 196, 201 | 09:15 | ERP adapter and practice ERP, ERP mode and guard, sync layer, stock pull, company/warehouse mapping, locations |
| #14 `26d2b1f` | PR 21, 26–29, 32, 34, 35, 38 | 08:22 | Product admin screens, publish checklist and health score, publish queue, size charts, collections and tags, CSV, "was" price |
| #13 `54b7d95` | PR 500 (fix) | 07:24 | Self-hosted fonts, so the image build never downloads fonts |
| #12 `28ea164` | PR 19, 20, 22–25, 30, 31, 37, 590 | 06:54 | Catalogue domain and API, image pipeline, watermark, responsive images, photo minimum, media library, naming and links |
| #11 `4407ddf` | PR 500 | 06:10 | Admin sign-in and frame, Keys & connections page; S0A and S00 reports |
| #10 `b5fe56d` | PR 509, 508, 14 | 05:20 | Owner-data register and check, general default pack, sample catalogue |
| #9 `fa6b77e` | PR 15, 16, 495 | 05:09 | Staff and customer sign-in, permission checks on every admin action, role builder, audit log |
| server report `5c0656e` | server report 04:34 | 04:34 | Machine report after PR 18's setup run |
| #8 `1861652` | PR 18 | 04:34 | Adapter framework (mock / sandbox / live) and the storage adapter |
| server report `72f88b1` | server report 04:21 | 04:21 | Machine report |
| #7 `aaa5f76` | PR 491, 492, 496, 510 | 04:20 | Settings framework, resolver, settings migration on deploy, reset to default |
| #6 `5667515` | PR 493 (+ PR 17 fix) | 04:12 | Credential vault; Lighthouse gate on real throttled paint |
| #5 `9959d1b` | PR 494 | 03:44 | Hardcode guard as the first CI step |
| #4 `3122834` | PR 13, 603 | 03:39 | Full Prisma schema with `storeId`, index pack, CI `db` job |
| server report `50daeb7` | server report 03:00 | 03:00 | Machine report |
| #3 `d2ed429` | PR 11, 12, 17 | 02:59 | App skeleton, CI gates, zero-downtime deploy, Bengali status page; first deploy live at 03:03 |
| server report `5bddc39` | server report 02:47 | 02:47 | Machine report |
| #2 `3a8d198` | PR 7 (CN-007) | 02:46 | Preview password stays on the server, rotatable |
| server report `d5f2220` | server report 02:40 | 02:40 | First machine report |
| #1 `c96b258` | PR 1–10, 601, 604 | 02:38 | S0A: server setup as code, workflows on the runner |
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

---

## Docs map

> **বাংলায় সংক্ষেপে:** কোন কাগজ কোথায় আছে। পুরো তালিকা [`docs/README.md`](docs/README.md)-এ।

| What | Where |
|---|---|
| Full specification (V2.1 final + change notes) | [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md) — older versions in [`docs/history/`](docs/history) |
| All 604 PRs, build status, stage table | [`docs/MASTER-REGISTER.md`](docs/MASTER-REGISTER.md) |
| UI truth: the clickable demo | [`docs/demo/EXTAS-demo-V12.1.html`](docs/demo/EXTAS-demo-V12.1.html) (download, open in a browser) · source in [`docs/demo/src/`](docs/demo/src) · V12 kept beside it |
| Every owner note | [`docs/owner/ROUND15.md`](docs/owner/ROUND15.md) (and `ROUND14.md`) |
| Owner reviews, research and plans | [`docs/owner/`](docs/owner) — desktop and phone reviews, combo research and ranking, Google traffic plan, blog plan, server spec, change process |
| QA checklist and reports | [`docs/qa/ECOMMERCE-CHECKLIST.md`](docs/qa/ECOMMERCE-CHECKLIST.md) · reports and tools in [`docs/qa/`](docs/qa) · gates in Blueprint [Appendix C](docs/BLUEPRINT.md#appendix-c--qa-gate-definition-and-test-inventory) |
| Agents, skills, lessons | [`docs/agents/`](docs/agents) — seven agent profiles, protocol, curriculum, skills, [`lessons/ALL.md`](docs/agents/lessons/ALL.md) |
| ERP API contract | [`docs/ERP-API-CONTRACT.md`](docs/ERP-API-CONTRACT.md) |
| How sessions run, coding mechanics | [`docs/START-HERE.md`](docs/START-HERE.md) · [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) |
| Server in plain Bengali | [`docs/SERVER.md`](docs/SERVER.md) · latest machine report [`docs/reports/server/latest.md`](docs/reports/server/latest.md) |
| Stage reports in Bengali | [`docs/reports/`](docs/reports) |
| Owner guides | [`RUNNER-SETUP.md`](docs/owner/RUNNER-SETUP.md) (runner, once) · [`PREVIEW-LOGIN.md`](docs/owner/PREVIEW-LOGIN.md) (preview password) · [`AZURE-VM-GUIDE.pdf`](docs/owner/AZURE-VM-GUIDE.pdf) (the VM) · [`OWNER-PRECODE-CHECKLIST.md`](docs/owner/OWNER-PRECODE-CHECKLIST.md) |

---

## For a future developer

> **বাংলায় সংক্ষেপে:** ৫ বছর পরে নতুন কেউ এলে যেন সব বোঝে — কোড লেখার নিয়ম, নতুন সেটিং যোগ করার নিয়ম, নতুন কাজ রেজিস্টারে
> তোলার নিয়ম, আর হস্তান্তরের নিয়ম।

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
