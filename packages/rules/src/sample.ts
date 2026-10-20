// Sample Smart Rules and notices for the sample store (data/sample-rules.json), so the Smart Rules screens can be built
// and tested on real rows. SAMPLE DATA ONLY (CLAUDE.md rule 4, PR 509): it runs only on the explicit `sample` command
// and only on the store the sample catalogue seed made (its DefaultPackApplication mark); it refuses every other store.
// Idempotent: a rule or notice is created only when its key is missing; nothing is updated or deleted.
import { SYSTEM } from '@extas/auth';
import { SAMPLE_PACK_KEY } from '@extas/seed';
import { z } from 'zod';
import sampleJson from '../data/sample-rules.json';
import { blocking, checkRule } from './check';
import { checkLimits, setting, textContext, TX, type RulesDeps, type Who } from './context';
import { insertRule, issueLine, othersByKey } from './core';
import { RulesError } from './errors';
import { needsOwnerOk, ruleStatusSchema, type Rule, type RuleContent } from './model';
import { noticeInputSchema } from './notices-model';
import { contentFromTemplate, templateById } from './templates';
import type { Prisma } from '@extas/db/client';

const sampleSchema = z
  .object({
    $comment: z.string(),
    version: z.int().min(1),
    marker: z.string().min(1),
    rules: z.array(
      z
        .object({
          template: z.string(),
          key: z.string().optional(),
          nameEn: z.string().optional(),
          status: ruleStatusSchema,
          values: z.record(z.string(), z.unknown()),
          categories: z.array(z.string()).optional(),
          window: z.object({ startsAt: z.string(), endsAt: z.string() }).strict().optional(),
        })
        .strict(),
    ),
    notices: z.array(z.object({ rule: z.string().optional(), enabled: z.boolean() }).passthrough()),
  })
  .strict();

export const sampleRules = sampleSchema.parse(sampleJson);

export class SampleRulesRefused extends Error {}

export interface SampleRulesReport {
  storeId: number;
  rules: number;
  notices: number;
}

export async function seedSampleRules(deps: RulesDeps): Promise<SampleRulesReport> {
  const mark = await deps.db.defaultPackApplication.findFirst({ where: { packKey: SAMPLE_PACK_KEY, storeId: { not: null } }, orderBy: { createdAt: 'asc' } });
  if (!mark?.storeId) throw new SampleRulesRefused('no sample store: run the sample catalogue seed first (pnpm --filter @extas/seed sample)');
  const storeId = mark.storeId;
  const who: Who = { actor: SYSTEM, storeId, ctx: { source: 'sample' } };
  const existing = new Set((await deps.db.smartRule.findMany({ where: { storeId }, select: { key: true } })).map((r) => r.key));
  const [limits, ctx, dict] = await Promise.all([checkLimits(deps, storeId), textContext(deps, storeId), setting(deps, storeId, 'rules.placements')]);
  const placements = dict.map((p) => p.key);
  const settings = { value: (k: Parameters<typeof setting>[2]) => setting(deps, storeId, k) as Promise<unknown> };
  const made: Rule[] = [];
  let rules = 0;
  for (const s of sampleRules.rules) {
    const t = templateById(s.template);
    if (!t) throw new RulesError('NOT_FOUND', 'no such template', [s.template]);
    const key = s.key ?? t.id;
    if (existing.has(key)) continue;
    let content: RuleContent = await contentFromTemplate(t, settings, { key, placements });
    content = {
      ...content,
      ...(s.nameEn ? { nameEn: s.nameEn } : {}),
      params: content.params.map((p) => (p.key in s.values ? { ...p, value: s.values[p.key] } : p)),
      status: s.status,
      ...(s.window ? { startsAt: new Date(s.window.startsAt).toISOString(), endsAt: new Date(s.window.endsAt).toISOString() } : {}),
    };
    if (s.categories?.length) {
      const cats = await deps.db.category.findMany({ where: { storeId, slug: { in: s.categories } }, select: { id: true } });
      if (cats.length) content = { ...content, scope: { include: cats.map((c) => ({ type: 'category' as const, id: c.id })), exclude: [] } };
    }
    const issues = blocking(checkRule(content, { ...limits, others: othersByKey(made) }, ctx, content.status === 'ACTIVE'));
    if (issues.length) throw new RulesError('RULE_INCOMPLETE', `sample rule ${key} is not complete`, issues.map(issueLine));
    await deps.db.$transaction(async (tx) => {
      const row = await insertRule(deps, who, content, 'Sample data (made-up shop): created by the sample seed', tx);
      if (content.status === 'ACTIVE' && needsOwnerOk(content)) {
        // The sample shop has no owner; the history says who switched it on.
        await tx.smartRule.update({ where: { id: row.id }, data: { approvedAt: new Date(), approvedById: null } });
      }
      made.push({ ...content, id: row.id, version: 1, archived: false });
    }, TX);
    rules++;
  }
  const allRules = await deps.db.smartRule.findMany({ where: { storeId }, select: { id: true, key: true } });
  const ruleId = new Map(allRules.map((r) => [r.key, r.id]));
  let notices = 0;
  for (const raw of sampleRules.notices) {
    const { rule, enabled, ...rest } = raw as { rule?: string; enabled: boolean } & Record<string, unknown>;
    const n = noticeInputSchema.parse({ ...rest, ruleId: rule ? (ruleId.get(rule) ?? null) : null });
    if (await deps.db.notice.findUnique({ where: { storeId_key: { storeId, key: n.key } }, select: { id: true } })) continue;
    const json = (v: unknown) => (v === null || v === undefined ? undefined : (v as Prisma.InputJsonValue));
    await deps.db.notice.create({
      data: {
        storeId,
        key: n.key,
        kind: n.kind,
        nameEn: n.nameEn,
        nameBn: n.nameBn ?? null,
        titleEn: n.titleEn ?? null,
        titleBn: n.titleBn ?? null,
        contentEn: n.contentEn,
        contentBn: n.contentBn ?? null,
        placement: n.placement as Prisma.InputJsonValue,
        timing: json(n.timing),
        frequencyCap: json(n.frequencyCap),
        cta: json(n.cta),
        ruleId: n.ruleId ?? null,
        enabled,
      },
    });
    notices++;
  }
  return { storeId, rules, notices };
}
