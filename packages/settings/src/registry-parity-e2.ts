// PR 815-820 (owner order 15 Nov 2026: the real admin equals prototype v5 100%, lane E2) — the few small settings the prototype's
// Settings and AI Center screens need that did not exist yet. Nothing here runs an agent, moves money or sends anything to a buyer;
// every one ships off or empty and every number is editable on its own page. Registry version 817-820.
// - `ai.costSaverAuto` (PR 818): turn the cost-saver mode (`ai.costSaver`) on by itself at 80% of the AI ceiling (`ai.monthlyCapMinor`).
// - `ai.digest` (PR 819): the AI's daily digest of what waits for the owner: on/off, time, Telegram, e-mail.
// - `ai.trainingOff` (PR 820): ids of corrections and documents the owner switched off (rows are never edited or deleted).
// - `telegram.control` (PR 817): daily report time, weekly audit, the alert switches, the big-order line and the allowed accounts.
// - `payments.settlement` (PR 817): which account each way of paying lands in, and in how many working days.
// Labels: messages/parity-e2.<lang>.json.
import { z } from 'zod';
import { setting } from './define';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'a time like 22:00');
const text = (max: number) => z.string().trim().max(max);
const base = { scope: 'installation', valueType: 'JSON', group: 'system', isOwnerData: false, isPublic: false } as const;

export const aiDigestSchema = z.object({ on: z.boolean(), time: hhmm, telegram: z.boolean(), email: z.boolean() }).strict();
export type AiDigestSettings = z.output<typeof aiDigestSchema>;
export const AI_DIGEST_DEFAULT: AiDigestSettings = { on: false, time: '08:00', telegram: true, email: false }; // hardcode-ok: shipped off, editable on the Approvals page

/** The line staff and the shop see while AI is off, in both languages; empty = the built-in words (PR 819). */
export const AI_OFF_TEXT_MAX = 300; // hardcode-ok: technical bound
export const aiOffTextSchema = z.object({ en: text(AI_OFF_TEXT_MAX), bn: text(AI_OFF_TEXT_MAX) }).strict();
export type AiOffTextSettings = z.output<typeof aiOffTextSchema>;

/** A technical bound (a save may not become a book), not a business number. */
export const TRAINING_OFF_MAX = 400; // hardcode-ok: technical bound
export const aiTrainingOffSchema = z.object({ ids: z.array(z.string().trim().min(1).max(64)).max(TRAINING_OFF_MAX) }).strict();
export type AiTrainingOffSettings = z.output<typeof aiTrainingOffSchema>;

export const TELEGRAM_ALERTS = ['down', 'backup', 'bigOrder', 'erp', 'login'] as const;
export type TelegramAlert = (typeof TELEGRAM_ALERTS)[number];
export const TELEGRAM_ACCOUNTS_MAX = 10; // hardcode-ok: technical bound
export const telegramControlSchema = z
  .object({
    reportTime: hhmm,
    weeklyAudit: z.boolean(),
    alerts: z.object({ down: z.boolean(), backup: z.boolean(), bigOrder: z.boolean(), erp: z.boolean(), login: z.boolean() }).strict(),
    /** Whole minor units of the store currency; 0 = no big-order alert. */
    bigOrderOverMinor: z.int().min(0).max(2_000_000_000), // hardcode-ok: the column's bound
    accounts: z.array(z.object({ id: z.string().trim().regex(/^-?\d{3,20}$/, 'a Telegram number'), who: text(80), role: text(60) }).strict()).max(TELEGRAM_ACCOUNTS_MAX),
    /** The one-time pairing code (only its hash is kept) and when it stops working. */
    pairHash: z.string().max(128).nullable(),
    pairUntil: z.string().max(40).nullable(),
  })
  .strict();
export type TelegramControlSettings = z.output<typeof telegramControlSchema>;
export const TELEGRAM_CONTROL_DEFAULT: TelegramControlSettings = {
  reportTime: '22:00', // hardcode-ok: shipped default, editable on the Telegram page
  weeklyAudit: false,
  alerts: { down: false, backup: false, bigOrder: false, erp: false, login: false },
  bigOrderOverMinor: 0,
  accounts: [],
  pairHash: null,
  pairUntil: null,
};

export const SETTLEMENT_METHODS = ['bkash', 'nagad', 'card', 'cod'] as const;
export type SettlementMethod = (typeof SETTLEMENT_METHODS)[number];
export const SETTLEMENT_ACCOUNTS_MAX = 12; // hardcode-ok: technical bound
const way = z.object({ account: text(80), days: z.int().min(0).max(30) }).strict(); // hardcode-ok: a month is the longest a settlement may take
export const paymentsSettlementSchema = z
  .object({ accounts: z.array(text(80).min(1)).max(SETTLEMENT_ACCOUNTS_MAX), bkash: way, nagad: way, card: way, cod: way })
  .strict();
export type PaymentsSettlementSettings = z.output<typeof paymentsSettlementSchema>;
export const PAYMENTS_SETTLEMENT_DEFAULT: PaymentsSettlementSettings = {
  accounts: [],
  bkash: { account: '', days: 1 },
  nagad: { account: '', days: 1 },
  card: { account: '', days: 2 },
  cod: { account: '', days: 7 },
}; // hardcode-ok: shipped empty; the owner names the accounts

export const parityE2Settings = {
  'ai.costSaverAuto': setting({
    ...base,
    valueType: 'BOOLEAN',
    group: 'ai',
    schema: z.boolean(),
    default: false,
    labelKey: 'ai.costSaverAuto.label',
    helpKey: 'ai.costSaverAuto.help',
    sortOrder: 818,
    version: 818,
  }),
  'ai.digest': setting({
    ...base,
    group: 'ai',
    schema: aiDigestSchema,
    default: AI_DIGEST_DEFAULT,
    labelKey: 'ai.digest.label',
    helpKey: 'ai.digest.help',
    sortOrder: 819,
    version: 819,
  }),
  'ai.offText': setting({
    ...base,
    group: 'ai',
    schema: aiOffTextSchema,
    default: { en: '', bn: '' },
    labelKey: 'ai.offText.label',
    helpKey: 'ai.offText.help',
    sortOrder: 819,
    version: 819,
  }),
  'ai.trainingOff': setting({
    ...base,
    group: 'ai',
    schema: aiTrainingOffSchema,
    default: { ids: [] },
    labelKey: 'ai.trainingOff.label',
    helpKey: 'ai.trainingOff.help',
    sortOrder: 820,
    version: 820,
  }),
  'telegram.control': setting({
    ...base,
    group: 'system',
    schema: telegramControlSchema,
    default: TELEGRAM_CONTROL_DEFAULT,
    labelKey: 'telegram.control.label',
    helpKey: 'telegram.control.help',
    sortOrder: 817,
    version: 817,
  }),
  'payments.settlement': setting({
    ...base,
    group: 'payment',
    isOwnerData: true,
    schema: paymentsSettlementSchema.nullable(),
    default: null, // owner data ships without a value; PAYMENTS_SETTLEMENT_DEFAULT is what an unset value reads as
    labelKey: 'payments.settlement.label',
    helpKey: 'payments.settlement.help',
    sortOrder: 817,
    version: 817,
  }),
};
