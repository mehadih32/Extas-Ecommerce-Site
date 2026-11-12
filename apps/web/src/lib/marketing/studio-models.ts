// S24 · PR 445 (Blueprint C7.16 "Model library screen") — Marketing › Studio › Model library at
// /admin/marketing/studio/models, on /api/admin/marketing/studio/models: the model library, each model's own
// reference photos per angle and its rights/consent records (`@extas/photoshoot`'s `models.ts`). Seeing needs
// `photoshoot.read`; adding a model, editing it, archiving/restoring it, linking/unlinking a reference photo and
// recording consent all need `photoshoot.write` (the package checks every permission again). Nothing here
// generates an image, costs anything or touches a product — that starts at PR 446.
import { MOTHER_STORE_ID } from '@extas/db/client';
import {
  addModelAsset,
  createModel,
  hasValidConsent,
  listConsents,
  listModelAssets,
  listModels,
  PhotoshootError,
  recordConsent,
  removeModelAsset,
  setModelArchived,
  updateModel,
  type ConsentRow,
  type ModelAssetRow,
  type ModelRow,
  type PhotoshootDeps,
  type Who,
} from '@extas/photoshoot';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';

const S = MOTHER_STORE_ID;

export interface ModelOverviewRow extends ModelRow {
  assets: ModelAssetRow[];
  consents: ConsentRow[];
  /** Whether a consent record is valid right now — computed here, once, so the page never calls `Date.now()` itself. */
  consentValid: boolean;
}

export interface ModelOverview {
  models: ModelOverviewRow[];
}

/** The library plus each model's own reference photos and consent records (small by nature — a handful of models). */
export async function modelsOverview(deps: PhotoshootDeps, who: Who, now: Date = new Date()): Promise<ModelOverview> {
  const models = await listModels(deps, who);
  const rows = await Promise.all(
    models.map(async (m) => {
      const [assets, consents] = await Promise.all([listModelAssets(deps, who, m.id), listConsents(deps, who, m.id)]);
      return { ...m, assets, consents, consentValid: hasValidConsent(consents, now) };
    }),
  );
  return { models: rows };
}

const isUuidLike = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

/**
 * /api/admin/marketing/studio/models — GET the library with every model's photos and consent records
 * (`photoshoot.read`); POST {action: 'create' | 'update' | 'archive' | 'restore' | 'addAsset' | 'removeAsset' |
 * 'recordConsent', ...} (`photoshoot.write`).
 */
export async function studioModelsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const permission = method === 'GET' ? 'photoshoot.read' : 'photoshoot.write';
  const g = await guardAdmin(request, deps, { permission, storeId: S });
  if (g instanceof Response) return g;
  const pd: PhotoshootDeps = { db: deps!.db };
  const who: Who = { actor: g.actor as Who['actor'], storeId: S, ctx: g.ctx as Who['ctx'] };
  try {
    if (method === 'GET') return json({ ok: true, ...(await modelsOverview(pd, who)) });
    if (b.action === 'create') return json({ ok: true, model: await createModel(pd, who, b.input) });
    if (b.action === 'update') {
      if (!isUuidLike(b.id)) throw new PhotoshootError('INVALID_INPUT', 'id required', ['id']);
      return json({ ok: true, model: await updateModel(pd, who, b.id, b.patch) });
    }
    if (b.action === 'archive' || b.action === 'restore') {
      if (!isUuidLike(b.id)) throw new PhotoshootError('INVALID_INPUT', 'id required', ['id']);
      return json({ ok: true, model: await setModelArchived(pd, who, b.id, b.action === 'archive') });
    }
    if (b.action === 'addAsset') return json({ ok: true, asset: await addModelAsset(pd, who, b.input) });
    if (b.action === 'removeAsset') {
      if (!isUuidLike(b.id)) throw new PhotoshootError('INVALID_INPUT', 'id required', ['id']);
      await removeModelAsset(pd, who, b.id);
      return json({ ok: true });
    }
    if (b.action === 'recordConsent') return json({ ok: true, consent: await recordConsent(pd, who, b.input) });
    throw new PhotoshootError('INVALID_INPUT', 'unknown action', ['action']);
  } catch (e) {
    return errorResponse(e);
  }
}
