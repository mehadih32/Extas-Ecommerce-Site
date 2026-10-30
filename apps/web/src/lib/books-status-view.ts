// CN-028 · PR 617 — the Books status card's data: PR 616's `booksStatus(deps, who)` from @extas/inventory
// (books-view.ts). The card must never take the Daily summary page down (qa-gate): the call is caught and logged, and an
// answer that is not the documented shape is dropped. Either way the card says "not run yet" and shows no number it does
// not have. `BooksStatusView` is that function's documented shape; the card (components/admin/money/BooksStatusCard.tsx)
// reads only these fields.
import { z } from 'zod';
import * as inv from '@extas/inventory';

export type BooksCheckName = 'ACCOUNT' | 'TIES' | 'RETURNS' | 'SUMMARY' | 'FIXED_COSTS' | 'ORDERS';

const CHECKS = ['ACCOUNT', 'TIES', 'RETURNS', 'SUMMARY', 'FIXED_COSTS', 'ORDERS'] as const;
const minorOrNull = z.number().int().nullable();
const count = z.number().int().nonnegative();

/** The documented shape of `booksStatus` (PR 616); extra fields are allowed and passed through. */
const STATUS = z.looseObject({
  model: z.enum(['v5', 'v6']),
  link: z.looseObject({ id: z.string(), epoch: z.number().int(), switchDate: z.string().nullable() }).nullable(),
  balanceMinor: minorOrNull,
  erpBalanceMinor: minorOrNull,
  waitingCheckMinor: minorOrNull,
  exchangesAtRiskMinor: minorOrNull,
  open: z.looseObject({ total: count, byClass: z.record(z.string(), count), byCheck: z.partialRecord(z.enum(CHECKS), count) }),
  matchedDays: count,
  totalDays: count,
  partialChecks: z.array(z.enum(CHECKS)),
  monthsClosed: count,
  lastRun: z
    .looseObject({ id: z.string(), trigger: z.string(), status: z.string(), from: z.string(), through: z.string(), differences: count, startedAt: z.string(), finishedAt: z.string().nullable(), error: z.string().nullable() })
    .nullable(),
  closesChain: z.looseObject({ ok: z.boolean(), days: count, periods: count }),
});

export type BooksStatusView = z.infer<typeof STATUS>;

type StatusFn = (deps: inv.InventoryDeps, who: inv.Who) => Promise<unknown>;

/**
 * The books at a glance (PR 616), or null when there is nothing safe to show: the function is missing, it failed (logged
 * on the server, never shown), or its answer is not the documented shape. Its own permission check applies. `fn` is the
 * test seam; the page passes nothing.
 */
export async function loadBooksStatus(deps: inv.InventoryDeps, who: inv.Who, fn: StatusFn | undefined = inv.booksStatus): Promise<BooksStatusView | null> {
  if (typeof fn !== 'function') return null;
  let raw: unknown;
  try {
    raw = await fn(deps, who);
  } catch (e) {
    console.error(`[books status card] ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    return null;
  }
  const parsed = STATUS.safeParse(raw);
  if (!parsed.success) {
    console.error(`[books status card] unexpected shape: ${parsed.error.issues.map((i) => i.path.join('.') || '(root)').join(', ')}`);
    return null;
  }
  return parsed.data;
}
