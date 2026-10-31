// PR 192 — the courier performance report and the RTO cost book's groups, without a database: one denominator (parcels
// with a final outcome), on time against the band's promise (no promise → left out, never "on time"), refused only when
// it was not the shop's fault, empty → null; the book's groups add up to its total, a parcel's cost shared over its
// products by pieces.
import { describe, expect, it } from 'vitest';
import { campaignOf, groupPerf, onTimeOf, perfLine, rtoGroups, splitMinor, type PerfParcel } from './performance-pure';

const H = 3_600_000;
const placed = new Date('2026-10-20T10:00:00Z');
const p = (o: Partial<PerfParcel> = {}): PerfParcel => ({
  courierAccountId: 'c1',
  courier: 'Steadfast',
  zoneKey: 'dhaka',
  zoneName: 'Dhaka City',
  district: 'Dhaka',
  status: 'DELIVERED',
  placedAt: placed,
  deliveredAt: new Date(placed.getTime() + 20 * H),
  hoursMax: 48,
  addressUnclear: false,
  refused: false,
  exceptions: [],
  ...o,
});

describe('PR 192 · courier performance (pure)', () => {
  it('on time: within the band hours plus grace; no promise or an unclear address is neither on time nor late', () => {
    expect(onTimeOf(p(), 0)).toBe(true);
    expect(onTimeOf(p({ deliveredAt: new Date(placed.getTime() + 49 * H) }), 0)).toBe(false);
    expect(onTimeOf(p({ deliveredAt: new Date(placed.getTime() + 49 * H) }), 2)).toBe(true);
    expect(onTimeOf(p({ hoursMax: null }), 0)).toBeNull();
    expect(onTimeOf(p({ addressUnclear: true }), 0)).toBeNull();
    expect(onTimeOf(p({ status: 'RETURNED', deliveredAt: null }), 0)).toBeNull();
  });

  it('one line: success, on time, return and refusal rates on parcels with a final outcome; exceptions counted once per parcel', () => {
    const rows = [
      p(),
      p({ deliveredAt: new Date(placed.getTime() + 60 * H), exceptions: ['ATTEMPT_FAILED', 'ATTEMPT_FAILED'] }),
      p({ status: 'PARTIALLY_DELIVERED', hoursMax: null }),
      p({ status: 'RETURNED', deliveredAt: null, refused: true }),
      p({ status: 'RETURNED', deliveredAt: null, refused: false, exceptions: ['ADDRESS_PROBLEM'] }),
    ];
    const l = perfLine('all', '', rows, 0);
    expect(l).toMatchObject({ parcels: 5, delivered: 3, promised: 2, onTime: 1, late: 1, returned: 2, refused: 1 });
    expect(l.exceptions).toEqual({ ATTEMPT_FAILED: 1, ADDRESS_PROBLEM: 1, LOST: 0, DAMAGED: 0 });
    expect(l.successRate).toBeCloseTo(0.6);
    expect(l.onTimeRate).toBeCloseTo(0.5);
    expect(l.returnRate).toBeCloseTo(0.4);
    expect(l.refusalRate).toBeCloseTo(0.2);
    expect(perfLine('none', '', [], 0)).toMatchObject({ parcels: 0, successRate: null, onTimeRate: null, refusalRate: null });
  });

  it('groups: most parcels first; a parcel with no key under the fallback', () => {
    const g = groupPerf([p(), p({ courierAccountId: 'c2', courier: 'Pathao' }), p({ courierAccountId: 'c2', courier: 'Pathao' })], (x) => ({ key: x.courierAccountId, label: x.courier }), 0);
    expect(g.map((x) => [x.label, x.parcels])).toEqual([
      ['Pathao', 2],
      ['Steadfast', 1],
    ]);
    const d = groupPerf([p({ district: null })], (x) => (x.district ? { key: x.district, label: x.district } : null), 0, { key: '-', label: '—' });
    expect(d[0]).toMatchObject({ key: '-', label: '—', parcels: 1 });
  });
});

describe('PR 192 · the RTO cost book groups (CN-014 d)', () => {
  it('splitMinor: whole minor units that add up exactly', () => {
    expect(splitMinor(1_000, [1, 2])).toEqual([334, 666]);
    expect(splitMinor(1_001, [1, 1, 1])).toEqual([334, 334, 333]);
    expect(splitMinor(500, [0, 0])).toEqual([500, 0]);
    expect(splitMinor(500, [])).toEqual([]);
  });

  it('every dimension adds up to the book; a product line shares its parcel by pieces; incomplete parcels named', () => {
    const rows = [
      { district: 'Bogura', campaign: 'eid-push', courier: 'Steadfast', reason: 'sizeWrong', pieces: [{ product: 'Polo', quantity: 2 }, { product: 'Chino', quantity: 1 }], cost: { knownMinor: 30_000, complete: true } },
      { district: 'Bogura', campaign: 'source:WEBSITE', courier: 'Pathao', reason: null, pieces: [{ product: 'Polo', quantity: 1 }], cost: { knownMinor: 12_000, complete: false } },
      { district: null, campaign: 'eid-push', courier: 'Steadfast', reason: 'changedMind', pieces: [], cost: { knownMinor: 5_000, complete: true } },
    ];
    for (const dim of ['district', 'campaign', 'product', 'courier', 'reason'] as const) expect(rtoGroups(rows, dim).reduce((s, g) => s + g.knownMinor, 0)).toBe(47_000);
    expect(rtoGroups(rows, 'district')).toEqual([
      { key: 'Bogura', parcels: 2, knownMinor: 42_000, incomplete: 1 },
      { key: '-', parcels: 1, knownMinor: 5_000, incomplete: 0 },
    ]);
    expect(rtoGroups(rows, 'product')).toEqual([
      { key: 'Polo', parcels: 2, knownMinor: 32_000, incomplete: 1 },
      { key: 'Chino', parcels: 1, knownMinor: 10_000, incomplete: 0 },
      { key: '-', parcels: 1, knownMinor: 5_000, incomplete: 0 },
    ]);
  });

  it('the campaign: the utm campaign, else the channel', () => {
    expect(campaignOf({ utmCampaign: ' eid-push ', source: 'WEBSITE' })).toBe('eid-push');
    expect(campaignOf({ utmCampaign: null, source: 'MESSENGER' })).toBe('source:MESSENGER');
  });
});
