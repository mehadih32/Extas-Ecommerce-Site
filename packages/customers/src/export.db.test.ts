// PR 299 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// the customer export — off as shipped; its own key and a reason; the list's people under the retention rule (never an
// erased or archived profile, a merged one counted under his person, never an address); the number as the person may
// see it; a formula never reaches a spreadsheet; more than the owner's limit refused with the count; an ExportJob row and
// an audit line with the reason. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canExport, exportCustomers } from './export';
import { setUpCustomers, type CustomersFixture } from './testing';

// hardcode-ok: made-up test numbers
const N = { a: '+8801700002991', b: '+8801700002992', e: '+8801700002993', x: '+8801700002994', f: '+8801700002995' };
const WHY = 'Eid offer list for the call team';

describe.skipIf(!process.env.TEST_DATABASE_ADMIN_URL)('customer export on PostgreSQL (PR 299)', () => {
  let f: CustomersFixture;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    f = await setUpCustomers('customers-export');
    const p = f.t.prisma;
    ids.a = await f.profile({ phone: N.a, name: 'Export Kept', email: 'kept@example.test' });
    ids.b = await f.profile({ phone: N.b, name: 'Export Merged' });
    ids.e = await f.profile({ phone: N.e, name: 'Export Erased' });
    ids.x = await f.profile({ phone: N.x, name: 'Export Archived' });
    ids.f = await f.profile({ phone: N.f, name: '=HYPERLINK("http://x.test")' });
    await p.customer.update({ where: { id: ids.b }, data: { mergedIntoId: ids.a, mergedAt: f.clock.now } });
    await p.customer.update({ where: { id: ids.e }, data: { erasedAt: f.clock.now } });
    await p.customer.update({ where: { id: ids.x }, data: { archivedAt: f.clock.now } });
  });
  afterAll(async () => f?.t.drop());

  it('off as shipped; needs its own key and a reason', async () => {
    const d = f.customersDeps();
    await expect(exportCustomers(d, f.manager, { reason: WHY })).rejects.toMatchObject({ code: 'SWITCHED_OFF' });
    expect(await canExport(d, f.manager)).toBe(false);
    f.overrides.set('customers.export', { enabled: true, maxRows: 5_000 });
    expect(await canExport(d, f.manager)).toBe(true);
    expect(await canExport(d, f.viewer)).toBe(false);
    await expect(exportCustomers(d, f.viewer, { reason: WHY })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(exportCustomers(d, f.manager, { reason: 'x' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(exportCustomers(d, f.manager, {})).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(await f.t.prisma.exportJob.count({ where: { storeId: f.S } })).toBe(0);
  });

  it('the list\'s people under the retention rule, a formula made harmless, logged with the reason', async () => {
    const x = await exportCustomers(f.customersDeps(), f.manager, { reason: WHY, q: '017000029' });
    const lines = x.csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n');
    expect(lines[0]).toBe('name,phone,email,source,firstSeen,merged,orders,ordered,delivered,sales,refused,exchanges,lastOrder,smsOffers,whatsappOffers');
    expect(x.rows).toBe(2);
    const body = lines.slice(1).join('\n');
    expect(body).toContain('Export Kept');
    expect(body).toContain('kept@example.test');
    expect(body).not.toContain('Export Merged');
    expect(body).not.toContain('Export Erased');
    expect(body).not.toContain('Export Archived');
    expect(body).toContain(`"'=HYPERLINK(""http://x.test"")"`);
    const kept = lines.find((l) => l.startsWith('Export Kept'))!.split(',');
    expect(kept[5]).toBe('1'); // the merged profile, counted under him
    expect(x.fullPhone).toBe(true);
    expect(kept[1]).toBe('01700-002991'); // as the screen writes it
    const job = await f.t.prisma.exportJob.findUniqueOrThrow({ where: { id: x.exportId } });
    expect(job).toMatchObject({ kind: 'customers.csv', status: 'SUCCEEDED', rowCount: 2, requestedById: f.manager.actor.staffUserId });
    const a = await f.t.prisma.auditLog.findFirstOrThrow({ where: { storeId: f.S, action: 'customers.export', entityId: x.exportId } });
    expect(a.after).toMatchObject({ rows: 2, reason: WHY, fullPhone: true, filters: { q: '017000029', view: 'all' } });
  });

  it('the number masked without customers.phone; more than the limit refused with the count', async () => {
    const { createRole, SYSTEM } = await import('@extas/auth');
    const role = await createRole(f.t.prisma, SYSTEM, { key: 'a299-export', nameEn: 'export', nameBn: 'export', permissions: ['customers.read', 'customers.export'] });
    const staff = await f.t.prisma.staffUser.create({ data: { email: 'a299@example.test', displayName: 'Exporter', passwordHash: 'not-a-login' } });
    await f.t.prisma.staffRoleAssignment.create({ data: { staffUserId: staff.id, roleId: role.id, storeId: f.S } });
    const who = { actor: { staffUserId: staff.id }, storeId: f.S };
    const x = await exportCustomers(f.customersDeps(), who, { reason: WHY, q: '017000029' });
    expect(x.fullPhone).toBe(false);
    expect(x.csv).not.toContain('01700-002991');
    expect(x.csv).not.toContain('1700002991');
    f.overrides.set('customers.export', { enabled: true, maxRows: 1 });
    await expect(exportCustomers(f.customersDeps(), f.manager, { reason: WHY, q: '017000029' })).rejects.toMatchObject({ code: 'EXPORT_TOO_LARGE', data: { count: 2, maxRows: 1 } });
  });
});
