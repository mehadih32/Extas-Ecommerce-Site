// S24 · PR 457 (Blueprint C7.8 "a small editor in the admin: crop, straighten, brightness and contrast, spot
// removal, and 'run finishing again'", C7.16) — Marketing › Photoshoot editor at
// /admin/marketing/photoshoot/editor/[assetId]: each edit is recorded through @extas/photoshoot's own
// `recordImageEdit` (`photoshoot.write`). Seeing the page and its edit history needs `photoshoot.read`; saving
// an edit needs `photoshoot.write`. Hidden from the menu by `stages.closedShown.S24` until the whole stage is
// finished and gated (PR 652's mechanism, the same as PR 437's own Studio page) — but this address works once
// you have it.
//
// This PR records the owner's own choices only: no pixel engine runs here. The actual crop/rotate/brightness/
// spot-removal and the real "run finishing again" job are a later PR's own job runner — the same honest scope
// every S24 PR before this one left for its own unbuilt engine (PR 450's provider adapter, PR 453's scorer,
// PR 454's warp, PR 455–456's finishing models).
import { MOTHER_STORE_ID } from '@extas/db/client';
import { imageSources, type ImageSource } from '@extas/media';
import { isPhotoshootError, listImageEdits, recordImageEdit, type ImageEditRow, type PhotoshootDeps, type Who } from '@extas/photoshoot';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';

const S = MOTHER_STORE_ID;

export function photoshootDeps(deps: AdminDeps): PhotoshootDeps {
  return { db: deps.db, settings: deps.resolver };
}

export interface EditorAsset {
  id: string;
  isAiGenerated: boolean;
  archivedAt: Date | null;
}

export interface EditorView {
  /** Null when the image was not found in this store (a bad link, or an id from another store). */
  asset: EditorAsset | null;
  /** For `<ResponsiveImage>` — null when the asset has no rendition ready yet. */
  image: ImageSource | null;
  /** This image's own edits, most recent first. */
  edits: ImageEditRow[];
}

/** The editor page's own load: the image itself, its picture and its past edits. `listImageEdits` re-checks
 * `photoshoot.read` on its own, so a caller without it never sees even an empty list silently. */
export async function loadEditorView(deps: AdminDeps, who: Who, sourceAssetId: string): Promise<EditorView> {
  const [found, edits, images] = await Promise.all([
    deps.db.mediaAsset.findFirst({ where: { id: sourceAssetId, storeId: who.storeId }, select: { id: true, isAiGenerated: true, archivedAt: true } }),
    listImageEdits(photoshootDeps(deps), who, sourceAssetId),
    imageSources({ db: deps.db, settings: deps.resolver }, who.storeId, [sourceAssetId]),
  ]);
  return { asset: found, image: images.get(sourceAssetId) ?? null, edits };
}

const answer = (e: unknown): Response => (isPhotoshootError(e) ? fail(e.status, e.code, e.details) : errorResponse(e));

/**
 * /api/admin/marketing/photoshoot-editor — POST {sourceAssetId, operations} (`photoshoot.write`): records one
 * editing session (crop/straighten/brightnessContrast/spotRemoval/runFinishingAgain, in the order applied)
 * through `recordImageEdit`. No GET: the page itself loads with `loadEditorView`.
 */
export async function photoshootEditorHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  const b = await body(request).catch(() => ({}) as Record<string, unknown>);
  const g = await guardAdmin(request, deps, { permission: 'photoshoot.write', storeId: S });
  if (g instanceof Response) return g;
  const who: Who = { actor: g.actor, storeId: S, ctx: g.ctx };
  try {
    const row = await recordImageEdit(photoshootDeps(deps!), who, b);
    return json({ ok: true, edit: row });
  } catch (e) {
    return answer(e);
  }
}
