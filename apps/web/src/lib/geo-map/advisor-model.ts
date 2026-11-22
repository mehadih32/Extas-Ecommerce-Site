// S29 · PR 761 (CN-054; register "Geography map: AI advisor", advice only) — the suggestions, without the database and
// without the AI. From the figures of the map's lenses (the ones that are on and that the viewer may see) this works out what
// to put in front of the owner: where to advertise more or less (the lists are made exactly like Where to advertise, PR 569,
// to copy by hand), where to ask for an advance or stop COD, which courier to use in an area, which style to push where, which
// styles to keep near, delivery-charge ideas (numbers only) and coverage to add.
//
// Every suggestion is built from numbers the lenses gave, never invented, and carries them (`numbers`) so the approval card
// shows the proof. A suggestion needs the lens it comes from: with a lens off (or a part the viewer may not see), its
// suggestions are simply not made. Nothing here decides or changes anything: no ad budget, campaign, price, charge, COD
// rule or courier (hard rule 6). The AI only words a short note beside each one (advisor.ts); the facts are these.
import type { LensResult } from '@extas/metrics';
import { copyLine, wordOf } from '../marketing/geo-guide-model';

export const ADVICE_KINDS = [
  'codAdvance',
  'deliveryCharge',
  'courier',
  'coverage',
  'adLess',
  'adMore',
  'pushProduct',
  'keepStock',
] as const;
export type AdviceKind = (typeof ADVICE_KINDS)[number];
export type Lang = 'en' | 'bn';

/** The best courier of an area from the shop's own parcels (the courier lens, PR 757). */
export interface CourierHint {
  areaId: string;
  nameEn: string;
  nameBn: string | null;
  bestCourier: string;
  /** 0–1 */
  bestRate: number;
  /** The rate of the courier now used there, 0–1; null when none. */
  currentRate: number | null;
  settled: number;
}
/** An area with orders but no courier mapped (the courier lens, PR 757). */
export interface CoverageGap {
  areaId: string;
  nameEn: string;
  nameBn: string | null;
  orders: number;
}
/** A district's delivered and returned orders (the Sales by area figure, PR 568). */
export interface DistrictFigures {
  areaId: string;
  nameEn: string;
  nameBn: string | null;
  delivered: number;
  returned: number;
}

export interface AdviceInput {
  /** The Geography map's `minOrders`: a suggestion about an area needs at least this many of what it counts. */
  minOrders: number;
  /** The numbers of Where to advertise (`ads.geoGuide`): the words "more" and "less" for the district lists. */
  guide: { minOrders: number; goodReturnPct: number; badReturnPct: number };
  districts: readonly DistrictFigures[] | null;
  risk: LensResult | null;
  money: LensResult | null;
  demand: LensResult | null;
  courier: readonly CourierHint[] | null;
  coverage: readonly CoverageGap[] | null;
}

export interface Suggestion {
  /** Stable for the same finding: kind and area. The approval queue does not take a second one while this one waits. */
  key: string;
  kind: AdviceKind;
  areaId: string | null;
  area: { en: string; bn: string } | null;
  /** The figures behind it (percent as whole-tenth numbers, money in minor units). */
  numbers: Record<string, number | null>;
  /** For the ad lists: the names to copy, in both languages. */
  list?: { en: string; bn: string; count: number };
  /** A style or a courier named in it. */
  item?: { en: string; bn: string };
  /** Bigger = more worth reading first, within its kind. */
  weight: number;
}

const pct1 = (r: number | null | undefined): number | null => (r === null || r === undefined ? null : Math.round(r * 1000) / 10);
const num = (v: number | null | undefined): number => (typeof v === 'number' ? v : 0);
const nameOf = (r: { nameEn: string; nameBn: string | null }) => ({
  en: r.nameEn,
  bn: r.nameBn ?? r.nameEn,
});
const rowName = (r: { nameEn: string; nameBn: string | null; parentNameEn?: string | null; parentNameBn?: string | null }) => ({
  en: r.parentNameEn ? `${r.nameEn}, ${r.parentNameEn}` : r.nameEn,
  bn: r.parentNameEn ? `${r.nameBn ?? r.nameEn}, ${r.parentNameBn ?? r.parentNameEn}` : (r.nameBn ?? r.nameEn),
});

/** The order the kinds are read in: the ones that lose money or customers first (the order of ADVICE_KINDS). */
const PRIORITY = (k: AdviceKind): number => ADVICE_KINDS.indexOf(k);

interface ExtraStock {
  productId: string;
  pieces: number;
  areaSharePct: number;
  nameEn?: string;
  nameBn?: string | null;
}
interface ExtraProducts {
  push: { productId: string; reason: string; count: number } | null;
}

/** All the suggestions the figures support, the most worth reading first. Unbounded: the caller keeps the first few. */
export function suggestionsFrom(i: AdviceInput): Suggestion[] {
  const out: Suggestion[] = [];

  // where to ask for an advance or stop COD: a return hotspot where parcels were refused at the door, or a risk area
  for (const r of i.risk?.rows ?? []) {
    const refused = r.figures.refusedAtDoor ?? 0;
    const hot = r.flags.includes('returnHotspot') && refused > 0;
    const risky = r.flags.includes('riskArea');
    if (!hot && !risky) continue;
    out.push({
      key: `codAdvance:${r.areaId}`,
      kind: 'codAdvance',
      areaId: r.areaId,
      area: rowName(r),
      numbers: {
        returnRatePct: pct1(r.figures.returnRate),
        settled: r.figures.settled ?? null,
        refusedAtDoor: r.figures.refusedAtDoor ?? null,
        highRiskSharePct: pct1(r.figures.highRiskShare),
        highRisk: r.figures.highRisk ?? null,
        scored: r.figures.scored ?? null,
      },
      weight: num(r.figures.settled) + num(r.figures.scored),
    });
  }

  // delivery that costs more than it brings in: the numbers only, the owner decides any charge or free-delivery limit
  for (const r of i.money?.rows ?? []) {
    if (!r.flags.includes('deliveryEatsProfit')) continue;
    out.push({
      key: `deliveryCharge:${r.areaId}`,
      kind: 'deliveryCharge',
      areaId: r.areaId,
      area: rowName(r),
      numbers: {
        chargeMinor: r.figures.deliveryChargeMinor ?? null,
        courierMinor: r.figures.courierMinor ?? null,
        gapMinor: r.figures.deliveryGapMinor ?? null,
        parcels: r.figures.courierKnownOrders ?? null,
        freeDeliveryOrders: r.figures.freeDeliveryOrders ?? null,
      },
      weight: -num(r.figures.deliveryGapMinor),
    });
  }

  // the better courier for an area, from the shop's own parcels
  for (const h of i.courier ?? []) {
    if (h.settled < i.minOrders || h.currentRate === null || h.bestRate <= h.currentRate) continue;
    out.push({
      key: `courier:${h.areaId}`,
      kind: 'courier',
      areaId: h.areaId,
      area: nameOf(h),
      numbers: {
        bestRatePct: pct1(h.bestRate),
        currentRatePct: pct1(h.currentRate),
        settled: h.settled,
      },
      item: { en: h.bestCourier, bn: h.bestCourier },
      weight: (h.bestRate - h.currentRate) * h.settled,
    });
  }

  // areas that order but have no courier mapped
  for (const c of i.coverage ?? []) {
    if (c.orders < 1) continue;
    out.push({
      key: `coverage:${c.areaId}`,
      kind: 'coverage',
      areaId: c.areaId,
      area: nameOf(c),
      numbers: { orders: c.orders },
      weight: c.orders,
    });
  }

  // the ad lists: exactly Where to advertise's words, one list to aim at and one to leave out
  if (i.districts) {
    const word = (d: DistrictFigures) => wordOf({ delivered: d.delivered, returned: d.returned }, i.guide);
    for (const [kind, w] of [
      ['adLess', 'less'],
      ['adMore', 'more'],
    ] as const) {
      const of = i.districts
        .filter((d) => word(d) === w)
        .sort((a, b) => b.delivered + b.returned - (a.delivered + a.returned) || a.nameEn.localeCompare(b.nameEn));
      if (!of.length) continue;
      out.push({
        key: `${kind}:all`,
        kind,
        areaId: null,
        area: null,
        numbers: {
          districts: of.length,
          settled: of.reduce((s, d) => s + d.delivered + d.returned, 0),
        },
        list: {
          en: copyLine(of.map((d) => d.nameEn)),
          bn: copyLine(of.map((d) => d.nameBn ?? d.nameEn)),
          count: of.length,
        },
        weight: of.length,
      });
    }
  }

  // the style to push where it is wished for and not bought
  const products = (i.demand?.extras.products ?? {}) as Record<string, ExtraProducts>;
  const names = (i.demand?.extras.productNames ?? {}) as Record<string, { nameEn: string; nameBn: string | null }>;
  for (const r of i.demand?.rows ?? []) {
    const p = products[r.areaId]?.push;
    if (!p || p.reason !== 'wishlist' || p.count < i.minOrders) continue;
    const n = names[p.productId];
    out.push({
      key: `pushProduct:${r.areaId}`,
      kind: 'pushProduct',
      areaId: r.areaId,
      area: rowName(r),
      numbers: {
        wishedWithoutSale: p.count,
        areaWishlistNoSale: r.figures.wishlistNoSale ?? null,
        demandWithoutSales: r.figures.demandWithoutSales ?? null,
      },
      item: n ? nameOf(n) : { en: '(style)', bn: '(স্টাইল)' },
      weight: p.count,
    });
  }

  // the styles that sell in an area: keep them near (what sells; never moves stock)
  const stock = (i.money?.extras.stock ?? null) as Record<string, ExtraStock[]> | null;
  for (const r of i.money?.rows ?? []) {
    const top = stock?.[r.areaId]?.[0];
    if (!top || top.pieces < i.minOrders) continue;
    out.push({
      key: `keepStock:${r.areaId}`,
      kind: 'keepStock',
      areaId: r.areaId,
      area: rowName(r),
      numbers: { pieces: top.pieces, areaSharePct: top.areaSharePct },
      item: {
        en: top.nameEn ?? '(style)',
        bn: top.nameBn ?? top.nameEn ?? '(স্টাইল)',
      },
      weight: top.pieces,
    });
  }

  return out.sort((a, b) => PRIORITY(a.kind) - PRIORITY(b.kind) || b.weight - a.weight || a.key.localeCompare(b.key));
}

/** A money figure for words: the major unit with two decimals and the store's currency code. */
export const moneyText = (minor: number | null, currency: string): string =>
  minor === null ? '?' : `${(minor / 100).toFixed(2)} ${currency}`;

/** The suggestion's title and the plain facts behind it, in the owner's language. */
export function textOf(s: Suggestion, lang: Lang, currency: string): { title: string; facts: string[] } {
  const bn = lang === 'bn';
  const area = s.area ? (bn ? s.area.bn : s.area.en) : '';
  const item = s.item ? (bn ? s.item.bn : s.item.en) : '';
  const n = s.numbers;
  const v = (k: string) => (n[k] === null || n[k] === undefined ? '?' : String(n[k]));
  const m = (k: string) => moneyText(n[k] ?? null, currency);
  switch (s.kind) {
    case 'codAdvance':
      return bn
        ? {
            title: `${area}: অগ্রিম চান বা COD বন্ধ করার কথা ভাবুন`,
            facts: [
              `ফল জানা ${v('settled')}টা অর্ডারের ${v('returnRatePct')}% ফেরত`,
              `দরজায় রিফিউজ হয়েছে ${v('refusedAtDoor')}টা পার্সেল`,
              `ঝুঁকির স্কোরে সবচেয়ে ওপরের ব্যান্ডে ${v('highRisk')}টা (স্কোর হওয়া ${v('scored')}টার ${v('highRiskSharePct')}%)`,
            ],
          }
        : {
            title: `${area}: ask for an advance or consider stopping COD`,
            facts: [
              `${v('returnRatePct')}% of ${v('settled')} settled orders came back`,
              `${v('refusedAtDoor')} parcels refused at the door`,
              `${v('highRisk')} orders in the top risk band (${v('highRiskSharePct')}% of ${v('scored')} scored)`,
            ],
          };
    case 'deliveryCharge':
      return bn
        ? {
            title: `${area}: ডেলিভারিতে যা তুলছেন তার চেয়ে খরচ বেশি`,
            facts: [
              `তোলা ডেলিভারি চার্জ ${m('chargeMinor')}`,
              `${v('parcels')}টা পার্সেলে কুরিয়ারের চার্জ ${m('courierMinor')}`,
              `ঘাটতি ${m('gapMinor')}`,
              `চার্জ ছাড়া অর্ডার ${v('freeDeliveryOrders')}টা`,
            ],
          }
        : {
            title: `${area}: delivery costs more than it brings in`,
            facts: [
              `Delivery charge collected ${m('chargeMinor')}`,
              `Courier charge on ${v('parcels')} parcels ${m('courierMinor')}`,
              `Gap ${m('gapMinor')}`,
              `${v('freeDeliveryOrders')} orders sent with no charge`,
            ],
          };
    case 'courier':
      return bn
        ? {
            title: `${area}: ${item} দিয়ে পাঠিয়ে দেখুন`,
            facts: [
              `${item}-এর সফলতার হার ${v('bestRatePct')}%`,
              `এখনকার কুরিয়ারের ${v('currentRatePct')}%`,
              `${v('settled')}টা পার্সেলের হিসাবে`,
            ],
          }
        : {
            title: `${area}: try ${item}`,
            facts: [
              `${item} succeeds ${v('bestRatePct')}% of the time`,
              `The courier used now ${v('currentRatePct')}%`,
              `Over ${v('settled')} parcels`,
            ],
          };
    case 'coverage':
      return bn
        ? {
            title: `${area}: কুরিয়ার ম্যাপ করা নেই`,
            facts: [`এখান থেকে ${v('orders')}টা অর্ডার এসেছে, অথচ কোনো কুরিয়ার এই এলাকায় ম্যাপ করা নেই`],
          }
        : {
            title: `${area}: no courier is mapped`,
            facts: [`${v('orders')} orders came from here, but no courier is mapped to this area`],
          };
    case 'adLess':
      return bn
        ? {
            title: `যেসব জেলায় বিজ্ঞাপন কমান`,
            facts: [`${v('districts')}টা জেলা, ফল জানা মোট ${v('settled')}টা অর্ডার`, s.list?.bn ?? ''],
          }
        : {
            title: 'Spend less on ads in these districts',
            facts: [`${v('districts')} districts, ${v('settled')} settled orders in all`, s.list?.en ?? ''],
          };
    case 'adMore':
      return bn
        ? {
            title: `যেসব জেলায় বিজ্ঞাপন বাড়াতে পারেন`,
            facts: [`${v('districts')}টা জেলা, ফল জানা মোট ${v('settled')}টা অর্ডার`, s.list?.bn ?? ''],
          }
        : {
            title: 'Spend more on ads in these districts',
            facts: [`${v('districts')} districts, ${v('settled')} settled orders in all`, s.list?.en ?? ''],
          };
    case 'pushProduct':
      return bn
        ? {
            title: `${area}: ${item} ক্যাম্পেইনে ঠেলুন`,
            facts: [
              `${v('wishedWithoutSale')} জন ওয়িশলিস্টে রেখেছেন কিন্তু কেনেননি`,
              `এলাকায় বিক্রি ছাড়া চাহিদা মোট ${v('demandWithoutSales')}টা`,
            ],
          }
        : {
            title: `${area}: push ${item} in a campaign`,
            facts: [
              `${v('wishedWithoutSale')} customers wished for it without buying`,
              `${v('demandWithoutSales')} demands without a sale in the area in all`,
            ],
          };
    case 'keepStock':
      return bn
        ? {
            title: `${area}: ${item} কাছে রাখুন`,
            facts: [`${v('pieces')} পিস বিক্রি হয়েছে`, `এই স্টাইলের মোট বিক্রির ${v('areaSharePct')}% এই এলাকায়`],
          }
        : {
            title: `${area}: keep ${item} near`,
            facts: [`${v('pieces')} pieces sold`, `${v('areaSharePct')}% of all pieces of this style went to this area`],
          };
  }
}
