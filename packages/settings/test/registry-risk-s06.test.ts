// S06 after launch (CN-031 lane A, registry versions 100–109). PR 162 (v100): the blocklist switch — in the registry,
// labelled in both languages, off as shipped, only "mark" or "hold" (never a cancel), and the hold reason it uses on the
// shipped hold-reason list. PR 163 (v101): repeat refusers — off, the number of refusals unset until the owner sets it,
// and the terms only the advance request's kinds or nothing. PR 164 (v102): the fraud report's default days and size.
// PR 522 (v103): one parcel for one person's orders — off, the window unset, a proposal unless the owner says group.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { CALL_OUTCOMES_DEFAULT, callOutcomesSchema, checkoutPhoneRiskSchema, riskFlagReportSchema, checkoutTransitDuplicateSchema, REFUSER_TERMS, riskApprovalSchema, riskNewCustomerSchema, riskLearningSchema, riskGoodCustomerSchema, riskStopReportSchema, riskBlockProposalSchema, riskBlocklistSchema, riskBundlingSchema, riskRefusersSchema, riskReportSchema, riskS06Settings } from '../src/registry-risk-s06';

describe('S06 risk settings (v100–109)', () => {
  it('PR 162: the blocklist is in the registry at version 100, labelled in English and Bengali, off as shipped', () => {
    const spec = riskS06Settings['risk.blocklist'];
    expect(registry['risk.blocklist']).toBe(spec);
    expect(spec.version).toBe(100);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.isPublic).toBe(false);
    expect(spec.schema.safeParse(spec.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
    expect(spec.default).toEqual({ enabled: false, onOrder: 'mark', holdReasonKey: 'risk-check' });
  });

  it('PR 162: a match is only marked or held; a cancel or an unknown field is refused', () => {
    const d = riskS06Settings['risk.blocklist'].default;
    expect(riskBlocklistSchema.safeParse({ ...d, onOrder: 'hold' }).success).toBe(true);
    expect(riskBlocklistSchema.safeParse({ ...d, onOrder: 'cancel' }).success).toBe(false);
    expect(riskBlocklistSchema.safeParse({ ...d, tellCustomer: true }).success).toBe(false);
  });

  it('PR 162: the hold reason it uses ships on the hold-reason list', () => {
    const key = riskS06Settings['risk.blocklist'].default.holdReasonKey;
    expect(registry['orders.hold.reasons'].default.find((r) => r.key === key)).toBeTruthy();
  });

  it('PR 163: repeat refusers at version 101, labelled in both languages, off and the number unset as shipped', () => {
    const spec = riskS06Settings['risk.refusers'];
    expect(registry['risk.refusers']).toBe(spec);
    expect(spec.version).toBe(101);
    expect(spec.isOwnerData).toBe(false);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
    expect(spec.default).toEqual({ enabled: false, minRefused: null });
    expect(riskRefusersSchema.safeParse({ enabled: true, minRefused: 3 }).success).toBe(true);
    expect(riskRefusersSchema.safeParse({ enabled: true, minRefused: 0 }).success).toBe(false);
    expect(riskRefusersSchema.safeParse({ enabled: true, minRefused: 2.5 }).success).toBe(false);
    expect(REFUSER_TERMS).toEqual(['none', 'delivery', 'full', 'codOff']);
  });

  it('PR 164: the fraud report at version 102, labelled in both languages, 30 days and 5,000 rows as shipped', () => {
    const spec = riskS06Settings['risk.report'];
    expect(registry['risk.report']).toBe(spec);
    expect(spec.version).toBe(102);
    expect(spec.isOwnerData).toBe(false);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
    expect(spec.default).toEqual({ days: 30, maxRows: 5_000 });
    expect(riskReportSchema.safeParse({ days: 0, maxRows: 5_000 }).success).toBe(false);
    expect(riskReportSchema.safeParse({ days: 400, maxRows: 5_000 }).success).toBe(false);
    expect(riskReportSchema.safeParse({ days: 7, maxRows: 99 }).success).toBe(false);
    expect(riskReportSchema.safeParse({ days: 7, maxRows: 20_001 }).success).toBe(false);
    expect(riskReportSchema.safeParse({ days: 7, maxRows: 100, extra: 1 }).success).toBe(false);
  });

  it('PR 522: one parcel for one person at version 103, labelled in both languages, off and the window unset as shipped', () => {
    const spec = riskS06Settings['risk.bundling'];
    expect(registry['risk.bundling']).toBe(spec);
    expect(spec.version).toBe(103);
    expect(spec.isOwnerData).toBe(false);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
    expect(spec.default).toEqual({ enabled: false, windowHours: null, action: 'propose', maxOrders: 5 });
    expect(riskBundlingSchema.safeParse({ enabled: true, windowHours: 24, action: 'group', maxOrders: 3 }).success).toBe(true);
    expect(riskBundlingSchema.safeParse({ enabled: true, windowHours: 0, action: 'group', maxOrders: 3 }).success).toBe(false);
    expect(riskBundlingSchema.safeParse({ enabled: true, windowHours: 24, action: 'cancel', maxOrders: 3 }).success).toBe(false);
    expect(riskBundlingSchema.safeParse({ enabled: true, windowHours: 24, action: 'group', maxOrders: 1 }).success).toBe(false);
  });

  it('PR 523: the blocklist proposal at version 104, labelled in both languages, off and the number unset as shipped', () => {
    const spec = riskS06Settings['risk.blockProposal'];
    expect(registry['risk.blockProposal']).toBe(spec);
    expect(spec.version).toBe(104);
    expect(spec.isOwnerData).toBe(false);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
    expect(spec.default).toEqual({ enabled: false, minRejections: null, cancelCodes: ['RISK_DECLINED'] });
    expect(riskBlockProposalSchema.safeParse({ enabled: true, minRejections: 3, cancelCodes: ['RISK_DECLINED', 'ADVANCE_NOT_PAID'] }).success).toBe(true);
    expect(riskBlockProposalSchema.safeParse({ enabled: true, minRejections: 0, cancelCodes: [] }).success).toBe(false);
    // "the phone's owner never ordered" is never a rejection, and a code counts once
    expect(riskBlockProposalSchema.safeParse({ enabled: true, minRejections: 3, cancelCodes: ['NOT_ORDERED'] }).success).toBe(false);
    expect(riskBlockProposalSchema.safeParse({ enabled: true, minRejections: 3, cancelCodes: ['RISK_DECLINED', 'RISK_DECLINED'] }).success).toBe(false);
  });

  it('PR 524: good customers (105) and the stop report (106), labelled in both languages, off and unset as shipped', () => {
    for (const [key, version] of [['risk.goodCustomer', 105], ['risk.stopReport', 106]] as const) {
      const spec = riskS06Settings[key];
      expect(registry[key]).toBe(spec);
      expect(spec.version).toBe(version);
      expect(spec.isOwnerData).toBe(false);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
      }
    }
    expect(riskS06Settings['risk.goodCustomer'].default).toEqual({ enabled: false, minDelivered: null, maxRefused: 0 });
    expect(riskS06Settings['risk.stopReport'].default).toEqual({ days: 7, warnWrongPercent: null, minStops: 5, maxRows: 500 });
    expect(riskGoodCustomerSchema.safeParse({ enabled: true, minDelivered: 3, maxRefused: 0 }).success).toBe(true);
    expect(riskGoodCustomerSchema.safeParse({ enabled: true, minDelivered: 0, maxRefused: 0 }).success).toBe(false);
    expect(riskStopReportSchema.safeParse({ days: 7, warnWrongPercent: 30, minStops: 5, maxRows: 500 }).success).toBe(true);
    expect(riskStopReportSchema.safeParse({ days: 0, warnWrongPercent: 30, minStops: 5, maxRows: 500 }).success).toBe(false);
  });

  it('PR 540: the approval digest and gate (107), labelled in both languages, the gate off as shipped', () => {
    const spec = riskS06Settings['risk.approval'];
    expect(registry['risk.approval']).toBe(spec);
    expect(spec.version).toBe(107);
    expect(spec.isOwnerData).toBe(false);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
    expect(spec.default).toEqual({ gate: false, maxRows: 100 });
    expect(riskApprovalSchema.safeParse({ gate: true, maxRows: 50 }).success).toBe(true);
    expect(riskApprovalSchema.safeParse({ gate: true, maxRows: 5 }).success).toBe(false);
  });

  it('PR 543: the decision learning loop (108), labelled in both languages, off as shipped', () => {
    const spec = riskS06Settings['risk.learning'];
    expect(registry['risk.learning']).toBe(spec);
    expect(spec.version).toBe(108);
    expect(spec.isOwnerData).toBe(false);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
    expect(spec.default).toEqual({ enabled: false, days: 90, minDecisions: 10, suggestPercent: 80, maxRows: 5000 });
    expect(riskLearningSchema.safeParse({ ...spec.default, enabled: true, suggestPercent: 100 }).success).toBe(true);
    for (const bad of [{ days: 6 }, { minDecisions: 2 }, { suggestPercent: 49 }, { maxRows: 99 }, { extra: 1 }]) expect(riskLearningSchema.safeParse({ ...spec.default, ...bad }).success, JSON.stringify(bad)).toBe(false);
  });

  it('PR 545: the new-customer call and the call outcomes (109), labelled in both languages, off as shipped', () => {
    for (const key of ['risk.newCustomer', 'orders.callOutcomes'] as const) {
      const spec = riskS06Settings[key];
      expect(registry[key]).toBe(spec);
      expect(spec.version).toBe(109);
      expect(spec.isOwnerData).toBe(false);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
    expect(riskS06Settings['risk.newCustomer'].default).toEqual({ enabled: false, prepaid: false });
    expect(riskNewCustomerSchema.safeParse({ enabled: true, prepaid: true, extra: 1 }).success).toBe(false);
    // the call screen's codes include the one the phone history counts as "did not answer" (risk.history)
    expect(CALL_OUTCOMES_DEFAULT.map((o) => o.key)).toContain('NO_ANSWER');
    expect(CALL_OUTCOMES_DEFAULT.find((o) => o.key === 'NO_ANSWER')!.done).toBe(false);
    expect(callOutcomesSchema.safeParse(CALL_OUTCOMES_DEFAULT).success).toBe(true);
    for (const bad of [[], [{ key: 'no_answer', en: 'x', bn: 'y', done: false }], [CALL_OUTCOMES_DEFAULT[0], CALL_OUTCOMES_DEFAULT[0]], [{ ...CALL_OUTCOMES_DEFAULT[0], en: '' }]]) expect(callOutcomesSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });

  it('PR 556: the in-transit duplicate notice (109), labelled in both languages, off and never by the number alone as shipped', () => {
    const spec = riskS06Settings['checkout.transitDuplicate'];
    expect(registry['checkout.transitDuplicate']).toBe(spec);
    expect(spec.version).toBe(109);
    expect(spec.isOwnerData).toBe(false);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
    expect(spec.default).toMatchObject({ enabled: false, include: 'shipped', byPhoneAlone: false, sizeExchange: false });
    // PR 557: a value saved before the size exchange existed still reads, with it off
    const { sizeExchange: _gone, ...before557 } = spec.default;
    expect(checkoutTransitDuplicateSchema.parse(before557).sizeExchange).toBe(false);
    expect(checkoutTransitDuplicateSchema.safeParse({ ...spec.default, enabled: true, include: 'open', byPhoneAlone: true }).success).toBe(true);
    for (const bad of [{ include: 'all' }, { windowDays: 0 }, { windowDays: 121 }, { reportDays: 0 }, { extra: 1 }]) expect(checkoutTransitDuplicateSchema.safeParse({ ...spec.default, ...bad }).success, JSON.stringify(bad)).toBe(false);
  });

  it('PR 559: the phone-entry risk check (109), labelled in both languages, off as shipped, its time and keep bounded', () => {
    const spec = riskS06Settings['checkout.phoneRisk'];
    expect(registry['checkout.phoneRisk']).toBe(spec);
    expect(spec.version).toBe(109);
    expect(spec.isOwnerData).toBe(false);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
    expect(spec.default).toMatchObject({ enabled: false });
    for (const bad of [{ budgetMs: 100 }, { budgetMs: 10_001 }, { cacheHours: 0 }, { cacheHours: 721 }, { extra: 1 }]) expect(checkoutPhoneRiskSchema.safeParse({ ...spec.default, ...bad }).success, JSON.stringify(bad)).toBe(false);
  });

  it('PR 562: the flag outcome report (109), labelled in both languages, off as shipped, never pointing anything out until the owner sets a share', () => {
    const spec = riskS06Settings['risk.flagReport'];
    expect(registry['risk.flagReport']).toBe(spec);
    expect(spec.version).toBe(109);
    expect(spec.isOwnerData).toBe(false);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
    expect(spec.default).toMatchObject({ enabled: false, warnLeftPercent: null });
    expect(riskFlagReportSchema.safeParse({ ...spec.default, warnLeftPercent: 60 }).success).toBe(true);
    for (const bad of [{ days: 6 }, { days: 367 }, { warnLeftPercent: 0 }, { warnLeftPercent: 101 }, { minFlags: 0 }, { maxRows: 99 }, { extra: 1 }]) expect(riskFlagReportSchema.safeParse({ ...spec.default, ...bad }).success, JSON.stringify(bad)).toBe(false);
  });
});
