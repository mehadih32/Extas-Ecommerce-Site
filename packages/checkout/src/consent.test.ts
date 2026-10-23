import { describe, expect, it } from 'vitest';
import { consentInputSchema, consentOf } from './consent';

describe('marketing opt-in (PR 123)', () => {
  const on = { enabled: true, defaults: { sms: true, whatsapp: false } };
  it('keeps each channel as answered; the starting ticks when the page sent none', () => {
    expect(consentOf(on, { sms: false, whatsapp: true })).toEqual({ sms: false, whatsapp: true });
    expect(consentOf(on, null)).toEqual({ sms: true, whatsapp: false });
  });
  it('asks nothing and records nothing while the ticks are off', () => {
    expect(consentOf({ ...on, enabled: false }, { sms: true, whatsapp: true })).toEqual({ sms: null, whatsapp: null });
  });
  it('takes only the two ticks', () => {
    expect(consentInputSchema.safeParse({ sms: true, whatsapp: false }).success).toBe(true);
    expect(consentInputSchema.safeParse({ sms: 'yes', whatsapp: false }).success).toBe(false);
    expect(consentInputSchema.safeParse({ sms: true, whatsapp: false, email: true }).success).toBe(false);
  });
});
