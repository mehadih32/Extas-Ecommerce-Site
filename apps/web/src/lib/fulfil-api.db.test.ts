// S08 · PR 179 — the Packing & print API end to end on a real PostgreSQL (a throwaway database with the sample catalogue;
// orders placed through the real checkout and booked with Steadfast on its practice world; skipped without
// TEST_DATABASE_ADMIN_URL): login, the same-site check and the permission; the print run; the stickers as a real PDF
// drawn with the server's fonts, counted, a second print a reprint; a parcel changed after booking refused (SIM-F-004);
// the sample sticker. Every value is a made-up test value.
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
import { stickersRoute } from './fulfil-api';

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

describe.skipIf(!HAS_TEST_DB)('Packing & print API on PostgreSQL (S08 · PR 179)', () => {
  let f: ShippingFixture;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  let courierId = '';
  const stickers = (method: string, path: string[], opts: { body?: unknown; cookie?: string; origin?: string | null } = {}) => stickersRoute(call(method, `/api/admin/packing/stickers/${path.join('/')}`, { body: opts.body, cookie: opts.cookie ?? owner, origin: opts.origin }), deps, path);
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

    const again = await stickers('POST', [], { body: { shipmentIds: [a.shipmentId] } });
    expect(again.status).toBe(200);
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
});
