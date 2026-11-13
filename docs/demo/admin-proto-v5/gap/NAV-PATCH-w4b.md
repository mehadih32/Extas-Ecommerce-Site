# NAV PATCH — builder W4B (PR 686 to 691)

The pages below are built and work at their address. None of them is in the menu yet, because `sections.ts`, `lumen-nav.ts`
and `admin-shell.*.json` are shared files. A page not in `sections.ts` shows no tabs and no guide button until this patch is
applied. Page keys are the `KEY` constant in each `page.tsx` (used by `locateKey`). The help rows (`help-pages.json`) and the
guides are already in.

## Tabs to add

| Section | Tab (English / Bengali) | Address | Page key | Permission to see | Help id |
|---|---|---|---|---|---|
| Products | Shop ranking / দোকানে সাজানো | /admin/products/ranking | productRanking | catalogue.read | products/ranking |
| Money (Finance) | Money in & out / টাকা আসা-যাওয়া | /admin/money/cash | moneyCash | books.read | money/cash |
| Money (Finance) | Budgets & profit / বাজেট আর লাভ | /admin/money/budgets | moneyBudgets | books.read | money/budgets |
| Reports | Report library / রিপোর্ট লাইব্রেরি | /admin/reports | reportsLibrary | reports.read | reports/library |
| Reports | Report packs / রিপোর্ট প্যাক | /admin/reports/packs | reportsPacks | reports.read | reports/packs |

Make "Report library" the first Reports tab (the prototype opens Reports on it).

## Finance regroup (PR 688), menu only
Prototype Finance has seven tabs. Group the existing pages under them, no page moves:
- Overview, Profit (existing), Money in & out (new), Budgets & profit (new)
- "ERP account": Books (account), Match, Differences, Closes, Daily, Month-end
- "Costs & budgets": Costs, Expenses, Fees, Cost ledger, Cost report, Budgets & profit
- Refunds (existing)
- VAT: hide the tab while the VAT system is off (the page and its setting stay; nothing is deleted)

## Home (PR 691)
Done in code: the Command center (design D) is the default Home. Needs the shared message files:
1. Three KPI tiles in design D: Net profit (today), COD with couriers, Ad spend. The figures exist: `inv.profitSnapshot`
   (PR 688), `moneyOverview(...).cod.minor`, and `inv.profitReport(...).adsMinor`. Strings go under `dsh.*` in admin-shell.
2. Do-now rows to add in `apps/web/src/lib/admin-shell/queues.ts` (`QueueId`, `QUEUES`, `countQueues`) and `dash.queue.*`
   in admin-shell: `exchangesRequested` (Exchange status REQUESTED, link /admin/orders/returns, permission orders.read,
   tone warn, group orders; "Exchange requests waiting"). Already covered by existing rows: sizes almost out (`lowStock`),
   drafts (`launch`), ERP check days and differences (`booksDifferences`, `erpHeldLong`). Not built: stuck batch (the shop has
   no production batch) and courier mismatch (`ChargeMismatch` has no "resolved" mark, so a row would never clear).
3. Pinned report cards (PR 689): Home can read them with `cat.listPins` and show each card's figure from `libraryScreen`.

## Settings to show
`shop.ranking` (PR 686, "More options" already on the page), `books.cash`, `books.budget`, `reports.library` (registry group
books / reports). They are registered and labelled in both languages; show them in Settings if the Settings pages list by group.

## Permissions
New key `cash.record` (group books): add it to the role editor tree if the access tree is built from `ACCESS_TREE`.
Give it to the Accounts role and the owner only (the money rule).

## Applied 13 Nov 2026 (W4B gap close)
- Tabs added (sections.ts, `admin-shell.*.json`): Products > Shop ranking, Money > Money in & out, Money > Budgets & profit, Reports > Report library (first tab) and Reports > Report packs. The global search finds them (test `search-wave4b.test.ts`). smoke.json lists the four new routes.
- Home: the three KPI tiles (net profit, money with couriers, ad spend), the pinned report cards and the `exchangesRequested` Do-now line are built (`dsh.cmd.*` and `dash.queue.exchangesRequested` in admin-shell).
- Still open: the Finance 7-tab regroup and hiding the VAT tab (menu only), Settings group listing, `cash.record` in the role tree check.
