// Follow-up 148 — what the privacy tab suggests the owner's notice should name: only what the checkout keeps now.
import { describe, expect, it } from 'vitest';
import { privacyHintsOf } from './service';

describe('privacy hints (follow-up 148)', () => {
  it('names nothing as shipped (browser days 0, capture off)', () => {
    expect(privacyHintsOf({ account: true, browserDays: 0 }, false, 30)).toEqual([]);
  });
  it('names the browser keeping and the unfinished checkouts, each with its days', () => {
    expect(privacyHintsOf({ account: true, browserDays: 14 }, true, 30)).toEqual([
      { id: 'browser', days: 14 },
      { id: 'capture', days: 30 },
    ]);
  });
  it('reads nothing from a broken value', () => {
    expect(privacyHintsOf(null, 'yes', null)).toEqual([]);
  });
});
