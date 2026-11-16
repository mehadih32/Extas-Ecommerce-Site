// PR 1010 — /api/admin/settings/couriers: POST {action, ...} for Settings › Couriers (lib/admin-courier-settings/service.ts).
//   action 'fees'       {courierId, inside, sub, outside, codPct, pin}   a new charge per band and cash fee (`costs.write`, the owner's PIN)
//   action 'connect'    {courierId, connected}                          switch a courier account on or off (`delivery.couriers`)
//   action 'default'    {courierId, from, time}                         default courier, pick-up place and daily time (`delivery.charges`)
//   action 'routing'    {enabled}                                       Different courier by area (`delivery.charges`)
//   action 'autoBook'   {enabled}                                       Auto-booking (`delivery.charges`, and `delivery.book` to switch it on)
import { MOTHER_STORE_ID } from '@extas/db/client';
import { adminDeps, body, fail, guardAdmin, json } from '@/lib/admin-auth';
import { CourierSettingsError, saveDefault, saveFees, setAutoBook, setConnected, setRouting } from '@/lib/admin-courier-settings/service';
import { requireOwnerPin } from '@/lib/owner-pin';
import { shippingDeps, shippingFail } from '@/lib/shipping-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const deps = adminDeps();
  const g = await guardAdmin(request, deps, { permission: 'delivery.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  if (!deps) return fail(503, 'unavailable');
  try {
    const b = await body(request);
    const d = { db: deps.db, resolver: deps.resolver, shipping: await shippingDeps(deps) };
    const who = { actor: g.actor, ctx: g.ctx };
    switch (b.action) {
      case 'fees': {
        // new charges change the profit of every order: the owner's PIN first (prototype: "Needs your PIN")
        await requireOwnerPin(deps, g.actor, g.ctx, b.pin, 'couriers.fees.change', MOTHER_STORE_ID);
        return json({ ok: true, ...(await saveFees(d, who, b, deps.now ? deps.now() : new Date())) });
      }
      case 'connect':
        await setConnected(d, who, b);
        return json({ ok: true });
      case 'default':
        await saveDefault(d, who, b);
        return json({ ok: true });
      case 'routing':
        await setRouting(d, who, b);
        return json({ ok: true });
      case 'autoBook':
        await setAutoBook(d, who, b);
        return json({ ok: true });
      default:
        return json({ ok: false, error: 'INVALID_INPUT', details: ['action'] }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof CourierSettingsError) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return shippingFail(e);
  }
}
