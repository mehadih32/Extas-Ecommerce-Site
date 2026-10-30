# EXTAS — E-commerce platform

> **বাংলায় সংক্ষেপে:** এটা EXTAS-এর নতুন অনলাইন দোকানের পুরো কোড আর কাগজপত্রের ঘর। নিচে এক নজরে দেখা যায়: কোন ধাপ
> কতটা শেষ (৬১৫টা PR-এর মধ্যে ২৮১টা), কী চালু হয়েছে, কী বাকি, আর আপনার কোন সিদ্ধান্ত লাগবে। প্রতিটা PR মার্জের পর এই
> পাতা আপডেট হয়। কোড পড়তে হবে না — শুধু বাংলা লাইনগুলো পড়লেই চলবে।

**EXTAS** is a Bangladeshi menswear brand (polos, T-shirts, shirts, denim, trousers, panjabi and more). This private
repository builds its new online shop: a phone-first storefront, a full admin backend, and the server it runs on.
The owner's **EXTAS ERP** stays the master for SKUs, stock and accounts; this shop reads from it and sends business
documents to it ([how](#how-it-is-built)).

| | |
|---|---|
| **Preview (the build)** | **new.extas.com.bd** — password-protected and `noindex`. Every merge to `main` deploys here by itself. The password is never written anywhere; the owner reads it on the server ([`docs/owner/PREVIEW-LOGIN.md`](docs/owner/PREVIEW-LOGIN.md)). Today the home address opens the Bengali progress page (`/status`); the admin is at `/admin`. |
| **The old shop** | **extas.com.bd** (WordPress) stays live and untouched until go-live day. Then the main domain is switched and every old address gets a 301 redirect (S19, PR 587) — only on the owner's explicit word. |
| **Specification** | [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md) (V2.1 final + change notes) · [`docs/MASTER-REGISTER.md`](docs/MASTER-REGISTER.md) (621 PRs, 28 stages) · UI truth: [`docs/demo/EXTAS-demo-V12.2.html`](docs/demo/EXTAS-demo-V12.2.html) (V12.1 and V12 kept as history) |
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
> এখন দোকানের সামনের অংশ (S02), কম্বো (S03), ব্যাগ, চেকআউট আর কাস্টমার অ্যাকাউন্ট (S04), অর্ডারের হিসাব (S05), ডেলিভারি এলাকা ও ঝুঁকির স্কোর (S06) পেমেন্ট (S07) আর কুরিয়ার (S08: কাঠামো, Steadfast, Pathao, প্যাকিং) তৈরি হচ্ছে। কাস্টমারের সেকশন (S14: তালিকা, একজন কাস্টমারের পাতা, একই মানুষের প্রোফাইল একসাথে করা) আর মেসেজের ব্যবস্থাও (SMS, WhatsApp, "বন্ধ" লিখলে মেসেজ বন্ধ, মেসেজের লেখা বদলানোর পাতা) তৈরি। অর্ডারের ইনভয়েস (S20) আর সাপোর্ট ইনবক্সের মূল অংশ (S22) তৈরি। ERP-এর সাথে টাকার হিসাব মেলানোর খাতা (S16: ERP অ্যাকাউন্ট, প্রতিদিনের মিল, মাস বন্ধ, ERP-তে দিনের হিসাব পাঠানো, মাসের স্থির খরচ) আর ERP দিয়ে ফেরত ও বদলের নতুন ব্যবস্থা (S08) তৈরি। ERP থেকে স্টাইল কোড ধরে পণ্য আনা (S01 শেষ) আর ERP-র সই করা প্রশ্নের উত্তর (S18) তৈরি। প্রতিটা দোকানের নিজের ERP সংযোগের পাতা, নতুন ERP চুক্তিতে যাওয়ার ব্যবস্থা আর পুরো ERP-র শেষ পরীক্ষা (S19) তৈরি। মোট ৬১৫টা PR-এর মধ্যে ২৮১টা মার্জ হয়েছে।

| Item | Now |
|---|---|
| Launch | **Launch 259/305** · 46 PRs left before real orders; the build follows [the Launch list](docs/LAUNCH-TRACK.md) first, then the After-launch list by itself (CN-027) |
| Stages | **S0A 12/12 · S00 19/19 · S01 23/23 · S09 19/19** (wave 1 done) · **S10 12/12** · **S02 45/58** · **S03 22/22** · **S06 19/33** (wave 2) · **S04 41/41** · **S05 21/21** · **S07 8/10** · **S08 21/26** (wave 3) · **S11 3/22** (wave 5) · **S16 4/22** (wave 6) · **S18 1/14** · **S19 2/17** (wave 8) · **S14 7/24** · **S20 1/9** · **S22 1/13** (wave 4) · total **281/615** active PRs |
| Live on the preview | Bengali progress page (`/status`), admin sign-in, Keys & connections, products (list, new, edit, publish queue, import from a link, audit, back-in-stock), size charts, stock and ERP pages (practice ERP until the owner adds the ERP keys), Smart Rules (`/admin/rules`, notices and pop-ups) |
| Last deploy | 31 Oct 2026, 00:19 (Dhaka) · commit `6aeb88f` (#59, ERP store-isolation fixes for PR [607](docs/stages/S09.md#pr-607), 608, 610, 620) · **success**, smoke test 220 pages OK |
| Smoke test | Every built page, phone and desktop, as a customer and as the admin, after every deploy and every night: [latest result](docs/reports/smoke/latest/README.md) (CN-016) |
| Waiting on the owner | 7 items open in [`BLOCKED.md`](BLOCKED.md) (13, 14, 15, 17, 18, 19 and 20); none stops the build ([table below](#what-waits-on-the-owner)). 18 and 19 are money questions from follow-ups 39 (a set's price in the free-delivery limit) and 121 (the band charge in the COD limit); nothing changes until he says so |
| Next | The CN-022 foundation items (worker PR [6](docs/stages/S0A.md#pr-6), ERP webhook PR [196](docs/stages/S09.md#pr-196), one "Sales" KPI PR [155](docs/stages/S05.md#pr-155), append-only audit log PR [139](docs/stages/S05.md#pr-139)) are live (deploy 23 Oct 17:35); the back-office follow-ups 80, 82, 92, 93, 54, 16 and 14 (ERP webhook through the preview gate, worker on rollback, KPI report views, band charge in the rules engine, shortage cards, hardcode-guard cases) go live with the next deploy; the new 14-section admin shell (PR 12: sidebar, tabs, search palette, guide panel, the Dashboard with Delivered sales / Ordered value and Needs you now, role start pages; with the V12.4 look, Settings › Admin look and the V12.4 Dashboard on real data, CN-025) is built and goes live with the next deploy, and the first S05 order screens sit on it (PR [140](docs/stages/S05.md#pr-140), 141, 152, 154: the order list with its views and search, one order with every command, the To confirm call queue, and Confirm / Hold / Release on many orders at once); next the duplicate review, packing and order settings tabs and the rest of S05 (PR [142](docs/stages/S05.md#pr-142), 143, 146, 148–151); S02 continues (templates T2 / T3, Find my size, its learning and the product-page reviews built: PR [50–52](docs/stages/S02.md), 58, 59, 65; next PR [67](docs/stages/S02.md#pr-67) …; the reviews queue and the size report go on the new admin shell, follow-ups 230, 231); S04 after checkout: customer accounts built (PR [129–135](docs/stages/S04.md), 137; the live SMS sender waits for its key); "Add to this parcel", "Complete your look", the address rules and gift mode built (PR [127](docs/stages/S04.md#pr-127), 128, 561, 563, 565, 605); next PR [566](docs/stages/S04.md#pr-566) and 606; refunds and returns come with S07 and S08 (BACKEND-ARCHITECTURE, approved in CN-022); S03: the shop's combo pages are built (PR [91–95](docs/stages/S03.md), 102, 103: the combo page, the sets landing page, the set offer on the product page); next the set builder (PR [98](docs/stages/S03.md#pr-98), 100) and the templates 572–574, 576 |
| Last update | 30 Oct 2026 |

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
| [S01](docs/stages/S01.md) | [Catalog, media & images](docs/stages/S01.md) | [1](docs/stages/README.md#wave-1) | [19–39](docs/stages/S01.md), [590](docs/stages/S01.md#pr-590), [609](docs/stages/S01.md#pr-609) | 23 / 23 | **Done** |
| [S02](docs/stages/S02.md) | [Storefront](docs/stages/S02.md) | [2](docs/stages/README.md#wave-2) | [40–88](docs/stages/S02.md), [501](docs/stages/S02.md#pr-501), [503](docs/stages/S02.md#pr-503), [595–600](docs/stages/S02.md), [602](docs/stages/S02.md#pr-602) | 45 / 58 | In progress |
| [S03](docs/stages/S03.md) | [Combo & bundles](docs/stages/S03.md) | [2](docs/stages/README.md#wave-2) | [89–104](docs/stages/S03.md), [571–576](docs/stages/S03.md) | 22 / 22 | **Done** |
| [S04](docs/stages/S04.md) | [Cart, checkout, accounts](docs/stages/S04.md) | [3](docs/stages/README.md#wave-3) | [105–137](docs/stages/S04.md), [558](docs/stages/S04.md#pr-558), [560](docs/stages/S04.md#pr-560), [561](docs/stages/S04.md#pr-561), [563](docs/stages/S04.md#pr-563), [565](docs/stages/S04.md#pr-565), [566](docs/stages/S04.md#pr-566), [605](docs/stages/S04.md#pr-605), [606](docs/stages/S04.md#pr-606) | 41 / 41 | **Done** |
| [S05](docs/stages/S05.md) | [Order management](docs/stages/S05.md) | [3](docs/stages/README.md#wave-3) | [138–155](docs/stages/S05.md), [541](docs/stages/S05.md#pr-541), [546](docs/stages/S05.md#pr-546), [610](docs/stages/S05.md#pr-610) | 21 / 21 | **Done** |
| [S06](docs/stages/S06.md) | [Fraud & location](docs/stages/S06.md) | [4](docs/stages/README.md#wave-4) | [156–164](docs/stages/S06.md), [502](docs/stages/S06.md#pr-502), [519–524](docs/stages/S06.md), [540](docs/stages/S06.md#pr-540), [542–545](docs/stages/S06.md), [549–557](docs/stages/S06.md), [559](docs/stages/S06.md#pr-559), [562](docs/stages/S06.md#pr-562), [567](docs/stages/S06.md#pr-567) | 19 / 33 | In progress |
| [S07](docs/stages/S07.md) | [Payments & wallet](docs/stages/S07.md) | [3](docs/stages/README.md#wave-3) | [165–174](docs/stages/S07.md) | 8 / 10 | In progress |
| [S08](docs/stages/S08.md) | [Courier, returns, exchange](docs/stages/S08.md) | [3](docs/stages/README.md#wave-3) | [175–193](docs/stages/S08.md), [525–526](docs/stages/S08.md), [564](docs/stages/S08.md#pr-564), [611–614](docs/stages/S08.md) | 21 / 26 | In progress |
| [S09](docs/stages/S09.md) | [Inventory & ERP sync](docs/stages/S09.md) | [1](docs/stages/README.md#wave-1) | [194–207](docs/stages/S09.md), [497–499](docs/stages/S09.md), [607–608](docs/stages/S09.md) | 19 / 19 | **Done** |
| [S10](docs/stages/S10.md) | [Smart Rules](docs/stages/S10.md) | [2](docs/stages/README.md#wave-2) | [208–219](docs/stages/S10.md) | 12 / 12 | **Done** |
| [S11](docs/stages/S11.md) | [SEO engine](docs/stages/S11.md) | [5](docs/stages/README.md#wave-5) | [220–238](docs/stages/S11.md), [527](docs/stages/S11.md#pr-527), [586](docs/stages/S11.md#pr-586), [588](docs/stages/S11.md#pr-588) | 3 / 22 | In progress |
| [S12](docs/stages/S12.md) | [Content & blog](docs/stages/S12.md) | [5](docs/stages/README.md#wave-5) | [239–253](docs/stages/S12.md), [528–530](docs/stages/S12.md), [547](docs/stages/S12.md#pr-547), [591–593](docs/stages/S12.md) | 0 / 22 | Not started |
| [S13](docs/stages/S13.md) | [Marketing & ads](docs/stages/S13.md) | [5](docs/stages/README.md#wave-5) | [254–283](docs/stages/S13.md), [531–532](docs/stages/S13.md), [548](docs/stages/S13.md#pr-548), [569](docs/stages/S13.md#pr-569), [589](docs/stages/S13.md#pr-589) | 0 / 35 | Not started |
| [S14](docs/stages/S14.md) | [CRM & customers](docs/stages/S14.md) | [4](docs/stages/README.md#wave-4) | [284–303](docs/stages/S14.md), [505](docs/stages/S14.md#pr-505), [533–535](docs/stages/S14.md) | 7 / 24 | In progress |
| [S15](docs/stages/S15.md) | [AI 360 Control Room](docs/stages/S15.md) | [6](docs/stages/README.md#wave-6) | [304–341](docs/stages/S15.md), [506](docs/stages/S15.md#pr-506), [577–585](docs/stages/S15.md) | 0 / 48 | Not started |
| [S16](docs/stages/S16.md) | [Finance, costs & reports](docs/stages/S16.md) | [6](docs/stages/README.md#wave-6) | [342–355](docs/stages/S16.md), [504](docs/stages/S16.md#pr-504), [536–537](docs/stages/S16.md), [568](docs/stages/S16.md#pr-568), [615–618](docs/stages/S16.md) | 4 / 22 | In progress |
| [S17](docs/stages/S17.md) | [Multi-store](docs/stages/S17.md) | [8](docs/stages/README.md#wave-8) | [356–377](docs/stages/S17.md), [511–512](docs/stages/S17.md) | 0 / 24 | Not started |
| [S18](docs/stages/S18.md) | [Compliance, security, manual](docs/stages/S18.md) | [8](docs/stages/README.md#wave-8) | [378–390](docs/stages/S18.md), [620](docs/stages/S18.md#pr-620) | 1 / 14 | In progress |
| [S19](docs/stages/S19.md) | [Deploy, backup, go-live](docs/stages/S19.md) | [8](docs/stages/README.md#wave-8) | [391–403](docs/stages/S19.md), [507](docs/stages/S19.md#pr-507), [587](docs/stages/S19.md#pr-587), [619](docs/stages/S19.md#pr-619), [621](docs/stages/S19.md#pr-621) | 2 / 17 | In progress |
| [S20](docs/stages/S20.md) | [Fulfilment & documents](docs/stages/S20.md) | [4](docs/stages/README.md#wave-4) | [404–412](docs/stages/S20.md) | 1 / 9 | In progress |
| [S21](docs/stages/S21.md) | [Site Health & Audit](docs/stages/S21.md) | [6](docs/stages/README.md#wave-6) | [413–424](docs/stages/S21.md), [570](docs/stages/S21.md#pr-570), [594](docs/stages/S21.md#pr-594) | 0 / 14 | In progress (PR 594 readme-guard) |
| [S22](docs/stages/S22.md) | [Support (all-in-one)](docs/stages/S22.md) | [4](docs/stages/README.md#wave-4) | [425–436](docs/stages/S22.md), [538](docs/stages/S22.md#pr-538) | 1 / 13 | In progress |
| [S23](docs/stages/S23.md) | [Social & content studio](docs/stages/S23.md) | [5](docs/stages/README.md#wave-5) | [437–443](docs/stages/S23.md) | 0 / 7 | Not started |
| [S24](docs/stages/S24.md) | [Virtual Photoshoot Studio](docs/stages/S24.md) | [7](docs/stages/README.md#wave-7) | [444–480](docs/stages/S24.md), [539](docs/stages/S24.md#pr-539) | 0 / 38 | Not started |
| [S25](docs/stages/S25.md) | [Video & Campaign Creative Studio](docs/stages/S25.md) | [7](docs/stages/README.md#wave-7) | [481–490](docs/stages/S25.md) | 0 / 10 | Not started |
| [S26](docs/stages/S26.md) | [Installation, documentation & distribution](docs/stages/S26.md) | [—](docs/stages/README.md#parked) | [513–518](docs/stages/S26.md) | — / 6 | **Parked** (handover pack) |
| [S27](docs/stages/S27.md) | [No-ERP stock module](docs/stages/S27.md) | [—](docs/stages/README.md#parked) | not numbered yet | — | **Parked** (handover pack) |
| | **Total** | | **621 PRs** | **281 / 615 active** | 6 parked |

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
| [`ci.yml`](.github/workflows/ci.yml) | GitHub-hosted | every pull request and every push to `main` (and called by `nightly.yml`) | CN-023: one **build** (both Docker images; the standalone app copied out for the other jobs) and, in parallel: **lint and type-check** (hardcode guard, owner-data check, generated docs, lint, type-check) · **unit tests** · **sign-in end to end** on the built images · **device gate** on 4 runners · **Lighthouse** (one page list, `tools/lh-pages.mjs`: the core set plus the touched pages on a pull request, every page on `main`; one runner per shard; page and image weights) · **db:** migrations on PostgreSQL 17 with a drift check, every package's database tests, settings / auth / sample sync run twice (second run must change nothing), installation export / import · **infra**. `web` and `device-gate` are the gates over their parts. Caches: pnpm store, Next.js build cache, Playwright's Chromium |
| [`nightly.yml`](.github/workflows/nightly.yml) | GitHub-hosted | every night at 02:00 Dhaka, and by hand | the whole `ci.yml` on `main` with every Lighthouse page; never deploys |
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
│   ├── workflows/            ci.yml · nightly.yml · deploy.yml · smoke.yml · server-setup.yml · owner-*.yml · store-settings.yml
│   ├── actions/              CI's shared steps: pnpm-install · playwright · seeded-app
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
throttling, median of 3, on every page listed in [`lighthouserc.json`](lighthouserc.json), on the sample data.
**CI under 25 minutes (PR 17, updated 24 Oct, CN-023):** the app and its images are built once and the gates run
beside each other on that build: lint and type-check, unit tests, the sign-in end to end, the device gate on 4
runners (`tools/device-gate.mjs --shard=k/n`) and Lighthouse, one runner per shard of pages. One page list
(`lighthouserc.json`, with every budget as before); [`tools/lh-pages.mjs`](tools/lh-pages.mjs) picks the core set
(home, category, product, combo, bag, checkout, in both languages) plus the pages a pull request touches, and every
page on `main`, every night ([`nightly.yml`](.github/workflows/nightly.yml)) and by hand, so a failing page still
blocks the deploy. pnpm, the Next.js build cache and Playwright's Chromium are cached. Time: before about 115
minutes a run; after: measured on the first run (`PROGRESS.md`). Tests: `tools/lh-pages.test.mjs`,
`tools/device-gate.test.mjs`.

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

**The admin look and the V12.4 Dashboard (PR 12, updated 24 Oct, CN-025 / CN-026 (b) / CN-027; demo V12.4 `#/admin`).**

> **বাংলায়:** অ্যাডমিনের নতুন চেহারা (ডেমো V12.4): নতুন রঙ আর কার্ড, বাঁ পাশে "করতে হবে" ড্রয়ার, আর নতুন ড্যাশবোর্ড — শুধু
> ডেলিভারড অর্ডারের বিক্রির বড় গ্রাফ, নিচে আলাদা লাইনে অর্ডারের মোট দাম, অর্ডার এখন কোথায়, কুরিয়ার, সেরা প্রোডাক্ট আর কম স্টক।
> সব সংখ্যা আসল ডেটা থেকে; যে হিসাব এখনো তৈরি হয়নি, সেখানে কোন ধাপে আসবে লেখা। সেটিংস › অ্যাডমিনের চেহারা-তে প্রতিটা পাতার
> ডিজাইন বাছা যায় (টিমের জন্য বা নিজের জন্য) আর গাইড কোথায় খুলবে। লঞ্চের জন্য প্রতিটা পাতার একটাই ডিজাইন; বাকিগুলো লঞ্চের পরে।

| Screen / part | What it does |
|---|---|
| the V12.4 shell | the demo's new tokens and cards (`app/admin/look.css`, scoped to the admin; the shell's AA-safe greys kept); the rail can stay open (cookie); the "To do" drawer lists every queue the person may open, "Mine" first (`admin.todo.mine` by role, else the role's start section), "Later" hides a list for `admin.todo.laterHours` 3 h |
| `/admin` — Dashboard, design A "Calm overview" (the V12.4 default; demo key B) | greeting, date, live time; the **Delivered sales** chart (delivered orders only, on the delivered day, provisional) with the previous period dashed and smoothed `smoothDays` 3, a tip with each day's own figure; **Ordered value** on its own line, never called sales; tiles Orders / Delivery success / Returned parcels; "Where orders are now" (new, confirmed, packed, with the courier, delivered today) with order → courier hours against `targetHours` 24; Best products (by delivered sales, with photos), Couriers, Running low, Needs a look; range Today / 7 / 30 days / custom dates (`?from=&to=`, at most `customMaxDays` 366, compared with the same span before); CSV of the main figures; `?view=money`: the Money & marketing view, where every figure not built yet names its stage (S08, S13, S16) and only the delivered-sales bars are real |
| one loader | `lib/admin-look/dashboard-data.ts`: a design lists its parts (money, stages, delivery, top, lowStock, queues); the loader reads only those, and only the ones the person may see (`metrics.read`, `orders.read`, `delivery.read`, `inventory.read`); money only through `@extas/metrics` |
| `/admin/settings/look` — Settings › Admin look | each page's designs as cards with a sketch: In use, Team default, Use (just for me), Preview (`?design=`), Make team default (`settings.write`), Use team default; one design per page for launch ("One design for now"); where the guide opens (side panel / small window / its own page; a phone always full screen), for the team and for me |
| the registry | `components/admin/look/registry.ts`: a design = one module + one registry line; `pnpm admin:design <page> <KEY>` writes both ([HOW-TO-ADD-A-DESIGN](docs/admin-guide/HOW-TO-ADD-A-DESIGN.md)); the person's choice in `StaffUser.adminPrefs` |

API: `PUT /api/admin/look` (`{scope: me|team, page, design}` or `{scope, guide}`; the team needs `settings.write`, every change in the
settings history). Settings registry v51 (`registry-admin-look.ts`): `admin.look` {pages {}, perPerson on}, `admin.guideOpens`
{desktop panel, phone sheet, perPerson on}, `admin.todo` {laterHours 3, mine {}}, `admin.dashboardDesigns` {targetHours 24,
chartMinDays 14, smoothDays 3, topProducts 5, lowStockRows 5, courierDays 30, customMaxDays 366, sparkWeeks 8}. Migration
`0042_admin_prefs` (one nullable column). Device gate and Lighthouse: the Dashboard, its money view, a custom range,
Settings › Admin look; smoke `figures` read `.a3-num`. Guides: [dashboard](docs/admin-guide/dashboard.md),
[admin look](docs/admin-guide/admin-look.md). After launch (CN-027): Dashboard designs B and C and the other sections'
redesigns (follow-ups 380–388), ~~the guide opening where `admin.guideOpens` says (389)~~ the guide's small-window and own-page modes (389). With PR 594 (CN-026) the help icon in the V12.4 top bar opens the page's guide where `admin.guideOpens` says: the side panel (from 1280 px the page and the top bar move over) or, on a phone, the full-screen sheet; page guides [Dashboard](docs/admin-guide/pages/dashboard/home.md) and [Settings › Admin look](docs/admin-guide/pages/settings/look.md). On a touch screen every admin
control takes a 44 px tap (the drawing stays the demo's) and the faint grey is darkened to AA. Screenshots:
[`docs/qa/screenshots/pr-12-look/`](docs/qa/screenshots/pr-12-look).

### S01 · Catalog, media & images — Done (23/23)

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

**Built (PR 609): import from the ERP by style code, the buying price and the selling-price floor** (CN-028, CN-029
Phase 1; only for a store on ERP contract v6, behind `erp.model`; no migration).

> নতুন (PR 609): ERP-র স্টাইল কোড লিখলে সব SKU খসড়ায় চলে আসে; ERP থেকে কেনা দাম রাখা হয়, বদলালে জানায়; মালিক সবচেয়ে কম মার্জিন দিলে তার নিচে দাম, কম্বো বা ছাড় যায় না (খালি = বন্ধ)।

- **Screen:** `/admin/products/erp-import` (Products › more ▾ › Import from ERP; `catalogue.import`; guide
  [`docs/admin-guide/pages/products/erp-import.md`](docs/admin-guide/pages/products/erp-import.md)). Type a style code →
  preview of every SKU (colour, size, barcode, grade, buying price) read with the store's own ERP key → import as drafts
  grouped into one product. A missing colour or nothing new is refused; on the practice ERP it previews only; a store on
  contract v5 is refused. At switch-over a product made before the ERP that holds the style's SKUs is adopted (it gets
  the style code); SKUs in other products or rows the shop cannot take are listed and stop the import before anything is
  written; the whole import is one transaction. A re-import never turns a variant back on.
- **B grade** is its own listing when `catalogue.bGrade.listing` is on (off), named with `catalogue.bGrade.nameSuffix`
  (registry v65, `registry-bhandari-p1.ts`).
- **Buying price** ("bought from ERP at", `ProductVariant.shopPriceMinor`, never shown to customers) from the import,
  `variant.changed` and `shop-price.changed`; a change is listed under "Buying prices that changed" until marked seen
  (`catalogue.shopPrice.changesShown` at once). A late, older price never replaces a newer one. The shop never changes a
  selling price by itself.
- **Floor** (`catalogue.floor.minMarginPercent`, the owner's own number, empty = off): a variant price or a combo set
  price below buying price + margin is refused (`BELOW_FLOOR`); the CSV preview shows it as an issue; in the bag, at
  checkout and on the product page every discount, coupon and set tier stops at the floor (`Quote.floorHeld`).
- API: `GET/POST /api/admin/inventory/erp/style`, `GET /api/admin/inventory/shop-prices`, `POST …/shop-prices/seen`.
  Tests: `packages/inventory/test/erp-import.db.test.ts` (store A and B never touch each other), rules, combos and
  catalogue floor tests.

**Left for later stages:** the image worker on BullMQ (inline until then), zoom viewer and storefront pages (S02),
storefront size chart / collection pages and "was" price display (S02), AI spec-sheet reading (AI stage), sending
back-in-stock messages (notifications).

### S09 · Inventory & ERP sync — Done (19/19)

> **বাংলায়:** স্টক আসে ERP থেকে। ব্যাগে রাখা পিস আটকে রাখা, অর্ডার ERP-তে কাগজ হিসেবে পাঠানো, কম স্টকের সতর্কতা,
> বারকোডে গোনা, সিঙ্ক ঠিক চলছে কিনা দেখার পাতা, আর স্টকের আসা-যাওয়ার রিপোর্ট। আসল ERP-এর কী না বসানো পর্যন্ত
> "প্র্যাকটিস ERP" চলে — আসল স্টকে কিছু বদলায় না।
> নতুন (PR 607, 608): ERP-এর নতুন চুক্তি (v6) তৈরি, সুইচ `erp.model` দিয়ে — এখন সব দোকান আগের মতো v5-এ চলে। প্রতিটা দোকানের
> নিজের ERP চাবি; এক দোকানের চাবি দিয়ে অন্য দোকানের কিছু দেখা বা লেখা যায় না। ERP-এর প্রতিটা খবর একবারই, চিরকাল রাখা হয়।
> নতুন (PR 610, 611, শুধু v6 দোকানে): অর্ডার প্রতিটা পিস আলাদা লাইনে পুরো টাকার দামে ERP-তে যায়; ERP "এখন না" বললে অর্ডার
> অপেক্ষা করে আর নিজে থেকেই আবার যায় (অ্যাকাউন্ট হোল্ডে থাকলে চেকআউট বন্ধ)। কুরিয়ার পার্সেল নিলে শিপমেন্ট, প্রতিটা ডেলিভারির
> ফল ERP-তে যায়; অর্ডারের পাতায় "ERP অর্ডার" কার্ড, শর্ট লাইনের সিদ্ধান্ত আর আংশিক ডেলিভারির বক্স।

PR 194–207, 497–499, 607, 608, 610, 611. Register: [S09](docs/MASTER-REGISTER.md#s09--inventory--erp-sync--pr-194207). Packages:
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
piece). Screenshots: [`docs/qa/screenshots/pr-205/`](docs/qa/screenshots/pr-205). No schema change in S09 before PR 607.

**Built (PR 607, 608): ERP contract v6, one ERP company per store, and the event ledger** (CN-028, CN-029 Phase 0; backend only, no
admin screen). Migration `0049_erp_v6` (additive), settings registry v62 (`packages/settings/src/registry-erp-v6.ts`), new package
`@extas/erp-types`.
- **The switch (607):** `erp.model` per store, empty (= `v5`) by default, so nothing changes until the ERP announces its switch date.
  In v6 the shop never reads the ERP's retail price or average cost, and the retired v5 calls (returns, delivered / returned
  statuses) are kept as RETIRED rows, never sent. The switch is one-way, so it needs the owner's written OK and only PR 619's
  switch-over sets it. The practice ERP speaks all of v6, so every flow runs with no real key.
- **One store = one ERP company (§16):** each store talks to the ERP through its own connection, with its own key and secrets in the
  vault under its id; on the practice ERP each store gets its own sample company and key (`SAMPLE-CO-<storeId>`). Store A's key can
  never read or write store B (test on PostgreSQL). A store with only a shared connection keeps working in v5 and is refused in v6
  (`SHARED_LINK`); a key of a company another store's link holds is refused (`SHARED_COMPANY`), also by the database.
- **Event ledger (608):** every v6 event is kept once by its eventId on the store's own ERP link (`ErpStoreLink`), forever; the body
  of a stored event can never change (a database trigger). Webhook and hourly pull (`erp.events.pullMinutes`, resuming from its
  cursor when `erp.sync.maxPagesPerRun` stops it) are one ledger; a correction that arrives first waits for its original (failed
  after `erp.events.correctionWaitHours`) and undoes only what was applied; a missing or damaged piece becomes one courier claim.
  The event belongs to the store whose secret signed it; two stores sharing a secret are refused (`SHARED_SECRET`). A broken event
  or a known eventId with another body is kept, never applied, and shown on Stock → ERP connection.
- **Shared foundation for PR 609–618:** every new table (orders and lines, delivery results, account and its ledger, payments, the
  return pipeline, return lists, exchanges, daily summaries, fixed costs, books runs, closes, differences and adjustments) with
  storeId and the store's link (a composite key, so a row can never hang on another store's link); lump-sum money as BIGINT;
  ten of them append-only for the app's role, one reversal per entry. Every §11 setting (`erp.hold.*`, `erp.account.*`,
  `erp.summary.*`, `erp.fixedCosts.*`, `books.*`, `exchange.*`, `returns.handback.photo`, `catalogue.bGrade.listing`,
  `catalogue.floor.minMarginPercent`) and every §12 permission (`returns.handback`, `exchange.approve`, `books.*`,
  `erp.account.read`, `erp.payments.record`, `fixedcosts.write`).
- **Tests:** contract and practice ERP (`packages/adapters/test/erp-v6*.test.ts`), the shared helpers and their database enums
  (`packages/erp-types`), the ledger and the §16 isolation on PostgreSQL (`packages/inventory/test/erp-v6.db.test.ts`), the
  append-only ledgers (`packages/db/test/append-only.db.test.ts`), the settings (`packages/settings/test/registry-erp-v6.test.ts`).

**Built (PR 610, 611): orders, shipments and delivery results to the ERP v6** (CN-028, CN-029 Phase 1). Only for a store whose
`erp.model` is v6; in v5 nothing changes and the order page's ERP card draws nothing. Migration `0053_erp_orders_v6` (additive:
`ErpPush.keyRound`, `heldReason`), settings registry v66 (`packages/settings/src/registry-erp-orders-v6.ts`).
- **The order (610):** one line per piece (`lineId` `<order number>-<n>`, quantity 1), its `customerPrice` in whole taka (the
  order's discount spread over the lines by value, a combo's remainder on its last piece: 1600 over 3 → 533, 533, 534), with
  `deliveryCharge`, `advancePaid` (paid online + wallet) and `grade`. The pieces are ErpOrder / ErpOrderLine rows kept with the order
  (their ids stay the same across revisions); the ERP's `erpTotal`, each line's `shopPrice` and `fromReturnStock` are stored.
- **"Not now" from the ERP (610):** a 409 the ERP keeps against its Idempotency-Key is HELD with its reason and goes again by itself
  under a new key round (`<key>:k<n>`): `ACCOUNT_ON_HOLD` (checkout pauses with `PAUSED` while `erp.hold.pauseCheckout` is on, the bag
  kept, until `account.released` or the account check says released), `INSUFFICIENT_STOCK` (when the ERP has the stock, at the
  latest after `erp.orders.refusedRetryMinutes`), `NO_SHOP_PRICE` (that SKU is not sold until the ERP takes it), and a shipment's
  `LINE_WAITING`. An order cancelled in the shop before the ERP had it is never sent (FAILED `ORDER_CANCELLED_BEFORE_SENT`).
- **Short lines (610):** `order.line.short` (a Return-stock piece failed the packing check) makes the line SHORT; the order page
  offers WAIT, REPLACE (another SKU) or CANCEL (`orders.lines`, audited, `PATCH /orders/{id}/lines/{lineId}`); `order.line.filled`
  opens it again and the held shipment goes. The order check job `inventory.erp.checkOrders` (every `erp.account.checkMinutes`) reads
  the account and the ERP's own copy of the open orders of the last `erp.orders.catchUpDays`, so a lost webhook or answer is
  caught up (follow-up 490).
- **Shipment and results (611):** `POST /shipments` when the courier confirms pickup (that is when the ERP bills; never at booking),
  every courier result (DELIVERED, PARTIAL, RETURNED) by `PUT /orders/{id}/delivery` once, with what was collected; a "Delivered"
  a true-delivery check (PR 525) holds waits, and the resolved truth goes. The **Partial delivery** box on the order page (kept lines,
  amount paid, discount promised by phone, phone-confirmed, note; `delivery.outcomes`) is required when the courier says partial,
  sent again whenever it changes, and closed once the parcel is handed back. The ERP's identification (green, yellow, orange) shows
  on the order page. The delivery charge and underpaid amounts stay in Retail's own books.
- **Screens:** the ERP card on `/admin/orders/<id>` (state and why it waits, the hold band, ERP total and shop prices with
  `erp.account.read`, "From ERP return stock", the line decision, the identification, the Partial delivery box), the hold warning and
  "held by the ERP" count on Stock → ERP connection. Routes: `GET /api/admin/orders/:id/erp`, `POST …/erp/lines/:lineId`,
  `POST …/erp/partial-delivery`. Guide: [`docs/admin-guide/pages/orders/order.md`](docs/admin-guide/pages/orders/order.md).
- **Tests:** whole-taka pieces (`packages/inventory/test/erp-orders-v6.test.ts`); the holds, the catch-up, the handlers and store
  isolation on PostgreSQL (`packages/inventory/test/erp-orders-v6.db.test.ts`); the whole journey through the real checkout and the
  courier (`packages/shipping/src/erp-v6.db.test.ts`); the routes (`apps/web/src/lib/orders-api.db.test.ts`), the card's words
  (`apps/web/src/lib/admin-orders/erp.test.ts`), the settings (`packages/settings/test/registry-erp-orders-v6.test.ts`).

### S02 · Storefront — In progress (45/58)

> **বাংলায়:** দোকানের কাঠামো (হেডার, মেনু, ফুটার, নিচের বার), চারটা থিম, লোগো, বাংলা আর ইংরেজি, হোম পেজ (হিরোর চলন্ত ছবি, ক্যাটাগরি, নতুন পণ্য, রিভিউ, ঘড়িসহ ফ্ল্যাশ সেল — মালিক সেল দিলে তবেই দেখায়) ক্যাটাগরি পেজ (ফিল্টার, সাজানো, আটকে থাকা বার, প্রশ্ন-উত্তর), পণ্যের পাতা (ছবি আর জুম, প্রতিটা রঙের নিজের লিংক, সাইজ, সাইজ চার্ট, স্টক, দাম, এক্সচেঞ্জ-ডেলিভারির কথা Smart Rules থেকে, কাপড় ও যত্ন, ব্যাগে রাখুন, নিচে "এর সাথে পরুন" আর "আগে দেখা" সারি; তিনটা টেমপ্লেট T1, T2, T3; "আমার সাইজ খুঁজুন" — উচ্চতা আর ওজন দিলে প্রোডাক্টের নিজের চার্ট থেকে সাইজ, কারণসহ), ক্রেতাদের রিভিউ (ছবিসহ রিভিউ আগে, অনুমোদনের পরেই দেখা যায়), উইশলিস্ট, ফোনের মেনুতে সাব-ক্যাটাগরি, সাহায্যের পাতা (প্রশ্ন-উত্তর, এক্সচেঞ্জ, যোগাযোগ …) আর সার্চ (হেডারের খোঁজার জানালা, লিখতে লিখতে পরামর্শ, ফলাফলের পাতা ফিল্টার আর সাজানো সহ, বাংলা শব্দেও) তৈরি — ডেমো V12.2-এর মতো। পাতাগুলো এখন আরও তাড়াতাড়ি হাতে সাড়া দেয় (পণ্যের পাতায় আটকে থাকার সময় 263 থেকে 24 ms), দেখতে একদম আগের মতো।

**Built (PR 82, 501, 503, 84, 42, 40, 85, 41, 43, 45, 46, 47, 48, 54, 55, 56, 57, 60, 61, 62, 63, 64, 49, 53, 67, 68, 69, 70, 71, 74, 75, 72, 73, 52, 50, 58, 51, 88, 66, 87, 86, 59, 65, 44), matched to demo V12.2 (CN-012).**
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
- **Flash sale (44):** two rows gliding opposite ways on the one slider engine (each pause with its resume; a short
  sale repeats its cards, hidden from screen readers and Tab) and a countdown that ticks after the first paint, stops
  at zero and hides the section. The sale is the owner's (`home.flashSale`, empty: nothing is drawn until he sets
  one): on, start and end, and the owner's products, a collection or every real markdown. A sale never changes a
  price: the struck price and "Up to N% off" come only from the PR 38 rule. The section is laid out only as it
  nears the screen (TBT). `/?try=flash` fills a sample sale on test servers only; screenshots
  [`docs/qa/screenshots/pr-44/`](docs/qa/screenshots/pr-44/README.md); the admin page is follow-up 310.
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
- **Reviews and size learning (65, 59):** the product page shows the buyers' own reviews above the questions — the
  summary box (the average, the stars, how many), the rating line under the title that jumps down to them, and up to
  3 cards in one sliding row with the photo reviews first, each card carrying only what its review really has (his
  words, "Verified buyer" from the order, "5'9" · 72 kg · bought M", how the size felt, his photo); the row uses the
  one slider engine, so its mouse, touch and keyboard pauses each have a tested resume; a product with no approved
  review shows no block and no rating at all (`pdp.reviews`, on; max 3, photos first). A review can only come from a
  buyer, from My account, about a line of his own **delivered** order, within 90 days, one per line
  (`reviews.submit`; he may give how the size felt, his height, his weight and one photo up to 8 MB). Every review
  waits as PENDING: it is in no page, no average and no search-engine rating until staff approve it through
  `/api/admin/reviews` (permissions `reviews.read`, `reviews.moderate`, `reviews.write`: approve, hide, reject, put
  back, the verified mark, and the shop's own reviews from WhatsApp), and hiding it takes it off the page again.
  Nothing is ever deleted. The photo-review reward is **off with no amount**: when the owner switches it on and types
  his own figure it is credited once, at approval, as one entry in his wallet ledger, keyed by the review, at most
  one per order (`reviews.photoReward`; CLAUDE.md rule 6, CN-018). SIM-F-008 is checked end to end as a test: review
  submitted → in the shop → approved → on the page → wallet credited. Find My Size now learns from real answers
  (`catalogue.sizeAdvice`, 59): the report groups every recorded answer by garment type and fit — followed, went up,
  went down, with the exchanges and the approved reviews behind them — and flags a chart that keeps running tight or
  loose; it can train a new ease per group, which **arrives switched off** until the owner turns it on
  (`/api/admin/size-advice`, permission `catalogue.sizeAdvice`). Neither has an admin screen yet: the moderation
  queue and the size report go on the new 14-section admin shell (follow-ups 230, 231).
- **Follow-ups (23 Oct; 41, 40, 45, 56, 74, 222):** on a computer a card shows its back view and Quick add with the
  size buttons on mouse hover or keyboard focus (`card.desk`, on; `GET /api/shop/card/<id>`; the bag's own added panel,
  also on the home and category pages), and the home page's cards fit like the category page's; the phone slogan steps
  to its short form, then out, and the footer's slogan wraps; BreadcrumbList and ItemList JSON-LD on category pages and
  Product, Offer and BreadcrumbList JSON-LD on product pages from their own price and stock, no rating
  (`seo.structuredData`, on; Organization is still to come, follow-up 110); the owner's word under each size box
  (`pdp.sizeWords`, empty = off) and "Your size" on the size this browser last put in the bag (`pdp.usualSize`, off);
  a sample sub-category so the gate measures the menu accordion.
- **Settings:** `theme.*`, `brand.*`, `shell.*`, `language.*`, `slider.engine`, `home.*` (registry v16; `home.hero` v17; `home.flashSale`, `home.flashRows` v45), `category.*` (registry v17), `pdp.*` (registry v19: page, gallery, colour, size, chart, stock, price, trust, rules, details, buy, sweep; no admin screen yet, CN-019); registry v23: `pdp.fit`, `pdp.rows`, `pdp.icons`, `pdp.share`, `shell.fab`, `shell.menuSubs`, `wish.list`, `pages.help`, `pages.text` (owner data); registry v28: `pdp.templates` (default T1, per category, T2 and T3 options), `pdp.finder` (the body estimate, tolerance, length check, stepper range, keep and record switches); registry v24: `search.engine`, `search.match`, `search.words`, `search.help`,
  `search.panel`, `search.results`. No schema change, no new permission.
- **Settings (66, 86, 87):** `pdp.qa` in `registry-product.ts` and `shop.sweep`, `thanks.celebrate` in
  `packages/settings/src/registry-motion.ts` (registry v31), labels in `packages/settings/messages/storefront.*.json`; the
  words in `apps/web/messages/shop-more.*.json` (`qa.*`, `celebrate.*`). No schema change, no admin screen (CN-019).
- **Settings (59, 65):** `catalogue.sizeAdvice`, `pdp.reviews`, `reviews.submit`, `reviews.moderation`,
  `reviews.photoReward` in `packages/settings/src/registry-reviews.ts` (registry v35, group `reviews`), labels in
  `packages/settings/messages/reviews.*.json`; the words in `apps/web/messages/shop-more.*.json` (`reviews.*`) and
  `shop-account.*.json` (`account.review.*`); permissions `catalogue.sizeAdvice`, `reviews.read`, `reviews.moderate`,
  `reviews.write`; migration `0021_reviews` (additive: the review's order line, source, the buyer's fit, height and
  weight, who checked it and when, and what the reward paid). No admin screen (CN-019, follow-ups 230, 231).
- **Settings (follow-ups):** `card.desk`, `seo.structuredData`, `pdp.sizeWords`, `pdp.usualSize`, `thanks.page` in
  `packages/settings/src/registry-storefront-fu.ts` (registry v25), labels in `packages/settings/messages/storefront-fu.*.json`.
- **Tests and gates:** unit tests beside the code (`apps/web/src/lib/shop/*.test.ts`, `packages/settings/test`),
  device gate 0 fails in 372 storefront checks and 124 product-page checks (2077 checks with T1, T2 and T3 in both languages, PR 50–58), storefront pages in the Lighthouse budget
  (TBT under 200 ms; the product page T1 and T3 in both languages and T2 on the sample data, `lighthouserc.json` (one list since CN-023); page and image weights, `tools/page-weight.mjs`) and in the
  smoke test (`docs/qa/smoke.json`; product pages are found from New in, never named). Screenshots:
  `docs/qa/screenshots/pr-40/`, `pr-41/`, `pr-43/`, `pr-45/` … `pr-48/`, `pr-49/`, `pr-53/` (PR 53, 67–71, 74, 75), `pr-72/` (PR 72, 73), `pr-65/` (PR 59, 65).
  The reviews journey itself is a test (`apps/web/src/lib/reviews-journey.db.test.ts`, SIM-F-008) and the smoke list
  checks that the review API refuses a request with no account.

**Built (PR 602): the four-layer cache and its invalidation.** New package `@extas/cache`; no migration; settings registry v53.
- **The layers:** the browser keeps hashed files a year; Cloudflare keeps files, and category and product pages only with `cache.pages.cdn`
  (off until a Cloudflare cache rule is set, follow-up 401); the server keeps built category and product pages a few minutes; Redis carries
  every clear to every process. The bag, the checkout, the account, the admin and the API are never kept (proxy headers and Caddy
  `cache_headers`; `/api/internal/*` answers 404 from outside).
- **What clears what:** a price or stock change clears that product, its category pages and Cloudflare at once; a setting clears every page;
  a new product its categories. The stock shown is kept 15 s; adding to the bag and the checkout always read live stock with a row lock.
- **Screens / routes:** Settings › System › Cache (`/admin/settings/system/cache`, permission `system.cache`): the layers, hit counts, how long
  each keeps, "Clear all" with a confirmation and a reason (audited). API `/api/admin/cache/*`; the deploy's hook `/api/internal/cache/deployed`
  (token `CACHE_HOOK_TOKEN`, made by `09-stack.sh`; best effort, never fails a deploy).
- **Settings:** `cache.pages` {server on, cdn off, category 5 min, product 5 min}, `cache.stockDisplaySeconds` 15, `cache.tuning` {1000 pages,
  repeat 2 s, stats 7 days} in `registry-cache.ts`. Cloudflare purge adapter in `@extas/adapters` (on its mock until the owner's token
  passes the Test in Keys & connections). Guide: [cache.md](docs/admin-guide/cache.md).
- **Tests and gates:** see the S04 block below (one run for PR 602, 558 and 560).

> **বাংলায়:** চার স্তরের ক্যাশ তৈরি: দাম, স্টক বা সেটিং বদলালে সেই পাতা সাথে সাথে নতুন হয়; ব্যাগ, চেকআউট আর অ্যাকাউন্ট কখনো জমা থাকে না।

Next: "Goes well with" and the rest of the product page rows (67 …). The CI device gate itself (PR 85, CI part) runs on every pull
request: 15 phones, 10 tablets and 6 desktop sizes (`tools/device-gate.mjs`, `docs/qa/device-gate.json`). Since 23 Oct it
also signs in on the sample data, so admin controls that only show with data are checked at 44 × 44 too (0 fails in
620 checks). Register:
[S02](docs/MASTER-REGISTER.md#s02--storefront--pr-4088).

### S03 · Combo & bundles — Done (22/22)

> **বাংলায় সংক্ষেপে:** অ্যাডমিনে "কম্বো" পেজে নির্দিষ্ট কম্বো বানানো, রঙের জোড়ার রুল দিলে নিজে থেকে কম্বো, সেটের দাম আর কত বাঁচে, পিসের ছবি দিয়ে সেটের ছবি, আর কম্বো রিপোর্ট। সেটের দাম আপনি নিজে বসাবেন। ~~দোকানের কম্বো পাতা পরে আসবে (S02/S03-এর বাকি PR)।~~ দোকানের কম্বো পাতা এখন তৈরি (২৩ অক্টোবর): কাস্টমার প্রতিটা পিসের রং আর সাইজ বেছে পুরো সেট এক দামে ব্যাগে নেয়; সব সেটের একটা পাতা `/combos`, আর প্রোডাক্ট পাতায় "এটা দিয়ে সেট"। ~~নিজের মতো সেট বানানোর পাতা পরে আসবে।~~ নিজের মতো সেট বানানোর পাতাও তৈরি (২৪ অক্টোবর): যেকোনো 2 বা 3 পিস বাছলে সেটের দাম নিজে বসে; আপনি সুইচ চালু না করা পর্যন্ত পাতাটা "এখন বিরতিতে" দেখায়। কম্বোর তালিকা, জোড়ার পাতা আর ব্যাগ — প্রতিটার ৫ রকম সাজ তৈরি (২৪ অক্টোবর), আর সব সাজ ১০০ নম্বরে মাপা হয়েছে; এখনকার চেহারাই থাকে, আপনি একটা সেটিং বদলালে তবে অন্য সাজ আসে।

**Combo core (PR 89, 90, 571, 99, 101, 96, 97, 575, 104, `@extas/combos`, migration `0004_combos`).**
- **Model (89):** pieces, set price, saving against buying separately, active window.
- **Admin `/admin/combos` (90, 571):** fixed combos with a price box and switches and a live editor; auto colour-pair rules with an 8-step wizard, a rules tab and archive (nothing deleted).
- **Set tiers (99):** "any 2 for X, any 3 for Y" read from Smart Rules (S10 PR 212).
- **Validation, summary, bag (101, 96, 97):** what is still missing before adding; set summary and price (a struck price only from a real "was" price); `addSetToBag` adds one set with its price locked, guarded against double adds, overselling, stale and above-regular prices.
- **Set photo (575):** composed from the piece photos with sharp; "Make set photo" in the admin.
- **Report (104):** `?tab=report` — which sets sell, which colour pairs get picked. Since PR 155 it shows "Ordered value" (placed orders) and "Sales (delivered)" as separate figures from `@extas/metrics`.
- **Permissions:** `combos.read`, `combos.write`, `combos.publish`, `combos.prices` (owner only, CLAUDE.md rule 6). Guide: [docs/admin-guide/combos.md](docs/admin-guide/combos.md).
- **Settings:** registry v14, `registry-combos.ts`. ~~Still planned: 91–95, 98, 100, 102, 103, 572–574, 576 (storefront combo pages and the rest).~~ ~~Still planned: 98, 100, 572–574, 576 (the set builder and the page templates).~~ ~~Still planned: 572–574, 576 (the page templates).~~ All 22 built (24 Oct).

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

**Build your own set (PR 98, 100; demo V12.2 `41-set.js`; 24 Oct).**
- **Engine (98, `@extas/combos` `builder.ts`, `builder-model.ts`, migration `0022_set_builder`):** each live Smart Rules set tier rule (`setTier`, S10 PR 212) with priced tiers is a set group; its styles are the published, priced products in the rule's scope. `checkBuild` refuses too few, too many, outside the group, no price, sold out and more than the stock (the bag counted). "Add set to Bag" puts the picks in as ordinary bag lines, so the bag's rules engine charges exactly the builder's tier price and the bag tier box, bag and checkout show the same numbers (V2.1). One tap is one add (`SetBuilderAdd`).
- **Page `/combos/build-your-own`, `/combos/build-your-own/<rule key>`, `/bn/…` (100):** the tier cards, the set's slots with remove, a card per style (picture tap turns front → back → detail, colours, sizes, its own price, Add), the summary beside on a computer and the bar at the bottom of a phone, the next-tier nudge, a tab per group. The struck regular price only behind `rules.discount.showWasPrice` (CN-009). While off, a "taking a break" page with the ready-made sets. Noindex for the group, preview and off pages.
- **Entries (follow-up 174):** a "Build your own" row and card on `/combos` and a link under "More sets", each only while the builder is open and `entries` is on.
- **API:** `POST /api/bag/built-sets` (same-site only, one tap one add); admin `GET /api/admin/combos/builder?days=` (`combos.read`: settings, the set tier rules, adds, pieces and money per rule) and `POST /api/admin/combos/builder` (`combos.publish`: the options). The admin screen comes with the new admin shell (follow-up 240).
- **Settings (registry v36, `registry-set-builder.ts`, no admin screen, CN-019):** `combos.builder` — off; `rules` [] (all), `categories` [] (all), `maxStyles` 24, `perItem` on, `entries` on. Words: `apps/web/messages/shop-build.<lang>.json`.
- **Tests and gates:** engine tests (`builder-model`, `builder.db`), the bag endpoint and admin API on PostgreSQL, the page model; device gate and seeded Lighthouse on the test server's preview (`?try=1`) of the sample draft rule in both languages; smoke opens `/combos/build-your-own` in both languages.

**Combo templates and their ranking (PR 572, 573, 574, 576; demo V12.2 / V12.3 `42-combo-auto.js`; 24 Oct).** The current look stays the default everywhere, so nothing a customer sees changes until the owner picks a template (one setting each).
- **A rule's own page `/combos/<rule key>`, `/bn/…` (572):** each auto colour-pair rule's list in its template (rule, else `combos.template.list`, L1): L1 pair grid (offer strip, 2 / 3 piece switch, "Has:" colour chips, "My size", order, count, "See all", a pick-your-own card, singles), L2 style cards, L3 season hub, L4 big cards with the size for both and "Add both to bag" right in the list, L5 2 or 3 pieces first. Every filter is in the link (filtered pages noindex); an off, ended or future rule keeps its page with a note and the sets on sale now. `/combos` rule cards open it (follow-up 173).
- **The pair page (573):** `combos.template.page` = current (the C1/C2 page above, ~~auto~~), or P1 pair page (2 taps to bag, "Size for both", "Make it 3 pcs", "Add both to bag · ৳…", sticky phone bar), P2 pick colours, P3 top + bottom, P4 mixed set, P5 fixed pack. The button always says what is still missing. A pair changed while editing takes the old set's place (`replaceGroupKey`, lines archived).
- **The set in the bag (574):** `combos.template.bag` = current (~~B5~~), or B1 one card with each piece's picture, B2 sizes changed in the bag (`PATCH /api/bag/sets`, re-checked and re-priced), B3 B2 + "Add 1 more → 3 for ৳…", B4 each piece's own price + one "Combo discount" line, B5 one short row per set once the bag holds `combos.bag.compactFrom` (3) sets, opening to B2. The bag engine's money in every template.
- **Previews:** `?tpl=L1…L5 / P1…P5` and `/bag?btpl=B1…B5` with a template bar while `combos.template.preview` is on (noindex); the test server's `POST /api/bag/try?sets=N` fills sample sets.
- **The ranking (576, QA tool, no admin screen):** `tools/combo-matrix.mjs` plays every template on the sample sets at 360, 393, 430 and 1280 px; `tools/combo-ranking.mjs` scores 100 points (taps to bag, first-screen completeness, words, layout, tap targets) and knocks out any template that shows another total than the current look. Config `docs/qa/combo-matrix.json`, results `docs/qa/combo-ranking/latest.json`, report [docs/qa/COMBO-TEMPLATE-MATRIX.md](docs/qa/COMBO-TEMPLATE-MATRIX.md). Nothing is switched by it.
- **Settings (registry v39, no admin screen, CN-019):** `combos.list` (seeAllOver 15, firstShown 8, bigListShown 6, builderCard on), `combos.template.preview` (on), `combos.pairPage` (otherPairs 14, packSwatches 4, upsell on), `combos.template.page` and `combos.template.bag` default current, `combos.bag.compactFrom` 3. No migration. Guide: [docs/admin-guide/combos.md](docs/admin-guide/combos.md).
- **Tests and gates:** engine tests (`rule-page-model`, `rule-page.db`, `summary-model`), cart view, the web models and bag/combo APIs on PostgreSQL, the matrix and ranking tools; device gate 0 fails in 4192 checks (the rule pages, every P and B template, both languages); seeded Lighthouse: the rule pages, `/combos` and the bag pass, the Bengali rule page at the edge, the P1 preview misses LCP (2.7 s) like the route's existing combo page on the same box (follow-ups 358, 359).

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

### S04 · Cart, checkout, accounts — Done (41/41)

> **বাংলায়:** ব্যাগ তৈরি — পণ্য রাখা, রং-সাইজ-সংখ্যা বদলানো, পরে কেনার জন্য রাখা, সরানো আর ফিরিয়ে আনা, সেট, অফারের ঘর, দুই সাইজের প্রশ্ন, অর্ডারের হিসাব, কোড, ফ্রি ডেলিভারির অগ্রগতি আর "আপনার পছন্দ হতে পারে"; "ব্যাগে রাখা হয়েছে" শিট। চেকআউটও তৈরি — নাম-ফোন-ঠিকানা, ঠিকানা থেকে এলাকা আর চার্জ (না বুঝলে জিজ্ঞেস করে), পেমেন্টের উপায়, ওয়ালেট, অফারের টিক, কনফার্ম বোতাম, একবার চাপলে একটাই অর্ডার, আর ধন্যবাদ পাতা। কার্ড/মোবাইল পেমেন্ট এখন টেস্ট পাতায়, কোনো টাকা নড়ে না। ডেমো V12.2-এর মতো, বাংলা আর ইংরেজি দুটোতেই। অর্ডারের পাতায় এখন "কেন অগ্রিম, কেন এই চার্জ" কার্ড, আর বাল্ক-কর্পোরেট অর্ডারের অনুরোধ (ডিফল্ট বন্ধ)।

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
- **Screens / routes:** `/checkout` and `/bn/checkout`; `/checkout/pay/<number>` ("Pay" opens the connected gateway, S07 PR 170; until then the test payment page, which answers only while `payments.testPayments` is on and no real gateway is connected: follow-up 50, the go-live guard) and `/checkout/thanks/<number>` (both noindex, only for the browser that placed the order).
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
  (CN-019): the staff's "Get invoice" button is on the admin order page (`/admin/orders/<id>`) for anyone with
  `orders.invoice` (follow-up 180, built 23 Oct with S05).
- **Tests and gates:** `apps/web/src/lib/shop/invoice.test.ts`, the receipt's stored line figures and the staff read in
  `packages/checkout` (`place.db.test.ts`); device gate 2642 checks with 0 new fails (the invoice page filled and
  signed in, English and Bengali; the 25 known `/admin/size-charts` tap-target fails aside); both invoice paths in the Lighthouse budget, the seeded budget and the smoke test.

**Built (PR 563, 565, 561, 127, 128, 605): the rest of the customer checkout.** Migration `0020_gift_mode` (additive); permission `orders.lines`.
> **বাংলায়:** ঠিকানার জন্য কোনো অর্ডার আটকে থাকে না — অর্ডার হয়, টিম একবার ফোন করে; ফ্রি ডেলিভারিতে এলাকা নিয়ে কোনো প্রশ্ন নেই; চেনা নম্বরে অসম্পূর্ণ ঠিকানা জিজ্ঞেস করে না (শুরুতে বন্ধ); কুরিয়ার বুকের আগে "এই পার্সেলে যোগ করুন" আর ধন্যবাদ পাতায় "লুক পূর্ণ করুন" (দুটোই শুরুতে বন্ধ); উপহার মোড — প্রাপকের ঠিকানায় পার্সেল, নোট, তারিখ, দাম লুকানো ইনভয়েস, টাকা আগে (শুরুতে বন্ধ)।
- **No order held over an address (563, SIM-F-030):** an address nothing settles is placed like any order (PLACED, confirmable), flagged with one call task (the weightiest reason); a landmark-only line ("bazar er pashe, Kurigram") gets ADDRESS_CHECK (`checkout.address.check`, on, its words editable); the call queue backend and `GET /api/admin/orders/calls` (`orders.read`).
- **Free delivery is band-exempt (565):** no band question, flag, call, band name or band message; the order is marked `bandExempt` (`@extas/delivery`), the check every later band fix and message asks first.
- **Silent address backfill (561):** with `checkout.address.backfill` on (off by default; orders off / delivered / placed), a known number's line with no place is not asked; the band comes from the address the shop holds, never shown; that full address goes to packing in `Order.backfilledAddress`.
- **Add to this parcel (127, SIM-F-004):** with `orders.addOn` on (off; until confirmed, minutes, lines, pieces), a customer adds a piece to his COD order from the thank-you or order page: a real order line, priced as its product page, held from stock, the money moving by exactly that line; refused once a courier is booked. API: `POST /api/account/parcel`, `/parcel-add`, `/parcel-remove`; staff `POST /api/admin/orders/<id>/lines` and `/lines/<lineId>/remove` (`orders.lines`).
- **Complete your look (128):** with `thanks.look` on (off, max 3), the thank-you page offers only pieces a running combo pairs with the order, at their live price, added through 127; no honest pick, no block. Test servers: `POST /api/shop/try-look`.
- **Gift mode (605, SIM-F-007):** with `checkout.gift` on (off; advance required: full, fixed or percent; note 200 characters; date up to 30 days; hide prices ticked), "Send as a gift" sits under the bag's Checkout and opens `/checkout?gift=1`: the sender's name and a phone of any country or an e-mail (updates only), the gift note and "deliver on or after"; the name, phone and address are the receiver's. Full advance = no Cash on Delivery; a part = the flag GIFT_ADVANCE, `advanceRequiredMinor` and a call task until S07's part payment. No account is made for the receiver. The thank-you page thanks the sender; the invoice hides every price. `deliveryTarget()` in `@extas/orders` is what the sticker and the booking read. Test servers: `POST /api/shop/try-gift`.
- **Why an advance, why this charge (566):** on an order's admin page (`/admin/orders/<id>`, orders.read) the card "Why an advance, why this delivery charge" (`orders.explain`, on; the risk line on) reads the order's own records — the placed event (now with `codOff`), the advance requests, the checkout flag and its layer, the risk assessment, the band and area kept on the order — and gives the reasons in words (team-only lines marked) and ready "what to say" lines in Bengali and English with Copy. Read only.
- **Bulk / corporate lane (606, SIM-F-023):** with `orders.bulkLane` on (off; menu row on; the bag's card at the owner's number of pieces, empty, or when a line can take no more; contact shown; minimum empty, maximum 100000; 3 a day per number or browser; note 1000; prefix BQ-; logo offered, its price empty; advance none) the phone menu and the bag lead to `/bulk-order` (noindex; "page not found" while off): name, mobile, company, e-mail, what, how many, logo, needed by, note, with the bag's pieces and never a price. Migration `0023_bulk_enquiry`; `POST /api/shop/bulk`, `GET /api/admin/bulk-enquiries` (orders.read), `POST /api/admin/bulk-enquiries/:id/status` (orders.notes, audited), `POST /api/shop/try-bulk` (test servers only). The ORD-09 screen and the quote are follow-up 270.
- **Settings:** registry v34 (`registry-checkout-more.ts`, labels in `checkout-more.*.json`) and v38 (`registry-support-lane.ts`, labels in `support-lane.*.json`); no new admin section (CN-019). Guides: `docs/admin-guide/orders.md`, `delivery.md`, `combos.md`.
- **Tests and gates:** guard 0; lint, format and typecheck clean; tests settings 2364, checkout 57, orders 337, db 133, delivery 207, combos 99, web 663 and the rest, all pass; device gate 0 fails in 2146 checks; seeded Lighthouse medians inside the budget; checked in a browser at 390 and 1366 px in English and Bengali.

**Built (PR 558, 560): the checkout's advance (Parameter for Checkout and the advance-payment checkout mode, SIM-F-016).** Migration
`0036_checkout_advance` (additive); settings registry v53 (`registry-advance.ts`).
- **The panel (558):** Orders › Risk rules › Checkout advance (`/admin/orders/risk-rules/checkout`, a "More" tab; `risk.rules.read`,
  saving `risk.rules.write`). One switch `checkout.advance` {off, at most 5 layers: 3/5/10}. Each layer: what counts as a flag (a risk
  score at least, a risk band, a signal; any one; a layer with none is refused), what it asks (nothing, the delivery charge, a part 1–99 %,
  the full amount). Tried from the top; the first switched-on match wins. Saved all at once with its version and one audit row; switching on
  asks for a confirmation; a layer taken off is archived, never deleted. API `GET/PUT /api/admin/risk/checkout-layers`.
- **The checkout (560):** only while the switch is on, only once he has filled in his name, a real mobile number and an address that settled,
  only where Cash on Delivery would show, never on a gift, and only with a prepaid method open. Flagged: the same page, the payment section
  swapped: no Cash on Delivery, bKash, Nagad and card, and one neutral line ("pay ৳X now, the rest ৳Y at your door"). Never a score, a band or
  a reason. A part or the delivery charge ahead is a COD order priced as COD with that much paid now; the full amount is an ordinary prepaid
  order. The order waits in "advance due" and comes back to the queue when it is paid; nothing is cancelled, blocked or repriced.
- **Settings:** `checkout.advance` (labels in `checkout-more.*.json`); the layers are rows (`CheckoutParameterLayer`). Guide:
  [checkout-advance.md](docs/admin-guide/checkout-advance.md).
- **Tests and gates:** Gates on this box: guard 0 findings (1214 files); lint and format clean; typecheck clean (whole workspace, and the web build's own check); tests on PostgreSQL and Redis — db 143, settings 2701, adapters 125, cache 19, checkout 71, catalogue 153, orders 565 (the SIM-F-016 journey included), web 879 in 135 files, all pass; `infra/tests/run.sh` 191 PASS (the Caddy cache headers, the internal addresses 404 from outside, the deploy's cache hook, the setup's cache hook token); web build clean; device gate **PASS, 0 fails in 310 checks** (home, checkout, a category and a product page in en and bn, Settings › System › Cache and Orders › Risk rules › Checkout advance signed in; the first round's 50 tap-size fails on the two admin pages fixed: the switch is a 44 px tap box, the chips and tick boxes 44 px); seeded Lighthouse medians of 3: `/checkout` perf 0.98 / a11y 1 / LCP 1.96 s / TBT 12 ms, `/bn/checkout` 0.97 / 1 / 2.10 s / 30 ms, `/collections/polos` 0.98 / 1 / 1.90 s / 45 ms, `/bn/collections/polos` 0.97 / 1 / 2.09 s / 89 ms, `/p/essential-pique-polo` 0.95 / 1 / 2.31 s / 47 ms, CLS ≤ 0.049; `/bn/p/essential-pique-polo` over the LCP budget on this loaded box (0.86 / 1 / 2.71 s / 240 ms), and the base 44bdd80 measured the same in interleaved runs (follow-up 408); the server page cache answered 96% of page reads as hits. Checked in a real browser at 390 and 1366 px in English and Bengali: the owner adds a layer and switches the panel on behind its confirm; a flagged customer sees nothing until name, phone and address are done, then COD goes and one neutral line says what to pay now and what is left; no score, layer or risk word on the page, no sideways scroll, no console error.

> **বাংলায়:** চেকআউটে অগ্রিম তৈরি: আপনি ঠিক করেন কাকে আগে টাকা দিতে বলা হবে। চিহ্নিত কাস্টমার একই পেজে ক্যাশ অন ডেলিভারি ছাড়া bKash, Nagad আর কার্ড দেখেন, সাথে একটা সাধারণ লাইন। শুরুতে বন্ধ।

S04 is complete (41/41); stage report [2026-10-24-S04](docs/reports/2026-10-24-S04.md). ~~Next: PR 558 and 560 (the checkout's advance rules), the rest of S04.~~ Register: [S04](docs/MASTER-REGISTER.md#s04--cart-checkout-accounts--pr-105137).

### S05 · Order management — Done (21/21)

Stage report (Bengali): [`docs/reports/2026-10-24-S05.md`](docs/reports/2026-10-24-S05.md).

> **বাংলায়:** "বিক্রি" এখন একটাই হিসাব — শুধু ডেলিভারি হওয়া অর্ডার, ডেলিভারির দিনে গোনা; "অর্ডারের মূল্য" (সব দেওয়া অর্ডার) আলাদা করে পাশে দেখায়। সব রিপোর্ট একই হিসাব থেকে নেয়। অডিট লগ আর অন্য ইতিহাস এখন ডাটাবেসেই আটকানো: ওয়েবসাইট নতুন লাইন লিখতে পারে, কিন্তু বদলাতে বা মুছতে পারে না, কেউই পারে না। অর্ডারের ধাপ এখন একটাই নিয়মে চলে: ভুল ধাপ আটকে যায়, প্রতিটা বদল টাইমলাইনে লেখা থাকে; কারণসহ বাতিল আর হোল্ড, টাকা দেওয়া অর্ডার বাতিলে শুধু রিফান্ডের অনুরোধ (টাকা যায় না), ডুপ্লিকেট অর্ডারের যাচাই-তালিকা, নোট আর ফ্ল্যাগ। অর্ডারের অ্যাডমিন পাতাও এখন তৈরি: অর্ডারের তালিকা (কোন অর্ডার কোন অবস্থায় আছে তার ভিউ, খোঁজা, ফিল্টার, ফোনে এক অর্ডার এক কার্ড), এক অর্ডারের পুরো পাতা (সব তথ্য, টাইমলাইন, আর এখন যে কাজগুলো করা যায় শুধু সেগুলোর বাটন — প্রতিটায় "কী হবে" লেখা থাকে), কনফার্ম করার লাইন, আর একসাথে অনেক অর্ডার কনফার্ম / হোল্ড / ছাড়া। টাকা, দাম বা ডিসকাউন্ট কোনো পাতা বদলায় না; টাকা দেওয়া অর্ডার বাতিলে শুধু রিফান্ডের অনুরোধ জমা হয়। রিফান্ড আর রিটার্ন পরের ধাপে। অর্ডার এডিটও এখন তৈরি: কাস্টমার ফোন করলে টিম অর্ডারের পাতা থেকেই নাম, ফোন (লগসহ), ঠিকানা, একই দামে অন্য সাইজ বা একটা পণ্য বাদ দিতে পারে — কারণ আর মাধ্যমসহ টাইমলাইনে লেখা থাকে; কাস্টমারের নিজের এডিট আর "দুই সাইজ" প্রশ্ন (S আর M একসাথে নিলে কোনটা রাখবেন; পরিবারের জন্য হলে শুধু নোট) — দুটোই শুরুতে বন্ধ। কুরিয়ার বুক হলে কোনো এডিট হয় না। কাস্টমারের "আমার অর্ডার" এখন পুরো ইতিহাস রাখে: পাতা পাতা করে সব অর্ডার, অর্ডার বেশি হলে "সব · পথে আছে · ডেলিভারি হয়েছে · বাতিল ও ফেরত" বাছাই, আর প্রতিটা অর্ডারের পাতায় ভাঁজ করা "যা যা হয়েছে" — কখন কী হলো, কে কী বদলাল (টিমের নোট বা ফ্ল্যাগ কখনো না)। অর্ডারের পাতায় কাস্টমারের নিজের এডিটের কার্ড আর "দুই সাইজ" প্রশ্নের কার্ডও এখন আছে — সুইচ চালু করলেই দেখা যাবে।

**Built (PR 610): orders to the ERP v6** (CN-029 Phase 1; only for a store on ERP contract v6) — one line per piece in whole taka,
the ERP's "not now" answers held and sent again by themselves, checkout paused while the ERP account is on hold, short lines decided
on the order page (WAIT, REPLACE, CANCEL), and the order page's ERP card. Details under S09 · Inventory & ERP sync, "Built (PR 610, 611)".

**Built (PR 541, with follow-up 295): the risk-sectioned order list.** Registry v46 (`risk.sections` in `packages/settings/src/registry-risk-more.ts`, on), no migration, no new admin section (the `/admin/orders` list and the order page, demo V12.3). Marking is instant; the decision never is.
- **Sections (541):** the moment an order lands (after the duplicate check and the score) it is placed in **one** section with a note on its timeline: possible duplicate, re-order, new identity, high risk, watch, prepaid or clear (command `riskSection`, the status untouched). Re-order, new identity and high risk **wait for a person**: a "Risk review · <section>" card on `/admin/orders/<id>` says why and lists the matched orders, with Looks fine · Hold (a reason) · Ask the customer (a `RISK_CHECK` call task) · One parcel · Decline (`RISK_DECLINED`, never a block). Re-placed after an edit or "Score again".
- **SIM-F-014:** an order in review is never confirmed or booked — the order machine's new `book` command refuses `IN_REVIEW`, `bookWith` is the one booking entry and `readyToBook` the one list for S08.
- **SIM-F-015:** new signals `identityMatch` (the same name and an alike address under another number, the earlier refusal named) and `orderPieces` (many pieces on a first order), both off.
- **SIM-F-020:** "To confirm" is the COD call queue only; prepaid orders wait in their own **Prepaid** view (and the Dashboard row "Prepaid orders to confirm"); a flagged prepaid order goes to review.
- **The list (follow-up 295):** a Risk column (band · score, section), filters by band and section, and "Highest risk first". API `GET /api/admin/orders?risk=&section=&sort=risk`, `GET /api/admin/orders/reviews?section=`.
- **Tests and gates:** pure `sectionOf` and the machine's `book` guard; PostgreSQL sections (clear, off, prepaid vs COD, SIM-F-014, SIM-F-015, re-order, decisions, list band/sort with cursor pages); the web list chips, filters and timeline words. Guide: [docs/admin-guide/orders.md](docs/admin-guide/orders.md).

**Built (PR 150, with follow-ups 260 and 261): the customer's whole order history and "What happened".** Registry v44 (`account.history` in `packages/settings/src/registry-accounts.ts`: `filters` and `timeline`, both on), no migration, no admin screen (follow-up 302). Matched to demo V12.2 `60-account.js` on the phone; the desktop keeps its own two-column layout.
- **My orders keeps every order (150):** `/account` and `/account/orders` (+ `/bn/…`) list all of his orders, newest first, `account.lists.orders` (20) a page, with Newer / Older and "Page 1 of 3" (`?page=`). Once he has more than a page, the groups **All · On the way · Delivered · Cancelled & returned** show as chips with their counts (`?show=`), and a group with nothing in it says so with a link back to all. `@extas/accounts` `orderHistory` (counts by one grouped read).
- **"What happened" (150):** on `/account/orders/<n>`, folded shut under the items: placed, advance waited for and paid, confirmed, packed, with the courier, delivered (or part), returned or cancelled, each with its stored time, and what he or the shop changed — which fields (never the old or new text), a size from → to, a piece added or taken out, the two-size answer, a cancel asked or kept. Notes, flags, holds, checks and staff names are never shown. `orderLifecycle` reads only the customer-visible event types (`LIFE_EVENT_TYPES`) of his own order (account or this browser), `lifecycleOf` is pure.
- **The edit card (follow-up 260, `orders.edit.customer`, off):** "Change address, phone or size" under the items with how long he may edit and "Edit order (2 left)"; the form opens in place — the address, the mobile number (any way it is typed; the stored one is never re-checked) and, for each piece, the sizes of the same colour at the same price (`CustomerEditState.lines[].choices`). Saved through `/api/account/edit`, then "Order updated · 1 edit left". Closed, it says why (work started, time up, all edits used, with the courier, a cancel asked); no card at all while the switch is off or on a cancelled or returned order.
- **The two-size question (follow-up 261, `orders.twoSize`, off):** "You ordered two sizes" under the order's head with the piece, colour and sizes, "With no answer, we send them all", and **Keep all · Only S · Only M**, answered through `/api/account/two-size-answer`.
- **Test servers only:** `POST /api/account/try-cards` (EXTAS_SHOP_TEST_PAGES=1, mock SMS) signs in as the sample customer, makes the sample order TRY-146 (two neighbouring sizes of one piece, checked by the two-size check) and sets a cookie under which that browser reads both switches as on — nothing is written to settings; the live shop answers 404 and never reads the cookie.
- **Tests and gates:** `lifecycle.test.ts` (pure), `history.db.test.ts` (pages, groups, two customers, hidden internal rows), the edit choices in `edit.db.test.ts`, `try-cards.db.test.ts` (racing fills, nothing written to settings), the registry test; device gate **0 fails in 3231 checks** (100 pages, every size) with the cards, the chips and "What happened" opened; seeded Lighthouse signed in (mobile, 4× CPU, median of 3): My account, one group, the order page and TRY-146 with both cards in both languages — performance 97–98, accessibility 100, TBT 2–130 ms, LCP 1.8–2.1 s, CLS 0.001. Guides: [customers](docs/admin-guide/customers.md), [orders](docs/admin-guide/orders.md).

**Built (PR 142, 143, 146): order edits and the two-size follow-up.** Registry v37 (`packages/settings/src/registry-order-edit.ts`, group `orders`), no migration; every change is a command of the one order service (row lock, version, timeline with who / when / why / where the customer asked, audit before → after), refused once a courier is booked (SIM-F-004).
- **The team's edit (142, `orders.edit`):** "Edit items & address" and "Correct phone (logged)" in More on `/admin/orders/<id>` with the what-will-happen dialog; name, phone (any way it is typed, stored as +880…; SIM-F-037), address, the parcel note, each line kept, changed to another size or colour of the same piece at the same price, or taken out. Never a price, discount, delivery charge or COD change: a size that costs another price now is refused, a set's piece or an offer order's piece is never taken out, the last piece neither (cancel instead); taking a piece out lowers the total and the amount to collect by exactly that line, and a paid order's overpaid part becomes a refund **request**. The stock is re-held, the duplicate check runs again after a phone or line change, the ERP gets the order again. `POST /api/admin/orders/:id/edit`.
- **Real-life reason lists (SIM-F-038):** `orders.edit.reasons`, `orders.edit.channels` (phone call, WhatsApp, Messenger, in the shop …), `orders.refusal.reasons` (bought elsewhere, arrived after Eid …; the courier outcome takes `refusalKey`), and the cancel reason "Did not order (someone else used the number)", never a risk signal.
- **The customer's own edit (143, `orders.edit.customer`, off):** his phone, address and a size in the same colour at the same price, until the owner's step (new only, or until picking starts), an optional time window and a cap (2 saves per order); checked again under the lock so a booking in the same second wins; an address change leaves an ADDRESS_CHANGED call task. `POST /api/account/edit-state`, `/api/account/edit`; the card on the shop's order page is built (follow-up 260, above).
- **The two-size follow-up (146, `orders.twoSize`, off):** right after placing, the same piece in the same colour in neighbouring sizes (the bag's own grouping; S, M, L is one group) flags the order "2 sizes — check", asks on his order page and leaves the caller a TWO_SIZE call task; a group the customer called "for different people" in the bag is only a note, "2 sizes — for someone else" (SIM-F-036). The order page's band answers Keep all / Only S / Only M; "only M" takes the other sizes out through the edit (money and stock consistent), an offer piece waits for a person. `POST /api/admin/orders/:id/two-size`, `POST /api/account/two-size`, `/two-size-answer` (the shop card: follow-up 261, above); WhatsApp and SMS template `order.twoSize` in the default pack, off until the messages are switched on (follow-up 262).
- **Tests:** the machine table with the new commands; PostgreSQL tests through the real checkout for SIM-F-037, SIM-F-038, SIM-F-004 (team, customer and two-size answer after booking), SIM-F-036, sizes at the same price, pieces taken out, the paid-order refund request, STALE, keys, caps and windows; the dialogs and band specs without a browser. Guide: [orders](docs/admin-guide/orders.md).

**Built (PR 138, 144, 145, 147, 153): the order core.** Package `@extas/orders`, migration `0018_order_core`, settings group `orders` (registry v32); its screens are PR 140–154 below.
- **One order service (138):** the states DRAFT, PLACED, AWAITING_ADVANCE, CONFIRMED, ON_HOLD, PROCESSING, PACKED, HANDED_OVER, IN_TRANSIT, DELIVERED, PARTIALLY_DELIVERED, RETURNED, CANCELLED and every command's from → to in `src/pure.ts`; `execute()` runs each command with the order's row lock, the screen's `version` (STALE), the plan (ILLEGAL_TRANSITION with the commands open now), its effects, an OrderEvent (who, when, from, to, reason) and an AuditLog row in one transaction, and an `Idempotency-Key` (a repeat gets the first answer). Flags cancelPending and customerWantsChange; courier, payment and return statuses stay their own records, moved only through the hooks (`awaitAdvance`, `recordAdvance`, `orderStep`) S06–S08 will call. A guard test fails when any other code writes Order.status.
- **Cancel (144):** nine fixed reason codes with the owner's words in both languages (`orders.cancel.reasons`; "Other" needs a note). The cancel releases the order's stock holds, closes a payment still waiting, closes call tasks and reviews, queues the CANCELLED status for the ERP when it had the order, and for anything paid (online or wallet) records a refund **request** only — no money moves (SIM-F-041). A booked order is never cancelled in one step: cancel after booking, then the courier's answer (confirmed → cancelled; refused → the parcel goes on, "customer wants a change", never a risk signal; SIM-F-004). The customer's own cancel (CN-020 (5), SIM-F-056): one tap until the cut-off (`orders.cancel.customer`: off / never / until confirmed (default) / until packed), then a request the team approves or refuses, until booking; `POST /api/account/cancel` and `cancel-state` (no shop button yet, follow-up 190).
- **Duplicate defence (145):** the checkout's one-press key and the converted bag; then, when the order lands, other open orders of the same customer or phone in `orders.duplicates.lookbackDays` (5) days, high (same SKU, or same product and colour), medium (same product, other colour) or low (same category); from `reviewFrom` (medium) the order waits in the review queue and cannot be confirmed; decisions not a duplicate / cancel as duplicate / hold / ask the customer (a call task) / one parcel (an OrderGroup, money untouched), each with a FraudDecision, audit and timeline row; auto-hold of a high match off by default.
- **Notes and flags (147):** internal notes (archived, never deleted; `orders.notes.maxChars`), internal flags from `orders.flags.list`.
- **Hold and release (153):** a reason from `orders.hold.reasons` (support reads it on the order), release back to where it was held from; `orderFollowUps` makes one call task for a hold older than `orders.hold.reviewHours` or an advance past `orders.advance.waitHours` (both 0 = off) and never cancels (SIM-F-043).
- **Admin API:** `GET /api/admin/orders` (views new, awaiting advance, on hold, cancel requests, cancel pending, in review, finished, with counts; search; cursor), `/reasons`, `/reviews`, `/reviews/:id`, `/merge`, `/:id`, `/:id/confirm|hold|release|cancel|cancel-request/approve|cancel-request/refuse|cancel-after-booking|courier-cancel|flags|notes`. Permissions `orders.read`, `orders.confirm`, `orders.hold`, `orders.cancel`, `orders.cancelAfterBooking`, `orders.cancelRequests`, `orders.notes`, `orders.risk.read`, `orders.risk.decide`, `orders.merge`.
- **Tests:** every legal and illegal (command, state) pair against a table written from §6.5.1; PostgreSQL tests with orders placed through the real checkout: two commands at once (one wins, one refused), STALE, idempotent replay and mismatch, the append-only timeline and decision log, every cancel effect, SIM-F-041, F-043, F-056, F-004, hold and release, notes and flags, every duplicate decision; the admin API end to end (login, same site, a reader gets 403). Guide: [orders](docs/admin-guide/orders.md).

**Built (PR 140, 141, 152, 154): the admin order screens** on the new shell (demo V12.3 `#/admin/orders`, ORD-01 / ORD-02 / ORD-07), with follow-ups 200 and 180. No new setting, no migration, no new permission; the order state machine and its commands are untouched (the screens only read and call the admin API).
- **The order list (`/admin/orders`, 140, `orders.read`):** the order service's own views as chips with their counts — all, to confirm, awaiting advance, on hold, cancel requests, cancel pending courier, duplicate review, open, finished — the search box (PR 154), and the status / payment method / channel filters kept in the address, so a view is a link a person can bookmark or send. Each row carries the four separate status chips (order, courier, payment, return or refund), the courier with its tracking code, the pieces, the flags and how long ago it was placed; a table on a computer, one card per order on a phone, the order number as the link for the keyboard. "Orders today" for anyone with `metrics.read`. Tick boxes when the person's keys allow a bulk command.
- **One order (`/admin/orders/<id>`, 141, ORD-07):** the records on ⅔ — items with their stored prices, the customer with their other orders by account or phone, delivery and courier, the duplicate reviews, payments and refund requests — and the timeline with the notes on ⅓; on a phone "Details · Timeline" tabs. A button for every command the order service says is open **now** and the person's keys allow: confirm, hold and release with a reason, cancel with its reason code, cancel after booking with the courier's yes or no, the customer's cancel request approved or refused, flags, notes, and the duplicate review's decisions. Each goes through the admin API with the order's `version` and an `Idempotency-Key`, behind a dialog that first says what will happen; when someone else changed the order meanwhile the answer is STALE, the page reloads it and says so. A paid order's cancel states the refund **request** it records — no money moves, no price or discount changes, nobody is blocked. `?do=<command>` opens a dialog straight from a link, and shows the honest denied state when the person has not got that key. "Get invoice" for `orders.invoice` (follow-up 180).
- **The To confirm call queue (`/admin/orders/confirm`, 141, `orders.confirm`, ORD-02):** the oldest order waiting to be confirmed with its whole card and its command buttons, the number still waiting, and the list behind it.
- **Many orders at once (152):** Confirm, Hold (a reason from the owner's list) and Release from the list, each only with its key. The bar says how many of the ticked orders the command can run on and why the others are skipped (the machine's own plan: a status that does not allow it, an open cancel request, an open duplicate review …), the dialog repeats it with "what will happen", then each order runs on its own with its own `Idempotency-Key` and the version it was ticked at, and the dialog lists what was not done and why, each with a link back to the order.
- **One order search (154):** `orderSearchWhere` in `@extas/orders` — the order number, the customer's name, the courier's tracking code, and for anything that looks like a phone the stored +880 number containing the typed digits (01…, +880…, spaces, dashes, part of a number, Bengali digits ০১৭…). The list and the Ctrl K palette's `#` jump use the same condition; from the palette an order opens its admin page with `orders.read`, or its invoice with `orders.invoice`.
- **The shell (follow-up 200):** the Orders section is its built pages — All orders and To confirm — instead of a placeholder; the sidebar badge counts the orders to confirm plus the open duplicate reviews; "Needs you now" on the Dashboard carries four order rows (to confirm, duplicate review, cancel requests, cancel pending courier) with the oldest one's age, each shown only to the keys that open its list.
- **Routes and permissions:** `/admin/orders`, `/admin/orders/<id>`, `/admin/orders/confirm`; `orders.read` to open the list and an order, and then each button by its own key (`orders.confirm`, `orders.hold`, `orders.cancel`, `orders.cancelAfterBooking`, `orders.cancelRequests`, `orders.notes`, `orders.risk.read`, `orders.risk.decide`, `orders.merge`, `orders.invoice`, `metrics.read` for the figures).
- **Tests and gates:** the screens' data helpers tested without a browser (`apps/web/src/lib/admin-orders/*.test.ts`: the rows and chips, the detail view, the command specs, the bulk plan and its skip reasons) and the read helpers on PostgreSQL (`packages/orders/src/admin-read.db.test.ts`, `search.test.ts`); device gate signed in **0 fails in 124 checks** on the three pages and a sample order page; the smoke test opens both new pages and, through its new `adminDiscover` step, one order page found on the list; signed-in Lighthouse (mobile, 4× CPU): the order page performance 97, accessibility 100, TBT 160 ms, LCP 1.8 s, the list accessibility 100 and CLS 0 with TBT 1,520 ms at the default 50 rows (120 ms with one row: follow-up 223). Guide: [orders](docs/admin-guide/orders.md).
- **Planned:** the duplicate / risk review queue, packing, returns and the order settings tabs (follow-up 221), the confirm queue's own tick boxes, call script and WhatsApp self-confirm (220), and Book courier / Print / Tag / Export in the bulk bar (222).

**Built (PR 148, 149, 151): the customer's order messages, their log, and the order export** (backend and admin API; the Messages pages are follow-up 280). Package `@extas/messages`, migrations `0025_message_journey` and `0026_notification_attempts`, settings group `messages` (registry v40, v41) and `orders.export.*` (v42).
- **The order journey (148, CN-019 Messages control centre, MSG-01):** each step — placed, self-confirm, confirmed, packed, booked, out for delivery, delivery day, delivered, Day-1 care, Day-3 review, and the notices cancelled, on hold, advance requested, gift receiver — has its on/off, channel (SMS, WhatsApp, e-mail), fallback, template, delay and audience in `messages.journey` (the owner's send rule: placed SMS + e-mail, confirmed SMS, one WhatsApp when packed, Day-1 and Day-3 WhatsApp on; the rest off). The worker job `messages.run` turns the order timeline (`OrderEvent`) into one queued `NotificationLog` row per step and channel with the dedupe key `order:<id>:<step>:<channel>`; a step once planned is never planned again on any channel (the no-double-send guard), and a step older than the look-back (`messages.engine`, 180 minutes) is never sent late.
- **Before each send:** the master switch (`messages.enabled`, on), quiet hours (`messages.quietHours`, off; the order-placed and self-confirm messages never wait), the caps per order (`messages.caps`: SMS 2, WhatsApp 1; Day-1, Day-3 and the notices outside them), the recipient (a gift's updates go to the sender who paid, never the receiver), and the render rules: no link, no unknown token, and a money line only from the order's own due amount (SIM-F-001: a fully paid order is never asked to pay; the exact-amount line, `messages.exactAmount`, follows `account.track.exactAmount`, CN-014 idea 10). A channel that cannot reach the number falls back (WhatsApp → SMS).
- **Texts:** every template in English and Bengali in the default pack (v2, 74 templates); the language follows the store (`messages.language`).
- **Providers:** SMS, WhatsApp and e-mail go through the connection layer; until the owner types a key in Keys & connections every message goes to the mock and nothing leaves the server (A1.3).
- **WhatsApp self-confirm (148, CN-014 idea 5, off):** a cash-on-delivery order gets "reply 1 to send it, 2 to change it, 3 to cancel it" (`messages.selfConfirm`: wait 3 hours, all orders, the order's one WhatsApp). His 1 confirms the order through the order service with a staff confirm's guards (`confirmOnYes`, on; an open duplicate review, cancel request, advance or hold leaves it for the team); 2 or 3 make a call task and change nothing; no reply in the wait makes one call task. Until the WhatsApp webhook exists (follow-up 282) staff record the reply.
- **The log with retries (149):** every try is a `NotificationAttempt` row (append-only, locked at the database like the audit log) with provider, mode, error and cost; a failed send waits and tries again (`messages.retry`: 3 tries, after 5 and 30 minutes), then is FAILED with its reason and the fallback channel runs. Staff see the log with filters and counts per status (`messages.log.pageSize` 50) and one message's tries, and retry a FAILED message by hand (audited; not when the step already went by another channel).
- **Order export (151):** the list's filters or up to 1,000 ticked orders as one CSV file, newest first; the owner's columns and order (`orders.export.columns`, 31) and separator (`orders.export.delimiter`, comma); more than `orders.export.maxRows` (5,000) is refused with the count, never cut. The customer's name, phone, e-mail and address only with `orders.exportPersonal`; cost, ERP figures, IP and device never. BOM for spreadsheets, times in the store's zone, a leading `'` on a cell a spreadsheet would run as a formula. Each export is an ExportJob and an audit row; the file is not kept.
- **Admin API and permissions:** `GET|PUT /api/admin/messages/journey`, `POST /api/admin/messages/self-confirm`, `GET /api/admin/messages/log`, `GET /api/admin/messages/log/:id`, `POST /api/admin/messages/log/:id/retry`, `GET|POST /api/admin/orders/export`; `messages.journey.read`, `messages.journey.write`, `messages.selfConfirm.reply`, `messages.log.view`, `messages.log.retry`, `orders.export`, `orders.exportPersonal`.
- **Tests:** the pure rules (steps, render rules, answers), the journey on PostgreSQL with orders placed through the real checkout (never twice, caps, look-back, quiet hours, the master switch, fallback, gift sender, self-confirm answers and timer, the yes-confirm and its guards, retries and the log), the export (permissions, personal columns, filters, ticked orders, limit, formula guard) and the admin API end to end. Guides: [comms](docs/admin-guide/comms.md), [orders](docs/admin-guide/orders.md).
- **Planned:** the Messages pages (280), live WhatsApp and e-mail providers (281; SMS is follow-up 140), the WhatsApp reply webhook (282), ~~the out-for-delivery event from S08 (283)~~ (built with PR 184), promotions (284), the Export button (222).

**Built (PR 546, follow-up 287): the cancellation notice (SIM-F-013)** (backend and admin API, on the PR 148 journey; registry v45, default pack v3, no migration).
- **Why, in plain words:** the journey's "cancelled" step (off by default, outside the caps, never twice) fills `{cancelReason}` from `messages.cancelNotice` — short words per cancel code in English and Bengali ("The item ran out of stock. Sorry!"); the team's own note is never sent.
- **Silent reasons:** a fake order (RISK_DECLINED) and "someone else used his number" (NOT_ORDERED) send nothing and the log says `REASON_SILENT`; the list is a setting.
- **Duplicates:** a duplicate cancelled while his other order goes ahead gets `order.cancelledDuplicate` with that order's number and tracking link (`{keptOrderNumber}`, `{keptOrderLink}`): the duplicate review's match, else his other open order by phone or account; with none, the plain notice. A kept-order token without such an order is refused, never sent empty.
- **Cancel request refused (follow-up 287):** its own step `cancelRefused` (off, SMS, `order.cancelRefused`), started by the refusal's timeline row; only while the order still goes ahead.
- **Admin API:** `GET|PUT /api/admin/messages/journey` reads and saves `cancelNotice` too. Guide: [comms](docs/admin-guide/comms.md).
- **Tests:** the words and refusals, the pack, and on PostgreSQL through the real checkout: off by default, one notice with the reason and the link, the one-tap cancel, a duplicate declined in review and one cancelled by hand, the silent reasons, outside the caps, the refused request.

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

### S07 · Payments & wallet — In progress (8/10; the launch rows are done)

> **বাংলায় সংক্ষেপে:** প্রতিটা পেমেন্টের অবস্থা আর টাকার হিসাব এখন এক জায়গায়; গরমিল হলে সবসময় কারণসহ দেখায়। টাকা দেওয়া কাস্টমারকে
> রাইডার আর টাকা চাইবে না। কুরিয়ারের হিসাব (CSV) মিলিয়ে দেখা যায়। বিকাশ যুক্ত করার ব্যবস্থা তৈরি, চাবি না দেওয়া পর্যন্ত অনুশীলন মোডে।
> পেমেন্ট ব্যর্থ হলে বা ফেরার পথে নেট গেলেও অর্ডার একটাই থাকে, টাকা এলে সার্ভার নিজে খুঁজে লিখে রাখে। ~~ফেরত (রিফান্ড) আর ওয়ালেট পরে আসবে।~~
> কাস্টমারের ওয়ালেট এখন একটা খাতা (ভুল হলে উল্টো এন্ট্রি, কিছু মোছা হয় না); রিফান্ড আপনার অনুমোদন ছাড়া কখনো যায় না; প্রি-অর্ডারে
> সীমার মধ্যে অগ্রিম চাওয়া যায়; বিকাশ/নগদ/কার্ডের স্টেটমেন্ট মিলিয়ে রিপোর্ট, প্রতিটা অমিল কারণসহ। সব নতুন সুবিধা বন্ধ অবস্থায় আসে।

**Built (PR 165, 166, 167, 170, package `@extas/payments`, migration `0030_payments`, registry v47).** No refund, wallet, COD rule, price, charge or discount changed; no money moves by itself.
- **Payment model (165):** payment states INITIATED → PENDING → AUTHORIZED → PAID / FAILED / CANCELLED through one outcome writer; money status ESTIMATED → PROVISIONAL → RECONCILED → FINAL, only forward; the amount due and what the rider collects; every mismatch has a reason code (SIM-F-028). Staff-recorded money is off by default (`payments.manual`), needs `payments.record`, one per Idempotency-Key, audited.
- **COD after the door (166):** a paid customer is never asked again (SIM-F-001); the rider's outcome per parcel — delivered, partial, charge paid and returned, refused (SIM-F-005), once per parcel (`payments.door`); a partial waits for approval (`payments.cod.partialNeedsApproval`, on; `payments.partials`); courier statements by CSV or lines (`payments.settle`), each line matched with its reason, a checked line resolved with a note; the cash with the courier and on the road.
- **Gateways (167):** one gateway contract for bKash, Nagad and card in `@extas/adapters` with the practice gateway; bKash tokenized checkout behind it, keys only in Keys & connections, on the practice gateway until the Test passes.
- **Callbacks (170, SIM-F-026):** `GET|POST /api/payments/callback/<provider>` checks our signed address, stores each callback once (a repeat is one payment, a forged one is never processed) and asks the gateway before writing money; "Pay" opens the gateway; the worker's `payments.pending.sweep` asks about unanswered payments after 10 minutes and marks them abandoned only when the owner sets a time (off); failed, abandoned and waiting payments for the team.
- **Go-live guard (PR 125, follow-up 50):** the test payment page answers only while `payments.testPayments` is on (switched off on go-live day) and no real gateway is connected.
- **Admin API:** `/api/admin/payments/` — `orders/:id` (money), `orders/:id/payments` (record), `orders/:id/door`, `door/:id/decide`, `cod`, `settlements`, `settlements/:id`, `settlements/lines/:id/resolve`, `issues`. Permissions `payments.view`, `payments.record`, `payments.door`, `payments.partials`, `payments.settle`. No admin page yet (follow-up 333); guide `docs/admin-guide/integrations.md`.
- **Settings:** group `payment` — `payments.manual`, `payments.mismatch.reasons`, `payments.cod`, `payments.cod.statement`, `payments.pending`, `payments.testPayments`; every number editable, new features off.
- **Tests:** the pure model, matching and statements; PostgreSQL money, door, statements, callbacks, the sweep and SIM-F-001/005/026/028; the bKash adapter against a fake bKash; the admin API, the shop's callback journey and the guard; the worker's job and planner.
**Built (PR 171, 172, 173, 174, migration `0038_wallet_refunds_statements`, registry v55 `registry-wallet.ts`).** Every new feature is off; nothing pays out by itself.
- **Wallet (171):** one ledger writer (made on first use, one entry per key, never below zero, the balance after each entry; append-only at the database); a correction is a new entry the other way, once; a person's own credit / debit off until `payments.wallet.manual` (limit, reason, [confirm], audited; `payments.wallet`); the late-delivery apology credit (CN-018 #8) off until `payments.wallet.apology` — per order or by rule (an amount or a % of the goods, only when late past the promise), once per order, to the wallet (`payments.apology`).
- **Refunds (172):** asked within `payments.refunds` (to the wallet off; none after delivery except the rider's overcharge, never more than he over-collected; a returned prepaid parcel gives everything back or keeps the delivery charge; four eyes off), never more than the money not yet held by another refund; the owner approves or rejects with [confirm]; paid out to the wallet through the ledger, or by a person who sends the money back and records the reference; the payment becomes partly or fully refunded; the money owed to customers is always on the list (`@extas/metrics`). Permissions `payments.refunds.request`, `.approve`, `.execute`.
- **Partial payment (173):** a pre-order's advance on a COD order within `payments.partial` (off; cap 10% of the total; no minimum; the whole order in advance off), paid online by the customer; only money that came in lowers what the rider collects (`payments.advance`).
- **Reconciliation (174, SIM-F-028):** a gateway's statement file (`payments.statement` column names) imported once per file and reference, each line matched by its transaction ID with a reason code on every mismatch (`payments.statement.reasons` words), a checked line resolved with a note, the practice gateway's own statement; the report of a period — ours against each gateway's statements and fees, every open mismatch (gateway, courier COD, payment rows, missing) with its reason, the COD position, money owed to customers, paid cancelled or returned orders with no refund asked (SIM-F-041), the wallet ledger check.
- **Admin API (171–174):** `wallets/:customerId`, `wallets/:id/entries`, `wallets/entries/:id/reverse`, `apology`, `orders/:id/apology`, `refunds`, `orders/:id/refunds`, `refunds/:id/approve|reject|complete|fail`, `orders/:id/advance`, `statements`, `statements/:id`, `statements/lines/:id/resolve`, `statements/practice`, `reconciliation?from=&to=`. No admin page yet (follow-up 422); guide `docs/admin-guide/finance.md`.
- **Settings (v55):** `payments.wallet.manual`, `payments.wallet.apology`, `payments.refunds`, `payments.partial`, `payments.statement`, `payments.statement.reasons`.
- **Tests:** the ledger, refund, advance and statement rules; PostgreSQL wallet, refunds, advance, statements and the SIM-F-028 acceptance test (no open mismatch without its reason and words); the metrics money figures; the admin API.
- Still planned in S07 (after launch): Nagad (168), card (169).
Register: [S07](docs/MASTER-REGISTER.md#s07--payments--wallet--pr-165174).

### S08 · Courier, returns, exchange — In progress (21/26)

> **বাংলায় সংক্ষেপে:** কুরিয়ারের কাঠামো তৈরি: Steadfast আর Pathao একই নিয়মে চলে, চাবি না দেওয়া পর্যন্ত প্র্যাকটিস মোডে।
> বদল, ফেরত মাল চেক আর দরজায় ফেরতের পাতা তৈরি: যে পিস আসলে ফেরত আসে স্টকে সেটাই ফেরে; নিজের সাইজ বাছাইয়ে দ্বিতীয় ডেলিভারি কাস্টমার দেন, আমাদের ভুলে ফ্রি;
> দোকানের দোষে দরজায় ফেরত কখনো গোনা হয় না; দরজায় ফেরতের তালিকা শুধু প্রস্তাব করে, একজন মানুষ ঠিক করেন, কাউকে আটকায় না।
> বুকিং সবসময় একজন মানুষ করেন; বাতিল, হোল্ড বা রিভিউতে থাকা অর্ডার কখনো বুক হয় না; গিফট যায় যে পাবেন তার কাছে, তার দিনের আগে না।
> কুরিয়ারের সমস্যা (ডেলিভারি ব্যর্থ, ঠিকানায় সমস্যা, হারানো, নষ্ট) কারণসহ দেখা যায়; ফেরত পার্সেলের খরচ শুধু আসল পার্সেল থেকে। টাকা এখান থেকে কখনো নড়ে না।
> নতুন: অর্ডার → প্যাকিং আর প্রিন্ট — স্টিকার (বারকোড, আসল COD, গিফট হলে যে পাবেন), আবার প্রিন্ট করলে কারণ লেখা থাকে; দৈনিক পিকিং লিস্ট (ক্যাটাগরি → স্টাইল → রং → সাইজ, কম স্টক দাগানো, হোল্ডের অর্ডার আলাদা); রাইডারের হ্যান্ডওভার শিট আর "হ্যান্ডওভার হয়েছে"।
> নতুন: কুরিয়ারের খবরে অর্ডার নিজে এগোয় (নিয়ম মেনে); কুরিয়ার "পৌঁছেছে" বললেও আমাদের হিসাবে ফেরত মনে হলে একজন যাচাই করেন; পার্সেল কেন ফেরত এলো — রাইডারের কথা আর মালিকের তালিকা থেকে কারণ। সব নতুন সুইচ শুরুতে বন্ধ।
> নতুন: প্যাক পাতা — পিক, প্রতিটা পিস স্ক্যান, সব মিললে তবেই "প্যাক হয়েছে", তারপর কুরিয়ার বুক আর হ্যান্ডওভার; প্যাকিংয়ের ছবি আর ওজন মেলানো (দুটোই শুরুতে বন্ধ)। পিস ভাঙা বা পাওয়া না গেলে কার্ড খোলে, অর্ডার হোল্ডে যায়; একজন মানুষ ঠিক করেন — পাওয়া গেছে, অন্য সাইজ, বাকিটা পাঠান, ফোন বা বাতিল। নিজে থেকে কিছু বাতিল হয় না, টাকা ফেরত শুধু মালিকের কাছে অনুরোধ।
> নতুন (PR 612–614, ERP-র নতুন নিয়মে — সুইচ চালু হলে): কুরিয়ার ফেরত দেওয়া পার্সেল গুনে ERP-তে তালিকা যায়, গুনতিতে না মিললে কুরিয়ারের কাছে দাবি; ফেরতের নতুন পাতায় সাতটা ট্যাব, প্রতিটা পার্সেলের পুরো ঘটনা, ক্ষতির হিসাব আর প্রতি রাতে ERP-র সাথে মেলানো; বদল ERP দিয়ে, ডেলিভারির 72 ঘণ্টার মধ্যে, আগে স্টক দেখে। পিস আবার বিক্রি হবে কিনা মালিক ERP-তে ঠিক করেন। ডেলিভারির পর কোনো টাকা ফেরত নেই। এখন সব দোকান আগের নিয়মেই চলে।

**Built (PR 611): the shipment at pickup and every delivery result to the ERP v6** (CN-029 Phase 1; v6 stores only) — the shipment
goes when the courier confirms pickup (the ERP's bill), every courier result by `PUT /orders/{id}/delivery` (held while a PR 525
check is open), the order page's Partial delivery box and the ERP's identification colour. Details under S09 · Inventory & ERP
sync, "Built (PR 610, 611)".

**Built (PR 175, 176, 177): couriers behind one adapter.** New package `@extas/shipping`; the courier contract in `@extas/adapters` (`src/courier/`); migration `0033_courier` (additive: parcel mode, try, reference, receiver, note, exception, tracking time; event id, reason, source); settings registry v50 (`packages/settings/src/registry-shipping.ts`, group `delivery`); backend and admin API only — the Delivery screens come on the new admin shell (follow-up 370).
- **The contract (175):** one `CourierApi` — book, find by the shop's reference, track, health — with the shop's own parcel states and the courier exceptions of SIM-F-017 (a failed try, an address problem, lost, damaged), each with a reason. A courier word the table does not know is stored raw and flagged, never guessed. A courier never invents money: a charge or a collected amount is only what the courier itself said.
- **Practice first (A1.3):** every courier runs on its practice world until the owner types its keys into Keys & connections and the Test passes — deterministic `MOCK-` ids, scripted lives (delivered, review, failed try, address problem, lost, damaged, partial, refused) in the courier's own words, planned failures and timeouts, no money ever (SIM-F-027).
- **Parcels (175):** courier accounts (`/api/admin/delivery/couriers`: add, switch off, archive — never deleted); events stored once per courier event id, the state from the newest understood event (out-of-order safe, finished stays finished); staff record what the courier said on the phone (`POST …/parcels/:id/exception`, audited); the parcel list by view and one parcel with every event (`/api/admin/delivery/parcels`).
- **RTO cost book (175, SIM-F-027):** `GET /api/admin/delivery/rto-cost` — the shop's own returned parcels only, both courier legs (the courier's report, else the owner's rate card by weight slab), packaging, handling and the ad share from `delivery.courier.rtoCost` (owner figures empty; a missing part named, never counted as zero); practice parcels never real cost.
- **Booking (176):** always a person's press — one order, the ticked ones or "Book all" (`GET/POST /api/admin/delivery/bookings`) — through the order service's `bookWith` and its `readyToBook` view, so a cancelled, held, unconfirmed or in-review order is never booked (SIM-F-002, SIM-F-014). The parcel goes to `deliveryTarget()` (a gift's receiver, the owner's gift line, held until its booking day; SIM-F-007), carries the live amount due, and the order refuses every edit once booked (SIM-F-004); the weight is the pieces' own, unknown never guessed (SIM-F-029). Refused → `BOOKING_FAILED` with the reason, ready again; no answer → "Try again" asks the courier by reference first (`POST …/parcels/:id/retry`), never booked twice.
- **Tracking (176):** the worker job `courier.track` (queue `courier`) reads the parcels the couriers hold per store and slot; staff read one now (`POST …/parcels/:id/track`).
- **Steadfast (176) and Pathao (177):** Steadfast — API key and secret key; its `hold` is a failed try. Pathao — client id and secret, merchant login, Pathao store id; Sandbox/Live addresses; zone ids from the area mapping, weight in kg, its own fee recorded as the courier's charge; it charges by weight, so a parcel without one is never sent (`NO_WEIGHT`); no lookup by reference, so a lost answer is never booked again by guess.
- **Settings (v50):** `delivery.courier.rtoCost`; `delivery.courier.booking` (gift lead days 0, gift line en/bn, note language en, piece names on, 100 per press); `delivery.courier.tracking` (on, every 60 minutes, 200 a run). Permissions `delivery.parcels`, `delivery.book`, `delivery.exceptions`, `delivery.couriers`.
- **Tests:** the contract and both clients against stand-in servers (no real keys); booking, tracking and the RTO book on PostgreSQL (every SIM finding above); the routes; the job and its planner; every state, reason, outcome and courier labelled in both languages. Guides: [couriers](docs/admin-guide/couriers.md), [Keys & connections](docs/admin-guide/integrations.md).

**Built (PR 179, 180, 181): Orders → Packing & print.** New package `@extas/documents` (pure: data in, PDF bytes out — each page one greyscale picture at the printer's dpi, so Bengali prints right on any printer; Code 128; text shaped by the server's fonts); migration `0043_courier_zones_print` (additive); settings registry v56. Three pages on the new admin shell, each with its Bengali guide.
- **Print run (179) — `/admin/orders/packing/print`:** the booked parcels still with us, in packing order. The sticker: shop and courier, the consignment id as a barcode with the tracking code, the receiver (a gift's receiver, sender and day; SIM-F-007), the live amount to collect on a black band or "collect nothing", every piece in a box (no prices), REPRINT n; too many pieces → smaller type, then a second sticker (2/2). A parcel not booked, already picked up, with a COD that is not the live due or a receiver changed after booking is refused as a whole (SIM-F-004). API `/api/admin/packing/stickers`.
- **Print queue and reprint safety (180):** every press is one print job (which parcels, who, when); the same press sent twice prints once; a reprint is the same parcel with its reason ("Recent prints" on the page). Nothing books, re-books or changes COD.
- **Picking list (181) — `/admin/orders/packing/picking`:** every order still with us and not with the courier, however many days (Blueprint B1.6); held and problem orders listed apart and never counted; category → style → colour → size, most pieces first, a tick box per size and SHORT n against the shop's stock; the summary line (orders and pieces apart, line items, categories, shortages, held; B1.7); each print kept as a PickingList. API `/api/admin/packing/picking`.
- **Handover (180) — `/admin/orders/packing/handover`:** per courier the printed parcels waiting, the rider's sheet (one open batch per courier, A4 on the letterhead, ticks, COD total, signatures) and "Handed over" with the receiver's name (every order HANDED_OVER through the order service, audited). API `/api/admin/packing/handover`.
- **Settings (v56):** `delivery.sticker.layout` (100x150 mm, 203 dpi, en, type 100 %, smallest 80 %, shop name on, 100 per print), `delivery.sticker.exactAmount` (off), `delivery.sticker.queue` (reason asked on, 20 recent prints), `delivery.handover.sheet` (A4, 150 dpi, en, receiver name, signatures and pack on handover on), `delivery.picking.list` (A4, 150 dpi, en, mark shortages on) — shown read-only on the pages until the settings editor (follow-up 431). Permissions `fulfilment.read`, `fulfilment.print`, `fulfilment.handover`.
- **Tests:** the PDF writer, Code 128 (a scanner round trip), the layout and both PDFs (en/bn, opened and checked); print, reprint, replay, handover and picking on PostgreSQL; the routes; device gate on the three pages. Guides: [print](docs/admin-guide/pages/orders/print.md), [picking](docs/admin-guide/pages/orders/picking.md), [handover](docs/admin-guide/pages/orders/handover.md).
- **Not here (their own PRs):** COD collection and the courier's money (S07, 525–526), ~~the packing step and the weight check (182; follow-ups 433, 434)~~ (built: PR 182, 183, below), returns and refused parcels (189, 191), the order's status from the parcel and courier webhooks (184), the courier choice by real cost (178), the rest of S08.

**Built (PR 182, 183): Orders → Packing & print → Pack.** One page, `/admin/orders/packing` (the tab's first page), on the order service (`@extas/orders`) and `@extas/shipping` (`packing.ts`, `packing-pure.ts`, `packing-issues.ts`); migration `0046_packing` (additive: PackingScan, append-only and locked; PackingPhoto; PackingCheck); settings registry v59 (`packages/settings/src/registry-fulfilment.ts`, group `delivery`); permissions `fulfilment.pack`, `fulfilment.photoWaive`.
- **Four steps (182):** Pick (confirmed) → Pack (picking) → Ready for courier (packed) → Handed over (today and the days set), each with its count; every list and "Start picking for all" share one filter, so a cancelled, archived, in-review or cancel-asked order never shows (SIM-F-002). The screen shows the order number, pieces, SKUs and the courier — no customer name, phone or address.
- **Every piece checked (182):** scanned (SKU or barcode), typed when the scanner is off, or ticked in tick mode; a code not on the order or a line already checked is refused and nothing stored. "Mark packed" goes through the order service under the order's lock only when every line matches, no packing card is open, the owner's required photo is there and the weight is near the pieces' weight.
- **Packing photo (182, SIM-F-010):** from the phone camera, location and metadata stripped; "required" stops packing and booking (`PHOTO_REQUIRED`), "remind" only reminds; the owner's waiver with a reason (`fulfilment.photoWaive`); the nightly job `packing.photos.expire` archives records past the days to keep (files are never removed; follow-up 463).
- **Weight check (182, follow-up 434):** the scale reading against the pieces' weight; a gap over both the percentage and the grams asks to weigh again or confirm (`WEIGHT_GAP`).
- **Book and hand over (182, follow-up 433):** a packed order is booked from the screen with every booking rule; the handover now needs packed parcels (`packOnHandover` off).
- **Defect or missing piece (183, SIM-F-006):** "Report defect / out of stock" on a line opens a packing card (the stock sync's shortage card shows the same way) and holds the order, from confirmed or from picking. Any open card stops packing and booking. A person decides each card through the order service: found / fine (a shortage card needs `inventory.audit`), another size or colour at the same price (`orders.edit`), send the rest (`orders.edit`; a paid order gets a refund **request**, PR 172), cancel as out of stock (`orders.cancel`), or "Call the customer" (one call task). The last decided card releases the hold. Nothing is cancelled or refunded by itself; a card past the hours is only marked late; a booked parcel is not edited.
- **Settings (v59):** `fulfilment.packing.check` (scan, typed on), `fulfilment.packing.photo` (off; required, 1 photo, 30 days), `fulfilment.packing.weight` (off; 15 %, 100 g, reading not required), `fulfilment.packing.queue` (1 day, 200 a list), `fulfilment.packing.issues` (hold on, defective-item / waiting-stock, 48 hours to decide, edit reason customer-asked) — read-only chips on the page until the settings editor (follow-up 462).
- **API:** `GET /api/admin/packing/orders?step=`, `GET …/orders/{id}`, `POST …/orders/pick-all`, `…/{id}/start`, `…/{id}/piece`, `…/{id}/pack` (Idempotency-Key), `…/{id}/photo`, `…/{id}/waive`, `…/{id}/issue`, `…/{id}/issues/{issueId}/resolve`, `…/{id}/issues/{issueId}/call`.
- **Tests:** the pure checks, packing and the cards on PostgreSQL (SIM-F-002, SIM-F-006, SIM-F-010; swap, send the rest with the refund request, cancel, the hold released), the order machine's hold from picking, the routes; device gate 0 fails on the four packing pages; the card pressed in a real browser. Guides: [pack](docs/admin-guide/pages/orders/pack.md), [orders](docs/admin-guide/orders.md).
- **Not here (their own PRs):** the bad-stock push to the ERP (follow-up 461), the settings editor (462), packing cards on the Dashboard (468), the rest of S08.


**Built (PR 184, 525, 526): what the courier tells us after booking.** Migration `0045_delivery_check` (additive: one DeliveryCheck per parcel); settings registry v58 (`packages/settings/src/registry-courier-sync.ts`; `orders.refusal.reasons` moved to v58); permission `delivery.outcomes`; backend, admin API and small additions to the order pages.
- **The order follows its parcel (184):** after every read the courier's word moves the order through the one order service (`@extas/orders`, never around it) — picked up → in transit (the new `courierPickedUp` step, so a forgotten hand-over press does not stall it), delivered, partly delivered once the kept pieces are named, returned; an order on hold or waiting for a cancel answer is left and caught up on the next run. "Out for delivery" goes on the timeline once per trip (the customer's message starts from it, when on). Failed tries, address problems, lost and damaged change nothing on the order and show with their reason. The parcel list has `view=late` (past the band's promise; SIM-F-018).
- **The order page (184):** the courier card shows where the parcel is now, the courier's problem in words, when it was picked, delivered or returned and when we last read it; the timeline names the courier as the actor.
- **The customer's order page (184):** one plain line under the steps — out for delivery, a try failed, the rider is looking for the address, we are checking with the courier — behind `account.track.courier` (off; problems shown when on); English and Bengali, phone and desktop.
- **True-delivery check (525, SIM-F-005):** with `delivery.truthCheck` on, a "Delivered" that our own records contradict — the courier collected only the delivery charge on a COD parcel, a door record says it came back, the courier's statement pays it as a return, the parcel was received back — opens one check per parcel (late signs are swept on every tracking run, back `lookbackDays`). While it is open the order is not marked delivered ("hold the order", on). A person with `delivery.outcomes` resolves it on the order page's red band: really delivered, came back with the charge paid, came back (an order already delivered is corrected by the new `deliveryCorrected` step). What really happened is kept beside the courier's claim on the parcel's one return record. `GET /api/admin/delivery/checks`, `POST /api/admin/delivery/checks/:id/resolve`. No money moves, no COD changes, no door record is written.
- **Why it came back (526, SIM-F-038):** the courier's note on a return, a partial delivery or a failed try is kept as the rider's note; a person records the reason from the owner's list — now with "didn't like it" and "ordered by mistake" beside size, not as in the picture, bought elsewhere and the rest — with the rider's words (`POST /api/admin/delivery/parcels/:id/return-reason`). It goes on the parcel's one return record (refused at the door, or charge-paid when the courier collected money), the timeline and the phone history (PR 521). The order page shows "Why it came back" and the rider's note, with a band while no reason is recorded.
- **Reports (525, 526):** `@extas/metrics` `deliveryTruth` (courier-delivered beside what really happened) and `returnReasons` (by reason and by kind), store-wide or for one customer; counts only.
- **Settings (v58):** `account.track.courier` {off, problems shown}; `delivery.truthCheck` {off, hold the order, 30 days back (1–180)}; `orders.refusal.reasons` (13 reasons + "other", the owner edits them in both languages).
- **Tests:** the sync, the check and the return reasons on PostgreSQL (SIM-F-005 and SIM-F-038 journeys on the practice courier), the order state machine's new steps, the routes, the order-page buttons, every word in both languages. Guides: [couriers](docs/admin-guide/couriers.md), [one order](docs/admin-guide/pages/orders/order.md).
- **Not here (their own PRs):** COD collection and the courier's money (S07), receiving returns and refused parcels (189, 191; follow-ups 450, 451), the courier webhooks (follow-up 372), the Delivery screens (follow-ups 370, 452), the sticker (179), the courier choice by real cost (178), the rest of S08.


**Built (PR 185, 187, 188, 189, 190, 191): exchanges, returns and refused parcels.** Package `@extas/orders` (`exchange.ts`, `exchange-pure.ts`, `exchange-switch.ts`, `exchange-charge.ts`, `returns.ts`, `return-cases.ts`, `refused.ts`); migration `0044_exchange_returns` (additive: exchanges and their pieces, returns and their pieces, the refused-parcel list); settings registry v57 (`packages/settings/src/registry-returns.ts`, group `orders`); permissions `returns.view`, `returns.decide`, `returns.qc`, `returns.waive`, `returns.claims.decide`. Every step is an order command (`returnCase` and the exchange / return events on the order's timeline), audited, version-checked (an older screen is refused with STALE). Nothing moves money: the refund due and the credit are only noted (S07, follow-up 440).
- **Exchange engine (185):** four tiers — the same piece in another size, the same colour, the same product, the same price band — and the first tier with stock is offered, each choice with its money box (difference, credit, the second delivery charge, what the rider takes at the door). The window counts from delivery (`orders.exchange.engine`). Approving books the linked exchange order with its stock held and opens the pick-up of the old piece. A wrong item restocks the piece that went out, never the ordered one (SIM-F-022).
- **Receive & QC (187):** `/admin/orders/returns/qc`, made for a phone — each piece scanned; sellable → the ERP `return.create` document, RESTOCKED only on the ERP's answer; not sellable → a loss with its reason (`orders.returns.lossReasons`; photo when `orders.returns.qc.photoForLoss`, off) in the loss book, never ERP stock; another SKU than expected only with a note (`acceptOtherSku`, on).
- **Size switcher (188):** another size of the same product and colour at the same price, stock-checked under checkout's row lock, until the courier has it.
- **Returns (189):** the courier's returned / partly delivered step opens the return of the pieces not kept (refused at the door, with the reason). A return after receipt only when the owner's policy allows it (`policy.returns.afterDelivery` off = no returns after receipt; `orders.returns.handling`: our-fault returns off, window empty); otherwise it is shown and refused. A return closes after QC, or with a note.
- **Who pays the second delivery (190, CN-018 (5)):** the customer for his own size choice (the exchange rule's band charge, else `fallbackMinor`, empty = nothing), never for our mistake; a waiver with a logged reason (`returns.waive`); his "your mistake" claim with a note and photo, decided by `returns.claims.decide`; the one-trip size swap (CN-014e, `orders.exchange.swap`, off); a re-ship after a try-on linked to the refused order, the old piece covering only what was paid, the refusal not counted (SIM-F-021).
- **Refused parcels (191):** `/admin/orders/returns/refused` — the parcels refused at the door with their reasons, the shop's own fault marked and never counted (SIM-F-044), the delivery charge paid at the door kept (`CHARGE_PAID_RETURN`). The refused-parcel list (`orders.refused.list`, off; proposed after 2 counted refusals): a person lists a number, dismisses it, or takes it off with a note; a try-on or a re-shipped refusal is not counted. Nothing blocks an order or turns COD off; PR 264 will read the listed numbers for the ad audiences.
- **Routes:** `/api/admin/returns` — the board, one exchange, choices, open, approve, refuse, complete, sizes, switch, waive, claim, claim decision; parcels (by status, kind or order), one parcel, receive, QC, close; an order's return choices and return; the refused list and its decision.
- **Settings (v57):** `orders.exchange.engine`, `orders.exchange.tiers`, `orders.exchange.charge` (customer pays his size choice, fallback empty, claim photo on, re-ship reason size-fit, re-ship free off), `orders.exchange.swap` (off, charge empty, areas empty), `orders.returns.qc`, `orders.returns.lossReasons`, `orders.returns.handling` (our-fault returns off, window empty), `orders.refused.list` (off, 2).
- **Tests:** on PostgreSQL — the four tiers and their money boxes, SIM-F-022 (the scanned piece restocks), SIM-F-021 (the try-on re-ship), the switcher under the row lock, the return policy, the waiver and the claim, the refused list from proposal to a person's decision; the admin API; every word in both languages. Guides: [returns](docs/admin-guide/pages/orders/returns.md), [Receive & QC](docs/admin-guide/pages/orders/returns-qc.md), [refused parcels](docs/admin-guide/pages/orders/returns-refused.md), [orders](docs/admin-guide/orders.md).

**Built (PR 612, 613, 614): returns and exchanges through the ERP** (CN-028, CN-029 Phase 1). They run only when a store's `erp.model` is `v6`; until the switch-over (PR 619) every store keeps the flow above. Migration `0054_returns_v6` (additive), settings registry v67 (`packages/settings/src/registry-returns-v6.ts`, group `orders`), the ERP calls in `@extas/inventory` (`erp-returns-v6.ts`), the services in `@extas/orders` (`handback.ts`, `legacy.ts`, `returns-erp.ts`, `exchange-v6.ts`).
- **Hand-back desk (612):** `/admin/orders/returns/handback` (`returns.handback`) — scan each consignment the courier hands back (a showroom return: courier `HAND`, by order number), count the pieces, a short condition note (a photo of the sealed bag with `returns.handback.photo`), close and send `POST /return-lists`. The ERP's answer per parcel is kept (return stock, hold, refused with its reason); a count that differs starts the courier claim at once; a refused parcel is fixed and sent on a new list; while the ERP is down the list waits and the job `orders.returns.erp` sends it again. The shop never decides whether a piece sells again.
- **The old paths as switches (612):** `returns.legacy.shopQc`, `.restock`, `.writeOff`, `.creditDue` — per store, on (= today) while v5; in v6 they never run, no return opens after delivery. PR 619 turns them off; nothing is deleted.
- **Returns section (613):** `/admin/orders/returns/erp` (`returns.view`, read-only) — seven tabs (Partial deliveries · Handed back · On hold in ERP · In ERP return stock, with the countdown to the owner's check `returns.erpCheck.days` 7 · Exchanges · Approved · Declined (our loss)); each parcel's timeline; losses by month (`returns.losses.months` 6) at the price paid to the ERP, plus billed exchanges, delivery charges of returned parcels and underpayments; courier claims; the compare with `GET /returns/summary` every night after `returns.compare.runAt` (01:15) and on demand, kept as append-only rows — a difference is fixed only by pulling again.
- **Exchange through the ERP (614):** approve only within `policy.exchange.windowHours` (72) of the courier's "delivered"; the old lines marked; a live ERP stock check with regular orders first (`exchange.erp.keepForOrders` 1) — short stock waits, the admin is told, the job retries with a new idempotency key; the new order `<old>-X<n>` names the old order and line; a dearer piece is paid by the customer when `exchange.passPriceRiseToCustomer` is on; no money goes back; the original sale stands. The case card shows the ERP box (state, deadline, value at risk, what the customer pays) and the **late-return mark** (`POST /api/admin/returns/exchanges/:id/late-return`, `exchange.approve` or `returns.handback`); the Exchanges tab lists the exchanges at risk from `GET /exchanges?status=pending` (the 4-day watch).
- **Safe to press twice (qa-gate):** a return list goes to the ERP once even when the desk, the close and the hourly job send it at the same moment; a second "Approve" or "Old piece came back late" returns the first answer. A refused exchange frees its line and can be approved again; an exchange that found the ERP unreachable is sent again by a person ("Send to the ERP again" on the case card). The exchange order's pickup, courier result and cancel reach the ERP like any order's (PR 610, 611).
- **Routes:** `/api/admin/returns/handback/*`, `/api/admin/returns/erp` (the tabs) and `erp/{timeline,losses,claims,compare,watch}`.
- **Tests:** on PostgreSQL with the practice ERP — the hand-back desk, the legacy switches, the Returns section (full flow, reversal, hold, losses, nightly compare and pull-again, ERP down) and the exchange (window, stock wait and new key, price rise on and off, refusals, cancel, deadline, late return, billed); every one with a store-isolation test. Page guides: [returns-handback](docs/admin-guide/pages/orders/returns-handback.md), [returns-erp](docs/admin-guide/pages/orders/returns-erp.md).

### S06 · Fraud & location — In progress

> **বাংলায় সংক্ষেপে:** ঠিকানা থেকে দোকান নিজে ডেলিভারি এলাকা আর চার্জ বের করে, আন্দাজে কখনো না; না বুঝলে কাস্টমারকে জিজ্ঞেস করে। অ্যাডমিনে "ডেলিভারি" পেজে তিনটা ব্যান্ড, আপনার সাব-এরিয়ার তালিকা, আর একটা ঠিকানা দিয়ে পরীক্ষা। চার্জ আপনি নিজে বসাবেন; শুরুতে সব বন্ধ।
> নতুন: চেকআউটে "রাইডারের জন্য আমার লোকেশন দিন" বাটন; IP, ডিভাইস কোড আর লোকেশন 180 দিন পরে নিজে থেকে মুছে যায়।
> নতুন: কাস্টমার নম্বর বদলালেও একটাই পরিচয়ে চেনা যায়; ডুপ্লিকেট আর আবার অর্ডারের আলাদা নিয়ম (A–E, H, I), প্রতিটার নিজের সুইচ; যাচাই কার্ডে এক ক্লিকে "কেন এই সতর্কতা"; সব নিয়মের সুইচ এক তালিকায়। নিয়ম শুধু প্রস্তাব করে, সিদ্ধান্ত আপনার; শুরুতে বন্ধ।
> নতুন: ঝুঁকির প্রতিটা ভাগে কী হবে (নজরে রাখা, হোল্ড, কল, আগে কত টাকা চাওয়ার প্রস্তাব) — শুরুতে বন্ধ; অর্ডার থেকে এক ক্লিকে "অগ্রিম চান": পে লিংক, SMS/WhatsApp আর কল একসাথে, টাকা এলে অর্ডার নিজে ফেরে। ডেলিভারি পাতা নতুন অ্যাডমিনে: প্রতিটা ব্যান্ডে ক্যাশ অন ডেলিভারির সীমা, সাব-এরিয়ার নিজের সুইচ, আর এলাকার নাম বদল, বানান, নতুন এলাকা, এক করা ও সরানো — কিছুই মোছে না।
> প্রতিটা অর্ডারের একটা ঝুঁকির স্কোর (০–১০০) — নম্বরের আগের অর্ডার আর ঠিকানা দেখে, আপনার ঠিক করা সংকেত আর নম্বরে। অর্ডারের পাতায় "ঝুঁকি" কার্ড বলে কেন এই স্কোর। শুধু জানায়, কিছু আটকায় না; আমাদের দোষে ফেরত গোনা হয় না। শুরুতে বন্ধ।

**Delivery-zone engine (PR 549–553, 555, `@extas/delivery`).**
- **Gazetteer (549):** division → district → upazila/thana → area with Bengali, English and Banglish names; importer and a shared index. A public **sample** list ships; the national list comes later.
- **Bands (550):** Dhaka City = the DNCC + DSCC map; the owner's sub-area list; one flat outside band. Bands ship **off with no charge** (owner data).
- **Resolver (551) and guard (553):** the whole line decides, after a pause or leaving the field; still ambiguous → "Where is this address?". A charge only ever comes from a resolved place; the collision suite fails the build.
- **Autocomplete (552):** `GET /api/delivery/suggest`, each row with its district and charge.
- **Phone-first (555):** `POST /api/delivery/phone-area` fills the area only, limited per IP; the full address needs a login or an SMS code.
- **Admin:** ~~`/admin/delivery`~~ `/admin/delivery/zones` (Delivery › Zones in the new admin shell; the old address redirects) — three bands (charge, hours, on/off), the sub-area list (add, remove, put back), Try an address. Permissions `delivery.read`, `delivery.charges`, `delivery.areas`. Guide: [docs/admin-guide/delivery.md](docs/admin-guide/delivery.md).
- **Zone, charge and area admin (502):** the page on the new admin shell (demo V12.3: the band cards in a row, then Areas and Try an address).
  - **Bands:** each card shows and edits the **COD limit** (`codLimitMinor`, empty = no limit, owner data). The sub-area band has **its own switch** (its `enabled`, off by default): while off, the list stays but its places go by the map and checkout never offers it; "same as Dhaka City / outside" needs no charge of its own.
  - **Areas:** open any place — rename (the old name kept as a spelling by default), alternate spellings (40 at most), move to another band or back to the map, merge a duplicate of the same level (archived, never deleted: its names become spellings, children and saved customer addresses move, past orders stay as they were), and **add a place** under a parent. Refusals `DUPLICATE_PLACE`, `LEVEL_MISMATCH`, `BAND_CONFLICT` (409). A later import keeps the owner's names and spellings and never brings a merged place back.
  - **API:** `POST /api/admin/delivery/places`, `GET/PATCH /api/admin/delivery/places/:id`, `POST /api/admin/delivery/places/:id/merge` (`delivery.areas`); every change in the audit log. No setting, no migration.
  - **Tests:** places on PostgreSQL (rename, spellings, add, merge with children and addresses, refusals, import after edits), the switch in the band map, the API, the form model; device gate 0 fails. Page guide: [docs/admin-guide/pages/delivery/zones.md](docs/admin-guide/pages/delivery/zones.md).
- **Settings:** registry v15, group `delivery` (suggestions, phone-first limits, resolver waits) — every number editable.
- **Tests:** gazetteer, bands, resolver, suggest, phone helper, collision suite; device gate 0 fails.
**Risk score (PR 157, 158, 156, 160, `@extas/orders`).** Off until the owner switches it on; it only informs — nothing is blocked, held, asked in advance or changed by it.
- **Phone history (157):** a number's other orders in any stored form (the one BD phone helper), each with what became of it — delivered, refused and why, cancelled and the code, open, with the courier, unanswered calls, returns after delivery. Refusals the shop caused (late, wrong item, damaged, after Eid, did not order) are shown and never counted (SIM-F-044). `GET /api/admin/orders/:id/phone-history` (`orders.read`).
- **Address and zone checks (158):** read from the place the checkout stored, never the text again — no place, place not sure, no house details, another district than the number is known by (saved address, else latest delivered order), one of the owner's places, refusals at the same place.
- **The model (156):** 14 signals, each with its own switch, weight (0–100) and limits, and three bands (low 0, medium 35, high 65); one pure scoring function; scored **once** when the order lands and stored append-only with every reason (RiskAssessment, `riskScore` / `riskBand`, a timeline and audit row through the order service's `riskAssess` command, the status untouched); scored again only after the team's edit or "score again", as a new dated line.
- **The panel (160):** a read-only **Risk** card on `/admin/orders/<id>` (demo V12.3) — the band and score, each signal with its +weight and what it saw, the history line, earlier scores, "the rules changed since", and **Score again** (`orders.risk.decide`). `GET /api/admin/orders/:id/risk` (`orders.risk.read`), `POST /api/admin/orders/:id/risk/assess`. Guide: [docs/admin-guide/orders.md](docs/admin-guide/orders.md).
- **Settings:** registry v43, group `orders` — `risk.history` (200 orders, the our-fault list, unanswered call outcomes), `risk.score` (off; after an edit on; card on), `risk.signals`, `risk.bands`; `orders.refusal.reasons` gains three reasons.
- **Tests:** the pure history, checks and model per signal; PostgreSQL history, address facts, scoring once, after an edit, SIM-F-044, the panel; the routes; the checkout end to end; the card's words in both languages.
**IP, device and GPS, with the 180-day rule (PR 159).** Registry v46 (`risk.capture`), no migration (the Order's `ip`, `deviceId`, `gpsLat`, `gpsLng`, `piiExpiresAt` are used).
- **What the checkout keeps:** the connection (IP), the shop's own random device id (an HttpOnly first-party cookie, never a fingerprint) and, only when the customer taps **"Share my location for the rider"** under the address (on by default, never on a gift, 44 px), the point rounded to 3 decimals — each by its own switch, with the day it is cleared.
- **Signals:** `deviceMatch` (the same device under another number, +20, 90 days) and `ipPhones` (3 other numbers from one connection in 24 h, +15), both off; they put an order in "new identity".
- **The 180-day rule:** the worker job `orders.pii.purge` (queue `privacy`, every 60 minutes) clears those four fields once the owner's days have passed; the order and its money stay.
- **Tests:** the capture on PostgreSQL (rounded, switched off, refused point), the API's device cookie, the signals on PostgreSQL, the purge (once, a shorter rule, through the catalogue and planner); the worker started once with the new queue.
**Order Identity Graph (PR 519).** Registry v48 (`risk.identity`, off), no migration (IdentityCluster / IdentityLink).
- **One identity per customer:** the phone (any stored form), the shop's own device id, and a name and an address alike (pg_trgm, PR 603: spelling a little off still matches), transitively; two identities that meet merge into the older (the newer is marked, never deleted); the IP is linked and counted, never joins two people.
- **When:** each order is linked when it lands (before the duplicate check) and again after the team edits its phone, name or address; the matched history is linked in the same step, so the graph fills the day it is switched on.
- **Read by:** the risk score's `identityMatch` and `deviceMatch` (SIM-F-015) and the duplicate rules ("the same customer"). Device and IP links are cleared with the order's kept facts (`orders.pii.purge`). Timeline line "the same person as 1001 (same phone)"; `GET /api/admin/orders/:id/identity` (`orders.risk.read`).
- **Settings:** window 365 days, name 0.7, address 0.6, the device joins, 200 orders per step.

**Duplicate & re-order rules (PR 520).** Registry v48 (`risk.duplicateRules`, master off), no migration.
- **Scenarios as separate rules:** A the same items again before the courier (cancel), B different items (warn), C a parcel of his with the courier (hold), D an alike address under a new phone (off), E the same style in another size (off), H a blocked number, account, identity or address (off; the block list is only read), I bulk-looking from 10 pieces (off). Each has its own switch, window in minutes, confidence and proposal: cancel · hold · warn · allow — **no block action**.
- **What happens:** cancel or hold opens the same review as PR 145 (confirm and booking wait for a person, who decides); warn and allow are a timeline note. Off: the PR 145 look-back exactly as before.

**Alert summary card (PR 521).** In each review card on `/admin/orders/<id>`, one click on "Why this alert, and the options": the rules that fired with how sure, the earlier orders that matched (how alike, which rule, how it is the same person), what the riders wrote on his parcels, his number's and identity's history, and the decisions open to this person with the proposed one first. `GET /api/admin/orders/reviews/:alertId` (`orders.risk.read`).

**Rule master switches (PR 544).** One list of every fraud and duplicate rule — the duplicate check, the rules master and A–I, two sizes, the identity, the score and each signal, the sections — with on, active (on and everything above on) and the default; defaults unchanged. `GET/PUT /api/admin/risk/rules` (`risk.rules.read` / `risk.rules.write`; versioned, all-or-nothing, the settings change log and an audit row). The Risk rules screen (ORD-06) comes with the new admin shell.
- **Tests:** the identity graph and the rules engine (pure and on PostgreSQL, each scenario, off = as before), the alert summary, the switches, the routes, the card's words in both languages; device gate 0 fails on the order page signed in. Guide: [docs/admin-guide/orders.md](docs/admin-guide/orders.md).
**Actions per risk level (PR 161).** Registry v54 (`risk.levels`, master **off**), no migration. Each band (low, medium, high) has its own steps — watch (a RISK_WATCH flag and chip), hold (reason `risk-check`, through the order service's own hold, so a held order is never confirmed or booked: SIM-F-014), a confirmation call task, and the ask to propose (none, delivery charge, a part with the owner's percent, the whole amount, no COD for this order) — all off; the suggested set is one tap, never the default. They run once per band after a stored score, with one timeline row; the ask is only a proposal a person sends (PR 542). Orders › Risk rules `/admin/orders/risk-rules` on the new shell with the Levels card; `GET/PUT /api/admin/risk/levels` (`risk.rules.read` / `risk.rules.write`, versioned). Never blocks anyone or changes COD, a price or a charge. Page guide: [docs/admin-guide/pages/orders/risk-rules.md](docs/admin-guide/pages/orders/risk-rules.md).

**One-click advance request (PR 542).** Registry v54 (`orders.advanceRequest`: auto **off**, SMS and call ticked first, bKash for the link), migration `0037` (Payment.linkToken; a part asked uses the PART_ADVANCE purpose from 0036), permission `orders.advance.request` (CN-018, SIM-F-016).
- **On the order:** "Request advance" asks the delivery charge, a part, the whole amount or no COD for this order; one command makes the order wait (AWAITING_ADVANCE), a pay link `/pay/<token>` (an earlier unpaid link replaced), the SMS / WhatsApp through the message engine (template `order.advanceRequest`, quiet hours) and a call task. "Send again" resends the same link. Paying brings the order back to "new · to confirm".
- **The customer's page:** `/pay/<token>` and `/bn/pay/<token>` — no login, noindex, the order number and amount only; `POST /api/pay/link`; the practice gateway until the owner's keys pass.
- **Advance request card** on Risk rules (`GET/PUT /api/admin/risk/advance`): the auto option, the ways ticked first, the payment service. No money moves by itself; no COD rule or price changes. Page guide: [docs/admin-guide/pages/orders/advance-request.md](docs/admin-guide/pages/orders/advance-request.md).
- **Tests:** the plan (pure), the request and the link on PostgreSQL, the payments hook, the routes, the card and dialog words in both languages; device gate 0 fails on the order page, Risk rules and `/pay`.

**Courier zone sync (PR 554, `@extas/shipping`).** Migration `0043_courier_zones_print` (additive), registry v56 (`delivery.courier.zoneSync`: on, every 7 days, 600 calls a run, areas, exact names, hold only when the courier needs ids).
- **Each courier's own list:** city → zone → area read in steps from where the last run stopped (Pathao; the practice courier; Steadfast reads the address and needs none), paired with the gazetteer by exact names inside the right district only; unclear names left for a person. A place the courier drops is archived with its pair, never deleted, and comes back when listed again. Staff pair or unpair by hand; a sync never touches a person's pair.
- **Booking:** a courier that needs its ids never gets a parcel to an unpaired area — `AREA_UNMAPPED`, one note on the order's timeline (SIM-F-017). Worker job `courier.zones`.
- **Admin:** Delivery → Couriers (`/admin/delivery/couriers`: accounts, practice or live, the area list summary, "Read the list now") and one courier's page (parcels waiting, not paired with candidates, paired, dropped). Guides: [couriers](docs/admin-guide/pages/delivery/couriers.md), [one courier](docs/admin-guide/pages/delivery/courier.md).
- Still planned in S06: the rest of the fraud engine (162–164, 522–524, 540, 543, 545), the rest (556–557, 559, 562, 567).

### S14 · CRM & customers — In progress (7/24)

> **বাংলায় সংক্ষেপে:** কাস্টমারের সেকশন তৈরি: সব কাস্টমারের তালিকা (ফোন দিয়ে প্রতিটা মানুষের এক সারি, ভাগ, খোঁজা), একজন
> কাস্টমারের নিজের পাতা (সব অর্ডার, বিক্রি শুধু ডেলিভারি হওয়া, বদল, সাপোর্ট) আর "যাচাই বাকি" — একই মানুষের দুইটা প্রোফাইল একজন
> মানুষ দেখে একসাথে করেন, কিছু মোছে না, আবার আলাদা করা যায়। পুরো নম্বর শুধু অনুমতিতে; কে পাতা খুলেছেন বা নম্বর কপি করেছেন, লগে থাকে।
> এছাড়া কাস্টমারকে SMS আর WhatsApp পাঠানোর ব্যবস্থা তৈরি। চাবি (key) না দেওয়া পর্যন্ত সব অনুশীলন মোডে, কোনো আসল নম্বরে
> কিছু যায় না। কেউ "বন্ধ" লিখলে তাকে আর মেসেজ যায় না, "চালু" লিখলে আবার যায়; সব হিসাব থাকে। মেসেজের লেখা এখন অ্যাডমিন থেকেই
> বদলানো যায়, বাংলা-ইংরেজি পাশাপাশি, নমুনা অর্ডারে সাথে সাথে দেখা যায়। কোন ঘটনায় কোন মেসেজ যায়, সেটাও এক পাতায়। নতুন সব সুবিধা বন্ধ অবস্থায় আসে।

**Built (PR 284, 285, 286): the customers section on the new admin shell.** New package `@extas/customers`; migration
`0047_customer_merge` (additive: `Customer.mergedIntoId` / `mergedAt`, `CustomerMerge`); settings registry v60
(`packages/settings/src/registry-customers.ts`); `@extas/metrics` `customerKpis`, `customerFiguresSql`, `customerOrdersSql`.
- **The person by phone (284):** a profile, its merged profiles and every number they ordered with are one person; any
  written form of a number finds him. Lifetime value from `@extas/metrics`: **Sales** = delivered orders only, beside
  **Ordered value** (CN-022); refusals never count the shop's own mistakes.
- **Merges (284):** the merge rules suggest "Same person?" pairs (same e-mail, a WhatsApp number that is the other's
  phone, the same name and address, the same identity on an order); a person decides — Merge (with an Idempotency-Key),
  Not the same person, or Split later with a note. A merge only points one profile at the other: nothing moves, nothing
  is deleted, every decision is audited.
- **Personal data:** every read checks `customers.read`; the full number needs `customers.phone` (otherwise masked,
  `customers.phoneMask`); opening a customer and every Copy or Call is written to "Who looked at this customer" first
  (shown with `audit.read`); `customers.merge` for decisions. No export anywhere here (PR 299 brings its own key).
- **Screens:** Customers → **All customers** (`/admin/customers`: four numbers, eight views with counts, search, source
  filter, sorts, a table on a desktop and cards on a phone), **one customer** (`/admin/customers/<id>`: Overview ·
  Orders · Exchanges · Support, consent, wallets, "Who looked", "Merge with…"), **To review** (`/admin/customers/review`).
  The command palette's customer results open the customer's page. Guides:
  [all customers](docs/admin-guide/pages/customers/all.md), [one customer](docs/admin-guide/pages/customers/customer.md),
  [to review](docs/admin-guide/pages/customers/review.md).
- **Settings (v60):** `customers.merge` {suggest on, four rules on, 20 a page, note off}; `customers.phoneMask`
  {first 3, last 3}; `customers.list` {50 a page, returning from 2 orders, at risk after 60 days, VIP figure empty};
  `customers.profile` {20 orders a page, 10 exchanges and support lines, 10 lines of "Who looked"}.
- **API:** `/api/admin/customers` — the list, `by-phone`, `<id>` (the single view), `<id>/orders`, `<id>/exchanges`,
  `<id>/support`, `<id>/looks`, `<id>/access`, `merge-suggestions`, `merge-preview`, `merges`, `merge`, `not-same`,
  `merges/<id>/undo`.
- **Tests:** merges, the single view, the list's views and the customer page on PostgreSQL; the API with the owner and
  a read-only reader (masked numbers, refusals); the settings; every word in both languages. Smoke and device gate open
  the list, To review and the first customer page.

**Built (PR 291, 292, 298, 505; migration `0048_message_channels`, additive; registry v61 `registry-message-channels.ts`).** Every channel stays on its mock until the owner types its key in Keys & connections; no test or CI run sends to a real number.
- **SMS (291):** the SMS contract and the BulkSMSBD gateway in `@extas/adapters` (one form POST per SMS, unicode for Bengali, its answer codes as words, the credit left for "Test"), its Keys & connections row (API key, sender id); the masking name only when it is approved and wanted; the parts of every SMS (GSM 160/153, unicode 70/67) and its cost (the provider's price, else the owner's part price) in the log.
- **WhatsApp (292, SIM-F-011):** Meta's Cloud API `whatsappCloud`; a live send the shop starts goes only as a Meta-approved template (else skipped with `WA_TEMPLATE_NOT_APPROVED` and the step's fallback channel); template list, sync and submit for approval; the signed webhook `GET|POST /api/whatsapp/webhook` (X-Hub-Signature-256) records receipts and the customer's 1 / 2 / 3 self-confirm answer by itself; the Caddy preview gate lets only that address through.
- **Consent (298):** the engine checks consent before every send (a stopped number is skipped as `OPTED_OUT`, an offer step needs a yes); every answer is an append-only ConsentRecord (every message / offers only); stop and start words by WhatsApp; the team records an answer at the customer's request (audited).
- **Templates (505, SIM-F-001, SIM-F-025, SIM-F-031):** every SMS, WhatsApp and e-mail template, English and Bengali side by side with a live preview on a cash, prepaid and part-paid sample order; where each is used; only known {tokens}; warnings for English words in Bengali, an amount to pay on a paid order and a link promise; Save over the version, Reset to default, a missing language added; an edited approved WhatsApp template goes back for approval; the auto-reply.
- **Admin pages (Messages section, demo V12.4):** Order journey `/admin/messages/journey`, Templates `/admin/messages/templates`, Message log `/admin/messages/log` (counts, filters, parts, cost, Try again), Channels & limits `/admin/messages/channels` (each channel's provider and mode, the credit, the last 7 days, caps, quiet hours, masking, part prices, the WhatsApp templates card) and Consent `/admin/messages/consent`. Bengali guides in `docs/admin-guide/pages/messages/`.
- **Admin API:** `/api/admin/messages/` — `channels`, `whatsapp/templates` (+ `sync`, `:id/submit`), `consent`, `consent/record`, `templates`, `templates/:id`, `templates/:id/reset`, `templates/auto-reply`. Permissions `messages.channels.read/write`, `messages.consent.view/write`, `messages.templates.read/write`.
- **Settings (v61):** `messages.sms.masking` and `messages.sms.rates` (owner data, empty); `messages.whatsapp` (language codes en / bn, category UTILITY, webhook 256 KB, reply window 168 hours); `messages.consent` (stop words STOP, UNSUBSCRIBE, বন্ধ; start words START, চালু; confirm reply off); `messages.autoReply` (off; once in 24 hours per number; always, or outside 10 to 22).
- **Tests:** PostgreSQL (the SIM-F-011 live path, webhook signatures, receipts and replies, consent on every channel, SIM-F-001 / 025 / 031, template save, version, re-approval, reset and the auto-reply), the pure rules, the SMS gateway against a stand-in fetch, the web API, the page drafts and words; smoke and device gate.
- Still planned in S14 (after launch): segments, the journey view and builder, e-mail, AI helpers, reviews, rewards, tags, export, win-back, birthdays and retention (287–290, 293–297, 299–303, 533–535).
Register: [S14](docs/MASTER-REGISTER.md#s14--crm--customers--pr-284303).

### S20 · Fulfilment & documents — In progress (1/9)

> **বাংলায় সংক্ষেপে:** প্রতিটা অর্ডারের ইনভয়েস নিজে থেকে তৈরি হয়ে থাকে — একটা অর্ডারে একটাই নম্বর; অর্ডার বদলালে একই নম্বরে "সংশোধিত"।
> অর্ডার → প্যাকিং আর প্রিন্ট → ইনভয়েস: সবগুলো একসাথে কাগজে বা থার্মাল রোলে, একটা অর্ডারের চ্যাটের ছবি (JPG)। ইনভয়েসে শুধু অর্ডারে যা আছে তাই।

**Built (PR 407): the customer invoice.** Migration `0050_invoice_support` (additive: `GeneratedDocument` number, fingerprint,
data, checked time); settings registry v63 (`packages/settings/src/registry-invoice.ts`, group `orders`); code in
`packages/orders/src/invoice.ts`, the PDF and picture in `packages/documents/src/invoice.ts`, the job in
`packages/jobs/src/invoices.ts`.
- **Issued and kept:** every placed order's invoice is issued once and kept (`GeneratedDocument`, kind `INVOICE`): one number per
  order for life (the `account.invoice` pattern), a new version with the same number ("Revised 2") only when the order's content
  changes — lines, money, names, address. Payments, confirms and status steps never make one. The worker job `invoices.issue`
  issues new and edited orders; an older order gets its invoice when it is opened or printed. The invoice only shows what the
  order holds: no price, discount or total is worked out again (CN-022).
- **Orders → Packing & print → Invoices** (`/admin/orders/packing/invoices`): counts, views (all, revised, waiting), search by order or
  invoice number; one PDF of many on paper (A4/A5) or the thermal roll (80/58 mm); per order paper, roll or the chat picture (JPG).
  The letterhead and column names on every page, a row never split over two pages, the courier's consignment barcode once booked.
  The customer's own invoice page shows the same number, "Revised n" and the barcode.
- **Settings (v63), as cards on the page:** `account.invoice` (PR 248); `documents.invoice.print` — A4, roll 80 mm, 203 dpi, English,
  barcode on, logo on, 100 per print (1–500); under More options `documents.invoice.image` — JPG, 1240 px (600–2400), quality 85
  (50–100) and `documents.invoice.issue` — on, every 10 minutes (1–1440), 200 a run (1–5000), 30 days back (1–3650). The shop's legal
  name, address and VAT/BIN come from the store profile settings and ship empty.
- **Permissions:** `fulfilment.read` to see, `orders.invoice` to print, new `orders.invoiceSettings` to change the cards.
- **API:** `GET /api/admin/invoices` (list), `POST /api/admin/invoices/file` (PDF or JPG), `GET/PUT /api/admin/invoices/settings`.
- **Tests:** issue, revise and keep on PostgreSQL; the PDF and the picture; the job; the settings. Guide:
  [Invoices](docs/admin-guide/pages/orders/invoices.md) and the [Orders guide](docs/admin-guide/orders.md).

Still planned in S20: register PRs 404–406, 408–412.

### S22 · Support (all-in-one) — In progress (1/13)

> **বাংলায় সংক্ষেপে:** সাপোর্ট ইনবক্স তৈরি: সব চ্যানেলের কথোপকথন এক তালিকায়, কে উত্তর দিয়েছেন নামসহ, টিমের ভেতরের নোট, ফাইল, দায়িত্ব আর
> "কে কী করেছে"-র লগ (কেউ মুছতে পারে না)। চ্যানেল (WhatsApp, Messenger, সাইটের চ্যাট) যুক্ত হবে PR 426-এ; ততদিন উত্তর রাখা হয়, "পাঠানো হয়নি" লেখা থাকে।

**Built (PR 425): the support core.** New package `@extas/support`; migration `0050_invoice_support` (additive; the
who-did-what log `ConversationEvent` is append-only at the database); settings registry v63
(`packages/settings/src/registry-support.ts`, group `support`).
- **Conversations:** one per person per channel, with a reference code; the customer's messages, the shop's replies and internal
  notes in one thread, oldest first. Every message keeps the sender's name as it was. A message that arrives twice is kept once; a
  solved conversation reopens when the customer writes; a contact whose phone matches a customer is linked to him.
- **Replies:** a press sent twice is one message (request key); a screen that missed a change is refused (`STALE`) and the words stay.
  Files (image, video, PDF) are checked by their contents, not their names, and kept in our storage. OPEN → WAITING after a reply
  (setting), back to OPEN when the customer writes, SOLVED by a person.
- **Channels plug in later (PR 426):** a channel kind (`whatsapp`, `messenger`, `livechat`, `instagram`, `email`) and an adapter
  (`SupportChannelAdapter.send`); a channel's webhook calls `receiveMessage`. None is connected yet, so a reply is kept as
  NOT_SENT with the reason `CHANNEL_NOT_CONNECTED`, never lost.
- **Pages:** Support → Inbox (`/admin/support`: views open, waiting, mine, not taken, solved, all, with counts; search; channel);
  one conversation (`/admin/support/c/[id]`: the thread, the reply / note box with files, status, take / let go / give, customer
  and order, the log; two tabs on the phone); Support settings (`/admin/support/settings`).
- **Settings (v63):** `support.inbox` — 50 a page (10–200), 2000 characters (100–4000), take it on reply off, waiting after a reply
  on; under More options `support.attachments` — on, 4 a message (1–10), 10 MB (1–50), image / video / PDF on. A customer's
  number is masked the shop's one way (`customers.phoneMask`, PR 284) and shown whole only with `customers.phone`.
- **Permissions:** `support.read`, `support.reply`, `support.assign`, `support.settings`.
- **API:** `/api/admin/support` — the inbox, `c/:id`, `c/:id/messages`, `c/:id/assign`, `c/:id/status`, `files`, `files/:id`,
  `staff`, `settings`.
- **Tests:** the package on PostgreSQL (receive, reply, note, files, assign, status, the log, settings); the API on PostgreSQL; the
  words in both languages; the sample seed's three sample conversations. Guides: [Inbox](docs/admin-guide/pages/support/inbox.md),
  [Conversation](docs/admin-guide/pages/support/conversation.md), [Support settings](docs/admin-guide/pages/support/settings.md),
  [Support](docs/admin-guide/support.md).

Still planned in S22: register PRs 426–436, 538.

### S11 · SEO engine — In progress (3/22)

> **বাংলায়:** দোকানের ঠিকানার নিয়ম, প্রতিটা পাতার সার্চের শিরোনাম আর বিবরণ, আর Google-এর জন্য পাতার তথ্য (দাম, স্টক, পথ, দোকানের পরিচয়) তৈরি। আপনি চালু না করা পর্যন্ত Google-এ দোকান আসে না, AI খসড়াও বন্ধ।

Built (PR [220](docs/stages/S11.md#pr-220), 221, 222; 29 Oct; not deployed yet):

- **Addresses and canonicals (PR 220):** English at `/`, Bengali at `/bn/` with the same slug. Every page names itself, in
  its own language, as its canonical on the shop's own origin (the store's primary domain, else `system.stagingHost`, else
  the request host). hreflang en/bn/x-default only where the Bengali twin passed the translation gate (PR 588). A page
  that says no (filtered list, preview, set builder, search) is `noindex,follow` without hreflang. Capitals in a public
  address 301 to lower case.
- **Search titles and descriptions (PR 221):** one template per page kind (`seo.titles`: home, category, combo, combo
  list, combos page, help, en and bn, each with its own tokens; the product templates stay in `naming.*`). The page's own
  text first, then an accepted AI draft, then the template (cut to `naming.seoTitleMaxChars` /
  `naming.metaDescriptionMaxChars`), then the page's own words. og:title, og:description and og:url (= canonical) too.
- **AI drafts (PR 221):** `seo.aiDrafts` (off; 20 per press; products and categories) works only while AI is on
  (CN-026), on the practice AI writer until the real one (PR 306). A draft waits for a person; accepted, it fills only
  empty fields. Audited (`seo.drafts.create`, `accept`, `discard`).
- **Structured data (PR 222):** Product, Offer / AggregateOffer and BreadcrumbList on product pages, BreadcrumbList and
  ItemList on category pages, Organization (only what the owner filled in) and WebSite on the home page, a set as a
  Product with one Offer at its set price, in stock only while every piece can be sold. The struck price only where the
  page shows it. Never a rating before real reviews (PR 223). `seo.structuredData` (all parts on).
- **Admin:** Website › SEO (`/admin/website/seo`): search engines, titles and descriptions with a live preview, data for
  search engines, AI drafts. Permissions `seo.read` (the check account has it) and `seo.manage`. API
  `/api/admin/seo` (GET/PUT) and `/api/admin/seo/drafts`. Guide: [`docs/admin-guide/seo.md`](docs/admin-guide/seo.md).
- **Settings:** registry v64 (`registry-seo.ts`: `seo.indexing`, `seo.titles`, `seo.aiDrafts`; `seo.structuredData`
  extended). Search engines off until go-live, so the preview always stays noindex.
- **Tests:** settings (registry), the URL and indexing rules, the title templates, the structured data, the practice
  AI writer, and DB tests for the SEO API and the AI drafts.

Planned — see register PRs 223–238, 527, 586, 588: [S11](docs/MASTER-REGISTER.md#s11--seo-engine--pr-220238).

### S12 · Content & blog — Not started

Planned — see register PRs 239–253, 528–530, 547, 591–593: [S12](docs/MASTER-REGISTER.md#s12--content--blog--pr-239253).

### S13 · Marketing & ads — Not started

Planned — see register PRs 254–283, 531–532, 548, 569, 589: [S13](docs/MASTER-REGISTER.md#s13--marketing--ads--pr-254283).

### S23 · Social & content studio — Not started

Planned — see register PRs 437–443: [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604).

### S15 · AI 360 Control Room — Not started

Planned — see register PRs 304–341, 506, 577–585: [S15](docs/MASTER-REGISTER.md#s15--ai-360-control-room--pr-304341).

### S16 · Finance, costs & reports — In progress (4/22)

Planned — see register PRs 342–355, 504, 536–537, 568 and, from CN-028, 615–618 (the ERP account ledger, the books match engine, the daily summary, fixed costs; design in [`docs/RETAIL-ERP-MODEL.md`](docs/RETAIL-ERP-MODEL.md)): [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604).

> **বাংলায়:** নতুন (PR 615): রিটেইল ERP-কে কত টাকা দেবে, তার নিজের খাতা — কোনো এন্ট্রি বদলায় না বা মোছে না, ERP-র হিসাবের
> সাথে এক টাকাও এদিক-ওদিক না; ERP-কে দেওয়া টাকা শুধু লিখে রাখা হয় (কোনো টাকা নড়ে না); পাইপলাইনে কত টাকার পিস, দোকানের নিজের রেকর্ড থেকে।

**Built (PR 615): Retail's ERP account ledger and the pipeline stock** (CN-028, CN-029 Phase 1; screen Money → Books →
ERP account, `/admin/money/books`; no migration, settings registry v68 `packages/settings/src/registry-books.ts`).
- **The ledger:** `ErpAccountEntry`, one entry per ERP event on the store's own link, append-only at the database and
  hash-chained (`verifyAccountChain` names the first changed entry): the bill when the parcel leaves (`ship:<consignment>`,
  once per order, at `erpTotal`; `recordBill` for PR 611, the account check books any billed order without one), return
  credits at the price paid, exchange extra / adjustment / bill / credit, payments, the switch transfer (`recordSwitchTransfer`
  for PR 619) and the opening balance (`importOpeningBalance`, once per link). A correction from the ERP is a REVERSAL entry plus
  the new effect (`<eventId>:new`), never an edit; an original already undone (`reversedBy`) is respected. The shop's balance
  (`balanceOn`, `ledgerBalance`) equals the ERP's with zero tolerance (tests on PostgreSQL).
- **The pipeline stock:** `ErpPipelinePiece` / `ErpPipelineMove` from the shop's own records — bill → courier result (PARTIAL:
  the ERP's identification, a correction moves it again) → hand-back → the ERP's check or the Hold resolution
  (WAITING_CHECK → DELIVERED when the customer kept it, PARCEL_MISSING → DECLINED). `pipelineOn(day)` reads any past day;
  `pipelineFlows` gives the books match (PR 616) goods and return losses.
- **Paid to ERP:** Accounts or the owner (`erp.payments.record`) record a payment already made — nothing is sent, no money
  moves; a wrong record is reversed by a new one; each is matched to the ERP's payment (amount, reference,
  `books.payments.matchDays` = 2). The form sends one `Idempotency-Key` per opening: a double tap or a retry is one record
  (`ErpPaymentRecord.requestKey`, unique per link; follow-up 551). The money box takes 1,000 / 1,00,000 and Bengali digits and
  refuses a third decimal (never cuts it off).
- **Account check (follow-up 490):** job `inventory.books.checkAccount` every `erp.account.checkMinutes` per v6 store: the
  shop's side, then `GET /account` for `books.account.lookbackDays` (7) — a payment whose webhook was lost is written from the
  statement, and the hold and the ERP's numbers go into `ErpAccountState` through PR 610's `noteHold` (one writer). ERP amounts
  are read exactly (`moneyMinor`: a third decimal or words are refused, never rounded or read as 0). In v5 nothing runs.
- **The store:** the page shows `?storeId=` (as the books API takes it), else the mother store; its key is checked there.
- **Tests:** `packages/inventory/test/erp-account.db.test.ts` (11, PostgreSQL), `packages/settings/test/registry-books.test.ts`.

> **বাংলায়:** নতুন (PR 616): প্রতি রাতে দোকানের খাতা ERP-র খাতার সাথে দিন ধরে মেলানো হয়, এক পয়সাও ছাড় নেই; গরমিল ঠিক হয়
> শুধু উল্টো এন্ট্রি আর নতুন এন্ট্রি দিয়ে, মালিকের PIN দিয়ে; সব দিন মিললে তবেই মাস বন্ধ, নাহলে মালিকের কারণসহ সিদ্ধান্তে।

**Built (PR 616): the books match engine** (CN-028, CN-029 Phase 1; screens Money → Books → Match `/admin/money/books/match`,
Differences `/admin/money/books/differences`, Closes `/admin/money/books/closes`; migration `0055_books_pin`, settings
registry v68 `registry-books.ts`).
- **Checks A–F** (`runBooksMatch`, `packages/inventory/src/books-match.ts`), per store link, zero tolerance: A every ERP statement
  row against the shop's entries by row group (credit, exchange, payment, other; the opening on the books' first day; each
  "paid to ERP" record against the ERP's payments), B the tie formula of §3.4 (`tieRemainder`), C returns handed back,
  approved and their credit, and what waits for the ERP's check, D the stored daily summary, E the month's fixed costs, F every
  billed order. A difference is kept once per (day, class, key) in `BooksDifference`; a missing ERP event waits
  `books.timing.maxMinutes` (PENDING) before it is a MISMATCH. A check v6 cannot make yet is PARTIAL.
- **Closes:** job `inventory.books.close` every `books.close.checkMinutes` (15) runs once a night after `books.close.runAt`
  (01:30) through yesterday, rechecking `books.recheck.days` (7) closed days. Each day writes an append-only, hash-chained
  `BooksDayClose` (a new version only when its figures change; ~~a matched day that moves raises HISTORY_CHANGED~~ a matched day
  whose OWN money moves — its ledger entries, the shop's corrections left out, or the ERP's rows — raises HISTORY_CHANGED in the
  same locked transaction as its close, and a later run that finds the day matched clears it); a run also goes back to the
  first day whose books moved since its close (a correction, a late entry, fixed costs or a summary entered later), however far
  back; one run at a time per link (`books.run.staleMinutes` 60; a manual run meanwhile answers BUSY). Check A also compares each
  day's closing balances, less what open differences explain (`A:closing`). Weeks and the lifetime check are built from the
  day closes (`BooksPeriodClose`). A month (`closeMonth`) closes with `books.close` and the
  owner's PIN only when every day matched (`books.close.requireMatched`) and its fixed costs are in, else only with the owner's
  override reason (kept on the close, the month's differences OVERRIDDEN); `reopenMonth` writes a new version; `signOffYear`
  once every month of the financial year is closed. Each of them locks the store's link first and decides from what it reads
  under that lock.
- **Putting a difference right** (`adjustDifference`, `books-adjust.ts`): `books.adjust`, the owner's PIN, a reason
  (`books.adjust.reasonMinLength` 10) and the ERP's matching row — a REVERSAL of the group's entries plus one ADJUSTMENT with
  the ERP's amount and a `BooksAdjustment` (PRIOR_PERIOD when the month is closed); one adjustment per ERP event and one per
  difference (two at the same moment: one books, the other is ALREADY); the ERP's row must belong to the difference (its rows,
  or an ERP event about the same order); nothing is edited or deleted (the database refuses it). Migration 0055 also keeps one
  BILL per order and link. ~~A row whose ERP event has not reached the shop's ledger yet (`detail.waitingEvents`, checked again
  under the lock) is not put right by hand: the pull books it under its own key and the next match settles it (spec §4.3;
  a hand correction would count it twice). A row with no event behind it (a charge the ERP typed) is put right as before.~~
  A credit, payment or exchange row the shop lacks (MISSING_EVENT) is never put right by hand, whether or not the ERP's
  statement row carries an eventId (optional in v6): the pull books it under its own key and the next match settles it
  (spec §4.3; a hand correction would count it twice). Where ids are sent, a row naming an event the ledger lacks
  (`detail.waitingEvents`, checked again under the lock) waits too. A charge the ERP typed (OTHER) and a bill the shop
  never booked are put right by hand. A shipment whose answer had no bill date (PR 611 keeps `billedAt` empty) is
  never booked on a guessed day: the ERP's bill row is a MISSING_EVENT marked `billedAtMissing` until the order check fills
  the date, or the correction books the BILL itself from the ERP's row (its own key, so it is never booked twice).
- **The owner's PIN** (`packages/auth/src/pin.ts`, migration `0055_books_pin`: four `StaffUser.booksPin*` columns): set by the
  owner with his password, kept only as a scrypt hash, never logged; digits only, `books.pin.minLength` (6), never one digit
  repeated or a straight run; `books.pin.maxAttempts` (5) wrong tries lock it for `books.pin.lockMinutes` (15). Each try takes
  its number in the database before the hash is checked, so a burst of tries at once cannot pass the lock; the last number
  writes the lock end with it, and a count left at its limit with no lock in force (a crash, a lower limit) starts again.
- **What others read** (`books-view.ts`, shapes kept stable for Hisabi 617/618): `booksStatus` (balance, the ERP's, open
  differences by class and check, days matched, partial checks, months closed, last run, chain), `explainDay` (a day opened to
  its row groups, entries, ERP rows, tie parts and versions), `booksDifferences`, `booksDaysForSummary`; the Needs-you-now row
  `booksDifferences` (MISMATCH rows).
- **Tests:** `packages/inventory/test/books-match.db.test.ts` (11, PostgreSQL: zero tolerance, fix only by reversal + new entry,
  month close only when matched or with the override, PIN hashing and lock, store A never reads or writes store B, v5 runs
  nothing), `packages/inventory/test/books-qa.db.test.ts` (12, PostgreSQL: the qa-gate's reproductions — late equal fixed costs,
  a back-dated correction, a burst of PIN tries, two corrections at once, a close beside a locked run, two runs at once, the
  closing balance, the payment request key, the prior-period fix), `packages/inventory/test/books-money.test.ts`,
  `apps/web/src/lib/admin-books/money.test.ts`, `packages/auth/test/pin.test.ts`, `packages/settings/test/registry-books.test.ts`.

> **বাংলায়:** নতুন (PR 617, 618): দোকান প্রতিদিন নিজের রেকর্ড থেকে দিনের হিসাব বানিয়ে ERP-তে পাঠায়, আর মালিক মাসের স্থির খরচ আর
> প্রতিদিনের খরচ লেখেন। টাকা › দৈনিক হিসাব পাতায় হিসাব মিলছে কি না, টাকা › খরচ পাতায় খরচ। কিছুই টাকা নড়ায় না।

**Built (PR 617, 618; CN-029 Phase 1, 30 Oct; not deployed yet).** Design: [`docs/RETAIL-ERP-MODEL.md`](docs/RETAIL-ERP-MODEL.md)
§3.3–§5, contract [`docs/erp/site-changes-v6.md`](docs/erp/site-changes-v6.md) §2.6, §2.11. Migration `0056_books_summary_minor`
(additive), settings registry v69 (`registry-books-summary.ts`).

- **Daily summary to the ERP (PR 617):** only for a store on contract v6 (`erp.model`) with its own ERP link; a v5 store
  builds and sends nothing. Each shop day is built from the shop's own records on the delivery-day basis, every line
  from its one source (`SUMMARY_LINE_SOURCES`): orders placed, delivered pieces at the customer price on the delivered day
  (`@extas/metrics` `retailDayFigures`), delivery charges, deliveries, customers; goods and return losses from the
  return-pipeline moves and the account's exchange entries; cost lines from cost entries (a reversed entry and its reversal
  are not a figure). A line with no figure yet goes in `incomplete`, never as 0. Whole taka on the wire; the exact lines in
  minor units are kept with each version (`ErpDailySummary.minorLines`), and PR 616's tie reads those (`tieLinesOf`), so a
  piece at 450.50 ties to the paisa. Every built day is an append-only version: sent at `erp.summary.sendAt`, tried again
  after `erp.summary.retry.minutes` (1, 5, 15, 60, then hourly) until accepted; a 4xx refusal is not tried again by itself
  (a new key round when the ERP asks for the day again); a late fact makes a new version within `books.resend.days` (never
  in a closed month, checked under the link's lock); `summary.missing` is answered at once; the hourly check
  (`erp.summary.checkMinutes`) compares the ERP's stored copy over `erp.summary.gapDays`. One send at a time per version (an
  advisory lock), so overlapping ticks never log two tries. Every send and reply is kept (`ErpBooksSend`). Jobs
  `inventory.books.summaryTick` and `inventory.books.summaryCheck`; guard path `books.send`.
- **Books status card (PR 617):** **Money → Daily summary** (`/admin/money/books/daily`, `books.read`): PR 616's
  `booksStatus` (the six checks A–F, days matched, what Retail owes the ERP on both sides, waiting for the owner's check,
  exchanges at risk, months closed, the closes chain), "not run yet" until the nightly match runs; a failure or another
  shape never takes the page down. Beside it "Needs you now" (refused, missing and incomplete days, a month without fixed
  costs, old unchecked returns, open differences, a broken tie) and the summaries sent with how each was taken.
- **Fixed costs and the extra cost lines (PR 618):** **Money → Costs** (`/admin/money/costs`; seeing `books.read`,
  writing `fixedcosts.write`). A month's salary, rent, utilities and other ship empty (owner data); each change is an
  append-only version (`ErpFixedCostMonth`), sent by `PUT /fixed-costs/{month}` from the same tick and checked against
  `GET /fixed-costs`; shown by day with the ERP's rule (`erp.fixedCosts.spread`: exact to the paisa, the remainder on the
  last day); never in a day's `costs.other`. Daily cost lines (packaging, accessories, payment and COD fees, courier, ads,
  other) for today or an open day, each with the form's request key (a double tap writes once); a wrong one is reversed by
  a negative entry with a reason; the day's summary is built again at once. Caps `books.costs.maxLineMinor` (৳10 crore)
  and `books.costs.maxMonthMinor` (৳40 crore) refuse a typing slip; a stored month that cannot be added up shows as
  unreadable. "More options": the lines this shop never has (`erp.summary.noCostLines`).
- **API:** `GET /api/admin/costs`, `PUT /api/admin/costs/fixed-costs`, `POST /api/admin/costs/cost-entries`,
  `POST /api/admin/costs/cost-entries/:id/reverse`, `PUT /api/admin/costs/no-cost-lines`.
- **Tests:** `packages/inventory/test/books-rules.test.ts`, `books.db.test.ts` (13, PostgreSQL: versions, retries,
  refusals, two ticks at once, `summary.missing`, the stored-copy check, the tie to the paisa, closed months, store A never
  touching store B, v5 untouched) and `books-costs.db.test.ts` (11), `packages/settings/test/registry-books-summary.test.ts`,
  `apps/web/src/lib/costs-api.test.ts`, `books-status-view.test.ts`, `messages-unique-keys.test.ts`.
- **Guides:** [Daily summary](docs/admin-guide/pages/money/books-daily.md), [Costs](docs/admin-guide/pages/money/costs.md).

### S21 · Site Health & Audit — In progress (0/14)

Started: `readme-guard` in CI (scope on PR 594, CN-011) fails a pull request whose README PR log, stage counts or
feature states disagree with the register. Every deploy copies README.md and docs/ to `$EXTAS_ROOT/docs/<commit>/`
(`infra/deploy/docs-sync.sh`, `current` link, newest `DOCS_KEEP_VERSIONS` kept), mounted read-only in the app as
`/docs/current` for the admin tabs still to be built. Planned — see register PRs 413–424, 570, 594 (594 = the PR register and "Blueprint & files" inside the admin;
423 = the Server page): [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604).

**Page guides (scope on PR 594, CN-026 cut by CN-027, 24 Oct):**

> **বাংলায়:** অ্যাডমিনের প্রতিটা তৈরি পাতার নিজের বাংলা গাইড এসেছে, ছয় ভাগে: এটা কী, কেন দরকার (একটা উদাহরণসহ), কীভাবে
> করবেন, প্রতিটা বোতামের মানে, সাধারণ ভুল, এরপর কী হয়। উপরের বারের ছোট **?** চাপলে যে পাতায় আছেন তার গাইড খোলে —
> কম্পিউটারে পাশে, ফোনে পুরো পর্দায়। লেখা বড় আর পরিষ্কার, টিপ / সাবধান / উদাহরণ রঙিন বাক্সে। গাইড ছাড়া নতুন পাতা এলে CI আটকায়।

| Part | What it does |
|---|---|
| page guides | `docs/admin-guide/pages/<section>/<page>.md`, one per built admin page (23), in six fixed parts with Tip / Careful / Example boxes (`> [!TIP]`, `> [!WARNING]`, `> [!NOTE]`); `pages/<section>/index.md` is the overview of each of the 14 sections |
| route table | [`apps/web/src/lib/admin-shell/help-pages.json`](apps/web/src/lib/admin-shell/help-pages.json): each built page's route and its guide; login, the 404 catch-all and the old delivery redirect are listed as not guided, with the reason |
| guide API | `GET /api/admin/guide?path=<admin address>` or `?page=<section>/<page>` (`<section>/index` = the overview only): the page guide, the section overview and the section's pages; the same session rule as the other shell routes; only `[a-z0-9-]` ids are read |
| guide icon | a small help icon in the top bar before the bell opens the current page's guide (`data-testid=a2-help`); the side panel on a computer (the page moves left at 1280 px and wider, not modal), the full-screen sheet on a phone; it follows the person to the next page; "এই সেকশনে কী করা যায়" opens the same guide, Help opens the section overviews |
| admin type | self-hosted Instrument Sans + Hind Siliguri for the admin (`apps/web/src/fonts/admin-ui.css`, display optional as in the shop, preloaded), 15.5 px guide text at 1.7 line height, numbered steps, aligned forms (inputs and buttons take the admin font) |
| CI check | `node tools/admin-guide-check.mjs` in the `checks` job: a built admin page with no row, a row with no guide, a guide not in the six parts, a section without its overview or an overview that does not list its pages fails the build |

Tests: `shell.test.ts` (route matching, the mode, boxes, comments, page links, every row's guide in the six parts),
`api.db.test.ts` (the guide API on PostgreSQL), `tools/admin-guide-check.test.mjs`. Smoke: the guide API and the top-bar
icon (`docs/qa/smoke.json`). No setting, no migration, no permission. After launch (CN-027, follow-ups 390–396): the "?"
hints, "Show me", the pop-up and own-page modes and the Admin look setting (CN-025), the live label check, the AI helper.
Guide index: [docs/admin-guide/README.md](docs/admin-guide/README.md).

### S24 · Virtual Photoshoot Studio — Not started

Planned — see register PRs 444–480, 539: [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604).

### S25 · Video & Campaign Creative Studio — Not started

Planned — see register PRs 481–490: [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604).

### S17 · Multi-store — Not started

Planned — see register PRs 356–377, 511–512: [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604) and
[A4](docs/BLUEPRINT.md#a4-multi-store--three-stores-one-server-one-codebase).

### S18 · Compliance, security, manual — In progress (1/14)

Planned — see register PRs 378–390: [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604).

**Built (PR 620, After launch): signed calls from the ERP to the shop** (CN-028, docs/erp/site-changes-v6.md §2.7; no
migration).

> নতুন (PR 620): ERP-তে "Top products" বা "Customers" চাপলে ERP তখনই দোকানের কাছে তালিকা চায়, দোকানের নিজের গোপন কোডে সই করা থাকলে তবেই উত্তর; দোকান নিজে কিছু পাঠায় না; চাবি ও সংযোগ পাতায় সুইচ (বন্ধ) আর ঠিকানা।

- **Routes:** `GET /erp-api/top-products?from&to&limit` (Sales by SKU, `@extas/metrics` `salesBySku`: pieces, net
  sales, profit over the cost snapshot) and `GET /erp-api/customers?page&pageSize&search` (`@extas/customers`
  `erpCustomerPage`: name, address, phone, total spent = Sales, last purchase, orders, first order). Live, never pushed.
- **Signing:** `X-Extas-Signature: sha256=<hex>` over `METHOD\nPATH?QUERY\nTIMESTAMP`, constant-time, refused beyond
  `erp.siteApi.maxAgeSeconds` (300). The store is the one whose own secret verifies (CN-029 §16): the ERP connection's
  new optional third key `signingSecret`, else its webhook secret; v6 stores only; a secret two stores share is refused.
  ~~Today the mother store's key and card (Keys & connections); each store's own with PR 619.~~ Since PR 619 each
  store's own key and card, on Settings → ERP link. The query is signed as sent, percent-encoded.
- **Screen:** the "The ERP asks the shop" card on ~~`/admin/integrations`~~ `/admin/settings/erp-link?storeId=` (moved by PR 619, follow-up 524) — the base URL for the ERP, the switch
  `erp.siteApi.enabled` (per store, off; `vault.write`), the latest verified calls and the refused calls summed. Guide:
  [`docs/admin-guide/integrations.md`](docs/admin-guide/integrations.md).
- **Settings** (registry v65): `erp.siteApi.enabled`, `.maxAgeSeconds` 300, `.topProductsLimit` 20,
  `.customersPageSize` 50, `.maxRows` 100, `.maxRangeDays` 366, `.callsShown` 20, `.refusedPerMinute` 60,
  `.refusedLogMinutes` 60, `.refusedShownDays` 7, `.searchMaxChars` 100.
- Every verified call is logged as a SecurityEvent `erp.site-call` (never a customer, number or search text). A refused
  call writes nothing of its own: refusals are counted and kept as one summary `erp.site-call.refused` per
  `.refusedLogMinutes`; a call refused from the request alone reads nothing at all; past `.refusedPerMinute` refused calls
  a minute, unverified calls get 429 without a store lookup. The preview gate lets only these two GET paths through,
  matched on the raw request target case for case (Caddy gate v5; CI runs the live gate checks on a pinned Caddy
  2.10.2). Tests: `packages/adapters/test/erp-site-calls.test.ts`,
  `packages/inventory/test/erp-site-calls.db.test.ts`, `apps/web/src/lib/erp-site-api.db.test.ts`.

### S19 · Deploy, backup, go-live — In progress (2/17)

Planned — see register PRs 391–403, 507, 587 (backup settings and monthly restore drills, WordPress migration on
go-live day): [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604).

**Built (PR 619): the switch-over to the ERP model and each store's own ERP link** (CN-028, CN-029 Phase 2; migration
`0057_erp_switchover`, additive; settings registry v70).

> নতুন (PR 619): প্রতিটা দোকানের নিজের ERP সংযোগের পাতা: নিজের চাবি, কী অপেক্ষায়, কত পাওনা; নতুন ERP চুক্তিতে যাওয়া আগে পরীক্ষা করে, শুধু মালিক PIN দিয়ে করেন।

- **Screen:** **Settings → ERP link** (`/admin/settings/erp-link?storeId=`, `vault.read` in that store; a store picker
  for the stores the person may open): the contract the store speaks, its open link (epoch, ERP company, switch date,
  opening balance), the store's own keys form, what was synced each way, the last summary the ERP accepted, the queues
  (orders waiting, held or failed; v5 orders kept at the switch; open exchanges; summaries waiting), the balance by both
  books, the books match state, the switch card, the "The ERP asks the shop" card (moved from Keys & connections) and
  the owner's "start a new link". Guide: [`docs/admin-guide/pages/settings/erp-link.md`](docs/admin-guide/pages/settings/erp-link.md).
- **Keys per store (CN-029):** the API key, webhook secret and signing secret go to the vault under the store id only,
  through Keys & connections' API with `?storeId=` (`apps/web/src/lib/integrations.ts`); a call with store A's key can
  never read or write store B (tests in `apps/web/src/lib/erp-link-admin.db.test.ts`). The per-store signing secret
  signs that store's v6 calls.
- **The switch-over** (`packages/inventory/src/erp-switchover.ts`): the switch date and the moved old orders from the
  ERP (`GET /switch-over`); a dry run first (`vault.write`; changes nothing but its report; counts for
  `erp.switchOver.dryRunMaxHours`, 24); then the owner alone with his books PIN and the switch date typed back: the
  opening balance, the one transfer and the moved orders booked once at the buying price, the OUT orders billed and in
  the pipeline, the month before backfilled from `GET /cost-of-goods`, customer payments, returns and ad spend never
  sent again, `erp.model` v5 → v6 with the owner's OK, the four `returns.legacy.*` switches OFF for that store (never
  deleted; the QC page says the ERP checks each piece now), a v5 order still waiting re-sent as v6 or kept for a person
  (`erp.switchOver.queuedV5Orders`), a wrong opening balance put right by a new link epoch, a handover revokes the
  store's three keys (kept, never deleted). No store is switched by the build.
- **API:** `GET/POST /api/admin/erp-link?storeId=` (`dryRun`, `switch`, `newLink`, `sendHeld`).
- **Settings** (v70): `erp.switchOver.dryRunMaxHours` 24, `erp.switchOver.queuedV5Orders` resend (per store),
  `erp.link.listShown` 20.
- Tests: `packages/inventory/test/erp-switchover.db.test.ts`, `packages/orders/src/erp-switch-resend.db.test.ts`,
  `apps/web/src/lib/erp-link-admin.db.test.ts`.

**Built (PR 621): the ERP v6 acceptance suite, a go-live gate** (CN-028; settings v70 `erp.acceptance.*`).

> নতুন (PR 621): ERP-এর সব নিয়ম আর খাতার মহড়া প্রতিটা রিলিজের আগে আর প্রতি রাতে পরীক্ষা হয়; ডেমো চাবি না থাকলে অপেক্ষা করে, কিছু আটকায় না।

- **The checks:** `runErpAcceptance` (`packages/adapters/src/erp/acceptance.ts`), 21 checks of
  `docs/erp/site-changes-v6.md` §4 (contract, catalogue, orders, deliveries, return lists, checks, Return stock,
  exchanges, summaries, fixed costs, account, the retired v5 calls, switch-over, cost of goods, signed site calls). On the
  practice ERP in CI with the ERP's own actions driven (`packages/adapters/test/erp-acceptance.test.ts`).
- **The books drills** on PostgreSQL (`packages/inventory/test/erp-acceptance-books.db.test.ts`): the switch day, the
  same webhook twice, a lost webhook, a reversal before its original, a wrong amount, hold → checkout pause → resume, a
  two-day outage, a closed day that moves, an exchange never returned, a month that must not close, the tie formula for
  every day, week, month, year and the whole life, store isolation; and the 72-hour exchange rule
  (`packages/orders/src/erp-acceptance-exchange.db.test.ts`).
- **Against the demo ERP:** every night (`.github/workflows/erp-acceptance.yml`) and before every release
  (`deploy.sh`, ~~before the migration~~ after the migration and before the new colour starts: a failed check stops the
  release before the switch) on the runner
  (`infra/deploy/erp-acceptance.sh`, `packages/jobs/src/erp-acceptance-cli.ts`). Read-only unless
  `erp.acceptance.demoWrites`; "waiting for the demo key" (nothing called, nothing failed) until the owner types it on the
  ERP link page's demo-key card (vault, installation-wide); an unreachable demo ERP or a refused key is reported, not
  failed; on the demo ERP a time-out, network error, 5xx, 429 or 404 in any check is SKIP (only a wrong figure or a
  broken answer fails), a run past the time limit is "not finished" and one that cannot read the database is "not run"
  (both reported, never a stop). Report: `docs/reports/erp-acceptance/latest/`.
- **Settings** (v70): `erp.acceptance.demoBaseUrl` https://demo.extasbd.com, `.timeoutSeconds` 20, `.demoWrites` off.

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
| #60 | PR [611](docs/stages/S08.md#pr-611), [615](docs/stages/S16.md#pr-615), [616](docs/stages/S16.md#pr-616), [617](docs/stages/S16.md#pr-617), [621](docs/stages/S19.md#pr-621), [620](docs/stages/S18.md#pr-620), [608](docs/stages/S09.md#pr-608) fixes | 31 Oct | CN-029 Phase 3, the books (three review rounds): payments pair even without the ERP's event ids; a caught-up payment keeps its sign and waits when a correction is on its way, never holding back an unrelated payment; an ERP correction after a shop correction is booked; extra decimals are refused; a month never closes on a stale day; a back-dated "paid to ERP" record is raised; an event group waits while an event is on its way; exchange corrections tie and count in the exchange cost; earlier-month corrections show as their own line; the 72 hours start at the courier's delivered time. Caddy: a changed Caddyfile really reloads, and the client address header is sent only when Caddy's live config trusts Cloudflare; a refused-call slot is given back when the lookup fails. |
| #59 | PR [607](docs/stages/S09.md#pr-607), [608](docs/stages/S09.md#pr-608), [610](docs/stages/S05.md#pr-610), [620](docs/stages/S18.md#pr-620) fixes | 30 Oct | CN-029 Phase 3, store isolation (two review rounds): one store's ERP can never write another store's stock even with a shared secret; the ERP webhook refuses unsigned or stale calls before any database or vault read, with one answer code and a capped body; refused calls are limited per caller address, which only Caddy sets (Cloudflare ranges), and the limit holds under parallel calls while a correctly signed ERP still gets through; a v6 event id comes only from the signed body; duplicates are per connection; a late account hold no longer pauses checkout; waiting follow-ups no longer stall a store's documents; refused webhooks show on the ERP link page. |
| #58 | PR [619](docs/stages/S19.md#pr-619), [621](docs/stages/S19.md#pr-621) | 30 Oct | Each store's own ERP link page (its own keys in the vault, what waits, what is owed) and the switch-over to the ERP model (owner only, with the books PIN, a fresh dry run and the ERP's date typed back; the old return paths become switches that are off, never deleted); the ERP v6 acceptance suite (books drills, the 72-hour exchange rule, store isolation) on the practice ERP in CI, nightly on the demo ERP, and in every deploy after the migration and before the new colour (a down demo ERP, no key or a database it cannot read is reported and never stops a release). |
| #57 | PR [609](docs/stages/S01.md#pr-609), [617](docs/stages/S16.md#pr-617), [618](docs/stages/S16.md#pr-618), [620](docs/stages/S18.md#pr-620) (+ PR [505](docs/stages/S14.md#pr-505) test fix) | 30 Oct | The daily summary and fixed costs for the ERP v6 (only for a store switched to v6): each shop day is summed from the shop's own records and sent to the ERP once, kept exactly to the paisa for the books match; Money → Costs takes the month's fixed costs (empty until the owner fills them, capped by settings) and extra cost lines, corrected only by a reversing line with a reason; a Books status card on the Daily summary page. Import from the ERP by style code (v6 stores only): a preview first, every SKU of a grade in one go or nothing, an existing product without a style code adopted, archived or switched-off variants left as they are; the buying price kept for the owner's eyes and an optional selling-price floor (off until the owner sets a margin). Signed calls from the ERP to the shop (top products, customers), off per store until switched on; unsigned or stale calls are refused before anything is read, and only these two exact paths pass the preview password. |
| #56 | PR [612](docs/stages/S08.md#pr-612), [613](docs/stages/S08.md#pr-613), [614](docs/stages/S08.md#pr-614), [615](docs/stages/S16.md#pr-615), [616](docs/stages/S16.md#pr-616) (+ PR [610](docs/stages/S05.md#pr-610), [611](docs/stages/S08.md#pr-611) fixes) | 30 Oct | Returns, exchanges and the books on the ERP v6 (only for a store switched to v6; today every store stays on v5): the courier's return lists go to the ERP from a hand-back desk, a new Returns section shows where every returned parcel is, and exchanges go through the ERP only within 72 hours of the courier's delivered (the old shop QC, restock and write-off paths stay on as switches until the switch-over). Retail's own ERP account ledger, append-only and matched against the ERP with zero tolerance; the nightly match (checks A–F), day, week and month closes, and fixing a difference only by a reversal plus a new entry with the owner's books PIN and a reason; "paid to ERP" only records a payment already made. No refund after delivery. The ERP's totals and shop prices are now read exactly, never rounded. |
| #55 | PR [610](docs/stages/S05.md#pr-610), [611](docs/stages/S08.md#pr-611) | 30 Oct | Orders to the ERP v6 (only for a store switched to v6; today every store stays on v5): one line per piece in whole taka, refusals held and asked again, checkout paused while the ERP account is on hold, short lines decided by a person; the shipment goes when the courier picks the parcel up, and every delivery result goes to the ERP once. |
| #54 | PR [407](docs/stages/S20.md#pr-407), [425](docs/stages/S22.md#pr-425) | 30 Oct | The customer invoice: issued once per order, kept, revised when the order is edited, printed on A4 or a roll or saved as a picture (the shop's legal name, address and BIN come from settings, empty until filled). The support core: one inbox of conversations with replies, internal notes, files, assignment and a who-did-what log; channels plug in later (PR [426](docs/stages/S22.md#pr-426)), so replies wait as "not sent" until one is connected. |
| #53 | PR [607](docs/stages/S09.md#pr-607), [608](docs/stages/S09.md#pr-608) | 30 Oct | ERP contract v6 behind `erp.model` (v5 until the switch), one ERP company per store with its own keys, the permanent event ledger, and the shared tables, settings and permissions for PR [609–618](docs/stages/README.md) (CN-029 Phase 0). |
| #52 | PR [220](docs/stages/S11.md#pr-220), [221](docs/stages/S11.md#pr-221), [222](docs/stages/S11.md#pr-222) | 30 Oct | The SEO engine's base: each page names its own address in its own language, search engines stay off until go-live (the preview is always hidden from them), search titles and descriptions from templates with AI drafts a person accepts (off until AI is on), and structured data for the shop, the website, products and sets. New admin page Website › SEO with its guide. |
| #51 | PR [182](docs/stages/S08.md#pr-182), [183](docs/stages/S08.md#pr-183), [284](docs/stages/S14.md#pr-284), [285](docs/stages/S14.md#pr-285), [286](docs/stages/S14.md#pr-286), [185](docs/stages/S08.md#pr-185) (follow-up [466](docs/stages/S24.md#pr-466)), [198](docs/stages/S09.md#pr-198), [291](docs/stages/S14.md#pr-291), [292](docs/stages/S14.md#pr-292), [298](docs/stages/S14.md#pr-298), [505](docs/stages/S14.md#pr-505) | 30 Oct | Orders → Packing & print → Pack: pick, check every piece, pack (photo and weight checks, off by default) and hand over; a damaged or missing piece opens a card and holds the order until a person decides. Customers: the list with its views and search, one customer's page (orders, Sales delivered only, exchanges, who looked), and To review for the same person's profiles. Messages: SMS (BulkSMSBD) and WhatsApp (Meta) on their mocks until the keys, consent and stop words checked before every send, the template editor with a live preview, the order journey, the message log and channels. The Orders tabs no longer squeeze on a phone. |
| direct | CN-029 (docs only) | 30 Oct | PR [607–621](docs/stages/README.md) will be built in one run with five builders in parallel (two new section agents, Pherot and Hisabi); each store has its own ERP keys; the old exchange and return code is reworked inside PR [610–614](docs/stages/README.md). Plan in `docs/RETAIL-ERP-MODEL.md` §15–16. |
| #50 | PR [4](docs/stages/S0A.md#pr-4) | 30 Oct | The nightly and after-deploy smoke test now also opens Orders → Returns and Refused parcels (the check account can see them, still read-only), so a broken returns page rolls the deploy back. |
| #49 | PR [573](docs/stages/S03.md#pr-573) (follow-up [358](docs/stages/S17.md#pr-358)), [184](docs/stages/S08.md#pr-184), [185](docs/stages/S08.md#pr-185), [187](docs/stages/S08.md#pr-187), [188](docs/stages/S08.md#pr-188), [189](docs/stages/S08.md#pr-189), [190](docs/stages/S08.md#pr-190), [191](docs/stages/S08.md#pr-191), [525](docs/stages/S08.md#pr-525), [526](docs/stages/S08.md#pr-526) | 25 Oct | The combo page paints faster (its own small stylesheet; Lighthouse 2.51 s → 2.23 s). The order now follows its parcel: the courier's news moves it on and shows on the order pages; a "Delivered" our own records contradict is held for a person; why a parcel came back is kept on its one return record; exchanges in four tiers with their money box, Receive & QC with ERP restock or write-off, the size switcher, returns only when the owner's policy allows, who pays the second delivery, and the refused-parcel list a person decides. |
| direct | CN-028 (docs only) | 25 Oct | Retail and the ERP supplier model filed: change note CN-028, PR [607–621](docs/stages/README.md) (Launch +14, After launch +1), `docs/RETAIL-ERP-MODEL.md`, the ERP's contract v5 and v6 kept in `docs/erp/`, 621 PRs in all. |
| #48 | PR [554](docs/stages/S06.md#pr-554), [179](docs/stages/S08.md#pr-179), [180](docs/stages/S08.md#pr-180), [181](docs/stages/S08.md#pr-181) | 25 Oct | Each courier's own area list is paired with ours, and a parcel never goes to an area the courier does not know; the courier sticker prints from the server with a barcode and the live COD (Bengali prints right on any printer); every print is kept, a reprint asks why; the rider signs a handover sheet per courier; the daily picking list puts every order's pieces on one sheet, category → style → colour → size. |
| #47 | PR [12](docs/stages/S00.md#pr-12) (updated, CN-025) | 24 Oct | The admin gets the V12.4 look: new colours and cards, a "To do" drawer, and the new Dashboard on real data (delivered sales chart, the ordered value on its own line, where orders are now, couriers, top products, low stock); Settings › Admin look picks a page's design for the team or just for you, and where the guide opens. One design per page for launch; more after launch. |
| #46 | PR [161](docs/stages/S06.md#pr-161), [542](docs/stages/S06.md#pr-542), [502](docs/stages/S06.md#pr-502), [171](docs/stages/S07.md#pr-171), [172](docs/stages/S07.md#pr-172), [173](docs/stages/S07.md#pr-173), [174](docs/stages/S07.md#pr-174) | 24 Oct | Each risk level (low, medium, high) gets its own steps — watch, hold, a confirmation call and a proposed advance — all off until the owner switches them on, on Orders › Risk rules. From any order the team can ask for an advance in one click: a pay link goes out by SMS, WhatsApp or a call, the order waits, and paying brings it back. The delivery zones page now edits each band's COD limit and every area: rename, extra spellings, move, add and merge (nothing is deleted). Payments get a wallet with an append-only ledger, refunds that always wait for the owner's approval before any payout, a capped advance on pre-orders, and a reconciliation report that matches each gateway statement line to a payment and gives every mismatch a reason. All off by default. |
| #45 | PR [602](docs/stages/S02.md#pr-602), [558](docs/stages/S04.md#pr-558), [560](docs/stages/S04.md#pr-560) | 24 Oct | Pages load from a four-layer cache (browser, Cloudflare when switched on, the server, Redis) and a price, stock or setting change clears the right pages at once; the bag, checkout and account are never kept. A new checkout-advance panel under Orders › Risk rules decides who pays ahead, and a flagged customer then pays the advance on the same checkout page instead of cash on delivery. All off by default. S04 is done (41/41). |
| #44 | PR [594](docs/stages/S21.md#pr-594) | 24 Oct | A Bengali guide for every built admin page (what it is, why, steps, every button and field, common mistakes, what happens next), opened from a small help icon in the top bar: a side panel on a computer that follows you page to page, a full-screen sheet on a phone; the admin gets its own self-hosted fonts and calmer type; CI fails when a built admin page has no guide (CN-026, cut to the launch scope by CN-027) |
| #43 | PR [104](docs/stages/S03.md#pr-104) | 24 Oct | Combo pages no longer keep a request open for a minute after they load (the page-opened count now reads its answer), so Lighthouse and the smoke test see the page settle at once; a test stops any page from leaving such a request open again |
| #42 | PR [519](docs/stages/S06.md#pr-519), [520](docs/stages/S06.md#pr-520), [521](docs/stages/S06.md#pr-521), [544](docs/stages/S06.md#pr-544), [175](docs/stages/S08.md#pr-175), [176](docs/stages/S08.md#pr-176), [177](docs/stages/S08.md#pr-177) | 24 Oct | One identity per customer from the phone, the device and an alike name and address, so a new number no longer hides the same person; the duplicate and re-order rules A–E, H, I, each with its own switch and a proposal a person decides (no block); "Why this alert, and the options" on the order page's review card; one list of every fraud and duplicate rule with its switch (admin API). All off by default. The courier framework with the practice courier (exception states with reasons, events stored once, the RTO cost book from real returned parcels only), Steadfast and Pathao behind it: staff book one, the ticked or all ready orders (never a cancelled, held, unconfirmed or in-review one), consignment ids, and the worker reads parcel updates; both stay on practice until the owner's keys pass the Test. |
| #41 | PR [572](docs/stages/S03.md#pr-572), [573](docs/stages/S03.md#pr-573), [574](docs/stages/S03.md#pr-574), [576](docs/stages/S03.md#pr-576), [165](docs/stages/S07.md#pr-165), [166](docs/stages/S07.md#pr-166), [167](docs/stages/S07.md#pr-167), [170](docs/stages/S07.md#pr-170), [125](docs/stages/S04.md#pr-125) | 24 Oct | Combo templates: each colour-pair rule gets its own list page (`/combos/<rule>`) in five layouts, the pair page and the set in the bag each get five more, and the current look stays the default until the owner picks another. A test tool plays every template at four screen sizes and scores it out of 100. S03 is done (22/22). Payments start (S07 4/10): every payment has one state and a money status, cash on delivery is settled after the door (a paid customer is never asked again), bKash sits behind one gateway contract on its practice mode until the owner adds the keys, and callbacks are signature-checked and counted once. | Merged |
| #40 | PR [541](docs/stages/S05.md#pr-541), [159](docs/stages/S06.md#pr-159) | 24 Oct | Every new order lands in one section with a note the moment it is placed (duplicate, re-order, new identity, high risk, watch, prepaid, clear); the strong sections wait for a person, and an order under review can never be booked. Prepaid orders get their own confirm view. The order list gets a risk column, filters and a "highest risk first" sort. Checkout keeps the IP, the shop's own random device id and a location the customer chooses to share, each by its own switch, and clears them after 180 days. S05 is complete. |
| #39 | PR [44](docs/stages/S02.md#pr-44), [546](docs/stages/S05.md#pr-546), [148](docs/stages/S05.md#pr-148) (follow-up [287](docs/stages/S14.md#pr-287)) | 24 Oct | The home page flash sale: two rows gliding opposite ways with a live countdown, drawn only while the owner has a sale set (empty and off by default; a sale never changes a price). The customer is told in plain words why an order was cancelled; a duplicate's notice names the order that goes ahead, with its tracking link. The "cancel request refused" notice is its own step. Both notices are off by default. |
| #38 | PR [157](docs/stages/S06.md#pr-157), [158](docs/stages/S06.md#pr-158), [156](docs/stages/S06.md#pr-156), [160](docs/stages/S06.md#pr-160) | 24 Oct | The risk score (off until the owner turns it on): each new order gets a score from 0 to 100 from the owner's signals and weights (the number's past orders and refusals, cancels, a very recent order, an unclear or mismatched address …), stored once with its reasons. The order's admin page shows a "Risk" card that says why. It only informs: nothing is blocked, and no price, charge or COD changes. |
| #37 | PR [150](docs/stages/S05.md#pr-150), [143](docs/stages/S05.md#pr-143) (follow-up [260](docs/stages/S13.md#pr-260)), [146](docs/stages/S05.md#pr-146) (follow-up [261](docs/stages/S13.md#pr-261)) | 24 Oct | "My orders" keeps every order, a page at a time, with All · On the way · Delivered · Cancelled & returned, and each order page has "What happened" with its steps and changes. When the owner turns them on, the order page also has the customer's own edit card (address, phone, a size) and the two-size question ("Keep both, or only M?"). |
| #37 | PR [148](docs/stages/S05.md#pr-148), [149](docs/stages/S05.md#pr-149), [151](docs/stages/S05.md#pr-151) | 24 Oct | The customer gets a message at each order step by SMS, WhatsApp or e-mail (which step uses which channel is a setting; the same message never goes twice; on the mock until the owner types a key in). Every try is logged and retried by itself, and staff can retry a failed one. Orders can be exported as a CSV file, with the customer's personal details only for staff allowed to see them. |
| #37 | PR [85](docs/stages/S02.md#pr-85) (fix) | 24 Oct | The device gate measures a shop page only after the shell's fits (footer columns, phone header) have run, so a busy runner no longer catches the footer links in the moment before they fit (main's run failed on it at 360 px). |
| #37 | PR [566](docs/stages/S04.md#pr-566), [606](docs/stages/S04.md#pr-606) | 24 Oct | The support card on an order's admin page explains, from the order's own records, why the customer was asked for an advance and why the delivery charge is what it is, with ready "what to say" lines in both languages (read only). The bulk / corporate lane: `/bulk-order`, a phone-menu row and a bag card send an enquiry (BQ-1001 …) for the team to call back, never a price; off until the owner turns it on. |
| #36 | PR [142](docs/stages/S05.md#pr-142), [143](docs/stages/S05.md#pr-143), [146](docs/stages/S05.md#pr-146) | 24 Oct | Order edits through the one order service: the team changes contact, address, a size at the same price or takes a piece out (reason, where the customer asked, timeline and audit log; refused once a courier is booked; a paid order's overpaid part only becomes a refund request), the customer edits his own phone, address or size until processing (off by default, capped), and the two-size follow-up asks "both, or only M?" after placing (off by default). Settings registry v37, permission `orders.edit`, no migration |
| #36 | PR [98](docs/stages/S03.md#pr-98), [100](docs/stages/S03.md#pr-100) | 24 Oct | "Build your own set" (demo V12.2 `41-set.js`): `/combos/build-your-own` and one page per set group, made from the owner's Smart Rules set tier rules; tier cards, slots, style cards with colours and sizes, the summary beside on a computer and a bar at the bottom of a phone; "Add set to Bag" puts the picks in the bag, where the same tier price applies by itself. Off by default (`combos.builder`, registry v36, migration `0022_set_builder`); admin API `GET/POST /api/admin/combos/builder`; the admin screen is follow-up 240 |
| #35 | PR [17](docs/stages/S00.md#pr-17) (CN-023) | 24 Oct | CI in parallel jobs on one build (owner, CN-023; every gate and budget as strict as before): the images are built once, then lint and type-check, unit tests, the sign-in e2e, the device gate (4 shards) and one Lighthouse run on the sample data (in shards) run side by side; a pull request checks the core pages plus the pages it touches, a push to main and the nightly run check every page and still block the deploy; pnpm, Next.js and Playwright caches. Before about 115 minutes per run, after about 14 minutes. |
| #35 | PR [59](docs/stages/S02.md#pr-59), [65](docs/stages/S02.md#pr-65) | 24 Oct | Find My Size learns from real "how did it fit" answers per garment type (off by default, the chart until enough answers; admin API and permission `catalogue.sizeAdvice`). Product reviews on the product page: up to three, photo reviews first, sliding with pause and resume; a customer reviews a delivered order, staff approve or hide it through the admin API, and only approved reviews show (SIM-F-008). The photo-review reward is off with no amount; once the owner turns it on, staff approval pays it once into the wallet. Migration `0021_reviews`. |
| #35 | PR [140](docs/stages/S05.md#pr-140), [141](docs/stages/S05.md#pr-141), [154](docs/stages/S05.md#pr-154), [152](docs/stages/S05.md#pr-152), [12](docs/stages/S00.md#pr-12), [136](docs/stages/S04.md#pr-136) | 24 Oct | The admin order screens on the new shell (demo V12.3 `#/admin/orders`; no new setting, migration or permission). All orders: views with counts (to confirm, on hold, cancel requests, duplicate review …), search by number, phone (any way it is written, Bengali digits too), name or tracking code, filters, four separate status chips; a table on a computer and cards on a phone. One order's page: products, the customer and his earlier orders, the timeline and notes, and only the buttons the order allows now and the person may press, each with a "what will happen" box; a change made meanwhile reloads and says so. To confirm: the call queue. Bulk confirm, hold and release with the skipped ones and why. The Orders badge and order rows in "Needs you now"; "Get invoice" for staff (follow-ups 200, 180). |
| #35 | PR [563](docs/stages/S04.md#pr-563), [565](docs/stages/S04.md#pr-565), [561](docs/stages/S04.md#pr-561), [127](docs/stages/S04.md#pr-127), [128](docs/stages/S04.md#pr-128), [605](docs/stages/S04.md#pr-605) | 24 Oct | The rest of the customer checkout (S04, settings v34, migration `0020_gift_mode`, permission `orders.lines`; every new feature off by default). No order is held over an address: it is placed and the team calls once (landmark-only lines get one address check). Free delivery never asks for a delivery band. A known number can skip the address line (off). "Add to this parcel" lets a customer add a piece to his COD order before it is confirmed (off). "Complete your look" on the thank-you page offers only pieces a running combo pairs with the order (off). Gift mode sends the order to someone else with a note, a deliver-after date and the prices hidden (off). |
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
| CN-023 | 24 Oct | CI under 25 minutes with every gate as strict: one Lighthouse run (core set plus touched pages on a pull request, every page on `main`, nightly and by hand), one build reused by parallel jobs, pnpm / Next.js / Playwright caches | [register](docs/MASTER-REGISTER.md#build-status) |
| CN-028 | 25 Oct | Retail becomes a separate buyer of the ERP (contract v6): the ERP bills at shipment, returns go back as return lists, exchange within 72 hours through the ERP, no refunds after delivery; the shop keeps its own books and both sides must match every day, week, month, year and for life; 15 new PRs (607–621), 621 PRs in all | [register](docs/MASTER-REGISTER.md#build-status) · [model](docs/RETAIL-ERP-MODEL.md) |
| CN-029 | 30 Oct | PR 607–621 in one run with five builders in parallel; two new section agents; one ERP link and its own keys per store; old exchange and return code reworked inside the same run | [register](docs/MASTER-REGISTER.md#build-status) · [plan](docs/RETAIL-ERP-MODEL.md) |

---

## Docs map

> **বাংলায় সংক্ষেপে:** কোন কাগজ কোথায় আছে। পুরো তালিকা [`docs/README.md`](docs/README.md)-এ।

| What | Where |
|---|---|
| Full specification (V2.1 final + change notes) | [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md) — older versions in [`docs/history/`](docs/history) |
| All 621 PRs, build status, stage table | [`docs/MASTER-REGISTER.md`](docs/MASTER-REGISTER.md) |
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
