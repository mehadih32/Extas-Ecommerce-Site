// S13 · PR 262 (Blueprint C6.2 point 3, demo 97u-adm2-customers.js "Segment builder" and 97x-adm2-marketing.js "Ads ›
// Audiences") — an audience's conditions, pure: which conditions exist, what each one asks for (a number of days, a size,
// a grade), how a saved definition is read back, and how the people of each condition are put together.
//
// - Every condition is about what people really did in this shop: started a checkout and did not order, ordered or had a
//   parcel delivered in the last N days, put something in the bag and never bought, VIP (the owner's own figure in
//   Customers), a grade, bought a size, refused a parcel (never one the shop caused), said no to offers.
// - The conditions are joined with "and"; a condition marked "leave out" takes its people away. At least one condition
//   must bring people in. Every number of days is the owner's: nothing is filled in for him.
// - Nothing here sends anything to an ad platform: pushing an audience (hashed) is audience-push.ts (PR 263 / 264).
// - PR 263: a lookalike audience has no conditions: its seed is the people delivered to in the owner's last N days.
import { z } from 'zod';

/** The conditions, in the order the builder lists them; each label is in the messages files (`au.rule.<kind>`). */
export const AUDIENCE_RULES = ['incomplete', 'ordered', 'delivered', 'bagNoBuy', 'vip', 'grade', 'size', 'refused', 'noOffers'] as const;
export type AudienceRuleKind = (typeof AUDIENCE_RULES)[number];

/** What each condition asks for: days (needed, optional = "any time", or none) and a picked row (a size or a grade). */
export const RULE_NEEDS: Readonly<Record<AudienceRuleKind, { days: 'need' | 'optional' | 'none'; ref: 'size' | 'grade' | null }>> = {
  incomplete: { days: 'need', ref: null },
  ordered: { days: 'need', ref: null },
  delivered: { days: 'need', ref: null },
  bagNoBuy: { days: 'need', ref: null },
  vip: { days: 'none', ref: null },
  grade: { days: 'none', ref: 'grade' },
  size: { days: 'optional', ref: 'size' },
  refused: { days: 'optional', ref: null },
  noOffers: { days: 'none', ref: null },
};

/** The stored kind of a builder audience (PR 263 adds lookalikes, PR 264 the refused-parcel exclusion list). */
export const AUDIENCE_KIND_BUILDER = 'BUILDER';
/** PR 263: a lookalike's seed — people whose parcels were delivered in the owner's last N days, each valued by his
 *  delivered sales (never by how many orders he placed). */
export const AUDIENCE_KIND_LOOKALIKE = 'LOOKALIKE';
export const AUDIENCE_KINDS = [AUDIENCE_KIND_BUILDER, AUDIENCE_KIND_LOOKALIKE] as const;
/** The definition's own version, so a later shape can read an older one. */
export const AUDIENCE_DEFINITION_V = 1;
/** Typing guards, not business numbers: the longest look-back the form takes and the most conditions in one audience. */
export const AUDIENCE_DAYS_MAX = 3650; // hardcode-ok: a typing guard (ten years), not a business number
export const AUDIENCE_RULES_MAX = 12; // hardcode-ok: a form length, not a business number
export const AUDIENCE_ACTIONS = ['recount', 'archive', 'restore'] as const;
export type AudienceAction = (typeof AUDIENCE_ACTIONS)[number];

const days = z
  .number()
  .int()
  .min(1)
  .max(AUDIENCE_DAYS_MAX)
  .nullish()
  .transform((v) => v ?? null);
const ref = z
  .string()
  .uuid()
  .nullish()
  .transform((v) => v ?? null);

export const ruleSchema = z.object({ kind: z.enum(AUDIENCE_RULES), days, ref, exclude: z.boolean().default(false) }).strict();
export type AudienceRule = z.output<typeof ruleSchema>;

export const definitionSchema = z
  .object({ v: z.literal(AUDIENCE_DEFINITION_V).default(AUDIENCE_DEFINITION_V), rules: z.array(ruleSchema).min(1).max(AUDIENCE_RULES_MAX) })
  .strict()
  .superRefine((d, ctx) => {
    if (!d.rules.some((r) => !r.exclude)) ctx.addIssue({ code: 'custom', path: ['rules'], message: 'at least one condition must bring people in' });
    d.rules.forEach((r, i) => {
      const need = RULE_NEEDS[r.kind];
      if (need.days === 'need' && r.days == null) ctx.addIssue({ code: 'custom', path: ['rules', i, 'days'], message: 'days needed' });
      if (need.days === 'none' && r.days != null) ctx.addIssue({ code: 'custom', path: ['rules', i, 'days'], message: 'no days here' });
      if (need.ref && !r.ref) ctx.addIssue({ code: 'custom', path: ['rules', i, 'ref'], message: `${need.ref} needed` });
      if (!need.ref && r.ref) ctx.addIssue({ code: 'custom', path: ['rules', i, 'ref'], message: 'nothing to pick here' });
    });
  });
export type AudienceDefinition = z.output<typeof definitionSchema>;

/** PR 263: a lookalike's seed, the owner's number of days (nothing filled in for him). */
export const lookalikeDefinitionSchema = z.object({ v: z.literal(AUDIENCE_DEFINITION_V).default(AUDIENCE_DEFINITION_V), seedDays: z.number().int().min(1).max(AUDIENCE_DAYS_MAX) }).strict();
export type LookalikeDefinition = z.output<typeof lookalikeDefinitionSchema>;

export const lookalikeInputSchema = z
  .object({
    kind: z.literal(AUDIENCE_KIND_LOOKALIKE),
    name: z.string().trim().min(1).max(120),
    definition: lookalikeDefinitionSchema,
    version: z
      .string()
      .nullish()
      .transform((v) => v ?? null),
  })
  .strict();

/** A stored lookalike seed read back (null when it is not one). */
export function lookalikeOf(v: unknown): LookalikeDefinition | null {
  const r = lookalikeDefinitionSchema.safeParse(v);
  return r.success ? r.data : null;
}

export const audienceInputSchema = z
  .object({
    kind: z.literal(AUDIENCE_KIND_BUILDER).optional(),
    name: z.string().trim().min(1).max(120),
    definition: definitionSchema,
    /** The audience's version as it was read (its updatedAt); null for a new one. */
    version: z
      .string()
      .nullish()
      .transform((v) => v ?? null),
  })
  .strict();
export type AudienceInput = z.output<typeof audienceInputSchema>;

/** A stored definition read back (a bad one = no conditions, so it counts nobody and asks to be fixed). */
export function definitionOf(v: unknown): AudienceDefinition {
  const r = definitionSchema.safeParse(v);
  return r.success ? r.data : { v: AUDIENCE_DEFINITION_V, rules: [] };
}

export type AudienceState = 'ACTIVE' | 'ARCHIVED';
export const stateOfAudience = (a: { archivedAt: Date | null }): AudienceState => (a.archivedAt ? 'ARCHIVED' : 'ACTIVE');
export const canAudienceStep = (a: AudienceAction, s: AudienceState) => (a === 'restore' ? s === 'ARCHIVED' : s === 'ACTIVE');

/**
 * The people of the audience from the people of each condition (in the definition's order): those in every condition
 * that brings people in, less everyone in a condition marked "leave out".
 */
export function combine(rules: readonly Pick<AudienceRule, 'exclude'>[], sets: readonly ReadonlySet<string>[]): Set<string> {
  const ins = rules.map((r, i) => (r.exclude ? null : sets[i])).filter((s): s is ReadonlySet<string> => !!s);
  if (!ins.length) return new Set();
  const [first, ...rest] = [...ins].sort((a, b) => a.size - b.size);
  const out = new Set<string>();
  for (const p of first!) if (rest.every((s) => s.has(p))) out.add(p);
  rules.forEach((r, i) => {
    if (r.exclude) for (const p of sets[i] ?? []) out.delete(p);
  });
  return out;
}

/** One condition in words: "Ordered · last 30 days", "not: Refused a parcel". */
export function ruleWords(r: AudienceRule, s: (k: string, v?: Record<string, string | number>) => string, names: Map<string, string>): string {
  const need = RULE_NEEDS[r.kind];
  const parts = [s(`rule.${r.kind}`)];
  if (need.ref) parts.push(names.get(r.ref ?? '') ?? '…');
  if (r.days != null) parts.push(s('lastDays', { days: r.days }));
  else if (need.days === 'optional') parts.push(s('anyTime'));
  const text = parts.join(' · ');
  return r.exclude ? s('notRule', { rule: text }) : text;
}
