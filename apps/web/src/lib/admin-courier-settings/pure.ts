// PR 1010 (admin prototype v5 m-settings.js `renderCouriers`) — the pure part of Settings › Couriers: what the Fees box shows for a courier
// (one charge per delivery band and one cash fee) read from the courier's open rate cards, and the changes a Save makes to them.
// A rate card is ended, never edited or deleted (Money › Costs & fees): a changed charge ends the old card and adds a new one from now,
// with the same weight band, so the past stays as it was. A courier with several weight bands keeps them all; the box edits the
// lightest band of each delivery band (the one a plain parcel falls in) and the cash fee on every card.
// No React, no database.

/** The three delivery bands the page shows, in the prototype's order. */
export const FEE_ZONES = ['inside', 'sub', 'outside'] as const;
export type FeeZone = (typeof FEE_ZONES)[number];

export interface OpenCard {
  id: string;
  zoneKey: string;
  weightFromGrams: number;
  weightToGrams: number;
  chargeMinor: number;
  codFeeBps: number | null;
  returnChargeMinor: number | null;
}

/** The delivery band key of each of the three zones (settings `delivery.bands.*Key`). */
export type ZoneKeys = Record<FeeZone, string>;

export interface Fees {
  /** Minor units per zone; null: no rate for that band yet. */
  charge: Record<FeeZone, number | null>;
  /** Cash fee in percent (two decimals at most); null: none set. */
  codPct: number | null;
}

/** The lightest open card of a delivery band (null with none). */
export function lightest(cards: readonly OpenCard[], zoneKey: string): OpenCard | null {
  return [...cards.filter((c) => c.zoneKey === zoneKey)].sort((a, b) => a.weightFromGrams - b.weightFromGrams || a.id.localeCompare(b.id))[0] ?? null;
}

/** What the box shows for a courier: the charge of each band's lightest card, and the cash fee (the highest on its cards: they agree after a Save). */
export function feesOf(cards: readonly OpenCard[], keys: ZoneKeys): Fees {
  const bps = cards.map((c) => c.codFeeBps).filter((v): v is number => v !== null);
  return {
    charge: { inside: lightest(cards, keys.inside)?.chargeMinor ?? null, sub: lightest(cards, keys.sub)?.chargeMinor ?? null, outside: lightest(cards, keys.outside)?.chargeMinor ?? null },
    codPct: bps.length ? Math.max(...bps) / 100 : null,
  };
}

/** Percent typed ("1", "1.5", "0.75") to basis points, or null when it is not a number between 0 and the limit. */
export function pctToBps(v: unknown, maxPct: number): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > maxPct) return null;
  return Math.round(n * 100);
}

export interface NewCard {
  zoneKey: string;
  weightFromGrams: number;
  weightToGrams: number;
  chargeMinor: number;
  codFeeBps: number | null;
  returnChargeMinor: number | null;
}

export interface FeePlan {
  /** Cards to end now. */
  end: string[];
  /** Cards to add from now. */
  add: NewCard[];
}

/**
 * The change a Save makes: for each band, the lightest card takes the new charge (a band with no card gets one over
 * `[0, wholeRange]` grams); every open card takes the new cash fee. A card that already says it is left alone.
 */
export function planFees(cards: readonly OpenCard[], keys: ZoneKeys, want: { charge: Record<FeeZone, number>; codBps: number }, wholeRange: number): FeePlan {
  const end = new Set<string>();
  const add: NewCard[] = [];
  const target = new Map<string, number>();
  for (const z of FEE_ZONES) {
    const key = keys[z];
    const first = lightest(cards, key);
    if (first) target.set(first.id, want.charge[z]);
    else add.push({ zoneKey: key, weightFromGrams: 0, weightToGrams: wholeRange, chargeMinor: want.charge[z], codFeeBps: want.codBps, returnChargeMinor: null });
  }
  for (const c of cards) {
    const charge = target.get(c.id) ?? c.chargeMinor;
    if (charge === c.chargeMinor && c.codFeeBps === want.codBps) continue;
    end.add(c.id);
    add.push({ zoneKey: c.zoneKey, weightFromGrams: c.weightFromGrams, weightToGrams: c.weightToGrams, chargeMinor: charge, codFeeBps: want.codBps, returnChargeMinor: c.returnChargeMinor });
  }
  return { end: [...end], add };
}

/** Returned parcels as a share of the finished ones, in percent with one decimal (null with none finished). */
export function returnedPct(delivered: number, returned: number): number | null {
  const done = delivered + returned;
  return done > 0 ? Math.round((returned / done) * 1000) / 10 : null;
}
