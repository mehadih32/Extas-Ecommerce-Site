// S15 · PR 584 — /api/admin/ai/agents/telegram: GET whether Telegram commands are on and whether the webhook
// secret is set (`ai.read`). POST {enabled: boolean} flips the switch (`ai.control`, audited, a no-op on a double
// tap — see `setTelegramCommandsEnabled`). The same convention as `model-qualification-api.ts`.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { guardAdmin, body, errorResponse, fail, json, type AdminDeps } from '../admin-auth';
import { isTelegramCommandsEnabled, setTelegramCommandsEnabled, telegramWebhookSecret } from './telegram-routing';

export async function telegramRoutingHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'ai.read' : 'ai.control', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver, vault: deps!.vault };
  const who = { actor: g.actor, ctx: g.ctx };
  const withView = async () => {
    const [enabled, secretSet] = await Promise.all([isTelegramCommandsEnabled(d), telegramWebhookSecret(d).then((s) => s !== null)]);
    return json({ ok: true, enabled, secretSet });
  };
  try {
    if (method === 'GET') return withView();
    const input = await body(request);
    if (typeof input.enabled !== 'boolean') return json({ ok: false, error: 'INVALID_INPUT', details: ['enabled'] }, { status: 400 });
    await setTelegramCommandsEnabled(d, who, input.enabled);
    return withView();
  } catch (e) {
    return errorResponse(e);
  }
}
