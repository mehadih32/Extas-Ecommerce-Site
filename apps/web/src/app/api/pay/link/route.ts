// S06 · PR 542 — public: the advance pay link's answers ("Pay" on a real gateway, the test page's paid / failed, "Try
// again"). The token in the body is the key; same site only (lib/shop/pay-link.ts).
import { payLinkApiDeps, payLinkHandler } from '@/lib/shop/pay-link';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return payLinkHandler(request, payLinkApiDeps());
}
