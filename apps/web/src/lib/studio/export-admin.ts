// S25 · PR 487 (Blueprint C8.1, C8.5) — Marketing › Studio › Export at /admin/marketing/studio/export: requests a
// campaign creative export from a real product, SKU or category of this store that already has at least one
// approved image or video (`marketing.studio.read` to see, `marketing.studio.write` to request or cancel). GET
// lists requested exports (`marketing.studio.read`); POST {action: 'request', input} requests one, or
// {action: 'cancel', exportId} cancels a still-DRAFT one (`marketing.studio.write`).
//
// S25 · PR 488 — {action: 'produce', exportId} (`marketing.studio.write`) produces a DRAFT/FAILED export: the
// honest-preview producer, never a real crop — see `@extas/creative-studio`'s `export.ts` header comment.
import { MOTHER_STORE_ID } from '@extas/db/client';
import type { Actor, RequestContext } from '@extas/auth';
import { cancelCreativeExport, listCreativeExports, produceCreativeExport, requestCreativeExport, StudioError, type CreativeExportView, type StudioDeps } from '@extas/creative-studio';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';

const S = MOTHER_STORE_ID;

export interface ExportsOverview {
  exports: CreativeExportView[];
}

export async function exportsOverview(sd: StudioDeps): Promise<ExportsOverview> {
  const exports = await listCreativeExports(sd, S);
  return { exports };
}

const isUuidLike = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

/**
 * /api/admin/marketing/studio/export — GET the overview (`marketing.studio.read`); POST {action: 'request', input}
 * or {action: 'cancel', exportId} (`marketing.studio.write`).
 */
export async function exportsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const permission = method === 'GET' ? 'marketing.studio.read' : 'marketing.studio.write';
  const g = await guardAdmin(request, deps, { permission, storeId: S });
  if (g instanceof Response) return g;
  const sd: StudioDeps = { db: deps!.db };
  const who = { actor: g.actor as Actor, storeId: S, ctx: g.ctx as RequestContext };
  try {
    if (method === 'GET') return json({ ok: true, ...(await exportsOverview(sd)) });
    if (b.action === 'request') return json({ ok: true, export: await requestCreativeExport(sd, who, b.input) });
    if (b.action === 'produce') {
      if (!isUuidLike(b.exportId)) throw new StudioError('INVALID_INPUT', 'an export id is needed', ['exportId']);
      return json({ ok: true, export: await produceCreativeExport(sd, who, b.exportId) });
    }
    if (b.action === 'cancel') {
      if (!isUuidLike(b.exportId)) throw new StudioError('INVALID_INPUT', 'an export id is needed', ['exportId']);
      return json({ ok: true, export: await cancelCreativeExport(sd, who, b.exportId) });
    }
    throw new StudioError('INVALID_INPUT', 'unknown action', ['action']);
  } catch (e) {
    return errorResponse(e);
  }
}
