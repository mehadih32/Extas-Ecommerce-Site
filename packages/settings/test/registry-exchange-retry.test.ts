// Follow-up 546 (PR 614; registry v272): the retry of an exchange send that found the ERP unreachable is one store
// setting, off as shipped, its back-off editable, labelled in both languages.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { exchangeRetrySettings } from '../src/registry-exchange-retry';

describe('exchange send retried after the ERP was unreachable (v272)', () => {
  it('is in the registry at version 272, off, per store, labelled in English and Bengali', () => {
    const s = exchangeRetrySettings['exchange.erp.retryUnreachable'];
    expect(registry['exchange.erp.retryUnreachable']).toBe(s);
    expect([s.version, s.default, s.scope, s.isOwnerData, s.group]).toEqual([272, { enabled: false, afterMinutes: 30 }, 'store', false, 'orders']);
    expect(s.schema.safeParse({ enabled: true, afterMinutes: 4 }).success).toBe(false);
    expect(s.schema.safeParse({ enabled: true, afterMinutes: 1_441 }).success).toBe(false);
    expect(s.schema.safeParse({ enabled: true, afterMinutes: 5 }).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], s.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], s.helpKey!)).toBeTruthy();
    }
  });
});
