# R11 · The audit-runner design (PR 570 + 413–424, gate 420)

*Prohori প্রহরী · A360-02 · module 11 of 11 · level: PhD (designing the standard others are measured by) · version 1.0 · as of October 2026*

What it is (master register PR 570): the full e-commerce checklist (`qa/ECOMMERCE-CHECKLIST.md`, **405 points in 23
groups**, prioritised) lives in the backend; one click → 2–3 agents test the chosen groups on desktop and several
devices, or a schedule (e.g. weekly) sends the report and bug list to Telegram; the owner controls when, how many
agents and which groups; fixes only after approval. Standard (note 21): every non-backend point passes on 8 phone
sizes, 5 tablet sizes and desktop before any release.

This module is the engineering design; everything is **[HOUSE]** unless a source is named.

---

## 1. Check model

```yaml
id: N03                       # stable, from the checklist
group: "1. Navigation & history"
priority: P1                  # P1 money/blocking · P2 major · P3 polish
title: "Edge swipe back (iPhone) returns to the page before it"
kind: automated | semi | manual-device | backend
runner: playwright | axe | http | sql | human
devices: [phones-8, tablets-5, desktop]   # resolved from qa/devices.json
owner_agent: shilpi            # who fixes; prohori runs
evidence: [screenshot, trace, value]
pass_rule: "scrollY within 40px AND url == previous"
flaky_policy: quarantine_after: 3_in_7_days
last_result: {status: pass|fail|na|not_run, build, at, evidence_url}
```
- Status set = the checklist's own: ✅ pass · ❌ fail · — not testable yet · ⬜ not run.
- **One check = one test**, stable IDs forever (history and trend per ID).

## 2. Run modes
| Mode | Trigger | Scope | Agents |
|---|---|---|---|
| Quick | every deploy (R03 post-deploy smoke) | P1 automated, 3 phones + desktop | 1 (Prohori) |
| Full | owner taps "Run now" / before release | chosen groups × all devices | 2–3 in parallel (split by group) |
| Scheduled | weekly **Fri 09:00** (current admin demo default; owner-editable) | all automated + backend | 2–3 |
| Device pass | before release / after iOS bug fixes | `manual-device` checks on a real iPhone + Android | human-assisted (owner or staff phone), guided script |

Parallel split: agent A groups 1–8 (shopping path), agent B 9–16 (checkout, account, forms, a11y), agent C 17–23 (trust, tracking, SEO, security, errors, admin). Each writes only results, never code.

## 3. Pipeline
```
select checks → resolve devices → build under test (staging URL + build id)
 → run (Playwright projects; axe; HTTP/TLS/header probes; SQL invariants; external port scan)
 → collect evidence (screenshots labelled in Bengali, traces on retry)
 → classify: pass | fail | flaky | na
 → dedupe failures into bugs (same root selector/component across devices = one bug)
 → report: summary → Telegram; full → #/admin/audit
 → for each bug: owner agent drafts "Propose fix" (diff + before/after pictures) → gate 420: owner Approve → fix → re-run that check
```

## 4. Check types worth automating first (highest value per effort)
1. **Money path invariants (SQL/API):** order total = items + delivery charge − discounts; paid orders have a validated gateway txn (R07); no negative stock; every dispatched order has a courier consignment ID (Bhandari).
2. **Security probes:** only 80/443 open from outside (R01); TLS ≥ 1.2 and cert > 14 days (R02); security headers present; IDOR probe on orders/invoices (R06); rate limits respond 429.
3. **Owner-rule layout gate:** one-line rules, AUTO ADJUST, nothing covered (existing device-matrix gate).
4. **History/scroll tests** (R10 §4).
5. **Accessibility (axe A/AA)** on 5 page types (R10 §6) — automated catches only part; manual items stay manual.
6. **Backups:** last backup age < 26 h; last restore drill < 35 days (R04).

## 5. Report format (Telegram, simple Bengali; identity line first)

```
🛡️ প্রহরী · A360-02 · সাইট অডিট (সাপ্তাহিক) · বিল্ড r16
✅ ৩৪১ পাস · ❌ ৬ ফেল (P1: ১) · ⚠️ ২ অনিশ্চিত · — ৪৮ এখন টেস্ট করা যায় না
P1: চেকআউট — iPhone-এ কিবোর্ড খুললে "Continue" ঢেকে যায় (শিল্পী ঠিক করবে) · ছবি ↗
সবচেয়ে বড় পরিবর্তন: গত সপ্তাহের চেয়ে ৪টা নতুন ফেল, ১০টা ঠিক হয়েছে
পুরো রিপোর্ট ↗   ·   ঠিক করার প্রস্তাব: অনুমোদন দিন ↗
```
Respect Telegram limits (one message per run, edits for updates — R08).

## 6. Quality of the auditor itself (PhD-level duties)
- **Every check has a known-bad fixture** (a deliberately broken build) proving it can fail — a check that never fails is suspect.
- **Flake budget:** < 2% of results flaky per run; above → stop adding checks, fix flakes (R10 §5).
- **Disagreements** between the checklist and an owner rule (e.g. L27, P11 in R15) are marked "owner rule wins" with the lesson ID — never silently changed.
- **Coverage map:** % of the 405 points automated / semi / manual / backend; target trend upward each month.
- **Calibration:** quarterly, the owner's own phone pass is compared with the auditor's last run; any bug the owner found that the auditor marked ✅ becomes a new or fixed check and a postmortem trigger ("monitoring failed", R09).
- Re-run cost and time reported per run (spend cap PR 309).

## 7. Worked example — adding a check from an owner correction
Owner: "Bogura address showed Dhaka charge." → Lesson exists ("district settles band silently"). New checks: B-BAND-01..05 with 5 real addresses (incl. "Masterpara, Gabtali, Bogura") × expected band; kind: automated; owner_agent: bhandari; P1 (money). Known-bad fixture: resolver with district matching disabled → all 5 fail. Added to Quick runs because a wrong delivery charge is a money bug.

---

**Sources** (type in brackets):
- [Official — Playwright docs] Test retries (flaky classification): https://playwright.dev/docs/test-retries
- [Official — Playwright docs] Accessibility testing (automated catches only some issues): https://playwright.dev/docs/accessibility-testing
- [Official — Telegram] Bots FAQ (rate limits): https://core.telegram.org/bots/faq
- [Official — Google SRE book] Postmortem Culture (monitoring failure as a trigger): https://sre.google/sre-book/postmortem-culture/
- [Internal] master register PR 570 (+ note 21 device standard), 413–424, 420 gate, 309 spend cap; qa/ECOMMERCE-CHECKLIST.md (405 points, 23 groups); worklog/prohori.log (admin audit page, Fri 09:00); lessons/ALL.md

*As of October 2026.*
