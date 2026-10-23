// PR 138 — the one order service (BACKEND-ARCHITECTURE §6.5.1, §7.1, §7.7, §9.2). Every change of an order's status,
// and of the flags that steer it, goes through `execute()` here; nothing else writes Order.status (the checkout only
// creates an order in its first state, PR 125). One command, one transaction:
//
//   1. the idempotency key, when the caller sends one (§7.7: money, booking, bulk and send commands): the same key with
//      the same request gives the first answer back; with another request it is refused (IDEMPOTENCY_MISMATCH);
//   2. the order's row lock (SELECT … FOR UPDATE), so two commands on one order run one after the other — the second
//      sees what the first did and is refused when it no longer fits (ILLEGAL_TRANSITION), never a lost update;
//   3. the version check [ver]: a command sent with the version the screen showed is refused with STALE (and the fresh
//      order) when someone changed the order in between;
//   4. the machine's plan (pure.ts): from this state, with these guards, to that state — or the refusal with the
//      commands open now;
//   5. the command's own effects (stock released, refund requested, the ERP document queued, …);
//   6. the order row (status, version + 1), an OrderEvent (who, when, from, to, the reason) and an AuditLog row
//      (before → after), all in the same transaction. OrderEvent and AuditLog are append-only at the database (PR 139).
import { createHash } from 'node:crypto';
import type { Actor, RequestContext } from '@extas/auth';
import { Prisma } from '@extas/db/client';
import { enqueueOrderPush, enqueueOrderStatus, releaseOrderHolds, type InventoryDeps } from '@extas/inventory';
import { nowOf, setting, TX, type Db, type OrdersDeps, type Tx } from './context';
import { OrdersError } from './errors';
import { plan, type MachineOrder, type OrderCommand, type OrderState } from './pure';

/** The kinds of actor the timeline and the audit log know (STAFF, CUSTOMER, SYSTEM, COURIER, ERP, AI_AGENT). */
export type ActorType = Prisma.OrderEventUncheckedCreateInput['actorType'];

/** Who made a change, for the timeline and the audit log. */
export interface By {
  actorType: ActorType;
  actorId: string | null;
  /** Where it came from: admin, shop, system, courier, erp, support … (B1.10). */
  source: string;
  ctx?: RequestContext;
}

/** A staff member (or the system) acting through the admin API. */
export const staffBy = (actor: Actor, ctx?: RequestContext, source = 'admin'): By => ({ actorType: actor.staffUserId ? 'STAFF' : 'SYSTEM', actorId: actor.staffUserId, source, ctx });

/** The system acting by itself (a hook, a job). */
export const systemBy = (source = 'system'): By => ({ actorType: 'SYSTEM', actorId: null, source });

export interface CommandOptions {
  /** §7.7: the `Idempotency-Key` the screen sent; a repeat with the same request gets the first answer. */
  idempotencyKey?: string;
  /** [ver]: the order's version the screen showed; a newer one on the server is refused with STALE. */
  version?: number;
}

export interface CommandResult {
  orderId: string;
  number: string;
  command: string;
  from: OrderState;
  status: OrderState;
  version: number;
  /** The refund requests this command recorded (a paid order's cancel); requests only, no money moved. */
  refundRequestIds: string[];
  /** The same idempotency key and request were seen before: this is the first answer again. */
  replay: boolean;
}

/** The order row as a command reads it under its lock. */
export const LOCKED_SELECT = {
  id: true,
  storeId: true,
  number: true,
  status: true,
  version: true,
  customerId: true,
  visitorId: true,
  phone: true,
  customerName: true,
  shippingAddressText: true,
  backfilledAddress: true,
  fulfillmentType: true,
  currency: true,
  paymentMethod: true,
  totalMinor: true,
  walletAppliedMinor: true,
  paidMinor: true,
  codAmountMinor: true,
  deliveryChargeMinor: true,
  note: true,
  holdFromStatus: true,
  holdReasonCode: true,
  holdReason: true,
  onHoldSince: true,
  cancelReasonCode: true,
  cancelNote: true,
  cancelRequestedAt: true,
  cancelRequestReason: true,
  cancelPending: true,
  customerWantsChange: true,
  advanceRequiredMinor: true,
  advanceDueAt: true,
  internalFlags: true,
  orderGroupId: true,
  placedAt: true,
} satisfies Prisma.OrderSelect;
export type LockedOrder = Prisma.OrderGetPayload<{ select: typeof LOCKED_SELECT }>;

/** What a command found besides the row: the active shipment (booked = it exists) and an open review. */
export interface OrderFacts {
  shipment: { id: string; status: string } | null;
  inReview: boolean;
}

/** What a command's own effects hand back to `execute()`. */
export interface Effect {
  /** More fields of the order row (status and version are set by `execute()`). */
  data?: Prisma.OrderUncheckedUpdateInput;
  reasonCode?: string | null;
  message?: string | null;
  eventData?: Record<string, unknown>;
  refundRequestIds?: string[];
}

export interface CommandSpec {
  command: OrderCommand;
  /** The request as sent (for the idempotency hash and the audit row). */
  input?: Record<string, unknown>;
  /** Checks that need the locked order (a reason the owner's list has, a request to answer …); throw to refuse. */
  check?: (o: LockedOrder, f: OrderFacts) => void | Promise<void>;
  effect?: (tx: Tx, o: LockedOrder, f: OrderFacts, at: { from: OrderState; to: OrderState; now: Date }) => Promise<Effect>;
}

const json = (v: unknown) => (v === undefined || v === null ? Prisma.DbNull : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));
const hashOf = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const isUnique = (e: unknown) => (e as { code?: string }).code === 'P2002';
const scopeOf = (storeId: number) => `orders.command:${storeId}`;

/** The order fields the machine reads (besides the facts). */
export const MACHINE_SELECT = { id: true, storeId: true, status: true, cancelPending: true, cancelRequestedAt: true, holdFromStatus: true, paidMinor: true, advanceRequiredMinor: true } satisfies Prisma.OrderSelect;
export type MachineRow = Pick<LockedOrder, keyof typeof MACHINE_SELECT>;

/** The machine's view of an order (read under its lock for a command; without one for a screen). */
export const machineOf = (o: MachineRow, f: OrderFacts): MachineOrder => ({
  status: o.status as OrderState,
  booked: f.shipment !== null,
  cancelPending: o.cancelPending,
  cancelRequested: o.cancelRequestedAt !== null,
  inReview: f.inReview,
  holdFromStatus: (o.holdFromStatus as OrderState | null) ?? null,
  paidMinor: o.paidMinor,
  advanceRequiredMinor: o.advanceRequiredMinor,
});

/** A shipment that counts as "booked": anything but a failed or cancelled booking (D5). */
export const NOT_BOOKED_SHIPMENT = ['BOOKING_FAILED', 'CANCELLED'] as const;

/** Locks the order row (and only that row) for the rest of the transaction; refuses an order of another store. */
export async function lockOrder(tx: Tx, storeId: number, orderId: string): Promise<LockedOrder> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id"::text AS id FROM "Order" WHERE "id" = ${orderId}::uuid AND "storeId" = ${storeId} FOR UPDATE`;
  if (!rows.length) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  return tx.order.findUniqueOrThrow({ where: { id: orderId }, select: LOCKED_SELECT });
}

export async function factsOf(tx: Db, o: Pick<LockedOrder, 'id' | 'storeId'>): Promise<OrderFacts> {
  const [shipment, open] = await Promise.all([
    tx.shipment.findFirst({ where: { storeId: o.storeId, orderId: o.id, status: { notIn: [...NOT_BOOKED_SHIPMENT] } }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true } }),
    tx.fraudAlert.count({ where: { storeId: o.storeId, orderId: o.id, status: 'OPEN' } }),
  ]);
  return { shipment, inReview: open > 0 };
}

/** The order fields the audit row keeps before and after a command. */
const auditView = (o: Partial<LockedOrder>) => ({
  status: o.status,
  version: o.version,
  holdReasonCode: o.holdReasonCode,
  cancelReasonCode: o.cancelReasonCode,
  cancelPending: o.cancelPending,
  cancelRequestedAt: o.cancelRequestedAt,
  customerWantsChange: o.customerWantsChange,
  advanceRequiredMinor: o.advanceRequiredMinor,
  internalFlags: o.internalFlags,
  orderGroupId: o.orderGroupId,
});

/** One AuditLog row (same transaction as the change), with any actor type (a customer cancels his own order). */
export async function auditRow(tx: Tx, by: By, entry: { storeId: number; action: string; entityType: string; entityId: string; before: unknown; after: unknown }): Promise<void> {
  await tx.auditLog.create({
    data: {
      storeId: entry.storeId,
      actorType: by.actorType,
      actorId: by.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: json(entry.before),
      after: json(entry.after),
      ip: by.ctx?.ip ? by.ctx.ip.slice(0, 64) : null,
      userAgent: by.ctx?.userAgent ? by.ctx.userAgent.slice(0, 512) : null,
      source: by.ctx?.source ?? by.source,
    },
  });
}

/** One timeline row. */
export async function eventRow(
  tx: Tx,
  by: By,
  e: { storeId: number; orderId: string; type: string; from?: OrderState | null; to?: OrderState | null; reasonCode?: string | null; message?: string | null; data?: Record<string, unknown> },
): Promise<void> {
  await tx.orderEvent.create({
    data: {
      storeId: e.storeId,
      orderId: e.orderId,
      type: e.type,
      fromStatus: e.from ?? null,
      toStatus: e.to ?? null,
      reasonCode: e.reasonCode ?? null,
      message: e.message ?? null,
      data: json(e.data),
      actorType: by.actorType,
      actorId: by.actorId,
      source: by.source,
    },
  });
}

/** The answer a command with this idempotency key already gave, or null when the key is new. */
async function replayOf(deps: OrdersDeps, storeId: number, key: string, hash: string): Promise<CommandResult | null> {
  const row = await deps.db.idempotencyKey.findUnique({ where: { scope_key: { scope: scopeOf(storeId), key } } });
  if (!row || !row.completedAt) return null;
  if (row.requestHash !== hash) throw new OrdersError('IDEMPOTENCY_MISMATCH', 'this key was used for another request', ['idempotencyKey']);
  return { ...(row.responseBody as unknown as CommandResult), replay: true };
}

function checkKey(key: string | undefined): void {
  if (key !== undefined && !/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new OrdersError('INVALID_INPUT', 'the idempotency key is not valid', ['idempotencyKey']);
}

/**
 * Runs one command on one order. Every order command of every stage comes through here (the hooks of S06–S08 too),
 * so the lock, the version, the plan, the timeline and the audit row are never skipped.
 */
export async function execute(deps: OrdersDeps, ref: { storeId: number; orderId: string }, by: By, spec: CommandSpec, opts: CommandOptions = {}): Promise<CommandResult> {
  checkKey(opts.idempotencyKey);
  const hash = hashOf({ command: spec.command, orderId: ref.orderId, input: spec.input ?? {}, version: opts.version ?? null });
  if (opts.idempotencyKey) {
    const again = await replayOf(deps, ref.storeId, opts.idempotencyKey, hash);
    if (again) return again;
  }
  const replayHours = opts.idempotencyKey ? await setting(deps, ref.storeId, 'orders.commands.replayHours') : 0;
  const now = nowOf(deps);
  try {
    return await deps.db.$transaction(async (tx) => {
      if (opts.idempotencyKey) {
        // The key first: a second press waits here until the first one is done, then gets its answer (below).
        await tx.idempotencyKey.create({ data: { scope: scopeOf(ref.storeId), key: opts.idempotencyKey, requestHash: hash, expiresAt: new Date(now.getTime() + replayHours * 3_600_000) } });
      }
      const o = await lockOrder(tx, ref.storeId, ref.orderId);
      await deps.hooks?.afterLock?.(o.id);
      if (opts.version !== undefined && opts.version !== o.version) {
        throw new OrdersError('STALE', 'the order changed since it was read', ['version'], { version: o.version, status: o.status });
      }
      const f = await factsOf(tx, o);
      const p = plan(spec.command, machineOf(o, f));
      if (!p.ok) throw new OrdersError(p.code, `${spec.command} is not open for this order (${p.from})`, [], { from: p.from, allowed: p.allowed });
      await spec.check?.(o, f);
      const eff = (await spec.effect?.(tx, o, f, { from: p.from, to: p.to, now })) ?? {};
      const after = await tx.order.update({
        where: { id: o.id },
        data: { ...eff.data, ...(p.moves ? { status: p.to } : {}), version: { increment: 1 } },
        select: LOCKED_SELECT,
      });
      await eventRow(tx, by, {
        storeId: o.storeId,
        orderId: o.id,
        type: `order.${spec.command}`,
        from: p.from,
        to: p.moves ? p.to : null,
        reasonCode: eff.reasonCode ?? null,
        message: eff.message ?? null,
        data: eff.eventData,
      });
      await auditRow(tx, by, { storeId: o.storeId, action: `order.${spec.command}`, entityType: 'Order', entityId: o.id, before: auditView(o), after: { ...auditView(after), input: spec.input ?? null } });
      const result: CommandResult = {
        orderId: o.id,
        number: o.number,
        command: spec.command,
        from: p.from,
        status: after.status as OrderState,
        version: after.version,
        refundRequestIds: eff.refundRequestIds ?? [],
        replay: false,
      };
      if (opts.idempotencyKey) {
        await tx.idempotencyKey.update({
          where: { scope_key: { scope: scopeOf(ref.storeId), key: opts.idempotencyKey } },
          data: { completedAt: now, responseStatus: 200, responseBody: json(result) },
        });
      }
      return result;
    }, TX);
  } catch (e) {
    // Two presses at the same moment: the second waited for the first and finds its answer.
    if (opts.idempotencyKey && isUnique(e)) {
      const again = await replayOf(deps, ref.storeId, opts.idempotencyKey, hash);
      if (again) return again;
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Effects shared by several commands
// ---------------------------------------------------------------------------------------------------------------------

/** The inventory's dependencies: the app's (with the ERP connection) or one that only releases holds. */
export function inventoryOf(deps: OrdersDeps): InventoryDeps {
  if (deps.inventory) return deps.inventory;
  const none = {
    use: () => {
      throw new OrdersError('INVALID_INPUT', 'no ERP connection here');
    },
  } as unknown as InventoryDeps['connections'];
  return { db: deps.db, settings: deps.settings, now: deps.now, connections: none };
}

/**
 * D6 — the confirmed order goes to the ERP (an outbox row, sent by the relay; the practice ERP keeps it waiting).
 * PR 127: an order whose lines changed after it was sent goes again as `revision` 1, 2, … (its own idempotency key).
 */
export async function queueErpOrder(deps: OrdersDeps, tx: Tx, o: LockedOrder, revision?: number): Promise<string> {
  const items = await tx.orderItem.findMany({ where: { storeId: o.storeId, orderId: o.id, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select: { sku: true, quantity: true, unitPriceMinor: true, discountMinor: true } });
  const r = await enqueueOrderPush(
    inventoryOf(deps),
    {
      storeId: o.storeId,
      orderId: o.id,
      externalOrderId: o.number,
      customerName: o.customerName?.trim() || o.phone || o.number,
      customerPhone: o.phone || o.number,
      shippingAddress: (o.backfilledAddress || o.shippingAddressText || '').trim() || o.fulfillmentType,
      items: items.map((i) => ({ sku: i.sku, quantity: i.quantity, unitPriceMinor: i.unitPriceMinor, discountMinor: i.discountMinor })),
      shippingFeeMinor: o.deliveryChargeMinor,
      codAmountMinor: o.codAmountMinor,
      paymentMethod: o.paymentMethod ?? 'COD',
      note: o.note,
      ...(revision ? { revision } : {}),
    },
    { tx },
  );
  return r.pushId;
}

export interface CancelEffects {
  releasedHolds: number;
  cancelledPayments: number;
  refundRequestIds: string[];
  erpPushId: string | null;
}

/**
 * Everything a cancel does besides the status (§6.5.1 `cancel`, `recordCourierCancel`): the order's stock holds are
 * released; a payment still waiting is closed (no money moved); anything paid — online or from the wallet — becomes a
 * refund REQUEST for the owner (F-041; approving and paying it is PR 172, CLAUDE.md rule 6); an order the ERP already
 * has gets its CANCELLED status queued; open call tasks and reviews of the order are closed.
 */
export async function cancelEffects(deps: OrdersDeps, tx: Tx, o: LockedOrder, by: By, code: string, now: Date): Promise<CancelEffects> {
  const { released } = await releaseOrderHolds(inventoryOf(deps), { storeId: o.storeId, orderId: o.id }, { tx });
  const cancelledPayments = (await tx.payment.updateMany({ where: { storeId: o.storeId, orderId: o.id, status: { in: ['INITIATED', 'PENDING'] } }, data: { status: 'CANCELLED' } })).count;
  const refundRequestIds: string[] = [];
  const request = async (amountMinor: number, method: string, key: string, paymentId: string | null) => {
    if (amountMinor <= 0) return;
    const existing = await tx.refund.findUnique({ where: { storeId_idempotencyKey: { storeId: o.storeId, idempotencyKey: key } }, select: { id: true } });
    const row =
      existing ??
      (await tx.refund.create({
        data: { storeId: o.storeId, orderId: o.id, paymentId, amountMinor, method, reason: code, status: 'REQUESTED', source: 'CANCEL', idempotencyKey: key, requestedById: by.actorType === 'STAFF' ? by.actorId : null },
        select: { id: true },
      }));
    refundRequestIds.push(row.id);
  };
  const paid = await tx.payment.findMany({ where: { storeId: o.storeId, orderId: o.id, status: 'PAID' }, select: { id: true } });
  await request(o.paidMinor, 'original', `cancel:${o.id}`, paid.length === 1 ? paid[0]!.id : null);
  await request(o.walletAppliedMinor, 'wallet', `cancel:${o.id}:wallet`, null);
  const pushed = await tx.erpPush.findFirst({ where: { storeId: o.storeId, referenceId: o.id, documentType: 'order.create' }, select: { id: true } });
  const erpPushId = pushed ? (await enqueueOrderStatus(inventoryOf(deps), { storeId: o.storeId, orderId: o.id, externalOrderId: o.number, status: 'CANCELLED' }, { tx })).pushId : null;
  await tx.callTask.updateMany({ where: { storeId: o.storeId, orderId: o.id, status: { in: ['OPEN', 'IN_PROGRESS'] } }, data: { status: 'DISMISSED', outcome: 'ORDER_CANCELLED', closedAt: now } });
  await tx.fraudAlert.updateMany({ where: { storeId: o.storeId, orderId: o.id, status: 'OPEN' }, data: { status: 'AUTO_RESOLVED', decisionReason: 'ORDER_CANCELLED', decidedAt: now } });
  return { releasedHolds: released, cancelledPayments, refundRequestIds, erpPushId };
}
