// S22 · PR 436 (Blueprint B4.13, B4.14 item 12) — support analytics without a database: the figure one row of the report
// carries (a channel, an employee, EXTAS AI, the whole team), the middle and the average of a list of minutes, a rate
// that is "—" (null) when nothing is under it, and whether a ticket ran late on either of its timers. analytics.ts reads
// the rows; the screens use these too.

/** One row of the report. Minutes are whole minutes; money is in minor units (Order.totalMinor). */
export interface SupportFigure {
  /** Chats: for a channel or the team, chats where a customer wrote in the period; for a person, chats they answered. */
  chats: number;
  /** The shop's answers sent in the period (never internal notes). */
  replies: number;
  /** Tickets opened in the period (a customer's question, PR 431). */
  tickets: number;
  /** Tickets answered, the middle and the average minutes to the first answer, and how many answered after the timer. */
  answered: number;
  firstMedian: number | null;
  firstAverage: number | null;
  /** Tickets solved, the middle and the average minutes to the solution. */
  solved: number;
  resolveMedian: number | null;
  resolveAverage: number | null;
  /** Tickets late on either timer (the first answer or the solution), and their share of the tickets. */
  late: number;
  lateRate: number | null;
  /** Chats (of `chats`) that brought an order in the period, and their share: chat → order conversion. */
  orderChats: number;
  conversion: number | null;
  /** Orders from chats placed in the period (made in the chat, or from a product link sent in it) and their value. */
  orders: number;
  orderedMinor: number;
  /** Of those, delivered: Sales, the shop's one definition (@extas/metrics SALES_STATUSES), never the ordered value. */
  delivered: number;
  salesMinor: number;
  /** Follow-ups sent in the period (PR 433) and those that brought an order. */
  followUpsSent: number;
  followUpsOrdered: number;
}

/** A row's facts before the medians and rates are worked out. */
export interface FigureFacts {
  chats: Set<string>;
  replies: number;
  tickets: number;
  firstMinutes: number[];
  resolveMinutes: number[];
  late: number;
  orderChats: Set<string>;
  orders: Map<string, { valueMinor: number; delivered: boolean }>;
  followUpsSent: number;
  followUpsOrdered: number;
}

export const emptyFacts = (): FigureFacts => ({ chats: new Set(), replies: 0, tickets: 0, firstMinutes: [], resolveMinutes: [], late: 0, orderChats: new Set(), orders: new Map(), followUpsSent: 0, followUpsOrdered: 0 });

/** The middle value (the mean of the two middle ones for an even count), rounded to whole minutes; null for none. */
export function median(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2);
}

/** The average, rounded to whole minutes; null for none. */
export function average(xs: readonly number[]): number | null {
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}

/** A share between 0 and 1, or null when nothing is under it (shown "—", never 0 %). */
export const rate = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null);

/** The figure of one row from its facts. Only orders of the row's own chats count in its conversion. */
export function figureOf(f: FigureFacts): SupportFigure {
  const orders = [...f.orders.values()];
  const delivered = orders.filter((o) => o.delivered);
  const orderChats = [...f.orderChats].filter((c) => f.chats.has(c)).length;
  return {
    chats: f.chats.size,
    replies: f.replies,
    tickets: f.tickets,
    answered: f.firstMinutes.length,
    firstMedian: median(f.firstMinutes),
    firstAverage: average(f.firstMinutes),
    solved: f.resolveMinutes.length,
    resolveMedian: median(f.resolveMinutes),
    resolveAverage: average(f.resolveMinutes),
    late: f.late,
    lateRate: rate(f.late, f.tickets),
    orderChats,
    conversion: rate(orderChats, f.chats.size),
    orders: orders.length,
    orderedMinor: orders.reduce((a, o) => a + o.valueMinor, 0),
    delivered: delivered.length,
    salesMinor: delivered.reduce((a, o) => a + o.valueMinor, 0),
    followUpsSent: f.followUpsSent,
    followUpsOrdered: f.followUpsOrdered,
  };
}

interface TicketTimes {
  status: string;
  createdAt: Date;
  firstResponseDueAt: Date | null;
  firstResponseAt: Date | null;
  resolutionDueAt: Date | null;
  resolvedAt: Date | null;
}

/**
 * Was the ticket late on either timer by `now`? The first answer: answered after its timer, or not answered and the
 * timer ran out. The solution: solved after its timer, or still open with the customer waiting (status OPEN) and the
 * timer ran out — while the shop waits for the customer the solution timer does not count (as the inbox's clock).
 */
export function ticketLate(t: TicketTimes, now: Date): boolean {
  const first = !!t.firstResponseDueAt && (t.firstResponseAt ? t.firstResponseAt > t.firstResponseDueAt : now > t.firstResponseDueAt);
  const resolve = !!t.resolutionDueAt && (t.resolvedAt ? t.resolvedAt > t.resolutionDueAt : t.status === 'OPEN' && now > t.resolutionDueAt);
  return first || resolve;
}
