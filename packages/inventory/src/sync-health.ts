// PR 205 — the sync health panel: one read of everything the stock page shows at the top (needs `inventory.read`).
// It never calls the ERP (the page must open when the ERP is down); it reads the error surface (PR 194: ErpSyncRun,
// ErpSyncState), the document outbox (PR 199/200), the holds (PR 197/198), the open low-stock alerts (PR 202) and the
// open stock counts (PR 203).
//
// The verdict (`level`), most serious first:
// - `off`      the store runs without an ERP (nothing is wrong: there is nothing to sync);
// - `down`     an ERP is chosen but cannot be used, or documents are DEAD;
// - `failing`  the latest stock pull failed, or documents FAILED, or ERP events FAILED or came again with another body
//              (PR 608, the v6 event ledger);
// - `practice` the practice ERP is in use (keys not in yet);
// - `late`     no good pull for `inventory.admin.lateAfterMinutes`;
// - `ok`.
import { allow, nowOf, setting, type InventoryDeps, type Who } from './context';
import { erpEventProblems } from './erp-events';
import { pushCounts, type PushCounts } from './erp-push';
import { resolveErp, type ErpLinkState } from './guard';
import { holdSummary, type HoldSummary } from './reservations';
import { erpSyncStatus, type ErpSyncStatus } from './sync';

export type HealthLevel = 'off' | 'down' | 'failing' | 'late' | 'practice' | 'ok';

export interface RunView {
  id: string;
  kind: string;
  status: string;
  itemsOk: number;
  itemsFailed: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface SyncHealth {
  level: HealthLevel;
  link: { state: ErpLinkState; mode: string; adapterMode: string | null; provider: string | null; erpCompanyId: string | null; erpWarehouseId: string | null; unavailable: string | null; practiceStock: boolean };
  stock: { lastSuccessAt: string | null; minutesSinceSuccess: number | null; lastError: string | null; late: boolean; pollMinutes: number; lateAfterMinutes: number; resuming: boolean };
  status: ErpSyncStatus;
  recentRuns: RunView[];
  pushes: PushCounts;
  /** PR 608: the v6 event ledger's events that need a person (failed, or repeated with another body). */
  events: { failed: number; conflicts: number };
  holds: HoldSummary;
  lowStockOpen: number;
  auditsOpen: number;
  checkedAt: string;
}

/** The verdict from the facts (pure, for the tests and the page). */
export function healthLevel(f: { link: ErpLinkState; lastPullFailed: boolean; late: boolean; dead: number; failed: number }): HealthLevel {
  if (f.link === 'none') return 'off';
  if (f.link === 'unavailable' || f.dead > 0) return 'down';
  if (f.lastPullFailed || f.failed > 0) return 'failing';
  if (f.link === 'mock') return 'practice';
  if (f.late) return 'late';
  return 'ok';
}

export async function syncHealth(deps: InventoryDeps, who: Who): Promise<SyncHealth> {
  await allow(deps, who, 'inventory.read');
  const now = nowOf(deps);
  const db = deps.db;
  const [link, status, recentN, pollMinutes, lateAfterMinutes] = await Promise.all([
    resolveErp(deps, who.storeId),
    erpSyncStatus(deps, who),
    setting(deps, null, 'inventory.admin.recentRuns'),
    setting(deps, null, 'erp.sync.stockPollMinutes'),
    setting(deps, null, 'inventory.admin.lateAfterMinutes'),
  ]);
  const [runs, pushes, events, holds, lowStockOpen, auditsOpen, state] = await Promise.all([
    db.erpSyncRun.findMany({ where: { storeId: who.storeId }, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], take: recentN }),
    pushCounts(db, who.storeId),
    erpEventProblems(db, who.storeId),
    holdSummary(db, now),
    db.lowStockAlert.count({ where: { resolvedAt: null } }),
    db.stockAudit.count({ where: { status: { in: ['COUNTING', 'REVIEW'] } } }),
    db.erpSyncState.findUnique({ where: { storeId_resource: { storeId: who.storeId, resource: 'stock' } } }),
  ]);
  const lastPull = status.lastRuns.find((r) => r.kind === 'stock.pull');
  const minutesSinceSuccess = state?.lastSuccessAt ? Math.floor((now.getTime() - state.lastSuccessAt.getTime()) / 60_000) : null;
  const syncing = link.state === 'connected' || (link.state === 'mock' && link.stockEnabled);
  const late = syncing && (minutesSinceSuccess == null || minutesSinceSuccess > lateAfterMinutes);
  return {
    level: healthLevel({ link: link.state, lastPullFailed: lastPull?.status === 'FAILED', late, dead: pushes.dead, failed: pushes.failed + events.failed + events.conflicts }),
    link: {
      state: link.state,
      mode: link.setup.mode,
      adapterMode: 'adapterMode' in link ? link.adapterMode : null,
      provider: 'provider' in link ? link.provider : null,
      erpCompanyId: link.setup.erpCompanyId,
      erpWarehouseId: link.setup.erpWarehouseId,
      unavailable: link.state === 'unavailable' ? link.code : null,
      practiceStock: link.state === 'mock' && link.stockEnabled,
    },
    stock: { lastSuccessAt: state?.lastSuccessAt?.toISOString() ?? null, minutesSinceSuccess, lastError: state?.lastError ?? null, late, pollMinutes, lateAfterMinutes, resuming: state?.cursor != null },
    status,
    recentRuns: runs.map((r) => ({ id: r.id, kind: r.kind, status: r.status, itemsOk: r.itemsOk, itemsFailed: r.itemsFailed, error: r.error, startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null })),
    pushes,
    events,
    holds,
    lowStockOpen,
    auditsOpen,
    checkedAt: now.toISOString(),
  };
}
