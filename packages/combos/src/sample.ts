// Sample combos for the sample store (data/sample-combos.json), so the combo screens can be built and tested on real
// rows. SAMPLE DATA ONLY (CLAUDE.md rule 4, PR 509): it runs only on the explicit `sample` command and only on the
// store the sample catalogue seed made (its DefaultPackApplication mark); it refuses every other store. The prices in
// the file are made-up sample values, never the owner's. Idempotent: a combo is created only when its slug is
// missing; nothing is updated or deleted.
import { audit, SYSTEM } from '@extas/auth';
import { SAMPLE_PACK_KEY } from '@extas/seed';
import { z } from 'zod';
import sampleJson from '../data/sample-combos.json';
import { TX, type CombosDeps, type Who } from './context';
import { CombosError } from './errors';
import { FIXED_COMBO_TYPES, pieceCountOf } from './model';

const sampleSchema = z
  .object({
    $comment: z.string(),
    version: z.int().min(1),
    marker: z.string().min(1),
    combos: z.array(
      z
        .object({
          slug: z.string().startsWith('sample-'),
          nameEn: z.string().startsWith('Sample '),
          nameBn: z.string().optional(),
          descriptionEn: z.string().optional(),
          type: z.enum(FIXED_COMBO_TYPES),
          items: z.array(z.object({ product: z.string(), colours: z.array(z.string()).optional(), quantity: z.int().min(1).optional(), labelEn: z.string().optional(), labelBn: z.string().optional() }).strict()).min(1),
          sampleSetPriceMinor: z.int().min(1),
          autoApply: z.boolean(),
          sameColour: z.boolean().optional(),
          on: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();

export const sampleCombos = sampleSchema.parse(sampleJson);

export class SampleCombosRefused extends Error {}

export interface SampleCombosReport {
  storeId: number;
  combos: number;
}

/** The store the sample catalogue seed made, or a refusal. */
export async function sampleStoreId(deps: Pick<CombosDeps, 'db'>): Promise<number> {
  const mark = await deps.db.defaultPackApplication.findFirst({ where: { packKey: SAMPLE_PACK_KEY, storeId: { not: null } }, orderBy: { createdAt: 'asc' } });
  if (!mark?.storeId) throw new SampleCombosRefused('no sample store: run the sample catalogue seed first (pnpm --filter @extas/seed sample)');
  return mark.storeId;
}

export async function seedSampleCombos(deps: CombosDeps): Promise<SampleCombosReport> {
  const storeId = await sampleStoreId(deps);
  const who: Who = { actor: SYSTEM, storeId, ctx: { source: 'sample' } };
  const slugs = [...new Set(sampleCombos.combos.flatMap((c) => c.items.map((i) => i.product)))];
  const products = await deps.db.product.findMany({ where: { storeId, slug: { in: slugs } }, select: { id: true, slug: true, colours: { select: { colourId: true, colour: { select: { key: true } } } } } });
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  let made = 0;
  for (const s of sampleCombos.combos) {
    if (await deps.db.combo.findFirst({ where: { storeId, slug: s.slug }, select: { id: true } })) continue;
    const items = s.items.map((i, n) => {
      const p = bySlug.get(i.product);
      if (!p) throw new CombosError('NOT_FOUND', 'a sample combo names a product the sample store does not have', [i.product]);
      const colourIds = (i.colours ?? []).map((k) => {
        const c = p.colours.find((x) => x.colour.key === k);
        if (!c) throw new CombosError('NOT_FOUND', 'a sample combo names a colour the product does not have', [`${i.product}/${k}`]);
        return c.colourId;
      });
      return { storeId, position: n + 1, productId: p.id, allowedColourIds: colourIds, allowedSizeIds: [], quantity: i.quantity ?? 1, labelEn: i.labelEn ?? null, labelBn: i.labelBn ?? null };
    });
    await deps.db.$transaction(async (tx) => {
      const c = await tx.combo.create({
        data: {
          storeId,
          slug: s.slug,
          nameEn: s.nameEn,
          nameBn: s.nameBn ?? null,
          descriptionEn: s.descriptionEn ?? null,
          type: s.type,
          pieceCount: pieceCountOf(items),
          setPriceMinor: s.sampleSetPriceMinor,
          autoApply: s.autoApply,
          sameColour: s.sameColour ?? false,
          status: s.on ? 'RUNNING' : 'PAUSED',
        },
        select: { id: true },
      });
      await tx.comboItem.createMany({ data: items.map((i) => ({ ...i, comboId: c.id })) });
      await audit(tx, who.actor, { storeId, action: 'combo.sample', entityType: 'Combo', entityId: c.id, after: { slug: s.slug } }, who.ctx);
    }, TX);
    made++;
  }
  return { storeId, combos: made };
}
