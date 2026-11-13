// S28 · PR 662 — the courier score out of 10 (Admin v5, Rules › Order flow › Courier score; DECISIONS.md "Orders").
//
// Six checks read from the courier history of a customer's number — the delivery success rate, the parcels taken, the
// returns, the worst courier's success rate, the couriers that have a record, and the fraud reports other shops filed —
// each scored 0, 5 or 10 by the owner's two limits (`risk.courierScore`), weighted, averaged into one score out of 10
// (higher is better). The data is what the shop already reads: each connected courier's own fraud check kept for the
// number (CourierFraudCheck, PR 559) and, where no courier answered, the number's own orders here (PR 157's history).
//
// A check nobody could answer is "unknown". The score is then worked out from the checks that are known, but the
// order never gets a red score because of what nobody knows: it goes to the call list (the band is 'call'). A number
// with nothing known anywhere has no score at all (null) and goes to the call list too.
//
// A read. It decides nothing about an order and moves no money (CLAUDE.md rule 6); PR 663's auto-confirm table reads it.
// No AI call: the one-line reason is built from the figures (the screen words it from its dictionary).
import { COURIER_SCORE_LOWER_IS_BETTER, COURIER_SCORE_METRICS, type CourierScoreMetric, type RiskCourierScore } from '@extas/settings';
import { allow, nowOf, setting, UUID, type OrdersDeps, type Who } from './context';
import { isOrdersError } from './errors';
import { execute, type By } from './service';
import { historyOptions, phoneForms, phoneOrders } from './phone-history';
import { summarizeHistory } from './phone-summary';

/** What the score does with an order: confirm by rule, go to the call list, or a red tag for a person. */
export type ScoreBand = 'auto' | 'call' | 'person';

/** One courier's own answer for a number (kept at phone entry), with its age. */
export interface CourierScoreSource {
  provider: string;
  delivered: number;
  cancelled: number;
  /** Fraud reports other shops filed, when the courier's answer carries them (else null: not known from this courier). */
  fraudReports: number | null;
  checkedAt: Date;
}

/** What one score is worked out from. */
export interface CourierScoreFacts {
  /** Each connected courier's answer for the number. */
  couriers: readonly CourierScoreSource[];
  /** The number's own earlier orders here (used when no courier answered). */
  own: { delivered: number; refused: number } | null;
}

export interface MetricResult {
  key: CourierScoreMetric;
  /** The figure (a % for the two rates); null: unknown. */
  value: number | null;
  /** 0, 5 or 10; null: unknown. */
  points: 0 | 5 | 10 | null;
  weight: number;
  /** Where the figure came from: courier keys, or 'own'; empty when unknown. */
  sources: string[];
  /** Minutes since the newest source answered; null for the number's own orders or when unknown. */
  ageMinutes: number | null;
}

export type ScoreReasonKey = 'noRecord' | 'unknownChecks' | 'green' | 'middle' | 'red';

export interface CourierScoreResult {
  /** 0–10 to one decimal; null when nothing is known about the number. */
  score: number | null;
  band: ScoreBand;
  metrics: MetricResult[];
  /** At least one weighted check is unknown (then the band is never red, and never green). */
  partial: boolean;
  /** The one plain line, as a dictionary key with its figures. */
  reason: { key: ScoreReasonKey; values: Record<string, number | string> };
}

/** 0, 5 or 10 points of one figure by the owner's two limits. */
export function pointsOf(key: CourierScoreMetric, value: number, good: number, ok: number): 0 | 5 | 10 {
  if (COURIER_SCORE_LOWER_IS_BETTER.includes(key)) return value <= good ? 10 : value <= ok ? 5 : 0;
  return value >= good ? 10 : value >= ok ? 5 : 0;
}

/** The band a score falls in by the owner's two limits. */
export function scoreBand(score: number, cfg: Pick<RiskCourierScore, 'upperScore' | 'lowerScore'>): ScoreBand {
  return score >= cfg.upperScore ? 'auto' : score >= cfg.lowerScore ? 'call' : 'person';
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a * 100) / b) : null);

/** The six figures from the facts (null = unknown). */
export function figuresOf(f: CourierScoreFacts): Record<CourierScoreMetric, { value: number | null; sources: string[]; at: Date | null }> {
  const ans = f.couriers;
  const useCouriers = ans.length > 0 && ans.some((c) => c.delivered + c.cancelled > 0);
  const newest = (xs: readonly CourierScoreSource[]) => xs.reduce<Date | null>((m, x) => (!m || x.checkedAt > m ? x.checkedAt : m), null);
  const none = { value: null, sources: [] as string[], at: null as Date | null };
  const out: Record<CourierScoreMetric, { value: number | null; sources: string[]; at: Date | null }> = { success: none, parcels: none, returns: none, worst: none, couriers: none, fraud: none };
  if (useCouriers) {
    const delivered = ans.reduce((a, c) => a + c.delivered, 0);
    const cancelled = ans.reduce((a, c) => a + c.cancelled, 0);
    const src = ans.map((c) => c.provider);
    const at = newest(ans);
    const withRecord = ans.filter((c) => c.delivered + c.cancelled > 0);
    out.success = { value: pct(delivered, delivered + cancelled), sources: src, at };
    out.parcels = { value: delivered + cancelled, sources: src, at };
    out.returns = { value: cancelled, sources: src, at };
    out.worst = { value: Math.min(...withRecord.map((c) => pct(c.delivered, c.delivered + c.cancelled) ?? 0)), sources: withRecord.map((c) => c.provider), at: newest(withRecord) };
    out.couriers = { value: withRecord.length, sources: src, at };
    const reports = ans.filter((c) => c.fraudReports !== null);
    if (reports.length) out.fraud = { value: reports.reduce((a, c) => a + (c.fraudReports ?? 0), 0), sources: reports.map((c) => c.provider), at: newest(reports) };
  } else if (f.own && f.own.delivered + f.own.refused > 0) {
    const total = f.own.delivered + f.own.refused;
    const own = ['own'];
    out.success = { value: pct(f.own.delivered, total), sources: own, at: null };
    out.parcels = { value: total, sources: own, at: null };
    out.returns = { value: f.own.refused, sources: own, at: null };
    // the worst courier and the couriers with a record, and fraud reports, are courier facts: unknown from our own orders
  }
  return out;
}

/** The score of one number: the pure function (the same facts and settings always give the same answer). */
export function scoreCourier(f: CourierScoreFacts, cfg: RiskCourierScore, now: Date): CourierScoreResult {
  const fig = figuresOf(f);
  const metrics: MetricResult[] = COURIER_SCORE_METRICS.map((key) => {
    const c = cfg[key];
    const g = fig[key];
    return {
      key,
      value: g.value,
      points: g.value === null ? null : pointsOf(key, g.value, c.good, c.ok),
      weight: c.weight,
      sources: g.sources,
      ageMinutes: g.at ? Math.max(0, Math.round((now.getTime() - g.at.getTime()) / 60_000)) : null,
    };
  });
  const counted = metrics.filter((m) => m.weight > 0);
  const known = counted.filter((m) => m.points !== null);
  const partial = known.length < counted.length;
  if (!known.length) return { score: null, band: 'call', metrics, partial: true, reason: { key: 'noRecord', values: {} } };
  const W = known.reduce((a, m) => a + m.weight, 0);
  const score = Math.round((known.reduce((a, m) => a + (m.points as number) * m.weight, 0) / W) * 10) / 10;
  let band = scoreBand(score, cfg);
  // unknown is never red, and never green either: the order goes to the call list
  if (partial) band = 'call';
  const v = (k: CourierScoreMetric) => fig[k].value ?? 0;
  const values = { score, parcels: v('parcels'), success: v('success'), returns: v('returns'), unknown: counted.length - known.length };
  const key: ScoreReasonKey = partial ? 'unknownChecks' : band === 'auto' ? 'green' : band === 'call' ? 'middle' : 'red';
  return { score, band, metrics, partial, reason: { key, values } };
}

/** The facts of a number as the shop holds them now: each courier's kept answer and the number's own orders. */
export async function courierScoreFacts(deps: OrdersDeps, storeId: number, phone: string | null, opts: { excludeOrderId?: string; at?: Date } = {}): Promise<CourierScoreFacts> {
  const at = opts.at ?? nowOf(deps);
  const forms = phoneForms(phone);
  if (!forms.length) return { couriers: [], own: null };
  const rows = await deps.db.courierFraudCheck.findMany({
    where: { storeId, phone: { in: forms }, ok: true, checkedAt: { lte: at }, expiresAt: { gt: at } },
    orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }],
    select: { provider: true, deliveredCount: true, cancelledCount: true, checkedAt: true, result: true },
  });
  const by = new Map<string, CourierScoreSource>();
  for (const r of rows) {
    if (by.has(r.provider)) continue;
    const raw = r.result as Record<string, unknown> | null;
    const fr = raw && typeof raw === 'object' ? (raw.fraudReports ?? raw.fraud_reports ?? raw.fraudCount) : null;
    by.set(r.provider, {
      provider: r.provider,
      delivered: r.deliveredCount ?? 0,
      cancelled: r.cancelledCount ?? 0,
      fraudReports: typeof fr === 'number' && Number.isInteger(fr) && fr >= 0 ? fr : null,
      checkedAt: r.checkedAt,
    });
  }
  const h = await historyOptions(deps, storeId);
  const past = await phoneOrders(deps, storeId, phone, { excludeOrderId: opts.excludeOrderId, before: opts.at, take: h.take });
  const s = summarizeHistory(past, { ourFault: h.ourFault });
  return { couriers: [...by.values()], own: { delivered: s.delivered, refused: s.refused } };
}

/** The score of a number now, or null while the owner's switch is off. */
export async function courierScoreOf(deps: OrdersDeps, storeId: number, phone: string | null, opts: { excludeOrderId?: string; at?: Date } = {}): Promise<CourierScoreResult | null> {
  const cfg = await setting(deps, storeId, 'risk.courierScore');
  if (!cfg.enabled) return null;
  return scoreCourier(await courierScoreFacts(deps, storeId, phone, opts), cfg, opts.at ?? nowOf(deps));
}

/** The order page's card (`orders.risk.read`): the score of this order's number with every check, its source and age. */
export async function orderCourierScore(deps: OrdersDeps, who: Who, orderId: string): Promise<{ enabled: boolean; result: CourierScoreResult | null; upper: number; lower: number } | null> {
  await allow(deps, who, 'orders.risk.read');
  if (!UUID.test(orderId)) return null;
  const o = await deps.db.order.findFirst({ where: { id: orderId, storeId: who.storeId }, select: { id: true, phone: true, placedAt: true } });
  if (!o) return null;
  const cfg = await setting(deps, who.storeId, 'risk.courierScore');
  if (!cfg.enabled) return { enabled: false, result: null, upper: cfg.upperScore, lower: cfg.lowerScore };
  const result = scoreCourier(await courierScoreFacts(deps, who.storeId, o.phone, { excludeOrderId: o.id }), cfg, nowOf(deps));
  return { enabled: true, result, upper: cfg.upperScore, lower: cfg.lowerScore };
}

/** The settings card's worked example: the score of figures typed in (no database). */
export function workedExample(
  cfg: RiskCourierScore,
  values: Record<CourierScoreMetric, number>,
): { metrics: { key: CourierScoreMetric; value: number; points: 0 | 5 | 10; weightPct: number }[]; score: number; band: ScoreBand } {
  const W = COURIER_SCORE_METRICS.reduce((a, k) => a + cfg[k].weight, 0) || 1;
  const metrics = COURIER_SCORE_METRICS.map((key) => ({ key, value: values[key], points: pointsOf(key, values[key], cfg[key].good, cfg[key].ok), weightPct: Math.round((cfg[key].weight / W) * 100) }));
  const score = Math.round((metrics.reduce((a, m) => a + m.points * cfg[m.key].weight, 0) / W) * 10) / 10;
  return { metrics, score, band: scoreBand(score, cfg) };
}

// ---------------------------------------------------------------------------------------------------------------------
// The score kept on the order, and the accuracy report
// ---------------------------------------------------------------------------------------------------------------------

/** The timeline type of a score kept on an order (a note; the status stays). */
export const COURIER_SCORE_EVENT = 'order.courierScore';

/**
 * Keeps the number's score on the order's timeline the moment the order lands (while the owner's switch is on), so the
 * accuracy report can compare what the score said with what happened. A note only: nothing about the order changes.
 */
export async function noteCourierScore(deps: OrdersDeps, ref: { storeId: number; orderId: string }, by: By): Promise<CourierScoreResult | null> {
  const o = await deps.db.order.findFirst({ where: { id: ref.orderId, storeId: ref.storeId }, select: { phone: true, placedAt: true } });
  if (!o) return null;
  const r = await courierScoreOf(deps, ref.storeId, o.phone, { excludeOrderId: ref.orderId });
  if (!r) return null;
  try {
    await execute(
      deps,
      ref,
      by,
      { command: 'courierScore', input: { score: r.score }, effect: async () => ({ reasonCode: r.band, eventData: { score: r.score, band: r.band, partial: r.partial, reason: r.reason.key } }) },
      { idempotencyKey: `courier-score:${ref.orderId}` },
    );
  } catch (e) {
    if (!isOrdersError(e) || e.code !== 'ILLEGAL_TRANSITION') throw e;
  }
  return r;
}

export interface ScoreAccuracyRow {
  band: ScoreBand | 'unknown';
  orders: number;
  delivered: number;
  returned: number;
  cancelled: number;
  /** Returned of (delivered + returned), in %; null when none finished yet. */
  returnedPct: number | null;
}

export interface ScoreAccuracy {
  days: number;
  rows: ScoreAccuracyRow[];
  /** The one suggestion line, as a dictionary key with figures; null when there is nothing to suggest. */
  suggestion: { key: 'greenReturns'; values: { pct: number; band: string } } | null;
}

/** What really happened to scored orders, by band (`orders.risk.read`): the last `risk.courierScoreReport.days` days. */
export async function courierScoreAccuracy(deps: OrdersDeps, who: Who): Promise<ScoreAccuracy> {
  await allow(deps, who, 'orders.risk.read');
  const cfg = await setting(deps, who.storeId, 'risk.courierScoreReport');
  const from = new Date(nowOf(deps).getTime() - cfg.days * 86_400_000);
  const events = await deps.db.orderEvent.findMany({
    where: { storeId: who.storeId, type: COURIER_SCORE_EVENT, createdAt: { gte: from } },
    orderBy: { createdAt: 'desc' },
    take: cfg.maxRows,
    select: { orderId: true, reasonCode: true, data: true },
  });
  const ids = [...new Set(events.map((e) => e.orderId))];
  const orders = ids.length ? await deps.db.order.findMany({ where: { storeId: who.storeId, id: { in: ids } }, select: { id: true, status: true } }) : [];
  const status = new Map(orders.map((o) => [o.id, o.status]));
  const rows = new Map<string, ScoreAccuracyRow>();
  const seen = new Set<string>();
  for (const e of events) {
    if (seen.has(e.orderId)) continue;
    seen.add(e.orderId);
    const d = e.data as { score?: number | null; partial?: boolean } | null;
    const band: ScoreAccuracyRow['band'] = d?.score === null || d?.score === undefined ? 'unknown' : ((e.reasonCode as ScoreBand) ?? 'call');
    const r = rows.get(band) ?? { band, orders: 0, delivered: 0, returned: 0, cancelled: 0, returnedPct: null };
    r.orders++;
    const st = status.get(e.orderId);
    if (st === 'DELIVERED' || st === 'PARTIALLY_DELIVERED') r.delivered++;
    else if (st === 'RETURNED') r.returned++;
    else if (st === 'CANCELLED') r.cancelled++;
    rows.set(band, r);
  }
  const order: ScoreAccuracyRow['band'][] = ['auto', 'call', 'person', 'unknown'];
  const out = order.map((b) => rows.get(b)).filter((r): r is ScoreAccuracyRow => !!r);
  for (const r of out) r.returnedPct = r.delivered + r.returned > 0 ? Math.round((r.returned * 100) / (r.delivered + r.returned)) : null;
  const green = out.find((r) => r.band === 'auto');
  const suggestion =
    green && green.returnedPct !== null && green.delivered + green.returned >= 10 && green.returnedPct >= 20
      ? { key: 'greenReturns' as const, values: { pct: green.returnedPct, band: 'auto' } }
      : null;
  return { days: cfg.days, rows: out, suggestion };
}
