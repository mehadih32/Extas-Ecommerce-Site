// S22 · PR 624 (CN-034; customer 360° finding 7) — taps on the shop's support buttons. While the Messenger button is on
// and its counting is on (`support.messengerButton` enabled + countTaps), each tap on the shop's Messenger, WhatsApp or
// call button adds one to its shop day, channel and place (SupportChannelTap; one row per day × channel × place, one
// atomic add, so two taps at once are both counted). Numbers only: never who tapped, never an address or a device.
// Support settings shows the last days' counts beside the Messenger card (supportTaps, `support.read`).
// Nothing here sends a message, moves money, changes an order, blocks or deletes anything.
import { lastDays } from '@extas/metrics/pure';
import { z } from 'zod';
import { allow, nowOf, parse, setting, type SupportDeps, type Who } from './context';
import { TAP_CHANNELS, TAP_PLACES, TAP_REPORT_DAYS, type TapChannel, type TapPlace } from './taps-pure';

const tapInput = z.object({ ch: z.enum(TAP_CHANNELS), place: z.enum(TAP_PLACES) }).strict();

/**
 * Counts one tap (the shop's beacon, POST /api/shop/support-tap). Returns false when counting is off or the tap is not
 * one of ours; never throws on a bad tap (a visitor's page can send anything).
 */
export async function recordSupportTap(deps: Pick<SupportDeps, 'db' | 'settings' | 'now'>, storeId: number, input: unknown): Promise<boolean> {
  if (!Number.isInteger(storeId) || storeId < 1) return false;
  const tap = tapInput.safeParse(input);
  if (!tap.success) return false;
  const set = await setting(deps, storeId, 'support.messengerButton');
  if (!set.enabled || !set.countTaps) return false;
  const tz = await setting(deps, storeId, 'store.timeZone');
  const day = lastDays(1, nowOf(deps), tz).to;
  await deps.db.$executeRaw`
    INSERT INTO "SupportChannelTap" ("id", "storeId", "day", "channel", "place", "count", "updatedAt")
    VALUES (gen_random_uuid(), ${storeId}, ${day}::date, ${tap.data.ch}, ${tap.data.place}, 1, now())
    ON CONFLICT ("storeId", "day", "channel", "place") DO UPDATE SET "count" = "SupportChannelTap"."count" + 1, "updatedAt" = now()`;
  return true;
}

export const supportTapsInput = z.object({ days: z.coerce.number().int().min(1).max(TAP_REPORT_DAYS.max).optional() }).strict();

export type TapCounts = Record<TapChannel, number> & { total: number };

export interface SupportTaps {
  /** The shop days counted, oldest and newest (YYYY-MM-DD in the store's time zone). */
  from: string;
  to: string;
  days: number;
  /** Is counting on now (the button and its counting)? */
  counting: boolean;
  total: TapCounts;
  /** Every place with a tap, the most tapped first. */
  byPlace: (TapCounts & { place: TapPlace })[];
}

const zero = (): TapCounts => ({ messenger: 0, whatsapp: 0, call: 0, total: 0 });

/** The taps of the last `days` shop days (default 30), per channel and per place (`support.read`). */
export async function supportTaps(deps: Pick<SupportDeps, 'db' | 'settings' | 'now'>, who: Who, input: unknown = {}): Promise<SupportTaps> {
  await allow(deps, who, 'support.read');
  const d = parse(supportTapsInput, input, 'tap report');
  const days = d.days ?? TAP_REPORT_DAYS.default;
  const [tz, set] = await Promise.all([setting(deps, who.storeId, 'store.timeZone'), setting(deps, who.storeId, 'support.messengerButton')]);
  const span = lastDays(days, nowOf(deps), tz);
  const rows = await deps.db.supportChannelTap.groupBy({
    by: ['channel', 'place'],
    where: { storeId: who.storeId, day: { gte: new Date(`${span.from}T00:00:00Z`), lte: new Date(`${span.to}T00:00:00Z`) } },
    _sum: { count: true },
  });
  const total = zero();
  const places = new Map<TapPlace, TapCounts>();
  for (const r of rows) {
    if (!(TAP_CHANNELS as readonly string[]).includes(r.channel) || !(TAP_PLACES as readonly string[]).includes(r.place)) continue;
    const ch = r.channel as TapChannel;
    const n = r._sum.count ?? 0;
    const p = places.get(r.place as TapPlace) ?? zero();
    p[ch] += n;
    p.total += n;
    places.set(r.place as TapPlace, p);
    total[ch] += n;
    total.total += n;
  }
  const byPlace = [...places.entries()].map(([place, c]) => ({ place, ...c })).sort((a, b) => b.total - a.total || TAP_PLACES.indexOf(a.place) - TAP_PLACES.indexOf(b.place));
  return { from: span.from, to: span.to, days, counting: set.enabled && set.countTaps, total, byPlace };
}
