// S14 · CRM (CN-031 lane A, After launch; PR 287 onwards). Registry versions 190–199 (lane A's reserved numbers). Labels:
// messages/customers.<lang>.json (the "customers" group; the admin's place is the Customers section,
// docs/BACKEND-ARCHITECTURE.md §5.5). Every feature here is off as shipped. Nothing here moves money, changes a price,
// COD or a charge, or blocks anyone.
//
// PR 287 (`customers.segments`, v190): saved segments from real behaviour (CUS-03, CUS-03a) — whether the Segments page
// works at all (off: the page says so and nothing is counted), how many saved segments a store may keep, how many
// conditions one segment may join with "and", and how many matching customers the builder shows beside the live count.
//
// PR 288 (`customers.journey`, v191): the Journey tab on a customer's page — on or off (off as shipped), which kinds of
// touch it lists (profiles, visits, touches, orders, exchanges, messages, chats, reviews, wallet, consent, merges,
// notes) and how many rows a page shows.
//
// PR 289 (`customers.journeys`, v192): automations — a customer journey starts on a trigger (N days after a delivered
// order, the product-life reminder; N days without an order; N days after he joined), then waits, checks he still fits
// and sends a message from a template. Off as shipped; how many journeys a store keeps, how many steps one has, how many
// such messages one person may get in a week, how far back a trigger may reach when a journey is turned on, how many
// people one run moves, and the stop line added to every such SMS or e-mail (the offer opt-out, CN-021 P14). These are
// offers: each one needs the customer's yes for offers on that channel (PR 298), and the quiet hours and the master
// switch of Messages hold.
//
// PR 290 (`customers.email`, v193): e-mail marketing (Messages › E-mail) — offer e-mails written from the owner's own
// templates and sent to a saved segment, with the delivery log. Off as shipped; each e-mail needs the customer's yes for
// offer e-mails (PR 298) and always carries the unsubscribe line; at most `perCustomerPerWeek` such e-mails to one person
// in seven days; `batchSize` people queued per run (the throttle); open and click tracking each its own switch, off; the
// orders a receiver places within `resultDays` count as the send's result (Sales only when delivered).
import { z } from 'zod';
import { setting } from './define';

/** PR 288 — the journey view's kinds (the same list as @extas/customers journey-kinds.ts). */
export const JOURNEY_KIND_KEYS = ['profile', 'visit', 'touch', 'order', 'exchange', 'message', 'chat', 'review', 'wallet', 'consent', 'merge', 'note'] as const;

/** PR 289 — the step a journey's message carries in the message log (NotificationLog.step); the Messages engine sends it. */
export const CRM_MESSAGE_STEP = 'crmJourney';

/** PR 290 — the step an offer e-mail of an e-mail send carries in the message log; the Messages engine sends it. */
export const CRM_EMAIL_STEP = 'crmEmail';

/** PR 290 — the key prefix of the owner's e-mail templates (NotificationTemplate, channel EMAIL). */
export const CRM_EMAIL_TEMPLATE_PREFIX = 'crmEmail.';

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'customers' } as const;

/** PR 287 — saved segments. */
export const segmentSettingsSchema = z
  .object({
    enabled: z.boolean(),
    maxSegments: z.int().min(1).max(500),
    maxConditions: z.int().min(1).max(50),
    previewShown: z.int().min(0).max(50),
  })
  .strict();

/** PR 288 — the journey view. */
export const journeySettingsSchema = z
  .object({
    enabled: z.boolean(),
    kinds: z
      .array(z.enum(JOURNEY_KIND_KEYS))
      .max(JOURNEY_KIND_KEYS.length)
      .refine((l) => new Set(l).size === l.length, { message: 'every kind once' }),
    perPage: z.int().min(10).max(200),
  })
  .strict();

/** PR 289 — automations (customer journeys). */
const stopLine = z.string().trim().max(120);
export const journeysSettingsSchema = z
  .object({
    enabled: z.boolean(),
    maxJourneys: z.int().min(1).max(200),
    maxSteps: z.int().min(1).max(20),
    perCustomerPerWeek: z.int().min(1).max(14),
    catchUpDays: z.int().min(0).max(60),
    batchSize: z.int().min(10).max(5000),
    stopLine: z.object({ bn: stopLine, en: stopLine }).strict(),
  })
  .strict();
export type JourneysSettings = z.output<typeof journeysSettingsSchema>;

/** PR 290 — e-mail marketing. */
const mailLine = z.string().trim().min(1).max(160);
export const emailMarketingSettingsSchema = z
  .object({
    enabled: z.boolean(),
    perCustomerPerWeek: z.int().min(1).max(14),
    batchSize: z.int().min(10).max(5000),
    trackOpens: z.boolean(),
    trackClicks: z.boolean(),
    resultDays: z.int().min(1).max(60),
    maxTemplates: z.int().min(1).max(500),
    unsubscribeLine: z.object({ bn: mailLine, en: mailLine }).strict(),
  })
  .strict();
export type EmailMarketingSettings = z.output<typeof emailMarketingSettingsSchema>;

export const crmSettings = {
  'customers.segments': setting({
    ...base,
    version: 190,
    schema: segmentSettingsSchema,
    default: { enabled: false, maxSegments: 50, maxConditions: 10, previewShown: 8 }, // hardcode-ok: registry default (off; list sizes)
    valueType: 'JSON',
    labelKey: 'customers.segments.label',
    helpKey: 'customers.segments.help',
    sortOrder: 200,
  }),
  'customers.journey': setting({
    ...base,
    version: 191,
    schema: journeySettingsSchema,
    default: { enabled: false, kinds: [...JOURNEY_KIND_KEYS], perPage: 50 }, // hardcode-ok: registry default (off; rows per page)
    valueType: 'JSON',
    labelKey: 'customers.journey.label',
    helpKey: 'customers.journey.help',
    sortOrder: 210,
  }),
  'customers.journeys': setting({
    ...base,
    version: 192,
    schema: journeysSettingsSchema,
    // hardcode-ok: registry default (off; limits; the stop line's words)
    default: { enabled: false, maxJourneys: 20, maxSteps: 10, perCustomerPerWeek: 2, catchUpDays: 7, batchSize: 500, stopLine: { bn: 'অফার বন্ধ করতে STOP লিখে পাঠান', en: 'Reply STOP to stop offers' } },
    valueType: 'JSON',
    labelKey: 'customers.journeys.label',
    helpKey: 'customers.journeys.help',
    sortOrder: 220,
  }),
  'customers.email': setting({
    ...base,
    version: 193,
    schema: emailMarketingSettingsSchema,
    // hardcode-ok: registry default (off; limits; the unsubscribe line's words)
    default: { enabled: false, perCustomerPerWeek: 1, batchSize: 500, trackOpens: false, trackClicks: false, resultDays: 7, maxTemplates: 50, unsubscribeLine: { bn: 'অফারের ই-মেইল আর চান না? এখানে বন্ধ করুন', en: 'No more offer e-mails? Unsubscribe here' } },
    valueType: 'JSON',
    labelKey: 'customers.email.label',
    helpKey: 'customers.email.help',
    sortOrder: 230,
  }),
};
