// PR 563 (follow-up 51) — the call queue the order landed in. An order is never held over an address: the checkout
// places it and leaves a call task (address unclear, charge not set, address check, a failed payment), and the order
// service's timers add theirs (a long hold, an overdue advance, a duplicate to ask about). This is the list the AI or an
// agent works through; reading it needs `orders.read`. Working a task (who calls, the outcome) is the call screen's
// (PR 545, with the admin shell): nothing here changes an order, holds it or blocks anyone.
import type { Prisma } from '@extas/db/client';
import { z } from 'zod';
import { allow, parse, setting, type OrdersDeps, type Who } from './context';

/** The reasons the shop's own steps give a call task (CallTask.reason). */
export const CALL_TASK_REASONS = ['ADDRESS_UNCLEAR', 'CHARGE_NOT_SET', 'ADDRESS_CHECK', 'PAYMENT_FAILED', 'HOLD_REVIEW', 'ADVANCE_OVERDUE', 'DUPLICATE_CHECK', 'ADDRESS_CHANGED', 'TWO_SIZE', 'SELF_CONFIRM_NO_REPLY', 'SELF_CONFIRM_CHANGE', 'SELF_CONFIRM_CANCEL'] as const;

export const callQueueQuery = z
  .object({
    /** One reason, or every reason. */
    reason: z.string().trim().min(1).max(60).optional(),
    status: z.enum(['open', 'closed', 'all']).default('open'),
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();

export interface CallRow {
  taskId: string;
  reason: string;
  status: string;
  createdAt: Date;
  dueAt: Date | null;
  closedAt: Date | null;
  outcome: string | null;
  /** The order the call is about (null for a task with no order). */
  order: {
    id: string;
    number: string;
    status: string;
    customerName: string | null;
    phone: string | null;
    /** What he typed, as he typed it; the full address we hold for packing, when one was attached (PR 561). */
    shippingAddressText: string | null;
    backfilledAddress: string | null;
    addressUnclear: boolean;
    chargeFixed: boolean;
    flags: string[];
    placedAt: Date;
  } | null;
}

const OPEN = ['OPEN', 'IN_PROGRESS'] as const;

/** The call queue: open tasks oldest first (the longest wait on top), or the closed ones newest first. */
export async function callQueue(deps: OrdersDeps, who: Who, query: unknown = {}): Promise<{ rows: CallRow[]; next: string | null }> {
  await allow(deps, who, 'orders.read');
  const q = parse(callQueueQuery, query, 'query');
  const take = q.limit ?? (await setting(deps, who.storeId, 'orders.list.pageSize'));
  const where: Prisma.CallTaskWhereInput = {
    storeId: who.storeId,
    ...(q.reason ? { reason: q.reason } : {}),
    ...(q.status === 'open' ? { status: { in: [...OPEN] } } : q.status === 'closed' ? { status: { notIn: [...OPEN] } } : {}),
  };
  const tasks = await deps.db.callTask.findMany({ where, orderBy: [{ createdAt: q.status === 'open' ? 'asc' : 'desc' }, { id: 'asc' }], take: take + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) });
  const page = tasks.slice(0, take);
  const ids = [...new Set(page.map((t) => t.orderId).filter((x): x is string => !!x))];
  const orders = new Map(
    (
      await deps.db.order.findMany({
        where: { storeId: who.storeId, id: { in: ids } },
        select: { id: true, number: true, status: true, customerName: true, phone: true, shippingAddressText: true, backfilledAddress: true, addressUnclear: true, chargeFixed: true, flags: true, placedAt: true },
      })
    ).map((o) => [o.id, o]),
  );
  const rows: CallRow[] = page.map((t) => ({
    taskId: t.id,
    reason: t.reason,
    status: t.status,
    createdAt: t.createdAt,
    dueAt: t.dueAt,
    closedAt: t.closedAt,
    outcome: t.outcome,
    order: t.orderId ? (orders.get(t.orderId) ?? null) : null,
  }));
  return { rows, next: tasks.length > take ? page[page.length - 1]!.id : null };
}
