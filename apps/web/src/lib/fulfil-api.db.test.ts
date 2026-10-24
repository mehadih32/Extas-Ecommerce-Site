// S08 · PR 179 — the Packing & print API end to end on a real PostgreSQL (a throwaway database with the sample catalogue;
// orders placed through the real checkout and booked with Steadfast on its practice world; skipped without
// TEST_DATABASE_ADMIN_URL): login, the same-site check and the permission; the print run; the stickers as a real PDF
// drawn with the server's fonts, counted, a second print a reprint; a parcel changed after booking refused (SIM-F-004);
// the sample sticker. PR 180: a reprint needs its reason, the same press key is the same print, the recent prints; the
// rider's handover sheet as a real A4 PDF and the batch handed over. PR 181: the picking list as data and as a real
// PDF, kept with a print job. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { STEADFAST_PROVIDER } from '@extas/adapters';
import { createFirstOwner, defaultSecurityPolicy, hashPassword } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { confirmOrder } from '@extas/orders';
import { setUpShipping, type ShippingFixture } from '@extas/shipping/testing';
import { bookOrders } from '@extas/shipping';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { handoverRoute, pickingRoute, stickersRoute } from './fulfil-api';

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

  it('makes a sample sticker at the owner\'s size to try the printer', async () => {
    const res = await stickers('GET', ['sample']);
    expect(res.status).toBe(200);
    const pdf = Buffer.from(await res.arrayBuffer());
    expect(pages(pdf)).toBe(1);
    // 100 × 150 mm by default
    expect(pdf.toString('latin1')).toContain('/MediaBox [0 0 283.46 425.20]');
  });

  it('PR 180: the handover list, the rider\'s sheet as a real A4 PDF, and the batch handed over', async () => {
    const d = await booked('fa-4', '01700001904'); // hardcode-ok: a made-up test number
    expect((await stickers('POST', [], { body: { shipmentIds: [d.shipmentId] } })).status).toBe(200);
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
});
