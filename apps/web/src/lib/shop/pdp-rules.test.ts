// PR 63 — Delivery · Exchange · Returns: the owner's live rules, his policy texts as fallback, nothing invented.
import { productSettings } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import { ruleCells, type RuleFacts, type RuleTextLike } from './pdp-rules';

const set = productSettings['pdp.rules'].default;
const words = { free: 'Free', more: 'Details', swapOnly: 'Size swap only' };
const facts: RuleFacts = {
  freeDelivery: false,
  exchange: { on: true, summary: 'Swap the size within 72 hours.', value: '72 hours' },
  returns: { summary: '', afterDelivery: false },
};
const texts: RuleTextLike[] = [
  { key: 'delivery-dhaka', kind: 'delivery', texts: { short: 'Dhaka 1–2 days', full: 'Dhaka 1–2 days.\nOutside 3–5 days.' } },
  { key: 'returns-window', kind: 'policy', texts: { short: 'Returns on faulty items', badge: '7 days' } },
  { key: 'privacy', kind: 'policy', texts: { short: 'Your data stays here' } },
];

describe('PR 63 · rule cells', () => {
  it('each cell from its live rule, with the full text one sentence per line', () => {
    const cells = ruleCells(set, texts, facts, words);
    expect(cells.map((c) => c.id)).toEqual(['delivery', 'exchange', 'returns']);
    expect(cells[0]).toEqual({ id: 'delivery', short: 'Dhaka 1–2 days', full: ['Dhaka 1–2 days.', 'Outside 3–5 days.'], value: 'Details', hot: false });
    expect(cells[2]).toMatchObject({ short: 'Returns on faulty items', full: ['Returns on faulty items'], value: '7 days' });
  });

  it('exchange falls back to the policy summary; a cell with nothing to say is left out', () => {
    const cells = ruleCells(set, [], facts, words);
    expect(cells.map((c) => c.id)).toEqual(['exchange']);
    expect(cells[0]).toMatchObject({ short: 'Swap the size within 72 hours.', value: '72 hours' });
    expect(ruleCells(set, [], { ...facts, exchange: { ...facts.exchange, on: false } }, words)).toEqual([]);
  });

  it('free delivery lights the delivery value; returns after delivery say "Details"', () => {
    const cells = ruleCells(set, texts.slice(0, 1), { ...facts, freeDelivery: true, returns: { summary: 'Return within 7 days.', afterDelivery: true } }, words);
    expect(cells[0]).toMatchObject({ value: 'Free', hot: true });
    expect(cells[2]).toMatchObject({ id: 'returns', short: 'Return within 7 days.', value: 'Details' });
  });

  it("the owner's order and switches", () => {
    const own = { on: true, trialLine: false, cells: [{ id: 'exchange' as const, on: true }, { id: 'delivery' as const, on: false }] };
    expect(ruleCells(own, texts, facts, words).map((c) => c.id)).toEqual(['exchange']);
    expect(ruleCells({ ...own, on: false }, texts, facts, words)).toEqual([]);
  });
});
