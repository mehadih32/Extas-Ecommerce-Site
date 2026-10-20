# EXTAS — Master Register

**604 PRs · 28 stages · as of 20 October 2026**

**598 are active. 6 are parked** — S26, the handover pack, together with S27. See *The parking lot*.

*Active* means filed and specified for the build, not coded: no PR has been coded yet. (Until 19 Oct 23:33 this line read "594 are built now", where "built" meant filed and specified.) The four newest, **PR 601–604**, come from the owner's server specification approved 19 Oct 23:33 (change note **CN-001**, blueprint V2.1) — filed, not built. **V2.1 final · 20 Oct:** the pre-code demo work is finished and folded into blueprint V2.1 (its last update before code) — **no new PR numbers**; dated scope "V2.1 final · 20 Oct" on PR 42, 45, 61, 98, 107, 109, 503, 570, 598 and in the 20 Oct scope block below.

This is the one table everything hangs off. Every approved requirement has a stage, a PR number and a
line here. When something new is agreed, it is filed into this table first — into an existing PR if it
belongs there, or as a new PR taking the next free number — and only then does anything get built.

**How to read it.** PR numbers 1–490 run straight through in build order. From 491 onward a number is an
**identity, not a position**: a new PR takes the next free number but is built inside the stage it belongs to, so
PR 491 (the settings framework) is built at S00 time, long before PR 200. The stage column is what decides build
order; the number only names the change. This is the owner's rule — new work joins the same table rather than
starting a new one. The PR tells you what one change contains. Older parts of the specification still quote
`PR-005`-style numbers from the first 210-PR draft; those are historical and the build agent re-maps
them against this table.

**How it changes.** A new requirement is analysed — which stage, then which PR. If an existing PR
covers it, that PR's line is updated and the total does not move. If it needs its own change, it
becomes the next free number — 519, then 520, and so on. The total at the top is updated in the same edit. Nothing is
ever appended to the end of the document instead of being filed.

---

## Build status

*Updated after every PR (CLAUDE.md "How to report"). Counted in stages and PRs. The status page on new.extas.com.bd
reads this table. States: **merged** = code merged to `main` and its gates passed; **live** = also verified running on
the server.*

**Progress: S0A 12/12 · S00 19/19 · S01 22/22 · S09 17/17 · S10 12/12 · total 82/598**

| PR | Stage | State | Date | Note |
|---|---|---|---|---|
| 1 | S0A | live | 2026-10-20 | specs recorded from the VM by every setup run (`docs/reports/server/latest.md`) |
| 2 | S0A | live | 2026-10-20 | Ubuntu 24.04 verified, full upgrade each run |
| 3 | S0A | live | 2026-10-20 | SSH key-only, fail2ban, unattended upgrades, UFW 22/80/443; data-disk LVM (8 volumes + 16 GB swap) |
| 4 | S0A | live | 2026-10-20 | Docker + Compose, boot order NVMe → data disk → Docker; zero-downtime blue/green app deploy with automatic rollback (`infra/deploy/deploy.sh`, `deploy.yml`); first deploy on the VM 20 Oct 03:03, 6 replicas |
| 5 | S0A | live | 2026-10-20 | PostgreSQL 17 tuned from the profile, PgBouncer, temp on NVMe, WAL archive, slow log 100 ms |
| 6 | S0A | live | 2026-10-20 | Redis split: LRU cache (NVMe) + no-eviction queue store (AOF, data disk) |
| 7 | S0A | live | 2026-10-20 | Caddy auto HTTPS + HTTP/3, password + noindex; preview password read on the VM, rotatable (CN-007); Cloudflare Origin cert waits for the Cloudflare key (PR 493/500) |
| 8 | S0A | live | 2026-10-20 | daily base + dump + config, WAL every minute, one-command restore, restore test; Blob/Drive "not connected" until keys |
| 9 | S0A | live | 2026-10-20 | monitor every minute → `health.json`; Telegram once the bot key is in the vault, log until then |
| 10 | S0A | live | 2026-10-20 | k6 baseline recorded on the server; `docs/SERVER.md` in Bengali |
| 601 | S0A | live | 2026-10-20 | NVMe boot unit before Docker; Direct Disk only; OS-disk fallback + alert |
| 604 | S0A | live | 2026-10-20 | auto profile in `infra/config/server.conf`; exact A2.9.5 table on 8 vCPU / 64 GB, scales elsewhere |
| 11 | S00 | live | 2026-10-20 | `docs/CONVENTIONS.md`, PR template; PROGRESS/BLOCKED/register-status routine |
| 12 | S00 | live | 2026-10-20 | pnpm workspace, Next.js 16 App Router + TypeScript strict + Tailwind 4; Bengali status page at `/status` |
| 17 | S00 | live | 2026-10-20 | CI: lint, type-check, vitest, build, Lighthouse budget (`lighthouserc.json`), image build; green `main` deploys |
| 13 | S00 | merged | 2026-10-20 | `packages/db`: 333 models across all 28 stages, `storeId` on every store table (exceptions listed and guarded by a test), settings, vault, roles; migration applies to PostgreSQL 17 with no drift (CI `db` job) |
| 603 | S00 | merged | 2026-10-20 | index pack in the schema (category page, variant by colour/size, order by phone, history, list filters, style hierarchy), `pg_trgm` GIN indexes, 4 report materialized views |
| 494 | S00 | merged | 2026-10-20 | `tools/hardcode-guard.mjs` + rules in `tools/hardcode-guard.json`, first CI step: secrets, owner data (brand, domain, phones, e-mails), ৳ amounts, business numbers, visible JSX text; opt-out only with a written reason |
| 493 | S00 | merged | 2026-10-20 | `packages/vault`: envelope encryption (server master key → HKDF → wrapped data keys → AES-256-GCM per secret, bound to its name and store), every read logged, revoke without delete, data-key and master-key rotation; tested on PostgreSQL in CI. The Keys & connections page comes with PR 500 |
| 491 | S00 | merged | 2026-10-20 | `packages/settings`: every setting is declared once (key, type, default, validation, who may change it, Bengali/English label); `pnpm --filter @extas/settings sync` writes the declarations to the database, idempotent behind a lock; deploy runs schema migrations + sync before the new colour starts |
| 492 | S00 | merged | 2026-10-20 | two-tier resolver: store value → installation value → declared default, cached in memory and refreshed when any setting changes (works through PgBouncer); the status page reads its language and time zone through it |
| 496 | S00 | merged | 2026-10-20 | settings changes are validated, versioned and logged (who, when, old → new); an old value is never deleted |
| 510 | S00 | merged | 2026-10-20 | reset to default: a setting goes back to the level above it (store → installation → declared default), logged like any change. Read-only `/api/admin/settings` lists keys, effective values and their source (never owner data or vault entries); the admin login guarding it comes with PR 15/16 |
| 18 | S00 | merged | 2026-10-20 | `packages/adapters`: every integration is one adapter with mock / sandbox / live, chosen per store or installation from its connection row; the Test button records each run; a connection leaves mock only after a passing test (audited); keys come from the vault, cached briefly, never shown in a message. Storage adapter: local disk (the default, on the media volume), Azure Blob, S3-compatible — tested against Azurite and an S3 server in CI |
| 15 | S00 | merged | 2026-10-20 | `packages/auth`: staff login (e-mail + password, scrypt hash, wrong-try pause, login alerts), customer password login per store; opaque session tokens stored hashed in httpOnly `__Host-` cookies, idle and total time limits, device list, "log out everywhere"; 2FA by authenticator app (seed in the vault, owner setting, default off); every rule a `security.*` setting; first owner set up on the server (`auth create-owner`), no owner data in the repo. SMS code on a new device comes with PR 130 |
| 16 | S00 | merged | 2026-10-20 | permission check on every admin action on the server (`guardAdmin` + the auth functions themselves), per store or for every store; `/api/admin/settings` now needs `settings.read`; changes to staff and roles written to the append-only audit log (who, when, from where) |
| 495 | S00 | merged | 2026-10-20 | role builder: permission catalogue in code, roles as data; seeded owner role always holds every permission and cannot be archived or stripped; nobody grants more than they hold; the last owner cannot be paused or removed; roles archived, never deleted; admin API under `/api/admin/roles`, `/staff`, `/permissions` (screens come with the admin shell) |
| 509 | S00 | merged | 2026-10-20 | "My own data" register as data (`packages/settings/src/owner-data.ts`): owner settings (store name, logo, slogan, contact, legal, social, bank/wallet, every money setting and owner decision — no default), 5 key prefixes, 23 tables (vault, Dhaka area list, accounts, people, customers, orders), 2 columns, all media; mirrored into OwnerDataEntry on every settings sync. CI owner-data check (`pnpm --filter @extas/seed owner-data:check`) + installation export/import that leaves all of it out and refuses on any owner value |
| 508 | S00 | merged | 2026-10-20 | general default pack (`packages/seed/data/default-pack.json`): garment types, 7 categories (hidden), 3 delivery bands (off, no charge), 14 SMS/WhatsApp/e-mail templates (Bengali + English, 2 SMS + 1 WhatsApp on, later steps off); policy, AI and theme settings in the registry; money and COD left empty for the owner; add-only, re-run changes nothing |
| 14 | S00 | merged | 2026-10-20 | sample catalogue (`pnpm --filter @extas/seed sample`): the demo's 17 products, 17 colours, 10 sizes, 227 variants with stock, 7 size charts, collections, tags and one demo order, all in a "Sample" store with `storeId`; sample names, +88010 phone, example.com e-mail, demo sample prices; second run changes nothing (CI) |
| 500 | S00 | merged | 2026-10-20 | Keys & connections page `/admin/integrations` + admin sign-in (`/admin/login`, 2FA step) and frame, Bengali/English; connection list is data (`packages/adapters/src/catalogue.ts`, rows without an adapter shown "not connected"); save → vault → test → leaves mock only on a pass; remove = vault revoke, nothing deleted; every step audited, a saved key is never shown again |
| 22 | S01 | merged | 2026-10-20 | `@extas/media` image pipeline (sharp): the original archived byte for byte; 5 sizes thumb 160 · card 400 · card2x 800 · main 1200 · zoom 2000 at 4:5 (contain on the background colour, never enlarged), each AVIF + WebP + JPEG; quality 78 (75–80), sizes, ratio, formats and limits in settings (`media.*`, registry v6); dominant colour stored; names `media/s<store>/o/…` and `…/r/<asset>/<slug>-<size>.<hash>.<ext>`; upload checks (type, bytes, min width) with stable codes; job functions `media.render` / `media.regenerate` ready for the BullMQ image worker (PR 6) — until then inline after the answer (`media.processing.mode`). **Updated 20 Oct 2026 (follow-up):** without a media volume (`EXTAS_MEDIA_DIR`) and Blob/S3 the storage mock is now one in-memory store per provider for the whole process (it was a new, empty store per connection lookup, so an uploaded original could not be read back and no size was made — the colour box only); the app logs once when it runs on the mock |
| 23 | S01 | merged | 2026-10-20 | watermark only on the download copy (`/api/media/<id>/download`, attachment, no-store, noindex), made once from the main JPEG and kept; storefront files stay clean; text = `media.watermark.text` (owner data) else the store name; position, opacity, size in settings; Latin + Bengali fonts in the image |
| 24 | S01 | merged | 2026-10-20 | `<ResponsiveImage>` (`apps/web/src/components/media/`) + `pictureSources`: `<picture>` AVIF → WebP → JPEG, phone 400/800 and larger screens 800/1200 (`media.image.slots`), zoom 2000 only on a larger screen, width/height always set, dominant-colour box, `priority` = eager + high, the rest lazy; files served at `/media/<key>` (long cache) or from `media.publicBaseUrl`; originals never served. Zoom viewer UI comes with the PDP (S02) |
| 25 | S01 | merged | 2026-10-20 | photo minimum: at least 4 photos with FRONT, BACK, DETAIL, ON_MODEL (`media.photos.*`, optional front per colour); `photoSetStatus` / `requirePhotoSet` (code PHOTOS_MISSING) for the publish checks (PR 26, 35); product photos API `/api/admin/media/products/<id>` (attach, detach = archived link) |
| 37 | S01 | merged | 2026-10-20 | media library on the storage adapter: search (words, kind, folder, tag, used/unused, archived), reuse by checksum, edit alt/folder/tags, "where used" over 39 media fields + settings; orphan cleanup = list after `media.orphans.graceDays` + an explicit, logged admin archive with a reason; archive refused while in use; restorable; nothing is removed from storage (permanent delete not built — BLOCKED 8); regenerate all sizes after a settings change; permissions media.read / upload / manage; admin API under `/api/admin/media` (screens come with the admin shell) |
| 19 | S01 | merged | 2026-10-20 | `packages/catalogue`: product / variant / colour / size model on the existing tables; the ERP SKU is the key (pattern `catalogue.skuPattern`, unique per store, never changed, a retired SKU never reused, one variant per colour × size); a variant's colour joins the product by itself; sale and compare-at price need `catalogue.prices` and every change writes PriceHistory; product summary (in stock, "from" price) kept on the product and its listings; admin API `/api/admin/catalogue/products`, `/variants` (screens: PR 21) |
| 20 | S01 | merged | 2026-10-20 | category tree with sub-categories (depth `catalogue.categoryMaxDepth`, no loops, reserved first words `catalogue.reservedSlugs`), garment type per category inherited by sub-categories, garment types with measurement fields; archive only when empty; a changed category link forwards (301); `/api/admin/catalogue/categories`, `/garment-types` |
| 30 | S01 | merged | 2026-10-20 | colour library: one stored hex (#RRGGBB) with luminance, name dictionary (English, Bengali, synonyms; a name names one colour), family from `catalogue.colourFamilies`, "similar shade" note (`catalogue.colourSimilarDistance`), true-colour photo per colour and per product colour; archived, never deleted; `/api/admin/catalogue/colours` |
| 31 | S01 | merged | 2026-10-20 | structured fabric and care: fibres with shares adding up to 100, construction, care instructions and features — each from an owner-editable bilingual dictionary setting; GSM optional (never invented); plain product facts in en/bn for the page and the AI (`/products/:id/facts`); `/api/admin/catalogue/fabrics` |
| 590 | S01 | merged | 2026-10-20 | naming and links: real brand field (own label = the store's own-label brand, else the store name setting); per product name, link, SEO title and description (en/bn), feed title, brand; shop-wide templates `naming.*` with {brand} {name} {style} {type} {cat} {colour} {colours} {price} {fit} {shop}; a changed link forwards (`naming.redirectStatusCode`, default 301) with no chains, a reused link stops forwarding; every rename kept (ProductRename) with a before/after orders report (visits come with analytics, S11); "other brand" note off by default; template apply and bulk rename with preview + hash; manual old links; `/api/admin/catalogue/naming/*` (screens: PR 21) |
| 21 | S01 | merged | 2026-10-20 | product admin screens (`/admin/products`, `/new`, `/[id]`): list with search (name, colour, SKU), status and category chips, counters, issue chips and pages (`catalogue.admin.*`); create; edit basics, category, fabric, style, size chart (read only), descriptions, care, link and Google fields (PR 590 naming, template placeholders, Google preview), colours (add from the library or new), sizes, SKU × price × stock grid (prices only with `catalogue.prices`, never filled in for the owner; SKU suggestion `catalogue.skuSuggestion`), photo slots via `/api/admin/media` and `<ResponsiveImage>`; one save runs the services in order (`/products/:id/form`); bulk publish, unpublish, recheck, archive, restore (`/products/bulk`, at most `catalogue.bulk.maxProducts`, nothing deleted); Bengali and English; phone matches the demo (`docs/qa/screenshots/pr-21/`) |
| 26 | S01 | merged | 2026-10-20 | upload-time validation block: photos (PR 25 minimum, front per colour), size chart, fabric notes, prices, SKUs and the rest are checks in `catalogue.publish.checks` (on/off, owner-editable); each failing check is named in Bengali and English on the edit page, the list and the queue; `/products/:id/readiness` |
| 29 | S01 | merged | 2026-10-20 | product health score 0–100 from the checks (weights `catalogue.health.weights`, bands `catalogue.health.bands`), shown on the list, the edit page ("ready to go live?") and the queue; kept on the product and refreshed by recheck |
| 35 | S01 | merged | 2026-10-20 | publish queue (`/admin/products/queue`, `/api/admin/catalogue/publish-queue`): nothing goes live until every switched-on check passes — publish refuses with `CHECKLIST_FAILED` and the missing checks, on its own and in bulk; new permission `catalogue.publish`; waiting / ready filters with a Fix link per product |
| 27 | S01 | merged | 2026-10-20 | size charts per garment type and fit (`catalogue.fits`, `catalogue.sizeCharts.*`): measurements stored in inches, shown in cm too, ease, how-to-measure drawing per garment type; a chart is the default for a category + fit, a product can carry its own; resolve order product → category (up the tree) + fit → `fallbackFit`; coverage check against the product's ERP sizes; archived, never deleted (refused while in use); `/api/admin/catalogue/size-charts/*` |
| 28 | S01 | merged | 2026-10-20 | size chart admin `/admin/size-charts` (demo `82-admin-sizecharts`, phone 390 and desktop 1366 compared, `docs/qa/screenshots/pr-28/`): list, measurement table with "show cm", paste from Excel, add row (suggested from the neighbours), coverage warning, save / discard, copy for another fit, category defaults, products with their own chart ("back to auto"), "when you add a product" panel, archive / bring back; admin menu entry; Lighthouse page added. Photo spec-sheet reading (AI) comes with the AI stage |
| 32 | S01 | merged | 2026-10-20 | collections (manual or rule-based, seasonal with start/end and states upcoming / live / ended from `catalogue.collections.seasons`, link under `catalogue.collections.pathPrefix`, changed link forwards 301) and tags (bilingual, `catalogue.tags.maxPerProduct`); archived, never deleted; `/api/admin/catalogue/collections/*`, `/tags/*`, `/products/<id>/tags`. ~~Removing a link drops the join row only, with the full row in the audit log (join tables have no archivedAt)~~ **Updated 20 Oct 2026 (follow-up, hard rule 3):** taking a product out of a collection, a tag off a product or a size chart back to auto (PR 27) archives the link (`archivedAt`, migration `0002_archived_links`); linking again brings the same row back; every read ignores archived links |
| 34 | S01 | merged | 2026-10-20 | CSV export and import (`catalogue.csv.*`, permissions `catalogue.export` / `catalogue.import`): export has no cost, ERP or owner data and is logged as a job; import = preview with row-level errors and a hash, then apply of the same file; never deletes or archives; prices change only with `catalogue.prices` (PriceHistory kept); an exported file reads back unchanged; `/api/admin/catalogue/csv/export`, `/csv/import` (screen comes with PR 21) |
| 38 | S01 | merged | 2026-10-20 | "was" price source per category (none / MRP / price history / combo sum), honesty rule: shown only from a real, recorded price inside `catalogue.wasPrice.historyDays`, never invented, own-label MRP only with `mrpOwnLabel`; default `catalogue.wasPrice.defaultSource` empty = no "was" price anywhere until the owner decides (BLOCKED 10); changing a source needs `catalogue.prices`; `/api/admin/catalogue/was-price`, `/was-price/resolve`. Display on the storefront comes with S02 |
| 498 | S09 | merged | 2026-10-20 | generic ERP adapter on `@extas/adapters` (kind ERP, mock / sandbox / live, keys from the vault): one contract (`erp/contract.ts`: health, variants, stock, stock for one SKU; stable error codes AUTH, RATE_LIMITED, SERVER, TIMEOUT, NETWORK, …), an HTTP client for `docs/ERP-API-CONTRACT.md` (Bearer key, timeout, Retry-After, rows checked one by one), webhook signature check (HMAC-SHA256 of the raw body, age limit); `extasErp` adapter with a practice ERP (sample companies and warehouses, stock per SKU, switchable failures for tests); "Our ERP" on Keys & connections (address, key, webhook secret); a second ERP is one more adapter |
| 497 | S09 | merged | 2026-10-20 | ERP mode per store: our ERP · another ERP · no ERP (`erp.defaultMode`, store setting; a store's own choice on StoreErpMapping); another ERP needs its connection; "no ERP" keeps the mapping; audited; `PUT /api/admin/inventory/erp`. Address and keys on Keys & connections (vault); until they are in, the practice ERP — which never changes real stock (`erp.mock.stockEnabled` off) |
| 499 | S09 | merged | 2026-10-20 | ERP-absent guard: every ERP path has a written behaviour per state (no ERP · practice · not usable · connected) in `ERP_DEPENDENT_PATHS` — stock pull skips / fails visibly, checkout check uses the shop's copy, document pushes skip (`SKIPPED_NO_ERP`) or wait, company check refuses — proven by package and API tests |
| 194 | S09 | merged | 2026-10-20 | sync layer: per-call timeout, retry with exponential backoff and jitter (`erp.sync.*`: tries, base, cap, jitter), Retry-After honoured, AUTH and bad requests never retried, the checkout check never retried; error surface on ErpSyncRun (status, counts, one-line `CODE status: message (N tries)`) and ErpSyncState (`lastError`, cleared by the next good run), read by `GET /api/admin/inventory/erp` and later the PR 205 panel; a key never appears in an error |
| 195 | S09 | merged | 2026-10-20 | stock pull per SKU / colour / size into StockLevel (variant × location): incremental with `updatedSince` minus an overlap, paged, resumable after a failure or the page cap; older rows never overwrite newer; one StockMovement per change with an idempotency key from the ERP's state (re-reading never moves stock twice); unknown / retired SKUs and unlinked warehouses counted, never guessed; `inStock` and the product summary follow; checkout check (`liveStock`, one quick try, else the copy); job functions for the BullMQ worker (`inventory.erp.pullStock`, poll every `erp.sync.stockPollMinutes`); `GET /api/admin/inventory/stock` (one SKU in every location, or a product's colour × size grid) |
| 196 | S09 | merged | 2026-10-20 | company and warehouse mapping per store: the key decides the company — checked before every sync (a different company stops it with `COMPANY_MISMATCH`, nothing written), an empty mirror is filled from a real answer (audited), the practice company is shown, never saved; `Store.erpCompanyId` / StoreErpMapping stay owner data (owner-data check 0 findings); the store's ERP warehouse limits the pull; local warehouses link one-to-one to ERP warehouses; `/api/admin/inventory/erp/verify`, `/erp/warehouses` |
| 201 | S09 | merged | 2026-10-20 | warehouses and locations (warehouse, showroom, in transit, damaged): every warehouse gets the default locations from `inventory.locations.defaults` incl. a damaged bin; the last damaged bin cannot be archived or changed (`inventory.locations.requireDamagedBin`); damaged stock never sellable (refused by the settings schema), sellable kinds from `inventory.sellableLocationKinds`; archive refused while stock is there; nothing deleted; shared across the stores, so changes need the all-store `inventory.locations` permission; `/api/admin/inventory/warehouses/*`, `/locations/:id`; `inventory.locations.ensureDefaults` job |
| 33 | S01 | merged | 2026-10-20 | product import from a link (`/admin/products/import`, `/api/admin/catalogue/link-import`, permission `catalogue.import`): a supplier or brand page is read through the new page reader adapter (`pageReader`, Keys & connections; MOCK sample page until switched on, A1.3) with every limit in `catalogue.linkImport.*` (allowed sites, page size, time, redirects, photos); private and local addresses refused on every hop; JSON-LD / Open Graph / title facts; brand, category, fabric and colours matched to the owner's lists by plain rules (AI only when `ai.enabled` and connected, else noted); the preview is editable and makes exactly one DRAFT — never published, a price on the page is shown only and never copied, photos are not copied; every read is a job with an audit entry |
| 36 | S01 | merged | 2026-10-20 | ghost archive: a product that was once live keeps its page as out of stock (archived, unpublished or sold out) with alternatives from its category (`catalogue.ghost.alternatives`; page state `productPageState`, the storefront page comes with S02/S03); back-in-stock requests by phone or e-mail (`catalogue.ghost.interest.*`, public `/api/back-in-stock`, one open request per contact, per-day limit, contact never in the answer or the audit log); admin `/admin/products/back-in-stock` with counts for `catalogue.read` and contacts behind the new permission `catalogue.interest`; mark told / out of the list / back, nothing deleted; BackInStockRequest is in the owner-data register. Sending the message comes with the notification templates |
| 39 | S01 | merged | 2026-10-20 | product audit report (`/admin/products/audit`, `/api/admin/catalogue/audit`): every incomplete product with its failing checks, live-but-blocked first, filters by check and status, counts and average health; a "Fix" link per check opens the right section of the edit page (or the size chart page); stale health is rechecked in batches (`catalogue.audit.staleDays`, `catalogue.audit.recheckMax`), "check all again" carries on page by page; phone and desktop screenshots `docs/qa/screenshots/pr-39/` |
| 197 | S09 | merged | 2026-10-20 | global reservation on the one shared stock pool (A4.4): a cart hold counts against the pool of every store at once, so two stores can never sell the same last piece; `holdCart` / `releaseCart` / `convertCart` / `releaseOrderHolds`; the hold is local and never pushed to the ERP; `available = onHand − reserved` kept per pool; hold length from `inventory.reservation.holdMinutes` / `holdMinutesSignedIn` (Bhandari B03: 15 / 20), converted holds kept `convertedHoldHours`; `holdSummary` on the PR 205 panel. Storefront and checkout callers arrive with S04 |
| 198 | S09 | merged | 2026-10-20 | row locking: `SELECT … FOR UPDATE` on the StockLevel rows in id order (no deadlock between two carts), retried `inventory.reservation.lockRetries` times on a lock conflict; `OUT_OF_STOCK` names the short SKUs; abandoned carts released after `abandonMinutes`, expired holds swept every `sweepSeconds` in batches (`inventory.reservations.sweep` job); handed-over orders release their holds; DB tests with two carts racing for the last piece |
| 199 | S09 | merged | 2026-10-20 | order push as a business document (sales order: lines, customer, address, payment method), never journal lines — `assertNoJournal` refuses any document carrying debit/credit lines; transactional outbox (ErpPush written in the same transaction as the order change), relay with backoff and a dead state after `erp.push.maxAttempts` tries (backoff `erp.push.backoffBaseSeconds` to `backoffMaxSeconds`); status changes pushed as their own documents; no-ERP stores mark SKIPPED_NO_ERP (ERP-absent guard); `/api/admin/inventory/pushes`, `/pushes/retry` (`inventory.sync`) |
| 200 | S09 | merged | 2026-10-20 | idempotency on every ERP push: deterministic key from store, order, document type and a canonical hash of the body; the same change twice is one row and one ERP call, the ERP gets the key as its idempotency header (mock and live); a retried document never makes a second stock movement; DB tests for double enqueue, relay crash between send and mark, and retry after DEAD |
| 202 | S09 | merged | 2026-10-20 | low-stock alerts per variant on the shared sellable number (all stores, minus checkout holds): threshold `inventory.lowStock.defaultThreshold` (2) with per-SKU overrides `skuThresholds`, on/off `inventory.lowStock.enabled`, re-checked every `sweepMinutes` and after each stock pull; a variant raises once and clears when restocked; list on the stock page and `/api/admin/inventory/low-stock`. Sending the alert by message waits for the notification stage; who receives it is BLOCKED 16 |
| 203 | S09 | merged | 2026-10-20 | stock audit by barcode or SKU (`/admin/stock/counts`, permission `inventory.audit`): one open count per location, scan + quantity (Enter keeps the field ready for a scanner), unknown codes kept, "compare with the ERP" freezes the expected numbers, every differing line needs a reason from `inventory.audit.reasons` (`requireReason`), limits `maxLines` / `maxQuantityPerScan`; finished counts are a report only — the ERP's stock is never changed (BLOCKED 14); differing lines shown first; cancel keeps the record; phone and desktop screenshots in `docs/qa/screenshots/pr-205/` |
| 204 | S09 | merged | 2026-10-20 | publish queue driven by real ERP stock: new check `sellableStock` (stock in a sellable location from the ERP mirror) in `catalogue.publish.checks`, off by default for saved checklists (BLOCKED 15); products re-checked after each stock pull (`recheckProductsForStock`); the stock page lists queued products with their real stock and "find new styles in the ERP" (`/api/admin/inventory/publish-queue`, `/erp/styles`) |
| 205 | S09 | merged | 2026-10-20 | sync health panel `/admin/stock` (`inventory.read`; buttons `inventory.sync`): verdict (ok · practice · late · failing · down · off) from `syncHealth`, last stock pull and its age against `erp.sync.stockPollMinutes`, ERP connection and mode, documents waiting / failed / dead with "send again", pieces held in checkout, low stock, the publish queue and the recent runs with each error in words; never calls the ERP itself, so it opens when the ERP is down; `/api/admin/inventory/health`; nav group "inventory"; phone and desktop screenshots with Bengali captions in `docs/qa/screenshots/pr-205/`; Lighthouse budget covers the three stock pages |
| 206 | S09 | merged | 2026-10-20 | manual re-sync: "sync all stock now" and one product (by SKU or product), both `inventory.sync`, recorded as runs (`stock.resync`, `stock.resyncProduct`); skipped with a reason on the practice ERP or with no ERP; `/api/admin/inventory/resync` |
| 207 | S09 | merged | 2026-10-20 | stock movement report `/admin/stock/movements` (range from `inventory.report.defaultDays`, 30, in the store's time zone; optional SKU): per SKU and location opening, in, out, closing, and a mark where the ledger does not add up to the stock now; reconcile with the ERP (`reconcileWithErp`, kinds MISSING_IN_SHOP · MISSING_IN_ERP · ON_HAND_DIFFERS · RESERVED_DIFFERS) recorded as a run with its summary; `/api/admin/inventory/movements`, `/reconcile`. Registry v11 adds `inventory.report.defaultDays`; no schema change, no new migration |
| 208 | S10 | merged | 2026-10-20 | rules engine `@extas/rules`: one rule = kind (delivery · exchange · setTier · discount · festive · payment · policy · fulfilment), typed params (int, money, percent, hours, text, datetime, bool), scope (applies to / except), conditions, actions, priority, stackable, active window and status (DRAFT · ACTIVE · PAUSED · ENDED); `evaluate` / `quote` is pure and deterministic, a broken rule is skipped and reported, never guessed; nothing deleted (rules archived, every version kept); jobs `rules.endExpired`, `rules.checkConflicts` for the BullMQ worker; schema: SmartRule draft / params / scope / text / placements / owner-OK columns (migration `0003_smart_rules`); permissions `rules.read`, `rules.write`, `rules.publish`, `rules.approve`; settings registry v13 (`packages/settings/src/registry-rules.ts`, 16 keys); CLI `rules sample` loads 7 made-up sample rules and 3 notices, money rules as drafts |
| 209 | S10 | merged | 2026-10-20 | rule admin `/admin/rules` matched to demo V12.1 (`81-admin-rules.js`) on phone and desktop: list with topic chips and counts, archived toggle, the conflict banner, cards, the editor (status segment, short text with the limit from `rules.text.shortMaxChars`, full text `fullMaxChars`, "Customers see" live line in both languages, extra text slots, params by type, when it runs, applies to / except, shown on), new rule from 11 templates or blank, starter rules as drafts, preview of what changes where (`POST /:id/preview`), publish with the owner's OK for money changes (`OWNER_OK_REQUIRED` keeps it a draft), discard, archive; AI box present but off (mock); catch-all API `/api/admin/rules/[[...path]]`; nav group "rules"; Lighthouse budget covers `/admin/rules` and `/admin/rules/notices`; screenshots `docs/qa/screenshots/pr-209/` |
| 210 | S10 | merged | 2026-10-20 | delivery rules: charge per band, free-delivery threshold and campaigns as rule params; the sample rule ships as a draft that needs the owner's OK, the default pack's bands stay off with no charge (owner enters charges in the backend; not a BLOCKED item); `quoteCart` returns the delivery line and the "spend X more for free delivery" progress text from the rule |
| 211 | S10 | merged | 2026-10-20 | exchange rules: window (`policy.exchange.windowHours`, 72 by default), who pays, what qualifies, per-item limit; default text "Exchange within {windowHours} hours for size or fault" / Bengali comes from the rule (CN-009); `exchangeTermsFor` for product, bag and account pages |
| 212 | S10 | merged | 2026-10-20 | set / combo tiers (any 2 for X, any 3 for Y): best grouping of the bag's units, each group's separate prices and set price kept on the quote (`separateMinor`, `setMinor`), "add 1 more" and "unlocked" texts from the rule's slots |
| 213 | S10 | merged | 2026-10-20 | discounts and coupons with the honest "was" price (CN-009): one item shows its real MRP (`compareAtMinor`) only when it is higher; with no MRP, the lowest real price in `rules.discount.wasLookbackDays` and only for an offer with an end date; a set shows the sum of its pieces' separate prices; never invented (`discountWasPrice`, `setWasPrice`, `discountWasFor`, `quoteCart.setWas`); the switch `rules.discount.showWasPrice` ships off; `rules.discount.maxPercentOff` cap; coupons (`rules.coupons.codePattern`) start off, switching one on needs `rules.approve`, archived not deleted; `/api/admin/rules/coupons`, `/coupons/:id` |
| 214 | S10 | merged | 2026-10-20 | festive / seasonal rules with cut-off dates in the store's time zone: the active window decides, the cut-off line ("order by … for delivery before Eid") comes from the rule, expired rules end by the `rules.endExpired` job (kept, not deleted) |
| 215 | S10 | merged | 2026-10-20 | rule text everywhere reads from the rule: `{token}` text filled from the rule's params (hand-written numbers flagged `HAND_WRITTEN_NUMBER`), `ruleTextsFor` / `ruleTextFor` per placement (`rules.placements`: product, bag, checkout, account, messages, assistant, faq, footer, announcement), cached `rules.public.cacheSeconds`; plain storefront pieces `RuleText`, `NoticeBar`, `RulePopup` in `apps/web/src/components/rules/` and safe server helpers in `apps/web/src/lib/rules-public.ts` for S02 to place and style |
| 216 | S10 | merged | 2026-10-20 | notices and pop-ups `/admin/rules/notices`: bar, in-page note, pop-up; text can quote a rule (`{exchange.windowHours}`) with a live preview; placement, position, priority, window, button; pop-ups never on arrival (`notices.popup.minDelaySeconds`, `minScrollPercent`), capped (`maxPerVisit`), none on a search visitor's first screen (`searchHosts`), bars capped `notices.bar.maxShown`; every notice starts off; the pop-up's visible-time timer pauses when the tab is hidden and resumes after; `/api/admin/rules/notices`, `/notices/:id` |
| 217 | S10 | merged | 2026-10-20 | conflict detection: same slot, stacking, a text that drifted from its rule (FAQ says 7 days, rule says 72 hours) and a setting that disagrees; checked on publish (`rules.conflicts.checkOnPublish`) and by the job; the banner offers "fix everywhere" (rewrites the drifted text from the rule), keep the order, or acknowledge; resolution order = priority, then newer; `/api/admin/rules/conflicts`, `/conflicts/:id` |
| 218 | S10 | merged | 2026-10-20 | rule history: every publish is a version with who, when, the change note and a word-by-word change list (money changes marked); paged by `rules.history.pageSize`; restoring an old version makes it a draft (publish to use it); `/api/admin/rules/:id/history` |
| 219 | S10 | merged | 2026-10-20 | rule simulation: "what would past orders have cost under this draft" over `rules.simulation.defaultDays`, at most `rules.simulation.maxOrders` orders, with the count changed, the money difference and orders that cannot be priced (no area, charge not set yet); results kept; `/api/admin/rules/:id/simulate`. Tests: rules 41 pure + 18 PostgreSQL, web 10 screen-model + 3 API on PostgreSQL |

> **CN-008 · 20 Oct 2026 (owner desktop review of V12, 03:54–04:23).** 44 items (home H1–H14, category C1–C6, product P1–P8, drawer B1–B3, bag G1–G3, checkout K1–K11 incl. the BD phone normaliser and Polo Duo different-colour rule), 7 invoice templates, 12 new admin screens, admin audit fixes. Built into demo **V12.1** (`docs/demo/EXTAS-demo-V12.1.html`), which is now the UI truth. Every new look is a backend option with the old one kept. Details: `docs/owner/ROUND15.md` Note 51, `docs/qa/QA-REPORT-V12B.md` (44/44 pass), `docs/qa/ADMIN-AUDIT.md`, lesson for `phoneNormalizeBD` in `docs/agents/lessons/ALL.md`. No new PR numbers: scope lands on the existing S02/S03/S04/S05/S08/S14/S16/S20/S22 PRs.

> **CN-010 · 20 Oct 2026 12:47 (owner, Note 53).** (1) The home address of new.extas.com.bd shows the **store** from now on: everything built so far, and a "শিগগির আসছে" (coming soon) page for anything not built yet; the progress page moves to `/status` only (it is already there). (2) S02 storefront (home, category, product page) runs **now**, beside the rest of the build, at most 3 agents at once; each page goes live on new.extas.com.bd as soon as it is merged, so the owner can see it in the browser. Design: the V12.1 demo exactly. (3) The owner's admin account is opened on the server (e-mail from chat, never committed; first password made on the server), with simple Bengali steps for reading the password. No new PR numbers: (1) lands on PR 40 (store shell) with a coming-soon page under the routing table, (2) is the S02 order, (3) is PR 15 (staff login, first owner) through `.github/workflows/owner-account.yml`.

> **CN-009 · 20 Oct 2026 12:22 (owner answers, Note 52).** Watermark = www.extas.com.bd · unused photos never deleted (archive) · was-price = real MRP where it exists, combos = sum of separate prices, never invented · order e-mail counting, the WhatsApp slot and the "100% original" line are backend settings the owner sets · title brand "EXTAS" · returns row "Exchange within 72 hours for size or fault" · VAT after launch · blog: no "tested by us" until a care-lab person exists, byline "EXTAS Journal" until expert names, starts on go-live day · defaults: invoice design 3 (all 7 selectable), all 11 logo styles selectable, header "main categories + More", drawer style B (A kept), one bag "You may also like" default with the rest as options · owner data (delivery charges, free-delivery limit, COD, exchange limit, AI budget) are entered later in the backend, never blockers. The admin login e-mail is owner data: set on the server only, never committed.

> **CN-011 · 20 Oct 2026 (owner: one README a developer can read in five years).** (Filed as CN-011 because CN-010 is held by owner Note 53 in open GitHub PR #18.) (1) **README is the live, detailed front page** (`README.md`: status dashboard of all 28 stages, how it is built, local setup, the server, folder structure, features by area, PR log, change notes, docs map, notes for a future developer; `docs/README.md` indexes every docs file). After **every** merged PR the build agent updates the dashboard, adds the PR log row and updates the feature section of that area. (2) **Docs on the server:** every deploy copies the repo's `docs/` (with `README.md`, `BLUEPRINT.md`, `MASTER-REGISTER.md`) to the server, one way (repo → server), so the admin's "PR register" and "Blueprint & files" tabs (PR 594) always show the latest. (3) **Docs in backups:** every backup (PR 8 / 395 / 507; Azure Blob and Google Drive) carries a dated docs bundle — `README.md`, `docs/BLUEPRINT.md`, `docs/MASTER-REGISTER.md` and the whole `docs/` folder, with the commit hash — so a restore brings back the documentation of that exact version. (4) **Organisation standard, kept in every PR:** standard code style (lint and format checks), tests beside the code, clear names, a short header comment on each package saying what it is for, `docs/` kept current, and the blueprint and register changed only through CN notes. No new PR numbers: (1) is the S00 routine of PR 11, (2) lands on PR 4/17 (`deploy.yml`, `infra/deploy/deploy.sh`) and PR 594, (3) on PR 8, 395 and 507, (4) on PR 11 and 17.

> **CN-012 · 20 Oct 2026 (owner Note 54: hero campaigns and checkout/bag/footer polish).** (1) **Hero & campaigns** (admin): the owner sets up a campaign (Winter, Puja, Eid, Summer, Hot deals or any offer) with dates, picks one of **8–10 ready hero templates** (several layouts and colour moods), links a collection so the hero's products swap with the campaign, and can design a new hero inside the backend (headline, subline, colours, image, button) and save it as a template; scheduled campaigns switch by date, with the launch default as fallback. (2) **Checkout texts and field order are settings** (heading "Delivery details", labels, the Bengali address hint, the exchange-for-size link, the try-on line), as are the bag-panel style (default and B), the recommendation fill rule (as many as fit, ≥12 px under the buttons, then "+N more"), payment options (COD open, Mobile/Card/Online payment on click) and the logo choice. (3) **Phone rule:** text changes reach the phone; a design change reaches the phone only after the device gate and phone pixel diff prove 0 side effects. No new PR numbers: (1) lands on PR 41/43 (home hero) and PR 597 (snapshots); (2) on the checkout and bag PRs of S03/S04 and PR 491 settings.

> **CN-013 · 20 Oct 2026 (owner Note 55: think beyond the ask).** (1) The **real-life journey simulation** (50 orders, from "I need a polo" to 3 days after delivery; plan `docs/qa/SIMULATION-PLAN.md`, research `docs/qa/SIM-RESEARCH.md`) is a **go-live gate**: it runs on the demo now and again on new.extas.com.bd before real orders; every problem it finds is fixed and listed in its report. (2) **Open boundary, every PR and stage:** each finding or feature gets the fix, prevention, a review of the core decision and growth ideas (easier, smarter, more profitable), recorded in the stage report; ideas on money, prices, COD or blocking are proposals for the owner (hard rule 6). No new PR numbers: (1) lands on the S19 go-live checklist (PR 585–587) and Appendix C; (2) on the stage-report routine (A1.1).

> **CN-014 · 20 Oct 2026 (owner: add the 8 best simulation ideas as optional settings; a Bengali guide per admin section).** (1) Eight ideas from `docs/qa/SIMULATION-PLAN.md` §7 are added. Each is **off by default**, has its own on/off switch, and every number in it can be edited. Each lives in the admin section it belongs to; no new top-level menu. (a) **WhatsApp self-confirm** (idea 5): the reply 1/2/3 texts, the hours to wait before the call queue, and which orders it applies to. Section: Orders → Confirmation. Scope on PR 148, 292 and 545. (b) **Exact-amount line** (idea 10) on the sticker, SMS and tracking page, with the text and the report link. Section: Messages + Shipping labels. Scope on PR 179, 148 and 135. (c) **Packing proof photo** (idea 13): required or optional, and how many days to keep it. Section: Fulfilment. Scope on PR 182. (d) **RTO cost book** (idea 8): cost per RTO (courier charge, packaging, staff), by district, campaign, product, courier and reason. Section: Reports. Scope on PR 164, 192 and 267. (e) **One-trip size swap** (idea 17): the swap charge and the eligible areas. Section: Exchanges. Scope on PR 190. (f) **Day-1 WhatsApp care** (idea 15): the send hour, the text, and the Day-3 review request. Section: Messages. Scope on PR 295, 289 and 505. (g) **Eid order-by dates per district** (idea 19): the dates, the bands, the banner text, and pre-order with an advance amount. Section: Campaigns. Scope on PR 193 and 214. (h) **Gift mode** (idea 22): receiver name and phone, hide prices on the invoice, a gift note, and a "deliver on or after" date. Section: Checkout settings. This is the next free PR in S04. All 24 ideas stay listed in the plan, and the other 16 wait for the owner. (2) **Admin section guide (Bengali, a blueprint).** `docs/admin-guide/` holds one Bengali file per admin section (plain চলতি Bengali, Western digits) and an index. Each file says what the section is for, every menu and tab in it, what can be done there, every switch and number with its default, and what happens next. It is shown in the admin too, as a "এই সেকশনে কী করা যায়" help link on each section. **Every PR that adds or changes an admin screen updates its guide in the same PR** (same rule as README, CN-011). No other new PR numbers: (2) is the S00 routine of PR 11 plus PR 594's "Blueprint & files" tab.

> **CN-015 · 20 Oct 2026 (owner: customer problems are found automatically, a "Running problems" list in the admin and at the top of README).** (1) **Detect from real visits.** On every page and step of the journey (landing → product → bag → checkout → tracking → account), a small privacy-safe browser probe and server checks record: script errors, failed or slow requests, pages that fail to load, payment and API failures, stuck or repeated form errors (for example the phone field failing three times), "rage" clicks and dead clicks, checkout abandoned right after an error, slow loads by device and network type, and broken images. Each record carries the device, browser, network, area (district only) and journey step. **No name, phone, address or payment detail is ever recorded.** Visitor ids are random. (2) **Group and judge.** The backend groups records with the same cause into one **problem**, counts the visitors and orders it hit, estimates the lost sales, and marks it Urgent / Important / Can wait, with a plain Bengali summary of what went wrong, where and for whom. Short glitches that fixed themselves are kept too, under "short glitches". (3) **Status for each problem:** New · Fixing · Fixed (with how) · Could not fix (why) · Needs owner permission · Fixed, waiting for the owner's check before going live. (4) **Auto-fix:** when a fix touches no hard-rule item (money, prices, COD, blocking, deleting data) and needs no owner permission, the build agent fixes it through a normal PR (tests and gates, then merge), writes the note, and the problem moves to Fixed. Otherwise the problem goes to Needs owner permission. (5) **Where the owner sees it:** the admin **Site health → Customer problems** page (with the Server page, PR 423), which has a date view (today, yesterday, any day, trend) and a detail page for each problem; and the **top of README.md**, under "Running problems", with one line per open problem (date, short title, users hit, status) linking to `docs/problems/<id>.md` for details. Both are refreshed automatically by a scheduled workflow, with the problem data anonymised before it is written to GitHub. (6) **Sales link:** the weekly report says which problems most likely cost sales. No new PR numbers: it lands on S21 (PR 413–424, mainly PR 423 and the audit runner PR 570), PR 594 and the README routine (CN-011). Some parts are moved earlier: the probe and the problem list start as soon as the shop's checkout exists on new.extas.com.bd, so the simulation and staging tests feed it too.

> **CN-016 · 20 Oct 2026 (owner: nothing reaches the owner broken).** The owner found that after logging in, the admin on new.extas.com.bd showed "This page couldn't load". New gate: **after every deploy and every night**, a smoke test runs on the runner with Playwright against new.extas.com.bd. It signs in with a check account whose password lives only on the server, then visits every built storefront page and every built admin page, including the pages right after login. A page passes only when it loads, shows no error screen and no console error, and has no failed request. If any page fails, the deploy rolls back by itself and the fix comes before any new PR. Screenshots go to `docs/reports/smoke/latest/`, and the result is shown on the status page and in README. Every bug the owner finds gets a smoke check in the same fix PR. No new PR numbers: this lands on PR 4/17 (deploy) and Appendix C.

## The stage table

| # | Stage | PRs | Range | Status |
|---|---|---:|---|---|
| S0A | Server foundation | 12 | 1–10, 601, 604 | locked; **server spec filed 19 Oct 23:33** |
| S00 | Foundation — repo, CI, schema, auth, **settings framework** | 19 | 11–18, 491–496, 500, 508–510, 603 | locked |
| S01 | Catalog, media & images | 22 | 19–39, 590 | locked |
| S02 | Storefront | 58 | 40–88, 501, 503, 595–600, 602 | locked; UI in review |
| S03 | Combo & bundles | 22 | 89–104, 571–576 | locked; UI in review |
| S04 | Cart, checkout, accounts | 39 | 105–137, 558, 560, 561, 563, 565, 566 | locked; UI in review |
| S05 | Order management | 20 | 138–155, 541, 546 | locked |
| S06 | Fraud & location | 33 | 156–164, 502, 519–524, 540, 542–545, 549–557, 559, 562, 567 | **answered 18 Oct** |
| S07 | Payments & wallet | 10 | 165–174 | locked |
| S08 | Courier, returns, exchange | 22 | 175–193, 525–526, 564 | locked |
| S09 | Inventory & ERP sync | 17 | 194–207, 497–499 | locked |
| S10 | Smart Rules | 12 | 208–219 | locked |
| S11 | SEO engine | 22 | 220–238, 527, 586, 588 | **answered 18 Oct** |
| S12 | Content & blog | 22 | 239–253, 528–530, 547, 591–593 | **answered 18 Oct** |
| S13 | Marketing & ads | 35 | 254–283, 531–532, 548, 569, 589 | **answered 18 Oct** |
| S14 | CRM & customers | 24 | 284–303, 505, 533–535 | locked |
| S15 | AI 360 Control Room | 48 | 304–341, 506, 577–585 | locked |
| S16 | Finance, costs & reports | 18 | 342–355, 504, 536–537, 568 | **answered 18 Oct** |
| S17 | Multi-store | 24 | 356–377, 511–512 | settings open |
| S18 | Compliance, security, manual | 13 | 378–390 | settings open |
| S19 | Deploy, backup, go-live | 15 | 391–403, 507, 587 | locked |
| S20 | Fulfilment & documents | 9 | 404–412 | locked |
| S21 | Site Health & Audit | 14 | 413–424, 570, 594 | locked |
| S22 | Support (all-in-one) | 13 | 425–436, 538 | locked |
| S23 | Social & content studio | 7 | 437–443 | locked |
| S24 | Virtual Photoshoot Studio | 38 | 444–480, 539 | locked |
| S25 | Video & Campaign Creative Studio | 10 | 481–490 | locked |
| S26 | Installation, documentation & distribution | 6 | 513–518 | **parked** — handover pack |
| S27 | No-ERP stock module | parked | — | **parked** — handover pack; numbered when approved |
| | **Total** | **604** | | 598 active · 6 parked |

### How this reached 604

| Step | Change | Total |
|---|---|---:|
| Full stage-by-stage re-tally, reconciled exactly | baseline | 473 |
| 12 PRs re-filed into the stages that describe them | no change to the total | 473 |
| Scoped work landed: analytics 6, upload block 2, eye-toggles 2 | +10 | 483 |
| Approved: floating WhatsApp 2, sub-menu 2, rebuilt search 3 | +7 | 490 |
| Settings-driven instruction, approved 18 Oct | +28 | 518 |
| Decision round, 18 Oct — fraud/duplicate engine, blog, ads, per-style profit | +21 | 539 |
| Review of that round, 18 Oct — no automatic blocking, approval digest, AI learning | +9 | 548 |
| Delivery-zone correction, 18 Oct — three bands, national gazetteer, collision resolver | +6 | 554 |
| Phone-first recognition at checkout, 18 Oct | +3 | 557 |
| Parameter for Checkout — advance payment caught at checkout, 18 Oct | +5 | 562 |
| Never hold an order, courier charge correction, support explanation, 18 Oct | +5 | 567 |
| Geography analytics — product and category by district, geo ad guidance, 18 Oct | +2 | 569 |
| Checklist audit runner in the AI section, scheduled with Telegram reports (round 15, 19 Oct) | +1 | 570 |
| Combo deep work — auto colour-pairs, category/product/bag templates, set photos, ranking (round 15, 19 Oct) | +6 | 576 |
| Agent 360° profiles in the AI 360 Control Room (round 15, 19 Oct) | +1 | 577 |
| Agent appraisal reports + curriculum and certification (round 15, 19 Oct) | +2 | 579 |
| Model auto-suggest with free-model qualification (round 15, 19 Oct) | +1 | 580 |
| Seventh agent Tirondaj (ads) + strong agent memory (round 15, 19 Oct) | +2 | 582 |
| Chief agent (virtual CEO, chain of command) + Telegram identity and command routing (round 15, 19 Oct) | +2 | 584 |
| Continuous learning engine for the two power agents, Tirondaj and Doot (round 15, 19 Oct) | +1 | 585 |
| Google traffic plan — hash forwarder, WordPress migration, Bengali translation gate, Merchant Center feed (round 15, 19 Oct; review/GOOGLE-TRAFFIC-PLAN.md) | +4 | 589 |
| Product naming and URL control (owner, 19 Oct 12:04) | +1 | 590 |
| Blog content pipeline — 3–6 quality posts a day by agents (owner, 19 Oct 12:10–12:14) | +1 | 591 |
| Blog as a full section with our own ad placements (owner, 19 Oct 12:20) | +1 | 592 |
| Blog writing team — five author agents under Doot (owner, 19 Oct 12:22) | +1 | 593 |
| PR register inside the backend (owner, 19 Oct 14:59) | +1 | 594 |
| Page layout builder + side canvas (owner desktop review, 19 Oct 18:38) | +2 | 596 |
| Launch default — save and restore the whole shop look (owner, 19 Oct 19:53) | +1 | 597 |
| Site builder — every part of the site editable like WordPress/Elementor, with guardrails (owner, 19 Oct 21:23) | +1 | 598 |
| In-dashboard help and the handover user manual — no coder needed (owner, 19 Oct 22:14) | +1 | 599 |
| On-page edit mode with phone review and the AI checker (owner, 19 Oct 22:27–22:33) | +1 | 600 |
| Owner's server specification — NVMe boot unit, four-layer cache, database performance pack, hardware-aware profile (owner, 19 Oct 23:33; review/SERVER-SETUP-SPEC-OWNER.md; CN-001) | +4 | **604** |

**Owner answers, 19 Oct 11:39 (scope on existing PRs, no new numbers):** marketing consent = SMS tick on by default, **WhatsApp marketing tick separate and unticked** (PR 148/505); trial at delivery allowed — customer may try in front of the rider (setting, on; S08); Bengali pages get their own /bn/ URLs with hreflang for Google traffic (S11); barcodes internal/courier, no GS1 (S01); same size added twice → "already in bag" by default, **quantity +1 as a settings option** (S04); sliders keep auto-drift but snap after a manual drag (S02); admin shows customer phone numbers in full, every profile open and number copy is logged (S14; the address rule PR 561 is unchanged); Google Shopping BD → Merchant Center test after go-live; VAT/invoice details after launch with the accountant.

**Scope added to existing PRs, 19 Oct (round 15, no new PR numbers):**
- **PR 338 / 339 (analytics event layer + funnels)** — the owner's event list is now part of the layer's definition: search terms; WhatsApp clicks by page *and* by button; add-to-bag → purchased; direct purchase (Order Now); removed from bag, re-added, new adds; adds that came from an offer/combo/set; "All N colours" taps; Size chart taps; wishlist saves; logged-in vs guest on every event. Every event carries page type, product/category, and source button so each part can be read on its own.
- **Floating WhatsApp (the 2 PRs approved earlier)** — replaced by the **header WhatsApp icon on every page** (checkout: appears in the header only after the in-page help block scrolls away). The floating disc is **kept as a dashboard switch, off by default** (standing rule: nothing removed).
- **Home hero buttons** — labels, links, style and on/off of each button are dashboard settings (page builder, S02).
- **PR 148 / 505 (status notifications + template editor)** — the owner's default send rule: **SMS on order placed, SMS when the shop confirms/processes (courier booked), WhatsApp once when the shop processes — nothing from the shop after that** (the courier's own pickup SMS is the third message). Later-step messages exist as switches, off by default.
- **PR 550 / 551 (delivery bands + resolver)** — built into the demo 19 Oct from BD-AREA-MASTER.csv (generator `data/tools/make-gazetteer.py`); data fixes: Gazipur and Narayanganj district rows added, Dinajpur's Nawabganj upazila corrected to outside Dhaka, "Bogra" alias added, bare "Nawabganj" removed from Chapai Nawabganj. Delivery time shown in **hours** per band (24–48 inside, 48–72 outside), editable.
- **PR 90 (combo admin)** — owner, 19 Oct: combos get their **own section** in the dashboard (create/edit combo, its products, allowed colours and sizes, photos, price, offer, on/off, preview), built step-by-step for non-technical staff.
- **Combo deep work (round 15 notes 8–11)** — filed as **PR 571–576** in S03.
- **Invoice (PR 407 customer invoice + the invoice templates in S20)** — every word and block of the invoice editable from the dashboard (owner, 19 Oct).

**Scope added to existing PRs, 19 Oct 23:33 (owner server spec, CN-001; review/SERVER-SETUP-SPEC-OWNER.md; new PR 601–604):**
- **The filing** — the owner approved every point of the analysis at 23:33 and said: where two decisions conflict, take the best one. Four new PRs (601 NVMe boot unit and 604 hardware-aware profile in S0A, 603 database performance pack in S00, 602 four-layer cache in S02); the rest is dated scope on the PR lines below (PR 1, 3–10, 13, 18, 22, 24, 37, 72, 88, 234, 519). **Every server item is required before go-live** — the owner's "later" list (monitoring page, monthly speed measurement, report pre-computation) is not deferred; items that need the app schema are built with their stage and marked *pre-launch required*. **Build order inside S0A:** 1 record specs (PR 1) → 2 hardening and UFW (PR 3) → 3 NVMe boot unit (PR 601) → 4 data-disk LVM (PR 1/3) → 5 Docker (PR 4) → 6 hardware-aware profile (PR 604) → 7 Postgres, PgBouncer and Redis tuning (PR 5, 6) → 8 Caddy, Cloudflare and Origin certificate (PR 7) → 9 backup: Blob, Drive, WAL and the restore test (PR 8) → 10 monitoring and Telegram (PR 9) → 11 k6 baseline (PR 10). Then S00 indexes (PR 603) with the schema, S01 image pipeline (PR 22, 24, 37), S02 cache (PR 602).
- **PR 362 (per-store domain, certificate and Cloudflare routing)** — Cloudflare in front of all three domains: static files (images, CSS, JS, fonts) cached long with hashed names; category and product pages a few minutes (duration in settings); cart, checkout, account and admin never cached; instant purge on price, stock, setting or new product (PR 602); Brotli and gzip, HTTP/3, free SSL, bot and DDoS protection; Full (strict) with an Origin certificate (PR 7); keys in the vault (PR 493).
- **PR 395 / 507 (backup settings and restore drills)** — a **monthly automatic restore test** of both the Blob and the Drive backups, on a throwaway copy; result shown in the admin and sent to Telegram. Retention from settings. Restore defaults to Blob, Drive is the fallback, point in time selectable; production restore needs the typed confirmation and runs on staging first (PR 396).
- **PR 423 (site health page)** — becomes the plain-language **Server page**: CPU, RAM and disk; each service's RAM and CPU against its limit (PR 604 profile); NVMe status (PR 601); DB, Redis, app and Meilisearch up or down; cache hit % (PR 602); the slowest queries (PR 603); the last backup on Blob and on Drive and whether it succeeded (PR 8); CDN traffic; the monthly speed results (PR 234). Pre-launch required. *(V1 and the old 210-PR draft call this optimisation panel "PR-208"; that is the old numbering. Register PR 208 is the Smart Rules engine and is not changed by this filing.)*
- **Conflicts resolved by this filing** (blueprint V2.1, Resolved conflicts): Drive only → Blob + Drive; PM2 → Docker Compose stays; Nginx → Caddy stays; search index in Postgres → Meilisearch stays (pg_trgm for fraud matching); stock cached 15–30 s → display 15 s, live check with a row lock at bag and checkout; image ratio 3:4 or 4:5 → 4:5; 2 TB disk → OS 128 GB + 1 TB data disk; "later" items → all before go-live; port 22 restricted to the owner's IP → key-only SSH with fail2ban (the build agents connect from changing IPs).

**Scope added to existing PRs, 20 Oct (V2.1 final · 20 Oct — pre-code demo work finished; blueprint V2.1 final; no new PR numbers):**
- **PR 42 / 570 (slider engine, audit runner)** — the timing rules proven in TA-2 (530 checks, 0 fails; checklist L32/L33): separate pause flags for mouse, touch and keyboard; every pause has a tested resume path; sliders resume within about 100 ms after the mouse leaves, after a drag and after a sideways wheel; a vertical wheel is ignored by sliders; every row drags with the mouse and a click after a drag doesn't open the card; the toast holds on hover and focus; timers are cleared on route change; focus returns to the opener when a menu or panel closes; a cancelled pull-to-refresh resets. Phone gate 0/240, phone pixel diff 0 real changes.
- **PR 98 / 107 / 109 / 598 (bag, owner review 43.3–43.10, Batch B)** — bag title, Continue shopping, shimmer on FREE, "You save" in sale red, duplicate-size box, line titles, plain bag words (15 labels with Bengali), Shimmer control (14 + master; none under reduce-motion; Add to Bag shimmer off by default), tier box "Take 2 │ Take 3 │ Take 4" (desktop only; phone preview only). Owner decision pending: the suggested 4-piece prices (BAG_TIER_SEED) — blueprint Appendix B.4 #13.
- **PR 503 / 90 / 594 (admin language)** — English mode 0 Bengali across 206 admin routes; mixed-label dictionary fixed; documents in Blueprint & files shown exactly as written; combo-rule states Running / Off / Ended / Starts in English, Bengali in Bengali mode.
- **PR 45 / 61 (phone price rule)** — a currency sign and its number never split across lines (nowrap); fixed in the category banners.
- **Server admin pages in the demo (CN-001; sample numbers, labelled)** — `#/admin/server` → PR 423 / 601 / 603 / 604; `#/admin/cache` → PR 602; `#/admin/images` → PR 22 / 24 / 88; `#/admin/speed` → PR 234; `#/admin/integrations` ("Keys & connections") → PR 493 / 500; `#/admin/backup` now shows Blob + Drive → PR 8 / 395 / 507. Checks: 120 route/modal checks 0 fails + 19 flows.

**Scope added to existing PRs, 20 Oct 13:03 (owner, CN-011; no new PR numbers):**
- **PR 594 (PR register and Blueprint & files tabs)** — they read the server copy of the docs: every deploy copies `README.md` and the whole `docs/` folder to the server, one way (repo → server), stamped with the commit hash (`deploy.yml`, `infra/deploy/deploy.sh`); the tabs always show the version that is live.
- **PR 8 (nightly backup and restore)** — every backup carries a dated docs bundle (`README.md`, `docs/BLUEPRINT.md`, `docs/MASTER-REGISTER.md` and all of `docs/`, with the commit hash), so a restore brings back that version's documentation; the restore test checks the bundle comes back and its commit matches.
- **PR 395 / 507 (Google Drive backup, backup settings and restore drills)** — the same docs bundle goes into the Azure Blob and the Google Drive copies; the monthly restore drill checks it.
- **PR 594 (PR register) — readme-guard, 20 Oct 13:21 (owner, CN-011 enforcement)** — CI job `readme-guard` (`tools/readme-guard.mjs`, in `ci.yml`) runs on every pull request into main and fails it when a PR number in the title has no row in README's "PR log", when README's done/total per stage or overall differs from the register's Build status and stage table, or when a stage the PR touches still shows "Not started" in README's features; a required check like the tests.

**The 12 that moved:** page builder and the label dictionary S08 → S02 · category SEO S10 → S11 ·
invoice and PDF templates S14 → S20 · celebration overlay S19 → S02 · user manual S20 → S18 ·
Find My Size engine S23 → S02. Each is now in the stage that actually describes it.

### The parking lot

Parked is not cancelled. Each of these keeps its design notes, and each comes back as a numbered PR on the
day the owner says so.

| Parked | Size | Why it waits |
|---|---|---|
| **S26 · Handover pack** — installer, setup wizard, clean-install check, inline help, bilingual guide, update distribution | 6 PRs (513–518) | Decided 18 Oct: the owner runs the shop himself first. These are only needed on the day the system goes to someone else. |
| **S27 · No-ERP stock module** | ≈8–10 PRs, unnumbered | Same day. The seam is kept open now by PR 497–499. |
| AI voice calls | ≈6 | Not decided |
| POS | ≈8–10 | No showroom yet |
| Birthday marketing | ≈2 | Not decided |
| ERP retail section | — | Lives in the ERP project, not here |

**S26 and S27 travel together.** They are the handover pack: when the owner decides to give the system to
someone else, those two stages are built and nothing else has to be reopened — because everything else was
built handover-ready from day one.

---

## S0A · Server foundation — PR 1–10
*Runs before any application code. The owner's instruction: a shop built on an unprepared server has to be rebuilt.*

| PR | What it does |
|---:|---|
| 1 | **Updated 20 Oct 01:30 (CN-003): access via a GitHub Actions self-hosted runner on the VM (cloud sessions cannot SSH); build deploys to new.extas.com.bd until go-live.** **Updated 20 Oct 00:45 (owner, CN-002): machine created — E8ds_v6, Ubuntu Server 24.04 LTS Gen2, Trusted launch, NVMe controller, OS 128 GB + data 1 TB Premium SSD LRS (P30), accelerated networking on, auto-shutdown off, boot diagnostics on, ports 22/80/443. Region is _Malaysia West (zone 1)_, not Southeast Asia — owner's choice at creation, kept (cheaper; latency to Dhaka similar; Cloudflare in front). The Blob storage account must be created in the same region (Malaysia West). The ~~Southeast Asia~~ mentions in CN-001 read as Malaysia West.** **Updated 19 Oct 22:44 (owner): a NEW ~~VPS~~ machine, freshly created with Ubuntu (not the old Azure VM).** Record the new machine's specs from the owner's configuration screenshot; take a provider snapshot/backup before any change; the old "Azure package must not change" rule applies to the old VM only. **Updated 19 Oct 23:33 (owner server spec): the machine is fixed — a new Azure VM, E8ds_v6** (8 vCPU, 64 GB RAM, 440 GB local NVMe, temporary — PR 601), region **Southeast Asia** (Singapore), **Ubuntu Server 24.04 LTS x64 Gen2** (the plain image, not Ubuntu Pro), Trusted launch, accelerated networking on, NSG inbound 22/80/443 (UFW inside locks it further, PR 3), auto-shutdown off, Azure Backup off (backups are PR 8), boot diagnostics on (needed for the serial console). **Disks:** OS disk **128 GB Premium SSD LRS** + a separate **data disk of 1 TB (1024 GiB) Premium SSD LRS (P30)**, "delete with VM" off, **LVM on the data disk** — it holds Postgres data, Docker volumes, Redis persistence, logs that must be kept, config and certificates. ~~2 TB~~ — 1 TB chosen on Claude's advice: a disk can grow later but never shrink. The 8 vCPU / 64 GB sizing is **confirmed** (no re-size pending). **Access:** the owner creates the VM with "Generate new key pair" and keeps the .pem himself; on code day 1 we give him a public key, which he adds under the VM's Reset password → Reset SSH public key with a separate username for the build agent; no private key ever goes into chat. **Cost note:** consider a 1-year Reserved Instance after 1–2 stable months (roughly 30–40% saving). |
| 2 | ~~In-place OS upgrade 20.04 → 24.04~~ **Not needed on the new VPS** — created with Ubuntu 24.04 LTS; verify version and apply all updates. **Updated 19 Oct 23:33 (owner server spec):** the image is Ubuntu Server 24.04 LTS x64 Gen2, not Pro (PR 1) |
| 3 | Base hardening — SSH keys only, no root login, fail2ban, unattended security updates, UFW. **Ports 22/80/443 are opened by us** (server firewall over SSH; the provider's cloud firewall via its panel with the owner's login or step-by-step guidance) — the owner does not do it. **Updated 19 Oct 23:33 (owner server spec):** UFW allows only 80, 443 and 22; optionally 80/443 limited to Cloudflare's IP ranges (a setting). SSH by key only, no root login, fail2ban — ~~22 restricted to the owner's IP~~ port 22 stays key-only with fail2ban because the build agents connect from changing IPs. DB and Redis reachable only inside the server. Unattended security updates. **Boot order after any restart:** NVMe unit first (PR 601), then the data-disk LVM mounts, then Docker, Postgres, Redis and the app — all by themselves, in that order. Data-disk LVM volumes (Postgres, Docker volumes, Redis persistence, kept logs, config and certificates) with free-space alarms at 80% (PR 9) |
| 4 | Docker and Docker Compose, with the project's network and volume layout. **Updated 19 Oct 23:33 (owner server spec):** Docker Compose stays (not PM2) — each service its own container with RAM/CPU limits from the one config file (PR 604) and auto-restart; volumes on the data disk, scratch on NVMe (PR 601); **zero-downtime deploys** — rolling/blue-green with health checks and automatic rollback |
| 5 | PostgreSQL tuned for 8 vCPU / 64 GB — connections, shared buffers, work memory, autovacuum. **Updated 19 Oct 23:33 (owner server spec):** size confirmed (E8ds_v6), nothing to re-size. 16 GB RAM, 2–3 CPU; `shared_buffers` 16 GB, `effective_cache_size` ~~48 GB~~ 40 GB, `work_mem` by workload, `max_connections` kept low behind **PgBouncer**; `temp_tablespaces` on NVMe (PR 601); data on the data disk; slow query log for anything over 100 ms (PR 603); WAL archived to Blob for point-in-time restore (PR 8); a low-priority report pool (PR 603) |
| 6 | Redis, and BullMQ queues with their dead-letter handling. **Updated 19 Oct 23:33 (owner server spec):** Redis ~~2 GB~~ 6 GB, 1 CPU, `maxmemory` with LRU eviction; working cache on NVMe, persistence (AOF/RDB) on the data disk; holds settings, the Dhaka area list, products, categories and the 15 s stock display cache (PR 602). Queues: image/video worker (separate process, 6 GB, 2 CPU) and background jobs (courier sync, e-mail, reports; 4 GB, 1 CPU) — heavy image and video work never runs in the web process |
| 7 | Caddy with automatic TLS, HTTP/2 and HTTP/3, compression, and the security headers. **Updated 19 Oct 23:33 (owner server spec):** Caddy stays (not Nginx) — automatic SSL renewal on all three domains, 1 GB, 1 CPU; **Cloudflare in front in Full (strict) mode** with a Cloudflare Origin certificate (PR 362) **Updated 20 Oct 2026 (CN-007): the preview password is never sent through chat, logs or artifacts; the owner reads it on the VM (`extas-preview-login`, `docs/owner/PREVIEW-LOGIN.md`), and `server-setup` can rotate it.** |
| 8 | Nightly encrypted backup of database, uploads and configuration to **Google Drive**, with one-command restore. **Updated 19 Oct 23:33 (owner server spec): Azure Blob is added** (supersedes "Drive only, no Blob"). **Blob:** continuous WAL archive for point-in-time restore to any minute; daily full backups; soft delete and versioning or immutability on, so a mistake or ransomware cannot wipe it; images and media in Blob with soft delete and versioning. **Google Drive stays mandatory:** the daily full encrypted copy, off-site with a different company; the second add-only Drive is a third copy. Zip staging on NVMe → upload → delete. Retention from settings. **Restore:** one command, defaults to Blob (same region, fast), Drive is the fallback; choose a point in time; staging first, typed confirmation for production (PR 396). Monthly automatic restore test (PR 395/507). Blob is billed separately from the VM — roughly US$5–15 a month for backups plus media at launch scale; same-region restore traffic is free. The owner creates the Storage account later with a guide; its key goes into the vault (PR 493) |
| 9 | Monitoring — uptime, queue depth, error rate, disk and memory, alerting to Telegram. **Updated 19 Oct 23:33 (owner server spec):** Telegram alerts (through the AI 360 channel) when a disk passes 80%, a service goes down, a backup fails (Blob or Drive), the site slows down, or the NVMe goes missing; per-service RAM and CPU against its limit; the plain-language admin Server page is PR 423 — pre-launch required |
| 10 | k6 performance baseline, recorded as the number every later change is measured against. **Updated 19 Oct 23:33 (owner server spec):** plus the speed targets, measured from Dhaka on a phone over 4G: LCP < 2.5 s, CLS < 0.1, INP < 200 ms, TTFB < 600 ms, category page under 1 MB, admin page under 1 s; measured automatically every month with results in the admin (PR 234, 423) — not done = not finished |

### S0A additions — the owner's server specification (owner, 19 Oct 23:33; review/SERVER-SETUP-SPEC-OWNER.md; CN-001)

| PR | What it does |
|---:|---|
| 601 | **NVMe temporary-disk boot unit (owner server spec, 19 Oct 23:33).** On the E8ds_v6 the 440 GB local NVMe is **raw**: after a stop, deallocate, maintenance or move it comes up unformatted (Microsoft docs). A systemd unit runs at **every boot, before Redis, Postgres and Docker start**: detect the NVMe → format it ext4 if it is not already → mount at `/mnt/nvme` → create the folder layout (Redis working cache, image-processing intermediates, studio rendering, Postgres `temp_tablespaces`, build and pnpm caches, backup staging, session/queue scratch) → set ownership. Those services wait for the unit to succeed (systemd ordering). It holds temporary items only — **never** the database, code, uploads, final backups or kept logs. **Admin:** an NVMe card (mounted or not, free space, which services use it, PR 423); a Telegram alert if it is missing (PR 9). Pre-launch required. |
| 604 | **Hardware-aware auto profile and run-anywhere (owner server spec, 19 Oct 23:33).** Every RAM/CPU limit lives in **one config file, never in code**. On this box: PostgreSQL 16 GB / 2–3 CPU · Redis 6 GB / 1 CPU · Meilisearch 4 GB · Node/Next.js 16 GB / 4–6 CPU, 6 replicas · image/video worker 6 GB / 2 CPU · background jobs 4 GB / 1 CPU · Caddy 1 GB / 1 CPU · OS and the rest 11 GB, never squeezed = 64 GB. The profile **detects CPU and RAM and computes the limits itself** on any other machine (for example 4 vCPU / 16 GB) — no hand edits. **Run-anywhere:** a storage adapter (local disk / Azure Blob / S3-compatible) on the adapter framework of PR 18, so the shop works **without Blob**; it works **without the CDN** (images served from the server); handover-ready (S26). The admin shows each service's RAM and CPU against its limit (PR 423). Pre-launch required. |

## S00 · Foundation — PR 11–18

| PR | What it does |
|---:|---|
| 11 | Repository, branch rules, commit and PR conventions, `PROGRESS.md` and `BLOCKED.md` |
| 12 | Next.js App Router + TypeScript skeleton, Tailwind and the component base |
| 13 | **Full Prisma schema in one pass** — every table the whole plan needs, including `storeId` on everything. **Updated 19 Oct 23:33 (owner server spec):** the schema carries the required indexes and the `pg_trgm` extension of PR 603 from day one |
| 14 | Seed data and fixtures: categories, products, colours, sizes, a demo order |
| 15 | Authentication — customer accounts, admin accounts, sessions, password rules |
| 16 | Role and permission model: owner, manager, support, auditor (read-only) |
| 17 | CI — lint, type-check, unit tests, build, and the Lighthouse gate |
| 18 | The adapter framework: every integration has a mock / sandbox / live mode and a test-connection button. **Updated 19 Oct 23:33 (owner server spec):** includes the **storage adapter** — local disk / Azure Blob / S3-compatible — so media works with or without Blob and with or without the CDN (PR 604) |

### S00 additions — the settings framework (approved 18 Oct)

| PR | What it does |
|---:|---|
| 491 | **Settings framework** — a typed registry, held in the database, cached, every value readable and writable from the admin. Nothing a human might change lives in code. |
| 492 | **Two-tier resolver** — installation level → store level, with inheritance. Goes in with the schema on day one; it cannot be retrofitted. |
| 493 | **Credential vault** — every key encrypted at rest, entered from the admin, never in the repository or in Git |
| 494 | **Hardcode guard in CI** — the build fails on a hardcoded key, name, number or policy string. One check that polices every other rule here. |
| 495 | **Role builder** — the admin creates roles and permissions. Replaces the fixed owner/manager/support/auditor list in PR 16. |
| 496 | **Settings migration** — when a new setting ships, every existing installation receives it with its default |
| 500 | **Integrations settings screen** — courier, SMS, payment, AI providers, Facebook, Google, YouTube, WhatsApp, Messenger, Telegram, Drive, email, all in one place with a test button each |
| 508 | **General default pack** — policy shapes, charge structures, category structure, SMS and email template text, AI settings, theme, roles, seeded as editable defaults on every installation |
| 509 | **"My own data" register** — the list of values that never ship to a new installation: store name, logo, every API key, phone, address, the Dhaka area list, bank and payment details, social links |
| 510 | **"Reset to default"** on every setting |

### S00 addition — database performance pack (owner server spec, 19 Oct 23:33; CN-001)

| PR | What it does |
|---:|---|
| 603 | **Database performance pack (owner server spec, 19 Oct 23:33).** Built with the schema (PR 13). **Required indexes:** category page (category + store + in-stock + sort, one index); SKU and variant by colour and size; order by phone (runs on every order for the fraud engine); fuzzy name/address with **`pg_trgm`** (the fraud/duplicate engine, PR 519); customer order history; style hierarchy for profit (Polo → brand polo → solid polo, PR 536); order list filters (date, status, courier, store). **Slow query log** for anything over 100 ms, target under 50 ms for a normal query, and an admin **"slowest queries"** page (PR 423). **Reports** (profit, ads, dashboard charts) run on **materialized views** refreshed on a schedule, or on a low-priority report pool, so they never slow the shop. Site search stays on Meilisearch (PR 72). Pre-launch required — nothing deferred. |

## S01 · Catalog, media & images — PR 19–39

| PR | What it does |
|---:|---|
| 19 | Product, variant, colour and size model, with the ERP's SKU as the key |
| 20 | Category tree with sub-categories, and the per-category garment type |
| 21 | Product admin — create, edit, publish, unpublish, bulk actions |
| 22 | Image upload with standardisation: size, aspect, background, naming convention. **Updated 19 Oct 23:33 (owner server spec):** on upload the original is archived; **five sizes** thumb 160 · card 400 · card2x 800 · main 1200 · zoom 2000 px; **ratio 4:5** on every size; each in **AVIF, WebP and JPEG**; quality 75–80, changeable from settings; the dominant colour is stored; processing runs in the background on NVMe (image worker, PR 6) and the files go to Blob through the storage adapter (PR 18) — never kept permanently on the VM disk. Required from launch |
| 23 | Watermark on download only, never on the storefront image |
| 24 | High-resolution zoom, and the responsive image pipeline. **Updated 19 Oct 23:33 (owner server spec):** served with `<picture>`/srcset — the right size for each screen (phone 400, larger screens 800; never 2000 on a phone), zoom uses the 2000 size; width and height always set; a dominant-colour placeholder box until the image arrives; first screen eager, the rest lazy |
| 25 | **Minimum four photographs enforced at upload** — front, back, detail, on-model |
| 26 | Upload-time validation block: missing photos, missing size chart, missing fabric notes |
| 27 | Size chart system — per garment type, per fit, with the measurement fields |
| 28 | Size chart admin: create, copy, assign to categories and to single products |
| 29 | Product health score — what is missing before this product may go live |
| 30 | Colour library with real hex values, the colour name dictionary, and true-colour reference |
| 31 | Fabric and care content, structured so it can feed the page and the AI answers |
| 32 | Collections and tags, including seasonal ones |
| 33 | Product import from a link — read a supplier or brand page, draft the product |
| 34 | Bulk CSV import and export for the catalogue |
| 35 | Publish queue — nothing reaches the storefront until its checklist passes |
| 36 | Ghost archive: an out-of-stock product keeps its page and collects back-in-stock interest |
| 37 | Media library with search, reuse, and orphan cleanup. **Updated 19 Oct 23:33 (owner server spec):** the library sits on the storage adapter (Blob by default; PR 18); originals archived so every size can be regenerated when a size or quality setting changes; images, video, banners, logos, generated PDFs and WhatsApp invoice JPGs all live in Blob behind Cloudflare, with soft delete and versioning (PR 8) |
| 38 | "Was" price source per category — MRP, price history or combo — with the honesty rule enforced |
| 39 | Product audit report: everything incomplete, with a one-click route to fix it |

## S02 · Storefront — PR 40–88
*The largest stage. It carries the page builder, the three product-page templates, the themes, and everything the twelve UI/UX review rounds settled.*

| PR | What it does |
|---:|---|
| 40 | Store shell — header, footer, bottom navigation, the slim checkout header |
| 41 | Home page: hero, categories, new in, sets band, flash sale, reviews, journal |
| 42 | **One smooth slider engine** used by every sliding row on the site — continuous glide, drag, pause on touch, reduced-motion safe **V2.1 final · 20 Oct:** proven in the timing audit TA-2 (qa/TIMING-AUDIT.md, 0 fails; checklist L32/L33) — separate pause flags for mouse (hover), touch (4 s hold) and keyboard (focus), each with a tested resume; resumes within about 100 ms after the mouse leaves, after a mouse drag and after a sideways wheel; a vertical wheel is ignored (the page scrolls); every row drags with the mouse and a click after a drag never opens the card; touch hold unchanged. |
| 43 | Hero slider: 12–15 products across all categories, auto-sizing name-and-price pins |
| 44 | Flash sale: two rows sliding in opposite directions, with a countdown that actually ticks |
| 45 | Category page: grid, breadcrumb, category SEO text block, pagination **V2.1 final · 20 Oct:** in the category banners a price never splits from its "৳" across lines on a phone (nowrap). |
| 46 | Filter system — colour, size, fit, price band, on-sale, in-stock — with live counts. **Owner, 19 Oct 18:38:** every filter is built from the category's own products — sizes only those that exist, up to the largest present (S…3XL/4XL/5XL supported), colours only those listed in the category with their product counts, fits only those present (no Slim if none). Nothing fixed. |
| 47 | Sort control built as a real listbox, never a native `select` (a phone draws that at the bottom of the screen) |
| 48 | Sticky filter bar that stays stuck, with the active filters visible while scrolling |
| 49 | Product page template T1 — gallery left, buy column right |
| 50 | Product page template T2 — stacked gallery |
| 51 | Product page template T3 — fit-first |
| 52 | Template assignment per product and per category, with a preview |
| 53 | **The first-screen budget** — `PDP_FIT` and the measured sizing that guarantees the size row and the measurement line land above the buy bar on any product in any category |
| 54 | Gallery: arrows, thumbnail sync, hand swipe, pinch zoom kept working |
| 55 | Colour swatches, colour name, "All N colours" sheet, and true-colour photograph |
| 56 | Size pills that fill the width and stay on one line from S to 4XL |
| 57 | Size chart popup — fixed, not scrolling with the page, with cm and inches inside it |
| 58 | **Find My Size** — height and weight to a recommended size, with the reasoning shown |
| 59 | Find My Size training engine — the chart data, the ease model, and the admin report |
| 60 | Stock line, low-stock urgency chip, and sold-out-in-this-colour handling |
| 61 | Price block: price, discount, saving, free-delivery badge, payment line, all four combinations **V2.1 final · 20 Oct:** phone rule — a currency sign and its number never split across lines (nowrap), on every price. |
| 62 | Trust row — exchange window, free delivery threshold, 100% original — reading live from Smart Rules |
| 63 | Delivery / Exchange / Returns row, opening full width, one at a time |
| 64 | Fabric & care, and the product detail accordions |
| 65 | Product reviews on the page: up to three, photo reviews first, sliding |
| 66 | Questions & answers block, with the WhatsApp ask |
| 67 | "Goes well with" and "Recently viewed" rows, auto-sliding, category-driven |
| 68 | The floating action rail — wishlist, share, WhatsApp — drifting with scroll, never over the title |
| 69 | Share row: transparent floating tiles, Facebook, Messenger, WhatsApp, Instagram, copy link |
| 70 | **Site-wide floating WhatsApp button** with its per-page placement switch |
| 71 | Wishlist — add, remove, the wishlist page, and back-in-stock alerts |
| 72 | Search: the panel, the index across products, categories and help articles, prefix and synonym matching, Bengali keywords. **Updated 19 Oct 23:33 (owner server spec):** site search **stays on Meilisearch** (4 GB, PR 604) — better at Bengali and English typos; Postgres `pg_trgm` is for fraud fuzzy matching only (PR 519, 603). Resolves the owner's "search index in Postgres" line |
| 73 | Search results page with filters and sort |
| 74 | **Hamburger menu with sub-categories** — accordion in place, counts per row, "View all" as the first child |
| 75 | Content pages: FAQ, delivery, exchange, privacy, terms, story, contact |
| 76 | **Page builder** — sections, drag order, show/hide, per page |
| 77 | Page builder coverage for every storefront page, not only the home page |
| 78 | **Label dictionary** — every visible word editable by the owner, in both languages |
| 79 | Front-end editing: open the page, change a label, publish |
| 80 | Field-level show and hide — the eye-toggle system, with its defaults |
| 81 | The eye-toggle dashboard: every switch in one list, searchable |
| 82 | Four themes, with the token system behind them |
| 83 | A/B test module for the storefront |
| 84 | Bengali and English throughout, with the language switch |
| 85 | **Mobile hardening** — 16px fields, no accidental zoom, 44px targets, no horizontal overflow, as CI gates |
| 86 | The light-sweep system and its per-element switches |
| 87 | Celebration overlay on order placement |
| 88 | Storefront performance: image loading, code splitting, the Lighthouse budget. **Updated 19 Oct 23:33 (owner server spec):** targets — a category image under 40 KB, a product main image under 150 KB, a category page under 1 MB; the speed targets of PR 10 (LCP < 2.5 s, CLS < 0.1, INP < 200 ms, TTFB < 600 ms) measured from Dhaka on a phone over 4G |

### S02 additions (approved 18 Oct)

| PR | What it does |
|---:|---|
| 501 | **Branding & appearance from settings** — name, logo, favicon, colours, fonts, banners, menu, footer, contact details, social links. The approved design is unchanged; only its source moves. |
| 503 | **Language framework** — every visible string from a dictionary, Bengali and English switchable. ~~One language ships live~~ **Updated 19 Oct: both languages live; Bengali goes live per page behind the translation gate (PR 588).** **Admin (owner, 19 Oct 19:53):** the backend's menus and labels are in simple English by default, with a switch to Bengali. **V2.1 final · 20 Oct:** English mode shows 0 Bengali across 206 admin routes; the mixed-label dictionary is fixed; documents in Blueprint & files are shown exactly as written in either mode; combo-rule state labels English by default (Running / Off / Ended / Starts), Bengali in Bengali mode. |

## S03 · Combo & bundles — PR 89–104

| PR | What it does |
|---:|---|
| 89 | Combo model: items, set price, savings, active window |
| 90 | Combo admin — create, edit, activate, with live preview |
| 91 | Combo page template C1 |
| 92 | Combo page template C2 — step by step |
| 93 | Combo gallery with the per-item colour switcher |
| 94 | Popular pairs — three across, one tap applies both colours |
| 95 | Per-item size and colour selection with the "same as item 1" shortcut |
| 96 | Set summary, set price, and the saving against buying separately |
| 97 | Add set to bag as one line, with the set price locked |
| 98 | **Build your own set** — pick any N, the tier price applies automatically **V2.1 final · 20 Oct:** these tier rules also drive the bag tier box "Take 2 │ Take 3 │ Take 4" (PR 109/598) — the same numbers in the box, set builder, bag and checkout. The 4-piece prices seeded in the demo (BAG_TIER_SEED: 4 polos ৳2,700, 4 tees ৳1,750) are suggestions waiting for the owner's yes; real prices are owner data. |
| 99 | Set tier rules from Smart Rules: any 2 for X, any 3 for Y |
| 100 | The set builder: slots, pick from a sliding row, swap, remove |
| 101 | Set validation — what is still missing before it can be added |
| 102 | Combos on the product page: the matching set offer |
| 103 | "More sets" row, and the sets landing page |
| 104 | Combo analytics: which sets sell, which pairs get picked |

### S21 addition — checklist audit runner (owner, 19 Oct, round 15 note 17)

| PR | What it does |
|---:|---|
| 570 | **Checklist audit runner in the AI section.** The full e-commerce checklist (qa/ECOMMERCE-CHECKLIST.md, 405 points, grouped and prioritised) lives in the backend. One click → 2–3 agents test the chosen groups on desktop and several phones; or a schedule (e.g. weekly) with the report and bug list sent to Telegram. The owner controls when, how many agents and which groups. Fixes only with his permission. **Standard (19 Oct, note 21):** every non-backend point must PASS on 8 phone sizes, 5 tablet sizes (iPad mini, iPad Air, iPad Pro 11, iPad Pro 12.9, Android tab) and desktop, on every page type, before any release; backend-only points are run from the real backend. **V2.1 final · 20 Oct:** the timing items are checklist L32 / L33 (renumbered from L28 / L29); TA-2 530 checks, 0 fail; the audit runner re-runs them on every release. |

### S01 addition — product naming and links (owner, 19 Oct 12:04–12:07)

| PR | What it does |
|---:|---|
| 590 | **Product naming and URL control (owner, 19 Oct 12:04)** — owner decision (12:07, replacing 12:04): **brand names stay** — EXTAS sells those brands' products and articles name the brand; Claude's earlier warning (Merchant Center / Meta trademark policy) is recorded and the owner accepted the risk, noting ads with brand-named links already run without problems. Each product has a real **brand field** (EXTAS only for own-label), used on the page, in structured data and the feed; templates have a {brand} token. Nothing fixed in code: per product the owner sets the **name on the site, the URL slug, the SEO title, the feed/ad title and the brand (default EXTAS)**; shop-wide templates for slugs and titles; Google preview. **Changing a slug never breaks a link:** the old URL 301s to the new one automatically (also used for the WordPress migration, PR 587), so rank and sales carry over. An optional "other brand name" warning (setting, off by default); a bulk rename tool with preview; the SEO report compares organic visits and sales before/after a rename. |

### S11 additions — Google traffic plan (19 Oct; review/GOOGLE-TRAFFIC-PLAN.md)

| PR | What it does |
|---:|---|
| 586 | **Hash-to-real-URL forwarder** — a small script maps every old demo `#/…` link to its live URL (location.replace), with a test table, so no shared demo link dies |
| 588 | **Bengali translation gate** — per page a "Bengali ready" flag (main content translated and approved); only then the `/bn` page publishes, enters the sitemap and gets hreflang; the SEO health report shows Bengali coverage |

### S12 additions — blog as a traffic engine (owner, 19 Oct 12:10–12:22)

| PR | What it does |
|---:|---|
| 591 | **Blog content pipeline (owner, 19 Oct 12:10–12:14)** — the blog is the main traffic engine: everyday fashion knowledge (care, washing, styling, fabrics, fit, occasions and seasons) plus our own product posts, **at least 3 and up to 5–6 posts a day**. In the backend: a topic list that Doot builds from real search demand (the owner can add topics and approve the list); Doot writes each post; **a second agent proofreads and fact-checks before it can publish** (writer never approves own post); interlinking rules (article → category/product, product → care guide, cluster links), SEO checklist, own photos, Bengali twin when ready (PR 588); a schedule that spreads posts through the day; a duplicate-topic check; per-post traffic and sales report. Quality is the system's job, not the owner's. | **Scope from BLOG-CONTENT-PLAN.md (19 Oct):** 8 pillars with hub pages, 179-topic bank, 90-day calendar (3/day for 2 weeks, then 5/day only while quality and indexing stay healthy — automatic drop to 3/day otherwise; an empty slot is never filled with a weak post); per-post fact sources and reviewer verdict; editorial-policy page and AI-assistance line; similarity/duplicate thresholds; required internal links + weekly unlinked-post report; care-guide link on every product page, "Shop the look" combos on style posts; refresh queue and merge tool with 301s ("updated" date only on real edits); care-lab/photo request queue; topic ideas from Search Console, support chats and site search; product blocks swap sold-out items; proofreader on a different model from the writer where possible; English/Bengali readability check; journal-assisted sales defined. **Review chain (with PR 593):** another author proofreads → Gyani checks business facts (delivery, exchange, prices) → Doot final SEO. Byline: "EXTAS Journal" with the author agent name and the expert reviewer the owner enters.
| 592 | **Blog as a complete, standard section of the shop, with our own ad placements (owner, 19 Oct 12:20).** Blog features: categories (pillars) and sub-categories, tags, author/reviewer pages, search, archive, featured and related posts, reading time, contents, share, RSS, newsletter sign-up, Bengali twins. **House ads only (no outside ad networks):** slots on the blog home (top banner, between cards), category pages, inside the article (after paragraph N, AdSense-style), sidebar on desktop, end of article, and an optional popup per post. Each ad is our banner, product, combo or category; the owner picks which ads show in which slots, posts and categories, with dates, weights and on/off. Popups have triggers (scroll %, time, leaving) and frequency caps, are easy to close, and by default don't open the moment a phone visitor lands from Google (Google's intrusive-interstitial guidance). Click and sales report per ad and slot. |
| 593 | **Blog writing team — five author agents under Doot (A360-06, head of content)**, codes A360-08…12, one per section: care and washing, styling, fabrics and fit, seasons and occasions, brands and products (names editable by the owner). They only write articles and help Doot with blog SEO; authors proofread each other (never their own post), Doot does the final SEO check. Each has a 360° profile, model choice per job (PR 580) and is counted in cost only when it works. **Bylines are honest:** each author page says the articles come from EXTAS's AI writing team, checked by our team; a real staff reviewer line where the owner names one. No invented human personas or fake photos. |

### S13 addition — Merchant Center (19 Oct)

| PR | What it does |
|---:|---|
| 589 | **Merchant Center feed + Bangladesh test** (with Tirondaj) — feed from the catalogue, brand EXTAS, BDT; test Bangladesh as target country after go-live (owner 11:39), result logged; free listings and Shopping ads only if available |

### S19 addition — WordPress migration (19 Oct)

| PR | What it does |
|---:|---|
| 587 | **WordPress → new site migration (extas.com.bd)** — export the old Search Console data and backlinks, 301 every old sitemap URL (49 today) to its new twin, crawl-check on go-live day, keep redirects ≥ 12 months; Google rank carries over |

### S21 addition — PR register in the backend (owner, 19 Oct 14:59–15:05)

| PR | What it does |
|---:|---|
| 594 | **PR register inside the backend (owner, 19 Oct 14:59)** — an admin section listing every stage and every PR with its full details (what it does, scope added later and when, owner decision, status: built / parked / in demo / in code / live, owning agent, demo page link). Click a PR for the full card; search and filters; history of updates per PR (date, round, note); "report a problem on this PR" so the owner can point to an exact PR when something breaks — it opens a task for the owning agent via the chief. Generated from the master register on every build, so new PRs appear automatically; nothing typed twice. **Also holds the latest full blueprint .md (highest version marked latest), the master register and the supporting files** (round notes, plans, research, checklist, QA reports, agent protocol) — read inside the admin with contents and search, downloadable, with version history per file; backed up to Google Drive with everything else; no personal data, no third-party skill copies. **Automatic (15:05):** new stages and new PRs appear by themselves with the date first seen; every new PR shows which earlier PRs it builds on (named numbers, same stage, closest titles) and raises a dated notification; growth of an existing PR's text is recorded as a dated "updated" entry showing what was added, not as a new PR; a helper flags new PRs that look like they should have been scope on an older one (for Gyani to merge); unseen-update counter on the page and in the sidebar. **Change process (owner 22:54; review/CHANGE-PROCESS.md):** register and blueprint live in the repo `docs/` from the first code day and feed this section on every deploy; new ideas come in by chat, the "request a change" form or Telegram to the chief → scope on an existing PR first, else a new PR → a dated change note (CN-###) → placed on the not-yet-built PR, or in the change queue after the current wave, or as an urgent bug PR → blueprint version V2.1, V2.2…; after go-live the same path plus staging and the gate; layout/text/offer changes are done in the site builder without PRs (version history only). |

### S02 additions — owner's desktop review (19 Oct 18:38)

| PR | What it does |
|---:|---|
| 595 | **Page layout builder (home and every category page).** In the backend the owner adds, moves, hides and edits sections on the home page and on each category page: e.g. start a new offer today and put it as a new section above the reviews; drop a box into a category page. Section types: banner, offer strip, product row/grid, combo row, category tiles, reviews, journal, custom HTML-safe block. Each section has its own on/off, dates and device choice (phone/desktop/both). Defaults reproduce today's pages exactly; nothing fixed in code. **In demo (19 Oct, Shilpi A360-05 + Sawdagor A360-04):** `#/admin/layout` "পেজ সাজান" — page picker (home · all categories · per-category override), drag + ↑/↓ reorder, on/off, edit, duplicate, hide-never-delete, add-section type picker (10 types incl. product row from category/tag/manual, combo row from a combo rule, safe rich text, spacer), whole-day Asia/Dhaka dates, phone/desktop/both, live phone + desktop preview; example "নতুন অফার" above the reviews. Built-ins point at today's renderers (HOME_SECTIONS / CAT_SECTIONS); default layout = pixel-identical pages (gate 0 px). Files: 96c-layout-builder.js, r12-zlb.css. |
| 596 | **Side canvas — the empty left and right gutters on desktop** (from under the header banner down to the footer, on home and category pages). The owner divides each side into free-form zones by size and position (e.g. 100 × 500 px at a set height), and puts in each zone a fixed banner, an ad, a popup trigger, or an image/animation that blends with the page background (e.g. a model stepping out in a polo, denim and boots). Per page, per zone on/off, dates; only appears where the gutter is wide enough; never covers content; off by default — today's look stays until the owner approves. Shown to the owner separately for approval first. **In demo (19 Oct, Shilpi + Sawdagor):** `#/admin/side-canvas` "দুই পাশের জায়গা" — live map of the page at 1280–1920 px with px/inch rulers, draw/drag/resize zones or type top/width/height, zone types banner · house ad (product/combo/category) · popup trigger (view/time/click, once per visit/day/week) · illustrated figure (polo + denim + boots from the garment drawings, entrance animation off for reduced motion) · image/animation; blend colour auto/custom, fade side, strength; sticky or anchored per zone; shows only where gutter ≥ zone width + 16 px, never over content, full-width bands, header or footer; hidden on phone/tablet. Master switch OFF ("চালু করার আগে মালিকের অনুমোদন লাগবে"); owner approval view `#/preview/side-canvas` at 1440 and 1920 with blend low/saved/high, switch untouched. **Owner, 19 Oct 19:53:** will turn it on; master on/off stays in the backend (off = today's look). Zones target home, all categories or chosen categories, desktop only. **Never hide — scale:** each zone has a standard reference size and scales up or down to the space each screen gives. Modes: fixed, or fixed with a gentle float of a few cm up/down while scrolling. Full-blend mode: the product sits straight on the page background with no frame, border or card edge. Animated content: a model figure changing poses, products cycling. **AI motion templates (with S24/S25):** 15–20 ready templates (colour cycle, pose cycle, turn-around, slide-up stack, flip deck, ticker, spotlight, etc.); the owner picks a template and products (e.g. every colour of the Solid Polo) and the system builds the sequence; in the real build the AI studio renders poses/short clips. **Speed and reuse (19:59):** loads only after the main content, desktop with a mouse only (phones/tablets never download it), transform/opacity animation, paused off-screen or in a hidden tab, per-zone weight budget (image ≤150 KB, video ≤1.5 MB, page ≤3 MB) with publishing blocked over budget, measured: no LCP regression >100 ms, CLS 0. Every AI pose set/video is kept in an asset library and reused for the same template + product + colours — no paying twice. Signature template "walk-out": a model in our polo, denim and shoes walks forward out of the page in a 3D view (skill: agents/skills/gyani/studio/WALKOUT-TEMPLATE.md). **v2 in demo (19 Oct, Shilpi + Sawdagor):** zones scale from the 1440 standard (gutter 132 px) — 0.31× at 1280, 0.68× at 1366, 1× at 1440, 0.28× at 1536, 1.6× (cap) at 1920 — text clamps, picture-only below 72 px; modes sticky / float (±40 px, eased, transform only) / anchored; full blend (transparent garment drawings + edge fade, no card or edge); per-zone pages (home, all or chosen categories); 19 motion templates incl. the signature walk-out (default suggestion for top + bottom) with product picker (category, sub-category, every colour of…, manual, combo), speed, order and smart suggestion; "AI দিয়ে পোজ/ভিডিও বানান" (simulated) + AI asset library `ST.aiAssets` with reuse at no token cost (also as AI & agents → AI media library); speed first: loads after paint on idle, desktop + mouse only, paused off-screen, weight budgets (image 150 KB, video 1.5 MB + poster, page 3 MB — over budget is blocked); lab at 1440: LCP +28 ms (the canvas is never the LCP element), CLS 0, longest canvas task 19 ms, slow scroll frames 2.3 % vs 1.7 % without. Admin English by default, Bengali via ST.adminLang. **Placement (owner 22:14, marked screenshot review/owner-side-zone-2026-10-19.png):** default zone starts at the first content row (≈14% below the header), is ≈80% of the visible window height below the header, leaves ≈6% at the bottom, hugs the content side with a ≈16 px gap; mirrored right; auto-adjusts to every window; percentages are settings ("centred 75%" kept as a preset). **Per-size placement (owner 22:17):** the editor shows ≥10 real desktop/laptop sizes (1280×720 … 2560×1440 plus his own 1797×879 and "this screen"); he sets the placement on one size and the rest auto-adjust, can fix a custom placement for any size (badge, reset to auto), sizes in between interpolate, a "check all sizes" grid shows pass/warn for each. **Status at pause (19 Oct 22:45):** in demo — default placement from the owner's marking (top 14.4%, height 79.9%, 17 px to content, width 88% of the gutter; 157×644 at 1797×879), 10-size editor with per-size fix and interpolation, check-all grid, 16 page types detected (checkout/thanks/landing excluded), per-page switches; **for the code phase:** tests for per-page placement, Bengali placement sheets, full gate re-run. |
| 597 | **Launch default — save and restore (owner, 19 Oct 19:53).** The look we launch with is saved as the "Launch default": page layouts (PR 595), side canvas (PR 596), house ads and popups (PR 592), home/category sections and banners. One button "Back to launch default" returns everything to it at any time — test ads and experiments switch off (kept as hidden copies, never deleted). The owner can also save named snapshots (e.g. "Eid 2027") and restore any of them; every restore is logged and can itself be undone. **In demo (19 Oct, Shilpi + Sawdagor):** Snapshots panel on Page layout, Side canvas and Admin → Settings — save as launch default / back to launch default (confirm; test sections, zones, house ads and per-category layouts kept as hidden switched-off copies), named snapshots with restore and rename, restore log with undo last restore; covers ST.layout, ST.sideCanvas, ST.blogAds, ST.blogAdSettings, ST.heroBtns. |
| 598 | **Site builder — the whole site dynamic (owner, 19 Oct 21:23: "like WordPress + Elementor, nothing fixed").** From the backend, with preview before publish: **menus** (header nav / mega menu / phone menu / bottom bar — add, rename, reorder, hide, custom links, featured tile), **header** (announcement bar, icons on/off and order, logo), **footer** (columns, links, texts, contact block, social and payment marks), **categories and sub-categories** (create, rename, reorder, hide, image, intro, SEO), **product page blocks** (order and visibility of gallery, price row, colours, sizes, offers, buy-together, reviews, FAQ, care link), **content pages** (help, policies, about, careers, payment — rich text editor), **theme** (colours, fonts, spacing tokens with contrast check). Builds on PR 595 (home/category sections), 596 (side canvas) and 597 (launch default / snapshots / undo). Every change: draft → preview on phone/tablet/desktop → publish; per-device visibility; version history and undo. **Guardrails, not a blank canvas:** blocks snap to the responsive grid (no free pixel dragging that breaks phones), contrast and tap-size checks block bad publishes, checkout keeps its tested structure (texts, fields on/off and order editable; payment steps locked). Handover-ready: every default is data, a new owner configures everything here, the owner's own data never ships (PR 509). **Owner 22:14:** header logo text or uploaded image (auto-fit, phone version) with the **slogan under the logo** (editable, shared with the footer, on/off); footer columns and links drag-and-drop; social and payment icons chosen from a set or uploaded, added, removed, reordered. Clicking any link to the page you are on (e.g. the logo on home) scrolls to the top. **Owner 22:27:** a Shimmer control (every shimmer on the site: on/off, speed, intensity, master switch, reduced motion); tiered bag offers (Take 2 / 3 / 4 with prices and savings, fully customisable); side-canvas zones on every page with gutters (home, category, login, bag; never checkout). **V2.1 final · 20 Oct:** both owner 22:27 items are built in the demo (Batch B): **Shimmer control** — Admin › Settings › Shimmer, 14 shimmers each with on/off, speed and strength, plus a master switch; reduce-motion gets no shimmer; the Add to Bag shimmer exists but is off by default (89t-shimmer.js); **tiered bag offers** — the "Take 2 │ Take 3 │ Take 4" box with gold bars from the Build your own set price rules, up to 4 tiers per rule, dates and targeting, desktop only with a phone preview (89u-bag-offers.js). The rest of PR 598 stays paused. |
| 599 | **In-dashboard help and the handover user manual (owner, 19 Oct 22:14: "no coder needed later; whoever takes over runs the whole site from the manual").** A "How to" panel on every admin page and a "?" on every field, in simple English and Bengali; a searchable Site Manual inside the admin covering every area, written for a new owner; a .md copy kept with the blueprint documents. New features: switches, Smart Rules/automations and integrations are set up without code; a truly new function is requested through the PR register ("request a feature") and built by the agent team, never by editing code by hand. |
| 600 | **On-page edit mode (owner, 19 Oct 22:27–22:33, plan approved 100%).** Logged in as super admin, a thin bar on every storefront page turns on Edit mode (customers never see it): hover a section → outline + Edit; click → side panel with that section's settings (texts, prices, products, offer tiers, shimmer, hide); "+" between sections adds one; draft shown in place → Publish → undo. Same engine as the site builder (PR 598), two doors. On phone: a light version (texts and offers only, no drag). **Desktop change → "Apply to phone too?"** If yes: previews on the **10 phone screen sizes most used in Bangladesh** (the owner can pick any to check by hand) plus automatic checks (nothing cut, no sideways scroll, tap size, buy button above the fold); it goes to phone only after the checks pass and the owner approves. **AI mode:** when on, an AI reviewer agent tests the change across phones, tablets and desktops (layout, speed, conversion rules, customer impact) and returns a short report — "safe to publish" or "Boss, don't publish: …" with reasons and screenshots; when AI mode is off it says so and the owner's own check stands. Guardrails as PR 598; checkout payment steps locked. |

### S02 addition — four-layer cache (owner server spec, 19 Oct 23:33; CN-001)

| PR | What it does |
|---:|---|
| 602 | **Four-layer cache plus invalidation (owner server spec, 19 Oct 23:33).** **Browser** (images, CSS, JS, fonts for a long time, hashed file names) → **Cloudflare** (static files long; category and product pages for a few minutes, duration in settings; cart, checkout, account and admin never cached) → **server page cache** (built HTML for minutes, renewed the moment something changes) → **Redis** (settings, the Dhaka area list, products, categories, stock display). **Purge rules:** price change → that product, its category pages and the CDN; stock change → instantly; settings change → every place that setting is used; new product → category pages and the sitemap. **Stock:** the display cache lasts 15 s and every stock change event purges it at once; **add-to-bag and checkout always read live stock with a row lock (PR 198)** — nothing oversells. An admin **"Clear all cache"** button; cache hit %% on the Server page (PR 423). All durations are settings. Pre-launch required. |

### S03 additions — combo is the biggest-selling section (owner, 19 Oct, round 15 notes 8–11; research: review/COMBO-RESEARCH.md)

| PR | What it does |
|---:|---|
| 571 | **Auto colour-pair combos (the owner's model).** Bind a category, sub-category or chosen products, pick **2-piece or 3-piece** → every colour pair (or triple) becomes its own combo listing ("Ralph Lauren Polo — Black + Navy · 2-piece combo"), evergreen, priced "2 pcs ৳2,200 → ৳1,800". Best sellers first, "has colour" filter, regenerates when a colour is added, pauses when a colour sells out. Per-section tick: **no single piece here**; optional "add 1 more → 3 pcs". **Lifecycle (owner, 19 Oct 11:51):** nothing is deleted and no combo URL dies (Google rank, shared links); optional start/end dates (none = always on); at the end date the rule ends by itself → pages stay live and indexable showing "offer ended" with live alternatives, no add to bag, and move to an Archive tab in admin; sold out stays automatic from stock; manual off = ended; turning on or extending brings the same URLs back. **Combo SEO (19 Oct):** fixed colour order in the pair slug (reverse order 301s), featured pairs (own set photo + text) indexed, others noindex,follow; ended/paused pairs stay live (200) with alternatives. |
| 572 | **Combo category page — 5 templates:** L1 pair grid (the promoted page), L2 one card per style, L3 combo hub with winter/summer tabs, L4 one-column ad landing list, L5 "2 pcs / 3 pcs" switch first. |
| 573 | **Combo product page — 5 templates:** P1 pair page (2 taps to bag), P2 pick-your-colours, P3 top + bottom set, P4 mixed 3-item set, P5 fixed-colour pack. One button wording ("Add both to bag · ৳1,800"), "Size for both" by default. |
| 574 | **Combo in the bag — 5 templates (default B5 compact rows, ranking winner, applied 19 Oct; owner keeps current defaults):** B1 grouped card, B2 sizes editable in the bag, B3 "add 1 more" inside the card, B4 real item prices + one discount line (order record and invoice), B5 compact line for many sets. |
| 575 | **Set photo standard:** the set picture is composed automatically from each piece's photo in the chosen colours (side by side / top + bottom / three-up), one photo standard, no text baked in. |
| 576 | **Combo template test matrix and ranking:** set types × 5–6 colours × S–3XL × phone sizes, a 100-point score per template (taps to bag, first-screen completeness, errors possible, clarity of price), so the owner keeps the winner. |

## S04 · Cart, checkout, accounts — PR 105–137

| PR | What it does |
|---:|---|
| 105 | Cart model, line items, quantities, persistence across sessions |
| 106 | Add-to-bag sheet: name, size, price, bag count, and what shows when delivery is not free |
| 107 | Cart page: lines, images, quantity, remove, save for later **V2.1 final · 20 Oct:** owner bag review 43.3–43.9 built (Batch B): title "Your bag — N items"; bigger Continue shopping with shimmer; shimmer on FREE; "You save" in sale red; duplicate-size box fixed (fits, accent left and right); line titles 17 px with colour and size in bold ink; 15 plain English bag labels, editable with Bengali; no combo nick-names on the bag. |
| 108 | Set lines in the cart, with each piece linking to its own product page |
| 109 | **One offer slot** under the lines — never between products, never empty **V2.1 final · 20 Oct:** the offer slot can show the tier box "Take 2 │ Take 3 │ Take 4" with gold bars (owner 43.10), built from the Build your own set rules (PR 98); settings on/off, dates, categories/products, up to 4 tiers per rule; desktop only, the phone version is a preview only. |
| 110 | The two-sizes-of-the-same-product notice, and the keep-or-change flow |
| 111 | Order summary with product names, sizes and bold amounts |
| 112 | Discount code entry, validation, and the better-offer explanation |
| 113 | Free-delivery progress and what is still needed to reach it |
| 114 | "Goes well with your bag" upsell row |
| 115 | Checkout page shell, the steps header, and the mobile summary bar |
| 116 | Name, phone and address capture with inline validation |
| 117 | **Dhaka address gazetteer** — longest match across 140+ areas and 64 districts |
| 118 | Zone detection with the ask-don't-guess question when confidence is low |
| 119 | Delivery charge from the zone, shown before the customer types |
| 120 | Payment method selection: COD, bKash, Nagad, card |
| 121 | Quantity change and item removal at checkout, with the many-of-one-size guard |
| 122 | Wallet credit applied at checkout |
| 123 | Marketing opt-in, default on, with a clear way out |
| 124 | Confirm button states — what is missing, and that the next step confirms the order |
| 125 | Order placement, idempotency, and the failure path |
| 126 | Thank-you page: order number, copy, track, payment due |
| 127 | "Add to this parcel" — a real order line, visible everywhere the order is shown |
| 128 | Complete-your-look block on the thank-you page |
| 129 | Account auto-creation on first order, with the credentials shown once |
| 130 | Customer login, password change, and the SMS code on a new device |
| 131 | My account: orders, for you, rewards, wallet, wishlist, profile |
| 132 | **Account offer banner** — wallet balance or a standing member offer, never empty |
| 133 | Profile photo upload, cropped and stored client-side |
| 134 | Order detail page with the full line list and the add-on items |
| 135 | Order tracking page, the account welcome panel, and the tracking steps |
| 136 | **Invoice generation and download** from an order |
| 137 | Draft capture and autofill — a started checkout is remembered |

## S05 · Order management — PR 138–155

| PR | What it does |
|---:|---|
| 138 | Order model, states, and the event timeline |
| 139 | Append-only audit log on every order change, with who and when |
| 140 | Admin order list: filters, search, bulk selection |
| 141 | Order detail for the admin, with the customer's history beside it |
| 142 | Admin-side order edit, recording the source of every change |
| 143 | Customer-side order edit until processing starts, capped |
| 144 | Order cancellation, with reason codes |
| 145 | **Duplicate-order defence** — four layers, from the submit guard to the review queue |
| 146 | Two-size follow-up: the customer ordered S and M, which do they want |
| 147 | Notes and internal flags on an order |
| 148 | Order status notifications — SMS, WhatsApp, email — with the no-double-send guard |
| 149 | Notification log with retries |
| 150 | Customer dashboard order history and lifecycle |
| 151 | Order export |
| 152 | Bulk status change with confirmation |
| 153 | Hold and release, with the reason visible to support |
| 154 | Order search by phone, name, order number and tracking number |
| 155 | Order analytics: by day, by zone, by payment method |

## S06 · Fraud & location — PR 156–164
*Settings open — see the decisions list, numbers 1–5.*

| PR | What it does |
|---:|---|
| 156 | **Risk score model** — the signals, their weights and the band thresholds, all set by the owner (answer 1). Not a fraud-check score: order behaviour, delivery history, address and identity all feed it. |
| 157 | Phone history: past orders, refusals, returns on this number |
| 158 | Address and zone checks against the gazetteer |
| 159 | IP, device and GPS signals, with the 180-day deletion rule (answers 4 and 30). The GPS button stays, default on, switchable. |
| 160 | Risk panel on the order, showing why the score is what it is |
| 161 | **Actions per risk level** — watch, hold, confirmation call, delivery charge in advance, full advance, COD off. Claude's set is the default; every action editable (answers 2 and 5). |
| 162 | Blocklist with reasons and an undo. **Owner, manager and customer-facing staff** can all blacklist (answer 3). |
| 163 | Repeat-refuser handling, reversible by hand — COD off, delivery charge in advance, full advance, or nothing. The owner chooses per case (answer 5). |
| 164 | Fraud report: what was caught, what was wrong, and the cost avoided |

### S06 addition (approved 18 Oct)

| PR | What it does |
|---:|---|
| 502 | **Zone, charge and area admin** — the three charge bands, the COD limits, and every area: add, rename, merge, move an area between bands, edit its alternate spellings. All from the admin. The sub-area band has its own on/off switch (18 Oct). |

### S05 additions (review round, 18 Oct)

| PR | What it does |
|---:|---|
| 541 | **Risk-sectioned order dashboard** — the moment an order lands it is scored, marked and placed in its section with a note, so the owner opens one screen and sees every order already sorted by what it is. Marking is instant; the decision never is. |
| 546 | **Cancellation notice to the customer** — when a duplicate is cancelled, a detailed WhatsApp or SMS explains why, with the tracking link to the order that is already on its way |

### S06 additions — the duplicate-order & fraud engine (answers 1–5, 44, 18 Oct)

The owner's largest single input. Scenarios A–M are recorded in `PENDING_CHANGES.md` §59.1.
**The binding constraint on all six: a genuine order must never be trapped.**

| PR | What it does |
|---:|---|
| 519 | **Order Identity Graph** — one identity built from phone, name, address, IP and device, so a customer who changes his phone number is still the same person. Every rule below reads this graph, not a raw phone number. **Updated 19 Oct 23:33 (owner server spec):** name and address are matched fuzzily (spelling a little off) with Postgres **`pg_trgm`** trigram indexes from PR 603; site search does not use it (Meilisearch, PR 72) |
| 520 | **Duplicate & re-order rules engine** — scenarios A–E and H–I as separate rules, each with its own window, confidence threshold and action: **cancel · hold · warn · allow. There is no "block" action** (18 Oct). Scenario A cancels the second order and PR 546 tells the customer why. The submit-time guard stops most duplicates before they are ever placed, without friction for a known good customer. |
| 521 | **Alert summary card** — one click on an alert shows why it fired, which earlier orders matched, what the rider wrote, and the customer's history, so the approver decides in seconds |
| 522 | **Multi-order bundling** — several separate orders from one identity inside a window become one group and one parcel, with a note, instead of five parcels |
| 523 | **Block register, and the proposal that fills it** — after N rejections the identity is *proposed* for blocking, never blocked automatically (18 Oct). The register holds why, which identity, the name and address given, and every product ordered with its date. A human blocks; the AI only asks. |
| 524 | **False-positive protection** — every rule carries a confidence score and a good-customer override, and a weekly report lists everything the engine stopped so a wrong rule is caught within days, not months |

### S04 additions — Parameter for Checkout (§60.9, 18 Oct)

| PR | What it does |
|---:|---|
| 558 | **Parameter for Checkout panel** — its own dashboard section, mixed with no earlier parameter. The owner sets what counts as a flag, how many layers there are, and what each layer asks for. **The whole feature has one off switch.** |
| 560 | **Advance-payment checkout mode** — for a flagged customer only, and only once he has filled everything in: COD disappears, bKash, Nagad and card open, with one neutral line — delivery charge in advance, or full advance, by layer. **Built as the same checkout page with the payment section swapped**, not a second page: one page to design, one page to test on mobile, and no chance of the two drifting apart. The customer is never shown a score or a reason. |
| 563 | **No order is ever held over an address** — an unresolved address, with no Inside/Outside choice made either, **still confirms**. It lands in the backend flagged *address unclear, charge not fixed* and goes to a call queue for the AI or an agent. Nothing is left pending over an address. |
| 565 | **Free delivery is exempt** — where delivery is free, none of the band machinery shows, corrects or messages. Built in, not bolted on. |
| 566 | **Support explanation panel** — one click gives the agent a summary of why this customer was asked for an advance, and why the delivery charge rather than the full amount, in words that can be read out on the phone or shared in chat when a customer challenges it |
| 561 | **Silent address backfill** — a customer who writes only "Road 12, House 42" gets the Inside/Outside Dhaka question, **unless his phone number is already known**. Then nothing is shown, nothing is prefilled, what he typed stays as he typed it, and the full address we hold is attached to the order in the backend for packing. A new address always wins over the stored one — he may have moved, or be sending a gift. |

### S06 additions — the approval loop (review round, 18 Oct)

**The governing rule: nothing is ever blocked automatically.** The AI may at most decline an order.
A customer is blocked only after a human has reviewed it.

| PR | What it does |
|---:|---|
| 540 | **Approval digest and permission gate** — the AI reports and then waits: *"50 orders today; 30 confirmed and moved on; 5 held for a call, for this reason; 10 have another order running, 8 of those are duplicates."* Nothing is acted on until the owner says so. |
| 542 | **One-click advance-charge request** — from the order itself: SMS, WhatsApp or call, with the payment link and the order's state change, in one click |
| 543 | **Decision learning loop** — every approve and decline by the owner and by each employee, with its reason, is taken as training. The engine's judgement improves as volume grows, and it learns which employee rejects what and why. Switchable off. |
| 544 | **Rule master switches** — every fraud and duplicate rule individually switchable from the backend. All on by default; any one can be turned off the day it costs more than it saves. |
| 545 | **New-customer verification queue** — an identity with no history anywhere goes to a phone call, never to a decline. No history is not a risk score. |

### S06 additions — the delivery-zone engine (§60, 18 Oct)

**Three charge bands:** Dhaka City · Sub-area (Gazipur district, Savar, Narayanganj district) · Rest of
Bangladesh. **The standard: a customer is never shown a delivery charge that is not his.** A wrong charge
loses the order outright, so this engine is held to a higher bar than anything else in S06.

| PR | What it does |
|---:|---|
| 549 | **National gazetteer** — division → district → upazila/thana → area for the whole of Bangladesh, with Bengali, English and Banglish spellings, postcodes and coordinates where they exist. National, not Dhaka-only: the collisions cannot be resolved without the rest of the country in the table. Dhaka City scanned to 250–300 entries; Gazipur, Savar and Narayanganj scanned in full. |
| 550 | **Band mapping** — one band per area, simple. **Dhaka City = the official DNCC + DSCC map**, nothing else. Sub-area = the owner's list, which is the only exception to the map. Everywhere else is one flat rate. The charge the customer sees is a figure the owner fixes in the admin — it does not depend on which courier the parcel ends up on. The sub-area band has three settings: its own charge · folded into Dhaka City · folded into the outside-Dhaka flat charge. |
| 551 | **Ambiguity resolver — reads the whole line, and waits.** Nothing is decided while the cursor is still in the address field: people write the district a few words later ("Gabtoli Bus Stand, **Dhaka**"; "Masterpara, Gabtali, **Bogura**"). On blur, or a long enough pause, the resolver reads the complete address — a district, parent area or postcode anywhere in it settles the band **silently, with no question**. A postcode settles it (1216 Dhaka, 5820 Bogura); a co-occurring local name narrows it; a returning customer's saved address outranks any guess. **Only a line still ambiguous after that full read asks**, and once the customer confirms, nothing silently changes it. |
| 552 | **Address autocomplete** — type-ahead over the gazetteer, matching Bengali, English and the Banglish people actually type (Gabtali ↔ Gabtoli, Sreepur ↔ Sripur, Bogra ↔ Bogura). **Each suggestion row shows the parent and the price** — a customer about to pick the wrong Gabtoli sees "বগুড়া · ১৩০৳" and stops. Prefix matching only, never fuzzy scoring: fuzzy turns "Sadar" into sixty wrong hits. |
| 553 | **Charge accuracy guard** — the delivery charge is **never computed from free text**, only from a resolved gazetteer entry. Unresolved means ask, never guess. A test suite runs every known colliding name and fails the build if any of them resolves to the wrong band. |
| 555 | **Phone-first recognition at checkout** — the customer has given a phone number before he has given anything else. It is looked up even with no login, because most people never log in. **A bare phone number prefills the area only** — enough to set the charge, and not sensitive. House, road and full address prefill only after a one-time SMS code or a real login, so a stranger typing numbers cannot harvest customers' addresses. |
| 556 | **In-transit duplicate notice** — the moment the phone number identifies an order already on its way with the same product, colour and size, a Bengali popup with the product photo, the earlier order number and its tracking link: *it has already reached your area, there is no need to order again.* **Two buttons — cancel it, or "no, I want another one"** — because the second one is sometimes a real sale. Every firing is recorded in detail, with the campaign that brought the customer, so a campaign generating duplicates can have its frequency cap cut. |
| 557 | **Duplicate turned into an exchange** — same product and colour, **different size**, earlier one still in transit: that is a size worry, not forgetfulness. The message offers an exchange on arrival instead of a second parcel — one exchange charge instead of a parcel plus a refusal. |
| 559 | **Phone-entry risk check** — our database and the courier fraud checks queried **in the background while the customer keeps typing**. Never blocks the form; a slow or failed check **passes the customer**. It catches a pattern, not a slip: 20 orders with 5–8 cancelled is not a flag; five parcels from several couriers all cancelled is. Recency weighted. |
| 567 | **Multi-courier fraud data** — Steadfast's and Pathao's own checks to begin with, and any aggregated source behind the same adapter. A customer's refusal history is spread across couriers and none of them share it, so the adapter merges whatever is connected into one view and draws the maximum from it. |
| 562 | **Flag outcome report** — of the customers flagged: how many paid the advance, how many abandoned. **This is the number that tunes the parameter.** If most of them walk away, the threshold is costing more than it saves, and the owner can see that in a week rather than guessing for a year. |
| 554 | **Courier zone sync** — our gazetteer mapped to each courier's own city/zone/area ids, so a booking never fails on an area the courier does not recognise, and a courier's list changing does not silently break ours |

## S07 · Payments & wallet — PR 165–174

| PR | What it does |
|---:|---|
| 165 | Payment model, states, and the reconciliation fields |
| 166 | Cash on Delivery: amount due, rider collection, settlement |
| 167 | bKash integration behind the adapter, with the mock |
| 168 | Nagad integration behind the adapter, with the mock |
| 169 | Card gateway integration behind the adapter, with the mock |
| 170 | Payment callbacks with idempotency keys |
| 171 | Wallet: credit, debit, balance, and the ledger behind it |
| 172 | Refund to wallet, and the rules for when a refund is allowed |
| 173 | Partial payment and advance for pre-orders, capped |
| 174 | Payment reconciliation report against the gateway statements |

## S08 · Courier, returns, exchange — PR 175–193

| PR | What it does |
|---:|---|
| 175 | Courier adapter framework with the mock |
| 176 | Steadfast integration — booking, consignment ID, status polling |
| 177 | Second courier integration |
| 178 | **Courier selection by zone, weight and real cost** — the couriers price the same parcel differently (Pathao ৳80 to the suburbs against Steadfast ৳105; Steadfast ৳55 inside Dhaka against Pathao ৳60), so the rule picks the cheaper one per destination. **This affects the shop's cost only — never the charge shown to the customer**, which is the fixed figure from PR 550. |
| 179 | **Courier sticker** — the one fulfilment document, custom size, barcode, COD amount, full item list |
| 180 | Sticker print queue, reprint safety, and the handover sheet |
| 181 | **Daily consolidated picking list PDF**, sorted category → style → size, highest quantity first |
| 182 | Fulfilment page: pick, pack, hand over, all on one screen |
| 183 | Defective or out-of-stock at packing: the resolution card and the hold. **Never auto-cancelled** — the team decides; the rest of the order ships (answers 41, 42). |
| 184 | Tracking status sync back to the order and the customer's tracking page |
| 185 | **Four-tier exchange engine** with the money box for each tier |
| 186 | Exchange request from the customer's account, within the window |
| 187 | Exchange QC — good or damaged — then restock or write-off |
| 188 | Exchange variant switcher: same product, different size |
| 189 | Return handling, with the policy that there are no returns after receipt |
| 190 | Delivery charge rules for exchanges, and who pays |
| 191 | Refused-parcel handling and the exclusion list it feeds |
| 192 | Courier performance report: on-time rate, refusal rate, by zone |
| 193 | Holiday mode — cut-off dates, promised delivery windows, the storefront notice |

### S08 additions (answer 44-J and 44-K, 18 Oct)

| PR | What it does |
|---:|---|
| 525 | **True-delivery reconciliation** — the courier marks a charge-paid return as "Delivered". This separates what was actually received from what the courier claims, per order and per customer. |
| 564 | **Charge mismatch log** — when the courier resolves a different real location than the band the customer was charged for, **nothing is changed and nobody is messaged**. The gap is simply recorded, and a monthly figure shows how many such cases there were and what they cost. The difference is ৳50 at most and the cases are rare; a correction system would cost more in refused parcels than it recovers. The owner decides later, from the number. |
| 526 | **Return-reason capture** — the rider's note (didn't like it, size didn't fit, not as expected, ordered by mistake) recorded against the customer and fed into PR 521 and PR 533 |

## S09 · Inventory & ERP sync — PR 194–207

| PR | What it does |
|---:|---|
| 194 | **ERP sync adapter** — authentication, retry, and the error surface |
| 195 | Stock pull from the ERP at SKU / colour / size level |
| 196 | `companyId` and warehouse mapping per store |
| 197 | **Global reservation across all three stores** on the one shared stock pool |
| 198 | Reservation with row locking, and release on cart abandon |
| 199 | Order push to the ERP as a document, never as journal lines |
| 200 | Idempotency on every ERP push — no duplicate stock movement is possible |
| 201 | Inventory locations including the damaged bin |
| 202 | Low-stock alerts, per variant |
| 203 | Stock audit by barcode, with variance and reason |
| 204 | Product publishing queue driven by real ERP stock |
| 205 | Sync health panel: last run, what failed, what is queued |
| 206 | Manual re-sync and single-product re-sync |
| 207 | Stock movement report, reconciled against the ERP |

### S09 additions — the ERP becomes optional (approved 18 Oct)

The owner's decision: build the adapter properly now, leave the seam for "no ERP" open, and do not build
the no-ERP stock module yet. That module is parked as **S27**.

| PR | What it does |
|---:|---|
| 497 | **ERP mode switch** — EXTAS ERP · another ERP · no ERP. Address and keys from settings. **Updated 20 Oct 02:25 (owner, CN-005): the ERP-side API is built in the owner's ERP project against `docs/ERP-API-CONTRACT.md`; this adapter is built against the same contract and runs on a mock until the owner enters the ERP address, key and secret.** |
| 498 | **Generic ERP adapter interface** — one contract with mock, sandbox and live modes, so a second ERP is a new adapter and not a rewrite |
| 499 | **ERP-absent guard** — every path that depends on the ERP has a defined behaviour when none is connected, proven by tests. This is what keeps the seam open. |

## S10 · Smart Rules — PR 208–219

| PR | What it does |
|---:|---|
| 208 | Rules engine: conditions, actions, priority, active window |
| 209 | Rule admin with a live preview of what the customer will see |
| 210 | Delivery rules — charges, free-delivery threshold, zones |
| 211 | Exchange rules — window, who pays, what qualifies |
| 212 | Set and combo tier rules: any 2 for X, any 3 for Y |
| 213 | Discount and coupon rules, with the honesty guard on "was" prices |
| 214 | Festive and seasonal rules, with cut-off dates |
| 215 | **Rule text everywhere reads from the rule**, never from a hard-coded string |
| 216 | Notices and pop-up builder, with placement and timing |
| 217 | Rule conflict detection and the resolution order |
| 218 | Rule history: what changed, when, and by whom |
| 219 | Rule simulation: what would this order have cost under the new rule |

## S11 · SEO engine — PR 220–238
*Settings open — decisions 6–10. One of the owner's five standing requirements: found on Google, Bing, YouTube and by AI assistants.*

| PR | What it does |
|---:|---|
| 220 | URL structure and canonical rules. **Updated 19 Oct (owner 11:39): English at `/`, Bengali at `/bn/` live** for every page that passes the translation gate (PR 588); each language its own canonical, no auto-redirect by language; same ASCII slug for both; product URLs category-free. Map: review/GOOGLE-TRAFFIC-PLAN.md §1.4 |
| 221 | Title and meta description templates per page type, with AI drafting |
| 222 | Structured data: Product, Offer, BreadcrumbList, Organization |
| 223 | **Review schema emitted only from real review rows** — never a fabricated aggregate rating |
| 224 | FAQ content from the real questions on the page, for customers and AI answers. **Google stopped showing FAQ rich results for all sites on 7 May 2026** — markup optional, no Google rich result promised |
| 225 | **Product page content architecture** — server-rendered accordions that search engines can read |
| 226 | Category SEO content block, per category |
| 227 | Sub-category SEO content and the **filter-page indexing rules — indexed only where it genuinely earns traffic**, not every combination (answer 7) |
| 228 | Sitemaps, split by type, with automatic regeneration |
| 229 | `robots.txt`, and the switch for AI crawlers — GPTBot, ClaudeBot, PerplexityBot, Google-Extended. **Default on** so AI assistants can rank the shop (answer 56). |
| 230 | **Answer-engine pack** — the content shape that gets quoted by AI assistants |
| 231 | Internal linking engine: related products, related categories, related articles |
| 232 | Image alt text, auto-applied; English live, Bengali held in the dictionary |
| 233 | Search Console and Bing Webmaster connection, with the verification flow |
| 234 | Core Web Vitals monitoring against the real field data. **Updated 19 Oct 23:33 (owner server spec):** plus an automatic **monthly** measurement from Dhaka, on a phone, over 4G, against the PR 10 targets (LCP, CLS, INP, TTFB, category page weight, admin page time); results in the admin Server page (PR 423). Pre-launch required |
| 235 | Redirect manager, and the 404 report with one-click fixes. Loads the WordPress 301 map (PR 587) and the combo colour-order 301s |
| 236 | Hreflang and the language alternates |
| 237 | SEO health dashboard: what is missing, page by page. Plus a check on every deploy: hreflang return links, no cross-language canonical, no `#` links, Bengali-twin coverage |
| 238 | Organic performance report — traffic, position, and which AI assistants are citing the shop |

### S11 addition (answer 8, 18 Oct)

| PR | What it does |
|---:|---|
| 527 | **Permanent URL policy** — no product, category or page URL is ever deleted or allowed to 404. An out-of-stock product page stays live and keeps its rank: an honest out-of-stock state, notify-on-restock, and suggested alternatives. Restock makes it a normal page again. |

## S12 · Content & blog — PR 239–253
*Settings open — decisions 11–15.*

| PR | What it does |
|---:|---|
| 239 | Article model, categories, authors, publish states |
| 240 | Blog admin with the editor and the preview |
| 241 | Blog listing and article pages, with the related-product block |
| 242 | **Topical cluster planner** — which articles to write, and how they link |
| 243 | AI article drafting from the PR 528 brief, in either language, per post (answer 11) |
| 244 | *(19 Oct: the owner approves the topic list — monthly batch, can add any time — not each post; PR 591)* Approval queue: owner approval first, then automatic with a digest |
| 245 | Article scheduling and the publish calendar |
| 246 | Seasonal landing pages — Eid, winter, Puja — permanent and re-used each year |
| 247 | Help articles as structured content: delivery, exchange, returns, payment |
| 248 | **Help articles indexed into search**, with the one-line answer snippet drawn from the live rules |
| 249 | Article SEO: schema, meta, internal links |
| 250 | Content performance report: which articles bring traffic and which bring orders |
| 251 | Comment handling, or the decision to run without comments |
| 252 | Content calendar shared with the social studio |
| 253 | Article-to-product attribution: what an article actually sold |

### S12 additions (answers 11–14, 18 Oct)

| PR | What it does |
|---:|---|
| 528 | **Blog brief form** — word count, keywords, topic and language chosen before a single word is written. No post is generated without one. |
| 529 | **Source-link research writer** — give it a link to an article anywhere in the world; it researches the topic and writes an original piece in the chosen language. Images sourced by default, generation optional. |
| 530 | **Seasonal page lifecycle** — archived and live are states, never deletion. A seasonal page returns on its own when the occasion comes round. |

## S13 · Marketing & ads — PR 254–283
*Settings open — decisions 16–20.*

| PR | What it does |
|---:|---|
| 254 | **Landing page builder** — sections, templates, publish, per campaign |
| 255 | Landing page templates and the component library |
| 256 | Campaign model: audience, offer, creative, window, budget |
| 257 | Server-side event tracking — view, add to bag, checkout, purchase |
| 258 | **Delivered-purchase optimisation** — the event that matters is delivery, not order |
| 259 | Facebook and Instagram ads integration behind the adapter |
| 260 | TikTok ads integration behind the adapter |
| 261 | Google ads integration behind the adapter |
| 262 | **Audience Builder** — segments from real order behaviour |
| 263 | Value-based lookalike audiences from delivered revenue |
| 264 | **Refused-parcel exclusion list** pushed to every ad platform |
| 265 | Ad spend import, per platform, per campaign |
| 266 | **USD rate as a setting** the owner types, applied consistently to every cost figure (answer 17) |
| 267 | Cost per order, cost per delivered order, and **alert thresholds the owner sets from the dashboard** (answer 19) |
| 268 | Pause and budget change from the dashboard, with a confirm step — extended by PR 531 to full campaign control |
| 269 | **AI growth agent** — reads performance, proposes changes, waits for approval |
| 270 | Ad creative briefs generated from the product and the campaign |
| 271 | **Coupon engine, fully dynamic** — percentage, fixed taka, free delivery, buy-one-get-one, buy-two-get-five, and offer shapes invented later without new code (answer 20) |
| 272 | Coupon distribution, limits, and per-customer caps |
| 273 | Referral programme |
| 274 | **Incomplete-order capture** — the details typed before the order was placed |
| 275 | Incomplete-order follow-up, capped at two messages |
| 276 | Abandoned-cart recovery with the offer rules |
| 277 | Campaign blast — SMS, WhatsApp, email — with the audience and the throttle |
| 278 | **YouTube module** — channel, videos, and the attribution back to orders |
| 279 | SEO outreach pipeline |
| 280 | Seasonal homepage switching, scheduled |
| 281 | Festive cut-off banners and the delivery promise |
| 282 | Marketing calendar across ads, content and social |
| 283 | Marketing report: spend, revenue, by channel, by campaign |

### S12 addition (review round, 18 Oct)

| PR | What it does |
|---:|---|
| 547 | **Image sourcing for the blog** — the owner's own product photographs first, then free-licence libraries the AI may draw on by itself. **AI generation asks permission every time**, because it costs money. Nothing is ever taken from Google image search. |

### S13 additions (answers 18–20, 18 Oct)

| PR | What it does |
|---:|---|
| 531 | **Full campaign control from the dashboard** — create, run, duplicate, schedule and re-budget a campaign, not only pause it |
| 532 | **Deep conversion feed** — server-side events enriched with the courier outcome and the visitor's intent, pushed to every platform, so the shop optimises on delivered revenue and not on clicks |

### S13 addition — market intelligence (review round, 18 Oct)

| PR | What it does |
|---:|---|
| 569 | **Geography-led ad guidance** — the shop knows where parcels are actually *delivered and paid for*, district by district. That drives the spend: more where delivery succeeds, less where refusals are high, and a campaign aimed at a district that buys a particular category. The platforms cannot work this out themselves — they see orders, not outcomes. |
| 548 | **Market and competitor intelligence** — the owner supplies links to large pages in his market; the system studies what is publicly learnable from them (which products are pushed, which angles, which seasons, which audiences respond) and turns it into ad planning: audience ideas, keyword ideas, creative angles, and where spend is being wasted. Feeds the Facebook and Google planning, never scraping anything private. |

## S14 · CRM & customers — PR 284–303

| PR | What it does |
|---:|---|
| 284 | Customer model, merge rules, and the single view by phone number |
| 285 | Customers section: list, filters, search |
| 286 | Customer detail — orders, exchanges, support history, lifetime value |
| 287 | Segments from real behaviour, saved and reusable |
| 288 | Customer journey view: every touch, in order |
| 289 | **Journey builder** — triggers, waits, conditions, messages |
| 290 | Email marketing: templates, sends, and the delivery log |
| 291 | SMS adapter with masking approval, templates, delivery log |
| 292 | WhatsApp Business API adapter, templates, delivery log |
| 293 | **AI campaign writer** — the message drafted in the owner's voice |
| 294 | AI segment and timing suggestions, with the reasoning shown |
| 295 | Review requests after delivery, and the review manager behind them |
| 296 | Rewards and points, with the rules the owner sets |
| 297 | Customer tags and internal notes |
| 298 | Consent and opt-out handling, honoured across every channel |
| 299 | Customer export, with the retention rule applied |
| 300 | Win-back campaigns for customers who have stopped ordering |
| 301 | Birthday field capture, ready for the parked birthday module |
| 302 | Customer data retention: **customers are never auto-deleted** (answer 50). Only IP and GPS expire, at 180 days. Manual deletion stays available. |
| 303 | CRM report: new, returning, churned, by segment |

### S14 addition (approved 18 Oct)

| PR | What it does |
|---:|---|
| 505 | **Notification template editor** — every SMS, email and WhatsApp template, the auto-replies, and which event sends which message, all written and changed from the admin |

### S14 additions (answers 25, 44-K, 44-L, 44-M, 18 Oct)

| PR | What it does |
|---:|---|
| 533 | **Customer history summary at approval** — one screen: orders, true deliveries, charge-paid returns and their reasons, refusals, exchanges. What the approver reads before saying yes. |
| 534 | **Customer grading** — badges, levels and a verified mark earned from real delivery history, feeding the fraud engine's good-customer override |
| 535 | **Legacy customer import** — the existing business's order list brought in, de-duplicated, matched against new customers, so the shop opens with real history instead of an empty database |

## S15 · AI 360 Control Room — PR 304–341
*Every AI switch, schedule, cap and report lives here, whatever stage the engine itself sits in.*

| PR | What it does |
|---:|---|
| 304 | AI 360 home screen — what is running, what it cost, what it decided |
| 305 | **Master switch**, and per-agent keep-on behaviour |
| 306 | Multi-provider adapter: Anthropic, OpenAI, Google, OpenRouter, all dynamic |
| 307 | Per-agent model selection, with the recommendation note beside each |
| 308 | Per-agent schedule |
| 309 | **Per-agent monthly spend cap**, with the 80% warning and the 100% pause |
| 310 | **Data-class routing** — which class of data may reach which class of model |
| 311 | The masking layer applied before anything leaves the server |
| 312 | **AI Cost Book** — 60–90 job rows, searchable, with the model selector in the row |
| 313 | Estimate versus actual, and the self-correction that follows |
| 314 | What-if slider, and the Economy / Balanced / Premium presets |
| 315 | One shared usage ledger behind every figure |
| 316 | **Free-form cost calculator**, reachable from Telegram |
| 317 | The single approval queue — everything waiting on the owner, in one place |
| 318 | Permission matrix: what each agent may decide alone |
| 319 | **AI diary** — what each agent did, why, and what it changed |
| 320 | Bug box: the agent reports what it could not do |
| 321 | **Skill library** — import a skill, version it, roll it back |
| 322 | Skill sandbox: try a skill on real data without touching production |
| 323 | **Continuous skill training** — corrections become training examples |
| 324 | AI-off fallback: every agent has a rule or template path that works without AI |
| 325 | Support AI agent wiring |
| 326 | Product content AI agent |
| 327 | SEO and meta AI agent |
| 328 | Size advice AI agent |
| 329 | Fraud review AI agent |
| 330 | Growth marketing AI agent |
| 331 | Social content AI agent |
| 332 | Photoshoot studio AI orchestration |
| 333 | Analytics commentary agent — **explains the numbers, never invents one** |
| 334 | **System Q&A agent** — the owner asks the system how it works |
| 335 | **Competitor Teardown agent** — journey walker |
| 336 | Competitor comparison and report engine |
| 337 | Saved competitors, scheduling, and change alerts |
| 338 | **Site-wide analytics event layer** |
| 339 | Per-page funnels built on that layer |
| 340 | The report section: what happened, what changed, what to do |
| 341 | Weekly and monthly digests to Telegram and email |
| 577 | **Agent 360° profiles** — each of the fixed agents (seven since PR 581; five blog authors since PR 593) (প্রহরী Prohori, ভান্ডারী Bhandari, সওদাগর Sawdagor, শিল্পী Shilpi, দূত Doot, জ্ঞানী Gyani — renamed by the owner 19 Oct) has an employee-style profile in the AI 360 Control Room: role and owned stages, what it never touches, its plan, skills it has and skills it is learning (linked to the Skill Library, PR 321–323), work log (every task, PR, file), test results (device gate, QA checklist runs), performance (first-time-right rate, bugs found by the owner vs by itself, cost). The same agents (seven since PR 581) build the code and then run the live dashboard sections — no new agents, no re-teaching. **The owner edits each profile:** photo, name, bio, joining date, rewards, a verified ✓ star, and assignments with due dates. **Memory protocol** (agents/AGENT-PROTOCOL.md): before every task the agent loads its profile, standards, owned skills and recent work log and restates its duties; after every task the runner appends the work log automatically and any new lesson becomes a versioned skill (sandbox-tested, PR 322; approval-gated, PR 420); the library is in the nightly Google Drive backup. **Updated 20 Oct 02:01 (owner, CN-004): every change made in the site's AI panel to an agent profile, skill, curriculum or lesson is also written to GitHub** — the backend commits a copy to `docs/agents/live/<agent>/` in the repo (with date, who changed it, and what) through the deploy runner/GitHub API, so the repo always holds the current agents and skills next to the build-time ones; one-way export, the database stays the live source; failures retry and show on the Server page. |
| 578 | **Agent appraisal reports** — daily, weekly, monthly and yearly reports per agent, written like an employee's: what it did, what it left undone and why, what it learned, its history, KPIs against targets (first-time-right, bugs it found vs the owner found, rework, cost), and a yearly appraisal in the multinational style (goals, ratings, development plan). On demand or on schedule (Telegram / email). |
| 579 | **Agent curriculum and certification** — each agent's field is taught as a degree path (graduate → post-graduate → PhD level) from top-university syllabi and the field's standard texts, distilled into versioned skills in the library, with exams the agent must pass in the sandbox (PR 322) before a level is marked earned; levels and scores show on its profile (PR 577). |
| 580 | **Model auto-suggest with free-model qualification** — for every agent job the system suggests a model with its reason; the owner accepts or changes it. Free models are in the pool and are **qualified**: each job type has a quality test set, every candidate (paid or free) is scored, and the cheapest model that passes the job's quality bar is suggested — cost falls only when quality holds, never by lowering it. Shows quality per candidate, cost per 100 runs, monthly saving, last test date, "re-test now". Works with the spend caps (PR 309) and the cost book (PR 312–313). |
| 581 | **তীরন্দাজ Tirondaj — the seventh agent, ads specialist** (Google, Facebook, Instagram, YouTube, TikTok). Runs campaigns end to end inside the owner's guardrails: builds campaigns and audiences, assembles creatives (photos, video cuts, captions) from the studio, launches, tests, scales winners, cuts losers. **Guardrails enforced by code, not by the AI:** target sales, max cost per purchase, daily/monthly budget ceilings, auto-decrease allowed, **any budget increase only after the owner's approval** (with the reason), kill switch, every change logged. Instructions and approvals from the dashboard or Telegram. Works through the official platform APIs (Meta Marketing API, Google Ads API incl. YouTube, TikTok Marketing API) and the server-side purchase/delivery events (PR 257–258); builds on PR 259–261, 265–269, 531. |
| 582 | **Strong agent memory** — every agent gets a long-term memory store inside the system (facts, decisions, owner instructions, past campaigns/tasks and their outcomes, lessons), searchable by meaning, summarised weekly, loaded at the start of every task (PR 577 protocol), never deleted silently, backed up nightly to Google Drive; the owner can view and correct it. |
| 583 | **Chief agent — জ্ঞানী Gyani as virtual CEO (প্রধান এজেন্ট), chain of command.** The owner charges one agent; Gyani answers to him and charges the other six by their performance. Asked "why are sales down this month / this week?", "why was today's courier entry wrong?", "why is this bug on the category page?", Gyani investigates across every section (orders, ads, stock, delivery, site errors, the agents' work logs), names **which agent's area caused it, with evidence**, assigns the fix to that agent, tracks it to done and reports back. Broad knowledge beyond its own stages (business, finance, operations, marketing, tech) — curriculum adds an executive/general-management track. Second only to the owner. **Free to do:** research, reports, analysis, assigning and reviewing work, warnings to agents (written into their appraisals PR 578). **Only with the owner's approval:** any money movement or refund, any COD amount change on an order, price or discount changes, ad budget increases, blocking anyone, deleting data, anything that cannot be undone. The permission list is a dashboard setting the owner edits; enforced by code. Lives in S15 AI 360 (org chart, open investigations, who-owns-what). |
| 584 | **Telegram identity and command routing.** All agents share the owner's one Telegram bot. Every message starts with the sender's identity — photo/emoji, name, Bengali name, **employee code**, role (e.g. "🏹 Tirondaj তীরন্দাজ · A360-07 · Ads") — so the owner always knows who sent it. When the owner writes a command naming an agent or its code ("A360-07 budget report", "@Bhandari courier entry check"), the task is **assigned to that agent automatically**, appears on its profile as an assignment, and the agent replies in the same thread when done. No name → goes to the chief (Gyani), who routes it. Approvals come back as buttons (Approve / Reject / Ask why). Also visible in the dashboard. |
| 585 | **Continuous learning engine — Tirondaj (ads) and Doot (SEO/marketing) are the two power agents.** They learn without stopping from: official docs (Meta, Google, TikTok, Search Central), the big practitioner blogs on SEO and paid ads, Reddit communities (PPC, Facebook ads, SEO, e-commerce), YouTube tutorials incl. South-Asian e-commerce channels (read through transcripts), LinkedIn and Facebook posts of known specialists (where readable; through a paid tool if needed), case studies. **When stuck:** research all sources → solve → the solution becomes a skill in its basket. **Quality gate (no shortcut learning):** a tip becomes a skill only after it is checked against the official docs or two independent good sources, tested in a sandbox or small live test, and written with its source, date and confidence; tips that fail are recorded as "doesn't work for us". **Practice tasks with deadlines** (e.g. get a new page indexed within 3 days, a long-tail keyword into Google's top 10, a test campaign under the CPA cap) graded in their appraisals. **Paid data tools** (e.g. an SEO suite) proposed with cost and reason — the owner approves and pays. **Updated 20 Oct 02:01 (CN-004): skills the learning engine adds or updates are exported to `docs/agents/live/` the same way (PR 577).** |
