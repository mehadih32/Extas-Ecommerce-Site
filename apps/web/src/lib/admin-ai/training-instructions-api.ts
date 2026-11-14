// S28 · PR 713 — /api/admin/ai/training/instructions: GET the screen (`ai.read`): the instructions, the forbidden topics and the newest
// versions. PUT {key:'options', value:{versionRows}, version} saves the page's "More options" card (`ai.control`). POST {action, base, ...}
// changes the instructions (`ai.control`): add / remove {agent, text}, addForbidden / removeForbidden {text}, restore {versionId};
// `base` is the version the screen showed (an older one: 409 STALE). lib/admin-ai/training-instructions.ts. (PR 323's own GET
// /api/admin/ai/training, the recorded corrections, is untouched.)
import { createHash } from 'node:crypto';
import { audit, requirePermission } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { aiTrainingPageSchema, INSTALLATION } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { isAiError } from './errors';
import { changeInstructions, instructionState, instructionVersions } from './training-instructions';

export interface TrainingOptionsCard {
  key: 'options';
  value: { versionRows: number };
  version: string;
}

export async function instructionsOptionsCard(admin: Pick<AdminDeps, 'resolver'>): Promise<TrainingOptionsCard> {
  const s = await admin.resolver.value('ai.trainingPage');
  const value = { versionRows: s.versionRows };
  return { key: 'options', value, version: createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16) };
}

export async function instructionsScreen(deps: Pick<AdminDeps, 'db' | 'resolver'>) {
  const card = await instructionsOptionsCard(deps);
  const [state, versions] = await Promise.all([instructionState(deps), instructionVersions(deps, card.value.versionRows)]);
  return { card, state, versions };
}

export async function instructionsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const m = request.method.toUpperCase();
  if (m !== 'GET' && m !== 'PUT' && m !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'ai.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = deps!;
  const answer = async () => {
    const s = await instructionsScreen(d);
    return json({ ok: true, cards: { options: s.card }, training: s.state, versions: s.versions.rows.map((v) => ({ ...v, at: v.at.toISOString() })), versionTotal: s.versions.total });
  };
  try {
    if (m === 'GET') return await answer();
    await requirePermission(d.db, g.actor, 'ai.control', { storeId: MOTHER_STORE_ID });
    const b = await body(request);
    if (m === 'POST') {
      await changeInstructions({ db: d.db }, { actor: g.actor, ctx: g.ctx }, b);
      return await answer();
    }
    if (b.key !== 'options') return fail(400, 'INVALID_INPUT', ['key']);
    const before = await instructionsOptionsCard(d);
    if (b.version !== before.version) return fail(409, 'STALE');
    const parsed = aiTrainingPageSchema.safeParse({ ...before.value, ...(b.value as object) });
    if (!parsed.success) return fail(400, 'INVALID_INPUT', [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
    if (parsed.data.versionRows !== before.value.versionRows) {
      await d.resolver.set('ai.trainingPage', parsed.data, INSTALLATION, { actorId: g.actor.staffUserId ?? null, reason: 'AI › Training: options' });
      await audit(d.db, g.actor, { action: 'ai.trainingPage.options', entityType: 'Setting', entityId: 'ai.trainingPage', before: { ...before.value }, after: { ...parsed.data } }, g.ctx);
    }
    return await answer();
  } catch (e) {
    if (isAiError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}
