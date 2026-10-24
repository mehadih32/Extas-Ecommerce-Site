// PR 65 — which lines of his order he may still review, and what he has written already.
import { mediaDeps } from '@/lib/media';
import { accountApiDeps } from '@/lib/shop/account';
import { reviewStateHandler } from '@/lib/shop/review-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const account = accountApiDeps();
  return reviewStateHandler(request, account ? { account, media: mediaDeps() } : null);
}
