// PR 164 — the Fraud & RTO screen model: the four figures (the saved cost an estimate, "up to" beside it, no figure
// without a complete parcel cost), the caught table with "Any step", the cost book's names (district in Bengali, the
// owner's reason words, unknown rows named), the floor note naming the missing parts, and the cut-short notes. Every
// word key exists in both languages. Every value is a made-up test value.
import { describe, expect, it } from 'vitest';
import type { FraudReport } from '@extas/shipping';
import { t, type Dict } from '../i18n';
import bn from '../../../messages/admin-fraud.bn.json';
import en from '../../../messages/admin-fraud.en.json';
import { fraudScreen, type FraudFormat } from './fraud-view';

const outcomes = (orders = 0, delivered = 0, refused = 0, cancelled = 0, open = 0) => ({ orders, delivered, refused, cancelled, open });
const missing = (n = 0) => ({ forward: 0, return: 0, packaging: n, handling: 0, adShare: 0 });

function report(over: Partial<FraudReport> = {}): FraudReport {
  return {
    from: new Date('2026-10-01T00:00:00Z'),
    to: null,
    caught: { watch: outcomes(2, 1, 1), blocklist: outcomes(1, 0, 1), refuser: outcomes(), review: outcomes(1, 0, 0, 1), advance: outcomes(), any: outcomes(3, 1, 1, 1) },
    wrong: { orders: 1, rate: 0.5 },
    stopped: 1,
    advancePaid: 0,
    missed: 4,
    avoided: { perParcelMinor: 13_500, basisParcels: 2, upToMinor: 13_500, likelyMinor: 6_750 },
    rto: {
      real: { parcels: 2, knownMinor: 27_000, incomplete: 0, missing: missing() },
      groups: {
        district: [
          { key: 'd1', name: 'Testpur', nameBn: 'টেস্টপুর', parcels: 1, knownMinor: 14_500, incomplete: 0 },
          { key: null, name: null, nameBn: null, parcels: 1, knownMinor: 12_500, incomplete: 0 },
        ],
        campaign: [],
        product: [],
        courier: [{ key: 'C1', name: 'C1', nameBn: null, parcels: 2, knownMinor: 27_000, incomplete: 0 }],
        reason: [{ key: 'changed-mind', name: null, nameBn: null, parcels: 1, knownMinor: 12_500, incomplete: 1 }],
      },
    },
    cut: { orders: false, parcels: false },
    maxRows: 5_000,
    ...over,
  };
}

const fmt = (lang: 'en' | 'bn'): FraudFormat => {
  const dict = (lang === 'bn' ? bn : en) as unknown as Dict;
  return { w: (k, v) => t(dict, `frd.${k}`, v), money: (m) => `৳${m / 100}`, num: (n) => String(n), pct: (x) => `${Math.round(x * 100)}%`, reason: (k) => (k === 'changed-mind' ? 'Changed his mind' : k), lang };
};

describe('PR 164 · Fraud & RTO screen', () => {
  it('the four figures: the likely saved cost with "up to" beside it, wrong with its rate', () => {
    const s = fraudScreen(report(), fmt('en'));
    expect(s.kpis.map((k) => [k.id, k.value])).toEqual([
      ['caught', '3'],
      ['wrong', '1'],
      ['missed', '4'],
      ['saved', '৳67.5'],
    ]);
    expect(s.kpis[1]!.foot).toContain('50%');
    expect(s.kpis[3]!.foot).toContain('৳135');
  });

  it('no estimate without a complete parcel cost; none when nothing was stopped', () => {
    const noCost = fraudScreen(report({ avoided: { perParcelMinor: null, basisParcels: 0, upToMinor: null, likelyMinor: null } }), fmt('en'));
    expect(noCost.kpis[3]).toMatchObject({ value: '—', foot: en.frd.kpi.savedNoCost });
    const none = fraudScreen(report({ stopped: 0, avoided: { perParcelMinor: null, basisParcels: 0, upToMinor: null, likelyMinor: null } }), fmt('en'));
    expect(none.kpis[3]!.foot).toBe(en.frd.kpi.savedNone);
    expect(fraudScreen(report({ wrong: { orders: 0, rate: null } }), fmt('en')).kpis[1]!.foot).toBe(en.frd.kpi.wrongNone);
  });

  it('the caught table ends with "Any step"; the cost book names districts in Bengali, the owner reasons and unknown rows', () => {
    const s = fraudScreen(report(), fmt('bn'));
    expect(s.caught.map((r) => r.id)).toEqual(['watch', 'blocklist', 'refuser', 'review', 'advance', 'any']);
    expect(s.caught.at(-1)).toMatchObject({ total: true, cells: ['3', '1', '1', '1', '0'] });
    const district = s.rto.groups.find((g) => g.id === 'district')!;
    expect(district.rows.map((r) => r.name)).toEqual(['টেস্টপুর', bn.frd.rto.none.district]);
    expect(district.rows[1]!.unknown).toBe(true);
    expect(fraudScreen(report(), fmt('en')).rto.groups.find((g) => g.id === 'reason')!.rows[0]).toMatchObject({ name: 'Changed his mind', incomplete: true });
    expect(s.rto.floor).toBeNull();
  });

  it('a missing cost part is named and the total called a floor; a cut report says so', () => {
    const r = report({ rto: { ...report().rto, real: { parcels: 2, knownMinor: 20_000, incomplete: 2, missing: missing(2) } }, cut: { orders: true, parcels: true } });
    const s = fraudScreen(r, fmt('en'));
    expect(s.rto.floor).toContain('packaging: 2');
    expect(s.notes).toHaveLength(2);
    expect(s.notes[0]).toContain('5000');
  });

  it('every word the screen uses exists in English and Bengali', () => {
    const keys = (o: unknown, p = ''): string[] => (o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k)) : [p]);
    expect(keys(bn).sort()).toEqual(keys(en).sort());
    for (const lang of ['en', 'bn'] as const) {
      const s = fraudScreen(report({ cut: { orders: true, parcels: true }, rto: { ...report().rto, real: { parcels: 1, knownMinor: 1, incomplete: 1, missing: missing(1) } } }), fmt(lang));
      const all = [...s.kpis.flatMap((k) => [k.label, k.foot]), ...s.caught.map((c) => c.label), ...s.caughtCols, ...s.rto.cols, ...s.rto.groups.map((g) => g.title), s.rto.foot, s.rto.floor ?? '', ...s.notes];
      for (const x of all) expect(x, lang).not.toMatch(/^frd\./);
    }
  });
});
