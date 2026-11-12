// PR 12 (CN-018, CN-022) and PR 495 — the new admin shell (docs/BACKEND-ARCHITECTURE.md §5.1, §5.2, §19.5; demo V12.3
// #/admin). Registry version 33. Labels: messages/admin-shell.<lang>.json (`admin.*`).
//
// - `admin.startPages`: the page each role opens on after sign-in (§19.5, R3). Empty = every role starts on the
//   Dashboard. A role whose start section it cannot open also lands on the Dashboard.
// - `admin.shell`: how fresh the sidebar badges are (seconds of cache) and the search palette's limits.
//   PR 12 follow-up 209 (registry v263): `recentPages` — the empty palette lists the pages this person opened last
//   (kept on their own staff account, StaffUser.adminPrefs; 0 = off, as it ships) — and `keyJumps`: "g" then a
//   letter opens a section ("g d" the Dashboard, "g o" Orders), off as it ships. A value saved before reads as off.
// - `admin.dashboard`: the Dashboard's date choices (days) and the hours the greeting changes.
// Nothing here changes money or any order: it is how the admin looks and where it opens.
import { z } from 'zod';
import { setting } from './define';

const V = 33;
const V209 = 263;

/** The sidebar entries of the new admin (decision D8; PR 659 adds Rules as its own section), in the order of the sections table. */
export const ADMIN_SECTIONS = [
  'dashboard',
  'orders',
  'products',
  'customers',
  'delivery',
  'messages',
  'support',
  'rules',
  'marketing',
  'website',
  'money',
  'reports',
  'ai',
  'settings',
  'help',
] as const;
export type AdminSectionId = (typeof ADMIN_SECTIONS)[number];

/** A role's key as the role builder makes it (packages/auth roles.ts). */
const roleKeySchema = z.string().regex(/^[a-z][a-z0-9-]{1,39}$/);

export const adminStartPagesSchema = z.record(roleKeySchema, z.enum(ADMIN_SECTIONS)).refine((v) => Object.keys(v).length <= 100, {
  message: 'at most 100 roles',
});

export const adminShellSchema = z
  .object({
    /** The sidebar badges and the Dashboard's waiting-work rows are counted again after this many seconds. */
    badgeCacheSeconds: z.int().min(0).max(600),
    /** Search results shown per group (pages, settings, products, orders, customers). */
    searchPerGroup: z.int().min(1).max(20),
    /** Records (products, orders, customers) are searched from this many typed characters. */
    searchMinChars: z.int().min(1).max(6),
    /** PR 12 follow-up 209: how many of the person's last-opened pages the empty palette lists (0 = none). */
    recentPages: z.int().min(0).max(10).default(0),
    /** PR 12 follow-up 209: "g" then a letter opens a section (lib/admin-shell/shortcuts.ts JUMP_KEYS). */
    keyJumps: z.boolean().default(false),
  })
  .strict();

export const adminDashboardSchema = z
  .object({
    /** The date choices above the money tiles, in days (1 = today). The first one opens. */
    ranges: z.array(z.int().min(1).max(366)).min(1).max(5),
    /** "Good afternoon" from this hour, "Good evening" from the next (store time zone, 24-hour clock). */
    afternoonHour: z.int().min(0).max(23),
    eveningHour: z.int().min(0).max(23),
    /** How many days the small line in each money tile shows (oldest first, ending today). */
    sparkDays: z.int().min(2).max(90),
  })
  .strict()
  .refine((v) => v.afternoonHour < v.eveningHour, { message: 'the afternoon starts before the evening' })
  .refine((v) => new Set(v.ranges).size === v.ranges.length, { message: 'each date choice once' });

const json = { scope: 'store', valueType: 'JSON', group: 'admin', isOwnerData: false, isPublic: false, version: V } as const;

export const adminShellSettings = {
  'admin.startPages': setting({
    ...json,
    schema: adminStartPagesSchema,
    default: {},
    labelKey: 'admin.startPages.label',
    helpKey: 'admin.startPages.help',
    sortOrder: 10,
  }),
  'admin.shell': setting({
    ...json,
    schema: adminShellSchema,
    default: { badgeCacheSeconds: 30, searchPerGroup: 5, searchMinChars: 2, recentPages: 0, keyJumps: false },
    labelKey: 'admin.shell.label',
    helpKey: 'admin.shell.help',
    sortOrder: 20,
    version: V209,
    since: V,
  }),
  'admin.dashboard': setting({
    ...json,
    schema: adminDashboardSchema,
    default: { ranges: [1, 7, 30], afternoonHour: 12, eveningHour: 17, sparkDays: 14 },
    labelKey: 'admin.dashboard.label',
    helpKey: 'admin.dashboard.help',
    sortOrder: 30,
  }),
};
