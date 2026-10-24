import { describe, expect, it } from 'vitest';
import { bookedReceiver, handoverProblem, printOrder, stickerProblem, type StickerFacts } from './fulfil-pure';

const facts = (over: Partial<StickerFacts> = {}): StickerFacts => ({
  status: 'IN_REVIEW',
  consignmentId: 'C1',
  codAmountMinor: 158_000,
  receiver: { name: 'Rahim', phone: '01711111111', address: 'House 4, Dhanmondi' },
  order: { totalMinor: 158_000, walletAppliedMinor: 0, paidMinor: 0 },
  target: { name: 'Rahim', phone: '+8801711111111', address: 'House 4,  Dhanmondi' },
  ...over,
});

describe('PR 179 · when a sticker may be printed', () => {
  it('prints a booked parcel still with us whose COD is the live amount due and whose receiver is the courier\'s', () => {
    expect(stickerProblem(facts())).toBeNull();
    expect(stickerProblem(facts({ status: 'PENDING_PICKUP' }))).toBeNull();
  });

  it('never prints before booking or after pick-up', () => {
    expect(stickerProblem(facts({ consignmentId: null }))).toBe('NOT_BOOKED');
    for (const status of ['BOOKING', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'BOOKING_FAILED']) expect(stickerProblem(facts({ status }))).toBe('NOT_WITH_US');
  });

  it('SIM-F-004: a COD that is not the live amount due is refused (a payment or a change after booking needs a re-booking)', () => {
    expect(stickerProblem(facts({ order: { totalMinor: 158_000, walletAppliedMinor: 0, paidMinor: 50_000 } }))).toBe('COD_CHANGED');
    expect(stickerProblem(facts({ order: { totalMinor: 193_000, walletAppliedMinor: 0, paidMinor: 0 } }))).toBe('COD_CHANGED');
    expect(stickerProblem(facts({ codAmountMinor: 0, order: { totalMinor: 158_000, walletAppliedMinor: 0, paidMinor: 158_000 } }))).toBeNull();
  });

  it('SIM-F-004: a receiver changed after booking is refused', () => {
    expect(stickerProblem(facts({ target: { name: 'Rahim', phone: '01799999999', address: 'House 4, Dhanmondi' } }))).toBe('RECEIVER_CHANGED');
    expect(stickerProblem(facts({ target: { name: 'Rahim', phone: '01711111111', address: 'Village Pirganj, Rangpur' } }))).toBe('RECEIVER_CHANGED');
  });

  it('reads the booked receiver safely', () => {
    expect(bookedReceiver(null)).toEqual({ name: null, phone: null, address: null, gift: null });
    expect(bookedReceiver({ name: 'A', phone: '0', address: ' ', gift: { senderName: 'B', deliverAfter: '2026-10-30', note: null } })).toEqual({ name: 'A', phone: '0', address: null, gift: { senderName: 'B', deliverAfter: '2026-10-30', note: null } });
  });
});

describe('PR 179 · packing order (B1.4)', () => {
  it('puts the category with the most pieces first, then its style with the most pieces; a mixed order goes with its biggest category', () => {
    const parcels = [
      { key: 'a', orderNumber: '1001', pieces: [{ category: 'Shirts', style: 'oxford', quantity: 1 }] },
      { key: 'b', orderNumber: '1002', pieces: [{ category: 'Panjabi', style: 'sky', quantity: 2 }] },
      { key: 'c', orderNumber: '1003', pieces: [{ category: 'Panjabi', style: 'eid', quantity: 1 }, { category: 'Shirts', style: 'oxford', quantity: 1 }] },
      { key: 'd', orderNumber: '1004', pieces: [{ category: 'Panjabi', style: 'sky', quantity: 1 }] },
      { key: 'e', orderNumber: '1000', pieces: [{ category: 'Panjabi', style: 'eid', quantity: 1 }] },
    ];
    // Panjabi 5 pieces, Shirts 2; within Panjabi: sky 3, eid 2; the mixed order c goes with Panjabi (its biggest)
    expect(printOrder(parcels)).toEqual(['b', 'd', 'e', 'c', 'a']);
  });

  it('keeps order numbers in number order on a tie', () => {
    const p = (key: string, orderNumber: string) => ({ key, orderNumber, pieces: [{ category: 'X', style: 's', quantity: 1 }] });
    expect(printOrder([p('x', '1010'), p('y', '999'), p('z', '1002')])).toEqual(['y', 'z', 'x']);
  });
});

describe('PR 180 · when a parcel goes on the handover sheet', () => {
  const ho = (over: Partial<StickerFacts> & { printCount?: number; orderStatus?: string } = {}) => handoverProblem({ ...facts(over), printCount: over.printCount ?? 1, orderStatus: over.orderStatus ?? 'CONFIRMED' });
  it('a printed sticker of a parcel still with us whose order waits (confirmed, picking or packed)', () => {
    for (const orderStatus of ['CONFIRMED', 'PROCESSING', 'PACKED']) expect(ho({ orderStatus })).toBeNull();
  });
  it('not before its sticker is printed, not when the sticker cannot be printed, not twice', () => {
    expect(ho({ printCount: 0 })).toBe('NOT_PRINTED');
    expect(ho({ consignmentId: null })).toBe('NOT_BOOKED');
    expect(ho({ order: { totalMinor: 158_000, walletAppliedMinor: 0, paidMinor: 10_000 } })).toBe('COD_CHANGED');
    expect(ho({ handedOver: true })).toBe('NOT_WITH_US');
    for (const orderStatus of ['ON_HOLD', 'HANDED_OVER', 'CANCELLED']) expect(ho({ orderStatus })).toBe('NOT_READY');
  });
});
