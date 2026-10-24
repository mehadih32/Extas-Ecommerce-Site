// PR 176 (BACKEND-ARCHITECTURE §6.5.2, §7.4, §7.7) — booking a courier. Always a staff action (one order, the ticked
// ones, or "Book all" for the orders ready to go), never automatic, and always through the one order service:
//
// - The orders offered are the order service's own `readyToBook` view (confirmed, not handed over, no cancel asked or
//   pending, no open review, no live parcel), and each order is booked with `bookWith`, which takes the order's row lock
//   and refuses a cancelled order, an order held in review, one with a cancel asked or pending, or one booked already
//   (SIM-F-002, SIM-F-014). A packing card still open refuses it too (`assertBookable`, PR 225).
// - The parcel goes to the order's delivery target (`deliveryTarget`, PR 605): a gift's receiver, with the owner's gift
//   line and "deliver on or after" in the rider's note; a gift is not booked before its booking day (SIM-F-007).
// - The amount to collect is the order's live amount due when it is booked (`dueOf`); after booking the order service
//   refuses every edit and add-on (SIM-F-004, decision D5), so the parcel and the order never differ.
// - The weight is the pieces' own weights, or none when a piece has no weight (SIM-F-029; never guessed), with the
//   courier's own zone ids when the area is mapped (PR 554), and the goods' value recorded for a claim.
// - PR 554: the zone ids come from the area's pair with this courier, or the nearest pair above it (zones.ts `pairFor`).
//   A courier that needs its ids (or, with the owner's `unmapped: always`, any courier that takes them) never gets a
//   parcel to an area without a pair: the order is skipped with AREA_UNMAPPED (AREA_UNKNOWN when the order has no
//   resolved area) and its timeline says why, once — the courier never refuses it for an area it does not know.
//
// Two steps, so the courier is never called inside a database transaction: the parcel row is written first (BOOKING,
// with the shop's reference `<order number>-<try>` and its idempotency key), then the courier is asked. Its answer
// completes the parcel (the consignment id, the first state as an event), fails it (BOOKING_FAILED with the reason; the
// order is ready to book again), or — a timeout or a 5xx — leaves it BOOKING with the reason: "Try again" first asks
// the courier for that reference (`findByRef`) and only books again when the courier has nothing (§7.7: never twice).
// PR 177: the second courier (Pathao) books through the same code; a courier that charges by weight never gets a parcel
// without one (NO_WEIGHT), and one that cannot be asked by reference is never booked again by guess.
// No money moves here.
import { z } from 'zod';
import type { CourierApi, CourierParcel, Mode } from '@extas/adapters';
import type { Prisma } from '@extas/db/client';
import { assertBookable, isInventoryError } from '@extas/inventory';
import { bookWith, DELIVERY_TARGET_SELECT, deliveryTarget, dueOf, isOrdersError, openReviewIds, staffBy, viewWhere, type OrdersDeps } from '@extas/orders';
import { bookableCourier, courierApi } from './accounts';
import type { CourierBookingSettings } from '@extas/settings';
import { allow, logChange, nowOf, parse, setting, TX, type ShippingDeps, type Tx, type Who } from './context';
import { ShippingError } from './errors';
import { applyEventsIn } from './events';
import { addDays, bookingNoteOf, courierPhone, giftBooking, localDay, parcelDescription, parcelWeight, type BookingOutcomeKind, type ParcelLine } from './pure';
import { zoneNeedOf } from './zone-match';
import { pairFor } from './zones';

/** What happened to one order of a booking press. */
export interface BookingOutcome {
  orderId: string;
  number: string | null;
  /** booked: the courier took it · unknown: no clear answer (try again) · failed: the courier refused · skipped: not sent. */
  outcome: BookingOutcomeKind;
  /** Why it was not booked: the order service's refusal (IN_REVIEW, BOOKED, …) or the shop's (GIFT_DATE, NO_RECEIVER, …). */
  code: string | null;
  shipmentId: string | null;
  consignmentId: string | null;
  /** The courier's words when it refused, or what went wrong. */
  error: string | null;
  data?: Record<string, unknown>;
}

export interface BookingRun {
  courierAccountId: string;
  mode: Mode;
  results: BookingOutcome[];
  counts: Record<BookingOutcome['outcome'], number>;
  /** "Book all": orders ready to book that this press did not take (the next press does). */
  left: number;
}

const ordersDeps = (deps: ShippingDeps): OrdersDeps => ({ db: deps.db, settings: deps.settings, now: deps.now });

/** The "ready to book" orders the shop would take now (not a gift still waiting for its day). */
async function readyWhere(deps: ShippingDeps, storeId: number): Promise<{ where: Prisma.OrderWhereInput; waiting: Prisma.OrderWhereInput }> {
  const [cfg, timeZone, reviews] = await Promise.all([setting(deps, storeId, 'delivery.courier.booking'), setting(deps, storeId, 'store.timeZone'), openReviewIds(ordersDeps(deps), storeId)]);
  const today = localDay(nowOf(deps), timeZone);
  // a gift waits while its day less the lead days is still ahead
  const lastBookable = new Date(`${addDays(today, cfg.giftLeadDays)}T00:00:00Z`);
  const base: Prisma.OrderWhereInput = { storeId, archivedAt: null, ...viewWhere('readyToBook', reviews) };
  return {
    where: { AND: [base, { OR: [{ giftDeliverAfter: null }, { giftDeliverAfter: { lte: lastBookable } }] }] },
    waiting: { AND: [base, { giftDeliverAfter: { gt: lastBookable } }] },
  };
}

/** The orders ready to book now (the screen's list before "Book all"), with the gifts still waiting for their day. */
export async function readyToBook(deps: ShippingDeps, who: Who, query: unknown = {}) {
  await allow(deps, who, 'delivery.book');
  const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }).strict(), query, 'ready to book query');
  const { where, waiting } = await readyWhere(deps, who.storeId);
  const [rows, total, giftsWaiting, cfg] = await Promise.all([
    deps.db.order.findMany({
      where,
      select: { id: true, number: true, placedAt: true, areaId: true, paymentMethod: true, totalMinor: true, walletAppliedMinor: true, paidMinor: true, ...DELIVERY_TARGET_SELECT },
      orderBy: [{ placedAt: 'asc' }, { id: 'asc' }],
      take: q.limit,
    }),
    deps.db.order.count({ where }),
    deps.db.order.count({ where: waiting }),
    setting(deps, who.storeId, 'delivery.courier.booking'),
  ]);
  return {
    rows: rows.map((o) => {
      const t = deliveryTarget(o);
      return { orderId: o.id, number: o.number, placedAt: o.placedAt, name: t.name, phone: t.phone, address: t.address, paymentMethod: o.paymentMethod, codMinor: dueOf(o), gift: t.gift ? { deliverAfter: t.gift.deliverAfter } : null, problems: receiverProblems(t) };
    }),
    total,
    giftsWaiting,
    perPress: cfg.maxPerRun,
  };
}

const receiverProblems = (t: { name: string | null; phone: string | null; address: string | null }): string[] => [...(t.name ? [] : ['name']), ...(courierPhone(t.phone) ? [] : ['phone']), ...(t.address ? [] : ['address'])];

export const bookInput = z
  .object({
    courierAccountId: z.uuid(),
    orderIds: z.array(z.uuid()).min(1).max(500).optional(),
    /** "Book all": the orders ready to book, oldest first, up to the owner's "per press". */
    all: z.literal(true).optional(),
  })
  .strict()
  .refine((v) => (v.all ? !v.orderIds : !!v.orderIds), { message: 'either the ticked orders or "all"', path: ['orderIds'] });

/** Books the ticked orders (or "Book all") with one courier account. Each order gets its own outcome. */
export async function bookOrders(deps: ShippingDeps, who: Who, input: unknown): Promise<BookingRun> {
  await allow(deps, who, 'delivery.book');
  const v = parse(bookInput, input, 'booking');
  const courier = await bookableCourier(deps.db, who.storeId, v.courierAccountId);
  const cfg = await setting(deps, who.storeId, 'delivery.courier.booking');
  let ids: string[];
  let left = 0;
  if (v.all) {
    const { where } = await readyWhere(deps, who.storeId);
    const rows = await deps.db.order.findMany({ where, select: { id: true }, orderBy: [{ placedAt: 'asc' }, { id: 'asc' }], take: cfg.maxPerRun + 1 });
    ids = rows.slice(0, cfg.maxPerRun).map((r) => r.id);
    left = rows.length > cfg.maxPerRun ? (await deps.db.order.count({ where })) - cfg.maxPerRun : 0;
  } else {
    ids = [...new Set(v.orderIds!)];
    if (ids.length > cfg.maxPerRun) throw new ShippingError('TOO_MANY', 'more orders than one press books', ['orderIds'], { max: cfg.maxPerRun });
  }
  const conn = await courierApi(deps, who.storeId, courier.providerKey);
  const results: BookingOutcome[] = [];
  // one at a time: each order under its own lock, the courier asked once per order
  for (const orderId of ids) results.push(await bookOne(deps, who, { id: courier.id, ...conn }, orderId));
  const counts = { booked: 0, unknown: 0, failed: 0, skipped: 0 };
  for (const r of results) counts[r.outcome] += 1;
  return { courierAccountId: courier.id, mode: conn.mode, results, counts, left };
}

const skipped = (orderId: string, number: string | null, code: string, error: string | null = null, data?: Record<string, unknown>): BookingOutcome => ({ orderId, number, outcome: 'skipped', code, shipmentId: null, consignmentId: null, error, ...(data ? { data } : {}) });

const ORDER_SELECT = {
  id: true,
  number: true,
  areaId: true,
  note: true,
  ...DELIVERY_TARGET_SELECT,
  items: { where: { status: 'ACTIVE' }, select: { productName: true, colourName: true, sizeLabel: true, quantity: true, lineTotalMinor: true, variantId: true }, orderBy: { createdAt: 'asc' } },
} as const satisfies Prisma.OrderSelect;

interface Courier {
  id: string;
  api: CourierApi;
  mode: Mode;
}

type Db = ShippingDeps['db'] | Tx;

/** The parcel's facts from the order row (read again under the order's lock before anything is written). */
async function prepare(db: Db, storeId: number, courier: Courier, orderId: string, cfg: CourierBookingSettings, today: string, zoneRule: 'whenRequired' | 'always') {
  const o = await db.order.findFirst({ where: { id: orderId, storeId, archivedAt: null }, select: ORDER_SELECT });
  if (!o) return { skip: skipped(orderId, null, 'NOT_FOUND') } as const;
  const target = deliveryTarget(o);
  const problems = receiverProblems(target);
  if (problems.length) return { skip: skipped(o.id, o.number, 'NO_RECEIVER', null, { missing: problems }) } as const;
  const gift = giftBooking(target.gift?.deliverAfter ?? null, cfg.giftLeadDays, today);
  if (gift.waits) return { skip: skipped(o.id, o.number, 'GIFT_DATE', null, { bookFrom: gift.bookFrom }) } as const;
  const variantIds = o.items.map((i) => i.variantId).filter((x): x is string => !!x);
  const need = zoneNeedOf(courier.api.capabilities, zoneRule);
  const [variants, zone] = await Promise.all([
    db.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, weightGrams: true } }),
    o.areaId && courier.api.capabilities.zoneIds ? pairFor(db, courier.id, o.areaId, need) : null,
  ]);
  // PR 554: a courier that needs its own ids waits for the area's pair (never sent to fail at the courier)
  if (need && !zone) return { skip: skipped(o.id, o.number, o.areaId ? 'AREA_UNMAPPED' : 'AREA_UNKNOWN', null, { areaId: o.areaId, need }) } as const;
  const weights = new Map(variants.map((x) => [x.id, x.weightGrams]));
  const lines: ParcelLine[] = o.items.map((i) => ({ productName: i.productName, colourName: i.colourName, sizeLabel: i.sizeLabel, quantity: i.quantity, weightGrams: i.variantId ? (weights.get(i.variantId) ?? null) : null }));
  // PR 177: a courier that charges by weight never gets a parcel without one (SIM-F-029)
  if (courier.api.capabilities.weightRequired && parcelWeight(lines) === null) return { skip: skipped(o.id, o.number, 'NO_WEIGHT', null, { pieces: lines.filter((l) => l.weightGrams === null).map((l) => l.productName) }) } as const;
  return {
    order: o,
    lines,
    zone,
    target,
    receiver: { name: target.name!, phone: courierPhone(target.phone)!, address: target.address! },
    note: bookingNoteOf({ customerNote: o.note, gift: target.gift, giftLine: cfg.giftNote[cfg.noteLang] }),
  } as const;
}

/** A refusal found again under the lock: the transaction writes nothing and the order gets its reason. */
class Skip extends Error {
  constructor(readonly outcome: BookingOutcome) {
    super(outcome.code ?? 'skipped');
  }
}

/** One order: checks, the parcel row under the order service's lock, then the courier. */
async function bookOne(deps: ShippingDeps, who: Who, courier: Courier, orderId: string): Promise<BookingOutcome> {
  const [cfg, timeZone, zones] = await Promise.all([setting(deps, who.storeId, 'delivery.courier.booking'), setting(deps, who.storeId, 'store.timeZone'), setting(deps, who.storeId, 'delivery.courier.zoneSync')]);
  const today = localDay(nowOf(deps), timeZone);
  // a quick look first (no lock): most refusals need no transaction
  const first = await prepare(deps.db, who.storeId, courier, orderId, cfg, today, zones.unmapped);
  if (first.skip) {
    if (first.skip.code === 'AREA_UNMAPPED' || first.skip.code === 'AREA_UNKNOWN') await noteAreaHeld(deps, who, courier.id, first.skip);
    return first.skip;
  }
  const number = first.order.number;

  let booked = null as { shipmentId: string; lines: ParcelLine[] } | null;
  try {
    await bookWith(ordersDeps(deps), { storeId: who.storeId, orderId }, staffBy(who.actor, who.ctx), async (tx, locked) => {
      await assertBookable(tx, who.storeId, orderId);
      // the row as it is under the lock: an edit that raced this press is what goes to the courier, or the reason why not
      const p = await prepare(tx, who.storeId, courier, orderId, cfg, today, zones.unmapped);
      if (p.skip) throw new Skip(p.skip);
      const attempt = (await tx.shipment.count({ where: { storeId: who.storeId, orderId } })) + 1;
      const merchantRef = `${locked.number}-${attempt}`;
      const s = await tx.shipment.create({
        data: {
          storeId: who.storeId,
          orderId,
          courierAccountId: courier.id,
          status: 'BOOKING',
          mode: courier.mode,
          attempt,
          merchantRef,
          idempotencyKey: `book:${orderId}:${attempt}`,
          // SIM-F-004: the amount due now; the order cannot change after this (edits refused once booked)
          codAmountMinor: dueOf(locked),
          declaredValueMinor: p.order.items.reduce((sum, i) => sum + i.lineTotalMinor, 0),
          weightGrams: parcelWeight(p.lines),
          receiver: { ...p.receiver, gift: p.target.gift ? { senderName: p.target.gift.senderName, deliverAfter: p.target.gift.deliverAfter, note: p.target.gift.note } : null },
          bookingNote: p.note,
          courierCityId: p.zone?.courierCityId ?? null,
          courierZoneId: p.zone?.courierZoneId ?? null,
          courierAreaId: p.zone?.courierAreaId ?? null,
          bookedById: who.actor.staffUserId,
        },
        select: { id: true },
      });
      // the order shows its courier (not its status: that is the order service's alone)
      await tx.order.update({ where: { id: orderId }, data: { courierAccountId: courier.id } });
      booked = { shipmentId: s.id, lines: p.lines };
      return { shipmentId: s.id, data: { courierAccountId: courier.id, attempt, merchantRef, mode: courier.mode } };
    });
  } catch (e) {
    if (e instanceof Skip) return e.outcome;
    if (isOrdersError(e)) return skipped(orderId, number, e.code, null, e.data);
    if (isInventoryError(e)) return skipped(orderId, number, e.code, null, { details: e.details });
    throw e;
  }
  // a replayed command (same idempotency key) writes nothing new: nothing to send
  if (!booked) return skipped(orderId, number, 'BOOKED');
  return send(deps, who, courier, booked.shipmentId, booked.lines, cfg.itemNames);
}

/**
 * PR 554: the order's timeline says once per courier and area that the parcel waits for the area's pair (the courier's
 * page lists the areas parcels wait for). Pressing "Book" again writes nothing new.
 */
async function noteAreaHeld(deps: ShippingDeps, who: Who, courierAccountId: string, skip: BookingOutcome): Promise<void> {
  const areaId = (skip.data?.areaId as string | null | undefined) ?? null;
  const before = await deps.db.orderEvent.findMany({ where: { storeId: who.storeId, orderId: skip.orderId, type: 'shipment.areaHeld' }, select: { data: true } });
  if (before.some((e) => { const d = e.data as { courierAccountId?: string; areaId?: string | null } | null; return d?.courierAccountId === courierAccountId && (d.areaId ?? null) === areaId; })) return;
  await deps.db.orderEvent.create({
    data: { storeId: who.storeId, orderId: skip.orderId, type: 'shipment.areaHeld', data: { code: skip.code, courierAccountId, areaId, need: (skip.data?.need as string | undefined) ?? null }, actorType: who.actor.staffUserId ? 'STAFF' : 'SYSTEM', actorId: who.actor.staffUserId, source: 'admin' },
  });
}

const PARCEL_SELECT = { id: true, orderId: true, order: { select: { number: true } }, merchantRef: true, receiver: true, courierCityId: true, courierZoneId: true, courierAreaId: true, codAmountMinor: true, declaredValueMinor: true, weightGrams: true, bookingNote: true } as const;

/** The parcel as the courier is sent it, from the row written under the lock. */
function parcelOf(s: Prisma.ShipmentGetPayload<{ select: typeof PARCEL_SELECT }>, caps: CourierApi['capabilities'], lines: readonly ParcelLine[], itemNames: boolean): CourierParcel {
  const r = s.receiver as { name: string; phone: string; address: string };
  return {
    merchantRef: s.merchantRef!,
    receiver: { name: r.name, phone: r.phone, address: r.address },
    zone: caps.zoneIds ? { cityId: s.courierCityId, zoneId: s.courierZoneId, areaId: s.courierAreaId } : { cityId: null, zoneId: null, areaId: null },
    codMinor: s.codAmountMinor,
    declaredValueMinor: caps.declaredValue ? s.declaredValueMinor : null,
    weightGrams: s.weightGrams,
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    description: parcelDescription(lines, itemNames),
    note: s.bookingNote,
  };
}

/** Asks the courier to take the parcel and records its answer. */
async function send(deps: ShippingDeps, who: Who, courier: Courier, shipmentId: string, lines: readonly ParcelLine[], itemNames: boolean): Promise<BookingOutcome> {
  const s = await deps.db.shipment.findUniqueOrThrow({ where: { id: shipmentId }, select: PARCEL_SELECT });
  let answer: Awaited<ReturnType<CourierApi['book']>>;
  try {
    answer = await courier.api.book(parcelOf(s, courier.api.capabilities, lines, itemNames));
  } catch (e) {
    answer = { ok: false, error: e instanceof Error ? e.message : String(e), unknown: true };
  }
  if (answer.ok) {
    await complete(deps, who, shipmentId, { consignmentId: answer.consignmentId, trackingCode: answer.trackingCode, status: answer.status, rawStatus: answer.rawStatus, chargeMinor: answer.chargeMinor });
    return { orderId: s.orderId, number: s.order.number, outcome: 'booked', code: null, shipmentId, consignmentId: answer.consignmentId, error: null };
  }
  if (answer.unknown) {
    await deps.db.shipment.update({ where: { id: shipmentId }, data: { bookingError: answer.error.slice(0, 500) } });
    return { orderId: s.orderId, number: s.order.number, outcome: 'unknown', code: 'NO_ANSWER', shipmentId, consignmentId: null, error: answer.error };
  }
  await fail(deps, who, shipmentId, answer.error);
  return { orderId: s.orderId, number: s.order.number, outcome: 'failed', code: 'COURIER_REFUSED', shipmentId, consignmentId: null, error: answer.error };
}

/** The courier took it: its ids, the booking time and its first state, stored as the parcel's first event. */
async function complete(deps: ShippingDeps, who: Who, shipmentId: string, a: { consignmentId: string | null; trackingCode: string | null; status: string | null; rawStatus: string | null; chargeMinor: number | null }): Promise<void> {
  const now = nowOf(deps);
  await deps.db.$transaction(async (tx) => {
    const s = await tx.shipment.update({
      where: { id: shipmentId },
      data: { consignmentId: a.consignmentId, trackingCode: a.trackingCode, bookedAt: now, bookingError: null, ...(a.chargeMinor !== null ? { chargeMinor: a.chargeMinor } : {}) },
      select: { merchantRef: true, orderId: true },
    });
    // a booking the courier accepted without saying a state is waiting for pickup
    const status = (a.status ?? 'PENDING_PICKUP') as Parameters<typeof applyEventsIn>[2][number]['status'];
    await applyEventsIn(tx, { storeId: who.storeId, shipmentId }, [{ providerEventId: `booking:${a.consignmentId ?? s.merchantRef}`, status, rawStatus: a.rawStatus ?? 'booked', occurredAt: now, note: null, reasonKey: null, codCollectedMinor: null, chargeMinor: null }], 'booking', { now, actorId: who.actor.staffUserId });
    await logChange(tx, who, 'shipment.booked', 'Shipment', shipmentId, null, { consignmentId: a.consignmentId, status });
  }, TX);
}

/** The courier refused: the parcel is BOOKING_FAILED with its reason, and the order is ready to book again. */
async function fail(deps: ShippingDeps, who: Who, shipmentId: string, error: string, tx?: Tx): Promise<void> {
  const run = async (t: Tx) => {
    const s = await t.shipment.update({ where: { id: shipmentId }, data: { status: 'BOOKING_FAILED', bookingError: error.slice(0, 500) }, select: { orderId: true, merchantRef: true } });
    await t.orderEvent.create({ data: { storeId: who.storeId, orderId: s.orderId, type: 'shipment.bookingFailed', message: error.slice(0, 500), data: { shipmentId, merchantRef: s.merchantRef }, actorType: who.actor.staffUserId ? 'STAFF' : 'SYSTEM', actorId: who.actor.staffUserId, source: 'admin' } });
    await logChange(t, who, 'shipment.bookingFailed', 'Shipment', shipmentId, { status: 'BOOKING' }, { status: 'BOOKING_FAILED', error: error.slice(0, 500) });
  };
  if (tx) await run(tx);
  else await deps.db.$transaction(run, TX);
}

/**
 * "Try again" on a parcel whose booking failed or got no answer. No answer: the courier is asked for the shop's
 * reference first; when it has the parcel, the booking is completed with it (never booked twice), else it is marked
 * failed and booked again. A failed booking is booked again with the same courier as a new try (the order service
 * decides whether the order may still be booked).
 */
export async function retryBooking(deps: ShippingDeps, who: Who, shipmentId: string): Promise<BookingOutcome> {
  await allow(deps, who, 'delivery.book');
  const s = await deps.db.shipment.findFirst({ where: { id: shipmentId, storeId: who.storeId }, select: { id: true, orderId: true, status: true, bookingError: true, merchantRef: true, courierAccountId: true, createdAt: true, order: { select: { number: true } } } });
  if (!s) throw new ShippingError('NOT_FOUND', 'no such parcel', ['shipmentId']);
  const lostAnswer = s.status === 'BOOKING' && s.bookingError !== null;
  if (!lostAnswer && s.status !== 'BOOKING_FAILED') throw new ShippingError('NOT_RETRYABLE', 'only a failed booking, or one without an answer, is tried again', ['shipmentId'], { status: s.status });
  const newer = await deps.db.shipment.count({ where: { storeId: who.storeId, orderId: s.orderId, createdAt: { gt: s.createdAt } } });
  if (newer) throw new ShippingError('NOT_RETRYABLE', 'the order has a newer booking', ['shipmentId'], { status: s.status });
  const account = await bookableCourier(deps.db, who.storeId, s.courierAccountId);
  const conn = await courierApi(deps, who.storeId, account.providerKey);
  if (lostAnswer) {
    let found: Awaited<ReturnType<CourierApi['findByRef']>>;
    try {
      found = await conn.api.findByRef(s.merchantRef!);
    } catch (e) {
      // PR 177: a courier that cannot be asked by reference (Pathao) is never booked again by guess: staff check its panel
      throw new ShippingError('NOT_RETRYABLE', 'the courier cannot be asked whether it has this parcel', ['shipmentId'], { status: s.status, lookup: e instanceof Error ? e.message : String(e) });
    }
    if (found) {
      await complete(deps, who, s.id, { consignmentId: found.consignmentId, trackingCode: found.trackingCode, status: found.status, rawStatus: found.rawStatus, chargeMinor: null });
      return { orderId: s.orderId, number: s.order.number, outcome: 'booked', code: null, shipmentId: s.id, consignmentId: found.consignmentId, error: null, data: { recovered: true } };
    }
    await fail(deps, who, s.id, s.bookingError!);
  }
  return bookOne(deps, who, { id: account.id, ...conn }, s.orderId);
}
