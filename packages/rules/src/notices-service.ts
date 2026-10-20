// PR 216 — notices and pop-ups on the database: list · new (always off) · change · switch on or off · archive /
// restore. A notice is words only (no money), so publishing and switching on need `rules.publish`, not the owner's OK;
// but it can only be switched on when it obeys the pop-up rules (notices-model.ts checkNotice) and every {token} in it
// has a value. Each change bumps the notice's version and is in the audit log with before and after.
import type { Prisma } from '@extas/db/client';
import { z } from 'zod';
import { bustStore } from './cache';
import { allow, found, logChange, noticeLimits, nowOf, parse, textContext, TX, type RulesDeps, type Who } from './context';
import { langContext, loadRules, othersByKey } from './core';
import { RulesError } from './errors';
import { checkNotice, noticeInputSchema, type NoticeIssueCode } from './notices-model';
import { render, ruleLookup, type Rendered } from './text';
import type { Rule } from './model';

type NoticeRow = Prisma.NoticeGetPayload<object>;

export interface NoticeView {
  id: string;
  key: string | null;
  kind: string;
  nameEn: string | null;
  nameBn: string | null;
  titleEn: string | null;
  titleBn: string | null;
  contentEn: string;
  contentBn: string | null;
  cta: unknown;
  placement: unknown;
  timing: unknown;
  frequencyCap: unknown;
  ruleId: string | null;
  priority: number;
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
  archived: boolean;
  version: number;
  updatedAt: string;
  /** Why it cannot be switched on (empty = it can). */
  issues: (NoticeIssueCode | 'MISSING_VALUE' | 'UNKNOWN_TOKEN')[];
  /** The content as customers read it. */
  preview: { en: string; bn: string | null };
}

/** The notice's input shape, read back from a row (for checking a stored notice). */
export function rowInput(n: NoticeRow): unknown {
  return {
    key: n.key ?? `notice-${n.id.slice(0, 8)}`,
    kind: n.kind,
    nameEn: n.nameEn ?? n.key ?? n.id,
    ...(n.nameBn ? { nameBn: n.nameBn } : {}),
    ...(n.titleEn ? { titleEn: n.titleEn } : {}),
    ...(n.titleBn ? { titleBn: n.titleBn } : {}),
    contentEn: n.contentEn,
    ...(n.contentBn ? { contentBn: n.contentBn } : {}),
    cta: n.cta ?? null,
    placement: n.placement,
    timing: n.timing ?? null,
    frequencyCap: n.frequencyCap ?? null,
    ruleId: n.ruleId,
    priority: n.priority,
    startsAt: n.startsAt?.toISOString() ?? null,
    endsAt: n.endsAt?.toISOString() ?? null,
  };
}

/** Fills a notice's tokens: `{param}` from its rule, `{rule-key.param}` from any rule. */
export function renderNotice(text: string, rule: Rule | undefined, rules: readonly Rule[], ctx: Parameters<typeof render>[2]): Rendered {
  return render(text, ruleLookup(rule ?? { params: [] }, { others: othersByKey(rules.filter((r) => r.status === 'ACTIVE')) }), ctx);
}

async function viewOf(deps: RulesDeps, storeId: number, n: NoticeRow, rules?: Rule[]): Promise<NoticeView> {
  const all = rules ?? (await loadRules(deps.db, storeId)).rules;
  const [limits, ctx] = await Promise.all([noticeLimits(deps, storeId), textContext(deps, storeId)]);
  const parsed = noticeInputSchema.safeParse(rowInput(n));
  const issues: NoticeView['issues'] = parsed.success ? checkNotice(parsed.data, limits) : [];
  const rule = n.ruleId ? all.find((r) => r.id === n.ruleId) : undefined;
  const en = renderNotice(n.contentEn, rule, all, langContext(ctx, 'en'));
  const bn = n.contentBn ? renderNotice(n.contentBn, rule, all, langContext(ctx, 'bn')) : null;
  for (const r of [en, bn]) {
    if (r?.missing.length && !issues.includes('MISSING_VALUE')) issues.push('MISSING_VALUE');
    if (r?.unknown.length && !issues.includes('UNKNOWN_TOKEN')) issues.push('UNKNOWN_TOKEN');
  }
  return {
    id: n.id,
    key: n.key,
    kind: n.kind,
    nameEn: n.nameEn,
    nameBn: n.nameBn,
    titleEn: n.titleEn,
    titleBn: n.titleBn,
    contentEn: n.contentEn,
    contentBn: n.contentBn,
    cta: n.cta,
    placement: n.placement,
    timing: n.timing,
    frequencyCap: n.frequencyCap,
    ruleId: n.ruleId,
    priority: n.priority,
    enabled: n.enabled,
    startsAt: n.startsAt?.toISOString() ?? null,
    endsAt: n.endsAt?.toISOString() ?? null,
    archived: n.archivedAt !== null,
    version: n.version,
    updatedAt: n.updatedAt.toISOString(),
    issues,
    preview: { en: en.text, bn: bn?.text ?? null },
  };
}

const listSchema = z.object({ includeArchived: z.boolean().optional() }).strict();

export async function listNotices(deps: RulesDeps, who: Who, input: unknown = {}): Promise<NoticeView[]> {
  await allow(deps, who, 'rules.read');
  const q = parse(listSchema, input, 'filter');
  const rows = await deps.db.notice.findMany({ where: { storeId: who.storeId, ...(q.includeArchived ? {} : { archivedAt: null }) }, orderBy: [{ enabled: 'desc' }, { priority: 'desc' }, { createdAt: 'asc' }] });
  const { rules } = await loadRules(deps.db, who.storeId);
  return Promise.all(rows.map((n) => viewOf(deps, who.storeId, n, rules)));
}

const noticeRow = async (deps: RulesDeps, who: Who, id: string) => found(await deps.db.notice.findFirst({ where: { id, storeId: who.storeId } }), 'notice');

export async function getNotice(deps: RulesDeps, who: Who, id: string): Promise<NoticeView> {
  await allow(deps, who, 'rules.read');
  return viewOf(deps, who.storeId, await noticeRow(deps, who, id));
}

function columns(b: z.output<typeof noticeInputSchema>) {
  const json = (v: unknown) => (v === null || v === undefined ? undefined : (v as Prisma.InputJsonValue));
  return {
    key: b.key,
    kind: b.kind,
    nameEn: b.nameEn,
    nameBn: b.nameBn ?? null,
    titleEn: b.titleEn ?? null,
    titleBn: b.titleBn ?? null,
    contentEn: b.contentEn,
    contentBn: b.contentBn ?? null,
    placement: b.placement as Prisma.InputJsonValue,
    priority: b.priority ?? 0,
    ruleId: b.ruleId ?? null,
    startsAt: b.startsAt ? new Date(b.startsAt) : null,
    endsAt: b.endsAt ? new Date(b.endsAt) : null,
    cta: json(b.cta),
    timing: json(b.timing),
    frequencyCap: json(b.frequencyCap),
  };
}

async function checkRuleLink(deps: RulesDeps, storeId: number, ruleId: string | null | undefined) {
  if (ruleId) found(await deps.db.smartRule.findFirst({ where: { id: ruleId, storeId }, select: { id: true } }), 'rule');
}

/** A new notice: always off until it is switched on. */
export async function createNotice(deps: RulesDeps, who: Who, input: unknown): Promise<NoticeView> {
  await allow(deps, who, 'rules.write');
  const b = parse(noticeInputSchema, input, 'notice');
  const limits = await noticeLimits(deps, who.storeId);
  const placeIssues = checkNotice(b, limits).filter((c) => c === 'UNKNOWN_PLACEMENT' || c === 'BAD_WINDOW' || c === 'TIMING_NOT_FOR_KIND');
  if (placeIssues.length) throw new RulesError('NOTICE_INVALID', 'the notice is not valid', placeIssues);
  await checkRuleLink(deps, who.storeId, b.ruleId);
  if (await deps.db.notice.findUnique({ where: { storeId_key: { storeId: who.storeId, key: b.key } }, select: { id: true } })) throw new RulesError('KEY_TAKEN', 'a notice with this key exists', [b.key]);
  const row = await deps.db.$transaction(async (tx) => {
    const n = await tx.notice.create({ data: { storeId: who.storeId, ...columns(b), enabled: false, version: 1, createdById: who.actor.staffUserId, updatedById: who.actor.staffUserId } });
    await logChange(tx, who, { action: 'notice.create', entityType: 'Notice', entityId: n.id, before: null, after: b });
    return n;
  }, TX);
  return viewOf(deps, who.storeId, row);
}

const updateSchema = z.object({ notice: z.unknown(), version: z.int().min(1).optional() }).strict();

/** Changes a notice. A notice that is on stays on only if it still obeys the rules. */
export async function updateNotice(deps: RulesDeps, who: Who, id: string, input: unknown): Promise<NoticeView> {
  const b = parse(updateSchema, input, 'notice');
  const n0 = await noticeRow(deps, who, id);
  await allow(deps, who, n0.enabled ? 'rules.publish' : 'rules.write');
  const next = parse(noticeInputSchema, b.notice, 'notice');
  if (n0.archivedAt) throw new RulesError('RULE_ARCHIVED', 'the notice is archived; restore it first');
  if (b.version !== undefined && b.version !== n0.version) throw new RulesError('STALE_DRAFT', 'someone changed this notice since it was opened', [`version:${n0.version}`]);
  if (n0.key && next.key !== n0.key) throw new RulesError('KEY_FIXED', 'the key of a notice stays as it is', ['key']);
  await checkRuleLink(deps, who.storeId, next.ruleId);
  const limits = await noticeLimits(deps, who.storeId);
  const issues = checkNotice(next, limits);
  const hard = issues.filter((c) => c === 'UNKNOWN_PLACEMENT' || c === 'BAD_WINDOW' || c === 'TIMING_NOT_FOR_KIND');
  if (hard.length || (n0.enabled && issues.length)) throw new RulesError('NOTICE_INVALID', 'the notice is not valid', n0.enabled ? issues : hard);
  const row = await deps.db.$transaction(async (tx) => {
    const res = await tx.notice.updateMany({ where: { id, version: n0.version }, data: { ...columns(next), version: n0.version + 1, updatedById: who.actor.staffUserId } });
    if (res.count !== 1) throw new RulesError('STALE_DRAFT', 'someone changed this notice at the same moment');
    await logChange(tx, who, { action: 'notice.update', entityType: 'Notice', entityId: id, before: rowInput(n0), after: next });
    return tx.notice.findUniqueOrThrow({ where: { id } });
  }, TX);
  bustStore(who.storeId);
  const v = await viewOf(deps, who.storeId, row);
  if (row.enabled && v.issues.length) {
    // A token lost its value: switch it off rather than show "{x}" to a customer.
    await deps.db.notice.update({ where: { id }, data: { enabled: false } });
    return { ...v, enabled: false };
  }
  return v;
}

const enableSchema = z.object({ enabled: z.boolean() }).strict();

/** Switches a notice on (only when it obeys every rule and every token has a value) or off. */
export async function setNoticeEnabled(deps: RulesDeps, who: Who, id: string, input: unknown): Promise<NoticeView> {
  await allow(deps, who, 'rules.publish');
  const b = parse(enableSchema, input, 'switch');
  const n = await noticeRow(deps, who, id);
  if (n.archivedAt) throw new RulesError('RULE_ARCHIVED', 'the notice is archived; restore it first');
  if (b.enabled) {
    const v = await viewOf(deps, who.storeId, n);
    const parsed = noticeInputSchema.safeParse(rowInput(n));
    if (!parsed.success) throw new RulesError('NOTICE_INVALID', 'the notice cannot be read; save it again');
    if (v.issues.length) throw new RulesError('NOTICE_INVALID', 'the notice cannot be switched on', v.issues);
  }
  if (n.enabled === b.enabled) return viewOf(deps, who.storeId, n);
  const row = await deps.db.$transaction(async (tx) => {
    const r = await tx.notice.update({ where: { id }, data: { enabled: b.enabled, version: n.version + 1, updatedById: who.actor.staffUserId } });
    await logChange(tx, who, { action: b.enabled ? 'notice.enable' : 'notice.disable', entityType: 'Notice', entityId: id, before: { enabled: n.enabled, version: n.version }, after: { enabled: b.enabled, version: r.version } });
    return r;
  });
  bustStore(who.storeId);
  return viewOf(deps, who.storeId, row);
}

const archiveSchema = z.object({ archived: z.boolean() }).strict();

/** Archives a notice (switched off first) or brings it back (off). Nothing is deleted. */
export async function archiveNotice(deps: RulesDeps, who: Who, id: string, input: unknown): Promise<NoticeView> {
  await allow(deps, who, 'rules.publish');
  const b = parse(archiveSchema, input, 'archive');
  const n = await noticeRow(deps, who, id);
  if ((n.archivedAt !== null) === b.archived) return viewOf(deps, who.storeId, n);
  const row = await deps.db.$transaction(async (tx) => {
    const r = await tx.notice.update({ where: { id }, data: { archivedAt: b.archived ? nowOf(deps) : null, enabled: false, version: n.version + 1, updatedById: who.actor.staffUserId } });
    await logChange(tx, who, { action: b.archived ? 'notice.archive' : 'notice.restore', entityType: 'Notice', entityId: id, before: { archived: n.archivedAt !== null, enabled: n.enabled }, after: { archived: b.archived, enabled: false } });
    return r;
  });
  bustStore(who.storeId);
  return viewOf(deps, who.storeId, row);
}
