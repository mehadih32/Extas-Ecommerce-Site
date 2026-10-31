// S06 · PR 524 — Reports › Stopped by the engine: the screen model of one stop report (@extas/orders stopReport), built
// on the server with the page's words (messages/admin-stopped.*.json, `stp.*`). Four figures on top (the stops, the stops
// delivered all the same, the rules to check, the orders the good-customer override spared), the table per rule (its
// stops, how they ended, the wrong rate, the flag), and every stop, newest first, with the order, the rule, what fired,
// how sure the rule was and what became of the order. Nothing here changes an order or a rule.
import { STOP_RULES, type StopOutcome, type StopReport, type StopRule } from '@extas/orders';
import { orderHref } from '../admin-orders/model';

export type Words = (key: string, vars?: Record<string, string | number>) => string;

export interface StopFormat {
  w: Words;
  num: (n: number) => string;
  pct: (share: number) => string;
  /** A stop's time in the admin's zone. */
  when: (iso: string) => string;
  /** The owner's name of a risk band (risk.bands), or the key. */
  band: (key: string) => string;
  /** The words of a duplicate rule's letter (orders.alert.rule.*), or null when there are none. */
  dupRule: (letter: string) => string | null;
}

export interface StopKpi {
  id: 'stops' | 'wrong' | 'flagged' | 'spared';
  label: string;
  value: string;
  foot: string;
}

export interface StopRuleRow {
  id: StopRule;
  label: string;
  cells: string[];
  flagged: boolean;
}

export interface StopListRow {
  key: string;
  orderId: string;
  href: string;
  number: string;
  rule: string;
  why: string;
  sure: string;
  when: string;
  outcome: string;
  tone: 'ok' | 'warn' | 'line';
}

export interface StopScreen {
  kpis: StopKpi[];
  ruleCols: string[];
  rules: StopRuleRow[];
  /** The flag's words beside a flagged rule. */
  flagWord: string;
  listCols: string[];
  list: StopListRow[];
  notes: string[];
}

const OUTCOME_TONE: Readonly<Record<StopOutcome, StopListRow['tone']>> = { delivered: 'warn', refused: 'ok', cancelled: 'line', open: 'line' };

/** Who asked an advance by itself (the system source of the request), and its words. */
const ADVANCE_SOURCES: Readonly<Record<string, string>> = { checkout: 'checkout', 'risk-levels': 'levelAsk', refusers: 'refuserAsk' };

/** What fired inside the rule, in words. */
function whyOf(r: StopReport['rows'][number], f: StopFormat): string {
  const d = r.detail;
  if (!d) return '—';
  if (r.rule === 'levelHold') return f.w('why.level', { band: f.band(d) });
  if (r.rule === 'advance') return ADVANCE_SOURCES[d] ? f.w(`why.${ADVANCE_SOURCES[d]}`) : d;
  if (d === 'duplicate') return f.w('why.duplicate');
  const letters = d.split(', ');
  // the duplicate rules' letters, each with its words; a risk section's key as it is
  if (letters.every((l) => f.dupRule(l))) return letters.map((l) => `${l} · ${f.dupRule(l)}`).join('; ');
  return d;
}

/** How sure the rule was: a review's confidence, or the order's risk score for a level's hold. */
function sureOf(r: StopReport['rows'][number], f: StopFormat): string {
  if (r.confidence === null) return '—';
  return r.rule === 'levelHold' ? f.w('sure.score', { n: f.num(r.confidence) }) : f.w('sure.pct', { n: f.num(r.confidence) });
}

export function stopScreen(report: StopReport, f: StopFormat): StopScreen {
  const { w, num, pct } = f;
  const delivered = report.rows.filter((r) => r.outcome === 'delivered').length;
  const ended = report.rows.filter((r) => r.outcome !== 'open').length;
  const flagged = report.rules.filter((r) => r.flagged).length;
  const kpis: StopKpi[] = [
    { id: 'stops', label: w('kpi.stops'), value: num(report.rows.length), foot: w('kpi.stopsFoot', { n: num(ended) }) },
    { id: 'wrong', label: w('kpi.wrong'), value: num(delivered), foot: ended ? w('kpi.wrongFoot', { rate: pct(delivered / ended) }) : w('kpi.wrongNone') },
    {
      id: 'flagged',
      label: w('kpi.flagged'),
      value: report.warnWrongPercent === null ? '—' : num(flagged),
      foot: report.warnWrongPercent === null ? w('kpi.flaggedOff') : w('kpi.flaggedFoot', { pct: pct(report.warnWrongPercent / 100), n: num(report.minStops) }),
    },
    { id: 'spared', label: w('kpi.spared'), value: num(report.spared), foot: w('kpi.sparedFoot') },
  ];
  const rules: StopRuleRow[] = STOP_RULES.map((id) => {
    const t = report.rules.find((x) => x.rule === id) ?? { stops: 0, delivered: 0, refused: 0, cancelled: 0, open: 0, wrongRate: null, flagged: false };
    return { id, label: w(`rule.${id}`), cells: [num(t.stops), num(t.delivered), num(t.refused), num(t.cancelled), num(t.open), t.wrongRate === null ? '—' : pct(t.wrongRate)], flagged: t.flagged };
  });
  const list: StopListRow[] = report.rows.map((r, i) => ({
    key: `${r.orderId}-${r.rule}-${i}`,
    orderId: r.orderId,
    href: orderHref(r.orderId),
    number: r.number,
    rule: w(`rule.${r.rule}`),
    why: whyOf(r, f),
    sure: sureOf(r, f),
    when: f.when(r.at),
    outcome: w(`outcome.${r.outcome}`),
    tone: OUTCOME_TONE[r.outcome],
  }));
  const notes = report.cut ? [w('cut', { n: num(report.rows.length) })] : [];
  return {
    kpis,
    ruleCols: ['rule', 'stops', 'delivered', 'refused', 'cancelled', 'open', 'wrong'].map((c) => w(`col.${c}`)),
    rules,
    flagWord: w('flag'),
    listCols: ['order', 'rule', 'why', 'sure', 'when', 'outcome'].map((c) => w(`col.${c}`)),
    list,
    notes,
  };
}
