// S02 · PR 598 (register "Site builder", V2.1 Shimmer control; demo 89t-shimmer.js) — Settings › Shimmer, the server
// side: every shimmer of the shop in one list with its switch (`shop.sweep`, PR 86: the master switch and 12 switches;
// the product page's words and size boxes in `pdp.sweep`), its speed and its strength (`shop.shimmer`, v246), read with
// the version they were read at, and saved together. A save is checked against each setting's schema, refused when
// someone saved in between (STALE), writes only what changed and is audited (`settings.shimmer.save`, before and
// after). Seeing needs `settings.read`, saving `settings.write`. Reduced motion always wins in the shop (lib/shop/sweep.ts).
// Nothing here touches a price, an order or a customer.
import { createHash } from 'node:crypto';
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { registry, storeTarget, type ShopShimmerSettings, type ShopSweepSettings } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { LayoutError, type LayoutDeps, type LayoutWho } from './layouts-admin';

const S = MOTHER_STORE_ID;
const KEYS = ['shop.sweep', 'pdp.sweep', 'shop.shimmer'] as const;
type Key = (typeof KEYS)[number];

export type PdpSweep = (typeof registry)['pdp.sweep']['default'];

export interface ShimmerView {
  sweep: ShopSweepSettings;
  pdp: PdpSweep;
  tune: ShopShimmerSettings;
  version: string;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 16);
const FIELD: Record<Key, 'sweep' | 'pdp' | 'tune'> = { 'shop.sweep': 'sweep', 'pdp.sweep': 'pdp', 'shop.shimmer': 'tune' };

export async function shimmerView(deps: LayoutDeps): Promise<ShimmerView> {
  const [sweep, pdp, tune] = await Promise.all(KEYS.map((k) => deps.resolver.value(k, { storeId: S })));
  return { sweep: sweep as ShopSweepSettings, pdp: pdp as PdpSweep, tune: tune as ShopShimmerSettings, version: versionOf([sweep, pdp, tune]) };
}

/** PUT {sweep, pdp, tune, version}: every switch, speed and strength at once. Audited; nothing written when unchanged. */
export async function saveShimmer(deps: LayoutDeps, who: LayoutWho, input: unknown): Promise<ShimmerView> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const next: Partial<Record<Key, unknown>> = {};
  for (const k of KEYS) {
    const r = registry[k].schema.safeParse(o[FIELD[k]]);
    if (!r.success) throw new LayoutError('INVALID_INPUT', 400, [FIELD[k]]);
    next[k] = r.data;
  }
  const before = await shimmerView(deps);
  if (o.version !== before.version) throw new LayoutError('STALE', 409);
  const how = { actorId: who.actor.staffUserId ?? null, reason: 'Settings › Shimmer' };
  const changed: Key[] = [];
  for (const k of KEYS) {
    if (versionOf(next[k]) === versionOf(before[FIELD[k]])) continue;
    await deps.resolver.set(k, next[k] as never, storeTarget(S), how);
    changed.push(k);
  }
  if (changed.length)
    await audit(deps.db, who.actor, { storeId: S, action: 'settings.shimmer.save', entityType: 'Setting', entityId: changed.join(','), before: { sweep: before.sweep, pdp: before.pdp, tune: before.tune }, after: { sweep: next['shop.sweep'], pdp: next['pdp.sweep'], tune: next['shop.shimmer'] } }, who.ctx);
  return shimmerView(deps);
}

/** /api/admin/settings/shimmer — GET (`settings.read`); PUT (`settings.write`). */
export async function shimmerHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'settings.read' : 'settings.write', storeId: S });
  if (g instanceof Response) return g;
  const d: LayoutDeps = { db: deps!.db, resolver: deps!.resolver };
  try {
    return json({ ok: true, ...(method === 'GET' ? await shimmerView(d) : await saveShimmer(d, { actor: g.actor, ctx: g.ctx }, b)) });
  } catch (e) {
    return e instanceof LayoutError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e);
  }
}
