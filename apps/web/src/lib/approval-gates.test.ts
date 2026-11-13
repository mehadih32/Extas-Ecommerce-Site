// S28 · PR 664 and 687 wired to the staff limits (702) and the approvals (703): the pure rules. Owner decisions of 13 Nov
// 2026: price adjust and cash in/out are ON, role limits ship empty, and an empty limit means every entry waits for one
// approver; the owner has no limit. Every value is made up.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { cashVerdict, priceVerdict, type GatePerson } from './approval-gates';

const gates = registry['approvals.gates'].default;
const owner: GatePerson = { owner: true, roleKeys: ['owner'] };
const desk: GatePerson = { owner: false, roleKeys: ['desk'] };
const price = (limits: Record<string, { maxDiscountMinor: number | null; maxDiscountPct: number | null; hideContact: boolean }>) => ({ limits });

describe('approval gates: shipped defaults', () => {
  it('ship ON with every limit empty and Telegram asked', () => {
    expect(gates.priceAdjust).toEqual({ emptyLimitWaits: true, askTelegram: true });
    expect(gates.cash).toEqual({ enabled: true, emptyLimitWaits: true, askTelegram: true, limits: {} });
    expect(registry['approvals.gates'].version).toBe(333);
  });
});

describe('price adjust verdict', () => {
  it('lets the owner apply at once, whatever the size', () => {
    expect(priceVerdict(owner, price({}), gates, 90_000, 100_000)).toEqual({ apply: true });
  });
  it('makes an empty limit wait for one approver (nothing set for the role)', () => {
    expect(priceVerdict(desk, price({}), gates, 100, 100_000)).toEqual({ apply: false, reason: 'NO_LIMIT_SET', limit: null });
    expect(priceVerdict(desk, price({ desk: { maxDiscountMinor: null, maxDiscountPct: null, hideContact: false } }), gates, 100, 100_000)).toMatchObject({ apply: false, reason: 'NO_LIMIT_SET' });
  });
  it('a person without any role or without an account waits too', () => {
    expect(priceVerdict({ owner: false, roleKeys: [] }, price({}), gates, 100, 100_000)).toMatchObject({ apply: false, reason: 'NO_LIMIT_SET' });
  });
  it('applies inside a set limit and waits above it (amount, then percent)', () => {
    const limits = price({ desk: { maxDiscountMinor: 5000, maxDiscountPct: 10, hideContact: false } });
    expect(priceVerdict(desk, limits, gates, 5000, 100_000)).toEqual({ apply: true });
    expect(priceVerdict(desk, limits, gates, 5001, 100_000)).toEqual({ apply: false, reason: 'OVER_AMOUNT', limit: 5000 });
    expect(priceVerdict(desk, price({ desk: { maxDiscountMinor: null, maxDiscountPct: 10, hideContact: false } }), gates, 10_001, 100_000)).toEqual({ apply: false, reason: 'OVER_PERCENT', limit: 10 });
  });
  it('the owner may let an empty limit mean no limit', () => {
    const off = { ...gates, priceAdjust: { ...gates.priceAdjust, emptyLimitWaits: false } };
    expect(priceVerdict(desk, price({}), off, 99_000, 100_000)).toEqual({ apply: true });
  });
  it('takes nothing off is never a wait', () => {
    expect(priceVerdict(desk, price({}), gates, 0, 100_000)).toEqual({ apply: true });
  });
});

describe('cash in/out verdict', () => {
  it('is off when switched off', () => {
    expect(cashVerdict(desk, { ...gates, cash: { ...gates.cash, enabled: false } }, 5000)).toEqual({ apply: true });
  });
  it('lets the owner record at once', () => {
    expect(cashVerdict(owner, gates, 9_000_000)).toEqual({ apply: true });
  });
  it('waits when the role has no cash limit', () => {
    expect(cashVerdict(desk, gates, 1)).toEqual({ apply: false, reason: 'NO_LIMIT_SET', limit: null });
  });
  it('applies up to the widest limit among the roles and waits above it', () => {
    const g = { ...gates, cash: { ...gates.cash, limits: { desk: 10_000, lead: 50_000, other: null } } };
    expect(cashVerdict({ owner: false, roleKeys: ['desk'] }, g, 10_000)).toEqual({ apply: true });
    expect(cashVerdict({ owner: false, roleKeys: ['desk'] }, g, 10_001)).toEqual({ apply: false, reason: 'OVER_CASH', limit: 10_000 });
    expect(cashVerdict({ owner: false, roleKeys: ['desk', 'lead'] }, g, 50_000)).toEqual({ apply: true });
    expect(cashVerdict({ owner: false, roleKeys: ['other'] }, g, 1)).toMatchObject({ apply: false, reason: 'NO_LIMIT_SET' });
  });
  it('an empty limit may mean no limit when the owner says so', () => {
    expect(cashVerdict(desk, { ...gates, cash: { ...gates.cash, emptyLimitWaits: false } }, 5000)).toEqual({ apply: true });
  });
});
