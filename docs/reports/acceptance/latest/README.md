# The acceptance run on the preview site

**সারকথা:** 4টা অংশের সবগুলো পাস।

- এই রান নতুন কিছু পরীক্ষা বানায় না: আগের চারটা পরীক্ষা (সব পাতা, journeys, টেস্ট অর্ডার, কাস্টমারের পুরো যাত্রা) একসাথে, লাইভ ভার্সনে চালায়। প্রতিটার নিজের রিপোর্ট নিচের লিংকে।
- টেস্ট অর্ডার সব বাতিল আর টেস্ট পণ্য আর্কাইভ করা হয়; কিছু মোছা হয় না, কোনো টাকা নড়ে না, আসল কাস্টমারকে কোনো মেসেজ যায় না।
- ফলাফলটা Go-live পাতায় "acceptance" লাইনের পাশে দেখা যাবে। docs/golive/ACCEPTANCE.md-এর যে লাইনগুলো মানুষকে দেখতে হয়, সেগুলো দেখে নিশ্চিত করা (Confirm) একজন মানুষের কাজ — এই রান নিজে কিছু নিশ্চিত করে না।

- Run: 2026-11-06 21:59 (Asia/Dhaka) · version `4689df67c695` · host: the preview host of the server's settings
- Result: **PASS** — 4 of 4 parts passed.

| # | Part | Result | What it found | Its own report |
|---|---|---|---|---|
| 1 | Smoke test: every built page, signed out and as the admin, phone and desktop | ✅ PASS | 480 page views, 0 failed | [docs/reports/smoke/latest/](../../../../docs/reports/smoke/latest/README.md) |
| 2 | Go-live gate journeys (journeys group go-live-gate: orders and changes nothing) | ✅ PASS | 4 journeys, 60 steps: 0 failed, 4 skipped | [docs/reports/journeys/go-live-gate/latest/](../../../../docs/reports/journeys/go-live-gate/latest/README.md) |
| 3 | Go-live test orders: 18 scenarios on the mocks, every order cancelled after | ✅ PASS | 18 scenarios: 14 passed, 0 failed, 4 skipped; 24 test orders, clean-up done | [docs/reports/gate-orders/latest/](../../../../docs/reports/gate-orders/latest/README.md) |
| 4 | Customer 360°: one test customer's whole life cycle | ✅ PASS | 150 steps: 122 pass, 0 fail, 28 skip | [docs/reports/gate-c360/latest/](../../../../docs/reports/gate-c360/latest/README.md) |

Each part keeps its own rules: the smoke test signs in with the server-only check account; the journeys order and change nothing; the test orders and the customer 360° run only on the preview host and only on the mocks, cancel every test order and archive the test products, and put the owner's cash-on-delivery setting back as it was. A part that a switched-off method or courier cannot play is a SKIP inside that part, never a failure.

How to run: GitHub › Actions › **acceptance** › Run workflow (by hand only). The person's part of docs/golive/ACCEPTANCE.md (real phones, the admin's own walk) is confirmed on Settings → System → Go-live.
