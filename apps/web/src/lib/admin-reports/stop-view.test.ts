// PR 524 — false-positive protection on the admin screens without a database: the stop report's screen model (the four
// figures, the rule table with its flag, the stop list with what fired and how sure, the cut note, Western digits in
// Bengali), and the good-customer override on the order screens (the list chip, the level line, the timeline line).
// Every word key exists in both languages. Every value is a made-up test value.
import { describe, expect, it } from 'vitest';
import type * as od from '@extas/orders';
import { GOOD_CUSTOMER_FLAG, tallyStops } from '@extas/orders';
import { t, type Dict } from '../i18n';
import obn from '../../../messages/admin-orders.bn.json';
import oen from '../../../messages/admin-orders.en.json';
import bn from '../../../messages/admin-stopped.bn.json';
import en from '../../../messages/admin-stopped.en.json';
import { adminDicts } from '../admin-i18n';
import type { AdminView } from '../admin-page';
import { goodCustomerLine } from '../admin-orders/detail';
import { flagChips } from '../admin-orders/list';
import { levelSummary } from '../admin-orders/risk';
import { stopScreen, type StopFormat } from './stop-view';

const OID = '01a16af2-30f0-7462-aab8-719bb3ce5240';
const row = (over: Partial<od.StopRow>): od.StopRow => ({ orderId: OID, number: 'EX-4001', rule: 'levelHold', detail: 'high', confidence: 35, at: '2026-10-30T06:00:00.000Z', outcome: 'delivered', ...over });

function report(rows: od.StopRow[], over: Partial<od.StopReport> = {}): od.StopReport {
  const opts = { warnWrongPercent: over.warnWrongPercent === undefined ? 50 : over.warnWrongPercent, minStops: over.minStops ?? 2 };
  return { from: '2026-10-24T06:00:00.000Z', to: '2026-10-31T06:00:00.000Z', days: 7, rows, rules: tallyStops(rows, opts), spared: 4, cut: false, ...opts, ...over };
}

function fmt(lang: 'en' | 'bn'): StopFormat {
  const d = { ...adminDicts[lang], ...((lang === 'bn' ? bn : en) as unknown as Dict) };
  return {
    w: (k, vars) => t(d, `stp.${k}`, vars),
    num: (n) => new Intl.NumberFormat(lang, { numberingSystem: 'latn' }).format(n),
    pct: (x) => new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0, numberingSystem: 'latn' }).format(x),
    when: (iso) => iso.slice(0, 10),
    band: (k) => (k === 'high' ? (lang === 'bn' ? 'বেশি' : 'High') : k),
    dupRule: (l) => {
      const v = t(d, `orders.alert.rule.${l}`);
      return v === `orders.alert.rule.${l}` ? null : v;
    },
  };
}
const view = (lang: 'en' | 'bn'): AdminView => ({ lang, dict: adminDicts[lang], locale: lang, timeZone: 'Asia/Dhaka', storeName: null });

describe('PR 524 · the stop report screen', () => {
  const rows = [
    row({}),
    row({ number: 'EX-4002', outcome: 'delivered' }),
    row({ number: 'EX-4003', outcome: 'refused' }),
    row({ number: 'EX-4004', rule: 'duplicateReview', detail: 'A, D', confidence: 90, outcome: 'open' }),
    row({ number: 'EX-4005', rule: 'advance', detail: 'checkout', confidence: null, outcome: 'cancelled' }),
    row({ number: 'EX-4006', rule: 'advance', detail: 'risk-levels', confidence: null, outcome: 'open' }),
  ];

  it('the four figures, the rule table with the flag, and every stop with what fired and how sure', () => {
    const s = stopScreen(report(rows), fmt('en'));
    expect(s.kpis.map((k) => [k.id, k.value])).toEqual([
      ['stops', '6'],
      ['wrong', '2'],
      ['flagged', '1'],
      ['spared', '4'],
    ]);
    expect(s.kpis[0]!.foot).toBe('4 of them have ended');
    expect(s.kpis[1]!.foot).toBe('50% of the stops that ended');
    const level = s.rules.find((r) => r.id === 'levelHold')!;
    expect(level).toMatchObject({ label: en.stp.rule.levelHold, flagged: true, cells: ['3', '2', '1', '0', '0', '67%'] });
    expect(s.rules.find((r) => r.id === 'blocklistHold')).toMatchObject({ flagged: false, cells: ['0', '0', '0', '0', '0', '—'] });
    expect(s.list[0]).toMatchObject({ number: 'EX-4001', href: `/admin/orders/${OID}`, why: 'Level High', sure: 'Score 35', outcome: 'Delivered', tone: 'warn' });
    expect(s.list[3]).toMatchObject({ why: `A · ${oen.orders.alert.rule.A}; D · ${oen.orders.alert.rule.D}`, sure: '90% sure', tone: 'line' });
    expect(s.list[4]).toMatchObject({ why: 'At checkout', sure: '—', outcome: 'Cancelled' });
    expect(s.list[5]!.why).toBe(en.stp.why.levelAsk);
    expect(s.notes).toEqual([]);
  });

  it('no warning share: nothing flagged and the card is named; nothing ended; the cut note; Bengali with Western digits', () => {
    const off = stopScreen(report(rows, { warnWrongPercent: null }), fmt('en'));
    expect(off.kpis[2]).toMatchObject({ value: '—', foot: en.stp.kpi.flaggedOff });
    expect(off.rules.some((r) => r.flagged)).toBe(false);
    const open = stopScreen(report([row({ outcome: 'open' })]), fmt('en'));
    expect(open.kpis[1]!.foot).toBe(en.stp.kpi.wrongNone);
    expect(stopScreen(report(rows, { cut: true }), fmt('en')).notes).toEqual([t(en as unknown as Dict, 'stp.cut', { n: '6' })]);
    const b = stopScreen(report(rows), fmt('bn'));
    expect(b.kpis[0]!.foot).toContain('4');
    expect(b.list[0]!.why).toBe('লেভেল বেশি');
    expect(b.listCols[0]).toBe(bn.stp.col.order);
  });

  it('every word exists in English and Bengali', () => {
    const keys = (o: unknown, p = ''): string[] => (o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k)) : [p]);
    expect(keys(bn).sort()).toEqual(keys(en).sort());
    for (const d of [oen.orders, obn.orders]) {
      expect(d.flag.goodCustomer && d.risk.level.GOOD_CUSTOMER && d.ev.order_goodCustomer && d.ev.goodCustomer && d.ev.gcSkip.duplicateHold && d.ev.gcSkip.levelHold).toBeTruthy();
      expect(Object.keys(d.rr.gc).sort()).toEqual(Object.keys(oen.orders.rr.gc).sort());
    }
  });
});

describe('PR 524 · the good-customer override on the order screens', () => {
  it('the list chip, the level line and the timeline line in both languages', () => {
    const r = { status: 'PLACED', cancelRequested: false, inReview: false, holdReasonCode: null, customerWantsChange: false, orderGroupId: null, internalFlags: [], source: 'WEBSITE', flags: [GOOD_CUSTOMER_FLAG] } as unknown as od.OrderRow;
    const labels = { holdReasons: new Map<string, string>(), flags: new Map<string, string>() };
    expect(flagChips(view('en'), r, labels)).toEqual([{ label: oen.orders.flag.goodCustomer, tone: 'ok' }]);
    expect(flagChips(view('bn'), r, labels)[0]!.label).toBe(obn.orders.flag.goodCustomer);
    expect(levelSummary(view('en'), { band: 'high', watch: false, hold: 'GOOD_CUSTOMER', call: false, ask: 'none' }, [{ key: 'high', en: 'High', bn: 'বেশি' }])).toContain(oen.orders.risk.level.GOOD_CUSTOMER);
    expect(goodCustomerLine(view('en'), { skipped: 'levelHold', delivered: 3, refused: 0 })).toBe("The risk level's hold skipped · 3 delivered, 0 refused before");
    expect(goodCustomerLine(view('bn'), { skipped: 'duplicateHold', delivered: 2, refused: 1 })).toContain('2টা');
    expect(goodCustomerLine(view('en'), { skipped: 'levelAdvance', delivered: 4, refused: 0 })).toBe('The automatic advance request skipped · 4 delivered, 0 refused before');
    expect(goodCustomerLine(view('en'), { skipped: 'other' })).toBeNull();
  });
});
