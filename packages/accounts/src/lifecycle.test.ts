// S05 · PR 150 — an order's life as the customer may see it: the stored steps, his and the team's changes, never the
// team's own rows; and the groups of My orders.
import { describe, expect, it } from 'vitest';
import { isOrderShow, lifecycleOf, pageOf, showOf, type LifeEventRow } from './lifecycle';

const T = { placedAt: '2026-10-20T06:00:00Z', confirmedAt: '2026-10-20T08:00:00Z', packedAt: '2026-10-21T06:00:00Z', handedOverAt: '2026-10-21T10:00:00Z' };
const ev = (type: string, at: string, data: unknown = {}, actorType = 'STAFF', line: string | null = null): LifeEventRow => ({ type, at, data, actorType, line });

describe('PR 150 · the groups of My orders', () => {
  it('each stored state is in one group; a draft in none', () => {
    expect(showOf('CONFIRMED')).toBe('open');
    expect(showOf('ON_HOLD')).toBe('open');
    expect(showOf('IN_TRANSIT')).toBe('open');
    expect(showOf('PARTIALLY_DELIVERED')).toBe('delivered');
    expect(showOf('RETURNED')).toBe('ended');
    expect(showOf('CANCELLED')).toBe('ended');
    expect(showOf('DRAFT')).toBeNull();
    expect(isOrderShow('delivered')).toBe(true);
    expect(isOrderShow('DELIVERED')).toBe(false);
  });

  it('a page number from the address: a whole number from 1, anything else the first page', () => {
    expect(pageOf('3')).toBe(3);
    expect(pageOf(['2', '9'])).toBe(2);
    for (const bad of [undefined, '', '0', '-1', '2.5', 'abc', '999999']) expect(pageOf(bad), String(bad)).toBe(1);
  });
});

describe('PR 150 · what happened to an order', () => {
  it('the stored steps, oldest first, each said once', () => {
    const life = lifecycleOf({ status: 'IN_TRANSIT', times: T }, []);
    expect(life.map((s) => [s.kind, s.by])).toEqual([
      ['placed', null],
      ['confirmed', 'shop'],
      ['packed', null],
      ['courier', null],
    ]);
    expect(life[0]!.at).toBe('2026-10-20T06:00:00.000Z');
  });

  it('his edit and the team\'s: which fields changed (never their values) and the sizes, in time order', () => {
    const life = lifecycleOf({ status: 'CONFIRMED', times: T }, [
      ev('order.edit', '2026-10-20T07:00:00Z', { fields: [{ field: 'address', before: 'Old road', after: 'New road' }, { field: 'phone', before: '+8801700000001', after: '+8801700000002' }] }, 'CUSTOMER'),
      ev('order.edit', '2026-10-20T09:00:00Z', { lines: [{ kind: 'size', label: 'Polo · Navy · M', toLabel: 'Polo · Navy · L' }, { kind: 'remove', label: 'Chino · Khaki · 32' }] }),
      ev('order.edit', '2026-10-20T09:30:00Z', { fields: [{ field: 'unknownField' }] }),
    ]);
    const edits = life.filter((s) => s.kind === 'edited');
    expect(edits).toHaveLength(2);
    expect(edits[0]).toEqual({ at: '2026-10-20T07:00:00.000Z', kind: 'edited', by: 'you', fields: ['address', 'phone'] });
    expect(JSON.stringify(edits[0])).not.toContain('New road');
    expect(edits[1]).toMatchObject({ by: 'shop', lines: [{ from: 'Polo · Navy · M', to: 'Polo · Navy · L' }, { from: 'Chino · Khaki · 32', to: null }] });
    expect(life.map((s) => s.kind)).toEqual(['placed', 'edited', 'confirmed', 'edited', 'packed', 'courier']);
  });

  it('a piece added and taken out, his two-size answer, his cancel request and its answer', () => {
    const life = lifecycleOf({ status: 'CONFIRMED', times: { placedAt: T.placedAt, confirmedAt: T.confirmedAt } }, [
      ev('order.addLine', '2026-10-20T06:30:00Z', { itemId: 'x' }, 'CUSTOMER', 'Belt · Black'),
      ev('order.removeLine', '2026-10-20T06:40:00Z', { itemId: 'x' }, 'CUSTOMER', 'Belt · Black'),
      ev('order.twoSizeAnswer', '2026-10-20T06:50:00Z', { product: 'Polo', keep: 'M', sizes: ['S', 'M'] }, 'CUSTOMER'),
      ev('order.twoSizeAnswer', '2026-10-20T06:55:00Z', { product: 'Shirt', keep: 'all' }),
      ev('order.requestCancel', '2026-10-20T09:00:00Z', { reasonKey: 'changed-mind' }, 'CUSTOMER'),
      ev('order.refuseCancelRequest', '2026-10-20T10:00:00Z', {}),
    ]);
    expect(life.map((s) => s.kind)).toEqual(['placed', 'added', 'removed', 'sizeAnswered', 'sizeAnswered', 'confirmed', 'cancelAsked', 'cancelKept']);
    expect(life[1]).toMatchObject({ by: 'you', lines: [{ from: 'Belt · Black', to: null }] });
    expect(life[3]).toMatchObject({ by: 'you', product: 'Polo', keep: 'M' });
    expect(life[4]).toMatchObject({ by: 'shop', product: 'Shirt', keep: null });
  });

  it('a cancelled order says who cancelled it, never the reason code; a returned and a partly delivered one say so', () => {
    const mine = lifecycleOf({ status: 'CANCELLED', times: { placedAt: T.placedAt, cancelledAt: '2026-10-20T06:10:00Z' } }, [ev('order.cancel', '2026-10-20T06:10:00Z', { reason: { en: 'Changed my mind' } }, 'CUSTOMER')]);
    expect(mine.at(-1)).toEqual({ at: '2026-10-20T06:10:00.000Z', kind: 'cancelled', by: 'you' });
    const theirs = lifecycleOf({ status: 'CANCELLED', times: { placedAt: T.placedAt, cancelledAt: '2026-10-20T06:10:00Z' } }, []);
    expect(theirs.at(-1)).toMatchObject({ kind: 'cancelled', by: 'shop' });
    expect(lifecycleOf({ status: 'RETURNED', times: { ...T, returnedAt: '2026-10-23T06:00:00Z' } }, []).at(-1)?.kind).toBe('returned');
    expect(lifecycleOf({ status: 'PARTIALLY_DELIVERED', times: { ...T, deliveredAt: '2026-10-22T06:00:00Z' } }, []).at(-1)?.kind).toBe('partDelivered');
  });

  it('the team\'s own rows are never his: notes, flags, holds, duplicate and risk checks, the two-size check', () => {
    const life = lifecycleOf({ status: 'CONFIRMED', times: { placedAt: T.placedAt } }, [
      ev('order.note', '2026-10-20T06:10:00Z', { noteId: 'n', isInternal: true }),
      ev('order.setFlags', '2026-10-20T06:11:00Z', { flags: ['RISK'] }),
      ev('order.hold', '2026-10-20T06:12:00Z', { reason: 'fraud check' }),
      ev('order.release', '2026-10-20T06:13:00Z'),
      ev('order.duplicateCheck', '2026-10-20T06:14:00Z'),
      ev('order.twoSizeCheck', '2026-10-20T06:15:00Z', { asked: [] }),
      ev('order.followUp', '2026-10-20T06:16:00Z'),
    ]);
    expect(life.map((s) => s.kind)).toEqual(['placed']);
  });

  it('the advance: waiting for it, then received', () => {
    const life = lifecycleOf({ status: 'CONFIRMED', times: { placedAt: T.placedAt, confirmedAt: T.confirmedAt } }, [ev('order.awaitAdvance', '2026-10-20T06:00:00Z', {}, 'SYSTEM'), ev('order.recordAdvance', '2026-10-20T07:00:00Z')]);
    expect(life.map((s) => s.kind)).toEqual(['placed', 'advanceWait', 'advancePaid', 'confirmed']);
  });
});
