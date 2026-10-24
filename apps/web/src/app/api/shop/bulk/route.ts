// PR 606 — public: the bulk / corporate enquiry, while the owner has the lane on (lib/bulk-api.ts).
import { bulkEnquiryHandler } from '@/lib/bulk-api';
import { checkoutApiDeps } from '@/lib/shop/checkout';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return bulkEnquiryHandler(request, checkoutApiDeps());
}
