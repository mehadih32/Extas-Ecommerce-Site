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
};
