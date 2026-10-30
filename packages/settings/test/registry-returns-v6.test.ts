// CN-028 · PR 612–614 (CN-029 Phase 1, registry v67): returns and exchanges on the ERP model. Every key at version 67,
// per store, labelled in both languages, its default valid. The old shop-side paths are switches that keep today's
// behaviour (on) until the switch-over turns them off; the owner's check window is one of his three answers (Q4); an
// exchange never takes the last piece by default.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { returnsV6Settings, RETURNS_ERP_CHECK_DAYS } from '../src/registry-returns-v6';

describe('returns and exchanges on the ERP model (v67)', () => {
  it('every key is in the registry at version 67, per store, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(returnsV6Settings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(67);
      expect(s.scope, key).toBe('store');
      expect(s.isOwnerData, key).toBe(false);
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('the old shop QC, restock, write-off and credit-due paths ship on (today`s v5 behaviour) and are switches, never removed', () => {
    for (const k of ['returns.legacy.shopQc', 'returns.legacy.restock', 'returns.legacy.writeOff', 'returns.legacy.creditDue'] as const) {
      expect(returnsV6Settings[k].default, k).toBe(true);
      expect(returnsV6Settings[k].schema.safeParse(false).success, k).toBe(true);
    }
  });

  it('owner answer Q4: the check window is 7, 10 or 15 days, 7 by default', () => {
    const s = returnsV6Settings['returns.erpCheck.days'];
    expect(s.default).toBe(7);
    expect([...RETURNS_ERP_CHECK_DAYS]).toEqual([7, 10, 15]);
    for (const n of RETURNS_ERP_CHECK_DAYS) expect(s.schema.safeParse(n).success).toBe(true);
    for (const n of [3, 8, 30]) expect(s.schema.safeParse(n).success).toBe(false);
  });

  it('regular orders come first: an exchange never takes the last piece by default', () => {
    const s = returnsV6Settings['exchange.erp.keepForOrders'];
    expect(s.default).toBe(1);
    expect(s.schema.safeParse(0).success).toBe(true);
    expect(s.schema.safeParse(-1).success).toBe(false);
  });

  it('the nightly compare runs after the ERP night run, at a clock time', () => {
    const s = returnsV6Settings['returns.compare.runAt'];
    expect(s.default).toBe('01:15');
    expect(s.schema.safeParse('23:59').success).toBe(true);
    expect(s.schema.safeParse('25:00').success).toBe(false);
  });
});
