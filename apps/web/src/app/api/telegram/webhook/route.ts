// S15 · PR 584 — /api/telegram/webhook: the agents' shared Telegram bot's own inbound updates (Blueprint C10.3).
// POST only, proven by the `X-Telegram-Bot-Api-Secret-Token` header (the value the owner also gave Telegram's own
// `setWebhook` call) matching the Telegram connection's own `webhookSecret` in the vault — no session, no cookie,
// and the site's password gate lets this one path through (infra/stack/caddy/auth-block.sh). Always answers 200 so
// Telegram never retries the same update forever, even while `ai.telegram.commands.enabled` is off or no webhook
// secret is set yet (A1.3 "mock until a real key"): the body is still read and parsed, but routed nowhere.
// lib/admin-ai/telegram-routing.ts.
import { TELEGRAM_SECRET_HEADER } from '@extas/adapters';
import { adminDeps } from '@/lib/admin-auth';
import { readCapped } from '@/lib/read-capped';
import { handleTelegramWebhook, telegramWebhookMaxBytes } from '@/lib/admin-ai/telegram-routing';

export const dynamic = 'force-dynamic';

const answer = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export async function POST(request: Request): Promise<Response> {
  const deps = adminDeps();
  if (!deps) return answer(503, { ok: false, code: 'UNAVAILABLE' });
  try {
    const maxBytes = await telegramWebhookMaxBytes(deps);
    const length = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(length) && length > maxBytes) return answer(413, { ok: false, code: 'TOO_LARGE' });
    // a chunked body has no Content-Length, so the body is read as a stream and stopped at the limit (the same care
    // the Messenger webhook takes, security m2) — never read to its end into memory.
    const rawBody = await readCapped(request, maxBytes);
    if (rawBody === null) return answer(413, { ok: false, code: 'TOO_LARGE' });
    let parsed: unknown;
    try {
      parsed = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      return answer(200, { ok: false, code: 'BAD_JSON' });
    }
    const r = await handleTelegramWebhook(deps, parsed, request.headers.get(TELEGRAM_SECRET_HEADER));
    return answer(r.status, { ok: r.code === 'OK', code: r.code });
  } catch (e) {
    console.error(`[telegram webhook] ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    return answer(200, { ok: false, code: 'SERVER_ERROR' });
  }
}
