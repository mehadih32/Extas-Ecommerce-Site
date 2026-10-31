// S11 · PR 233 — Search Console and Bing on Website › SEO: which engine is connected (Keys & connections, a passing
// Test), and "Send the sitemap" (POST /api/admin/seo/search-engines, seo.manage, an audit row): for each engine, the
// shop's property among the account's (the store's primary domain, or its whole domain) gets the sitemap's address.
// An engine still on its mock sends nothing and says so; nothing is sent before the shop has its own domain.
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { BING_WEBMASTER_PROVIDER, createConnections, GOOGLE_SEARCH_CONSOLE_PROVIDER, searchConsoleAdapters, type SearchEngineApi } from '@extas/adapters';
import { errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { readPageSettings } from '../shop/context';
import { primaryDomain } from './site';
import { SITEMAP_INDEX } from './sitemap';
import { propertyFor, type Engine } from './verification';

export const ENGINES: readonly { engine: Engine; provider: string }[] = [
  { engine: 'google', provider: GOOGLE_SEARCH_CONSOLE_PROVIDER },
  { engine: 'bing', provider: BING_WEBMASTER_PROVIDER },
];

export interface EngineState {
  engine: Engine;
  /** A key is in and its Test passed (the connection is LIVE and on). */
  connected: boolean;
}

/** Which engines are connected (installation-wide connections). */
export async function searchEngineState(db: AdminDeps['db']): Promise<EngineState[]> {
  const rows = await db.integration.findMany({ where: { kind: 'SEARCH_CONSOLE', storeId: null, enabled: true, mode: 'LIVE', archivedAt: null }, select: { provider: true } });
  const live = new Set(rows.map((r) => r.provider));
  return ENGINES.map((e) => ({ engine: e.engine, connected: live.has(e.provider) }));
}

/** What "Send the sitemap" did for one engine. */
export type SendOutcome =
  | { engine: Engine; status: 'sent'; property: string }
  | { engine: Engine; status: 'practice' | 'noProperty' | 'unreachable' }
  | { engine: Engine; status: 'failed'; property: string; error: string };

/** The answer when nothing can be sent at all. */
export type SendBlock = 'noDomain' | 'sitemapsOff';

/** Hands the sitemap to each engine for the shop's own property. */
export async function sendSitemap(deps: AdminDeps, storeId: number): Promise<{ sitemap: string; results: SendOutcome[] } | { blocked: SendBlock }> {
  const [{ 'seo.sitemaps': sm }, host] = await Promise.all([readPageSettings(['seo.sitemaps'], storeId), primaryDomain(storeId)]);
  if (!host) return { blocked: 'noDomain' };
  if (!sm.enabled) return { blocked: 'sitemapsOff' };
  const origin = new URL(`https://${host}`);
  const sitemap = new URL(SITEMAP_INDEX, origin).toString();
  const [testS, cacheS] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
  const c = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: searchConsoleAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
  const results: SendOutcome[] = [];
  for (const { engine, provider } of ENGINES) {
    try {
      const link = await c.use<SearchEngineApi>('SEARCH_CONSOLE', { provider });
      if (link.mode === 'MOCK') {
        results.push({ engine, status: 'practice' });
        continue;
      }
      const property = propertyFor(await link.api.sites(), origin);
      if (!property) {
        results.push({ engine, status: 'noProperty' });
        continue;
      }
      const r = await link.api.submitSitemap(property, sitemap);
      results.push(r.ok ? { engine, status: 'sent', property } : { engine, status: 'failed', property, error: r.error });
    } catch {
      // the adapters say their failures in words without the key; the card says only that the engine did not answer
      results.push({ engine, status: 'unreachable' });
    }
  }
  return { sitemap, results };
}

/** POST /api/admin/seo/search-engines — send the sitemap to every connected engine now. */
export async function seoSearchEnginesRoute(request: Request, deps: AdminDeps | null, rest: string[]): Promise<Response> {
  if (rest.length) return fail(404, 'not-found');
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'seo.manage', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = deps as AdminDeps;
  try {
    const out = await sendSitemap(d, MOTHER_STORE_ID);
    const after = 'blocked' in out ? { blocked: out.blocked } : { sitemap: out.sitemap, results: out.results.map((r) => `${r.engine}:${r.status}`) };
    await audit(d.db, g.actor, { storeId: MOTHER_STORE_ID, action: 'seo.searchEngines.send', entityType: 'Setting', entityId: 'seo.verification', after }, { source: 'admin-api', ...g.ctx });
    return json({ ok: true, ...out });
  } catch (e) {
    return errorResponse(e);
  }
}
