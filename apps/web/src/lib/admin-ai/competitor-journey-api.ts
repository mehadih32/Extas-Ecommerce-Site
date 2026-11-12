// S15 · PR 335 — POST /api/admin/reports/competitor-walk {steps: {label, url}[], locale?}: a `reports.read`
// action (reading a competitor's own public page costs nothing itself; only the optional AI observation on top
// spends from the AI usage ledger within Gyani's own cap, the same additive shape every dispatcher before this one
// uses). Reachable today even though no Competitor Teardown admin page exists yet — Blueprint B8.4's own page
// needs PR 336's comparison/report engine to have something worth showing (a side-by-side table against EXTAS);
// an honest gap, the same shape PR 331/332 already left open for their own missing callers.
import { randomUUID } from 'node:crypto';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { storeIdOf } from '../catalogue-api';
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

export async function competitorWalkHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'reports.read', storeId });
  if (g instanceof Response) return g;
  try {
    const input = await body(request);
    const locale = input.locale === 'bn' ? 'bn' : 'en';
    const steps = parsedSteps(input.steps);
    if (!steps.length) return fail(400, 'INVALID_INPUT', ['steps']);
    const walkId = randomUUID();
    const result = await walkCompetitorJourney({ db: deps!.db, resolver: deps!.resolver, vault: deps!.vault, now: deps!.now }, storeId, walkId, locale, steps);
    return json({ ok: true, walkId, steps: result });
  } catch (e) {
    return errorResponse(e);
  }
}
