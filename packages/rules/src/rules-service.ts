// PR 208, 209, 218 — the rules on the database, as the admin's Smart Rules page uses them:
//   list · open one · new (from a template, or blank) · save a draft · discard it · preview · publish · pause / switch on
//   · archive / restore · history · bring an old version back (as the draft) · the store's starter rules.
// A rule is changed only by publishing a new version (core.ts commitContent): the draft is the candidate, shown in the
// live preview and simulated (PR 219) before anyone sees it. Nothing is ever deleted (CLAUDE.md rule 3).
import { Prisma } from '@extas/db/client';
import { z } from 'zod';
import { checkRule, textTokens, type Issue } from './check';
import { detectConflicts, type Finding } from './conflicts';
import { conflictInput, openConflictCounts, refreshConflicts } from './conflicts-service';
import { allow, found, holds, logChange, nowOf, parse, setting, textContext, type RulesDeps, type Who } from './context';
import { commitContent, insertRule, issueLine, langContext, limitsFor, loadRules, othersByKey, ownerOkNeeded, renderAll, type RenderedTexts } from './core';
import { RulesError } from './errors';
import { diffContent, moneyChanges, type Change } from './history';
import { isLive, needsOwnerOk, paramOf, RULE_KINDS, ruleContentSchema, ruleKeySchema, ruleKindSchema, ruleStatusSchema, type Rule, type RuleContent } from './model';
import { asJson, draftRule, parseContent, toRule, type RuleRow } from './rows';
import { blankContent, contentFromTemplate, TEMPLATES, templateById } from './templates';
import { formatValue, render, ruleLookup, tokensIn } from './text';

// ---------------------------------------------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------------------------------------------

export interface RuleSummary {
  id: string;
  key: string;
  kind: string;
  nameEn: string;
  nameBn: string | null;
  status: string;
  /** Active and inside its window now. */
  live: boolean;
  version: number;
  archived: boolean;
  hasDraft: boolean;
  draftAt: string | null;
  needsOwnerOk: boolean;
  approvedAt: string | null;
  priority: number;
  placements: string[];
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string;
  /** The short version as written (with its tokens), English and Bengali. */
  short: { en: string | null; bn: string | null };
  /** The stored content does not parse (a hand edit in the database): shown, never used. */
  broken: boolean;
  openConflicts: number;
}

function summary(row: RuleRow, rule: Rule | null, now: Date, conflicts: Map<string, number>): RuleSummary {
  const text = (row.text ?? {}) as { short?: { en?: string; bn?: string } };
  return {
    id: row.id,
    key: row.key,
    kind: row.kind,
    nameEn: row.nameEn,
    nameBn: row.nameBn,
    status: row.status,
    live: rule ? isLive(rule, now) : false,
    version: row.version,
    archived: row.archivedAt !== null,
    hasDraft: row.draft !== null,
    draftAt: row.draftAt?.toISOString() ?? null,
    needsOwnerOk: row.needsOwnerOk,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    priority: row.priority,
    placements: row.placements,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    short: { en: text.short?.en ?? null, bn: text.short?.bn ?? null },
    broken: rule === null,
    openConflicts: conflicts.get(row.id) ?? 0,
  };
}

const listSchema = z.object({ kind: ruleKindSchema.optional(), includeArchived: z.boolean().optional() }).strict();

/** The store's rules, by kind then priority; archived ones only when asked. Counts per kind for the topic chips. */
export async function listRules(deps: RulesDeps, who: Who, input: unknown = {}): Promise<{ rules: RuleSummary[]; counts: Record<string, number> }> {
  await allow(deps, who, 'rules.read');
  const q = parse(listSchema, input, 'filter');
  const [{ rows }, conflicts] = await Promise.all([loadRules(deps.db, who.storeId), openConflictCounts(deps, who.storeId)]);
  const now = nowOf(deps);
  const visible = rows.filter((r) => q.includeArchived || r.archivedAt === null);
  const counts: Record<string, number> = Object.fromEntries(RULE_KINDS.map((k) => [k, 0]));
  for (const r of visible) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  return { rules: visible.filter((r) => !q.kind || r.kind === q.kind).map((r) => summary(r, toRule(r), now, conflicts)), counts };
}

export interface TokenInfo {
  token: string;
  /** The param's label, or null for a built-in or another rule's value. */
  labelEn: string | null;
  labelBn: string | null;
  /** The value as a customer reads it in English; null = not set. */
  shown: string | null;
}

export interface RuleView {
  id: string;
  key: string;
  kind: string;
  version: number;
  archived: boolean;
  needsOwnerOk: boolean;
  approvedAt: string | null;
  approvedById: string | null;
  updatedAt: string;
  /** The live version (null when broken). */
  live: RuleContent | null;
  /** The saved draft, if any. */
  draft: RuleContent | null;
  draftAt: string | null;
  draftById: string | null;
  /** The texts of the draft (or the live version), filled in, as customers would read them. */
  texts: RenderedTexts;
  tokens: TokenInfo[];
  issues: Issue[];
  /** May this person give the owner's OK (rules.approve)? */
  canApprove: boolean;
  liveNow: boolean;
}

function strip(r: Rule): RuleContent {
  const { id: _id, version: _version, archived: _archived, ...content } = r;
  return content;
}

async function view(deps: RulesDeps, who: Who, row: RuleRow): Promise<RuleView> {
  const [{ rules }, ctx, canApprove] = await Promise.all([loadRules(deps.db, who.storeId), textContext(deps, who.storeId), holds(deps, who, 'rules.approve')]);
  const live = toRule(row);
  const draft = draftRule(row);
  const shown = draft ?? live;
  const limits = await limitsFor(deps, who.storeId, rules, shown ?? undefined);
  const others = othersByKey(rules, shown ?? undefined);
  const enCtx = langContext(ctx, 'en');
  const tokens: TokenInfo[] = shown
    ? textTokens(shown).map((raw) => {
        const ref = tokensIn(raw)[0]!;
        const p = ref.rule ? undefined : paramOf(shown, ref.key);
        const r = ruleLookup(shown, { others })(ref);
        return { token: raw, labelEn: p?.labelEn ?? null, labelBn: p?.labelBn ?? null, shown: r ? formatValue(r.type, r.value, enCtx) : null };
      })
    : [];
  return {
    id: row.id,
    key: row.key,
    kind: row.kind,
    version: row.version,
    archived: row.archivedAt !== null,
    needsOwnerOk: row.needsOwnerOk,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvedById: row.approvedById,
    updatedAt: row.updatedAt.toISOString(),
    live: live ? strip(live) : null,
    draft: draft ? strip(draft) : null,
    draftAt: row.draftAt?.toISOString() ?? null,
    draftById: row.draftById,
    texts: shown ? renderAll(shown, ctx, others) : {},
    tokens,
    issues: shown ? checkRule(shown, limits, ctx, shown.status === 'ACTIVE') : [],
    canApprove,
    liveNow: live ? isLive(live, nowOf(deps)) : false,
  };
}

const ruleRow = async (deps: RulesDeps, who: Who, id: string) => found(await deps.db.smartRule.findFirst({ where: { id, storeId: who.storeId } }), 'rule');

/** One rule with its draft, its filled-in texts and its issues. */
export async function getRule(deps: RulesDeps, who: Who, id: string): Promise<RuleView> {
  await allow(deps, who, 'rules.read');
  return view(deps, who, await ruleRow(deps, who, id));
}

// ---------------------------------------------------------------------------------------------------------------
// New rules
// ---------------------------------------------------------------------------------------------------------------

const createSchema = z
  .object({
    templateId: ruleKeySchema.optional(),
    key: ruleKeySchema.optional(),
    kind: ruleKindSchema.optional(),
    nameEn: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .refine((b) => b.templateId || (b.key && b.kind && b.nameEn), { message: 'a template, or a key, a kind and a name' });

async function templateSettings(deps: RulesDeps, storeId: number) {
  return { value: (key: Parameters<typeof setting>[2]) => setting(deps, storeId, key) as Promise<unknown> };
}

/** A new rule, always as a draft: from a template (its values empty or copied from settings) or blank. */
export async function createRule(deps: RulesDeps, who: Who, input: unknown): Promise<RuleView> {
  await allow(deps, who, 'rules.write');
  const b = parse(createSchema, input, 'new rule');
  let content: RuleContent;
  if (b.templateId) {
    const t = templateById(b.templateId);
    if (!t) throw new RulesError('NOT_FOUND', 'no such template', [b.templateId]);
    const placements = (await setting(deps, who.storeId, 'rules.placements')).map((p) => p.key);
    content = await contentFromTemplate(t, await templateSettings(deps, who.storeId), { key: b.key, placements });
    if (b.nameEn) content = { ...content, nameEn: b.nameEn };
  } else content = blankContent(b.key!, b.kind!, b.nameEn!);
  const row = await deps.db.$transaction((tx) => insertRule(deps, who, content, b.templateId ? `From the template "${b.templateId}"` : null, tx));
  return view(deps, who, row);
}

/** The templates, with whether this store already has a rule of that key. */
export async function listTemplates(deps: RulesDeps, who: Who) {
  await allow(deps, who, 'rules.read');
  const keys = new Set((await deps.db.smartRule.findMany({ where: { storeId: who.storeId }, select: { key: true } })).map((r) => r.key));
  return TEMPLATES.map((t) => ({ id: t.id, kind: t.kind, nameEn: t.nameEn, nameBn: t.nameBn ?? null, starter: t.starter === true, exists: keys.has(t.id), movesMoney: needsOwnerOk(t) }));
}

/** The store's first rules: every starter template it does not have yet, as drafts (nothing reaches customers). */
export async function addStarterRules(deps: RulesDeps, who: Who): Promise<{ created: string[] }> {
  await allow(deps, who, 'rules.write');
  const existing = new Set((await deps.db.smartRule.findMany({ where: { storeId: who.storeId }, select: { key: true } })).map((r) => r.key));
  const placements = (await setting(deps, who.storeId, 'rules.placements')).map((p) => p.key);
  const s = await templateSettings(deps, who.storeId);
  const created: string[] = [];
  for (const t of TEMPLATES.filter((x) => x.starter && !existing.has(x.id))) {
    const content = await contentFromTemplate(t, s, { placements });
    await deps.db.$transaction((tx) => insertRule(deps, who, content, 'Starter rule', tx));
    created.push(t.id);
  }
  return { created };
}

// ---------------------------------------------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------------------------------------------

const draftSchema = z.object({ content: z.unknown(), version: z.int().min(1).optional() }).strict();

/** Saves the candidate (it may be incomplete: the answer lists what is missing). Live customers see nothing of it. */
export async function saveDraft(deps: RulesDeps, who: Who, id: string, input: unknown): Promise<RuleView> {
  await allow(deps, who, 'rules.write');
  const b = parse(draftSchema, input, 'draft');
  const content = parse(ruleContentSchema, b.content, 'rule');
  const row = await ruleRow(deps, who, id);
  if (row.archivedAt) throw new RulesError('RULE_ARCHIVED', 'the rule is archived; restore it first');
  if (content.key !== row.key || content.kind !== row.kind) throw new RulesError('KEY_FIXED', 'the key and the kind of a rule stay as they are', ['key', 'kind']);
  if (b.version !== undefined && b.version !== row.version) throw new RulesError('STALE_DRAFT', 'someone published this rule since it was opened', [`version:${row.version}`]);
  await deps.db.$transaction(async (tx) => {
    await tx.smartRule.update({ where: { id }, data: { draft: asJson(content), draftById: who.actor.staffUserId, draftAt: nowOf(deps) } });
    await logChange(tx, who, { action: 'rule.draft.save', entityType: 'SmartRule', entityId: id, before: row.draft ?? null, after: content });
  });
  return view(deps, who, await ruleRow(deps, who, id));
}

export async function discardDraft(deps: RulesDeps, who: Who, id: string): Promise<RuleView> {
  await allow(deps, who, 'rules.write');
  const row = await ruleRow(deps, who, id);
  if (!row.draft) throw new RulesError('NOTHING_TO_PUBLISH', 'there is no draft');
  await deps.db.$transaction(async (tx) => {
    await tx.smartRule.update({ where: { id }, data: { draft: Prisma.DbNull, draftById: null, draftAt: null } });
    await logChange(tx, who, { action: 'rule.draft.discard', entityType: 'SmartRule', entityId: id, before: row.draft, after: null });
  });
  return view(deps, who, await ruleRow(deps, who, id));
}

// ---------------------------------------------------------------------------------------------------------------
// Preview (PR 209 "Preview changes")
// ---------------------------------------------------------------------------------------------------------------

export interface PlaceChange {
  placement: string;
  labelEn: string;
  labelBn: string;
  before: string | null;
  after: string | null;
  change: 'added' | 'removed' | 'changed' | 'same';
}

export interface QuotingText {
  type: 'rule' | 'notice';
  id: string;
  key: string;
  nameEn: string;
  before: string;
  after: string;
}

export interface RulePreview {
  places: PlaceChange[];
  /** Other rules and notices that quote this rule's values: they change with it. */
  quotedBy: QuotingText[];
  texts: RenderedTexts;
  issues: Issue[];
  changes: Change[];
  /** The changes that move money (they need the owner's OK when the rule is or goes live). */
  money: Change[];
  ownerOkNeeded: boolean;
  canApprove: boolean;
  /** Clashes the candidate would have once live (it is checked as if switched on). */
  conflicts: Finding[];
  /** The candidate is not switched on: customers will see nothing. */
  notLive: boolean;
}

const previewSchema = z.object({ content: z.unknown().optional() }).strict();

/** What changes where when the candidate (given, or the saved draft) is published. */
export async function previewRule(deps: RulesDeps, who: Who, id: string, input: unknown = {}): Promise<RulePreview> {
  await allow(deps, who, 'rules.read');
  const b = parse(previewSchema, input, 'preview');
  const row = await ruleRow(deps, who, id);
  const live = toRule(row);
  const given = b.content !== undefined ? parse(ruleContentSchema, b.content, 'rule') : null;
  const cand: Rule | null = given ? { ...given, id: row.id, version: row.version + 1, archived: false } : (draftRule(row) ?? live);
  if (!cand) throw new RulesError('NOTHING_TO_PUBLISH', 'there is nothing to preview');
  if (cand.key !== row.key || cand.kind !== row.kind) throw new RulesError('KEY_FIXED', 'the key and the kind of a rule stay as they are', ['key', 'kind']);

  const [{ rules }, ctx, canApprove, dict] = await Promise.all([loadRules(deps.db, who.storeId), textContext(deps, who.storeId), holds(deps, who, 'rules.approve'), setting(deps, who.storeId, 'rules.placements')]);
  const othersBefore = othersByKey(rules);
  const othersAfter = othersByKey(rules, cand);
  const sctx = ctx;
  const shortOf = (r: Rule | null, others: ReturnType<typeof othersByKey>) => {
    if (!r) return null;
    const rendered = renderAll(r, sctx, others).short;
    const lang = sctx.locale.toLowerCase().startsWith('bn') ? 'bn' : 'en';
    const t = rendered?.[lang] ?? rendered?.en;
    return t ? t.text : null;
  };
  const liveShown = live && live.status === 'ACTIVE' ? live : null;
  const candShown = cand.status === 'ACTIVE' ? cand : null;
  const before = shortOf(liveShown, othersBefore);
  const after = shortOf(candShown, othersAfter);
  const keys = [...new Set([...(liveShown?.placements ?? []), ...(candShown?.placements ?? [])])];
  const places: PlaceChange[] = keys.map((k) => {
    const d = dict.find((x) => x.key === k);
    const was = liveShown?.placements.includes(k) ? before : null;
    const now = candShown?.placements.includes(k) ? after : null;
    return { placement: k, labelEn: d?.en ?? k, labelBn: d?.bn ?? k, before: was, after: now, change: was === null ? 'added' : now === null ? 'removed' : was === now ? 'same' : 'changed' };
  });

  // Texts elsewhere that quote `{this-key.param}`.
  const quotedBy: QuotingText[] = [];
  const quotes = (s: string) => tokensIn(s).some((t) => t.rule === row.key);
  for (const r of rules) {
    if (r.id === row.id || r.archived) continue;
    const s = r.text.short?.en ?? '';
    const full = r.text.full?.en ?? '';
    const src = quotes(s) ? s : quotes(full) ? full : null;
    if (!src) continue;
    quotedBy.push({ type: 'rule', id: r.id, key: r.key, nameEn: r.nameEn, before: render(src, ruleLookup(r, { others: othersBefore }), langContext(ctx, 'en')).text, after: render(src, ruleLookup(r, { others: othersAfter }), langContext(ctx, 'en')).text });
  }
  const notices = await deps.db.notice.findMany({ where: { storeId: who.storeId, archivedAt: null } });
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  for (const n of notices) {
    if (!quotes(n.contentEn) && n.ruleId !== row.id) continue;
    const owner = n.ruleId ? (n.ruleId === row.id ? cand : ruleById.get(n.ruleId)) : undefined;
    const ownerBefore = n.ruleId ? ruleById.get(n.ruleId) : undefined;
    const base = { params: [] as Rule['params'] };
    quotedBy.push({
      type: 'notice',
      id: n.id,
      key: n.key ?? n.id,
      nameEn: n.nameEn ?? n.key ?? n.id,
      before: render(n.contentEn, ruleLookup(ownerBefore ?? base, { others: othersBefore }), langContext(ctx, 'en')).text,
      after: render(n.contentEn, ruleLookup(owner ?? base, { others: othersAfter }), langContext(ctx, 'en')).text,
    });
  }

  const content = strip(cand);
  const limits = await limitsFor(deps, who.storeId, rules, content);
  const ok = ownerOkNeeded(live ? strip(live) : null, content);
  const input2 = await conflictInput(deps, who.storeId, { ...cand, status: 'ACTIVE', archived: false });
  const conflicts = detectConflicts(input2).filter((f) => f.ruleA === row.id || f.other.id === row.id);
  return {
    places,
    quotedBy,
    texts: renderAll(cand, ctx, othersAfter),
    issues: checkRule(content, limits, ctx, content.status === 'ACTIVE'),
    changes: ok.changes,
    money: ok.money,
    ownerOkNeeded: ok.needed,
    canApprove,
    conflicts,
    notLive: cand.status !== 'ACTIVE',
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Publish, status, archive
// ---------------------------------------------------------------------------------------------------------------

export interface PublishResult {
  rule: RuleView;
  ownerOk: boolean;
  changes: Change[];
  /** Open clashes of this rule after the check (empty when the check on publish is off). */
  conflicts: number;
}

async function afterPublish(deps: RulesDeps, who: Who, row: RuleRow, extra: { ownerOk: boolean; changes: Change[] }): Promise<PublishResult> {
  let conflicts = 0;
  if (await setting(deps, who.storeId, 'rules.conflicts.checkOnPublish')) {
    await refreshConflicts(deps, who.storeId);
    conflicts = (await openConflictCounts(deps, who.storeId)).get(row.id) ?? 0;
  }
  return { rule: await view(deps, who, row), ownerOk: extra.ownerOk, changes: extra.changes, conflicts };
}

const publishSchema = z.object({ changeNote: z.string().trim().max(500).optional(), version: z.int().min(1).optional() }).strict();

/** Publishes the saved draft as the next version. */
export async function publishRule(deps: RulesDeps, who: Who, id: string, input: unknown = {}): Promise<PublishResult> {
  await allow(deps, who, 'rules.publish');
  const b = parse(publishSchema, input, 'publish');
  const row = await ruleRow(deps, who, id);
  if (!row.draft) throw new RulesError('NOTHING_TO_PUBLISH', 'there is no draft to publish');
  const content = parseContent(row.draft);
  if (!content) throw new RulesError('INVALID_INPUT', 'the saved draft cannot be read; save it again');
  const r = await commitContent(deps, who, row, content, { action: 'rule.publish', changeNote: b.changeNote, clearDraft: true, expectVersion: b.version });
  return afterPublish(deps, who, r.row, r);
}

const statusSchema = z.object({ status: ruleStatusSchema, changeNote: z.string().trim().max(500).optional(), version: z.int().min(1).optional() }).strict();

/** Switches the live version on, pauses or ends it (a new version; a saved draft stays as it is). */
export async function setRuleStatus(deps: RulesDeps, who: Who, id: string, input: unknown): Promise<PublishResult> {
  await allow(deps, who, 'rules.publish');
  const b = parse(statusSchema, input, 'status');
  const row = await ruleRow(deps, who, id);
  const live = toRule(row);
  if (!live) throw new RulesError('INVALID_INPUT', 'the rule cannot be read; publish a draft first');
  if (live.status === b.status) return afterPublish(deps, who, row, { ownerOk: false, changes: [] });
  const r = await commitContent(deps, who, row, { ...strip(live), status: b.status }, { action: 'rule.status', changeNote: b.changeNote, expectVersion: b.version });
  return afterPublish(deps, who, r.row, r);
}

const archiveSchema = z.object({ archived: z.boolean(), changeNote: z.string().trim().max(500).optional() }).strict();

/** Archives a rule that is not live (pause it first), or brings it back. Recorded as a version. */
export async function archiveRule(deps: RulesDeps, who: Who, id: string, input: unknown): Promise<PublishResult> {
  await allow(deps, who, 'rules.publish');
  const b = parse(archiveSchema, input, 'archive');
  const row = await ruleRow(deps, who, id);
  const live = toRule(row);
  if (!live) throw new RulesError('INVALID_INPUT', 'the rule cannot be read');
  if ((row.archivedAt !== null) === b.archived) return afterPublish(deps, who, row, { ownerOk: false, changes: [] });
  if (b.archived && live.status === 'ACTIVE') throw new RulesError('RULE_ACTIVE', 'pause the rule before archiving it');
  const r = await commitContent(deps, who, row, strip(live), { action: b.archived ? 'rule.archive' : 'rule.restore', changeNote: b.changeNote, archivedAt: b.archived ? nowOf(deps) : null });
  return afterPublish(deps, who, r.row, r);
}

// ---------------------------------------------------------------------------------------------------------------
// History (PR 218)
// ---------------------------------------------------------------------------------------------------------------

export interface VersionView {
  version: number;
  at: string;
  actorId: string | null;
  actorName: string | null;
  changeNote: string | null;
  status: string | null;
  /** What changed from the version before (empty for the first). */
  changes: Change[];
  money: Change[];
  /** The snapshot can be read (old versions written by an older shape may not). */
  readable: boolean;
}

const historySchema = z.object({ before: z.int().min(1).optional() }).strict();

/** The versions of a rule, newest first, each with what changed and who did it. */
export async function ruleHistory(deps: RulesDeps, who: Who, id: string, input: unknown = {}): Promise<{ versions: VersionView[]; more: boolean }> {
  await allow(deps, who, 'rules.read');
  const q = parse(historySchema, input, 'page');
  const row = await ruleRow(deps, who, id);
  const size = await setting(deps, who.storeId, 'rules.history.pageSize');
  const rows = await deps.db.smartRuleVersion.findMany({ where: { ruleId: row.id, ...(q.before ? { version: { lt: q.before } } : {}) }, orderBy: { version: 'desc' }, take: size + 2 });
  const staff = await deps.db.staffUser.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))] } }, select: { id: true, displayName: true } });
  const names = new Map(staff.map((s) => [s.id, s.displayName]));
  const versions = rows.slice(0, size).map((v, i) => {
    const cur = parseContent(v.snapshot);
    const prev = rows[i + 1] ? parseContent(rows[i + 1]!.snapshot) : null;
    const changes = cur && prev ? diffContent(prev, cur) : [];
    return {
      version: v.version,
      at: v.createdAt.toISOString(),
      actorId: v.actorId,
      actorName: v.actorId ? (names.get(v.actorId) ?? null) : null,
      changeNote: v.changeNote,
      status: cur?.status ?? null,
      changes,
      money: moneyChanges(changes),
      readable: cur !== null,
    };
  });
  return { versions, more: rows.length > size };
}

const restoreSchema = z.object({ version: z.int().min(1) }).strict();

/** Brings an old version back as the draft (it is previewed and published like any change; history keeps both). */
export async function restoreVersion(deps: RulesDeps, who: Who, id: string, input: unknown): Promise<RuleView> {
  await allow(deps, who, 'rules.write');
  const b = parse(restoreSchema, input, 'version');
  const row = await ruleRow(deps, who, id);
  if (row.archivedAt) throw new RulesError('RULE_ARCHIVED', 'the rule is archived; restore it first');
  const v = found(await deps.db.smartRuleVersion.findUnique({ where: { ruleId_version: { ruleId: row.id, version: b.version } } }), 'version');
  const content = parseContent(v.snapshot);
  if (!content) throw new RulesError('INVALID_INPUT', 'this version cannot be read any more');
  await deps.db.$transaction(async (tx) => {
    await tx.smartRule.update({ where: { id }, data: { draft: asJson(content), draftById: who.actor.staffUserId, draftAt: nowOf(deps) } });
    await logChange(tx, who, { action: 'rule.version.restore', entityType: 'SmartRule', entityId: id, before: row.draft ?? null, after: { fromVersion: b.version, ...content } });
  });
  return view(deps, who, await ruleRow(deps, who, id));
}

/** Every blocking reason a candidate cannot go live, as `CODE@where:subject` lines (for an API that only checks). */
export async function checkCandidate(deps: RulesDeps, who: Who, content: unknown): Promise<{ issues: Issue[]; lines: string[] }> {
  await allow(deps, who, 'rules.read');
  const c = parse(ruleContentSchema, content, 'rule');
  const [{ rules }, ctx] = await Promise.all([loadRules(deps.db, who.storeId), textContext(deps, who.storeId)]);
  const issues = checkRule(c, await limitsFor(deps, who.storeId, rules, c), ctx, c.status === 'ACTIVE');
  return { issues, lines: issues.map(issueLine) };
}

