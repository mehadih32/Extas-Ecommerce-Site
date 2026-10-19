# U09 · Checkout form UX for Bangladesh — phone first, Bengali digits, address entry

*Shilpi শিল্পী · A360-05 · ux module 9 of 10 · level: Post-graduate · version 1.0 · as of October 2026*

Owner of the checkout logic is Sawdagor (S01, S03); Shilpi owns the form's design layer. Wave-1 S01 has Baymard's field-count and full-name findings — this module adds BD specifics.

---

## 1. Facts that shape the form

- **BD mobile numbers:** domestic **11 digits, `01X NN-NNNNNN`**; international **+880 1X…** (drop the 0). Prefixes: **013** Grameenphone (Skitto), **014** Banglalink, **015** Teletalk, **016** Airtel, **017** Grameenphone, **018** Robi, **019** Banglalink; 010/012 spare, 011 closed (Citycell). **Number portability exists** — prefix ≠ current operator **[COMMUNITY — single reference (Wikipedia); test before use]**. Because it is one source, the **11-digit `01` rule is a hard check, but the 013–019 prefix rule is a soft warning** ("নম্বরটা আরেকবার দেখুন") that never blocks the order, until BTRC's numbering plan or our own order data confirms it.
- Baymard: **14%** of 1,026 surveyed shoppers would never give a phone number; **39%** of benchmarked sites require it without saying why; unexplained required phone fields cause fake numbers and abandonment **[OFFICIAL — Baymard]**. In a COD market the phone is essential (confirmation call, courier) — so **explain it**.
- Phone keypad: `type="tel" inputmode="tel" autocomplete="tel"`; the iOS phone keypad lacks some characters, so **never require formatting**; don't split the field **[OFFICIAL — Baymard labs]**.
- **Inline validation:** ~31% of sites have none; validate **on blur**, or once the expected length is reached for fixed-length fields (phone); **remove the error as soon as it's fixed**, while typing; positive ticks help **[OFFICIAL — Baymard]**.
- **Adaptive error messages:** 93% of sites don't have them **[OFFICIAL — Baymard 2026]**.
- **Address line 2:** causes hesitation and misplaced data; collapse it behind a link when most people don't need it **[OFFICIAL — Baymard]**.
- **Address validator** missing on 54% of sites **[OFFICIAL — Baymard 2026]** → EXTAS's gazetteer resolver (PR 550/551).
- WCAG 3.3.7 Redundant Entry (A): don't ask twice in one process **[OFFICIAL — W3C]**.

## 2. Bengali digits — normalise everything [HOUSE]

Customers type ০১৭১২৩৪৫৬৭৮ (Bengali keyboard) or 01712345678 or +880 1712-345678 or 8801712345678.

```js
const BN = '০১২৩৪৫৬৭৮৯';
function normPhoneBD(raw){
  let s = raw.replace(/[০-৯]/g, d => String(BN.indexOf(d)))   // U+09E6–U+09EF → 0–9
             .replace(/[^\d+]/g, '');                           // drop spaces, dashes, brackets
  if (s.startsWith('+880')) s = '0' + s.slice(4);
  else if (s.startsWith('880')) s = '0' + s.slice(3);
  if (!/^01\d{9}$/.test(s)) return { ok:false, s };             // hard rule: 11 digits, starts 01
  return { ok:true, s, warn: !/^01[3-9]/.test(s) };              // soft: unusual prefix → warn only
}
```
- Store **ASCII `01XXXXXXXXX`** (and E.164 `+8801XXXXXXXXX` for SMS/WhatsApp APIs). Display may use Bengali digits in Bengali mode.
- Apply the same digit normalisation to postcode, quantity and OTP fields; OTP fields allow **paste** (WCAG 3.3.8) and `autocomplete="one-time-code"`.

## 3. The EXTAS checkout form (phone first) [HOUSE, built on the blueprint's stepped checkout]

| Order | Field | Markup | Helper / error (examples, Bengali mode) |
|---|---|---|---|
| 1 | **মোবাইল নম্বর** | `type=tel inputmode=tel autocomplete=tel` 16 px | Helper: "অর্ডার কনফার্ম ও ডেলিভারির জন্য — কেউ বিরক্ত করবে না" · Errors: "নম্বর ১১ ডিজিট হতে হবে" / "নম্বর ০১ দিয়ে শুরু হবে" · Soft warning: "নম্বরটা আরেকবার দেখুন" |
| 2 | নাম (one field) | `autocomplete=name` | "নাম লিখুন" |
| 3 | **ঠিকানা** (one multiline field: house/road/area/thana/district) | `autocomplete=street-address`, 2–3 rows | resolver reads on blur/pause; band chip appears: "ঢাকা সিটি · ৳৬০ · বদলান" |
| — | (collapsed) "ল্যান্ডমার্ক যোগ করুন" | link → one optional field | — |
| 4 | Payment: **ক্যাশ অন ডেলিভারি** preselected; bKash/Nagad visible | radio cards ≥ 56 px tall | door rule line under COD (Sawdagor S03) |
| 5 | CTA says what's missing: "মোবাইল নম্বর দিন" → "অর্ডার কনফার্ম করুন · ৳১,৩৮০" | full-width, sticky only when no input focused (U08 §2) | — |

Rules:
1. **Returning customer:** phone recognised (after OTP or on the confirmation step) → name/address prefilled and editable (3.3.7).
2. **No district dropdown of 64/72 options** — gazetteer + one two-button question when unsure ("ঢাকা সিটির ভেতরে" / "ঢাকার বাইরে") (blueprint §46.7).
3. Labels always visible (not placeholder-only); errors in text next to the field, linked with `aria-describedby`, announced politely.
4. Keep the form one column; group with headings; every field ≥ 44 px tall, input text 16 px.
5. Nothing is reset on error; scroll to the first error and focus it.

## 4. Decision tree — phone field state

```
on input  → normalise digits silently (show what they typed, but Bengali digits allowed)
length 11 reached or blur →
   valid?  yes → green tick, move focus to next field (only on length-complete, not on blur)
           no  → which rule failed? → show that one specific message
on edit after error → re-check while typing; clear error the moment it's valid
```

## 5. Test set (Prohori R10 uses these)
`০১৭১২৩৪৫৬৭৮` ✔ · `+880 1712-345678` ✔ · `8801712345678` ✔ · `1712345678` ✘ "০ দিয়ে শুরু" (offer to add 0) · `01212345678` ⚠ soft warning, order allowed · `0171234567` ✘ length · paste with spaces ✔.

---

**Sources** (type in brackets):
- [Reference] Wikipedia, Telephone numbers in Bangladesh: https://en.wikipedia.org/wiki/Telephone_numbers_in_Bangladesh
- [Research — Baymard] Explain required phone fields: https://baymard.com/research-articles/explain-phone-number-field
- [Research — Baymard labs] Touch keyboard types: https://baymard.com/labs/touch-keyboard-types
- [Research — Baymard] Inline form validation: https://baymard.com/blog/inline-form-validation
- [Research — Baymard] Address line 2: https://baymard.com/blog/address-line-2
- [Research — Baymard] Mobile UX 2026 (adaptive errors, address validator): https://baymard.com/blog/mobile-ux-ecommerce
- [Official — W3C] What's new in WCAG 2.2 (3.3.7, 3.3.8): https://w3.org/WAI/standards-guidelines/wcag/new-in-22/
- [Internal] blueprint §46.7 address zone detection; master register PR 550/551; skills/sawdagor/01, 03

*As of October 2026.*
