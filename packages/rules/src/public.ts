// PR 210–216 — what the storefront asks of the rules, as plain server functions (the storefront's routes and pages are
// built by their own owner; these are what they call). No permission: they read only what customers may see — live
// rules, switched-on notices — and never return a draft, a value that is not set, or a text with a token left in it.
//
//   ruleTextsFor     the rule texts for one place (product page, bag, checkout, FAQ …), optionally for one product
//   ruleTextFor      one rule's text by key and slot ("Exchange within 72 hours for size or fault")
//   quoteCart        a cart priced by the engine: set tiers, discounts, coupon, delivery, COD, cut-offs, and the
//                    free-delivery progress line ("Add ৳300 more for free delivery") — prices from the database
//   exchangeTermsFor the exchange terms for a product and band (S08 reads it; the button hides after the window)
//   liveRuleValue    one value of a live rule (order edits, held orders … other stages read it)
//   discountWasFor   a variant's price with its live discount and the honest struck "was" price, if any (PR 213)
//                    (PR 609: quoteCart and discountWasFor give each line its selling-price floor, so no offer goes
//                    below the buying price + `catalogue.floor.minMarginPercent`; off while that is empty)
//   liveNotices      the notices and pop-ups for one place, filled in, with the pop-up limits
//   policyFillerFor  PR 384: fills the owner's policy texts from the live rules (`{rule-key.param}`)
import { checkCoupon, type CouponCheck } from './coupons-service';
import { cached } from './cache';
import { nowOf, setting, textContext, type RulesDeps } from './context';
import { cachedActiveRules, langContext, othersByKey } from './core';
import { clockFacts, exchangeTerms, floorMinorOf, liveValue, quote, type ExchangeTerms, type Quote } from './engine';
import { bandChargeOf, scopeFacts } from './facts';
import { inScope, resolutionOrder } from './match';
import { isLive, TEXT_SLOTS, type Rule, type TextSlot } from './model';
import { capSchema, ctaSchema, placementSchema, timingSchema } from './notices-model';
import { renderNotice } from './notices-service';
import { fillPolicyText, langOf, ruleText, type Resolved } from './text';
import { discountWasPrice, setWasPrice, type DiscountWasReason, type WasSource } from './was-price';

export interface PublicRuleText {
  key: string;
  kind: string;
  /** Every written slot that is complete, in the asked language (English when the Bengali is not written). */
  texts: Partial<Record<TextSlot, string>>;
}

async function ctxFor(deps: RulesDeps, storeId: number, locale?: string) {
  const ctx = await textContext(deps, storeId, locale);
  return langContext(ctx, langOf(ctx.locale));
}

function textsOf(rule: Rule, ctx: Awaited<ReturnType<typeof ctxFor>>, rules: readonly Rule[], runtime?: Record<string, Resolved>): Partial<Record<TextSlot, string>> {
  const out: Partial<Record<TextSlot, string>> = {};
  const others = othersByKey(rules);
  for (const slot of TEXT_SLOTS) {
    const r = ruleText(rule, slot, ctx, { others, runtime });
    if (r?.ok) out[slot] = r.text;
  }
  return out;
}

/** The live rules' texts for one place; with a product, only the rules that cover it. */
export async function ruleTextsFor(deps: RulesDeps, input: { storeId: number; placement: string; locale?: string; productId?: string | null }): Promise<PublicRuleText[]> {
  const now = nowOf(deps);
  const rules = (await cachedActiveRules(deps, input.storeId)).filter((r) => isLive(r, now));
  const ctx = await ctxFor(deps, input.storeId, input.locale);
  if (input.productId && !UUID.test(input.productId)) return [];
  const facts = input.productId ? (await scopeFacts(deps.db, input.storeId, [input.productId])).get(input.productId) : undefined;
  return rules
    .filter((r) => r.placements.includes(input.placement) && (!facts || inScope(r.scope, facts)))
    .sort((a, b) => a.kind.localeCompare(b.kind) || resolutionOrder(a, b))
    .map((r) => ({ key: r.key, kind: r.kind, texts: textsOf(r, ctx, rules) }))
    .filter((t) => t.texts.short !== undefined);
}

/** One rule's text, or null when the rule is not live or the text is not complete. */
export async function ruleTextFor(deps: RulesDeps, input: { storeId: number; key: string; slot: TextSlot; locale?: string; runtime?: Record<string, Resolved> }): Promise<string | null> {
  const now = nowOf(deps);
  const rules = (await cachedActiveRules(deps, input.storeId)).filter((r) => isLive(r, now));
  const rule = rules.find((r) => r.key === input.key);
  if (!rule) return null;
  const r = ruleText(rule, input.slot, await ctxFor(deps, input.storeId, input.locale), { others: othersByKey(rules), runtime: input.runtime });
  return r?.ok ? r.text : null;
}

/**
 * PR 384 — fills the owner's policy texts (help pages) from the live rules: `{rule-key.param}` becomes the rule's
 * value in the asked language; a line that cannot be filled is left out (text.ts `fillPolicyText`).
 */
export async function policyFillerFor(deps: RulesDeps, input: { storeId: number; locale?: string }): Promise<(text: string) => string> {
  const now = nowOf(deps);
  const rules = (await cachedActiveRules(deps, input.storeId)).filter((r) => isLive(r, now));
  const ctx = await ctxFor(deps, input.storeId, input.locale);
  const others = othersByKey(rules);
  return (text) => fillPolicyText(text, others, ctx);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CartLineInput {
  id?: string;
  variantId: string;
  quantity: number;
  comboId?: string | null;
}

export interface CartQuote extends Quote {
  coupon: CouponCheck | null;
  /** "Add ৳300 more for free delivery" / "You've got free delivery" from the free-delivery rule; null = nothing to say. */
  deliveryLine: string | null;
  /** Lines whose variant is unknown, inactive or has no price: left out of the quote. */
  skipped: string[];
  /** Each set tier that applied, with its honest struck price: the sum of the pieces' separate prices (CN-009). */
  setWas: { ruleKey: string; setMinor: number; wasMinor: number | null; reason: DiscountWasReason }[];
}

/** A cart priced by the live rules. Prices come from the database, never from the browser. */
export async function quoteCart(
  deps: RulesDeps,
  input: {
    storeId: number;
    lines: CartLineInput[];
    bandKey?: string | null;
    paymentMethod?: string | null;
    couponCode?: string | null;
    /**
     * Review R2 (M2): the code an order already redeemed (its CouponRedemption), when an order is priced again by the
     * team. It counts as unlocked and is not checked again — the order's own use would otherwise refuse it.
     */
    redeemedCoupon?: { couponId: string; code: string; ruleId: string | null } | null;
    phone?: string | null;
    customerId?: string | null;
    deliveredOrders?: number | null;
    source?: string | null;
    locale?: string;
  },
): Promise<CartQuote> {
  const now = nowOf(deps);
  const [rules, maxPercentOff, timeZone, wasAllowed, bandChargeMinor, floorPercent, roundingStepMinor] = await Promise.all([
    cachedActiveRules(deps, input.storeId),
    setting(deps, input.storeId, 'rules.discount.maxPercentOff'),
    setting(deps, input.storeId, 'store.timeZone'),
    setting(deps, input.storeId, 'rules.discount.showWasPrice'),
    // Follow-up 54: the engine's delivery figure is the band's own, the one the checkout charges.
    bandChargeOf(deps.db, input.storeId, input.bandKey ?? null),
    // PR 609: the store's lowest margin over the buying price (null = the floor is off).
    setting(deps, input.storeId, 'catalogue.floor.minMarginPercent'),
    // review R1 (M5): a percentage cut is rounded so the total stays collectable
    setting(deps, input.storeId, 'checkout.money.roundingStepMinor'),
  ]);
  const variants = await deps.db.productVariant.findMany({
    where: { storeId: input.storeId, id: { in: input.lines.map((l) => l.variantId).filter((id) => UUID.test(id)) }, archivedAt: null, active: true },
    select: { id: true, productId: true, priceMinor: true, shopPriceMinor: true },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  const facts = await scopeFacts(deps.db, input.storeId, variants.map((v) => v.productId));
  const skipped: string[] = [];
  const lines = input.lines.flatMap((l, i) => {
    const v = byId.get(l.variantId);
    if (!v || v.priceMinor === null || !Number.isInteger(l.quantity) || l.quantity < 1) {
      skipped.push(l.id ?? l.variantId);
      return [];
    }
    const f = facts.get(v.productId)!;
    return [{ id: l.id ?? `line-${i}`, variantId: v.id, unitPriceMinor: v.priceMinor, quantity: l.quantity, productId: v.productId, categoryIds: f.categoryIds, collectionIds: f.collectionIds, freeDelivery: f.freeDelivery, comboId: l.comboId ?? null, floorMinor: floorMinorOf(v.shopPriceMinor, floorPercent) }];
  });
  const redeemed = input.redeemedCoupon ?? null;
  const coupon: CouponCheck | null = redeemed
    ? { ok: true, reason: null, couponId: redeemed.couponId, ruleId: redeemed.ruleId, code: redeemed.code }
    : input.couponCode?.trim()
      ? await checkCoupon(deps.db, { storeId: input.storeId, code: input.couponCode, phone: input.phone, customerId: input.customerId, now })
      : null;
  const clock = clockFacts(now, timeZone);
  const q = quote(
    rules,
    {
      now,
      lines,
      bandKey: input.bandKey ?? null,
      ...(bandChargeMinor !== undefined ? { bandChargeMinor } : {}),
      paymentMethod: input.paymentMethod ?? null,
      couponCode: coupon?.ok ? coupon.code : null,
      couponRuleIds: coupon?.ok && coupon.ruleId ? [coupon.ruleId] : [],
      customer: { loggedIn: !!input.customerId, deliveredOrders: input.deliveredOrders ?? null },
      source: input.source ?? null,
      weekday: clock.weekday,
      hour: clock.hour,
    },
    { maxPercentOff, roundingStepMinor },
  );
  let deliveryLine: string | null = null;
  const freeRule = q.delivery.freeRule ? rules.find((r) => r.id === q.delivery.freeRule!.id) : rules.filter((r) => isLive(r, now) && r.actions.some((a) => a.type === 'freeDeliveryOver')).sort(resolutionOrder)[0];
  if (freeRule) {
    const ctx = await ctxFor(deps, input.storeId, input.locale);
    const slot: TextSlot | null = q.delivery.free ? 'unlocked' : q.delivery.remainingMinor !== null && q.delivery.remainingMinor > 0 ? 'progress' : null;
    if (slot) {
      const r = ruleText(freeRule, slot, ctx, { others: othersByKey(rules), runtime: { remaining: { type: 'money', value: q.delivery.remainingMinor } } });
      deliveryLine = r?.ok ? r.text : null;
    }
  }
  const setWas = q.applied.flatMap((a) => {
    if (a.effect !== 'setTier' || a.setMinor === undefined) return [];
    const w = setWasPrice({ allowed: wasAllowed, live: true, separateMinor: a.separateMinor ?? null, setMinor: a.setMinor });
    return [{ ruleKey: a.rule.key, setMinor: a.setMinor, wasMinor: w.wasMinor, reason: w.reason }];
  });
  return { ...q, coupon, deliveryLine, skipped, setWas };
}

export async function exchangeTermsFor(deps: RulesDeps, input: { storeId: number; productId: string; bandKey?: string | null }): Promise<ExchangeTerms | null> {
  if (!UUID.test(input.productId)) return null;
  const rules = await cachedActiveRules(deps, input.storeId);
  const facts = (await scopeFacts(deps.db, input.storeId, [input.productId])).get(input.productId)!;
  return exchangeTerms(rules, facts, input.bandKey ?? null, nowOf(deps));
}

export async function liveRuleValue<T = unknown>(deps: RulesDeps, input: { storeId: number; ruleKey: string; param: string }): Promise<T | null> {
  return liveValue<T>(await cachedActiveRules(deps, input.storeId), input.ruleKey, input.param, nowOf(deps));
}

export interface DiscountWas {
  priceMinor: number;
  discountedMinor: number;
  wasMinor: number | null;
  reason: DiscountWasReason | 'NO_DISCOUNT';
  /** Where a shown struck price comes from (MRP, or the real earlier price when the item has no MRP). */
  source: WasSource | null;
  ruleKey: string | null;
}

/** A variant's price with its live (coupon-free) discount, and the struck price only when it is honest (PR 213). */
export async function discountWasFor(deps: RulesDeps, input: { storeId: number; variantId: string }): Promise<DiscountWas | null> {
  const now = nowOf(deps);
  if (!UUID.test(input.variantId)) return null;
  const v = await deps.db.productVariant.findFirst({ where: { id: input.variantId, storeId: input.storeId, archivedAt: null }, select: { id: true, productId: true, priceMinor: true, compareAtMinor: true, shopPriceMinor: true } });
  if (!v || v.priceMinor === null) return null;
  const [rules, maxPercentOff, allowed, lookbackDays, floorPercent, roundingStepMinor] = await Promise.all([
    cachedActiveRules(deps, input.storeId),
    setting(deps, input.storeId, 'rules.discount.maxPercentOff'),
    setting(deps, input.storeId, 'rules.discount.showWasPrice'),
    setting(deps, input.storeId, 'rules.discount.wasLookbackDays'),
    setting(deps, input.storeId, 'catalogue.floor.minMarginPercent'),
    setting(deps, input.storeId, 'checkout.money.roundingStepMinor'),
  ]);
  const f = (await scopeFacts(deps.db, input.storeId, [v.productId])).get(v.productId)!;
  const q = quote(
    rules.filter((r) => r.actions.some((a) => a.type === 'discount' && a.target === 'lines' && !a.requiresCoupon && !a.minSubtotalParam)),
    { now, lines: [{ id: v.id, variantId: v.id, unitPriceMinor: v.priceMinor, quantity: 1, ...f, floorMinor: floorMinorOf(v.shopPriceMinor, floorPercent) }], bandKey: null, paymentMethod: null, couponCode: null, couponRuleIds: [], customer: { loggedIn: false, deliveredOrders: null }, source: null, weekday: null, hour: null },
    { maxPercentOff, roundingStepMinor },
  );
  const line = q.lines[0]!;
  const offer = line.offers.find((o) => o.kind === 'discount');
  if (!offer) return { priceMinor: v.priceMinor, discountedMinor: v.priceMinor, wasMinor: null, reason: 'NO_DISCOUNT', source: null, ruleKey: null };
  const rule = rules.find((r) => r.id === offer.rule.id)!;
  const action = rule.actions.find((a) => a.type === 'discount');
  const history = await deps.db.priceHistory.findMany({ where: { storeId: input.storeId, variantId: v.id }, select: { priceMinor: true, effectiveFrom: true }, orderBy: { effectiveFrom: 'asc' } });
  const was = discountWasPrice({
    allowed,
    showWas: action?.type === 'discount' && action.showWas,
    startsAt: rule.startsAt,
    endsAt: rule.endsAt,
    live: isLive(rule, now),
    discountedMinor: line.finalMinor,
    mrpMinor: v.compareAtMinor,
    history,
    lookbackDays,
    now,
  });
  return { priceMinor: v.priceMinor, discountedMinor: line.finalMinor, wasMinor: was.wasMinor, reason: was.reason, source: was.source, ruleKey: rule.key };
}

export interface PublicNotice {
  id: string;
  key: string | null;
  kind: string;
  title: string | null;
  content: string;
  cta: { label: string; href: string } | null;
  position: string | null;
  timing: unknown;
  frequencyCap: unknown;
  priority: number;
}

export interface PublicNotices {
  notices: PublicNotice[];
  /** The pop-up limits the component applies (C11.5). */
  popup: { maxPerVisit: number; searchHosts: string[] };
}

/** The switched-on notices for one place, filled in. A notice with a token left without a value is not shown. */
export async function liveNotices(deps: RulesDeps, input: { storeId: number; placement: string; locale?: string }): Promise<PublicNotices> {
  const now = nowOf(deps);
  const [seconds, maxBars, maxPerVisit, searchHosts] = await Promise.all([
    setting(deps, input.storeId, 'rules.public.cacheSeconds'),
    setting(deps, input.storeId, 'notices.bar.maxShown'),
    setting(deps, input.storeId, 'notices.popup.maxPerVisit'),
    setting(deps, input.storeId, 'notices.popup.searchHosts'),
  ]);
  const rows = await cached(`notices@${input.storeId}`, seconds * 1000, now.getTime(), () => deps.db.notice.findMany({ where: { storeId: input.storeId, enabled: true, archivedAt: null }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] }));
  const rules = (await cachedActiveRules(deps, input.storeId)).filter((r) => isLive(r, now));
  const ctx = await ctxFor(deps, input.storeId, input.locale);
  const bn = langOf(ctx.locale) === 'bn';
  const out: PublicNotice[] = [];
  let bars = 0;
  for (const n of rows) {
    if ((n.startsAt && n.startsAt > now) || (n.endsAt && n.endsAt <= now)) continue;
    const place = placementSchema.safeParse(n.placement);
    if (!place.success || !(place.data.pages.includes('all') || place.data.pages.includes(input.placement))) continue;
    // A notice tied to a rule shows only while that rule is live.
    const rule = n.ruleId ? rules.find((r) => r.id === n.ruleId) : undefined;
    if (n.ruleId && !rule) continue;
    const content = renderNotice(bn && n.contentBn ? n.contentBn : n.contentEn, rule, rules, ctx);
    const titleSrc = bn && n.titleBn ? n.titleBn : n.titleEn;
    const title = titleSrc ? renderNotice(titleSrc, rule, rules, ctx) : null;
    if (content.missing.length || content.unknown.length || (title && (title.missing.length || title.unknown.length))) continue;
    if (n.kind === 'bar' && ++bars > maxBars) continue;
    const cta = n.cta ? ctaSchema.safeParse(n.cta) : null;
    out.push({
      id: n.id,
      key: n.key,
      kind: n.kind,
      title: title?.text ?? null,
      content: content.text,
      cta: cta?.success ? { label: bn && cta.data.labelBn ? cta.data.labelBn : cta.data.labelEn, href: cta.data.href } : null,
      position: place.data.position ?? null,
      timing: n.timing && timingSchema.safeParse(n.timing).success ? n.timing : null,
      frequencyCap: n.frequencyCap && capSchema.safeParse(n.frequencyCap).success ? n.frequencyCap : null,
      priority: n.priority,
    });
  }
  return { notices: out, popup: { maxPerVisit, searchHosts } };
}
