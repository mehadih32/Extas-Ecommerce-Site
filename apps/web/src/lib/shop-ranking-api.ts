// S28 · PR 686 (admin prototype v5, Products › Shop ranking) — the admin API of the shop ranking. Same door as the rest of
// the catalogue API (`handle`: guardAdmin with the permission in `?storeId=`); @extas/catalogue checks the permission again.
//
//   GET   /api/admin/catalogue/ranking?w=sales:35,conv:20,…   the order as it would be now ("try other weights" without saving) —
//                                                              `catalogue.read`
//   POST  /api/admin/catalogue/ranking                         {action: 'save', weights?} puts the order on the shop (the weights
//                                                              tried are kept as the owner's) · {action: 'pin', productId, pin:
//                                                              'TOP'|'DOWN'|null} — `catalogue.write`
//   GET   /api/admin/catalogue/ranking/options                 the "More options" card {cards: {options}}
//   PUT   /api/admin/catalogue/ranking/options                 {key: 'options', value: {freshDays, coverDays, autoApply}, version}
//                                                              (`catalogue.write`; a screen read before another save: STALE)
// Nothing here moves money or changes a price; the shop shows no score.
import { createHash } from 'node:crypto';
import { audit } from '@extas/auth';
import * as cat from '@extas/catalogue';
import { shopRankingSchema, storeTarget, type ShopRankingSettings } from '@extas/settings';
import { body, fail, isUuid, type AdminDeps } from './admin-auth';
import { handle } from './catalogue-api';
import { sellableReader } from './shop/sellable';

const method = (r: Request) => r.method.toUpperCase();
const notAllowed = () => Promise.resolve(fail(405, 'method-not-allowed'));
const KEYS = ['sales', 'conv', 'margin', 'stock', 'fresh'] as const;

/** `?w=sales:35,conv:20,…` → the weights, or null when absent or not whole numbers (the page then shows the saved weights). */
export function weightsFromQuery(raw: string | null): ShopRankingSettings['weights'] | null {
  if (!raw) return null;
  const out: Record<string, number> = {};
  for (const part of raw.split(',')) {
    const [k, v] = part.split(':');
    if (!k || !(KEYS as readonly string[]).includes(k) || v === undefined || !/^\d{1,2}$/.test(v)) return null;
    out[k] = Number(v);
  }
  return KEYS.every((k) => k in out) ? (out as ShopRankingSettings['weights']) : null;
}

/** The catalogue deps with the shop's sellable-stock reader, for the stock part of the score. */
export const rankingDeps = (admin: Pick<AdminDeps, 'db' | 'resolver' | 'now'>, storeId: number): cat.CatalogueDeps => ({ db: admin.db, settings: admin.resolver, now: admin.now, sellable: sellableReader(admin.db, admin.resolver, storeId) });

export function rankingHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const m = method(request);
  if (m === 'GET') {
    return handle(request, deps, 'catalogue.read', async (c) => ({ view: await cat.rankingView(rankingDeps(deps!, c.who.storeId), c.who, weightsFromQuery(c.url.searchParams.get('w')) ?? undefined) }));
  }
  if (m !== 'POST') return notAllowed();
  return handle(request, deps, 'catalogue.write', async (c) => {
    const b = await body(request);
    const d = rankingDeps(deps!, c.who.storeId);
    if (b.action === 'save') {
      const weights = b.weights as ShopRankingSettings['weights'] | undefined;
      const out = await cat.saveRankingOrder(d, c.who, weights ? { weights } : undefined);
      if (weights) {
        // the weights the owner saved the order with become his weights
        const key = 'shop.ranking' as const;
        const before = await deps!.resolver.value(key, { storeId: c.who.storeId });
        if (JSON.stringify(before.weights) !== JSON.stringify(weights)) {
          const next = shopRankingSchema.parse({ ...before, weights });
          await deps!.resolver.set(key, next, storeTarget(c.who.storeId), { actorId: c.who.actor.staffUserId ?? null, reason: 'Products › Shop ranking: weights' });
        }
      }
      return { saved: out };
    }
    if (b.action === 'pin') {
      if (!isUuid(b.productId)) return fail(400, 'INVALID_INPUT', ['productId']);
      return { pin: await cat.setRankPin(d, c.who, b.productId, (b.pin ?? null) as cat.RankPin | null) };
    }
    return fail(400, 'INVALID_INPUT', ['action']);
  });
}

// ---- "More options": how many days count as new, healthy stock, and the nightly order by itself ------------------------

export interface RankingOptionsCard {
  key: 'options';
  value: { freshDays: number; coverDays: number; autoApply: boolean };
  version: string;
}

export async function rankingOptionsCard(admin: Pick<AdminDeps, 'resolver'>, storeId: number): Promise<RankingOptionsCard> {
  const s = await admin.resolver.value('shop.ranking', { storeId });
  const value = { freshDays: s.freshDays, coverDays: s.coverDays, autoApply: s.autoApply };
  return { key: 'options', value, version: createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16) };
}

export function rankingOptionsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const m = method(request);
  if (m === 'GET') return handle(request, deps, 'catalogue.read', async (c) => ({ cards: { options: await rankingOptionsCard(deps!, c.who.storeId) } }));
  if (m !== 'PUT') return notAllowed();
  return handle(request, deps, 'catalogue.write', async (c) => {
    const b = await body(request);
    if (b.key !== 'options') return fail(400, 'INVALID_INPUT', ['key']);
    const before = await rankingOptionsCard(deps!, c.who.storeId);
    if (b.version !== before.version) return fail(409, 'STALE');
    const key = 'shop.ranking' as const;
    const cur = await deps!.resolver.value(key, { storeId: c.who.storeId });
    const parsed = shopRankingSchema.safeParse({ ...cur, ...(b.value as object) });
    if (!parsed.success) return fail(400, 'INVALID_INPUT', [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
    if (JSON.stringify(parsed.data) !== JSON.stringify(cur)) {
      await deps!.resolver.set(key, parsed.data, storeTarget(c.who.storeId), { actorId: c.who.actor.staffUserId ?? null, reason: 'Products › Shop ranking: options' });
      await audit(deps!.db, c.who.actor, { storeId: c.who.storeId, action: 'shop.ranking.options', entityType: 'Setting', entityId: key, before: { ...before.value }, after: { freshDays: parsed.data.freshDays, coverDays: parsed.data.coverDays, autoApply: parsed.data.autoApply } }, { source: 'admin-api', ...c.who.ctx });
    }
    return { cards: { options: await rankingOptionsCard(deps!, c.who.storeId) } };
  });
}
