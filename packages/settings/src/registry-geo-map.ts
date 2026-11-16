// S29 · PR 752 (CN-054) — registry version 868, lane geography map.
//   `reports.geoMap` — the one setting of Reports › Geography map, store scope, JSON, **off as it ships**. With it off the
//   page and its routes answer "not on" and nothing is read. Every number is the owner's to change (CN-018): the page
//   opens on `defaultPeriod` and `defaultMetric`, an area with fewer than `minOrders` orders is grey ("Too few orders"),
//   the map is shaded in `colourSteps` steps, a return rate over `warnReturnPct` % is the warning colour, the panel lists
//   the `topProducts` best sellers, `compareDefault` opens with a second period, `showPins` draws an area that has no
//   shape as a pin, and `cacheSeconds` is how long a heavy figure is remembered (0 = not at all). The longest report is
//   the existing `costs.report` setting (never a second limit). `slices` says which of PR 756's slices show on the filter
//   bar, `lenses` which of PR 757–760's lenses are on, `ai` the advisor of PR 761 (all off as shipped; the advisor also
//   needs `ai.enabled`). Advice only: no key here changes a budget, a campaign, a price, a charge, a COD rule or a courier.
import { z } from 'zod';
import { setting } from './define';

const V868 = 868;

export const GEO_MAP_PERIODS = ['day', 'month', 'sixMonths', 'year'] as const;
export const GEO_MAP_METRICS = ['orders', 'sales', 'delivered', 'returned', 'returnRate'] as const;

export const geoMapSchema = z
  .object({
    /** The whole Geography map: page, routes and figures. */
    on: z.boolean(),
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
    /** PR 756: which slices show on the filter bar. */
    slices: z
      .object({ categoryId: z.boolean(), productId: z.boolean(), channel: z.boolean(), paymentType: z.boolean(), courierId: z.boolean(), customerType: z.boolean() })
      .strict(),
    /** PR 757–760: which lenses are on. */
    lenses: z.object({ courier: z.boolean(), risk: z.boolean(), money: z.boolean(), demand: z.boolean() }).strict(),
    /** PR 761: the AI advisor (advice only, through the approval queue). */
    ai: z.boolean(),
  })
  .strict();
export type GeoMapSettings = z.output<typeof geoMapSchema>;

/** The shipped default: off. The numbers are safe starting values the owner changes on the page's card. */
export const GEO_MAP_DEFAULT: GeoMapSettings = {
  on: false,
  defaultPeriod: 'month',
  defaultMetric: 'orders',
  minOrders: 5, // hardcode-ok: the setting's shipped default
  colourSteps: 5,
  warnReturnPct: 20,
  topProducts: 5,
  compareDefault: false,
  showPins: true,
  cacheSeconds: 60,
  slices: { categoryId: true, productId: true, channel: false, paymentType: false, courierId: false, customerType: false },
  lenses: { courier: false, risk: false, money: false, demand: false },
  ai: false,
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
