// Follow-up 546 (PR 614) — the "Exchange settings" card of Orders › Returns › ERP returns: the v6 exchange settings
// (`exchange.erp.*`) where they are used (CN-018), under /api/admin/returns/erp/settings:
//   GET  the card {key: 'exchange', value, version} (`returns.view`)
//   PUT  {key: 'exchange', value, version} (`settings.write` too, audited `exchange.erp.settings.save`); a screen read
//        before someone else's save is refused with STALE (409), a value out of range with INVALID_INPUT naming it
// The card's value is flat for the screen's fields: the pieces kept for regular orders (`exchange.erp.keepForOrders`)
// and the retry of a send that found the ERP unreachable (`exchange.erp.retryUnreachable`, registry v272, off).
// Nothing here sends anything to the ERP, moves money or changes a price.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { audit, requirePermission } from '@extas/auth';
import { exchangeRetrySchema, registry, storeTarget } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { storeIdOf } from '../shipping-api';

export const EXCHANGE_SETTINGS_REASON = 'Orders › Returns › ERP returns';

export const exchangeCardSchema = z
  .object({
    keepForOrders: registry['exchange.erp.keepForOrders'].schema,
    retryUnreachable: exchangeRetrySchema.shape.enabled,
    retryAfterMinutes: exchangeRetrySchema.shape.afterMinutes,
  })
  .strict();
export type ExchangeCardValue = z.output<typeof exchangeCardSchema>;

export interface ExchangeCard {
  key: 'exchange';
  value: ExchangeCardValue;
  version: string;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The card as the screen shows it, read from the store's settings. */
export async function exchangeCard(deps: Pick<AdminDeps, 'resolver'>, storeId: number): Promise<ExchangeCard> {
  const [keep, retry] = await Promise.all([deps.resolver.value('exchange.erp.keepForOrders', { storeId }), deps.resolver.value('exchange.erp.retryUnreachable', { storeId })]);
  const value: ExchangeCardValue = { keepForOrders: keep, retryUnreachable: retry.enabled, retryAfterMinutes: retry.afterMinutes };
  return { key: 'exchange', value, version: versionOf(value) };
}

/** /api/admin/returns/erp/settings (GET, PUT). */
export async function exchangeSettingsRoute(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const storeId = storeIdOf(new URL(request.url));
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'returns.view', storeId });
  if (g instanceof Response) return g;
  const d = deps!;
  if (method === 'GET') return json({ ok: true, cards: { exchange: await exchangeCard(d, storeId) } });
  try {
    await requirePermission(d.db, g.actor, 'settings.write', { storeId });
  } catch (e) {
    return errorResponse(e);
  }
  const input = await body(request);
  if (input.key !== 'exchange') return fail(400, 'INVALID_INPUT', ['key']);
  const before = await exchangeCard(d, storeId);
  if (input.version !== before.version) return fail(409, 'STALE');
  const ok = exchangeCardSchema.safeParse(isObj(input.value) ? input.value : null);
  if (!ok.success) return fail(400, 'INVALID_INPUT', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  const next = ok.data;
  if (JSON.stringify(next) !== JSON.stringify(before.value)) {
    const meta = { actorId: g.actor.staffUserId ?? null, reason: EXCHANGE_SETTINGS_REASON };
    if (next.keepForOrders !== before.value.keepForOrders) await d.resolver.set('exchange.erp.keepForOrders', next.keepForOrders, storeTarget(storeId), meta);
    if (next.retryUnreachable !== before.value.retryUnreachable || next.retryAfterMinutes !== before.value.retryAfterMinutes)
      await d.resolver.set('exchange.erp.retryUnreachable', { enabled: next.retryUnreachable, afterMinutes: next.retryAfterMinutes }, storeTarget(storeId), meta);
    await audit(d.db, g.actor, { storeId, action: 'exchange.erp.settings.save', entityType: 'Setting', entityId: 'exchange.erp', before: { ...before.value }, after: { ...next } }, g.ctx);
  }
  return json({ ok: true, cards: { exchange: await exchangeCard(d, storeId) } });
}
