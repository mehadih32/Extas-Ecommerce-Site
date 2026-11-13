// S28 · PR 698 (CN-048; prototype v5 Messages cost ceilings; gap A5, N15) — a monthly ceiling on what the shop spends on
// SMS and on WhatsApp (`messages.costCeiling`, off as shipped; the numbers are the owner's: blank = no ceiling). What was
// spent this month (the store's own calendar month) is read from the cost ledger (CostEntry, one row per costed message,
// PR 343). At `warnPct` of a ceiling the state is "warn" (the page says so, in the shop's money); at the ceiling it is
// "over": the engine then does not send a further SMS or WhatsApp message on that channel this month — with
// `fallbackToCheapest` a step that has a fallback channel goes by that channel instead when it is still under its ceiling
// (an e-mail has no ceiling), else the message is held back with the reason COST_CEILING (BLOCKED_BY_GUARD; nothing is
// sent and nothing is lost: it stays in the log). The order's first messages (`placed`, `selfConfirm`: NEVER_QUIET) are
// never held. A practice (mock) send costs nothing, so it never counts. Reading needs `messages.channels.read`.
import { requirePermission } from '@extas/auth';
import type { MessagesDeps, Who } from './context';
import { setting } from './context';

export const CEILING_CHANNELS = ['SMS', 'WHATSAPP'] as const;
export type CeilingChannelName = (typeof CEILING_CHANNELS)[number];
export type CeilingState = 'none' | 'ok' | 'warn' | 'over';

/** The state of one channel: no ceiling, under the warning share, at or over it, or at the ceiling. */
export function ceilingState(spentMinor: number, ceilingMinor: number | null, warnPct: number): CeilingState {
  if (ceilingMinor === null) return 'none';
  if (spentMinor >= ceilingMinor) return 'over';
  return spentMinor * 100 >= ceilingMinor * warnPct ? 'warn' : 'ok';
}

/** The share of the ceiling spent, in whole percent (null: no ceiling). Not capped, so 130 means 30 over. */
export function ceilingPct(spentMinor: number, ceilingMinor: number | null): number | null {
  return ceilingMinor === null || ceilingMinor <= 0 ? null : Math.floor((spentMinor * 100) / ceilingMinor);
}

/** The first instant of the store's current calendar month, in its own time zone. */
export function monthStartIn(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const guess = Date.UTC(y, m - 1, 1);
  // the zone's offset at that moment: how far its wall clock is from UTC
  const wall = new Date(new Date(guess).toLocaleString('en-US', { timeZone }));
  const offset = wall.getTime() - new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return new Date(guess - offset);
}

export interface CeilingChannelStatus {
  channel: CeilingChannelName;
  ceilingMinor: number | null;
  spentMinor: number;
  pct: number | null;
  state: CeilingState;
}

export interface CeilingStatus {
  enabled: boolean;
  warnPct: number;
  fallbackToCheapest: boolean;
  currency: string;
  monthStart: Date;
  channels: CeilingChannelStatus[];
}

/** The month's spend against the ceilings. No permission check: for the engine and the pages' own checks. */
export async function ceilingStatusOf(deps: Pick<MessagesDeps, 'db' | 'settings' | 'now'>, storeId: number): Promise<CeilingStatus> {
  const [cfg, currency, timeZone] = await Promise.all([setting(deps, storeId, 'messages.costCeiling'), setting(deps, storeId, 'store.currency'), setting(deps, storeId, 'store.timeZone')]);
  const now = deps.now?.() ?? new Date();
  const monthStart = monthStartIn(now, timeZone);
  const sums = await deps.db.costEntry.groupBy({ by: ['service'], where: { storeId, service: { in: [...CEILING_CHANNELS] }, occurredAt: { gte: monthStart } }, _sum: { amountMinor: true } });
  const spent = (c: CeilingChannelName) => sums.find((s) => s.service === c)?._sum.amountMinor ?? 0;
  const ceiling = (c: CeilingChannelName) => (c === 'SMS' ? cfg.smsMonthlyMinor : cfg.whatsappMonthlyMinor);
  return {
    enabled: cfg.enabled,
    warnPct: cfg.warnPct,
    fallbackToCheapest: cfg.fallbackToCheapest,
    currency,
    monthStart,
    channels: CEILING_CHANNELS.map((channel) => ({ channel, ceilingMinor: ceiling(channel), spentMinor: spent(channel), pct: ceilingPct(spent(channel), ceiling(channel)), state: cfg.enabled ? ceilingState(spent(channel), ceiling(channel), cfg.warnPct) : 'none' })),
  };
}

/** The page's reading (`messages.channels.read`). */
export async function readCostCeilings(deps: Pick<MessagesDeps, 'db' | 'settings' | 'now'>, who: Who): Promise<CeilingStatus> {
  await requirePermission(deps.db, who.actor, 'messages.channels.read', { storeId: who.storeId });
  return ceilingStatusOf(deps, who.storeId);
}

/** What the engine does with a message about to go on `channel`: nothing to hold, or hold it (and maybe go by the fallback). */
export type CeilingVerdict = { hold: false } | { hold: true; useFallback: boolean };

/** Pure: the engine's decision from the status, the row's channel and the step's fallback channel. */
export function ceilingVerdict(status: Pick<CeilingStatus, 'enabled' | 'fallbackToCheapest' | 'channels'>, channel: string, fallback: string | null): CeilingVerdict {
  if (!status.enabled) return { hold: false };
  const mine = status.channels.find((c) => c.channel === channel);
  if (!mine || mine.state !== 'over') return { hold: false };
  const other = status.channels.find((c) => c.channel === fallback);
  const free = fallback !== null && fallback !== channel && (!other || other.state !== 'over');
  return { hold: true, useFallback: status.fallbackToCheapest && free };
}
