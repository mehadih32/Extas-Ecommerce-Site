// PR 535 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// the legacy customer import — off as shipped; only with `customers.import`; the preview saves nothing and counts new
// people, people already here (by phone), the same old order twice and bad numbers; the owner's row limit refuses a big
// file with its count; the import never overwrites a profile, never makes an order and never sends, makes the new
// profiles with no consent, never brings the same old order in twice, and is audited; the customer page reads the old
// orders; the undo archives (records, and the profiles it made that have no order since), never deletes. Every value
// is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { legacyHistory, legacyImportScreen, previewLegacyImport, runLegacyImport, undoLegacyImport } from './legacy-import';
import { setUpCustomers, type CustomersFixture } from './testing';

// hardcode-ok: made-up test numbers and file
const HERE = '+8801700005350';
const FILE = [
  'Name,Phone,Address,Date,Total,Status,Invoice',
  'Old Name,01700005350,Old address,01/02/2025,1000,Delivered,X-1',
  'New One,01700005352,Mirpur,02/02/2025,1500,Delivered,X-2',
  'New One,01700005352,Mirpur,03/02/2025,700,Returned,X-3',
  'New One,01700005352,Mirpur,03/02/2025,700,Returned,X-3',
  'Nobody,12345,Nowhere,04/02/2025,100,Delivered,X-4',
  'New Two,01800005353,Uttara,,200,Cancelled,X-5',
].join('\n');
const hints = { fields: { phone: ['phone'], name: ['name'], address: ['address'], orderedAt: ['date'], total: ['total'], status: ['status'], ref: ['invoice'] } };
const input = { fileName: 'old-orders.csv', csv: FILE, hints, statuses: { Delivered: 'delivered', Returned: 'returned', Cancelled: 'cancelled' } };

describe.skipIf(!process.env.TEST_DATABASE_ADMIN_URL)('legacy customer import on PostgreSQL (PR 535)', () => {
  let f: CustomersFixture;
  let here: string;
  const on = (v: Partial<(typeof registry)['customers.legacyImport']['default']> = {}) => f.overrides.set('customers.legacyImport', { ...registry['customers.legacyImport'].default, enabled: true, ...v });

  beforeAll(async () => {
    f = await setUpCustomers('customers-legacy');
    here = await f.profile({ phone: HERE, name: 'Kept Name' });
  });
  afterAll(async () => f?.t.drop());

  it('off as shipped; the import key only; the preview saves nothing and counts every kind of row', async () => {
    expect(registry['customers.legacyImport'].default).toEqual({ enabled: false, maxRows: 5_000 });
    await expect(previewLegacyImport(f.customersDeps(), f.manager, input)).rejects.toMatchObject({ code: 'SWITCHED_OFF' });
    on();
    const people = await f.t.prisma.customer.count({ where: { storeId: f.S } });
    await expect(previewLegacyImport(f.customersDeps(), f.viewer, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const p = await previewLegacyImport(f.customersDeps(), f.manager, input);
    expect(p.ready).toBe(true);
    expect(p.mapping).toEqual({ name: 0, phone: 1, address: 2, orderedAt: 3, total: 4, status: 5, ref: 6 });
    expect(p.counts).toEqual({ rows: 6, badPhone: 1, people: 3, newPeople: 2, matched: 1, sameInFile: 1, importedBefore: 0, toImport: 4, noDate: 1, outcomes: { delivered: 2, returned: 1, cancelled: 1, other: 0 } });
    expect(p.badLines).toEqual([6]);
    expect(p.sample.map((s) => s.fate)).toEqual(['matched', 'new', 'new', 'sameInFile', 'badPhone', 'new']);
    expect(await f.t.prisma.legacyImport.count({ where: { storeId: f.S } })).toBe(0);
    expect(await f.t.prisma.customer.count({ where: { storeId: f.S } })).toBe(people);
    await expect(previewLegacyImport(f.customersDeps(), f.manager, { ...input, mapping: { ...p.mapping, phone: 9 } })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    on({ maxRows: 5 });
    await expect(previewLegacyImport(f.customersDeps(), f.manager, input)).rejects.toMatchObject({ code: 'IMPORT_TOO_LARGE', data: { count: 6, maxRows: 5 } });
    on();
  });

  it('imports only when confirmed: history only, nothing overwritten, no order, no consent; never the same old order twice; audited', async () => {
    await expect(runLegacyImport(f.customersDeps(), f.manager, input)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const ordersBefore = await f.t.prisma.order.count({ where: { storeId: f.S } });
    const r = await runLegacyImport(f.customersDeps(), f.manager, { ...input, confirm: true });
    expect(r.counts.toImport).toBe(4);
    const kept = await f.t.prisma.customer.findUniqueOrThrow({ where: { id: here } });
    expect(kept).toMatchObject({ name: 'Kept Name', legacyImportId: null, firstSource: null });
    const made = await f.t.prisma.customer.findMany({ where: { storeId: f.S, legacyImportId: r.importId }, orderBy: { phone: 'asc' } });
    expect(made.map((c) => [c.phone, c.name, c.firstSource, c.smsMarketingConsent, c.orderCount])).toEqual([
      ['+8801700005352', 'New One', 'IMPORT', null, 0],
      ['+8801800005353', 'New Two', 'IMPORT', null, 0],
    ]);
    expect(made[0]!.createdAt.toISOString()).toBe('2025-02-02T12:00:00.000Z');
    expect(await f.t.prisma.order.count({ where: { storeId: f.S } })).toBe(ordersBefore);
    expect(await f.t.prisma.legacyOrderRecord.count({ where: { importId: r.importId } })).toBe(4);
    expect(await f.t.prisma.auditLog.count({ where: { action: 'customers.legacyImport', entityId: r.importId } })).toBe(1);
    const p2 = await previewLegacyImport(f.customersDeps(), f.manager, input);
    expect(p2.counts).toMatchObject({ importedBefore: 4, toImport: 0 });
    await expect(runLegacyImport(f.customersDeps(), f.manager, { ...input, confirm: true })).rejects.toMatchObject({ code: 'NOTHING_TO_IMPORT' });
    const screen = await legacyImportScreen(f.customersDeps(), f.viewer);
    expect(screen).toMatchObject({ enabled: true, canImport: false });
    expect(screen.imports[0]).toMatchObject({ id: r.importId, fileName: 'old-orders.csv', rowsTotal: 6, rowsImported: 4, duplicates: 1, newPeople: 2, matched: 1, by: 'Customers Staff', undoneAt: null });
    expect(await legacyHistory(f.customersDeps(), f.viewer, [here])).toMatchObject({ imported: false, orders: 1, outcomes: { delivered: 1 } });
    expect(await legacyHistory(f.customersDeps(), f.viewer, [made[0]!.id])).toMatchObject({ imported: true, orders: 2, outcomes: { delivered: 1, returned: 1 } });
  });

  it('undo archives, never deletes: the records, and the profiles it made with no order since; a second undo is refused', async () => {
    const imp = await f.t.prisma.legacyImport.findFirstOrThrow({ where: { storeId: f.S } });
    const made = await f.t.prisma.customer.findMany({ where: { legacyImportId: imp.id }, orderBy: { phone: 'asc' } });
    await f.t.prisma.order.create({
      data: { storeId: f.S, number: 'L535-1', source: 'WEBSITE', currency: 'BDT', status: 'PLACED', placedAt: f.clock.now, subtotalMinor: 1_000, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: 1_000, paymentMethod: 'COD', customerId: made[0]!.id, phone: made[0]!.phone!, idempotencyKey: 'l535-1' },
    });
    await expect(undoLegacyImport(f.customersDeps(), f.viewer, imp.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await undoLegacyImport(f.customersDeps(), f.manager, imp.id, { reason: 'wrong file' })).toEqual({ records: 4, profilesArchived: 1, profilesKept: 1 });
    await expect(undoLegacyImport(f.customersDeps(), f.manager, imp.id)).rejects.toMatchObject({ code: 'ALREADY_UNDONE' });
    expect(await f.t.prisma.legacyOrderRecord.count({ where: { importId: imp.id } })).toBe(4);
    expect(await f.t.prisma.legacyOrderRecord.count({ where: { importId: imp.id, archivedAt: null } })).toBe(0);
    const after = await f.t.prisma.customer.findMany({ where: { legacyImportId: imp.id }, orderBy: { phone: 'asc' } });
    expect(after.map((c) => !!c.archivedAt)).toEqual([false, true]);
    expect(await legacyHistory(f.customersDeps(), f.viewer, [here])).toBeNull();
    expect((await previewLegacyImport(f.customersDeps(), f.manager, input)).counts).toMatchObject({ importedBefore: 0, toImport: 4 });
  });
});
