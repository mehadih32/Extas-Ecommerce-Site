import { describe, expect, it } from 'vitest';
import { productSettings } from '@extas/settings';
import { qaView, type QaRow } from './pdp-qa';

const SET = productSettings['pdp.qa'].default;
const rows = (n: number): QaRow[] => Array.from({ length: n }, (_, i) => ({ id: `q${i}`, question: `Question ${i}?`, answer: `Answer ${i}.`, answeredAt: null }));

describe('PR 66 · the questions block', () => {
  it('ships on, with the demo\'s three folded questions and the WhatsApp ask', () => {
    expect(SET).toMatchObject({ on: true, featured: true, shown: 3, answeredBy: true, askWhatsapp: true });
  });

  it('no answered question: only the WhatsApp ask, and no block at all without a number', () => {
    expect(qaView([], SET, true)).toEqual({ kind: 'ask' });
    expect(qaView([], SET, false)).toBeNull();
    expect(qaView([], { ...SET, askWhatsapp: false }, true)).toBeNull();
    // an answer that is only spaces is not an answer
    expect(qaView([{ id: 'x', question: 'Q?', answer: '  ', answeredAt: null }], SET, false)).toBeNull();
  });

  it('switched off: nothing, whatever the data', () => {
    expect(qaView(rows(4), { ...SET, on: false }, true)).toBeNull();
  });

  it('the newest opens the block; three are folded under it; the rest wait behind "See all"', () => {
    const v = qaView(rows(6), SET, true);
    expect(v).toMatchObject({ kind: 'list', ask: 'split' });
    if (v?.kind !== 'list') throw new Error('expected a list');
    expect(v.featured?.id).toBe('q0');
    expect(v.first.map((r) => r.id)).toEqual(['q1', 'q2', 'q3']);
    expect(v.rest.map((r) => r.id)).toEqual(['q4', 'q5']);
  });

  it('one question: one box, the ask under it on every screen', () => {
    const v = qaView(rows(1), SET, true);
    expect(v).toMatchObject({ kind: 'list', first: [], rest: [], ask: 'featured' });
  });

  it('without the open box every question is folded, and the ask goes under the list', () => {
    const v = qaView(rows(2), { ...SET, featured: false }, true);
    expect(v).toMatchObject({ kind: 'list', featured: null, ask: 'list' });
    if (v?.kind !== 'list') throw new Error('expected a list');
    expect(v.first).toHaveLength(2);
  });

  it('never more than the owner\'s most; no WhatsApp number: no ask', () => {
    const v = qaView(rows(20), { ...SET, max: 5 }, false);
    if (v?.kind !== 'list') throw new Error('expected a list');
    expect(1 + v.first.length + v.rest.length).toBe(5);
    expect(v.ask).toBeNull();
  });
});
