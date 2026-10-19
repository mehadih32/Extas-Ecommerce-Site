# P06 · Alt text, file names and image SEO

*Shilpi শিল্পী · A360-05 · photo module 6 of 6 · version 1.0 · as of October 2026*
*Doot owns SEO strategy; Shilpi/Bhandari own image data. This module is the shared rule.*

---

## 1. Alt text rules (W3C WAI decision tree + Google)
- **Informative image** (product photo): brief description of what matters to a shopper. Google: describe the image in context; **no keyword stuffing** ("may cause your site to be seen as spam").
- **Decorative** (background textures, dividers): `alt=""`.
- **Functional** (image inside a link/button, e.g. a combo card linking to the combo page): describe the destination/action, not the look.
- **Image containing text** (price card, banner): put the text in the alt if it isn't on the page as real text.
- **Redundant** (thumbnail repeated next to the product name link): `alt=""`.

## 2. EXTAS alt patterns
| Image | Alt (English page) | Alt (Bengali page) |
|---|---|---|
| Front, flat/ghost | "EXTAS pique polo shirt in navy, front view" | "নেভি রঙের EXTAS পিকে পোলো শার্ট, সামনের দিক" |
| On-model | "Model 5'9", 70 kg wearing navy pique polo in size L, three-quarter view" | "৫'৯\", ৭০ কেজির মডেল L সাইজের নেভি পোলো পরে আছেন" |
| Fabric macro | "Close-up of navy pique knit fabric texture" | "নেভি পিকে কাপড়ের কাছ থেকে তোলা ছবি" |
| Set photo | "Summer combo: white polo shirt and grey jogger laid out as an outfit" | "সামার কম্বো: সাদা পোলো আর ছাই রঙের জগার" |
| Colour swatch button | "Navy" (function: select colour) | "নেভি" |
Rules: ≤ ~125 characters as a habit **[COMMUNITY — screen-reader practice]**; include colour, view, and for model shots the model size info; no "image of"/"photo of".

## 3. File names and URLs
- Short, descriptive, lowercase, hyphens: `extas-pique-polo-navy-front.avif` (Google: descriptive filenames, not `IMG00023`).
- File extension must match the real format (Google).
- One consistent URL per image across pages (Google).

## 4. Discoverability
- Use real `<img>` (not CSS backgrounds) for product images (Google).
- Image sitemap or images in the product sitemap, including CDN URLs (Google allows image URLs on other domains).
- Product JSON-LD `image` with 16:9, 4:3 and 1:1 versions (Doot D02).
- `og:image` = the representative product image for link previews.

## 5. Checklist
- [ ] Every product image has alt text per pattern; decorative ones `alt=""`.
- [ ] Bengali page alts in Bengali.
- [ ] Filenames descriptive; extensions correct.
- [ ] Images in sitemap; JSON-LD image array present.

---

**Sources** (type in brackets):
- [Official standard] W3C WAI, An alt decision tree: https://www.w3.org/WAI/tutorials/images/decision-tree/
- [Official] Google, Image SEO best practices: https://developers.google.com/search/docs/appearance/google-images
- [Official] Google, Merchant listing structured data (image ratios): https://developers.google.com/search/docs/appearance/structured-data/merchant-listing

*As of October 2026.*
