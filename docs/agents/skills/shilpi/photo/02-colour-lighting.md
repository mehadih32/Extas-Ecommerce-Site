# P02 · Colour accuracy and lighting — because wrong colour means refused parcels

*Shilpi শিল্পী · A360-05 · photo module 2 of 6 · version 1.0 · as of October 2026*

In a COD market a customer who opens a parcel and sees "a different colour" refuses it at the door. The blueprint says
honest images mean "fewer refused parcels — it pays for itself". Colour accuracy is a money skill.

---

## 1. Capture
- **Light:** even, soft light — two lights either side (umbrellas/softboxes) or large window light; continuous LED keeps exposure and contrast consistent across a session (Pixelz; Profoto; Shopify three-point: key, fill, back).
- **One light type per session.** Don't mix window daylight with warm room bulbs (mixed colour casts can't be fully corrected) **[COMMUNITY — standard practice]**.
- **Reference target:** a grey card or colour checker in **one frame per colourway** (blueprint C7.4) — used for white balance and colour correction.
- **Format:** shoot RAW where possible (largest JPG otherwise); low ISO (100–200) in good light; tripod for slow shutter; enough depth of field to keep the whole garment sharp (Shopify).
- **Backgrounds:** white or light grey; for white/light garments use slightly off-white or grey for contrast (Shopify).

## 2. Correct
1. White balance from the grey card / checker frame; apply the same correction to all frames of that colourway.
2. Exposure normalised; no "beauty" saturation boosts on product colour.
3. Compare on screen against the **physical garment** under neutral light; adjust until a person holding the garment agrees.
4. Pipeline check (blueprint C7.5 step 6): colour measured against the ERP colour name and checker; **drift beyond tolerance flagged** for review.
5. Colour name in words matches what the eye sees ("Navy", "Bottle Green") — Meta/Google catalogues require colour in words, never hex.

## 3. Output colour space
- Edit, check and export in **sRGB with the sRGB profile embedded** — EIZO's browser tests: sRGB-tagged images displayed correctly in nearly every browser/device, while Adobe RGB-tagged images showed errors on several (incl. Chrome on Android "Adaptive") **[INDUSTRY — one source (EIZO, a monitor maker's lab tests); widely used practice]**. Note: Specification.website advises stripping colour profiles to save bytes — the two only reconcile if the image is converted to sRGB first (next point).
- Note the tension: stripping metadata saves bytes, but keep (or convert to) sRGB before stripping so colours don't shift; a stripped untagged image is interpreted as sRGB by browsers **[COMMUNITY — test on our pipeline]**.
- Editing monitor: calibrated, in sRGB mode, checked on the main display; test final images on a mid-range Android phone (our customers' screen) as well (EIZO advice on multi-device testing).

## 4. "True colour" label
The blueprint's gallery includes a view labelled **True colour** — the corrected real flat/ghost photo under neutral light. Ads and AI on-model images may vary; the True-colour image is the promise.

## 5. Checklist
- [ ] Checker/grey frame exists for every colourway.
- [ ] WB and exposure corrected consistently per colourway.
- [ ] Side-by-side with the physical garment approved by a person (owner/Bhandari) for new colours.
- [ ] Exported sRGB; viewed on a phone.
- [ ] Colour word in catalogue matches.

---

**Sources** (type in brackets):
- [Industry/vendor] EIZO, Colour management summary: https://eizo.com/library/management/color-management-summary
- [Practitioner/vendor] Shopify, Clothing photography (May 2025): https://www.shopify.com/blog/clothing-photography
- [Practitioner/vendor] Pixelz, Ghost mannequin photography: https://www.pixelz.com/blog/invisible-ghost-mannequin-photography/
- [Practitioner/vendor] Profoto, ghost mannequin blazer: https://www.profoto.com/cz/en/studio-solutions/tips-tricks/how-to-photograph-a-blazer-on-a-ghost-mannequin
- [Technical spec] Specification.website, Image optimisation: https://specification.website/spec/performance/image-optimization/
- [Official] Meta catalogue fields (colour in words): https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/fields
- [Internal] EXTAS blueprint C7.4–C7.5, C7.15

*As of October 2026.*
