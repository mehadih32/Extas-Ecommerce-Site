// CN-053 — corrupt, old, oversized or newer-build stored values are dropped silently; good ones (and the shop's wish list,
// the checkout details) survive; our own oversized cookies are named for expiry and nothing else is.
import { describe, expect, it } from 'vitest';
import { expiryLines, guardStore, MAX_COOKIE_BYTES, MAX_VALUE_CHARS, MIGRATIONS, oversizedOwnedCookies, runStorageGuard, STORAGE_VERSION, STORAGE_VERSION_KEY, storedValueOk, type StoreLike } from './storage-guard';

function memory(seed: Record<string, string> = {}, opts: { throws?: boolean } = {}): StoreLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  const boom = () => {
    if (opts.throws) throw new Error('SecurityError');
  };
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => (boom(), data.get(k) ?? null),
    setItem: (k, v) => (boom(), void data.set(k, v)),
    removeItem: (k) => (boom(), void data.delete(k)),
  };
}

const GOOD = {
  'extas-admin-later': JSON.stringify({ orders: 123 }),
  'extas.wishlist': JSON.stringify(['a', 'b']),
  'extas.campaign': JSON.stringify({ source: 'x' }),
  'extas.notice.visit': JSON.stringify({ popups: 1, shown: {} }),
  'extas.notice.7': JSON.stringify([1, 2]),
  'extas.checkout.details': JSON.stringify({ form: { name: 'a' }, until: 5 }),
  'extas.usualSize': 'M',
  'co-draft': JSON.stringify({ name: 'a' }),
};

describe('versioned storage', () => {
  it('good values of every key we own survive (no wipe on the first versioned load) and the version is stamped', () => {
    const s = memory({ ...GOOD, 'someone-elses': '{broken' });
    expect(guardStore(s)).toEqual([]);
    for (const [k, v] of Object.entries(GOOD)) expect(s.data.get(k), k).toBe(v);
    expect(s.data.get(STORAGE_VERSION_KEY)).toBe(String(STORAGE_VERSION));
    expect(s.data.get('someone-elses')).toBe('{broken'); // never read, never touched
  });

  it.each(Object.keys(GOOD).filter((k) => k !== 'extas.usualSize'))('a corrupt value for %s is dropped, the others stay', (key) => {
    const s = memory({ ...GOOD, [key]: '{"half":' });
    expect(guardStore(s)).toEqual([key]);
    expect(s.data.has(key)).toBe(false);
    expect(s.data.size).toBe(Object.keys(GOOD).length - 1 + 1); // the rest plus the version
  });

  it('a value of the wrong shape, or too big, is dropped', () => {
    expect(storedValueOk('extas-admin-later', '[1]')).toBe(false);
    expect(storedValueOk('extas-admin-later', '{"a":"x"}')).toBe(false);
    expect(storedValueOk('extas.wishlist', '{}')).toBe(false);
    expect(storedValueOk('extas.checkout.details', '{"form":1,"until":"x"}')).toBe(false);
    expect(storedValueOk('extas.usualSize', 'y'.repeat(MAX_VALUE_CHARS + 1))).toBe(false);
    expect(storedValueOk('extas.usualSize', 'L')).toBe(true);
  });

  it('data written by a NEWER build, or under a garbage version, is dropped (a rolled-back deploy)', () => {
    for (const marker of [String(STORAGE_VERSION + 1), 'banana', '-3']) {
      const s = memory({ ...GOOD, [STORAGE_VERSION_KEY]: marker });
      guardStore(s);
      expect([...s.data.keys()].sort()).toEqual([STORAGE_VERSION_KEY]);
      expect(s.data.get(STORAGE_VERSION_KEY)).toBe(String(STORAGE_VERSION));
    }
  });

  it('an upgrade runs each migration once and keeps what it carried over; a failing migration drops, never throws', () => {
    const s = memory({ 'extas.usualSize': 'M', [STORAGE_VERSION_KEY]: '0' });
    MIGRATIONS[1] = (st) => st.setItem('extas.usualSize', `${st.getItem('extas.usualSize')}!`);
    expect(guardStore(s, 1)).toEqual([]);
    expect(s.data.get('extas.usualSize')).toBe('M!');
    const t = memory({ 'extas.usualSize': 'M', [STORAGE_VERSION_KEY]: '0' });
    MIGRATIONS[1] = () => {
      throw new Error('bad');
    };
    expect(() => guardStore(t, 1)).not.toThrow();
    expect(t.data.has('extas.usualSize')).toBe(false);
    delete MIGRATIONS[1];
  });

  it('a store that throws on every call (blocked site data) never throws out of the guard', () => {
    const s = memory(GOOD, { throws: true });
    expect(() => guardStore(s)).not.toThrow();
    expect(() => runStorageGuard({ localStorage: s, sessionStorage: s, document: { cookie: '' } })).not.toThrow();
    expect(() =>
      runStorageGuard({
        get localStorage(): StoreLike {
          throw new Error('denied');
        },
      }),
    ).not.toThrow();
  });
});

describe('our own oversized cookies', () => {
  const big = (n: string, size = MAX_COOKIE_BYTES + 10) => `${n}=${'x'.repeat(size)}`;
  it('names an oversized cookie of ours and never another site\'s or a small one', () => {
    expect(oversizedOwnedCookies(`${big('extas_a')}; ${big('other')}; __Host-admin_sid=small`)).toEqual(['extas_a']);
    expect(oversizedOwnedCookies(null)).toEqual([]);
    expect(oversizedOwnedCookies('a=1; extas_b=2')).toEqual([]);
  });
  it('when the whole header is too large, our biggest cookies go first until it fits', () => {
    const header = ['extas_1', 'extas_2', 'extas_3', 'extas_4'].map((n) => big(n, MAX_COOKIE_BYTES - 100)).join('; ');
    const names = oversizedOwnedCookies(header);
    expect(names.length).toBeGreaterThanOrEqual(1);
    expect(names.length).toBeLessThan(4);
  });
  it('writes expiry lines a __Host- cookie accepts', () => {
    const [l] = expiryLines(['__Host-extas_x']);
    expect(l).toMatch(/Path=\//);
    expect(l).toMatch(/Secure/);
    expect(l).toMatch(/Max-Age=0/);
  });
  it('in the browser the oversized cookie is expired by the guard', () => {
    const doc = { cookie: big('extas_a') };
    const writes: string[] = [];
    Object.defineProperty(doc, 'cookie', { get: () => big('extas_a'), set: (v: string) => void writes.push(v) });
    runStorageGuard({ document: doc });
    expect(writes.some((w) => w.startsWith('extas_a=;') && w.includes('Max-Age=0'))).toBe(true);
  });
});
