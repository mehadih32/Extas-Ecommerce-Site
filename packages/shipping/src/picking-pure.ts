// PR 181 (Blueprint B1.6, B1.7) — the rules of the daily consolidated picking list without a database.
//
// - `pickingPlace`: which orders the list takes — every order still with us that has not gone to the courier, however
//   many days they span: approved and not booked yet (confirmed, picking or packed), or booked with the parcel still
//   with us (Steadfast "In Review"; a parcel the courier holds is never on the list, whatever dates are chosen). Held
//   orders and problem orders (a cancel asked, a duplicate or risk review open, the amount or receiver changed after
//   booking) are listed apart and left out of the quantities, so the picking quantity is never wrong.
// - `groupPicking`: the pieces grouped category → style → colour → size, the category with the most pieces first, in
//   it the style with the most pieces, then the colour, then the size with the highest quantity; a size row is short
//   when the shop's stock of that variant is less than the list needs (a variant the shop keeps no stock row for is
//   not counted, never marked short).
import { STILL_WITH_US, stickerProblem, type StickerFacts } from './fulfil-pure';

/** Why an order is listed apart and left out of the quantities. */
export const PICKING_HELD = ['ON_HOLD', 'CANCEL_ASKED', 'IN_REVIEW', 'COD_CHANGED', 'RECEIVER_CHANGED'] as const;
export type PickingHeld = (typeof PICKING_HELD)[number];

/** The order states that are approved and not dispatched (B1.6). */
export const PICKING_FROM = ['CONFIRMED', 'PROCESSING', 'PACKED'] as const;

/** A parcel state that means the shop still has the parcel (booking in flight, "In Review", waiting for pick-up, a cancel asked). */
const WITH_US_PARCEL = new Set<string>(['BOOKING', ...STILL_WITH_US, 'CANCEL_REQUESTED']);
/** A parcel that did not happen: the order is "approved, not booked". */
const NO_PARCEL = new Set<string>(['CANCELLED', 'BOOKING_FAILED']);

export interface PickingFacts {
  status: string;
  holdFromStatus: string | null;
  handedOver: boolean;
  cancelAsked: boolean;
  inReview: boolean;
  /** The order's parcels: their states, and the facts of the sticker for a booked one. */
  parcels: readonly (Omit<StickerFacts, 'handedOver'> & { status: string })[];
}

/** Whether the order is on the list ('take'), listed apart with its reason, or not on the list at all ('skip'). */
export function pickingPlace(f: PickingFacts): 'take' | 'skip' | PickingHeld {
  if (f.handedOver) return 'skip';
  const live = f.parcels.filter((p) => !NO_PARCEL.has(p.status));
  if (live.some((p) => !WITH_US_PARCEL.has(p.status))) return 'skip';
  if (f.status === 'ON_HOLD') return f.holdFromStatus && (PICKING_FROM as readonly string[]).includes(f.holdFromStatus) ? 'ON_HOLD' : 'skip';
  if (!(PICKING_FROM as readonly string[]).includes(f.status)) return 'skip';
  if (f.cancelAsked || live.some((p) => p.status === 'CANCEL_REQUESTED')) return 'CANCEL_ASKED';
  if (f.inReview) return 'IN_REVIEW';
  for (const p of live) {
    if (!(STILL_WITH_US as readonly string[]).includes(p.status) || !p.consignmentId) continue;
    const problem = stickerProblem(p);
    if (problem === 'COD_CHANGED' || problem === 'RECEIVER_CHANGED') return problem;
  }
  return 'take';
}

/** One order line on the list. */
export interface PickLine {
  /** The category's name (its key on the list); '' for none. */
  category: string;
  /** The style (the product): its key and its name. */
  styleKey: string;
  style: string;
  colour: string | null;
  size: string | null;
  variantId: string | null;
  quantity: number;
}

export interface PickSize {
  size: string | null;
  variantId: string | null;
  quantity: number;
  /** How many pieces the shop's stock is short of (0: enough, or stock not counted). */
  short: number;
}
export interface PickColour {
  colour: string | null;
  pieces: number;
  sizes: PickSize[];
}
export interface PickStyle {
  styleKey: string;
  style: string;
  pieces: number;
  colours: PickColour[];
}
export interface PickCategory {
  category: string;
  pieces: number;
  styles: PickStyle[];
}

const byPieces = <T extends { pieces: number }>(name: (x: T) => string) => (a: T, b: T) => b.pieces - a.pieces || name(a).localeCompare(name(b), 'en', { numeric: true });

/**
 * The lines grouped category → style → colour → size, most pieces first at every level (B1.6). `onHand`: the shop's
 * stock per variant it keeps stock for (a variant not in it is not checked); null leaves shortages out.
 */
export function groupPicking(lines: readonly PickLine[], onHand: ReadonlyMap<string, number> | null): PickCategory[] {
  const cats = new Map<string, Map<string, { style: string; colours: Map<string, Map<string, PickSize>> }>>();
  for (const l of lines) {
    if (l.quantity <= 0) continue;
    const styles = cats.get(l.category) ?? new Map();
    cats.set(l.category, styles);
    const st = styles.get(l.styleKey) ?? { style: l.style, colours: new Map() };
    styles.set(l.styleKey, st);
    const colourKey = l.colour ?? '';
    const sizes = st.colours.get(colourKey) ?? new Map<string, PickSize>();
    st.colours.set(colourKey, sizes);
    const sizeKey = l.variantId ?? `${l.size ?? ''}`;
    const row = sizes.get(sizeKey) ?? { size: l.size, variantId: l.variantId, quantity: 0, short: 0 };
    row.quantity += l.quantity;
    sizes.set(sizeKey, row);
  }
  const out: PickCategory[] = [];
  for (const [category, styles] of cats) {
    const list: PickStyle[] = [];
    for (const [styleKey, st] of styles) {
      const colours: PickColour[] = [];
      for (const [colourKey, sizes] of st.colours) {
        const rows = [...sizes.values()].map((r) => ({ ...r, short: onHand && r.variantId && onHand.has(r.variantId) ? Math.max(0, r.quantity - onHand.get(r.variantId)!) : 0 }));
        rows.sort((a, b) => b.quantity - a.quantity || (a.size ?? '').localeCompare(b.size ?? '', 'en', { numeric: true }));
        colours.push({ colour: colourKey || null, pieces: rows.reduce((n, r) => n + r.quantity, 0), sizes: rows });
      }
      colours.sort(byPieces((c) => c.colour ?? ''));
      list.push({ styleKey, style: st.style, pieces: colours.reduce((n, c) => n + c.pieces, 0), colours });
    }
    list.sort(byPieces((s) => s.style));
    out.push({ category, pieces: list.reduce((n, s) => n + s.pieces, 0), styles: list });
  }
  return out.sort(byPieces((c) => c.category));
}
