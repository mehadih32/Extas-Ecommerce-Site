// PR 106–114 — everything the bag page and the added-to-bag panel draw, in one read: the lines with their pictures'
// facts, the set lines with their pieces (PR 108), the two-sizes groups (PR 110), the order summary priced by the rules
// engine (PR 111), the code box's state with the better-offer reason (PR 112), free-delivery progress (PR 113), the
// one offer slot and the tier ladder (PR 109), the saved lines (PR 107) and the products the upsell row starts from
// (PR 114). Money is the engines' only: the rules engine (quoteCart) prices every line, set tiers, discounts, the
// coupon and delivery; the combos engine (bagSets) gives each set's locked price and saving. Nothing here invents an
// amount: rows are added up from what the engines returned.
import { bagSets, liveSetTiers, productFacts, setSummary, type BagSet, type ProductFact } from '@extas/combos';
import { cachedActiveRules, inScope, liveRuleValue, quoteCart, ruleTextFor, ruleTextsFor, scopeFacts, type CartQuote } from '@extas/rules';
import { sizeAnswersOf } from './cart';
import { checkStoreId, nowOf, setting, type CartDeps } from './context';
import { answerFor, codeStateOf, inDays, ladderOf, offerSlotOf, sizeGroups, type CodeState, type Ladder, type OfferSlot, type SizeAnswer, type SizeGroup } from './pure';

export type BagLang = 'en' | 'bn';

export interface Named {
  nameEn: string;
  nameBn: string | null;
}

export interface BagColour extends Named {
  id: string;
  key: string;
  hex: string;
}

export interface BagItem extends Named {
  lineId: string;
  variantId: string;
  productId: string;
  slug: string;
  categoryId: string | null;
  colour: BagColour | null;
  size: { id: string; label: string } | null;
  quantity: number;
  /** The variant's price now. */
  unitPriceMinor: number;
  /** The price when it went into the bag (the bag says when it has changed). */
  addedPriceMinor: number;
  /** quantity × price, from the quote. */
  lineMinor: number;
  /** Pieces that can be sold now of this variant, for the + button and the low-stock line. */
  sellable: number;
  /** The most this line can hold now (stock left after the rest of the bag, and the per-line limit). */
  maxQuantity: number;
  /** Colours for this size, each with its variant (null = not made) and whether the stock covers the line. */
  colours: (BagColour & { variantId: string | null; ok: boolean })[];
  /** Sizes for this colour, likewise. */
  sizes: { id: string; label: string; variantId: string | null; ok: boolean }[];
  /** Not on sale any more (unpublished, no price): it cannot go to checkout. */
  unavailable: boolean;
}

export interface BagSetView extends Named {
  groupKey: string;
  /** A line of the set: the API takes the whole set by any of its lines. */
  lineId: string;
  slug: string;
  pieces: (Named & { lineId: string; productId: string | null; slug: string | null; colour: BagColour | null; size: string | null })[];
  payMinor: number;
  regularMinor: number;
  savingMinor: number;
  note: BagSet['note'];
}

export interface SummaryRow extends Named {
  kind: 'item' | 'set';
  lineId: string;
  size: string | null;
  quantity: number;
  amountMinor: number;
  /** A set: its pieces at their own prices, and what it saves. */
  regularMinor?: number;
  savingMinor?: number;
}

export interface OfferRow {
  ruleKey: string;
  kind: 'setTier' | 'discount';
  /** The rule's own name (set tiers) or short text (discounts), in both languages when written. */
  label: { en: string | null; bn: string | null };
  /** The code that unlocked it, if any. */
  code: string | null;
  amountMinor: number;
}

export interface BagSummary {
  rows: SummaryRow[];
  /** Pieces in the bag. */
  count: number;
  subtotalMinor: number;
  offers: OfferRow[];
  /** The rules engine says delivery is free for this bag. */
  freeDelivery: boolean;
  /** What the customer pays for the items (delivery is added at checkout when it is not free). */
  totalMinor: number;
  youSaveMinor: number;
}

export interface FreeDelivery {
  free: boolean;
  reason: CartQuote['delivery']['reason'];
  freeOverMinor: number | null;
  remainingMinor: number | null;
  /** Share of the way to the threshold, 0–100. */
  progress: number;
  /** The free-delivery rule's own words for this moment ("Add ৳300 more …" / "You've got free delivery"). */
  line: string | null;
}

export interface BagTierBox extends Named {
  ruleKey: string;
  /** The category of the bag item it starts from (its words: "Buy more polos, pay less"; its page: "Pick your polos"). */
  category: (Named & { slug: string }) | null;
  ladder: Ladder;
  inBag: number;
}

export interface BagView {
  cartId: string | null;
  items: BagItem[];
  sets: BagSetView[];
  saved: { items: BagItem[]; sets: BagSetView[] };
  groups: (SizeGroup & { answer: SizeAnswer | null; name: Named })[];
  summary: BagSummary;
  code: CodeState;
  free: FreeDelivery;
  slot: OfferSlot;
  tiers: BagTierBox | null;
  /** The rules' exchange or policy line for the bag (shown under the two-sizes card), in the asked language. */
  policyLine: string | null;
  /** Products in the bag (and saved), for the upsell row to leave out; the first ones' categories lead it. */
  productIds: string[];
  /** A line cannot go to checkout (sold out since it went in, or not on sale). */
  blocked: { lineId: string; reason: 'STOCK' | 'NOT_FOR_SALE'; free: number }[];
  /** The rules' word on Cash on Delivery for this bag (S04 checkout): null `allowed` = no rule, the store setting decides. */
  cod: CartQuote['cod'];
}

const EMPTY_SUMMARY: BagSummary = { rows: [], count: 0, subtotalMinor: 0, offers: [], freeDelivery: false, totalMinor: 0, youSaveMinor: 0 };

/** The empty bag: what the page draws with no bag yet (and with no database, CI). */
export const emptyBag = (): BagView => ({
  cartId: null,
  items: [],
  sets: [],
  saved: { items: [], sets: [] },
  groups: [],
  summary: EMPTY_SUMMARY,
  code: { state: 'none' },
  free: { free: false, reason: 'NO_RULE', freeOverMinor: null, remainingMinor: null, progress: 0, line: null },
  slot: null,
  tiers: null,
  policyLine: null,
  productIds: [],
  blocked: [],
  cod: { allowed: null, maxOrderMinor: null, reason: 'NO_RULE', rule: null },
});

const localeOf = (lang: BagLang) => (lang === 'bn' ? 'bn-BD' : 'en-BD');

const colourOf = (p: ProductFact | undefined, id: string | null): BagColour | null => {
  const c = id ? p?.colours.find((x) => x.id === id) : undefined;
  return c ? { id: c.id, key: c.key, nameEn: c.nameEn, nameBn: c.nameBn, hex: c.hex } : null;
};

/** The bag, read and priced. `customerId` is the signed-in customer (the code box's members-only check). */
export async function bagView(
  deps: CartDeps,
  input: {
    storeId: number;
    cartId: string | null;
    lang: BagLang;
    customerId?: string | null;
    /** The checkout (S04) knows more than the bag: the band the address was read as and the payment chosen, for rules on them. */
    bandKey?: string | null;
    paymentMethod?: string | null;
  },
): Promise<BagView> {
  checkStoreId(input.storeId);
  if (!input.cartId) return emptyBag();
  const cart = await deps.db.cart.findFirst({ where: { id: input.cartId, storeId: input.storeId, status: 'ACTIVE' }, select: { id: true, couponCode: true, sizeAnswers: true } });
  if (!cart) return emptyBag();
  const storeId = input.storeId;
  const lineRows = await deps.db.cartItem.findMany({
    where: { storeId, cartId: cart.id, removedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, variantId: true, quantity: true, unitPriceMinor: true, comboGroupKey: true, savedForLater: true },
  });
  const variantRows = await deps.db.productVariant.findMany({
    where: { storeId, id: { in: [...new Set(lineRows.map((r) => r.variantId))] } },
    select: { id: true, productId: true, colourId: true, sizeId: true, priceMinor: true, active: true, archivedAt: true, product: { select: { categoryId: true, status: true, archivedAt: true } } },
  });
  const variantById = new Map(variantRows.map((v) => [v.id, v]));
  const rows = lineRows.flatMap((r) => {
    const variant = variantById.get(r.variantId);
    return variant ? [{ ...r, variant }] : [];
  });
  const [allSets, maxLine] = await Promise.all([bagSets(deps, { storeId, cartId: cart.id }), setting(deps, storeId, 'inventory.reservation.maxUnitsPerLine')]);
  const productIds = [...new Set([...rows.map((r) => r.variant.productId), ...allSets.flatMap((s) => s.lines.map((l) => l.productId).filter((x): x is string => !!x))])];
  const facts = await productFacts(deps, storeId, productIds);

  // ---- the lines, with what each can still become ----
  const held = new Map<string, number>();
  for (const r of rows) if (!r.savedForLater) held.set(r.variantId, (held.get(r.variantId) ?? 0) + r.quantity);
  const itemOf = (r: (typeof rows)[number], lineMinor: number | null): BagItem => {
    const p = facts.get(r.variant.productId);
    const own = p?.variants.find((v) => v.id === r.variantId);
    const sellable = own?.sellable ?? 0;
    const others = (held.get(r.variantId) ?? 0) - (r.savedForLater ? 0 : r.quantity);
    const freeFor = (variantId: string | null) => {
      if (!variantId) return 0;
      const v = p?.variants.find((x) => x.id === variantId);
      return Math.max(0, (v?.sellable ?? 0) - (held.get(variantId) ?? 0));
    };
    const size = p?.sizes.find((s) => s.id === r.variant.sizeId);
    const variantFor = (colourId: string | null, sizeId: string | null) => p?.variants.find((v) => v.colourId === colourId && v.sizeId === sizeId && v.priceMinor !== null)?.id ?? null;
    const unavailable = !r.variant.active || r.variant.archivedAt !== null || r.variant.priceMinor === null || r.variant.product.status !== 'PUBLISHED' || r.variant.product.archivedAt !== null;
    return {
      lineId: r.id,
      variantId: r.variantId,
      productId: r.variant.productId,
      slug: p?.slug ?? '',
      nameEn: p?.nameEn ?? '',
      nameBn: p?.nameBn ?? null,
      categoryId: r.variant.product.categoryId,
      colour: colourOf(p, r.variant.colourId),
      size: size ? { id: size.id, label: size.label } : null,
      quantity: r.quantity,
      unitPriceMinor: r.variant.priceMinor ?? r.unitPriceMinor,
      addedPriceMinor: r.unitPriceMinor,
      lineMinor: lineMinor ?? (r.variant.priceMinor ?? r.unitPriceMinor) * r.quantity,
      sellable,
      maxQuantity: Math.max(r.quantity, Math.min(maxLine, sellable - Math.max(0, others))),
      colours: (p?.colours ?? []).map((c) => {
        const id = variantFor(c.id, r.variant.sizeId);
        return { id: c.id, key: c.key, nameEn: c.nameEn, nameBn: c.nameBn, hex: c.hex, variantId: id, ok: id === r.variantId || freeFor(id) >= r.quantity };
      }),
      sizes: (p?.sizes ?? []).map((s) => {
        const id = variantFor(r.variant.colourId, s.id);
        return { id: s.id, label: s.label, variantId: id, ok: id === r.variantId || freeFor(id) >= r.quantity };
      }),
      unavailable,
    };
  };
  const loose = rows.filter((r) => !r.comboGroupKey && !r.savedForLater);
  const setOf = (s: BagSet): BagSetView => ({
    groupKey: s.groupKey,
    lineId: s.lines[0]!.id,
    slug: s.slug,
    nameEn: s.nameEn,
    nameBn: s.nameBn,
    pieces: s.lines.map((l) => {
      const p = l.productId ? facts.get(l.productId) : undefined;
      return { lineId: l.id, productId: l.productId, slug: p?.slug ?? null, nameEn: p?.nameEn ?? '', nameBn: p?.nameBn ?? null, colour: colourOf(p, l.colourId), size: p?.sizes.find((x) => x.id === l.sizeId)?.label ?? null };
    }),
    payMinor: s.payMinor,
    regularMinor: s.regularMinor,
    savingMinor: s.savingMinor,
    note: s.note,
  });
  const liveSets = allSets.filter((s) => !s.savedForLater);
  const setPieces = rows.filter((r) => r.comboGroupKey && !r.savedForLater && liveSets.some((s) => s.groupKey === r.comboGroupKey));

  // ---- the quote: every line in the bag, priced by the rules engine ----
  const quote = await quoteCart(deps, {
    storeId,
    lines: [...loose.map((r) => ({ id: r.id, variantId: r.variantId, quantity: r.quantity })), ...setPieces.map((r) => ({ id: r.id, variantId: r.variantId, quantity: r.quantity, comboId: r.comboGroupKey }))],
    couponCode: cart.couponCode,
    customerId: input.customerId ?? null,
    bandKey: input.bandKey ?? null,
    paymentMethod: input.paymentMethod ?? null,
    locale: localeOf(input.lang),
    source: 'website',
  });
  const lineQuote = new Map(quote.lines.map((l) => [l.id, l]));
  const items = loose.map((r) => itemOf(r, lineQuote.get(r.id)?.baseMinor ?? null));
  const sets = liveSets.map(setOf);

  // ---- the summary (PR 111): one row per item and per set, then the offers the engine applied ----
  const summaryRows: SummaryRow[] = [
    ...items.map((i) => ({ kind: 'item' as const, lineId: i.lineId, nameEn: i.nameEn, nameBn: i.nameBn, size: i.size?.label ?? null, quantity: i.quantity, amountMinor: i.lineMinor })),
    ...sets.map((s) => ({ kind: 'set' as const, lineId: s.lineId, nameEn: s.nameEn, nameBn: s.nameBn, size: null, quantity: 1, amountMinor: s.payMinor, regularMinor: s.regularMinor, savingMinor: s.savingMinor })),
  ];
  const tierRules = await liveSetTiers(deps, { storeId });
  const couponRuleId = quote.coupon?.ok ? quote.coupon.ruleId : null;
  const offers: OfferRow[] = [];
  for (const a of quote.applied) {
    if ((a.effect !== 'setTier' && a.effect !== 'discount') || !a.amountMinor) continue;
    const tier = a.effect === 'setTier' ? tierRules.find((r) => r.ruleId === a.rule.id) : undefined;
    const [en, bn] = tier
      ? [tier.nameEn, tier.nameBn]
      : await Promise.all(['en-BD', 'bn-BD'].map(async (locale) => (await ruleTextFor(deps, { storeId, key: a.rule.key, slot: 'badge', locale })) ?? (await ruleTextFor(deps, { storeId, key: a.rule.key, slot: 'short', locale }))));
    offers.push({ ruleKey: a.rule.key, kind: a.effect, label: { en: en ?? null, bn: bn ?? null }, code: a.rule.id === couponRuleId ? quote.coupon!.code : null, amountMinor: a.amountMinor });
  }
  const subtotalMinor = summaryRows.reduce((s, r) => s + r.amountMinor, 0);
  const offMinor = offers.reduce((s, o) => s + o.amountMinor, 0);
  const setSaving = sets.reduce((s, x) => s + x.savingMinor, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0) + sets.reduce((s, x) => s + x.pieces.length, 0);
  const summary: BagSummary = {
    rows: summaryRows,
    count,
    subtotalMinor,
    offers,
    freeDelivery: quote.delivery.free,
    totalMinor: subtotalMinor - offMinor,
    youSaveMinor: offMinor + setSaving,
  };

  // ---- the code box (PR 112) ----
  let moreMinor: number | null = null;
  const waitingMin = couponRuleId ? quote.waiting.find((w) => w.rule.id === couponRuleId && w.why === 'MIN_SUBTOTAL') : undefined;
  if (waitingMin) {
    const rule = (await cachedActiveRules(deps, storeId)).find((r) => r.id === couponRuleId);
    const action = rule?.actions.find((x) => x.type === 'discount');
    const param = action && action.type === 'discount' ? action.minSubtotalParam : undefined;
    const min = param ? await liveRuleValue<number>(deps, { storeId, ruleKey: waitingMin.rule.key, param }) : null;
    const looseFinal = items.reduce((s, i) => s + (lineQuote.get(i.lineId)?.finalMinor ?? i.lineMinor), 0);
    if (typeof min === 'number') moreMinor = Math.max(0, min - looseFinal);
  }
  const referral = quote.coupon && !quote.coupon.ok && quote.coupon.reason === 'UNKNOWN' ? (await deps.db.referral.findFirst({ where: { storeId, code: quote.coupon.code }, select: { id: true } })) !== null : false;
  const code = codeStateOf({
    code: cart.couponCode,
    check: quote.coupon,
    appliedMinor: offers.filter((o) => o.code).reduce((s, o) => s + o.amountMinor, 0),
    moreMinor,
    setApplied: sets.length > 0 || quote.applied.some((a) => a.effect === 'setTier'),
    otherApplied: quote.applied.some((a) => a.effect === 'discount' && a.rule.id !== couponRuleId),
    referral,
  });

  // ---- free delivery (PR 113) ----
  const d = quote.delivery;
  const free: FreeDelivery = {
    free: d.free,
    reason: d.reason,
    freeOverMinor: d.freeOverMinor,
    remainingMinor: d.remainingMinor,
    progress: d.free ? 100 : d.freeOverMinor && d.remainingMinor !== null ? Math.min(100, Math.floor(((d.freeOverMinor - d.remainingMinor) * 100) / d.freeOverMinor)) : 0,
    line: quote.deliveryLine,
  };

  // ---- the two-sizes groups (PR 110) ----
  const answers = sizeAnswersOf(cart.sizeAnswers);
  const twoSizesOn = await setting(deps, storeId, 'bag.twoSizes.enabled');
  const groups = twoSizesOn
    ? sizeGroups(
        items.flatMap((i) => {
          const p = facts.get(i.productId);
          const s = i.size ? p?.sizes.find((x) => x.id === i.size!.id) : undefined;
          return s ? [{ lineId: i.lineId, productId: i.productId, colourId: i.colour?.id ?? null, sizeId: s.id, sizeOrder: s.order, sizeLabel: s.label }] : [];
        }),
      ).map((g) => ({ ...g, answer: answerFor(g, answers), name: { nameEn: facts.get(g.productId)?.nameEn ?? '', nameBn: facts.get(g.productId)?.nameBn ?? null } }))
    : [];
  const policy = groups.length ? (await ruleTextsFor(deps, { storeId, placement: 'bag', locale: localeOf(input.lang) })).find((r) => r.kind === 'exchange' || r.kind === 'policy') : undefined;

  // ---- the tier ladder and the offer slot (PR 109) ----
  const tiers = await tierBox(deps, storeId, items, tierRules);
  const slotOn = await setting(deps, storeId, 'bag.offerSlot.enabled');
  const slot = slotOn ? offerSlotOf({ set: await setOffer(deps, storeId, items, sets), delivery: { free: d.free, remainingMinor: d.remainingMinor, hasFreeRule: d.freeRule !== null || d.reason === 'FREE_CAMPAIGN' } }) : null;

  // ---- what cannot go to checkout ----
  const blocked: BagView['blocked'] = [];
  for (const i of items) {
    if (i.unavailable) blocked.push({ lineId: i.lineId, reason: 'NOT_FOR_SALE', free: 0 });
    else if ((held.get(i.variantId) ?? 0) > i.sellable) blocked.push({ lineId: i.lineId, reason: 'STOCK', free: Math.max(0, i.sellable - ((held.get(i.variantId) ?? 0) - i.quantity)) });
  }

  return {
    cartId: cart.id,
    items,
    sets,
    saved: { items: rows.filter((r) => !r.comboGroupKey && r.savedForLater).map((r) => itemOf(r, null)), sets: allSets.filter((s) => s.savedForLater).map(setOf) },
    groups,
    summary,
    code,
    free,
    slot,
    tiers,
    policyLine: policy?.texts.short ?? null,
    productIds,
    blocked,
    cod: quote.cod,
  };
}

/** The "take more, pay less" box: the first live set-tier rule that covers a loose item in the bag. */
async function tierBox(deps: CartDeps, storeId: number, items: readonly BagItem[], rules: Awaited<ReturnType<typeof liveSetTiers>>): Promise<BagTierBox | null> {
  if (!items.length || !rules.length) return null;
  const [on, startsOn, endsOn, max, timeZone] = await Promise.all([
    setting(deps, storeId, 'bag.tiers.enabled'),
    setting(deps, storeId, 'bag.tiers.startsOn'),
    setting(deps, storeId, 'bag.tiers.endsOn'),
    setting(deps, storeId, 'bag.tiers.max'),
    setting(deps, storeId, 'store.timeZone'),
  ]);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(nowOf(deps));
  if (!on || !inDays(today, startsOn, endsOn)) return null;
  const facts = await scopeFacts(deps.db, storeId, [...new Set(items.map((i) => i.productId))]);
  for (const i of items) {
    const f = facts.get(i.productId);
    const rule = f ? rules.find((r) => inScope(r.scope, f)) : undefined;
    if (!rule) continue;
    const inBag = items.filter((x) => facts.get(x.productId) && inScope(rule.scope, facts.get(x.productId)!)).reduce((s, x) => s + x.quantity, 0);
    const ladder = ladderOf({ tiers: rule.tiers, unitPriceMinor: i.unitPriceMinor, inBag, max });
    if (!ladder) continue;
    const cat = i.categoryId ? await deps.db.category.findFirst({ where: { id: i.categoryId, storeId }, select: { slug: true, nameEn: true, nameBn: true } }) : null;
    return { ruleKey: rule.key, nameEn: rule.nameEn, nameBn: rule.nameBn, category: cat ? { slug: cat.slug, nameEn: cat.nameEn, nameBn: cat.nameBn } : null, ladder, inBag };
  }
  return null;
}

/** A set on sale that holds something in the bag, is not in the bag already and saves money (the slot's first choice). */
async function setOffer(deps: CartDeps, storeId: number, items: readonly BagItem[], sets: readonly BagSetView[]): Promise<Extract<OfferSlot, { kind: 'set' }> | null> {
  if (!items.length) return null;
  const inBag = new Set(sets.map((s) => s.slug));
  const rows = await deps.db.combo.findMany({
    where: { storeId, archivedAt: null, status: 'RUNNING', items: { some: { productId: { in: items.map((i) => i.productId) } } } },
    orderBy: [{ sortRank: 'desc' }, { createdAt: 'asc' }],
    select: { slug: true },
    take: 6,
  });
  for (const r of rows) {
    if (inBag.has(r.slug)) continue;
    const s = await setSummary(deps, { storeId, slug: r.slug }).catch(() => null);
    if (!s || !s.onSale || s.price.payMinor === null || s.price.savingMinor <= 0) continue;
    return { kind: 'set', slug: s.slug, nameEn: s.nameEn, nameBn: s.nameBn, pieces: s.pieceCount, payMinor: s.price.payMinor, savingMinor: s.price.savingMinor, names: s.pieces.map((p) => p.labelEn || p.nameEn || '').filter(Boolean), namesBn: s.pieces.map((p) => p.labelBn || p.nameBn || p.labelEn || p.nameEn || '').filter(Boolean) };
  }
  return null;
}
