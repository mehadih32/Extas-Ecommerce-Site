// S13 · PR 277 (register "Campaign blast — SMS, WhatsApp, email — with the audience and the throttle"; Blueprint §873
// "Promotions", C6.1) — registry version 212, lane B.
//
// - `customers.blast`: Messages › Campaigns' second campaign type, the blast — one SMS or WhatsApp from the shop's own
//   template to a saved segment (PR 287), on the same builder, run and engine as the win-back campaigns (PR 300). Off as
//   it ships; nothing goes to any customer until it is on and a person holding `messages.campaigns.send` schedules one
//   after seeing how many it reaches and the estimated cost.
//   - `enabled`: the switch. While it is off no blast is drafted, started or queued, and a queued blast message is
//     skipped (BLAST_OFF).
//   - `allowEveryone`: a blast may name "every customer" instead of a saved segment (off: a saved segment is required).
// The rest is shared with the win-back campaigns (`customers.winback`): the offers-by-phone weekly cap (automations and
// campaigns together), the throttle (`batchSize` people queued per run, all campaigns together), the result days and
// the stop line. Every message is an offer (his yes for offers on that channel, never after a stop, never in the quiet
// hours). An e-mail campaign is Messages › E-mail (PR 290), with its own switch.
import { z } from 'zod';
import { setting } from './define';

const V277 = 212;

/** The campaign kinds (Broadcast.kind) the Messages engine tells apart: a win-back (PR 300) and a blast (PR 277). */
export const CAMPAIGN_WINBACK_KIND = 'winback';
export const CAMPAIGN_BLAST_KIND = 'blast';

export const blastSettingsSchema = z.object({ enabled: z.boolean(), allowEveryone: z.boolean() }).strict();
export type BlastSettings = z.output<typeof blastSettingsSchema>;

export const blastSettings = {
  'customers.blast': setting({
    scope: 'store',
    schema: blastSettingsSchema,
    default: { enabled: false, allowEveryone: false }, // hardcode-ok: the shipped default (off)
    valueType: 'JSON',
    group: 'customers',
    labelKey: 'customers.blast.label',
    helpKey: 'customers.blast.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 285,
    version: V277,
  }),
};
