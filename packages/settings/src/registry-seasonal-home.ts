// S13 · PR 280 (register "Seasonal homepage switching, scheduled"; Blueprint CN-012 (1) "scheduled campaigns switch by
// date, with the launch default as fallback", D10.3 named snapshots) — registry version 215, lane B.
//
// - `marketing.seasonalHome`: Marketing › Seasonal home. Off as it ships. The owner saves home-page looks ("Eid 2027":
//   the sections and their order, the hero's words, the collection whose products slide in the hero) and schedules
//   each one for a window; inside the window the home page shows that look, after it the home page is the owner's
//   own home settings again by itself. While the switch is off the home page never changes and nothing is scheduled.
// - Follow-up 650 (registry version 249): `marketing.seasonalHome.notes` — a note in the admin's bell (the people who
//   may see marketing) when a window starts and when it ends or is stopped, for `days` days. Off as it ships.
import { z } from 'zod';
import { setting } from './define';

const V280 = 215;

export const seasonalHomeSettingsSchema = z.object({ enabled: z.boolean() }).strict();
export type SeasonalHomeSettings = z.output<typeof seasonalHomeSettingsSchema>;

const V650 = 249;
/** How many days a start or end stays in the bell (the limits of the field). */
export const SEASONAL_NOTE_DAYS = { min: 1, max: 60 } as const; // hardcode-ok: the field's bounds
export const seasonalHomeNotesSchema = z.object({ enabled: z.boolean(), days: z.int().min(SEASONAL_NOTE_DAYS.min).max(SEASONAL_NOTE_DAYS.max) }).strict();
export type SeasonalHomeNotes = z.output<typeof seasonalHomeNotesSchema>;

export const seasonalHomeSettings = {
  'marketing.seasonalHome': setting({
    scope: 'store',
    schema: seasonalHomeSettingsSchema,
    // hardcode-ok: the shipped default (off; switched on in Marketing › Seasonal home)
    default: { enabled: false },
    valueType: 'JSON',
    group: 'marketing',
    labelKey: 'marketing.seasonalHome.label',
    helpKey: 'marketing.seasonalHome.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 34,
    version: V280,
  }),
  'marketing.seasonalHome.notes': setting({
    scope: 'store',
    schema: seasonalHomeNotesSchema,
    // hardcode-ok: the shipped default (off; a start or end stays a week in the bell once switched on)
    default: { enabled: false, days: 7 },
    valueType: 'JSON',
    group: 'marketing',
    labelKey: 'marketing.seasonalHome.notes.label',
    helpKey: 'marketing.seasonalHome.notes.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 35,
    version: V650,
  }),
};
