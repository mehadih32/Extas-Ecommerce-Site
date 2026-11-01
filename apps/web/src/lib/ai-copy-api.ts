// S14 · PR 293 — the AI campaign writer's API (@extas/customers campaign-writer.ts). One route:
//
//   POST /api/admin/messages/ai-copy   {channel: email|sms, locale: bn|en, brief}  →  {copy: {versions, practice, …}}
//
// It signs the staff member in and checks the store; the service checks the channel's write key (`messages.email.write`
// for an e-mail, `messages.templates.write` for an SMS), both switches (`ai.enabled`, `customers.aiWriter`) and what
// the writer gave, and audits the draft. The writer is the shop's AI connection: the practice writer until an AI
// provider's key is in the vault (A1.3). Nothing is saved or sent here; the form shows the versions to pick from.
import { aiWriterAdapters, createConnections, type AiWriter } from '@extas/adapters';
import * as cu from '@extas/customers';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';
import { customersDeps } from './customers-api';

type Deps = Pick<AdminDeps, 'db' | 'resolver' | 'vault'>;

/** The shop's AI connection (falls back to the practice writer while no AI provider is switched on). */
export function campaignWriter(deps: Deps, storeId: number): () => Promise<cu.CampaignWriterLink> {
  return async () => {
    const [testS, cacheS] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
    const c = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: aiWriterAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
    const link = await c.use<AiWriter>('AI_PROVIDER', { storeId });
    return { api: link.api, provider: link.provider, mode: link.mode };
  };
}

export async function aiCopyRoute(request: Request, deps: AdminDeps | null, writer?: () => Promise<cu.CampaignWriterLink>): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  try {
    const copy = await cu.draftCampaignCopy(customersDeps(deps!), { actor: g.actor, storeId: MOTHER_STORE_ID, ctx: g.ctx }, await body(request), writer ?? campaignWriter(deps!, MOTHER_STORE_ID));
    return json({ ok: true, copy });
  } catch (e) {
    if (cu.isCustomersError(e)) return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}) }, { status: e.status });
    return errorResponse(e);
  }
}
