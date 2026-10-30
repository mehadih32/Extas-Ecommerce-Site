// PR 609 (CN-028, CN-029 Phase 1) on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): import from the ERP by
// style code, the buying price ("bought from ERP at", never shown to customers) and its change flag, and the
// selling-price floor. The ERP is the practice ERP behind LIVE connections (its fetch replaces the network). CN-029 §16:
// store A and store B each have their own connection, key (practice companies SAMPLE-CO-1 and SAMPLE-CO-2) and webhook
// secret in the vault under the store's id; nothing of one ever reaches the other. Every key is made up here; the clock
// is fixed at 23 Oct 2026.
// qa-gate (30 Oct): a SKU already in a product without a style code (normal at switch-over) is shown and that product
// is adopted; SKUs spread over other products stop the import before anything is written; sizes, product, variants,
// grades and buying prices are written in one transaction (a failure half-way leaves nothing); a re-import never turns
// a variant back on; v6 only; an older shop-price event never undoes a newer one.
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { allAdapters, createConnections, ERP_SIGNATURE_HEADER, ERP_TIMESTAMP_HEADER, mockErp } from '@extas/adapters';
import { SYSTEM, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { createColour, createProduct, createSize, setFloorMinor, updateVariant, upsertVariantBySku, type CatalogueDeps } from '@extas/catalogue';
import { registry, type Key, type Value } from '@extas/settings';
import {
  applyErpEvents,
  createWarehouse,
  importErpStyle,
  markShopPricesSeen,
  previewErpStyle,
  processErpWebhook,
  receiveErpWebhook,
  shopPriceChanges,
  type SettingsReader,
  type WebhookDeps,
} from '../src';

const T0 = new Date('2026-10-23T04:00:00Z');
const BASE = 'https://erp.example.test';
const STYLE = 'EX-PL-009';

describe.skipIf(!HAS_TEST_DB)('PR 609 on PostgreSQL: import by style code, the buying price and the floor', () => {
  let t: TestDatabase;
  let storeA = 0;
  let storeB = 0;
  let clock = T0;
  const overrides = new Map<string, unknown>();
  const settings: SettingsReader = {
    async value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>> {
      const sk = `${key}@${opts?.storeId ?? '-'}`;
      if (overrides.has(sk)) return overrides.get(sk) as Value<K>;
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const vaultValues = new Map<string, string>();
  const vaultKey = (name: string, storeId: number | null) => `${storeId ?? '-'}:${name}`;
  let connections: ReturnType<typeof createConnections>;
  const deps = (): WebhookDeps => ({ db: t.prisma, settings, connections, now: () => clock, sleep: async () => {}, random: () => 0.5 });
  const catDeps = (): CatalogueDeps => ({ db: t.prisma, settings, now: () => clock });
  const world = mockErp();
  const realFetch = globalThis.fetch;
  const secretA = randomBytes(24).toString('hex');
  const secretB = randomBytes(24).toString('hex');
  const realFetchHolder = { f: realFetch };
  const who = (storeId = storeA) => ({ actor: SYSTEM, storeId });
  const deliver = (w: { body: string; headers: Record<string, string> }) =>
    receiveErpWebhook(deps(), { rawBody: w.body, signature: w.headers[ERP_SIGNATURE_HEADER] ?? null, timestamp: w.headers[ERP_TIMESTAMP_HEADER] ?? null, idempotencyKey: null, deliveryId: w.headers['x-extas-delivery'] ?? null });
  const code = async (p: Promise<unknown>) => {
    try {
      await p;
      return 'ok';
    } catch (e) {
      const d = (e as { details?: string[] }).details ?? [];
      return (e as { code?: string }).code + (d.length ? `:${d.join(',')}` : '');
    }
  };

  beforeAll(async () => {
    t = await createTestDatabase('erpimport');
    [storeA, storeB] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    connections = createConnections({ db: t.prisma, vault: { get: async (name: string, scope?: { storeId?: number | null }) => vaultValues.get(vaultKey(name, scope?.storeId ?? null)) ?? null }, adapters: allAdapters, secretCacheMs: 0, testTimeoutMs: 5_000 });
    for (const s of [storeA, storeB]) {
      await createWarehouse(deps(), who(s), { code: `WH-${s}`, name: `Sample warehouse ${s}`, erpWarehouseId: s === storeA ? 'SAMPLE-WH-1' : 'SAMPLE-WH-3' });
      await createColour(catDeps(), who(s), { nameEn: 'Navy', hex: '1b2a4a' });
      await createSize(catDeps(), who(s), { label: 'M' });
      overrides.set(`erp.model@${s}`, 'v6');
    }
    world.reset();
    world.now = () => clock;
    // One key and one webhook secret per store, each in the vault under the store's id.
    const keyA = randomBytes(16).toString('hex');
    const keyB = randomBytes(16).toString('hex');
    for (const [store, key, hook] of [[storeA, keyA, secretA], [storeB, keyB, secretB]] as const) {
      vaultValues.set(vaultKey('extasErp.apiKey', store), key);
      vaultValues.set(vaultKey('extasErp.webhookSecret', store), hook);
    }
    world.acceptKey(keyA, 'SAMPLE-CO-1');
    world.acceptKey(keyB, 'SAMPLE-CO-2');
    globalThis.fetch = world.fetch as typeof fetch;
    // Company A's style: two colours (Black is not in the shop's list yet), a new size and a B-grade SKU.
    for (const [sku, color, size, price, grade] of [
      ['EX-PL-009-NAVY-M', 'NAVY', 'M', 650, 'A'],
      ['EX-PL-009-NAVY-L', 'NAVY', 'L', 700, 'A'],
      ['EX-PL-009-BLACK-M', 'BLACK', 'M', 650, 'A'],
      ['EX-PL-009-NAVY-M-B', 'NAVY', 'M', 400, 'B'],
    ] as const) {
      world.setVariant({ sku, barcode: `BC-${sku}`, styleCode: STYLE, styleName: 'Sample piqué polo', color, size, shopPrice: price, grade, retailPrice: '1250.00', avgCost: '600.00' }, 'SAMPLE-CO-1');
      world.setStock(sku, 'SAMPLE-WH-1', { onHand: 5 }, 'SAMPLE-CO-1');
    }
    // Company B sells another style; one of its SKUs has the same text as one of A's.
    world.setVariant({ sku: 'EX-PL-009-NAVY-L', barcode: 'BC-B-1', styleCode: 'EX-B-STYLE', styleName: 'Store B polo', color: 'NAVY', size: 'L', shopPrice: 999, grade: 'A' }, 'SAMPLE-CO-2');
    world.setStock('EX-PL-009-NAVY-L', 'SAMPLE-WH-3', { onHand: 5 }, 'SAMPLE-CO-2');
    const connection = (storeId: number) => ({ storeId, kind: 'ERP' as const, provider: 'extasErp', name: 'extasErp', mode: 'LIVE' as const, enabled: true, config: { baseUrl: BASE }, secretNames: ['extasErp.apiKey', 'extasErp.webhookSecret'] });
    await t.prisma.integration.create({ data: connection(storeA) });
    await t.prisma.integration.create({ data: connection(storeB) });
  });
  afterAll(async () => {
    globalThis.fetch = realFetchHolder.f;
    await t?.drop();
  });
  beforeEach(() => {
    clock = new Date(clock.getTime() + 60_000);
  });

  it('the preview lists every SKU of the style with its buying price; an unknown colour stops the import', async () => {
    const p = await previewErpStyle(deps(), who(), { styleCode: STYLE });
    expect([p.state, p.model, p.styleName, p.showsBuyingPrice]).toEqual(['run', 'v6', 'Sample piqué polo', true]);
    expect(p.lines.map((l) => [l.sku, l.grade, l.shopPriceMinor, l.action, l.skip])).toEqual([
      ['EX-PL-009-BLACK-M', 'A', 65000, 'create', null],
      ['EX-PL-009-NAVY-L', 'A', 70000, 'create', null],
      ['EX-PL-009-NAVY-M', 'A', 65000, 'create', null],
      ['EX-PL-009-NAVY-M-B', 'B', 40000, 'skip', 'B_GRADE_OFF'],
    ]);
    expect([p.missingColours, p.newSizes, p.blocking]).toEqual([['BLACK'], ['L'], ['COLOUR_MISSING']]);
    expect(p.listings).toEqual([{ grade: 'A', productId: null, name: 'Sample piqué polo', lines: 3, adopt: false }]);
    expect([p.conflicts, p.invalid]).toEqual([[], []]);
    expect(await code(importErpStyle(deps(), who(), { styleCode: STYLE }))).toBe('COLOUR_MISSING:BLACK');
    expect(await t.prisma.product.count({ where: { erpStyleCode: STYLE } })).toBe(0);
    expect(await code(previewErpStyle(deps(), who(), { styleCode: '' }))).toMatch(/^INVALID_INPUT/);
  });

  it('the import makes one draft with every SKU and its buying price, and never a selling price; B grade is its own listing', async () => {
    await createColour(catDeps(), who(), { nameEn: 'Black', hex: '111111' });
    const r = await importErpStyle(deps(), who(), { styleCode: STYLE });
    expect(r).toMatchObject({ created: 3, updated: 0, skipped: 1, sizesCreated: 1, buyingPricesChanged: 0 });
    const product = await t.prisma.product.findUniqueOrThrow({ where: { id: r.products[0]!.productId }, include: { variants: { orderBy: { sku: 'asc' } } } });
    expect([product.storeId, product.status, product.erpStyleCode, product.erpGrade, product.nameEn]).toEqual([storeA, 'DRAFT', STYLE, 'A', 'Sample piqué polo']);
    expect(product.variants.map((v) => [v.sku, v.grade, v.shopPriceMinor, v.priceMinor, v.barcode])).toEqual([
      ['EX-PL-009-BLACK-M', 'A', 65000, null, 'BC-EX-PL-009-BLACK-M'],
      ['EX-PL-009-NAVY-L', 'A', 70000, null, 'BC-EX-PL-009-NAVY-L'],
      ['EX-PL-009-NAVY-M', 'A', 65000, null, 'BC-EX-PL-009-NAVY-M'],
    ]);
    // With B grade switched on, a second import adds the B-grade listing of its own and refreshes the rest.
    overrides.set('catalogue.bGrade.listing', true);
    try {
      const again = await importErpStyle(deps(), who(), { styleCode: STYLE });
      expect(again).toMatchObject({ created: 1, updated: 3, skipped: 0, sizesCreated: 0 });
      const b = again.products.find((x) => x.grade === 'B')!;
      expect(b.created).toBe(true);
      const bp = await t.prisma.product.findUniqueOrThrow({ where: { id: b.productId }, include: { variants: true } });
      expect([bp.erpGrade, bp.nameEn, bp.variants.map((v) => [v.sku, v.grade, v.shopPriceMinor])]).toEqual(['B', `Sample piqué polo${registry['catalogue.bGrade.nameSuffix'].default}`, [['EX-PL-009-NAVY-M-B', 'B', 40000]]]);
    } finally {
      overrides.delete('catalogue.bGrade.listing');
    }
  });

  it("CN-029 §16: store B's import reads only store B's ERP company; A's style is not there", async () => {
    await createColour(catDeps(), who(storeB), { nameEn: 'Black', hex: '111111' });
    const p = await previewErpStyle(deps(), who(storeB), { styleCode: STYLE });
    expect([p.lines, p.blocking]).toEqual([[], ['NOTHING_TO_IMPORT']]);
    expect(await code(importErpStyle(deps(), who(storeB), { styleCode: STYLE }))).toBe(`NOTHING_TO_IMPORT:${STYLE}`);
    // B's own style comes in with B's own buying price, into store B only.
    const own = await importErpStyle(deps(), who(storeB), { styleCode: 'EX-B-STYLE' });
    const bv = await t.prisma.productVariant.findFirstOrThrow({ where: { storeId: storeB, sku: 'EX-PL-009-NAVY-L' } });
    expect([own.created, bv.shopPriceMinor]).toEqual([1, 99900]);
    expect((await t.prisma.productVariant.findFirstOrThrow({ where: { storeId: storeA, sku: 'EX-PL-009-NAVY-L' } })).shopPriceMinor).toBe(70000);
  });

  it('a changed shop price updates the buying price and flags it; the selling price never moves; "seen" clears it', async () => {
    const sku = 'EX-PL-009-NAVY-L';
    const variant = await t.prisma.productVariant.findFirstOrThrow({ where: { storeId: storeA, sku } });
    await updateVariant(catDeps(), who(), variant.id, { priceMinor: 150_000 });
    world.setShopPrice(sku, 760, 'SAMPLE-CO-1');
    for (const h of world.v6Webhooks(secretA, 'SAMPLE-CO-1')) expect((await deliver(h)).status).toBe(202);
    expect(await applyErpEvents(deps())).toMatchObject({ applied: 1 });
    const after = await t.prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect([after.shopPriceMinor, after.shopPricePrevMinor, after.priceMinor, after.shopPriceSeenAt]).toEqual([76000, 70000, 150_000, null]);
    const list = await shopPriceChanges(deps(), who());
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({ sku, previousMinor: 70000, shopPriceMinor: 76000, priceMinor: 150_000, floorMinor: null, belowFloor: false, belowCost: false });

    // The same through variant.changed (v6 reads only the shop price there, never the ERP's retail price or cost).
    clock = new Date(clock.getTime() + 60_000);
    world.setVariant({ sku: 'EX-PL-009-NAVY-M', barcode: 'BC-EX-PL-009-NAVY-M', styleCode: STYLE, styleName: 'Sample piqué polo', color: 'NAVY', size: 'M', shopPrice: 680, grade: 'A', retailPrice: '9999.00', avgCost: '1.00' }, 'SAMPLE-CO-1');
    const w = world.variantChangedWebhook(secretA, 'EX-PL-009-NAVY-M', { companyId: 'SAMPLE-CO-1' });
    const r = await receiveErpWebhook(deps(), { rawBody: w.body, signature: w.headers[ERP_SIGNATURE_HEADER] ?? null, timestamp: w.headers[ERP_TIMESTAMP_HEADER] ?? null, idempotencyKey: null });
    expect((await processErpWebhook(deps(), r.eventId!)).status).toBe('processed');
    const m = await t.prisma.productVariant.findFirstOrThrow({ where: { storeId: storeA, sku: 'EX-PL-009-NAVY-M' } });
    expect([m.shopPriceMinor, m.shopPricePrevMinor, m.erpRetailPriceMinor, m.avgCostMinor]).toEqual([68000, 65000, null, null]);

    expect(await markShopPricesSeen(deps(), who(), { all: true })).toEqual({ seen: 2 });
    expect((await shopPriceChanges(deps(), who())).total).toBe(0);
    expect(await markShopPricesSeen(deps(), who(), { all: true })).toEqual({ seen: 0 });
  });

  it("CN-029 §16: store B's shop-price change never touches store A's SKU of the same name", async () => {
    world.setShopPrice('EX-PL-009-NAVY-L', 1111, 'SAMPLE-CO-2');
    for (const h of world.v6Webhooks(secretB, 'SAMPLE-CO-2')) expect((await deliver(h)).status).toBe(202);
    await applyErpEvents(deps());
    const [a, b] = await Promise.all([
      t.prisma.productVariant.findFirstOrThrow({ where: { storeId: storeA, sku: 'EX-PL-009-NAVY-L' } }),
      t.prisma.productVariant.findFirstOrThrow({ where: { storeId: storeB, sku: 'EX-PL-009-NAVY-L' } }),
    ]);
    expect([a.shopPriceMinor, b.shopPriceMinor, b.shopPricePrevMinor]).toEqual([76000, 111100, 99900]);
    expect((await shopPriceChanges(deps(), who())).total).toBe(0);
    expect((await shopPriceChanges(deps(), who(storeB))).items.map((i) => i.sku)).toEqual(['EX-PL-009-NAVY-L']);
  });

  it('with a floor margin set, a selling price below buying price + margin is refused; off, any price is taken', async () => {
    const v = await t.prisma.productVariant.findFirstOrThrow({ where: { storeId: storeA, sku: 'EX-PL-009-NAVY-L' } });
    expect(registry['catalogue.floor.minMarginPercent'].default).toBeNull();
    await updateVariant(catDeps(), who(), v.id, { priceMinor: 80_000 });
    overrides.set(`catalogue.floor.minMarginPercent@${storeA}`, 20);
    try {
      // 760 × 1.20 = 912 taka.
      expect(await code(updateVariant(catDeps(), who(), v.id, { priceMinor: 91_100 }))).toBe('BELOW_FLOOR:sku: EX-PL-009-NAVY-L,floor: 91200');
      expect(await code(updateVariant(catDeps(), who(), v.id, { priceMinor: 91_200 }))).toBe('ok');
      // A change that does not touch the price is not stopped by it.
      expect(await code(updateVariant(catDeps(), who(), v.id, { weightGrams: 250 }))).toBe('ok');
      // The buying-price list says when a selling price now sits below the floor.
      world.setShopPrice('EX-PL-009-NAVY-L', 800, 'SAMPLE-CO-1');
      for (const h of world.v6Webhooks(secretA, 'SAMPLE-CO-1')) await deliver(h);
      await applyErpEvents(deps());
      expect((await shopPriceChanges(deps(), who())).items[0]).toMatchObject({ shopPriceMinor: 80000, priceMinor: 91_200, floorMinor: 96000, belowFloor: true, belowCost: false });
      expect((await t.prisma.productVariant.findUniqueOrThrow({ where: { id: v.id } })).priceMinor).toBe(91_200);
      // A set of two pieces of the style: each at its dearest buying price (800), × 1.20.
      expect(await setFloorMinor(t.prisma, catDeps(), who(), [{ productId: v.productId, fixedVariantId: null, quantity: 2 }])).toBe(192_000);
      // Store B's floor is its own: unset there, store B takes any price.
      const bv = await t.prisma.productVariant.findFirstOrThrow({ where: { storeId: storeB, sku: 'EX-PL-009-NAVY-L' } });
      expect(await code(updateVariant(catDeps(), who(storeB), bv.id, { priceMinor: 100 }))).toBe('ok');
    } finally {
      overrides.delete(`catalogue.floor.minMarginPercent@${storeA}`);
    }
    expect(await setFloorMinor(t.prisma, catDeps(), who(), [{ productId: v.productId, fixedVariantId: null, quantity: 2 }])).toBeNull();
  });

  // ---- qa-gate (30 Oct) ----------------------------------------------------------------------------------------------
  const counts = async () => ({
    products: await t.prisma.product.count({ where: { storeId: storeA } }),
    variants: await t.prisma.productVariant.count({ where: { storeId: storeA } }),
    sizes: await t.prisma.size.count({ where: { storeId: storeA } }),
  });
  const ids = async () => ({
    navy: (await t.prisma.colour.findFirstOrThrow({ where: { storeId: storeA, nameEn: 'Navy' } })).id,
    m: (await t.prisma.size.findFirstOrThrow({ where: { storeId: storeA, label: 'M' } })).id,
    l: (await t.prisma.size.findFirstOrThrow({ where: { storeId: storeA, label: 'L' } })).id,
  });
  const style = (code: string, name: string, rows: [string, string, number][]) => {
    for (const [sku, size, price] of rows) world.setVariant({ sku, barcode: `BC-${sku}`, styleCode: code, styleName: name, color: 'NAVY', size, shopPrice: price, grade: 'A' }, 'SAMPLE-CO-1');
  };

  it('qa-gate: an older shop-price event that arrives late never undoes a newer one', async () => {
    const sku = 'EX-PL-009-BLACK-M';
    clock = new Date(clock.getTime() + 1_000);
    world.setShopPrice(sku, 700, 'SAMPLE-CO-1');
    clock = new Date(clock.getTime() + 1_000);
    world.setShopPrice(sku, 720, 'SAMPLE-CO-1');
    const [older, newer] = world.v6Webhooks(secretA, 'SAMPLE-CO-1');
    expect((await deliver(newer!)).status).toBe(202);
    expect(await applyErpEvents(deps())).toMatchObject({ applied: 1 });
    expect((await deliver(older!)).status).toBe(202);
    expect(await applyErpEvents(deps())).toMatchObject({ applied: 0, ignored: 1 });
    const v = await t.prisma.productVariant.findFirstOrThrow({ where: { storeId: storeA, sku } });
    expect([v.shopPriceMinor, v.shopPricePrevMinor]).toEqual([72000, 65000]);
    const ev = await t.prisma.erpEvent.findFirstOrThrow({ where: { storeId: storeA, eventId: older!.id } });
    expect([ev.status, (ev.result as { why?: string }).why]).toEqual(['IGNORED', 'OLDER']);
    // How many changed prices the list shows is a setting.
    overrides.set('catalogue.shopPrice.changesShown', 1);
    try {
      const list = await shopPriceChanges(deps(), who());
      expect([list.total > 1, list.items.length]).toEqual([true, 1]);
    } finally {
      overrides.delete('catalogue.shopPrice.changesShown');
    }
  });

  it('qa-gate: a SKU already in a product without a style code: the preview shows it, and the import adopts that product whole', async () => {
    const SW = 'EX-SW-010';
    style(SW, 'Sample switch-over tee', [
      ['EX-SW-010-NAVY-M', 'M', 500],
      ['EX-SW-010-NAVY-L', 'L', 520],
      ['EX-SW-010-NAVY-XL', 'XL', 540],
    ]);
    const { navy, m } = await ids();
    // The shop's own listing from before the ERP: no style code, one SKU of the style.
    const old = await createProduct(catDeps(), who(), { nameEn: 'Tee from the old shop' });
    await upsertVariantBySku(catDeps(), who(), { sku: 'EX-SW-010-NAVY-M', productId: old.id, colourId: navy, sizeId: m });
    const p = await previewErpStyle(deps(), who(), { styleCode: SW });
    expect(p.blocking).toEqual([]);
    expect(p.conflicts).toEqual([]);
    expect(p.listings).toEqual([{ grade: 'A', productId: old.id, name: 'Tee from the old shop', lines: 3, adopt: true }]);
    expect(p.lines.map((l) => [l.sku, l.action, l.inShop?.productId ?? null])).toEqual([
      ['EX-SW-010-NAVY-L', 'create', null],
      ['EX-SW-010-NAVY-M', 'update', old.id],
      ['EX-SW-010-NAVY-XL', 'create', null],
    ]);
    const before = await counts();
    const r = await importErpStyle(deps(), who(), { styleCode: SW });
    expect(r).toMatchObject({ created: 2, updated: 1, skipped: 0, sizesCreated: 1, products: [{ grade: 'A', productId: old.id, created: false }] });
    const after = await counts();
    expect([after.products - before.products, after.variants - before.variants, after.sizes - before.sizes]).toEqual([0, 2, 1]);
    const adopted = await t.prisma.product.findUniqueOrThrow({ where: { id: old.id }, include: { variants: { orderBy: { sku: 'asc' } } } });
    expect([adopted.erpStyleCode, adopted.erpGrade, adopted.nameEn, adopted.variants.map((v) => [v.sku, v.shopPriceMinor])]).toEqual([
      SW,
      'A',
      'Tee from the old shop',
      [
        ['EX-SW-010-NAVY-L', 52000],
        ['EX-SW-010-NAVY-M', 50000],
        ['EX-SW-010-NAVY-XL', 54000],
      ],
    ]);
    // Again: the style's own product now, nothing to adopt, nothing new.
    const again = await previewErpStyle(deps(), who(), { styleCode: SW });
    expect([again.listings[0]!.adopt, again.lines.map((l) => l.action)]).toEqual([false, ['update', 'update', 'update']]);
  });

  it('qa-gate: SKUs spread over other products stop the import before anything is written', async () => {
    const SC = 'EX-SW-011';
    style(SC, 'Sample spread tee', [
      ['EX-SW-011-NAVY-M', 'M', 500],
      ['EX-SW-011-NAVY-L', 'L', 520],
      ['EX-SW-011-NAVY-XXL', 'XXL', 560],
    ]);
    const { navy, m, l } = await ids();
    const p1 = await createProduct(catDeps(), who(), { nameEn: 'Old tee one' });
    const p2 = await createProduct(catDeps(), who(), { nameEn: 'Old tee two' });
    await upsertVariantBySku(catDeps(), who(), { sku: 'EX-SW-011-NAVY-M', productId: p1.id, colourId: navy, sizeId: m });
    await upsertVariantBySku(catDeps(), who(), { sku: 'EX-SW-011-NAVY-L', productId: p2.id, colourId: navy, sizeId: l });
    const p = await previewErpStyle(deps(), who(), { styleCode: SC });
    expect(p.blocking).toEqual(['SKU_IN_OTHER_PRODUCT']);
    expect(p.conflicts).toEqual([
      { sku: 'EX-SW-011-NAVY-L', productId: p2.id, productName: 'Old tee two' },
      { sku: 'EX-SW-011-NAVY-M', productId: p1.id, productName: 'Old tee one' },
    ]);
    const before = await counts();
    expect(await code(importErpStyle(deps(), who(), { styleCode: SC }))).toBe('SKU_IN_OTHER_PRODUCT:EX-SW-011-NAVY-L,EX-SW-011-NAVY-M');
    expect(await counts()).toEqual(before);
    expect(await t.prisma.product.count({ where: { erpStyleCode: SC } })).toBe(0);
  });

  it('qa-gate: a failure half-way leaves nothing behind (sizes, product, variants and buying prices are one transaction)', async () => {
    const SA = 'EX-SW-012';
    style(SA, 'Sample all-or-nothing tee', [
      ['EX-SW-012-NAVY-L', 'L', 500],
      ['EX-SW-012-NAVY-M', 'M', 500],
      ['EX-SW-012-NAVY-XXXL', '3XL', 600],
    ]);
    // The database refuses the last SKU, after the new size, the product and two variants were written.
    await t.prisma.$executeRawUnsafe(
      `CREATE FUNCTION qa_refuse_sku() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."sku" = 'EX-SW-012-NAVY-XXXL' THEN RAISE EXCEPTION 'test: refused'; END IF; RETURN NEW; END $$`,
    );
    await t.prisma.$executeRawUnsafe(`CREATE TRIGGER qa_refuse_sku BEFORE INSERT ON "ProductVariant" FOR EACH ROW EXECUTE FUNCTION qa_refuse_sku()`);
    const before = await counts();
    try {
      expect(await code(importErpStyle(deps(), who(), { styleCode: SA }))).not.toBe('ok');
      expect(await counts()).toEqual(before);
      expect(await t.prisma.product.count({ where: { erpStyleCode: SA } })).toBe(0);
    } finally {
      await t.prisma.$executeRawUnsafe(`DROP TRIGGER qa_refuse_sku ON "ProductVariant"`);
      await t.prisma.$executeRawUnsafe(`DROP FUNCTION qa_refuse_sku()`);
    }
    // Run again once the database takes it: complete, in one go.
    expect(await importErpStyle(deps(), who(), { styleCode: SA })).toMatchObject({ created: 3, sizesCreated: 1 });
  });

  it('qa-gate: a re-import never turns back on a variant the admin turned off; the ERP turning one off is followed', async () => {
    const off = await t.prisma.productVariant.findFirstOrThrow({ where: { storeId: storeA, sku: 'EX-SW-010-NAVY-L' } });
    await updateVariant(catDeps(), who(), off.id, { active: false });
    world.setVariant({ sku: 'EX-SW-010-NAVY-XL', barcode: 'BC-EX-SW-010-NAVY-XL', styleCode: 'EX-SW-010', styleName: 'Sample switch-over tee', color: 'NAVY', size: 'XL', shopPrice: 540, grade: 'A', active: false }, 'SAMPLE-CO-1');
    await importErpStyle(deps(), who(), { styleCode: 'EX-SW-010' });
    const rows = await t.prisma.productVariant.findMany({ where: { storeId: storeA, sku: { startsWith: 'EX-SW-010-' } }, orderBy: { sku: 'asc' } });
    expect(rows.map((v) => [v.sku, v.active])).toEqual([
      ['EX-SW-010-NAVY-L', false],
      ['EX-SW-010-NAVY-M', true],
      ['EX-SW-010-NAVY-XL', false],
    ]);
  });

  it('qa-gate (re-check): a re-import never brings back a variant the admin archived; the preview says so', async () => {
    const v = await t.prisma.productVariant.findFirstOrThrow({ where: { storeId: storeA, sku: 'EX-SW-010-NAVY-M' } });
    await updateVariant(catDeps(), who(), v.id, { archived: true });
    const p = await previewErpStyle(deps(), who(), { styleCode: 'EX-SW-010' });
    expect(p.lines.find((l) => l.sku === 'EX-SW-010-NAVY-M')).toMatchObject({ action: 'skip', skip: 'ARCHIVED' });
    expect(p.blocking).toEqual([]);
    const r = await importErpStyle(deps(), who(), { styleCode: 'EX-SW-010' });
    expect(r.skipped).toBeGreaterThanOrEqual(1);
    const after = await t.prisma.productVariant.findUniqueOrThrow({ where: { id: v.id } });
    expect([after.archivedAt !== null, after.active]).toEqual([true, v.active]);
  });

  it('qa-gate: import by style code is for contract v6 only (register row 609): a v5 store is refused', async () => {
    overrides.set(`erp.model@${storeA}`, 'v5');
    try {
      const before = await counts();
      expect((await previewErpStyle(deps(), who(), { styleCode: 'EX-SW-010' })).blocking).toContain('ERP_V5');
      expect(await code(importErpStyle(deps(), who(), { styleCode: 'EX-SW-010' }))).toBe('ERP_V5');
      expect(await counts()).toEqual(before);
    } finally {
      overrides.set(`erp.model@${storeA}`, 'v6');
    }
  });
});
