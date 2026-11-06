// S12 · PR 251 — public: a reader's comment under a live article, saved waiting for a person (only while
// `blog.comments.on`; signed in only as shipped). Nothing is shown before a person presses Show (lib/journal/comments.ts).
import { shopCommentHandler } from '@/lib/journal/comments';
import { accountApiDeps, customerOfRequest } from '@/lib/shop/account';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  const a = accountApiDeps();
  return shopCommentHandler(
    request,
    a
      ? {
          db: a.accounts.db,
          settings: a.accounts.settings,
          storeId: a.storeId,
          async customer(r) {
            const auth = await customerOfRequest(r, a.accounts, a.storeId);
            return auth ? { id: auth.customer.id, name: auth.customer.name } : null;
          },
        }
      : null,
  );
}
