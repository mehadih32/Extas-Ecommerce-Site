// PR 217 — conflicts on the database: every check stores what it finds in SmartRuleConflict (one row per clash, found
// again by its fingerprint), closes the clashes that are gone, and the admin lists the open ones in the banner of
// /admin/rules. "Fix everywhere" replaces a stale hand-written number with the rule's {token}, in the rule's own text
// (a words-only new version, no owner's OK needed) or in the notice. Nothing is deleted: a closed clash keeps its row
// with how it was closed.
import { Prisma } from '@extas/db/client';
import { detectConflicts, fixDrift, type Finding, type OtherText, type SettingFact } from './conflicts';
import { allow, found, logChange, nowOf, parse, setting, TX, type RulesDeps, type Who } from './context';
import { commitContent, loadRules } from './core';
import { RulesError } from './errors';
import { categoryParents } from './facts';
import type { Rule, TextSlot } from './model';
import { toRule } from './rows';
import { z } from 'zod';
import { bustStore } from './cache';

/** Notices as texts for the drift check. */
async function noticeTexts(deps: RulesDeps, storeId: number): Promise<OtherText[]> {
  const rows = await deps.db.notice.findMany({ where: { storeId, archivedAt: null } });
  return rows.map((n) => ({
    id: n.id,
    key: n.key ?? n.id,
    ruleId: n.ruleId,
    texts: [
      { at: 'content.en', text: n.contentEn },
      ...(n.contentBn ? [{ at: 'content.bn', text: n.contentBn }] : []),
      ...(n.titleEn ? [{ at: 'title.en', text: n.titleEn }] : []),
      ...(n.titleBn ? [{ at: 'title.bn', text: n.titleBn }] : []),
    ],
  }));
}

async function settingFacts(deps: RulesDeps, storeId: number): Promise<SettingFact[]> {
  const [windowHours, perItem, freeOver] = await Promise.all([
    setting(deps, storeId, 'policy.exchange.windowHours'),
    setting(deps, storeId, 'policy.exchange.perItem'),
    setting(deps, storeId, 'delivery.freeOverMinor'),
  ]);
  return [
    { key: 'policy.exchange.windowHours', value: windowHours },
    { key: 'policy.exchange.perItem', value: perItem },
    { key: 'delivery.freeOverMinor', value: freeOver },
  ];
}

/** Everything the detector needs for a store; `swap` puts a candidate in place of its rule (the preview). */
export async function conflictInput(deps: RulesDeps, storeId: number, swap?: Rule) {
  const [{ rules }, notices, settings, parents, currency] = await Promise.all([
    loadRules(deps.db, storeId),
    noticeTexts(deps, storeId),
    settingFacts(deps, storeId),
    categoryParents(deps.db, storeId),
    setting(deps, storeId, 'store.currency'),
  ]);
  const list = swap ? [...rules.filter((r) => r.id !== swap.id), swap] : rules;
  return { rules: list, notices, settings, parents, currency, now: nowOf(deps) };
}

export interface RefreshResult {
  open: number;
  added: number;
  closed: number;
}

/** Runs the check for a store and stores it (no permission: called after every publish and by the job). */
export async function refreshConflicts(deps: RulesDeps, storeId: number): Promise<RefreshResult> {
  const findings = detectConflicts(await conflictInput(deps, storeId));
  const now = nowOf(deps);
  const prints = new Set(findings.map((f) => f.fingerprint));
  return deps.db.$transaction(async (tx) => {
    let added = 0;
    for (const f of findings) {
      const ruleB = f.other.type === 'rule' ? f.other.id : f.ruleA;
      const detail = { ...f.detail, slot: f.slot, decidedBy: f.decidedBy, other: f.other } as Prisma.InputJsonValue;
      const had = await tx.smartRuleConflict.findUnique({ where: { storeId_fingerprint: { storeId, fingerprint: f.fingerprint } } });
      if (!had) {
        await tx.smartRuleConflict.create({ data: { storeId, ruleAId: f.ruleA, ruleBId: ruleB, kind: f.kind, otherType: f.other.type, fingerprint: f.fingerprint, detail, winnerRuleId: f.winner } });
        added++;
      } else if (had.resolvedAt && had.resolution === 'gone') {
        // It came back: open again.
        await tx.smartRuleConflict.update({ where: { id: had.id }, data: { resolvedAt: null, resolution: null, resolvedById: null, detail, winnerRuleId: f.winner } });
        added++;
      } else {
        await tx.smartRuleConflict.update({ where: { id: had.id }, data: { detail, winnerRuleId: f.winner } });
      }
    }
    const stale = await tx.smartRuleConflict.findMany({ where: { storeId, resolvedAt: null }, select: { id: true, fingerprint: true } });
    const gone = stale.filter((c) => !c.fingerprint || !prints.has(c.fingerprint)).map((c) => c.id);
    if (gone.length) await tx.smartRuleConflict.updateMany({ where: { id: { in: gone } }, data: { resolvedAt: now, resolution: 'gone' } });
    const open = await tx.smartRuleConflict.count({ where: { storeId, resolvedAt: null } });
    return { open, added, closed: gone.length };
  }, TX);
}

export interface ConflictView {
  id: string;
  kind: string;
  otherType: string;
  ruleA: { id: string; key: string; nameEn: string; nameBn: string | null } | null;
  ruleB: { id: string; key: string; nameEn: string; nameBn: string | null } | null;
  /** The other side's id: a rule, a notice, or ruleA again for a setting. */
  otherId: string;
  /** What is contested, e.g. `deliveryCharge:dhaka-city` or `text.short.en`. */
  slot: string;
  winnerRuleId: string | null;
  detail: Record<string, unknown>;
  /** Can "Fix everywhere" fix it (a text drift with a token to put in)? */
  fixable: boolean;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

/** The open clashes (or all with `includeResolved`), newest first. */
export async function listConflicts(deps: RulesDeps, who: Who, opts: { includeResolved?: boolean; ruleId?: string } = {}): Promise<ConflictView[]> {
  await allow(deps, who, 'rules.read');
  const rows = await deps.db.smartRuleConflict.findMany({
    where: { storeId: who.storeId, ...(opts.includeResolved ? {} : { resolvedAt: null }), ...(opts.ruleId ? { OR: [{ ruleAId: opts.ruleId }, { ruleBId: opts.ruleId }] } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const ids = [...new Set(rows.flatMap((r) => [r.ruleAId, r.ruleBId]))];
  const rules = await deps.db.smartRule.findMany({ where: { id: { in: ids } }, select: { id: true, key: true, nameEn: true, nameBn: true } });
  const byId = new Map(rules.map((r) => [r.id, r]));
  return rows.map((r) => {
    const detail = (r.detail ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      kind: r.kind,
      otherType: r.otherType,
      ruleA: byId.get(r.ruleAId) ?? null,
      ruleB: r.otherType === 'rule' ? (byId.get(r.ruleBId) ?? null) : null,
      otherId: typeof (detail.other as { id?: unknown } | undefined)?.id === 'string' ? (detail.other as { id: string }).id : r.ruleBId,
      slot: typeof detail.slot === 'string' ? detail.slot : '',
      winnerRuleId: r.winnerRuleId,
      detail,
      fixable: r.kind === 'TEXT_DRIFT' && typeof detail.token === 'string' && !r.resolvedAt,
      resolution: r.resolution,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

const resolveSchema = z.object({ resolution: z.enum(['keep-order', 'acknowledged']), note: z.string().trim().max(500).optional() }).strict();

/**
 * Accepts a clash as it is: `keep-order` (the resolution order's winner stays the winner) or `acknowledged` (a drift
 * the owner wants to keep, e.g. a sentence about something else). A clash fixed by changing a rule closes by itself
 * on the next check.
 */
export async function resolveConflict(deps: RulesDeps, who: Who, id: string, input: unknown): Promise<ConflictView> {
  await allow(deps, who, 'rules.publish');
  const b = parse(resolveSchema, input, 'resolution');
  const row = found(await deps.db.smartRuleConflict.findFirst({ where: { id, storeId: who.storeId } }), 'conflict');
  if (row.resolvedAt) throw new RulesError('CONFLICT', 'this clash is closed already');
  await deps.db.$transaction(async (tx) => {
    await tx.smartRuleConflict.update({ where: { id }, data: { resolvedAt: nowOf(deps), resolution: b.resolution, resolvedById: who.actor.staffUserId } });
    await logChange(tx, who, { action: 'rule.conflict.resolve', entityType: 'SmartRuleConflict', entityId: id, before: { kind: row.kind }, after: { resolution: b.resolution, note: b.note ?? null } });
  });
  return (await listConflicts(deps, who, { includeResolved: true })).find((c) => c.id === id)!;
}

/** "Fix everywhere" for one text drift. */
export async function fixConflict(deps: RulesDeps, who: Who, id: string): Promise<{ fixed: boolean }> {
  await allow(deps, who, 'rules.publish');
  const row = found(await deps.db.smartRuleConflict.findFirst({ where: { id, storeId: who.storeId } }), 'conflict');
  if (row.resolvedAt) throw new RulesError('CONFLICT', 'this clash is closed already');
  const detail = (row.detail ?? {}) as Record<string, unknown>;
  const finding: Pick<Finding, 'kind' | 'detail'> = { kind: row.kind as Finding['kind'], detail };
  const at = String(detail.slot ?? '');
  const other = detail.other as Finding['other'] | undefined;
  if (row.kind !== 'TEXT_DRIFT' || !other) throw new RulesError('CANNOT_FIX', 'only a number written by hand can be fixed for you');

  if (other.type === 'rule') {
    const ruleRow = found(await deps.db.smartRule.findFirst({ where: { id: other.id, storeId: who.storeId } }), 'rule');
    const rule = toRule(ruleRow);
    const m = /^text\.([a-z]+)\.(en|bn)$/.exec(at);
    if (!rule || !m) throw new RulesError('CANNOT_FIX', 'the text cannot be read');
    const slot = m[1] as TextSlot;
    const lang = m[2] as 'en' | 'bn';
    const current = rule.text[slot]?.[lang];
    const next = current ? fixDrift(current, finding) : null;
    if (!next) throw new RulesError('CANNOT_FIX', 'the text no longer has this number');
    const { id: _id, version: _v, archived: _a, ...content } = rule;
    const text = { ...content.text, [slot]: { ...content.text[slot]!, [lang]: next } };
    await commitContent(deps, who, ruleRow, { ...content, text }, { action: 'rule.fixText', changeNote: `Fix everywhere: ${String(detail.literal)} → ${String(detail.token)}`, expectVersion: ruleRow.version });
    // A saved draft gets the same fix, so publishing it later does not bring the stale number back.
    if (ruleRow.draft) {
      const d = ruleRow.draft as { text?: Record<string, Record<string, string>> };
      const dt = d.text?.[slot]?.[lang];
      const dn = dt ? fixDrift(dt, finding) : null;
      if (dn) await deps.db.smartRule.update({ where: { id: ruleRow.id }, data: { draft: { ...d, text: { ...d.text, [slot]: { ...d.text![slot], [lang]: dn } } } as Prisma.InputJsonValue } });
    }
  } else if (other.type === 'notice') {
    const n = found(await deps.db.notice.findFirst({ where: { id: other.id, storeId: who.storeId } }), 'notice');
    const m = /^(content|title)\.(en|bn)$/.exec(at);
    if (!m) throw new RulesError('CANNOT_FIX', 'the text cannot be read');
    const field = `${m[1]}${m[2] === 'en' ? 'En' : 'Bn'}` as 'contentEn' | 'contentBn' | 'titleEn' | 'titleBn';
    const current = n[field];
    const next = current ? fixDrift(current, finding) : null;
    if (!next) throw new RulesError('CANNOT_FIX', 'the text no longer has this number');
    await deps.db.$transaction(async (tx) => {
      await tx.notice.update({ where: { id: n.id }, data: { [field]: next, version: n.version + 1, updatedById: who.actor.staffUserId } });
      await logChange(tx, who, { action: 'notice.fixText', entityType: 'Notice', entityId: n.id, before: { [field]: current, version: n.version }, after: { [field]: next, version: n.version + 1 } });
    });
    bustStore(who.storeId);
  } else throw new RulesError('CANNOT_FIX', 'a setting is changed on its own page');

  await refreshConflicts(deps, who.storeId);
  return { fixed: true };
}

/** "Fix everywhere" for every open text drift that can be fixed. */
export async function fixAllConflicts(deps: RulesDeps, who: Who): Promise<{ fixed: number; left: number }> {
  await allow(deps, who, 'rules.publish');
  let fixed = 0;
  // One at a time: each fix re-checks, so a later drift on the same text is found again with its new place.
  for (let guard = 0; guard < 200; guard++) {
    const next = (await listConflicts(deps, who)).find((c) => c.fixable);
    if (!next) break;
    try {
      await fixConflict(deps, who, next.id);
      fixed++;
    } catch (e) {
      if (!(e instanceof RulesError) || e.code !== 'CANNOT_FIX') throw e;
      await deps.db.smartRuleConflict.update({ where: { id: next.id }, data: { detail: { ...next.detail, token: null } as Prisma.InputJsonValue } });
    }
  }
  const left = await deps.db.smartRuleConflict.count({ where: { storeId: who.storeId, resolvedAt: null } });
  return { fixed, left };
}

/** Open clash counts per rule id (for the list). */
export async function openConflictCounts(deps: RulesDeps, storeId: number): Promise<Map<string, number>> {
  const rows = await deps.db.smartRuleConflict.findMany({ where: { storeId, resolvedAt: null }, select: { ruleAId: true, ruleBId: true } });
  const m = new Map<string, number>();
  for (const r of rows) for (const id of new Set([r.ruleAId, r.ruleBId])) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}
