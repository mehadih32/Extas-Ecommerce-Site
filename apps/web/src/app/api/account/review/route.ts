// PR 65 — the customer's own review of one line of his own order (multipart, because of the photo). It is saved
// waiting for the shop's check; nothing of it is shown before that.
import { mediaDeps } from '@/lib/media';
import { accountApiDeps } from '@/lib/shop/account';
import { reviewHandler } from '@/lib/shop/review-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const account = accountApiDeps();
  return reviewHandler(request, account ? { account, media: mediaDeps() } : null);
}
