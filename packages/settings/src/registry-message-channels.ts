// S14 · the Messages control centre's channels (BACKEND-ARCHITECTURE §5.7 MSG-05 "Channels & limits"; CN-019). Registry
// version 61. Labels: messages/messages.<lang>.json (the `messages` group, beside the journey's own settings).
//
// PR 291 — the SMS gateway: the shop's masking name (the brand name an SMS comes from, once the gateway had it approved)
// and what one SMS part costs, masked and not (the owner's own figures: empty until he types them; the log's cost is an
// estimate from them when the gateway does not say its price).
// PR 292 — the WhatsApp Business Platform: the template language codes, the approval category and the webhook's size.
//
// Nothing here sends anything on its own, moves money or changes a price.
import { z } from 'zod';
import { setting } from './define';

const V = 61;

/** Where the masking name stands at the gateway (the owner marks it; the gateway's own panel is where it is asked for). */
export const SMS_MASKING_STATES = ['none', 'requested', 'approved', 'rejected'] as const;
export type SmsMaskingState = (typeof SMS_MASKING_STATES)[number];

/** PR 291 — the masking name: up to 11 letters, digits, spaces and . & - (the operators' rule for a sender name). */
export const smsMaskingSchema = z
  .object({
    senderName: z
      .string()
      .trim()
      .max(11)
      .regex(/^[A-Za-z0-9 .&-]*$/, { message: 'letters, digits, spaces and . & - only' }),
    state: z.enum(SMS_MASKING_STATES),
    /** Once approved, every SMS goes from the name (off: from the gateway's own number, e.g. while a new name is asked). */
    useWhenApproved: z.boolean(),
  })
  .strict()
  .refine((m) => m.state === 'none' || m.senderName.length > 0, { message: 'a masking name is needed once it is asked for', path: ['senderName'] });
export type SmsMasking = z.output<typeof smsMaskingSchema>;

/** PR 291 — what one SMS part costs on the gateway (minor units; null = not known: no cost is shown). */
export const smsRatesSchema = z
  .object({
    maskedMinor: z.int().min(0).max(100_000).nullable(),
    nonMaskedMinor: z.int().min(0).max(100_000).nullable(),
  })
  .strict();
export type SmsRates = z.output<typeof smsRatesSchema>;

/**
 * PR 292 — the WhatsApp Business Platform: the provider's language code for each language of a template (Meta names
 * Bengali `bn`, English `en` or `en_US`), the category templates are sent for approval in (order updates are UTILITY),
 * the largest webhook body read (a bigger one is refused before it is read) and how long a self-confirm reply counts.
 */
export const whatsappSettingsSchema = z
  .object({
    languageCodes: z.object({ en: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/), bn: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/) }).strict(),
    category: z.enum(['UTILITY', 'MARKETING']),
    webhookMaxBodyKb: z.int().min(16).max(4_096),
    /** How long after the self-confirm question a customer's "1", "2" or "3" is still read as its answer (hours). */
    replyWindowHours: z.int().min(1).max(720),
  })
  .strict();
export type WhatsAppSettings = z.output<typeof whatsappSettingsSchema>;

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'messages', version: V } as const;

export const messageChannelSettings = {
  // ---- PR 291 · the SMS gateway ----
  'messages.sms.masking': setting({
    ...base,
    // the shop's brand name: the owner's own
    isOwnerData: true,
    // null = no masking name yet (every SMS from the gateway's own number)
    schema: smsMaskingSchema.nullable(),
    default: null,
    valueType: 'JSON',
    labelKey: 'messages.sms.masking.label',
    helpKey: 'messages.sms.masking.help',
    sortOrder: 200,
  }),
  'messages.sms.rates': setting({
    ...base,
    // what the shop pays its gateway: the owner's own figures
    isOwnerData: true,
    // null = the prices are not known: no cost is shown
    schema: smsRatesSchema.nullable(),
    default: null,
    valueType: 'JSON',
    labelKey: 'messages.sms.rates.label',
    helpKey: 'messages.sms.rates.help',
    sortOrder: 210,
  }),
  // ---- PR 292 · the WhatsApp Business Platform ----
  'messages.whatsapp': setting({
    ...base,
    schema: whatsappSettingsSchema,
    default: { languageCodes: { en: 'en', bn: 'bn' }, category: 'UTILITY', webhookMaxBodyKb: 256, replyWindowHours: 168 },
    valueType: 'JSON',
    labelKey: 'messages.whatsapp.label',
    helpKey: 'messages.whatsapp.help',
    sortOrder: 220,
  }),
};
