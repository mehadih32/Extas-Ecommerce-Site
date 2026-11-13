// S13 · PR 274 — Orders › Incomplete: GET the page (`orders.read`, `?view=open|mine|handled`); POST {action: 'assign' |
// 'handled' | 'reopen', id, …} (`orders.confirm`); PUT the settings card (`settings.write`) (lib/admin-orders/incomplete.ts).
// PR 668: also 'call' (log a call), 'message' (opens a ready message; nothing is sent) and 'confirmOrder' (a Cash on Delivery
// order from his bag, the website's own checkout).
import { adminDeps } from '@/lib/admin-auth';
import { incompleteHandler } from '@/lib/admin-orders/incomplete';
import { chatOrderDeps } from '@/lib/support-api';

const withPlace = (request: Request) => {
  const deps = adminDeps();
  if (!deps) return incompleteHandler(request, deps);
  const c = chatOrderDeps(deps);
  return incompleteHandler(request, deps, { place: { checkout: c.checkout, afterPlace: async (storeId, orderId) => void (await c.afterPlace?.(storeId, orderId)) } });
};

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => incompleteHandler(request, adminDeps());
export const POST = withPlace;
export const PUT = (request: Request) => incompleteHandler(request, adminDeps());
