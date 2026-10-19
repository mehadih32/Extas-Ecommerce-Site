# Shilpi · Photo standard exam (curriculum wave 1)

*20 items · pass mark 85% (17/20) · as of October 2026*

1. Name the three shot types and one strength and one weakness of each.
2. Which shot type does the blueprint call the best input for AI try-on, and why?
3. Ghost mannequin: what two shots are composited, and what must stay identical between them?
4. Camera height for tops vs bottoms, and what goes wrong if it's too high or low?
5. EXTAS gallery order for a polo.
6. What goes in one frame per colourway, and what is it used for?
7. Why must lighting types not be mixed in one session?
8. Export colour space and why (cite the test evidence).
9. What is the site's standard canvas ratio, and what feed variant is needed for Merchant Center?
10. Give ratio + pixels for Meta feed, Reels, carousel, TikTok.
11. Reels safe zones (top/bottom/sides) per the 2026 secondary guide.
12. Minimum catalogue image size for Meta, and Merchant Center's clothing image guidance (size, background, model rule).
13. (P) Describe the set photo for a "3 polos" multi-pack and for a "polo + jogger" outfit combo.
14. Why must a combo never be advertised with a single-piece photo?
15. Format fallback chain and a sensible WebP quality for product photos.
16. Two reasons to always set width/height on images.
17. Should the first PDP image be lazy-loaded? Explain.
18. (P) Write English and Bengali alt text for an on-model three-quarter view of a grey hoodie, model 5'10", size XL.
19. When is `alt=""` correct? Give two EXTAS examples.
20. Give a correct file name for the back view of a black jogger in AVIF and two other Google image rules.

---

## Answer key
1. Flat lay (cheap/colour-texture; no fit/drape) · ghost mannequin (3D worn shape, consistent; compositing effort, no person) · on-model (fit/scale; cost/consistency/AI fidelity risk).
2. Ghost mannequin — garment already has a worn shape, try-on quality jumps (blueprint C7.4).
3. Garment on mannequin + inner neck/back on foam board; same lights, same position/height marks.
4. Chest level for tops, hip level for bottoms; otherwise the garment looks tapered (telephoto reduces distortion).
5. Real front shot → on-model views → back → fabric close-up → detail.
6. Grey card / colour checker; white balance and colour correction, drift check against ERP colour.
7. Mixed colour casts can't be fully corrected.
8. sRGB with profile embedded; EIZO tests showed sRGB displays correctly almost everywhere, Adobe RGB errors on several setups incl. Chrome Android Adaptive.
9. 4:5; feed variant 9:11 (or 1:1) on plain white/transparent background.
10. 4:5 1080×1350; 9:16 1080×1920; 1:1 1080×1080; 9:16 ≥ 720p (1080×1920).
11. ~14% top, ~35% bottom, ~6% each side.
12. 500×500 (JPEG/PNG ≤ 8 MB); ≥ 512×512, ideally ≥ 1024, width 1500 recommended, white/transparent background, clothing on models, no head/feet crop.
13. Multi-pack: fanned/stacked, every colour visible, count readable at 300 px, identical folds. Outfit: polo above jogger as worn, aligned, same scale, plus model wearing the set; not-included items absent/labelled.
14. Misleading price/content → wrong expectation → refusals; combos are their own catalogue items.
15. AVIF → WebP → JPEG; ~75–80 (verify visually on dark/fine-knit fabrics).
16. Prevent layout shift (CLS) and let the browser compute aspect ratio/reserve space.
17. No — it's usually the LCP element; load eagerly with high fetch priority; lazy-load the rest.
18. Graded: e.g. "Model 5'10" wearing grey hoodie in size XL, three-quarter view" / "৫'১০\" মডেল XL সাইজের ছাই রঙের হুডি পরে আছেন, পাশ থেকে"; no stuffing.
19. Decorative or redundant images: background texture/divider; thumbnail repeated next to the product name link; text already on page.
20. `extas-jogger-black-back.avif`; real `<img>` not CSS background; extension matches format; one consistent URL; descriptive alt without stuffing (any two).
