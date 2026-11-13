// S28 · PR 663 (Admin v5; prototype Rules › Order flow › Auto-confirm) — registry version 294.
//
// `orders.autoConfirm`: the rules that decide which new orders go straight to Confirmed and which stay in Processing. One
// table of nine cases, each answered "confirm by itself" (`auto`), "call list" (`call`) or "red tag, a person decides"
// (`person`). Nothing is ever blocked or cancelled by it, and it never touches money, a price or Cash on Delivery
// (CLAUDE.md rule 6): the only thing `auto` does is the same Confirm a person would press (PR 138's order service).
// The three presets (Low / Normal / Strict) fill the table. A "suspicious" order (a duplicate, a re-order, a new identity,
// a high risk level) can never be answered `auto`. Off as shipped; the number of delivered parcels that makes a customer
// "trusted" and the cash-on-delivery limit that sends a big order to the call list are the owner's (empty limit: none).
import { z } from 'zod';
import { setting } from './define';

const V663 = 294;

/** The nine cases the table decides, in the prototype's order. */
export const AUTO_CONFIRM_CASES = ['prepaid', 'delivery', 'trusted', 'goodScore', 'brandNew', 'refused', 'refusedPaid', 'bigCod', 'suspicious'] as const;
export type AutoConfirmCase = (typeof AUTO_CONFIRM_CASES)[number];

/** What the table answers for a case. */
export const AUTO_CONFIRM_ACTIONS = ['auto', 'call', 'person'] as const;
export type AutoConfirmAction = (typeof AUTO_CONFIRM_ACTIONS)[number];

export const AUTO_CONFIRM_PRESET_KEYS = ['low', 'normal', 'strict', 'custom'] as const;
export type AutoConfirmPresetKey = (typeof AUTO_CONFIRM_PRESET_KEYS)[number];

type Table = Record<AutoConfirmCase, AutoConfirmAction>;

/** The fraud-level presets that fill the table (the prototype's Low / Normal / Strict). */
export const AUTO_CONFIRM_PRESETS: Record<Exclude<AutoConfirmPresetKey, 'custom'>, Table> = {
  low: { prepaid: 'auto', delivery: 'auto', trusted: 'auto', goodScore: 'auto', brandNew: 'auto', refused: 'call', refusedPaid: 'auto', bigCod: 'call', suspicious: 'person' },
  normal: { prepaid: 'auto', delivery: 'auto', trusted: 'auto', goodScore: 'auto', brandNew: 'call', refused: 'call', refusedPaid: 'auto', bigCod: 'call', suspicious: 'person' },
  strict: { prepaid: 'auto', delivery: 'call', trusted: 'auto', goodScore: 'call', brandNew: 'call', refused: 'person', refusedPaid: 'call', bigCod: 'call', suspicious: 'person' },
};

const action = z.enum(AUTO_CONFIRM_ACTIONS);

export const ordersAutoConfirmSchema = z
  .object({
    /** Off: every order waits for a person, as before. */
    enabled: z.boolean(),
    /** The preset the table was filled from; 'custom' once a row was changed by hand. */
    preset: z.enum(AUTO_CONFIRM_PRESET_KEYS),
    cases: z.object({ prepaid: action, delivery: action, trusted: action, goodScore: action, brandNew: action, refused: action, refusedPaid: action, bigCod: action, suspicious: action }).strict(),
    /** Delivered parcels that make an old customer "trusted". */
    trustedMinDelivered: z.int().min(1).max(100),
    /** The most refusals (not our fault) a trusted customer may have. */
    trustedMaxRefused: z.int().min(0).max(20),
    /** A cash-on-delivery order above this (minor units) goes to the call list; empty: no limit. */
    bigCodMinor: z.int().min(1).max(100_000_000).nullable(),
  })
  .strict()
  .refine((v) => v.cases.suspicious !== 'auto', { path: ['cases', 'suspicious'], message: 'a suspicious order is never confirmed by itself' });
export type OrdersAutoConfirm = z.output<typeof ordersAutoConfirmSchema>;

// hardcode-ok: the shipped table is the Normal preset; every cell, the trusted count and the big-order limit are the owner's, editable.
export const ORDERS_AUTO_CONFIRM_DEFAULT: OrdersAutoConfirm = {
  enabled: false,
  preset: 'normal',
  cases: { ...AUTO_CONFIRM_PRESETS.normal },
  trustedMinDelivered: 1,
  trustedMaxRefused: 0,
  bigCodMinor: null,
};

export const autoConfirmSettings = {
  'orders.autoConfirm': setting({
    scope: 'store',
    isOwnerData: false,
    isPublic: false,
    group: 'orders',
    version: V663,
    schema: ordersAutoConfirmSchema,
    default: ORDERS_AUTO_CONFIRM_DEFAULT,
    valueType: 'JSON',
    labelKey: 'orders.autoConfirm.label',
    helpKey: 'orders.autoConfirm.help',
    sortOrder: 347,
  }),
};
