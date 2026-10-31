// S11 · PR 232 — the photo descriptions on the database: which product photos still have no English description, the
// shop writing them (only where none is written: a description the owner typed in Media is never changed), right after
// a photo is added to a product while `seo.altText.autoApply` is on, and "Write them now" on Website › SEO
// (POST /api/admin/seo/alt-text, seo.manage, an audit row). Bengali is never written (lib/seo/alt-text).
import { audit } from '@extas/auth';
import { getPrisma, MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { readPageSettings, shopContextFor } from '../shop/context';
import { altTextFor, type AltWords } from './alt-text';

/** A photo of a product that is on the books (not archived), with what its description is made of. */
interface PhotoRow {
  assetId: string;
  role: string;
  colourId: string | null;
  name: string;
}

const noAlt = { OR: [{ altEn: null }, { altEn: '' }] };

/** The product photos (and each colour's true-colour photo) whose picture has no English description yet, oldest first. */
async function photosWithoutAlt(db: PrismaClient, storeId: number, productId?: string): Promise<PhotoRow[]> {
  const product = { archivedAt: null, ...(productId ? { id: productId } : {}) };
  const asset = { storeId, archivedAt: null, kind: 'IMAGE' as const, ...noAlt };
  const [media, trueShots] = await Promise.all([
    db.productMedia.findMany({
      where: { storeId, archivedAt: null, role: { not: 'VIDEO' }, product, asset },
      select: { assetId: true, role: true, colourId: true, product: { select: { nameEn: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    db.productColour.findMany({
      where: { storeId, archivedAt: null, trueColourAssetId: { not: null }, product },
      select: { trueColourAssetId: true, colourId: true, product: { select: { nameEn: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
  ]);
  const rows: PhotoRow[] = media.map((m) => ({ assetId: m.assetId, role: m.role, colourId: m.colourId, name: m.product.nameEn }));
  const ids = trueShots.map((c) => c.trueColourAssetId as string);
  const bare = new Set((await db.mediaAsset.findMany({ where: { id: { in: ids }, ...asset }, select: { id: true } })).map((a) => a.id));
  for (const c of trueShots) if (bare.has(c.trueColourAssetId as string)) rows.push({ assetId: c.trueColourAssetId as string, role: 'TRUE_COLOUR', colourId: c.colourId, name: c.product.nameEn });
  // one picture on several products: its first use names it
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.assetId) && seen.add(r.assetId));
}

/** How many product photos have no English description yet. */
export async function missingAlt(db: PrismaClient, storeId: number): Promise<number> {
  return (await photosWithoutAlt(db, storeId)).length;
}

/** Write the English description of every product photo (of one product, or all) that has none; how many were written. */
export async function fillMissingAlt(db: PrismaClient, storeId: number, words: AltWords, maxLength: number, productId?: string): Promise<number> {
  const rows = await photosWithoutAlt(db, storeId, productId);
  if (!rows.length) return 0;
  const colourIds = [...new Set(rows.flatMap((r) => (r.colourId ? [r.colourId] : [])))];
  const colours = new Map((await db.colour.findMany({ where: { id: { in: colourIds } }, select: { id: true, nameEn: true } })).map((c) => [c.id, c.nameEn]));
  let filled = 0;
  for (const r of rows) {
    const text = altTextFor({ name: r.name, colour: r.colourId ? (colours.get(r.colourId) ?? null) : null, role: r.role }, words, maxLength);
    if (!text) continue;
    // only while it still has none: a description typed in Media meanwhile stays
    filled += (await db.mediaAsset.updateMany({ where: { id: r.assetId, storeId, ...noAlt }, data: { altEn: text } })).count;
  }
  return filled;
}

/** The shop's English words (the owner's dictionary changes included). */
async function englishWords(storeId: number): Promise<AltWords> {
  const c = await shopContextFor(storeId, 'en');
  return (key, vars) => c.t(key, vars);
}

/** Right after a photo is added to a product (PR 25 attach): its description, while the switch is on. Never fails the add. */
export async function autoAltAfterAttach(storeId: number, productId: string): Promise<void> {
  try {
    const { 'seo.altText': set } = await readPageSettings(['seo.altText'], storeId);
    if (!set.autoApply) return;
    await fillMissingAlt(getPrisma(), storeId, await englishWords(storeId), set.maxLength, productId);
  } catch (e) {
    console.warn(`seo: photo description not written (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
  }
}

/** POST /api/admin/seo/alt-text — write every missing description now (whatever the switch says). */
export async function seoAltTextRoute(request: Request, deps: AdminDeps | null, rest: string[]): Promise<Response> {
  if (rest.length) return fail(404, 'not-found');
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'seo.manage', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = deps as AdminDeps;
  try {
    const { 'seo.altText': set } = await readPageSettings(['seo.altText'], MOTHER_STORE_ID);
    const filled = await fillMissingAlt(d.db, MOTHER_STORE_ID, await englishWords(MOTHER_STORE_ID), set.maxLength);
    const missing = await missingAlt(d.db, MOTHER_STORE_ID);
    await audit(d.db, g.actor, { storeId: MOTHER_STORE_ID, action: 'seo.altText.fill', entityType: 'Setting', entityId: 'seo.altText', after: { filled, missing } }, { source: 'admin-api', ...g.ctx });
    return json({ ok: true, filled, missing });
  } catch (e) {
    return errorResponse(e);
  }
}
