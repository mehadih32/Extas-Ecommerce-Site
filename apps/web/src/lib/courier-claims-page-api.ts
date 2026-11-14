// S28 · PR 711 (admin prototype v5, Couriers › Claims & payouts) — the page's "More options" card: how many claims and how
// many of the latest payout requests the page lists at once (setting `delivery.courier.claimsPage`). A display size only.
//
//   GET  /api/admin/delivery/claims-overview/options   {cards: {options}}  (delivery.read)
//   PUT  /api/admin/delivery/claims-overview/options   {key: 'options', value: {claimRows, payoutRows}, version}  (settings.write;
//                                                       a card read before another save: STALE)
import { createHash } from 'node:crypto';
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { courierClaimsPageSchema, storeTarget } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';

export interface ClaimsPageCard {
  key: 'options';
  value: { claimRows: number; payoutRows: number };
  version: string;
}

export async function claimsPageCard(admin: Pick<AdminDeps, 'resolver'>, storeId: number): Promise<ClaimsPageCard> {
  const s = await admin.resolver.value('delivery.courier.claimsPage', { storeId });
  const value = { claimRows: s.claimRows, payoutRows: s.payoutRows };
  return { key: 'options', value, version: createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16) };
}

export async function claimsPageHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const m = request.method.toUpperCase();
  if (m !== 'GET' && m !== 'PUT') return fail(405, 'method-not-allowed');
  const storeId = MOTHER_STORE_ID;
  const g = await guardAdmin(request, deps, { permission: m === 'GET' ? 'delivery.read' : 'settings.write', storeId });
  if (g instanceof Response) return g;
  try {
    if (m === 'GET') return json({ ok: true, cards: { options: await claimsPageCard(deps!, storeId) } });
    const b = await body(request);
    if (b.key !== 'options') return fail(400, 'INVALID_INPUT', ['key']);
    const before = await claimsPageCard(deps!, storeId);
    if (b.version !== before.version) return fail(409, 'STALE');
    const parsed = courierClaimsPageSchema.safeParse({ ...before.value, ...(b.value as object) });
    if (!parsed.success) return fail(400, 'INVALID_INPUT', [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
    if (JSON.stringify(parsed.data) !== JSON.stringify(before.value)) {
      const key = 'delivery.courier.claimsPage' as const;
      await deps!.resolver.set(key, parsed.data, storeTarget(storeId), { actorId: g.actor.staffUserId ?? null, reason: 'Couriers › Claims & payouts: list sizes' });
      await audit(deps!.db, g.actor, { storeId, action: 'delivery.claimsPage.options', entityType: 'Setting', entityId: key, before: { ...before.value }, after: { ...parsed.data } }, { source: 'admin-api', ...g.ctx });
    }
    return json({ ok: true, cards: { options: await claimsPageCard(deps!, storeId) } });
  } catch (e) {
    return errorResponse(e);
  }
}
