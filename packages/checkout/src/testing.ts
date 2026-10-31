// The PostgreSQL tests' shared set-up (never imported by app code): a throwaway database with the real migrations, the
// sample catalogue and store (its default pack brings the three delivery bands, switched off with no charge), the
// permission catalogue, the sample Smart Rules (drafts, switched on per test), the SAMPLE gazetteer, a visitor's bag with sample items, and a settings reader on the
// registry's defaults with per-test overrides. Every value is a made-up test value.
import { createRole, SYSTEM, syncAuth, type Actor } from '@extas/auth';
import { createTestDatabase, type TestDatabase } from '@extas/auth/testing';
import { addItem, openBag, type CartDeps } from '@extas/cart';
import { productFacts, type ProductFact } from '@extas/combos';
import { forgetGazetteer, importGazetteer } from '@extas/delivery';
import { sampleGazetteerRows } from '@extas/delivery/sample';
import { bustAll, createCoupon, createRule, getRule, publishRule, saveDraft, setCouponEnabled } from '@extas/rules';
import { seedSampleRules } from '@extas/rules/sample';
import { seedSample } from '@extas/seed';
import { registry, type Key, type Value } from '@extas/settings';
import type { CheckoutDeps, SettingsReader } from './context';

export interface CheckoutFixture {
  t: TestDatabase;
  S: number;
  overrides: Map<string, unknown>;
  clock: { now: Date };
  deps: () => CheckoutDeps & CartDeps;
  products: Record<string, ProductFact>;
  /** A variant of a sample product by colour key and size label. */
  variant: (slug: string, colour: string | null, size: string) => ProductFact['variants'][number];
  /** A new visitor's bag with the given variants (one piece each unless a quantity is given). */
  bag: (name: string, lines: { variantId: string; quantity?: number }[]) => Promise<{ cartId: string; visitorId: string }>;
  /** Switches a delivery band on with the owner's charge (as in the delivery admin). */
  priceBand: (key: string, chargeMinor: number, hours?: [number, number]) => Promise<string>;
  /** Switches a sample Smart Rule on (the owner's OK, as in the admin); `off` takes it back. */
  switchRule: (key: string, on?: boolean) => Promise<void>;
  /** A live coupon rule taking `amountOffMinor` off, and its code switched on with these limits (as in the admin). */
  coupon: (code: string, amountOffMinor: number, limits?: { usageLimit?: number; perCustomerLimit?: number }) => Promise<void>;
}

export async function setUpCheckout(label: string): Promise<CheckoutFixture> {
  const t = await createTestDatabase(label);
  const S = (await seedSample(t.prisma)).storeId;
  await syncAuth(t.prisma);
  await importGazetteer(t.prisma, sampleGazetteerRows(), { source: 'sample' });
  forgetGazetteer();
  const overrides = new Map<string, unknown>([['rules.public.cacheSeconds', 0]]);
  // as on the staging host and CI's sample store: the practice gateway answers (test payments ship off, review R1 B1)
  const baseline = new Map<string, unknown>([['payments.testPayments', true]]);
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : baseline.has(key) ? baseline.get(key) : registry[key].default) as Value<K>;
    },
  };
  const clock = { now: new Date('2026-10-23T06:00:00Z') };
  const deps = () => ({ db: t.prisma, settings, now: () => clock.now });
  const role = await createRole(t.prisma, SYSTEM, { key: 'test-owner', nameEn: 'owner', nameBn: 'owner', permissions: ['rules.read', 'rules.write', 'rules.publish', 'rules.approve'] });
  const u = await t.prisma.staffUser.create({ data: { email: 'owner@example.com', displayName: 'owner', passwordHash: 'not-a-login' } });
  await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
  const owner: Actor = { staffUserId: u.id };
  await seedSampleRules(deps());
  const products: Record<string, ProductFact> = {};
  const ids = (await t.prisma.product.findMany({ where: { storeId: S }, select: { id: true } })).map((p) => p.id);
  for (const p of (await productFacts(deps(), S, ids)).values()) products[p.slug] = p;
  return {
    t,
    S,
    overrides,
    clock,
    deps,
    products,
    variant(slug, colour, size) {
      const p = products[slug]!;
      const c = colour ? p.colours.find((x) => x.key === colour)!.id : null;
      const s = p.sizes.find((x) => x.label === size)!.id;
      return p.variants.find((v) => v.colourId === c && v.sizeId === s)!;
    },
    async bag(name, lines) {
      const visitorId = `test-visitor-${name}-0000000000`;
      const { cartId } = await openBag(deps(), { storeId: S, visitorId });
      for (const l of lines) {
        const r = await addItem(deps(), { storeId: S, cartId, variantId: l.variantId });
        if (l.quantity && l.quantity > 1) await t.prisma.cartItem.update({ where: { id: r.lineId }, data: { quantity: l.quantity } });
        clock.now = new Date(clock.now.getTime() + 2_000);
      }
      return { cartId, visitorId };
    },
    async priceBand(key, chargeMinor, hours = [24, 48]) {
      const b = await t.prisma.deliveryBand.update({ where: { storeId_key: { storeId: S, key } }, data: { enabled: true, chargeMinor, hoursMin: hours[0], hoursMax: hours[1] } });
      return b.id;
    },
    async switchRule(key, on = true) {
      const row = await t.prisma.smartRule.findFirstOrThrow({ where: { storeId: S, key }, select: { id: true } });
      const who = { actor: owner, storeId: S };
      const r = await getRule(deps(), who, row.id);
      await saveDraft(deps(), who, r.id, { content: { ...(r.draft ?? r.live)!, status: on ? 'ACTIVE' : 'PAUSED' } });
      await publishRule(deps(), who, r.id);
      bustAll();
    },
    async coupon(code, amountOffMinor, limits = {}) {
      const who = { actor: owner, storeId: S };
      const rule = await createRule(deps(), who, { templateId: 'coupon', key: `test-${code.toLowerCase()}` });
      const live = rule.live!;
      const content = { ...live, status: 'ACTIVE' as const, params: live.params.map((p) => (p.key === 'amountOff' ? { ...p, value: amountOffMinor } : p.key === 'minOrder' ? { ...p, value: 100 } : p)) };
      await saveDraft(deps(), who, rule.id, { content });
      await publishRule(deps(), who, rule.id);
      const c = await createCoupon(deps(), who, { code, ruleId: rule.id, ...limits });
      await setCouponEnabled(deps(), who, c.id, { enabled: true });
      bustAll();
    },
  };
}
