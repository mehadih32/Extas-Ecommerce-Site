// PR 151 on a real PostgreSQL (a throwaway database with the real migrations and the sample store; orders placed
// through the real checkout; skipped without TEST_DATABASE_ADMIN_URL): the order export — the list's filters or the
// ticked orders as a CSV file, the personal columns only with their own key, the owner's columns and limit, the formula
// guard, and the ExportJob and audit rows. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { parseCsv } from '@extas/catalogue';
import { ORDER_EXPORT_COLUMNS } from '@extas/settings';
import { exportOrders, localTime, type Who } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 151 · the order export (PostgreSQL)', () => {
  let f: OrdersFixture;
  let clerk: Who;
  let a: { orderId: string; number: string };
  let b: { orderId: string; number: string };
  let c: { orderId: string; number: string };
  const d = () => f.ordersDeps();
  const db = () => f.t.prisma;
  const table = (csv: string) => {
    const [head, ...rows] = parseCsv(csv, ',').filter((r) => r.some((x) => x !== ''));
    return { head: head!, rows, col: (row: string[], name: string) => row[head!.indexOf(name)] };
  };

  beforeAll(async () => {
    f = await setUpOrders('export');
    const role = await createRole(db(), SYSTEM, { key: 'test-export', nameEn: 'export', nameBn: 'export', permissions: ['orders.read', 'orders.export'] });
    const u = await db().staffUser.create({ data: { email: 'export@example.com', displayName: 'Export clerk', passwordHash: 'not-a-login' } });
    await db().staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.S } });
    clerk = { actor: { staffUserId: u.id }, storeId: f.S };
    a = await f.place('export-a');
    b = await f.place('export-b', { phone: '01700001510' });
    c = await f.place('export-c', { payment: { method: 'mobile', option: 'bkash' }, pay: true });
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('needs `orders.export`; staff with the personal key get every column, the file a spreadsheet opens', async () => {
    expect(await code(exportOrders(d(), f.reader))).toBe('FORBIDDEN');
    const x = await exportOrders(d(), f.staff);
    expect(x.csv.startsWith('﻿')).toBe(true);
    expect(x.csv).toContain('\r\n');
    expect(x.fileName).toMatch(/^orders-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(x.personal).toBe(true);
    const t = table(x.csv);
    expect(t.head).toEqual([...ORDER_EXPORT_COLUMNS]);
    expect(x.rows).toBe(t.rows.length);
    // newest first
    expect(t.rows.slice(0, 3).map((r) => t.col(r, 'number'))).toEqual([c.number, b.number, a.number]);
    const rowB = t.rows.find((r) => t.col(r, 'number') === b.number)!;
    const o = await db().order.findUniqueOrThrow({ where: { id: b.orderId } });
    // a cell starting with + is written as text (the formula guard), so a spreadsheet keeps the number as typed
    expect(t.col(rowB, 'phone')).toBe("'+8801700001510");
    expect(t.col(rowB, 'paymentMethod')).toBe('COD');
    expect(t.col(rowB, 'total')).toBe(String(o.totalMinor / 100));
    expect(t.col(rowB, 'due')).toBe(String(o.totalMinor / 100));
    expect(t.col(rowB, 'placedAt')).toBe(localTime(o.placedAt, 'Asia/Dhaka'));
    expect(t.col(rowB, 'pieces')).toBe('1');
    // the paid order owes nothing
    const rowC = t.rows.find((r) => t.col(r, 'number') === c.number)!;
    expect(t.col(rowC, 'due')).toBe('0');

    // recorded: the export and who made it, how many rows, with personal details
    const job = await db().exportJob.findUniqueOrThrow({ where: { id: x.exportId } });
    expect(job).toMatchObject({ kind: 'orders.csv', status: 'SUCCEEDED', rowCount: x.rows, requestedById: f.staffId, excludesOwnerData: false });
    expect(await db().auditLog.findFirst({ where: { action: 'orders.export', entityId: x.exportId } })).toMatchObject({ actorId: f.staffId, after: { rows: x.rows, personal: true } });
  });

  it('without `orders.exportPersonal` no column names a person', async () => {
    const x = await exportOrders(d(), clerk);
    const t = table(x.csv);
    expect(x.personal).toBe(false);
    for (const p of ['customerName', 'phone', 'email', 'address']) expect(t.head).not.toContain(p);
    expect(x.csv).not.toContain('01700001510');
    expect(x.csv).not.toContain('Test Customer');
    // the owner's columns with only personal ones leave nothing to export
    f.overrides.set('orders.export.columns', ['phone', 'address']);
    try {
      expect(await code(exportOrders(d(), clerk))).toBe('INVALID_INPUT');
    } finally {
      f.overrides.delete('orders.export.columns');
    }
  });

  it('the ticked orders only, the list filters, the owner columns and separator, and a limit that refuses (never cuts)', async () => {
    const ticked = await exportOrders(d(), f.staff, { ids: [a.orderId, c.orderId, '0192f0e0-0000-7000-8000-000000000151'] });
    expect(table(ticked.csv).rows.map((r) => r[0])).toEqual([c.number, a.number]);
    const cod = await exportOrders(d(), f.staff, { payment: 'BKASH' });
    expect(table(cod.csv).rows.map((r) => r[0])).toEqual([c.number]);
    const byPhone = await exportOrders(d(), f.staff, { q: '01700001510' });
    expect(table(byPhone.csv).rows.map((r) => r[0])).toEqual([b.number]);
    expect(await code(exportOrders(d(), f.staff, { status: 'LOST' }))).toBe('INVALID_INPUT');
    expect(await code(exportOrders(d(), f.staff, { cursor: 'x' }))).toBe('INVALID_INPUT');

    f.overrides.set('orders.export.columns', ['number', 'due']);
    f.overrides.set('orders.export.delimiter', ';');
    try {
      const x = await exportOrders(d(), f.staff, { ids: [a.orderId] });
      expect(x.csv.split('\r\n')[0]).toBe('﻿number;due');
    } finally {
      f.overrides.delete('orders.export.columns');
      f.overrides.delete('orders.export.delimiter');
    }

    f.overrides.set('orders.export.maxRows', 2);
    try {
      const e = await exportOrders(d(), f.staff).catch((x: unknown) => x as { code: string; data: Record<string, unknown> });
      expect(e).toMatchObject({ code: 'EXPORT_TOO_LARGE', data: { maxRows: 2 } });
      expect((await exportOrders(d(), f.staff, { ids: [a.orderId, b.orderId] })).rows).toBe(2);
    } finally {
      f.overrides.delete('orders.export.maxRows');
    }
  });

  it('a cell a spreadsheet would run as a formula is written as text', async () => {
    await db().order.update({ where: { id: a.orderId }, data: { customerName: '=HYPERLINK("http://example.com","x")' } });
    const x = await exportOrders(d(), f.staff, { ids: [a.orderId] });
    const t = table(x.csv);
    expect(t.col(t.rows[0]!, 'customerName')).toBe(`'=HYPERLINK("http://example.com","x")`);
  });
});
