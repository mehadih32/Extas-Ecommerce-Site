// S08 · PR 186 — the exchange request from the customer's own account (multipart, because of the photos). It opens a
// REQUESTED exchange for staff to approve; nothing is booked or paid here. Paths: lib/shop/exchange-api.ts.
import { mediaDeps } from '@/lib/media';
import { accountApiDeps } from '@/lib/shop/account';
import { exchangeHandler } from '@/lib/shop/exchange-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const account = accountApiDeps();
  return exchangeHandler(request, account ? { account, media: mediaDeps() } : null);
}
