# Agent curriculum — the degree path for each of the six (PR 579)

Each agent studies its own field like a degree: **Graduate (foundations) → Post-graduate (advanced practice)
→ PhD level (research-grade judgement: reads the latest evidence, designs experiments, sets standards)**.
Every module becomes skills in its library (agents/skills/<agent>/), each with sources and an exam (practical
tasks + questions) that must be passed in the sandbox before the level is marked earned. The syllabus follows
the standard texts and top-university courses of each field (MIT OpenCourseWare, Stanford, Harvard, Oxford
syllabi and the field's reference books/guidelines), adapted to EXTAS (Bangladesh, menswear, COD, phone-first).

## প্রহরী Prohori — systems, security, reliability, audit
- **Graduate:** operating systems & networks, Linux administration, databases (PostgreSQL), web architecture (Next.js/Node), containers (Docker), DNS/TLS/CDN (Cloudflare), backups & restore.
- **Post-graduate:** Site Reliability Engineering (SLOs, error budgets, incident response, postmortems), performance engineering (Core Web Vitals, Lighthouse budgets), application security (OWASP Top 10/ASVS, secrets management, least privilege), automated testing & QA (Playwright, device matrix, checklist audits), CI/CD.
- **PhD level:** threat modelling for e-commerce/payment flows, chaos & resilience testing, capacity planning and cost modelling on Azure, security audit methodology, designing the audit standards other agents are measured by.

## ভান্ডারী Bhandari — catalogue, inventory, logistics, documents
- **Graduate:** product information management, size grading & charts, colour/variant data, image standards; inventory basics; courier operations in Bangladesh; invoices & documents.
- **Post-graduate:** inventory theory (EOQ, safety stock, reorder points, ABC analysis), demand forecasting, returns/exchange logistics and reverse supply chain, last-mile performance (delivery success vs refusal by district), ERP integration patterns, data quality.
- **PhD level:** stochastic inventory models for seasonal fashion (winter/Eid peaks), assortment optimisation by colour/size, courier-mix optimisation by band and district, designing the catalogue/data standards for the whole system.

## সওদাগর Sawdagor — e-commerce, conversion, combos, checkout, payments
- **Graduate:** how online stores work end to end; product pages, cart, checkout, payments (COD, bKash, Nagad, cards), order management.
- **Post-graduate:** conversion-rate optimisation (Baymard-style usability research, form design, checkout friction), pricing & bundling (anchoring, bundle discount psychology, tiered sets), A/B testing and statistics, fraud-aware checkout (COD risk), customer experience metrics.
- **PhD level:** experiment design at scale (sequential testing, uplift), behavioural economics of bundles and price presentation, marketplace/combos theory, designing EXTAS's conversion playbook and proving each rule with data.

## শিল্পী Shilpi — UI/UX design
- **Graduate:** visual design (type, colour, grid, hierarchy), interaction design basics, mobile-first layouts, accessibility (WCAG 2.2), design systems.
- **Post-graduate:** human–computer interaction (cognitive load, Fitts's law, Hick's law, perception), usability testing methods, information architecture, motion & micro-interaction, e-commerce UX patterns, Bengali typography and low-literacy design.
- **PhD level:** research-grade UX (experiment design, heuristic evaluation methodology, quantitative UX metrics), designing EXTAS's own design language and AUTO ADJUST rules as a measurable standard.

## দূত Doot — marketing, SEO, ads, CRM, analytics
- **Graduate:** marketing fundamentals (4Ps, segmentation, positioning), content and social, SEO basics, Facebook/Instagram/Google ads basics, CRM basics, analytics basics.
- **Post-graduate:** marketing science (how brands grow — mental and physical availability), performance marketing (bidding, creatives, attribution, MMM basics), technical SEO and structured data, lifecycle/CRM (RFM, retention, win-back), analytics & funnels, Bangladesh digital market (Facebook-first, COD).
- **PhD level:** causal measurement (incrementality tests, geo experiments, MMM), customer lifetime value modelling, geography-led growth (district outcomes), designing EXTAS's growth model and reporting standard.

## জ্ঞানী Gyani — AI, rules, fraud, finance, support, studio
- **Graduate:** AI/LLM fundamentals, prompt and agent design, rules engines, accounting basics (P&L, cash flow), customer support operations.
- **Post-graduate:** machine learning for fraud/risk (features, precision/recall, cost-sensitive decisions, human-in-the-loop review), AI safety & governance (permissions, data classes, evaluation), managerial accounting & unit economics (per-style profit, COD refusal cost), support automation & knowledge bases, image/video generation workflows.
- **PhD level:** evaluation methodology for agents (benchmarks, regression tests of skills), causal fraud analysis without automatic blocking, AI cost optimisation, designing the agents' own curriculum, exams and appraisal system.

## How a module becomes knowledge
1. Syllabus module → source list (texts, guidelines, papers, top-course notes).
2. Distilled into skill files: concepts, rules of thumb, worked EXTAS examples, common mistakes, checklists.
3. Exam: 10–20 practical tasks on EXTAS data + questions; pass mark 85%; run in the sandbox.
4. Earned level shown on the profile; skills re-examined every quarter; failing skills are flagged.

## Taught so far
*Curriculum wave 1 · 19 Oct 2026 (PR 579, extended by PR 585); **wave 2 · 19 Oct 2026** (Shilpi ux/, Prohori, Bhandari, Doot/Tirondaj module 10 — tags [OFFICIAL] · [2-SRC] · [HOUSE] · [COMMUNITY — test before use]). Modules are in agents/skills/<agent>/; each ends with
typed sources and "as of October 2026". Quality gate (PR 585): a tip is a rule only if official docs or two independent
good sources confirm it; everything else is tagged "community tip — test before use". Exams pass at 85%; no level is
marked earned until the exam is run in the sandbox.*

| Agent | Modules written | Extra files | Exam | Level earned |
|---|---|---|---|---|
| তীরন্দাজ Tirondaj A360-07 | 10 — T01–T09 (wave 1) · **T10 South-Asian practitioners (wave 2)**: COD-market ad diagnostics, 7 practices upgraded to [2-SRC], rejected vendor numbers | MYTHS (18), LEARNING-LOOP, PRACTICE-TASKS, PAID-TOOLS, TRIAL-PLAN, README (with certification map) | 33 Q, pass 29 | none yet |
| দূত Doot A360-06 | 10 — D01–D09 (wave 1) · **D10 South-Asian practitioners (wave 2)**: SEO confirmations, BD organic practice, COD confirmation/NDR messaging, rejected numbers | MYTHS (20), LEARNING-LOOP, PRACTICE-TASKS, PAID-TOOLS, TRIAL-PLAN, README (with certification map) | 31 Q, pass 27 | none yet |
| জ্ঞানী Gyani A360-01 (chief) | 5 in executive/ — G01 root cause of sales drops · G02 KPI trees · G03 managing & appraising agents · G04 approval boundaries · G05 investigation report | MYTHS, README | 20 items, pass 17 | none yet |
| সওদাগর Sawdagor A360-04 | 6 — S01 conversion (checkout/PDP) · S02 bundles/combos/AOV · S03 COD markets · S04 mobile-first UX · S05 trust, returns, pricing psychology · S06 lessons from fashion leaders | MYTHS, README | 20 items, pass 17 | none yet |
| শিল্পী Shilpi A360-05 | 16 — photo/ P01–P06 (wave 1) · **ux/ U01–U10 (wave 2)**: mobile-first e-commerce UX · touch targets & thumb zones · Bengali + Latin typography · WCAG 2.2 AA & modal focus · design tokens (DTCG 2025.10) · motion & reduced motion · breakpoints, tablets, safe areas · iOS Safari quirks · BD checkout forms · conversion-safe hierarchy | photo/MYTHS, photo/README; ux/MYTHS (15), ux/README | photo 20 items, pass 17 · **ux 24 items, pass 21** | none yet |
| ভান্ডারী Bhandari A360-03 | 8 (wave 2) — B01 product data & variants · B02 SKU & barcodes · B03 stock reservations · B04 ERP sync · B05 BD courier ops (3 bands, COD reconciliation) · B06 exchange & returns · B07 invoices & VAT basics · B08 Meta/Google feeds; plus PHOTO-STANDARD pointer (wave 1) | MYTHS (12), README | **22 items, pass 19** + Shilpi's photo exam | none yet |
| প্রহরী Prohori A360-02 | 11 (wave 2) — R01 Azure VPS hardening · R02 Nginx + TLS · R03 zero-downtime deploy · R04 Google Drive backups & restore drills · R05 secrets vault · R06 OWASP Top 10:2025 for e-commerce · R07 BD payment webhooks · R08 monitoring → Telegram · R09 incident response · R10 Playwright QA · R11 audit-runner design | MYTHS (15), README | **25 items, pass 22** | none yet |

Findings raised while teaching (for the owner/lead): blueprint C4.2 expects FAQ snippets from FAQPage schema — Google
limited FAQ rich results to authoritative government/health sites in Aug 2023; Google says no special AI files are
needed for AI Overviews (llms.txt stays a low-priority extra); Google Shopping availability for Bangladesh is unclear in
official pages (test in Merchant Center); the exact composition of "2 SMS + 1 WhatsApp per order" vs review-request and
2-size messages needs the owner's confirmation.

Findings raised in wave 2 (for the owner/lead):
- **Proxy:** master register PR 7 says Caddy; wave 2 was asked to teach Nginx — Prohori R02 covers both; the register should name one.
- **Payment gateways:** SSLCommerz IPN/validation rules verified from its developer docs; bKash and Nagad official developer docs were not readable by our tools — R07 keeps gateway-independent rules only until the merchant integration guides are obtained.
- **Couriers:** no official Steadfast/Pathao/RedX API docs were readable (community packages and an API-directory copy only); Steadfast's own T&C verified (1% COD charge, delivery charge on cancelled parcels, resend = extra charge).
- **VAT:** 15% standard rate and thresholds come from one tax-firm summary; Mushak 6.3 fields from two sources; the rate/invoice duty for EXTAS's own online sales is unverified → accountant.
- **Google Merchant Center** does not list Bangladesh in its supported-countries table (confirms wave 1's doubt).
- **Tablets:** PR 570 note 21 already requires 5 tablet sizes; Shilpi U07 and Prohori R10 align to it.
- **South-Asian practitioners:** YouTube pages/transcripts remained unreachable; usable material came from BD/IN/PK blogs and news. No new platform rules; COD confirmation, advance charge for high-risk orders, risk-tiered friction, fast NDR follow-up, ad-promise = policy and courier choice by region now have 2+ independent sources. Every South-Asian RTO percentage found was unsourced and is rejected.
- **Message budget:** COD confirmation and failed-delivery follow-up messages compete with "2 SMS + 1 WhatsApp per order" — owner to decide whether they count inside it.

