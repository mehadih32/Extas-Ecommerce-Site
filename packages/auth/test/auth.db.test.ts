// Staff and customer sign-in, the permission model and the role builder on a real PostgreSQL (a throwaway database
// per file; skipped without TEST_DATABASE_ADMIN_URL). Sample data only.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createVault } from '@extas/vault';
import {
  assignRole,
  authenticateCustomer,
  authenticateStaff,
  base32Decode,
  beginTotpSetup,
  can,
  changeCustomerPassword,
  changeStaffPassword,
  counterAt,
  createFirstOwner,
  createRole,
  createStaff,
  defaultSecurityPolicy,
  disableTotp,
  enableTotp,
  listRoles,
  listStaff,
  listStaffSessions,
  loginCustomer,
  startCustomerSession,
  loginStaff,
  logoutEverywhere,
  logoutStaff,
  permissionsFor,
  PERMISSION_KEYS,
  resetStaffTwoFactor,
  revokeRole,
  setCustomerPassword,
  setRoleArchived,
  syncAuth,
  totpAt,
  updateRole,
  updateStaff,
  verifyStaffTwoFactor,
  type Actor,
  type AuthErrorCode,
  type LoginResult,
  type StaffAuthDeps,
} from '../src';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '../src/testing';

const OWNER_PW = 'a long sentence for the tests';
const STAFF_PW = 'first password from the owner';
const CTX = { ip: '192.0.2.10', userAgent: 'SampleBrowser/1.0', source: 'test' };

async function code(p: Promise<unknown>): Promise<AuthErrorCode | 'ok'> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: AuthErrorCode }).code ?? (String(e) as AuthErrorCode);
  }
}

function session(r: LoginResult) {
  if (r.kind !== 'session') throw new Error(`expected a session, got ${r.kind}`);
  return r;
}

describe.skipIf(!HAS_TEST_DB)('auth on PostgreSQL (PR 15, 16, 495)', () => {
  let t: TestDatabase;
  let stores: [number, number];
  let clock = new Date('2026-10-20T06:00:00Z');
  const policy = defaultSecurityPolicy();
  const deps = (): StaffAuthDeps => ({ db: t.prisma, policy, vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')), now: () => clock });
  const advance = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };
  let owner: Actor;
  let ownerToken: string;

  beforeAll(async () => {
    t = await createTestDatabase('auth');
    stores = await seedSampleStores(t.prisma);
  });
  afterAll(async () => t?.drop());

  it('the sync writes the catalogue and an owner role holding every permission; again it changes nothing', async () => {
    const first = await syncAuth(t.prisma);
    expect(first.status).toBe('applied');
    expect(first.ownerRoleCreated).toBe(true);
    expect(first.ownerGranted).toHaveLength(PERMISSION_KEYS.length);
    const again = await syncAuth(t.prisma);
    expect(again.status).toBe('unchanged');
    const ownerRole = (await listRoles(t.prisma)).find((r) => r.isOwner)!;
    expect(ownerRole.permissions.sort()).toEqual([...PERMISSION_KEYS].sort());
    expect(await t.prisma.permission.count()).toBe(PERMISSION_KEYS.length);
    // A row left over from an older catalogue is kept and reported, never deleted.
    await t.prisma.permission.create({ data: { key: 'old.thing', group: 'old', labelEn: 'Old', labelBn: 'পুরনো' } });
    expect((await syncAuth(t.prisma)).permissionsRetired).toEqual(['old.thing']);
  });

  it('creates the first owner once (no owner data in the repo: typed in on the server)', async () => {
    const s = await createFirstOwner(t.prisma, policy, { email: 'Owner@Example.com ', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    expect(s.email).toBe('owner@example.com');
    owner = { staffUserId: s.id };
    expect(await code(createFirstOwner(t.prisma, policy, { email: 'other@example.com', displayName: 'x', password: OWNER_PW, passwordChosenByOwner: true }))).toBe('CONFLICT');
    const perms = await permissionsFor(t.prisma, s.id, { storeId: stores[1] });
    expect(perms.size).toBe(PERMISSION_KEYS.length);
  });

  it('logs in with e-mail and password; the session token is stored only hashed', async () => {
    const r = session(await loginStaff(deps(), { email: 'owner@example.com', password: OWNER_PW }, CTX));
    ownerToken = r.token;
    const row = await t.prisma.staffSession.findFirstOrThrow({ where: { staffUserId: owner.staffUserId! } });
    expect(row.tokenHash).not.toContain(r.token);
    expect(row.ip).toBe(CTX.ip);
    const auth = await authenticateStaff(deps(), r.token);
    expect(auth?.staff.id).toBe(owner.staffUserId);
    expect(auth?.mustChangePassword).toBe(false);
    expect(auth?.mustSetUpTwoFactor).toBe(false);
    // The first login from this browser is a new-device alert; the next one is a normal login alert.
    const kinds = (await t.prisma.securityEvent.findMany({ orderBy: { createdAt: 'asc' } })).map((e) => e.kind);
    expect(kinds).toContain('staff.login.newDevice');
    session(await loginStaff(deps(), { email: 'owner@example.com', password: OWNER_PW }, CTX));
    expect((await t.prisma.securityEvent.findMany({ where: { kind: 'staff.login' } })).length).toBe(1);
  });

  it('a wrong password and an unknown e-mail look the same; too many wrong tries pause the login, then it works again', async () => {
    advance(1_000); // after the last good login (events of the same millisecond do not count against it)
    expect((await loginStaff(deps(), { email: 'owner@example.com', password: 'wrong' }, CTX)).kind).toBe('invalid');
    expect((await loginStaff(deps(), { email: 'nobody@example.com', password: 'wrong' }, CTX)).kind).toBe('invalid');
    for (let i = 1; i < policy.loginMaxAttempts; i++) await loginStaff(deps(), { email: 'owner@example.com', password: `wrong-${i}` }, CTX);
    const locked = await loginStaff(deps(), { email: 'owner@example.com', password: OWNER_PW }, CTX);
    expect(locked.kind).toBe('locked');
    // Tries while paused do not extend the pause.
    advance(60_000);
    await loginStaff(deps(), { email: 'owner@example.com', password: 'wrong again' }, CTX);
    advance(policy.loginLockoutMinutes * 60_000);
    session(await loginStaff(deps(), { email: 'owner@example.com', password: OWNER_PW }, CTX));
  });

  it('sessions end when idle too long, when too old, on logout and on "log out everywhere"', async () => {
    const d = deps();
    const a = session(await loginStaff(d, { email: 'owner@example.com', password: OWNER_PW }, CTX));
    advance((policy.staffSessionIdleMinutes - 1) * 60_000);
    expect(await authenticateStaff(d, a.token)).not.toBeNull();
    advance((policy.staffSessionIdleMinutes - 1) * 60_000);
    expect(await authenticateStaff(d, a.token)).not.toBeNull(); // used just now, so not idle
    advance((policy.staffSessionIdleMinutes + 1) * 60_000);
    expect(await authenticateStaff(d, a.token)).toBeNull(); // idle

    const b = session(await loginStaff(d, { email: 'owner@example.com', password: OWNER_PW }, CTX));
    for (let used = 0; used < policy.staffSessionMaxHours * 60; used += policy.staffSessionIdleMinutes - 5) {
      advance((policy.staffSessionIdleMinutes - 5) * 60_000);
      await authenticateStaff(d, b.token);
    }
    expect(await authenticateStaff(d, b.token)).toBeNull(); // older than the maximum

    const c = session(await loginStaff(d, { email: 'owner@example.com', password: OWNER_PW }, CTX));
    await logoutStaff(d, c.token);
    expect(await authenticateStaff(d, c.token)).toBeNull();

    const e1 = session(await loginStaff(d, { email: 'owner@example.com', password: OWNER_PW }, CTX));
    const e2 = session(await loginStaff(d, { email: 'owner@example.com', password: OWNER_PW }, { ...CTX, userAgent: 'OtherBrowser/2.0' }));
    const me = (await authenticateStaff(d, e1.token))!;
    const devices = await listStaffSessions(d, owner.staffUserId!, me.session.id);
    expect(devices.length).toBeGreaterThanOrEqual(2);
    expect(devices.filter((x) => x.current)).toHaveLength(1);
    expect(await logoutEverywhere(d, owner.staffUserId!, { keepSessionId: me.session.id }, CTX)).toBeGreaterThanOrEqual(1);
    expect(await authenticateStaff(d, e2.token)).toBeNull();
    ownerToken = e1.token;
    expect(await authenticateStaff(d, ownerToken)).not.toBeNull();
  });

  it('two-step login: set up with the vault, code needed at login, a code works only once', async () => {
    const d = deps();
    const auth = (await authenticateStaff(d, ownerToken))!;
    const setup = await beginTotpSetup(d, auth, { issuer: 'Sample shop' }, CTX);
    const seed = base32Decode(setup.secret);
    const stored = await t.prisma.staffUser.findUniqueOrThrow({ where: { id: owner.staffUserId! } });
    expect(Buffer.from(stored.totpCiphertext!).equals(seed)).toBe(false);
    expect(await code(enableTotp(d, auth, '000000', CTX))).toBe('WRONG_CODE');
    advance(31_000);
    await enableTotp(d, auth, totpAt(seed, counterAt(clock)), CTX);

    const step1 = await loginStaff(d, { email: 'owner@example.com', password: OWNER_PW }, CTX);
    expect(step1.kind).toBe('two-factor');
    if (step1.kind !== 'two-factor') return;
    // The pending challenge is not a session.
    expect(await authenticateStaff(d, step1.challenge)).toBeNull();
    // The code used to switch it on is spent.
    expect((await verifyStaffTwoFactor(d, { challenge: step1.challenge, code: totpAt(seed, counterAt(clock)) }, CTX)).kind).toBe('invalid');
    advance(31_000);
    const ok = session(await verifyStaffTwoFactor(d, { challenge: step1.challenge, code: totpAt(seed, counterAt(clock)) }, CTX));
    expect((await authenticateStaff(d, ok.token))?.staff.id).toBe(owner.staffUserId);
    // The challenge became the session: it cannot be used a second time.
    expect((await verifyStaffTwoFactor(d, { challenge: step1.challenge, code: totpAt(seed, counterAt(clock)) }, CTX)).kind).toBe('invalid');
    ownerToken = ok.token;

    // An expired challenge does not open.
    const late = await loginStaff(d, { email: 'owner@example.com', password: OWNER_PW }, CTX);
    if (late.kind !== 'two-factor') throw new Error('expected two-factor');
    advance((policy.twoFactorChallengeMinutes + 1) * 60_000);
    expect((await verifyStaffTwoFactor(d, { challenge: late.challenge, code: totpAt(seed, counterAt(clock)) }, CTX)).kind).toBe('invalid');

    // Switching it off needs a current code.
    const me = (await authenticateStaff(d, ownerToken))!;
    advance(31_000);
    await disableTotp(d, me, totpAt(seed, counterAt(clock)), CTX);
    expect((await t.prisma.staffUser.findUniqueOrThrow({ where: { id: owner.staffUserId! } })).totpCiphertext).toBeNull();
  });

  it('the owner setting makes 2FA required: the account is told to set it up', async () => {
    const strict = { ...deps(), policy: defaultSecurityPolicy({ staffTwoFactorRequired: true }) };
    expect((await authenticateStaff(strict, ownerToken))?.mustSetUpTwoFactor).toBe(true);
    expect((await authenticateStaff(deps(), ownerToken))?.mustSetUpTwoFactor).toBe(false);
  });

  let managerId: string;
  let managerToken: string;
  let supportRoleId: string;

  it('role builder: the owner builds a role from the catalogue; nobody grants what they do not hold', async () => {
    const managerRole = await createRole(t.prisma, owner, { nameEn: 'Manager', nameBn: 'ম্যানেজার', permissions: ['settings.read', 'roles.read', 'roles.manage', 'staff.read', 'staff.manage'] }, CTX);
    expect(managerRole.key).toBe('manager');
    expect(await code(createRole(t.prisma, owner, { key: 'manager', nameEn: 'Again', nameBn: 'আবার', permissions: [] }))).toBe('CONFLICT');
    expect(await code(createRole(t.prisma, owner, { nameEn: 'Bad', nameBn: 'ভুল', permissions: ['no.such'] }))).toBe('INVALID_INPUT');

    const m = await createStaff(t.prisma, policy, owner, { email: 'manager@example.com', displayName: 'Sample manager', password: STAFF_PW }, CTX);
    managerId = m.id;
    await assignRole(t.prisma, owner, { staffUserId: m.id, roleId: managerRole.id, storeId: null }, CTX);
    const manager: Actor = { staffUserId: m.id };

    // The manager may build roles, but only from permissions the manager holds.
    expect(await code(createRole(t.prisma, manager, { nameEn: 'Keys', nameBn: 'চাবি', permissions: ['vault.write'] }))).toBe('ESCALATION');
    const support = await createRole(t.prisma, manager, { nameEn: 'Support', nameBn: 'সাপোর্ট', permissions: ['settings.read'] }, CTX);
    supportRoleId = support.id;
    // … cannot touch the owner role or give it out …
    const ownerRole = (await listRoles(t.prisma)).find((r) => r.isOwner)!;
    expect(await code(updateRole(t.prisma, manager, ownerRole.id, { nameEn: 'Boss' }))).toBe('ESCALATION');
    expect(await code(assignRole(t.prisma, manager, { staffUserId: m.id, roleId: ownerRole.id, storeId: null }))).toBe('ESCALATION');
    // … and nobody edits the owner role's permissions or archives it.
    expect(await code(updateRole(t.prisma, owner, ownerRole.id, { permissions: ['settings.read'] }))).toBe('SYSTEM_ROLE');
    expect(await code(setRoleArchived(t.prisma, owner, ownerRole.id, true))).toBe('SYSTEM_ROLE');
    // A new account must change the password the owner gave it.
    const r = session(await loginStaff(deps(), { email: 'manager@example.com', password: STAFF_PW }, CTX));
    const auth = (await authenticateStaff(deps(), r.token))!;
    expect(auth.mustChangePassword).toBe(true);
    const fresh = await changeStaffPassword(deps(), auth, { current: STAFF_PW, next: 'picked by me for this job' }, CTX);
    expect(await authenticateStaff(deps(), r.token)).toBeNull(); // old session ended
    managerToken = fresh.token;
    expect((await authenticateStaff(deps(), managerToken))?.mustChangePassword).toBe(false);
    expect(await code(changeStaffPassword(deps(), (await authenticateStaff(deps(), managerToken))!, { current: 'wrong', next: 'whatever long enough' }))).toBe('WRONG_PASSWORD');
  });

  it('permissions are per store; an archived role or a revoked assignment grants nothing', async () => {
    const s = await createStaff(t.prisma, policy, owner, { email: 'support@example.com', displayName: 'Sample support', password: STAFF_PW }, CTX);
    const support: Actor = { staffUserId: s.id };
    const { assignmentId } = await assignRole(t.prisma, owner, { staffUserId: s.id, roleId: supportRoleId, storeId: stores[0] }, CTX);
    expect(await can(t.prisma, support, 'settings.read', { storeId: stores[0] })).toBe(true);
    expect(await can(t.prisma, support, 'settings.read', { storeId: stores[1] })).toBe(false);
    expect(await can(t.prisma, support, 'settings.read')).toBe(false); // installation-wide needs an all-store role
    expect(await can(t.prisma, support, 'settings.write', { storeId: stores[0] })).toBe(false);

    await setRoleArchived(t.prisma, owner, supportRoleId, true, CTX);
    expect(await can(t.prisma, support, 'settings.read', { storeId: stores[0] })).toBe(false);
    await setRoleArchived(t.prisma, owner, supportRoleId, false, CTX);
    expect(await can(t.prisma, support, 'settings.read', { storeId: stores[0] })).toBe(true);

    await updateRole(t.prisma, owner, supportRoleId, { permissions: ['settings.read', 'audit.read'] }, CTX);
    expect(await can(t.prisma, support, 'audit.read', { storeId: stores[0] })).toBe(true);

    await revokeRole(t.prisma, owner, assignmentId, CTX);
    expect(await can(t.prisma, support, 'settings.read', { storeId: stores[0] })).toBe(false);
    // Given again, the same row comes back (nothing deleted).
    const again = await assignRole(t.prisma, owner, { staffUserId: s.id, roleId: supportRoleId, storeId: stores[0] }, CTX);
    expect(again.assignmentId).toBe(assignmentId);
    // Support cannot manage staff at all.
    expect(await code(listStaff(t.prisma, support))).toBe('FORBIDDEN');
  });

  it('the last owner can neither be paused nor lose the owner role; a manager cannot act on the owner', async () => {
    const manager: Actor = { staffUserId: managerId };
    expect(await code(updateStaff(t.prisma, manager, owner.staffUserId!, { status: 'SUSPENDED' }))).toBe('ESCALATION');
    expect(await code(resetStaffTwoFactor(t.prisma, manager, owner.staffUserId!))).toBe('ESCALATION');
    const ownerAssignment = await t.prisma.staffRoleAssignment.findFirstOrThrow({ where: { staffUserId: owner.staffUserId!, role: { key: 'owner' } } });
    expect(await code(revokeRole(t.prisma, owner, ownerAssignment.id))).toBe('LAST_OWNER');
    expect(await code(updateStaff(t.prisma, owner, owner.staffUserId!, { status: 'SUSPENDED' }))).toBe('SELF');

    // Pausing an account ends its sessions at once.
    expect(await authenticateStaff(deps(), managerToken)).not.toBeNull();
    await updateStaff(t.prisma, owner, managerId, { status: 'SUSPENDED' }, CTX);
    expect(await authenticateStaff(deps(), managerToken)).toBeNull();
    expect((await loginStaff(deps(), { email: 'manager@example.com', password: 'picked by me for this job' }, CTX)).kind).toBe('invalid');
    await updateStaff(t.prisma, owner, managerId, { status: 'ACTIVE' }, CTX);
  });

  it('every change to roles and staff is in the append-only audit log with who and from where', async () => {
    const rows = await t.prisma.auditLog.findMany({ where: { actorId: owner.staffUserId } });
    const actions = new Set(rows.map((r) => r.action));
    for (const a of ['role.create', 'role.update', 'role.archive', 'role.restore', 'staff.create', 'staff.role.assign', 'staff.role.revoke', 'staff.status.suspended', 'staff.2fa.enable', 'staff.2fa.disable']) {
      expect(actions, a).toContain(a);
    }
    expect(rows.every((r) => r.ip === CTX.ip && r.actorType === 'STAFF')).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/scrypt\$|first password|sentence for the tests/);
  });

  it('customers: password, login, lockout, sessions bound to their store, change of password', async () => {
    const cust = await t.prisma.customer.create({ data: { storeId: stores[0], phone: '+8800000000001', name: 'Sample customer' } });
    const d = { db: t.prisma, policy, now: () => clock };
    // ~~The first password is the mobile number, chosen for the customer.~~ A password someone else chose (staff); never
    // the mobile number for an account made with an order (follow-up 18, SIM-F-039: that account has no password).
    await setCustomerPassword(d, { storeId: stores[0], customerId: cust.id, password: '0000000001', mustChange: true });
    const r = await loginCustomer(d, { storeId: stores[0], phone: '+8800000000001', password: '0000000001' }, CTX);
    if (r.kind !== 'session') throw new Error(r.kind);
    expect(r.mustChangePassword).toBe(true);
    const auth = (await authenticateCustomer(d, r.token, stores[0]))!;
    expect(auth.customer.id).toBe(cust.id);
    expect(await authenticateCustomer(d, r.token, stores[1])).toBeNull();
    // Same phone in another store is another customer.
    expect((await loginCustomer(d, { storeId: stores[1], phone: '+8800000000001', password: '0000000001' })).kind).toBe('invalid');

    const other = await loginCustomer(d, { storeId: stores[0], phone: '+8800000000001', password: '0000000001' }, CTX);
    if (other.kind !== 'session') throw new Error(other.kind);
    await changeCustomerPassword(d, auth, { current: '0000000001', next: 'my own new one' }, CTX);
    expect(await authenticateCustomer(d, other.token, stores[0])).toBeNull(); // other device logged out
    expect(await authenticateCustomer(d, r.token, stores[0])).not.toBeNull(); // this one kept

    advance(1_000);
    for (let i = 0; i < policy.loginMaxAttempts; i++) await loginCustomer(d, { storeId: stores[0], phone: '+8800000000001', password: `bad-${i}` });
    expect((await loginCustomer(d, { storeId: stores[0], phone: '+8800000000001', password: 'my own new one' })).kind).toBe('locked');
    advance((policy.loginLockoutMinutes + 1) * 60_000);
    expect((await loginCustomer(d, { storeId: stores[0], phone: '+8800000000001', password: 'my own new one' })).kind).toBe('session');

    advance((policy.customerSessionDays + 1) * 24 * 3_600_000);
    expect(await authenticateCustomer(d, r.token, stores[0])).toBeNull();
  });

  it('follow-up 18 · SIM-F-039: an account with no password never signs in by password; a proven one gets a session', async () => {
    const cust = await t.prisma.customer.create({ data: { storeId: stores[0], phone: '+8800000000018', name: 'Order customer' } });
    const d = { db: t.prisma, policy, now: () => clock };
    for (const password of ['+8800000000018', '8800000000018', '00000000018', '0000000018', ''])
      expect((await loginCustomer(d, { storeId: stores[0], phone: '+8800000000018', password }, CTX)).kind).toBe('invalid');
    expect(await t.prisma.customerSession.count({ where: { customerId: cust.id } })).toBe(0);
    const s = await startCustomerSession(d, { storeId: stores[0], customerId: cust.id, deviceLabel: 'code' }, CTX);
    expect((await authenticateCustomer(d, s.token, stores[0]))?.customer.id).toBe(cust.id);
    expect(await authenticateCustomer(d, s.token, stores[1])).toBeNull();
    await expect(startCustomerSession(d, { storeId: stores[1], customerId: cust.id }, CTX)).rejects.toThrow();
  });
});
