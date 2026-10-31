// S06 · PR 524 — false-positive protection, the stop report ("a weekly report lists everything the engine stopped, so a
// wrong rule is caught within days, not months"). For the last `risk.stopReport.days` days (a week as shipped) it lists
// every order the engine stopped by itself, with the rule, how sure the rule was (0–100, when it says) and what became of
// the order:
//   - duplicateReview — a review the duplicate or risk rules opened (FraudAlert), its confidence;
//   - duplicateHold   — the duplicate check's automatic hold;
//   - levelHold       — a risk level's hold (the order's score is the confidence);
//   - blocklistHold   — the blocklist's hold;
//   - advance         — an advance the engine asked by itself.
// Per rule: the stops, how they ended (delivered all the same = probably wrong, refused, cancelled, still open) and the
// wrong rate out of the stops that ended; a rule at or above the owner's `warnWrongPercent` over at least `minStops`
// ended stops is flagged. Also how many orders the good-customer override spared. The report only reads.
import { allow, nowOf, setting, type OrdersDeps, type Who } from './context';
import { GOOD_CUSTOMER_EVENT } from './good-customer';

export const STOP_RULES = ['duplicateReview', 'duplicateHold', 'levelHold', 'blocklistHold', 'advance'] as const;
export type StopRule = (typeof STOP_RULES)[number];
export const STOP_OUTCOMES = ['delivered', 'refused', 'cancelled', 'open'] as const;
export type StopOutcome = (typeof STOP_OUTCOMES)[number];

/** The system sources whose hold is a rule's stop (a risk level's hold is read from its own level row, whoever re-scored). */
const HOLD_SOURCES: Readonly<Record<string, StopRule>> = { 'duplicate-check': 'duplicateHold', blocklist: 'blocklistHold' };

export interface StopRow {
  orderId: string;
  number: string;
  rule: StopRule;
  /** What fired inside the rule (the duplicate rules' letters, the section, the band), when it says. */
  detail: string | null;
  confidence: number | null;
  at: string;
  outcome: StopOutcome;
}

export interface StopRuleTally {
  rule: StopRule;
  stops: number;
  delivered: number;
  refused: number;
  cancelled: number;
  open: number;
  /** Delivered all the same, out of the stops that ended (null with none ended). */
  wrongRate: number | null;
  flagged: boolean;
}

export interface StopReport {
  from: string;
  to: string;
  days: number;
  rows: StopRow[];
  rules: StopRuleTally[];
  /** Orders the good-customer override spared an automatic hold. */
  spared: number;
  /** More stops than the report lists. */
  cut: boolean;
  warnWrongPercent: number | null;
  minStops: number;
}

export function outcomeOfStatus(status: string): StopOutcome {
  if (status === 'DELIVERED' || status === 'PARTIALLY_DELIVERED') return 'delivered';
  if (status === 'RETURNED') return 'refused';
  if (status === 'CANCELLED') return 'cancelled';
  return 'open';
}

/** The tally per rule (pure): the outcomes, the wrong rate out of the ended stops, and the flag. */
export function tallyStops(rows: readonly Pick<StopRow, 'rule' | 'outcome'>[], opts: { warnWrongPercent: number | null; minStops: number }): StopRuleTally[] {
  return STOP_RULES.map((rule) => {
    const mine = rows.filter((r) => r.rule === rule);
    const n = (o: StopOutcome) => mine.filter((r) => r.outcome === o).length;
    const t = { rule, stops: mine.length, delivered: n('delivered'), refused: n('refused'), cancelled: n('cancelled'), open: n('open') };
    const ended = t.delivered + t.refused + t.cancelled;
    const wrongRate = ended ? t.delivered / ended : null;
    const flagged = opts.warnWrongPercent !== null && wrongRate !== null && ended >= opts.minStops && wrongRate * 100 >= opts.warnWrongPercent;
    return { ...t, wrongRate, flagged };
  });
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** The report for the last `days` days (`risk.report`, as the fraud report). */
export async function stopReport(deps: OrdersDeps, who: Who): Promise<StopReport> {
  await allow(deps, who, 'risk.report');
  const cfg = await setting(deps, who.storeId, 'risk.stopReport');
  const to = nowOf(deps);
  const from = new Date(to.getTime() - cfg.days * 86_400_000);
  const storeId = who.storeId;
  const take = cfg.maxRows + 1;
  const [alerts, holds, levelHolds, asks, spared] = await Promise.all([
    deps.db.fraudAlert.findMany({ where: { storeId, createdAt: { gte: from, lte: to } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take, select: { orderId: true, confidence: true, summary: true, createdAt: true } }),
    deps.db.orderEvent.findMany({ where: { storeId, type: 'order.hold', actorType: 'SYSTEM', source: { in: Object.keys(HOLD_SOURCES) }, createdAt: { gte: from, lte: to } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take, select: { orderId: true, source: true, createdAt: true } }),
    deps.db.orderEvent.findMany({ where: { storeId, type: 'order.riskLevel', data: { path: ['hold'], equals: 'held' }, createdAt: { gte: from, lte: to } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take, select: { orderId: true, data: true, createdAt: true } }),
    deps.db.orderEvent.findMany({ where: { storeId, type: 'order.awaitAdvance', actorType: 'SYSTEM', createdAt: { gte: from, lte: to } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take, select: { orderId: true, source: true, createdAt: true } }),
    // one order spared twice (its hold and its advance) counts once
    deps.db.orderEvent.findMany({ where: { storeId, type: GOOD_CUSTOMER_EVENT, createdAt: { gte: from, lte: to } }, distinct: ['orderId'], select: { orderId: true } }),
  ]);
  const reviews = alerts.map((a) => {
    const s = obj(a.summary);
    const rules = Array.isArray(s.rules) ? s.rules.map((h) => str(obj(h).rule)).filter((x): x is string => !!x) : [];
    return { orderId: a.orderId, rule: 'duplicateReview' as const, detail: rules.length ? rules.join(', ') : str(s.section), confidence: a.confidence, at: a.createdAt.toISOString() };
  });
  // the duplicate check holds only with its review open: the hold says what that review says
  const reviewOf = new Map([...reviews].reverse().map((r) => [r.orderId, r]));
  const raw: Omit<StopRow, 'number' | 'outcome'>[] = [
    ...reviews,
    ...holds.map((h) => {
      const rule = HOLD_SOURCES[h.source]!;
      const review = rule === 'duplicateHold' ? reviewOf.get(h.orderId) : undefined;
      return { orderId: h.orderId, rule, detail: review?.detail ?? null, confidence: review?.confidence ?? null, at: h.createdAt.toISOString() };
    }),
    ...levelHolds.map((h) => ({ orderId: h.orderId, rule: 'levelHold' as const, detail: str(obj(h.data).band), confidence: null, at: h.createdAt.toISOString() })),
    ...asks.map((h) => ({ orderId: h.orderId, rule: 'advance' as const, detail: h.source, confidence: null, at: h.createdAt.toISOString() })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const cut = raw.length > cfg.maxRows;
  const kept = raw.slice(0, cfg.maxRows);
  const ids = [...new Set(kept.map((r) => r.orderId))];
  const [orders, scores] = await Promise.all([
    deps.db.order.findMany({ where: { storeId, id: { in: ids } }, select: { id: true, number: true, status: true } }),
    // a level's hold: the order's score is how sure the rule was
    deps.db.orderEvent.findMany({ where: { storeId, orderId: { in: ids }, type: 'order.riskAssess' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { orderId: true, data: true } }),
  ]);
  const byId = new Map(orders.map((o) => [o.id, o]));
  const first = <T extends { orderId: string }>(rows: T[]) => {
    const m = new Map<string, T>();
    for (const r of rows) if (!m.has(r.orderId)) m.set(r.orderId, r);
    return m;
  };
  const score = first(scores);
  const rows: StopRow[] = kept.flatMap((r) => {
    const o = byId.get(r.orderId);
    if (!o) return [];
    const s = obj(score.get(r.orderId)?.data).score;
    const levelHold = r.rule === 'levelHold';
    return [{ ...r, number: o.number, outcome: outcomeOfStatus(o.status), confidence: r.confidence ?? (levelHold && typeof s === 'number' ? s : null) }];
  });
  return { from: from.toISOString(), to: to.toISOString(), days: cfg.days, rows, rules: tallyStops(rows, cfg), spared: spared.length, cut, warnWrongPercent: cfg.warnWrongPercent, minStops: cfg.minStops };
}
