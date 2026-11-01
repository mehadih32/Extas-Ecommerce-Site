// S14 · PR 287 — what a saved segment is made of, without a database (the builder in the browser and the service share
// it): a list of conditions joined with "and" (Blueprint B5.2, demo V12.4 CUS-03a). Each condition is one behaviour the
// shop really saw — orders, delivered spend (Sales, CN-022), the true delivery share, when he last ordered or first came,
// a category or a size he bought, an area his parcels went to, where he first came from, his offers consent, a refusal
// that was not the shop's fault, an exchange. Never a guess: a field the shop does not know (gender, age) is not here.
import { z } from 'zod';

/** How a condition's value is typed in the builder. */
export type SegmentFieldKind = 'count' | 'money' | 'percent' | 'days' | 'category' | 'size' | 'area' | 'source' | 'consent' | 'yesno';

/** Every condition a segment may use, in the builder's order, with the kind of its value. */
export const SEGMENT_FIELDS = {
  ordersMin: 'count',
  ordersMax: 'count',
  salesMin: 'money',
  deliveryMin: 'percent',
  lastOrderOver: 'days',
  lastOrderWithin: 'days',
  joinedWithin: 'days',
  category: 'category',
  size: 'size',
  area: 'area',
  source: 'source',
  consent: 'consent',
  refused: 'yesno',
  exchanged: 'yesno',
} as const satisfies Record<string, SegmentFieldKind>;
export type SegmentField = keyof typeof SEGMENT_FIELDS;
export const SEGMENT_FIELD_KEYS = Object.keys(SEGMENT_FIELDS) as SegmentField[];

/** The offers consent a condition may ask for: SMS offers, WhatsApp offers, or neither. */
export const SEGMENT_CONSENTS = ['sms', 'whatsapp', 'none'] as const;

const UUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const count = z.int().min(0).max(100_000);
const days = z.int().min(1).max(3650);

/** One condition (a field and its value). */
export const segmentCondition = z.discriminatedUnion('field', [
  z.object({ field: z.literal('ordersMin'), value: count }).strict(),
  z.object({ field: z.literal('ordersMax'), value: count }).strict(),
  z.object({ field: z.literal('salesMin'), value: z.int().min(0).max(10_000_000_000) }).strict(),
  z.object({ field: z.literal('deliveryMin'), value: z.int().min(0).max(100) }).strict(),
  z.object({ field: z.literal('lastOrderOver'), value: days }).strict(),
  z.object({ field: z.literal('lastOrderWithin'), value: days }).strict(),
  z.object({ field: z.literal('joinedWithin'), value: days }).strict(),
  z.object({ field: z.literal('category'), value: UUID }).strict(),
  z.object({ field: z.literal('size'), value: z.string().trim().min(1).max(20) }).strict(),
  z.object({ field: z.literal('area'), value: UUID }).strict(),
  z.object({ field: z.literal('source'), value: z.string().trim().min(1).max(60) }).strict(),
  z.object({ field: z.literal('consent'), value: z.enum(SEGMENT_CONSENTS) }).strict(),
  z.object({ field: z.literal('refused'), value: z.boolean() }).strict(),
  z.object({ field: z.literal('exchanged'), value: z.boolean() }).strict(),
]);
export type SegmentCondition = z.output<typeof segmentCondition>;

/** The stored definition (Segment.definition): version 1, every condition must hold. */
export const segmentDefinition = z.object({ v: z.literal(1), all: z.array(segmentCondition).max(50) }).strict();
export type SegmentDefinition = z.output<typeof segmentDefinition>;

/** A definition as stored, or null when it is not one this version reads (shown as "cannot be read", never guessed). */
export function readDefinition(raw: unknown): SegmentDefinition | null {
  const r = segmentDefinition.safeParse(raw);
  return r.success ? r.data : null;
}

/** The built-in segments: the Customers list's own views, counted live (never stored). */
export const BUILT_IN_SEGMENTS = ['new', 'returning', 'vip', 'atrisk', 'refused', 'exchanged', 'nooffers'] as const;
export type BuiltInSegment = (typeof BUILT_IN_SEGMENTS)[number];
