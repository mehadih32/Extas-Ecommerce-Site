// PR 59 — the Find My Size size report and the ease model on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL): the permission on every action, the report grouped by garment type and fit, the link of
// answer → order line → size exchange (follow-up 153, including the ambiguous case that is left alone), a trained
// version that arrives switched off, one active version per group, and what the storefront reads.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor, type PermissionKey } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import {
  activeSizeEase,
  assignSizeChart,
  createCategory,
  createColour,
  createGarmentType,
  createProduct,
  createSize,
  createSizeChart,
  createVariant,
  groupKey,
  linkSizeAnswers,
  listSizeAdviceModels,
  productChartChoices,
  setSizeAdviceModelActive,
  sizeReport,
  trainSizeAdvice,
  type CatalogueDeps,
  type SettingsReader,
  type Who,
} from '../src';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('Find My Size learning on PostgreSQL (PR 59)', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;
  const clock = new Date('2026-10-24T06:00:00Z');
  const overrides = new Map<string, unknown>([
    ['store.name', 'Sample Shop'],
    // a small shop's numbers, so the test does not need twenty answers to prove the engine is wired up
    ['catalogue.sizeAdvice', { ...registry['catalogue.sizeAdvice'].default, report: { windowDays: 180, minAnswers: 4, flagSharePct: 25, pageSize: 50 } }],
  ]);
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const deps = (): CatalogueDeps => ({ db: t.prisma, settings, now: () => clock });
  const sys = (storeId = A): Who => ({ actor: SYSTEM, storeId });
  const as = (actor: Actor, storeId = A): Who => ({ actor, storeId });
  let viewer: Actor;
  let editor: Actor;
  let trainer: Actor;
  const ids = {} as Record<string, string>;

  /** One recorded Find My Size answer (PR 58 writes these; no name, no phone, no visitor id). */
  async function answer(input: { product: string; recommended: string; chosen?: string | null; minutesAgo?: number; ease?: number }): Promise<string> {
    const row = await t.prisma.sizeRecommendation.create({
      data: {
        storeId: A,
        productId: ids[input.product]!,
        heightCm: 170,
        weightKg: 70,
        recommendedSizeId: ids[`size_${input.recommended}`]!,
        chosenSizeId: input.chosen ? ids[`size_${input.chosen}`]! : null,
        reasoning: { engine: 'rules', ease: input.ease ?? 2 },
        createdAt: new Date(clock.getTime() - (input.minutesAgo ?? 60) * 60_000),
      },
      select: { id: true },
    });
    return row.id;
  }

  /** An order with one line of that product and size, placed `minutesAgo` before now. */
  async function order(input: { number: string; product: string; size: string; minutesAgo: number }): Promise<string> {
    const o = await t.prisma.order.create({
      data: {
        storeId: A,
        number: input.number,
        status: 'DELIVERED',
        source: 'WEBSITE',
        currency: 'BDT',
        placedAt: new Date(clock.getTime() - input.minutesAgo * 60_000),
        subtotalMinor: 85000,
        totalMinor: 85000,
        idempotencyKey: `test:${input.number}`,
        items: {
          create: [
            {
              storeId: A,
              productId: ids[input.product]!,
              sku: `${input.product}-${input.size}`,
              productName: input.product,
              sizeLabel: input.size.toUpperCase(),
              quantity: 1,
              unitPriceMinor: 85000,
              lineTotalMinor: 85000,
            },
          ],
        },
      },
      select: { id: true, items: { select: { id: true } } },
    });
    return o.items[0]!.id;
  }

  beforeAll(async () => {
    t = await createTestDatabase('catalogue_size_advice');
    [A, B] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (email: string, perms: PermissionKey[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key: email.split('@')[0]!, nameEn: email, nameBn: email, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email, displayName: email, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: A } });
      return { staffUserId: u.id };
    };
    viewer = await staff('viewer@example.com', ['catalogue.read']);
    editor = await staff('editor@example.com', ['catalogue.read', 'catalogue.write']);
    trainer = await staff('trainer@example.com', ['catalogue.read', 'catalogue.write', 'catalogue.sizeAdvice']);

    const d = deps();
    const polo = await createGarmentType(d, sys(), {
      key: 'polo',
      nameEn: 'Polo',
      nameBn: 'পোলো',
      measurementFields: [
        { key: 'chest', labelEn: 'Chest', labelBn: 'বুক', unit: 'inch' },
        { key: 'length', labelEn: 'Length', labelBn: 'লম্বা', unit: 'inch' },
      ],
    });
    ids.polo = polo.id;
    for (const [i, label] of ['S', 'M', 'L', 'XL', 'XXL'].entries()) ids[`size_${label.toLowerCase()}`] = (await createSize(d, sys(), { key: label.toLowerCase(), label, sortOrder: (i + 1) * 10 })).id;
    ids.polos = (await createCategory(d, sys(), { nameEn: 'Polos', nameBn: 'পোলো', garmentTypeId: polo.id })).id;
    ids.navy = (await createColour(d, sys(), { nameEn: 'Navy', hex: '#1B2A4A' })).colour.id;
    const chart = await createSizeChart(d, sys(), {
      name: 'Polo regular',
      garmentTypeId: polo.id,
      fitKey: 'regular',
      easeInch: 2,
      rows: [
        { size: 's', values: [38, 27] },
        { size: 'm', values: [40, 28] },
        { size: 'l', values: [42, 29] },
        { size: 'xl', values: [44, 30] },
      ],
    });
    ids.chart = chart.id;
    await assignSizeChart(d, sys(), { sizeChartId: chart.id, categoryId: ids.polos });
    for (const key of ['pique-polo', 'contrast-polo']) {
      const p = await createProduct(d, sys(), { nameEn: key, categoryId: ids.polos, slug: key });
      await t.prisma.product.update({ where: { id: p.id }, data: { pdpBlocks: { fit: 'Regular', fitNote: null }, status: 'PUBLISHED' } });
      for (const s of ['m', 'l', 'xl']) await createVariant(d, sys(), { productId: p.id, sku: `${key.toUpperCase()}-${s.toUpperCase()}`, sizeId: ids[`size_${s}`]!, colourId: ids.navy, priceMinor: 85000 });
      ids[key] = p.id;
    }
  });
  afterAll(async () => t?.drop());

  it('every action checks its own permission in the acting store', async () => {
    expect(await code(sizeReport(deps(), as(viewer)))).toBe('ok');
    expect(await code(sizeReport(deps(), as(viewer, B)))).toBe('FORBIDDEN');
    expect(await code(linkSizeAnswers(deps(), as(viewer)))).toBe('FORBIDDEN');
    expect(await code(linkSizeAnswers(deps(), as(editor)))).toBe('ok');
    // training and switching a version on need their own permission, above "change the catalogue"
    expect(await code(trainSizeAdvice(deps(), as(editor)))).toBe('FORBIDDEN');
    expect(await code(trainSizeAdvice(deps(), as(trainer)))).toBe('ok');
    expect(await code(listSizeAdviceModels(deps(), as(viewer)))).toBe('ok');
  });

  it('every product comes back with the chart it shows, its garment type, fit and that chart’s ease', async () => {
    const { products, sizeOrder } = await productChartChoices(deps(), sys());
    expect(sizeOrder).toEqual(['s', 'm', 'l', 'xl', 'xxl']);
    const pique = products.find((p) => p.productId === ids['pique-polo'])!;
    expect(pique).toMatchObject({ chartId: ids.chart, garmentTypeId: ids.polo, fitKey: 'regular', easeInch: 2, via: 'category' });
  });

  it('the report groups the answers by garment type and fit, and flags a chart that keeps running tight', async () => {
    // four shoppers took one size up from what the chart said, one took the size we said
    await answer({ product: 'pique-polo', recommended: 'l', chosen: 'xl' });
    await answer({ product: 'pique-polo', recommended: 'l', chosen: 'xl' });
    await answer({ product: 'pique-polo', recommended: 'm', chosen: 'l' });
    await answer({ product: 'contrast-polo', recommended: 'l', chosen: 'xl' });
    await answer({ product: 'contrast-polo', recommended: 'l', chosen: 'l' });
    // and one answer nobody acted on
    await answer({ product: 'contrast-polo', recommended: 'm' });
    const r = await sizeReport(deps(), sys());
    expect(r.answers).toBe(6);
    expect(r.useTrainedEase).toBe(false);
    expect(r.groups).toHaveLength(1);
    const g = r.groups[0]!;
    expect(g).toMatchObject({ garmentTypeId: ids.polo, fitKey: 'regular', easeInch: 2 });
    expect(g.charts.map((c) => c.id)).toEqual([ids.chart]);
    expect({ answers: g.stats.answers, wentUp: g.stats.wentUp, followed: g.stats.followed, signals: g.stats.signals }).toEqual({ answers: 6, wentUp: 4, followed: 1, signals: 5 });
    expect(g.stats.flag).toBe('tight');
    expect(g.proposal).toMatchObject({ enough: true, verdict: 'tight' });
    expect(g.proposal.proposedEaseInch).toBeGreaterThan(2);
    // and per product: the busiest first, then by name
    expect(r.products.map((p) => p.nameEn)).toEqual(['contrast-polo', 'pique-polo']);
    expect(r.products.map((p) => p.stats.answers)).toEqual([3, 3]);
    expect(r.products.find((p) => p.nameEn === 'pique-polo')!.stats.wentUp).toBe(3);
    // another store sees none of it
    expect((await sizeReport(deps(), sys(B))).answers).toBe(0);
  });

  it('follow-up 153: an answer is tied to the one order line it led to, and an ambiguous pair is left alone', async () => {
    const one = await answer({ product: 'pique-polo', recommended: 'l', chosen: 'xl', minutesAgo: 120 });
    const line = await order({ number: 'T-1', product: 'pique-polo', size: 'xl', minutesAgo: 100 });
    // two lines of the same product and size inside the window: nothing is linked, because a wrong link teaches wrongly
    const twoA = await answer({ product: 'contrast-polo', recommended: 'm', chosen: 'l', minutesAgo: 120 });
    await order({ number: 'T-2', product: 'contrast-polo', size: 'l', minutesAgo: 110 });
    await order({ number: 'T-3', product: 'contrast-polo', size: 'l', minutesAgo: 105 });
    // an order placed before the answer is never the answer's order
    const early = await answer({ product: 'pique-polo', recommended: 'm', chosen: 'm', minutesAgo: 30 });
    await order({ number: 'T-4', product: 'pique-polo', size: 'M', minutesAgo: 200 });

    const r = await linkSizeAnswers(deps(), sys());
    expect(r.linked).toBe(1);
    expect(r.ambiguous).toBe(1);
    expect((await t.prisma.sizeRecommendation.findUniqueOrThrow({ where: { id: one } })).orderItemId).toBe(line);
    expect((await t.prisma.sizeRecommendation.findUniqueOrThrow({ where: { id: twoA } })).orderItemId).toBeNull();
    expect((await t.prisma.sizeRecommendation.findUniqueOrThrow({ where: { id: early } })).orderItemId).toBeNull();
    // running it again links nothing twice
    expect((await linkSizeAnswers(deps(), sys())).linked).toBe(0);

    // a size exchange on that line is the strongest signal there is, and the report reads it
    const ex = await t.prisma.exchange.create({
      data: { storeId: A, orderId: (await t.prisma.orderItem.findUniqueOrThrow({ where: { id: line }, select: { orderId: true } })).orderId, number: 'EX-1', status: 'COMPLETED', reason: 'size', tier: 1 },
      select: { id: true },
    });
    const xxl = await t.prisma.productVariant.create({
      data: { storeId: A, productId: ids['pique-polo']!, sku: 'PIQUE-POLO-XXL', sizeId: ids.size_xxl!, colourId: ids.navy!, priceMinor: 85000 },
      select: { id: true },
    });
    await t.prisma.exchangeItem.create({ data: { storeId: A, exchangeId: ex.id, originalOrderItemId: line, newVariantId: xxl.id, quantity: 1 } });
    const after = await sizeReport(deps(), sys());
    expect(after.groups[0]!.stats.exchanged).toBe(1);
    expect(after.ordered).toBe(1);
  });

  it('a trained version arrives switched off, keeps its whole report, and only one is on per garment type and fit', async () => {
    const trained = await trainSizeAdvice(deps(), as(trainer));
    expect(trained.trained).toHaveLength(1);
    const v1 = trained.trained[0]!;
    expect(v1).toMatchObject({ version: 1, isActive: false, baseEaseInch: 2, verdict: 'tight' });
    expect(v1.easeInch).toBeGreaterThan(2);
    expect(v1.deltaInch).toBeGreaterThan(0);
    // the chart itself is untouched
    expect((await t.prisma.sizeChart.findUniqueOrThrow({ where: { id: ids.chart } })).columns).toMatchObject({ easeInch: 2 });
    // nothing is used while no version is on
    expect((await activeSizeEase({ db: t.prisma }, A)).size).toBe(0);

    const on = await setSizeAdviceModelActive(deps(), as(trainer), v1.id, true);
    expect(on.isActive).toBe(true);
    const ease = await activeSizeEase({ db: t.prisma }, A);
    expect(ease.get(groupKey(ids.polo!, 'regular'))).toBe(v1.easeInch);

    // a second version, switched on, switches the first off; nothing is deleted
    const again = await trainSizeAdvice(deps(), as(trainer));
    const v2 = again.trained[0]!;
    expect(v2.version).toBe(2);
    await setSizeAdviceModelActive(deps(), as(trainer), v2.id, true);
    const models = await listSizeAdviceModels(deps(), as(viewer));
    expect(models.filter((m) => m.isActive).map((m) => m.version)).toEqual([2]);
    expect(models).toHaveLength(2);
    // and switching it off leaves the finder on the owner's own chart again
    await setSizeAdviceModelActive(deps(), as(trainer), v2.id, false);
    expect((await activeSizeEase({ db: t.prisma }, A)).size).toBe(0);
    // every training and switch is in the audit log
    expect(await t.prisma.auditLog.count({ where: { storeId: A, entityType: 'SizeAdviceModel' } })).toBeGreaterThanOrEqual(4);
  });

  it('a group with too few signals gets no version at all, so a quiet month never moves a chart', async () => {
    overrides.set('catalogue.sizeAdvice', { ...registry['catalogue.sizeAdvice'].default, report: { windowDays: 180, minAnswers: 500, flagSharePct: 25, pageSize: 50 } });
    const r = await trainSizeAdvice(deps(), as(trainer));
    expect(r.trained).toHaveLength(0);
    expect(r.skipped[0]).toMatchObject({ why: 'not-enough' });
    const rep = await sizeReport(deps(), sys());
    expect(rep.groups[0]!.proposal).toMatchObject({ enough: false, deltaInch: 0, verdict: 'not-enough' });
    overrides.set('catalogue.sizeAdvice', { ...registry['catalogue.sizeAdvice'].default, report: { windowDays: 180, minAnswers: 4, flagSharePct: 25, pageSize: 50 } });
  });
});
