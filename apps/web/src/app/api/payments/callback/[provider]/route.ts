// S07 · PR 170 — a payment gateway's callback (lib/shop/payment-callback.ts): the signature of our own callback
// address is checked, the gateway is asked, and the browser goes on to the thank-you or the payment page.
import { shopPaymentsDeps } from '@/lib/payments-gateway';
import { paymentCallbackHandler } from '@/lib/shop/payment-callback';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ provider: string }> };

const run = async (request: Request, ctx: Ctx) => paymentCallbackHandler(request, (await ctx.params).provider, await shopPaymentsDeps());

export const GET = run;
export const POST = run;
