// S15 · PR 319/320 — /api/admin/ai/diary: GET both halves of the one diary screen (`ai.read`), with optional
// `?agent=<key>&days=<n>` filters shared by both: `entries` (PR 319, what each agent did) and `bugReports` (PR
// 320, what an agent could not do). No POST: every row on this screen is written by an agent itself
// (`recordDiaryEntry`/`reportCouldNotDo`), the same split PR 315's usage ledger already draws for its own table —
// the owner reads this screen, never types into it.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { bugBoxView, type BugReportRow } from './bugbox';
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

const bugAnswer = (r: BugReportRow) => ({
  id: r.id,
  storeId: r.storeId,
  agentKey: r.agentKey,
  title: r.title,
  description: r.description,
  status: r.status,
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
  const filter = { agentKey: agent, days: Number.isFinite(days) ? days : undefined };
  try {
    const [entries, bugReports] = await Promise.all([diaryView(d, MOTHER_STORE_ID, filter), bugBoxView(d, MOTHER_STORE_ID, filter)]);
    return json({ ok: true, entries: entries.map(rowAnswer), bugReports: bugReports.map(bugAnswer) });
  } catch (e) {
    if (isAiError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}
