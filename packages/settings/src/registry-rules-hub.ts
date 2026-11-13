// S28 · PR 678 and PR 679 (CN-048, admin prototype v5, GAP-MAP R-14, O-36) — registry version 320. Two settings of the Rules page:
//
// - `rules.hub.popups` (PR 678): the owner's own words and window for the shop's twelve system pop-ups and notices (the hub of
//   Rules › Pop-ups & notices). One entry per placement key; a placement with no entry keeps the shop's built-in wording and the
//   state of the rule that drives it. `on` is the owner's own switch (off as shipped); `textEn` / `textBn` are the owner's words
//   with `{details}` filled in by the shop; `from` / `to` are dates (empty: always); `n` is the one number a few of them have
//   (the low-stock notice: show when this many are left or fewer). Nothing here is shown on arrival: the hub never makes a pop-up
//   open by itself on the first page a visitor sees.
// - `orders.peak` (PR 679): Peak and Eid mode — a daily cap on orders (the shop stops promising a delivery day when the day is full),
//   the words it shows then, "Print all in parts" (the size of one part) and the roster for the busy days. Off as shipped; every
//   number is empty until the owner sets it (CN-018).
// Labels: messages/rules-hub.<lang>.json.
import { z } from 'zod';
import { setting } from './define';

const V320 = 320;

/** The twelve system placements, in the prototype's order (docs/demo/admin-proto-v5 Rules › Pop-ups & notices). */
export const POPUP_KEYS = ['notice', 'popup', 'holiday', 'freebar', 'dup', 'advance', 'stockhold', 'oos', 'demo', 'lowstock', 'thanks', 'promise'] as const;
export type PopupKey = (typeof POPUP_KEYS)[number];

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'a date like 2026-12-01' });

export const popupEntrySchema = z
  .object({ on: z.boolean(), textEn: z.string().trim().max(200), textBn: z.string().trim().max(200), from: day.nullable(), to: day.nullable(), n: z.int().min(1).max(50).nullable() })
  .strict()
  .refine((v) => !v.from || !v.to || v.from <= v.to, { path: ['to'], message: 'the end is before the start' });
export type PopupEntry = z.output<typeof popupEntrySchema>;

export const popupsSchema = z.partialRecord(z.enum(POPUP_KEYS), popupEntrySchema);
export type PopupsSetting = z.output<typeof popupsSchema>;

export const peakSchema = z
  .object({
    enabled: z.boolean(),
    /** Orders a day the shop can send; empty: no cap. When the day's orders reach it the shop stops promising that day. */
    dailyCap: z.int().min(1).max(100_000).nullable(),
    /** What the shop says when the day is full. */
    fullTextEn: z.string().trim().max(200),
    fullTextBn: z.string().trim().max(200),
    /** "Print all in parts": how many stickers one part holds; empty: one part. */
    partSize: z.int().min(1).max(5_000).nullable(),
    /** Who works on the busy days (a name, what they do, the first and last day). */
    roster: z
      .array(
        z
          .object({ name: z.string().trim().min(1).max(80), task: z.string().trim().max(80), from: day, to: day })
          .strict()
          .refine((r) => r.from <= r.to, { path: ['to'], message: 'the end is before the start' }),
      )
      .max(60),
  })
  .strict();
export type PeakSettings = z.output<typeof peakSchema>;

// hardcode-ok: off as shipped, every number empty until the owner sets it (CN-018)
export const PEAK_DEFAULT: PeakSettings = { enabled: false, dailyCap: null, fullTextEn: '', fullTextBn: '', partSize: null, roster: [] };

export const rulesHubSettings = {
  'rules.hub.popups': setting({
    scope: 'store',
    // hardcode-ok: the shipped value is empty, so no owner data ships; the words typed in live in the owner's own store only
    isOwnerData: false,
    isPublic: false,
    group: 'rules',
    version: V320,
    schema: popupsSchema,
    default: {},
    valueType: 'JSON',
    labelKey: 'rules.hub.popups.label',
    helpKey: 'rules.hub.popups.help',
    sortOrder: 980,
  }),
  'orders.peak': setting({
    scope: 'store',
    isOwnerData: false,
    isPublic: false,
    group: 'orders',
    version: V320,
    schema: peakSchema,
    default: PEAK_DEFAULT,
    valueType: 'JSON',
    labelKey: 'orders.peak.label',
    helpKey: 'orders.peak.help',
    sortOrder: 981,
  }),
} as const;
