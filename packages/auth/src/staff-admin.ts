// PR 15, 16, 495 — managing staff accounts and who holds which role. Rules:
// - adding staff, pausing an account, resetting its 2FA: `staff.manage` in every store;
// - giving or taking a role in one store: `staff.manage` in that store (or in every store);
// - nobody acts on an account that holds more than they do, and nobody hands out a role holding more than they do;
// - the last active owner can never lose the owner role or be paused (the shop would have no one in charge);
// - nobody pauses their own account;
// - a new account's password is set by whoever adds it and must be changed at the first login;
// - nothing is deleted: an assignment is revoked (kept with its date), an account is suspended or archived;
// - every change writes the audit log, in the same transaction.
import { z } from 'zod';
import type { PrismaClient } from '@extas/db/client';
import type { StaffUserStatus } from './db-types';
import { audit, securityEvent, type Actor, type RequestContext } from './audit';
import { OWNER_ROLE_KEY } from './catalogue';
import { AuthError } from './errors';
import { assertStaffPassword, hashPassword } from './password';
import type { SecurityPolicy } from './policy';
import { activeOwnerCount, assertNoEscalation, permissionsFor, requirePermission, rolePermissionKeys } from './rbac';
import { publicStaff, type PublicStaff } from './staff-auth';

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const displayName = z.string().trim().min(1).max(120);

export const newStaffInput = z.object({ email, displayName, password: z.string(), phone: z.string().trim().max(32).nullable().optional() });
export const staffPatch = z.object({ displayName: displayName.optional(), status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']).optional() });
export type NewStaffInput = z.input<typeof newStaffInput>;
export type StaffPatch = z.input<typeof staffPatch>;

function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw new AuthError('INVALID_INPUT', 'the input is not valid', r.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`));
  return r.data;
}

/** The actor must hold everything the target account holds in every store. */
async function assertNotMorePowerful(db: PrismaClient, actor: Actor, targetId: string) {
  if (actor.staffUserId === null) return;
  const [mine, theirs] = await Promise.all([permissionsFor(db, actor.staffUserId), permissionsFor(db, targetId)]);
  assertNoEscalation(mine, theirs);
}

export interface StaffView extends PublicStaff {
  mustChangePassword: boolean;
  roles: { assignmentId: string; roleId: string; roleKey: string; nameEn: string; nameBn: string; storeId: number | null; since: Date }[];
}

export async function listStaff(db: PrismaClient, actor: Actor): Promise<StaffView[]> {
  await requirePermission(db, actor, 'staff.read');
  const rows = await db.staffUser.findMany({
    orderBy: { createdAt: 'asc' },
    include: { roleAssignments: { where: { revokedAt: null }, include: { role: true }, orderBy: { createdAt: 'asc' } } },
  });
  return rows.map((s) => ({
    ...publicStaff(s),
    mustChangePassword: s.passwordSetAt == null,
    roles: s.roleAssignments.map((a) => ({ assignmentId: a.id, roleId: a.roleId, roleKey: a.role.key, nameEn: a.role.nameEn, nameBn: a.role.nameBn, storeId: a.storeId, since: a.createdAt })),
  }));
}

/** Adds a staff account with a first password the person must change at their first login. */
export async function createStaff(db: PrismaClient, policy: SecurityPolicy, actor: Actor, input: NewStaffInput, ctx: RequestContext = {}, opts: { passwordChosenByOwner?: boolean } = {}): Promise<PublicStaff> {
  await requirePermission(db, actor, 'staff.manage');
  const data = parse(newStaffInput, input);
  assertStaffPassword(data.password, policy, { email: data.email });
  if (await db.staffUser.findUnique({ where: { email: data.email } })) throw new AuthError('CONFLICT', 'an account with this e-mail exists');
  const passwordHash = await hashPassword(data.password);
  const created = await db.$transaction(async (tx) => {
    const s = await tx.staffUser.create({
      data: {
        email: data.email,
        displayName: data.displayName,
        phone: data.phone ?? null,
        passwordHash,
        // The set-up command lets the owner choose his own first password; everyone else changes theirs.
        passwordSetAt: opts.passwordChosenByOwner ? new Date() : null,
        status: 'ACTIVE',
      },
    });
    await audit(tx, actor, { action: 'staff.create', entityType: 'StaffUser', entityId: s.id, after: { email: s.email, displayName: s.displayName } }, ctx);
    return s;
  });
  return publicStaff(created);
}

export async function updateStaff(db: PrismaClient, actor: Actor, staffUserId: string, patch: StaffPatch, ctx: RequestContext = {}): Promise<PublicStaff> {
  await requirePermission(db, actor, 'staff.manage');
  const data = parse(staffPatch, patch);
  const target = await db.staffUser.findUnique({ where: { id: staffUserId } });
  if (!target) throw new AuthError('NOT_FOUND', 'no such staff account');
  await assertNotMorePowerful(db, actor, staffUserId);
  const statusChange = data.status !== undefined && data.status !== target.status;
  if (statusChange && data.status !== 'ACTIVE') {
    if (actor.staffUserId === staffUserId) throw new AuthError('SELF', 'you cannot pause your own account');
    const owners = await db.staffRoleAssignment.count({ where: { staffUserId, storeId: null, revokedAt: null, role: { key: OWNER_ROLE_KEY } } });
    if (owners > 0 && target.status === 'ACTIVE' && (await activeOwnerCount(db)) <= 1) throw new AuthError('LAST_OWNER', 'the last owner cannot be paused');
  }
  const now = new Date();
  const updated = await db.$transaction(async (tx) => {
    const s = await tx.staffUser.update({
      where: { id: staffUserId },
      data: {
        ...(data.displayName !== undefined && { displayName: data.displayName }),
        ...(statusChange && { status: data.status as StaffUserStatus, archivedAt: data.status === 'ARCHIVED' ? now : null }),
      },
    });
    if (statusChange && data.status !== 'ACTIVE') {
      await tx.staffSession.updateMany({ where: { staffUserId, revokedAt: null }, data: { revokedAt: now } });
    }
    await audit(tx, actor, {
      action: statusChange ? `staff.status.${data.status!.toLowerCase()}` : 'staff.update',
      entityType: 'StaffUser',
      entityId: staffUserId,
      before: { displayName: target.displayName, status: target.status },
      after: { displayName: s.displayName, status: s.status },
    }, ctx);
    return s;
  });
  return publicStaff(updated);
}

/** Switches someone else's two-step login off (a lost phone). They set it up again at their next login. */
export async function resetStaffTwoFactor(db: PrismaClient, actor: Actor, staffUserId: string, ctx: RequestContext = {}): Promise<void> {
  await requirePermission(db, actor, 'staff.manage');
  const target = await db.staffUser.findUnique({ where: { id: staffUserId } });
  if (!target) throw new AuthError('NOT_FOUND', 'no such staff account');
  if (actor.staffUserId === staffUserId) throw new AuthError('SELF', 'switch your own two-step login off from your profile');
  await assertNotMorePowerful(db, actor, staffUserId);
  await db.$transaction(async (tx) => {
    await tx.staffUser.update({ where: { id: staffUserId }, data: { twoFactorEnabled: false, totpCiphertext: null, totpIv: null, totpAuthTag: null, totpKeyVersion: null } });
    await tx.staffSession.updateMany({ where: { staffUserId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(tx, actor, { action: 'staff.2fa.reset', entityType: 'StaffUser', entityId: staffUserId, before: { twoFactorEnabled: target.twoFactorEnabled }, after: { twoFactorEnabled: false } }, ctx);
    await securityEvent(tx, 'staff.2fa.reset', 'warning', { staffUserId, by: actor.staffUserId });
  });
}

/** Gives a role in one store (storeId) or in every store (null). Giving it again after a revoke restores it. */
export async function assignRole(db: PrismaClient, actor: Actor, input: { staffUserId: string; roleId: string; storeId: number | null }, ctx: RequestContext = {}): Promise<{ assignmentId: string }> {
  const scope = { storeId: input.storeId };
  const held = await requirePermission(db, actor, 'staff.manage', scope);
  const role = await rolePermissionKeys(db, input.roleId);
  if (role.archived) throw new AuthError('CONFLICT', 'an archived role cannot be given');
  if (role.key === OWNER_ROLE_KEY && input.storeId !== null) throw new AuthError('INVALID_INPUT', 'the owner role is given for every store');
  assertNoEscalation(held, role.permissions);
  const target = await db.staffUser.findUnique({ where: { id: input.staffUserId } });
  if (!target) throw new AuthError('NOT_FOUND', 'no such staff account');
  if (input.storeId !== null && !(await db.store.findUnique({ where: { id: input.storeId }, select: { id: true } }))) {
    throw new AuthError('NOT_FOUND', 'no such store');
  }
  return db.$transaction(async (tx) => {
    // The unique index does not cover storeId null (PostgreSQL NULLs are distinct), so look first.
    const existing = await tx.staffRoleAssignment.findFirst({ where: { staffUserId: input.staffUserId, roleId: input.roleId, storeId: input.storeId } });
    if (existing && !existing.revokedAt) return { assignmentId: existing.id };
    const row = existing
      ? await tx.staffRoleAssignment.update({ where: { id: existing.id }, data: { revokedAt: null, grantedById: actor.staffUserId } })
      : await tx.staffRoleAssignment.create({ data: { staffUserId: input.staffUserId, roleId: input.roleId, storeId: input.storeId, grantedById: actor.staffUserId } });
    await audit(tx, actor, { action: 'staff.role.assign', entityType: 'StaffRoleAssignment', entityId: row.id, storeId: input.storeId, after: { staffUserId: input.staffUserId, role: role.key, storeId: input.storeId } }, ctx);
    if (role.key === OWNER_ROLE_KEY) await securityEvent(tx, 'staff.owner.granted', 'warning', { staffUserId: input.staffUserId, by: actor.staffUserId });
    return { assignmentId: row.id };
  });
}

/** Takes a role away (the row stays, with the date it ended). */
export async function revokeRole(db: PrismaClient, actor: Actor, assignmentId: string, ctx: RequestContext = {}): Promise<void> {
  const a = await db.staffRoleAssignment.findUnique({ where: { id: assignmentId }, include: { role: true } });
  if (!a || a.revokedAt) throw new AuthError('NOT_FOUND', 'no such live role assignment');
  const held = await requirePermission(db, actor, 'staff.manage', { storeId: a.storeId });
  const role = await rolePermissionKeys(db, a.roleId);
  assertNoEscalation(held, role.permissions);
  if (a.role.key === OWNER_ROLE_KEY && a.storeId === null) {
    const target = await db.staffUser.findUniqueOrThrow({ where: { id: a.staffUserId } });
    if (target.status === 'ACTIVE' && (await activeOwnerCount(db)) <= 1) throw new AuthError('LAST_OWNER', 'the last owner cannot lose the owner role');
  }
  await db.$transaction(async (tx) => {
    await tx.staffRoleAssignment.update({ where: { id: assignmentId }, data: { revokedAt: new Date() } });
    await audit(tx, actor, { action: 'staff.role.revoke', entityType: 'StaffRoleAssignment', entityId: assignmentId, storeId: a.storeId, before: { staffUserId: a.staffUserId, role: a.role.key, storeId: a.storeId } }, ctx);
  });
}

