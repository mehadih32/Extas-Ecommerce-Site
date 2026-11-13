// S28 · PR 702 — Staff controls on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): saving the limits needs
// `settings.write` and the owner's PIN, refuses a role that does not exist and a limit on the owner, and is audited;
// a person's limits and hidden contact follow their roles; the order answers hide a hiding role's phone and address;
// the handover sheet is off as shipped, takes a count against what the person's recorded payments say, and a newer
// count for the same day replaces the older on the sheet. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, setOwnerPin, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { ymdIn } from '@extas/metrics';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from './admin-api';
import { maskForPerson, personLimits, staffControlsRoute } from './staff-controls';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const PIN = '4821';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.75' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('staff controls on PostgreSQL (PR 702)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let A = 0;
  let owner = '';
  let desk = '';
  let deskId = '';
  let packerId = '';
  let today = '';
  const route = async (method: string, path: string[], opts: { body?: unknown; cookie?: string; query?: string } = {}) => {
    const res = await staffControlsRoute(call(method, `/api/admin/staff-controls${path.length ? `/${path.join('/')}` : ''}?storeId=${A}${opts.query ?? ''}`, opts), deps, path);
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };
  async function newStaff(email: string, roleId: string): Promise<{ id: string; cookie: string }> {
    const staff = (await (await staffHandler(call('POST', '/api/admin/staff', { cookie: owner, body: { email, displayName: email.split('@')[0], password: 'first password from the owner' } }), deps)).json()) as { staff: { id: string } };
    await staffRolesHandler(call('POST', `/api/admin/staff/${staff.staff.id}/roles`, { cookie: owner, body: { action: 'assign', roleId } }), deps, staff.staff.id);
    const first = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email, password: 'first password from the owner' } }), deps));
    const cookie = cookiesOf(await passwordHandler(call('POST', '/api/admin/auth/password', { cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
    return { id: staff.staff.id, cookie };
  }

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('staffctl');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    await deps.resolver.set('store.timeZone', 'Asia/Dhaka', storeTarget(A), { actorId: null, reason: 'test' });
    today = ymdIn(new Date(), 'Asia/Dhaka');
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const ownerRow = await t.prisma.staffUser.findUniqueOrThrow({ where: { email: 'owner@example.com' } });
    await setOwnerPin(t.prisma, { staffUserId: ownerRow.id }, { password: OWNER_PW, pin: PIN }, { minLength: 4, maxLength: 12, maxAttempts: 5, lockMinutes: 15 }, new Date());
    const mk = async (nameEn: string, permissions: string[]) => ((await (await rolesHandler(call('POST', '/api/admin/roles', { cookie: owner, body: { nameEn, nameBn: 'রোল', permissions } }), deps)).json()) as { role: { id: string; key: string } }).role;
    const deskRole = await mk('Desk', ['staff.read', 'orders.read']);
    const packerRole = await mk('Packer', ['orders.read']);
    ({ id: deskId, cookie: desk } = await newStaff('desk@example.com', deskRole.id));
    ({ id: packerId } = await newStaff('packer@example.com', packerRole.id));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('ships with no limit and no sheet; the owner saves limits with the PIN only; a desk person may not', async () => {
    const v = await route('GET', [], { cookie: owner });
    expect(v.status).toBe(200);
    expect(v.body.handover).toEqual({ enabled: false, time: '21:30' });
    const roles = v.body.roles as { key: string; limit: unknown; exports: Record<string, boolean> }[];
    expect(roles.find((r) => r.key === 'owner')!.exports['orders.export']).toBe(true);
    expect(roles.find((r) => r.key === 'desk')!.exports['orders.export']).toBe(false);
    const body = { limits: { desk: { maxDiscountMinor: 50_000, maxDiscountPct: 10, hideContact: false }, packer: { maxDiscountMinor: null, maxDiscountPct: null, hideContact: true } }, handover: { enabled: true, time: '21:30' } };
    expect((await route('POST', [], { cookie: desk, body: { ...body, pin: PIN } })).status).toBe(403);
    expect((await route('POST', [], { cookie: owner, body })).body.error).toBe('PIN_REQUIRED');
    expect((await route('POST', [], { cookie: owner, body: { ...body, pin: '9999' } })).body.error).toBe('WRONG_PIN');
    expect((await route('POST', [], { cookie: owner, body: { ...body, limits: { ghost: body.limits.desk } , pin: PIN } })).body.error).toBe('UNKNOWN_ROLE');
    expect((await route('POST', [], { cookie: owner, body: { ...body, limits: { owner: body.limits.desk }, pin: PIN } })).body.error).toBe('OWNER_UNLIMITED');
    expect((await route('POST', [], { cookie: owner, body: { ...body, limits: { desk: { maxDiscountMinor: -1, maxDiscountPct: 10, hideContact: false } }, pin: PIN } })).body.error).toBe('INVALID_INPUT');
    const ok = await route('POST', [], { cookie: owner, body: { ...body, pin: PIN } });
    expect(ok.status).toBe(200);
    expect(await deps.resolver.value('staff.controls', { storeId: A })).toMatchObject({ limits: body.limits, handover: { enabled: true } });
    expect(await t.prisma.auditLog.count({ where: { action: 'staff.controls.save' } })).toBe(1);
  });

  it('a person\'s limits follow their roles; a hiding role sees phone and address hidden, the owner never', async () => {
    const ownerRow = await t.prisma.staffUser.findUniqueOrThrow({ where: { email: 'owner@example.com' } });
    expect((await personLimits(deps, ownerRow.id, A)).limit.unlimited).toBe(true);
    const d = await personLimits(deps, deskId, A);
    expect(d).toMatchObject({ owner: false, hideContact: false, limit: { unlimited: false, maxMinor: 50_000, maxPct: 10 } });
    const p = await personLimits(deps, packerId, A);
    expect(p.hideContact).toBe(true);
    const answer = { order: { phone: '01712345678', address: 'H 1, Gulshan, Dhaka', total: 10 } };
    expect(await maskForPerson(deps, packerId, A, answer)).toEqual({ order: { phone: '01•••••5678', address: 'Gulshan, Dhaka', total: 10 } });
    expect(await maskForPerson(deps, deskId, A, answer)).toEqual(answer);
    expect(await maskForPerson(deps, ownerRow.id, A, answer)).toEqual(answer);
    // the person's own answer over the API
    const me = await route('GET', ['person'], { cookie: desk });
    expect(me.body.limit.maxMinor).toBe(50_000);
  });

  it('the packer preset is made once, with only packing keys, and hides contact', async () => {
    const r = await route('POST', ['packer-role'], { cookie: owner });
    expect(r.status).toBe(409); // a "packer" role exists already (made above)
    await t.prisma.role.update({ where: { key: 'packer' }, data: { key: 'old-packer' } });
    const made = await route('POST', ['packer-role'], { cookie: owner });
    expect(made.status).toBe(201);
    const perms = (await t.prisma.role.findUniqueOrThrow({ where: { key: 'packer' }, include: { permissions: { include: { permission: true } } } })).permissions.map((x) => x.permission.key).sort();
    expect(perms).toEqual(['fulfilment.pack', 'fulfilment.read', 'orders.read']);
    expect((await deps.resolver.value('staff.controls', { storeId: A })).limits.packer?.hideContact).toBe(true);
    expect((await route('POST', ['packer-role'], { cookie: desk })).status).toBe(403);
  });

  it('the handover: off as shipped; a count sits against what the person recorded; a newer count replaces the older; nobody writes for another without staff.manage', async () => {
    await deps.resolver.set('staff.controls', { limits: {}, handover: { enabled: false, time: '21:30' } }, storeTarget(A), { actorId: null, reason: 'test' });
    expect((await route('POST', ['handover'], { cookie: desk, body: { day: today, method: 'CASH', countedMinor: 1 } })).body.error).toBe('HANDOVER_OFF');
    await deps.resolver.set('staff.controls', { limits: {}, handover: { enabled: true, time: '21:30' } }, storeTarget(A), { actorId: null, reason: 'test' });
    const at = new Date();
    await t.prisma.payment.createMany({
      data: [
        { storeId: A, method: 'CASH', purpose: 'ORDER', status: 'PAID', amountMinor: 120_000, receivedMinor: 120_000, currency: 'BDT', idempotencyKey: 'h-1', paidAt: at, recordedById: deskId },
        { storeId: A, method: 'BKASH', purpose: 'ORDER', status: 'PAID', amountMinor: 50_000, receivedMinor: 50_000, currency: 'BDT', idempotencyKey: 'h-2', paidAt: at, recordedById: deskId },
        { storeId: A, method: 'CASH', purpose: 'ORDER', status: 'PAID', amountMinor: 70_000, receivedMinor: 70_000, currency: 'BDT', idempotencyKey: 'h-3', paidAt: at, recordedById: packerId },
        { storeId: A, method: 'CASH', purpose: 'ORDER', status: 'FAILED', amountMinor: 9_000, receivedMinor: 9_000, currency: 'BDT', idempotencyKey: 'h-4', paidAt: at, recordedById: deskId },
      ],
    });
    const w1 = await route('POST', ['handover'], { cookie: desk, body: { day: today, method: 'CASH', countedMinor: 110_000, note: 'short a bit' } });
    expect(w1.status, JSON.stringify(w1.body)).toBe(201);
    expect(w1.body.row).toMatchObject({ expectedMinor: 120_000, countedMinor: 110_000, differenceMinor: -10_000 });
    const w2 = await route('POST', ['handover'], { cookie: desk, body: { day: today, method: 'CASH', countedMinor: 120_000 } });
    expect(w2.body.row.differenceMinor).toBe(0);
    expect((await route('POST', ['handover'], { cookie: desk, body: { day: today, method: 'WALLET', countedMinor: 50_000 } })).body.row.expectedMinor).toBe(50_000);
    expect((await route('POST', ['handover'], { cookie: desk, body: { day: '2999-01-01', method: 'CASH', countedMinor: 1 } })).body.error).toBe('FUTURE_DAY');
    expect((await route('POST', ['handover'], { cookie: desk, body: { day: today, method: 'CASH', countedMinor: 1, staffUserId: packerId } })).status).toBe(403);
    const sheet = await route('GET', ['handover'], { cookie: desk, query: `&day=${today}` });
    const rows = sheet.body.rows as { method: string; countedMinor: number }[];
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.method === 'CASH')!.countedMinor).toBe(120_000);
    expect(await t.prisma.cashHandover.count({ where: { storeId: A } })).toBe(3); // the older count stays as history
    expect(await t.prisma.auditLog.count({ where: { action: 'staff.handover.write' } })).toBe(3);
  });
});
