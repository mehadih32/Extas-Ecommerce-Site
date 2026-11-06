// Follow-up 539 (PR 610; registry v239): the alert for documents the ERP keeps refusing is one store setting, empty (off)
// as shipped, labelled in both languages.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { erpHeldSettings } from '../src/registry-erp-held';

describe('ERP held alert (v239)', () => {
  it('is in the registry at version 239, empty, per store, labelled in English and Bengali', () => {
    const s = erpHeldSettings['erp.orders.heldAlertAfterHours'];
    expect(registry['erp.orders.heldAlertAfterHours']).toBe(s);
    expect([s.version, s.default, s.scope, s.isOwnerData]).toEqual([239, null, 'store', false]);
    expect(s.schema.safeParse(null).success).toBe(true);
    expect(s.schema.safeParse(0).success).toBe(false);
    expect(s.schema.safeParse(24).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], s.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], s.helpKey!)).toBeTruthy();
    }
  });
});
