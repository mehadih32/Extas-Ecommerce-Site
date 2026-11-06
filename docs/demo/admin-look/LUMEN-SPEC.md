# Admin look "Lumen" — the default admin look (owner decision, 6 Nov 2026)

> **বাংলায় সংক্ষেপে:** অ্যাডমিনের ডিফল্ট চেহারা "Lumen"। এই ফাইলে তার নকশার নিয়ম। চলমান নমুনা: `ADMIN-LOOKS-V1.html` (ঘ বোতাম)।

The clickable prototype is `docs/demo/admin-look/ADMIN-LOOKS-V1.html` (open it in a browser, press the **ঘ · Lumen** button,
click everything). Its `lumen.css.txt` is the same style as plain text. The prototype shows the **pattern**, not the feature
list: real pages keep every feature they have today. All numbers in it are sample data.

The other three looks in the same file (ক Clear Day, খ Night Atelier, গ Studio) are **planned, not built**. They are built
only when the owner says so. The theme layer must make that cheap: a new look is a token set plus an optional shell variant.

## 1. Tokens (one theme layer, nothing hardcoded elsewhere)

| Token | Light | Dark |
|---|---|---|
| background `--bg` | `#ECEFF5` | `#080D1F` |
| card `--sf` / soft `--sf2` | `#FFFFFF` / `#F4F6FB` | `#111936` / `#18224A` |
| line `--ln` | `#E2E7F0` | `#243059` |
| ink `--ink` / muted `--ink2` | `#0E1A38` / `#5B6885` | `#EEF2FF` / `#9BA8CB` |
| accent `--ac` / tint `--acbg` | `#FF5A36` / `#FFECE6` | `#FF6B47` / `#3B2020` |
| ok / warn / bad / info (text + tint) | `#11845A #DCF4E9`, `#9C5A00 #FFF0D2`, `#D12F3F #FFE4E8`, `#1F6FD1 #E1EDFF` | `#4CD3A0 #10332A`, `#F5B94D #3A2C0C`, `#FF7A89 #3C1A22`, `#7DB3FF #142B52` |
| data colours | coral `#FF5A36`, teal `#12B5A6`, violet `#7C5CFF`, amber `#F5A524`, sky `#2E9BFF` | same |
| hero card | `linear-gradient(135deg,#0E1A38,#1B2C66)` plus a coral radial glow at the top right | `#16224F → #0E1740` |

- Accent colour is a setting (Settings → Admin look → Colour); coral is the shipped default. Light is the default mode; dark is a per-user choice remembered on the account (moon button).
- Fonts: **Bricolage Grotesque** (display, 700/800, headings and big numbers), **Plus Jakarta Sans** (body), **Hind Siliguri** (Bengali). Self-host them (no Google Fonts call from the admin).
- Shape: cards radius 22 px, floating sidebar 24 px, buttons and inputs 12 px, chips and tags fully round. Shadow: `0 1px 2px rgba(14,26,56,.05), 0 10px 28px rgba(14,26,56,.07)`. Primary button: coral gradient with a soft coral shadow. Text on cards never smaller than 14 px; headings at least 24 px on desktop.
- Motion: cards fade in, numbers count up (700 ms), chart line draws, rows slide out on done, switches spring. Everything respects `prefers-reduced-motion` and the setting "Reduce motion".
- Amounts: ৳ with South Asian grouping (1,23,456). Admin is simple English by default with the EN/বাং toggle; Western digits in both.

## 2. Shell (every admin page)

- **Floating sidebar**, 248 px, inset 12 px, rounded. Groups: Daily (Today, Orders, Delivery, Products, Customers), Grow (Marketing, Website, Support), Business (Money, Reports), System (AI Center, Settings, Help). The current section opens its **submenu** below it (accordion); badges show what waits (orders needing action, open support items).
- Search box at the top of the sidebar opens the **command palette** (Ctrl/⌘ K): pages and sub-pages, actions, and live search over orders, products and customers; arrows and Enter work.
- Collapse button: sidebar becomes icons only (72 px). Below 900 px wide it is icons only by itself; below 760 px it becomes a **bottom bar** that scrolls sideways with every section reachable.
- Top of every page: title, one line of what matters, page actions, moon (light/dark) and bell (notifications panel: unread count, each item opens its page, "Mark all read").
- Every page with sub-pages shows them also as **tabs under the title** (this is what phones use).
- Floating round button (bottom right): the assistant. It exists only while AI is switched on; it **drafts and never sends**; a draft shows its own Send and Edit buttons that act only on the owner's press.
- Rows open a **detail drawer** on the right (bottom sheet on phones). Esc closes drawers, palette and panels.
- Widths to pass: 390, 768, 1366, 1920.

## 3. Patterns (build once as shared components, every section uses them)

1. **Summary tiles + hero chart** (Home, Money, Reports): big count-up number, range switch (Today / 7D / 30D), chart with hover read-out, delta against the previous period.
2. **Queue** (Today's queue, Pickups, Returns, Reviews, Messages, Drafts, Payouts): banner with the count and a "do all" button, rows with one clear button each. A done row slides away; a toast offers **Undo** for 5 seconds.
3. **List + filter + bulk** (All orders, Products, Stock, Campaigns, Coupons, Pages, Cashbook): filter chips with counts, search, "show 12 more", tick boxes with a bulk bar (Confirm, Print labels, Assign courier, Clear), row click opens the drawer.
4. **List + detail split** (Order view, Customers): list on the left, full detail on the right; one tap to the next item.
5. **Form + live preview** (Add product, later Combo, Campaign, Page): fields on the left, a sticky "Ready to publish?" checklist and a shop preview on the right that update as the owner types; Publish stays off until every check passes.
6. **Settings cards** (Settings, Alerts, Banners, Menus, Courier rates, Assistants): one switch per card, **all off as shipped**; turning one on folds out its number field.
7. **Toast + Undo**, **empty state** ("all caught up"), **skeleton loading**.

## 4. Sections and sub-pages (the prototype's map; real pages keep all current features)

- Today (Home): hero sales, "Needs you" (confirm-ready orders, risky COD, parcels needing a courier, low stock), order pipeline (click a bar opens All orders on that status), live feed of new orders, monthly goal ring, low stock.
- Orders: Today's queue · All orders · Order view · Dispatch.
- Delivery: Pickups · Late parcels · Courier rates.
- Products: All products · Add product · Stock · Collections.
- Customers: All customers · Groups.
- Marketing: Campaigns · Coupons · Combos. Website: Pages · Banners · Menus. Support: Messages · Returns · Reviews.
- Money: Overview · Cashbook · Payouts. Reports: Sales · Products · Buyers.
- AI Center: Drafts · Assistants · Usage. Settings: General (with the Admin look chooser) · Alerts. Help: Guides.
- Where the register's page tree (BACKEND-ARCHITECTURE.md) has more pages than this map, the extra pages go under the nearest section and take the nearest pattern.

## 5. Safety rules the prototype's "Undo" must never weaken

- Undo is for reversible shop actions (confirm an order, assign a courier, change a status). **Money, refunds, COD changes, prices, discounts, blocking people and deleting data keep their existing confirmation and the owner's written OK** (CLAUDE.md hard rule 6). No one-tap "approve all" on those.
- Every number a rule needs (what counts as "safe" or "risky" COD, the amounts, days and limits) comes from backend settings (CN-018), off by default.
- AI never sends to a buyer or supplier; it drafts, the owner presses Send.
- Nothing is deleted: "Hide", "Pause", "Archive", never remove.
