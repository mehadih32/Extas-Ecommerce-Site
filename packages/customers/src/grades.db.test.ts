// PR 534 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// customer grading — off as shipped (no mark on the list, no run, nothing made for the owner); the owner's grades kept
// with `customers.settings` only (a key from the name, the same name twice refused, his limit, archived and brought back,
// never deleted, each change audited); on, the list shows each person's grade and verified mark from his own counts
// (a refusal the shop caused never counts); the run writes the grade and verified date on the profile the person stays
// under, only what changed, and takes an archived grade off people. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { archiveGrade, gradesScreen, runGrades, runGradesNow, saveGrade } from './grades';
import { customerList } from './list';
import { setUpCustomers, type CustomersFixture } from './testing';

// hardcode-ok: made-up test numbers
const N = { gold: '+8801700005341', reg: '+8801700005342', watch: '+8801700005343', fresh: '+8801700005344' };

describe.skipIf(!process.env.TEST_DATABASE_ADMIN_URL)('customer grading on PostgreSQL (PR 534)', () => {
  let f: CustomersFixture;
  const ids: Record<string, string> = {};
  let n = 0;
  const on = (v: Partial<(typeof registry)['customers.grades']['default']> = {}) => f.overrides.set('customers.grades', { ...registry['customers.grades'].default, enabled: true, ...v });
  const rule = (minDelivered: number, maxRefused: number | null, minRefused = 0) => ({ minDelivered, maxRefused, minRefused });

  async function order(customerId: string, phone: string, status: 'DELIVERED' | 'RETURNED', reasonCode?: string) {
    n += 1;
    const o = await f.t.prisma.order.create({
      data: { storeId: f.S, number: `G534-${n}`, source: 'WEBSITE', currency: 'BDT', status, placedAt: f.clock.now, deliveredAt: status === 'DELIVERED' ? f.clock.now : null, subtotalMinor: 1_000, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: 1_000, paymentMethod: 'COD', customerId, phone, idempotencyKey: `g534-${n}` },
    });
    if (reasonCode) await f.t.prisma.orderEvent.create({ data: { storeId: f.S, orderId: o.id, type: 'order.returned', fromStatus: 'IN_TRANSIT', toStatus: 'RETURNED', reasonCode, actorType: 'COURIER', source: 'courier' } });
  }
  const marks = async () => Object.fromEntries((await customerList(f.customersDeps(), f.manager, { sort: 'name' })).rows.filter((r) => Object.values(ids).includes(r.id)).map((r) => [r.id, r.mark]));

  beforeAll(async () => {
    f = await setUpCustomers('customers-grades');
    for (const k of Object.keys(N) as (keyof typeof N)[]) ids[k] = await f.profile({ phone: N[k], name: k });
    for (let i = 0; i < 3; i++) await order(ids.gold!, N.gold, 'DELIVERED');
    await order(ids.reg!, N.reg, 'DELIVERED');
    await order(ids.reg!, N.reg, 'RETURNED', 'changed-mind');
    // three refusals, one of them the shop's own fault (the owner's list): two count
    await order(ids.watch!, N.watch, 'RETURNED', 'changed-mind');
    await order(ids.watch!, N.watch, 'RETURNED', 'changed-mind');
    await order(ids.watch!, N.watch, 'RETURNED', 'late');
    f.overrides.set('risk.history', { ...registry['risk.history'].default, ourFaultRefusals: ['late'] });
  });
  afterAll(async () => f?.t.drop());

  it('off as shipped: no grade made, no mark on the list, the run does nothing', async () => {
    expect(registry['customers.grades'].default).toMatchObject({ enabled: false, verifiedMinDelivered: 0, goodFrom: '' });
    expect((await gradesScreen(f.customersDeps(), f.manager)).grades).toEqual([]);
    expect(Object.values(await marks()).every((m) => m === null)).toBe(true);
    expect(await runGrades(f.customersDeps(), f.S)).toBeNull();
    await expect(runGradesNow(f.customersDeps(), f.manager)).rejects.toMatchObject({ code: 'SWITCHED_OFF' });
  });

  it('the owner keeps his grades with customers.settings only: a key from the name, no same name twice, his limit, archived not deleted', async () => {
    await expect(saveGrade(f.customersDeps(), f.viewer, null, { nameEn: 'Gold', criteria: rule(3, 0), sortOrder: 30 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    on({ maxGrades: 3 });
    const gold = await saveGrade(f.customersDeps(), f.manager, null, { nameEn: 'Gold', nameBn: 'সোনা', criteria: rule(3, 0), sortOrder: 30 });
    expect(gold).toMatchObject({ key: 'gold', nameBn: 'সোনা', criteria: rule(3, 0) });
    await expect(saveGrade(f.customersDeps(), f.manager, null, { nameEn: 'gold', criteria: rule(1, null), sortOrder: 5 })).rejects.toMatchObject({ code: 'NAME_TAKEN' });
    await expect(saveGrade(f.customersDeps(), f.manager, null, { nameEn: 'Bad', criteria: rule(1, 0, 2), sortOrder: 5 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const reg = await saveGrade(f.customersDeps(), f.manager, null, { nameEn: 'Regular', criteria: rule(1, 1), sortOrder: 20 });
    const watch = await saveGrade(f.customersDeps(), f.manager, null, { nameEn: 'Watch', criteria: rule(0, null, 2), sortOrder: 0 });
    await expect(saveGrade(f.customersDeps(), f.manager, null, { nameEn: 'New', criteria: rule(0, 1), sortOrder: 10 })).rejects.toMatchObject({ code: 'LIMIT_REACHED' });
    // the name changes, the key stays
    expect(await saveGrade(f.customersDeps(), f.manager, reg.id, { nameEn: 'Regular buyer', criteria: rule(1, 1), sortOrder: 20 })).toMatchObject({ key: 'regular', nameEn: 'Regular buyer' });
    expect(await archiveGrade(f.customersDeps(), f.manager, watch.id, { archived: true })).toEqual({ id: watch.id, archived: true });
    expect(await f.t.prisma.customerGrade.count({ where: { storeId: f.S } })).toBe(3);
    expect(await f.t.prisma.auditLog.count({ where: { action: { startsWith: 'customer.grade.' } } })).toBe(5);
    const s = await gradesScreen(f.customersDeps(), f.viewer);
    expect(s.canWrite).toBe(false);
    expect(s.grades.map((g) => [g.key, g.archived])).toEqual([['regular', false], ['gold', false], ['watch', true]]);
  });

  it('on: the list shows the grade and verified mark each person\'s counts earn; the shop\'s own refusals never count', async () => {
    on({ verifiedMinDelivered: 1 });
    const m = await marks();
    expect(m[ids.gold!]).toEqual({ grade: { key: 'gold', nameEn: 'Gold', nameBn: 'সোনা' }, verified: true });
    expect(m[ids.reg!]).toMatchObject({ grade: { key: 'regular' }, verified: true });
    // watch is archived: two counted refusals and no delivery earn none of the live grades
    expect(m[ids.watch!]).toEqual({ grade: null, verified: false });
    expect(m[ids.fresh!]).toEqual({ grade: null, verified: false });
  });

  it('the run writes grade and verified date on the profile, only what changed, and takes an archived grade off', async () => {
    on({ verifiedMinDelivered: 1 });
    const watch = (await f.t.prisma.customerGrade.findFirstOrThrow({ where: { storeId: f.S, key: 'watch' } })).id;
    await archiveGrade(f.customersDeps(), f.manager, watch, { archived: false });
    await f.t.prisma.customer.update({ where: { id: ids.fresh! }, data: { gradeId: watch } });
    const first = await runGrades(f.customersDeps(), f.S);
    expect(first).toMatchObject({ verified: 2 });
    const rows = await f.t.prisma.customer.findMany({ where: { id: { in: Object.values(ids) } }, select: { id: true, gradeId: true, verifiedAt: true, grade: { select: { key: true } } } });
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by[ids.gold!]!.grade?.key).toBe('gold');
    expect(by[ids.reg!]!.grade?.key).toBe('regular');
    expect(by[ids.gold!]!.verifiedAt).not.toBeNull();
    // watch brought back: his two counted refusals earn it; fresh loses the grade he held (he meets no rule)
    expect(by[ids.watch!]!.grade?.key).toBe('watch');
    expect(by[ids.fresh!]!.gradeId).toBeNull();
    expect((await runGrades(f.customersDeps(), f.S))!.changed).toBe(0);
    // the shop's own refusal never counts: at 3 refusals watch would earn nothing
    await saveGrade(f.customersDeps(), f.manager, watch, { nameEn: 'Watch', criteria: rule(0, null, 3), sortOrder: 0 });
    expect((await marks())[ids.watch!]).toEqual({ grade: null, verified: false });
    await saveGrade(f.customersDeps(), f.manager, watch, { nameEn: 'Watch', criteria: rule(0, null, 2), sortOrder: 0 });
    // the mark raised beyond what they have: the verified date is taken off
    on({ verifiedMinDelivered: 5 });
    expect((await runGradesNow(f.customersDeps(), f.manager)).changed).toBe(2);
    expect(await f.t.prisma.customer.count({ where: { id: { in: Object.values(ids) }, verifiedAt: { not: null } } })).toBe(0);
    expect(await f.t.prisma.auditLog.count({ where: { action: 'customer.grades.run' } })).toBe(1);
  });
});
