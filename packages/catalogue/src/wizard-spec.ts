// S28 · PR 1030 — the add-product wizard's own answers on a draft (ProductWizardSpec). Reading needs `catalogue.read`,
// changing needs `catalogue.write` (audited); the selling price goes through the product's own variants (the same rules and
// PIN as the product screen). A draft stays a draft: nothing here shows anything to a customer.
import { z } from 'zod';
import { Prisma } from '@extas/db/client';
import { allow, found, logChange, parse, TX, type CatalogueDeps, type Who } from './context';
import { CatalogueError } from './errors';
import { updateVariant } from './variants';
import type { FinderRow } from './size-chart-math';
import { WIZARD_FITS, WIZARD_FOR, WIZARD_KINDS, WIZARD_LINKS, WIZARD_RUNS, type WizardFit, type WizardFor, type WizardKind, type WizardLink, type WizardRun } from './wizard-model';

const finderRow = z.object({ size: z.string().trim().min(1).max(40), h1: z.string().trim().max(16), h2: z.string().trim().max(16), w1: z.number().finite().min(0).max(500), w2: z.number().finite().min(0).max(500) }).strict();
const uuids = z.array(z.uuid()).max(200);
const answer = z.string().trim().max(300);

export const wizardSpecPatch = z
  .object({
    kind: z.enum(WIZARD_KINDS).nullable().optional(),
    bottomProductId: z.uuid().nullable().optional(),
    colourLink: z.enum(WIZARD_LINKS).nullable().optional(),
    forWho: z.enum(WIZARD_FOR).nullable().optional(),
    details: z.record(z.string().regex(/^[a-z][a-zA-Z0-9]{0,30}$/), answer).nullable().optional(),
    keyPoints: z.string().trim().max(600).nullable().optional(),
    fit: z.enum(WIZARD_FITS).nullable().optional(),
    sizesRun: z.enum(WIZARD_RUNS).nullable().optional(),
    modelHeight: z.string().trim().max(16).nullable().optional(),
    modelWeightKg: z.number().int().min(0).max(300).nullable().optional(),
    modelWears: z.string().trim().max(40).nullable().optional(),
    hiddenSizeIds: uuids.nullable().optional(),
    hiddenColourIds: uuids.nullable().optional(),
    finder: z.array(finderRow).max(40).nullable().optional(),
    bGrade: z.boolean().optional(),
    scheduleAt: z.iso.datetime({ offset: true }).nullable().optional(),
    hideDemo: z.boolean().nullable().optional(),
    /** The Product's own "Use in combos" tick, kept with the other answers. */
    inCombos: z.boolean().optional(),
  })
  .strict();
export type WizardSpecPatch = z.input<typeof wizardSpecPatch>;

export interface WizardSpecView {
  productId: string;
  kind: WizardKind | null;
  bottomProductId: string | null;
  colourLink: WizardLink | null;
  forWho: WizardFor | null;
  details: Record<string, string>;
  keyPoints: string | null;
  fit: WizardFit | null;
  sizesRun: WizardRun | null;
  modelHeight: string | null;
  modelWeightKg: number | null;
  modelWears: string | null;
  hiddenSizeIds: string[];
  hiddenColourIds: string[];
  finder: FinderRow[];
  bGrade: boolean;
  scheduleAt: string | null;
  hideDemo: boolean | null;
  inCombos: boolean;
  priceConfirmedAt: string | null;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const record = (v: unknown): Record<string, string> =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string')) : {};
const oneOf = <T extends string>(list: readonly T[], v: string | null | undefined): T | null => (list as readonly string[]).includes(v ?? '') ? (v as T) : null;

type SpecRow = Prisma.ProductWizardSpecGetPayload<object>;

export function specView(productId: string, r: SpecRow | null, inCombos: boolean): WizardSpecView {
  const f = r && Array.isArray(r.finder) ? readFinder(r.finder) : [];
  return {
    productId,
    kind: oneOf(WIZARD_KINDS, r?.kind),
    bottomProductId: r?.bottomProductId ?? null,
    colourLink: oneOf(WIZARD_LINKS, r?.colourLink),
    forWho: oneOf(WIZARD_FOR, r?.forWho),
    details: record(r?.details),
    keyPoints: r?.keyPoints ?? null,
    fit: oneOf(WIZARD_FITS, r?.fit),
    sizesRun: oneOf(WIZARD_RUNS, r?.sizesRun),
    modelHeight: r?.modelHeight ?? null,
    modelWeightKg: r?.modelWeightKg ?? null,
    modelWears: r?.modelWears ?? null,
    hiddenSizeIds: strings(r?.hiddenSizeIds),
    hiddenColourIds: strings(r?.hiddenColourIds),
    finder: f,
    bGrade: r?.bGrade ?? false,
    scheduleAt: r?.scheduleAt?.toISOString() ?? null,
    hideDemo: r?.hideDemo ?? null,
    inCombos,
    priceConfirmedAt: r?.priceConfirmedAt?.toISOString() ?? null,
  };
}

function readFinder(v: Prisma.JsonArray): FinderRow[] {
  const out: FinderRow[] = [];
  for (const x of v) {
    const p = finderRow.safeParse(x);
    if (p.success) out.push(p.data);
  }
  return out;
}

async function ownProduct(deps: CatalogueDeps, who: Who, productId: string) {
  return found(await deps.db.product.findFirst({ where: { id: productId, storeId: who.storeId }, select: { id: true, status: true, inCombos: true } }), 'product');
}

/** The wizard's answers on a product (all empty before the first save). */
export async function readWizardSpec(deps: CatalogueDeps, who: Who, productId: string): Promise<WizardSpecView> {
  await allow(deps, who, 'catalogue.read');
  const p = await ownProduct(deps, who, productId);
  const row = await deps.db.productWizardSpec.findUnique({ where: { storeId_productId: { storeId: who.storeId, productId } } });
  return specView(productId, row, p.inCombos);
}

/** Saves the answers that were sent (only those); a set must name another product of this shop as its bottom piece. */
export async function saveWizardSpec(deps: CatalogueDeps, who: Who, productId: string, input: unknown): Promise<WizardSpecView> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(wizardSpecPatch, input, 'wizard answers');
  const p = await ownProduct(deps, who, productId);
  if (p.status !== 'DRAFT' && p.status !== 'READY_TO_PUBLISH') throw new CatalogueError('CONFLICT', 'only a draft has wizard answers', ['NOT_A_DRAFT']);
  if (d.bottomProductId) {
    if (d.bottomProductId === productId) throw new CatalogueError('INVALID_INPUT', 'the bottom piece is another product', ['bottomProductId']);
    found(await deps.db.product.findFirst({ where: { id: d.bottomProductId, storeId: who.storeId, archivedAt: null }, select: { id: true } }), 'bottom product');
  }
  const { inCombos, scheduleAt, ...rest } = d;
  const data: Prisma.ProductWizardSpecUncheckedUpdateInput = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined) continue;
    (data as Record<string, unknown>)[k] = v === null && ['details', 'hiddenSizeIds', 'hiddenColourIds', 'finder'].includes(k) ? Prisma.DbNull : v;
  }
  if (scheduleAt !== undefined) data.scheduleAt = scheduleAt === null ? null : new Date(scheduleAt);
  // A new price or a new category must be confirmed again: the answers that change the price do not exist here, so only the PIN time stays.
  const row = await deps.db.$transaction(async (tx) => {
    const saved = await tx.productWizardSpec.upsert({
      where: { storeId_productId: { storeId: who.storeId, productId } },
      create: { ...(data as Prisma.ProductWizardSpecUncheckedCreateInput), storeId: who.storeId, productId },
      update: data,
    });
    if (inCombos !== undefined) await tx.product.update({ where: { id: productId }, data: { inCombos } });
    await logChange(tx, who, 'product.wizard.save', 'Product', productId, {}, { fields: Object.keys(d) });
    return saved;
  }, TX);
  const combos = inCombos ?? p.inCombos;
  return specView(productId, row, combos);
}

export interface WizardPriceResult {
  variants: number;
  priceMinor: number;
  compareAtMinor: number | null;
  confirmedAt: string;
}

/**
 * Sets the selling price (and the crossed-out "was" price) of every live variant of the draft that is not kept off the shop, and
 * remembers when it was confirmed. The price must be above the buying price (the dearest buying price among those variants).
 * The PIN, when the shop asks for it, is checked by the caller (the same as the product screen's save).
 */
export async function setWizardPrice(deps: CatalogueDeps, who: Who, productId: string, input: { priceMinor: number; compareAtMinor?: number | null }): Promise<WizardPriceResult> {
  await allow(deps, who, 'catalogue.prices');
  const d = parse(z.object({ priceMinor: z.number().int().min(1), compareAtMinor: z.number().int().min(0).nullable().optional() }).strict(), input, 'price');
  const p = await ownProduct(deps, who, productId);
  if (p.status !== 'DRAFT' && p.status !== 'READY_TO_PUBLISH') throw new CatalogueError('CONFLICT', 'the price of a live product is changed on the product screen', ['NOT_A_DRAFT']);
  const spec = await deps.db.productWizardSpec.findUnique({ where: { storeId_productId: { storeId: who.storeId, productId } }, select: { hiddenSizeIds: true, hiddenColourIds: true } });
  const offSize = new Set(strings(spec?.hiddenSizeIds));
  const offColour = new Set(strings(spec?.hiddenColourIds));
  const variants = (await deps.db.productVariant.findMany({ where: { storeId: who.storeId, productId, archivedAt: null }, select: { id: true, sizeId: true, colourId: true, shopPriceMinor: true, avgCostMinor: true } })).filter(
    (v) => !(v.sizeId && offSize.has(v.sizeId)) && !(v.colourId && offColour.has(v.colourId)),
  );
  if (!variants.length) throw new CatalogueError('INVALID_INPUT', 'the draft has no variant to price', ['variants']);
  const cost = Math.max(...variants.map((v) => v.shopPriceMinor ?? v.avgCostMinor ?? 0));
  if (d.priceMinor <= cost) throw new CatalogueError('INVALID_INPUT', 'the selling price must be above the buying price', ['priceMinor']);
  if (d.compareAtMinor && d.compareAtMinor <= d.priceMinor) throw new CatalogueError('INVALID_INPUT', 'the crossed-out price must be above the selling price', ['compareAtMinor']);
  for (const v of variants) await updateVariant(deps, who, v.id, { priceMinor: d.priceMinor, compareAtMinor: d.compareAtMinor ?? null });
  const now = deps.now?.() ?? new Date();
  await deps.db.productWizardSpec.upsert({
    where: { storeId_productId: { storeId: who.storeId, productId } },
    create: { storeId: who.storeId, productId, priceConfirmedAt: now },
    update: { priceConfirmedAt: now },
  });
  return { variants: variants.length, priceMinor: d.priceMinor, compareAtMinor: d.compareAtMinor ?? null, confirmedAt: now.toISOString() };
}
