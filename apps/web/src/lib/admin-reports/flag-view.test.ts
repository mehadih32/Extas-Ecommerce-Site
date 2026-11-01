// PR 562 — the flag outcome report on the admin screen without a database: the screen model (the off and cut notes, the
// four figures, the pointers only once a share is set, the table per layer and per way asked, Western digits in
// Bengali), the names of the after-order ways, and every word in both languages. Every value is a made-up test value.
import { describe, expect, it } from 'vitest';
import type * as od from '@extas/orders';
import { t, type Dict } from '../i18n';
import abn from '../../../messages/admin-advance.bn.json';
import aen from '../../../messages/admin-advance.en.json';
import bn from '../../../messages/admin-flags.bn.json';
import en from '../../../messages/admin-flags.en.json';
import { flagScreen, wayLabel, type FlagFormat } from './flag-view';

const num = (n: number) => new Intl.NumberFormat('en', { numberingSystem: 'latn' }).format(n);

function fmt(lang: 'en' | 'bn'): FlagFormat {
  const d = (lang === 'bn' ? bn : en) as unknown as Dict;
  return {
    w: (k, vars) => t(d, `flg.${k}`, vars),
    num,
    pct: (x) => new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0, numberingSystem: 'latn' }).format(x),
    money: (m) => `৳${num(m / 100)}`,
  };
}

const tally = (over: Partial<od.FlagTally>): od.FlagTally => ({ key: 'k', name: null, flagged: 0, paid: 0, waiting: 0, walked: 0, left: 0, dodged: 0, waived: 0, paidDelivered: 0, paidRefused: 0, collectedMinor: 0, lostShare: 0, warn: false, ...over });

function report(over: Partial<od.FlagReport> = {}): od.FlagReport {
  return {
    enabled: true,
    from: '2026-10-02T06:00:00.000Z',
    to: '2026-11-01T06:00:00.000Z',
    days: 30,
    cut: false,
    warnLeftPercent: 40,
    minFlags: 5,
    total: tally({ key: 'all', flagged: 8, paid: 3, waiting: 1, walked: 2, left: 2, paidDelivered: 2, paidRefused: 1, collectedMinor: 36_000, lostShare: 0.5 }),
    checkout: [tally({ key: 'L1', name: 'New numbers', flagged: 6, paid: 2, waiting: 1, walked: 1, left: 2, paidDelivered: 1, paidRefused: 1, collectedMinor: 12_000, lostShare: 0.5, warn: true })],
    order: [tally({ key: 'team.full', flagged: 2, paid: 1, walked: 1, paidDelivered: 1, collectedMinor: 24_000, lostShare: 0.5 })],
    ...over,
  };
}

describe('PR 562 · the flag outcomes screen', () => {
  it('the figures, the layer pointed out, the table per layer and per way asked', () => {
    const s = flagScreen(report(), fmt('en'));
    expect(s.notes).toEqual([]);
    expect(s.kpis.map((k) => [k.id, k.value])).toEqual([
      ['flagged', '8'],
      ['paid', '3'],
      ['lost', '4'],
      ['collected', '৳360'],
    ]);
    expect(s.kpis[0]!.foot).toBe('At checkout 6 · after ordering 2');
    expect(s.kpis[1]!.foot).toBe('38% of those flagged');
    expect(s.kpis[2]!.foot).toContain('50%');
    expect(s.kpis[3]!.foot).toBe('Of those who paid: 2 delivered, 1 refused at the door');
    expect(s.pointNote).toContain('at least 5 times');
    expect(s.pointNote).toContain('40%');
    expect(s.pointers).toEqual([{ key: 'L1', text: expect.stringContaining('New numbers: 3 of 6 flagged walked away (50%)') }]);
    expect(s.checkout.cols).toHaveLength(12);
    expect(s.checkout.rows[0]).toEqual({ key: 'L1', label: 'New numbers', warn: true, cells: ['6', '2', '1', '2', '1', '0', '0', '1', '1', '৳120', '50%'] });
    expect(s.order.cols).toHaveLength(10);
    expect(s.order.rows[0]).toEqual({ key: 'team.full', label: 'The team — the full amount', warn: false, cells: ['2', '1', '0', '1', '0', '1', '0', '৳240', '50%'] });
  });

  it('off, cut, no share set, a removed layer; Bengali with Western digits', () => {
    const off = flagScreen(report({ enabled: false, total: tally({ key: 'all' }), checkout: [], order: [] }), fmt('en'));
    expect(off.notes).toEqual([en.flg.off]);
    expect(off.kpis[1]!.foot).toBe('— of those flagged');
    expect(flagScreen(report({ cut: true }), fmt('en')).notes).toEqual([en.flg.cut]);
    const quiet = flagScreen(report({ warnLeftPercent: null, checkout: [tally({ key: 'gone', flagged: 1, left: 1, lostShare: 1 })] }), fmt('en'));
    expect(quiet.pointNote).toBe(en.flg.point.off);
    expect(quiet.pointers).toEqual([]);
    expect(quiet.checkout.rows[0]!.label).toBe(en.flg.layer.unknown);
    const b = flagScreen(report(), fmt('bn'));
    expect(b.kpis[0]!.foot).toBe('চেকআউটে 6 · অর্ডারের পরে 2');
    expect(b.checkout.rows[0]!.cells).toEqual(['6', '2', '1', '2', '1', '0', '0', '1', '1', '৳120', '50%']);
    expect(b.order.rows[0]!.label).toBe('টিম — পুরো টাকা');
  });

  it('the after-order ways: the team, the auto option, a risk level; an unknown kind keeps its code', () => {
    const w = fmt('en').w;
    expect(wayLabel(w, 'team.delivery')).toBe('The team — delivery charge');
    expect(wayLabel(w, 'auto.codOff')).toBe('Auto option — no cash on delivery');
    expect(wayLabel(w, 'level.high')).toBe('Risk level — high');
    expect(wayLabel(w, 'team.other')).toBe('The team — other');
  });

  it('every word exists in English and Bengali', () => {
    const keys = (o: unknown, p = ''): string[] => (o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k)) : [p]);
    expect(keys(bn).sort()).toEqual(keys(en).sort());
    expect(keys(abn.outcomes).sort()).toEqual(keys(aen.outcomes).sort());
  });
});
