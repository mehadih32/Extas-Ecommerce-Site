# ERP SKU ও স্টক তুলনা — CN-045 job 4 (ম্যানুয়াল যাচাই, 12 Nov 2026)

**সারকথা:** এখনো আসল ERP-এর সাথে কোনো SKU/স্টক তুলনা হয়নি — দোষ ERP বা কোডে নয়, সার্ভারে এখনো নতুন ভার্সন (PR 654/655) পৌঁছায়নি। যেই ডিপ্লয় সফল হবে (নিজে থেকেই হবে, রাতের শিডিউল বা পরের ডিপ্লয়ে), তখনই প্রথম আসল রিপোর্ট আসবে — কাউকে কিছু চাপতে হবে না।

## i) "Our ERP" Test (PR 498-এর /health ঠিক করা, নেস্টেড শেপ)

কোড ঠিক আছে এবং ইউনিট টেস্টে পাস করে: `packages/adapters/src/erp/http-client.ts`-এর `healthSchema` এখন flat (প্র্যাকটিস ERP) আর nested (আসল ERP: `{ok, company:{name}, integration:{id,name,platform,warehouseId}, serverTime}`) — দুটো শেপই মেনে নেয় এবং একই `ErpHealth`-এ মেলায় (`packages/adapters/test/erp.test.ts`-এর দুটো নতুন PR 498 কেস, দুটোই পাস)।

এই sandbox থেকে অ্যাডমিনের "Test" বাটন সরাসরি চাপা যায় না (ভল্টের আসল চাবি বা ERP-এর ঠিকানার কোনো পথ এখান থেকে নেই — CN-003)। সবচেয়ে কাছের read-only, সার্ভার-সাইড পরীক্ষা হলো PR 654-এর নিজের স্ক্রিপ্ট (`erp-sku-stock-compare-cli.ts`), যেটা `reconcileWithErp` → `checkCompany` → `health()` ঠিক এই একই ঠিক-করা কোড চালায়, সব সময় `GET` দিয়ে। এটা self-hosted রানার (`extas-vm`)-এ `.github/workflows/erp-sku-stock-compare.yml` দিয়ে চালানো হয়েছে (run [43174629668](https://github.com/mehadih32/Extas-Ecommerce-Site/actions/runs/43174629668), সফল)।

**কিন্তু** সার্ভারের এখনকার মাইগ্রেট ইমেজ (`extas-migrate:cf8a3f814775`, PR 657) PR 498-এর ঠিক-করা কোডের চেয়েও পুরোনো। তাই `health()` এখনো আসল ERP-এর বিরুদ্ধে একবারও চলেনি — পরের সফল ডিপ্লয়ের পরের শিডিউল সিঙ্কেই প্রথম আসল যাচাই হবে (`/admin/stock`-এর sync health panel-এ দেখা যাবে), অথবা মালিক নিজে Settings → ERP link-এ "Test" চাপলে।

## ii) SKU/স্টক তুলনা (PR 654/655)

`erp-sku-stock-compare.yml` রান করেছে (read-only, সব `GET`, কোনো `POST`/`PATCH` নেই — `infra/deploy/erp-sku-stock-compare.sh` আর `erp-sku-stock-compare-cli.ts` পড়ে যাচাই করা)। এর নিজের উত্তর:

> `the version in extas-migrate:cf8a3f814775 has no SKU/stock compare yet: nothing run, nothing failed`

মানে সার্ভারে এখনো এই টুলটাই পৌঁছায়নি, তাই **মিসিং SKU, শপ-প্রাইস-না-থাকা SKU, বা স্টক পার্থক্যের কোনো সংখ্যা নেই** — শূন্য নয়, *এখনো চলেনিই*। এটা স্ক্রিপ্টের নিজের ডিজাইন করা, non-failing আচরণ (exit 0), কোনো ভুল না।

### কেন সার্ভার এখনো পুরোনো

- সার্ভারের শেষ সফল ডিপ্লয় (`be911dff`) PR 657-এর ইমেজ — `main`-এর চেয়ে কয়েকটা মার্জ পিছিয়ে (CN-043-এর PR 656, তারপর PR 654/655)।
- পরের ডিপ্লয় (কমিট `06ffb720de42`, CN-043) পোস্ট-ডিপ্লয় smoke test-এ ফেল করে, CN-016-এর নিয়মে নিজে থেকেই আগের ভার্সনে ফিরে গেছে (রোলব্যাক) — এটা নিজে থেকেই ঠিক কাজ করেছে, ERP-র সমস্যা না।
- এই চেক করার সময় PR 654/655-এর মার্জ কমিট (`2b603268`)-এর CI (device-gate + ১০-ভাগ lighthouse) তখনো চলছিল (~৪৫ মিনিট ধরে)। CI পাস করলে deploy.yml নিজে থেকেই পরের ডিপ্লয় চালাবে (কারো চাপার দরকার নেই, CN-006)।

### এখন কী হবে

কিছুই করার দরকার নেই — এটা নিজে থেকেই ঠিক হয়ে যাবে:
- পরের সফল ডিপ্লয়ে (এই কমিট বা তার পরের কোনো একটা) নতুন টুল সার্ভারে চলে আসবে, এবং
- `erp-sku-stock-compare.yml`-এর রাতের শিডিউল (ঢাকা সময় ভোর ৪:৩০) নিজে থেকেই প্রথম আসল তুলনা চালাবে এবং `docs/reports/erp-sku-stock-compare/latest/`-এ লিখে দেবে।

কেউ এটা আবার হাতে চালাতে চাইলে: GitHub Actions → `erp-sku-stock-compare` → Run workflow (self-hosted রানারে, read-only)।

## মালিকের কাছে কিছু আটকে নেই

এই পুরো জিনিসটা একটা সময়ের ব্যাপার (ডিপ্লয় লাইন ব্যস্ত), মালিকের কোনো সিদ্ধান্ত লাগে না — তাই `BLOCKED.md`-এ কিছু যোগ করা হয়নি।

---

## English (machine detail)

- **(i) Health-shape fix (PR 498):** confirmed fixed and unit-tested exactly for the real ERP's nested shape — `healthSchema` is now `z.union([flatHealthSchema, nestedHealthSchema])`, both mapped to `ErpHealth`; `companyId` is correctly `null` for the nested (real ERP) shape since its `company` object carries no id. Two new tests in `packages/adapters/test/erp.test.ts` cover this exactly (lines ~63–83), plus the existing 25-test suite and the rest of `@extas/adapters` (312 tests) stay green per the merge commit's own description (`b4bd2b95`/`691a8060`/`1cb8ef4e`, same change landed three times across rebases — final state on `main` via `2b603268`).
- No live confirmation of the "Our ERP" Test button or a real health() call against the live ERP was possible from this session: no SSH/vault path from this sandbox (CN-003), and the one headless path that does call `health()` against the live connection (`erp-sku-stock-compare-cli.ts`'s `buildSkuStockReport` → `reconcileWithErp` → `checkCompany` → `link.api.health(o)`) is served by a server image that predates both PR 498 and PR 654/655.
- **(ii) SKU/stock compare (PR 654/655):** code read end to end (`packages/inventory/src/erp-catalogue-compare.ts`, `packages/jobs/src/erp-sku-stock-compare-cli.ts`, `infra/deploy/erp-sku-stock-compare.sh`, `.github/workflows/erp-sku-stock-compare.yml`) — confirmed strictly GET-only (health, variants, stock), writes nothing to the ERP, its only database write is `reconcileWithErp`'s own `ErpSyncRun` audit row (same as the existing hourly `inventory.erp.reconcile` job already does). Dispatched via `gh workflow run erp-sku-stock-compare.yml --ref main` → run `43174629668`, completed successfully in 13s, exit 0, and its own "Commit the report" step pushed `docs/reports/erp-sku-stock-compare/latest/` to `main` directly (commit `02a5e7c7`) with `state: "NOT_IN_VERSION"`.
- **Root cause of no data:** the server's current migrate image (`extas-migrate:cf8a3f814775`, built from commit `cf8a3f81` = PR 657) predates the PR 654/655 merge (`2b603268`) by several commits. The deploy pipeline (`deploy.yml`, triggered by `workflow_run` of `ci.yml` on `main`) is working through a backlog: the attempt after PR 657 (commit `06ffb720de42`, CN-043) failed its post-deploy Playwright smoke test and auto-rolled back to PR 657's image per CN-016 (run `43169263398`); CI for `2b603268` itself (run `43169592458`) was still `queued`/in-progress (13 of ~22 jobs not yet completed — device-gate ×4 and lighthouse ×10 are slow) when this check was made. `deploy.yml` needs no manual trigger — it auto-fires once that CI run succeeds.
- **No defect found in PR 498 or PR 654/655's own code.** This is a deploy-timing gap, not an ERP-side or ERP-adapter bug; nothing here needs the owner's PIN, approval or any data entry, so no `BLOCKED.md` row was added.
- **Hard limits respected throughout:** no POST/PATCH to the ERP, no order/stock/money record touched, no v6 switch attempted or proposed, no vault key read, typed, or logged by this session.
