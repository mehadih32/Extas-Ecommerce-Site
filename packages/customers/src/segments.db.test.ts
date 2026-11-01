// PR 287 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// segments from real behaviour — off as shipped (nothing counted, nothing saved), the conditions counted over the
// Customers list's own people (a merged profile under its survivor, Sales delivered only, a refusal the shop caused never
// counted), a category, a size and an area looked up inside the person's orders, the built-in segments, the live
// preview with masked numbers, names unique, the owner's limits, a stale save refused, archive and restore (never
// deleted), every change audited, and the Customers list narrowed to a segment. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { customerList } from './list';
import { mergeCustomers } from './merge';
import { archiveSegment, previewSegment, saveSegment, saveSegmentSettings, segmentPage, segmentsScreen } from './segments';
import { setUpCustomers, type CustomersFixture } from './testing';

// hardcode-ok: made-up test numbers
const N = { a: '+8801700002871', a2: '+8801900002871', b: '+8801700002872', c: '+8801700002873' };

describe.skipIf(!process.env.TEST_DATABASE_ADMIN_URL)('segments on PostgreSQL (PR 287)', () => {
  let f: CustomersFixture;
  const ids: Record<string, string> = {};
  let n = 0;
  let category = '';
  let area = '';

  async function order(customerId: string, phone: string, status: 'PLACED' | 'DELIVERED' | 'RETURNED', total: number, o: { daysAgo?: number; reason?: string; size?: string; product?: string; area?: string } = {}) {
    n += 1;
    const placed = new Date(f.clock.now.getTime() - (o.daysAgo ?? 1) * 86_400_000);
    const row = await f.t.prisma.order.create({
      data: { storeId: f.S, number: `L287-${n}`, source: 'WEBSITE', currency: 'BDT', status, placedAt: placed, deliveredAt: status === 'DELIVERED' ? placed : null, subtotalMinor: total, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: total, paymentMethod: 'COD', customerId, phone, idempotencyKey: `l287-${n}`, areaId: o.area ?? null },
    });
    if (o.size || o.product) await f.t.prisma.orderItem.create({ data: { storeId: f.S, orderId: row.id, productId: o.product ?? null, sku: `SKU-287-${n}`, productName: 'Test piece', sizeLabel: o.size ?? null, quantity: 1, unitPriceMinor: total, lineTotalMinor: total } });
    if (o.reason) await f.t.prisma.orderEvent.create({ data: { storeId: f.S, orderId: row.id, type: 'order.returned', reasonCode: o.reason, actorType: 'SYSTEM', source: 'system' } });
    return row.id;
  }
  const deps = () => ({ ...f.customersDeps(), settings: { ...f.customersDeps().settings, set: async (key: string, value: unknown) => void f.overrides.set(key, value) } });
  const on = () => f.overrides.set('customers.segments', { enabled: true, maxSegments: 3, maxConditions: 4, previewShown: 2 });
  const def = (...all: unknown[]) => ({ v: 1, all });

  beforeAll(async () => {
    f = await setUpCustomers('customers-segments');
    const p = f.t.prisma;
    await p.customer.updateMany({ where: { storeId: f.S }, data: { archivedAt: f.clock.now } });
    const prod = await p.product.findFirstOrThrow({ where: { storeId: f.S, categoryId: { not: null } }, select: { id: true, categoryId: true } });
    category = prod.categoryId!;
    area = (await p.geoArea.findFirstOrThrow({ where: { level: 'DISTRICT' }, select: { id: true } })).id;
    const thana = await p.geoArea.findFirst({ where: { ancestorIds: { has: area } }, select: { id: true } });
    ids.a = await f.profile({ phone: N.a, name: 'Rahim Uddin' });
    ids.a2 = await f.profile({ phone: N.a2, name: 'Rahim (office)' });
    ids.b = await f.profile({ phone: N.b, name: 'Karim' });
    ids.c = await f.profile({ phone: N.c, name: 'Sumon' });
    await p.customer.update({ where: { id: ids.b! }, data: { firstSource: 'WHATSAPP', smsMarketingConsent: true } });
    // Rahim: two delivered (one on his second profile; a size M piece of the category, sent to a thana of the district),
    // one returned "late" (the shop's fault: never a refusal)
    await order(ids.a!, N.a, 'DELIVERED', 10_000, { daysAgo: 100, product: prod.id, size: 'M', area: thana?.id ?? area });
    await order(ids.a2!, N.a2, 'DELIVERED', 6_000, { daysAgo: 90 });
    await order(ids.a!, N.a, 'RETURNED', 3_000, { daysAgo: 80, reason: 'late' });
    // Karim: refused at the door (his doing), one open, size L
    await order(ids.b!, N.b, 'RETURNED', 4_000, { daysAgo: 5, reason: 'changedMind', size: 'L' });
    await order(ids.b!, N.b, 'PLACED', 2_000, { daysAgo: 1 });
    // Sumon: nothing yet
    await mergeCustomers(f.customersDeps(), f.manager, { survivorId: ids.a, mergedId: ids.a2 });
  });
  afterAll(async () => f?.t.drop());

  it('off as shipped: the page counts nothing, the builder and saving are refused', async () => {
    const s = await segmentsScreen(f.customersDeps(), f.viewer);
    expect(s.enabled).toBe(false);
    expect(s.builtIn.every((b) => b.count === null)).toBe(true);
    await expect(previewSegment(f.customersDeps(), f.viewer, { definition: def() })).rejects.toMatchObject({ code: 'SWITCHED_OFF' });
    await expect(saveSegment(f.customersDeps(), f.manager, null, { name: 'x', definition: def() })).rejects.toMatchObject({ code: 'SWITCHED_OFF' });
  });

  it('the owner switches it on from the page (audited); a reader may not', async () => {
    await expect(saveSegmentSettings(deps(), f.viewer, { enabled: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const s = await saveSegmentSettings(deps(), f.manager, { enabled: true });
    expect(s.enabled).toBe(true);
    expect(await f.t.prisma.auditLog.count({ where: { action: 'customer.segment.settings' } })).toBe(1);
    on();
  });

  it('counts each condition over the list people: merged profiles under the survivor, Sales delivered only, our-fault refusals left out', async () => {
    on();
    const count = async (...all: unknown[]) => (await previewSegment(f.customersDeps(), f.viewer, { definition: def(...all) })).count;
    expect(await count()).toBe(3);
    expect(await count({ field: 'ordersMin', value: 3 })).toBe(1); // Rahim: 3 orders over two profiles
    expect(await count({ field: 'salesMin', value: 16_000 })).toBe(1); // 10 000 + 6 000 delivered
    expect(await count({ field: 'salesMin', value: 16_001 })).toBe(0);
    expect(await count({ field: 'deliveryMin', value: 60 })).toBe(1); // 2 of 3
    expect(await count({ field: 'refused', value: true })).toBe(1); // Karim only: Rahim's "late" was the shop's fault
    expect(await count({ field: 'lastOrderOver', value: 60 })).toBe(1);
    expect(await count({ field: 'lastOrderWithin', value: 7 })).toBe(1);
    expect(await count({ field: 'category', value: category })).toBe(1);
    expect(await count({ field: 'size', value: 'm' })).toBe(1);
    expect(await count({ field: 'size', value: 'L' })).toBe(1);
    expect(await count({ field: 'area', value: area })).toBe(1); // a thana inside the district counts
    expect(await count({ field: 'source', value: 'WHATSAPP' })).toBe(1);
    expect(await count({ field: 'consent', value: 'sms' })).toBe(1);
    expect(await count({ field: 'consent', value: 'none' })).toBe(2);
    expect(await count({ field: 'ordersMax', value: 0 })).toBe(1); // Sumon
    expect(await count({ field: 'ordersMin', value: 1 }, { field: 'consent', value: 'none' })).toBe(1); // "and"
    await expect(previewSegment(f.customersDeps(), f.viewer, { definition: def({ field: 'ordersMin', value: -1 }) })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(previewSegment(f.customersDeps(), f.viewer, { definition: def({ field: 'gender', value: 'm' }) })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('the preview lists the first people by delivered spend, numbers masked without the full-number key', async () => {
    on();
    const p = await previewSegment(f.customersDeps(), f.viewer, { definition: def() });
    expect(p.members).toHaveLength(2);
    expect(p.members[0]!.id).toBe(ids.a);
    expect(p.members[0]!.salesMinor).toBe(16_000);
    expect(p.members[0]!.phone?.masked).toBe(true);
    const full = await previewSegment(f.customersDeps(), f.manager, { definition: def() });
    expect(full.members[0]!.phone?.masked).toBe(false);
  });

  it('saves, names unique, limits, stale and audit; the list page counts it live with the built-in segments', async () => {
    on();
    await expect(saveSegment(f.customersDeps(), f.viewer, null, { name: 'Loyal', definition: def() })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const a = await saveSegment(f.customersDeps(), f.manager, null, { name: 'Loyal  buyers', definition: def({ field: 'ordersMin', value: 2 }) });
    expect(a.preview?.count).toBe(2);
    expect((await f.t.prisma.segment.findUniqueOrThrow({ where: { id: a.segment.id } })).memberCount).toBe(2);
    await expect(saveSegment(f.customersDeps(), f.manager, null, { name: 'loyal buyers', definition: def() })).rejects.toMatchObject({ code: 'NAME_TAKEN' });
    await expect(saveSegment(f.customersDeps(), f.manager, null, { name: 'Too many', definition: def(...Array.from({ length: 5 }, () => ({ field: 'ordersMin', value: 1 }))) })).rejects.toMatchObject({ code: 'LIMIT_REACHED' });
    await expect(saveSegment(f.customersDeps(), f.manager, null, { name: 'Bad area', definition: def({ field: 'category', value: '00000000-0000-7000-8000-000000000000' }) })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const changed = await saveSegment(f.customersDeps(), f.manager, a.segment.id, { name: 'Loyal buyers', definition: def({ field: 'ordersMin', value: 3 }), version: a.segment.version });
    expect(changed.preview?.count).toBe(1);
    await expect(saveSegment(f.customersDeps(), f.manager, a.segment.id, { name: 'Loyal buyers', definition: def(), version: a.segment.version })).rejects.toMatchObject({ code: 'STALE' });
    expect(await f.t.prisma.auditLog.count({ where: { entityType: 'Segment', entityId: a.segment.id } })).toBe(2);
    const screen = await segmentsScreen(f.customersDeps(), f.viewer);
    expect(screen.segments.map((s) => [s.name, s.count])).toEqual([['Loyal buyers', 1]]);
    expect(Object.fromEntries(screen.builtIn.map((b) => [b.id, b.count]))).toMatchObject({ new: 1, returning: 2, refused: 1, nooffers: 2 });
    expect(screen.builtIn.some((b) => b.id === 'vip')).toBe(false); // no VIP figure yet (CN-018)
  });

  it('archives and restores (never deleted, audited); the store limit and the names hold', async () => {
    on();
    const one = (await segmentsScreen(f.customersDeps(), f.viewer)).segments[0]!;
    const b = await saveSegment(f.customersDeps(), f.manager, null, { name: 'Refused before', definition: def({ field: 'refused', value: true }) });
    await saveSegment(f.customersDeps(), f.manager, null, { name: 'New', definition: def({ field: 'ordersMax', value: 1 }) });
    await expect(saveSegment(f.customersDeps(), f.manager, null, { name: 'Fourth', definition: def() })).rejects.toMatchObject({ code: 'LIMIT_REACHED' });
    await archiveSegment(f.customersDeps(), f.manager, b.segment.id, { archived: true });
    const s = await segmentsScreen(f.customersDeps(), f.viewer);
    expect(s.archived.map((x) => x.name)).toEqual(['Refused before']);
    expect(await f.t.prisma.segment.count({ where: { storeId: f.S } })).toBe(3);
    await saveSegment(f.customersDeps(), f.manager, null, { name: 'Refused before', definition: def() });
    await expect(archiveSegment(f.customersDeps(), f.manager, b.segment.id, { archived: false })).rejects.toMatchObject({ code: 'LIMIT_REACHED' });
    f.overrides.set('customers.segments', { enabled: true, maxSegments: 10, maxConditions: 4, previewShown: 2 });
    await expect(archiveSegment(f.customersDeps(), f.manager, b.segment.id, { archived: false })).rejects.toMatchObject({ code: 'NAME_TAKEN' });
    await expect(saveSegment(f.customersDeps(), f.manager, b.segment.id, { name: 'Again', definition: def() })).rejects.toMatchObject({ code: 'NOT_ACTIVE' });
    expect(await f.t.prisma.auditLog.count({ where: { action: 'customer.segment.archive', entityId: b.segment.id } })).toBe(1);
    expect((await segmentPage(f.customersDeps(), f.viewer, one.id))?.segment.name).toBe('Loyal buyers');
    expect(await segmentPage(f.customersDeps(), f.viewer, '00000000-0000-7000-8000-000000000000')).toBeNull();
  });

  it('the Customers list narrowed to a segment: its people with every view counted inside it; an unknown or archived one shows nobody', async () => {
    on();
    const seg = (await segmentsScreen(f.customersDeps(), f.viewer)).segments.find((s) => s.name === 'Loyal buyers')!;
    const l = await customerList(f.customersDeps(), f.viewer, { segment: seg.id });
    expect(l.segment?.name).toBe('Loyal buyers');
    expect(l.rows.map((r) => r.id)).toEqual([ids.a]);
    expect(l.counts.all).toBe(1);
    const archived = (await segmentsScreen(f.customersDeps(), f.viewer)).archived[0]!;
    const none = await customerList(f.customersDeps(), f.viewer, { segment: archived.id });
    expect(none.segment).toBeNull();
    expect(none.rows).toHaveLength(0);
    f.overrides.set('customers.segments', { enabled: false, maxSegments: 10, maxConditions: 4, previewShown: 2 });
    expect((await customerList(f.customersDeps(), f.viewer, { segment: seg.id })).rows).toHaveLength(0);
  });
});
