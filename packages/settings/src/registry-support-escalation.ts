// S22 · PR 538 (CN-031 lane C; Blueprint B4.14 V2 note — the 18 Oct round, §59 answers 48, 49 and 54) — when nobody
// answers, desk hours, and the links customers send. Registry version 188 (lane C's range). Labels:
// messages/support-escalation.<lang>.json; the admin's place is Support → Support settings (docs/ADMIN-ARCHITECTURE.md
// §4.7).
//
// `support.deskHours` (per store): when the support desk works (answer 49: "backend, dynamic").
// - `enabled`: off = the desk is always open (as it ships, CN-018).
// - `days`: the days it opens; `opens`, `closes`: the hours (24-hour "HH:MM", the store's own time zone; closes after
//   it opens — a desk past midnight is two days of the list).
//
// `support.escalation` (per store): the owner is told on Telegram when a customer waits and no employee answers
// (answer 48: "AI answers first; a settable employee window, then Telegram to the owner").
// - `enabled`: off as it ships. The owner's bot is on Keys & connections; until it is connected the line goes to the
//   practice copy and nothing leaves the server (A1.3).
// - `minutes`: how long a customer waits for an answer before the owner is told (the round's 5 minutes).
// - `outsideHours`: 'wait' = the clock only runs while the desk is open; 'tell' = the owner is told at any hour.
// - `showName`: the line names the customer (else only the channel and the chat's reference).
// - `perHour`: at most this many lines an hour per store (a busy evening never floods his phone).
// - `lookBackHours`: a wait that began longer ago than this is not reported (switching it on never sends the whole
//   backlog).
// - `lang`, `words`: the line's language and its words ({minutes}, {channel}, {name}, {ref}).
//
// `support.linkSafety` (per store): the links in a customer's message are checked (answer 54); a risky one is shown
// as text that cannot be opened, with a danger mark. Off as it ships.
// - `trustedSites`: the shop's own and partner sites (comma-separated), never risky; a site that only looks like one of
//   them ("extas-offer.top") is.
// - `shorteners`: link shorteners (the real address is hidden); `riskyEndings`: site endings often used for scams;
//   `riskyFiles`: files that install or run something.
// - `flagNumbers`: a link to a bare number address (no site name) is risky.
//
// Nothing here sends a customer a message, moves money, changes an order, a price or COD, blocks or deletes anything.
import { z } from 'zod';
import { setting } from './define';

export const DESK_DAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const;
export type DeskDay = (typeof DESK_DAYS)[number];
export const ESCALATION_OUTSIDE_HOURS = ['wait', 'tell'] as const;
export const ESCALATION_LANGS = ['bn', 'en'] as const;

/** The waiting minutes and the hourly cap, smallest and largest. */
export const ESCALATION_BOUNDS = { minutes: { min: 1, max: 240 }, perHour: { min: 1, max: 200 }, lookBackHours: { min: 1, max: 168 } } as const;
/** The longest list of sites or endings (characters). */
export const LINK_LIST_MAX = 1000;
/** The longest Telegram words. */
export const ESCALATION_WORDS_MAX = 300;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const minutesOf = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));

export const supportDeskHoursSchema = z
  .object({
    enabled: z.boolean(),
    days: z.array(z.enum(DESK_DAYS)).max(DESK_DAYS.length).refine((a) => new Set(a).size === a.length, 'each day once'),
    opens: z.string().regex(HHMM),
    closes: z.string().regex(HHMM),
  })
  .strict()
  .refine((v) => minutesOf(v.closes) > minutesOf(v.opens), { message: 'the desk closes after it opens', path: ['closes'] });
export type SupportDeskHours = z.output<typeof supportDeskHoursSchema>;

const words = z.string().trim().min(1).max(ESCALATION_WORDS_MAX);
export const supportEscalationSchema = z
  .object({
    enabled: z.boolean(),
    minutes: z.number().int().min(ESCALATION_BOUNDS.minutes.min).max(ESCALATION_BOUNDS.minutes.max),
    outsideHours: z.enum(ESCALATION_OUTSIDE_HOURS),
    showName: z.boolean(),
    perHour: z.number().int().min(ESCALATION_BOUNDS.perHour.min).max(ESCALATION_BOUNDS.perHour.max),
    lookBackHours: z.number().int().min(ESCALATION_BOUNDS.lookBackHours.min).max(ESCALATION_BOUNDS.lookBackHours.max),
    lang: z.enum(ESCALATION_LANGS),
    words: z.object({ en: words, bn: words }).strict(),
  })
  .strict();
export type SupportEscalationSettings = z.output<typeof supportEscalationSchema>;

const list = z.string().trim().max(LINK_LIST_MAX);
export const supportLinkSafetySchema = z
  .object({
    enabled: z.boolean(),
    trustedSites: list,
    shorteners: list,
    riskyEndings: list,
    riskyFiles: list,
    flagNumbers: z.boolean(),
  })
  .strict();
export type SupportLinkSafetySettings = z.output<typeof supportLinkSafetySchema>;

export const supportEscalationSettings = {
  'support.deskHours': setting({
    scope: 'store',
    group: 'support',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: supportDeskHoursSchema,
    default: { enabled: false, days: [...DESK_DAYS], opens: '10:00', closes: '22:00' },
    labelKey: 'support.deskHours.label',
    helpKey: 'support.deskHours.help',
    sortOrder: 63,
    version: 188,
  }),
  'support.escalation': setting({
    scope: 'store',
    group: 'support',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: supportEscalationSchema,
    default: {
      enabled: false,
      minutes: 5,
      outsideHours: 'wait',
      showName: true,
      perHour: 20,
      lookBackHours: 24,
      lang: 'bn',
      words: {
        en: 'A customer has waited {minutes} min with no answer — {channel} · {name} · chat {ref}',
        bn: 'একজন কাস্টমার {minutes} মিনিট ধরে উত্তর পাননি — {channel} · {name} · চ্যাট {ref}',
      },
    },
    labelKey: 'support.escalation.label',
    helpKey: 'support.escalation.help',
    sortOrder: 64,
    version: 188,
  }),
  'support.linkSafety': setting({
    scope: 'store',
    group: 'support',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: supportLinkSafetySchema,
    default: {
      enabled: false,
      trustedSites: '',
      shorteners: 'bit.ly, tinyurl.com, t.co, goo.gl, ow.ly, is.gd, buff.ly, cutt.ly, rb.gy, shorturl.at, tiny.cc, s.id, rebrand.ly, t.ly',
      riskyEndings: 'zip, mov, top, xyz, click, loan, work, gq, tk, ml, cf, ga, rest, cam, icu',
      riskyFiles: 'apk, exe, msi, bat, cmd, scr, js, vbs, jar, ps1',
      flagNumbers: true,
    },
    labelKey: 'support.linkSafety.label',
    helpKey: 'support.linkSafety.help',
    sortOrder: 65,
    version: 188,
  }),
};
