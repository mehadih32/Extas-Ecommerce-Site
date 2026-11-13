// S15 · PR 580 — /api/admin/ai/models: GET the Model picks screen (`ai.read`). POST (`ai.control`, audited, every
// shape a no-op on a double tap) takes one of:
//   {enabled: boolean}                        — the feature's own off/on switch
//   {jobKey, barPercent: 90|95|98}             — one job's own quality bar
//   {jobKey, retest: true}                     — re-test one job's own candidates now
//   {retestAll: true}                          — re-test every job
//   {jobKey, accept: true}                     — accept one job's own suggestion
//   {acceptAll: true}                          — accept every job's own suggestion
//   {jobKey, modelKey: string | null}          — pick a model by hand (same as the Cost Book's own selector)
// Every shape ends by handing back the fresh screen, the same convention as `cost-book-api.ts`.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { setJobSelectedModel } from './cost-book';
import { acceptAllSuggestions, acceptSuggestion, isAiError, isModelKey, modelSuggestionsView, runModelQualification, runModelQualificationAll, setJobQualityBar, setModelAutoSuggestEnabled } from './model-qualification';

export async function modelQualificationHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'ai.read' : 'ai.control', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver, now: deps!.now };
  const who = { actor: g.actor, ctx: g.ctx };
  const withScreen = async () => json({ ok: true, ...(await modelSuggestionsView(d, MOTHER_STORE_ID)) });
  try {
    if (method === 'GET') return withScreen();
    const input = await body(request);

    if (typeof input.enabled === 'boolean') {
      await setModelAutoSuggestEnabled(d, who, input.enabled, MOTHER_STORE_ID);
      return withScreen();
    }
    if (input.retestAll === true) {
      await runModelQualificationAll(d, who, MOTHER_STORE_ID);
      return withScreen();
    }
    if (input.acceptAll === true) {
      await acceptAllSuggestions(d, who, MOTHER_STORE_ID);
      return withScreen();
    }

    const jobKey = typeof input.jobKey === 'string' ? input.jobKey : '';
    if (!jobKey) return json({ ok: false, error: 'INVALID_INPUT', details: ['jobKey'] }, { status: 400 });

    if (typeof input.barPercent === 'number') {
      await setJobQualityBar(d, who, jobKey, input.barPercent);
      return withScreen();
    }
    if (input.retest === true) {
      await runModelQualification(d, who, jobKey, MOTHER_STORE_ID);
      return withScreen();
    }
    if (input.accept === true) {
      await acceptSuggestion(d, who, jobKey, MOTHER_STORE_ID);
      return withScreen();
    }
    if (input.modelKey !== undefined) {
      if (input.modelKey !== null && (typeof input.modelKey !== 'string' || !isModelKey(input.modelKey))) return json({ ok: false, error: 'UNKNOWN_MODEL', details: ['modelKey'] }, { status: 422 });
      await setJobSelectedModel(d, who, jobKey, input.modelKey);
      return withScreen();
    }
    return json({ ok: false, error: 'INVALID_INPUT', details: [] }, { status: 400 });
  } catch (e) {
    if (isAiError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}
