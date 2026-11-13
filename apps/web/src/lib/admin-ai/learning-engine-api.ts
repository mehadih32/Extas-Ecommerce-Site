// S15 · PR 585 — /api/admin/ai/learning: GET the whole screen (`ai.read`): the master-switch/quality-gate card,
// every source, tip and practice task, newest first. PUT {key:'learningEngine', value, version} saves the card
// (`ai.control`). POST {action, ...} decides which write — each action's own sharper permission checked here, the
// same split `approvals-api.ts` already uses for its generic queue:
//   {action:'addSource', agentKey, kind, url}                                            — `ai.control`
//   {action:'setSourceEnabled', id, enabled}                                              — `ai.control`
//   {action:'archiveSource', id}                                                          — `ai.control`
//   {action:'proposeTip', agentKey, tip, sourceId?}                                       — `ai.skills.write`
//   {action:'verifyTip', tipId, testNote, confidence?, supportingSourceIds?}               — `ai.skills.write`
//   {action:'promoteTip', tipId, name, purpose?}                                           — `ai.skills.write`
//   {action:'createPracticeTask', agentKey, title, goal, deadline?}                        — `ai.control`
//   {action:'gradePracticeTask', id, status, grade?}                                       — `ai.control`
//   {action:'proposePaidTool', agentKey, toolName, costAmount, costCurrency?, reason}       — `ai.control`
// Deciding a `proposeTip`'s own resulting `ai.skill` approval request stays `AI › Approvals`' job
// (`fixes.decideProposal`); deciding a `proposePaidTool`'s own `ai.paidTool` request is that same page's generic
// `decideApproval` (`ai.control`) — neither is this route's.
import { requirePermission } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from '../admin-auth';
import { isFixGateError } from '../admin-health/fixes';
import { isAiError } from './errors';
import {
  addLearningSource,
  archiveLearningSource,
  createPracticeTask,
  gradePracticeTask,
  isLearningEngineError,
  learningEngineCard,
  learningSourcesView,
  learningTipsView,
  practiceTasksView,
  promoteTipToSkill,
  proposeLearningTip,
  proposePaidTool,
  saveLearningEngineCard,
  setLearningSourceEnabled,
  verifyLearningTip,
  type LearningEngineDeps,
  type LearningSourceRow,
  type LearningTipRow,
  type PracticeTaskRow,
} from './learning-engine';

const sourceAnswer = (r: LearningSourceRow) => ({ ...r, lastReadAt: r.lastReadAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() });
const tipAnswer = (r: LearningTipRow) => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() });
const taskAnswer = (r: PracticeTaskRow) => ({ ...r, deadline: r.deadline?.toISOString() ?? null, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() });

export async function learningEngineHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT' && method !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'ai.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d: LearningEngineDeps = { db: deps!.db, resolver: deps!.resolver, now: deps!.now };
  const who = { actor: g.actor, ctx: g.ctx };

  const withScreen = async () => {
    const settings = await d.resolver.value('ai.learningEngine');
    const [sources, tips, tasks] = await Promise.all([learningSourcesView(d), learningTipsView(d), practiceTasksView(d)]);
    return json({
      ok: true,
      card: learningEngineCard(settings),
      sources: sources.map(sourceAnswer),
      tips: tips.map(tipAnswer),
      practiceTasks: tasks.map(taskAnswer),
    });
  };

  try {
    if (method === 'GET') return await withScreen();

    if (method === 'PUT') {
      await requirePermission(deps!.db, g.actor, 'ai.control', { storeId: MOTHER_STORE_ID });
      await saveLearningEngineCard(d, who, await body(request));
      return await withScreen();
    }

    const input = await body(request);
    const action = input.action;

    if (action === 'addSource') {
      await requirePermission(deps!.db, g.actor, 'ai.control', { storeId: MOTHER_STORE_ID });
      await addLearningSource(d, who, input);
      return await withScreen();
    }
    if (action === 'setSourceEnabled') {
      await requirePermission(deps!.db, g.actor, 'ai.control', { storeId: MOTHER_STORE_ID });
      if (!isUuid(input.id)) return json({ ok: false, error: 'INVALID_INPUT', details: ['id'] }, { status: 400 });
      if (typeof input.enabled !== 'boolean') return json({ ok: false, error: 'INVALID_INPUT', details: ['enabled'] }, { status: 400 });
      await setLearningSourceEnabled(d, who, input.id, input.enabled);
      return await withScreen();
    }
    if (action === 'archiveSource') {
      await requirePermission(deps!.db, g.actor, 'ai.control', { storeId: MOTHER_STORE_ID });
      if (!isUuid(input.id)) return json({ ok: false, error: 'INVALID_INPUT', details: ['id'] }, { status: 400 });
      await archiveLearningSource(d, who, input.id);
      return await withScreen();
    }
    if (action === 'proposeTip') {
      await requirePermission(deps!.db, g.actor, 'ai.skills.write', { storeId: MOTHER_STORE_ID });
      await proposeLearningTip(d, who, input);
      return await withScreen();
    }
    if (action === 'verifyTip') {
      await requirePermission(deps!.db, g.actor, 'ai.skills.write', { storeId: MOTHER_STORE_ID });
      await verifyLearningTip(d, who, input);
      return await withScreen();
    }
    if (action === 'promoteTip') {
      await requirePermission(deps!.db, g.actor, 'ai.skills.write', { storeId: MOTHER_STORE_ID });
      await promoteTipToSkill(d, who, input);
      return await withScreen();
    }
    if (action === 'createPracticeTask') {
      await requirePermission(deps!.db, g.actor, 'ai.control', { storeId: MOTHER_STORE_ID });
      await createPracticeTask(d, who, input);
      return await withScreen();
    }
    if (action === 'gradePracticeTask') {
      await requirePermission(deps!.db, g.actor, 'ai.control', { storeId: MOTHER_STORE_ID });
      await gradePracticeTask(d, who, input);
      return await withScreen();
    }
    if (action === 'proposePaidTool') {
      await requirePermission(deps!.db, g.actor, 'ai.control', { storeId: MOTHER_STORE_ID });
      await proposePaidTool(d, who, input);
      return await withScreen();
    }
    return json({ ok: false, error: 'INVALID_INPUT', details: ['action'] }, { status: 400 });
  } catch (e) {
    if (isLearningEngineError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    if (isFixGateError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    if (isAiError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}
