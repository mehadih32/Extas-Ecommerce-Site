// S28 · PR 683 — the ERP's size chart per style, site side. The chart arrives as a payload (the adapter's mock until the
// ERP ships it) and waits in `ErpSizeChart`, one per style code. "Use ERP chart" turns it into the shop's own size chart
// (columns the garment type knows, rows for sizes the shop sells, a name "ERP <style code>") and gives it to the product.
// The shop's own chart is never overwritten: when the ERP later sends a different chart it only waits as "newer", and
// using it again makes another chart. Off as shipped (`catalogue.erpSizeChart`). Reading needs `catalogue.read`; every
// change `catalogue.write`; audited.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { CatalogueError } from './errors';
import { allow, found, logChange, parse, setting, type CatalogueDeps, type Who } from './context';
import { effectiveGarmentTypeOf } from './categories';
import { assignSizeChart, createSizeChart, getSizeChart, sizeChartSettings, type SizeChartDetail } from './size-charts';

export const erpSizeChartPayloadSchema = z
  .object({
    styleCode: z.string().trim().min(1).max(60),
    unit: z.literal('inch'),
    fields: z.array(z.string().trim().min(1).max(40)).min(1).max(12),
    rows: z
      .array(z.object({ size: z.string().trim().min(1).max(20), values: z.array(z.number().finite().positive()).min(1).max(12) }).strict())
      .min(1)
      .max(30),
  })
  .strict();
export type ErpSizeChartPayloadInput = z.input<typeof erpSizeChartPayloadSchema>;

export type ErpChartState = 'off' | 'no-style' | 'none' | 'available' | 'applied' | 'newer';

export interface ErpChartView {
  state: ErpChartState;
  styleCode: string | null;
  source: 'MOCK' | 'ERP' | null;
  receivedAt: string | null;
  fields: string[];
  sizes: string[];
  appliedSizeChartId: string | null;
}

export const hashOfChart = (p: { fields: readonly string[]; rows: readonly { size: string; values: readonly number[] }[] }): string =>
  createHash('sha256')
    .update(JSON.stringify({ f: p.fields, r: p.rows.map((r) => [r.size, r.values]) }))
    .digest('hex')
    .slice(0, 16);

const keyOf = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

async function styleOf(deps: CatalogueDeps, who: Who, productId: string) {
  return found(await deps.db.product.findFirst({ where: { id: productId, storeId: who.storeId }, select: { id: true, erpStyleCode: true, categoryId: true } }), 'product');
}

/** What the product's ERP chart looks like now (for the screen's button and note). */
export async function erpChartView(deps: CatalogueDeps, who: Who, productId: string): Promise<ErpChartView> {
  await allow(deps, who, 'catalogue.read');
  const s = await setting(deps, who, 'catalogue.erpSizeChart');
  const p = await styleOf(deps, who, productId);
  const none = (state: ErpChartState): ErpChartView => ({ state, styleCode: p.erpStyleCode, source: null, receivedAt: null, fields: [], sizes: [], appliedSizeChartId: null });
  if (!s.on) return none('off');
  if (!p.erpStyleCode) return none('no-style');
  const row = await deps.db.erpSizeChart.findFirst({ where: { storeId: who.storeId, erpStyleCode: p.erpStyleCode, archivedAt: null } });
  if (!row) return none('none');
  const payload = erpSizeChartPayloadSchema.safeParse(row.payload);
  const state: ErpChartState = row.appliedHash === null ? 'available' : row.appliedHash === row.versionHash ? 'applied' : 'newer';
  return {
    state,
    styleCode: p.erpStyleCode,
    source: row.source === 'ERP' ? 'ERP' : 'MOCK',
    receivedAt: row.receivedAt.toISOString(),
    fields: payload.success ? payload.data.fields : [],
    sizes: payload.success ? payload.data.rows.map((r) => r.size) : [],
    appliedSizeChartId: row.appliedSizeChartId,
  };
}

/** Keeps the chart the ERP sent for a style (a changed chart replaces the waiting one; the shop's own charts are untouched). */
export async function storeErpChart(deps: CatalogueDeps, who: Who, input: unknown, source: 'MOCK' | 'ERP'): Promise<{ changed: boolean; versionHash: string }> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(erpSizeChartPayloadSchema, input, 'ERP size chart');
  const width = d.fields.length;
  if (d.rows.some((r) => r.values.length !== width)) throw new CatalogueError('INVALID_INPUT', 'every size needs a value for every measurement', ['rows']);
  if (new Set(d.fields).size !== width || new Set(d.rows.map((r) => r.size)).size !== d.rows.length)
    throw new CatalogueError('INVALID_INPUT', 'a measurement or size is listed twice', ['fields']);
  const hash = hashOfChart(d);
  const now = deps.now?.() ?? new Date();
  return deps.db.$transaction(async (tx) => {
    const cur = await tx.erpSizeChart.findUnique({ where: { storeId_erpStyleCode: { storeId: who.storeId, erpStyleCode: d.styleCode } } });
    if (cur && cur.versionHash === hash && !cur.archivedAt) return { changed: false, versionHash: hash };
    const payload = { unit: d.unit, fields: d.fields, rows: d.rows };
    const row = cur
      ? await tx.erpSizeChart.update({ where: { id: cur.id }, data: { payload, versionHash: hash, source, receivedAt: now, archivedAt: null } })
      : await tx.erpSizeChart.create({ data: { storeId: who.storeId, erpStyleCode: d.styleCode, payload, versionHash: hash, source, receivedAt: now } });
    await logChange(tx, who, 'erpSizeChart.store', 'ErpSizeChart', row.id, cur ? { versionHash: cur.versionHash } : null, { styleCode: d.styleCode, versionHash: hash, source });
    return { changed: true, versionHash: hash };
  });
}

/** "Use ERP chart": the shop's own chart from the ERP's, given to the product. Never overwrites an earlier one. */
export async function useErpChart(
  deps: CatalogueDeps,
  who: Who,
  productId: string,
): Promise<{ chart: SizeChartDetail; skippedFields: string[]; skippedSizes: string[]; already: boolean }> {
  await allow(deps, who, 'catalogue.write');
  const s = await setting(deps, who, 'catalogue.erpSizeChart');
  if (!s.on) throw new CatalogueError('CONFLICT', "the ERP's size chart is switched off", ['ERP_CHART_OFF']);
  const p = await styleOf(deps, who, productId);
  if (!p.erpStyleCode) throw new CatalogueError('CONFLICT', 'the product has no ERP style code', ['NO_STYLE']);
  const row = found(await deps.db.erpSizeChart.findFirst({ where: { storeId: who.storeId, erpStyleCode: p.erpStyleCode, archivedAt: null } }), 'ERP size chart');
  const pay = parse(erpSizeChartPayloadSchema, { styleCode: p.erpStyleCode, ...(row.payload as object) }, 'ERP size chart');
  if (row.appliedHash === row.versionHash && row.appliedSizeChartId) {
    const live = await deps.db.sizeChart.findFirst({ where: { id: row.appliedSizeChartId, storeId: who.storeId, archivedAt: null }, select: { id: true } });
    if (live) {
      await assignSizeChart(deps, who, { sizeChartId: live.id, productId });
      return { chart: await getSizeChart(deps, who, live.id), skippedFields: [], skippedSizes: [], already: true };
    }
  }
  const gt = await effectiveGarmentTypeOf(deps.db, who.storeId, p.categoryId);
  if (!gt) throw new CatalogueError('CONFLICT', 'the product has no garment type; choose a category first', ['NO_GARMENT_TYPE']);
  const typeRow = found(await deps.db.garmentType.findFirst({ where: { id: gt.id, storeId: who.storeId } }), 'garment type');
  const known = new Set(((Array.isArray(typeRow.measurementFields) ? typeRow.measurementFields : []) as { key: string }[]).map((f) => f.key));
  const keep = pay.fields.map((f, i) => ({ f: keyOf(f), i })).filter((x) => known.has(x.f));
  const skippedFields = pay.fields.filter((f) => !known.has(keyOf(f)));
  if (!keep.length)
    throw new CatalogueError(
      'INVALID_INPUT',
      "none of the ERP's measurements is one of the garment type's",
      skippedFields.map((f) => `fields: ${f}`),
    );
  const sizes = await deps.db.size.findMany({ where: { storeId: who.storeId, archivedAt: null }, select: { key: true } });
  const live = new Map(sizes.map((z) => [z.key, z.key]));
  const rows = pay.rows.flatMap((r) => {
    const k = live.get(keyOf(r.size));
    return k ? [{ size: k, values: keep.map((x) => r.values[x.i]!) }] : [];
  });
  const skippedSizes = pay.rows.filter((r) => !live.has(keyOf(r.size))).map((r) => r.size);
  if (!rows.length)
    throw new CatalogueError(
      'INVALID_INPUT',
      "none of the ERP's sizes is one the shop sells",
      skippedSizes.map((z) => `rows: ${z}`),
    );
  const cs = await sizeChartSettings(deps, who);
  const taken = new Set((await deps.db.sizeChart.findMany({ where: { storeId: who.storeId, archivedAt: null }, select: { name: true } })).map((c) => c.name.toLowerCase()));
  let name = `ERP ${p.erpStyleCode}`;
  for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = `ERP ${p.erpStyleCode} (${n})`;
  const chart = await createSizeChart(deps, who, {
    name,
    garmentTypeId: gt.id,
    fitKey: cs.fits.some((f) => f.key === cs.fallbackFit) ? cs.fallbackFit : (cs.fits[0]?.key ?? cs.fallbackFit),
    fields: keep.map((x) => x.f),
    rows,
  });
  await assignSizeChart(deps, who, { sizeChartId: chart.id, productId });
  await deps.db.$transaction(async (tx) => {
    await tx.erpSizeChart.update({ where: { id: row.id }, data: { appliedSizeChartId: chart.id, appliedHash: row.versionHash } });
    await logChange(tx, who, 'erpSizeChart.use', 'ErpSizeChart', row.id, { appliedHash: row.appliedHash }, { appliedHash: row.versionHash, sizeChartId: chart.id, productId });
  });
  return { chart, skippedFields, skippedSizes, already: false };
}
