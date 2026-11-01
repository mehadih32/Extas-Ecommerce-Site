// S08 · PR 179 — the Packing & print API end to end on a real PostgreSQL (a throwaway database with the sample catalogue;
// orders placed through the real checkout and booked with Steadfast on its practice world; skipped without
// TEST_DATABASE_ADMIN_URL): login, the same-site check and the permission; the print run; the stickers as a real PDF
// drawn with the server's fonts, counted, a second print a reprint; a parcel changed after booking refused (SIM-F-004);
// the sample sticker. PR 180: a reprint needs its reason, the same press key is the same print, the recent prints; the
// rider's handover sheet as a real A4 PDF and the batch handed over. PR 181: the picking list as data and as a real
// PDF, kept with a print job. PR 182: the packing steps, "Start picking" for all, each piece checked, "Mark packed" with
// its Idempotency-Key, the refusals in their codes (follow-up 433: the handover sheet takes packed parcels only, so the
// PR 180 parcel is packed here first). Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { STEADFAST_PROVIDER } from '@extas/adapters';
import { createFirstOwner, defaultSecurityPolicy, hashPassword } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { confirmOrder } from '@extas/orders';
import { setUpShipping, type ShippingFixture } from '@extas/shipping/testing';
import { bookOrders } from '@extas/shipping';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { handoverRoute, packingRoute, pickingRoute, stickersRoute } from './fulfil-api';

// PR 404: the print run's invoices come from the customer's invoice view (the shop's context reads the live database);
// here each order's invoice is a made-up document with the order id in its number, so the order of pages can be read.
vi.mock('./admin-invoices/print', async (original) => {
  const real = await original<typeof import('./admin-invoices/print')>();
  const { invoiceSettings } = await import('@extas/settings');
  return {
    ...real,
    printedInvoices: vi.fn(async (_deps: unknown, _storeId: number, orderIds: readonly string[]) => ({
      print: invoiceSettings['documents.invoice.print'].default,
      image: invoiceSettings['documents.invoice.image'].default,
      invoices: orderIds.map((orderId) => ({
        orderId,
        number: `INV-${orderId.slice(0, 8)}`,
        doc: { brand: 'Sample Shop', shopLines: [], heading: 'Invoice', meta: [`INV-${orderId.slice(0, 8)}`], parties: [], cols: { no: '#', item: 'Item', qty: 'Qty', unit: 'Price', amount: 'Amount' }, rows: [{ no: '1', name: 'Linen shirt', subs: [], marks: [], qty: '1', unit: 'Tk 1', amount: 'Tk 1' }], totals: [], payment: null, note: [], footer: [], pageWords: '{n}/{of}' },
      })),
    })),
  };
});

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const READER_PW = 'another long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.42' };
  if (opts.origin !== null && method !== 'GET') headers.origin = opts.origin ?? `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');
const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page /g) ?? []).length;

describe.skipIf(!HAS_TEST_DB)('Packing & print API on PostgreSQL (S08 · PR 179–181)', () => {
  let f: ShippingFixture;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  let courierId = '';
  const stickers = (method: string, path: string[], opts: { body?: unknown; cookie?: string; origin?: string | null } = {}) => stickersRoute(call(method, `/api/admin/packing/stickers/${path.join('/')}`, { body: opts.body, cookie: opts.cookie ?? owner, origin: opts.origin }), deps, path);
  const handover = (method: string, path: string[], opts: { body?: unknown; cookie?: string } = {}) => handoverRoute(call(method, `/api/admin/packing/handover/${path.join('/')}`, { body: opts.body, cookie: opts.cookie ?? owner }), deps, path);
  const picking = (method: string, query = '', opts: { body?: unknown; cookie?: string } = {}) => pickingRoute(call(method, `/api/admin/packing/picking${query}`, { body: opts.body, cookie: opts.cookie ?? owner }), deps, []);
  const packing = (method: string, path: string[], opts: { body?: unknown; cookie?: string; key?: string; query?: string } = {}) => {
    const req = call(method, `/api/admin/packing/orders/${path.join('/')}${opts.query ?? ''}`, { body: opts.body, cookie: opts.cookie ?? owner });
    if (opts.key) req.headers.set('idempotency-key', opts.key);
    return packingRoute(req, deps, path);
  };
  /** PR 182: every piece of the order checked by its typed SKU, then "Mark packed". */
  const packIt = async (orderId: string, key: string) => {
    const items = await f.t.prisma.orderItem.findMany({ where: { orderId, status: 'ACTIVE' }, select: { sku: true, quantity: true } });
    for (const i of items) for (let k = 0; k < i.quantity; k++) expect((await packing('POST', [orderId, 'piece'], { body: { code: i.sku.toLowerCase(), source: 'typed' } })).status).toBe(200);
    return packing('POST', [orderId, 'pack'], { body: {}, key });
  };
  const booked = async (name: string, phone: string) => {
    const o = await f.place(name, { phone });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    const r = await bookOrders(f.shippingDeps(), f.shipper, { courierAccountId: courierId, orderIds: [o.orderId] });
    expect(r.results[0]).toMatchObject({ outcome: 'booked' });
    return { ...o, shipmentId: r.results[0]!.shipmentId! };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    f = await setUpShipping('fulfil_api');
    const db = f.t.prisma;
    await syncSettings(db, { registry, messages });
    await createFirstOwner(db, defaultSecurityPolicy(), { email: 'admin-owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db, resolver: new SettingsResolver(prismaBackend(db), registry), vault: null, now: () => f.clock.now };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'admin-owner@example.com', password: OWNER_PW } }), deps));
    await db.staffUser.update({ where: { email: 'reader@example.com' }, data: { passwordHash: await hashPassword(READER_PW), passwordSetAt: new Date() } });
    reader = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'reader@example.com', password: READER_PW } }), deps));
    courierId = await f.courier(STEADFAST_PROVIDER, 'Steadfast main');
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await f?.t.drop();
  });

  it('needs a login, a database, a same-site request and the permission; unknown paths and methods are refused', async () => {
    expect((await stickers('GET', [], { cookie: '' })).status).toBe(401);
    expect((await stickersRoute(call('GET', '/api/admin/packing/stickers', { cookie: owner }), null, [])).status).toBe(503);
    expect((await stickers('POST', [], { origin: 'https://evil.example.test', body: { shipmentIds: [] } })).status).toBe(403);
    expect((await stickers('GET', [], { cookie: reader })).status).toBe(403);
    expect((await stickers('PATCH', [])).status).toBe(405);
    expect((await stickers('POST', ['sample'])).status).toBe(405);
    expect((await stickers('GET', ['teleport'])).status).toBe(404);
    expect((await stickers('POST', [], { body: { shipmentIds: [] } })).status).toBe(400);
  });

  it('prints the stickers of booked parcels as one real PDF, counts them, and marks the second print a reprint', async () => {
    const a = await booked('fa-1', '01700001901'); // hardcode-ok: a made-up test number
    const b = await booked('fa-2', '01700001902'); // hardcode-ok: a made-up test number
    const run = (await (await stickers('GET', [])).json()) as { ok: boolean; rows: { shipmentId: string; printCount: number; problem: string | null }[] };
    expect(run.ok).toBe(true);
    expect(run.rows.map((r) => r.shipmentId)).toEqual(expect.arrayContaining([a.shipmentId, b.shipmentId]));

    const res = await stickers('POST', [], { body: { shipmentIds: [a.shipmentId, b.shipmentId] } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toMatch(/^inline; filename="Stickers-2\.pdf"$/);
    const pdf = Buffer.from(await res.arrayBuffer());
    expect(pdf.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
    expect(pages(pdf)).toBe(2);
    expect(await f.t.prisma.shipment.findUniqueOrThrow({ where: { id: a.shipmentId } })).toMatchObject({ labelPrintCount: 1 });

    const ask = await stickers('POST', [], { body: { shipmentIds: [a.shipmentId] } });
    expect(ask.status).toBe(422);
    expect(await ask.json()).toMatchObject({ ok: false, error: 'REASON_REQUIRED', data: { reprints: [expect.objectContaining({ shipmentId: a.shipmentId })] } });
    const again = await stickers('POST', [], { body: { shipmentIds: [a.shipmentId], reason: 'Sticker torn', requestKey: 'api-press-0001' } });
    expect(again.status).toBe(200);
    expect(again.headers.get('x-print-replay')).toBe('0');
    const twice = await stickers('POST', [], { body: { shipmentIds: [a.shipmentId], reason: 'Sticker torn', requestKey: 'api-press-0001' } });
    expect(twice.headers.get('x-print-replay')).toBe('1');
    expect(twice.headers.get('x-print-job')).toBe(again.headers.get('x-print-job'));
    const recent = (await (await stickers('GET', ['recent'])).json()) as { ok: boolean; jobs: { id: string; reason: string | null }[] };
    expect(recent.jobs[0]).toMatchObject({ id: again.headers.get('x-print-job'), reason: 'Sticker torn' });
    expect(await f.t.prisma.orderEvent.findMany({ where: { orderId: a.orderId, type: 'shipment.stickerPrinted' }, select: { data: true }, orderBy: { createdAt: 'asc' } })).toEqual([{ data: expect.objectContaining({ print: 1, reprint: false }) }, { data: expect.objectContaining({ print: 2, reprint: true }) }]);
  });

  it('SIM-F-004: a parcel whose amount changed after booking is refused with its order and reason, and nothing is printed', async () => {
    const c = await booked('fa-3', '01700001903'); // hardcode-ok: a made-up test number
    await f.t.prisma.order.update({ where: { id: c.orderId }, data: { paidMinor: { increment: 10_000 } } });
    const res = await stickers('POST', [], { body: { shipmentIds: [c.shipmentId] } });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, error: 'NOT_PRINTABLE', data: { refused: [{ shipmentId: c.shipmentId, problem: 'COD_CHANGED' }] } });
    expect((await f.t.prisma.shipment.findUniqueOrThrow({ where: { id: c.shipmentId } })).labelPrintCount).toBe(0);
  });

  it('PR 404: "sticker + invoice" puts each invoice after its sticker; "invoices only" counts no sticker; a row\'s own Print stays a sticker; an invoice needs its permission', async () => {
    const a = await booked('fa-404a', '01700004041'); // hardcode-ok: a made-up test number
    const b = await booked('fa-404b', '01700004042'); // hardcode-ok: a made-up test number
    const set = (what: 'sticker' | 'both' | 'invoice') => deps.resolver.set('fulfilment.printRun', { what, invoiceLayout: 'page' }, storeTarget(f.S), { actorId: null, reason: 'test' });
    const sizes = (pdf: Buffer) => [...pdf.toString('latin1').matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => `${m[1]}x${m[2]}`);
    const sticker = '283.46x425.20';
    const a4 = '595.28x841.89';
    try {
      await set('both');
      const both = await stickers('POST', [], { body: { shipmentIds: [a.shipmentId, b.shipmentId] } });
      expect(both.status).toBe(200);
      expect(sizes(Buffer.from(await both.arrayBuffer()))).toEqual([sticker, a4, sticker, a4]);
      expect((await f.t.prisma.shipment.findUniqueOrThrow({ where: { id: a.shipmentId } })).labelPrintCount).toBe(1);

      await set('invoice');
      const inv = await stickers('POST', [], { body: { shipmentIds: [b.shipmentId, a.shipmentId] } });
      expect(inv.status).toBe(200);
      expect(sizes(Buffer.from(await inv.arrayBuffer()))).toEqual([a4, a4]);
      expect((await f.t.prisma.shipment.findUniqueOrThrow({ where: { id: b.shipmentId } })).labelPrintCount).toBe(1);
      expect((await stickers('POST', [], { body: { shipmentIds: ['00000000-0000-7000-8000-000000000404'] } })).status).toBe(404);
      expect((await stickers('POST', [], { body: { shipmentIds: ['not-an-id'] } })).status).toBe(400);

      // a row's own Print / Reprint is its sticker, whatever the run prints
      const one = await stickers('POST', [], { body: { shipmentIds: [b.shipmentId], single: true, reason: 'Sticker torn' } });
      expect(one.status).toBe(200);
      expect(sizes(Buffer.from(await one.arrayBuffer()))).toEqual([sticker]);

      // without "orders.invoice" a print with invoices is refused before anything is counted
      const role = await f.t.prisma.role.create({ data: { key: 'printer-404', nameEn: 'Printer', nameBn: 'প্রিন্টার' } });
      for (const key of ['fulfilment.read', 'fulfilment.print']) {
        const perm = await f.t.prisma.permission.findUniqueOrThrow({ where: { key } });
        await f.t.prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
      }
      const staff = await f.t.prisma.staffUser.findUniqueOrThrow({ where: { email: 'reader@example.com' } });
      await f.t.prisma.staffRoleAssignment.create({ data: { staffUserId: staff.id, roleId: role.id, storeId: f.S } });
      const refused = await stickers('POST', [], { cookie: reader, body: { shipmentIds: [a.shipmentId] } });
      expect(refused.status).toBe(403);
      expect((await f.t.prisma.shipment.findUniqueOrThrow({ where: { id: a.shipmentId } })).labelPrintCount).toBe(1);
      await f.t.prisma.staffRoleAssignment.deleteMany({ where: { roleId: role.id } });
    } finally {
      await set('sticker');
    }
  });

  it('makes a sample sticker at the owner\'s size to try the printer', async () => {
    const res = await stickers('GET', ['sample']);
    expect(res.status).toBe(200);
    const pdf = Buffer.from(await res.arrayBuffer());
    expect(pages(pdf)).toBe(1);
    // 100 × 150 mm by default
    expect(pdf.toString('latin1')).toContain('/MediaBox [0 0 283.46 425.20]');
  });

  it('PR 408: the print check draws every document at every size and says each prints right; nothing printed or counted', async () => {
    const jobs = await f.t.prisma.printJob.count();
    expect((await stickers('POST', ['check'], { cookie: reader })).status).toBe(403);
    const res = await stickers('POST', ['check']);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; edgeMm: number; rows: { doc: string; size: string; pages: number; problems: string[] }[] };
    expect(body).toMatchObject({ ok: true, edgeMm: 2 });
    expect(body.rows).toHaveLength(15);
    expect(new Set(body.rows.map((r) => r.doc))).toEqual(new Set(['sticker', 'picking', 'handover', 'invoice']));
    expect(body.rows.every((r) => r.pages >= 1 && Array.isArray(r.problems))).toBe(true);
    expect(await f.t.prisma.printJob.count()).toBe(jobs);
    expect((await stickers('GET', ['check'])).status).toBe(405);
  }, 120_000);

  it('PR 180: the handover list, the rider\'s sheet as a real A4 PDF, and the batch handed over', async () => {
    const d = await booked('fa-4', '01700001904'); // hardcode-ok: a made-up test number
    expect((await stickers('POST', [], { body: { shipmentIds: [d.shipmentId] } })).status).toBe(200);
    // follow-up 433: not packed yet, so not on the sheet; packed through the packing API, it is
    const before = (await (await handover('GET', [])).json()) as { couriers: { courierAccountId: string; parcels: { shipmentId: string; problem: string | null }[] }[] };
    expect(before.couriers.find((c) => c.courierAccountId === courierId)!.parcels.find((p) => p.shipmentId === d.shipmentId)).toMatchObject({ problem: 'NOT_PACKED' });
    expect((await packIt(d.orderId, 'api-pack-0001')).status).toBe(200);
    expect((await handover('GET', [], { cookie: reader })).status).toBe(403);
    const list = (await (await handover('GET', [])).json()) as { ok: boolean; couriers: { courierAccountId: string; parcels: { shipmentId: string; problem: string | null }[] }[] };
    expect(list.couriers.find((c) => c.courierAccountId === courierId)!.parcels.find((p) => p.shipmentId === d.shipmentId)).toMatchObject({ problem: null });

    const sheet = await handover('POST', ['sheet'], { body: { courierAccountId: courierId } });
    expect(sheet.status).toBe(200);
    expect(sheet.headers.get('content-type')).toBe('application/pdf');
    const pdf = Buffer.from(await sheet.arrayBuffer());
    expect(pdf.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
    expect(pdf.toString('latin1')).toContain('/MediaBox [0 0 595.28 841.89]');
    const batch = await f.t.prisma.handoverBatch.findFirstOrThrow({ where: { courierAccountId: courierId, handedOverAt: null } });
    expect(batch.shipmentIds).toContain(d.shipmentId);

    expect((await handover('POST', ['done'], { body: { batchId: batch.id } })).status).toBe(400);
    const done = await handover('POST', ['done'], { body: { batchId: batch.id, receivedBy: 'Rider Karim' } });
    expect(done.status).toBe(200);
    expect(await done.json()).toMatchObject({ ok: true, batchId: batch.id, handedOver: expect.arrayContaining([d.number]) });
    expect(await f.t.prisma.order.findUniqueOrThrow({ where: { id: d.orderId } })).toMatchObject({ status: 'HANDED_OVER' });
    expect((await handover('POST', ['done'], { body: { batchId: batch.id, receivedBy: 'Rider Karim' } })).status).toBe(409);
    expect((await handover('GET', ['sheet'])).status).toBe(405);
    expect((await handover('POST', ['teleport'])).status).toBe(404);
  });

  it('PR 406: the handed-over history per courier, and a COPY of a handed sheet as a real PDF (one more print job)', async () => {
    // the batch handed over in the PR 180 test above
    const batch = await f.t.prisma.handoverBatch.findFirstOrThrow({ where: { courierAccountId: courierId, handedOverAt: { not: null } } });
    expect((await handover('GET', ['history'], { cookie: reader })).status).toBe(403);
    const h = (await (await handover('GET', ['history'])).json()) as { ok: boolean; couriers: { courierAccountId: string; batches: { batchId: string; receivedBy: string; parcels: number }[] }[] };
    expect(h.ok).toBe(true);
    expect(h.couriers.find((c) => c.courierAccountId === courierId)!.batches.find((b) => b.batchId === batch.id)).toMatchObject({ receivedBy: 'Rider Karim', parcels: 1 });
    const copy = await handover('POST', ['copy'], { body: { batchId: batch.id } });
    expect(copy.status).toBe(200);
    expect(copy.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await copy.arrayBuffer()).subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
    expect(await f.t.prisma.printJob.count({ where: { batchId: batch.id, reason: 'copy', isReprint: true } })).toBe(1);
    expect((await handover('POST', ['copy'], { body: {} })).status).toBe(400);
    expect((await handover('POST', ['copy'], { body: { batchId: '00000000-0000-4000-8000-000000000000' } })).status).toBe(404);
    expect((await handover('GET', ['copy'])).status).toBe(405);
    expect((await handover('POST', ['history'])).status).toBe(405);
  });

  it('PR 181: the picking list as data (with a date range) and as a real PDF, kept with a print job', async () => {
    const e = await booked('fa-5', '01700001905'); // hardcode-ok: a made-up test number
    expect((await picking('GET', '', { cookie: reader })).status).toBe(403);
    const data = (await (await picking('GET')).json()) as { ok: boolean; orderIds: string[]; summary: { orders: number; pieces: number } };
    expect(data.ok).toBe(true);
    expect(data.orderIds).toContain(e.orderId);
    expect(data.summary.pieces).toBeGreaterThanOrEqual(data.summary.orders);
    expect((await picking('GET', '?from=2000-01-01&to=2000-01-02')).status).toBe(200);
    expect((await picking('GET', '?from=2000-01-03&to=2000-01-02')).status).toBe(400);
    const res = await picking('POST', '', { body: {} });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    const pdf = Buffer.from(await res.arrayBuffer());
    expect(pdf.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
    expect(pdf.toString('latin1')).toContain('/MediaBox [0 0 595.28 841.89]');
    const listId = res.headers.get('x-picking-list')!;
    expect(await f.t.prisma.pickingList.findUniqueOrThrow({ where: { id: listId } })).toMatchObject({ orderIds: expect.arrayContaining([e.orderId]) });
    expect((await picking('PATCH')).status).toBe(405);
  });

  it('PR 405: a size line marked pulled on the screen list, and the mark taken back; other methods and unknown lines refused', async () => {
    const o = await booked('fa-405', '01700004051'); // hardcode-ok: a made-up test number
    const listed = (await (await picking('GET')).json()) as { groups: { styles: { colours: { sizes: { key: string; orders: { orderId: string }[]; tick: { state: string } }[] }[] }[] }[]; summary: { pulled: number } };
    const line = listed.groups.flatMap((g) => g.styles.flatMap((st) => st.colours.flatMap((c) => c.sizes))).find((z) => z.orders.some((x) => x.orderId === o.orderId))!;
    const tick = (b: unknown, cookie?: string) => pickingRoute(call('POST', '/api/admin/packing/picking/tick', { body: b, cookie: cookie ?? owner }), deps, ['tick']);
    const r = await tick({ key: line.key, ticked: true });
    expect(r.status).toBe(200);
    const after = (await r.json()) as typeof listed;
    expect(after.groups.flatMap((g) => g.styles.flatMap((st) => st.colours.flatMap((c) => c.sizes))).find((z) => z.key === line.key)!.tick.state).toBe('done');
    expect((await tick({ key: line.key, ticked: false })).status).toBe(200);
    expect((await tick({ key: 'no-such-line', ticked: true })).status).toBe(404);
    expect((await tick({ key: line.key, ticked: true }, reader)).status).toBe(403);
    expect((await pickingRoute(call('GET', '/api/admin/packing/picking/tick', { cookie: owner }), deps, ['tick'])).status).toBe(405);
  });

  it('PR 182: the packing steps, "Start picking" for all, each piece checked, and "Mark packed" once per press', async () => {
    const g = await f.place('fa-6', { phone: '01700001906' }); // hardcode-ok: a made-up test number
    await confirmOrder(f.ordersDeps(), f.staff, g.orderId);
    expect((await packing('GET', [], { cookie: reader })).status).toBe(403);
    expect((await packing('GET', [], { query: '?step=sideways' })).status).toBe(400);
    const pick = (await (await packing('GET', [], { query: '?step=pick' })).json()) as { ok: boolean; step: string; counts: Record<string, number>; rows: { orderId: string; pieces: number }[] };
    expect(pick).toMatchObject({ ok: true, step: 'pick' });
    expect(pick.rows.map((r) => r.orderId)).toContain(g.orderId);

    // pieces are checked while the order is confirmed or picking; a code on no line of the order is refused
    const wrong = await packing('POST', [g.orderId, 'piece'], { body: { code: 'NOT-ON-THIS-ORDER', source: 'typed' } });
    expect(wrong.status).toBe(422);
    expect(await wrong.json()).toMatchObject({ ok: false, error: 'NOT_IN_ORDER' });
    // the shop checks by scan: a tick is the wrong way
    expect(await (await packing('POST', [g.orderId, 'piece'], { body: { lineId: g.orderId, source: 'tick' } })).json()).toMatchObject({ error: 'CHECK_MODE' });

    const all = (await (await packing('POST', ['pick-all'], { body: {} })).json()) as { ok: boolean; started: string[] };
    expect(all.ok).toBe(true);
    expect(all.started).toContain(g.number);
    expect(await f.t.prisma.order.findUniqueOrThrow({ where: { id: g.orderId } })).toMatchObject({ status: 'PROCESSING' });

    const early = await packing('POST', [g.orderId, 'pack'], { body: {}, key: 'api-pack-0002' });
    expect(early.status).toBe(422);
    expect(await early.json()).toMatchObject({ ok: false, error: 'NOT_CHECKED' });
    // the photo is off by default: an upload is refused before it is read
    expect(await (await packing('POST', [g.orderId, 'photo'])).json()).toMatchObject({ ok: false, error: 'PHOTO_OFF' });

    const packed = await packIt(g.orderId, 'api-pack-0003');
    expect(packed.status).toBe(200);
    const first = (await packed.json()) as { ok: boolean; result: { status: string } };
    expect(first).toMatchObject({ ok: true, result: { status: 'PACKED' } });
    // the same press again (a lost answer) gets the same answer; the order is packed once
    const again = await packing('POST', [g.orderId, 'pack'], { body: {}, key: 'api-pack-0003' });
    expect(again.status).toBe(200);
    expect(await f.t.prisma.orderEvent.count({ where: { orderId: g.orderId, type: 'order.pack' } })).toBe(1);
    const view = (await (await packing('GET', [g.orderId])).json()) as { ok: boolean; order: { status: string; step: string; allChecked: boolean; blocked: string | null } };
    expect(view.order).toMatchObject({ status: 'PACKED', step: 'ready', allChecked: true, blocked: null });
    // a new press on a packed order is the order machine's refusal
    expect((await packing('POST', [g.orderId, 'pack'], { body: {}, key: 'api-pack-0004' })).status).toBe(409);
    expect((await packing('PATCH', [g.orderId, 'pack'])).status).toBe(405);
    expect((await packing('GET', ['not-a-uuid'])).status).toBe(404);
    expect((await packing('POST', [g.orderId, 'teleport'])).status).toBe(404);
  });

  it('PR 183: a damaged piece reported holds the order with its card; "found it" closes the card and releases the hold', async () => {
    const h = await f.place('fa-7', { phone: '01700001907' }); // hardcode-ok: a made-up test number
    await confirmOrder(f.ordersDeps(), f.staff, h.orderId);
    const line = await f.t.prisma.orderItem.findFirstOrThrow({ where: { orderId: h.orderId, status: 'ACTIVE' } });
    expect((await packing('POST', [h.orderId, 'issue'], { body: { lineId: line.id, kind: 'BROKEN' } })).status).toBe(400);
    const rep = await packing('POST', [h.orderId, 'issue'], { body: { lineId: line.id, kind: 'DAMAGED', note: 'Torn seam' } });
    expect(rep.status).toBe(200);
    const view = (await rep.json()) as { order: { status: string; openIssues: { id: string; kind: string }[] } };
    expect(view.order).toMatchObject({ status: 'ON_HOLD', openIssues: [expect.objectContaining({ kind: 'DAMAGED' })] });
    const issueId = view.order.openIssues[0]!.id;
    expect(await (await packing('POST', [h.orderId, 'issue'], { body: { lineId: line.id, kind: 'NOT_FOUND' } })).json()).toMatchObject({ ok: false, error: 'ISSUE_OPEN' });
    const called = await packing('POST', [h.orderId, 'issues', issueId, 'call'], { body: {} });
    expect(await called.json()).toMatchObject({ ok: true, created: true });
    const done = await packing('POST', [h.orderId, 'issues', issueId, 'resolve'], { body: { decision: 'STOCK_FOUND' } });
    expect(await done.json()).toMatchObject({ ok: true, decision: 'STOCK_FOUND', released: true });
    expect(await f.t.prisma.order.findUniqueOrThrow({ where: { id: h.orderId } })).toMatchObject({ status: 'CONFIRMED' });
    expect((await packing('POST', [h.orderId, 'issues', issueId, 'teleport'], { body: {} })).status).toBe(404);
    expect((await packing('GET', [h.orderId, 'issues', issueId, 'resolve'])).status).toBe(405);
  });
});
