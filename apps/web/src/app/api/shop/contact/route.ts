// PR 75 follow-up — public: the contact page's form puts a message in the Support inbox (off as shipped).
import { checkoutApiDeps } from '@/lib/shop/checkout';
import { contactHandler } from '@/lib/shop/contact-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return contactHandler(request, checkoutApiDeps());
}
