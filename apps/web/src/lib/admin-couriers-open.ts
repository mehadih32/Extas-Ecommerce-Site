// S28 · PR 670 — opens the default courier's Courier 360 (the courier chosen in Delivery settings, else the first courier in
// use); with no courier yet, the Couriers list, where one is added. `section` names the Courier 360 section to open.
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as sh from '@extas/shipping';
import { adminDeps } from './admin-auth';
import { ADMIN_LOGIN } from './admin-nav';
import { pageAccess } from './admin-page';
import { shippingDeps } from './shipping-api';

export async function openDefaultCourier(here: string, section?: string, from?: 'money' | 'reports', permission: 'delivery.read' = 'delivery.read'): Promise<never> {
  const deps = adminDeps();
  const access = await pageAccess(permission, deps, MOTHER_STORE_ID);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind !== 'ok') redirect('/admin/delivery/couriers');
  const who: sh.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const first = (await sh.listCouriers(await shippingDeps(access.deps), who)).couriers.find((c) => !c.archived);
  // `from`: the menu the person came from (Finance or Reports), so the page keeps that section's tab bar (PR 727).
  const q = [section ? `s=${section}` : '', from ? `from=${from}` : ''].filter(Boolean).join('&');
  redirect(first ? `/admin/delivery/couriers/${first.id}${q ? `?${q}` : ''}` : '/admin/delivery/couriers');
}
