// Follow-up 59 — test servers only (EXTAS_SHOP_TEST_PAGES=1): this browser sees the shop with the sample contact.
import { tryContactHandler } from '@/lib/shop/try-contact';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return tryContactHandler(request);
}
