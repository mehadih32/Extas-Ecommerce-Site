# The 70-order simulation — every order's details

**সারকথা:** 70টা পরীক্ষার 42টা পাস, 28টা বাদ, কোনো ফেল নেই। সব টেস্ট অর্ডার বাতিল আর টেস্ট পণ্য আর্কাইভ করা হয়েছে।

- Run: 2026-11-07 02:52 (Asia/Dhaka) · version `6309ce1b7e77` · host: the preview host of the server's settings · scenarios asked: all
- Result: **PASS** — 42 passed, 0 failed, 28 skipped, 42 test orders placed.
- Providers: every payment, courier, message and ERP connection is on its mock; nothing left the server.
- Payments: the mock bKash page — the run's own grant: its browser only, on the preview host, closed at the end; cash on delivery — on (the owner's setting). No real payment key, price, discount or COD amount is touched.
- Speed budget (lighthouserc.json ci.assert.assertions): a page's largest paint ≤ 2.5 s, a press's server answer ≤ 0.6 s; counted on 4G and wifi, shown on 3G.

## Scenarios

| # | Scenario | Device | Network | Addresses | Result | Orders | Timings (load · product · add · checkout · submit) | Why |
|---|---|---|---|---|---|---|---|---|
| 1 | Order 01 · FT · Mirpur 10 · Polo Duo (2× M) · cash on delivery · Steadfast | Mid Android (393×873) | 4G | dhk-mirpur | ✅ PASS | 1169 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s |  |
| 2 | Order 02 · FT · Dhanmondi · textured-knit-polo L · bKash · Pathao | Mid Android (393×873) | 4G | — | ⏭️ SKIP | — | — | skip payment method: bKash is switched off on the shop (Payments › mobile wallets) |
| 3 | Order 03 · FT · Uttara · essential-pique-polo M and L · cash on delivery · Steadfast | iPhone 13/14 (390×844) | 4G | dhk-uttara | ✅ PASS | 1170 | 0.7 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s |  |
| 4 | Order 04 · RP · Mohammadpur · everyday-crew-tee ×3 (S, M, L) · cash on delivery · Pathao | Desktop 1366×768 | Wifi | dhk-mohammadpur-bn | ✅ PASS | 1171 | 0.4 s · 0.7 s · 0.1 s · 0.3 s · 0.8 s |  |
| 5 | Order 05 · OD · Agrabad, Chattogram · Oxford shirt + slim chino · cash on delivery · RedX | Low-end Android (360×640, 4× slower CPU) | Fast 3G | — | ⏭️ SKIP | — | — | skip courier: the shop has no RedX courier (no connection for it in this build) |
| 6 | Order 06 · OD + 3G · village near Kurigram bazar · classic-cotton-panjabi XL · cash on delivery · Steadfast | Low-end Android (360×640, 4× slower CPU) | Slow 3G | out-bhola-no-thana | ✅ PASS | 1172 | 11 s · 12 s · 2.1 s · 13 s · 14 s |  |
| 7 | Order 07 · FR · Gulshan 2 · heavyweight-hoodie ×2 · cash on delivery | Mid Android (393×873) | 4G | dhk-gulshan | ✅ PASS | 1173 | 0.8 s · 0.8 s · 0.2 s · 1.2 s · 1.3 s |  |
| 8 | Order 08 · FR (prank) · Badda · polo-chino combo · cash on delivery | Mid Android (393×873) | 4G | dhk-badda | ✅ PASS | 1174 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s |  |
| 9 | Order 09 · GF · pays in Dhanmondi, ships to Zindabazar, Sylhet · classic-cotton-panjabi L (gift) · bKash · Pathao | iPhone 13/14 (390×844) | 4G | — | ⏭️ SKIP | — | — | skip payment method: bKash is switched off on the shop (Payments › mobile wallets) |
| 10 | Order 10 · BK · Tejgaon office · 40 logo polos, 4 sizes · bank transfer / advance | Desktop 1920×1080 | Wifi | — | ⏭️ SKIP | — | — | skip payment method: a bank transfer or an advance is not a checkout method: a person records it (the plan's bulk and bank-paid orders) |
| 11 | Order 11 · AN · Mirpur 2 · heavy-cotton-tee black XL · cash on delivery · Steadfast | iPhone 13/14 (390×844) | 4G | dhk-mirpur | ✅ PASS | 1175 | 0.7 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s |  |
| 12 | Order 12 · EL · Lalbagh, Old Dhaka · classic-cotton-panjabi XXL · cash on delivery · Pathao | iPhone SE (375×667) | 4G | dhk-lalbagh | ✅ PASS | 1176 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s |  |
| 13 | Order 13 · BN · Fatullah, Narayanganj · Polo Duo · cash on delivery · Steadfast | Mid Android (393×873) | Fast 3G | sub-siddhirganj-bn | ✅ PASS | 1177 | 3.2 s · 3.4 s · 0.6 s · 4.0 s · 4.7 s |  |
| 14 | Order 14 · AB · Savar · linen-blend-shirt + leather-look-belt · cash on delivery · RedX | Mid Android (393×873) | 4G | — | ⏭️ SKIP | — | — | skip courier: the shop has no RedX courier (no connection for it in this build) |
| 15 | Order 15 · FT · Tongi, Gazipur · jersey-zip-polo + cotton-socks-3 · cash on delivery · Pathao | Mid Android (393×873) | 4G | sub-tongi | ✅ PASS | 1178 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s |  |
| 16 | Order 16 · RP · Uttara · hoodie-jogger set · Nagad · Steadfast | iPhone 13/14 (390×844) | 4G | — | ⏭️ SKIP | — | — | skip payment method: Nagad is switched off on the shop (Payments › mobile wallets) |
| 17 | Order 17 · OD · Rajshahi city · 2 polos + slim-chino · cash on delivery · RedX | Low-end Android (360×640, 4× slower CPU) | Fast 3G | — | ⏭️ SKIP | — | — | skip courier: the shop has no RedX courier (no connection for it in this build) |
| 18 | Order 18 · FT · Mohammadpur · contrast-collar-polo M · cash on delivery | Mid Android (393×873) | 4G | dhk-shyamoli | ✅ PASS | 1179 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.4 s |  |
| 19 | Order 19 · OD · Masterpara, Gabtali, Bogura · relaxed-twill-trousers 34 · cash on delivery · Pathao | Low-end Android (360×640, 4× slower CPU) | Fast 3G | out-bogura-bn | ✅ PASS | 1180 | 3.3 s · 3.4 s · 0.6 s · 3.8 s · 4.3 s |  |
| 20 | Order 20 · FT · Dhanmondi · striped-rib-polo L · cash on delivery | iPhone 13/14 (390×844) | 4G | dhk-dhanmondi | ✅ PASS | 1181 | 0.7 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s |  |
| 21 | Order 21 · RP · Gulshan 1 · 6 items: 2 polos, 2 tees, slim-chino, belt · card · Steadfast | Desktop 1366×768 | Wifi | — | ⏭️ SKIP | — | — | skip payment method: card payment is switched off on the shop (Payments › cards) |
| 22 | Order 22 · FT · Khulna · long-sleeve-polo XL · cash on delivery · RedX | Mid Android (393×873) | 4G | — | ⏭️ SKIP | — | — | skip courier: the shop has no RedX courier (no connection for it in this build) |
| 23 | Order 23 · OD · Cox's Bazar · Polo Duo · cash on delivery · Steadfast | Low-end Android (360×640, 4× slower CPU) | Fast 3G | out-coxs-bazar | ✅ PASS | 1182 | 3.3 s · 3.4 s · 0.6 s · 3.8 s · 4.3 s |  |
| 24 | Order 24 · FT · Mirpur 11 · heavyweight-hoodie L · cash on delivery · Pathao | Mid Android (393×873) | 4G | dhk-mirpur | ✅ PASS | 1183 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s |  |
| 25 | Order 25 · OD · Sylhet · oxford-cotton-shirt + slim-chino · cash on delivery · RedX | Low-end Android (360×640, 4× slower CPU) | Fast 3G | — | ⏭️ SKIP | — | — | skip courier: the shop has no RedX courier (no connection for it in this build) |
| 26 | Order 26 · RP · Badda · polo-chino combo · bKash · Steadfast | iPhone 13/14 (390×844) | 4G | — | ⏭️ SKIP | — | — | skip payment method: bKash is switched off on the shop (Payments › mobile wallets) |
| 27 | Order 27 · FT · Mymensingh · 2 everyday-crew-tee · cash on delivery · Pathao | Mid Android (393×873) | Fast 3G | out-mymensingh | ✅ PASS | 1184 | 3.2 s · 3.4 s · 0.6 s · 3.6 s · 4.3 s |  |
| 28 | Order 28 · AN · Chattogram · jersey-zip-polo · cash on delivery · RedX | iPhone 13/14 (390×844) | 4G | — | ⏭️ SKIP | — | — | skip courier: the shop has no RedX courier (no connection for it in this build) |
| 29 | Order 29 · FT · Uttara · pocket-tee M · cash on delivery · Steadfast | iPhone 13/14 (390×844) | 4G | dhk-uttara | ✅ PASS | 1185 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s |  |
| 30 | Order 30 · GF · pays in Gulshan, ships to Rangpur · hoodie set · bKash · Pathao | iPhone 13/14 (390×844) | 4G | — | ⏭️ SKIP | — | — | skip payment method: bKash is switched off on the shop (Payments › mobile wallets) |
| 31 | Order 31 · BN + EL · Cumilla · classic-cotton-panjabi + slim-chino · cash on delivery · RedX | Mid Android (393×873) | Fast 3G | — | ⏭️ SKIP | — | — | skip courier: the shop has no RedX courier (no connection for it in this build) |
| 32 | Order 32 · FT · Dhanmondi · textured-knit-polo M · cash on delivery · Steadfast | Mid Android (393×873) | 4G | dhk-dhanmondi | ✅ PASS | 1186 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.4 s |  |
| 33 | Order 33 · RP · Mohammadpur · slim-chino 32 · cash on delivery · Pathao | Desktop 1366×768 | Wifi | dhk-mohammadpur-bn | ✅ PASS | 1187 | 0.3 s · 0.3 s · 0.1 s · 0.3 s · 0.7 s |  |
| 34 | Order 34 · 3G · Barishal · Polo Duo · cash on delivery · Steadfast | Low-end Android (360×640, 4× slower CPU) | Slow 3G | out-barishal | ✅ PASS | 1188 | 11 s · 12 s · 2.1 s · 13 s · 14 s |  |
| 35 | Order 35 · FR · Mirpur 1 · heavyweight-hoodie ×3 · cash on delivery | Mid Android (393×873) | 4G | dhk-mirpur | ✅ PASS | 1189 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s |  |
| 36 | Order 36 · FT · Mohakhali · classic-cotton-panjabi ×2 · cash on delivery · Pathao | Mid Android (393×873) | 4G | dhk-mohakhali | ✅ PASS | 1190 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s |  |
| 37 | Order 37 · OD · Dinajpur · classic-cotton-panjabi M · cash on delivery · RedX | Low-end Android (360×640, 4× slower CPU) | Fast 3G | — | ⏭️ SKIP | — | — | skip courier: the shop has no RedX courier (no connection for it in this build) |
| 38 | Order 38 · GF · pays in Dhaka, ships to Khulna · classic-cotton-panjabi XL (gift) · bKash · Steadfast | iPhone 13/14 (390×844) | 4G | — | ⏭️ SKIP | — | — | skip payment method: bKash is switched off on the shop (Payments › mobile wallets) |
| 39 | Order 39 · RP · Gazipur · panjabi ×2 (sizes for sons) + polo · cash on delivery · Pathao | Desktop 1366×768 | Wifi | sub-tongi | ✅ PASS | 1191 | 0.3 s · 0.3 s · 0.1 s · 0.3 s · 0.7 s |  |
| 40 | Order 40 · BK · Narayanganj factory · 25 panjabis for staff Eid gift · bank transfer / advance | Desktop 1920×1080 | Wifi | — | ⏭️ SKIP | — | — | skip payment method: a bank transfer or an advance is not a checkout method: a person records it (the plan's bulk and bank-paid orders) |
| 41 | Order 41 · FT · Sylhet · classic-cotton-panjabi L · cash on delivery · RedX | Mid Android (393×873) | Fast 3G | — | ⏭️ SKIP | — | — | skip courier: the shop has no RedX courier (no connection for it in this build) |
| 42 | Order 42 · FR · Shyamoli · 4 panjabis · cash on delivery · Steadfast | Mid Android (393×873) | 4G | dhk-shyamoli | ✅ PASS | 1192 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s |  |
| 43 | Order 43 · AB · Chattogram · classic-cotton-panjabi M · bKash, then cash on delivery · RedX | Mid Android (393×873) | 4G | — | ⏭️ SKIP | — | — | skip courier: the shop has no RedX courier (no connection for it in this build) |
| 44 | Order 44 · BN · Rajshahi · panjabi + belt, coupon EID · cash on delivery · Pathao | Mid Android (393×873) | Fast 3G | out-rajshahi | ✅ PASS | 1193 | 3.2 s · 3.4 s · 0.7 s · 4.0 s · 4.7 s | skip the owner's coupon: the owner has no open coupon without a use limit (his codes are his; the run makes none) |
| 45 | Order 45 · OD + 3G · Rangpur → village for Eid · classic-cotton-panjabi L · cash on delivery · Steadfast | Low-end Android (360×640, 4× slower CPU) | Slow 3G | out-rangpur | ✅ PASS | 1194 | 11 s · 12 s · 2.1 s · 13 s · 14 s |  |
| 46 | Order 46 · RP · Uttara · everyday-crew-tee ×3 · cash on delivery · Pathao | iPhone 13/14 (390×844) | 4G | dhk-uttara | ✅ PASS | 1195 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s |  |
| 47 | Order 47 · AN · Dhanmondi · linen-blend-shirt white M · card · Steadfast | iPhone 13/14 (390×844) | 4G | — | ⏭️ SKIP | — | — | skip payment method: card payment is switched off on the shop (Payments › cards) |
| 48 | Order 48 · OD · Khulna · hoodie-jogger set · cash on delivery · RedX | Low-end Android (360×640, 4× slower CPU) | Fast 3G | — | ⏭️ SKIP | — | — | skip courier: the shop has no RedX courier (no connection for it in this build) |
| 49 | Order 49 · FT · Savar · slim-chino 30 + belt · cash on delivery · Pathao | Mid Android (393×873) | 4G | sub-savar | ✅ PASS | 1196 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s |  |
| 50 | Order 50 · RP (VIP) · Gulshan 2 · Office Trio · cash on delivery · Steadfast | Desktop 1920×1080 | Wifi | dhk-gulshan | ✅ PASS | 1197 | 0.3 s · 0.3 s · 0.1 s · 0.3 s · 0.8 s |  |
| 51 | Order 51 · Prepaid · bKash · Dhaka city · Textured knit polo M · bKash · the shop's choice | Mid Android (393×873) | 4G | — | ⏭️ SKIP | — | — | skip payment method: bKash is switched off on the shop (Payments › mobile wallets) |
| 52 | Order 52 · Prepaid · card · Dhaka city · Oxford shirt L + chino 32 · card · the shop's choice | Desktop 1366×768 | Wifi | — | ⏭️ SKIP | — | — | skip payment method: card payment is switched off on the shop (Payments › cards) |
| 53 | Order 53 · Prepaid · internet banking · Dhaka city · Heavyweight hoodie L · bank transfer / advance · the shop's choice | Desktop 1366×768 | Wifi | — | ⏭️ SKIP | — | — | skip payment method: a bank transfer or an advance is not a checkout method: a person records it (the plan's bulk and bank-paid orders) |
| 54 | Order 54 · Prepaid · Nagad · Outside Dhaka · Contrast polo M · Nagad · the shop's choice | Mid Android (393×873) | 4G | — | ⏭️ SKIP | — | — | skip payment method: Nagad is switched off on the shop (Payments › mobile wallets) |
| 55 | Order 55 · Risk · hard, pays full advance · Outside Dhaka · Panjabi ×3 · cash on delivery · the shop's choice | Mid Android (393×873) | 4G | out-tangail | ✅ PASS | 1198 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s |  |
| 56 | Order 56 · Risk · hard, refuses advance · Dhaka city · Hoodie ×2 · cash on delivery · the shop's choice | Mid Android (393×873) | 4G | dhk-jatrabari | ✅ PASS | 1199 | 0.8 s · 0.8 s · 0.2 s · 1.2 s · 1.3 s |  |
| 57 | Order 57 · Risk · soft, pays delivery charge · Dhaka city · Pocket tee L + crew tee L · cash on delivery · the shop's choice | iPhone 13/14 (390×844) | 4G | dhk-bashundhara | ✅ PASS | 1200 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s |  |
| 58 | Order 58 · Risk · false positive · Outside Dhaka · Long-sleeve polo L · cash on delivery · the shop's choice | Mid Android (393×873) | 4G | out-jashore | ✅ PASS | 1201 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s |  |
| 59 | Order 59 · Older 50+ · বাংলা · 150% text · Outside Dhaka · Panjabi XL (bag kept 2 days) · cash on delivery · the shop's choice | Mid Android (393×873) | Fast 3G | out-kushtia | ✅ PASS | 1202 | 3.2 s · 3.4 s · 0.7 s · 4.0 s · 4.7 s |  |
| 60 | Order 60 · Son orders for his father · Outside Dhaka · Panjabi XL + twill 36 · cash on delivery · the shop's choice | Mid Android (393×873) | 4G | out-netrokona | ✅ PASS | 1203 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s |  |
| 61 | Order 61 · Daughter's gift to her mother · Outside Dhaka · Linen shirt L · bKash · the shop's choice | iPhone 13/14 (390×844) | 4G | — | ⏭️ SKIP | — | — | skip payment method: bKash is switched off on the shop (Payments › mobile wallets) |
| 62 | Order 62 · Older 40+ · voice note, wants a call · Outside Dhaka · Oxford shirt ×2 XL · cash on delivery · the shop's choice | Mid Android (393×873) | 4G | out-faridpur | ✅ PASS | 1204 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s |  |
| 63 | Order 63 · Rural · Kurigram union · borrowed phone · Outside Dhaka · Crew tee ×2 L · cash on delivery · the shop's choice | Low-end Android (360×640, 4× slower CPU) | Slow 3G | out-dinajpur-bn | ✅ PASS | 1205 | 11 s · 12 s · 2.2 s · 14 s · 16 s |  |
| 64 | Order 64 · Rural · Sunamganj haor · Outside Dhaka · Heavy tee XL · cash on delivery · the shop's choice | Low-end Android (360×640, 4× slower CPU) | Fast 3G | out-sreemangal | ✅ PASS | 1206 | 3.3 s · 3.5 s · 0.7 s · 4.2 s · 4.7 s |  |
| 65 | Order 65 · Expat in Dubai, card · Dhaka city · Panjabi ×2 · card · the shop's choice | Desktop 1366×768 | Wifi | — | ⏭️ SKIP | — | — | skip payment method: card payment is switched off on the shop (Payments › cards) |
| 66 | Order 66 · Corporate, after a quote · Dhaka city · 30 logo polos at the quoted price · bank transfer / advance | Desktop 1920×1080 | Wifi | — | ⏭️ SKIP | — | — | skip payment method: a bank transfer or an advance is not a checkout method: a person records it (the plan's bulk and bank-paid orders) |
| 67 | Order 67 · Repeat buyer expects the refund · Dhaka city · Heavyweight hoodie L · cash on delivery · the shop's choice | iPhone 13/14 (390×844) | 4G | dhk-khilgaon-pasted | ✅ PASS | 1207 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s |  |
| 68 | Order 68 · Coupon audience mismatch · Dhaka sub-area · Zip polo L + WELCOME100 · cash on delivery · the shop's choice | Mid Android (393×873) | 4G | sub-ashulia | ✅ PASS | 1208 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s | skip the owner's coupon: the owner has no open coupon without a use limit (his codes are his; the run makes none) |
| 69 | Order 69 · Flexible set, keep one piece · Outside Dhaka · Hoodie-jogger set XL · cash on delivery · the shop's choice | Low-end Android (360×640, 4× slower CPU) | Fast 3G | out-patuakhali-mixed | ✅ PASS | 1209 | 3.3 s · 3.4 s · 0.6 s · 3.8 s · 4.3 s |  |
| 70 | Order 70 · Late 6 days + rider asks ৳30 more · Outside Dhaka · Twill 32, Bandarban · cash on delivery · the shop's choice | Mid Android (393×873) | 4G | out-coxs-bazar | ✅ PASS | 1210 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s |  |

## Timings: phone vs desktop per network (median per step)

| Network | Screen | Orders | First load | Product page | Add to bag | Checkout open | Submit → thank-you |
|---|---|---|---|---|---|---|---|
| Slow 3G | phone | 4 | 11 s | 12 s | 2.1 s | 13 s | 14 s |
| Fast 3G | phone | 8 | 3.2 s | 3.4 s | 0.6 s | 3.8 s | 4.3 s |
| 4G | phone | 26 | 0.8 s | 0.8 s | 0.2 s | 1.1 s | 1.3 s |
| Wifi | desktop | 4 | 0.3 s | 0.3 s | 0.1 s | 0.3 s | 0.7 s |

## Addresses: typed → stored → admin → courier → sticker

Every order used its own address. A row fails when a word, a digit or the phone number arrives changed at any stage (spacing and line breaks are forgiven). `Place` is how the shop read the area: OK, WIDER (only the district), OTHER (another area of the same district), UNREAD (not read; the order still went through, PR 563), WRONG (another district: a fail).

| Order | Address (test data) | Quirk | Phone typed as | Stored | Admin | Courier | Sticker | Place | Band · charge | Result | Differences |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1169 | dhk-mirpur |  | bengali | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1170 | dhk-uttara |  | plus880 | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1171 | dhk-mohammadpur-bn | bengali | 880 | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1172 | out-bhola-no-thana | missingThana | spaced | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1173 | dhk-gulshan |  | local | ✓ | ✓ | skip | skip | OK | dhaka-city · 0 | ✅ PASS |  |
| 1174 | dhk-badda |  | bengali | ✓ | ✓ | skip | skip | OK | dhaka-city · 0 | ✅ PASS |  |
| 1175 | dhk-mirpur |  | plus880 | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1176 | dhk-lalbagh |  | bengali | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1177 | sub-siddhirganj-bn | bengali | bengali | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1178 | sub-tongi |  | local | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1179 | dhk-shyamoli |  | bengali | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1180 | out-bogura-bn | bengali | plus880 | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1181 | dhk-dhanmondi |  | 880 | ✓ | ✓ | skip | skip | OK | dhaka-city · 0 | ✅ PASS |  |
| 1182 | out-coxs-bazar |  | spaced | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1183 | dhk-mirpur |  | local | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1184 | out-mymensingh |  | bengali | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1185 | dhk-uttara |  | plus880 | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1186 | dhk-dhanmondi |  | 880 | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1187 | dhk-mohammadpur-bn | bengali | spaced | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1188 | out-barishal |  | local | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1189 | dhk-mirpur |  | bengali | ✓ | ✓ | skip | skip | OK | dhaka-city · 0 | ✅ PASS |  |
| 1190 | dhk-mohakhali |  | plus880 | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1191 | sub-tongi |  | 880 | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1192 | dhk-shyamoli |  | spaced | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1193 | out-rajshahi |  | bengali | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1194 | out-rangpur |  | bengali | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1195 | dhk-uttara |  | plus880 | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1196 | sub-savar |  | 880 | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1197 | dhk-gulshan |  | spaced | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1198 | out-tangail |  | local | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1199 | dhk-jatrabari |  | bengali | ✓ | ✓ | skip | skip | OK | dhaka-city · 0 | ✅ PASS |  |
| 1200 | dhk-bashundhara |  | plus880 | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1201 | out-jashore |  | 880 | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1202 | out-kushtia |  | bengali | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1203 | out-netrokona |  | local | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1204 | out-faridpur |  | bengali | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1205 | out-dinajpur-bn | bengali | bengali | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1206 | out-sreemangal |  | bengali | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1207 | dhk-khilgaon-pasted | pasted | spaced | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1208 | sub-ashulia |  | local | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1209 | out-patuakhali-mixed | mixed | bengali | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1210 | out-coxs-bazar |  | plus880 | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |

Coverage: 8 divisions (barishal, chattogram, dhaka, khulna, mymensingh, rajshahi, rangpur, sylhet); 15 districts outside Dhaka.

## Clean-up (nothing deleted)

- Test orders cancelled through the normal cancel path: 37 now, 173 were already closed.
- Test products archived: 3; their colours, sizes and stock shelf: 10. The test courier account the run added is archived.
- Sales (delivered only): no test order counts as a sale (0 test orders counted as sales, 0 test pieces in sales by SKU (delivered only)).
- Marked as tests: 195 of 210 test orders carry an internal "GATE TEST" note (the order flags take only the owner's own list)
- Refund requests the cancels recorded for the mock-paid test orders: 10 (requests only, no money moved; the mock never took any). The owner may close them on Money › Refunds.
- the shop's web processes told to drop the pages of 3 test product(s) and every category list (cache bus)

