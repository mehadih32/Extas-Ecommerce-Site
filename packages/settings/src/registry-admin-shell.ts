// PR 12 (CN-018, CN-022) — the new admin shell (docs/BACKEND-ARCHITECTURE.md §5.1, §5.2; demo V12.3
// #/admin). Registry version 33. Labels: messages/admin-shell.<lang>.json (`admin.*`).
//
// - `admin.shell`: how fresh the sidebar badges are (seconds of cache) and the search palette's limits.
// - `admin.dashboard`: the hours the Dashboard's greeting changes.
// Nothing here changes money or any order: it is how the admin looks.
import { z } from 'zod';
import { setting } from './define';

const V = 33;

/** The 14 sidebar entries of the new admin (decision D8), in the sidebar's order. */
export const ADMIN_SECTIONS = [
  'dashboard',
  'orders',
  'products',
  'customers',
  'delivery',
  'messages',
  'support',
  'marketing',
  'website',
  'money',
  'reports',
  'ai',
  'settings',
  'help',
] as const;
export type AdminSectionId = (typeof ADMIN_SECTIONS)[number];

export const adminShellSchema = z
  .object({
    /** The sidebar badges and the Dashboard's waiting-work rows are counted again after this many seconds. */
    badgeCacheSeconds: z.int().min(0).max(600),
    /** Search results shown per group (pages, settings, products, orders, customers). */
    searchPerGroup: z.int().min(1).max(20),
    /** Records (products, orders, customers) are searched from this many typed characters. */
    searchMinChars: z.int().min(1).max(6),
  })
  .strict();

export const adminDashboardSchema = z
  .object({
    /** "Good afternoon" from this hour, "Good evening" from the next (store time zone, 24-hour clock). */
    afternoonHour: z.int().min(0).max(23),
    eveningHour: z.int().min(0).max(23),
  })
  .strict()
  .refine((v) => v.afternoonHour < v.eveningHour, { message: 'the afternoon starts before the evening' });

const json = { scope: 'store', valueType: 'JSON', group: 'admin', isOwnerData: false, isPublic: false, version: V } as const;

export const adminShellSettings = {
  'admin.shell': setting({
    ...json,
    schema: adminShellSchema,
    default: { badgeCacheSeconds: 30, searchPerGroup: 5, searchMinChars: 2 },
    labelKey: 'admin.shell.label',
    helpKey: 'admin.shell.help',
    sortOrder: 20,
  }),
  'admin.dashboard': setting({
    ...json,
    schema: adminDashboardSchema,
    default: { afternoonHour: 12, eveningHour: 17 },
    labelKey: 'admin.dashboard.label',
    helpKey: 'admin.dashboard.help',
    sortOrder: 30,
  }),
};
