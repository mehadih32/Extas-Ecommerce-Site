// PR 284 (Blueprint B5.1, Note 24.1) — "Who looked at this customer": every open of a customer's page, and every copy or
// call of his full number, is one CustomerAccessLog row (append-only) with who and when. A copy or a call needs the
// full-number key (`customers.phone`): a person who only sees the masked number has nothing to copy. Reading the log
// needs the audit key (`audit.read`, the owner).
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
}

/** The latest rows of the log for these profiles (`audit.read`; the caller has checked it). */
export async function accessLogOf(db: Db, storeId: number, customerIds: readonly string[], take: number): Promise<AccessRow[]> {
  if (!customerIds.length || take < 1) return [];
  const rows = await db.customerAccessLog.findMany({ where: { storeId, customerId: { in: [...customerIds] } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take, select: { createdAt: true, action: true, staffUserId: true } });
  const ids = [...new Set(rows.map((r) => r.staffUserId).filter((x): x is string => !!x))];
  const names = new Map((ids.length ? await db.staffUser.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }) : []).map((s) => [s.id, s.displayName]));
  return rows.map((r) => ({ at: r.createdAt, action: r.action, by: r.staffUserId ? (names.get(r.staffUserId) ?? null) : null }));
}
