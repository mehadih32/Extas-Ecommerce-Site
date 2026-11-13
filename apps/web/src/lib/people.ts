// S28 · PR 705 (admin prototype v5, GAP-MAP part 2 P2-13) — the data of Settings → People and Settings → Roles. The changes
// themselves go through the routes that already exist (`/api/admin/staff`, `/api/admin/staff/:id/roles`, `/api/admin/roles`,
// `/api/admin/permissions`: PR 15, 16, 495, each checked and audited), so this file only reads: who the staff are with
// their roles, and the roles with the permission tree. People needs `staff.read`, Roles needs `roles.read`.
import { listRoles, listStaff, permissionCatalogue, requirePermission, type Actor } from '@extas/auth';
import type { PrismaClient } from '@extas/db/client';
import { buildTree, type TreeBranch } from './people-pure';

export * from './people-pure';

export interface PersonRow {
  id: string;
  email: string;
  name: string;
  status: string;
  twoFactor: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  mustChangePassword: boolean;
  roles: { assignmentId: string; roleId: string; key: string; nameEn: string; nameBn: string; storeId: number | null }[];
}
export interface RoleChoice {
  id: string;
  key: string;
  nameEn: string;
  nameBn: string;
  isOwner: boolean;
}
export interface PeopleView {
  people: PersonRow[];
  roles: RoleChoice[];
  counts: { active: number; suspended: number; archived: number; noTwoFactor: number };
}

export async function peopleView(db: PrismaClient, actor: Actor): Promise<PeopleView> {
  const staff = await listStaff(db, actor); // checks `staff.read`
  const roles = await listRoles(db);
  const people = staff.map((s) => ({
    id: s.id,
    email: s.email,
    name: s.displayName,
    status: s.status,
    twoFactor: s.twoFactorEnabled,
    lastLoginAt: s.lastLoginAt ? s.lastLoginAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
    mustChangePassword: s.mustChangePassword,
    roles: s.roles.map((r) => ({ assignmentId: r.assignmentId, roleId: r.roleId, key: r.roleKey, nameEn: r.nameEn, nameBn: r.nameBn, storeId: r.storeId })),
  }));
  const live = people.filter((p) => p.status === 'ACTIVE');
  return {
    people,
    roles: roles.map((r) => ({ id: r.id, key: r.key, nameEn: r.nameEn, nameBn: r.nameBn, isOwner: r.isOwner })),
    counts: { active: live.length, suspended: people.filter((p) => p.status === 'SUSPENDED').length, archived: people.filter((p) => p.status === 'ARCHIVED').length, noTwoFactor: live.filter((p) => !p.twoFactor).length },
  };
}

export interface RoleRow {
  id: string;
  key: string;
  nameEn: string;
  nameBn: string;
  descriptionEn: string | null;
  descriptionBn: string | null;
  isSystem: boolean;
  isOwner: boolean;
  archived: boolean;
  permissions: string[];
  people: number;
}
export interface RolesView {
  roles: RoleRow[];
  tree: TreeBranch[];
}

export async function rolesView(db: PrismaClient, actor: Actor): Promise<RolesView> {
  await requirePermission(db, actor, 'roles.read');
  const roles = await listRoles(db, { includeArchived: true });
  return {
    roles: roles.map((r) => ({ id: r.id, key: r.key, nameEn: r.nameEn, nameBn: r.nameBn, descriptionEn: r.descriptionEn, descriptionBn: r.descriptionBn, isSystem: r.isSystem, isOwner: r.isOwner, archived: r.archived, permissions: r.permissions as string[], people: r.activeAssignments })),
    tree: buildTree(permissionCatalogue()),
  };
}
