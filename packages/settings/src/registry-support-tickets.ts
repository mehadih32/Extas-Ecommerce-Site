// S22 · PR 431 (CN-031 lane C; Blueprint B4.14 item 7) — ticketing: each stretch of a conversation, from the
// customer's message until it is marked solved, is one ticket with its status, its owner (the employee it is assigned
// to), two timers (the first answer and the solution) and, once solved, how long it took. Registry version 159 (lane C's
// range). Labels: messages/support-tickets.<lang>.json; the admin's place is Support → Support settings
// (docs/ADMIN-ARCHITECTURE.md §4.7).
//
// `support.tickets` (per store):
// - `enabled`: a customer's message on a chat with no open ticket opens one; the inbox shows each chat's timer and a
//   "Late" view. Off as it ships (CN-018).
// - `firstResponseMinutes`: how long the first answer may take (5 minutes by default, the 18 Oct decision round's
//   window, B4.14 V2).
// - `resolutionHours`: how long until the chat should be solved.
// - `notify`: a late chat is put in its owner's notifications (the bell); a late chat with no owner goes to the people
//   who may give chats out (`support.assign`).
//
// Nothing here moves money, changes a price or blocks anyone. Nothing is owner data.
import { z } from 'zod';
import { setting } from './define';

const VID = 159;

/** The smallest and largest first-answer window, in minutes (one day at most). */
export const TICKET_FIRST_MINUTES = { min: 1, max: 1440 } as const;
/** The smallest and largest solution window, in hours (thirty days at most). */
export const TICKET_RESOLUTION_HOURS = { min: 1, max: 720 } as const;

export const supportTicketsSchema = z
  .object({
    enabled: z.boolean(),
    firstResponseMinutes: z.number().int().min(TICKET_FIRST_MINUTES.min).max(TICKET_FIRST_MINUTES.max),
    resolutionHours: z.number().int().min(TICKET_RESOLUTION_HOURS.min).max(TICKET_RESOLUTION_HOURS.max),
    notify: z.boolean(),
  })
  .strict();
export type SupportTicketsSettings = z.output<typeof supportTicketsSchema>;

export const supportTicketsSettings = {
  'support.tickets': setting({
    scope: 'store',
    group: 'support',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: supportTicketsSchema,
    default: { enabled: false, firstResponseMinutes: 5, resolutionHours: 24, notify: true },
    labelKey: 'support.tickets.label',
    helpKey: 'support.tickets.help',
    sortOrder: 54,
    version: VID,
  }),
};
