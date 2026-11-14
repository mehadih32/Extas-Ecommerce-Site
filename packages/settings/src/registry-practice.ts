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
};
