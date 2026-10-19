// PR 16, 495 — what a staff member may do. A staff member holds roles (StaffRoleAssignment), each in one store or in
// every store (storeId null); a role grants permissions (RolePermission). The owner role grants every permission in
// the catalogue. Archived roles and revoked assignments grant nothing. Every admin action asks here, on the server.
import { AuthError } from './errors';
import { isPermissionKey, OWNER_ROLE_KEY, PERMISSION_KEYS, type PermissionKey } from './catalogue';
import type { Actor, Db } from './audit';

export interface Scope {
  /** The store the action touches. Omitted = an installation-wide action: only all-store roles count. */
  storeId?: number | null;
}

/** Every permission the staff member holds in that scope. */
export async function permissionsFor(db: Db, staffUserId: string, scope: Scope = {}): Promise<Set<PermissionKey>> {
  const storeId = scope.storeId ?? null;
  const rows = await db.staffRoleAssignment.findMany({
    where: {
      staffUserId,
      revokedAt: null,
      role: { archivedAt: null },
      OR: storeId == null ? [{ storeId: null }] : [{ storeId: null }, { storeId }],
    },
    select: { role: { select: { key: true, permissions: { select: { permission: { select: { key: true } } } } } } },
  });
  const out = new Set<PermissionKey>();
  for (const { role } of rows) {
    if (role.key === OWNER_ROLE_KEY) return new Set(PERMISSION_KEYS);
    for (const { permission } of role.permissions) if (isPermissionKey(permission.key)) out.add(permission.key);
  }
  return out;
}

/** The actor's permissions; the system (deploy sync, set-up command) holds them all. */
export async function actorPermissions(db: Db, actor: Actor, scope: Scope = {}): Promise<Set<PermissionKey>> {
  if (actor.staffUserId === null) return new Set(PERMISSION_KEYS);
  return permissionsFor(db, actor.staffUserId, scope);
}

export async function can(db: Db, actor: Actor, permission: PermissionKey, scope: Scope = {}): Promise<boolean> {
  return (await actorPermissions(db, actor, scope)).has(permission);
}

/** Throws FORBIDDEN unless the actor holds the permission in that scope. */
export async function requirePermission(db: Db, actor: Actor, permission: PermissionKey, scope: Scope = {}): Promise<Set<PermissionKey>> {
  const held = await actorPermissions(db, actor, scope);
  if (!held.has(permission)) throw new AuthError('FORBIDDEN', `needs the "${permission}" permission`);
  return held;
}

/** Nobody hands out more than they hold: every permission in `wanted` must be in `held`. */
export function assertNoEscalation(held: Set<PermissionKey>, wanted: Iterable<string>): void {
  const missing = [...wanted].filter((k) => !isPermissionKey(k) || !held.has(k));
  if (missing.length) throw new AuthError('ESCALATION', 'cannot grant a permission you do not hold', missing);
}

/** The permissions a role grants (the owner role: all of them). */
export async function rolePermissionKeys(db: Db, roleId: string): Promise<{ key: string; permissions: PermissionKey[]; archived: boolean; isSystem: boolean }> {
  const role = await db.role.findUnique({
    where: { id: roleId },
    select: { key: true, archivedAt: true, isSystem: true, permissions: { select: { permission: { select: { key: true } } } } },
  });
  if (!role) throw new AuthError('NOT_FOUND', 'no such role');
  const permissions = role.key === OWNER_ROLE_KEY ? [...PERMISSION_KEYS] : role.permissions.map((p) => p.permission.key).filter(isPermissionKey);
  return { key: role.key, permissions, archived: role.archivedAt != null, isSystem: role.isSystem };
}

/** Active owners: staff with an all-store owner assignment whose account is active. */
export async function activeOwnerCount(db: Db): Promise<number> {
  return db.staffRoleAssignment.count({
    where: { storeId: null, revokedAt: null, role: { key: OWNER_ROLE_KEY, archivedAt: null }, staffUser: { status: 'ACTIVE' } },
  });
}

export async function isOwner(db: Db, staffUserId: string): Promise<boolean> {
  const n = await db.staffRoleAssignment.count({
    where: { staffUserId, storeId: null, revokedAt: null, role: { key: OWNER_ROLE_KEY, archivedAt: null } },
  });
  return n > 0;
}
