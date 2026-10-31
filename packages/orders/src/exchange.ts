// PR 185 (S08; Blueprint B1.8; BACKEND-ARCHITECTURE §5.3 ORD-05, §6.5.4) — the four-tier exchange engine on the order
// state machine. An exchange is opened on a delivered order through the one order service (`exchange`, a flag command:
// the order keeps its final state, with the row lock, the version, the timeline and the audit row as every command).
// Approving it creates the linked exchange order — the new parcel, with the shop's next order number, the original's
// address and band, a line at the new piece's price minus what the old piece covers, and the exchange charge — holds
// its stock under the same row locks as the checkout (@extas/inventory holdOrderUnits, PR 188), and opens the pick-up of
// the old piece as an EXCHANGE_PICKUP return (QC and the ERP restock: PR 187). Refusing it closes it with the reason.
//
// The policy is the owner's: on or off, the window from the courier's delivered mark, exchanges per piece and the
// excluded categories (`policy.exchange.*`), overridden by the live Smart Rules exchange rule when there is one (its
// window, per-item limit, charge per band, reasons and "free when our mistake"). How the engine works is
// `orders.exchange.*` (registry-returns.ts). The tiers are strictly in order: the piece chosen must be one the first
// tier with stock offers.
//
// SIM-F-022: the SKU really coming back (`receivedSku`, a wrong item returns what was packed) is kept from the start;
// QC restocks what is scanned. A wrong item carries its root cause.
//
// PR 190 (CN-018 (5), CN-014e, SIM-F-021): the charge follows the owner's rules (exchangeCharge in exchange-pure.ts);
// the one-trip size swap in its bands; a parcel refused at the door for one of the owner's re-ship reasons (a try-on)
// may take a size exchange, linked to the refused order: the window counts from the refusal, the old piece covers only
// what was really paid, and the courier's return of the refused parcel is its pick-up (no second one). Waivers and
// claims: exchange-charge.ts.
//
// Never here: moving money, a refund, changing a price, a discount or COD by hand, or blocking anyone (CLAUDE.md rule 6).
// The new parcel's amount follows the money box; a wallet credit is only a REQUEST after QC (PR 187).
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { holdOrderUnits, InventoryError, isV6, sellableKinds, sellableUnits } from '@extas/inventory';
import { settleReturnRefundsForExchange } from '@extas/payments';
import { discountWasFor, exchangeTermsFor } from '@extas/rules';
import { allow, nowOf, parse, setting, TX, type Db, type OrdersDeps, type Tx, type Who } from './context';
import { OrdersError } from './errors';
import { EXCHANGE_REASON_CODES, exchangeCharge, exchangeOffer, exchangeWindow, isOurMistake, lineOnNewOrder, moneyBox, perItemLeft, v6MoneyBox, type Candidate, type ChargeRules, type ExchangeReason, type ExchangeTier, type ExchangeWindow, type MoneyBox, type OriginalPiece } from './exchange-pure';
import { confirmBy } from './commands';
import { auditRow, eventRow, execute, inventoryOf, staffBy, type By, type CommandOptions } from './service';

// ---------------------------------------------------------------------------------------------------------------------
// The facts: the order, its piece, the policy and the rule
// ---------------------------------------------------------------------------------------------------------------------

/** An exchange still running (a piece in one of these is not exchanged again until it ends). */
export const OPEN_EXCHANGE = ['REQUESTED', 'APPROVED', 'PICKUP_BOOKED', 'RECEIVED', 'QC_PASSED', 'QC_FAILED'] as const;
/** An exchange that counts towards the per-piece limit (everything but a refused or cancelled one). */
export const COUNTED_EXCHANGE = [...OPEN_EXCHANGE, 'COMPLETED'] as const;

const ORDER_FACTS = {
  id: true,
  storeId: true,
  number: true,
  status: true,
  customerId: true,
  deliveredAt: true,
  returnedAt: true,
  paidMinor: true,
  totalMinor: true,
  deliveryBand: { select: { key: true } },
} as const;

const ITEM_FACTS = {
  id: true,
  orderId: true,
  variantId: true,
  productId: true,
  sku: true,
  productName: true,
  colourName: true,
  sizeLabel: true,
  quantity: true,
  lineTotalMinor: true,
  status: true,
} as const;

type ItemFacts = { id: string; orderId: string; variantId: string | null; productId: string | null; sku: string; productName: string; colourName: string | null; sizeLabel: string | null; quantity: number; lineTotalMinor: number; status: string };

/** What the customer paid for one piece of a line (its total after the line's discounts, per piece). */
export const paidPerPiece = (i: Pick<ItemFacts, 'lineTotalMinor' | 'quantity'>): number => (i.quantity > 0 ? Math.floor(i.lineTotalMinor / i.quantity) : 0);

/**
 * PR 190 — what the old piece counts for: a delivered piece what was paid for it; a piece refused at the door (a
 * re-ship) only its share of what was really paid before (nothing on Cash on Delivery), so the re-ship is never cheaper
 * than the parcel he refused.
 */
export function coveredPerPiece(i: Pick<ItemFacts, 'lineTotalMinor' | 'quantity'>, o: { status: string; paidMinor: number; totalMinor: number }): number {
  if (o.status !== 'RETURNED') return paidPerPiece(i);
  const share = o.totalMinor > 0 ? Math.min(1, Math.max(0, o.paidMinor) / o.totalMinor) : 0;
  return Math.floor(paidPerPiece(i) * share);
}

/**
 * Review R3 (M1) — a refused parcel's money that is still the customer's to put towards a re-ship: what was paid less
 * every refund a person approved or paid out of it (an open request gives way to the exchange: its approval cuts it,
 * @extas/payments settleReturnRefundsForExchange). Any other order as it is.
 */
async function withFreePaid<T extends { id: string; status: string; paidMinor: number }>(db: Db, storeId: number, o: T): Promise<T> {
  if (o.status !== 'RETURNED' || o.paidMinor <= 0) return o;
  const out = await db.refund.aggregate({ where: { storeId, orderId: o.id, method: 'original', status: { in: ['APPROVED', 'FAILED', 'COMPLETED'] } }, _sum: { amountMinor: true } });
  return { ...o, paidMinor: Math.max(0, o.paidMinor - (out._sum.amountMinor ?? 0)) };
}

/** PR 190 (SIM-F-021): a refused parcel may take a size exchange when its refusal is one of the owner's re-ship reasons. */
export const reshipAllowed = (status: string, refusalKey: string | null, reason: string, reshipRefusals: readonly string[]): boolean =>
  status === 'RETURNED' && reason === 'size' && !!refusalKey && reshipRefusals.includes(refusalKey);

/** The refusal reason of a refused order (the order service's `returned` step). */
async function refusalOf(db: Db, storeId: number, o: { id: string; status: string }): Promise<string | null> {
  if (o.status !== 'RETURNED') return null;
  return (await db.orderEvent.findFirst({ where: { storeId, orderId: o.id, type: 'order.returned' }, orderBy: { createdAt: 'desc' }, select: { reasonCode: true } }))?.reasonCode ?? null;
}

/** PR 190 — the owner's charge rules and the one-trip swap. */
async function chargeSettings(deps: OrdersDeps, storeId: number): Promise<{ rules: ChargeRules & { claimPhoto: boolean; reshipRefusals: string[] }; swap: { enabled: boolean; chargeMinor: number | null; bandKeys: string[] } }> {
  const [rules, swap] = await Promise.all([setting(deps, storeId, 'orders.exchange.charge'), setting(deps, storeId, 'orders.exchange.swap')]);
  return { rules, swap };
}

/** The one-trip swap for this band and reason, when the owner has it on (null: not offered). */
const swapFor = (swap: { enabled: boolean; chargeMinor: number | null; bandKeys: string[] }, reason: string, bandKey: string | null): { chargeMinor: number | null } | null =>
  swap.enabled && reason === 'size' && !!bandKey && swap.bandKeys.includes(bandKey) ? { chargeMinor: swap.chargeMinor } : null;

/** The exchange terms for one piece: the live rule's when there is one, else the policy settings. */
export interface ExchangePolicy {
  enabled: boolean;
  windowHours: number;
  perItem: number | null;
  chargeMinor: number | null;
  reasons: readonly ExchangeReason[];
  freeWhenOurMistake: boolean;
  /** Not in the rule's "except" and not in an excluded category. */
  covered: boolean;
  ruleKey: string | null;
}

async function excludedCategoryIds(db: Db, storeId: number, slugs: readonly string[]): Promise<Set<string>> {
  if (!slugs.length) return new Set();
  const rows = await db.category.findMany({ where: { storeId, slug: { in: [...slugs] } }, select: { id: true } });
  // a child of an excluded category is excluded too
  const all = await db.category.findMany({ where: { storeId }, select: { id: true, parentId: true } });
  const out = new Set(rows.map((r) => r.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of all)
      if (c.parentId && out.has(c.parentId) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
  }
  return out;
}

export async function exchangePolicyFor(deps: OrdersDeps, storeId: number, productId: string, bandKey: string | null): Promise<ExchangePolicy> {
  const [enabled, windowHours, perItem, terms] = await Promise.all([
    setting(deps, storeId, 'policy.exchange.enabled'),
    setting(deps, storeId, 'policy.exchange.windowHours'),
    setting(deps, storeId, 'policy.exchange.perItem'),
    exchangeTermsFor(deps, { storeId, productId, bandKey }),
  ]);
  return {
    enabled,
    windowHours: terms?.windowHours ?? windowHours,
    perItem: terms?.perItem ?? perItem,
    chargeMinor: terms?.chargeMinor ?? null,
    reasons: (terms?.reasons as readonly ExchangeReason[] | undefined) ?? EXCHANGE_REASON_CODES,
    freeWhenOurMistake: terms?.freeWhenOurMistake ?? true,
    covered: terms?.covered ?? true,
    ruleKey: terms?.rule.key ?? null,
  };
}

/** The variant behind an order line, as the tiers read it. */
async function pieceOf(db: Db, storeId: number, item: ItemFacts): Promise<(OriginalPiece & { sizeKey: string | null; directCategoryIds: string[] }) | null> {
  if (!item.variantId) return null;
  const v = await db.productVariant.findFirst({ where: { id: item.variantId, storeId }, select: { productId: true, colourId: true, size: { select: { key: true } }, product: { select: { categoryId: true } } } });
  if (!v) return null;
  const [listings, collections] = await Promise.all([
    db.categoryProduct.findMany({ where: { storeId, productId: v.productId }, select: { categoryId: true } }),
    db.collectionProduct.findMany({ where: { storeId, productId: v.productId, archivedAt: null, collection: { archivedAt: null } }, select: { collectionId: true } }),
  ]);
  const cats = [...new Set([v.product.categoryId, ...listings.map((l) => l.categoryId)].filter((x): x is string => !!x))];
  return { productId: v.productId, colourId: v.colourId, sizeKey: v.size?.key ?? null, categoryIds: cats, directCategoryIds: cats, collectionIds: collections.map((c) => c.collectionId) };
}

/** A piece offered, as the screens show it. */
export interface ExchangeOption {
  variantId: string;
  sku: string;
  productId: string;
  productName: string;
  colourName: string | null;
  sizeKey: string | null;
  sizeLabel: string | null;
  tier: ExchangeTier;
  /** The product page's price now (its live discount included). */
  priceMinor: number;
  sellable: number;
}

type Cand = Candidate & { sku: string; productName: string; colourName: string | null; sizeLabel: string | null };

/** Every live piece in the needed size, with its tier facts, stock and whether its category is excluded. */
async function candidatesIn(deps: OrdersDeps, db: Db, storeId: number, sizeKey: string | null, excluded: Set<string>): Promise<Cand[]> {
  const kinds = await sellableKinds(inventoryOf(deps));
  const rows = await db.productVariant.findMany({
    where: { storeId, archivedAt: null, ...(sizeKey === null ? { sizeId: null } : { size: { key: sizeKey } }), product: { status: 'PUBLISHED', archivedAt: null } },
    select: {
      id: true,
      sku: true,
      productId: true,
      colourId: true,
      sortOrder: true,
      size: { select: { key: true, label: true } },
      colour: { select: { nameEn: true } },
      product: { select: { nameEn: true, categoryId: true } },
      stockLevels: { select: { available: true, cartReserved: true, onHand: true, location: { select: { kind: true, archivedAt: true, warehouse: { select: { archivedAt: true } } } } } },
    },
  });
  const pids = [...new Set(rows.map((r) => r.productId))];
  const [listings, collections] = await Promise.all([
    db.categoryProduct.findMany({ where: { storeId, productId: { in: pids } }, select: { productId: true, categoryId: true } }),
    db.collectionProduct.findMany({ where: { storeId, productId: { in: pids }, archivedAt: null, collection: { archivedAt: null } }, select: { productId: true, collectionId: true } }),
  ]);
  const cats = new Map<string, Set<string>>();
  const cols = new Map<string, string[]>();
  for (const r of rows) if (r.product.categoryId) cats.set(r.productId, new Set([...(cats.get(r.productId) ?? []), r.product.categoryId]));
  for (const l of listings) cats.set(l.productId, new Set([...(cats.get(l.productId) ?? []), l.categoryId]));
  for (const c of collections) cols.set(c.productId, [...(cols.get(c.productId) ?? []), c.collectionId]);
  return rows.map((r) => {
    const categoryIds = [...(cats.get(r.productId) ?? [])];
    return {
      variantId: r.id,
      productId: r.productId,
      colourId: r.colourId,
      sizeKey: r.size?.key ?? null,
      categoryIds,
      collectionIds: cols.get(r.productId) ?? [],
      sellable: sellableUnits(r.stockLevels, kinds),
      excluded: categoryIds.some((c) => excluded.has(c)),
      sortOrder: r.sortOrder,
      sku: r.sku,
      productName: r.product.nameEn,
      colourName: r.colour?.nameEn ?? null,
      sizeLabel: r.size?.label ?? null,
    };
  });
}

/**
 * The pieces offered for one line in the needed size (the first enabled tier with stock), priced as the shop prices
 * them now. A piece without a price is not on sale; when a whole tier has none, the next tier is tried.
 */
async function offerFor(deps: OrdersDeps, db: Db, storeId: number, piece: OriginalPiece, sizeKey: string | null, quantity: number, excluded: Set<string>): Promise<{ tier: ExchangeTier | null; options: ExchangeOption[] }> {
  const cfg = await setting(deps, storeId, 'orders.exchange.tiers');
  let pool = await candidatesIn(deps, db, storeId, sizeKey, excluded);
  for (;;) {
    const offer = exchangeOffer({ ...cfg, maxOptions: Number.MAX_SAFE_INTEGER }, piece, sizeKey, quantity, pool);
    if (offer.tier === null) return { tier: null, options: [] };
    const priced: ExchangeOption[] = [];
    for (const c of offer.options) {
      if (priced.length >= cfg.maxOptions) break;
      const p = await discountWasFor(deps, { storeId, variantId: c.variantId });
      if (p) priced.push(optionOf(c, offer.tier, p.discountedMinor));
    }
    if (priced.length) return { tier: offer.tier, options: priced };
    const tried = new Set(offer.options.map((o) => o.variantId));
    pool = pool.filter((c) => !tried.has(c.variantId));
  }
}

const optionOf = (c: Cand, tier: ExchangeTier, priceMinor: number): ExchangeOption => ({
  variantId: c.variantId,
  sku: c.sku,
  productId: c.productId,
  productName: c.productName,
  colourName: c.colourName,
  sizeKey: c.sizeKey,
  sizeLabel: c.sizeLabel,
  tier,
  priceMinor,
  sellable: c.sellable,
});

// ---------------------------------------------------------------------------------------------------------------------
// What may be exchanged now (the order page's "Exchange" and the case drawer)
// ---------------------------------------------------------------------------------------------------------------------

/** Why no exchange may be opened now. */
export type ExchangeClosedWhy = 'OFF' | 'NOT_DELIVERED' | 'UNKNOWN' | 'WINDOW';

export function closedWhy(policy: Pick<ExchangePolicy, 'enabled'>, status: string, window: ExchangeWindow): ExchangeClosedWhy | null {
  if (!policy.enabled) return 'OFF';
  if (status !== 'DELIVERED' && status !== 'PARTIALLY_DELIVERED') return 'NOT_DELIVERED';
  if (window.state === 'UNKNOWN') return 'UNKNOWN';
  if (window.state === 'CLOSED') return 'WINDOW';
  return null;
}

export const choicesInput = z
  .object({ orderItemId: z.uuid(), reason: z.enum(EXCHANGE_REASON_CODES), sizeKey: z.string().trim().min(1).max(40).nullish(), quantity: z.int().min(1).max(50).optional() })
  .strict();

export interface ExchangeChoices {
  orderId: string;
  number: string;
  item: { id: string; sku: string; productName: string; colourName: string | null; sizeLabel: string | null; quantity: number; paidPerPieceMinor: number };
  window: ExchangeWindow;
  windowHours: number;
  /** Why an exchange cannot be opened now (null: it can). */
  closed: ExchangeClosedWhy | 'EXCLUDED' | 'NOT_COVERED' | 'REASON' | 'LIMIT' | 'OPEN' | null;
  perItemLeft: number | null;
  reasons: readonly ExchangeReason[];
  /** The product's own sizes, for the size picker. */
  sizes: { key: string; label: string }[];
  neededSizeKey: string | null;
  tier: ExchangeTier | null;
  options: (ExchangeOption & { money: MoneyBox })[];
  /** PR 190 (SIM-F-021): a size re-ship of a parcel refused at the door after a try-on, linked to this order. */
  reship: boolean;
  /** PR 190 (CN-014e): the one-trip size swap is offered here, at this price (null: not offered). */
  oneTrip: { chargeMinor: number | null } | null;
}

/** The order's facts under no lock (a screen) or in a transaction. */
async function itemOf(db: Db, storeId: number, orderId: string, orderItemId: string): Promise<ItemFacts> {
  const i = await db.orderItem.findFirst({ where: { id: orderItemId, storeId, orderId }, select: ITEM_FACTS });
  if (!i || i.status !== 'ACTIVE') throw new OrdersError('NOT_FOUND', 'no such line on this order', ['orderItemId']);
  return i;
}

async function usedOn(db: Db, storeId: number, orderItemId: string): Promise<{ counted: number; open: number }> {
  const rows = await db.exchangeItem.findMany({ where: { storeId, originalOrderItemId: orderItemId, exchange: { status: { in: [...COUNTED_EXCHANGE] } } }, select: { exchange: { select: { status: true } } } });
  return { counted: rows.length, open: rows.filter((r) => (OPEN_EXCHANGE as readonly string[]).includes(r.exchange.status)).length };
}

/** The exchange choices for one line: the window, the limits and the pieces the first tier with stock offers. */
export async function exchangeChoices(deps: OrdersDeps, who: Who, orderId: string, input: unknown): Promise<ExchangeChoices> {
  await allow(deps, who, 'returns.view');
  return exchangeChoicesIn(deps, who.storeId, orderId, input);
}

/** PR 186: the same choices for a caller that checked who may see the order itself (the customer's own account). */
export async function exchangeChoicesIn(deps: OrdersDeps, storeId: number, orderId: string, input: unknown): Promise<ExchangeChoices> {
  const who = { storeId };
  const d = parse(choicesInput, input, 'exchange choice');
  const db = deps.db;
  const found = await db.order.findFirst({ where: { id: orderId, storeId: who.storeId }, select: ORDER_FACTS });
  if (!found) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  const o = await withFreePaid(db, who.storeId, found);
  const item = await itemOf(db, who.storeId, o.id, d.orderItemId);
  const piece = await pieceOf(db, who.storeId, item);
  const policy = await exchangePolicyFor(deps, who.storeId, item.productId ?? piece?.productId ?? '', o.deliveryBand?.key ?? null);
  const cs = await chargeSettings(deps, who.storeId);
  const reship = reshipAllowed(o.status, await refusalOf(db, who.storeId, o), d.reason, cs.rules.reshipRefusals);
  // a re-ship after a try-on counts from the refusal: the parcel never reached him
  const window = exchangeWindow(reship ? o.returnedAt : o.deliveredAt, policy.windowHours, nowOf(deps));
  const covered = coveredPerPiece(item, o);
  const excluded = await excludedCategoryIds(db, who.storeId, await setting(deps, who.storeId, 'policy.exchange.excludedCategories'));
  const used = await usedOn(db, who.storeId, item.id);
  const left = perItemLeft(policy.perItem, used.counted);
  const sizes = piece
    ? (
        await db.productVariant.findMany({ where: { storeId: who.storeId, productId: piece.productId, archivedAt: null, sizeId: { not: null } }, select: { size: { select: { key: true, label: true, sortOrder: true } } } })
      )
        .map((v) => v.size!)
        .filter((s, i, all) => all.findIndex((x) => x.key === s.key) === i)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => ({ key: s.key, label: s.label }))
    : [];
  const base = {
    orderId: o.id,
    number: o.number,
    item: { id: item.id, sku: item.sku, productName: item.productName, colourName: item.colourName, sizeLabel: item.sizeLabel, quantity: item.quantity, paidPerPieceMinor: covered },
    window,
    windowHours: policy.windowHours,
    perItemLeft: left,
    reasons: policy.reasons,
    sizes,
    reship,
    oneTrip: swapFor(cs.swap, d.reason, o.deliveryBand?.key ?? null),
  };
  const neededSizeKey = d.sizeKey === undefined || d.sizeKey === null ? (piece?.sizeKey ?? null) : d.sizeKey;
  const shut = (closed: ExchangeChoices['closed']): ExchangeChoices => ({ ...base, closed, neededSizeKey, tier: null, options: [] });
  const why = closedWhy(policy, reship ? 'DELIVERED' : o.status, window);
  if (why) return shut(why);
  if (!piece || piece.categoryIds.some((c) => excluded.has(c))) return shut('EXCLUDED');
  if (!policy.covered) return shut('NOT_COVERED');
  if (!policy.reasons.includes(d.reason)) return shut('REASON');
  if (used.open) return shut('OPEN');
  if (left === 0) return shut('LIMIT');
  const qty = d.quantity ?? item.quantity;
  const offer = await offerFor(deps, db, who.storeId, piece, neededSizeKey, qty, excluded);
  const ourMistake = isOurMistake(d.reason) && policy.freeWhenOurMistake;
  return {
    ...base,
    closed: null,
    neededSizeKey,
    tier: offer.tier,
    options: offer.options.map((x) => ({
      ...x,
      money: moneyBox([{ oldUnitMinor: covered, newUnitMinor: x.priceMinor, quantity: qty }], { ourMistake, ...exchangeCharge({ reason: d.reason, ruleChargeMinor: policy.chargeMinor, rules: cs.rules, reship, oneTrip: null }) }),
    })),
  };
}

/** "Start an exchange": the order with this number in the store and its active lines (null: no such order). */
export async function exchangeOrderLines(deps: OrdersDeps, who: Who, number: string): Promise<{ orderId: string; number: string; status: string; customerName: string | null; lines: { id: string; sku: string; productName: string; colourName: string | null; sizeLabel: string | null; quantity: number }[] } | null> {
  await allow(deps, who, 'returns.view');
  const n = z.string().trim().min(1).max(40).safeParse(number);
  if (!n.success) return null;
  const o = await deps.db.order.findFirst({
    where: { storeId: who.storeId, number: { equals: n.data, mode: 'insensitive' }, status: { not: 'DRAFT' } },
    select: { id: true, number: true, status: true, customerName: true, items: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select: { id: true, sku: true, productName: true, colourName: true, sizeLabel: true, quantity: true } } },
  });
  return o ? { orderId: o.id, number: o.number, status: o.status, customerName: o.customerName, lines: o.items } : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Open an exchange (a flag command on the original order)
// ---------------------------------------------------------------------------------------------------------------------

const skuText = z.string().trim().min(1).max(64);

export const openExchangeInput = z
  .object({
    reason: z.enum(EXCHANGE_REASON_CODES),
    reasonNote: z.string().trim().max(1_000).optional(),
    /** SIM-F-022: why a wrong item went out (`orders.exchange.rootCauses`). */
    rootCause: z.string().trim().min(1).max(60).optional(),
    photoAssetIds: z.array(z.uuid()).max(10).optional(),
    /** PR 190 (CN-014e): the one-trip size swap, where the owner offers it. */
    oneTrip: z.boolean().optional(),
    items: z
      .array(
        z
          .object({
            orderItemId: z.uuid(),
            quantity: z.int().min(1).max(50).optional(),
            newVariantId: z.uuid(),
            /** SIM-F-022: the SKU really coming back, when it is not the one ordered (a wrong item). */
            receivedSku: skuText.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();

export interface OpenExchangeResult {
  exchangeId: string;
  number: string;
  orderId: string;
  status: string;
  money: MoneyBox;
  replay: boolean;
}

/** The exchange's own number, under the store's advisory lock (two at once never take the same one). */
async function nextExchangeNumber(tx: Tx, storeId: number, prefix: string, start: number): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`exchange-number:${storeId}`}, 0))`;
  const rows = await tx.$queryRaw<{ n: bigint | null }[]>`
    SELECT MAX(CAST(substring("number" FROM ${prefix.length + 1}::int) AS BIGINT)) AS n
    FROM "Exchange" WHERE "storeId" = ${storeId} AND "number" ~ ${`^${prefix}[0-9]{1,15}$`}`;
  const top = rows[0]?.n ?? null;
  return `${prefix}${Math.max(start, top === null ? start : Number(top) + 1)}`;
}

/** What the open step adds for a caller (PR 190: the one-trip swap, the re-ship after a try-on). */
export interface OpenHooks {
  /** May the order take an exchange in this state? (null: the default rule) */
  allowState?: (status: string, refusalKey: string | null) => boolean;
}

/**
 * Opens an exchange (REQUESTED) on a delivered order: the policy, the window, the per-piece limit, the excluded
 * categories, the reason, the root cause of a wrong item and the tiers (the piece chosen must be one offered) are
 * checked under the order's row lock. Needs `returns.decide`.
 */
export async function openExchange(deps: OrdersDeps, who: Who, orderId: string, input: unknown, opts: CommandOptions = {}): Promise<OpenExchangeResult> {
  await allow(deps, who, 'returns.decide');
  return openExchangeBy(deps, { storeId: who.storeId, orderId }, staffBy(who.actor, who.ctx), input, opts, { source: 'admin', createdById: who.actor.staffUserId });
}

export async function openExchangeBy(deps: OrdersDeps, r: { storeId: number; orderId: string }, by: By, input: unknown, opts: CommandOptions, meta: { source: string; createdById: string | null; hooks?: OpenHooks }): Promise<OpenExchangeResult> {
  if (!z.uuid().safeParse(r.orderId).success) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  const d = parse(openExchangeInput, input, 'exchange');
  const storeId = r.storeId;
  if (opts.idempotencyKey) {
    // the same press again: the exchange it opened (another order's key is refused)
    const again = await deps.db.exchange.findUnique({ where: { storeId_idempotencyKey: { storeId, idempotencyKey: opts.idempotencyKey } }, select: { id: true, orderId: true } });
    if (again && again.orderId !== r.orderId) throw new OrdersError('IDEMPOTENCY_MISMATCH', 'this key was used for another request', ['idempotencyKey']);
    if (again) return { ...(await resultOf(deps.db, again.id)), replay: true };
  }
  const [engine, causes, excludedSlugs, cs] = await Promise.all([setting(deps, storeId, 'orders.exchange.engine'), setting(deps, storeId, 'orders.exchange.rootCauses'), setting(deps, storeId, 'policy.exchange.excludedCategories'), chargeSettings(deps, storeId)]);
  const v6 = (await isV6(deps, storeId)) ? { passRise: await setting(deps, storeId, 'exchange.passPriceRiseToCustomer') } : null;
  const ourMistakeReason = isOurMistake(d.reason);
  // PR 186: a customer's request from his account has no root cause (he cannot know it); staff find it at QC
  if (d.reason === 'wrong' && engine.rootCauseForWrong && !d.rootCause && meta.source !== 'shop') throw new OrdersError('REASON_REQUIRED', 'a wrong item needs its root cause', ['rootCause']);
  if (d.rootCause && !causes.some((c) => c.key === d.rootCause)) throw new OrdersError('REASON_REQUIRED', 'pick a root cause from the list', ['rootCause']);
  if (ourMistakeReason && (engine.ourMistakePhoto === 'always' || (engine.ourMistakePhoto === 'customer' && meta.source === 'shop')) && !d.photoAssetIds?.length) {
    throw new OrdersError('PHOTO_REQUIRED', 'our mistake needs a photo', ['photoAssetIds']);
  }
  const pieces = d.items.reduce((s, i) => s + (i.quantity ?? 0), 0);
  if (pieces > engine.maxPieces) throw new OrdersError('EXCHANGE_LIMIT', `at most ${engine.maxPieces} pieces in one exchange`, ['items'], { maxPieces: engine.maxPieces });
  if (new Set(d.items.map((i) => i.orderItemId)).size !== d.items.length) throw new OrdersError('INVALID_INPUT', 'each line once', ['items']);

  let createdId = null as string | null;
  await execute(
    deps,
    r,
    by,
    {
      command: 'exchange',
      input: d as unknown as Record<string, unknown>,
      effect: async (tx, lo, _f, { now }) => {
        const o = await withFreePaid(tx, storeId, await tx.order.findUniqueOrThrow({ where: { id: lo.id }, select: ORDER_FACTS }));
        const refusal = await refusalOf(tx, storeId, o);
        const reship = reshipAllowed(o.status, refusal, d.reason, cs.rules.reshipRefusals);
        const allowed = meta.hooks?.allowState ? meta.hooks.allowState(o.status, refusal) : o.status === 'DELIVERED' || o.status === 'PARTIALLY_DELIVERED' || reship;
        if (!allowed) throw new OrdersError('EXCHANGE_CLOSED', 'the parcel is not with the customer', ['status'], { why: 'NOT_DELIVERED' });
        const oneTrip = d.oneTrip ? swapFor(cs.swap, d.reason, o.deliveryBand?.key ?? null) : null;
        if (d.oneTrip && !oneTrip) throw new OrdersError('NOT_EXCHANGEABLE', 'the one-trip size swap is not offered here', ['oneTrip'], { why: 'ONE_TRIP' });
        const excluded = await excludedCategoryIds(tx, storeId, excludedSlugs);
        const lines: { item: ItemFacts; quantity: number; newVariantId: string; receivedSku: string | null; option: ExchangeOption; policy: ExchangePolicy }[] = [];
        let windowEndsAt: Date | null = null;
        for (const x of d.items) {
          const item = await itemOf(tx, storeId, o.id, x.orderItemId);
          const quantity = x.quantity ?? item.quantity;
          if (quantity > item.quantity) throw new OrdersError('INVALID_INPUT', 'more pieces than the line has', ['quantity']);
          const piece = await pieceOf(tx, storeId, item);
          const policy = await exchangePolicyFor(deps, storeId, piece?.productId ?? item.productId ?? '', o.deliveryBand?.key ?? null);
          const window = exchangeWindow(o.deliveredAt, policy.windowHours, now);
          if (!policy.enabled) throw new OrdersError('EXCHANGE_CLOSED', 'exchanges are switched off', [], { why: 'OFF' });
          // a re-ship after a try-on (PR 190) counts from the refusal, the parcel never reached him
          const opened = allowed && o.status === 'RETURNED' ? exchangeWindow(o.returnedAt, policy.windowHours, now) : window;
          if (opened.state !== 'OPEN') throw new OrdersError('EXCHANGE_CLOSED', opened.state === 'UNKNOWN' ? 'the delivered mark is missing; check the courier' : 'the exchange window has passed', ['deliveredAt'], { why: opened.state === 'UNKNOWN' ? 'UNKNOWN' : 'WINDOW' });
          windowEndsAt = opened.endsAt;
          if (!piece || piece.categoryIds.some((c) => excluded.has(c))) throw new OrdersError('NOT_EXCHANGEABLE', 'this piece is in a category that is not exchanged', ['orderItemId'], { why: 'EXCLUDED' });
          if (!policy.covered) throw new OrdersError('NOT_EXCHANGEABLE', 'the exchange rule does not cover this piece', ['orderItemId'], { why: 'NOT_COVERED' });
          if (!policy.reasons.includes(d.reason)) throw new OrdersError('NOT_EXCHANGEABLE', 'the exchange rule does not take this reason', ['reason'], { why: 'REASON' });
          const used = await usedOn(tx, storeId, item.id);
          if (used.open) throw new OrdersError('EXCHANGE_LIMIT', 'this piece already has an exchange open', ['orderItemId'], { why: 'OPEN' });
          if (perItemLeft(policy.perItem, used.counted) === 0) throw new OrdersError('EXCHANGE_LIMIT', 'this piece has no exchanges left', ['orderItemId'], { why: 'LIMIT', perItem: policy.perItem });
          const target = await tx.productVariant.findFirst({ where: { id: x.newVariantId, storeId }, select: { size: { select: { key: true } } } });
          if (!target) throw new OrdersError('NOT_OFFERED', 'this piece is not offered', ['newVariantId']);
          const sizeKey = target.size?.key ?? null;
          if (d.reason === 'size' && sizeKey === piece.sizeKey) throw new OrdersError('INVALID_INPUT', 'a size exchange is to another size', ['newVariantId']);
          const offer = await offerFor(deps, tx, storeId, piece, sizeKey, quantity, excluded);
          const option = offer.options.find((op) => op.variantId === x.newVariantId);
          if (!option) throw new OrdersError('NOT_OFFERED', 'this piece is not among the ones offered (the tiers are strictly in order)', ['newVariantId'], { tier: offer.tier, offered: offer.options.map((op) => op.variantId) });
          lines.push({ item, quantity, newVariantId: x.newVariantId, receivedSku: x.receivedSku ?? null, option, policy });
        }
        const ourMistake = ourMistakeReason && lines.every((l) => l.policy.freeWhenOurMistake);
        const box = moneyBox(
          lines.map((l) => ({ oldUnitMinor: coveredPerPiece(l.item, o), newUnitMinor: l.option.priceMinor, quantity: l.quantity })),
          { ourMistake, ...exchangeCharge({ reason: d.reason, ruleChargeMinor: lines[0]!.policy.chargeMinor, rules: cs.rules, reship, oneTrip }) },
        );
        // CN-028 · PR 614: on ERP contract v6 there are no refunds after delivery (no credit), and a dearer piece is the
        // customer's only with `exchange.passPriceRiseToCustomer` (exchange-v6.ts v6MoneyBox).
        const money = v6 ? v6MoneyBox(box, v6.passRise) : box;
        const number = await nextExchangeNumber(tx, storeId, engine.numberPrefix, engine.numberStart);
        const ex = await tx.exchange.create({
          data: {
            storeId,
            orderId: o.id,
            customerId: o.customerId,
            number,
            status: 'REQUESTED',
            reason: d.reason,
            reasonNote: d.reasonNote ?? null,
            rootCause: d.rootCause ?? null,
            tier: Math.max(...lines.map((l) => l.option.tier)),
            isOurMistake: ourMistake,
            priceDifferenceMinor: money.differenceMinor,
            deliveryChargeMinor: money.chargeMinor,
            walletCreditMinor: money.creditMinor,
            codToCollectMinor: money.codMinor,
            chargeState: money.chargeState,
            chargePayer: money.chargeMinor > 0 ? 'CUSTOMER' : money.chargeState === 'STORE' || money.chargeState === 'FREE_OUR_MISTAKE' ? 'STORE' : null,
            oneTrip: !!oneTrip,
            photoAssetIds: d.photoAssetIds ?? [],
            windowEndsAt,
            bandKey: o.deliveryBand?.key ?? null,
            source: meta.source,
            createdById: meta.createdById,
            idempotencyKey: opts.idempotencyKey ?? null,
            items: {
              create: lines.map((l) => ({
                storeId,
                originalOrderItemId: l.item.id,
                oldVariantId: l.item.variantId,
                oldSku: l.item.sku,
                oldUnitMinor: coveredPerPiece(l.item, o),
                newVariantId: l.newVariantId,
                newSku: l.option.sku,
                newUnitMinor: l.option.priceMinor,
                newName: l.option.productName,
                newColourName: l.option.colourName,
                newSizeLabel: l.option.sizeLabel,
                tier: l.option.tier,
                quantity: l.quantity,
                receivedSku: l.receivedSku,
              })),
            },
          },
          select: { id: true },
        });
        createdId = ex.id;
        return {
          reasonCode: d.reason,
          message: d.reasonNote ?? null,
          eventData: { exchangeId: ex.id, number, rootCause: d.rootCause ?? null, items: lines.map((l) => ({ from: l.item.sku, to: l.option.sku, quantity: l.quantity, tier: l.option.tier, receivedSku: l.receivedSku })), money, ...(reship ? { reship: { refusalKey: refusal } } : {}), ...(oneTrip ? { oneTrip: true } : {}) },
          audit: { before: {}, after: { exchangeId: ex.id, number, money } },
        };
      },
    },
    opts,
  );
  if (!createdId) throw new OrdersError('EXCHANGE_STATE', 'the exchange was not opened');
  return { ...(await resultOf(deps.db, createdId)), replay: false };
}

async function resultOf(db: Db, id: string): Promise<Omit<OpenExchangeResult, 'replay'>> {
  const e = await db.exchange.findUniqueOrThrow({ where: { id }, select: { id: true, number: true, orderId: true, status: true, priceDifferenceMinor: true, walletCreditMinor: true, deliveryChargeMinor: true, codToCollectMinor: true, chargeState: true, isOurMistake: true } });
  return {
    exchangeId: e.id,
    number: e.number,
    orderId: e.orderId,
    status: e.status,
    money: {
      differenceMinor: e.priceDifferenceMinor,
      owedMinor: Math.max(0, e.codToCollectMinor - e.deliveryChargeMinor),
      creditMinor: e.walletCreditMinor,
      chargeMinor: e.deliveryChargeMinor,
      chargeState: (e.chargeState ?? 'NOT_SET') as MoneyBox['chargeState'],
      codMinor: e.codToCollectMinor,
      coveredMinor: 0,
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Decide: approve (the linked exchange order, its stock held, the pick-up opened) or refuse
// ---------------------------------------------------------------------------------------------------------------------

/** Locks one exchange row for the rest of the transaction. */
export async function lockExchange(tx: Tx, storeId: number, id: string) {
  if (!z.uuid().safeParse(id).success) throw new OrdersError('NOT_FOUND', 'no such exchange', ['exchangeId']);
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id"::text AS id FROM "Exchange" WHERE "id" = ${id}::uuid AND "storeId" = ${storeId} FOR UPDATE`;
  if (!rows.length) throw new OrdersError('NOT_FOUND', 'no such exchange', ['exchangeId']);
  return tx.exchange.findUniqueOrThrow({ where: { id }, include: { items: { orderBy: { createdAt: 'asc' } } } });
}
export type LockedExchange = Awaited<ReturnType<typeof lockExchange>>;

/** The exchange order's number: the shop's next order number, under the same advisory lock as the checkout. */
async function nextOrderNumberOf(tx: Tx, storeId: number, prefix: string, start: number): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`order-number:${storeId}`}, 0))`;
  const rows = await tx.$queryRaw<{ n: bigint | null }[]>`
    SELECT MAX(CAST(substring("number" FROM ${prefix.length + 1}::int) AS BIGINT)) AS n
    FROM "Order" WHERE "storeId" = ${storeId} AND "number" ~ ${`^${prefix}[0-9]{1,15}$`}`;
  const top = rows[0]?.n ?? null;
  return `${prefix}${Math.max(start, top === null ? start : Number(top) + 1)}`;
}

/** The flag the linked exchange order carries (Order.flags), so lists and the confirm queue can tell it apart. */
export const EXCHANGE_ORDER_FLAG = 'EXCHANGE';

const decideInput = z.object({ note: z.string().trim().max(1_000).optional() }).strict();
const refuseInput = z.object({ note: z.string().trim().min(1).max(1_000) }).strict();

export interface DecideOptions {
  version?: number;
}

/** A decision on an exchange, written with its timeline row on the original order and its audit row (PR 190 reuses it). */
export async function decideExchange<T>(deps: OrdersDeps, who: Who, id: string, opts: DecideOptions, fn: (tx: Tx, ex: LockedExchange, now: Date, by: By) => Promise<{ action: string; after: Record<string, unknown>; result: T; message?: string | null }>): Promise<T> {
  return decideExchangeBy(deps, who.storeId, staffBy(who.actor, who.ctx), id, opts, fn);
}

/** PR 186: the same step for any actor — the customer's own claim from his account comes through here with his `By`. */
export async function decideExchangeBy<T>(deps: OrdersDeps, storeId: number, by: By, id: string, opts: DecideOptions, fn: (tx: Tx, ex: LockedExchange, now: Date, by: By) => Promise<{ action: string; after: Record<string, unknown>; result: T; message?: string | null }>): Promise<T> {
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const ex = await lockExchange(tx, storeId, id);
    if (opts.version !== undefined && opts.version !== ex.version) throw new OrdersError('STALE', 'the exchange changed since it was read', ['version'], { version: ex.version, status: ex.status });
    const before = { status: ex.status, version: ex.version, chargeState: ex.chargeState, codToCollectMinor: ex.codToCollectMinor };
    const out = await fn(tx, ex, now, by);
    const after = await tx.exchange.update({ where: { id: ex.id }, data: { version: { increment: 1 } }, select: { status: true, version: true, chargeState: true, codToCollectMinor: true } });
    await eventRow(tx, by, { storeId: ex.storeId, orderId: ex.orderId, type: `exchange.${out.action}`, message: out.message ?? null, data: { exchangeId: ex.id, number: ex.number, ...out.after } });
    await auditRow(tx, by, { storeId: ex.storeId, action: `exchange.${out.action}`, entityType: 'Exchange', entityId: ex.id, before, after: { ...after, ...out.after } });
    return out.result;
  }, TX);
}

/**
 * PR 190 — links the courier's return of a refused parcel (REFUSED_AT_DOOR, not yet anyone's pick-up) to a re-ship
 * exchange: its pieces close the exchange's lines, and the exchange takes the step the parcel is at (received, or its
 * QC result when it was checked already). null when there is none (then a pick-up is opened as for any exchange).
 */
async function linkRefusedReturn(tx: Tx, ex: LockedExchange): Promise<{ id: string; exchangeStatus: 'APPROVED' | 'RECEIVED' | 'QC_PASSED' | 'QC_FAILED' } | null> {
  const r = await tx.returnRecord.findFirst({ where: { storeId: ex.storeId, orderId: ex.orderId, kind: 'REFUSED_AT_DOOR', exchangeId: null }, orderBy: { createdAt: 'desc' }, include: { items: true } });
  if (!r) return null;
  await tx.returnRecord.update({ where: { id: r.id }, data: { exchangeId: ex.id, version: { increment: 1 } } });
  const mine: { disposition: string | null }[] = [];
  for (const i of ex.items) {
    const piece = r.items.find((x) => x.orderItemId === i.originalOrderItemId && !x.exchangeItemId);
    if (!piece) continue;
    await tx.returnItem.update({ where: { id: piece.id }, data: { exchangeItemId: i.id } });
    if (piece.disposition) await tx.exchangeItem.update({ where: { id: i.id }, data: { qcStatus: piece.disposition === 'SELLABLE' ? 'GOOD' : 'DAMAGED', restockAction: piece.disposition === 'SELLABLE' ? 'ERP_RETURN' : 'LOSS', receivedSku: piece.scannedSku } });
    mine.push({ disposition: piece.disposition });
  }
  const checked = r.status === 'QC_DONE' || r.status === 'CLOSED';
  const exchangeStatus = checked ? (mine.every((x) => x.disposition === 'SELLABLE') ? 'QC_PASSED' : 'QC_FAILED') : r.status === 'RECEIVED' ? 'RECEIVED' : 'APPROVED';
  return { id: r.id, exchangeStatus };
}

export interface ApproveResult {
  exchangeId: string;
  newOrderId: string;
  newOrderNumber: string;
  returnId: string;
  /** The new parcel was confirmed at once (`orders.exchange.engine.autoConfirm`). */
  confirmed: boolean;
}

/** What placing an exchange's new parcel made (PR 614 reuses it for the ERP path). */
export interface PlacedParcel {
  newOrderId: string;
  newOrderNumber: string;
  returnId: string;
  exchangeStatus: 'APPROVED' | 'RECEIVED' | 'QC_PASSED' | 'QC_FAILED';
  /** Each exchange line and the new order's line made for it. */
  items: { exchangeItemId: string; orderItemId: string }[];
  /** The shop's own stock hold was made (false only in v6, where the ERP holds the piece itself). */
  shopHold: boolean;
  totalMinor: number;
}

export interface ParcelOptions {
  prefix: string;
  start: number;
  note: string | null;
  /** PR 614, ERP contract v6: the ERP took the new piece already; a dearer piece is the customer's only when `passRise`. */
  v6?: { passRise: boolean };
}

/**
 * Inside an approval's transaction: the linked exchange order (PLACED, Cash on Delivery for the money box's amount, the
 * original's contact, address and band) with its stock held on the shared pool under the checkout's row locks
 * (OUT_OF_STOCK refuses and changes nothing), and the pick-up of the old piece (an EXCHANGE_PICKUP return, EXPECTED, the
 * SKU expected back = what is really coming back, SIM-F-022).
 */
export async function placeExchangeParcel(deps: OrdersDeps, who: Who, tx: Tx, ex: LockedExchange, now: Date, by: By, p: ParcelOptions): Promise<PlacedParcel> {
    const o = await tx.order.findUniqueOrThrow({
      where: { id: ex.orderId },
      select: { id: true, number: true, status: true, customerId: true, fulfillmentType: true, currency: true, phone: true, customerName: true, email: true, shippingAddressText: true, backfilledAddress: true, areaId: true, deliveryBandId: true, visitorId: true, lang: true },
    });
    const variants = await tx.productVariant.findMany({ where: { storeId: ex.storeId, id: { in: ex.items.map((i) => i.newVariantId!).filter(Boolean) } }, select: { id: true, productId: true, avgCostMinor: true } });
    const vOf = new Map(variants.map((v) => [v.id, v]));
    // v6 with `exchange.passPriceRiseToCustomer` off: the shop absorbs a dearer piece (the old piece covers it all).
    const lines = ex.items.map((i) => ({ i, ...lineOnNewOrder({ oldUnitMinor: i.oldUnitMinor, newUnitMinor: i.newUnitMinor, quantity: i.quantity }, ex.isOurMistake || (!!p.v6 && !p.v6.passRise)) }));
    const subtotal = lines.reduce((s, l) => s + l.lineTotalMinor, 0);
    const charge = ex.deliveryChargeMinor;
    const number = await nextOrderNumberOf(tx, ex.storeId, p.prefix, p.start);
    const n = await tx.order.create({
      data: {
        storeId: ex.storeId,
        number,
        customerId: o.customerId,
        status: 'PLACED',
        fulfillmentType: o.fulfillmentType,
        source: 'ADMIN',
        currency: o.currency,
        placedAt: now,
        phone: o.phone,
        customerName: o.customerName,
        email: o.email,
        shippingAddressText: o.shippingAddressText,
        backfilledAddress: o.backfilledAddress,
        areaId: o.areaId,
        deliveryBandId: o.deliveryBandId,
        chargeFixed: true,
        subtotalMinor: subtotal,
        discountMinor: 0, // hardcode-ok: the order-level discount of an exchange order is none (the lines carry what the old piece covers)
        deliveryChargeMinor: charge,
        totalMinor: subtotal + charge,
        codAmountMinor: subtotal + charge,
        paidMinor: 0,
        paymentMethod: 'COD',
        visitorId: o.visitorId,
        // review R3 (customer minor 2): the new parcel's messages go in the language he ordered in
        lang: o.lang,
        idempotencyKey: `exchange:${ex.id}`,
        flags: [EXCHANGE_ORDER_FLAG],
      },
      select: { id: true },
    });
    const newItems: { exchangeItemId: string; orderItemId: string }[] = [];
    let shopHold = true;
    for (const l of lines) {
      const v = vOf.get(l.i.newVariantId!);
      const oi = await tx.orderItem.create({
        data: {
          storeId: ex.storeId,
          orderId: n.id,
          variantId: l.i.newVariantId,
          productId: v?.productId ?? null,
          sku: l.i.newSku ?? '',
          productName: l.i.newName ?? l.i.newSku ?? '',
          colourName: l.i.newColourName,
          sizeLabel: l.i.newSizeLabel,
          quantity: l.i.quantity,
          unitPriceMinor: l.unitPriceMinor,
          discountMinor: l.discountMinor,
          lineTotalMinor: l.lineTotalMinor,
          unitCostMinor: v?.avgCostMinor ?? null,
          addedVia: 'exchange',
        },
        select: { id: true },
      });
      newItems.push({ exchangeItemId: l.i.id, orderItemId: oi.id });
      try {
        await holdOrderUnits(inventoryOf(deps), { storeId: ex.storeId, orderId: n.id, variantId: l.i.newVariantId!, quantity: l.i.quantity }, { tx });
      } catch (e) {
        // v6: the ERP has already taken the piece for this exchange (its own live stock); the shop's mirror follows.
        if (e instanceof InventoryError && e.code === 'OUT_OF_STOCK' && p.v6) shopHold = false;
        else if (e instanceof InventoryError && e.code === 'OUT_OF_STOCK') throw new OrdersError('OUT_OF_STOCK', 'the new piece is no longer free', e.details);
        else throw e;
      }
    }
    await eventRow(tx, by, { storeId: ex.storeId, orderId: n.id, type: 'order.placed', to: 'PLACED', data: { exchange: { id: ex.id, number: ex.number, fromOrderId: o.id, fromNumber: o.number } } });
    await auditRow(tx, by, { storeId: ex.storeId, action: 'order.exchangePlaced', entityType: 'Order', entityId: n.id, before: null, after: { number, exchangeId: ex.id, fromOrderId: o.id, totalMinor: subtotal + charge } });
    // review R3 (M1): the refused parcel's money its old pieces cover pays for the new parcel, so its open refund request
    // is cut by as much in this transaction (never refunded twice); money a person already approved or paid back is not
    // free, and then the approval is refused
    if (o.status === 'RETURNED') {
      const usedMinor = ex.items.reduce((sum, i) => sum + Math.max(0, i.oldUnitMinor) * i.quantity, 0);
      const settled = await settleReturnRefundsForExchange(tx, deps, ex.storeId, o.id, usedMinor, { exchangeId: ex.id, number: ex.number, newOrderNumber: number });
      if (settled.shortMinor > 0) throw new OrdersError('REFUND_TAKEN', "part of the refused parcel's money is already approved or paid back as a refund; withdraw that refund or refuse the exchange", ['refund'], { shortMinor: settled.shortMinor });
    }
    // PR 190 (SIM-F-021): a re-ship after a try-on — the refused parcel is already on its way back (its courier return,
    // PR 189) and becomes this exchange's pick-up; the exchange moves on with it (checked already → its QC result).
    const linked = o.status === 'RETURNED' ? await linkRefusedReturn(tx, ex) : null;
    const ret = linked ?? await tx.returnRecord.create({
      data: {
        storeId: ex.storeId,
        orderId: o.id,
        customerId: o.customerId,
        kind: 'EXCHANGE_PICKUP',
        reasonCode: ex.reason,
        status: 'EXPECTED',
        ourFault: ex.isOurMistake,
        exchangeId: ex.id,
        idempotencyKey: `exchange:${ex.id}:pickup`,
        items: {
          create: ex.items.map((i) => ({ storeId: ex.storeId, orderItemId: i.originalOrderItemId, quantity: i.quantity, variantId: i.oldVariantId, expectedSku: i.receivedSku ?? i.oldSku, exchangeItemId: i.id })),
        },
      },
      select: { id: true },
    });
    // v6: no refunds after delivery, so no credit is ever due; the customer pays what the new parcel says.
    await tx.exchange.update({ where: { id: ex.id }, data: { status: linked?.exchangeStatus ?? 'APPROVED', newOrderId: n.id, decidedById: who.actor.staffUserId, decidedAt: now, decisionNote: p.note, ...(p.v6 ? { walletCreditMinor: 0, codToCollectMinor: subtotal + charge } : {}) } });
    return { newOrderId: n.id, newOrderNumber: number, returnId: ret.id, exchangeStatus: linked?.exchangeStatus ?? 'APPROVED', items: newItems, shopHold, totalMinor: subtotal + charge };
}

/**
 * Approves a requested exchange (ERP contract v5; in v6 the ERP path of PR 614 approves it: exchange-v6.ts): the new
 * parcel and the pick-up of the old piece (placeExchangeParcel). Needs `returns.decide`.
 */
export async function approveExchange(deps: OrdersDeps, who: Who, id: string, input: unknown = {}, opts: DecideOptions = {}): Promise<ApproveResult> {
  await allow(deps, who, 'returns.decide');
  // CN-028 · PR 614: in v6 the exchange goes through the store's ERP first (its live stock, its new order).
  if (await isV6(deps, who.storeId)) throw new OrdersError('ERP_MODEL', 'on ERP contract v6 an exchange is approved through the ERP', ['erp.model'], { model: 'v6', use: 'exchange.approve' });
  const d = parse(decideInput, input, 'approval');
  const [prefix, start, engine] = await Promise.all([setting(deps, who.storeId, 'checkout.order.numberPrefix'), setting(deps, who.storeId, 'checkout.order.numberStart'), setting(deps, who.storeId, 'orders.exchange.engine')]);
  const res = await decideExchange<ApproveResult>(deps, who, id, opts, async (tx, ex, now, by) => {
    if (ex.status !== 'REQUESTED') throw new OrdersError('EXCHANGE_STATE', 'only a requested exchange is approved', ['status'], { status: ex.status });
    const placed = await placeExchangeParcel(deps, who, tx, ex, now, by, { prefix, start, note: d.note ?? null });
    return { action: 'approved', message: d.note ?? null, after: { status: 'APPROVED', newOrderId: placed.newOrderId, newOrderNumber: placed.newOrderNumber, returnId: placed.returnId }, result: { exchangeId: ex.id, newOrderId: placed.newOrderId, newOrderNumber: placed.newOrderNumber, returnId: placed.returnId, confirmed: false } };
  });
  if (engine.autoConfirm) {
    try {
      await confirmBy(deps, { storeId: who.storeId, orderId: res.newOrderId }, staffBy(who.actor, who.ctx));
      return { ...res, confirmed: true };
    } catch {
      // the new parcel waits in the confirm queue like any order; the approval stands
      return res;
    }
  }
  return res;
}

/**
 * PR 187 — completes an exchange once its old piece is checked (QC_PASSED, or QC_FAILED after a person has looked).
 * Needs `returns.decide`. A credit due to the customer is only noted (the wallet request: follow-up 440).
 */
export async function completeExchange(deps: OrdersDeps, who: Who, id: string, input: unknown = {}, opts: DecideOptions = {}): Promise<{ exchangeId: string; status: string }> {
  await allow(deps, who, 'returns.decide');
  // CN-028 · PR 614: in v6 the ERP settles the exchange (settled, billed, credited or cancelled), never the shop.
  if (await isV6(deps, who.storeId)) throw new OrdersError('ERP_MODEL', 'on ERP contract v6 the ERP settles an exchange once the owner checks the old piece', ['erp.model'], { model: 'v6' });
  const d = parse(decideInput, input, 'completion');
  return decideExchange(deps, who, id, opts, async (tx, ex) => {
    if (ex.status !== 'QC_PASSED' && ex.status !== 'QC_FAILED') throw new OrdersError('EXCHANGE_STATE', 'an exchange is completed after its old piece is checked', ['status'], { status: ex.status });
    if (ex.status === 'QC_FAILED' && !d.note) throw new OrdersError('INVALID_INPUT', 'a failed check needs a note to complete', ['note']);
    await tx.exchange.update({ where: { id: ex.id }, data: { status: 'COMPLETED' } });
    return { action: 'completed', message: d.note ?? null, after: { status: 'COMPLETED', from: ex.status }, result: { exchangeId: ex.id, status: 'COMPLETED' } };
  });
}

/** Refuses a requested exchange with the reason the customer is told. Needs `returns.decide`. */
export async function refuseExchange(deps: OrdersDeps, who: Who, id: string, input: unknown, opts: DecideOptions = {}): Promise<{ exchangeId: string; status: string }> {
  await allow(deps, who, 'returns.decide');
  const d = parse(refuseInput, input, 'refusal');
  return decideExchange(deps, who, id, opts, async (tx, ex, now) => {
    if (ex.status !== 'REQUESTED') throw new OrdersError('EXCHANGE_STATE', 'only a requested exchange is refused', ['status'], { status: ex.status });
    await tx.exchange.update({ where: { id: ex.id }, data: { status: 'REJECTED', decidedById: who.actor.staffUserId, decidedAt: now, decisionNote: d.note } });
    return { action: 'refused', message: d.note, after: { status: 'REJECTED' }, result: { exchangeId: ex.id, status: 'REJECTED' } };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading: the board and one case
// ---------------------------------------------------------------------------------------------------------------------

export interface ExchangeView {
  id: string;
  number: string;
  status: string;
  version: number;
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  reason: string;
  reasonNote: string | null;
  rootCause: string | null;
  tier: number;
  isOurMistake: boolean;
  money: { differenceMinor: number; creditMinor: number; chargeMinor: number; codMinor: number; chargeState: string | null };
  chargePayer: string | null;
  claimState: string | null;
  claimNote: string | null;
  waiveReason: string | null;
  oneTrip: boolean;
  windowEndsAt: string | null;
  newOrderId: string | null;
  newOrderNumber: string | null;
  refundId: string | null;
  decisionNote: string | null;
  createdAt: string;
  items: { id: string; oldSku: string | null; oldUnitMinor: number; newVariantId: string | null; newSku: string | null; newName: string | null; newColourName: string | null; newSizeLabel: string | null; newUnitMinor: number; quantity: number; tier: number | null; receivedSku: string | null; qcStatus: string | null; restockAction: string | null }[];
  /** PR 187: the old piece's pick-up (an EXCHANGE_PICKUP return; a re-ship's refused parcel, PR 190) and where each piece stands after QC. */
  pickup: { returnId: string; status: string; version: number; items: { id: string; expectedSku: string | null; scannedSku: string | null; disposition: string | null; dispositionState: string | null; lossReason: string | null }[] } | null;
}

const VIEW_INCLUDE = { items: { orderBy: { createdAt: 'asc' as const } } };

async function viewsOf(db: Db, rows: Prisma.ExchangeGetPayload<{ include: typeof VIEW_INCLUDE }>[]): Promise<ExchangeView[]> {
  const ids = [...new Set(rows.flatMap((r) => [r.orderId, r.newOrderId].filter((x): x is string => !!x)))];
  const orders = new Map((await db.order.findMany({ where: { id: { in: ids } }, select: { id: true, number: true, customerName: true } })).map((o) => [o.id, o]));
  const pickups = new Map(
    (
      await db.returnRecord.findMany({
        // the pick-up of the old piece, or (PR 190, a re-ship) the refused parcel's own return
        where: { exchangeId: { in: rows.map((r) => r.id) }, kind: { in: ['EXCHANGE_PICKUP', 'REFUSED_AT_DOOR'] } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, exchangeId: true, status: true, version: true, items: { orderBy: { createdAt: 'asc' }, select: { id: true, expectedSku: true, scannedSku: true, disposition: true, dispositionState: true, lossReason: true } } },
      })
    ).map((r) => [r.exchangeId!, r]),
  );
  return rows.map((e) => ({
    id: e.id,
    number: e.number,
    status: e.status,
    version: e.version,
    orderId: e.orderId,
    orderNumber: orders.get(e.orderId)?.number ?? '',
    customerName: orders.get(e.orderId)?.customerName ?? null,
    reason: e.reason,
    reasonNote: e.reasonNote,
    rootCause: e.rootCause,
    tier: e.tier,
    isOurMistake: e.isOurMistake,
    money: { differenceMinor: e.priceDifferenceMinor, creditMinor: e.walletCreditMinor, chargeMinor: e.deliveryChargeMinor, codMinor: e.codToCollectMinor, chargeState: e.chargeState },
    chargePayer: e.chargePayer,
    claimState: e.claimState,
    claimNote: e.claimNote,
    waiveReason: e.waiveReason,
    oneTrip: e.oneTrip,
    windowEndsAt: e.windowEndsAt?.toISOString() ?? null,
    newOrderId: e.newOrderId,
    newOrderNumber: e.newOrderId ? (orders.get(e.newOrderId)?.number ?? null) : null,
    refundId: e.refundId,
    decisionNote: e.decisionNote,
    createdAt: e.createdAt.toISOString(),
    items: e.items.map((i) => ({ id: i.id, oldSku: i.oldSku, oldUnitMinor: i.oldUnitMinor, newVariantId: i.newVariantId, newSku: i.newSku, newName: i.newName, newColourName: i.newColourName, newSizeLabel: i.newSizeLabel, newUnitMinor: i.newUnitMinor, quantity: i.quantity, tier: i.tier, receivedSku: i.receivedSku, qcStatus: i.qcStatus, restockAction: i.restockAction })),
    pickup: (() => {
      const p = pickups.get(e.id);
      return p ? { returnId: p.id, status: p.status, version: p.version, items: p.items } : null;
    })(),
  }));
}

export const EXCHANGE_STATUSES = ['REQUESTED', 'APPROVED', 'PICKUP_BOOKED', 'RECEIVED', 'QC_PASSED', 'QC_FAILED', 'COMPLETED', 'REJECTED', 'CANCELLED'] as const;
const listInput = z.object({ status: z.array(z.enum(EXCHANGE_STATUSES)).max(9).optional(), orderId: z.uuid().optional(), limit: z.int().min(1).max(200).optional() }).strict();

/** The exchanges of the store, newest first (the board), or of one order. Needs `returns.view`. */
export async function listExchanges(deps: OrdersDeps, who: Who, input: unknown = {}): Promise<ExchangeView[]> {
  await allow(deps, who, 'returns.view');
  const d = parse(listInput, input, 'filter');
  const rows = await deps.db.exchange.findMany({
    where: { storeId: who.storeId, ...(d.status?.length ? { status: { in: d.status } } : {}), ...(d.orderId ? { orderId: d.orderId } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: d.limit ?? 100,
    include: VIEW_INCLUDE,
  });
  return viewsOf(deps.db, rows);
}

/** One exchange. Needs `returns.view`. */
export async function exchangeDetail(deps: OrdersDeps, who: Who, id: string): Promise<ExchangeView> {
  await allow(deps, who, 'returns.view');
  if (!z.uuid().safeParse(id).success) throw new OrdersError('NOT_FOUND', 'no such exchange', ['exchangeId']);
  const row = await deps.db.exchange.findFirst({ where: { id, storeId: who.storeId }, include: VIEW_INCLUDE });
  if (!row) throw new OrdersError('NOT_FOUND', 'no such exchange', ['exchangeId']);
  return (await viewsOf(deps.db, [row]))[0]!;
}
