# B07 · Invoices and documents (and VAT basics in Bangladesh — verified points only)

*Bhandari ভান্ডারী · A360-03 · module 7 of 8 · level: Graduate → Post-graduate · version 1.0 · as of October 2026*

**Tax rule for every agent:** this module states what public sources say. It is **not tax advice**. Anything that
decides how much VAT EXTAS charges or files goes to the owner's accountant.

---

## 1. Documents EXTAS produces [HOUSE — PR 179–182, 407, 409]

| Document | When | Must contain | Owner |
|---|---|---|---|
| **Customer invoice** (PR 407, template editor PR 409 — every word and block editable) | order confirmed / delivered | order no., date/time, customer name + phone + address, items (style, colour, size, SKU), qty, unit price, discounts, delivery charge, total, payment method (COD/bKash/Nagad), exchange/door rule line, shop contact | Bhandari |
| **Courier sticker** (PR 179) | booking | courier's consignment ID + barcode/QR (from the courier), COD amount, full item list, custom size | Bhandari |
| **Picking list** (PR 181) | daily | sorted category → style → size, highest quantity first | Bhandari |
| **Handover sheet** (PR 180) | pickup | consignments handed to the courier, signatures | Bhandari |
| **Exchange/return note** | exchange | original order, items in/out, charge, QC result | Bhandari |
| **VAT tax invoice (Mushak 6.3)** | only if EXTAS is VAT-registered and the sale requires it | see §2 | accountant decides |

Access to invoices is by ownership check or signed expiring link, never by guessable number (Prohori R06 worked example).

## 2. VAT facts we could verify

- **Standard VAT 15%**; reduced rates exist (1.5%, 2%, 2.4%, 4.5%, 5%, 7.5%, 10% for specified goods/services); **mandatory registration above BDT 5 million taxable turnover** (and for some goods/services regardless); **turnover tax (enlistment) for BDT 3–5 million at 4%** **[COMMUNITY — one reputable tax-firm summary (PwC Worldwide Tax Summaries, reviewed 31 Jul 2026); NBR text not read — the accountant confirms before any use]**.
- **Mushak 6.3** is the VAT tax invoice: issued by **VAT-registered suppliers at the time of supply**; fields include sequential serial number, date and time, supplier name/address/**BIN**, buyer details (buyer BIN if registered), description, quantity, unit price, value, VAT rate and amount, total, authorised signature **[2-SRC — tax practitioner guide + Ericsson Bangladesh supplier handbook (which also requires the format "in accordance with applicable law")]**.
- **Credit notes** must reference the original invoice and be accompanied by **Mushak 6.7** **[COMMUNITY — one source (Ericsson handbook); confirm with the accountant]**.
- FY2025-26 budget: VAT on **commission-based online product sales** (platform commissions) proposed to rise **5% → 15%** **[2-SRC — Financial Express + Dhaka Tribune, June 2025; final enactment not verified]**. This concerns platforms earning commissions — **not obviously EXTAS's own direct sales**; ask the accountant.
- **Which rate applies to EXTAS's own garment sales online, whether retail VAT schemes apply, and whether EXTAS must issue 6.3 to every customer — not verified. Accountant decision.**

Design consequence [HOUSE]: the invoice template supports both modes — **plain retail invoice** (now) and a **Mushak 6.3 layout** (BIN, VAT rate/amount per line, sequential serial, time of supply) switchable in the admin when the accountant says so. VAT reporting itself stays in the ERP (blueprint A3.6: removed from the shop).

## 3. Consumer-side document rules — Digital Commerce Operation Guidelines 2021 [2-SRC for delivery times; others single-source]
- Delivery within **5 days (same city)** / **10 days (different city)**, counted from payment **[2-SRC — Daily Star overview + law-firm summary headline]**.
- Listings must show **conditions of purchase and return**, price, delivery and other charges, and images/videos **[COMMUNITY — Daily Star overview]**.
- Keep business records **≥ 6 years** **[COMMUNITY — same]** → invoice archive retention ≥ 6 years in the backup policy (Prohori R04) **[HOUSE]**.
- The guidelines may have been amended since 2021 — the owner's lawyer confirms the current text.

## 4. Template rules [HOUSE]
1. Every word is a template variable or editable text (PR 409); no hardcoded policy strings (CI hardcode guard PR 494).
2. Bengali and English versions; Bengali digits optional in display; amounts always with ৳ and two-decimal precision internally.
3. A4 and thermal sizes; print test on the owner's printers; nothing cut at any supported size.
4. Invoice number sequence per company (multi-company ERP) with no gaps once VAT mode is on (6.3 requires sequential serials).
5. Never edit an issued invoice — corrections are a new document (credit/exchange note) linked to the original.
6. PDF stored with the order; customer link expires; staff access logged.

## 5. Checklist
- [ ] Invoice shows delivery charge and door/exchange rule (matches checkout wording)
- [ ] Sticker uses courier's consignment barcode only
- [ ] Picking list sort order correct
- [ ] Invoice access by ownership/signed link
- [ ] VAT mode switch exists; accountant's decision recorded
- [ ] Retention ≥ 6 years in backups

## 6. Worked example — the accountant says "register for VAT from 1 January"
Bhandari: switch template to 6.3 layout in staging → BIN and VAT fields filled from settings (not code) → serial sequence starts at 1 for the company → 5 test orders reviewed by the accountant → owner approves → switch on 1 Jan 00:00 → ERP handles VAT returns; shop sends business documents only (B04).

---

**Sources** (type in brackets):
- [Tax firm summary] PwC Worldwide Tax Summaries, Bangladesh — other taxes (VAT): https://taxsummaries.pwc.com/bangladesh/corporate/other-taxes
- [Practitioner guide] Md. Rakib Hassan, Mushak 6.3 VAT invoice: https://rakibhassan.eu/mushak-6-3-vat-invoice-bangladesh/
- [Corporate supplier handbook] Ericsson, Bangladesh supplier handbook (Mushak 6.3, 6.7): https://www.ericsson.com/48d8dd/assets/local/about-ericsson/sourcing/documents/invoicing-and-payments/a-d/bangladesh-supplier-handbook-20260108.pdf
- [News] The Financial Express, Budget FY26 — VAT on online businesses: https://thefinancialexpress.com.bd/economy/bangladesh/budget-fy26-govt-to-triple-vat-on-online-businesses
- [News] Dhaka Tribune, Online shopping to get costlier: https://www.dhakatribune.com/bangladesh/382902/online-shopping-to-get-costlier
- [News] The Daily Star, Overview of the Digital Commerce Operation Guidelines 2021: https://www.thedailystar.net/law-our-rights/news/overview-the-digital-commerce-operation-guidelines-2021-2128871
- [Law-firm summary] VDB Loi, Bangladesh new e-commerce rules (5 or 10 days): https://vdb-loi.com/bd_publications/bangladesh-new-rules-for-e-commerce-marketplaces-need-to-register-deliver-within-5-or-10-days/
- [Internal] master register PR 179–182, 407, 409, 494; blueprint A3.6

*As of October 2026.*
