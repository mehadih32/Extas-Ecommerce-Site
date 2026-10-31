// S16 · PR 344 — Money → Expenses on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): heads are the owner's
// own (none shipped), named once, put away and brought back, audited; an expense goes through PR 618's cost line on its
// head's line (one path to the ERP) and is kept once per request key; a reversal is a negative expense pointing at the
// reversing cost entry, never twice; a store not on the books yet takes nothing; a reader sees, never writes. The
// receipt (PR 344 follow-up): off as shipped; when on, a picture or PDF only (by its contents), within the size, kept in
// the "expense-receipts" folder, named by the expense and read back by a reader. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { memoryStorage } from '@extas/adapters';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { openErpLink } from '@extas/inventory';
import { ymdIn } from '@extas/metrics';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import type { MediaDeps } from '@extas/media';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from './admin-api';
import { expensesRoute, headKey, type ExpensesView } from './expenses-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string; form?: FormData } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.74' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.form) return new Request(`https://${HOST}${path}`, { method, headers, body: opts.form });
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe('expense head keys (PR 344)', () => {
  it('lower-case words joined by "-", never empty', () => {
    expect(headKey('Office tea & snacks')).toBe('office-tea-snacks');
    expect(headKey('  Café  ')).toBe('cafe');
    expect(headKey('চা')).toBe('head');
  });
});

describe.skipIf(!HAS_TEST_DB)('expenses on PostgreSQL (PR 344)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let A = 0;
  let B = 0;
  let owner = '';
  let reader = '';
  let today = '';
  let media: MediaDeps;
  const raw = (method: string, path: string[], opts: { body?: unknown; cookie?: string; store?: number; form?: FormData } = {}) =>
    expensesRoute(call(method, `/api/admin/money/expenses${path.length ? `/${path.join('/')}` : ''}?storeId=${opts.store ?? A}`, opts), deps, path, media);
  const route = async (method: string, path: string[], opts: { body?: unknown; cookie?: string; store?: number; form?: FormData } = {}) => {
    const res = await raw(method, path, opts);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('expenses');
    [A, B] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    const storage = memoryStorage();
    media = { db: t.prisma, settings: deps.resolver, storage: async () => storage };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const role = (await (await rolesHandler(call('POST', '/api/admin/roles', { cookie: owner, body: { nameEn: 'Books reader', nameBn: 'হিসাব পাঠক', permissions: ['books.read'] } }), deps)).json()) as { role: { id: string } };
    const staff = (await (await staffHandler(call('POST', '/api/admin/staff', { cookie: owner, body: { email: 'reader@example.com', displayName: 'Sample reader', password: 'first password from the owner' } }), deps)).json()) as { staff: { id: string } };
    await staffRolesHandler(call('POST', `/api/admin/staff/${staff.staff.id}/roles`, { cookie: owner, body: { action: 'assign', roleId: role.role.id } }), deps, staff.staff.id);
    const firstLogin = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'reader@example.com', password: 'first password from the owner' } }), deps));
    reader = cookiesOf(await passwordHandler(call('POST', '/api/admin/auth/password', { cookie: firstLogin, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
    // store A keeps its books with the ERP (contract v6, switched a month ago); store B does not yet
    for (const s of [A, B]) await deps.resolver.set('store.timeZone', 'Asia/Dhaka', storeTarget(s), { actorId: null, reason: 'test' });
    await deps.resolver.set('erp.model', 'v6', storeTarget(A), { actorId: null, reason: 'test', ownerApproved: true });
    const integ = await t.prisma.integration.create({ data: { storeId: A, kind: 'ERP', provider: 'extasErp', name: 'extasErp', mode: 'MOCK', enabled: true, config: {}, secretNames: [] } });
    const link = await openErpLink(t.prisma, A, integ.id);
    today = ymdIn(new Date(), 'Asia/Dhaka');
    const switchDay = new Date(Date.parse(`${today}T00:00:00Z`) - 3 * 86_400_000);
    await t.prisma.erpStoreLink.update({ where: { id: link.id }, data: { switchDate: switchDay } });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('ships with no head; the owner adds one (once by name), puts it away and back; a reader may not', async () => {
    const empty = await route('GET', [], { cookie: reader });
    expect(empty.status).toBe(200);
    expect((empty.body as unknown as ExpensesView).heads).toEqual([]);
    const add = await route('POST', ['heads'], { cookie: owner, body: { nameEn: 'Office tea', nameBn: 'অফিসের চা', line: 'OTHER' } });
    expect(add.status).toBe(201);
    expect((await route('POST', ['heads'], { cookie: owner, body: { nameEn: 'office  TEA', line: 'OTHER' } })).status).toBe(409);
    expect((await route('POST', ['heads'], { cookie: owner, body: { nameEn: 'Boxes', line: 'NOPE' } })).status).toBe(400);
    expect((await route('POST', ['heads'], { cookie: reader, body: { nameEn: 'Reader head', line: 'OTHER' } })).status).toBe(403);
    const id = (add.body.head as { id: string }).id;
    expect((await route('POST', ['heads', id, 'archive'], { cookie: owner, body: { archived: true } })).status).toBe(200);
    expect((await t.prisma.expenseHead.findUniqueOrThrow({ where: { id } })).archivedAt).not.toBeNull();
    expect((await route('POST', ['heads', id, 'archive'], { cookie: owner, body: { archived: false } })).status).toBe(200);
    expect(await t.prisma.auditLog.count({ where: { entityType: 'ExpenseHead', entityId: id } })).toBe(3);
  });

  it('an expense goes through the cost line of its head, once per request key; reversed once; this store only', async () => {
    const head = await t.prisma.expenseHead.create({ data: { storeId: A, key: 'packing-tape', nameEn: 'Packing tape', summaryLine: 'PACKAGING' } });
    const body = { headId: head.id, day: today, amountMinor: 35_000, note: 'two rolls', requestKey: 'expense-key-0001' };
    const r1 = await route('POST', [], { cookie: owner, body });
    expect(r1.status).toBe(201);
    const r2 = await route('POST', [], { cookie: owner, body });
    expect(r2.status).toBe(200);
    expect(r2.body.id).toBe(r1.body.id);
    expect(await t.prisma.retailExpense.count({ where: { storeId: A, headId: head.id } })).toBe(1);
    const cost = await t.prisma.costEntry.findUniqueOrThrow({ where: { id: r1.body.costEntryId as string } });
    expect(cost).toMatchObject({ summaryLine: 'PACKAGING', amountMinor: 35_000, module: 'books', detail: 'Packing tape: two rolls' });

    expect((await route('POST', [String(r1.body.id), 'reverse'], { cookie: owner, body: { reason: '' } })).body.error).toBe('REASON_REQUIRED');
    const rev = await route('POST', [String(r1.body.id), 'reverse'], { cookie: owner, body: { reason: 'typed twice' } });
    expect(rev.status).toBe(201);
    expect((await route('POST', [String(r1.body.id), 'reverse'], { cookie: owner, body: { reason: 'again' } })).status).toBe(409);
    const view = (await route('GET', [], { cookie: owner })).body as unknown as ExpensesView;
    const mine = view.rows.filter((r) => r.headId === head.id);
    expect(mine.map((r) => [r.amountMinor, r.reversal, r.reversed])).toEqual(
      expect.arrayContaining([
        [35_000, false, true],
        [-35_000, true, false],
      ]),
    );
    expect(view.byHead.find((b) => b.headId === head.id)).toEqual({ headId: head.id, minor: 0, count: 1 });

    // an archived head takes no expense; another store's head is not this store's
    const other = await t.prisma.expenseHead.create({ data: { storeId: B, key: 'b-head', nameEn: 'B head', summaryLine: 'OTHER' } });
    expect((await route('POST', [], { cookie: owner, body: { ...body, headId: other.id, requestKey: 'expense-key-0002' } })).status).toBe(400);
    expect((await route('POST', [], { cookie: reader, body: { ...body, requestKey: 'expense-key-0003' } })).status).toBe(403);
  });

  it('a receipt: off as shipped; a picture or PDF only, within the size; named by the expense; read back', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const form = (bytes: Uint8Array<ArrayBuffer>, name: string) => {
      const f = new FormData();
      f.append('file', new File([bytes], name));
      return f;
    };
    expect((await route('POST', ['receipts'], { cookie: owner, form: form(png, 'tape.png') })).body.error).toBe('RECEIPTS_OFF');
    const cur = await deps.resolver.get('costs.receipts', { storeId: A });
    await deps.resolver.set('costs.receipts', { enabled: true, maxMb: 1 }, storeTarget(A), { actorId: null, reason: 'test', expectedVersion: cur.version });
    expect((await route('POST', ['receipts'], { cookie: owner, form: form(new TextEncoder().encode('<svg onload=x>'), 'a.svg') })).body.error).toBe('FILE_NOT_ALLOWED');
    expect((await route('POST', ['receipts'], { cookie: owner, form: form(new Uint8Array(1024 * 1024 + 1).fill(0xff), 'big.jpg') })).status).toBe(413);
    expect((await route('POST', ['receipts'], { cookie: reader, form: form(png, 'tape.png') })).status).toBe(403);
    const up = await route('POST', ['receipts'], { cookie: owner, form: form(png, 'tape.png') });
    expect(up.status).toBe(201);
    const rid = (up.body.file as { id: string }).id;
    expect(await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: rid } })).toMatchObject({ storeId: A, folder: 'expense-receipts', mimeType: 'image/png', originalFileName: 'tape.png' });

    const head = await t.prisma.expenseHead.create({ data: { storeId: A, key: 'tape', nameEn: 'Tape', summaryLine: 'PACKAGING' } });
    const body = { headId: head.id, day: today, amountMinor: 12_000, receiptId: rid, requestKey: 'expense-key-0101' };
    // a library file that is not a receipt is refused
    const other = await t.prisma.mediaAsset.create({ data: { storeId: A, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: 'x/y.png', mimeType: 'image/png', bytes: 1n, checksumSha256: 'x', isOriginal: true, tags: [] } });
    expect((await route('POST', [], { cookie: owner, body: { ...body, receiptId: other.id, requestKey: 'expense-key-0102' } })).status).toBe(400);
    const add = await route('POST', [], { cookie: owner, body });
    expect(add.status).toBe(201);
    expect((await t.prisma.retailExpense.findUniqueOrThrow({ where: { id: String(add.body.id) } })).receiptMediaId).toBe(rid);
    const view = (await route('GET', [], { cookie: reader })).body as unknown as ExpensesView;
    expect(view.rows.find((r) => r.id === add.body.id)?.receiptId).toBe(rid);
    const file = await raw('GET', ['receipts', rid], { cookie: reader });
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(png);
    expect((await raw('GET', ['receipts', other.id], { cookie: reader })).status).toBe(404);
    expect((await raw('GET', ['receipts', rid], { cookie: owner, store: B })).status).toBe(404);
  });

  it('a store not on the books yet takes no expense', async () => {
    const head = await t.prisma.expenseHead.create({ data: { storeId: B, key: 'office', nameEn: 'Office', summaryLine: 'OTHER' } });
    const r = await route('POST', [], { cookie: owner, store: B, body: { headId: head.id, day: today, amountMinor: 1_000, requestKey: 'expense-key-0004' } });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.body.error).toBe('BOOKS_NOT_LINKED');
    expect(await t.prisma.retailExpense.count({ where: { storeId: B } })).toBe(0);
  });
});
