// PR 26, 29 — what a product still needs before it may go live, and its health score (Blueprint B7.4: "a publish
// checklist blocks a half-done product: images present and standardised, size chart attached, price set, SEO filled, at
// least one category"; the demo's "Ready to go live?" card in 90-admin-catalog.js).
//
// - Every check is a setting (`catalogue.publish.checks`): `block` stops a publish (PR 35), `warn` only reminds, `off`
//   is not checked. The health score is the share of `catalogue.health.weights` a product has; its colour comes from
//   `catalogue.health.bands`.
// - The photo check is the media package's own photo minimum (`requirePhotoSet` / `photoSetStatus`, PR 25): one rule,
//   enforced the same way everywhere (B7.2 #9).
// - The size chart check reads the existing SizeChart / SizeChartAssignment rows (the size chart system itself is
//   PR 27/28): a chart assigned to the product, else to its category or the nearest ancestor. A garment type without
//   measurement fields (accessories) needs no chart.
// - checkProduct() stores the result on the product (healthScore, healthIssues) and keeps the publish queue in step
//   (publish.ts). It is derived data: computing it again never loses anything.
import type { Prisma } from '@extas/db/client';
import { photoSetStatus, type PhotoSetStatus } from '@extas/media';
import { PUBLISH_CHECK_KEYS, type PublishCheckKey, type PublishCheckLevel } from '@extas/settings';
import { allow, found, setting, type CatalogueDeps, type Db, type Who } from './context';
import { effectiveGarmentTypeOf } from './categories';
import { LANGS, namingView } from './naming';

export type { PublishCheckKey, PublishCheckLevel } from '@extas/settings';
export { PUBLISH_CHECK_KEYS } from '@extas/settings';

export interface CheckResult {
  key: PublishCheckKey;
  /** `block`: publishing waits for it; `warn`: a reminder only. Checks switched off are not listed. */
  level: Exclude<PublishCheckLevel, 'off'>;
  ok: boolean;
  /** Stable codes of what is missing (the screens turn them into text): `FRONT:<colourId>`, `sku:<SKU>`, `seoTitle.en` … */
  details: string[];
}

export type HealthBand = 'good' | 'fair' | 'poor';

export interface SizeChartRef {
  id: string;
  name: string;
  via: 'product' | 'category';
}

export interface Readiness {
  productId: string;
  status: string;
  archived: boolean;
  checks: CheckResult[];
  /** Blocking checks that fail: while any is left, the product cannot be published. */
  blocking: PublishCheckKey[];
  /** Reminder checks that fail. */
  reminders: PublishCheckKey[];
  ready: boolean;
  /** 0–100. */
  score: number;
  band: HealthBand;
  photos: PhotoSetStatus;
  sizeChart: SizeChartRef | null;
  checkedAt: string;
}

/** What is stored in Product.healthIssues (the list and the queue read it without checking again). */
export interface StoredHealth {
  checkedAt: string;
  ready: boolean;
  checks: CheckResult[];
}

const LIST_MAX = 12;

/** The health score: the share of the weights of the checks that pass (checks switched off do not count). */
export function healthScore(checks: Pick<CheckResult, 'key' | 'ok'>[], weights: Record<PublishCheckKey, number>): number {
  let total = 0;
  let got = 0;
  for (const c of checks) {
    const w = weights[c.key] ?? 0;
    total += w;
    if (c.ok) got += w;
  }
  return total === 0 ? 100 : Math.round((got / total) * 100);
}

export function healthBand(score: number, bands: { good: number; fair: number }): HealthBand {
  return score >= bands.good ? 'good' : score >= bands.fair ? 'fair' : 'poor';
}

/** Reads Product.healthIssues back; anything malformed reads as "not checked yet". */
export function readStoredHealth(v: Prisma.JsonValue | null | undefined): StoredHealth | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.checkedAt !== 'string' || !Array.isArray(o.checks)) return null;
  const keys = new Set<string>(PUBLISH_CHECK_KEYS);
  const checks = (o.checks as unknown[]).filter(
    (c): c is CheckResult => !!c && typeof c === 'object' && keys.has((c as CheckResult).key) && typeof (c as CheckResult).ok === 'boolean' && Array.isArray((c as CheckResult).details),
  );
  return { checkedAt: o.checkedAt, ready: o.ready === true, checks };
}

/** The size chart that applies to a product: its own assignment, else its category's or the nearest ancestor's. */
export async function sizeChartOf(db: Db, storeId: number, productId: string, categoryId: string | null): Promise<SizeChartRef | null> {
  const pick = { orderBy: { createdAt: 'desc' }, select: { sizeChart: { select: { id: true, name: true } } } } as const;
  const own = await db.sizeChartAssignment.findFirst({ where: { storeId, productId, sizeChart: { archivedAt: null, storeId } }, ...pick });
  if (own) return { ...own.sizeChart, via: 'product' };
  let id = categoryId;
  for (let guard = 0; id && guard < 64; guard++) {
    const a = await db.sizeChartAssignment.findFirst({ where: { storeId, categoryId: id, productId: null, sizeChart: { archivedAt: null, storeId } }, ...pick });
    if (a) return { ...a.sizeChart, via: 'category' };
    const c: { parentId: string | null } | null = await db.category.findFirst({ where: { id, storeId }, select: { parentId: true } });
    id = c?.parentId ?? null;
  }
  return null;
}

/** Does this product need a size chart? Only when its garment type has measurement fields (or it has none yet). */
async function needsSizeChart(db: Db, storeId: number, categoryId: string | null): Promise<boolean> {
  const gt = await effectiveGarmentTypeOf(db, storeId, categoryId);
  if (!gt) return true;
  const row = await db.garmentType.findFirst({ where: { id: gt.id, storeId }, select: { measurementFields: true } });
  return !row || !Array.isArray(row.measurementFields) || row.measurementFields.length > 0;
}

const capped = (list: string[]) => (list.length > LIST_MAX ? [...list.slice(0, LIST_MAX), `more:${list.length - LIST_MAX}`] : list);

/** Runs every check that is switched on. Needs `catalogue.read`. Changes nothing. */
export async function productReadiness(deps: CatalogueDeps, who: Who, productId: string): Promise<Readiness> {
  await allow(deps, who, 'catalogue.read');
  const db = deps.db;
  const p = found(
    await db.product.findFirst({
      where: { id: productId, storeId: who.storeId },
      include: {
        category: { select: { id: true, archivedAt: true } },
        fabric: { select: { id: true, archivedAt: true } },
        variants: { where: { archivedAt: null, active: true }, select: { sku: true, priceMinor: true } },
      },
    }),
    'product',
  );
  const [levels, weights, bands] = await Promise.all([setting(deps, who, 'catalogue.publish.checks'), setting(deps, who, 'catalogue.health.weights'), setting(deps, who, 'catalogue.health.bands')]);
  const photos = await photoSetStatus({ db, settings: deps.settings }, { storeId: who.storeId, productId });
  const sizeChart = await sizeChartOf(db, who.storeId, productId, p.categoryId);

  const run = async (key: PublishCheckKey): Promise<string[]> => {
    switch (key) {
      case 'category':
        return !p.category ? ['none'] : p.category.archivedAt ? ['archived'] : [];
      case 'variants':
        return p.variants.length ? [] : ['none'];
      case 'price':
        if (!p.variants.length) return ['none'];
        return capped(p.variants.filter((v) => v.priceMinor == null || v.priceMinor <= 0).map((v) => `sku:${v.sku}`));
      case 'photos':
        return photos.ok ? [] : [...photos.missing, `count:${photos.count}/${photos.minimum}`];
      case 'sizeChart':
        return sizeChart || !(await needsSizeChart(db, who.storeId, p.categoryId)) ? [] : ['none'];
      case 'fabric':
        return !p.fabric ? ['none'] : p.fabric.archivedAt ? ['archived'] : [];
      case 'seo': {
        const n = await namingView(deps, who, productId);
        const out: string[] = [];
        for (const lang of LANGS) {
          for (const f of ['seoTitle', 'metaDescription'] as const) {
            const v = n[f][lang];
            if (!v.value.trim()) out.push(`${f}.${lang}`);
            else if (v.over) out.push(`${f}.${lang}:over`);
          }
        }
        return out;
      }
      case 'description':
        return (p.descriptionEn ?? '').trim() || (p.descriptionBn ?? '').trim() ? [] : ['none'];
      case 'stock':
        return p.inStock ? [] : ['none'];
    }
  };

  const checks: CheckResult[] = [];
  for (const key of PUBLISH_CHECK_KEYS) {
    const level = levels[key];
    if (level === 'off') continue;
    const details = await run(key);
    checks.push({ key, level, ok: details.length === 0, details });
  }
  const blocking = checks.filter((c) => !c.ok && c.level === 'block').map((c) => c.key);
  const reminders = checks.filter((c) => !c.ok && c.level === 'warn').map((c) => c.key);
  const score = healthScore(checks, weights);
  return {
    productId,
    status: p.status,
    archived: p.archivedAt != null,
    checks,
    blocking,
    reminders,
    ready: blocking.length === 0,
    score,
    band: healthBand(score, bands),
    photos,
    sizeChart,
    checkedAt: (deps.now?.() ?? new Date()).toISOString(),
  };
}
