// CN-028 · PR 610, 611 (registry v66): the order settings of ERP contract v6 — in the registry at version 66, labelled
// in both languages, their defaults valid and within their limits; the hold settings stay where v62 put them.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { erpOrdersV6Settings } from '../src/registry-erp-orders-v6';

describe('ERP v6 order settings (v66)', () => {
  it('every key is in the registry at version 66, in the ERP group, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(erpOrdersV6Settings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect([s.version, s.group, s.isOwnerData, s.isPublic], key).toEqual([66, 'erp', false, false]);
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('the defaults: a refused order asks again within the hour; the catch-up reads 14 days, 50 orders a run', () => {
    expect(Object.fromEntries(Object.entries(erpOrdersV6Settings).map(([k, s]) => [k, [s.default, s.scope]]))).toEqual({
      'erp.orders.refusedRetryMinutes': [60, 'store'],
      'erp.orders.catchUpDays': [14, 'store'],
      'erp.orders.catchUpBatch': [50, 'installation'],
    });
    expect(erpOrdersV6Settings['erp.orders.refusedRetryMinutes'].schema.safeParse(1).success).toBe(false);
    expect(erpOrdersV6Settings['erp.orders.catchUpDays'].schema.safeParse(0).success).toBe(false);
  });

  it('the hold switch and its warning stay the v62 settings (checkout pauses by default, only in a v6 store)', () => {
    expect([registry['erp.hold.pauseCheckout'].default, registry['erp.hold.pauseCheckout'].version]).toEqual([true, 62]);
    expect(registry['erp.hold.warnDays'].version).toBe(62);
  });
});
