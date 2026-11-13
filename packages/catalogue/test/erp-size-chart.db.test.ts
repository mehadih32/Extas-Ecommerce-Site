// S28 · PR 683 — the ERP's size chart per style on a real PostgreSQL: off as shipped, stored once per style, used as the
// shop's own chart for a product, never overwritten by a later ERP change, only the shop's sizes and measurements.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor, type PermissionKey } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { erpChartView, storeErpChart, useErpChart, getSizeChart, type CatalogueDeps, type SettingsReader, type Who } from '../src';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('ERP size chart on PostgreSQL (PR 683)', () => {
  let t: TestDatabase;
  let A = 0;
  let on = false;
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      if (key === 'catalogue.erpSizeChart') return { ...registry['catalogue.erpSizeChart'].default, on } as Value<K>;
      return registry[key].default as Value<K>;
    },
  };
  const deps = (): CatalogueDeps => ({ db: t.prisma, settings });
  const as = (actor: Actor): Who => ({ actor, storeId: A });
  let editor: Actor;
  let reader: Actor;
  let product = '';
  let noStyle = '';

  beforeAll(async () => {
    t = await createTestDatabase('catalogue_erpchart');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (email: string, perms: PermissionKey[]): Promise<Actor> => {
      const role = await createRole(t.prisma, SYSTEM, { key: email.split('@')[0]!, nameEn: email, nameBn: email, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email, displayName: email, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: A } });
      return { staffUserId: u.id };
    };
    editor = await staff('e-editor@example.com', ['catalogue.read', 'catalogue.write']);
    reader = await staff('e-reader@example.com', ['catalogue.read']);
    const gt = await t.prisma.garmentType.create({
      data: {
        storeId: A,
        key: 'e-polo',
        nameEn: 'Polo',
        nameBn: 'পোলো',
        measurementFields: [
          { key: 'chest', labelEn: 'Chest', labelBn: 'বুক', unit: 'inch' },
          { key: 'length', labelEn: 'Length', labelBn: 'দৈর্ঘ্য', unit: 'inch' },
        ],
      },
    });
    const cat = await t.prisma.category.create({ data: { storeId: A, slug: 'e-polos', nameEn: 'Polos', garmentTypeId: gt.id } });
    for (const [i, key] of ['s', 'm', 'l'].entries()) await t.prisma.size.create({ data: { storeId: A, key, label: key.toUpperCase(), sortOrder: i + 1 } });
    product = (await t.prisma.product.create({ data: { storeId: A, slug: 'e-p1', nameEn: 'Polo', categoryId: cat.id, erpStyleCode: 'ST-101' }, select: { id: true } })).id;
    noStyle = (await t.prisma.product.create({ data: { storeId: A, slug: 'e-p2', nameEn: 'No style', categoryId: cat.id }, select: { id: true } })).id;
  }, 300_000);
  afterAll(async () => t?.drop());

  it('is off as shipped', async () => {
    expect((await erpChartView(deps(), as(reader), product)).state).toBe('off');
    expect(await code(useErpChart(deps(), as(editor), product))).toBe('CONFLICT');
  });

  it('stores the chart once per style, and a product without a style code has none', async () => {
    on = true;
    expect((await erpChartView(deps(), as(reader), noStyle)).state).toBe('no-style');
    expect((await erpChartView(deps(), as(reader), product)).state).toBe('none');
    const payload = {
      styleCode: 'ST-101',
      unit: 'inch' as const,
      fields: ['chest', 'length', 'shoulder'],
      rows: ['S', 'M', 'L', 'XL', 'XXL'].map((size, i) => ({ size, values: [38 + 2 * i, 26 + i, 16.5 + 0.5 * i] })),
    };
    expect(await code(storeErpChart(deps(), as(reader), payload, 'MOCK'))).toBe('FORBIDDEN');
    expect(await storeErpChart(deps(), as(editor), payload, 'MOCK')).toMatchObject({ changed: true });
    expect(await storeErpChart(deps(), as(editor), payload, 'MOCK')).toMatchObject({ changed: false });
    expect(await t.prisma.erpSizeChart.count({ where: { storeId: A } })).toBe(1);
    const v = await erpChartView(deps(), as(reader), product);
    expect(v).toMatchObject({ state: 'available', source: 'MOCK' });
    expect(await code(storeErpChart(deps(), as(editor), { ...payload, rows: [{ size: 'S', values: [1] }] }, 'MOCK'))).toBe('INVALID_INPUT');
  });

  it("makes the shop's own chart from the ERP's: only its measurements and sizes, given to the product", async () => {
    const r = await useErpChart(deps(), as(editor), product);
    expect(r.already).toBe(false);
    expect(r.chart.name).toBe('ERP ST-101');
    expect(r.skippedFields).toEqual(['shoulder']);
    expect(r.skippedSizes.sort()).toEqual(['XL', 'XXL']);
    const detail = await getSizeChart(deps(), as(reader), r.chart.id);
    expect(detail.rows.map((x) => x.size)).toEqual(['s', 'm', 'l']);
    expect(await t.prisma.sizeChartAssignment.count({ where: { productId: product, sizeChartId: r.chart.id, archivedAt: null } })).toBe(1);
    expect((await erpChartView(deps(), as(reader), product)).state).toBe('applied');
    expect((await useErpChart(deps(), as(editor), product)).already).toBe(true);
    expect(await t.prisma.sizeChart.count({ where: { storeId: A } })).toBe(1);
  });

  it("keeps the shop's chart when the ERP sends a different one, and a new use makes another chart", async () => {
    const chart = (await t.prisma.sizeChart.findFirst({ where: { storeId: A } }))!;
    const before = JSON.stringify(chart.rows);
    const next = {
      styleCode: 'ST-101',
      unit: 'inch' as const,
      fields: ['chest', 'length'],
      rows: [
        { size: 'S', values: [40, 27] },
        { size: 'M', values: [42, 28] },
      ],
    };
    expect(await storeErpChart(deps(), as(editor), next, 'MOCK')).toMatchObject({ changed: true });
    expect((await erpChartView(deps(), as(reader), product)).state).toBe('newer');
    expect(JSON.stringify((await t.prisma.sizeChart.findUnique({ where: { id: chart.id } }))!.rows)).toBe(before);
    const r = await useErpChart(deps(), as(editor), product);
    expect(r.chart.name).toBe('ERP ST-101 (2)');
    expect(await t.prisma.sizeChart.count({ where: { storeId: A, archivedAt: null } })).toBe(2);
    expect(await t.prisma.auditLog.count({ where: { entityType: 'ErpSizeChart' } })).toBeGreaterThanOrEqual(3);
  });
});
