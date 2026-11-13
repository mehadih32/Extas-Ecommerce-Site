// S15 · PR 328 (Blueprint B4.15 "say only what you were given"; C1.1-C1.6, A5.1-A5.6; SIM-F-012 "a size answer
// from Find My Size in chat is a direct sale") — the full Find My Size reasoning for a support draft's own
// size-advice AI job (`size-advice-dispatch.ts`'s `sizeAdviceNote`), built from the identical lookup
// `draft-size.ts`'s own `draftSizeFinder` (PR 432) already runs for the chat's size answer — the same
// `@extas/catalogue/size-finder`'s `recommendSize` the product page itself calls, never a second, independent
// guess at a size. The only difference from `draftSizeFinder` is what is kept at the end: every reasoning field
// (the chart's own measure, how much room it gives, whether the chosen size actually covers the need) instead of
// only the size key, so the AI job has real facts to explain rather than a bare string to parrot.
import type { PrismaClient } from '@extas/db/client';
import type { SizeAdviceFacts } from '../admin-ai/size-advice-dispatch';
import type { AppResolver } from '../settings';
import { finderOffered, sizeFor } from '../shop/pdp-finder';
import { productData } from '../shop/product';

/** Find My Size's full reasoning for a support draft in this store, or null when the product's chart cannot
 * answer (the same conditions `draftSizeFinder` already checks) — never a fact the model could not have had. */
export function draftSizeAdviceFacts(db: PrismaClient, resolver: AppResolver, storeId: number) {
  return async (productId: string, b: { heightIn: number; weightKg: number }): Promise<SizeAdviceFacts | null> => {
    const f = await resolver.value('pdp.finder', { storeId });
    if (b.heightIn < f.heightMinIn || b.heightIn > f.heightMaxIn || b.weightKg < f.weightMinKg || b.weightKg > f.weightMaxKg) return null;
    const row = await db.product.findFirst({ where: { id: productId, storeId, status: 'PUBLISHED', archivedAt: null }, select: { slug: true } });
    if (!row) return null;
    const p = await productData(storeId, row.slug);
    if (!p) return null;
    const m = { onSale: p.state === 'live', sizes: p.sizes, chart: p.chart.en ?? null, garment: p.garment };
    // the chart answers in the chat even while the product page's own finder button is switched off (same as draftSizeFinder)
    if (!finderOffered(m, { ...f, on: true })) return null;
    const rec = sizeFor(m, f, b);
    if (!rec || !m.chart) return null;
    const field = m.chart.fields.find((x) => x.key === rec.field);
    return {
      sizeLabel: rec.size,
      nextSizeLabel: rec.next,
      fieldLabel: field?.label ?? rec.field,
      valueInch: rec.value,
      needInch: rec.need,
      bodyInch: rec.body,
      easeInch: rec.ease,
      covered: rec.covered,
      garment: m.garment,
      heightIn: b.heightIn,
      weightKg: b.weightKg,
    };
  };
}
