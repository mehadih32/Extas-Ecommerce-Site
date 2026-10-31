// S08 · PR 193 — Delivery › Delivery settings (demo 97t-adm2-delivery.js /admin/delivery/settings): its cards, first the
// holiday mode (`delivery.holiday`, Blueprint B1.14) — the break's first and last day, the notice on the shop and the
// checkout's "ships from …" during the break. Other cards of the demo's page join with their PRs.
//
//   GET  /api/admin/delivery/settings   the page's cards with their versions (`delivery.read`)
//   PUT  /api/admin/delivery/settings   {key, value, version} one card saved whole; a card changed by someone else in
//                                       between is STALE (`delivery.charges`, as the demo's page asks; audited, and in
//                                       the settings change log with who)
// Off as shipped. Nothing here moves money, changes a price, a delivery charge or Cash on Delivery, and nothing closes
// the shop: the catalogue and checkout stay open (B1.14).
import { createHash } from 'node:crypto';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { holidaySchema, storeTarget } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';

const S = MOTHER_STORE_ID;
/** The keys this page saves (one card each). */
export const DELIVERY_SETTING_KEYS = ['delivery.holiday'] as const;
export type DeliverySettingKey = (typeof DELIVERY_SETTING_KEYS)[number];

export interface DeliverySettingCard {
  key: DeliverySettingKey;
  value: Record<string, unknown>;
  version: string;
}

export class DeliverySettingsError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details: string[] = [],
  ) {
    super(code);
  }
}

interface Who {
  actor: Actor;
  ctx: RequestContext;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

type Deps = Pick<AdminDeps, 'db' | 'resolver'>;

/** The page's cards with their versions (`delivery.read`). */
export async function deliverySettingCards(deps: Deps, who: Who): Promise<Record<DeliverySettingKey, DeliverySettingCard>> {
  await requirePermission(deps.db, who.actor, 'delivery.read', { storeId: S });
  const holiday = (await deps.resolver.value('delivery.holiday', { storeId: S })) as unknown as Record<string, unknown>;
  return { 'delivery.holiday': { key: 'delivery.holiday', value: holiday, version: versionOf(holiday) } };
}

/** Saves one card whole (`delivery.charges`): checked against its schema and the version the page showed; audited. */
export async function saveDeliverySetting(deps: Deps, who: Who, input: unknown): Promise<Record<DeliverySettingKey, DeliverySettingCard>> {
  await requirePermission(deps.db, who.actor, 'delivery.charges', { storeId: S });
  if (!isObj(input) || input.key !== 'delivery.holiday') throw new DeliverySettingsError('INVALID_INPUT', 400, ['key']);
  const before = await deps.resolver.value('delivery.holiday', { storeId: S });
  if (input.version !== versionOf(before)) throw new DeliverySettingsError('STALE', 409);
  const ok = holidaySchema.safeParse(input.value);
  if (!ok.success) throw new DeliverySettingsError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (versionOf(ok.data) !== versionOf(before)) {
    await deps.resolver.set('delivery.holiday', ok.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Delivery › Delivery settings › Holiday mode' });
    await audit(deps.db, who.actor, { storeId: S, action: 'delivery.holiday.save', entityType: 'Setting', entityId: 'delivery.holiday', before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return deliverySettingCards(deps, who);
}

/** /api/admin/delivery/settings — GET the cards (`delivery.read`), PUT one card (`delivery.charges`). */
export async function deliverySettingsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'delivery.read' : 'delivery.charges', storeId: S });
  if (g instanceof Response) return g;
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    const cards = method === 'GET' ? await deliverySettingCards(deps!, who) : await saveDeliverySetting(deps!, who, await body(request));
    return json({ ok: true, cards });
  } catch (e) {
    if (e instanceof DeliverySettingsError) return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}) }, { status: e.status });
    return errorResponse(e);
  }
}
