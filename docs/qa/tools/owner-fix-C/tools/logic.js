const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const S = process.argv[2], O = process.argv[3];
const img = (f) => 'file://' + path.resolve(S, f);
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;700&display=swap"><style>
body{margin:0;padding:28px;background:#fff;font-family:'Hind Siliguri',sans-serif;width:1500px;color:#151513}
h1{font-size:32px;margin:0 0 6px} .sub{font-size:19px;color:#555;margin-bottom:22px}
.g{display:grid;grid-template-columns:1fr 1fr;gap:28px} .c{border:2px solid #1F6B4A;border-radius:14px;padding:18px 20px}
.c h2{margin:0 0 8px;font-size:25px;color:#1F6B4A} ul{margin:0 0 12px;padding-left:22px;font-size:19px;line-height:1.55} img{display:block;width:100%;border:1px solid #ccc;border-radius:8px}
.note{margin-top:22px;font-size:19px;line-height:1.6;background:#F3F7F4;border-radius:12px;padding:14px 18px}
</style></head><body><h1>"ব্যাগে যোগ হয়েছে" প্যানেল — দুইটা স্টাইল কীভাবে কাজ করে (B3)</h1>
<div class="sub">ডেস্কটপে "Add to Bag" চাপলে ডানে যে প্যানেল খোলে। ফোনে কিছু বদলায়নি।</div>
<div class="g"><div class="c"><h2>স্টাইল A — ডিফল্ট (এখন যেমন চলছে)</h2><ul>
<li>উপরে শুধু এইমাত্র যোগ হওয়া পণ্যটা দেখায়।</li><li>তার নিচে "Bag · 4 items" আর মোট টাকা — মোটা আর পরিষ্কার।</li>
<li>ফ্রি ডেলিভারি হলে ট্রাকের ছবিসহ সবুজ বক্স, ঠিক Checkout বাটনের উপরে।</li><li>নিচে "Complete the look" — যত পণ্য জায়গায় ধরে, 2টা করে সারিতে।</li>
<li>কাদের জন্য ভালো: যে একটা জিনিস কিনে আরও দেখতে চায়।</li></ul><img src="${img('a-drawerA-1366.png')}"></div>
<div class="c"><h2>স্টাইল B — নতুন (সেটিংসে চালু করবেন)</h2><ul>
<li>ব্যাগের সব পণ্য দেখায়, নতুনটা সবার উপরে, "এইমাত্র যোগ হলো" ট্যাগসহ।</li><li>4টার বেশি হলে "+3 more items · View bag" (সংখ্যাটা সেটিংসে বদলানো যায়)।</li>
<li>উপরে মোট পণ্যের সংখ্যা আর মোট টাকা; সেট বা অফারের ছাড় থাকলে আলাদা লাইনে।</li><li>জায়গা থাকলে নিচে পণ্য; জায়গা না থাকলে পণ্যের অংশ লুকায় — প্যানেল স্ক্রল হয় না।</li>
<li>কাদের জন্য ভালো: যে অনেক কিছু একসাথে কিনছে, পুরো ব্যাগ এক নজরে দেখতে চায়।</li></ul><img src="${img('a-drawerB-1366.png')}"></div></div>
<div class="note"><b>কোনটা ভালো চলছে বুঝবেন কীভাবে:</b> প্রতিটা ভিজিটে কোন স্টাইল দেখেছে তা লেখা থাকে। Admin › Analytics-এ "Added-to-bag drawer · A vs B" কার্ডে দেখাবে — কতজন দেখল, কতজন চেকআউটে গেল, কতজন অর্ডার করল। এক সপ্তাহ A, এক সপ্তাহ B চালিয়ে তুলনা করুন। বদলানোর জায়গা: Admin › Settings › "Bag drawer, bag offers and checkout look (desktop)"।<br>
দুই স্টাইলেই মোট টাকা ব্যাগ পেজ, চেকআউট আর ইনভয়েসের সাথে হুবহু মেলে। "আর ৳X যোগ করলে ফ্রি" — এই লাইন প্যানেলে কখনো আসে না (আপনার নিয়ম 35)।</div>
<div class="g" style="margin-top:22px"><div><h2 style="font-size:23px;margin:0 0 8px">সেটিংস (Admin › Settings)</h2><img src="${img('admin-ownc-bn.png')}"></div><div><h2 style="font-size:23px;margin:0 0 8px">রিপোর্ট (Admin › Analytics)</h2><img src="${img('admin-analytics-atb.png')}"><h2 style="font-size:23px;margin:18px 0 8px">বাংলায় দোকান চালু থাকলে — স্টাইল B</h2><img src="${img('a-drawerB-bn.png')}"></div></div>
</body></html>`;
(async () => { const f = O + '/11-drawer-logic.html'; fs.writeFileSync(f, html); const b = await chromium.launch(); const p = await b.newPage(); await p.goto('file://' + path.resolve(f)); await p.waitForTimeout(1200); await p.screenshot({ path: O + '/11-drawer-logic.png', fullPage: true }); await b.close(); })();
