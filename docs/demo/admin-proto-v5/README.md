# Admin prototype v5 (owner-approved, locked 13 Nov 2026)

The owner's approved clickable prototype of the new admin. It is **the UI truth for the admin** from now on
(it replaces V12.4's admin screens wherever the two differ). Storefront UI truth stays V12.2.

- Open: serve this folder with any static server (`npx serve docs/demo/admin-proto-v5`) and open `index.html`.
  Hash routes: `#<section>--<tab>--<id>` (e.g. `#orders--processing`, `#couriers--c360`, `#rules--popups`).
  Sample data is in `A.D` (browser localStorage). `A.version` change resets it once. "Reset sample data" lives in Settings.
- `DECISIONS.md` = every owner decision made while building it (read it in full; later rounds win).
- `CONTRACT.md` = the shared contract between the prototype modules (nav, data, shared APIs, order statuses).
- `courier-research.md` = what the courier APIs offer (thin where public docs are thin).
- Screen text is English (EN/বাং toggle for Bengali). Sample data covers ~60 days; Finance balances are sample.
- This folder is reference only: it is never deployed and never imported by the app.
