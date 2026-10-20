// PR 21 — "Save changes" of the product edit form (demo 90-admin-catalog.js, zp-save). One request carries everything
// the form changed; it is applied in a fixed order through the services that own each part, so every rule (SKU key,
// prices need `catalogue.prices`, a link change forwards, a colour in use cannot go) is the same as everywhere else:
//
//   1 product fields  2 name, link and titles  3 variants taken off (retired, never deleted)  4 variant changes
//   5 the product's colours, in order  6 new variants (by the ERP SKU)  → then the publish checklist is run again.
//
// A refusal stops at that step and says which one (`step:<name>` in the details); the steps before it are saved, and
// the answer never claims more than was written (B7.2 #4).
import { z } from 'zod';
import { AuthError } from '@extas/auth';
import { allow, parse, type CatalogueDeps, type Who } from './context';
import { CatalogueError, isCatalogueError } from './errors';
import { checkProduct } from './publish';
import type { Readiness } from './health';
import { namingPatch, saveNaming } from './naming';
import { getProduct, productPatch, setProductColours, updateProduct, type ProductView } from './products';
import { createVariant, updateVariant, variantInput, variantPatch } from './variants';

export const FORM_STEPS = ['product', 'naming', 'retire', 'variants', 'colours', 'create'] as const;
export type FormStep = (typeof FORM_STEPS)[number];

export const productFormInput = z
  .object({
    product: productPatch.omit({ archived: true, nameEn: true, nameBn: true, slug: true, brandId: true, feedTitle: true }).optional(),
    naming: namingPatch.optional(),
    retire: z.array(z.uuid()).max(500).optional(),
    variants: z.array(z.object({ id: z.uuid(), patch: variantPatch.omit({ archived: true }) }).strict()).max(500).optional(),
    colours: z.array(z.uuid()).max(60).optional(),
    create: z.array(variantInput.omit({ productId: true })).max(500).optional(),
  })
  .strict();
export type ProductFormInput = z.input<typeof productFormInput>;

export interface ProductFormResult {
  saved: FormStep[];
  product: ProductView;
  readiness: Readiness;
}

export async function saveProductForm(deps: CatalogueDeps, who: Who, productId: string, input: ProductFormInput): Promise<ProductFormResult> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(productFormInput, input, 'product form');
  const saved: FormStep[] = [];
  const step = async (name: FormStep, run: () => Promise<unknown>, when: boolean) => {
    if (!when) return;
    try {
      await run();
      saved.push(name);
    } catch (e) {
      const where = [`step:${name}`, ...saved.map((s) => `saved:${s}`)];
      if (isCatalogueError(e)) throw new CatalogueError(e.code, e.message, [...e.details, ...where]);
      if (e instanceof AuthError) throw new AuthError(e.code, e.message, [...e.details, ...where]);
      throw e;
    }
  };
  await step('product', () => updateProduct(deps, who, productId, d.product!), !!d.product && Object.keys(d.product).length > 0);
  await step('naming', () => saveNaming(deps, who, productId, d.naming!), !!d.naming && Object.keys(d.naming).length > 0);
  await step('retire', async () => {
    for (const id of d.retire!) await ownVariant(deps, who, productId, id).then(() => updateVariant(deps, who, id, { archived: true }));
  }, !!d.retire?.length);
  await step('variants', async () => {
    for (const v of d.variants!) await ownVariant(deps, who, productId, v.id).then(() => updateVariant(deps, who, v.id, v.patch));
  }, !!d.variants?.length);
  await step('colours', () => setProductColours(deps, who, productId, { colours: d.colours!.map((colourId) => ({ colourId })) }), d.colours !== undefined);
  await step('create', async () => {
    for (const v of d.create!) await createVariant(deps, who, { ...v, productId });
  }, !!d.create?.length);
  const readiness = await checkProduct(deps, who, productId);
  return { saved, product: await getProduct(deps, who, productId), readiness };
}

/** A variant id from the form must belong to this product (never another product's or store's). */
async function ownVariant(deps: CatalogueDeps, who: Who, productId: string, id: string) {
  const v = await deps.db.productVariant.findFirst({ where: { id, storeId: who.storeId, productId }, select: { id: true } });
  if (!v) throw new CatalogueError('NOT_FOUND', 'no such variant on this product', [`variant: ${id}`]);
}
