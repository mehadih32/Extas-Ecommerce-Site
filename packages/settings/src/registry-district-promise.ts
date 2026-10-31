// SIM-F-048 · PR 550 follow-up (registry version 97, lane C's range) — the delivery promise per district: a far district
// (Bandarban, Kurigram …) gets its own hours instead of its band's, so the checkout, the thank-you page, the order page
// and its late flag promise what the courier really takes there. A row names a district by its gazetteer code; a
// district with no row keeps its band's hours. Off as shipped, with no rows (the owner's own hours are never fixed in
// code). Nothing here changes a charge, a price or Cash on Delivery. Labels: messages/district-promise.<lang>.json.
import { z } from 'zod';
import { setting } from './define';

const V550F = 97;

const hours = z.int().min(1).max(24 * 60);

/** One district's own promise in hours (shortest, longest); the longest is what the late flag counts. */
export const districtPromiseRowSchema = z
  .object({ district: z.string().trim().min(3).max(120), hoursMin: hours.nullable(), hoursMax: hours })
  .strict()
  .refine((r) => r.hoursMin === null || r.hoursMin <= r.hoursMax, { message: 'the shortest time is above the longest', path: ['hoursMin'] });

export const districtPromiseSchema = z
  .object({ enabled: z.boolean(), rows: z.array(districtPromiseRowSchema).max(80) })
  .strict()
  .refine((v) => new Set(v.rows.map((r) => r.district)).size === v.rows.length, { message: 'one row per district', path: ['rows'] });
export type DistrictPromiseSettings = z.output<typeof districtPromiseSchema>;

export const districtPromiseSettings = {
  'delivery.promise.districts': setting({
    scope: 'store',
    group: 'delivery',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: districtPromiseSchema,
    default: { enabled: false, rows: [] },
    labelKey: 'delivery.promise.districts.label',
    helpKey: 'delivery.promise.districts.help',
    sortOrder: 933,
    version: V550F,
  }),
};
