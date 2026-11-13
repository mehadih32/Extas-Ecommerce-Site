# NAV-PATCH for wave 5b (PR 700-707)

The coordinator applies these to the shared files (`sections.ts`, `lumen-nav.ts`, `admin-shell.{en,bn}.json`) after the
menu PRs (659-699) have landed. Nothing here is applied by the w5b branch.

## PR 707 Admin map
- Page `/admin/map` (perm `help.read`, key `adminMap`), no tab: open it in a NEW WINDOW (`target="_blank"`) from the menu foot
  ("Admin map" link) and from the "?" guide panel's header.
- `apps/web/messages/admin-map.{en,bn}.json` holds one line per page keyed `<section>.<tab>`. `staleLines()` in
  `lib/admin-map.ts` lists the lines written for the prototype's future ids (orders.batch, couriers.overview ...);
  `pagesWithoutLine()` lists menu pages with no line. After 659-699 land, run the test `admin-map.test.ts`: it fails
  when a menu page has no line, naming it. Add that line (en + bn) then.

## PR 702 Staff controls
- Page `/admin/settings/staff-controls` (perm `staff.read`; saving needs `settings.write`, making the packer role `roles.manage`),
  a tab "Staff controls" under Settings (People group, next to People / Roles). Key `staffControls`, guide `settings/staff-controls`.
- The same page holds the end-of-day cash handover sheet (switch `staff.controls` handover.enabled, off by default).
- 664 (price adjust) and 687 (cash in/out) call `checkDiscount` / `personLimits` from `lib/staff-controls.ts` when they land.

## PR 706 Start fresh
- Page `/admin/settings/start-fresh` (perm `settings.write`; the owner only inside), a tab "Start fresh" under Settings, in the
  Data & privacy / System group, last in its row. Key `startFresh`, guide `settings/start-fresh`. Off until the owner switches it on
  (setting `startFresh.settings`); runs once. The site clears carts, reviews and returns itself; orders, customers, chats,
  coupon uses, analytics and customer problems sit on append-only tables and are HANDED_OFF (recorded in `StartFreshRun.kinds`)
  to the server's purge job, which is not built here. The ERP-side clear is a mock (`erpStatus` MOCK_NOT_SENT).

## PR 704 Bulk and corporate orders
- Page `/admin/orders/bulk` (perm `orders.read`; quotes, batches and marks `orders.notes`; settings `settings.write`), a tab "Bulk" in the
  Orders section after Returns (the prototype's "Bulk / corporate" chip on All orders may also link here). Key `ordersBulk`, guide `orders/bulk`.
  Off until the owner turns `bulk.orders` on (screen has the switch). Quote numbers use the setting's prefix (QT-). Advance and balance are
  marks with the owner's PIN; no Payment row is made (Money and Accounts own that).

## PR 703 Telegram approvals
- Page `/admin/settings/telegram-approvals` (perm `settings.write`; the owner only inside), a tab "Telegram approvals" under Settings next to
  Keys and connections. Key `telegramApprovals`, guide `settings/telegram-approvals`. Webhook `/api/telegram/webhook/<secret>` is public
  (secret = keyed hash of the bot token; a mock connection answers 404). Off until the owner turns `telegram.approvals` on.
- Other screens raise one with `requestApproval(deps, storeId, { kind: refund|price|cod|other, source, title, detail?, amountMinor?, refType?, refId? })`
  from `lib/telegram-approvals.ts` (price adjust 664, prepaid refund, big COD) and read `ApprovalRequest.status` for the answer; deciding only records it.

## PR 700 Website analytics: visitors
- Page `/admin/website/analytics` (perm `reports.read`; settings `settings.write` + PIN), tab "Analytics" under Website (the Overview). Key
  `websiteAnalytics`, guide `website/analytics`. The shop layout now also reads `analytics.visitors` and passes `collect` to the beacon.
  Off until the owner turns collect on; `GET /api/admin/analytics-visitors`. The existing Reports > Analytics pages stay as they are.

## PR 701 Website analytics: behaviour
- Page `/admin/website/analytics/behaviour` (perm `reports.read`; settings `settings.write` + PIN), the "Behaviour" chip beside Overview on the
  Analytics page (not a menu row of its own). Key `webAnalytics.behaviour`, guide `website/analytics-behaviour`. The shop layout reads
  `analytics.behaviour` and draws `BehaviourBeacon` only when collect is on (off by default); `POST /api/shop/behaviour` is public, same-site, always 204;
  `GET /api/admin/analytics-behaviour`. Links to the existing Reports > Funnels and Searches pages.
