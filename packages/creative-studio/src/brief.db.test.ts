// S25 · PR 490 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the creative brief and its three
// proposed directions. Off while `studio.creativeBrief.enabled` is off; a direction is only ever chosen after it
// has been proposed, and nothing re-proposes or re-chooses once one is chosen or the brief is set aside.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { archiveCreativeBrief, chooseCreativeDirection, draftCreativeBrief, listCreativeBriefs, proposeCreativeDirections, type StudioDeps, type Who } from './index';

describe.skipIf(!HAS_TEST_DB)('PR 490 · creative brief and three-direction grooming (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let writer: Who;
  let overrides: Record<string, unknown> = {};

  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides[key] ?? registry[key].default) as Value<K>;
    },
  };
  const deps = (): StudioDeps => ({ db: t.prisma, settings });
  const answers = () => ({ purpose: 'Flash sale', audience: 'Returning customers', offer: '20% off polos', durationDays: 3, productIds: [] as string[] });

  beforeAll(async () => {
    t = await createTestDatabase('creative_studio_brief');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const role = await createRole(t.prisma, SYSTEM, { key: 't490-writer', nameEn: 'writer', nameBn: 'writer', permissions: ['marketing.studio.read', 'marketing.studio.write'] });
    const u = await t.prisma.staffUser.create({ data: { email: 't490-writer@example.com', displayName: 'writer', passwordHash: 'not-a-login' } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    writer = { actor: { staffUserId: u.id }, storeId: S };
  });

  afterAll(async () => t.drop());

  it('is OFF while studio.creativeBrief.enabled is off (CN-018: off by default)', async () => {
    overrides = {};
    await expect(draftCreativeBrief(deps(), writer, answers())).rejects.toMatchObject({ code: 'OFF' });
  });

  it('refuses INVALID_INPUT without a purpose/audience/offer/duration', async () => {
    overrides = { 'studio.creativeBrief': { enabled: true } };
    await expect(draftCreativeBrief(deps(), writer, { ...answers(), purpose: '' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('refuses NOT_FOUND for an unknown campaignId', async () => {
    overrides = { 'studio.creativeBrief': { enabled: true } };
    await expect(draftCreativeBrief(deps(), writer, { ...answers(), campaignId: randomUUID() })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('drafts a brief as DRAFTING with no direction yet', async () => {
    overrides = { 'studio.creativeBrief': { enabled: true } };
    const row = await draftCreativeBrief(deps(), writer, answers());
    expect(row.status).toBe('DRAFTING');
    expect(row.directions).toBeNull();
    expect(row.chosenDirection).toBeNull();
    expect(row.answers.offer).toBe('20% off polos');
  });

  it('proposes the three fixed directions, in order, from the brief alone (no photo named)', async () => {
    overrides = { 'studio.creativeBrief': { enabled: true } };
    const brief = await draftCreativeBrief(deps(), writer, answers());
    const row = await proposeCreativeDirections(deps(), writer, brief.id);
    expect(row.status).toBe('PROPOSED');
    expect(row.directions?.map((d) => d.key)).toEqual(['urgency', 'festive', 'clean_premium']);
    expect(row.directions?.every((d) => d.previewAssetId === null)).toBe(true);
  });

  it('proposes the same selection photo as every direction\'s honest preview when a product is named', async () => {
    overrides = { 'studio.creativeBrief': { enabled: true } };
    const product = await t.prisma.product.create({ data: { storeId: S, slug: `cb-${randomUUID()}`, nameEn: 'Sample Polo' } });
    const asset = await t.prisma.mediaAsset.create({ data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `products/${randomUUID()}.jpg`, mimeType: 'image/jpeg', bytes: BigInt(1000), checksumSha256: randomUUID() } });
    await t.prisma.productMedia.create({ data: { storeId: S, productId: product.id, assetId: asset.id, role: 'FRONT', isPrimary: true } });
    const brief = await draftCreativeBrief(deps(), writer, { ...answers(), productIds: [product.id] });
    const row = await proposeCreativeDirections(deps(), writer, brief.id);
    expect(row.directions?.every((d) => d.previewAssetId === asset.id)).toBe(true);
  });

  it('refuses NOT_FOUND to re-propose an unknown or foreign brief', async () => {
    overrides = { 'studio.creativeBrief': { enabled: true } };
    await expect(proposeCreativeDirections(deps(), writer, randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses WRONG_STATE to choose a direction before any is proposed', async () => {
    overrides = { 'studio.creativeBrief': { enabled: true } };
    const brief = await draftCreativeBrief(deps(), writer, answers());
    await expect(chooseCreativeDirection(deps(), writer, brief.id, 0)).rejects.toMatchObject({ code: 'WRONG_STATE' });
  });

  it('refuses INVALID_INPUT for a direction index out of range', async () => {
    overrides = { 'studio.creativeBrief': { enabled: true } };
    const brief = await draftCreativeBrief(deps(), writer, answers());
    await proposeCreativeDirections(deps(), writer, brief.id);
    await expect(chooseCreativeDirection(deps(), writer, brief.id, 3)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('chooses a direction and lands on CHOSEN', async () => {
    overrides = { 'studio.creativeBrief': { enabled: true } };
    const brief = await draftCreativeBrief(deps(), writer, answers());
    await proposeCreativeDirections(deps(), writer, brief.id);
    const row = await chooseCreativeDirection(deps(), writer, brief.id, 1);
    expect(row.status).toBe('CHOSEN');
    expect(row.chosenDirection).toBe(1);
  });

  it('refuses WRONG_STATE to re-propose once a direction is chosen (nothing is swapped from under a decision)', async () => {
    overrides = { 'studio.creativeBrief': { enabled: true } };
    const brief = await draftCreativeBrief(deps(), writer, answers());
    await proposeCreativeDirections(deps(), writer, brief.id);
    await chooseCreativeDirection(deps(), writer, brief.id, 0);
    await expect(proposeCreativeDirections(deps(), writer, brief.id)).rejects.toMatchObject({ code: 'WRONG_STATE' });
  });

  it('asking again before choosing re-proposes the same three directions ("ask for more")', async () => {
    overrides = { 'studio.creativeBrief': { enabled: true } };
    const brief = await draftCreativeBrief(deps(), writer, answers());
    await proposeCreativeDirections(deps(), writer, brief.id);
    const row = await proposeCreativeDirections(deps(), writer, brief.id);
    expect(row.status).toBe('PROPOSED');
    expect(row.directions?.map((d) => d.key)).toEqual(['urgency', 'festive', 'clean_premium']);
  });

  it('sets a brief aside and never deletes it; a second archive refuses WRONG_STATE', async () => {
    overrides = { 'studio.creativeBrief': { enabled: true } };
    const brief = await draftCreativeBrief(deps(), writer, answers());
    const row = await archiveCreativeBrief(deps(), writer, brief.id);
    expect(row.status).toBe('ARCHIVED');
    const stillThere = await t.prisma.creativeBrief.findUnique({ where: { id: brief.id } });
    expect(stillThere).not.toBeNull();
    await expect(archiveCreativeBrief(deps(), writer, brief.id)).rejects.toMatchObject({ code: 'WRONG_STATE' });
  });

  it('lists every brief of the store, newest first', async () => {
    overrides = { 'studio.creativeBrief': { enabled: true } };
    await draftCreativeBrief(deps(), writer, answers());
    await draftCreativeBrief(deps(), writer, answers());
    const rows = await listCreativeBriefs(deps(), S);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(new Date(rows[0]!.createdAt).getTime()).toBeGreaterThanOrEqual(new Date(rows[1]!.createdAt).getTime());
  });
});
