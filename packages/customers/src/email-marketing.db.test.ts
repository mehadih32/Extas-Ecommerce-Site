// PR 290 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// e-mail marketing — off as shipped; templates are written and checked (only the words an offer e-mail fills, names
// unique, archived never deleted); a send is a draft until a person with `messages.email.send` schedules it, and only
// while someone in its audience said yes to offer e-mails; the run queues only those people (an address, a yes, no stop
// of every e-mail), once each, at the throttle; pause holds it, cancel leaves out what still waits; the results count
// the log; every change is audited. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM } from '@extas/auth';
import { CRM_EMAIL_STEP } from '@extas/settings';
import { archiveEmailTemplate, changeEmailSend, emailAudience, emailResults, emailScreen, emailSendEditor, runEmailSends, saveEmailSend, saveEmailTemplate } from './email-marketing';
import { setUpCustomers, type CustomersFixture } from './testing';

// hardcode-ok: made-up test numbers and addresses
const N = { a: '+8801700002901', b: '+8801700002902', c: '+8801700002903', d: '+8801700002904' };
const ON = { enabled: true, perCustomerPerWeek: 1, batchSize: 500, trackOpens: false, trackClicks: false, resultDays: 7, maxTemplates: 2, unsubscribeLine: { bn: 'বন্ধ করুন', en: 'Unsubscribe' } };

describe.skipIf(!process.env.TEST_DATABASE_ADMIN_URL)('e-mail marketing on PostgreSQL (PR 290)', () => {
  let f: CustomersFixture;
  let writer: { actor: { staffUserId: string }; storeId: number };
  let sender: { actor: { staffUserId: string }; storeId: number };
  const ids: Record<string, string> = {};
  const yes = (customerId: string, phone: string, granted: boolean, scope = 'MARKETING') => f.t.prisma.consentRecord.create({ data: { storeId: f.S, customerId, phone, channel: 'EMAIL', granted, scope, source: 'staff' } });
  const words = { subject: 'New polos, {customerName}', body: 'Hi {customerName}, see {link} and https://example.com/size-guide' };

  beforeAll(async () => {
    f = await setUpCustomers('customers-email');
    ids.a = await f.profile({ phone: N.a, name: 'Yes', email: 'yes@example.com' });
    ids.b = await f.profile({ phone: N.b, name: 'No answer', email: 'none@example.com' });
    ids.c = await f.profile({ phone: N.c, name: 'Stopped', email: 'stop@example.com' });
    ids.d = await f.profile({ phone: N.d, name: 'No address' });
    await yes(ids.a, N.a, true);
    await yes(ids.c, N.c, true);
    await yes(ids.c, N.c, false, 'ALL');
    await yes(ids.d, N.d, true);
    const mk = async (key: string, permissions: string[]) => {
      const role = await createRole(f.t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions });
      const u = await f.t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await f.t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.S } });
      return { actor: { staffUserId: u.id }, storeId: f.S };
    };
    writer = await mk('e290-writer', ['messages.journey.read', 'messages.email.write']);
    sender = await mk('e290-sender', ['messages.journey.read', 'messages.email.write', 'messages.email.send']);
  });
  afterAll(async () => f?.t.drop());

  it('off as shipped: no run, no saving', async () => {
    expect(await runEmailSends(f.customersDeps(), f.S)).toBeNull();
    await expect(saveEmailTemplate(f.customersDeps(), writer, null, { name: 'Winter', locale: 'en', ...words })).rejects.toMatchObject({ code: 'SWITCHED_OFF' });
    expect((await emailScreen(f.customersDeps(), writer)).enabled).toBe(false);
  });

  it('templates: only the offer words, names unique, the limit, archive and restore; audited', async () => {
    f.overrides.set('customers.email', ON);
    await expect(saveEmailTemplate(f.customersDeps(), f.viewer, null, { name: 'Winter', locale: 'en', ...words })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(saveEmailTemplate(f.customersDeps(), writer, null, { name: 'Winter', locale: 'en', subject: 'Due {amountDue}', body: 'x' })).rejects.toMatchObject({ code: 'INVALID_INPUT', details: ['subject'] });
    const t = await saveEmailTemplate(f.customersDeps(), writer, null, { name: 'Winter', locale: 'en', ...words });
    ids.t = t.template!.id;
    expect(t.template).toMatchObject({ name: 'Winter', locale: 'en', subject: words.subject });
    expect((await f.t.prisma.notificationTemplate.findUniqueOrThrow({ where: { id: ids.t } })).key).toMatch(/^crmEmail\./);
    await expect(saveEmailTemplate(f.customersDeps(), writer, null, { name: 'winter', locale: 'bn', ...words })).rejects.toMatchObject({ code: 'NAME_TAKEN' });
    await expect(saveEmailTemplate(f.customersDeps(), writer, ids.t, { name: 'Winter', locale: 'en', ...words, version: '2000-01-01T00:00:00.000Z' })).rejects.toMatchObject({ code: 'STALE' });
    await saveEmailTemplate(f.customersDeps(), writer, null, { name: 'Eid', locale: 'bn', ...words });
    await expect(saveEmailTemplate(f.customersDeps(), writer, null, { name: 'Third', locale: 'bn', ...words })).rejects.toMatchObject({ code: 'LIMIT_REACHED' });
    await archiveEmailTemplate(f.customersDeps(), writer, ids.t, { archived: true });
    const s = await emailScreen(f.customersDeps(), writer);
    expect(s.templates.map((x) => x.name)).toEqual(['Eid']);
    expect(s.archivedTemplates.map((x) => x.name)).toEqual(['Winter']);
    await archiveEmailTemplate(f.customersDeps(), writer, ids.t, { archived: false });
    expect(await f.t.prisma.auditLog.count({ where: { action: { startsWith: 'email.template.' }, entityId: ids.t } })).toBe(3);
  });

  it('the audience: only an address with a yes for offer e-mails and no stop is reachable', async () => {
    // the fixture's own checkout customer is there too (an address, no yes)
    const a = await emailAudience(f.customersDeps(), f.S, null);
    expect(a.reachable).toBe(1);
    expect(a.withEmail - a.reachable).toBeGreaterThanOrEqual(2);
    expect(a.people - a.withEmail).toBeGreaterThanOrEqual(1);
  });

  it('a send: a draft until scheduled by `messages.email.send`; queued once at the throttle; SENT when nothing waits', async () => {
    const draft = await saveEmailSend(f.customersDeps(), writer, null, { name: 'Winter drop', segmentId: null, templateId: ids.t, locale: 'en', ...words });
    ids.s = draft.send!.id;
    expect(draft.send).toMatchObject({ status: 'DRAFT', subject: words.subject });
    expect(draft.audience).toMatchObject({ reachable: 1 });
    await expect(changeEmailSend(f.customersDeps(), writer, ids.s, { action: 'schedule' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const sch = await changeEmailSend(f.customersDeps(), sender, ids.s, { action: 'schedule' });
    expect(sch.send!.status).toBe('SCHEDULED');
    await expect(saveEmailSend(f.customersDeps(), writer, ids.s, { name: 'Changed', segmentId: null, templateId: null, locale: 'en', ...words })).rejects.toMatchObject({ code: 'NOT_ACTIVE' });

    const r1 = await runEmailSends(f.customersDeps(), f.S);
    expect(r1).toEqual({ started: 1, queued: 1, finished: 0 });
    const rows = await f.t.prisma.notificationLog.findMany({ where: { broadcastId: ids.s } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ customerId: ids.a, recipient: 'yes@example.com', step: CRM_EMAIL_STEP, channel: 'EMAIL', status: 'QUEUED', locale: 'en' });
    expect(await runEmailSends(f.customersDeps(), f.S)).toEqual({ started: 0, queued: 0, finished: 0 });
    // the engine sends it (here: by hand), then the run finishes the send
    await f.t.prisma.notificationLog.update({ where: { id: rows[0]!.id }, data: { status: 'SENT', sentAt: f.clock.now, openedAt: f.clock.now } });
    expect(await runEmailSends(f.customersDeps(), f.S)).toEqual({ started: 0, queued: 0, finished: 1 });
    await f.t.prisma.order.create({ data: { storeId: f.S, number: 'E290-1', source: 'WEBSITE', currency: 'BDT', status: 'DELIVERED', placedAt: new Date(f.clock.now.getTime() + 3_600_000), deliveredAt: new Date(f.clock.now.getTime() + 86_400_000), subtotalMinor: 2_000, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: 2_000, paymentMethod: 'COD', customerId: ids.a, phone: N.a, idempotencyKey: 'e290-1' } });
    expect(await emailResults(f.customersDeps(), f.S, ids.s, 7)).toMatchObject({ queued: 1, sent: 1, opened: 1, clicked: 0, orders: 1, delivered: 1, deliveredValueMinor: 2_000 });
    const page = await emailSendEditor(f.customersDeps(), writer, ids.s);
    expect(page!.send!.status).toBe('SENT');
    expect(page!.audience).toBeNull();
  });

  it('pause holds the queue; cancel leaves out what still waits; nobody reachable cannot be scheduled', async () => {
    await yes(ids.b!, N.b, true);
    const d = await saveEmailSend(f.customersDeps(), writer, null, { name: 'Second', segmentId: null, templateId: null, locale: 'bn', ...words });
    await changeEmailSend(f.customersDeps(), sender, d.send!.id, { action: 'schedule' });
    await changeEmailSend(f.customersDeps(), sender, d.send!.id, { action: 'pause' });
    expect((await runEmailSends(f.customersDeps(), f.S))!.queued).toBe(0);
    await changeEmailSend(f.customersDeps(), sender, d.send!.id, { action: 'resume' });
    expect((await runEmailSends(f.customersDeps(), f.S))!.queued).toBe(2);
    const c = await changeEmailSend(f.customersDeps(), sender, d.send!.id, { action: 'cancel' });
    expect(c.send!.status).toBe('CANCELLED');
    expect(await f.t.prisma.notificationLog.count({ where: { broadcastId: d.send!.id, status: 'SKIPPED', reason: 'CANCELLED' } })).toBe(2);
    await expect(changeEmailSend(f.customersDeps(), sender, d.send!.id, { action: 'resume' })).rejects.toMatchObject({ code: 'NOT_ACTIVE' });

    await yes(ids.a!, N.a, false);
    await yes(ids.b!, N.b, false);
    const e = await saveEmailSend(f.customersDeps(), writer, null, { name: 'Nobody', segmentId: null, templateId: null, locale: 'bn', ...words });
    await expect(changeEmailSend(f.customersDeps(), sender, e.send!.id, { action: 'schedule' })).rejects.toMatchObject({ code: 'LIMIT_REACHED' });
    expect(await f.t.prisma.auditLog.count({ where: { action: { startsWith: 'email.send.' }, entityId: d.send!.id } })).toBe(5);
  });
});
