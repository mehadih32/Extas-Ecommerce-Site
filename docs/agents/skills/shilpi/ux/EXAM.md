# Shilpi · ux/ · Curriculum wave 2 exam (senior UI/UX)

*24 items · pass mark 85% (21/24) · (P) = practical task graded on the sandbox build · shipping a visible change without
a picture sheet for the owner, or deleting an owner feature instead of switching it off, scores 0 and fails the exam ·
as of October 2026*

1. Baymard 2026 mobile benchmark: sample size, share of sites "Mediocre", and three of the ten most-missed practices.
2. Why must EXTAS show one card per style with all colour swatches? Give the two Baymard figures.
3. WCAG 2.5.8: the minimum size and the spacing exception. What size does EXTAS use for frequent targets, and why?
4. What did Hoober's 2013 study find about grips, and what did he later say about his reach drawings?
5. Name four new WCAG 2.2 criteria at Level AA and one EXTAS screen each affects.
6. Contrast: body text, large text (define it), and UI components — give the AA ratios. Is 4.49 : 1 a pass?
7. List the five focus rules for a modal dialog from the WAI-ARIA APG.
8. (P) Build the size-chart sheet so it passes U04 §5 — focus in, Esc, focus back, scroll unchanged — and show the Playwright check.
9. Hind Siliguri: foundry, licence, weights, italic? What does that mean for emphasis in Bengali?
10. Why is `letter-spacing` banned on Bengali text? Cite the W3C finding.
11. Name two Bengali typesetting rules from W3C (danda, underline, digits, conjuncts — any two).
12. Design tokens: name, date and status of the DTCG format; how is an alias written; two reference implementations.
13. (P) Write the three-tier tokens for the Add-to-Bag button so the owner can change its shade in the admin without touching components; include the contrast record.
14. `prefers-reduced-motion`: values, the iOS setting, and what MDN says to do with scale animations.
15. Does a colour change count as "motion" under WCAG 2.3.3? What does?
16. Explain svh, lvh, dvh. Which does EXTAS use for the PDP photo, and which owner lesson drives it?
17. What happens to a `position: fixed` bottom bar when the iOS keyboard opens, and what is the EXTAS rule?
18. Why can't EXTAS rely on `interactive-widget`?
19. Name three things that block or hurt the back-forward cache and the event used to refresh data on restore.
20. Why must `overscroll-behavior: none` never be set on `html/body` at EXTAS?
21. (P) Write `normPhoneBD()` and run it on the seven test inputs in U09 §5; explain why the 013–019 prefix check is only a warning.
22. Baymard on phone fields: the two figures and the recommended fix. Write the Bengali helper line.
23. NN/g's limits for a clear hierarchy (sizes, contrasts, large elements, colours) and the squint test — apply them to the PDP first screen.
24. (P) The owner asks for a red flashing "Limited offer!" banner above the product photo. Respond: what you check, what you propose, and how you would measure it.

---

## Answer key
1. 150+ sites, 71,000+ elements; 75% Mediocre (~95% Mediocre or Decent, one Good). Any three of: current scope in nav 94%; adaptive errors 93%; all swatches 73%; filter overview 66%; review photos 57%; address validator 54%; View all 42%; combine variants 42%; misspelling autocomplete 28%; search button 27%.
2. 73% don't show all swatches in list items; 42% don't combine variations into one list item.
3. 24 × 24 CSS px, or a 24 px circle around each undersized target doesn't intersect another target (plus equivalent-control/inline/UA/essential exceptions). EXTAS: ≥ 44 px hit area — 24 is the floor; NN/g ~1 cm; Apple 44 pt; Material 48 dp; spacing doesn't fix tiny targets.
4. 780 of 1,333 touching the screen: 49% one-handed, 36% cradled, 15% two-handed; he asked readers to ignore the drawings — later research: centre touched more, faster, more accurately.
5. Any four: 2.4.11 Focus Not Obscured (sticky header/buy bar), 2.5.7 Dragging (carousel/price slider), 2.5.8 Target Size (size boxes), 3.3.8 Accessible Authentication (OTP paste, no puzzle CAPTCHA).
6. 4.5 : 1; 3 : 1 for ≥ 18 pt (~24 px) or ≥ 14 pt (~18.66 px) bold; 3 : 1 for UI components/graphics (1.4.11). 4.49 fails — no rounding.
7. Focus moves inside on open (field/title/least destructive); Tab/Shift+Tab wrap inside; Esc closes; focus returns to the opener (or next logical element); role=dialog + aria-modal only if background inert + accessible name, visible close button.
8. Graded: focus target correct, trap, Esc, return focus, scroll unchanged, reduced-motion fade, Playwright assertion of `document.activeElement` before/after.
9. Indian Type Foundry (Jyotish Sonowal), SIL OFL 1.1, 300/400/500/600/700 static, no italic → emphasis by weight (600), never synthetic italic.
10. Gecko, Blink and WebKit insert space inside half-form conjuncts; cannot be worked around (W3C Bengali gap analysis #117).
11. Any two: danda । never wraps alone; native digits ০–৯; conjunct is one editing unit; underline not traditional and collides with marks.
12. Design Tokens Format Module 2025.10, 28 Oct 2025, first stable; `"{group.token}"`; Style Dictionary, Tokens Studio, Terrazzo.
13. Graded: primitive → semantic `color.action.buy.bg` → component `pdp.buyBar.button.bg`; label colour pair with recorded ratio ≥ 4.5 : 1 (or 3 : 1 if ≥ 18.66 px bold); admin edits semantic only; versioned with rollback.
14. no-preference / reduce; Settings › Accessibility › Motion; remove, reduce or replace (scale → dissolve).
15. No — colour/opacity don't count unless they change perceived size, shape, position or depth; movement, size, position, depth changes do.
16. svh = toolbars expanded, lvh = retracted, dvh = switches dynamically (not at 60 fps). PDP photo: svh (or fixed aspect ratio) — lesson R15 7.2 photo must not resize when bars slide.
17. Safari resizes only the visual viewport; fixed bar stays and can be covered. Rule: hide the fixed bar while an input has focus; in-flow Continue button (or visualViewport lift, tested on a real iPhone).
18. Supported only in Chrome 108+ and Firefox 132+, not Safari (all iPhone browsers are WebKit).
19. Any three: unload handlers; Cache-Control: no-store on non-sensitive pages; open connections (IndexedDB, fetch, WebSocket in some browsers) not closed in pagehide; window.opener. Event: pageshow with event.persisted === true.
20. Owner rule R15 6.1 — never stop the browser's own behaviours (pull-to-refresh, bounce) without putting them back; use `contain` only on inner scrollers.
21. Graded: Bengali-digit mapping, +880/880 handling, hard 11-digit 01 rule, soft prefix warning; 7 cases correct. Prefix rule has one source (Wikipedia) and portability exists — quality gate says warn, don't block.
22. 14% would never give a phone; 39% of sites require it without explanation → short inline reason. e.g. "অর্ডার কনফার্ম ও ডেলিভারির জন্য — কেউ বিরক্ত করবে না".
23. ≤ 3 type sizes, ≤ 3 contrast variations, ≤ 2 large elements, ≤ 2 primary + 2 secondary colours; blur the screenshot — photo, buy button, price must stand out; nothing else competes.
24. Check: hierarchy (promo must not outrank product), reduced motion / flashing risk and pause control, contrast, honesty (is the offer real and time-limited? — Sawdagor S05; price/discount is the owner's decision), gate. Propose: 2–3 pictures — a calm one-line strip near the price with real end time, no flashing; ship behind a switch; measure delivered orders/session with add-to-bag and refusals as guards.
