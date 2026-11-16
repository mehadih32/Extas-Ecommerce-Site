// PR 1010 (admin prototype v5 m-settings.js `renderCouriers`) — Settings › Couriers: the data of the page and every change it makes.
//   courier accounts   each with its status (Connected = switched on), its charge per delivery band and cash fee (from its open rate cards,
//                      lib/admin-courier-settings/pure.ts), its parcels in 30 days and the share that came back
//   Fees               a new charge per band and cash fee: the old rate cards are ended, new ones added from now (never edited or deleted)
//   Connect/Disconnect the account is switched on or off (never deleted); the default courier cannot be disconnected
//   default courier    one of the connected couriers (a switched-off one is refused: "Make default stays blocked on a disabled courier")
//   Different courier by area   `delivery.courier.selection.enabled` (the courier chosen by the parcel's real cost per band)
//   Pickup from / Daily pickup time   `delivery.courier.pickup`
//   Auto-booking       `delivery.courier.autoBook` (off as shipped; runs in the name of the person who switched it on)
// Reading needs `delivery.read`; each change checks its own permission here again (fees `costs.write`, the rest `delivery.charges`,
// Connect/Disconnect `delivery.couriers`, auto-booking also `delivery.book`). Every change is audited. Nothing here reaches a customer.
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import * as sh from '@extas/shipping';
import { PICKUP_FROM, storeTarget, type PickupFrom } from '@extas/settings';
import type { AppResolver } from '../settings';
import { FEE_ZONES, feesOf, pctToBps, planFees, returnedPct, type Fees, type OpenCard, type ZoneKeys } from './pure';

const S = MOTHER_STORE_ID;
const DAY = 86_400_000;
/** Parcels and returns are counted over this many days (the prototype's "30 days"). */
/** `readyToBook` is asked for its total only: the smallest page. */
const COUNT_ONLY = Number('1');
export const WINDOW_DAYS = 30; // hardcode-ok: the prototype's fixed 30-day window, the same as Courier 360
/** The rate card's own upper limit of a weight band: a band with no card yet is made for the whole range. */
const WHOLE_RANGE_GRAMS = 1_000_000; // hardcode-ok: the rate card schema's own maximum
/** The largest cash fee a card holds (2 000 basis points, as Money › Costs & fees). */
export const MAX_COD_PCT = 20; // hardcode-ok: the rate card's own limit (codFeeBps ≤ 2000)

export interface CourierSettingsDeps {
  db: PrismaClient;
  resolver: AppResolver;
  shipping: sh.ShippingDeps;
}
export interface CourierSettingsWho {
  actor: Actor;
  ctx: RequestContext;
}

export class CourierSettingsError extends Error {
  constructor(
    public status: number,
    public code: string,
    public details: string[] = [],
  ) {
    super(code);
  }
}

export interface CourierRow {
  id: string;
  name: string;
  provider: string;
  /** Switched on = "Connected". */
  connected: boolean;
  /** The courier's keys have not passed the Test yet: it runs on its practice world. */
  practice: boolean;
  parcels30: number;
  returnedPct: number | null;
  fees: Fees;
  isDefault: boolean;
}

export interface CourierSettingsView {
  couriers: CourierRow[];
  defaultId: string;
  routing: boolean;
  pickup: { from: PickupFrom; time: string };
  autoBook: boolean;
  /** Packed orders waiting for a courier right now. */
  waiting: number;
  /** The two addresses of Settings › Store details, as text ('' when not typed yet). */
  addresses: { warehouse: string; office: string };
  currency: string;
  maxCodPct: number;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const pairText = (v: unknown, lang = 'en'): string => {
  if (!v || typeof v !== 'object') return '';
  const o = v as Record<string, unknown>;
  return text(o[lang]) || text(o.en) || text(o.bn);
};

async function zoneKeysOf(r: Pick<AppResolver, 'value'>): Promise<ZoneKeys> {
  const [inside, sub, outside] = await Promise.all([r.value('delivery.bands.cityKey', { storeId: S }), r.value('delivery.bands.subAreaKey', { storeId: S }), r.value('delivery.bands.outsideKey', { storeId: S })]);
  return { inside: inside as string, sub: sub as string, outside: outside as string };
}

/** The page's data (`delivery.read`). `lang`: the language of the address texts that have both. */
export async function courierSettingsView(deps: CourierSettingsDeps, who: CourierSettingsWho, lang: string, now = new Date()): Promise<CourierSettingsView> {
  await requirePermission(deps.db, who.actor, 'delivery.read', { storeId: S });
  const w: sh.Who = { actor: who.actor, storeId: S, ctx: who.ctx };
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY);
  const [overview, keys, cards, parcels, pickup, autoBook, selection, office, details, currency, ready] = await Promise.all([
    sh.couriersOverview(deps.shipping, w),
    zoneKeysOf(deps.resolver),
    deps.db.courierRateCard.findMany({
      where: { storeId: S, OR: [{ validTo: null }, { validTo: { gt: now } }] },
      select: { id: true, courierAccountId: true, zoneKey: true, weightFromGrams: true, weightToGrams: true, chargeMinor: true, codFeeBps: true, returnChargeMinor: true },
    }),
    deps.db.shipment.groupBy({ by: ['courierAccountId'], where: { storeId: S, mode: { in: ['SANDBOX', 'LIVE'] }, bookedAt: { gte: since } }, _count: { _all: true } }),
    deps.resolver.value('delivery.courier.pickup', { storeId: S }),
    deps.resolver.value('delivery.courier.autoBook', { storeId: S }),
    deps.resolver.value('delivery.courier.selection', { storeId: S }),
    deps.resolver.value('contact.address', { storeId: S }),
    deps.resolver.value('store.details', { storeId: S }),
    deps.resolver.value('store.currency', { storeId: S }),
    sh.readyToBook(deps.shipping, w, { limit: COUNT_ONLY }),
  ]);
  const couriers = overview.cards.map((c): CourierRow => {
    const mine = cards.filter((x) => x.courierAccountId === c.id);
    return {
      id: c.id,
      name: c.name,
      provider: c.providerKey,
      connected: c.enabled,
      practice: c.mode === 'MOCK',
      parcels30: parcels.find((p) => p.courierAccountId === c.id)?._count._all ?? 0,
      returnedPct: returnedPct(c.last30.delivered, c.last30.returned),
      fees: feesOf(mine as OpenCard[], keys),
      isDefault: c.isDefault,
    };
  });
  const d = (details ?? {}) as Record<string, unknown>;
  return {
    couriers,
    defaultId: overview.defaultCourierId ?? '',
    routing: (selection as { enabled: boolean }).enabled,
    pickup: pickup as { from: PickupFrom; time: string },
    autoBook: (autoBook as { enabled: boolean }).enabled,
    waiting: ready.total,
    addresses: { warehouse: text(d.warehouseAddr), office: pairText(office, lang) },
    currency: currency as string,
    maxCodPct: MAX_COD_PCT,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const bad = (...details: string[]) => new CourierSettingsError(400, 'INVALID_INPUT', details);

async function account(deps: CourierSettingsDeps, id: unknown) {
  if (typeof id !== 'string') throw bad('courierId');
  const row = await deps.db.courierAccount.findFirst({ where: { id, storeId: S, archivedAt: null }, select: { id: true, name: true, enabled: true } });
  if (!row) throw new CourierSettingsError(404, 'NOT_FOUND', ['courierId']);
  return row;
}

/** Saves a new charge per band and cash fee for one courier (`costs.write`): old rate cards ended, new ones from now. */
export async function saveFees(deps: CourierSettingsDeps, who: CourierSettingsWho, input: unknown, now = new Date()): Promise<{ ended: number; added: number }> {
  await requirePermission(deps.db, who.actor, 'costs.write', { storeId: S });
  if (!isObj(input)) throw bad('body');
  const courier = await account(deps, input.courierId);
  const charge = {} as Record<(typeof FEE_ZONES)[number], number>;
  for (const z of FEE_ZONES) {
    const v = input[z];
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (!Number.isInteger(n) || n < 0 || n > 10_000_000) throw bad(z);
    charge[z] = n;
  }
  const codBps = pctToBps(input.codPct, MAX_COD_PCT);
  if (codBps === null) throw bad('codPct');
  const keys = await zoneKeysOf(deps.resolver);
  const open = await deps.db.courierRateCard.findMany({
    where: { storeId: S, courierAccountId: courier.id, OR: [{ validTo: null }, { validTo: { gt: now } }] },
    select: { id: true, zoneKey: true, weightFromGrams: true, weightToGrams: true, chargeMinor: true, codFeeBps: true, returnChargeMinor: true },
  });
  const plan = planFees(open, keys, { charge, codBps }, WHOLE_RANGE_GRAMS);
  if (plan.end.length || plan.add.length) {
    await deps.db.$transaction(async (tx) => {
      for (const id of plan.end) {
        await tx.courierRateCard.update({ where: { id }, data: { validTo: now } });
        await audit(tx as unknown as PrismaClient, who.actor, { storeId: S, action: 'costs.rateCard.end', entityType: 'CourierRateCard', entityId: id, before: null, after: { to: now.toISOString(), by: 'Settings › Couriers' } }, who.ctx);
      }
      for (const c of plan.add) {
        const row = await tx.courierRateCard.create({ data: { storeId: S, courierAccountId: courier.id, validFrom: now, ...c }, select: { id: true } });
        await audit(tx as unknown as PrismaClient, who.actor, { storeId: S, action: 'costs.rateCard.add', entityType: 'CourierRateCard', entityId: row.id, before: null, after: { ...c, by: 'Settings › Couriers' } }, who.ctx);
      }
    });
  }
  return { ended: plan.end.length, added: plan.add.length };
}

/** Switches a courier on (Connect) or off (Disconnect); never deletes it. The default courier cannot be disconnected. */
export async function setConnected(deps: CourierSettingsDeps, who: CourierSettingsWho, input: unknown): Promise<void> {
  if (!isObj(input) || typeof input.connected !== 'boolean') throw bad('connected');
  const courier = await account(deps, input.courierId);
  if (!input.connected) {
    const w: sh.Who = { actor: who.actor, storeId: S, ctx: who.ctx };
    const overview = await sh.couriersOverview(deps.shipping, w);
    if (overview.defaultCourierId === courier.id) throw new CourierSettingsError(409, 'IS_DEFAULT', [courier.id]);
  }
  await sh.updateCourier(deps.shipping, { actor: who.actor, storeId: S, ctx: who.ctx }, courier.id, { enabled: input.connected });
}

/** "Save" on the Default courier card: the default courier (a connected one) and where and when it picks up (`delivery.charges`). */
export async function saveDefault(deps: CourierSettingsDeps, who: CourierSettingsWho, input: unknown): Promise<void> {
  await requirePermission(deps.db, who.actor, 'delivery.charges', { storeId: S });
  if (!isObj(input)) throw bad('body');
  const courier = await account(deps, input.courierId);
  if (!courier.enabled) throw new CourierSettingsError(409, 'NOT_CONNECTED', [courier.id]);
  const from = input.from;
  if (typeof from !== 'string' || !(PICKUP_FROM as readonly string[]).includes(from)) throw bad('from');
  const time = text(input.time);
  const setBy = { actorId: who.actor.staffUserId ?? null, reason: 'Settings › Couriers › Default courier' };
  const beforeDefault = await deps.resolver.value('delivery.couriers', { storeId: S });
  const beforePickup = await deps.resolver.value('delivery.courier.pickup', { storeId: S });
  try {
    await deps.resolver.set('delivery.couriers', { defaultCourierId: courier.id }, storeTarget(S), setBy);
    await deps.resolver.set('delivery.courier.pickup', { from: from as PickupFrom, time }, storeTarget(S), setBy);
  } catch {
    throw bad('time');
  }
  await audit(deps.db, who.actor, { storeId: S, action: 'delivery.couriers.defaultAndPickup', entityType: 'Setting', entityId: 'delivery.couriers', before: { default: beforeDefault, pickup: beforePickup }, after: { default: { defaultCourierId: courier.id }, pickup: { from, time } } }, who.ctx);
}

/** "Different courier by area": the courier chosen by the parcel's real cost per band (`delivery.charges`). */
export async function setRouting(deps: CourierSettingsDeps, who: CourierSettingsWho, input: unknown): Promise<void> {
  await requirePermission(deps.db, who.actor, 'delivery.charges', { storeId: S });
  if (!isObj(input) || typeof input.enabled !== 'boolean') throw bad('enabled');
  const before = await deps.resolver.value('delivery.courier.selection', { storeId: S });
  if (before.enabled === input.enabled) return;
  await deps.resolver.set('delivery.courier.selection', { ...before, enabled: input.enabled }, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Settings › Couriers › Different courier by area' });
  await audit(deps.db, who.actor, { storeId: S, action: 'delivery.courier.selection.save', entityType: 'Setting', entityId: 'delivery.courier.selection', before, after: { ...before, enabled: input.enabled } }, who.ctx);
}

/** "Auto-booking" (`delivery.charges`; the person switching it on must also be allowed to book: it runs in their name). */
export async function setAutoBook(deps: CourierSettingsDeps, who: CourierSettingsWho, input: unknown): Promise<void> {
  await requirePermission(deps.db, who.actor, 'delivery.charges', { storeId: S });
  if (!isObj(input) || typeof input.enabled !== 'boolean') throw bad('enabled');
  if (input.enabled) {
    if (!who.actor.staffUserId) throw new CourierSettingsError(403, 'FORBIDDEN', ['person']);
    await requirePermission(deps.db, who.actor, 'delivery.book', { storeId: S });
  }
  const before = await deps.resolver.value('delivery.courier.autoBook', { storeId: S });
  const next = { ...before, enabled: input.enabled, byStaffId: input.enabled ? (who.actor.staffUserId as string) : '' };
  await deps.resolver.set('delivery.courier.autoBook', next, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Settings › Couriers › Auto-booking' });
  await audit(deps.db, who.actor, { storeId: S, action: 'delivery.courier.autoBook.save', entityType: 'Setting', entityId: 'delivery.courier.autoBook', before, after: next }, who.ctx);
}
