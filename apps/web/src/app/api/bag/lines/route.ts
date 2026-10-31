// PR 105 — public: put an item in the bag (the bag is made on the first add; the visitor's cookie names it).
// PR 415: a failure here (5xx or a throw) is recorded as a customer problem on the bag step (lib/problems/server.ts).
import { watchShop } from '@/lib/problems/server';
import { addLineHandler } from '@/lib/shop/bag-api';
import { bagApiDeps } from '@/lib/shop/bag-deps';

export const dynamic = 'force-dynamic';

export const POST = watchShop('bag', '/api/bag/lines', (request: Request) => addLineHandler(request, bagApiDeps()));
