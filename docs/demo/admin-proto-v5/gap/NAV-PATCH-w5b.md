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
