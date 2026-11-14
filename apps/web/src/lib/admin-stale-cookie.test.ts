// CN-053 — the admin session cookie is expired only when the lookup ran and found no session.
import { describe, expect, it, vi } from 'vitest';

const state = { found: null as unknown, throws: false, deps: {} as unknown };
vi.mock('@extas/auth', () => ({ authenticateStaff: async () => (state.throws ? Promise.reject(new Error('db down')) : state.found) }));
vi.mock('./admin-auth', () => ({
  adminDeps: () => state.deps,
  staffDeps: async (d: unknown) => d,
  SESSION_COOKIE: '__Host-admin_sid',
  clearCookie: (n: string) => `${n}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
}));
const { staleSessionCookieLine } = await import('./admin-stale-cookie');

describe('staleSessionCookieLine', () => {
  it('expires an unknown session cookie, exactly that cookie', async () => {
    state.found = null;
    state.throws = false;
    state.deps = {};
    const line = await staleSessionCookieLine('garbage');
    expect(line).toMatch(/^__Host-admin_sid=;/);
    expect(line).toMatch(/Path=\/;/);
    expect(line).toMatch(/Secure/);
    expect(line).toMatch(/Max-Age=0/);
  });
  it('keeps a good session, an empty cookie, a missing database and a failing lookup', async () => {
    state.found = { staff: {} };
    expect(await staleSessionCookieLine('good')).toBeNull();
    state.found = null;
    expect(await staleSessionCookieLine('')).toBeNull();
    state.deps = null;
    expect(await staleSessionCookieLine('x')).toBeNull();
    state.deps = {};
    state.throws = true;
    expect(await staleSessionCookieLine('x')).toBeNull();
  });
});
