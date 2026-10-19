# -*- coding: utf-8 -*-
# Front matter for EXTAS-ECOMMERCE-V2.md (Gyani A360-01). Plain strings only.

TITLE = '''# EXTAS — E-commerce Platform Build Specification

**Version 2.0 · 19 October 2026** · written by জ্ঞানী Gyani (A360-01, chief) for the code phase

V2 replaces V1.0 (18 October 2026) as the specification the code phase builds from. V1 is kept unchanged
beside it as `EXTAS-ECOMMERCE-V1.md`. Every V1 section is carried into this file, in V1's order. Where a section
changed, a **V2 block** (a quoted paragraph starting "V2 · 19 Oct") sits directly under its heading, and any
V1 sentence that no longer holds is tagged in place **[Replaced on 19 Oct by …]**. Nothing from V1 is dropped
without a tag. Part E is rewritten for 600 PRs; V1's Part E is kept at its end as history.

**Source of truth for scope:** `master/MASTER-REGISTER.md` (600 PRs, 28 stages). Where this file and the
register disagree, the register wins and this file is wrong. Owner notes: `review/ROUND15.md` (Notes 1–46).
**Working reference:** the demo, `scratchpad/proto/src/` (built to `dist/r16.html`); demo files are cited by
name where they define behaviour.
'''

BN_SUMMARY = '''## মালিকের জন্য সংক্ষেপে

1. এটা EXTAS অনলাইন দোকানের পুরো বিল্ড-নির্দেশনা, ভার্সন ২ (১৯ অক্টোবর)। কোড লেখার সময় এজেন্টরা এটা দেখেই কাজ করবে। ভার্সন ১ যেমন ছিল তেমনই রাখা আছে, একটা অক্ষরও বদলানো হয়নি।
2. প্ল্যাটফর্মটা কী: ফোনে কেনাকাটার জন্য বানানো ছেলেদের পোশাকের দোকান। কম্বো সবচেয়ে বেশি বিক্রি হয়, ক্যাশ অন ডেলিভারি চলে, স্টক আসে আপনার ERP থেকে, আর সাতজন AI এজেন্ট রোজকার কাজ চালায়।
3. মোট কাজ এখন ৬০০টা PR, ২৮টা স্টেজে। ৫৯৪টা লেখা হয়ে গেছে। ৬টা (হস্তান্তর প্যাক) পরে হবে, যেদিন সিস্টেম অন্য কাউকে দেবেন।
4. ভার্সন ১-এর পর যা যা বদলাল:
   - হেডারে WhatsApp আইকন সব পেজে। ভাসমান WhatsApp বন্ধ, তবে সুইচ হিসেবে রাখা আছে। ব্যাগে জিনিস থাকলে ব্যাগ আইকন হালকা নড়ে।
   - প্রোডাক্ট পেজে দামের লাইন আর মাপের লাইন সব ফোনে এক লাইনে থাকে। ৫টা রং পর্যন্ত "সব রং" লিংক রঙের পাশেই থাকে।
   - ডেলিভারির সময় ঘণ্টায় দেখায়: ঢাকার ভেতরে ২৪–৪৮ ঘণ্টা, বাইরে ৪৮–৭২ ঘণ্টা। সংখ্যা ব্যাকএন্ড থেকে বদলানো যায়।
   - কাস্টমার আমাদের কাছ থেকে পায় ২টা SMS আর ১টা WhatsApp, এর বেশি না। মার্কেটিংয়ের টিক দুইটা আলাদা: SMS-এর টিক দেওয়া থাকে, WhatsApp-এর টিক খালি থাকে।
   - কাস্টমার দরজায় রাইডারের সামনে পরে দেখতে পারবে (চালু, বন্ধ করার সুইচ আছে)।
   - কম্বো: একটা স্টাইলের সব রঙের জোড়া নিজে থেকেই কম্বো হয়ে যায়। ক্যাটাগরি, প্রোডাক্ট আর ব্যাগ পেজের ৫টা করে ডিজাইন আছে, নম্বর দিয়ে সেরাটা বাছা হয়েছে। অফার শেষ হলে পেজ আর্কাইভে যায়, কিন্তু লিংক কখনো মরে না।
   - কম্পিউটারের জন্য: মেগা মেনু, ডানদিকে ব্যাগের ড্রয়ার, স্ক্রল করলেও কেনার বার থাকে, চওড়া স্ক্রিনে লেআউট ১৪৪০ পিক্সেল। ফোনের ডিজাইন একটুও বদলায়নি।
   - ব্লগ: দিনে ৩–৬টা ভালো লেখা আসবে। ৫ জন লেখক-এজেন্ট লিখবে, একজনের লেখা আরেকজন প্রুফ দেখবে। ব্লগে শুধু নিজেদের বিজ্ঞাপন থাকবে, পপআপের নিয়ম মেনে।
   - গুগল: ইংরেজি পেজ মূল ঠিকানায়, বাংলা পেজ /bn-এ। পুরনো WordPress-এর সব লিংক নতুন পেজে চলে যাবে, তাই র‍্যাংক হারাবে না। ব্র্যান্ডের নাম থাকবে (আপনার সিদ্ধান্ত), প্রতিটা প্রোডাক্টে আলাদা ব্র্যান্ডের ঘর আছে।
   - প্রোডাক্টের নাম, লিংক আর SEO টাইটেল সব ব্যাকএন্ড থেকে ঠিক করা যায়। লিংক বদলালেও পুরনো লিংক নতুনটায় নিয়ে যায়।
   - সাতজন এজেন্ট, প্রধান জ্ঞানী। টেলিগ্রামে প্রত্যেকের নাম আর কোড দেখায়। তাদের পড়াশোনা, পরীক্ষা আর শক্ত মেমরি আছে।
   - ব্যাকএন্ডে আছে: সব PR-এর তালিকা, পেজ সাজানোর টুল, দুই পাশের খালি জায়গার টুল, এক বোতামে "লঞ্চ ডিফল্টে" ফেরা। ব্যাকএন্ড ইংরেজিতে চলে, বাংলার সুইচ আছে।
   - সার্ভার: নতুন VPS (Ubuntu 24.04)। প্রথম দিনে লাগবে শুধু IP, SSH key আর GitHub অ্যাক্সেস, পোর্ট আমরাই খুলব। বাকি সব key আপনি পরে ব্যাকএন্ডে বসাবেন। তবে লাইভে যাওয়ার আগে Google Drive ব্যাকআপ আর Telegram সতর্কতা চালু থাকতেই হবে।
5. চারটা কাজ থামিয়ে রাখা আছে, কোডের সময় শেষ হবে: পুরো সাইট বিল্ডার, ইউজার ম্যানুয়াল, দুই পাশের জায়গার বাড়তি কাজ, আর পেজে দাঁড়িয়ে সরাসরি এডিট করা।
6. টেস্টের নিয়ম: অন্তত ৮টা ফোন, ট্যাবলেট খাড়া আর আড়াআড়ি দুইভাবেই, আর কম্পিউটার। সব পাস না করলে কিছু লাইভে যাবে না।
7. এরপর কী: আপনি VPS-এর স্ক্রিনশট, IP, SSH key আর GitHub অ্যাক্সেস দিলেই কোড শুরু হবে। আপনার কাছ থেকে আর যা লাগবে, তার ছোট তালিকা পরিশিষ্ট B-তে আছে।
'''

STATUS = '''## Status of each part

| Part | What it covers | V1 status (18 Oct) | **V2 status (19 Oct)** |
|---|---|---|---|
| **A** | How the build runs · server · architecture · multi-store · model policy · documents · settings framework | Locked | **Locked, updated.** New VPS (A2, Note 45); permissions in two steps (A1.1); seven agents replace the A/B/C lanes (A1.4); settings framework added as A7 |
| **E** | Stages, PR plan, numbers, order of work | Locked, one warning | **Rewritten for 600 PRs / 28 stages.** Reconciles exactly with the register (Appendix A, verification script) |
| **B** | Orders, documents, money, support, customers, security, admin | Locked | **Locked, updated.** Messages (2 SMS + 1 WhatsApp), two consent ticks, trial at the door, delivery hours, invoice editable, fraud engine without automatic blocking, PR register (B9) |
| **C** | AI 360, costs, agents, organic growth, social, studio, video | Locked | **Locked, updated.** Seven fixed agents and chain of command (C10), blog engine (C11), Google traffic plan (C12), naming and URL control (C13) |
| **D** | UI/UX | In review | **Reviewed through round 15, phone and desktop; ready for the code phase** (owner, Note 44.1). New D8 combos, D9 desktop, D10 site-building tools, D11 admin language, D12 performance budgets. **Paused items: PR 596 (extensions), 598, 599, 600** |
| **F** | Decisions still open (V1 list) | Reference | **Reference.** Each V1 question now carries its status; the live open list is Appendix B |
| **App. A** | Every PR 1–600: title, stage, status, owner, demo file | — | New |
| **App. B** | Open owner decisions and owner data still needed | — | New |
| **App. C** | QA gate definition and test inventory | — | New |

**Paused for the code phase (owner, Note 44.1, 22:38).** These are filed, partly in the demo, and finished in
code. Nobody builds on their demo state as if it were final:

| PR | What | In the demo | What the code phase still owes |
|---:|---|---|---|
| 596 | Side canvas, extensions (side zones on login and bag pages, per-size placement, Bengali sheets) | Yes, v2: `96c-layout-builder.js`, `r12-zlb.css`, `#/admin/side-canvas`, `#/preview/side-canvas`. Owner's placement (157 × 644 at 1797 × 879), 10-size editor, 16 page types, per-page switches | Tests for per-page placement, Bengali placement sheets, full gate re-run (register PR 596 "status at pause") |
| 598 | Site builder: menus, header, footer, categories, product-page blocks, content pages, theme, shimmer control, tiered bag offers | Yes, paused cleanly ~23:00: `96d-site-builder.js`, `#/admin/site` — menus (one tree → desktop row, mega menu, phone menu, bottom bar), header (announcements, icons, logo text or image + phone logo), slogan (switched **on**), footer drag-and-drop with 9 social and 10 payment icon sets + uploads, categories, 16 product-page blocks per device (buy group cannot be hidden), content pages, theme with AA contrast block, draft → preview → publish → undo, versions; default data = shop identical (43 pages markup-identical, 0 px) | Full gate re-run, Bengali dictionary merge, measured tap check at publish, phone-menu footer wiring; shimmer control and tiered bag offers to confirm against the register line |
| 599 | In-dashboard help and the handover user manual | Partly: "How to" panels and the Site manual `#/admin/manual` (25 sections) inside `96d-site-builder.js` | Coverage of every admin area; `USER-MANUAL.md` export kept with the blueprint (not exported yet) |
| 600 | On-page edit mode with phone review and the AI checker | **Not in the demo.** Plan approved 100% (Note 43.12) | All of it, on the PR 598 engine |
'''

HOW_TO_USE_V2 = '''> **V2 · 19 Oct — how to use this version.**
> 1. Scope comes from `master/MASTER-REGISTER.md`. Appendix A lists every PR with its stage and status; the
>    register's PR line is the requirement, and this file explains it.
> 2. Behaviour the owner has already reviewed is defined by the demo. When this file says "see demo
>    `42-combo-auto.js`", that file is the reference implementation to match (not to copy; the stack is
>    Next.js, see A3.1).
> 3. Paused PRs (596 extensions, 598, 599, 600) are finished in the code phase; their demo state is a start,
>    not a sign-off.
> 4. The QA gate in Appendix C replaces the single 440 × 956 screenshot rule for anything visual.
> 5. Undecided items: Appendix B lists the owner's open decisions with the default that ships. Build the
>    default as a setting, write one line in `BLOCKED.md`, keep going (V1 rule, unchanged).
> 6. Every PR is filed in the register before it is built (standard 5). The PR register page (PR 594) is
>    generated from the register on every build, so a new PR appears there by itself.
'''

WHAT_V2 = '''> **V2 · 19 Oct — what changed in the picture.** The five requirements above stand unchanged. Since V1:
> the plan grew from 473 PRs in 27 stages to **600 PRs in 28 stages** (594 active, 6 parked); the shop runs on a
> **new VPS** (Note 45), not the Azure VM described in A2; **seven fixed agents** (Gyani A360-01 as chief) build
> the code and then run their dashboard sections; the **blog becomes the main organic traffic engine** (3–6
> posts a day); **combos** get the owner's auto colour-pair model with five templates per page type; and the
> whole storefront becomes editable from the backend with guardrails (PR 595–600). **95% phone** stays the
> rule; desktop got its own treatment without changing the phone by a single pixel (Note 34.2).
'''

CHANGELOG_TABLE = '''## Change log

| Version | Date | What changed |
|---|---|---|
| 1.0 | 2026-10-18 | First complete specification. Per-stage PR counts re-derived from the 341-PR baseline and reconciled exactly to 473 (see E2). Assembled from 58 recorded decision sections covering 12 UI/UX review rounds, the server assessment, the ERP-master architecture, the support module, the photoshoot studio and the multi-store plan. Parts A, B, C, E locked. Part D in review. |
| 2.0 | 2026-10-19 | 600 PRs / 28 stages (register). Settings framework, fraud and delivery-zone engines, Parameter for Checkout (18 Oct decision rounds, PR 491–569). Round 15 (Notes 1–45): header WhatsApp, price row, delivery hours, messages and consent, trial at the door, combos (PR 571–576), desktop, blog engine (PR 591–593), Google traffic plan (PR 586–589), naming and URLs (PR 590), PR register (PR 594), page and site building (PR 595–600), seven agents (PR 577–585), admin in English, QA standard. New VPS (Note 45). Part D reviewed through round 15. Permissions now come in two steps (replaces A1.1 rule 2). New section "How changes are made after V2" (Note 46, PR 594). |

### V1 → V2 change log, by area

Each line: what changed · PR · where it came from. "§59" = the 18 Oct decision round in `PENDING_CHANGES.md`
(answer numbers match V1 Part F question numbers); "§60" = the 18 Oct delivery-zone round; "Note" = ROUND15.

**Server and build rules**

| Change | PR | Source |
|---|---|---|
| New VPS created fresh with Ubuntu 24.04 LTS; the old Azure E8ds v4 sections apply to the old VM only | 1, 2 | Note 45 · PR 1–2 |
| Ports 22/80/443 opened by us (server firewall over SSH; provider panel with the owner's login or step-by-step guidance) | 3 | Note 45.2 · PR 3 |
| Permissions in two steps: day 1 = VPS IP + SSH key + GitHub access; everything else entered later by the owner in the vault / Integrations screen; Drive backup and Telegram alerts on **before go-live**. Replaces V1 A1.1 rule 2 | 493, 500, 8, 9 | Note 45.3 · PR 493/500 |
| Settings framework: typed registry, two-tier resolver, credential vault, hardcode guard in CI, role builder, settings migration, integrations screen, default pack, "my own data" register, reset to default | 491–496, 500, 508–510 | Settings-driven instruction, 18 Oct |
| Branding and language from settings; both languages live; admin in simple English by default with a Bengali switch | 501, 503 | 18 Oct · Note 37.3 · PR 503 |
| ERP becomes optional: mode switch, generic adapter, ERP-absent guard; no-ERP stock module parked as S27 | 497–499 | 18 Oct decision |
| Handover pack (installer, setup wizard, clean-install check, inline help, bilingual guide, update distribution) parked as S26 | 513–518 | 18 Oct decision |
| Demo-only helpers (sample logins, reviewer hints) behind `?demo=1`, never shipped | 509 | Note 41.2 |
| Blueprint kept as versioned files (V1, V2 …), latest marked latest inside the PR register page | 594 | Note 33.2 · PR 594 |
| Change process after V2: register and blueprint in the repo `docs/`, change notes CN-###, scope-first filing, placement rules, V2.1/V2.2 versions, staging + gate after go-live, wave briefs | 594 | Note 46 · PR 594 · review/CHANGE-PROCESS.md |

**Plan size and staging**

| Change | PR | Source |
|---|---|---|
| 473 PRs / 27 stages → 600 PRs / 28 stages (S26 added; S27 parked, unnumbered) | all | Register stage table |
| The 12 mis-filed PRs re-filed (page builder and label dictionary S08 → S02; category SEO S10 → S11; invoice templates S14 → S20; celebration overlay S19 → S02; user manual S20 → S18; Find My Size S23 → S02) | — | Register ("The 12 that moved"); closes V1 E2 point 1 |
| PRs 586–594 re-staged into their real stages; stage counts fixed | 586–594 | Note 33 (done 15:45) |

**Storefront, phone (round 15)**

| Change | PR | Source |
|---|---|---|
| Header WhatsApp icon on every page (same glyph; hover tip "Need any help"; soft glow, no flicker); checkout shows it in the header only after the in-page help block scrolls away; floating disc kept as a switch, off | 40, 70 | Note 2.4, 3.1–3.3 · PR 70 |
| Bag icon bigger, pulses in header and bottom bar when the bag has items; icon gaps 2 px smaller; heart tried in the header (kept, hides on too-narrow phones) | 40 | Note 3.4, 3.5 |
| Heart right after the product title; share icon switched off (kept); floating icon column retired by default | 68, 69 | Note 2.3, 3.7 |
| "All N colours": up to 5 colours after the last swatch on the swatch line; from 6 on the colour label line | 55 | Note 2.2 |
| Fit line under the sizes always one line; fields hide from the end, first field always stays | 53, 56 | Note 2.5 |
| Price row: price · discount stack · second bar · free delivery (or the owner's text), always one line; second bar shown per product / offer / campaign | 61 | Note 2.6, 3.10 |
| Buy bar never sinks under the screen edge (safe-area padding, no pull bounce) | 85 | Note 2.1 |
| Add to Bag a near shade of Order Now (one family) | 49–51 | Note 3.11 |
| Home hero buttons: labels, links, style, on/off from the backend; "Shop sets" uses the v3 brand tint | 41, 76 | Note 1.1, 3.12 |
| Search answers help words (delivery, return policy, exchange policy), typos, Bengali | 72 | Note 4.1, 36 |
| Full-screen photo zoom showing the full original image | 24, 54 | Note 13.1 |
| Pull-to-refresh on every page type; one history model: Back goes exactly one page to the same scroll, never blank, never home | S02 shell (no PR named) | Note 6.1, 4.6, 7.1, 12.2, 12.3 |
| Footer "Size guide" opens the size finder over the current page | 58 | Note 12.1 |
| Sliders: snap after a hand drag, auto-drift stays; on desktop they restart the moment the mouse leaves | 42 | Note 23.12, 39 |
| Footer brand block (slogan under the E), newsletter Join, "Text us on WhatsApp", WhatsApp / Hotline layout | 40, 501 | Note 1.2–1.4, 35.6 |
| Same size added twice: "already in bag" by default, quantity +1 as a settings option | 110 | Note 23.13 |
| Bag page polish and tiered "Take 2 / 3 / 4" offer box | 107, 109, 598 | Note 43.3–43.10 |
| Any link to the page you are on (e.g. the logo on home) scrolls to the top | 598 (global fix in demo `99-boot.js`) | Note 42.3 |

**Checkout, orders, messages, customers**

| Change | PR | Source |
|---|---|---|
| Delivery time shown in hours per band (inside Dhaka 24–48, outside 48–72), editable; same line on checkout, thank-you headline, help answers | 550, 119, 126 | Note 4.2, 4.3, 36 |
| Three charge bands, national gazetteer, ambiguity resolver that waits for the whole line, autocomplete with parent and price, accuracy guard, courier zone sync | 549–554 | §60 |
| Phone-first recognition, in-transit duplicate notice, duplicate turned into an exchange, phone-entry risk check, multi-courier fraud data, flag outcome report | 555–557, 559, 562, 567 | §60.7–60.12 |
| Parameter for Checkout: advance-payment mode on the same page; no order held over an address; free delivery exempt; support explanation; silent address backfill | 558, 560, 561, 563, 565, 566 | §60.8–60.12 |
| Duplicate and fraud engine with **no automatic block**: identity graph, rules engine (cancel · hold · warn · allow), alert card, bundling, block proposals, false-positive protection, approval digest, one-click advance request, decision learning, rule switches, new-customer call queue | 519–524, 540–546 | §59 answers 1–5, 44 · §59.2 |
| Customer messages: SMS when placed, SMS when the shop confirms (courier booked), one WhatsApp when the shop processes, nothing after; later steps are switches, off | 148, 505 | Note 4.7, 23.2 · PR 148/505 |
| Two marketing consent ticks: SMS ticked, WhatsApp separate and unticked; stored separately on order and customer | 123, 148, 298, 505 | Note 23.1 |
| Trial at the door: the customer may try in front of the rider (setting, on) | S08 setting | Note 23.9 |
| Invoice: every word and block editable from the backend | 407, 409 | Note 4.4 |
| Account: order number clickable, invoice download icon; desktop shows three offers from different categories' top sellers | 131, 132, 134, 136 | Note 4.5, 4.8 |
| Admin shows full phone numbers; every profile open and number copy is logged; address rule PR 561 unchanged | 284–286 | Note 24.1 |
| True-delivery reconciliation, charge mismatch log (no correction, no message), return-reason capture | 525, 526, 564 | §59 answer 44 · §60.13 |
| Customer history summary, grading, legacy import | 533–535 | §59 answers 25, 44 |

**Combos**

| Change | PR | Source |
|---|---|---|
| Combos get their own simple admin section | 90 | Note 9.1 |
| Picture taps never leave the combo page | 93 | Note 5.1 |
| Auto colour-pair combos (2 / 3 piece, evergreen, "no single piece here", add 1 more → 3 pcs) | 571 | Note 10, 11 |
| Combo lifecycle: optional dates, auto-end, ended pages stay live with alternatives, Archive tab, URLs never die | 571 | Note 25 |
| Combo SEO: fixed colour order in the slug, reverse order 301s, featured pairs indexed, others noindex,follow | 571 | Google plan N4 |
| Five templates each for combo category (L1–L5), combo product (P1–P5), combo in the bag (B1–B5) | 572–574 | Note 8, 11.2 |
| Set photo composed from each piece's photo | 575 | Note 8 |
| Template test matrix and 100-point ranking; winners applied (L1, P1/P3 auto, B5) | 576 | Note 8 · COMBO-RANKING |

**Desktop**

| Change | PR | Source |
|---|---|---|
| Data-driven mega menu (Combos, Sets, Journal; More for hidden categories); 1440 content at ≥ 1536; 4-column footer with contact block; header loops max 3 rounds | 40, 74 | Note 34 · DESKTOP-REVIEW |
| Desktop sticky buy bar; right-side "Added to bag" drawer (420 px); Order Now above the fold at 1024–1366; rows fill; sticky checkout summary | 49–51, 106, 115 | Note 34 · DESKTOP-REVIEW |
| Hero text aligned to the content edge, slides dissolve into the panel (140 px); reviews one row of 3 | 41, 43, 65 | Note 35.1–35.3 |
| Category filters built from the category's own products | 46 | Note 35.7 |
| Page layout builder (home and every category) | 595 | Note 35.4, 35.8 |
| Side canvas in the desktop gutters | 596 | Note 35.5, 37, 38, 42.6–42.8, 43.1–43.2 |
| Launch default and named snapshots | 597 | Note 37.2 |
| Site builder with guardrails (paused) | 598 | Note 40, 41, 42.2, 42.4, 43.5, 43.10 |
| In-dashboard help and user manual (paused) | 599 | Note 42.5 |
| On-page edit mode with phone review and AI checker (paused, not in demo) | 600 | Note 43.11, 43.12 |

**Google, SEO and naming**

| Change | PR | Source |
|---|---|---|
| English at `/`, Bengali at `/bn` live for every page that passes the translation gate; hreflang; own canonical per language | 220, 236, 503, 588 | Note 23.3, 27.1 |
| Hash-to-real-URL forwarder for old demo links | 586 | Google plan N1 |
| WordPress → new site migration on extas.com.bd: every old URL 301s to its twin | 587 | Note 26.1, 27.2 |
| Merchant Center feed and Bangladesh test after go-live | 589 | Note 23.4 |
| FAQ rich results ended for all sites on 7 May 2026: FAQ content stays, markup optional | 224 | Google plan F-notes |
| Product naming and URL control; brand field per product; brand names stay; slug change auto-301s | 590 | Note 26, 27.3 |
| Permanent URL policy (nothing ever 404s once it existed) | 527 | §59 answer 8 |

**Blog**

| Change | PR | Source |
|---|---|---|
| Blog is the main traffic engine: 3 and up to 5–6 posts a day, topic list, writer → another author proofreads → Gyani business facts → Doot final SEO | 591, 244 | Note 28 |
| Blog as a complete section with house ads only and popup rules | 592 | Note 30 |
| Five author agents A360-08…12 under Doot, honest bylines, reviewer names from the owner | 593 | Note 31 |
| Blog brief form, source-link writer, seasonal lifecycle, image sourcing (own photos first; AI generation asks every time) | 528–530, 547 | §59 answers 11–14 |

**Analytics, agents and AI**

| Change | PR | Source |
|---|---|---|
| Owner's event list (search terms, WhatsApp clicks by page and button, bag → purchase, Order Now, removes and re-adds, offer adds, All N colours, size chart, wishlist, logged-in vs guest) | 338, 339 | Note 3.13 |
| Checklist audit runner in the AI section (one click or scheduled, Telegram report, fixes only with permission) | 570 | Note 14, 21 |
| Agent 360° profiles, appraisal reports, curriculum and certification | 577–579 | Note 15, 16, 18 |
| Model auto-suggest with free-model qualification | 580 | Note 17 |
| Seventh agent Tirondaj (ads) with code-enforced guardrails; strong agent memory | 581, 582 | Note 18 |
| Chief agent Gyani; Telegram identity and command routing | 583, 584 | Note 19 |
| Continuous learning engine for Tirondaj and Doot | 585 | Note 20, 22 |
| PR register inside the backend | 594 | Note 33 |
| Geography analytics and geo-led ad guidance; market intelligence; full campaign control; deep conversion feed | 568, 569, 548, 531, 532 | §59 answers 18–21 · §60.14 |
| Per-style profit (simple screen, smart internals); expenses entered here; VAT system present, off | 536, 537 (S16) | §59 answers 21–25 · §59.2 |
'''

NOTE_COVERAGE = '''### Round 15 notes → where they landed

Every owner note in `review/ROUND15.md` is either in this specification or marked "no spec change".

| Note | Topic | Landed in (V2 section · PR) |
|---|---|---|
| Note 1 | Home hero "Shop sets" tint, footer slogan, newsletter Join, WhatsApp/Hotline wording | D3.3, D3.18 · PR 41, 40, 501 |
| Note 2 | Product page on a real iPhone: buy bar safe area, All N colours rule, heart + share off, header WhatsApp, one-line fit and price lines, size chart waived, spacing | D2, D3.1, D3.5 · PR 53, 55, 56, 61, 68, 69, 85 |
| Note 3 | Header WhatsApp everywhere, checkout exception, glow, bag pulse, Buy-together bug, title fill, price row second bar, Add to Bag colour, hero buttons, analytics list, combo audit | D3.1, D3.3, D3.5, D5, D8 · PR 40, 61, 76, 338, 339 |
| Note 4 | Help-word search, delivery hours, thank-you headline, invoice editable, account order link + invoice, back to the bag, two SMS + one WhatsApp, desktop three offers, standing order 03:34 | D3.2, D3.12, D3.13, D3.15, B2.1, B2.5, D1.9 · PR 72, 550, 126, 407, 409, 134, 136, 148, 505, 132 |
| Note 5 | Answers in Bengali; combo picture taps; more combo layouts | D1.9, D8 · PR 93, 572–574 |
| Note 6 | Pull-to-refresh (6.1); final report (6.2 — no spec change) | D3 V2 block (demo `09-ptr.js`) |
| Note 7 | Swipe-back blank page, jolts, Save for later | D1.2 (history rule), D3.11 |
| Note 8 | Combo focus: category page, 4–5 templates per page type, testing, ranking, set photos | D8 · PR 571–576 |
| Note 9 | Separate easy Combos section in the backend | D8 · PR 90 |
| Note 10 | Owner's WordPress combo model, auto colour pairs | D8 · PR 571 |
| Note 11 | 6-colour example + journeys; templates for every combo kind; 11.3–11.4 version boundary and morning report (no spec change) | D8 · PR 571–576 |
| Note 12 | Size guide link, back scroll, back sequence, the big checklist | D1.2, D3.18, App. C · PR 58, 570 |
| Note 13 | Full-image zoom; 13.2 "nothing dropped" (no spec change) | D3.5 · PR 24, 54 |
| Note 14 | Checklist audit runner in the AI section | B7.3, App. C · PR 570 |
| Note 15 | Backend demos; same fixed agents; 360° profiles | C10 · PR 577 |
| Note 16 | Outside skills in the library; agent reports; degree-level skills | C10 · PR 321, 578, 579 |
| Note 17 | Model auto-suggest, free models only at equal quality | C1.5, C10 · PR 580 |
| Note 18 | Editable profiles; teaching starts; seventh agent (ads); dashboard not a third-party tool; strong memory | C10 · PR 577, 579, 581, 582 |
| Note 19 | Chief agent; shared Telegram with identity; command routing by name or code | C10 · PR 583, 584 |
| Note 20 | Tirondaj and Doot as power agents, continuous learning, practice tasks, paid tools | C10 · PR 585 |
| Note 21 | QA standard: all non-backend points pass on 6–8+ phones, tablets, every page type | App. C · PR 570 |
| Note 22 | Temporary e-mails for free trials — refused; TRIAL-PLAN instead (no spec change) | C10 (learning sources) |
| Note 23 | Owner answers: consent ticks, message counting, /bn, Merchant Center, Use in combos, ceiling, trial at the door, barcodes, VAT, slider snap, quantity option, V11/V12 | B1, B2.5, B5.7, C12, D3.3, D3.11, D8 · PR 148, 505, 220, 589, 42, 110 |
| Note 24 | Full phone numbers in admin, views logged; combo rule "cannot be deleted" explained | B5.1, D8 · S14 |
| Note 25 | Combo rule lifecycle: never delete, auto archive, link stays live | D8 · PR 571 |
| Note 26 | extas.com.bd is his; naming and URLs in the backend | C12, C13 · PR 587, 590 |
| Note 27 | English first, /bn as proposed; WordPress 301s; brand names stay | C12, C13 · PR 220, 587, 590 |
| Note 28 | Blog as the traffic engine; quality is the agents' job | C11 · PR 591 |
| Note 29 | More agents in parallel; blog shown in V12 (process; no spec change beyond PR 592) | C11 |
| Note 30 | Blog full section with house ads | C11 · PR 592 |
| Note 31 | Several author agents; idle cost; reviewer names | C11 · PR 593 |
| Note 32 | Blog reviewed in one go across devices (process) | App. C (blog QA harness) |
| Note 33 | PR register in the backend, files, automatic updates | B9 · PR 594 |
| Note 34 | Desktop finished by agents; phone must not change | D9, App. C (phone pixel-diff guard) |
| Note 35 | Owner desktop review: hero, slider fade, reviews row, layout builder, side gutters, footer, filters | D3.3, D3.4, D3.18, D10 · PR 41, 46, 595, 596 |
| Note 36 | Trust test on the search complaint (no spec change; found the hours gap, fixed) | D3.2 |
| Note 37 | Side canvas yes, launch default, admin English, zones, float, blend, animation, scaling, AI templates | D10, D11 · PR 596, 597, 503 |
| Note 38 | Side canvas speed, AI asset reuse, walk-out template | D10, D12 · PR 596 |
| Note 39 | Desktop sliders resume at once | D1.2, App. C · PR 42 |
| Note 40 | Whole site dynamic like WordPress + Elementor | D10 · PR 598 |
| Note 41 | Dynamic with guardrails; demo login helper hidden | D10, A7 · PR 598, 509 |
| Note 42 | Token breakdown (42.1, no spec change); logo image + slogan; logo click to top; footer drag-and-drop; manual; side-canvas placement rules | D3.1, D10 · PR 598, 599, 596 |
| Note 43 | Bag review; side zones on every page with gutters; on-page edit mode | D3.11, D10 · PR 596, 598, 600 |
| Note 44 | Pause site builder and side-canvas extensions; server file not received; canvas paused cleanly | Status table "Paused", App. B · PR 596, 598 |
| Note 45 | New VPS; we open ports; keys later in the backend | A1.1, A1.2, A2, App. B · PR 1–3, 493, 500 |
| Note 46 | How later changes get in (while coding, after go-live, six months later) | "How changes are made after V2" · PR 594 |
'''

RESOLVED = '''## Resolved conflicts

Where V1 (or an older record) and the register (or a later owner ruling) disagree, the newer one is built.
Each conflict is listed so nobody "fixes" the spec back to the old answer.

| # | V1 / older record said | Now built (and why) |
|---|---|---|
| 1 | A2.1–A2.4: keep the existing Azure E8ds v4, Ubuntu 20.04, in-place upgrade, "the package must not change" | **New VPS with Ubuntu 24.04 LTS** (register PR 1–2, Note 45). A2.1–A2.4 apply to the old VM only |
| 2 | A1.1 rule 2: one single permission collection at the very start | **Two steps**: day 1 = IP + SSH key + GitHub; before go-live = Drive backup + Telegram alerts on; everything else entered by the owner in the vault (Note 45.3, PR 493/500) |
| 3 | A1.2: the owner hands over IP, sudo user and SSH key or password | Day 1 is **IP + SSH key** (plus GitHub). We create the deploy user ourselves (Note 45.1, OWNER-PRECODE-CHECKLIST) |
| 4 | A4 open question / F #39: the owner opens 80/443 in the portal himself | **We open ports 22/80/443** (PR 3, Note 45.2) |
| 5 | A2.5: V1's own ten-PR list for S0A (access, OS upgrade, LVM disk layout, kernel tuning, runtime, tuning, backup, restore, monitoring, baseline) | **Register PR 1–10 numbering wins.** V1 items without their own register PR are carried as scope: LVM separation and swap → PR 3/4; kernel and network tuning → PR 5; tested one-command restore → PR 8; `docs/SERVER.md` and dashboard hooks → PR 10 (Gyani mapping, for Prohori to confirm) |
| 6 | F #6 "`/en` default with `/bn`"; §59 answer 6 "drop `/bn`, English only"; PR 503 "one language ships live" | **English at `/`, Bengali at `/bn` live per page behind the translation gate** (PR 220, 503, 588; Note 23.3, 27.1) |
| 7 | D3.12: one "Send me offers" tick, on; owner ruling 18 Oct (PHONE-REVIEW): every such box ticked by default | **Two ticks: SMS on, WhatsApp separate and off** (PR 148/505, Note 23.1). Other boxes keep the 18 Oct "ticked by default" rule |
| 8 | D3.3 / D3.4 / D4.1 `fab.whatsapp` On; PR 70 floating WhatsApp; F #62 position question | **Header WhatsApp on every page**; floating disc kept as a switch, **off** (Note 3.1) |
| 9 | D4.1 `pdpIcons.share` On, `pdpIcons.panel` On | **Off** — heart after the title, WhatsApp in the header (Note 2.3, 2.4; demo `02-core.js` SHOWN) |
| 10 | D3.12: "only two zones", "Dhaka city ৳60 · Outside Dhaka ৳120", courier zone mismatches corrected into the gazetteer | **Three bands** with a national gazetteer (PR 549–553); charge never computed from free text; courier mismatches only **logged** (PR 564) |
| 11 | Delivery promise "usually 1–4 days" (and "1–2 / 2–4 days" in help) | **Hours per band**, from settings everywhere (Note 4.2, 36) |
| 12 | B2.5: email is the guaranteed channel; WhatsApp optional per order | **Default send rule: 2 SMS + 1 WhatsApp, then nothing** (PR 148/505, Note 4.7). Email is not covered by Note 4.7 → Appendix B |
| 13 | B2.5 / F #45: WhatsApp invoice PDF or JPG as an owner setting | **Full-page JPG image by default**, still a setting (§59 answer 45) |
| 14 | F #50: anonymise inactive customers after 3 years | **Customers are never auto-deleted**; only IP and GPS expire at 180 days (PR 302, §59 answer 50) |
| 15 | F #1–5 defaults (owner + manager blacklist; drop the GPS button; COD off after 3 returns) | Register PR 156–163, 519–545: **no automatic block anywhere**; customer-facing staff may blacklist; GPS button stays, default on; repeat refusers per case (§59 answers 1–5, §59.2) |
| 16 | F #11–13: owner approves each post for a month; 2 articles a week; no post on a new product | **Owner approves the topic list**; 3–6 posts a day through the agent pipeline; a new product triggers a post (PR 244, 591; §59 answer 12; Note 28) |
| 17 | F #14: blog Bengali first | **English pages are the most important**; Bengali twins publish through the translation gate (Note 27.1, PR 588) |
| 18 | C3.1: eleven functional agents; A1.4: three build lanes A/B/C | **Seven fixed agents** A360-01…07 plus five blog authors A360-08…12; the eleven jobs are mapped to them in C10 (PR 577, 581, 583, 593) |
| 19 | A6.1 / B2.6 / V1 header: one file, the version moves inside it | **Versioned files side by side** (V1 frozen, V2 current); the PR register page marks the highest version as latest (PR 594) |
| 20 | F #58: offer "Continue with Facebook" login | **No Facebook login** (§59 answer 58); birthday marketing stays parked |
| 21 | F #31: mandatory 2FA for admins | **2FA present, not mandatory**; the owner decides (§59 answer 31) |
| 22 | F #28: lawyer review of policy pages | **No lawyer required**; Claude drafts, the owner edits from the backend (§59 answer 28) |
| 23 | F #29: pre-order advance capped at 10% | **Percentage per product**, defaults present (§59 answer 29) |
| 24 | C4.2 / C4.6: FAQPage schema as a rich-result lever | **FAQ rich results ended for all sites on 7 May 2026**; FAQ content stays, markup optional (PR 224) |
| 25 | Google traffic plan F2/N6: drop third-party brand names; schema `brand` always EXTAS | **Brand names stay**; each product has a real brand field (EXTAS only for own-label); the "other brand" warning is a setting, off (PR 590, Note 27.3) |
| 26 | D3.12: return/exchange charge sentence on checkout | **Return note on the thank-you page and My Account → Orders only, not on checkout** (owner ruling, PHONE-REVIEW 18 Oct). The door note and trial-at-the-door line stay on checkout |
| 27 | PR 244: owner approval queue per post | **Topic-list approval**, posts approved by a second author agent, never the writer (PR 244 as updated, PR 591, 593) |
| 28 | B7.5: user manual in plain Bengali | **Simple English and Bengali** (admin is English by default with a Bengali switch) — PR 599, PR 503 |
| 29 | PR 117: Dhaka gazetteer of 140+ areas | **National gazetteer** (PR 549); the Dhaka list is part of it |
| 30 | V1 A1.6: plan sized for ~409 PRs | 600 PRs; the timeline is not re-derived in V2 (see A1.6 V2 block) |
| 31 | Register PR 574 line: "B2 sizes editable in the bag (default)" (filed ~05:00) | **B5 is the default** (B2 behaviour with 1–2 combos, one compact line from 3): the ranking applied it at ~09:00 and the owner said to keep the current defaults at 11:39 (Note 23.16). The register line should be updated to match (Prohori) |

**Register wording notes (no scope effect, for Prohori to tidy):** the register sub-heading "How this reached 582"
now ends at 600; the line "total stays 569" in the round-15 scope paragraph is a leftover; PR 570's heading says
"round 15 note 17" while ROUND15 files it under Note 14 (Note 21 sets its standard). PR 577 still says "six fixed
agents" (seven since PR 581). The header says "594 are built"; in the register "built" means **filed and specified**,
not coded.
'''

RULINGS = '''## Owner rulings and standing instructions in force (to 19 Oct, 22:54)

| Ruling | Source |
|---|---|
| Brand names stay in product names; real brand field per product; owner accepts the trademark risk | Note 27.3 · PR 590 |
| Marketing consent: SMS tick on, WhatsApp tick separate and off | Note 23.1 |
| Default messages: 2 SMS + 1 WhatsApp per order, nothing after | Note 4.7, 23.2 |
| Trial at the door allowed (setting, on) | Note 23.9 |
| Barcodes internal / courier; no GS1 | Note 23.10 |
| VAT and invoice format after launch with the accountant; backend must have no gaps | Note 23.11 |
| Same size twice: "already in bag"; quantity +1 as an option | Note 23.13 |
| Sliders keep auto-drift, snap after a hand drag; desktop resumes the moment the mouse leaves | Note 23.12, 39 |
| Combos never deleted; offers end into an archive; URLs never die | Note 25 |
| "Use in combos" ticked on a new product, as an option | Note 23.5 |
| An ad budget approval above the daily ceiling stays blocked until the ceiling is raised | Note 23.7 |
| Admin shows full phone numbers; views and copies logged | Note 24.1 |
| English pages first; Bengali at /bn; WordPress links 301 | Note 27.1, 27.2 |
| Blog quality is the agents' job; the owner approves topics only | Note 28.3 |
| Desktop gets its own treatment; phone must not change | Note 34.2 |
| Side canvas will be turned on; master switch stays (off = today's look) | Note 37.1 |
| Everything dynamic, with guardrails (grid, not pixels) | Note 41.1 |
| Fix every bug without asking; for design choices pick one, apply it, keep 2–3 pictures | Note 4 (03:34) |
| Answers and picture labels in simple Bengali | Note 5.0 |
| Nothing the owner asks to remove is deleted — it becomes a switch, off by default | standing (lessons/ALL.md) |
| Nothing hardcoded; the owner's own data never ships to another installation | standing · PR 494, 509 |
| The same fixed agents from design to the live dashboard; skills never re-taught | Note 15.2 |
| Thank-you page password line stays as is (alignment only) | PHONE-REVIEW 18 Oct |
| Pause site builder and side-canvas extensions until the code phase | Note 44.1 |
| New VPS; we open the ports; keys later in the backend; Drive backup + Telegram before go-live | Note 45 |
| Later changes go through the register, change notes and versioned blueprints; no GitHub needed by the owner | Note 46 · PR 594 |
'''

CHANGE_PROCESS = '''## How changes are made after V2

*Owner, 19 Oct 22:54 (Note 46). Source: `review/CHANGE-PROCESS.md` (Bengali) and the PR 594 register line.
This is part of PR 594. It applies while the code is being written, after go-live, and months later.*

**One source of truth.** The master register (what each PR does) and the blueprint (this file and its later
versions) are the only sources. From the first code day both live in the repository's **`docs/`** folder,
next to the code. Every deploy regenerates the admin's **PR register** and **Blueprint & files** tabs from them
(PR 594), so the owner never has to open GitHub. **The build agent re-reads the register before every PR**, so
whatever is in the register is what gets built, and nothing is lost between chats.

**1. A new idea while the code is being written**

1. The owner says it in chat, writes it in the PR register's **"request a feature / request a change"** form, or
   sends it on Telegram to the chief (Gyani, A360-01).
2. Gyani first checks whether it is **scope on an existing PR**. If it is, that PR gets a dated "updated" entry.
   Only if no PR covers it does it take the next free PR number (the register's rule: no new PR without need).
3. A **change note** is written, numbered **CN-001, CN-002 …**: what was asked (in the owner's words), which PR,
   which stage, the owner's decision, the date.
4. Where it is placed:

| The affected part is … | Placement | Effect on running work |
|---|---|---|
| A PR **not built yet** | Added to that PR's scope; the agent builds it with the new instruction when it gets there | None |
| A PR **already built** | Goes on the **change queue**; picked up after the current wave ends | Nothing breaks mid-wave |
| An **urgent bug** | A separate small PR at once | Fixed now |

5. The blueprint version moves forward: **V2 → V2.1 → V2.2 …**, each with a dated change log at the top.
6. The admin's "What's new" tab and the bell show which PRs were added or updated.

**2. After go-live.** The same path, with two more steps:
- The change is built and tested on **staging** (a separate test copy) first, through the full gate in
  Appendix C: phones, tablets, desktop, and the before/after phone pixel comparison.
- Only after it passes is it deployed; if something goes wrong, **one-step rollback** to the previous version
  (A1.5 gated deploy, PR 391–403).
- Layout, text, offer and menu changes the owner makes himself in the site builder or the on-page edit mode
  (PR 598, 600) need **no PR**; they are kept in those tools' version history only.

**3. A large new plan six months later**

1. The owner raises it in any chat. Whether or not that chat remembers anything, the register and the latest
   blueprint are in `docs/` (and downloadable from the admin), and work starts by reading them.
2. The plan is filed as new PRs (or a new stage) in the register; PR 594 shows by itself which earlier PRs it
   builds on.
3. The code gets a **small brief file** for that work only (for example "V2.7" or "Wave X brief"). The whole
   blueprint is not rewritten, but the main blueprint's version is bumped at the same time.
4. When the work is done, each PR's status becomes "built" (in code / live) with its date in the admin.

**In one line:** idea → register (scope on an existing PR, or a new PR) → change note CN-### → placed in the
right queue → built and tested → new blueprint version → visible in the admin. At no step does the owner need
to read code or open GitHub.
'''
