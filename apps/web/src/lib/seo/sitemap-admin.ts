// S11 · PR 228 — the Sitemaps card's data and "Make the sitemaps now" (POST /api/admin/seo/sitemaps): the index's
// address on the shop's own domain, each file with how many addresses it holds (a Bengali twin counts), and when the
// kept set was made. Making them now needs seo.manage and leaves an audit row; it changes no setting.
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { siteAddress } from './site';
import { filesOfSet, SITEMAP_INDEX } from './sitemap';
import { forgetSitemaps, sitemapSet, sitemapSettings } from './sitemap-data';

export interface SitemapsState {
  index: string | null;
  files: { name: string; kind: string; urls: number }[];
  madeAt: string;
}

/** What the card shows (the kept set, made now when none is kept). */
export async function sitemapsState(storeId: number): Promise<SitemapsState> {
  const [set, site] = await Promise.all([sitemapSettings(storeId), siteAddress(storeId)]);
  const { set: entries, at } = await sitemapSet(storeId, set);
  const files = filesOfSet(entries, set['seo.sitemaps'].perFile).map((f) => ({ name: f.name, kind: f.kind, urls: f.entries.reduce((a, e) => a + (e.bn ? 2 : 1), 0) }));
  return { index: site.origin ? new URL(SITEMAP_INDEX, site.origin).toString() : null, files, madeAt: at.toISOString() };
}

/** POST /api/admin/seo/sitemaps — make the sitemaps again now. */
export async function seoSitemapsRoute(request: Request, deps: AdminDeps | null, rest: string[]): Promise<Response> {
  if (rest.length) return fail(404, 'not-found');
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'seo.manage', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = deps as AdminDeps;
  try {
    forgetSitemaps(MOTHER_STORE_ID);
    const sitemaps = await sitemapsState(MOTHER_STORE_ID);
    await audit(d.db, g.actor, { storeId: MOTHER_STORE_ID, action: 'seo.sitemaps.make', entityType: 'Setting', entityId: 'seo.sitemaps', after: { files: sitemaps.files.length } }, { source: 'admin-api', ...g.ctx });
    return json({ ok: true, sitemaps });
  } catch (e) {
    return errorResponse(e);
  }
}
