// PR 44 — the flash sale as data, ready to draw (demo 20-home.js hm_flash, hm_flashRows; Blueprint §56.1, §57.1,
// §58.1, §58.11): whether a sale is running now, which cards it shows, how they fill the two rows that slide past each
// other, the "Up to N% off" tag, and the clock. Plain functions over the settings (`home.flashSale`, `home.flashRows`)
// and the cards, so the rules are unit-tested and the components only draw.
//
// Honesty: a card's struck price is only ever the PR 38 rule's (`wasMinor`); the tag is worked out from those same
// prices, never typed in; a sale with no end has no clock and does not run; the clock counts down to the owner's own end
// time and never restarts (§58.11: the demo's clock was a painted-on string that reset on every render).
import type { HomeFlashRows, HomeFlashSale } from '@extas/settings';
import type { ShopCard } from './catalogue';

/** The sale's window in epoch milliseconds, when it is running at `now`; null when it is off, not begun or over. */
export function flashRunning(sale: HomeFlashSale | null, now: number): { startsAt: number | null; endsAt: number } | null {
  if (!sale || !sale.on) return null;
  const endsAt = Date.parse(sale.endsAt);
  const startsAt = sale.startsAt ? Date.parse(sale.startsAt) : null;
  if (!Number.isFinite(endsAt) || endsAt <= now) return null;
  if (startsAt !== null && (!Number.isFinite(startsAt) || startsAt > now)) return null;
  return { startsAt, endsAt };
}

/** A card's saving in whole per cent (0 when the PR 38 rule gave it no struck price). */
export function flashOff(card: Pick<ShopCard, 'priceMinor' | 'wasMinor'>): number {
  if (card.priceMinor == null || card.wasMinor == null || card.wasMinor <= card.priceMinor) return 0;
  return Math.round((1 - card.priceMinor / card.wasMinor) * 100);
}

/** H3 · the cards the sale shows: priced ones, and with `onlyMarkdowns` only those with a real struck price. */
export function flashPick(cards: readonly ShopCard[], rows: Pick<HomeFlashRows, 'onlyMarkdowns'>): ShopCard[] {
  return cards.filter((c) => c.priceMinor != null && (!rows.onlyMarkdowns || flashOff(c) > 0));
}

/** The tag's number: the biggest saving among the cards shown (0 = no tag). */
export function flashUpTo(cards: readonly Pick<ShopCard, 'priceMinor' | 'wasMinor'>[]): number {
  return cards.reduce((m, c) => Math.max(m, flashOff(c)), 0);
}

/** One sliding row: its cards, and which of them only repeat a card shown already (hidden from screen readers and Tab). */
export interface FlashRow {
  cards: ShopCard[];
  copies: boolean[];
}

/**
 * The two rows (§57.1, §58.1). A long sale is split: row one slides through the first `perRow` cards, row two through
 * the next `perRow` (with 100 sale products, about ten each). A short one cannot fill two rows that glide, so — as in the
 * approved demo — both rows carry every card, repeated up to `fillTo`, the second row starting half-way along so the two
 * never show the same card side by side; then the repeats and the whole second row are copies. One card: one row.
 */
export function flashRows(cards: readonly ShopCard[], rows: Pick<HomeFlashRows, 'perRow' | 'fillTo'>): FlashRow[] {
  const list = cards.slice(0, rows.perRow * 2);
  const n = list.length;
  if (!n) return [];
  if (n === 1) return [{ cards: [list[0]!], copies: [false] }];
  const half = Math.ceil(n / 2);
  if (half >= rows.fillTo) {
    const a = list.slice(0, half);
    const b = list.slice(half);
    return [
      { cards: a, copies: a.map(() => false) },
      { cards: b, copies: b.map(() => false) },
    ];
  }
  const size = Math.max(rows.fillTo, n);
  const a: ShopCard[] = [];
  const b: ShopCard[] = [];
  for (let i = 0; i < size; i++) {
    a.push(list[i % n]!);
    b.push(list[(i + half) % n]!);
  }
  return [
    { cards: a, copies: a.map((_, i) => i >= n) },
    { cards: b, copies: b.map(() => true) },
  ];
}

// ---- the clock ----

/** The clock's three numbers (hours in all, minutes, seconds; two digits at least) for the time left. */
export function clockParts(msLeft: number): { h: string; m: string; s: string; hours: number; minutes: number } {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return { h: two(hours), m: two(minutes), s: two(seconds), hours, minutes };
}

/** A phone whose clock is wrong by more than this is not trusted: the server's time is used instead. */
export const CLOCK_TRUST_MS = 60_000;

/**
 * When the clock reaches zero, on this phone's own clock. The server says what time it was when it drew the page; a
 * phone within `CLOCK_TRUST_MS` of that (the page's trip and the script's load) counts down to the end itself, and a
 * phone set wrong counts down the time the server said was left — so a wrong phone clock never shows a wrong sale.
 */
export function clockDeadline(endsAt: number, serverNow: number, clientNow: number, trustMs = CLOCK_TRUST_MS): number {
  const skew = clientNow - serverNow;
  return Math.abs(skew) <= trustMs ? endsAt : endsAt + skew;
}

/** How long until the shown seconds change (just past the next whole second of the time left), at least a frame. */
export function nextTickMs(msLeft: number): number {
  return Math.max(16, (msLeft % 1000) + 5);
}
