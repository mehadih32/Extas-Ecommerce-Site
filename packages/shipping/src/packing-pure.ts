// PR 182 (Blueprint B1.3; BACKEND-ARCHITECTURE §5.3 ORD-04; CN-014c, SIM-F-010, follow-up 434) — the rules of the packing
// step without a database:
//
// - `PACK_STEPS` and `stepOf`: the screen's four steps, Pick (confirmed) → Pack (picking started) → Ready for courier
//   (packed) → Handed over; an order held at packing (PR 183) stays on the step it was held from.
// - `lineChecks` and `matchPiece`: each piece is checked against the order's lines — a scanned or typed code must be the
//   line's SKU or its variant's barcode (case and spaces ignored), and a line is checked once its pieces are all in; a
//   code that is on no line, or a line already complete, is refused and nothing is stored.
// - `weightGap`: the scale reading against the pieces' own weights; "big" only when it is off by more than both the
//   owner's percent and grams. No weight is ever guessed: a piece without one means nothing is compared.
// - `photoState` and `packBlock`: what still stops "Mark packed" — a line not checked, an open packing card, a
//   required photo missing (unless the owner waived it, SIM-F-010), a reading needed or a big gap not confirmed.
import type { PackingCheckSettings, PackingPhotoSettings, PackingWeightSettings } from '@extas/settings';

/** The packing screen's steps (the demo's chips). */
export const PACK_STEPS = ['pick', 'pack', 'ready', 'done'] as const;
export type PackStep = (typeof PACK_STEPS)[number];

/** The order states the packing screen lists (ON_HOLD only with a packing card, PR 183). */
export const PACK_STATES = ['CONFIRMED', 'PROCESSING', 'PACKED', 'HANDED_OVER'] as const;

/** The step an order is on; a held order is on the step it was held from (null: not on the packing screen). */
export function stepOf(status: string, holdFromStatus: string | null = null): PackStep | null {
  switch (status) {
    case 'CONFIRMED':
      return 'pick';
    case 'PROCESSING':
      return 'pack';
    case 'PACKED':
      return 'ready';
    case 'HANDED_OVER':
      return 'done';
    case 'ON_HOLD':
      return holdFromStatus === 'CONFIRMED' || holdFromStatus === 'PROCESSING' ? stepOf(holdFromStatus) : null;
    default:
      return null;
  }
}

/** The states where pieces are checked (picking started, or confirmed: the first scan is the pick). */
export const CHECKING_STATES = ['CONFIRMED', 'PROCESSING'] as const;

/** Upper-case, no spaces: how a scanned, typed or stored code is compared. */
export const codeKey = (code: string | null | undefined): string => (code ?? '').replace(/\s+/g, '').toUpperCase();

/** One active order line at the packing table. */
export interface PackLine {
  id: string;
  sku: string;
  /** The variant's barcode, when it has one (a scanner may read it instead of the SKU). */
  barcode: string | null;
  quantity: number;
}

export interface LineCheck {
  lineId: string;
  quantity: number;
  checked: number;
  done: boolean;
}

/** How many pieces of each line are checked. */
export function lineChecks(lines: readonly PackLine[], scans: readonly { orderItemId: string; quantity: number }[]): LineCheck[] {
  return lines.map((l) => {
    const checked = Math.min(
      l.quantity,
      scans.filter((s) => s.orderItemId === l.id).reduce((n, s) => n + s.quantity, 0),
    );
    return { lineId: l.id, quantity: l.quantity, checked, done: checked >= l.quantity };
  });
}

/** Every line checked. */
export const allChecked = (checks: readonly LineCheck[]): boolean => checks.length > 0 && checks.every((c) => c.done);

export type PieceRefusal = 'NOT_IN_ORDER' | 'ALREADY_CHECKED';

/**
 * The line a scanned or typed code checks one piece of: the first line with that SKU or barcode still missing a piece.
 * A code on no line is NOT_IN_ORDER; a code whose lines are all complete is ALREADY_CHECKED.
 */
export function matchPiece(lines: readonly PackLine[], checks: readonly LineCheck[], code: string): { lineId: string } | { refused: PieceRefusal } {
  const k = codeKey(code);
  if (!k) return { refused: 'NOT_IN_ORDER' };
  const hits = lines.filter((l) => codeKey(l.sku) === k || (l.barcode && codeKey(l.barcode) === k));
  if (!hits.length) return { refused: 'NOT_IN_ORDER' };
  const open = hits.find((l) => !checks.find((c) => c.lineId === l.id)?.done);
  return open ? { lineId: open.id } : { refused: 'ALREADY_CHECKED' };
}

export interface WeightGap {
  expectedGrams: number;
  weighedGrams: number;
  gapGrams: number;
  /** Rounded to one place. */
  gapPercent: number;
  big: boolean;
}

/** The reading against the pieces' weights (null when either is unknown). */
export function weightGap(expectedGrams: number | null, weighedGrams: number | null, cfg: Pick<PackingWeightSettings, 'gapPercent' | 'gapGrams'>): WeightGap | null {
  if (expectedGrams === null || weighedGrams === null || expectedGrams <= 0) return null;
  const gapGrams = Math.abs(weighedGrams - expectedGrams);
  const gapPercent = Math.round((gapGrams / expectedGrams) * 1000) / 10;
  return { expectedGrams, weighedGrams, gapGrams, gapPercent, big: gapGrams > cfg.gapGrams && gapPercent > cfg.gapPercent };
}

/** off: no photo step · ok: enough photos · waived: the owner let this order go without · missing: required, not
 * enough · reminder: asked for, nothing waits. */
export type PhotoState = 'off' | 'ok' | 'waived' | 'missing' | 'reminder';

export function photoState(cfg: PackingPhotoSettings, photos: number, waived: boolean): PhotoState {
  if (!cfg.enabled) return 'off';
  if (photos >= cfg.minPhotos) return 'ok';
  if (cfg.mode === 'reminder') return 'reminder';
  return waived ? 'waived' : 'missing';
}

/** Why "Mark packed" cannot run yet, in the order the packer meets them. */
export type PackBlock = 'NOT_CHECKED' | 'PACKING_ISSUE_OPEN' | 'PHOTO_REQUIRED' | 'WEIGHT_REQUIRED' | 'WEIGHT_GAP';

export interface PackFacts {
  check: PackingCheckSettings;
  checks: readonly LineCheck[];
  openIssues: number;
  photo: PhotoState;
  weight: PackingWeightSettings;
  /** The pieces' own weight (null: a piece has none). */
  expectedGrams: number | null;
  weighedGrams: number | null;
  weightConfirmed: boolean;
}

/** The first thing that stops "Mark packed", or null. */
export function packBlock(f: PackFacts): PackBlock | null {
  if (!allChecked(f.checks)) return 'NOT_CHECKED';
  if (f.openIssues > 0) return 'PACKING_ISSUE_OPEN';
  if (f.photo === 'missing') return 'PHOTO_REQUIRED';
  if (f.weight.enabled) {
    if (f.weighedGrams === null) return f.weight.requireReading ? 'WEIGHT_REQUIRED' : null;
    const gap = weightGap(f.expectedGrams, f.weighedGrams, f.weight);
    if (gap?.big && !f.weightConfirmed) return 'WEIGHT_GAP';
  }
  return null;
}

/** The start of the local day `days` days before `now` in the time zone (for the "Handed over" step). */
export function dayStart(now: Date, timeZone: string, days: number): Date {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(now);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const since = ((n('hour') * 60 + n('minute')) * 60 + n('second')) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - since - days * 86_400_000);
}

/** PR 411 — the instant a shop day (YYYY-MM-DD) starts in the time zone (the Pack screen's date filter). Read at the
 * day's UTC noon, which lies inside that local day for every zone within ±12 hours. */
export function localDayStart(day: string, timeZone: string): Date {
  return dayStart(new Date(`${day}T12:00:00.000Z`), timeZone, 0);
}
