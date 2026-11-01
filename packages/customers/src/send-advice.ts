// S14 · PR 294 — who to send to and when (Blueprint C6.1 item 4: "who will actually buy and when to send, instead of
// blasting everyone"), with the reasoning shown as numbers. The rule-based reading the blueprint asks for when AI is off;
// it needs no AI and no key, only the store's own data (`customers.sendAdvice`, off as shipped).
//
// - Who: the live saved segments, each counted over the Customers list's own people — how many people, how many of them
//   can get an offer e-mail now (the e-mail send's own rule), and how many bought in the last `lookbackDays` (an order
//   placed, and at least one ever delivered, so a person who only refuses does not count). Ranked by that share of
//   buyers, then by how many can be reached; a segment nobody in it can be reached by is left out. `maxSegments` shown.
// - When: the store's orders in the last `lookbackDays`, by the hour and the weekday they were placed in the store's
//   time zone; the `windowHours` hours in a row with the most orders, never inside the Messages quiet hours (while they
//   are on), and the weekday with the most. Below `minOrders` orders it says there are too few to read yet; when every
//   window of that width touches the quiet hours it says so.
//
// Advice only: the person picks the segment and the time on the form, and the send still asks before it goes. Reading
// needs `messages.journey.read` (the e-mail page's own key). Nothing is written.
import { requirePermission } from '@extas/auth';
import { Prisma } from '@extas/db/client';
import { statusRule } from '@extas/metrics';
import type { SendAdviceSettings } from '@extas/settings';
import { checkStoreId, nowOf, setting, type CustomersDeps, type Who } from './context';
import { EMAIL_READ, emailReachableSql } from './email-marketing';
import { readDefinition } from './segment-rules';
import { baseOf, definitionSql } from './segments';

const DAY_MS = 86_400_000;

export interface SegmentAdvice {
  id: string;
  name: string;
  people: number;
  /** Can get an offer e-mail now. */
  reachable: number;
  /** Ordered in the look-back and had at least one order delivered. */
  buyers: number;
}

export type TimingAdvice =
  | { ok: true; orders: number; fromHour: number; toHour: number; inWindow: number; weekday: number; onWeekday: number }
  /** Too few orders (`blocked` false), or enough but every window of that width touches the quiet hours (`blocked` true). */
  | { ok: false; orders: number; needed: number; blocked: boolean };

export interface SendAdvice {
  lookbackDays: number;
  /** The store's time zone the hours are in (`store.timeZone`). */
  timeZone: string;
  segments: SegmentAdvice[];
  timing: TimingAdvice;
  /** The quiet hours the window keeps out of (null: off). */
  quiet: { fromHour: number; toHour: number } | null;
}

/** Hours `from`..`from + n - 1` (mod 24) all outside the quiet hours (quiet from `q.fromHour` up to `q.toHour`). */
export function outsideQuiet(from: number, n: number, q: { fromHour: number; toHour: number } | null): boolean {
  if (!q) return true;
  const quiet = (h: number) => (q.fromHour < q.toHour ? h >= q.fromHour && h < q.toHour : h >= q.fromHour || h < q.toHour);
  for (let i = 0; i < n; i++) if (quiet((from + i) % 24)) return false;
  return true;
}

/** The best `n`-hour window (wrapping past midnight) outside the quiet hours, by orders; ties go to the earlier hour. */
export function bestWindow(byHour: readonly number[], n: number, q: { fromHour: number; toHour: number } | null): { from: number; count: number } | null {
  let best: { from: number; count: number } | null = null;
  for (let from = 0; from < 24; from++) {
    if (!outsideQuiet(from, n, q)) continue;
    let count = 0;
    for (let i = 0; i < n; i++) count += byHour[(from + i) % 24] ?? 0;
    if (!best || count > best.count) best = { from, count };
  }
  return best;
}

/** The advice for an e-mail send, or null while it is switched off. */
export async function sendAdvice(deps: CustomersDeps, who: Who): Promise<SendAdvice | null> {
  checkStoreId(who.storeId);
  await requirePermission(deps.db, who.actor, EMAIL_READ, { storeId: who.storeId });
  const S = who.storeId;
  const [s, segOn, tz, quietSet] = await Promise.all([
    setting(deps, S, 'customers.sendAdvice') as Promise<SendAdviceSettings>,
    setting(deps, S, 'customers.segments'),
    setting(deps, S, 'store.timeZone'),
    setting(deps, S, 'messages.quietHours'),
  ]);
  if (!s.enabled) return null;
  const now = nowOf(deps);
  const since = new Date(now.getTime() - s.lookbackDays * DAY_MS);
  const quiet = quietSet.on ? { fromHour: quietSet.fromHour, toHour: quietSet.toHour } : null;

  // when: the orders placed in the look-back, by local hour and weekday
  const rows = await deps.db.$queryRaw<{ h: number; d: number; n: bigint }[]>`
    SELECT extract(hour FROM o."placedAt" AT TIME ZONE ${tz})::int AS h, extract(dow FROM o."placedAt" AT TIME ZONE ${tz})::int AS d, count(*) AS n
    FROM "Order" o WHERE o."storeId" = ${S} AND o."archivedAt" IS NULL AND o."placedAt" >= ${since} AND ${statusRule('ordered')}
    GROUP BY 1, 2`;
  const byHour = Array.from({ length: 24 }, () => 0);
  const byDay = Array.from({ length: 7 }, () => 0);
  for (const r of rows) {
    byHour[r.h] = (byHour[r.h] ?? 0) + Number(r.n);
    byDay[r.d] = (byDay[r.d] ?? 0) + Number(r.n);
  }
  const orders = byHour.reduce((a, b) => a + b, 0);
  const win = orders >= s.minOrders ? bestWindow(byHour, s.windowHours, quiet) : null;
  const weekday = byDay.reduce((bi, n, i) => (n > (byDay[bi] ?? 0) ? i : bi), 0);
  const timing: TimingAdvice = win ? { ok: true, orders, fromHour: win.from, toHour: (win.from + s.windowHours) % 24, inWindow: win.count, weekday, onWeekday: byDay[weekday] ?? 0 } : { ok: false, orders, needed: s.minOrders, blocked: orders >= s.minOrders };

  // who: the live saved segments, counted in one read
  let segments: SegmentAdvice[] = [];
  if (segOn.enabled) {
    const live = (await deps.db.segment.findMany({ where: { storeId: S, archivedAt: null }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], select: { id: true, name: true, definition: true } }))
      .map((r) => ({ ...r, def: readDefinition(r.definition) }))
      .filter((r) => r.def);
    if (live.length) {
      const c = { storeId: S, now };
      const reach = emailReachableSql(S);
      const buyer = Prisma.sql`b."last_at" >= ${since} AND b."delivered" > 0`;
      const cols = live.flatMap((r, i) => {
        const def = definitionSql(r.def!, c);
        return [
          Prisma.sql`count(*) FILTER (WHERE ${def}) AS ${Prisma.raw(`"p${i}"`)}`,
          Prisma.sql`count(*) FILTER (WHERE ${def} AND ${reach}) AS ${Prisma.raw(`"r${i}"`)}`,
          Prisma.sql`count(*) FILTER (WHERE ${def} AND ${buyer}) AS ${Prisma.raw(`"b${i}"`)}`,
        ];
      });
      const base = await baseOf(deps, S);
      const got = (await deps.db.$queryRaw<Record<string, bigint>[]>`${base} SELECT ${Prisma.join(cols, ', ')} FROM base b`)[0] ?? {};
      const share = (x: SegmentAdvice) => (x.people ? x.buyers / x.people : 0);
      segments = live
        .map((r, i) => ({ id: r.id, name: r.name, people: Number(got[`p${i}`] ?? 0), reachable: Number(got[`r${i}`] ?? 0), buyers: Number(got[`b${i}`] ?? 0) }))
        .filter((x) => x.reachable > 0)
        .sort((a, b) => share(b) - share(a) || b.reachable - a.reachable || a.name.localeCompare(b.name))
        .slice(0, s.maxSegments);
    }
  }
  return { lookbackDays: s.lookbackDays, timeZone: tz, segments, timing, quiet };
}
