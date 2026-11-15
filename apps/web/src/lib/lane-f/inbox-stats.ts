// Inbox › Response times (prototype v5, m-inbox.js renderStats): the hour-by-hour charts, the share answered fast and the
// chats finished today, worked out from the stored messages, orders and conversations. Nothing is stored for it and
// nothing is changed. Hours are the shop's own clock (store.timeZone).
import type { PrismaClient } from '@extas/db/client';

/** The hours the charts show: 8 in the morning to 11 at night, as in the prototype. */
export const CHART_HOURS: readonly number[] = Array.from({ length: 16 }, (_, i) => i + 8); // hardcode-ok: the chart's hour range
/** The days the hour charts look back over. */
export const LOOK_BACK_DAYS = 30; // hardcode-ok: the prototype's "30 days" card title
/** "Answered within 15 min": the minutes. */
export const FAST_MINUTES = 15; // hardcode-ok: the prototype's "Answered within 15 min" tile
const DAY = 86_400_000; // hardcode-ok: ms per day

/** The hour (0–23) of a moment on the shop's clock. */
export function hourOf(at: Date, tz: string): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(at);
  return Number(h) % 24; // hardcode-ok: hours in a day
}

/** How many moments fall in each of the hours; moments outside the hours are left out. */
export function bucketHours(moments: readonly Date[], tz: string, hours: readonly number[] = CHART_HOURS): number[] {
  const at = new Map(hours.map((h, i) => [h, i]));
  const out = hours.map(() => 0);
  for (const m of moments) {
    const i = at.get(hourOf(m, tz));
    if (i !== undefined) out[i]! += 1;
  }
  return out;
}

/** The hour with the most, the earliest on a tie; null while nothing is counted. */
export function peakHour(counts: readonly number[], hours: readonly number[] = CHART_HOURS): number | null {
  let best = -1;
  let at: number | null = null;
  counts.forEach((c, i) => {
    if (c > best && c > 0) {
      best = c;
      at = hours[i] ?? null;
    }
  });
  return at;
}

/** The share (0–100) of answered chats whose first answer came within the minutes; null when none was answered. */
export function fastShare(chats: readonly { createdAt: Date; firstResponseAt: Date | null }[], minutes = FAST_MINUTES): number | null {
  const answered = chats.filter((c) => c.firstResponseAt);
  if (!answered.length) return null;
  const fast = answered.filter((c) => c.firstResponseAt!.getTime() - c.createdAt.getTime() <= minutes * 60_000).length; // hardcode-ok: ms per minute
  return (fast / answered.length) * 100; // hardcode-ok: percent
}

export interface InboxStats {
  hours: readonly number[];
  messages: number[];
  orders: number[];
  fastPct: number | null;
  doneToday: number;
}

/** The shop's day (yyyy-mm-dd) of a moment. */
const dayOf = (at: Date, tz: string) => at.toLocaleDateString('en-CA', { timeZone: tz });

export async function loadInboxStats(db: PrismaClient, storeId: number, tz: string, now: Date): Promise<InboxStats> {
  const since = new Date(now.getTime() - LOOK_BACK_DAYS * DAY);
  const [msgs, orders, chats, solved] = await Promise.all([
    db.message.findMany({ where: { storeId, direction: 'IN', isInternalNote: false, sentAt: { gte: since } }, select: { sentAt: true }, take: 20_000 }), // hardcode-ok: a safety cap
    db.order.findMany({ where: { storeId, createdAt: { gte: since } }, select: { createdAt: true }, take: 20_000 }), // hardcode-ok: a safety cap
    db.conversation.findMany({ where: { storeId, createdAt: { gte: since } }, select: { createdAt: true, firstResponseAt: true }, take: 5_000 }), // hardcode-ok: a safety cap
    db.conversation.findMany({ where: { storeId, resolvedAt: { gte: new Date(now.getTime() - 2 * DAY) } }, select: { resolvedAt: true } }), // hardcode-ok: two days cover the shop's today in any time zone
  ]);
  const today = dayOf(now, tz);
  return {
    hours: CHART_HOURS,
    messages: bucketHours(
      msgs.map((m) => m.sentAt),
      tz,
    ),
    orders: bucketHours(
      orders.map((o) => o.createdAt),
      tz,
    ),
    fastPct: fastShare(chats),
    doneToday: solved.filter((c) => c.resolvedAt && dayOf(c.resolvedAt, tz) === today).length,
  };
}
