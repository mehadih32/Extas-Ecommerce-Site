// @extas/analytics — S15 · PR 339 (Blueprint D5.2 "a funnel per product", D5.3's own +6-PR split's "per-page
// funnels built on that layer"). A funnel is an admin-authored, ordered list of steps (each step one catalogue
// event, optionally scoped to one page type/product/category) saved on the already-reserved `Funnel` model
// (`@stage S15 · PR 339` in schema.prisma — no schema edit in this PR). Unlike PR 338's own event capture, a saved
// funnel is the admin's own deliberate choice, not a browser's fire-and-forget beacon, so its shape is validated
// strictly (zod, refused with a 422, never silently dropped) rather than shaped leniently.
//
// `computeFunnelResult` is the deterministic read side (D5.3: "the AI explains; it never invents a number" — this
// file never calls a model, never guesses): given a funnel's own steps and the matching window's already-fetched
// events, it counts, for each step, how many distinct visitors reached it — "reached" meaning a qualifying event
// for that step AND every step before it, within the queried window. This is a presence-based funnel, not a
// strictly time-ordered one (a visitor whose step-2 event timestamp happens to sit before their step-1 event, in
// the same window, still counts at step 2) — stated plainly here rather than decided unilaterally, the same
// honesty PR 337's own diff and PR 308's own schedule preview already practise for a different kind of gap.
import { z } from 'zod';
import { ANALYTICS_EVENT_NAMES, ID_LIKE, PAGE_TYPE_MAX, type AnalyticsEventName } from './events';

/** A funnel's own shape, not a business number — the owner's reports read whatever is saved; these only bound a
 *  single definition to something a report page can still show on one screen. */
export const FUNNEL_NAME_MAX = 80; // hardcode-ok
export const FUNNEL_STEP_KEY_MAX = 40; // hardcode-ok
export const FUNNEL_STEP_LABEL_MAX = 60; // hardcode-ok
export const FUNNEL_STEPS_MIN = 2; // hardcode-ok: a funnel of one step is not a funnel
export const FUNNEL_STEPS_MAX = 8; // hardcode-ok
/** The default window a run covers when the caller gives no `from`/`to` — D5.2's own "weekly and monthly". */
export const FUNNEL_RUN_DEFAULT_DAYS = 30; // hardcode-ok

const idLike = z.string().regex(ID_LIKE);

export const funnelStepSchema = z
  .object({
    /** Unique within the funnel; the report section's own row key, never shown to the owner. */
    key: z.string().trim().min(1).max(FUNNEL_STEP_KEY_MAX),
    /** The owner's own words for this step, e.g. "Opened the size chart". */
    label: z.string().trim().min(1).max(FUNNEL_STEP_LABEL_MAX),
    eventName: z.enum(ANALYTICS_EVENT_NAMES),
    /** Narrows the step to one page kind/product/category; left out, the step matches the event name alone. */
    pageType: z.string().trim().min(1).max(PAGE_TYPE_MAX).nullish(),
    productId: idLike.nullish(),
    categoryId: idLike.nullish(),
  })
  .strict();
export type FunnelStepDef = z.infer<typeof funnelStepSchema>;

export const funnelStepsSchema = z
  .array(funnelStepSchema)
  .min(FUNNEL_STEPS_MIN)
  .max(FUNNEL_STEPS_MAX)
  .refine((steps) => new Set(steps.map((s) => s.key)).size === steps.length, { message: 'duplicate step key' });

export const funnelInputSchema = z
  .object({
    name: z.string().trim().min(1).max(FUNNEL_NAME_MAX),
    steps: funnelStepsSchema,
  })
  .strict();
export type FunnelInput = z.infer<typeof funnelInputSchema>;

export const funnelPatchSchema = funnelInputSchema.partial().strict();
export type FunnelPatch = z.infer<typeof funnelPatchSchema>;

/** The slice of a stored `AnalyticsEvent` row a funnel's own computation ever reads — never a prop, never a
 *  customer id: a funnel counts distinct visitors, logged in or not, exactly as D5.1 asks for "logged-in vs guest
 *  on every event" to stay readable from the event's own other fields, not from this function. */
export interface FunnelEventRow {
  visitorId: string;
  name: AnalyticsEventName;
  pageType: string | null;
  productId: string | null;
  categoryId: string | null;
}

export interface FunnelStepResult {
  key: string;
  label: string;
  /** Distinct visitors who reached this step (and every step before it) within the queried window. */
  visitors: number;
  /** `visitors` of this step divided by the previous step's own `visitors`; `null` for the first step. */
  conversionFromPrevious: number | null;
  /** `visitors` of this step divided by the first step's own `visitors`; `null` for the first step. */
  conversionFromFirst: number | null;
}

export interface FunnelResult {
  steps: FunnelStepResult[];
}

function stepMatches(step: FunnelStepDef, row: FunnelEventRow): boolean {
  if (row.name !== step.eventName) return false;
  if (step.pageType && row.pageType !== step.pageType) return false;
  if (step.productId && row.productId !== step.productId) return false;
  if (step.categoryId && row.categoryId !== step.categoryId) return false;
  return true;
}

/** Pure and deterministic: the same steps and the same events always produce the same counts, never a model call. */
export function computeFunnelResult(steps: readonly FunnelStepDef[], events: readonly FunnelEventRow[]): FunnelResult {
  const results: FunnelStepResult[] = [];
  let reached: Set<string> | null = null; // null only before the first step is folded in
  for (const step of steps) {
    const qualifying = new Set<string>();
    for (const e of events) if (stepMatches(step, e)) qualifying.add(e.visitorId);
    const prevReached: Set<string> | null = reached;
    const next: Set<string> = prevReached === null ? qualifying : new Set([...prevReached].filter((v) => qualifying.has(v)));
    reached = next;
    const visitors = next.size;
    const prev = results[results.length - 1] ?? null;
    const first = results[0] ?? null;
    results.push({
      key: step.key,
      label: step.label,
      visitors,
      conversionFromPrevious: prev ? (prev.visitors > 0 ? visitors / prev.visitors : 0) : null,
      conversionFromFirst: first ? (first.visitors > 0 ? visitors / first.visitors : 0) : null,
    });
  }
  return { steps: results };
}
