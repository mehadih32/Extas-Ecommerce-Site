// The rules' background work, shaped as jobs a BullMQ worker (PR 6) calls with a small JSON payload. Until that worker
// exists the same functions run inline (tests, the admin's "check now").
//
// - `rules.endExpired` {storeId?} — a live rule whose window has closed becomes ENDED, as a new version by the system
//   (the engine already ignores it at its end; this makes the list and the history say so). Ending a festive or
//   discount campaign at its own end date is what the owner set: no new OK is needed for it.
// - `rules.checkConflicts` {storeId} — the conflict check (PR 217), also run after every publish.
import { SYSTEM } from '@extas/auth';
import { bustStore } from './cache';
import { logChange, nowOf, TX, type RulesDeps } from './context';
import { refreshConflicts, type RefreshResult } from './conflicts-service';
import { asJson, toRule } from './rows';

export const RULES_QUEUE = 'rules';

export type RulesJob = { name: 'rules.endExpired'; storeId?: number } | { name: 'rules.checkConflicts'; storeId: number };

export async function endExpiredRules(deps: RulesDeps, opts: { storeId?: number } = {}): Promise<{ ended: number }> {
  const now = nowOf(deps);
  const rows = await deps.db.smartRule.findMany({ where: { status: 'ACTIVE', archivedAt: null, endsAt: { lte: now }, ...(opts.storeId ? { storeId: opts.storeId } : {}) } });
  let ended = 0;
  for (const row of rows) {
    const rule = toRule(row);
    if (!rule) continue;
    const { id: _id, version: _v, archived: _a, ...content } = rule;
    const next = { ...content, status: 'ENDED' as const };
    const done = await deps.db.$transaction(async (tx) => {
      const res = await tx.smartRule.updateMany({ where: { id: row.id, version: row.version, status: 'ACTIVE' }, data: { status: 'ENDED', version: row.version + 1 } });
      if (res.count !== 1) return false;
      await tx.smartRuleVersion.create({ data: { storeId: row.storeId, ruleId: row.id, version: row.version + 1, snapshot: asJson(next), changeNote: 'Ended at its end date', actorId: null } });
      await logChange(tx, { actor: SYSTEM, storeId: row.storeId, ctx: { source: 'job' } }, { action: 'rule.end', entityType: 'SmartRule', entityId: row.id, before: { status: 'ACTIVE', version: row.version }, after: { status: 'ENDED', version: row.version + 1 } });
      return true;
    }, TX);
    if (done) {
      ended++;
      bustStore(row.storeId);
    }
  }
  return { ended };
}

export async function runRulesJob(deps: RulesDeps, job: RulesJob): Promise<{ ended: number } | RefreshResult> {
  switch (job.name) {
    case 'rules.endExpired':
      return endExpiredRules(deps, { storeId: job.storeId });
    case 'rules.checkConflicts':
      return refreshConflicts(deps, job.storeId);
  }
}
