# U04 · Accessibility — WCAG 2.2 AA essentials, focus in modals, contrast

*Shilpi শিল্পী · A360-05 · ux module 4 of 10 · level: Graduate → Post-graduate · version 1.0 · as of October 2026*

---

## 1. What changed in WCAG 2.2 (9 new criteria; 4.1.1 Parsing removed) [OFFICIAL — W3C]

| SC | Name | Level | EXTAS meaning |
|---|---|---|---|
| 2.4.11 | Focus Not Obscured (Minimum) | **AA** | the sticky header / bottom buy bar / cookie strip must never **fully** hide the focused element |
| 2.4.12 | Focus Not Obscured (Enhanced) | AAA | no part hidden (aim, not required) |
| 2.4.13 | Focus Appearance | AAA | focus ring ≥ 2 px perimeter, 3:1 change (we adopt it as house style) |
| 2.5.7 | Dragging Movements | **AA** | every drag (photo carousel, price slider) has a tap alternative (arrows, input boxes) |
| 2.5.8 | Target Size (Minimum) | **AA** | ≥ 24 × 24 px or spacing exception (U02: we use 44) |
| 3.2.6 | Consistent Help | A | WhatsApp / hotline in the **same place** on every page |
| 3.3.7 | Redundant Entry | A | don't ask for phone/address twice; prefill on return / exchange forms |
| 3.3.8 | Accessible Authentication (Minimum) | **AA** | login by OTP is fine; allow paste into OTP fields; no puzzle CAPTCHA without an alternative |
| 3.3.9 | Accessible Authentication (Enhanced) | AAA | — |

## 2. Contrast [OFFICIAL — W3C Understanding 1.4.3; MDN]

| Content | AA minimum |
|---|---|
| Body text | **4.5 : 1** |
| Large text (≥ 18 pt ≈ 24 px, or ≥ 14 pt ≈ 18.66 px **bold**) | **3 : 1** |
| UI components and graphics (borders of inputs, icons, focus rings, selected swatch ring) — SC 1.4.11 | **3 : 1** |

- Ratios are thresholds — **4.499 fails 4.5**; don't round **[OFFICIAL]**.
- Exceptions: logos, disabled controls, pure decoration **[OFFICIAL]**.
- Thin fonts may need more contrast than the number says **[OFFICIAL]**; W3C gives no separate rule for Bengali, so treat Bengali body text as body text (4.5 : 1) and check the thinnest weight used **[HOUSE]**.
- Tools: WebAIM contrast checker; Firefox Accessibility Inspector **[OFFICIAL — MDN]**; axe in Prohori's Playwright run (R10).

**EXTAS traps:** grey "was" price and grey helper text; white text on the owner's Add-to-Bag shade options (each shade must pass 4.5 : 1 for its label or 3 : 1 if label ≥ 18.66 px bold); sale badge red on photo.

## 3. Modals, sheets and drawers — focus management [OFFICIAL — WAI-ARIA APG Dialog (Modal) pattern]

1. On open, **focus moves inside**: to the first field, or to the title (`tabindex="-1"`) when content is long, or to the **least destructive** button for irreversible actions.
2. **Tab / Shift+Tab stay inside** and wrap.
3. **Escape closes.**
4. On close, focus **returns to the element that opened it** (or the next logical element if it's gone).
5. Markup: `role="dialog"`, `aria-modal="true"` **only if the page behind is truly inert and covered**, an accessible name via `aria-labelledby` (visible title) or `aria-label`; a visible close button in the tab order.
6. **[HOUSE additions]:** background gets `inert`; body scroll locked **without** killing the browser's pull-to-refresh after close (owner rule: never stop the browser's own behaviours without putting them back); the native `<dialog>` element with `showModal()` is preferred where it meets the rules above (test on iOS Safari).

EXTAS dialogs this applies to: size chart, photo zoom viewer, filter sheet, "send my bag on WhatsApp", address-band "change" sheet, delete-from-bag confirm, AI chat.

## 4. AA essentials checklist for every customer page

- [ ] Every image has the right alt (Shilpi P06 decision tree); decorative = `alt=""`
- [ ] Headings in order; one H1
- [ ] All controls reachable and operable by keyboard; visible focus ring (2 px, 3 : 1)
- [ ] Focus never fully hidden by sticky header/footer (`scroll-padding-top/bottom` = bar heights)
- [ ] Labels on every input (not placeholder-only); errors in text, linked with `aria-describedby`
- [ ] Colour is never the only signal (selected size = border + tick + bold; out-of-stock = strike + "শেষ")
- [ ] Contrast table above passes for every state (default, hover, selected, disabled-exempt)
- [ ] Drag has tap alternative; targets ≥ 24 px (house 44)
- [ ] Help (WhatsApp/hotline) in the same place on every page
- [ ] `lang` set per block (bn/en); page zoom to 200% doesn't break layout; **never** `maximum-scale=1` / `user-scalable=no` (U08)
- [ ] Motion respects reduced-motion (U06)

## 5. Worked example — size chart sheet

Open: tap "Size chart ›" → sheet slides up (fade only if reduced motion) → focus to sheet title "সাইজ চার্ট — পোলো" → table readable by screen reader (`<table>` with `<th scope>`), cm and inch toggle is a real button group → Esc/close button/scrim tap closes → focus back on "Size chart ›" → page scroll unchanged.

---

**Sources** (type in brackets):
- [Official — W3C] What's new in WCAG 2.2: https://w3.org/WAI/standards-guidelines/wcag/new-in-22/
- [Official — W3C] Understanding SC 1.4.3 Contrast (Minimum): https://w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- [Official — MDN] Color contrast (1.4.3, 1.4.6, 1.4.11; tools): https://developer.mozilla.org/en-US/docs/Web/Accessibility/Understanding_WCAG/Perceivable/Color_contrast
- [Official — W3C WAI-ARIA APG] Dialog (Modal) pattern: https://www.w3.org/WAI/ARIA/apg/patterns/dialogmodal/
- [Internal] lessons/ALL.md (pull-to-refresh rule), skills/shilpi/photo/06-alt-text-image-seo.md

*As of October 2026.*
