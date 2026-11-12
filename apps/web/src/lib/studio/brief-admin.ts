// S25 · PR 490 — Marketing › Studio › Creative brief at /admin/marketing/studio/briefs: GET the overview
// (`marketing.studio.read`); POST {action: 'draft', input} prepares a brief's answers, {action: 'propose' |
// 'archive', briefId} proposes (or re-proposes, "ask for more") the three fixed directions or sets the brief aside,
// and {action: 'choose', briefId, directionIndex} records which one the owner liked (`marketing.studio.write`).
// Nothing downstream is produced from any of this — Blueprint C8.4: "nothing is produced until he has seen a
// direction he likes".
import { MOTHER_STORE_ID } from '@extas/db/client';
import type { Actor, RequestContext } from '@extas/auth';
import { archiveCreativeBrief, chooseCreativeDirection, draftCreativeBrief, listCreativeBriefs, proposeCreativeDirections, StudioError, type CreativeBriefView, type StudioDeps } from '@extas/creative-studio';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';

const S = MOTHER_STORE_ID;

export interface BriefsOverview {
  briefs: CreativeBriefView[];
  briefEnabled: boolean;
  campaigns: { id: string; name: string }[];
  products: { id: string; name: string }[];
}

async function pickableCampaigns(deps: AdminDeps): Promise<{ id: string; name: string }[]> {
  const rows = await deps.db.campaign.findMany({ where: { storeId: S, archivedAt: null }, select: { id: true, name: true }, orderBy: { createdAt: 'desc' }, take: 50 });
  return rows.map((c) => ({ id: c.id, name: c.name }));
}

async function pickableProducts(deps: AdminDeps): Promise<{ id: string; name: string }[]> {
  const rows = await deps.db.product.findMany({ where: { storeId: S, archivedAt: null }, select: { id: true, nameEn: true }, orderBy: { updatedAt: 'desc' }, take: 50 });
  return rows.map((p) => ({ id: p.id, name: p.nameEn }));
}

export async function briefsOverview(deps: AdminDeps, sd: StudioDeps): Promise<BriefsOverview> {
  const [briefs, setting, campaigns, products] = await Promise.all([listCreativeBriefs(sd, S), deps.resolver.value('studio.creativeBrief', { storeId: S }), pickableCampaigns(deps), pickableProducts(deps)]);
  return { briefs, briefEnabled: setting.enabled, campaigns, products };
}

/**
 * /api/admin/marketing/studio/briefs — GET the overview (`marketing.studio.read`); POST {action: 'draft', input} |
 * {action: 'propose' | 'archive', briefId} | {action: 'choose', briefId, directionIndex} (`marketing.studio.write`).
 */
export async function briefsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const permission = method === 'GET' ? 'marketing.studio.read' : 'marketing.studio.write';
  const g = await guardAdmin(request, deps, { permission, storeId: S });
  if (g instanceof Response) return g;
  const sd: StudioDeps = { db: deps!.db, settings: deps!.resolver };
  const who = { actor: g.actor as Actor, storeId: S, ctx: g.ctx as RequestContext };
  try {
    if (method === 'GET') return json({ ok: true, ...(await briefsOverview(deps!, sd)) });
    if (b.action === 'draft') return json({ ok: true, brief: await draftCreativeBrief(sd, who, b.input) });
    const briefId = typeof b.briefId === 'string' ? b.briefId : '';
    if (!briefId) throw new StudioError('INVALID_INPUT', 'a brief id is needed', ['briefId']);
    if (b.action === 'propose') return json({ ok: true, brief: await proposeCreativeDirections(sd, who, briefId) });
    if (b.action === 'archive') return json({ ok: true, brief: await archiveCreativeBrief(sd, who, briefId) });
    if (b.action === 'choose') {
      const directionIndex = typeof b.directionIndex === 'number' ? b.directionIndex : -1;
      return json({ ok: true, brief: await chooseCreativeDirection(sd, who, briefId, directionIndex) });
    }
    throw new StudioError('INVALID_INPUT', 'unknown action', ['action']);
  } catch (e) {
    return errorResponse(e);
  }
}
