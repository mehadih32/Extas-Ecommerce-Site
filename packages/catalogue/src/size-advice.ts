// PR 59 — the Find My Size training service and the size report (register PR 59 "the chart data, the ease model, and
// the admin report"; the engine is size-training.ts, the screen comes on the new admin shell). It reads what the finder
// has already recorded (PR 58: `SizeRecommendation` — height, weight, the size the chart gave, the size the shopper
// took, and no name, phone or visitor id), links each answer to the order line it led to and to a size exchange
// (follow-up 153), and from that proposes a new ease per garment type and fit as a `SizeAdviceModel` version.
//
// What this never does: change a size chart, publish anything by itself, or use a trained version until the owner
// switches that version on and `catalogue.sizeAdvice.useTrainedEase` is on. Every write is audited; the recommendation
// rows are append-only, so linking only fills the two empty columns the finder left (`orderItemId`, `exchangedForSize`).
import { z } from 'zod';
import { allow, found, logChange, parse, setting, type CatalogueDeps, type Who } from './context';
import { CatalogueError } from './errors';
import { productChartChoices, type ProductChartChoice } from './size-charts';
import { groupStats, proposeEase, readModelData, type GroupStats, type EaseProposal, type SizeAdviceModelData, type SizeAnswer, type TrainingNumbers } from './size-training';

const DAY_MS = 86_400_000;

/** A garment type and fit together: the key a trained version is stored under. */
export const groupKey = (garmentTypeId: string, fitKey: string | null) => `${garmentTypeId}:${fitKey ?? ''}`;

export interface SizeReportGroup {
  garmentTypeId: string;
  garmentTypeKey: string | null;
  garmentTypeNameEn: string | null;
  fitKey: string | null;
  /** The charts of this garment type and fit the answers came through. */
  charts: { id: string; name: string; easeInch: number }[];
  /** The ease the group's charts give today (the first chart's; the charts of one group share their fit). */
  easeInch: number;
  stats: GroupStats;
  proposal: EaseProposal;
  /** The version switched on for this group, when there is one. */
  activeModel: { id: string; version: number; easeInch: number } | null;
  /** The newest version made for this group, switched on or not. */
  latestModel: { id: string; version: number; easeInch: number; isActive: boolean } | null;
}

export interface SizeReportProduct {
  productId: string;
  nameEn: string;
  nameBn: string | null;
  slug: string;
  garmentTypeId: string | null;
  fitKey: string | null;
  stats: GroupStats;
}

export interface SizeReport {
  /** Answers read, and how many of them are tied to an order line. */
  answers: number;
  ordered: number;
  /** Answers on a product with no chart of its own kind: they teach nothing and are only counted. */
  unmatched: number;
  window: { fromIso: string; toIso: string; days: number };
  numbers: TrainingNumbers;
  /** On: Find My Size reads the active versions' ease instead of the chart's (`catalogue.sizeAdvice.useTrainedEase`). */
  useTrainedEase: boolean;
  groups: SizeReportGroup[];
  products: SizeReportProduct[];
  /** The report's own moment, so a screen can say when it was read. */
  readAtIso: string;
}

export const sizeReportQuery = z.object({ days: z.int().min(1).max(1_095).optional(), productLimit: z.int().min(1).max(500).optional() }).strict();
export type SizeReportQuery = z.input<typeof sizeReportQuery>;

interface Numbers extends TrainingNumbers {
  windowDays: number;
  pageSize: number;
  linkWindowHours: number;
  useReviews: boolean;
  useTrainedEase: boolean;
}

async function numbersOf(deps: CatalogueDeps, who: Who): Promise<Numbers> {
  const s = await setting(deps, who, 'catalogue.sizeAdvice');
  return {
    minAnswers: s.report.minAnswers,
    flagSharePct: s.report.flagSharePct,
    maxEaseAdjustInch: s.train.maxEaseAdjustInch,
    stepInch: s.train.stepInch,
    windowDays: s.report.windowDays,
    pageSize: s.report.pageSize,
    linkWindowHours: s.train.linkWindowHours,
    useReviews: s.train.useReviews,
    useTrainedEase: s.useTrainedEase,
  };
}

/** One answer row as the engine reads it, with the product it was given on. */
interface AnswerRow extends SizeAnswer {
  productId: string;
}

/**
 * The answers of the window, each with the size it gave, the size the shopper took and the size he swapped to. The
 * sizes come back as the shop's own keys, so the engine can compare their places in one order.
 */
async function answersIn(deps: CatalogueDeps, who: Who, from: Date, to: Date): Promise<AnswerRow[]> {
  const rows = await deps.db.sizeRecommendation.findMany({
    where: { storeId: who.storeId, createdAt: { gte: from, lte: to } },
    select: { productId: true, recommendedSizeId: true, chosenSizeId: true, orderItemId: true, exchangedForSize: true, reasoning: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!rows.length) return [];
  const sizeIds = [...new Set(rows.flatMap((r) => [r.recommendedSizeId, r.chosenSizeId].filter((x): x is string => !!x)))];
  const sizes = sizeIds.length ? await deps.db.size.findMany({ where: { storeId: who.storeId, id: { in: sizeIds } }, select: { id: true, key: true } }) : [];
  const keyOf = new Map(sizes.map((s) => [s.id, s.key]));
  // the size a size exchange swapped to, for the lines these answers led to (the strongest signal there is)
  const itemIds = [...new Set(rows.flatMap((r) => (r.orderItemId ? [r.orderItemId] : [])))];
  const swapped = itemIds.length ? await swapTargets(deps, who, itemIds) : new Map<string, string>();
  return rows.map((r) => ({
    productId: r.productId,
    recommended: r.recommendedSizeId ? (keyOf.get(r.recommendedSizeId) ?? null) : null,
    chosen: r.chosenSizeId ? (keyOf.get(r.chosenSizeId) ?? null) : null,
    ordered: r.orderItemId !== null,
    exchangedTo: r.orderItemId ? (swapped.get(r.orderItemId) ?? null) : null,
    verdict: null,
    easeInch: easeOf(r.reasoning),
  }));
}

const easeOf = (reasoning: unknown): number | null => {
  if (!reasoning || typeof reasoning !== 'object' || Array.isArray(reasoning)) return null;
  const v = (reasoning as Record<string, unknown>).ease;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/** For each order line: the size a finished-or-running size exchange swapped it to (a refused one teaches nothing). */
async function swapTargets(deps: CatalogueDeps, who: Who, orderItemIds: string[]): Promise<Map<string, string>> {
  const items = await deps.db.exchangeItem.findMany({
    where: {
      storeId: who.storeId,
      originalOrderItemId: { in: orderItemIds },
      newVariantId: { not: null },
      exchange: { storeId: who.storeId, status: { notIn: ['REJECTED', 'CANCELLED'] } },
    },
    select: { originalOrderItemId: true, newVariantId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!items.length) return new Map();
  const variantIds = [...new Set(items.flatMap((i) => (i.newVariantId ? [i.newVariantId] : [])))];
  const variants = await deps.db.productVariant.findMany({ where: { storeId: who.storeId, id: { in: variantIds } }, select: { id: true, size: { select: { key: true } } } });
  const sizeOf = new Map(variants.map((v) => [v.id, v.size?.key ?? null]));
  const out = new Map<string, string>();
  for (const i of items) {
    const key = i.newVariantId ? sizeOf.get(i.newVariantId) : null;
    if (key && !out.has(i.originalOrderItemId)) out.set(i.originalOrderItemId, key);
  }
  return out;
}

/** PR 59 — the size report: per garment type and fit, and per product, what the answers say and what they propose. */
export async function sizeReport(deps: CatalogueDeps, who: Who, query: SizeReportQuery = {}): Promise<SizeReport> {
  await allow(deps, who, 'catalogue.read');
  const q = parse(sizeReportQuery, query, 'size report query');
  const n = await numbersOf(deps, who);
  const days = q.days ?? n.windowDays;
  const to = deps.now?.() ?? new Date();
  const from = new Date(to.getTime() - days * DAY_MS);
  const [{ products, sizeOrder }, answers, models] = await Promise.all([
    productChartChoices(deps, who),
    answersIn(deps, who, from, to),
    deps.db.sizeAdviceModel.findMany({ where: { storeId: who.storeId, archivedAt: null }, orderBy: [{ version: 'desc' }] }),
  ]);
  const byProduct = new Map(products.map((p) => [p.productId, p]));
  type ReportBucket = { chart: ProductChartChoice; answers: SizeAnswer[]; charts: Map<string, { id: string; name: string; easeInch: number }> };
  const groups = new Map<string, ReportBucket>();
  const perProduct = new Map<string, SizeAnswer[]>();
  let unmatched = 0;
  for (const a of answers) {
    const p = byProduct.get(a.productId);
    perProduct.set(a.productId, [...(perProduct.get(a.productId) ?? []), a]);
    if (!p?.garmentTypeId || !p.chartId) {
      unmatched++;
      continue;
    }
    const key = groupKey(p.garmentTypeId, p.fitKey);
    const g: ReportBucket = groups.get(key) ?? { chart: p, answers: [], charts: new Map() };
    g.answers.push(a);
    g.charts.set(p.chartId, { id: p.chartId, name: p.chartName ?? '', easeInch: p.easeInch ?? 0 });
    groups.set(key, g);
  }
  const modelFor = (garmentTypeId: string, fitKey: string | null) => models.filter((m) => m.garmentTypeId === garmentTypeId && (m.fitKey ?? null) === fitKey);
  const reportGroups: SizeReportGroup[] = [...groups.values()]
    .map((g) => {
      const stats = groupStats(g.answers, sizeOrder, n);
      const easeInch = g.chart.easeInch ?? 0;
      const mine = modelFor(g.chart.garmentTypeId!, g.chart.fitKey);
      const active = mine.find((m) => m.isActive) ?? null;
      const latest = mine[0] ?? null;
      const ease = (row: (typeof mine)[number] | null) => (row ? (readModelData(row.model)?.easeInch ?? 0) : 0);
      return {
        garmentTypeId: g.chart.garmentTypeId!,
        garmentTypeKey: g.chart.garmentTypeKey,
        garmentTypeNameEn: g.chart.garmentTypeNameEn,
        fitKey: g.chart.fitKey,
        charts: [...g.charts.values()],
        easeInch,
        stats,
        proposal: proposeEase(stats, easeInch, n),
        activeModel: active ? { id: active.id, version: active.version, easeInch: ease(active) } : null,
        latestModel: latest ? { id: latest.id, version: latest.version, easeInch: ease(latest), isActive: latest.isActive } : null,
      };
    })
    .sort((a, b) => b.stats.answers - a.stats.answers || (a.garmentTypeKey ?? '').localeCompare(b.garmentTypeKey ?? ''));
  const reportProducts: SizeReportProduct[] = [...perProduct.entries()]
    .map(([productId, list]) => {
      const p = byProduct.get(productId);
      return {
        productId,
        nameEn: p?.nameEn ?? '',
        nameBn: p?.nameBn ?? null,
        slug: p?.slug ?? '',
        garmentTypeId: p?.garmentTypeId ?? null,
        fitKey: p?.fitKey ?? null,
        stats: groupStats(list, sizeOrder, n),
      };
    })
    .sort((a, b) => b.stats.answers - a.stats.answers || a.nameEn.localeCompare(b.nameEn))
    .slice(0, q.productLimit ?? n.pageSize);
  return {
    answers: answers.length,
    ordered: answers.filter((a) => a.ordered).length,
    unmatched,
    window: { fromIso: from.toISOString(), toIso: to.toISOString(), days },
    numbers: { minAnswers: n.minAnswers, flagSharePct: n.flagSharePct, maxEaseAdjustInch: n.maxEaseAdjustInch, stepInch: n.stepInch },
    useTrainedEase: n.useTrainedEase,
    groups: reportGroups,
    products: reportProducts,
    readAtIso: to.toISOString(),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Follow-up 153 — the answer, the order line it led to, and the exchange that followed
// ---------------------------------------------------------------------------------------------------------------

export interface LinkResult {
  /** Answers with a size taken but no order line yet, that were looked at. */
  looked: number;
  /** Answers tied to exactly one order line of that product and size inside the window. */
  linked: number;
  /** Answers with more than one possible line: left alone, because a wrong link teaches the wrong thing. */
  ambiguous: number;
  /** Linked answers whose line was later swapped for another size. */
  exchanged: number;
}

/**
 * Follow-up 153 — ties each Find My Size answer to the order line it led to and marks the ones that ended in a size
 * exchange, so the training engine learns the true fit. The answer keeps no name, phone or visitor id (PR 58), so the
 * line is found by what the answer itself knows: the same product, the size he took, and an order placed inside the
 * owner's `linkWindowHours` after the answer. **Exactly one** candidate line is linked; two or more are left alone.
 */
export async function linkSizeAnswers(deps: CatalogueDeps, who: Who, opts: { days?: number } = {}): Promise<LinkResult> {
  await allow(deps, who, 'catalogue.write');
  const n = await numbersOf(deps, who);
  const to = deps.now?.() ?? new Date();
  const from = new Date(to.getTime() - (opts.days ?? n.windowDays) * DAY_MS);
  const open = await deps.db.sizeRecommendation.findMany({
    where: { storeId: who.storeId, createdAt: { gte: from, lte: to }, orderItemId: null, chosenSizeId: { not: null } },
    select: { id: true, productId: true, chosenSizeId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const out: LinkResult = { looked: open.length, linked: 0, ambiguous: 0, exchanged: 0 };
  if (!open.length) return out;
  const sizeIds = [...new Set(open.map((r) => r.chosenSizeId!))];
  const sizes = await deps.db.size.findMany({ where: { storeId: who.storeId, id: { in: sizeIds } }, select: { id: true, key: true, label: true } });
  const labelOf = new Map(sizes.map((s) => [s.id, s.label]));
  const taken = new Set<string>();
  const linkedIds: { id: string; orderItemId: string }[] = [];
  for (const r of open) {
    const label = labelOf.get(r.chosenSizeId!);
    if (!label) continue;
    const until = new Date(r.createdAt.getTime() + n.linkWindowHours * 3_600_000);
    const candidates = await deps.db.orderItem.findMany({
      where: {
        storeId: who.storeId,
        productId: r.productId,
        sizeLabel: label,
        status: { not: 'REMOVED' },
        order: { storeId: who.storeId, placedAt: { gte: r.createdAt, lte: until }, status: { not: 'DRAFT' } },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 3,
    });
    const free = candidates.filter((c) => !taken.has(c.id));
    if (free.length !== 1) {
      if (free.length > 1) out.ambiguous++;
      continue;
    }
    taken.add(free[0]!.id);
    linkedIds.push({ id: r.id, orderItemId: free[0]!.id });
  }
  if (!linkedIds.length) return out;
  const swapped = await swapTargets(deps, who, linkedIds.map((l) => l.orderItemId));
  for (const l of linkedIds) {
    const exchanged = swapped.has(l.orderItemId);
    // the row is append-only: only the two columns the finder left empty are filled
    const r = await deps.db.sizeRecommendation.updateMany({
      where: { id: l.id, storeId: who.storeId, orderItemId: null },
      data: { orderItemId: l.orderItemId, exchangedForSize: exchanged },
    });
    if (r.count) {
      out.linked++;
      if (exchanged) out.exchanged++;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The ease model: train a version, switch one on
// ---------------------------------------------------------------------------------------------------------------

export interface SizeAdviceModelView {
  id: string;
  garmentTypeId: string;
  garmentTypeKey: string | null;
  fitKey: string | null;
  version: number;
  isActive: boolean;
  easeInch: number;
  baseEaseInch: number;
  deltaInch: number;
  signals: number;
  verdict: SizeAdviceModelData['proposal']['verdict'] | null;
  trainedAtIso: string;
  archived: boolean;
}

export const trainInput = z.object({ days: z.int().min(1).max(1_095).optional(), garmentTypeId: z.uuid().optional(), fitKey: z.string().max(60).optional() }).strict();
export type TrainInput = z.input<typeof trainInput>;

export interface TrainResult {
  /** A version made for each group with enough signals and a move to make. */
  trained: SizeAdviceModelView[];
  /** Groups left alone, with why ('not-enough' or 'balanced' — the chart already fits). */
  skipped: { garmentTypeId: string; fitKey: string | null; why: 'not-enough' | 'balanced' }[];
}

/**
 * Makes a new, **switched-off** version per garment type and fit from the signals of the window. A group without the
 * owner's smallest number of signals, or whose proposal is no move at all, gets nothing (there is nothing to approve).
 * The version carries the whole report of that group, so the owner sees what it was trained on.
 */
export async function trainSizeAdvice(deps: CatalogueDeps, who: Who, input: TrainInput = {}): Promise<TrainResult> {
  await allow(deps, who, 'catalogue.sizeAdvice');
  const d = parse(trainInput, input, 'training request');
  const report = await sizeReport(deps, who, d.days ? { days: d.days } : {});
  const groups = report.groups.filter((g) => (d.garmentTypeId ? g.garmentTypeId === d.garmentTypeId : true) && (d.fitKey === undefined ? true : (g.fitKey ?? '') === d.fitKey));
  const out: TrainResult = { trained: [], skipped: [] };
  const at = deps.now?.() ?? new Date();
  for (const g of groups) {
    if (!g.proposal.enough) {
      out.skipped.push({ garmentTypeId: g.garmentTypeId, fitKey: g.fitKey, why: 'not-enough' });
      continue;
    }
    if (g.proposal.deltaInch === 0) {
      out.skipped.push({ garmentTypeId: g.garmentTypeId, fitKey: g.fitKey, why: 'balanced' });
      continue;
    }
    const { currentEaseInch, ...proposal } = g.proposal;
    const data: SizeAdviceModelData = {
      engine: 'ease-v1',
      easeInch: g.proposal.proposedEaseInch,
      baseEaseInch: currentEaseInch,
      deltaInch: g.proposal.deltaInch,
      stats: g.stats,
      proposal,
      window: { fromIso: report.window.fromIso, toIso: report.window.toIso, days: report.window.days },
      numbers: report.numbers,
      chartIds: g.charts.map((c) => c.id),
      trainedAtIso: at.toISOString(),
    };
    const highest = await deps.db.sizeAdviceModel.findFirst({
      where: { storeId: who.storeId, garmentTypeId: g.garmentTypeId, fitKey: g.fitKey },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (highest?.version ?? 0) + 1;
    const row = await deps.db.$transaction(async (tx) => {
      const made = await tx.sizeAdviceModel.create({
        data: { storeId: who.storeId, garmentTypeId: g.garmentTypeId, fitKey: g.fitKey, version, model: data as unknown as object, isActive: false, createdAt: at },
      });
      await logChange(tx, who, 'sizeAdvice.train', 'SizeAdviceModel', made.id, null, {
        garmentTypeId: g.garmentTypeId,
        fitKey: g.fitKey,
        version,
        easeInch: data.easeInch,
        baseEaseInch: data.baseEaseInch,
        signals: g.stats.signals,
      });
      return made;
    });
    out.trained.push({
      id: row.id,
      garmentTypeId: g.garmentTypeId,
      garmentTypeKey: g.garmentTypeKey,
      fitKey: g.fitKey,
      version,
      isActive: false,
      easeInch: data.easeInch,
      baseEaseInch: data.baseEaseInch,
      deltaInch: data.deltaInch,
      signals: g.stats.signals,
      verdict: proposal.verdict,
      trainedAtIso: data.trainedAtIso,
      archived: false,
    });
  }
  return out;
}

export const modelQuery = z.object({ garmentTypeId: z.uuid().optional(), includeArchived: z.boolean().optional() }).strict();
export type ModelQuery = z.input<typeof modelQuery>;

/** Every trained version, newest first (the owner's list of what he may switch on). */
export async function listSizeAdviceModels(deps: CatalogueDeps, who: Who, query: ModelQuery = {}): Promise<SizeAdviceModelView[]> {
  await allow(deps, who, 'catalogue.read');
  const q = parse(modelQuery, query, 'model query');
  const rows = await deps.db.sizeAdviceModel.findMany({
    where: { storeId: who.storeId, ...(q.garmentTypeId ? { garmentTypeId: q.garmentTypeId } : {}), ...(q.includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ createdAt: 'desc' }, { version: 'desc' }],
  });
  const keys = await garmentKeys(deps, who.storeId, rows.map((r) => r.garmentTypeId));
  return rows.map((r) => viewOfModel(r, keys.get(r.garmentTypeId) ?? null));
}

/** The garment types' own keys, for the version list (the version row keeps only the id). */
async function garmentKeys(deps: CatalogueDeps, storeId: number, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const rows = await deps.db.garmentType.findMany({ where: { storeId, id: { in: unique } }, select: { id: true, key: true } });
  return new Map(rows.map((g) => [g.id, g.key]));
}

function viewOfModel(r: { id: string; garmentTypeId: string; fitKey: string | null; version: number; isActive: boolean; model: unknown; createdAt: Date; archivedAt: Date | null }, garmentTypeKey: string | null): SizeAdviceModelView {
  const d = readModelData(r.model);
  return {
    id: r.id,
    garmentTypeId: r.garmentTypeId,
    garmentTypeKey,
    fitKey: r.fitKey,
    version: r.version,
    isActive: r.isActive,
    easeInch: d?.easeInch ?? 0,
    baseEaseInch: d?.baseEaseInch ?? 0,
    deltaInch: d?.deltaInch ?? 0,
    signals: d?.stats.signals ?? 0,
    verdict: d?.proposal.verdict ?? null,
    trainedAtIso: (d?.trainedAtIso ?? r.createdAt.toISOString()) as string,
    archived: r.archivedAt !== null,
  };
}

/**
 * Switches a version on or off. One version at a time per garment type and fit: switching one on switches the others
 * of that group off (nothing is deleted — every version stays, with its report). Find My Size reads it only while
 * `catalogue.sizeAdvice.useTrainedEase` is on, and the owner's chart is never changed.
 */
export async function setSizeAdviceModelActive(deps: CatalogueDeps, who: Who, id: string, active: boolean): Promise<SizeAdviceModelView> {
  await allow(deps, who, 'catalogue.sizeAdvice');
  if (typeof id !== 'string' || !id) throw new CatalogueError('INVALID_INPUT', 'a version id is needed', ['id']);
  const row = found(await deps.db.sizeAdviceModel.findFirst({ where: { id, storeId: who.storeId } }), 'trained version');
  if (row.archivedAt) throw new CatalogueError('CONFLICT', 'that version is archived');
  if (active && !readModelData(row.model)) throw new CatalogueError('INVALID_INPUT', 'that version holds no ease this engine can read', ['model']);
  const updated = await deps.db.$transaction(async (tx) => {
    if (active) {
      await tx.sizeAdviceModel.updateMany({
        where: { storeId: who.storeId, garmentTypeId: row.garmentTypeId, fitKey: row.fitKey, isActive: true, NOT: { id: row.id } },
        data: { isActive: false },
      });
    }
    const next = await tx.sizeAdviceModel.update({ where: { id: row.id }, data: { isActive: active } });
    await logChange(tx, who, active ? 'sizeAdvice.activate' : 'sizeAdvice.deactivate', 'SizeAdviceModel', row.id, { isActive: row.isActive }, { isActive: active, easeInch: readModelData(row.model)?.easeInch ?? null });
    return next;
  });
  const keys = await garmentKeys(deps, who.storeId, [row.garmentTypeId]);
  return viewOfModel({ ...updated, model: updated.model }, keys.get(row.garmentTypeId) ?? null);
}

// ---------------------------------------------------------------------------------------------------------------
// What the storefront reads
// ---------------------------------------------------------------------------------------------------------------

/** The ease a switched-on version gives, by garment type and fit (`groupKey`); empty when none is switched on. */
export async function activeSizeEase(deps: Pick<CatalogueDeps, 'db'>, storeId: number): Promise<Map<string, number>> {
  const rows = await deps.db.sizeAdviceModel.findMany({
    where: { storeId, isActive: true, archivedAt: null },
    select: { garmentTypeId: true, fitKey: true, model: true },
  });
  const out = new Map<string, number>();
  for (const r of rows) {
    const d = readModelData(r.model);
    if (d) out.set(groupKey(r.garmentTypeId, r.fitKey ?? null), d.easeInch);
  }
  return out;
}
