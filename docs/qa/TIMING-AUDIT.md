# EXTAS demo store — Timing audit (checklist L33, first filed as L29): every stop needs its resume

**Round TA-2 · 20 Oct 2026 · fixes for T1–T16, full rerun:** 530 checks · ✅ 521 · ❌ 0 · — 9 info. Build tested: `proto/dist/ta2-after.html` (= `scratchpad/timing-audit/timing-ta2.html`). Details: section "Round TA-2 (fixes)" below.
**Round TA-1 · 19 Oct 2026 · independent QA (did not build the store)**
Build: `proto/` source as of 22:52, built with `bash tools/build.sh` → `scratchpad/timing-audit/timing.html`.
Devices: desktop with a real mouse at 1366×768 and 1920×1080 (English + Bengali at 1366), phone 393×852 with CDP touch.
Test scripts (rerun every round): `scratchpad/timing-audit/tools/run-all.sh` → `sliders.js`, `hover.js`, `overlays.js`, `misc.js`, `extra.js`, `drag.js` (added TA-2); per-run raw rows in `out/TABLE.md`. TA-1 raw results are kept in `out-ta1/`.

---

## সারসংক্ষেপ (বাংলায়)

**এখনকার অবস্থা (২০ অক্টোবর, রাউন্ড TA-2):** আগের রাউন্ডে যে ১৬টা বাগ পাওয়া গিয়েছিল, সবগুলো ঠিক করা হয়েছে, তারপর পুরো টেস্ট আবার চালানো হয়েছে। মোট ৫৩০টা মাপ — ✅ ৫২১ পাস · ❌ ০ ফেল · — ৯টা শুধু তথ্য। (আগের রাউন্ডে ৫০৫টা মাপে ৭১টা ফেল ছিল।)

**এখন যা হয়:**
- কম্পিউটারে মাউস স্লাইডারের উপর রাখলে থামে, সরালে সাথে সাথে (০.০৫–০.১ সেকেন্ডে) আবার চলে। মাউস দিয়ে টেনে ছাড়ার পর, চাকা ঘুরিয়ে পেজ নামানোর পর, তীর চাপার পর, ২০ বার দ্রুত ঢোকা-বের হওয়ার পর — সব ক্ষেত্রে একই। কোথাও আর ৪ সেকেন্ড আটকে থাকে না।
- ক্যাটাগরি, প্রোডাক্ট আর অ্যাকাউন্ট পেজের স্লাইডারও এখন মাউসে টানা যায়। টেনে ছাড়লে কার্ড খোলে না; সাধারণ ক্লিক করলে খোলে।
- ফোনে কিছু বদলায়নি: আঙুল দিলে ৪ সেকেন্ড থামে (মাপা ৪.০৩–৪.০৭ সেকেন্ড), সোয়াইপের পর ~৪.২ সেকেন্ডে আবার চলে। ১৫টা ফোন সাইজে ডিভাইস টেস্ট: ২৪০টার মধ্যে ০ ফেল। ফোনের স্ক্রিনশট আগের আর পরের বিল্ডে মিলিয়ে দেখা হয়েছে — কোনো বদল নেই।

**কী কী ঠিক হলো (১৬টা):**
1. মাউসে টেনে ছেড়ে মাউস সরালে স্লাইডার ৪ সেকেন্ড আটকে থাকত — ঠিক হয়েছে।
2. মাউসের চাকায় পেজ নামালে পথের স্লাইডার ৪ সেকেন্ড থেমে থাকত — ঠিক হয়েছে। উপর-নিচের চাকা এখন শুধু পেজ নামায়, স্লাইডার থামায় না।
3. ক্যাটাগরি / প্রোডাক্ট / অ্যাকাউন্টের স্লাইডার মাউসে টানা যেত না — ঠিক হয়েছে।
4. হিরোর তীর চাপার পর মাউস দ্রুত সরালে হিরো থেমেই থাকত — ঠিক হয়েছে।
5. হিরোর তীর চাপার পর তীরগুলো দেখা যেতেই থাকত — ঠিক হয়েছে (এখন শুধু কিবোর্ড দিয়ে চালালে দেখায়)।
6. "Quick add"-এ আগে থেকে ব্যাগে থাকা সাইজ চাপলে প্যানেল খোলা থেকে যেত — ঠিক হয়েছে।
7. "View bag" / "Undo" লিঙ্কওয়ালা টোস্ট মাউস রাখলেও চলে যেত — ঠিক হয়েছে। এখন মাউস রাখলে থাকে, সরালে কমপক্ষে ১.৫ সেকেন্ড পরে যায়।
8–9. Share সারি: আবার খুললে আগেই বন্ধ হয়ে যেত, আর বন্ধ করার পর অকারণে পেজ আবার আঁকা হতো — দুটোই ঠিক হয়েছে।
10. Sort মেনু Esc দিয়ে বন্ধ করলে কিবোর্ড ফোকাস হারিয়ে যেত — ঠিক হয়েছে, এখন Sort বোতামে ফেরে।
11. ফোনে pull-to-refresh মাঝপথে বাতিল হলে "Release to refresh" আটকে থাকত — ঠিক হয়েছে।
12–13. অ্যাকাউন্টের ঘুরন্ত অফার কার্ড আঙুল বা কিবোর্ডে থামত না — ঠিক হয়েছে।
14. পাশের ক্যানভাসের অফার মাউস রাখলেও ঘুরত — ঠিক হয়েছে (আপনার সিদ্ধান্ত মতো, স্লাইডারের নিয়মেই: মাউস রাখলে থামে, সরালে সাথে সাথে চলে)।
15. অ্যাডমিন PR রেজিস্টারের পাশের প্যানেল বন্ধ করলে ফোকাস সারিতে ফিরত না — ঠিক হয়েছে।
16. সব পেজে সারাক্ষণ চলা ৩০ সেকেন্ডের টাইমার — বন্ধ। এখন শুধু হোম আর জার্নাল পেজ খোলা থাকলে, দরকারের সময় একবার চলে।

**টেস্টে যা বদলানো হয়েছে (খোলাখুলি লেখা):** দুটো টেস্টের হিসাব ভুল ছিল — HR-05 তীর পুরো মুছে যাওয়ার আগেই মাপত, আর SC-02 মাউস যেখানে নেই সেই অন্য পাশের ক্যানভাসের ঘোরাও গুনত। দুটোই ঠিক করে নিচে কারণসহ লেখা আছে। নতুন ২৫টা মাপ যোগ হয়েছে (টানার পর ক্লিক, ফোনে ট্যাপ, টোস্ট আবার চলা, ক্যানভাস আবার ঘোরা)।

**খোলা কিছু নেই।** আগের রাউন্ডের (TA-1) পুরো বিবরণ নিচে ইংরেজিতে আগের মতোই রাখা আছে।

---

## Round TA-2 (fixes) · 20 Oct 2026

**Result: 530 checks · ✅ 521 · ❌ 0 · — 9 info** (TA-1: 505 · ✅ 426 · ❌ 71 · — 8). The 9 info rows are the 8 from TA-1 (SL-00 bag rows fit, HA-01/02 no logo motion, SB-02 no disc, SC-04 popup zone not drawn) plus DR-00 (review cards have no link to click).
Build tested (all six suites, the phone gate and the phone diff — one build): `proto/dist/ta2-after.html` (copy: `scratchpad/timing-audit/timing-ta2.html`), built 20 Oct 00:18 from the shared `proto/src`. Every touched JS file passes `node --check`.

**One rule behind T1–T4 (02-core.js SMOOTH engine):** three separate pause flags, each with its own tested resume — `st.hover` (mouse on the row → cleared by pointerleave, moves at once), `st.focus` (keyboard focus → cleared on blur with the 1.5 s grace, or when the mouse is used), `st.pause` (the 4 s touch hold → runs out by itself). `st.ptr` remembers the last hand; a mouse never sets the 4 s hold. The L28 fix (pointerleave resumes for a mouse) is kept unchanged.

| Bug | Fix | Where (file:line, TA-2 source) | Retest (TA-2) |
|---|---|---|---|
| T1 | `hold()` is a no-op for a mouse (`st.ptr === 'mouse'`), so neither the snap end nor a drag re-arms 4 s; the scroll listener no longer re-holds when the row's own drift writes scrollLeft after the mouse left | `02-core.js:528` (hold), `:470` (snap end, comment), `:615` (scroll re-hold needs `st.hover \|\| st.ptr !== 'mouse'`), `:587-588` (st.ptr from pointerdown/pointermove/touchstart) | SL-07 ✅ 25/25 — moving 5–51 ms after the glide (was 4038–4445 ms); SL-03 54–88 ms, SL-04/05/06/08 ✅ 25/25 |
| T2 | A wheel with \|deltaX\| ≤ \|deltaY\| is ignored by the engine (the page scrolls); a sideways wheel/trackpad sets `st.ptr='mouse'` and resumes like a leave | `02-core.js:586` | SL-09 ✅ 8/8 — 18–45 ms (was 3991–4046 ms); SL-04 ✅ 55–97 ms |
| T3 | Mouse drag moved from `20-home.js` into `SMOOTH.drag` (dragstart blocked, row follows the mouse, 5 px threshold, a click after a real drag is swallowed, a plain click goes through, touch returns at once); `SMOOTH.start` binds it on every row that can scroll (also under reduced motion); `hm_drag` now calls `SMOOTH.drag` | `02-core.js:530-571` (wrapX, drag), `:648`, `:668`; `20-home.js:187` | SL-06b ✅ 25/25 (was 13 ❌); new DR-01 ✅ 9/9 (drag never opens the card), DR-02 ✅ 9/9 (plain click opens), DR-03 ✅ phone tap opens |
| T4 | Hero keyboard focus has its own flag `st.focus` (frame tests `st.hover \|\| st.focus \|\| …`); focus that a pointer press caused is not a keyboard pause; any pointer press / mouse move in the slider ends the focus pause; the arrows (siblings of the track) carry the mouse hover themselves, so the mouse resting on an arrow still holds the row and leaving the arrow resumes at once | `02-core.js:626`; `97-desk-a.js:305-333` | HR-04b ✅ 3/3 — 26–41 ms (was > 8 s); HR-03 ✅ still on arrow; HR-04 ✅ 80–85 ms; HR-07 ✅; HR-08 ✅ ~1.52 s |
| T5 | Hero arrows shown for keyboard focus only: `.hm-slider:has(:focus-visible)` instead of `:focus-within` (desktop media block) | `r12-zzdesk-a.css:162` | HR-05 ✅ 3/3 opacity 0 (test timing note below) |
| T6 | Quick-add panel: hover rule split from the focus rule, focus rule is `.pcard-w:has(:focus-visible)` (desktop media block; separate rule so a browser without `:has` keeps the hover rule) | `r12-zzdesk-a.css:217-221` | CD-04 ✅ 3/3 — 0 panels after leave (was 1); CD-04b ✅ |
| T7 | One toast timer: `toastArm(d, ms)` records the end time; a delegated pointerover/out + focusin/out (keyboard `:focus-visible` only, never touch) holds a toast that has a link and restarts it on leave with max(1.5 s, time left). All four toast helpers use it | `02-core.js:1045-1066`; `40-combo.js:381`; `41-set.js:149`; `50-bag.js:763` | TO-05 ✅ 3/3 — held the whole 9 s poll; new TO-06 ✅ 3/3 — goes 2584–2603 ms after the mouse leaves; TO-01/03/04 unchanged (2.61 s / 6.02 s) |
| T8 + T9 | One record `PDP_SHARE {t0, t, close}`; `pdp_shareStop()` clears both timers and removes the click listener; called first on every toggle and by every close path (outside click, 8 s tidy-up, share link, Copy link) | `30-product.js:1772-1794`, `pdp-shared` / `pdp-copylink` lines below | PO-02 ✅ 2/2 — re-opened row closes at ~8.1 s (was 1395–1647 ms); PO-03 ✅ 2/2 — 0 extra redraws (was 2) |
| T10 | `cat_sortBack()` closes the menu and refreshes with the Sort button's `data-fk` (`<loc>-sort`) as the focus target; used by Esc, veil and pick; `cat_refresh` accepts a data-fk string | `21-category.js:955` (cat_refresh), `:977-987` (cat_sortBack, veil / pick / Esc) | PO-04 ✅ 2/2 — focus on Sort (phone + 1366) |
| T11 | `touchcancel` handler: ends the pull, hides the indicator, text back to "Pull to refresh"; never reloads | `09-ptr.js:53-56` | PTR-02 ✅ — opacity 0 after cancel (was 1); PTR-01/03/04 ✅ |
| T12 + T13 | Offer card timer is a `setTimeout` chain with separate flags: finger down + 4 s after lift (touch only), mouse hover (resumes on leave), keyboard focus inside (resumes on blur); while paused the shown slide's time restarts, so focus never sits on a slide that turns away | `60-account.js:584-618` | RO-01 ✅ held under the finger; RO-02 ✅ focused slide still shown |
| T14 | Owner rule applied: a zone under the mouse skips its turn (`hz.matches(':hover')`); on mouse leave, a turn that came due happens at once and the rhythm restarts | `96c-layout-builder.js:1328-1353` | SC-02 ✅ held; new SC-02b ✅ turns 32 ms after leave (29–85 ms over three runs) |
| T15 | The click on a PR row link records the opener (`ZG.from`: href + class); the list page's `after()` focuses that row link (preventScroll) when coming straight back from the panel | `96-admin-register.js:571-585` | OV PR panel (esc) ✅ 2/2 — focus → opener (was BODY), scroll 409→409 |
| T16 | The 30 s forever `setInterval` is gone: `zb_liveArm()` runs on every route change, only on `home` / `journal`, picks up posts that came due, and sets ONE `setTimeout` for the next scheduled post (capped at 6 h, re-armed); cleared on every route change | `94-admin-blog.js:332-352` | TM-01 ✅ — no interval alive on the idle category page (was one 30 000 ms) |

**Test changes (explained, not silent):**
- **HR-05 (sliders.js):** TA-1 read the arrow opacity right after the row started moving (~50 ms into the 0.15 s fade). With T4 fixed the row now moves at once, so the read landed mid-fade (0.26–0.65, still falling). The check now waits 300 ms before reading — the same wait HR-01 already uses for the same fade. Result 0.
- **SC-02 (misc.js):** TA-1 compared the frames of every side-canvas zone at once. The mouse rests on the right-gutter "z-offer" zone; the left-gutter "z-model" zone (x 12) is not under the mouse and rightly keeps turning, which failed the old check after the fix. The check now reads only the zone under the mouse (per-slider rule, like the sliders).
- **Added:** `drag.js` (DR-01 drag-release never opens a card, DR-02 plain click opens it, DR-03 phone tap opens it — 21 rows), TO-06 (toast resumes after leave), SC-02b (side canvas resumes after leave). `run-all.sh`, `table.js`, `items.js` include `drag`.

**Phone safety:**
- Device gate `qa/device-matrix.js --group=phones` on `ta2-after.html`: 15 phones × 15 routes + extras — **0 failing of 240**.
- Phone pixel diff (`desktop-fix/bag/tools/phone-shots.js` + `pixdiff.js`, 67 routes/states × 360/393/430 = 201 shots) against a baseline built from the same source with only the TA-2 edits reversed (`scratchpad/ta2/proto-before/dist/before-ta2.html`): **0 real differences.** The raw diff flagged 27 shots, all run-to-run noise: two runs of the unchanged baseline flag 25 shots with the same signatures (22 px of the header WhatsApp icon's halo ring at y 41–43 on 393 shots, 10 px on acc-orders, thumbnail anti-aliasing on thanks-360 / pdp-shirt-360 / journal). 13 shots differed from both baseline runs: 12 carry the same two-state halo flicker (22 px, y 41–43), and pdp-shirt-360 (55 px of thumbnail anti-aliasing) was re-shot twice on each build: after == before (0 px). No intended phone change.
- Touch timing (SLT-02/03) unchanged: tap 4041–4070 ms, swipe ~4236 ms (TA-1 4043–4067 / ~4219).

**Open:** none. Noted, not changed: the specs `EXTAS-ECOMMERCE-V2.md` (lines 6683, 6691) and `EXTAS-ECOMMERCE-V2.1.md` (7064, 7072) still cite "checklist L28, L29" for these timing rules; in the checklist they are now L32 / L33.

## TA-1-এর সারসংক্ষেপ (আগের অবস্থা, ১৯ অক্টোবর — সব এখন ঠিক)

**কী খুঁজেছি:** মালিক যে বাগটা ধরেছিলেন — মাউস সরালে স্লাইডার আবার চলে না — ঠিক ওই ধরনের সব বাগ। মানে, যা কিছু থামে, লুকায়, খোলে, অপেক্ষা করে বা লক হয়, সেটা ঠিক সময়ে আবার চলে, বন্ধ হয় বা আনলক হয় কিনা। প্রতিটা জিনিস দুই দিকেই মেপেছি (থামা আর আবার চলা), সময় মিলিসেকেন্ডে।

**মোট ফল:** ৫০৫টা মাপ (১১০ ধরনের আইটেম) — ✅ ৪২৬ পাস · ❌ ৭১ ফেল · — ৮টা শুধু তথ্য। ৭১টা ফেল আসলে **১৬টা আলাদা বাগ** থেকে আসছে (নিচে মিলিয়ে ১৪টা দলে)।

**ভালো খবর (যা ঠিক আছে):**
- মাউস স্লাইডারের উপর রাখলে থামে, সরালে ০.০৬–০.০৭ সেকেন্ডে আবার চলে — সব পেজে, দুই স্ক্রিনে, বাংলাতেও। ২০ বার দ্রুত ঢোকা-বের হওয়ার পরেও আটকে থাকে না।
- ফোনে আঙুল দিলে ৪ সেকেন্ড থামে (মাপা ৪.০৪–৪.০৭ সেকেন্ড), সোয়াইপের পর কার্ডে বসে ৪ সেকেন্ড পর আবার চলে — আগের মতোই ঠিক আছে, কিছু ভাঙেনি।
- মেগা মেনু ~০.১৬ সেকেন্ডে খোলে, ~০.২৭ সেকেন্ডে বন্ধ হয়, Esc কাজ করে, দ্রুত নড়াচড়ায় আটকে থাকে না।
- সব পপআপ/শিট/জুম (মেনু, সার্চ, ফিল্টার, সাইজ চার্ট, সাইজ ফাইন্ডার, জুম, কম্বো জুম, ইনভয়েস, অ্যাডমিন অর্ডার শিট, ব্লগ পপআপ): খুললে পেজ লক হয়, বন্ধ করলে আনলক হয়, স্ক্রল একই জায়গায় থাকে, কিবোর্ড ফোকাস বোতামে ফিরে আসে।
- টোস্ট ঠিক ২.৬ সেকেন্ডে যায়, নিচের জিনিসে ক্লিক আটকায় না। স্টিকি বারগুলো নিচে-উপরে দুই দিকেই ঠিক জায়গায় আসে-যায়। হেডারের অ্যানিমেশন ৩ বার ঘুরে থামে, মাউস রাখলে আবার চলে।

**যা ভাঙা (ফেল) — গুরুত্ব অনুযায়ী:**
1. **(বড়) মাউস দিয়ে স্লাইডার টেনে ছাড়ার পর মাউস সরালে ৪ সেকেন্ড আটকে থাকে** — মালিকের ধরা বাগের ঠিক যমজ ভাই। সব ২৫টা স্লাইডারে, দুই স্ক্রিনে। কারণ: স্লাইডার নিজে নড়লেও সেটাকে "হাতের টান" ভেবে আবার ৪ সেকেন্ড থামায়।
2. **(বড়) মাউসের চাকা ঘুরিয়ে পেজ নিচে নামালে, পথে যে স্লাইডারের উপর দিয়ে কার্সার গেছে সেটা ৪ সেকেন্ড থেমে থাকে** — অথচ মাউস আর ওখানে নেই। হোম আর ক্যাটাগরি পেজে।
3. **(মাঝারি) ক্যাটাগরি, প্রোডাক্ট আর অ্যাকাউন্ট পেজের স্লাইডার মাউসে টানা যায় না** — টানলে ব্রাউজারের "ভূতুড়ে ছবি" ওঠে, সারি নড়ে না। হোম পেজে ঠিক আছে।
4. **(মাঝারি) হিরো স্লাইডারের তীর চাপার পর মাউস দ্রুত সরালে হিরো থেমেই থাকে** — অন্য কোথাও ক্লিক না করা পর্যন্ত (৮ সেকেন্ডের বেশি মাপা)।
5. **(মাঝারি) কার্ডের "Quick add"-এ এমন সাইজ চাপলে যেটা আগেই ব্যাগে আছে, প্যানেলটা খোলা থেকে যায়** মাউস সরানোর পরেও।
6. **(মাঝারি) ক্যাটাগরির Sort মেনু Esc দিয়ে বন্ধ করলে কিবোর্ড ফোকাস হারিয়ে যায়** (পেজের শুরুতে চলে যায়)।
7. **(মাঝারি) ফোনে টেনে রিফ্রেশ (pull-to-refresh) মাঝপথে বাতিল হলে "Release to refresh" লেখাটা স্ক্রিনে আটকে থাকে**, পরের ট্যাপ পর্যন্ত।
8. **(মাঝারি) Share বোতাম (মালিক এখন বন্ধ রেখেছেন, চালু করলে):** বন্ধ করে আবার খুললে আগের টাইমার ১–২ সেকেন্ডেই বন্ধ করে দেয়; আর বন্ধ করার পর পরের যেকোনো ক্লিকে পেজ অকারণে আবার আঁকা হয়।
9. **(ছোট) "View bag"/"Undo" লিঙ্কওয়ালা টোস্ট মাউস রাখলেও ২.৬ সেকেন্ডে চলে যায়।**
10. **(ছোট) হিরোর তীর একবার চাপলে মাউস সরালেও তীরগুলো দেখা যেতেই থাকে।**
11. **(ছোট) অ্যাকাউন্টের ঘুরন্ত অফার কার্ড (ফোন) আঙুল বা কিবোর্ড ফোকাসে থামে না;** ফোকাস লুকানো স্লাইডে পড়ে থাকে।
12. **(ছোট, মালিকের সিদ্ধান্ত) পাশের ক্যানভাসের ঘুরন্ত অফার মাউস রাখলেও ঘুরতে থাকে** — স্লাইডারের নিয়মের সাথে মেলে না।
13. **(ছোট) অ্যাডমিন PR রেজিস্টারের পাশের প্যানেল বন্ধ করলে ফোকাস সারিতে ফেরে না।**
14. **(ছোট) একটা ৩০ সেকেন্ডের টাইমার সব পেজে সারাক্ষণ চলে** (ব্লগের নির্ধারিত পোস্ট দেখার জন্য) — R15-এর "চিরকালের টাইমার নয়" নিয়মের বাইরে।

**ঠিক করার পরিকল্পনা (ফোনের লেআউট বা ফোনের ছোঁয়া বদলাবে না):** ১, ২, ৩, ৪ নম্বর একসাথে একটা ফাইলে (`02-core.js`-এর স্লাইডার ইঞ্জিন) ঠিক হয় — মাউস চলে গেলে আর কোনো ৪ সেকেন্ডের হোল্ড নয়, উপর-নিচের চাকা স্লাইডার থামাবে না, সব সারিতে মাউসে টানা যাবে। বাকিগুলো ছোট ছোট আলাদা ফিক্স (নিচে প্রতিটার ফাইল:লাইন আর ফিক্স দেওয়া আছে)। প্রতিটা ফিক্সের পর `tools/run-all.sh` আবার চালালেই বোঝা যাবে।

---

## What was tested (inventory → tests)

Every timer and pause/hold state in `proto/src` was listed (setTimeout/setInterval/requestIdleCallback, hover/hold/pause flags, mouse/pointer enter/leave, focusin/out, IntersectionObserver, visibilitychange, body scroll-lock, modal/drawer/sheet/zoom, toasts, popups, mega menu, sticky bars, videos/motion, pull-to-refresh, swipe-back, debounce) and each got a two-way test with a measured time:

| Area | Tests | Pages | Devices |
|---|---|---|---|
| Auto-moving sliders (shared SMOOTH engine, 02-core.js) | SL-01…SL-10, HR-01…HR-08, HR-04b, SLT-01…04 | home (hero, flash ×2, reviews, sets, journal), category, product (pairs), bag, thanks, account | 1366 en+bn, 1920, phone |
| Mega menu (97-desk-a.js) | MM-01…MM-12 | header on home → category | 1366 en+bn, 1920 |
| Header motion + tooltips + WhatsApp tip | HA-01/02, TT-01…04 | header | 1366 en+bn, 1920 |
| Card hover states (back view, quick add) | CD-01…CD-04b | category grid | 1366 en+bn, 1920 |
| Toasts | TO-01…TO-05 | home | 1366 en+bn, 1920 |
| Popups / sheets / drawers / zoom / admin popups | OV … (lock, unlock, scroll spot, focus return; ✕ / Esc / backdrop / Back / edge swipe / swipe-down) | home, category, product, combo pair, account, admin orders, admin register, admin layout | phone, 1366 en+bn, 1920 |
| Sticky bars, both directions | SB-01…SB-05 | bag, landing, checkout, product | phone, 1366, 1920 |
| Journal: popup, slim bar, tab bar | BP-01…BP-05 | journal post | phone, 1366, 1920 |
| Side canvas: motion, off-screen pause, popup | SC-01…SC-05 | home | 1920 |
| Popovers (share row, sort menu) | PO-01…PO-04 | product, category | phone, 1366 |
| Pull-to-refresh, swipe-back | PTR-01…04, SW-01 | category, product | phone |
| Press-and-hold steppers | ST-01/02 | size finder | phone, 1366 |
| Rotating offer card, welcome popup, forever timers | RO-01/02, IN-01, TM-01 | account, home, category | phone |

Not testable here (marked —): real iOS Safari body-lock behaviour, tab-hidden video pause (headless tabs never go hidden), real-device WhatsApp hand-off.

## Results

**505 checks (110 items) · ✅ 426 · ❌ 71 · — 8 info.** The 71 failing checks come from **16 distinct bugs (T1–T16)**. All line numbers are in `proto/src` as of the 22:52 build.

| Bug | Severity | Failing checks | One line |
|---|---|---|---|
| T1 | High | SL-07 ×25 | After a mouse drag / glide, the row freezes 4.0–4.4 s after the mouse leaves (every slider, both desktops, en+bn) |
| T2 | High | SL-09 ×8 | Wheel-scrolling the page past a slider leaves that row frozen ~4.0 s after the cursor is gone |
| T3 | Medium | SL-06b ×13 | Category / product / account rows cannot be mouse-dragged: the browser's ghost link drag starts instead (home rows fine) |
| T4 | Medium | HR-04b ×3 | Click the hero › arrow, then flick the mouse away → hero stays stopped until a click elsewhere (> 8 s) |
| T5 | Low | HR-05 ×3 | Hero arrows stay visible after a mouse click on them and leaving |
| T6 | Medium | CD-04 ×3 | Quick-add panel stays open after leaving, when the clicked size was already in the bag |
| T7 | Low | TO-05 ×3 | Toast with a "View bag" / "Undo" link vanishes at 2.6 s even with the mouse on the link |
| T8 | Medium (dormant) | PO-02 ×2 | Share row: an old 8 s timer closes a re-opened row after 1.4–1.6 s |
| T9 | Medium (dormant) | PO-03 ×2 | Share row: closing it with its own button leaves a click listener → extra page redraws on the next click |
| T10 | Medium | PO-04 ×2 | Sort menu: Esc closes it but keyboard focus drops to the page top (phone and desktop) |
| T11 | Medium | PTR-02 ×1 | Pull-to-refresh: a cancelled touch leaves "Release to refresh" stuck on screen |
| T12 | Low | RO-01 ×1 | Account rotating offer card (phone) turns under a resting finger (no hold) |
| T13 | Low | RO-02 ×1 | …and turns away from a keyboard-focused link, leaving focus on a hidden slide |
| T14 | Low (owner ⚖) | SC-02 ×1 | Side-canvas rotating offers keep turning under the mouse |
| T15 | Low | OV PR panel ×2 | Admin PR register: closing the side panel drops focus to the page, not the row |
| T16 | Low | TM-01 ×1 | A 30 s setInterval runs forever on every shop page |

### T1 — slider freezes 4 s after the mouse leaves, when the leave follows a drag (High)
- **Steps (desktop, any slider, e.g. home "Flash" row or category row):** put the mouse on the row, press, drag 130 px, let go, move the mouse off the row straight away.
- **Expected:** moving again ≤ 0.5 s after the glide to the card edge ends (owner rule, the 21:09 fix). **Measured:** 4038–4445 ms on all 25 rows (1366 en, 1366 bn, 1920). Same when the drag is released on the row and the mouse leaves during the glide.
- **Cause (traced, `st.pause` writes logged):** `02-core.js:550` pointerleave does set `pause = 0`, but `st.user` stays true until the settle timer runs. ~35 ms later the engine's *own* scrollLeft write fires a `scroll` event and `02-core.js:555` (`if(st.user && !st.down && !st.snapping){ hold(st); … }`) puts the 4 s hold back. On home rows the snap's end, `02-core.js:470` `hold(st)`, adds it again unconditionally.
- **Fix (02-core.js only; touch keeps its 4 s):** remember the last pointer type in the existing pointerdown/touchstart listener (`st.ptr = ev.pointerType || 'touch'`); in pointerleave (mouse) also `st.user = false; clearTimeout(st.settleT);`; line 470 → `if(st.ptr === 'mouse' && !st.hover) st.pause = 0; else hold(st);`; line 555 → add `&& (st.hover || st.ptr !== 'mouse')`. No CSS, no phone layout change.

### T2 — wheel-scrolling the page freezes the row the cursor passed over (High)
- **Steps:** mouse resting on a slider row (home Flash/Reviews, category), turn the wheel down 3–4 notches so the row slides away from under the cursor.
- **Expected:** once the row is no longer under the cursor it moves within 0.5 s. **Measured:** 3991–4046 ms (8 of 8 runs at 1366 and 1920; one 1920 run on Flash passed in 71 ms when the wheel event landed elsewhere).
- **Cause:** `02-core.js:528-537` treats every `wheel` as a hand drag: `hold(st)` + `st.user = true`, even for a vertical page scroll; then the same `02-core.js:555` re-hold as in T1.
- **Fix:** at the top of that listener: `if(e === 'wheel' && Math.abs(ev.deltaX) <= Math.abs(ev.deltaY)) return;` (a vertical wheel is the page, not the row). The T1 fix covers the rest. Phone unaffected (no wheel).

### T3 — no mouse drag on category / product / account rows (Medium)
- **Steps:** 1366 or 1920, category (Polos) "cat-bn-sl", product pairs row, account For-you rows: press on a card and drag sideways.
- **Expected:** the row follows the mouse and glides to a card edge, as on the home rows (L27 R15d: "mouse on desktop"). **Measured:** `dragstart` fires (browser ghost link/picture drag), row moves 0 px; the cancelled pointer also leaves the 4 s hold (T1).
- **Cause:** the drag-to-scroll and `dragstart` guard live only in `20-home.js:186-215` (`hm_drag`, guard at line 190); other pages start SMOOTH without them (`21-category.js` after(), `30-product.js` pdp_initSliders, `60-account.js` acc_after, `50-bag.js`, `52-thanks.js`).
- **Fix:** move `hm_drag` (and `hm_subpixel`) into `SMOOTH.start` in 02-core.js so every track gets them; it already returns early for `pointerType === 'touch'`, so phones keep native swipe.

### T4 — hero stays stopped after an arrow click + quick exit (Medium)
- **Steps:** home, click ›, then flick the mouse straight off the slider (one move, as a fast hand does).
- **Expected:** moving ≤ 0.5 s. **Measured:** not moving after 8 s, `hover` flag true, focus still on the arrow; resumes only after a click elsewhere (+1.5 s).
- **Cause:** `97-desk-a.js:305-306` — keyboard-focus pause reuses the mouse flag: `focusin` sets `st.hover = true`; a mouse click on the arrow focuses it, and the row's own pointerleave already fired when the mouse moved onto the arrow (the arrow is a sibling of the track), so nothing clears it.
- **Fix:** give focus its own flag: in 02-core.js frame (line 566) test `st.hover || st.focus || …`; in 97-desk-a.js:306 set `st.focus = true` only when `ev.target.matches(':focus-visible')`, and line 311 clears `st.focus`. Desktop-only file; phone untouched.

### T5 — hero arrows stay visible after a mouse click (Low)
- **Measured:** opacity 1 after click + leave (expected 0, as on a plain hover-leave: 0). **Cause:** `r12-zzdesk-a.css:160` `.hm-slider:focus-within .hm-slnav{opacity:1}` — a mouse click focuses the button. **Fix:** `.hm-slider:has(:focus-visible) .hm-slnav{opacity:1}` (same desktop media block).

### T6 — quick-add panel stuck open (Medium)
- **Steps:** category grid card, hover, click a size already in the bag ("Already in your bag" toast, no redraw), move away.
- **Expected:** panel fades out (0.16 s) like a normal leave. **Measured:** stays open (1 panel visible) until a click elsewhere; focus is on the size button.
- **Cause:** `r12-zzdesk-a.css:216` `.pcard-w:focus-within .pcard-qa` + `97-desk-a.js:274` ACT `desk-qa` leaves focus on the button when it does not redraw.
- **Fix:** CSS `.pcard-w:has(:focus-visible) .pcard-qa` instead of `:focus-within` (desktop media block only), or `el.blur()` in `desk-qa` when the click came from a mouse.

### T7 — action toast disappears under the mouse (Low)
- **Measured:** "View bag" toast removed at 2608–2619 ms with the mouse on the link (expected: held while hovered/focused, WCAG 2.2.1). The bag "Undo" toast (6 s) and combo toasts share the same timer.
- **Cause:** `02-core.js:983` `toast()` (and `50-bag.js:688`, `40-combo.js:381`, `41-set.js:149`) set a fixed `toastTimer` with no pause.
- **Fix:** one helper in 02-core.js: on `pointerenter`/`focusin` of a toast that contains a link, `clearTimeout(toastTimer)`; on `pointerleave`/`focusout` restart it (2.6 s, or 6 s for Undo). A phone tap never hovers, so phone timing stays the same.

### T8 + T9 — share row timers and listener leak (Medium, dormant: the share icon is off by default, `SHOWN.pdpIcons.share=false`)
- **T8 steps:** open share, close it with the same button after 1 s, open it again 5 s later. **Expected:** stays 8 s. **Measured:** closed after 1395–1647 ms (the first opening's 8 s timer).
- **T9 steps:** open + close with the same button twice, then click anywhere else. **Expected:** nothing happens. **Measured:** 2 extra page redraws (one per leaked listener).
- **Cause:** `30-product.js:1761-1783` — each opening adds a capture `click` listener and an 8 s `setTimeout` that are never cleared when the row is closed by its own button (the listener returns early for `[data-act="pdp-share"]`), by `pdp-shared` (line 1800) or `pdp-copylink`.
- **Fix:** keep one `SHARE = {t, close}`; every toggle / close path does `clearTimeout(SHARE.t); document.removeEventListener('click', SHARE.close, true)` before anything else.

### T10 — sort menu Esc loses focus (Medium)
- **Measured:** after Esc focus is on `<body>` (phone and 1366); expected back on the Sort button, like every popup (99-boot rule). **Cause:** `21-category.js:980` (and `cat-sortclose` / `cat-sortpick`) call `cat_refresh(null)`, which redraws the page without a focus target; the Sort button has no `data-fk`. **Fix:** give the Sort button `data-fk="sort-<loc>"` in `cat_sortCtl` and call `cat_refresh(buttonEl)` from the Esc / close / pick paths.

### T11 — pull-to-refresh stuck after a cancelled touch (Medium, phone)
- **Steps:** at the top of a page pull down past the line ("Release to refresh"), then the touch is cancelled (call, notification, system gesture → `touchcancel`).
- **Expected:** indicator hides. **Measured:** stays at opacity 1 with "Release to refresh" until the next tap.
- **Cause:** `09-ptr.js` listens to touchstart/touchmove/touchend (lines 31-57) but not `touchcancel`. **Fix:** `document.addEventListener('touchcancel', function(){ live = false; reset(); }, {passive:true});` — no layout change.

### T12 + T13 — rotating offer card (account → For you, phone) (Low)
- **T12 measured:** a finger resting on the card: it turned after 4200 ms (sliders hold for 4 s after a touch). **T13 measured:** keyboard focus on the visible slide's link → after 4.2 s that slide is hidden with focus still on it (tabindex −1).
- **Cause:** `60-account.js:584-600` `acc_poRotate` interval never checks touch, hover or focus. **Fix:** skip a tick while `box.matches(':hover, :focus-within')` or within 4 s of a `touchstart` on the box (same HOLD rule as SMOOTH).

### T14 — side-canvas motion keeps turning under the mouse (Low, owner decision ⚖)
- **Measured:** frames 2→3 while the mouse rested on the zone for 2.7 s. **Cause:** `96c-layout-builder.js:1331` only pauses for `document.hidden` / `.lb-paused`. **Fix (if the owner wants the slider rule here too):** add `|| el.matches(':hover')` to that check. Desktop-only feature (≥ 1024 px with a mouse).

### T15 — admin PR register panel: focus not returned (Low)
- **Measured:** after Esc focus is on `<body>`; expected on the row link that opened it. **Cause:** the panel is its own route; `96-admin-register.js:554-559` `zg_close` goes back in history and `PAGES['zg-page'].after` (line 570) only restores the search box. **Fix:** remember the opener's href (`ZG.from`) when a `#/admin/register/pr/N` route renders, and in `after` focus `a[href="#/admin/register/pr/N"]` if it is on the page.

### T16 — forever timer (Low)
- **Measured:** one 30 000 ms `setInterval` alive on an idle category page (phone). **Cause:** `94-admin-blog.js:333` (scheduled journal posts going live) runs on every page forever, against the R15 bug-20 rule (no forever timers). **Fix:** compute the next scheduled time and set one `setTimeout` for it (re-armed after a publish), or check on `hashchange` / `visibilitychange` only.

### Notes (not failures)
- SC-04/SC-05 (side popup "3 s in view": opened 3022 ms after the zone came into view, cancelled when it left early, locked/unlocked, never came back) **passed on the 21:16 build**. In the 22:52 build the example popup zone ships switched off and, even switched on, is not drawn on home — recheck after that work settles.
- HA-01/02 "logo": the desktop logo has no motion in this build (nothing to stop); the WhatsApp disc and bag icon stop after 3 rounds and restart on hover as specified.
- SB-02: there is no floating WhatsApp disc on this build (header icon only).
- Blog popup timing follows the owner's live setting (scroll 60 %, wait 10 s from arrival): opened within 30–70 ms of the remaining wait on all three devices.

## Every item tested (one row per item; stop → resume, measured, result)

Item IDs match the test scripts. Measured = range over all runs, or the failing value. Result = passing runs / all runs.

| Item | Stop → resume checked | Where (pages · devices) | Measured | Result |
|---|---|---|---|---|
| SL-01 | drifts on its own (no mouse) | home, category, product, account · d1366, d1366/bn, d1920 | moving (10.0 px / 0.5 s) | ✅ 25/25 |
| SL-02 | mouse over → still | home, category, product, account · d1366, d1366/bn, d1920 | still (0 px / 0.7 s) | ✅ 25/25 |
| SL-03 | mouse leaves → moving again (≤ 500 ms) | home, category, product, account · d1366, d1366/bn, d1920 | 56–72 ms | ✅ 25/25 |
| SL-04 | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | home, category, product, account · d1366, d1366/bn, d1920 | 52–96 ms | ✅ 25/25 |
| SL-05 | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | home, category, product, account · d1366, d1366/bn, d1920 | still while over · leave→move 92 ms | ✅ 25/25 |
| SL-06b | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | home, category, product, account · d1366, d1366/bn, d1920 | browser ghost drag started (dragstart ×1) · row moved 0 px for a 100 px drag | ❌ 13/25 |
| SL-06 | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | home, category, product, account · d1366, d1366/bn, d1920 | 17–201 ms | ✅ 25/25 |
| SL-07 | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | home, category, product, account · d1366, d1366/bn, d1920 | 4038–4445 ms | ❌ 25/25 |
| SL-08 | 20 fast enter/leave cycles: ends outside → moving; then inside → still | home, category, product, account · d1366, d1366/bn, d1920 | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ 25/25 |
| HR-01 | hero arrows fade in on hover, fade out on leave (0.15 s) | home · d1366, d1366/bn, d1920 | in 1 · out 0 | ✅ 3/3 |
| HR-02 | click › → moves exactly one card | home · d1366, d1366/bn, d1920 | 234.0 px (one card = 234 px) | ✅ 3/3 |
| HR-03 | mouse resting on the arrow after the click → row still | home · d1366, d1366/bn, d1920 | still | ✅ 3/3 |
| HR-04 | after clicking an arrow, the mouse leaves the slider → moving again (≤ 500 ms) | home · d1366, d1366/bn, d1920 | 71–81 ms | ✅ 3/3 |
| HR-05 | after an arrow click and leave, the arrows fade out again | home · d1366, d1366/bn, d1920 | opacity 1 | ❌ 3/3 |
| HR-06 | …then a click elsewhere on the page → moving again | home · d1366, d1366/bn, d1920 | 1523–1537 ms | ✅ 3/3 |
| HR-07 | keyboard focus on a hero slide → still | home · d1366, d1366/bn, d1920 | still | ✅ 3/3 |
| HR-08 | keyboard focus leaves the hero → moving again after the 1.5 s grace | home · d1366, d1366/bn, d1920 | 1528–1528 ms | ✅ 3/3 |
| SL-09 | scrolling the page DOWN with the wheel while the cursor passes over the row → once the row is out from under the cursor it moves again (≤ 500 ms) | home, category · d1366, d1366/bn, d1920 | 3991–4046 ms | ❌ 8/8 |
| SL-10 | page redraws (heart / quick add / language) while the mouse rests on the row → row stays still under the cursor | home, category · d1366, d1366/bn, d1920 | still | ✅ 5/5 |
| SL-10b | …after the redraw, the next small mouse move stops it | home, category · d1366, d1366/bn, d1920 | still | ✅ 5/5 |
| SL-00 | auto-moving rows on this page | bag · d1366, d1920 | none at this width (rows fit, nothing drifts) | — info |
| SLT-01 | drifts on its own | home, category, product, bag, thanks, account · phone | moving | ✅ 13/13 |
| SLT-02 | finger tap → stays still 4 s, then drifts (3.8–4.6 s) | home, category, product, bag, thanks, account · phone | 4043–4067 ms | ✅ 13/13 |
| SLT-03 | finger swipe → snaps, holds ~4 s, then drifts (total 3.9–5.0 s after lift) | home, category, product, bag, thanks, account · phone | held · ~4219 ms after lift | ✅ 13/13 |
| SLT-04 | a tap never leaves the mouse "hover" flag on (the old L27 freeze) | home, category, product, bag, thanks, account · phone | hover flag false | ✅ 13/13 |
| MM-01 | mouse rests on a menu item → panel opens after ~150 ms (100–260) | home (header) · d1366, d1366/bn, d1920 | 162–171 ms | ✅ 3/3 |
| MM-02 | mouse moves from the item down into the panel → stays open (0.6 s later) | home (header) · d1366, d1366/bn, d1920 | open | ✅ 3/3 |
| MM-03 | mouse leaves the panel → closes after ~250 ms (200–360) | home (header) · d1366, d1366/bn, d1920 | 276–280 ms | ✅ 3/3 |
| MM-04 | mouse just passes over an item (60 ms) → panel never opens | home (header) · d1366, d1366/bn, d1920 | stayed closed | ✅ 3/3 |
| MM-05 | mouse leaves the item (not into the panel) → closes after ~250 ms (200–360) | home (header) · d1366, d1366/bn, d1920 | 264–280 ms | ✅ 3/3 |
| MM-06 | panel open, mouse slides to the next item → switches at once (≤ 120 ms incl. measuring) | home (header) · d1366, d1366/bn, d1920 | 30–50 ms | ✅ 3/3 |
| MM-07 | Esc → closes at once, keyboard focus on the menu item | home (header) · d1366, d1366/bn, d1920 | closed · focus on item | ✅ 3/3 |
| MM-08 | 20 fast enter/leave cycles ending outside → closed, and nothing re-opens later | home (header) · d1366, d1366/bn, d1920 | +0.5 s closed · +1.3 s closed | ✅ 3/3 |
| MM-09 | 20 fast cycles ending ON the item → open (after the 150 ms intent) | home (header) · d1366, d1366/bn, d1920 | open | ✅ 3/3 |
| MM-10 | click anywhere outside → closed | home (header) · d1366, d1366/bn, d1920 | closed | ✅ 3/3 |
| MM-11 | click a link inside the panel → new page, panel closed (no stale open state) | home (header) · d1366, d1366/bn, d1920 | page category · panel closed · aria-expanded=true on 0 item(s) | ✅ 3/3 |
| MM-11b | …and after the mouse moves away the panel is closed | home (header) · d1366, d1366/bn, d1920 | closed | ✅ 3/3 |
| MM-12 | keyboard: Space opens; focus moves out of nav + panel → closes | home (header) · d1366, d1366/bn, d1920 | Space: open · focus out: closed | ✅ 3/3 |
| TT-01 | WhatsApp tip: shows on hover (~0.18 s), clears on leave (≤ 0.4 s) | home (header) · d1366, d1366/bn, d1920 | in 157 ms · out 134 ms | ✅ 3/3 |
| TT-02 | after clicking the WhatsApp icon with the mouse and moving away, the tip clears | home (header) · d1366, d1366/bn, d1920 | cleared | ✅ 3/3 |
| TT-03 | header icon label: appears after the 0.25 s delay (0.25–0.5 s), clears on leave (≤ 0.3 s) | home (header) · d1366, d1366/bn, d1920 | in 390 ms · out 110 ms | ✅ 3/3 |
| TT-04 | 20 fast passes over a header icon → no label left showing | home (header) · d1366, d1366/bn, d1920 | opacity 0 | ✅ 3/3 |
| CD-01 | card hover: back view + quick-add show; leave: both clear (0.2 s) | category · d1366, d1366/bn, d1920 | hover alt 1 qa 1 · leave alt 0 qa 0 | ✅ 3/3 |
| CD-02 | 20 fast enter/leave cycles → back view and quick-add both cleared | category · d1366, d1366/bn, d1920 | alt 0 · qa 0 | ✅ 3/3 |
| CD-03 | quick-add a size (page redraws), then leave → no quick-add panel left open | category · d1366, d1366/bn, d1920 | 0 panel(s) open | ✅ 3/3 |
| CD-04 | click a quick-add size that is already in the bag (toast, no redraw), then leave → panel clears | category · d1366, d1366/bn, d1920 | toast "Already in your bag — size XL. Change th" · after leave: 1 panel(s) open · focus on quick-add button (STUCK open via :focus-within) | ❌ 3/3 |
| CD-04b | …a click elsewhere then clears it | category · d1366, d1366/bn, d1920 | 0 panel(s) open | ✅ 3/3 |
| TO-01 | toast disappears after 2.6 s (2.5–2.8) | home · d1366, d1366/bn, d1920 | 2617–2624 ms | ✅ 3/3 |
| TO-02 | a toast never blocks a click on what is under it | home · d1366, d1366/bn, d1920 | pointer-events none · element under the toast reachable: true | ✅ 3/3 |
| TO-03 | a new toast 2 s after another gets its own full 2.6 s | home · d1366, d1366/bn, d1920 | 2610–2615 ms | ✅ 3/3 |
| TO-04 | bag "Undo" toast stays 6 s (5.9–6.3) | home · d1366, d1366/bn, d1920 | 6016–6028 ms | ✅ 3/3 |
| TO-05 | toast with a "View bag" / "Undo" link: does NOT vanish while the mouse is on it (WCAG 2.2.1) | home · d1366, d1366/bn, d1920 | vanished after 2608 ms with the mouse on the link | ❌ 3/3 |
| HA-01 | header motion stops after 3 rounds | home (header) · d1366, d1920 | element has no motion on desktop (nothing to stop) | ✅ 6/8 |
| HA-02 | hover restarts the motion | home (header) · d1366, d1920 | no motion defined for this element on desktop | ✅ 4/6 |
| OV Menu (x) | Menu: open → page locked; close (x) → unlocked, same scroll spot, focus back on opener | home · phone | open: locked (body hidden) · close: closed, body "visible", y 600→600, page scrolls after: yes · focus → opener | ✅ 1/1 |
| OV Menu (backdrop) | Menu: open → page locked; close (backdrop) → unlocked, same scroll spot, focus back on opener | home · phone | open: locked (body hidden) · close: closed, body "visible", y 600→600, page scrolls after: yes · focus → opener | ✅ 1/1 |
| OV Menu (back) | Menu: open → page locked; close (back) → unlocked, same scroll spot, focus back on opener | home · phone | open: locked (body hidden) · close: closed, body "visible", y 600→600, page scrolls after: yes · focus → opener | ✅ 1/1 |
| OV Menu (swipe) | Menu: open → page locked; close (swipe) → unlocked, same scroll spot, focus back on opener | home · phone | open: locked (body hidden) · close: closed, body "visible", y 600→600, page scrolls after: yes · focus → opener | ✅ 1/1 |
| OV Search (x) | Search: open → page locked; close (x) → unlocked, same scroll spot, focus back on opener | home · phone | open: locked (body hidden) · close: closed, body "visible", y 600→600, page scrolls after: yes · focus → opener | ✅ 1/1 |
| OV Filter sheet (x) | Filter sheet: open → page locked; close (x) → unlocked, same scroll spot, focus back on opener | category · phone | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ 1/1 |
| OV Size chart (x) | Size chart: open → page locked; close (x) → unlocked, same scroll spot, focus back on opener | product · phone | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ 1/1 |
| OV Find my size (backdrop) | Find my size: open → page locked; close (backdrop) → unlocked, same scroll spot, focus back on opener | product · phone | open: locked (body hidden) · close: closed, body "visible", y 326→326, page scrolls after: yes · focus → opener | ✅ 1/1 |
| OV All colours (x) | All colours: open → page locked; close (x) → unlocked, same scroll spot, focus back on opener | product · phone | open: locked (body hidden) · close: closed, body "visible", y 164→164, page scrolls after: yes · focus → opener | ✅ 1/1 |
| OV Photo zoom (x) | Photo zoom: open → page locked; close (x) → unlocked, same scroll spot, focus back on opener | product · phone | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → MAIN.page | ✅ 1/1 |
| OV Photo zoom (swipedown) | Photo zoom: open → page locked; close (swipedown) → unlocked, same scroll spot, focus back on opener | product · phone | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → MAIN.page | ✅ 1/1 |
| OV Added-to-bag sheet (x) | Added-to-bag sheet: open → page locked; close (x) → unlocked, same scroll spot, focus back on opener | product · phone | open: locked (body hidden) · close: closed, body "visible", y 366→366, page scrolls after: yes · focus → opener | ✅ 1/1 |
| OV Your size popup (x) | Your size popup: open → page locked; close (x) → unlocked, same scroll spot, focus back on opener | account · phone | open: locked (body hidden) · close: closed, body "visible", y 674→674, page scrolls after: yes · focus → opener | ✅ 1/1 |
| OV Combo photo zoom (x) | Combo photo zoom: open → page locked; close (x) → unlocked, same scroll spot, focus back on opener | combo pair · phone | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ 1/1 |
| OV Desktop search (esc) | Desktop search: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | home · d1366, d1366/bn, d1920 | open: lock n/a (body visible) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ 3/3 |
| OV Size chart (esc) | Size chart: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | product · d1366, d1366/bn, d1920 | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ 3/3 |
| OV Size chart (backdrop) | Size chart: open → page locked; close (backdrop) → unlocked, same scroll spot, focus back on opener | product · d1366, d1366/bn, d1920 | open: locked (body hidden) · close: closed, body "visible", y 400→400, page scrolls after: yes · focus → opener | ✅ 3/3 |
| OV Find my size (x) | Find my size: open → page locked; close (x) → unlocked, same scroll spot, focus back on opener | product · d1366, d1366/bn, d1920 | open: locked (body hidden) · close: closed, body "visible", y 800→800, page scrolls after: yes · focus → opener | ✅ 3/3 |
| OV Photo zoom (esc) | Photo zoom: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | product · d1366, d1366/bn, d1920 | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ 3/3 |
| OV Added-to-bag drawer (esc) | Added-to-bag drawer: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | product · d1366, d1366/bn, d1920 | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ 3/3 |
| OV Combo photo zoom (esc) | Combo photo zoom: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | combo pair · d1366, d1366/bn, d1920 | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ 3/3 |
| OV Invoice (esc) | Invoice: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | account orders · d1366, d1920 | open: locked (body hidden) · close: closed, body "visible", y 541→541, page scrolls after: yes · focus → opener | ✅ 2/2 |
| OV Order sheet (esc) | Order sheet: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | admin orders · d1366, d1920 | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ 2/2 |
| OV PR panel (esc) | PR panel: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | admin register · d1366, d1920 | open: lock n/a (body visible) · close: closed, body "visible", y 409→409, page scrolls after: yes · focus → BODY | ❌ 2/2 |
| OV Section editor (esc) | Section editor: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | admin layout · d1366, d1920 | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ 2/2 |
| SB-01 | bag buy bar: shown at top · steps aside when the summary Checkout is on screen · back when scrolled up again | bag · phone | top shown · at Checkout aside · back up shown | ✅ 1/1 |
| SB-02 | WhatsApp disc vs footer | category · phone | no floating disc on this build (header WhatsApp only) | — info |
| SB-03 | landing buy bar: away while the order form is on screen, back when it scrolls off | landing · phone | top shown · at form away · back up shown | ✅ 1/1 |
| SB-04 | checkout header WhatsApp: hidden while "Need help?" is on screen, shown after it scrolls away, hidden again on the way up | checkout · phone | top hidden · scrolled shown · back up hidden | ✅ 1/1 |
| SB-05 | desktop sticky buy bar: off at top · on once the buttons pass under the header · off (and inert) again on the way up | product · d1366, d1920 | top off · on at y 1080 (buttons under header: true) · back up off (inert) | ✅ 2/2 |
| BP-01 | popup (owner setting: scroll 60 %, wait 10 s from arrival): nothing before 60 %, opens once past it and the wait is over | journal post · d1366, d1920, phone | 48 %: none · 66 %: opened 7844 ms later (wait left was 7795 ms) | ✅ 3/3 |
| BP-02 | blog popup: page locked while open, focus inside; "No thanks" → unlocked at the same spot | journal post · d1366, d1920, phone | open: locked · focus inside true · closed: yes, y 2350→2350, scrolls after yes | ✅ 3/3 |
| BP-03 | popup does not come back on the same visit (cap: once per session) | journal post · d1366, d1920, phone | stayed closed | ✅ 3/3 |
| BP-04 | tab bar slides away while reading down, comes back on a scroll up | journal post (no popup) · phone | down away · up back | ✅ 1/1 |
| BP-05 | slim bar: comes on past 60 % only while the tab bar is away; goes when the tab bar returns or below 45 %; never stacked with the tab bar | journal post (no popup) · phone | first on at 67 % · off again at 77 % · stacked frames 0 | ✅ 1/1 |
| SC-01 | side-canvas motion frames advance on their own | home (side canvas) · d1920 | 0,0,1,0 → 2,0,2,0 | ✅ 1/1 |
| SC-02 | mouse resting on a rotating side offer → it holds still (same rule as the sliders) | home (side canvas) · d1920 | kept rotating under the mouse (2,0,2,0 → 3,0,3,0) | ❌ 1/1 |
| SC-03 | rotating zone pauses while off-screen and resumes when back (next frame ≤ one cycle, 2.2 s) | home (side canvas) · d1920 | off-screen: paused, frame 3→3 · back: next frame after 1241 ms | ✅ 1/1 |
| SC-04 | side popup zone | home (side canvas) · d1920 | zone exists in settings (active true) but is not drawn on this page | — info |
| PO-01 | share row (owner switch, off by default — tested switched on) tidies itself away after 8 s if unused (7.8–8.4 s) | product · d1366, phone | opened · closed after 8056 ms | ✅ 2/2 |
| PO-02 | share row closed with its own button and opened again 5 s later → gets its own full 8 s | product · d1366, phone | closed after 1597 ms | ❌ 2/2 |
| PO-03 | after closing the share row with its own button, the next click elsewhere does not redraw the page (no left-over listener) | product · d1366, phone | 2 extra page redraw(s) | ❌ 2/2 |
| PO-04 | sort menu: opens; Esc closes and focus goes back to the Sort button | category · d1366, phone | opened · Esc: closed · focus LOST (body) | ❌ 2/2 |
| PTR-01 | short pull (not past the line) shows the arrow; letting go hides it again (≤ 0.3 s) | category · phone | pulling: opacity 0.7692 "Pull to refresh" · released: opacity 0 | ✅ 1/1 |
| PTR-02 | pull, then the touch is cancelled (system gesture / call / notification) → indicator resets | category · phone | pulling: opacity 1 "Release to refresh" · after cancel: opacity 1 "Release to refresh" (STUCK on screen) | ❌ 1/1 |
| PTR-02b | …and the next ordinary tap clears it | category · phone | opacity 0 | ✅ 1/1 |
| PTR-03 | pull past the line → "Release to refresh" → let go → page reloads (~0.35 s) | category · phone | "Release to refresh" · reloaded | ✅ 1/1 |
| PTR-04 | after the reload no indicator is left on screen | category · phone | none | ✅ 1/1 |
| SW-01 | edge swipe from the left = one page back (product → category), never two | product → category · phone | landed on category | ✅ 1/1 |
| ST-01 | press and hold "+" → starts repeating after 0.45 s; let go → stops at once | product (size finder) · d1366, phone | held 1.3 s: 17000 steps (raw) · after release +0.6 s: 0 more | ✅ 2/2 |
| ST-02 | press "+", slide the mouse off the button while still pressed → repeating stops | product (size finder) · d1366, phone | stopped | ✅ 2/2 |
| RO-01 | rotating offer card: a finger resting on it holds it (like the sliders' 4 s hold) | account (For you) · phone | turned under the finger (0 → 1) after 4200 ms | ❌ 1/1 |
| RO-02 | rotating offer card: keyboard focus on its link holds it (focus never left on a hidden slide) | account (For you) · phone | turned away: focus left on a HIDDEN slide (tabindex -1) | ❌ 1/1 |
| IN-01 | welcome popup on a first visit: opens ~0.35 s after load, locks; Esc closes and unlocks | home (first visit) · phone | opened 263 ms after reload · body "hidden" · after Esc closed body "" | ✅ 1/1 |
| TM-01 | no forever timer keeps running on a shop page with nothing moving (R15 bug-20 rule) | category (idle) · phone | 1 interval(s) alive: 30000 ms file:///tmp/claude-0/-home-claude/a27f8d4d-b57b-5d41-b919-c637e74e7368/scratchpad/timing-audit/timing.html:31668:1 | ❌ 1/1 |
| HR-04b | click the hero › arrow, then flick the mouse straight off the slider → moving again (≤ 500 ms) | home · d1366, d1366/bn, d1920 | NOT moving after 8 s (hover flag true, focus on "hm-slnav next") | ❌ 3/3 |

## Appendix — every run (raw, 23:21)

Checks: 505 · ✅ 426 · ❌ 71 · — 8

| # | Suite | ID | Device | Lang | Page | Stop / resume checked | Measured | Result |
|---|---|---|---|---|---|---|---|---|
| 1 | sliders | SL-01 hm-sltrack | d1366 | en | home | drifts on its own (no mouse) | moving (10.0 px / 0.5 s) | ✅ |
| 2 | sliders | SL-02 hm-sltrack | d1366 | en | home | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 3 | sliders | SL-03 hm-sltrack | d1366 | en | home | mouse leaves → moving again (≤ 500 ms) | 64 ms | ✅ |
| 4 | sliders | SL-04 hm-sltrack | d1366 | en | home | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 96 ms | ✅ |
| 5 | sliders | SL-05 hm-sltrack | d1366 | en | home | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 92 ms | ✅ |
| 6 | sliders | SL-06b hm-sltrack | d1366 | en | home | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | row moved 100 px for a 100 px drag | ✅ |
| 7 | sliders | SL-06 hm-sltrack | d1366 | en | home | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 193 ms after release | ✅ |
| 8 | sliders | SL-07 hm-sltrack | d1366 | en | home | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4340 ms after leave | ❌ |
| 9 | sliders | SL-08 hm-sltrack | d1366 | en | home | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 10 | sliders | SL-01 hm-flash1 | d1366 | en | home | drifts on its own (no mouse) | moving (12.0 px / 0.5 s) | ✅ |
| 11 | sliders | SL-02 hm-flash1 | d1366 | en | home | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 12 | sliders | SL-03 hm-flash1 | d1366 | en | home | mouse leaves → moving again (≤ 500 ms) | 70 ms | ✅ |
| 13 | sliders | SL-04 hm-flash1 | d1366 | en | home | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 58 ms | ✅ |
| 14 | sliders | SL-05 hm-flash1 | d1366 | en | home | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 57 ms | ✅ |
| 15 | sliders | SL-06b hm-flash1 | d1366 | en | home | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | row moved 100 px for a 100 px drag | ✅ |
| 16 | sliders | SL-06 hm-flash1 | d1366 | en | home | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 196 ms after release | ✅ |
| 17 | sliders | SL-07 hm-flash1 | d1366 | en | home | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4381 ms after leave | ❌ |
| 18 | sliders | SL-08 hm-flash1 | d1366 | en | home | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 19 | sliders | SL-01 hm-flash2 | d1366 | en | home | drifts on its own (no mouse) | moving (-11.0 px / 0.5 s) | ✅ |
| 20 | sliders | SL-02 hm-flash2 | d1366 | en | home | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 21 | sliders | SL-03 hm-flash2 | d1366 | en | home | mouse leaves → moving again (≤ 500 ms) | 70 ms | ✅ |
| 22 | sliders | SL-04 hm-flash2 | d1366 | en | home | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 64 ms | ✅ |
| 23 | sliders | SL-05 hm-flash2 | d1366 | en | home | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 67 ms | ✅ |
| 24 | sliders | SL-06b hm-flash2 | d1366 | en | home | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | row moved 100 px for a 100 px drag | ✅ |
| 25 | sliders | SL-06 hm-flash2 | d1366 | en | home | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 187 ms after release | ✅ |
| 26 | sliders | SL-07 hm-flash2 | d1366 | en | home | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4342 ms after leave | ❌ |
| 27 | sliders | SL-08 hm-flash2 | d1366 | en | home | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 28 | sliders | SL-01 hm-revtrack | d1366 | en | home | drifts on its own (no mouse) | moving (10.0 px / 0.5 s) | ✅ |
| 29 | sliders | SL-02 hm-revtrack | d1366 | en | home | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 30 | sliders | SL-03 hm-revtrack | d1366 | en | home | mouse leaves → moving again (≤ 500 ms) | 61 ms | ✅ |
| 31 | sliders | SL-04 hm-revtrack | d1366 | en | home | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 61 ms | ✅ |
| 32 | sliders | SL-05 hm-revtrack | d1366 | en | home | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 70 ms | ✅ |
| 33 | sliders | SL-06b hm-revtrack | d1366 | en | home | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | row moved 100 px for a 100 px drag | ✅ |
| 34 | sliders | SL-06 hm-revtrack | d1366 | en | home | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 192 ms after release | ✅ |
| 35 | sliders | SL-07 hm-revtrack | d1366 | en | home | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4431 ms after leave | ❌ |
| 36 | sliders | SL-08 hm-revtrack | d1366 | en | home | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 37 | sliders | HR-01 | d1366 | en | home | hero arrows fade in on hover, fade out on leave (0.15 s) | in 1 · out 0 | ✅ |
| 38 | sliders | HR-02 | d1366 | en | home | click › → moves exactly one card | 234.0 px (one card = 234 px) | ✅ |
| 39 | sliders | HR-03 | d1366 | en | home | mouse resting on the arrow after the click → row still | still | ✅ |
| 40 | sliders | HR-04 | d1366 | en | home | after clicking an arrow, the mouse leaves the slider → moving again (≤ 500 ms) | 81 ms | ✅ |
| 41 | sliders | HR-05 | d1366 | en | home | after an arrow click and leave, the arrows fade out again | opacity 1 | ❌ |
| 42 | sliders | HR-06 | d1366 | en | home | …then a click elsewhere on the page → moving again | 1525 ms after the click — 1.5 s focus grace by design | ✅ |
| 43 | sliders | HR-07 | d1366 | en | home | keyboard focus on a hero slide → still | still | ✅ |
| 44 | sliders | HR-08 | d1366 | en | home | keyboard focus leaves the hero → moving again after the 1.5 s grace | 1528 ms | ✅ |
| 45 | sliders | SL-09 hm-flash1 | d1366 | en | home | scrolling the page DOWN with the wheel while the cursor passes over the row → once the row is out from under the cursor it moves again (≤ 500 ms) | 3999 ms after the last wheel step (hover flag false) | ❌ |
| 46 | sliders | SL-09 hm-revtrack | d1366 | en | home | scrolling the page DOWN with the wheel while the cursor passes over the row → once the row is out from under the cursor it moves again (≤ 500 ms) | 4046 ms after the last wheel step (hover flag false) | ❌ |
| 47 | sliders | SL-10 hm-revtrack | d1366 | en | home | page redraws (heart / quick add / language) while the mouse rests on the row → row stays still under the cursor | still | ✅ |
| 48 | sliders | SL-10b hm-revtrack | d1366 | en | home | …after the redraw, the next small mouse move stops it | still | ✅ |
| 49 | sliders | SL-01 cat-bn-sl | d1366 | en | category | drifts on its own (no mouse) | moving (11.0 px / 0.5 s) | ✅ |
| 50 | sliders | SL-02 cat-bn-sl | d1366 | en | category | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 51 | sliders | SL-03 cat-bn-sl | d1366 | en | category | mouse leaves → moving again (≤ 500 ms) | 57 ms | ✅ |
| 52 | sliders | SL-04 cat-bn-sl | d1366 | en | category | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 61 ms | ✅ |
| 53 | sliders | SL-05 cat-bn-sl | d1366 | en | category | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 55 ms | ✅ |
| 54 | sliders | SL-06b cat-bn-sl | d1366 | en | category | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | browser ghost drag started (dragstart ×1) · row moved 0 px for a 100 px drag | ❌ |
| 55 | sliders | SL-06 cat-bn-sl | d1366 | en | category | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 34 ms after release | ✅ |
| 56 | sliders | SL-07 cat-bn-sl | d1366 | en | category | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4063 ms after leave | ❌ |
| 57 | sliders | SL-08 cat-bn-sl | d1366 | en | category | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 58 | sliders | SL-10 cat-bn-sl | d1366 | en | category | page redraws (heart / quick add / language) while the mouse rests on the row → row stays still under the cursor | still | ✅ |
| 59 | sliders | SL-10b cat-bn-sl | d1366 | en | category | …after the redraw, the next small mouse move stops it | still | ✅ |
| 60 | sliders | SL-09 cat-bn-sl | d1366 | en | category | scrolling the page DOWN with the wheel while the cursor passes over the row → once the row is out from under the cursor it moves again (≤ 500 ms) | 4046 ms after the last wheel step (hover flag false) | ❌ |
| 61 | sliders | SL-01 sl-pairs-row-d1 | d1366 | en | product | drifts on its own (no mouse) | moving (12.0 px / 0.5 s) | ✅ |
| 62 | sliders | SL-02 sl-pairs-row-d1 | d1366 | en | product | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 63 | sliders | SL-03 sl-pairs-row-d1 | d1366 | en | product | mouse leaves → moving again (≤ 500 ms) | 60 ms | ✅ |
| 64 | sliders | SL-04 sl-pairs-row-d1 | d1366 | en | product | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 67 ms | ✅ |
| 65 | sliders | SL-05 sl-pairs-row-d1 | d1366 | en | product | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 63 ms | ✅ |
| 66 | sliders | SL-06b sl-pairs-row-d1 | d1366 | en | product | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | browser ghost drag started (dragstart ×1) · row moved 0 px for a 100 px drag | ❌ |
| 67 | sliders | SL-06 sl-pairs-row-d1 | d1366 | en | product | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 35 ms after release | ✅ |
| 68 | sliders | SL-07 sl-pairs-row-d1 | d1366 | en | product | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4077 ms after leave | ❌ |
| 69 | sliders | SL-08 sl-pairs-row-d1 | d1366 | en | product | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 70 | sliders | SL-00 | d1366 | en | bag | auto-moving rows on this page | none at this width (rows fit, nothing drifts) | — |
| 71 | sliders | SL-01 acc-row-1 | d1366 | en | account | drifts on its own (no mouse) | moving (10.0 px / 0.5 s) | ✅ |
| 72 | sliders | SL-02 acc-row-1 | d1366 | en | account | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 73 | sliders | SL-03 acc-row-1 | d1366 | en | account | mouse leaves → moving again (≤ 500 ms) | 60 ms | ✅ |
| 74 | sliders | SL-04 acc-row-1 | d1366 | en | account | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 65 ms | ✅ |
| 75 | sliders | SL-05 acc-row-1 | d1366 | en | account | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 74 ms | ✅ |
| 76 | sliders | SL-06b acc-row-1 | d1366 | en | account | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | browser ghost drag started (dragstart ×1) · row moved 0 px for a 100 px drag | ❌ |
| 77 | sliders | SL-06 acc-row-1 | d1366 | en | account | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 33 ms after release | ✅ |
| 78 | sliders | SL-07 acc-row-1 | d1366 | en | account | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4041 ms after leave | ❌ |
| 79 | sliders | SL-08 acc-row-1 | d1366 | en | account | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 80 | sliders | SL-01 acc-row-2 | d1366 | en | account | drifts on its own (no mouse) | moving (-10.0 px / 0.5 s) | ✅ |
| 81 | sliders | SL-02 acc-row-2 | d1366 | en | account | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 82 | sliders | SL-03 acc-row-2 | d1366 | en | account | mouse leaves → moving again (≤ 500 ms) | 59 ms | ✅ |
| 83 | sliders | SL-04 acc-row-2 | d1366 | en | account | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 64 ms | ✅ |
| 84 | sliders | SL-05 acc-row-2 | d1366 | en | account | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 68 ms | ✅ |
| 85 | sliders | SL-06b acc-row-2 | d1366 | en | account | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | browser ghost drag started (dragstart ×1) · row moved 0 px for a 100 px drag | ❌ |
| 86 | sliders | SL-06 acc-row-2 | d1366 | en | account | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 20 ms after release | ✅ |
| 87 | sliders | SL-07 acc-row-2 | d1366 | en | account | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4061 ms after leave | ❌ |
| 88 | sliders | SL-08 acc-row-2 | d1366 | en | account | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 89 | sliders | SL-01 acc-row-3 | d1366 | en | account | drifts on its own (no mouse) | moving (10.0 px / 0.5 s) | ✅ |
| 90 | sliders | SL-02 acc-row-3 | d1366 | en | account | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 91 | sliders | SL-03 acc-row-3 | d1366 | en | account | mouse leaves → moving again (≤ 500 ms) | 60 ms | ✅ |
| 92 | sliders | SL-04 acc-row-3 | d1366 | en | account | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 73 ms | ✅ |
| 93 | sliders | SL-05 acc-row-3 | d1366 | en | account | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 66 ms | ✅ |
| 94 | sliders | SL-06b acc-row-3 | d1366 | en | account | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | browser ghost drag started (dragstart ×1) · row moved 0 px for a 100 px drag | ❌ |
| 95 | sliders | SL-06 acc-row-3 | d1366 | en | account | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 19 ms after release | ✅ |
| 96 | sliders | SL-07 acc-row-3 | d1366 | en | account | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4048 ms after leave | ❌ |
| 97 | sliders | SL-08 acc-row-3 | d1366 | en | account | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 98 | sliders | SL-01 acc-row-4 | d1366 | en | account | drifts on its own (no mouse) | moving (-10.0 px / 0.5 s) | ✅ |
| 99 | sliders | SL-02 acc-row-4 | d1366 | en | account | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 100 | sliders | SL-03 acc-row-4 | d1366 | en | account | mouse leaves → moving again (≤ 500 ms) | 68 ms | ✅ |
| 101 | sliders | SL-04 acc-row-4 | d1366 | en | account | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 64 ms | ✅ |
| 102 | sliders | SL-05 acc-row-4 | d1366 | en | account | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 73 ms | ✅ |
| 103 | sliders | SL-06b acc-row-4 | d1366 | en | account | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | browser ghost drag started (dragstart ×1) · row moved 0 px for a 100 px drag | ❌ |
| 104 | sliders | SL-06 acc-row-4 | d1366 | en | account | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 17 ms after release | ✅ |
| 105 | sliders | SL-07 acc-row-4 | d1366 | en | account | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4059 ms after leave | ❌ |
| 106 | sliders | SL-08 acc-row-4 | d1366 | en | account | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 107 | sliders | SL-01 hm-sltrack | d1366 | bn | home | drifts on its own (no mouse) | moving (10.0 px / 0.5 s) | ✅ |
| 108 | sliders | SL-02 hm-sltrack | d1366 | bn | home | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 109 | sliders | SL-03 hm-sltrack | d1366 | bn | home | mouse leaves → moving again (≤ 500 ms) | 61 ms | ✅ |
| 110 | sliders | SL-04 hm-sltrack | d1366 | bn | home | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 95 ms | ✅ |
| 111 | sliders | SL-05 hm-sltrack | d1366 | bn | home | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 102 ms | ✅ |
| 112 | sliders | SL-06b hm-sltrack | d1366 | bn | home | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | row moved 100 px for a 100 px drag | ✅ |
| 113 | sliders | SL-06 hm-sltrack | d1366 | bn | home | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 189 ms after release | ✅ |
| 114 | sliders | SL-07 hm-sltrack | d1366 | bn | home | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4331 ms after leave | ❌ |
| 115 | sliders | SL-08 hm-sltrack | d1366 | bn | home | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 116 | sliders | SL-01 hm-flash1 | d1366 | bn | home | drifts on its own (no mouse) | moving (12.0 px / 0.5 s) | ✅ |
| 117 | sliders | SL-02 hm-flash1 | d1366 | bn | home | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 118 | sliders | SL-03 hm-flash1 | d1366 | bn | home | mouse leaves → moving again (≤ 500 ms) | 64 ms | ✅ |
| 119 | sliders | SL-04 hm-flash1 | d1366 | bn | home | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 68 ms | ✅ |
| 120 | sliders | SL-05 hm-flash1 | d1366 | bn | home | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 64 ms | ✅ |
| 121 | sliders | SL-06b hm-flash1 | d1366 | bn | home | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | row moved 100 px for a 100 px drag | ✅ |
| 122 | sliders | SL-06 hm-flash1 | d1366 | bn | home | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 198 ms after release | ✅ |
| 123 | sliders | SL-07 hm-flash1 | d1366 | bn | home | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4378 ms after leave | ❌ |
| 124 | sliders | SL-08 hm-flash1 | d1366 | bn | home | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 125 | sliders | SL-01 hm-flash2 | d1366 | bn | home | drifts on its own (no mouse) | moving (-13.0 px / 0.5 s) | ✅ |
| 126 | sliders | SL-02 hm-flash2 | d1366 | bn | home | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 127 | sliders | SL-03 hm-flash2 | d1366 | bn | home | mouse leaves → moving again (≤ 500 ms) | 62 ms | ✅ |
| 128 | sliders | SL-04 hm-flash2 | d1366 | bn | home | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 52 ms | ✅ |
| 129 | sliders | SL-05 hm-flash2 | d1366 | bn | home | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 62 ms | ✅ |
| 130 | sliders | SL-06b hm-flash2 | d1366 | bn | home | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | row moved 100 px for a 100 px drag | ✅ |
| 131 | sliders | SL-06 hm-flash2 | d1366 | bn | home | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 190 ms after release | ✅ |
| 132 | sliders | SL-07 hm-flash2 | d1366 | bn | home | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4344 ms after leave | ❌ |
| 133 | sliders | SL-08 hm-flash2 | d1366 | bn | home | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 134 | sliders | SL-01 hm-revtrack | d1366 | bn | home | drifts on its own (no mouse) | moving (9.0 px / 0.5 s) | ✅ |
| 135 | sliders | SL-02 hm-revtrack | d1366 | bn | home | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 136 | sliders | SL-03 hm-revtrack | d1366 | bn | home | mouse leaves → moving again (≤ 500 ms) | 62 ms | ✅ |
| 137 | sliders | SL-04 hm-revtrack | d1366 | bn | home | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 62 ms | ✅ |
| 138 | sliders | SL-05 hm-revtrack | d1366 | bn | home | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 69 ms | ✅ |
| 139 | sliders | SL-06b hm-revtrack | d1366 | bn | home | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | row moved 100 px for a 100 px drag | ✅ |
| 140 | sliders | SL-06 hm-revtrack | d1366 | bn | home | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 192 ms after release | ✅ |
| 141 | sliders | SL-07 hm-revtrack | d1366 | bn | home | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4445 ms after leave | ❌ |
| 142 | sliders | SL-08 hm-revtrack | d1366 | bn | home | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 143 | sliders | HR-01 | d1366 | bn | home | hero arrows fade in on hover, fade out on leave (0.15 s) | in 1 · out 0 | ✅ |
| 144 | sliders | HR-02 | d1366 | bn | home | click › → moves exactly one card | 234.0 px (one card = 234 px) | ✅ |
| 145 | sliders | HR-03 | d1366 | bn | home | mouse resting on the arrow after the click → row still | still | ✅ |
| 146 | sliders | HR-04 | d1366 | bn | home | after clicking an arrow, the mouse leaves the slider → moving again (≤ 500 ms) | 71 ms | ✅ |
| 147 | sliders | HR-05 | d1366 | bn | home | after an arrow click and leave, the arrows fade out again | opacity 1 | ❌ |
| 148 | sliders | HR-06 | d1366 | bn | home | …then a click elsewhere on the page → moving again | 1537 ms after the click — 1.5 s focus grace by design | ✅ |
| 149 | sliders | HR-07 | d1366 | bn | home | keyboard focus on a hero slide → still | still | ✅ |
| 150 | sliders | HR-08 | d1366 | bn | home | keyboard focus leaves the hero → moving again after the 1.5 s grace | 1528 ms | ✅ |
| 151 | sliders | SL-09 hm-flash1 | d1366 | bn | home | scrolling the page DOWN with the wheel while the cursor passes over the row → once the row is out from under the cursor it moves again (≤ 500 ms) | 3996 ms after the last wheel step (hover flag false) | ❌ |
| 152 | sliders | SL-09 hm-revtrack | d1366 | bn | home | scrolling the page DOWN with the wheel while the cursor passes over the row → once the row is out from under the cursor it moves again (≤ 500 ms) | 4029 ms after the last wheel step (hover flag false) | ❌ |
| 153 | sliders | SL-10 hm-revtrack | d1366 | bn | home | page redraws (heart / quick add / language) while the mouse rests on the row → row stays still under the cursor | still | ✅ |
| 154 | sliders | SL-10b hm-revtrack | d1366 | bn | home | …after the redraw, the next small mouse move stops it | still | ✅ |
| 155 | sliders | SL-01 cat-bn-sl | d1366 | bn | category | drifts on its own (no mouse) | moving (11.0 px / 0.5 s) | ✅ |
| 156 | sliders | SL-02 cat-bn-sl | d1366 | bn | category | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 157 | sliders | SL-03 cat-bn-sl | d1366 | bn | category | mouse leaves → moving again (≤ 500 ms) | 62 ms | ✅ |
| 158 | sliders | SL-04 cat-bn-sl | d1366 | bn | category | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 68 ms | ✅ |
| 159 | sliders | SL-05 cat-bn-sl | d1366 | bn | category | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 58 ms | ✅ |
| 160 | sliders | SL-06b cat-bn-sl | d1366 | bn | category | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | browser ghost drag started (dragstart ×1) · row moved 0 px for a 100 px drag | ❌ |
| 161 | sliders | SL-06 cat-bn-sl | d1366 | bn | category | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 25 ms after release | ✅ |
| 162 | sliders | SL-07 cat-bn-sl | d1366 | bn | category | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4048 ms after leave | ❌ |
| 163 | sliders | SL-08 cat-bn-sl | d1366 | bn | category | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 164 | sliders | SL-01 hm-sltrack | d1920 | en | home | drifts on its own (no mouse) | moving (10.0 px / 0.5 s) | ✅ |
| 165 | sliders | SL-02 hm-sltrack | d1920 | en | home | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 166 | sliders | SL-03 hm-sltrack | d1920 | en | home | mouse leaves → moving again (≤ 500 ms) | 56 ms | ✅ |
| 167 | sliders | SL-04 hm-sltrack | d1920 | en | home | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 61 ms | ✅ |
| 168 | sliders | SL-05 hm-sltrack | d1920 | en | home | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 64 ms | ✅ |
| 169 | sliders | SL-06b hm-sltrack | d1920 | en | home | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | row moved 100 px for a 100 px drag | ✅ |
| 170 | sliders | SL-06 hm-sltrack | d1920 | en | home | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 196 ms after release | ✅ |
| 171 | sliders | SL-07 hm-sltrack | d1920 | en | home | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4378 ms after leave | ❌ |
| 172 | sliders | SL-08 hm-sltrack | d1920 | en | home | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 173 | sliders | SL-01 hm-flash1 | d1920 | en | home | drifts on its own (no mouse) | moving (11.0 px / 0.5 s) | ✅ |
| 174 | sliders | SL-02 hm-flash1 | d1920 | en | home | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 175 | sliders | SL-03 hm-flash1 | d1920 | en | home | mouse leaves → moving again (≤ 500 ms) | 62 ms | ✅ |
| 176 | sliders | SL-04 hm-flash1 | d1920 | en | home | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 64 ms | ✅ |
| 177 | sliders | SL-05 hm-flash1 | d1920 | en | home | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 69 ms | ✅ |
| 178 | sliders | SL-06b hm-flash1 | d1920 | en | home | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | row moved 100 px for a 100 px drag | ✅ |
| 179 | sliders | SL-06 hm-flash1 | d1920 | en | home | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 199 ms after release | ✅ |
| 180 | sliders | SL-07 hm-flash1 | d1920 | en | home | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4431 ms after leave | ❌ |
| 181 | sliders | SL-08 hm-flash1 | d1920 | en | home | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 182 | sliders | SL-01 hm-flash2 | d1920 | en | home | drifts on its own (no mouse) | moving (-12.0 px / 0.5 s) | ✅ |
| 183 | sliders | SL-02 hm-flash2 | d1920 | en | home | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 184 | sliders | SL-03 hm-flash2 | d1920 | en | home | mouse leaves → moving again (≤ 500 ms) | 72 ms | ✅ |
| 185 | sliders | SL-04 hm-flash2 | d1920 | en | home | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 69 ms | ✅ |
| 186 | sliders | SL-05 hm-flash2 | d1920 | en | home | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 70 ms | ✅ |
| 187 | sliders | SL-06b hm-flash2 | d1920 | en | home | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | row moved 100 px for a 100 px drag | ✅ |
| 188 | sliders | SL-06 hm-flash2 | d1920 | en | home | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 201 ms after release | ✅ |
| 189 | sliders | SL-07 hm-flash2 | d1920 | en | home | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4381 ms after leave | ❌ |
| 190 | sliders | SL-08 hm-flash2 | d1920 | en | home | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 191 | sliders | SL-01 hm-revtrack | d1920 | en | home | drifts on its own (no mouse) | moving (9.0 px / 0.5 s) | ✅ |
| 192 | sliders | SL-02 hm-revtrack | d1920 | en | home | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 193 | sliders | SL-03 hm-revtrack | d1920 | en | home | mouse leaves → moving again (≤ 500 ms) | 60 ms | ✅ |
| 194 | sliders | SL-04 hm-revtrack | d1920 | en | home | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 96 ms | ✅ |
| 195 | sliders | SL-05 hm-revtrack | d1920 | en | home | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 54 ms | ✅ |
| 196 | sliders | SL-06b hm-revtrack | d1920 | en | home | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | row moved 100 px for a 100 px drag | ✅ |
| 197 | sliders | SL-06 hm-revtrack | d1920 | en | home | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 186 ms after release | ✅ |
| 198 | sliders | SL-07 hm-revtrack | d1920 | en | home | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4410 ms after leave | ❌ |
| 199 | sliders | SL-08 hm-revtrack | d1920 | en | home | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 200 | sliders | HR-01 | d1920 | en | home | hero arrows fade in on hover, fade out on leave (0.15 s) | in 1 · out 0 | ✅ |
| 201 | sliders | HR-02 | d1920 | en | home | click › → moves exactly one card | 282.0 px (one card = 282 px) | ✅ |
| 202 | sliders | HR-03 | d1920 | en | home | mouse resting on the arrow after the click → row still | still | ✅ |
| 203 | sliders | HR-04 | d1920 | en | home | after clicking an arrow, the mouse leaves the slider → moving again (≤ 500 ms) | 71 ms | ✅ |
| 204 | sliders | HR-05 | d1920 | en | home | after an arrow click and leave, the arrows fade out again | opacity 1 | ❌ |
| 205 | sliders | HR-06 | d1920 | en | home | …then a click elsewhere on the page → moving again | 1523 ms after the click — 1.5 s focus grace by design | ✅ |
| 206 | sliders | HR-07 | d1920 | en | home | keyboard focus on a hero slide → still | still | ✅ |
| 207 | sliders | HR-08 | d1920 | en | home | keyboard focus leaves the hero → moving again after the 1.5 s grace | 1528 ms | ✅ |
| 208 | sliders | SL-09 hm-flash1 | d1920 | en | home | scrolling the page DOWN with the wheel while the cursor passes over the row → once the row is out from under the cursor it moves again (≤ 500 ms) | 3991 ms after the last wheel step (hover flag false) | ❌ |
| 209 | sliders | SL-09 hm-revtrack | d1920 | en | home | scrolling the page DOWN with the wheel while the cursor passes over the row → once the row is out from under the cursor it moves again (≤ 500 ms) | 4033 ms after the last wheel step (hover flag false) | ❌ |
| 210 | sliders | SL-10 hm-revtrack | d1920 | en | home | page redraws (heart / quick add / language) while the mouse rests on the row → row stays still under the cursor | still | ✅ |
| 211 | sliders | SL-10b hm-revtrack | d1920 | en | home | …after the redraw, the next small mouse move stops it | still | ✅ |
| 212 | sliders | SL-01 cat-bn-sl | d1920 | en | category | drifts on its own (no mouse) | moving (11.0 px / 0.5 s) | ✅ |
| 213 | sliders | SL-02 cat-bn-sl | d1920 | en | category | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 214 | sliders | SL-03 cat-bn-sl | d1920 | en | category | mouse leaves → moving again (≤ 500 ms) | 57 ms | ✅ |
| 215 | sliders | SL-04 cat-bn-sl | d1920 | en | category | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 61 ms | ✅ |
| 216 | sliders | SL-05 cat-bn-sl | d1920 | en | category | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 68 ms | ✅ |
| 217 | sliders | SL-06b cat-bn-sl | d1920 | en | category | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | browser ghost drag started (dragstart ×1) · row moved 0 px for a 100 px drag | ❌ |
| 218 | sliders | SL-06 cat-bn-sl | d1920 | en | category | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 27 ms after release | ✅ |
| 219 | sliders | SL-07 cat-bn-sl | d1920 | en | category | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4049 ms after leave | ❌ |
| 220 | sliders | SL-08 cat-bn-sl | d1920 | en | category | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 221 | sliders | SL-10 cat-bn-sl | d1920 | en | category | page redraws (heart / quick add / language) while the mouse rests on the row → row stays still under the cursor | still | ✅ |
| 222 | sliders | SL-10b cat-bn-sl | d1920 | en | category | …after the redraw, the next small mouse move stops it | still | ✅ |
| 223 | sliders | SL-09 cat-bn-sl | d1920 | en | category | scrolling the page DOWN with the wheel while the cursor passes over the row → once the row is out from under the cursor it moves again (≤ 500 ms) | 4046 ms after the last wheel step (hover flag false) | ❌ |
| 224 | sliders | SL-01 sl-pairs-row-d1 | d1920 | en | product | drifts on its own (no mouse) | moving (12.0 px / 0.5 s) | ✅ |
| 225 | sliders | SL-02 sl-pairs-row-d1 | d1920 | en | product | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 226 | sliders | SL-03 sl-pairs-row-d1 | d1920 | en | product | mouse leaves → moving again (≤ 500 ms) | 57 ms | ✅ |
| 227 | sliders | SL-04 sl-pairs-row-d1 | d1920 | en | product | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 81 ms | ✅ |
| 228 | sliders | SL-05 sl-pairs-row-d1 | d1920 | en | product | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 66 ms | ✅ |
| 229 | sliders | SL-06b sl-pairs-row-d1 | d1920 | en | product | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | browser ghost drag started (dragstart ×1) · row moved 0 px for a 100 px drag | ❌ |
| 230 | sliders | SL-06 sl-pairs-row-d1 | d1920 | en | product | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 32 ms after release | ✅ |
| 231 | sliders | SL-07 sl-pairs-row-d1 | d1920 | en | product | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4041 ms after leave | ❌ |
| 232 | sliders | SL-08 sl-pairs-row-d1 | d1920 | en | product | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 233 | sliders | SL-00 | d1920 | en | bag | auto-moving rows on this page | none at this width (rows fit, nothing drifts) | — |
| 234 | sliders | SL-01 acc-row-1 | d1920 | en | account | drifts on its own (no mouse) | moving (10.0 px / 0.5 s) | ✅ |
| 235 | sliders | SL-02 acc-row-1 | d1920 | en | account | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 236 | sliders | SL-03 acc-row-1 | d1920 | en | account | mouse leaves → moving again (≤ 500 ms) | 66 ms | ✅ |
| 237 | sliders | SL-04 acc-row-1 | d1920 | en | account | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 53 ms | ✅ |
| 238 | sliders | SL-05 acc-row-1 | d1920 | en | account | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 60 ms | ✅ |
| 239 | sliders | SL-06b acc-row-1 | d1920 | en | account | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | browser ghost drag started (dragstart ×1) · row moved 0 px for a 100 px drag | ❌ |
| 240 | sliders | SL-06 acc-row-1 | d1920 | en | account | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 22 ms after release | ✅ |
| 241 | sliders | SL-07 acc-row-1 | d1920 | en | account | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4062 ms after leave | ❌ |
| 242 | sliders | SL-08 acc-row-1 | d1920 | en | account | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 243 | sliders | SL-01 acc-row-2 | d1920 | en | account | drifts on its own (no mouse) | moving (-10.0 px / 0.5 s) | ✅ |
| 244 | sliders | SL-02 acc-row-2 | d1920 | en | account | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 245 | sliders | SL-03 acc-row-2 | d1920 | en | account | mouse leaves → moving again (≤ 500 ms) | 63 ms | ✅ |
| 246 | sliders | SL-04 acc-row-2 | d1920 | en | account | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 65 ms | ✅ |
| 247 | sliders | SL-05 acc-row-2 | d1920 | en | account | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 70 ms | ✅ |
| 248 | sliders | SL-06b acc-row-2 | d1920 | en | account | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | browser ghost drag started (dragstart ×1) · row moved 0 px for a 100 px drag | ❌ |
| 249 | sliders | SL-06 acc-row-2 | d1920 | en | account | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 18 ms after release | ✅ |
| 250 | sliders | SL-07 acc-row-2 | d1920 | en | account | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4066 ms after leave | ❌ |
| 251 | sliders | SL-08 acc-row-2 | d1920 | en | account | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 252 | sliders | SL-01 acc-row-3 | d1920 | en | account | drifts on its own (no mouse) | moving (10.0 px / 0.5 s) | ✅ |
| 253 | sliders | SL-02 acc-row-3 | d1920 | en | account | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 254 | sliders | SL-03 acc-row-3 | d1920 | en | account | mouse leaves → moving again (≤ 500 ms) | 67 ms | ✅ |
| 255 | sliders | SL-04 acc-row-3 | d1920 | en | account | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 63 ms | ✅ |
| 256 | sliders | SL-05 acc-row-3 | d1920 | en | account | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 62 ms | ✅ |
| 257 | sliders | SL-06b acc-row-3 | d1920 | en | account | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | browser ghost drag started (dragstart ×1) · row moved 0 px for a 100 px drag | ❌ |
| 258 | sliders | SL-06 acc-row-3 | d1920 | en | account | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 25 ms after release | ✅ |
| 259 | sliders | SL-07 acc-row-3 | d1920 | en | account | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4047 ms after leave | ❌ |
| 260 | sliders | SL-08 acc-row-3 | d1920 | en | account | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 261 | sliders | SL-01 acc-row-4 | d1920 | en | account | drifts on its own (no mouse) | moving (-10.0 px / 0.5 s) | ✅ |
| 262 | sliders | SL-02 acc-row-4 | d1920 | en | account | mouse over → still | still (0 px / 0.7 s) | ✅ |
| 263 | sliders | SL-03 acc-row-4 | d1920 | en | account | mouse leaves → moving again (≤ 500 ms) | 56 ms | ✅ |
| 264 | sliders | SL-04 acc-row-4 | d1920 | en | account | sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms) | 63 ms | ✅ |
| 265 | sliders | SL-05 acc-row-4 | d1920 | en | account | mouse drag released on the row: still while over it; leave → moving (≤ 500 ms) | still while over · leave→move 61 ms | ✅ |
| 266 | sliders | SL-06b acc-row-4 | d1920 | en | account | a mouse drag on the row moves the row (no browser "ghost" link/picture drag) | browser ghost drag started (dragstart ×1) · row moved 0 px for a 100 px drag | ❌ |
| 267 | sliders | SL-06 acc-row-4 | d1920 | en | account | mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms) | 37 ms after release | ✅ |
| 268 | sliders | SL-07 acc-row-4 | d1920 | en | account | mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms) | 4038 ms after leave | ❌ |
| 269 | sliders | SL-08 acc-row-4 | d1920 | en | account | 20 fast enter/leave cycles: ends outside → moving; then inside → still | outside: moving (hover=false, hold=0 ms) · inside: still | ✅ |
| 270 | sliders | SLT-01 hm-sltrack | phone | en | home | drifts on its own | moving | ✅ |
| 271 | sliders | SLT-02 hm-sltrack | phone | en | home | finger tap → stays still 4 s, then drifts (3.8–4.6 s) | 4055 ms | ✅ |
| 272 | sliders | SLT-03 hm-sltrack | phone | en | home | finger swipe → snaps, holds ~4 s, then drifts (total 3.9–5.0 s after lift) | held · ~4219 ms after lift | ✅ |
| 273 | sliders | SLT-04 hm-sltrack | phone | en | home | a tap never leaves the mouse "hover" flag on (the old L27 freeze) | hover flag false | ✅ |
| 274 | sliders | SLT-01 hm-settrack | phone | en | home | drifts on its own | moving | ✅ |
| 275 | sliders | SLT-02 hm-settrack | phone | en | home | finger tap → stays still 4 s, then drifts (3.8–4.6 s) | 4067 ms | ✅ |
| 276 | sliders | SLT-03 hm-settrack | phone | en | home | finger swipe → snaps, holds ~4 s, then drifts (total 3.9–5.0 s after lift) | held · ~4304 ms after lift | ✅ |
| 277 | sliders | SLT-04 hm-settrack | phone | en | home | a tap never leaves the mouse "hover" flag on (the old L27 freeze) | hover flag false | ✅ |
| 278 | sliders | SLT-01 hm-flash1 | phone | en | home | drifts on its own | moving | ✅ |
| 279 | sliders | SLT-02 hm-flash1 | phone | en | home | finger tap → stays still 4 s, then drifts (3.8–4.6 s) | 4046 ms | ✅ |
| 280 | sliders | SLT-03 hm-flash1 | phone | en | home | finger swipe → snaps, holds ~4 s, then drifts (total 3.9–5.0 s after lift) | held · ~4187 ms after lift | ✅ |
| 281 | sliders | SLT-04 hm-flash1 | phone | en | home | a tap never leaves the mouse "hover" flag on (the old L27 freeze) | hover flag false | ✅ |
| 282 | sliders | SLT-01 hm-flash2 | phone | en | home | drifts on its own | moving | ✅ |
| 283 | sliders | SLT-02 hm-flash2 | phone | en | home | finger tap → stays still 4 s, then drifts (3.8–4.6 s) | 4045 ms | ✅ |
| 284 | sliders | SLT-03 hm-flash2 | phone | en | home | finger swipe → snaps, holds ~4 s, then drifts (total 3.9–5.0 s after lift) | held · ~4247 ms after lift | ✅ |
| 285 | sliders | SLT-04 hm-flash2 | phone | en | home | a tap never leaves the mouse "hover" flag on (the old L27 freeze) | hover flag false | ✅ |
| 286 | sliders | SLT-01 hm-revtrack | phone | en | home | drifts on its own | moving | ✅ |
| 287 | sliders | SLT-02 hm-revtrack | phone | en | home | finger tap → stays still 4 s, then drifts (3.8–4.6 s) | 4049 ms | ✅ |
| 288 | sliders | SLT-03 hm-revtrack | phone | en | home | finger swipe → snaps, holds ~4 s, then drifts (total 3.9–5.0 s after lift) | held · ~4371 ms after lift | ✅ |
| 289 | sliders | SLT-04 hm-revtrack | phone | en | home | a tap never leaves the mouse "hover" flag on (the old L27 freeze) | hover flag false | ✅ |
| 290 | sliders | SLT-01 hm-jtrack | phone | en | home | drifts on its own | moving | ✅ |
| 291 | sliders | SLT-02 hm-jtrack | phone | en | home | finger tap → stays still 4 s, then drifts (3.8–4.6 s) | 4063 ms | ✅ |
| 292 | sliders | SLT-03 hm-jtrack | phone | en | home | finger swipe → snaps, holds ~4 s, then drifts (total 3.9–5.0 s after lift) | held · ~4285 ms after lift | ✅ |
| 293 | sliders | SLT-04 hm-jtrack | phone | en | home | a tap never leaves the mouse "hover" flag on (the old L27 freeze) | hover flag false | ✅ |
| 294 | sliders | SLT-01 cat-bn-sl | phone | en | category | drifts on its own | moving | ✅ |
| 295 | sliders | SLT-02 cat-bn-sl | phone | en | category | finger tap → stays still 4 s, then drifts (3.8–4.6 s) | 4054 ms | ✅ |
| 296 | sliders | SLT-03 cat-bn-sl | phone | en | category | finger swipe → snaps, holds ~4 s, then drifts (total 3.9–5.0 s after lift) | held · ~4205 ms after lift | ✅ |
| 297 | sliders | SLT-04 cat-bn-sl | phone | en | category | a tap never leaves the mouse "hover" flag on (the old L27 freeze) | hover flag false | ✅ |
| 298 | sliders | SLT-01 sl-reviews | phone | en | product | drifts on its own | moving | ✅ |
| 299 | sliders | SLT-02 sl-reviews | phone | en | product | finger tap → stays still 4 s, then drifts (3.8–4.6 s) | 4046 ms | ✅ |
| 300 | sliders | SLT-03 sl-reviews | phone | en | product | finger swipe → snaps, holds ~4 s, then drifts (total 3.9–5.0 s after lift) | held · ~4287 ms after lift | ✅ |
| 301 | sliders | SLT-04 sl-reviews | phone | en | product | a tap never leaves the mouse "hover" flag on (the old L27 freeze) | hover flag false | ✅ |
| 302 | sliders | SLT-01 sl-pairs-row-1 | phone | en | product | drifts on its own | moving | ✅ |
| 303 | sliders | SLT-02 sl-pairs-row-1 | phone | en | product | finger tap → stays still 4 s, then drifts (3.8–4.6 s) | 4050 ms | ✅ |
| 304 | sliders | SLT-03 sl-pairs-row-1 | phone | en | product | finger swipe → snaps, holds ~4 s, then drifts (total 3.9–5.0 s after lift) | held · ~4272 ms after lift | ✅ |
| 305 | sliders | SLT-04 sl-pairs-row-1 | phone | en | product | a tap never leaves the mouse "hover" flag on (the old L27 freeze) | hover flag false | ✅ |
| 306 | sliders | SLT-01 bg-upsrow | phone | en | bag | drifts on its own | moving | ✅ |
| 307 | sliders | SLT-02 bg-upsrow | phone | en | bag | finger tap → stays still 4 s, then drifts (3.8–4.6 s) | 4046 ms | ✅ |
| 308 | sliders | SLT-03 bg-upsrow | phone | en | bag | finger swipe → snaps, holds ~4 s, then drifts (total 3.9–5.0 s after lift) | held · ~4218 ms after lift | ✅ |
| 309 | sliders | SLT-04 bg-upsrow | phone | en | bag | a tap never leaves the mouse "hover" flag on (the old L27 freeze) | hover flag false | ✅ |
| 310 | sliders | SLT-01 ty-upsrow | phone | en | thanks | drifts on its own | moving | ✅ |
| 311 | sliders | SLT-02 ty-upsrow | phone | en | thanks | finger tap → stays still 4 s, then drifts (3.8–4.6 s) | 4043 ms | ✅ |
| 312 | sliders | SLT-03 ty-upsrow | phone | en | thanks | finger swipe → snaps, holds ~4 s, then drifts (total 3.9–5.0 s after lift) | held · ~4459 ms after lift | ✅ |
| 313 | sliders | SLT-04 ty-upsrow | phone | en | thanks | a tap never leaves the mouse "hover" flag on (the old L27 freeze) | hover flag false | ✅ |
| 314 | sliders | SLT-01 acc-row-1 | phone | en | account | drifts on its own | moving | ✅ |
| 315 | sliders | SLT-02 acc-row-1 | phone | en | account | finger tap → stays still 4 s, then drifts (3.8–4.6 s) | 4053 ms | ✅ |
| 316 | sliders | SLT-03 acc-row-1 | phone | en | account | finger swipe → snaps, holds ~4 s, then drifts (total 3.9–5.0 s after lift) | held · ~4218 ms after lift | ✅ |
| 317 | sliders | SLT-04 acc-row-1 | phone | en | account | a tap never leaves the mouse "hover" flag on (the old L27 freeze) | hover flag false | ✅ |
| 318 | sliders | SLT-01 acc-row-2 | phone | en | account | drifts on its own | moving | ✅ |
| 319 | sliders | SLT-02 acc-row-2 | phone | en | account | finger tap → stays still 4 s, then drifts (3.8–4.6 s) | 4054 ms | ✅ |
| 320 | sliders | SLT-03 acc-row-2 | phone | en | account | finger swipe → snaps, holds ~4 s, then drifts (total 3.9–5.0 s after lift) | held · ~4241 ms after lift | ✅ |
| 321 | sliders | SLT-04 acc-row-2 | phone | en | account | a tap never leaves the mouse "hover" flag on (the old L27 freeze) | hover flag false | ✅ |
| 322 | hover | MM-01 | d1366 | en | home (header) | mouse rests on a menu item → panel opens after ~150 ms (100–260) | 171 ms | ✅ |
| 323 | hover | MM-02 | d1366 | en | home (header) | mouse moves from the item down into the panel → stays open (0.6 s later) | open | ✅ |
| 324 | hover | MM-03 | d1366 | en | home (header) | mouse leaves the panel → closes after ~250 ms (200–360) | 279 ms | ✅ |
| 325 | hover | MM-04 | d1366 | en | home (header) | mouse just passes over an item (60 ms) → panel never opens | stayed closed | ✅ |
| 326 | hover | MM-05 | d1366 | en | home (header) | mouse leaves the item (not into the panel) → closes after ~250 ms (200–360) | 278 ms | ✅ |
| 327 | hover | MM-06 | d1366 | en | home (header) | panel open, mouse slides to the next item → switches at once (≤ 120 ms incl. measuring) | 30 ms | ✅ |
| 328 | hover | MM-07 | d1366 | en | home (header) | Esc → closes at once, keyboard focus on the menu item | closed · focus on item | ✅ |
| 329 | hover | MM-08 | d1366 | en | home (header) | 20 fast enter/leave cycles ending outside → closed, and nothing re-opens later | +0.5 s closed · +1.3 s closed | ✅ |
| 330 | hover | MM-09 | d1366 | en | home (header) | 20 fast cycles ending ON the item → open (after the 150 ms intent) | open | ✅ |
| 331 | hover | MM-10 | d1366 | en | home (header) | click anywhere outside → closed | closed | ✅ |
| 332 | hover | MM-11 | d1366 | en | home (header) | click a link inside the panel → new page, panel closed (no stale open state) | page category · panel closed · aria-expanded=true on 0 item(s) — mouse still over where the panel was | ✅ |
| 333 | hover | MM-11b | d1366 | en | home (header) | …and after the mouse moves away the panel is closed | closed | ✅ |
| 334 | hover | MM-12 | d1366 | en | home (header) | keyboard: Space opens; focus moves out of nav + panel → closes | Space: open · focus out: closed | ✅ |
| 335 | hover | TT-01 | d1366 | en | home (header) | WhatsApp tip: shows on hover (~0.18 s), clears on leave (≤ 0.4 s) | in 157 ms · out 134 ms | ✅ |
| 336 | hover | TT-02 | d1366 | en | home (header) | after clicking the WhatsApp icon with the mouse and moving away, the tip clears | cleared | ✅ |
| 337 | hover | TT-03 | d1366 | en | home (header) | header icon label: appears after the 0.25 s delay (0.25–0.5 s), clears on leave (≤ 0.3 s) | in 390 ms · out 110 ms | ✅ |
| 338 | hover | TT-04 | d1366 | en | home (header) | 20 fast passes over a header icon → no label left showing | opacity 0 | ✅ |
| 339 | hover | CD-01 | d1366 | en | category | card hover: back view + quick-add show; leave: both clear (0.2 s) | hover alt 1 qa 1 · leave alt 0 qa 0 | ✅ |
| 340 | hover | CD-02 | d1366 | en | category | 20 fast enter/leave cycles → back view and quick-add both cleared | alt 0 · qa 0 | ✅ |
| 341 | hover | CD-03 | d1366 | en | category | quick-add a size (page redraws), then leave → no quick-add panel left open | 0 panel(s) open | ✅ |
| 342 | hover | CD-04 | d1366 | en | category | click a quick-add size that is already in the bag (toast, no redraw), then leave → panel clears | toast "Already in your bag — size XL. Change th" · after leave: 1 panel(s) open · focus on quick-add button (STUCK open via :focus-within) | ❌ |
| 343 | hover | CD-04b | d1366 | en | category | …a click elsewhere then clears it | 0 panel(s) open | ✅ |
| 344 | hover | TO-01 | d1366 | en | home | toast disappears after 2.6 s (2.5–2.8) | 2617 ms | ✅ |
| 345 | hover | TO-02 | d1366 | en | home | a toast never blocks a click on what is under it | pointer-events none · element under the toast reachable: true | ✅ |
| 346 | hover | TO-03 | d1366 | en | home | a new toast 2 s after another gets its own full 2.6 s | 2610 ms | ✅ |
| 347 | hover | TO-04 | d1366 | en | home | bag "Undo" toast stays 6 s (5.9–6.3) | 6019 ms | ✅ |
| 348 | hover | TO-05 | d1366 | en | home | toast with a "View bag" / "Undo" link: does NOT vanish while the mouse is on it (WCAG 2.2.1) | vanished after 2608 ms with the mouse on the link | ❌ |
| 349 | hover | HA-01 .hdr [data-qa-logo] | d1366 | en | home (header) | header motion stops after 3 rounds | element has no motion on desktop (nothing to stop) | — |
| 350 | hover | HA-01 .hdr .hdr-wa-disc | d1366 | en | home (header) | header motion stops after 3 rounds (checked at 19 s) | stopped (iterations 3) | ✅ |
| 351 | hover | HA-01 .hdr .hdr-bag.has svg | d1366 | en | home (header) | header motion stops after 3 rounds (checked at 19 s) | stopped (iterations 3) | ✅ |
| 352 | hover | HA-01 .hdr .hdr-bag.has .count-dot | d1366 | en | home (header) | header motion stops after 3 rounds (checked at 19 s) | stopped (iterations 3) | ✅ |
| 353 | hover | HA-02 .hdr [data-qa-logo] | d1366 | en | home (header) | hover restarts the motion | no motion defined for this element on desktop | — |
| 354 | hover | HA-02 .hdr .hdr-wa-disc | d1366 | en | home (header) | hover restarts the motion; leaving stops it again (checked 0.7 s after leave) | hover: running · leave: stopped | ✅ |
| 355 | hover | HA-02 .hdr .hdr-bag.has svg | d1366 | en | home (header) | hover restarts the motion; leaving stops it again (checked 0.7 s after leave) | hover: running · leave: stopped | ✅ |
| 356 | hover | MM-01 | d1366 | bn | home (header) | mouse rests on a menu item → panel opens after ~150 ms (100–260) | 162 ms | ✅ |
| 357 | hover | MM-02 | d1366 | bn | home (header) | mouse moves from the item down into the panel → stays open (0.6 s later) | open | ✅ |
| 358 | hover | MM-03 | d1366 | bn | home (header) | mouse leaves the panel → closes after ~250 ms (200–360) | 276 ms | ✅ |
| 359 | hover | MM-04 | d1366 | bn | home (header) | mouse just passes over an item (60 ms) → panel never opens | stayed closed | ✅ |
| 360 | hover | MM-05 | d1366 | bn | home (header) | mouse leaves the item (not into the panel) → closes after ~250 ms (200–360) | 280 ms | ✅ |
| 361 | hover | MM-06 | d1366 | bn | home (header) | panel open, mouse slides to the next item → switches at once (≤ 120 ms incl. measuring) | 50 ms | ✅ |
| 362 | hover | MM-07 | d1366 | bn | home (header) | Esc → closes at once, keyboard focus on the menu item | closed · focus on item | ✅ |
| 363 | hover | MM-08 | d1366 | bn | home (header) | 20 fast enter/leave cycles ending outside → closed, and nothing re-opens later | +0.5 s closed · +1.3 s closed | ✅ |
| 364 | hover | MM-09 | d1366 | bn | home (header) | 20 fast cycles ending ON the item → open (after the 150 ms intent) | open | ✅ |
| 365 | hover | MM-10 | d1366 | bn | home (header) | click anywhere outside → closed | closed | ✅ |
| 366 | hover | MM-11 | d1366 | bn | home (header) | click a link inside the panel → new page, panel closed (no stale open state) | page category · panel closed · aria-expanded=true on 0 item(s) — mouse still over where the panel was | ✅ |
| 367 | hover | MM-11b | d1366 | bn | home (header) | …and after the mouse moves away the panel is closed | closed | ✅ |
| 368 | hover | MM-12 | d1366 | bn | home (header) | keyboard: Space opens; focus moves out of nav + panel → closes | Space: open · focus out: closed | ✅ |
| 369 | hover | TT-01 | d1366 | bn | home (header) | WhatsApp tip: shows on hover (~0.18 s), clears on leave (≤ 0.4 s) | in 162 ms · out 135 ms | ✅ |
| 370 | hover | TT-02 | d1366 | bn | home (header) | after clicking the WhatsApp icon with the mouse and moving away, the tip clears | cleared | ✅ |
| 371 | hover | TT-03 | d1366 | bn | home (header) | header icon label: appears after the 0.25 s delay (0.25–0.5 s), clears on leave (≤ 0.3 s) | in 421 ms · out 128 ms | ✅ |
| 372 | hover | TT-04 | d1366 | bn | home (header) | 20 fast passes over a header icon → no label left showing | opacity 0 | ✅ |
| 373 | hover | CD-01 | d1366 | bn | category | card hover: back view + quick-add show; leave: both clear (0.2 s) | hover alt 1 qa 1 · leave alt 0 qa 0 | ✅ |
| 374 | hover | CD-02 | d1366 | bn | category | 20 fast enter/leave cycles → back view and quick-add both cleared | alt 0 · qa 0 | ✅ |
| 375 | hover | CD-03 | d1366 | bn | category | quick-add a size (page redraws), then leave → no quick-add panel left open | 0 panel(s) open | ✅ |
| 376 | hover | CD-04 | d1366 | bn | category | click a quick-add size that is already in the bag (toast, no redraw), then leave → panel clears | toast "Already in your bag — size XL. Change th" · after leave: 1 panel(s) open · focus on quick-add button (STUCK open via :focus-within) | ❌ |
| 377 | hover | CD-04b | d1366 | bn | category | …a click elsewhere then clears it | 0 panel(s) open | ✅ |
| 378 | hover | TO-01 | d1366 | bn | home | toast disappears after 2.6 s (2.5–2.8) | 2624 ms | ✅ |
| 379 | hover | TO-02 | d1366 | bn | home | a toast never blocks a click on what is under it | pointer-events none · element under the toast reachable: true | ✅ |
| 380 | hover | TO-03 | d1366 | bn | home | a new toast 2 s after another gets its own full 2.6 s | 2615 ms | ✅ |
| 381 | hover | TO-04 | d1366 | bn | home | bag "Undo" toast stays 6 s (5.9–6.3) | 6028 ms | ✅ |
| 382 | hover | TO-05 | d1366 | bn | home | toast with a "View bag" / "Undo" link: does NOT vanish while the mouse is on it (WCAG 2.2.1) | vanished after 2613 ms with the mouse on the link | ❌ |
| 383 | hover | MM-01 | d1920 | en | home (header) | mouse rests on a menu item → panel opens after ~150 ms (100–260) | 163 ms | ✅ |
| 384 | hover | MM-02 | d1920 | en | home (header) | mouse moves from the item down into the panel → stays open (0.6 s later) | open | ✅ |
| 385 | hover | MM-03 | d1920 | en | home (header) | mouse leaves the panel → closes after ~250 ms (200–360) | 280 ms | ✅ |
| 386 | hover | MM-04 | d1920 | en | home (header) | mouse just passes over an item (60 ms) → panel never opens | stayed closed | ✅ |
| 387 | hover | MM-05 | d1920 | en | home (header) | mouse leaves the item (not into the panel) → closes after ~250 ms (200–360) | 264 ms | ✅ |
| 388 | hover | MM-06 | d1920 | en | home (header) | panel open, mouse slides to the next item → switches at once (≤ 120 ms incl. measuring) | 46 ms | ✅ |
| 389 | hover | MM-07 | d1920 | en | home (header) | Esc → closes at once, keyboard focus on the menu item | closed · focus on item | ✅ |
| 390 | hover | MM-08 | d1920 | en | home (header) | 20 fast enter/leave cycles ending outside → closed, and nothing re-opens later | +0.5 s closed · +1.3 s closed | ✅ |
| 391 | hover | MM-09 | d1920 | en | home (header) | 20 fast cycles ending ON the item → open (after the 150 ms intent) | open | ✅ |
| 392 | hover | MM-10 | d1920 | en | home (header) | click anywhere outside → closed | closed | ✅ |
| 393 | hover | MM-11 | d1920 | en | home (header) | click a link inside the panel → new page, panel closed (no stale open state) | page category · panel closed · aria-expanded=true on 0 item(s) — mouse still over where the panel was | ✅ |
| 394 | hover | MM-11b | d1920 | en | home (header) | …and after the mouse moves away the panel is closed | closed | ✅ |
| 395 | hover | MM-12 | d1920 | en | home (header) | keyboard: Space opens; focus moves out of nav + panel → closes | Space: open · focus out: closed | ✅ |
| 396 | hover | TT-01 | d1920 | en | home (header) | WhatsApp tip: shows on hover (~0.18 s), clears on leave (≤ 0.4 s) | in 161 ms · out 129 ms | ✅ |
| 397 | hover | TT-02 | d1920 | en | home (header) | after clicking the WhatsApp icon with the mouse and moving away, the tip clears | cleared | ✅ |
| 398 | hover | TT-03 | d1920 | en | home (header) | header icon label: appears after the 0.25 s delay (0.25–0.5 s), clears on leave (≤ 0.3 s) | in 426 ms · out 140 ms | ✅ |
| 399 | hover | TT-04 | d1920 | en | home (header) | 20 fast passes over a header icon → no label left showing | opacity 0 | ✅ |
| 400 | hover | CD-01 | d1920 | en | category | card hover: back view + quick-add show; leave: both clear (0.2 s) | hover alt 1 qa 1 · leave alt 0 qa 0 | ✅ |
| 401 | hover | CD-02 | d1920 | en | category | 20 fast enter/leave cycles → back view and quick-add both cleared | alt 0 · qa 0 | ✅ |
| 402 | hover | CD-03 | d1920 | en | category | quick-add a size (page redraws), then leave → no quick-add panel left open | 0 panel(s) open | ✅ |
| 403 | hover | CD-04 | d1920 | en | category | click a quick-add size that is already in the bag (toast, no redraw), then leave → panel clears | toast "Already in your bag — size XL. Change th" · after leave: 1 panel(s) open · focus on quick-add button (STUCK open via :focus-within) | ❌ |
| 404 | hover | CD-04b | d1920 | en | category | …a click elsewhere then clears it | 0 panel(s) open | ✅ |
| 405 | hover | TO-01 | d1920 | en | home | toast disappears after 2.6 s (2.5–2.8) | 2617 ms | ✅ |
| 406 | hover | TO-02 | d1920 | en | home | a toast never blocks a click on what is under it | pointer-events none · element under the toast reachable: true | ✅ |
| 407 | hover | TO-03 | d1920 | en | home | a new toast 2 s after another gets its own full 2.6 s | 2613 ms | ✅ |
| 408 | hover | TO-04 | d1920 | en | home | bag "Undo" toast stays 6 s (5.9–6.3) | 6016 ms | ✅ |
| 409 | hover | TO-05 | d1920 | en | home | toast with a "View bag" / "Undo" link: does NOT vanish while the mouse is on it (WCAG 2.2.1) | vanished after 2614 ms with the mouse on the link | ❌ |
| 410 | hover | HA-01 .hdr [data-qa-logo] | d1920 | en | home (header) | header motion stops after 3 rounds | element has no motion on desktop (nothing to stop) | — |
| 411 | hover | HA-01 .hdr .hdr-wa-disc | d1920 | en | home (header) | header motion stops after 3 rounds (checked at 19 s) | stopped (iterations 3) | ✅ |
| 412 | hover | HA-01 .hdr .hdr-bag.has svg | d1920 | en | home (header) | header motion stops after 3 rounds (checked at 19 s) | stopped (iterations 3) | ✅ |
| 413 | hover | HA-01 .hdr .hdr-bag.has .count-dot | d1920 | en | home (header) | header motion stops after 3 rounds (checked at 19 s) | stopped (iterations 3) | ✅ |
| 414 | hover | HA-02 .hdr [data-qa-logo] | d1920 | en | home (header) | hover restarts the motion | no motion defined for this element on desktop | — |
| 415 | hover | HA-02 .hdr .hdr-wa-disc | d1920 | en | home (header) | hover restarts the motion; leaving stops it again (checked 0.7 s after leave) | hover: running · leave: stopped | ✅ |
| 416 | hover | HA-02 .hdr .hdr-bag.has svg | d1920 | en | home (header) | hover restarts the motion; leaving stops it again (checked 0.7 s after leave) | hover: running · leave: stopped | ✅ |
| 417 | overlays | OV Menu (x) | phone | en | home | Menu: open → page locked; close (x) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 600→600, page scrolls after: yes · focus → opener | ✅ |
| 418 | overlays | OV Menu (backdrop) | phone | en | home | Menu: open → page locked; close (backdrop) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 600→600, page scrolls after: yes · focus → opener | ✅ |
| 419 | overlays | OV Menu (back) | phone | en | home | Menu: open → page locked; close (back) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 600→600, page scrolls after: yes · focus → opener | ✅ |
| 420 | overlays | OV Menu (swipe) | phone | en | home | Menu: open → page locked; close (swipe) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 600→600, page scrolls after: yes · focus → opener | ✅ |
| 421 | overlays | OV Search (x) | phone | en | home | Search: open → page locked; close (x) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 600→600, page scrolls after: yes · focus → opener | ✅ |
| 422 | overlays | OV Filter sheet (x) | phone | en | category | Filter sheet: open → page locked; close (x) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ |
| 423 | overlays | OV Size chart (x) | phone | en | product | Size chart: open → page locked; close (x) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ |
| 424 | overlays | OV Find my size (backdrop) | phone | en | product | Find my size: open → page locked; close (backdrop) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 326→326, page scrolls after: yes · focus → opener | ✅ |
| 425 | overlays | OV All colours (x) | phone | en | product | All colours: open → page locked; close (x) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 164→164, page scrolls after: yes · focus → opener | ✅ |
| 426 | overlays | OV Photo zoom (x) | phone | en | product | Photo zoom: open → page locked; close (x) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → MAIN.page — opened by a tap on the photo (not a button): no focus target | ✅ |
| 427 | overlays | OV Photo zoom (swipedown) | phone | en | product | Photo zoom: open → page locked; close (swipedown) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → MAIN.page | ✅ |
| 428 | overlays | OV Added-to-bag sheet (x) | phone | en | product | Added-to-bag sheet: open → page locked; close (x) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 366→366, page scrolls after: yes · focus → opener | ✅ |
| 429 | overlays | OV Your size popup (x) | phone | en | account | Your size popup: open → page locked; close (x) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 674→674, page scrolls after: yes · focus → opener | ✅ |
| 430 | overlays | OV Combo photo zoom (x) | phone | en | combo pair | Combo photo zoom: open → page locked; close (x) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ |
| 431 | overlays | OV Desktop search (esc) | d1366 | en | home | Desktop search: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | open: lock n/a (body visible) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener — search drops down under the header; the page is not meant to lock | ✅ |
| 432 | overlays | OV Size chart (esc) | d1366 | en | product | Size chart: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ |
| 433 | overlays | OV Size chart (backdrop) | d1366 | en | product | Size chart: open → page locked; close (backdrop) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 400→400, page scrolls after: yes · focus → opener | ✅ |
| 434 | overlays | OV Find my size (x) | d1366 | en | product | Find my size: open → page locked; close (x) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 800→800, page scrolls after: yes · focus → opener | ✅ |
| 435 | overlays | OV Photo zoom (esc) | d1366 | en | product | Photo zoom: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener — opened by a click on the photo: no focus target | ✅ |
| 436 | overlays | OV Added-to-bag drawer (esc) | d1366 | en | product | Added-to-bag drawer: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ |
| 437 | overlays | OV Combo photo zoom (esc) | d1366 | en | combo pair | Combo photo zoom: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ |
| 438 | overlays | OV Invoice (esc) | d1366 | en | account orders | Invoice: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 541→541, page scrolls after: yes · focus → opener | ✅ |
| 439 | overlays | OV Order sheet (esc) | d1366 | en | admin orders | Order sheet: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ |
| 440 | overlays | OV PR panel (esc) | d1366 | en | admin register | PR panel: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | open: lock n/a (body visible) · close: closed, body "visible", y 409→409, page scrolls after: yes · focus → BODY — side panel is its own route; lock not expected | ❌ |
| 441 | overlays | OV Section editor (esc) | d1366 | en | admin layout | Section editor: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ |
| 442 | overlays | OV Desktop search (esc) | d1366 | bn | home | Desktop search: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | open: lock n/a (body visible) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener — search drops down under the header; the page is not meant to lock | ✅ |
| 443 | overlays | OV Size chart (esc) | d1366 | bn | product | Size chart: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ |
| 444 | overlays | OV Size chart (backdrop) | d1366 | bn | product | Size chart: open → page locked; close (backdrop) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 400→400, page scrolls after: yes · focus → opener | ✅ |
| 445 | overlays | OV Find my size (x) | d1366 | bn | product | Find my size: open → page locked; close (x) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 800→800, page scrolls after: yes · focus → opener | ✅ |
| 446 | overlays | OV Photo zoom (esc) | d1366 | bn | product | Photo zoom: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener — opened by a click on the photo: no focus target | ✅ |
| 447 | overlays | OV Added-to-bag drawer (esc) | d1366 | bn | product | Added-to-bag drawer: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ |
| 448 | overlays | OV Combo photo zoom (esc) | d1366 | bn | combo pair | Combo photo zoom: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ |
| 449 | overlays | OV Desktop search (esc) | d1920 | en | home | Desktop search: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | open: lock n/a (body visible) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener — search drops down under the header; the page is not meant to lock | ✅ |
| 450 | overlays | OV Size chart (esc) | d1920 | en | product | Size chart: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ |
| 451 | overlays | OV Size chart (backdrop) | d1920 | en | product | Size chart: open → page locked; close (backdrop) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 400→400, page scrolls after: yes · focus → opener | ✅ |
| 452 | overlays | OV Find my size (x) | d1920 | en | product | Find my size: open → page locked; close (x) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 800→800, page scrolls after: yes · focus → opener | ✅ |
| 453 | overlays | OV Photo zoom (esc) | d1920 | en | product | Photo zoom: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener — opened by a click on the photo: no focus target | ✅ |
| 454 | overlays | OV Added-to-bag drawer (esc) | d1920 | en | product | Added-to-bag drawer: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ |
| 455 | overlays | OV Combo photo zoom (esc) | d1920 | en | combo pair | Combo photo zoom: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ |
| 456 | overlays | OV Invoice (esc) | d1920 | en | account orders | Invoice: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ |
| 457 | overlays | OV Order sheet (esc) | d1920 | en | admin orders | Order sheet: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: n/a (page shorter than screen) · focus → opener | ✅ |
| 458 | overlays | OV PR panel (esc) | d1920 | en | admin register | PR panel: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | open: lock n/a (body visible) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → BODY — side panel is its own route; lock not expected | ❌ |
| 459 | overlays | OV Section editor (esc) | d1920 | en | admin layout | Section editor: open → page locked; close (esc) → unlocked, same scroll spot, focus back on opener | open: locked (body hidden) · close: closed, body "visible", y 0→0, page scrolls after: yes · focus → opener | ✅ |
| 460 | misc | SB-01 | phone | en | bag | bag buy bar: shown at top · steps aside when the summary Checkout is on screen · back when scrolled up again | top shown · at Checkout aside · back up shown | ✅ |
| 461 | misc | SB-02 | phone | en | category | WhatsApp disc vs footer | no floating disc on this build (header WhatsApp only) | — |
| 462 | misc | SB-03 | phone | en | landing | landing buy bar: away while the order form is on screen, back when it scrolls off | top shown · at form away · back up shown | ✅ |
| 463 | misc | SB-04 | phone | en | checkout | checkout header WhatsApp: hidden while "Need help?" is on screen, shown after it scrolls away, hidden again on the way up | top hidden · scrolled shown · back up hidden | ✅ |
| 464 | misc | SB-05 | d1366 | en | product | desktop sticky buy bar: off at top · on once the buttons pass under the header · off (and inert) again on the way up | top off · on at y 1080 (buttons under header: true) · back up off (inert) | ✅ |
| 465 | misc | SB-05 | d1920 | en | product | desktop sticky buy bar: off at top · on once the buttons pass under the header · off (and inert) again on the way up | top off · on at y 1200 (buttons under header: true) · back up off (inert) | ✅ |
| 466 | misc | BP-01 | d1366 | en | journal post | popup (owner setting: scroll 60 %, wait 10 s from arrival): nothing before 60 %, opens once past it and the wait is over | 48 %: none · 66 %: opened 7844 ms later (wait left was 7795 ms) | ✅ |
| 467 | misc | BP-02 | d1366 | en | journal post | blog popup: page locked while open, focus inside; "No thanks" → unlocked at the same spot | open: locked · focus inside true · closed: yes, y 2350→2350, scrolls after yes | ✅ |
| 468 | misc | BP-03 | d1366 | en | journal post | popup does not come back on the same visit (cap: once per session) | stayed closed | ✅ |
| 469 | misc | BP-01 | d1920 | en | journal post | popup (owner setting: scroll 60 %, wait 10 s from arrival): nothing before 60 %, opens once past it and the wait is over | 48 %: none · 66 %: opened 7791 ms later (wait left was 7787 ms) | ✅ |
| 470 | misc | BP-02 | d1920 | en | journal post | blog popup: page locked while open, focus inside; "No thanks" → unlocked at the same spot | open: locked · focus inside true · closed: yes, y 2038→2038, scrolls after yes | ✅ |
| 471 | misc | BP-03 | d1920 | en | journal post | popup does not come back on the same visit (cap: once per session) | stayed closed | ✅ |
| 472 | misc | BP-01 | phone | en | journal post | popup (owner setting: scroll 60 %, wait 10 s from arrival): nothing before 60 %, opens once past it and the wait is over | 48 %: none · 66 %: opened 7830 ms later (wait left was 7782 ms) | ✅ |
| 473 | misc | BP-02 | phone | en | journal post | blog popup: page locked while open, focus inside; "No thanks" → unlocked at the same spot | open: locked · focus inside true · closed: yes, y 2580→2580, scrolls after yes | ✅ |
| 474 | misc | BP-03 | phone | en | journal post | popup does not come back on the same visit (cap: once per session) | stayed closed | ✅ |
| 475 | misc | BP-04 | phone | en | journal post (no popup) | tab bar slides away while reading down, comes back on a scroll up | down away · up back | ✅ |
| 476 | misc | BP-05 | phone | en | journal post (no popup) | slim bar: comes on past 60 % only while the tab bar is away; goes when the tab bar returns or below 45 %; never stacked with the tab bar | first on at 67 % · off again at 77 % · stacked frames 0 | ✅ |
| 477 | misc | SC-01 | d1920 | en | home (side canvas) | side-canvas motion frames advance on their own | 0,0,1,0 → 2,0,2,0 | ✅ |
| 478 | misc | SC-02 | d1920 | en | home (side canvas) | mouse resting on a rotating side offer → it holds still (same rule as the sliders) | kept rotating under the mouse (2,0,2,0 → 3,0,3,0) — consistency with the owner's hover rule | ❌ |
| 479 | misc | SC-03 | d1920 | en | home (side canvas) | rotating zone pauses while off-screen and resumes when back (next frame ≤ one cycle, 2.2 s) | off-screen: paused, frame 3→3 · back: next frame after 1241 ms | ✅ |
| 480 | misc | SC-04 | d1920 | en | home (side canvas) | side popup zone | zone exists in settings (active true) but is not drawn on this page | — |
| 481 | misc | PO-01 | d1366 | en | product | share row (owner switch, off by default — tested switched on) tidies itself away after 8 s if unused (7.8–8.4 s) | opened · closed after 8056 ms | ✅ |
| 482 | misc | PO-02 | d1366 | en | product | share row closed with its own button and opened again 5 s later → gets its own full 8 s | closed after 1597 ms | ❌ |
| 483 | misc | PO-03 | d1366 | en | product | after closing the share row with its own button, the next click elsewhere does not redraw the page (no left-over listener) | 2 extra page redraw(s) | ❌ |
| 484 | misc | PO-04 | d1366 | en | category | sort menu: opens; Esc closes and focus goes back to the Sort button | opened · Esc: closed · focus LOST (body) | ❌ |
| 485 | misc | PO-01 | phone | en | product | share row (owner switch, off by default — tested switched on) tidies itself away after 8 s if unused (7.8–8.4 s) | opened · closed after 8099 ms | ✅ |
| 486 | misc | PO-02 | phone | en | product | share row closed with its own button and opened again 5 s later → gets its own full 8 s | closed after 1415 ms | ❌ |
| 487 | misc | PO-03 | phone | en | product | after closing the share row with its own button, the next click elsewhere does not redraw the page (no left-over listener) | 2 extra page redraw(s) | ❌ |
| 488 | misc | PO-04 | phone | en | category | sort menu: opens; Esc closes and focus goes back to the Sort button | opened · Esc: closed · focus LOST (body) | ❌ |
| 489 | misc | PTR-01 | phone | en | category | short pull (not past the line) shows the arrow; letting go hides it again (≤ 0.3 s) | pulling: opacity 0.7692 "Pull to refresh" · released: opacity 0 | ✅ |
| 490 | misc | PTR-02 | phone | en | category | pull, then the touch is cancelled (system gesture / call / notification) → indicator resets | pulling: opacity 1 "Release to refresh" · after cancel: opacity 1 "Release to refresh" (STUCK on screen) | ❌ |
| 491 | misc | PTR-02b | phone | en | category | …and the next ordinary tap clears it | opacity 0 | ✅ |
| 492 | misc | PTR-03 | phone | en | category | pull past the line → "Release to refresh" → let go → page reloads (~0.35 s) | "Release to refresh" · reloaded | ✅ |
| 493 | misc | PTR-04 | phone | en | category | after the reload no indicator is left on screen | none | ✅ |
| 494 | misc | SW-01 | phone | en | product → category | edge swipe from the left = one page back (product → category), never two | landed on category | ✅ |
| 495 | misc | ST-01 | d1366 | en | product (size finder) | press and hold "+" → starts repeating after 0.45 s; let go → stops at once | held 1.3 s: 17000 steps (raw) · after release +0.6 s: 0 more | ✅ |
| 496 | misc | ST-02 | d1366 | en | product (size finder) | press "+", slide the mouse off the button while still pressed → repeating stops | stopped | ✅ |
| 497 | misc | ST-01 | phone | en | product (size finder) | press and hold "+" → starts repeating after 0.45 s; let go → stops at once | held 1.3 s: 17000 steps (raw) · after release +0.6 s: 0 more | ✅ |
| 498 | misc | ST-02 | phone | en | product (size finder) | press "+", touch cancelled by the phone → repeating stops | stopped | ✅ |
| 499 | misc | RO-01 | phone | en | account (For you) | rotating offer card: a finger resting on it holds it (like the sliders' 4 s hold) | turned under the finger (0 → 1) after 4200 ms — consistency with the owner's touch-hold rule | ❌ |
| 500 | misc | RO-02 | phone | en | account (For you) | rotating offer card: keyboard focus on its link holds it (focus never left on a hidden slide) | turned away: focus left on a HIDDEN slide (tabindex -1) | ❌ |
| 501 | misc | IN-01 | phone | en | home (first visit) | welcome popup on a first visit: opens ~0.35 s after load, locks; Esc closes and unlocks | opened 263 ms after reload · body "hidden" · after Esc closed body "" | ✅ |
| 502 | misc | TM-01 | phone | en | category (idle) | no forever timer keeps running on a shop page with nothing moving (R15 bug-20 rule) | 1 interval(s) alive: 30000 ms file:///tmp/claude-0/-home-claude/a27f8d4d-b57b-5d41-b919-c637e74e7368/scratchpad/timing-audit/timing.html:31668:1 | ❌ |
| 503 | extra | HR-04b | d1366 | en | home | click the hero › arrow, then flick the mouse straight off the slider → moving again (≤ 500 ms) | NOT moving after 8 s (hover flag true, focus on "hm-slnav next") | ❌ |
| 504 | extra | HR-04b | d1366 | bn | home | click the hero › arrow, then flick the mouse straight off the slider → moving again (≤ 500 ms) | NOT moving after 8 s (hover flag true, focus on "hm-slnav next") | ❌ |
| 505 | extra | HR-04b | d1920 | en | home | click the hero › arrow, then flick the mouse straight off the slider → moving again (≤ 500 ms) | NOT moving after 8 s (hover flag true, focus on "hm-slnav next") | ❌ |
