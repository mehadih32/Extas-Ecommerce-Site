// PR 148 — the journey's rules without a database: which event starts which step, the times in the store's zone, the
// quiet hours, the caps, and the words (SIM-F-001: the amount is always the amount still due; SIM-F-031: no empty link).
import { DEFAULT_JOURNEY, journeySchema } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import {
  advanceChannelsOf,
  advanceDedupeKey,
  answerTemplate,
  isAdvanceRequest,
  payLink,
  ADVANCE_REQUEST,
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
  CANCEL_REFUSED_EVENT,
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
    // follow-up 287: a refused cancel request changes no status; its own timeline row starts the notice
    expect(stepsOf({ type: CANCEL_REFUSED_EVENT, toStatus: null })).toEqual(['cancelRefused']);
  });

  it('a delayed step never contradicts what happened since', () => {
    expect(stillFits('selfConfirm', 'PLACED')).toBe(true);
    expect(stillFits('selfConfirm', 'CONFIRMED')).toBe(false);
    expect(stillFits('day3Review', 'DELIVERED')).toBe(true);
    expect(stillFits('day3Review', 'RETURNED')).toBe(false);
    expect(stillFits('packed', 'CANCELLED')).toBe(false);
    expect(stillFits('cancelled', 'CANCELLED')).toBe(true);
    expect(stillFits('cancelRefused', 'CONFIRMED')).toBe(true);
    expect(stillFits('cancelRefused', 'CANCELLED')).toBe(false);
    expect(stillFits('cancelRefused', 'DELIVERED')).toBe(false);
  });

  it('the caps count the journey only; the self-confirm counts when it is the one WhatsApp', () => {
    expect(isCapped('placed', true)).toBe(true);
    expect(isCapped('day1Care', true)).toBe(false);
    expect(isCapped('selfConfirm', true)).toBe(true);
    expect(isCapped('selfConfirm', false)).toBe(false);
    expect(isCapped('selfConfirmAnswer', true)).toBe(false);
    expect(isCapped('cancelRefused', true)).toBe(false);
  });

  it('follow-up 287: a journey saved before the "cancel request refused" step reads it as off', () => {
    const { cancelRefused: _gone, ...before } = DEFAULT_JOURNEY;
    const r = journeySchema.safeParse(before);
    expect(r.success).toBe(true);
    expect(r.data?.cancelRefused).toMatchObject({ on: false, channel: 'SMS', template: 'order.cancelRefused' });
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

describe('PR 546 · the cancellation words (SIM-F-013)', () => {
  const plain = '{storeName}: order {orderNumber} is cancelled. {cancelReason} Questions? {orderLink}';
  it('the reason in plain words; a reason without words leaves no gap', () => {
    expect(render(plain, null, { ...base, cancelReason: 'The item ran out of stock. Sorry!' })).toMatchObject({
      ok: true,
      text: 'Sample Shop: order S-1001 is cancelled. The item ran out of stock. Sorry! Questions? https://shop.example/account/orders/S-1001',
    });
    expect(render(plain, null, { ...base, cancelReason: '' })).toMatchObject({ ok: true, text: 'Sample Shop: order S-1001 is cancelled. Questions? https://shop.example/account/orders/S-1001' });
    expect(render(plain, null, base)).toMatchObject({ ok: true });
  });

  it('the order that goes ahead: its number and link, never an empty promise', () => {
    const dup = 'Order {orderNumber} is cancelled. Your order {keptOrderNumber} goes ahead: {keptOrderLink}';
    const kept = { number: 'S-0999', link: 'https://shop.example/account/orders/S-0999' };
    expect(render(dup, null, { ...base, kept })).toMatchObject({ ok: true, text: 'Order S-1001 is cancelled. Your order S-0999 goes ahead: https://shop.example/account/orders/S-0999' });
    expect(render(dup, null, { ...base, kept: null })).toEqual({ ok: false, reason: 'NO_KEPT_ORDER', field: 'keptOrderNumber' });
    expect(render('Follow it: {keptOrderLink}', null, { ...base, kept: { number: 'S-0999', link: null } })).toEqual({ ok: false, reason: 'NO_LINK', field: 'keptOrderLink' });
  });
});

describe('PR 542 · the advance request words', () => {
  it('a press of Send (or its "Send again") is a request; its message channels never include the call', () => {
    const ev = (type: string, data: unknown) => ({ type, data });
    expect(isAdvanceRequest(ev('order.awaitAdvance', { request: true, channels: ['SMS'] }))).toBe(true);
    expect(isAdvanceRequest(ev('order.awaitAdvance', { requiredMinor: 100 }))).toBe(false);
    expect(advanceChannelsOf(ev('order.advanceResend', { channels: ['CALL', 'WHATSAPP', 'SMS'] }))).toEqual(['SMS', 'WHATSAPP']);
    expect(advanceChannelsOf(ev('order.awaitAdvance', { request: true, channels: ['CALL'] }))).toEqual([]);
    expect(advanceDedupeKey('o1', 'e1', 'SMS')).toBe(`order:o1:${ADVANCE_REQUEST}:e1:SMS`);
    expect(stillFits(ADVANCE_REQUEST, 'AWAITING_ADVANCE')).toBe(true);
    expect(stillFits(ADVANCE_REQUEST, 'PLACED')).toBe(false);
    expect(isCapped(ADVANCE_REQUEST, true)).toBe(false);
  });

  it('the advance still to pay and its pay link — never shown empty or once paid', () => {
    const t = 'Pay {advanceAmount} first: {payLink}';
    expect(payLink('shop.example', 'tok_123', 'bn')).toBe('https://shop.example/bn/pay/tok_123');
    expect(payLink('shop.example', 'tok_123', 'en')).toBe('https://shop.example/pay/tok_123');
    expect(payLink(null, 'tok_123', 'en')).toBeNull();
    expect(render(t, null, { ...base, advance: { amountMinor: 12_000, link: 'https://shop.example/pay/tok_123' } })).toMatchObject({ ok: true, text: 'Pay ৳120 first: https://shop.example/pay/tok_123' });
    expect(render(t, null, { ...base, advance: { amountMinor: 0, link: 'https://shop.example/pay/tok_123' } })).toEqual({ ok: false, reason: 'AMOUNT_RULE', field: 'advanceAmount' });
    expect(render(t, null, { ...base, advance: { amountMinor: 12_000, link: null } })).toEqual({ ok: false, reason: 'NO_LINK', field: 'payLink' });
    expect(render(t, null, base)).toEqual({ ok: false, reason: 'AMOUNT_RULE', field: 'advanceAmount' });
  });
});
