// S28 · PR 704 — Bulk orders on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): off as shipped (a quote is
// refused until the owner turns it on with the PIN); a quote from an enquiry takes its figures from the pieces and price,
// numbers itself, splits into batches and moves the enquiry to QUOTED; a batch only moves after the advance mark, shipped
// needs a tracking number, one step at a time; the marks need the PIN and the order (advance, every batch delivered,
// balance); nothing here makes a Payment row. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, setOwnerPin, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { bulkOrdersRoute } from './bulk-orders';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const PIN = '4821';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.77' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('bulk orders on PostgreSQL (PR 704)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let A = 0;
  let owner = '';
  let enquiryId = '';
  let quoteId = '';
  const route = async (method: string, path: string[], opts: { body?: unknown; cookie?: string } = {}) => {
    const res = await bulkOrdersRoute(call(method, `/api/admin/bulk-orders${path.length ? `/${path.join('/')}` : ''}?storeId=${A}`, { ...opts, cookie: opts.cookie ?? owner }), deps, path);
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };
  const quote = (over: Record<string, unknown> = {}) => ({ company: 'Northwind Ltd', contact: 'Arif', phone: '01711220044', lines: [{ name: 'Polo', colour: 'Navy', sizes: { M: 40, L: 60, S: 0 } }], pricing: 'PIECE', pieceMinor: 65000, advancePct: 50, batches: 2, ...over });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('bulkord');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const ownerRow = await t.prisma.staffUser.findUniqueOrThrow({ where: { email: 'owner@example.com' } });
    await setOwnerPin(t.prisma, { staffUserId: ownerRow.id }, { password: OWNER_PW, pin: PIN }, { minLength: 4, maxLength: 12, maxAttempts: 5, lockMinutes: 15 }, new Date());
    enquiryId = (await t.prisma.bulkEnquiry.create({ data: { storeId: A, refNo: 1, name: 'Arif', phone: '+8801711220044', company: 'Northwind Ltd', quantity: 100, source: 'page', lang: 'en' } })).id;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('is off as shipped: a quote is refused, the list says so, and the settings need the PIN', async () => {
    const v = await route('GET', []);
    expect(v.body.enabled).toBe(false);
    expect(v.body.enquiries).toHaveLength(1);
    expect((await route('POST', [], { body: quote() })).body.error).toBe('SWITCHED_OFF');
    const set = { enabled: true, defaultAdvancePct: 40, quoteValidDays: 10, maxBatches: 3, batchGapDays: 5, firstBatchAfterDays: 2 };
    expect((await route('POST', ['settings'], { body: { ...set, pin: '0000' } })).body.error).toBe('WRONG_PIN');
    expect((await route('POST', ['settings'], { body: { ...set, pin: PIN } })).status).toBe(200);
    const on = await route('GET', []);
    expect(on.body.cfg).toMatchObject({ enabled: true, defaultAdvancePct: 40, maxBatches: 3 });
  });

  it('makes a quote from an enquiry: figures, number, batches, enquiry QUOTED, audited; refuses no price and no pieces', async () => {
    expect((await route('POST', [], { body: quote({ pieceMinor: 0 }) })).body.error).toBe('NO_PRICE');
    expect((await route('POST', [], { body: quote({ lines: [{ name: 'Polo', colour: '', sizes: { M: 0 } }] }) })).body.error).toBe('NO_PIECES');
    expect((await route('POST', [], { body: quote({ company: '' }) })).body.error).toBe('INVALID_INPUT');
    expect((await route('POST', [], { body: quote({ enquiryId: '019a0000-0000-7000-8000-000000000000' }) })).body.error).toBe('ENQUIRY_NOT_FOUND');
    const r = await route('POST', [], { body: quote({ enquiryId, batches: 9 }) });
    expect(r.status).toBe(201);
    quoteId = r.body.id;
    const v = (await route('GET', [])).body;
    const q = v.quotes[0];
    expect(q).toMatchObject({ ref: 'QT-1001', pieces: 100, unitMinor: 65000, totalMinor: 6500000, advanceMinor: 3250000, balanceMinor: 3250000, state: 'QUOTE_SENT', advancePct: 50 });
    expect(q.batches.map((b: any) => b.pieces)).toEqual([34, 33, 33]);
    expect((await t.prisma.bulkEnquiry.findUniqueOrThrow({ where: { id: enquiryId } })).status).toBe('QUOTED');
    expect(v.enquiries).toHaveLength(0);
    expect(v.totals).toMatchObject({ open: 1, openPieces: 100, openMinor: 6500000, balanceToCollectMinor: 0 });
    expect(await t.prisma.auditLog.count({ where: { action: 'bulkQuote.create' } })).toBe(1);
    expect((await route('POST', [], { body: quote() })).status).toBe(201);
    expect((await route('GET', [])).body.quotes.map((x: any) => x.ref)).toEqual(['QT-1002', 'QT-1001']);
  });

  it('a batch waits for the advance; the marks need the PIN and the order; no Payment row is made', async () => {
    const batches = (await route('GET', [])).body.quotes.find((x: any) => x.id === quoteId).batches;
    expect((await route('POST', ['batches', batches[0].id, 'next'], { body: {} })).body.error).toBe('ADVANCE_FIRST');
    expect((await route('POST', ['quotes', quoteId, 'received'], { body: { which: 'balance', pin: PIN } })).body.error).toBe('ADVANCE_FIRST');
    expect((await route('POST', ['quotes', quoteId, 'received'], { body: { which: 'advance', pin: '0000' } })).body.error).toBe('WRONG_PIN');
    expect((await route('POST', ['quotes', quoteId, 'received'], { body: { which: 'advance', pin: PIN } })).status).toBe(200);
    expect((await route('POST', ['quotes', quoteId, 'received'], { body: { which: 'advance', pin: PIN } })).body.error).toBe('ALREADY_MARKED');
    expect((await route('POST', ['quotes', quoteId, 'received'], { body: { which: 'balance', pin: PIN } })).body.error).toBe('DELIVER_FIRST');
    for (const b of batches) {
      expect((await route('POST', ['batches', b.id, 'next'], { body: {} })).status).toBe(200); // packed
      expect((await route('POST', ['batches', b.id, 'next'], { body: {} })).body.error).toBe('TRACKING_NEEDED');
      expect((await route('POST', ['batches', b.id, 'next'], { body: { tracking: 'PTH123' } })).status).toBe(200); // shipped
      expect((await route('POST', ['batches', b.id, 'next'], { body: {} })).status).toBe(200); // delivered
      expect((await route('POST', ['batches', b.id, 'next'], { body: {} })).body.error).toBe('LAST_STEP');
    }
    const q = (await route('GET', [])).body.quotes.find((x: any) => x.id === quoteId);
    expect(q.state).toBe('BALANCE_DUE');
    expect((await route('GET', [])).body.totals.balanceToCollectMinor).toBe(3250000);
    expect((await route('POST', ['quotes', quoteId, 'received'], { body: { which: 'balance', pin: PIN } })).status).toBe(200);
    expect((await route('GET', [])).body.quotes.find((x: any) => x.id === quoteId).state).toBe('DONE');
    expect(await t.prisma.payment.count({ where: { storeId: A } })).toBe(0);
    expect(await t.prisma.auditLog.count({ where: { action: { in: ['bulkQuote.advanceReceived', 'bulkQuote.balanceReceived', 'bulkBatch.move'] } } })).toBe(2 + 3 * 3);
  });
});
