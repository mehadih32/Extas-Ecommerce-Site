// S06 · PR 559 — the phone-entry risk check's two settings cards on Orders › Risk rules, the admin API (path after
// /api/admin/risk):
//   GET  /api/admin/risk/phone-risk  both cards ({cards: {phoneRisk, pattern}}) (risk.rules.read)
//   PUT  /api/admin/risk/phone-risk  {key: 'phoneRisk' | 'pattern', value, version} (risk.rules.write, audited):
//        `phoneRisk` is the setting `checkout.phoneRisk` (the switch, each courier check's time, how long an answer is
//        kept); `pattern` is the owner's `pattern` signal inside `risk.signals` (its switch, weight, how many outcomes,
//        the failed share, the half-life) — saved into the whole set, the other signals untouched. A screen read before
//        someone else's save is STALE (the pattern's version covers the whole signal set).
// Nothing here blocks anyone, holds an order or touches COD, a price or a charge: the pattern only adds its weight to
// the score, and what a score leads to is the owner's levels and layers.
import { createHash } from 'node:crypto';
import { audit, requirePermission } from '@extas/auth';
import { checkoutPhoneRiskSchema, riskSignalsSchema, storeTarget, type CheckoutPhoneRisk, type RiskSignals } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { storeIdOf } from '../shipping-api';

export interface PhoneRiskCards {
  phoneRisk: { key: 'phoneRisk'; value: CheckoutPhoneRisk; version: string };
  pattern: { key: 'pattern'; value: RiskSignals['pattern']; version: string };
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export async function phoneRiskCards(deps: Pick<AdminDeps, 'resolver'>, storeId: number): Promise<PhoneRiskCards> {
  const [phoneRisk, signals] = await Promise.all([deps.resolver.value('checkout.phoneRisk', { storeId }), deps.resolver.value('risk.signals', { storeId })]);
  return { phoneRisk: { key: 'phoneRisk', value: phoneRisk, version: versionOf(phoneRisk) }, pattern: { key: 'pattern', value: signals.pattern, version: versionOf(signals) } };
}

const issues = (e: { issues: { path: PropertyKey[] }[] }) => [...new Set(e.issues.map((i) => String(i.path[0] ?? 'value')))];

/** /api/admin/risk/phone-risk (GET, PUT). */
export async function phoneRiskSettingsRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  if (path.length !== 1) return fail(404, 'not-found');
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const storeId = storeIdOf(new URL(request.url));
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'risk.rules.read', storeId });
  if (g instanceof Response) return g;
  const d = deps!;
  if (method === 'GET') return json({ ok: true, cards: await phoneRiskCards(d, storeId) });
  try {
    await requirePermission(d.db, g.actor, 'risk.rules.write', { storeId });
  } catch (e) {
    return errorResponse(e);
  }
  const input = await body(request);
  if (input.key !== 'phoneRisk' && input.key !== 'pattern') return fail(400, 'INVALID_INPUT', ['key']);
  const before = await phoneRiskCards(d, storeId);
  const by = { actorId: g.actor.staffUserId ?? null, reason: 'Risk rules › Phone-entry check' };
  if (input.key === 'phoneRisk') {
    if (input.version !== before.phoneRisk.version) return fail(409, 'STALE');
    const ok = checkoutPhoneRiskSchema.safeParse(isObj(input.value) ? input.value : null);
    if (!ok.success) return fail(400, 'INVALID_INPUT', issues(ok.error));
    if (JSON.stringify(ok.data) !== JSON.stringify(before.phoneRisk.value)) {
      await d.resolver.set('checkout.phoneRisk', ok.data, storeTarget(storeId), by);
      await audit(d.db, g.actor, { storeId, action: 'checkout.phoneRisk.save', entityType: 'Setting', entityId: 'checkout.phoneRisk', before: { ...before.phoneRisk.value }, after: { ...ok.data } }, g.ctx);
    }
  } else {
    if (input.version !== before.pattern.version) return fail(409, 'STALE');
    const signals = await d.resolver.value('risk.signals', { storeId });
    const ok = riskSignalsSchema.safeParse({ ...signals, pattern: isObj(input.value) ? input.value : null });
    if (!ok.success) return fail(400, 'INVALID_INPUT', [...new Set(ok.error.issues.map((i) => String(i.path[1] ?? i.path[0] ?? 'value')))]);
    if (JSON.stringify(ok.data.pattern) !== JSON.stringify(before.pattern.value)) {
      await d.resolver.set('risk.signals', ok.data, storeTarget(storeId), by);
      await audit(d.db, g.actor, { storeId, action: 'risk.signals.pattern.save', entityType: 'Setting', entityId: 'risk.signals', before: { ...before.pattern.value }, after: { ...ok.data.pattern } }, g.ctx);
    }
  }
  return json({ ok: true, cards: await phoneRiskCards(d, storeId) });
}
