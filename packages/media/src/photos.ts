// PR 25 — the minimum photo set: a product needs at least `media.photos.minimum` photos (4) and one of every kind in
// `media.photos.requiredRoles` (front, back, detail, on-model); with `media.photos.frontPerColour` on, every colour of
// the product also needs its own front photo (the demo's per-colour fronts feed the combo pictures, PR 575).
//
// photoSetStatus() is shown with every upload and placement, and requirePhotoSet() is the gate the publish step
// (PR 21, 35) calls: a product with a missing photo cannot go live. Products are referenced by id only.
import { photoRules, type PhotoRole, type Settings } from './config';
import type { Db } from './deps';
import { MediaError } from './errors';

export interface PhotoSetStatus {
  productId: string;
  minimum: number;
  /** Distinct photos on the product now. */
  count: number;
  required: PhotoRole[];
  /** Required kinds still missing; `FRONT:<colourId>` for a colour without its own front photo. */
  missing: string[];
  ok: boolean;
}

export async function photoSetStatus(deps: { db: Db; settings: Settings }, where: { storeId: number; productId: string }): Promise<PhotoSetStatus> {
  const rules = await photoRules(deps.settings, where.storeId);
  const links = await deps.db.productMedia.findMany({
    where: { storeId: where.storeId, productId: where.productId, archivedAt: null, asset: { kind: 'IMAGE', archivedAt: null } },
    select: { assetId: true, role: true, colourId: true },
  });
  const roles = new Set(links.map((l) => l.role));
  const missing: string[] = rules.requiredRoles.filter((r) => !roles.has(r));
  if (rules.frontPerColour) {
    const colours = await deps.db.productColour.findMany({
      where: { storeId: where.storeId, productId: where.productId, archivedAt: null },
      select: { colourId: true },
      orderBy: { sortOrder: 'asc' },
    });
    const fronts = new Set(links.filter((l) => l.role === 'FRONT' && l.colourId).map((l) => l.colourId));
    for (const c of colours) if (!fronts.has(c.colourId)) missing.push(`FRONT:${c.colourId}`);
  }
  const count = new Set(links.map((l) => l.assetId)).size;
  return {
    productId: where.productId,
    minimum: rules.minimum,
    count,
    required: rules.requiredRoles,
    missing,
    ok: missing.length === 0 && count >= rules.minimum,
  };
}

/** Throws PHOTOS_MISSING (details: the missing kinds and `count:<n>/<minimum>`) unless the set is complete. */
export async function requirePhotoSet(deps: { db: Db; settings: Settings }, where: { storeId: number; productId: string }): Promise<PhotoSetStatus> {
  const s = await photoSetStatus(deps, where);
  if (!s.ok) throw new MediaError('PHOTOS_MISSING', 'the product does not have its photos yet', [...s.missing, `count:${s.count}/${s.minimum}`]);
  return s;
}
