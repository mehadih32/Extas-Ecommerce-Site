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
