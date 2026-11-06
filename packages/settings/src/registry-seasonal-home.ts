// S13 · PR 280 (register "Seasonal homepage switching, scheduled"; Blueprint CN-012 (1) "scheduled campaigns switch by
// date, with the launch default as fallback", D10.3 named snapshots) — registry version 215, lane B.
//
// - `marketing.seasonalHome`: Marketing › Seasonal home. Off as it ships. The owner saves home-page looks ("Eid 2027":
//   the sections and their order, the hero's words, the collection whose products slide in the hero) and schedules
//   each one for a window; inside the window the home page shows that look, after it the home page is the owner's
//   own home settings again by itself. While the switch is off the home page never changes and nothing is scheduled.
import { z } from 'zod';
import { setting } from './define';

const V280 = 215;

export const seasonalHomeSettingsSchema = z.object({ enabled: z.boolean() }).strict();
export type SeasonalHomeSettings = z.output<typeof seasonalHomeSettingsSchema>;

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
};
