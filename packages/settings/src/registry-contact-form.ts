// S02 · PR 75 follow-up (go-live gate customer 360°, 1 Nov; registry version 231, a number no lane holds) — the contact
// page's form (demo 71-pages.js pg_contact, Blueprint D3.17: "a contact form plus WhatsApp, the hotline, email and
// track-order"). PR 75 left it out "until a support inbox keeps the messages"; the Support inbox is built (PR 425), so
// a message sent from the form lands there as a conversation from his number, with the order he names linked when it
// is his. Off as it ships: the owner turns it on once someone reads the inbox, so no customer writes into a box nobody
// opens. Each number may send `perPhonePerDay` messages a day of at most `maxChars` characters.
import { z } from 'zod';
import { setting } from './define';

const V = 231;

export const contactFormSchema = z
  .object({
    /** Show the form on the contact page; its messages land in Support › Inbox. */
    enabled: z.boolean(),
    /** How many messages one number may send in a day. */
    perPhonePerDay: z.number().int().min(1).max(20),
    /** The longest message, in characters. */
    maxChars: z.number().int().min(100).max(2000),
  })
  .strict();
export type ContactFormSettings = z.output<typeof contactFormSchema>;

export const contactFormSettings = {
  'pages.contactForm': setting({
    scope: 'store',
    schema: contactFormSchema,
    default: { enabled: false, perPhonePerDay: 3, maxChars: 1000 },
    valueType: 'JSON',
    group: 'pages',
    labelKey: 'pages.contactForm.label',
    helpKey: 'pages.contactForm.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 40,
    version: V,
  }),
};
