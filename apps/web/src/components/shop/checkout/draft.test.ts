// PR 137 — what this browser remembers for the next checkout: only while its days last, only the three boxes, and
// nothing at all when the owner keeps it off (0 days).
import { afterEach, describe, expect, it } from 'vitest';
import { readRemembered, rememberDetails } from './draft';

const FORM = { name: 'Rahim Uddin', phone: '01700000137', address: 'House 4, Road 5, Dhanmondi' };
const DAY = 86_400_000;

function fakeStorage() {
  const m = new Map<string, string>();
  const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  (globalThis as { localStorage?: unknown }).localStorage = s;
  return m;
}

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('the browser memory of the last checkout (PR 137)', () => {
  it('keeps the details for the days set, then forgets them', () => {
    const m = fakeStorage();
    const before = Date.now();
    rememberDetails(FORM, 30);
    const raw = [...m.values()][0] ?? null;
    expect(readRemembered(raw, before)).toEqual(FORM);
    expect(readRemembered(raw, before + 31 * DAY)).toBeNull();
    rememberDetails(FORM, 0);
    expect(m.size).toBe(0);
  });

  it('reads only its own shape: broken, empty or foreign values are nothing', () => {
    expect(readRemembered(null, 0)).toBeNull();
    expect(readRemembered('not json', 0)).toBeNull();
    expect(readRemembered(JSON.stringify({ form: FORM }), 0)).toBeNull();
    expect(readRemembered(JSON.stringify({ form: { name: '', phone: '', address: '' }, until: 10 }), 0)).toBeNull();
    expect(readRemembered(JSON.stringify({ form: { name: 'Rahim', phone: 7, extra: 'x' }, until: 10 }), 0)).toEqual({ name: 'Rahim', phone: '', address: '' });
  });

  it('a blocked storage keeps nothing and never throws', () => {
    expect(() => rememberDetails(FORM, 30)).not.toThrow();
  });
});
