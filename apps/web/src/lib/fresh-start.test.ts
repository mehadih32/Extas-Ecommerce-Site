import { describe, expect, it } from 'vitest';
import { POST } from '@/app/api/fresh-start/route';
import { afterFresh } from '@/components/FreshStart';
import { AUTO_WINDOW_MS, CLEAR_SITE_DATA, cookieNames, expireCookies, mayAutoRecover } from './fresh-start';

const post = (body: unknown, cookie?: string) =>
  POST(new Request('https://shop.example.test/api/fresh-start', { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }));

describe('fresh start (CN-032)', () => {
  it('reads cookie names only, once each, and skips anything that is not a name', () => {
    expect(cookieNames('a=1; __Host-admin_sid=x=y;a=2; bad name=3; ;=4')).toEqual(['a', '__Host-admin_sid']);
    expect(cookieNames(null)).toEqual([]);
  });

  it('expires every cookie on each path but keeps the preview gate; __Host- cookies only on / with Secure', () => {
    const lines = expireCookies(['__Host-admin_sid', 'extas_preview', 'extas_admin_lang'], true);
    expect(lines.filter((l) => l.startsWith('__Host-admin_sid='))).toEqual([expect.stringMatching(/^__Host-admin_sid=; Path=\/; Max-Age=0; .*; Secure$/)]);
    expect(lines.filter((l) => l.startsWith('extas_admin_lang=')).map((l) => l.match(/Path=([^;]+)/)?.[1])).toEqual(['/', '/admin']);
    expect(lines.some((l) => l.startsWith('extas_preview='))).toBe(false);
    expect(lines.every((l) => !/Domain=/i.test(l))).toBe(true);
    expect(expireCookies(['x'], false)[0]).not.toContain('Secure');
  });

  it('caps how many cookies one answer expires', () => {
    expect(expireCookies(Array.from({ length: 200 }, (_, i) => `c${i}`), true).length).toBe(120);
  });

  it('soft keeps the sign-in: cache and storage only, no cookie touched', async () => {
    const res = await post({ level: 'soft' }, '__Host-admin_sid=t; extas_preview=p');
    expect(res.headers.get('clear-site-data')).toBe(CLEAR_SITE_DATA);
    expect(res.headers.get('clear-site-data')).not.toContain('cookies');
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ ok: true, level: 'soft' });
  });

  it('full also expires the site cookies but not the preview gate; anything unknown is soft', async () => {
    const res = await post({ level: 'full' }, '__Host-admin_sid=t; extas_preview=p; extas_rail=1');
    const set = res.headers.getSetCookie();
    expect(set.some((l) => l.startsWith('__Host-admin_sid=;'))).toBe(true);
    expect(set.some((l) => l.startsWith('extas_rail=;'))).toBe(true);
    expect(set.some((l) => l.startsWith('extas_preview='))).toBe(false);
    expect((await (await post({ level: 'everything' }, 'a=1')).json()).level).toBe('soft');
  });

  it('tries by itself at most once per window, and never when the stored time is odd', () => {
    const now = 1_000_000_000;
    expect(mayAutoRecover(null, now)).toBe(true);
    expect(mayAutoRecover(String(now - 1000), now)).toBe(false);
    expect(mayAutoRecover(String(now - AUTO_WINDOW_MS - 1), now)).toBe(true);
    expect(mayAutoRecover('junk', now)).toBe(true);
    expect(mayAutoRecover(String(now + 60_000), now)).toBe(true);
  });

  it('goes to the admin sign-in from the admin or ?to=admin, else home or the same page', () => {
    expect(afterFresh('/admin/orders')).toBe('/admin/login');
    expect(afterFresh('/bn/fresh-start', '?to=admin')).toBe('/admin/login');
    expect(afterFresh('/bn/fresh-start')).toBe('/bn');
    expect(afterFresh('/fresh-start')).toBe('/');
    expect(afterFresh('/p/polo')).toBe('/p/polo');
  });
});
