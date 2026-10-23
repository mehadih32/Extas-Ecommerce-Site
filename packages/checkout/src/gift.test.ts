// PR 605 — gift mode's pure rules: the sender's contact (any country's phone or an e-mail), the gift card's checks,
// the "deliver on or after" window in the store's time zone, and how much is paid ahead.
import { describe, expect, it } from 'vitest';
import { addDays, checkGift, giftAdvanceOf, giftDateWindow, senderContactOf, storeToday } from './gift';

const limits = { nameMin: 2, noteMax: 20, maxDays: 30 };
const ok = { senderName: 'Rafiq', senderContact: '+44 7700 900123' };

describe('PR 605 · gift mode', () => {
  it('the sender may give a phone of any country or an e-mail (only for updates)', () => {
    expect(senderContactOf('+44 7700 900123')).toBe('+447700900123');
    expect(senderContactOf('01712-345678')).toBe('01712345678');
    expect(senderContactOf(' Rafiq@Example.COM ')).toBe('rafiq@example.com');
    expect(senderContactOf('12345')).toBeNull();
    expect(senderContactOf('call me')).toBeNull();
    expect(senderContactOf('+1 234 567 890 123 456')).toBeNull();
  });

  it('checks the gift card in the page`s order, the first problem first', () => {
    const today = '2026-10-23';
    expect(checkGift({ ...ok, senderName: ' ' }, limits, today, true)).toEqual({ ok: false, field: 'senderName', problem: 'empty' });
    expect(checkGift({ ...ok, senderName: 'R' }, limits, today, true)).toEqual({ ok: false, field: 'senderName', problem: 'short' });
    expect(checkGift({ ...ok, senderContact: '' }, limits, today, true)).toEqual({ ok: false, field: 'senderContact', problem: 'empty' });
    expect(checkGift({ ...ok, senderContact: 'abc' }, limits, today, true)).toEqual({ ok: false, field: 'senderContact', problem: 'contact' });
    expect(checkGift({ ...ok, note: 'x'.repeat(21) }, limits, today, true)).toEqual({ ok: false, field: 'note', problem: 'long' });
    expect(checkGift({ ...ok, deliverAfter: '2026-10-23' }, limits, today, true)).toEqual({ ok: false, field: 'deliverAfter', problem: 'date' });
    expect(checkGift({ ...ok, deliverAfter: '2026-11-23' }, limits, today, true)).toEqual({ ok: false, field: 'deliverAfter', problem: 'date' });
    expect(checkGift({ ...ok, deliverAfter: '2026-13-01' }, limits, today, true)).toEqual({ ok: false, field: 'deliverAfter', problem: 'date' });
    expect(checkGift({ ...ok, note: ' Happy Eid ', deliverAfter: '2026-11-22' }, limits, today, true)).toEqual({
      ok: true,
      gift: { senderName: 'Rafiq', senderContact: '+447700900123', note: 'Happy Eid', deliverAfter: '2026-11-22', hidePrices: true },
    });
    // the owner switched the note and the date off: whatever was sent is dropped, never refused
    expect(checkGift({ ...ok, note: 'x'.repeat(50), deliverAfter: 'soon', hidePrices: false }, { ...limits, noteMax: 0, maxDays: 0 }, today, true)).toEqual({
      ok: true,
      gift: { senderName: 'Rafiq', senderContact: '+447700900123', note: null, deliverAfter: null, hidePrices: false },
    });
  });

  it('dates are the store`s: today in Dhaka, from tomorrow up to the owner`s days ahead', () => {
    expect(storeToday(new Date('2026-10-23T19:30:00Z'), 'Asia/Dhaka')).toBe('2026-10-24');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(giftDateWindow('2026-10-23', 30)).toEqual({ min: '2026-10-24', max: '2026-11-22' });
    expect(giftDateWindow('2026-10-23', 0)).toBeNull();
  });

  it('the advance: the whole amount, a part, or none — as the owner set it', () => {
    const a = { required: true, type: 'full' as const, amountMinor: null, percent: null };
    expect(giftAdvanceOf(a, 250000)).toEqual({ kind: 'full' });
    expect(giftAdvanceOf({ ...a, required: false }, 250000)).toEqual({ kind: 'none' });
    expect(giftAdvanceOf({ ...a, type: 'fixed', amountMinor: 50000 }, 250000)).toEqual({ kind: 'part', amountMinor: 50000 });
    expect(giftAdvanceOf({ ...a, type: 'percent', percent: 30 }, 250001)).toEqual({ kind: 'part', amountMinor: 75001 });
    // a part as big as the order, or a part without its number, is the whole amount ahead
    expect(giftAdvanceOf({ ...a, type: 'fixed', amountMinor: 300000 }, 250000)).toEqual({ kind: 'full' });
    expect(giftAdvanceOf({ ...a, type: 'percent', percent: null }, 250000)).toEqual({ kind: 'full' });
  });
});
