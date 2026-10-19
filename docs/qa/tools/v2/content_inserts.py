# -*- coding: utf-8 -*-
# V2 blocks inserted directly under V1 headings (AFTER), or before a heading (BEFORE).
# In-place tags: (unique old substring, new substring).

def q(text):
    """Render a V2 block as a blockquote."""
    lines = text.strip('\n').split('\n')
    return '\n'.join('> ' + l if l.strip() else '>' for l in lines) + '\n'

AFTER = {}
BEFORE = {}

# ---------------------------------------------------------------- PART A
AFTER['# Part A · Platform, server and architecture'] = q('''**V2 · 19 Oct — what changed in Part A.** A1.1 rule 2 is replaced (permissions in two steps, Note 45.3).
A1.2 is narrowed to IP + SSH key + GitHub. A1.4's three build lanes are replaced by the seven fixed agents (C10).
A2.1–A2.4 describe the old Azure VM and are replaced by the new VPS (Note 45, PR 1–3). A3 gains the optional-ERP
seam (PR 497–499). A6's single-file rule is replaced by versioned files (PR 594). New **A7** carries the settings
framework (PR 491–496, 500, 508–510).''')

AFTER['### A1.1 The rules — Locked'] = q('''**V2 · 19 Oct 22:44 — rule 2 replaced (Note 45.3).** Permissions now come in **two steps**:
- **Day 1 (code start):** the new VPS's IP, an SSH key, and GitHub access. Nothing else.
- **Later, by the owner himself:** every other key and account (Google Drive backup, Telegram bot, payment,
  courier, SMS, AI providers, ad platforms, Search Console …) is typed into the backend's credential vault and
  Integrations screen (PR 493, 500), each with a Test button. Until a key arrives, its feature runs on the mock
  (A1.3).
- **Go-live gate:** the site does not take real orders until the **Google Drive backup** (PR 8, 395, 507) and the
  **Telegram alerts** (PR 9) are live and tested.
Rules 1 and 3–9 are unchanged. The owner never reviews code, and the build never waits on him.''')

AFTER['### A1.2 What the owner hands over for the server, and nothing more — Locked'] = q('''**V2 · 19 Oct 22:44 (Note 45).** On the new VPS the owner gives **the IP and an SSH key** (chosen when the
VPS is created). We create the non-root deploy user ourselves and **open ports 22/80/443 ourselves**: the server
firewall over SSH, and the provider's cloud firewall either through its panel with the owner's login or by
step-by-step guidance (PR 3). The owner installs nothing.''')

AFTER['### A1.3 Nothing is ever blocked waiting for a credential'] = q('''**V2 · 19 Oct.** Unchanged in principle. The Activation Center's items are entered by the owner in the
Integrations screen and vault (PR 500, 493), never in code or Git. Two items are go-live conditions, not
optional: Google Drive backup and Telegram alerts (A1.1 V2 block). The long-lead items to start early are listed
in Appendix B (Google Ads developer token, Meta business verification, bKash/Nagad/SSLCommerz, SMS masking, DBID).''')

AFTER['### A1.4 Parallel agents — the owner does nothing'] = q('''**V2 · 19 Oct — lanes A/B/C replaced by the seven fixed agents (PR 577, 583).** Each stage has one owning
agent (Part E, E0 table; C10). The owner's standing rule stays: **2–3 agents build at once** on separate
worktrees, more only when he asks (Note 29.1). Days 1–2 are still one agent alone on S0A, S00 and the complete
schema skeleton, now including the settings framework (PR 491–492 cannot be retrofitted). The single-owner rule
for shared files stays; Gyani names each shared file's owner at kickoff (recommended: Prisma schema → Prohori as
S00 owner; design tokens → Shilpi; routing table → Sawdagor). The "~110–140 PRs each" load figure is replaced by
the per-stage counts in E0.''')

AFTER['### A1.5 Continuous deploy — live the moment it is merged'] = q('''**V2 · 19 Oct.** Before real orders: Drive backup and Telegram alerts must be live (A1.1 V2). Once real orders
start, the gated deploy also runs the QA gate in Appendix C (device gate 0 failures, journeys, phone pixel-diff
for desktop-only changes). After go-live every change goes staging → gate → deploy, with one-step rollback
(see "How changes are made after V2").''')

AFTER['### A1.6 The one-month plan and the timeline'] = q('''**V2 · 19 Oct.** The plan is now **594 active PRs** (600 filed, 6 parked), not ~409. The V1 turn model is not
re-derived here; scaled linearly (594 × ~22 turns × 1.35) it gives about 17,600 turns, so treat the V1 timeline
as a lower bound. **Plan tier answered 18 Oct: Max 20x is already taken (§59 answer 32).**''')

AFTER['## A2. Server foundation (S0A) — runs first, before any application code'] = q('''**V2 · 19 Oct 22:44 — new VPS (Note 45; register S0A PR 1–3 updated).**
- The shop runs on a **brand-new VPS created fresh with Ubuntu 24.04 LTS**. It is **not** the Azure E8ds v4 VM.
  Its specs come from the owner's configuration screenshot (Appendix B, day-1 data).
- **PR 1:** record the new machine's specs from the screenshot; take a provider snapshot or backup before any change.
  The "Azure package must not change" rule applies to the old VM only.
- **PR 2:** no in-place upgrade. Verify the Ubuntu 24.04 LTS version and apply all updates.
- **PR 3:** base hardening (SSH keys only, no root login, fail2ban, unattended security updates, UFW). **Ports
  22/80/443 are opened by us**: server firewall over SSH, provider cloud firewall via its panel or guided steps.
- **PR 4–10 unchanged** (Docker, PostgreSQL, Redis/BullMQ, Caddy, Drive backup, monitoring to Telegram, k6
  baseline). PR 5's tuning is written for 8 vCPU / 64 GB in the register; it must be **re-sized to the new
  VPS's real CPU, RAM and disk** once the screenshot arrives (A2.6 already keeps all values in one config file).
- Sections A2.1–A2.4 below are kept as the record of the old VM and tagged "Replaced".''')

AFTER['### A2.1 The machine the owner already has'] = '**[Replaced 19 Oct 22:44 — new VPS. This table describes the old Azure VM only; see the V2 block under A2.]**\n'
AFTER['### A2.2 Assessment of that machine'] = '**[Replaced 19 Oct 22:44 — new VPS. The assessment applies to the old Azure VM only. Its general requirement (4–8 vCPU, 16–32 GB RAM, fast disk, media on object storage behind a CDN, no GPU) still guides the new VPS check in PR 1.]**\n'
AFTER['### A2.3 The Azure package must not be changed — Locked'] = '**[Replaced 19 Oct 22:44 — new VPS. Applies to the old Azure VM only (register PR 1).]**\n'
AFTER['### A2.4 The OS question, solved without changing the package — Locked'] = '**[Replaced 19 Oct 22:44 — new VPS created with Ubuntu 24.04 LTS; no in-place upgrade (register PR 2).]**\n'
AFTER['### A2.5 S0A — the ten PRs'] = q('''**V2 · 19 Oct — register numbering wins.** The register's PR 1–10 (A2 V2 block) is the build list. V1 items
below that have no PR of their own are carried as scope: access and lock-down → PR 3; LVM volume separation, swap
and free-space alarms (where the new disk allows) → PR 3/4; network and kernel tuning → PR 5; one-command restore
proven on a throwaway machine → PR 8; `docs/SERVER.md` in Bengali and the optimisation-panel hooks → PR 10.
Azure-specific items (Accelerated Networking, NSG, snapshot) apply only if the new provider offers them.''')
AFTER['### A2.6 The tuning profile, sized to this exact box'] = q('''**V2 · 19 Oct.** These values are sized for 8 vCPU / 64 GB (the old VM). Re-size them to the new VPS from the
owner's screenshot (PR 1, PR 5); the one-config-file rule makes that a single edit.''')
AFTER['### A2.8 Backups — Google Drive only — Locked'] = q('''**V2 · 19 Oct.** Still Google Drive only. A **second, add-only Google Drive** holds a third copy (decided in
curriculum wave 2, OWNER-PRECODE-CHECKLIST item 13). The owner enters the Drive credentials in the vault; the
backup must be live before go-live (A1.1 V2). Restore of production needs a typed confirmation and runs on
staging first (PR 396/507).''')

AFTER['## A3. Architecture — the ERP is the master'] = q('''**V2 · 18 Oct — the ERP becomes optional (PR 497–499).** ERP mode switch (EXTAS ERP · another ERP · no ERP),
a generic adapter contract with mock / sandbox / live, and an ERP-absent guard proven by tests. The no-ERP stock
module is parked as S27 (handover pack). ERP push permission was granted on 18 Oct (§59 answer 36); the access
itself is still owner data (Appendix B).''')

AFTER['## A4. Multi-store — three stores, one server, one codebase'] = q('''**V2 · 18–19 Oct.** S17 is now **24 PRs** (356–377, 511–512). The owner adds store 2 himself later from the
panel (§59 answer 38); the system supports 2–3 stores by default (§59 answer 40). The first domain is
**extas.com.bd**: the new site replaces the live WordPress shop on the same domain (PR 587, Note 26.1), so it
becomes the mother store. The "Azure credential / who opens 80/443" question is closed: we open the ports
(Note 45.2).''')

AFTER['## A5. Model and cost policy'] = q('''**V2 · 19 Oct.** Free models are in the pool but **qualified per job**: each job type has a quality test set, and
the cheapest model that passes the job's bar is suggested; the owner accepts or changes it (PR 580, Note 17).
Spend caps per agent (PR 309), the cost book (PR 312–313) and "cost only when used" for idle author agents
(PR 593) apply.''')

AFTER['### A6.1 One living file, not two — Locked'] = q('''**V2 · 19 Oct — replaced by versioned files (PR 594).** The blueprint is kept as versioned files side by side:
`EXTAS-ECOMMERCE-V1.md` (frozen), `EXTAS-ECOMMERCE-V2.md` (current), then V2.1, V2.2 … each with a dated change
log. The admin's PR register page holds them all and marks the highest version as latest. In the code phase the
register and the latest blueprint live in the repository's `docs/` folder (see "How changes are made after V2").
The Part 0–5 structure listed below was the V1 plan for the file; this file keeps V1's Part A–F order.''')
AFTER['### A6.3 The blueprint lives in GitHub and updates itself — Locked'] = q('''**V2 · 19 Oct.** Still true, with the PR 594 change process: the register and blueprint live in `docs/`, feed the
admin on every deploy, and the build agent re-reads the register before every PR. A change is a dated change
note (CN-###) and a new blueprint version (V2.1 …).''')
AFTER['### A6.6 Running totals'] = q('''**V2 · 19 Oct — current totals:** **600 PRs, 28 stages** (S0A–S26 numbered; S27 parked unnumbered); 594 active,
6 parked (S26 513–518). Parked outside the count: S27 no-ERP stock, AI voice calls, POS, birthday marketing, ERP
retail section. The V1 table below is history.''')

BEFORE['# Part E · Stages, the PR plan and the numbers'] = None  # Part E is replaced wholesale (see builder)

# ---------------------------------------------------------------- PART B
AFTER['# Part B · Orders, money, support and operations'] = q('''**V2 · what changed in Part B.** Order messages follow the owner's 2 SMS + 1 WhatsApp rule (B2.5); two
separate consent ticks (B5.7); delivery promise in hours and trial at the door (B1.16–B1.17); duplicate and
fraud handling never blocks automatically (B1.12, B6.4); the invoice is fully editable (B2.1); admin shows full
phone numbers with view logging (B5.1); the PR register lives in the backend (new B9).''')

AFTER['### B1.1 Order lifecycle — already in the blueprint, confirmed'] = q('''**V2 · 18 Oct.** Every order is scored, marked and placed in its section the moment it lands
(risk-sectioned dashboard, PR 541); marking is instant, the decision never is. No order is ever held over an
unclear address: it confirms and goes to a call queue (PR 563). Out-of-stock lines are never auto-cancelled; the
rest ships (PR 183, §59 answers 41–42).''')

AFTER['### B1.12 Duplicate orders — four layers'] = q('''**V2 · 18 Oct — the duplicate and fraud engine (PR 519–524, 540–546, 555–557).** One identity graph (phone, name,
address, IP, device). Rules per scenario with actions **cancel · hold · warn · allow; there is no block action**.
Scenario A cancels the second order and the customer gets a detailed SMS or WhatsApp with the first order's
tracking link (PR 546). Several orders from one identity become one parcel (PR 522). An identity is only
*proposed* for blocking; a human blocks (PR 523). The AI reports and waits (approval digest, PR 540). Phone-first
at checkout: an in-transit duplicate shows a popup with two buttons, cancel or "no, I want another one" (PR
556); same product, different size becomes an exchange offer (PR 557). Binding rule: a genuine order is never
trapped.''')

BEFORE['### B1.15 Open — needs the owner\'s decision'] = '''### B1.16 Delivery promise in hours (V2, 19 Oct)

**Note 4.2, 4.3; PR 550, 119, 126.** The delivery time is shown in **hours per band**, set in the backend:
inside Dhaka **24–48 hours**, outside Dhaka **48–72 hours** (sub-area follows its mode). Plain wording, e.g.
"You'll get your order within 24–48 hours." It is decided from the resolved address and shown on checkout, as
the thank-you page headline, in the help search answer, on the Delivery page and in the FAQ, all read from the
same settings (demo: `07-help-search.js` `hs_deliveryAnswer()`, `zoneHours()`; `{insideHours}/{subHours}/{outsideHours}`
tokens). No page may say "days".

### B1.17 Trial at the door (V2, 19 Oct)

**Note 23.9.** The customer may try the product in front of the rider. A setting, **on** by default, with its text
on the product page, checkout and the delivery/exchange help pages in English and Bengali (demo
`08-shop-opts.js`, `89s-shop-settings.js`). If the customer returns it at the door, the existing door rule
applies: pay only the delivery charge to the rider.

'''

AFTER['### B2.1 Customer invoice'] = q('''**V2 · 19 Oct.** Every word and block of the invoice is editable from the backend (PR 407, template editor PR
409; Note 4.4). In My account the order number is a link and an invoice download icon sits beside it; "Get
invoice" on the order page opens its popup (Note 4.5). The WhatsApp invoice is a **full-page JPG image with the
logo** by default (§59 answer 45), still a setting.''')

AFTER['### B2.5 Notification log and delivery'] = q('''**V2 · 19 Oct — the owner's default send rule (PR 148/505; Note 4.7, 23.2).**
| # | Channel | When | Note |
|---|---|---|---|
| 1 | SMS | the order is placed on the site | order number, amount |
| 2 | SMS | the shop confirms / processes it (booked with the courier) | tracking link |
| 3 | WhatsApp (one) | when the shop processes the order | utility template |
After that **nothing from the shop**; the courier's own pickup SMS is the customer's third message. Messages for
later steps (picked up, out for delivery, delivered) exist as switches, **off**. The code counts messages per order
and blocks a third SMS or a second WhatsApp, logging the block (Doot skill D09). The notification log, retry and
no-double-send guard below stay. Whether the optional order e-mail counts against this rule is open (Appendix B).''')

AFTER['### B2.6 File naming and versions'] = '**[Replaced on 19 Oct by versioned files — see the A6.1 V2 block and "How changes are made after V2". UI/UX results did go into Version 2 as this section planned.]**\n'

AFTER['### B3.10 Money reporting'] = q('''**V2 · 18 Oct (S16 additions, PR 504, 536, 537, 568).** Profit per order with ad spend apportioned, and by
category and **by style** (e.g. Polo → Ralph Lauren polo → Ralph Lauren solid polo), so the owner can decide to
restock, buy in bulk or stop a style (§59 answer 21). The screen stays simple; the internals do the work
(§59.2). Expenses are entered here and later reach the ERP (§59 answer 22). VAT system present and dynamic per
product/category, off for now (§59 answer 23). Report frequency set by the owner (§59 answer 24). Staff and
performance badges needed (§59 answer 25). Product and category sales by district and upazila (PR 568).
Itemised titles for these PR numbers are not in the register (Appendix A).''')

AFTER['### B4.3 The WhatsApp number'] = q('''**V2 · 19 Oct.** The header WhatsApp icon on every page (D3.1) and the checkout help block open this number.
Text only, as below. The real number is owner data still needed (Appendix B); until then the demo's placeholder
numbers are expected and come from settings.''')

AFTER['### B4.14 The 12 PRs of S22'] = q('''**V2 · 18 Oct.** S22 is now **13 PRs: 425–436** (the twelve below, in order) **plus 538** from the 18 Oct decision
round. That round set: the AI answers 95–98% as fast as it can; what it cannot answer goes to a human; if no
employee responds within a settable window (default 5 minutes) the AI pings the owner on Telegram (§59 answer
48); desk hours from the backend (answer 49); links customers send are checked by the AI, risky ones made
non-clickable with a danger mark (answer 54).''')

AFTER['### B5.1 The Customers section'] = q('''**V2 · 19 Oct (Note 24.1).** The admin shows customers' phone numbers **in full** in the list and the profile.
Every profile open and every number copy is logged ("Who looked at this customer"). The address rule (PR 561)
is unchanged. Added 18 Oct: customer history summary at approval (PR 533), grading with badges and a verified
mark (PR 534), legacy customer import from the owner's order sheet and courier data (PR 535). Demo:
`91-admin-crm.js`, `#/admin/customers`.''')

AFTER['### B5.6 What the shop keeps and for how long'] = q('''**V2 · 18 Oct.** Customers are **never auto-deleted**; only IP and GPS expire at 180 days; manual deletion stays
(PR 302, §59 answer 50).''')

AFTER['### B5.7 Consent'] = q('''**V2 · 19 Oct — two separate consent ticks (Note 23.1; PR 123, 148, 298, 505).** Checkout, the landing-page
form and the account switches show **SMS offers: ticked** and **WhatsApp offers: separate, unticked**. Both are
stored separately on the order and the customer, with where and when; the CRM shows both and campaign sending
respects each. Order-related messages (B2.5) need no tick. Demo: `51-checkout.js`, `70-landing.js`,
`60-account.js`, `91-admin-crm.js`.''')

AFTER['### B6.4 Fraud checking'] = q('''**V2 · 18 Oct.** Governing rule: **nothing is ever blocked automatically**; the AI may at most decline an order
(§59.2). Phone-entry risk check runs in the background and passes the customer on a slow or failed check (PR
559); multi-courier fraud data merged behind one adapter (PR 567); flagged customers get the advance-payment mode
on the same checkout page, never shown a score or reason (PR 558, 560); flag outcome report (PR 562); every rule
individually switchable (PR 544); decision learning (PR 543); new customers with no history get a call, not a
decline (PR 545).''')

AFTER['### B6.5 Admin access'] = q('''**V2 · 18 Oct.** Roles come from the role builder (PR 495). 2FA is present and the owner decides; not mandatory
(§59 answer 31).''')

AFTER['### B7.3 Site Health & Audit — the operations side'] = q('''**V2 · 19 Oct — checklist audit runner (PR 570; Note 14, 21).** The full e-commerce checklist
(`qa/ECOMMERCE-CHECKLIST.md`, 405 points plus later additions, grouped and prioritised) lives in the AI section.
One click starts 2–3 agents on chosen groups, on desktop and several phones; or a schedule (e.g. weekly) sends the
report and bug list to Telegram. The owner chooses when, how many agents and which groups. **Fixes only with
his permission.** The release standard it enforces is Appendix C. Demo: `#/admin/audit` (`89-admin-system.js`).''')

AFTER['### B7.5 The user manual'] = q('''**V2 · 19 Oct — PR 599, paused for the code phase.** A "How to" panel on every admin page and a "?" on every
field, in simple English and Bengali; a searchable Site Manual inside the admin written for a new owner; a `.md`
copy kept with the blueprint documents. A truly new function is requested through the PR register ("request a
feature") and built by the agent team, never by hand-editing code (Note 42.5). Demo: `#/admin/manual` in
`96d-site-builder.js`, 25 sections.''')

# ---------------------------------------------------------------- PART C
AFTER['# Part C · AI, marketing and imagery'] = q('''**V2 · what changed in Part C.** The agent team is now seven fixed agents with a chief (new C10, replacing the
C3.1 job list as the org chart). The blog becomes the main traffic engine (new C11). The Google traffic plan
(new C12) sets `/` + `/bn`, the WordPress migration and Merchant Center. Product naming and URL control is new
C13.''')

AFTER['## C1 · AI 360 Control Room (S15)'] = q('''**V2 · 19 Oct.** S15 is now **48 PRs** (304–341, 506, 577–585). PR 506: the whole site works with AI off (proof
tab in the demo). PR 577–585: agent profiles, reports, curriculum, model auto-suggest, Tirondaj, memory, chief,
Telegram routing, learning engine (C10). Demo: `#/admin/ai` (`83-admin-ai.js`), `#/admin/agents` and
`#/admin/agents/<id>` (`89b-admin-agents.js`).''')

AFTER['### C1.5 Multi-provider and per-agent model choice'] = q('''**V2 · 19 Oct — PR 580, Note 17.** For every agent job the system suggests a model with its reason; the owner
accepts or changes it. Free models are qualified against each job's test set; the cheapest model that passes the
bar is suggested. The page shows quality per candidate, cost per 100 runs, monthly saving, last test date and
"re-test now". Cost control never lowers quality.''')

AFTER['### C1.8 Continuous skill training (standing requirement)'] = q('''**V2 · 19 Oct.** Outside skills are imported into each agent's library, marked for the agent they serve
(`agents/skills/<agent>/ext/`, Note 16.1). Curriculum and exams (PR 579), the continuous learning engine with its
quality gate (PR 585) and strong memory (PR 582) are in C10.''')

AFTER['## C3 · The agents and their jobs'] = q('''**V2 · 19 Oct — the eleven jobs below are now carried by the seven fixed agents (PR 577, 581, 583, 593).**
The jobs, their permissions and the approval queue stay; who does them changes:

| V1 job | Owning agent now |
|---|---|
| 1 Head of Growth | Gyani (chief) sets targets; Doot (organic, CRM) and Tirondaj (paid) own the channels |
| 2 Social content agent | Doot (S23) |
| 3 Creative agent | Gyani (S24/S25 studio) with Shilpi for design |
| 4 SEO & blog agent | Doot with the five author agents A360-08…12 |
| 5 Performance agent | Tirondaj (A360-07) |
| 6 Community agent | Gyani (S22 support), comment/DM ingestion with Doot (S23) |
| 7 Analyst agent | Gyani (S15 analytics commentary, PR 333) |
| 8 AI growth agent (PR 269) | Tirondaj |
| 9 EXTAS AI (support, incomplete orders) | Gyani (S22); incomplete-order follow-up with Doot (S13 PR 274–276) |
| 10 Photoshoot agent | Gyani (S24/S25) |
| 11 Site audit agent | Prohori (S21, PR 570) |

The mapping follows each agent's owned stages (`agents/*.md`); C10 has the full org chart.''')

AFTER['## C4 · Organic growth — SEO, AI answers, YouTube, blog'] = q('''**V2 · 19 Oct.** Read with C11 (blog engine) and C12 (Google traffic plan). FAQ rich results ended for all sites
on 7 May 2026: FAQ content stays for customers and AI answers, markup optional, no rich result promised (PR 224).''')

AFTER['### C4.5 Blog that actually sells'] = q('''**V2 · 19 Oct.** Replaced in scale by C11: 3 and up to 5–6 posts a day, an agent pipeline with a second-author
proofread, house ads and a care-guide link on every product page. The selling rules below still apply.''')

AFTER['### C4.6 What gets built (+5 PRs)'] = q('''**V2 · 19 Oct.** S12 is now **22 PRs** (239–253, 528–530, 547, 591–593); S11 is **22 PRs** (220–238, 527, 586,
588). See Appendix A.''')

AFTER['## C6 · Marketing'] = q('''**V2 · 18–19 Oct.** S13 is now **35 PRs** (254–283, 531–532, 548, 569, 589). Paid ads belong to Tirondaj (A360-07)
inside code-enforced guardrails: target sales, max cost per purchase, daily/monthly ceilings, auto-decrease
allowed, **any budget increase only after the owner's approval**, kill switch, every change logged (PR 581). Full
campaign control from the dashboard (PR 531); deep conversion feed with courier outcomes (PR 532); the Facebook
feed is generous: successful deliveries and orders that went to the courier untouched, holding back only what
was cancelled or marked bad (§59.2); geography-led ad guidance (PR 569); market and competitor intelligence from
public pages only (PR 548); Merchant Center feed and Bangladesh test after go-live (PR 589). Demo: `#/admin/ads`
(`93-admin-ads.js`).''')

AFTER['### C6.6 PARKED · Birthday marketing'] = q('''**V2 · 18 Oct.** Still parked. "Continue with Facebook" login is **not** built (§59 answer 58), so there is no
automatic birthday source; the birthday field capture (PR 301) stays.''')

AFTER['## C7 · S24 · Virtual Photoshoot Studio'] = q('''**V2 · 18–19 Oct.** S24 is **38 PRs** (444–480, 539). The 18 Oct round added: models may be brought in from outside
or created in the backend, and when the owner supplies a sample pose or styling image the generated photograph
follows it (§59 answer 59; filed in this stage, PR 539 by its round). Every AI pose set or video is kept in an
asset library and reused for the same template + product + colours, never paid for twice (Note 38.2; demo
`ST.aiAssets`, AI & agents → AI media library). The side canvas's motion templates (PR 596) use this studio;
signature "walk-out" template: `agents/skills/gyani/studio/WALKOUT-TEMPLATE.md`.''')

AFTER['## C8 · S25 · Video & Campaign Creative Studio'] = q('''**V2 · 19 Oct.** S25 stays 10 PRs (481–490). It also renders the short clips for the side canvas's AI motion
templates (PR 596, Note 37.9).''')

AFTER['## C9 · Build capacity and timeline — the reality check'] = q('''**V2 · 19 Oct.** Counts in this section are V1's. Current: 594 active PRs (E0). See the A1.6 V2 block.''')

# ---------------------------------------------------------------- PART D
AFTER['# Part D · UI/UX — IN REVIEW'] = q('''**V2 · 19 Oct — Part D is reviewed through round 15 and handed to the code phase (Note 44.1).** The phone review
finished on 18 Oct (PHONE-REVIEW "PHONE REVIEW COMPLETE"); rounds 13–15 followed on 19 Oct; the desktop review ran
on 19 Oct (agent audit 53 findings, functional QA 14 issues, owner's 18:38 notes), all fixed in the demo. Final
regression R15d: 337/337 testable non-backend checklist points pass, device gate 0/480, journeys 326/326. New
sections D8–D12 follow D7.''')

AFTER['## D0. Status of this part — IN REVIEW, NOT FINAL'] = q('''**V2 · 19 Oct — status replaced.** Round 12 was followed by rounds 13, 14 and 15 (`review/ROUND14.md`,
`review/ROUND15.md`) and the desktop review (`review/DESKTOP-REVIEW.md`, `qa/DESKTOP-QA-REPORT.md`). The owner said
"do 1–4 … final V2 .md" and moves to code (Note 44.1). What may be built: everything in this part, the V2 blocks
and D8–D12. Paused (finished in code): PR 596 extensions, 598, 599, 600. Reference devices: the 15-phone device
gate plus the owner's standard of 8 phones, 5 tablets in both orientations and desktops (Appendix C); 440 × 956
stays the first check.''')

BEFORE['### D1.3 Everything is configurable — Locked (§41.2, §41.10, §41.16)'] = q('''**V2 · rules added to D1.2 by rounds 14–15 (`agents/lessons/ALL.md`; every agent replays them before work).**
- **R8 — AUTO ADJUST.** Nothing fixed; nothing wraps to a second line or covers anything; what cannot fit steps
  down (full → short → icon) or hides (R14).
- **R9 — One line.** A price line, fit line or label line is one line on every device (Note 2.5, 2.6).
- **R10 — Never leave the combo.** No tap on a combo page takes the customer to a single product page (Note 5.1).
- **R11 — History.** Back goes back exactly one page to the same scroll position; never a blank page, never a jump
  home (Note 7.1, 12.2, 12.3). Popups close first.
- **R12 — Browser behaviours.** Never stop one (pull-to-refresh, edge swipe) without putting it back (Note 6.1).
- **R13 — Every pause has a resume.** Hover, focus, touch, popup, menu, video: the test checks it starts again at
  the right moment; a touch rule (4 s hold) never applies to the mouse (Note 39).
- **R14 — Hover means a real mouse.** A phone tap fires mouseenter without mouseleave; hover logic checks
  `(hover:hover) and (pointer:fine)` and `pointerType === 'mouse'`.
- **R15 — Desktop work never changes the phone** (Note 34.2): phone pixel-diff 0 px (Appendix C).
- **R16 — A district or postcode in an address settles the delivery band silently** (PR 551).
- **R17 — Demo-only helpers never show to a normal visitor** (`?demo=1` only) and never ship (Note 41.2).''')

AFTER['### D1.9 How UI work is run — Locked standing instruction (§56.13, §57.5, §58)'] = q('''**V2 · 19 Oct.** Bugs are fixed without asking; for design choices one option is picked, applied and 2–3
pictures kept so the owner can confirm or change it later (Note 4, 03:34). Answers and picture labels for the
owner are in simple Bengali (Note 5.0). "Done" means the Appendix C gate passed and the screenshots were looked
at, not one device (lessons R14). Build switches and settings first and data changes last, so an owner reversal
costs nothing.''')

AFTER['## D2. The compulsory first-screen rule — Locked (§57.5, §58.4, §58.12)'] = q('''**V2 · 19 Oct.** The fit line sits centred in the space between the size boxes and the buy bar; +3 px between
"Colour – Black" and the swatches, paid from that space, photo height unchanged (Note 2.8). The buy bar uses
`viewport-fit=cover` and `padding-bottom:max(12px, env(safe-area-inset-bottom))` with `overscroll-behavior-y:none`
so it never sinks under the screen edge on a real iPhone (Note 2.1; final proof needs the owner's real phone).
On desktop, Order Now is above the fold on every template at 1024–1366 (worst 707 px at 1024 × 768).''')

AFTER['### D3.1 Header — Locked except where noted'] = q('''**V2 · 19 Oct (Notes 2.4, 3.1–3.5, 42.2–42.3).**
- **WhatsApp icon in the header on every page**, first in the search/bag group, exactly the product page's glyph in
  the pale-green disc. Hover (real mouse only) grows it ×1.14 and drops the tip **"Need any help"**; press grows
  it. A soft glow spreads out ("bleeds"), never a flicker or shimmer. Switch `SHOWN.header.whatsapp` (on); pages
  in `HDR_WA_PAGES`. **Checkout:** it appears in the header, left of the "Secure" lock with a gap, only after the
  "Need help? WhatsApp" block has scrolled away. The floating WhatsApp disc is a switch, **off** (`fab.whatsapp`).
- Icon gaps 2 px smaller; the **heart (wishlist)** sits in the header too (asks to log in without an account),
  hidden by the header fit on phones too narrow for it (`HDR_WISH_PHONE`).
- **Bag icon bigger and clearer; it pulses in the header and the bottom bar while the bag has items.**
- Narrow phones (≤ 374 px): icons 40 px, logo clamps 20–24 px; the header never moves after a page change.
- Logo as text or an uploaded image with a phone version; **slogan under the logo** (editable, shared with the
  footer, on) — PR 598, paused. Clicking any link to the current page scrolls to the top (demo `99-boot.js`).
- Desktop: data-driven mega menu (D9). Demo: `03-layout.js` (`hdrWa()`, `waGlyph()`).''')

AFTER['### D3.2 Menu and search'] = q('''**V2 · 19 Oct.** Search answers help words ("delivery", "return policy", "exchange policy", "COD") with the right
help page and a one-line answer from the live rules, handles typos, multi-word queries and Bengali ("polo shirt",
"গেঞ্জি") — Note 4.1, 36; demo `07-help-search.js`. The sub-menu system and rebuilt search were approved on 18 Oct
(register, +7). Journal is in the header nav and the phone menu. Desktop mega menu: D9.''')

AFTER['### D3.3 Home page'] = q('''**V2 · 19 Oct.** "Shop sets" uses the v3 brand tint (`HERO_SETS_BTN = 'v3'`, Note 1.1). Hero buttons — labels,
links, style, on/off — are backend settings (Note 3.12). The floating WhatsApp is off (header icon instead).
Sliders snap after a hand drag and keep auto-drift (Note 23.12); on desktop they restart the moment the mouse
leaves (Note 39). Desktop: hero text aligned to the content edge, slides dissolve into the panel colour over 140 px
(`HERO_FADE`; 80 and 140 + wash kept as options), reviews one row of 3 sliding (Note 35.1–35.3). Home sections
are arranged in the page layout builder (PR 595; demo `HOME_SECTIONS` in `20-home.js`).''')

AFTER['### D3.4 Category page'] = q('''**V2 · 19 Oct.** Filters are built from the category's own products: sizes only those that exist up to the
largest present (S…3XL/4XL/5XL), colours present with counts, fits only those present (PR 46, Note 35.7). Each
category page is arrangeable in the layout builder (PR 595; `CAT_SECTIONS`, slot `CAT_SLOTS.afterGrid` in
`21-category.js`). Desktop gutters can hold the side canvas (PR 596, off by default). The lower filter row and
the top Filter / Recommended / On sale row are backend options (R14 14.3–14.4).''')

AFTER['### D3.5 Product page — the buy block'] = q('''**V2 · 19 Oct — round 15 (Notes 2, 3, 13) — these win over anything below.**
- **Title:** the first line fills the full width; leftover words go to line 2; the **heart sits right after the last
  word**. Share is switched off (kept). The floating icon column is off (`SHOWN.pdpIcons = {panel:false, wish:true,
  share:false, whatsapp:false}`).
- **"All N colours":** ≤ 5 colours → right after the last swatch on the swatch line, stepping down "All 5 colours" →
  "5 colours" → "▦5" if needed; ≥ 6 → the "Colour – Navy" label line (`PDP_ALLC_UP_FROM = 6`).
- **Fit line** (after picking a size): one line; fields hide from the end; the first field always stays
  (`pdp_fitLineTrim()`); centred between the size boxes and the buy bar.
- **Price row:** `৳price · | · text`, always one line on every device (`pdp_payFit()`: type steps 0.5 px down to 11.5
  px, then the last pieces hide; never wraps, never "…"). With a discount: price | discount (stacked) | **second
  bar** | free delivery or the owner's text; when the second bar shows is set per product / offer / campaign; if
  it cannot fit, "Free" stacks over "home delivery" like the discount stack.
- **Add to Bag** is a near shade of Order Now (one family of two buttons).
- Size chart chip 2 px higher; six sizes S…3XL auto-fit (tested); size chart popup scroll waived (Note 2.7).
- **Zoom:** tap / double-tap / pinch opens a full-screen viewer with the **full original image** from the backend,
  not the cropped one; desktop adds drag, wheel, ‹ › and keyboard (Note 13.1; demo `31-zoom.js`).
- Brand line on the page from the product's brand field (PR 590); care-guide link to the matching journal post
  (PR 591 scope); trial-at-the-door text when the setting is on.
Demo: `30-product.js`, `r12-pdp.css`.''')

AFTER['### D3.7 Product page — templates, colours and URLs'] = q('''**V2 · 19 Oct.** Live product URLs are `/p/<style-slug>`, category-free (PR 220, 527); name, slug, SEO title,
feed title and brand are set per product with shop-wide templates; a changed slug 301s automatically (PR 590, C13).''')

AFTER['### D3.9 Combo / set page'] = q('''**V2 · 19 Oct — superseded in detail by D8 (combos).** Picture taps never leave the combo page; colour and size
are picked in place; the "Your set" boxes keep scrolling to the list (Note 5.1).''')

AFTER['### D3.10 Add-to-bag sheet'] = q('''**V2 · 19 Oct.** "Buy together" → Add to Bag → "View bag" opens the bag (bug fixed, Note 3.6). Desktop uses a
right-side "Added to bag" drawer (420 px) on product, auto-combo and set pages. Owner rule kept: never "add ৳X
more" on the sheet; it reads "Free delivery on this order" or "COD · 72-hour exchange" (exchange window from
Rules).''')

AFTER['### D3.11 Bag / Cart page'] = q('''**V2 · 19 Oct.** Browser back from checkout returns to the bag unchanged (Note 4.6). Same size added twice →
"already in bag" by default, quantity +1 as a settings option (Note 23.13). A single item's size or colour can be
changed in the bag with a stock check and merge. Combos use bag template **B5** by default (D8). Note 43 polish:
"Your bag — 4 items" with a longer dash and smaller, readable count; "Continue shopping" one size bigger with
the checkout shimmer; shimmer on "FREE" delivery; "You save ৳X" in the sale red, bold; the duplicate-size box
fits with accent borders left and right; "Navy · M" bold and readable; plain everyday labels instead of "Polo
Duo" / "Goes well with your bag"; a tiered offer box "Take 2 ৳… save ৳… │ Take 3 … │ Take 4 …" with coloured bars,
fully editable in the backend (PR 598 scope).''')

AFTER['### D3.12 Checkout'] = q('''**V2 · 18–19 Oct — these win over anything below.**
- **Delivery bands and address:** three bands (Dhaka City · Sub-area · Rest of Bangladesh) from the national
  gazetteer (PR 549–553); the resolver reads the whole line on blur or a pause, and a district, parent area or
  postcode settles the band silently; only a line still ambiguous asks (PR 551). Autocomplete rows show parent
  and price (PR 552). Phone-first: a bare phone number prefills the area only; full address only after an SMS
  code or login (PR 555). An unresolved address still confirms (PR 563). Free delivery hides all band machinery
  (PR 565). Demo: `05-gazetteer.js`, `06-resolver.js`, built from `data/BD-AREA-MASTER.csv` by
  `data/tools/make-gazetteer.py`.
- **Delivery line in hours** (B1.16).
- **Consent:** two ticks — SMS offers ticked, WhatsApp offers separate and unticked (B5.7).
- **Trial at the door** line when on (B1.17); the door note stays.
- Header WhatsApp appears only after the help block scrolls away (D3.1). Enter never places the order; details
  survive a refresh; the page is fully Bengali in Bengali mode with Bengali digits; "Need help? WhatsApp us"
  text at 5.6:1 contrast.
- Desktop: the order summary is aligned and sticky with "+N more items".
- Advance-payment mode for a flagged customer swaps only the payment section of the same page (PR 560).''')

AFTER['### D3.13 Thank-you page'] = q('''**V2 · 19 Oct.** The headline states the delivery promise: "You'll get your order within 24–48 hours" (48–72
outside Dhaka), from settings (Note 4.3). The return-charge note belongs here and in My Account → Orders, not on
checkout (PHONE-REVIEW ruling).''')

AFTER['### D3.15 My account / customer dashboard'] = q('''**V2 · 19 Oct.** The order number is clickable (opens the order page) with an invoice download icon beside it
(Note 4.5). Offers: phone keeps the rotating single offer; **desktop with a mouse at ≥ 1024 shows three offers side
by side, each from a different category, each that category's top-selling product**; touch tablets keep two
(Note 4.8, desktop QA). SMS and WhatsApp marketing switches are separate (B5.7).''')

AFTER['### D3.17 Content pages'] = q('''**V2 · 19 Oct.** FAQ, Delivery, Exchange and the announcement bar read settings (hours, charges, windows); Careers
and Payment pages exist; social links come from settings. Content pages get a rich-text editor in the site builder
(PR 598, paused). Help pages live at `/help/<slug>` (C12).''')

AFTER['### D3.18 Footer'] = q('''**V2 · 19 Oct.** Brand block is a column: wordmark, then the slogan starting exactly under the E's ink, 10–12 px
gap (Note 1.2). Newsletter: Join bold 16 px, field height, about a third of the row (Note 1.3). "Text us on
WhatsApp"; WhatsApp and Hotline side by side only when both fit at full size, else stacked; nothing shrinks
(Note 1.4). Help → "Size guide" opens the size finder over the current page (Note 12.1). **Desktop:** four columns
(Shop · Help · EXTAS · Join) and under them a contact block — left: social icons over payment marks; right: WhatsApp
over Hotline, equal width (Note 35.6). Columns and links drag-and-drop, social and payment icons from a set or
uploaded (PR 598, paused).''')

AFTER['## D4. Configurability — the eye-toggle system'] = q('''**V2 · 19 Oct — switches added or changed in round 15** (demo `02-core.js` `SHOWN`, `08-shop-opts.js`,
`89s-shop-settings.js`):
| Switch / setting | Default | Source |
|---|---|---|
| `header.whatsapp` (+ `HDR_WA_PAGES`, `HDR_WA_TIP` "Need any help") | On, every page | Note 3.1, Q-009 |
| `fab.whatsapp` (floating disc) | **Off** (was On) | Note 3.1 |
| `pdpIcons.panel` / `pdpIcons.share` / `pdpIcons.whatsapp` | **Off** (were On) | Note 2.3, 2.4 |
| `pdpIcons.wish` (heart after the title) | On | Note 2.3 |
| `HDR_WISH_PHONE` (heart in the header on phones) | On, hidden when it cannot fit | Note 3.4 |
| `HERO_SETS_BTN` | `v3` brand tint | Note 1.1 |
| `HERO_FADE` (desktop slider edge) | 140 px | Note 35.2 |
| Trial at the door | On | Note 23.9 |
| Same size twice | `block` ("already in bag"); option `qty` | Note 23.13 |
| Consent ticks | SMS on · WhatsApp off | Note 23.1 |
| Later-step order messages | Off | Note 4.7 |
| Delivery hours per band | 24–48 / 48–72 | Note 4.2 |
| Side canvas master switch | **Off** | PR 596 |
| Header slogan | On | Note 42.2 |
| Shimmer control (all shimmers) | per element; master | PR 598 |
Every switch is listed in one searchable eye-toggle dashboard (PR 81) — this answers V1 question D6.1 #14.''')

AFTER['## D5. Analytics — Locked (§50, corrected; confirmed locked in §52.1)'] = q('''**V2 · 19 Oct — the owner's event list is part of PR 338/339 (Note 3.13).** Must exist, part by part, dynamic:
search terms; WhatsApp clicks **by page and by button**; add-to-bag → purchased; direct purchase (Order Now);
removed from bag, re-added, new adds; adds that came from an offer, combo or set; "All N colours" taps; Size chart
taps; wishlist saves; **logged-in vs guest on every event**. Every event carries page type, product/category and
source button so each part can be read on its own. Demo: `87-admin-analytics.js`, `88-track.js`.''')

AFTER['## D6. Still open / still in review'] = q('''**V2 · 19 Oct — status of the V1 items.** D6.1: #1 answered (Add to Bag a near shade of Order Now, Note 3.11; desktop
CTA style D-040 still the owner's call); #2 replaced (header WhatsApp, disc off); #3 approved 18 Oct (sub-menu, +2
in the register); #6 replaced (icon rail off by default); #9 settled by the owner rule kept on the drawer (D3.10);
#12 answered (desktop three offers, Note 4.8); #14 answered (one searchable switch list, PR 81); #16 done (phone
review complete 18 Oct, desktop review 19 Oct). **#4, #5, #7, #8, #10, #11, #13, #15 have no recorded ruling: the demo
default ships and they are listed once in Appendix B.** D6.2: #4 fixed (search, D-015/R15); #8 social links now
from settings, contact placeholders wait for owner data (Appendix B); the rest are re-verified by the checklist
in the code phase. D6.3 is closed: the desktop review ran on 19 Oct.''')

AFTER['## D7. Where two rounds disagreed — the later one wins'] = q('''**V2 · 19 Oct — later still:** row 8 (WhatsApp in a floating column) → header WhatsApp on every page (Note 2.4,
3.1); row 16 → unchanged, and the bag still has no floating WhatsApp; row 20 (payment line) → the one-line price
row with the second bar (Note 2.6, 3.10); row 19 → desktop drawer 420 px confirmed (D-028). The full V1 → V2 list
is in "Resolved conflicts" at the top.''')

# ---------------------------------------------------------------- PART F
AFTER['# Part F · Decisions still open'] = q('''**V2 · 19 Oct — most of this part is answered.** The 18 Oct decision round answered questions 1–60 one by one
(`PENDING_CHANGES.md` §59; answer numbers match the numbers below), and rounds 13–15 settled most UI/UX rows. The
status of every V1 question is in **F4** at the end of this part. The live open list is **Appendix B**.''')

# ---------------------------------------------------------------- in-place tags
INPLACE = [
    ('2. **One single permission collection at the very start.**',
     '2. **[Replaced on 19 Oct 22:44 by permissions in two steps — see the V2 block above (Note 45.3).]** ~~One single permission collection at the very start.~~'),
    ('- **Plan tier:** do you want to run the build on **Max 20x**',
     '- **[Answered 18 Oct: Max 20x already taken — §59 answer 32.]** **Plan tier:** do you want to run the build on **Max 20x**'),
    ('- **The pre-upgrade Azure disk snapshot:**', '- **[Obsolete 19 Oct 22:44 — new VPS.]** **The pre-upgrade Azure disk snapshot:**'),
    ('- **Ubuntu Pro ESM fallback:**', '- **[Obsolete 19 Oct 22:44 — new VPS.]** **Ubuntu Pro ESM fallback:**'),
    ('- **Region:** West India is a reasonable choice', '- **[Obsolete 19 Oct 22:44 — new VPS; region follows the new provider.]** **Region:** West India is a reasonable choice'),
    ('- **Azure credential:** do you want to give the build agent an Azure credential',
     '- **[Answered 19 Oct 22:44: we open the ports ourselves — Note 45.2.]** **Azure credential:** do you want to give the build agent an Azure credential'),
    ('- **The blueprint filename.** The source names it two ways',
     '- **[Answered 19 Oct: versioned files `EXTAS-ECOMMERCE-V1.md`, `-V2.md` …, latest marked in the PR register — PR 594.]** **The blueprint filename.** The source names it two ways'),
    ('7. **The owner controls it**: edit the zone table, add an area, set the charge per zone, set the outside-Dhaka\n   default (he says ৳120–130). There are only **two zones: Dhaka City / Outside Dhaka City**',
     '7. **[Replaced on 18 Oct by three bands — PR 549–553, see the V2 block above.]** **The owner controls it**: edit the zone table, add an area, set the charge per zone, set the outside-Dhaka\n   default (he says ৳120–130). There are only **two zones: Dhaka City / Outside Dhaka City**'),
    ('6. **It learns.** When the courier returns the real zone and charge',
     '6. **[Replaced on 18 Oct: courier mismatches are only logged, nothing is changed or messaged — PR 564.]** **It learns.** When the courier returns the real zone and charge'),
    ('- **The marketing opt-in "Send me offers" is ticked by default**',
     '- **[Replaced on 19 Oct by two separate ticks, SMS on and WhatsApp off — Note 23.1, B5.7.]** **The marketing opt-in "Send me offers" is ticked by default**'),
    ('- **The return/exchange charge sentence** comes from Rules',
     '- **[Moved by owner ruling 18 Oct: return note on the thank-you page and My Account → Orders, not checkout — PHONE-REVIEW.]** **The return/exchange charge sentence** comes from Rules'),
    ('| `pdpIcons.panel` | The whole floating heart/share/WhatsApp column. | On |',
     '| `pdpIcons.panel` | The whole floating heart/share/WhatsApp column. | On **→ V2: Off (Note 2.3)** |'),
    ('| `pdpIcons.share` | The share icon in that column. | On |',
     '| `pdpIcons.share` | The share icon in that column. | On **→ V2: Off (Note 2.3)** |'),
    ('| `pdpIcons.whatsapp` | The WhatsApp icon in that column. | On |',
     '| `pdpIcons.whatsapp` | The WhatsApp icon in that column. | On **→ V2: Off; WhatsApp is in the header (Note 2.4)** |'),
    ('| `fab.whatsapp` | The floating WhatsApp button — **and which pages it shows on and where it sits**. | On |',
     '| `fab.whatsapp` | The floating WhatsApp button — **and which pages it shows on and where it sits**. | On **→ V2: Off (Note 3.1)** |'),
    ('- **Floating WhatsApp icon on the home page**, vertically centred',
     '- **[Replaced on 19 Oct by the header WhatsApp icon; the floating disc is a switch, off — Note 3.1.]** **Floating WhatsApp icon on the home page**, vertically centred'),
    ('- **Floating WhatsApp icon on this page and on every page**',
     '- **[Replaced on 19 Oct by the header WhatsApp icon — Note 3.1.]** **Floating WhatsApp icon on this page and on every page**'),
    ('| 6 | `/en` as default with `/bn` alongside | Confirmed in the record; build it that way |',
     '| 6 | `/en` as default with `/bn` alongside | Confirmed in the record; build it that way **→ V2: English at `/`, Bengali at `/bn` behind the translation gate (PR 220, 588)** |'),
    ('**Current plan: 473 PRs across 27 stages, rising to 483 once the three scoped items land.**',
     '**Current plan (V1, 18 Oct): 473 PRs across 27 stages, rising to 483 once the three scoped items land.** *(V2: 600 PRs / 28 stages — see E0.)*'),
]

# Personal-data scrub applied to all copied V1 text.
SCRUB = [
    ('`mehadih32/Extas-ERP`', 'the owner\'s ERP repository (`Extas-ERP`)'),
    ('mehadih32/Extas-ERP', 'the owner\'s ERP repository (Extas-ERP)'),
    ('01811223344', '01XXXXXXXXX'),
]
