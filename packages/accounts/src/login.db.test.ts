// S04 · PR 130 — signing in on a real PostgreSQL (throwaway database; skipped without TEST_DATABASE_ADMIN_URL), with the
// mock SMS sender. Required acceptance test (CN-017) SIM-F-039: an account made with an order opens only with the SMS
// code to its number, never with the number as a password. Follow-up 18. Every value is a made-up test value.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mockSmsOutbox } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { askForCode, currentCustomer, isKnownDevice, requestCode, setOwnPassword, signInWithCode, signInWithPassword, signOut, verifyCode } from './index';
import { setUpAccounts, type AccountsFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}
async function data(p: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await p;
    return {};
  } catch (e) {
    return (e as { data?: Record<string, unknown> }).data ?? {};
  }
}

const P = '+8801700000130';
const TYPED = '01700-000130';
const DEVICE = 'device-token-for-the-tests-0000000000000001';
const CTX = { ip: '192.0.2.10', userAgent: 'test' };
const SHOP = { lang: 'en' as const, storeName: 'Sample Shop' };

describe.skipIf(!HAS_TEST_DB)('PR 130 · signing in (SIM-F-039)', () => {
  let f: AccountsFixture;
  let me: { id: string };

  beforeAll(async () => {
    f = await setUpAccounts('accounts_login');
    me = await f.customer(P);
  });
  afterAll(async () => f?.t.drop());
  beforeEach(() => {
    f.overrides.clear();
    f.advance(2 * 3_600_000); // every test starts outside the last one's hour limits
  });

  it('the SMS code signs an order account in: the code goes by SMS, is never stored in clear, and works once', async () => {
    mockSmsOutbox.clear();
    const sent = await askForCode(f.deps(), { storeId: f.A, phone: TYPED, ...SHOP }, CTX);
    expect(sent).toMatchObject({ phone: TYPED, length: 6, mock: true, resendSeconds: 60 });
    const c = f.lastCode(P)!;
    expect(c).toMatch(/^\d{6}$/);
    expect(mockSmsOutbox.lastTo(P)?.text).toContain('Sample Shop');
    const rows = await f.t.prisma.otpChallenge.findMany({ where: { phone: P } });
    expect(JSON.stringify(rows)).not.toContain(c);
    const log = await f.t.prisma.notificationLog.findMany({ where: { recipient: P } });
    expect(log).toHaveLength(1);
    expect(JSON.stringify(log)).not.toContain(c);
    expect(log[0]).toMatchObject({ channel: 'SMS', status: 'SENT', customerId: me.id });

    const s = await signInWithCode(f.deps(), { storeId: f.A, phone: TYPED, code: c, deviceToken: DEVICE }, CTX);
    expect((await currentCustomer(f.deps(), s.token, f.A))?.customer.id).toBe(me.id);
    expect(await currentCustomer(f.deps(), s.token, f.B)).toBeNull();
    expect(await code(signInWithCode(f.deps(), { storeId: f.A, phone: TYPED, code: c }, CTX))).toBe('WRONG_CODE');
    expect(await isKnownDevice(f.deps(), f.A, me.id, DEVICE)).toBe(true);
    await signOut(f.deps(), s.token, f.A);
    expect(await currentCustomer(f.deps(), s.token, f.A)).toBeNull();
  });

  it('SIM-F-039 security test: the number as the password never opens the account', async () => {
    for (const password of [P, '8801700000130', '01700000130', TYPED, '1700000130'])
      expect(await code(signInWithPassword(f.deps(), { storeId: f.A, phone: TYPED, password, ...SHOP }, CTX))).toBe('WRONG_PASSWORD');
    expect(await f.t.prisma.customerCredential.count({ where: { customerId: me.id } })).toBe(0);
  });

  it('a wrong code counts down and wears the code out; a new code ends the old one; codes expire', async () => {
    await requestCode(f.deps(), { storeId: f.A, phone: P, purpose: 'LOGIN', ...SHOP });
    const good = f.lastCode(P)!;
    const bad = good === '000000' ? '111111' : '000000';
    expect(await data(verifyCode(f.deps(), { storeId: f.A, phone: P, code: bad }))).toEqual({ left: 4 });
    for (let i = 0; i < 4; i++) await code(verifyCode(f.deps(), { storeId: f.A, phone: P, code: bad }));
    expect(await code(verifyCode(f.deps(), { storeId: f.A, phone: P, code: good }))).toBe('WRONG_CODE');

    f.advance(61_000);
    await requestCode(f.deps(), { storeId: f.A, phone: P, purpose: 'LOGIN', ...SHOP });
    const first = f.lastCode(P)!;
    f.advance(61_000);
    await requestCode(f.deps(), { storeId: f.A, phone: P, purpose: 'LOGIN', ...SHOP });
    const second = f.lastCode(P)!;
    if (first !== second) expect(await code(verifyCode(f.deps(), { storeId: f.A, phone: P, code: first }))).toBe('WRONG_CODE');
    f.advance(11 * 60_000);
    expect(await code(verifyCode(f.deps(), { storeId: f.A, phone: P, code: second }))).toBe('WRONG_CODE');
  });

  it('review R2 (security m2): parallel guesses are compared at most maxTries times between them; then the code is worn out', async () => {
    f.advance(61_000);
    await requestCode(f.deps(), { storeId: f.A, phone: P, purpose: 'LOGIN', ...SHOP });
    const good = f.lastCode(P)!;
    const bad = good === '000000' ? '111111' : '000000';
    const answers = await Promise.all(Array.from({ length: 20 }, () => data(verifyCode(f.deps(), { storeId: f.A, phone: P, code: bad }))));
    // each try taken has its own count: 4, 3, 2, 1 left once each, and the rest (with the fifth try) none left
    const left = answers.map((a) => (a as { left: number }).left).sort((x, y) => y - x);
    expect(left).toEqual([4, 3, 2, 1, ...Array(16).fill(0)]);
    const ch = await f.t.prisma.otpChallenge.findFirstOrThrow({ where: { phone: P, consumedAt: null }, orderBy: { createdAt: 'desc' } });
    expect(ch.attempts).toBe(5);
    // the right code now finds no try left
    expect(await code(verifyCode(f.deps(), { storeId: f.A, phone: P, code: good }))).toBe('WRONG_CODE');
  });

  it('rate limits: a wait between codes, so many per number and per address in an hour', async () => {
    f.overrides.set('account.code.limits', { length: 6, minutes: 10, maxTries: 5, resendSeconds: 60, perPhoneHour: 3, perIpHour: 4 });
    await requestCode(f.deps(), { storeId: f.A, phone: P, purpose: 'LOGIN', ...SHOP, ip: '192.0.2.20' });
    expect(await code(requestCode(f.deps(), { storeId: f.A, phone: P, purpose: 'LOGIN', ...SHOP }))).toBe('RATE_LIMITED');
    expect((await data(requestCode(f.deps(), { storeId: f.A, phone: P, purpose: 'LOGIN', ...SHOP }))).retryAfterSeconds).toBe(60);
    for (let i = 0; i < 2; i++) {
      f.advance(61_000);
      await requestCode(f.deps(), { storeId: f.A, phone: P, purpose: 'LOGIN', ...SHOP, ip: '192.0.2.20' });
    }
    f.advance(61_000);
    expect(await code(requestCode(f.deps(), { storeId: f.A, phone: P, purpose: 'LOGIN', ...SHOP }))).toBe('RATE_LIMITED');
    // the same address asking for other numbers
    await requestCode(f.deps(), { storeId: f.A, phone: '+8801700000140', purpose: 'LOGIN', ...SHOP, ip: '192.0.2.20' });
    expect(await code(requestCode(f.deps(), { storeId: f.A, phone: '+8801700000141', purpose: 'LOGIN', ...SHOP, ip: '192.0.2.20' }))).toBe('RATE_LIMITED');
  });

  it('a number with no account gets the same answer, no SMS, and no code can open anything', async () => {
    mockSmsOutbox.clear();
    const sent = await askForCode(f.deps(), { storeId: f.A, phone: '01700000142', ...SHOP }, CTX);
    expect(sent).toMatchObject({ phone: '01700-000142', mock: true });
    expect(mockSmsOutbox.all()).toHaveLength(0);
    expect(await code(signInWithCode(f.deps(), { storeId: f.A, phone: '01700000142', code: '123456' }, CTX))).toBe('WRONG_CODE');
    expect(await f.t.prisma.customer.count({ where: { phone: '+8801700000142' } })).toBe(0);
  });

  it('a password he set himself works, asks for the code on a new device, and is never the number', async () => {
    const s = await signInWithCode(f.deps(), { storeId: f.A, phone: P, code: await (async () => (await requestCode(f.deps(), { storeId: f.A, phone: P, purpose: 'LOGIN', ...SHOP }), f.lastCode(P)!))() }, CTX);
    const auth = (await currentCustomer(f.deps(), s.token, f.A))!;
    expect(await code(setOwnPassword(f.deps(), auth, { next: 'my 01700000130 pass' }))).toBe('INVALID_INPUT');
    expect(await code(setOwnPassword(f.deps(), auth, { next: 'short' }))).toBe('INVALID_INPUT');
    await setOwnPassword(f.deps(), auth, { next: 'a long sample sentence' }, CTX);
    expect(await code(setOwnPassword(f.deps(), auth, { current: 'wrong one here', next: 'another long sentence' }))).toBe('WRONG_PASSWORD');

    // a known device: straight in
    const known = await signInWithPassword(f.deps(), { storeId: f.A, phone: TYPED, password: 'a long sample sentence', deviceToken: DEVICE, ...SHOP }, CTX);
    expect(known.kind).toBe('session');
    // a new device: the code as well
    f.advance(61_000);
    const fresh = await signInWithPassword(f.deps(), { storeId: f.A, phone: TYPED, password: 'a long sample sentence', deviceToken: 'another-device-token-000000000000000000002', ...SHOP }, CTX);
    expect(fresh.kind).toBe('code');
    const c = f.lastCode(P)!;
    const s2 = await signInWithCode(f.deps(), { storeId: f.A, phone: TYPED, code: c, deviceToken: 'another-device-token-000000000000000000002' }, CTX);
    expect(s2.customerId).toBe(me.id);
    // the new-device code switched off: the password alone
    f.overrides.set('account.login', { password: true, newDeviceCode: false, deviceDays: 90 });
    expect((await signInWithPassword(f.deps(), { storeId: f.A, phone: TYPED, password: 'a long sample sentence', ...SHOP }, CTX)).kind).toBe('session');
    // password sign-in switched off
    f.overrides.set('account.login', { password: false, newDeviceCode: true, deviceDays: 90 });
    expect(await code(signInWithPassword(f.deps(), { storeId: f.A, phone: TYPED, password: 'a long sample sentence', ...SHOP }, CTX))).toBe('NOT_ALLOWED');
  });

  it('wrong passwords pause the number; a code sign-in ends the pause', async () => {
    const other = '+8801700000143';
    await f.customer(other);
    for (let i = 0; i < 5; i++) await code(signInWithPassword(f.deps(), { storeId: f.A, phone: other, password: `wrong-${i}-xxxxxxxx`, ...SHOP }, CTX));
    expect(await code(signInWithPassword(f.deps(), { storeId: f.A, phone: other, password: 'anything at all here', ...SHOP }, CTX))).toBe('RATE_LIMITED');
    await requestCode(f.deps(), { storeId: f.A, phone: other, purpose: 'LOGIN', ...SHOP });
    await signInWithCode(f.deps(), { storeId: f.A, phone: other, code: f.lastCode(other)! }, CTX);
    expect(await code(signInWithPassword(f.deps(), { storeId: f.A, phone: other, password: 'anything at all here', ...SHOP }, CTX))).toBe('WRONG_PASSWORD');
  });

  it('a failed SMS keeps no usable code and says so', async () => {
    const d = f.deps();
    const broken = { ...d, sms: async () => ({ sender: { send: async () => ({ ok: false as const, error: 'gateway down' }) }, mode: 'LIVE' as const }) };
    expect(await code(requestCode(broken, { storeId: f.A, phone: P, purpose: 'LOGIN', ...SHOP }))).toBe('SMS_FAILED');
    const log = await f.t.prisma.notificationLog.findFirst({ where: { recipient: P, status: 'FAILED' } });
    expect(log?.error).toBe('gateway down');
  });
});
