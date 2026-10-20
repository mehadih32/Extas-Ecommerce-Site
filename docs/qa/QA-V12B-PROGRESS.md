# QA V12b progress log (reviewer 3, started 20 Oct 09:17)
Rule: append after every chunk. On restart read the last line and continue.

## 0. Start
- No log existed. Previous reviewer edits found (marked "QA V12b"): 03-layout demoToolsOn gate (?demo=1) + 98-intro gate; r12-zzz-qa.css (desktop demo tab at left edge mid-height; summary short name; pdp chip/label); 01z (test) tags removed; 20-home journal dedupe bn twin; 50-bag short name auto-fit; 71-pages contact phone K10; 96c SC-02b leave handler step(true). Reviewed: all look correct. node --check all JS: OK.
- Previous out2 logs: totals OK, fixD 19/0, fixE 49/0, recent 20/0, zoom 59/0; combo-fix verify crashed (browser closed = machine restart) -> rerun.
## 1. Leftovers (09:35)
- (a) demo gate: tools3/c1-demo.js 1366/1920/768/393: visitor sees no gear/no welcome; ?demo=1 shows it; gear overlaps nothing in footer. FOUND+FIXED: "Hide demo controls" did not work while the address had ?demo=1 (next redraw re-enabled it) -> 03-layout demo-hide now strips demo= from the URL. 20/0.
- (b) Bengali leaks: previous reviewer added dict entries (98b) for 85-admin-combos "একই রঙ…" and 89w settings group; crawl-en-1366 (08:39) bn=0 on 240 states. To recheck in chunk 5.
- (c) owner-answers fail = stale expectation (raw p.stock vs stockOf after earlier orders); test fixed by previous reviewer, oa.log ALL PASSED. Agree. Rerun in gates.
- (d) SC-02b: both fixed by previous reviewer — code (96c leave handler turns synchronously, step(true)) + test times inside page. Rerun in gates.
- NEW seen: footer tagline "Menswear · Made in Banglade…" cut at 1366 (to fix in chunk 2/6).
## 2. H1–H14 at 1366+1920 (09:55) — tools3/c2-home.js, c2-opts.js, q-join.js, q-logo.js
- H1 PASS (text left same 95/240; media +112 px). H2 PASS (gap 16 px, lines under buttons; probe flagged an empty separator — visual check OK). H3 PASS. H4 PASS (4 arrangements, no cut). H5 PASS (lgs-1..10 distinct). H6 PASS (dropdown, not full width). H7/H10 PASS (3+3 + tall tile, red price chips; screenshot). H8 PASS (words editable, tiles from sg_cats). H9 PASS (switch both ways). H11 PASS (struck price red, save bold red). H12 PASS (4 fixed, no arrows, no dupes). H13 PASS (4 social icons, no cut after my slogan fix). H14 PASS (desktop join: 1 digit refused with message; +880/Bengali accepted, cleaned).
- FIXED: footer slogan cut "Banglade…" (r12-zzz-qa.css, brand row wraps).
- Taste: hero first product chip sits half over the green-to-photo fade; demo placeholder label wraps a lone "]".
## 3. C1–C6, P1–P8 (10:25) — tools3/c3-catpdp.js + B tests
- B tests on v12b: zoom 59/0, recent-timing 20/0, video 37/0 (4 INFO: YouTube blocked here).
- c3-catpdp 1366+1920: 50/2 each; the 2 = Panjabi uses template T2 (photo grid, no thumbs; buy column stays in view so no sticky bar) = by design, not bugs.
- C1 PASS (side card), C2 PASS (read-through, plain English), C3/C5 PASS (6 cats: filters + set box + 24–33 products), C4 PASS (same box everywhere), C6 PASS (video test). P1 PASS (photo bottom 748/768), P2 PASS (care card; Panjabi generic "Care & washing" has no read time = info), P3 PASS (review cards 285 each), P4 PASS, P5 PASS (grid of 4), P6 PASS (T1), P7 PASS (zoom 59/0), P8 PASS.
- FIXED: category set box "Pick any of these" cut names "Heavyweight Hoodi…" (owner-B CSS had ellipsis) -> r12-zzz-qa.css wraps, desktop only.
- Taste: size label indented 5 px vs Colour label (deliberate --pdp-sp padding).
## 4a. K tests (10:55): K9 ALL PASSED (2109), K10 ALL PASSED (310), K11 + totals ALL PASSED (65) on v12b.
- FIXED: Find my size told shoppers "we match you to our Hoodie · Regular S–3XL (test) size chart" — "(test)" removed from 7 sample chart names in 01z (backup tools3/01z.before-r3.js). Footer slogan now stays one line (lesson: never wrap).
- Next: qa.js matrix (bag/checkout/drawer 1,3,5,6 items, A/B, wide/classic).
## 4b. Bag/checkout matrix (11:15): owner-fix/C/tools/qa.js on rebuilt v12b — ALL 369 CHECKS PASSED (1366/1440/1920 + 360/393/430; 1,3,5,6 items; wide+classic; drawer A/B 0,2,5,6+1; totals bag=checkout=order=invoice). Screens looked at: co-1366-6, drawer-B-1366-6, bag-1366-5 — B1–B3, G1–G3, K1–K8 PASS visually. Shots in QA/r3/qa/.
## 5. Admin (11:45)
- English crawl (D/tools/crawl.js) 1366/1920/768: 720 states, Bengali leaks 0, JS errors 0, overflow 0, dead buttons 0. "not found" on #/admin/side-canvas = known false hit (page-name button). OFFRIGHT items = inside scroll strips (admin-tabs at 768, lb-pages chips) — not bugs. Clip "Send" button = 3 px known.
- c5-toast: same-colour toggle toasts now English (dict). Only "৳" sign matched the Bengali range = fine.
- fixE-test 49/0, fixD-test 19/0.
## 6a. Storefront crawl 1366 (12:00) — tools3/c6-crawl.js: 132 routes; 0 not-found, 0 JS errors, 0 sideways scroll, 0 undefined/NaN; only "issue" = journal teaser excerpts clamped with "…" (bf-card-x, standard teaser) -> taste list. 1920 + 768 running.
## 6b. (12:20) crawl 1920: 132 routes, only journal teaser clamps; 768: 130 routes, only journal teaser clamps + topic blurb behind its own expand arrow (by design). Focus: c6-focus visible on first 14 Tab stops of home/pdp/bag/checkout, skip link first. Taste: blog "Demo content" note shows to visitors (data-driven, goes when real posts exist).
- before-build for sheets: QA/r3/beforebuild/dist/before.html (old 01z + no r3 css).
## 7a. Gates (12:50): demo-gate 135/0; totals ALL OK; combo-verify 1361/0 (no crash this time); ops-test ALL PASSED; ops-flow ALL PASSED; owner-answers + reg-test running.
## 7b. owner-answers ALL PASSED, reg-test ALL PASSED (12:58)
## 7c. timing: sliders 319/0 (2 info), hover 94/0 (4 info) (13:15)
## 7d. timing: overlays 43/0, misc 41/1 -> IN-01 stale (welcome popup now needs ?demo=1); test updated (misc.pre-r3.js backup) + new IN-00 visitor check; extra 3/0; drag running; rerun misc after.
## 7e. timing total (13:45): 531 checks, 522 pass, 0 fail, 9 info (IN-00 new + IN-01 pass with ?demo=1; SC-02b 0 ms). Next: device gate tablets + phones in slices.
## 7f. device gate tablets: 7 fails = one real bug: P4 size helper line cut at 1024 (iPad mini landscape) 'chest 42" · Lo…'. FIXED in 89x (two spans, backup tools3/89x.before-r3.js) + r12-zzz-qa.css. NOT yet rebuilt (phones gate running on old build) — rebuild + rerun tablets after DMDONE.
## 7g. phones gate 15 devices × 15 routes: 0 fails (old build; phone untouched by later fix since .ob-qh is hide-m).
## 7h. tablets rerun on fixed build: 0/96 fails (14:25)
## 8. Sheets (QA/sheets/QA-r3-01, -02) done; final node --check OK; c3 1920 rerun after 89x fix. Writing report.
## 9. DONE — report /home/claude/blueprint/qa/QA-REPORT-V12B.md written. All owner items PASS/FIXED, 6 new bugs fixed, 0 fails in gates.
