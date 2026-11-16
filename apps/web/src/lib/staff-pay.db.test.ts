// PR 1040 (S28, final round D14) — Finance › Costs on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): a person's advance,
// bonus and deduction are NEW ROWS with the owner's PIN (never an edit; the database refuses an edit or a delete); an advance goes out
// of the cashbook once per request; a wrong bonus or deduction is cancelled by a row that points at it; the salary paid counts the rows
// (amount + bonus - deduction - advance) and then locks the month; the history of every changed amount keeps who, when and why; a reader
// sees but never writes; one store never sees another's rows. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { openErpLink, setBooksPin } from '@extas/inventory';
import { ymdIn } from '@extas/metrics';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings, withPayRows, staffNetAt, type StaffCostPerson } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from './admin-api';
import { staffCostsHandler, staffHistoryHandler, staffPayHandler, staffRowReverseHandler, staffRowsHandler } from './costs-api';
import { inventoryDeps } from './inventory-api';
import { payRows } from './staff-pay';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const PIN = '482915';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.75' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

const person = (id: string, name: string, minor: number, from: string): StaffCostPerson => ({ id, name, post: 'Packer', kind: 'salary', payDay: 7, amounts: [{ from, minor }], stoppedFrom: null });

describe('rows on top of the list (pure)', () => {
  it('sums the live rows, cancels a cancelled one, keeps what an older save held', () => {
    const p: StaffCostPerson = { ...person('p1', 'Sample A', 10_000_00, '2026-01'), adj: { '2026-11': { adv: 0, bonus: 500_00, ded: 0, note: 'old' } } };
    const rows = [
      { id: 'r1', personId: 'p1', month: '2026-11', kind: 'BONUS' as const, amountMinor: 1_000_00, reversesId: null },
      { id: 'r2', personId: 'p1', month: '2026-11', kind: 'DEDUCTION' as const, amountMinor: 200_00, reversesId: null },
      { id: 'r3', personId: 'p1', month: '2026-11', kind: 'DEDUCTION' as const, amountMinor: 200_00, reversesId: 'r2' },
      { id: 'r4', personId: 'p1', month: '2026-11', kind: 'ADVANCE' as const, amountMinor: 3_000_00, reversesId: null },
    ];
    const x = staffNetAt(withPayRows([p], rows)[0]!, '2026-11');
    expect(x).toMatchObject({ base: 10_000_00, bonus: 1_500_00, ded: 0, adv: 3_000_00, net: 8_500_00 });
  });
});

describe.skipIf(!HAS_TEST_DB)('staff pay rows on PostgreSQL (PR 1040)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let A = 0;
  let B = 0;
  let owner = '';
  let reader = '';
  let month = '';
  const send = async (h: (r: Request, d: AdminDeps | null) => Promise<Response>, method: string, path: string, opts: { body?: unknown; cookie?: string; store?: number } = {}) => {
    const res = await h(call(method, `${path}${path.includes('?') ? '&' : '?'}storeId=${opts.store ?? A}`, opts), deps);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const getList = async (store = A) => (await send(staffCostsHandler, 'GET', '/api/admin/costs/staff', { cookie: owner, store })).body.staff as { value: { people: StaffCostPerson[] }; version: string };
  const putList = async (people: StaffCostPerson[], extra: Record<string, unknown> = {}, store = A) => {
    const cur = await getList(store);
    return send(staffCostsHandler, 'PUT', '/api/admin/costs/staff', { cookie: owner, store, body: { value: { people }, version: cur.version, ...extra } });
  };
  const addRow = (body: Record<string, unknown>, cookie = owner, store = A) => send(staffRowsHandler, 'POST', '/api/admin/costs/staff/rows', { cookie, store, body: { month, pin: PIN, ...body } });
  const cashOut = async (key: string) => t.prisma.cashEntry.findMany({ where: { storeId: A, requestKey: { startsWith: key } } });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('staffpay');
    [A, B] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    const first = await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const role = (await (await rolesHandler(call('POST', '/api/admin/roles', { cookie: owner, body: { nameEn: 'Books reader', nameBn: 'হিসাব পাঠক', permissions: ['books.read'] } }), deps)).json()) as { role: { id: string } };
    const staff = (await (await staffHandler(call('POST', '/api/admin/staff', { cookie: owner, body: { email: 'reader@example.com', displayName: 'Sample reader', password: 'first password from the owner' } }), deps)).json()) as { staff: { id: string } };
    await staffRolesHandler(call('POST', `/api/admin/staff/${staff.staff.id}/roles`, { cookie: owner, body: { action: 'assign', roleId: role.role.id } }), deps, staff.staff.id);
    const firstLogin = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'reader@example.com', password: 'first password from the owner' } }), deps));
    reader = cookiesOf(await passwordHandler(call('POST', '/api/admin/auth/password', { cookie: firstLogin, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
    for (const s of [A, B]) await deps.resolver.set('store.timeZone', 'Asia/Dhaka', storeTarget(s), { actorId: null, reason: 'test' });
    await deps.resolver.set('erp.model', 'v6', storeTarget(A), { actorId: null, reason: 'test', ownerApproved: true });
    const integ = await t.prisma.integration.create({ data: { storeId: A, kind: 'ERP', provider: 'extasErp', name: 'extasErp', mode: 'MOCK', enabled: true, config: {}, secretNames: [] } });
    const link = await openErpLink(t.prisma, A, integ.id);
    const today = ymdIn(new Date(), 'Asia/Dhaka');
    await t.prisma.erpStoreLink.update({ where: { id: link.id }, data: { switchDate: new Date(Date.parse(`${today}T00:00:00Z`) - 3 * 86_400_000) } });
    month = today.slice(0, 7);
    await setBooksPin(await inventoryDeps(deps), { actor: { staffUserId: first.id }, storeId: A }, { password: OWNER_PW, pin: PIN });
  }, 180_000);
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('a list is saved once with its people; an older kind of edit (advance in the list) is refused', async () => {
    const saved = await putList([person('p-ali', 'Sample Ali', 20_000_00, '2026-01'), person('p-bea', 'Sample Bea', 15_000_00, '2026-01')]);
    expect(saved.status).toBe(200);
    const edit = (await getList()).value.people.map((p) => (p.id === 'p-ali' ? { ...p, adj: { [month]: { adv: 1, bonus: 0, ded: 0, note: '' } } } : p));
    expect((await putList(edit)).body).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['adj'] });
  });

  it('a bonus is a new row with the PIN; a wrong or missing PIN writes nothing', async () => {
    expect((await addRow({ personId: 'p-ali', kind: 'BONUS', amountMinor: 2_000_00, pin: '000000' })).body).toMatchObject({ ok: false, error: 'WRONG_PIN' });
    expect((await addRow({ personId: 'p-ali', kind: 'BONUS', amountMinor: 2_000_00, pin: '' })).body).toMatchObject({ ok: false, error: 'PIN_REQUIRED' });
    expect(await payRows(t.prisma, A)).toHaveLength(0);
    const ok = await addRow({ personId: 'p-ali', kind: 'BONUS', amountMinor: 2_000_00, note: 'Best month' });
    expect(ok.status).toBe(201);
    const rows = await payRows(t.prisma, A);
    expect(rows).toMatchObject([{ personId: 'p-ali', kind: 'BONUS', amountMinor: 2_000_00, note: 'Best month' }]);
  });

  it('the database never edits or deletes a row', async () => {
    const [r] = await payRows(t.prisma, A);
    await expect(t.prisma.staffPayRow.update({ where: { id: r!.id }, data: { amountMinor: 1 } })).rejects.toThrow(/append-only/);
    await expect(t.prisma.staffPayRow.delete({ where: { id: r!.id } })).rejects.toThrow(/append-only/);
  });

  it('an advance goes out of the cashbook once, then writes its row; it needs an account; it cannot be more than the month pays', async () => {
    expect((await addRow({ personId: 'p-bea', kind: 'ADVANCE', amountMinor: 3_000_00 })).body).toMatchObject({ ok: false, error: 'ACCOUNT_NEEDED' });
    expect((await addRow({ personId: 'p-bea', kind: 'ADVANCE', amountMinor: 99_000_00, accountKey: 'cash' })).body).toMatchObject({ ok: false, error: 'TOO_BIG' });
    expect((await addRow({ personId: 'p-bea', kind: 'ADVANCE', amountMinor: 3_000_00, accountKey: 'cash' })).status).toBe(201);
    const [adv] = (await payRows(t.prisma, A)).filter((r) => r.kind === 'ADVANCE');
    const out = await cashOut(`advance:${adv!.id}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ amountMinor: -3_000_00 });
  });

  it('a wrong bonus is cancelled by a new row (once, with a reason and the PIN); an advance is reversed in the cashbook instead', async () => {
    const [bonus] = (await payRows(t.prisma, A)).filter((r) => r.kind === 'BONUS');
    const [adv] = (await payRows(t.prisma, A)).filter((r) => r.kind === 'ADVANCE');
    // the handler takes the id as its third argument
    const reverse = async (id: string, body: Record<string, unknown>) => {
      const res = await staffRowReverseHandler(call('POST', `/api/admin/costs/staff/rows/${id}/reverse?storeId=${A}`, { cookie: owner, body }), deps, id);
      return { status: res.status, body: (await res.json()) as Record<string, unknown> };
    };
    expect((await reverse(adv!.id, { reason: 'typed twice', pin: PIN })).body).toMatchObject({ error: 'ADVANCE_IN_CASHBOOK' });
    expect((await reverse(bonus!.id, { reason: 'x', pin: PIN })).body).toMatchObject({ error: 'INVALID_INPUT' });
    expect((await reverse(bonus!.id, { reason: 'typed twice', pin: '000000' })).body).toMatchObject({ error: 'WRONG_PIN' });
    expect((await reverse(bonus!.id, { reason: 'typed twice', pin: PIN })).status).toBe(201);
    expect((await reverse(bonus!.id, { reason: 'typed twice', pin: PIN })).body).toMatchObject({ error: 'ALREADY_REVERSED' });
    const rows = await payRows(t.prisma, A);
    expect(rows.filter((r) => r.kind === 'BONUS')).toHaveLength(2); // the row and its cancelling row: nothing was removed
    const people = withPayRows((await getList()).value.people, rows);
    expect(staffNetAt(people.find((p) => p.id === 'p-ali')!, month).bonus).toBe(0);
  });

  it('a reader sees the rows but writes none; another store sees none of them', async () => {
    expect((await addRow({ personId: 'p-ali', kind: 'BONUS', amountMinor: 1_00 }, reader)).status).toBe(403);
    const list = await send(staffRowsHandler, 'GET', `/api/admin/costs/staff/rows?month=${month}`, { cookie: reader });
    expect(list.status).toBe(200);
    expect((list.body.rows as unknown[]).length).toBe(3);
    expect((await payRows(t.prisma, B)).length).toBe(0);
  });

  it('paying the month writes the net into the cashbook (amount + bonus - deduction - advance) and then locks the month', async () => {
    expect((await addRow({ personId: 'p-bea', kind: 'BONUS', amountMinor: 1_000_00 })).status).toBe(201);
    expect((await addRow({ personId: 'p-bea', kind: 'DEDUCTION', amountMinor: 500_00, note: 'One day unpaid' })).status).toBe(201);
    const pay = await send(staffPayHandler, 'POST', '/api/admin/costs/staff/pay', { cookie: owner, body: { month, accountKey: 'cash', pin: PIN } });
    expect(pay.status).toBe(201);
    const paid = pay.body.paid as { id: string; minor: number }[];
    expect(paid.find((x) => x.id === 'p-bea')!.minor).toBe(15_000_00 + 1_000_00 - 500_00 - 3_000_00);
    expect(paid.find((x) => x.id === 'p-ali')!.minor).toBe(20_000_00); // the bonus was cancelled
    const [salary] = await cashOut(`salary:${month}:p-bea`);
    expect(salary).toMatchObject({ amountMinor: -12_500_00 });
    expect((await addRow({ personId: 'p-bea', kind: 'BONUS', amountMinor: 1_00 })).body).toMatchObject({ ok: false, error: 'MONTH_PAID' });
    expect((await send(staffPayHandler, 'POST', '/api/admin/costs/staff/pay', { cookie: owner, body: { month, accountKey: 'cash', pin: PIN } })).body).toMatchObject({ error: 'NOTHING_TO_PAY' });
  });

  it('a changed amount keeps its history: who, when, why; a starting amount and a stop are in it too', async () => {
    const people = (await getList()).value.people.map((p) => (p.id === 'p-ali' ? { ...p, amounts: [...p.amounts, { from: '2099-01', minor: 22_000_00 }] } : p));
    expect((await putList(people, { note: 'Yearly raise' })).status).toBe(200);
    const h = await send(staffHistoryHandler, 'GET', '/api/admin/costs/staff/history?head=p-ali', { cookie: reader });
    expect(h.status).toBe(200);
    expect((h.body.changes as unknown[])[0]).toMatchObject({ headId: 'p-ali', fromMonth: '2099-01', oldMinor: 20_000_00, newMinor: 22_000_00, note: 'Yearly raise', by: 'Sample owner' });
    await expect(t.prisma.fixedCostChange.deleteMany({})).rejects.toThrow(/append-only/);
  });
});
