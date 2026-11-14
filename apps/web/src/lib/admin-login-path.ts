// CN-053 (14 Nov 2026) — where the staff sign-in lives (`admin.loginPath`, default "access") and what the proxy does with
// the admin's addresses. Pure rules first (tested), then the setting's reader, kept in this process for a short while.
import { registry } from '@extas/settings';
import { ADMIN_LOGIN, ADMIN_LOGIN_PAGE } from './admin-nav';

/** The session cookie's name (lib/admin-auth.ts SESSION_COOKIE), repeated here so the proxy's rules stay free of imports. */
export const ADMIN_SESSION_COOKIE = '__Host-admin_sid';

/** The setting's address as a path ("access" -> "/access"); anything unusable falls back to the default. */
export function loginPathOf(value: unknown): string {
  const parsed = registry['admin.loginPath'].schema.safeParse(value);
  return `/${parsed.success ? parsed.data : registry['admin.loginPath'].default}`;
}

/** True for the sign-in page's own folder, which visitors may never open. */
export const isLoginPageFolder = (pathname: string): boolean => pathname === ADMIN_LOGIN_PAGE || pathname.startsWith(`${ADMIN_LOGIN_PAGE}/`);

export const isAdminPath = (pathname: string): boolean => pathname === '/admin' || pathname.startsWith('/admin/');

/**
 * What the proxy does with a page request, before anything draws:
 * - `login`: the sign-in address itself (rewritten to the sign-in page);
 * - `hide`: /admin/login, or any /admin page asked for without an admin session cookie (404, no hint);
 * - `moved`: the default address while the owner chose another one and the visitor carries an admin cookie (sent on);
 * - `pass`: everything else.
 */
export type AdminDoor = 'login' | 'hide' | 'moved' | 'pass';

export function adminDoor(pathname: string, loginPath: string, hasSessionCookie: boolean, internal: boolean): AdminDoor {
  if (pathname === loginPath) return 'login';
  // the proxy's own rewrite seen again (it carries this process's secret mark, see lib/shop/rewrite-mark.ts)
  if (internal) return 'pass';
  if (isLoginPageFolder(pathname)) return 'hide';
  if (isAdminPath(pathname)) return hasSessionCookie ? 'pass' : 'hide';
  if (pathname === ADMIN_LOGIN && loginPath !== ADMIN_LOGIN && hasSessionCookie) return 'moved';
  return 'pass';
}

/** An /admin address that no page has: where the proxy sends what it hides, so the answer is the plain 404. */
export const HIDDEN_TARGET = '/admin/missing';

const KEEP_MS = 30_000; // hardcode-ok: how long this process keeps the address it read (a refresh interval, not a business number)
const memo = globalThis as unknown as { __adminLoginPath?: { at: number; path: string } };

/** The sign-in address now: the setting, kept for a short while; the default when the setting cannot be read. */
export async function adminLoginPath(now: number = Date.now()): Promise<string> {
  const hit = memo.__adminLoginPath;
  if (hit && now - hit.at < KEEP_MS) return hit.path;
  let path = loginPathOf(undefined);
  try {
    const { settingsResolver } = await import('./settings');
    const resolver = settingsResolver();
    if (resolver) path = loginPathOf(await resolver.value('admin.loginPath'));
  } catch {
    // unreadable: the default stays
  }
  memo.__adminLoginPath = { at: now, path };
  return path;
}
