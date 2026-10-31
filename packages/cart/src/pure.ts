// The bag's pure rules (no database): which lines make a "same product in two sizes" group and what the order flag is
// (PR 110, SIM-F-036), the one offer slot's choice (PR 109), the "take more, pay less" ladder (PR 109), how many
// recommendations fit in the added-to-bag panel (PR 106, CN-012), and the code box's state (PR 112).
// Every amount here is one the engines worked out; these functions only choose what to say.

// ---------------------------------------------------------------------------------------------------------------
// PR 110 · the same product in two (or more) neighbouring sizes
// ---------------------------------------------------------------------------------------------------------------

/** The customer's answer: one is for someone else, keep them all, or help me pick. */
export const SIZE_ANSWERS = ['other', 'keep', 'help'] as const;
export type SizeAnswer = (typeof SIZE_ANSWERS)[number];

export interface SizeLine {
  lineId: string;
  productId: string;
  colourId: string | null;
  sizeId: string;
  /** The size's place in the product's size order (0 = smallest). */
  sizeOrder: number;
  sizeLabel: string;
}

export interface SizeGroup {
  /** `product|colour|size+size…` (sizes sorted), the key the answer is kept under. */
  key: string;
  productId: string;
  colourId: string | null;
  /** In size order. */
  sizes: { sizeId: string; label: string }[];
  lineIds: string[];
  /** The last of its lines in the bag's order: the card goes right after it. */
  lastLineId: string;
}

const groupKey = (productId: string, colourId: string | null, sizeIds: readonly string[]) => `${productId}|${colourId ?? ''}|${[...sizeIds].sort().join('+')}`;

/**
 * The size groups of a bag: the same product in the same colour in neighbouring sizes. A run of three or more (a
 * family buying S, M and L) is ONE group, never two overlapping pairs (SIM-F-036). Lines are in the bag's order.
 */
export function sizeGroups(lines: readonly SizeLine[]): SizeGroup[] {
  const byItem = new Map<string, SizeLine[]>();
  for (const l of lines) {
    const k = `${l.productId}|${l.colourId ?? ''}`;
    byItem.set(k, [...(byItem.get(k) ?? []), l]);
  }
  const out: SizeGroup[] = [];
  for (const ls of byItem.values()) {
    const sizes = [...new Map(ls.map((l) => [l.sizeId, l])).values()].sort((a, b) => a.sizeOrder - b.sizeOrder);
    let run: SizeLine[] = [];
    const flush = () => {
      if (run.length >= 2) {
        const ids = new Set(run.map((s) => s.sizeId));
        const inRun = ls.filter((l) => ids.has(l.sizeId));
        out.push({
          key: groupKey(run[0]!.productId, run[0]!.colourId, [...ids]),
          productId: run[0]!.productId,
          colourId: run[0]!.colourId,
          sizes: run.map((s) => ({ sizeId: s.sizeId, label: s.sizeLabel })),
          lineIds: inRun.map((l) => l.lineId),
          lastLineId: inRun[inRun.length - 1]!.lineId,
        });
      }
      run = [];
    };
    for (const s of sizes) {
      if (run.length && s.sizeOrder !== run[run.length - 1]!.sizeOrder + 1) flush();
      run.push(s);
    }
    flush();
  }
  const pos = new Map(lines.map((l, i) => [l.lineId, i]));
  return out.sort((a, b) => pos.get(a.lastLineId)! - pos.get(b.lastLineId)!);
}

/**
 * The answer that holds for a group: its own, or one given for a smaller group of the same product and colour inside
 * it (a family that said "for different people" for S and M and then adds L is not asked again).
 */
export function answerFor(group: SizeGroup, answers: Readonly<Record<string, SizeAnswer>>): SizeAnswer | null {
  if (answers[group.key]) return answers[group.key]!;
  const mine = new Set(group.sizes.map((s) => s.sizeId));
  for (const [key, a] of Object.entries(answers)) {
    const [p, c, sizes] = key.split('|');
    if (p !== group.productId || (c || null) !== group.colourId || !sizes) continue;
    const theirs = sizes.split('+');
    if (theirs.length >= 2 && theirs.every((s) => mine.has(s)) && a !== 'help') return a;
  }
  return null;
}

export interface SizeFlag {
  key: string;
  productId: string;
  colourId: string | null;
  sizes: string[];
}

/**
 * The order's "2 sizes — check" flags for the team (checkout, S05, puts them on the order). A group the customer said
 * is for different people carries no flag (SIM-F-036); every other group carries one, once.
 */
export function sizeFlags(groups: readonly SizeGroup[], answers: Readonly<Record<string, SizeAnswer>>): SizeFlag[] {
  return groups.filter((g) => answerFor(g, answers) !== 'other').map((g) => ({ key: g.key, productId: g.productId, colourId: g.colourId, sizes: g.sizes.map((s) => s.label) }));
}

// ---------------------------------------------------------------------------------------------------------------
// PR 109 · the "take more, pay less" ladder
// ---------------------------------------------------------------------------------------------------------------

export interface LadderInput {
  /** Priced tiers of one live set-tier rule, as the combos package gives them. */
  tiers: readonly { quantity: number; priceMinor: number }[];
  /** The bag item the ladder is for: its own price (the saving is said against it). */
  unitPriceMinor: number;
  /** Pieces in the bag the rule covers (loose items only: set lines keep their own price). */
  inBag: number;
  /** `bag.tiers.max`. */
  max: number;
}

export interface Ladder {
  rows: { quantity: number; priceMinor: number; saveMinor: number | null }[];
  /** The next tier up and how many more pieces reach it; null when the top tier is reached. */
  next: { quantity: number; priceMinor: number; more: number } | null;
  /** Pieces in the bag over the top tier's pieces, as a whole percentage (the bar). */
  progress: number;
}

/** The ladder rows, the next step and the bar. A saving that is not a saving (0 or less) is not said. */
export function ladderOf(i: LadderInput): Ladder | null {
  const tiers = [...i.tiers].filter((t) => t.quantity >= 2 && t.priceMinor > 0).sort((a, b) => a.quantity - b.quantity).slice(0, Math.max(1, i.max));
  if (!tiers.length) return null;
  const rows = tiers.map((t) => {
    const save = i.unitPriceMinor * t.quantity - t.priceMinor;
    return { quantity: t.quantity, priceMinor: t.priceMinor, saveMinor: save > 0 ? save : null };
  });
  const up = tiers.find((t) => t.quantity > i.inBag) ?? null;
  const top = tiers[tiers.length - 1]!.quantity;
  return { rows, next: up ? { quantity: up.quantity, priceMinor: up.priceMinor, more: up.quantity - i.inBag } : null, progress: Math.min(100, Math.floor((Math.max(0, i.inBag) * 100) / top)) };
}

/** Is a day (`YYYY-MM-DD`) inside the window? Empty ends are open; the last day still counts. */
export function inDays(today: string, startsOn: string | null, endsOn: string | null): boolean {
  return (!startsOn || today >= startsOn) && (!endsOn || today <= endsOn);
}

// ---------------------------------------------------------------------------------------------------------------
// PR 109 · the one offer slot under the lines (never between products, never an empty box)
// ---------------------------------------------------------------------------------------------------------------

export type OfferSlot =
  | { kind: 'set'; slug: string; nameEn: string; nameBn: string | null; pieces: number; payMinor: number; savingMinor: number; names: string[]; namesBn: string[] }
  | { kind: 'freeGap'; remainingMinor: number }
  | { kind: 'freeDone' }
  | null;

/**
 * What the slot says: a set that saves money on something in the bag; otherwise how much more for free delivery;
 * otherwise that delivery is already free. With none of these true, nothing (the slot is not drawn).
 */
export function offerSlotOf(i: {
  set: Exclude<OfferSlot, null | { kind: 'freeGap' } | { kind: 'freeDone' }> | null;
  delivery: { free: boolean; remainingMinor: number | null; hasFreeRule: boolean };
}): OfferSlot {
  if (i.set && i.set.savingMinor > 0) return i.set;
  if (!i.delivery.free && i.delivery.remainingMinor !== null && i.delivery.remainingMinor > 0) return { kind: 'freeGap', remainingMinor: i.delivery.remainingMinor };
  if (i.delivery.free && i.delivery.hasFreeRule) return { kind: 'freeDone' };
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// PR 106 · the panel's recommendation fill rule (CN-012)
// ---------------------------------------------------------------------------------------------------------------

/**
 * How many recommendation rows fit: rows start at least `gap` px under the buttons and must end inside the panel; the
 * rest are counted in "+N more". `fixed` shows that many (no more than there are); `off` none.
 */
export function picksThatFit(i: { mode: 'fit' | 'fixed' | 'off'; count: number; available: number; rowHeights: readonly number[]; gap: number; rowGap: number; perRow: number }): { shown: number; more: number } {
  const total = Math.min(i.count, i.rowHeights.length * Math.max(1, i.perRow));
  if (i.mode === 'off' || total <= 0) return { shown: 0, more: 0 };
  if (i.mode === 'fixed') return { shown: total, more: 0 };
  let used = i.gap;
  let rows = 0;
  for (const h of i.rowHeights) {
    const next = used + (rows ? i.rowGap : 0) + h;
    if (next > i.available) break;
    used = next;
    rows++;
  }
  const shown = Math.min(total, rows * Math.max(1, i.perRow));
  return { shown, more: total - shown };
}

// ---------------------------------------------------------------------------------------------------------------
// PR 112 · the code box
// ---------------------------------------------------------------------------------------------------------------

/** What the code box says about a typed code. Each reason has its own words in the shop dictionary (`bag.code.*`). */
export type CodeState =
  | { state: 'none' }
  | { state: 'applied'; code: string; amountMinor: number }
  /** The code works but asks for a bigger order: "Add ৳X more to use CODE". */
  | { state: 'needsMore'; code: string; moreMinor: number }
  /** The code works, but a set price or another offer saves more; offers are not combined. */
  | { state: 'betterOffer'; code: string; by: 'set' | 'offer' }
  /** The code works, but none of the items in the bag are covered. */
  | { state: 'notForItems'; code: string }
  | { state: 'refused'; code: string; reason: CodeRefusal };

// PR 213 follow-up (SIM-F-050): FIRST_ORDER_ONLY, a first-order code for a number that ordered before
export type CodeRefusal = 'UNKNOWN' | 'OFF' | 'NOT_STARTED' | 'ENDED' | 'USED_UP' | 'PER_CUSTOMER' | 'MEMBERS_ONLY' | 'GUESTS_ONLY' | 'FIRST_ORDER_ONLY' | 'RULE_NOT_LIVE' | 'REFERRAL';

/** The quote's facts about the code, in the shape the pure rule reads. */
export interface CodeFacts {
  code: string | null;
  check: { ok: boolean; reason: string | null; ruleId: string | null } | null;
  /** The code's rule took this much off. */
  appliedMinor: number;
  /** The rule waits for a bigger order: how much more (null = not waiting for that). */
  moreMinor: number | null;
  /** A set price applied in the bag (set tiers or set lines). */
  setApplied: boolean;
  /** Another discount applied to the items the code would cover. */
  otherApplied: boolean;
  /** The code matches a friend's invite code (referral) rather than a coupon. */
  referral: boolean;
}

export function codeStateOf(f: CodeFacts): CodeState {
  if (!f.code) return { state: 'none' };
  const code = f.code;
  if (!f.check) return { state: 'refused', code, reason: 'UNKNOWN' };
  if (!f.check.ok) {
    if (f.check.reason === 'UNKNOWN' && f.referral) return { state: 'refused', code, reason: 'REFERRAL' };
    return { state: 'refused', code, reason: (f.check.reason ?? 'UNKNOWN') as CodeRefusal };
  }
  if (f.appliedMinor > 0) return { state: 'applied', code, amountMinor: f.appliedMinor };
  if (f.moreMinor !== null && f.moreMinor > 0) return { state: 'needsMore', code, moreMinor: f.moreMinor };
  if (f.setApplied) return { state: 'betterOffer', code, by: 'set' };
  if (f.otherApplied) return { state: 'betterOffer', code, by: 'offer' };
  return { state: 'notForItems', code };
}
