// Follow-up 155 (PR 58, PR 75) — the site-wide size guide (demo 10-size-guide.js, D-018): every category that sells
// and has a size chart the shop can read, with that chart as a table (the help page /help/size-guide) and, where Find
// My Size can answer from it, as a choice in the size guide window the footer's "Size guide" opens on any page. The
// chart is the one a product of the category without its own chart would get (its category's, then the parents',
// nearest first, of the shop's fallback fit — pdp-chart pickChart), so the guide never says another size than the
// product page. A new category with a chart appears here by itself. Pure (`guideEntries`) plus one read
// (`sizeGuideData`); the window's endpoint is GET /api/shop/size-guide.
import { getPrisma, type Prisma } from '@extas/db/client';
import { bothUnits, readMeta, readRows, sortRows } from '@extas/catalogue';
import { canRecommend } from '@extas/catalogue/size-finder';
import type { PdpFinderSettings } from '@extas/settings';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';
import { chartTable, isBottom, pickChart, type FieldMeta } from './pdp-chart';
import { finderChart } from './pdp-finder';
import type { PdpChart } from './product-model';
import { categoryHref } from './shell-model';
import { hrefIn, type ShopLang } from './lang';

export interface GuideCategoryRow {
  id: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  parentId: string | null;
  garmentTypeId: string | null;
  garment: string | null;
  /** The garment type's measurement fields (labels in both languages, the unit each is typed in). */
  measurementFields: Prisma.JsonValue | null;
  /** Published products in it (its own). */
  count: number;
}

export interface GuideAssignmentRow {
  categoryId: string;
  chart: { id: string; name: string; fitKey: string | null; columns: Prisma.JsonValue; rows: Prisma.JsonValue; garmentTypeId: string | null };
}

export interface GuideInput {
  lang: ShopLang;
  cats: readonly GuideCategoryRow[];
  assignments: readonly GuideAssignmentRow[];
  /** The store's sizes in its order. */
  sizes: readonly { key: string; label: string }[];
  fallbackFit: string;
  defaultEaseInch: number;
  cmDecimals: number;
  diagramFor: Readonly<Record<string, string>>;
  finder: Pick<PdpFinderSettings, 'on' | 'body'>;
}

export interface GuideEntry {
  slug: string;
  name: string;
  garment: string | null;
  /** Saved as the bottom size (trousers) rather than the top size. */
  bottom: boolean;
  href: string;
  chart: PdpChart;
  /** Size key → its label ("L", "32"). */
  labels: Record<string, string>;
  /** Find My Size can answer from this chart (the window offers it). */
  finds: boolean;
}

const fieldsOf = (json: Prisma.JsonValue | null): { key: string; labelEn: string; labelBn: string; unit: 'inch' | 'cm' }[] =>
  Array.isArray(json)
    ? json.flatMap((f) =>
        f && typeof f === 'object' && !Array.isArray(f) && typeof f.key === 'string'
          ? [
              {
                key: f.key,
                labelEn: typeof f.labelEn === 'string' ? f.labelEn : f.key,
                labelBn: typeof f.labelBn === 'string' ? f.labelBn : typeof f.labelEn === 'string' ? f.labelEn : f.key,
                unit: f.unit === 'cm' ? ('cm' as const) : ('inch' as const),
              },
            ]
          : [],
      )
    : [];

/**
 * The guide's categories in the shop's order (each top category, then its sub-categories); a sub-category with its
 * parent's very chart is left out (its table would repeat the parent's).
 */
export function guideEntries(o: GuideInput): GuideEntry[] {
  const byId = new Map(o.cats.map((c) => [c.id, c]));
  const order = o.sizes.map((s) => s.key);
  const labels = Object.fromEntries(o.sizes.map((s) => [s.key, s.label]));
  const kids = new Map<string, number>();
  for (const c of o.cats) if (c.parentId) kids.set(c.parentId, (kids.get(c.parentId) ?? 0) + c.count);
  const chartFor = (c: GuideCategoryRow) => {
    const chain: string[] = [];
    for (let id: string | null = c.id, guard = 0; id && guard < 64; guard++) {
      chain.push(id);
      id = byId.get(id)?.parentId ?? null;
    }
    const list = o.assignments
      .filter((a) => chain.includes(a.categoryId) && (!c.garmentTypeId || a.chart.garmentTypeId === c.garmentTypeId))
      .map((a) => ({ id: a.chart.id, fitKey: a.chart.fitKey, productId: null, categoryId: a.categoryId, chart: a.chart }));
    return pickChart(list, '', chain, null, o.fallbackFit);
  };
  const picks = new Map(o.cats.map((c) => [c.id, chartFor(c)]));
  // each top category (or one whose parent is hidden) followed by its own sub-categories, both in the shop's order
  const tops = o.cats.filter((c) => !c.parentId || !byId.has(c.parentId));
  const tree = tops.flatMap((t) => [t, ...o.cats.filter((c) => c.parentId === t.id)]);
  const out: GuideEntry[] = [];
  for (const c of tree) {
    const pick = picks.get(c.id);
    if (!pick || c.count + (kids.get(c.id) ?? 0) <= 0) continue;
    if (c.parentId && picks.get(c.parentId)?.id === pick.id) continue;
    const meta = readMeta(pick.chart.columns);
    const fields = fieldsOf(c.measurementFields);
    const rows = sortRows(readRows(pick.chart.rows), order);
    const metaMap = new Map<string, FieldMeta>(
      meta.fields.map((k) => {
        const f = fields.find((x) => x.key === k);
        return [k, { key: k, label: (o.lang === 'bn' ? f?.labelBn : f?.labelEn) ?? k, unit: f?.unit ?? 'inch', howTo: null }];
      }),
    );
    const chart = chartTable(
      { name: pick.chart.name, fields: meta.fields, rows, easeInch: meta.easeInch ?? o.defaultEaseInch },
      metaMap,
      rows.map((r) => r.size),
      (v, unit) => bothUnits(v, unit, o.cmDecimals),
    );
    if (!chart) continue;
    out.push({
      slug: c.slug,
      name: o.lang === 'bn' && c.nameBn ? c.nameBn : c.nameEn,
      garment: c.garment,
      bottom: isBottom(c.garment, o.diagramFor),
      href: hrefIn(o.lang, categoryHref(c.slug)),
      chart,
      labels: Object.fromEntries(chart.rows.map((r) => [r.size, labels[r.size] ?? r.size])),
      finds: o.finder.on && canRecommend(finderChart(chart), o.finder),
    });
  }
  return out;
}

export interface SizeGuideData {
  entries: GuideEntry[];
  finder: PdpFinderSettings;
}

/** The guide for one store and language (no database or a slow one: no entries, so the page says "Coming soon"). */
export async function sizeGuideData(storeId: number, lang: ShopLang): Promise<SizeGuideData | null> {
  const r = settingsResolver();
  if (!process.env.DATABASE_URL || !r) return null;
  const prisma = getPrisma();
  const at = { storeId };
  try {
    return await withTimeout(
      (async () => {
        const [finder, fallbackFit, defaultEaseInch, cmDecimals, diagramFor, cats, assignments, sizes] = await Promise.all([
          r.value('pdp.finder', at),
          r.value('catalogue.sizeCharts.fallbackFit', at),
          r.value('catalogue.sizeCharts.defaultEaseInch', at),
          r.value('catalogue.sizeCharts.cmDecimals', at),
          r.value('catalogue.sizeCharts.diagramFor', at),
          prisma.category.findMany({
            where: { storeId, isVisible: true, archivedAt: null },
            orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
            select: {
              id: true,
              slug: true,
              nameEn: true,
              nameBn: true,
              parentId: true,
              garmentTypeId: true,
              garmentType: { select: { key: true, measurementFields: true } },
              _count: { select: { products: { where: { status: 'PUBLISHED', archivedAt: null } } } },
            },
          }),
          prisma.sizeChartAssignment.findMany({
            where: { storeId, archivedAt: null, categoryId: { not: null }, sizeChart: { archivedAt: null } },
            select: { categoryId: true, sizeChart: { select: { id: true, name: true, fitKey: true, columns: true, rows: true, garmentTypeId: true } } },
          }),
          prisma.size.findMany({ where: { storeId, archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }], select: { key: true, label: true } }),
        ]);
        const entries = guideEntries({
          lang,
          cats: cats.map((c) => ({
            id: c.id,
            slug: c.slug,
            nameEn: c.nameEn,
            nameBn: c.nameBn,
            parentId: c.parentId,
            garmentTypeId: c.garmentTypeId,
            garment: c.garmentType?.key ?? null,
            measurementFields: c.garmentType?.measurementFields ?? null,
            count: c._count.products,
          })),
          assignments: assignments.flatMap((a) => (a.categoryId ? [{ categoryId: a.categoryId, chart: a.sizeChart }] : [])),
          sizes,
          fallbackFit,
          defaultEaseInch,
          cmDecimals,
          diagramFor,
          finder,
        });
        return { entries, finder };
      })(),
      settingsTimeoutMs(),
    );
  } catch {
    return null;
  }
}
