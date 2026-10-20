// PR 15 — staff (admin) sign-in, sessions and two-step login; B6.5 admin access.
//
// - Login: e-mail + password. Every attempt is a StaffLoginEvent row (login alerts, the lockout count). After
//   `loginMaxAttempts` wrong tries within `loginLockoutMinutes` (since the last good login) the account waits; tries
//   during the wait are recorded but do not extend it. An unknown e-mail behaves exactly like a wrong password.
// - Two-step (TOTP): when the staff member has it on, a right password opens a short pending challenge
//   (`twoFactorChallengeMinutes`); the code turns it into a session with a fresh token. A code is accepted once.
//   `staffTwoFactorRequired` (off by default; the owner decides) makes every account set it up before working.
// - Sessions: opaque tokens, stored hashed; they end after `staffSessionIdleMinutes` without use and after
//   `staffSessionMaxHours` in total, on logout, on "log out everywhere", on a password change and when the account is
//   paused. The device list shows each session's browser, address and last use.
// - Login alerts: with `staffLoginAlerts` on, each login writes a SecurityEvent (`staff.login`, or
//   `staff.login.newDevice` for a browser not seen before) for the Telegram alerts (PR 9) to send.
import type { PrismaClient } from '@extas/db/client';
import type { StaffSession, StaffUser } from './db-types';
import type { Vault } from '@extas/vault';
import { audit, clip, securityEvent, type RequestContext } from './audit';
import { AuthError } from './errors';
import { assertStaffPassword, burnPasswordCheck, hashPassword, needsRehash, verifyPassword } from './password';
import type { SecurityPolicy } from './policy';
import { hashToken, isWellFormedToken, newToken, PENDING_PREFIX, pendingHash } from './tokens';
import { newTotpSeed, otpauthUri, base32Encode, verifyTotp } from './totp';

export type SeedVault = Pick<Vault, 'sealValue' | 'openValue'>;

export interface StaffAuthDeps {
  db: PrismaClient;
  policy: SecurityPolicy;
  /** Needed only for two-step login (the seed is encrypted by the vault). */
  vault?: SeedVault | null;
  now?: () => Date;
}

/** Last-seen is written at most this often (technical: it saves a write on every request). */
const TOUCH_EVERY_MS = 60_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export type PublicStaff = Pick<StaffUser, 'id' | 'email' | 'displayName' | 'status' | 'twoFactorEnabled' | 'adminLocale' | 'lastLoginAt' | 'createdAt'>;

export function publicStaff(s: StaffUser): PublicStaff {
  return { id: s.id, email: s.email, displayName: s.displayName, status: s.status, twoFactorEnabled: s.twoFactorEnabled, adminLocale: s.adminLocale, lastLoginAt: s.lastLoginAt, createdAt: s.createdAt };
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export type LoginResult =
  | { kind: 'session'; token: string; expiresAt: Date; staff: PublicStaff }
  | { kind: 'two-factor'; challenge: string; expiresAt: Date }
  | { kind: 'locked'; retryAt: Date }
  | { kind: 'invalid' };

const clock = (deps: StaffAuthDeps) => (deps.now ? deps.now() : new Date());

/** When the account is waiting after too many wrong tries, the moment it accepts tries again; else null. */
export async function lockedUntil(deps: StaffAuthDeps, email: string): Promise<Date | null> {
  const { db, policy } = deps;
  const now = clock(deps);
  const windowStart = new Date(now.getTime() - policy.loginLockoutMinutes * MINUTE);
  const lastGood = await db.staffLoginEvent.findFirst({ where: { email, success: true }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
  const since = lastGood && lastGood.createdAt > windowStart ? lastGood.createdAt : windowStart;
  const failures = await db.staffLoginEvent.findMany({
    where: { email, success: false, createdAt: { gt: since }, NOT: { reason: 'locked' } },
    orderBy: { createdAt: 'desc' },
    take: policy.loginMaxAttempts,
    select: { createdAt: true },
  });
  if (failures.length < policy.loginMaxAttempts) return null;
  return new Date(failures[failures.length - 1]!.createdAt.getTime() + policy.loginLockoutMinutes * MINUTE);
}

async function loginEvent(db: PrismaClient, e: { email: string; staffUserId?: string | null; success: boolean; reason?: string }, ctx: RequestContext, at: Date) {
  await db.staffLoginEvent.create({
    data: { email: e.email, staffUserId: e.staffUserId ?? null, success: e.success, reason: e.reason ?? null, ip: clip(ctx.ip, 64), userAgent: clip(ctx.userAgent), createdAt: at },
  });
}

async function openSession(deps: StaffAuthDeps, staff: StaffUser, ctx: RequestContext, existingId?: string): Promise<LoginResult> {
  const { db, policy } = deps;
  const now = clock(deps);
  const token = newToken();
  const expiresAt = new Date(now.getTime() + policy.staffSessionMaxHours * HOUR);
  const data = { tokenHash: hashToken(token), expiresAt, lastSeenAt: now, createdAt: now, userAgent: clip(ctx.userAgent), ip: clip(ctx.ip, 64) };
  const newDevice = policy.staffLoginAlerts && ctx.userAgent
    ? (await db.staffLoginEvent.count({ where: { staffUserId: staff.id, success: true, userAgent: clip(ctx.userAgent), reason: null } })) === 0
    : false;
  await db.$transaction(async (tx) => {
    if (existingId) await tx.staffSession.update({ where: { id: existingId }, data });
    else await tx.staffSession.create({ data: { staffUserId: staff.id, ...data } });
    await tx.staffUser.update({ where: { id: staff.id }, data: { lastLoginAt: now } });
    await tx.staffLoginEvent.create({ data: { email: staff.email, staffUserId: staff.id, success: true, ip: data.ip, userAgent: data.userAgent, createdAt: now } });
    if (policy.staffLoginAlerts) {
      await securityEvent(tx, newDevice ? 'staff.login.newDevice' : 'staff.login', newDevice ? 'warning' : 'info', {
        staffUserId: staff.id, ip: data.ip, userAgent: data.userAgent, twoFactor: staff.twoFactorEnabled,
      });
    }
  });
  return { kind: 'session', token, expiresAt, staff: publicStaff({ ...staff, lastLoginAt: now }) };
}

export async function loginStaff(deps: StaffAuthDeps, input: { email: string; password: string }, ctx: RequestContext = {}): Promise<LoginResult> {
  const { db, policy } = deps;
  const email = normalizeEmail(input.email ?? '');
  const password = input.password ?? '';
  const now = clock(deps);
  if (!email || email.length > 254 || !password) return { kind: 'invalid' };

  const retryAt = await lockedUntil(deps, email);
  if (retryAt && retryAt > now) {
    await loginEvent(db, { email, success: false, reason: 'locked' }, ctx, now);
    return { kind: 'locked', retryAt };
  }

  const staff = await db.staffUser.findUnique({ where: { email } });
  const tooLong = [...password].length > policy.passwordMaxLength;
  if (!staff || staff.status !== 'ACTIVE' || tooLong) {
    if (!tooLong) await burnPasswordCheck(password);
    await loginEvent(db, { email, staffUserId: staff?.id, success: false, reason: staff ? `status:${staff.status}` : 'unknown' }, ctx, now);
    return { kind: 'invalid' };
  }
  if (!(await verifyPassword(password, staff.passwordHash))) {
    await loginEvent(db, { email, staffUserId: staff.id, success: false, reason: 'password' }, ctx, now);
    return { kind: 'invalid' };
  }
  if (needsRehash(staff.passwordHash)) {
    await db.staffUser.update({ where: { id: staff.id }, data: { passwordHash: await hashPassword(password) } });
  }

  if (staff.twoFactorEnabled) {
    const challenge = newToken();
    const expiresAt = new Date(now.getTime() + policy.twoFactorChallengeMinutes * MINUTE);
    await db.staffSession.create({
      data: { staffUserId: staff.id, tokenHash: pendingHash(challenge), expiresAt, createdAt: now, userAgent: clip(ctx.userAgent), ip: clip(ctx.ip, 64) },
    });
    return { kind: 'two-factor', challenge, expiresAt };
  }
  return openSession(deps, staff, ctx);
}

/** The additional data that binds a sealed two-step seed to its account. */
export const seedAad = (staffUserId: string) => `staff-totp:${staffUserId}`;

async function readSeed(deps: StaffAuthDeps, staff: StaffUser): Promise<Buffer> {
  if (!deps.vault) throw new AuthError('VAULT_NOT_CONFIGURED', 'two-step login needs the vault master key on the server');
  if (!staff.totpCiphertext || !staff.totpIv || !staff.totpAuthTag || staff.totpKeyVersion == null) {
    throw new AuthError('NOT_FOUND', 'two-step login is not set up');
  }
  return deps.vault.openValue(seedAad(staff.id), {
    ciphertext: staff.totpCiphertext, iv: staff.totpIv, authTag: staff.totpAuthTag, keyVersion: staff.totpKeyVersion,
  });
}

/** Checks a code and burns its time step, so the same code never works twice. Returns false on a wrong or used code. */
async function useCode(deps: StaffAuthDeps, staff: StaffUser, code: string, ctx: RequestContext): Promise<boolean> {
  const now = clock(deps);
  const seed = await readSeed(deps, staff);
  const step = verifyTotp(seed, code ?? '', now, deps.policy.totpDriftSteps);
  if (step === null) return false;
  const reason = `totp:${step}`;
  const used = await deps.db.staffLoginEvent.count({ where: { staffUserId: staff.id, reason } });
  if (used > 0) return false;
  await loginEvent(deps.db, { email: staff.email, staffUserId: staff.id, success: true, reason }, ctx, now);
  return true;
}

export async function verifyStaffTwoFactor(deps: StaffAuthDeps, input: { challenge: string; code: string }, ctx: RequestContext = {}): Promise<LoginResult> {
  const { db } = deps;
  const now = clock(deps);
  if (!isWellFormedToken(input.challenge)) return { kind: 'invalid' };
  const pending = await db.staffSession.findUnique({ where: { tokenHash: pendingHash(input.challenge) }, include: { staffUser: true } });
  if (!pending || pending.revokedAt || pending.expiresAt <= now || pending.staffUser.status !== 'ACTIVE') return { kind: 'invalid' };
  const staff = pending.staffUser;
  const retryAt = await lockedUntil(deps, staff.email);
  if (retryAt && retryAt > now) {
    await loginEvent(db, { email: staff.email, staffUserId: staff.id, success: false, reason: 'locked' }, ctx, now);
    return { kind: 'locked', retryAt };
  }
  if (!(await useCode(deps, staff, input.code, ctx))) {
    await loginEvent(db, { email: staff.email, staffUserId: staff.id, success: false, reason: 'totp' }, ctx, now);
    return { kind: 'invalid' };
  }
  return openSession(deps, staff, ctx, pending.id);
}

export interface StaffAuth {
  staff: StaffUser;
  session: StaffSession;
  /** The password was set by someone else (new account, reset): only the password change works until it is changed. */
  mustChangePassword: boolean;
  /** 2FA is required by the owner's setting and this account has not set it up: only the set-up works until then. */
  mustSetUpTwoFactor: boolean;
}

/** The session behind a cookie token, or null when it is missing, ended, idle too long or the account is paused. */
export async function authenticateStaff(deps: StaffAuthDeps, token: string | null | undefined): Promise<StaffAuth | null> {
  if (!isWellFormedToken(token)) return null;
  const { db, policy } = deps;
  const now = clock(deps);
  const session = await db.staffSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { staffUser: true } });
  if (!session || session.revokedAt || session.tokenHash.startsWith(PENDING_PREFIX)) return null;
  const lastUse = (session.lastSeenAt ?? session.createdAt).getTime();
  const tooOld = session.createdAt.getTime() + policy.staffSessionMaxHours * HOUR <= now.getTime();
  const idle = lastUse + policy.staffSessionIdleMinutes * MINUTE <= now.getTime();
  if (session.expiresAt <= now || tooOld || idle || session.staffUser.status !== 'ACTIVE') {
    await db.staffSession.update({ where: { id: session.id }, data: { revokedAt: now } });
    return null;
  }
  if (now.getTime() - lastUse >= TOUCH_EVERY_MS) {
    await db.staffSession.update({ where: { id: session.id }, data: { lastSeenAt: now } });
    session.lastSeenAt = now;
  }
  const { staffUser, ...rest } = session;
  return {
    staff: staffUser,
    session: rest as StaffSession,
    mustChangePassword: staffUser.passwordSetAt == null,
    mustSetUpTwoFactor: policy.staffTwoFactorRequired && !staffUser.twoFactorEnabled,
  };
}

export async function logoutStaff(deps: StaffAuthDeps, token: string | null | undefined): Promise<void> {
  if (!isWellFormedToken(token)) return;
  await deps.db.staffSession.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: clock(deps) } });
}

export interface DeviceView {
  id: string;
  current: boolean;
  userAgent: string | null;
  ip: string | null;
  deviceLabel: string | null;
  createdAt: Date;
  lastSeenAt: Date | null;
  expiresAt: Date;
}

/** The device list: the staff member's live sessions, newest first. */
export async function listStaffSessions(deps: StaffAuthDeps, staffUserId: string, currentSessionId?: string): Promise<DeviceView[]> {
  const now = clock(deps);
  const rows = await deps.db.staffSession.findMany({
    where: { staffUserId, revokedAt: null, expiresAt: { gt: now }, NOT: { tokenHash: { startsWith: PENDING_PREFIX } } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({ id: r.id, current: r.id === currentSessionId, userAgent: r.userAgent, ip: r.ip, deviceLabel: r.deviceLabel, createdAt: r.createdAt, lastSeenAt: r.lastSeenAt, expiresAt: r.expiresAt }));
}

/** Ends one of the staff member's own sessions. */
export async function revokeStaffSession(deps: StaffAuthDeps, staffUserId: string, sessionId: string, ctx: RequestContext = {}): Promise<void> {
  const r = await deps.db.staffSession.updateMany({ where: { id: sessionId, staffUserId, revokedAt: null }, data: { revokedAt: clock(deps) } });
  if (r.count === 0) throw new AuthError('NOT_FOUND', 'no such live session');
  await audit(deps.db, { staffUserId }, { action: 'staff.session.revoke', entityType: 'StaffSession', entityId: sessionId }, ctx);
}

/** "Log out everywhere": ends every session of the account, optionally keeping the one in use. Returns how many. */
export async function logoutEverywhere(deps: StaffAuthDeps, staffUserId: string, opts: { keepSessionId?: string; actorId?: string | null } = {}, ctx: RequestContext = {}): Promise<number> {
  const now = clock(deps);
  const r = await deps.db.staffSession.updateMany({
    where: { staffUserId, revokedAt: null, ...(opts.keepSessionId && { NOT: { id: opts.keepSessionId } }) },
    data: { revokedAt: now },
  });
  await audit(deps.db, { staffUserId: opts.actorId === undefined ? staffUserId : opts.actorId }, {
    action: 'staff.session.revokeAll', entityType: 'StaffUser', entityId: staffUserId, after: { revoked: r.count, keptCurrent: Boolean(opts.keepSessionId) },
  }, ctx);
  return r.count;
}

/**
 * The staff member changes their own password. Every session ends, the one in use included; a fresh session is
 * returned for this device (a new session id after a credential change).
 */
export async function changeStaffPassword(deps: StaffAuthDeps, auth: StaffAuth, input: { current: string; next: string }, ctx: RequestContext = {}): Promise<Extract<LoginResult, { kind: 'session' }>> {
  const { db, policy } = deps;
  const staff = auth.staff;
  if ([...(input.current ?? '')].length > policy.passwordMaxLength || !(await verifyPassword(input.current ?? '', staff.passwordHash))) {
    await loginEvent(db, { email: staff.email, staffUserId: staff.id, success: false, reason: 'password-change' }, ctx, clock(deps));
    throw new AuthError('WRONG_PASSWORD', 'the current password is not right');
  }
  assertStaffPassword(input.next ?? '', policy, { email: staff.email });
  if (await verifyPassword(input.next, staff.passwordHash)) throw new AuthError('WEAK_PASSWORD', 'the new password is the old one', ['same-as-old']);
  const now = clock(deps);
  const passwordHash = await hashPassword(input.next);
  await db.$transaction(async (tx) => {
    await tx.staffUser.update({ where: { id: staff.id }, data: { passwordHash, passwordSetAt: now } });
    await tx.staffSession.updateMany({ where: { staffUserId: staff.id, revokedAt: null }, data: { revokedAt: now } });
    await audit(tx, { staffUserId: staff.id }, { action: 'staff.password.change', entityType: 'StaffUser', entityId: staff.id }, ctx);
    await securityEvent(tx, 'staff.password.changed', 'info', { staffUserId: staff.id, ip: clip(ctx.ip, 64) });
  });
  const fresh = await db.staffUser.findUniqueOrThrow({ where: { id: staff.id } });
  return (await openSession(deps, fresh, ctx)) as Extract<LoginResult, { kind: 'session' }>;
}

/**
 * Step 1 of setting up two-step login: a new seed, kept encrypted and not yet switched on. Returns what the
 * authenticator app needs (the otpauth link for a QR code, and the seed as text for typing in).
 */
export async function beginTotpSetup(deps: StaffAuthDeps, auth: StaffAuth, opts: { issuer: string }, ctx: RequestContext = {}): Promise<{ uri: string; secret: string }> {
  if (!deps.vault) throw new AuthError('VAULT_NOT_CONFIGURED', 'two-step login needs the vault master key on the server');
  if (auth.staff.twoFactorEnabled) throw new AuthError('CONFLICT', 'two-step login is on already; switch it off first');
  const seed = newTotpSeed();
  const sealed = await deps.vault.sealValue(seedAad(auth.staff.id), seed, { service: 'auth', purpose: '2fa setup', actorId: auth.staff.id });
  await deps.db.staffUser.update({
    where: { id: auth.staff.id },
    data: { totpCiphertext: sealed.ciphertext, totpIv: sealed.iv, totpAuthTag: sealed.authTag, totpKeyVersion: sealed.keyVersion, twoFactorEnabled: false },
  });
  await audit(deps.db, { staffUserId: auth.staff.id }, { action: 'staff.2fa.setupStarted', entityType: 'StaffUser', entityId: auth.staff.id }, ctx);
  return { uri: otpauthUri(seed, { issuer: opts.issuer, account: auth.staff.email }), secret: base32Encode(seed) };
}

/** Step 2: the first right code from the app switches two-step login on. */
export async function enableTotp(deps: StaffAuthDeps, auth: StaffAuth, code: string, ctx: RequestContext = {}): Promise<void> {
  const staff = await deps.db.staffUser.findUniqueOrThrow({ where: { id: auth.staff.id } });
  if (staff.twoFactorEnabled) throw new AuthError('CONFLICT', 'two-step login is on already');
  if (!(await useCode(deps, staff, code, ctx))) throw new AuthError('WRONG_CODE', 'the code is not right');
  await deps.db.$transaction(async (tx) => {
    await tx.staffUser.update({ where: { id: staff.id }, data: { twoFactorEnabled: true } });
    await audit(tx, { staffUserId: staff.id }, { action: 'staff.2fa.enable', entityType: 'StaffUser', entityId: staff.id, before: { twoFactorEnabled: false }, after: { twoFactorEnabled: true } }, ctx);
    await securityEvent(tx, 'staff.2fa.enabled', 'info', { staffUserId: staff.id });
  });
}

/** The staff member switches two-step login off with a current code. The seed is destroyed. */
export async function disableTotp(deps: StaffAuthDeps, auth: StaffAuth, code: string, ctx: RequestContext = {}): Promise<void> {
  const staff = await deps.db.staffUser.findUniqueOrThrow({ where: { id: auth.staff.id } });
  if (!staff.twoFactorEnabled) throw new AuthError('CONFLICT', 'two-step login is off');
  if (!(await useCode(deps, staff, code, ctx))) throw new AuthError('WRONG_CODE', 'the code is not right');
  await deps.db.$transaction(async (tx) => {
    await tx.staffUser.update({ where: { id: staff.id }, data: { twoFactorEnabled: false, totpCiphertext: null, totpIv: null, totpAuthTag: null, totpKeyVersion: null } });
    await audit(tx, { staffUserId: staff.id }, { action: 'staff.2fa.disable', entityType: 'StaffUser', entityId: staff.id, before: { twoFactorEnabled: true }, after: { twoFactorEnabled: false } }, ctx);
    await securityEvent(tx, 'staff.2fa.disabled', 'warning', { staffUserId: staff.id, ip: clip(ctx.ip, 64) });
  });
}
