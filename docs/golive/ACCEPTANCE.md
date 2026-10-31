# Staging acceptance list (PR 393)

S19 · PR 393 (CN-031). Walk every line on **new.extas.com.bd** (staging) as a customer and as admin, on a phone and on a
desktop, before real orders. When every line passes, confirm "Staging acceptance list walked through" on
**Settings → System → Go-live** (`/admin/settings/system/go-live`). A line that fails becomes a fix PR first (CN-016).

Source: `docs/BACKEND-ARCHITECTURE.md` §13 "Must exist before the first real order", `docs/START-HERE.md` "Go-live gate",
Blueprint A2.9.16 and Appendix C. The automatic items (smoke test, health, backups) are checked by the go-live page
itself and are not repeated here.

> **বাংলা সারকথা:** আসল অর্ডারের আগে staging-এ (new.extas.com.bd) নিচের প্রতিটা লাইন কাস্টমার আর অ্যাডমিন হিসেবে, ফোনে আর
> কম্পিউটারে দেখে নিতে হবে। সব ঠিক হলে "চালুর আগে" পাতায় "staging-এর গ্রহণ তালিকা দেখা হয়েছে" নিশ্চিত করুন।

## Customer journey
- [ ] Home, a category, a product, the bag and checkout open on a phone (390 px) and a desktop (1366 px) without an error.
- [ ] A guest places a cash-on-delivery order; the thank-you page shows the order number; the order is in the admin.
- [ ] Placing the same order twice (double tap, refresh on submit) makes one order (checkout idempotency).
- [ ] A price or stock change between bag and order is caught and shown before the order is placed (re-check).
- [ ] An advance payment (bKash, practice gateway until its key) is recorded against the order.
- [ ] The customer receives the order message (SMS/WhatsApp on their mock until their keys) within the caps.

## Orders, money and delivery (admin)
- [ ] The order moves through its states only by the allowed steps; two admins cannot change it at once (locks).
- [ ] A courier booking respects the eligibility filter; an exception state shows with its reason.
- [ ] A return records the five distinct facts; restock happens only after the ERP confirms; shop loss is recorded.
- [ ] Cancel-and-replace after booking keeps both orders linked.
- [ ] COD reconciliation: a courier payout is matched with reason codes and "received as".
- [ ] An expense can be entered; the Dashboard, Money and Reports numbers come from the metrics registry and agree.
- [ ] Refunds and advances are records only; nothing moves money without the owner's written OK (hard rule 6).

## Platform
- [ ] The background worker is alive and webhooks arrive (Server page).
- [ ] The audit log is append-only (an attempt to change a row is refused).
- [ ] The ERP price/cost mirror shows stale or missing values by its rules.
- [ ] Every admin page marked **Gate** in `docs/BACKEND-ARCHITECTURE.md` §5 opens and has its guide.
- [ ] Readiness: `/api/health` answers, and an alert reaches Telegram (Settings → System → Backups shows Telegram connected).

## QA gate (Blueprint Appendix C) — confirmed as its own item
- Device gate at 0 failures on phones, tablets and desktop; the journeys; the Lighthouse budget; the screenshots looked at.
- A real iPhone (Safari) and a real Android (Chrome) — also its own item.
- The 70-order real-life journey simulation (`docs/qa/SIMULATION-PLAN.md`, CN-013) — also its own item.
