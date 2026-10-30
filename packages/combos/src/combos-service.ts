// PR 89, 90 — fixed combos: ready-made sets with one price (demo "Fixed combos & customer sets"). Made and changed with
// `combos.write`; the set price is the owner's decision and needs `combos.prices` (CLAUDE.md rule 6); switching a
// combo on or off needs `combos.publish`. Nothing is deleted: a combo switched off (or past its end) moves to the
// Archive and its page keeps opening in the ended state; "Turn on again" brings it back on the same link. A slot taken
// out of a combo is archived. Every change writes an audit row in the same transaction.
import type { Prisma } from '@extas/db/client';
import { actorId, allow, allowPrice, found, logChange, nowOf, parse, setting, TX, type CombosDeps, type Db, type Who } from './context';
import { setFloorMinor } from '@extas/catalogue';
import { CombosError } from './errors';
import { colourPrice, productFacts, type ProductFact } from './facts';
import {
  comboState,
  daysFromWindow,
  fixedComboInputSchema,
  pieceCountOf,
  readiness,
  setPricing,
  windowFromDays,
  type ComboState,
  type FixedComboData,
  type FixedComboInput,
  type RoundingRule,
  type SetPricing,
} from './model';

export interface ComboItemView {
  position: number;
  productId: string | null;
  productSlug: string | null;
  productNameEn: string | null;
  productNameBn: string | null;
  colourIds: string[];
  sizeIds: string[];
  fixedVariantId: string | null;
  quantity: number;
  labelEn: string | null;
  labelBn: string | null;
  /** The piece's own price on the card: the fixed variant's, else the lowest of the allowed colours. */
  priceMinor: number | null;
}

export interface ComboView {
  id: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  descriptionEn: string | null;
  descriptionBn: string | null;
  type: string;
  status: string;
  state: ComboState;
  startsOn: string | null;
  endsOn: string | null;
  autoApply: boolean;
  sameColour: boolean;
  isFeatured: boolean;
  listTemplateKey: string | null;
  pageTemplateKey: string | null;
  bagTemplateKey: string | null;
  setPriceMinor: number | null;
  pieceCount: number;
  /** One product taking several pieces (a colour pair): the same-colour switch (K11) applies. */
  oneProduct: boolean;
  items: ComboItemView[];
  pricing: SetPricing;
  /** Why it cannot go on sale (empty = it can). */
  blocking: string[];
  setPhotoAssetId: string | null;
  autoRuleId: string | null;
  version: number;
  updatedAt: string;
}

export const comboSelect = {
  id: true,
  slug: true,
  nameEn: true,
  nameBn: true,
  descriptionEn: true,
  descriptionBn: true,
  type: true,
  status: true,
  startsAt: true,
  endsAt: true,
  autoApply: true,
  sameColour: true,
  isFeatured: true,
  listTemplateKey: true,
  pageTemplateKey: true,
  bagTemplateKey: true,
  setPriceMinor: true,
  pieceCount: true,
  setPhotoAssetId: true,
  autoRuleId: true,
  pieceKey: true,
  sortRank: true,
  version: true,
  updatedAt: true,
  items: {
    where: { archivedAt: null },
    select: { position: true, productId: true, allowedColourIds: true, allowedSizeIds: true, fixedVariantId: true, quantity: true, labelEn: true, labelBn: true },
    orderBy: { position: 'asc' },
  },
} satisfies Prisma.ComboSelect;

export type ComboRow = Prisma.ComboGetPayload<{ select: typeof comboSelect }>;

export async function roundingOf(deps: Pick<CombosDeps, 'settings'>, storeId: number): Promise<RoundingRule> {
  const [stepMinor, direction] = await Promise.all([setting(deps, storeId, 'combos.price.roundingStepMinor'), setting(deps, storeId, 'combos.price.rounding')]);
  return { stepMinor, direction };
}

export function itemPrice(item: { fixedVariantId: string | null; allowedColourIds: readonly string[] }, p: ProductFact | undefined): number | null {
  if (!p) return null;
  if (item.fixedVariantId) return p.variants.find((v) => v.id === item.fixedVariantId)?.priceMinor ?? null;
  if (!item.allowedColourIds.length) return colourPrice(p, null);
  const prices = item.allowedColourIds.map((c) => colourPrice(p, c)).filter((x): x is number => x !== null);
  return prices.length ? Math.min(...prices) : null;
}

export function toComboView(c: ComboRow, facts: ReadonlyMap<string, ProductFact>, ctx: { now: Date; timeZone: string; rounding: RoundingRule; priceRule?: Parameters<typeof setPricing>[0] }): ComboView {
  const items: ComboItemView[] = c.items.map((i) => {
    const p = i.productId ? facts.get(i.productId) : undefined;
    return {
      position: i.position,
      productId: i.productId,
      productSlug: p?.slug ?? null,
      productNameEn: p?.nameEn ?? null,
      productNameBn: p?.nameBn ?? null,
      colourIds: i.allowedColourIds,
      sizeIds: i.allowedSizeIds,
      fixedVariantId: i.fixedVariantId,
      quantity: i.quantity,
      labelEn: i.labelEn,
      labelBn: i.labelBn,
      priceMinor: itemPrice(i, p),
    };
  });
  const pieces = items.map((i) => ({ priceMinor: i.priceMinor, quantity: i.quantity }));
  const pricing = setPricing(ctx.priceRule ?? { mode: 'FIXED', setMinor: c.setPriceMinor }, pieces, ctx.rounding);
  const productIds = new Set(items.map((i) => i.productId));
  return {
    id: c.id,
    slug: c.slug,
    nameEn: c.nameEn,
    nameBn: c.nameBn,
    descriptionEn: c.descriptionEn,
    descriptionBn: c.descriptionBn,
    type: c.type,
    status: c.status,
    state: comboState(c, ctx.now),
    ...daysFromWindow(c, ctx.timeZone),
    autoApply: c.autoApply,
    sameColour: c.sameColour,
    isFeatured: c.isFeatured,
    listTemplateKey: c.listTemplateKey,
    pageTemplateKey: c.pageTemplateKey,
    bagTemplateKey: c.bagTemplateKey,
    setPriceMinor: c.setPriceMinor,
    pieceCount: c.pieceCount,
    oneProduct: productIds.size === 1 && pieceCountOf(items) > 1,
    items,
    pricing,
    blocking: c.autoRuleId ? (pricing.payMinor === null ? ['NO_SET_PRICE'] : []) : readiness({ setPriceMinor: c.setPriceMinor, items, pieces }),
    setPhotoAssetId: c.setPhotoAssetId,
    autoRuleId: c.autoRuleId,
    version: c.version,
    updatedAt: c.updatedAt.toISOString(),
  };
}

async function viewsOf(deps: CombosDeps, storeId: number, rows: ComboRow[]): Promise<ComboView[]> {
  const ids = rows.flatMap((r) => r.items.flatMap((i) => (i.productId ? [i.productId] : [])));
  const [facts, rounding, timeZone] = await Promise.all([productFacts(deps, storeId, ids), roundingOf(deps, storeId), setting(deps, storeId, 'store.timeZone')]);
  const now = nowOf(deps);
  return rows.map((r) => toComboView(r, facts, { now, timeZone, rounding }));
}

/** The store's fixed combos (generated pairs are listed under their rule), newest first; archived ones too. */
export async function listCombos(deps: CombosDeps, who: Who): Promise<ComboView[]> {
  await allow(deps, who, 'combos.read');
  const rows = await deps.db.combo.findMany({ where: { storeId: who.storeId, autoRuleId: null }, select: comboSelect, orderBy: [{ sortRank: 'asc' }, { createdAt: 'desc' }] });
  return viewsOf(deps, who.storeId, rows);
}

export async function getCombo(deps: CombosDeps, who: Who, id: string): Promise<ComboView> {
  await allow(deps, who, 'combos.read');
  const row = found(await deps.db.combo.findFirst({ where: { id, storeId: who.storeId }, select: comboSelect }), 'combo');
  return (await viewsOf(deps, who.storeId, [row]))[0]!;
}

/** Every slot's product and variant belongs to the store, and its colours and sizes to the product. */
async function checkItems(db: Db, storeId: number, d: FixedComboData): Promise<void> {
  const ids = [...new Set(d.items.map((i) => i.productId))];
  const products = await db.product.findMany({
    where: { storeId, id: { in: ids }, archivedAt: null },
    select: { id: true, colours: { where: { archivedAt: null }, select: { colourId: true } }, variants: { where: { archivedAt: null }, select: { id: true, sizeId: true } } },
  });
  const by = new Map(products.map((p) => [p.id, p]));
  const bad: string[] = [];
  d.items.forEach((i, n) => {
    const p = by.get(i.productId);
    if (!p) return bad.push(`items.${n}.productId: not a product of this store`);
    const colours = new Set(p.colours.map((c) => c.colourId));
    if (i.colourIds.some((c) => !colours.has(c))) bad.push(`items.${n}.colourIds: not a colour of the product`);
    const sizes = new Set(p.variants.map((v) => v.sizeId));
    if (i.sizeIds.some((s) => !sizes.has(s))) bad.push(`items.${n}.sizeIds: not a size of the product`);
    if (i.fixedVariantId && !p.variants.some((v) => v.id === i.fixedVariantId)) bad.push(`items.${n}.fixedVariantId: not a variant of the product`);
  });
  if (bad.length) throw new CombosError('INVALID_INPUT', 'the combo’s pieces are not valid', bad);
}

const itemRows = (storeId: number, comboId: string, d: FixedComboData) =>
  d.items.map((i, n) => ({
    storeId,
    comboId,
    position: n + 1,
    productId: i.productId,
    allowedColourIds: i.colourIds,
    allowedSizeIds: i.sizeIds,
    fixedVariantId: i.fixedVariantId,
    quantity: i.quantity,
    labelEn: i.labelEn,
    labelBn: i.labelBn,
  }));

const sameItems = (rows: ComboRow['items'], d: FixedComboData) =>
  rows.length === d.items.length &&
  rows.every((r, n) => {
    const i = d.items[n]!;
    return r.productId === i.productId && r.fixedVariantId === i.fixedVariantId && r.quantity === i.quantity && r.labelEn === i.labelEn && r.labelBn === i.labelBn && r.allowedColourIds.join() === i.colourIds.join() && r.allowedSizeIds.join() === i.sizeIds.join();
  });

async function slugFree(db: Db, storeId: number, slug: string, except?: string): Promise<void> {
  const other = await db.combo.findFirst({ where: { storeId, slug, ...(except ? { id: { not: except } } : {}) }, select: { id: true } });
  if (other) throw new CombosError('SLUG_TAKEN', 'that combo link is already used', ['slug']);
}

/** PR 609 (CN-028): a set price below the floor over its pieces' buying prices is refused (`catalogue.floor.minMarginPercent`). */
async function assertSetFloor(db: Db, deps: CombosDeps, storeId: number, items: readonly { productId: string | null; fixedVariantId: string | null; quantity: number }[], setPriceMinor: number | null): Promise<void> {
  if (setPriceMinor === null) return;
  const floor = await setFloorMinor(db, deps, { storeId }, items.map((i) => ({ productId: i.productId, fixedVariantId: i.fixedVariantId, quantity: i.quantity })));
  if (floor !== null && setPriceMinor < floor) throw new CombosError('BELOW_FLOOR', 'the set price is below the lowest margin over the buying prices', [`floor: ${floor}`]);
}

/** A new fixed combo. It starts as a draft (not on sale) until someone with `combos.publish` switches it on. */
export async function createCombo(deps: CombosDeps, who: Who, input: FixedComboInput): Promise<ComboView> {
  await allow(deps, who, 'combos.write');
  const d = parse(fixedComboInputSchema, input, 'combo');
  if (d.setPriceMinor !== null) await allowPrice(deps, who);
  const timeZone = await setting(deps, who.storeId, 'store.timeZone');
  const id = await deps.db.$transaction(async (tx) => {
    await slugFree(tx, who.storeId, d.slug);
    await checkItems(tx, who.storeId, d);
    await assertSetFloor(tx, deps, who.storeId, d.items, d.setPriceMinor);
    const c = await tx.combo.create({
      data: {
        storeId: who.storeId,
        slug: d.slug,
        nameEn: d.nameEn,
        nameBn: d.nameBn,
        descriptionEn: d.descriptionEn,
        descriptionBn: d.descriptionBn,
        type: d.type,
        pieceCount: pieceCountOf(d.items),
        setPriceMinor: d.setPriceMinor,
        autoApply: d.autoApply,
        sameColour: d.sameColour,
        isFeatured: d.isFeatured,
        listTemplateKey: d.listTemplateKey,
        pageTemplateKey: d.pageTemplateKey,
        bagTemplateKey: d.bagTemplateKey,
        ...windowFromDays(d.startsOn, d.endsOn, timeZone),
        status: 'DRAFT',
        createdById: actorId(who),
        updatedById: actorId(who),
      },
      select: { id: true },
    });
    await tx.comboItem.createMany({ data: itemRows(who.storeId, c.id, d) });
    await logChange(tx, who, { action: 'combo.create', entityType: 'Combo', entityId: c.id, before: null, after: { ...d } });
    return c.id;
  }, TX);
  return getCombo(deps, who, id);
}

/** Changes a fixed combo (the whole form, with the version it was opened at). A changed price needs `combos.prices`. */
export async function updateCombo(deps: CombosDeps, who: Who, id: string, input: FixedComboInput, version?: number): Promise<ComboView> {
  await allow(deps, who, 'combos.write');
  const d = parse(fixedComboInputSchema, input, 'combo');
  const timeZone = await setting(deps, who.storeId, 'store.timeZone');
  const before = found(await deps.db.combo.findFirst({ where: { id, storeId: who.storeId }, select: comboSelect }), 'combo');
  if (before.autoRuleId) throw new CombosError('INVALID_INPUT', 'a generated pair is changed through its rule', ['autoRuleId']);
  if (d.setPriceMinor !== before.setPriceMinor) await allowPrice(deps, who);
  if (version !== undefined && version !== before.version) throw new CombosError('STALE', 'the combo was changed by someone else', [`version ${before.version}`]);
  await deps.db.$transaction(async (tx) => {
    await slugFree(tx, who.storeId, d.slug, id);
    await checkItems(tx, who.storeId, d);
    await assertSetFloor(tx, deps, who.storeId, d.items, d.setPriceMinor);
    const moved = await tx.combo.updateMany({
      where: { id, version: before.version },
      data: {
        slug: d.slug,
        nameEn: d.nameEn,
        nameBn: d.nameBn,
        descriptionEn: d.descriptionEn,
        descriptionBn: d.descriptionBn,
        type: d.type,
        pieceCount: pieceCountOf(d.items),
        setPriceMinor: d.setPriceMinor,
        autoApply: d.autoApply,
        sameColour: d.sameColour,
        isFeatured: d.isFeatured,
        listTemplateKey: d.listTemplateKey,
        pageTemplateKey: d.pageTemplateKey,
        bagTemplateKey: d.bagTemplateKey,
        ...windowFromDays(d.startsOn, d.endsOn, timeZone),
        updatedById: actorId(who),
        version: { increment: 1 },
      },
    });
    if (moved.count !== 1) throw new CombosError('STALE', 'the combo was changed by someone else');
    if (!sameItems(before.items, d)) {
      await tx.comboItem.updateMany({ where: { comboId: id, archivedAt: null }, data: { archivedAt: nowOf(deps) } });
      await tx.comboItem.createMany({ data: itemRows(who.storeId, id, d) });
    }
    await logChange(tx, who, { action: 'combo.update', entityType: 'Combo', entityId: id, before, after: { ...d } });
  }, TX);
  return getCombo(deps, who, id);
}

/** Just the set price (the card's price box). Owner's decision: `combos.prices`. */
export async function setComboPrice(deps: CombosDeps, who: Who, id: string, setPriceMinor: number | null, version?: number): Promise<ComboView> {
  await allow(deps, who, 'combos.write');
  await allowPrice(deps, who);
  if (setPriceMinor !== null && (!Number.isInteger(setPriceMinor) || setPriceMinor < 1)) throw new CombosError('INVALID_INPUT', 'a set price is a whole amount above zero', ['setPriceMinor']);
  const before = found(await deps.db.combo.findFirst({ where: { id, storeId: who.storeId, autoRuleId: null }, select: { id: true, setPriceMinor: true, version: true } }), 'combo');
  if (version !== undefined && version !== before.version) throw new CombosError('STALE', 'the combo was changed by someone else', [`version ${before.version}`]);
  if (before.setPriceMinor !== setPriceMinor) {
    await deps.db.$transaction(async (tx) => {
      const items = await tx.comboItem.findMany({ where: { comboId: id, archivedAt: null }, select: { productId: true, fixedVariantId: true, quantity: true } });
      await assertSetFloor(tx, deps, who.storeId, items, setPriceMinor);
      const moved = await tx.combo.updateMany({ where: { id, version: before.version }, data: { setPriceMinor, updatedById: actorId(who), version: { increment: 1 } } });
      if (moved.count !== 1) throw new CombosError('STALE', 'the combo was changed by someone else');
      await logChange(tx, who, { action: 'combo.price', entityType: 'Combo', entityId: id, before: { setPriceMinor: before.setPriceMinor }, after: { setPriceMinor } });
    }, TX);
  }
  return getCombo(deps, who, id);
}

/** The card's switches: auto-apply in the bag, and (K11) the same colour twice. */
export async function setComboFlags(deps: CombosDeps, who: Who, id: string, flags: { autoApply?: boolean; sameColour?: boolean }): Promise<ComboView> {
  await allow(deps, who, 'combos.write');
  const before = found(await deps.db.combo.findFirst({ where: { id, storeId: who.storeId, autoRuleId: null }, select: { id: true, autoApply: true, sameColour: true } }), 'combo');
  const data: { autoApply?: boolean; sameColour?: boolean } = {};
  if (typeof flags.autoApply === 'boolean' && flags.autoApply !== before.autoApply) data.autoApply = flags.autoApply;
  if (typeof flags.sameColour === 'boolean' && flags.sameColour !== before.sameColour) data.sameColour = flags.sameColour;
  if (Object.keys(data).length) {
    await deps.db.$transaction(async (tx) => {
      await tx.combo.update({ where: { id }, data: { ...data, updatedById: actorId(who), version: { increment: 1 } } });
      await logChange(tx, who, { action: 'combo.flags', entityType: 'Combo', entityId: id, before: { autoApply: before.autoApply, sameColour: before.sameColour }, after: data });
    }, TX);
  }
  return getCombo(deps, who, id);
}

/**
 * Switches a fixed combo on (it must be ready: pieces with prices and a set price) or off (it moves to the Archive;
 * its page keeps opening in the ended state). Switching on an ended combo clears an end date that has passed, so it
 * comes back on the same link.
 */
export async function setComboActive(deps: CombosDeps, who: Who, id: string, on: boolean): Promise<ComboView> {
  await allow(deps, who, 'combos.publish');
  const view = await getCombo(deps, who, id);
  if (view.autoRuleId) throw new CombosError('INVALID_INPUT', 'a generated pair follows its rule', ['autoRuleId']);
  const now = nowOf(deps);
  if (on && view.blocking.length) throw new CombosError('NOT_READY', 'the combo cannot go on sale yet', view.blocking);
  const row = found(await deps.db.combo.findFirst({ where: { id, storeId: who.storeId }, select: { status: true, endsAt: true, endedAt: true } }), 'combo');
  const data: Prisma.ComboUpdateInput = on
    ? { status: 'RUNNING', endedAt: null, ...(row.endsAt && row.endsAt <= now ? { endsAt: null } : {}) }
    : { status: 'PAUSED', endedAt: now };
  if ((on && row.status === 'RUNNING' && !(row.endsAt && row.endsAt <= now)) || (!on && row.status === 'PAUSED')) return view;
  await deps.db.$transaction(async (tx) => {
    await tx.combo.update({ where: { id }, data: { ...data, updatedById: actorId(who), version: { increment: 1 } } });
    await logChange(tx, who, { action: on ? 'combo.on' : 'combo.off', entityType: 'Combo', entityId: id, before: row, after: data });
  }, TX);
  return getCombo(deps, who, id);
}
