import { describe, expect, it } from 'vitest';
import { aadFor, deriveKek, newDataKey, open, seal, unwrapDataKey, wrapDataKey } from '../src/crypto';

const master = 'm'.repeat(20) + 'Q7xP2kLz9VbN4cR8tY1wE6uI3oA5sD0f';

describe('vault crypto', () => {
  it('round-trips a secret and binds it to its place', () => {
    const key = newDataKey();
    const s = seal(key, Buffer.from('sample-token-value'), aadFor('courier.apiKey', 1));
    expect(open(key, s, aadFor('courier.apiKey', 1)).toString()).toBe('sample-token-value');
    expect(() => open(key, s, aadFor('courier.apiKey', 2))).toThrow();
    expect(() => open(key, s, aadFor('sms.apiKey', 1))).toThrow();
    expect(() => open(key, s, aadFor('courier.apiKey', null))).toThrow();
  });
  it('detects tampering', () => {
    const key = newDataKey();
    const s = seal(key, Buffer.from('abc'), 'x');
    s.ciphertext[0] = (s.ciphertext[0] ?? 0) ^ 1;
    expect(() => open(key, s, 'x')).toThrow();
  });
  it('wraps data keys with the master key only', () => {
    const kek = deriveKek(master);
    const dk = newDataKey();
    const w = wrapDataKey(kek, dk, 3);
    expect(unwrapDataKey(kek, w, 3).equals(dk)).toBe(true);
    expect(() => unwrapDataKey(kek, w, 4)).toThrow();
    expect(() => unwrapDataKey(deriveKek(master + 'x'), w, 3)).toThrow();
    expect(w.includes(dk)).toBe(false);
  });
  it('refuses a missing or short master key', () => {
    expect(() => deriveKek('')).toThrow();
    expect(() => deriveKek('short')).toThrow();
  });
});
