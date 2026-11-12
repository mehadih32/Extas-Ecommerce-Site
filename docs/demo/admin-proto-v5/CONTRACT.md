# EXTAS admin prototype — build contract (read fully before coding)

The owner of EXTAS (Bangladeshi menswear brand; non-technical) will judge the WHOLE future admin panel of his
e-commerce site from this clickable prototype, then hand it to developers as the "UI truth". It must feel like a
real, live, smart admin: every button does something believable on the in-browser sample data, numbers add up,
nothing says "coming soon", no developer words (no PR, CN, S13, engine, webhook, cache, queue jargon on business pages).

Folder: /tmp/claude-0/-home-claude/a27f8d4d-b57b-5d41-b919-c637e74e7368/scratchpad/proto
- index.html loads css/app.css, js/core.js, then js/m-<section>.js modules, then `A.boot()`.
- Local server already running: http://127.0.0.1:8765/index.html#<route>
- Check tool: `cd /tmp/claude-0/-home-claude/a27f8d4d-b57b-5d41-b919-c637e74e7368/scratchpad/tools && NODE_PATH=$(npm root -g) node check.js orders orders--confirm ...`
  prints ok/ERR per route, page text start, [H-SCROLL] if the page scrolls sideways. `SHOT=<dir>` saves screenshots
  (view them with the Read tool), `PHONE=1` = 390px phone, `BN=1` = Bengali, `FULL=1` = full-page shot.
- Only edit YOUR module files. Never edit core.js, app.css or index.html (ask the lead in your final report if core needs something; work around it locally meanwhile).

## Module API
```js
A.mod('orders', {
  all:     { render(el, r) { el.innerHTML = ...; /* wire listeners */ }, guide: { en: '<p>…</p>', bn: '<p>…</p>' } },
  confirm: { render(el, r) {...}, guide: {...} },
});
```
- `r = { sec, tab, id }` from the hash `#sec--tab--id` (id optional: e.g. `#orders--all--EX-10231` opens that order).
- Every tab of your sections listed in `A.NAV` (core.js) MUST have a renderer. Start each page with
  `A.pageHead(title, subtitle, actionsHtml) + A.tabsBar(sec, tab)` then content.
- Navigation: links `href="${A.href('orders','all','EX-10231')}"` or `A.go(sec, tab, id)`.
- Re-render the current page after a change: `A.commit('what changed'); A.render();` (commit saves to localStorage and writes the activity log). `A.toast(msg, 'good'|'bad')` after every action.
- Text: `A.t('English', 'বাংলা')` for EVERY visible string. English = simple Shopify-style business English. Bengali = natural Bangladeshi চলিত Bengali the way bKash/Daraz/Pathao apps write: use English loanwords people say (অর্ডার, ডেলিভারি, কুপন, স্টক, রিপোর্ট, সেটিংস, এডিট, ডাউনলোড, পাবলিশ, রিটার্ন, এক্সচেঞ্জ, ফিল্টার, সেভ), never coined words (no চাবি for key, no গোনা for count, no ছাঁকনি, no সংরক্ষণ). Labels use "ও" not "আর". Western digits 0-9 in Bengali too. আপনি for everyone.
- Module CSS: `A.css('orders', '…css…')` once (scoped class names prefixed with your module, e.g. `.ord-…`). Use tokens only (var(--ink), var(--card), var(--accent)…), never hex.

## Data (A.D, persisted; generated in core.js makeData — read it for exact fields)
- `A.D.products[]` {id, styleCode, name, cat, price, compareAt, cost(ERP buying price), colors[], sizes[], variants[{sku,color,size,stock,reserved}], status live|ready|draft|archived, photos, source ERP|Manual, erpSyncedAt, fabric, fit, desc, seo{title,desc,slug,score}, pin, views30, carts30, sold30, revenue30, rating, reviews}
- `A.D.orders[]` newest first {id 'EX-10xxx', created ISO, customerId, name, phone, district, area, zone inside|sub|outside, address, lines[{pid,sku,name,color,size,qty,price,cost}], subtotal, discount, coupon, delivery, total, payment COD|bKash|Nagad|Card, paid, channel, source, courier pathao|steadfast|redx|'', tracking, status new|confirmed|packed|shipped|delivered|returned|cancelled|exchanged, risk low|medium|high, notes, timeline[{t,text,by}], erp{pushed,at,no}, deliveredAt, settled, returnReason, returnChecked}
- `A.D.customers[]` {id,name,phone,district,area,zone,created,points,wallet,orders,delivered,refused,spent,lastOrder,email,tags}
- `A.D.rules` (delivery fees per zone, freeDelivery, cod, advance, wallets, exchange, returns, buyMore, eid, orderEdit, fraud, notice), `A.D.coupons[]`, `A.D.discounts[]`
- `A.D.couriers[]` {id,name,fee{inside,sub,outside},codPct,connected}, `A.D.campaigns[]`, `A.D.adSpend[]` {date,cid,spend,impressions,clicks}
- `A.D.expenses[]` {id,date,name,cat,amount,fixed}, `A.D.expenseSettings` {packaging,gatewayPct}
- `A.D.reviews[]`, `A.D.questions[]`, `A.D.abandoned[]`, `A.D.conversations[]` {msgs[{from c|s,text,t,by}]}, `A.D.quickReplies[]`
- `A.D.erp` {connected,url,company,warehouse,contract,lastHealth,lastStockSync,lastProductSync,styleCodesInErp,notImported[{styleCode,name,price,cost,colors,stock}],payments[]}, `A.D.erpEvents[]` {t,kind,text,ok}
- `A.D.traffic[]` per day {date,sessions,users,views,carts,checkouts,orders}, `A.D.keywords[]`, `A.D.seoIssues[]`, `A.D.blog[]`, `A.D.staff[]`, `A.D.store`, `A.D.audit[]`
- Prototype "now" is `A.TODAY` (12 Nov 2026, 8 PM Dhaka). Data covers 60 days; "this month / 30 days" analysis + previous period comparisons work.

## Business maths (use these, don't re-invent — numbers must match across pages)
`A.calc`: isDelivered(o), isOpen(o), cogs(o), pieces(o), courierFee(o), codFee(o), gatewayFee(o), returnCost(o),
orderProfit(o), range(key) → {from,to,prevFrom,prevTo,days} for 'today'|'yesterday'|'7d'|'30d'|'month'|'lastmonth',
ordersIn(from,to), adSpendIn(from,to,channel?), fixedIn, otherExpIn, pnl(from,to) → {orders,delivered,returned,productSales,
discounts,deliveryIncome,revenue,cogs,courier,cod,packaging,gateway,returns,gross,ads,fixed,other,net,margin},
kpis(range) → {cur,prev} with orders, orderValue, aov, delivered, sales, profit, gross, returnRate, cancelled, ads, roas, sessions, conv, pieces,
daily(from,to,fn(dateYmd)), codWithCouriers(), lowStock(limit), stockDays(p), erpBalance() → {bills,credits,paid,owed}, deliveryFee(zone,subtotal), counts().

## UI helpers
`A.ui`: badge(text,tone good|warn|bad|info|accent|dark), statusBadge(status), riskBadge(risk), kpi({label,value,delta,sub,icon}),
card(title, body, {sub, more, moreHref, cls}), table(cols[{h, f(row), r(right-align), hide(hide on phone)}], rows, {onRow:true} → rows get data-row=row._id),
thumb(product,size), sw(color)/sw2(colors), switch(id,on), field(label,inputHtml,hint), input(id,val,attrs), money(id,val), select(id,[[v,l]],val),
callout(html,tone,icon), empty(text), seg(id,[[v,l]],val) (buttons with data-v), bar(pct,color), rangeOpts(), guide(text),
modal(title, body, {foot, wide, onOpen}) / drawer(title, body, {foot, onOpen}) / close() / confirm(title,text,okLabel,onOk,danger), copy(text), download(name).
`A.chart`: line({labels, series[{name,color,values,dashed}], height, money}), columns({labels,values,values2,money}), bars({items[{label,value,text,color}],money}),
donut({parts[{label,value,color}], center}), spark(values,color), funnel(steps[{label,value}]), waterfall(steps[{label,value,total}]).
`A.fmt`: tk(n) '৳1,23,450', tkShort, num, pct(n), date, dateY, time, dt, ago, ymd. `A.delta(cur, prev, inverse)` → ▲▼ chip.
`A.icon(name)`: home orders products customers inbox rules marketing website finance reports settings search bell help moon menu x ext check plus down info warn phone truck box sync print star edit send reset.
Colors for series: 'var(--c1)'…'var(--c6)', 'var(--good)', 'var(--bad)', 'var(--warn)', 'var(--navy2)'.
CSS classes available (see css/app.css): grid g2 g3 g4 g5 span2 span3, card card-h kpi, tabs chips chip(.on), btn(.primary .dark .ghost .sm .danger),
inp, money, row(.between), stack, formgrid, seg, tbl-wrap tbl, list li grow, ellip, muted small strong mono, steps st(.on .done), timeline tl, callout, guide-note, badge, hero, hide-sm.

## Quality bar
- Information-rich, decision-oriented: every page answers "what should I do now?" with numbers, ▲▼ vs previous period, and 1–2 plain-language insight lines computed from data (e.g. "Polo sales are 18% down on last month; size L is out in 3 colours").
- Every list: search + filter chips + sort where useful; click a row → detail (drawer or page) with real actions.
- Every action changes A.D, saves (A.commit), shows a toast, and updates counts/other pages (e.g. confirming an order adds a timeline line, pushes to ERP, reduces "To confirm" count; changing a delivery fee changes checkout preview and new orders).
- Money or price changes, refunds, deletes and blocking: show an in-page confirm step (A.ui.confirm) with a "PIN" field for owner-level actions (accept any 4 digits in the prototype).
- Phone (390px) must work: no sideways scroll (wrap tables in .tbl-wrap, use hide:true on less important columns), forms stack.
- Each tab gets a `guide` {en, bn}: What · Why (real buying-house/shop example) · How (steps) — 4–8 short lines. Bengali natural.
- No console errors. Run the check tool on all your routes at desktop + phone, and look at a few screenshots before you finish.
- Time limit: be DONE (working, checked) within 40 minutes of starting. Build all tabs working first, then deepen. Report: files written, routes checked, anything the lead must know (max 150 words).

# ROUND 3 ADDENDUM (13 Nov, final build) — read after the contract above and after the "Round 3" sections at the bottom of DECISIONS.md
The owner reviewed Orders, Products, Finance and more. DECISIONS.md "Round 3" is the spec for everything below (newer text wins over older rounds).
core.js NAV is ALREADY changed by the lead (do NOT edit core.js, map.js, index.html, css/app.css; ask in your report):
- Orders tabs: batch (label "Batch": Current / Past batches), all, processing (replaces confirm), ship ("To ship": chips Confirmed → Book courier, Booked → Print stickers, Packed), courier (With courier), returns, incomplete.
  The OLD routes `orders--confirm` and `orders--pack` must still render (register them as aliases that redirect to processing / ship) because other modules link to them.
- NEW section `couriers` (left menu, after Orders): tabs overview (All couriers), c360 (Courier 360, `#couriers--c360--<courierId>`, default courier first, chips to switch), claims (Claims & payouts), setup.
- Finance gets tab `couriers`; Reports gets tab `couriers`; Rules tabs: all, coupons (relabelled "Offers & discounts", becomes the Offers 360), popups (new "Pop-ups & notices").
- New script files already exist as stubs and are loaded last: js/m-couriers.js, js/m-incomplete.js, js/m-offers.js. A later-loaded A.mod(sec,{tab}) overrides an earlier one for the same tab.
- A.version is now 'proto-5' (browser data resets once, so seed your new data in the usual makeData-or-lazy-init way).
FILE OWNERSHIP (edit only yours):
- Agent ORDERS: js/m-orders.js (and js/m-customers.js only if truly needed). Agent COURIERS: js/m-couriers.js. Agent MONEY: js/m-finance.js, js/m-reports.js, js/m-home.js, js/m-products.js (photos & video step).
- Agent INCOMPLETE: js/m-incomplete.js. Agent RULES: js/m-rules.js, js/m-offers.js, js/m-website.js (only the pop-up list links).
SHARED APIs (call them lazily inside click/render handlers and ALWAYS guard: `A.couriersApi && A.couriersApi.status(o)`; the other agent is writing it at the same time):
- A.couriersApi (COURIERS): status(o) → {code,label:[en,bn],tone,at,rider:{name,phone}|null,attempts,consignment,cod}|null (codes: picked_up, in_transit, at_hub, out_for_delivery, attempt_failed, on_hold, delivered, returning, returned) ; history(o) → [{t,code,text:[en,bn],where:[en,bn]}] newest first (deterministic from order id+status+dates, no randomness at render) ; openTrack(o) → side drawer with the full tracking history ; href(courierId) → '#couriers--c360--<id>' ; owed(courierId) → ৳ COD the courier holds ; payouts() → A.D.courierPay[].
- A.ordersApi (ORDERS, existing + new): claims() → A.D.claims (array, seeded; fields id, oid, courier, type lost|damaged|short_cod|rider|return_short, amount, at ISO, deadline ISO, status open|sent|won|lost, recovered ৳, note) ; addClaim(c). Claims live ONLY in A.D.claims now (migrate the old R2().claims there); Orders, Couriers and Finance all read the same array.
- A.offersApi (RULES): active() → [{id,name:[en,bn],kind:'free_delivery'|'percent'|'flat'|'points'|'wallet',value,where,status}] for pickers (Incomplete messages, Orders price adjust, checkout).
- A.rulesApi (existing) gets courierMsg(key, ctx) → {en,bn} (RULES; text of Rules › Courier messages with {placeholders} filled).
- A.incompleteApi (INCOMPLETE): openCount(), leftWithoutNumber(), recoveredCount().
Everything else in the contract above still holds (English UI + A.t Bengali, guide per tab, A.commit + toast, phone 390px no sideways scroll, no console errors, check tool on all your routes desktop+PHONE=1+BN=1, look at a few screenshots). Be DONE and checked within 45 minutes. Final report ≤150 words: files, routes checked, anything the lead must wire.
- Order data statuses are now: new, confirmed, booked (NEW: courier booked, tracking no. set), packed (sticker printed), shipped (= "Handed over" to the courier), delivered, returned, cancelled, exchanged; "Processing" and "Paid" are derived/flag states as before for "To confirm"/"Paid". core.js C.isOpen already includes 'booked'. Other modules (Home, Finance, Reports, Customers, Marketing) read these status strings, so ORDERS must keep 'confirmed|packed|shipped' meanings intact and may only ADD 'booked'.
