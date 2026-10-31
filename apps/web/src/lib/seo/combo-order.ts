// S11 · PR 235 (Blueprint C12.1) — a generated colour pair has one address, with its colours in the dictionary's order
// (`/combo/<rule>~black-navy`). Asked for with the colours in another order (`…~navy-black`, a link someone typed or
// shared), the combo page finds the pair and forwards permanently; the forward is written into the redirect table
// (source `combo-order`), so the admin sees it with its hits and the next visit is forwarded by the proxy at once.
import { getPrisma } from '@extas/db/client';
import { ROUTES } from '../shop/routes';
import { forgetRedirectTable, redirectKey } from './redirect-table';
import { sameColoursSlug } from './suggest';

export const COMBO_ORDER_SOURCE = 'combo-order';

export interface ComboOrderDb {
  combo: { findMany(a: { where: { storeId: number; slug: { startsWith: string }; archivedAt: null }; select: { slug: true }; take: number }): Promise<{ slug: string }[]> };
  redirect: {
    findUnique(a: { where: { storeId_fromPath: { storeId: number; fromPath: string } } }): Promise<{ id: string } | null>;
    create(a: { data: { storeId: number; fromPath: string; toPath: string; statusCode: number; source: string; enabled: boolean } }): Promise<unknown>;
  };
}

/** How many pairs of one rule are compared at most (a rule makes far fewer, `combos.generate.maxPairsPerRule`). */
const MAX_PAIRS = 5000;

/** The pair `slug` names in another colour order, recorded as a forward; null when there is none. */
export async function comboOrderTarget(db: ComboOrderDb, storeId: number, slug: string, statusCode: number): Promise<string | null> {
  const i = slug.indexOf('~');
  if (i <= 0) return null;
  const rows = await db.combo.findMany({ where: { storeId, slug: { startsWith: slug.slice(0, i + 1) }, archivedAt: null }, select: { slug: true }, take: MAX_PAIRS });
  const target = sameColoursSlug(slug, rows.map((r) => r.slug));
  if (!target) return null;
  const to = ROUTES.combo(target);
  const fromPath = redirectKey(ROUTES.combo(slug));
  if (!(await db.redirect.findUnique({ where: { storeId_fromPath: { storeId, fromPath } } }))) {
    await db.redirect.create({ data: { storeId, fromPath, toPath: redirectKey(to), statusCode, source: COMBO_ORDER_SOURCE, enabled: true } }).catch(() => undefined);
    forgetRedirectTable(storeId);
  }
  return to;
}

/** The combo page's call; null without a database or on any error (the page then says "not found" as before). */
export async function comboOrderForward(storeId: number, slug: string, statusCode: number): Promise<string | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    return await comboOrderTarget(getPrisma() as unknown as ComboOrderDb, storeId, slug, statusCode);
  } catch {
    return null;
  }
}
