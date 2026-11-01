// S16 · PR 345 (BACKEND-ARCHITECTURE §5 MNY-06) — Money → Costs & fees (`/admin/money/fees`): the owner's own cost inputs
// that the profit figures and the RTO cost book read. All are owner data, empty as shipped, never guessed:
//   - payment gateway fees (`costs.gatewayFees`: a share in basis points and a fixed amount per provider);
//   - the packaging cost of one order (`costs.packaging`);
//   - the USD rate (ExchangeRate rows USD → the store's currency; a new rate is a new row from now, the old ones stay:
//     AI costs in dollars are turned into taka with the rate of their day);
//   - the courier rates (CourierRateCard per courier account, delivery band and weight band: charge, COD fee, return
//     charge; a rate is ended, never edited or deleted, and a new one entered from now).
// The RTO cost inputs (courier charge, packaging, handling per returned parcel) already live on Delivery → Couriers
// (`delivery.courier.rtoCost`, PR 192); the page links there instead of keeping a second copy.
//
// `path` is what comes after /api/admin/money/fees (`?storeId=`, default the mother store):
//   GET   ''                     everything above (`books.read`)
//   PUT   'gateway-fees'         {value: […] | null, version}   (`costs.write`; settings history + audit)
//   PUT   'packaging'            {value: {perOrderMinor} | null, version}
//   PUT   'courier-estimate'     {value: {enabled, codFee}, version}   (PR 354 `costs.courierEstimate`, off as shipped)
//   POST  'usd-rate'             {rate: "121.50"}   a new rate from now
//   POST  'rate-cards'           {courierAccountId, zoneKey, weightFromGrams, weightToGrams, chargeMinor, codFeeBps?,
//                                 returnChargeMinor?}   a new courier rate from now
//   POST  'rate-cards/:id/end'   end a rate now (it stays for the past)
// Every write is audited. Inputs only: nothing here charges, pays or changes a price, a delivery charge or COD.
import { z } from 'zod';
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { registry, SettingsError, storeTarget } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';

type Db = Pick<PrismaClient, 'exchangeRate' | 'courierAccount' | 'courierRateCard' | 'deliveryBand'>;
const USD = 'USD';

export interface FeesView {
  gatewayFees: { value: z.output<(typeof registry)['costs.gatewayFees']['schema']>; version: number };
  packaging: { value: z.output<(typeof registry)['costs.packaging']['schema']>; version: number };
  /** PR 354 — the per-order profit's courier estimate from the rate card (off as shipped). */
  courierEstimate: { value: z.output<(typeof registry)['costs.courierEstimate']['schema']>; version: number };
  usd: { current: { rate: string; from: string } | null; history: { rate: string; from: string }[] };
  couriers: { id: string; name: string; enabled: boolean; cards: { id: string; zoneKey: string; weightFromGrams: number; weightToGrams: number; chargeMinor: number; codFeeBps: number | null; returnChargeMinor: number | null; from: string; to: string | null }[] }[];
  bands: { key: string; nameEn: string; nameBn: string | null }[];
  currency: string;
}

/** A rate typed as text ("121.5", "121.50", "১২১.৫০") as a decimal string with at most 6 places, or null. */
export function rateText(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const s = [...String(raw).trim()].map((c) => ('০১২৩৪৫৬৭৮৯'.includes(c) ? String('০১২৩৪৫৬৭৮৯'.indexOf(c)) : c)).join('');
  const m = /^(\d{1,9})(?:\.(\d{1,6}))?$/.exec(s);
  if (!m || Number(s) <= 0) return null;
  return m[2] ? `${m[1]}.${m[2]}` : m[1]!;
}

/** Everything the page shows for one store. */
export async function feesView(db: Db, deps: Pick<AdminDeps, 'resolver'>, storeId: number, now = new Date()): Promise<FeesView> {
  const at = { storeId };
  const [fees, pack, estimate, currency, rates, couriers, bands] = await Promise.all([
    deps.resolver.get('costs.gatewayFees', at),
    deps.resolver.get('costs.packaging', at),
    deps.resolver.get('costs.courierEstimate', at),
    deps.resolver.value('store.currency', at),
    db.exchangeRate.findMany({ where: { storeId, baseCurrency: USD }, orderBy: { effectiveFrom: 'desc' }, take: 6, select: { rate: true, effectiveFrom: true, quoteCurrency: true } }),
    db.courierAccount.findMany({
      where: { storeId, archivedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, enabled: true, rateCards: { where: { OR: [{ validTo: null }, { validTo: { gt: now } }] }, orderBy: [{ zoneKey: 'asc' }, { weightFromGrams: 'asc' }] } },
    }),
    db.deliveryBand.findMany({ where: { storeId }, orderBy: { key: 'asc' }, select: { key: true, nameEn: true, nameBn: true } }),
  ]);
  const usd = rates.filter((r) => r.quoteCurrency === currency).map((r) => ({ rate: r.rate.toString(), from: r.effectiveFrom.toISOString() }));
  return {
    gatewayFees: { value: fees.value, version: fees.version },
    packaging: { value: pack.value, version: pack.version },
    courierEstimate: { value: estimate.value, version: estimate.version },
    usd: { current: usd[0] ?? null, history: usd.slice(1) },
    couriers: couriers.map((c) => ({
      id: c.id,
      name: c.name,
      enabled: c.enabled,
      cards: c.rateCards.map((r) => ({ id: r.id, zoneKey: r.zoneKey, weightFromGrams: r.weightFromGrams, weightToGrams: r.weightToGrams, chargeMinor: r.chargeMinor, codFeeBps: r.codFeeBps, returnChargeMinor: r.returnChargeMinor, from: r.validFrom.toISOString(), to: r.validTo?.toISOString() ?? null })),
    })),
    bands,
    currency,
  };
}

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}
const invalid = (details: string[]) => json({ ok: false, error: 'INVALID_INPUT', details }, { status: 400 });

const cardInput = z
  .object({
    courierAccountId: z.uuid(),
    zoneKey: z.string().trim().min(1).max(60),
    weightFromGrams: z.int().min(0).max(1_000_000),
    weightToGrams: z.int().min(1).max(1_000_000),
    chargeMinor: z.int().min(0).max(10_000_000),
    codFeeBps: z.int().min(0).max(2_000).nullish(),
    returnChargeMinor: z.int().min(0).max(10_000_000).nullish(),
  })
  .refine((x) => x.weightToGrams > x.weightFromGrams, { message: 'the weight band ends after it starts', path: ['weightToGrams'] });

/** The costs & fees routes (the table above). */
export async function feesRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const where = path.join('/');
  const kind = where === '' ? 'view' : where === 'gateway-fees' || where === 'packaging' || where === 'courier-estimate' ? 'setting' : where === 'usd-rate' ? 'usd' : where === 'rate-cards' ? 'card' : path.length === 3 && path[0] === 'rate-cards' && path[2] === 'end' ? 'end' : null;
  if (!kind) return fail(404, 'not-found');
  const want = kind === 'view' ? 'GET' : kind === 'setting' ? 'PUT' : 'POST';
  if (m !== want) return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: kind === 'view' ? 'books.read' : 'costs.write', storeId });
  if (g instanceof Response) return g;
  const d = deps!;
  const now = d.now ? d.now() : new Date();
  try {
    if (kind === 'view') return json({ ok: true, ...(await feesView(d.db, d, storeId, now)) });
    const b = await body(request);
    if (kind === 'setting') {
      const key = where === 'gateway-fees' ? ('costs.gatewayFees' as const) : where === 'courier-estimate' ? ('costs.courierEstimate' as const) : ('costs.packaging' as const);
      const parsed = registry[key].schema.safeParse(b.value === undefined ? Symbol('missing') : b.value);
      if (!parsed.success) return invalid(parsed.error.issues.map((i) => `${[key, ...i.path].join('.')}: ${i.message}`));
      const at = { storeId };
      const before = await d.resolver.value(key, at);
      if (JSON.stringify(before) !== JSON.stringify(parsed.data)) {
        const expectedVersion = typeof b.version === 'number' ? b.version : undefined;
        await d.resolver.set(key, parsed.data as never, storeTarget(storeId), { actorId: g.actor.staffUserId ?? null, reason: 'Money › Costs & fees', expectedVersion });
        await audit(d.db, g.actor, { storeId, action: 'costs.fees', entityType: 'Setting', entityId: key, before: { [key]: before }, after: { [key]: parsed.data } }, g.ctx);
      }
      const now2 = await d.resolver.get(key, at);
      return json({ ok: true, value: now2.value, version: now2.version });
    }
    if (kind === 'usd') {
      const rate = rateText(b.rate);
      if (!rate) return invalid(['rate: a number above 0, at most 6 decimals']);
      const currency = await d.resolver.value('store.currency', { storeId });
      const row = await d.db.exchangeRate.create({ data: { storeId, baseCurrency: USD, quoteCurrency: currency, rate, effectiveFrom: now, setById: g.actor.staffUserId ?? null }, select: { id: true } });
      await audit(d.db, g.actor, { storeId, action: 'costs.usdRate', entityType: 'ExchangeRate', entityId: row.id, before: null, after: { base: USD, quote: currency, rate } }, g.ctx);
      return json({ ok: true, id: row.id, rate }, { status: 201 });
    }
    if (kind === 'card') {
      const x = cardInput.safeParse(b);
      if (!x.success) return invalid(x.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
      const acct = await d.db.courierAccount.findFirst({ where: { id: x.data.courierAccountId, storeId, archivedAt: null }, select: { id: true } });
      if (!acct) return invalid(['courierAccountId: a courier account of this store']);
      const row = await d.db.courierRateCard.create({
        data: { storeId, courierAccountId: acct.id, zoneKey: x.data.zoneKey, weightFromGrams: x.data.weightFromGrams, weightToGrams: x.data.weightToGrams, chargeMinor: x.data.chargeMinor, codFeeBps: x.data.codFeeBps ?? null, returnChargeMinor: x.data.returnChargeMinor ?? null, validFrom: now },
        select: { id: true },
      });
      await audit(d.db, g.actor, { storeId, action: 'costs.rateCard.add', entityType: 'CourierRateCard', entityId: row.id, before: null, after: x.data }, g.ctx);
      return json({ ok: true, id: row.id }, { status: 201 });
    }
    const id = path[1] ?? '';
    if (!isUuid(id)) return fail(404, 'NOT_FOUND');
    const card = await d.db.courierRateCard.findFirst({ where: { id, storeId }, select: { id: true, validTo: true } });
    if (!card) return fail(404, 'NOT_FOUND');
    if (card.validTo && card.validTo <= now) return json({ ok: false, error: 'CONFLICT', details: ['this rate has ended already'] }, { status: 409 });
    await d.db.courierRateCard.update({ where: { id }, data: { validTo: now } });
    await audit(d.db, g.actor, { storeId, action: 'costs.rateCard.end', entityType: 'CourierRateCard', entityId: id, before: { to: card.validTo?.toISOString() ?? null }, after: { to: now.toISOString() } }, g.ctx);
    return json({ ok: true, id, to: now.toISOString() });
  } catch (e) {
    if (e instanceof SettingsError) return json({ ok: false, error: e.code === 'VERSION_CONFLICT' ? 'VERSION_CONFLICT' : 'INVALID_INPUT', details: [...e.issues] }, { status: e.code === 'VERSION_CONFLICT' ? 409 : 400 });
    return errorResponse(e);
  }
}
