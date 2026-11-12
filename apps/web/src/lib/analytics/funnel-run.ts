// S15 · PR 339 — running a saved funnel against the already-stored events (`@extas/analytics`'s own pure
// `computeFunnelResult`, D5.3's "deterministic... never an AI guess"). Loads the funnel (`funnel-list.ts`'s own
// `FunnelError`, reused rather than a second error shape for the same CRUD family), reads only the small slice of
// `AnalyticsEvent` the funnel's own steps actually need — the event names used by at least one step, within the
// queried window — and counts. No AI call, no outside service; PR 333's commentary agent is the separate, later
// reader that explains these numbers, never this file.
import { computeFunnelResult, FUNNEL_RUN_DEFAULT_DAYS, type FunnelEventRow, type FunnelResult } from '@extas/analytics';
import type { PrismaClient } from '@extas/db/client';
import { FunnelError, getFunnel, type FunnelListDeps } from './funnel-list';

export interface FunnelRunDeps extends FunnelListDeps {
  db: PrismaClient;
}

export interface FunnelRunResult extends FunnelResult {
  funnel: { id: string; name: string };
  from: string;
  to: string;
}

const DAY_MS = 86_400_000; // hardcode-ok: a millisecond, not a business number

/** `to` defaults to now; `from` defaults to `FUNNEL_RUN_DEFAULT_DAYS` before `to` — D5.2's own "weekly and monthly". */
export function defaultFunnelWindow(now: Date, from: Date | null, to: Date | null): { from: Date; to: Date } {
  const end = to ?? now;
  const start = from ?? new Date(end.getTime() - FUNNEL_RUN_DEFAULT_DAYS * DAY_MS);
  return { from: start, to: end };
}

export async function runFunnel(deps: FunnelRunDeps, storeId: number, funnelId: string, window: { from: Date; to: Date }): Promise<FunnelRunResult> {
  if (window.from >= window.to) throw new FunnelError(422, 'INVALID_INPUT', ['from']);
  const funnel = await getFunnel(deps, storeId, funnelId);
  const eventNames = [...new Set(funnel.steps.map((s) => s.eventName))];
  const rows = await deps.db.analyticsEvent.findMany({
    where: { storeId, name: { in: eventNames }, occurredAt: { gte: window.from, lt: window.to } },
    select: { visitorId: true, name: true, pageType: true, productId: true, categoryId: true },
  });
  const events: FunnelEventRow[] = rows.map((r) => ({
    visitorId: r.visitorId,
    // Safe: every row's own `name` was written by `recordAnalyticsEvent` (PR 338), which refuses anything outside
    // the catalogue before it is ever stored — never trusted blindly here, only re-asserted for the type.
    name: r.name as FunnelEventRow['name'],
    pageType: r.pageType,
    productId: r.productId,
    categoryId: r.categoryId,
  }));
  const result = computeFunnelResult(funnel.steps, events);
  return { ...result, funnel: { id: funnel.id, name: funnel.name }, from: window.from.toISOString(), to: window.to.toISOString() };
}
