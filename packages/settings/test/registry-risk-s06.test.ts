// S06 after launch (CN-031 lane A, registry versions 100–109). PR 162 (v100): the blocklist switch — in the registry,
// labelled in both languages, off as shipped, only "mark" or "hold" (never a cancel), and the hold reason it uses on the
// shipped hold-reason list. PR 163 (v101): repeat refusers — off, the number of refusals unset until the owner sets it,
// and the terms only the advance request's kinds or nothing. PR 164 (v102): the fraud report's default days and size.
// PR 522 (v103): one parcel for one person's orders — off, the window unset, a proposal unless the owner says group.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { REFUSER_TERMS, riskGoodCustomerSchema, riskStopReportSchema, riskBlockProposalSchema, riskBlocklistSchema, riskBundlingSchema, riskRefusersSchema, riskReportSchema, riskS06Settings } from '../src/registry-risk-s06';

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
});
