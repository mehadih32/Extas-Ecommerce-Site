// PR 15, 495 — the first owner account. The repository holds no owner data (PR 509): the owner's e-mail and password
// are typed in on the server by the set-up command (cli.ts `create-owner`), never written into code or Git. It only
// works while the installation has no active owner; after that, owners are added in the admin.
import type { PrismaClient } from '@extas/db/client';
import { SYSTEM, type RequestContext } from './audit';
import { OWNER_ROLE_KEY } from './catalogue';
import { AuthError } from './errors';
import type { SecurityPolicy } from './policy';
import { activeOwnerCount } from './rbac';
import { assignRole, createStaff } from './staff-admin';
import type { PublicStaff } from './staff-auth';

export async function createFirstOwner(
  db: PrismaClient,
  policy: SecurityPolicy,
  input: { email: string; displayName: string; password: string; passwordChosenByOwner: boolean },
  ctx: RequestContext = { source: 'cli' },
): Promise<PublicStaff> {
  if ((await activeOwnerCount(db)) > 0) throw new AuthError('CONFLICT', 'an owner exists already: add more owners in the admin');
  const role = await db.role.findUnique({ where: { key: OWNER_ROLE_KEY } });
  if (!role) throw new AuthError('CONFLICT', 'the owner role is missing: run the auth sync first');
  const staff = await createStaff(db, policy, SYSTEM, { email: input.email, displayName: input.displayName, password: input.password }, ctx, {
    passwordChosenByOwner: input.passwordChosenByOwner,
  });
  await assignRole(db, SYSTEM, { staffUserId: staff.id, roleId: role.id, storeId: null }, ctx);
  return staff;
}
