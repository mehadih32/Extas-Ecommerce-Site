// PR 284 (Blueprint B5.1, Note 24.1) — "Who looked at this customer": every open of a customer's page, and every copy or
// call of his full number, is one CustomerAccessLog row (append-only) with who and when. A copy or a call needs the
// full-number key (`customers.phone`): a person who only sees the masked number has nothing to copy. Reading the log
// needs the audit key (`audit.read`, the owner).
//
// Follow-up 477: with the owner's `customers.looksFold` on, the card shows repeated opens of the page by the same person
// within his minutes of each other as one line with a count (`count`, `from`). Only the card folds: every open stays a
// row of the log, and a copy or a call is always its own line.
import { z } from 'zod';
import { allow, parse, UUID, type CustomersDeps, type Db, type Who } from './context';
import { CustomersError } from './errors';

/** What is logged: a profile opened, the full number copied, the number called from the admin. */
export const ACCESS_ACTIONS = ['profile.open', 'phone.copy', 'phone.call'] as const;
export type AccessAction = (typeof ACCESS_ACTIONS)[number];

/** One row of the log (inside the caller's read or transaction). */
export async function logAccess(db: Db, storeId: number, customerId: string, staffUserId: string | null, action: AccessAction): Promise<void> {
  await db.customerAccessLog.create({ data: { storeId, customerId, staffUserId, action } });
}

export const accessInput = z.object({ action: z.enum(['phone.copy', 'phone.call']) }).strict();

/** The admin's copy or call of a customer's full number, logged before the browser gets the number. */
export async function recordPhoneAccess(deps: CustomersDeps, who: Who, customerId: string, input: unknown): Promise<{ logged: AccessAction }> {
  const d = parse(accessInput, input, 'access');
  await allow(deps, who, 'customers.phone');
  if (!UUID.test(customerId)) throw new CustomersError('NOT_FOUND', 'no such customer', ['customerId']);
  const c = await deps.db.customer.findFirst({ where: { id: customerId, storeId: who.storeId }, select: { id: true, phone: true } });
  if (!c?.phone) throw new CustomersError('NOT_FOUND', 'no such customer', ['customerId']);
  await logAccess(deps.db, who.storeId, c.id, who.actor.staffUserId, d.action);
  return { logged: d.action };
}

export interface AccessRow {
  at: Date;
  action: string;
  /** The staff member's name (the system or a removed account: null). */
  by: string | null;
  /** Follow-up 477: the opens this line stands for (1 unless folded) and the earliest of them. */
  count: number;
  from: Date;
}

/** Follow-up 477: the actions the card may fold (opening the page); a copy or a call of the number never folds. */
export const FOLDED_ACTIONS: ReadonlySet<string> = new Set<AccessAction>(['profile.open']);

/** A safety bound on the log rows read to fill a folded card (not a business number). */
export const FOLD_READ_FACTOR = 20; // hardcode-ok: a read bound, not a business figure

interface RawAccess {
  createdAt: Date;
  action: string;
  staffUserId: string | null;
}

/** Follow-up 477: newest-first log rows as card lines — an open within `minutes` of the same person's next-newer open folds
 * into that line (null minutes: no folding). Pure. */
export function foldAccess(rows: readonly RawAccess[], minutes: number | null): (RawAccess & { count: number; from: Date })[] {
  const out: (RawAccess & { count: number; from: Date })[] = [];
  const gap = minutes === null ? -1 : minutes * 60_000;
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && gap >= 0 && FOLDED_ACTIONS.has(r.action) && last.action === r.action && last.staffUserId === r.staffUserId && last.from.getTime() - r.createdAt.getTime() <= gap) {
      last.count += 1;
      last.from = r.createdAt;
      continue;
    }
    out.push({ ...r, count: 1, from: r.createdAt });
  }
  return out;
}

/** The latest lines of the log for these profiles (`audit.read`; the caller has checked it); `foldMinutes` (follow-up 477)
 * folds repeated opens by the same person, null: one line per row. */
export async function accessLogOf(db: Db, storeId: number, customerIds: readonly string[], take: number, foldMinutes: number | null = null): Promise<AccessRow[]> {
  if (!customerIds.length || take < 1) return [];
  const raw = await db.customerAccessLog.findMany({ where: { storeId, customerId: { in: [...customerIds] } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: foldMinutes === null ? take : take * FOLD_READ_FACTOR, select: { createdAt: true, action: true, staffUserId: true } });
  const rows = foldAccess(raw, foldMinutes).slice(0, take);
  const ids = [...new Set(rows.map((r) => r.staffUserId).filter((x): x is string => !!x))];
  const names = new Map((ids.length ? await db.staffUser.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }) : []).map((s) => [s.id, s.displayName]));
  return rows.map((r) => ({ at: r.createdAt, action: r.action, by: r.staffUserId ? (names.get(r.staffUserId) ?? null) : null, count: r.count, from: r.from }));
}
