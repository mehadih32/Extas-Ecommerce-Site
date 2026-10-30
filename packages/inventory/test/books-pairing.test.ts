// CN-028 · PR 616 money review (pure): one day's payments are grouped by the same key on both sides, whether the ERP's
// statement rows carry their eventId or not (v6 does not promise one). Written before `paymentGroups` existed: the old
// grouping keyed a row without an eventId by its reference and the shop's entry by its eventId, so they never met.
import { describe, expect, it } from 'vitest';
import { eventOfKey, paymentGroups, type PayErpRow, type PayShopRow } from '../src';

const shop = (ref: number, id: string, amountMinor: number, reference: string | null, links: string[] = []): PayShopRow => ({ ref, id, links, amountMinor, reference });
const erp = (ref: number, amountMinor: number, reference: string | null, eventId: string | null = null, id: string | null = `ST-${ref}`): PayErpRow => ({ ref, eventId, reference, amountMinor, id });

describe('PR 616 money review: paymentGroups', () => {
  it('pairs by eventId when the row carries it, else by amount and reference', () => {
    const g = paymentGroups([shop(0, 'evt-a', -100000, 'BANK-1'), shop(1, 'evt-b', -50000, 'BANK-2')], [erp(0, -50000, 'BANK-2'), erp(1, -100000, 'BANK-1', 'evt-a')]);
    expect([g.shop.get(0), g.shop.get(1)]).toEqual(['PAYMENT|evt-a', 'PAYMENT|evt-b']);
    expect([g.erp.get(0), g.erp.get(1)]).toEqual(['PAYMENT|evt-b', 'PAYMENT|evt-a']);
  });

  it('two payments of the same amount pair by their references; an amount that differs still meets its reference (an amount difference, never a missing event)', () => {
    const g = paymentGroups([shop(0, 'evt-a', -100000, 'BANK-1'), shop(1, 'evt-b', -100000, 'BANK-2')], [erp(0, -100000, 'BANK-2'), erp(1, -90000, 'BANK-1')]);
    expect([g.erp.get(0), g.erp.get(1)]).toEqual(['PAYMENT|evt-b', 'PAYMENT|evt-a']);
  });

  it('a correction of the same day joins its payment; the ERP`s reversal and new rows without ids go with it by reference', () => {
    const g = paymentGroups(
      [shop(0, 'evt-a', -100000, 'BANK-1'), shop(1, 'evt-c', 100000, 'BANK-1', ['evt-a']), shop(2, eventOfKey('evt-c:new'), -90000, 'BANK-1')],
      [erp(0, -100000, 'BANK-1'), erp(1, 100000, 'BANK-1'), erp(2, -90000, 'BANK-1')],
    );
    expect(new Set(g.shop.values())).toEqual(new Set(['PAYMENT|evt-a']));
    expect(new Set(g.erp.values())).toEqual(new Set(['PAYMENT|evt-a']));
  });

  it('a correction on its own day meets the ERP`s rows whether they carry the correction`s eventId or the original`s', () => {
    const units = [shop(0, 'evt-c', 100000, 'BANK-1', ['evt-a']), shop(1, 'evt-c', -90000, 'BANK-1')];
    expect(new Set(paymentGroups(units, [erp(0, 100000, 'BANK-1', 'evt-c'), erp(1, -90000, 'BANK-1', 'evt-c')]).erp.values())).toEqual(new Set(['PAYMENT|evt-c']));
    expect(new Set(paymentGroups(units, [erp(0, 100000, 'BANK-1', 'evt-a'), erp(1, -90000, 'BANK-1', 'evt-c')]).erp.values())).toEqual(new Set(['PAYMENT|evt-c']));
    expect(new Set(paymentGroups(units, [erp(0, 100000, 'BANK-1'), erp(1, -90000, 'BANK-1')]).erp.values())).toEqual(new Set(['PAYMENT|evt-c']));
  });

  it('a row with no partner keeps a group of its own (the ERP`s payment the shop lacks), named as before', () => {
    const g = paymentGroups([], [erp(0, -100000, 'BANK-9'), erp(1, -100000, null, 'evt-z'), erp(2, -5000, null, null, 'ST-77')]);
    expect([g.erp.get(0), g.erp.get(1), g.erp.get(2)]).toEqual(['PAYMENT|BANK-9', 'PAYMENT|evt-z', 'PAYMENT|ST-77']);
  });

  it('the shop`s own correction of a group counts in its net, so the corrected payment still pairs by amount', () => {
    const g = paymentGroups([shop(0, 'evt-a', -100000, null)], [erp(0, -90000, null)], new Map([['PAYMENT|evt-a', 10000]]));
    expect(g.erp.get(0)).toBe('PAYMENT|evt-a');
  });

  // Round 2 money review: the contract's normal case is a statement row with neither eventId nor reference.
  it('a correction on a later day: the ERP`s reversal and new rows without ids or references go with it together', () => {
    const g = paymentGroups([shop(0, 'evt-c', 100000, null, ['evt-a']), shop(1, 'evt-c', -80000, null)], [erp(0, 100000, null), erp(1, -80000, null)]);
    expect([g.erp.get(0), g.erp.get(1)]).toEqual(['PAYMENT|evt-c', 'PAYMENT|evt-c']);
  });

  it('a correction of the same day without ids or references: the rows that cancel out join the corrected unit', () => {
    const g = paymentGroups([shop(0, 'evt-a', -30000, null), shop(1, 'evt-c', 30000, null, ['evt-a']), shop(2, eventOfKey('evt-c:new'), -35000, null)], [erp(0, -30000, null), erp(1, 30000, null), erp(2, -35000, null)]);
    expect(new Set(g.erp.values())).toEqual(new Set(['PAYMENT|evt-a']));
  });

  it('two payments of one reference, one corrected that day: the correction`s rows join the corrected payment', () => {
    const g = paymentGroups(
      [shop(0, 'evt-a', -50000, 'R'), shop(1, 'evt-b', -30000, 'R'), shop(2, 'evt-c', 30000, 'R', ['evt-b']), shop(3, 'evt-c', -35000, 'R')],
      [erp(0, -50000, 'R'), erp(1, -30000, 'R'), erp(2, 30000, 'R'), erp(3, -35000, 'R')],
    );
    expect([g.erp.get(0), g.erp.get(1), g.erp.get(2), g.erp.get(3)]).toEqual(['PAYMENT|evt-a', 'PAYMENT|evt-b', 'PAYMENT|evt-b', 'PAYMENT|evt-b']);
  });

  it('an amount difference on a payment with no reference stays one group (an amount difference, never a missing event plus an unknown row)', () => {
    expect(paymentGroups([shop(0, 'evt-a', -100000, null)], [erp(0, -90000, null)]).erp.get(0)).toBe('PAYMENT|evt-a');
    const g = paymentGroups([shop(0, 'evt-a', -50000, null), shop(1, 'evt-b', -30000, null)], [erp(0, -30000, null), erp(1, -45000, null)]);
    expect([g.erp.get(0), g.erp.get(1)]).toEqual(['PAYMENT|evt-b', 'PAYMENT|evt-a']);
    // With two units still short, a row is not guessed into either: it keeps its own group.
    expect(paymentGroups([shop(0, 'evt-a', -50000, null), shop(1, 'evt-b', -30000, null)], [erp(0, -45000, null)]).erp.get(0)).toBe('PAYMENT|ST-0');
  });

  it('round 3: a pair made only by a guess (no eventId, no shared reference) is named as such; an exact or same-reference pair is not', () => {
    expect([...paymentGroups([shop(0, 'evt-a', -100000, null)], [erp(0, -90000, null)]).guessed]).toEqual(['PAYMENT|evt-a']);
    expect([...paymentGroups([shop(0, 'evt-a', -100000, 'BANK-1')], [erp(0, -90000, null)]).guessed]).toEqual(['PAYMENT|evt-a']);
    expect([...paymentGroups([shop(0, 'evt-a', -100000, 'BANK-1')], [erp(0, -90000, 'BANK-1')]).guessed]).toEqual([]);
    expect([...paymentGroups([shop(0, 'evt-a', -100000, null)], [erp(0, -100000, null)]).guessed]).toEqual([]);
    expect([...paymentGroups([shop(0, 'evt-c', 100000, null, ['evt-a']), shop(1, 'evt-c', -80000, null)], [erp(0, 100000, null), erp(1, -80000, null)]).guessed]).toEqual([]);
  });

  it('the event an entry key stands for', () => {
    expect([eventOfKey('evt-a'), eventOfKey('evt-a:new'), eventOfKey('evt-c:keep:evt-b'), eventOfKey('evt-c:keep:evt-b:new')]).toEqual(['evt-a', 'evt-a', 'evt-c', 'evt-c']);
  });
});
