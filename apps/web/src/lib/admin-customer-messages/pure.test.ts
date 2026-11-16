// PR 1011 — Settings › Customer messages: the two switches over the journey's one channel and fallback.
import { describe, expect, it } from 'vitest';
import { MESSAGE_STEPS, pickRow, pieces, smsPerMonth, switchesOf, withSwitches, type StepLike } from './pure';

const step = (over: Partial<StepLike> = {}): StepLike => ({ on: true, channel: 'SMS', fallback: 'NONE', template: 'order.confirmed', ...over });

describe('the five rows', () => {
  it('are the prototype\'s, in its order, each a different journey step', () => {
    expect(MESSAGE_STEPS.map((s) => s.id)).toEqual(['confirmed', 'advance', 'shipped', 'delivered', 'cancelled']);
    expect(new Set(MESSAGE_STEPS.map((s) => s.step)).size).toBe(5);
  });
});

describe('switchesOf', () => {
  it('reads the channel and the fallback; off shows both off', () => {
    expect(switchesOf(step())).toEqual({ sms: true, wa: false });
    expect(switchesOf(step({ channel: 'WHATSAPP' }))).toEqual({ sms: false, wa: true });
    expect(switchesOf(step({ channel: 'WHATSAPP', fallback: 'SMS' }))).toEqual({ sms: true, wa: true });
    expect(switchesOf(step({ channel: 'EMAIL' }))).toEqual({ sms: false, wa: false });
    expect(switchesOf(step({ on: false, channel: 'WHATSAPP', fallback: 'SMS' }))).toEqual({ sms: false, wa: false });
  });
});

describe('withSwitches', () => {
  it('SMS only, WhatsApp only, both (WhatsApp first), neither (off, the rest kept)', () => {
    expect(withSwitches(step({ on: false, channel: 'WHATSAPP' }), true, false)).toMatchObject({ on: true, channel: 'SMS', fallback: 'NONE' });
    expect(withSwitches(step(), false, true)).toMatchObject({ on: true, channel: 'WHATSAPP', fallback: 'NONE' });
    expect(withSwitches(step(), true, true)).toMatchObject({ on: true, channel: 'WHATSAPP', fallback: 'SMS' });
    const off = withSwitches(step({ channel: 'WHATSAPP', fallback: 'SMS' }), false, false);
    expect(off).toEqual({ on: false, channel: 'WHATSAPP', fallback: 'SMS', template: 'order.confirmed' });
  });
  it('is the reverse of switchesOf for every pair, and keeps the template and other fields', () => {
    for (const sms of [false, true]) for (const wa of [false, true]) expect(switchesOf(withSwitches({ ...step(), email: true } as StepLike, sms, wa))).toEqual({ sms, wa });
    expect((withSwitches({ ...step(), email: true } as StepLike, true, true) as StepLike & { email: boolean }).email).toBe(true);
  });
});

describe('smsPerMonth', () => {
  it('is orders times SMS steps, never below zero', () => {
    expect(smsPerMonth(300, 4)).toBe(1200);
    expect(smsPerMonth(0, 5)).toBe(0);
    expect(smsPerMonth(-3, 5)).toBe(0);
  });
});

describe('pieces', () => {
  it('splits plain words and tokens in order', () => {
    expect(pieces('Hi {customerName}, order {orderNumber} done.')).toEqual([
      { text: 'Hi ', token: false },
      { text: 'customerName', token: true },
      { text: ', order ', token: false },
      { text: 'orderNumber', token: true },
      { text: ' done.', token: false },
    ]);
    expect(pieces('no tokens')).toEqual([{ text: 'no tokens', token: false }]);
    expect(pieces('')).toEqual([]);
  });
});

describe('pickRow', () => {
  const rows = [
    { channel: 'WHATSAPP', locale: 'en' },
    { channel: 'SMS', locale: 'en' },
    { channel: 'SMS', locale: 'bn' },
  ];
  it('the step\'s channel first, Bengali first', () => {
    expect(pickRow(rows, 'SMS')).toEqual({ channel: 'SMS', locale: 'bn' });
    expect(pickRow(rows, 'WHATSAPP')).toEqual({ channel: 'WHATSAPP', locale: 'en' });
    expect(pickRow(rows, 'EMAIL')).toEqual({ channel: 'SMS', locale: 'bn' });
    expect(pickRow([], 'SMS')).toBeNull();
  });
});
