# S03 · Selling in cash-on-delivery markets — checkout, risk and conversion

*Sawdagor সওদাগর · A360-04 · module 3 of 6 · level: Post-graduate · version 1.0 · as of October 2026*

---

## 1. Facts (with honest sourcing)
- Bangladesh: e-CAB research cited by the US ITA guide (updated Mar 2026): **> 90% of e-commerce users prefer COD**.
- India (comparable market): Shopflo report via YourStory (Dec 2024): COD **45.6%** of e-commerce orders in 2023–24 (from 46.5%), UPI ~40%; some "COD" is paid by UPI QR at the door.
- Refusal / RTO rates: no reliable public BD figure; vendor blogs quote unsourced ranges — **use our own data** by channel, district and courier.
- Social-ad orders are often said to refuse more than search orders — plausible (impulse), **unproven** [COMMUNITY — test with our data].

## 2. Design principles for COD checkout [HOUSE, built on blueprint decisions]
1. **COD is the default and the hero**, not hidden: "ক্যাশ অন ডেলিভারি — পণ্য হাতে পেয়ে টাকা দিন".
2. Show the **door rule** at the point of commitment (blueprint: "Returning at the door? Pay only the delivery charge to the rider.") — honest rules reduce surprise refusals.
3. **Prepay nudges without punishment:** bKash/Nagad option visible; any prepay incentive is a price change → owner approval.
4. **Risk-based friction, not blanket friction:** the fraud engine (Gyani) scores orders; high-risk → **advance delivery charge by bKash** (blueprint's decisive action), never automatic blocking.
5. **Confirmation** (call/WhatsApp) for every order before dispatch; 2-size check flow (blueprint) prevents a classic refusal cause.
6. **Accurate expectations:** true-colour photos, size help, delivery time per band → fewer "not what I expected" refusals.
7. **Address quality:** the resolver infers band from district/postcode silently (owner rule); phone validation.
8. **Partial COD / deposits** (seen in India) — would be a COD rule change → owner decision only.

## 3. Metrics that matter in COD
| Metric | Why |
|---|---|
| Confirmed rate (confirmed ÷ placed) | early signal of junk orders |
| Delivery success (delivered ÷ dispatched) | money metric |
| Refusal reasons (from courier + call notes) | fix the cause (price shock, size, delay, fake) |
| Delivered conversion rate (delivered ÷ sessions) | the true CR for EXTAS |
| Days to deliver by band | impulse fades with time |

## 4. What the shop never does
- Hide the delivery charge until the last step.
- Auto-block customers (approval list: blocking).
- Change COD rules, deposits or prepay discounts without the owner.

---

**Sources** (type in brackets):
- [Government] US ITA, Bangladesh eCommerce guide (Mar 2026): https://trade.gov/country-commercial-guides/bangladesh-ecommerce
- [News, citing Shopflo report] YourStory, COD reigns supreme for D2C brands (Dec 2024): https://yourstory.com/2024/12/d2c-brands-cash-delivery-delivery
- [Vendor blog — unsourced stats, warning only] EasySell, social-ad COD RTO: https://easysellapp.com/blogs/wiki/cod-social-ad-orders-high-rto-rate-fix
- [Internal] EXTAS blueprint (advance delivery charge, door note, 2-size flow, resolver), AGENT-PROTOCOL.md approval list

*As of October 2026.*
