// PR 15 — customer accounts: password, login, sessions. Customers belong to one store; so do their sessions.
// The account is created with the first order and its first password is the mobile number (Blueprint D3.13/D3.15,
// PR 129); the customer may change it. The one-time SMS code on a new device, the forgot-password flow and the login
// screens come with PR 130 (they need the SMS adapter); this file is what they build on.
//
// Wrong tries are SecurityEvent rows (`customer.login.failed`, keyed by store + phone; `customer.login.ok` resets) and the same lockout settings as
// staff apply. Sessions last `customerSessionDays` (a store setting) from the login.
import type { PrismaClient } from '@extas/db/client';
import type { Customer, CustomerSession } from './db-types';
import { audit, clip, securityEvent, type RequestContext } from './audit';
import { AuthError } from './errors';
import { assertCustomerPassword, burnPasswordCheck, hashPassword, needsRehash, verifyPassword } from './password';
import type { SecurityPolicy } from './policy';
import { hashToken, isWellFormedToken, newToken } from './tokens';

export interface CustomerAuthDeps {
  db: PrismaClient;
  /** The policy of the customer's store (customer rules are store settings). */
  policy: SecurityPolicy;
  now?: () => Date;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const TOUCH_EVERY_MS = 60_000;
const FAILED = 'customer.login.failed';
const OK = 'customer.login.ok';
/** A try while the login waits: recorded, but it does not extend the wait. */
const LOCKED = 'customer.login.locked';
const clock = (deps: CustomerAuthDeps) => (deps.now ? deps.now() : new Date());

/**
 * Sets a customer's password. `mustChange` marks a password someone else chose (the first one is the mobile number).
 * When the customer changes it themselves, every other session ends.
 */
export async function setCustomerPassword(
  deps: CustomerAuthDeps,
  input: { storeId: number; customerId: string; password: string; mustChange?: boolean; keepSessionId?: string },
  ctx: RequestContext = {},
): Promise<void> {
  const { db, policy } = deps;
  assertCustomerPassword(input.password ?? '', policy);
  const customer = await db.customer.findFirst({ where: { id: input.customerId, storeId: input.storeId } });
  if (!customer) throw new AuthError('NOT_FOUND', 'no such customer in this store');
  const now = clock(deps);
  const passwordHash = await hashPassword(input.password);
  await db.$transaction(async (tx) => {
    await tx.customerCredential.upsert({
      where: { customerId: customer.id },
      create: { storeId: input.storeId, customerId: customer.id, passwordHash, passwordSetAt: now, mustChange: input.mustChange ?? false },
      update: { passwordHash, passwordSetAt: now, mustChange: input.mustChange ?? false },
    });
    if (!input.mustChange) {
      await tx.customerSession.updateMany({
        where: { customerId: customer.id, revokedAt: null, ...(input.keepSessionId && { NOT: { id: input.keepSessionId } }) },
        data: { revokedAt: now },
      });
    }
    await audit(tx, { staffUserId: null }, { action: 'customer.password.set', entityType: 'Customer', entityId: customer.id, storeId: input.storeId }, ctx);
  });
}

export type CustomerLoginResult =
  | { kind: 'session'; token: string; expiresAt: Date; customerId: string; mustChangePassword: boolean }
  | { kind: 'locked'; retryAt: Date }
  | { kind: 'invalid' };

async function customerLockedUntil(deps: CustomerAuthDeps, storeId: number, phone: string): Promise<Date | null> {
  const { db, policy } = deps;
  const now = clock(deps);
  const windowStart = new Date(now.getTime() - policy.loginLockoutMinutes * MINUTE);
  const where = { storeId, details: { path: ['phone'], equals: phone } };
  const lastOk = await db.securityEvent.findFirst({ where: { ...where, kind: OK }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
  const since = lastOk && lastOk.createdAt > windowStart ? lastOk.createdAt : windowStart;
  const rows = await db.securityEvent.findMany({
    where: { ...where, kind: FAILED, createdAt: { gt: since } },
    orderBy: { createdAt: 'desc' },
    take: policy.loginMaxAttempts,
    select: { createdAt: true },
  });
  const failures = rows.map((r) => r.createdAt);
  if (failures.length < policy.loginMaxAttempts) return null;
  return new Date(failures[failures.length - 1]!.getTime() + policy.loginLockoutMinutes * MINUTE);
}

async function event(deps: CustomerAuthDeps, storeId: number, kind: string, details: Record<string, unknown>) {
  await deps.db.securityEvent.create({ data: { storeId, kind, severity: 'info', details: details as object, createdAt: clock(deps) } });
}

/** Login with the phone number as stored on the customer (normalised by the caller) and the password. */
export async function loginCustomer(deps: CustomerAuthDeps, input: { storeId: number; phone: string; password: string }, ctx: RequestContext = {}): Promise<CustomerLoginResult> {
  const { db, policy } = deps;
  const phone = (input.phone ?? '').trim();
  const password = input.password ?? '';
  const now = clock(deps);
  if (!phone || phone.length > 32 || !password) return { kind: 'invalid' };
  const ip = clip(ctx.ip, 64);

  const retryAt = await customerLockedUntil(deps, input.storeId, phone);
  if (retryAt && retryAt > now) {
    await event(deps, input.storeId, LOCKED, { phone, ip });
    return { kind: 'locked', retryAt };
  }
  const customer = await db.customer.findUnique({ where: { storeId_phone: { storeId: input.storeId, phone } }, include: { credential: true } });
  const tooLong = [...password].length > policy.passwordMaxLength;
  if (!customer?.credential || customer.archivedAt || customer.erasedAt || tooLong) {
    if (!tooLong) await burnPasswordCheck(password);
    await event(deps, input.storeId, FAILED, { phone, ip });
    return { kind: 'invalid' };
  }
  if (!(await verifyPassword(password, customer.credential.passwordHash))) {
    await event(deps, input.storeId, FAILED, { phone, ip, customerId: customer.id });
    return { kind: 'invalid' };
  }
  if (needsRehash(customer.credential.passwordHash)) {
    await db.customerCredential.update({ where: { id: customer.credential.id }, data: { passwordHash: await hashPassword(password) } });
  }
  const token = newToken();
  const expiresAt = new Date(now.getTime() + policy.customerSessionDays * DAY);
  await db.$transaction(async (tx) => {
    await tx.customerSession.create({
      data: { storeId: input.storeId, customerId: customer.id, tokenHash: hashToken(token), expiresAt, lastSeenAt: now, createdAt: now, userAgent: clip(ctx.userAgent), ip },
    });
    await tx.securityEvent.create({ data: { storeId: input.storeId, kind: OK, severity: 'info', details: { phone, ip, customerId: customer.id }, createdAt: now } });
  });
  return { kind: 'session', token, expiresAt, customerId: customer.id, mustChangePassword: customer.credential.mustChange };
}

export interface CustomerAuth {
  customer: Customer;
  session: CustomerSession;
}

/** The session behind a cookie token, for one store; null when missing, ended or from another store. */
export async function authenticateCustomer(deps: CustomerAuthDeps, token: string | null | undefined, storeId: number): Promise<CustomerAuth | null> {
  if (!isWellFormedToken(token)) return null;
  const now = clock(deps);
  const session = await deps.db.customerSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { customer: true } });
  if (!session || session.storeId !== storeId || session.revokedAt) return null;
  const tooOld = session.createdAt.getTime() + deps.policy.customerSessionDays * DAY <= now.getTime();
  if (session.expiresAt <= now || tooOld || session.customer.archivedAt || session.customer.erasedAt) {
    await deps.db.customerSession.update({ where: { id: session.id }, data: { revokedAt: now } });
    return null;
  }
  const lastUse = (session.lastSeenAt ?? session.createdAt).getTime();
  if (now.getTime() - lastUse >= TOUCH_EVERY_MS) {
    await deps.db.customerSession.update({ where: { id: session.id }, data: { lastSeenAt: now } });
    session.lastSeenAt = now;
  }
  const { customer, ...rest } = session;
  return { customer, session: rest as CustomerSession };
}

export async function logoutCustomer(deps: CustomerAuthDeps, token: string | null | undefined): Promise<void> {
  if (!isWellFormedToken(token)) return;
  await deps.db.customerSession.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: clock(deps) } });
}

/** The customer's devices, newest first. */
export async function listCustomerSessions(deps: CustomerAuthDeps, customerId: string, currentSessionId?: string) {
  const rows = await deps.db.customerSession.findMany({
    where: { customerId, revokedAt: null, expiresAt: { gt: clock(deps) } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({ id: r.id, current: r.id === currentSessionId, userAgent: r.userAgent, ip: r.ip, createdAt: r.createdAt, lastSeenAt: r.lastSeenAt, expiresAt: r.expiresAt }));
}

/** "Log out of all devices" in My account. */
export async function logoutCustomerEverywhere(deps: CustomerAuthDeps, customerId: string, opts: { keepSessionId?: string } = {}): Promise<number> {
  const r = await deps.db.customerSession.updateMany({
    where: { customerId, revokedAt: null, ...(opts.keepSessionId && { NOT: { id: opts.keepSessionId } }) },
    data: { revokedAt: clock(deps) },
  });
  return r.count;
}

/** The customer changes their own password (My account): the current one is checked; other devices are logged out. */
export async function changeCustomerPassword(deps: CustomerAuthDeps, auth: CustomerAuth, input: { current: string; next: string }, ctx: RequestContext = {}): Promise<void> {
  const cred = await deps.db.customerCredential.findUnique({ where: { customerId: auth.customer.id } });
  const current = input.current ?? '';
  if (!cred || [...current].length > deps.policy.passwordMaxLength || !(await verifyPassword(current, cred.passwordHash))) {
    throw new AuthError('WRONG_PASSWORD', 'the current password is not right');
  }
  await setCustomerPassword(deps, { storeId: auth.customer.storeId, customerId: auth.customer.id, password: input.next, keepSessionId: auth.session.id }, ctx);
  await securityEvent(deps.db, 'customer.password.changed', 'info', { customerId: auth.customer.id, ip: clip(ctx.ip, 64) }, auth.customer.storeId);
}
