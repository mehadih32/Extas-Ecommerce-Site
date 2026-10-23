// PR 58 (with PR 59's data hook) — the answers Find My Size gave, kept for the size reports and, later, the trained
// finder (Blueprint D3.8; SizeRecommendation): the height, the weight, the size the owner's chart gave and the reasons,
// then the size the shopper took. No name, no phone, no visitor id: the row says how a body met a chart, not who it was.
// The server works the size out again from its own copy of the product and the store's rules, so a page cannot write
// a size the chart never gave.
//
//   POST   /api/size-finder   {productId, heightIn, weightKg}  → {id, size}     only while `pdp.finder.record` is on
//   PATCH  /api/size-finder   {id, size}                       → {updated}      the size taken, once per answer
//
// Same site only, small bodies only. A product without a chart the finder can read answers 422 (no size is invented).
import type { PrismaClient } from '@extas/db/client';
import { CM_PER_INCH } from '@extas/catalogue/size-finder';
import type { Key, Value } from '@extas/settings';
import { body, errorResponse, fail, isUuid, json, sameOrigin } from '../admin-auth';
import { finderOffered, sizeFor } from './pdp-finder';
import type { ProductData } from './product';

/** A body of a few numbers; anything bigger is not this page. */
export const FINDER_BODY_MAX = 1024;

interface Reader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

export interface FinderDeps {
  db: PrismaClient;
  settings: Reader;
  storeId: number;
  /** The product as its page reads it (its chart, sizes and garment type). */
  product: (storeId: number, slug: string) => Promise<ProductData | null>;
}

const whole = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** POST / PATCH /api/size-finder. */
export async function sizeFinderHandler(request: Request, d: FinderDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'POST' && method !== 'PATCH') return fail(405, 'method-not-allowed');
  if (!d) return fail(503, 'database-not-configured');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  if (Number(request.headers.get('content-length') ?? '0') > FINDER_BODY_MAX) return fail(413, 'TOO_LARGE');
  try {
    const f = await d.settings.value('pdp.finder', { storeId: d.storeId });
    if (!f.on || !f.record) return fail(404, 'not-found');
    const b = await body(request);
    if (method === 'PATCH') {
      if (!isUuid(b.id) || typeof b.size !== 'string' || !b.size || b.size.length > 40) return fail(400, 'INVALID_INPUT', ['id', 'size']);
      const size = await d.db.size.findFirst({ where: { storeId: d.storeId, key: b.size }, select: { id: true } });
      if (!size) return fail(400, 'INVALID_INPUT', ['size']);
      // once per answer: a second choice does not overwrite the first
      const r = await d.db.sizeRecommendation.updateMany({ where: { id: b.id, storeId: d.storeId, chosenSizeId: null }, data: { chosenSizeId: size.id } });
      return json({ ok: true, updated: r.count });
    }
    const bad = [
      ...(isUuid(b.productId) ? [] : ['productId']),
      ...(whole(b.heightIn) && b.heightIn >= f.heightMinIn && b.heightIn <= f.heightMaxIn ? [] : ['heightIn']),
      ...(whole(b.weightKg) && b.weightKg >= f.weightMinKg && b.weightKg <= f.weightMaxKg ? [] : ['weightKg']),
    ];
    if (bad.length) return fail(400, 'INVALID_INPUT', bad);
    const heightIn = b.heightIn as number;
    const weightKg = b.weightKg as number;
    const row = await d.db.product.findFirst({ where: { id: b.productId as string, storeId: d.storeId, status: 'PUBLISHED', archivedAt: null }, select: { id: true, slug: true } });
    if (!row) return fail(404, 'not-found');
    const p = await d.product(d.storeId, row.slug);
    const chart = p?.chart.en ?? null;
    const m = p ? { onSale: p.state === 'live', sizes: p.sizes, chart, garment: p.garment } : null;
    if (!p || !m || !finderOffered(m, f)) return fail(422, 'NO_SIZE_CHART');
    const rec = sizeFor(m, f, { heightIn, weightKg });
    if (!rec) return fail(422, 'NO_SIZE_CHART');
    const size = await d.db.size.findFirst({ where: { storeId: d.storeId, key: rec.size }, select: { id: true } });
    const saved = await d.db.sizeRecommendation.create({
      data: {
        storeId: d.storeId,
        productId: row.id,
        heightCm: Math.round(heightIn * CM_PER_INCH),
        weightKg,
        recommendedSizeId: size?.id ?? null,
        reasoning: {
          engine: 'rules',
          heightIn,
          chart: chart?.name ?? null,
          size: rec.size,
          next: rec.next,
          field: rec.field,
          value: rec.value,
          need: rec.need,
          body: rec.body,
          ease: rec.ease,
          covered: rec.covered,
          length: rec.length ? { value: rec.length.value, verdict: rec.length.verdict } : null,
        },
      },
      select: { id: true },
    });
    return json({ ok: true, id: saved.id, size: rec.size });
  } catch (e) {
    return errorResponse(e);
  }
}
