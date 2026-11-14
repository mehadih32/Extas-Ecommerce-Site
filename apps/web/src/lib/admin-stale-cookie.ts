// CN-053 — an admin session cookie that no longer belongs to a session (expired, signed out elsewhere, a deleted staff
// member) is expired by the sign-in address, so a browser left with a dead cookie starts clean. Only `__Host-admin_sid`
// is ever touched; a database that cannot be read leaves the cookie alone (never clear on a doubt).
import { authenticateStaff } from '@extas/auth';
import { adminDeps, clearCookie, SESSION_COOKIE, staffDeps } from './admin-auth';

/** The Set-Cookie line that expires the dead session cookie, or null when the cookie is fine or the check could not run. */
export async function staleSessionCookieLine(value: string | null): Promise<string | null> {
  if (!value) return null;
  const deps = adminDeps();
  if (!deps) return null;
  try {
    const found = await authenticateStaff(await staffDeps(deps), value);
    return found ? null : clearCookie(SESSION_COOKIE);
  } catch {
    return null;
  }
}
