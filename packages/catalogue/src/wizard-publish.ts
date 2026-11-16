// S28 · PR 1037 — the end of the add-product wizard (step 8, "Check & publish"): put the draft on the shop now, or at a time the owner
// picked. Sizes and colours the owner kept off are archived first (never deleted; "Restore" on the product brings them back). The
// shop's own publish rules (`publishProduct`: the readiness checklist) and the wizard's two (a front photo for every colour and a
// price the owner confirmed above the buying price) must all pass. Needs `catalogue.publish`. Nothing reaches the shop before this.
import { z } from 'zod';
import { allow, logChange, parse, TX, type CatalogueDeps, type Who } from './context';
import { CatalogueError } from './errors';
import { publishProduct, type PublishResult } from './publish';
import { requirePermission } from '@extas/auth';

const input = z.object({ mode: z.enum(['now', 'schedule']), at: z.iso.datetime({ offset: true }).optional() }).strict();
export type WizardPublishInput = z.input<typeof input>;

export interface WizardPublishResult {
  mode: 'now' | 'schedule';
  productId: string;
  status: string;
  /** When it goes (or went) on the shop. */
  at: string | null;
  /** Variants kept off the shop (archived). */
  hiddenVariants: number;
}

/** What stops the wizard's own two rules, as codes. */
async function gaps(deps: CatalogueDeps, who: Who, productId: string): Promise<string[]> {
  const spec = await deps.db.productWizardSpec.findUnique({ where: { storeId_productId: { storeId: who.storeId, productId } } });
  const hiddenColours = new Set(Array.isArray(spec?.hiddenColourIds) ? (spec!.hiddenColourIds as string[]) : []);
  const [colours, front, variants] = await Promise.all([
    deps.db.productColour.findMany({ where: { storeId: who.storeId, productId, archivedAt: null }, select: { colourId: true } }),
    deps.db.productMedia.findMany({ where: { storeId: who.storeId, productId, archivedAt: null, colourId: { not: null }, role: 'FRONT' }, select: { colourId: true } }),
    deps.db.productVariant.findMany({ where: { storeId: who.storeId, productId, archivedAt: null }, select: { colourId: true, priceMinor: true } }),
  ]);
  const out: string[] = [];
  const kept = colours.filter((c) => !hiddenColours.has(c.colourId));
  if (!kept.length) out.push('NO_COLOUR');
  const withFront = new Set(front.map((f) => f.colourId));
  if (kept.some((c) => !withFront.has(c.colourId))) out.push('FRONT_PHOTO');
  if (!spec?.priceConfirmedAt || variants.some((v) => v.priceMinor === null && !hiddenColours.has(v.colourId ?? ''))) out.push('PRICE_NOT_CONFIRMED');
  return out;
}

/** Archives the variants and colours the owner kept off the shop. */
async function applyHidden(deps: CatalogueDeps, who: Who, productId: string): Promise<number> {
  const spec = await deps.db.productWizardSpec.findUnique({ where: { storeId_productId: { storeId: who.storeId, productId } } });
  const sizes = Array.isArray(spec?.hiddenSizeIds) ? (spec!.hiddenSizeIds as string[]) : [];
  const colours = Array.isArray(spec?.hiddenColourIds) ? (spec!.hiddenColourIds as string[]) : [];
  if (!sizes.length && !colours.length) return 0;
  const now = deps.now?.() ?? new Date();
  return deps.db.$transaction(async (tx) => {
    const r = await tx.productVariant.updateMany({
      where: { storeId: who.storeId, productId, archivedAt: null, OR: [...(sizes.length ? [{ sizeId: { in: sizes } }] : []), ...(colours.length ? [{ colourId: { in: colours } }] : [])] },
      data: { archivedAt: now },
    });
    if (colours.length) await tx.productColour.updateMany({ where: { storeId: who.storeId, productId, colourId: { in: colours }, archivedAt: null }, data: { archivedAt: now } });
    await logChange(tx, who, 'product.wizard.hide', 'Product', productId, {}, { variants: r.count, sizes: sizes.length, colours: colours.length });
    return r.count;
  }, TX);
}

export async function wizardPublish(deps: CatalogueDeps, who: Who, productId: string, raw: unknown): Promise<WizardPublishResult> {
  await allow(deps, who, 'catalogue.read');
  await requirePermission(deps.db, who.actor, 'catalogue.publish', { storeId: who.storeId });
  const d = parse(input, raw, 'publish');
  const p = await deps.db.product.findFirst({ where: { id: productId, storeId: who.storeId }, select: { id: true, status: true, archivedAt: true } });
  if (!p) throw new CatalogueError('NOT_FOUND', 'product not found');
  if (p.status !== 'DRAFT' && p.status !== 'READY_TO_PUBLISH') throw new CatalogueError('CONFLICT', 'only a draft goes through the wizard', ['NOT_A_DRAFT']);
  const now = deps.now?.() ?? new Date();
  let at: Date | null = null;
  if (d.mode === 'schedule') {
    at = d.at ? new Date(d.at) : null;
    if (!at || at.getTime() <= now.getTime()) throw new CatalogueError('INVALID_INPUT', 'pick a time in the future', ['at']);
  }
  const g = await gaps(deps, who, productId);
  if (g.length) throw new CatalogueError('CHECKLIST_FAILED', 'the wizard checks are not complete', g);
  const hidden = await applyHidden(deps, who, productId);
  if (d.mode === 'now') {
    const r: PublishResult = await publishProduct(deps, who, productId);
    return { mode: 'now', productId, status: r.status, at: r.publishedAt, hiddenVariants: hidden };
  }
  await deps.db.$transaction(async (tx) => {
    await tx.product.update({ where: { id: productId }, data: { status: 'READY_TO_PUBLISH', publishedAt: at } });
    await tx.productWizardSpec.upsert({ where: { storeId_productId: { storeId: who.storeId, productId } }, create: { storeId: who.storeId, productId, scheduleAt: at }, update: { scheduleAt: at } });
    await logChange(tx, who, 'product.wizard.schedule', 'Product', productId, {}, { at: at!.toISOString() });
  }, TX);
  return { mode: 'schedule', productId, status: 'READY_TO_PUBLISH', at: at!.toISOString(), hiddenVariants: hidden };
}

/** "Back to draft": takes a scheduled time away (the product stays a draft). */
export async function wizardUnschedule(deps: CatalogueDeps, who: Who, productId: string): Promise<void> {
  await allow(deps, who, 'catalogue.write');
  const p = await deps.db.product.findFirst({ where: { id: productId, storeId: who.storeId }, select: { status: true } });
  if (!p) throw new CatalogueError('NOT_FOUND', 'product not found');
  if (p.status !== 'READY_TO_PUBLISH') return;
  await deps.db.$transaction(async (tx) => {
    await tx.product.update({ where: { id: productId }, data: { status: 'DRAFT', publishedAt: null } });
    await tx.productWizardSpec.updateMany({ where: { storeId: who.storeId, productId }, data: { scheduleAt: null } });
    await logChange(tx, who, 'product.wizard.unschedule', 'Product', productId, {}, {});
  }, TX);
}

/** The scheduled products whose time has come (planned by the jobs package). Each one goes through the same rules as "Publish now". */
export async function runScheduledPublish(deps: CatalogueDeps, who: Who): Promise<{ due: number; published: number; failed: string[] }> {
  const now = deps.now?.() ?? new Date();
  const specs = await deps.db.productWizardSpec.findMany({ where: { storeId: who.storeId, scheduleAt: { lte: now } }, select: { productId: true }, take: 100 }); // hardcode-ok: one run's batch; the rest go in the next run
  const rows = await deps.db.product.findMany({ where: { storeId: who.storeId, id: { in: specs.map((x) => x.productId) }, status: 'READY_TO_PUBLISH', archivedAt: null }, select: { id: true } });
  let published = 0;
  const failed: string[] = [];
  for (const r of rows) {
    try {
      await publishProduct(deps, who, r.id);
      await deps.db.productWizardSpec.updateMany({ where: { storeId: who.storeId, productId: r.id }, data: { scheduleAt: null } });
      published += 1;
    } catch {
      failed.push(r.id);
    }
  }
  return { due: rows.length, published, failed };
}
