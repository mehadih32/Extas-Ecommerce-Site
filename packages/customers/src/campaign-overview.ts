// S28 · PR 697 (CN-048; prototype v5 Marketing › Message campaigns; gap M4, M5, N6) — every message send of the shop in ONE
// list, whatever its kind or channel: win-back and campaigns to a group (SMS, WhatsApp; PR 300, 277) and e-mail sends
// (PR 290), newest first, each with its channel, state, saved segment, how many went and failed, what it cost and what the
// people who got it ordered afterwards (delivered orders and their value, the same window as every campaign's results).
// Read only: a campaign is made and run in its own builder (the consent, approved-template, schedule, throttle and
// stop-line checks live there, untouched), reached from here. `messages.journey.read`.
import { requirePermission } from '@extas/auth';
import { checkStoreId, setting, type CustomersDeps, type Who } from './context';
import { emailResults } from './email-marketing';

export const OVERVIEW_KINDS = ['winback', 'blast', 'email'] as const;
export type OverviewKind = (typeof OVERVIEW_KINDS)[number];
export const OVERVIEW_CHANNELS = ['SMS', 'WHATSAPP', 'EMAIL'] as const;

export interface OverviewRow {
  id: string;
  kind: OverviewKind;
  channel: string;
  name: string;
  status: string;
  segmentName: string | null;
  scheduledAt: Date | null;
  createdAt: Date;
  queued: number;
  sent: number;
  failed: number;
  costMinor: number;
  orders: number;
  deliveredOrders: number;
  deliveredValueMinor: number;
}

export interface CampaignOverview {
  rows: OverviewRow[];
  totals: { sends: number; sent: number; costMinor: number; deliveredOrders: number; deliveredValueMinor: number };
  /** Delivered sales per 1 of message cost over everything listed (null while nothing was costed). */
  salesPerCost: number | null;
  currency: string;
}

const LIMIT = 100; // hardcode-ok: a list length, not a business number

/** What a send is called on the page: its saved kind, else an e-mail send (kind empty, channel EMAIL). */
export function overviewKind(kind: string | null, channel: string): OverviewKind | null {
  if (kind === 'winback' || kind === 'blast') return kind;
  return kind === null && channel === 'EMAIL' ? 'email' : null;
}

/** The list for the page. Filter by `channel` when given. */
export async function campaignOverview(deps: CustomersDeps, who: Who, channel?: string): Promise<CampaignOverview> {
  checkStoreId(who.storeId);
  await requirePermission(deps.db, who.actor, 'messages.journey.read', { storeId: who.storeId });
  const S = who.storeId;
  const [cfg, currency] = await Promise.all([setting(deps, S, 'customers.winback'), setting(deps, S, 'store.currency')]);
  const found = await deps.db.broadcast.findMany({
    where: { storeId: S, ...(channel && (OVERVIEW_CHANNELS as readonly string[]).includes(channel) ? { channel: channel as never } : {}), OR: [{ kind: { in: ['winback', 'blast'] } }, { kind: null, channel: 'EMAIL' as never }] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: LIMIT,
  });
  const segIds = [...new Set(found.map((b) => b.segmentId).filter((x): x is string => !!x))];
  const names = segIds.length ? new Map((await deps.db.segment.findMany({ where: { storeId: S, id: { in: segIds } }, select: { id: true, name: true } })).map((s) => [s.id, s.name])) : new Map<string, string>();
  const rows: OverviewRow[] = [];
  for (const b of found) {
    const kind = overviewKind(b.kind, b.channel);
    if (!kind) continue;
    const r = b.sentCount > 0 ? await emailResults(deps, S, b.id, cfg.resultDays) : null;
    rows.push({
      id: b.id,
      kind,
      channel: b.channel,
      name: b.name,
      status: b.status,
      segmentName: b.segmentId ? (names.get(b.segmentId) ?? null) : null,
      scheduledAt: b.scheduledAt,
      createdAt: b.createdAt,
      queued: b.queuedCount,
      sent: b.sentCount,
      failed: b.failedCount,
      costMinor: b.costMinor ?? 0,
      orders: r?.orders ?? 0,
      deliveredOrders: r?.delivered ?? 0,
      deliveredValueMinor: r?.deliveredValueMinor ?? 0,
    });
  }
  const sum = (k: 'sent' | 'costMinor' | 'deliveredOrders' | 'deliveredValueMinor') => rows.reduce((a, x) => a + x[k], 0);
  const cost = sum('costMinor');
  return {
    rows,
    totals: { sends: rows.length, sent: sum('sent'), costMinor: cost, deliveredOrders: sum('deliveredOrders'), deliveredValueMinor: sum('deliveredValueMinor') },
    salesPerCost: cost > 0 ? Math.round((sum('deliveredValueMinor') / cost) * 100) / 100 : null,
    currency,
  };
}

