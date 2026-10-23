import { describe, expect, it } from 'vitest';
import { checkForm, fieldOrder, fieldProblem, latinDigits } from './pure';

describe('PR 115 · the field order (CN-012)', () => {
  it('keeps the owner order, drops unknown and repeated names, and adds what he left out', () => {
    expect(fieldOrder(['phone', 'name', 'address'])).toEqual(['phone', 'name', 'address']);
    expect(fieldOrder(['address', 'address', 'email'])).toEqual(['address', 'name', 'phone']);
    expect(fieldOrder([])).toEqual(['name', 'phone', 'address']);
    expect(fieldOrder(null)).toEqual(['name', 'phone', 'address']);
  });
});

describe('PR 116 · the form checks (the browser and the order judge it the same way)', () => {
  const limits = { nameMin: 2, addressMin: 8 };
  const good = { name: 'Rahim', phone: '01712345678', address: 'House 4, Road 2, Mirpur 10' };

  it('passes a complete form and hands back the cleaned phone', () => {
    const r = checkForm(good, limits);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.phone.e164).toBe('+8801712345678');
  });

  it('names the first field still to fill in, in the owner order', () => {
    const empty = { name: '', phone: '', address: '' };
    expect(checkForm(empty, limits)).toMatchObject({ ok: false, field: 'name', problem: 'empty' });
    expect(checkForm(empty, limits, ['address', 'name', 'phone'])).toMatchObject({ ok: false, field: 'address' });
    expect(checkForm({ ...good, name: 'R' }, limits)).toMatchObject({ ok: false, field: 'name', problem: 'short' });
    expect(checkForm({ ...good, address: 'Mirpur' }, limits)).toMatchObject({ ok: false, field: 'address', problem: 'short' });
  });

  it('reads the phone the way people type it and refuses a number that is not a mobile', () => {
    expect(fieldProblem('phone', { ...good, phone: '+880 1712-345678' }, limits)).toBeNull();
    expect(fieldProblem('phone', { ...good, phone: '০১৭১২৩৪৫৬৭৮' }, limits)).toBeNull();
    expect(fieldProblem('phone', { ...good, phone: '0171234' }, limits)).toBe('phone');
    expect(fieldProblem('phone', { ...good, phone: '01212345678' }, limits)).toBe('phone');
    expect(fieldProblem('phone', { ...good, phone: '  ' }, limits)).toBe('empty');
  });

  it('counts letters, not bytes, so a Bengali name of two letters passes', () => {
    expect(fieldProblem('name', { ...good, name: 'রহ' }, limits)).toBeNull();
    expect(latinDigits('০১৭ ab')).toBe('017 ab');
  });
});
