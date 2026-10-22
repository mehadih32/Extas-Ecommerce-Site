// PR 575 — the set photo, composed automatically from each piece's own photo in the set's colours (Blueprint D8.5):
// side by side, top + bottom, or three-up (photo-layout.ts), on the one house background, at the shop's size, format
// and quality (`combos.photo.*`). No text is baked in. The finished picture goes into the media library like any shop
// file (stored through the storage adapter — the mock until Blob is connected, A1.3 — and its sizes made by the image
// job), and the combo points at it (`setPhotoAssetId`). Making it again makes a new file; the old one stays in the
// library (nothing is deleted).
//
// Which photo of a piece: its photo in that colour — front first, then flat lay, the gallery's main photo, then any —
// or, for a product with no colour photos, its own main photo. A piece with none stops the photo (NO_PIECE_PHOTO,
// with the pieces' numbers), so a set never shows a wrong colour.
import sharp from 'sharp';
import { contentTypeOf, dispatch, extensionOf, storeGeneratedFile, uploadRules, type MediaDeps, type Settings as MediaSettings } from '@extas/media';
import { allow, logChange, setting, TX, type CombosDeps, type Who } from './context';
import { CombosError } from './errors';
import { layoutFor, photoCells, type PhotoLayout } from './photo-layout';
import { setSummary } from './summary';

/** The photo roles in the order a set photo prefers them. */
const ROLE_ORDER = ['FRONT', 'FLAT_LAY', 'ON_MODEL', 'TRUE_COLOUR', 'DETAIL', 'BACK', 'FABRIC', 'OTHER'] as const;

export interface PiecePhoto {
  piece: number;
  productId: string;
  colourId: string | null;
  assetId: string;
}

export interface SetPhotoResult {
  comboId: string;
  assetId: string;
  layout: PhotoLayout;
  width: number;
  height: number;
  pieces: PiecePhoto[];
  /** The sizes: made now ("done"), after the answer ("deferred"), or by the image worker ("queued"). */
  processing: 'queued' | 'deferred' | 'done';
}

function rgb(hex: string): { r: number; g: number; b: number; alpha: number } {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, alpha: 1 };
}

/** The media service's view of this package's dependencies. */
function mediaOf(deps: CombosDeps): MediaDeps {
  if (!deps.storage) throw new CombosError('NO_STORAGE', 'the set photo needs the storage adapter');
  return { db: deps.db, settings: deps.settings as unknown as MediaSettings, storage: deps.storage, defer: deps.defer, enqueue: deps.enqueue, now: deps.now };
}

/** Each piece's photo in its colour (throws NO_PIECE_PHOTO naming the pieces that have none). */
export async function piecePhotos(deps: CombosDeps, storeId: number, pieces: readonly { productId: string; colourId: string | null }[]): Promise<PiecePhoto[]> {
  const rows = await deps.db.productMedia.findMany({
    where: { storeId, productId: { in: [...new Set(pieces.map((p) => p.productId))] }, archivedAt: null, role: { not: 'VIDEO' }, asset: { archivedAt: null, kind: 'IMAGE' } },
    select: { productId: true, colourId: true, assetId: true, role: true, isPrimary: true, sortOrder: true },
  });
  const rank = (r: (typeof rows)[number]) => [ROLE_ORDER.indexOf(r.role as (typeof ROLE_ORDER)[number]), r.isPrimary ? 0 : 1, r.sortOrder] as const;
  const best = (list: typeof rows) =>
    [...list].sort((a, b) => {
      const x = rank(a);
      const y = rank(b);
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    })[0];
  const missing: string[] = [];
  const out: PiecePhoto[] = [];
  pieces.forEach((p, i) => {
    const mine = rows.filter((r) => r.productId === p.productId);
    const coloured = mine.some((r) => r.colourId !== null);
    const pick = best(mine.filter((r) => r.colourId === p.colourId)) ?? (coloured ? undefined : best(mine));
    if (!pick) missing.push(String(i + 1));
    else out.push({ piece: i, productId: p.productId, colourId: p.colourId, assetId: pick.assetId });
  });
  if (missing.length) throw new CombosError('NO_PIECE_PHOTO', 'a piece has no photo in its colour', missing);
  return out;
}

/** Puts the pieces' photos on the house background (pure image work; no storage). */
export async function composeImage(photos: readonly Uint8Array[], o: { layout: PhotoLayout; width: number; height: number; background: string; format: 'webp' | 'jpeg'; quality: number }): Promise<Uint8Array> {
  const cells = photoCells(o.layout, photos.length, o.width, o.height);
  const layers = await Promise.all(
    cells.map(async (c) => {
      const img = await sharp(photos[c.piece]!).rotate().resize(c.width, c.height, { fit: 'inside', withoutEnlargement: false }).png().toBuffer({ resolveWithObject: true });
      return { input: img.data, left: c.left + Math.floor((c.width - img.info.width) / 2), top: c.top + Math.floor((c.height - img.info.height) / 2) };
    }),
  );
  const canvas = sharp({ create: { width: o.width, height: o.height, channels: 3, background: rgb(o.background) } }).composite(layers);
  const out = o.format === 'jpeg' ? canvas.jpeg({ quality: o.quality, mozjpeg: true }) : canvas.webp({ quality: o.quality });
  return new Uint8Array(await out.toBuffer());
}

/** Makes the combo's set photo from its pieces' photos (the first colours of the set) and sets it on the combo. */
export async function makeSetPhoto(deps: CombosDeps, who: Who, comboId: string): Promise<SetPhotoResult> {
  await allow(deps, who, 'combos.write');
  const media = mediaOf(deps);
  const sum = await setSummary(deps, { storeId: who.storeId, comboId });
  const pieces = sum.pieces.map((p) => ({ productId: p.productId, colourId: p.defaultColourId }));
  const photos = await piecePhotos(deps, who.storeId, pieces);
  const assets = await deps.db.mediaAsset.findMany({ where: { storeId: who.storeId, id: { in: photos.map((p) => p.assetId) } }, select: { id: true, storage: true, storageKey: true } });
  const bodies = await Promise.all(
    photos.map(async (p) => {
      const a = assets.find((x) => x.id === p.assetId)!;
      const file = await (await media.storage(who.storeId, a.storage)).get(a.storageKey);
      if (!file) throw new CombosError('NO_PIECE_PHOTO', 'a piece photo file is missing from storage', [String(p.piece + 1)]);
      return file.body;
    }),
  );
  const [width, height, background, format, quality, rules] = await Promise.all([
    setting(deps, who.storeId, 'combos.photo.widthPx'),
    setting(deps, who.storeId, 'combos.photo.heightPx'),
    setting(deps, who.storeId, 'combos.photo.background'),
    setting(deps, who.storeId, 'combos.photo.format'),
    setting(deps, who.storeId, 'combos.photo.quality'),
    uploadRules(media.settings, who.storeId),
  ]);
  const layout = layoutFor(sum.type, pieces.length);
  const body = await composeImage(bodies, { layout, width, height, background, format, quality });
  const stored = await storeGeneratedFile(media, { storeId: who.storeId, kind: 'IMAGE', body, contentType: contentTypeOf(format), name: `set ${sum.slug}`, extension: extensionOf(format) });
  await deps.db.$transaction(async (tx) => {
    const before = await tx.combo.findFirstOrThrow({ where: { id: comboId, storeId: who.storeId }, select: { setPhotoAssetId: true } });
    await tx.combo.update({ where: { id: comboId }, data: { setPhotoAssetId: stored.id, version: { increment: 1 } } });
    await logChange(tx, who, { action: 'combo.photo', entityType: 'Combo', entityId: comboId, before, after: { setPhotoAssetId: stored.id, layout, pieces: photos } });
  }, TX);
  const processing = await dispatch(media, { name: 'media.render', assetId: stored.id }, rules.processing);
  return { comboId, assetId: stored.id, layout, width, height, pieces: photos, processing };
}
