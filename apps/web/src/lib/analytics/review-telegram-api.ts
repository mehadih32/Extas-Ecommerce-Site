// PR 891 — Reports › Monthly review "Send to Telegram": POST /api/admin/reports/review/telegram {text} (`reports.analytics.write`).
// The button used to send the monthly analytics digest, not the review the label names. It now sends the review itself: the page builds
// the message from the very figures and lines it shows (sales, profit, orders, returns, went well, went badly, next steps, and the
// page's link) and this route sends it to the owner's own Telegram. Goes only to the owner; respects the digest switch
// `reports.digest.telegramOn` (off: "skipped"); audited. Nothing goes to a customer or a supplier.
import type { Actor, RequestContext } from '@extas/auth';
import { audit } from '@extas/auth';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { storeIdOf } from '../catalogue-api';
import { telegramSend } from './digest';

/** The longest message accepted (Telegram's own limit is 4096). */
export const REVIEW_TEXT_MAX = 3500; // hardcode-ok: below Telegram's message limit

export async function reviewTelegramHandler(request: Request, deps: AdminDeps | null, send?: (text: string) => Promise<void>): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  const storeId = storeIdOf(new URL(request.url));
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'reports.analytics.write', storeId });
  if (g instanceof Response) return g;
  try {
    const b = await body(request).catch(() => ({}) as Record<string, unknown>);
    const text = typeof b.text === 'string' ? b.text.trim() : '';
    if (!text || text.length > REVIEW_TEXT_MAX) return fail(422, 'INVALID_INPUT');
    const on = await deps!.resolver.value('reports.digest.telegramOn', { storeId });
    let telegram: 'sent' | 'skipped' | 'failed' = 'skipped';
    if (on) {
      try {
        await (send ?? ((x: string) => telegramSend({ db: deps!.db, resolver: deps!.resolver, vault: deps!.vault }, x)))(text);
        telegram = 'sent';
      } catch {
        telegram = 'failed';
      }
    }
    await audit(deps!.db, g.actor as Actor, { storeId, action: 'reports.review.telegram', entityType: 'Report', entityId: 'review', after: { telegram } }, g.ctx as RequestContext);
    return json({ ok: true, sent: { telegram } });
  } catch (e) {
    return errorResponse(e);
  }
}
