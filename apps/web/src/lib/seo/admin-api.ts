// S11 · PR 220–222 — the Website → SEO admin API. `path` is what comes after /api/admin/seo:
//   GET  /api/admin/seo            the SEO settings with their versions and defaults, and the shop's address as search
//                                  engines see it: the primary domain, the preview host, whether the shop is open (seo.read)
//   PUT  /api/admin/seo            { key, value, version? } saves one SEO setting for the store, through the settings
//                                  resolver (its change log keeps who, before and after); a stale version is 409 STALE;
//                                  an audit row `seo.settings` (seo.manage)
// PR 221 — the AI drafts (lib/seo/drafts.ts):
//   GET  /api/admin/seo/drafts       the waiting drafts, how many pages lack their own text, whether AI is on (seo.read)
//   POST /api/admin/seo/drafts       "Draft": drafts for up to `seo.aiDrafts.batchMax` pages (seo.manage; 409 AI_OFF
//                                    while AI or the drafts are off)
//   POST /api/admin/seo/drafts/<id>  { decision: 'accept' | 'discard' } (seo.manage; 409 DECIDED when already decided)
// Nothing here moves money, changes a price or touches an order or a customer.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { audit } from '@extas/auth';
import { registry, SettingsError, storeTarget, type Key } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { decideDraft, draftState, makeDrafts, SeoDraftError } from './drafts';
import { forgetRedirectTable } from './redirect-table';
import { primaryDomain } from './site';

/** The settings the SEO page shows and saves (each PR adds its own). */
// PR 221: the page templates, the product templates and lengths of Names & links (PR 590) shown here with them, and the
// AI drafts switch.
// PR 222: which structured data the pages carry.
// PR 235: the redirects (the WordPress map's switch) and the 404 report, saved from the Redirects & 404 page.
export const SEO_KEYS = [
  'seo.indexing',
  'seo.titles',
  'naming.seoTitleTemplate',
  'naming.metaDescriptionTemplate',
  'naming.seoTitleMaxChars',
  'naming.metaDescriptionMaxChars',
  'seo.aiDrafts',
  'seo.structuredData',
  'seo.redirects',
  'seo.notFound',
  'seo.urlPolicy',
  'seo.hashLinks',
  // PR 227: Website › SEO › Collection pages
  'category.seo',
  'seo.filterPages',
  // PR 228: the sitemaps
  'seo.sitemaps',
  // PR 229: robots.txt and the AI robots
  'seo.robots',
  // PR 232: the photo descriptions
  'seo.altText',
  // PR 233: the Search Console and Bing verification codes
  'seo.verification',
] as const satisfies readonly Key[];
export type SeoKey = (typeof SEO_KEYS)[number];

const isSeoKey = (k: unknown): k is SeoKey => typeof k === 'string' && (SEO_KEYS as readonly string[]).includes(k);

export interface SeoSnapshot {
  values: { [K in SeoKey]: (typeof registry)[K]['default'] };
  versions: Record<SeoKey, number>;
  defaults: { [K in SeoKey]: (typeof registry)[K]['default'] };
  site: { primary: string | null; staging: string | null; bengaliOn: boolean; bengaliReady: number };
  /** PR 221: AI for the whole shop (`ai.enabled`, Settings › AI). */
  ai: { on: boolean };
}

/** What the SEO page draws (the caller has checked `seo.read`). */
export async function seoSnapshot(deps: Pick<AdminDeps, 'resolver'>, storeId: number): Promise<SeoSnapshot> {
  const at = { storeId };
  const [resolved, primary, staging, bnOn, ready, aiOn] = await Promise.all([
    Promise.all(SEO_KEYS.map((k) => deps.resolver.get(k, at))),
    primaryDomain(storeId),
    deps.resolver.value('system.stagingHost', at),
    deps.resolver.value('language.bengali.enabled', at),
    deps.resolver.value('language.bengali.readyPages', at),
    deps.resolver.value('ai.enabled', at),
  ]);
  const values = Object.fromEntries(SEO_KEYS.map((k, i) => [k, resolved[i]!.value])) as SeoSnapshot['values'];
  const versions = Object.fromEntries(SEO_KEYS.map((k, i) => [k, resolved[i]!.version])) as SeoSnapshot['versions'];
  const defaults = Object.fromEntries(SEO_KEYS.map((k) => [k, registry[k].default])) as SeoSnapshot['defaults'];
  return { values, versions, defaults, site: { primary, staging: staging ?? null, bengaliOn: bnOn, bengaliReady: ready.length }, ai: { on: aiOn } };
}

/** PR 221 — the AI drafts routes (`rest` is what comes after /api/admin/seo/drafts). */
export async function seoDraftsRoute(request: Request, deps: AdminDeps | null, rest: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  if (rest.length > 1) return fail(404, 'not-found');
  if (rest.length === 1 ? m !== 'POST' : m !== 'GET' && m !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: m === 'GET' ? 'seo.read' : 'seo.manage', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = deps as AdminDeps;
  try {
    if (m === 'GET') return json({ ok: true, ...(await draftState(d, MOTHER_STORE_ID)) });
    if (rest.length === 0) {
      const r = await makeDrafts(d, g.actor, MOTHER_STORE_ID, g.ctx);
      return json({ ok: true, ...r, ...(await draftState(d, MOTHER_STORE_ID)) });
    }
    const b = await body(request);
    if (b.decision !== 'accept' && b.decision !== 'discard') return fail(400, 'VALIDATION', ['decision']);
    const id = rest[0]!;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(404, 'NOT_FOUND');
    const r = await decideDraft(d, g.actor, MOTHER_STORE_ID, id, b.decision, g.ctx);
    return json({ ok: true, ...r, ...(await draftState(d, MOTHER_STORE_ID)) });
  } catch (e) {
    if (e instanceof SeoDraftError) return fail(e.status, e.code);
    return errorResponse(e);
  }
}

/** Every Website → SEO admin route of this file. */
export async function seoSettingsRoute(request: Request, deps: AdminDeps | null): Promise<Response> {
  const m = request.method.toUpperCase();
  if (m !== 'GET' && m !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: m === 'GET' ? 'seo.read' : 'seo.manage', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = deps as AdminDeps;
  try {
    if (m === 'GET') return json({ ok: true, ...(await seoSnapshot(d, MOTHER_STORE_ID)) });
    const b = await body(request);
    if (!isSeoKey(b.key)) return fail(400, 'VALIDATION', ['key']);
    const key = b.key;
    const before = await d.resolver.get(key, { storeId: MOTHER_STORE_ID });
    if (b.version !== undefined && b.version !== before.version) return json({ ok: false, error: 'STALE', data: { version: before.version } }, { status: 409 });
    const parsed = registry[key].schema.safeParse(b.value);
    if (!parsed.success) return fail(400, 'VALIDATION', parsed.error.issues.map((i) => `${[key, ...i.path].join('.')}: ${i.message}`));
    const actorId = g.actor.staffUserId ?? null;
    if (JSON.stringify(parsed.data) !== JSON.stringify(before.value)) {
      await d.resolver.set(key, parsed.data as never, storeTarget(MOTHER_STORE_ID), { actorId, reason: `Website › SEO: ${key}` });
      await audit(d.db, g.actor, { storeId: MOTHER_STORE_ID, action: 'seo.settings', entityType: 'Setting', entityId: key, before: { [key]: before.value }, after: { [key]: parsed.data } }, { source: 'admin-api', ...g.ctx });
      if (key === 'seo.redirects') forgetRedirectTable(MOTHER_STORE_ID);
    }
    return json({ ok: true, ...(await seoSnapshot(d, MOTHER_STORE_ID)) });
  } catch (e) {
    if (e instanceof SettingsError) return fail(400, 'VALIDATION', [...e.issues]);
    return errorResponse(e);
  }
}
