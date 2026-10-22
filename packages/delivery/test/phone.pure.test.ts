// PR 555 — the one Bangladeshi mobile-number normaliser, with the lessons file's K10 test list: never block a real number
// because of how it was typed; block only an impossible one; say the cleaned number back; store 01… and +880….
import { describe, expect, it } from 'vitest';
import { phoneNormalizeBD } from '../src/phone';

describe('phoneNormalizeBD (lessons K10)', () => {
  it.each(['01712345678', '+8801712345678', '8801712345678', '+88 01712-345678', '+880 1712 345678', '0088 01712345678', '001712345678', '1712345678', '০১৭১২৩৪৫৬৭৮'])('takes %s', (raw) => {
    expect(phoneNormalizeBD(raw)).toEqual({ ok: true, empty: false, digits: '01712345678', nice: '01712-345678', e164: '+8801712345678' });
  });

  it.each([
    ['', 'empty'],
    ['1', 'length'],
    ['0171234567', 'length'],
    ['01212345678', 'prefix'],
    ['012345678901', 'prefix'],
  ])('refuses "%s" (%s)', (raw, reason) => {
    const r = phoneNormalizeBD(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(reason);
  });

  it('keeps the cleaned digits of a refused number to say back, and copes with anything typed', () => {
    expect(phoneNormalizeBD('01212-345678')).toMatchObject({ ok: false, empty: false, digits: '01212345678' });
    expect(phoneNormalizeBD(null)).toMatchObject({ ok: false, empty: true });
    expect(phoneNormalizeBD(1712345678)).toMatchObject({ ok: true, e164: '+8801712345678' });
    expect(phoneNormalizeBD('019-1234-5678')).toMatchObject({ ok: true, digits: '01912345678' });
  });
});
