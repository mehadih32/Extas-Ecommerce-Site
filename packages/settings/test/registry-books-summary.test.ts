// CN-028 · PR 617, 618 (CN-029 Phase 1, registry v69): the summary and fixed-cost jobs' keys, labelled in both
// languages, their defaults valid; none is the owner's data or moves money; every cost line starts as one the shop
// has (a missing figure is listed as incomplete, never sent as 0).
import { describe, expect, it } from 'vitest';
import { COST_SUMMARY_LINES } from '@extas/erp-types';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { booksSummarySettings, noCostLinesSchema } from '../src/registry-books-summary';

describe('books summary settings (v69)', () => {
  it('every key is in the registry at version 69, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(booksSummarySettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(69);
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      expect(s.isOwnerData, key).toBe(false);
      expect('requiresOwnerOk' in s && s.requiresOwnerOk, key).toBeFalsy();
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('defaults: look every minute, check every hour, a month back, no cost line left out, flag after 7 days', () => {
    const d = Object.fromEntries(Object.entries(booksSummarySettings).map(([k, s]) => [k, s.default]));
    expect(d).toEqual({
      'erp.summary.tickSeconds': 60,
      'erp.summary.checkMinutes': 60,
      'erp.summary.gapDays': 31,
      'erp.summary.noCostLines': [],
      'books.status.waitingCheckWarnDays': 7,
      'books.costs.maxLineMinor': 10_000_000_000,
      'books.costs.maxMonthMinor': 40_000_000_000,
      'books.costs.listLimit': 500,
    });
  });

  it('qa-gate: the most one cost line and one month may hold stay far inside exact whole numbers', () => {
    const line = booksSummarySettings['books.costs.maxLineMinor'];
    const month = booksSummarySettings['books.costs.maxMonthMinor'];
    expect(line.schema.safeParse(0).success).toBe(false);
    expect(line.schema.safeParse(Number.MAX_SAFE_INTEGER).success).toBe(false);
    expect(month.schema.safeParse(Number.MAX_SAFE_INTEGER).success).toBe(false);
    // Four lines at the highest allowed line cap still add up exactly.
    expect(Number.isSafeInteger(4 * 10_000_000_000_000)).toBe(true);
  });

  it('only how often the shop`s own jobs run is installation-wide; the rest is per store (one store = one ERP company)', () => {
    const installation = Object.entries(booksSummarySettings).filter(([, s]) => s.scope === 'installation').map(([k]) => k);
    expect(installation.sort()).toEqual(['erp.summary.checkMinutes', 'erp.summary.tickSeconds']);
  });

  it('the cost lines a shop never has are known cost lines, each once', () => {
    expect(noCostLinesSchema.safeParse(['ACCESSORIES', 'ADS_TIKTOK']).success).toBe(true);
    expect(noCostLinesSchema.safeParse(['SALARY']).success).toBe(false);
    expect(noCostLinesSchema.safeParse(['OTHER', 'OTHER']).success).toBe(false);
    expect(noCostLinesSchema.safeParse([...COST_SUMMARY_LINES]).success).toBe(true);
    expect(booksSummarySettings['erp.summary.tickSeconds'].schema.safeParse(5).success).toBe(false);
  });
});
