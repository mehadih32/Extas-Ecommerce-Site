// PR 39 — the product audit report: every product that is not complete, what each one is missing, and (on the
// screen) a one-click route to the place that fixes it. It reads the same publish checklist as the product editor and
// the publish queue (health.ts: one rule everywhere, B7.2 #9); checks switched off are not counted.
//
// - Products whose stored checklist result is missing or older than `catalogue.audit.staleDays` are checked again when
//   the report opens, at most `catalogue.audit.recheckMax` of them each time (the rest follow next time; the report
//   says how many are left), so it stays quick on a big catalogue.
// - It covers every product that is not archived: drafts, ready, live and taken off. A live product that fails a
//   blocking check comes first (it is on the shop half-done).
// - Read-only apart from the stored checklist result (derived data). Needs `catalogue.read`.
import { z } from 'zod';
import { PUBLISH_CHECK_KEYS, type PublishCheckKey } from '@extas/settings';
import { allow, parse, setting, type CatalogueDeps, type Who } from './context';
import { healthBand, readStoredHealth, type CheckResult, type HealthBand } from './health';
import { checkProduct } from './publish';

export const AUDIT_STATUSES = ['all', 'draft', 'ready', 'live', 'off'] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];
const STATUS_OF: Record<Exclude<AuditStatus, 'all'>, string> = { draft: 'DRAFT', ready: 'READY_TO_PUBLISH', live: 'PUBLISHED', off: 'UNPUBLISHED' };

export const auditQuery = z
  .object({ check: z.enum(PUBLISH_CHECK_KEYS).optional(), status: z.enum(AUDIT_STATUSES).optional(), page: z.int().min(1).optional(), recheckSince: z.iso.datetime({ offset: true }).optional() })
  .strict();
export type AuditQuery = z.input<typeof auditQuery>;

export interface AuditItem {
  productId: string;
  nameEn: string;
  nameBn: string | null;
  status: string;
  score: number;
  band: HealthBand;
  /** The checks it fails, in checklist order (block and warn). */
  failing: CheckResult[];
  /** On the shop while a blocking check fails. */
  liveBlocked: boolean;
  checkedAt: string | null;
}

export interface AuditReport {
  items: AuditItem[];
  total: number;
  page: number;
  pageSize: number;
  /** Products that are not archived, and how many of them miss something. */
  products: number;
  incomplete: number;
  /** Miss a blocking check (cannot be published, or are live half-done). */
  blocked: number;
  liveBlocked: number;
  averageScore: number;
  /** Per check that is switched on: how many products fail it. */
  byCheck: { key: PublishCheckKey; level: CheckResult['level']; failing: number }[];
  /** Incomplete products per status. */
  byStatus: Record<AuditStatus, number>;
  /** Checked again this time, and still waiting for a check (next time). */
  rechecked: number;
  waiting: number;
  checkedAt: string;
}

const statusKey = (s: string): Exclude<AuditStatus, 'all'> | null => (Object.entries(STATUS_OF).find(([, v]) => v === s)?.[0] as Exclude<AuditStatus, 'all'> | undefined) ?? null;

/** The audit report (checks stale products again first, within the limit). */
export async function productAudit(deps: CatalogueDeps, who: Who, query: AuditQuery = {}): Promise<AuditReport> {
  await allow(deps, who, 'catalogue.read');
  const q = parse(auditQuery, query, 'audit');
  const [staleDays, recheckMax, pageSize, bands] = await Promise.all([
    setting(deps, who, 'catalogue.audit.staleDays'),
    setting(deps, who, 'catalogue.audit.recheckMax'),
    setting(deps, who, 'catalogue.admin.pageSize'),
    setting(deps, who, 'catalogue.health.bands'),
  ]);
  const now = deps.now?.() ?? new Date();
  const staleBefore = now.getTime() - staleDays * 86_400_000;
  const select = { id: true, nameEn: true, nameBn: true, status: true, healthScore: true, healthIssues: true } as const;
  const where = { storeId: who.storeId, archivedAt: null };

  let rows = await deps.db.product.findMany({ where, select, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  // Never checked first, then the oldest check. "Check all again" (`recheckSince`: the moment it was pressed) counts
  // every product checked before that moment as stale, still within the limit per opening: opening the report again
  // with the same moment carries on where it stopped.
  const lastCheck = (r: (typeof rows)[number]) => {
    const t = Date.parse(readStoredHealth(r.healthIssues)?.checkedAt ?? '');
    return Number.isNaN(t) ? -Infinity : t;
  };
  const cutoff = Math.max(staleBefore, q.recheckSince ? Math.min(Date.parse(q.recheckSince), now.getTime()) : -Infinity);
  const stale = rows.filter((r) => lastCheck(r) < cutoff).sort((a, b) => lastCheck(a) - lastCheck(b));
  const batch = stale.slice(0, recheckMax);
  for (const r of batch) await checkProduct(deps, who, r.id, { stamp: true });
  if (batch.length) rows = await deps.db.product.findMany({ where, select, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });

  const all: AuditItem[] = [];
  const byCheck = new Map<PublishCheckKey, { level: CheckResult['level']; failing: number }>();
  let scoreSum = 0;
  let checked = 0;
  for (const r of rows) {
    const h = readStoredHealth(r.healthIssues);
    if (!h) continue;
    checked++;
    scoreSum += r.healthScore;
    for (const c of h.checks) {
      const e = byCheck.get(c.key) ?? { level: c.level, failing: 0 };
      if (!c.ok) e.failing++;
      byCheck.set(c.key, e);
    }
    const failing = h.checks.filter((c) => !c.ok);
    if (!failing.length) continue;
    const blocked = failing.some((c) => c.level === 'block');
    all.push({
      productId: r.id,
      nameEn: r.nameEn,
      nameBn: r.nameBn,
      status: r.status,
      score: r.healthScore,
      band: healthBand(r.healthScore, bands),
      failing,
      liveBlocked: blocked && r.status === 'PUBLISHED',
      checkedAt: h.checkedAt,
    });
  }
  all.sort((a, b) => Number(b.liveBlocked) - Number(a.liveBlocked) || a.score - b.score || a.nameEn.localeCompare(b.nameEn));

  const byStatus = Object.fromEntries(AUDIT_STATUSES.map((s) => [s, 0])) as Record<AuditStatus, number>;
  for (const i of all) {
    byStatus.all++;
    const k = statusKey(i.status);
    if (k) byStatus[k]++;
  }
  const list = all.filter((i) => (!q.check || i.failing.some((c) => c.key === q.check)) && (!q.status || q.status === 'all' || i.status === STATUS_OF[q.status]));
  const page = q.page ?? 1;
  return {
    items: list.slice((page - 1) * pageSize, page * pageSize),
    total: list.length,
    page,
    pageSize,
    products: rows.length,
    incomplete: all.length,
    blocked: all.filter((i) => i.failing.some((c) => c.level === 'block')).length,
    liveBlocked: all.filter((i) => i.liveBlocked).length,
    averageScore: checked ? Math.round(scoreSum / checked) : 100,
    byCheck: PUBLISH_CHECK_KEYS.filter((k) => byCheck.has(k)).map((k) => ({ key: k, ...byCheck.get(k)! })),
    byStatus,
    rechecked: batch.length,
    waiting: stale.length - batch.length,
    checkedAt: now.toISOString(),
  };
}
