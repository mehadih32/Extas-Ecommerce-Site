// PR 1061: on the first add to a bag, note the shop page it was made on and the kind of device (Cart.landingPage,
// Cart.device), for the Incomplete orders report. Only an empty note is filled (the first one stays); quiet: never stops an add.
import type { Prisma } from '@extas/db/client';
import { deviceOf, landingOf } from '../admin-orders/incomplete-report';

export async function noteVisit(db: Pick<Prisma.TransactionClient, 'cart'>, storeId: number, cartId: string, request: Request): Promise<void> {
  try {
    const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || request.headers.get('host');
    const landingPage = landingOf(request.headers.get('referer'), host);
    const device = deviceOf(request.headers.get('user-agent'));
    if (landingPage) await db.cart.updateMany({ where: { id: cartId, storeId, landingPage: null }, data: { landingPage } });
    if (device) await db.cart.updateMany({ where: { id: cartId, storeId, device: null }, data: { device } });
  } catch (e) {
    console.warn(`visit note: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
  }
}
