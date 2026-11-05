// PR 622 (CN-034) — public: "Buy again" puts a past order's lines back in the bag (the signed-in customer's order, or the
// one this browser placed); nothing is ordered. Off until the owner turns `account.reorder` on.
import { watchShop } from '@/lib/problems/server';
import { accountDeps, customerOfRequest } from '@/lib/shop/account';
import { reorderHandler } from '@/lib/shop/bag-api';
import { bagApiDeps } from '@/lib/shop/bag-deps';

export const dynamic = 'force-dynamic';

export const POST = watchShop('bag', '/api/bag/reorder', async (request: Request) => {
  const me = await customerOfRequest(request, accountDeps());
  return reorderHandler(request, bagApiDeps(), me?.customer.id ?? null);
});
