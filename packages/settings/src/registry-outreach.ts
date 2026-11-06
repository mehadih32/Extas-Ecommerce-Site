// S13 · PR 279 (register "SEO outreach pipeline"; ADMIN-ARCHITECTURE 4.8 Marketing › More options) — registry version
// 214, lane B.
//
// - `marketing.outreach`: Marketing › SEO outreach. Off as it ships. The owner keeps the list of websites he asks for a
//   link to the shop (blogs, news sites, fashion pages), moves each one along the pipeline (found → asked → answered →
//   link live, or said no), notes the person to write to and the day to follow up, and keeps the address of the page
//   where his link went live.
//   - `enabled`: the switch; while it is off nothing can be added or changed and the page only says so.
//   - `followUpDays`: when a site is marked "asked" without a follow-up day, the day is set this many days later
//     (0 = no day is set by itself).
//   - `pitchSubject` / `pitchBody`: the owner's own words for the first e-mail, in English and Bengali (both languages,
//     or null = no "write to them" button). `{site}` becomes the site, `{shop}` the shop's address. The button only opens the
//     owner's own e-mail app with these words; he reads them and presses send himself. Nothing is ever sent from here.
import { z } from 'zod';
import { setting } from './define';

const V279 = 214;

/** The longest pitch subject and body (guards, not business numbers). */
export const OUTREACH_SUBJECT_MAX = 200; // hardcode-ok: a text-length guard
export const OUTREACH_BODY_MAX = 2000; // hardcode-ok: a text-length guard

const words = (max: number) => z.object({ en: z.string().trim().min(1).max(max), bn: z.string().trim().min(1).max(max) }).strict().nullable();

export const outreachSettingsSchema = z
  .object({
    enabled: z.boolean(),
    followUpDays: z.number().int().min(0).max(90),
    pitchSubject: words(OUTREACH_SUBJECT_MAX),
    pitchBody: words(OUTREACH_BODY_MAX),
  })
  .strict();
export type OutreachSettings = z.output<typeof outreachSettingsSchema>;

export const outreachSettings = {
  'marketing.outreach': setting({
    scope: 'store',
    schema: outreachSettingsSchema,
    // hardcode-ok: the shipped default (off, the follow-up gap editable on Marketing › SEO outreach, no words)
    default: { enabled: false, followUpDays: 7, pitchSubject: null, pitchBody: null },
    valueType: 'JSON',
    group: 'marketing',
    labelKey: 'marketing.outreach.label',
    helpKey: 'marketing.outreach.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 33,
    version: V279,
  }),
};
