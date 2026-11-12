# BUILD PROMPT — make the owner-approved admin prototype v5 the real admin (one command, run to the end)

Owner decision of 13 Nov 2026. The owner types this once. **Do not ask him for another prompt, and do not stop between
steps**, until every phase below is done and live on new.extas.com.bd, or a real stop listed in "Real stops" happens.
Everything else (CLAUDE.md, CN-006 "run without stopping", CN-031 "never idle", self-merge) stays in force. This file
replaces CN-037's "automation is off": **switch the 30-minute check-ins, usage-limit auto-continue and the never-idle
rule back on** (CN-037 Step 6) and write that in PROGRESS.md.

## 0. Talk to the owner like this
Mehadi Hasan is not technical. Reports to him: simple everyday Bengali (চলিত), Western digits, short, no jargon.
Admin screen text stays English (EN / বাং toggle). He does not review or merge PRs. Never ask him for policy numbers
(amounts, %, limits, perks): build them as backend settings, off by default. Never bring law / legal / compliance into
screens or talk. Do not add options he did not ask for; if the blueprint already has it, keep it as the blueprint has it.
Ask only about money, prices, discounts, COD, blocking people, deleting data, or anything irreversible (BLOCKED.md,
Bengali question) and keep working on other things.

## 1. Read first (in this order, only what you need, then work)
1. `CLAUDE.md`, `docs/START-HERE.md`, `PROGRESS.md` (last rows), `BLOCKED.md`.
2. `docs/demo/admin-proto-v5/README.md`, **`DECISIONS.md` (the spec: read it fully, later rounds win)**, `CONTRACT.md`,
   `courier-research.md`, then the prototype code itself (`index.html`, `js/*.js`, `css/app.css`) for exact screens,
   fields, sample data and wording. The prototype is the **UI truth for the whole admin** (storefront truth stays V12.2).
3. The blueprint sections a screen touches (B1.3/B1.4 courier booking and stickers, B1.12 duplicate orders, B1.15,
   C4.4 video, C6.3–C6.5 incomplete orders, the image pipeline), `docs/BACKEND-ARCHITECTURE.md`, `docs/ADMIN-ARCHITECTURE.md`.
Where the prototype and an older doc disagree, the prototype + `DECISIONS.md` win; record it in a CN note.

## 2. State you start from (check, do not assume)
- CN-047 (13 Nov): **S15 (AI Center / AI 360), S24 (virtual photoshoot) and S25 (social studio / video campaign) stay
  exactly as built; no new PRs for them; their open PRs were merged.** Do not touch their remaining rows in this run.
  S17 stays closed. Half-built parts stay hidden by the PR 652 switch; every new switch ships OFF.
- If any of the PRs #148–#195 are still open, or main's CI is not green, first finish that (a merge lane and a CI fix
  were already running; do not redo their work, read their reports/PROGRESS). Cap this at 60 minutes, then go on.
- CN-046 (admin design freeze) is **lifted by the owner's approval of this prototype**: register CN-048 saying so.
  Rows marked "Waiting — admin prototype (CN-046)" become buildable and are rebuilt to the prototype.

## 3. Phase A — register first (CLAUDE.md hard rule 8), one agent, no code yet
**Owner rule (13 Nov, 04:16): check the blueprint AND the code before anything is called new. Never rebuild what
already exists.** For every prototype item: (1) find it in `docs/BLUEPRINT.md`, `docs/MASTER-REGISTER.md` and the real
code/routes (`apps/`, `packages/`; grep the route, the label, the table); (2) built and working = mark "built", build
nothing (at most a small wording/layout/nav follow-up on that same PR); (3) built but differs = a small delta
follow-up on that PR, not a new feature; (4) only what exists nowhere gets a new PR number. Backend that is already
built (courier booking and stickers, duplicate/merge rules, incomplete-order capture, coupons, claims, size charts,
video, exchanges, Customer 360, refunds and wallet, Calls to make, Delivery & RTO, Rider issues, Pop-ups/notices
engine) is re-used: the work is mostly re-arranging screens to the prototype's menu and wiring them together.
Prefer one new stage "S28 — Admin v5 (prototype alignment)" so the owner can count it; do not reopen closed stages.
When GAP-MAP.md is done, send the owner one short Bengali message with the exact numbers (how many already built,
how many deltas, how many new PRs, how many stages added, expected number of batches), then carry on.
Create `docs/demo/admin-proto-v5/GAP-MAP.md`: every prototype section/tab/screen (read `A.NAV` in `js/core.js`) →
(a) already built and matches, (b) built but must change (list the changes), (c) new. For (b) and (c): a dated
update on the existing register PR, or the next free PR number (the register's highest is 658 at the time of writing,
check) plus **CN-048** (adopt prototype v5, lift CN-046) and further CN notes as needed (CN-049…). Counted in stages and PRs.
Add the rows to `docs/MASTER-REGISTER.md` / `docs/stages/*`, run `tools/docs/precommit-docs.sh`, add Bengali one-liners
to `docs/stages/bn.json`, `pnpm docs:stages`, update README status. Merge this docs PR yourself. Also record the
reconciliation of the 624 existing admin PRs: **nothing already built is deleted** ("Nothing is deleted": a screen the
prototype drops becomes a switch / moves under "More options", old text struck through).

## 4. Phase B — build in waves; 3 builders in parallel + `qa-gate`, each on its own git worktree (CN-031)
Shared files (Prisma schema, tokens, routing/nav) have one owner at a time (A1.4). Each PR: tests beside the code,
admin guide page updated (CN-014/026: every page has its guide, every label explained), Bengali strings, README
status, `PROGRESS.md`; phone UI matches the prototype; gates: typecheck, lint, tests, build, Lighthouse budget,
device gate (390/768/1366/1920, light/dark, en/bn) 0 fails, journeys, then deploy + smoke. **Right the first time:
one build + one check, no rework rounds.** Every integration runs on a **mock** until its key arrives; keys only in
the vault, never in Git or chat. Nothing hardcoded; every number/policy is a backend setting.

**Wave 1 — shell and orders (biggest value, do first)**
- Left menu exactly as `A.NAV`: Home (design A), Orders, Couriers, Products, Customers, Inbox, Rules, Marketing,
  Website, Finance, Reports, AI Center, Settings, the Admin map (opens as an in-page window in the prototype and in
  a **new window** in the real site), menu collapse behaviour, EN/বাং toggle.
- Orders: tabs Batch, All orders, Processing, To ship, With courier, Returns & exchanges, Incomplete orders.
  Statuses: New → (auto, only to Confirmed) Confirmed | Processing → Booked → Packed (= sticker printed) → Handed over
  → Delivered → Paid; plus Returned / Cancelled. "To confirm" is gone. Booking = courier API in one click (default
  courier, optional other; one order = one booking). Sticker printed once; a second print needs PIN + reason; print
  log. Batch has no clock time. Advance asked by SMS+WhatsApp ("Advance asked" tag, "Advance received" → Confirmed).
  Merge needed rows: merge button with editable merge (remove/change/add/cancel one, Merge + call) per B1.12;
  price adjust on every order (৳, %, wallet, free delivery; reason; per-role limits from Rules); courier live status
  and tracking history side panel; date filters Today, Yesterday, 7 days, This month, Last month, Custom on All orders /
  Returns / Cancelled / Incomplete. Returns/exchange per blueprint + owner rules (no cash refund after delivery,
  exchange within 72h with lower price to wallet, defective/wrong item → replacement, ERP returns check 7 days, old
  piece back within 4 days). Incomplete orders per C6.3–C6.5: **visible-field autofill capture after the first
  interaction, no notice; hidden/off-screen field harvesting is NOT built** (the owner accepted this); visitors who
  touch nothing are only counted and feed ad audiences/retargeting; known customers' stored details attach through
  their own browser id/login; IP match is only "Possible match"; newest first per day; Customer 360, Call, Confirm as
  order, SMS/WhatsApp templates; leave Open automatically when they order later; journey report.
  Stock hold (checkout minutes + N hours after order, setting, default 12h); courier score out of 10.

**Wave 2 — Couriers**
- New section Couriers: Overview, Courier 360, Claims & payouts, Setup. Courier 360 also stays in Finance (tab
  Couriers), Reports (tab Couriers) and Orders. Courier 360 sections: Overview, Parcels, Money, Payouts,
  Performance, Claims, Messages, Setup. **No "Ask for payment"**: money is requested through each courier's own
  payout/payment-request feature; its status (Requested → Processing → Paid / Rejected) returns automatically and shows
  in Courier 360; Paid marks the orders settled. One claims ledger. Courier messages editable in Rules. Backup courier
  fallback. Use `courier-research.md`; adapters behind a mock until the owner types the keys (Pathao, Steadfast, RedX
  and the ones the repo already has).

**Wave 3 — Rules and Offers**
- Rules: one page, right-side editor; Pop-ups & notices hub (12 items in 4 groups, where each shows); order-flow rules
  (auto-confirm, merge, duplicate window default 5 days, price-adjust limits per role); courier messages.
- Offers & Discounts 360: wizard; includes the online-payment reward as an offer (free delivery / 5% / 10% / flat ৳ /
  points / wallet credit); coupons, sales, points, wallet credit in one place; costs and results per offer.

**Wave 4 — Products, Finance, Reports**
- Products: 8-step Add product wizard; only the Photos & video step changed this round: easy adding, auto-optimise
  photos (image pipeline: 5 sizes × AVIF/WebP/JPEG, 4:5, quality 78) and videos, an AI-free quality indicator rule
  set (S15 stays stopped: use plain checks, no AI calls), video upload or YouTube/Vimeo/Facebook link shown as a clean
  embed, SEO always on. Combos/Sets tabs, Size charts, **demo products** (master switch + per-category switches,
  pop-up on Add to bag, excluded from Google/feeds/ads/stock/reports/finance/ERP).
- Finance: 7 tabs (VAT hidden), profit snapshot (Today / This week / This month) on Finance Overview and Home,
  P&L periods, courier tab, ERP tab; Reports library/packs incl. Courier report and Checkout journey.

**Wave 5 — the rest**
- Customers, Inbox (call desk, live-selling comments, Telegram approvals), Marketing 7 tabs (Studio stays in
  Marketing, shows only what S24/S25 already built), Website (policies, blog, analytics, shop text), AI Center as its
  own menu (shows only what S15 built; no new AI work), Settings = Business + owner-only System, one-time
  **"Start fresh"** (must also clear the ERP-side test entries, never real data), Eid mode, bulk/corporate orders,
  staff limits, influencers, the approved audit suggestions listed in `DECISIONS.md`.

If a wave item already exists and matches, only verify and mark it built; do not rebuild it. If something in
`DECISIONS.md` conflicts with a hard rule in CLAUDE.md (money moves, deleting data, blocking people, prices, COD,
discounts), keep it behind the owner's written OK and put the question in BLOCKED.md.

## 5. Phase C — close
After the last wave: full check set on new.extas.com.bd (smoke, device gate, journeys, the 70-order simulation,
acceptance, go-live check), fix what fails, update `docs/admin-guide/` and the Site manual, README dashboard, a Bengali
report in `docs/reports/YYYY-MM-DD-admin-v5.md` and in chat: what is live, what passed, what waits for the owner.
Then stop and wait: the owner resumes S25, then S15, then S24 (remaining rows) with a new word from him.

## 6. Real stops (only these)
Money / price / COD / discount / blocking / deleting data / irreversible items (write to BLOCKED.md, continue
elsewhere); the main-domain go-live switch (BLOCKED 25, only on his word "go live"); a usage limit (write the exact
point in PROGRESS.md and schedule your own continuation); CI or deploy broken (fix first, never leave the preview
down; a failed deploy rolls back and the fix comes before any new PR).

## 7. Report
Every merged PR: README + PROGRESS update. After each wave a short Bengali report in chat (then carry on). The owner
checks only by opening new.extas.com.bd; make that the truth, including a before/after note for each admin section.
