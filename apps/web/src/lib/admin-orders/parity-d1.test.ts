// PR 783 (lane D1, prototype v5 parity): the chips on All orders are the prototype's (m-orders.js CHIPS and CHIPS2), every chip
// is a view the order service knows, and the order page's eight steps put each state on the right step.
import { describe, expect, it } from 'vitest';
import * as od from '@extas/orders';
import { LIST_PAGES, ORDER_STEPS, orderStep } from './model';

const none = { booked: false, needsPerson: false, settled: false };

describe('All orders chips (prototype v5)', () => {
  it('are New, Processing, Confirmed, Booked, Packed, Handed over, Delivered, Paid | Returned, Cancelled', () => {
    expect(LIST_PAGES.all.chips).toEqual(['all', 'new', 'processing', 'confirmed', 'booked', 'packed', 'handedOver', 'delivered', 'paid']);
    expect(LIST_PAGES.all.chips2).toEqual(['returned', 'cancelled']);
  });
  it('each chip is a view of the order service and of the page', () => {
    for (const v of [...LIST_PAGES.all.chips, ...LIST_PAGES.all.chips2]) {
      expect(od.ORDER_VIEWS).toContain(v);
      expect(LIST_PAGES.all.views).toContain(v);
    }
  });
});

describe('the eight steps of an order', () => {
  it('are the prototype\'s S7', () => {
    expect([...ORDER_STEPS]).toEqual(['new', 'processing', 'confirmed', 'booked', 'packed', 'handedOver', 'delivered', 'paid']);
  });
  it('place each state on its step', () => {
    expect(orderStep('PLACED', none)).toBe(0);
    expect(orderStep('PLACED', { ...none, needsPerson: true })).toBe(1);
    expect(orderStep('AWAITING_ADVANCE', none)).toBe(1);
    expect(orderStep('ON_HOLD', none)).toBe(1);
    expect(orderStep('CONFIRMED', none)).toBe(2);
    expect(orderStep('CONFIRMED', { ...none, booked: true })).toBe(3);
    expect(orderStep('PROCESSING', { ...none, booked: true })).toBe(3);
    expect(orderStep('PACKED', none)).toBe(4);
    expect(orderStep('HANDED_OVER', none)).toBe(5);
    expect(orderStep('IN_TRANSIT', none)).toBe(5);
    expect(orderStep('DELIVERED', none)).toBe(6);
    expect(orderStep('DELIVERED', { ...none, settled: true })).toBe(7);
  });
  it('leave the road for a cancelled, returned or draft order', () => {
    for (const s of ['CANCELLED', 'RETURNED', 'DRAFT']) expect(orderStep(s, none)).toBe(-1);
  });
});
