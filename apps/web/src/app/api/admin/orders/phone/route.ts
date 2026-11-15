// S28 · PR 730 — Orders › All orders › Phone order: GET ?q= (products to pick), GET ?phone= (is the caller a customer), POST
// {action: 'quote' | 'create', …} (`orders.confirm`). The order is placed by the website's own checkout (lib/admin-orders/phone-order.ts).
import { adminDeps } from '@/lib/admin-auth';
import { phoneOrderHandler } from '@/lib/admin-orders/phone-order';
import { chatOrderDeps } from '@/lib/support-api';

export const dynamic = 'force-dynamic';

const handle = (request: Request) =>
  phoneOrderHandler(request, adminDeps(), (d) => {
    const c = chatOrderDeps(d);
    return { db: d.db, resolver: d.resolver, now: d.now, checkout: c.checkout, afterPlace: async (storeId, orderId) => void (await c.afterPlace?.(storeId, orderId)) };
  });

export const GET = handle;
export const POST = handle;
