// S06 · PR 164 — Reports › Fraud & RTO: the screen model of one fraud report (@extas/shipping fraudReport), built on the
// server with the page's words (messages/admin-fraud.*.json, `frd.*`). Four figures on top (caught, caught yet
// delivered, refused yet never caught, the cost probably saved — an estimate, marked so), the caught table by step, and
// the RTO cost book in taka by district, campaign, product, courier and reason. A part of the RTO cost the owner has not
// entered is named, and the total then says it is a floor. Nothing here moves money or changes an order.
import { FRAUD_CATCHES, RTO_GROUPS, RTO_PARTS, type FraudReport, type RtoGroup, type RtoGroupRow } from '@extas/shipping';

export type Words = (key: string, vars?: Record<string, string | number>) => string;

export interface FraudFormat {
  w: Words;
  money: (minor: number) => string;
  num: (n: number) => string;
  pct: (share: number) => string;
  /** The owner's words for a refusal reason key (orders.refusal.reasons), or the key itself. */
  reason: (key: string) => string;
  lang: 'en' | 'bn';
}

export interface FraudKpi {
  id: 'caught' | 'wrong' | 'missed' | 'saved';
  label: string;
  value: string;
  foot: string;
}

export interface FraudScreen {
  kpis: FraudKpi[];
  caught: { id: string; label: string; cells: string[]; total: boolean }[];
  caughtCols: string[];
  advancePaid: string | null;
  rto: {
    total: string;
    foot: string;
    /** The parts not entered yet, with how many parcels miss each; null when every cost is complete. */
    floor: string | null;
    cols: string[];
    groups: { id: RtoGroup; title: string; rows: { name: string; parcels: string; cost: string; incomplete: boolean; unknown: boolean }[] }[];
  };
  notes: string[];
}

const OUTCOME_COLS = ['orders', 'delivered', 'refused', 'cancelled', 'open'] as const;

function groupName(g: RtoGroup, r: RtoGroupRow, f: FraudFormat): string {
  if (r.key === null) return f.w(`rto.none.${g}`);
  if (g === 'reason') return f.reason(r.key);
  if (g === 'district') return (f.lang === 'bn' ? r.nameBn : null) ?? r.name ?? r.key;
  return r.name ?? r.key;
}

export function fraudScreen(r: FraudReport, f: FraudFormat): FraudScreen {
  const { w, money, num } = f;
  const any = r.caught.any;
  const saved = r.avoided.likelyMinor ?? r.avoided.upToMinor;
  const kpis: FraudKpi[] = [
    { id: 'caught', label: w('kpi.caught'), value: num(any.orders), foot: w('kpi.caughtFoot', { n: num(r.stopped) }) },
    { id: 'wrong', label: w('kpi.wrong'), value: num(r.wrong.orders), foot: r.wrong.rate === null ? w('kpi.wrongNone') : w('kpi.wrongFoot', { rate: f.pct(r.wrong.rate) }) },
    { id: 'missed', label: w('kpi.missed'), value: num(r.missed), foot: w('kpi.missedFoot') },
    {
      id: 'saved',
      label: w('kpi.saved'),
      value: saved === null ? '—' : money(saved),
      foot: r.avoided.upToMinor === null ? (r.stopped ? w('kpi.savedNoCost') : w('kpi.savedNone')) : r.avoided.likelyMinor === null ? w('kpi.savedUpOnly') : w('kpi.savedFoot', { upTo: money(r.avoided.upToMinor) }),
    },
  ];
  const caught = [...FRAUD_CATCHES, 'any' as const].map((k) => ({ id: k, label: w(`catch.${k}`), cells: OUTCOME_COLS.map((c) => num(r.caught[k][c])), total: k === 'any' }));
  const real = r.rto.real;
  const missing = RTO_PARTS.filter((p) => real.missing[p] > 0).map((p) => w('rto.missingPart', { part: w(`rto.part.${p}`), n: num(real.missing[p]) }));
  const notes: string[] = [];
  if (r.cut.orders) notes.push(w('cut.orders', { n: num(r.maxRows) }));
  if (r.cut.parcels) notes.push(w('cut.parcels', { n: num(r.maxRows) }));
  return {
    kpis,
    caught,
    caughtCols: [w('col.step'), ...OUTCOME_COLS.map((c) => w(`col.${c}`))],
    advancePaid: r.advancePaid ? w('advancePaid', { n: num(r.advancePaid) }) : null,
    rto: {
      total: money(real.knownMinor),
      foot: w('rto.totalFoot', { n: num(real.parcels) }),
      floor: real.incomplete ? w('rto.floor', { n: num(real.incomplete), parts: missing.join(', ') }) : null,
      cols: [w('rto.col.name'), w('rto.col.parcels'), w('rto.col.cost')],
      groups: RTO_GROUPS.map((g) => ({
        id: g,
        title: w(`rto.by.${g}`),
        rows: r.rto.groups[g].map((x) => ({ name: groupName(g, x, f), parcels: num(x.parcels), cost: money(x.knownMinor), incomplete: x.incomplete > 0, unknown: x.key === null })),
      })),
    },
    notes,
  };
}
