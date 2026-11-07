// S08 · PR 180 follow-up 437 — the courier's pick-up against the handed-over sheets (pure): nothing before the owner's
// hours; a parcel on the sheet still waiting for pick-up named; a parcel picked up near the hand-over that was on no
// sheet named once, on the nearest batch; a parcel on an older sheet never "off sheet". Made-up values.
import { describe, expect, it } from 'vitest';
import { checkBatches, type CheckParcel } from './handover-check';

const at = (h: number) => new Date(Date.UTC(2026, 10, 7, 0) + h * 3_600_000);
const p = (id: string, status: string, pickedAt: Date | null): CheckParcel => ({ shipmentId: id, orderId: `o-${id}`, orderNumber: `EX-${id}`, status, pickedAt });
const cfg = { afterHours: 12, windowHours: 24 };

describe('follow-up 437 · handover check', () => {
  it('too early: nothing is named until the hours pass', () => {
    const r = checkBatches([{ batchId: 'b1', handedOverAt: at(0), went: ['1'] }], [p('1', 'PENDING_PICKUP', null)], new Set(['1']), cfg, at(11));
    expect(r.get('b1')).toBeNull();
  });

  it('names a parcel on the sheet the courier never picked up, and one it picked up that was on no sheet', () => {
    const parcels = [p('1', 'IN_TRANSIT', at(1)), p('2', 'PENDING_PICKUP', null), p('3', 'IN_REVIEW', null), p('9', 'IN_TRANSIT', at(2)), p('8', 'DELIVERED', at(-30))];
    const r = checkBatches([{ batchId: 'b1', handedOverAt: at(0), went: ['1', '2', '3'] }], parcels, new Set(['1', '2', '3']), cfg, at(13));
    expect(r.get('b1')).toEqual({
      notPicked: [
        { shipmentId: '2', orderId: 'o-2', orderNumber: 'EX-2' },
        { shipmentId: '3', orderId: 'o-3', orderNumber: 'EX-3' },
      ],
      // 8 was picked up 30 hours before: outside the window
      offSheet: [{ shipmentId: '9', orderId: 'o-9', orderNumber: 'EX-9' }],
    });
  });

  it('an off-sheet pick-up goes to the nearest batch only; a parcel on an older sheet is never off sheet', () => {
    const batches = [
      { batchId: 'a', handedOverAt: at(0), went: ['1'] },
      { batchId: 'b', handedOverAt: at(10), went: ['2'] },
    ];
    const parcels = [p('1', 'IN_TRANSIT', at(1)), p('2', 'IN_TRANSIT', at(11)), p('7', 'IN_TRANSIT', at(8)), p('6', 'IN_TRANSIT', at(3))];
    const r = checkBatches(batches, parcels, new Set(['1', '2', '6']), cfg, at(30));
    expect(r.get('a')?.offSheet).toEqual([]);
    expect(r.get('b')?.offSheet.map((l) => l.shipmentId)).toEqual(['7']);
    expect(r.get('a')?.notPicked).toEqual([]);
  });

  it('a batch not yet due takes no off-sheet parcel from a due one', () => {
    const batches = [
      { batchId: 'old', handedOverAt: at(0), went: [] },
      { batchId: 'new', handedOverAt: at(20), went: [] },
    ];
    const r = checkBatches(batches, [p('5', 'IN_TRANSIT', at(19))], new Set(), cfg, at(25));
    expect(r.get('new')).toBeNull();
    expect(r.get('old')?.offSheet.map((l) => l.shipmentId)).toEqual(['5']);
  });
});
