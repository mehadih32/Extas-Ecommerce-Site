# Phone + tablet audit V12b progress log (started 20 Oct 11:05)
Rule: append after every chunk. On restart read the last line and continue.
Work dir: scratchpad/owner-fix/PHONE/{tools,out,shots,sheets,backup}. Build: proto/dist/v12m.html. Baseline: extas-ecommerce-site/docs/demo/EXTAS-demo-V12.html.

## 0. Start (11:05)
- No log existed (an older scratchpad/phone-audit/ from 07:37 is a different, earlier pass; not reused). Built dist/v12m.html from current src (= v12b + nothing newer).
- 1a phones gate 15 devices x 16 rows: 0/240 fails (11:12)
- 1b tablets gate 10 sizes x 24 rows: 0/240 fails (11:20). Gate clean -> real bugs must come from diff + touch sweep.
## 2a. Pixel diff 393 (11:50) — tools pd-shot.js (fixed clock, seeded random, reduced motion, demo gear hidden), pd-align.py (row-aligned diff), pd-sheet.py. 41 routes.
- 0 diff: account-out bag-empty c-extras checkout-2 combos exchange journal login pg-* search set set-polos size-guide thanks topic.
- ALLOWED: K11 wording (home/post/landing/combo), easy-English copy (cats FAQ, "Wear it with"), extra products/sets (cat grids, counts, PDP "Build your own set" card, combo lists), "(test)" removed, demo image label moved off model chip, bag short name.
- OWNER FEATURES (not in brief list, owner-ordered elsewhere, kept): order cards Exchange/Return/Help row + order page "Returns & help" box (96g-admin-care, R15 ops sim); hoodie PDP video thumb (C6).
- REGRESSION R1: home Sets row — Build-your-own tile now lists 8 offers (was 3) -> tile 768-889 px tall -> every set card stretched with ~300 px empty white (360/393/430). Fix next.
- FIXED R1 (12:25): 20-home.js hmDiyFitPhone() (AUTO ADJUST: offers that fit the set-card height show, >=2 always, rest "+ N more set offers"; clones match), 97a-owner-a.js hooks (render/resize/fonts), r12-zz-phonefix.css. Cards now 441-501 px (V12 470-491), no empty band. Backup owner-fix/PHONE/backup/20-home.before-phone.js.
- FIXED P1: home Build-your-own tier text split "৳ / 2,100" across lines at 360 (also in V12) -> each "Any 2 for ৳X" nowrap (.hm-tier-m). Root cause: fmt() uses U+2009 thin space = break point; not changed globally (tests parse it); sweep checks every price for splits.
## 3a. Sweep tool (12:55): tools/plib.js + sweep.js — real fonts from local cache (fonts/), checks: h-scroll, PRICE-SPLIT (৳ and number on 2 lines, across nodes), TEXT-CUT (ellipsis/clip/clamp; journal teaser clamps by design), TEXT-OVERLAP (clip-aware, closed <details> skipped), STICKY-COVERS-END, NOT-FOUND, JS errors; small tap targets collected for V12 comparison.
- FOUND P1 widely at 360 (also in V12): prices split "৳ / 350" (checkout summary), "You save ৳ / 200" (landing ladder), set tiers (#/set), combo page set rules, PDP "Free over ৳ / 1,500", home card prices. FIXED: r12-zz-phonefix.css .price/.strike/.pnw nowrap + NEW src/99z-phonefix.js pnwFix(): after each render/resize wraps ONLY a price that really split in bdi.pnw (fmt() untouched — tests parse its thin space). 360 main sweep: 41 routes, 0 issues.
- 3b main-route sweep 9 phones (320-440) x 41 routes: only 2 cut labels (both also in V12): #/combos card "Shirt + Trousers + Polo…" at 320, combo sticky bar "Sky Blue + Khaki + Charc…" at 430. FIXED C1 in 99z-phonefix.js fitFix(): step down to "3 pcs" / hide names (dots stay) when they do not fit. Verified 320/430/440/1180. (13:35)
