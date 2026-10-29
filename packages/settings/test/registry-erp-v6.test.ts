// CN-028 · PR 607–618 (CN-029 Phase 0, registry v62): every ERP v6 key at version 62, labelled in both languages, its
// default valid; the defaults are the ones docs/RETAIL-ERP-MODEL.md §11 names; v5 stays the contract until the switch;
// the selling-price floor ships empty and is the owner's; the optional extras ship off.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { erpSummaryRetrySchema, erpV6Settings } from '../src/registry-erp-v6';

const spec = (k: keyof typeof erpV6Settings) => erpV6Settings[k];

describe('ERP v6 settings (v62)', () => {
  it('every key is in the registry at version 62, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(erpV6Settings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(62);
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
    for (const lang of ['en', 'bn'] as const) expect(lookup(messages[lang], 'groups.books'), lang).toBeTruthy();
  });

  it('PR 607: v5 is the contract until the ERP`s switch date, per store; the one-way switch is the owner`s, with his OK', () => {
    const model = spec('erp.model');
    // Empty = v5. Switching retires the queued v5 documents for good (CLAUDE.md rule 6: irreversible = his written OK).
    expect([model.default, model.isOwnerData, model.requiresOwnerOk, model.scope]).toEqual([null, true, true, 'store']);
    expect(model.schema.safeParse('v6').success).toBe(true);
    expect(model.schema.safeParse('v7').success).toBe(false);
  });

  it('PR 608: a correction waits for its original a set time, then fails visibly; the chain depth is a setting', () => {
    expect([spec('erp.events.correctionWaitHours').default, spec('erp.events.maxChain').default]).toEqual([72, 8]);
    expect(spec('erp.events.correctionWaitHours').schema.safeParse(0).success).toBe(false);
    expect(spec('erp.events.maxChain').schema.safeParse(0).success).toBe(false);
  });

  it('§11: the defaults the owner approved', () => {
    const defaults = Object.fromEntries(
      (
        [
          'books.week.start',
          'books.fiscalYear.startMonth',
          'books.timing.maxMinutes',
          'books.resend.days',
          'books.close.requireMatched',
          'erp.hold.pauseCheckout',
          'erp.hold.warnDays',
          'exchange.passPriceRiseToCustomer',
          'exchange.returnWatch.days',
          'returns.handback.photo',
          'catalogue.floor.minMarginPercent',
          'catalogue.bGrade.listing',
          'erp.summary.sendAt',
          'erp.summary.retry.minutes',
          'erp.fixedCosts.spread',
        ] as const
      ).map((k) => [k, spec(k).default]),
    );
    expect(defaults).toEqual({
      'books.week.start': 'saturday',
      'books.fiscalYear.startMonth': 7,
      'books.timing.maxMinutes': 120,
      'books.resend.days': 14,
      'books.close.requireMatched': true,
      'erp.hold.pauseCheckout': true,
      'erp.hold.warnDays': 15,
      'exchange.passPriceRiseToCustomer': true,
      'exchange.returnWatch.days': 4,
      'returns.handback.photo': false,
      'catalogue.floor.minMarginPercent': null,
      'catalogue.bGrade.listing': false,
      'erp.summary.sendAt': '00:30',
      'erp.summary.retry.minutes': [1, 5, 15, 60],
      'erp.fixedCosts.spread': 'daysOfMonth',
    });
    expect(spec('books.close.runAt').default).toBe('01:30');
  });

  it('§16: every books, hold, summary, exchange and catalogue key is per store (one store = one ERP company)', () => {
    const installation = Object.entries(erpV6Settings).filter(([, s]) => s.scope === 'installation').map(([k]) => k);
    // Only how often the shop's own jobs run is installation-wide.
    expect(installation.sort()).toEqual(['erp.account.checkMinutes', 'erp.events.applyBatch', 'erp.events.applySeconds', 'erp.events.claimsLookbackDays', 'erp.events.correctionWaitHours', 'erp.events.maxAttempts', 'erp.events.maxChain', 'erp.events.pullMinutes']);
  });

  it('the selling-price floor is the owner`s price decision: empty, his own data, his written OK; only it and the switch are', () => {
    const floor = spec('catalogue.floor.minMarginPercent');
    expect([floor.default, floor.isOwnerData, floor.requiresOwnerOk]).toEqual([null, true, true]);
    for (const [k, s] of Object.entries(erpV6Settings)) if (k !== 'catalogue.floor.minMarginPercent' && k !== 'erp.model') expect(s.isOwnerData, k).toBe(false);
    expect(floor.schema.safeParse(-1).success).toBe(false);
  });

  it('bounds: a time like 00:30, at least one retry wait, a real month, a known weekday', () => {
    expect(spec('erp.summary.sendAt').schema.safeParse('24:00').success).toBe(false);
    expect(erpSummaryRetrySchema.safeParse([]).success).toBe(false);
    expect(erpSummaryRetrySchema.safeParse([0]).success).toBe(false);
    expect(spec('books.fiscalYear.startMonth').schema.safeParse(13).success).toBe(false);
    expect(spec('books.week.start').schema.safeParse('funday').success).toBe(false);
    expect(spec('books.timing.maxMinutes').schema.safeParse(0).success).toBe(false);
  });
});
