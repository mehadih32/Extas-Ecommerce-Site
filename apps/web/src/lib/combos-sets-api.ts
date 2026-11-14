// S28 · PR 712 (admin prototype v5, Products › Sets) — the page's "More options" card: which kinds of combo count as a set, and the
// stock at or under which a set is marked Low (setting `combos.setsTab`). A display choice; nothing about a set changes.
//
//   GET  /api/admin/combos/sets/options   {cards: {options}}  (combos.read)
//   PUT  /api/admin/combos/sets/options   {key: 'options', value: {types, lowStockAt}, version}  (combos.write; a card read before
//                                          another save: STALE)
import { createHash } from 'node:crypto';
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { combosSetsTabSchema, storeTarget } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';

export interface SetsOptionsCard {
  key: 'options';
  value: { types: string[]; lowStockAt: number };
  version: string;
}

export async function setsOptionsCard(admin: Pick<AdminDeps, 'resolver'>, storeId: number): Promise<SetsOptionsCard> {
  const s = await admin.resolver.value('combos.setsTab', { storeId });
  const value = { types: [...s.types], lowStockAt: s.lowStockAt };
  return { key: 'options', value, version: createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16) };
}

export async function setsOptionsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const m = request.method.toUpperCase();
  if (m !== 'GET' && m !== 'PUT') return fail(405, 'method-not-allowed');
  const storeId = MOTHER_STORE_ID;
  const g = await guardAdmin(request, deps, { permission: m === 'GET' ? 'combos.read' : 'combos.write', storeId });
  if (g instanceof Response) return g;
  try {
    if (m === 'GET') return json({ ok: true, cards: { options: await setsOptionsCard(deps!, storeId) } });
    const b = await body(request);
    if (b.key !== 'options') return fail(400, 'INVALID_INPUT', ['key']);
    const before = await setsOptionsCard(deps!, storeId);
    if (b.version !== before.version) return fail(409, 'STALE');
    const parsed = combosSetsTabSchema.safeParse({ ...before.value, ...(b.value as object) });
    if (!parsed.success) return fail(400, 'INVALID_INPUT', [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
    if (JSON.stringify({ types: parsed.data.types, lowStockAt: parsed.data.lowStockAt }) !== JSON.stringify(before.value)) {
      const key = 'combos.setsTab' as const;
      await deps!.resolver.set(key, parsed.data, storeTarget(storeId), { actorId: g.actor.staffUserId ?? null, reason: 'Products › Sets: options' });
      await audit(deps!.db, g.actor, { storeId, action: 'combos.setsTab.options', entityType: 'Setting', entityId: key, before: { ...before.value }, after: { ...parsed.data } }, { source: 'admin-api', ...g.ctx });
    }
    return json({ ok: true, cards: { options: await setsOptionsCard(deps!, storeId) } });
  } catch (e) {
    return errorResponse(e);
  }
}
