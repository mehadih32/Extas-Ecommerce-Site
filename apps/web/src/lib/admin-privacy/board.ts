// PR 815 (prototype v5 m-settings.js `renderPrivacy`) — the two things the prototype's Data & privacy page does that the cards before it
// did not: "How long things are kept" (old product photos and videos, chat messages; `privacy.keepMonths`) and "Export your data" for
// customers, which asks the owner's PIN first (the file holds phone numbers and addresses) and is written to the activity log by the
// customers export itself (`@extas/customers` exportCustomers: the reason, the person, the rows). Orders and products export through
// their own routes (`orders.export`, `catalogue` CSV); this file only carries the two above.
import { z } from 'zod';
import { isOwner, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { exportCustomers, isCustomersError } from '@extas/customers';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { CHAT_KEEP_MONTHS, INSTALLATION, MEDIA_KEEP_MONTHS, privacyKeepMonthsSchema } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { requireOwnerPin } from '../owner-pin';

/** Written to the export's log line, so the owner can tell this export from a list export on the Customers page. */
export const EXPORT_REASON_TEXT = 'Export from Settings › Data & privacy'; // hardcode-ok: an audit line, not shown to customers

export class PrivacyBoardError extends Error {
  constructor(
    public status: number,
    public code: string,
    public details: string[] = [],
  ) {
    super(code);
  }
}

/** Reads the keep times out of a request body: only the choices the page offers. */
export function parseKeep(raw: unknown): { media: (typeof MEDIA_KEEP_MONTHS)[number]; chat: (typeof CHAT_KEEP_MONTHS)[number] } {
  const r = privacyKeepMonthsSchema.safeParse(raw);
  if (!r.success) throw new PrivacyBoardError(400, 'INVALID_INPUT', r.error.issues.map((i) => i.path.join('.')));
  return r.data;
}

export async function saveKeep(deps: AdminDeps, actor: Actor, raw: unknown): Promise<void> {
  await requirePermission(deps.db, actor, 'security.write', { storeId: MOTHER_STORE_ID });
  const next = parseKeep(raw);
  const cur = await deps.resolver.value('privacy.keepMonths');
  if (cur.media === next.media && cur.chat === next.chat) return;
  await deps.resolver.set('privacy.keepMonths', next, INSTALLATION, { actorId: actor.staffUserId ?? null, reason: 'Settings › Data & privacy: how long things are kept' });
}

/** POST /api/admin/privacy/board: {action: 'keep', media, chat} (`security.write`) · {action: 'exportCustomers', pin} → the CSV (owner, PIN). */
export async function privacyBoardRoute(request: Request, deps: AdminDeps | null): Promise<Response> {
  const g = await guardAdmin(request, deps, { permission: 'security.write', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  if (!deps) return fail(503, 'unavailable');
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  try {
    const b = await body(request);
    if (b.action === 'keep') {
      await saveKeep(deps, g.actor, { media: b.media, chat: b.chat });
      return json({ ok: true });
    }
    if (b.action === 'exportCustomers') {
      const pin = z.string().safeParse(b.pin);
      if (!g.actor.staffUserId || !(await isOwner(deps.db, g.actor.staffUserId))) throw new PrivacyBoardError(403, 'OWNER_ONLY');
      await requireOwnerPin(deps, g.actor, g.ctx, pin.success ? pin.data : null, 'privacy.export.customers', MOTHER_STORE_ID);
      const x = await exportCustomers({ db: deps.db, settings: deps.resolver, now: deps.now }, { actor: g.actor, storeId: MOTHER_STORE_ID, ctx: g.ctx }, { reason: EXPORT_REASON_TEXT });
      return new Response(x.csv, { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${x.fileName}"`, 'cache-control': 'no-store' } });
    }
    return fail(400, 'INVALID_INPUT', ['action']);
  } catch (e) {
    if (e instanceof PrivacyBoardError) return fail(e.status, e.code, e.details.length ? e.details : undefined);
    if (isCustomersError(e)) return json({ ok: false, error: e.code }, { status: e.status });
    return errorResponse(e);
  }
}
