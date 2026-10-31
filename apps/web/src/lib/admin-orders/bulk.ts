// PR 152 — the order list's bulk status change (demo V12.3 a2List bulk bar, 97o/97r; §5.0 bulk actions), client-safe:
// which of the ticked orders each command may run on (the order machine's own plan, @extas/orders/pure, on the row's
// facts) and why the others are skipped, and the run itself: one order after another through the same admin API as the
// order page, each with its own Idempotency-Key and version, each with its own result. The service checks every order
// again; a list that is out of date only means that order is reported as not done (STALE), never a wrong change.
// Only status commands that move no money: Confirm, Hold (with a reason from the owner's list) and Release.
import { plan, type MachineOrder, type OrderCommand, type RefusalCode } from '@extas/orders/pure';
import { commandUrl, newKey, send, type CommandAnswer } from './commands';
import type { BulkFacts } from './list';

export const BULK_COMMANDS = ['confirm', 'hold', 'release'] as const;
export type BulkCommand = (typeof BULK_COMMANDS)[number];

/** The key each bulk command needs (the admin API's own). */
export const BULK_PERM: Readonly<Record<BulkCommand, string>> = { confirm: 'orders.confirm', hold: 'orders.hold', release: 'orders.hold' };

export interface BulkRow {
  id: string;
  number: string;
  facts: BulkFacts;
}

/** The machine's view of a row. Confirm, hold and release never look at money, so paid and advance stay empty. */
export const machineOf = (f: BulkFacts): MachineOrder => ({ status: f.status, booked: f.booked, cancelPending: f.cancelPending, cancelRequested: f.cancelRequested, inReview: f.inReview, holdFromStatus: null, paidMinor: 0, advanceRequiredMinor: null });

/** Why an order is skipped: the machine's refusal, or (not possible from its status) the status itself. */
export type SkipWhy = { code: Exclude<RefusalCode, 'ILLEGAL_TRANSITION'> } | { status: BulkFacts['status'] };

export interface BulkPlan {
  run: BulkRow[];
  skipped: { row: BulkRow; why: SkipWhy }[];
  /** The skip reasons with how many orders each, in the order first seen (for the bar's "2 Confirmed will be skipped"). */
  reasons: { why: SkipWhy; n: number }[];
}

const whyKey = (w: SkipWhy) => ('code' in w ? `code:${w.code}` : `status:${w.status}`);

/** Which ticked orders the command runs on, and why the rest are skipped. */
export function bulkPlan(c: BulkCommand, rows: readonly BulkRow[]): BulkPlan {
  const run: BulkRow[] = [];
  const skipped: BulkPlan['skipped'] = [];
  const count = new Map<string, { why: SkipWhy; n: number }>();
  for (const row of rows) {
    const p = plan(c as OrderCommand, machineOf(row.facts));
    if (p.ok) {
      run.push(row);
      continue;
    }
    const why: SkipWhy = p.code === 'ILLEGAL_TRANSITION' ? { status: row.facts.status } : { code: p.code };
    skipped.push({ row, why });
    const k = whyKey(why);
    const had = count.get(k);
    if (had) had.n += 1;
    else count.set(k, { why, n: 1 });
  }
  return { run, skipped, reasons: [...count.values()] };
}

/** The body of one order's command: the version it was ticked at, and the dialog's fields (empty ones left out). */
export function bulkBody(row: BulkRow, fields: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) if (v.trim()) out[k] = v.trim();
  out.version = row.facts.version;
  return out;
}

export interface BulkResult {
  id: string;
  number: string;
  ok: boolean;
  /** The refusal's code when it did not work (STALE, FORBIDDEN, network …). */
  code?: string;
}

/**
 * Runs the command on each order in turn (never in parallel: one order's answer is known before the next is sent),
 * each with its own key, and reports every order's result. `progress` is told after each one.
 */
export async function runBulk(c: BulkCommand, rows: readonly BulkRow[], fields: Record<string, string>, progress?: (done: number, results: BulkResult[]) => void, sender: (url: string, body: Record<string, unknown>, key: string) => Promise<CommandAnswer> = send): Promise<BulkResult[]> {
  const results: BulkResult[] = [];
  for (const row of rows) {
    const a = await sender(commandUrl(row.id, c), bulkBody(row, fields), newKey());
    results.push(a.ok ? { id: row.id, number: row.number, ok: true } : { id: row.id, number: row.number, ok: false, code: a.code });
    progress?.(results.length, [...results]);
  }
  return results;
}

/** The message key of a skip reason or a failed order's code (`orders.bulk.why.*`; a status uses its own name). */
export function whyText(w: SkipWhy | { failed: string }): { key: string; status?: string } {
  if ('status' in w) return { key: `orders.st.${w.status}` };
  const code = 'code' in w ? w.code : w.failed;
  return { key: (BULK_WHY as readonly string[]).includes(code) ? `orders.bulk.why.${code}` : 'orders.bulk.why.other' };
}

/** The codes the bar and the results have short words for. */
export const BULK_WHY = ['CANCEL_REQUESTED', 'IN_REVIEW', 'CANCEL_PENDING', 'BOOKED', 'NOT_BOOKED', 'NO_CANCEL_PENDING', 'NO_CANCEL_REQUEST', 'ADVANCE_SHORT', 'PAYMENT_DUE', 'ILLEGAL_TRANSITION', 'STALE', 'REASON_REQUIRED', 'FORBIDDEN', 'UNAUTHENTICATED', 'NOT_FOUND', 'network'] as const;
