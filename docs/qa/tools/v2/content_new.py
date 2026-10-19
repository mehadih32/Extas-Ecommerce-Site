# -*- coding: utf-8 -*-
# New V2 sections.

A7 = '''## A7. Settings framework and handover-ready rules (V2 · S00 additions, approved 18 Oct)

The owner's instruction (§59, "I should not have to say this again"): build everything with handover in mind.
Nothing a human might change lives in code; every installation can be configured from the admin. These PRs are
built in S00 at schema time (wave 1), long before their numbers suggest:

| PR | What it does |
|---:|---|
| 491 | Settings framework: a typed registry in the database, cached, every value readable and writable from the admin |
| 492 | Two-tier resolver: installation → store, with inheritance. **Goes in with the schema on day one; cannot be retrofitted** |
| 493 | Credential vault: every key encrypted at rest, entered from the admin, never in the repository. Day-1 keys are only the server and GitHub (A1.1 V2) |
| 494 | Hardcode guard in CI: the build fails on a hardcoded key, name, number or policy string |
| 495 | Role builder (replaces the fixed role list of PR 16) |
| 496 | Settings migration: a new setting reaches every installation with its default |
| 500 | Integrations screen: courier, SMS, payment, AI providers, Facebook, Google, YouTube, WhatsApp, Messenger, Telegram, Drive, email — each with a Test button |
| 501 | Branding and appearance from settings (the approved design unchanged; only its source moves) |
| 503 | Language framework: every string from a dictionary; both languages live, Bengali per page behind the translation gate (PR 588); **admin in simple English by default with a Bengali switch** (D11) |
| 508 | General default pack seeded as editable defaults |
| 509 | "My own data" register: values that never ship to a new installation (store name, logo, keys, phone, address, Dhaka list, bank details, social links). Demo data and demo-only helpers never ship (Note 41.2) |
| 510 | "Reset to default" on every setting |

**Standing rules carried into every PR:** nothing the owner asks to remove is deleted — it becomes a switch, off by
default; build switches and settings first, data changes last; admin strings are kept as `{en, bn}` pairs (D11).
Demo: `#/admin/settings` (`89-admin-system.js`, `89s-shop-settings.js`).
'''

E_PART = '''# Part E · Stages, the PR plan and the numbers

> **V2 · 19 Oct — Part E rewritten for 600 PRs in 28 stages.** E0–E4 below are current. V1's Part E (as of 18 Oct,
> 473 PRs) is kept verbatim at the end of this part as **E-H** for the audit trail.

This is the spine of the build. Every PR belongs to exactly one stage, and the stage decides build order.
**PR numbers 1–490 run in build order; from 491 a number is an identity, not a position** — a new PR takes the
next free number but is built inside its stage (PR 491 is built at S00 time). The register is the source of truth
(`master/MASTER-REGISTER.md`); Appendix A lists all 600.

## E0. The stage table (from the register, 19 Oct)

| # | Stage | PRs | Range | V1 count | Status (register) | Owning agent |
|---|---|---:|---|---:|---|---|
STAGE_ROWS
| | **Total** | **600** | | **473** | 594 active · 6 parked | |

Shilpi (A360-05) owns the design layer of every customer-facing surface and reviews what Sawdagor builds;
Tirondaj (A360-07) owns the paid-ads PRs inside S13 (256–270, 278, 283, 531, 581); the five author agents
(A360-08…12) work inside S12 under Doot.

**Why the counts moved since V1 (473 → 600):** the 12 mis-filed PRs were re-filed into the stages that describe
them (S08 → S02 page builder and label dictionary; S10 → S11 category SEO; S14 → S20 invoice templates; S19 → S02
celebration overlay; S20 → S18 user manual; S23 → S02 Find My Size), and 127 PRs were added. The trail is E1.

## E1. How the count was arrived at (V2 trail)

The V1 trail to 473 / 483 is in E-H below. From the re-tally the register records every step:

REACH_TABLE

## E2. Checks on the numbers

- **Both routes agree.** The stage column sums to **600**; the ranges expand to 600 distinct numbers, 1–600, with
  no gap and no duplicate (verification script, Appendix C, C9).
- **V1's three warnings:** (1) the 12 mis-filed PRs are re-filed (above); (2) the S0A/S19 double count stays fixed;
  (3) the old "263 authoritative" section stays superseded.
- **165 PRs are listed in the register by range only** (S16–S25, S26 and the 18 Oct add-ons such as 504, 506, 507,
  511–518, 536–539, 568): their scope is the stage's section of this specification. Appendix A gives each a
  derived title and marks it as such. Itemising those titles in the register is a Prohori/Gyani task, not an owner
  decision.

## E3. Order of work

**S0A runs first and alone** on the new VPS (A2 V2 block). Then the waves, as in V1, with the newer PRs built inside
their stages. 2–3 agents build at once (A1.4 V2).

| Wave | Stages | New PRs built inside the wave (since V1) | Why they go together |
|---|---|---|---|
| 0 | S0A | 1–10 (PR 1–3 updated for the new VPS) | Server first; no application code before its checks pass |
| 1 | S00, S01, S09 | 491–496, 500, 508–510 (settings framework, **with the schema on day one**); 590 naming and URLs; 497–499 ERP-optional seam | Schema, settings, catalogue and the ERP link |
| 2 | S02, S03, S10 | 501, 503 (branding, language, admin English); 595 layout builder, 597 launch default, 596 side canvas (desktop only), 598 → 599 → 600 (paused, finished here in this order); 571–576 combos | The storefront, its builder and the rules that drive it |
| 3 | S04, S05, S07, S08 | 558, 560, 561, 563, 565, 566 checkout parameter and address rules; 541, 546 order dashboard and cancellation notice; 525, 526, 564 courier reconciliation | The money path, end to end |
| 4 | S06, S14, S20, S22 | 502, 519–524, 540, 542–545, 549–557, 559, 562, 567 fraud and delivery-zone engines; 505, 533–535 CRM; 538 support | Everything around an order once it exists |
| 5 | S11, S12, S13, S23 | 527, 586, 588 SEO; 528–530, 547, 591–593 blog; 531, 532, 548, 569, 589 marketing | Being found and being marketed |
| 6 | S15, S16, S21 | 506, 577–585 AI 360 and agents; 504, 536, 537, 568 finance; 570 audit runner, 594 PR register | The control room and the numbers it governs |
| 7 | S24, S25 | 539 | Imagery, once the catalogue is real |
| 8 | S17, S18, S19 | 511, 512 multi-store; 507 backup settings; 587 WordPress migration (on go-live day, with 586) | Multi-store, compliance and go-live |
| — | S26, S27 | 513–518 (parked); S27 unnumbered | Handover pack, built only on the owner's word |

**Dependencies that cross waves (Gyani's build notes, not owner decisions):**
- Checkout (S04, wave 3) reads the delivery bands. Build PR 549–553 and 555 at the start of wave 3, or let S04 use
  the band-lookup interface on the demo gazetteer data (`data/tools/make-gazetteer.py`) until S06 lands. The charge
  accuracy test (PR 553) must pass before any real order.
- PR 597 snapshots cover PR 592's house ads and popups (wave 5): wire the blog keys into the snapshot set when PR 592
  lands (demo keys: `ST.layout`, `ST.sideCanvas`, `ST.blogAds`, `ST.blogAdSettings`, `ST.heroBtns`, `sitebPub`).
- PR 594 is generated from the register on every build; the generator (`tools/make-register.py`) can run from day
  one even though the admin page is S21.
- Go-live conditions: Drive backup and Telegram alerts live (PR 8, 9, 395, 507); WordPress 301 map loaded (PR 587,
  235); hash forwarder in place (PR 586); the Appendix C gate green.

## E4. What one PR must contain

V1's six conditions stand, with these additions:

1. One change, named in plain English in the title — not "fix" or "update".
2. Migrations that run forward cleanly and are reversible.
3. Tests that would fail without the change.
4. ~~A screenshot or a measured number for anything visual, at 440 × 956.~~ **V2:** for anything visual, the
   Appendix C gate: the device gate at 0 failures on the 15 phones and 10 tablet sizes, the relevant journeys on 8
   phones, tablets in both orientations and desktops, and screenshots looked at.
5. A line appended to `PROGRESS.md`: stage, PR number, what changed, what was verified.
6. No secret, key, token or password anywhere in the diff; no owner data (PR 509).
7. **V2:** the build agent re-reads the register before the PR starts, and the register (scope or a new PR) is
   updated before anything is built (standard 5; "How changes are made after V2").
8. **V2:** desktop-only changes pass the phone pixel-diff guard at 0 px.
9. **V2:** every pause has a resume test (R13).
10. **V2:** new admin strings are `{en, bn}` pairs and `tools/extract-admin-bn.py --missing` then `--merge` is run.
11. **V2:** anything removed becomes a switch, off by default; demo-only helpers never ship.

A PR that cannot meet all of them is split until it can.

---

## E-H. V1 Part E as of 18 October 2026 (history, kept verbatim)

'''

B9 = '''## B9. PR register inside the backend (V2 · S21 · PR 594)

**Owner, 19 Oct 14:59–15:05 and 22:54 (Note 33, 46).** An admin section lists every stage and every PR with its
full details: what it does, scope added later and when, owner decision, status (built / parked / in demo / in
code / live), owning agent, demo page link. Click a PR for the full card; search (number, English, Bengali) and
filters; history of updates per PR; **"report a problem on this PR"**, which opens a task for the owning agent
through the chief (with a Telegram preview). **Generated from the master register on every build**, so new PRs
appear by themselves and nothing is typed twice.

- **Files:** the latest full blueprint (highest version marked latest), the master register and the supporting
  files (round notes, plans, research, checklist, QA reports, agent protocol) — read inside the admin with contents
  and search, downloadable, with version history; backed up to Google Drive; no personal data, no third-party
  skill copies.
- **Automatic:** new stages and PRs appear with the date first seen; each new PR shows which earlier PRs it builds
  on and raises a dated notification; growth of an existing PR's text is recorded as an "updated" entry; a helper
  flags new PRs that look like scope on an older one (for Gyani to merge); an unseen-update counter on the page and
  in the sidebar.
- **Change process:** see "How changes are made after V2".
- Demo: `#/admin/register` (`96-admin-register.js`), data `04-register-data.js`, `04b-docs-data.js`, generator
  `tools/make-register.py` with `tools/register-state.json` (idempotent; privacy filter).
'''

C10 = '''## C10. The seven fixed agents, chain of command and learning (V2 · PR 577–585, 593)

The same agents work in design now, build the code, and then run their sections of the live dashboard. Skills are
kept, never re-taught (Note 15.2). Profiles: `agents/<name>.md`; protocol: `agents/AGENT-PROTOCOL.md`.

### C10.1 Org chart

| Code | Agent | Role | Owns | Never touches |
|---|---|---|---|---|
| A360-01 | জ্ঞানী Gyani | **Chief (virtual CEO)** — investigates any "why", names the responsible agent with evidence, assigns and tracks the fix; routes unnamed Telegram commands | S06, S10, S15, S16, S22, S24, S25 | Storefront layout |
| A360-02 | প্রহরী Prohori | Server, settings framework, security, deploy, backup, site health and audit | S0A, S00, S17, S18, S19, S21 (incl. PR 570, 594) | Customer-facing design |
| A360-03 | ভান্ডারী Bhandari | Catalogue and images, courier/returns/exchange, ERP sync, documents | S01, S08, S09, S20 | Marketing copy, AI prompts |
| A360-04 | সওদাগর Sawdagor | Storefront logic: pages, combos, cart, checkout, orders, payments | S02, S03, S04, S05, S07 | Server and ERP internals |
| A360-05 | শিল্পী Shilpi | Senior UI/UX; every customer-facing surface, phone first; reviews Sawdagor's pages | design layer of all surfaces | Business logic, data model |
| A360-06 | দূত Doot | SEO, content, non-paid marketing, CRM, social; head of content | S11, S12, S13 (non-ads), S14, S23 | Checkout, payments, stock |
| A360-07 | তীরন্দাজ Tirondaj | Paid ads only (Google incl. YouTube, Meta, TikTok) | S13 paid-ads PRs (256–270, 278, 283, 531, 581) | Checkout, stock, prices, customer data; never raises a budget without approval |
| A360-08…12 | Five author agents (Suta, Jotno, Rong, Ritu, Bazar in the demo; names editable) | Write articles and help blog SEO, one per section: care and washing, styling, fabrics and fit, seasons and occasions, brands and products | inside S12 under Doot | Everything else |

### C10.2 Chain of command and approvals (PR 583)

Owner → Gyani → the other six (and the authors through Doot). Gyani is free to research, report, analyse, assign
and review work and to write warnings into appraisals. **Only with the owner's approval, for every agent including
the chief:** any money movement or refund, any COD amount change on an order, price or discount changes, ad budget
increases, blocking anyone, deleting data, anything irreversible. The permission list is a dashboard setting the
owner edits; it is **enforced by code**.

### C10.3 Telegram identity and command routing (PR 584)

All agents share the owner's one Telegram bot. Every message starts with the sender's identity line — emoji, name,
Bengali name, employee code, role (e.g. "🏹 Tirondaj তীরন্দাজ · A360-07 · Ads"). A command naming an agent or its
code ("A360-07 budget report", "@Bhandari courier entry check") is assigned to that agent automatically and shows
on its profile; no name → Gyani routes it. Approvals come back as buttons (Approve / Reject / Ask why). Also visible
in the dashboard.

### C10.4 Profiles, reports, memory (PR 577, 578, 582)

- **360° profile** per agent: role, owned stages, never-touches, plan, skills it has and is learning, work log, test
  results, performance (first-time-right rate, bugs it found vs the owner found, rework, cost). The owner edits
  photo, name, bio, joining date, rewards, a verified star and assignments with due dates.
- **Reports** daily / weekly / monthly / yearly and a yearly appraisal in the multinational style
  (`agents/APPRAISAL-TEMPLATE.md`), on demand or on schedule to Telegram or e-mail.
- **Memory protocol:** before every task the agent replays its profile, standards, skills, last 20 work-log lines,
  lessons and open items, and restates them in five lines; the runner stops the task if a line is wrong. After the
  task the runner appends the work log; new lessons become versioned skills only after a sandbox test (PR 322) and
  an approval (PR 420). **Strong memory** (PR 582): a long-term store per agent, searchable by meaning, summarised
  weekly, never deleted silently, backed up nightly to Drive, viewable and correctable by the owner.

### C10.5 Curriculum and learning (PR 579, 585)

- Each agent's field is a degree path — graduate → post-graduate → PhD level — from top-university syllabi and the
  field's standard texts, turned into versioned skills with exams passed in the sandbox before a level is earned
  (`agents/CURRICULUM.md`). Wave 1–2 status: 66 modules + 2 deepening, 9 exams written; exams not yet sat.
- **Tirondaj and Doot are the two power agents** (Note 20): they learn continuously from official docs, practitioner
  blogs, communities, transcripts and case studies. A tip becomes a skill only after it is checked against official
  docs or two independent sources, tested, and written with source, date and confidence; failures are recorded as
  "doesn't work for us". Practice tasks with deadlines are graded in their appraisals. Paid tools are proposed with
  cost and reason; the owner approves and pays. Free official academies are core sources; throwaway accounts for
  free trials are not used (Note 22) — one honest trial per tool, with the owner's account, after go-live
  (`agents/skills/*/TRIAL-PLAN.md`).

### C10.6 Model choice and cost (PR 580, 309, 312–313)

Model auto-suggest with free-model qualification (C1.5 V2 block). Author agents cost nothing while idle; cost =
articles × length × model (Note 31.2).

Demo: `#/admin/agents`, `#/admin/agents/<id>` (`89b-admin-agents.js`), `#/admin/ai` (`83-admin-ai.js`).
'''

C11 = '''## C11. The blog as the traffic engine (V2 · S12 · PR 591–593, 244, 528–530, 547)

**Owner, 19 Oct 12:10–12:26 (Notes 28–31).** Plan: `review/BLOG-CONTENT-PLAN.md`. The storefront label is
"Journal" (`/journal`).

### C11.1 Volume and quality

At least **3 and up to 5–6 posts a day**: everyday fashion knowledge (care, washing, styling, fabrics, fit, occasions,
seasons) plus our own product posts. Calendar: 3 a day for two weeks, then 5 a day **only while quality and indexing
stay healthy** — automatic drop to 3 a day otherwise; an empty slot is never filled with a weak post. Quality is the
system's job, not the owner's (Note 28.3). Plan size: 8 pillars with hub pages, 179-topic bank (125 with Bengali
twins), a 90-day calendar assuming the journal is live on 2 Nov 2026.

### C11.2 Pipeline (PR 591, 244)

Topic list (built by Doot from real search demand; the owner adds topics and approves the list as a monthly batch)
→ **writer** (an author agent) → **another author proofreads and fact-checks** (never the writer) → **Gyani checks
business facts** (delivery, exchange, prices) → **Doot final SEO check** → ready → scheduled → published. Seven checks
run in code before publish; an edit sends the post back to proof. Scope from the plan: per-post fact sources and the
reviewer's verdict; editorial-policy page and an AI-assistance line; similarity and duplicate thresholds; required
internal links and a weekly unlinked-post report; a care-guide link on every product page and "Shop the look" combos
on style posts; refresh queue and merge tool with 301s ("updated" date only on real edits); care-lab / photo request
queue; topic ideas from Search Console, support chats and site search; product blocks swap sold-out items; the
proofreader uses a different model from the writer where possible; English and Bengali readability check; journal-
assisted sales defined.

### C11.3 Authors and bylines (PR 593)

Five author agents A360-08…12 under Doot, one per section; profiles, model choice per job, cost only when used.
**Bylines are honest:** "EXTAS Journal" with the author agent's name, and each author page says the articles come
from EXTAS's AI writing team, checked by our team. A real staff reviewer line appears only where the owner enters
a name (Note 31.3). No invented human personas or fake photos.

### C11.4 The blog as a full section (PR 592)

Categories (pillars) and sub-categories, tags, author and reviewer pages, search, archive, featured and related posts,
reading time, contents, share, RSS, newsletter sign-up, Bengali twins. Reading: 18 px on phones, 19 px on desktop,
66–77 characters per line, Bengali line height 1.85; desktop 720 px column with sticky contents and a sidebar slot.

### C11.5 House ads and popup rules (PR 592)

House ads only — our banners, products, combos or categories; no outside ad networks. Slots: blog home (top banner,
between cards), category pages, inside the article (after paragraph N), desktop sidebar, end of article, optional
popup per post. The owner picks which ads show in which slots, posts and categories, with dates (whole Asia/Dhaka
days), weights and on/off; click and sales report per ad and slot. Rules decided in the blog QA round: **at most 3 ads
per post** (phone: 1 inline + end + bar or popup), **none before the first paragraph**, no duplicate ad on a page,
relevance first (chosen categories decide; else product/tag match; "all" for campaigns), empty slots collapse; ads are
labelled "EXTAS offer" and have Bengali text fields. **Popups:** triggers by scroll %, time or leaving; frequency caps;
easy to close (✕, outside tap, Esc); **never on the first screen for a phone visitor arriving from Google** (Google's
intrusive-interstitial guidance); bottom sheet on phones, 420 px card on desktop; on phones the popup replaces the slim
bar for the visit.

### C11.6 Images (PR 547)

Own product photographs first, then free-licence libraries; **AI generation asks permission every time**; nothing from
Google image search. Studio images are labelled as studio-generated and never used as evidence for a test or fit claim.

Demo: front end `73-blog.js`, `r12-zblogfe.css` (`#/journal`, also under `/bn`); back end `94-admin-blog.js`,
`r12-zblog.css` (`#/admin/blog`: posts, topics, pipeline, schedule min 3 / target 5 / max 6, results, author team,
categories and tags, house ad slots, sitemap). QA: `qa/BLOG-QA-REPORT.md` (R2: front end, journeys, ads and popup 0 fails).
'''

C12 = '''## C12. Google traffic plan (V2 · S11/S13/S19 · PR 220, 236, 586–589)

**Owner, 19 Oct 11:39–12:07 (Notes 23.3, 26, 27).** Plan: `review/GOOGLE-TRAFFIC-PLAN.md`.

### C12.1 Language and URLs

- **English at the root** (`https://extas.com.bd/…`), **Bengali under `/bn`**, same host. Each language has its own
  URL and its own canonical; no automatic redirect by browser language or IP; the language switch is a plain link
  to the twin (a soft "বাংলায় দেখুন" suggestion bar is allowed).
- **Translation gate (PR 588):** a `/bn` page publishes, enters the sitemap and gets hreflang only when its main
  content is really Bengali (natural চলতি, approved) — a "Bengali ready" flag per page; the SEO health report shows
  coverage.
- **hreflang (PR 236):** `en`, `bn` and `x-default` → the English twin, HTML `<link>` tags in the server `<head>` only,
  emitted only when both twins return 200 and pass the gate.
- **Same ASCII slug** for both languages; lowercase; hyphens; trailing slash 301s to the slash-free form.
- **URL map:** home `/`; category `/<category>` (reserved first segments never used as category slugs); product
  `/p/<style-slug>` (category-free); combo hub `/combos`; combo category `/combos/<rule>`; pair
  `/combo/<style>-<colourA>-<colourB>[-<colourC>]-<n>-piece` (colours in fixed dictionary order, reverse order 301s);
  seasonal `/collections/<slug>`; journal `/journal/<slug>`; help `/help/<slug>`; ad landings `/l/<slug>` noindex,follow;
  search noindex,follow; bag, checkout, account, admin and tracking disallowed in robots.txt.
- **Server-rendered first response** carries title, meta description, canonical, hreflang, Open Graph, one H1, the
  main content, visible price and availability matching JSON-LD, real `<img>` with alt and size, crawlable `<a href>`
  links, correct status codes.

### C12.2 Migration (PR 586, 587, 235)

- **extas.com.bd is the owner's live WordPress shop (49 sitemap URLs)**: this is a migration. Before the switch,
  export its Search Console data and backlinks; on go-live day **301 every old URL to its closest new twin**, crawl-
  check the same day, keep redirects at least 12 months (PR 587; the map loads into the redirect manager, PR 235).
- Old demo `#/…` links are forwarded by a small script with `location.replace` and a test table (PR 586).

### C12.3 Combo pair indexing (PR 571)

Ranking pages are `/combos` and `/combos/<rule>`. A pair page is indexable only when **featured** (own set photo and
own line of text); others are `noindex,follow` but fully linked. A paused or ended pair keeps its URL at 200 with an
honest message and live alternatives (PR 527).

### C12.4 Brand, feed and structured data (PR 590, 589, 222, 224)

**Brand names stay** (owner 12:07, replacing 12:04): structured data and the feed use the product's **real brand
field** (EXTAS only for own-label). Merchant Center feed from the catalogue, BDT, Bangladesh tested as the target
country after go-live, result logged; free listings and Shopping ads only if available (PR 589). Structured data adds
WebSite and ProductGroup; combo pages as Product + Offer at the set price. FAQ markup optional (PR 224). Review schema
only from real review rows (PR 223).

### C12.5 Expected speed of traffic

Brand queries days to 2 weeks; long-tail top 10 in 2–6 weeks; image search weeks to 3 months; journal 2–6 months.
English-script searches dominate in Bangladesh except panjabi, and no BD fashion competitor runs a `/bn` section.
**Eid 2027 panjabi pages must be indexed by 15 Jan 2027.**
'''

C13 = '''## C13. Product naming and URL control (V2 · S01 · PR 590)

**Owner, 19 Oct 12:04–12:07 (Notes 26, 27).** Nothing fixed in code. Per product the owner sets the **name on the
site, the URL slug, the SEO title, the feed/ad title and the brand** (default EXTAS); shop-wide templates for slugs
and titles with tokens including `{brand}`; Google and feed preview. **Changing a slug never breaks a link:** the old
URL 301s to the new one automatically (no chains; Back is one step), the same mechanism as the WordPress migration.
An optional "other brand name" warning (setting, **off** by default); a bulk rename tool with preview; the SEO report
compares organic visits and sales before and after a rename. Claude's trademark warning (Merchant Center / Meta) is
recorded; the owner accepted the risk, noting that ads with brand-named links already run without problems.
Demo: `#/admin/naming` and "Name, link & Google" in the product form (`95-admin-naming.js`, `r12-zname.css`); the
demo carries extra brands to show the field (Lacoste, Tommy Hilfiger, Calvin Klein, Levi's, Hugo Boss, Zara).
'''

D8 = '''## D8. Combos — the biggest-selling section (V2 · S03 · PR 89–104, 571–576)

**Owner, 19 Oct 03:43–11:51 (Notes 5, 8–11, 23, 25).** Research: `review/COMBO-RESEARCH.md`; audit:
`review/COMBO-AUDIT.md`; ranking: `review/COMBO-RANKING.md`.

### D8.1 Rules for every combo page (research §0)

Sizes and the Add button on the first screen; one size for all pieces by default ("Size for both", with "Different
size for each?"; top + bottom sets get two rows); every colour pair is its own product; price said one way in taka
("2 pcs ৳2,200 → ৳1,800 · Save ৳400"), once on the page and once in the sticky bar; **one button wording: "Add both to
bag · ৳1,800"** ("Add all 3 to bag" for three) — never "Add to set / Add to combo"; when something is missing the
button says what and scrolls there; the photo shows every piece in the chosen colours; sold-out handled before the tap
(a size is available only when every piece has it); one honest bag line per set; the bigger pack is offered, a single
piece never is; under 40 words above the fold, colour names in text, "Pay ৳1,800 when it arrives" beside the button.
**Picture taps never leave the combo page** (Note 5.1).

### D8.2 Auto colour-pair combos — the owner's model (PR 571)

Bind a category, sub-category or chosen products, pick **2-piece or 3-piece** → every colour pair (or triple) becomes
its own combo listing, e.g. "Ralph Lauren Polo — Black + Navy · 2-piece combo", evergreen, priced "2 pcs ৳2,200 →
৳1,800". Best sellers first, "has colour" filter; regenerates when a colour is added; a pair pauses when a colour sells
out; sizes only where every piece has stock. Per-section tick **"no single piece here"**; optional "add 1 more → 3
pcs". The promoted link is a category page (e.g. Polo → Ralph Lauren → Solid Polo) showing only the generated pairs.
"Use in combos" is ticked on a new product, as an option (Note 23.5). Demo: `01y-combo-auto-data.js` (Solid Polo, 6
colours, S–3XL → 15 two-piece pairs, 20 three-piece), `42-combo-auto.js`, `r12-zauto.css`; routes `#/combos`,
`#/combos/<rule>`, `#/combo-pair/<id>`.

### D8.3 Lifecycle — nothing is deleted, no URL dies (PR 571, Note 25)

Optional start/end dates (none = always on). At the end date the rule ends by itself: pages stay live and indexable,
show "offer ended" with live alternatives, no add to bag, and move to an **Archive** tab in admin. Sold out stays
automatic from stock. Manual off = ended. Turning on or extending brings the same URLs back. Combo rules cannot be
deleted, only switched off or archived. A combo that ends while in a bag keeps its price, with a note (demo
`ended-bag.js` test). "Dynamic, nice and easy" (Note 25.5).

### D8.4 Templates and the winners (PR 572–574, 576)

| Page | Templates | Default applied (score /100) |
|---|---|---|
| Combo category | L1 pair grid · L2 one card per style · L3 hub with winter/summer tabs · L4 one-column ad landing · L5 "2 pcs / 3 pcs" switch first | **L1** (87; L5 ties at 87 and is the choice when pushing 3-piece) |
| Combo product | P1 pair page · P2 pick-your-colours · P3 top + bottom set · P4 mixed 3-item set · P5 fixed-colour pack | **Auto: P1 for same-product packs (96.5), P3 for top + bottom and mixed sets (94.7), P2 for very long lists** |
| Combo in the bag | B1 grouped card · B2 sizes editable in the bag · B3 "add 1 more" in the card · B4 real item prices + one discount line · B5 compact line for many sets | **B5** (97.3): B2 behaviour with 1–2 combos, one compact line from 3; desktop keeps B5 |

Ranking: 188 agent journeys on 360 / 393 / 430 / 1280, no knock-outs, all bag prices right; weights in
COMBO-RANKING §2. B4's real piece prices + one discount line is how the order record and invoice store a set. The
owner keeps the current defaults and may ask for more designs (Note 23.16); the "Move to wishlist" label for combos
(they go to Saved for later) stays until he checks (Note 23.17). Demo: `43-combo-tpl.js`, `r12-zcombo*.css`.

### D8.5 Set photo (PR 575)

Composed automatically from each piece's photo in the chosen colours (side by side, top + bottom, or three-up), one
house standard, no text baked in; "2 pcs" and "Save ৳…" are page badges.

### D8.6 Combo admin (PR 90, Note 9.1)

Its own section, built step by step for non-technical staff: auto rules, an 8-step wizard, fixed combos — products,
allowed colours and sizes, photos, price, offer, on/off, preview. Demo: `#/admin/combos` (`85-admin-combos.js`).
Money bugs from the combo audit (double add, oversell, stale set price, set above regular price) are fixed in the
demo (COMBO-AUDIT "Fixed") and are regression tests for the code phase.
'''

D9 = '''## D9. Desktop (V2 · Notes 34–35, 39 · DESKTOP-REVIEW, DESKTOP-QA-REPORT)

**Rule: desktop gets its own treatment; the phone must not change** (Note 34.2). New desktop CSS lives in files that
load last, inside `@media (min-width:1024px)` and/or `(hover:hover) and (pointer:fine)`; JS layout is gated on
`matchMedia('(min-width:1024px)')` and hover on a real mouse. Touch tablets ≥ 1024 px get the desktop layout without
hover effects. After every change the phone pixel-diff guard must be 0 px (Appendix C).

| Area | Built (demo `97-desk-a.js`, `r12-zzdesk-a.css`, `r12-zzdesk-b.css`) |
|---|---|
| Navigation | Data-driven **mega menu**: New in, categories, More (hidden categories), Combos, Sets, Journal; folds into More when narrow; sub-category links; hover intent 150 ms; **Enter = go to the category, Space/↓ = open the panel, Esc returns focus** |
| Container | **1440 px content at ≥ 1536** |
| Header | Loop animations max 3 rounds; WhatsApp tip "Need any help" |
| Home | Hero text on the content edge; slides dissolve into the panel (140 px); reviews one row of 3 |
| Category | Filters from data; rows fill (no empty right strip) |
| Product | **Sticky buy bar (64 px)**; Order Now above the fold on every template at 1024–1366; zoom with drag, wheel, ‹ › and keyboard; focus restored after colour/size picks |
| Add to bag | **Right-side drawer, 420 px** |
| Combos | Hub rails share rows; bag stays B5 with desktop sizing |
| Checkout | Summary aligned and sticky with "+N more items" |
| Account | Three offers at ≥ 1024 with a mouse; touch tablets keep two |
| Footer | Four columns + contact block (social over payment left; WhatsApp over Hotline right, equal width) |
| Sliders | Pause on hover; **restart the moment the mouse leaves** (touch keeps its 4 s hold) — one engine, `02-core.js` |
| Accessibility | Site-wide focus style; no nested buttons in links (1,428 → 0) |

Results: desktop interaction 198/198 at six widths (1024, 1280, 1366, 1440, 1536, 1920); route sweep 104 routes × 6
widths with 0 JS errors and 0 sideways scroll; journeys 126/126. Open on purpose (Appendix B): D-040 CTA style, D-042
inline size chips, D-045 form cap.
'''

D10 = '''## D10. Page and site building tools (V2 · S02 · PR 595–600)

All of these share one rule: **defaults reproduce today's pages exactly** (gate 0 px), nothing is deleted (hide, never
delete), every change is draft → preview → publish with undo, and the owner's own data never ships (PR 509).

### D10.1 Page layout builder (PR 595 — in demo)

Home and every category page (all categories or a per-category override): add, move (drag or ↑/↓), hide, edit,
duplicate sections. Types: banner, offer strip, product row/grid (from category, tag or manual), combo row (from a
combo rule), category tiles, reviews, journal, safe rich text, spacer, custom HTML-safe block. Each section has
on/off, whole-day Asia/Dhaka dates and device choice (phone / desktop / both); live phone + desktop preview; example
"নতুন অফার" above the reviews. Demo: `#/admin/layout` (`96c-layout-builder.js`, `r12-zlb.css`); hooks `HOME_SECTIONS`,
`CAT_SECTIONS`, `CAT_SLOTS.afterGrid`.

### D10.2 Side canvas (PR 596 — in demo; extensions paused)

The empty left and right desktop gutters, from under the header banner to the footer. **Master switch off** (off =
today's look); the owner will turn it on (Note 37.1). Desktop with a mouse only; phones and tablets never download it.
- Zones: free-form by size and position (draw, drag, resize or type numbers) on a live map at 1280–1920 with rulers;
  per page (home, all or chosen categories; login and bag added, checkout never), per zone on/off and dates.
- Zone types: banner, house ad (product / combo / category), popup trigger (view / time / click; once per visit / day /
  week), illustrated figure, image/animation; full-blend mode (no frame, edge fade).
- **Never hide — scale** from the 1440 standard (gutter 132 px): 0.31× at 1280, 0.68× at 1366, 1× at 1440, 0.28× at
  1536, 1.6× cap at 1920; picture-only below 72 px. Modes: sticky, float (±40 px, eased, transform only), anchored.
- **Placement default from the owner's marking** (`review/owner-side-zone-2026-10-19.png`): top at the first content
  row (≈ 14.4% below the header), height ≈ 80% of the visible window, ≈ 6% bottom gap, ≈ 16 px from the content; 157 ×
  644 at 1797 × 879; mirrored right; percentages are settings ("centred 75%" kept as a preset). A per-size editor with ≥
  10 real desktop sizes; fix any size (badge, reset to auto); sizes in between interpolate; "check all sizes" grid.
- **AI motion templates (with S24/S25):** 19 in the demo incl. the signature **walk-out** (a model in our polo, denim
  and shoes walks out of the page; skill `agents/skills/gyani/studio/WALKOUT-TEMPLATE.md`); product picker (category,
  sub-category, every colour of a style, manual, combo); AI pose/video generation reuses the asset library (never paid
  twice).
- **Speed:** loads after the main content on idle; transform/opacity only; paused off-screen or in a hidden tab;
  budgets in D12; publishing over budget is blocked.
- Demo: `#/admin/side-canvas`, approval view `#/preview/side-canvas` (1440 and 1920). **Paused — the code phase owes:**
  tests for per-page placement, Bengali placement sheets, a full gate re-run.

### D10.3 Launch default and snapshots (PR 597 — in demo)

The launch look is saved as the "Launch default": page layouts, side canvas, house ads and popups, home/category
sections and banners (and the site builder's published data). **"Back to launch default"** returns everything to it;
test sections, zones and ads switch off and are kept as hidden copies. Named snapshots (e.g. "Eid 2027") with restore
and rename; every restore logged and undoable. Panels on Page layout, Side canvas and Settings.

### D10.4 Site builder (PR 598 — partly in demo; paused)

"Like WordPress + Elementor, nothing fixed" (Note 40) **with guardrails** (Note 41): menus (header nav, mega menu,
phone menu, bottom bar), header (announcement bar, icons on/off and order, logo text or image with phone version,
slogan under the logo, on), footer (columns, links drag-and-drop, contact block, social and payment icons from a set or
uploaded), categories and sub-categories, product-page blocks (order and per-device visibility; the buy group cannot
be hidden and only first-screen blocks may sit above it), content pages (rich text), theme tokens (colours, fonts,
spacing) with an AA contrast block, a **Shimmer control** (every shimmer: on/off, speed, intensity, master, reduced
motion), and **tiered bag offers** (Take 2 / 3 / 4 with prices and savings). Guardrails: blocks snap to the responsive
grid (no free pixel dragging), contrast and tap-size checks block bad publishes, **checkout keeps its tested structure —
texts, fields on/off and order are editable, payment steps are locked**. Demo: `#/admin/site` (`96d-site-builder.js`,
`r12-zsb.css`), status page "what can be changed". Paused state and what the code phase owes: status table at the top.

### D10.5 Help and user manual (PR 599 — partly in demo; paused)

See the B7.5 V2 block.

### D10.6 On-page edit mode (PR 600 — not in demo; paused)

Logged in as super admin, a thin bar on every storefront page turns on Edit mode (customers never see it): hover a
section → outline + Edit; click → side panel with that section's settings (texts, prices, products, offer tiers,
shimmer, hide); "+" between sections adds one; the draft shows in place → Publish → undo. Same engine as the site
builder (two doors). On a phone: a light version (texts and offers only, no drag). **Desktop change → "Apply to phone
too?"** If yes, previews on the **10 phone screen sizes most used in Bangladesh** (the owner can open any) plus automatic
checks (nothing cut, no sideways scroll, tap size, buy button above the fold); it reaches the phone only after the
checks pass and the owner approves. **AI mode:** an AI reviewer tests the change across phones, tablets and desktops
(layout, speed, conversion rules, customer impact) and returns "safe to publish" or "Boss, don't publish: …" with
reasons and screenshots; with AI mode off it says so and the owner's check stands. Guardrails as PR 598.
'''

D11 = '''## D11. Admin language (V2 · PR 503 scope · Note 37.3)

The backend's menus and labels are in **simple English by default**, with a switch **"English | বাংলা"** (sidebar on
desktop, top bar on phone). Demo: a separate layer `98a-admin-lang.js` + `98b-admin-dict.js` (2,016 hand-written
plain-English entries); 84 admin routes and tabs × 1280/393, 442 states: 0 Bengali visible in English mode, Bengali
mode identical to before. Rules: an admin string that has its English beside it is kept as `{en, bn}` or
`['English', 'বাংলা']` so the harvest uses the author's own English; after adding admin strings run
`tools/extract-admin-bn.py --missing` then `--merge`. Owner-facing admin text avoids agent codes and PR numbers (names
instead; codes in tooltips). The storefront language switch is unchanged (footer, "EN | বাং").
'''

D12 = '''## D12. Performance budgets (V2)

| Budget | Target | Where it is enforced |
|---|---|---|
| First screen on a mid phone over 4G | < 2.5 s | checklist PF01; PR 88, 234 (needs real hosting) |
| First page HTML + JS + CSS | < 500 KB compressed | checklist PF02 (code phase; the demo is one file) |
| Images | WebP/AVIF, `srcset`, lazy below the fold | PF03; PR 24, 88 |
| Route draw (in-app navigation) | < 200 ms | PF06 (demo: 19–180 ms) |
| Scroll | no heavy work per scroll event; no forced-reflow loops | PF07, PF12 (demo 17 ms/frame) |
| Timers and animations | no forever `setInterval`; infinite animations few and stopped off-screen / reduced motion | PF08, PF09 |
| Slow CPU | works at 4× slower CPU without double navigations | PF10 |
| CLS | 0 on load | desktop QA (measured 0) |
| Side canvas | image ≤ 150 KB, video ≤ 1.5 MB + poster, page total ≤ 3 MB; LCP regression ≤ 100 ms; CLS 0; publishing over budget blocked | PR 596 (demo at 1440: LCP +28 ms, CLS 0, longest task 19 ms, slow scroll frames 2.3% vs 1.7%) |
| Lighthouse budget | CI gate | PR 17, 88 |
| Server baseline | k6 baseline recorded; every later change measured against it | PR 10 |
| Field data | Core Web Vitals from real users | PR 234 |
'''

F4 = '''## F4. Status of every V1 question (V2, 19 Oct)

Answers 1–60 come from `PENDING_CHANGES.md` §59 (18 Oct); the numbers match.

| # | V1 question (short) | Status |
|---|---|---|
| 1 | Risk score thresholds | Answered: customisable, the owner types the numbers (PR 156) |
| 2 | Actions per risk level | Answered: Claude's set is the default, every action editable (PR 161) |
| 3 | Who may blacklist | Answered: owner, manager and customer-facing staff (PR 162); nothing blocked automatically (PR 523) |
| 4 | IP/GPS panel and GPS button | Answered: panel stays; GPS button stays, default on, switchable (PR 159) |
| 5 | COD off for repeat returners | Answered: per case — COD off, delivery charge in advance, full advance, or nothing (PR 163) |
| 6 | `/en` + `/bn` | Replaced: English at `/`, Bengali `/bn` behind the gate (PR 220, 588) |
| 7 | Indexable filter pages | Answered: whatever genuinely performs; more pages not automatically better (PR 227) |
| 8 | Ghost archive | Answered: no URL ever deleted or 404 (PR 527) |
| 9 | AI meta/alt auto-apply | Answered: auto-filled, editable, removable, improvable |
| 10 | Search Console / Bing accounts | Answered: fields provided, the owner pastes keys (Appendix B) |
| 11 | Blog auto-publish | Answered, then replaced: topic-list approval, agent pipeline (PR 244, 591) |
| 12 | Articles per week | Replaced: 3–6 a day (PR 591); a new product triggers a post |
| 13 | Auto-post on new product | Answered: yes, aimed at Bangladesh, auto-shared to social if configured |
| 14 | Blog language | Answered: both; English pages most important (Note 27.1) |
| 15 | Permanent seasonal pages | Answered: permanent; archive and live are states (PR 530) |
| 16 | Ad platforms | Answered: Facebook, Instagram, Google, YouTube, TikTok, LinkedIn present by default |
| 17 | USD rate | Answered: the owner sets it (PR 266) |
| 18 | Dashboard ad control | Answered: full control (PR 531) and deep feed (PR 532) |
| 19 | Alert thresholds | Answered: owner sets them from the dashboard (PR 267) |
| 20 | Coupon types | Answered: fully dynamic (PR 271) |
| 21 | Ad spend in profit | Answered: yes, plus profit by category and by style (S16) |
| 22 | Expenses from the ERP | Answered: entered here, later reach the ERP |
| 23 | VAT | Answered: off for now; whole system present, per product/category |
| 24 | Daily report time | Answered: frequency set by the owner |
| 25 | Team badges | Answered: needed |
| 26 | Second store | Answered: 2–3 stores must work (S17) |
| 27 | DBID, licence, VAT BIN | Answered: dynamic from the backend; numbers still owner data (Appendix B) |
| 28 | Lawyer review | Answered: no lawyer; Claude drafts, the owner edits |
| 29 | Pre-order advance cap | Answered: defaults present, percent per product |
| 30 | Purge IP/GPS at 180 days | Answered: yes |
| 31 | Mandatory 2FA | Answered: present, not mandatory |
| 32 | Plan tier | Answered: Max 20x already taken |
| 33 | Keep the pre-upgrade snapshot | Obsolete (new VPS, Note 45) |
| 34 | Ubuntu Pro token on a failed upgrade | Obsolete (new VPS) |
| 35 | Azure region | Obsolete in form; the owner's rule stands that a backup must restore into a new region if one is suspended |
| 36 | ERP push access | Answered: granted, the owner will provide (Appendix B) |
| 37 | First domain | Answered by PR 587: extas.com.bd (domain access when ready) |
| 38 | Stores 2 and 3 domains | Answered: the owner adds store 2 himself later from the panel |
| 39 | Azure credential / who opens ports | Answered: we open ports 22/80/443 (Note 45.2) |
| 40 | ERP companies for stores 2–3 | Answered: ERP needed when they open; 2–3 stores supported by default |
| 41 | Defective-item hold limit | Answered: never auto-cancelled; the team decides (PR 183) |
| 42 | Rest of a multi-item order ships | Answered: yes |
| 43 | Stock adjustment roles | Answered: owner for now; two or three more role options (PR 495) |
| 44 | Duplicate look-back | Answered: the duplicate engine (PR 519–524, 540–546) |
| 45 | WhatsApp invoice format | Answered: full-page JPG with the logo |
| 46 | Card gateway | Answered: several gateways configurable at once with checkboxes; accounts are owner data |
| 47 | Minimum margin | Answered: margin % set per product at add time |
| 48 | Support SLA | Answered: AI answers first; 5-minute (settable) employee window, then Telegram to the owner |
| 49 | Support desk hours | Answered: backend, dynamic |
| 50 | Inactive customer retention | Answered: never auto-deleted (PR 302) |
| 51 | Admin IP allowlist | Withdrawn by the owner |
| 52 | Site Health frequency | Answered: defaults provided, the owner sets them |
| 53 | Competitors to track | Answered: defaults provided; the owner links them later |
| 54 | Support dashboard screenshot | Answered: link safety rule (AI checks links customers send) — the screenshot itself was not resent |
| 55 | Data classes to external AI | Answered: Claude's proposal accepted (data-class routing and masking, PR 310–311) |
| 56 | AI crawlers | Answered: optional, default on (PR 229) |
| 57 | Social auto-posting | Answered: defaults provided, the owner decides where |
| 58 | Facebook login | Answered: **no** Facebook login |
| 59 | Model photographs | Answered: from outside or created in the backend; generated photos follow a supplied pose |
| 60 | Before/after go-live marking | Answered: "do what is better for the site" — the wave plan (E3) carries it |
| 61 | Buy-button colours | Answered (Note 3.11); desktop CTA style D-040 open (Appendix B) |
| 62 | Floating WhatsApp position | Replaced by the header icon (Note 3.1) |
| 63 | Sub-menu design | Approved 18 Oct (register +2) |
| 64 | Phone search position | No recorded ruling; demo default ships (Appendix B, carried list) |
| 65 | Desktop checkout header space | No recorded ruling; demo default ships (Appendix B, carried list) |
| 66 | Icon rail at 38% | Replaced: the rail is off by default (Note 2.3) |
| 67 | Footer tap targets | No recorded ruling; demo default ships (Appendix B, carried list) |
| 68 | Returns row wording | Open (Appendix B) |
| 69 | Add-to-bag sheet without free delivery | Settled: owner rule kept — "COD · 72-hour exchange" (D3.10) |
| 70 | "Only 3 left" position | No recorded ruling; demo default ships (Appendix B, carried list) |
| 71 | "Was"-price source per category | Open (Appendix B) |
| 72 | Account offer banner set | Answered (Note 4.8) |
| 73 | Six footer Shop links | No recorded ruling; demo default ships (Appendix B, carried list) |
| 74 | Eye-toggles in one list | Answered: one searchable list (PR 81) |
| 75 | Wishlist alerts | No recorded ruling; designed, default off (Appendix B, carried list) |
| 76 | Phone re-audit | Done: phone review complete 18 Oct; desktop review 19 Oct |

F3 rows: buy-button colours → #61; floating WhatsApp → #62; sub-menu → #63; rebuilt search → approved 18 Oct (register
+3) and built (D3.2); price band from the catalogue → answered by PR 46 (filters from data); footer tap targets → #67.
'''

APP_B = '''# Appendix B · Open owner decisions and owner data still needed

Kept short. Each decision has the default that ships if no answer comes (build it as a setting, one line in
`BLOCKED.md`, keep going). Source: ROUND15, the QA and plan reports, `review/OWNER-PRECODE-CHECKLIST.md`.

## B.1 Owner data — day 1 (code start)

| # | Item | Source |
|---|---|---|
| 1 | New VPS configuration screenshot (CPU, RAM, disk, provider) — sizes PR 5 / A2.6 | Note 45.1 |
| 2 | VPS IP and SSH key | Note 45.1 |
| 3 | GitHub access (a private repository for the shop) | Note 45.3; checklist 32 |
| — | Optional: the server-setup blueprint file offered at 11:57, not yet received | Note 44.2 |

## B.2 Owner data — before go-live (entered by the owner in the vault / Integrations screen)

| # | Item | Source |
|---|---|---|
| 4 | Google Drive (main + second add-only) for backups — **must be live before go-live** | Note 45.3; PR 8, 507 |
| 5 | Telegram bot token — **alerts must be live before go-live** | Note 45.3; PR 9 |
| 6 | extas.com.bd domain panel access; Cloudflare account (nameserver change on launch day, not before) | checklist 7–8 |
| 7 | WordPress admin and hosting access for the migration export; keep the old site running until launch | checklist 9–11; PR 587 |
| 8 | Merchant accounts and API: bKash, Nagad, SSLCommerz; Steadfast, Pathao, RedX (and their official API docs) — **start early** | checklist 24–28 |
| 9 | SMS gateway and masking sender ID (**start early**); WhatsApp Business API number; order e-mail address | checklist 21, 29–30 |
| 10 | Google (account, Search Console, Merchant Center, Ads + developer token — **start early**, Analytics/Tag Manager); Meta Business (verification — **start early**, ad account, Pixel, developer app); TikTok; YouTube | checklist 12–23 |
| 11 | ERP access (server, API/database, push access) | checklist 33; §59 answer 36 |
| 12 | AI provider keys and the monthly spend cap | checklist 34; PR 309 |

## B.3 Business content

| # | Item | Source |
|---|---|---|
| 13 | Real WhatsApp number, hotline, support e-mail, address — 10 checklist points wait on these (code ready) | checklist 35; R15d 🔒 10 |
| 14 | Trade licence number and DBID (apply for DBID if missing — **start early**) | checklist 36 |
| 15 | Facebook, Instagram, YouTube, TikTok page links | checklist 37 |
| 16 | Logo files (SVG or large PNG, phone version) and the final slogan; brand colours/fonts if any | checklist 38–39 |
| 17 | Real product photos (best sellers first) and set photos for featured combo pairs | checklist 40; C12.3 |
| 18 | Final delivery charges per band, hours, exchange policy, free-delivery threshold | checklist 41 |
| 19 | Blog: expert reviewer names per section; a care-lab person about half a day a week (otherwise no "we tested" claims); confirmation of product-story facts before they go live | Note 31.3; BLOG plan; ROUND15 13:35 |
| 20 | Who writes and approves Bengali text; which pages go Bengali first (default: home, every category, `/combos` and rules, help pages, all panjabi, top 20 product pages) | checklist 43; Google plan §6.4 |
| 21 | Go-live date (the blog calendar assumes 2 Nov 2026; Eid 2027 panjabi pages indexed by 15 Jan 2027) | checklist 44 |

## B.4 Open owner decisions

| # | Decision | Default that ships (*rec.* = Gyani's recommendation; no recorded source) | Source |
|---|---|---|---|
| 1 | Does the optional order-confirmation e-mail count inside "2 SMS + 1 WhatsApp"? | *rec.* E-mail sent only when the customer gave an address, not counted (V1 B2.5 unchanged) | Note 4.7 is silent on e-mail |
| 2 | The one WhatsApp: the register says "when the shop processes"; Doot's D09 allocation (accepted in Note 23.2) puts a 2-size check or a review request in that slot | Register: WhatsApp at processing; *rec.* the 2-size check and review request go on-site / in the account | PR 148; Note 4.7, 23.2; D09 |
| 3 | Side canvas on 1280–1366 laptops and ~1536 px: zones are small, picture-only; 1.6× cap at 1920 | As built (scale from the 1440 standard) | ROUND15 22:00 |
| 4 | Desktop: D-040 CTA style; D-042 inline size chips; D-045 form cap (waits D-010) | As built | DESKTOP-REVIEW Batch B |
| 5 | Combo defaults (L1 / P1–P3 auto / B5) and the "Move to wishlist" label for combos | Keep (owner will check) | Note 23.16–23.17 |
| 6 | "100% original" trust line next to third-party-brand stock | *rec.* Keep the line (brand names stay) | Google plan §1.8 (PR 62); Note 27.3 |
| 7 | Return-policy wording for structured data (exchange-only) | *rec.* Exchange-only wording from Rules | Google plan §6.6 |
| 8 | Brand-name collision: "EXTAS" alone or "EXTAS Menswear" in titles and social names | *rec.* "EXTAS" | Google plan §6.9 |
| 9 | Old short journal notes overlapping the new guides | Compact list after the guides; noindex in the live build | Blog QA (Shilpi / Claude decision) |
| 10 | "Was"-price source per category (MRP, price history, combo) | *rec.* No struck price until chosen (honesty rule, PR 38) | V1 F #71 |
| 11 | Wording that replaces "No return" on the Returns row | *rec.* "Exchange within the Rules window", from Rules | V1 F #68 |
| 12 | VAT and invoice format with an accountant | After launch (not blocking) | Note 23.11 |

**Carried from V1 D6.1 without a recorded ruling (the demo default ships unless the owner reopens one):** phone search
panel position (#64), desktop checkout header space (#65), footer link tap targets (#67), "Only 3 left" position (#70),
the six footer Shop links (#73), wishlist alerts (#75, default off).
'''

APP_C = '''# Appendix C · QA gate definition and test inventory

## C1. The release standard (owner, Note 21; PR 570)

**Every non-backend checklist point must PASS** on **8 phone sizes, 5 tablets in portrait and landscape, and desktop**,
on every page type (home, every category, product, combo pages, bag/add-to-cart, checkout, thank-you, account, journal),
before any release. Backend-only points are run from the real backend. "Done" needs the gate at 0 failures **and** the
screenshots looked at (lessons R14).

| Group | Sizes |
|---|---|
| Phones (8, touch, `isMobile`, real DPR) | 320×640 · 360×800 · 375×667 · 390×844 · 393×852 · 412×915 · 430×932 · 440×956 |
| Tablets (5 × 2 orientations, touch, DPR 2) | iPad mini 768×1024 · iPad Air 820×1180 · iPad Pro 11 834×1194 · iPad Pro 12.9 1024×1366 · Android tab 800×1280 |
| Desktop (real mouse/keyboard, no touch) | 1024×768 · 1280×800 · 1366×768 · 1440×900 · 1536×864 · 1920×1080 (owner's standard: at least 1280×800 and 1440×900) |
| Before launch | a real iPhone (Safari and the Claude app) and a real Android (Chrome) — the workspace has no WebKit |
| PR 600 phone apply | the 10 phone screen sizes most used in Bangladesh |

## C2. The device gate — `qa/device-matrix.js`

`node device-matrix.js <built.html> [--routes=pdp|all] [--group=phones|tablets|all] [--slice=A-B] [--json=out.json]`

- **Devices:** 15 phones from `qa/devices.json` (320×640, 360×640, 360×780, 360×800, 375×667, 375×812, 384×854,
  390×844, 393×852, 393×873, 402×874, 412×915, 414×896, 430×932, 440×956) + the 10 tablet sizes above = 25.
- **Routes:** product pages `essential-pique-polo`, `oxford-cotton-shirt`, `classic-cotton-panjabi`,
  `slim-chino-trousers`, `heavyweight-hoodie`, `everyday-crew-tee`; pages `#/`, `#/c/polos`, `#/c/new`, `#/set`,
  `#/combo/polo-duo`, `#/bag`, `#/checkout`, `#/account`, `#/journal`. The code phase maps these to live URLs (C12.1).
- **Checks:** PAGE-WIDER-THAN-PHONE, HORIZONTAL-SCROLL, STICKS-OUT-RIGHT, TEXT-CUT-OFF, TAPS-OVERLAP, JS-ERROR,
  PRICE-LINE-TWO-LINES, PRICE-LINE-CUT, PRICE-BAR-SPACING, PRICE-BELOW-FOLD, FIT-LINE-TWO-LINES, FIT-LINE-CUT,
  FIT-LINE-FIRST-HIDDEN, FIT-LINE-HOLE, FIT-LINE-NOT-CENTRED, FIT-LINE-OFFSCREEN, FIT-LINE-UNDER-BAR,
  ALL-COLOURS-OFF-LINE, ALL-COLOURS-PAST-EDGE, SWATCHES-WRAP, SIZE-ROW-BREAKS, SIZE-VALUE-NOT-BOLD,
  SIZE-CHART-PAST-EDGE, DASH-INVISIBLE, TOO-MANY-QUESTIONS-SHOWN.
- **Pass:** 0 failures. Last results: 0 of 480 (15 phones 240 + 10 tablets 240) on the R15 builds; V11 0 of 240.
  Older gates kept: `device-matrix.pre-r14.js`, `.pre-r15.js`, `.pre-tab.js`.

## C3. Phone pixel-diff guard (desktop-only work)

Before/after pixel diff of the 47 phone routes at 360 / 390 / 430 / 440 must be **0 px** (Note 34.2). Use Playwright
`animations:'disabled'` and identical route lists (history-based rows like Recently viewed change otherwise); take tap
measurements before full-page shots (a full-page shot on a mobile context switches off `pointer:coarse`). The demo's
layout builder and side canvas were proven the same way: 56/56 pixel-identical with defaults (phones, tablet,
1280/1440/1920, home + 7 categories).

## C4. Pause / resume rule

Every test that checks something stops (hover, focus, touch, popup, menu, video, slider) also checks it starts again
at the right moment; touch rules never apply to the mouse (R13; checklist L28, L29). Example: desktop sliders still on
hover, moving within 0.7 s after the mouse leaves (measured at 1366 on all four home rows).

## C5. The checklist — `qa/ECOMMERCE-CHECKLIST.md`

405 points in 23 groups (navigation & history, layout, header/footer/menus, search, category, product, combos, bag,
checkout, thank-you/tracking/invoice, account, messages & WhatsApp, performance, accessibility, forms, language,
trust & legal, analytics, SEO, security & privacy, offline & slow network, error handling, admin) plus later additions
(L28, L29). Marks: ✅ pass · ❌ fail · 🔒 blocked on owner data · ⚖ owner decision · — backend / real device · ⬜ not run.
**Final regression R15d:** 337/337 testable non-backend points pass; 10 🔒 owner data; 58 backend / real device; 0 open
decisions. (Owner's Note 21 counted 357 non-backend points before the reclassification; R15b–R15d count 347
non-backend of which 10 wait for owner data.) The checklist lives in the backend's audit runner (PR 570).

## C6. Test inventory (to re-run in the code phase)

| Suite | What it covers | Where (demo era) |
|---|---|---|
| Device gate | layout rules above, 25 sizes | `blueprint/qa/device-matrix.js`, `qa/devices.json` |
| Route sweep + journeys J1–J10 | 123–126 routes × 20 sizes; customer journeys (back/forward/swipe, PTR, reload, checkout) | `scratchpad/qa-r15b/tools/routes.js`, `journey.js`, `points2.js`–`points4.js`, `agg.js`, `aggj.js`, `r16-nav.js`, `r16-feat.js`, `r16-points.js`, `r16-taps.js` |
| Desktop QA | 104 routes × 6 widths, links, journeys, features F01–F24, phone cross-check | `scratchpad/desktop-qa/tools/sweep.js`, `clip.js`, `links.js`, `journey.js`, `feat.js`, `exwalk.js`, `phone.js` |
| Blog QA | sweep, journeys, ad slot rules, popup rules, back-end flows, contrast from real pixels, Bengali font check | `scratchpad/blog-qa/tools/sweep.js`, `journeys.js`, `ads.js`, `popup.js`, `backend.js`, `checks.js`, `run-all.sh`, `run-r2.sh` |
| Combo | verify (combo flows, B5 default, P3 for hoodie + jogger), ranking journeys, ended combo in bag | `scratchpad/verify.js`; ranking scripts per COMBO-RANKING §1; `ended-bag.js` |
| Admin | ops-test (default + blog/agent routes), ops-flow, zb-flow (blog back end, 47/47), nm-flow (naming, 50+), reg-test (register, 159/159) | demo tools; `scratchpad/regtest/` |
| Demo smoke and page tests | smoke, journeys, a–g tests, views | `scratchpad/proto/tools/smoke.js`, `journey.js`, `a-test.js` … `g-test.js`, `d-view.js`, `vshot.js` |
| Timing audit | timers, animation timings, pause/resume (Note 44.1 item 2) | `scratchpad/timing-audit/` — **in progress when V2 was written; `qa/TIMING-AUDIT.md` not yet present** |
| Admin language harvest | missing Bengali / English pairs | `scratchpad/proto/tools/extract-admin-bn.py --missing`, `--merge` |
| Register generator | register → admin data; idempotent | `scratchpad/proto/tools/make-register.py` |
| Performance (code phase) | Lighthouse budget in CI, k6 baseline, CWV field data | PR 17, 88, 10, 234 (D12) |

The scratchpad paths are the design-phase workspace; at code start the suites are ported into the repository's test
folder and run in CI, Playwright with Chromium plus WebKit where available.

## C7. Real-device checks still owed

Real iPhone Safari (buy bar safe area, edge swipe, pull-to-refresh) and a real Android Chrome before launch; the
backend-only checklist points from the real backend; payment, courier and SMS sandboxes once the owner's accounts
exist.

## C8. Gate order for a release

1. Unit and type checks, build, hardcode guard (PR 494).
2. Device gate 0 failures (C2).
3. Journeys and route sweep on the C1 sizes; desktop suite at the six widths.
4. Phone pixel-diff 0 px for desktop-only changes (C3).
5. Checklist groups touched by the change (C5), via the audit runner (PR 570).
6. Performance budgets (D12).
7. After go-live: all of the above on staging first, then deploy, with one-step rollback.

## C9. Verification of this specification

`scratchpad/v2/verify_v2.py` checks that every PR 1–600 appears in this file (and in Appendix A), that every owner
note in ROUND15 is referenced or marked "no spec change", and that the E0 stage table matches the register's stage
table row by row and in total. Its last result is recorded in Gyani's work log.
'''
