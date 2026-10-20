// The heart of the rule services: reading a store's rules, and committing a new version of one. Every change that
// reaches customers goes through `commitContent`: it checks the rule (PR 208, 215), asks for the owner's OK when the
// change moves money (CLAUDE.md rule 6), writes the new version with its snapshot (PR 218) and the audit row in one
// transaction, and drops the storefront's cached copy.
import { Prisma } from '@extas/db/client';
import { checkRule, blocking, type CheckLimits, type Issue } from './check';
import { cached, bustStore } from './cache';
import { checkLimits, holds, logChange, nowOf, setting, textContext, TX, type Db, type RulesDeps, type Who } from './context';
import { RulesError } from './errors';
import { diffContent, moneyChanges, type Change } from './history';
import { needsOwnerOk, TEXT_SLOTS, type Rule, type RuleContent, type TextSlot } from './model';
import { asJson, contentColumns, toRule, type RuleRow } from './rows';
import { ruleText, type Lang, type TextContext, type WindowedParams } from './text';

export interface StoreRules {
  rows: RuleRow[];
  /** Every row that parses, archived ones included. */
  rules: Rule[];
  /** Rows whose stored content does not parse (shown as broken, never used). */
  broken: string[];
}

export async function loadRules(db: Db, storeId: number): Promise<StoreRules> {
  const rows = await db.smartRule.findMany({ where: { storeId }, orderBy: [{ kind: 'asc' }, { priority: 'desc' }, { key: 'asc' }] });
  const rules: Rule[] = [];
  const broken: string[] = [];
  for (const row of rows) {
    const r = toRule(row);
    if (r) rules.push(r);
    else broken.push(row.id);
  }
  return { rows, rules, broken };
}

/** The live rules of a store (active, not archived; the window is checked by the engine at its own clock). */
export async function activeRules(db: Db, storeId: number): Promise<Rule[]> {
  const rows = await db.smartRule.findMany({ where: { storeId, archivedAt: null, status: 'ACTIVE' } });
  return rows.map(toRule).filter((r): r is Rule => r !== null);
}

/** The storefront's copy of the live rules (kept for `rules.public.cacheSeconds`). */
export async function cachedActiveRules(deps: RulesDeps, storeId: number): Promise<Rule[]> {
  const seconds = await setting(deps, storeId, 'rules.public.cacheSeconds');
  return cached(`rules@${storeId}`, seconds * 1000, nowOf(deps).getTime(), () => activeRules(deps.db, storeId));
}

/** Rules by key for `{rule-key.param}` tokens; `swap` replaces one rule (a candidate being previewed). */
export function othersByKey(rules: readonly Rule[], swap?: Rule): Map<string, WindowedParams> {
  const m = new Map<string, WindowedParams>();
  for (const r of rules) if (!r.archived) m.set(r.key, r);
  if (swap) m.set(swap.key, swap);
  return m;
}

/** The text context of one language, keeping the store's region (bn-BD → en-BD). */
export function langContext(ctx: TextContext, lang: Lang): TextContext {
  const region = ctx.locale.split('-')[1];
  return { ...ctx, locale: region ? `${lang}-${region}` : lang };
}

export interface RenderedSlot {
  text: string;
  ok: boolean;
  missing: string[];
  unknown: string[];
  /** The language actually used (English when the Bengali is not written). */
  lang: Lang;
}

export type RenderedTexts = Partial<Record<TextSlot, Partial<Record<Lang, RenderedSlot>>>>;

/** Every written slot of a rule, filled in, in both languages (the admin's "Customers see:" preview). */
export function renderAll(rule: Rule | RuleContent, ctx: TextContext, others: ReadonlyMap<string, WindowedParams>): RenderedTexts {
  const out: RenderedTexts = {};
  for (const slot of TEXT_SLOTS) {
    if (!rule.text[slot]) continue;
    const per: Partial<Record<Lang, RenderedSlot>> = {};
    for (const lang of ['en', 'bn'] as const) {
      const r = ruleText(rule, slot, langContext(ctx, lang), { others });
      if (r) per[lang] = { text: r.text, ok: r.ok, missing: r.missing, unknown: r.unknown, lang: r.lang };
    }
    out[slot] = per;
  }
  return out;
}

/** The limits plus the store's other rules (for tokens naming another rule). */
export async function limitsFor(deps: RulesDeps, storeId: number, rules: readonly Rule[], self?: Rule | RuleContent): Promise<CheckLimits> {
  const base = await checkLimits(deps, storeId);
  const others = new Map<string, WindowedParams>();
  for (const r of rules) if (!r.archived && r.key !== self?.key) others.set(r.key, r);
  if (self) others.set(self.key, self);
  return { ...base, others };
}

export const issueLine = (i: Issue) => `${i.code}@${i.at}${i.subject ? `:${i.subject}` : ''}`;

export interface CommitOptions {
  action: string;
  changeNote?: string | null;
  /** Clear the saved draft (publishing it). */
  clearDraft?: boolean;
  /** Archive or restore together with this version. */
  archivedAt?: Date | null;
  /** The row's version the caller saw; a different one means someone else published in between. */
  expectVersion?: number;
}

export interface CommitResult {
  row: RuleRow;
  changes: Change[];
  money: Change[];
  ownerOk: boolean;
}

/** The owner's-OK question for a change from `live` to `next` (exported for the preview and the tests). */
export function ownerOkNeeded(live: RuleContent | null, next: RuleContent, archivedChange = false): { needed: boolean; changes: Change[]; money: Change[] } {
  const changes = live ? diffContent(live, next) : diffContent({ ...next, status: 'DRAFT', params: [], actions: [] }, next);
  const money = moneyChanges(changes);
  const moves = needsOwnerOk(next) || (live !== null && needsOwnerOk(live));
  const touchesLive = next.status === 'ACTIVE' || live?.status === 'ACTIVE';
  return { needed: moves && touchesLive && (money.length > 0 || archivedChange), changes, money };
}

/**
 * Writes `content` as the rule's next version. Refuses an incomplete rule going live (RULE_INCOMPLETE), a money change
 * without the owner's OK (OWNER_OK_REQUIRED), and a changed key or kind (KEY_FIXED).
 */
export async function commitContent(deps: RulesDeps, who: Who, row: RuleRow, content: RuleContent, opts: CommitOptions): Promise<CommitResult> {
  if (content.key !== row.key || content.kind !== row.kind) throw new RulesError('KEY_FIXED', 'the key and the kind of a rule stay as they are', ['key', 'kind']);
  if (opts.expectVersion !== undefined && opts.expectVersion !== row.version) throw new RulesError('STALE_DRAFT', 'someone published this rule since it was opened', [`version:${row.version}`]);
  const archiving = opts.archivedAt !== undefined && (opts.archivedAt === null) !== (row.archivedAt === null);
  if (row.archivedAt && opts.archivedAt === undefined) throw new RulesError('RULE_ARCHIVED', 'the rule is archived; restore it first');

  const { rules } = await loadRules(deps.db, who.storeId);
  const live = toRule(row);
  const [limits, ctx] = await Promise.all([limitsFor(deps, who.storeId, rules, content), textContext(deps, who.storeId)]);
  const issues = blocking(checkRule(content, limits, ctx, content.status === 'ACTIVE'));
  if (issues.length) throw new RulesError('RULE_INCOMPLETE', 'the rule cannot be saved like this', issues.map(issueLine));

  const ok = ownerOkNeeded(live, content, archiving);
  if (ok.needed && !(await holds(deps, who, 'rules.approve'))) {
    throw new RulesError('OWNER_OK_REQUIRED', "this change moves money and needs the owner's OK", ok.money.map((c) => c.path));
  }
  const now = nowOf(deps);
  const approval = ok.needed ? { approvedById: who.actor.staffUserId, approvedAt: now } : ok.money.length ? { approvedById: null, approvedAt: null } : {};
  const nextVersion = row.version + 1;

  const updated = await deps.db.$transaction(async (tx) => {
    const res = await tx.smartRule.updateMany({
      where: { id: row.id, version: row.version },
      data: {
        ...contentColumns(content),
        version: nextVersion,
        needsOwnerOk: needsOwnerOk(content),
        ...approval,
        ...(opts.clearDraft ? { draft: Prisma.DbNull, draftById: null, draftAt: null } : {}),
        ...(opts.archivedAt !== undefined ? { archivedAt: opts.archivedAt } : {}),
        updatedById: who.actor.staffUserId,
      },
    });
    if (res.count !== 1) throw new RulesError('STALE_DRAFT', 'someone published this rule at the same moment', [`version:${row.version}`]);
    await tx.smartRuleVersion.create({
      data: { storeId: who.storeId, ruleId: row.id, version: nextVersion, snapshot: asJson(content), changeNote: opts.changeNote?.trim() || null, actorId: who.actor.staffUserId },
    });
    await logChange(tx, who, {
      action: opts.action,
      entityType: 'SmartRule',
      entityId: row.id,
      before: live ? { ...live, version: row.version } : { version: row.version },
      after: { version: nextVersion, ...content, archived: opts.archivedAt !== undefined ? opts.archivedAt !== null : row.archivedAt !== null, ownerOk: ok.needed, changed: ok.changes.map((c) => c.path) },
    });
    return tx.smartRule.findUniqueOrThrow({ where: { id: row.id } });
  }, TX);
  bustStore(who.storeId);
  return { row: updated, changes: ok.changes, money: ok.money, ownerOk: ok.needed };
}

/** The first version of a new rule (status as given, normally DRAFT). */
export async function insertRule(deps: RulesDeps, who: Who, content: RuleContent, changeNote: string | null, db: Db = deps.db): Promise<RuleRow> {
  const taken = await db.smartRule.findUnique({ where: { storeId_key: { storeId: who.storeId, key: content.key } }, select: { id: true } });
  if (taken) throw new RulesError('KEY_TAKEN', 'a rule with this key exists', [content.key]);
  const row = await db.smartRule.create({
    data: { storeId: who.storeId, ...contentColumns(content), version: 1, needsOwnerOk: needsOwnerOk(content), createdById: who.actor.staffUserId, updatedById: who.actor.staffUserId },
  });
  await db.smartRuleVersion.create({ data: { storeId: who.storeId, ruleId: row.id, version: 1, snapshot: asJson(content), changeNote, actorId: who.actor.staffUserId } });
  await logChange(db, who, { action: 'rule.create', entityType: 'SmartRule', entityId: row.id, before: null, after: { version: 1, ...content } });
  return row;
}
