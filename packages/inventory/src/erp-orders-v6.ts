// PR 610 (CN-028; extends PR 199 and 200) — orders to the ERP in contract v6 (docs/erp/site-changes-v6.md §2.3, §2.4,
// §2.5.1; docs/RETAIL-ERP-MODEL.md §8). Everything here runs only while the store's `erp.model` is v6; in v5 the order
// document, its key and the relay are exactly as PR 199 and 200 built them.
//
// The order (`POST /orders`, `enqueueOrderPush` → `enqueueV6Order`):
// - one line per PIECE: every line has its own `lineId` (`<order number>-<n>`, never reused: a revision keeps the ids of
//   the pieces that stayed and gives new pieces the next numbers; a piece that left is REMOVED, kept in the history)
//   and `quantity` 1, so the pipeline stock keyed by (link, order, line) holds one piece per line (follow-up 491);
// - `customerPrice` in whole taka: the order's goods after the line and combo prices and the order's own discount
//   (offers, reward), split over the pieces with the remainder of each combo or line on its last piece (a combo of 3 at
//   1600 is 533, 533 and 534; `erpPieces`). The pieces add up to the order's goods in whole taka;
// - `deliveryCharge` and `advancePaid` (what the customer paid before the door: online and wallet) in whole taka, and
//   each line's `grade` (A, or the factory's own B-grade SKU);
// - the ERP's answer is kept: `erpTotal` (what Retail will owe, fixed now at the shop prices), `shopPrice` and
//   `fromReturnStock` on each line ("From ERP return stock" on the order page), and later `billedAt`.
// One ErpOrder row and one ErpOrderLine row per piece, in the order's own transaction (the outbox of PR 199).
//
// The refusals (§2.3, §8), each kept on ErpOrder (`refusal`, `refusalDetails`) and on the ErpPush row (HELD, `heldReason`):
// - `409 ACCOUNT_ON_HOLD`: the order is HELD (never lost) and the account's hold is noted (ErpAccountState): checkout
//   pauses by itself while `erp.hold.pauseCheckout` is on (`erpCheckoutPaused`), because the ERP keeps no stock for a
//   queued order. `account.released` (or the account check seeing the hold gone) sends every held order again;
// - `409 NO_SHOP_PRICE`: the order is HELD and its SKUs stop selling (`ProductVariant.shopPriceMissingAt`: the cart hold
//   refuses them in v6) until the ERP has a shop price; the order goes again once the price is there;
// - `409 INSUFFICIENT_STOCK` (`details.shortSkus`): nothing is saved at the ERP; the order is HELD and goes again when
//   the ERP's live stock covers it.
// The ERP keeps a 4xx answer against its Idempotency-Key, so every new try after a refusal goes with a NEW key: the
// row's key stays (one row per document, PR 200) and the wire key gets a round (`<key>:k<n>`, `wireKey`). A network
// retry of the same try keeps the same key, so the ERP never makes the order twice. At the latest every
// `erp.orders.refusedRetryMinutes` a held stock or price refusal is tried again anyway.
//
// The short line (§2.3): a piece filled from the ERP's Return stock that fails the owner's packing check comes as
// `order.line.short`; the line (and so the order) waits. The admin picks WAIT, REPLACE (another SKU) or CANCEL
// (`decideErpLine`, `PATCH /orders/{id}/lines/{lineId}`); `order.line.filled` ends a wait. A shipment behind a short line
// is HELD (`LINE_WAITING`) until the line is filled or decided.
//
// The order check (`checkErpOrders`, job `inventory.erp.checkOrders` every `erp.account.checkMinutes` per v6 store):
// `GET /account` (the hold and what Retail owes, ErpAccountState), the held orders woken when their reason is gone, and
// follow-up 490 — the catch-up of open orders from the ERP's own copy (`GET /orders/{id}`, the last
// `erp.orders.catchUpDays`): a lost `order.line.short` / `order.line.filled` webhook or a lost answer is caught up.
//
// For the other lanes (PR 612–617) — the rows this file writes keep the shape of migration 0049:
// - ErpOrder: one per (link, shop order); `externalOrderId` is the order number; `erpTotalMinor` (BigInt, minor units)
//   once the ERP answered; `billedAt` once the shipment billed it (PR 611);
// - ErpOrderLine: one per piece; `lineId` is what the ERP knows; `customerPriceMinor` (whole taka, in minor units),
//   `shopPriceMinor` (the buying price fixed on the order, minor units), `fromReturnStock`, `state` (OPEN, SHORT,
//   CANCELLED, REMOVED). `erpOrderOf` and `erpOrderLinesOf` read them for a shop order.
// Money: whole taka on the wire; minor units in the database. Nothing here moves money or changes a price.
import { erpOrderAnswerSchema, type ErpDocument, type ErpGrade, type ErpLineDecision, type ErpOrderLineV6, type ErpSalesOrderV6 } from '@extas/adapters';
import { requirePermission } from '@extas/auth';
import { Prisma } from '@extas/db/client';
import { z } from 'zod';
import { logChange, nowOf, parse, setting, TX, type Db, type InventoryDeps, type Tx, type Who } from './context';
import { InventoryError } from './errors';
import { openErpLink } from './erp-link';
import { isV6 } from './erp-model';
import { readErpSetup } from './erp-mode';
import { resolveErp } from './guard';
import { callErp, errorText, retryPolicy } from './sync';
import { canonical, enqueueErpDocument } from './erp-push';
import { decimalToMinor } from './webhook';

// ---- the pieces and their whole-taka prices (pure) ---------------------------------------------------------------------

/** One shop order line as the v6 order needs it. */
export interface ErpItemInput {
  orderItemId: string;
  sku: string;
  quantity: number;
  /** One piece's price before any discount, minor units. */
  unitPriceMinor: number;
  /** The line's price after its own discount and the combo split (OrderItem.lineTotalMinor), minor units. */
  lineTotalMinor: number;
  comboId?: string | null;
  /** The combo (set) the line belongs to in this order: its pieces share the combo's remainder. */
  comboGroupKey?: string | null;
  grade?: ErpGrade;
}

/** One piece of the order with its whole-taka customer price (kept in minor units, a multiple of the taka). */
export interface ErpPiece {
  orderItemId: string;
  /** Which piece of its line, 1 … quantity. */
  piece: number;
  sku: string;
  grade: ErpGrade;
  comboId: string | null;
  unitPriceMinor: number;
  customerPriceMinor: number;
}

/** Splits `total` minor units over `weights` in proportion, exactly (largest remainder; ties to the earlier one). */
function share(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0 || total === 0) return weights.map((_, i) => (i === weights.length - 1 ? total : 0));
  const exact = weights.map((w) => (w * total) / sum);
  const out = exact.map((x) => Math.floor(x));
  let left = total - out.reduce((s, x) => s + x, 0);
  const order = exact.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const o of order) {
    if (left <= 0) break;
    out[o.i]! += 1;
    left -= 1;
  }
  return out;
}

/**
 * Every piece of the order with its customer price in whole taka (site-changes-v6 §2.5.1): the goods after the line and
 * combo prices, less the order's own discount (spread over the lines by their value), split per combo (or per loose
 * line) and per piece. Each group's whole taka come from the running total (so the order adds up to its goods rounded to
 * the taka); inside a group each piece gets the whole taka of its running share and the LAST piece takes the remainder
 * (1600 over 3 pieces: 533, 533, 534). Pure: the same order always gives the same pieces.
 */
export function erpPieces(items: readonly ErpItemInput[], orderDiscountMinor: number, fractionDigits: number): ErpPiece[] {
  const unit = 10 ** fractionDigits;
  const totals = items.map((i) => Math.max(0, i.lineTotalMinor));
  const goods = totals.reduce((s, x) => s + x, 0);
  const discount = Math.min(Math.max(0, orderDiscountMinor), goods);
  const off = share(discount, totals);
  const nets = totals.map((t, k) => t - off[k]!);

  // The groups in the order they first appear: a combo's lines together, every loose line on its own.
  const groups: { key: string; items: number[] }[] = [];
  const byKey = new Map<string, { key: string; items: number[] }>();
  items.forEach((it, k) => {
    const key = it.comboGroupKey ? `c:${it.comboGroupKey}` : `i:${k}`;
    let g = byKey.get(key);
    if (!g) {
      g = { key, items: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.items.push(k);
  });

  const totalTaka = Math.round((goods - discount) / unit);
  const out: ErpPiece[] = [];
  let running = 0;
  let before = 0;
  groups.forEach((g, gi) => {
    const groupNet = g.items.reduce((s, k) => s + nets[k]!, 0);
    running += groupNet;
    const upTo = gi === groups.length - 1 ? totalTaka : Math.floor(running / unit);
    const groupTaka = upTo - before;
    before = upTo;
    // The pieces of the group, each with its exact share (a line's remainder on its last piece).
    const pieces: { k: number; piece: number; exact: number }[] = [];
    for (const k of g.items) {
      const q = Math.max(1, items[k]!.quantity);
      const each = Math.floor(nets[k]! / q);
      for (let p = 1; p <= q; p++) pieces.push({ k, piece: p, exact: p === q ? nets[k]! - each * (q - 1) : each });
    }
    let cum = 0;
    let given = 0;
    pieces.forEach((p, pi) => {
      cum += p.exact;
      const taka = pi === pieces.length - 1 ? groupTaka - given : Math.floor(cum / unit) - given;
      given += taka;
      const it = items[p.k]!;
      out.push({ orderItemId: it.orderItemId, piece: p.piece, sku: it.sku, grade: it.grade ?? 'A', comboId: it.comboId ?? null, unitPriceMinor: it.unitPriceMinor, customerPriceMinor: taka * unit });
    });
  });
  return out;
}

/** Minor units → whole taka on the wire. */
export const wholeTaka = (minor: number, fractionDigits: number): number => Math.round(minor / 10 ** fractionDigits);

// ---- the order document and its rows --------------------------------------------------------------------------------

export interface V6OrderInput {
  storeId: number;
  orderId: string;
  externalOrderId: string;
  customerName: string;
  customerPhone: string;
  shippingAddress: string;
  paymentMethod: string;
  note: string | null;
  items: ErpItemInput[];
  orderDiscountMinor: number;
  deliveryChargeMinor: number;
  advancePaidMinor: number;
}

/** The number n of a line id `<order number>-<n>` (null for a line id of another shape). */
const LINE_NO = (ext: string, lineId: string): number | null => {
  if (!lineId.startsWith(`${ext}-`)) return null;
  const rest = lineId.slice(ext.length + 1);
  return /^\d+$/.test(rest) ? Number(rest) : null;
};

/** The store's open ERP link for its orders (made on first use; the store's own connection when one is set). */
export async function orderLinkOf(deps: InventoryDeps, storeId: number): Promise<{ id: string } | null> {
  const setup = await readErpSetup(deps.db, deps.settings, storeId);
  if (setup.mode === 'NONE') return null;
  return openErpLink(deps.db, storeId, setup.integrationId ?? null);
}

/** The grades of these SKUs in the store (the factory's B-grade lines are their own SKUs, PR 609). */
async function gradesOf(db: Db, storeId: number, skus: string[]): Promise<Map<string, ErpGrade>> {
  const rows = await db.productVariant.findMany({ where: { storeId, sku: { in: [...new Set(skus)] } }, select: { sku: true, grade: true } });
  return new Map(rows.map((r) => [r.sku, r.grade]));
}

/**
 * Writes the order's ErpOrder and one ErpOrderLine per piece (in `db`, the order's own transaction) and gives the v6
 * document. Lines keep their ids across revisions; a piece that left the order is REMOVED, a line the admin cancelled
 * at the ERP stays CANCELLED and is not sent again.
 */
export async function v6OrderDocument(db: Db, linkId: string, d: V6OrderInput, fractionDigits: number): Promise<ErpDocument> {
  const missing = d.items.filter((i) => !i.orderItemId).length;
  if (missing) throw new InventoryError('INVALID_INPUT', 'a v6 order needs each line`s order item', ['items.orderItemId']);
  const grades = await gradesOf(db, d.storeId, d.items.map((i) => i.sku));
  const pieces = erpPieces(d.items.map((i) => ({ ...i, grade: i.grade ?? grades.get(i.sku) ?? 'A' })), d.orderDiscountMinor, fractionDigits);
  const order = await db.erpOrder.upsert({
    where: { linkId_orderId: { linkId, orderId: d.orderId } },
    create: { storeId: d.storeId, linkId, orderId: d.orderId, externalOrderId: d.externalOrderId },
    update: {},
    select: { id: true },
  });
  const existing = await db.erpOrderLine.findMany({ where: { erpOrderId: order.id }, orderBy: { createdAt: 'asc' } });
  const byPiece = new Map(existing.map((l) => [`${l.orderItemId}:${l.piece}`, l]));
  let next = existing.reduce((m, l) => Math.max(m, LINE_NO(d.externalOrderId, l.lineId) ?? 0), 0) + 1;
  const keep = new Set<string>();
  const lines: { lineId: string; piece: ErpPiece; state: string }[] = [];
  for (const p of pieces) {
    const key = `${p.orderItemId}:${p.piece}`;
    const prior = byPiece.get(key);
    const fields = { sku: p.sku, grade: p.grade, customerPriceMinor: p.customerPriceMinor, comboId: p.comboId };
    if (prior) {
      keep.add(prior.id);
      const state = prior.state === 'REMOVED' ? 'OPEN' : prior.state;
      const changed = prior.sku !== p.sku || prior.grade !== p.grade || prior.customerPriceMinor !== p.customerPriceMinor || prior.comboId !== p.comboId || state !== prior.state;
      if (changed) await db.erpOrderLine.update({ where: { id: prior.id }, data: { ...fields, state } });
      lines.push({ lineId: prior.lineId, piece: p, state });
    } else {
      const lineId = `${d.externalOrderId}-${next++}`;
      await db.erpOrderLine.create({ data: { storeId: d.storeId, erpOrderId: order.id, orderItemId: p.orderItemId, piece: p.piece, lineId, ...fields } });
      lines.push({ lineId, piece: p, state: 'OPEN' });
    }
  }
  const gone = existing.filter((l) => !keep.has(l.id) && l.state !== 'REMOVED' && l.state !== 'CANCELLED').map((l) => l.id);
  if (gone.length) await db.erpOrderLine.updateMany({ where: { id: { in: gone } }, data: { state: 'REMOVED' } });

  const dec = (minor: number) => {
    const neg = minor < 0;
    const s = String(Math.abs(minor)).padStart(fractionDigits + 1, '0');
    return fractionDigits ? `${neg ? '-' : ''}${s.slice(0, -fractionDigits)}.${s.slice(-fractionDigits)}` : `${neg ? '-' : ''}${s}`;
  };
  const items: ErpOrderLineV6[] = lines
    .filter((l) => l.state !== 'CANCELLED')
    .map((l) => ({
      lineId: l.lineId,
      sku: l.piece.sku,
      quantity: 1,
      grade: l.piece.grade,
      unitPrice: dec(l.piece.unitPriceMinor),
      discount: dec(Math.max(0, l.piece.unitPriceMinor - l.piece.customerPriceMinor)),
      customerPrice: wholeTaka(l.piece.customerPriceMinor, fractionDigits),
      comboId: l.piece.comboId,
    }));
  const body: ErpSalesOrderV6 = {
    channel: 'WEBSITE',
    status: 'CONFIRMED',
    externalOrderId: d.externalOrderId,
    customerName: d.customerName,
    customerPhone: d.customerPhone,
    shippingAddress: d.shippingAddress,
    paymentMethod: d.paymentMethod,
    note: d.note,
    items,
    deliveryCharge: wholeTaka(Math.max(0, d.deliveryChargeMinor), fractionDigits),
    advancePaid: wholeTaka(Math.max(0, d.advancePaidMinor), fractionDigits),
  };
  return { type: 'order.create', body };
}

/** Is this an order document of contract v6 (lines with their own ids)? */
export function isV6OrderDoc(doc: ErpDocument): boolean {
  return doc.type === 'order.create' && Array.isArray(doc.body.items) && doc.body.items.some((i) => typeof (i as { lineId?: unknown }).lineId === 'string');
}

// ---- reading the rows (for the order page and the other lanes) ------------------------------------------------------

/** The shop order's ERP order on the store's link (the newest, if a handover started a new link). */
export async function erpOrderOf(db: Db, ref: { storeId: number; orderId: string }) {
  return db.erpOrder.findFirst({ where: { storeId: ref.storeId, orderId: ref.orderId }, orderBy: { createdAt: 'desc' } });
}

/** Its pieces, in line order. */
export async function erpOrderLinesOf(db: Db, erpOrderId: string) {
  const rows = await db.erpOrderLine.findMany({ where: { erpOrderId } });
  const n = (id: string) => Number(/-(\d+)$/.exec(id)?.[1] ?? 0);
  return rows.sort((a, b) => n(a.lineId) - n(b.lineId) || a.lineId.localeCompare(b.lineId));
}

// ---- the relay's v6 steps (erp-push.ts calls these) ------------------------------------------------------------------

/** Why a HELD document waits. */
export const HELD_REASONS = ['ACCOUNT_ON_HOLD', 'INSUFFICIENT_STOCK', 'NO_SHOP_PRICE', 'LINE_WAITING'] as const;
export type HeldReason = (typeof HELD_REASONS)[number];

/** The key the ERP gets for this try: the row's own key, with the round after a refusal the ERP keeps against it. */
export const wireKey = (row: { idempotencyKey: string; keyRound: number }): string => (row.keyRound > 0 ? `${row.idempotencyKey}:k${row.keyRound}` : row.idempotencyKey);

export type PushRow = Prisma.ErpPushGetPayload<true>;
const bodyOf = (row: PushRow): Record<string, unknown> => {
  const doc = row.requestBody as { body?: unknown } | null;
  return doc && typeof doc.body === 'object' && doc.body ? (doc.body as Record<string, unknown>) : {};
};
const extOf = (row: PushRow): string | null => {
  const doc = row.requestBody as { body?: { externalOrderId?: unknown }; externalOrderId?: unknown } | null;
  const v = doc?.externalOrderId ?? doc?.body?.externalOrderId;
  return typeof v === 'string' ? v : null;
};
export const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const LINE_STATE: Record<string, 'OPEN' | 'SHORT' | 'CANCELLED'> = { ACTIVE: 'OPEN', OPEN: 'OPEN', FILLED: 'OPEN', SHORT: 'SHORT', WAITING: 'SHORT', CANCELLED: 'CANCELLED' };

export async function erpOrderForRow(db: Db, row: PushRow) {
  const ext = extOf(row);
  if (!ext) return null;
  return db.erpOrder.findFirst({ where: { storeId: row.storeId, externalOrderId: ext }, orderBy: { createdAt: 'desc' } });
}

export async function digitsOf(db: Db, storeId: number): Promise<number> {
  const s = await db.store.findUnique({ where: { id: storeId }, select: { currency: true } });
  return new Intl.NumberFormat('en', { style: 'currency', currency: s?.currency ?? 'BDT' }).resolvedOptions().maximumFractionDigits ?? 0;
}

const big = (v: number | null) => (v == null ? null : BigInt(v));

/** The ERP's order answer applied to ErpOrder and its lines (POST /orders, PATCH …/lines, GET /orders/{id}). */
export async function applyOrderAnswer(db: Db, erpOrderId: string, answer: unknown, now: Date, opts: { accepted?: boolean } = {}): Promise<{ lines: number }> {
  const a = erpOrderAnswerSchema.safeParse(answer);
  if (!a.success) throw new InventoryError('INVALID_INPUT', 'the ERP order answer is not what the contract says', a.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).slice(0, 5));
  const order = await db.erpOrder.findUniqueOrThrow({ where: { id: erpOrderId }, select: { id: true, storeId: true, billedAt: true } });
  const digits = await digitsOf(db, order.storeId);
  const total = decimalToMinor(a.data.erpTotal, digits);
  await db.erpOrder.update({
    where: { id: order.id },
    data: {
      ...(a.data.erpOrderId ? { erpOrderId: a.data.erpOrderId } : {}),
      ...(total != null && !a.data.exchangeId ? { erpTotalMinor: big(total) } : {}),
      ...(opts.accepted ? { acceptedAt: now, refusal: null, refusalDetails: Prisma.DbNull, refusedAt: null } : {}),
      ...(a.data.billedAt && !order.billedAt ? { billedAt: a.data.billedAt } : {}),
    },
  });
  let n = 0;
  const lines = await db.erpOrderLine.findMany({ where: { erpOrderId: order.id } });
  for (const l of a.data.lines) {
    const mine = lines.find((x) => x.lineId === l.lineId);
    if (!mine) continue;
    const shop = decimalToMinor(l.shopPrice, digits);
    const state = l.state ? LINE_STATE[l.state] : undefined;
    const data: Prisma.ErpOrderLineUpdateInput = {};
    if (shop != null && shop !== mine.shopPriceMinor) data.shopPriceMinor = shop;
    if (l.fromReturnStock !== mine.fromReturnStock) data.fromReturnStock = l.fromReturnStock;
    if (l.sku !== mine.sku) data.sku = l.sku;
    if (l.grade !== mine.grade) data.grade = l.grade;
    if (state && mine.state !== 'REMOVED' && state !== mine.state) {
      data.state = state;
      if (state === 'SHORT' && !mine.shortAt) data.shortAt = now;
      if (state === 'OPEN' && mine.state === 'SHORT') data.filledAt = now;
    }
    if (Object.keys(data).length) {
      await db.erpOrderLine.update({ where: { id: mine.id }, data });
      n++;
    }
  }
  return { lines: n };
}

/**
 * After the ERP took a v6 document: its answer is kept where the books and the order page read it. A broken answer
 * never undoes the send (the ERP has the document); it is noted on the row for the health panel.
 */
export async function afterV6OrderSent(deps: InventoryDeps, row: PushRow, answer: unknown): Promise<void> {
  const db = deps.db;
  const now = nowOf(deps);
  try {
    if (row.documentType === 'order.create') {
      const doc = row.requestBody as unknown as ErpDocument;
      if (!isV6OrderDoc(doc)) return;
      const eo = await erpOrderForRow(db, row);
      if (!eo) return;
      await applyOrderAnswer(db, eo.id, answer, now, { accepted: true });
      // The ERP has a shop price for every SKU it took: they sell again.
      const skus = (Array.isArray(bodyOf(row).items) ? (bodyOf(row).items as { sku?: unknown }[]) : []).map((i) => i.sku).filter((s): s is string => typeof s === 'string');
      if (skus.length) await db.productVariant.updateMany({ where: { storeId: row.storeId, sku: { in: skus }, shopPriceMissingAt: { not: null } }, data: { shopPriceMissingAt: null } });
      return;
    }
    if (row.documentType === 'order.line') {
      const eo = await erpOrderForRow(db, row);
      if (!eo) return;
      await applyOrderAnswer(db, eo.id, answer, now);
      // A replaced or cancelled line no longer holds the order back: its shipment goes again.
      await wakeLineWaiting(db, row.storeId, eo.id);
      return;
    }
  } catch (e) {
    await db.erpPush.update({ where: { id: row.id }, data: { lastError: `ANSWER_UNREAD: ${errorText(e)}`.slice(0, 500) } });
  }
}

/** The ERP refusal codes that mean "not now": the document waits HELD and goes again by itself. */
const HOLD_ON: Readonly<Record<string, readonly HeldReason[]>> = {
  'order.create': ['ACCOUNT_ON_HOLD', 'INSUFFICIENT_STOCK', 'NO_SHOP_PRICE'],
  'shipment.create': ['LINE_WAITING'],
};

/**
 * A 409 the ERP gave a v6 document: HELD (with its reason) when it means "not now", with what the refusal tells the
 * shop noted (the account's hold, the SKUs without a shop price, the short SKUs). Null when the refusal is not one of
 * these (the relay then fails the row as before).
 */
export async function holdV6Refusal(deps: InventoryDeps, row: PushRow, err: { code: string; status: number | null; erpCode: string | null; detailsBody: unknown }, text: string): Promise<HeldReason | null> {
  if (err.code !== 'CONFLICT' || !err.erpCode) return null;
  const reasons = HOLD_ON[row.documentType] ?? [];
  const reason = reasons.find((r) => r === err.erpCode);
  if (!reason) return null;
  if (row.documentType === 'order.create' && !isV6OrderDoc(row.requestBody as unknown as ErpDocument)) return null;
  if (!(await isV6(deps, row.storeId))) return null;
  const db = deps.db;
  const now = nowOf(deps);
  const details = isObj(err.detailsBody) ? err.detailsBody : {};
  await db.$transaction(async (tx) => {
    await tx.erpPush.update({ where: { id: row.id }, data: { status: 'HELD', heldReason: reason, responseStatus: err.status, lastError: text, nextAttemptAt: null } });
    const eo = await erpOrderForRow(tx, row);
    if (eo && row.documentType === 'order.create') {
      await tx.erpOrder.update({ where: { id: eo.id }, data: { refusal: reason, refusalDetails: details as Prisma.InputJsonValue, refusedAt: now } });
    }
    if (reason === 'ACCOUNT_ON_HOLD') {
      const linkId = eo?.linkId ?? (await orderLinkOf(deps, row.storeId))?.id;
      if (linkId) await noteHold(tx, row.storeId, linkId, { onHold: true, reason: typeof details.reason === 'string' ? details.reason : null, holdsOn: typeof details.holdsOn === 'string' ? details.holdsOn : null }, now);
    }
    if (reason === 'NO_SHOP_PRICE') {
      const skus = Array.isArray(details.skus) ? details.skus.filter((s): s is string => typeof s === 'string') : [];
      if (skus.length) await tx.productVariant.updateMany({ where: { storeId: row.storeId, sku: { in: skus }, shopPriceMissingAt: null }, data: { shopPriceMissingAt: now } });
    }
  }, TX);
  return reason;
}

/**
 * Before a v6 order goes out (again, after a hold): an order cancelled in the shop that the ERP never had is never
 * sent (nothing to bill, nothing to cancel there). Its row is FAILED with ORDER_CANCELLED_BEFORE_SENT, kept.
 */
export const CANCELLED_BEFORE_SENT = 'ORDER_CANCELLED_BEFORE_SENT';
export async function cancelledBeforeSent(deps: InventoryDeps, row: PushRow): Promise<boolean> {
  if (row.documentType !== 'order.create' || !isV6OrderDoc(row.requestBody as unknown as ErpDocument)) return false;
  const o = await deps.db.order.findFirst({ where: { id: row.referenceId, storeId: row.storeId }, select: { status: true } });
  if (o?.status !== 'CANCELLED') return false;
  const n = await deps.db.erpPush.updateMany({ where: { id: row.id, status: { in: ['PENDING', 'HELD'] } }, data: { status: 'FAILED', lastError: CANCELLED_BEFORE_SENT, nextAttemptAt: null } });
  return n.count > 0;
}

/**
 * qa-gate (PR 610): an order revision that a newer revision of the same order replaced is never sent, so a HELD or
 * waiting old revision can never go out after the new one and roll the ERP's order back to the old lines. It is kept
 * (never deleted): FAILED with SUPERSEDED_BY_REVISION, its `heldReason` left as it was for the history.
 */
export const SUPERSEDED_BY_REVISION = 'SUPERSEDED_BY_REVISION';
/** The revision in an order key (`order:<id>:create` is 0, `…:create:r<n>` is n). */
export function revisionOfKey(key: string): number {
  const m = /:create(?::r(\d+))?$/.exec(key);
  return m?.[1] ? Number(m[1]) : 0;
}
type KeyRow = { id: string; documentType: string; referenceId: string; idempotencyKey: string };
/** The ids among these rows that are an order revision with a newer revision of the same order queued. */
export async function supersededIds(db: Db, storeId: number, rows: readonly KeyRow[]): Promise<Set<string>> {
  const orders = rows.filter((r) => r.documentType === 'order.create');
  if (!orders.length) return new Set();
  const all = await db.erpPush.findMany({ where: { storeId, documentType: 'order.create', referenceId: { in: [...new Set(orders.map((r) => r.referenceId))] } }, select: { referenceId: true, idempotencyKey: true } });
  const latest = new Map<string, number>();
  for (const r of all) latest.set(r.referenceId, Math.max(latest.get(r.referenceId) ?? 0, revisionOfKey(r.idempotencyKey)));
  return new Set(orders.filter((r) => revisionOfKey(r.idempotencyKey) < (latest.get(r.referenceId) ?? 0)).map((r) => r.id));
}
/** Marks these HELD or waiting rows superseded (a row already sent or failed is left as it is). */
export async function markSuperseded(db: Db, ids: Iterable<string>): Promise<number> {
  const list = [...ids];
  if (!list.length) return 0;
  return (await db.erpPush.updateMany({ where: { id: { in: list }, status: { in: ['PENDING', 'HELD'] } }, data: { status: 'FAILED', lastError: SUPERSEDED_BY_REVISION, nextAttemptAt: null } })).count;
}
/** When revision n of an order is queued: every older revision still HELD or waiting is superseded. */
export async function supersedeOlderRevisions(db: Db, storeId: number, orderId: string, key: string): Promise<number> {
  const n = revisionOfKey(key);
  if (!n) return 0;
  const older = await db.erpPush.findMany({ where: { storeId, documentType: 'order.create', referenceId: orderId, status: { in: ['PENDING', 'HELD'] } }, select: { id: true, idempotencyKey: true } });
  return markSuperseded(db, older.filter((r) => revisionOfKey(r.idempotencyKey) < n).map((r) => r.id));
}

// ---- the account and its hold ----------------------------------------------------------------------------------------

const dateOnly = (v: string | null | undefined): Date | null => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? new Date(`${v.slice(0, 10)}T00:00:00Z`) : null);

/** Writes what the ERP last said about the account (one row per link). */
export async function noteHold(db: Db, storeId: number, linkId: string, h: { onHold: boolean; reason?: string | null; holdsOn?: string | null; warnFromDays?: number | null; lastPaymentAt?: string | null; daysSinceLastPayment?: number | null; balanceMinor?: number | null; waitingCheckMinor?: number | null; exchangesAtRiskMinor?: number | null; checked?: boolean }, now: Date): Promise<{ wasOnHold: boolean }> {
  const prior = await db.erpAccountState.findUnique({ where: { linkId }, select: { onHold: true } });
  const fields = {
    onHold: h.onHold,
    ...(h.reason !== undefined ? { reason: h.reason } : {}),
    ...(h.holdsOn !== undefined ? { holdsOn: dateOnly(h.holdsOn) } : {}),
    ...(h.warnFromDays !== undefined ? { warnFromDays: h.warnFromDays } : {}),
    ...(h.lastPaymentAt !== undefined ? { lastPaymentAt: dateOnly(h.lastPaymentAt) } : {}),
    ...(h.daysSinceLastPayment !== undefined ? { daysSinceLastPayment: h.daysSinceLastPayment } : {}),
    ...(h.balanceMinor !== undefined ? { balanceMinor: big(h.balanceMinor) } : {}),
    ...(h.waitingCheckMinor !== undefined ? { waitingCheckMinor: big(h.waitingCheckMinor) } : {}),
    ...(h.exchangesAtRiskMinor !== undefined ? { exchangesAtRiskMinor: big(h.exchangesAtRiskMinor) } : {}),
    ...(h.onHold && !prior?.onHold ? { heldAt: now } : {}),
    ...(!h.onHold && prior?.onHold ? { releasedAt: now } : {}),
    ...(h.checked ? { checkedAt: now } : {}),
  };
  await db.erpAccountState.upsert({ where: { linkId }, create: { storeId, linkId, ...fields }, update: fields });
  return { wasOnHold: !!prior?.onHold };
}

/** HELD documents of the store sent again (a new key round), for one reason or by id. */
export async function wakeHeld(db: Db, storeId: number, where: { reason?: HeldReason; ids?: string[] }): Promise<number> {
  const rows = await db.erpPush.findMany({
    where: { storeId, status: 'HELD', ...(where.reason ? { heldReason: where.reason } : {}), ...(where.ids ? { id: { in: where.ids } } : {}) },
    select: { id: true, documentType: true, referenceId: true, idempotencyKey: true },
  });
  if (!rows.length) return 0;
  // qa-gate: an old revision of an order that staff changed since never goes again (it would roll the ERP order back).
  const old = await supersededIds(db, storeId, rows);
  await markSuperseded(db, old);
  const ids = rows.filter((r) => !old.has(r.id)).map((r) => r.id);
  if (!ids.length) return 0;
  const r = await db.erpPush.updateMany({ where: { id: { in: ids }, status: 'HELD' }, data: { status: 'PENDING', heldReason: null, attempts: 0, keyRound: { increment: 1 }, nextAttemptAt: null } });
  return r.count;
}

/**
 * Does checkout pause for this store now? Only in v6, only while `erp.hold.pauseCheckout` is on, and only while the
 * ERP said the account is on hold (409 ACCOUNT_ON_HOLD, `account.hold`, or `GET /account`) and has not released it.
 */
export async function erpCheckoutPaused(deps: Pick<InventoryDeps, 'db' | 'settings'>, storeId: number): Promise<{ paused: boolean; reason: string | null; since: Date | null }> {
  const none = { paused: false, reason: null, since: null };
  if (!(await isV6(deps, storeId))) return none;
  if (!(await deps.settings.value('erp.hold.pauseCheckout', { storeId }))) return none;
  const link = await deps.db.erpStoreLink.findFirst({ where: { storeId, endedAt: null }, orderBy: { epoch: 'desc' }, select: { id: true } });
  if (!link) return none;
  const s = await deps.db.erpAccountState.findUnique({ where: { linkId: link.id }, select: { onHold: true, reason: true, heldAt: true } });
  return s?.onHold ? { paused: true, reason: s.reason, since: s.heldAt } : none;
}

/** The hold warning for the admin (§8): on hold now, or the day the ERP will hold new orders unless a payment comes. */
export interface ErpHoldNotice {
  onHold: boolean;
  reason: string | null;
  /** YYYY-MM-DD */
  holdsOn: string | null;
  daysLeft: number | null;
  /** From `warnFromDays` (the ERP's) or `erp.hold.warnDays`: the warning shows. */
  warn: boolean;
  checkoutPaused: boolean;
}

export async function erpHoldNotice(deps: Pick<InventoryDeps, 'db' | 'settings' | 'now'>, storeId: number): Promise<ErpHoldNotice | null> {
  if (!(await isV6(deps, storeId))) return null;
  const link = await deps.db.erpStoreLink.findFirst({ where: { storeId, endedAt: null }, orderBy: { epoch: 'desc' }, select: { id: true } });
  const s = link ? await deps.db.erpAccountState.findUnique({ where: { linkId: link.id } }) : null;
  if (!s) return null;
  const now = deps.now?.() ?? new Date();
  const holdsOn = s.holdsOn ? s.holdsOn.toISOString().slice(0, 10) : null;
  const daysLeft = s.holdsOn ? Math.ceil((s.holdsOn.getTime() - now.getTime()) / 86_400_000) : null;
  // The ERP's own warning window wins; the shop's setting is the fallback (registry v62).
  const from = s.warnFromDays ?? (await deps.settings.value('erp.hold.warnDays', { storeId }));
  // Counted in days since the last payment (owner answer Q3); with no payment yet, in days left before the hold.
  const window = s.daysSinceLastPayment != null ? s.daysSinceLastPayment >= from : daysLeft != null && daysLeft <= from;
  const pause = await deps.settings.value('erp.hold.pauseCheckout', { storeId });
  return { onHold: s.onHold, reason: s.reason, holdsOn, daysLeft, warn: s.onHold || (!!holdsOn && window), checkoutPaused: s.onHold && pause };
}

// ---- the short line: the admin's decision (§2.3) ----------------------------------------------------------------------

export const lineDecisionInput = z
  .object({
    orderId: z.uuid(),
    lineId: z.string().trim().min(1).max(80),
    action: z.enum(['WAIT', 'REPLACE', 'CANCEL']),
    sku: z.string().trim().min(1).max(64).optional(),
    grade: z.enum(['A', 'B']).optional(),
    reason: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .refine((v) => v.action !== 'REPLACE' || !!v.sku, { message: 'REPLACE names the SKU', path: ['sku'] })
  .refine((v) => v.action !== 'CANCEL' || !!v.reason, { message: 'CANCEL needs a short reason', path: ['reason'] });
export type LineDecisionInput = z.input<typeof lineDecisionInput>;

/**
 * The admin decides a short line (`orders.lines`): WAIT (the ERP fills it when the SKU is back), REPLACE (another SKU,
 * checked for stock and priced at its shop price today) or CANCEL (dropped, never billed; kept in the history). The
 * decision goes to the ERP as `PATCH /orders/{id}/lines/{lineId}`; the line's decision is kept and audited.
 */
export async function decideErpLine(deps: InventoryDeps, who: Who, input: LineDecisionInput): Promise<{ pushId: string; created: boolean; status: string }> {
  await requirePermission(deps.db, who.actor, 'orders.lines', { storeId: who.storeId });
  const d = parse(lineDecisionInput, input, 'line decision');
  if (!(await isV6(deps, who.storeId))) throw new InventoryError('CONFLICT', 'line decisions are for ERP contract v6', ['erp.model']);
  const eo = await erpOrderOf(deps.db, { storeId: who.storeId, orderId: d.orderId });
  if (!eo) throw new InventoryError('NOT_FOUND', 'this order is not at the ERP', ['orderId']);
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const line = await tx.erpOrderLine.findFirst({ where: { erpOrderId: eo.id, lineId: d.lineId } });
    if (!line) throw new InventoryError('NOT_FOUND', 'no such line on this order', ['lineId']);
    if (line.state !== 'SHORT') throw new InventoryError('CONFLICT', 'only a short line waits for a decision', ['lineId', `state:${line.state}`]);
    const decision: ErpLineDecision = d.action === 'WAIT' ? { action: 'WAIT' } : d.action === 'REPLACE' ? { action: 'REPLACE', sku: d.sku!, grade: d.grade ?? 'A' } : { action: 'CANCEL', reason: d.reason! };
    // A second press of the same decision while the first has not gone yet is the first one.
    const prior = await tx.erpPush.findFirst({ where: { storeId: who.storeId, documentType: 'order.line', idempotencyKey: { startsWith: `line:${line.id}:` } }, orderBy: { createdAt: 'desc' } });
    if (prior && (prior.status === 'PENDING' || prior.status === 'HELD') && canonical((prior.requestBody as { body?: unknown } | null)?.body) === canonical(decision)) return { pushId: prior.id, created: false, status: prior.status };
    const round = (await tx.erpPush.count({ where: { storeId: who.storeId, documentType: 'order.line', idempotencyKey: { startsWith: `line:${line.id}:` } } })) + 1;
    const r = await enqueueErpDocument(deps, who.storeId, eo.orderId, `line:${line.id}:${round}`, { type: 'order.line', externalOrderId: eo.externalOrderId, lineId: line.lineId, body: decision }, tx);
    await tx.erpOrderLine.update({
      where: { id: line.id },
      data: { decision: d.action, decisionSku: d.action === 'REPLACE' ? d.sku! : null, decidedAt: now, decidedById: who.actor.staffUserId },
    });
    await tx.orderEvent.create({ data: { storeId: who.storeId, orderId: eo.orderId, type: 'erp.line.decided', actorType: who.actor.staffUserId ? 'STAFF' : 'SYSTEM', actorId: who.actor.staffUserId, source: 'admin', reasonCode: d.action, message: d.reason ?? null, data: { lineId: line.lineId, action: d.action, ...(d.sku ? { sku: d.sku } : {}) } } });
    await logChange(tx, who, { action: 'erp.line.decide', entityType: 'ErpOrderLine', entityId: line.id, before: { state: line.state, decision: line.decision }, after: { action: d.action, sku: d.sku ?? null, reason: d.reason ?? null, pushId: r.pushId }, storeId: who.storeId });
    return { pushId: r.pushId, created: r.created, status: r.status };
  }, TX);
}

// ---- the order check: the account, the held orders, the catch-up (job `inventory.erp.checkOrders`) --------------------

export interface OrderCheckResult {
  status: 'ok' | 'skipped' | 'failed';
  reason: string | null;
  onHold: boolean | null;
  woken: number;
  /** Open orders read from the ERP's own copy, and how many of their lines that changed (follow-up 490). */
  caughtUp: number;
  linesFixed: number;
  /** SKUs stopped for NO_SHOP_PRICE that sell again because no order waits on them any more (qa-gate). */
  skusFreed: number;
  error?: string;
}

export async function checkErpOrders(deps: InventoryDeps, job: { storeId: number }): Promise<OrderCheckResult> {
  const { storeId } = job;
  const out: OrderCheckResult = { status: 'ok', reason: null, onHold: null, woken: 0, caughtUp: 0, linesFixed: 0, skusFreed: 0 };
  if (!(await isV6(deps, storeId))) return { ...out, status: 'skipped', reason: 'ERP_MODEL_V5' };
  const link = await resolveErp(deps, storeId);
  if (link.state !== 'connected' || !link.api.v6) return { ...out, status: 'skipped', reason: link.state === 'connected' ? 'NO_V6_READS' : `ERP_${link.state.toUpperCase()}` };
  const reads = link.api.v6;
  const db = deps.db;
  const erpLink = await openErpLink(db, storeId, link.integrationId);
  const policy = await retryPolicy(deps);
  const now = nowOf(deps);
  const digits = await digitsOf(db, storeId);
  try {
    // 1. The account and its hold.
    const acc = (await callErp(deps, policy, (o) => reads.account({}, o))).value;
    out.onHold = acc.hold.onHold;
    await noteHold(
      db,
      storeId,
      erpLink.id,
      {
        onHold: acc.hold.onHold,
        reason: acc.hold.reason,
        holdsOn: acc.hold.holdsOn,
        warnFromDays: acc.hold.warnFromDays,
        lastPaymentAt: acc.hold.lastPaymentAt,
        daysSinceLastPayment: acc.hold.daysSinceLastPayment,
        balanceMinor: decimalToMinor(acc.balance, digits),
        waitingCheckMinor: decimalToMinor(acc.waitingCheck, digits),
        exchangesAtRiskMinor: decimalToMinor(acc.exchangesAtRisk, digits),
        checked: true,
      },
      now,
    );
    if (!acc.hold.onHold) out.woken += await wakeHeld(db, storeId, { reason: 'ACCOUNT_ON_HOLD' });

    // 2. Orders held for stock or a shop price: woken when the reason is gone, or at the latest after the wait.
    const retryMin = await setting(deps, storeId, 'erp.orders.refusedRetryMinutes');
    const held = await db.erpPush.findMany({ where: { storeId, status: 'HELD', heldReason: { in: ['INSUFFICIENT_STOCK', 'NO_SHOP_PRICE'] } }, orderBy: { createdAt: 'asc' }, take: 200 });
    // qa-gate: an old revision (staff changed the order since) is superseded, never woken; an order the shop cancelled
    // before the ERP had it is never sent (kept FAILED).
    const old = await supersededIds(db, storeId, held);
    await markSuperseded(db, old);
    const wake: string[] = [];
    for (const row of held) {
      if (old.has(row.id) || (await cancelledBeforeSent(deps, row))) continue;
      const eo = await erpOrderForRow(db, row);
      // The refusal's own time (the shop's clock); the row's update time when the order has none.
      const since = eo?.refusedAt ?? row.updatedAt;
      if (since.getTime() <= now.getTime() - retryMin * 60_000) {
        wake.push(row.id);
        continue;
      }
      const details: Record<string, unknown> = isObj(eo?.refusalDetails) ? (eo.refusalDetails as Record<string, unknown>) : {};
      if (row.heldReason === 'NO_SHOP_PRICE') {
        const skus = Array.isArray(details.skus) ? details.skus.filter((s): s is string => typeof s === 'string') : [];
        const still = skus.length ? await db.productVariant.count({ where: { storeId, sku: { in: skus }, shopPriceMissingAt: { not: null } } }) : 1;
        if (!still) wake.push(row.id);
      } else {
        const short = Array.isArray(details.shortSkus) ? details.shortSkus.filter(isObj) : [];
        let covered = short.length > 0;
        for (const s of short) {
          if (typeof s.sku !== 'string') continue;
          const rows = (await callErp(deps, policy, (o) => link.api.stockForSku(s.sku as string, o))).value;
          const free = rows.reduce((t, r) => t + Math.max(0, r.available), 0);
          if (free < (typeof s.wanted === 'number' ? s.wanted : 1)) covered = false;
        }
        if (covered) wake.push(row.id);
      }
    }
    if (wake.length) out.woken += await wakeHeld(db, storeId, { ids: wake });

    // 2b. qa-gate: a SKU stopped for NO_SHOP_PRICE whose order no longer waits for it (cancelled, the SKU taken out of
    // the order, the order sent without it) sells again once the wait has passed; the next real order asks the ERP.
    out.skusFreed = await freeStaleShopPrices(db, storeId, new Date(now.getTime() - retryMin * 60_000));

    // 3. Follow-up 490: the catch-up of open orders from the ERP's own copy (lost line webhooks, lost answers).
    const [days, batch] = await Promise.all([setting(deps, storeId, 'erp.orders.catchUpDays'), setting(deps, null, 'erp.orders.catchUpBatch')]);
    const open = await db.erpOrder.findMany({
      where: { storeId, linkId: erpLink.id, acceptedAt: { not: null, gte: new Date(now.getTime() - days * 86_400_000) }, exchangeOfId: null, deliveryResults: { none: {} } },
      orderBy: { updatedAt: 'asc' },
      take: batch,
      select: { id: true, externalOrderId: true },
    });
    for (const o of open) {
      const answer = (await callErp(deps, policy, (opt) => reads.order(o.externalOrderId, opt))).value;
      const r = await applyOrderAnswer(db, o.id, answer, now);
      out.caughtUp++;
      out.linesFixed += r.lines;
      await db.erpOrder.update({ where: { id: o.id }, data: { updatedAt: now } });
      await wakeLineWaiting(db, storeId, o.id);
    }
  } catch (e) {
    return { ...out, status: 'failed', error: errorText(e) };
  }
  return out;
}

/**
 * The SKUs flagged NO_SHOP_PRICE before `before` that no order waits on any more (no order refused for its shop price
 * is still HELD or about to go again with it): the flag is cleared, so they sell again. Returns how many.
 */
export async function freeStaleShopPrices(db: Db, storeId: number, before: Date): Promise<number> {
  const flagged = await db.productVariant.findMany({ where: { storeId, shopPriceMissingAt: { not: null, lte: before } }, select: { id: true, sku: true } });
  if (!flagged.length) return 0;
  const waiting = new Set<string>();
  const refused = await db.erpOrder.findMany({ where: { storeId, refusal: 'NO_SHOP_PRICE' }, select: { orderId: true, refusalDetails: true } });
  for (const eo of refused) {
    const last = await db.erpPush.findFirst({ where: { storeId, documentType: 'order.create', referenceId: eo.orderId }, orderBy: { createdAt: 'desc' }, select: { status: true } });
    if (last?.status !== 'HELD' && last?.status !== 'PENDING') continue;
    const d = isObj(eo.refusalDetails) ? eo.refusalDetails : {};
    for (const s of Array.isArray(d.skus) ? d.skus : []) if (typeof s === 'string') waiting.add(s);
  }
  const free = flagged.filter((v) => !waiting.has(v.sku)).map((v) => v.id);
  if (!free.length) return 0;
  return (await db.productVariant.updateMany({ where: { id: { in: free }, shopPriceMissingAt: { not: null, lte: before } }, data: { shopPriceMissingAt: null } })).count;
}

/** The SKUs not sold now because the ERP has no shop price for them (v6), for the stock page. */
export async function noShopPriceSkus(db: Db, storeId: number, take: number): Promise<{ count: number; skus: string[]; since: string | null }> {
  const where = { storeId, shopPriceMissingAt: { not: null } };
  const [count, rows] = await Promise.all([db.productVariant.count({ where }), db.productVariant.findMany({ where, orderBy: [{ shopPriceMissingAt: 'asc' }, { sku: 'asc' }], take, select: { sku: true, shopPriceMissingAt: true } })]);
  return { count, skus: rows.map((r) => r.sku), since: rows[0]?.shopPriceMissingAt?.toISOString() ?? null };
}

/** A shipment HELD behind a short line goes again once no line of its order is short. */
export async function wakeLineWaiting(db: Db, storeId: number, erpOrderId: string): Promise<number> {
  const eo = await db.erpOrder.findUnique({ where: { id: erpOrderId }, select: { orderId: true } });
  if (!eo) return 0;
  if (await db.erpOrderLine.count({ where: { erpOrderId, state: 'SHORT' } })) return 0;
  const ids = (await db.erpPush.findMany({ where: { storeId, status: 'HELD', heldReason: 'LINE_WAITING', referenceId: eo.orderId }, select: { id: true } })).map((r) => r.id);
  return ids.length ? wakeHeld(db, storeId, { ids }) : 0;
}

// ---- what the order page shows (v6 only) --------------------------------------------------------------------------------

export interface ErpOrderLineView {
  lineId: string;
  sku: string;
  grade: ErpGrade;
  customerPriceMinor: number;
  /** The buying price fixed on the order: only for those who may read the ERP account. */
  shopPriceMinor: number | null;
  fromReturnStock: boolean;
  state: string;
  shortReason: string | null;
  decision: string | null;
  decisionSku: string | null;
}

export interface ErpOrderView {
  externalOrderId: string;
  accepted: boolean;
  erpTotalMinor: number | null;
  refusal: string | null;
  refusedAt: string | null;
  held: { reason: string; since: string } | null;
  billedAt: string | null;
  pickedUpAt: string | null;
  consignmentId: string | null;
  identification: string | null;
  lines: ErpOrderLineView[];
  hold: ErpHoldNotice | null;
  canDecide: boolean;
}

const safeNum = (v: bigint | null): number | null => (v == null ? null : Number(v));

/** The ERP part of one order's page: null in v5 or when the order never went to the ERP in v6. */
export async function erpOrderView(deps: InventoryDeps, who: Who, orderId: string): Promise<ErpOrderView | null> {
  await requirePermission(deps.db, who.actor, 'orders.read', { storeId: who.storeId });
  if (!(await isV6(deps, who.storeId))) return null;
  const eo = await erpOrderOf(deps.db, { storeId: who.storeId, orderId });
  if (!eo) return null;
  const [lines, push, hold, money, decide] = await Promise.all([
    erpOrderLinesOf(deps.db, eo.id),
    deps.db.erpPush.findFirst({ where: { storeId: who.storeId, referenceId: orderId, status: 'HELD' }, orderBy: { updatedAt: 'desc' }, select: { heldReason: true, updatedAt: true } }),
    erpHoldNotice(deps, who.storeId),
    can(deps, who, 'erp.account.read'),
    can(deps, who, 'orders.lines'),
  ]);
  return {
    externalOrderId: eo.externalOrderId,
    accepted: !!eo.acceptedAt,
    erpTotalMinor: money ? safeNum(eo.erpTotalMinor) : null,
    refusal: eo.refusal,
    refusedAt: eo.refusedAt?.toISOString() ?? null,
    held: push?.heldReason ? { reason: push.heldReason, since: push.updatedAt.toISOString() } : null,
    billedAt: eo.billedAt?.toISOString() ?? null,
    pickedUpAt: eo.pickedUpAt?.toISOString() ?? null,
    consignmentId: eo.consignmentId,
    identification: eo.identification,
    lines: lines
      .filter((l) => l.state !== 'REMOVED')
      .map((l) => ({ lineId: l.lineId, sku: l.sku, grade: l.grade, customerPriceMinor: l.customerPriceMinor, shopPriceMinor: money ? l.shopPriceMinor : null, fromReturnStock: l.fromReturnStock, state: l.state, shortReason: l.shortReason, decision: l.decision, decisionSku: l.decisionSku })),
    hold,
    canDecide: decide,
  };
}

async function can(deps: InventoryDeps, who: Who, permission: string): Promise<boolean> {
  try {
    await requirePermission(deps.db, who.actor, permission as Parameters<typeof requirePermission>[2], { storeId: who.storeId });
    return true;
  } catch {
    return false;
  }
}

export type { Tx };
