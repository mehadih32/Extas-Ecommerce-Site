// S08 · PR 193 (registry version 94, lane C's range; Blueprint B1.14; demo 97t-adm2-delivery.js "Holiday promise note")
// — holiday mode: the days the shop sends nothing (`from` … `to`, store time zone), the storefront notice that says so,
// and the checkout's promise for those days ("ships from {resume}") instead of the usual hours. The site is never taken
// down: the catalogue stays browsable and checkout stays open (B1.14). Labels: messages/holiday.<lang>.json; the
// starting words: `defaults.holiday.*` there.
//
// Off as shipped, with no dates (the owner's own holiday is never fixed in code); switching it on needs both dates,
// the first not after the last. `showDaysBefore`: the notice appears this many days before the first day (0 = only
// during the break). Nothing here moves money, changes a price, a charge or COD.
import { z } from 'zod';
import { setting } from './define';
import { messages, pair } from './messages';
import { templateTextSchema } from './schemas';

const V193 = 94;

/** The tokens each holiday text may use: the first day, the last day, and the day dispatch resumes. */
export const HOLIDAY_TOKENS = { notice: ['from', 'to', 'resume'], promise: ['resume'] } as const;

const day = z.iso.date();

export const holidaySchema = z
  .object({
    enabled: z.boolean(),
    /** The first day nothing is sent (`YYYY-MM-DD`, store time zone). */
    from: day.nullable(),
    /** The last day nothing is sent; dispatch resumes the day after. */
    to: day.nullable(),
    showDaysBefore: z.int().min(0).max(30),
    notice: templateTextSchema(HOLIDAY_TOKENS.notice, 200),
    promise: templateTextSchema(HOLIDAY_TOKENS.promise, 200),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.from && v.to && v.from > v.to) ctx.addIssue({ code: 'custom', path: ['to'], message: 'the last day comes before the first' });
    if (v.enabled && (!v.from || !v.to)) ctx.addIssue({ code: 'custom', path: [v.from ? 'to' : 'from'], message: 'holiday mode needs its first and last day' });
  });
export type HolidaySettings = z.output<typeof holidaySchema>;

export const holidaySettings = {
  'delivery.holiday': setting({
    scope: 'store',
    group: 'delivery',
    valueType: 'JSON',
    isOwnerData: false,
    schema: holidaySchema,
    default: { enabled: false, from: null, to: null, showDaysBefore: 3, notice: pair(messages, 'defaults.holiday.notice'), promise: pair(messages, 'defaults.holiday.promise') },
    labelKey: 'delivery.holiday.label',
    helpKey: 'delivery.holiday.help',
    sortOrder: 930,
    version: V193,
  }),
};
