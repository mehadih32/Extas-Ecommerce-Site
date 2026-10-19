# D09 · CRM, SMS and WhatsApp — inside the owner's rules (two SMS + one WhatsApp per order)

*Doot দূত · A360-06 · module 9 of 9 · level: Post-graduate · version 1.0 · as of October 2026*

---

## 1. The owner's message budget per order (hard rule, enforced by code)

**Per order: at most 2 SMS + 1 WhatsApp** (owner rule, PR 585 brief). Recommended default allocation **[HOUSE — confirm with owner; BLOCKED.md]**:

| # | Channel | Trigger | Content | Category |
|---|---|---|---|---|
| SMS-1 | masking SMS | order placed | order no., amount, "we'll call to confirm" | transactional |
| SMS-2 | masking SMS | handed to courier | tracking link + delivery window (blueprint: tracking-link SMS goes to every customer, no checkbox) | transactional |
| WA-1 | WhatsApp utility template | **only one** of, in priority: (a) 2-sizes check right after the order (blueprint B1 rule), (b) otherwise review request 2–3 days after delivery (blueprint), | utility |

Open conflicts to raise with the owner (don't decide alone):
- The blueprint also mentions a delivered-order birthday question and an abandoned-cart follow-up — these are **not order messages** (abandoned cart has no order; birthday is post-order marketing). Propose: they live outside the per-order budget but under the marketing opt-in and frequency cap in §4.
- If the 2-size WhatsApp is used, the review request falls back to SMS? That would be SMS-3 → **not allowed**; propose: review request then goes on-site / in the account page only.

Code must count messages per order and block the 3rd SMS or 2nd WhatsApp (log the block).

## 2. WhatsApp Business Platform rules that shape the design [OFFICIAL]

- **Pricing (since 1 July 2025): per delivered template message**, by category (marketing, utility, authentication) and recipient country code. Free: non-template replies inside the **24-hour customer-service window**; **utility templates inside an open window are free**; marketing templates are always charged. Click-to-WhatsApp ad / Page CTA conversations get a **72-hour free entry window** if we reply within 24 h.
- **Bangladesh (+880)** is billed in "Rest of Asia Pacific"; Meta's page says Bangladesh moves out of that region with **lower utility and authentication rates from 1 October 2026** → re-check the current rate card before budgeting.
- **Opt-in required:** the person agreed to receive messages from **EXTAS by name**; can be collected on the website, SMS, phone (IVR) or paper; say which message types; honour opt-outs; separate opt-ins per category recommended.
- **Quality and limits (BSP docs, 360dialog):** business-initiated messaging limits by tier (250 → 2K → 10K → 100K → unlimited unique users / 24 h); quality from the last 7 days of user feedback (blocks, reports, read rates); low-quality templates get paused; generic intros and too many messages a day lower quality.

Design consequences: make WA-1 a **utility** template with a clear purpose and buttons (Keep both / Only L / Only XL; or ★ rating link); send marketing only to opted-in customers; keep marketing frequency low (§4).

## 3. SMS rules in Bangladesh

- Business SMS go through a **BTRC-authorised A2P aggregator**; **masking** (brand-name sender) is for transactional/service messages; **promotional = non-masking**, sent roughly **9 AM–9 PM** BST and filtered against the **National Do-Not-Call (NDNC)** registry. Mis-routing promotions as transactional is monitored and can get the route suspended **[COMMUNITY — Telerivet compliance blog, Jan 2026; confirm with our aggregator]**.
- **Bengali SMS = Unicode → 70 characters per segment** (vs 160 Latin) → each extra segment costs; write short Bengali or test length **[same source; technical fact of GSM/Unicode]**.
- BTRC fined operators in Oct 2024 for sending more than three promotional SMS a day (operators' own promotions) — a signal that the regulator watches promotional volume **[news]**.
- Blueprint: masking sender ID is an external approval still pending.

SMS templates (Bengali, short):
```
SMS-1: EXTAS: অর্ডার #10452 পেয়েছি, মোট ৳2,059। কনফার্ম করতে আমরা কল করব। ধন্যবাদ!
SMS-2: EXTAS: অর্ডার #10452 কুরিয়ারে দেওয়া হয়েছে। ট্র্যাক: extas.bd/t/10452 · ডেলিভারি ১–৩ দিনে
```
(amounts, links and windows are filled from the order and Smart Rules — never typed; check segment count.)

## 4. Marketing messages (outside the per-order budget, opt-in only) [HOUSE]

- Consent: separate honest checkbox "Send me offers & new arrivals on SMS/WhatsApp" (blueprint; owner decided ticked by default with easy untick — note: some laws/platform policies expect active opt-in; WhatsApp requires clear opt-in → raise with owner whether WhatsApp marketing uses only customers who actively opted in).
- Frequency cap: ≤ 2 marketing messages per customer per month across SMS + WhatsApp; none to anyone who refused a parcel in the last 90 days unless they later bought and accepted.
- Every marketing message: one offer, one link (UTM), opt-out line ("STOP লিখে পাঠান" where the route supports replies; otherwise a link).

## 5. CRM segmentation (RFM) for EXTAS

| Segment | Rule (delivered orders only) | Action |
|---|---|---|
| New (1 delivered order, < 30 days) | first order delivered | review request; size-fit feedback; no discount push |
| Promising | 1 order, 30–90 days | new-arrivals in their size/category |
| Loyal | ≥ 3 orders, last ≤ 120 days | early access to season drops; VIP (blueprint VIP rules) |
| At risk | ≥ 2 orders, last 120–240 days | win-back offer (owner-approved value) |
| Lost | last > 240 days | 1 win-back attempt per season, then stop |
| Refused-parcel | ≥ 1 refusal | no marketing; exclusion from ads (Tirondaj); advance-delivery-charge rule (fraud engine) |

Metrics: repeat-purchase rate (90/180 days), time to second order, revenue from returning customers, opt-out rate per campaign, WhatsApp quality rating.

## 6. Abandoned checkout (blueprint C6.3) within rules
- Draft order saved as typed; follow-up ladder ~1 h later by WhatsApp/SMS (blueprint) — only if the customer typed a phone **and** the law/platform allows contacting them (WhatsApp needs opt-in → for non-opted-in users use the on-site reminder and ad retargeting instead).

## 7. Common mistakes
- Bulk WhatsApp marketing to people who never opted in → blocks → quality drop → paused templates.
- A third SMS "your parcel is near" — breaks the owner's rule.
- English-only SMS to a Bengali-reading customer base; or long Bengali SMS that splits into 3 segments.
- Promotional SMS at night or via masking route.

---

**Sources** (type in brackets):
- [Official] Meta for Developers, WhatsApp Business Platform pricing: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- [Official] Meta for Developers, Get opt-in for WhatsApp: https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in
- [Vendor doc — WhatsApp BSP] 360dialog, Messaging limits and quality rating: https://docs.360dialog.com/partner/messaging/messaging-limits-and-quality-rating
- [Vendor blog — SMS provider] Telerivet, Sending SMS in Bangladesh: BTRC, masking (Jan 2026): https://www.telerivet.com/blog/bangladesh-sms-compliance-btrc-masking
- [News] Developing Telecoms, Bangladesh telcos fined over promotional SMS limits (Oct 2024): https://developingtelecoms.com/telecom-business/telecom-regulation/17490-bangladesh-telcos-fined-over-promotional-sms-limits.html
- [Internal] EXTAS blueprint (consent, tracking SMS, 2-size follow-up, review requests, abandoned checkout)

**Not verified:** BTRC's own directive text (not found online in readable form); exact per-message WhatsApp rates for
+880 after 1 Oct 2026.

*As of October 2026.*
