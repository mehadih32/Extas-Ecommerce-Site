// S04 · PR 558 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL) — the Parameter for Checkout panel: off
// and empty as it ships; the whole panel saved at once (layers added, changed, re-ordered; one left out is archived,
// never deleted); a layer never flags everyone; switching it on asks for a confirmation; a stale panel, an unknown
// layer and a reader are refused; one audit row per change. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { registry, RISK_SIGNAL_KEYS, type Key } from '@extas/settings';
import { checkoutLayers, layerFor, layerMatches, saveCheckoutLayers, type CheckoutLayer, type OrdersDeps } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

const layer = (over: Partial<CheckoutLayer> = {}) => ({
  name: 'High risk',
  enabled: true,
  conditions: { minScore: 65, bands: [], signals: [] },
  requirement: 'DELIVERY_CHARGE' as const,
  partPercent: null,
  ...over,
});

describe('PR 558 · which layer flags a checkout (pure)', () => {
  const L = (id: string, position: number, conditions: CheckoutLayer['conditions'], enabled = true): CheckoutLayer => ({ id, name: id, position, enabled, conditions, requirement: 'FULL_AMOUNT', partPercent: null });
  it('any one condition is enough; none set never flags; the first switched-on layer by position wins', () => {
    const risk = { score: 70, band: 'high', fired: ['refusals'] };
    expect(layerMatches({ minScore: 65, bands: [], signals: [] }, risk)).toBe(true);
    expect(layerMatches({ minScore: 80, bands: ['high'], signals: [] }, risk)).toBe(true);
    expect(layerMatches({ minScore: 80, bands: ['medium'], signals: ['newPhone'] }, risk)).toBe(false);
    expect(layerMatches({ minScore: null, bands: [], signals: ['refusals'] }, risk)).toBe(true);
    expect(layerMatches({ minScore: null, bands: [], signals: [] }, { score: 100, band: 'high', fired: [...RISK_SIGNAL_KEYS] })).toBe(false);
    const layers = [L('b', 2, { minScore: 60, bands: [], signals: [] }), L('a', 1, { minScore: 90, bands: [], signals: [] }), L('off', 0, { minScore: 1, bands: [], signals: [] }, false)];
    expect(layerFor(layers, risk)?.id).toBe('b');
    expect(layerFor(layers, { ...risk, score: 95 })?.id).toBe('a');
    expect(layerFor(layers, { ...risk, score: 10 })).toBeNull();
  });
});

describe.skipIf(!HAS_TEST_DB)('PR 558 · the Parameter for Checkout panel (PostgreSQL)', () => {
  let f: OrdersFixture;
  const d = () => {
    const base = f.ordersDeps();
    return { ...base, settings: { value: base.settings.value.bind(base.settings), set: async (k: Key, v: unknown) => void f.overrides.set(k, v) } } as OrdersDeps & { settings: OrdersDeps['settings'] & { set: (k: Key, v: unknown) => Promise<void> } };
  };

  beforeAll(async () => {
    f = await setUpOrders('checkout_layers');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('ships off and empty, with the owner bands and every signal with words in both languages', async () => {
    const p = await checkoutLayers(d(), f.staff);
    expect(registry['checkout.advance'].default).toEqual({ enabled: false, maxLayers: 5 });
    expect(p).toMatchObject({ enabled: false, maxLayers: 5, layers: [], maxLayersChoices: [3, 5, 10] });
    expect(p.bands.map((b) => b.key)).toEqual(registry['risk.bands'].default.map((b) => b.key));
    expect(p.signals.map((s) => s.key)).toEqual(RISK_SIGNAL_KEYS);
    for (const s of p.signals) expect(s.label.en && s.label.bn, s.key).toBeTruthy();
    expect(p.version).toMatch(/^[0-9a-f]{16}$/);
  });

  it('saves the whole panel: adds, re-orders, changes; one left out is archived, never deleted; audited', async () => {
    const p0 = await checkoutLayers(d(), f.staff);
    const p1 = await saveCheckoutLayers(d(), f.staff, {
      version: p0.version,
      enabled: false,
      layers: [layer({ name: 'Very high', conditions: { minScore: 85, bands: [], signals: [] }, requirement: 'FULL_AMOUNT' }), layer(), layer({ name: 'Refused before', conditions: { minScore: null, bands: [], signals: ['refusals'] }, requirement: 'PART_AMOUNT', partPercent: 30 })],
    });
    expect(p1.layers.map((l) => [l.name, l.position, l.requirement, l.partPercent])).toEqual([
      ['Very high', 1, 'FULL_AMOUNT', null],
      ['High risk', 2, 'DELIVERY_CHARGE', null],
      ['Refused before', 3, 'PART_AMOUNT', 30],
    ]);
    // the last one up, the first one left out, the middle one changed
    const [first, mid, last] = p1.layers;
    const p2 = await saveCheckoutLayers(d(), f.staff, {
      version: p1.version,
      enabled: false,
      layers: [
        { ...last!, id: last!.id },
        { ...mid!, id: mid!.id, conditions: { minScore: null, bands: ['high'], signals: [] }, partPercent: 50 },
      ].map(({ position: _p, ...x }) => x),
    });
    expect(p2.layers.map((l) => [l.name, l.position, l.conditions.bands, l.partPercent])).toEqual([
      ['Refused before', 1, [], 30],
      ['High risk', 2, ['high'], null],
    ]);
    const archived = await f.t.prisma.checkoutParameterLayer.findUnique({ where: { id: first!.id } });
    expect(archived).toMatchObject({ name: 'Very high', enabled: false });
    expect(archived?.archivedAt).toBeInstanceOf(Date);
    expect(await f.t.prisma.auditLog.count({ where: { action: 'checkout.advance.save' } })).toBe(2);
    // the same panel again changes nothing and logs nothing
    await saveCheckoutLayers(d(), f.staff, { version: p2.version, enabled: false, layers: p2.layers.map(({ position: _p, ...x }) => x) });
    expect(await f.t.prisma.auditLog.count({ where: { action: 'checkout.advance.save' } })).toBe(2);
  });

  it('switching it on asks first; the switch and the most layers are its one setting', async () => {
    const p = await checkoutLayers(d(), f.staff);
    const body = { version: p.version, enabled: true, layers: p.layers.map(({ position: _p, ...x }) => x) };
    expect(await code(saveCheckoutLayers(d(), f.staff, body))).toBe('INVALID_INPUT');
    expect(f.overrides.get('checkout.advance')).toBeUndefined();
    const on = await saveCheckoutLayers(d(), f.staff, { ...body, confirm: true, reason: 'test', maxLayers: 3 });
    expect(on).toMatchObject({ enabled: true, maxLayers: 3 });
    expect(f.overrides.get('checkout.advance')).toEqual({ enabled: true, maxLayers: 3 });
    // already on: no question asked again; switching off needs none
    const off = await saveCheckoutLayers(d(), f.staff, { version: on.version, enabled: false, layers: body.layers });
    expect(off.enabled).toBe(false);
  });

  it('refused: a layer with no condition, a part with no percentage, an unknown band, too many layers, a stale panel, an unknown layer, a reader', async () => {
    const p = await checkoutLayers(d(), f.staff);
    const keep = p.layers.map(({ position: _p, ...x }) => x);
    const save = (layers: unknown[], extra: Record<string, unknown> = {}) => saveCheckoutLayers(d(), f.staff, { version: p.version, enabled: false, layers, ...extra });
    expect(await code(save([layer({ conditions: { minScore: null, bands: [], signals: [] } })]))).toBe('INVALID_INPUT');
    expect(await code(save([layer({ requirement: 'PART_AMOUNT', partPercent: null })]))).toBe('INVALID_INPUT');
    expect(await code(save([layer({ requirement: 'PART_AMOUNT', partPercent: 100 })]))).toBe('INVALID_INPUT');
    expect(await code(save([layer({ conditions: { minScore: null, bands: ['everyone'], signals: [] } })]))).toBe('INVALID_INPUT');
    expect(await code(save([layer(), layer(), layer(), layer()]))).toBe('INVALID_INPUT');
    expect(await code(save(keep, { maxLayers: 7 }))).toBe('INVALID_INPUT');
    expect(await code(saveCheckoutLayers(d(), f.staff, { version: '0000000000000000', enabled: false, layers: keep }))).toBe('STALE');
    expect(await code(save([{ ...layer(), id: '00000000-0000-4000-8000-000000000000' }]))).toBe('NOT_FOUND');
    expect((await checkoutLayers(d(), f.staff)).version).toBe(p.version);
    expect(await code(checkoutLayers(d(), f.reader))).toBe('FORBIDDEN');
    expect(await code(saveCheckoutLayers(d(), f.reader, { enabled: false, layers: [] }))).toBe('FORBIDDEN');
  });
});
