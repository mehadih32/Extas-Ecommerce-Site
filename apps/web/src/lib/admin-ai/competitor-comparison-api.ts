// S15 · PR 336 — POST /api/admin/reports/competitor-comparison {theirSteps, ourSteps: {label, url}[], locale?}: a
// `reports.read` action. Walks both journeys through PR 335's own `walkCompetitorJourney` (the competitor's
// pages and our own matching pages — never a different reader, never a different limit), then builds the
// side-by-side report (PR 336's own `buildCompetitorComparisonReport`). Reachable today even though no
// Competitor Teardown admin page exists yet (the same honest gap PR 331/332/335 already left open for their own
// missing callers) — this is the first PR where the report actually has something worth showing on one.
import { randomUUID } from 'node:crypto';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { storeIdOf } from '../catalogue-api';
import { buildCompetitorComparisonReport } from './competitor-comparison-dispatch';
import { walkCompetitorJourney, type CompetitorJourneyStepInput } from './competitor-journey-dispatch';

const MAX_STEPS = 4;
const LABEL_MAX = 60;

function parsedSteps(raw: unknown): CompetitorJourneyStepInput[] {
  if (!Array.isArray(raw)) return [];
  const out: CompetitorJourneyStepInput[] = [];
  for (const s of raw.slice(0, MAX_STEPS)) {
    const label = typeof (s as { label?: unknown })?.label === 'string' ? (s as { label: string }).label.trim().slice(0, LABEL_MAX) : '';
    const url = typeof (s as { url?: unknown })?.url === 'string' ? (s as { url: string }).url.trim() : '';
    if (label && url) out.push({ label, url });
  }
  return out;
}

export async function competitorComparisonHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'reports.read', storeId });
  if (g instanceof Response) return g;
  try {
    const input = await body(request);
    const locale = input.locale === 'bn' ? 'bn' : 'en';
    const theirSteps = parsedSteps(input.theirSteps);
    const ourSteps = parsedSteps(input.ourSteps);
    if (!theirSteps.length) return fail(400, 'INVALID_INPUT', ['theirSteps']);
    const reportId = randomUUID();
    const walkDeps = { db: deps!.db, resolver: deps!.resolver, vault: deps!.vault, now: deps!.now };
    const [theirs, ours] = await Promise.all([
      walkCompetitorJourney(walkDeps, storeId, reportId, locale, theirSteps),
      ourSteps.length ? walkCompetitorJourney(walkDeps, storeId, reportId, locale, ourSteps) : Promise.resolve([]),
    ]);
    const report = await buildCompetitorComparisonReport(walkDeps, storeId, reportId, locale, theirs, ours);
    return json({ ok: true, reportId, ...report });
  } catch (e) {
    return errorResponse(e);
  }
}
