// S14 · CRM (CN-031 lane A, After launch; PR 287 onwards). Registry versions 190–209 (lane A's reserved numbers). Labels:
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
//
// PR 293 (`customers.aiWriter`, v194): the AI campaign writer (Blueprint C6.1 item 3) — 2 or 3 versions of an offer
// e-mail or SMS in the owner's voice: his greeting, his sign-off and how he talks, in each language (owner's words,
// empty as shipped), and the longest SMS it drafts. Off as shipped, and it also needs AI for the whole shop
// (`ai.enabled`); it runs on the practice writer until an AI provider's key is in the vault. It only fills the form: a
// person picks a version, and saving and scheduling stay his.
//
// PR 294 (`customers.sendAdvice`, v195): who to send to and when (Blueprint C6.1 item 4) — on an e-mail send's form, the
// saved segments ranked by how many of their people bought recently (and can get offer e-mails), and the hours and the
// weekday the store's orders come in, outside the quiet hours, each with its reasoning in numbers. Off as shipped; the
// rule-based reading (C6.1: "rule-based fallback when AI is off") works without AI. Advice only: the person picks.
//
// PR 296 (`customers.points`, v197): rewards and points with the owner's own rules (Customers › Loyalty & wallet) —
// points for each delivered order (per ৳100 of goods and/or a fixed number per order), given `holdDays` after the
// delivery (the exchange window) and never for an order delivered more than `lookbackDays` before the run; and, only
// when the owner sets both numbers, a customer turns each block of `redeemPoints` points into `redeemMinor` of wallet
// credit himself (My account › Rewards). Off as shipped with every number at 0: nothing is earned and nothing becomes
// money until the owner types his own rule. The late-delivery apology credit is `payments.wallet.apology` (PR 172).
//
// PR 299 (`customers.export`, v198): the customer export (Customers › All customers › Export) — off as shipped; when on,
// a person holding `customers.export` downloads the list's people as one CSV file with a reason, at most `maxRows`
// people (more are refused with the count, never cut). The retention rule always applies: an erased or archived
// profile is never in the file, the address, IP and location never, and the number only as the person may see it.
//
// PR 300 (`customers.winback`, v199): win-back campaigns (Messages › Campaigns, the CN-019 control centre's campaign
// tab with win-back as its ready-made type) — an SMS or WhatsApp from one of the shop's templates to the people who have
// not ordered for N days (and, if the campaign says so, not longer than M days, with at least K orders, inside a saved
// segment). Off as shipped; a campaign is a draft until a person holding `messages.campaigns.send` schedules it. Each
// message is an offer: the customer's yes for offers on that channel (PR 298), never after his stop, never in the quiet
// hours, at most `perCustomerPerWeek` offers by phone to one person in seven days (journeys and campaigns together),
// never a second win-back to one person within `gapDays`; `batchSize` people queued per run (the throttle); the orders
// a receiver places within `resultDays` count as the campaign's result; `defaultLapsedDays` fills a new campaign's form;
// `stopLine` is added to every such SMS (the offer opt-out, CN-021 P14).
// A campaign never makes or changes an offer, a price or a discount: its words are a template the owner wrote.
//
// PR 301 (`customers.birthday`, v200): the birthday field (My account › Profile), ready for the parked birthday module
// (Blueprint C6.6, Appendix F). Off as shipped; when on, a signed-in customer may give his birthday — the day and the
// month, the year only when `askYear` is on — change it or clear it, and his customer page shows it. Nothing is sent,
// given or promised for it: birthday messages and gifts stay parked until the owner asks.
//
// PR 303 (`customers.report`, v201): Reports › Customers (REP-04) — new, returning and quiet (churned) buyers over a
// period, overall and per saved segment. Off as shipped; `quietDays` is when a buyer with no order counts as quiet, and
// `segmentsShown` how many saved segments the report splits by. Read-only: it counts, it never sends or changes anything.
import { z } from 'zod';
import { setting } from './define';

/** PR 288 — the journey view's kinds (the same list as @extas/customers journey-kinds.ts). */
export const JOURNEY_KIND_KEYS = ['profile', 'visit', 'touch', 'order', 'exchange', 'message', 'chat', 'review', 'wallet', 'consent', 'merge', 'note'] as const;

/** PR 289 — the step a journey's message carries in the message log (NotificationLog.step); the Messages engine sends it. */
export const CRM_MESSAGE_STEP = 'crmJourney';

/** PR 290 — the step an offer e-mail of an e-mail send carries in the message log; the Messages engine sends it. */
export const CRM_EMAIL_STEP = 'crmEmail';

/** PR 300 — the step a win-back campaign's message carries in the message log; the Messages engine sends it. */
export const CRM_CAMPAIGN_STEP = 'crmCampaign';

/** PR 290 — the key prefix of the owner's e-mail templates (NotificationTemplate, channel EMAIL). */
export const CRM_EMAIL_TEMPLATE_PREFIX = 'crmEmail.';

/** PR 301 — the year a birthday is stored with when the customer gave only the day and the month (a leap year, so
 * 29 February fits). Never an age: `birthdayParts` reads it back as "no year". */
export const BIRTHDAY_NO_YEAR = 1904; // hardcode-ok: a storage marker, not a business figure

/** PR 301 — a birthday as people say it: the day, the month (1–12) and the year when it was given. */
export interface BirthdayParts {
  day: number;
  month: number;
  year: number | null;
}

/** PR 301 — the stored date (a Postgres DATE, read as midnight UTC) as its parts; the marker year reads as no year. */
export function birthdayParts(d: Date | null | undefined): BirthdayParts | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  return { day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: y === BIRTHDAY_NO_YEAR ? null : y };
}

/** PR 301 — the date to store for these parts, or null when no such day exists (31 April, 29 February 2001). */
export function birthdayDate(p: BirthdayParts): Date | null {
  const y = p.year ?? BIRTHDAY_NO_YEAR;
  if (!Number.isInteger(p.day) || !Number.isInteger(p.month) || !Number.isInteger(y)) return null;
  const d = new Date(Date.UTC(y, p.month - 1, p.day));
  if (y < 100) d.setUTCFullYear(y);
  return d.getUTCFullYear() === y && d.getUTCMonth() === p.month - 1 && d.getUTCDate() === p.day ? d : null;
}

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

/** PR 293 — the AI campaign writer. */
const voiceLine = z.string().trim().max(200);
const voiceLang = z.object({ bn: voiceLine, en: voiceLine }).strict();
export const aiWriterSettingsSchema = z
  .object({
    enabled: z.boolean(),
    versions: z.int().min(2).max(3),
    smsMaxChars: z.int().min(60).max(1000),
    greeting: voiceLang,
    signOff: voiceLang,
    style: voiceLang,
  })
  .strict();
export type AiWriterSettings = z.output<typeof aiWriterSettingsSchema>;

/** PR 294 — segment and timing advice. */
export const sendAdviceSettingsSchema = z
  .object({
    enabled: z.boolean(),
    lookbackDays: z.int().min(7).max(730),
    minOrders: z.int().min(1).max(10_000),
    windowHours: z.int().min(1).max(6),
    maxSegments: z.int().min(1).max(10),
  })
  .strict();
export type SendAdviceSettings = z.output<typeof sendAdviceSettingsSchema>;

/** PR 296 — rewards and points (the owner's rules; 0 = that part does nothing). */
export const pointsSettingsSchema = z
  .object({
    enabled: z.boolean(),
    pointsPer100: z.int().min(0).max(10_000),
    orderPoints: z.int().min(0).max(100_000),
    holdDays: z.int().min(0).max(90),
    lookbackDays: z.int().min(1).max(365),
    redeemPoints: z.int().min(0).max(1_000_000),
    redeemMinor: z.int().min(0).max(10_000_000),
    batchSize: z.int().min(1).max(2_000),
  })
  .strict();
export type PointsSettings = z.output<typeof pointsSettingsSchema>;

/** PR 299 — the customer export (off as shipped; the most people one file holds). */
export const customerExportSettingsSchema = z.object({ enabled: z.boolean(), maxRows: z.int().min(1).max(50_000) }).strict();
export type CustomerExportSettings = z.output<typeof customerExportSettingsSchema>;

/** PR 300 — win-back campaigns (off as shipped). */
export const winbackSettingsSchema = z
  .object({
    enabled: z.boolean(),
    perCustomerPerWeek: z.int().min(1).max(14),
    gapDays: z.int().min(1).max(365),
    batchSize: z.int().min(10).max(5000),
    resultDays: z.int().min(1).max(60),
    defaultLapsedDays: z.int().min(7).max(730),
    stopLine: z.object({ bn: stopLine, en: stopLine }).strict(),
  })
  .strict();
export type WinbackSettings = z.output<typeof winbackSettingsSchema>;

/** PR 301 — the birthday field (off as shipped; the year only when asked). */
export const birthdaySettingsSchema = z.object({ enabled: z.boolean(), askYear: z.boolean() }).strict();
export type BirthdaySettings = z.output<typeof birthdaySettingsSchema>;

/** PR 303 — Reports › Customers (REP-04): off as shipped; after how many days without an order a buyer counts as quiet
 * (churned), and how many saved segments the report splits by. */
export const customerReportSettingsSchema = z
  .object({ enabled: z.boolean(), quietDays: z.number().int().min(7).max(730), segmentsShown: z.number().int().min(1).max(50) })
  .strict();
export type CustomerReportSettings = z.output<typeof customerReportSettingsSchema>;

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
  'customers.aiWriter': setting({
    ...base,
    version: 194,
    schema: aiWriterSettingsSchema,
    // hardcode-ok: registry default (off; 3 versions; one long SMS; the owner's voice empty until he types it)
    default: { enabled: false, versions: 3, smsMaxChars: 306, greeting: { bn: '', en: '' }, signOff: { bn: '', en: '' }, style: { bn: '', en: '' } },
    valueType: 'JSON',
    labelKey: 'customers.aiWriter.label',
    helpKey: 'customers.aiWriter.help',
    sortOrder: 240,
  }),
  'customers.sendAdvice': setting({
    ...base,
    version: 195,
    schema: sendAdviceSettingsSchema,
    default: { enabled: false, lookbackDays: 90, minOrders: 30, windowHours: 2, maxSegments: 3 }, // hardcode-ok: registry default (off; reading window and sizes)
    valueType: 'JSON',
    labelKey: 'customers.sendAdvice.label',
    helpKey: 'customers.sendAdvice.help',
    sortOrder: 250,
  }),
  'customers.points': setting({
    ...base,
    version: 197,
    schema: pointsSettingsSchema,
    default: { enabled: false, pointsPer100: 0, orderPoints: 0, holdDays: 7, lookbackDays: 30, redeemPoints: 0, redeemMinor: 0, batchSize: 200 }, // hardcode-ok: registry default (off; no points and no money until the owner's rule)
    valueType: 'JSON',
    labelKey: 'customers.points.label',
    helpKey: 'customers.points.help',
    sortOrder: 260,
  }),
  'customers.export': setting({
    ...base,
    version: 198,
    schema: customerExportSettingsSchema,
    default: { enabled: false, maxRows: 5_000 }, // hardcode-ok: registry default (off; the owner's number to change)
    valueType: 'JSON',
    labelKey: 'customers.export.label',
    helpKey: 'customers.export.help',
    sortOrder: 270,
  }),
  'customers.winback': setting({
    ...base,
    version: 199,
    schema: winbackSettingsSchema,
    // hardcode-ok: registry default (off; caps, throttle, the form's first value and the stop line's words)
    default: { enabled: false, perCustomerPerWeek: 1, gapDays: 30, batchSize: 200, resultDays: 14, defaultLapsedDays: 90, stopLine: { bn: 'অফার বন্ধ করতে STOP লিখে পাঠান', en: 'Reply STOP to stop offers' } },
    valueType: 'JSON',
    labelKey: 'customers.winback.label',
    helpKey: 'customers.winback.help',
    sortOrder: 280,
  }),  'customers.birthday': setting({
    ...base,
    version: 200,
    schema: birthdaySettingsSchema,
    default: { enabled: false, askYear: false }, // hardcode-ok: registry default (off)
    valueType: 'JSON',
    labelKey: 'customers.birthday.label',
    helpKey: 'customers.birthday.help',
    sortOrder: 290,
  }),
  'customers.report': setting({
    ...base,
    version: 201,
    schema: customerReportSettingsSchema,
    default: { enabled: false, quietDays: 60, segmentsShown: 10 }, // hardcode-ok: registry default (off; the owner's numbers to change)
    valueType: 'JSON',
    labelKey: 'customers.report.label',
    helpKey: 'customers.report.help',
    sortOrder: 300,
  }),
};
