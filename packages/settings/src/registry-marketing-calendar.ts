// S13 · PR 282 (register "Marketing calendar across ads, content and social"; Blueprint C6.1 item 5 "Marketing calendar
// — Eid, Puja, Pohela Boishakh, winter", BACKEND-ARCHITECTURE MKT-01 "one marketing calendar (campaigns, festive
// cut-offs, ads, content, social)", demo 97x-adm2-marketing.js x2Cal) — registry version 217, lane B.
//
// - `marketing.calendar`: Marketing › Calendar. Off as it ships. On, one calendar shows, day by day on the shop's clock,
//   what is planned across marketing — campaigns (with their landing pages and orders), the ads running, message sends
//   (SMS, WhatsApp, e-mail blasts), the seasonal home windows, the festive cut-offs, blog posts and social posts — and
//   the owner's own plan lines ("Eid", "Pohela Boishakh", "Winter sale"). `days` is how many days one view shows (the
//   Campaigns page's card shows the same view). The calendar only reads; it never starts, stops or sends anything.
import { z } from 'zod';
import { setting } from './define';

const V282 = 217;

/** The fewest and most days one calendar view may show (a guard, not a business number). */
export const CALENDAR_DAYS_MIN = 7; // hardcode-ok: a view-length guard
export const CALENDAR_DAYS_MAX = 366; // hardcode-ok: a view-length guard

export const marketingCalendarSettingsSchema = z
  .object({
    enabled: z.boolean(),
    days: z.number().int().min(CALENDAR_DAYS_MIN).max(CALENDAR_DAYS_MAX),
  })
  .strict();
export type MarketingCalendarSettings = z.output<typeof marketingCalendarSettingsSchema>;

export const marketingCalendarSettings = {
  'marketing.calendar': setting({
    scope: 'store',
    schema: marketingCalendarSettingsSchema,
    // hardcode-ok: the shipped default (off; the demo's "next 60 days" view for when it is switched on)
    default: { enabled: false, days: 60 },
    valueType: 'JSON',
    group: 'marketing',
    labelKey: 'marketing.calendar.label',
    helpKey: 'marketing.calendar.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 36,
    version: V282,
  }),
};
