// PR 208 — what a Smart Rule is, as data. A rule has a kind (its topic), conditions ("when"), actions ("then"), a
// priority, an active window, the values its text and actions use ("params"), the texts customers read (PR 215), a
// scope ("applies to / except") and the places its text is shown. The engine (engine.ts) interprets the actions; no
// business number is in code: every charge, price, percentage, window and date is a param value of a rule, typed in by
// the owner on /admin/rules. A value that is not set yet is `null` ("the owner has not decided"), and a rule whose text
// or actions need a missing value cannot be switched on.
//
// Pure module: no database, no settings reader. Safe to import in the admin's browser code through `@extas/rules/pure`.
import { z } from 'zod';

// ---------------------------------------------------------------------------------------------------------------
// Kinds, params, texts
// ---------------------------------------------------------------------------------------------------------------

/** The rule's topic. The kind decides which actions and text slots it may use (KIND_SPECS). */
export const RULE_KINDS = ['delivery', 'exchange', 'setTier', 'discount', 'festive', 'payment', 'policy', 'fulfilment'] as const;
export type RuleKind = (typeof RULE_KINDS)[number];
export const ruleKindSchema = z.enum(RULE_KINDS);

export const RULE_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED'] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];
export const ruleStatusSchema = z.enum(RULE_STATUSES);

/** How a param's value is typed in and written into a text. Money is in minor units of the store's currency. */
export const PARAM_TYPES = ['int', 'money', 'percent', 'hours', 'text', 'datetime', 'bool'] as const;
export type ParamType = (typeof PARAM_TYPES)[number];

export const keySchema = z.string().regex(/^[a-z][a-zA-Z0-9]{0,39}$/, { message: 'a short camelCase name' });
export const ruleKeySchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'lower-case words joined by -' }).max(60);

/** A text in the customer's languages (English always; Bengali when written). */
export const localizedSchema = (max: number) => z.object({ en: z.string().trim().max(max), bn: z.string().trim().max(max).optional() }).strict();
export type Localized = { en: string; bn?: string };

const LIMIT_TEXT = 10_000;
const LIMIT_INT = 1_000_000_000;

export const paramValueSchemas: Record<ParamType, z.ZodType> = {
  int: z.int().min(-LIMIT_INT).max(LIMIT_INT),
  money: z.int().min(0).max(LIMIT_INT),
  percent: z.number().min(0).max(100),
  hours: z.int().min(0).max(24 * 366),
  text: localizedSchema(500),
  datetime: z.iso.datetime({ offset: true }),
  bool: z.boolean(),
};

export const paramSchema = z
  .object({
    key: keySchema,
    type: z.enum(PARAM_TYPES),
    /** null = not set yet (the owner's decision). */
    value: z.unknown().nullable(),
    labelEn: z.string().trim().min(1).max(120),
    labelBn: z.string().trim().max(120).optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.value === null || p.value === undefined) return;
    const r = paramValueSchemas[p.type].safeParse(p.value);
    if (!r.success) ctx.addIssue({ code: 'custom', path: ['value'], message: `not a valid ${p.type}` });
  });
export type Param = { key: string; type: ParamType; value: unknown; labelEn: string; labelBn?: string };

/** Named texts of a rule (PR 215). `short` and `full` always; some kinds add their own slots. */
export const TEXT_SLOTS = ['short', 'full', 'after', 'progress', 'unlocked', 'badge'] as const;
export type TextSlot = (typeof TEXT_SLOTS)[number];
export const textSchema = z.partialRecord(z.enum(TEXT_SLOTS), localizedSchema(LIMIT_TEXT));
export type RuleText = Partial<Record<TextSlot, Localized>>;

/**
 * Tokens a text slot may use that are not params: filled by the engine at the moment of showing (PR 210 "Add ৳X more
 * for free delivery" → `{remaining}`).
 */
export const RUNTIME_TOKENS: Partial<Record<TextSlot, Record<string, ParamType>>> = {
  progress: { remaining: 'money' },
};

// ---------------------------------------------------------------------------------------------------------------
// Scope ("Applies to" / "Except")
// ---------------------------------------------------------------------------------------------------------------

export const targetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all') }).strict(),
  z.object({ type: z.literal('category'), id: z.uuid() }).strict(),
  z.object({ type: z.literal('collection'), id: z.uuid() }).strict(),
  z.object({ type: z.literal('product'), id: z.uuid() }).strict(),
]);
export type Target = z.output<typeof targetSchema>;

export const scopeSchema = z
  .object({ include: z.array(targetSchema).min(1).max(200), exclude: z.array(targetSchema).max(200) })
  .strict()
  .refine((s) => !s.exclude.some((t) => t.type === 'all'), { message: '"except everything" is not a scope' });
export type Scope = z.output<typeof scopeSchema>;
export const ALL_SCOPE: Scope = { include: [{ type: 'all' }], exclude: [] };

// ---------------------------------------------------------------------------------------------------------------
// Conditions ("When")
// ---------------------------------------------------------------------------------------------------------------

/** The facts a condition may test (the engine's facts, engine.ts). Code, because code fills them. */
export const CONDITION_FIELDS = {
  'cart.subtotal': 'money',
  'cart.quantity': 'int',
  'cart.couponCode': 'text',
  'delivery.band': 'text',
  'payment.method': 'text',
  'customer.loggedIn': 'bool',
  'customer.deliveredOrders': 'int',
  'order.source': 'text',
  'time.weekday': 'int',
  'time.hour': 'int',
} as const satisfies Record<string, 'money' | 'int' | 'text' | 'bool'>;
export type ConditionField = keyof typeof CONDITION_FIELDS;
export const CONDITION_FIELD_KEYS = Object.keys(CONDITION_FIELDS) as ConditionField[];

export const CONDITION_OPS = ['eq', 'ne', 'in', 'notIn', 'gt', 'gte', 'lt', 'lte', 'exists', 'missing'] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

export type Condition =
  | { field: ConditionField; op: ConditionOp; value?: unknown }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

const scalar = z.union([z.string().max(200), z.number(), z.boolean()]);
const leafSchema = z
  .object({ field: z.enum(CONDITION_FIELD_KEYS as [ConditionField, ...ConditionField[]]), op: z.enum(CONDITION_OPS), value: z.union([scalar, z.array(scalar).max(200)]).optional() })
  .strict()
  .superRefine((c, ctx) => {
    const list = c.op === 'in' || c.op === 'notIn';
    const none = c.op === 'exists' || c.op === 'missing';
    if (none && c.value !== undefined) ctx.addIssue({ code: 'custom', message: `"${c.op}" takes no value` });
    if (!none && c.value === undefined) ctx.addIssue({ code: 'custom', message: `"${c.op}" needs a value` });
    if (list && c.value !== undefined && !Array.isArray(c.value)) ctx.addIssue({ code: 'custom', message: `"${c.op}" needs a list` });
    if (!list && Array.isArray(c.value)) ctx.addIssue({ code: 'custom', message: `"${c.op}" takes one value` });
  });
export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([leafSchema, z.object({ all: z.array(conditionSchema).max(50) }).strict(), z.object({ any: z.array(conditionSchema).max(50) }).strict(), z.object({ not: conditionSchema }).strict()]),
) as z.ZodType<Condition>;
export const ALWAYS: Condition = { all: [] };

// ---------------------------------------------------------------------------------------------------------------
// Actions ("Then")
// ---------------------------------------------------------------------------------------------------------------

export const bandKeySchema = z.string().regex(/^(\*|[a-z0-9]+(?:-[a-z0-9]+)*)$/, { message: 'a delivery band key, or * for every band' });
const byBand = z.record(bandKeySchema, keySchema).refine((r) => Object.keys(r).length >= 1 && Object.keys(r).length <= 20, { message: 'one to twenty bands' });

export const EXCHANGE_REASONS = ['size', 'defect', 'damage', 'wrong'] as const;

export const actionSchema = z.discriminatedUnion('type', [
  /** PR 210 — the delivery charge per band, each from a money param. */
  z.object({ type: z.literal('deliveryCharge'), byBand }).strict(),
  /** PR 210 — free delivery when the items come to at least the param (after discounts). */
  z.object({ type: z.literal('freeDeliveryOver'), param: keySchema }).strict(),
  /** PR 210, 214 — free delivery while the rule's conditions and window hold (a campaign). */
  z.object({ type: z.literal('freeDelivery') }).strict(),
  /** PR 211 — the exchange window (hours from delivery), exchanges per item, the charge per band, the reasons. */
  z
    .object({
      type: z.literal('exchangePolicy'),
      windowParam: keySchema,
      perItemParam: keySchema.optional(),
      chargeByBand: z.record(bandKeySchema, keySchema).optional(),
      reasons: z.array(z.enum(EXCHANGE_REASONS)).min(1),
      freeWhenOurMistake: z.boolean(),
    })
    .strict(),
  /** PR 212 — any N for a set price, per tier; tier prices are money params. */
  z
    .object({
      type: z.literal('setTier'),
      tiers: z
        .array(z.object({ quantity: z.int().min(2).max(20), param: keySchema }).strict())
        .min(1)
        .max(10)
        .refine((t) => new Set(t.map((x) => x.quantity)).size === t.length, { message: 'each tier needs its own quantity' }),
    })
    .strict(),
  /** PR 213 — a discount: a percentage or an amount, on the lines in scope or on the order; optionally only with a coupon. */
  z
    .object({
      type: z.literal('discount'),
      mode: z.enum(['percent', 'amount']),
      param: keySchema,
      target: z.enum(['lines', 'order']),
      maxParam: keySchema.optional(),
      minSubtotalParam: keySchema.optional(),
      requiresCoupon: z.boolean(),
      /** May show a struck "was" price (only through the honesty guard, was-price.ts). */
      showWas: z.boolean(),
    })
    .strict(),
  /** PR 214 — order-by cut-off date per band (datetime params). */
  z.object({ type: z.literal('cutoff'), byBand }).strict(),
  /** COD on or off (a bool param) and an optional largest COD order (money param). */
  z.object({ type: z.literal('cod'), allowedParam: keySchema, maxOrderParam: keySchema.optional() }).strict(),
]);
export type Action = z.output<typeof actionSchema>;
export type ActionType = Action['type'];

export interface KindSpec {
  actions: readonly ActionType[];
  slots: readonly TextSlot[];
}

/** Which actions and text slots each kind may use. */
export const KIND_SPECS: Record<RuleKind, KindSpec> = {
  delivery: { actions: ['deliveryCharge', 'freeDeliveryOver', 'freeDelivery'], slots: ['short', 'full', 'progress', 'unlocked'] },
  exchange: { actions: ['exchangePolicy'], slots: ['short', 'full'] },
  setTier: { actions: ['setTier'], slots: ['short', 'full', 'badge'] },
  discount: { actions: ['discount'], slots: ['short', 'full', 'badge'] },
  festive: { actions: ['cutoff', 'freeDelivery', 'discount'], slots: ['short', 'full', 'after'] },
  payment: { actions: ['cod'], slots: ['short', 'full'] },
  policy: { actions: [], slots: ['short', 'full'] },
  fulfilment: { actions: [], slots: ['short', 'full'] },
};

/** The param type each action field needs. */
export function actionParamNeeds(a: Action): { param: string; type: ParamType; where: string }[] {
  switch (a.type) {
    case 'deliveryCharge':
      return Object.entries(a.byBand).map(([band, param]) => ({ param, type: 'money', where: `deliveryCharge.${band}` }));
    case 'freeDeliveryOver':
      return [{ param: a.param, type: 'money', where: 'freeDeliveryOver' }];
    case 'freeDelivery':
      return [];
    case 'exchangePolicy':
      return [
        { param: a.windowParam, type: 'hours', where: 'exchangePolicy.window' },
        ...(a.perItemParam ? [{ param: a.perItemParam, type: 'int' as const, where: 'exchangePolicy.perItem' }] : []),
        ...Object.entries(a.chargeByBand ?? {}).map(([band, param]) => ({ param, type: 'money' as const, where: `exchangePolicy.charge.${band}` })),
      ];
    case 'setTier':
      return a.tiers.map((t) => ({ param: t.param, type: 'money', where: `setTier.${t.quantity}` }));
    case 'discount':
      return [
        { param: a.param, type: a.mode === 'percent' ? 'percent' : 'money', where: 'discount' },
        ...(a.maxParam ? [{ param: a.maxParam, type: 'money' as const, where: 'discount.max' }] : []),
        ...(a.minSubtotalParam ? [{ param: a.minSubtotalParam, type: 'money' as const, where: 'discount.minSubtotal' }] : []),
      ];
    case 'cutoff':
      return Object.entries(a.byBand).map(([band, param]) => ({ param, type: 'datetime', where: `cutoff.${band}` }));
    case 'cod':
      return [{ param: a.allowedParam, type: 'bool', where: 'cod.allowed' }, ...(a.maxOrderParam ? [{ param: a.maxOrderParam, type: 'money' as const, where: 'cod.max' }] : [])];
  }
}

/**
 * True when the action moves money: a charge, a price, a discount, free delivery or COD (CLAUDE.md rule 6). A rule
 * with one of these needs the owner's OK to switch on, and every change to it needs the OK again.
 */
export function movesMoney(a: Action): boolean {
  if (a.type === 'cutoff') return false;
  if (a.type === 'exchangePolicy') return Object.keys(a.chargeByBand ?? {}).length > 0;
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// The whole rule
// ---------------------------------------------------------------------------------------------------------------

/** Everything a version holds (PR 218): what is drafted, previewed, simulated and published. */
export const ruleContentSchema = z
  .object({
    key: ruleKeySchema,
    kind: ruleKindSchema,
    nameEn: z.string().trim().min(1).max(120),
    nameBn: z.string().trim().max(120).optional(),
    text: textSchema,
    params: z.array(paramSchema).max(60),
    scope: scopeSchema,
    conditions: conditionSchema,
    actions: z.array(actionSchema).max(20),
    placements: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).max(30),
    priority: z.int().min(-1000).max(1000),
    stackable: z.boolean(),
    status: ruleStatusSchema,
    startsAt: z.iso.datetime({ offset: true }).nullable(),
    endsAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export type RuleContent = z.output<typeof ruleContentSchema>;

/** A rule as the engine sees it: its content plus its identity and version. */
export interface Rule extends RuleContent {
  id: string;
  version: number;
  archived: boolean;
}

export const needsOwnerOk = (r: Pick<RuleContent, 'actions'>): boolean => r.actions.some(movesMoney);

export const paramOf = (r: Pick<RuleContent, 'params'>, key: string): Param | undefined => r.params.find((p) => p.key === key) as Param | undefined;

/** A param's value when it is set, else null. */
export function valueOf<T = unknown>(r: Pick<RuleContent, 'params'>, key: string): T | null {
  const p = paramOf(r, key);
  return p && p.value !== null && p.value !== undefined ? (p.value as T) : null;
}

/** Is the rule live at `now`: active, not archived, inside its window. */
export function isLive(r: Pick<Rule, 'status' | 'archived' | 'startsAt' | 'endsAt'>, now: Date): boolean {
  if (r.archived || r.status !== 'ACTIVE') return false;
  if (r.startsAt && new Date(r.startsAt) > now) return false;
  if (r.endsAt && new Date(r.endsAt) <= now) return false;
  return true;
}

/** Does the rule's active window overlap another's (open ends run for ever). */
export function windowsOverlap(a: Pick<RuleContent, 'startsAt' | 'endsAt'>, b: Pick<RuleContent, 'startsAt' | 'endsAt'>): boolean {
  const s1 = a.startsAt ? Date.parse(a.startsAt) : -Infinity;
  const e1 = a.endsAt ? Date.parse(a.endsAt) : Infinity;
  const s2 = b.startsAt ? Date.parse(b.startsAt) : -Infinity;
  const e2 = b.endsAt ? Date.parse(b.endsAt) : Infinity;
  return s1 < e2 && s2 < e1;
}

/**
 * PR 213, 112 — who may use a coupon: everybody (the default, so a public code works for guests), guests only (not logged
 * in), members only (logged in), or (PR 213 follow-up, SIM-F-050) a first order only: no earlier order on his phone
 * number or account, cancelled ones aside. Here, without a database, so the admin's coupon sheet can list them.
 */
export const COUPON_AUDIENCES = ['ALL', 'GUESTS', 'MEMBERS', 'FIRST_ORDER'] as const;
export type CouponAudience = (typeof COUPON_AUDIENCES)[number];
/** A stored audience, read safely: anything unknown is treated as open to everybody. */
export const couponAudienceOf = (v: string | null | undefined): CouponAudience => ((COUPON_AUDIENCES as readonly string[]).includes(v ?? '') ? (v as CouponAudience) : 'ALL');
