# ফোন আর ট্যাব পরীক্ষা — V12b (20 Oct 2026, অর্ধেক শেষ, মালিকের Note 54 আসায় থামানো)

## সংক্ষেপে
- ফোনের ৯টা সাইজ আর ট্যাবের ১০টা সাইজে (৫টা ট্যাব, খাড়া আর আড়াআড়ি) প্রায় ৭৭টা পেজ পরীক্ষা হয়েছে। ঠিক করার পরে **কোনো সমস্যা বাকি নেই**।
- **৬টা সমস্যা ঠিক করা হয়েছে:**
  1. হোমের সেট সারি: “Build your own set” কার্ডে এখন ৮টা অফার আছে, তাই সারির প্রতিটা সেট কার্ড প্রায় 300 px লম্বা হয়ে নিচে ফাঁকা সাদা জায়গা থাকত। এখন যতগুলো অফার আঁটে ততগুলো দেখায় (কমপক্ষে ২টা), বাকিগুলো “+ 6 more set offers” লেখায় গোনা থাকে।
  2. দাম দুই লাইনে ভেঙে যেত (“৳” এক লাইনে, সংখ্যা পরের লাইনে)। এটা 360 px ফোনে চেকআউট, ল্যান্ডিং পেজ, সেট পেজ, কম্বো পেজ, প্রোডাক্ট পেজ আর হোমে হচ্ছিল (V12-তেও ছিল)। এখন দাম সবসময় এক লাইনে থাকে।
  3. ব্যাগের সামারিতে লম্বা নাম আগে ছোট অক্ষরে বা ছোট নামে দেখাত। এখন পুরো নাম দুই লাইনে আসে, দাম থাকে প্রথম লাইনে।
  4. #/combos পেজে (320 px) “Shirt + Trousers + Polo…” কেটে যেত। এখন জায়গা না থাকলে “3 pcs” দেখায়।
  5. কম্বোর নিচের বারে রঙের নাম “Sky Blue + Khaki + Charc…” কেটে যেত (430 px)। এখন জায়গা না থাকলে নামগুলো লুকায়, রঙের গোল চিহ্নগুলো থেকে যায়।
  6. ডেস্কটপ: হিরোর প্রথম প্রোডাক্ট চিপটা সবুজ থেকে ছবিতে মেশার জায়গায় ঝাপসা দেখাত। এখন চিপের পেছনে পুরো সাদা রং, তাই পরিষ্কার পড়া যায় (1366 আর 1920-এ দেখা হয়েছে)।

## Tests (all on proto/dist/v12m.html)
| Test | Result |
|---|---|
| device-matrix phones (15 sizes × 16 rows) | 0/240 fails |
| device-matrix tablets (10 sizes × 24 rows) | 0/240 fails |
| Sweep (real fonts; h-scroll, price split, cut text, overlap, sticky cover, not-found, JS errors): 9 phones + 10 tablet sizes × 41 main + 35 extra routes (incl. Bengali, 6-item bag/checkout) | 0 issues after fixes |
| Small tap targets vs V12 at 393 | 423 = 423 (all are from the approved design; no new ones) |
| Timing suites: sliders 321, overlays 43, misc 45, drag 21, extra 3, hover 98 | 531 checks, 0 fail, 9 info |
| K10 310/0 · K11+totals 65/0 · K9 849/0 · qa.js 369/0 · zoom 59/0 | pass |
| Pixel diff vs V12 at 393 and 360, 41 routes | only allowed changes are left (K11 wording, easy English, extra products and sets, “(test)” removed, demo label moved, demo gear hidden) + owner features (order Returns & help, 96g; product video thumb, C6). Regression R1 was fixed. |

## Not finished (for the next agent)
- touch.js has only run at 393: 21 pass, 3 fails that need checking. Two are tool selector problems: A2 picked the arrow instead of the photo, and A3 may be looking for the drawer when the phone uses `bag-modal`. The third, B1, is not a bug: Bengali digits are changed on purpose as they are typed (R15 bug 8), so the test's expectation is wrong.
- Not run yet: touch.js on the other phones and tablets, the admin pages on tablets, the 430 diff and a re-diff after the fixes.
- The Bengali before/after picture sheets are not made (raw pictures are in owner-fix/PHONE/shots).

## Taste (no change made)
- On the desktop hero chip there is a wide gap between the price and the struck-out price.
- The phone Build-your-own tile now shows 2 offers plus a count. V12 showed 3 offers.
