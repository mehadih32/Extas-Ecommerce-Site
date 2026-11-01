// S06 · PR 562 — Reports › Flag outcomes: the screen model of one flag outcome report (@extas/orders flagReport), built on
// the server with the page's words (messages/admin-flags.*.json, `flg.*`): the off and cut notes, the four figures, the
// layers pointed out, the table per checkout layer and the table per way the advance was asked after ordering. Nothing
// here acts.
import type { FlagReport, FlagTally } from '@extas/orders';

export type Words = (key: string, vars?: Record<string, string | number>) => string;

export interface FlagFormat {
  w: Words;
  num: (n: number) => string;
  pct: (share: number) => string;
  money: (minor: number) => string;
}

export interface FlagKpi {
  id: 'flagged' | 'paid' | 'lost' | 'collected';
  label: string;
  value: string;
  foot: string;
}

export interface FlagTable {
  cols: string[];
  rows: { key: string; label: string; warn: boolean; cells: string[] }[];
}

export interface FlagScreen {
  notes: string[];
  kpis: FlagKpi[];
  pointNote: string;
  pointers: { key: string; text: string }[];
  checkout: FlagTable;
  order: FlagTable;
}

const ASK_KINDS = ['delivery', 'partial', 'full', 'codOff'];

/** The owner's name of an after-order way ("team.full", "auto.delivery", "level.high"). */
export function wayLabel(w: Words, key: string): string {
  const dot = key.indexOf('.');
  const head = key.slice(0, dot);
  const rest = key.slice(dot + 1);
  const kind = ASK_KINDS.includes(rest) ? w(`kind.${rest}`) : rest;
  if (head === 'team') return w('way.team', { kind });
  if (head === 'auto') return w('way.auto', { kind });
  return w('way.level', { level: rest });
}

const CHECKOUT_COLS = ['layer', 'flagged', 'paid', 'waiting', 'left', 'walked', 'dodged', 'waived', 'paidDelivered', 'paidRefused', 'collected', 'lostShare'] as const;
const ORDER_COLS = ['way', 'flagged', 'paid', 'waiting', 'walked', 'waived', 'paidDelivered', 'paidRefused', 'collected', 'lostShare'] as const;

export function flagScreen(r: FlagReport, f: FlagFormat): FlagScreen {
  const { w, num } = f;
  const t = r.total;
  const share = (n: number) => (t.flagged ? f.pct(n / t.flagged) : '—');
  const notes = [...(r.enabled ? [] : [w('off')]), ...(r.cut ? [w('cut')] : [])];
  const sum = (rows: FlagTally[]) => rows.reduce((a, x) => a + x.flagged, 0);
  const kpis: FlagKpi[] = [
    { id: 'flagged', label: w('kpi.flagged'), value: num(t.flagged), foot: w('kpi.flaggedFoot', { checkout: num(sum(r.checkout)), order: num(sum(r.order)) }) },
    { id: 'paid', label: w('kpi.paid'), value: num(t.paid), foot: w('kpi.paidFoot', { pct: share(t.paid) }) },
    { id: 'lost', label: w('kpi.lost'), value: num(t.walked + t.left), foot: w('kpi.lostFoot', { pct: share(t.walked + t.left) }) },
    { id: 'collected', label: w('kpi.collected'), value: f.money(t.collectedMinor), foot: w('kpi.collectedFoot', { delivered: num(t.paidDelivered), refused: num(t.paidRefused) }) },
  ];
  const layerName = (x: FlagTally) => x.name ?? w('layer.unknown');
  const cell = (x: FlagTally, c: string): string => {
    if (c === 'collected') return f.money(x.collectedMinor);
    if (c === 'lostShare') return x.flagged ? f.pct(x.lostShare) : '—';
    return num(x[c as keyof Pick<FlagTally, 'flagged' | 'paid' | 'waiting' | 'left' | 'walked' | 'dodged' | 'waived' | 'paidDelivered' | 'paidRefused'>]);
  };
  const table = (rows: FlagTally[], cols: readonly string[], label: (x: FlagTally) => string): FlagTable => ({
    cols: cols.map((c) => w(`col.${c}`)),
    rows: rows.map((x) => ({ key: x.key, label: label(x), warn: x.warn, cells: cols.slice(1).map((c) => cell(x, c)) })),
  });
  const pointers = [...r.checkout.map((x) => ({ x, label: layerName(x) })), ...r.order.map((x) => ({ x, label: wayLabel(w, x.key) }))]
    .filter(({ x }) => x.warn)
    .map(({ x, label }) => ({ key: x.key, text: w('point.line', { name: label, lost: num(x.walked + x.left), n: num(x.flagged), pct: f.pct(x.lostShare) }) }));
  return {
    notes,
    kpis,
    pointNote: r.warnLeftPercent === null ? w('point.off') : w('point.d', { pct: f.pct(r.warnLeftPercent / 100), n: num(r.minFlags) }),
    pointers,
    checkout: table(r.checkout, CHECKOUT_COLS, layerName),
    order: table(r.order, ORDER_COLS, (x) => wayLabel(w, x.key)),
  };
}
