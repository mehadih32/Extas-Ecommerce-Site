// PR 148 — the journey's rules without a database: which event starts which step, the times in the store's zone, the
// quiet hours, the caps, and the words (SIM-F-001: the amount is always the amount still due; SIM-F-031: no empty link).
import { DEFAULT_JOURNEY } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import {
  answerTemplate,
  audienceFits,
  dedupeKey,
  dueAt,
  formatAmount,
  isCapped,
  messageLocale,
  orderLink,
  quietUntil,
  render,
  stepsOf,
  stillFits,
  OUT_FOR_DELIVERY_EVENT,
  SELF_CONFIRM_ANSWERS,
  type RenderInput,
} from './pure';

const DHAKA = 'Asia/Dhaka';
const base: RenderInput = {
  storeName: 'Sample Shop',
  customerName: 'Rahim',
  orderNumber: 'S-1001',
  senderName: '',
  currency: 'BDT',
  dueMinor: 150_000,
  link: 'https://shop.example/account/orders/S-1001',
  amountLine: 'Pay {amount} at the door.',
  exactAmount: null,
};

describe('steps', () => {
  it('each order event starts its steps', () => {
    expect(stepsOf({ type: 'order.placed', toStatus: 'PLACED' })).toEqual(['placed', 'selfConfirm']);
    expect(stepsOf({ type: 'order.status', toStatus: 'CONFIRMED' })).toEqual(['confirmed']);
    expect(stepsOf({ type: 'order.status', toStatus: 'PACKED' })).toEqual(['packed']);
    expect(stepsOf({ type: 'order.status', toStatus: 'HANDED_OVER' })).toEqual(['booked', 'giftReceiver']);
    expect(stepsOf({ type: 'order.status', toStatus: 'DELIVERED' })).toEqual(['delivered', 'day1Care', 'day3Review']);
    expect(stepsOf({ type: OUT_FOR_DELIVERY_EVENT, toStatus: null })).toEqual(['outForDelivery', 'deliveryDay']);
    expect(stepsOf({ type: 'order.note', toStatus: null })).toEqual([]);
  });

  it('a delayed step never contradicts what happened since', () => {
    expect(stillFits('selfConfirm', 'PLACED')).toBe(true);
    expect(stillFits('selfConfirm', 'CONFIRMED')).toBe(false);
    expect(stillFits('day3Review', 'DELIVERED')).toBe(true);
    expect(stillFits('day3Review', 'RETURNED')).toBe(false);
    expect(stillFits('packed', 'CANCELLED')).toBe(false);
    expect(stillFits('cancelled', 'CANCELLED')).toBe(true);
  });

  it('the caps count the journey only; the self-confirm counts when it is the one WhatsApp', () => {
    expect(isCapped('placed', true)).toBe(true);
    expect(isCapped('day1Care', true)).toBe(false);
    expect(isCapped('selfConfirm', true)).toBe(true);
    expect(isCapped('selfConfirm', false)).toBe(false);
    expect(isCapped('selfConfirmAnswer', true)).toBe(false);
  });

  it('the default journey keeps the owner rule: 2 SMS, 1 WhatsApp, the rest off (Day-1/Day-3 on, outside the caps)', () => {
    const on = Object.entries(DEFAULT_JOURNEY).filter(([, s]) => s.on);
    expect(on.map(([k]) => k).sort()).toEqual(['confirmed', 'day1Care', 'day3Review', 'packed', 'placed']);
    expect(DEFAULT_JOURNEY.selfConfirm.on).toBe(false);
    const capped = on.filter(([k]) => isCapped(k, true));
    expect(capped.filter(([, s]) => s.channel === 'SMS')).toHaveLength(2);
    expect(capped.filter(([, s]) => s.channel === 'WHATSAPP')).toHaveLength(1);
  });

  it('keys, audiences, answers and links', () => {
    expect(dedupeKey('o1', 'placed', 'SMS')).toBe('order:o1:placed:SMS');
    expect(audienceFits('cod', 'COD')).toBe(true);
    expect(audienceFits('cod', 'BKASH')).toBe(false);
    expect(audienceFits('prepaid', 'BKASH')).toBe(true);
    expect(answerTemplate(SELF_CONFIRM_ANSWERS[3].code)).toBe('order.selfConfirmCancel');
    expect(answerTemplate('NOPE')).toBeNull();
    expect(orderLink(null, 'S-1')).toBeNull();
    expect(orderLink('shop.example', 'S 1')).toBe('https://shop.example/account/orders/S%201');
    expect(messageLocale('store', 'bn-BD')).toBe('bn');
    expect(messageLocale('store', 'en-GB')).toBe('en');
    expect(messageLocale('en', 'bn-BD')).toBe('en');
  });
});

describe('time in the store zone', () => {
  const placed = new Date('2026-10-24T06:00:00Z'); // 12:00 in Dhaka
  it('now, minutes later, or a time of day some days later', () => {
    expect(dueAt({ kind: 'now' }, placed, DHAKA)).toEqual(placed);
    expect(dueAt({ kind: 'after', minutes: 30 }, placed, DHAKA)).toEqual(new Date('2026-10-24T06:30:00Z'));
    expect(dueAt({ kind: 'at', days: 1, hour: 11, minute: 0 }, placed, DHAKA)).toEqual(new Date('2026-10-25T05:00:00Z'));
    // a time already past today: the next day
    expect(dueAt({ kind: 'at', days: 0, hour: 9, minute: 0 }, placed, DHAKA)).toEqual(new Date('2026-10-25T03:00:00Z'));
  });

  it('quiet hours wrap midnight and end at their hour', () => {
    const q = { on: true, fromHour: 22, toHour: 8 };
    expect(quietUntil(q, placed, DHAKA)).toBeNull();
    expect(quietUntil(q, new Date('2026-10-24T17:00:00Z'), DHAKA)).toEqual(new Date('2026-10-25T02:00:00Z')); // 23:00 → 08:00
    expect(quietUntil(q, new Date('2026-10-24T20:00:00Z'), DHAKA)).toEqual(new Date('2026-10-25T02:00:00Z')); // 02:00 → 08:00
    expect(quietUntil({ ...q, on: false }, new Date('2026-10-24T17:00:00Z'), DHAKA)).toBeNull();
  });
});

describe('the words', () => {
  it('money: the symbol, grouping, Western digits', () => {
    expect(formatAmount(150_000, 'BDT')).toBe('৳1,500');
    expect(formatAmount(150_050, 'BDT')).toBe('৳1,500.50');
  });

  it('fills the tokens and tidies the spaces', () => {
    const r = render('{storeName}: order {orderNumber}. {amountLine} Track: {trackingLink}', null, base);
    expect(r).toEqual({ ok: true, text: 'Sample Shop: order S-1001. Pay ৳1,500 at the door. Track: https://shop.example/account/orders/S-1001', subject: null });
  });

  it('SIM-F-001: a fully paid order gets no amount line, and a template that prints an amount is refused', () => {
    const paid = { ...base, dueMinor: 0 };
    expect(render('Order {orderNumber}. {amountLine} Thanks!', null, paid)).toEqual({ ok: true, text: 'Order S-1001. Thanks!', subject: null });
    expect(render('Pay {total}', null, paid)).toEqual({ ok: false, reason: 'AMOUNT_RULE', field: 'total' });
    expect(render('Pay {amountDue}', null, paid)).toEqual({ ok: false, reason: 'AMOUNT_RULE', field: 'amountDue' });
    // {total} is read as the amount still due, never the order total
    expect(render('Pay {total}', null, { ...base, dueMinor: 50_000 })).toMatchObject({ ok: true, text: 'Pay ৳500' });
  });

  it('SIM-F-031: a link token without the shop address is refused, never sent empty', () => {
    expect(render('Track: {trackingLink}', null, { ...base, link: null })).toEqual({ ok: false, reason: 'NO_LINK', field: 'trackingLink' });
  });

  it('the exact-amount line replaces the amount line; paid says so', () => {
    const exact = { due: 'Pay exactly {amount}. {link}', paid: 'Paid: pay nothing at the door.' };
    expect(render('{amountLine} {exactAmountLine}', null, { ...base, exactAmount: exact })).toMatchObject({ ok: true, text: 'Pay exactly ৳1,500. https://shop.example/account/orders/S-1001' });
    expect(render('{amountLine} {exactAmountLine}', null, { ...base, dueMinor: 0, exactAmount: exact })).toMatchObject({ ok: true, text: 'Paid: pay nothing at the door.' });
    expect(render('{exactAmountLine}', null, { ...base, exactAmount: null })).toMatchObject({ ok: true, text: '' });
  });

  it('an unknown token is refused; the subject is filled too', () => {
    expect(render('Hi {nickname}', null, base)).toEqual({ ok: false, reason: 'UNKNOWN_TOKEN', field: 'nickname' });
    expect(render('Body', 'Your order {orderNumber}', base)).toEqual({ ok: true, text: 'Body', subject: 'Your order S-1001' });
  });
});
