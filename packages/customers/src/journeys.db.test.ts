// PR 289 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// automations — off as shipped; a journey is saved off, checked (its templates, its steps' limit, its name) and audited;
// on, a "N days after delivery" trigger (the product-life reminder, SIM-F-032) enrols the people whose order was delivered
// in the catch-up window, once each, and queues the first message in the log for the Messages engine; a wait holds him;
// a check he no longer passes ends his journey; a new order ends it when the journey says so; archiving stops everyone
// on it; only `messages.automations.write` builds. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM } from '@extas/auth';
import { CRM_MESSAGE_STEP } from '@extas/settings';
import { archiveJourney, journeysScreen, runJourneys, saveJourney, switchJourney } from './journeys';
import { setUpCustomers, type CustomersFixture } from './testing';

// hardcode-ok: made-up test numbers
const N = { a: '+8801700002891', b: '+8801700002892', c: '+8801700002893', d: '+8801700002894' };
const DAY = 86_400_000;
const ON = { enabled: true, maxJourneys: 20, maxSteps: 10, perCustomerPerWeek: 2, catchUpDays: 7, batchSize: 500, stopLine: { bn: '', en: '' } };

describe.skipIf(!process.env.TEST_DATABASE_ADMIN_URL)('automations on PostgreSQL (PR 289)', () => {
  let f: CustomersFixture;
  let builder: { actor: { staffUserId: string }; storeId: number };
  const ids: Record<string, string> = {};
  let n = 0;
  const ago = (d: number) => new Date(f.clock.now.getTime() - d * DAY);
  const order = (customerId: string, phone: string, deliveredDaysAgo: number) =>
    f.t.prisma.order.create({
      data: { storeId: f.S, number: `J289-${++n}`, source: 'WEBSITE', currency: 'BDT', status: 'DELIVERED', placedAt: ago(deliveredDaysAgo + 3), deliveredAt: ago(deliveredDaysAgo), subtotalMinor: 1_000, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: 1_000, paymentMethod: 'COD', customerId, phone, idempotencyKey: `j289-${n}` },
    });
  const life = { name: 'Polo life', trigger: { type: 'delivered', days: 30, category: null }, plan: { v: 1, exitOnOrder: true, steps: [{ kind: 'send', channel: 'SMS', template: 'crm.life' }, { kind: 'wait', days: 7 }, { kind: 'check', condition: { field: 'ordersMax', value: 1 } }, { kind: 'send', channel: 'SMS', template: 'crm.life' }] } };
  const queued = (customerId: string) => f.t.prisma.notificationLog.count({ where: { storeId: f.S, customerId, step: CRM_MESSAGE_STEP, status: 'QUEUED' } });
  const state = async (journeyId: string, customerId: string) => f.t.prisma.journeyEnrollment.findFirst({ where: { journeyId, customerId }, select: { status: true, reason: true, currentStep: true } });

  beforeAll(async () => {
    f = await setUpCustomers('customers-journeys');
    ids.a = await f.profile({ phone: N.a, name: 'Once', createdAt: ago(1) });
    ids.b = await f.profile({ phone: N.b, name: 'Twice', createdAt: ago(1) });
    ids.c = await f.profile({ phone: N.c, name: 'Long ago', createdAt: ago(1) });
    ids.d = await f.profile({ phone: N.d, name: 'Came back', createdAt: ago(1) });
    await order(ids.a, N.a, 32);
    await order(ids.b, N.b, 33);
    await order(ids.b, N.b, 50);
    await order(ids.c, N.c, 60);
    await order(ids.d, N.d, 31);
    await f.t.prisma.notificationTemplate.create({ data: { storeId: f.S, key: 'crm.life', name: 'Life reminder', channel: 'SMS', locale: 'bn', body: '{customerName}, নতুন পোলো?' } });
    const role = await createRole(f.t.prisma, SYSTEM, { key: 'j289-builder', nameEn: 'auto', nameBn: 'auto', permissions: ['messages.journey.read', 'messages.automations.write'] });
    const u = await f.t.prisma.staffUser.create({ data: { email: 'j289@example.com', displayName: 'Auto', passwordHash: 'not-a-login' } });
    await f.t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.S } });
    builder = { actor: { staffUserId: u.id }, storeId: f.S };
  });
  afterAll(async () => f?.t.drop());

  it('off as shipped: no run, no saving', async () => {
    expect(await runJourneys(f.customersDeps(), f.S)).toBeNull();
    await expect(saveJourney(f.customersDeps(), builder, null, life)).rejects.toMatchObject({ code: 'SWITCHED_OFF' });
    expect((await journeysScreen(f.customersDeps(), builder)).enabled).toBe(false);
  });

  it('saving: only with the key; every template must exist on its channel; the step limit; saved off and audited', async () => {
    f.overrides.set('customers.journeys', ON);
    await expect(saveJourney(f.customersDeps(), f.manager, null, life)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const bad = { ...life, plan: { ...life.plan, steps: [{ kind: 'send', channel: 'WHATSAPP', template: 'crm.life' }] } };
    await expect(saveJourney(f.customersDeps(), builder, null, bad)).rejects.toMatchObject({ code: 'INVALID_INPUT', details: ['plan.steps.0.template'] });
    await expect(saveJourney(f.customersDeps(), builder, null, { ...life, plan: { ...life.plan, steps: [{ kind: 'wait', days: 3 }] } })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    f.overrides.set('customers.journeys', { ...ON, maxSteps: 3 });
    await expect(saveJourney(f.customersDeps(), builder, null, life)).rejects.toMatchObject({ code: 'LIMIT_REACHED' });
    f.overrides.set('customers.journeys', ON);
    const saved = await saveJourney(f.customersDeps(), builder, null, life);
    ids.life = saved.journey!.id;
    expect(saved.journey).toMatchObject({ name: 'Polo life', enabled: false, trigger: { type: 'delivered', days: 30 } });
    await expect(saveJourney(f.customersDeps(), builder, null, life)).rejects.toMatchObject({ code: 'NAME_TAKEN' });
    expect(await f.t.prisma.auditLog.count({ where: { action: 'journey.create', entityId: ids.life } })).toBe(1);
  });

  it('on: the delivered-in-window people are enrolled once and get the first message queued; a wait holds them', async () => {
    expect(await runJourneys(f.customersDeps(), f.S)).toMatchObject({ enrolled: 0 }); // the journey itself is still off
    await switchJourney(f.customersDeps(), builder, ids.life!, { enabled: true });
    const r = await runJourneys(f.customersDeps(), f.S);
    expect(r).toMatchObject({ enrolled: 3, moved: 3, queued: 3 });
    for (const p of ['a', 'b', 'd']) expect(await queued(ids[p]!)).toBe(1);
    expect(await queued(ids.c!)).toBe(0); // delivered 60 days ago: outside the catch-up window
    expect(await f.t.prisma.notificationLog.findFirst({ where: { customerId: ids.a, step: CRM_MESSAGE_STEP } })).toMatchObject({ recipient: N.a, channel: 'SMS', orderId: null });
    expect(await state(ids.life!, ids.a!)).toMatchObject({ status: 'ACTIVE', currentStep: 2 });
    expect(await runJourneys(f.customersDeps(), f.S)).toMatchObject({ enrolled: 0, moved: 0, queued: 0 }); // run twice: nothing twice
  });

  it('after the wait: the check passes (second message, done), fails (left), or a new order ends it', async () => {
    await f.t.prisma.order.create({
      data: { storeId: f.S, number: 'J289-new', source: 'WEBSITE', currency: 'BDT', status: 'PLACED', placedAt: new Date(f.clock.now.getTime() + DAY), subtotalMinor: 1_000, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: 1_000, paymentMethod: 'COD', customerId: ids.d, phone: N.d, idempotencyKey: 'j289-new' },
    });
    f.clock.now = new Date(f.clock.now.getTime() + 8 * DAY);
    const r = await runJourneys(f.customersDeps(), f.S);
    expect(r).toMatchObject({ moved: 3, queued: 1, done: 1, exited: 2 });
    expect(await state(ids.life!, ids.a!)).toMatchObject({ status: 'DONE', reason: null });
    expect(await queued(ids.a!)).toBe(2);
    expect(await state(ids.life!, ids.b!)).toMatchObject({ status: 'EXITED', reason: 'NOT_MATCHED' });
    expect(await state(ids.life!, ids.d!)).toMatchObject({ status: 'EXITED', reason: 'ORDERED' });
    const screen = await journeysScreen(f.customersDeps(), builder);
    expect(screen.journeys[0]).toMatchObject({ name: 'Polo life', enabled: true, active: 0, done: 1, exited: 2, sends: 2 });
  });

  it('a "joined" journey; archiving it stops everyone on it (never deleted); restoring it comes back off', async () => {
    const saved = await saveJourney(f.customersDeps(), builder, null, { name: 'Welcome', trigger: { type: 'joined', days: 5 }, plan: { v: 1, exitOnOrder: false, steps: [{ kind: 'wait', days: 3 }, { kind: 'send', channel: 'SMS', template: 'crm.life' }] } });
    await switchJourney(f.customersDeps(), builder, saved.journey!.id, { enabled: true });
    // the profiles were made 9 days ago now (1 day before the start, and the clock moved 8): inside 5 days + 7 to catch up
    const r = await runJourneys(f.customersDeps(), f.S);
    expect(r!.enrolled).toBe(4);
    expect(await f.t.prisma.journeyEnrollment.count({ where: { journeyId: saved.journey!.id, status: 'ACTIVE' } })).toBe(4);
    await expect(archiveJourney(f.customersDeps(), f.viewer, saved.journey!.id, { archived: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await archiveJourney(f.customersDeps(), builder, saved.journey!.id, { archived: true });
    expect(await f.t.prisma.journeyEnrollment.count({ where: { journeyId: saved.journey!.id, status: 'EXITED', reason: 'STOPPED' } })).toBe(4);
    expect(await f.t.prisma.journey.count({ where: { id: saved.journey!.id } })).toBe(1);
    await archiveJourney(f.customersDeps(), builder, saved.journey!.id, { archived: false });
    expect(await f.t.prisma.journey.findUnique({ where: { id: saved.journey!.id }, select: { enabled: true, archivedAt: true } })).toEqual({ enabled: false, archivedAt: null });
    expect(await f.t.prisma.auditLog.count({ where: { action: { in: ['journey.archive', 'journey.restore', 'journey.switch'] }, entityId: saved.journey!.id } })).toBe(3);
  });
});
