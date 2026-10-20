// The connection layer on a real PostgreSQL (throwaway database with the real migrations; skipped without
// TEST_DATABASE_ADMIN_URL): lookup order, fallbacks, the Test button, mode switches and the key cache.
import { randomBytes } from 'node:crypto';
import { createVault, type Vault } from '@extas/vault';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AdapterError, allAdapters, createConnections, defineAdapter, requireSecret, type Storage } from '../src';
import { createTestDatabase, HAS_DB, seedStore, type TestDatabase } from './pg';

const who = { service: 'test', purpose: 'unit test' };

/** A test-only adapter: its live client is the key itself, and its test fails while showing the key it was given. */
const echo = defineAdapter<{ key: string }, { leak?: boolean }>({
  kind: 'OTHER',
  provider: 'echo',
  modes: ['SANDBOX', 'LIVE'],
  secrets: ['apiKey'],
  configSchema: z.object({ leak: z.boolean().optional() }),
  async create(ctx) {
    return { key: await requireSecret(ctx, 'apiKey') };
  },
  async mock() {
    return { key: 'mock' };
  },
  async test(api, ctx) {
    if (ctx.config.leak) throw new Error(`provider said: bad key ${api.key}`);
    return { ok: true, message: `answered in ${ctx.mode}` };
  },
});

describe.skipIf(!HAS_DB)('connections with PostgreSQL', () => {
  let t: TestDatabase;
  let vault: Vault;
  let reads = 0;
  let storeId = 0;
  const counting = (): Pick<Vault, 'get'> => ({
    get: (...a) => {
      reads++;
      return vault.get(...a);
    },
  });
  const connections = (fallbacks = {}) =>
    createConnections({ db: t.prisma, vault: counting(), adapters: [...allAdapters, echo], secretCacheMs: 60_000, testTimeoutMs: 5_000, fallbacks });

  beforeAll(async () => {
    t = await createTestDatabase('connections');
    vault = createVault(t.prisma, randomBytes(32).toString('hex'));
    storeId = await seedStore(t.prisma);
  });
  afterAll(async () => t?.drop());
  beforeEach(async () => {
    reads = 0;
    await t.prisma.$executeRawUnsafe('TRUNCATE "IntegrationTestRun", "Integration", "AuditLog" CASCADE');
  });

  it('runs on the fallback or the mock when nothing is connected', async () => {
    const c = connections({ STORAGE: { provider: 'localDisk', mode: 'LIVE', config: { root: '/tmp/extas-fallback' } } });
    const s = await c.use<Storage>('STORAGE');
    expect([s.provider, s.mode, s.integrationId]).toEqual(['localDisk', 'LIVE', null]);

    const m = await connections().use<Storage>('STORAGE');
    expect([m.provider, m.mode]).toEqual(['localDisk', 'MOCK']);
    // OTHER has more than one adapter (the page reader, PR 33): with nothing connected, the named one's mock.
    const o = await connections().use<{ key: string }>('OTHER', { provider: 'echo' });
    expect(o.api.key).toBe('mock');
  });

  it('prefers the store connection, then the installation one, and ignores switched-off or archived rows', async () => {
    const inst = await t.prisma.integration.create({ data: { kind: 'STORAGE', provider: 'azureBlob', name: 'main', enabled: true } });
    await t.prisma.integration.create({ data: { kind: 'STORAGE', provider: 's3', name: 'off', enabled: false, storeId } });
    expect((await connections().use('STORAGE', { storeId })).integrationId).toBe(inst.id);

    const own = await t.prisma.integration.create({ data: { kind: 'STORAGE', provider: 's3', name: 'own', enabled: true, storeId } });
    const got = await connections().use<Storage>('STORAGE', { storeId });
    expect([got.integrationId, got.provider, got.mode, got.api.provider]).toEqual([own.id, 's3', 'MOCK', 'S3_COMPATIBLE']);

    await t.prisma.integration.update({ where: { id: own.id }, data: { archivedAt: new Date() } });
    expect((await connections().use('STORAGE', { storeId })).integrationId).toBe(inst.id);
  });

  it('refuses to guess between two switched-on connections of one kind', async () => {
    await t.prisma.integration.createMany({
      data: [
        { kind: 'STORAGE', provider: 'azureBlob', name: 'a', enabled: true },
        { kind: 'STORAGE', provider: 's3', name: 'b', enabled: true },
      ],
    });
    await expect(connections().use('STORAGE')).rejects.toBeInstanceOf(AdapterError);
    expect((await connections().use('STORAGE', { provider: 's3' })).provider).toBe('s3');
  });

  it('records every test press on the connection', async () => {
    const row = await t.prisma.integration.create({ data: { kind: 'STORAGE', provider: 'azureBlob', name: 'main', enabled: true } });
    const r = await connections().test(row.id, {});
    expect(r).toMatchObject({ ok: true, mode: 'MOCK' });
    const after = await t.prisma.integration.findUniqueOrThrow({ where: { id: row.id } });
    expect([after.lastTestOk, after.lastTestMessage]).toEqual([true, r.message]);
    expect(await t.prisma.integrationTestRun.count({ where: { integrationId: row.id, ok: true } })).toBe(1);
  });

  it('leaves MOCK only after a passing test in the target mode, and audits the switch', async () => {
    const row = await t.prisma.integration.create({ data: { kind: 'OTHER', provider: 'echo', name: 'main', enabled: true } });
    const c = connections();

    const missing = await c.setMode(row.id, 'LIVE', { actorId: null, ip: '192.0.2.1' });
    expect(missing.ok).toBe(false);
    expect(missing.message).toMatch(/not entered/);
    expect((await t.prisma.integration.findUniqueOrThrow({ where: { id: row.id } })).mode).toBe('MOCK');
    expect(await t.prisma.auditLog.count()).toBe(0);

    await vault.put('echo.apiKey', 'sample-key-123', {}, who);
    c.forget();
    const ok = await c.setMode(row.id, 'SANDBOX', { ip: '192.0.2.1' });
    expect(ok).toMatchObject({ ok: true, mode: 'SANDBOX', message: 'answered in SANDBOX' });
    expect((await t.prisma.integration.findUniqueOrThrow({ where: { id: row.id } })).mode).toBe('SANDBOX');
    const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { entityId: row.id } });
    expect([audit.action, audit.before, audit.after, audit.ip]).toEqual(['integration.mode', { mode: 'MOCK' }, { mode: 'SANDBOX' }, '192.0.2.1']);

    const used = await c.use<{ key: string }>('OTHER');
    expect([used.mode, used.api.key]).toEqual(['SANDBOX', 'sample-key-123']);
  });

  it('never lets a key into a test message', async () => {
    await vault.put('echo.apiKey', 'sample-key-456', {}, who);
    const row = await t.prisma.integration.create({ data: { kind: 'OTHER', provider: 'echo', name: 'main', enabled: true, config: { leak: true } } });
    const r = await connections().test(row.id, {}, 'LIVE');
    expect(r.ok).toBe(false);
    expect(r.message).toBe('provider said: bad key ***');
    const run = await t.prisma.integrationTestRun.findFirstOrThrow({ where: { integrationId: row.id } });
    expect(run.message).not.toContain('sample-key-456');
  });

  it('reads a key from the vault once per cache period', async () => {
    await vault.put('echo.apiKey', 'sample-key-789', {}, who);
    const row = await t.prisma.integration.create({ data: { kind: 'OTHER', provider: 'echo', name: 'main', enabled: true, mode: 'LIVE' } });
    const c = connections();
    for (let i = 0; i < 3; i++) await c.test(row.id);
    expect(reads).toBe(1);
  });

  it('says which settings are wrong without showing their values', async () => {
    const row = await t.prisma.integration.create({
      data: { kind: 'STORAGE', provider: 'azureBlob', name: 'main', enabled: true, config: { accountName: 'Not Valid!', container: 'media' } },
    });
    const r = await connections().test(row.id, {}, 'LIVE');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('accountName');
    expect(r.message).not.toContain('Not Valid!');
  });
});
