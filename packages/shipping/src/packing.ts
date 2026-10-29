// PR 182 (Blueprint B1.3; BACKEND-ARCHITECTURE §5.3 ORD-04; CN-014c, SIM-F-002, SIM-F-010, follow-ups 433, 434) — the
// packing step of Orders › Packing & print: pick, pack and hand over on one screen.
//
// - The queue: the orders at each step, Pick (confirmed) → Pack (picking started) → Ready for courier (packed) → Handed
//   over (the owner's days). One filter for the screen's lists and for every bulk action on it ("Start picking" for
//   all): never a cancelled, archived or in-review order, never one whose cancel is asked or pending (SIM-F-002).
// - One order at the table: its lines with each piece checked (scanned, the SKU typed when the scanner is off, or a
//   tick when the owner packs without a scanner), its open packing cards, its photos, its weight, its parcel.
// - Every state move goes through the order service (`orderStep`: start picking, pack), under the order's row lock. The
//   packing checks run inside that lock: every line checked, no open packing card, the owner's required photo (or his
//   override with a reason, SIM-F-010), and the weight (follow-up 434). A booking waits for a required photo too
//   (`assertPackingPhoto`, called by booking.ts).
// - Packing photos are kept for the owner's days, then archived by the daily sweep (`expirePackingPhotos`); never
//   deleted.
// Nothing here books, cancels or edits an order, or touches a parcel, its COD or a charge. No customer's details are
// shown: order numbers, pieces, codes, the courier and the consignment id.
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { isOrdersError, openReviewIds, orderStep, staffBy, type CommandOptions, type CommandResult, type OrdersDeps } from '@extas/orders';
import { allow, logChange, nowOf, parse, setting, TX, type Db, type ShippingDeps, type Tx, type Who } from './context';
import { ShippingError } from './errors';
import { allChecked, CHECKING_STATES, codeKey, dayStart, lineChecks, matchPiece, packBlock, photoState, stepOf, weightGap, type LineCheck, type PackBlock, type PackLine, type PackStep, type PhotoState, type WeightGap } from './packing-pure';
import { parcelWeight } from './pure';

const ordersDeps = (deps: ShippingDeps): OrdersDeps => ({ db: deps.db, settings: deps.settings, now: deps.now });
const LIVE_SHIPMENT = { status: { notIn: ['BOOKING_FAILED', 'CANCELLED'] } } as const satisfies Prisma.ShipmentWhereInput;

// ---------------------------------------------------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------------------------------------------------

/** The orders the packing screen works on, at every step (one filter for the lists and the bulk actions). */
async function queueWhere(deps: ShippingDeps, storeId: number): Promise<Prisma.OrderWhereInput> {
  const [queue, timeZone, reviews, carded] = await Promise.all([
    setting(deps, storeId, 'fulfilment.packing.queue'),
    setting(deps, storeId, 'store.timeZone'),
    openReviewIds(ordersDeps(deps), storeId),
    deps.db.packingIssue.findMany({ where: { storeId, resolvedAt: null }, select: { orderId: true }, distinct: ['orderId'] }),
  ]);
  const since = dayStart(nowOf(deps), timeZone, queue.doneDays);
  return {
    storeId,
    archivedAt: null,
    // SIM-F-002 / F-014: a cancel asked or pending, or an open review, is decided before anything is packed
    cancelPending: false,
    cancelRequestedAt: null,
    id: { notIn: reviews },
    OR: [
      { status: { in: ['CONFIRMED', 'PROCESSING', 'PACKED'] } },
      { status: 'HANDED_OVER', handedOverAt: { gte: since } },
      // PR 183: held from its step with an open packing card — it stays there, with the card, until a person decides
      { status: 'ON_HOLD', holdFromStatus: { in: ['CONFIRMED', 'PROCESSING'] }, id: { in: carded.map((c) => c.orderId) } },
    ],
  };
}

const STEP_WHERE: Record<PackStep, Prisma.OrderWhereInput> = {
  pick: { OR: [{ status: 'CONFIRMED' }, { status: 'ON_HOLD', holdFromStatus: 'CONFIRMED' }] },
  pack: { OR: [{ status: 'PROCESSING' }, { status: 'ON_HOLD', holdFromStatus: 'PROCESSING' }] },
  ready: { status: 'PACKED' },
  done: { status: 'HANDED_OVER' },
};

const QUEUE_SELECT = {
  id: true,
  number: true,
  status: true,
  holdFromStatus: true,
  holdReasonCode: true,
  placedAt: true,
  packedAt: true,
  handedOverAt: true,
  isGift: true,
  giftDeliverAfter: true,
  version: true,
  items: { where: { status: 'ACTIVE' }, select: { quantity: true } },
  shipments: { where: LIVE_SHIPMENT, select: { id: true, consignmentId: true, labelPrintCount: true, courierAccount: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 1 },
} as const satisfies Prisma.OrderSelect;
type QueueRow = Prisma.OrderGetPayload<{ select: typeof QUEUE_SELECT }>;

/** One order on a step's list (no customer's details). */
export interface PackQueueRow {
  orderId: string;
  orderNumber: string;
  status: string;
  step: PackStep;
  pieces: number;
  gift: { deliverAfter: string | null } | null;
  courierName: string | null;
  consignmentId: string | null;
  openIssues: number;
  photos: number;
  placedAt: string;
}

export interface PackQueue {
  step: PackStep;
  counts: Record<PackStep, number>;
  rows: PackQueueRow[];
  /** More orders at this step than one list shows (the owner's `listMax`). */
  more: number;
}

const rowOf = (o: QueueRow, issues: Map<string, number>, photos: Map<string, number>): PackQueueRow => ({
  orderId: o.id,
  orderNumber: o.number,
  status: o.status,
  step: stepOf(o.status, o.holdFromStatus) ?? 'pick',
  pieces: o.items.reduce((n, i) => n + i.quantity, 0),
  gift: o.isGift ? { deliverAfter: o.giftDeliverAfter ? o.giftDeliverAfter.toISOString().slice(0, 10) : null } : null,
  courierName: o.shipments[0]?.courierAccount.name ?? null,
  consignmentId: o.shipments[0]?.consignmentId ?? null,
  openIssues: issues.get(o.id) ?? 0,
  photos: photos.get(o.id) ?? 0,
  placedAt: o.placedAt.toISOString(),
});

async function countsBy(db: Db, storeId: number, orderIds: string[]): Promise<{ issues: Map<string, number>; photos: Map<string, number> }> {
  if (!orderIds.length) return { issues: new Map(), photos: new Map() };
  const [issues, photos] = await Promise.all([
    db.packingIssue.groupBy({ by: ['orderId'], where: { storeId, orderId: { in: orderIds }, resolvedAt: null }, _count: { _all: true } }),
    db.packingPhoto.groupBy({ by: ['orderId'], where: { storeId, orderId: { in: orderIds }, archivedAt: null }, _count: { _all: true } }),
  ]);
  return { issues: new Map(issues.map((r) => [r.orderId, r._count._all])), photos: new Map(photos.map((r) => [r.orderId, r._count._all])) };
}

const queueQuery = z.object({ step: z.enum(['pick', 'pack', 'ready', 'done']).default('pick') }).strict();

/** The packing screen's steps with their counts, and the orders of one step, oldest first. */
export async function packingQueue(deps: ShippingDeps, who: Who, query: unknown = {}): Promise<PackQueue> {
  await allow(deps, who, 'fulfilment.read');
  const q = parse(queueQuery, query, 'packing queue');
  const [base, cfg] = await Promise.all([queueWhere(deps, who.storeId), setting(deps, who.storeId, 'fulfilment.packing.queue')]);
  const counts = Object.fromEntries(await Promise.all((Object.keys(STEP_WHERE) as PackStep[]).map(async (s) => [s, await deps.db.order.count({ where: { AND: [base, STEP_WHERE[s]] } })] as const))) as Record<PackStep, number>;
  const rows = await deps.db.order.findMany({ where: { AND: [base, STEP_WHERE[q.step]] }, select: QUEUE_SELECT, orderBy: [{ placedAt: 'asc' }, { id: 'asc' }], take: cfg.listMax });
  const { issues, photos } = await countsBy(deps.db, who.storeId, rows.map((r) => r.id));
  return { step: q.step, counts, rows: rows.map((r) => rowOf(r, issues, photos)), more: Math.max(0, counts[q.step] - rows.length) };
}

// ---------------------------------------------------------------------------------------------------------------------
// One order at the packing table
// ---------------------------------------------------------------------------------------------------------------------

const ORDER_SELECT = {
  ...QUEUE_SELECT,
  items: { where: { status: 'ACTIVE' }, select: { id: true, sku: true, variantId: true, productName: true, colourName: true, sizeLabel: true, quantity: true }, orderBy: { createdAt: 'asc' } },
} as const satisfies Prisma.OrderSelect;

/** One line at the table. */
export interface PackOrderLine extends LineCheck {
  sku: string;
  barcode: string | null;
  productName: string;
  colourName: string | null;
  sizeLabel: string | null;
  weightGrams: number | null;
}

/** What the packer sees for one order. */
export interface PackOrder {
  orderId: string;
  orderNumber: string;
  status: string;
  step: PackStep | null;
  version: number;
  gift: { deliverAfter: string | null } | null;
  lines: PackOrderLine[];
  allChecked: boolean;
  /** Open packing cards (shortages, damaged or missing pieces): decided by a person before packing and booking. */
  openIssues: { id: string; kind: string; orderItemId: string; note: string | null; createdAt: string; overdue: boolean }[];
  /** PR 183: the hold, when the order is held (the packing card's hold, or another one). */
  hold: { from: string | null; reasonKey: string | null } | null;
  photo: { state: PhotoState; count: number; needed: number; keepDays: number; lastAt: string | null; waivedReason: string | null };
  weight: { enabled: boolean; expectedGrams: number | null; weighedGrams: number | null; gap: WeightGap | null; confirmed: boolean };
  parcel: { shipmentId: string; courierName: string; consignmentId: string | null; printCount: number } | null;
  /** What still stops "Mark packed" (null: it can run). */
  blocked: PackBlock | null;
  check: { mode: 'scan' | 'tick'; allowTyped: boolean };
}

interface Loaded {
  o: Prisma.OrderGetPayload<{ select: typeof ORDER_SELECT }>;
  lines: PackLine[];
  weights: Map<string, number | null>;
  barcodes: Map<string, string | null>;
  scans: { orderItemId: string; quantity: number; sku: string }[];
  issues: { id: string; kind: string; orderItemId: string; note: string | null; createdAt: Date }[];
  photos: { createdAt: Date }[];
  check: { weighedGrams: number | null; expectedGrams: number | null; weightGapConfirmed: boolean; photoWaivedReason: string | null } | null;
}

async function load(db: Db, storeId: number, orderId: string): Promise<Loaded> {
  const o = await db.order.findFirst({ where: { id: orderId, storeId, archivedAt: null }, select: ORDER_SELECT });
  if (!o) throw new ShippingError('NOT_FOUND', 'no such order', ['orderId']);
  const variantIds = o.items.map((i) => i.variantId).filter((x): x is string => !!x);
  const [variants, scans, issues, photos, check] = await Promise.all([
    variantIds.length ? db.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, barcode: true, weightGrams: true } }) : [],
    db.packingScan.findMany({ where: { storeId, orderId }, select: { orderItemId: true, quantity: true, sku: true } }),
    db.packingIssue.findMany({ where: { storeId, orderId, resolvedAt: null }, select: { id: true, kind: true, orderItemId: true, note: true, createdAt: true }, orderBy: { createdAt: 'asc' } }),
    db.packingPhoto.findMany({ where: { storeId, orderId, archivedAt: null }, select: { createdAt: true }, orderBy: { createdAt: 'asc' } }),
    db.packingCheck.findUnique({ where: { storeId_orderId: { storeId, orderId } }, select: { weighedGrams: true, expectedGrams: true, weightGapConfirmed: true, photoWaivedReason: true } }),
  ]);
  const byId = new Map(variants.map((v) => [v.id, v]));
  const barcodes = new Map(o.items.map((i) => [i.id, i.variantId ? (byId.get(i.variantId)?.barcode ?? null) : null]));
  const weights = new Map(o.items.map((i) => [i.id, i.variantId ? (byId.get(i.variantId)?.weightGrams ?? null) : null]));
  const lines = o.items.map((i) => ({ id: i.id, sku: i.sku, barcode: barcodes.get(i.id) ?? null, quantity: i.quantity }));
  // PR 183: a scan counts while its line still holds the SKU it was scanned for (after a size swap the new piece is
  // checked again); the scans themselves are never changed
  const skuOf = new Map(o.items.map((i) => [i.id, i.sku]));
  const live = scans.filter((s) => skuOf.get(s.orderItemId) === s.sku);
  return { o, lines, weights, barcodes, scans: live, issues, photos, check };
}

const expectedOf = (l: Loaded): number | null => parcelWeight(l.o.items.map((i) => ({ productName: i.productName, colourName: i.colourName, sizeLabel: i.sizeLabel, quantity: i.quantity, weightGrams: l.weights.get(i.id) ?? null })));

async function packSettings(deps: ShippingDeps, storeId: number) {
  const [check, photo, weight, issues] = await Promise.all([
    setting(deps, storeId, 'fulfilment.packing.check'),
    setting(deps, storeId, 'fulfilment.packing.photo'),
    setting(deps, storeId, 'fulfilment.packing.weight'),
    setting(deps, storeId, 'fulfilment.packing.issues'),
  ]);
  return { check, photo, weight, issues, now: nowOf(deps) };
}
type PackSettings = Awaited<ReturnType<typeof packSettings>>;

function viewOf(l: Loaded, cfg: PackSettings, input: { weighedGrams?: number | null; weightConfirmed?: boolean } = {}): PackOrder {
  const checks = lineChecks(l.lines, l.scans);
  const photo = photoState(cfg.photo, l.photos.length, !!l.check?.photoWaivedReason);
  const expectedGrams = expectedOf(l);
  const weighedGrams = input.weighedGrams !== undefined ? input.weighedGrams : (l.check?.weighedGrams ?? null);
  const confirmed = input.weightConfirmed ?? l.check?.weightGapConfirmed ?? false;
  const s = l.o.shipments[0];
  return {
    orderId: l.o.id,
    orderNumber: l.o.number,
    status: l.o.status,
    step: stepOf(l.o.status, l.o.holdFromStatus),
    version: l.o.version,
    gift: l.o.isGift ? { deliverAfter: l.o.giftDeliverAfter ? l.o.giftDeliverAfter.toISOString().slice(0, 10) : null } : null,
    lines: l.o.items.map((i, k) => ({ ...checks[k]!, sku: i.sku, barcode: l.barcodes.get(i.id) ?? null, productName: i.productName, colourName: i.colourName, sizeLabel: i.sizeLabel, weightGrams: l.weights.get(i.id) ?? null })),
    allChecked: allChecked(checks),
    openIssues: l.issues.map((i) => ({ id: i.id, kind: i.kind, orderItemId: i.orderItemId, note: i.note, createdAt: i.createdAt.toISOString(), overdue: cfg.issues.decideWithinHours > 0 && cfg.now.getTime() - i.createdAt.getTime() > cfg.issues.decideWithinHours * 3_600_000 })),
    hold: l.o.status === 'ON_HOLD' ? { from: l.o.holdFromStatus, reasonKey: l.o.holdReasonCode } : null,
    photo: { state: photo, count: l.photos.length, needed: cfg.photo.minPhotos, keepDays: cfg.photo.keepDays, lastAt: l.photos.at(-1)?.createdAt.toISOString() ?? null, waivedReason: l.check?.photoWaivedReason ?? null },
    weight: { enabled: cfg.weight.enabled, expectedGrams, weighedGrams, gap: weightGap(expectedGrams, weighedGrams, cfg.weight), confirmed },
    parcel: s ? { shipmentId: s.id, courierName: s.courierAccount.name, consignmentId: s.consignmentId, printCount: s.labelPrintCount } : null,
    blocked: (CHECKING_STATES as readonly string[]).includes(l.o.status)
      ? packBlock({ check: cfg.check, checks, openIssues: l.issues.length, photo, weight: cfg.weight, expectedGrams, weighedGrams, weightConfirmed: confirmed })
      : null,
    check: cfg.check,
  };
}

/** One order at the packing table. */
export async function packingOrder(deps: ShippingDeps, who: Who, orderId: string): Promise<PackOrder> {
  await allow(deps, who, 'fulfilment.read');
  const [l, cfg] = await Promise.all([load(deps.db, who.storeId, orderId), packSettings(deps, who.storeId)]);
  return viewOf(l, cfg);
}

// ---------------------------------------------------------------------------------------------------------------------
// Start picking (one, or every order on the Pick step)
// ---------------------------------------------------------------------------------------------------------------------

/** Confirmed → picking started, through the order service. */
export async function startPicking(deps: ShippingDeps, who: Who, orderId: string, opts: CommandOptions = {}): Promise<CommandResult> {
  await allow(deps, who, 'fulfilment.pack');
  return orderStep(ordersDeps(deps), { storeId: who.storeId, orderId }, staffBy(who.actor, who.ctx), 'startPicking', {}, opts);
}

/** What "Start picking" for every order on the Pick step did. */
export interface StartAllResult {
  started: string[];
  skipped: { orderNumber: string; reason: string }[];
}

/**
 * "Start picking" for the whole Pick step: the same filter as the screen's list (SIM-F-002: a cancelled, held or
 * in-review order is never on it), up to the owner's list size; each order through the order service, which refuses
 * what changed since (named, never forced).
 */
export async function startPickingAll(deps: ShippingDeps, who: Who): Promise<StartAllResult> {
  await allow(deps, who, 'fulfilment.pack');
  const [base, cfg] = await Promise.all([queueWhere(deps, who.storeId), setting(deps, who.storeId, 'fulfilment.packing.queue')]);
  // a held order on the Pick step waits for its card: never started here
  const rows = await deps.db.order.findMany({ where: { AND: [base, { status: 'CONFIRMED' }] }, select: { id: true, number: true }, orderBy: [{ placedAt: 'asc' }, { id: 'asc' }], take: cfg.listMax });
  const out: StartAllResult = { started: [], skipped: [] };
  const by = staffBy(who.actor, who.ctx);
  for (const r of rows) {
    try {
      await orderStep(ordersDeps(deps), { storeId: who.storeId, orderId: r.id }, by, 'startPicking');
      out.started.push(r.number);
    } catch (e) {
      if (!isOrdersError(e)) throw e;
      out.skipped.push({ orderNumber: r.number, reason: e.code });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Checking the pieces
// ---------------------------------------------------------------------------------------------------------------------

const pieceInput = z.union([
  z.object({ code: z.string().trim().min(1).max(80), source: z.enum(['scan', 'typed']).default('scan') }).strict(),
  z.object({ lineId: z.uuid(), source: z.literal('tick') }).strict(),
]);

/** Locks the order row for a packing write (two scanners at once wait for each other). */
export async function lockOrder(tx: Tx, storeId: number, orderId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Order" WHERE "id" = ${orderId}::uuid AND "storeId" = ${storeId} FOR UPDATE`;
  if (!rows.length) throw new ShippingError('NOT_FOUND', 'no such order', ['orderId']);
}

/**
 * Checks one piece: a scanned or typed code (the line's SKU or its barcode) or, when the owner packs without a scanner,
 * a tick on a line. A code on no line, or a line already complete, is refused and nothing is stored. Only while the
 * order is confirmed or picking.
 */
export async function checkPiece(deps: ShippingDeps, who: Who, orderId: string, input: unknown): Promise<PackOrder> {
  await allow(deps, who, 'fulfilment.pack');
  const d = parse(pieceInput, input, 'piece');
  const cfg = await packSettings(deps, who.storeId);
  if (d.source === 'tick' ? cfg.check.mode !== 'tick' : cfg.check.mode !== 'scan' || (d.source === 'typed' && !cfg.check.allowTyped)) {
    throw new ShippingError('CHECK_MODE', 'the shop does not check pieces this way', [d.source], { mode: cfg.check.mode, allowTyped: cfg.check.allowTyped });
  }
  const l = await deps.db.$transaction(async (tx) => {
    await lockOrder(tx, who.storeId, orderId);
    const now = await load(tx, who.storeId, orderId);
    if (!(CHECKING_STATES as readonly string[]).includes(now.o.status)) throw new ShippingError('NOT_PACKING', 'pieces are checked while the order is confirmed or picking', [], { status: now.o.status });
    const checks = lineChecks(now.lines, now.scans);
    let lineId: string;
    if ('lineId' in d) {
      const c = checks.find((x) => x.lineId === d.lineId);
      if (!c) throw new ShippingError('NOT_IN_ORDER', 'no such line on this order', ['lineId']);
      if (c.done) throw new ShippingError('ALREADY_CHECKED', 'this line is checked already', ['lineId']);
      lineId = d.lineId;
    } else {
      const m = matchPiece(now.lines, checks, d.code);
      if ('refused' in m) throw new ShippingError(m.refused, m.refused === 'NOT_IN_ORDER' ? 'this code is on no line of the order' : 'every piece with this code is checked already', [codeKey(d.code)]);
      lineId = m.lineId;
    }
    const line = now.lines.find((x) => x.id === lineId)!;
    // a tick checks the whole line; a scan or a typed code one piece
    const quantity = 'lineId' in d ? line.quantity - checks.find((x) => x.lineId === lineId)!.checked : 1;
    await tx.packingScan.create({ data: { storeId: who.storeId, orderId, orderItemId: lineId, sku: line.sku, quantity, source: d.source, scannedById: who.actor.staffUserId } });
    await logChange(tx, who, 'packing.piece', 'Order', orderId, null, { lineId, sku: line.sku, quantity, source: d.source });
    return load(tx, who.storeId, orderId);
  }, TX);
  return viewOf(l, cfg);
}

// ---------------------------------------------------------------------------------------------------------------------
// The packing photo and the owner's override
// ---------------------------------------------------------------------------------------------------------------------

const photoInput = z.object({ mediaAssetId: z.uuid() }).strict();

/** A packing photo for the order (the app stores the file first), kept for the owner's days. */
export async function addPackingPhoto(deps: ShippingDeps, who: Who, orderId: string, input: unknown): Promise<PackOrder> {
  await allow(deps, who, 'fulfilment.pack');
  const d = parse(photoInput, input, 'packing photo');
  const cfg = await packSettings(deps, who.storeId);
  if (!cfg.photo.enabled) throw new ShippingError('PHOTO_OFF', 'the packing photo is switched off');
  const asset = await deps.db.mediaAsset.findFirst({ where: { id: d.mediaAssetId, storeId: who.storeId, kind: 'IMAGE' }, select: { id: true } });
  if (!asset) throw new ShippingError('NOT_FOUND', 'no such photo', ['mediaAssetId']);
  const now = nowOf(deps);
  const l = await deps.db.$transaction(async (tx) => {
    await lockOrder(tx, who.storeId, orderId);
    const o = await load(tx, who.storeId, orderId);
    if (!(['CONFIRMED', 'PROCESSING', 'PACKED'] as string[]).includes(o.o.status)) throw new ShippingError('NOT_PACKING', 'a packing photo is added before the order leaves', [], { status: o.o.status });
    const p = await tx.packingPhoto.create({ data: { storeId: who.storeId, orderId, mediaAssetId: asset.id, takenById: who.actor.staffUserId, keepUntil: new Date(now.getTime() + cfg.photo.keepDays * 86_400_000) }, select: { id: true } });
    await logChange(tx, who, 'packing.photo', 'Order', orderId, null, { photoId: p.id, mediaAssetId: asset.id, keepDays: cfg.photo.keepDays });
    return load(tx, who.storeId, orderId);
  }, TX);
  return viewOf(l, cfg);
}

const waiveInput = z.object({ reason: z.string().trim().min(3).max(300) }).strict();

/** SIM-F-010: the owner lets one order go without the required photo, with a reason (audited). */
export async function waivePackingPhoto(deps: ShippingDeps, who: Who, orderId: string, input: unknown): Promise<PackOrder> {
  await allow(deps, who, 'fulfilment.photoWaive');
  const d = parse(waiveInput, input, 'photo override');
  const cfg = await packSettings(deps, who.storeId);
  const now = nowOf(deps);
  const l = await deps.db.$transaction(async (tx) => {
    await lockOrder(tx, who.storeId, orderId);
    await load(tx, who.storeId, orderId);
    const fields = { photoWaivedReason: d.reason, photoWaivedById: who.actor.staffUserId, photoWaivedAt: now };
    await tx.packingCheck.upsert({ where: { storeId_orderId: { storeId: who.storeId, orderId } }, create: { storeId: who.storeId, orderId, ...fields }, update: fields });
    await logChange(tx, who, 'packing.photo.waive', 'Order', orderId, null, { reason: d.reason });
    return load(tx, who.storeId, orderId);
  }, TX);
  return viewOf(l, cfg);
}

// ---------------------------------------------------------------------------------------------------------------------
// Mark packed
// ---------------------------------------------------------------------------------------------------------------------

const packInput = z.object({ weighedGrams: z.int().min(1).max(100_000).optional(), weightConfirmed: z.boolean().optional() }).strict();

const BLOCK_WORDS: Record<PackBlock, string> = {
  NOT_CHECKED: 'a line is not checked yet',
  PACKING_ISSUE_OPEN: 'an open packing card waits for a decision',
  PHOTO_REQUIRED: 'the packing photo is required',
  WEIGHT_REQUIRED: 'the parcel is weighed first',
  WEIGHT_GAP: 'the reading is far from the pieces’ weight: weigh again or confirm',
};

/**
 * Marks the order packed through the order service. Under the order's lock: every line checked, no open packing card,
 * the required photo (or the owner's override), the weight (a reading when the owner needs one; a big gap confirmed).
 * The reading is kept with the order's packing check; the timeline event carries what was checked.
 */
export async function markPacked(deps: ShippingDeps, who: Who, orderId: string, input: unknown = {}, opts: CommandOptions = {}): Promise<CommandResult> {
  await allow(deps, who, 'fulfilment.pack');
  const d = parse(packInput, input, 'packing');
  const cfg = await packSettings(deps, who.storeId);
  return orderStep(ordersDeps(deps), { storeId: who.storeId, orderId }, staffBy(who.actor, who.ctx), 'pack', {}, {
    ...opts,
    also: async (tx, o, now) => {
      const l = await load(tx, who.storeId, o.id);
      const v = viewOf(l, cfg, { weighedGrams: d.weighedGrams, weightConfirmed: d.weightConfirmed });
      if (v.blocked) {
        const data = v.blocked === 'NOT_CHECKED' ? { lines: v.lines.filter((x) => !x.done).map((x) => x.sku) } : v.blocked === 'PHOTO_REQUIRED' ? { photos: v.photo.count, needed: v.photo.needed } : v.blocked.startsWith('WEIGHT') ? { ...v.weight.gap } : { issues: v.openIssues.length };
        throw new ShippingError(v.blocked, BLOCK_WORDS[v.blocked], [], data);
      }
      if (d.weighedGrams !== undefined) {
        const fields = { weighedGrams: d.weighedGrams, expectedGrams: v.weight.expectedGrams, weighedById: who.actor.staffUserId, weighedAt: now, weightGapConfirmed: !!(v.weight.gap?.big && d.weightConfirmed) };
        await tx.packingCheck.upsert({ where: { storeId_orderId: { storeId: who.storeId, orderId: o.id } }, create: { storeId: who.storeId, orderId: o.id, ...fields }, update: fields });
      }
      return {
        packing: {
          pieces: v.lines.reduce((n, x) => n + x.quantity, 0),
          photos: v.photo.count,
          ...(v.photo.state === 'waived' ? { photoWaived: v.photo.waivedReason } : {}),
          ...(v.weight.gap ? { weight: v.weight.gap, weightConfirmed: !!(v.weight.gap.big && d.weightConfirmed) } : {}),
        },
      };
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Booking and the photo (SIM-F-010); the retention sweep
// ---------------------------------------------------------------------------------------------------------------------

/** booking.ts calls this under the order's lock: a required photo that is missing (and not waived) refuses the booking. */
export async function assertPackingPhoto(deps: Pick<ShippingDeps, 'settings'>, tx: Db, storeId: number, orderId: string): Promise<void> {
  const cfg = await setting(deps, storeId, 'fulfilment.packing.photo');
  if (!cfg.enabled || cfg.mode !== 'required') return;
  const [photos, check] = await Promise.all([
    tx.packingPhoto.count({ where: { storeId, orderId, archivedAt: null } }),
    tx.packingCheck.findUnique({ where: { storeId_orderId: { storeId, orderId } }, select: { photoWaivedReason: true } }),
  ]);
  if (photoState(cfg, photos, !!check?.photoWaivedReason) === 'missing') throw new ShippingError('PHOTO_REQUIRED', 'the packing photo is required before booking', [], { photos, needed: cfg.minPhotos });
}

/** The daily sweep: packing photos past the owner's days are archived (kept in the media library, never deleted). */
export async function expirePackingPhotos(deps: Pick<ShippingDeps, 'db' | 'now'>, storeId: number): Promise<{ archived: number }> {
  const r = await deps.db.packingPhoto.updateMany({ where: { storeId, archivedAt: null, keepUntil: { lt: nowOf(deps) } }, data: { archivedAt: nowOf(deps) } });
  return { archived: r.count };
}
