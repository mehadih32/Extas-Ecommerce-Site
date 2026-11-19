// PR 1127: the Processing chips' tags from an order's facts (no database).
import { describe, expect, it } from 'vitest';
import * as od from '@extas/orders';
import { tagsOf } from './processing-tags';

const base = { flags: [] as string[], outOfStock: false, noAnswer: false, samePhoneOpen: false, advanceAsked: false };

describe('processing tags (PR 1127)', () => {
  it('gives no tag to a plain order', () => {
    expect(tagsOf(base)).toEqual([]);
  });
  it('names each reason in the prototype order', () => {
    expect(tagsOf({ ...base, outOfStock: true, noAnswer: true, flags: [od.RISK_WATCH_FLAG], samePhoneOpen: true, advanceAsked: true })).toEqual(['stock', 'noanswer', 'suspicious', 'merge', 'advance']);
  });
  it('counts the bundling mark as merge needed and the red tag as suspicious', () => {
    expect(tagsOf({ ...base, flags: [od.BUNDLE_FLAG] })).toEqual(['merge']);
    expect(tagsOf({ ...base, flags: [od.AUTO_RED_FLAG] })).toEqual(['suspicious']);
  });
});
