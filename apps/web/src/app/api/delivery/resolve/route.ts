// PR 551 — the checkout's address read: a finished line in, the band (or the question to ask) out. Public, same-site,
// size-capped; it reads only the gazetteer and the store's bands, never a customer.
import { adminDeps } from '@/lib/admin-auth';
import { publicResolveHandler } from '@/lib/delivery-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return publicResolveHandler(request, adminDeps());
}
