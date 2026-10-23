// PR 130 — signing in (demo 60-account.js PAGES.login; Blueprint D3.15 "Login"), with follow-up 18 (SIM-F-039).
//
// - By SMS code: the number → a one-time code → a session. This is how an account made with an order signs in the
//   first time (it has no password), and how anyone who forgot a password gets in.
// - By password (`account.login.password`): only for a customer who has set his own password in My account. On a device
//   the account has not seen before (`account.login.newDeviceCode`), the password is followed by the SMS code.
// - A device is known by a random token in its own cookie; only the token's hash is kept, on a SecurityEvent
//   (`customer.device.trusted`), for `account.login.deviceDays` after a code sign-in.
// - Wrong passwords pause the number (PR 15's lockout, `security.*`); codes have their own limits (codes.ts).
import { createHash } from 'node:crypto';
import {
  authenticateCustomer,
  changeCustomerPassword,
  checkCustomerPassword,
  logoutCustomer,
  securityPolicy,
  setCustomerPassword,
  startCustomerSession,
  type CustomerAuth,
  type CustomerAuthDeps,
  type RequestContext,
} from '@extas/auth';
import { requestCode, normalPhone, verifyCode, type CodeSent } from './codes';
import { AccountError, checkStoreId, nowOf, setting, type AccountsDeps } from './context';

export const DEVICE_TRUSTED = 'customer.device.trusted';
const DAY = 86_400_000;

export interface Session {
  token: string;
  expiresAt: Date;
  customerId: string;
  sessionId: string;
}

export type PasswordSignIn = { kind: 'session'; session: Session } | { kind: 'code'; sent: CodeSent };

const deviceHash = (token: string) => createHash('sha256').update(`device:${token}`).digest('hex');
const isDeviceToken = (t: string | null | undefined): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(t);

async function authDeps(deps: AccountsDeps, storeId: number): Promise<CustomerAuthDeps> {
  return { db: deps.db, policy: await securityPolicy(deps.settings, { storeId }), now: deps.now };
}

/** The signed-in customer behind a session cookie, for one store (null: none, ended, or another store's). */
export async function currentCustomer(deps: AccountsDeps, token: string | null | undefined, storeId: number): Promise<CustomerAuth | null> {
  if (!token) return null;
  return authenticateCustomer(await authDeps(deps, storeId), token, storeId);
}

/** Whether this browser's device token was seen on a code sign-in of this customer within `deviceDays`. */
export async function isKnownDevice(deps: AccountsDeps, storeId: number, customerId: string, deviceToken: string | null | undefined): Promise<boolean> {
  if (!isDeviceToken(deviceToken)) return false;
  const { deviceDays } = await setting(deps, storeId, 'account.login');
  const since = new Date(nowOf(deps).getTime() - deviceDays * DAY);
  const hit = await deps.db.securityEvent.findFirst({
    where: { storeId, kind: DEVICE_TRUSTED, createdAt: { gt: since }, AND: [{ details: { path: ['customerId'], equals: customerId } }, { details: { path: ['device'], equals: deviceHash(deviceToken) } }] },
    select: { id: true },
  });
  return !!hit;
}

async function rememberDevice(deps: AccountsDeps, storeId: number, customerId: string, deviceToken: string | null | undefined) {
  if (!isDeviceToken(deviceToken)) return;
  await deps.db.securityEvent.create({ data: { storeId, kind: DEVICE_TRUSTED, severity: 'info', details: { customerId, device: deviceHash(deviceToken) }, createdAt: nowOf(deps) } });
}

/** Asks for a sign-in code (the login page's first step). */
export async function askForCode(deps: AccountsDeps, input: { storeId: number; phone: string; lang: 'en' | 'bn'; storeName: string }, ctx: RequestContext = {}): Promise<CodeSent> {
  return requestCode(deps, { ...input, purpose: 'LOGIN', ip: ctx.ip ?? null });
}

/** Signs in with the SMS code: the code proves the number; the device becomes known. */
export async function signInWithCode(
  deps: AccountsDeps,
  input: { storeId: number; phone: string; code: string; deviceToken?: string | null },
  ctx: RequestContext = {},
): Promise<Session> {
  checkStoreId(input.storeId);
  const proven = await verifyCode(deps, input);
  const a = await authDeps(deps, input.storeId);
  const s = await startCustomerSession(a, { storeId: input.storeId, customerId: proven.customerId, deviceLabel: 'code' }, ctx);
  await rememberDevice(deps, input.storeId, proven.customerId, input.deviceToken);
  // A proven number ends any wrong-password pause on it (PR 15 counts from the last `customer.login.ok`).
  await deps.db.securityEvent.create({
    data: { storeId: input.storeId, kind: 'customer.login.ok', severity: 'info', details: { phone: proven.phone, ip: ctx.ip?.slice(0, 64) ?? null, customerId: proven.customerId, method: 'code' }, createdAt: nowOf(deps) },
  });
  return { token: s.token, expiresAt: s.expiresAt, sessionId: s.sessionId, customerId: proven.customerId };
}

/** Signs in with a password the customer set himself; on a new device it asks for the SMS code as well. */
export async function signInWithPassword(
  deps: AccountsDeps,
  input: { storeId: number; phone: string; password: string; deviceToken?: string | null; lang: 'en' | 'bn'; storeName: string },
  ctx: RequestContext = {},
): Promise<PasswordSignIn> {
  checkStoreId(input.storeId);
  const login = await setting(deps, input.storeId, 'account.login');
  if (!login.password) throw new AccountError('NOT_ALLOWED', 'signing in with a password is switched off');
  const phone = normalPhone(input.phone);
  const a = await authDeps(deps, input.storeId);
  const r = await checkCustomerPassword(a, { storeId: input.storeId, phone: phone.e164, password: input.password }, ctx);
  if (r.kind === 'locked') throw new AccountError('RATE_LIMITED', 'too many wrong passwords', [], { retryAfterSeconds: Math.max(1, Math.ceil((r.retryAt.getTime() - nowOf(deps).getTime()) / 1000)) });
  if (r.kind === 'invalid') throw new AccountError('WRONG_PASSWORD', 'the number and password do not match');
  if (login.newDeviceCode && !(await isKnownDevice(deps, input.storeId, r.customerId, input.deviceToken))) {
    const sent = await requestCode(deps, { storeId: input.storeId, phone: phone.e164, purpose: 'NEW_DEVICE', lang: input.lang, storeName: input.storeName, ip: ctx.ip ?? null });
    return { kind: 'code', sent };
  }
  const s = await startCustomerSession(a, { storeId: input.storeId, customerId: r.customerId, deviceLabel: 'password' }, ctx);
  return { kind: 'session', session: { token: s.token, expiresAt: s.expiresAt, sessionId: s.sessionId, customerId: r.customerId } };
}

/** Logs this browser out. */
export async function signOut(deps: AccountsDeps, token: string | null | undefined, storeId: number): Promise<void> {
  await logoutCustomer(await authDeps(deps, storeId), token);
}

/** Whether the signed-in customer has a password of his own (Profile shows "Set" or "Change"). */
export async function hasPassword(deps: AccountsDeps, customerId: string): Promise<boolean> {
  return (await deps.db.customerCredential.count({ where: { customerId } })) > 0;
}

/**
 * Sets the customer's own password (Profile). The first one needs only the signed-in session (he proved the number by
 * code); changing one needs the current one. Every other device is logged out.
 */
export async function setOwnPassword(deps: AccountsDeps, auth: CustomerAuth, input: { current?: string | null; next: string }, ctx: RequestContext = {}): Promise<void> {
  const storeId = auth.customer.storeId;
  const a = await authDeps(deps, storeId);
  // SIM-F-039: the number itself is the first thing anyone would try.
  const own = (auth.customer.phone ?? '').replace(/\D/g, '').slice(-10);
  if (own.length === 10 && String(input.next ?? '').replace(/\D/g, '').includes(own)) {
    throw new AccountError('INVALID_INPUT', 'the password may not be the mobile number', ['next:phone']);
  }
  try {
    if (await hasPassword(deps, auth.customer.id)) await changeCustomerPassword(a, auth, { current: input.current ?? '', next: input.next }, ctx);
    else await setCustomerPassword(a, { storeId, customerId: auth.customer.id, password: input.next, keepSessionId: auth.session.id }, ctx);
  } catch (e) {
    const { code, details } = e as { code?: string; details?: string[] };
    if (code === 'WRONG_PASSWORD') throw new AccountError('WRONG_PASSWORD', 'the current password is not right');
    if (code === 'WEAK_PASSWORD' || code === 'INVALID_INPUT')
      throw new AccountError('INVALID_INPUT', 'the new password does not meet the rules', (details ?? []).map((d) => `next:${d}`), { min: a.policy.customerPasswordMinLength });
    throw e;
  }
}
