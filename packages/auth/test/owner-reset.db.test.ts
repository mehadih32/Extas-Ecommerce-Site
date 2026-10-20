// PR 15 — the owner's way back in (owner, 20 Oct 15:26) on PostgreSQL. Skipped without TEST_DATABASE_ADMIN_URL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  authenticateStaff,
  createFirstOwner,
  defaultSecurityPolicy,
  describeFindings,
  loginStaff,
  resetOwnerPassword,
  syncAuth,
  type StaffAuthDeps,
} from '../src';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '../src/testing';

const EMAIL = 'owner@example.test';
const OWN = 'my own long sentence for the shop';

describe.skipIf(!HAS_TEST_DB)('owner reset on PostgreSQL', () => {
  let t: TestDatabase;
  const policy = defaultSecurityPolicy();
  const deps = (): StaffAuthDeps => ({ db: t.prisma, policy });

  beforeAll(async () => {
    t = await createTestDatabase('ownerreset');
    await syncAuth(t.prisma);
  });
  afterAll(async () => t?.drop());

  it('refuses when there is no owner', async () => {
    await expect(resetOwnerPassword(t.prisma, policy)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('a locked-out owner gets a new first password, the wait ends, old sessions end, and the report says why', async () => {
    await createFirstOwner(t.prisma, policy, { email: EMAIL, displayName: 'Sample owner', password: OWN, passwordChosenByOwner: true });
    const good = await loginStaff(deps(), { email: EMAIL, password: OWN });
    expect(good.kind).toBe('session');
    for (let i = 0; i < policy.loginMaxAttempts; i++) await loginStaff(deps(), { email: EMAIL, password: 'wrong guess number one' });
    await loginStaff(deps(), { email: 'admin', password: 'wrong guess number one' });
    expect((await loginStaff(deps(), { email: EMAIL, password: OWN })).kind).toBe('locked');

    const r = await resetOwnerPassword(t.prisma, policy);
    expect(r.email).toBe(EMAIL);
    expect(r.findings).toMatchObject({ ownPasswordSet: true, twoFactorOn: false, waiting: true });
    expect(r.findings.tries.password).toBe(policy.loginMaxAttempts);
    expect(r.findings.tries.locked).toBe(1);
    expect(describeFindings(r.findings).join('\n')).not.toContain(EMAIL);
    if (good.kind === 'session') expect(await authenticateStaff(deps(), good.token)).toBeNull();

    expect((await loginStaff(deps(), { email: EMAIL, password: OWN })).kind).toBe('invalid');
    const fresh = await loginStaff(deps(), { email: EMAIL, password: r.password });
    expect(fresh.kind).toBe('session');
    if (fresh.kind === 'session') expect(await authenticateStaff(deps(), fresh.token)).toMatchObject({ mustChangePassword: true });
    expect(await t.prisma.auditLog.count({ where: { action: 'staff.owner.reset' } })).toBe(1);
  });
});
