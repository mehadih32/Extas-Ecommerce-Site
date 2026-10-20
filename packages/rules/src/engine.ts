// PR 208 — the rules engine: given the live rules and a cart (or an order, for a simulation), what does it cost and
// what applies. Deterministic and pure, so the bag, checkout, the admin preview and the simulation all get the same
// answer for the same input.
//
// The order of work:
//   1. live rules (active, not archived, inside their window) whose conditions hold for this cart;
//   2. set tiers (PR 212): any N in scope for a set price, grouped so the customer pays the least;
//   3. discounts (PR 213): percentage or amount, on lines or on the order, with a coupon when the rule needs one; a
//      line takes one offer unless every offer on it may combine ("stackable"); a set tier never combines;
//   4. delivery (PR 210): the charge of the customer's band from the first delivery rule in the resolution order;
//      free when a free-delivery rule holds (over a threshold, a campaign, or every product is free-delivery); an
//      unknown band or a charge the owner has not set gives "no charge known" (null), never a made-up number;
//   5. COD (payment rules), and the festive cut-offs for the band (PR 214).
// Fixed combo lines are priced by their combo (S03) and take no tier or discount here.
//
// Money is integer minor units throughout. Every rounding is down, so a discount is never larger than its rule says.
import { conditionHolds, inScope, resolutionOrder, type ConditionFacts, type ScopeFacts } from './match';
import { isLive, valueOf, type Action, type Rule } from './model';

export interface LineFact extends ScopeFacts {
  id: string;
  variantId?: string | null;
  unitPriceMinor: number;
  quantity: number;
  /** The product ships free (Product.freeDelivery). */
  freeDelivery?: boolean | null;
  /** Part of a fixed combo: the combo's own price stands. */
  comboId?: string | null;
}

export interface CartFacts {
  now: Date;
  lines: LineFact[];
  /** The delivery band of the resolved address (S06); null = not known yet. */
  bandKey: string | null;
  paymentMethod: string | null;
  couponCode: string | null;
  /** Rules a valid coupon unlocks (the coupon service checks the code, its window and its limits). */
  couponRuleIds: readonly string[];
  customer: { loggedIn: boolean; deliveredOrders: number | null };
  source: string | null;
  /** Weekday 1 (Monday) … 7 and hour 0–23 in the store's time zone (clockFacts). */
  weekday: number | null;
  hour: number | null;
}

export interface RuleRef {
  id: string;
  key: string;
  version: number;
}

export interface LineQuote {
  id: string;
  quantity: number;
  unitPriceMinor: number;
  baseMinor: number;
  discountMinor: number;
  finalMinor: number;
  offers: { rule: RuleRef; kind: 'setTier' | 'discount'; amountMinor: number; stackable: boolean }[];
}

export type DeliveryReason = 'CHARGED' | 'FREE_OVER' | 'FREE_CAMPAIGN' | 'FREE_PRODUCTS' | 'NO_BAND' | 'NOT_SET' | 'NO_RULE';

export interface DeliveryQuote {
  bandKey: string | null;
  /** What the band costs (before free delivery); null = not known. */
  baseChargeMinor: number | null;
  /** What the customer pays for delivery; null = not known yet. */
  chargeMinor: number | null;
  free: boolean;
  reason: DeliveryReason;
  freeOverMinor: number | null;
  /** How much more for free delivery (null when there is no threshold or it is reached). */
  remainingMinor: number | null;
  chargeRule: RuleRef | null;
  freeRule: RuleRef | null;
}

export interface CodQuote {
  /** null = no payment rule: the store's COD setting decides. */
  allowed: boolean | null;
  maxOrderMinor: number | null;
  reason: 'RULE' | 'OVER_MAX' | 'NOT_SET' | 'NO_RULE';
  rule: RuleRef | null;
}

export interface CutoffQuote {
  rule: RuleRef;
  bandKey: string;
  at: string;
  passed: boolean;
}

export interface Applied {
  rule: RuleRef;
  kind: Rule['kind'];
  effect: 'setTier' | 'discount' | 'deliveryCharge' | 'freeDelivery' | 'cod' | 'cutoff';
  amountMinor: number | null;
  /** setTier: the pieces in the sets at their own separate prices, and what the sets cost (the honest "was", CN-009). */
  separateMinor?: number;
  setMinor?: number;
}

export interface Quote {
  lines: LineQuote[];
  subtotalMinor: number;
  discountMinor: number;
  itemsMinor: number;
  delivery: DeliveryQuote;
  cod: CodQuote;
  cutoffs: CutoffQuote[];
  /** Items + delivery; when the delivery charge is not known it counts as nothing and `totalKnown` is false. */
  totalMinor: number;
  totalKnown: boolean;
  applied: Applied[];
  /** Rules that would apply but wait for something (a coupon, a larger cart). */
  waiting: { rule: RuleRef; why: 'COUPON' | 'MIN_SUBTOTAL' }[];
}

export interface EngineLimits {
  /** rules.discount.maxPercentOff — a percentage above it is clamped (check.ts refuses to save one). */
  maxPercentOff: number;
}

const NOTHING = 0;
const ref = (r: Rule): RuleRef => ({ id: r.id, key: r.key, version: r.version });
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, NOTHING);

/** Weekday (1 = Monday … 7) and hour in the store's time zone. */
export function clockFacts(now: Date, timeZone: string): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return { weekday: days.indexOf(wd) + 1, hour };
}

export function conditionFacts(f: CartFacts): ConditionFacts {
  return {
    'cart.subtotal': sum(f.lines.map((l) => l.unitPriceMinor * l.quantity)),
    'cart.quantity': sum(f.lines.map((l) => l.quantity)),
    'cart.couponCode': f.couponCode,
    'delivery.band': f.bandKey,
    'payment.method': f.paymentMethod,
    'customer.loggedIn': f.customer.loggedIn,
    'customer.deliveredOrders': f.customer.deliveredOrders,
    'order.source': f.source,
    'time.weekday': f.weekday,
    'time.hour': f.hour,
  };
}

/** The live rules whose conditions hold, in the resolution order. */
export function applicableRules(rules: readonly Rule[], f: CartFacts): Rule[] {
  const facts = conditionFacts(f);
  return rules.filter((r) => isLive(r, f.now) && conditionHolds(r.conditions, facts)).sort(resolutionOrder);
}

/**
 * Spreads `total` over weights, rounding down, the remainder to the largest fractions first. Never over `total`, and
 * no share over its own weight (a line never gets more off than it costs).
 */
export function spread(total: number, weights: number[]): number[] {
  const w = sum(weights);
  if (w <= 0 || total <= 0) return weights.map(() => NOTHING);
  const raw = weights.map((x) => (total * x) / w);
  const out = raw.map((x, i) => Math.min(Math.floor(x), weights[i]!));
  let left = total - sum(out);
  const order = raw.map((x, i) => ({ i, frac: x - Math.floor(x), w: weights[i]! })).sort((a, b) => b.frac - a.frac || b.w - a.w);
  for (const o of order) {
    if (left <= 0) break;
    if (out[o.i]! < weights[o.i]!) {
      out[o.i]!++;
      left--;
    }
  }
  return out;
}

/**
 * PR 212 — the cheapest grouping of units into tiers. Units sorted by price, dearest first; groups are runs of that
 * order, so the dearest pieces go into sets and the cheapest stay single. Returns, per unit (same order), what it pays.
 */
export function bestTierGrouping(prices: number[], tiers: { quantity: number; priceMinor: number }[]): { paid: number[]; groups: number; inGroup: boolean[] } {
  const n = prices.length;
  const order = prices.map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p || a.i - b.i);
  const cost = new Array<number>(n + 1).fill(Infinity);
  const how = new Array<number>(n + 1).fill(NOTHING);
  cost[0] = NOTHING;
  for (let k = 1; k <= n; k++) {
    cost[k] = cost[k - 1]! + order[k - 1]!.p;
    how[k] = 1;
    for (const t of tiers) {
      if (t.quantity > k) continue;
      const c = cost[k - t.quantity]! + t.priceMinor;
      if (c < cost[k]!) {
        cost[k] = c;
        how[k] = -t.quantity;
      }
    }
  }
  const paidSorted = new Array<number>(n).fill(NOTHING);
  const groupedSorted = new Array<boolean>(n).fill(false);
  let groups = NOTHING;
  for (let k = n; k > 0; ) {
    const h = how[k]!;
    if (h === 1) {
      paidSorted[k - 1] = order[k - 1]!.p;
      k -= 1;
    } else {
      const q = -h;
      const tier = tiers.find((t) => t.quantity === q)!;
      const members = order.slice(k - q, k).map((o) => o.p);
      const shares = spread(tier.priceMinor, members);
      shares.forEach((s, j) => {
        paidSorted[k - q + j] = s;
        groupedSorted[k - q + j] = true;
      });
      groups++;
      k -= q;
    }
  }
  const paid = new Array<number>(n).fill(NOTHING);
  const inGroup = new Array<boolean>(n).fill(false);
  order.forEach((o, j) => {
    paid[o.i] = paidSorted[j]!;
    inGroup[o.i] = groupedSorted[j]!;
  });
  return { paid, groups, inGroup };
}

interface LineState {
  fact: LineFact;
  base: number;
  discount: number;
  offers: LineQuote['offers'];
}

function lineAccepts(s: LineState, stackable: boolean): boolean {
  if (s.fact.comboId) return false;
  if (s.offers.length === 0) return true;
  return stackable && s.offers.every((o) => o.stackable);
}

const net = (s: LineState) => s.base - s.discount;

/** The engine. `rules` may hold drafts or archived rules: only live ones count. */
export function quote(rules: readonly Rule[], f: CartFacts, limits: EngineLimits): Quote {
  const live = applicableRules(rules, f);
  const lines: LineState[] = f.lines.map((l) => ({ fact: l, base: l.unitPriceMinor * l.quantity, discount: NOTHING, offers: [] }));
  const applied: Applied[] = [];
  const waiting: Quote['waiting'] = [];
  const actions = (type: Action['type']) => live.flatMap((r) => r.actions.filter((a) => a.type === type).map((a) => ({ rule: r, action: a })));

  // ---- 2. set tiers ----
  for (const { rule, action } of actions('setTier')) {
    if (action.type !== 'setTier') continue;
    const tiers = action.tiers.flatMap((t) => {
      const v = valueOf<number>(rule, t.param);
      return v === null ? [] : [{ quantity: t.quantity, priceMinor: v }];
    });
    if (!tiers.length) continue;
    const eligible = lines.filter((s) => inScope(rule.scope, s.fact) && lineAccepts(s, false));
    const units = eligible.flatMap((s, li) => Array.from({ length: s.fact.quantity }, () => ({ li, p: s.fact.unitPriceMinor })));
    if (units.length < Math.min(...tiers.map((t) => t.quantity))) continue;
    const { paid, groups, inGroup } = bestTierGrouping(
      units.map((u) => u.p),
      tiers,
    );
    if (!groups) continue;
    const saved = new Array<number>(eligible.length).fill(NOTHING);
    units.forEach((u, i) => (saved[u.li]! += u.p - paid[i]!));
    let total = NOTHING;
    eligible.forEach((s, i) => {
      if (saved[i]! <= 0) return;
      s.discount += saved[i]!;
      s.offers.push({ rule: ref(rule), kind: 'setTier', amountMinor: saved[i]!, stackable: false });
      total += saved[i]!;
    });
    let separate = NOTHING;
    let inSets = NOTHING;
    units.forEach((u, i) => {
      if (!inGroup[i]) return;
      separate += u.p;
      inSets += paid[i]!;
    });
    if (total > 0) applied.push({ rule: ref(rule), kind: rule.kind, effect: 'setTier', amountMinor: total, separateMinor: separate, setMinor: inSets });
  }

  // ---- 3. discounts ----
  for (const { rule, action } of actions('discount')) {
    if (action.type !== 'discount') continue;
    if (action.requiresCoupon && !f.couponRuleIds.includes(rule.id)) {
      waiting.push({ rule: ref(rule), why: 'COUPON' });
      continue;
    }
    const amount = valueOf<number>(rule, action.param);
    if (amount === null || amount <= 0) continue;
    const eligible = lines.filter((s) => inScope(rule.scope, s.fact) && lineAccepts(s, rule.stackable));
    if (!eligible.length) continue;
    const min = action.minSubtotalParam ? valueOf<number>(rule, action.minSubtotalParam) : null;
    const eligibleTotal = sum(eligible.map(net));
    if (min !== null && eligibleTotal < min) {
      waiting.push({ rule: ref(rule), why: 'MIN_SUBTOTAL' });
      continue;
    }
    let cuts: number[];
    if (action.mode === 'percent') {
      const pct = Math.min(amount, limits.maxPercentOff);
      cuts = action.target === 'lines' ? eligible.map((s) => Math.floor((net(s) * pct) / 100)) : spread(Math.floor((eligibleTotal * pct) / 100), eligible.map(net));
    } else {
      cuts = action.target === 'lines' ? eligible.map((s) => Math.min(net(s), amount * s.fact.quantity)) : spread(Math.min(amount, eligibleTotal), eligible.map(net));
    }
    const max = action.maxParam ? valueOf<number>(rule, action.maxParam) : null;
    if (max !== null && sum(cuts) > max) cuts = spread(max, cuts);
    let total = NOTHING;
    eligible.forEach((s, i) => {
      const c = Math.max(NOTHING, Math.min(cuts[i]!, net(s)));
      if (c <= 0) return;
      s.discount += c;
      s.offers.push({ rule: ref(rule), kind: 'discount', amountMinor: c, stackable: rule.stackable });
      total += c;
    });
    if (total > 0) applied.push({ rule: ref(rule), kind: rule.kind, effect: 'discount', amountMinor: total });
  }

  const lineQuotes: LineQuote[] = lines.map((s) => ({
    id: s.fact.id,
    quantity: s.fact.quantity,
    unitPriceMinor: s.fact.unitPriceMinor,
    baseMinor: s.base,
    discountMinor: s.discount,
    finalMinor: s.base - s.discount,
    offers: s.offers,
  }));
  const subtotalMinor = sum(lineQuotes.map((l) => l.baseMinor));
  const discountMinor = sum(lineQuotes.map((l) => l.discountMinor));
  const itemsMinor = subtotalMinor - discountMinor;
  const inScopeItems = (r: Rule) => sum(lines.filter((s) => inScope(r.scope, s.fact)).map(net));
  const allInScope = (r: Rule) => lines.length > 0 && lines.every((s) => inScope(r.scope, s.fact));

  // ---- 4. delivery ----
  const delivery: DeliveryQuote = { bandKey: f.bandKey, baseChargeMinor: null, chargeMinor: null, free: false, reason: 'NO_BAND', freeOverMinor: null, remainingMinor: null, chargeRule: null, freeRule: null };
  const charge = actions('deliveryCharge').find(({ action }) => action.type === 'deliveryCharge' && f.bandKey !== null && (action.byBand[f.bandKey] ?? action.byBand['*']) !== undefined);
  if (f.bandKey !== null) {
    if (charge && charge.action.type === 'deliveryCharge') {
      delivery.chargeRule = ref(charge.rule);
      delivery.baseChargeMinor = valueOf<number>(charge.rule, (charge.action.byBand[f.bandKey] ?? charge.action.byBand['*'])!);
      delivery.reason = delivery.baseChargeMinor === null ? 'NOT_SET' : 'CHARGED';
    } else delivery.reason = 'NO_RULE';
  }
  const campaign = actions('freeDelivery').find(({ rule }) => allInScope(rule));
  const over = actions('freeDeliveryOver').find(({ action, rule }) => action.type === 'freeDeliveryOver' && valueOf<number>(rule, action.param) !== null);
  if (over && over.action.type === 'freeDeliveryOver') {
    delivery.freeOverMinor = valueOf<number>(over.rule, over.action.param);
  }
  if (campaign) {
    delivery.free = true;
    delivery.reason = 'FREE_CAMPAIGN';
    delivery.freeRule = ref(campaign.rule);
  } else if (over && delivery.freeOverMinor !== null && lines.length && inScopeItems(over.rule) >= delivery.freeOverMinor) {
    delivery.free = true;
    delivery.reason = 'FREE_OVER';
    delivery.freeRule = ref(over.rule);
  } else if (lines.length && lines.every((s) => s.fact.freeDelivery === true)) {
    delivery.free = true;
    delivery.reason = 'FREE_PRODUCTS';
  } else if (over && delivery.freeOverMinor !== null) {
    delivery.remainingMinor = Math.max(NOTHING, delivery.freeOverMinor - inScopeItems(over.rule));
  }
  if (delivery.free) delivery.chargeMinor = NOTHING;
  else if (delivery.reason === 'CHARGED') delivery.chargeMinor = delivery.baseChargeMinor;
  if (delivery.chargeRule && delivery.chargeMinor !== null) applied.push({ rule: delivery.chargeRule, kind: 'delivery', effect: 'deliveryCharge', amountMinor: delivery.chargeMinor });
  if (delivery.freeRule) applied.push({ rule: delivery.freeRule, kind: live.find((r) => r.id === delivery.freeRule!.id)!.kind, effect: 'freeDelivery', amountMinor: delivery.baseChargeMinor });

  const totalKnown = delivery.chargeMinor !== null;
  const totalMinor = itemsMinor + (delivery.chargeMinor ?? NOTHING);

  // ---- 5. COD and cut-offs ----
  const cod: CodQuote = { allowed: null, maxOrderMinor: null, reason: 'NO_RULE', rule: null };
  const codHit = actions('cod')[0];
  if (codHit && codHit.action.type === 'cod') {
    cod.rule = ref(codHit.rule);
    const allowed = valueOf<boolean>(codHit.rule, codHit.action.allowedParam);
    cod.maxOrderMinor = codHit.action.maxOrderParam ? valueOf<number>(codHit.rule, codHit.action.maxOrderParam) : null;
    if (allowed === null) cod.reason = 'NOT_SET';
    else if (allowed && cod.maxOrderMinor !== null && totalMinor > cod.maxOrderMinor) {
      cod.allowed = false;
      cod.reason = 'OVER_MAX';
    } else {
      cod.allowed = allowed;
      cod.reason = 'RULE';
    }
    if (cod.allowed !== null) applied.push({ rule: cod.rule, kind: codHit.rule.kind, effect: 'cod', amountMinor: null });
  }

  const cutoffs: CutoffQuote[] = [];
  const seenBands = new Set<string>();
  for (const { rule, action } of actions('cutoff')) {
    if (action.type !== 'cutoff') continue;
    for (const [band, param] of Object.entries(action.byBand)) {
      if (f.bandKey !== null && band !== '*' && band !== f.bandKey) continue;
      if (seenBands.has(band)) continue;
      const at = valueOf<string>(rule, param);
      if (!at) continue;
      seenBands.add(band);
      cutoffs.push({ rule: ref(rule), bandKey: band, at, passed: f.now >= new Date(at) });
    }
  }
  if (cutoffs.length) for (const c of cutoffs) if (!applied.some((a) => a.rule.id === c.rule.id && a.effect === 'cutoff')) applied.push({ rule: c.rule, kind: 'festive', effect: 'cutoff', amountMinor: null });

  return { lines: lineQuotes, subtotalMinor, discountMinor, itemsMinor, delivery, cod, cutoffs, totalMinor, totalKnown, applied, waiting };
}

// ---------------------------------------------------------------------------------------------------------------
// Policies other stages read (exchange S08, order edits S04, fulfilment S05/S20)
// ---------------------------------------------------------------------------------------------------------------

export interface ExchangeTerms {
  rule: RuleRef;
  /** The product is covered by the exchange rule (not in its "except"). */
  covered: boolean;
  windowHours: number | null;
  perItem: number | null;
  /** Exchange delivery charge for the band; null = not set or unknown band. */
  chargeMinor: number | null;
  reasons: readonly string[];
  freeWhenOurMistake: boolean;
}

/** PR 211 — the exchange terms for one product and band, from the first live exchange rule. null = no live rule. */
export function exchangeTerms(rules: readonly Rule[], product: ScopeFacts, bandKey: string | null, now: Date): ExchangeTerms | null {
  const live = rules.filter((r) => isLive(r, now) && r.actions.some((a) => a.type === 'exchangePolicy')).sort(resolutionOrder);
  for (const r of live) {
    const a = r.actions.find((x) => x.type === 'exchangePolicy');
    if (!a || a.type !== 'exchangePolicy') continue;
    const chargeParam = bandKey ? (a.chargeByBand?.[bandKey] ?? a.chargeByBand?.['*']) : undefined;
    return {
      rule: ref(r),
      covered: inScope(r.scope, product),
      windowHours: valueOf<number>(r, a.windowParam),
      perItem: a.perItemParam ? valueOf<number>(r, a.perItemParam) : null,
      chargeMinor: chargeParam ? valueOf<number>(r, chargeParam) : null,
      reasons: a.reasons,
      freeWhenOurMistake: a.freeWhenOurMistake,
    };
  }
  return null;
}

/** May the customer still ask for an exchange? (the "Request exchange" button hides itself after the window, B1.8) */
export function exchangeOpen(terms: ExchangeTerms | null, deliveredAt: Date | null, now: Date): boolean {
  if (!terms || !terms.covered || terms.windowHours === null || !deliveredAt) return false;
  return now.getTime() < deliveredAt.getTime() + terms.windowHours * 3_600_000;
}

/** A value of a live rule by rule key and param key (B1.13 fulfilment exception rules, order edits …). */
export function liveValue<T = unknown>(rules: readonly Rule[], ruleKey: string, param: string, now: Date): T | null {
  const r = rules.find((x) => x.key === ruleKey && isLive(x, now));
  return r ? valueOf<T>(r, param) : null;
}
