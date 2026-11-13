// S15 · PR 316 — /api/admin/ai/cost-book/calculator: POST {lines, description?, save?} (`ai.control`, the same
// permission the book's own model picks and presets already need). Previews a plan's cost without `save`; with
// `save: true` and a `description`, also persists it onto `AiCostPlan` (`savePlan`) and returns its id. The plan's
// own `totalUsdMicros`/line `totalUsdMicros` (bigint, used only for the exact DB write) never leaves this module —
// the client, like every other Cost Book answer, sees only whole minor-unit money figures.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { isAiError } from './errors';
import { planView, savePlan, type CalculatorLineInput, type CalculatorPlan } from './calculator';

function parseLines(raw: unknown): CalculatorLineInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const lines: CalculatorLineInput[] = [];
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) return null;
    const o = r as Record<string, unknown>;
    if (typeof o.jobTypeKey !== 'string' || !o.jobTypeKey) return null;
    if (typeof o.quantity !== 'number') return null;
    if (o.scale !== undefined && typeof o.scale !== 'number') return null;
    if (o.modelKey !== undefined && o.modelKey !== null && typeof o.modelKey !== 'string') return null;
    lines.push({ jobTypeKey: o.jobTypeKey, quantity: o.quantity, scale: o.scale as number | undefined, modelKey: (o.modelKey as string | null | undefined) ?? null });
  }
  return lines;
}

/** The plan as the client sees it: whole minor-unit money only, never a raw micros bigint. */
function planAnswer(plan: CalculatorPlan) {
  return {
    lines: plan.lines.map((l) => ({
      jobTypeKey: l.jobTypeKey,
      nameEn: l.nameEn,
      nameBn: l.nameBn,
      modelKey: l.modelKey,
      isRecommended: l.isRecommended,
      quantity: l.quantity,
      scale: l.scale,
      perRunUsdMinor: l.perRunUsdMinor,
      totalUsdMinor: l.totalUsdMinor,
      totalStoreMinor: l.totalStoreMinor,
      alternatives: l.alternatives,
    })),
    totalUsdMinor: plan.totalUsdMinor,
    totalStoreMinor: plan.totalStoreMinor,
    recommendationNote: plan.recommendationNote,
  };
}

export async function calculatorHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'ai.control', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver, now: deps!.now };
  try {
    const input = await body(request);
    const lines = parseLines(input.lines);
    if (!lines) return json({ ok: false, error: 'INVALID_INPUT', details: ['lines'] }, { status: 400 });

    if (input.save === true) {
      if (typeof input.description !== 'string' || !input.description.trim()) return json({ ok: false, error: 'INVALID_INPUT', details: ['description'] }, { status: 400 });
      const saved = await savePlan(d, { actor: g.actor, ctx: g.ctx }, MOTHER_STORE_ID, { description: input.description, lines });
      return json({ ok: true, id: saved.id, plan: planAnswer(saved.plan) });
    }

    const plan = await planView(d, MOTHER_STORE_ID, lines);
    return json({ ok: true, plan: planAnswer(plan) });
  } catch (e) {
    if (isAiError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}
