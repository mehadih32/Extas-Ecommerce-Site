// S28 · PR 1032 — the name a colour has on one draft's page (add-product wizard, step 3 "Colour name on site"). Stored on the
// product's own colour row; the colour list's own name is never changed. Reading needs `catalogue.read`, changing `catalogue.write`.
import { z } from 'zod';
import { allow, found, logChange, parse, TX, type CatalogueDeps, type Who } from './context';
import { CatalogueError } from './errors';

async function draftOf(deps: CatalogueDeps, who: Who, productId: string) {
  return found(await deps.db.product.findFirst({ where: { id: productId, storeId: who.storeId }, select: { id: true, status: true } }), 'product');
}

/** The names the owner gave this product's colours on the site (colour id → name); a colour with no own name is left out. */
export async function readWizardColourNames(deps: CatalogueDeps, who: Who, productId: string): Promise<Record<string, string>> {
  await allow(deps, who, 'catalogue.read');
  await draftOf(deps, who, productId);
  const rows = await deps.db.productColour.findMany({ where: { storeId: who.storeId, productId, archivedAt: null, siteNameEn: { not: null } }, select: { colourId: true, siteNameEn: true } });
  return Object.fromEntries(rows.map((r) => [r.colourId, r.siteNameEn!]));
}

/**
 * Sets the name a colour has on this draft's page. An empty name, or the colour list's own name, takes the own name away (the list's
 * name is used again). Only a draft's colours change here.
 */
export async function setWizardColourName(deps: CatalogueDeps, who: Who, productId: string, input: { colourId: string; name: string | null }): Promise<{ colourId: string; name: string | null }> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(z.object({ colourId: z.uuid(), name: z.string().trim().max(80).nullable() }).strict(), input, 'colour name');
  const p = await draftOf(deps, who, productId);
  if (p.status !== 'DRAFT' && p.status !== 'READY_TO_PUBLISH') throw new CatalogueError('CONFLICT', 'only a draft has wizard answers', ['NOT_A_DRAFT']);
  const row = found(await deps.db.productColour.findFirst({ where: { storeId: who.storeId, productId, colourId: d.colourId, archivedAt: null }, select: { id: true, colour: { select: { nameEn: true } } } }), 'product colour');
  const own = d.name && d.name.toLowerCase() !== row.colour.nameEn.toLowerCase() ? d.name : null;
  await deps.db.$transaction(async (tx) => {
    await tx.productColour.update({ where: { id: row.id }, data: { siteNameEn: own } });
    await logChange(tx, who, 'product.wizard.colourName', 'Product', productId, {}, { colourId: d.colourId, name: own });
  }, TX);
  return { colourId: d.colourId, name: own };
}
