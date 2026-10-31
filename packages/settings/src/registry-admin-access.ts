// S18 · PR 380 (Blueprint B6.1, B6.5; SET-04d Sign-in & security) — the admin's optional address list and the new-login
// notes (registry version 78; lane B took 78 past its reserved 73–74, CN-031). Labels: messages/admin-access.<lang>.json.
//
// - `security.adminIpAllowlist`: off by default (B6.7 q12: a list locks the owner out when his connection changes).
//   When on, the admin (its pages, its API, the sign-in) opens only from an address on the list; the Sign-in & security
//   page refuses a list that does not hold the address it is saved from, and the server's break-glass switch
//   `EXTAS_ADMIN_ALLOWLIST_OFF=1` (environment, set on the VM only) opens it again.
// - `security.newLoginNoteDays`: how many days a sign-in from a new device stays in the notifications of the people
//   who see security (`security.read`). The note itself is the `staff.login.newDevice` security event that sign-in
//   writes while `security.staffLoginAlerts` is on (on by default); the Telegram alert reads the same event (PR 9).
// - `security.eventsListSize`: how many recent security events the page lists.
import { z } from 'zod';
import { setting } from './define';

const V = 78;

const base = { scope: 'installation', isOwnerData: false, isPublic: false, group: 'security', version: V } as const;

const v4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}(\/(3[0-2]|[12]?\d))?$/;
const v6 = /^[0-9a-f:.]*:[0-9a-f:.]*(\/(12[0-8]|1[01]\d|[1-9]?\d))?$/i;

/** One entry: an address or a range (203.0.113.0/24, 2001:db8::/48). The auth package checks the IPv6 form fully. */
export const allowEntrySchema = z
  .string()
  .trim()
  .max(64)
  .refine((v) => v4.test(v) || v6.test(v), { message: 'an address such as 203.0.113.7 or a range such as 203.0.113.0/24' });

export const adminIpAllowlistSchema = z
  .object({ enabled: z.boolean(), entries: z.array(allowEntrySchema).max(50) })
  .strict()
  .refine((v) => !v.enabled || v.entries.length > 0, { message: 'a list that is on needs at least one address', path: ['entries'] });
export type AdminIpAllowlist = z.output<typeof adminIpAllowlistSchema>;

export const adminAccessSettings = {
  'security.adminIpAllowlist': setting({
    ...base,
    schema: adminIpAllowlistSchema,
    default: { enabled: false, entries: [] } as AdminIpAllowlist,
    valueType: 'JSON',
    labelKey: 'security.adminIpAllowlist.label',
    helpKey: 'security.adminIpAllowlist.help',
    sortOrder: 400,
  }),
  'security.newLoginNoteDays': setting({
    ...base,
    schema: z.int().min(1).max(90),
    default: 7,
    valueType: 'INT',
    labelKey: 'security.newLoginNoteDays.label',
    helpKey: 'security.newLoginNoteDays.help',
    sortOrder: 410,
  }),
  'security.eventsListSize': setting({
    ...base,
    schema: z.int().min(10).max(500),
    default: 50,
    valueType: 'INT',
    labelKey: 'security.eventsListSize.label',
    helpKey: 'security.eventsListSize.help',
    sortOrder: 420,
  }),
};
