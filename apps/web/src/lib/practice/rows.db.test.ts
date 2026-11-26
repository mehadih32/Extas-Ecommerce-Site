// S28 · PR 1220 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the practice display rows (practice/rows.ts)
// are written once with their mark, show only while practice mode is on, acting on them changes nothing but their own state
// (no row is added anywhere but the audit log, no order or customer moves), and a reset removes them.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultSecurityPolicy, hashPassword, loginStaff, PRACTICE_STAFF_DOMAIN, syncAuth, SYSTEM } from '@extas/auth';
import { HAS_TEST_DB, createTestDatabase, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { PRACTICE_PHONE_PREFIX, type PrismaClient } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { approvalsView, decideApproval } from '../admin-ai/approvals';
import { PRACTICE_ROWS } from './data';
import { GROWTH_KIND } from '../marketing/growth-kind';
import { decideGrowthProposal, growthOverview } from '../marketing/growth-agent';
import { PRACTICE_CHANNEL, practiceDuplicatePair, practiceRowsMissing, seedPracticeRows } from './rows';
import { resetPractice } from './reset';
import * as od from '@extas/orders';
import { processingTags } from '../admin-orders/processing-tags';
import { seedPractice } from './seed';
import { practiceVisibilityDrift, syncPracticeVisibility } from './visibility';

const NOW = new Date('2026-11-13T08:00:00Z');
const meta = { actorId: null, reason: 'test' };

/** Every table's row count, so a test can prove an action added or removed nothing anywhere. */
async function tableCounts(db: PrismaClient): Promise<Map<string, number>> {
  const tables = await db.$queryRaw<{ t: string }[]>`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name NOT LIKE '\_%'`;
  const out = new Map<string, number>();
  for (const { t } of tables) out.set(t, Number((await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${t.replace(/"/g, '""')}"`))[0]?.n ?? 0));
  return out;
}

/** The tables whose count differs between two snapshots. */
function changed(a: Map<string, number>, b: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [t, n] of b) if ((a.get(t) ?? 0) !== n) out[t] = n - (a.get(t) ?? 0);
  return out;
}

describe.skipIf(!HAS_TEST_DB)('practice display rows (PR 1220)', () => {
  let t: TestDatabase;
  let S = 0;
  let resolver: SettingsResolver;

  beforeAll(async () => {
    t = await createTestDatabase('practice_rows');
    [S] = await seedSampleStores(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await syncAuth(t.prisma);
    // a stock location, as a live store has (the practice stock goes on it)
    const wh = await t.prisma.warehouse.create({ data: { code: 'PRACTICE-ROWS-WH', name: 'Test warehouse' }, select: { id: true } });
    await t.prisma.inventoryLocation.create({ data: { warehouseId: wh.id, code: 'PRACTICE-ROWS-MAIN', name: 'Test shelf', kind: 'WAREHOUSE' } });
    resolver = new SettingsResolver(prismaBackend(t.prisma), registry, { checkIntervalMs: 0 });
    await seedPractice(t.prisma, S, NOW);
  }, 240_000);
  afterAll(async () => {
    await t?.drop();
  });

  it('writes the prototype’s approvals once, each with the practice mark and the prototype’s kinds', async () => {
    const db = t.prisma;
    const rows = await db.aiApprovalRequest.findMany({ where: { storeId: S, kind: { not: GROWTH_KIND } }, orderBy: { createdAt: 'asc' } });
    expect(rows.length).toBeGreaterThanOrEqual(PRACTICE_ROWS.approvals.length - 3);
    expect(rows.every((r) => r.channel === PRACTICE_CHANNEL)).toBe(true);
    expect(new Set(rows.map((r) => r.kind))).toEqual(new Set(['adBudget', 'orderDecline', 'block', 'reply', 'price', 'blog']));
    // every placeholder is filled, the amounts are in the store's currency, and the draft and the link are on the card
    expect(rows.some((r) => /\{[a-z0-9]+\}/i.test(`${r.title} ${r.summary}`))).toBe(false);
    const q1 = rows.find((r) => r.title.includes('Polo Winter'))!;
    expect(q1.title).toMatch(/1,500.*2,000/);
    const reply = rows.find((r) => r.kind === 'reply' && r.status === 'PENDING')!;
    expect((reply.payload as { ownerView: { draft: string; openHref: string } }).ownerView.openHref).toBe('/admin/support');
    const decline = rows.find((r) => r.kind === 'orderDecline')!;
    expect(await db.order.count({ where: { id: decline.refId!, isPractice: true } })).toBe(1);
    expect(rows.filter((r) => r.status === 'APPROVED')).toHaveLength(1);
    // a second run adds nothing
    expect(await seedPracticeRows(db, S, NOW)).toMatchObject({ practiceApprovals: 0, practiceProposals: 0 });
    expect(await practiceRowsMissing(db, S, NOW)).toBe(false);
  });

  it('shows them only while practice mode is on, and never to a caller without the settings (the Telegram buttons)', async () => {
    const db = t.prisma;
    await resolver.set('practice.enabled', { on: false }, storeTarget(S), meta);
    expect((await approvalsView({ db, resolver, now: () => NOW }, S)).pending).toHaveLength(0);
    await resolver.set('practice.enabled', { on: true }, storeTarget(S), meta);
    const on = await approvalsView({ db, resolver, now: () => NOW }, S);
    expect(on.pending.length).toBeGreaterThan(0);
    expect(on.decided.length).toBe(1);
    expect((await approvalsView({ db, now: () => NOW }, S)).pending).toHaveLength(0);
    // the practice growth proposals stay on Marketing › Plan, as in the prototype's queue
    expect(on.pending.some((r) => r.kind === GROWTH_KIND)).toBe(false);
  });

  it('PR 1221: Marketing › Plan shows the prototype’s proposals only while practice mode is on; Approve never reaches an ad account', async () => {
    const db = t.prisma;
    const deps = { db, resolver, now: () => NOW } as unknown as Parameters<typeof decideGrowthProposal>[0];
    await resolver.set('practice.enabled', { on: false }, storeTarget(S), meta);
    expect((await growthOverview(deps)).waiting).toHaveLength(0);
    await resolver.set('practice.enabled', { on: true }, storeTarget(S), meta);
    const o = await growthOverview(deps);
    expect(o.waiting.map((x) => x.type)).toEqual(PRACTICE_ROWS.proposals.map((p) => p.type));
    expect(o.waiting.map((x) => x.name)).toEqual(PRACTICE_ROWS.proposals.map((p) => p.name));
    const who = { actor: SYSTEM, ctx: {} } as unknown as Parameters<typeof decideGrowthProposal>[1];
    const before = await tableCounts(db);
    // the ad controls are off as shipped: a real budget raise would be refused; the practice one is decided by its state alone
    expect(await decideGrowthProposal(deps, who, { action: 'decide', id: o.waiting[0]!.id, decision: 'approve', confirm: true })).toMatchObject({ status: 'PRACTICE' });
    expect(await decideGrowthProposal(deps, who, { action: 'decide', id: o.waiting[1]!.id, decision: 'reject', confirm: true })).toMatchObject({ status: 'REJECTED' });
    expect(Object.keys(changed(before, await tableCounts(db))).filter((k) => k !== 'AuditLog')).toEqual([]);
    expect(await db.adChangeRequest.count()).toBe(0);
    const after = await growthOverview(deps);
    expect(after.waiting).toHaveLength(1);
    expect(after.recent.map((x) => x.outcome).sort()).toEqual(['PRACTICE', 'REJECTED']);
  });

  it('approving or rejecting one changes only its own state: nothing is sent, booked, published or moved', async () => {
    const db = t.prisma;
    const pending = await db.aiApprovalRequest.findMany({ where: { storeId: S, channel: PRACTICE_CHANNEL, status: 'PENDING' }, orderBy: { id: 'asc' } });
    const orders = await db.order.findMany({ where: { storeId: S }, orderBy: { id: 'asc' }, select: { id: true, status: true, version: true, updatedAt: true } });
    const customers = await db.customer.findMany({ where: { storeId: S }, orderBy: { id: 'asc' }, select: { id: true, updatedAt: true } });
    const before = await tableCounts(db);
    for (const [i, r] of pending.entries()) await decideApproval({ db, now: () => NOW }, { actor: SYSTEM }, r.id, i % 2 ? 'reject' : 'approve', null);
    const after = await tableCounts(db);
    // no table gains or loses a row (at most the audit log notes the decisions)
    expect(Object.keys(changed(before, after)).filter((k) => k !== 'AuditLog')).toEqual([]);
    expect(pending.length).toBeGreaterThan(0);
    expect(await db.order.findMany({ where: { storeId: S }, orderBy: { id: 'asc' }, select: { id: true, status: true, version: true, updatedAt: true } })).toEqual(orders);
    expect(await db.customer.findMany({ where: { storeId: S }, orderBy: { id: 'asc' }, select: { id: true, updatedAt: true } })).toEqual(customers);
    expect(await db.aiApprovalRequest.count({ where: { storeId: S, channel: PRACTICE_CHANNEL, status: 'PENDING' } })).toBe(0);
  });

  it('PR 1223: a stuck pair on one phone shows Merge on Batch and Processing, hides with practice mode, and a merge moves practice orders only', async () => {
    const db = t.prisma;
    const ids = await practiceDuplicatePair(db, S);
    const pair = await db.order.findMany({ where: { id: { in: ids } } });
    expect(pair.map((o) => [o.status, o.isPractice])).toEqual([['PLACED', true], ['PLACED', true]]);
    expect(new Set(pair.map((o) => o.phone)).size).toBe(1);
    expect((await od.openReviewKinds({ db }, S, ids)).get(ids[1]!)).toEqual({ kind: 'duplicate' });
    const tags = await processingTags(db, S, ids, []);
    expect(ids.every((id) => tags.get(id)?.includes('merge'))).toBe(true);
    await syncPracticeVisibility(db, S, false, NOW);
    expect((await od.openReviewKinds({ db }, S, ids)).size).toBe(0);
    await syncPracticeVisibility(db, S, true, NOW);
    expect((await od.openReviewKinds({ db }, S, ids)).size).toBe(1);
    // Merge (switched on for the test) is refused for practice orders before anything is written, so the reset can always clear them
    const cfg = (await resolver.value('orders.mergeOrders', { storeId: S })) as Record<string, unknown>;
    await resolver.set('orders.mergeOrders', { ...cfg, enabled: true }, storeTarget(S), meta);
    const before = await tableCounts(db);
    await expect(od.mergeIntoOne({ db, settings: resolver, now: () => NOW }, { actor: SYSTEM, storeId: S }, { mainOrderId: ids[1]!, sources: [{ orderId: ids[0]! }] })).rejects.toMatchObject({ code: 'PRACTICE_NO_MERGE' });
    expect(changed(before, await tableCounts(db))).toEqual({});
    expect(await db.order.count({ where: { id: { in: ids }, status: 'PLACED' } })).toBe(2);
  });

  it('PR 1224: the prototype’s names lead Incomplete orders and stay recent', async () => {
    const db = t.prisma;
    const top = await db.checkoutDraft.findMany({ where: { storeId: S, handledAt: null }, orderBy: { lastActivityAt: 'desc' }, take: 3, select: { name: true, isPractice: true, phone: true } });
    expect(top.map((d) => d.name)).toEqual(PRACTICE_ROWS.incomplete.map((x) => x.name));
    expect(top.every((d) => d.isPractice && (d.phone === null || d.phone.startsWith(PRACTICE_PHONE_PREFIX)))).toBe(true);
    // three days on, the next fill brings them back to the top (and only them)
    const later = new Date(NOW.getTime() + 3 * 86_400_000);
    expect(await practiceRowsMissing(db, S, later)).toBe(true);
    await seedPracticeRows(db, S, later);
    expect(await practiceRowsMissing(db, S, later)).toBe(false);
    const again = await db.checkoutDraft.findMany({ where: { storeId: S }, orderBy: { lastActivityAt: 'desc' }, take: 3, select: { name: true } });
    expect(again.map((d) => d.name)).toEqual(PRACTICE_ROWS.incomplete.map((x) => x.name));
  });

  it('PR 1222: the prototype’s staff with their roles; they can never sign in and hide with practice mode', async () => {
    const db = t.prisma;
    const staff = await db.staffUser.findMany({ where: { email: { endsWith: `@${PRACTICE_STAFF_DOMAIN}` } }, include: { roleAssignments: { include: { role: { include: { permissions: { include: { permission: true } } } } } } }, orderBy: { displayName: 'asc' } });
    expect(staff.map((s) => s.displayName)).toEqual(['Nusrat', 'Rafi', 'Sohel', 'Tania']);
    expect(staff.map((s) => s.roleAssignments[0]?.role.nameEn)).toEqual(['Customer care', 'Order manager', 'Packing', 'Marketing']);
    // the practice roles hold read-only access only
    const keys = staff.flatMap((s) => s.roleAssignments.flatMap((a) => a.role.permissions.map((p) => p.permission.key)));
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k.endsWith('.read'))).toBe(true);
    // even with a real password set on it, the account is refused
    const rafi = staff.find((s) => s.displayName === 'Rafi')!;
    await db.staffUser.update({ where: { id: rafi.id }, data: { passwordHash: await hashPassword('a long password someone set') } });
    expect((await loginStaff({ db, policy: defaultSecurityPolicy() }, { email: rafi.email, password: 'a long password someone set' })).kind).toBe('invalid');
    expect(await db.staffSession.count({ where: { staffUserId: rafi.id } })).toBe(0);
    // practice mode off: archived (out of every list and picker); on: back
    await syncPracticeVisibility(db, S, false, NOW);
    expect(await db.staffUser.count({ where: { email: { endsWith: `@${PRACTICE_STAFF_DOMAIN}` }, status: 'ARCHIVED' } })).toBe(4);
    expect(await db.role.count({ where: { key: { startsWith: 'practice-' }, archivedAt: null } })).toBe(0);
    expect(await practiceVisibilityDrift(db, S, false)).toBe(0);
    await syncPracticeVisibility(db, S, true, NOW);
    expect(await db.staffUser.count({ where: { email: { endsWith: `@${PRACTICE_STAFF_DOMAIN}` }, status: 'ACTIVE' } })).toBe(4);
    expect(await practiceVisibilityDrift(db, S, true)).toBe(0);
  });

  it('"Reset practice data" removes them, and a real approval stays', async () => {
    const db = t.prisma;
    const real = await db.aiApprovalRequest.create({ data: { storeId: S, kind: 'refund', title: 'A real refund', payload: {}, channel: 'admin' } });
    const r = await resetPractice(db, S);
    expect(r.removed.AiApprovalRequest).toBeGreaterThan(0);
    expect(await db.aiApprovalRequest.count({ where: { storeId: S, channel: PRACTICE_CHANNEL } })).toBe(0);
    expect(await db.aiApprovalRequest.count({ where: { id: real.id } })).toBe(1);
    // PR 1222: the practice staff and roles go too; a real account stays
    expect(await db.staffUser.count({ where: { email: { endsWith: `@${PRACTICE_STAFF_DOMAIN}` } } })).toBe(0);
    expect(await db.role.count({ where: { key: { startsWith: 'practice-' } } })).toBe(0);
    expect(r.removed.StaffUser).toBe(4);
  });
});
