// CN-028 · PR 614 (CN-029 Phase 1; docs/RETAIL-ERP-MODEL.md §6.2–§6.5; docs/erp/site-changes-v6.md §2.10) — an exchange
// through the store's own ERP on contract v6. The exchange is opened as before (PR 185; in v6 the money box never
// owes a credit: no refunds after delivery); approving it goes through the ERP:
//
// - Within the exchange window (`policy.exchange.windowHours`, the owner's 72 hours) from the courier's "delivered"
//   (the ERP delivery result the shop sent, else the order's delivered mark), an admin with `exchange.approve` approves
//   it and the old order's ERP lines are marked (the first ones of each piece not exchanged yet, or the ones named).
// - Regular orders come first (§6.2): the ERP's live stock of the new piece is read; when taking it would leave fewer
//   than `exchange.erp.keepForOrders` pieces free, the exchange waits (WAITING_STOCK, the admin is told on the order's
//   timeline) and the background turn tries again. A `409 INSUFFICIENT_STOCK` from the ERP waits the same way and the
//   next try goes with a NEW idempotency key (`exchange:<id>:a<n>`, §2.10.2); a dropped connection retries the same key.
// - The new order (`<old order>-X<n>`, lines `<new order>-<k>`) names the old order and each line it replaces, with a
//   clear note; the ERP answers unbilled (erpTotal 0) with both shop prices. The shop then places its own parcel (PR
//   185's placeExchangeParcel): a dearer new piece is the customer's only with `exchange.passPriceRiseToCustomer`; a
//   cheaper one is never refunded. The original sale stands: nothing on the old order changes.
// - The 4-day watch and the risk list come from `GET /exchanges` (status, deadline, value at risk); a late return with
//   no matching consignment is marked by hand (`POST /exchanges/{id}/late-return`). The ERP settles, bills, credits or
//   cancels; the shop's exchange follows (COMPLETED or CANCELLED). The swap's money with the ERP is only the ERP's
//   events, which the books (PR 615) read.
// - qa-gate (30 Oct): an approval pressed twice gives the same answer and asks the ERP once; a refused send is closed
//   (REFUSED) and holds no line, and the same case may be approved again with its next key; a refusal while waiting for
//   stock stops the retries; only the lines the customer kept (a partial delivery) are exchanged; an account hold never
//   pauses an exchange. The send is kept in the store's ERP outbox as the new order's `order.create` (SENT), so PR 611's
//   pickup and result and PR 610's cancel follow it through the relay.
// Never here: a refund, a price, COD rules or a payment (CLAUDE.md rule 6). CN-029 §16: every row is the store's own,
// on its own ERP link, sent with its own key.
import { z } from 'zod';
import { Prisma } from '@extas/db/client';
import { can, AuthError } from '@extas/auth';
import { digitsOf, erpLiveAvailable, erpMinor, InventoryError, isV6, minorToDecimal, openLinkIdOf, readErpExchanges, returnsV6Path, sendExchangeOrderToErp, sendLateReturnToErp, storeDate, wholeTaka } from '@extas/inventory';
import { allow, nowOf, parse, setting, TX, type OrdersDeps, type OrdersPermission, type Tx, type Who } from './context';
import { OrdersError } from './errors';
import { approveExchange, exchangePolicyFor, lockExchange, OPEN_EXCHANGE, placeExchangeParcel, type ApproveResult, type DecideOptions, type LockedExchange } from './exchange';
import { exchangeWindow, lineOnNewOrder } from './exchange-pure';
import { confirmBy } from './commands';
import { requireV6 } from './legacy';
import { auditRow, eventRow, inventoryOf, staffBy, systemBy, type By } from './service';

// The ERP's shapes as @extas/inventory speaks them (the orders package reaches the ERP only through it).
type ErpSalesOrderV6 = Parameters<typeof sendExchangeOrderToErp>[2];
type ErpExchange = Awaited<ReturnType<typeof readErpExchanges>>['items'][number];
type ErpOrderAnswer = Extract<Awaited<ReturnType<typeof sendExchangeOrderToErp>>, { ok: true }>['answer'];

/** The shop's own state of an exchange waiting for the ERP's stock (the ERP's own statuses come from `GET /exchanges`). */
export const WAITING_STOCK = 'WAITING_STOCK';
/** The shop's own state of a send the ERP refused for good (it holds no line; the case may be approved again). */
export const REFUSED = 'REFUSED';
/** The shop's own state of a send the shop closed before it went (the case was refused or closed meanwhile). */
export const CLOSED = 'CLOSED';
const FINISHED = ['SETTLED', 'BILLED', 'CREDITED', 'CANCELLED'];
const DAY = 86_400_000;

const ymd = (d: Date): string => d.toISOString().slice(0, 10);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'a day like 2026-10-24' });
const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/** The first moment of a day in a time zone (the ERP's deadline is the end of its day, Asia/Dhaka). */
function zonedStart(day: string, timeZone: string): Date {
  const utc = new Date(`${day}T00:00:00Z`);
  const there = new Date(utc.toLocaleString('en-US', { timeZone }));
  const here = new Date(utc.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(utc.getTime() - (there.getTime() - here.getTime()));
}

async function allowOne(deps: OrdersDeps, who: Who, perms: OrdersPermission[]): Promise<void> {
  if (!Number.isInteger(who.storeId) || who.storeId < 1) throw new OrdersError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
  for (const p of perms) if (await can(deps.db, who.actor, p, { storeId: who.storeId })) return;
  throw new AuthError('FORBIDDEN', `needs one of the permissions: ${perms.join(', ')}`);
}

function erpDown(e: unknown): never {
  if (e instanceof InventoryError) throw new OrdersError('ERP_UNAVAILABLE', e.message, e.details, { reason: e.code });
  throw e;
}

// ---- approve -----------------------------------------------------------------------------------------------------------

export const approveV6Input = z
  .object({
    note: z.string().trim().max(500).optional(),
    /** The old order's ERP lines exchanged, per exchange line (default: the first ones not exchanged yet). */
    lines: z
      .array(z.object({ exchangeItemId: z.uuid(), lineIds: z.array(z.string().trim().min(1).max(100)).min(1).max(50) }).strict())
      .max(50)
      .optional(),
  })
  .strict();

export interface ApproveV6Result {
  exchangeId: string;
  /** SENT: the ERP took the new order; WAITING_STOCK: regular orders come first, it goes once there is stock. */
  status: 'SENT' | 'WAITING_STOCK';
  erpExchangeId: string | null;
  newExternalOrderId: string;
  newOrderId: string | null;
  newOrderNumber: string | null;
  shortSkus: { sku: string; wanted: number; available: number }[];
  /** What the customer pays for the swap (a dearer piece with `exchange.passPriceRiseToCustomer`), minor units. */
  customerPaysMinor: number;
  /** The new parcel was confirmed at once (`orders.exchange.engine.autoConfirm`). */
  confirmed: boolean;
  attempts: number;
}

/** Per exchange line: what the customer pays for one piece of the swap (never below 0: no refunds after delivery). */
function paysPerPiece(ex: LockedExchange, item: LockedExchange['items'][number], passRise: boolean): number {
  const l = lineOnNewOrder({ oldUnitMinor: item.oldUnitMinor, newUnitMinor: item.newUnitMinor, quantity: 1 }, ex.isOurMistake || !passRise);
  return Math.max(0, l.lineTotalMinor);
}

/**
 * Approves a requested exchange through the store's ERP (contract v6). Needs `exchange.approve`. Marks the old lines,
 * checks the ERP's live stock and sends the exchange order; when stock is short the exchange waits (WAITING_STOCK) and
 * goes by itself later. Refusals: EXCHANGE_CLOSED (`data.why` WINDOW, UNKNOWN), EXCHANGE_STATE, NOT_IN_ERP,
 * ERP_REFUSED (`data.erpCode`: LINE_NOT_DELIVERED, EXCHANGE_OPEN, ORDER_NOT_FOUND …), ERP_UNAVAILABLE.
 */
export async function approveExchangeV6(deps: OrdersDeps, who: Who, id: string, input: unknown = {}): Promise<ApproveV6Result> {
  await allow(deps, who, 'exchange.approve');
  await requireV6(deps, who.storeId, 'the exchange through the ERP');
  const d = parse(approveV6Input, input, 'approval');
  const path = await returnsV6Path(inventoryOf(deps), who.storeId);
  if (!path.go) throw new OrdersError('ERP_UNAVAILABLE', path.text, ['erp'], { reason: path.reason });
  const by = staffBy(who.actor, who.ctx);
  // approved already (a second press, a second tab): the same answer, the ERP is not asked again
  const done = await sentResult(deps, who.storeId, path.linkId, id);
  if (done) return done;
  let linkRowId: string;
  try {
    linkRowId = await planExchange(deps, who, by, path.linkId, id, d);
  } catch (e) {
    const again = e instanceof OrdersError && e.code === 'EXCHANGE_STATE' ? await sentResult(deps, who.storeId, path.linkId, id) : null;
    if (again) return again;
    throw e;
  }
  try {
    return await sendPlanned(deps, by, who.storeId, linkRowId);
  } catch (e) {
    // a second approval at once that lost the race: the first one's answer
    const again = e instanceof OrdersError && e.code === 'EXCHANGE_STATE' ? await sentResult(deps, who.storeId, path.linkId, id) : null;
    if (again) return again;
    // the ERP could not be reached: nothing went; the case card says a person sends it again (the background turn
    // retries only an exchange waiting for stock)
    if (e instanceof OrdersError && e.code === 'ERP_UNAVAILABLE') {
      await deps.db.erpExchangeLink.updateMany({ where: { id: linkRowId, storeId: who.storeId, erpExchangeId: null, finishedAt: null, OR: [{ erpStatus: null }, { erpStatus: { not: WAITING_STOCK } }] }, data: { lastTriedAt: nowOf(deps), lastRefusal: 'ERP_UNAVAILABLE' } });
    }
    throw e;
  }
}

/** The answer of an exchange the ERP took already (null: not sent yet). */
async function sentResult(deps: OrdersDeps, storeId: number, linkId: string, exchangeId: string): Promise<ApproveV6Result | null> {
  if (!z.uuid().safeParse(exchangeId).success) return null;
  const l = await deps.db.erpExchangeLink.findUnique({ where: { linkId_exchangeId: { linkId, exchangeId } } });
  return l && l.storeId === storeId && l.erpExchangeId ? resultOf(deps, l) : null;
}

async function resultOf(deps: OrdersDeps, l: { exchangeId: string; erpExchangeId: string | null; newExternalOrderId: string | null; newOrderId: string | null; customerPaysMinor: bigint | number; sendAttempts: number }): Promise<ApproveV6Result> {
  const number = l.newOrderId ? ((await deps.db.order.findUnique({ where: { id: l.newOrderId }, select: { number: true } }))?.number ?? null) : null;
  return { exchangeId: l.exchangeId, status: 'SENT', erpExchangeId: l.erpExchangeId, newExternalOrderId: l.newExternalOrderId ?? '', newOrderId: l.newOrderId, newOrderNumber: number, shortSkus: [], customerPaysMinor: Number(l.customerPaysMinor), confirmed: false, attempts: l.sendAttempts };
}

/** The dispatcher the admin's "Approve" uses: through the ERP on v6, the shop's own way (PR 185) on v5. */
export async function approveExchangeFor(deps: OrdersDeps, who: Who, id: string, input: unknown = {}, opts: DecideOptions = {}): Promise<ApproveResult | ApproveV6Result> {
  if (await isV6(deps, who.storeId)) return approveExchangeV6(deps, who, id, input);
  return approveExchange(deps, who, id, input, opts);
}

/**
 * Inside one transaction: the exchange is requested, in its window; the old ERP lines are marked; the link is kept. A
 * send the ERP refused (or the shop closed) is opened again with its lines picked afresh: a refusal never locks a line.
 */
async function planExchange(deps: OrdersDeps, who: Who, by: By, linkId: string, id: string, d: z.output<typeof approveV6Input>): Promise<string> {
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const ex = await lockExchange(tx, who.storeId, id);
    if (ex.status !== 'REQUESTED') throw new OrdersError('EXCHANGE_STATE', 'only a requested exchange is approved', ['status'], { status: ex.status });
    const had = await tx.erpExchangeLink.findUnique({ where: { linkId_exchangeId: { linkId, exchangeId: ex.id } }, select: { id: true, erpExchangeId: true, finishedAt: true } });
    if (had?.erpExchangeId) throw new OrdersError('EXCHANGE_STATE', 'this exchange is with the ERP already', ['status'], { status: 'SENT' });
    const old = await tx.erpOrder.findFirst({ where: { storeId: who.storeId, linkId, orderId: ex.orderId }, include: { lines: { orderBy: [{ orderItemId: 'asc' }, { piece: 'asc' }] } } });
    if (!old) throw new OrdersError('NOT_IN_ERP', 'the order was never sent to this ERP; it cannot be exchanged through it', ['orderId']);

    // the window counts from the courier's "delivered" as the ERP has it (else the shop's own mark)
    const order = await tx.order.findUniqueOrThrow({ where: { id: ex.orderId }, select: { deliveredAt: true, number: true, deliveryBand: { select: { key: true } } } });
    const result = await tx.erpDeliveryResult.findFirst({ where: { storeId: who.storeId, erpOrderId: old.id, outcome: { in: ['DELIVERED', 'PARTIAL'] } }, orderBy: { at: 'desc' }, select: { at: true, outcome: true, keptLineIds: true } });
    const deliveredAt = result?.at ?? order.deliveredAt;
    for (const item of ex.items) {
      const oi = await tx.orderItem.findUnique({ where: { id: item.originalOrderItemId }, select: { productId: true } });
      const policy = await exchangePolicyFor(deps, who.storeId, oi?.productId ?? '', order.deliveryBand?.key ?? null);
      const w = exchangeWindow(deliveredAt, policy.windowHours, now);
      if (w.state !== 'OPEN') throw new OrdersError('EXCHANGE_CLOSED', w.state === 'UNKNOWN' ? 'the delivered mark is missing; check the courier' : 'the exchange window has passed', ['deliveredAt'], { why: w.state === 'UNKNOWN' ? 'UNKNOWN' : 'WINDOW' });
    }
    if (had && !had.finishedAt) {
      await tx.erpExchangeLink.update({ where: { id: had.id }, data: { approvedAt: now, approvedById: who.actor.staffUserId ?? null, ...(d.note ? { note: noteOf(order.number, d.note) } : {}) } });
      return had.id;
    }

    // the old lines: the ones named, or the first ones of each piece not exchanged yet. A line is held by an exchange
    // the ERP took (until the ERP cancels it) or by one still waiting to go whose case is still requested; never by a
    // send the ERP refused or the shop closed.
    const held = await tx.erpExchangeLine.findMany({
      where: { storeId: who.storeId, exchangeLink: { linkId, ...(had ? { id: { not: had.id } } : {}), OR: [{ erpStatus: null }, { erpStatus: { not: 'CANCELLED' } }], NOT: { erpExchangeId: null, finishedAt: { not: null } } } },
      select: { oldLineId: true, exchangeLink: { select: { erpExchangeId: true, exchangeId: true } } },
    });
    const unsent = [...new Set(held.filter((h) => !h.exchangeLink.erpExchangeId).map((h) => h.exchangeLink.exchangeId))];
    const live = new Set((unsent.length ? await tx.exchange.findMany({ where: { storeId: who.storeId, id: { in: unsent }, status: 'REQUESTED' }, select: { id: true } }) : []).map((x) => x.id));
    const taken = new Set(held.filter((h) => h.exchangeLink.erpExchangeId || live.has(h.exchangeLink.exchangeId)).map((h) => h.oldLineId));
    // a partly delivered parcel: only the lines the customer kept are the customer's to exchange
    const kept = result?.outcome === 'PARTIAL' && result.keptLineIds.length ? new Set(result.keptLineIds) : null;
    const chosen: { item: LockedExchange['items'][number]; line: (typeof old.lines)[number] }[] = [];
    for (const item of ex.items) {
      const free = old.lines.filter((l) => l.orderItemId === item.originalOrderItemId && l.state === 'OPEN' && !taken.has(l.lineId) && (!kept || kept.has(l.lineId)));
      const named = d.lines?.find((x) => x.exchangeItemId === item.id)?.lineIds;
      const pick = named ? named.map((lid) => free.find((l) => l.lineId === lid)) : free.slice(0, item.quantity);
      if (pick.some((l) => !l) || pick.length !== item.quantity) throw new OrdersError('INVALID_INPUT', 'the ERP lines of this piece are not free to exchange', ['lines'], { exchangeItemId: item.id, free: free.map((l) => l.lineId) });
      for (const l of pick) {
        chosen.push({ item, line: l! });
        taken.add(l!.lineId);
      }
    }
    const passRise = await setting(deps, who.storeId, 'exchange.passPriceRiseToCustomer');
    const swaps = chosen.map((c) => ({ line: c.line.lineId, from: c.line.sku, to: c.item.newSku ?? '' }));
    if (had) return reopen(tx, by, who, had.id, ex, old.externalOrderId, chosen, { now, note: noteOf(old.externalOrderId, d.note ?? null, swaps), passRise });

    // the new order's id: the old one with -X<n>, numbered per old order on this link
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`erp-exchange:${linkId}:${old.externalOrderId}`}, 0))`;
    const n = (await tx.erpExchangeLink.count({ where: { linkId, ofExternalOrderId: old.externalOrderId } })) + 1;
    const newExternalOrderId = `${old.externalOrderId}-X${n}`;
    const link = await tx.erpExchangeLink.create({
      data: {
        storeId: who.storeId,
        linkId,
        exchangeId: ex.id,
        ofExternalOrderId: old.externalOrderId,
        newExternalOrderId,
        approvedAt: now,
        approvedById: who.actor.staffUserId ?? null,
        note: noteOf(old.externalOrderId, d.note ?? null, swaps),
        customerPaysMinor: chosen.reduce((s, c) => s + paysPerPiece(ex, c.item, passRise), 0),
      },
      select: { id: true },
    });
    for (const c of chosen)
      await tx.erpExchangeLine.create({
        data: {
          storeId: who.storeId,
          exchangeLinkId: link.id,
          oldLineId: c.line.lineId,
          oldSku: c.line.sku,
          newSku: c.item.newSku ?? '',
          oldPriceMinor: c.line.customerPriceMinor,
          newPriceMinor: c.item.newUnitMinor,
          oldShopPriceMinor: c.line.shopPriceMinor,
          customerPaysMinor: paysPerPiece(ex, c.item, passRise),
          exchangeItemId: c.item.id,
          oldOrderItemId: c.item.originalOrderItemId,
        },
      });
    await auditRow(tx, by, { storeId: who.storeId, action: 'exchange.erpPlanned', entityType: 'Exchange', entityId: ex.id, before: null, after: { newExternalOrderId, lines: chosen.map((c) => c.line.lineId) } });
    return link.id;
  }, TX);
}

type Chosen = { item: LockedExchange['items'][number]; line: { lineId: string; sku: string; customerPriceMinor: number; shopPriceMinor: number | null } }[];

/**
 * A send the ERP refused (or the shop closed) is approved again: the same link and new order id, its lines picked
 * afresh (a line still chosen keeps its row; the others take the rest), the next key (sendAttempts moved on already).
 */
async function reopen(tx: Tx, by: By, who: Who, linkRowId: string, ex: LockedExchange, ofExternalOrderId: string, chosen: Chosen, o: { now: Date; note: string; passRise: boolean }): Promise<string> {
  const rows = await tx.erpExchangeLine.findMany({ where: { exchangeLinkId: linkRowId }, orderBy: { oldLineId: 'asc' } });
  for (const item of ex.items) {
    const mine = rows.filter((r) => r.exchangeItemId === item.id);
    const picks = chosen.filter((c) => c.item.id === item.id).map((c) => c.line);
    const stay = mine.filter((r) => picks.some((p) => p.lineId === r.oldLineId));
    const rest = picks.filter((p) => !stay.some((r) => r.oldLineId === p.lineId));
    const move = mine.filter((r) => !stay.includes(r));
    if (move.length !== rest.length) throw new OrdersError('EXCHANGE_STATE', 'the exchange`s pieces changed; open a new exchange', ['items'], { status: 'CHANGED' });
    const write = [...stay.map((r) => ({ r, l: picks.find((p) => p.lineId === r.oldLineId)! })), ...move.map((r, k) => ({ r, l: rest[k]! }))];
    for (const { r, l } of write)
      await tx.erpExchangeLine.update({ where: { id: r.id }, data: { oldLineId: l.lineId, oldSku: l.sku, oldPriceMinor: l.customerPriceMinor, oldShopPriceMinor: l.shopPriceMinor, customerPaysMinor: paysPerPiece(ex, item, o.passRise) } });
  }
  await tx.erpExchangeLink.update({
    where: { id: linkRowId },
    data: { finishedAt: null, erpStatus: null, approvedAt: o.now, approvedById: who.actor.staffUserId ?? null, note: o.note, customerPaysMinor: chosen.reduce((s, c) => s + paysPerPiece(ex, c.item, o.passRise), 0) },
  });
  await auditRow(tx, by, { storeId: who.storeId, action: 'exchange.erpPlanned', entityType: 'Exchange', entityId: ex.id, before: null, after: { again: true, ofExternalOrderId, lines: chosen.map((c) => c.line.lineId) } });
  return linkRowId;
}

/** The clear note the ERP keeps on the exchange order (§2.10.2): the old order, each line swapped, the admin's words. */
function noteOf(ofExternalOrderId: string, adminNote: string | null, lines: { line: string; from: string; to: string }[] = []): string {
  const swaps = lines.map((l) => `line ${l.line}: ${l.from} for ${l.to}`).join('; ');
  return [`Exchange of order ${ofExternalOrderId}`, swaps, adminNote].filter(Boolean).join(' · ').slice(0, 500);
}

/**
 * Sends one planned exchange to the ERP (the admin's approval, or the background turn for one waiting for stock), and
 * once the ERP took it, places the shop's own parcel in one transaction. Safe to repeat: the same key until the ERP
 * refuses; a replayed answer places the parcel once. A refusal for good closes the send (REFUSED): it holds no line and
 * is never sent again by itself.
 */
async function sendPlanned(deps: OrdersDeps, by: By, storeId: number, linkRowId: string): Promise<ApproveV6Result> {
  const db = deps.db;
  const inv = inventoryOf(deps);
  const head = await db.erpExchangeLink.findFirstOrThrow({ where: { id: linkRowId, storeId }, select: { exchangeId: true } });
  // the case first, then the link: a case approved meanwhile (a second press) is read with its link already sent
  const ex = await db.exchange.findFirstOrThrow({ where: { id: head.exchangeId, storeId }, include: { items: true } });
  const link = await db.erpExchangeLink.findFirstOrThrow({ where: { id: linkRowId, storeId }, include: { lines: { orderBy: { oldLineId: 'asc' } } } });
  if (link.erpExchangeId) return resultOf(deps, link);
  if (link.finishedAt) throw new OrdersError('EXCHANGE_STATE', 'this send was closed; approve the exchange again', ['status'], { status: link.erpStatus ?? CLOSED });
  const base = { exchangeId: link.exchangeId, erpExchangeId: link.erpExchangeId, newExternalOrderId: link.newExternalOrderId ?? '', newOrderId: link.newOrderId, newOrderNumber: null as string | null, shortSkus: [], customerPaysMinor: Number(link.customerPaysMinor), confirmed: false, attempts: link.sendAttempts };
  if (ex.status !== 'REQUESTED') {
    // refused or closed by a person while it waited: it is not sent, and its lines are free
    await db.erpExchangeLink.updateMany({ where: { id: link.id, erpExchangeId: null, finishedAt: null }, data: { finishedAt: nowOf(deps), erpStatus: CLOSED, lastRefusal: 'SHOP_CLOSED' } });
    throw new OrdersError('EXCHANGE_STATE', 'only a requested exchange is sent to the ERP', ['status'], { status: ex.status });
  }
  const now = nowOf(deps);

  // regular orders come first: never take the last pieces a regular order would need
  const keep = await setting(deps, storeId, 'exchange.erp.keepForOrders');
  const want = new Map<string, number>();
  for (const l of link.lines) want.set(l.newSku, (want.get(l.newSku) ?? 0) + 1);
  const short: ApproveV6Result['shortSkus'] = [];
  for (const [sku, wanted] of want) {
    const available = await erpLiveAvailable(inv, storeId, sku).catch(erpDown);
    if (available - keep < wanted) short.push({ sku, wanted, available });
  }
  if (short.length) return wait(deps, by, link, ex, short, { keep, bump: false, base });

  const attempt = Math.max(1, link.sendAttempts);
  const key = `exchange:${link.exchangeId}:a${attempt}`;
  const order = await db.order.findUniqueOrThrow({ where: { id: ex.orderId }, select: { customerName: true, phone: true, shippingAddressText: true } });
  const digits = await digitsOf(db, storeId);
  const body: ErpSalesOrderV6 = {
    channel: 'WEBSITE',
    status: 'CONFIRMED',
    externalOrderId: link.newExternalOrderId!,
    customerName: order.customerName ?? '',
    customerPhone: order.phone ?? '',
    shippingAddress: order.shippingAddressText ?? '',
    paymentMethod: 'COD',
    note: link.note,
    items: link.lines.map((l, k) => ({
      lineId: `${link.newExternalOrderId}-${k + 1}`,
      replacesLineId: l.oldLineId,
      sku: l.newSku,
      quantity: 1,
      grade: 'A' as const,
      unitPrice: minorToDecimal(l.customerPaysMinor, digits),
      discount: minorToDecimal(0, digits),
      customerPrice: wholeTaka(l.customerPaysMinor, digits),
      comboId: null,
    })),
    deliveryCharge: wholeTaka(ex.deliveryChargeMinor, digits),
    advancePaid: 0,
    exchange: { ofExternalOrderId: link.ofExternalOrderId, note: link.note ?? noteOf(link.ofExternalOrderId, null) },
  };
  if (!link.sendAttempts) await db.erpExchangeLink.update({ where: { id: link.id }, data: { sendAttempts: attempt } });
  const sent = await sendExchangeOrderToErp(inv, storeId, body, key).catch(erpDown);
  if (!sent.ok) {
    await db.erpExchangeLink.update({ where: { id: link.id }, data: { lastTriedAt: now, lastRefusal: sent.code, lastRefusalDetails: sent.details === null || sent.details === undefined ? Prisma.DbNull : (sent.details as Prisma.InputJsonValue) } });
    if (sent.code === 'INSUFFICIENT_STOCK') {
      const d = (sent.details ?? {}) as { shortSkus?: { sku: string; wanted?: number; available?: number }[] };
      const s = (d.shortSkus ?? []).map((x) => ({ sku: x.sku, wanted: x.wanted ?? 0, available: x.available ?? 0 }));
      return wait(deps, by, { ...link, sendAttempts: attempt }, ex, s, { keep, bump: true, base });
    }
    if (sent.retryable) throw new OrdersError('ERP_UNAVAILABLE', sent.text, ['erp'], { reason: sent.code });
    // a refusal is the ERP's answer to this key: the send is closed (it holds no line and is not retried by itself);
    // a corrected approval goes with the next key
    await db.$transaction(async (tx) => {
      await tx.erpExchangeLink.update({ where: { id: link.id }, data: { sendAttempts: attempt + 1, erpStatus: REFUSED, finishedAt: now } });
      await eventRow(tx, by, { storeId, orderId: ex.orderId, type: 'exchange.erpRefused', message: sent.text, data: { exchangeId: ex.id, number: ex.number, erpCode: sent.code } });
    }, TX);
    throw new OrdersError('ERP_REFUSED', sent.text, ['exchange'], { erpCode: sent.code, details: sent.details });
  }
  return placed(deps, by, storeId, link.id, sent.answer, attempt, { key, body });
}

/** Regular orders come first: the exchange waits (the timeline says so once), and the next ERP try is a new key. */
async function wait(deps: OrdersDeps, by: By, link: { id: string; erpStatus: string | null; sendAttempts: number; exchangeId: string }, ex: { id: string; orderId: string; number: string; storeId: number }, short: ApproveV6Result['shortSkus'], o: { keep: number; bump: boolean; base: Omit<ApproveV6Result, 'status'> }): Promise<ApproveV6Result> {
  const now = nowOf(deps);
  const attempts = o.bump ? link.sendAttempts + 1 : link.sendAttempts;
  await deps.db.$transaction(async (tx) => {
    await tx.erpExchangeLink.update({ where: { id: link.id }, data: { erpStatus: WAITING_STOCK, lastTriedAt: now, lastRefusal: 'INSUFFICIENT_STOCK', lastRefusalDetails: { shortSkus: short, keepForOrders: o.keep }, sendAttempts: attempts } });
    if (link.erpStatus !== WAITING_STOCK) await eventRow(tx, by, { storeId: ex.storeId, orderId: ex.orderId, type: 'exchange.waitingStock', message: short.map((s) => s.sku).join(', '), data: { exchangeId: ex.id, number: ex.number, shortSkus: short, keepForOrders: o.keep } });
  }, TX);
  return { ...o.base, status: 'WAITING_STOCK', shortSkus: short, newOrderId: null, attempts };
}

/** The ERP took the exchange order: the shop's own parcel, the ERP rows of the new order, the link — one transaction. */
async function placed(deps: OrdersDeps, by: By, storeId: number, linkRowId: string, answer: ErpOrderAnswer, attempt: number, sent: { key: string; body: ErpSalesOrderV6 }): Promise<ApproveV6Result> {
  const now = nowOf(deps);
  const [prefix, start, engine, passRise, digits] = await Promise.all([
    setting(deps, storeId, 'checkout.order.numberPrefix'),
    setting(deps, storeId, 'checkout.order.numberStart'),
    setting(deps, storeId, 'orders.exchange.engine'),
    setting(deps, storeId, 'exchange.passPriceRiseToCustomer'),
    digitsOf(deps.db, storeId),
  ]);
  const minor = (v: string | null | undefined) => erpMinor(v ?? null, digits);
  const out = await deps.db.$transaction(async (tx: Tx) => {
    // the case is locked first and the link read under it: a second approval at once sees the first one's parcel
    const head = await tx.erpExchangeLink.findFirstOrThrow({ where: { id: linkRowId, storeId }, select: { exchangeId: true } });
    const ex = await lockExchange(tx, storeId, head.exchangeId);
    const link = await tx.erpExchangeLink.findFirstOrThrow({ where: { id: linkRowId, storeId }, include: { lines: { orderBy: { oldLineId: 'asc' } } } });
    if (link.newOrderId) return { link, ex, newOrderId: link.newOrderId, number: (await tx.order.findUniqueOrThrow({ where: { id: link.newOrderId }, select: { number: true } })).number, again: true };
    if (ex.status !== 'REQUESTED') throw new OrdersError('EXCHANGE_STATE', 'only a requested exchange is approved', ['status'], { status: ex.status });
    const who: Who = { actor: { staffUserId: link.approvedById ?? undefined } as Who['actor'], storeId };
    const p = await placeExchangeParcel(deps, who, tx, ex, now, by, { prefix, start, note: link.note, v6: { passRise } });
    const eo = await tx.erpOrder.create({ data: { storeId, linkId: link.linkId, orderId: p.newOrderId, externalOrderId: link.newExternalOrderId!, erpOrderId: answer.erpOrderId, exchangeOfId: ex.orderId, erpTotalMinor: BigInt(minor(answer.erpTotal) ?? 0), acceptedAt: now } });
    // the send, kept in the store's ERP outbox as the new order's document: the parcel's pickup and result (PR 611) and
    // a cancel (PR 610) follow it through the relay like any order's
    await tx.erpPush.create({ data: { storeId, documentType: 'order.create', referenceId: p.newOrderId, idempotencyKey: sent.key, status: 'SENT', attempts: attempt, requestBody: { type: 'order.create', body: sent.body } as unknown as Prisma.InputJsonValue, responseStatus: 201, responseBody: answer as unknown as Prisma.InputJsonValue, erpId: answer.erpOrderId, sentAt: now } });
    // one new ERP line per old line, in the order sent; each belongs to the shop line made for its exchange line
    const used = new Map<string, number>();
    for (const [k, l] of link.lines.entries()) {
      const lineId = `${link.newExternalOrderId}-${k + 1}`;
      const a = answer.lines.find((x) => x.lineId === lineId);
      const item = p.items.find((x) => x.exchangeItemId === l.exchangeItemId);
      const piece = (used.get(l.exchangeItemId ?? '') ?? 0) + 1;
      used.set(l.exchangeItemId ?? '', piece);
      await tx.erpOrderLine.create({ data: { storeId, erpOrderId: eo.id, orderItemId: item?.orderItemId ?? null, piece, lineId, sku: l.newSku, customerPriceMinor: l.customerPaysMinor, replacesLineId: l.oldLineId, shopPriceMinor: minor(a?.shopPrice), fromReturnStock: a?.fromReturnStock ?? false } });
      await tx.erpExchangeLine.update({ where: { id: l.id }, data: { newLineId: lineId, newShopPriceMinor: minor(a?.shopPrice), oldShopPriceMinor: minor(a?.replacedShopPrice) ?? l.oldShopPriceMinor } });
    }
    await tx.erpExchangeLink.update({ where: { id: link.id }, data: { erpExchangeId: answer.exchangeId, erpStatus: 'WAITING_DELIVERY', newOrderId: p.newOrderId, valueAtRiskMinor: answer.atRisk === null ? null : BigInt(minor(answer.atRisk) ?? 0), lastRefusal: null, lastRefusalDetails: Prisma.DbNull, lastTriedAt: now, sendAttempts: attempt } });
    await tx.exchange.update({ where: { id: ex.id }, data: { version: { increment: 1 } } });
    await eventRow(tx, by, { storeId, orderId: ex.orderId, type: 'exchange.approved', message: link.note, data: { exchangeId: ex.id, number: ex.number, newOrderId: p.newOrderId, newOrderNumber: p.newOrderNumber, erpExchangeId: answer.exchangeId, newExternalOrderId: link.newExternalOrderId, lines: link.lines.map((l) => l.oldLineId) } });
    await auditRow(tx, by, { storeId, action: 'exchange.approved', entityType: 'Exchange', entityId: ex.id, before: { status: ex.status }, after: { status: p.exchangeStatus, newOrderId: p.newOrderId, erpExchangeId: answer.exchangeId, newExternalOrderId: link.newExternalOrderId, customerPaysMinor: Number(link.customerPaysMinor) } });
    return { link, ex, newOrderId: p.newOrderId, number: p.newOrderNumber, again: false };
  }, TX);
  let confirmed = false;
  if (!out.again && engine.autoConfirm) {
    try {
      await confirmBy(deps, { storeId, orderId: out.newOrderId }, by);
      confirmed = true;
    } catch {
      // the new parcel waits in the confirm queue like any order; the approval stands
    }
  }
  return { exchangeId: out.ex.id, status: 'SENT', erpExchangeId: answer.exchangeId, newExternalOrderId: out.link.newExternalOrderId!, newOrderId: out.newOrderId, newOrderNumber: out.number, shortSkus: [], customerPaysMinor: Number(out.link.customerPaysMinor), confirmed, attempts: attempt };
}

/** The background turn: every exchange of the store waiting for the ERP's stock is tried again (oldest first). */
export async function retryWaitingExchanges(deps: OrdersDeps, storeId: number): Promise<{ sent: number; waiting: number; refused: number }> {
  const out = { sent: 0, waiting: 0, refused: 0 };
  const rows = await deps.db.erpExchangeLink.findMany({ where: { storeId, erpStatus: WAITING_STOCK, erpExchangeId: null, finishedAt: null }, orderBy: { approvedAt: 'asc' }, select: { id: true } });
  const by = systemBy('erp-returns');
  for (const r of rows) {
    try {
      const res = await sendPlanned(deps, by, storeId, r.id);
      if (res.status === 'SENT') out.sent++;
      else out.waiting++;
    } catch (e) {
      if (e instanceof OrdersError && (e.code === 'ERP_UNAVAILABLE' || e.code === 'ERP_REFUSED' || e.code === 'EXCHANGE_STATE')) {
        if (e.code === 'ERP_UNAVAILABLE') out.waiting++;
        else out.refused++;
        continue;
      }
      throw e;
    }
  }
  return out;
}

// ---- the ERP's own state: the watch, settlement, the risk list --------------------------------------------------------

/**
 * Reads `GET /exchanges?status=all&updatedSince=` and keeps each of the store's exchanges as the ERP has it: its status,
 * delivery and deadline (the 4-day watch), the value at risk, how it settled. The shop's exchange follows: settled,
 * billed or credited → COMPLETED; cancelled (the customer refused the parcel) → CANCELLED.
 */
export async function syncErpExchanges(deps: OrdersDeps, storeId: number): Promise<{ read: number; updated: number }> {
  const db = deps.db;
  const path = await returnsV6Path(inventoryOf(deps), storeId);
  if (!path.go) return { read: 0, updated: 0 };
  const store = await db.store.findUniqueOrThrow({ where: { id: storeId }, select: { timezone: true, currency: true } });
  const last = await db.erpExchangeLink.findFirst({ where: { storeId, linkId: path.linkId, erpUpdatedAt: { not: null } }, orderBy: { erpUpdatedAt: 'desc' }, select: { erpUpdatedAt: true } });
  const read = await readErpExchanges(inventoryOf(deps), storeId, { status: 'all', updatedSince: last?.erpUpdatedAt ? new Date(last.erpUpdatedAt.getTime() - 1_000) : null }).catch(erpDown);
  const by = systemBy('erp-returns');
  let updated = 0;
  for (const x of read.items) {
    const link = await db.erpExchangeLink.findFirst({ where: { storeId, linkId: path.linkId, erpExchangeId: x.exchangeId } });
    if (!link) continue;
    if (await applyExchange(deps, by, store, read.digits, link, x)) updated++;
  }
  return { read: read.items.length, updated };
}

async function applyExchange(deps: OrdersDeps, by: By, store: { timezone: string }, digits: number, link: { id: string; exchangeId: string; erpStatus: string | null; finishedAt: Date | null }, x: ErpExchange): Promise<boolean> {
  const now = nowOf(deps);
  const settled = x.events.find((e) => e.type === 'exchange.settled')?.data as { kind?: string; amount?: unknown } | undefined;
  const done = FINISHED.includes(x.status);
  await deps.db.$transaction(async (tx) => {
    await tx.erpExchangeLink.update({
      where: { id: link.id },
      data: {
        erpStatus: x.status,
        erpUpdatedAt: x.updatedAt ? new Date(x.updatedAt) : now,
        valueAtRiskMinor: BigInt(erpMinor(x.atRisk, digits) ?? 0),
        newDeliveredAt: x.deliveredAt ? new Date(`${x.deliveredAt}T00:00:00Z`) : null,
        deadline: x.deadline ? new Date(`${x.deadline}T00:00:00Z`) : null,
        // the old piece counts as back on the courier's date: the deadline is the end of its day in the store's zone
        returnWatchUntil: x.deadline ? zonedStart(ymd(new Date(Date.parse(`${x.deadline}T00:00:00Z`) + DAY)), store.timezone) : null,
        ...(settled ? { settledKind: settled.kind ?? null, settledAmountMinor: BigInt(erpMinor(String(settled.amount ?? '0'), digits) ?? 0) } : {}),
        ...(done && !link.finishedAt ? { finishedAt: now } : {}),
      },
    });
    if (!done || link.erpStatus === x.status) return;
    const ex = await lockExchange(tx, (await tx.erpExchangeLink.findUniqueOrThrow({ where: { id: link.id }, select: { storeId: true } })).storeId, link.exchangeId);
    if (!(OPEN_EXCHANGE as readonly string[]).includes(ex.status)) return;
    const to = x.status === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED';
    await tx.exchange.update({ where: { id: ex.id }, data: { status: to, version: { increment: 1 } } });
    await eventRow(tx, by, { storeId: ex.storeId, orderId: ex.orderId, type: `exchange.erp${x.status.charAt(0)}${x.status.slice(1).toLowerCase()}`, message: null, data: { exchangeId: ex.id, number: ex.number, erpExchangeId: x.exchangeId, erpStatus: x.status } });
    await auditRow(tx, by, { storeId: ex.storeId, action: 'exchange.erpFinished', entityType: 'Exchange', entityId: ex.id, before: { status: ex.status }, after: { status: to, erpStatus: x.status } });
  }, TX);
  return true;
}

export interface ExchangeWatchRow {
  linkId: string;
  /** The shop's exchange case (Exchange.id) and its number. */
  exchangeId: string | null;
  exchangeNumber: string | null;
  orderId: string | null;
  orderNumber: string | null;
  newOrderId: string | null;
  erpExchangeId: string;
  ofExternalOrderId: string;
  externalOrderId: string;
  erpStatus: string;
  atRiskMinor: number;
  deliveredAt: string | null;
  deadline: string | null;
  daysLeft: number | null;
  /** The deadline has passed and the old piece is not back. */
  late: boolean;
  lateReturnMarkedAt: string | null;
}

export interface ExchangeWatch {
  model: 'v5' | 'v6';
  /** `erp`: read now from `GET /exchanges?status=pending`; `shop`: the ERP could not be asked, the last known state. */
  source: 'erp' | 'shop';
  error: string | null;
  today: string;
  rows: ExchangeWatchRow[];
  totalAtRiskMinor: number;
}

/** The risk list: exchanges whose old piece is not back and checked yet, with the 4-day watch. Needs `returns.view`. */
export async function exchangeWatch(deps: OrdersDeps, who: Who): Promise<ExchangeWatch> {
  await allowOne(deps, who, ['returns.view', 'exchange.approve']);
  const v6 = await isV6(deps, who.storeId);
  const store = await deps.db.store.findUniqueOrThrow({ where: { id: who.storeId }, select: { timezone: true } });
  const today = storeDate(nowOf(deps), store.timezone);
  const blank: ExchangeWatch = { model: v6 ? 'v6' : 'v5', source: 'shop', error: null, today, rows: [], totalAtRiskMinor: 0 };
  if (!v6) return blank;
  const path = await returnsV6Path(inventoryOf(deps), who.storeId);
  // the ERP cannot be asked now: the last known state of the store's own link is shown, said so
  const linkId = path.go ? path.linkId : await openLinkIdOf(inventoryOf(deps), who.storeId);
  if (!linkId) return { ...blank, error: path.go ? null : path.text };
  const links = await deps.db.erpExchangeLink.findMany({ where: { storeId: who.storeId, linkId, erpExchangeId: { not: null } } });
  const byErp = new Map(links.map((l) => [l.erpExchangeId!, l]));
  const ids = [...new Set(links.map((l) => l.exchangeId))];
  const cases = ids.length ? await deps.db.exchange.findMany({ where: { storeId: who.storeId, id: { in: ids } }, select: { id: true, number: true, orderId: true } }) : [];
  const caseOf = new Map(cases.map((c) => [c.id, c]));
  const orderIds = cases.map((c) => c.orderId);
  const numbers = orderIds.length ? await deps.db.order.findMany({ where: { storeId: who.storeId, id: { in: orderIds } }, select: { id: true, number: true } }) : [];
  const numberOf = new Map(numbers.map((o) => [o.id, o.number]));
  const row = (x: { erpExchangeId: string; ofExternalOrderId: string; externalOrderId: string; status: string; atRiskMinor: number; deliveredAt: string | null; deadline: string | null }): ExchangeWatchRow => {
    const l = byErp.get(x.erpExchangeId);
    const c = l ? caseOf.get(l.exchangeId) : undefined;
    const daysLeft = x.deadline ? daysBetween(today, x.deadline) : null;
    return {
      linkId: l?.id ?? '',
      exchangeId: c?.id ?? null,
      exchangeNumber: c?.number ?? null,
      orderId: c?.orderId ?? null,
      orderNumber: c ? (numberOf.get(c.orderId) ?? null) : null,
      newOrderId: l?.newOrderId ?? null,
      erpExchangeId: x.erpExchangeId,
      ofExternalOrderId: x.ofExternalOrderId,
      externalOrderId: x.externalOrderId,
      erpStatus: x.status,
      atRiskMinor: x.atRiskMinor,
      deliveredAt: x.deliveredAt,
      deadline: x.deadline,
      daysLeft,
      late: daysLeft !== null && daysLeft < 0 && x.status === 'WAITING_RETURN',
      lateReturnMarkedAt: l?.lateReturnMarkedAt?.toISOString() ?? null,
    };
  };
  const sort = (rs: ExchangeWatchRow[]) => rs.sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || a.externalOrderId.localeCompare(b.externalOrderId));
  try {
    if (!path.go) throw new InventoryError('ERP_UNAVAILABLE', path.text);
    const read = await readErpExchanges(inventoryOf(deps), who.storeId, { status: 'pending' });
    // only this store's own exchanges (its own key reaches only its own ERP company)
    const rows = read.items.filter((x) => byErp.has(x.exchangeId)).map((x) => row({ erpExchangeId: x.exchangeId, ofExternalOrderId: x.ofExternalOrderId, externalOrderId: x.externalOrderId, status: x.status, atRiskMinor: erpMinor(x.atRisk, read.digits) ?? 0, deliveredAt: x.deliveredAt ?? null, deadline: x.deadline ?? null }));
    return { ...blank, source: 'erp', rows: sort(rows), totalAtRiskMinor: rows.reduce((s, r) => s + r.atRiskMinor, 0) };
  } catch (e) {
    if (!(e instanceof InventoryError)) throw e;
    const rows = links
      .filter((l) => !l.finishedAt)
      .map((l) => row({ erpExchangeId: l.erpExchangeId!, ofExternalOrderId: l.ofExternalOrderId, externalOrderId: l.newExternalOrderId ?? '', status: l.erpStatus ?? 'WAITING_DELIVERY', atRiskMinor: Number(l.valueAtRiskMinor ?? 0), deliveredAt: l.newDeliveredAt ? ymd(l.newDeliveredAt) : null, deadline: l.deadline ? ymd(l.deadline) : null }));
    return { ...blank, error: e.message, rows: sort(rows), totalAtRiskMinor: rows.reduce((s, r) => s + r.atRiskMinor, 0) };
  }
}

// ---- a late return with no matching consignment -------------------------------------------------------------------------

export const lateReturnInput = z
  .object({
    handedBackAt: isoDay,
    courier: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_]{2,20}$/)
      .transform((s) => s.toUpperCase())
      .optional(),
    returnListId: z.string().trim().min(1).max(100).optional(),
    consignmentId: z.string().trim().min(1).max(100).optional(),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

/**
 * The old piece came back late with no matching consignment: tell the ERP by hand (`POST /exchanges/{id}/late-return`,
 * §2.10.3). The ERP puts it on Hold for the owner to tick, then settles it by the table. Once per exchange: under the
 * link's row lock, a second press (at once or later) gets the same mark back and writes nothing. Needs
 * `returns.handback` or `exchange.approve`.
 */
export async function markExchangeLateReturn(deps: OrdersDeps, who: Who, exchangeId: string, input: unknown): Promise<{ exchangeId: string; erpExchangeId: string; lateReturnMarkedAt: string }> {
  await allowOne(deps, who, ['returns.handback', 'exchange.approve']);
  await requireV6(deps, who.storeId, 'the late-return mark');
  const d = parse(lateReturnInput, input, 'late return');
  if (!z.uuid().safeParse(exchangeId).success) throw new OrdersError('NOT_FOUND', 'no such exchange', ['exchangeId']);
  const link = await deps.db.erpExchangeLink.findFirst({ where: { storeId: who.storeId, exchangeId }, orderBy: { createdAt: 'desc' } });
  if (!link) throw new OrdersError('NOT_FOUND', 'no such exchange with the ERP', ['exchangeId']);
  if (!link.erpExchangeId) throw new OrdersError('EXCHANGE_STATE', 'the exchange is not with the ERP yet', ['status'], { status: link.erpStatus ?? 'NOT_SENT' });
  const erpExchangeId = link.erpExchangeId;
  const mark = (at: Date) => ({ exchangeId, erpExchangeId, lateReturnMarkedAt: at.toISOString() });
  if (link.lateReturnMarkedAt) return mark(link.lateReturnMarkedAt);
  const body = { handedBackAt: d.handedBackAt, courier: d.courier ?? 'HAND', returnListId: d.returnListId ?? null, consignmentId: d.consignmentId ?? null, note: d.note ?? null };
  const by = staffBy(who.actor, who.ctx);
  const inv = inventoryOf(deps);
  // the ERP is asked while the link is locked, so two presses at once send one mark
  return deps.db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ErpExchangeLink" WHERE "id" = ${link.id}::uuid FOR UPDATE`;
      const now = await tx.erpExchangeLink.findUniqueOrThrow({ where: { id: link.id }, select: { lateReturnMarkedAt: true } });
      if (now.lateReturnMarkedAt) return mark(now.lateReturnMarkedAt);
      const r = await sendLateReturnToErp(inv, who.storeId, erpExchangeId, body).catch(erpDown);
      if (!r.ok) {
        if (r.retryable) throw new OrdersError('ERP_UNAVAILABLE', r.text, ['erp'], { reason: r.code });
        throw new OrdersError('ERP_REFUSED', r.text, ['exchange'], { erpCode: r.code, details: r.details });
      }
      const at = nowOf(deps);
      await tx.erpExchangeLink.update({ where: { id: link.id }, data: { lateReturnMarkedAt: at, lateReturn: { ...body, markedById: who.actor.staffUserId ?? null, answer: (r.answer ?? null) as never } } });
      const ex = await tx.exchange.findFirst({ where: { id: exchangeId, storeId: who.storeId }, select: { orderId: true, number: true } });
      if (ex) await eventRow(tx, by, { storeId: who.storeId, orderId: ex.orderId, type: 'exchange.lateReturnMarked', message: body.note, data: { exchangeId, number: ex.number, erpExchangeId, handedBackAt: body.handedBackAt, courier: body.courier } });
      await auditRow(tx, by, { storeId: who.storeId, action: 'exchange.lateReturnMarked', entityType: 'Exchange', entityId: exchangeId, before: null, after: body });
      return mark(at);
    },
    { maxWait: TX.maxWait, timeout: Math.max(TX.timeout, 120_000) },
  );
}

// ---- one exchange as the ERP has it (the case card on the board) --------------------------------------------------------

export interface ExchangeErpState {
  /** The ERP's status, or WAITING_STOCK while regular orders come first; null: not approved through the ERP yet. */
  status: string | null;
  waitingStock: boolean;
  /** Not sent, not waiting for stock, the last try failed (the ERP could not be reached): a person sends it again. */
  needsResend: boolean;
  shortSkus: { sku: string; wanted: number; available: number }[];
  lastRefusal: string | null;
  erpExchangeId: string | null;
  ofExternalOrderId: string;
  newExternalOrderId: string | null;
  /** The ERP's deadline for the old piece (the 4-day watch) and the days left from today (negative: late). */
  deadline: string | null;
  daysLeft: number | null;
  atRiskMinor: number | null;
  customerPaysMinor: number;
  lateReturnMarkedAt: string | null;
  settledKind: string | null;
  finished: boolean;
}

/** The exchange's link with the ERP for the case card (null: none). Needs `returns.view` or `exchange.approve`. */
export async function exchangeErpState(deps: OrdersDeps, who: Who, exchangeId: string): Promise<ExchangeErpState | null> {
  await allowOne(deps, who, ['returns.view', 'exchange.approve']);
  if (!z.uuid().safeParse(exchangeId).success) return null;
  const l = await deps.db.erpExchangeLink.findFirst({ where: { storeId: who.storeId, exchangeId }, orderBy: { createdAt: 'desc' } });
  if (!l) return null;
  const store = await deps.db.store.findUniqueOrThrow({ where: { id: who.storeId }, select: { timezone: true } });
  const today = storeDate(nowOf(deps), store.timezone);
  const deadline = l.deadline ? ymd(l.deadline) : null;
  const details = (l.lastRefusalDetails ?? {}) as { shortSkus?: ExchangeErpState['shortSkus'] };
  const waitingStock = l.erpStatus === WAITING_STOCK && !l.finishedAt;
  return {
    status: l.erpStatus,
    waitingStock,
    needsResend: !l.erpExchangeId && !l.finishedAt && !waitingStock && !!l.lastRefusal,
    shortSkus: waitingStock ? (details.shortSkus ?? []) : [],
    lastRefusal: l.lastRefusal,
    erpExchangeId: l.erpExchangeId,
    ofExternalOrderId: l.ofExternalOrderId,
    newExternalOrderId: l.newExternalOrderId,
    deadline,
    daysLeft: deadline ? daysBetween(today, deadline) : null,
    atRiskMinor: l.valueAtRiskMinor === null ? null : Number(l.valueAtRiskMinor),
    customerPaysMinor: Number(l.customerPaysMinor),
    lateReturnMarkedAt: l.lateReturnMarkedAt?.toISOString() ?? null,
    settledKind: l.settledKind,
    finished: !!l.finishedAt,
  };
}
