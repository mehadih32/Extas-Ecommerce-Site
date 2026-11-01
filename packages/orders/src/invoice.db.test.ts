// PR 407 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): one invoice per order, issued automatically,
// a new version (same number) only when the order is edited — never for a payment, a confirm or a status change; the
// number is made once and kept even when the owner changes the pattern later; old versions stay. Every value is a
// made-up test value; the clock is the fixture's fixed clock.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import type { Key } from '@extas/settings';
import { confirmOrder, editOrder, invoiceContentOf, invoiceFingerprint, invoiceList, invoiceNumberOf, invoiceOrders, invoiceSettings, issueDueInvoices, issueInvoice, latestInvoice, saveInvoiceSetting, type OrdersDeps } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe('PR 407 · the invoice number and fingerprint (pure)', () => {
  it('makes the number from the order number; {digits} keeps only the digits', () => {
    expect(invoiceNumberOf('INV-{digits}', 'EX-10042')).toBe('INV-10042');
    expect(invoiceNumberOf('{number}/A', 'EX-10042')).toBe('EX-10042/A');
    expect(invoiceNumberOf('INV-{digits}', 'ABC')).toBe('INV-ABC');
  });

  it('the same content gives the same fingerprint, whatever the key order; a changed line gives another', () => {
    const facts = {
      number: '1001',
      customerName: 'Test',
      phone: '01700000000', // hardcode-ok: a made-up test number
      email: null,
      shippingAddressText: 'House 1',
      isGift: false,
      giftSenderName: null,
      giftNote: null,
      giftHidePrices: false,
      subtotalMinor: 100,
      discountMinor: 0,
      deliveryChargeMinor: 10,
      walletAppliedMinor: 0,
      totalMinor: 110,
      chargeFixed: true,
      currency: 'BDT',
      items: [{ id: 'a', sku: 'S1', productName: 'Shirt', colourName: null, sizeLabel: 'M', quantity: 1, unitPriceMinor: 100, discountMinor: 0, lineTotalMinor: 100, comboGroupKey: null, isAddOn: false }],
    };
    const a = invoiceFingerprint(invoiceContentOf(facts));
    const shuffled = Object.fromEntries(Object.entries(invoiceContentOf(facts)).reverse()) as ReturnType<typeof invoiceContentOf>;
    expect(invoiceFingerprint(shuffled)).toBe(a);
    expect(invoiceFingerprint(invoiceContentOf({ ...facts, items: [{ ...facts.items[0]!, sizeLabel: 'L' }] }))).not.toBe(a);
  });
});

describe.skipIf(!HAS_TEST_DB)('PR 407 · issuing invoices (PostgreSQL)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;
  const d = () => f.ordersDeps();

  beforeAll(async () => {
    f = await setUpOrders('invoice_issue');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('issues version 1 once; asking again changes nothing; a confirm (a status change) makes no new version', async () => {
    const o = await f.place('inv-one');
    const first = await issueInvoice(d(), { storeId: f.S, orderId: o.orderId });
    expect(first?.outcome).toBe('issued');
    expect(first?.invoice).toMatchObject({ version: 1, reason: 'PLACED', number: invoiceNumberOf('INV-{digits}', o.number) });
    expect(first?.invoice.content.lines).toHaveLength(1);
    expect(first?.invoice.content.totalMinor).toBe((await db().order.findUniqueOrThrow({ where: { id: o.orderId } })).totalMinor);
    expect((await issueInvoice(d(), { storeId: f.S, number: o.number }))?.outcome).toBe('unchanged');
    await confirmOrder(d(), f.staff, o.orderId);
    expect((await issueInvoice(d(), { storeId: f.S, orderId: o.orderId }))?.outcome).toBe('unchanged');
    expect(await db().generatedDocument.count({ where: { orderId: o.orderId } })).toBe(1);
  });

  it('an edit (the phone) makes version 2 with the same number, even after the owner changed the pattern; version 1 stays', async () => {
    const o = await f.place('inv-edit');
    const v1 = await issueInvoice(d(), { storeId: f.S, orderId: o.orderId });
    f.overrides.set('account.invoice', { ...(await d().settings.value('account.invoice', { storeId: f.S })), number: 'BILL-{number}' });
    try {
      const version = (await db().order.findUniqueOrThrow({ where: { id: o.orderId } })).version;
      await editOrder(d(), f.staff, o.orderId, { phone: '01710-000407', reasonKey: 'wrong-phone' }, { version });
      const v2 = await issueInvoice(d(), { storeId: f.S, orderId: o.orderId });
      expect(v2?.outcome).toBe('revised');
      expect(v2?.invoice).toMatchObject({ version: 2, reason: 'EDITED', number: v1?.invoice.number });
      expect(v2?.invoice.content.phone).not.toBe(v1?.invoice.content.phone);
      expect(v2?.invoice.firstIssuedAt).toEqual(v1?.invoice.issuedAt);
      const rows = await db().generatedDocument.findMany({ where: { orderId: o.orderId }, orderBy: { version: 'asc' } });
      expect(rows.map((r) => [r.version, r.number, r.regeneratedReason])).toEqual([
        [1, v1?.invoice.number, 'PLACED'],
        [2, v1?.invoice.number, 'EDITED'],
      ]);
      expect((await latestInvoice(d(), f.S, o.orderId))?.version).toBe(2);
    } finally {
      f.overrides.delete('account.invoice');
    }
  });

  it('the background run issues the waiting ones and leaves the checked ones; off means nothing', async () => {
    const o = await f.place('inv-job');
    const r = await issueDueInvoices(d(), f.S);
    expect(r.issued).toBeGreaterThanOrEqual(1);
    expect(await latestInvoice(d(), f.S, o.orderId)).not.toBeNull();
    expect(await issueDueInvoices(d(), f.S)).toEqual({ issued: 0, revised: 0, unchanged: 0 });
    const next = await f.place('inv-off');
    f.overrides.set('documents.invoice.issue', { enabled: false, everyMinutes: 10, perRun: 200, lookbackDays: 30 });
    try {
      expect(await issueDueInvoices(d(), f.S)).toEqual({ issued: 0, revised: 0, unchanged: 0 });
      expect(await latestInvoice(d(), f.S, next.orderId)).toBeNull();
    } finally {
      f.overrides.delete('documents.invoice.issue');
    }
    f.overrides.set('account.invoice', { ...(await d().settings.value('account.invoice', { storeId: f.S })), enabled: false });
    try {
      expect(await issueInvoice(d(), { storeId: f.S, orderId: next.orderId })).toBeNull();
    } finally {
      f.overrides.delete('account.invoice');
    }
  });

  it('the list needs fulfilment.read and shows numbers and totals only; the views count revised and waiting ones', async () => {
    const waiting = await f.place('inv-list');
    const role = await createRole(db(), SYSTEM, { key: 'test-invoice-list', nameEn: 'packing', nameBn: 'packing', permissions: ['fulfilment.read'] });
    const u = await db().staffUser.create({ data: { email: 'packing@example.com', displayName: 'Packing', passwordHash: 'not-a-login' } });
    await db().staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.S } });
    const packer = { actor: { staffUserId: u.id }, storeId: f.S };
    expect(await code(invoiceList(d(), f.reader, {}))).toBe('FORBIDDEN');
    const all = await invoiceList(d(), packer, {});
    expect(all.counts.revised).toBeGreaterThanOrEqual(1);
    expect(all.counts.waiting).toBeGreaterThanOrEqual(1);
    const w = await invoiceList(d(), packer, { view: 'waiting' });
    expect(w.rows.map((r) => r.orderId)).toContain(waiting.orderId);
    expect(w.rows.every((r) => r.invoice === null)).toBe(true);
    expect(Object.keys(w.rows[0]!)).not.toContain('customerName');
    const revised = await invoiceList(d(), packer, { view: 'revised' });
    expect(revised.rows.every((r) => (r.invoice?.version ?? 0) > 1)).toBe(true);
    const found = await invoiceList(d(), packer, { q: waiting.number });
    expect(found.rows.map((r) => r.orderNumber)).toEqual([waiting.number]);
    expect(await code(invoiceList(d(), packer, { view: 'nope' }))).toBe('INVALID_INPUT');
  });

  it('a print takes the asked orders in order, leaves unknown ones out, and refuses more than the most per print', async () => {
    const a = await f.place('inv-print-a');
    const b = await f.place('inv-print-b');
    const got = await invoiceOrders(d(), f.S, [b.orderId, '00000000-0000-7000-8000-000000000000', a.orderId], 5);
    expect(got.map((x) => x.id)).toEqual([b.orderId, a.orderId]);
    expect(await code(invoiceOrders(d(), f.S, [a.orderId, b.orderId], 1))).toBe('INVALID_INPUT');
  });
  it('the settings cards: read with fulfilment.read, saved one card at a time with orders.invoiceSettings, a stale card refused', async () => {
    const base = d();
    const w = { ...base, settings: { value: base.settings.value.bind(base.settings), set: async (k: Key, v: unknown) => void f.overrides.set(k, v) } } as OrdersDeps & { settings: OrdersDeps['settings'] & { set: (k: Key, v: unknown) => Promise<void> } };
    const role = await createRole(db(), SYSTEM, { key: 'test-invoice-design', nameEn: 'design', nameBn: 'design', permissions: ['fulfilment.read', 'orders.invoiceSettings'] });
    const u = await db().staffUser.create({ data: { email: 'invoice-design@example.com', displayName: 'Design', passwordHash: 'not-a-login' } });
    await db().staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.S } });
    const owner = { actor: { staffUserId: u.id }, storeId: f.S };
    expect(await code(invoiceSettings(w, f.reader))).toBe('FORBIDDEN');
    const view = await invoiceSettings(w, owner);
    expect(view['documents.invoice.image'].value.format).toBe('jpg');
    const print = view['documents.invoice.print'];
    expect(await code(saveInvoiceSetting(w, f.staff, { key: 'documents.invoice.print', value: { ...print.value, paper: 'a5' }, version: print.version }))).toBe('FORBIDDEN');
    expect(await code(saveInvoiceSetting(w, owner, { key: 'documents.invoice.print', value: { ...print.value, paper: 'letter' }, version: print.version }))).toBe('INVALID_INPUT');
    const saved = await saveInvoiceSetting(w, owner, { key: 'documents.invoice.print', value: { ...print.value, paper: 'a5' }, version: print.version });
    try {
      expect(saved['documents.invoice.print'].value.paper).toBe('a5');
      expect(await code(saveInvoiceSetting(w, owner, { key: 'documents.invoice.print', value: { ...print.value, paper: 'a4' }, version: print.version }))).toBe('STALE');
      expect(await db().auditLog.count({ where: { action: 'orders.invoiceSettings.save' } })).toBe(1);
    } finally {
      f.overrides.delete('documents.invoice.print');
    }
    // PR 409: the design is one more card, classic as shipped; an unknown design is refused
    const design = view['documents.invoice.design'];
    expect(design.value).toEqual({ design: 'classic' });
    expect(await code(saveInvoiceSetting(w, owner, { key: 'documents.invoice.design', value: { design: 'neon' }, version: design.version }))).toBe('INVALID_INPUT');
    try {
      const d2 = await saveInvoiceSetting(w, owner, { key: 'documents.invoice.design', value: { design: 'cards' }, version: design.version });
      expect(d2['documents.invoice.design'].value).toEqual({ design: 'cards' });
    } finally {
      f.overrides.delete('documents.invoice.design');
    }
  });
});
