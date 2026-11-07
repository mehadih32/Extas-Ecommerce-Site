// S02 · PR 66 follow-up 183 — public: a customer's question about a live product, saved waiting for the team (only
// while `pdp.qaAsk.on`; signed in only as shipped). Nothing is shown before the team answers and publishes it.
import { askHandler } from '@/lib/shop/question-ask';
import { accountApiDeps, customerOfRequest } from '@/lib/shop/account';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  const a = accountApiDeps();
  return askHandler(
    request,
    a
      ? {
          db: a.accounts.db,
          settings: a.accounts.settings,
          storeId: a.storeId,
          async customer(r) {
            const auth = await customerOfRequest(r, a.accounts, a.storeId);
            return auth ? { id: auth.customer.id } : null;
          },
        }
      : null,
  );
}
