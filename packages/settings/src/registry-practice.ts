// S28 · PR 706 (CN-049, 13 Nov 2026) — practice data. `practice.enabled` is the owner's switch for the practice period
// (off as shipped): while on, flagged sample records (orders, customers, incomplete orders, courier claims and payouts,
// sample products) show in the admin like real ones with a small "Practice" mark, and never leave the system. Off: they
// are hidden from every list and report. `practice.showReset` shows the "Reset sample data" button on the Practice data
// screen (on by default; it only appears while practice is on); the owner turns it off himself when the practice period
// is over. Nothing here is a number. Labels: messages/practice.<lang>.json.
import { z } from 'zod';
import { setting } from './define';

const V = 380;

export const practiceFlagSchema = z.object({ on: z.boolean() }).strict();
export type PracticeFlagSettings = z.output<typeof practiceFlagSchema>;

/** `practice.photoBatch`: how many sample products get their pictures in one press of "Add practice photos" (small, so a press is quick). */
export const practicePhotoBatchSchema = z.object({ count: z.number().int().min(1).max(20) }).strict();

const base = {
  scope: 'store',
  valueType: 'JSON',
  group: 'admin',
  isOwnerData: false,
  isPublic: false,
  schema: practiceFlagSchema,
  version: V,
} as const;

/** PR 725: the small "Practice shop" notice on the storefront while practice mode is on (the owner can hide it or change its words). */
export const practiceNoticeSchema = z.object({ show: z.boolean(), textEn: z.string().max(200), textBn: z.string().max(200) }).strict();
export type PracticeNoticeSettings = z.output<typeof practiceNoticeSchema>;

export const practiceSettings = {
  'practice.enabled': setting({
    ...base,
    default: { on: false }, // hardcode-ok: off as shipped; the owner turns practice mode on
    labelKey: 'practice.enabled.label',
    helpKey: 'practice.enabled.help',
    sortOrder: 728,
  }),
  'practice.showReset': setting({
    ...base,
    default: { on: true }, // hardcode-ok: shown while practice is on (CN-049); the owner turns it off later
    labelKey: 'practice.showReset.label',
    helpKey: 'practice.showReset.help',
    sortOrder: 729,
  }),
  'practice.photoBatch': setting({
    ...base,
    schema: practicePhotoBatchSchema,
    default: { count: 4 }, // hardcode-ok: a small batch keeps one press under the web server's time limit; the owner can change it
    labelKey: 'practice.photoBatch.label',
    helpKey: 'practice.photoBatch.help',
    sortOrder: 730,
  }),
  // PR 725: the sample data fills by itself while practice mode is on (on as shipped); a reset switches it off, "Turn on" or "Add sample data" switches it on again.
  'practice.autoFill': setting({
    ...base,
    default: { on: true }, // hardcode-ok: the owner's decision of 15 Nov 2026: the practice shop fills by itself while practice is on
    labelKey: 'practice.autoFill.label',
    helpKey: 'practice.autoFill.help',
    sortOrder: 731,
  }),
  // PR 725: the notice's words are settings, in both languages; the owner can hide it.
  'practice.notice': setting({
    ...base,
    schema: practiceNoticeSchema,
    default: { show: true, textEn: 'Practice shop: the products and orders here are samples.', textBn: 'প্র্যাকটিস দোকান: এখানকার পণ্য আর অর্ডার নমুনা।' }, // hardcode-ok: the default words of the practice notice, edited in Settings
    labelKey: 'practice.notice.label',
    helpKey: 'practice.notice.help',
    sortOrder: 732,
  }),
};
