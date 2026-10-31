// S08 · PR 186 (Blueprint B1.8; CN-017 SIM-F-021; CN-018 (5)) — the exchange request from the customer's own account.
// The customer picks the piece, the reason (a size, or a faulty, damaged or wrong piece replaced in the same size), the
// new size and one of the pieces the tiers offer, sees the money, and confirms. It is the same engine and the same checks
// as staff (`openExchangeBy`, source `shop`): the policy, the window, the per-piece limit, the excluded categories, the
// tiers in order and the photo the owner asks for on a mistake of ours. It opens a REQUESTED exchange only: a person
// approves it (the new parcel, the stock held, the pick-up), so nothing is booked, charged or paid here.
//
// SIM-F-021: a parcel he refused at the door for one of the owner's re-ship reasons (a try-on) shows here as well — the
// size re-ship is linked to the refused order, its window counts from the refusal (the engine's own rule).
// CN-018 (5): on a size exchange he pays the second delivery unless the shop sent the wrong size; he says so here with a
// note (and a photo when `orders.exchange.charge.claimPhoto` is on), and staff decide the claim (`returns.claims.decide`).
//
// Off by default (`orders.exchange.account`). Only his own order (his account); anyone else's is "no such order".
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { parse, setting, type OrdersDeps } from './context';
import type { CustomerRef } from './customer';
import { customerBy, ownOrderId } from './edit';
import { OrdersError } from './errors';
import { decideExchangeBy, exchangeChoicesIn, openExchangeBy, type ExchangeChoices, type OpenExchangeResult } from './exchange';
import { EXCHANGE_REASON_CODES, type ExchangeReason, type ExchangeWindow } from './exchange-pure';

/** The reasons a faulty, damaged or wrong piece may go by, in the order the account offers the first the rules take. */
export const PROBLEM_REASONS: readonly ExchangeReason[] = ['defect', 'damage', 'wrong'];

/** Why the account cannot ask for an exchange on this order now (null: it can, for at least one piece). */
export type CustomerExchangeClosed = 'OFF' | 'NOT_DELIVERED' | 'UNKNOWN' | 'WINDOW' | 'NONE_LEFT';

export interface CustomerExchangeLine {
  lineId: string;
  productId: string | null;
  variantId: string | null;
  productName: string;
  colourName: string | null;
  sizeLabel: string | null;
  quantity: number;
  /** What the old piece counts for in the exchange (what he paid for one). */
  paidPerPieceMinor: number;
  /** The piece's own sizes, in order (one size: only a problem can be replaced). */
  sizes: { key: string; label: string }[];
  currentSizeKey: string | null;
  /** Why a size exchange of this piece cannot be asked for (null: it can). */
  size: ExchangeChoices['closed'];
  /** Why a replacement for a problem cannot be asked for (null: it can). */
  problem: ExchangeChoices['closed'];
}

export interface CustomerExchangeRow {
  number: string;
  status: string;
  reason: string;
  createdAt: string;
  chargeState: string | null;
  claimState: string | null;
  money: { differenceMinor: number; chargeMinor: number; codMinor: number; creditMinor: number };
  newOrderNumber: string | null;
  /** Each swap; the new piece with its product and colour for its picture (null when the piece is gone from the catalogue). */
  items: {
    lineId: string | null;
    oldSku: string | null;
    newName: string | null;
    newColourName: string | null;
    newSizeLabel: string | null;
    quantity: number;
    newProductId: string | null;
    newColour: { key: string; hex: string } | null;
  }[];
}

export interface CustomerExchangeState {
  open: boolean;
  closed: CustomerExchangeClosed | null;
  number: string;
  window: ExchangeWindow | null;
  windowHours: number | null;
  /** The engine reason "faulty, damaged or wrong" goes by here (null: the rules take none of them). */
  problemReason: ExchangeReason | null;
  lines: CustomerExchangeLine[];
  exchanges: CustomerExchangeRow[];
  rules: { claim: boolean; claimPhoto: boolean; problemPhoto: boolean; maxPhotos: number; photoMaxMb: number };
}

const numberText = z.string().trim().min(1).max(40);
const GLOBAL: ReadonlySet<string> = new Set(['OFF', 'NOT_DELIVERED', 'UNKNOWN', 'WINDOW']);

/** His exchanges on this order, newest first. */
async function rowsOf(deps: OrdersDeps, storeId: number, orderId: string): Promise<CustomerExchangeRow[]> {
  const rows = await deps.db.exchange.findMany({
    where: { storeId, orderId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      number: true,
      status: true,
      reason: true,
      createdAt: true,
      chargeState: true,
      claimState: true,
      priceDifferenceMinor: true,
      deliveryChargeMinor: true,
      codToCollectMinor: true,
      walletCreditMinor: true,
      newOrderId: true,
      items: { orderBy: { createdAt: 'asc' }, select: { originalOrderItemId: true, oldSku: true, newVariantId: true, newName: true, newColourName: true, newSizeLabel: true, quantity: true } },
    } satisfies Prisma.ExchangeSelect,
  });
  const ids = rows.flatMap((r) => (r.newOrderId ? [r.newOrderId] : []));
  const numbers = new Map((ids.length ? await deps.db.order.findMany({ where: { id: { in: ids } }, select: { id: true, number: true } }) : []).map((o) => [o.id, o.number]));
  const vids = [...new Set(rows.flatMap((r) => r.items.flatMap((i) => (i.newVariantId ? [i.newVariantId] : []))))];
  const variants = new Map(
    (vids.length ? await deps.db.productVariant.findMany({ where: { storeId, id: { in: vids } }, select: { id: true, productId: true, colour: { select: { key: true, hex: true } } } }) : []).map((v) => [v.id, v]),
  );
  return rows.map((r) => ({
    number: r.number,
    status: r.status,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
    chargeState: r.chargeState,
    claimState: r.claimState,
    money: { differenceMinor: r.priceDifferenceMinor, chargeMinor: r.deliveryChargeMinor, codMinor: r.codToCollectMinor, creditMinor: r.walletCreditMinor },
    newOrderNumber: r.newOrderId ? (numbers.get(r.newOrderId) ?? null) : null,
    items: r.items.map((i) => {
      const v = i.newVariantId ? variants.get(i.newVariantId) : undefined;
      return {
        lineId: i.originalOrderItemId,
        oldSku: i.oldSku,
        newName: i.newName,
        newColourName: i.newColourName,
        newSizeLabel: i.newSizeLabel,
        quantity: i.quantity,
        newProductId: v?.productId ?? null,
        newColour: v?.colour ? { key: v.colour.key, hex: v.colour.hex } : null,
      };
    }),
  }));
}

/** What his order may take now: each piece with why a size exchange or a replacement is (not) possible, and his exchanges. */
export async function customerExchangeState(deps: OrdersDeps, c: CustomerRef, number: string): Promise<CustomerExchangeState> {
  const n = parse(numberText, number, 'order number');
  const [cfg, charge, engine] = await Promise.all([setting(deps, c.storeId, 'orders.exchange.account'), setting(deps, c.storeId, 'orders.exchange.charge'), setting(deps, c.storeId, 'orders.exchange.engine')]);
  const rules = { claim: cfg.claim, claimPhoto: charge.claimPhoto, problemPhoto: engine.ourMistakePhoto !== 'never', maxPhotos: cfg.maxPhotos, photoMaxMb: cfg.photoMaxMb };
  const shut: CustomerExchangeState = { open: false, closed: 'OFF', number: n, window: null, windowHours: null, problemReason: null, lines: [], exchanges: [], rules };
  if (!cfg.enabled || !c.customerId) return shut;
  const orderId = await ownOrderId(deps, c, n);
  const items = await deps.db.orderItem.findMany({ where: { storeId: c.storeId, orderId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select: { id: true, productId: true, variantId: true } });
  const lines: CustomerExchangeLine[] = [];
  let window: ExchangeWindow | null = null;
  let windowHours: number | null = null;
  let problemReason: ExchangeReason | null = null;
  const closedAll = new Set<string>();
  for (const i of items) {
    const size = await exchangeChoicesIn(deps, c.storeId, orderId, { orderItemId: i.id, reason: 'size' });
    problemReason ??= PROBLEM_REASONS.find((r) => size.reasons.includes(r)) ?? null;
    const problem = problemReason ? await exchangeChoicesIn(deps, c.storeId, orderId, { orderItemId: i.id, reason: problemReason }) : null;
    // the size's window first (a re-ship after a try-on counts from the refusal), else the replacement's
    const best = size.closed === null || !problem ? size : problem.closed === null ? problem : size;
    window ??= best.window;
    windowHours ??= best.windowHours;
    const oneSize = size.sizes.length < 2;
    const sizeWhy: ExchangeChoices['closed'] = size.closed ?? (oneSize ? 'NOT_COVERED' : null);
    const problemWhy: ExchangeChoices['closed'] = problem ? problem.closed : 'REASON';
    for (const w of [sizeWhy, problemWhy]) if (w) closedAll.add(w);
    lines.push({
      lineId: i.id,
      productId: i.productId,
      variantId: i.variantId,
      productName: size.item.productName,
      colourName: size.item.colourName,
      sizeLabel: size.item.sizeLabel,
      quantity: size.item.quantity,
      paidPerPieceMinor: size.item.paidPerPieceMinor,
      sizes: size.sizes,
      currentSizeKey: size.neededSizeKey,
      size: sizeWhy,
      problem: problemWhy,
    });
  }
  const exchanges = await rowsOf(deps, c.storeId, orderId);
  const anyOpen = lines.some((l) => l.size === null || l.problem === null);
  const globalWhy = (['OFF', 'NOT_DELIVERED', 'UNKNOWN', 'WINDOW'] as const).find((w) => closedAll.has(w) && lines.every((l) => (l.size === null || GLOBAL.has(l.size)) && (l.problem === null || GLOBAL.has(l.problem) || l.problem === 'REASON')));
  const closed: CustomerExchangeClosed | null = anyOpen ? null : (globalWhy ?? (lines.length ? 'NONE_LEFT' : 'NOT_DELIVERED'));
  return { open: anyOpen, closed, number: n, window, windowHours, problemReason, lines, exchanges, rules };
}

export const customerChoicesInput = z
  .object({ number: numberText, orderItemId: z.uuid(), reason: z.enum(EXCHANGE_REASON_CODES), sizeKey: z.string().trim().min(1).max(40).nullish(), quantity: z.int().min(1).max(50).optional() })
  .strict();

async function onAndHis(deps: OrdersDeps, c: CustomerRef, number: string): Promise<{ orderId: string; cfg: { enabled: boolean; claim: boolean; maxPhotos: number; photoMaxMb: number } }> {
  const cfg = await setting(deps, c.storeId, 'orders.exchange.account');
  if (!cfg.enabled) throw new OrdersError('EXCHANGE_CLOSED', 'exchanges are not asked for from the account here', [], { why: 'OFF' });
  if (!c.customerId) throw new OrdersError('NOT_FOUND', 'no such order', ['number']);
  return { orderId: await ownOrderId(deps, c, number), cfg };
}

/** The pieces the tiers offer for his new size (or, for a problem, the same size), with the money for each. */
export async function customerExchangeChoices(deps: OrdersDeps, c: CustomerRef, input: unknown): Promise<ExchangeChoices> {
  const d = parse(customerChoicesInput, input, 'exchange choice');
  const { orderId } = await onAndHis(deps, c, d.number);
  const { number: _n, ...rest } = d;
  return exchangeChoicesIn(deps, c.storeId, orderId, rest);
}

const assetIds = z.array(z.uuid()).max(10);

export const customerExchangeInput = z
  .object({
    number: numberText,
    orderItemId: z.uuid(),
    reason: z.enum(EXCHANGE_REASON_CODES),
    newVariantId: z.uuid(),
    quantity: z.int().min(1).max(50).optional(),
    /** What is wrong with the piece, in his words. */
    note: z.string().trim().max(1_000).optional(),
    photoAssetIds: assetIds.optional(),
    /** CN-018 (5): "you sent the wrong size" — only on a size exchange, decided by staff. */
    claim: z.object({ note: z.string().trim().min(1).max(1_000), photoAssetIds: assetIds.optional() }).strict().optional(),
  })
  .strict();

export interface CustomerExchangeResult extends OpenExchangeResult {
  /** PENDING when his claim was recorded with the request; null when he made none (or there was no charge to claim). */
  claimState: string | null;
}

/**
 * His request: a REQUESTED exchange through the one engine (source `shop`), and his claim on it when he made one. The
 * photos are the ones the account's own upload stored for this request (the API never takes ids from the form).
 */
export async function customerRequestExchange(deps: OrdersDeps, c: CustomerRef, input: unknown, opts: { idempotencyKey?: string } = {}): Promise<CustomerExchangeResult> {
  const d = parse(customerExchangeInput, input, 'exchange');
  const { orderId, cfg } = await onAndHis(deps, c, d.number);
  if ((d.photoAssetIds?.length ?? 0) + (d.claim?.photoAssetIds?.length ?? 0) > cfg.maxPhotos) throw new OrdersError('INVALID_INPUT', `at most ${cfg.maxPhotos} photos`, ['photoAssetIds'], { maxPhotos: cfg.maxPhotos });
  if (d.claim) {
    if (d.reason !== 'size' || !cfg.claim) throw new OrdersError('INVALID_INPUT', 'a claim is made on a size exchange, where the shop takes claims', ['claim']);
    const rules = await setting(deps, c.storeId, 'orders.exchange.charge');
    if (rules.claimPhoto && !d.claim.photoAssetIds?.length) throw new OrdersError('PHOTO_REQUIRED', 'a claim needs a photo', ['claim.photoAssetIds']);
  }
  const by = customerBy(c);
  const opened = await openExchangeBy(
    deps,
    { storeId: c.storeId, orderId },
    by,
    {
      reason: d.reason,
      ...(d.note ? { reasonNote: d.note } : {}),
      ...(d.photoAssetIds?.length ? { photoAssetIds: d.photoAssetIds } : {}),
      items: [{ orderItemId: d.orderItemId, newVariantId: d.newVariantId, ...(d.quantity ? { quantity: d.quantity } : {}) }],
    },
    opts,
    { source: 'shop', createdById: null },
  );
  const claim = d.claim;
  const now = await deps.db.exchange.findUniqueOrThrow({ where: { id: opened.exchangeId }, select: { claimState: true, isOurMistake: true, deliveryChargeMinor: true } });
  // nothing to claim when he pays no delivery on it (our mistake, free, or the shop's already), or on the same press again
  if (!claim || opened.replay || now.isOurMistake || now.deliveryChargeMinor <= 0) return { ...opened, claimState: now.claimState };
  const claimState = await decideExchangeBy(deps, c.storeId, by, opened.exchangeId, {}, async (tx, ex) => {
    if (ex.status !== 'REQUESTED' || ex.claimState === 'PENDING') throw new OrdersError('EXCHANGE_STATE', 'the claim can no longer be added', ['claim'], { status: ex.status, claimState: ex.claimState });
    await tx.exchange.update({ where: { id: ex.id }, data: { claimState: 'PENDING', claimNote: claim.note, photoAssetIds: [...new Set([...ex.photoAssetIds, ...(claim.photoAssetIds ?? [])])] } });
    return { action: 'claimed', message: claim.note, after: { claimState: 'PENDING', photos: claim.photoAssetIds?.length ?? 0, from: 'account' }, result: 'PENDING' as string | null };
  });
  return { ...opened, claimState };
}
