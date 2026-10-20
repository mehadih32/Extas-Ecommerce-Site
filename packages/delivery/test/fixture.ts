// The PostgreSQL tests' shared set-up: a throwaway database with the real migrations, the two sample stores, the
// permission catalogue, the SAMPLE gazetteer imported, the default pack's three bands for store A (switched off, no
// charge — as PR 508 ships them) and a settings reader on the registry's defaults with per-test overrides.
import { createRole, SYSTEM, syncAuth, type Actor, type PermissionKey } from '@extas/auth';
import { createTestDatabase, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { forgetGazetteer, importGazetteer, type DeliveryDeps, type SettingsReader } from '../src';
import { sampleGazetteerRows } from '../src/sample';

export interface Fixture {
  t: TestDatabase;
  A: number;
  B: number;
  overrides: Map<string, unknown>;
  deps: () => DeliveryDeps;
  staff: (email: string, perms: PermissionKey[], storeId: number | null) => Promise<Actor>;
  /** GeoArea id of a sample place by its code. */
  area: (code: string) => Promise<string>;
  /** DeliveryBand id of store A's band by key. */
  band: (key: string, storeId?: number) => Promise<string>;
}

export const BAND_KEYS = ['dhaka-city', 'dhaka-sub-area', 'outside-dhaka'] as const;

export async function setUp(label: string): Promise<Fixture> {
  const t = await createTestDatabase(label);
  const [A, B] = await seedSampleStores(t.prisma);
  await syncAuth(t.prisma);
  await importGazetteer(t.prisma, sampleGazetteerRows(), { source: 'sample' });
  forgetGazetteer();
  for (const [i, key] of BAND_KEYS.entries()) {
    await t.prisma.deliveryBand.create({ data: { storeId: A, key, nameEn: key, chargeMinor: 0, enabled: false, sortOrder: (i + 1) * 10 } });
  }
  const overrides = new Map<string, unknown>();
  const settings: SettingsReader = {
    async value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>> {
      const sk = `${key}@${opts?.storeId ?? '-'}`;
      if (overrides.has(sk)) return overrides.get(sk) as Value<K>;
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const ids = new Map<string, string>();
  return {
    t,
    A,
    B,
    overrides,
    deps: () => ({ db: t.prisma, settings }),
    async staff(email, perms, storeId) {
      const role = await createRole(t.prisma, SYSTEM, { key: email.split('@')[0]!, nameEn: email, nameBn: email, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email, displayName: email, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId } });
      return { staffUserId: u.id };
    },
    async area(code) {
      const hit = ids.get(code);
      if (hit) return hit;
      const row = await t.prisma.geoArea.findUniqueOrThrow({ where: { code }, select: { id: true } });
      ids.set(code, row.id);
      return row.id;
    },
    async band(key, storeId = A) {
      return (await t.prisma.deliveryBand.findUniqueOrThrow({ where: { storeId_key: { storeId, key } }, select: { id: true } })).id;
    },
  };
}

export async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

export { SYSTEM };
