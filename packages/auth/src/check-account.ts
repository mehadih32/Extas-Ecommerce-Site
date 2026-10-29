// PR 4 / 17 (CN-016) — the smoke test's own sign-in. After every deploy and every night the server signs in to the
// admin with this account and opens every page. It is a read-only system role (`smoke-check`: every `*.read`
// permission, nothing that changes anything) on one staff account, and each run gives it a fresh password and a fresh
// two-step seed, so what the server keeps is never older than the last run. Its e-mail comes from the server's
// config, never from Git. It never takes over a person's account: an e-mail that belongs to someone with another role
// is refused, and so is a paused check account (the owner paused it on purpose).
import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@extas/db/client';
import { audit, SYSTEM, type RequestContext } from './audit';
import { PERMISSION_KEYS } from './catalogue';
import { AuthError } from './errors';
import { authLabel } from './messages';
import { hashPassword } from './password';
import { seedAad, type SeedVault } from './staff-auth';
import { base32Encode, newTotpSeed } from './totp';

export const CHECK_ROLE_KEY = 'smoke-check';

/** Read-only: the permissions that only let you see (`*.read`, and the few named `*.view`, e.g. `returns.view`). */
export const CHECK_PERMISSIONS = PERMISSION_KEYS.filter((k) => k.endsWith('.read') || k.endsWith('.view'));

export interface CheckAccount {
  staffUserId: string;
  created: boolean;
  password: string;
  /** The two-step seed in base32, for the smoke test to make its code. */
  totpSecret: string;
}

export async function ensureCheckAccount(
  db: PrismaClient,
  vault: SeedVault,
  input: { email: string; displayName: string },
  ctx: RequestContext = { source: 'smoke' },
): Promise<CheckAccount> {
  const email = input.email.trim().toLowerCase();
  const password = randomBytes(24).toString('base64url');
  const passwordHash = await hashPassword(password);
  const seed = newTotpSeed();
  const name = authLabel('roles.check.name');
  const desc = authLabel('roles.check.description');

  const { staffUserId, created } = await db.$transaction(async (tx) => {
    let role = await tx.role.findUnique({ where: { key: CHECK_ROLE_KEY } });
    if (!role) {
      role = await tx.role.create({ data: { key: CHECK_ROLE_KEY, nameEn: name.en, nameBn: name.bn, descriptionEn: desc.en, descriptionBn: desc.bn, isSystem: true } });
      await audit(tx, SYSTEM, { action: 'role.create', entityType: 'Role', entityId: role.id, after: { key: CHECK_ROLE_KEY, system: true } }, ctx);
    } else if (!role.isSystem || role.archivedAt) {
      await tx.role.update({ where: { id: role.id }, data: { isSystem: true, archivedAt: null } });
    }
    const perms = await tx.permission.findMany({ where: { key: { in: CHECK_PERMISSIONS } }, select: { id: true } });
    const held = new Set((await tx.rolePermission.findMany({ where: { roleId: role.id }, select: { permissionId: true } })).map((r) => r.permissionId));
    const missing = perms.filter((p) => !held.has(p.id));
    if (missing.length) await tx.rolePermission.createMany({ data: missing.map((p) => ({ roleId: role.id, permissionId: p.id })) });

    let staff = await tx.staffUser.findUnique({ where: { email }, include: { roleAssignments: { where: { revokedAt: null }, include: { role: true } } } });
    if (staff && staff.roleAssignments.some((a) => a.role.key !== CHECK_ROLE_KEY)) {
      throw new AuthError('CONFLICT', 'this e-mail belongs to a person with another role: choose another check e-mail');
    }
    if (staff && staff.status !== 'ACTIVE') throw new AuthError('CONFLICT', 'the check account is paused: switch it on in the admin first');
    const isNew = !staff;
    if (!staff) {
      const s = await tx.staffUser.create({ data: { email, displayName: input.displayName, passwordHash, passwordSetAt: new Date(), status: 'ACTIVE' } });
      await audit(tx, SYSTEM, { action: 'staff.create', entityType: 'StaffUser', entityId: s.id, after: { email: s.email, displayName: s.displayName, role: CHECK_ROLE_KEY } }, ctx);
      staff = { ...s, roleAssignments: [] };
    } else {
      await tx.staffUser.update({ where: { id: staff.id }, data: { passwordHash, passwordSetAt: new Date() } });
    }
    if (!staff.roleAssignments.length) {
      const a = await tx.staffRoleAssignment.create({ data: { staffUserId: staff.id, roleId: role.id, storeId: null, grantedById: null } });
      await audit(tx, SYSTEM, { action: 'staff.role.assign', entityType: 'StaffRoleAssignment', entityId: a.id, after: { staffUserId: staff.id, role: CHECK_ROLE_KEY, storeId: null } }, ctx);
    }
    return { staffUserId: staff.id, created: isNew };
  });

  // Two-step login always on for this account; the seed is sealed by the vault like a person's.
  const sealed = await vault.sealValue(seedAad(staffUserId), seed, { service: 'auth', purpose: 'smoke check 2fa', actorId: staffUserId });
  await db.staffUser.update({
    where: { id: staffUserId },
    data: { totpCiphertext: sealed.ciphertext, totpIv: sealed.iv, totpAuthTag: sealed.authTag, totpKeyVersion: sealed.keyVersion, twoFactorEnabled: true },
  });
  await audit(db, SYSTEM, { action: 'staff.check.rotated', entityType: 'StaffUser', entityId: staffUserId }, ctx);
  return { staffUserId, created, password, totpSecret: base32Encode(seed) };
}
