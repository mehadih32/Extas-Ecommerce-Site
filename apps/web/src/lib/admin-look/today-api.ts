// PR 631 (CN-036) — the Lumen Today page's own settings cards (`admin.today`, registry v237): PUT
// /api/admin/dashboard/today with one card's switch and numbers, as the shared settings cards send them
// (components/admin/lumen/SettingCards.tsx: `{ key, on, values }`). Two cards:
// - `feed`: the live feed of the newest orders; off = 0 rows, on = `values.rows` (1–20).
// - `goal`: the monthly goal ring; `values.amount` is the goal in whole units of the shop's currency (kept in minor units).
// Needs `settings.write` (the owner holds it); the change goes through the settings resolver (who and when, the
// change log) and the audit log. A goal is a target to look at: it moves no money and changes no price or order.
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { adminTodaySchema, adminTodaySettings, storeTarget, type AdminToday } from '@extas/settings';
import { moneyOf } from '@/components/admin/products/model';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';

const S = MOTHER_STORE_ID;

/** The new `admin.today` from one card's change, or null when the card or its numbers are not readable. */
/** `unit`: minor units in one whole unit of the shop's currency (100 for taka). */
export function todayAfter(before: AdminToday, input: Record<string, unknown>, unit: number): AdminToday | null {
  const values = input.values && typeof input.values === 'object' ? (input.values as Record<string, unknown>) : {};
  const on = input.on === true;
  if (input.on !== true && input.on !== false) return null;
  const whole = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);
  let next: AdminToday;
  if (input.key === 'feed') {
    const rows = whole(values.rows);
    if (on && (rows === null || rows < 1)) return null;
    next = { ...before, liveRows: on ? rows! : 0 };
  } else if (input.key === 'goal') {
    const amount = whole(values.amount);
    if (amount === null) return null;
    next = { ...before, goal: { on, amountMinor: amount * unit } };
  } else return null;
  const ok = adminTodaySchema.safeParse(next);
  return ok.success ? ok.data : null;
}

export async function todayHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'settings.write', storeId: S });
  if (g instanceof Response) return g;
  const { db, resolver } = deps!;
  try {
    const before = ((await resolver.value('admin.today', { storeId: S })) as AdminToday | undefined) ?? adminTodaySettings['admin.today'].default;
    const currency = (await resolver.value('store.currency', { storeId: S })) as string;
    const next = todayAfter(before, await body(request), 10 ** moneyOf(currency, 'en').digits);
    if (!next) return fail(400, 'INVALID_INPUT');
    await resolver.set('admin.today', next, storeTarget(S), { actorId: g.actor.staffUserId ?? null, reason: 'Today › page settings' });
    await audit(db, g.actor, { storeId: S, action: 'admin.today.settings', entityType: 'Setting', entityId: 'admin.today', before: { ...before }, after: { ...next } }, g.ctx);
    return json({ ok: true, value: next });
  } catch (e) {
    return errorResponse(e);
  }
}
