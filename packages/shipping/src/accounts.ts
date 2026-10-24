// PR 175 — the store's courier accounts (CourierAccount; BACKEND-ARCHITECTURE §5.6 DLV-05). An account names which
// courier adapter it uses (`providerKey`: `mockCourier`, `steadfast`, `pathao` …) and is switched on or off; it is
// archived, never deleted (hard rule 3). Its mode is its connection's: Live or Sandbox once the owner's keys passed the
// Test in Keys & connections, else Mock — the courier's practice world, where nothing leaves the server. The courier
// for each parcel is chosen by staff when they book (PR 176); the cheapest-courier rule is PR 178.
import { z } from 'zod';
import { courierAdapters, type CourierApi, type Mode } from '@extas/adapters';
import type { Prisma } from '@extas/db/client';
import { allow, logChange, parse, TX, type Db, type ShippingDeps, type Who } from './context';
import { ShippingError } from './errors';

/** The courier adapters an account can use (each runs on its practice world until its keys are entered). */
export const courierProviders = (): string[] => courierAdapters.map((a) => a.provider);

export interface CourierAccountView {
  id: string;
  providerKey: string;
  name: string;
  enabled: boolean;
  archived: boolean;
  /** MOCK until the courier's keys are entered and tested; never "live" by assumption. */
  mode: Mode;
  createdAt: Date;
}

const SELECT = { id: true, providerKey: true, name: true, enabled: true, archivedAt: true, createdAt: true } as const;
type Row = Prisma.CourierAccountGetPayload<{ select: typeof SELECT }>;

/** The mode each provider's connection is in for this store (its own row first, then the installation's), else MOCK. */
export async function courierModes(db: Db, storeId: number): Promise<Map<string, Mode>> {
  const rows = await db.integration.findMany({ where: { kind: 'COURIER', enabled: true, archivedAt: null, OR: [{ storeId }, { storeId: null }] }, select: { provider: true, mode: true, storeId: true }, orderBy: { updatedAt: 'desc' } });
  const out = new Map<string, Mode>();
  for (const r of [...rows].sort((a, b) => (a.storeId === null ? 1 : 0) - (b.storeId === null ? 1 : 0))) if (!out.has(r.provider)) out.set(r.provider, r.mode);
  return out;
}

const view = (r: Row, modes: Map<string, Mode>): CourierAccountView => ({
  id: r.id,
  providerKey: r.providerKey,
  name: r.name,
  enabled: r.enabled,
  archived: r.archivedAt !== null,
  mode: modes.get(r.providerKey) ?? 'MOCK',
  createdAt: r.createdAt,
});

/** The store's courier accounts with each one's mode (DLV-05). */
export async function listCouriers(deps: ShippingDeps, who: Who, opts: { includeArchived?: boolean } = {}): Promise<{ couriers: CourierAccountView[]; providers: string[] }> {
  await allow(deps, who, 'delivery.read');
  const [rows, modes] = await Promise.all([
    deps.db.courierAccount.findMany({ where: { storeId: who.storeId, ...(opts.includeArchived ? {} : { archivedAt: null }) }, select: SELECT, orderBy: { createdAt: 'asc' } }),
    courierModes(deps.db, who.storeId),
  ]);
  return { couriers: rows.map((r) => view(r, modes)), providers: courierProviders() };
}

/** A courier account usable for booking: in this store, switched on, not archived. */
export async function bookableCourier(db: Db, storeId: number, id: string): Promise<Row> {
  const r = await db.courierAccount.findFirst({ where: { id, storeId }, select: SELECT });
  if (!r) throw new ShippingError('NOT_FOUND', 'no such courier account', ['courierAccountId']);
  if (!r.enabled || r.archivedAt) throw new ShippingError('COURIER_OFF', 'this courier account is switched off', ['courierAccountId']);
  return r;
}

/** The courier's adapter for this store, in the mode its connection is in (the practice world when not keyed). */
export async function courierApi(deps: Pick<ShippingDeps, 'connections'>, storeId: number, providerKey: string): Promise<{ api: CourierApi; mode: Mode }> {
  const c = await deps.connections.use<CourierApi>('COURIER', { storeId, provider: providerKey });
  return { api: c.api, mode: c.mode };
}

const nameSchema = z.string().trim().min(1).max(60);
export const addCourierInput = z.object({ providerKey: z.string().trim().min(1).max(40), name: nameSchema }).strict();
export const updateCourierInput = z
  .object({ name: nameSchema.optional(), enabled: z.boolean().optional(), archived: z.boolean().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'nothing to change' });

/** Adds a courier account (switched on). The provider must be a courier adapter of the shop. */
export async function addCourier(deps: ShippingDeps, who: Who, input: unknown): Promise<CourierAccountView> {
  await allow(deps, who, 'delivery.couriers');
  const v = parse(addCourierInput, input, 'courier account');
  if (!courierProviders().includes(v.providerKey)) throw new ShippingError('UNKNOWN_PROVIDER', 'no courier adapter has this key', ['providerKey'], { providers: courierProviders() });
  return deps.db.$transaction(async (tx) => {
    const same = await tx.courierAccount.findFirst({ where: { storeId: who.storeId, providerKey: v.providerKey, name: v.name }, select: { id: true } });
    if (same) throw new ShippingError('DUPLICATE', 'a courier account with this name exists', ['name'], { id: same.id });
    const r = await tx.courierAccount.create({ data: { storeId: who.storeId, providerKey: v.providerKey, name: v.name, enabled: true }, select: SELECT });
    await logChange(tx, who, 'courier.add', 'CourierAccount', r.id, null, { providerKey: r.providerKey, name: r.name, enabled: true });
    return view(r, await courierModes(tx, who.storeId));
  }, TX);
}

/** Renames, switches on or off, archives or brings back a courier account (never deletes it). */
export async function updateCourier(deps: ShippingDeps, who: Who, id: string, input: unknown): Promise<CourierAccountView> {
  await allow(deps, who, 'delivery.couriers');
  const v = parse(updateCourierInput, input, 'courier change');
  return deps.db.$transaction(async (tx) => {
    const before = await tx.courierAccount.findFirst({ where: { id, storeId: who.storeId }, select: SELECT });
    if (!before) throw new ShippingError('NOT_FOUND', 'no such courier account', ['courierAccountId']);
    if (v.name && v.name !== before.name) {
      const same = await tx.courierAccount.findFirst({ where: { storeId: who.storeId, providerKey: before.providerKey, name: v.name, id: { not: id } }, select: { id: true } });
      if (same) throw new ShippingError('DUPLICATE', 'a courier account with this name exists', ['name'], { id: same.id });
    }
    const data: Prisma.CourierAccountUpdateInput = {};
    if (v.name !== undefined) data.name = v.name;
    if (v.enabled !== undefined) data.enabled = v.enabled;
    if (v.archived !== undefined) {
      data.archivedAt = v.archived ? (before.archivedAt ?? new Date()) : null;
      // an archived account is never used for booking
      if (v.archived) data.enabled = false;
    }
    const r = await tx.courierAccount.update({ where: { id }, data, select: SELECT });
    await logChange(tx, who, 'courier.update', 'CourierAccount', id, { name: before.name, enabled: before.enabled, archived: before.archivedAt !== null }, { name: r.name, enabled: r.enabled, archived: r.archivedAt !== null });
    return view(r, await courierModes(tx, who.storeId));
  }, TX);
}
