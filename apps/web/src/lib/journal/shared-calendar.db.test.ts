// S12 · PR 252 — the shared calendar on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): drawn while
// Marketing › Calendar is off; a scheduled article beside the owner's plan line; a social post only while the social
// studio (S23) is shown; nothing written. Made-up values.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { CLOSED_STAGES_SHOWN_DEFAULT, messages, prismaBackend, registry, SettingsResolver, syncSettings, INSTALLATION } from '@extas/settings';
import { sharedCalendar } from './shared-calendar';

describe.skipIf(!HAS_TEST_DB)('Website › Blog & journal › Shared calendar on PostgreSQL (PR 252)', () => {
  let t: TestDatabase;
  let resolver: SettingsResolver<typeof registry>;
  const S = MOTHER_STORE_ID;
  const now = new Date('2026-11-06T06:00:00Z');

  beforeAll(async () => {
    t = await createTestDatabase('shared-calendar');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    await t.prisma.blogPost.create({ data: { storeId: S, locale: 'en', slug: 'eid-panjabi', title: 'Which panjabi for Eid', body: 'Sample.', status: 'SCHEDULED', scheduledAt: new Date('2026-11-10T06:00:00Z') } });
    await t.prisma.calendarEntry.create({ data: { storeId: S, date: new Date('2026-11-12T00:00:00Z'), kind: 'plan', title: 'Winter sale', status: 'planned' } });
    const account = await t.prisma.socialAccount.create({ data: { storeId: S, platform: 'FACEBOOK', externalId: 'sample-page', name: 'Sample page', requireApproval: true } });
    await t.prisma.socialPost.create({ data: { storeId: S, accountId: account.id, kind: 'post', caption: 'Eid looks', status: 'SCHEDULED', scheduledAt: new Date('2026-11-11T06:00:00Z') } });
  });
  afterAll(async () => t?.drop());

  it('is drawn while Marketing › Calendar is off: the article beside the plan line; social hidden while S23 is closed', async () => {
    expect((await resolver.value('marketing.calendar', { storeId: S })).enabled).toBe(false);
    const c = await sharedCalendar(t.prisma, resolver, now);
    expect(c.socialShown).toBe(false);
    expect(c.shownLanes).not.toContain('social');
    expect(c.items.map((i) => [i.lane, i.title.en])).toEqual(expect.arrayContaining([['content', 'Which panjabi for Eid'], ['plan', 'Winter sale']]));
    expect(c.items.some((i) => i.lane === 'social')).toBe(false);
    expect(c.lanes.social).toBe(0);
  });

  it('shows the social posts once the social studio is shown, and writes nothing', async () => {
    const before = await t.prisma.calendarEntry.count();
    await resolver.set('stages.closedShown', { ...CLOSED_STAGES_SHOWN_DEFAULT, S23: true }, INSTALLATION, { actorId: null, reason: 'test' });
    const c = await sharedCalendar(t.prisma, resolver, now);
    expect(c.socialShown).toBe(true);
    expect(c.items.filter((i) => i.lane === 'social').map((i) => i.title.en)).toEqual(['Eid looks']);
    expect(await t.prisma.calendarEntry.count()).toBe(before);
  });
});
