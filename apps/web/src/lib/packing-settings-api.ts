// S20 · PR 404 — Orders › Packing & print: the documents' settings cards, each on the page where it is used (CN-018):
// first the print run's (what one press prints, `fulfilment.printRun`) and the courier sticker's size and printer
// (`delivery.sticker.layout`, PR 179; until now only shown). Later S20 PRs add their cards to this list.
//
//   GET  /api/admin/packing/settings   the cards with their versions (`fulfilment.read`)
//   PUT  /api/admin/packing/settings   {key, value, version} one card saved whole; a card changed by someone else in
//                                      between is STALE (`fulfilment.printSettings`; audited, and in the settings
//                                      change log with who)
// Nothing here prints, books or changes an order, a parcel, a price, a charge or COD.
import { createHash } from 'node:crypto';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { printRunSchema, stickerLayoutSchema, storeTarget } from '@extas/settings';
import type { ZodType } from 'zod';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';

const S = MOTHER_STORE_ID;
/** The keys these pages save (one card each). */
export const PACKING_SETTING_KEYS = ['fulfilment.printRun', 'delivery.sticker.layout'] as const;
export type PackingSettingKey = (typeof PACKING_SETTING_KEYS)[number];

/** Each card's schema, its line in the settings change log and its audit action. */
const CARDS: Record<PackingSettingKey, { schema: ZodType<Record<string, unknown>>; reason: string; action: string }> = {
  'fulfilment.printRun': { schema: printRunSchema, reason: 'Orders › Packing & print › Print run › What to print', action: 'fulfilment.printRun.save' },
  'delivery.sticker.layout': { schema: stickerLayoutSchema as unknown as ZodType<Record<string, unknown>>, reason: 'Orders › Packing & print › Print run › Sticker and printer', action: 'delivery.sticker.layout.save' },
};

const isKey = (k: unknown): k is PackingSettingKey => typeof k === 'string' && (PACKING_SETTING_KEYS as readonly string[]).includes(k);

export interface PackingSettingCard {
  key: PackingSettingKey;
  value: Record<string, unknown>;
  version: string;
}

export class PackingSettingsError extends Error {
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

/** The cards with their versions (`fulfilment.read`). */
export async function packingSettingCards(deps: Deps, who: Who): Promise<Record<PackingSettingKey, PackingSettingCard>> {
  await requirePermission(deps.db, who.actor, 'fulfilment.read', { storeId: S });
  const entries = await Promise.all(
    PACKING_SETTING_KEYS.map(async (key) => {
      const value = (await deps.resolver.value(key, { storeId: S })) as unknown as Record<string, unknown>;
      return [key, { key, value, version: versionOf(value) }] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<PackingSettingKey, PackingSettingCard>;
}

/** Saves one card whole (`fulfilment.printSettings`): checked against its schema and the version the page showed; audited. */
export async function savePackingSetting(deps: Deps, who: Who, input: unknown): Promise<Record<PackingSettingKey, PackingSettingCard>> {
  await requirePermission(deps.db, who.actor, 'fulfilment.printSettings', { storeId: S });
  if (!isObj(input) || !isKey(input.key)) throw new PackingSettingsError('INVALID_INPUT', 400, ['key']);
  const key = input.key;
  const card = CARDS[key];
  const before = await deps.resolver.value(key, { storeId: S });
  if (input.version !== versionOf(before)) throw new PackingSettingsError('STALE', 409);
  const ok = card.schema.safeParse(input.value);
  if (!ok.success) throw new PackingSettingsError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (versionOf(ok.data) !== versionOf(before)) {
    await deps.resolver.set(key, ok.data as never, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: card.reason });
    await audit(deps.db, who.actor, { storeId: S, action: card.action, entityType: 'Setting', entityId: key, before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return packingSettingCards(deps, who);
}

/** /api/admin/packing/settings — GET the cards (`fulfilment.read`), PUT one card (`fulfilment.printSettings`). */
export async function packingSettingsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'fulfilment.read' : 'fulfilment.printSettings', storeId: S });
  if (g instanceof Response) return g;
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    const cards = method === 'GET' ? await packingSettingCards(deps!, who) : await savePackingSetting(deps!, who, await body(request));
    return json({ ok: true, cards });
  } catch (e) {
    if (e instanceof PackingSettingsError) return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}) }, { status: e.status });
    return errorResponse(e);
  }
}
