// S15 · PR 319 — /api/admin/ai/diary: GET the diary (`ai.read`), with optional `?agent=<key>&days=<n>` filters.
// No POST: every entry is written by an agent itself (`recordDiaryEntry`), the same split PR 315's usage ledger
// already draws for its own table — the owner reads this screen, never types into it.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { diaryView, type DiaryRow } from './diary';
import { isAiError } from './errors';

const rowAnswer = (r: DiaryRow) => ({
  id: r.id,
  storeId: r.storeId,
  agentKey: r.agentKey,
  date: r.date.toISOString(),
  summaryBn: r.summaryBn,
  details: r.details,
  refType: r.refType,
  refId: r.refId,
  createdAt: r.createdAt.toISOString(),
});

export async function diaryHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'GET') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'ai.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver, now: deps!.now };
  const url = new URL(request.url);
  const agent = url.searchParams.get('agent');
  const daysRaw = url.searchParams.get('days');
  const days = daysRaw ? Number(daysRaw) : undefined;
  try {
    const rows = await diaryView(d, MOTHER_STORE_ID, { agentKey: agent, days: Number.isFinite(days) ? days : undefined });
    return json({ ok: true, entries: rows.map(rowAnswer) });
  } catch (e) {
    if (isAiError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}
