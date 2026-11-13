// S15 · PR 338 (Blueprint D5, "Analytics — Locked") — the site-wide analytics event layer's one setting: the master
// switch. D5.3's own build order is "deterministic event capture first", with nothing depending on an outside
// service — unlike `ads.tracking` (registry-tracking.ts), there is no platform key to wait for, so this ships ON: the
// owner's reports (PR 339–341) need real data from day one. Turning it off only stops new events from being recorded;
// nothing already saved is ever removed (CLAUDE.md rule 3). The event names and their shape live in `@extas/analytics`
// (packages/analytics/src/events.ts), never here — the registry only knows the one on/off switch.
import { z } from 'zod';
import { setting } from './define';

const V = 288;

export const analyticsEventsSchema = z.object({ on: z.boolean() }).strict();
export type AnalyticsEventsSettings = z.output<typeof analyticsEventsSchema>;

export const analyticsSettings = {
  'analytics.events': setting({
    scope: 'store',
    schema: analyticsEventsSchema,
    default: { on: true },
    valueType: 'JSON',
    group: 'analytics',
    labelKey: 'analytics.events.label',
    helpKey: 'analytics.events.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 10,
    version: V,
  }),
};
