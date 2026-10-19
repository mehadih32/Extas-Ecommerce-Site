# P03 · Consistent framing and aspect ratios — site, catalogues and every ad placement

*Shilpi শিল্পী · A360-05 · photo module 3 of 6 · version 1.0 · as of October 2026*

---

## 1. The master rule: shoot once, crop many
Shoot at high resolution with the garment inside the **central 4:5 area of a 9:16 frame**, with clear margin. One master
then crops to 4:5 (site, Meta feed), 1:1 (carousels, catalogues), 9:16 (Reels/Stories/TikTok/Shorts) without cutting the
product **[HOUSE; matches Tirondaj T05 §6]**.

## 2. Site standard (blueprint C7.5)
- **Canvas 4:5** for product gallery images; same garment scale and centre across all products; standard background (studio grey/white) — the grid then looks like one catalogue.
- Long side ≥ 2,000 px master stored; delivered sizes generated (P05).
- Garment occupies a consistent share of the frame **[HOUSE: target ~80–85% of the height for ghost/flat; Amazon's 85% main-image rule (forum summary) is a useful reference]**.
- Full-body model shots: don't crop head or feet (Google Merchant Center clothing guidance).

## 3. Placement table

| Destination | Ratio | Size / rule | Source |
|---|---|---|---|
| EXTAS PDP gallery & grid | 4:5 | consistent scale/centre; ≥ 2000 px master | blueprint C7.5 |
| Meta FB/IG feed | 4:5 | 1080×1350 | Rocketium (citing Meta Ads Guide) |
| Meta Reels/Stories | 9:16 | 1080×1920; keep ~14% top, ~35% bottom, ~6% sides clear on Reels; Stories ~14% top / ~20% bottom | Strike Social 2026 |
| Meta carousel / Marketplace | 1:1 | 1080×1080; all cards same ratio | Rocketium |
| Meta catalogue `image_link` | any; ≥ 500×500 | JPEG/PNG ≤ 8 MB | Meta catalogue fields (official) |
| TikTok in-feed | 9:16 | ≥ 720p; key content central | TikTok creative best practices (official) |
| Google Merchant Center (clothing) | 9:11 vertical or 4:3 horizontal preferred | ≥ 512×512, ideally ≥ 1024, width 1500 recommended; plain white/transparent background for main image; model shots for clothing | Merchant Center clothing best practices (official) |
| Google Search (Product markup images) | 16:9, 4:3, 1:1 (provide all) | high resolution, crawlable | Google merchant listing docs (official) |
| Google Demand Gen | vertical, square, horizontal | ≥ 3 images each shape per campaign | Google Ads Help (official) |
| YouTube in-stream | 16:9 | 1920×1080 | Rocketium |
| Open Graph (link previews on Facebook/WhatsApp) | ~1.91:1 | 1200×630 commonly used | **[COMMUNITY — verify with Meta sharing debugger]** |

Note the conflict: site 4:5 vs Merchant Center's preferred 9:11 (very close: 0.80 vs 0.82) and white background. → Export a **feed variant** (9:11 or 1:1 on white) for Merchant Center/Meta catalogue; keep 4:5 studio-grey on the site if that's the brand look.

## 4. Consistency spec (template for the studio)
- Camera height: chest level for tops, hip level for bottoms.
- Garment centre on the vertical centre line; collar/waist at a fixed % from the top.
- Same shadow style (soft drop shadow or none) for every product.
- Same background tone per season (scene library: studio grey, street, festive, winter — blueprint).

## 5. QA
- [ ] All delivered crops generated from one master; product not cut in any crop.
- [ ] Text/price overlays only in ads, inside safe zones; never on catalogue/Merchant main images.
- [ ] Grid screenshot on 3 phone sizes: products line up (same scale/centre).

---

**Sources** (type in brackets):
- [Official] Merchant Center Help, clothing best practices: https://support.google.com/merchants/answer/7348545?hl=en
- [Official] Google, Merchant listing structured data (image ratios): https://developers.google.com/search/docs/appearance/structured-data/merchant-listing
- [Official] Meta catalogue fields: https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/fields
- [Official] TikTok creative best practices: https://ads.tiktok.com/help/article/creative-best-practices?lang=en
- [Official] Google Ads Help, Demand Gen best practices: https://support.google.com/google-ads/answer/14693848
- [Practitioner] Rocketium, Meta creative specs 2026: https://rocketium.ai/academy/all/meta-creative-specs
- [Practitioner] Strike Social, Meta ad specs 2026: https://strikesocial.com/blog/meta-ad-specs/
- [Community] Amazon Seller Forums, main image requirements summary: https://sellercentral.amazon.com/seller-forums/discussions/t/13af96ea-6b07-4bf9-8dbe-a13292c2e3b1
- [Internal] EXTAS blueprint C7.5, C7.13

*As of October 2026.*
