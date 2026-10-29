// S11 · PR 220–222 — the Website → SEO admin API. `path` is what comes after /api/admin/seo:
//   GET  /api/admin/seo            the SEO settings with their versions and defaults, and the shop's address as search
//                                  engines see it: the primary domain, the preview host, whether the shop is open (seo.read)
//   PUT  /api/admin/seo            { key, value, version? } saves one SEO setting for the store, through the settings
//                                  resolver (its change log keeps who, before and after); a stale version is 409 STALE;
//                                  an audit row `seo.settings` (seo.manage)
// Nothing here moves money, changes a price or touches an order or a customer.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { audit } from '@extas/auth';
import { registry, SettingsError, storeTarget, type Key } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { primaryDomain } from './site';

/** The settings the SEO page shows and saves (each PR adds its own). */
export const SEO_KEYS = ['seo.indexing'] as const satisfies readonly Key[];
export type SeoKey = (typeof SEO_KEYS)[number];

const isSeoKey = (k: unknown): k is SeoKey => typeof k === 'string' && (SEO_KEYS as readonly string[]).includes(k);

export interface SeoSnapshot {
  values: { [K in SeoKey]: (typeof registry)[K]['default'] };
  versions: Record<SeoKey, number>;
  defaults: { [K in SeoKey]: (typeof registry)[K]['default'] };
  site: { primary: string | null; staging: string | null; bengaliOn: boolean; bengaliReady: number };
}

/** What the SEO page draws (the caller has checked `seo.read`). */
export async function seoSnapshot(deps: Pick<AdminDeps, 'resolver'>, storeId: number): Promise<SeoSnapshot> {
  const at = { storeId };
  const [resolved, primary, staging, bnOn, ready] = await Promise.all([
    Promise.all(SEO_KEYS.map((k) => deps.resolver.get(k, at))),
    primaryDomain(storeId),
    deps.resolver.value('system.stagingHost', at),
    deps.resolver.value('language.bengali.enabled', at),
    deps.resolver.value('language.bengali.readyPages', at),
  ]);
  const values = Object.fromEntries(SEO_KEYS.map((k, i) => [k, resolved[i]!.value])) as SeoSnapshot['values'];
  const versions = Object.fromEntries(SEO_KEYS.map((k, i) => [k, resolved[i]!.version])) as SeoSnapshot['versions'];
  const defaults = Object.fromEntries(SEO_KEYS.map((k) => [k, registry[k].default])) as SeoSnapshot['defaults'];
  return { values, versions, defaults, site: { primary, staging: staging ?? null, bengaliOn: bnOn, bengaliReady: ready.length } };
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
    }
    return json({ ok: true, ...(await seoSnapshot(d, MOTHER_STORE_ID)) });
  } catch (e) {
    if (e instanceof SettingsError) return fail(400, 'VALIDATION', [...e.issues]);
    return errorResponse(e);
  }
}
