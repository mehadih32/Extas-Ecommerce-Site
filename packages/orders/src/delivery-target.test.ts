// PR 605 (SIM-F-007): the parcel goes to the gift's receiver; the sender's contact never becomes the parcel's phone.
import { describe, expect, it } from 'vitest';
import { deliveryTarget, type DeliveryTargetRow } from './delivery-target';

const row: DeliveryTargetRow = {
  customerName: ' Nadia Karim ',
  phone: '+8801712345678',
  shippingAddressText: ' House 12, Road 5, Dhanmondi, Dhaka ',
  backfilledAddress: null,
  isGift: false,
  giftSenderName: null,
  giftSenderContact: null,
  giftNote: null,
  giftDeliverAfter: null,
  giftHidePrices: false,
};

describe('PR 605 · deliveryTarget', () => {
  it('an ordinary order goes to its own name, phone and address (the full one when the backfill found it)', () => {
    expect(deliveryTarget(row)).toEqual({ name: 'Nadia Karim', phone: '+8801712345678', address: 'House 12, Road 5, Dhanmondi, Dhaka', addressTyped: 'House 12, Road 5, Dhanmondi, Dhaka', gift: null });
    expect(deliveryTarget({ ...row, backfilledAddress: 'House 12, Road 5, Dhanmondi, Dhaka 1205' }).address).toBe('House 12, Road 5, Dhanmondi, Dhaka 1205');
  });

  it('a gift goes to the receiver, with the sender, the note and the day after which it may arrive', () => {
    const t = deliveryTarget({
      ...row,
      isGift: true,
      giftSenderName: 'Rafiq',
      giftSenderContact: '+447700900123',
      giftNote: 'Happy Eid',
      giftDeliverAfter: new Date('2026-11-02T00:00:00Z'),
      giftHidePrices: true,
    });
    expect(t.name).toBe('Nadia Karim');
    expect(t.phone).toBe('+8801712345678');
    expect(t.gift).toEqual({ senderName: 'Rafiq', senderContact: '+447700900123', note: 'Happy Eid', deliverAfter: '2026-11-02', hidePrices: true });
  });
});
