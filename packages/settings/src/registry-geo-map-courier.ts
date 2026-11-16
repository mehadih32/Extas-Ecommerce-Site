// S29 · PR 757 (CN-054; registry version 805) — Reports › Geography map, the courier and coverage lens: its numbers.
//   `reports.geoMapCourier` — the lens itself is switched on in `reports.geoMap.lenses.courier` (off as shipped, PR 752);
//   these are the numbers it judges by, all editable, none in a screen's code: how many settled parcels an area (or a
//   courier in it) needs before a rate means anything, the success rate under which an area is flagged, the share of late
//   deliveries at which it is flagged, and how many coverage gaps the list names. Advice only: nothing here changes a
//   courier rule, a booking or a mapping.
import { z } from 'zod';
import { setting } from './define';

const V805 = 805;

export const geoMapCourierSchema = z
  .object({
    /** Settled parcels (delivered + returned) an area, or a courier in it, needs before it is judged or named best. */
    minParcels: z.int().min(1).max(1000),
    /** A courier success rate under this (per cent) is flagged. */
    lowSuccessPct: z.int().min(0).max(100),
    /** A share of late deliveries at or over this (per cent) is flagged. */
    lateWarnPct: z.int().min(0).max(100),
    /** How many coverage gaps (areas with orders and no courier mapped) the list names. */
    gapLimit: z.int().min(1).max(200),
  })
  .strict();
export type GeoMapCourierSettings = z.output<typeof geoMapCourierSchema>;

/** The shipped defaults; the owner changes every number. */
export const GEO_MAP_COURIER_DEFAULT: GeoMapCourierSettings = { minParcels: 5, lowSuccessPct: 70, lateWarnPct: 30, gapLimit: 20 }; // hardcode-ok: the setting's shipped default

export const geoMapCourierSettings = {
  'reports.geoMapCourier': setting({
    scope: 'store',
    schema: geoMapCourierSchema,
    default: GEO_MAP_COURIER_DEFAULT,
    valueType: 'JSON',
    group: 'reports',
    labelKey: 'reports.geoMapCourier.label',
    helpKey: 'reports.geoMapCourier.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 220,
    version: V805,
  }),
};
