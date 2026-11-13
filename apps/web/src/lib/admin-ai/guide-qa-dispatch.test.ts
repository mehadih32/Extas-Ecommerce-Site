// S15 · PR 334 — plainTextOfGuide: flattens a page guide's own parsed blocks to plain text, the exact grounding
// text guideQaAnswer hands the model. No DB, no network: pure flattening logic only (the guarded call itself is
// covered by guide-qa-dispatch.db.test.ts).
import { describe, expect, it } from 'vitest';
import type { Block } from '../admin-shell/guide';
import { plainTextOfGuide } from './guide-qa-dispatch';

describe('plainTextOfGuide (PR 334)', () => {
  it('flattens headings and paragraphs to one line each, in order', () => {
    const blocks: Block[] = [
      { t: 'h', level: 2, c: [{ t: 'text', v: 'এটা কী' }] },
      { t: 'p', c: [{ t: 'text', v: 'এই পাতায় ' }, { t: 'b', c: [{ t: 'text', v: 'কম-স্টক' }] }, { t: 'text', v: ' দেখায়।' }] },
    ];
    expect(plainTextOfGuide(blocks)).toBe('এটা কী\nএই পাতায় কম-স্টক দেখায়।');
  });

  it('drops struck-through (superseded) text, never grounding an answer in words the guide itself marks as no longer true', () => {
    const blocks: Block[] = [{ t: 'p', c: [{ t: 'text', v: 'এখন ' }, { t: 's', c: [{ t: 'text', v: 'পুরনো নিয়ম' }] }, { t: 'text', v: 'নতুন নিয়ম চলছে।' }] }];
    expect(plainTextOfGuide(blocks)).not.toContain('পুরনো নিয়ম');
    expect(plainTextOfGuide(blocks)).toContain('নতুন নিয়ম চলছে');
  });

  it('flattens list items, with sub-lists indented by their own bullet, and skips empty lines', () => {
    const blocks: Block[] = [
      { t: 'ul', items: [
        { c: [{ t: 'text', v: 'প্রথম ধাপ' }], sub: [] },
        { c: [{ t: 'text', v: 'দ্বিতীয় ধাপ' }], sub: [{ t: 'ul', items: [{ c: [{ t: 'text', v: 'উপ-ধাপ' }], sub: [] }] }] },
      ] },
    ];
    expect(plainTextOfGuide(blocks)).toBe('- প্রথম ধাপ\n- দ্বিতীয় ধাপ\n- উপ-ধাপ');
  });

  it('keeps a box (Tip/Careful/Example) with its own kind named, and a table flattened row by row', () => {
    const blocks: Block[] = [
      { t: 'box', kind: 'tip', blocks: [{ t: 'p', c: [{ t: 'text', v: 'আগে থেকে সেট করে রাখুন।' }] }] },
      { t: 'table', head: [[{ t: 'text', v: 'নাম' }], [{ t: 'text', v: 'মান' }]], rows: [[[{ t: 'text', v: 'থ্রেশহোল্ড' }], [{ t: 'text', v: '5' }]]] },
    ];
    const text = plainTextOfGuide(blocks);
    expect(text).toContain('[tip]');
    expect(text).toContain('আগে থেকে সেট করে রাখুন।');
    expect(text).toContain('নাম | মান');
    expect(text).toContain('থ্রেশহোল্ড | 5');
  });

  it('returns an empty string for an empty guide, never inventing filler text', () => {
    expect(plainTextOfGuide([])).toBe('');
    expect(plainTextOfGuide([{ t: 'hr' }])).toBe('');
  });
});
