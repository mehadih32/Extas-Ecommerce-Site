import { describe, expect, it } from 'vitest';
import { groupPicking, pickingPlace, type PickingFacts, type PickLine } from './picking-pure';

const parcel = (status: string, over: Partial<PickingFacts['parcels'][number]> = {}): PickingFacts['parcels'][number] => ({
  status,
  consignmentId: 'C1',
  codAmountMinor: 100_000,
  receiver: { name: 'Rahim', phone: '01711111111', address: 'House 4, Dhanmondi' },
  order: { totalMinor: 100_000, walletAppliedMinor: 0, paidMinor: 0 },
  target: { name: 'Rahim', phone: '01711111111', address: 'House 4, Dhanmondi' },
  ...over,
});
const facts = (over: Partial<PickingFacts> = {}): PickingFacts => ({ status: 'CONFIRMED', holdFromStatus: null, handedOver: false, cancelAsked: false, inReview: false, parcels: [], ...over });

describe('PR 181 · which orders the picking list takes (B1.6)', () => {
  it('approved and not booked, or booked and still with us (Steadfast "In Review"), however old', () => {
    for (const status of ['CONFIRMED', 'PROCESSING', 'PACKED']) expect(pickingPlace(facts({ status }))).toBe('take');
    expect(pickingPlace(facts({ parcels: [parcel('IN_REVIEW')] }))).toBe('take');
    expect(pickingPlace(facts({ parcels: [parcel('PENDING_PICKUP')] }))).toBe('take');
    expect(pickingPlace(facts({ parcels: [parcel('BOOKING', { consignmentId: null })] }))).toBe('take');
    // a booking that failed or was cancelled is "not booked yet"
    expect(pickingPlace(facts({ parcels: [parcel('BOOKING_FAILED', { consignmentId: null })] }))).toBe('take');
  });

  it('never an order the courier has, one handed over, or one not approved', () => {
    for (const status of ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'RETURNED']) expect(pickingPlace(facts({ parcels: [parcel(status)] }))).toBe('skip');
    expect(pickingPlace(facts({ handedOver: true }))).toBe('skip');
    for (const status of ['PLACED', 'AWAITING_ADVANCE', 'HANDED_OVER', 'CANCELLED', 'DELIVERED']) expect(pickingPlace(facts({ status }))).toBe('skip');
    expect(pickingPlace(facts({ status: 'ON_HOLD', holdFromStatus: 'PLACED' }))).toBe('skip');
  });

  it('B1.7: held and problem orders are listed apart', () => {
    expect(pickingPlace(facts({ status: 'ON_HOLD', holdFromStatus: 'CONFIRMED' }))).toBe('ON_HOLD');
    expect(pickingPlace(facts({ cancelAsked: true }))).toBe('CANCEL_ASKED');
    expect(pickingPlace(facts({ parcels: [parcel('CANCEL_REQUESTED')] }))).toBe('CANCEL_ASKED');
    expect(pickingPlace(facts({ inReview: true }))).toBe('IN_REVIEW');
    expect(pickingPlace(facts({ parcels: [parcel('IN_REVIEW', { order: { totalMinor: 100_000, walletAppliedMinor: 0, paidMinor: 20_000 } })] }))).toBe('COD_CHANGED');
    expect(pickingPlace(facts({ parcels: [parcel('IN_REVIEW', { target: { name: 'Rahim', phone: '01711111111', address: 'Rangpur' } })] }))).toBe('RECEIVER_CHANGED');
  });
});

const line = (category: string, style: string, colour: string, size: string, quantity: number, variantId = `${style}-${colour}-${size}`): PickLine => ({ category, styleKey: style, style, colour, size, variantId, quantity });

describe('PR 181 · grouping (B1.6): category → style → colour → size, most pieces first', () => {
  const lines = [
    line('Shirt', 'Oxford', 'White', 'M', 1),
    line('Polo', 'Tommy polo', 'Navy', 'L', 2),
    line('Polo', 'Ralph Lauren polo', 'Black', 'M', 2),
    line('Polo', 'Ralph Lauren polo', 'Black', 'L', 2),
    line('Polo', 'Ralph Lauren polo', 'Black', 'XL', 1),
    line('Polo', 'Ralph Lauren polo', 'Navy', 'M', 4),
    line('Polo', 'Ralph Lauren polo', 'Navy', 'L', 2),
    line('Polo', 'Ralph Lauren polo', 'Black', 'M', 1),
  ];

  it('orders every level by its pieces, and adds up the same size of the same variant', () => {
    const g = groupPicking(lines, null);
    expect(g.map((c) => [c.category, c.pieces])).toEqual([
      ['Polo', 14],
      ['Shirt', 1],
    ]);
    const rl = g[0]!.styles[0]!;
    expect([rl.style, rl.pieces]).toEqual(['Ralph Lauren polo', 12]);
    expect(rl.colours.map((c) => [c.colour, c.pieces])).toEqual([
      ['Black', 6],
      ['Navy', 6],
    ]);
    expect(rl.colours[0]!.sizes.map((s) => [s.size, s.quantity])).toEqual([
      ['M', 3],
      ['L', 2],
      ['XL', 1],
    ]);
    expect(g[0]!.styles[1]!.style).toBe('Tommy polo');
  });

  it('marks a size short when the shop has fewer pieces than the list needs', () => {
    const onHand = new Map([
      ['Ralph Lauren polo-Navy-M', 1],
      ['Ralph Lauren polo-Black-M', 5],
    ]);
    const g = groupPicking(lines, onHand);
    const navy = g[0]!.styles[0]!.colours.find((c) => c.colour === 'Navy')!;
    expect(navy.sizes.find((s) => s.size === 'M')).toMatchObject({ quantity: 4, short: 3 });
    // no stock row at all: not counted, never marked short
    expect(navy.sizes.find((s) => s.size === 'L')).toMatchObject({ quantity: 2, short: 0 });
    expect(g[0]!.styles[0]!.colours.find((c) => c.colour === 'Black')!.sizes.find((s) => s.size === 'M')).toMatchObject({ short: 0 });
    // without the stock nothing is marked
    expect(groupPicking(lines, null).flatMap((c) => c.styles.flatMap((s) => s.colours.flatMap((x) => x.sizes))).every((s) => s.short === 0)).toBe(true);
  });
});
