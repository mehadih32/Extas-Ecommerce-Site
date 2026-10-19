// Runs against a real PostgreSQL when EXTAS_TEST_DATABASE_URL is set (CI `db` job; locally a throwaway database with
// the migrations applied). Skipped otherwise.
import { PrismaClient } from '@extas/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createVault, rewrapMasterKey } from '../src/vault';

const url = process.env.EXTAS_TEST_DATABASE_URL;
const master = 'test-master-key-'.padEnd(64, 'k');
const who = { service: 'test', purpose: 'unit test' };

describe.skipIf(!url)('vault with PostgreSQL', () => {
  let db: PrismaClient;
  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: url });
    await db.$executeRawUnsafe('TRUNCATE "SecretAccessLog", "InstallationSecret", "StoreSecret", "VaultKey" CASCADE');
  });
  afterAll(async () => db?.$disconnect());

  it('stores ciphertext only and logs every read', async () => {
    const v = createVault(db, master);
    await v.put('telegram.botToken', 'sample-bot-token', {}, who);
    const row = await db.installationSecret.findUniqueOrThrow({ where: { name: 'telegram.botToken' } });
    expect(Buffer.from(row.ciphertext).toString()).not.toContain('sample-bot-token');
    expect(await v.get('telegram.botToken', {}, who)).toBe('sample-bot-token');
    const logs = await db.secretAccessLog.findMany({ where: { secretName: 'telegram.botToken' } });
    expect(logs.map((l) => l.action).sort()).toEqual(['CREATE', 'DECRYPT']);
    expect(JSON.stringify(await v.list({}))).not.toContain('sample-bot-token');
  });

  it('revokes without deleting and brings a key back on put', async () => {
    const v = createVault(db, master);
    await v.revoke('telegram.botToken', {}, who);
    expect(await v.get('telegram.botToken', {}, who)).toBeNull();
    expect(await db.installationSecret.count({ where: { name: 'telegram.botToken' } })).toBe(1);
    await v.put('telegram.botToken', 'sample-bot-token-2', {}, who);
    expect(await v.get('telegram.botToken', {}, who)).toBe('sample-bot-token-2');
  });

  it('keeps store secrets apart from each other and from the installation', async () => {
    const v = createVault(db, master);
    const store = await db.store.upsert({
      where: { slug: 'vault-test' },
      create: { slug: 'vault-test', name: 'Sample store', defaultLocale: 'bn-BD', currency: 'BDT', timezone: 'Asia/Dhaka' },
      update: {},
    });
    await v.put('courier.apiKey', 'store-key', { storeId: store.id }, who);
    expect(await v.get('courier.apiKey', { storeId: store.id }, who)).toBe('store-key');
    expect(await v.get('courier.apiKey', {}, who)).toBeNull();
    // A ciphertext moved to another place does not open.
    const row = await db.storeSecret.findUniqueOrThrow({ where: { storeId_name: { storeId: store.id, name: 'courier.apiKey' } } });
    await db.installationSecret.create({ data: { name: 'courier.apiKey', ciphertext: row.ciphertext, iv: row.iv, authTag: row.authTag, keyVersion: row.keyVersion } });
    await expect(v.get('courier.apiKey', {}, who)).rejects.toThrow();
    await db.installationSecret.update({ where: { name: 'courier.apiKey' }, data: { revokedAt: new Date() } });
  });

  it('seals a value kept in another table and opens it only with the same binding (PR 15, TOTP seeds)', async () => {
    const v = createVault(db, master);
    const sealed = await v.sealValue('staff-totp:sample', Buffer.from('seed-bytes'), who);
    expect(Buffer.from(sealed.ciphertext).toString()).not.toContain('seed-bytes');
    expect((await v.openValue('staff-totp:sample', sealed)).toString()).toBe('seed-bytes');
    await expect(v.openValue('staff-totp:other', sealed)).rejects.toThrow();
  });

  it('survives data-key and master-key rotation', async () => {
    const v = createVault(db, master);
    const before = (await v.list({}))[0]?.keyVersion;
    const version = await v.rotateDataKey(who);
    expect(version).toBe((before ?? 0) + 1);
    expect(await createVault(db, master).get('telegram.botToken', {}, who)).toBe('sample-bot-token-2');
    await rewrapMasterKey(db, master, master + '-new');
    expect(await createVault(db, master + '-new').get('telegram.botToken', {}, who)).toBe('sample-bot-token-2');
    await expect(createVault(db, master).get('telegram.botToken', {}, who)).rejects.toThrow();
  });
});
