// S29 · PR 752 (CN-054) — registry version 868, lane geography map.
//   `reports.geoMap` — the numbers of Reports › Geography map, store scope, JSON. There is no on/off switch (owner's decision, 16 Nov
//   2026): the map and every lens are there for everyone who holds the permission (`reports.read`; money only with `books.read`).
//   Every number is the owner's to change (CN-018): the page opens on `defaultPeriod` and `defaultMetric`, an area with fewer than
//   `minOrders` orders is grey ("Too few orders"), the map is shaded in `colourSteps` steps, a return rate over `warnReturnPct` % is
//   the warning colour, the panel lists the `topProducts` best sellers, `compareDefault` opens with a second period, `showPins` draws
//   an area that has no shape as a pin, and `cacheSeconds` is how long a heavy figure is remembered (0 = not at all). The longest
//   report is the existing `costs.report` setting (never a second limit). An older stored value that still carries the retired keys
//   (`on`, `slices`, `lenses`, `ai`) is read without them: they are ignored, never an error. Advice only: no key here changes a
//   budget, a campaign, a price, a charge, a COD rule or a courier.
import { z } from "zod";
import { setting } from "./define";

const V868 = 868;

export const GEO_MAP_PERIODS = ['day', 'month', 'sixMonths', 'year'] as const;
export const GEO_MAP_METRICS = ['orders', 'sales', 'delivered', 'returned', 'returnRate'] as const;

/** The keys of the on/off switches this setting had before the owner's decision (16 Nov 2026); a stored value that still has them is read without them. */
const RETIRED = ["on", "slices", "lenses", "ai"] as const;
const withoutRetired = (v: unknown): unknown => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return v;
  const o: Record<string, unknown> = { ...(v as Record<string, unknown>) };
  for (const k of RETIRED) delete o[k];
  return o;
};

export const geoMapSchema = z.preprocess(
  withoutRetired,
  z
    .object({
      /** The period the page opens on. */
      defaultPeriod: z.enum(GEO_MAP_PERIODS),
      /** The figure that colours the map when the page opens. */
      defaultMetric: z.enum(GEO_MAP_METRICS),
      /** An area with fewer orders than this is grey (its numbers are still shown). */
      minOrders: z.int().min(0).max(1000),
      /** How many steps the colour ramp has. */
      colourSteps: z.int().min(3).max(9),
      /** A return rate over this (per cent) is the warning colour. */
      warnReturnPct: z.int().min(1).max(100),
      /** How many best sellers the area panel lists. */
      topProducts: z.int().min(1).max(20),
      /** Open with a second period beside the first. */
      compareDefault: z.boolean(),
      /** Draw an area that has no shape as a pin. */
      showPins: z.boolean(),
      /** How long a heavy figure is remembered, in seconds (0 = not at all). */
      cacheSeconds: z.int().min(0).max(3600),
    })
    .strict(),
);
export type GeoMapSettings = z.output<typeof geoMapSchema>;

/** The shipped defaults. The numbers are safe starting values the owner changes on the page's card. */
export const GEO_MAP_DEFAULT: GeoMapSettings = {
  defaultPeriod: "month",
  defaultMetric: "orders",
  minOrders: 5, // hardcode-ok: the setting's shipped default
  colourSteps: 5,
  warnReturnPct: 20,
  topProducts: 5,
  compareDefault: false,
  showPins: true,
  cacheSeconds: 60,
}; // hardcode-ok: the setting's shipped default

export const geoMapSettings = {
  'reports.geoMap': setting({
    scope: 'store',
    schema: geoMapSchema,
    default: GEO_MAP_DEFAULT,
    valueType: 'JSON',
    group: 'reports',
    labelKey: 'reports.geoMap.label',
    helpKey: 'reports.geoMap.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 20,
    version: V868,
  }),
};
