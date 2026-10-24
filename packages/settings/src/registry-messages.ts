// S05 · the Messages control centre — PR 148 (order status messages by SMS, WhatsApp and e-mail with the no-double-send
// guard; CN-014 idea 5 the WhatsApp self-confirm and idea 10 the exact-amount line; CN-019 the order journey with caps)
// (BACKEND-ARCHITECTURE §5.7 MSG-01, MSG-05; §6.5.6; §8.8). Registry version 40; PR 149 (the log with retries) 41.
// Labels: messages/messages.<lang>.json.
// The words of every message are templates (NotificationTemplate, the default pack); only the short lines the engine
// adds to a template (`{amountLine}`, `{exactAmountLine}`) are texts here, in both languages.
//
// The defaults follow the owner's send rule (Blueprint B2.5 V2, Note 4.7): an SMS when the order is placed, an SMS
// when the shop confirms it, one WhatsApp when it is packed — then nothing until delivery, the later steps are switches,
// off. CN-019: the Day-1 care and Day-3 review messages are on (outside the caps, they are after delivery). Every number
// is the owner's to change; nothing here moves money. Every channel runs on its mock until the owner types a key in.
import { z } from 'zod';
import { setting } from './define';
import { templateTextSchema } from './schemas';

const V = 40;

/** The channels a journey step may use. */
export const MESSAGE_CHANNELS = ['SMS', 'WHATSAPP', 'EMAIL'] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

/**
 * The order journey (MSG-01): the timeline from the order received to the follow-ups after delivery, then the event
 * notices outside the timeline. Which order event starts each step is code (@extas/messages pure.ts `stepsOf`); what each
 * step does is this setting.
 */
export const JOURNEY_STEPS = [
  'placed',
  'selfConfirm',
  'confirmed',
  'packed',
  'booked',
  'outForDelivery',
  'deliveryDay',
  'delivered',
  'day1Care',
  'day3Review',
  'cancelled',
  'onHold',
  'advanceRequested',
  'giftReceiver',
] as const;
export type JourneyStep = (typeof JOURNEY_STEPS)[number];

/** When a step's message goes: at once, some minutes later, or at a time of day some days after the event. */
export const stepWhenSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('now') }).strict(),
  z.object({ kind: z.literal('after'), minutes: z.int().min(1).max(60 * 24 * 14) }).strict(),
  z.object({ kind: z.literal('at'), days: z.int().min(0).max(30), hour: z.int().min(0).max(23), minute: z.int().min(0).max(59) }).strict(),
]);

const templateKey = z.string().regex(/^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)*$/, { message: 'dotted camelCase key' }).max(80);

/** One step of the journey. */
export const journeyStepSchema = z
  .object({
    on: z.boolean(),
    channel: z.enum(MESSAGE_CHANNELS),
    /** Tried when the channel cannot reach the customer (no number, not on WhatsApp, failed for good). */
    fallback: z.enum(['NONE', ...MESSAGE_CHANNELS]),
    /** Also by e-mail when the order has an address (B2.5: the order e-mail). */
    email: z.boolean(),
    when: stepWhenSchema,
    /** Which orders: every order, cash on delivery only, or prepaid only. */
    who: z.enum(['all', 'cod', 'prepaid']),
    /** The template (NotificationTemplate.key) of the step's words. */
    template: templateKey,
  })
  .strict()
  .refine((s) => s.fallback !== s.channel, { message: 'the fallback is another channel' });
export type JourneyStepConfig = z.output<typeof journeyStepSchema>;

export const journeySchema = z.object(Object.fromEntries(JOURNEY_STEPS.map((s) => [s, journeyStepSchema])) as Record<JourneyStep, typeof journeyStepSchema>).strict();
export type Journey = z.output<typeof journeySchema>;

const step = (on: boolean, channel: MessageChannel, template: string, more: Partial<JourneyStepConfig> = {}): JourneyStepConfig => ({
  on,
  channel,
  fallback: 'NONE',
  email: false,
  when: { kind: 'now' },
  who: 'all',
  template,
  ...more,
});

/** The owner's send rule as the shipped journey (B2.5 V2; CN-019 Day-1 and Day-3 on). */
export const DEFAULT_JOURNEY: Journey = {
  placed: step(true, 'SMS', 'order.placed', { email: true }),
  selfConfirm: step(false, 'WHATSAPP', 'order.selfConfirm', { fallback: 'SMS', who: 'cod' }),
  confirmed: step(true, 'SMS', 'order.confirmed'),
  packed: step(true, 'WHATSAPP', 'order.packed'),
  booked: step(false, 'SMS', 'order.booked'),
  outForDelivery: step(false, 'SMS', 'order.outForDelivery'),
  deliveryDay: step(false, 'SMS', 'order.deliveryDay', { who: 'cod' }),
  delivered: step(false, 'SMS', 'order.delivered'),
  day1Care: step(true, 'WHATSAPP', 'order.care', { when: { kind: 'at', days: 1, hour: 11, minute: 0 } }),
  day3Review: step(true, 'WHATSAPP', 'order.review', { when: { kind: 'at', days: 3, hour: 11, minute: 0 } }),
  cancelled: step(false, 'SMS', 'order.cancelled'),
  onHold: step(false, 'SMS', 'order.onHold'),
  advanceRequested: step(false, 'SMS', 'order.advanceRequested'),
  giftReceiver: step(false, 'SMS', 'gift.receiver'),
};

/**
 * The caps per order (MSG-01, Doot D09): at most this many messages of the order journey on each channel, and in
 * total; `null` = no cap. A message over a cap is not sent and is logged as blocked. The follow-ups after delivery
 * (Day-1, Day-3) and the event notices (cancelled, on hold, advance, gift receiver) are outside the caps.
 */
export const capsSchema = z
  .object({
    SMS: z.int().min(0).max(50).nullable(),
    WHATSAPP: z.int().min(0).max(50).nullable(),
    EMAIL: z.int().min(0).max(50).nullable(),
    total: z.int().min(0).max(100).nullable(),
  })
  .strict();

/** CN-014 idea 5 — the WhatsApp self-confirm (its on/off and audience are the journey's `selfConfirm` step). */
export const selfConfirmSchema = z
  .object({
    /** Only a customer's first order. */
    newCustomersOnly: z.boolean(),
    /** No reply after this many hours: the order goes to the call queue (0 = never: no call task for a missing reply). */
    waitHours: z.int().min(0).max(72),
    /** His "1" confirms the order through the order service, with a staff confirm's guards (an open duplicate review or
     *  cancel request, an advance still owed: then it stays for the team, the reply on its timeline). Off: the team
     *  confirms every order itself, the "1" only noted. */
    confirmOnYes: z.boolean(),
    /** The self-confirm WhatsApp is the order's one WhatsApp (SIM-F-011: the packed WhatsApp then does not go). */
    countsAsTheOneWhatsApp: z.boolean(),
  })
  .strict();

/** Quiet hours (MSG-05): a message that falls inside waits until they end. The "order received" message never waits. */
export const quietHoursSchema = z
  .object({ on: z.boolean(), fromHour: z.int().min(0).max(23), toHour: z.int().min(0).max(23) })
  .strict()
  .refine((q) => q.fromHour !== q.toHour, { message: 'quiet hours start and end at different hours' });

/** The engine's pace: how often the worker plans and sends, how far back it reads the timeline, how many at a time. */
export const messageEngineSchema = z
  .object({
    everySeconds: z.int().min(10).max(3_600),
    /** A step whose order event is older than this is never sent late. */
    lookbackMinutes: z.int().min(10).max(60 * 24 * 7),
    batchSize: z.int().min(1).max(1_000),
  })
  .strict();

/** CN-014 idea 10 — the exact-amount line, shown when `account.track.exactAmount` is on: the due words and the paid words. */
export const exactAmountTextSchema = z
  .object({ due: templateTextSchema(['amount', 'link'], 200), paid: templateTextSchema(['link'], 200) })
  .strict();

/**
 * PR 149 — retries (§8.8): a message whose sender failed is tried again after each wait in turn (the last wait repeats),
 * up to `maxAttempts` tries in all; then it is FAILED and its step's fallback channel is tried. A number the channel
 * cannot reach at all (not on WhatsApp) is never retried. Staff may retry a FAILED message once more by hand.
 */
export const messageRetrySchema = z
  .object({
    maxAttempts: z.int().min(1).max(10),
    delaysMinutes: z.array(z.int().min(1).max(60 * 24)).min(1).max(9),
  })
  .strict();

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'messages', version: V } as const;

export const messageSettings = {
  'messages.enabled': setting({
    ...base,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'messages.enabled.label',
    helpKey: 'messages.enabled.help',
    sortOrder: 10,
  }),
  'messages.journey': setting({
    ...base,
    schema: journeySchema,
    default: DEFAULT_JOURNEY,
    valueType: 'JSON',
    labelKey: 'messages.journey.label',
    helpKey: 'messages.journey.help',
    sortOrder: 20,
  }),
  'messages.caps': setting({
    ...base,
    schema: capsSchema,
    default: { SMS: 2, WHATSAPP: 1, EMAIL: null, total: null },
    valueType: 'JSON',
    labelKey: 'messages.caps.label',
    helpKey: 'messages.caps.help',
    sortOrder: 30,
  }),
  'messages.selfConfirm': setting({
    ...base,
    schema: selfConfirmSchema,
    default: { newCustomersOnly: false, waitHours: 3, confirmOnYes: true, countsAsTheOneWhatsApp: true },
    valueType: 'JSON',
    labelKey: 'messages.selfConfirm.label',
    helpKey: 'messages.selfConfirm.help',
    sortOrder: 40,
  }),
  'messages.language': setting({
    ...base,
    schema: z.enum(['store', 'bn', 'en']),
    default: 'store',
    valueType: 'ENUM',
    labelKey: 'messages.language.label',
    helpKey: 'messages.language.help',
    sortOrder: 50,
  }),
  'messages.quietHours': setting({
    ...base,
    schema: quietHoursSchema,
    default: { on: false, fromHour: 22, toHour: 8 },
    valueType: 'JSON',
    labelKey: 'messages.quietHours.label',
    helpKey: 'messages.quietHours.help',
    sortOrder: 60,
  }),
  'messages.amountLine': setting({
    ...base,
    schema: templateTextSchema(['amount'], 160),
    default: { en: 'Please keep {amount} ready for the rider.', bn: 'ডেলিভারির সময় {amount} হাতে রাখুন।' },
    valueType: 'LOCALIZED_TEXT',
    labelKey: 'messages.amountLine.label',
    helpKey: 'messages.amountLine.help',
    sortOrder: 70,
  }),
  'messages.exactAmount': setting({
    ...base,
    schema: exactAmountTextSchema,
    default: {
      due: { en: 'Pay the rider exactly {amount}. Not a taka more. Asked for more? Tell us: {link}', bn: 'ডেলিভারিম্যানকে ঠিক {amount} দিন। এক টাকাও বেশি নয়। বেশি চাইলে জানান: {link}' },
      paid: { en: 'This order is paid. Pay the rider nothing. Asked for money? Tell us: {link}', bn: 'এই অর্ডারের টাকা দেওয়া হয়ে গেছে। ডেলিভারিম্যানকে কিছু দেবেন না। টাকা চাইলে জানান: {link}' },
    },
    valueType: 'JSON',
    labelKey: 'messages.exactAmount.label',
    helpKey: 'messages.exactAmount.help',
    sortOrder: 80,
  }),
  'messages.engine': setting({
    ...base,
    schema: messageEngineSchema,
    default: { everySeconds: 60, lookbackMinutes: 180, batchSize: 100 },
    valueType: 'JSON',
    labelKey: 'messages.engine.label',
    helpKey: 'messages.engine.help',
    sortOrder: 90,
  }),
  // ---- PR 149 · the notification log with retries ----
  'messages.retry': setting({
    ...base,
    version: 41,
    schema: messageRetrySchema,
    default: { maxAttempts: 3, delaysMinutes: [5, 30] },
    valueType: 'JSON',
    labelKey: 'messages.retry.label',
    helpKey: 'messages.retry.help',
    sortOrder: 100,
  }),
  'messages.log.pageSize': setting({
    ...base,
    version: 41,
    schema: z.int().min(10).max(200),
    default: 50,
    valueType: 'INT',
    labelKey: 'messages.log.pageSize.label',
    helpKey: 'messages.log.pageSize.help',
    sortOrder: 110,
  }),
};
