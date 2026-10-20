// S06 · PR 549–553, 555 — the delivery-zone engine (Gyani; @extas/delivery). Every switch, wait and limit of the
// gazetteer, the band map, the resolver, the autocomplete and phone-first recognition lives here, never in code.
// Labels: messages/delivery.<lang>.json. Registry version 15.
//
// The charges themselves are not settings: each band's charge, its delivery hours and whether it is on are the owner's
// figures in the DeliveryBand rows (PR 508 seeds the three bands switched off with no charge), and the sub-area list is
// the owner's AreaBand rows (PR 509 register: owner data). Both ship empty and are typed in by the owner in the admin.
import { z } from 'zod';
import { setting } from './define';

const V = 15;

/** A band row's key (DeliveryBand.key), e.g. `dhaka-city`. */
export const bandKeySchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'a band key is lower-case words joined by hyphens' }).max(60);

/** A city-corporation tag of the gazetteer (GeoArea.cityCorporation), e.g. `DNCC`. */
export const cityCorporationSchema = z.string().regex(/^[A-Z]{2,10}$/, { message: 'a city corporation is 2–10 capital letters, e.g. DNCC' });

export const deliverySettings = {
  // ---- PR 550 · band mapping: which band row is the city, the sub-area and the outside band (the default pack's
  // keys), and which city corporations make up the city band (Dhaka City = DNCC + DSCC, the official map). ----
  'delivery.bands.cityKey': setting({
    schema: bandKeySchema,
    default: 'dhaka-city',
    scope: 'store',
    valueType: 'STRING',
    group: 'delivery',
    labelKey: 'delivery.bands.cityKey.label',
    helpKey: 'delivery.bands.cityKey.help',
    isOwnerData: false,
    sortOrder: 400,
    version: V,
  }),
  'delivery.bands.subAreaKey': setting({
    schema: bandKeySchema,
    default: 'dhaka-sub-area',
    scope: 'store',
    valueType: 'STRING',
    group: 'delivery',
    labelKey: 'delivery.bands.subAreaKey.label',
    helpKey: 'delivery.bands.subAreaKey.help',
    isOwnerData: false,
    sortOrder: 410,
    version: V,
  }),
  'delivery.bands.outsideKey': setting({
    schema: bandKeySchema,
    default: 'outside-dhaka',
    scope: 'store',
    valueType: 'STRING',
    group: 'delivery',
    labelKey: 'delivery.bands.outsideKey.label',
    helpKey: 'delivery.bands.outsideKey.help',
    isOwnerData: false,
    sortOrder: 420,
    version: V,
  }),
  'delivery.bands.cityCorporations': setting({
    schema: z
      .array(cityCorporationSchema)
      .min(1)
      .max(20)
      .refine((l) => new Set(l).size === l.length, { message: 'each city corporation once' }),
    default: ['DNCC', 'DSCC'],
    scope: 'store',
    valueType: 'JSON',
    group: 'delivery',
    labelKey: 'delivery.bands.cityCorporations.label',
    helpKey: 'delivery.bands.cityCorporations.help',
    isOwnerData: false,
    sortOrder: 430,
    version: V,
  }),
  'delivery.bands.searchLimit': setting({
    schema: z.int().min(1).max(50),
    default: 12,
    scope: 'store',
    valueType: 'INT',
    group: 'delivery',
    labelKey: 'delivery.bands.searchLimit.label',
    helpKey: 'delivery.bands.searchLimit.help',
    isOwnerData: false,
    sortOrder: 440,
    version: V,
  }),
  // ---- PR 549 · the national gazetteer ----
  'delivery.gazetteer.cacheSeconds': setting({
    schema: z.int().min(10).max(86_400),
    default: 300,
    scope: 'installation',
    valueType: 'DURATION_SECONDS',
    group: 'delivery',
    labelKey: 'delivery.gazetteer.cacheSeconds.label',
    helpKey: 'delivery.gazetteer.cacheSeconds.help',
    isOwnerData: false,
    sortOrder: 500,
    version: V,
  }),
};
