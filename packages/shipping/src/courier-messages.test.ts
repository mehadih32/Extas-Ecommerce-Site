// S28 · PR 674 — the editable courier texts: filled from the order, parcel or claim, in the chosen language; nothing while
// the owner's switch is off; the COD text only for a parcel with cash to collect.
import { describe, expect, it } from 'vitest';
import { couriersV5Settings } from '@extas/settings';
import { bookingMessageLines, courierMessage } from './courier-messages';
import { bookingNoteOf } from './pure';

const on = { ...couriersV5Settings['delivery.courier.messages'].default, enabled: true };
const off = couriersV5Settings['delivery.courier.messages'].default;

describe('courier messages (PR 674)', () => {
  it('fills the placeholders in the chosen language and leaves no gap for a missing value', () => {
    expect(courierMessage(on, 'cancel', 'en', { consignment: 'C-9', order: 'EX-1' })).toBe('Please cancel parcel C-9 (order EX-1).');
    expect(courierMessage(on, 'cancel', 'bn', { consignment: 'C-9', order: 'EX-1' })).toBe('পার্সেল C-9 (অর্ডার EX-1) বাতিল করবেন।');
    expect(courierMessage(on, 'hold', 'en', {})).toBe('Please hold parcel until we call.');
  });
  it('gives nothing while the switch is off', () => {
    expect(courierMessage(off, 'booking', 'en', { order: 'EX-1' })).toBeNull();
    expect(bookingMessageLines(off, 'en', { order: 'EX-1', cod: '1200.00' })).toEqual([]);
  });
  it('a booking carries the booking and delivery texts, and the COD text only with cash to collect', () => {
    expect(bookingMessageLines(on, 'en', { order: 'EX-1', customer: 'Rafiq', cod: '1200.00' })).toEqual([
      'Order EX-1. Please handle with care.',
      'Please call Rafiq before delivery.',
      'Collect 1200.00 from the customer.',
    ]);
    expect(bookingMessageLines(on, 'en', { order: 'EX-1', customer: 'Rafiq', cod: null })).toHaveLength(2);
  });
  it("the note leads with the person's one-off note, then the owner's texts, then the customer's own words", () => {
    const note = bookingNoteOf({ customerNote: 'Ring twice', gift: null, giftLine: '', oneOff: 'Fragile', messageLines: ['Handle with care.'] });
    expect(note).toBe('Fragile | Handle with care. | Ring twice');
    expect(bookingNoteOf({ customerNote: null, gift: null, giftLine: '' })).toBeNull();
  });
});
