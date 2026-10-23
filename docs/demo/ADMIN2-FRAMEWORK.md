# New EXTAS admin — framework guide (phase 1 → phase 2)

The new admin lives at `#/admin` inside the clickable demo. It follows `docs/BACKEND-ARCHITECTURE.md` §5 (CN-022).
The classic admin is untouched and reachable at `#/admin-classic/<rest>` (it resolves the old page for `/admin/<rest>`).
Read this before adding a section. Everything here is plain ES5 in global scope, like the rest of the demo.

## Files (load order = file name order)

| File | What it holds |
|---|---|
| `src/r12-zzzzz-adm2.css` | All styles. Every rule is under `.adm2`, every class is `a2-*`. Never add an unscoped rule. |
| `src/97m-adm2-data.js` | Language (`L`, `Le`, `a2bn`), money/date formatters (`a2tk` lakh grouping, `a2tkS`, `a2pct`, `a2date`, `a2dt`, `a2ago`), settings (`A2_SET_DEF`, `a2Set`, `a2SetV`), roles (`A2_ROLES`, `a2Can`), the order adapter (`a2O`, `a2Sync`, four status maps `A2_OST` / `A2_SHIP` / `A2_PAY` / `A2_RET`, `a2Chips`), **the one metric function `a2M(days, offsetDays)`**, `a2Series`, `a2Queues` (needs-you-now + badges), `a2ReadyToBook`. |
| `src/97n-adm2-seed.js` | Sample data, added once into the demo's own stores (`ST.orders`, `zy_st().exp`) — flag `ST.a2Demo`. |
| `src/97o-adm2-shell.js` | Icons (`a2i`), registry + router, shell, page patterns, palette, notifications, guide, confirm dialog, classic-admin bridge. |
| `src/97p-adm2-sections.js` | The 14 sidebar sections (`a2Section`), palette actions (`a2RegAction`), Bengali guides (`A2_GUIDE`). |
| `src/97q…97w-adm2-*.js` | Pages: dashboard, orders (2 files), delivery, customers, money, messages. |

## Stores (one store, nothing duplicated)

- Orders: `ST.orders` (the shop's own). New-admin facts live on `o.a2` (`ost`, `ship`, `cour`, `cid`, `pay[]`, `refunds[]`, `ret`, `risk`, `ev[]`, `notes[]`, `calls[]`…).
  Always read through `a2O(o)`; after changing `a.ost` call `a2Sync(o)` (keeps the classic `o.status` in step). Order commands are in `A2C` (97r) — use them, do not edit states by hand.
- Customers: `zr_all()` (CRM) via `a2Custs()`. Couriers: `zk_list()/zk_c()`. Expenses: `zy_st()`. Message texts: `zs_S('msg.placedText'|'msg.confirmText')` + `ST.a2.tpl`. Optional features: `ft(k)/ftSet(k,f,v)`. Smart Rules values: `SET(rule,key)` / `a2SetRule(rule,key,v)`.
- New-admin state: `ST.a2` (via `a2S()`): role, notifications, approvals, payouts, journey, risk rules, campaigns, segments, settings (`set`), saved views.
- Every number/threshold is a setting: add a default to `A2_SET_DEF`, read with `a2Set(key)`. Never hard-code a policy number.

## Register a section and its pages

```js
a2Section({id:'products', en:'Products', bn:'প্রোডাক্ট', icon:'shirt', group:'daily',   // daily | grow | business | bottom
  base:'/admin/products', perm:'products.read', perms:['products.read'],            // section shows if the role holds any of perms
  badge:a2Cnt(function(){ return …waiting count…; }),                               // waiting work only
  tabs:[{id:'all', en:'All products', bn:'সব প্রোডাক্ট', path:'/admin/products', perm:'products.read'},
        {id:'media', en:'Media library', bn:'মিডিয়া', path:'/admin/products/media', perm:'products.read', more:true}]});  // more:true → "More ▾"
a2Page({path:'/admin/products/:id', section:'products', tab:'all', en:'Product', bn:'প্রোডাক্ট', perm:'products.read',
  syn:'search words', skel:'form', render:function(params, query, ctx){ return a2Head(ctx, {…}) + a2Tabs(ctx) + …; }});
```

- Calling `a2Section` with an existing id replaces it **in place** (sidebar order kept). Phase 2 replaces the eight placeholder sections (Products, Support, Marketing, Website, Reports, AI Center, Settings, Help & Build) this way; a section without pages shows `a2Placeholder` with links to the classic pages (`classic:[…]`).
- Routing is automatic: any `/admin/<section base>/…` path is owned by the new admin. Static paths win over `:param` paths. An unowned `/admin/x` shows the new 404 inside the shell.
- When a section takes over a path that a classic page used (e.g. `/admin/products`), the classic page stays at `#/admin-classic/products`; classic links are rewritten automatically.
- Page `perm` is checked before render; a deep link without permission shows the denied state ("Ask the owner"). Hide buttons with `a2Can(key)` too (convenience only).
- Add a Bengali guide: `A2_GUIDE.<sectionId> = {t, kaj:[], menu:[], kora:[], sw:[], next:[]}` (same shape as the classic `AG`).
- Register search entries: `a2RegSetting(id, en, bn, path, 'Section › Page › Card', synonyms)` — the card must render with `a2SetCard({id, …})` so `?hl=id` highlights it. `a2RegAction(en, bn, '#/…', perm, synonyms)` for `>` actions.

## Page patterns (build pages only from these)

| Helper | Use |
|---|---|
| `a2Head(ctx, {title, titleHtml, sub, right, back:[href,label], crumb})` | Page header with the guide link "এই সেকশনে কী করা যায়". `right` = at most 1 primary + 2 secondary buttons. |
| `a2Tabs(ctx[, activeId])` | Section tabs; `more:true` tabs fold into "More ▾". |
| `a2Kpis([{l, bn, v, delta, deltaPts, good:'up'|'down', note, spark:[…], status, href}], 'k3'|'k5'|'k6')` | KPI strip. `status` = estimated / provisional / reconciled / final (`a2MS`). Values must come from `a2M()`. |
| `a2List({id, rows, views, search, filters, cols, key, href | peek, bulk, empty, saveViews})` | List = saved views + filter bar + table (cards on phone) + bulk bar (with skip reasons) + right drawer (`peek`). Column `k:'h'` = card heading, `'w'` = full width, `'x'` = hidden on phone. Bulk: `{id, en, bn, perm, skip(row)→reason|null, run(rows, reason), confirm(rows)→[effects], reason:true}`. |
| `a2Detail({lock, bands, main:[cardHtml…], side:timelineHtml})` | Detail = cards ⅔ + timeline ⅓; tablet/phone get "Details \| Timeline" tabs. `a2TL(events)` renders a timeline. |
| `a2Form({sections:[{id,en,bn,ok,html}], ready:{items:[{ok,t}], extra}, save, secondary, saveNote})` | Form = anchors with ✓/! + sections + readiness panel + sticky save bar. |
| `a2SetCard({id, en, bn, where, desc, descBn, key | on+act+actKey, fields:[{k,en,bn,type:'num'|'text'|'sel'|'sw'|'area',opts,def,get,set}], reset:[keys], money:true})` | Settings card: one feature, off by default, values fold away when off, default shown, Reset; `money:true` asks for a reason ([confirm]). Custom stores: `A2.setFns[name] = {get, set}` and `set:'name'` on the field. |
| `a2State('empty'|'error'|'denied'|'notfound', {t, s, action, icon, perm})`, `a2Skeleton()` | Base states. Loading / empty / error / denied can be previewed from Demo controls → "Page state preview" (or `?state=`). A page may give `empty:function(ctx){…}`. |
| `a2Bnd(kind, html, btnHtml)`, `a2Mock(text)` | Bands: mock · partial · stale · locked · off · bad. |
| `a2Drawer({title, sub, body, foot, close, closeData, wide})` | Right drawer (bottom sheet on phone). Generic drawers: `A2.drawers[id] = fn(state)` + a button `data-act="a2-dopen" data-d="id"`. |
| `a2Confirm({title, bn, sub, body, effects:[…], reason:true|'optional', ok, okBn, tone, fn(reason, fieldValues)})` | [confirm] dialog with "What will happen" preview; inputs inside `body` with `data-f="name"` come back in `fieldValues`. |
| `a2Board([{en, bn, cards:[html]}])` | Kanban columns (returns, refunds). |
| `a2Chart(series, labels, {fmt})`, `a2Spark(vals)`, `a2Bars(rows)` | Charts; axis text is HTML so it stays readable at every width. |
| `a2Chips(o)` | The four separate order statuses (order · courier · payment · return/refund). Never merge them. |

## Rules that keep it consistent

- Sales = delivered only (`a2M().sales`); show ordered value separately and name it so. Missing cost / ads are left out and counted, never 0.
- Actions write events (`a2Ev`) and the audit log (`a2Log`); money, price, COD, block and refund steps go through `a2Confirm` with a reason; proposals go to `ST.a2.appr` (owner approves).
- Text: `Le(en, bn)` for every label; English mode shows no Bengali except the guide link; Western digits; ৳ with lakh grouping (`a2tk`).
- Phone (≤767 px): sidebar becomes a drawer, bottom bar Home · Orders · Support · Search · More, tables become cards, 44 px targets. Tablet (768–1199): icon rail.
- Roles: `A2_ROLES` (owner, manager, packer, support, accounts) with start pages (§19.5). Demo controls and the account menu switch roles.
- Tests: `scratchpad/a2qa/flows.js` (click-through, 74 checks), `a2qa/smoke.js` (every route, layout audit), `a2qa/pdiff.js` (storefront unchanged).
