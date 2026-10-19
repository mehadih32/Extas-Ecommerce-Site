# EXTAS — E-commerce Platform Build Specification

**Version 1.0 · 18 October 2026**

This is the single living document for the EXTAS e-commerce platform. The version number moves forward
inside this file; there is never a second file. V1 is everything decided up to today.


## Contents

- Status of each part
- How to use this document
- What this platform is
- Change log

**Part A · Platform, server and architecture**

- A1. How this build runs
- A2. Server foundation (S0A) — runs first, before any application code
- A3. Architecture — the ERP is the master
- A4. Multi-store — three stores, one server, one codebase
- A5. Model and cost policy
- A6. Repository and document discipline

**Part E · Stages, the PR plan and the numbers**

- E1. How the count was arrived at
- E2. The stages
- E3. Order of work
- E4. What one PR must contain

**Part B · Orders, money, support and operations**

- B1. Orders and fulfilment
- B2. Documents
- B3. Payments and money
- B4. Support module — S22 · Support (all-in-one)
- B5. Customers and CRM
- B6. Data, security and compliance
- B7. Admin and back-office quality
- B8. Competitor Teardown agent

**Part C · AI, marketing and imagery**

- C1 · AI 360 Control Room (S15)
- C2 · AI Cost Book and the cost calculator
- C3 · The agents and their jobs
- C4 · Organic growth — SEO, AI answers, YouTube, blog
- C5 · S23 · Social & content studio
- C6 · Marketing
- C7 · S24 · Virtual Photoshoot Studio
- C8 · S25 · Video & Campaign Creative Studio
- C9 · Build capacity and timeline — the reality check

**Part D · UI/UX — IN REVIEW**

- D0. Status of this part — IN REVIEW, NOT FINAL
- D1. Standing design rules
- D2. The compulsory first-screen rule — Locked (§57.5, §58.4, §58.12)
- D3. Page by page
- D4. Configurability — the eye-toggle system
- D5. Analytics — Locked (§50, corrected; confirmed locked in §52.1)
- D6. Still open / still in review
- D7. Where two rounds disagreed — the later one wins

**Part F · Decisions still open**

- F1. Settings still to be decided
- F3. Decisions from the UI/UX rounds still waiting
- F2. Questions raised while writing this specification

---

## Status of each part

| Part | What it covers | Status |
|---|---|---|
| **A** | How the build runs · server foundation · architecture · multi-store · model policy | **Locked — build may start** |
| **E** | Stages, the PR plan and the numbers | **Locked, with one warning** — see E2 |
| **B** | Orders, documents, money, support, customers, security, admin | **Locked — build may start** |
| **C** | AI 360, costs, agents, organic growth, social, photoshoot studio, video | **Locked — build may start** |
| **D** | UI/UX | **In review — not final.** Last round: 12, 18 October. The desktop review has not started. |
| **F** | Every decision still open, with a recommended default for each | Reference |

**What "in review" means for Part D.** Everything in it marked **Locked** may be built now — those are
settled and will not move. Everything in D6 is still being audited and a builder waits. When the UI/UX
review finishes, **only Part D's status line and its contents change**, and this file becomes V1.1,
V1.2 and so on. The rest of the document does not move.

---

## How to use this document

**If you are the build agent:**

1. Read Part A first. It contains the rules you operate under, and they override your defaults.
2. Build S0A — the server — before you write a single line of application code.
3. Work the stages in the wave order in E3.
4. When you reach something undecided, look in Part F. Use the recommended default, build it as a
   setting the owner can change, write one line in `BLOCKED.md`, and keep going. **Never stop and wait.**
5. Every PR meets the six conditions in E4, without exception.
6. If this document and your own judgement disagree, this document wins. If this document is silent,
   write the question into `BLOCKED.md` rather than inventing an answer.

**If you are the owner:** Part F is your list. Nothing there stops the build — each one has a sensible
default already chosen — but the eight marked "Owner must supply" are things only you can provide, and
two of them (ERP repository access, and which domain is connected first) block real work.

---

## What this platform is

A premium menswear shop for Bangladesh, built on the owner's own Azure server, with his existing ERP as
the master for stock and accounting. Three stores will eventually run from one codebase on that one
server, sharing stock but sharing nothing else.

Five requirements stand above every detail in this document. Where anything below conflicts with one of
these, these win:

1. **AI agents run the shop's routine work**, and they are trained continuously rather than configured
   once.
2. **Super SEO** — found on Google, on Bing, on YouTube, and by AI assistants.
3. **A fast site on a server kept optimised**, always.
4. **A top-class, premium, classy look** that is genuinely easy for everyone — a 30-year-old in Dhaka, a
   60-year-old, and a buyer in a village.
5. **Combos are central, and selling is the point.** A change that makes the shop prettier but sells
   less is the wrong change.

**95% of customers are on a phone.** Every design decision is judged at **440 × 956 CSS px** first, and
on a desktop second.

---

## Change log

| Version | Date | What changed |
|---|---|---|
| 1.0 | 2026-10-18 | First complete specification. Per-stage PR counts re-derived from the 341-PR baseline and reconciled exactly to 473 (see E2). Assembled from 58 recorded decision sections covering 12 UI/UX review rounds, the server assessment, the ERP-master architecture, the support module, the photoshoot studio and the multi-store plan. Parts A, B, C, E locked. Part D in review. |

---

---

# Part A · Platform, server and architecture

## A1. How this build runs

These are operating rules for the build agent. They are the owner's standing instruction, settled and
not to be re-opened. An agent that asks the owner to review code is breaking the rules, not being careful.

### A1.1 The rules — Locked

1. **The owner is not a coder. He does not review, check or merge pull requests.** His approval on a code
   change means nothing and must not be asked for.
2. **One single permission collection at the very start.** Before any code is written, the build agent asks
   once for everything it will ever need, in one sitting, as one list: GitHub repository and token, domain,
   Cloudflare, SSL, Azure VPS access, database, object storage, Google Drive, Telegram bot, and the API keys
   that already exist. After that sitting it never asks again.
3. **The agent creates the PR, tests it, and merges it itself.** It does not wait for a human. All permissions
   are granted up front precisely so that it does not have to.
4. **It never stops for approval mid-wave.** It works through the stages in order, from zero to the end.
5. **When a usage limit is reached it stops, and when the limit resets it picks up exactly where it left off.**
   No restart, no lost context, no human needed. `PROGRESS.md` records the exact stopping point every time.
6. **The owner's computer may be off.** Nothing in the build depends on his machine being awake.
7. **The only stop is a wave boundary.** At the end of Wave 1 the agent reports: "Wave 1 is complete. Shall I
   start Wave 2?" — yes or no. If the answer does not come, it waits; when he says yes later, it continues
   from there. It never skips a PR and never silently jumps between waves.
8. **Quality is the agent's own responsibility.** Tests, Lighthouse budgets, type checks and the staging checks
   must pass before a merge. If something cannot be resolved it is written into `BLOCKED.md` and the agent
   moves to the next PR. It does not sit waiting.
9. **The owner's routine:** he wakes up, looks at what was built, and says yes or no to anything that genuinely
   needs him. The build never waits on that.

### A1.2 What the owner hands over for the server, and nothing more — Locked

For server matters the owner supplies **the IP, the sudo username, and the SSH key or password**. That is the
whole list, once, forever. The build agent does everything else from there and must not come back to him for
server work.

(The two places this is written in the source are consistent in substance: §38.1 names "three things only —
the IP, and the SSH key or password"; §40.3 item 5 spells the three out as IP, sudo username, and SSH key or
password. Treat the §40.3 wording as the operative list.)

### A1.3 Nothing is ever blocked waiting for a credential

Every integration is built with a **mock** that works from day one, behind the adapter framework (PR-007,
mock / sandbox / live, test-connection) and its full implementation (PR-198). The shop goes live on mocks and
sandboxes, and each service switches to live the day its token arrives. An earlier claim that bKash or SMS
approval would delay go-live was wrong and is withdrawn.

The **Activation Center** makes this visible. It is a **temporary section** in the dashboard, fully built front
end and back end. It lists every pending item with what it is, why it is on hold, exactly what to paste or
upload, and a Test button. The items are: bKash, Nagad, SSLCommerz, SMS gateway and masking sender ID,
WhatsApp Business API, Messenger / Facebook page, email and SMTP, Steadfast, Pathao, Barikoi, Google Maps,
Meta / Google / TikTok ad accounts, Search Console, Bing, Google Drive, Telegram, the AI providers (Anthropic,
OpenAI, Google, image and video providers), ERP sync endpoints, DBID and trade licence.

- When an item is completed and tested, **it disappears from the list by itself.**
- When the last item is cleared, **the Activation Center removes itself from the dashboard.**
- Until then the feature behind each item runs on mock or sandbox, and its UI is already finished and waiting.

### A1.4 Parallel agents — the owner does nothing

The owner does not manage agents. Part 0 of the blueprint carries the parallel plan, and the lead session spawns
and coordinates the others on separate git worktrees.

- **Days 1–2: one agent alone.** S00 Foundation plus the **complete Prisma schema skeleton for every stage**,
  so that no agent ever fights another over a migration. This is the single most important rule for parallel work.
- **From day 3: three agents**, each owning whole stages end to end, grouped so they do not touch the same files.

| Agent | Scope | Stages owned |
|---|---|---|
| **A** | Commerce spine | S01, S04, S05, S07, S08, S09, S14, S20 |
| **B** | Storefront and content | S02, S03, S06, S10, S11, S12, S17, S18 |
| **C** | Intelligence and studio | S15, S13, S22, S23, S24, S25, S16, S21, S19 |

Rules that keep them from colliding:

- One agent owns a stage completely.
- **Shared files — the Prisma schema, the design tokens, the routing table — are changed only by Agent A.**
  The others request a change through Agent A.
- Each agent runs the full test suite before merging.
- A defined merge order.
- A nightly integration run across all three branches.

Load is roughly 110–140 PRs each; the final blueprint balances the split.

### A1.5 Continuous deploy — live the moment it is merged

- **During the build, while there are no real customers: every merge deploys straight to production.** The site
  is live from day one and grows hour by hour. Nothing waits.
- **Once real orders start: the same automatic deploy, but gated.** Tests, a smoke run of the customer journey,
  and the Lighthouse budget must all pass. If any fail, the deploy is refused. If something degrades after a
  deploy, it rolls back by itself. Still no human in the loop, but a broken build never reaches a paying customer.
- `PROGRESS.md` and the daily Telegram report say what went live that day.
- This pipeline **replaces** the manual production promotion that was in PR-205.

### A1.6 The one-month plan and the timeline

Scale: roughly **409 PRs across 27 stages**. The timing model assumes ~400 PRs × ~22 turns = 8,800 turns, plus
35% for retries, test failures, rebuilds and deploys ≈ **11,900 turns**.

| Setup | Throughput | Whole system live |
|---|---|---|
| **Max 5x**, one session, 24/7 | ~380 turns/day (~2,700/week) | **4–7 weeks, typically ~5** |
| **Max 20x**, one session, 24/7 | ~600–720 turns/day — session-bound, not limit-bound | **2.5–4 weeks, typically ~3** |
| **Max 20x**, 2–3 parallel agents on separate worktrees | ~1,200–1,500 turns/day | **1.5–2.5 weeks, typically ~2** |

A single agent can only produce roughly 25–40 turns an hour, so one session cannot spend a 20x allowance.
**20x only pays for itself when 2–3 agents run in parallel on different stages** — which is why the parallel
plan in A1.4 exists.

**First site live (Wave 1, ~80 PRs ≈ 2,400 turns with overhead):** Max 5x ~6 days · Max 20x single session
~4 days · Max 20x parallel ~2 days. The owner's "live within 7 days" is achievable on either plan.

**On Max 20x with three agents:** 11,900 ÷ ~1,500 a day ≈ 8 days of pure throughput; with integration, deploys
and blocked items, **2–3 weeks**. **One month on Max 20x is comfortable, with about a week of buffer.** Wave 1 —
a working shop — lands in the **first 2–4 days**.

**Recommendation on record: Max 20x.** It finishes in about 3 weeks instead of about 5, or about 2 weeks with
parallel agents, for $100 more a month over a one-to-two month build. Drop back to 5x once the build is done.

**Honest caveat, to be carried into the blueprint:** these are calculated estimates, not guarantees. Prompts per
window vary with codebase size, Anthropic may apply additional caps, and external approvals — bKash, Nagad, the
SMS masking sender ID, courier APIs, DBID — run on their own timetable regardless of build speed.

### Open — needs the owner's decision

- **Plan tier:** do you want to run the build on **Max 20x** (about 2–3 weeks with three parallel agents) or stay
  on **Max 5x** (about 5 weeks)? One word is enough.

---

## A2. Server foundation (S0A) — runs first, before any application code

**Locked.** The server is set up and fully optimised **before** the e-commerce build starts. The order in the
blueprint and in execution is: **Part 0 rules → S0A Server Foundation → S00 Foundation → the rest of the waves.**
The build agent does not write a line of application code until S0A's checks pass.

The server is not a side topic. The build agent has to build, deploy, tune, secure, back up and monitor the box,
so all of that lives in the one blueprint file. An earlier note that moved server work out to a separate
discussion (§36.7) was a misreading and is **withdrawn**. What genuinely belongs in a separate conversation is
only the owner's own hands-on questions — which button in the Azure portal, how to SSH, day-to-day admin — and
with the one-time permission handover in A1.2 there is very little of that left for him to do by hand.

### A2.1 The machine the owner already has

| Item | Value |
|---|---|
| Size | Standard **E8ds v4** |
| CPU / RAM | **8 vCPU / 64 GB** |
| OS disk | **Premium SSD LRS, 2048 GiB** (7,500 IOPS, 250 MB/s) |
| Data disks | **None** |
| OS | **Ubuntu 20.04** |
| Region | **West India** |
| Billing | Pay-As-You-Go |

### A2.2 Assessment of that machine

What has to run on one box: the Next.js app, the BullMQ worker, PostgreSQL, Redis, Meilisearch, Caddy, and local
image processing with sharp. Image and video generation are hosted APIs, so **no GPU is needed**. A comfortable
requirement is 4–8 vCPU, 16–32 GB RAM, ~256–512 GB of fast disk, with media on object storage behind a CDN.

**Verdict: the CPU and memory are more than enough — roughly double what is needed, which is good headroom for
sale-day spikes and parallel image jobs. Nothing needs upgrading for performance.**

Four real problems were identified, and each has an answer that does not change the Azure package:

| # | Problem | How it is handled |
|---|---|---|
| 1 | **Ubuntu 20.04 is past its standard support window** | In-place release upgrade 20.04 → 22.04 → 24.04, done by the build agent (A2.4). Fallback: Ubuntu Pro ESM on 20.04. |
| 2 | **Everything on one 2 TB OS disk, no data disk** — database, Docker, uploads and OS share one volume, so one of them filling up takes the whole machine down | **LVM volumes** carve the 2 TB so `/var/lib/postgresql`, `/var/lib/docker`, `/srv/uploads` and `/var/log` cannot starve each other (S0A PR 3). |
| 3 | **2 TB Premium SSD is genuinely wasteful** — roughly $240 a month for space the plan does not use, because media lives in object storage behind Cloudflare. 256–512 GB would do the same job, but **Azure cannot shrink a managed disk** | **Accepted as a cost.** The owner has decided the package does not change, so the disk stays. |
| 4 | **Single VM, no redundancy** | Acceptable to start. It makes the backup and the tested one-command restore the thing that actually protects the business — which is why both are inside S0A, not left to later. |

### A2.3 The Azure package must not be changed — Locked

**E8ds v4, 8 vCPU, 64 GB, the existing 2048 GiB Premium SSD — all kept exactly as they are. No resize, no new VM,
no new disk, no change of region.**

The earlier "recommended production build" (a fresh Ubuntu 24.04 VM on v5 silicon, 128 GB OS disk plus a separate
256–512 GB data disk, possibly downsizing to 4 vCPU / 32 GB) is **superseded by this decision and is not to be
built.** It is recorded here only so nobody re-proposes it. The useful parts of it that do not touch the package —
Accelerated Networking on, swap, a locked-down NSG, LVM separation — are all carried into S0A below.

### A2.4 The OS question, solved without changing the package — Locked

Ubuntu 20.04 is past standard support, but a new VM is not wanted. The machine is empty, so the answer is an
**in-place release upgrade, 20.04 → 22.04 → 24.04**, performed by the build agent. The Azure package is untouched;
only the operating system inside it moves forward.

Safety rules for that upgrade:

- A **one-time Azure disk snapshot before the upgrade** — small, temporary, deletable straight afterwards. This is
  **the only Azure storage this plan asks for**, and whether to keep or delete it afterwards is the owner's call.
- Connectivity is verified after **every** step.
- If the upgrade cannot be completed, the fallback is **Ubuntu Pro ESM on 20.04** (free for up to 5 machines), so
  the box is patched either way.
- Nothing is lost on either branch, because nothing is deployed yet.

### A2.5 S0A — the ten PRs

1. **Access and lock-down** — connect over SSH, create a non-root deploy user, keys only, password login off, root
   login off, ufw, fail2ban, unattended security upgrades, timezone Asia/Dhaka, hostname.
2. **OS upgrade** — snapshot, 20.04 → 22.04 → 24.04 in place, kernel update, reboot handling, verification at each
   step, documented fallback to Ubuntu Pro ESM.
3. **Disk layout** — LVM carves the 2 TB into separate volumes for `/var/lib/postgresql`, `/var/lib/docker`,
   `/srv/uploads` and `/var/log` so none can starve another; filesystem tuning (`noatime`); **16 GB swap**; fstab;
   free-space alarms per volume.
4. **Network and kernel tuning** — Accelerated Networking confirmed on; sysctl for connection backlog, file
   descriptors, `vm.swappiness`, transparent huge pages off for PostgreSQL; ulimits.
5. **Runtime** — Docker and Compose, daemon config with log rotation, Caddy with automatic HTTPS, Cloudflare DNS
   and proxy, origin certificate, HTTP/3.
6. **Tuning profile for 8 vCPU / 64 GB**, all values in one config file (see A2.6).
7. **Google Drive backup** — service account; nightly database, uploads and the blueprint file; encrypted;
   retention rules; and the monthly blueprint snapshot from A6.4. **Azure Blob removed entirely.**
8. **One-command restore, actually tested** — rebuild everything on a throwaway VM from the Drive backup, prove it
   works, then destroy the test VM. A restore that has never been run is not a backup.
9. **Monitoring from day one** — metrics, disk, memory, CPU, service heartbeats, Telegram alerts, all wired
   **before** the application exists, so the foundation is watched from the first hour.
10. **Baseline benchmark and runbook** — a k6 load test against a trivial app to record this machine's ceiling, so
    every later change can be measured against it; plus `docs/SERVER.md` **in Bengali**; plus the server-side hooks
    that the dashboard optimisation panel (PR-208) calls.

Everything else the agent must do on the server is inside these ten PRs or in S19 / S21: Docker build, Azure VPS
provisioning, OS choice, disk layout, swap, Accelerated Networking, NSG rules (80 and 443 open, 22 restricted to
the owner's IP only), SSH hardening, firewall, fail2ban, unattended security upgrades, Caddy and HTTPS, DNS and
Cloudflare CDN, the deploy pipeline with automatic rollback, backups, one-command restore on a fresh VM,
monitoring and alerts, the optimisation panel, load testing, performance tuning, Server Health with the
performance budget, and the go-live checklist.

### A2.6 The tuning profile, sized to this exact box

With 64 GB and 8 vCPU confirmed, the build is tuned to the real machine rather than guessing. **All of these
values live in one config file so they can be re-tuned if the VM ever changes.**

| Component | Setting |
|---|---|
| PostgreSQL | `shared_buffers` **16 GB**, `effective_cache_size` **48 GB**, WAL and checkpoint settings tuned, **PgBouncer** in front |
| Redis | capped at **2 GB** with an eviction policy |
| Meilisearch | **4 GB** |
| Next.js | **4 app processes** |
| BullMQ worker | concurrency **4**, with **image jobs limited to 2 at a time** so a batch never starves the storefront |
| sharp | explicit memory limits |

**Rule:** all heavy work — the image pipeline, ERP sync, AI calls, courier booking — stays in the worker queue and
never runs in the request path. Disk throughput of 250 MB/s is ample once media is on object storage.

**Capacity on this box with Cloudflare in front: comfortably 50,000–150,000 page views a day and several hundred
orders a day** — far beyond what the shop needs at launch.

### A2.7 100% optimisation, and who watches it

The dashboard already carries the live optimisation and usage panel — **PR-208**: one-button optimise, plus live
page speed, query times, cache hit rate, queue depth, disk and memory. **S21 Server Health** carries the
performance budget and the Telegram alerts. Both are confirmed; nothing new is needed there. S0A PR 10 supplies
the server-side hooks that PR-208 calls, and the k6 baseline that every later change is measured against.

### A2.8 Backups — Google Drive only — Locked

**Backups go to Google Drive. No Azure Blob. No second Azure cost.** PR-206 is simplified accordingly, and the
earlier "Azure Blob and Google Drive" wording in §37.1 is superseded. The backup set is the database, the uploads,
and the blueprint file, taken nightly, encrypted, with retention rules. The monthly blueprint snapshot (A6.4)
rides on the same Google Drive target.

If the owner ever moves to a new VM, the go-live checklist says: **run the one-command restore. Nothing is rebuilt
by hand.**

### Open — needs the owner's decision

- **The pre-upgrade Azure disk snapshot:** after the OS upgrade finishes successfully, do you want the snapshot
  **deleted straight away** (no ongoing Azure cost) or **kept** for a while as insurance?
- **Ubuntu Pro ESM fallback:** if the in-place upgrade cannot be completed and the box has to fall back to Ubuntu
  Pro ESM on 20.04, attaching ESM needs an Ubuntu One account and token. Are you willing to supply that one token
  **if and only if** the fallback is actually needed, or should the agent keep retrying the upgrade instead?
- **Region:** West India is a reasonable choice for Dhaka, and the original assessment suggested measuring it
  against Central India and South-East Asia before go-live. Changing region means a new VM, which your "do not
  change the package" rule forbids. **Confirm: stay on West India permanently?** (With the CDN in front, region
  only affects API calls, not images, so staying is a perfectly good answer.)

---

## A3. Architecture — the ERP is the master

### A3.1 The stack

Both systems are **Next.js + Prisma + TypeScript + PostgreSQL**. The same stack on both sides is deliberate: the
ERP already uses it, so the sync adapter is written against real types, not guesses. Around the app on the one
server sit **Redis**, **BullMQ** for the worker queue, **Meilisearch** for search, **Caddy** for HTTPS, **sharp**
for local image processing, and **Docker Compose** to run it all. Media lives on **object storage behind
Cloudflare**, never on the VM disk.

### A3.2 ERP is the master — Locked

The ERP repository is **`mehadih32/Extas-ERP`**. Reading it changed the architecture: it already contains far more
than was assumed, and the e-commerce platform must not rebuild any of it.

Models that already exist in the ERP and must be used, not duplicated:

- `Style` → `Color` / `Size` → `ProductVariant` (sku unique per company, barcode, `retailPrice`, `wholesalePrice`,
  `avgCost`, `bGradeAvgCost`) — a full variant-level catalogue
- `Warehouse`, `StockBalance` (quantity **and `reserved`** — "allocated to confirmed but undelivered orders"),
  `StockMovement` (referenceType / referenceId), `StockLot`, `BadStockEntry`
- `StockIntake` / `StockIntakeLine`, `PurchaseOrder`, `Party` (suppliers) — goods receiving
- `SalesOrder` with `channel: SalesChannel`, `integrationId`, `externalOrderId`, `customerName`, `customerPhone`,
  `shippingAddress`, and `partyId` **nullable, "for walk-in retail"**
- `SalesChannelIntegration` (platform, apiKeyRef, webhookSecretRef, lastSyncedAt) and `WebhookEvent` (source,
  payload, status) — an e-commerce integration inbox already designed in
- `EcommercePlatform.CUSTOM_WEBSITE`, `SalesChannel.WEBSITE`, `SalesChannel.POS`
- `CourierAccount`, `Shipment`, `ShipmentEvent`, `CourierProvider.PATHAO | STEADFAST`
- `SalesReturn`, `SalesReturnItem`, `ReturnItemQcStatus`
- `Payment`, `Refund`, `CreditAllocation`, `Cheque`
- `LedgerAccount`, `JournalEntry`, `JournalLine` — real double-entry accounting
- `ExpenseHead`, `Expense`, `AdSpend` (date, platform, campaign, amount), `BankAccount`

### A3.3 Ownership split

| Side | Owns |
|---|---|
| **ERP** | Variants and SKUs · stock on hand · goods receiving · purchase orders · suppliers · production · all accounting and the books · expenses · fixed assets · payroll |
| **E-commerce** | Storefront · product presentation and SEO · content and blog · customer accounts · cart and checkout · online payment gateways · combos and bundles · fraud scoring · location check · retail CRM and marketing automation · ad analytics with delivered-ROAS attribution · the AI agent · the Telegram bot · the daily report · courier booking and tracking (it sits in the operational flow) |

### A3.4 The sync map

| What | Direction | ERP model |
|---|---|---|
| Variants: SKU, colour, size, retail price, cost | ERP → shop | `ProductVariant` |
| Stock on hand and reserved | ERP → shop | `StockBalance` |
| Confirmed order | shop → ERP | `SalesOrder` + `SalesOrderItem`, channel `WEBSITE` |
| Payment received | shop → ERP | `Payment` |
| Shipment booked + status | shop → ERP | `Shipment` + `ShipmentEvent` |
| Return + QC result | shop → ERP | `SalesReturn` + `SalesReturnItem` |
| Daily ad spend total per platform | shop → ERP | `AdSpend` |

### A3.5 Three rules the sync adapter must obey

1. **Accounting: push business documents, not journal lines.** The shop sends SalesOrders, Payments and
   SalesReturns. The ERP's own double-entry logic produces the journals. Writing journal lines from outside
   would fight the ERP's existing accounting rules.
2. **Reservation rule, to prevent double-counting.** The shop holds a short-lived **cart** reservation locally and
   does **not** push it. On order confirmation the shop pushes a SalesOrder, and from that point the ERP's own
   `StockBalance.reserved` logic takes over.
3. **The ERP is multi-company — `companyId` sits on everything.** **Every single sync call must carry the
   `companyId`.** Store-to-companyId mapping is covered in A4.4.

### A3.6 What is removed from the e-commerce build, and what stays

**Removed, because the ERP already does it:** stock transfers · suppliers and purchase orders · goods receiving ·
stock audit and adjustments · expense entry · VAT reporting. (≈ −6 PRs.)

**Kept in the e-commerce, for speed or because only the shop has the data:**
- a **local stock mirror** for fast page loads
- the **cart reservation**
- low-stock alerts
- sell-through by size
- auto-clearance
- **per-order operational margin** — revenue − COGS − courier − gateway − ads — which the daily report and
  delivered ROAS both need

**Added:** the ERP sync adapter, written against the real schema above, plus the ERP-side endpoints. (≈ +4 PRs.)

**Net effect: no duplicated data entry anywhere.** Anything the ERP owns is read from the ERP or pushed to the
ERP; it is never re-keyed or re-modelled on the shop side.

### Open — needs the owner's decision

- **Push access to `mehadih32/Extas-ERP`.** The sync needs endpoints on the ERP side. Will you give the build
  agent push access to that repository, so the ERP-side endpoints are built in the same project? Without it the
  agent can only write a specification and wait for someone else to implement it, which stalls the whole sync.

---

## A4. Multi-store — three stores, one server, one codebase

### A4.1 The shape — Locked

**Three e-commerce sites: three domains, each its own brand and theme, each selling its own items (clothing or
otherwise), each with its own ad campaigns and its own sales — and all three connected to the same EXTAS ERP,
because all three are the owner's retail business.** The benefit he has seen in practice is exactly this:
separate domains, separate campaigns, separate sales.

**One codebase, one deployment, three domains. Not three copies.** The request's hostname decides the store;
everything downstream is scoped by `storeId`, **enforced at the data layer so one store can never read another's
rows.** Three copies would mean three times the maintenance and three times the bugs, for no gain.

Three stores on this machine cost very little extra — one application, three hostnames, one database. The
8 vCPU / 64 GB box handles all three comfortably.

### A4.2 What is separate per store

Domain and certificate · brand: logo, theme, fonts, colours, templates, page layouts · catalogue and which
products are listed · prices and offers · categories and menus · content, blog and SEO · policies and Smart
Rules · payment accounts · courier accounts · SMS sender ID · WhatsApp number and Facebook page · ad accounts and
attribution · support inbox · customers and orders · reports.

### A4.3 What is shared

The codebase and the server · staff accounts and roles (one login, with a store switcher) · the AI 360 control
room, with per-store switches and per-store cost attribution · the Studio asset, model and scene libraries, which
a store may use or keep private · the ERP connection.

### A4.4 ERP mapping, and the stock decision — Locked

**Each store maps to a `companyId` and a warehouse**, and every SalesOrder pushed carries which store it came
from, so stock and accounts never mix by accident.

**Decision: one stock, one warehouse, shared by all three stores.** (Option (a) of the two discussed; option (b),
a separate warehouse and separate stock per store, is rejected.) What that means in the build:

- One stock number per variant in the ERP, used by all three sites. A sale on any site reduces it on all three at
  once.
- **Reservation is global.** The moment a variant is held in checkout on one site, the other two see it held — so
  two sites can never sell the same last piece. **This is the single most important rule in S17 and it gets its
  own test.**
- Every product carries **"show on this store"** toggles — three switches. A product can live on one site, two, or
  all three. A hidden product still holds its stock; it is simply not displayed there.
- Low-stock and out-of-stock behaviour follows the shared number, so a last piece goes out of stock everywhere
  together.
- The ERP sees **one warehouse and one stock ledger**. Each store still maps to **its own `companyId`** for sales
  and accounts, so **stock is shared, but sales, costs and reports stay separate per store.**
- Stock alerts and restock suggestions are raised **once** on the shared number, not three times.

### A4.5 The mother store — Locked

**The first domain connected is the mother store.** It is created during setup, carries `storeId = 1` and the flag
`isPrimary = true`, and **that flag can never be moved or deleted.**

Everything already designed and given a UI in this project **is** the mother store. It is the default store
everywhere:

- the store a staff member lands on after login
- the owner of the shared Studio libraries
- the one whose settings a new store may optionally copy from as a starting point

Stores 2 and 3 are added later from the back end and are **ordinary stores — no shared look, no shared identity.**

### A4.6 The store switcher and "Add store"

In the admin dashboard, under **Settings → Stores**, there is a **store switcher** at the top and an **"Add
store"** button.

The wizard asks for: store name · domain · language and currency · which ERP `companyId` and warehouse it maps
to · which theme to start from · which products to list.

- Nothing is added by editing code or a file. The owner does it from the dashboard.
- Stores can be created in **draft** and launched when ready.
- **The mother store cannot be deleted from here.**

### A4.7 What the owner must supply to connect a domain — one time, per domain

The build agent does everything else: DNS records, certificates, Caddy host config, Cloudflare settings, store
creation, testing.

1. **The domain name itself.**
2. **Registrar access** — either the login for wherever the domain was bought, or the owner changes two
   nameservers himself, with step-by-step instructions supplied by the build agent.
3. **A Cloudflare account** — the free plan is enough. The email, and an **API token** created with the
   "Edit zone DNS" template. The build agent supplies the exact click path for creating it.
4. **Azure, two things only:**
   - the VM's public IP must be set to **Static**, not Dynamic — a dynamic IP changes on restart and the site
     dies;
   - **ports 80 and 443 open** in the Network Security Group.
   Both are one-time clicks in the Azure portal. The build agent supplies the exact path, or does it itself if it
   is given an Azure credential. **The VM package does not change.**
5. **Server access** — IP, sudo username, and SSH key or password. Already agreed (A1.2).

**That is the entire list. Nothing else is ever asked of the owner.**

### A4.8 Add-on stores must look nothing like the mother store — Locked

Functionality stays the same across all three. **The face must be completely different — a customer who visits two
of them must never feel they are the same shop. This is not a colour swap.** Per store:

- its own page templates and homepage composition, not the same layout recoloured
- its own component variants — a different product card, different navigation, different buttons, a different grid
- its own typography pack and colour system
- its own photography style: different lighting, different framing, different backgrounds
- **its own AI model roster in the Studio** — different faces, a different look; a model used on one store is not
  used on another
- its own AI copy voice and brand tone
- its own SEO: different keywords, different titles, different descriptions, different blog topics
- its own ad creative style

**A cross-store sameness guard** runs automatically and warns if two stores drift toward looking or reading alike —
same layout shape, same copy phrasing, same product text, same model face.

**Honest note, recorded so the cost is not hidden:** "same functions, completely different face" means the theme
layer has to be deep — a **real theme engine with its own template sets**, not variables on one design. That is
genuine work, and it is priced into the PR count below rather than glossed over.

### A4.9 The duplicate-content warning

Three separate domains mean three separate SEO efforts. **If the same product appears on two sites with the same
text and the same photos, Google may treat it as duplicate content and rank neither well.** So: either list a
product on one store only, or give each store its own description, title and images. **The system flags it
automatically when the same SKU is listed on more than one store with matching copy.**

### A4.10 S17 — the stage that carries all of this, 21 PRs

| Group | PRs |
|---|---|
| Original five | store entity and query scoping · store switcher · shared vs separate settings · combined all-stores view · isolation tests |
| Added in §39 (9) | per-store brand, theme, templates and page layouts · per-store domain, certificate and Cloudflare routing · per-store ERP mapping to `companyId` and warehouse · per-store product listing and stock visibility · per-store payment, courier and SMS accounts · per-store WhatsApp, Facebook and support-inbox routing · per-store ad accounts, attribution and campaign separation · per-store SEO with cross-store duplicate-content detection · per-store AI 360 scoping, switches and cost attribution |
| Added in §40 (7) | theme engine with full template sets, component variants and typography packs · store #2 complete theme build · store #3 complete theme build · per-store Studio identity (own model roster, scene style, photo grade) · per-store AI copy voice and brand tone profile · cross-store sameness guard for look, copy and SEO · "Add store" wizard with domain connection, Cloudflare and certificate automation |

**Total S17: 21 PRs.** The earlier suggestion to drop S17 entirely is **withdrawn.**

### Open — needs the owner's decision

- **Which domain is connected first?** That domain becomes the mother store (`storeId = 1`, `isPrimary = true`),
  permanently. Name it.
- **Stores 2 and 3:** do you already have the two other domain names, or should the agent build stores 2 and 3 in
  **draft** and wait for the domains to arrive?
- **Azure credential:** do you want to give the build agent an Azure credential so it sets the static IP and opens
  ports 80/443 itself, or will you do those two clicks in the portal yourself following its instructions?
- **Per-store ERP `companyId`:** do companies already exist in the ERP for stores 2 and 3, or should the agent
  create them? If they exist, their names or IDs are needed at the "Add store" step.

---

## A5. Model and cost policy

### A5.1 The honest position on free models

Free endpoints are real and useful, but they come with four problems: tight daily rate limits, models that get
removed without notice, uneven uptime and latency, and — the important one — **free routes generally require
allowing the provider to use the data.** That last point decides the whole design.

### A5.2 The rule — Locked

**Every AI job is tagged with a data class, and the data class decides which providers may run it.**

| Data class | What it covers | Which providers |
|---|---|---|
| **Personal** | Anything containing a customer's name, phone, address, chat content or order details | **Paid providers only**, under terms that do not train on the data. **Free endpoints never.** |
| **Business** | Our own numbers: sales, costs, stock, reports | Paid small / cheap models. Free endpoints **not recommended** — these are the owner's own figures. |
| **Public / draft** | Content that will be published anyway, reviewed before it goes out, with no private data in it | **Free models allowed**, with an automatic fallback to a cheap paid model whenever the free one is rate-limited, removed or slow. |

### A5.3 Where free models may be used

All of these are drafts that a human or a paid model reviews afterwards, contain no customer data, and cost
nothing if they fail:

- Blog article first drafts (quality gates and review run afterwards anyway)
- Product description first drafts
- SEO meta titles, descriptions and image alt-text drafts
- Social captions and hashtag suggestions
- Keyword clustering and topic ideas
- Standard UI string translation, Bengali ↔ English
- Spam and abuse screening of review text **after names and phone numbers are stripped**
- Summarising rider notes **after customer identity is stripped**
- Explaining an error message in the owner's bug box
- Generating test data
- Drafting prompts that the paid models will then run

### A5.4 Where free models must never be used

- **Address parsing** — that is a customer's home address. Personal data, paid providers only.
- **Customer-facing chat replies** — brand voice, accuracy and uptime all matter; a free model going down means a
  customer waits.
- **Fraud judgement, order confirmation, courier booking** — decisions that move money.
- **The daily business report** — these are the owner's real financials. Use a cheap paid model, not a free
  endpoint.
- **Anything on a path where an outage breaks a customer flow.**

### A5.5 The arithmetic behind the rule

At EXTAS's volume the text work is small — support replies, a dozen blog posts, a few dozen product descriptions,
one report a day. On cheap paid models that is roughly **৳1,500–4,000 a month in total.** Free models might save
**৳1,000–2,000 of that**, while adding rate limits, sudden model removals and a data-sharing question.

**So: free models for drafting, everything else on cheap paid models.** The saving is real but small; the risk on
customer data is not worth it. The image and video work is where the real money goes, and **nothing there is free.**

### A5.6 How the policy is built, not just written

- Each job in the **AI Cost Book** carries its data class, its recommended model, and whether a free route is
  permitted.
- The **AI 360 provider router enforces it.** A job tagged personal **cannot** be sent to a free endpoint even if
  the owner selects one — the interface explains why and offers the cheapest permitted model instead.
- **Every free route has a named paid fallback** and switches to it automatically on rate limit, error or timeout,
  so nothing in the shop ever stops because a free model vanished.
- A monthly line in the report: what the free routes saved, and how often they fell back.

This is **+1 PR**: data-class tagging and the provider routing policy inside AI 360.

---

## A6. Repository and document discipline

### A6.1 One living file, not two — Locked

**The owner hands the build agent a single `.md` file and nothing else.** Everything goes in it — every
discussion, every decision, every PR, every word. The wave split (before launch / after launch) happens **inside
that one file, never as a second file.** The owner is happy to wait four or five more days for it to be complete
rather than have it split up.

Structure of that file:

| Part | Contents |
|---|---|
| **Part 0** | How the build agent must work on this project — rules, order, never skip |
| **Part 1** | The business, the non-negotiable principles, the rules, the architecture |
| **Part 2** | **Wave 1: everything needed to go live**, PR by PR |
| **Part 3** | **Wave 2: everything after launch**, PR by PR |
| **Part 4** | Appendices: data model, environment variables, owner checklist, traceability, **Appendix F · Parked modules** |
| **Part 5** | **Change log**, appended forever |

**Parked, not cancelled** (they live in Appendix F and may be built later, on the owner's word):

| Parked module | Why it is parked |
|---|---|
| **POS / counter selling** | There is no physical showroom today; one is planned later. The core is built POS-**ready** now (see A6.2) so POS becomes a clean add-on, not a rebuild. |
| **AI voice calls** | Deferred by the owner; not needed for launch. |
| **Birthday marketing** | Deferred by the owner; not needed for launch. |

**Rule written into Part 0 so nothing is skipped:** the agent builds Wave 1 in order, runs the staging checks,
then **stops and reports "Wave 1 is complete. Shall I start Wave 2?"** It never skips a PR, never silently jumps
between waves, and if it cannot finish something it writes it in `BLOCKED.md` and carries on.

**Order inside Part 0 and in execution:** Part 0 rules → **S0A Server Foundation** → S00 Foundation → the rest of
the waves.

### A6.2 The POS-ready carve-out, recorded here because it shapes the schema

POS is parked, but the core must be built so POS is a clean add-on later. Cost now: about one extra PR of care
spread across S04, S05, S07 and S09. Cost later when a shop opens: a self-contained **S20 of ~8–10 PRs** (counter
UI, offline cache, till barcode scanning, cash drawer and printer hardware, day-close and cash-up) **that does not
touch the core.** What must be true in the core from day one:

- `Order.fulfillmentType` enum: `DELIVERY` | `PICKUP` | `COUNTER`, default `DELIVERY`
- Shipping address and `Shipment` **optional** on an order, not hard-required
- `Customer` **optional** on an order — a walk-in with no phone
- Payment method `CASH` present in the payment adapter from day one; **split payment supported**
- Inventory already location-aware (warehouse / showroom / in-transit / damaged) — the showroom location simply
  stays empty until a shop exists
- Order source enum already includes `SHOWROOM`
- Thermal receipt template reused from the label and invoice work
- Wallet / store credit usable at the counter — it lives on the customer, so it already works

### A6.3 The blueprint lives in GitHub and updates itself — Locked

The point: two months after launch the owner says "move this menu", and the blueprint must not go stale.

- The blueprint `.md` sits in the repository, next to the code.
- **Hard rule: a PR is not complete until the blueprint is updated in the same PR.** The change and the document
  move together, in one commit, so forgetting is impossible and git history shows both.
- Every new request becomes **a new numbered PR appended to the right Part, plus a Change log entry** — the date,
  what the owner asked **in his own words**, what changed, which PR, written in the same plain style as the rest
  of the file.
- **A CI check enforces it:** if code under the app paths changes and the blueprint file was not touched, the PR
  fails. That is what makes it automatic rather than a promise.
- **The owner never edits the file himself.** He describes the change in plain Bengali — in chat, in Telegram, or
  in the AI 360 box — and the AI writes the blueprint entry and opens the PR.

### A6.4 Monthly Google Drive snapshot of the blueprint — Locked

- On the **1st of every month** a scheduled job copies the current blueprint to Google Drive as
  `EXTAS-BLUEPRINT-YYYY-MM.md`.
- **It runs whether or not anything changed that month** — the owner was explicit about this.
- **Three snapshots are kept**; the oldest is deleted as a new one arrives.
- A **one-line Telegram confirmation** each time, so the owner knows it happened.
- It rides on the Google Drive backup target in S0A PR 7 (A2.8).

### A6.5 Branding and naming — Locked

- **Brand name: EXTAS** (E-X-T-A-S). Every `{{BRAND_NAME}}` placeholder is replaced with EXTAS.
- **AI agent default name: EXTAS AI.**
- **File and package naming: `extas-ecommerce`.**

### A6.6 Running totals

| Item | Value |
|---|---|
| Total PRs | **409** |
| Stages | **27** |
| Parked | AI voice calls, POS, birthday marketing |

### Open — needs the owner's decision

- **The blueprint filename.** The source names it two ways: `EXTAS-ECOMMERCE-BLUEPRINT.md` (§21.1) and
  `EXTAS-ECOMMERCE-V1.md` (§33, §36.7, §37.1). Which one do you want as the single file at the repository root?
  The monthly Drive snapshot name (`EXTAS-BLUEPRINT-YYYY-MM.md`) is unaffected either way.

---

# Part E · Stages, the PR plan and the numbers

This is the spine of the build. Every PR belongs to exactly one stage, and the stages run in the order
below. A build agent that is unsure where a piece of work belongs puts it in the stage named here
rather than inventing a new one.

## E1. How the count was arrived at

The figure has been re-derived from scratch once, because a running total had drifted. On 2026-10-17 the
stages were re-added one at a time and the correct figure at that moment was **341 PRs across 24
stages**. Everything after that is a recorded increment, and the full trail is reproduced here so the
owner can audit it rather than take it on trust.

| Step | Change | Running total | Stages |
|---|---|---:|---:|
| Full re-tally (supersedes every earlier figure) | baseline | **341** | 24 |
| Image system — PREMIUM tier | +5 | 346 | 24 |
| S24 Virtual Photoshoot Studio created | +7 | 353 | 25 |
| S24 — all product families, lifestyle catalogue | +6 | 359 | 25 |
| Sets, unisex shots, occasion scenes, video | +8 | 367 | 25 |
| Campaign visuals — two layers, Studio menu | +12 | 379 | 26 |
| Campaign overlay + creative brief | +2 | 381 | 26 |
| Activation Center / parallel-agent plumbing | +1 | 382 | 26 |
| Free-model routing policy | +1 | 383 | 26 |
| Server assessment | no change | 383 | 26 |
| S0A server foundation enters the plan | +2 | 385 | 26 |
| S17 expanded — three stores, one server | +8 | 393 | 27 |
| Mother store, domains, store separation | +9 | 402 | 27 |
| Domain connection detail | no change | 402 | 27 |
| Add-on store separation rules | +7 | **409** | 27 |
| UI/UX round 1 — configurability, page builder, mobile | +33 | 442 | 27 |
| Competitor Teardown agent | +3 | 445 | 27 |
| Fabrilife teardown decisions | +4 | 449 | 27 |
| UI/UX round 2 | +16 | 465 | 27 |
| Round 9 — tracking landing, upsell block, review manager | +8 | **473** | 27 |
| Analytics event layer (scoped, not yet built) | +6 | 479 | 27 |
| Product-upload mandatory block (scoped) | +2 | 481 | 27 |
| Dashboard eye-toggles (scoped) | +2 | **483** | 27 |

**Current plan: 473 PRs across 27 stages, rising to 483 once the three scoped items land.**

**UI/UX rounds 10, 11 and 12 are deliberately not in this count.** Those three audits produced 151
correction points, and almost all of them are layout, type and spacing work inside PRs that are already
counted — not new features. Counting them again would inflate the number without adding work. The few
that are genuinely new (the site-wide floating WhatsApp button, the sub-menu system, the rebuilt search)
are listed as open items in Part D and will be counted when the owner approves them.

**Parked, and excluded from every figure above:** AI voice calls (≈6 PRs), POS (≈8–10), birthday
marketing (≈2), the ERP retail section. Parked means postponed, not cancelled — each keeps its design
notes so it can be picked up without re-deciding anything.

## E2. The stages

**Re-derived 2026-10-18, and it reconciles exactly.** The per-stage column had gone stale: increments
were being added to the running total but not written back into a stage row, so the column read 416
against a total of 473. Every increment since the 341-PR baseline has now been placed in a named stage,
by two independent routes that agree — 341 + 132 = 473, and the column summed top to bottom = 473.
**Difference: zero. Nothing was left unplaceable.**

Thirty-five of the 132 were placed by judgement because the record did not name a stage; those are
marked in the full working at `parts/part-E-retally.md`, which also carries the increment-by-increment
audit trail. Anyone who doubts a number can follow it back to a line in the record.

27 stages. "Change since §24" shows the arithmetic for every stage that moved.

| # | Stage | §24 baseline | Change since §24 — with the section that made it | **PRs now** |
|---|---|---:|---|---:|
| S0A | Server foundation (runs before any application code) | — (did not exist) | **new, +10** — §38.5: 2 moved out of S19 plus 8 new | **10** |
| S00 | Foundation — repo, CI, Docker, Prisma, auth | 8 | — | **8** |
| S01 | Catalog, media & images | 24 | +5 §25.10 · **−12 §27.8** (image AI moves to S24) · +2 §46.19 ("was" price) = −5 | **19** |
| S02 | Storefront | 28 | +4 §41.24 · +2 §45.7 · +1 §46.19 = +7 | **35** |
| S03 | Combo & bundles | 16 | — (see the S02/S03 note in section 4) | **16** |
| S04 | Cart, checkout, accounts | 19 | +1 §41.24 · +1 §45.7 · +5 §46.19 · +7 §55.4 = +14 | **33** |
| S05 | Order management | 14 | +3 §41.24 · +1 §55.4 = +4 | **18** |
| S06 | Fraud & location | 9 | — | **9** |
| S07 | Payments & wallet | 10 | — | **10** |
| S08 | Courier, returns, exchange | 17 | +3 §41.24 · +2 §46.19 = +5 | **22** |
| S09 | Inventory & ERP sync | 14 | — | **14** |
| S10 | Smart Rules | 11 | +2 §41.24 · +1 §45.7 = +3 | **14** |
| S11 | SEO engine | 15 | +2 §46.19 | **17** |
| S12 | Content & blog | 10 | +3 §41.24 · +1 §46.19 = +4 | **14** |
| S13 | Marketing & ads | 28 | +2 §41.24 | **30** |
| S14 | CRM & customers | 18 | +3 §41.24 · +2 §46.19 = +5 | **23** |
| S15 | AI 360 Control Room | 28 | +1 §35.5 · +2 §41.24 · +3 §44.4 = +6 | **34** |
| S16 | Finance, costs & reports | 13 | +1 §41.24 | **14** |
| S17 | Multi-store — three stores, one server | 5 | +9 §39.7 · +7 §40.6 · +1 §41.24 = +17 | **22** |
| S18 | Compliance, security, manual | 11 | +1 §46.19 | **12** |
| S19 | Deploy, backup, go-live | 12 | +1 §34.4 · **+2 §37.2 then −2 §38.5** (net 0) · +1 §41.24 = +2 | **14** |
| S20 | Fulfilment & documents | 6 | +1 §41.24 | **7** |
| S21 | Site Health & Audit | 6 | +4 §41.24 | **10** |
| S22 | Support (all-in-one) | 12 | — | **12** |
| S23 | Social & content studio | 7 | +2 §41.24 | **9** |
| S24 | Virtual Photoshoot Studio | — (did not exist) | **new** — 19 §27.8 · +6 §28.6 · +8 §29.8 · +4 §30.8 | **37** |
| S25 | Video & Campaign Creative Studio | — (did not exist) | **new** — 8 §30.8 · +2 §31.4 | **10** |

### Showing the arithmetic

Running down the column:

10, 18, 37, 72, 88, 121, 139, 148, 158, 180, 194, 208, 225, 239, 269, 292, 326, 340, 362, 374, 388, 395, 405, 417, 426, 463, **473**

In full: 10 + 8 = 18 · +19 = 37 · +35 = 72 · +16 = 88 · +33 = 121 · +18 = 139 · +9 = 148 · +10 = 158 · +22 = 180 · +14 = 194 · +14 = 208 · +17 = 225 · +14 = 239 · +30 = 269 · +23 = 292 · +34 = 326 · +14 = 340 · +22 = 362 · +12 = 374 · +14 = 388 · +7 = 395 · +10 = 405 · +12 = 417 · +9 = 426 · +37 = 463 · +10 = **473**.

And checked the other way: the §24 baseline of **341** plus the **+132** in the audit trail = **473**. The two routes agree.

**Column total: 473 PRs across 27 stages.**

---

### Three things in this table the owner should look at

1. **Twelve PRs sit under stages that do not describe them.** When the first UI/UX round was recorded,
   several items were filed against the wrong stage: the page builder under S08 (courier), category SEO
   under S10 (Smart Rules), invoice and PDF templates under S14 (CRM), the celebration overlay under
   S19 (deploy), the user manual under S20 (fulfilment), and the Find My Size engine under S23 (social
   studio). The numbers above keep them where the record put them. **They should be re-filed** — a
   build agent reaching S08 and finding a page builder in it will be confused — but that is a decision,
   not a correction, so it waits.
2. **An earlier table double-counted two server PRs.** It showed S19 at 14 and S0A at 10, but those two
   PRs moved from S19 into S0A. Fixed here: S19 reaches 14 by a different route.
3. **Section 11 of the record is still labelled "authoritative" at 263 PRs.** It is not; §24 replaced
   it, and this table replaces §24. Anyone re-reading the record should ignore it.

## E3. Order of work

**S0A runs first and alone.** No application code is written until the server is built, hardened,
tuned and backing up to Google Drive. This is the owner's explicit instruction and it is not negotiable:
a shop built on an unprepared server has to be rebuilt.

After S0A, work runs in waves. Inside a wave the stages are independent enough for three agents to run
in parallel without touching the same files; a wave boundary is the only point at which the build stops
to take stock.

| Wave | Stages | Why they go together |
|---|---|---|
| 1 | S00, S01, S09 | Nothing can be built until the schema, the catalogue and the ERP link exist |
| 2 | S02, S03, S10 | The storefront and the rules that drive it |
| 3 | S04, S05, S07, S08 | The money path, end to end |
| 4 | S06, S14, S20, S22 | Everything that happens around an order once it exists |
| 5 | S11, S12, S13, S23 | Being found and being marketed |
| 6 | S15, S16, S21 | The control room and the numbers it governs |
| 7 | S24, S25 | Imagery, which depends on the catalogue being real |
| 8 | S17, S18, S19 | Multi-store, compliance and go-live |

## E4. What one PR must contain

A PR is the unit the owner never reviews, so each one has to be safe on its own:

1. One change, named in plain English in the title — not "fix" or "update".
2. Migrations that run forward cleanly and are reversible.
3. Tests that would fail without the change.
4. A screenshot or a measured number for anything visual, at **440 × 956**.
5. A line appended to `PROGRESS.md`: stage, PR number, what changed, what was verified.
6. No secret, key, token or password anywhere in the diff.

A PR that cannot meet all six is split until it can.

---

# Part B · Orders, money, support and operations

## B1. Orders and fulfilment

### B1.1 Order lifecycle — already in the blueprint, confirmed
**Locked.** These were checked against the owner's operations notes and need no new work, only correct implementation:

- Order states including `ON_HOLD`, an event timeline plus an append-only audit log on every change (PR-058, PR-005).
- Inventory locations including a damaged bin, per-variant per-location stock levels (PR-101); reservation with row locking (PR-102); stock audit by barcode with variance and reason (PR-107); low-stock alerts (PR-108).
- Returns flow with QC good/damaged → restock or write-off (PR-096); exchange variant switcher (PR-097).
- Invoice and label PDFs, A4 and thermal, barcode/QR (PR-066); bulk actions including booking, invoice and label printing (PR-065); courier booking stores the real consignment ID (PR-092); handover sheet (PR-093).
- Customer dashboard with full order history and lifecycle (PR-055); SMS / WhatsApp / Email adapters with templates and delivery logs (PR-156 / 157 / 158); policy display pulled from Smart Rules (PR-116).
- Idempotency keys on every webhook, payment callback and ERP push. No duplicate shipment and no duplicate stock movement is possible (§221, §246, PR-081).

**Standing rule, repeated because it is easy to get wrong:** the consignment number and the barcode always come from the courier integration. The shop never generates them.

### B1.2 Defective item found at packing
**Locked** (approved exactly as planned, plus the hold additions).

On the packing screen every order line carries two one-tap buttons: **Damaged** and **Not found**.

One tap does all of this:
1. Moves that piece out of sellable stock. For a damaged piece it writes an ERP `BadStockEntry`.
2. Puts the order on `ON_HOLD` with the reason visible in the order list.
3. Opens the resolution card with, in order:
   - another location or warehouse has it → swap and continue;
   - another colour or size of the same style → offer it;
   - nothing available → contact the customer with four choices: wait / swap / send the rest now / cancel with refund.
4. Records who marked it, when, and why.

A held order also carries a **Hold button with a reason**. The owner sets the waiting time in Smart Rules. After that wait the team either arranges stock or talks to the customer and offers another product.

**Dropped:** the `NOT_FOUND` stock state, the recount task and the stock-adjustment posting. The owner removed them — stock reconciliation belongs in the ERP and has to be updated there manually anyway, and he does not want a second counting system in the shop. The shop keeps only the defective-at-packing exception and the hold. All counting and correcting stays in the ERP. (The **Not found** button on the packing screen stays; it holds the order and flags the line, but it does not open a recount workflow in the shop.)

### B1.3 The Fulfillment page
**Locked.** One page replaces the work that was spread over several screens.

- Pick a date or a status, select orders, then act in this order: **Book courier → Print stickers → Print packing slips** *(the packing slip was subsequently dropped — see B1.5; the page keeps Book courier and Print stickers, plus the picking list).*
- A column shows which document each order already has.
- The daily order summary line (B1.7) is shown on this page as well as printed.
- Reprinting a sticker never creates a second shipment. A reprint always uses the stored consignment.

### B1.4 The courier sticker — the single most important fulfilment document
**Locked.**

**Which orders print.** There is **no fixed cut-off time and no "today" filter**. Whenever the owner presses print — 5 pm, 7 pm, 8 pm, or the next morning — the system takes **every order still with us that has not yet gone to the courier**, however many days they span. If nothing was dispatched yesterday, yesterday's 50 orders print together with today's. Orders already handed to the courier never appear again (the exact signal is in B1.6).

**Sticker size.** The owner sets the sticker/label size to match his own barcode or sticker printer. The layout adapts to the chosen size so the whole content fits neatly. Print must be clean and sharp at every supported size — nothing cut, nothing overlapping.

**Print order — this is the packing order, not the order-time order:**

| Level | Rule |
|---|---|
| 1 | Group by **category**. The category with the most pieces in this print run comes first (e.g. Polo), then the next (T-shirt → Panjabi → Shirt …). |
| 2 | Inside a category, group by **brand / style / SKU family**. The style with the most pieces comes first (e.g. Ralph Lauren polo before Tommy polo). |
| 3 | Result: the packing desk finishes all the polos, then all the T-shirts, and so on. |

If an order contains items from several categories it is printed **once**, placed in the group of its highest-ranked item, and its other items are listed on the same sticker.

**What is printed on the sticker:**
- Courier details plus the courier's own consignment ID and barcode/QR — **always pulled from the courier integration (Steadfast / Pathao / etc.), never generated by us.**
- Customer name, phone, full delivery address, order number.
- A clean bordered box holding a **short product invoice summary**: every item in that order with brand/style, colour and size (so four or five items are all clearly readable), and quantity.
- **COD amount to collect**, printed prominently.
- Delivery instructions / order note.

**The packing rule this creates:** take the sticker → stick it on the poly bag → read the sticker → put those exact items in (Ralph Lauren polo black S, Tommy polo navy, the shirt item, …) → done.

### B1.5 Packing slip — DROPPED
**Dropped by the owner, with his reason recorded:** two documents means the packer has to match an ID on the slip with the right sticker, which is not workable in practice. The sticker alone carries everything. Do not build a per-order packing slip.

### B1.6 Daily consolidated picking list PDF
**Locked.** The warehouse or store manager holds **one document** and pulls every product for the whole run in one pass, category by category, then hands them to the packing desk.

**Which orders are included — detected automatically:** only orders still with us, meaning **not yet picked up by the courier**. The owner's own signal is the rule to implement: in Steadfast, consignments sitting at **"In Review" belong in the list**; **"Pending" means the courier already has the parcel and the order must be excluded**. Orders that are approved but not yet booked at all are also included. The owner may choose a custom date range, but an order already dispatched can never enter the list whatever date is chosen.

**Format:** proper EXTAS letterhead — the same header and footer as the EXTAS invoice pad.

**Sorting:** identical logic to the sticker — the category with the most pieces in this run first, and inside it the style/SKU with the most pieces first.

**Breakdown — must be exact.** For each style, then colour, then size:

```
Ralph Lauren Polo — 15 pcs
   Black — 5 pcs
      M — 2   L — 2   XL — 1
   Navy — 6 pcs
      ...
```

So the store keeper can separate them without thinking.

**A tick box at the end of every row** so the picker marks off what he has pulled.

**Header of the same PDF** (B1.7) and these print rules: repeating table headers on every page, black-and-white safe, nothing cut and nothing overlapping. Rows where stock is short are marked.

### B1.7 Daily order summary line
**Locked.** Printed at the top of the picking-list PDF and also shown on the Fulfillment page:
- orders included and total pieces, **counted separately** — 50 orders is not 50 pieces;
- line items;
- categories, in the print order;
- shortages;
- problem and held orders **listed separately and excluded from the quantities**, so the picking quantity is never wrong.

### B1.8 The exchange engine and its tiers
**Locked.** Exchange, not return.

**Policy (final).** Exchange is allowed **only for size issues**, plus defect, damage or wrong item (our mistake). There is **no colour-change reason, no "didn't like it", no returns and no refunds after receipt.**

**Window.** Read from the Smart Rules setting — currently 72 hours from the courier's Delivered timestamp, but the number is **never hard-coded**. Every piece of copy anywhere on the site prints the rule value.

**Flow.** My account → order → **Request exchange** (the button hides itself once the window has passed) → item → reason → needed size → new item → review the money box → submit. The form asks reason and needed size, and the system checks stock instantly.

**Replacement hierarchy — strictly in order, the customer cannot skip a tier:**

| Tier | What is offered |
|---|---|
| 1 | Same product, same colour, the needed size |
| 2 | Same product (same style / SKU family), other colours in the needed size |
| 3 | Same category — same collection first, then all of that category — items available in the needed size (same measurement) |
| 4 | Only if nothing in the category: other categories (T-shirts, shirts …) in that size |

The note shown to the customer: *"These are the only options available for your exchange under our rules."* Defects follow the same hierarchy, free of charge.

**The money box** — the review screen that shows the customer exactly what money moves before he confirms:

| Situation | What happens |
|---|---|
| New item costs more | Difference added to the invoice and collected as COD, plus the exchange delivery charge as COD |
| New item costs less | Difference credited to the customer's **wallet**, exchange delivery charge still collected as COD |
| Same price | Delivery charge only |
| Our mistake (wrong or damaged item, photo required) | **৳0** after the item is checked |

**Logistics.** Where the courier supports it, the swap happens in one trip; otherwise it is a delivery plus a separate pickup. Confirm the exact capability against each courier's documentation at build time.

**Settlement.** Wallet credit posts only after the old item has passed check. The ERP records a return of the old item and a sale of the new item.

**Limits** come from Smart Rules: number of exchanges per item, excluded categories.

### B1.9 Returns and refunds
- **No returns and no refunds after receipt.** The exchange engine above is the only post-delivery route, except where the shop is at fault.
- A **cancel with refund** exists only in the defective-at-packing resolution card (B1.2), before dispatch.
- Returned goods that do come back go through the existing QC good/damaged → restock or write-off flow (PR-096).

### B1.10 Order editing — who may do it
**Locked.**
- **Customer:** may edit twice from the dashboard before packing, up to the limit set in Smart Rules (existing rule, unchanged).
- **Admin / team (new):** the team must be able to edit an order from the admin dashboard when a customer phones in — add a product, remove a product, change a size.
- Every edit records **where it came from** — customer dashboard / admin / Telegram / support — with who and when.
- Every edit **re-runs the stock check and the fraud check**, exactly as at order time.
- An edited order's invoice is regenerated (B2.1).

### B1.11 The 2-size follow-up (affects packing)
**Locked.** When a customer buys two sizes of the same item: if he said "for someone else" it is a note only, no question. If he said "keep both" or did not answer, the order is tagged **"2 sizes — check"** and an automatic WhatsApp template goes out right after the order with reply buttons (Keep both / Only L / Only XL). The reply updates the order **before packing**, and it works with AI off. SMS fallback carries a one-tap link. No reply by packing time → a yellow note on the order plus a one-line script for the confirmation caller. Still unclear → ship both.

### B1.12 Duplicate orders — four layers
**Locked.** The owner reports this happens often. Prevention comes first.

1. **Stop it at checkout.** Before the order is placed the system checks the phone for an open order in the last N days with overlapping items. If one is found a calm card appears: *"আপনার একটা অর্ডার (#1234) এখনো পথে আছে। এটা কি নতুন অর্ডার, নাকি ওটার খোঁজ নিতে চান?"* with three buttons — this is a new order / show me the old one / cancel. Most duplicates die here.
2. **Flag it in admin.** "Possible duplicate" with a link to the other order. Severity: same SKU and colour = high; same product, other colour = medium; same category = low. The window is set in Smart Rules.
3. **Merge.** If neither parcel has been dispatched, one tap merges them into a single parcel — saves a delivery charge and pleases the customer.
4. **If the first is already shipped**, one tap sends a WhatsApp template: *"আপনার আগের অর্ডার #1234 আজ পথে আছে। নতুনটা কি সত্যিই চান?"* with reply buttons, and the answer updates the order before packing.

This works **across every channel**, because website, Messenger, WhatsApp and phone orders all share one customer record keyed by phone.

**Root cause also addressed:** clearer tracking messages, and a "your order is on the way" banner for a recognised customer, so people stop re-ordering out of confusion.

### B1.13 Fulfilment exception rules live in Smart Rules
**Locked.** These are written as rules the owner edits, never in code:
- how long to wait before cancelling a held order;
- whether partial shipping is allowed;
- who may approve a stock adjustment;
- refund wording;
- the duplicate-order lookback window;
- the exchange window, exchanges per item and excluded categories.

### B1.14 Holiday / vacation mode
**Locked.** **The site is never taken down.** Returning an error page for days genuinely damages rankings.

Holiday mode is: a clear banner with the dates · checkout either open with "ships after 20 Ramadan" shown before payment, or closed with a notify-me form · support auto-reply on · ads paused · SMS paused · the catalogue stays fully browsable and indexable. Google sees a normal site with a notice, which costs nothing.

### B1.15 Open — needs the owner's decision
1. **Held-order wait time:** how many hours or days should an order sit on hold for a defective item before the team must cancel it? (This is the Smart Rules default.)
2. **Partial shipping:** when one item of a multi-item order is held, may the rest ship immediately by default, or must the whole order wait?
3. **Stock adjustment approval:** which roles may approve a stock adjustment — owner only, or store manager as well?
4. **Duplicate-order window:** how many days back should the system look for an open order on the same phone — 3, 5 or 7?

---

## B2. Documents

One **document engine** produces all of these. This is why the sticker, the picking list and the invoice are cheap together and would cost more if split.

### B2.1 Customer invoice
**Locked.**
- Generated automatically on **every** order.
- One invoice per order. It is **regenerated only if the order is edited**.
- Downloadable from three places: the **customer dashboard**, the **Thank-you page**, and a **Download invoice button on every order in My account**.
- Admin keeps the existing invoice PDF (PR-066), A4 and thermal, with barcode/QR.

### B2.2 Courier sticker
Full specification in **B1.4**. It is a document-engine template with owner-set custom sizes, the category → style sort, and reprint safety.

### B2.3 Picking list PDF
Full specification in **B1.6**. EXTAS letterhead, grouped and totalled, tick boxes, repeating headers, black-and-white safe.

### B2.4 Printed accounting and print quality rules
**Locked.** Rules that apply to every printed document:
- **EXTAS letterhead** — the same header and footer as the EXTAS invoice pad — on the picking list and on the customer-facing accounting documents.
- Repeating table headers on every page.
- **Black-and-white safe.** Nothing may depend on colour to be readable.
- Nothing cut, nothing overlapping, at every supported paper and sticker size.
- Barcode and QR always sourced from the courier integration, never generated locally.
- The ERP remains the book of record for accounting (see B3.6). Printed shop documents are operational documents, not the ledger.

### B2.5 Notification log and delivery
**Locked.**
- Every order carries a **notification log**: what was sent, on which channel, sent or failed, with a **retry button**.
- A guard prevents the same thing being sent twice.
- **Order placed → confirmation email goes automatically.** Email is the guaranteed channel.
- **WhatsApp is optional**, switched on from the dashboard. When on, the system checks whether the number has WhatsApp: if yes it sends automatically, if not it simply skips — the email still goes.
- **WhatsApp invoice format is an owner setting: PDF file, or a JPG image of the order invoice.** The owner picks one and the system sends that format.
- The email address is collected as an **optional, never mandatory** field at checkout. Its exact placement is a UI decision settled elsewhere.

### B2.6 File naming and versions
**Locked, owner's instruction.**
- The blueprint file is **`EXTAS-ECOMMERCE-V1.md`** — "EXTAS E-commerce .md file, Version 1".
- Everything decided up to now goes into **Version 1**.
- UI/UX audit results and anything that comes after go into **Version 2**; later changes into **Version 3**, and so on.
- It stays **one file that travels with the project**. The version number moves forward inside it; a new version does not mean a new file.
- The version number, the date and the change log sit at the top of the file.

### B2.7 Open — needs the owner's decision
5. **WhatsApp invoice default format:** should the system send the invoice as a **PDF file** or as a **JPG image** out of the box? (He can change it later; the build needs a starting value.)

---

## B3. Payments and money

### B3.1 Cash on Delivery
- COD is the primary method. The COD amount to collect is printed prominently on the courier sticker (B1.4).
- Exchange price differences and exchange delivery charges are collected as COD (B1.8).
- COD fraud is managed by the fraud engine (B6.4), and the decisive action for a high-risk order is an **advance delivery charge by bKash** rather than a refusal.

### B3.2 bKash
- Used for the **advance delivery charge on high-risk orders** — the most effective single fraud filter available.
- Used for the **payment link sent in chat** when the support fraud gate turns red (B4.6).
- A **named, dated payment campaign** (for example a bKash cashback with its end date) can be shown inside the checkout. It is driven by Smart Rules, so the owner sets it without code and it expires itself. **Locked** (adopted from the Fabrilife teardown).

### B3.3 Nagad
Nagad is offered as a payment option and its icon appears in the footer. This is already one of the places the demo is ahead of the competition and must not be traded away.

### B3.4 Card
Card payment runs through a gateway. **Card data is never stored by the shop — the gateway holds it.** Gateway fees are recorded automatically in the cost ledger (B3.7).

### B3.5 The wallet
- The wallet holds store credit on the customer record, so it already works at the counter as well as online.
- Credit sources: an exchange where the new item costs less (B1.8), and offers the owner issues.
- Wallet credit from an exchange **posts only after the old item has passed check**.
- The wallet is visible in My account and in the "For you" offers area.

### B3.6 Refunds
- **No refunds after receipt.** Exchange is the only post-delivery route (B1.9).
- The one refund path is cancellation at the defective-at-packing stage, before dispatch.
- Refund wording is a Smart Rules field, not code.

### B3.7 The accounting boundary with the ERP — ownership line
**Locked. This is the rule that stops the two systems arguing.**

| Owned by the ERP | Owned by the shop |
|---|---|
| Cost price and base retail price | Sale price, compare-at price |
| Double-entry books: `ExpenseHead`, `Expense`, `BankAccount`, `LedgerAccount` | Campaign discounts, coupons, combo prices, landing-page prices |
| Stock counting and reconciliation | What the customer actually pays |
| Journals and the monthly close | Operational cost capture as it happens |

Every shop-side price passes a **margin guard** against the ERP cost. A price below the floor needs the owner's explicit override.

### B3.8 Retail expenses
**Locked.** The books stay in the ERP, but the shop generates its own costs automatically and typing them twice is how numbers stop matching.

- The shop records every system cost automatically as it happens.
- A **Retail expenses** screen in the shop takes the owner's own quick entries: packaging, salary share, office, miscellaneous.
- **At month end the shop pushes one expense document per service per month to the ERP**, which posts its own journals. Nothing is typed twice, the ERP stays master, and the owner can enter a retail expense wherever he happens to be.

### B3.9 Cost ledger — core, must not be forgotten
**Locked.**
- Every paid call writes a **cost row**: service (AI / SMS / WhatsApp / maps / gateway / courier), amount in ৳, what it was for (order id or job id), model or template used, date and time.
- Prepaid balances (SMS credit top-ups) are held as a prepaid balance and drawn down, so the dashboard always shows credit remaining.
- A **Costs section** the owner asked for separately: by day, month and year; by service; by module; one click to any period; export. It shows spend against the AI 360 caps.
- **Per-order cost allocation** feeds the existing per-order profit figure (PR-179): product cost from the ERP + courier + gateway + packaging + allocated AI/SMS + allocated ad spend.
- **Month-end close sheet** — one page: total per service, what was pushed to the ERP, what is still unposted, differences flagged. This is the sheet that makes the month tally.

### B3.10 Money reporting
**Locked.** One page shows total ad spend this month across Meta, Google, YouTube and TikTok, set against sales attributed to ads, against organic and other channels, with delivered revenue, returns, and profit or loss per channel. Plus **sales by district and thana, and by area inside Dhaka**, as a table and a map, with the return rate per area — which also feeds courier choice.

### B3.11 Open — needs the owner's decision
6. **Card gateway:** which gateway should the build integrate for card payments (for example SSLCommerz, or another he already has an account with)?
7. **Margin floor:** what minimum margin percentage should the margin guard enforce against the ERP cost before it demands an override?

---

## B4. Support module — S22 · Support (all-in-one)

Support is **not** a feature inside CRM. It is its own module, built on top of the existing PR-157 (WhatsApp API), PR-160 (live chat) and PR-161 (unified inbox). The owner's words: *"this is an all-in-one, all-solution support system."*

### B4.1 Wording — enforced everywhere in the build and the UI
**Locked.**
- **"AI agent" means EXTAS AI only.** It is never used for a person.
- **"Employee" (কর্মচারী) means the human on the support desk.** A person is never called an agent.
- The owner's target: **EXTAS AI handles about 95% of support by itself; employees handle only the roughly 5% that is complicated.**

### B4.2 Channels and inbox
**Locked.**
- **Facebook Messenger** — page messages and replies.
- **WhatsApp** — messages and replies.
- **Website live chat** — the customer writes straight from the site.
- **Support Inbox:** every channel in one dashboard.

**How WhatsApp reaches the site:** WhatsApp Business Platform / Cloud API — (1) the customer messages the WhatsApp number, (2) WhatsApp's webhook posts the message to our server, (3) the server attaches it to that customer's identity and conversation and shows it in the Support Inbox, (4) the employee replies from the website and it goes back out over WhatsApp.

### B4.3 The WhatsApp number
**Locked.**
- A **new business SIM used only here**, registered on the WhatsApp Business Platform (Cloud API). The number then lives on the API and **cannot be logged into the WhatsApp or WhatsApp Business app at all** — which is exactly what the owner wants.
- **No calls on WhatsApp. Text only.** Meta's calling feature stays switched off so customers cannot ring that number. Calls go to the separate hotline number only. This is consistent with the standing decision: WhatsApp text button everywhere, no call buttons.
- Any message to that business number from anywhere — including the WhatsApp button inside the customer dashboard — lands in the Support Inbox. One number, one inbox.

### B4.4 Tickets and who is responsible
**Locked.**
- Ticket management: what is solved, what is pending, who is responsible.
- Status, owner, **SLA timers**, resolution time, notifications.
- **Who replied is recorded.** Every reply carries the employee's name, or **"EXTAS AI"** when the AI answered. Visible in the thread and in reports.
- Assign a conversation to an employee.
- Notification on a new message.
- Conversation history and resolution time stored.
- Internal notes on a thread, invisible to the customer.

### B4.5 Order context beside the conversation
**Locked.**
- The customer's **order number and order status** are shown beside the conversation.
- **Instant customer scan on every incoming message.** A WhatsApp message arrives → the system immediately takes that number and checks our own server: has this number ordered before, how many orders, how many delivered, how many returned, is there a pending or in-transit order right now. The result appears in a side panel or popup next to the conversation. Clicking it opens what was ordered and where that order is now. The same applies to Messenger and website chat.
- The context panel carries: order count, delivered/returned ratio, fraud score, live order status, and a click-through to the order.
- **Customer history is always visible** on one side of the conversation.

**Messenger phone numbers:** take the number from the Facebook profile where the API allows it. Otherwise, the moment the customer types a phone number in the chat, grab it from the text and run the same scan. Whenever a number appears in a chat, the history and fraud check run instantly and show on the side.

**Identity resolution:** phone ↔ PSID ↔ customer matching, phone captured from chat text, one person merged across channels as far as is possible.

### B4.6 Selling from the chat
**Locked.**

- **Catalogue drawer in the composer.** The employee taps a button (or types `/`) → searches by name, SKU or colour → picks colour and size → one tap sends a card: two or three photos, the name, the price, and a short link such as `extas.com/p/pique-polo?c=navy&s=L&r=chat8312`.
- **The `r=` reference is the whole trick.** It ties the click to this conversation and this employee, so if the customer buys from the link the order is automatically credited to the chat and to the employee. No manual tagging, and the employee's conversion rate becomes a real number.
- **Mini-cart in the side panel.** The employee drops products into a small cart beside the conversation. Combo prices apply automatically, exactly as on the site. Then **Create order** fills name, phone and address from the customer record (or from what was typed in the chat), runs the stock and fraud checks, and creates the order with source = WhatsApp / Messenger / Live chat.
- **Fraud gate on the button.** Green → the button creates a COD order. Red → the button changes to **Take advance** and sends a bKash payment link in the chat instead of creating a COD order. **The rule decides, not the employee's mood.**
- **One-click order from the chat.** If the history is good, the employee or EXTAS AI turns the conversation into a real order in one click and it lands straight in the Orders section. If the history is bad, the order is refused or cancelled there. Both the AI and the human use the same panel.
- **Send products inside the chat:** search the catalogue from the chat, send the product's photos, send the product link so the customer can order straight away. Images and video must be sendable both ways.
- **Order source filtering.** Orders created from the support system are tagged with their channel. The order list can be filtered by "from support" and then by Messenger / WhatsApp / live chat. Website and ad-driven orders keep their normal analytics and attribution unchanged.
- **Block a bad customer** from inside the support screen.

### B4.7 EXTAS AI inside support
**Locked.**
- The AI answers common questions, looks up order information, and **drafts answers for all questions**, handing over to a human when needed.
- It answers from Smart Rules, the manual and order data, with defined handover rules.
- **AI follow-up and conversion:** messages that did not become orders get AI follow-up later, offers and conversion attempts — a proper system, not ad-hoc. All of it is rule-capped.
- **The AI uses the same panel as the employee.** It proposes the cart and the order; a human taps approve. Nothing separate is built for the AI.

### B4.8 Media in conversations
**Locked.**
- Meta does **not** keep media for us. A WhatsApp media URL expires and Messenger attachment links are temporary, so anything we do not copy is gone. Therefore **every photo, video, document and voice note is downloaded to our own storage the moment it arrives**, and the conversation always shows our copy.
- **Storage target is the owner's Google Drive** (approved direction), not the VPS disk. A service account writes each file into a dated folder in his Drive. The server keeps only a small thumbnail and the Drive file id, so the VPS disk stays small and the files remain the owner's property. If Drive is down the file queues and uploads later; the chat text is never blocked by it.
- **Retention:** photos kept a long time — default **2 years**, editable in Smart Rules, because without the photo an old conversation makes no sense. Videos kept short — default **90 days**, after which the video is removed and the message keeps a note saying a video was sent on that date. **Text, who said what, and order links are kept for ever.**

### B4.9 Voice messages
**Locked.**
- **Incoming: yes.** Bangladeshi customers send voice notes constantly and refusing them loses orders. The voice note is saved like any other media, and **EXTAS AI transcribes it to Bengali text under the player**, so the employee reads it in five seconds instead of listening for a minute. Transcription is an AI feature with a fallback: AI off → the player still works, no text.
- **Outgoing: no voice by default.** Typed replies only, so everything is searchable, auditable and on-brand. One owner-switchable exception: a short pre-recorded clip (for example a size-measuring explanation) may be sent as a file.

### B4.10 Facebook page and Meta compliance
**Locked. This is a build requirement, not a preference.**
- Messages stay visible in the Facebook Page inbox and Meta Business Suite as well. Connecting our app does not hide or delete them. Both sides show the same thread, and our app can be set as the primary handler so two people do not reply at once.
- Meta's rules are respected by design: replies only inside the allowed window, approved message templates outside it, no unsolicited promotional blasts, customer consent recorded, data handled per Meta's platform terms.
- **The page must never be put at risk by our support system.**

### B4.11 The separate support app
**Locked.** The support system must be installable on its own, like Messenger: an icon on **Android, iOS and desktop** that opens **only** the support system, with push notifications. Employees must not have to open Messenger, WhatsApp and the website separately, and must not have to walk through the website admin to reach support. Built as a support PWA with a support-only shell.

### B4.12 Privacy and permissions inside support
**Locked.** Customer privacy is protected with employee-level permissions: a block list, per-employee permissions, and controls on what customer data each employee can see inside support.

### B4.13 Support analytics
**Locked.** Per employee, per channel, chat → order conversion, first-response time and resolution time.

### B4.14 The 12 PRs of S22
| # | PR |
|---|---|
| 1 | Support core: conversation/message model, threads, attachments (image, video), internal notes, employee assignment, who-replied log |
| 2 | Channel connectors: Messenger Page API, WhatsApp Business API webhook in and out, website live-chat widget |
| 3 | Identity resolution: phone ↔ PSID ↔ customer matching, phone captured from chat text, merge one person across channels |
| 4 | Customer context panel: order count, delivered/returned ratio, fraud score, live order status, click-through to the order |
| 5 | Catalogue drawer: search, send photos, send tracked product link with the `r=` reference |
| 6 | Mini-cart and one-click order creation with channel tag, stock check and fraud gate |
| 7 | Ticketing: status, owner, SLA timers, resolution time, notifications |
| 8 | AI support agent: answers from Smart Rules, the manual and order data; drafts; handover rules |
| 9 | AI follow-up and conversion: no-order follow-up, offers, win-back, all rule-capped |
| 10 | Block list, employee permissions, customer data privacy inside support |
| 11 | Support PWA: installable icon on Android, iOS and desktop, support-only shell, push notifications |
| 12 | Support analytics: per employee, per channel, chat → order conversion, first-response and resolution time |

Media-to-Drive (B4.8) and voice transcription (B4.9) fold into these twelve and add no extra count.

### B4.15 How support connects to AI 360
Support is one of the agents controlled from **AI 360 · Control Room** (S15, renamed and reorganised from "AI agent core"). The connection points that belong to support:

- The **AI 360 home screen** lists every agent including the support agent: what it is doing right now, which company and model it is on, what it has spent today and this month, with **one-tap pause per agent**.
- **Master switch and per-feature "keep on when AI is off."** With AI off, support still works: the customer chat falls back to the team inbox plus an auto-reply template, and the inbox, tickets, assignment, order context and order creation all keep running as normal rule-based features.
- **Multi-provider and per-agent control:** choose the company (Anthropic, OpenAI, Google, OpenRouter, local) and model per agent, with a schedule, a spend cap, a per-run override and cost-saver mode.
- **Budget controller:** a monthly ceiling for AI, SMS and WhatsApp with a live usage graph and an 80% warning. At 100% non-essential AI pauses **while orders and support keep running**.
- **Grounded answers:** the support AI answers from the knowledge base built over the manual, policies, the live catalogue, stock, delivery zones, FAQs and solved tickets. It must be grounded and must say *"I don't know"* rather than invent.
- **Training panel:** the owner's own instructions, corrections that become examples, extra documents, forbidden topics, a sandbox test before going live, version history and rollback.
- **Ticket updates are pushed to the customer's tracking page** (PR-172).
- **Telegram full control:** the owner runs the business from Telegram — orders, courier, stock, combos, campaigns, ads, reports and free questions — with whitelisted IDs, pairing, confirm buttons on destructive actions and a full audit trail.
- **Skill tests in CI** so a model change cannot quietly make support worse.
- **The owner's bug/question box** inside AI 360: he describes a problem in plain Bengali, the AI investigates, explains the cause, proposes a fix and asks approval. This ties into S21 Site Health & Audit.

**The human-free goal, recorded:** employees should only do the physical work — print stickers, pack, hand over to the courier. Everything inside the website from order arrival to courier entry, checking, updating and reporting is EXTAS AI's job.

### B4.16 Open — needs the owner's decision
8. **The support dashboard reference screenshot** at `https://prnt.sc/X5UEB8g1Hmt0` could not be read by the tool. Please attach the image itself before the support dashboard is designed — Claude is designing a custom dashboard, not a copy, but it needs to see what he liked.
9. **Support SLA targets:** what first-response time and what resolution time should the SLA timers count against — for example 15 minutes first response during business hours?
10. **Support hours:** what hours are employees on the desk, so EXTAS AI knows when to say "an employee will reply in the morning" rather than promising an immediate handover?

---

## B5. Customers and CRM

### B5.1 The Customers section
**Locked.** A **Customers** menu of its own: a searchable list showing name, phone, email, WhatsApp number, address, district, first source, orders, delivered, returned, lifetime value and tags.

### B5.2 Filters and segments
**Locked.** District / thana / city area · VIP · fraud-flagged · repeat versus one-time · channel of first contact · date range · order value band · size bought · category bought · consent status.

**Gender is shown only where it is actually known.** An inferred guess is displayed as a guess, never as a fact.

### B5.3 The customer journey view
**Locked.** Click a name and see the whole journey: how they first arrived (campaign, keyword, chat), every visit source, every order and its outcome, exchanges, chats, reviews, wallet and notes.

### B5.4 Export
**Locked.** One-click export of any filtered set as CSV or ZIP, for campaigns, audiences or record-keeping.

### B5.5 One customer record, keyed by phone
Website, Messenger, WhatsApp and phone orders all share **one** customer record keyed by phone. This is what makes duplicate-order detection (B1.12) and the support identity resolution (B4.5) work across channels.

### B5.6 What the shop keeps and for how long
| Data | Retention |
|---|---|
| Chat text, who said what, order links | For ever |
| Chat photos | Default 2 years, editable in Smart Rules |
| Chat videos | Default 90 days, then removed; the message keeps a note that a video was sent on that date |
| Order history, lifecycle and audit log | Append-only, kept |
| Card data | **Never stored.** The gateways hold it |
| Site Health & Audit reports | Kept for comparison over time |
| Competitor teardown reports | Saved and comparable over time |

### B5.7 Consent
Marketing consent is recorded per customer and is a filter in the Customers list. Campaign sending (SMS, email, WhatsApp) respects the consent record, and WhatsApp bulk additionally needs Meta-approved templates while SMS needs the masking sender ID.

### B5.8 Open — needs the owner's decision
11. **Inactive customer retention:** how long should a customer's personal details (phone, address, email) be kept after their last order — for ever, or deleted after a set number of years?

---

## B6. Data, security and compliance

### B6.1 Security — taken seriously from the first commit
**Locked.**

Already planned and confirmed: CSRF, CSP and security headers · rate limits · admin 2FA · session timeout · an IP allowlist option · login alerts · encrypted secrets · an append-only audit log · permission checks on **every** action · an independent security review before real money flows.

**Added in round 6:**
- **Cloudflare WAF and DDoS protection.**
- **Bot protection on login and checkout** (invisible — see B6.3).
- **Dependency vulnerability scanning in CI.**
- **Immutable backups**, so an attacker who gets in cannot delete the backups.
- A **device list with "log out everywhere."**
- **Alerts on any new admin login.**
- A written **break-glass restore runbook.**
- **Card data is never stored — the gateways hold it.**

### B6.2 Backup and rebuild
**Locked.** Nightly database and uploads · 14 daily and 8 weekly copies kept · copied off-server · `restore.sh` · a tested restore. **Added:** **Google Drive as a second backup target**, and a true **one-command rebuild** — paste one command on a fresh Azure VPS and it installs everything, pulls the latest backup and restores the whole site.

### B6.3 No CAPTCHA — the owner's decision, and what replaces it
**Locked.**
- **No "I am human" checkbox. No Turnstile. No challenge page** before or after entering the site. The customer clicks and the site opens. **Any earlier mention of Turnstile is cancelled.**
- Bot protection is done **invisibly in the background**: rate limits, behaviour signals, server-side checks, and WAF rules that never show the customer anything.
- If a challenge is ever genuinely unavoidable it is limited to the **admin login only, never the shop**.
- **No pop-up on arrival.** Notices are owner-placed and deliberate, never an automatic welcome pop-up. (The Fabrilife teardown confirmed this decision — see B8.6 item 15.)

### B6.4 Fraud checking
**Locked.** The fraud engine is **not a side feature**. It gets its own scoring service and its own tuning screen with measured accuracy. Thresholds are tuned on real outcomes, not guesses, and the system measures its own accuracy.

Signal layers, in order of value:
1. **Our own history** — the strongest signal over time, and it belongs to us.
2. **Behaviour and device** — form-fill speed, repeat devices, many phones from one IP, bot patterns.
3. **Address clustering** — repeated failures from the same building or lane.
4. **Multi-courier check services** where the owner has access — useful, but third-party and of varying accuracy.
5. **Employee check in the chat** — a quick look at the Facebook profile for the handful of genuinely suspicious orders.
6. **Advance delivery charge by bKash for high-risk orders** — the most effective single filter, and the decisive action.

**Stated honestly for the record:** nothing removes COD fraud. A layered score plus a confirmation step should cut it substantially.

### B6.5 Admin access
**Locked.**
- Admin 2FA, session timeout, optional IP allowlist, login alerts, a device list with "log out everywhere", and an alert on any new admin login.
- **Permission checks on every action**, not only on the page.
- An **append-only audit log** on every change, recording who, when and from where.
- Employee-level permissions inside support govern what customer data each person can see (B4.12).
- An accountant role exists with permission limits, and those limits are tested by the scheduled site audit's accountant journey (B7.3).
- Telegram control uses whitelisted IDs, pairing, confirm buttons on destructive actions and a full audit trail.

### B6.6 Site audit sandbox limits
**Locked.** The scheduled site auditor **may never touch the database, stock, payments, accounting or customer data.** Those are read-only to it. A fix it proposes needs the owner's approval, runs on staging first, is re-tested, and rolls back automatically if anything gets worse.

### B6.7 Open — needs the owner's decision
12. **Admin IP allowlist:** should admin login be restricted to a list of IP addresses from day one, or left open with 2FA only? (An allowlist is safer but locks him out if his connection changes.)

---

## B7. Admin and back-office quality

### B7.1 What the admin audit found clean — do not break it
An agent walked all 8 admin routes at 390 / 768 / 1366 / 1920 px. Full report: `audit-admin.md`.

Clean: **zero console errors, zero page errors, zero horizontal overflow on any admin route at any viewport, and contrast passing everywhere** (lowest 5.58:1).

**The landing-page builder, the orders triage screen and the Smart Rules preview are the strongest parts and must not be touched.**

### B7.2 Blockers and majors — these are build rules, not one-off patches
**Locked.**

**Blockers:**

| # | Rule |
|---|---|
| 1 | A destructive action must **never** look like a harmless one and must **never** run without a confirm. (Demonstrated: "Only M" on an order permanently deleted a line — no confirm, no undo, styled identically to the safe button beside it.) |
| 2 | **Every number field that feeds live customer-facing copy must be validated before it can be published.** (Demonstrated: −5 hours was published to the storefront footer, the product page, the bag, the checkout, SMS and AI answers.) Min and max on every numeric setting, and publish blocked on an invalid value. |

**Majors:**

| # | Rule |
|---|---|
| 3 | No navigation may lose items on a phone. Scrolling tabs must show a fade or an arrow; nothing off-screen and invisible. |
| 4 | **No action may report success when it did not save.** Save status must reflect the actual write. |
| 5 | Status counts must reflect reality. Nothing may report "running" when its provider is not connected. |
| 6 | An output must land somewhere that exists, and nothing is charged for work that went nowhere. |
| 7 | An unknown admin URL stays inside the admin shell with a route back. It never drops the owner onto the storefront. |
| 8 | **"Save as draft" must actually persist.** |
| 9 | One field, one rule — a limit enforced in one place must be enforced everywhere that field is edited. |
| 10 | A confirm step is required on every consequential action: disconnect, deactivate, discard, clear all, start an A/B test. |
| 11 | Tap targets: the **44 × 44** minimum applies to the admin too — switches, small link buttons, chips, remove icons. |

### B7.3 Site Health & Audit — the operations side
**Locked.** The owner's words: *"this is more important, it must never be missed."*

Server Health is extended into **Site Health & Audit**. The owner sets the schedule — hourly, daily, weekly or manual, on or off. Each run replays saved browser journeys:

| Journey | What it walks |
|---|---|
| **Customer** | home → category → product → size/colour → search → bag → checkout → order placed → invoice → tracking |
| **Admin** | login, products, orders, stock, processing, reports |
| **Accountant** | payments, invoices, financial reports, permission limits |
| **Warehouse** | stock view, picking list, shortage, defective report, packing |

Plus UI checks at several phone and desktop widths (cut text, broken layout, overflow, images not loading, buttons unreachable) and the speed checks already in place.

**These journeys are plain Playwright scripts, so they work with AI off.** AI only writes the summary, guesses the cause and proposes a fix.

Every run is stored with the date, what passed, what failed, severity, page, how to reproduce, the suggested fix, and whether a fix was applied. Old reports are kept for comparison. A fix needs the owner's approval, runs on staging first, re-tests, and rolls back automatically if anything gets worse. The auditor's sandbox limits are in B6.6.

### B7.4 Product publishing — the back-office queue
**Locked.** The ERP holds only style, colour, size, SKU and stock. The shop turns that into a sellable product.

- A new style created in the ERP appears automatically in the shop's **"Ready to publish"** queue.
- The owner opens it and adds what the ERP does not have: images and video, category and sub-category, name and description, size chart, template, SEO, the combos it belongs to, tags.
- **A publish checklist blocks a half-done product**: images present and standardised, size chart attached, price set, SEO filled, at least one category. Red ticks until it is ready.
- Bulk publish for a whole batch, and an **unpublish that keeps the page alive as out-of-stock** (ghost archive, PR-124).
- Stock then flows ERP → shop continuously. **The owner never re-enters stock.**

### B7.5 The user manual
**Locked, upgraded to the owner's specification.** A proper book: **every menu, module, section and button with What it is, Why it exists, How to use it.** Written in plain Bengali with screenshots, searchable, reachable from a help button on every dashboard screen, regenerated automatically when the UI changes, and fed into the AI so staff can simply ask.

### B7.6 Operational monitoring already in place
Lighthouse CI gate (PR-033) · uptime, queue and error monitoring (PR-207) · the one-button optimisation panel (PR-208) · the Server Health budget with a Telegram alert and AI Diagnose · the daily business report at 22:00 to Telegram and email plus `/report` on demand · the weekly deeper audit.

### B7.7 A standing way of working
**"Check what exists before rebuilding."** This is already how the project runs and it stays a rule for every PR.

### B7.8 Open — needs the owner's decision
13. **Audit schedule:** how often should Site Health & Audit run by default — hourly, daily or weekly? (He can change it afterwards; the build needs a starting value.)

---

## B8. Competitor Teardown agent

**Locked.** The owner asked whether an agent can visit a competitor's site by link, walk the product page and checkout, come back and brief Claude, and then Claude compares it against EXTAS, judges which is better from a customer and conversion point of view, and recommends what to copy, adapt or ignore. The answer is yes, with the limits below.

### B8.1 What the agent does
Opens the site and walks **category → product → variant/size select → add to cart → cart → checkout form**, recording at each step:

- layout and what is above the fold
- how variants and sizes are chosen
- what the gallery does
- trust signals: COD, delivery time, exchange window, reviews
- offers, combos and upsells
- urgency devices
- what the cart does: mini-cart, cross-sell, free-delivery bar
- how many fields the checkout has, in what order, what is required, what validation it gives, which payment and delivery options
- page speed, mobile behaviour, image handling
- SEO markup, titles, schema
- the copy and tone

Screenshots at every step, on phone and desktop.

### B8.2 What it will not do — stated plainly
- **It will not place a real order.** Confirming on someone's live site creates a real order for a real business, with a real COD parcel, a courier booking and a phone call to a real person. The walk stops at the checkout page, **before** the confirm button. This means the thank-you page, the confirmation SMS/email, the tracking page and their customer dashboard are **not** visible this way. If the owner has ordered there himself, his own screenshots fill the gap.
- It will not log in to anyone's account, and will not enter a payment flow.
- Some sites block automated visits. The agent **reports that plainly instead of working around it**; the fallback is screenshots the owner takes.
- It reads at a normal human pace, takes nothing in bulk, and **copies no code and no text**. Ideas and patterns are studied; wording and design are not lifted.

### B8.3 The report it produces
1. **Their journey, step by step**, with screenshots.
2. **A side-by-side table** — their site versus EXTAS, one row per step.
3. **Each difference judged from two angles** — how it feels to a customer, and what it does to conversion. Verdict per row: *they are better · we are better · neither matters.*
4. **A recommendation per item: Pick · Pick with changes · Skip**, each with its reason.
5. **Claude's own view** where neither approach is good, including saying "none of this is worth taking."
6. **A short list of what EXTAS already does better**, so nothing good gets traded away.

### B8.4 It is a permanent dashboard feature, not a one-off
**Competitor Teardown** lives in **AI 360**: paste a link, pick what to compare, get the report. It keeps a saved list of competitors, **re-runs on a schedule**, and **tells the owner when a competitor changes something** — a new offer, a changed checkout, a new delivery promise. Reports are saved and comparable over time.

**Recommendation: track 3 to 5 competitors, not one.** One site's choices may just be that site's mistakes.

**+3 PRs in S15:** journey walker · comparison and report engine · saved competitors, scheduling and change alerts.

### B8.5 Fabrilife teardown — PICK (take these into the build)
No order was placed; the walk stopped at their checkout form. Their scale: Laravel + LiteSpeed, 2,176 products, 156 categories, Algolia search, SSLCommerz, native apps, 8 outlets. Full factual report: `teardown-fabrilife.md`.

| # | Adopt | How ours differs |
|---|---|---|
| 1 | **"Popular searches" suggestion chips** in the search box (T-Shirt, Polo, Hoodie…) | Cheap, and it teaches new customers what the shop sells. **Ours is driven by real search data, not a hand-typed list.** |
| 2 | **Several sizes of one product on one cart line** ("+ Add Size") | A real Bangladeshi buying pattern — three polos of the same style in different sizes for a family. **Ours also carries per-size stock state on the line.** |
| 3 | **A named, dated payment campaign shown inside the checkout** (theirs: bKash 10% cashback with its end date) | **Ours comes from Smart Rules**, so the owner sets it without code and it expires itself. |
| 4 | **A bulk / corporate order enquiry page**, with a phone and email also printed in the cart | The owner already takes buying-house orders, so this is a real line of business, not a copy. |
| 5 | **Per-category meta title templated with the lowest price** — "Men's Polo T-shirt — Starting ৳750" | Raises the click rate from Google at no content cost. |
| 6 | **Policy pages in Bengali**, not only English | — |
| 7 | **Trade licence number published in the footer** | Already a placeholder in the demo; **make it real.** |
| 8 | **A proper full-screen zoom lightbox** with pinch, pan and a reset | Theirs has a zoom-% readout and +/− controls. Ours must be at least this good, because fabric zoom is a stated requirement. |

**PICK WITH A CHANGE:**

9. **Product JSON-LD — yes, but only ratings we actually have.** Theirs declares `aggregateRating 4.7 / 355 reviews` on a page with **no review section at all**. That is unsupported structured data and Google can act on it. **Our rule: schema is generated from real review rows, and emits no rating when there are none.**
10. **High-resolution images for fabric zoom** — the owner requires them, and this is how to have them without the cost: **serve a small modern-format image by default and load the full-resolution file only when the customer opens zoom.** Theirs ships a 3000×3000 JPEG at 357 KB to display it at 330 CSS px, with no `srcset` and an empty `alt`, and another at 801 KB. No WebP or AVIF anywhere on their site.

**SKIP:**

11. Grid / list view toggle on collection pages — clutter, and almost nobody uses it on a phone.
12. Cart quantity dropdown running 1 to 112.
13. Native apps and an app-only discount — a large separate investment; the web store has to work first.
14. Affiliate programme and a client-logo carousel — revisit once there is traffic to affiliate.

### B8.6 Fabrilife teardown — DO NOT COPY (their mistakes)
| # | What they do | Why we refuse it |
|---|---|---|
| 15 | **Entry interstitial** — a full-screen bKash offer blocks the first page of a session | The owner has already banned entry pop-ups. This confirms the decision. |
| 16 | **`user-scalable=no` site-wide** — pinch-zoom disabled everywhere | On a clothing site that stops a customer inspecting the fabric. **We keep real zoom** — and we have already fixed accidental zoom (16px fields, global `touch-action`) **without disabling real zoom.** |
| 17 | **A strikethrough price and a % off badge on every single product, all the time** | That is a discount-brand playbook. It is the opposite of the premium, classy positioning EXTAS is going for, and permanent discounts stop reading as discounts. **No always-on strikethrough price.** Discounts are shown when a real, dated campaign is running — see PICK item 3. |
| 18 | **A pre-ticked terms checkbox** | Weak consent, and it hides the returns rule the customer most needs to read. Ours is unticked and the rule is stated in plain words at the point of commitment. |
| 19 | **No colour selection — each colour is a separate product URL** | Part of why they have 2,176 products. It splits the SEO value of one style across many near-identical pages and makes the customer hunt. **Ours keeps one product with colour selection.** |
| 20 | **Checkout with no validation at all** — junk typed into name, email and phone produced no message of any kind | Ours has live validation with plain-language messages and a CTA that says what is missing. |

### B8.7 Their two open flanks — where EXTAS wins
**Speed.** Measured at 390 × 844: LCP **13.7 s** on the homepage, **11.9 s** on a category page, **11.3 s** on a product page. Homepage 2.87 MB over 156 requests; the cart page 5.66 MB; the desktop homepage **13.45 MB**. Five of their own CSS/JS files are served with the wrong content type and refused by the browser on every load, and seven page loads returned HTTP 502 during the walk.

**Target for EXTAS: LCP under 2.5 s on a 4G phone, enforced in CI.** This is the single largest gap available and it is exactly the owner's "super fast site" principle paying off.

**SEO.** They have no `<h1>` or `<h2>` on the homepage, category pages or product pages. No canonical, no hreflang, no `sitemap.xml`, **no blog**, and no on-page copy on category pages. A competitor this large with no content programme is an open door for the owner's 50%-organic goal.

### B8.8 Where EXTAS is already ahead — do not trade any of this away
Multi-image gallery with labelled views including True colour · the model's height/weight/size chip · colour selection with the colour described in words · Find my size · the fit-from-reviews bar · the stock and cut-off message · delivery charge, time and free-delivery threshold stated on the product page · real on-page reviews with verified buyers' height, weight and size · on-page Q&A · WhatsApp as a named channel with hours, including "send my bag on WhatsApp" · the free-delivery progress line · save for later · sets and combos with automatic pricing and tier building · Order Now skipping the bag · the stepped checkout · live validation with plain-language messages · a CTA that says what is missing · delivery zone inferred from the typed address instead of a 72-option dropdown · the door-refusal rule and the returns rule stated in plain words at the point of commitment · Nagad · payment icons in the footer · filter chips and sort · breadcrumbs and real H1s · the EN/বাং toggle · the promo strip carrying the two decisive facts.

### B8.9 PR impact
**+4 PRs:** popular-search chips from real search data (1) · multi-size on one cart line (1) · the Smart-Rules-driven payment campaign slot in checkout (1) · the bulk / corporate order enquiry page (1).

Folded into existing PRs at no extra count: the category meta template with the lowest price · Bengali policy pages · progressive zoom image loading · schema emitted only from real reviews · the LCP budget in CI.

### B8.10 Open — needs the owner's decision
14. **Which competitors to track:** Fabrilife is done. Which 2 to 4 other Bangladeshi menswear sites should go on the saved list, and how often should the teardown re-run — weekly or monthly?
15. **Trade licence number:** please give the real trade licence number to print in the footer (PICK item 7), since the demo currently carries a placeholder.

---

# Part C · AI, marketing and imagery

## C1 · AI 360 Control Room (S15)

**Status: Locked.** Sections 12–20 of the decision record were locked by the owner on 2026-10-17; nothing in this
section is to be re-opened or re-asked. It goes into the build exactly as written.

### C1.1 What AI 360 is

AI 360 is the **control room** for every piece of AI in the business. Individual AI engines live in their own stages
(the site auditor is S21, the photoshoot engine is S24, the social studio is S23, and so on), but **the control of
every one of them is in AI 360**.

The governing rule, set when the site-audit placement was corrected:

> **The engine may live in its own stage, but every AI switch and report appears in AI 360.**

So the owner never hunts through the dashboard to find out what the AI is doing, what it costs, or how to stop it.
One screen answers all of it, for the whole business — text, images, video, support, marketing, audits.

### C1.2 The AI 360 home screen

The home screen lists, for every agent at once:

- what the agent is doing right now;
- which **company (provider) and which model** it is using;
- **today's spend and this month's spend** for that agent;
- a **pause button on each agent**, so one agent can be stopped without stopping the rest.

### C1.3 The master switch, per-agent switches and keep-on behaviour

- There is a **master AI switch** for the whole business.
- Every agent also has its own switch.
- **Keep-on behaviour:** an individual agent can be left **running even when the master switch is off**. This was
  confirmed explicitly for the Photoshoot agent — "the owner can leave the Photoshoot agent running even with the AI
  master switch off, **as with any agent**" — so keep-on is a property of every agent, not a special case.

### C1.4 The AI-off principle (deterministic core first)

**AI is additive. The shop runs without it.** This is a build rule, not a preference:

- Every AI-driven step has a **rule-based or template-based fallback** that runs when AI is off. Marketing is the worked
  example: AI chooses the audience, writes the copy, picks the timing and sets the discount — but **with AI off, saved
  templates and fixed rules still run** and the campaign still goes out.
- The same applies to incomplete-order follow-up: AI off → saved templates and fixed rules still run.
- Same for the photoshoot module: when the Photoshoot agent's monthly cap is reached, **new generations pause while
  everything already approved stays live and the shop keeps running normally.**

Build consequence: the deterministic path is implemented and tested first in every feature; the AI path is layered on
top of it and can be switched off at any time without breaking the feature.

### C1.5 Multi-provider and per-agent model choice

- AI providers are handled through an **adapter pattern**, the same mock → sandbox → live pattern used for payments and
  couriers, with **two or three providers behind one interface**, so the owner can switch on price or quality without a
  rebuild.
- **Everything is dynamic** — provider/company, which AI package or model is used, the quality tier, and the settings
  behind them. Nothing is hard-coded.
- **Model choice is per agent and per job**, changed from the AI Cost Book row itself (see C2), with no hunting
  through settings screens.
- **Image and video model choice lives on the same AI 360 screen as the text models.** One place answers "which company,
  which package, for which job" for the entire business.
- **Recommendation notes:** Claude's choice is always the default. When the owner changes a setting, an inline note
  immediately explains the effect — "this is the best setting for the output you want", or "this change is fine too —
  slightly lower cost, no visible quality loss". The system guides instead of silently obeying, so **the owner cannot
  make a silent mistake.**
- **Verify provider model names, parameters, pricing, rate limits, retention and commercial terms from the official
  documentation at implementation time.** No figure written in this blueprint is to be trusted as current.
- **Free / OpenRouter-style models are a hard no in production.**

### C1.6 Schedules and spend caps

- Every AI job and every scheduled run (including the S21 multi-angle site audit) has its **schedule, its on/off switch
  and its reports inside AI 360**.
- **Every agent has its own monthly spend cap.** Worked example, the Photoshoot agent: at **80% of the cap a Telegram
  warning** goes out; at **100% new generations pause**, already-approved output stays live, and the shop is unaffected.
- A **hard spend cap is shown and enforced before any batch runs** (product count, views, tier, estimate, retry buffer,
  cap).
- All spend, from every agent, writes to **one `ai_usage_ledger`**, which feeds the Costs section, the month-end close
  sheet and the ERP push. **Photoshoot cost is not a separate pot of money.**

### C1.7 The rest of the AI 360 screens

| Screen | What it does |
|---|---|
| **Owner's bug/question box** | The owner writes a problem or question in plain Bengali. The AI investigates, explains the cause, proposes the fix and asks for approval. Ties into S21 (site audit). |
| **Skill library** | Replaces and absorbs the old "training panel". Each skill is a card: name, purpose, which agent uses it, on/off. |
| **Import a skill from outside** | The owner pastes a document, a link or an instruction set and says "learn this". The AI converts it into a skill and **shows what it understood**. Sandbox test before it goes live, one-click rollback, and corrections become training examples. |
| **Permission matrix** | Per agent, what it may touch: orders, stock, prices, courier, money, customer data, code. |
| **Approval queue** | Everything the AI wants to do but needs permission for collects in **one queue the owner clears in one pass**. |
| **AI diary** | A plain-Bengali log of everything the AI did today, written for the owner — not a technical log. It includes the day's photoshoot activity. |
| **AI Cost Book** | See C2. |

### C1.8 Continuous skill training (standing requirement)

The agents are not static. The skill library is the training mechanism and it runs continuously:

- the owner (or the AI itself) **imports new skills** from any document, link or instruction set at any time;
- every skill is **sandbox-tested before it goes live**, and can be **rolled back in one click**;
- **every correction the owner makes becomes a training example** for the agent that made the mistake;
- the Analyst agent **tells the other agents what worked and what did not** (C3), so the whole team improves from
  measured results;
- the incomplete-order loop and the marketing loop explicitly **learn from what converted and adjust**;
- the AI Cost Book's estimate-vs-actual loop (C2) is the same principle applied to money — the system corrects its own
  numbers from real usage.

---

## C2 · AI Cost Book and the cost calculator

**Status: Locked** (approved 2026-10-17, inside the locked 12–20 block).

### C2.1 The question it answers

A page inside AI 360 that answers, **before any money is spent**: *what does each AI job cost, and which model should it
use?* Every AI job in the whole website is listed, point by point, each with Claude's recommendation and an estimated
cost, **searchable**, so the owner can look up "image generation" or "support reply" whenever he wonders.

### C2.2 Shape of the book

One searchable table. Realistically **60–90 job types**, not 250, grouped by section: **Support · Orders · Marketing ·
Social · SEO & blog · Site audit · Reports · Admin helpers**, plus a row for **every photoshoot and video sub-job**
(ghost mannequin, try-on, detail re-projection, upscale, finishing, detail finder, quality scoring, image-to-video,
reel assembly).

Each row shows:

| Column | Content |
|---|---|
| **Job** | e.g. "write one blog article", "reply to one support message", "transcribe one voice note", "parse one address", "write one reel caption", "build one reel", "generate one product description", "daily report", "fraud judgement" |
| **What it does** | One plain line |
| **Recommended model and why** | Small/cheap model for simple classification and parsing; mid model for writing; large model only where real reasoning is needed. **The recommendation is the point of the page, not decoration.** |
| **Estimated cost per run** | In ৳ |
| **Typical runs per day / month** | Giving an estimated monthly cost |
| **Alternatives** | The same job on other companies' models, with their costs, so quality can be traded against price |
| **Model selector** | Change the model **in the row** — it takes effect immediately. No hunting through settings. |

### C2.3 What makes it self-correcting

- **Estimate vs actual, side by side.** Before launch the estimate comes from a **measured sample run of each job on
  staging**. After launch the **real token usage is recorded per job type** and the "actual" column fills in. The book
  corrects itself and stops being a guess; the owner sees where reality beat or broke the estimate.
- **"What if" slider.** "If I post 3 times a day instead of 1" → the monthly total updates live. Same for articles per
  week, support volume, order volume.
- **Three one-click presets — Economy / Balanced / Premium.** Each sets the model for every job at once and shows the
  new monthly total and what quality changes. This is how a non-technical owner controls cost without studying model
  names.
- **Top-10 most expensive jobs always visible**, because that is where savings actually are.
- **Daily report line:** today's AI spend broken down by job type, feeding the daily report and the AI 360 budget caps.
- **Provider price table is editable and refreshable**, because model prices change; a price change updates every
  estimate in the book.

### C2.4 Honest notes printed on the page itself

- Text jobs are cheap. **Image generation is far more expensive. Video assembly costs server time rather than tokens.**
  Voice transcription is cheap. The page states this plainly so the owner's intuition is right.
- Estimates carry a **±10–15% band at first, tightening to a few percent once real usage data arrives.** Claiming 1–3%
  accuracy before any usage exists would be dishonest, and the page does not claim it.

### C2.5 The free-form cost calculator

Beside the per-job table sits a **calculator the owner drives in his own words**: he describes a piece of work and gets
a cost before committing.

It must answer questions like:

- "10 blog posts, about 1,200 words each, 3 images each, on this model — what will it cost?"
- "20 reels generated this month — what will it cost?"
- "1,000 customer support conversations this month — what will it cost?"
- "Product descriptions for 300 new SKUs"
- "Rewrite the SEO text for the whole catalogue"
- "20 products × 5 colours × 3 images at best-of-2 — what will it cost?" (photoshoot questions are answered directly)

Behaviour:

- **Fields adapt to the job type chosen** — words and images for an article; length and clips for a video; messages per
  conversation for support; number of SKUs for descriptions.
- **Output:** cost per unit, total, **the same total on 2–3 alternative models side by side**, and a one-line
  recommendation ("this job does not need the big model; the mid model saves 70% with no visible difference").
- **"Save as plan"**: the estimate is kept, and when the work actually runs the real cost is compared against it, so the
  owner sees whether the estimate held. This feeds the same learning loop as C2.3.
- **Reachable from Telegram** — the owner asks the question in plain Bengali and gets the estimate back.

### C2.6 Caps (summary)

- Per-agent monthly cap, set in AI 360. 80% → Telegram warning. 100% → that agent's new work pauses; approved work stays
  live; the shop is unaffected.
- Hard spend cap shown and enforced before any batch job runs, with the retry buffer included in the estimate.
- One shared `ai_usage_ledger` for every AI spend in the business → Costs section → month-end close → ERP push.
- **Idempotency key per logical request** and duplicate-job protection, so nothing is ever charged twice.
- **Approved output is reused** rather than regenerated, unless the source image, the model, the settings or the
  provider version changed.
- For images, the headline metric is **cost per APPROVED image, not per generated image**.

### Open — needs the owner's decision (C2)

1. **Data-class routing:** which classes of our data may be sent to which classes of model? For example — may full
   customer names, phone numbers and addresses be sent to an external model for support replies and address parsing, or
   should they be masked first and only the order text sent? A one-sentence answer ("mask personal data before it leaves
   the system" / "send it as-is to approved providers only") is enough to build the rule from. No rule for this was
   recorded in the approved decisions.

---

## C3 · The agents and their jobs

**Status: Locked** (the agent team was approved on 2026-10-17 inside the locked block).

Every agent is defined in the **AI 360 skill library** with a named role, its own skills, its own permissions and its
own target. The owner's instruction on how the roles are written: the marketing and SEO agents are defined as **"a
PhD-level digital marketing specialist with large-scale e-commerce experience"** — **an operator with a target, not a
text generator.** It owns its channel, sets its own experiments within the owner's rules, and reports results.

### C3.1 The team

| # | Agent | What it does | What it may decide alone | What needs the owner |
|---|---|---|---|---|
| 1 | **Head of Growth** (PhD-level digital marketing specialist, large e-commerce experience) | Owns the sales target. Sets the channel mix and the budget split, reads **delivered ROAS**, directs the other agents. | Channel mix and experiments inside the owner's rules and budget. | Any move outside the budget or the permission matrix. |
| 2 | **Social content agent** | Plans the content calendar, picks which products to post, writes hooks and captions in the Bangladeshi mix of Bangla and English that actually performs locally. | Calendar, product selection, copy — within the per-platform rules. | Publishing, where the platform is set to "require approval"; anything needing trending audio (lands in drafts). |
| 3 | **Creative agent** | Assembles reels and image posts from the product library using the brand templates. | Template choice, assembly, variants. | Publishing; new brand templates. |
| 4 | **SEO & blog agent** | Topical clusters, articles, schema, answer-engine work. | Cluster plan, article drafts, internal linking, schema. | Publishing is subject to the mandatory quality gates. |
| 5 | **Performance agent** | Ad campaigns, audiences, budget moves, alerts. | Within the permission matrix only. | Budget moves and campaign changes outside the matrix. |
| 6 | **Community agent** | Reads comments and DMs on Facebook, Instagram and TikTok and **routes them into the Support Inbox**, so a comment asking "price?" becomes a conversation and then an order. | Routing and classification. | Replies that commit the business (price change, refund, exception). |
| 7 | **Analyst agent** | Measures everything, reports to the owner, and **tells the other agents what worked and what did not**. | Measurement and reporting. | — |
| 8 | **AI growth agent** | Watches **delivered ROAS by campaign, product and district**; proposes budget moves, audiences to build and creatives to refresh; writes the copy; **flags a campaign spending with no delivered orders**. | Proposals, copy, analysis. | **Executes only what the owner approves, or what the permission matrix allows.** |
| 9 | **EXTAS AI (support and incomplete orders)** | Runs the incomplete-order recovery loop end to end (see C6.3), and answers support. | Scoring, channel choice, message wording, whether an offer is needed and how much — **margin-checked against ERP cost** — within the two-message ceiling. | Anything outside its permission row. |
| 10 | **Photoshoot agent** (S24/S25) | Registered in AI 360 as a named agent with its **sub-jobs listed separately**: ghost mannequin, try-on, detail re-projection, upscale, finishing, detail finder, quality scoring (plus the video sub-jobs in S25). | Generation inside the approved shot plan, tier and cap. | **Every image. Approval is mandatory and permanent** — nothing publishes unseen. |
| 11 | **Site audit agent** (S21 engine) | Scheduled multi-angle audit — customer, admin, accountant, warehouse — across many devices, produces a report. | Running the audit and reporting. | **Fixes are approval-gated.** Schedule, on/off and reports live in AI 360. |

### C3.2 Permissions

Permissions are set in the AI 360 **permission matrix**, per agent, over: orders, stock, prices, courier, money,
customer data and code. Worked example, locked: **the Photoshoot agent may write to media only — never to price, stock,
orders or customer data.**

Everything an agent wants to do but may not do alone lands in the **single approval queue**, which the owner clears in
one pass.

### C3.3 Continuous skill training

Stated again here because it is one of the owner's standing requirements, and it applies to **every agent in the table
above**: skills are cards in the AI 360 skill library; new skills are imported from any document, link or instruction
set with the command "learn this"; the AI shows what it understood; each skill is sandbox-tested before going live and
can be rolled back in one click; **every correction the owner makes becomes a training example**; and the Analyst agent
feeds measured results back to the other agents so the team keeps improving.

---

## C4 · Organic growth — SEO, AI answers, YouTube, blog

**Status: Locked.** This is one of the owner's standing requirements: *super SEO — Google, Bing, YouTube, AI assistants.*

### C4.1 The target and the honest timeline

Target: **50% of total sales from organic** — Google, Bing, YouTube and AI assistants. Achievable for this niche, but it
is a **12–18 month build, not a launch feature**. The realistic shape, which must be written plainly in the blueprint so
the owner plans his cash around it:

| Period | Organic share of sales |
|---|---|
| Months 1–3 | ~5% |
| Months 4–8 | ~15–25% |
| Months 9–18 | toward 50% |

**Paid ads carry the business until then.**

### C4.2 Product-page content architecture

- **Above the fold: selling only.** Images, price, colour, size, Find my size, Add to Bag. **No SEO paragraphs.** 95% of
  visitors are on phones and a wall of text kills the sale.
- **Below: collapsible sections, server-rendered so Google reads them even while closed** — Fabric & care · Size & fit
  (the chart) · Delivery & exchange (pulled from Smart Rules) · Questions · Reviews.
  **Build rule:** accordions are SEO-safe only when the text is already in the HTML. **Text loaded on click is never
  done.**
- **The Questions block is the real weapon** — real customer questions with short factual answers, marked up as
  **FAQPage**. This is what Google shows and what AI assistants quote.
- **No keyword-stuffed article on the product page.** It does not rank any more and it lowers conversion. Long-form
  content lives in the **blog** and on **category pages** (intro above the grid, guide plus FAQ below it).
- Admin keeps a **separate SEO panel per product** — title, description, focus keyword, extra facts — **not shown to
  shoppers.**

### C4.3 Answer-engine optimisation — being the brand AI assistants recommend

Bangladeshi buyers increasingly ask an AI "best polo under ৳1500 in Bangladesh". To be that answer:

- **Clean, consistent, machine-readable facts**: Product, Offer, AggregateRating, FAQPage and Organization schema, with
  accurate price and stock (the schema engine itself is S11).
- **Content written in quotable shape**: question-style headings, short factual paragraphs, comparison tables, and clear
  statements — e.g. *"EXTAS polos are 220 GSM combed cotton piqué, S to XXL, exchange within the stated window."*
- **A machine-readable site summary** (`llms.txt`-style) describing the brand, the categories, sizes, policies and
  delivery.
- **AI-crawler policy switch** in robots.txt for GPTBot, ClaudeBot, PerplexityBot and Google-Extended. Blocking them
  means never being cited; allowing them is how a small brand gets recommended. **Recommended: allow — and make it a
  switch** the owner can flip. (See Open item below.)
- **Track referrals from AI assistants separately** in analytics, so the owner can watch this channel grow.

### C4.4 YouTube

Second-biggest search engine and heavily used by Bangladeshi men.

- **Per product**: a short clip — fabric close-up, fit on a model, how it moves.
- **Evergreen videos**: "how to measure your size", "polo vs T-shirt", styling.
- Video **embedded on the product page with VideoObject schema**.
- Description **links the product with a tracked URL**, so **YouTube-driven sales are attributable**.
- A **YouTube module** handles per-product video, VideoObject markup, channel sync and **video → product attribution**.

### C4.5 Blog that actually sells

Three content types, in this priority order:

1. **Buying intent** — "best polo shirts in Bangladesh", "polo vs T-shirt", "which size will fit me".
2. **Problem solving** — "how to stop a collar curling", "washing a white shirt".
3. **Brand story.**

- **Topical clusters:** one **pillar page per category** with supporting articles all linking to it. This is what makes
  a small site rank against big ones. A **topical cluster planner** is built into the blog: pillar + cluster map, with
  **internal link enforcement**.
- **Every money article carries a product block.**
- **Cadence: quality over volume.** Three or four genuinely good articles a week beats twenty thin ones; **mass thin AI
  content is actively penalised now.** The content quality gates already specified in the plan stay **mandatory**.

### C4.6 What gets built (+5 PRs)

1. **PDP content architecture** — collapsible server-rendered sections, FAQ block, FAQPage schema.
2. **Answer-engine pack** — machine-readable site summary, AI-crawler policy switch, quotable-content rules, AI-referral
   tracking.
3. **YouTube module** — per-product video, VideoObject, channel sync, video → product attribution.
4. **Topical cluster planner** in the blog — pillar + cluster map, internal link enforcement.
5. **Organic revenue dashboard** — organic share of sales against the 50% target, broken down by source: Google, Bing,
   YouTube, AI assistants.

### Open — needs the owner's decision (C4)

1. **AI crawlers:** should GPTBot, ClaudeBot, PerplexityBot and Google-Extended be **allowed** to crawl the site from
   day one? (Claude recommends yes — it is the only way to be recommended by AI assistants — and it is built as a switch
   either way.)

---

## C5 · S23 · Social & content studio

**Status: Locked** (approved 2026-10-17). **S23 is its own stage, +7 PRs.**

### C5.1 What each platform actually allows (honest, and it shapes the build)

| Platform | What the API allows | Consequence for the build |
|---|---|---|
| **Facebook Page** | Full API publishing — photos, videos, links, scheduling. | Fully automatic. |
| **Instagram** (Business account linked to the Page) | API publishing of feed photos, carousels, videos, **Reels** and Stories. Daily publishing limit ~50 posts / 24h. | Fully automatic, with the limit enforced in the scheduler. |
| **TikTok** | The Content Posting API can push a video **into the account's drafts** immediately. Fully automatic direct posting needs TikTok's **app audit approval**. | **Semi-automatic until that approval comes.** Build both paths: draft now, direct posting switched on when approved. |
| **YouTube** | API upload works for normal videos and Shorts. Daily upload quota is small (a handful a day) — fine for this business. | Automatic, quota-aware. |

**The music catch, and it matters:** content posted through an API **cannot use the platform's in-app licensed music**
(trending audio). Only royalty-free tracks we own. On Reels and TikTok, trending audio is a large part of reach.

**Therefore the design is hybrid, and this is the rule:**
the AI builds the video, writes the caption and schedules it; **where trending audio matters, the post lands in drafts
and a person taps publish in the app with the sound. Everything else publishes automatically.**

### C5.2 How the AI "makes" video (honest)

**Not by generating footage with a video model** for social posts — that is expensive, inconsistent, and would not show
EXTAS's actual garment. Instead: **template-based assembly** from our own product photos and short clips — motion, cuts,
text overlays, price card, brand frame, royalty-free track. Reliable, cheap, on-brand, and it shows the real product.

The AI writes the hook, the caption and the hashtags, and chooses which products to feature; a human-quality creative
template does the rest.

**AI voiceover in Bengali: optional, off by default until the owner hears it and approves it.**

### C5.3 Automatic vs queued for approval

- Each platform has its own setting: **require approval before anything goes out, or let it run free.**
- **Always queued (never automatic):** anything that needs trending audio → TikTok/Instagram drafts for a person to
  publish; TikTok direct posting until app audit approval exists; Bengali AI voiceover until the owner has approved the
  voice.
- **Automatic when the platform is set to run free:** Facebook Page posts, Instagram feed/carousel/video/Reels/Stories
  within the daily limit, YouTube uploads within quota, and the whole calendar and scheduling layer.
- **Approval queue:** the studio's own queue, surfaced in the AI 360 approval queue, so the owner clears everything in
  one pass.
- **Daily cadence example to configure:** 3 posts a day spread across categories, plus 1 reel.

### C5.4 Where it lives, and its wiring

S23 is a module of its own because it carries an asset library, templates, a calendar, an approval queue and four
publishing adapters. Following the AI 360 rule, **all of its switches, schedules, spend and reports appear inside
AI 360** — the owner never has to go hunting.

### C5.5 What gets built (+7 PRs, S23)

1. **Studio core** — brand asset library, templates, rules (2 PRs)
2. **Video assembly engine** — reels, shorts, image posts (1 PR)
3. **Publishing adapters** — Facebook Page, Instagram feed/reel/story, TikTok draft + direct, YouTube (2 PRs)
4. **Content calendar, approval queue, auto-schedule rules, per-platform limits** (1 PR)
5. **Comment and DM ingestion** from Facebook, Instagram and TikTok into the **Support Inbox** (1 PR)

### C5.6 Honest note on sales — how to judge this module

Social posting **builds awareness and feeds retargeting pools; it is rarely the direct sales engine on its own.** The
sales engine for this business is: **ads optimised on delivered orders + organic search + follow-up on incomplete orders
and chats.** The social studio makes those three cheaper and stronger. **It should be judged on assisted sales, not on
likes.**

### Open — needs the owner's decision (C5)

1. **Per-platform publishing mode at launch:** which of Facebook, Instagram, TikTok and YouTube may post
   **automatically** from day one, and which should **wait for his approval** on every post? (Both modes are built; this
   is just the opening setting.)

---

## C6 · Marketing

**Status: Locked** (sections 14–16 and 19.0 approval).

### C6.1 What already exists in the marketing module, and what was added

**Already in the plan:** SMS gateway with masking ID and cost tracking · WhatsApp templates · transactional email ·
automation flows (order confirmation, shipping, abandoned cart, review request, birthday, win-back, re-order reminder) ·
customer profile · RFM segments · tags · send-to-top-customers · coupons · campaign builder · ad analytics and
three-level ROAS.

**Added and approved (S14 grows from 11 to 16 PRs):**

1. **Journey builder** — the owner draws his own multi-step follow-up flows.
2. **Email marketing proper** — newsletters, campaigns, templates, open and click tracking.
3. **AI campaign writer** — 2–3 versions of each SMS/email copy.
4. **AI segment and timing selection** — who will actually buy and when to send, instead of blasting everyone.
5. **Marketing calendar** — Eid, Puja, Pohela Boishakh, winter — with **per-campaign spend vs delivered revenue**.

**AI is wired into every marketing step** — who to send to, what text, when, how much discount (**margin-checked against
ERP cost**), and learning from the result. All of it sits under AI 360 switches, **with rule-based fallback when AI is
off.**

### C6.2 Ad marketing — the 2026 approach

**The honest headline: in 2026 the money is in signal quality, not in slicing audiences thinly.** Meta and Google now
optimise better than hand-built audiences when they are fed clean, complete, server-side events — but they optimise
towards whatever we tell them is success, and **for a COD business the default target (checkout) is the wrong one.**
So:

1. **Delivered-purchase as the optimisation event** (already in the plan): fire **OrderConfirmed** and
   **OrderDelivered** server-side, and let the platforms learn from **parcels actually accepted**, not COD orders that
   get refused. *This single change is worth more than every audience trick combined for a Bangladeshi COD shop.*
2. **Richer stage events, server-side and deduplicated** (+1 PR): viewed → added to bag → began checkout → typed phone →
   typed address → reached payment → abandoned → ordered → confirmed → shipped → delivered → refused → exchanged. **Each
   with value, category, size and colour.** These are what make any later audience or report possible.
3. **Audience Builder in our own admin** (+2 PRs): the owner picks conditions from **our** database — "incomplete orders
   last 7 days", "bought in last 30 days", "added to bag but never bought", "VIP", "buys size L", "refused a parcel" —
   sees the count, and pushes it as a **hashed custom audience** to Meta, Google and TikTok, **refreshed daily**.
   Campaigns then target or exclude those lists directly, and connect to a landing page with the **UTM wired
   automatically**.
4. **The exclusion list is the quiet money-saver.** People who refused parcels are **automatically excluded from ad
   spend**. Almost nobody in this market does it; it cuts wasted spend and lowers the return rate at the same time.
5. **Value-based lookalikes seeded on delivered revenue**, never on order count.
6. **AI growth agent** (+2 PRs) — see C3.1 row 8.
7. **Daily report extension** (no new PR): a line for **what the AI itself produced** — follow-ups sent, replies,
   incomplete orders recovered, **taka of sales generated by AI follow-up**, chat-to-order conversions, and the running
   total.

### C6.3 Incomplete orders / abandoned carts — approved, and this must be built as written

- **Capture as they type.** Every field at checkout is saved to the server as a **draft order as it is typed**
  (debounced), tied to a **first-party browser id** and, as soon as it is typed, to the **phone number**. So a customer
  who types the phone and address and then closes the tab **is captured**.
- **Honest limit:** we can only keep what the customer actually typed. If they typed nothing, we have the cart and the
  browser id only — then follow-up is on-site and through ad retargeting, **not SMS**.
- **Stage recorded:** cart only → typed phone → typed address → reached payment → left. **The further they went, the
  hotter the lead.**
- **Incomplete orders list in admin:** what is in the bag, value, how far they got, how long ago, which channel or
  campaign brought them, and one-click **WhatsApp**, **create the order**, or **hand to an employee**.
- **Follow-up ladder (rule-controlled, never spam):** about **1 hour later** a WhatsApp or SMS —
  *"আপনার ব্যাগে ২টা পোলো রাখা আছে"* — with a link that **restores the exact bag**; if still nothing and the rules allow,
  **one offer after 24 hours**; then stop. **Maximum two messages, ever.**
- **EXTAS AI owns this loop**, with these skills defined in the AI 360 skill library: score which incomplete orders are
  worth chasing · pick the channel (**WhatsApp → Messenger → SMS → on-site**) · write the message in the customer's own
  language and tone · decide whether an offer is needed and how much, **margin-checked against ERP cost** · respect the
  two-message ceiling · learn from what converted and adjust. **AI off → saved templates and fixed rules still run.**
- **Drafts are deleted on the retention schedule** like any other personal data, and **the privacy page says plainly**
  that an unfinished checkout is kept so we can help complete it.

### C6.4 Autofill capture — approved, must be built (the owner was explicit)

A new visitor clicks the name box and the browser or phone fills in name, phone and address from its own saved data.
**We capture those values even though the customer typed nothing**, and save them as a draft order exactly like typed
input.

**How:** listen for the browser's autofill — input/change events plus the autofill style hook — and read the field
values on first interaction, then save the draft.
**Build note:** Chrome only exposes autofilled values to the page **after the visitor interacts with it**, so capture
happens on that first click — which is exactly the moment the owner described.
**Disclosed in the privacy policy.**

### C6.5 Autofill on return

Name, phone and address are remembered **in the browser** and, for logged-in customers, **on the server**, so the
checkout fills itself next time. **Standard browser autofill is supported properly as well.** (+1 PR in the checkout
stage, together with draft capture.)

### C6.6 PARKED · Birthday marketing

**Parked, not cancelled.** Goes into **Appendix F · Parked modules — built only when the owner asks**, with the full
specification below.

**Why it is parked:** the owner's words — *too much effort for a manual-collection feature; he would only want it if it
were automatic.* **−2 PRs** from the build.

**The honest limits that caused this** (the owner must know them):

- **Messenger / Facebook do NOT give us a customer's birthday.** The Page messaging API returns name, profile picture,
  locale and timezone — not date of birth. Birthday is only available through **Facebook Login with the `user_birthday`
  permission**, which the person must grant and which needs **Meta App Review**.
- **WhatsApp gives nothing but the phone number and profile name.** No birthday.
- **Cookies cannot contain a birthday.** A cookie only holds what our own site put there. There is no way to read a
  birthday out of a browser. Any vendor claiming otherwise is guessing or buying data.
- Therefore birthdays **have to be asked for** — cleverly, and most customers will give it for a gift.

**The full parked specification (five collection routes):**

1. **Optional field in My account** — *"জন্মদিনের তারিখ দিন, প্রতি বছর উপহার পাঠাবো"* — with the reward stated
   (e.g. a ৳200 birthday coupon).
2. **One WhatsApp/SMS question after the first delivered order** — *"আপনার জন্মদিন কবে?"* — a one-tap date reply.
   **Highest response rate.**
3. **EXTAS AI asks naturally in support chat** when the conversation allows it, and saves the answer.
4. **Optional "Continue with Facebook" login** on the site. If the owner enables it and Meta approves `user_birthday`,
   birthdays arrive automatically for everyone who uses that button. **This is the only automatic route that exists** —
   and the day it is enabled is the day this module becomes worthwhile.
5. **Thank-you page** — one small optional line, because that is the happiest moment of the journey.

**Birthday month-only is accepted** when the customer will not give the full date.

**The calendar and the sending:** a Birthday calendar in Marketing showing today, this week and the next 30 days. The
system sends **ONE wish per customer per year**, choosing the channel by availability and consent in this order —
**WhatsApp → Messenger → SMS → email** (phone call stays parked). A branded EXTAS wish card plus a coupon whose value,
validity (**default 7 days**) and minimum order come from Smart Rules and are **margin-checked against ERP cost**.
Results tracked: wishes sent, coupons used, revenue earned. **AI writes the message; with AI off a saved template goes
out.** All of it respects the existing marketing consent record.

**Restart sentence:** *"Build the parked birthday marketing module from Appendix F."*

### C6.7 PARKED · AI voice calls

**Parked, not cancelled.** Removed from the PR count on the owner's correction of 2026-10-17; it must still be written
into the blueprint **in full** as a parked module in **Appendix F**. Estimated size: **≈6 PRs, +4 more for free
conversation.**

**Why it is parked:** the owner's decision — it is not to be implemented now. What must be arranged first: **a licensed
Bangladeshi IPTSP / call-centre provider.**

**The full parked specification:**

*Calling the courier on the phone: recommended NO.* Courier hotlines are IVR plus human queues; an AI sitting in that
queue is unreliable and risks annoying the courier. Tickets, email and WhatsApp (already built) work better. Rider notes
and courier tickets are **already in the main plan** — the AI opens and chases courier tickets, reads rider notes on
failed or partial deliveries and classifies the real reason, and pushes ticket progress to the customer's tracking page.
No change needed there.

*Calling customers: YES, in three levels — levels 1 and 2 would be built, level 3 deferred.*

- **Level 1 — automated confirmation call with keypad (the workhorse).** A Bengali voice reads the order number, amount
  and area; *"press 1 to confirm, 2 to cancel, 3 to talk to a person"*. Reliable, cheap, no speech recognition needed,
  and it answers the real question — **is the phone live and is the person real.** Triggered **only by the fraud rules**,
  not on every order. Retry rules, no-answer handling, and the result written on the order and into the fraud score.
- **Level 2 — the AI also understands short spoken answers** ("হ্যাঁ", "না", "সাইজ বদলাব"), with the keypad always as
  the fallback.
- **Level 3 — free conversation.** Possible, but **Bengali speech recognition on a noisy mobile line with regional
  accents is not good enough yet**, and the 1.5–3 second pause before each reply feels wrong to a customer. **Deferred
  on purpose; revisit after live.**
- **Inbound:** the AI answers the hotline, recognises the caller's number, reads out order status, and hands over to an
  employee for anything else. Levels 1–2 only.

*What would have to be built:* a telephony adapter to a **licensed Bangladeshi IPTSP / call-centre provider** (same
mock → sandbox → live pattern as every other integration; **grey VoIP routes are illegal under BTRC rules and must not
be used**) · Bengali text-to-speech · Bengali speech-to-text for level 2 · a call-flow engine · call recording with a
**spoken consent line** · transcript and call log on the order · **per-minute cost tracking under the AI 360 budget
caps** · and all triggers written in Smart Rules.

*PR list:* telephony adapter (1) · outbound confirmation call with Bengali TTS + keypad, retries, result into the fraud
score (2) · spoken-answer understanding with keypad fallback (1) · inbound AI receptionist with handover (1) ·
recording, consent, transcript, call log, cost tracking (1). **Level 3 free conversation ≈ 4 more PRs, deliberately not
scheduled.**

**Restart sentence:** *"Build the parked AI voice-call module from Appendix F."*

### C6.8 The parked-module convention (applies to every parked item)

**Appendix F · Parked modules — built only when the owner asks** holds each parked module with:

- its **full specification**;
- **why it is parked**;
- **what must be arranged first** (e.g. a licensed IPTSP provider for calls, a shop for POS, Facebook Login for
  birthdays);
- its **PR list and estimated size**;
- **the exact sentence the owner can say to start it.**

`CLAUDE.md` in the repo **points at Appendix F**, so a Claude Code session six months later knows the module exists,
knows it is deliberately not built, and knows how to start it on the owner's word — without it leaking into the normal
build order.

**Parked modules are excluded from the PR total, the roadmap and every progress figure**, so they never make the main
build look bigger than it is.

**Parked so far:** AI voice calls · POS / counter sales (≈8–10 PRs, owned by another part of this blueprint) · birthday
marketing.

### Open — needs the owner's decision (C6)

1. **"Continue with Facebook" login:** should the site offer Facebook Login (and should we apply to Meta for the
   `user_birthday` permission)? It is the **only automatic source of birthdays**, and enabling it is the trigger to
   un-park the birthday module.

---

## C7 · S24 · Virtual Photoshoot Studio

**Status: Approved and merged master plan** (sections 25–29 of the decision record; §28, §29 marked APPROVED).
**The owner calls this the heart of the shop.**
**S24 · Virtual Photoshoot Studio — 37 PRs.** The image-AI PRs that used to sit in S01 move here; S01 keeps only
ordinary media handling (upload, CDN, watermark, zoom delivery).

### C7.1 The key design decision

**Do NOT ask an AI to "generate a model" per product** — that gives a different face and body every time and looks fake.

Instead: **keep a fixed library of model photographs** (4–5 models, each shot in several angles and poses, in plain
clothing) and use a **virtual try-on / garment-transfer model that puts OUR garment onto THAT fixed model photo.**
The model photo is the anchor, so **the same faces appear across the whole catalogue**, the lighting is consistent, and
the result reads as a real shoot. This is the only way to get consistency.

### C7.2 Where the model photos come from

| Option | What it is | Verdict |
|---|---|---|
| **(a) One real photoshoot, once** | 4–5 models, 5–6 angles each, plain grey/white studio, neutral fitted base garments. ~30 photos total, usable for years. Needs a **signed model release for commercial and AI use**. | **Best quality, clearly legal. Recommended.** |
| **(b) Licensed stock model photos** with a licence permitting AI modification | Cheaper, but fewer matching angles and the same faces may appear on other brands' sites. | Acceptable fallback. |
| **(c) AI-generated model personas** kept consistent by fixed seed/reference | No release needed, no real person's likeness. Weakest for close-up realism (hands, ears, skin texture) but acceptable when the garment is the focus. | **Recommended fallback if (a) is not possible.** |

**Hard rule: never use a real person's photo without a written release.** Consent and rights records are stored with
every model profile.

### C7.3 Reference images — the rights gate is REMOVED (owner's decision, §28.1)

EXTAS retails genuine branded goods (Ralph Lauren, Tommy, CK and similar) and does not put its own logo on them.
**Whatever image the owner uploads as a reference is simply used.**

Removed from the design: the rights-verification step · the "usage rights" field as a gate · any confirmation prompt
about image source · and **Claude's earlier stricter rule against using other sites' product photos — that rule is
withdrawn.** An **optional free-text source note** remains, **off by default**.

**The system's only job is to produce the best output from the references given.**

### C7.4 What the owner must do when photographing a garment

A small discipline with a big payoff:

- **Flat-lay on a plain sheet, or better a ghost-mannequin shot** (garment on a mannequin, mannequin removed) — try-on
  quality jumps when the garment already has a worn shape.
- **Even window light**, no harsh shadow, phone held **parallel** to the garment, **same distance every time**.
- **A grey card / colour checker in one frame per colourway**, so colour is corrected accurately.
- **Required set per product:** front, back, one detail/fabric close-up, plus any print or label shot.

### C7.5 The pipeline, step by step

1. **Upload** — the original is kept at full resolution, **forever, untouched** (originals are immutable; generated
   assets are stored separately).
2. **Auto-orient, denoise, white-balance** using the grey card; exposure normalised.
3. **Garment segmentation** — precise cut-out of the garment from the background.
4. **Ghost-mannequin / shape normalisation** where the input is a flat-lay.
5. **Standardisation** — same canvas, same ratio (**4:5**), garment at the same scale and centre, standard background.
6. **Colour verification** — measured against the ERP colour name and the colour checker; **drift beyond tolerance is
   flagged**.
7. **On-model generation** — garment + chosen model photo + chosen angle → try-on model → generated image. **One job per
   angle**, queued, **retried with a different seed on failure**.
8. **Detail re-projection — this is what makes it look real.** Logos, prints, embroidery and text are exactly where
   these models fail. After generation, **the original high-resolution texture of the print/logo region is warped and
   composited back over the generated garment**, so the print stays exactly as it is in real life instead of being
   re-imagined into mush. **This is the single biggest fidelity lever in the whole module.**
9. **Automatic quality scoring** — garment shape integrity, print legibility, colour difference vs the original,
   hand/finger artefacts, edge quality, seam continuity. **Anything below threshold never reaches a human.**
10. **Human review queue** — the owner sees generated vs original **side by side** and approves, rejects or regenerates.
11. **Output set** — several sizes in **AVIF/WebP** for the page, plus the **full-resolution file kept for zoom**.
12. **Watermark** — see C7.11.

**Everything runs in the background queue; nothing blocks the product upload.**

### C7.6 Job state machine, roles, and the safety rules

- **Job states:** draft → queued → processing → review_required → approved → published, plus **rejected, failed,
  cancelled**.
- **Image role taxonomy:** `primary_garment`, `front_reference`, `side_reference`, `back_reference`,
  `detail_reference`, `context_reference`.
- **Hard rule: never invent a back view from a front-only reference.** A back image is generated **only when a real back
  reference exists.** This prevents the single worst fidelity failure.
- **Data model:** `model_profiles`, `model_reference_assets`, `photoshoot_jobs`, `photoshoot_outputs`,
  `ai_usage_ledger` — mapped onto the existing schema rather than duplicating the product and media tables.
- **Idempotency key per logical request**, duplicate-job protection, **no double charging**.
- **Retry only the failed or rejected view**, never the whole product.
- **Reuse approved outputs** unless the source image, the model, the settings or the provider version changed.
- **Cost shown before a batch:** product count, views, tier, estimate, retry buffer, hard spend cap.
- **Security and records:** rights and consent records, originals immutable, generated assets stored separately,
  **AI-generated status recorded**, provider secrets server-side only, **signed URLs**, a retention policy and an audit
  log.
- **Approval stays mandatory permanently.** (The alternative — "mandatory in the first release, relax later" — was
  considered and **rejected**. The owner reviews every image; that is the agreement.)

### C7.7 The PREMIUM tier decision

**The volume changes everything.** The owner's real volume is about **5 new products a month × 5 colourways × 3 images
≈ 75 generated images a month** (~900 a year). That is tiny. **Cost is therefore NOT the constraint — quality is.**
The whole design is built accordingly: **spend freely per image, because the monthly bill is small either way.**

**Owner's decisions, final:**

- **Best-of-2, not best-of-4.**
- **Nothing outsourced.** No external retouch service, no human retoucher. **Every finishing step is built into the
  system**; the extra API cost for that is accepted.
- **Premium tier priced at $0.70 per image single pass, $1.40 for the two-pass best-of-2.** At 75 images a month that is
  about **$105/month ≈ ৳12,600**, roughly **৳150,000 a year. Approved.**
- **Everything dynamic** — model library, provider/company, which AI package is used, quality tier, shot plan.

**Cost table, final:**

| Tier | Per image | 75 images/month | Per year |
|---|---|---|---|
| Budget | $0.02 | ~৳180 | ~৳2,200 |
| Mainstream | $0.10 | ~৳900 | ~৳11,000 |
| Premium single pass | **$0.70** | ~৳6,300 | ~৳76,000 |
| **Premium best-of-2 (approved default)** | **$1.40** | **~৳12,600** | **~৳151,000** |

**The tier is switchable per product:** best-of-2 for hero launches, single pass for routine restocks.

**Quality strategy that the money buys:**

1. **Best-of-2** — generate candidates across two providers, score them automatically, show the owner the best.
2. **Two-stage render** — try-on at base resolution → **AI upscale to 2500–3000px** → detail re-projection → gentle
   retouch → web sharpening. The customer zooms and sees weave, stitching and seams.
3. **The fabric macro shot is ALWAYS a real photograph, never generated.** This is what makes a premium product feel
   premium, and it is the one image that must be unarguably true.
4. **Mandatory review. Nothing publishes unseen.**

### C7.8 Finishing, built in-house (replaces any outsourced retouch)

A finishing pass inside the system, applied to **every approved image**:

**AI upscale to 2500–3000px · artifact repair (hands, edges, garment boundary) · contact-shadow synthesis so the garment
sits on the body properly · colour match back to the real garment colour · fabric micro-detail enhancement · house
colour grade so every image on the site looks like one shoot · final web sharpening.**

Plus a **small editor in the admin**: crop, straighten, brightness and contrast, spot removal, and **"run finishing
again"**.

**No external service, no third party, nothing leaves the system.**

### C7.9 Shot Plan per category, with ghost mannequin as a first-class option

Not every product needs a model. The owner sets a **Shot Plan per category, overridable per product**. Each slot is a
dropdown: **Real photo / Ghost mannequin / On-model / Off.** Mixing is normal — e.g. one ghost, three model shots, one
real macro.

| Category | Default shot plan |
|---|---|
| Polo / T-shirt / Shirt | real flat or ghost front · 3 model angles (front, three-quarter, back) · real fabric macro |
| Boxer / underwear | **ghost mannequin front and back** · real fabric macro · model optional and **off by default** |
| Trousers / denim / chino | ghost front · 2 model angles (full length, walking) · real fabric and hardware macro |
| Tank top / jersey | ghost or model, owner's choice |
| Panjabi / katua | model strongly preferred, 3 angles · real fabric and embroidery macro |

**Ghost mannequin is its own engine, not an afterthought.** The garment is photographed on a mannequin, the mannequin is
removed, the inner neck and back are reconstructed, the shape is kept. Clean, premium, and for some categories (boxers
especially) better than a model. **It is also the best input for the on-model step, so the pipeline produces it first
and reuses it.**

### C7.10 Detail Finder — auto-focus on the small things that sell a premium garment

The owner's point: a polo has side tapes with the brand name, a side vent, collar tape, embroidery, print under the
placket. **These small details are what make a garment look premium, and they must be shown.**

- **Per garment type, a checklist of likely detail points:**
  - **polo** — side tape, side vent, collar tape, placket and buttons, cuff, chest logo
  - **shirt** — collar, cuff, button, pocket, yoke, stitch density
  - **denim / chino** — rivets, back pocket stitching, label, zip and hardware, selvedge
  - **hoodie** — drawcord tips, kangaroo pocket, rib, zip pull
  - **panjabi** — neck embroidery, button placket, side slit
- **The system scans the uploaded images and proposes the regions it found, labelled.** The owner confirms, renames,
  adds or removes. **Each confirmed region becomes a focused close-up image in the gallery.**
- **Focus crops are produced from the ghost and on-model renders too**, not only from the flat-lay — so the side tape is
  visible the way it actually sits on a body.
- **If the system cannot see a detail clearly, it asks:** *"The collar tape is not readable in these photos — please
  take one closer photo of the collar."* The owner shoots it on his phone, uploads, and that region is regenerated.
  Same for a small chest logo. **This back-and-forth is part of the normal upload flow, not an error.**

### C7.11 Watermark — corrected behaviour

- **A customer browsing the site sees NO watermark.** Clean images, clean video.
- **The watermark is applied automatically at the moment of download or save** — the download button, right-click save
  and drag-save **all go through a stamping endpoint that returns a watermarked copy.** Same for video.
- **Honest limit:** this covers saving and downloading, **not a phone screenshot**. Nothing can stop a screenshot, and
  trying to (right-click blocking and the like) only annoys real customers.
- The stored original is never watermarked.

### C7.12 All product families — three engines cover everything

Rather than a separate build per category, **every product family maps to one of three engines**, plus a shared
detail/macro step:

1. **On-model (worn)** — menswear, ladieswear, kidswear, caps on a head, sunglasses on a face, a watch on a wrist, a bag
   carried.
2. **Ghost mannequin** — all garments, including kidswear.
3. **Product-only studio** — footwear, perfume, wallets, belts, watches laid flat, sunglasses folded, bags standing.

Each family then gets a **studio recipe**: which engine, how many angles, which detail points, which model library.

**Model libraries:**

- **Men** (4–5 profiles) — the first library.
- **Ladies** (4–5 profiles) — each profile carries a **styling guideline the owner sets** (how the model is dressed and
  posed) so the result matches what sells in this market. His call, set once per profile.
- **Kids** — added, but **the default for kidswear is ghost mannequin or flat-lay, not a child model.** The reasons are
  practical, not moral: several providers restrict generating realistic images of children, results are less reliable,
  and ghost shots of kidswear look clean and are cheaper. **A kids model profile can be enabled later if the owner wants
  it.**
- **Hand / wrist / face part-models** — for watches, rings, sunglasses and wallets: a small library of hand, wrist and
  face references, treated exactly like a model profile.

**Category recipes (defaults, all editable):**

| Family | Engine | Angles | Detail points |
|---|---|---|---|
| Polo / tee / shirt / panjabi | ghost + on-model | 3–4 | side tape, vent, collar tape, placket, cuff, chest logo |
| Trouser / denim / chino | ghost + on-model | 3 | rivets, pocket stitch, label, zip and hardware |
| Ladies garments | ghost + on-model (ladies library) | 3–4 | neckline, sleeve, print, trim |
| Kidswear | ghost / flat (model optional) | 2–3 | print, trim, button |
| Footwear | product-only | 6 (3/4, side, top, back, sole, detail) | sole pattern, stitching, logo, eyelets |
| Bags | product-only + carried on model | 5 | handle, zip pull, lining, logo plate, feet |
| Wallets | product-only + in-hand scale | 4 | open, card slots, stitching, logo |
| Belts | product-only + worn | 4 | buckle macro, keeper, leather grain, tip |
| Caps | on-head + product-only | 4 | front logo, back closure, under-visor, eyelets |
| Sunglasses | on-face + product-only | 4 | hinge, temple logo, lens, nose pad |
| Watches | on-wrist + product-only | 5 | dial, crown, bracelet links, clasp, caseback |
| Perfume | product-only | 3–4 | cap, label, liquid level, embossing |
| Socks / ties / small goods | flat + product-only | 2–3 | weave, tip, label |

**Footwear and other non-garment products** (shoes, boots, Chelsea boots, sneakers, loafers, sandals) need no model:

- **Product-only studio** — a multi-angle set from the owner's photos (three-quarter, side profile, top, back, sole,
  detail) on the standard background, with **consistent shadow and scale**.
- **Turntable-style angle set** where enough reference exists; **the system says plainly when it does not and asks for
  the missing angle rather than inventing it.**
- A **footwear shot plan** alongside the garment ones, with the same dropdowns.

**Reflective and transparent goods — honest handling.** Perfume bottles, watch glass and sunglass lenses are the weakest
area for generative models: glass, reflections and transparency come out wrong. **These are not generated.** Instead the
pipeline keeps the owner's real photo, replaces and cleans the background, rebuilds the shadow and a controlled
reflection, corrects colour, and crops to standard. The result is a clean studio look from a phone photo **without
inventing the object**. Where a real angle is missing, the system asks for it.

**Detail fidelity on branded goods.** For watches, sunglasses and bags, the brand name and dial text are exactly what
the customer studies. **Detail re-projection is mandatory for these families** — the real logo and text are composited
back from the owner's photograph, never left to the model.

**Withdrawn:** the "other families worth planning for" list (socks, ties, grooming, jewellery, backpacks, luggage,
hampers) was withdrawn by the owner — **those items are not coming.**

### C7.13 Lifestyle catalogue — sets, unisex shots and occasion scenes

**Top-bottom sets and tracksuits — the owner's core winter business.**
Items: tracksuits (hoodie + jogger), zip tracksuits, sweatshirt sets, joggers, shorts, swim shorts, full-sleeve polo and
tee, tee + three-quarter short sets. These sell as a **matched set** — black top with black bottom, ash hoodie with ash
grey trouser — and **the model must be wearing the complete set in one image.**

- New product type: **Set** — a parent with a **top component and a bottom component, each its own SKU**, joined by a
  **colourway link** so the set's colour stays matched.
- The try-on engine runs **two passes on the same model image** — upper body, then lower body — producing **one
  photograph of the model wearing the whole set.** Angles: front, three-quarter, back, plus a **motion/walking frame**.
- **Detail points for this family:** hood and drawcord, cuff and hem rib, zip pull and puller branding, side stripe or
  tape, pocket, ankle rib, waistband drawcord, and **fleece inside texture (a real macro)**.
- Links to the existing **combo engine**: a tracksuit sold as a set is one sellable unit, and the same images serve the
  combo page.

**Unisex / couple shots.** Some sets are unisex, and one frame showing **a male and a female model both wearing the
set** says it instantly. Built as: **generate each model separately on their own profile, then compose them into one
scene** with matched lighting, scale, ground plane and shadow. Composing two separately-generated people is **far more
reliable** than asking a model to generate two people at once, and each person's garment stays accurate.

**Occasion scenes — and the system grooms the owner, not the other way round.** The owner's words: his head will not
produce scene ideas on the spot, so **the system must propose.**

- Before generating, the system **offers three scene options with small previews**, each named and described in one
  line: *"Winter morning — soft fog, park path, cool tones"* · *"Eid evening — warm light, decorated interior"* ·
  *"Match day — stadium tunnel, strong side light"* · *"Summer — bright open street"*.
- Suggestions are chosen from **the product's category and the calendar**, so winter items get winter scenes in winter.
- The owner picks one, asks for more options, or says **no scene** (plain studio).
- **A demo frame is always shown before the full set is generated** — he approves the look first, then it runs.
- **Approved scenes are saved to the scene library and reused**, so the catalogue stays consistent within a season.

**Combo / gift-set studio.** Combos are central to this business, yet there is no way to photograph a set. A composition
studio: **pick 2–4 products, choose a layout** (flat-lay arrangement, stacked, or on one model wearing all of them), and
it produces **one clean set image.** Directly serves the combo pages, the Eid gift sets and the landing pages.

**Scene library.** Beyond the plain studio background, a small set of approved backgrounds — **studio grey, street,
festive, winter** — chosen per campaign. One garment set can then be re-rendered into a seasonal scene **without a new
shoot.**

### C7.14 Video (the S24 side): what the Studio feeds into S25

Product video and reels are built in **S25** (section C8), but the method depends on S24: **the first frame of every
clip is an already-approved S24 still**, so the garment, the colour and the logo are already correct.

### C7.15 Front end

- **On-model images are part of the normal gallery**, with the same zoom; the high-resolution version loads on zoom.
- **Angle switcher** — front / three-quarter / back / walking / seated — **sharing the garment's colour selection**;
  changing colour **re-renders the whole set from the pre-generated cache, instantly**.
- **Nothing is slower: all generation happens at upload time, never at page-view time.**
- **The real photo always stays the hero.** The flat-lay and the fabric close-up carry the truth of fabric and colour;
  the on-model images carry the feeling. **Gallery order: real front shot → on-model views → back → fabric close-up →
  detail.**
- **Disclosure:** no "AI" badge plastered on the image, but **one honest line in the product details** — *"some images
  show the garment digitally placed on a model; fabric and colour photos are real."* This protects against "it looked
  different" complaints, which in a COD market means **fewer refused parcels — it pays for itself.**

### C7.16 Admin

- **Model library screen** — add a model (name, photos per angle, height, size worn, rights/consent record); set which
  models are available for which category.
- **On product upload** — pick the model and tick which angles to generate. **Generate → review → approve.** Per-product
  and per-image on/off.
- **Regenerate** any single image; **batch regenerate** a whole category if the standard changes.
- **Cost per generation is shown in the AI Cost Book before the owner presses generate.**
- **In-admin image editor** — crop, straighten, brightness and contrast, spot removal, "run finishing again".
- **Review and approval UI** — side by side, with reasons on rejection.

### C7.17 Technology and providers

- **A provider adapter**, exactly like the payment and courier adapters — **mock / sandbox / live**, with **two or three
  providers behind one interface**, so the owner can switch on price or quality **without a rebuild**.
- **FASHN AI** (Try-On v1.6 for baseline, Try-On Max for premium) is one of the two providers to benchmark. Other
  specialist flat-lay-to-model services exist (Claid, uwear.ai, Pixelcut, Fitroom and others) and can sit behind the
  same adapter.
- **Gemini / OpenAI are kept only as secondary adapters for background and scene variation — never as the
  garment-transfer engine.**
- **Free / OpenRouter models in production: a hard no.**
- **Verify every provider's model names, parameters, pricing, rate limits, retention and commercial terms from the
  official documentation at implementation time.** The figures in this blueprint are from October 2026 and will move.
- **A/B the providers on 20 real products before committing.**

### C7.18 Honest limits — what the system will and will not do

- **Does well:** plain and solid-colour garments, polos, tees, shirts, trousers, hoodies — **the bulk of EXTAS's
  catalogue.**
- **Struggles:** large complex prints, fine text, lace/mesh, very shiny fabrics, unusual drape, hands overlapping the
  garment.
- **Never:** promises 100% accuracy without review. **Every generated image is checked before publishing.**
- Glass, reflection and transparency are **not generated at all** (C7.12).

### C7.19 Proof before scale — the pilot

- Build the pipeline, then run **20–30 real EXTAS products** through **two providers**, **including deliberately hard
  cases**: plain black and plain white polos, small embroidery and logos, stripes and patterns, light and dark
  colourways, and low-quality phone shots.
- Put the results in front of the owner.
- **A/B test on-model vs flat-lay on the live site**, measuring **add-to-bag, conversion and return rate.**
- **Headline metric: cost per APPROVED image, not per generated image**, plus **first-pass approval rate, retries per
  approved image, processing time, failure rate and review time.**
- **Scale only on the numbers.**

### C7.20 AI 360 wiring (S24 is the engine; AI 360 is the control room)

- The photoshoot work registers in AI 360 as a named agent — **Photoshoot agent** — with its **sub-jobs listed
  separately**: ghost mannequin, try-on, detail re-projection, upscale, finishing, detail finder, quality scoring.
- **Provider and model choice for images lives in the same AI 360 screen as the text models.** One place answers "which
  company, which package, for which job" for the entire business.
- **Every sub-job has its own row in the AI Cost Book**, with the recommended model, estimated cost per run,
  alternatives and their cost, and the recommendation note when the owner changes one.
- **The Photoshoot agent has its own monthly cap in AI 360.** At 80% a Telegram warning; at 100% new generations pause
  while everything already approved stays live and the shop keeps running normally.
- **The cost calculator answers photoshoot questions directly** — "20 products × 5 colours × 3 images at best-of-2 —
  what will it cost?" — before anything runs.
- **Every generation writes to the same `ai_usage_ledger`** that feeds the Costs section, the month-end close sheet and
  the ERP push. **Photoshoot cost is not a separate pot of money.**
- **The AI diary** includes the day's photoshoot activity in plain Bengali.
- **Permission matrix:** the Photoshoot agent **may write to media only — never to price, stock, orders or customer
  data.**
- **Keep-on switch:** the owner can leave the Photoshoot agent running **even with the AI master switch off**, as with
  any agent.

### C7.21 The Studio menu (dashboard structure)

The dashboard gets **one main menu: "Studio"**, with two sections under it:

- **Photoshoot Studio** (S24) — model library, shot plans, generation, review, detail finder, scenes
- **Video & Campaign Creative** (S25) — reels, motion, campaign creatives, platform exports

They **share the asset library, the model library, the scene library, the cost ledger and the AI 360 switches**, so
keeping them in one place is also how it works underneath. **The split into S24 and S25 is only the build order, not two
menus.**

### C7.22 S24 PR list (37 PRs)

1. Asset model, role taxonomy, immutable originals, generated kept separate
2. Model library with consent records
3. Ghost-mannequin engine
4. Garment prep and standardisation (cut-out, colour, canvas)
5. Reference analysis and recommendation
6–7. Provider adapter (FASHN + one other; estimate, generate, status, fetch)
8–9. Job orchestration: queue, state machine, idempotency, per-view retry, concurrency, spend caps
10. Best-of-2 plus automatic scoring
11. Detail re-projection for logos and prints
12–13. Finishing pass (upscale, artifact repair, contact shadow, grade, sharpen)
14. In-admin image editor
15. Review and approval UI with side-by-side and reasons
16. Cost ledger, estimates, caps, reuse rules
17. Recommendation-note system
18. Front-end gallery, angle switcher, zoom, disclosure line
19. Pilot harness and metrics (cost per approved image, first-pass rate) plus live A/B
20–21. Detail finder
22–23. Footwear / product-only studio
24. Download-watermark pipeline
25. AI 360 wiring and Cost Book rows for every photoshoot sub-job
26–27. Category recipe framework with the 13 recipes
28–29. Worn-accessory engine for caps, sunglasses, watches and carried bags
30. Reflective and transparent product handling
31. Ladies, kids and part-model libraries with styling guidelines
32. Combo and gift-set composition studio
33. Scene library
34–35. Set product type and two-garment try-on
36. Unisex / couple composition
37. Occasion scene suggester with previews and approval

### Open — needs the owner's decision (C7)

1. **Model photographs:** does he want to do **one real photoshoot** of 4–5 models with signed releases (option a,
   recommended and used for years), or should the system start on **AI-generated model personas** (option c) until he
   can arrange a shoot?

---

## C8 · S25 · Video & Campaign Creative Studio

**Status: Approved** (sections 30 and 31). **S25 · Video & Campaign Creative Studio — 8 PRs**, plus the 2 campaign-visual
PRs in C8.4. It is the second section under the single **Studio** menu (C7.21).

### C8.1 Video and reels — the method that keeps the product accurate

**Image-to-video from an already-approved still.** The first frame is **our approved on-model image**, so the garment,
the colour and the logo are already correct; **the model only moves from there.**
**Text-to-video would re-imagine the garment and is not used.**

- **Clips of 4–8 seconds**, stitched into a **15–25 second reel** with music, text and the logo.
- **Action library per category** — tracksuit: jogging, stretching, a group workout · polo: walking, turning, sitting at
  a café · formal shirt: office walk, adjusting a cuff · panjabi: festive greeting · footwear: a walking close-up on the
  feet · bag: picked up and slung on the shoulder. **The owner picks the action or lets the system suggest.**
- **Group clips** (two or three models jogging together) are produced as **separate clips cut together**, or as a wider
  shot where faces matter less — generating several consistent people in one moving shot is **still unreliable**.
- **Per product, a tick box. Off by default. Nothing is generated unless the owner allows it for that product.**
- **Outputs:** **9:16** for reels and stories, **1:1 and 4:5** for feed, **16:9** for the website — **auto-cropped with
  safe areas so nothing important is cut.**
- **On the website:** a short **muted auto-looping clip on the product page**, plus hero and category banners.
- **Music** is royalty-free or generated. The rule from C5.1 stands: **API-posted social content cannot use the
  platforms' trending audio, so reels needing trending sound land in drafts for a person to publish.**
- **Watermark on video follows the same rule as images** — clean on the site, stamped on download or save.

### C8.2 Video cost (vendor rates, checked October 2026 — verify before building)

- Per-second API rates run from about **$0.02/s** at the cheap end to **$0.40/s** for the top tier, with mainstream
  1080p models around **$0.08–$0.14/s**.
- An 8-second clip is therefore roughly **$0.64–$1.12 mainstream**, or **$3.20 top tier**.
- A **20-second reel from three clips**, with best-of-2 and retries: **~৳800–1,200 mainstream, ~৳2,500–3,500 top tier.**
- **Five reels a month: ~৳5,000 mainstream, ~৳15,000 top tier.** Affordable at this volume, and the owner has said
  quality comes first.
- **Reseller prices run 2–3× vendor rates, so the adapter talks to vendors directly.**
- **Every clip is priced in the AI Cost Book before it runs**, under the **Photoshoot/Video agent's own monthly cap** in
  AI 360.

### C8.3 Campaign visuals — two separate layers

The owner spotted a real distinction. These are **two different things and they must not be confused in the build**.

**Layer (a) — On the product page: nothing is burned into the photo.**
When a discount or flash-sale campaign is running, every product inside that campaign automatically shows a campaign
**overlay** — a corner ribbon, a bottom strip, a struck-through price, a badge.

- It is a **page element drawn on top at display time, not part of the stored image.**
- It **appears when the campaign starts and disappears when it ends**, with **nothing regenerated and no image
  replaced.**
- It shows **on the product card in listings, in search results and on the product page.**
- The design is **chosen per campaign from a small set of templates**, matched to the theme.

This is what the owner meant by *"it should be default, attached to the campaign, not written onto the picture."*

**Layer (b) — For ads: the vibe IS baked into the image.**
A Facebook flash-sale creative needs the offer inside the picture. Those are produced in the **Campaign Creative
Studio** as **separate files, never touching the product gallery**: the offer text, the price, the urgency, the festive
or seasonal treatment, in every platform size. **Product photos stay clean; ad creatives carry the message.**

### C8.4 The AI grooms the owner before it creates

Before generating campaign creative, the AI asks a few short questions **in plain Bengali** — what is this campaign for,
who should it reach, what is the offer and for how long, which products — then comes back with **three creative
directions, each with a preview and a one-line rationale**:

- *"Urgency — dark background, big timer, strong red"*
- *"Festive — warm light, gold accents"*
- *"Clean premium — product led, small offer tag"*

**The owner picks one, asks for more, or edits. Nothing is produced until he has seen a direction he likes. He is never
asked to invent the idea himself.**

### C8.5 Campaign creative export

From a campaign the owner picks **a product, a SKU, or a whole category/sub-category**; the system gathers the approved
images and videos for that selection and prepares **campaign-ready creative**:

- **every platform size** — Meta 1:1, 4:5 and 9:16; Google 1.91:1; TikTok 9:16;
- **safe-zone cropping**;
- **optional price or offer overlay pulled from the campaign itself**;
- **the tracked landing URL**.

**One click sends them to the connected ad account or downloads them.**

### C8.6 S25 PR list

**S25 · Video & Campaign Creative Studio — 8 PRs:**

1. Action / motion library (1)
2–4. Image-to-video engine with provider adapter and best-of-2 (3)
5–6. Reel assembly with music, text, logo and aspect variants (2)
7–8. Campaign creative export (2)

**Plus the two campaign-visual PRs:**

9. **Campaign overlay system — page-level and time-bound** (1)
10. **Campaign creative brief and three-direction grooming flow** (1)

---

## C9 · Build capacity and timeline — the reality check

The owner asked whether roughly **400 PRs across ~30 stages** can be built and taken live **in 3–7 days** on the Max 5x
($100) plan.

**Honest answer: no — not on any plan.** The working figures, to be written into the blueprint as they stand:

- **Official Max 5x limits:** ~50–200 Claude Code prompts per 5-hour window; weekly roughly 140–280 Sonnet hours and
  15–35 Opus hours. Usage falls toward the **lower** end on a large codebase, and **Opus burns about 5× faster.**
- **Realistic cost per PR** on a greenfield build with tests: small 5–10 turns, medium 15–30, large 40–80 — **average
  ~22 turns.** So **400 PRs ≈ 8,800 agent turns.**
- **Max 5x throughput** ≈ 120–190 prompts/day sustained ≈ ~1,000/week → **roughly 8–10 weeks.**
- **Max 20x** ≈ 4× that → ~3–4 weeks of model capacity, realistically **5–7 weeks** once the owner's own review time is
  counted.
- **Wave 1 only** — a working shop: catalogue, product, cart, checkout, orders, courier, basic admin, **≈80 PRs** ≈
  1,760 turns → about **1.5–2 weeks on Max 5x, or 4–6 days on Max 20x.** **That is the realistic "one week" target.**

**The real blockers are not the plan.** bKash PGW, Nagad, SMS masking sender ID, Steadfast/Pathao API, WhatsApp Business
API and DBID **each take days to weeks of external approval.** **The applications must go in now, in parallel with the
build.**

**Recommendation recorded:** **Max 20x for the build sprint, dropping back to 5x afterwards**, with Console
pay-as-you-go as overflow if a deadline needs it. **Plan limits change over time — verify before buying.**

### Open — needs the owner's decision (C9)

1. **Plan for the sprint:** does he want to move to **Max 20x for the build** and drop back to 5x afterwards, as
   recommended, or stay on Max 5x and accept roughly 8–10 weeks?
2. **Blueprint structure (still unanswered from §14.5):** should the final blueprint mark each PR as **"before go-live"
   or "after go-live"**? Claude offered this; the owner has not yet answered.

---

# Part D · UI/UX — IN REVIEW

## D0. Status of this part — IN REVIEW, NOT FINAL

**This part is not locked.** The owner said so explicitly: the UI/UX is still being reviewed, round by
round, and he has not signed it off.

- **Last review round recorded: Round 12 (§58), 2026-10-18** — his second phone audit, home page through
  My account, 53 points. All 53 were built and verified the same day (§58.12), but **he has not re-audited
  the result**, so Round 12 is not signed off.
- **Review order he set:** phone first, then desktop. He stopped Round 11 at the product page and will not
  go further until the phone is accepted. **The desktop review has not started.** The phone and desktop
  footers will be two different designs, and that desktop footer has not been designed (§58.2).
- **What may be built now:** everything marked **Locked** below. Those were explicitly approved or locked by
  the owner — §41 (approved), §43 (build rules), §46/§47 (approved and applied), §49 (locked), §50 + §52.1
  (analytics, locked), §53 (locked), §54.1 (locked).
- **What must wait:** everything in **D6. Still open**. Do not build an answer to an open question; ask it.
- **Reference device for every "must fit" rule: 440 × 956 CSS px (iPhone 16 Pro Max class).** Secondary
  check widths: 360, 390, 414, 430, 768, 1366, 1440. **95% of customers are on phones.**

Everything below is the *current intended design*, folded together from twelve review rounds. It is a
record of what was decided, not a proposal. Where two rounds disagreed, the later one is written in and the
disagreement is listed in **D7**.

---

## D1. Standing design rules

These are rules a builder checks every piece of work against. A PR that breaks one of them is wrong even if
it does what the ticket said.

### D1.1 The owner's five principles — Locked (§4)

1. The AI agents behind the site must keep getting more capable, continuously, in the backend.
2. SEO must be exceptional.
3. Site and server must be super fast.
4. The look must be **top-class premium and classy**.
5. Extremely user-friendly — and every UI must be built to **convert**. Sales is the whole point.
6. **95% of customers are on phones.** Mobile-first in everything, and mobile is judged first.

### D1.2 The rules he repeats most

- **R1 — No empty strip on the right.** Nothing anywhere on the site may leave an empty gutter, gap or
  dead strip on the right edge: not a hero slider showing two cards, not a thumbnail rail, not a size row,
  not a footer social row, not a product grid. If content does not fill the width, the layout resizes until
  it does. (§56.1, §56.2, §57.1, §57.4, §58.2)
- **R2 — Every slider glides, it does not jump.** Continuous smooth motion everywhere a slider exists, never
  a snap from card to card. This is site-wide and absolute. (§58.1)
- **R3 — Nothing is ever deleted.** Anything the owner asks to remove becomes an **eye-toggle in the
  dashboard, default off**. The code stays, the switch is off. (§48.2, §56, §56.12)
- **R4 — The approved design is not to be redesigned.** He likes the look, the layout language and the
  visual style. Everything in this part is optimisation, correction or addition on top of it. Nothing gets
  re-imagined. (§41.1, §46)
- **R5 — What converts goes first.** Every page is ordered in decreasing importance from the top down. A
  customer does not scroll to the bottom to find the reason to buy. (§46.13)
- **R6 — Beautiful and easy at the same time.** A Gulshan or Banani buyer and a Rangpur village buyer must
  both get through it; a tech-confident 30-year-old and a 55-year-old who is not. For the older and
  less-confident: a large-text toggle, clear word labels instead of icon-only controls in the critical path,
  big obvious buttons at every decision point, and no step that depends on knowing a convention. (§41.7)
- **R7 — Combos are central.** Sets, combos and build-your-own are not a side feature; they carry the
  margin and they appear across home, category, product, bag and thank-you. (§4, §55.2)

### D1.3 Everything is configurable — Locked (§41.2, §41.10, §41.16)

- **Every section on every page is a toggle plus a position.** Edit, drag to reorder, move from one side to
  the other, turn on, turn off, change position — on footer, header, homepage, product page, checkout,
  thank-you page, customer dashboard **and** the admin dashboard. The build's job is to make every piece
  movable; the owner arranges it himself later.
- **Every button name, section title, field label and message is editable from the backend**, in Bengali and
  English. One searchable text dictionary. Nothing hard-coded. Claude's default wording stays as the default.
- **The owner can change button colours himself** from the backend. Claude's colours are defaults only.

### D1.4 Mobile hardening — Locked build rules, from the first PR (§41.3, §43)

These came out of the customer-journey audit (36 steps × 6 viewports) and the owner's own hands-on testing.
They are non-negotiable and several of them are enforced by an automated test that **fails the build**.

| Rule | Why |
|---|---|
| Every form field is **16px or larger** | iOS Safari auto-zooms any focused field under 16px and does not zoom back. This was the single most expensive defect in the build. |
| **`touch-action: manipulation` on every control, globally** | Without it a control keeps the 300 ms double-tap-to-zoom window, so a second tap zooms the page instead of pressing the button. 117 controls had this fault. |
| Every tap target **at least 44 × 44**, padded invisibly where the drawn shape is smaller | Swatches, hearts, chips, icon buttons, small buttons. |
| **`env(safe-area-inset-bottom)`** honoured by every fixed bottom element | Nothing hides under the phone's bottom bar or notch. |
| **Zero horizontal overflow anywhere** | Automated test fails the build if any page scrolls sideways. |
| **No text under 11px** anywhere; **nothing that sells under 12.5px** | Price saving, Cash on Delivery, exchange window, badges, footer. |
| Any horizontal scroller shows a **fade or arrow** | A cut-off item must read as "there is more", never as a broken layout. |
| **Toasts and overlays never intercept taps** (`pointer-events:none` on toasts) | A toast was eating taps. |
| **Minimum 4.5:1 contrast**, checked automatically in CI | Sold-out sizes were at 2.13:1. |
| Sticky bars are **fixed with real space reserved** below the content | So nothing hides under them. |
| **Pinch-zoom on product photos stays** — it is wanted | Zoom is deliberate: pinch, or tap the zoom icon then drag. Never accidental. |

The automated gate fails the build on: horizontal overflow, a field under 16px, or a control without
`touch-action`.

Tested on small (360px), standard (390–414px), large (430px+ including the owner's 440) phones, tablets
(768), and desktop (1366, 1440) — on cheap Android and expensive phones alike.

### D1.5 Motion rules — Locked

- Never more than one thing moving at a time. Nothing loops forever. It respects the phone's
  **reduce-motion** setting. It never shifts the layout. Tasteful, not a flashing banner. (§46.4)
- **The light sweep** (a slow sheen crossing an element) is the house motion:
  - **7 seconds**, 2.2 s delay — the green buttons, and **the EXTAS wordmark in the header on every page**,
    run through the letters themselves. (§56.12)
  - **2–3.5 seconds** — "Free home delivery" on the product page. It crosses the free-delivery words
    **only, not the price**. (§57.4)
  - **4–5 seconds** — the small product-page sweeps: colour label, size block, "All N colours", "In stock".
    (§58.4)
  - Also on: "Choose your size" and the size boxes (§58.4), the footer payment marks (§58.2), "Your bag ·
    3 items" (§58.6), the checkout Need-help strip and the "Add your phone number to confirm" line (§58.7).
  - **Every sweep is a back-end switch** so the owner can turn it off if customers dislike it.
  - All sweeps switch off under `prefers-reduced-motion`.
- **Buy-button motion:** a one-time soft pulse on the primary button when it first comes into view, and
  again if the customer has been on the page a while without acting; a gentle lift and sheen on hover on
  desktop; selecting a size makes the buy bar visibly "wake up" once. (§46.4, §47.2)
- **Entry popups stay banned.** The one exception is the Celebration Overlay (§41.18): a full-screen
  particle animation for an occasion or campaign — balloons, light streaking up, text forming out of the
  particles. It is on a switch, **off by default**, and strictly bounded: the page loads and works behind it
  and it never blocks anything · 2.5 seconds maximum · any tap anywhere skips it instantly · once per
  customer per campaign · never on a slow connection or a low-end phone (it checks first and simply does not
  run) · respects reduce-motion · never delays the first thing the customer can tap · the owner previews it
  before switching it on and sees how many people skipped it.

### D1.6 Navigation rules

- **Edge-swipe back on phones.** A swipe from the left edge closes a sheet or goes back — bag back to
  product, and so on. **It must not fight the horizontal scrollers on the page.** (§46.11, §47.8)
- **On pages with their own sticky action bar** — product, combo, set, bag, checkout, exchange, landing —
  **the bottom nav hides** and the action bar sits at the very bottom. Other pages keep the bottom nav.
  (§8)
- Buttons generally: **make the label text bigger.** The owner raised this as a general complaint, not a
  one-page one. (§58.6)

### D1.7 Honesty rules the build will not break

- **No invented "was" price.** A struck-through price must come from something real: the brand's list price
  (MRP) for genuine branded goods, a real former price out of the automatic price history, a combo or set
  calculation, or a launch/limited-time price with a real end date. Invented original prices are deceptive
  pricing, illegal in several markets, and in Bangladesh customers have learned to ignore them — a premium
  brand that only discounts for real is the one that stands out. The owner keeps full control of where and
  when a "was" price appears (per category, sub-category and product). (§46.14)
- **No generator that writes customer reviews out of nothing.** That single thing is refused. Everything
  else about reviews the owner asked for **is built** — see D3.11. (§46.15, §52.4)
- **Schema is emitted only from what is actually stored** — never a rating the shop does not have. Hidden
  and waiting reviews are excluded from both the average and the schema. (§53.1, §55.3)
- **The address guess is never silently decided.** It is always visible and always one tap to change. No
  system is 100%; the target is ~95% automatic with a visible override and a learning loop. (§46.7)

### D1.8 AI-off principle — Locked (§6, §7)

The UI is deterministic code plus the Rules engine first; AI is an add-on layer. With AI off, every screen
and every flow keeps working, and anything AI already set — size-chart numbers, address mappings, notes,
settings — stays in effect. Nothing in this part may be built so that it only works when AI is on.

### D1.9 How UI work is run — Locked standing instruction (§56.13, §57.5, §58)

- When the owner returns with a review list, the work is **split across two or three agents running at once**
  (Round 12 used five), never one agent working through it in series. The split is by area — for example
  homepage + footer / product page / cart + checkout + thank-you — and the results are **brought back
  together and verified as one build before he is shown anything**.
- Each agent must also **hunt for defects beyond its list** and bring suggestions back.
- Reporting is **section by section with screenshots**, phone first then desktop, not one dump.
- **Audit brief, amended (§46):** every audit must include **finger-drag and swipe gestures**, must **open
  every menu entry**, and must **follow every footer and menu link to its page**. The earlier audits missed
  real defects because the brief did not ask for these.
- **Screenshots before implementing** were required for the optimised checkout, the bag page and the contact
  page. (§46.8, §46.9, §46.16)

---

## D2. The compulsory first-screen rule — Locked (§57.5, §58.4, §58.12)

The owner calls this compulsory. It is the single hardest constraint in the UI.

**The rule.** On a **440 × 956 CSS px** phone, opening **any** product in **any** category, sub-category or
sub-sub-category, the **first screen** — with no scrolling — must reach from the free-delivery strip at the
top down to **the size row and the measurement line that appears when a size is tapped**, with
**1–1.5 px of clearance below it, above the Add to Bag / Order Now bar**.

**Why 1–1.5 px and not more.** Earlier rounds allowed a 49–78 px gap, which let the top edge of the next
block peek above the buy bar. Round 12 closed that: the measurement line was sliding slightly *under* the
buy bar on some pages, and the owner wants it to end dead flat just above it.

**It is implemented as a measured budget, not per-product tuning.** This is the part that matters for the
build:

- Product-page image height used to differ per category and per template, so only the polo lined up. That is
  not acceptable.
- One shared photo height replaced it: **`--pdp-img: min(38vh, 360px)`**, dropping to 35vh / 330px on narrow
  phones. The photo always fills the **full width**; only its height is budgeted.
- The whole first screen is then computed from a height budget, **`PDP_FIT` + `pdp_budget()` in
  `30-product.js`** — **this is the one and only place the rule is configured.** A builder changing
  first-screen fit changes it there and nowhere else.
- It must be **back-end driven**, so a category that does not exist yet — a jacket, say — obeys it
  automatically with no code change. (§58.4)

**Proof recorded:** all 17 demo products **PASS at 440 × 956 and at 390 × 844**, measured one by one, with
the last block clearing the buy bar by **1.25–1.27 px**. It was proved against an injected `jackets`
category with a 54-character title, 7 sizes, 6 colours, a discount and free delivery — it obeyed on first
render with no code change. (§57.6, §58.12)

**Still to satisfy within the same budget:**

- **Trousers:** choosing size 34 must not hide the hip and length figures behind the bottom bar. Fix per
  category. (§58.4)
- **Panjabi and pages like it:** Find my size needs 1–2 px of air below it; the space comes from higher up
  the page. (§58.4)
- **Shirt:** "Tap a size to see its measurements" needs 1 px below it. (§58.4)
- **Every price combination** must be checked inside the budget: with discount / without discount × with
  free delivery / without. (§57.5)
- **Long titles** must not break it: with "Full Floren Spandex Lycra Cotton Premium Polo Shirt" the price,
  the free-delivery line and all five swatches still land on the first screen. (§51, §53.6)

**The set / combo page has the same discipline.** Its stage is capped to `min(38vh, 320px)` so the set
price and both buttons land in the first screen; the page went 4,861 → 4,614 px. (§58.12)

---

## D3. Page by page

### D3.1 Header — Locked except where noted

- **EXTAS wordmark**, larger and more refined than the original. The **light sweep runs through the letters
  themselves**, same 7 s rhythm and 2.2 s delay as the buttons, on every page, off under reduce-motion.
  (§46.16, §56.12)
- **Search sits beside the Bag icon, top right** — moved out of its old position left of the wordmark.
  (§49.1)
- **The EN | বাং language toggle is out of the header entirely, site-wide.** It lives only in the footer,
  written exactly as **"EN | বাং"**. (§49.1, §51)
- **Bag and wishlist-heart icons redrawn** — the originals were not good enough. (§46.16, §47.8)
- **On a phone the product page shows a back arrow in the header**, which is why the breadcrumb is hidden
  there. (§47.2)
- **Hotline on desktop, in the header beside WhatsApp.** (§46.16)
- All buttons, cards and inputs are **softly rounded**: 10 px buttons, 8 px controls, 12 px cards. (§49.1)
- Header sections are toggle-plus-position in the page builder like every other page. (§41.2)

### D3.2 Menu and search

**Menu drawer**

- **The drawer starts below the header**, not from the very top of the screen — full-page top-to-bottom
  looked wrong. (§48.4)
- Contents, in order: a quick row of **Search / Bag / Wishlist / Account**, then **New in**, every category,
  **Build your own set**, **Sets & combos**, a **Help** block, and **WhatsApp plus the hotline at the
  bottom**. (§47.8, §46.16)
- **16 px display type on 54 px rows.** Menu items must be noticeable — the typography and style were
  deliberately strengthened. (§46.16, §47.8)
- The **Sets** entry used to render its sizes on top of each other — fixed. (§46.12, §47.8)

**Sub-menus — proposal, awaiting the owner (§58.3)**

Today the three-dot menu goes straight to the category. The owner asked: if a category has sub-categories,
the menu should open those first and then go. **Claude must explain how sub-menus will work and show it in a
picture before building it.** Not yet approved.

**Search — partly open**

- Tapping the header search opens a **half window from the bottom**. The owner asked whether on a phone it
  should come from the **top or the middle** instead. **Claude to recommend; not yet decided.** (§58.3)
- **Search must also return help articles** — delivery charge, returns, exchange — not only products and
  categories. (§58.3)
- **Not yet built (§58.11):** the search engine has no prefix match, no synonyms, no Bengali keywords and no
  help pages, so "polo shirt" and "গেঞ্জি" return nothing. The search results page has no filter or sort,
  and its "Popular right now" row ignores the query.

### D3.3 Home page

- **Hero slider.** No empty strip on the right when two products show (it left ~18–19 px). It carries
  **12–15 products across all categories, two or three per category, running continuously**. (§57.1)
  - **The white name+price pin sizes itself**: fixed height, width grows with the name, the price beside the
    name separated by a bar, the whole pin semi-transparent. A short name ("Polo") gives a small pin; a long
    one ("Classic Panjabi") no longer breaks out of its box. **The discount case — struck-through price — has
    its own corrected layout.** (§57.1)
  - *Known defect, not yet fixed:* the hero arrows only appear on hover, so a phone cannot step the hero —
    drag only. (§58.11)
- **Trust row under Shop now / Shop sets.** The two trust lines become **one line with a bar between them**,
  using the **whole width**. The copy is **not** to be shortened to make it fit — "Cash on Delivery **all
  over Bangladesh**" was cut while free space remained on the right; the line is optimised instead.
  (§57.1, §58.1)
- **Winter collection row.** Desktop shows **three** products, not two, so the right side is not empty. On
  the phone it is a **slider** (swipe and auto-advance) accepting as many pictures as the owner adds. **The
  sliding cards pass *behind* the "Winter 2026" banner card, up to its border — not over it.** (§56.1)
- **Flash sale.**
  - The countdown sits **on the right on the phone too**, as it already does on desktop, with the type
    scaled to fit — it must not drop below and make the section tall. (§56.1)
  - **No HRS / MIN / SEC labels — numbers only.** **"Ends in" on one line** (not "Ends" with "in" stacked
    underneath), then the clock. (§57.1)
  - The grid is 2 columns × 2 rows and **each row is its own independent slider** — with 100 flash products,
    row one slides through about ten and row two through another ten. (§57.1)
  - **Both rows auto-slide smoothly and in opposite directions at the same time** — the top row drifts left,
    the bottom row drifts right. (§58.1)
  - *Known defect, not yet fixed:* the countdown is a painted-on string that never ticks and resets on every
    render. (§58.11)
- **"What customers say."** Up to **ten** reviews, not three, and it **auto-slides slowly to the left on its
  own** — not drag-only. (§56.1, §57.1, §58.1)
- **"From the journal."** A slider of the last ten posts; a tap opens the article. Accepted as built. (§57.1,
  §58.1)
- **"Find your size" band.** The icon sits **immediately before the "F" of "Find"**, the text starts there,
  and the second line runs the full width — no large empty block top-left and no empty right side. (§57.1)
- **Floating WhatsApp icon on the home page**, vertically centred, **drifting about 1 cm up and 1 cm down
  with the scroll** rather than sitting rigid. Its position is under review — see D6. (§57.1, §58.10)
- Homepage sections are toggle-plus-position and reorderable. (§41.2)

### D3.4 Category page

- **Breadcrumb stays visible, and JSON-LD breadcrumb structured data is added as well.** The owner asked
  whether the visible trail could be dropped in favour of back-end structured data only; the answer given and
  accepted was keep both. Switch: `category.breadcrumb`, default on. (§57.3, §57.6, §58.3)
  - *Known defect, not yet fixed:* the breadcrumb "Home" link is a 35 × 19 px tap target, under the 44 × 44
    rule. (§58.11)
- **Category name stays, with a short line under it.** (§57.3)
- **Filter / Recommended / On sale controls.**
  - All three get the **same treatment, same getup, same box size and same font size** — the transparent box.
    "Recommended" was white-backgrounded with type too small; the word "Filter" was breaking out of its box.
    (§46.12, §57.3, §58.3)
  - **"Recommended" is a real button plus a listbox anchored 6 px under the control** — not a native
    `<select>`. A phone browser draws a select's option list itself, pinned to the bottom of the screen,
    which is why the popup opened at the bottom of the page and no CSS could have moved or recoloured it.
    (§58.10)
  - **The sticky filter bar is a direct child of the main column** so it actually sticks; inside a short
    wrapper it slid away after a few hundred pixels. (§58.10)
  - The filter row and the sort row sit level with each other. (§46.12)
- **The chip row** (Set price · ৳800–1,200 · Regular fit · Slim fit) — **all chips the same size, fitted to
  the width.** (§58.3)
  - **How "Set price" works, as answered to the owner:** the chip is a **yes/no filter**; the ৳800–1,200 band
    is hard-coded; the real set tiers come automatically from **Admin → Smart Rules**. The popup itself is
    fine as it is. (§57.3, §57.6)
- **Bundle section ("Start bundle").** The icon goes before the text or is positioned properly — it must not
  sit on top and waste the space to its right. (§57.3)
- **The "Pick any of these" bundle slider is ONE row, not two.** It slides; the list below grows downward as
  more products come. **Two cards per screen, not three** — at three the products are too small to read.
  The owner marked this mandatory. (§58.3)
- **"Find my size" on this page is bigger and bolder** so it catches the eye. (§57.3)
- **Floating WhatsApp icon on this page and on every page**, with a **back-end switch for which pages it
  shows on and where it sits** (`fab.whatsapp`). (§57.3)
- **Category SEO text.** Every category and sub-category (including brand-based ones) gets its own written
  description, hand-written or AI-generated. Honest point recorded: **text that only lives in the backend
  gives no SEO benefit** — Google has to read it on the page. So it is a **visible block at the bottom of the
  category page, collapsed behind "Read more"**. Meta title and meta description stay backend-only fields.
  (§41.11)
- "Trousers category, Set price available on the left" — fine as it is, no change. (§46.16)
- **Known defects, not yet fixed (§58.11):** `cat_banner()` is hardcoded to polos/tshirts, so a set rule on
  any other category silently shows nothing · `cat_bundlePicks` only ever shows the first 6 styles, so styles
  7+ are invisible however long you watch · every filter tap re-renders the page and restarts the conveyor at
  0, so the shopper loses their place.

### D3.5 Product page — the buy block

This is the most-reviewed page in the build. Order of the buy block, top to bottom:

**photo → eyebrow → title → rating → price row → colour → size row → measurement line → Find my size →
stock line → trust row → Delivery | Exchange | Returns → offers → details → reviews → Q&A → product rows**

**Photo and gallery**

- **The photo fills the full width.** Only its height is budgeted — `min(38vh, 360px)`, 35vh/330 on narrow
  phones. Capping the height without filling the width left the image sitting in a corner with empty space at
  the side; that was a Claude bug and is fixed. (§48.1, §57.6)
- **The thumbnail strip fills the width** — no white strip on the right — for **4, 5 or 6 images alike**.
  **A minimum of four images is enforced at upload**; above four, any number fits. (§52.2, §57.4)
- **Thumbnails follow the arrows.** The arrows change the main photo and the thumbnails move with it. **The
  main photo is swipeable by hand**, and swiping must keep working after the arrows have been used. (§58.4)
- Thumbnails below the main image **or** down the side — a per-store / per-product option. (§41.4, §53.5)
- Pinch-zoom stays; the zoom icon then drag is the deliberate path. (§41.3)
- **The "POLOS · SKU EX-POL-1001" line under the thumbnails is removed** and that space is used. (§48.1)
- **The model badge** ("Model 5'10" · 72 kg · wears L") uses a **shadow or better placement** — the solid slab
  behind it looked bad. It shows only on products where the owner ticks "has model photo". (§5, §57.4)

**Title**

- Wraps on whole words, balanced across its lines, **clamped at two lines on a phone and three on desktop**,
  ellipsis after that. (§51, §53.6)
- **The title has the full column width** because the action icons are a floating column, not inline. (§52.2)

**Price row — Style B is the live default, Locked (§54.1)**

- `৳ 850` — **a space after the Taka sign** (§48.1) — then a space, then a **thick 5 px vertical bar in the
  brand colour, vertically centred on the price** (`align-self:center`), then a **larger truck icon** and
  **Free home delivery** in brand green.
- **The truck icon is slightly larger than the "F" of "Free".** (§57.4)
- **Price and "Free home delivery" both go up one or two type sizes**, and the truck icon with them. (§57.4)
- **The price row sits further right** — the price and its icon move right by one or two spaces, and the
  COD | bKash | Nagad line is pushed further right too. (§58.4)
- **The price is bolder on desktop**, and the part after the bar a little bolder too. (§56.6)
- **When the product is not free delivery**, the same slot after the bar carries the payment line instead —
  `COD | bKash | Nagad | Card` in the quiet grey — so the line is never half empty. (§54.1)
- **When the product is discounted**, the COD | bKash | Nagad line is dropped and the **struck price, the
  −21% and "Save ৳450" go on the far side of the bar**, with the bar in the middle, two spaces before it and
  two after, cut to one space each if it will not fit. Switch `pdpPrice.discountAfterBar`, **default on**.
  (§58.4)
- **Style A stays in the backend as the per-product alternative**: a full-width free-delivery strip under the
  price, with a soft shadow, on one line — "Free home delivery | COD available" and "| All over Bangladesh"
  where the screen is wide enough, icon and type at 15.5px. (§49.2, §51, §53.5)
- **Every combination must be checked** — with/without discount × with/without free delivery. (§57.5)
- A product's **free-delivery flag** set at upload, or a running **free-delivery campaign**, or the **cart
  threshold** (free over ৳1,500 / ৳2,000 / ৳2,500) all feed this same place. (§48.1, §48.2)

**Colour**

- A **row of dots** for scanning, with **the selected colour's name written above the row** — "Colour: Deep
  Navy". Both, deliberately: dots alone fail in this market because cheap phone screens over-saturate and
  navy and black look identical in low light, and a 55-year-old will not risk ৳1,200 on a dot he cannot read;
  names alone are slow to scan and eat the first screen. (§46.2)
- **Four colours or fewer**: the name may also sit under each dot — a per-product switch. (§46.2)
- Every swatch carries its colour name as its **accessible label**, and a **long-press shows the name**.
  (§46.2)
- **A single-colour product shows only the words "Colour: Black" — no swatch dots.** A combo reads
  "Colour: Black & Navy combo". (§48.1)
- **"All N colours" is clickable** and opens a popup showing every colour with its own photo. Tapping a
  colour selects it and goes to Add to Bag / Order Now as a single order. The reason this exists: the page
  opens on black by default and many customers never work out how to switch — which is why big sites split
  colours into separate products. EXTAS keeps one product and solves it with this popup. (§48.1)
  - **It always sits level with the last colour swatch** and moves right as colours are added. (§57.4)
  - **With only three colours it is pushed right, onto the Size-chart button's line**, with its type raised.
    It must find that position **automatically for 3, 5 or 6 colours**. (§58.4)
  - Its type is bigger by one or two steps. (§57.4)
- **"Colour · Olive" label type is bigger**, and **"Size · Choose your size" is the same size as the Colour
  label**. (§57.4)
- **The colour note** ("Deep navy. Can look almost black in low light — see the daylight photo") moves off the
  first screen. Switch `pdp.colourNote`, **default off**. The first screen ends at the swatches with a clean
  gap — no half-cut line of text underneath. (§53.4)
- **"See true-colour photo"** — switch `pdp.trueColourLink`, **default off**. (§53.4)
- When the owner switches any of these off, **the space closes up automatically**. (§53.4)
- **The gap between the swatches and "Size · Choose your size" comes up 5–6 px**, so Size starts just under
  the swatches — while the **real gap above the buy bar holds**. (§49.2, §52.2, §57.4)

**Size**

- Order: **Colour → Size → then Find my size.** Find my size comes **after** the size row, not before. (§56.5)
- The size row is "Choose your size" with **Size chart on the right**, then S M L XL XXL.
- **The size pills are much bigger with bold type, on the scale of the price.** "XXL" must read clearly.
  (§56.5)
- **The size boxes fill 100% of the width** — no empty strip on the right on the phone. **When 3XL or 4XL is
  added they re-size themselves and stay on one line.** (§57.4)
- **Tapping a size selects it. It never adds and never increments.** Tapping L four times leaves one L
  selected. (§46.6)
- **The measurement line** under the sizes: **the size letter and the numbers bold, font one size up**, with
  **1–1.5 px of clearance below it** on every page. (§57.4, §58.4)
- **The cm/inch toggle is removed from the product page.** Inches on the page; **cm belongs only inside the
  size-chart popup.** Switch `pdp.unitToggle`, **default off**. (§56.5)
- **The "Runs small / True to size / Runs large" fit bar is removed.** Switch `pdp.fitBar`, **default off**.
  (§56.5)
- **The Size-chart control** runs **from the right edge of the last size box to the right edge of the
  screen**. It is a bordered control (110 × 44), not a text link. Two or three visual versions were to be
  tried and the best picked. (§47.3, §57.4)

**Find my size**

- Height and weight **only** — no fit-preference question, no build question. (§5)
- Size logic is set **per category** and overridable **per product**: a 70 kg, 5'8" customer needs one size in
  a T-shirt or polo, another in a shirt, another again in a panjabi. The owner enters and adjusts the
  height/weight bands in the backend; AI proposes the bands from the measurement chart and from past orders
  and returns, and the owner approves or edits; it learns from exchanges and flags a band that keeps producing
  "too tight". (§41.5)
- **The card aligns to the same right edge as the Returns box**, so the text fits on one line and the card is
  shorter. (§57.4)
- **The sheet is bigger and clearer** — type up, window two sizes larger. (§57.4)
- On panjabi-type pages it needs **1–2 px of air below it**, found from higher up the page. (§58.4)
- A customer's saved size profile feeds it everywhere. (§41.17)

**Stock and trust lines**

- **"Only 3 left in Olive, size L" stays** — it creates urgency — but it currently appears too far down and
  **a better place must be found**. (§57.4)
- **"100% original" goes on the same line** as the exchange window and free delivery, not below, and that
  line is optimised. (§56.5)
- **Those lines must not blend into the background — raise the contrast.** (§56.5)
- **The offer boxes and the 72-hour / Free / 100% original row align to the same right edge** as everything
  else on the page. (§57.4)

**The floating action icon column — heart / share / WhatsApp**

- **46 px circles stacked vertically down the right**, positioned **over the title block** so they add no
  height to the page — which is what let the colour row move up. (§52.2)
- **Desktop: at the far right, 2–3 px to the right of the Order Now button's line.** (§56.4)
- **It floats with the scroll on both desktop and phone, staying vertically centred in the window — not
  pinned** — and it **drifts about an inch up and an inch down and settles**: visibly alive, but always in
  the same place. (§56.4, §57.4)
- **Phone home position is 38% of the viewport, not 50%.** At 50% it parked permanently on the fifth
  thumbnail on every product's first screen. (§57.6)
- **It must never ride up over the title. The title's line is its ceiling; it never climbs onto the
  photograph.** (§58.4)
- **Desktop: hovering the WhatsApp icon shows a small floating label.** (§56.4)
- **Which icons show — or the whole panel off — is `pdpIcons.panel / wish / share / whatsapp`.** The same
  applies to any floating icon anywhere. (§53.2)
- **The WhatsApp glyph is the proper transparent WhatsApp mark**, not a generic speech bubble. One shared
  `waGlyph()` draws every WhatsApp control on every page. (§58.1, §58.10)

**Share**

- Tapping Share **slides a row of icons out in place, full width** — Facebook, Messenger, WhatsApp,
  Instagram, and copy link — each in its own brand tint. It is not a modal. (§53.3)
- **It floats as an overlay under the icon column, so nothing below it moves.** Measured: short title, long
  title, and long title with share open all leave the colour swatches at the same place and the gap above
  the buy bar unchanged. (§54.2)
- **No white panel behind it.** Fully transparent background — only the icon tiles, each with its own shadow,
  with the page showing through between them. **The tiles are a little smaller.** (§56.3)
- **It closes itself**: tapping any share option closes it, tapping anywhere else closes it, and if nobody
  uses it, it closes on its own after 8 seconds. Tapping Share again toggles it. (§54.2)

**The buy bar**

- **Sticky bottom buy bar on the phone**, always reachable, slimmed. The bottom nav hides on this page.
  (§41.9, §47.2, §8)
- **Desktop: Add to Bag and Order Now must be visible in the first window.** If a customer cannot see them
  without scrolling, the will to scroll drops. Offers move further down to make room. (§56.6)
- **Add to Bag and Order Now must not look identical.** Add to Bag gets a **different but harmonious**
  colour. Claude shows **4–5 numbered combinations in one image** so the owner can pick — he may answer
  "number 1", or "number 1's Add to Bag with number 3's Order Now". **Option 1 is shipped pending his pick.**
  The pair is `PDP_CTA_STYLE`, **shared with the set page** so one change moves both. (§58.4, §58.12)
- **Add to Bag adds exactly one.** Repeat taps within one second (1.2 s in the build) are ignored. (§46.6)

### D3.6 Product page — below the buy block

- **Delivery | Exchange | Returns are one bar-separated row on the phone** (three stacked rows were 303 px;
  one row is 121 px) and **three columns on desktop** (387 → 174 px). (§46.13, §47.2)
  - **The Delivery row shows the value, not the word "Details".** If the product is flagged free delivery it
    says **Free**, highlighted; otherwise the normal rule applies automatically. Toggling the product's
    free-delivery checkbox flips it, and the cart-threshold version feeds the same place. (§48.2)
  - **The Exchange row shows the window** — "72 hours" today — nicely set, with a round badge if that looks
    good. **The value always comes from the Rules setting, never hard-coded in copy.** (§7, §48.2)
  - **The Returns row wording is still open.** "No return" reads badly; a smarter, still-honest phrasing is
    needed. (§48.2 — see D6.)
  - **All three stay clickable for the full rule.** The owner controls which of them show and what each says —
    he may want Delivery only. (§46.13, §48.2)
  - **Only one panel opens at a time**, and **the opened panel's text fills the width and runs line by line**,
    from under Exchange across to Returns — not a tall narrow box. (§47.2, §57.4)
- **Fabric & care opens to its first line only on every screen size** — "Fabric · 100% combed cotton piqué ·
  220 GSM" — with "Read more" for Care and the rest. (An earlier fix applied only on desktop; corrected.) The
  owner likes it as it now is. (§49.2, §51, §57.4)
- **All block names (Fabric & care and the rest) are editable by the owner.** (§48.2)
- **Reviews on the page: three at most, the ones with photos first**, the one without a photo last. **They
  slide — 3 to 5 of them — instead of stacking one under another.** (§56.5, §57.4)
- **The "Ask on WhatsApp" icon in the Q&A block is made stronger and better looking.** (§56.5)
- **The product rows at the bottom — you-may-also-like and recently viewed — all slide automatically.** Two
  rows, one category each, with a **back-end option to set which category each row shows**. (§57.4)
- **Every block on this page has an on/off switch and a position**, including "See true-colour photo".
  Nothing is hidden by default that the owner has not switched off himself. (§46.1)

### D3.7 Product page — templates, colours and URLs

- **At least 3 product-page templates** (target 4–5), selectable per category or per product, so the owner can
  A/B them: **T1 Classic, T2 Editorial, T3 Fit-first** now; T4 Video-first and T5 Combo-push later. A/B
  testing is an **optional module with on/off (global and per test), default OFF**, with a per-template
  conversion report. (§4, §5)
  - *Bug fixed on the way:* `pdp_t3Card` referenced an undefined variable, which threw and left the **whole
    T3 template blank** — `contrast-collar-polo` rendered nothing at all. (§57.6)
- **Per-colour URLs — the premium way to get Fabrilife's benefit without their cost (§46.3):**
  - **One product page, all colours on it.** Clean and premium.
  - **Every colour still gets its own shareable, indexable URL** — `/p/essential-pique-polo/navy` — with its
    own title, meta description and Open Graph image, opening the page with that colour already selected.
  - **Every colour is its own row in the product feed**, with its own image, so ad campaigns stay per-colour
    and the ad lands on the right colour.
  - **Canonical is configurable per category**: point all colours at the main product (concentrates SEO) or
    let each colour stand alone where the copy genuinely differs. **Default: canonical to the main product.**
- **Size charts live in e-commerce, not the ERP.** The ERP holds only size labels (M/L/XL, 30/32). Charts are
  per product type and fit, with type-specific fields (tops: chest/length/shoulder/sleeve; bottoms:
  waist/hip/thigh/length/leg opening; boxers: waist relaxed/stretched); default by category → sub-category →
  per-style override; auto-attached on product upload by category + fit; inches entered once, cm computed;
  ease per fit feeds Find my size (rule-based, works with AI off); a how-to-measure diagram per type; quick
  fill by grid, paste from Excel, or optional AI read from a spec-sheet photo; a warning when a linked
  product has an ERP size label with no chart row. The same data feeds the PDP chart, the inline measurement
  line, Find my size and the Fit-first table. (§6)

### D3.8 Size-chart popup

- **One fixed modal.** No page content visible above it, no second scrolling area, and **it does not scroll
  with the page.** (§46.12, §46.17, §47.3, §58.4)
- **It floats with a gap on all four sides**, so a sliver of the page shows behind it. (§51)
- **Full height on the phone**, starting below the header. (§47.3, §48.3)
- **Tapping a size row in the chart selects that size on the product.** (§7)
- **Measurement columns are per product.** Not every product has shoulder or sleeve. **A measurement that has
  not been entered does not render — no empty box, no dash.** A polo may show only chest and length, and the
  How-to-measure list drops to match. (§46.17, §47.3)
- **"Not sure? / Find my size" and "Still unsure? / Ask on WhatsApp" sit side by side as two equal cards**,
  exactly where the empty space was, on **the same neutral background** — the green-on-white pairing is gone
  and green only appears on hover of the WhatsApp one. The long "Still unsure…" sentence is gone; it is
  inside the WhatsApp card. **How to measure returns to full width underneath.** (§48.3, §49.3, §51)
- The **"Size chart" heading has a proper design**; "How to measure" stays as it is — it is good. (§46.17)
- **cm lives only here**, not on the product page. (§56.5)

### D3.9 Combo / set page

- **2–3 template options**, owner-customisable: **C1 Stacked and C2 Step-by-step** now, C3 Lookbook later.
  (§4)
- **3–4 items per set supported, not only 2.** (§4)
- **Main image is the composed combo image**; below it a gallery pulling **2–4 extra images from each
  component product**. (§4)
- **Price display very clear and attractive**: set price / price separately / "save ৳ and %". (§4)
- **Combo colour naming uses "+"** — "Black + Navy", never a single colour. Auto-name is
  "Name — Colour + Colour". (§4)
- **First screen:** the stage is capped to `min(38vh, 320px)`, so **the set price and both buttons land in
  the first screen**. Before that the page opened on one enormous photograph with price, saving and buttons
  all below the fold — the exact fault the product page had just been cured of. Page height 4,861 → 4,614 px.
  (§58.12)
- **The set page follows `PDP_CTA_STYLE`**, so the button colour pair changes on both pages at once. It used
  to use green + black while the product page used the owner's chosen pair. (§58.12)
- **"Buy together, save more" / popular pairs show three per row** where three fit, not two. (§58.4)
- **The item thumbnails (Item 1 Navy, Item 2 White) get a deeper shadow** so they catch the eye — **not a
  black border**, because selecting one already turns it black. (§58.4)
- **Claude goes through this page A to Z personally**, not only through an agent. (§58.4)
- **Build-your-own set:** a public page, no account needed; entry from home and category banners, a PDP line
  and the menu; adds as **one bag line**; normal guest checkout; account auto-created after the order;
  logged-in users get their saved size preselected; **shown only in enabled categories**. (§5)
- **The owner defines exactly what customers may combine** — category ↔ category rules (Polo+Polo,
  Shirt+Chino) or SKU-to-SKU lists, each with an item count, a fixed tier price, dates and stock-awareness.
  The builder shows only allowed products. **The owner's own fixed combos are fully free-form.** (§6)
- **Customer-built sets sit behind a global and per-category toggle, default OFF.** Only the owner's fixed
  combos are live until he turns them on. (§5)
- **Auto-apply combo price when the bag matches a combo**, per-combo toggle. (§4, §5)

### D3.10 Add-to-bag sheet

- **Three behaviours, the owner picks:** a small toast and stay on the page · a slide-in mini-cart · go
  straight to the cart page. **Default: slide-in mini-cart** with "Continue shopping" and "Checkout". (§41.9)
- **Device difference: desktop = right-side drawer, phone = bottom sheet.** The right edge of a phone is the
  hardest place for a thumb and the bottom is the easiest. (§46.5)
- **A short sheet rises from the bottom with a grab handle; a tall one (the size chart) fills the screen with
  no gap.** An earlier modal fix made every phone modal full-screen, so the add-to-bag sheet looked like a new
  page — corrected. (§47.1)
- **Contents**, each one the owner's switch: what was just added (photo, name, size, colour, quantity), the
  bag total, the free-delivery progress line, "Continue shopping", "Checkout", and **one cross-sell row**.
  (§46.5)
- **Type sizes: product name and size much bigger and bold. Price bigger. "Bag · 3 items" bigger.** (§58.5)
- **"Free delivery unlocked": when the order does not qualify for free delivery, do not raise delivery there
  at all** — put something smarter in that space. **What goes there is still open.** (§58.5)
- **If the same size and colour is already in the bag it does not silently become 2** — the sheet says
  "Already in your bag" with an explicit way to increase. (§46.6)
- **The two-size catch (L+XL) fires here**, at the moment the second size is added, as well as in the bag.
  (§5)

### D3.11 Bag / Cart page

Renamed **Cart**, as asked. (§56.7)

**Heading and spacing**

- **"Your bag · 3 items" needs 1–2 px of gap from the EXTAS header band** — it is touching it. (§58.6)
- **"3 items" gets more space after "Your bag"**, type two or three sizes bigger, bold, **with the sweep
  across it** — still one or two sizes smaller than "Your bag" itself. (§58.6)

**Order summary**

- **The Delivery row is out of the order summary.** It appears, highlighted, **only when delivery is actually
  free** (product flag, campaign, or the cart threshold reached). Otherwise item prices and total only.
  (§49.4)
- **Lines use the product's short name, not "Item 1"**, and **the price is bold**. (§56.7)
- **Order summary type a step bigger.** (§58.6)

**Buttons**

- **The Checkout button is 58 px, 17 px type, weight 800, with a real gap above it** — and **its label must be
  bigger still**. (§49.4, §58.6)
- **"See the set" is too small inside its button — bigger.** (§58.6)

**Warnings and offers**

- **The two-size warning** ("Same Oxford Cotton Shirt in M and L") is **shorter and the full width of the cart
  column** on desktop — not a differently coloured strip floating in the middle. (§56.7)
- **The offer block is full width and shorter** — it did not reach the edge and was too tall. (§56.7)
- **An offer shows whenever that space is not being used by a warning.** One product in the cart, any product
  — there must still be a sensible offer there, not only when a polo + polo combo applies. (§56.7)
- **On desktop with four or five items the offer must not scroll out of sight.** (§56.7)

**Upsell — the shared block (§55.2)**

One block, used on both the cart and the thank-you page, every part switchable:

- **A set or combo line** when one applies — "Polo Duo · Take both for ৳ 1,500 · save ৳ 200" (`upsell.setLine`).
- **A row of products to add**, chosen from the same category as what is already in the bag, never repeating
  something already there — swipeable on a phone, a four-column grid on desktop.
- **Three reassurance cards** — Cash on Delivery, 72-hour size swap, 100% original — the three things that
  actually close a sale in this market (`upsell.why`).
- Copy on the cart: **"Goes well with your bag"**.
- **It moves up 2 px, and the section gets 1–2 px of gap below it** so the polo images underneath sit
  properly. **The gap below the offer box must equal the gap above it** — there was a gap above and none
  below, so the box ran into the product photos. (§56.11, §58.6)
- **"See all" must go to New in.** It did not, because the floating WhatsApp button was sitting dead centre of
  the link and eating the tap. (§58.6, §58.10)
- Cart page height went 2,330 → 3,065 px once the upsell was added — the page now carries on to the footer,
  as asked.

**Help and WhatsApp**

- **The help block keeps its heading only.** "We reply 10 am – 10 pm" and the rest come out, and the WhatsApp
  button is seated properly **inside** the section — it was half outside its box and the colour did not match.
  It uses the shop's green. (§48.6, §47.9)
- **"Message us on WhatsApp" above "Total · Checkout" is removed** on the phone — it competed with the
  Checkout button and the footer already has one. Switch `bag.waAboveTotal`, **default off**. (§56.7)
- **No floating WhatsApp on the bag page**; the one inside the help block is enough. (§49.4)
- **"Send my bag on WhatsApp" is not a default** — switch `bag.waSendBag`, **default off** unless the owner
  turns it on. (§56.7)

**Quantity guards — Locked (§46.6)**

1. Tapping a size selects it; it never increments.
2. Add to Bag adds exactly one; repeat taps inside ~1 second are ignored.
3. An existing same size + colour line does not silently become 2 — the bag line shows a stepper.
4. **A sanity line:** any line at 3 or more of the same size shows **"3 pieces of the same size — is that
   right?"** with a one-tap **"Make it 1"**.
5. Quantity is editable at checkout too, so a customer who arrives at a frightening total can fix it there
   instead of leaving.

**Other cart behaviour**

- **Order Now (primary, direct checkout) plus Add to Bag**, with a global/campaign skip-cart toggle. Add to
  Bag must never confuse or lose the shopper. (§4, §5)
- **Free-delivery progress line**; **coupon behind "Have a code?"**; **auto-apply the combo price when the
  cart matches a combo**. (§4)
- **The two-size (L+XL) soft card**: it triggers only on the **same product, same colour, adjacent sizes**.
  Buttons "Help me pick my size" / "One is for someone else". Evidence order: the size kept in past orders →
  Find my size → an inline height+weight question. An honest note: after delivery it is an exchange with a
  charge, not a return. "Keep both" tags the order "2 sizes — check" → an automatic WhatsApp template right
  after the order with reply buttons (Keep both / Only L / Only XL), which updates the order before packing
  and **works with AI off**; SMS fallback with a one-tap link; no reply by packing → a yellow note and a
  one-line script for the confirmation caller; still unclear → ship both. "For someone else" leaves a note and
  asks nothing. Frequent two-size products feed the size-issue report. (§5, §6)
- **Bug fixed:** tapping a product from the cart opened the home page instead of that product's page. (§56.7)
- **Screenshots to the owner before implementing** further bag rework. (§46.9)

### D3.12 Checkout

**The shape — Locked (§4, §5)**

Only three inputs: **name, phone, full address.** Progressive disclosure: address → delivery charge → then
payment options appear. Payment is three choices — **Cash on Delivery / Card & Bank / Mobile Banking** —
and tapping Mobile Banking reveals bKash or Nagad. Confirm button reads **"Confirm Order · ৳total"**.

- **Phone is free-form** (+880 / 880 / 01…). The system validates against Bangladeshi number patterns and
  **suggests a fix, never blocks**. No rigid 11-digit mask.
- **One free-text address box, no district or thana dropdowns.** It was 3 rows; it is now **2 rows with a real
  example** in it. (§4, §47.4)

**Address zone detection — the gazetteer, Locked (§46.7)**

This replaces the earlier decision to show nothing at all on the front end.

1. **Before anything is typed**, the delivery line already reads **"Dhaka city ৳60 · Outside Dhaka ৳120"**, so
   nobody is confused while typing.
2. **A gazetteer, not keyword matching**, down to para / block / road level, each entry mapped to thana → city
   corporation → delivery zone, plus the surrounding districts. Sources: the Bangladesh Post Office postcode
   list, the OpenStreetMap Bangladesh extract, the courier companies' published coverage and zone lists
   (Steadfast, Pathao, RedX), and the DNCC / DSCC ward lists.
3. **Matching that works on real Bangladeshi addresses**: Bengali and English, common misspellings (Nikunja /
   Nikunjo / নিকুঞ্জ, Khilkhet / Khilkhat), and **the longest known place name in the string wins**, so
   "Mirpur 12" beats "Mirpur".
4. **A confidence score.** High → set the zone and show it. Medium → set it but show it as an obviously
   editable chip. **Low or none → one short question with two big buttons: "Inside Dhaka city" / "Outside
   Dhaka"** — never a 72-option dropdown. If outside, a type-ahead district field.
5. **The guess is always visible and always one tap to change** — "Dhaka city · ৳60 · change". The system
   never silently decides something the customer cannot see.
6. **It learns.** When the courier returns the real zone and charge, that is compared with the guess;
   mismatches land in an admin review queue and approved corrections go back into the gazetteer.
7. **The owner controls it**: edit the zone table, add an area, set the charge per zone, set the outside-Dhaka
   default (he says ৳120–130). There are only **two zones: Dhaka City / Outside Dhaka City**, and checkout
   shows only the one that applies.
8. Optional extras: a map pin-drop fallback and "use my location" for customers who allow it.
9. **Honest note recorded:** no system is 100%. Target ~95% correct automatically, with a visible one-tap
   override and a learning loop.

**Layout and type — phone**

- The whole page was compacted: **1,769 → 1,447 px**. The delivery section is fully visible and the payment
  section starts on screen. (§46.8, §47.4)
- **The header strip is not all white** — it gets a tint or a shadow. (§56.8)
- **The order summary bar is a highlighted element** with a shadow, a 19 px bold total and a chevron pill, and
  **tapping it shows what is inside**. **The price beside "Show order summary" goes two sizes bigger** and
  **"Show order summary" one size bigger**. (§46.8, §47.4, §58.7)
- **The expanded summary gets a tint, not white**, and **closes from the chevron, from tapping the bar itself,
  or from tapping anywhere outside it.** (§56.8, §58.7)
- **2–3 px more gap between the summary bar and "Where should we deliver?".** (§56.8)
- **Subtotal and Delivery — both the labels and the amounts — bigger.** (§58.7)
- **"Add your name to continue" becomes confirm wording — "Add your phone number to confirm"** — more
  highlighted, with a better background and the sweep. (§58.7)
- **Quantity is editable here.** (§46.6, §56.9)
- **The door note is one bold line:** "Returning at the door? Pay only the delivery charge to the rider."
  (§47.4)
- **"Ordered before? Log in" is hidden** behind the owner's eye-toggle. (§47.4)
- **Confirm button 58 px, amount at 19/800, with the slow sheen.** The checkout keeps its button sweep.
  (§47.4, §56.12)
- **The marketing opt-in "Send me offers" is ticked by default**; the customer can untick it. Tracking-link
  SMS goes to **every** customer automatically with no checkbox — the opt-in is a separate, honest one for
  offers and new arrivals on SMS/WhatsApp. Order-related calls go to everyone; promotional calls only to
  opted-in customers. Standard wording. (§4, §5, §56.8)
- **The return/exchange charge sentence** comes from Rules: a return means a return delivery charge applies;
  if the mistake was ours, no charge. (§5)

**Need help / WhatsApp**

- **Phone:** keep it where it is, balance the colour. **Transparent background, nicely styled WhatsApp
  wording, and the sweep across it. The "Need help" text is bigger — there is space on both sides.**
  The button is solid green. (§47.4, §56.8, §58.7)
- **Desktop:** the whole **"Need help with your order?" strip is removed** — its colour matched nothing.
  Switch `checkout.helpStripDesktop`, **default off**. Checkout content starts directly under the header,
  with a gap. The **Need help / WhatsApp box then becomes one line placed below the order summary with a clear
  gap, and floats with it.** (§56.9)

**Layout — desktop**

- **The order summary box starts level with the "Where should we deliver?" box**, not with the "Checkout"
  heading, and **floats with the scroll, vertically centred**, so the customer always sees what they ordered.
  (§56.9)
- **The EXTAS mark moves to the left of the header**, and the space that frees up is used for something useful
  — **what goes there is still open.** A Bag / Delivery & payment / Done steps bar is currently in that space
  pending his answer. (§56.9, §56.12)
- Checkout's bottom-sheet behaviour on the phone is fine as it is. (§48.8)

### D3.13 Thank-you page

- **A big check and the order number** at the top. (§5)
- **"Track your order" is a full-width primary button, 54 px, in the hero**, directly under the order number
  and the SMS line. **The lower button is renamed "Order details"** so the two do not compete. (§49.5, §51)
- **Desktop: "Track your order" goes beside the Copy button, on the right**, not below it. (§56.10)
- **The auto-created account is shown**: username = phone, password = phone, changeable. **No address block.**
  **The "Your account is ready" box is cut down on the phone** — it was too tall. (§5, §56.10)
- **COD wording:** "Total due ৳X — pay the delivery person when you receive the order." (§5)
- **Order editing note:** the customer can edit the order from the dashboard until it enters processing, **max
  2 edits per order**. (§5)
- **"What happens next" comes out** — it duplicates the tracking the customer sees in the dashboard. Switch
  `thanks.nextSteps`, **default off**, on phone and desktop. (§56.10)
- **Page order: the first block → Complete your look → Your order.** (§56.10)
- **Desktop right column ends at "Questions? Message us on WhatsApp".** **"Keep shopping" and "Order details"
  move to the LEFT column, under Your order, after three or four upsell product boxes, as big buttons filling
  the width.** (§56.10)
- **"Questions? Message us on WhatsApp" must be full width** — it is not, and this was asked for before.
  (§58.8)
- **Upsell runs down to the footer.** The shared block (`upsell.thanks`) with copy changed for this page:
  **"Add to this parcel — anything you add in the next few minutes ships with the same order, no second
  delivery charge."** Page height 2,026 → 2,877 px. (§48.7, §55.2)
- **The same gap below the upsell box as above it**, and **the "100% original" card at the bottom must not
  collide with whatever follows.** (§56.11)
- **Bug, which the owner called very important — fixed:** "Add to this parcel" added the product and updated
  the total, but **the added product never appeared** in the order on the dashboard or in Order details —
  the new total showed against the old product list. The add-on is now a real order line, so order detail,
  My orders, the invoice, admin and the exchange flow all see it. **Old orders self-heal.** Proven by 14
  assertions. (§58.8, §58.12)
- **A nice upsell** was asked for from the start; post-purchase add-to-order carries no extra delivery charge
  and stays open until the order is packed. (§4, §5)

### D3.14 Order tracking / order page

- **Landing from the thank-you page's "Track your order" opens the order page with a green panel on top:**
  **"This is your account — we created it with this order. Everything you buy, every delivery and every size
  exchange lives here."** Under it, in a white card: **"Log in with 01811223344"** and
  **"Password ••••••••"** with a **Show** toggle, plus the line that the password is their mobile number and
  can be changed in My account. The panel has a close button and **only appears on the first arrival from the
  thank-you page.** (§55.1)
- **The box is too tall — compress it:** phone and password **side by side**, the three-line sentence cut to
  **two lines**, the box tightened, **so that all four or five tracking steps show at once underneath.**
  (§56.11)
- Below it: the order number, the status tag and the **four-step tracking timeline**. (§55.1)
- **Order editing** from here until the order enters processing, max 2 edits; each edit re-runs stock and
  fraud checks, is logged, and syncs to the ERP. (§5)
- **Exchange request** from here: the button hides after the Rules window closes. Steps: item → reason → new
  item → the money box. (§6)
- **"Rate & review"** entry point from My orders. (§5)
- **The hotline appears on this page and on the order-confirmation page.** (§46.16)

### D3.15 My account / customer dashboard

- **The offer banner is still missing and must be delivered.** The original offer-and-wallet banner was good;
  it comes back and **always carries some offer, from a fixed set the owner picks.** Claude built one earlier,
  the owner asked for it, and it did not arrive. (§56.10, §58.9)
- **Phone account menu:** My orders · **For you** (offers) · Rewards · Wallet · Wishlist · Profile. (§58.9)
- **Profile needs a photo upload.** (§41.17, §58.9)
- **Invoice generation and download from the account.** (§58.9)
- **"For You" offers tab** — personal offers such as a VIP flat 10–20%, with an expiry and auto-apply,
  **highlighted prominently at the top** and also surfaced **in the wallet area**. (§4, §5)
- **Product rows**: recommended / trending / new / on offer. (§4, §5)
- **Profile value-adds (§41.17):** saved addresses · a **saved size profile** (height, weight, fit preference)
  that feeds Find My Size everywhere · wishlist · order again in one tap · recently viewed · back-in-stock
  alerts · loyalty points · a referral code · preferred courier and delivery time · WhatsApp opt-in ·
  exchange and return history · saved payment preference.
- **Referral** is always available but the owner controls on/off and timing, and it shows **only in logged-in
  dashboards.** (§7)
- **Login:** username = phone, password = phone by default (shown on the thank-you page, changeable), with a
  one-time SMS code on a new device. (§5)
- **Reviews** are submitted from here by verified buyers and shown only after the owner approves. (§5)
- **The large-text toggle** lives here for older and less-confident customers. (§41.7)
- Dashboard blocks are switchable (`account.*`) and arrangeable in the page builder. (§41.2, §58.12)

### D3.16 Reviews on the storefront — Locked (§52.4, §53.1, §55.3)

- **The reviews the owner enters by hand are the reviews the site counts.** Typed in, or brought over from
  WhatsApp and Messenger inboxes where customers sent their feedback. **The star rating on the product page is
  the average of the stored live rows, the count beside it is their number, and tapping the stars jumps to the
  review section.** `reviewAverage(productId)` computes both.
- **Hidden and waiting rows are excluded from the average and from the Google schema.**
- On top of the stored rows: a **per-size and per-fit breakdown** ("85% true to size") · **the reviewer's
  height, weight and size bought** shown beside each review · **photos** where the customer sent one ·
  sorting by newest, highest, lowest and most helpful · filtering by size and fit · **the category average
  rolled up to the category page** · a **duplicate check** so the same message is not entered twice.
- **Google ranking tie-in:** Product + AggregateRating + Review JSON-LD generated from the stored rows ·
  review snippets in the category page's schema · review text indexed as page content · a review sitemap
  entry · "verified buyer" marked in the schema where the review is tied to a real order · **the schema emits
  only what is actually stored.**
- **The review-request engine (§46.15):** every delivered order triggers a WhatsApp or SMS message with a
  two-tap review (stars, optional photo, optional line of text), with reminders. Most Bangladeshi shops have
  few reviews simply because they never ask. An **incentive the owner controls** (points or a discount on the
  next order, disclosed as such) and **a reward for sharing on Facebook**, both on/off. (§7)
- **Real signals while review counts are low**, all computed from actual orders and all true: "47 sold this
  month", "most bought size: L", "85% kept their size". Plus **a clearly labelled editorial block** — "From
  our team: how this polo fits".
- **Pre-launch placeholder reviews** may exist only as demo data that is **visibly marked and removes itself
  the moment the store goes live** — never shown to a real customer.

### D3.17 Content pages

- **One route, `#/page/:slug`**, serving: **Questions & answers** (10 real Q&As), **Delivery**, **Exchange &
  returns**, **Privacy**, **Terms**, **Our story**, and **Contact**. (§47.7)
- **All nine dead links that pointed at the home page are fixed**; FAQ and Delivery no longer land on a
  category page. (The FAQ page showed nothing, Terms was empty and Privacy was never added.) (§46.12, §47.7)
- **Proper left padding** — the text was clipped on the left edge, with the first letter of several lines cut
  off. (§48.5)
- **Contact page:** a contact form plus WhatsApp, the hotline, email and track-order. **It must look
  exceptional**, and Claude shows a design first. (§46.16, §47.7)
- **The announce strip:** if the message fits, it stays fixed and **pulses gently so it is noticed**; if it is
  long, it **scrolls sideways**. (§48.5)
- Content pages must be reachable from search, which must return **help articles** as well as products and
  categories. (§58.3)

### D3.18 Footer

- **Phone and desktop footers will be two different designs.** The desktop one belongs to the desktop round
  and has not been designed. (§58.2)
- **Colour scheme — three or four colours, not one black slab (§57.2, §58.2):**
  - The **promise strip** (Size exchange · Cash on Delivery · Secure payment · 100% original) gets its own
    tasteful colour.
  - The **EXTAS block** — from the wordmark down to the border above the category columns — gets a second,
    different tasteful colour.
  - The **WhatsApp / hotline / hours band** gets a tasteful colour too, **matched to the promise strip**.
  - The black section is combined with those so the whole footer reads as a three- or four-colour scheme.
    **No cheap colours.**
- **Columns.** Compact columns with vertical dividers on mobile (3 links | 3 links | 3 links was the original
  shape), **centred between the dividers**, not left-aligned. **Help and EXTAS carry six links each** (they
  had five; Claude picks the sixth). **Shop shows six, chosen by the owner in the dashboard.** All three
  columns then stand level, and the empty space underneath is tightened so the page gets shorter. (§5, §56.2,
  §58.2)
- **Icons beside every footer link**, and **they must match automatically**: a polo link gets a polo icon, a
  shirt a shirt icon, a panjabi a panjabi icon, a t-shirt a t-shirt icon — for whatever categories the shop
  has. The owner can change an icon, add a link or remove one. (§41.6, §56.2, §57.2)
- **Payment marks — bKash, Nagad, Visa, Mastercard, COD — use the real brand marks, not text chips.** **No
  flat white boxes**: transparent, matched to the band's colours, tastefully highlighted, **with the light
  sweep passing across them**, fitted across the width the way the Facebook–TikTok row already does. (§41.6,
  §57.2, §58.2)
- **The social row is full width on the phone** — it left a gap on the right. Social icons: Facebook,
  Instagram, YouTube (and the TikTok row). (§41.6, §56.2)
- **Legal on one line:** the trade licence and DBID go on the **same line as the copyright**, separated by
  bars — not stacked underneath. Anything else important goes on that line too. **The page must not keep
  growing.** On desktop this took the legal block from 91.5 px to 20 px. (§46.16, §47.8)
- **The language switch EN | বাং lives here, and only here.** (§49.1, §51)
- **The hotline sits in the footer contact column.** (§46.16, §47.8)
- Other footer content: the promise row, a join block (WhatsApp / email), accordion link groups, contact,
  social, payment logos, DBID / trade licence. (§4)
- **Known defects, not yet fixed (§58.11):** the four footer social links all point at `#/`; the placeholders
  `[support email]`, `[your DBID number]` and `[number]` are still shipping in the footer; footer link touch
  targets are 34 px, not 44 — see D6, this one needs the owner's call.

---

## D4. Configurability — the eye-toggle system

**The standing rule:** anything the owner asks to remove is **not deleted** — it becomes an **eye-toggle in
the dashboard, default off**. (§48.2, §56, §56.12)

### D4.1 Named switch keys created by the review rounds

| Key | What it controls | Default |
|---|---|---|
| `pdp.payLineWithFree` | On a free-delivery product, whether the `COD / bKash / Nagad / Card` line still shows. When off, everything below moves up. | **Off** |
| `pdp.colourNote` | The colour-description note under the swatches ("Deep navy. Can look almost black in low light…"). Moved off the first screen. | **Off** |
| `pdp.trueColourLink` | The "See true-colour photo" link. | **Off** |
| `pdp.fitBar` | The "Runs small / True to size / Runs large" bar. | **Off** |
| `pdp.unitToggle` | The cm/inch toggle on the product page. (cm stays inside the size-chart popup either way.) | **Off** |
| `pdpIcons.panel` | The whole floating heart/share/WhatsApp column. | On |
| `pdpIcons.wish` | The heart icon in that column. | On |
| `pdpIcons.share` | The share icon in that column. | On |
| `pdpIcons.whatsapp` | The WhatsApp icon in that column. | On |
| `pdpSweep.freeDelivery` | Light sweep over "Free home delivery" (2–3.5 s). | On |
| `pdpSweep.stock` | Sweep over "In stock — ships today…" (4–5 s). | On |
| `pdpSweep.allColours` | Sweep over "All N colours" (4–5 s). | On |
| `pdpSweep.colourLabel` | Sweep over "Colour · Olive" (4–5 s). | On |
| `pdpSweep.sizeLabel` | Sweep over "Choose your size". | On |
| `pdpSweep.sizePills` | Sweep over the S M L XL XXL boxes. | On |
| `pdpPrice.discountAfterBar` | On a discounted product, drop the COD line and put the struck price, −% and "Save ৳" after the bar. | **On (the default behaviour)** |
| `fab.whatsapp` | The floating WhatsApp button — **and which pages it shows on and where it sits**. | On |
| `category.breadcrumb` | The visible breadcrumb on the category page. (JSON-LD breadcrumb data is emitted either way.) | On |
| `checkout.helpStripDesktop` | The desktop "Need help with your order?" strip. | **Off** |
| `bag.waAboveTotal` | "Message us on WhatsApp" sitting above "Total · Checkout" on the cart. | **Off** |
| `bag.waSendBag` | "Send my bag on WhatsApp". | **Off** |
| `thanks.nextSteps` | The "What happens next" block on the thank-you page (phone and desktop). | **Off** |
| `upsell.bag` | The shared upsell block on the cart page. | On |
| `upsell.thanks` | The same block on the thank-you page. | On |
| `upsell.setLine` | The set/combo line inside the upsell block. | On |
| `upsell.why` | The three reassurance cards (COD · 72-hour size swap · 100% original). | On |
| `account.*` | The My-account blocks. | On |
| `PDP_CTA_STYLE` | The Add to Bag / Order Now colour pair — **shared by the product page and the set page**. | Option 1 shipped, **awaiting the owner's pick of 5** |
| `PDP_FIT` / `pdp_budget()` in `30-product.js` | **The one place the compulsory first-screen height budget is configured.** | Measured budget, not a per-product value |

### D4.2 Option switches created by the earlier rounds

| Switch | What it controls | Default |
|---|---|---|
| Page builder: section toggle + position | Every section of footer, header, homepage, product page, checkout, thank-you, customer dashboard and admin dashboard | All on, in Claude's order |
| Text dictionary | Every button name, section title, field label and message, EN and BN | Claude's wording |
| Button colours | All button colours | Claude's colours |
| A/B testing module | Global and per test | **Off** |
| Product-page template | T1 Classic / T2 Editorial / T3 Fit-first per category or product | T1 |
| First-screen style | **Style A** (strip under price) or **Style B** (free delivery after the bar) — **per product, mandatory at upload** | Style B is the live default |
| Gallery layout | Thumbnails below the main image or down the side | Per store / per product |
| Which PDP blocks show on this product | Colour note, true-colour link, the three rule rows, fabric, size & fit, description | Mandatory choice at upload |
| Which measurement columns this product has | Per product; an unentered measurement does not render | Mandatory at upload |
| "Was" price | Shown or not, and its source (MRP / price history / combo / launch price) — per category, sub-category and product | **Off** unless chosen |
| Canonical behaviour for colour URLs | Canonical to the main product, or let each colour stand alone | **Canonical to the main product** |
| Free delivery | Per product at upload; also by campaign; also by cart threshold (৳1,500 / ৳2,000 / ৳2,500) | Mandatory choice at upload |
| Model-stats chip | Per product / per category "has model photo" tick | **Off** unless ticked |
| Colour name under each dot | Per product, only when the product has 4 colours or fewer | Off |
| After "Add to cart" behaviour | Toast and stay · slide-in mini-cart · straight to the cart page | **Slide-in mini-cart** (phone: bottom sheet) |
| Add-to-cart sheet contents | Each element inside it | All on |
| Skip the cart | Global and per campaign | Off |
| Combo auto-apply when the bag matches | Per combo | On per combo |
| Customer-built sets | Global and per category | **Off** |
| Which categories the two PDP bottom product rows show | Back-end option | Claude's choice |
| Shop footer column's six links | Chosen by the owner in the dashboard | Claude's six |
| Auto-approve 4–5★ reviews | Review moderation | **Off** |
| Review reward / Facebook-share reward | On/off | Owner's choice |
| Referral programme | On/off and timing; shown only to logged-in customers | Always available, owner-controlled |
| Wishlist alerts | Opt-in only, real triggers only, max 1 per item and ~2 per week | **Off until live test** |
| Celebration overlay | Tied to an occasion or campaign | **Off** |
| Online-payment discount | An option, not mandatory; set from the backend / Campaign section | **Off** |
| Themes | 4–5 complete UI themes (Classic / Noir / Ivory / Festive) across all pages including the dashboard, with preview and scheduled switch | Classic |
| Large-text toggle | Customer-facing accessibility control | Off |
| Zone table, per-zone charge, outside-Dhaka default | Admin-edited | ৳60 inside / ৳120–130 outside |
| Exchange window | Read from Rules, never hard-coded in copy | 72 hours currently |

---

## D5. Analytics — Locked (§50, corrected; confirmed locked in §52.1)

**§48.9 was written too narrowly and the owner was right to object.** "How many tapped All 5 colours" was one
example among many, not the requirement. **The requirement is a survey layer across the whole shop:** every
place a customer makes a small decision is measured, and the reports say what is working and what is not.
**Claude decides where to place the measurement points using its own judgement about what would be useful,
and adds more as it sees fit without asking.** The list below is the starting set, not the limit.

### D5.1 What gets measured — the starting set

**Product page** — page views · how far people scroll · thumbnail and gallery use · zoom opens · **"All N
colours" opens, and how many of those end in a purchase** · colour switches, and whether a switch leads to a
purchase · **size-chart opens, and how many pick a size from inside the popup** · which sizes people look at
and in what ratio · Find my size opens, completions, and whether they take the size it recommends ·
**WhatsApp taps, and how many of those turn into an order** · review-section reach · Q&A opens · Delivery /
Exchange / Returns detail opens · add-to-bag, Order Now, and the split between them · out-of-stock size taps.

**Category and search** — filter and sort use, and which filters · how many results people scroll past · "no
results" searches **with the words they typed** · which card position gets tapped.

**Bag** — reach · abandonment · quantity changes · line removals · save-for-later · coupon attempts and
failures · the free-delivery bar: how many add more to reach it.

**Checkout** — reach · completion · drop-off per field · **how often the address zone is auto-detected versus
asked** · **how often the detected zone is changed by hand** · validation errors per field · payment method
chosen · how long it takes · quantity corrections made on the page.

**Thank-you and account** — Track-order taps · upsell add-ons taken · account logins afterwards.

**Site-wide** — hotline taps · menu use and which menu items · language switches · campaign overlay skips ·
page speed as real customers experience it.

**Added on Claude's own judgement (§52.1)** — time-to-first-interaction per page · **rage taps** (three taps
on the same spot in a second, which is how a broken control shows up in the data) · back-button use within a
session · returning-customer versus new-customer behaviour per page · which photo view people stop on · how
far down the reviews they read · **device and connection class against conversion, so slow phones can be seen
separately** · the exact words typed into search that returned nothing · **abandoned-at-size versus
abandoned-at-address** · WhatsApp conversations that end in an order within 24 hours, matched by phone number.

### D5.2 The reports

A **section of its own in the dashboard**. **Weekly and monthly**, by **landing page, product page, category
page and cart page**: what is performing, what is not, **and the arithmetic behind it**. A **funnel per
product**. Comparison between pages. Trend lines. Everything **filterable by date, store, source and
campaign**.

### D5.3 How it is built

- **Deterministic event capture first.** Every tracked element carries its own event, stored in **our own
  database**, with nothing depending on an outside service.
- **On top of that an AI layer reads the numbers and writes the plain-language verdict:** what changed, what
  is dragging, what to try next.
- **The AI explains; it never invents a number.**
- Scope: **+6 PRs in S15/S21** — event layer · per-page funnels · the report section · weekly and monthly
  digests · AI commentary · alerts when a page's numbers fall.

---

## D6. Still open / still in review

### D6.1 Questions waiting on the owner — one sentence each answers them

1. **Buy-button colours.** Five numbered Add to Bag / Order Now combinations are in `shots/cta-options.png`
   and number 1 is shipped — which do you pick, or which two do you want mixed (e.g. "number 1's Add to Bag
   with number 3's Order Now")? (§58.4, §58.12)
2. **The floating WhatsApp button's position.** It is `position:fixed` and vertically centred, so it covers a
   50 px strip of the right-hand gutter at every scroll position and has already eaten taps — do you want
   **(1)** it kept centred with each page's content inset by hand (endless), **(2)** it moved low-right above
   the sticky bar where every shop puts it, thumb-reachable, sitting over chrome rather than content
   (**Claude recommends this**), or **(3)** it kept centred but fading to a half-circle tucked against the
   edge while idle? (§58.10 A)
3. **Sub-menus.** Do you approve the sub-menu design — the three-dot menu opening a category's sub-categories
   first and then going through — once Claude has shown you the picture? (§58.3, §58.12)
4. **Search panel.** On a phone, should the search open from the top, the middle, or stay as the half window
   from the bottom? (§58.3)
5. **Desktop checkout header.** What should fill the space that moving the EXTAS mark to the left frees up —
   is the Bag / Delivery & payment / Done steps bar now sitting there what you want, or an offer instead?
   (§56.9, §56.12)
6. **The floating icon rail's home position on the phone.** It was moved from 50% to 38% of the viewport
   because at 50% it parked permanently on the fifth thumbnail on every product's first screen — is 38%
   acceptable? (§57.6)
7. **Footer link tap targets.** Raising them from 34 px to the required 44 px puts about 90 px back into the
   footer you asked to make shorter — do you want the bigger targets or the shorter footer? (§58.11)
8. **The Returns row wording.** "No return" reads badly on the product page — what honest phrasing do you want
   there instead? (§48.2)
9. **The add-to-bag sheet's free-delivery slot.** When the order does not qualify for free delivery, what
   should go in that space instead of raising delivery at all? (§58.5)
10. **"Only 3 left in Olive, size L".** It stays, but it appears too far down the product page — where do you
    want it? (§57.4)
11. **"Was" price sources.** Which source — brand MRP, recorded price history, or the combo calculation —
    should be the default for each category? (§46.14, §47.10)
12. **The My-account offer banner.** Which fixed set of offers should it rotate through? (§56.10, §58.9)
13. **The six Shop links in the footer.** Which six do you want? (§58.2)
14. **The eye-toggle controls in the dashboard.** Should every hidden block's eye-toggle live in one switch
    list, or beside its own section inside the page builder? (§47.10, §49.6)
15. **Wishlist alerts.** Do you confirm the proposal — opt-in only, triggered only by a price drop on a saved
    item or the customer's own size coming back in stock, capped at one message per item and about two a week,
    no fake-scarcity messages, default off until a live test? (§8)
16. **The phone sign-off.** Round 12 is built and verified — will you re-audit the phone from the top, so the
    desktop review can start? (§57.5, §58.12)

### D6.2 Found, not yet fixed — carried forward (§58.11)

These are known defects the latest round logged but did not repair. They are not questions; they are work
still owed.

1. `cat_banner()` is hardcoded to polos and t-shirts — a set rule on any other category silently shows
   nothing.
2. `cat_bundlePicks` only ever shows the first 6 styles; styles 7 and beyond are invisible however long you
   watch.
3. Every filter tap re-renders the category page and restarts the conveyor at 0, so the shopper loses their
   place.
4. The search engine has no prefix match, no synonyms, no Bengali keywords and no help pages — "polo shirt"
   and "গেঞ্জি" return nothing. Covered by the §58.3 search proposal, which is not yet built or approved.
5. The search results page has no filter and no sort, and its "Popular right now" row ignores the query.
6. The breadcrumb "Home" link is a 35 × 19 px tap target, under the 44 × 44 rule.
7. The flash-sale countdown is a painted-on string that never ticks and resets on every render.
8. The four footer social links all point at `#/`, and the placeholders `[support email]`,
   `[your DBID number]` and `[number]` are still shipping in the footer.
9. The hero arrows only appear on hover, so a phone cannot step the hero — drag only.
10. `.cb-mbar` / `.bs-mbar` reserve 56 px for a bottom tab bar that no longer renders.
11. Disabled size pills show a strikethrough and `cursor:not-allowed` with no explanation of why.
12. Footer link touch targets are 34 px, not 44 — the trade-off is question 7 above.

### D6.3 Rounds not yet run

- **The desktop review has not started.** The owner's order is phone first, then desktop, and only after the
  phone is signed off. The **desktop footer is a separate design** that does not exist yet. (§57.5, §58.2)
- **Add-to-Bag onwards comes after the product page is accepted** — that was his sequencing instruction in
  Round 11 and the later rounds have run ahead of it by agreement, not by sign-off. (§57.5)

---

## D7. Where two rounds disagreed — the later one wins

Recorded so the owner can see the conflicts were noticed and not quietly resolved.

| # | Earlier decision | Later decision — **this is what gets built** |
|---|---|---|
| 1 | §5: the checkout front end shows **nothing** about address parsing — no area chip, no question | **§46.7:** the detected zone is **always visible and one tap to change**, a two-button question is asked when confidence is low, and the delivery line shows both zone prices before anything is typed |
| 2 | §6: support contact is a **WhatsApp text button only — no call buttons or cards anywhere** | **§46.16:** the **hotline number** appears in the desktop header, at the top of the phone menu drawer, in the checkout "Need help?" row, in the footer contact column, and on the order-confirmation and tracking pages — but **never as a floating button** |
| 3 | §46.1: nothing on the product page is hidden by default; the owner switches off what he does not want | **§53.4:** the colour note (`pdp.colourNote`) and "See true-colour photo" (`pdp.trueColourLink`) ship **off by default**, so the first screen ends cleanly at the swatches |
| 4 | §5: inches by default everywhere with a small **cm link on the product page** | **§56.5:** the cm/inch toggle is **removed from the product page** (`pdp.unitToggle` off); cm lives only inside the size-chart popup |
| 5 | §5: a **fit bar** ("Runs small / True to size / Runs large") built from review and exchange data | **§56.5:** the fit bar is **removed** (`pdp.fitBar` off). The underlying fit data still feeds Find my size and the admin size-issue report |
| 6 | §46.1 / §47.2: **Find my size sits above the size pills** as a prominent card | **§56.5:** **Find my size comes after the size row** — Colour → Size → Find my size |
| 7 | §52.3: **Option A** (free-delivery strip under the price) is live; Option B built but not applied | **§54.1:** **Option B / Style B is the live default** — price, thick bar, truck icon, "Free home delivery". Style A stays in the backend as the per-product alternative |
| 8 | §49.2: **WhatsApp sits inside the sticky buy bar** on the phone, left of Add to Bag | **§51 → §52.2 → §56.4 → §57.4:** WhatsApp is out of the buy bar; it is one of three **46 px icons in a floating column** down the right that drifts with the scroll. (Its exact resting position is open — D6.1 question 2) |
| 9 | §54.3: a **49–78 px gap** above the buy bar is fine; the next block peeking is ordinary scrolling | **§58.4 / §58.12:** the measurement line must clear the buy bar by **1–1.5 px** — achieved at 1.25–1.27 px |
| 10 | §57.5: the first-screen rule allows **2–3 px of gap** below the measurement line | **§58.4:** **1–1.5 px** |
| 11 | §56.8 point 31: **"The brand name must not shimmer"** | **§56.12:** the owner corrected himself — he wanted the **opposite**. The 7-second sweep now also crosses the **EXTAS mark in the header on every page**, and the checkout and thank-you pages **keep** their button sweep. The removal was undone |
| 12 | §46.15: Claude will not build review generation — framed as a refusal of what the owner asked for | **§52.4 / §53.1:** the owner never asked for invented reviews. **A full review manager is built** — add by hand, edit, import from a file, paste in what a customer said on WhatsApp, Messenger or the phone, set name, date, rating, size, height and weight, mark verified, hide, pin, sort, rotate, bulk add, per category or product. **Only an AI button that writes reviews out of nothing is refused** |
| 13 | §57.3 point 21: the bundle picks are **two rows**, splitting half and half above ten products | **§58.3:** **one row only**, sliding, with **two cards per screen, not three** — marked mandatory |
| 14 | §6: the exchange window is **72 hours** | **§7:** the window is **whatever the Rules setting says**; all copy reads the rule value. 72 hours is simply today's value |
| 15 | §47.2: the main photo is **height-capped**, which left empty space at the side | **§48.1 / §57.6:** the photo **always fills the full width**; only the height is budgeted, with one shared value `min(38vh, 360px)` for every category |
| 16 | §46.9 / §46.10: WhatsApp must be **prominent on the bag page** | **§49.4 / §56.7:** no floating WhatsApp on the bag, and the WhatsApp line above "Total · Checkout" is **off** (`bag.waAboveTotal`) — the one inside the help block is enough |
| 17 | §5: the footer is fixed by making **compact mobile columns with vertical dividers** | **§57.2 / §58.2:** the footer becomes a **three- or four-colour scheme** with centred columns, six links per column, automatic category icons and real payment brand marks — **and phone and desktop become two different designs** |
| 18 | §48.3 point 17: the size chart is **full screen starting just below the header** with a 1–2 mm gap | **§51:** the size-chart sheet **floats with a gap on all four sides**, so a sliver of the page shows behind it — and **§58.4:** it must stay **fixed**, not scroll with the page |
| 19 | §41.9: after Add to cart, the default is a **slide-in mini-cart** | **§46.5:** still the default, but **desktop = right-side drawer, phone = bottom sheet**, because the right edge of a phone is the hardest place for a thumb |
| 20 | §48.1 point 4: the payment line always shows, bar-separated | **§49.2 → §54.1 → §58.4:** the payment line **hides on a free-delivery product** (`pdp.payLineWithFree` off), **takes the slot after the bar** when delivery is not free, and is **dropped entirely on a discounted product** in favour of the struck price, −% and "Save ৳" (`pdpPrice.discountAfterBar`) |

---

# Part F · Decisions still open

## F1. Settings still to be decided

These do not change any design. They are defaults, thresholds and account details, and each one has a
recommended value so **the build never stops waiting for an answer**. A build agent reaching one of
these uses the recommendation, builds it as a setting the owner can change from the dashboard, and
writes one line in `BLOCKED.md` saying which assumption it made.

**A discrepancy the owner should know about.** The record states there are **42** of these questions,
but only the **31 below were ever written down**. The missing 11 were counted and never captured. They
are most likely in S13 (ads) and S18 (compliance), the two stages whose settings were discussed last.
Rather than invent them, they are flagged here: when the owner reaches those two stages he should
expect a few more questions than this list holds.

### S06 · Fraud & location

| # | Question | Recommended default |
|---|---|---|
| 1 | Risk score thresholds | 30 = watch, 60 = hold |
| 2 | What happens at each risk level | Watch: flag only. Hold: require a confirmation call before packing. |
| 3 | Who may add a customer to the blocklist | Owner and manager only |
| 4 | Keep the IP / GPS / address panel and the optional GPS button | Keep the panel, drop the GPS button — it asks a customer for a permission that frightens people |
| 5 | Turn COD off for customers who repeatedly return | Yes, after 3 returns in 90 days, and reversible by hand |

### S11 · SEO engine

| # | Question | Recommended default |
|---|---|---|
| 6 | `/en` as default with `/bn` alongside | Confirmed in the record; build it that way |
| 7 | Which filter pages get their own indexable page | Category + single colour, and category + single fit. Nothing deeper — deeper combinations compete with each other. |
| 8 | Ghost archive for out-of-stock products | Keep the page live with "back in stock" capture; never 404 a page that has earned rankings |
| 9 | AI meta and alt text — auto-apply or one-click accept | Auto-apply for alt text, one-click accept for meta titles and descriptions |
| 10 | Whose Search Console and Bing accounts | **Owner must supply.** Needed before S11 can verify anything. |

### S12 · Content & blog

| # | Question | Recommended default |
|---|---|---|
| 11 | Blog auto-publish or owner approval | Owner approval for the first month, then auto-publish with a daily digest |
| 12 | Articles per week | 2 |
| 13 | Auto-post when a new product lands | No — product launches belong in social, not the blog |
| 14 | Blog language | Both, Bengali first for anything a village buyer would search |
| 15 | Which permanent seasonal pages | Eid, winter, Puja, and a "new in" evergreen page |

### S13 · Marketing & ads

| # | Question | Recommended default |
|---|---|---|
| 16 | Which ad platforms | Facebook and Instagram first; TikTok second; Google last |
| 17 | Who sets the USD rate | Owner, by hand, in settings — an automatic rate makes the cost reports move on their own |
| 18 | Allow pausing and budget changes from the dashboard | Yes, with a confirmation step |
| 19 | Alert thresholds | Alert when cost per order rises 40% above the 7-day average |
| 20 | Which coupon types | Percentage, fixed amount, free delivery, and set-price unlock |

### S16 · Finance, costs & reports

| # | Question | Recommended default |
|---|---|---|
| 21 | Allocate ad spend per order in the profit figure | Yes — profit without ad spend is not profit |
| 22 | Expenses read-only from the ERP | Yes, read-only. The ERP stays the master. |
| 23 | VAT | Off for now, with the field present so it can be switched on |
| 24 | Daily report time | 22:00 |
| 25 | Team performance badges | Build it, default off |

### S17 · Multi-store

| # | Question | Recommended default |
|---|---|---|
| 26 | Is a second store really wanted, or drop the stage | Build the foundation (`storeId` everywhere) regardless — retro-fitting it later means touching every table. Launch stores 2 and 3 only when he has the domains. |

### S18 · Compliance, security, manual

| # | Question | Recommended default |
|---|---|---|
| 27 | DBID, trade licence and VAT BIN numbers | **Owner must supply.** They are placeholders in the footer today and must not reach the live site. |
| 28 | Lawyer review of the policy pages | Recommended before go-live; the build does not wait for it |
| 29 | Pre-order advance cap | 10% |
| 30 | Purge IP and GPS data after 180 days | Yes |
| 31 | Mandatory 2FA for admin accounts | Yes |

## F3. Decisions from the UI/UX rounds still waiting

These are not settings — they change what gets built — and the build should not guess at them.

| Question | Status |
|---|---|
| Which Add-to-Bag / Order Now colour combination (five were shown, numbered) | Number 1 is shipped as the working default |
| Where the floating WhatsApp button lives: centred as first asked, low-right above the sticky bar, or idle-collapsing | Recommendation given: low-right. Currently centred, and it covers content at some scroll positions. |
| The sub-menu design for the hamburger menu | Proposal and mock-up delivered; not built |
| The rebuilt search — panel from the top, with help articles in the results | Proposal and mock-up delivered; not built |
| Whether the ৳800–1,200 price band should compute from the catalogue instead of being fixed | Raised; currently hard-coded, which is normal for a band filter |
| Whether footer link rows go to a full 44 px touch target, which adds ~90 px to a footer he asked to shorten | Raised; currently 34 px |

## F2. Questions raised while writing this specification

Writing the spec surfaced decisions that had never been asked. They are listed here with the same rule:
**the build does not wait.** Where a recommendation is given the agent uses it and records the
assumption; where the answer can only come from the owner, that is said plainly.

### Platform and server

| # | Question | Recommended default |
|---|---|---|
| 32 | Claude plan tier for the build — Max 20x or Max 5x | 20x only pays for itself when 2–3 agents run in parallel, which this plan assumes |
| 33 | After a successful OS upgrade, delete the pre-upgrade disk snapshot or keep it | Keep for 30 days, then delete |
| 34 | If the in-place OS upgrade fails, supply an Ubuntu Pro token or keep retrying | **Owner must decide.** A failed upgrade is one of the few things that can stall S0A. |
| 35 | Confirm the Azure region permanently | A region change needs a new VM, which the "do not change the package" rule forbids |
| 36 | Push access to `mehadih32/Extas-ERP` for the sync endpoints | **Owner must supply.** S09 cannot finish without it. |
| 37 | Which domain is connected first — it becomes the mother store permanently | **Owner must decide.** It cannot be moved later. |
| 38 | Are the domains for stores 2 and 3 in hand, or build them in draft | Build in draft; launch when the domains arrive |
| 39 | Azure credential for the agent, or will the owner set the static IP and open 80/443 himself | Owner does it himself — fewer credentials handed over is better |
| 40 | Do ERP companies already exist for stores 2 and 3 | Agent creates them if absent |

### Operations and support

| # | Question | Recommended default |
|---|---|---|
| 41 | How long may an order sit on hold for a defective item before it must be cancelled | 48 hours |
| 42 | When one item of a multi-item order is held, may the rest ship | Yes by default, with the customer told |
| 43 | Which roles may approve a stock adjustment | Owner only |
| 44 | How many days back to look for a duplicate order on the same phone | 5 |
| 45 | WhatsApp invoice default format | JPG image — it opens inside WhatsApp; PDF makes people download |
| 46 | Which card gateway | **Owner must decide** — whichever he already holds an account with |
| 47 | Minimum margin the margin guard enforces before demanding an override | 15% |
| 48 | Support SLA — first response and resolution targets | First response 15 minutes in hours, resolution 24 hours |
| 49 | Support desk hours | 10 am – 10 pm, matching the hotline already shown in the footer |
| 50 | How long to keep an inactive customer's phone, address and email | 3 years after the last order, then anonymise |
| 51 | Restrict admin login to an IP allowlist from day one, or 2FA only | 2FA only at first — an allowlist locks the owner out the first time he travels |
| 52 | How often Site Health & Audit runs | Daily |
| 53 | Which competitors to track, and how often | **Owner must name them.** 2–4 Bangladeshi menswear sites, re-run weekly. |
| 54 | The support dashboard reference screenshot could not be opened | **Owner should attach the image**, not a link |

With these, the real count of open settings is **54**, not 42 — the eleven that the record said existed
but never wrote down are now more than accounted for.

### AI, data and imagery

| # | Question | Recommended default |
|---|---|---|
| 55 | **Which classes of customer data may be sent to an external AI model.** May a full name, phone and address go out for a support reply or address parsing, or must they be masked first? No rule for this was ever recorded. | **Owner must decide.** Recommendation: mask phone and house number by default; send only what the model needs to answer. |
| 56 | Allow AI crawlers — GPTBot, ClaudeBot, PerplexityBot, Google-Extended | Yes. Being answerable by AI assistants is one of the owner's stated goals. Built as a switch either way. |
| 57 | Which social platforms may post automatically from day one, and which wait for approval | Facebook and Instagram auto; TikTok and YouTube on approval for the first month |
| 58 | Offer "Continue with Facebook" login, and apply to Meta for `user_birthday` | Yes — it is the only automatic birthday source, and it is what un-parks the birthday module |
| 59 | Model photographs — one real shoot of 4–5 models with signed releases, or AI model personas for now | **Real shoot recommended.** Real faces outsell generated ones in this market, and the releases remove a legal question permanently. |
| 60 | Should each PR be marked "before go-live" or "after go-live" in the final plan | Yes — it is how the owner will know what he is waiting for |

### UI/UX — these change what gets built, so the build should not guess

| # | Question | Status |
|---|---|---|
| 61 | Which of the five Add to Bag / Order Now colour combinations, or which two mixed | Five shown and numbered; option 1 is the working default |
| 62 | Floating WhatsApp button: centred as first asked, low-right above the sticky bar, or centred but collapsing while idle | **Low-right recommended.** Centred, it covers content at some scroll positions and has already swallowed one tap. |
| 63 | Approve the sub-menu design | Proposal and mock-up delivered; not built |
| 64 | Phone search — from the top, the middle, or stay at the bottom | **Top recommended**, with the reasoning and a mock-up delivered |
| 65 | What fills the space the EXTAS mark leaves on the desktop checkout header | A Bag → Delivery → Done steps bar is in there now |
| 66 | Is the icon rail's phone home at 38% of the viewport acceptable, instead of 50% | At 50% it parked on the fifth thumbnail on every product |
| 67 | Footer link tap targets — 44 px, or the shorter footer | 44 px adds about 90 px back to a footer he asked to shorten |
| 68 | What honest wording replaces "No return" on the Returns row | Needs his words — it is a policy statement, not a design choice |
| 69 | What goes in the add-to-bag sheet when the order does not qualify for free delivery | Cash on Delivery + the exchange window is in there now |
| 70 | Where "Only 3 left in Olive, size L" should sit | Currently a chip on the photograph, which costs no vertical space |
| 71 | Which "was"-price source is the default per category — MRP, price history, or combo | Needs a decision before any discount goes live |
| 72 | Which fixed set of offers the My-account banner rotates through | Needs his list |
| 73 | Which six Shop links appear in the footer | Needs his pick |
| 74 | Do the eye-toggles live in one dashboard switch list, or beside each section in the page builder | One list recommended — he will look for them in one place |
| 75 | Confirm the wishlist-alerts proposal (opt-in, real triggers only, capped, default off) | Designed, not built |
| 76 | Will he re-audit the phone from the top, so the desktop review can begin | The desktop review has not started at all |

**Total open decisions: 76.** None of them stops the build. Thirty-one were known; forty-five surfaced
while writing this specification — which is the point of writing one.
