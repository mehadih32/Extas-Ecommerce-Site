// CN-028 · PR 616 — the owner's PIN for the books (docs/RETAIL-ERP-MODEL.md §4.3, §4.4): the actions in
// `PIN_PERMISSIONS` (a shop correction of the books, `books.adjust`; a month closed with differences, re-opened or a year
// signed off, `books.close`) need the key AND the owner's PIN typed at that moment. The key alone is not enough.
//
// - The PIN belongs to an owner (an all-store owner assignment). He sets it himself with his password; it is kept on his
//   own staff row as a scrypt hash (the same hashing as passwords, password.ts) and never anywhere else: not in the audit
//   log, not in an error, not in a log line. A PIN is digits only, at least `minLength` long (setting
//   `books.pin.minLength`), never one digit repeated and never a straight run up or down (123456, 987654).
// - Whoever types it (an owner, or Accounts with the owner beside them) is checked against every active owner's PIN.
//   The wrong tries of that person are counted on their own row; at `maxAttempts` the PIN is locked for that person for
//   `lockMinutes` (settings `books.pin.maxAttempts`, `books.pin.lockMinutes`), even for the right PIN. A right PIN clears
//   the count. Each try takes its number in the database before the hash is checked (one UPDATE … RETURNING), so tries
//   sent at the same moment cannot get past the lock; the last number writes the lock end with it, and a count left at
//   its limit with no lock in force (a crash, a lower limit) counts as an expired lock, so nobody is locked for ever. Every try is in the audit log (`books.pin.ok`, `books.pin.wrong`, `books.pin.locked`) without the PIN.
// The numbers come from the caller (the books read them from settings), so nothing here is a number of its own.
import { OWNER_ROLE_KEY } from './catalogue';
import { AuthError } from './errors';
import { audit, type Actor, type Db, type RequestContext } from './audit';
import { hashPassword, verifyPassword } from './password';
import { isOwner } from './rbac';

export interface PinPolicy {
  minLength: number;
  /** Longest PIN accepted (a PIN is short; a longer text is a mistake). */
  maxLength: number;
  maxAttempts: number;
  lockMinutes: number;
}

export type PinIssue = 'not-digits' | 'too-short' | 'too-long' | 'one-digit' | 'straight-run';

/** Why a PIN is too weak (empty = good). */
export function pinIssues(pin: string, policy: Pick<PinPolicy, 'minLength' | 'maxLength'>): PinIssue[] {
  const out: PinIssue[] = [];
  if (!/^\d+$/.test(pin)) out.push('not-digits');
  if (pin.length < policy.minLength) out.push('too-short');
  if (pin.length > policy.maxLength) out.push('too-long');
  if (/^\d+$/.test(pin) && pin.length > 1) {
    if (/^(\d)\1+$/.test(pin)) out.push('one-digit');
    const steps = [...pin].slice(1).map((c, i) => Number(c) - Number(pin[i]));
    if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) out.push('straight-run');
  }
  return out;
}

/** The owner sets (or changes) his own books PIN, proving it is him with his password. */
export async function setOwnerPin(db: Db, actor: Actor, input: { password: string; pin: string }, policy: PinPolicy, now: Date, ctx: RequestContext = {}): Promise<void> {
  if (!actor.staffUserId || !(await isOwner(db, actor.staffUserId))) throw new AuthError('FORBIDDEN', 'only an owner sets the books PIN');
  const staff = await db.staffUser.findUnique({ where: { id: actor.staffUserId }, select: { id: true, passwordHash: true, status: true } });
  if (!staff || staff.status !== 'ACTIVE') throw new AuthError('FORBIDDEN', 'only an active owner sets the books PIN');
  if (typeof input.password !== 'string' || !(await verifyPassword(input.password, staff.passwordHash))) throw new AuthError('WRONG_PASSWORD', 'the password is not right');
  const pin = typeof input.pin === 'string' ? input.pin.trim() : '';
  const issues = pinIssues(pin, policy);
  if (issues.length) throw new AuthError('WEAK_PIN', 'the PIN is too easy to guess', issues);
  await db.staffUser.update({ where: { id: staff.id }, data: { booksPinHash: await hashPassword(pin), booksPinSetAt: now, booksPinFailures: 0, booksPinLockedTil: null } });
  await audit(db, actor, { action: 'books.pin.set', entityType: 'StaffUser', entityId: staff.id, before: null, after: { setAt: now.toISOString() } }, ctx);
}

/** Whether an owner has a PIN set (for the page: "set your PIN first"). */
export async function ownerPinSet(db: Db): Promise<boolean> {
  const n = await db.staffUser.count({
    where: { booksPinHash: { not: null }, status: 'ACTIVE', roleAssignments: { some: { storeId: null, revokedAt: null, role: { key: OWNER_ROLE_KEY, archivedAt: null } } } },
  });
  return n > 0;
}

/**
 * Checks a typed PIN for one action (`action` and `storeId` go into the audit log, the PIN never does). Answers the
 * owner whose PIN it is; refuses with PIN_REQUIRED (nothing typed), PIN_NOT_SET (no owner has one), PIN_LOCKED (too
 * many wrong tries by this person, for a while) or WRONG_PIN.
 */
export async function verifyOwnerPin(db: Db, actor: Actor, pin: string | null | undefined, policy: PinPolicy, opts: { action: string; storeId: number | null; now: Date; ctx?: RequestContext }): Promise<{ ownerId: string }> {
  const typed = typeof pin === 'string' ? pin.trim() : '';
  if (!typed) throw new AuthError('PIN_REQUIRED', "this needs the owner's PIN");
  if (!actor.staffUserId) throw new AuthError('FORBIDDEN', 'a PIN is typed by a person');
  const me = await db.staffUser.findUnique({ where: { id: actor.staffUserId }, select: { id: true, booksPinLockedTil: true } });
  if (!me) throw new AuthError('FORBIDDEN', 'a PIN is typed by a person');
  const log = (action: string, after: Record<string, unknown>) =>
    audit(db, actor, { action, entityType: 'StaffUser', entityId: me.id, before: null, after: { for: opts.action, ...after }, storeId: opts.storeId }, opts.ctx ?? {});
  const locked = async (): Promise<never> => {
    const row = await db.staffUser.findUnique({ where: { id: me.id }, select: { booksPinLockedTil: true } });
    const until = row?.booksPinLockedTil && row.booksPinLockedTil.getTime() > opts.now.getTime() ? row.booksPinLockedTil.toISOString() : null;
    await log('books.pin.locked', { until });
    throw new AuthError('PIN_LOCKED', 'too many wrong PIN tries; wait and try again', until ? [until] : []);
  };
  const owners = await db.staffUser.findMany({
    where: { booksPinHash: { not: null }, status: 'ACTIVE', roleAssignments: { some: { storeId: null, revokedAt: null, role: { key: OWNER_ROLE_KEY, archivedAt: null } } } },
    select: { id: true, booksPinHash: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!owners.length) throw new AuthError('PIN_NOT_SET', 'the owner has not set a books PIN yet');
  // qa-gate: the try is reserved in the database BEFORE the hash is checked, in one statement. A burst of tries at the
  // same moment cannot all read "not locked" and then all be checked: only `maxAttempts` tries get a number while the
  // person is not locked; every other try is refused at once, the right PIN included.
  // qa-gate round 2: the try that takes the last number writes the lock end in that same statement (a right PIN clears
  // it below), so no moment exists with the count at its limit and no lock in force while a try is being checked. A
  // count found at its limit with no lock in force — a crash between a try and its lock, a lock that ended, or a limit
  // lowered below the count — is an expired lock: the count starts again from this try, never a lock for ever.
  const until = new Date(opts.now.getTime() + policy.lockMinutes * 60_000);
  const [slot] = await db.$queryRaw<{ n: number }[]>`
    UPDATE "StaffUser" SET
      "booksPinFailures" = CASE WHEN "booksPinFailures" >= ${policy.maxAttempts} THEN 1 ELSE "booksPinFailures" + 1 END,
      "booksPinLockedTil" = CASE WHEN (CASE WHEN "booksPinFailures" >= ${policy.maxAttempts} THEN 1 ELSE "booksPinFailures" + 1 END) >= ${policy.maxAttempts} THEN ${until} ELSE NULL END
    WHERE "id" = ${me.id}::uuid AND ("booksPinLockedTil" IS NULL OR "booksPinLockedTil" <= ${opts.now})
    RETURNING "booksPinFailures" AS "n"`;
  if (!slot) return locked();
  for (const o of owners) {
    if (o.booksPinHash && (await verifyPassword(typed, o.booksPinHash))) {
      await db.staffUser.update({ where: { id: me.id }, data: { booksPinFailures: 0, booksPinLockedTil: null } });
      await log('books.pin.ok', { owner: o.id });
      return { ownerId: o.id };
    }
  }
  // The try that reached `maxAttempts` keeps the lock its number wrote (and clears the count for after the lock).
  if (slot.n >= policy.maxAttempts) {
    await db.staffUser.update({ where: { id: me.id }, data: { booksPinFailures: 0, booksPinLockedTil: until } });
    await log('books.pin.locked', { until: until.toISOString(), tries: slot.n });
    throw new AuthError('PIN_LOCKED', 'too many wrong PIN tries; wait and try again', [until.toISOString()]);
  }
  await log('books.pin.wrong', { tries: slot.n });
  throw new AuthError('WRONG_PIN', 'the PIN is not right');
}
