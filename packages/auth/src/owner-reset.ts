// PR 15 — the owner's way back in when the admin will not let him sign in (owner, 20 Oct 15:26): run on the server only
// (cli.ts `reset-owner`, through infra/server/bin/extas-owner-reset and owner-reset.yml), never from the web. It gives
// the one active owner account a new random first password that must be changed at the next sign-in, ends its
// sessions and lifts a wrong-try wait. Two-step login, roles and everything else stay as they are. Before it changes
// anything it reads why recent sign-ins failed, so the report can say what went wrong (counts only, never an e-mail).
import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@extas/db/client';
import { audit, SYSTEM, type RequestContext } from './audit';
import { OWNER_ROLE_KEY } from './catalogue';
import { AuthError } from './errors';
import { hashPassword } from './password';
import type { SecurityPolicy } from './policy';
import { lockedUntil } from './staff-auth';

export interface OwnerSignInFindings {
  /** The owner had set his own password before (false = the first password was never changed). */
  ownPasswordSet: boolean;
  twoFactorOn: boolean;
  /** The account was waiting after too many wrong tries when the reset ran. */
  waiting: boolean;
  /** The owner's sign-in tries in the last `hours`, by result: ok, password, locked, … */
  tries: Record<string, number>;
  /** Tries with an e-mail that has no account, all e-mails together (a mistyped e-mail lands here). */
  unknownEmailTries: number;
  lastGoodSignIn: Date | null;
  hours: number;
}

export interface OwnerReset {
  staffUserId: string;
  email: string;
  password: string;
  findings: OwnerSignInFindings;
}

const HOUR = 3_600_000;

export async function resetOwnerPassword(db: PrismaClient, policy: SecurityPolicy, ctx: RequestContext = { source: 'cli' }, hours = 24): Promise<OwnerReset> {
  const owners = await db.staffUser.findMany({
    where: { status: 'ACTIVE', roleAssignments: { some: { storeId: null, revokedAt: null, role: { key: OWNER_ROLE_KEY, archivedAt: null } } } },
  });
  if (owners.length === 0) throw new AuthError('NOT_FOUND', 'no active owner account: make it with create-owner first');
  if (owners.length > 1) throw new AuthError('CONFLICT', 'more than one owner: reset the others from the admin');
  const owner = owners[0]!;
  const now = new Date();
  const since = new Date(now.getTime() - hours * HOUR);

  const events = await db.staffLoginEvent.groupBy({
    by: ['success', 'reason'],
    where: { email: owner.email, createdAt: { gt: since } },
    _count: { _all: true },
  });
  const tries: Record<string, number> = {};
  for (const e of events) {
    const k = e.success ? (e.reason ?? 'ok') : (e.reason ?? 'failed');
    tries[k] = (tries[k] ?? 0) + e._count._all;
  }
  const retryAt = await lockedUntil({ db, policy }, owner.email);
  const lastGood = await db.staffLoginEvent.findFirst({ where: { email: owner.email, success: true, reason: null }, orderBy: { createdAt: 'desc' } });
  const findings: OwnerSignInFindings = {
    ownPasswordSet: owner.passwordSetAt != null,
    twoFactorOn: owner.twoFactorEnabled,
    waiting: retryAt != null && retryAt > now,
    tries,
    unknownEmailTries: await db.staffLoginEvent.count({ where: { success: false, reason: 'unknown', createdAt: { gt: since } } }),
    lastGoodSignIn: lastGood?.createdAt ?? null,
    hours,
  };

  const password = randomBytes(18).toString('base64url');
  const passwordHash = await hashPassword(password);
  await db.$transaction(async (tx) => {
    await tx.staffUser.update({ where: { id: owner.id }, data: { passwordHash, passwordSetAt: null } });
    await tx.staffSession.updateMany({ where: { staffUserId: owner.id, revokedAt: null }, data: { revokedAt: now } });
    // A successful event ends the wrong-try count (lockedUntil counts failures after the last success).
    await tx.staffLoginEvent.create({ data: { email: owner.email, staffUserId: owner.id, success: true, reason: 'reset', ip: null, userAgent: ctx.source ?? 'cli', createdAt: now } });
    await audit(tx, SYSTEM, { action: 'staff.owner.reset', entityType: 'StaffUser', entityId: owner.id, after: { mustChangePassword: true, sessionsEnded: true } }, ctx);
  });
  return { staffUserId: owner.id, email: owner.email, password, findings };
}

/** The findings in plain English, one line each, for the server report. No e-mail, no password. */
export function describeFindings(f: OwnerSignInFindings): string[] {
  const tries = Object.entries(f.tries).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k} ${n}`).join(', ') || 'none';
  return [
    `own password set before: ${f.ownPasswordSet ? 'yes' : 'no (the first password was never changed)'}`,
    `two-step login: ${f.twoFactorOn ? 'on' : 'off'}`,
    `waiting after wrong tries when reset: ${f.waiting ? 'yes' : 'no'}`,
    `owner sign-in tries in the last ${f.hours} h: ${tries}`,
    `tries with an e-mail that has no account (all e-mails), last ${f.hours} h: ${f.unknownEmailTries}`,
    `last good sign-in: ${f.lastGoodSignIn ? f.lastGoodSignIn.toISOString() : 'never'}`,
  ];
}
