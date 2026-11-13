// S28 · PR 677 — the pure part of Offers & Discounts 360 (no database): the kinds, the wizard's value schemas and the checks that
// say why an offer cannot be sent for the owner's OK or go live. Shared by the service and the browser wizard.
import { z } from 'zod';

export const OFFER_KINDS = ['FREE_DELIVERY', 'PERCENT', 'FLAT', 'POINTS', 'WALLET_CREDIT'] as const;
export type OfferKindName = (typeof OFFER_KINDS)[number];
export const OFFER_STATES = ['DRAFT', 'AWAITING_OK', 'LIVE', 'PAUSED', 'ENDED'] as const;
export type OfferStateName = (typeof OFFER_STATES)[number];
export const OFFER_TRIGGERS = ['ANY', 'PAY_ONLINE'] as const;

const money = z.int().min(1).max(100_000_000);
const day = z.iso.datetime({ offset: true });

export const offerValueSchema = z
  .object({
    percent: z.int().min(1).max(90).nullable().optional(),
    amountMinor: money.nullable().optional(),
    maxMinor: money.nullable().optional(),
    points: z.int().min(1).max(100_000).nullable().optional(),
    creditMinor: money.nullable().optional(),
  })
  .strict();
export const offerScopeSchema = z.union([z.object({ type: z.literal('all') }).strict(), z.object({ type: z.enum(['category', 'collection', 'product']), id: z.uuid() }).strict()]);
export const offerWhoSchema = z.object({ audience: z.enum(['ALL', 'GUESTS', 'MEMBERS']), firstOrderOnly: z.boolean() }).strict();
export const offerLimitsSchema = z
  .object({ minOrderMinor: money.nullable(), usageLimit: z.int().min(1).max(10_000_000).nullable(), perCustomerLimit: z.int().min(1).max(1000).nullable(), budgetMinor: money.nullable() })
  .strict();

export const offerInputSchema = z
  .object({
    kind: z.enum(OFFER_KINDS),
    trigger: z.enum(OFFER_TRIGGERS).default('ANY'),
    nameEn: z.string().trim().min(1).max(120),
    nameBn: z.string().trim().max(120).nullable().optional(),
    value: offerValueSchema,
    scope: offerScopeSchema,
    who: offerWhoSchema,
    code: z.string().trim().max(40).nullable().optional(),
    startsAt: day.nullable().optional(),
    endsAt: day.nullable().optional(),
    limits: offerLimitsSchema,
  })
  .strict();
export type OfferInput = z.output<typeof offerInputSchema>;

/** Why an offer cannot be sent for the owner's OK or go live as it is (codes; the page turns them into words). */
export type OfferIssue =
  'NO_VALUE' | 'BAD_WINDOW' | 'OFFER_ENGINE_PENDING' | 'ONLINE_NEEDS_ALL' | 'ONLINE_KIND' | 'WHO_NEEDS_CODE' | 'LIMITS_NEED_CODE' | 'MIN_ORDER_FREE_DELIVERY_CODE' | 'ONLINE_REWARD_TAKEN';

export function offerIssues(o: Pick<OfferInput, 'kind' | 'trigger' | 'value' | 'scope' | 'who' | 'code' | 'startsAt' | 'endsAt' | 'limits'>): OfferIssue[] {
  const out: OfferIssue[] = [];
  const v = o.value;
  if (o.kind === 'PERCENT' && !v.percent) out.push('NO_VALUE');
  if (o.kind === 'FLAT' && !v.amountMinor) out.push('NO_VALUE');
  if (o.kind === 'POINTS' && !v.points) out.push('NO_VALUE');
  if (o.kind === 'WALLET_CREDIT' && !v.creditMinor) out.push('NO_VALUE');
  if (o.startsAt && o.endsAt && o.startsAt > o.endsAt) out.push('BAD_WINDOW');
  if (o.kind === 'POINTS' || o.kind === 'WALLET_CREDIT') out.push('OFFER_ENGINE_PENDING');
  const code = (o.code ?? '').trim() !== '';
  if (o.trigger === 'PAY_ONLINE') {
    if (o.kind === 'POINTS' || o.kind === 'WALLET_CREDIT') out.push('ONLINE_KIND');
    if (o.scope.type !== 'all' || code || o.who.audience !== 'ALL' || o.who.firstOrderOnly || o.limits.minOrderMinor || o.limits.usageLimit || o.limits.perCustomerLimit || o.startsAt || o.endsAt)
      out.push('ONLINE_NEEDS_ALL');
  } else if (!code) {
    if (o.who.audience !== 'ALL' || o.who.firstOrderOnly) out.push('WHO_NEEDS_CODE');
    if (o.limits.usageLimit || o.limits.perCustomerLimit) out.push('LIMITS_NEED_CODE');
  } else if (o.kind === 'FREE_DELIVERY' && o.limits.minOrderMinor) out.push('MIN_ORDER_FREE_DELIVERY_CODE');
  return out;
}
