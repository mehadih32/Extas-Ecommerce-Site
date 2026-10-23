// PR 91–95 — public: a combo page's counts (opened, colours picked) and the price of its exact picks.
import { comboEventHandler } from '@/lib/shop/bag-api';
import { bagApiDeps } from '@/lib/shop/bag-deps';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return comboEventHandler(request, bagApiDeps());
}
