// S25 · PR 487 — Marketing › Studio › Campaign exports at /admin/marketing/studio/exports: GET the overview
// (`marketing.studio.read`); POST {action: 'preview' | 'request', input} (`marketing.studio.write`). 'preview'
// counts the live products and approved photos a selection covers without writing anything; 'request' prepares a
// `DRAFT` export. Composing the per-size files and sending to an ad account is part 2 (PR 488).
import { MOTHER_STORE_ID } from '@extas/db/client';
import type { Actor, RequestContext } from '@extas/auth';
import { archiveCreativeExport, listCreativeExports, previewCreativeExportSelection, requestCreativeExport, StudioError, type CreativeExportView, type StudioDeps } from '@extas/creative-studio';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';

const S = MOTHER_STORE_ID;

export interface ExportsOverview {
  exports: CreativeExportView[];
  exportEnabled: boolean;
  campaigns: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}

async function pickableCampaigns(deps: AdminDeps): Promise<{ id: string; name: string }[]> {
  const rows = await deps.db.campaign.findMany({ where: { storeId: S, archivedAt: null }, select: { id: true, name: true }, orderBy: { createdAt: 'desc' }, take: 50 });
  return rows.map((c) => ({ id: c.id, name: c.name }));
}

async function pickableCategories(deps: AdminDeps): Promise<{ id: string; name: string }[]> {
  const rows = await deps.db.category.findMany({ where: { storeId: S, archivedAt: null }, select: { id: true, nameEn: true }, orderBy: { nameEn: 'asc' }, take: 100 });
  return rows.map((c) => ({ id: c.id, name: c.nameEn }));
}

export async function exportsOverview(deps: AdminDeps, sd: StudioDeps): Promise<ExportsOverview> {
  const [exports, setting, campaigns, categories] = await Promise.all([listCreativeExports(sd, S), deps.resolver.value('studio.creativeExport', { storeId: S }), pickableCampaigns(deps), pickableCategories(deps)]);
  return { exports, exportEnabled: setting.enabled, campaigns, categories };
}

/**
 * /api/admin/marketing/studio/exports — GET the overview (`marketing.studio.read`); POST
 * {action: 'preview', input: selection} or {action: 'request', input} or {action: 'archive', exportId}
 * (`marketing.studio.write`).
 */
export async function exportsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const permission = method === 'GET' ? 'marketing.studio.read' : 'marketing.studio.write';
  const g = await guardAdmin(request, deps, { permission, storeId: S });
  if (g instanceof Response) return g;
  const sd: StudioDeps = { db: deps!.db, settings: deps!.resolver };
  const who = { actor: g.actor as Actor, storeId: S, ctx: g.ctx as RequestContext };
  try {
    if (method === 'GET') return json({ ok: true, ...(await exportsOverview(deps!, sd)) });
    if (b.action === 'preview') return json({ ok: true, preview: await previewCreativeExportSelection(sd, S, b.input) });
    if (b.action === 'request') return json({ ok: true, export: await requestCreativeExport(sd, who, b.input) });
    const exportId = typeof b.exportId === 'string' ? b.exportId : '';
    if (b.action === 'archive') {
      if (!exportId) throw new StudioError('INVALID_INPUT', 'an export id is needed', ['exportId']);
      return json({ ok: true, export: await archiveCreativeExport(sd, who, exportId) });
    }
    throw new StudioError('INVALID_INPUT', 'unknown action', ['action']);
  } catch (e) {
    return errorResponse(e);
  }
}
