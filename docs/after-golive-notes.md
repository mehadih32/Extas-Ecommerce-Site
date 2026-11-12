# After go-live notes (CN-037)

New ideas, leftovers and "better later" thoughts found from 7 Nov 2026 onward, while the Follow-ups table in
`PROGRESS.md` is closed (CN-037, `docs/reports/2026-11-07-golive-must-list.md`). A plain list, not a register table —
nothing here is built until the owner says to resume the CAN-wait / After-launch work.

- Batch 20 integration (7 Nov): two lane-b commits — PR 521 follow-up 346 and PR 520 follow-up 343's review-page half —
  write to `apps/web/src/app/admin/orders/risk/page.tsx` and `apps/web/src/lib/admin-orders/risk-queue.ts`, the
  ORD-03 risk review queue page. That base page was never merged to `main` (it sits only on an orphaned, un-merged
  commit deep in lane B's own branch history, from an earlier PR 541 follow-up that never reached main). Both
  commits were left out of batch 20 rather than also pulling in the missing base page, which was out of scope for
  that integration. CAN-wait: build the ORD-03 review queue page first, then redo these two follow-ups on top of it.
- PR 467 (12 Nov, S24, C7.22 item 24): investigating the "download-watermark pipeline" found it already fully built
  under S01 · PR 23 (`@extas/media`'s `watermark.ts` + `serve.ts`'s `downloadCopy`), and confirmed with a new
  integration test (`packages/photoshoot/src/downloadWatermark.db.test.ts`) that a Studio render needs zero new
  watermark code once it reaches `ProductMedia` — `downloadCopy`'s own query is generic (`kind: 'IMAGE'` +
  `isOriginal`/`isAiGenerated` both pass, no special case). Two real, separate gaps found while proving that, left
  open rather than guessed at inside a thin confirmation PR:
  - **No video watermark path anywhere.** `downloadCopy` is hardcoded to JPEG/`kind: 'IMAGE'`. C7.11's own "same for
    video" line is never built. S24 only ever produces stills, so this is not S24's own gap to close — it belongs
    with S25 (C7.14: "the first frame of every clip is an already-approved S24 still"), once a real clip exists to
    watermark. CAN-wait until S25 builds its own download/save path.
  - **The job's own `APPROVED -> PUBLISHED` transition (`jobs.ts`, C7.6's own "approved → published") and the
    `photoshoot.publish` permission are defined but nothing ever calls them.** The actual, working way an approved
    Studio image reaches a product's gallery today is the generic, already-built `attachToProduct` (`@extas/media`)
    — any admin screen that lets staff pick a media-library photo for a product already works on an approved
    Studio render, same as any other photo, with no extra code. The dead transition is a bookkeeping gap, not a
    watermark gap: closing it needs a product decision (does "Publish" become its own button on the review page,
    calling `attachToProduct` + `transitionJob(..., 'PUBLISHED')` together, and with which gallery role/colour?) —
    not something to improvise inside PR 467. CAN-wait: a small follow-up PR in `@extas/photoshoot` once that shape
    is decided; it would call into `@extas/media`'s own `attachToProduct` (never modify that package) and only then
    move the job to `PUBLISHED`.
