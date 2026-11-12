// S25 · PR 487 — Marketing › Studio › Campaign exports at /admin/marketing/studio/exports: GET the overview
// (`marketing.studio.read`); POST {action: 'preview' | 'request' | 'archive', ...} (`marketing.studio.write`).
// 'preview' counts the live products and approved photos a selection covers without writing anything; 'request'
// prepares a `DRAFT` export.
// S25 · PR 488 — {action: 'queue' | 'run'} (`marketing.studio.write`) move the export on to `APPROVED`;
// {action: 'download'} (`marketing.studio.write`) and {action: 'send', adAccountId} (`marketing.studio.approve`,
// checked in addition to the write permission every POST already needs) land it on `PUBLISHED`.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { can, type Actor, type RequestContext } from '@extas/auth';
import {
  archiveCreativeExport,
  listCreativeExports,
  markCreativeExportDownloaded,
  previewCreativeExportSelection,
  queueCreativeExport,
  requestCreativeExport,
  runCreativeExport,
  sendCreativeExportToAdAccount,
  StudioError,
  type CreativeExportView,
  type StudioDeps,
} from '@extas/creative-studio';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';

const S = MOTHER_STORE_ID;

export interface ExportsOverview {
  exports: CreativeExportView[];
  exportEnabled: boolean;
  campaigns: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  adAccounts: { id: string; name: string; platform: string }[];
  canSend: boolean;
}

async function pickableCampaigns(deps: AdminDeps): Promise<{ id: string; name: string }[]> {
  const rows = await deps.db.campaign.findMany({ where: { storeId: S, archivedAt: null }, select: { id: true, name: true }, orderBy: { createdAt: 'desc' }, take: 50 });
  return rows.map((c) => ({ id: c.id, name: c.name }));
}

async function pickableCategories(deps: AdminDeps): Promise<{ id: string; name: string }[]> {
  const rows = await deps.db.category.findMany({ where: { storeId: S, archivedAt: null }, select: { id: true, nameEn: true }, orderBy: { nameEn: 'asc' }, take: 100 });
  return rows.map((c) => ({ id: c.id, name: c.nameEn }));
}

async function pickableAdAccounts(deps: AdminDeps): Promise<{ id: string; name: string; platform: string }[]> {
  const rows = await deps.db.adAccount.findMany({ where: { storeId: S, archivedAt: null }, select: { id: true, name: true, platform: true }, orderBy: { name: 'asc' }, take: 50 });
  return rows.map((a) => ({ id: a.id, name: a.name, platform: a.platform }));
}

export async function exportsOverview(deps: AdminDeps, sd: StudioDeps, actor?: Actor): Promise<ExportsOverview> {
  const [exports, setting, campaigns, categories, adAccounts, canSend] = await Promise.all([
    listCreativeExports(sd, S),
    deps.resolver.value('studio.creativeExport', { storeId: S }),
    pickableCampaigns(deps),
    pickableCategories(deps),
    pickableAdAccounts(deps),
    actor ? can(deps.db, actor, 'marketing.studio.approve', { storeId: S }) : Promise.resolve(false),
  ]);
  return { exports, exportEnabled: setting.enabled, campaigns, categories, adAccounts, canSend };
}

/**
 * /api/admin/marketing/studio/exports — GET the overview (`marketing.studio.read`); POST
 * {action: 'preview', input: selection} | {action: 'request', input} | {action: 'archive' | 'queue' | 'run' |
 * 'download', exportId} (`marketing.studio.write`); {action: 'send', exportId, adAccountId} needs
 * `marketing.studio.approve` as well (Blueprint C8.5: "one click sends them to the connected ad account" is the
 * owner's OK, not every writer's).
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
    if (method === 'GET') return json({ ok: true, ...(await exportsOverview(deps!, sd, who.actor)) });
    if (b.action === 'preview') return json({ ok: true, preview: await previewCreativeExportSelection(sd, S, b.input) });
    if (b.action === 'request') return json({ ok: true, export: await requestCreativeExport(sd, who, b.input) });
    const exportId = typeof b.exportId === 'string' ? b.exportId : '';
    if (b.action === 'archive') {
      if (!exportId) throw new StudioError('INVALID_INPUT', 'an export id is needed', ['exportId']);
      return json({ ok: true, export: await archiveCreativeExport(sd, who, exportId) });
    }
    if (b.action === 'queue') {
      if (!exportId) throw new StudioError('INVALID_INPUT', 'an export id is needed', ['exportId']);
      return json({ ok: true, export: await queueCreativeExport(sd, who, exportId) });
    }
    if (b.action === 'run') {
      if (!exportId) throw new StudioError('INVALID_INPUT', 'an export id is needed', ['exportId']);
      return json({ ok: true, export: await runCreativeExport(sd, who, exportId) });
    }
    if (b.action === 'download') {
      if (!exportId) throw new StudioError('INVALID_INPUT', 'an export id is needed', ['exportId']);
      return json({ ok: true, export: await markCreativeExportDownloaded(sd, who, exportId) });
    }
    if (b.action === 'send') {
      const adAccountId = typeof b.adAccountId === 'string' ? b.adAccountId : '';
      if (!exportId || !adAccountId) throw new StudioError('INVALID_INPUT', 'an export id and an ad account are needed', ['exportId', 'adAccountId']);
      if (!(await can(deps!.db, who.actor, 'marketing.studio.approve', { storeId: S }))) return fail(403, 'forbidden');
      return json({ ok: true, export: await sendCreativeExportToAdAccount(sd, who, exportId, adAccountId) });
    }
    throw new StudioError('INVALID_INPUT', 'unknown action', ['action']);
  } catch (e) {
    return errorResponse(e);
  }
}
