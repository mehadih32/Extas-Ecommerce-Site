// S28 · PR 704 — the pure side of bulk orders: pieces, the unit price (one price, or the tier the pieces reach), the total,
// the advance rounded to a whole minor unit, the even batch split, the state a quote is in and the size-text reader.
import { describe, expect, it } from 'vitest';
import { figures, parseSizes, piecesOf, splitBatches, stateOf, unitMinorFor, type BulkLine } from './bulk-orders-pure';

const lines: BulkLine[] = [
  { name: 'Polo', colour: 'Navy', sizes: { M: 40, L: 60 } },
  { name: 'Tee', colour: '', sizes: { S: 25 } },
];

describe('bulk quote figures', () => {
  it('counts the pieces over every size of every line', () => {
    expect(piecesOf(lines)).toBe(125);
  });
  it('uses the one agreed price, or the tier the pieces reach (the first tier below it)', () => {
    expect(unitMinorFor({ pricing: 'PIECE', pieceMinor: 65000, tiers: [] }, 125)).toBe(65000);
    const tiers = [{ from: 200, minor: 61000 }, { from: 50, minor: 72000 }, { from: 100, minor: 65000 }];
    expect(unitMinorFor({ pricing: 'TIER', pieceMinor: 0, tiers }, 125)).toBe(65000);
    expect(unitMinorFor({ pricing: 'TIER', pieceMinor: 0, tiers }, 20)).toBe(72000);
    expect(unitMinorFor({ pricing: 'TIER', pieceMinor: 0, tiers }, 500)).toBe(61000);
    expect(unitMinorFor({ pricing: 'TIER', pieceMinor: 0, tiers: [] }, 5)).toBe(0);
  });
  it('total = pieces x unit; advance rounds to a whole minor unit; the balance is the rest', () => {
    const f = figures(lines, { pricing: 'PIECE', pieceMinor: 65001, tiers: [] }, 33);
    expect(f).toEqual({ pieces: 125, unitMinor: 65001, totalMinor: 8125125, advanceMinor: Math.round((8125125 * 33) / 100), balanceMinor: 8125125 - Math.round((8125125 * 33) / 100) });
    expect(f.advanceMinor + f.balanceMinor).toBe(f.totalMinor);
    expect(figures(lines, { pricing: 'PIECE', pieceMinor: 100, tiers: [] }, 0).advanceMinor).toBe(0);
    expect(figures(lines, { pricing: 'PIECE', pieceMinor: 100, tiers: [] }, 100).balanceMinor).toBe(0);
  });
});

describe('bulk batches and state', () => {
  it('splits as evenly as whole pieces allow (the first batches take the odd pieces), planned days step apart, never more batches than pieces', () => {
    const b = splitBatches(125, 3, new Date('2026-11-13T00:00:00Z'), 3, 4);
    expect(b.map((x) => x.pieces)).toEqual([42, 42, 41]);
    expect(b.map((x) => x.plannedOn)).toEqual(['2026-11-16', '2026-11-20', '2026-11-24']);
    expect(b.reduce((n, x) => n + x.pieces, 0)).toBe(125);
    expect(splitBatches(2, 5, new Date('2026-11-13T00:00:00Z'), 0, 1)).toHaveLength(2);
  });
  it('says where a quote is', () => {
    expect(stateOf({ advanceReceivedAt: null, balanceReceivedAt: null }, [{ status: 'WAITING' }])).toBe('QUOTE_SENT');
    expect(stateOf({ advanceReceivedAt: 1, balanceReceivedAt: null }, [{ status: 'DELIVERED' }, { status: 'SHIPPED' }])).toBe('IN_DELIVERY');
    expect(stateOf({ advanceReceivedAt: 1, balanceReceivedAt: null }, [{ status: 'DELIVERED' }])).toBe('BALANCE_DUE');
    expect(stateOf({ advanceReceivedAt: 1, balanceReceivedAt: 2 }, [{ status: 'DELIVERED' }])).toBe('DONE');
  });
  it('reads sizes typed by hand and refuses nonsense', () => {
    expect(parseSizes('S 10, M 20')).toEqual({ S: 10, M: 20 });
    expect(parseSizes('S:10 ; S=5')).toEqual({ S: 15 });
    expect(parseSizes('S ten')).toBeNull();
  });
});
