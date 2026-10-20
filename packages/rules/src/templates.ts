// PR 209 — the starting points of a new rule (data/templates.json): words and structure only. Every value is empty
// until the owner types it in, or is copied from the store's own setting at the moment the rule is made (`fromSetting`:
// the exchange window, exchanges per item, the free-delivery threshold, order edits, COD on/off). The starter
// templates become the store's first rules — all as drafts.
//
// Pure module (the settings reader is passed in).
import { z } from 'zod';
import templatesJson from '../data/templates.json';
import { ALL_SCOPE, ALWAYS, actionSchema, keySchema, paramValueSchemas, PARAM_TYPES, ruleKindSchema, ruleKeySchema, textSchema, type RuleContent } from './model';

/** Settings a template param may start from (each one's value type matches the param's). */
export const SEEDABLE_SETTINGS = ['policy.exchange.windowHours', 'policy.exchange.perItem', 'delivery.freeOverMinor', 'policy.orderEdit.maxEdits', 'payment.cod.enabled'] as const;
export type SeedableSetting = (typeof SEEDABLE_SETTINGS)[number];

const templateParamSchema = z
  .object({
    key: keySchema,
    type: z.enum(PARAM_TYPES),
    value: z.null(),
    fromSetting: z.enum(SEEDABLE_SETTINGS).optional(),
    labelEn: z.string().trim().min(1).max(120),
    labelBn: z.string().trim().max(120).optional(),
  })
  .strict();

export const templateSchema = z
  .object({
    id: ruleKeySchema,
    starter: z.boolean().optional(),
    kind: ruleKindSchema,
    nameEn: z.string().trim().min(1).max(120),
    nameBn: z.string().trim().max(120).optional(),
    text: textSchema,
    params: z.array(templateParamSchema).max(60),
    actions: z.array(actionSchema).max(20),
    placements: z.array(z.string()).max(30),
  })
  .strict();
export type RuleTemplate = z.output<typeof templateSchema>;

const fileSchema = z.object({ $comment: z.string(), version: z.int().min(1), templates: z.array(templateSchema).min(1) }).strict();

const file = fileSchema.parse(templatesJson);
export const TEMPLATES: readonly RuleTemplate[] = file.templates;
export const TEMPLATES_VERSION = file.version;

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);

export interface TemplateSettings {
  value(key: SeedableSetting): Promise<unknown>;
}

/** A new rule's content from a template: a draft, every value empty or copied from its setting. */
export async function contentFromTemplate(t: RuleTemplate, settings: TemplateSettings, opts: { key?: string; placements?: readonly string[] } = {}): Promise<RuleContent> {
  const params = await Promise.all(
    t.params.map(async (p) => {
      let value: unknown = null;
      if (p.fromSetting) {
        const v = await settings.value(p.fromSetting);
        if (v !== null && v !== undefined && paramValueSchemas[p.type].safeParse(v).success) value = v;
      }
      return { key: p.key, type: p.type, value, labelEn: p.labelEn, ...(p.labelBn ? { labelBn: p.labelBn } : {}) };
    }),
  );
  return {
    key: opts.key ?? t.id,
    kind: t.kind,
    nameEn: t.nameEn,
    ...(t.nameBn ? { nameBn: t.nameBn } : {}),
    text: t.text,
    params,
    scope: ALL_SCOPE,
    conditions: ALWAYS,
    actions: t.actions,
    // Only the places this store has (the dictionary is a setting).
    placements: opts.placements ? t.placements.filter((p) => opts.placements!.includes(p)) : t.placements,
    priority: 0,
    stackable: false,
    status: 'DRAFT',
    startsAt: null,
    endsAt: null,
  };
}

/** A blank rule of a kind (when no template fits). */
export function blankContent(key: string, kind: RuleContent['kind'], nameEn: string): RuleContent {
  return { key, kind, nameEn, text: {}, params: [], scope: ALL_SCOPE, conditions: ALWAYS, actions: [], placements: [], priority: 0, stackable: false, status: 'DRAFT', startsAt: null, endsAt: null };
}
