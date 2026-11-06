// PR 627/628 (CN-036, LUMEN-SPEC §5) — Undo and "do all" only for reversible shop actions; money, refunds, payouts,
// COD, prices, discounts, blocking and deleting are never one tap (hard rule 6), and calls stay on the admin API.
import { describe, expect, it } from 'vitest';
import { actMode, callAllowed, doAllAllowed, GUARDED_ACTIONS, REVERSIBLE_ACTIONS, undoAllowed, withBody } from './safety';

const call = { method: 'POST' as const, url: '/api/admin/orders/1/confirm' };
const back = { method: 'POST' as const, url: '/api/admin/orders/1/unconfirm' };

describe('undo and do-all', () => {
  it('allows the reversible shop actions only', () => {
    for (const k of ['order.confirm', 'order.courier', 'order.status', 'hide', 'pause']) expect(undoAllowed(k), k).toBe(true);
    for (const k of [...GUARDED_ACTIONS, 'refund.full', 'price.change', 'cod.off', 'discount.add', 'delete.product', 'unknown', '', null, undefined]) expect(undoAllowed(k), String(k)).toBe(false);
    for (const k of REVERSIBLE_ACTIONS as readonly string[]) expect(GUARDED_ACTIONS.some((g) => k === g || k.startsWith(`${g}.`)), k).toBe(false);
  });

  it('offers "do all" only when every action in it is reversible', () => {
    expect(doAllAllowed(['order.confirm', 'order.confirm'])).toBe(true);
    expect(doAllAllowed(['order.confirm', 'refund'])).toBe(false);
    expect(doAllAllowed(['money'])).toBe(false);
    expect(doAllAllowed([])).toBe(false);
  });
});

describe('calls and modes', () => {
  it('only calls the admin API with a write method', () => {
    expect(callAllowed(call)).toBe(true);
    expect(callAllowed({ method: 'PUT', url: '/api/admin/look?x=1' })).toBe(true);
    for (const bad of [{ method: 'POST', url: 'https://evil.test/api/admin/x' }, { method: 'POST', url: '/api/shop/x' }, { method: 'POST', url: '/api/admin/../x' }, { method: 'POST', url: '/api/admin//x' }, { method: 'DELETE', url: '/api/admin/x' }, { method: 'GET', url: '/api/admin/x' }]) {
      expect(callAllowed(bad as never), JSON.stringify(bad)).toBe(false);
    }
    expect(callAllowed(null)).toBe(false);
  });

  it('runs a reversible action in one tap; a guarded one only opens its own page', () => {
    expect(actMode({ kind: 'order.confirm', label: 'Confirm', call, undo: back })).toEqual({ mode: 'run', call, undo: back });
    expect(actMode({ kind: 'order.confirm', label: 'Confirm', call, href: '/admin/orders/1' })).toEqual({ mode: 'open', href: '/admin/orders/1' });
    expect(actMode({ kind: 'refund', label: 'Refund', call, undo: back, href: '/admin/orders/1?refund=1' })).toEqual({ mode: 'open', href: '/admin/orders/1?refund=1' });
    expect(actMode({ kind: 'refund', label: 'Refund', call, undo: back })).toEqual({ mode: 'none' });
    expect(actMode({ kind: 'cod', label: 'COD', href: 'https://evil.test/admin' })).toEqual({ mode: 'none' });
    expect(actMode({ kind: 'price', label: 'Price', href: '//evil.test/admin' })).toEqual({ mode: 'none' });
  });

  it('adds fields to a call body without losing its own', () => {
    expect(withBody({ ...call, body: { a: 1 } }, { ids: ['x'] })).toEqual({ ...call, body: { a: 1, ids: ['x'] } });
  });
});
