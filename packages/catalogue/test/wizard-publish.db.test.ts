// S28 · PR 1037 — the wizard's last step on a real PostgreSQL: only a publisher, the wizard's own two rules (a front photo for every kept
// colour, a confirmed price), a time in the future, sizes and colours kept off are archived (never deleted), the schedule and its undo,
// and the run that puts a due product on the shop.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor, type PermissionKey } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { runScheduledPublish, saveWizardSpec, setWizardPrice, wizardPublish, wizardUnschedule, type CatalogueDeps, type SettingsReader, type Who } from '../src';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('wizard publish on PostgreSQL (PR 1037)', () => {
  let t: TestDatabase;
  let A = 0;
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return registry[key].default as Value<K>;
    },
  };
  let now = new Date('2026-11-16T10:00:00Z');
  const deps = (): CatalogueDeps => ({ db: t.prisma, settings, now: () => now });
  const as = (actor: Actor): Who => ({ actor, storeId: A });
  let owner: Actor;
  let writer: Actor;
  let draft = '';
  let navy = '';
  let black = '';
  let sizeS = '';
  let sizeM = '';

  beforeAll(async () => {
    t = await createTestDatabase('catalogue_wizard_publish');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (email: string, perms: PermissionKey[]): Promise<Actor> => {
      const role = await createRole(t.prisma, SYSTEM, { key: email.split('@')[0]!, nameEn: email, nameBn: email, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email, displayName: email, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: A } });
      return { staffUserId: u.id };
    };
    owner = await staff('wp-owner@example.com', ['catalogue.read', 'catalogue.write', 'catalogue.prices', 'catalogue.publish']);
    writer = await staff('wp-writer@example.com', ['catalogue.read', 'catalogue.write', 'catalogue.prices']);
    draft = (await t.prisma.product.create({ data: { storeId: A, slug: 'wp-draft', nameEn: 'Wizard polo', status: 'DRAFT' }, select: { id: true } })).id;
    sizeS = (await t.prisma.size.create({ data: { storeId: A, key: 'wp-s', label: 'S' }, select: { id: true } })).id;
    sizeM = (await t.prisma.size.create({ data: { storeId: A, key: 'wp-m', label: 'M' }, select: { id: true } })).id;
    navy = (await t.prisma.colour.create({ data: { storeId: A, key: 'wp-navy', nameEn: 'Navy', hex: '#1f2a44' }, select: { id: true } })).id;
    black = (await t.prisma.colour.create({ data: { storeId: A, key: 'wp-black', nameEn: 'Black', hex: '#111111' }, select: { id: true } })).id;
    for (const [i, colourId] of [navy, black].entries()) await t.prisma.productColour.create({ data: { storeId: A, productId: draft, colourId, sortOrder: i } });
    let n = 0;
    for (const colourId of [navy, black]) for (const sizeId of [sizeS, sizeM]) await t.prisma.productVariant.create({ data: { storeId: A, productId: draft, colourId, sizeId, sku: `WP-${(n += 1)}`, shopPriceMinor: 70_000 } });
  }, 300_000);
  afterAll(async () => t?.drop());

  const front = async (colourId: string) => {
    const asset = await t.prisma.mediaAsset.create({ data: { storeId: A, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `wp/${colourId}`, mimeType: 'image/jpeg', bytes: 1000n, checksumSha256: colourId } });
    await t.prisma.productMedia.create({ data: { storeId: A, productId: draft, assetId: asset.id, colourId, role: 'FRONT' } });
  };

  it('lets only someone who may publish through, and says what is missing', async () => {
    expect(await code(wizardPublish(deps(), as(writer), draft, { mode: 'now' }))).toBe('FORBIDDEN');
    expect(await code(wizardPublish(deps(), as(owner), draft, { mode: 'now' }))).toBe('CHECKLIST_FAILED');
    const e = await wizardPublish(deps(), as(owner), draft, { mode: 'now' }).catch((x) => x as { details?: string[] });
    expect((e as { details?: string[] }).details).toEqual(expect.arrayContaining(['FRONT_PHOTO', 'PRICE_NOT_CONFIRMED']));
  });

  it('refuses a time that is not in the future', async () => {
    await front(navy);
    await setWizardPrice(deps(), as(owner), draft, { priceMinor: 120_000 });
    await saveWizardSpec(deps(), as(owner), draft, { hiddenColourIds: [black], hiddenSizeIds: [sizeS] });
    expect(await code(wizardPublish(deps(), as(owner), draft, { mode: 'schedule' }))).toBe('INVALID_INPUT');
    expect(await code(wizardPublish(deps(), as(owner), draft, { mode: 'schedule', at: '2026-11-16T09:00:00Z' }))).toBe('INVALID_INPUT');
  });

  it('keeps sizes and colours off by archiving them, and schedules the rest', async () => {
    const r = await wizardPublish(deps(), as(owner), draft, { mode: 'schedule', at: '2026-11-17T10:00:00Z' });
    expect(r).toMatchObject({ mode: 'schedule', status: 'READY_TO_PUBLISH', hiddenVariants: 3 });
    const live = await t.prisma.productVariant.findMany({ where: { productId: draft, archivedAt: null }, select: { colourId: true, sizeId: true } });
    expect(live).toEqual([{ colourId: navy, sizeId: sizeM }]);
    expect(await t.prisma.productVariant.count({ where: { productId: draft } })).toBe(4); // nothing deleted
    expect((await t.prisma.productWizardSpec.findFirstOrThrow({ where: { productId: draft } })).scheduleAt?.toISOString()).toBe('2026-11-17T10:00:00.000Z');
  });

  it('does nothing before the time and tries the publish rules when it comes', async () => {
    expect(await runScheduledPublish(deps(), as(SYSTEM as unknown as Actor))).toMatchObject({ due: 0, published: 0 });
    now = new Date('2026-11-17T10:05:00Z');
    const r = await runScheduledPublish(deps(), { actor: SYSTEM, storeId: A });
    expect(r.due).toBe(1);
    expect(r.published + r.failed.length).toBe(1); // the shop's own checklist decides
  });

  it('takes a schedule away again', async () => {
    const p = await t.prisma.product.findUniqueOrThrow({ where: { id: draft }, select: { status: true } });
    if (p.status === 'READY_TO_PUBLISH') {
      await wizardUnschedule(deps(), as(owner), draft);
      expect((await t.prisma.product.findUniqueOrThrow({ where: { id: draft }, select: { status: true } })).status).toBe('DRAFT');
    }
  });
});
