// The account pages' pure helpers (no database; the storefront's client parts may import them): how far an order has
// come on its tracking steps, read from the state and the times the order stores (PR 131's order cards, PR 135's
// tracking page). Nothing here moves an order: the order state machine is S05's (CN-022); the steps only show it.

/** An order's stored state (Prisma's OrderStatus). */
export type OrderState =
  | 'DRAFT'
  | 'PLACED'
  | 'CONFIRMED'
  | 'ON_HOLD'
  | 'PROCESSING'
  | 'PACKED'
  | 'HANDED_OVER'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'PARTIALLY_DELIVERED'
  | 'RETURNED'
  | 'CANCELLED';

/** The tracking steps, in order (demo 60-account.js acc_trackFlow; the order page adds "Placed" in front). */
export const TRACK_STEPS = ['placed', 'confirmed', 'packed', 'courier', 'delivered'] as const;
export type TrackStep = (typeof TRACK_STEPS)[number];

/** How far each stored state has come (an index into TRACK_STEPS). */
const REACHED: Record<OrderState, number> = {
  DRAFT: 0,
  PLACED: 0,
  ON_HOLD: 0,
  CONFIRMED: 1,
  PROCESSING: 1,
  PACKED: 2,
  HANDED_OVER: 3,
  IN_TRANSIT: 3,
  DELIVERED: 4,
  PARTIALLY_DELIVERED: 4,
  RETURNED: 3,
  CANCELLED: 0,
};

export interface OrderTimes {
  placedAt: Date | string;
  confirmedAt?: Date | string | null;
  packedAt?: Date | string | null;
  handedOverAt?: Date | string | null;
  deliveredAt?: Date | string | null;
  cancelledAt?: Date | string | null;
  returnedAt?: Date | string | null;
}

export interface TrackView {
  /** The last step reached (0 = placed … 4 = delivered). */
  reached: number;
  /** An order that stopped: cancelled or returned (shown as a state, never as a step). */
  ended: 'cancelled' | 'returned' | null;
  /** When each step was reached, where the order stores it. */
  at: Partial<Record<TrackStep, string>>;
  /** Delivered (or partly): nothing more to wait for. */
  done: boolean;
}

const iso = (d: Date | string | null | undefined): string | undefined => (d ? new Date(d).toISOString() : undefined);

/** The tracking steps of an order, from its stored state and times. */
export function trackOf(status: OrderState, t: OrderTimes): TrackView {
  // A cancelled order shows how far it had come before it stopped (its stored times), a returned one the same.
  let reached = REACHED[status] ?? 0;
  if (status === 'CANCELLED' || status === 'RETURNED') reached = t.deliveredAt ? 4 : t.handedOverAt ? 3 : t.packedAt ? 2 : t.confirmedAt ? 1 : 0;
  const at: Partial<Record<TrackStep, string>> = {};
  const put = (k: TrackStep, d: Date | string | null | undefined) => {
    const v = iso(d);
    if (v) at[k] = v;
  };
  put('placed', t.placedAt);
  put('confirmed', t.confirmedAt);
  put('packed', t.packedAt);
  put('courier', t.handedOverAt);
  put('delivered', t.deliveredAt);
  return {
    reached,
    ended: status === 'CANCELLED' ? 'cancelled' : status === 'RETURNED' ? 'returned' : null,
    at,
    done: status === 'DELIVERED' || status === 'PARTIALLY_DELIVERED',
  };
}

/** The first word of a name ("Hi, Rahim"), or '' for none. */
export const firstNameOf = (name: string | null | undefined): string => (name ?? '').trim().split(/\s+/)[0] ?? '';

/** Up to two initials for the round picture when there is no photo. */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => [...p][0] ?? '')
    .join('')
    .toUpperCase();
}
