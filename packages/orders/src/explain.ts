// PR 566 — the support explanation panel (§60.8–60.12): one order's "why this advance, and why this delivery charge",
// read only from what the order already stores, never worked out again from today's rules:
//   · the advance — the checkout's own requirement on the order (the Parameter for Checkout layer, PR 558/560, and its
//     flag event), the advance the order service was asked to wait for (`order.awaitAdvance`: the amount, the level,
//     who asked and when, PR 138/542), a gift's rule (PR 605), and Cash on Delivery turned off at checkout (the placed
//     event's `codOff`: the shop's switch, a Smart Rule, the band's COD limit, a gift);
//   · the delivery charge — the charge stored on the order (SIM-F-003: shown = stored), its band and place, how the
//     address was settled (typed, picked by the customer, or the address the shop holds, PR 561), free delivery and
//     why (PR 565), an address nothing settled or a band with no charge yet (PR 563).
// `explainOf` turns those facts into reason codes with their values; the admin page turns the codes into words in the
// admin's language, and the owner's "what to say" lines (`orders.explain`) into the words for the customer — which
// never carry a score, a rule's name or a level. Nothing here changes an order or moves money.
import { allow, type OrdersDeps, type Who } from './context';
import { staffNames } from './history';

/** How the advance compares with the order: the delivery charge only, the whole amount due, or another part. */
export type AdvanceKind = 'none' | 'delivery' | 'full' | 'part';

/** Why Cash on Delivery was not offered at checkout (the checkout's own reasons, stored on the placed event). */
export type CodOffReason = 'OFF' | 'RULE' | 'BAND_LIMIT' | 'GIFT';

/** One reason, as a code with the values its words need (amounts in minor units, dates as Date). */
export interface ExplainLine {
  code: string;
  values?: Record<string, string | number | Date | null>;
  /** For the team only: never read out to the customer (a score, a level, a rule's name). */
  staffOnly?: boolean;
}

/** Which of the owner's "what to say" lines fits (keys of `orders.explain.say`), with its values. */
export interface SayLine {
  key: 'advanceDelivery' | 'advanceFull' | 'advancePart' | 'advanceGift' | 'codOff' | 'chargeBand' | 'chargeFree' | 'chargeFreeOver' | 'chargePrepaid' | 'chargeNotFixed';
  values: Record<string, string | number | null>;
}

export interface Explanation {
  number: string;
  currency: string;
  advance: {
    kind: AdvanceKind;
    /** The amount asked ahead (null: none, or "the whole amount" with no figure stored). */
    amountMinor: number | null;
    paidMinor: number;
    dueAt: Date | null;
    why: ExplainLine[];
    say: SayLine | null;
  };
  charge: {
    state: 'charge' | 'free' | 'not-set' | 'unclear' | 'pickup';
    amountMinor: number;
    why: ExplainLine[];
    say: SayLine | null;
  };
}

/** The stored facts the explanation reads (exported for the tests; `orderExplanation` reads them from the database). */
export interface ExplainFacts {
  number: string;
  currency: string;
  fulfillmentType: string;
  isGift: boolean;
  flags: readonly string[];
  totalMinor: number;
  walletAppliedMinor: number;
  deliveryChargeMinor: number;
  paidMinor: number;
  paymentMethod: string | null;
  advanceRequirement: 'NONE' | 'DELIVERY_CHARGE' | 'FULL_AMOUNT';
  advanceRequiredMinor: number | null;
  advanceDueAt: Date | null;
  addressUnclear: boolean;
  chargeFixed: boolean;
  /** The checkout's address read as stored on the order (place.ts `addressResolution`). */
  addressResolution: unknown;
  riskScore: number | null;
  riskBand: string | null;
  band: {
    nameEn: string;
    nameBn: string | null;
    chargeMinor: number;
    codLimitMinor: number | null;
  } | null;
  area: { nameEn: string; nameBn: string | null } | null;
  /** The placed event's data (the payment chosen, `codOff`, the gift's advance). */
  placed: unknown;
  /** Every time the order was set to wait for an advance, oldest first. */
  asks: {
    at: Date;
    requiredMinor: number | null;
    level: string | null;
    by: string | null;
    actor: string;
  }[];
  /** The checkout's flag on this order (the Parameter for Checkout layer that matched), newest. */
  flag: { requirement: string; layer: string | null } | null;
  /** The newest risk assessment of the order. */
  risk: { score: number; band: string | null } | null;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const CODOFF: readonly CodOffReason[] = ['OFF', 'RULE', 'BAND_LIMIT', 'GIFT'];

/** The amount the order asks for in all (what the advance is compared with). */
const dueOf = (f: ExplainFacts) => Math.max(0, f.totalMinor - f.walletAppliedMinor);

function kindOf(f: ExplainFacts, amount: number | null): AdvanceKind {
  if (amount === null || amount <= 0) return 'none';
  if (f.deliveryChargeMinor > 0 && amount === f.deliveryChargeMinor) return 'delivery';
  return amount >= dueOf(f) ? 'full' : 'part';
}

function advanceOf(f: ExplainFacts, bandName: string | null): Explanation['advance'] {
  const placed = obj(f.placed);
  const gift = obj(placed.gift);
  const codOff = CODOFF.find((c) => c === placed.codOff) ?? null;
  const why: ExplainLine[] = [];
  const last = f.asks.at(-1) ?? null;

  // the amount: the order's own (the order service's wait, a gift's part), else what the requirement means
  let amount = f.advanceRequiredMinor ?? last?.requiredMinor ?? null;
  if (amount === null && f.advanceRequirement === 'DELIVERY_CHARGE') amount = f.deliveryChargeMinor || null;
  if (amount === null && f.advanceRequirement === 'FULL_AMOUNT') amount = dueOf(f) || null;
  const codOffPaid = codOff !== null && f.paymentMethod !== 'COD' && f.paymentMethod !== null;
  if (amount === null && codOffPaid) amount = dueOf(f) || null;
  let kind = f.advanceRequirement === 'DELIVERY_CHARGE' ? 'delivery' : f.advanceRequirement === 'FULL_AMOUNT' ? 'full' : kindOf(f, amount);
  if (kind === 'none' && codOffPaid) kind = 'full';

  // why it was asked — every stored reason, the checkout's first
  if (f.flag?.layer)
    why.push({
      code: 'layer',
      values: { name: f.flag.layer },
      staffOnly: true,
    });
  else if (f.advanceRequirement !== 'NONE') why.push({ code: 'checkoutRule', staffOnly: true });
  if (f.isGift && (str(gift.advance) === 'full' || str(gift.advance) === 'part' || f.flags.includes('GIFT_ADVANCE') || codOff === 'GIFT'))
    why.push({
      code: str(gift.advance) === 'part' || (kindOf(f, amount) === 'part' && codOff !== 'GIFT') ? 'giftPart' : 'gift',
    });
  if (codOff === 'BAND_LIMIT')
    why.push({
      code: 'codOffBand',
      values: { band: bandName, limit: f.band?.codLimitMinor ?? null },
    });
  else if (codOff === 'RULE') why.push({ code: 'codOffRule' });
  else if (codOff === 'OFF') why.push({ code: 'codOffShop' });
  for (const a of f.asks)
    why.push({
      code: 'asked',
      values: { amount: a.requiredMinor, by: a.by, actor: a.actor, at: a.at },
    });
  if (last?.level) why.push({ code: 'level', values: { level: last.level }, staffOnly: true });
  // why the delivery charge and not the full amount (or the other way round)
  if (kind === 'delivery')
    why.push({
      code: 'deliveryNotFull',
      staffOnly: f.advanceRequirement !== 'NONE',
    });
  if (kind === 'full' && f.advanceRequirement === 'FULL_AMOUNT') why.push({ code: 'fullNotDelivery', staffOnly: true });
  if (kind !== 'none' && f.risk)
    why.push({
      code: 'risk',
      values: { score: f.risk.score, band: f.risk.band },
      staffOnly: true,
    });
  else if (kind !== 'none' && f.riskScore !== null)
    why.push({
      code: 'risk',
      values: { score: f.riskScore, band: f.riskBand },
      staffOnly: true,
    });
  if (kind !== 'none' && amount !== null)
    why.push({
      code: f.paidMinor >= amount ? 'paidAll' : 'paidSoFar',
      values: { paid: f.paidMinor, amount },
    });
  if (kind !== 'none' && f.advanceDueAt) why.push({ code: 'dueBy', values: { at: f.advanceDueAt } });
  if (kind === 'none')
    why.push({
      code: f.paymentMethod && f.paymentMethod !== 'COD' && f.paymentMethod !== 'CASH' ? 'chosePrepaid' : 'none',
    });
  else if (why.every((w) => ['paidAll', 'paidSoFar', 'dueBy', 'deliveryNotFull', 'risk'].includes(w.code))) why.unshift({ code: 'noRecord' });

  const values = { amount, paid: f.paidMinor };
  const say: SayLine | null =
    kind === 'none'
      ? null
      : f.isGift && why.some((w) => w.code === 'gift' || w.code === 'giftPart')
        ? { key: 'advanceGift', values }
        : codOffPaid && f.advanceRequirement === 'NONE' && !f.asks.length && codOff !== 'GIFT'
          ? { key: 'codOff', values }
          : {
              key: kind === 'delivery' ? 'advanceDelivery' : kind === 'full' ? 'advanceFull' : 'advancePart',
              values,
            };
  return {
    kind,
    amountMinor: amount,
    paidMinor: f.paidMinor,
    dueAt: f.advanceDueAt,
    why,
    say,
  };
}

function chargeOf(f: ExplainFacts, bandName: string | null, areaName: string | null): Explanation['charge'] {
  const r = obj(f.addressResolution);
  const charge = obj(r.charge);
  const why: ExplainLine[] = [];
  const amountMinor = f.deliveryChargeMinor;
  if (f.fulfillmentType !== 'DELIVERY')
    return {
      state: 'pickup',
      amountMinor,
      why: [{ code: 'pickup' }],
      say: null,
    };

  if (charge.state === 'free') {
    const reason = str(charge.reason);
    const over = int(charge.freeOverMinor);
    why.push({
      code: reason === 'FREE_OVER' ? 'freeOver' : reason === 'FREE_PRODUCTS' ? 'freeProducts' : reason === 'PREPAID' ? 'freePrepaid' : 'freeCampaign',
      values: { over },
    });
    if (r.bandExempt === true) why.push({ code: 'exempt' });
    const say: SayLine =
      reason === 'FREE_OVER' && over !== null ? { key: 'chargeFreeOver', values: { over } } : reason === 'PREPAID' ? { key: 'chargePrepaid', values: {} } : { key: 'chargeFree', values: {} };
    return { state: 'free', amountMinor: 0, why, say };
  }
  if (f.addressUnclear || r.status === 'ask') {
    why.push({ code: 'unclear', values: { reason: str(r.reason) } });
    return {
      state: 'unclear',
      amountMinor,
      why,
      say: { key: 'chargeNotFixed', values: {} },
    };
  }
  if (charge.state === 'not-set' || (!f.chargeFixed && amountMinor === 0)) {
    why.push(bandName ? { code: 'notSet', values: { band: bandName } } : { code: 'notSetNoBand' });
    return {
      state: 'not-set',
      amountMinor,
      why,
      say: { key: 'chargeNotFixed', values: {} },
    };
  }

  why.push({ code: 'band', values: { band: bandName, charge: amountMinor } });
  const via = str(r.via);
  if (via === 'choice') why.push({ code: 'viaChoice', values: { band: bandName } });
  else if (via === 'saved') why.push({ code: 'viaSaved' });
  else if (via === 'line')
    why.push({
      code: areaName ? 'viaLine' : 'viaLineNoPlace',
      values: { area: areaName },
    });
  if (r.placeSure === false) why.push({ code: 'placeUnsure' });
  if (str(r.backfill)) why.push({ code: 'backfill', values: { from: str(r.backfill) } });
  if (f.band && f.band.chargeMinor !== amountMinor)
    why.push({
      code: 'bandNow',
      values: { now: f.band.chargeMinor, charge: amountMinor },
    });
  if (r.detail === false) why.push({ code: 'detailCheck' });
  return {
    state: 'charge',
    amountMinor,
    why,
    say: {
      key: 'chargeBand',
      values: { charge: amountMinor, band: bandName, area: areaName },
    },
  };
}

/** The explanation of one order from its stored facts, in the admin's language for the band and place names. */
export function explainOf(f: ExplainFacts, lang: 'en' | 'bn' = 'en'): Explanation {
  const bandName = f.band ? (lang === 'bn' && f.band.nameBn ? f.band.nameBn : f.band.nameEn) : null;
  const areaName = f.area ? (lang === 'bn' && f.area.nameBn ? f.area.nameBn : f.area.nameEn) : null;
  return {
    number: f.number,
    currency: f.currency,
    advance: advanceOf(f, bandName),
    charge: chargeOf(f, bandName, areaName),
  };
}

/** PR 566 — one order's stored facts for its explanation, for the person reading it (`orders.read`); null: no such order. */
export async function orderExplainFacts(deps: OrdersDeps, who: Who, orderId: string): Promise<ExplainFacts | null> {
  await allow(deps, who, 'orders.read');
  const where = { storeId: who.storeId, orderId };
  const o = await deps.db.order.findFirst({
    where: { id: orderId, storeId: who.storeId },
    select: {
      number: true,
      currency: true,
      fulfillmentType: true,
      isGift: true,
      flags: true,
      totalMinor: true,
      walletAppliedMinor: true,
      deliveryChargeMinor: true,
      paidMinor: true,
      paymentMethod: true,
      advanceRequirement: true,
      advanceRequiredMinor: true,
      advanceDueAt: true,
      addressUnclear: true,
      chargeFixed: true,
      addressResolution: true,
      riskScore: true,
      riskBand: true,
      deliveryBand: {
        select: {
          nameEn: true,
          nameBn: true,
          chargeMinor: true,
          codLimitMinor: true,
        },
      },
      area: { select: { nameEn: true, nameBn: true } },
    },
  });
  if (!o) return null;
  const [placed, asks, flag, risk] = await Promise.all([
    deps.db.orderEvent.findFirst({
      where: { ...where, type: 'order.placed' },
      orderBy: { createdAt: 'asc' },
      select: { data: true },
    }),
    deps.db.orderEvent.findMany({
      where: { ...where, type: 'order.awaitAdvance' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        createdAt: true,
        data: true,
        reasonCode: true,
        actorType: true,
        actorId: true,
      },
    }),
    deps.db.checkoutFlagEvent.findFirst({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { requirement: true, layer: { select: { name: true } } },
    }),
    deps.db.riskAssessment.findFirst({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { score: true, bandKey: true },
    }),
  ]);
  const names = await staffNames(
    deps,
    who,
    asks.filter((a) => a.actorType === 'STAFF').map((a) => a.actorId),
  );
  const { deliveryBand, area, ...rest } = o;
  return {
    ...rest,
    band: deliveryBand,
    area,
    placed: placed?.data ?? null,
    asks: asks.map((a) => ({
      at: a.createdAt,
      requiredMinor: int(obj(a.data).requiredMinor),
      level: a.reasonCode,
      by: a.actorId ? (names[a.actorId] ?? null) : null,
      actor: a.actorType,
    })),
    flag: flag ? { requirement: flag.requirement, layer: flag.layer?.name ?? null } : null,
    risk: risk ? { score: risk.score, band: risk.bandKey } : null,
  };
}

/** PR 566 — one order's support explanation for the person reading it (`orders.read`); null when there is no such order. */
export async function orderExplanation(deps: OrdersDeps, who: Who, orderId: string, lang: 'en' | 'bn' = 'en'): Promise<Explanation | null> {
  const f = await orderExplainFacts(deps, who, orderId);
  return f ? explainOf(f, lang) : null;
}
