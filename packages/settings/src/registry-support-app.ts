// S22 · PR 435 (CN-031 lane C; Blueprint B4.11, B4.14 item 11) — the support app: support installed on its own, like
// Messenger (an icon on Android, iOS and desktop that opens only support), with push notifications. Registry version
// 187 (lane C's range). Labels: messages/support-app.<lang>.json; the admin's place is Support → Support settings
// (docs/ADMIN-ARCHITECTURE.md §4.7), and each employee's own device is set up on Support → Support app.
//
// `support.app` (per store):
// - `enabled`: the support pages offer to be installed (the app's manifest, its icon and its support-only frame). Off as
//   it ships (CN-018).
// - `appName`: the name under the icon; empty = the store's name and the word "Support" in the admin's language.
// - `push`: notifications on the devices where an employee switched them on. Until the push key is in Keys &
//   connections (and its Test passed) the push connection is on its mock: nothing leaves the server (A1.3). Off.
// - `events`: what is pushed — a customer's new message (to the chat's owner, or to everyone who may answer while
//   nobody owns it) and a chat given to someone (to that person).
// - `preview`: what the notification shows on a locked phone: nothing about the person, the person's name, or the start
//   of the message too (numbers in it masked when the privacy card masks numbers).
// - `ttlMinutes`: how long the push service keeps trying to reach a phone that is off.
//
// Nothing here sends a customer a message, moves money, changes an order, a price or COD, or deletes anything.
import { z } from 'zod';
import { setting } from './define';

export const SUPPORT_APP_EVENTS = ['message', 'assigned'] as const;
export type SupportAppEvent = (typeof SUPPORT_APP_EVENTS)[number];
export const SUPPORT_APP_PREVIEWS = ['none', 'name', 'text'] as const;
export type SupportAppPreview = (typeof SUPPORT_APP_PREVIEWS)[number];

/** The longest app name (the icon's label is cut much earlier by the phone). */
export const SUPPORT_APP_NAME_MAX = 40;

export const supportAppSchema = z
  .object({
    enabled: z.boolean(),
    appName: z.string().trim().max(SUPPORT_APP_NAME_MAX),
    push: z.boolean(),
    events: z.array(z.enum(SUPPORT_APP_EVENTS)).max(SUPPORT_APP_EVENTS.length).refine((a) => new Set(a).size === a.length, 'each event once'),
    preview: z.enum(SUPPORT_APP_PREVIEWS),
    ttlMinutes: z.number().int().min(1).max(1440),
  })
  .strict();
export type SupportAppSettings = z.output<typeof supportAppSchema>;

export const supportAppSettings = {
  'support.app': setting({
    scope: 'store',
    group: 'support',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: supportAppSchema,
    default: { enabled: false, appName: '', push: false, events: ['message', 'assigned'], preview: 'name', ttlMinutes: 60 },
    labelKey: 'support.app.label',
    helpKey: 'support.app.help',
    sortOrder: 62,
    version: 187,
  }),
};
