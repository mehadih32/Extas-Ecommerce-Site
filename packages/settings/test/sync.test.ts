// PR 496 settings migration on a real PostgreSQL. Skipped without TEST_DATABASE_ADMIN_URL.
// The pure part (column diff, report text) runs always.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  changedColumns,
  definitionColumns,
  describeSync,
  INSTALLATION,
  messages,
  ownerDataRegister,
  ownerDataRows,
  ownerRowName,
  prismaBackend,
  registry,
  registryVersion,
  SettingsResolver,
  storeTarget,
  syncSettings,
  type RegistryShape,
} from '../src';
import { createTestDatabase, HAS_DB, seedStores, type TestDatabase } from './pg';

describe('definition diff (pure)', () => {
  it('sees no difference between a row and the registry it came from, and spots a changed default', () => {
    const want = definitionColumns('store.locale', registry['store.locale'], messages);
    expect(changedColumns({ ...want, constraints: JSON.parse(JSON.stringify(want.constraints)) }, want)).toEqual([]);
    expect(changedColumns({ ...want, defaultValue: 'en-GB' }, want)).toEqual(['defaultValue']);
    expect(changedColumns({ ...want, labelBn: 'x', sortOrder: 99 }, want)).toEqual(['labelBn', 'sortOrder']);
  });
  it('the deploy log line names keys and counts only', () => {
    const lines = describeSync({
      status: 'applied',
      registryVersion: 2,
      installationVersionBefore: 1,
      added: ['a.b'],
      changed: [],
      retired: ['c.d'],
      restored: [],
      ownerData: { added: [], archived: [], restored: [], updated: [] },
      recorded: true,
      warnings: [],
    });
    expect(lines.join('\n')).toBe(
      'settings sync: applied · registry v2 (installation was v1)\n  added: a.b\n  retired: c.d\n  recorded SettingsMigration v2',
    );
  });
});

describe.skipIf(!HAS_DB)('settings sync on PostgreSQL', () => {
  let db: TestDatabase;
  let storeId: number;
  const keys = Object.keys(registry).sort();
  // Versions are relative to the registry this code ships, so adding settings never breaks these tests.
  const V = registryVersion(registry);
  const ownerKeys = keys.filter((k) => registry[k as keyof typeof registry].isOwnerData);
  const registerNames = ownerDataRows(messages).map(ownerRowName);

  const counts = async () => ({
    definitions: await db.prisma.settingDefinition.count(),
    changes: await db.prisma.settingChange.count(),
    migrations: await db.prisma.settingsMigration.count(),
    installations: await db.prisma.installation.count(),
    ownerData: await db.prisma.ownerDataEntry.count(),
    installationValues: await db.prisma.installationSettingValue.count(),
    storeValues: await db.prisma.storeSettingValue.count(),
  });

  beforeAll(async () => {
    db = await createTestDatabase('sync');
    [storeId] = await seedStores(db.prisma);
  });
  afterAll(async () => {
    await db?.drop();
  });

  it('first run: every key gets its definition with its default, recorded once', async () => {
    const r = await syncSettings(db.prisma, { registry, messages, appVersion: 'sha-one' });
    expect(r).toMatchObject({ status: 'applied', registryVersion: V, installationVersionBefore: 0, recorded: true });
    expect(r.added).toEqual(keys);
    expect(r.ownerData.added).toEqual([...ownerKeys, ...registerNames]);
    expect(ownerKeys).toContain('store.name');
    expect(registerNames).toEqual(expect.arrayContaining(['TABLE:StoreSecret', 'TABLE:AreaBand', 'TABLE:Store.name', 'SETTING_PREFIX:contact.', 'MEDIA_FOLDER:/']));
    expect(await db.prisma.ownerDataEntry.count()).toBe(ownerKeys.length + registerNames.length);

    const locale = await db.prisma.settingDefinition.findUniqueOrThrow({ where: { key: 'store.locale' } });
    expect(locale).toMatchObject({
      defaultValue: 'bn-BD',
      scope: 'INHERITED',
      valueType: 'STRING',
      labelEn: 'Language and number format',
      labelBn: 'ভাষা ও সংখ্যার ধরন',
      sinceVersion: 1,
      deprecatedAt: null,
      isPublic: true,
    });
    const host = await db.prisma.settingDefinition.findUniqueOrThrow({ where: { key: 'system.stagingHost' } });
    expect(host).toMatchObject({ scope: 'INSTALLATION', defaultValue: null });
    const name = await db.prisma.settingDefinition.findUniqueOrThrow({ where: { key: 'store.name' } });
    expect(name).toMatchObject({ isOwnerData: true, defaultValue: null });

    const added = await db.prisma.settingChange.findMany({ where: { action: 'MIGRATION_ADDED' } });
    expect(added.map((c) => c.key).sort()).toEqual(keys);
    expect(await db.prisma.settingsMigration.findUniqueOrThrow({ where: { version: V } })).toMatchObject({ addedKeys: keys });
    expect(await db.prisma.installation.findFirstOrThrow()).toMatchObject({ settingsVersion: V, appVersion: 'sha-one' });
    // No value rows: the resolver answers from the definition default.
    expect(await counts()).toMatchObject({ installationValues: 0, storeValues: 0 });
  });

  it('is idempotent: a second run changes nothing at all', async () => {
    const before = await counts();
    const stamps = await db.prisma.settingDefinition.findMany({ select: { key: true, updatedAt: true }, orderBy: { key: 'asc' } });
    const r = await syncSettings(db.prisma, { registry, messages, appVersion: 'sha-one' });
    expect(r).toMatchObject({ status: 'unchanged', added: [], changed: [], retired: [], restored: [], recorded: false, warnings: [] });
    expect(await counts()).toEqual(before);
    expect(await db.prisma.settingDefinition.findMany({ select: { key: true, updatedAt: true }, orderBy: { key: 'asc' } })).toEqual(stamps);
  });

  it('two syncs at the same moment never interleave', async () => {
    const before = await counts();
    const [a, b] = await Promise.all([
      syncSettings(db.prisma, { registry, messages }),
      syncSettings(db.prisma, { registry, messages }),
    ]);
    expect([a.status, b.status]).toEqual(['unchanged', 'unchanged']);
    expect(await counts()).toEqual(before);
  });

  it('a changed definition updates metadata only and never overwrites a value that was set', async () => {
    const resolver = new SettingsResolver(prismaBackend(db.prisma), registry, { checkIntervalMs: 0 });
    await resolver.set('store.locale', 'en-US', INSTALLATION);
    await resolver.set('store.locale', 'en-GB', storeTarget(storeId));
    const v2: RegistryShape = {
      ...registry,
      'store.locale': { ...registry['store.locale'], default: 'en-IN', sortOrder: 25, version: V + 1 },
    };
    const r = await syncSettings(db.prisma, { registry: v2, messages });
    expect(r).toMatchObject({ status: 'applied', changed: ['store.locale'], added: [], recorded: true, installationVersionBefore: V });
    expect(await db.prisma.settingDefinition.findUniqueOrThrow({ where: { key: 'store.locale' } })).toMatchObject({
      defaultValue: 'en-IN',
      sortOrder: 25,
      sinceVersion: 1,
    });
    expect(await db.prisma.installationSettingValue.findUniqueOrThrow({ where: { key: 'store.locale' } })).toMatchObject({ value: 'en-US', version: 1 });
    expect(await db.prisma.storeSettingValue.findUniqueOrThrow({ where: { storeId_key: { storeId, key: 'store.locale' } } })).toMatchObject({
      value: 'en-GB',
    });
    const after = new SettingsResolver(prismaBackend(db.prisma), v2);
    expect(await after.get('store.locale', { storeId })).toMatchObject({ value: 'en-GB', source: 'store' });
    expect(await db.prisma.installation.findFirstOrThrow()).toMatchObject({ settingsVersion: V + 1 });
    // And again: nothing.
    expect(await syncSettings(db.prisma, { registry: v2, messages })).toMatchObject({ status: 'unchanged' });
  });

  it('a removed key is marked retired — the definition and its values stay — and comes back when restored', async () => {
    const resolver = new SettingsResolver(prismaBackend(db.prisma), registry, { checkIntervalMs: 0 });
    await resolver.set('store.currency', 'USD', INSTALLATION);
    const { 'store.currency': _gone, ...rest } = registry;
    const v3: RegistryShape = { ...rest, 'store.locale': { ...registry['store.locale'], default: 'en-IN', sortOrder: 25, version: V + 2 } };
    const r = await syncSettings(db.prisma, { registry: v3, messages });
    expect(r).toMatchObject({ status: 'applied', retired: ['store.currency'], changed: [], recorded: true });
    const def = await db.prisma.settingDefinition.findUniqueOrThrow({ where: { key: 'store.currency' } });
    expect(def.deprecatedAt).toBeInstanceOf(Date);
    expect(await db.prisma.installationSettingValue.findUniqueOrThrow({ where: { key: 'store.currency' } })).toMatchObject({ value: 'USD' });
    expect(await syncSettings(db.prisma, { registry: v3, messages })).toMatchObject({ status: 'unchanged', retired: [] });

    const v4: RegistryShape = { ...v3, 'store.currency': { ...registry['store.currency'], version: V + 3 } };
    const back = await syncSettings(db.prisma, { registry: v4, messages });
    expect(back).toMatchObject({ status: 'applied', restored: ['store.currency'], recorded: true });
    expect((await db.prisma.settingDefinition.findUniqueOrThrow({ where: { key: 'store.currency' } })).deprecatedAt).toBeNull();
    expect(await db.prisma.installationSettingValue.findUniqueOrThrow({ where: { key: 'store.currency' } })).toMatchObject({ value: 'USD' });
  });

  it('older code (a rollback) never touches an installation that is ahead', async () => {
    const before = await counts();
    const r = await syncSettings(db.prisma, { registry, messages });
    expect(r).toMatchObject({ status: 'skipped-installation-ahead', registryVersion: V, installationVersionBefore: V + 3 });
    expect(r.warnings).toHaveLength(1);
    expect(await counts()).toEqual(before);
    expect((await db.prisma.settingDefinition.findUniqueOrThrow({ where: { key: 'store.locale' } })).defaultValue).toBe('en-IN');
  });

  it('warns when definitions change without a version bump (and still applies them)', async () => {
    const v4: RegistryShape = {
      ...registry,
      'store.locale': { ...registry['store.locale'], default: 'en-IN', sortOrder: 25, version: V + 2 },
      'store.currency': { ...registry['store.currency'], sortOrder: 41, version: V + 3 },
    };
    const r = await syncSettings(db.prisma, { registry: v4, messages });
    expect(r).toMatchObject({ status: 'applied', changed: ['store.currency'], recorded: false });
    expect(r.warnings[0]).toMatch(/bump/);
  });

  it('PR 509: a table that leaves the register is archived (never deleted) and comes back when listed again', async () => {
    const v4: RegistryShape = {
      ...registry,
      'store.locale': { ...registry['store.locale'], default: 'en-IN', sortOrder: 25, version: V + 2 },
      'store.currency': { ...registry['store.currency'], sortOrder: 41, version: V + 3 },
    };
    const smaller = { ...ownerDataRegister, tables: ownerDataRegister.tables.filter((t) => t.target !== 'AreaBand') };
    const before = await db.prisma.ownerDataEntry.count();
    const r = await syncSettings(db.prisma, { registry: v4, messages, register: smaller });
    expect(r.ownerData).toMatchObject({ archived: ['TABLE:AreaBand'], added: [], restored: [] });
    expect(await db.prisma.ownerDataEntry.count()).toBe(before);
    expect((await db.prisma.ownerDataEntry.findUniqueOrThrow({ where: { kind_target: { kind: 'TABLE', target: 'AreaBand' } } })).archivedAt).toBeInstanceOf(Date);

    const back = await syncSettings(db.prisma, { registry: v4, messages });
    expect(back.ownerData).toMatchObject({ restored: ['TABLE:AreaBand'], archived: [], added: [] });
    expect(await syncSettings(db.prisma, { registry: v4, messages })).toMatchObject({ status: 'unchanged' });
  });
});
