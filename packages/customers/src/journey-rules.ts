// PR 289 — an automation's (customer journey's) shape, without a database (the admin builder, the engine, tests).
// A journey starts on one trigger, then runs its steps in order: wait some days, check the person still fits one
// condition of the segment builder (PR 287; he leaves the journey when he does not), send a message from a template on
// a channel. `exitOnOrder`: he leaves as soon as he places a new order (the journey has done its work).
import { z } from 'zod';
import { segmentCondition } from './segment-rules';

/** What starts a journey: N days after a delivered order (of one category, or any) — the product-life reminder; N days
 * without an order — the win-back; N days after the profile was made — the welcome. */
export const JOURNEY_TRIGGERS = ['delivered', 'noOrder', 'joined'] as const;
export type JourneyTriggerType = (typeof JOURNEY_TRIGGERS)[number];

export const JOURNEY_STEP_KINDS = ['wait', 'check', 'send'] as const;
export type JourneyStepKind = (typeof JOURNEY_STEP_KINDS)[number];

export const JOURNEY_CHANNELS = ['SMS', 'WHATSAPP', 'EMAIL'] as const;
export type JourneyChannel = (typeof JOURNEY_CHANNELS)[number];

const days = (min: number, max: number) => z.int().min(min).max(max);
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export const journeyTrigger = z.discriminatedUnion('type', [
  z.object({ type: z.literal('delivered'), days: days(1, 730), category: uuid.nullable() }).strict(),
  z.object({ type: z.literal('noOrder'), days: days(7, 1095) }).strict(),
  z.object({ type: z.literal('joined'), days: days(0, 365) }).strict(),
]);
export type JourneyTrigger = z.output<typeof journeyTrigger>;

export const journeyStep = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('wait'), days: days(1, 365) }).strict(),
  z.object({ kind: z.literal('check'), condition: segmentCondition }).strict(),
  z
    .object({
      kind: z.literal('send'),
      channel: z.enum(JOURNEY_CHANNELS),
      template: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9._-]{1,80}$/),
    })
    .strict(),
]);
export type JourneyStep = z.output<typeof journeyStep>;

/** The steps as stored (Journey.steps). */
export const journeyPlan = z
  .object({ v: z.literal(1), steps: z.array(journeyStep).min(1).max(20), exitOnOrder: z.boolean() })
  .strict()
  .refine((p) => p.steps.some((s) => s.kind === 'send'), { message: 'a journey sends at least one message', path: ['steps'] });
export type JourneyPlan = z.output<typeof journeyPlan>;

/** A stored journey's trigger and plan, or null when either cannot be read (it then never runs). */
export function readJourney(trigger: unknown, steps: unknown): { trigger: JourneyTrigger; plan: JourneyPlan } | null {
  const t = journeyTrigger.safeParse(trigger);
  const p = journeyPlan.safeParse(steps);
  return t.success && p.success ? { trigger: t.data, plan: p.data } : null;
}

/** Why an enrolment ended before its last step. */
export const JOURNEY_EXITS = ['NOT_MATCHED', 'ORDERED', 'NO_CONTACT', 'STOPPED', 'ERASED'] as const;
export type JourneyExit = (typeof JOURNEY_EXITS)[number];

/** An enrolment's state (JourneyEnrollment.status). */
export const ENROLMENT_STATES = ['ACTIVE', 'DONE', 'EXITED'] as const;
export type EnrolmentState = (typeof ENROLMENT_STATES)[number];

/** The dedupe key of a journey's message: one per enrolment and step, so a run repeated never sends twice. */
export const journeyMessageKey = (enrolmentId: string, step: number): string => `crm:${enrolmentId}:${step}`;
