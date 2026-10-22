# অ্যাডমিন সেকশন গাইড (বাংলা) — CN-014

এখানে অ্যাডমিনের প্রতিটা সেকশনের জন্য একটা করে ফাইল থাকবে। প্রতিটা ফাইলে থাকবে:
- সেকশনটা কিসের জন্য;
- এর ভেতরে কয়টা মেনু আর ট্যাব আছে;
- কী কী কাজ করা যায়;
- প্রতিটা সুইচ আর সংখ্যা, আর তার ডিফল্ট মান;
- কাজ করার পর কী হয়।

যে PR অ্যাডমিনের কোনো স্ক্রিন যোগ করে বা বদলায়, সে একই PR-এ সেই সেকশনের গাইডও আপডেট করে।

| সেকশন | ফাইল | অবস্থা |
|---|---|---|
| কম্বো ও কাস্টমারের সেট (`/admin/combos`) | [combos.md](combos.md) | তৈরি (S03 · PR 89, 90, 571, 99, 575, 104) |
| অ্যাডমিনে ঢোকা আর অ্যাডমিনের কাঠামো (`/admin/login`, `/admin`) | [login.md](login.md) | তৈরি (S00) |
| চাবি ও সংযোগ (`/admin/integrations`) | [integrations.md](integrations.md) | তৈরি (S00, S09) |
| প্রোডাক্ট: তালিকা, নতুন, বদলানো, চালুর অপেক্ষায়, লিংক থেকে আনা, অডিট, স্টকে ফিরলে (`/admin/products/*`) | [products.md](products.md) | তৈরি (S01) |
| সাইজ চার্ট (`/admin/size-charts`) | [size-charts.md](size-charts.md) | তৈরি (S01) |
| স্টক ও ERP, স্টক গোনা, স্টক চলাচল (`/admin/stock/*`) | [stock.md](stock.md) | তৈরি (S09) |
| স্মার্ট নিয়ম, নোটিশ ও পপ-আপ (`/admin/rules/*`) | [rules.md](rules.md) | তৈরি (S10) |
| ডেলিভারি এলাকা আর চার্জ (`/admin/delivery`) | [delivery.md](delivery.md) | তৈরি (S06) |
| ডেমো V12.2 অনুযায়ী বাকি সেকশন (এখনো বানানো হয়নি, পরিকল্পনা) | [ads](ads.md), [agents](agents.md), [ai](ai.md), [analytics](analytics.md), [audit](audit.md), [backup](backup.md), [blog](blog.md), [bulk](bulk.md), [cache](cache.md), [comms](comms.md), [coupons](coupons.md), [couriers](couriers.md), [customers](customers.md), [exchanges](exchanges.md), [expenses](expenses.md), [finance](finance.md), [fulfilment](fulfilment.md), [health](health.md), [hero](hero.md), [images](images.md), [keys](keys.md), [landing](landing.md), [layout](layout.md), [manual](manual.md), [naming](naming.md), [orders](orders.md), [register](register.md), [review](review.md), [reviews](reviews.md), [server](server.md), [settings](settings.md), [sidecanvas](sidecanvas.md), [site](site.md), [sizecharts](sizecharts.md), [speed](speed.md), [support](support.md), [team](team.md) | পরিকল্পনা |
| (প্রতিটা অ্যাডমিন সেকশন তৈরি হলে এখানে যোগ হবে) | | |

অ্যাডমিনের প্রতিটা সেকশন থেকে তার গাইডে যাওয়ার লিংক ("এই সেকশনে কী করা যায়") পরে আসবে, যখন সার্ভারে গাইড দেখানোর পাতা
তৈরি হবে। গাইডগুলো এখনই প্রতিটা ডিপ্লয়ের সাথে সার্ভারে কপি হয়।
