// S11 · PR 238 (Blueprint C4.1, C4.3, C4 build list 5) — the organic report on Website › SEO › Organic report
// (`/admin/website/seo/organic`): over the last `seo.organic.days` shop days,
//   - the Sales from organic visits (@extas/metrics `organicSales`: Profit by channel's own organic rule) against the
//     owner's target share, by kind (search, video, AI assistants) and by each listed site, other sites and "not known";
//   - for each connected engine (Google Search Console, Bing Webmaster; Keys & connections, PR 233): clicks, times the
//     shop was shown, its average position and the top searches for the shop's own property. An engine still on its
//     mock, a shop without its own domain, an account without the shop's property, or an engine that does not answer in
//     time is said as such; nothing is made up.
// Read-only: nothing here changes a setting, a budget or an order.
import { createConnections, searchConsoleAdapters, type SearchEngineApi, type SearchPerformance } from '@extas/adapters';
import { lastDays, organicSales, type OrganicReport } from '@extas/metrics';
import type { AdminDeps } from '../admin-auth';
import { withTimeout } from '../settings';
import { ENGINES } from './search-engines';
import { primaryDomain } from './site';
import { propertyFor, type Engine } from './verification';

/** What one engine said for the span. */
export type EngineReport =
  | { engine: Engine; status: 'ok'; property: string; data: SearchPerformance }
  | { engine: Engine; status: 'practice' | 'noDomain' | 'noProperty' | 'unreachable' };

/** How the shop did in each engine's results over the days `from`–`to`. */
export async function searchPerformance(deps: AdminDeps, storeId: number, span: { from: string; to: string }, top: number): Promise<EngineReport[]> {
  const [host, testS, cacheS] = await Promise.all([primaryDomain(storeId), deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
  const c = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: searchConsoleAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
  const origin = host ? new URL(`https://${host}`) : null;
  return Promise.all(
    ENGINES.map(async ({ engine, provider }): Promise<EngineReport> => {
      try {
        const link = await c.use<SearchEngineApi>('SEARCH_CONSOLE', { provider });
        if (link.mode === 'MOCK') return { engine, status: 'practice' };
        if (!origin) return { engine, status: 'noDomain' };
        const property = propertyFor(await withTimeout(link.api.sites(), testS * 1000), origin);
        if (!property) return { engine, status: 'noProperty' };
        const data = await withTimeout(link.api.performance(property, { start: span.from, end: span.to }, top), testS * 1000);
        return { engine, status: 'ok', property, data };
      } catch {
        // the adapters say their failures without the key; the page says only that the engine did not answer
        return { engine, status: 'unreachable' };
      }
    }),
  );
}

export interface OrganicView {
  days: number;
  targetPct: number;
  sources: { name: string; kind: string }[];
  keepReferrals: boolean;
  sales: OrganicReport;
  engines: EngineReport[];
}

/** The whole report of one store, as of now. */
export async function organicView(deps: AdminDeps, storeId: number, now = new Date()): Promise<OrganicView> {
  const at = { storeId };
  const [o, timeZone, rules] = await Promise.all([deps.resolver.value('seo.organic', at), deps.resolver.value('store.timeZone', at), deps.resolver.value('reports.channels', at)]);
  const span = lastDays(o.days, now, timeZone);
  const [sales, engines] = await Promise.all([organicSales(deps.db, storeId, span, timeZone, o.sources, rules), searchPerformance(deps, storeId, span, o.top)]);
  return { days: o.days, targetPct: o.targetPct, sources: o.sources.map((s) => ({ name: s.name, kind: s.kind })), keepReferrals: o.keepReferrals, sales, engines };
}
