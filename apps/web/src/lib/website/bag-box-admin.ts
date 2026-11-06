// S02 · PR 598 (register "Site builder", V2.1 tiered bag offers; demo 89u-bag-offers.js) — Products › Combos › Bag tier
// box, the server side: the bag's "Take 2 │ Take 3 │ Take 4" box: its switch, first and last day, how many tiers it
// shows (up to 4), the phone preview (PR 109's `bag.tiers.*`), and per Build-your-own-set rule whether its tiers show
// and the owner's own words per tier (`bag.tiers.rules`, v247). Saved together with the version they were read at
// (STALE), checked against each schema, audited (`combos.bagbox.save`). Seeing needs `combos.read`, saving
// `combos.write`. The tiers, their prices, dates and targeting are the rules' own (Smart Rules, the owner's): nothing
// here holds, creates or changes a price, a discount or an offer value.
import { createHash } from 'node:crypto';
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { registry, storeTarget, type BagTierRules } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { LayoutError, type LayoutDeps, type LayoutWho } from './layouts-admin';

const S = MOTHER_STORE_ID;
export const BAG_BOX_KEYS = ['bag.tiers.enabled', 'bag.tiers.startsOn', 'bag.tiers.endsOn', 'bag.tiers.max', 'bag.tiers.phonePreview', 'bag.tiers.rules'] as const;
type Key = (typeof BAG_BOX_KEYS)[number];
const FIELD: Record<Key, keyof BagBox> = {
  'bag.tiers.enabled': 'enabled',
  'bag.tiers.startsOn': 'startsOn',
  'bag.tiers.endsOn': 'endsOn',
  'bag.tiers.max': 'max',
  'bag.tiers.phonePreview': 'phonePreview',
  'bag.tiers.rules': 'rules',
};

export interface BagBox {
  enabled: boolean;
  startsOn: string | null;
  endsOn: string | null;
  max: number;
  phonePreview: boolean;
  rules: BagTierRules;
}

export interface BagBoxView {
  box: BagBox;
  version: string;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 16);

export async function bagBoxView(deps: LayoutDeps): Promise<BagBoxView> {
  const vals = await Promise.all(BAG_BOX_KEYS.map((k) => deps.resolver.value(k, { storeId: S })));
  const box = Object.fromEntries(BAG_BOX_KEYS.map((k, i) => [FIELD[k], vals[i]])) as unknown as BagBox;
  return { box, version: versionOf(box) };
}

/** PUT {box, version}: the box's switch, days, size, phone preview, rules shown and words. Audited; nothing written when unchanged. */
export async function saveBagBox(deps: LayoutDeps, who: LayoutWho, input: unknown): Promise<BagBoxView> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const box = o.box && typeof o.box === 'object' ? (o.box as Record<string, unknown>) : {};
  const next: Partial<Record<Key, unknown>> = {};
  for (const k of BAG_BOX_KEYS) {
    const r = registry[k].schema.safeParse(box[FIELD[k]]);
    if (!r.success) throw new LayoutError('INVALID_INPUT', 400, [FIELD[k]]);
    next[k] = r.data;
  }
  const s = next['bag.tiers.startsOn'] as string | null;
  const e = next['bag.tiers.endsOn'] as string | null;
  if (s && e && s > e) throw new LayoutError('INVALID_INPUT', 400, ['endsOn']);
  const before = await bagBoxView(deps);
  if (o.version !== before.version) throw new LayoutError('STALE', 409);
  const how = { actorId: who.actor.staffUserId ?? null, reason: 'Combos › Bag tier box' };
  const changed: Key[] = [];
  for (const k of BAG_BOX_KEYS) {
    if (versionOf(next[k]) === versionOf(before.box[FIELD[k]])) continue;
    await deps.resolver.set(k, next[k] as never, storeTarget(S), how);
    changed.push(k);
  }
  if (changed.length) {
    const after = Object.fromEntries(BAG_BOX_KEYS.map((k) => [FIELD[k], next[k]]));
    await audit(deps.db, who.actor, { storeId: S, action: 'combos.bagbox.save', entityType: 'Setting', entityId: changed.join(','), before: { ...before.box }, after }, who.ctx);
  }
  return bagBoxView(deps);
}

/** /api/admin/combos/bag-box — GET (`combos.read`); PUT (`combos.write`). */
export async function bagBoxHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'combos.read' : 'combos.write', storeId: S });
  if (g instanceof Response) return g;
  const d: LayoutDeps = { db: deps!.db, resolver: deps!.resolver };
  try {
    return json({ ok: true, ...(method === 'GET' ? await bagBoxView(d) : await saveBagBox(d, { actor: g.actor, ctx: g.ctx }, b)) });
  } catch (e) {
    return e instanceof LayoutError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e);
  }
}
