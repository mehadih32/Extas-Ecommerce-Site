// S21 · PR 423 — the browser half's decisions: rage clicks, a stuck field, what one page view may send, which call counts.
import { describe, expect, it } from 'vitest';
import { judgeCall, PageReports, RageClicks, StuckFields } from './probe';

describe('RageClicks', () => {
  it('says once when the count is reached on one spot within a second', () => {
    const r = new RageClicks(4);
    expect([r.click(0, 10, 10), r.click(100, 12, 11), r.click(200, 10, 14)]).toEqual([false, false, false]);
    expect(r.click(300, 11, 10)).toBe(true);
    expect(r.click(400, 11, 10)).toBe(false);
  });
  it('starts again on another spot or after the second', () => {
    const r = new RageClicks(3);
    r.click(0, 0, 0);
    r.click(100, 0, 0);
    expect(r.click(200, 200, 200)).toBe(false);
    expect(r.click(1_500, 200, 200)).toBe(false);
  });
});

describe('StuckFields', () => {
  it('says once when a field is refused the setting times', () => {
    const f = new StuckFields(3);
    expect([f.refused('phone'), f.refused('phone'), f.refused('name'), f.refused('phone'), f.refused('phone')]).toEqual([false, false, false, true, false]);
    f.reset();
    expect([f.refused('phone'), f.refused('phone'), f.refused('phone')]).toEqual([false, false, true]);
  });
});

describe('PageReports', () => {
  it('sends each cause once, at most max per page view, and starts afresh on a new page', () => {
    const p = new PageReports(2);
    const a = { k: 'script_error' as const, d: 'x' };
    expect(p.take('/a', a)).toBe(true);
    expect(p.take('/a', a)).toBe(false);
    expect(p.take('/a', { k: 'broken_image', d: '/i.jpg' })).toBe(true);
    expect(p.take('/a', { k: 'broken_image', d: '/j.jpg' })).toBe(false);
    expect(p.take('/b', a)).toBe(true);
  });
});

describe('judgeCall', () => {
  const O = 'https://shop.example';
  const e = (
    o: Partial<{
      name: string;
      initiatorType: string;
      duration: number;
      responseStatus: number;
    }>,
  ) => ({
    name: `${O}/api/cart?x=1`,
    initiatorType: 'fetch',
    duration: 100,
    responseStatus: 200,
    ...o,
  });
  it('reports the shop own calls that failed or were slow, without the query', () => {
    expect(judgeCall(e({ responseStatus: 502 }), O, 4_000)).toEqual({
      k: 'request_failed',
      d: '/api/cart 502',
    });
    expect(judgeCall(e({ duration: 5_000.4 }), O, 4_000)).toEqual({
      k: 'slow_request',
      d: '/api/cart',
      ms: 5_000,
    });
    expect(judgeCall(e({}), O, 4_000)).toBeNull();
  });
  it('ignores other sites, pictures and its own report', () => {
    expect(judgeCall(e({ name: 'https://other.example/api', responseStatus: 500 }), O, 4_000)).toBeNull();
    expect(judgeCall(e({ initiatorType: 'img', responseStatus: 500 }), O, 4_000)).toBeNull();
    expect(judgeCall(e({ name: `${O}/api/problems`, responseStatus: 500 }), O, 4_000)).toBeNull();
    expect(judgeCall(e({ name: 'not a url' }), O, 4_000)).toBeNull();
  });
});
