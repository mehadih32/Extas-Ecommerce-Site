// S15 · PR 323 — GET /api/admin/ai/training (`ai.read`): the recorded training examples
// (`lib/admin-ai/training.ts`'s `trainingExamplesView`), optionally narrowed with `?agent=<key>` and/or
// `?skill=<key>`. No dashboard page reads this yet — see `training.ts`'s own header comment for why — so this
// endpoint exists only so the data is already real and queryable the day PR 577's agent-profile page is built.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { trainingExamplesView, type TrainingExampleRow } from './training';

const rowAnswer = (r: TrainingExampleRow) => ({ ...r, createdAt: r.createdAt.toISOString() });

export async function trainingHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'GET') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'ai.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const url = new URL(request.url);
  const examples = await trainingExamplesView({ db: deps!.db }, { agentKey: url.searchParams.get('agent'), skillKey: url.searchParams.get('skill') });
  return json({ ok: true, examples: examples.map(rowAnswer) });
}
