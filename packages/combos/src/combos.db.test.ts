// S03 on a real PostgreSQL (a throwaway database with the real migrations and the sample catalogue; skipped without
// TEST_DATABASE_ADMIN_URL). Every value is a made-up test value; the sample store's products and stock come from the
// sample catalogue seed (PR 14).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor, type PermissionKey } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '@extas/auth/testing';
import { seedSample } from '@extas/seed';
import { registry, type Key, type Value } from '@extas/settings';
import { createCombo, getCombo, listCombos, setComboActive, setComboFlags, setComboPrice, updateCombo } from './combos-service';
import type { CombosDeps, SettingsReader, Who } from './context';
import { seedSampleCombos } from './sample';

export async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

const T0 = new Date('2026-10-20T06:00:00Z');

describe.skipIf(!HAS_TEST_DB)('combos on PostgreSQL (S03)', () => {
  let t: TestDatabase;
  let S = 0;
  let B = 0;
  let clock = T0;
  const overrides = new Map<string, unknown>();
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const deps = (): CombosDeps => ({ db: t.prisma, settings, now: () => clock });
  const actors: Record<string, Actor> = {};
  const as = (name: string, storeId = S): Who => ({ actor: actors[name]!, storeId });
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestDatabase('combos');
    S = (await seedSample(t.prisma)).storeId;
    B = (await t.prisma.store.create({ data: { slug: 'other', name: 'Other sample store', defaultLocale: 'en-GB', currency: 'BDT', timezone: 'Asia/Dhaka' } })).id;
    await syncAuth(t.prisma);
    const staff = async (name: string, perms: PermissionKey[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key: `test-${name}`, nameEn: name, nameBn: name, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${name}@example.com`, displayName: name, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      actors[name] = { staffUserId: u.id };
    };
    await staff('reader', ['combos.read']);
    await staff('writer', ['combos.read', 'combos.write']);
    await staff('publisher', ['combos.read', 'combos.write', 'combos.publish']);
    await staff('owner', ['combos.read', 'combos.write', 'combos.publish', 'combos.prices']);
    const products = await t.prisma.product.findMany({ where: { storeId: S }, select: { id: true, slug: true, colours: { select: { colourId: true, colour: { select: { key: true } } } } } });
    for (const p of products) {
      ids[p.slug] = p.id;
      for (const c of p.colours) ids[`${p.slug}/${c.colour.key}`] = c.colourId;
    }
  });

  afterAll(async () => {
    await t?.drop();
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('PR 89 · the combo model', () => {
    const input = () => ({
      slug: 'test-polo-pair',
      nameEn: 'Test polo pair',
      type: 'COLOUR_PAIR' as const,
      items: [{ productId: ids['essential-pique-polo']!, quantity: 2 }],
      setPriceMinor: null as number | null,
    });

    it('permissions: reading needs combos.read, writing combos.write, a price combos.prices', async () => {
      expect(await code(listCombos(deps(), as('reader', B)))).toBe('FORBIDDEN');
      expect(await code(createCombo(deps(), as('reader'), input()))).toBe('FORBIDDEN');
      expect(await code(createCombo(deps(), as('publisher'), { ...input(), setPriceMinor: 150000 }))).toBe('OWNER_OK_REQUIRED');
    });

    it('a new combo is a draft; its regular total is the sum of the real prices', async () => {
      const c = await createCombo(deps(), as('writer'), input());
      ids.pair = c.id;
      expect(c).toMatchObject({ status: 'DRAFT', state: 'draft', pieceCount: 2, oneProduct: true, setPriceMinor: null });
      expect(c.pricing).toMatchObject({ regularMinor: 170000, payMinor: null, reason: 'NO_SET_PRICE' });
      expect(c.blocking).toEqual(['NO_SET_PRICE']);
      expect(await code(createCombo(deps(), as('writer'), input()))).toBe('SLUG_TAKEN');
    });

    it('cannot go on sale without a set price; the owner sets it; a price at or above the regular is no offer', async () => {
      expect(await code(setComboActive(deps(), as('publisher'), ids.pair!, true))).toBe('NOT_READY');
      expect(await code(setComboPrice(deps(), as('publisher'), ids.pair!, 150000))).toBe('OWNER_OK_REQUIRED');
      const high = await setComboPrice(deps(), as('owner'), ids.pair!, 180000);
      expect(high.pricing).toMatchObject({ payMinor: 170000, savingMinor: 0, offer: false, reason: 'NOT_LOWER' });
      const ok = await setComboPrice(deps(), as('owner'), ids.pair!, 150000);
      expect(ok.pricing).toMatchObject({ payMinor: 150000, savingMinor: 20000, savingPercent: 11, offer: true });
      const on = await setComboActive(deps(), as('publisher'), ids.pair!, true);
      expect(on.state).toBe('live');
    });

    it('editing: version check, a changed price needs the owner, removed slots are archived (never deleted)', async () => {
      const c = await getCombo(deps(), as('writer'), ids.pair!);
      expect(await code(updateCombo(deps(), as('writer'), ids.pair!, { ...input(), setPriceMinor: 140000 }, c.version))).toBe('OWNER_OK_REQUIRED');
      expect(await code(updateCombo(deps(), as('writer'), ids.pair!, { ...input(), setPriceMinor: 150000 }, c.version - 1))).toBe('STALE');
      const next = await updateCombo(deps(), as('writer'), ids.pair!, { ...input(), setPriceMinor: 150000, items: [{ productId: ids['essential-pique-polo']!, quantity: 3 }] }, c.version);
      expect(next.pieceCount).toBe(3);
      const rows = await t.prisma.comboItem.findMany({ where: { comboId: ids.pair! } });
      expect(rows).toHaveLength(2);
      expect(rows.filter((r) => r.archivedAt)).toHaveLength(1);
      await updateCombo(deps(), as('writer'), ids.pair!, { ...input(), setPriceMinor: 150000 }, next.version);
    });

    it('a slot must be the store’s own product, colour and size', async () => {
      expect(await code(createCombo(deps(), as('writer'), { ...input(), slug: 'test-bad', items: [{ productId: ids['essential-pique-polo']!, colourIds: [ids['heavy-cotton-tee/ecru']!], quantity: 2 }] }))).toBe('INVALID_INPUT');
      const other = await t.prisma.product.create({ data: { storeId: B, slug: 'other-polo', nameEn: 'Other polo' } });
      expect(await code(createCombo(deps(), as('writer'), { ...input(), slug: 'test-bad-2', items: [{ productId: other.id, quantity: 2 }] }))).toBe('INVALID_INPUT');
    });

    it('switches: auto-apply and same colour (K11); off moves it to the archive, on again keeps the link', async () => {
      const f = await setComboFlags(deps(), as('writer'), ids.pair!, { autoApply: true, sameColour: true });
      expect(f).toMatchObject({ autoApply: true, sameColour: true });
      const off = await setComboActive(deps(), as('publisher'), ids.pair!, false);
      expect(off.state).toBe('off');
      const back = await setComboActive(deps(), as('publisher'), ids.pair!, true);
      expect(back).toMatchObject({ state: 'live', slug: 'test-polo-pair' });
      expect(await t.prisma.auditLog.count({ where: { entityType: 'Combo', entityId: ids.pair! } })).toBeGreaterThanOrEqual(6);
    });

    it('an end date that passed ends it; turning it on again clears the past end', async () => {
      const c = await getCombo(deps(), as('writer'), ids.pair!);
      await updateCombo(deps(), as('writer'), ids.pair!, { ...input(), setPriceMinor: 150000, endsOn: '2026-10-21' }, c.version);
      clock = new Date('2026-10-22T06:00:00Z');
      expect((await getCombo(deps(), as('reader'), ids.pair!)).state).toBe('ended');
      const back = await setComboActive(deps(), as('publisher'), ids.pair!, true);
      expect(back).toMatchObject({ state: 'live', endsOn: null });
      clock = T0;
    });

    it('the sample combos go only to the sample store, once', async () => {
      const first = await seedSampleCombos(deps());
      expect(first).toEqual({ storeId: S, combos: 3 });
      expect((await seedSampleCombos(deps())).combos).toBe(0);
      const list = await listCombos(deps(), as('reader'));
      const set = list.find((c) => c.slug === 'sample-polo-chino-set')!;
      expect(set).toMatchObject({ state: 'live', autoApply: true });
      expect(set.pricing.offer).toBe(true);
    });
  });
});
