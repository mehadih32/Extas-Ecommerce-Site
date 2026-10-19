// PR 509 — the installation export and the new-installation import on a real PostgreSQL: the owner's own data never
// leaves. Skipped without TEST_DATABASE_ADMIN_URL. The "owner" values below are test values typed in by the test.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  INSTALLATION,
  messages,
  prismaBackend,
  registry,
  SettingsResolver,
  storeTarget,
  syncSettings,
} from '@extas/settings';
import { applyPack, defaultPack, exportInstallation, findOwnerData, importInstallation, OwnerDataLeak, type InstallationExport } from '../src';
import { createTestDatabase, HAS_DB, makeStore, type TestDatabase } from './pg';

const OWNER_STORE_NAME = 'Rupkotha Fashion House';
const OWNER_PHONE = '+8801711000111';
const OWNER_ADDRESS = 'House 12, Road 5, Dhanmondi';
const OWNER_BANK = '0123456789012';

describe.skipIf(!HAS_DB)('installation export and import on PostgreSQL', () => {
  let source: TestDatabase;
  let target: TestDatabase;
  let storeId: number;
  let bundle: InstallationExport;

  beforeAll(async () => {
    source = await createTestDatabase('export_src');
    target = await createTestDatabase('export_dst');
    await syncSettings(source.prisma, { registry, messages });
    await syncSettings(target.prisma, { registry, messages });
    storeId = (await makeStore(source.prisma, 'rupkotha', { isPrimary: true, status: 'LIVE', name: OWNER_STORE_NAME })).id;
    await applyPack(source.prisma, defaultPack, { storeId });

    const resolver = new SettingsResolver(prismaBackend(source.prisma), registry, { checkIntervalMs: 0 });
    // The owner's own data …
    await resolver.set('store.name', OWNER_STORE_NAME, storeTarget(storeId));
    await resolver.set('contact.phone', OWNER_PHONE, storeTarget(storeId));
    await resolver.set('contact.address', { en: OWNER_ADDRESS, bn: OWNER_ADDRESS }, storeTarget(storeId));
    await resolver.set(
      'payment.bank.accounts',
      [{ bankName: 'Test Bank', accountName: 'Test account', accountNumber: OWNER_BANK }],
      INSTALLATION,
    );
    // … his business decisions (money, rule 6) …
    await resolver.set('delivery.freeOverMinor', 150000, storeTarget(storeId), { ownerApproved: true });
    await resolver.set('payment.cod.enabled', true, storeTarget(storeId), { ownerApproved: true });
    // … and ordinary settings and structure, which may travel.
    await resolver.set('policy.exchange.windowHours', 48, storeTarget(storeId));
    await resolver.set('theme.preset', 'ivory', INSTALLATION);
    await source.prisma.category.update({ where: { storeId_slug: { storeId, slug: 'polos' } }, data: { nameEn: 'Polo shirts', isVisible: true } });
    await source.prisma.deliveryBand.update({ where: { storeId_key: { storeId, key: 'dhaka-city' } }, data: { chargeMinor: 7000, enabled: true } });
  });
  afterAll(async () => {
    await source?.drop();
    await target?.drop();
  });

  it("exports settings and structure without a single value of the owner's", async () => {
    bundle = await exportInstallation(source.prisma);
    const text = JSON.stringify(bundle);
    for (const v of [OWNER_STORE_NAME, OWNER_PHONE, OWNER_ADDRESS, OWNER_BANK, 'rupkotha']) expect(text).not.toContain(v);
    // The band travels as a shape: its charge and switch are the owner's.
    for (const b of bundle.stores[0]!.pack.deliveryBands) {
      expect(b).not.toHaveProperty('chargeMinor');
      expect(b).not.toHaveProperty('enabled');
    }
    expect(bundle.settings).toEqual({ 'theme.preset': 'ivory' });
    expect(bundle.stores).toHaveLength(1);
    expect(bundle.stores[0]).toMatchObject({ ref: 'primary', settings: { 'policy.exchange.windowHours': 48 } });
    expect(bundle.stores[0]!.pack.categories.find((c) => c.slug === 'polos')).toMatchObject({ nameEn: 'Polo shirts', isVisible: true });
    expect(bundle.omitted.settingKeys).toEqual(
      ['contact.address', 'contact.phone', 'delivery.freeOverMinor', 'payment.bank.accounts', 'payment.cod.enabled', 'store.name'],
    );
    expect(bundle.omitted.tables).toEqual(expect.arrayContaining(['StoreSecret', 'InstallationSecret', 'AreaBand', 'Customer', 'Order']));
    expect(bundle.omitted.media).toEqual(['/']);
  });

  it('refuses the whole export when structure carries an owner value, naming where — never the value', async () => {
    await source.prisma.category.update({
      where: { storeId_slug: { storeId, slug: 'shirts' } },
      data: { introEn: `Shirts by ${OWNER_STORE_NAME}. Call ${OWNER_PHONE}.` },
    });
    const error = await exportInstallation(source.prisma).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OwnerDataLeak);
    const leak = error as OwnerDataLeak;
    expect(leak.findings.map((f) => f.rule)).toContain('export-owner-value');
    expect(leak.findings.every((f) => f.where.includes('categories['))).toBe(true);
    expect(leak.message).not.toContain(OWNER_STORE_NAME);
    expect(leak.message).not.toContain(OWNER_PHONE);
    await source.prisma.category.update({ where: { storeId_slug: { storeId, slug: 'shirts' } }, data: { introEn: null } });
  });

  it('a new installation imports it: settings and structure arrive, owner data stays empty', async () => {
    const newStore = (await makeStore(target.prisma, 'new-shop', { isPrimary: true })).id;
    const r = await importInstallation(target.prisma, bundle);
    expect(r.storesSkipped).toEqual([]);
    expect(r.settings.written.sort()).toEqual(['policy.exchange.windowHours@store' + newStore, 'theme.preset']);
    expect(r.stores[0]).toMatchObject({ ref: 'primary', storeId: newStore, pack: { status: 'applied' } });

    const resolver = new SettingsResolver(prismaBackend(target.prisma), registry, { checkIntervalMs: 0 });
    expect(await resolver.value('policy.exchange.windowHours', { storeId: newStore })).toBe(48);
    expect(await resolver.value('theme.preset')).toBe('ivory');
    for (const key of ['store.name', 'contact.phone', 'delivery.freeOverMinor', 'payment.cod.enabled'] as const) {
      expect(await resolver.value(key, { storeId: newStore }), key).toBeNull();
    }
    expect(await target.prisma.category.findUniqueOrThrow({ where: { storeId_slug: { storeId: newStore, slug: 'polos' } } })).toMatchObject({
      nameEn: 'Polo shirts',
    });
    // The band arrives as a shape: off, no charge.
    expect(await target.prisma.deliveryBand.findUniqueOrThrow({ where: { storeId_key: { storeId: newStore, key: 'dhaka-city' } } })).toMatchObject({
      enabled: false,
      chargeMinor: 0,
    });
  });

  it('import refuses a bundle that was edited to carry owner data or owner settings', async () => {
    const tampered = JSON.parse(JSON.stringify(bundle)) as InstallationExport;
    tampered.stores[0]!.pack.categories[0]!.introEn = 'Call 01711000111';
    await expect(importInstallation(target.prisma, tampered)).rejects.toBeInstanceOf(OwnerDataLeak);
    const sneaky = JSON.parse(JSON.stringify(bundle)) as InstallationExport;
    sneaky.settings['legal.dbid'] = 'DBID-TEST';
    const r = await importInstallation(target.prisma, sneaky);
    expect(r.settings.skippedOwner).toEqual(['legal.dbid']);
    expect(findOwnerData({ a: 'nothing here' })).toEqual([]);
  });
});
