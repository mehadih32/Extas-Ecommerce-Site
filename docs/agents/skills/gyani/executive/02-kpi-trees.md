# G02 · KPI trees for EXTAS e-commerce — what the chief watches, who owns each branch

*Gyani জ্ঞানী · A360-01 · executive module 2 of 5 · version 1.0 · as of October 2026*

A metric tree puts one north-star number at the top and breaks it into drivers, each with an owner; when the top moves,
you walk down to the driver that moved (Mixpanel's method). EXTAS's north star is **contribution margin from delivered
orders**, because COD refusals make "orders" and even "revenue" misleading.

---

## 1. The tree

```
L0  Monthly contribution margin (CM) from delivered orders                               owner: Gyani
├─ L1  Delivered revenue
│   ├─ L2  Sessions  (paid · organic · social · direct/CRM)          Tirondaj · Doot
│   ├─ L2  Conversion rate (orders ÷ sessions)                       Sawdagor · Shilpi · Prohori
│   │     ├─ L3 add-to-bag rate · checkout start rate · checkout completion rate
│   │     ├─ L3 stock availability of hero sizes (M–XL) · combo availability     Bhandari
│   │     └─ L3 site speed (LCP/INP p75) · JS error rate · device-gate failures  Prohori
│   ├─ L2  AOV                                                        Sawdagor
│   │     └─ L3 combo attach rate · items per order · discount depth
│   └─ L2  Delivery success rate (delivered ÷ placed)                 Bhandari · Gyani (fraud) · support
│         └─ L3 confirmation-call reach rate · refusal rate by district/courier/channel · delivery time
├─ L1  Variable costs
│   ├─ L2  COGS per order (ERP)                                       Bhandari / owner
│   ├─ L2  Ad spend (dCPA vs cap, MER)                                Tirondaj
│   ├─ L2  Courier + packing (incl. both legs on refusals)            Bhandari
│   └─ L2  Gateway, SMS/WhatsApp, AI costs                            Gyani (AI 360 budgets) · Doot (messaging)
└─ L1  Repeat business
    └─ L2 repeat-purchase rate (90/180 d) · time to 2nd order · opt-in base size   Doot
```

## 2. The daily scorecard (the owner's one screen, simple Bengali)

| KPI | Formula | Green / Amber / Red (starting thresholds — owner tunes) |
|---|---|---|
| ডেলিভারি হওয়া বিক্রি (delivered revenue, 7-day) | sum delivered (ex-delivery charge) | ≥ plan / 90–100% / < 90% |
| অর্ডার (orders placed today vs same weekday avg) | count | inside control band / 2σ low / 3σ low or 8 days below |
| কনভার্সন রেট | orders ÷ sessions | ≥ 8-week avg / −10% / −20% |
| AOV | revenue ÷ orders | ≥ avg / −5% / −10% |
| ফেরত/রিফিউজ % | refused ÷ (delivered + refused) | ≤ avg / +3 pts / +6 pts |
| dCPA (Tirondaj) | spend ÷ delivered orders | ≤ 80% cap / 80–100% / > cap |
| MER | revenue ÷ total marketing spend | ≥ target / −10% / −20% |
| স্টক: hero সাইজ out | count of top-20 styles with M/L/XL out | 0 / 1–2 / ≥ 3 |
| সাইট ঠিক আছে? | uptime + checkout error rate | 100% & < 0.5% / … / downtime or > 2% |
| CM estimate | per-order margin table | ≥ plan / … / < 15% of revenue |

(Thresholds are **[HOUSE]** starting points; CTC's practitioner benchmark puts CM below 15% in the "danger zone".)

## 3. Rules for using the tree
1. One owner per metric (as above). The owner agent explains its metric's moves in its daily report.
2. Leading vs lagging: sessions, add-to-bag, confirmation reach lead; delivered revenue and CM lag by days.
3. Never celebrate a top-line rise without checking delivery success and CM.
4. Every change ("bet") is attached to the L3 metric it should move, with a date — so a later move can be traced to it.
5. Weekly: Gyani walks the tree top-down with numbers and writes 5 lines to the owner (what moved, why, who, action, need).

## 4. Data sources per branch
Orders/statuses: EXTAS DB + courier webhooks · sessions: analytics layer (Doot) · ad spend: platform imports (PR 265–268) · speed/errors: Prohori monitoring · stock: ERP/local mirror · costs: per-order margin (blueprint) · search: Search Console.

---

**Sources** (type in brackets):
- [Practitioner] Mixpanel, Metric trees for e-commerce (Jun 2026): https://mixpanel.com/blog/metric-trees-ecommerce-example/
- [Practitioner/agency] Common Thread Collective, contribution margin guide: https://commonthreadco.com/blogs/coachs-corner/the-complete-guide-to-ecommerce-contribution-margin
- [Official/government] NIST e-Handbook, control charts: https://itl.nist.gov/div898/handbook/pmc/section3/pmc32.htm
- [Internal] EXTAS blueprint (per-order operational margin, delivered ROAS), skills/tirondaj/06-measurement.md

*As of October 2026.*
