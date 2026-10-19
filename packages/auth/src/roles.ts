// PR 495 — the role builder (replaces the fixed owner/manager/support/auditor list of PR 16). The admin creates roles
// from the permission catalogue; the owner role is seeded by the sync and always holds everything. Rules:
// - only staff with `roles.manage` in every store may build roles (roles are shared by all stores);
// - nobody can put a permission into a role, or take one out, that they do not hold themselves (no escalation);
// - the owner role's permissions cannot be edited and it cannot be archived; its names can;
// - a role is never deleted: it is archived (it then grants nothing) and can be restored;
// - every change writes the audit log in the same transaction.
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient } from '@extas/db/client';
import { audit, type Actor, type Db, type RequestContext } from './audit';
import { isPermissionKey, OWNER_ROLE_KEY, PERMISSION_KEYS, PERMISSIONS, permissionGroupLabelKey, permissionLabelKey, type PermissionKey } from './catalogue';
import { AuthError } from './errors';
import { authLabel } from './messages';
import { assertNoEscalation, requirePermission, rolePermissionKeys } from './rbac';

const name = z.string().trim().min(1).max(80);
const description = z.string().trim().max(500).nullable().optional();
const permissionList = z.array(z.string()).max(PERMISSION_KEYS.length).transform((list, ctx) => {
  const unknown = list.filter((k) => !isPermissionKey(k));
  if (unknown.length) ctx.addIssue({ code: 'custom', message: `unknown permissions: ${unknown.join(', ')}` });
  return [...new Set(list.filter(isPermissionKey))];
});

export const roleInput = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/).optional(),
  nameEn: name,
  nameBn: name,
  descriptionEn: description,
  descriptionBn: description,
  permissions: permissionList,
});
export const rolePatch = z.object({
  nameEn: name.optional(),
  nameBn: name.optional(),
  descriptionEn: description,
  descriptionBn: description,
  permissions: permissionList.optional(),
});
export type RoleInput = z.input<typeof roleInput>;
export type RolePatch = z.input<typeof rolePatch>;

function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw new AuthError('INVALID_INPUT', 'the role is not valid', r.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`));
  return r.data;
}

function slug(text: string): string {
  const s = text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  return /^[a-z][a-z0-9-]{1,}$/.test(s) ? s : `role-${randomBytes(3).toString('hex')}`;
}

export interface RoleView {
  id: string;
  key: string;
  nameEn: string;
  nameBn: string;
  descriptionEn: string | null;
  descriptionBn: string | null;
  isSystem: boolean;
  isOwner: boolean;
  archived: boolean;
  permissions: PermissionKey[];
  activeAssignments: number;
}

export async function listRoles(db: PrismaClient, opts: { includeArchived?: boolean } = {}): Promise<RoleView[]> {
  const rows = await db.role.findMany({
    where: opts.includeArchived ? {} : { archivedAt: null },
    orderBy: [{ isSystem: 'desc' }, { nameEn: 'asc' }],
    include: {
      permissions: { select: { permission: { select: { key: true } } } },
      _count: { select: { assignments: { where: { revokedAt: null } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    nameEn: r.nameEn,
    nameBn: r.nameBn,
    descriptionEn: r.descriptionEn,
    descriptionBn: r.descriptionBn,
    isSystem: r.isSystem,
    isOwner: r.key === OWNER_ROLE_KEY,
    archived: r.archivedAt != null,
    permissions: r.key === OWNER_ROLE_KEY ? [...PERMISSION_KEYS] : r.permissions.map((p) => p.permission.key).filter(isPermissionKey),
    activeAssignments: r._count.assignments,
  }));
}

/** The catalogue with its labels, for the role builder screen. */
export function permissionCatalogue() {
  return PERMISSION_KEYS.map((key) => {
    const group = PERMISSIONS[key].group;
    return { key, group, label: authLabel(permissionLabelKey(key)), groupLabel: authLabel(permissionGroupLabelKey(group)) };
  });
}

async function permissionIds(db: Db, keys: PermissionKey[]) {
  const rows = await db.permission.findMany({ where: { key: { in: keys } }, select: { id: true, key: true } });
  if (rows.length !== keys.length) {
    const have = new Set(rows.map((r) => r.key));
    throw new AuthError('CONFLICT', 'permission catalogue not synced yet (run the auth sync)', keys.filter((k) => !have.has(k)));
  }
  return rows;
}

export async function createRole(db: PrismaClient, actor: Actor, input: RoleInput, ctx: RequestContext = {}): Promise<RoleView> {
  const held = await requirePermission(db, actor, 'roles.manage');
  const data = parse(roleInput, input);
  assertNoEscalation(held, data.permissions);
  const key = data.key ?? slug(data.nameEn);
  if (key === OWNER_ROLE_KEY) throw new AuthError('SYSTEM_ROLE', 'the owner role exists already');
  const id = await db.$transaction(async (tx) => {
    if (await tx.role.findUnique({ where: { key } })) throw new AuthError('CONFLICT', `a role with key "${key}" exists`);
    const perms = await permissionIds(tx, data.permissions);
    const role = await tx.role.create({
      data: {
        key,
        nameEn: data.nameEn,
        nameBn: data.nameBn,
        descriptionEn: data.descriptionEn ?? null,
        descriptionBn: data.descriptionBn ?? null,
        permissions: { create: perms.map((p) => ({ permissionId: p.id })) },
      },
    });
    await audit(tx, actor, { action: 'role.create', entityType: 'Role', entityId: role.id, after: { key, nameEn: data.nameEn, nameBn: data.nameBn, permissions: data.permissions } }, ctx);
    return role.id;
  });
  return (await listRoles(db, { includeArchived: true })).find((r) => r.id === id)!;
}

export async function updateRole(db: PrismaClient, actor: Actor, roleId: string, patch: RolePatch, ctx: RequestContext = {}): Promise<RoleView> {
  const held = await requirePermission(db, actor, 'roles.manage');
  const data = parse(rolePatch, patch);
  const current = await rolePermissionKeys(db, roleId);
  // A role more powerful than the actor cannot be touched at all, not even renamed.
  assertNoEscalation(held, current.permissions);
  if (data.permissions !== undefined) {
    if (current.key === OWNER_ROLE_KEY) throw new AuthError('SYSTEM_ROLE', "the owner role always holds every permission");
    assertNoEscalation(held, data.permissions);
  }
  await db.$transaction(async (tx) => {
    const before = await tx.role.findUniqueOrThrow({ where: { id: roleId } });
    const fields = {
      ...(data.nameEn !== undefined && { nameEn: data.nameEn }),
      ...(data.nameBn !== undefined && { nameBn: data.nameBn }),
      ...(data.descriptionEn !== undefined && { descriptionEn: data.descriptionEn }),
      ...(data.descriptionBn !== undefined && { descriptionBn: data.descriptionBn }),
    };
    if (Object.keys(fields).length) await tx.role.update({ where: { id: roleId }, data: fields });
    if (data.permissions !== undefined) {
      const want = await permissionIds(tx, data.permissions);
      await tx.rolePermission.deleteMany({ where: { roleId, permissionId: { notIn: want.map((p) => p.id) } } });
      await tx.rolePermission.createMany({ data: want.map((p) => ({ roleId, permissionId: p.id })), skipDuplicates: true });
    }
    await audit(tx, actor, {
      action: 'role.update',
      entityType: 'Role',
      entityId: roleId,
      before: { nameEn: before.nameEn, nameBn: before.nameBn, descriptionEn: before.descriptionEn, descriptionBn: before.descriptionBn, permissions: current.permissions },
      after: { ...fields, ...(data.permissions !== undefined && { permissions: data.permissions }) },
    }, ctx);
  });
  return (await listRoles(db, { includeArchived: true })).find((r) => r.id === roleId)!;
}

/** Archive (the role then grants nothing) or restore. Never a delete. */
export async function setRoleArchived(db: PrismaClient, actor: Actor, roleId: string, archived: boolean, ctx: RequestContext = {}): Promise<RoleView> {
  const held = await requirePermission(db, actor, 'roles.manage');
  const current = await rolePermissionKeys(db, roleId);
  if (current.key === OWNER_ROLE_KEY) throw new AuthError('SYSTEM_ROLE', 'the owner role cannot be archived');
  assertNoEscalation(held, current.permissions);
  if (current.archived !== archived) {
    await db.$transaction(async (tx) => {
      await tx.role.update({ where: { id: roleId }, data: { archivedAt: archived ? new Date() : null } });
      await audit(tx, actor, { action: archived ? 'role.archive' : 'role.restore', entityType: 'Role', entityId: roleId, before: { archived: current.archived }, after: { archived } }, ctx);
    });
  }
  return (await listRoles(db, { includeArchived: true })).find((r) => r.id === roleId)!;
}
