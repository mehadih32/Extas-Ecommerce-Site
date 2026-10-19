# HANDOFF — from Agent C (bag · checkout · thank-you · account)

Round 13. Everything below is a change I could NOT make, because the file
belongs to another agent. I worked around each one inside my own files; the
work-arounds are marked so they can be deleted when the real fix lands.

---

## For Agent A — `02-core.js`

### 1. Free delivery is decided in three places and the engine only knows one
`deliveryCharge(zone, total)` prices from the cart total alone. It does not
know about:
- a product that carries `freeDelivery:true` (e.g. `essential-pique-polo`), or
- the owner's running campaign, `SET('delivery','freeCampaign')`.

So `placeOrder()` put an ৳80 delivery charge on an order whose product page,
bag and checkout had all promised free delivery. **That is the owner's #36,
the point he called the most important of the whole review.**

*My work-around:* `bag_freeDel(total)` in `src/50-bag.js` is the single rule
(campaign → free-delivery product → threshold). The bag, the checkout, the
thank-you page and My account all read it, and `SUBMIT['co-place']` zeroes
`o.delivery` after `placeOrder()` returns.

**Please make `deliveryCharge()` (or `placeOrder()`) read the same rule** —
`bag_freeDel()` is global and loads before any order is placed. Then my
correction in `51-checkout.js` (marked `/* 36. placeOrder() prices delivery
from the zone… */`) can be deleted.

### 2. `zoneOf()` picks the longest name, which can pick the wrong half of the country
`zoneOf('Gabtoli, Bogura')` returns `{zone:'in', sure:true}` — "gabtoli" (7
letters) beats "bogura" (6), so a Bogura address is priced as Inside Dhaka at
৳80. This is exactly the trap in the owner's #35.

*My work-around:* `co_zoneRead(addr)` in `src/51-checkout.js` runs `zoneOf()`
and then checks the line against both `DHAKA_CITY` and `OUTSIDE`; when both
match it returns `{zone:null, sure:false, both:[…]}` and the checkout asks
"Where is this address?", naming both words it found.

**Suggestion:** move that conflict check into `zoneOf()` itself, so the bag,
the admin pages and order editing get it too.

### 3. The floating WhatsApp button owns a lane down the middle of the right edge
`.wa-fab` is `position:fixed; right:12px; top:50%`, 50px wide, `z-index:44`.
Anything right-aligned that scrolls through the middle of the screen passes
under it. On the bag that is now the fourth colour chip in the "Add a 2nd
polo" row, so I tucked the row 48px clear (`r12-bag.css`) — the same tuck the
file already uses for two links.

**Suggestion:** park it bottom-right above the bottom nav, or fade it out
while an interactive element is under it (you already have `.wa-off`). Then
the three `margin-right:48–54px` tucks can go.

---

## For Agent B — `30-product.js`

`freeDeliveryFor(p)` (PDP) and `bag_freeDel(total)` (mine) must never
disagree. `bag_freeDel()` covers: campaign on → free; any free-delivery
product in the bag → free; cart over `SET('delivery','freeOver')` → free.

If you keep your own helper, please add the campaign case
(`SET('delivery','freeCampaign')`), so a product page cannot show a charge
during a free-delivery campaign — that is the same defect as #36 one page
earlier. `bag_freeDel()` is global and safe to call from the PDP.

---

## Note on the build

I built and measured `dist/_mine.html` only, so I would not overwrite
`dist/EXTAS-demo.html` while two other agents are mid-edit. The final
`tools/build.sh` run still has to happen once we are all finished.
