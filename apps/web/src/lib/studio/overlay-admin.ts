// S25 · PR 489 (Blueprint C8.3) — Marketing › Studio › Campaign overlays at /admin/marketing/studio/overlay: list
// the store's overlays (`marketing.studio.read`); create, edit, enable/disable, archive and restore one
// (`marketing.studio.write`). This page manages the overlay rows only — the actual drawing happens on the shop's own
// pages (lib/shop/campaign-overlay.ts), read fresh, never cached, never touching a price.
import { MOTHER_STORE_ID } from '@extas/db/client';
import type { Actor, RequestContext } from '@extas/auth';
import {
  createCampaignOverlay,
  listCampaignOverlays,
  setCampaignOverlayArchived,
  setCampaignOverlayEnabled,
  StudioError,
  updateCampaignOverlay,
  type CampaignOverlayView,
  type StudioDeps,
} from '@extas/creative-studio';
import { campaignList, type CampaignRow } from '@/lib/marketing/campaigns';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';

const S = MOTHER_STORE_ID;

export interface OverlayOverview {
  overlays: CampaignOverlayView[];
  /** For the campaign dropdown: the store's own non-archived campaigns, name only. */
  campaigns: Pick<CampaignRow, 'id' | 'name' | 'state'>[];
}

export async function overlayOverview(deps: StudioDeps): Promise<OverlayOverview> {
  const [overlays, { rows }] = await Promise.all([listCampaignOverlays(deps, S, { includeArchived: true }), campaignList(deps.db, S)]);
  return { overlays, campaigns: rows.filter((r) => r.state !== 'ARCHIVED').map((r) => ({ id: r.id, name: r.name, state: r.state })) };
}

const isUuidLike = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

/**
 * /api/admin/marketing/studio/overlay — GET the list (`marketing.studio.read`); POST {action: 'create' | 'update' |
 * 'enable' | 'disable' | 'archive' | 'restore', ...} (`marketing.studio.write`).
 */
export async function overlayHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const permission = method === 'GET' ? 'marketing.studio.read' : 'marketing.studio.write';
  const g = await guardAdmin(request, deps, { permission, storeId: S });
  if (g instanceof Response) return g;
  const sd: StudioDeps = { db: deps!.db };
  const who = { actor: g.actor as Actor, storeId: S, ctx: g.ctx as RequestContext };
  try {
    if (method === 'GET') return json({ ok: true, ...(await overlayOverview(sd)) });
    if (b.action === 'create') return json({ ok: true, overlay: await createCampaignOverlay(sd, who, b.input) });
    if (b.action === 'update') {
      if (!isUuidLike(b.id)) throw new StudioError('INVALID_INPUT', 'id required', ['id']);
      return json({ ok: true, overlay: await updateCampaignOverlay(sd, who, b.id, b.patch) });
    }
    if (b.action === 'enable' || b.action === 'disable') {
      if (!isUuidLike(b.id)) throw new StudioError('INVALID_INPUT', 'id required', ['id']);
      return json({ ok: true, overlay: await setCampaignOverlayEnabled(sd, who, b.id, b.action === 'enable') });
    }
    if (b.action === 'archive' || b.action === 'restore') {
      if (!isUuidLike(b.id)) throw new StudioError('INVALID_INPUT', 'id required', ['id']);
      return json({ ok: true, overlay: await setCampaignOverlayArchived(sd, who, b.id, b.action === 'archive') });
    }
    throw new StudioError('INVALID_INPUT', 'unknown action', ['action']);
  } catch (e) {
    return errorResponse(e);
  }
}
