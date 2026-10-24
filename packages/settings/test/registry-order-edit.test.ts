// S05 · PR 142, 143, 146 (registry v37): every order-edit key at version 37, never owner data, labelled in English and Bengali,
// its default valid; the reason lists carry the real-life reasons SIM-F-038 found missing, and the cancel codes gained
// "did not order" (so the cancel reasons' definition moved to version 37 too).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { orderEditSettings } from '../src/registry-order-edit';
import { ORDER_CANCEL_CODES, ordersSettings } from '../src/registry-orders';

describe('order edit settings (v37)', () => {
  it('every key is in the registry at version 37, never owner data, labelled in English and Bengali, its default valid', () => {
    for (const [key, spec] of Object.entries(orderEditSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      // PR 157 (SIM-F-044) moved the refusal reasons to v43 ("late", "wrong item", "damaged")
      expect(spec.version, key).toBe(key === 'orders.refusal.reasons' ? 43 : 37);
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('PR 143: the customer cannot edit his order until the owner switches it on', () => {
    expect(orderEditSettings['orders.edit.customer'].default.enabled).toBe(false);
    expect(orderEditSettings['orders.edit.customer'].isPublic).toBe(true);
  });

  it('PR 146: the two-size follow-up waits for the owner\'s switch; when on, it asks the customer and leaves a call', () => {
    expect(orderEditSettings['orders.twoSize'].default).toEqual({ enabled: false, askCustomer: true, callTask: true });
  });

  it('SIM-F-038: "did not order" is a cancel reason, and the refusal list has "bought elsewhere" and "arrived after Eid", in both languages', () => {
    expect(ORDER_CANCEL_CODES).toContain('NOT_ORDERED');
    const cancel = ordersSettings['orders.cancel.reasons'];
    expect(cancel.version).toBe(37);
    expect(cancel.default.find((r) => r.code === 'NOT_ORDERED')).toMatchObject({ en: expect.stringContaining('Did not order'), bn: expect.any(String) });
    const refusal = orderEditSettings['orders.refusal.reasons'].default.map((r) => r.key);
    expect(refusal).toEqual(expect.arrayContaining(['bought-elsewhere', 'after-eid', 'other']));
    expect(orderEditSettings['orders.edit.reasons'].default.map((r) => r.key)).toEqual(expect.arrayContaining(['wrong-phone', 'other']));
    expect(orderEditSettings['orders.edit.reasons'].schema.safeParse([]).success).toBe(false);
  });
});
