// S13 · PR 274 — Orders › Incomplete: GET the page (`orders.read`, `?view=open|mine|handled`); POST {action: 'assign' |
// 'handled' | 'reopen', id, …} (`orders.confirm`); PUT the settings card (`settings.write`) (lib/admin-orders/incomplete.ts).
// Nothing here messages a customer or places an order.
import { adminDeps } from '@/lib/admin-auth';
import { incompleteHandler } from '@/lib/admin-orders/incomplete';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => incompleteHandler(request, adminDeps());
export const POST = (request: Request) => incompleteHandler(request, adminDeps());
export const PUT = (request: Request) => incompleteHandler(request, adminDeps());
