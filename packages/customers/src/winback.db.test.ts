// PR 300 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// win-back campaigns — off as shipped; a campaign is a draft (its rule checked, its template the shop's own on its
// channel) until a person with `messages.campaigns.send` schedules it, and only while someone it names said yes to
// offers on that channel; the audience counts the steps (the rule's people, a number, a yes, a win-back within the gap)
// and the estimated cost; the run queues only those people, once each, at the throttle; pause holds it, cancel leaves
// out what still waits; every change is audited. SIM-F-032's acceptance: a repeat customer gets the product-life
// reminder (PR 289), earns her points (PR 296), and once she stops ordering the win-back reaches her.
// Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM } from '@extas/auth';
import { CRM_CAMPAIGN_STEP, CRM_MESSAGE_STEP } from '@extas/settings';
import { runJourneys, saveJourney, switchJourney } from './journeys';
import { balanceOf, runPoints } from './rewards';
import { setUpCustomers, type CustomersFixture } from './testing';
import { campaignEditor, campaignsScreen, changeCampaign, readWinbackRule, runWinbacks, saveCampaign, winbackAudience, winbackKey } from './winback';

// hardcode-ok: made-up test numbers
const N = { a: '+8801700003011', b: '+8801700003012', c: '+8801700003013', d: '+8801700003014', e: '+8801700003015', s: '+8801700003016' };
const DAY = 86_400_000;
const ON = { enabled: true, perCustomerPerWeek: 1, gapDays: 30, batchSize: 500, resultDays: 14, defaultLapsedDays: 90, stopLine: { bn: 'বন্ধ', en: 'Stop' } };
const RULE = { lapsedDays: 90, maxLapsedDays: 400, minDelivered: 1 };

describe.skipIf(!process.env.TEST_DATABASE_ADMIN_URL)('win-back campaigns on PostgreSQL (PR 300)', () => {
  let f: CustomersFixture;
  let writer: { actor: { staffUserId: string }; storeId: number };
  let sender: { actor: { staffUserId: string }; storeId: number };
  const ids: Record<string, string> = {};
  let n = 0;
  const ago = (d: number) => new Date(f.clock.now.getTime() - d * DAY);
  const order = (customerId: string, phone: string, daysAgo: number, status: 'DELIVERED' | 'RETURNED' = 'DELIVERED') =>
    f.t.prisma.order.create({
      data: { storeId: f.S, number: `W300-${++n}`, source: 'WEBSITE', currency: 'BDT', status, placedAt: ago(daysAgo + 3), deliveredAt: status === 'DELIVERED' ? ago(daysAgo) : null, subtotalMinor: 150_000, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: 150_000, paymentMethod: 'COD', customerId, phone, idempotencyKey: `w300-${n}` },
    });
  const yes = (customerId: string, phone: string, granted = true, scope = 'MARKETING') => f.t.prisma.consentRecord.create({ data: { storeId: f.S, customerId, phone, channel: 'SMS', granted, scope, source: 'checkout' } });
  const queued = (broadcastId: string) => f.t.prisma.notificationLog.findMany({ where: { storeId: f.S, broadcastId, step: CRM_CAMPAIGN_STEP }, select: { customerId: true, recipient: true, status: true, dedupeKey: true, templateId: true } });

  beforeAll(async () => {
    f = await setUpCustomers('customers-winback');
    await f.t.prisma.order.updateMany({ where: { storeId: f.S }, data: { archivedAt: f.clock.now } });
    ids.a = await f.profile({ phone: N.a, name: 'Lapsed yes' });
    ids.b = await f.profile({ phone: N.b, name: 'Lapsed no answer' });
    ids.c = await f.profile({ phone: N.c, name: 'Lapsed stopped' });
    ids.d = await f.profile({ phone: N.d, name: 'Recent buyer' });
    ids.e = await f.profile({ phone: N.e, name: 'Long gone' });
    ids.s = await f.profile({ phone: N.s, name: 'Only refused' });
    await order(ids.a, N.a, 120);
    await order(ids.a, N.a, 200);
    await order(ids.b, N.b, 100);
    await order(ids.c, N.c, 150);
    await order(ids.d, N.d, 10);
    await order(ids.e, N.e, 500);
    await order(ids.s, N.s, 150, 'RETURNED');
    for (const k of ['a', 'c', 'd', 'e', 's'] as const) await yes(ids[k]!, N[k]);
    await yes(ids.c, N.c, false, 'ALL');
    await f.t.prisma.notificationTemplate.create({ data: { storeId: f.S, key: 'crm.missYou', name: 'We miss you', channel: 'SMS', locale: 'bn', body: '{customerName}, অনেক দিন দেখা নেই' } });
    ids.wa = (await f.t.prisma.notificationTemplate.create({ data: { storeId: f.S, key: 'crm.missYouWa', name: 'We miss you WA', channel: 'WHATSAPP', locale: 'bn', body: '{customerName}, অনেক দিন দেখা নেই' } })).id;
    ids.tpl = (await f.t.prisma.notificationTemplate.findFirstOrThrow({ where: { storeId: f.S, key: 'crm.missYou' } })).id;
    const mk = async (key: string, permissions: string[]) => {
      const role = await createRole(f.t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions });
      const u = await f.t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await f.t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.S } });
      return { actor: { staffUserId: u.id }, storeId: f.S };
    };
    writer = await mk('w300-writer', ['messages.journey.read', 'messages.campaigns.write']);
    sender = await mk('w300-sender', ['messages.journey.read', 'messages.campaigns.write', 'messages.campaigns.send', 'messages.automations.write']);
  });
  afterAll(async () => f?.t.drop());

  const draft = { name: 'Come back', channel: 'SMS', segmentId: null, rule: RULE } as const;

  it('off as shipped: no run, no saving; seeing needs messages.journey.read', async () => {
    expect(await runWinbacks(f.customersDeps(), f.S)).toBeNull();
    await expect(saveCampaign(f.customersDeps(), writer, null, { ...draft, templateId: ids.tpl })).rejects.toMatchObject({ code: 'SWITCHED_OFF' });
    expect((await campaignsScreen(f.customersDeps(), writer)).enabled).toBe(false);
    await expect(campaignsScreen(f.customersDeps(), { actor: { staffUserId: '00000000-0000-7000-8000-000000000000' }, storeId: f.S })).rejects.toBeTruthy();
  });

  it('a draft: the key, its rule and its template on its channel are checked; audited', async () => {
    f.overrides.set('customers.winback', ON);
    await expect(saveCampaign(f.customersDeps(), f.viewer, null, { ...draft, templateId: ids.tpl })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(saveCampaign(f.customersDeps(), writer, null, { ...draft, templateId: ids.wa })).rejects.toMatchObject({ code: 'INVALID_INPUT', details: ['templateId'] });
    const orderText = await f.t.prisma.notificationTemplate.findFirst({ where: { storeId: f.S, channel: 'SMS', key: { startsWith: 'order.' } }, select: { id: true } });
    if (orderText) await expect(saveCampaign(f.customersDeps(), writer, null, { ...draft, templateId: orderText.id })).rejects.toMatchObject({ code: 'INVALID_INPUT', details: ['templateId'] });
    await expect(saveCampaign(f.customersDeps(), writer, null, { ...draft, templateId: ids.tpl, rule: { ...RULE, maxLapsedDays: 60 } })).rejects.toMatchObject({ code: 'INVALID_INPUT', details: ['rule.maxLapsedDays'] });
    await expect(saveCampaign(f.customersDeps(), writer, null, { ...draft, templateId: ids.tpl, rule: { ...RULE, discountPercent: 10 } })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const e = await saveCampaign(f.customersDeps(), writer, null, { ...draft, templateId: ids.tpl });
    ids.camp = e.campaign!.id;
    expect(e.campaign).toMatchObject({ name: 'Come back', status: 'DRAFT', channel: 'SMS', rule: RULE, templateId: ids.tpl });
    expect(readWinbackRule((await f.t.prisma.broadcast.findUniqueOrThrow({ where: { id: ids.camp } })).rule)).toEqual(RULE);
    expect(await f.t.prisma.auditLog.count({ where: { action: 'campaign.create', entityId: ids.camp } })).toBe(1);
    await expect(saveCampaign(f.customersDeps(), writer, ids.camp, { ...draft, templateId: ids.tpl, version: '2000-01-01T00:00:00.000Z' })).rejects.toMatchObject({ code: 'STALE' });
  });

  it('the audience: lapsed in the window with a delivery; a number; a yes and no stop; the estimated cost from real costs', async () => {
    const a = await winbackAudience(f.customersDeps(), f.S, { channel: 'SMS', rule: RULE, segmentId: null });
    // a (120 days), b (100, no answer), c (150, stopped); not d (recent), e (500: past the 400), s (no delivery)
    expect(a).toMatchObject({ people: 3, withPhone: 3, reachable: 1, recent: 0, willGet: 1, estimatedCostMinor: null });
    await f.t.prisma.notificationLog.create({ data: { storeId: f.S, channel: 'SMS', recipient: 'x', status: 'SENT', dedupeKey: 'w300-cost', sentAt: ago(1), costMinor: 35 } });
    expect((await winbackAudience(f.customersDeps(), f.S, { channel: 'SMS', rule: RULE, segmentId: null })).estimatedCostMinor).toBe(35);
    expect((await winbackAudience(f.customersDeps(), f.S, { channel: 'SMS', rule: { ...RULE, maxLapsedDays: null }, segmentId: null })).willGet).toBe(2); // e comes in
    const ed = await campaignEditor(f.customersDeps(), writer, ids.camp!);
    expect(ed!.audience).toMatchObject({ willGet: 1 });
    expect(ed!.templates.map((t) => t.key)).toEqual(['crm.missYou', 'crm.missYouWa']);
  });

  it('scheduling needs messages.campaigns.send; the run queues the reachable once at the throttle; SENT when nothing waits', async () => {
    await expect(changeCampaign(f.customersDeps(), writer, ids.camp!, { action: 'schedule' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await changeCampaign(f.customersDeps(), sender, ids.camp!, { action: 'schedule' });
    await expect(saveCampaign(f.customersDeps(), writer, ids.camp!, { ...draft, templateId: ids.tpl })).rejects.toMatchObject({ code: 'NOT_ACTIVE' });
    const r = await runWinbacks(f.customersDeps(), f.S);
    expect(r).toEqual({ started: 1, queued: 1, finished: 0 });
    expect(await queued(ids.camp!)).toEqual([{ customerId: ids.a, recipient: N.a, status: 'QUEUED', dedupeKey: winbackKey(ids.camp!, ids.a!), templateId: ids.tpl }]);
    expect(await runWinbacks(f.customersDeps(), f.S)).toEqual({ started: 0, queued: 0, finished: 0 }); // twice: nothing twice
    // the engine sent it: the campaign is done; a new campaign leaves her out within the gap
    await f.t.prisma.notificationLog.updateMany({ where: { broadcastId: ids.camp }, data: { status: 'SENT', sentAt: f.clock.now, costMinor: 35 } });
    expect(await runWinbacks(f.customersDeps(), f.S)).toEqual({ started: 0, queued: 0, finished: 1 });
    const ed = await campaignEditor(f.customersDeps(), writer, ids.camp!);
    expect(ed!.campaign!.status).toBe('SENT');
    expect(ed!.results).toMatchObject({ queued: 1, sent: 1, costMinor: 35 });
    expect((await winbackAudience(f.customersDeps(), f.S, { channel: 'SMS', rule: RULE, segmentId: null })).recent).toBe(1);
    const two = await saveCampaign(f.customersDeps(), writer, null, { ...draft, name: 'Again', templateId: ids.tpl });
    await expect(changeCampaign(f.customersDeps(), sender, two.campaign!.id, { action: 'schedule' })).rejects.toMatchObject({ code: 'LIMIT_REACHED' });
  });

  it('pause holds it; cancel leaves out what waits; nothing sent is taken back; audited', async () => {
    await yes(ids.b!, N.b);
    const e = await saveCampaign(f.customersDeps(), writer, null, { ...draft, name: 'Third', templateId: ids.tpl });
    const id = e.campaign!.id;
    await changeCampaign(f.customersDeps(), sender, id, { action: 'schedule', at: new Date(f.clock.now.getTime() + DAY).toISOString() });
    expect(await runWinbacks(f.customersDeps(), f.S)).toMatchObject({ started: 0 }); // not yet
    f.clock.now = new Date(f.clock.now.getTime() + DAY + 1_000);
    await changeCampaign(f.customersDeps(), sender, id, { action: 'pause' });
    expect(await runWinbacks(f.customersDeps(), f.S)).toMatchObject({ started: 0, queued: 0 });
    await changeCampaign(f.customersDeps(), sender, id, { action: 'resume' });
    expect(await runWinbacks(f.customersDeps(), f.S)).toMatchObject({ started: 1, queued: 1 });
    await changeCampaign(f.customersDeps(), sender, id, { action: 'cancel' });
    expect((await queued(id)).map((x) => x.status)).toEqual(['SKIPPED']);
    expect(await f.t.prisma.broadcast.count({ where: { id } })).toBe(1);
    expect(await f.t.prisma.auditLog.count({ where: { entityId: id, action: { in: ['campaign.schedule', 'campaign.pause', 'campaign.resume', 'campaign.cancel'] } } })).toBe(4);
  });

  it('SIM-F-032: the product-life reminder, her points, and the win-back once she stops ordering', async () => {
    const p = await f.profile({ phone: '+8801700003017', name: 'Repeat buyer' });
    await yes(p, '+8801700003017');
    await order(p, '+8801700003017', 31);
    await order(p, '+8801700003017', 25);
    // the product-life reminder (PR 289): 30 days after a delivered order
    f.overrides.set('customers.journeys', { enabled: true, maxJourneys: 20, maxSteps: 10, perCustomerPerWeek: 2, catchUpDays: 7, batchSize: 500, stopLine: { bn: '', en: '' } });
    const j = await saveJourney(f.customersDeps(), sender, null, { name: 'Polo life', trigger: { type: 'delivered', days: 30, category: null }, plan: { v: 1, exitOnOrder: true, steps: [{ kind: 'send', channel: 'SMS', template: 'crm.missYou' }] } });
    await switchJourney(f.customersDeps(), sender, j.journey!.id, { enabled: true });
    await runJourneys(f.customersDeps(), f.S);
    expect(await f.t.prisma.notificationLog.count({ where: { customerId: p, step: CRM_MESSAGE_STEP } })).toBe(1);
    // her points (PR 296), by the owner's own rule
    f.overrides.set('customers.points', { enabled: true, pointsPer100: 1, orderPoints: 10, holdDays: 7, lookbackDays: 60, redeemPoints: 0, redeemMinor: 0, batchSize: 200 });
    await runPoints(f.customersDeps(), f.S);
    expect(await balanceOf(f.t.prisma, f.S, p)).toBe(2 * (15 + 10));
    // she stops ordering: 95 days later the win-back names her
    f.clock.now = new Date(f.clock.now.getTime() + 95 * DAY);
    const aud = await winbackAudience(f.customersDeps(), f.S, { channel: 'SMS', rule: { lapsedDays: 90, maxLapsedDays: 200, minDelivered: 2 }, segmentId: null });
    expect(aud.willGet).toBe(1);
    const e = await saveCampaign(f.customersDeps(), writer, null, { name: 'Repeat buyers back', channel: 'SMS', segmentId: null, templateId: ids.tpl, rule: { lapsedDays: 90, maxLapsedDays: 200, minDelivered: 2 } });
    await changeCampaign(f.customersDeps(), sender, e.campaign!.id, { action: 'schedule' });
    await runWinbacks(f.customersDeps(), f.S);
    expect((await queued(e.campaign!.id)).map((x) => x.customerId)).toEqual([p]);
  });
});
