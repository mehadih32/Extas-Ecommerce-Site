// Follow-up 372 — POST /api/courier/steadfast/webhook and /api/courier/pathao/webhook: the couriers' own status calls,
// each proved by the token or secret the owner typed into Keys & connections (lib/courier-webhook.ts, @extas/shipping
// webhooks.ts `receiveCourierWebhook`). Off as shipped (`delivery.courier.webhooks`): every call is answered 404.
import { courierWebhookRoute } from '@/lib/courier-webhook';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: { params: Promise<{ provider: string }> }): Promise<Response> {
  const { provider } = await ctx.params;
  return courierWebhookRoute(request, provider);
}
