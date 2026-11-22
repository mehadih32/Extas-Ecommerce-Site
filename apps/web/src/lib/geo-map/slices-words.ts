// S29 · PR 756 (CN-054) — the words of the Geography map's slices (messages/admin-geo-slices.{en,bn}.json, root key
// `geoSlices`), loaded into a view and turned into the labels of the filter bar and the "Orders by …" table.
import {
  CHANNELS,
  SLICE_DIMENSIONS,
  type SliceDimension,
} from "@extas/metrics/geo-slices-pure";
import type { GeoSliceTableLabels } from "@/components/admin/reports/GeoSliceTable";
import type { GeoSlicesLabels } from "@/components/admin/reports/GeoSlicesBar";
import type { AdminView } from "../admin-page";

/** What the labels need of a view: the dictionary only (so a client screen can build them from the dictionaries it was given). */
export type WordsView = Pick<AdminView, "dict">;
import { t, type Dict } from "../i18n";
import bn from "../../../messages/admin-geo-slices.bn.json";
import en from "../../../messages/admin-geo-slices.en.json";

/** The view with the slices' words added (English by default, Bengali with the toggle). */
export function withGeoSlices(view: AdminView): AdminView {
  const b = view.lang === 'bn';
  return { ...view, dict: { ...view.dict, geoSlices: (b ? bn : en).geoSlices as unknown as Dict } };
}

export function geoSlicesLabels(view: WordsView): GeoSlicesLabels {
  const w = (k: string, vars?: Record<string, string | number>) =>
    t(view.dict, `geoSlices.${k}`, vars);
  return {
    aria: w('aria'),
    toggle: w('toggle'),
    toggleN: (n) => w('toggleN', { n }),
    apply: w('apply'),
    clear: w('clear'),
    note: w('note'),
    channel: { label: w('channel.label'), any: w('channel.any'), names: Object.fromEntries(CHANNELS.map((c) => [c, w(`channel.${c}`)])) },
    payment: { label: w('payment.label'), any: w('payment.any'), COD: w('payment.COD'), ONLINE: w('payment.ONLINE') },
    courier: { label: w('courier.label'), any: w('courier.any') },
    customer: { label: w('customer.label'), any: w('customer.any'), NEW: w('customer.NEW'), REPEAT: w('customer.REPEAT') },
  };
}

export function geoSliceTableLabels(view: WordsView): GeoSliceTableLabels {
  const w = (k: string, vars?: Record<string, string | number>) =>
    t(view.dict, `geoSlices.by.${k}`, vars);
  return {
    title: (dimension) => w('title', { dimension }),
    sub: w('sub'),
    dimension: w('dimension'),
    dimensions: Object.fromEntries(SLICE_DIMENSIONS.map((d) => [d, w(d)])) as Record<SliceDimension, string>,
    name: w('name'),
    orders: w('orders'),
    delivered: w('delivered'),
    returned: w('returned'),
    sales: w('sales'),
    total: w('total'),
    none: w('none'),
    unknown: w('unknown'),
  };
}

/** The words for one bucket: a channel's name, a payment type, a customer type; a courier is named by the screen (it knows the couriers). */
export function sliceValueName(
  view: WordsView,
  dimension: SliceDimension,
  key: string,
  couriers: ReadonlyMap<string, string> = new Map(),
): string | null {
  const w = (k: string) => t(view.dict, `geoSlices.${k}`);
  if (dimension === 'channel') return CHANNELS.includes(key as (typeof CHANNELS)[number]) ? w(`channel.${key}`) : null;
  if (dimension === 'paymentType') return key === 'COD' || key === 'ONLINE' || key === 'OTHER' ? w(`payment.${key}`) : null;
  if (dimension === 'courier') return couriers.get(key) ?? null;
  return key === 'NEW' || key === 'REPEAT' ? w(`customer.${key}`) : null;
}
