// PR 277 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// the campaign blast — Messages › Campaigns' second type (Broadcast kind `blast`): off as shipped under its own switch
// (`customers.blast`), independent of win-back's; its audience is a saved segment (every customer only while
// `allowEveryone` is on), never a lapse rule; the reach steps count the segment's people, a number, a yes for offers on
// the channel, with no win-back gap; the run queues only those people, once each, at the shared throttle (`batchSize`
// across every campaign); a win-back sent lately does not keep a customer out of a blast, and a blast is not a win-back
// for the next win-back's gap. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM } from '@extas/auth';
import { CRM_CAMPAIGN_STEP } from '@extas/settings';
import { setUpCustomers, type CustomersFixture } from './testing';
import { BLAST_KIND, campaignEditor, campaignKey, campaignsScreen, changeCampaign, runWinbacks, saveCampaign, winbackAudience } from './winback';

// hardcode-ok: made-up test numbers
const N = { a: '+8801700007701', b: '+8801700007702', c: '+8801700007703', d: '+8801700007704' };
const DAY = 86_400_000;
const WB = { enabled: false, perCustomerPerWeek: 1, gapDays: 30, batchSize: 2, resultDays: 14, defaultLapsedDays: 90, stopLine: { bn: 'বন্ধ', en: 'Stop' } };

describe.skipIf(!process.env.TEST_DATABASE_ADMIN_URL)('campaign blast on PostgreSQL (PR 277)', () => {
  let f: CustomersFixture;
  let writer: { actor: { staffUserId: string }; storeId: number };
  let sender: { actor: { staffUserId: string }; storeId: number };
  const ids: Record<string, string> = {};
  let n = 0;
  const ago = (d: number) => new Date(f.clock.now.getTime() - d * DAY);
  const order = (customerId: string, phone: string, daysAgo: number) =>
    f.t.prisma.order.create({
      data: { storeId: f.S, number: `B277-${++n}`, source: 'WEBSITE', currency: 'BDT', status: 'DELIVERED', placedAt: ago(daysAgo + 3), deliveredAt: ago(daysAgo), subtotalMinor: 150_000, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: 150_000, paymentMethod: 'COD', customerId, phone, idempotencyKey: `b277-${n}` },
    });
  const yes = (customerId: string, phone: string) => f.t.prisma.consentRecord.create({ data: { storeId: f.S, customerId, phone, channel: 'SMS', granted: true, scope: 'MARKETING', source: 'checkout' } });
  const queued = (broadcastId: string) => f.t.prisma.notificationLog.findMany({ where: { storeId: f.S, broadcastId, step: CRM_CAMPAIGN_STEP }, orderBy: { customerId: 'asc' }, select: { customerId: true, status: true, dedupeKey: true } });
  const blast = (over: Record<string, unknown> = {}) => ({ kind: 'blast', name: 'Eid drop', channel: 'SMS', templateId: ids.tpl, segmentId: ids.seg, rule: null, ...over });

  beforeAll(async () => {
    f = await setUpCustomers('customers-blast');
    await f.t.prisma.order.updateMany({ where: { storeId: f.S }, data: { archivedAt: f.clock.now } });
    ids.a = await f.profile({ phone: N.a, name: 'Two orders yes' });
    ids.b = await f.profile({ phone: N.b, name: 'Two orders no answer' });
    ids.c = await f.profile({ phone: N.c, name: 'One order yes' });
    ids.d = await f.profile({ phone: N.d, name: 'Two orders yes, lapsed' });
    for (const [k, days] of [['a', 5], ['a', 40], ['b', 6], ['b', 50], ['c', 7], ['d', 120], ['d', 200]] as const) await order(ids[k]!, N[k], days);
    for (const k of ['a', 'c', 'd'] as const) await yes(ids[k]!, N[k]);
    ids.tpl = (await f.t.prisma.notificationTemplate.create({ data: { storeId: f.S, key: 'crm.eidDrop', name: 'Eid drop', channel: 'SMS', locale: 'bn', body: '{customerName}, ঈদের নতুন পাঞ্জাবি এসেছে' } })).id;
    f.overrides.set('customers.segments', { enabled: true, maxSegments: 10, maxConditions: 5, previewShown: 5 });
    ids.seg = (await f.t.prisma.segment.create({ data: { storeId: f.S, name: 'Two orders', definition: { v: 1, all: [{ field: 'ordersMin', value: 2 }] } } })).id;
    const mk = async (key: string, permissions: string[]) => {
      const role = await createRole(f.t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions });
      const u = await f.t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await f.t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.S } });
      return { actor: { staffUserId: u.id }, storeId: f.S };
    };
    writer = await mk('b277-writer', ['messages.journey.read', 'messages.campaigns.write']);
    sender = await mk('b277-sender', ['messages.journey.read', 'messages.campaigns.write', 'messages.campaigns.send']);
    f.overrides.set('customers.winback', WB);
  });
  afterAll(async () => f?.t.drop());

  it('off as shipped under its own switch: no draft, no run, the page is off', async () => {
    expect(await runWinbacks(f.customersDeps(), f.S)).toBeNull();
    await expect(saveCampaign(f.customersDeps(), writer, null, blast())).rejects.toMatchObject({ code: 'SWITCHED_OFF', details: ['customers.blast'] });
    expect(await campaignsScreen(f.customersDeps(), writer)).toMatchObject({ enabled: false, blastOn: false, winbackOn: false, blast: { enabled: false, allowEveryone: false } });
  });

  it('on (win-back still off): a saved segment unless every customer is allowed; no lapse rule; the reach without a gap; audited', async () => {
    f.overrides.set('customers.blast', { enabled: true, allowEveryone: false });
    expect(await campaignsScreen(f.customersDeps(), writer)).toMatchObject({ enabled: true, blastOn: true, winbackOn: false });
    await expect(saveCampaign(f.customersDeps(), writer, null, { ...blast(), kind: undefined, rule: { lapsedDays: 90, maxLapsedDays: null, minDelivered: 1 } })).rejects.toMatchObject({ code: 'SWITCHED_OFF', details: ['customers.winback'] });
    await expect(saveCampaign(f.customersDeps(), writer, null, blast({ segmentId: null }))).rejects.toMatchObject({ code: 'INVALID_INPUT', details: ['segmentId'] });
    await expect(saveCampaign(f.customersDeps(), writer, null, blast({ rule: { lapsedDays: 90, maxLapsedDays: null, minDelivered: 1 } }))).rejects.toMatchObject({ code: 'INVALID_INPUT', details: ['rule'] });
    const e = await saveCampaign(f.customersDeps(), writer, null, blast());
    ids.camp = e.campaign!.id;
    expect(e).toMatchObject({ kind: BLAST_KIND, on: true, campaign: { kind: BLAST_KIND, status: 'DRAFT', rule: null, segmentId: ids.seg, segmentName: 'Two orders' } });
    // a, b, d have two orders; a and d said yes; nobody is left out for a win-back
    expect(e.audience).toMatchObject({ people: 3, withPhone: 3, reachable: 2, recent: 0, willGet: 2 });
    expect(await f.t.prisma.auditLog.count({ where: { action: 'campaign.create', entityId: ids.camp } })).toBe(1);
    f.overrides.set('customers.blast', { enabled: true, allowEveryone: true });
    expect(await winbackAudience(f.customersDeps(), f.S, { kind: BLAST_KIND, channel: 'SMS', rule: null, segmentId: null })).toMatchObject({ reachable: 3, willGet: 3 });
    expect((await campaignEditor(f.customersDeps(), writer, null, BLAST_KIND))!).toMatchObject({ kind: BLAST_KIND, on: true, campaign: null });
  });

  it('scheduled by the send key; the run queues the yes-sayers once at the shared throttle, a recent win-back does not keep them out', async () => {
    // a win-back reached a yesterday (a win-back campaign of the shop's): no gap for a blast
    const wb = await f.t.prisma.broadcast.create({ data: { storeId: f.S, kind: 'winback', name: 'Old win-back', channel: 'SMS', status: 'SENT', templateId: ids.tpl, rule: { lapsedDays: 90, maxLapsedDays: null, minDelivered: 1 } } });
    await f.t.prisma.notificationLog.create({ data: { storeId: f.S, customerId: ids.a, broadcastId: wb.id, channel: 'SMS', recipient: N.a, status: 'SENT', sentAt: ago(1), dedupeKey: `winback:${wb.id}:${ids.a}`, step: CRM_CAMPAIGN_STEP } });
    await expect(changeCampaign(f.customersDeps(), writer, ids.camp!, { action: 'schedule' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await changeCampaign(f.customersDeps(), sender, ids.camp!, { action: 'schedule' });
    f.overrides.set('customers.winback', { ...WB, batchSize: 1 });
    expect(await runWinbacks(f.customersDeps(), f.S)).toEqual({ started: 1, queued: 1, finished: 0 });
    expect(await runWinbacks(f.customersDeps(), f.S)).toEqual({ started: 0, queued: 1, finished: 0 });
    const rows = await queued(ids.camp!);
    expect(rows.map((r) => r.customerId).sort()).toEqual([ids.a, ids.d].sort());
    expect(rows.map((r) => r.dedupeKey).sort()).toEqual([campaignKey(BLAST_KIND, ids.camp!, ids.a!), campaignKey(BLAST_KIND, ids.camp!, ids.d!)].sort());
    await f.t.prisma.notificationLog.updateMany({ where: { broadcastId: ids.camp }, data: { status: 'SENT', sentAt: f.clock.now } });
    expect(await runWinbacks(f.customersDeps(), f.S)).toEqual({ started: 0, queued: 0, finished: 1 });
    expect((await campaignEditor(f.customersDeps(), writer, ids.camp!))!.campaign!.status).toBe('SENT');
  });

  it('switched off mid-way: not started, not queued; cancel still works', async () => {
    const e = await saveCampaign(f.customersDeps(), writer, null, blast({ name: 'Second' }));
    await changeCampaign(f.customersDeps(), sender, e.campaign!.id, { action: 'schedule' });
    f.overrides.set('customers.blast', { enabled: false, allowEveryone: true });
    expect(await runWinbacks(f.customersDeps(), f.S)).toBeNull();
    await expect(changeCampaign(f.customersDeps(), sender, e.campaign!.id, { action: 'resume' })).rejects.toMatchObject({ code: 'SWITCHED_OFF' });
    await changeCampaign(f.customersDeps(), sender, e.campaign!.id, { action: 'cancel' });
    expect(await f.t.prisma.broadcast.findUniqueOrThrow({ where: { id: e.campaign!.id }, select: { status: true } })).toEqual({ status: 'CANCELLED' });
  });
});
