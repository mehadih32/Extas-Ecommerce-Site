// S29 · PR 750–761 (CN-054) — the shared types of Reports › Geography map. Types only: no code, no import, so every
// lane (figures, lenses, screen, AI advisor) codes against one file. Money is in minor units; a rate is 0–1 or null.
// The rules of the figures are those of `salesByArea` (areas.ts): Orders by the placed day, Sales / Delivered on the
// delivered day (goods = subtotal − discount), Returned on the returned day, return rate = returned ÷ (delivered +
// returned). Counts only: no customer name or phone is ever in these shapes.

/** What the map's parts are about. `overview` is the base (PR 751–755); the others are the lenses of PR 757–760. */
export const GEO_LENSES = ['overview', 'courier', 'risk', 'money', 'demand'] as const;
export type GeoLens = (typeof GEO_LENSES)[number];

/** The level the map is drawn at. `area` = the areas inside Dhaka City (pins where no shape exists). */
export const GEO_LEVELS = ['division', 'district', 'upazila', 'area'] as const;
export type GeoLevel = (typeof GEO_LEVELS)[number];

/** The figure that colours the map (the figure picker). `change` needs a compare period. */
export const GEO_METRICS = ['orders', 'sales', 'delivered', 'returned', 'returnRate', 'change'] as const;
export type GeoMetric = (typeof GEO_METRICS)[number];

/** Which period the second (compare) column is. */
export const GEO_COMPARES = ['off', 'previous', 'lastYear', 'custom'] as const;
export type GeoCompare = (typeof GEO_COMPARES)[number];

/** The period presets of the report period bar (PR 689). */
export const GEO_PERIODS = ['day', 'month', 'sixMonths', 'year', 'custom'] as const;
export type GeoPeriod = (typeof GEO_PERIODS)[number];

/** Extra slices of PR 756. Every one is optional; an absent one means "all". */
export interface GeoSlices {
  categoryId?: string | null;
  productId?: string | null;
  /** The order's source (channel). */
  channel?: string | null;
  paymentType?: 'COD' | 'ONLINE' | null;
  courierId?: string | null;
  customerType?: 'NEW' | 'REPEAT' | null;
}

/** Store days (YYYY-MM-DD, the store's own time zone), both ends included. */
export interface GeoDays {
  from: string;
  to: string;
}

/** The question: one store, one period, one level, optionally one parent (drill-down) and a compare period. */
export interface GeoQuery extends GeoSlices {
  storeId: number;
  timeZone: string;
  days: GeoDays;
  level: GeoLevel;
  /** Only the places under this one (a division for districts, a district for upazilas / areas); null = whole country. */
  parentAreaId?: string | null;
  compare?: GeoCompare;
  /** The compare period's days: set by the caller for `custom`, derived by `geoByArea` for the two other modes. */
  compareDays?: GeoDays | null;
  /** The money figures are given only when the viewer holds `books.read`. */
  includeMoney: boolean;
  /** Orders below this count are flagged `belowMinOrders` (the setting `minOrders`). */
  minOrders?: number;
}

/** The figures of one area in one period. `salesMinor` is null when the viewer may not see money. */
export interface GeoAreaFigures {
  /** Orders placed (not archived), on the placed day. */
  orders: number;
  delivered: number;
  salesMinor: number | null;
  pieces: number;
  returned: number;
  /** returned ÷ (delivered + returned), 0–1; null when both are 0. */
  returnRate: number | null;
}

/** One area's top category (cheap: given for every area). */
export interface GeoTopCategory {
  categoryId: string;
  nameEn: string;
  nameBn: string | null;
  pieces: number;
}

export interface GeoDelta {
  orders: number;
  delivered: number;
  salesMinor: number | null;
  returned: number;
  /** Difference of the return rates (0–1 scale); null when either side has none. */
  returnRate: number | null;
}

/** One row of the map and its table. */
export interface GeoAreaRow {
  /** GeoArea id; `code` is the gazetteer code (the key a boundary shape is matched on). */
  areaId: string;
  code: string;
  level: GeoLevel;
  nameEn: string;
  nameBn: string | null;
  parentAreaId: string | null;
  parentNameEn: string | null;
  parentNameBn: string | null;
  lat: number | null;
  lng: number | null;
  current: GeoAreaFigures;
  /** The compare period's figures; null when compare is off. An area with none there is zero (not missing). */
  previous: GeoAreaFigures | null;
  /** current − previous; null when compare is off. */
  delta: GeoDelta | null;
  topCategory: GeoTopCategory | null;
  /** Fewer orders than the setting `minOrders` (the map shows it grey, the number is still given). */
  belowMinOrders: boolean;
}

/** The answer of `geoByArea`: parts add up to `total`; orders with no area (or none at this level) are `unknown`. */
export interface GeoByArea {
  query: Pick<GeoQuery, 'level' | 'parentAreaId' | 'days' | 'compare' | 'compareDays'>;
  rows: GeoAreaRow[];
  unknown: GeoAreaFigures;
  /** At the area level: orders outside Dhaka City (zero at the other levels). */
  outside: GeoAreaFigures;
  total: GeoAreaFigures;
  /** The compare period's total, null when compare is off. */
  totalPrevious: GeoAreaFigures | null;
  /** unknown.orders ÷ total.orders, 0–1; null when there are no orders ("Unknown area X%"). */
  unknownShare: number | null;
}

/** One product in an area's panel (the on-demand query, one area per click). */
export interface GeoTopProduct {
  productId: string;
  nameEn: string;
  nameBn: string | null;
  pieces: number;
  salesMinor: number | null;
}

export interface GeoAreaDetail {
  areaId: string;
  level: GeoLevel;
  days: GeoDays;
  current: GeoAreaFigures;
  previous: GeoAreaFigures | null;
  topCategory: GeoTopCategory | null;
  topProducts: GeoTopProduct[];
}

/** The signatures (implemented in `geo.ts`, PR 751). `Db` is the metrics `Db`. */
export type GeoByAreaFn<Db> = (db: Db, query: GeoQuery) => Promise<GeoByArea>;
export type GeoAreaDetailFn<Db> = (db: Db, query: GeoQuery & { areaId: string; topProducts: number }) => Promise<GeoAreaDetail>;

/** Lens payloads of PR 757–760 (counts only), keyed by areaId. Each lens is off unless its setting is on. */
export interface GeoLensRow {
  areaId: string;
  /** Numeric figures named by the lens (e.g. courierSuccessRate); null when not known. */
  figures: Record<string, number | null>;
  /** Short flags the screen words itself (e.g. 'coverageGap', 'returnHotspot'). */
  flags: string[];
}
export interface GeoLensResponse {
  lens: Exclude<GeoLens, 'overview'>;
  level: GeoLevel;
  rows: GeoLensRow[];
}

/** The setting `reports.geoMap` (PR 752), JSON, store scope: the numbers of the map (no on/off switch). */
export interface GeoMapSetting {
  defaultPeriod: Exclude<GeoPeriod, "custom">;
  defaultMetric: Exclude<GeoMetric, "change">;
  minOrders: number;
  colourSteps: number;
  warnReturnPct: number;
  topProducts: number;
  compareDefault: boolean;
  showPins: boolean;
  cacheSeconds: number;
}

/** `GET /api/admin/reports/geo-map` — query string in, this out. */
export type GeoMapApiResponse =
  | { ok: true; setting: GeoMapSetting; data: GeoByArea; moneyHidden: boolean }
  | { ok: false; error: "forbidden" | "bad_query"; message: string };

/** `GET /api/admin/reports/geo-map/area` — one area's panel. */
export type GeoMapAreaApiResponse =
  | { ok: true; detail: GeoAreaDetail; moneyHidden: boolean }
  | {
      ok: false;
      error: "forbidden" | "bad_query" | "not_found";
      message: string;
    };

/** The boundary pack (PR 750): one file per level under `packages/delivery/data/geo/`, loaded when the level opens. */
export interface GeoShape {
  /** Gazetteer `code` (e.g. `bd.rajshahi.bogura.gabtali`). */
  code: string;
  /** SVG path in the pack's own viewBox (see `GeoPack.viewBox`). */
  d: string;
  /** The shape's middle in the same viewBox. */
  cx: number;
  cy: number;
  /** The same middle as longitude / latitude (fills `GeoArea.lat/lng`). */
  lng: number;
  lat: number;
}
export interface GeoPack {
  level: 'division' | 'district' | 'upazila' | 'dhakaThana';
  /** One viewBox for every level, so a drill-down overlays exactly: "minX minY width height". */
  viewBox: string;
  attribution: string;
  shapes: GeoShape[];
}
