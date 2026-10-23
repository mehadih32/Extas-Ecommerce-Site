// PR 12 — who is looking at the admin, once per request. The shell (app/admin/layout.tsx) and the page under it both
// need the session and the person's keys; React's request cache makes it one session check and one permission query
// for the two, instead of one each. The checks are guardAdmin's own (session, password change, 2FA, then the key):
// pageAccess (lib/admin-page.ts) asks here, and every admin API keeps calling guardAdmin itself.
import { cache } from 'react';
import { headers } from 'next/headers';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { isOwner, permissionsFor, type PermissionKey } from '@extas/auth';
import { adminDeps, guardAdmin, type AdminDeps, type Guarded } from '../admin-auth';

export interface ShellRole {
  key: string;
  nameEn: string;
  nameBn: string;
}

export type ShellSession =
  | { kind: 'ok'; guard: Guarded; deps: AdminDeps; perms: Set<PermissionKey>; owner: boolean; roles: ShellRole[] }
  | { kind: 'login' }
  | { kind: 'password' }
  | { kind: 'unavailable' };

/** The page's own request as guardAdmin sees an API call: its cookie, address and browser. */
export async function forwardedRequest(): Promise<Request> {
  const h = await headers();
  const forward: Record<string, string> = {};
  for (const name of ['cookie', 'user-agent', 'x-forwarded-for', 'cf-connecting-ip', 'x-real-ip']) {
    const v = h.get(name);
    if (v) forward[name] = v;
  }
  // A GET carries no state change, so the same-site check passes; the session and permission checks are the API's own.
  return new Request('https://admin.invalid/admin', { headers: forward });
}

/** The keys a staff member holds in a store (null: installation-wide, all-store roles only), once per request. */
export const permissionsIn = cache(async (staffUserId: string, storeId: number | null): Promise<Set<PermissionKey>> => {
  const deps = adminDeps();
  if (!deps) return new Set();
  return permissionsFor(deps.db, staffUserId, { storeId });
});

async function rolesOf(deps: AdminDeps, staffUserId: string): Promise<ShellRole[]> {
  const rows = await deps.db.staffRoleAssignment.findMany({
    where: { staffUserId, revokedAt: null, role: { archivedAt: null }, OR: [{ storeId: null }, { storeId: MOTHER_STORE_ID }] },
    select: { role: { select: { key: true, nameEn: true, nameBn: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => r.role);
}

export const shellSession = cache(async (): Promise<ShellSession> => {
  const deps = adminDeps();
  if (!deps) return { kind: 'unavailable' };
  const g = await guardAdmin(await forwardedRequest(), deps, {});
  if (g instanceof Response) {
    const code = ((await g.json().catch(() => ({}))) as { error?: string }).error;
    if (g.status === 401) return { kind: 'login' };
    if (code === 'PASSWORD_CHANGE_REQUIRED' || code === 'TWO_FACTOR_SETUP_REQUIRED') return { kind: 'password' };
    return { kind: 'unavailable' };
  }
  const staffUserId = g.actor.staffUserId as string;
  try {
    const [perms, owner, roles] = await Promise.all([permissionsIn(staffUserId, MOTHER_STORE_ID), isOwner(deps.db, staffUserId), rolesOf(deps, staffUserId)]);
    return { kind: 'ok', guard: g, deps, perms, owner, roles };
  } catch {
    return { kind: 'unavailable' };
  }
});

/** The permission the current page was refused for (set by pageAccess), so the "no access" state can name it. */
export const deniedMemo = cache((): { permission: PermissionKey | null } => ({ permission: null }));
