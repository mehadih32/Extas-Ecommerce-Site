// CN-016 — the smoke test's read-only check account on PostgreSQL. Skipped without TEST_DATABASE_ADMIN_URL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createVault } from '@extas/vault';
import {
  authenticateStaff,
  base32Decode,
  CHECK_PERMISSIONS,
  CHECK_ROLE_KEY,
  counterAt,
  createFirstOwner,
  defaultSecurityPolicy,
  ensureCheckAccount,
  loginStaff,
  permissionsFor,
  syncAuth,
  totpAt,
  verifyStaffTwoFactor,
  type StaffAuthDeps,
} from '../src';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '../src/testing';

const EMAIL = 'smoke-check@example.test';

describe.skipIf(!HAS_TEST_DB)('smoke check account on PostgreSQL (CN-016)', () => {
  let t: TestDatabase;
  const policy = defaultSecurityPolicy();
  const vault = () => createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k'));
  const deps = (): StaffAuthDeps => ({ db: t.prisma, policy, vault: vault() });

  beforeAll(async () => {
    t = await createTestDatabase('check');
    await syncAuth(t.prisma);
  });
  afterAll(async () => t?.drop());

  it('makes a read-only account that signs in with its password and a two-step code, without changing anything first', async () => {
    const r = await ensureCheckAccount(t.prisma, vault(), { email: EMAIL, displayName: 'Smoke check' });
    expect(r.created).toBe(true);
    expect(CHECK_PERMISSIONS.length).toBeGreaterThan(0);
    expect(CHECK_PERMISSIONS.every((k) => k.endsWith('.read'))).toBe(true);
    expect([...(await permissionsFor(t.prisma, r.staffUserId, { storeId: null }))].sort()).toEqual([...CHECK_PERMISSIONS].sort());

    const first = await loginStaff(deps(), { email: EMAIL, password: r.password });
    expect(first.kind).toBe('two-factor');
    if (first.kind !== 'two-factor') return;
    const code = totpAt(base32Decode(r.totpSecret), counterAt(new Date()));
    const done = await verifyStaffTwoFactor(deps(), { challenge: first.challenge, code });
    expect(done.kind).toBe('session');
    if (done.kind !== 'session') return;
    const auth = await authenticateStaff(deps(), done.token);
    expect(auth).toMatchObject({ mustChangePassword: false, mustSetUpTwoFactor: false });
  });

  it('every run renews the password and the seed; the old ones stop working', async () => {
    const before = await ensureCheckAccount(t.prisma, vault(), { email: EMAIL, displayName: 'Smoke check' });
    const after = await ensureCheckAccount(t.prisma, vault(), { email: EMAIL, displayName: 'Smoke check' });
    expect(after.created).toBe(false);
    expect(after.password).not.toBe(before.password);
    expect(after.totpSecret).not.toBe(before.totpSecret);
    expect((await loginStaff(deps(), { email: EMAIL, password: before.password })).kind).toBe('invalid');
    expect(await t.prisma.staffRoleAssignment.count({ where: { staffUserId: after.staffUserId, revokedAt: null } })).toBe(1);
    expect(await t.prisma.role.count({ where: { key: CHECK_ROLE_KEY } })).toBe(1);
  });

  it("never takes over a person's account, and respects a paused check account", async () => {
    const owner = await createFirstOwner(t.prisma, policy, { email: 'owner@example.test', displayName: 'Sample owner', password: 'a long sentence for the tests', passwordChosenByOwner: true });
    await expect(ensureCheckAccount(t.prisma, vault(), { email: owner.email, displayName: 'x' })).rejects.toMatchObject({ code: 'CONFLICT' });
    await t.prisma.staffUser.update({ where: { email: EMAIL }, data: { status: 'SUSPENDED' } });
    await expect(ensureCheckAccount(t.prisma, vault(), { email: EMAIL, displayName: 'Smoke check' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
