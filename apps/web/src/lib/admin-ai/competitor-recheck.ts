// S15 · PR 337 (Blueprint B8.4) — the saved competitor's own recheck: walks its one saved page again through PR
// 335's own `walkCompetitorJourney` (the SAME SSRF-safe reader, the SAME grounded AI observation, never a second
// implementation), saves the result as a new `CompetitorReport`, and compares it against that competitor's own
// most recent prior report — pure, deterministic code, never an AI guess (the same "pure code decides the match,
// never the model" discipline PR 336's own `pairCompetitorSteps` already set). When a real change is found, it is
// the diary's own honest note — Blueprint B8.4's "tells the owner when a competitor changes something".
//
// **Honest, structural gap, stated plainly rather than worked around:** this PR does not wire an AUTOMATIC
// schedule. `Competitor.schedule` and `nextDueAt` below are a preview only, the exact same shape PR 308 already
// shipped for `AiAgent.schedule` ("no AI job runner reads a schedule yet, so this is a preview only"). The reason
// is structural, not an oversight: every AI 360 dispatcher this chain has built (PR 304–336, the cost book, the
// usage ledger, the spend cap, the data-class routing, the diary) lives under `apps/web/src/lib/admin-ai`, reached
// only from this Next.js app's own API routes — never from `@extas/jobs`, the separate background-worker process
// (its own `queue`/`worker.ts`, started as its own process) that runs every other store's scheduled sweep (the
// daily audience refresh, the ad-spend import, the money report). Wiring a real automatic re-check needs either a
// cross-process trigger (the worker calling back into this app over HTTP) or moving the whole AI 360 dispatch
// layer into a shared package — both are cross-cutting infrastructure decisions that touch every one of the 12
// dispatchers already merged in this chain, not something one PR decides unilaterally. Flagged here, in the
// register and in PROGRESS.md's own follow-ups, for the owner/FIX lane to decide. "Run now" always works today,
// with no schedule at all.
import { createHash, randomUUID } from 'node:crypto';
import type { PrismaClient, Prisma } from '@extas/db/client';
import type { Actor, RequestContext } from '@extas/auth';
import { AiError } from './errors';
import { getCompetitor, type CompetitorListDeps, type CompetitorView } from './competitor-list';
import { walkCompetitorJourney, type CompetitorJourneyAiDeps, type CompetitorJourneyStepResult } from './competitor-journey-dispatch';
import { recordDiaryEntry } from './diary';

export { isDue, nextDueAt, type CompetitorSchedule } from './competitor-schedule';

const CHANGE_FIELD_LABEL_BN: Record<'title' | 'blocked' | 'note', string> = { title: 'শিরোনাম', blocked: 'পাতা পড়া যাচ্ছে কিনা', note: 'এআই-র পর্যবেক্ষণ' };
const MAX_DIFF_TEXT_CHARS = 300; // hardcode-ok: a storage ceiling for a saved diff field, not a business number

export interface CompetitorFieldChange {
  field: 'title' | 'blocked' | 'note';
  from: string | null;
  to: string | null;
}

export interface CompetitorDiff {
  /** `false` on the competitor's very first run — nothing to compare against yet, never a fabricated "no change". */
  hasPrior: boolean;
  changed: boolean;
  changes: CompetitorFieldChange[];
}

function cut(s: string | null): string | null {
  return s == null ? null : s.length > MAX_DIFF_TEXT_CHARS ? `${s.slice(0, MAX_DIFF_TEXT_CHARS)}…` : s;
}

/**
 * Pure, deterministic — never an AI guess (PR 336's own discipline). Compares only the step's own already-walked
 * fields (title, whether it is readable at all, the grounded observation) — never a price, never anything PR
 * 335's own walk did not already return.
 */
export function diffCompetitorFindings(prev: CompetitorJourneyStepResult | null, curr: CompetitorJourneyStepResult): CompetitorDiff {
  if (!prev) return { hasPrior: false, changed: false, changes: [] };
  const changes: CompetitorFieldChange[] = [];
  if ((prev.title ?? null) !== (curr.title ?? null)) changes.push({ field: 'title', from: cut(prev.title), to: cut(curr.title) });
  if (prev.blocked !== curr.blocked) changes.push({ field: 'blocked', from: prev.blocked ? 'blocked' : 'ok', to: curr.blocked ? 'blocked' : 'ok' });
  if ((prev.note ?? null) !== (curr.note ?? null)) changes.push({ field: 'note', from: cut(prev.note), to: cut(curr.note) });
  return { hasPrior: true, changed: changes.length > 0, changes };
}

interface FindingsJson {
  label: string;
  url: string;
  title: string | null;
  blocked: boolean;
  blockReason: string | null;
  note: string | null;
}

function asFindings(json: Prisma.JsonValue): CompetitorJourneyStepResult | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const f = json as unknown as FindingsJson;
  if (typeof f.label !== 'string' || typeof f.url !== 'string' || typeof f.blocked !== 'boolean') return null;
  return { label: f.label, url: f.url, title: f.title ?? null, blocked: f.blocked, blockReason: f.blockReason ?? null, note: f.note ?? null };
}

export interface RecheckDeps extends CompetitorListDeps, CompetitorJourneyAiDeps {
  db: PrismaClient;
}

export interface Who {
  actor: Actor;
  ctx: RequestContext;
}

export interface RecheckResult {
  competitor: CompetitorView;
  result: CompetitorJourneyStepResult;
  diff: CompetitorDiff;
}

/** Walks the competitor's own one saved page, saves the report, diffs it against the most recent prior one, and
 * — only on a genuine change past the first run — writes one honest diary line (Blueprint B8.4). Never throws on
 * the page read itself (PR 335's own walker never does); throws only `NOT_FOUND` for an unknown/archived id. */
export async function recheckCompetitor(deps: RecheckDeps, who: Who, storeId: number, competitorId: string, locale: 'en' | 'bn' = 'en'): Promise<RecheckResult> {
  const row = await deps.db.competitor.findFirst({ where: { id: competitorId, storeId, archivedAt: null } });
  if (!row) throw new AiError(404, 'NOT_FOUND', ['id']);

  const walkId = randomUUID();
  const [result] = await walkCompetitorJourney(deps, storeId, walkId, locale, [{ label: row.name, url: row.url }]);

  const previous = await deps.db.competitorReport.findFirst({ where: { competitorId }, orderBy: { createdAt: 'desc' } });
  const prevFindings = previous ? asFindings(previous.findings) : null;
  const diff = diffCompetitorFindings(prevFindings, result!);

  await deps.db.competitorReport.create({
    data: {
      storeId,
      competitorId,
      findings: result as unknown as Prisma.InputJsonValue,
      diff: diff.hasPrior ? (diff as unknown as Prisma.InputJsonValue) : undefined,
    },
  });
  await deps.db.competitor.update({ where: { id: competitorId }, data: { lastRunAt: new Date() } });

  if (diff.hasPrior && diff.changed) {
    const fields = diff.changes.map((c) => CHANGE_FIELD_LABEL_BN[c.field]).join(', ');
    const idempotencyKey = `competitor-change:${competitorId}:${createHash('sha1').update(JSON.stringify(result)).digest('hex')}`;
    await recordDiaryEntry(
      { db: deps.db, resolver: deps.resolver, now: deps.now },
      { storeId, agentKey: 'gyani', summaryBn: `প্রতিদ্বন্দ্বী "${row.name}"-এর পাতায় পরিবর্তন ধরা পড়েছে — ${fields} বদলেছে।`, refType: 'CompetitorChange', refId: idempotencyKey },
    );
  }

  const competitor = await getCompetitor(deps, storeId, competitorId, deps.now?.() ?? new Date());
  return { competitor, result: result!, diff };
}

export const COMPETITOR_REPORTS_DEFAULT_ROWS = 20; // hardcode-ok: a display row count, not a business number
export const COMPETITOR_REPORTS_MAX_ROWS = 50; // hardcode-ok: a display row count, not a business number

export async function listCompetitorReports(deps: CompetitorListDeps, storeId: number, competitorId: string, limit = COMPETITOR_REPORTS_DEFAULT_ROWS): Promise<Array<{ id: string; findings: CompetitorJourneyStepResult | null; diff: CompetitorDiff | null; createdAt: string }>> {
  const exists = await deps.db.competitor.findFirst({ where: { id: competitorId, storeId } });
  if (!exists) throw new AiError(404, 'NOT_FOUND', ['competitorId']);
  const rows = await deps.db.competitorReport.findMany({ where: { competitorId }, orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(limit, 1), COMPETITOR_REPORTS_MAX_ROWS) });
  return rows.map((r) => ({ id: r.id, findings: asFindings(r.findings), diff: r.diff ? (r.diff as unknown as CompetitorDiff) : null, createdAt: r.createdAt.toISOString() }));
}
